import {
  callEnvido,
  callFlor,
  callTruco,
  dealNewRound,
  foldToMazo,
  getPieSeatIndex,
  playCard,
  respondEnvido,
  respondTruco,
} from './engine';
import { EnvidoCallType, FlorCallType, TrucoGameState } from './types';

export type ServerMatchAction =
  | { type: 'play_card'; cardId: string }
  | { type: 'call_truco' }
  | { type: 'respond_truco'; accept: boolean }
  | { type: 'call_envido'; callType: EnvidoCallType }
  | { type: 'respond_envido'; accept: boolean }
  | { type: 'call_flor'; level?: FlorCallType }
  | { type: 'ir_al_mazo' }
  | { type: 'timeout_fallback' }
  | { type: 'deal_next_round' };

/**
 * Elimina las cartas privadas y puntos de envido/flor de otros jugadores
 * antes de guardar en matches.game_state o transmitir por Realtime público.
 */
export function sanitizePublicGameState(state: TrucoGameState): TrucoGameState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      hand: [], // Nunca exponer cartas privadas en game_state público
      hasFlor: false,
      envidoPoints: 0,
    })),
  };
}

/**
 * Valida autoritativamente cada jugada en el servidor antes de aplicarla.
 */
export function validateAndApplyServerAction(params: {
  state: TrucoGameState;
  actorUserId: string;
  action: ServerMatchAction;
  turnExpiresAt?: string | null;
}): { nextState: TrucoGameState; error?: string } {
  const { state, actorUserId, action, turnExpiresAt } = params;

  const actorSeat = state.players.findIndex((p) => p.id === actorUserId);
  if (actorSeat === -1) {
    return { nextState: state, error: 'No estás sentado en esta mesa.' };
  }

  const actor = state.players[actorSeat];
  const actorKey = state.mode === 'gallo' ? actor.id : actor.team;

  // Manejo de timeout de 25 segundos
  if (action.type === 'timeout_fallback') {
    if (!turnExpiresAt || Date.now() < new Date(turnExpiresAt).getTime()) {
      return { nextState: state, error: 'El reloj de turno todavía no venció.' };
    }
    if (state.pendingTruco) {
      const targetSeat = state.players.findIndex(
        (p) => (state.mode === 'gallo' ? p.id : p.team) !== state.pendingTruco!.callerTeam && !p.folded
      );
      if (targetSeat !== -1) {
        return { nextState: respondTruco(state, targetSeat, false) };
      }
    }
    if (state.pendingEnvido) {
      const targetSeat = state.players.findIndex(
        (p) => (state.mode === 'gallo' ? p.id : p.team) !== state.pendingEnvido!.callerTeam && !p.folded
      );
      if (targetSeat !== -1) {
        return { nextState: respondEnvido(state, targetSeat, false) };
      }
    }
    return { nextState: foldToMazo(state, state.turnIndex) };
  }

  if (action.type === 'deal_next_round') {
    if (!state.roundFinished || state.matchWinner) {
      return { nextState: state, error: 'La ronda actual todavía no finalizó.' };
    }
    return { nextState: dealNewRound(state) };
  }

  if (state.matchWinner || state.roundFinished) {
    return { nextState: state, error: 'La ronda o partida ya finalizó.' };
  }

  if (actor.folded) {
    return { nextState: state, error: 'Ya te fuiste al mazo en esta ronda.' };
  }

  if (action.type === 'play_card') {
    if (state.pendingTruco || state.pendingEnvido || state.pendingFlor) {
      return { nextState: state, error: 'Hay un canto pendiente de respuesta.' };
    }
    if (state.turnIndex !== actorSeat) {
      return { nextState: state, error: 'No es tu turno para jugar carta.' };
    }
    const cardExists = actor.hand.some((c) => c.id === action.cardId);
    if (!cardExists) {
      return { nextState: state, error: 'Carta inválida o ya jugada.' };
    }
    return { nextState: playCard(state, actorSeat, action.cardId) };
  }

  if (action.type === 'call_truco') {
    if (state.pendingTruco || state.pendingEnvido) {
      return { nextState: state, error: 'Ya hay un canto abierto.' };
    }
    if (state.trucoLevel >= 4 || state.trucoOwnerTeam === actorKey) {
      return { nextState: state, error: 'No podés subir el Truco en este momento.' };
    }
    return { nextState: callTruco(state, actorSeat) };
  }

  if (action.type === 'respond_truco') {
    if (!state.pendingTruco) {
      return { nextState: state, error: 'No hay un Truco pendiente.' };
    }
    if (state.pendingTruco.callerTeam === actorKey) {
      return { nextState: state, error: 'Tu equipo cantó el Truco; responde el rival.' };
    }
    // En 3v3 estándar, el Pie del equipo receptor tiene la autoridad final
    if (state.mode === '3v3' && !state.isPicaPica) {
      const pieIdx = getPieSeatIndex(state, actor.team as 'A' | 'B');
      if (pieIdx !== null && pieIdx !== actorSeat) {
        return { nextState: state, error: 'En 3v3, el Pie del equipo decide sobre el Truco.' };
      }
    }
    return { nextState: respondTruco(state, actorSeat, action.accept) };
  }

  if (action.type === 'call_envido') {
    if (state.envidoPlayed || state.currentHandIndex > 0 || state.trucoLevel > 0) {
      return { nextState: state, error: 'El Envido solo puede cantarse en la primera mano antes del Truco.' };
    }
    if (state.pendingEnvido && state.pendingEnvido.callerTeam === actorKey) {
      return { nextState: state, error: 'Esperando respuesta del rival.' };
    }
    return { nextState: callEnvido(state, actorSeat, action.callType) };
  }

  if (action.type === 'respond_envido') {
    if (!state.pendingEnvido) {
      return { nextState: state, error: 'No hay un Envido pendiente.' };
    }
    if (state.pendingEnvido.callerTeam === actorKey) {
      return { nextState: state, error: 'Tu equipo cantó el Envido; responde el rival.' };
    }
    if (state.mode === '3v3' && !state.isPicaPica) {
      const pieIdx = getPieSeatIndex(state, actor.team as 'A' | 'B');
      if (pieIdx !== null && pieIdx !== actorSeat) {
        return { nextState: state, error: 'En 3v3, el Pie del equipo decide sobre el Envido.' };
      }
    }
    return { nextState: respondEnvido(state, actorSeat, action.accept) };
  }

  if (action.type === 'call_flor') {
    if (!state.florEnabled || !actor.hasFlor) {
      return { nextState: state, error: 'No tenés Flor habilitada en esta mano.' };
    }
    return { nextState: callFlor(state, actorSeat, action.level ?? 'flor') };
  }

  if (action.type === 'ir_al_mazo') {
    return { nextState: foldToMazo(state, actorSeat) };
  }

  return { nextState: state, error: 'Acción desconocida.' };
}
