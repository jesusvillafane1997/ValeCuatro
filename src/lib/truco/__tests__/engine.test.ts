import { describe, expect, it } from 'vitest';
import {
  calculateEnvido,
  createSpanishDeck,
  getCardPower,
  hasFlor,
} from '../deck';
import {
  callEnvido,
  callTruco,
  createInitialGameState,
  dealNewRound,
  evaluateRoundWinner,
  getPieSeatIndex,
  respondEnvido,
  respondTruco,
} from '../engine';
import {
  sanitizePublicGameState,
  validateAndApplyServerAction,
} from '../server-engine';
import { Card } from '../types';

const makeCard = (rank: Card['rank'], suit: Card['suit']): Card => ({
  id: `${rank}-${suit}`,
  rank,
  suit,
  power: getCardPower(suit, rank),
  envidoValue: rank >= 10 ? 0 : rank,
  label: `${rank} de ${suit}`,
});

describe('Truco Argentino — Baraja y Jerarquía', () => {
  it('genera exactamente 40 cartas sin 8s, 9s ni comodines', () => {
    const deck = createSpanishDeck();
    expect(deck).toHaveLength(40);
    expect(deck.some((c) => (c.rank as number) === 8 || (c.rank as number) === 9)).toBe(false);
  });

  it('respeta la jerarquía oficial de mayor a menor', () => {
    expect(getCardPower('espadas', 1)).toBeGreaterThan(getCardPower('bastos', 1));
    expect(getCardPower('bastos', 1)).toBeGreaterThan(getCardPower('espadas', 7));
    expect(getCardPower('espadas', 7)).toBeGreaterThan(getCardPower('oro', 7));
    expect(getCardPower('oro', 7)).toBeGreaterThan(getCardPower('copas', 3));
    expect(getCardPower('copas', 3)).toBeGreaterThan(getCardPower('oro', 2));
    expect(getCardPower('oro', 2)).toBeGreaterThan(getCardPower('copas', 1));
    expect(getCardPower('copas', 1)).toBeGreaterThan(getCardPower('espadas', 12));
    expect(getCardPower('espadas', 12)).toBeGreaterThan(getCardPower('copas', 7));
    expect(getCardPower('copas', 7)).toBeGreaterThan(getCardPower('bastos', 4));
  });

  it('calcula Envido y detecta Flor correctamente', () => {
    const manoEnvido = [makeCard(7, 'espadas'), makeCard(6, 'espadas'), makeCard(1, 'oro')];
    expect(calculateEnvido(manoEnvido)).toBe(33);
    expect(hasFlor(manoEnvido)).toBe(false);

    const manoFlor = [makeCard(5, 'oro'), makeCard(12, 'oro'), makeCard(2, 'oro')];
    expect(hasFlor(manoFlor)).toBe(true);
    expect(calculateEnvido(manoFlor)).toBe(27);

    const manoSinLigue = [makeCard(12, 'oro'), makeCard(4, 'espadas'), makeCard(1, 'bastos')];
    expect(calculateEnvido(manoSinLigue)).toBe(4);
  });
});

describe('Truco Argentino — Parda, Pica-Pica y Cantos', () => {
  it('resuelve correctamente todas las variantes de Parda', () => {
    const dummy = createInitialGameState({
      matchId: 'test-1',
      mode: '1v1',
      poolTier: 'practice',
      buyInArs: 0,
    });

    expect(evaluateRoundWinner(dummy, ['A', 'TIE', null])).toBe('A');
    expect(evaluateRoundWinner(dummy, ['TIE', 'B', null])).toBe('B');
    expect(evaluateRoundWinner(dummy, ['A', 'B', 'TIE'])).toBe('A');
    expect(evaluateRoundWinner(dummy, ['TIE', 'TIE', 'TIE'])).toBe('MANO_WINS');
  });

  it('otorga puntos al rechazar Truco y Envido', () => {
    const state = createInitialGameState({
      matchId: 'test-2',
      mode: '1v1',
      poolTier: 'practice',
      buyInArs: 0,
    });

    const afterEnvido = callEnvido(state, 0, 'envido');
    const afterRejectEnvido = respondEnvido(afterEnvido, 1, false);
    expect(afterRejectEnvido.teamScores.A).toBe(1);

    const afterTruco = callTruco(afterRejectEnvido, 0);
    const afterRejectTruco = respondTruco(afterTruco, 1, false);
    expect(afterRejectTruco.teamScores.A).toBe(2);
    expect(afterRejectTruco.roundFinished).toBe(true);
  });

  it('activa Pica-Pica en 3v3 cuando ambos equipos están entre 5 y 25 puntos', () => {
    const base = createInitialGameState({
      matchId: 'test-3v3',
      mode: '3v3',
      poolTier: '10000',
      buyInArs: 10000,
    });
    const midGame = {
      ...base,
      roundNumber: 1,
      teamScores: { A: 8, B: 10 },
    };
    const nextRound = dealNewRound(midGame);
    expect(nextRound.isPicaPica).toBe(true);
    expect(nextRound.picaPicaDuels).toHaveLength(3);
  });
});

describe('Motor PvP Autoritativo y Anti-Cheat', () => {
  it('sanitiza cartas privadas antes de emitir por Realtime público', () => {
    const state = createInitialGameState({
      matchId: 'test-sec',
      mode: '1v1',
      poolTier: '10000',
      buyInArs: 10000,
      humanPlayers: [
        { id: 'u1', name: 'Ana', seatIndex: 0 },
        { id: 'u2', name: 'Beto', seatIndex: 1 },
      ],
      fillWithBots: false,
    });

    const pub = sanitizePublicGameState(state);
    expect(pub.players[0].hand).toHaveLength(0);
    expect(pub.players[1].hand).toHaveLength(0);
  });

  it('rechaza jugadas fuera de turno o cartas inexistentes y respeta autoridad del Pie en 3v3', () => {
    const state = createInitialGameState({
      matchId: 'test-auth',
      mode: '3v3',
      poolTier: '20000',
      buyInArs: 20000,
      humanPlayers: [
        { id: 'u0', name: 'P0', seatIndex: 0 },
        { id: 'u1', name: 'P1', seatIndex: 1 },
        { id: 'u2', name: 'P2', seatIndex: 2 },
        { id: 'u3', name: 'P3', seatIndex: 3 },
        { id: 'u4', name: 'P4', seatIndex: 4 },
        { id: 'u5', name: 'P5', seatIndex: 5 },
      ],
      fillWithBots: false,
    });

    // Fuera de turno
    const badTurn = validateAndApplyServerAction({
      state,
      actorUserId: 'u1',
      action: { type: 'play_card', cardId: state.players[1].hand[0].id },
    });
    expect(badTurn.error).toBeTruthy();

    // Carta falsa
    const badCard = validateAndApplyServerAction({
      state,
      actorUserId: 'u0',
      action: { type: 'play_card', cardId: '1-espadas-fake' },
    });
    expect(badCard.error).toBeTruthy();

    // Pie de equipo B en ronda 1 (mano=0) es asiento 5
    expect(getPieSeatIndex(state, 'B')).toBe(5);
  });
});
