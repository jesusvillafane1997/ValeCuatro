'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Volume2,
  VolumeX,
  Clock,
  Sparkles,
  Flag,
  Eye,
  Trophy,
  RotateCcw,
  ArrowLeft,
  MessageCircle,
  Users,
} from 'lucide-react';
import {
  callEnvido,
  callFlor,
  callTruco,
  createInitialGameState,
  dealNewRound,
  foldToMazo,
  playCard,
  respondEnvido,
  respondTruco,
} from '@/lib/truco/engine';
import { runBotStep } from '@/lib/truco/bot';
import {
  applyPvpRoomAction,
  getPvpRooms,
  leavePvpRoom,
  PvpRoom,
  subscribePvpRooms,
} from '@/lib/truco/pvp-demo-store';
import { ServerMatchAction } from '@/lib/truco/server-engine';
import { usePvpMatch } from '@/lib/truco/usePvpMatch';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { SENAS_LIST, SENAS_MAP } from '@/lib/truco/senas';
import { soundFX } from '@/lib/truco/sound';
import { GameMode, PoolTier, SenaType, TrucoGameState } from '@/lib/truco/types';
import { formatARS } from '@/lib/format';
import { Wordmark } from '@/components/Wordmark';
import {
  FileteadoTableCornerGold,
  FileteadoSolDeMayoWatermark,
} from '@/components/FileteadoAccents';
import { SpanishCard } from './SpanishCard';
import { FosforosBoard } from './FosforosBoard';

interface TrucoTableProps {
  matchId: string;
  mode: GameMode;
  poolTier: PoolTier;
  buyInArs: number;
  florEnabled?: boolean;
  playerName?: string;
  localPlayerId?: string;
  isPvp?: boolean;
  onExit?: () => void;
  onRequestWithdraw?: () => void;
}

const TURN_SECONDS = 25;

const QUICK_REACTIONS = [
  '¡Qué mano, papá! 🔥',
  '¡Te leí todo! 👀',
  '¡A llorar al campito! 😂',
  '¡Vamos todavía! 🧉',
];

function getSlapRotation(cardId: string, index: number): number {
  let hash = index * 17;
  for (let i = 0; i < cardId.length; i++) {
    hash = (hash * 31 + cardId.charCodeAt(i)) % 97;
  }
  return (hash % 9) - 4;
}

