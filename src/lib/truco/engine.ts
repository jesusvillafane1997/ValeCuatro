import {
  calculateEnvido,
  createSpanishDeck,
  hasFlor,
  shuffleDeck,
} from './deck';
import {
  EnvidoCallType,
  FlorCallType,
  GameMode,
  PlayerSeat,
  PoolTier,
  TrucoGameState,
  TrucoLevel,
} from './types';

const BOT_NAMES = [
  'El Negro Ferreyra',
  'La Mona Giménez',
  'Don Bustos',
  'Cacho de Güemes',
  'Pato Cabrera',
  'Tano Belgrano',
];

export function createInitialGameState(params: {
  matchId: string;
  mode: GameMode;
  poolTier: PoolTier;
  buyInArs: number;
  florEnabled?: boolean;
  picaPicaEnabled?: boolean;
  humanPlayers?: { id: string; name: string; seatIndex?: number }[];
  fillWithBots?: boolean;
}): TrucoGameState {
  const {
    matchId,
    mode,
    poolTier,
    buyInArs,
    florEnabled = true,
    picaPicaEnabled = true,
    humanPlayers = [{ id: 'local-player', name: 'Vos (Córdoba)' }],
    fillWithBots = true,
  } = params;

  const totalSeats = mode === '1v1' ? 2 : 6;
  const players: PlayerSeat[] = [];

  for (let i = 0; i < totalSeats; i++) {
    const human = humanPlayers.find((h, idx) => (h.seatIndex ?? idx) === i);
    const team = mode === 'gallo' ? 'SOLO' : i % 2 === 0 ? 'A' : 'B';

    if (human) {
      players.push({
        seatIndex: i,
        id: human.id,
        name: human.name,
        team,
        isBot: false,
        hand: [],
        playedCards: [null, null, null],
        score: 0,
        folded: false,
        hasFlor: false,
        envidoPoints: 0,
      });
    } else if (fillWithBots) {
      players.push({
        seatIndex: i,
        id: `bot-${i}`,
        name: BOT_NAMES[i % BOT_NAMES.length],
        team,
        isBot: true,
        hand: [],
        playedCards: [null, null, null],
        score: 0,
        folded: false,
        hasFlor: false,
        envidoPoints: 0,
      });
    }
  }

  const state: TrucoGameState = {
    matchId,
    mode,
    poolTier,
    buyInArs,
    escrowArs: buyInArs * players.length,
    florEnabled,
    picaPicaEnabled,
    players,
    teamScores: { A: 0, B: 0 },
    roundNumber: 0,
    manoIndex: 0,
    turnIndex: 0,
    currentHandIndex: 0,
    tableCards: [],
    handWinners: [null, null, null],
    trucoLevel: 0,
    trucoOwnerTeam: null,
    pendingTruco: null,
    envidoPlayed: false,
    pendingEnvido: null,
    florPlayed: false,
    pendingFlor: null,
    isPicaPica: false,
    picaPicaDuels: [],
    lastCallout: null,
    actionLog: ['¡Arranca la partida en Córdoba! Se reparten las cartas...'],
    matchWinner: null,
    roundFinished: false,
  };

  return dealNewRound(state);
}

export function dealNewRound(state: TrucoGameState): TrucoGameState {
  if (state.matchWinner) return state;

  const deck = shuffleDeck(createSpanishDeck());
  const nextMano =
    state.roundNumber === 0
      ? 0
      : (state.manoIndex + 1) % state.players.length;

  const players = state.players.map((p, idx) => {
    const hand = deck.slice(idx * 3, idx * 3 + 3);
    return {
      ...p,
      hand,
      playedCards: [null, null, null],
      folded: false,
      hasFlor: state.florEnabled && hasFlor(hand),
      envidoPoints: calculateEnvido(hand),
    };
  });

  // Pica-Pica en 3v3: cuando ambos equipos están entre 5 y 25 puntos, alternar rondas
  const isPicaPica =
    state.mode === '3v3' &&
    state.picaPicaEnabled &&
    state.teamScores.A >= 5 &&
    state.teamScores.A <= 25 &&
    state.teamScores.B >= 5 &&
    state.teamScores.B <= 25 &&
    state.roundNumber % 2 === 1;

  const nextState: TrucoGameState = {
    ...state,
    players,
    roundNumber: state.roundNumber + 1,
    manoIndex: nextMano,
    turnIndex: nextMano,
    currentHandIndex: 0,
    tableCards: [],
    handWinners: [null, null, null],
    trucoLevel: 0,
    trucoOwnerTeam: null,
    pendingTruco: null,
    envidoPlayed: false,
    pendingEnvido: null,
    florPlayed: false,
    pendingFlor: null,
    isPicaPica,
    picaPicaDuels: isPicaPica
      ? [
          { duelIndex: 0, seatA: 0, seatB: 3, handWinners: [null, null, null], trucoLevel: 0, winner: null, pointsAwarded: 0 },
          { duelIndex: 1, seatA: 1, seatB: 4, handWinners: [null, null, null], trucoLevel: 0, winner: null, pointsAwarded: 0 },
          { duelIndex: 2, seatA: 2, seatB: 5, handWinners: [null, null, null], trucoLevel: 0, winner: null, pointsAwarded: 0 },
        ]
      : [],
    roundFinished: false,
    actionLog: [
      ...state.actionLog.slice(-14),
      `Ronda ${state.roundNumber + 1}${isPicaPica ? ' (¡Pica-Pica!)' : ''} — Es mano ${players[nextMano].name}`,
    ],
  };

  return nextState;
}

