import { createInitialGameState } from './engine';
import { ServerMatchAction, validateAndApplyServerAction } from './server-engine';
import { GameMode, PoolTier, TrucoGameState } from './types';

export interface PvpRoomPlayer {
  id: string;
  name: string;
  seatIndex: number;
  team: 'A' | 'B' | 'SOLO';
}

export interface PvpRoom {
  id: string;
  mode: GameMode;
  poolTier: PoolTier;
  buyInArs: number;
  florEnabled: boolean;
  maxSeats: number;
  players: PvpRoomPlayer[];
  status: 'waiting' | 'playing' | 'completed';
  gameState: TrucoGameState | null;
  createdAt: string;
}

const STORAGE_KEY = 'vale_cuatro_pvp_rooms_v1';
const CHANNEL_NAME = 'vale_cuatro_pvp_channel';

export function getPvpRooms(): PvpRoom[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePvpRooms(rooms: PvpRoom[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage({ type: 'rooms_updated', rooms });
    ch.close();
  } catch {
    // ignore
  }
}

export function subscribePvpRooms(cb: (rooms: PvpRoom[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const ch = new BroadcastChannel(CHANNEL_NAME);
  ch.onmessage = (ev) => {
    if (ev.data?.type === 'rooms_updated') {
      cb(ev.data.rooms);
    }
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cb(getPvpRooms());
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    ch.close();
    window.removeEventListener('storage', onStorage);
  };
}

export function joinOrCreatePvpRoom(params: {
  mode: GameMode;
  poolTier: PoolTier;
  buyInArs: number;
  florEnabled: boolean;
  playerId: string;
  playerName: string;
}): PvpRoom {
  const { mode, poolTier, buyInArs, florEnabled, playerId, playerName } = params;
  const maxSeats = mode === '1v1' ? 2 : 6;
  const rooms = getPvpRooms();

  // Si el jugador ya está en una sala activa o esperando del mismo modo, devolverla
  const existingForPlayer = rooms.find(
    (r) =>
      r.status !== 'completed' &&
      r.mode === mode &&
      r.poolTier === poolTier &&
      r.players.some((p) => p.id === playerId)
  );
  if (existingForPlayer) return existingForPlayer;

  // Buscar sala esperando con lugar disponible
  let target = rooms.find(
    (r) =>
      r.status === 'waiting' &&
      r.mode === mode &&
      r.poolTier === poolTier &&
      r.players.length < r.maxSeats
  );

  if (!target) {
    target = {
      id: `pvp-${mode}-${Date.now().toString(36)}`,
      mode,
      poolTier,
      buyInArs,
      florEnabled,
      maxSeats,
      players: [],
      status: 'waiting',
      gameState: null,
      createdAt: new Date().toISOString(),
    };
    rooms.unshift(target);
  }

  const seatIndex = target.players.length;
  const team: 'A' | 'B' | 'SOLO' =
    mode === 'gallo' ? 'SOLO' : seatIndex % 2 === 0 ? 'A' : 'B';

  target.players.push({
    id: playerId,
    name: playerName,
    seatIndex,
    team,
  });

  // Cuando se llenan todos los asientos, arranca la partida real sin bots
  if (target.players.length >= target.maxSeats) {
    target.status = 'playing';
    target.gameState = createInitialGameState({
      matchId: target.id,
      mode: target.mode,
      poolTier: target.poolTier,
      buyInArs: target.buyInArs,
      florEnabled: target.florEnabled,
      picaPicaEnabled: true,
      humanPlayers: target.players.map((p) => ({
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
      })),
      fillWithBots: false,
    });
  }

  const nextRooms = [target, ...rooms.filter((r) => r.id !== target!.id)];
  savePvpRooms(nextRooms);
  return target;
}

export function applyPvpRoomAction(
  roomId: string,
  actorUserId: string,
  action: ServerMatchAction
): { room: PvpRoom | null; error?: string } {
  const rooms = getPvpRooms();
  const room = rooms.find((r) => r.id === roomId);
  if (!room || !room.gameState) {
    return { room: null, error: 'Sala no encontrada o aún esperando jugadores.' };
  }

  const res = validateAndApplyServerAction({
    state: room.gameState,
    actorUserId,
    action,
  });

  if (res.error) {
    return { room, error: res.error };
  }

  const updated: PvpRoom = {
    ...room,
    gameState: res.nextState,
    status: res.nextState.matchWinner ? 'completed' : 'playing',
  };

  savePvpRooms(rooms.map((r) => (r.id === roomId ? updated : r)));
  return { room: updated };
}

export function leavePvpRoom(roomId: string, playerId: string) {
  const rooms = getPvpRooms();
  const next = rooms
    .map((r) => {
      if (r.id !== roomId || r.status !== 'waiting') return r;
      return {
        ...r,
        players: r.players.filter((p) => p.id !== playerId),
      };
    })
    .filter((r) => r.players.length > 0);
  savePvpRooms(next);
}
