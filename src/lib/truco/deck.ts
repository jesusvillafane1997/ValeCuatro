import { Card, Rank, Suit } from './types';

export const SUITS: Suit[] = ['espadas', 'bastos', 'oro', 'copas'];
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

const SUIT_LABELS: Record<Suit, string> = {
  espadas: 'Espadas',
  bastos: 'Bastos',
  oro: 'Oro',
  copas: 'Copas',
};

const RANK_LABELS: Record<Rank, string> = {
  1: 'Ancho',
  2: 'Dos',
  3: 'Tres',
  4: 'Cuatro',
  5: 'Cinco',
  6: 'Seis',
  7: 'Siete',
  10: 'Sota',
  11: 'Caballo',
  12: 'Rey',
};

/**
 * Jerarquía oficial del Truco Argentino (de mayor a menor poder: 14 a 1).
 */
export function getCardPower(suit: Suit, rank: Rank): number {
  if (rank === 1 && suit === 'espadas') return 14; // Ancho de Espadas
  if (rank === 1 && suit === 'bastos') return 13;  // Ancho de Bastos
  if (rank === 7 && suit === 'espadas') return 12; // Siete de Espadas
  if (rank === 7 && suit === 'oro') return 11;     // Siete de Oro
  if (rank === 3) return 10;                       // Todos los Tres
  if (rank === 2) return 9;                        // Todos los Doses
  if (rank === 1) return 8;                        // Anchos falsos (Copas, Oro)
  if (rank === 12) return 7;                       // Reyes
  if (rank === 11) return 6;                       // Caballos
  if (rank === 10) return 5;                       // Sotas
  if (rank === 7) return 4;                        // Sietes falsos (Copas, Bastos)
  if (rank === 6) return 3;                        // Seises
  if (rank === 5) return 2;                        // Cincos
  return 1;                                        // Cuatros
}

export function getEnvidoValue(rank: Rank): number {
  return rank >= 10 ? 0 : rank;
}

export function createSpanishDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `${rank}-${suit}`,
        suit,
        rank,
        power: getCardPower(suit, rank),
        envidoValue: getEnvidoValue(rank),
        label: `${RANK_LABELS[rank]} de ${SUIT_LABELS[suit]}`,
      });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Calcula los puntos de Envido de una mano de 3 cartas.
 * - 2 cartas del mismo palo: 20 + suma de ambas (10/11/12 valen 0).
 * - 3 cartas del mismo palo (Flor): 20 + las 2 más altas.
 * - 3 palos distintos: la carta más alta (0 a 7).
 */
export function calculateEnvido(cards: Card[]): number {
  if (cards.length === 0) return 0;
  const bySuit: Record<Suit, number[]> = {
    espadas: [],
    bastos: [],
    oro: [],
    copas: [],
  };

  for (const c of cards) {
    bySuit[c.suit].push(c.envidoValue);
  }

  let best = 0;
  for (const suit of SUITS) {
    const vals = bySuit[suit].sort((a, b) => b - a);
    if (vals.length >= 2) {
      const score = 20 + vals[0] + vals[1];
      if (score > best) best = score;
    }
  }

  if (best > 0) return best;

  return Math.max(...cards.map((c) => c.envidoValue));
}

/**
 * Detecta si las 3 cartas son del mismo palo (Flor).
 */
export function hasFlor(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  return cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;
}

export function calculateFlorPoints(cards: Card[]): number {
  if (!hasFlor(cards)) return 0;
  return 20 + cards.reduce((acc, c) => acc + c.envidoValue, 0);
}
