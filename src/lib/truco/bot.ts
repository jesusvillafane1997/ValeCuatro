import {
  callEnvido,
  callFlor,
  callTruco,
  playCard,
  respondEnvido,
  respondTruco,
} from './engine';
import { TrucoGameState } from './types';

/**
 * Ejecuta una acción automática para el bot cuando le toca responder o jugar.
 */
export function runBotStep(state: TrucoGameState): TrucoGameState {
  if (state.matchWinner || state.roundFinished) return state;

  // 1. Responder a Truco pendiente si el bot es del equipo/jugador receptor
  if (state.pendingTruco) {
    const pending = state.pendingTruco;
    const responder = state.players.find(
      (p) =>
        p.isBot &&
        !p.folded &&
        (state.mode === 'gallo' ? p.id : p.team) !== pending.callerTeam
    );
    if (responder) {
      const maxPower = Math.max(0, ...responder.hand.map((c) => c.power));
      const accept = maxPower >= 8 || Math.random() > 0.35;
      return respondTruco(state, responder.seatIndex, accept);
    }
    return state;
  }

  // 2. Responder a Envido pendiente si el bot es del equipo/jugador receptor
  if (state.pendingEnvido) {
    const pending = state.pendingEnvido;
    const responder = state.players.find(
      (p) =>
        p.isBot &&
        !p.folded &&
        (state.mode === 'gallo' ? p.id : p.team) !== pending.callerTeam
    );
    if (responder) {
      const accept = responder.envidoPoints >= 25 || Math.random() > 0.45;
      return respondEnvido(state, responder.seatIndex, accept);
    }
    return state;
  }

  // 3. Turno de jugar carta
  const current = state.players[state.turnIndex];
  if (!current || !current.isBot || current.folded || current.hand.length === 0) {
    return state;
  }

  // Cantar Flor si tiene
  if (state.florEnabled && current.hasFlor && !state.florPlayed && state.currentHandIndex === 0) {
    return callFlor(state, current.seatIndex, 'flor');
  }

  // Cantar Envido ocasionalmente en 1ra mano si tiene >= 27
  if (
    !state.envidoPlayed &&
    state.currentHandIndex === 0 &&
    state.trucoLevel === 0 &&
    current.envidoPoints >= 27 &&
    Math.random() > 0.45
  ) {
    return callEnvido(state, current.seatIndex, 'envido');
  }

  // Cantar Truco ocasionalmente si tiene una carta fuerte
  const sortedHand = [...current.hand].sort((a, b) => b.power - a.power);
  const callerKey = state.mode === 'gallo' ? current.id : current.team;
  if (
    state.trucoLevel < 4 &&
    state.trucoOwnerTeam !== callerKey &&
    sortedHand[0].power >= 10 &&
    Math.random() > 0.72
  ) {
    return callTruco(state, current.seatIndex);
  }

  // Jugar carta: en mano 1 juega media/alta, si no la mejor disponible
  const chosenCard =
    sortedHand.length > 1 && state.currentHandIndex === 0
      ? sortedHand[Math.floor(Math.random() * Math.min(2, sortedHand.length))]
      : sortedHand[0];

  return playCard(state, current.seatIndex, chosenCard.id);
}