function getEntityKey(state: TrucoGameState, seatIndex: number): string {
  const p = state.players[seatIndex];
  return state.mode === 'gallo' ? p.id : p.team;
}

export function awardPoints(
  state: TrucoGameState,
  winnerKey: string,
  points: number,
  reason: string
): TrucoGameState {
  if (state.matchWinner) return state;

  let teamScores = { ...state.teamScores };
  let players = state.players;
  let matchWinner: string | null = null;

  if (state.mode === 'gallo') {
    players = state.players.map((p) => {
      if (p.id === winnerKey) {
        const nextScore = Math.min(30, p.score + points);
        if (nextScore >= 30) matchWinner = p.id;
        return { ...p, score: nextScore };
      }
      return p;
    });
  } else {
    const key = winnerKey as 'A' | 'B';
    teamScores[key] = Math.min(30, teamScores[key] + points);
    if (teamScores[key] >= 30) {
      matchWinner = key;
    }
  }

  const winnerLabel =
    state.mode === 'gallo'
      ? players.find((p) => p.id === winnerKey)?.name ?? winnerKey
      : `Equipo ${winnerKey}`;

  return {
    ...state,
    players,
    teamScores,
    matchWinner,
    actionLog: [
      ...state.actionLog.slice(-14),
      `${winnerLabel} suma +${points} pts (${reason})`,
    ],
  };
}

export function getPieSeatIndex(state: TrucoGameState, team: 'A' | 'B'): number | null {
  const total = state.players.length;
  for (let offset = total - 1; offset >= 0; offset--) {
    const idx = (state.manoIndex + offset) % total;
    const p = state.players[idx];
    if (p.team === team && !p.folded) {
      return idx;
    }
  }
  return null;
}

function getNextActiveSeat(state: TrucoGameState, fromIndex: number): number {
  const total = state.players.length;
  for (let offset = 1; offset <= total; offset++) {
    const idx = (fromIndex + offset) % total;
    if (!state.players[idx].folded) {
      return idx;
    }
  }
  return fromIndex;
}

/**
 * Resuelve el ganador de una mano (1ra, 2da o 3ra) y determina si terminó la ronda.
 */