export function TrucoTable({
  matchId,
  mode,
  poolTier,
  buyInArs,
  florEnabled = true,
  playerName = 'Vos',
  localPlayerId = 'local-player',
  isPvp = false,
  onExit,
  onRequestWithdraw,
}: TrucoTableProps) {
  const supabasePvp = isPvp && isSupabaseConfigured();

  const [pvpRoom, setPvpRoom] = useState<PvpRoom | null>(() =>
    isPvp && !supabasePvp ? getPvpRooms().find((r) => r.id === matchId) ?? null : null
  );

  const [localGame, setLocalGame] = useState<TrucoGameState>(() =>
    createInitialGameState({
      matchId,
      mode,
      poolTier,
      buyInArs,
      florEnabled,
      picaPicaEnabled: true,
      humanPlayers: [{ id: localPlayerId, name: playerName, seatIndex: 0 }],
      fillWithBots: !isPvp,
    })
  );

  const [muted, setMuted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(TURN_SECONDS);
  const [activeSenas, setActiveSenas] = useState<Record<number, SenaType>>({});
  const [showSenasWheel, setShowSenasWheel] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [pvpError, setPvpError] = useState<string | null>(null);
  const [reactionBubble, setReactionBubble] = useState<{
    text: string;
    sender: string;
    id: number;
  } | null>(null);

  // Supabase Realtime PvP hook
  const {
    publicState: sbPublicState,
    myCards: sbMyCards,
    myEnvido: sbMyEnvido,
    myFlor: sbMyFlor,
    turnExpiresAt: sbTurnExpiresAt,
    teamSenas: sbTeamSenas,
    actionError: sbActionError,
    sendAction: sbSendAction,
    broadcastTeamSena: sbBroadcastTeamSena,
  } = usePvpMatch({
    matchId: supabasePvp ? matchId : null,
    userId: localPlayerId,
  });

  // Inicializar manos en servidor si la mesa Supabase aún no repartió
  useEffect(() => {
    if (!supabasePvp || !matchId) return;
    fetch('/api/match/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId }),
    }).catch(() => {});
  }, [supabasePvp, matchId]);

  // Sync PvP room across tabs in real time (Local Demo mode)
  useEffect(() => {
    if (!isPvp || supabasePvp) return;
    const current = getPvpRooms().find((r) => r.id === matchId) ?? null;
    setPvpRoom(current);

    return subscribePvpRooms((rooms) => {
      const updated = rooms.find((r) => r.id === matchId) ?? null;
      if (updated) setPvpRoom(updated);
    });
  }, [isPvp, supabasePvp, matchId]);

  const game: TrucoGameState = useMemo(() => {
    if (supabasePvp && sbPublicState) {
      return {
        ...sbPublicState,
        players: sbPublicState.players.map((p) =>
          p.id === localPlayerId
            ? { ...p, hand: sbMyCards, envidoPoints: sbMyEnvido, hasFlor: sbMyFlor }
            : p
        ),
      };
    }
    if (isPvp && pvpRoom?.gameState) return pvpRoom.gameState;
    return localGame;
  }, [supabasePvp, sbPublicState, sbMyCards, sbMyEnvido, sbMyFlor, localPlayerId, isPvp, pvpRoom, localGame]);

  const isWaitingForPlayers =
    (supabasePvp && !sbPublicState) ||
    (isPvp && !supabasePvp && (!pvpRoom || pvpRoom.status === 'waiting' || !pvpRoom.gameState));

  const mySeatIndex = useMemo(() => {
    const idx = game.players.findIndex((p) => p.id === localPlayerId);
    return idx >= 0 ? idx : 0;
  }, [game.players, localPlayerId]);

  const humanSeat = game.players[mySeatIndex] ?? game.players[0];
  const humanKey = game.mode === 'gallo' ? humanSeat.id : humanSeat.team;

  const isHumanTurn =
    !isWaitingForPlayers &&
    !game.matchWinner &&
    !game.roundFinished &&
    !game.pendingTruco &&
    !game.pendingEnvido &&
    game.turnIndex === mySeatIndex &&
    !humanSeat.folded;

  const mustRespondTruco =
    !isWaitingForPlayers &&
    !!game.pendingTruco &&
    game.pendingTruco.callerTeam !== humanKey;

  const mustRespondEnvido =
    !isWaitingForPlayers &&
    !!game.pendingEnvido &&
    game.pendingEnvido.callerTeam !== humanKey;

  const dispatchAction = (action: ServerMatchAction) => {
    setPvpError(null);
    if (supabasePvp) {
      sbSendAction(action);
      return;
    }
    if (isPvp) {
      const res = applyPvpRoomAction(matchId, localPlayerId, action);
      if (res.error) {
        setPvpError(res.error);
        return;
      }
      if (res.room) setPvpRoom(res.room);
      return;
    }

    // Solo Bot Practice Mode
    setLocalGame((prev) => {
      if (action.type === 'play_card') return playCard(prev, mySeatIndex, action.cardId);
      if (action.type === 'call_truco') return callTruco(prev, mySeatIndex);
      if (action.type === 'respond_truco') return respondTruco(prev, mySeatIndex, action.accept);
      if (action.type === 'call_envido') return callEnvido(prev, mySeatIndex, action.callType);
      if (action.type === 'respond_envido') return respondEnvido(prev, mySeatIndex, action.accept);
      if (action.type === 'call_flor') return callFlor(prev, mySeatIndex, action.level ?? 'flor');
      if (action.type === 'ir_al_mazo') return foldToMazo(prev, mySeatIndex);
      if (action.type === 'deal_next_round') return dealNewRound(prev);
      return prev;
    });
  };

  const toggleMute = () => {
    soundFX.muted = !muted;
    setMuted(!muted);
  };

  const triggerReaction = (text: string, sender = playerName) => {
    setShowReactions(false);
    setReactionBubble({ text, sender, id: Date.now() });
    setTimeout(() => {
      setReactionBubble((prev) => (prev && Date.now() - prev.id >= 2700 ? null : prev));
    }, 2800);
  };

  // Auto-deal next round after 2.1s when round finishes
  useEffect(() => {
    if (isWaitingForPlayers || game.matchWinner || !game.roundFinished) return;
    // In PvP, seat 0 triggers the round transition so it only fires once
    if (isPvp && mySeatIndex !== 0) return;

    const t = setTimeout(() => {
      dispatchAction({ type: 'deal_next_round' });
    }, 2100);
    return () => clearTimeout(t);
  }, [game.roundFinished, game.matchWinner, isWaitingForPlayers, isPvp, mySeatIndex]);

  // Bot automation loop (ONLY when !isPvp)
  useEffect(() => {
    if (isPvp || game.matchWinner || game.roundFinished) return;

    const needsBot =
      (game.pendingTruco && game.pendingTruco.callerTeam === humanKey) ||
      (game.pendingEnvido && game.pendingEnvido.callerTeam === humanKey) ||
      (!game.pendingTruco &&
        !game.pendingEnvido &&
        game.players[game.turnIndex]?.isBot);

    if (!needsBot) return;

    const timer = setTimeout(() => {
      setLocalGame((prev) => {
        const next = runBotStep(prev);
        if (next.tableCards.length > prev.tableCards.length) {
          soundFX.playCardSnap();
        } else if (next.lastCallout?.timestamp !== prev.lastCallout?.timestamp) {
          soundFX.playCallout();
        }
        return next;
      });
    }, 850);

    return () => clearTimeout(timer);
  }, [isPvp, game, humanKey]);

  // Turn countdown timer synced with server turn_expires_at when in Supabase PvP
  useEffect(() => {
    if (supabasePvp && sbTurnExpiresAt) {
      const remaining = Math.max(
        1,
        Math.ceil((new Date(sbTurnExpiresAt).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(Math.min(TURN_SECONDS, remaining));
    } else {
      setSecondsLeft(TURN_SECONDS);
    }
  }, [supabasePvp, sbTurnExpiresAt, game.turnIndex, game.roundNumber, game.pendingTruco, game.pendingEnvido]);

  useEffect(() => {
    if (isWaitingForPlayers) return;
    if (!isHumanTurn && !mustRespondTruco && !mustRespondEnvido) return;
    if (game.matchWinner || game.roundFinished) return;

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          dispatchAction(supabasePvp ? { type: 'timeout_fallback' } : { type: 'ir_al_mazo' });
          return TURN_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isWaitingForPlayers, isHumanTurn, mustRespondTruco, mustRespondEnvido, game.matchWinner, game.roundFinished, supabasePvp]);

  const flashSena = (seatIdx: number, sena: SenaType) => {
    setActiveSenas((prev) => ({ ...prev, [seatIdx]: sena }));
    setShowSenasWheel(false);
    if (supabasePvp) {
      sbBroadcastTeamSena(seatIdx, sena);
    }
    setTimeout(() => {
      setActiveSenas((prev) => {
        const copy = { ...prev };
        delete copy[seatIdx];
        return copy;
      });
    }, 3500);
  };

  const mergedSenas = useMemo(
    () => ({ ...sbTeamSenas, ...activeSenas }),
    [sbTeamSenas, activeSenas]
  );

  const nextTrucoLabel = useMemo(() => {
    if (game.trucoLevel === 0) return 'Truco';
    if (game.trucoLevel === 2) return 'Retruco';
    if (game.trucoLevel === 3) return 'Vale Cuatro';
    return null;
  }, [game.trucoLevel]);

  const canCallTruco =
    !isWaitingForPlayers &&
    !game.matchWinner &&
    !game.roundFinished &&
    !game.pendingTruco &&
    !game.pendingEnvido &&
    nextTrucoLabel !== null &&
    game.trucoOwnerTeam !== humanKey &&
    !humanSeat.folded;

  const canCallEnvido =
    !isWaitingForPlayers &&
    !game.matchWinner &&
    !game.roundFinished &&
    !game.envidoPlayed &&
    game.currentHandIndex === 0 &&
    game.trucoLevel === 0 &&
    !game.pendingTruco &&
    !humanSeat.folded &&
    (!game.pendingEnvido || game.pendingEnvido.callerTeam !== humanKey);

  const canCallFlor =
    !isWaitingForPlayers &&
    game.florEnabled &&
    humanSeat.hasFlor &&
    !game.florPlayed &&
    game.currentHandIndex === 0 &&
    !game.roundFinished &&
    !game.matchWinner;

  const otherPlayers = game.players.filter((p) => p.seatIndex !== mySeatIndex);
  const netPrize = Math.round(game.escrowArs * 0.92);

  const handleLeave = () => {
    if (isPvp && pvpRoom?.status === 'waiting') {
      leavePvpRoom(matchId, localPlayerId);
    }
    onExit?.();
  };

  return (
    <div className="h-[100dvh] w-full overflow-hidden emerald-canvas flex flex-col select-none">
      {/* Slim Frosted Emerald Header */}
      <header className="shrink-0 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {onExit && (
            <button
              onClick={handleLeave}
              className="p-2 rounded-full bg-[#164A34]/80 hover:bg-[#1D5C41] border border-white/[0.08] text-white transition ease-fluid"
              title="Volver al Lobby"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <Wordmark size="sm" />
          <span className="hidden sm:inline-flex items-center text-xs px-3 py-1 rounded-full bg-[#164A34]/75 border border-white/[0.08] text-[#E4E9E6] font-medium">
            {mode === '1v1' ? '1v1 Mano a Mano' : mode === '3v3' ? '3v3 En Equipo' : 'Todos contra Todos'}
            {isPvp && <span className="ml-1.5 text-[#F2D283] font-semibold">• PvP Real</span>}
            {buyInArs > 0 && (
              <span className="ml-1.5 text-[#F2D283] font-semibold tabular-nums">
                • Pozo {formatARS(game.escrowArs)}
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tabular-nums border transition ${
              secondsLeft <= 7
                ? 'bg-rose-500/25 border-rose-400/50 text-rose-200 animate-pulse'
                : 'bg-[#164A34]/75 border-white/[0.08] text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-[#F2D283]" />
            <span>00:{String(secondsLeft).padStart(2, '0')}</span>
          </div>
          <button
            onClick={toggleMute}
            className="p-2 rounded-full bg-[#164A34]/75 hover:bg-[#1D5C41] border border-white/[0.08] text-[#E4E9E6] transition"
            title={muted ? 'Activar sonido' : 'Silenciar'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Living Emerald Felt Table (El Paño) */}
      <div className="flex-1 px-2.5 pb-2.5 sm:px-5 sm:pb-5 flex flex-col min-h-0">
        <div className="relative flex-1 min-h-0 rounded-[2rem] sm:rounded-[2.5rem] felt-texture border border-[#C9A24B]/30 shadow-ambient flex flex-col justify-between p-3 sm:p-6 overflow-hidden">
          {/* Visible Gold Fileteado Porteño Table Corner Scrolls */}
          <FileteadoTableCornerGold position="tl" className="absolute top-2 left-2 w-14 h-14 sm:w-20 sm:h-20 z-10" />
          <FileteadoTableCornerGold position="tr" className="absolute top-2 right-2 w-14 h-14 sm:w-20 sm:h-20 z-10" />
          <FileteadoTableCornerGold position="bl" className="absolute bottom-2 left-2 w-14 h-14 sm:w-20 sm:h-20 z-10" />
          <FileteadoTableCornerGold position="br" className="absolute bottom-2 right-2 w-14 h-14 sm:w-20 sm:h-20 z-10" />

          {/* Subtle Sol de Mayo Felt Watermark (opacity 0.14) centered in El Paño */}
          <FileteadoSolDeMayoWatermark className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 sm:w-68 sm:h-68 z-0" />
          {/* Waiting Room Overlay when PvP seats are not full yet */}
          {isWaitingForPlayers && (
            <div className="absolute inset-0 z-40 bg-[#0E3324]/90 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center gap-5 text-white">
              <div className="w-16 h-16 rounded-full bg-[#D9B35F]/20 flex items-center justify-center relative">
                <span className="w-6 h-6 rounded-full bg-[#F2D283] animate-ping absolute opacity-40" />
                <Users className="w-7 h-7 text-[#F2D283] relative" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  Esperando jugadores reales...
                </h2>
                <p className="text-xs sm:text-sm text-[#9EB3A8] max-w-md mx-auto">
                  La partida arranca automáticamente cuando se completen los{' '}
                  <strong className="text-white">{pvpRoom?.maxSeats ?? (mode === '1v1' ? 2 : 6)}</strong> lugares de la mesa ({pvpRoom?.players.length ?? 1}/{pvpRoom?.maxSeats ?? (mode === '1v1' ? 2 : 6)}).
                </p>
              </div>

              {/* Seat Slots Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 w-full max-w-lg">
                {Array.from({ length: pvpRoom?.maxSeats ?? (mode === '1v1' ? 2 : 6) }).map((_, i) => {
                  const occupant = pvpRoom?.players[i];
                  return (
                    <div
                      key={i}
                      className={`rounded-2xl px-3.5 py-3 border text-left transition ${
                        occupant
                          ? 'bg-[#164A34] border-[#F2D283]/50 text-white'
                          : 'bg-white/5 border-white/10 text-[#9EB3A8]'
                      }`}
                    >
                      <div className="text-[10px] uppercase tracking-wider opacity-70">
                        Asiento {i + 1}
                      </div>
                      <div className="text-xs font-bold truncate mt-0.5">
                        {occupant ? occupant.name : 'Lugar libre...'}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={handleLeave}
                className="px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition"
              >
                Salir de la mesa
              </button>
            </div>
          )}

          {/* Floating Fósforos Tray */}
          {!isWaitingForPlayers && (
            <div className="hidden md:block absolute top-4 right-4 z-20 w-64">
              {mode === 'gallo' ? (
                <div className="bg-[#164A34]/75 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-3.5 text-white shadow-ambient">
                  <div className="text-[10px] uppercase tracking-wider text-[#9EB3A8] font-semibold mb-2">
                    Tabla Gallo (30 pts)
                  </div>
                  <div className="space-y-1">
                    {[...game.players]
                      .sort((a, b) => b.score - a.score)
                      .map((p) => (
                        <div key={p.id} className="flex justify-between text-xs">
                          <span className="truncate">{p.name}</span>
                          <span className="font-bold tabular-nums text-[#F2D283]">{p.score}</span>
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <FosforosBoard
                  compact
                  labelA={mode === '1v1' ? game.players[0]?.name ?? 'Eq. A' : 'Equipo A'}
                  scoreA={game.teamScores.A}
                  labelB={mode === '1v1' ? game.players[1]?.name ?? 'Eq. B' : 'Equipo B'}
                  scoreB={game.teamScores.B}
                />
              )}
            </div>
          )}

          {/* Opponent Pills around perimeter */}
          <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 sm:gap-3 md:pr-68 pt-1">
            {otherPlayers.map((p) => {
              const isTurn = !game.roundFinished && game.turnIndex === p.seatIndex;
              const sena = mergedSenas[p.seatIndex];
              const isTeammate = mode === '3v3' && p.team === humanSeat.team;

              return (
                <div
                  key={p.id}
                  className={`rounded-full px-3 py-1.5 backdrop-blur-xl transition-all ease-fluid flex items-center gap-2 border ${
                    isTurn
                      ? 'bg-white text-[#0E3324] border-[#C9A24B] ring-4 ring-[#D9B35F]/40 shadow-lg'
                      : 'bg-[#164A34]/75 border-[#C9A24B]/40 text-white'
                  } ${p.folded ? 'opacity-40' : ''}`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                      isTurn ? 'bg-[#0E3324] text-[#F2D283]' : 'bg-white/15 text-white'
                    }`}
                  >
                    {p.name.charAt(0)}
                  </div>
                  <div className="min-w-0 pr-1">
                    <div className="text-[11px] font-semibold truncate max-w-[90px] sm:max-w-[120px]">
                      {p.name}
                    </div>
                    <div className="text-[9px] opacity-75 tabular-nums">
                      {mode === 'gallo' ? `${p.score} pts` : `Eq. ${p.team}`} • {p.hand.length} cartas
                    </div>
                  </div>
                  {isTeammate && sena && (
                    <motion.div
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-[10px] bg-gradient-to-r from-[#D9B35F] to-[#F2D283] text-[#0E3324] rounded-full px-2.5 py-0.5 font-bold"
                    >
                      {SENAS_MAP[sena].emoji} {SENAS_MAP[sena].title}
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Callout & Reaction Bubbles */}
          <div className="self-center z-20 flex flex-col items-center gap-1.5 min-h-[34px]">
            <AnimatePresence>
              {game.lastCallout && (
                <motion.div
                  key={game.lastCallout.timestamp}
                  initial={{ opacity: 0, y: -8, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 24 }}
                  className="px-4 py-1.5 rounded-full bg-white text-[#0E3324] shadow-ambient flex items-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#D9B35F]" />
                  <span className="text-xs text-[#5F6368]">
                    {game.lastCallout.playerName}:
                  </span>
                  <span className="text-sm font-bold text-[#0E3324]">
                    {game.lastCallout.text}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {(pvpError || sbActionError) && (
              <div className="px-3.5 py-1 rounded-full bg-rose-500/85 text-white text-xs font-semibold">
                {pvpError || sbActionError}
              </div>
            )}

            <AnimatePresence>
              {reactionBubble && (
                <motion.div
                  key={reactionBubble.id}
                  initial={{ opacity: 0, scale: 0.8, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 20 }}
                  className="px-3.5 py-1 rounded-full bg-gradient-to-r from-[#D9B35F] to-[#F2D283] text-[#0E3324] text-xs font-bold shadow-md"
                >
                  {reactionBubble.sender}: {reactionBubble.text}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Center Played Cards + Pica-Pica Duel Strip */}
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center min-h-0 my-1 gap-2">
            {game.isPicaPica && game.picaPicaDuels.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 px-3 py-1.5 rounded-full bg-[#164A34]/85 border border-[#D9B35F]/40 text-[11px] text-[#F2D283]">
                <span className="font-bold">⚡ Pica-Pica:</span>
                {game.picaPicaDuels.map((d) => (
                  <span key={d.duelIndex} className="px-2 py-0.5 rounded-full bg-white/10 text-white">
                    {game.players[d.seatA]?.name.split(' ')[0]} vs {game.players[d.seatB]?.name.split(' ')[0]}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3.5 px-5 py-3.5 rounded-3xl bg-black/15 border border-white/[0.06] min-h-[104px] sm:min-h-[130px] max-w-2xl w-full">
              {game.tableCards.length === 0 ? (
                <span className="text-xs text-[#9EB3A8] font-medium">
                  Ronda {game.roundNumber} — {isHumanTurn ? '¡Es tu turno! Jugá una carta' : `Turno de ${game.players[game.turnIndex]?.name ?? 'rival'}`}
                </span>
              ) : (
                game.tableCards.map((entry, idx) => {
                  const owner = game.players[entry.seatIndex];
                  const rot = getSlapRotation(entry.card.id, idx);
                  return (
                    <div key={`${entry.card.id}-${idx}`} className="flex flex-col items-center gap-1">
                      <SpanishCard card={entry.card} size="sm" slapRotation={rot} />
                      <span className="text-[10px] text-[#E4E9E6] font-medium max-w-[68px] truncate">
                        {owner?.name.split(' ')[0]}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Bottom Hand + Floating Frosted Action Dock */}
          <div className="relative z-20 flex flex-col items-center gap-3">
            <div className="flex items-end justify-center gap-2.5 sm:gap-3.5">
              {humanSeat.hand.map((card, idx) => (
                <SpanishCard
                  key={card.id}
                  card={card}
                  size="md"
                  dealIndex={idx}
                  disabled={!isHumanTurn}
                  highlighted={isHumanTurn}
                  onClick={() => {
                    if (!isHumanTurn) return;
                    soundFX.playCardSnap();
                    dispatchAction({ type: 'play_card', cardId: card.id });
                  }}
                />
              ))}
            </div>

            {/* Frosted Emerald Glass Dock */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 bg-[#164A34]/85 backdrop-blur-xl border border-white/[0.1] text-white rounded-full px-4 py-2 shadow-ambient">
              <span className="text-xs font-medium text-[#9EB3A8] tabular-nums px-1.5">
                {humanSeat.name} • Envido: <strong className="text-[#F2D283]">{humanSeat.envidoPoints}</strong>
              </span>

              {(mustRespondTruco || mustRespondEnvido) && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.playCallout();
                      dispatchAction(
                        mustRespondTruco
                          ? { type: 'respond_truco', accept: true }
                          : { type: 'respond_envido', accept: true }
                      );
                    }}
                    className="px-4 py-1.5 rounded-full bg-white hover:bg-[#F5F7F6] text-[#0E3324] font-bold text-xs transition active:scale-95"
                  >
                    ¡Quiero!
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.playCallout();
                      dispatchAction(
                        mustRespondTruco
                          ? { type: 'respond_truco', accept: false }
                          : { type: 'respond_envido', accept: false }
                      );
                    }}
                    className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition active:scale-95"
                  >
                    No quiero
                  </button>
                </>
              )}

              {canCallTruco && (
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playCallout();
                    dispatchAction({ type: 'call_truco' });
                  }}
                  className="px-4 py-1.5 rounded-full bg-gradient-to-r from-[#D9B35F] to-[#F2D283] hover:opacity-95 text-[#0E3324] font-bold text-xs shadow-sm transition active:scale-95"
                >
                  ¡{nextTrucoLabel}!
                </button>
              )}

              {canCallEnvido && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.playCallout();
                      dispatchAction({ type: 'call_envido', callType: 'envido' });
                    }}
                    className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition active:scale-95"
                  >
                    Envido
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.playCallout();
                      dispatchAction({ type: 'call_envido', callType: 'real_envido' });
                    }}
                    className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition active:scale-95"
                  >
                    Real Envido
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.playCallout();
                      dispatchAction({ type: 'call_envido', callType: 'falta_envido' });
                    }}
                    className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition active:scale-95"
                  >
                    Falta Envido
                  </button>
                </>
              )}

              {canCallFlor && (
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playCallout();
                    dispatchAction({ type: 'call_flor', level: 'flor' });
                  }}
                  className="px-3.5 py-1.5 rounded-full bg-[#D9B35F]/20 border border-[#D9B35F]/50 text-[#F2D283] font-semibold text-xs transition active:scale-95"
                >
                  🌸 ¡Flor!
                </button>
              )}

              {mode === '3v3' && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSenasWheel((v) => !v);
                      setShowReactions(false);
                    }}
                    className="flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-[#F2D283] font-semibold text-xs transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Señas
                  </button>

                  <AnimatePresence>
                    {showSenasWheel && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 10 }}
                        className="absolute bottom-12 right-0 z-30 w-64 bg-[#164A34]/95 backdrop-blur-xl border border-white/15 text-white rounded-3xl p-3 shadow-2xl grid grid-cols-2 gap-1.5"
                      >
                        {SENAS_LIST.map((s) => (
                          <button
                            key={s.type}
                            type="button"
                            onClick={() => flashSena(mySeatIndex, s.type)}
                            className="flex flex-col items-center text-center p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 transition"
                          >
                            <span className="text-lg leading-none">{s.emoji}</span>
                            <span className="text-[10px] font-semibold mt-1 leading-tight">
                              {s.title}
                            </span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowReactions((v) => !v);
                    setShowSenasWheel(false);
                  }}
                  className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-[#E4E9E6] transition"
                  title="Tirar un comentario"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                </button>
                <AnimatePresence>
                  {showReactions && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 10 }}
                      className="absolute bottom-12 right-0 z-30 w-52 bg-[#164A34]/95 backdrop-blur-xl border border-white/15 rounded-3xl p-2 shadow-2xl flex flex-col gap-1"
                    >
                      {QUICK_REACTIONS.map((txt) => (
                        <button
                          key={txt}
                          type="button"
                          onClick={() => triggerReaction(txt)}
                          className="text-left px-3 py-2 rounded-2xl hover:bg-white/10 text-xs font-medium text-white transition"
                        >
                          {txt}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {!game.roundFinished && !game.matchWinner && !humanSeat.folded && !isWaitingForPlayers && (
                <button
                  type="button"
                  onClick={() => dispatchAction({ type: 'ir_al_mazo' })}
                  className="flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-rose-500/20 hover:text-rose-200 text-[#9EB3A8] font-medium text-xs transition"
                >
                  <Flag className="w-3 h-3" />
                  Al Mazo
                </button>
              )}
            </div>
          </div>

          {/* Match Winner Overlay */}
          {game.matchWinner && (
            <div className="absolute inset-0 z-40 bg-[#0E3324]/92 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center gap-4 text-white">
              <div className="w-16 h-16 rounded-full bg-[#D9B35F]/20 border border-[#D9B35F]/50 flex items-center justify-center">
                <Trophy className="w-9 h-9 text-[#F2D283]" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight">
                ¡Partida liquidada!
              </h2>
              <p className="text-sm sm:text-base max-w-md text-[#E4E9E6]">
                Ganador:{' '}
                <strong className="text-[#F2D283]">
                  {mode === 'gallo'
                    ? game.players.find((p) => p.id === game.matchWinner)?.name
                    : `Equipo ${game.matchWinner}`}
                </strong>
                {buyInArs > 0 && (
                  <>
                    <br />
                    Premio acreditado:{' '}
                    <strong className="tabular-nums text-[#F2D283]">{formatARS(netPrize)}</strong>
                  </>
                )}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
                {!isPvp && (
                  <button
                    onClick={() =>
                      setLocalGame(
                        createInitialGameState({
                          matchId,
                          mode,
                          poolTier,
                          buyInArs,
                          florEnabled,
                          picaPicaEnabled: true,
                          humanPlayers: [{ id: localPlayerId, name: playerName, seatIndex: 0 }],
                          fillWithBots: true,
                        })
                      )
                    }
                    className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white text-[#0E3324] font-bold text-sm shadow-lg hover:bg-[#F5F7F6] transition"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Jugar Revancha
                  </button>
                )}
                {onRequestWithdraw && buyInArs > 0 && (
                  <button
                    onClick={onRequestWithdraw}
                    className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#D9B35F] to-[#F2D283] text-[#0E3324] font-bold text-sm shadow-lg transition"
                  >
                    Pedir Retiro
                  </button>
                )}
                {onExit && (
                  <button
                    onClick={onExit}
                    className="px-6 py-2.5 rounded-full bg-[#164A34] hover:bg-[#1D5C41] border border-white/10 text-white font-semibold text-sm transition"
                  >
                    Volver al Lobby
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
