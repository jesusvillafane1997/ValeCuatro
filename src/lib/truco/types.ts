export type Suit = 'espadas' | 'bastos' | 'oro' | 'copas';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  power: number;       // 1 (4) to 14 (Ancho de Espadas)
  envidoValue: number; // 0 for 10/11/12, face value 1-7 otherwise
  label: string;       // e.g. "Ancho de Espadas"
}

export type GameMode = '1v1' | '3v3' | 'gallo';
export type PoolTier = 'practice' | '10000' | '20000' | '50000' | '100000';
export type TeamId = 'A' | 'B' | 'SOLO';

export type TrucoLevel = 0 | 2 | 3 | 4;
export type EnvidoCallType = 'envido' | 'real_envido' | 'falta_envido';
export type FlorCallType = 'flor' | 'contraflor' | 'contraflor_al_resto';

export type SenaType =
  | 'ancho_espadas'
  | 'ancho_bastos'
  | 'siete_espadas'
  | 'siete_oro'
  | 'tres'
  | 'dos'
  | 'envido_alto'
  | 'malas';

export interface SenaInfo {
  type: SenaType;
  title: string;
  gesture: string;
  emoji: string;
}

export interface PlayerSeat {
  seatIndex: number;
  id: string;
  name: string;
  team: TeamId;
  isBot: boolean;
  hand: Card[];
  playedCards: (Card | null)[];
  score: number; // usado en Gallo; en 1v1/3v3 se usa teamScores
  folded: boolean;
  hasFlor: boolean;
  envidoPoints: number;
}

export interface PlayedCardEntry {
  seatIndex: number;
  card: Card;
  handIndex: 0 | 1 | 2;
}

export interface PendingTruco {
  level: 2 | 3 | 4;
  callerIndex: number;
  callerTeam: string;
}

export interface PendingEnvido {
  chain: EnvidoCallType[];
  callerIndex: number;
  callerTeam: string;
  acceptPoints: number;
  declinePoints: number;
}

export interface PendingFlor {
  level: FlorCallType;
  callerIndex: number;
  callerTeam: string;
}

export interface PicaPicaDuel {
  duelIndex: 0 | 1 | 2;
  seatA: number;
  seatB: number;
  handWinners: ('A' | 'B' | 'TIE' | null)[];
  trucoLevel: TrucoLevel;
  winner: 'A' | 'B' | null;
  pointsAwarded: number;
}

export interface TrucoGameState {
  matchId: string;
  mode: GameMode;
  poolTier: PoolTier;
  buyInArs: number;
  escrowArs: number;
  florEnabled: boolean;
  picaPicaEnabled: boolean;
  players: PlayerSeat[];
  teamScores: { A: number; B: number };
  roundNumber: number;
  manoIndex: number;
  turnIndex: number;
  currentHandIndex: 0 | 1 | 2;
  tableCards: PlayedCardEntry[];
  handWinners: (string | null)[]; // 'A' | 'B' | 'TIE' | playerId (gallo)
  trucoLevel: TrucoLevel;
  trucoOwnerTeam: string | null;
  pendingTruco: PendingTruco | null;
  envidoPlayed: boolean;
  pendingEnvido: PendingEnvido | null;
  florPlayed: boolean;
  pendingFlor: PendingFlor | null;
  isPicaPica: boolean;
  picaPicaDuels: PicaPicaDuel[];
  lastCallout: {
    text: string;
    playerName: string;
    team: string;
    timestamp: number;
  } | null;
  actionLog: string[];
  matchWinner: string | null; // 'A' | 'B' | playerId
  roundFinished: boolean;
}