function resolveHandAndMaybeRound(state: TrucoGameState): TrucoGameState {
  const handIdx = state.currentHandIndex;
  const entries = state.tableCards.filter((e) => e.handIndex === handIdx);
  const activePlayers = state.players.filter((p) => !p.folded);

  if (entries.length < activePlayers.length) {
    // Todavía faltan jugadores por tirar en esta mano
    return {
      ...state,
      turnIndex: getNextActiveSeat(state, state.turnIndex),
    };
  }

  // Todos los jugadores activos tiraron en esta mano -> calcular ganador de la mano
  let maxPower = -1;
  let topEntries: typeof entries = [];

  for (const e of entries) {
    if (e.card.power > maxPower) {
      maxPower = e.card.power;
      topEntries = [e];
    } else if (e.card.power === maxPower) {
      topEntries.push(e);
    }
  }

  // Verificar si todos los topEntries pertenecen al mismo equipo (en 3v3) o si hay empate entre rivales
  // En Gallo 6J, el empate en una mano favorece al jugador que tiró primero en orden de turno desde el mano
  let handWinnerKey: string;
  if (state.mode === 'gallo' && topEntries.length > 1) {
    const total = state.players.length;
    const sortedByTurn = [...topEntries].sort((a, b) => {
      const distA = (a.seatIndex - state.manoIndex + total) % total;
      const distB = (b.seatIndex - state.manoIndex + total) % total;
      return distA - distB;
    });
    handWinnerKey = getEntityKey(state, sortedByTurn[0].seatIndex);
  } else {
    const topKeys = new Set(topEntries.map((e) => getEntityKey(state, e.seatIndex)));
    handWinnerKey = topKeys.size === 1 ? [...topKeys][0] : 'TIE';
  }

  const nextHandWinners = [...state.handWinners];
  nextHandWinners[handIdx] = handWinnerKey;

  const updatedState: TrucoGameState = {
    ...state,
    handWinners: nextHandWinners,
  };

  // Verificar si ya hay un ganador de la ronda según reglas oficiales de Parda
  const roundWinner = evaluateRoundWinner(updatedState, nextHandWinners);

  if (roundWinner) {
    const stake = state.trucoLevel === 0 ? 1 : state.trucoLevel;
    const resolvedKey =
      roundWinner === 'MANO_WINS'
        ? getEntityKey(updatedState, updatedState.manoIndex)
        : roundWinner;
    const afterPoints = awardPoints(
      updatedState,
      resolvedKey,
      stake,
      `Truco (nivel ${stake})`
    );
    return {
      ...afterPoints,
      roundFinished: true,
    };
  }

  // Pasar a la siguiente mano (2da o 3ra)
  const nextHandIndex = (handIdx + 1) as 0 | 1 | 2;
  // Quien ganó la mano anterior empieza (si fue parda, empieza el mano)
  const nextStarter =
    handWinnerKey === 'TIE'
      ? updatedState.manoIndex
      : topEntries[0].seatIndex;

  return {
    ...updatedState,
    currentHandIndex: nextHandIndex,
    turnIndex: updatedState.players[nextStarter].folded
      ? getNextActiveSeat(updatedState, nextStarter)
      : nextStarter,
  };
}

/**
 * Reglas oficiales de Parda del Truco Argentino:
 * - Si un jugador/equipo gana 2 manos, gana la ronda.
 * - Si Mano 1 es ganada por X y Mano 2 es Parda (TIE) -> gana X.
 * - Si Mano 1 es Parda (TIE) y Mano 2 es ganada por X -> gana X.
 * - Si Mano 1 es ganada por X, Mano 2 por Y, y Mano 3 es Parda (TIE) -> gana X (el ganador de 1ra).
 * - Si las 3 son Parda -> gana el Mano ('MANO_WINS').
 */
export function evaluateRoundWinner(
  _state: TrucoGameState,
  hw: (string | null)[]
): string | null {
  const [h1, h2, h3] = hw;
  if (!h1) return null;

  // Mano 1 y Mano 2 jugadas
  if (h1 && h2 && !h3) {
    if (h1 !== 'TIE' && h2 === h1) return h1;
    if (h1 !== 'TIE' && h2 === 'TIE') return h1;
    if (h1 === 'TIE' && h2 !== 'TIE') return h2;
    return null;
  }

  // Las 3 manos jugadas
  if (h1 && h2 && h3) {
    if (h3 !== 'TIE') return h3;
    if (h1 !== 'TIE') return h1; // 1ra ganada por X, 2da por Y, 3ra parda -> gana X
    if (h2 !== 'TIE') return h2;
    return 'MANO_WINS'; // 3 pardas consecutivas -> gana el mano
  }

  return null;
}

export function playCard(
  state: TrucoGameState,
  seatIndex: number,
  cardId: string
): TrucoGameState {
  if (state.matchWinner || state.roundFinished) return state;
  if (state.pendingTruco || state.pendingEnvido || state.pendingFlor) return state;
  if (state.turnIndex !== seatIndex) return state;

  const player = state.players[seatIndex];
  const cardIdx = player.hand.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) return state;

  const card = player.hand[cardIdx];
  const nextHand = player.hand.filter((c) => c.id !== cardId);
  const nextPlayed = [...player.playedCards];
  nextPlayed[state.currentHandIndex] = card;

  const nextPlayers = state.players.map((p, idx) =>
    idx === seatIndex ? { ...p, hand: nextHand, playedCards: nextPlayed } : p
  );

  const nextState: TrucoGameState = {
    ...state,
    players: nextPlayers,
    tableCards: [
      ...state.tableCards,
      { seatIndex, card, handIndex: state.currentHandIndex },
    ],
    actionLog: [
      ...state.actionLog.slice(-14),
      `${player.name} jugó ${card.label}`,
    ],
  };

  return resolveHandAndMaybeRound(nextState);
}

export function callTruco(
  state: TrucoGameState,
  seatIndex: number
): TrucoGameState {
  if (state.matchWinner || state.roundFinished) return state;
  if (state.pendingTruco || state.pendingEnvido || state.pendingFlor) return state;

  const player = state.players[seatIndex];
  const callerKey = getEntityKey(state, seatIndex);

  if (state.trucoLevel >= 4) return state;
  if (state.trucoOwnerTeam === callerKey) return state;

  const nextLevel = (state.trucoLevel === 0 ? 2 : state.trucoLevel + 1) as 2 | 3 | 4;
  const label =
    nextLevel === 2
      ? '¡Truco!'
      : nextLevel === 3
      ? '¡Quiero retruco!'
      : '¡Quiero vale cuatro!';

  return {
    ...state,
    pendingTruco: {
      level: nextLevel,
      callerIndex: seatIndex,
      callerTeam: callerKey,
    },
    lastCallout: {
      text: label,
      playerName: player.name,
      team: callerKey,
      timestamp: Date.now(),
    },
    actionLog: [...state.actionLog.slice(-14), `${player.name}: ${label}`],
  };
}

export function respondTruco(
  state: TrucoGameState,
  responderIndex: number,
  accept: boolean
): TrucoGameState {
  if (!state.pendingTruco) return state;
  const responder = state.players[responderIndex];
  const responderKey = getEntityKey(state, responderIndex);
  const pending = state.pendingTruco;

  if (responderKey === pending.callerTeam) return state;

  if (accept) {
    return {
      ...state,
      trucoLevel: pending.level,
      trucoOwnerTeam: pending.callerTeam,
      pendingTruco: null,
      lastCallout: {
        text: '¡Quiero!',
        playerName: responder.name,
        team: responderKey,
        timestamp: Date.now(),
      },
      actionLog: [...state.actionLog.slice(-14), `${responder.name}: ¡Quiero!`],
    };
  }

  // No quiero -> puntos anteriores (1 si era Truco, 2 si Retruco, 3 si Vale Cuatro)
  const declinePoints = pending.level === 2 ? 1 : pending.level - 1;
  const afterAward = awardPoints(
    {
      ...state,
      pendingTruco: null,
      lastCallout: {
        text: '¡No quiero!',
        playerName: responder.name,
        team: responderKey,
        timestamp: Date.now(),
      },
    },
    pending.callerTeam,
    declinePoints,
    'No quiero al Truco'
  );

  return {
    ...afterAward,
    roundFinished: true,
  };
}

function getFaltaEnvidoPoints(state: TrucoGameState): number {
  if (state.mode === 'gallo') {
    const maxScore = Math.max(...state.players.map((p) => p.score));
    return Math.max(1, 30 - maxScore);
  }
  const leader = Math.max(state.teamScores.A, state.teamScores.B);
  return Math.max(1, 30 - leader);
}

function computeEnvidoStakes(
  state: TrucoGameState,
  chain: EnvidoCallType[]
): { acceptPoints: number; declinePoints: number } {
  const baseValues: Record<EnvidoCallType, number> = {
    envido: 2,
    real_envido: 3,
    falta_envido: getFaltaEnvidoPoints(state),
  };

  if (chain[chain.length - 1] === 'falta_envido') {
    const prevSum = chain
      .slice(0, -1)
      .reduce((acc, c) => acc + baseValues[c], 0);
    return {
      acceptPoints: baseValues.falta_envido,
      declinePoints: Math.max(1, prevSum),
    };
  }

  const total = chain.reduce((acc, c) => acc + baseValues[c], 0);
  const prev = chain
    .slice(0, -1)
    .reduce((acc, c) => acc + baseValues[c], 0);
  return {
    acceptPoints: total,
    declinePoints: Math.max(1, prev),
  };
}

export function callEnvido(
  state: TrucoGameState,
  seatIndex: number,
  callType: EnvidoCallType
): TrucoGameState {
  if (state.matchWinner || state.roundFinished) return state;
  if (state.envidoPlayed || state.currentHandIndex > 0 || state.trucoLevel > 0) return state;

  const player = state.players[seatIndex];
  const callerKey = getEntityKey(state, seatIndex);
  const currentChain = state.pendingEnvido ? state.pendingEnvido.chain : [];
  const nextChain = [...currentChain, callType];
  const stakes = computeEnvidoStakes(state, nextChain);

  const label =
    callType === 'envido'
      ? '¡Envido!'
      : callType === 'real_envido'
      ? '¡Real Envido!'
      : '¡Falta Envido!';

  return {
    ...state,
    pendingEnvido: {
      chain: nextChain,
      callerIndex: seatIndex,
      callerTeam: callerKey,
      ...stakes,
    },
    lastCallout: {
      text: label,
      playerName: player.name,
      team: callerKey,
      timestamp: Date.now(),
    },
    actionLog: [...state.actionLog.slice(-14), `${player.name}: ${label}`],
  };
}

export function respondEnvido(
  state: TrucoGameState,
  responderIndex: number,
  accept: boolean
): TrucoGameState {
  if (!state.pendingEnvido) return state;
  const responder = state.players[responderIndex];
  const responderKey = getEntityKey(state, responderIndex);
  const pending = state.pendingEnvido;

  if (responderKey === pending.callerTeam) return state;

  if (!accept) {
    return awardPoints(
      {
        ...state,
        envidoPlayed: true,
        pendingEnvido: null,
        lastCallout: {
          text: '¡No quiero!',
          playerName: responder.name,
          team: responderKey,
          timestamp: Date.now(),
        },
      },
      pending.callerTeam,
      pending.declinePoints,
      'Envido no querido'
    );
  }

  // Quiero -> comparar tantos en orden desde el mano
  let bestScore = -1;
  let winnerKey = getEntityKey(state, state.manoIndex);
  let winnerName = state.players[state.manoIndex].name;

  for (let offset = 0; offset < state.players.length; offset++) {
    const idx = (state.manoIndex + offset) % state.players.length;
    const p = state.players[idx];
    if (p.folded) continue;
    if (p.envidoPoints > bestScore) {
      bestScore = p.envidoPoints;
      winnerKey = getEntityKey(state, idx);
      winnerName = p.name;
    }
  }

  return awardPoints(
    {
      ...state,
      envidoPlayed: true,
      pendingEnvido: null,
      lastCallout: {
        text: `¡Quiero! (${bestScore} de ${winnerName})`,
        playerName: responder.name,
        team: responderKey,
        timestamp: Date.now(),
      },
    },
    winnerKey,
    pending.acceptPoints,
    `Envido ganado con ${bestScore}`
  );
}

export function callFlor(
  state: TrucoGameState,
  seatIndex: number,
  level: FlorCallType = 'flor'
): TrucoGameState {
  if (!state.florEnabled || state.matchWinner || state.roundFinished) return state;
  const player = state.players[seatIndex];
  if (!player.hasFlor) return state;

  const callerKey = getEntityKey(state, seatIndex);
  const label =
    level === 'flor'
      ? '¡Flor!'
      : level === 'contraflor'
      ? '¡Contraflor!'
      : '¡Contraflor al Resto!';

  const pts =
    level === 'flor' ? 3 : level === 'contraflor' ? 6 : getFaltaEnvidoPoints(state);

  return awardPoints(
    {
      ...state,
      florPlayed: true,
      envidoPlayed: true,
      pendingEnvido: null,
      lastCallout: {
        text: label,
        playerName: player.name,
        team: callerKey,
        timestamp: Date.now(),
      },
    },
    callerKey,
    pts,
    label.replace(/¡|!/g, '')
  );
}

export function foldToMazo(
  state: TrucoGameState,
  seatIndex: number
): TrucoGameState {
  if (state.matchWinner || state.roundFinished) return state;
  const player = state.players[seatIndex];
  const folderKey = getEntityKey(state, seatIndex);

  const nextPlayers = state.players.map((p, idx) =>
    idx === seatIndex ? { ...p, folded: true } : p
  );

  // En 1v1 o si todos los de un equipo se van al mazo -> gana el rival
  const remainingTeams = new Set(
    nextPlayers.filter((p) => !p.folded).map((p) => (state.mode === 'gallo' ? p.id : p.team))
  );

  if (remainingTeams.size === 1) {
    const winnerKey = [...remainingTeams][0];
    const stake =
      state.trucoLevel > 0
        ? state.trucoLevel
        : !state.envidoPlayed && state.currentHandIndex === 0
        ? 2
        : 1;

    const afterAward = awardPoints(
      {
        ...state,
        players: nextPlayers,
        pendingTruco: null,
        pendingEnvido: null,
        lastCallout: {
          text: '¡Me voy al mazo!',
          playerName: player.name,
          team: folderKey,
          timestamp: Date.now(),
        },
      },
      winnerKey,
      stake,
      'Rival al mazo'
    );

    return {
      ...afterAward,
      roundFinished: true,
    };
  }

  return {
    ...state,
    players: nextPlayers,
    turnIndex:
      state.turnIndex === seatIndex
        ? getNextActiveSeat({ ...state, players: nextPlayers }, seatIndex)
        : state.turnIndex,
    lastCallout: {
      text: '¡Me voy al mazo!',
      playerName: player.name,
      team: folderKey,
      timestamp: Date.now(),
    },
    actionLog: [...state.actionLog.slice(-14), `${player.name} se fue al mazo.`],
  };
}
