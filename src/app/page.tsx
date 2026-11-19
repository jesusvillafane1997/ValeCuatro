'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Wallet,
  Users,
  Swords,
  Crown,
  Bot,
  LogIn,
  LogOut,
  ArrowDownToLine,
  Flower2,
} from 'lucide-react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { formatARS, POOL_TIERS } from '@/lib/format';
import {
  getPvpRooms,
  joinOrCreatePvpRoom,
  PvpRoom,
  subscribePvpRooms,
} from '@/lib/truco/pvp-demo-store';
import { GameMode, PoolTier } from '@/lib/truco/types';
import { Wordmark } from '@/components/Wordmark';
import {
  FileteadoBottomBracket,
  FileteadoCardFiligree,
  FileteadoCorner,
} from '@/components/FileteadoAccents';
import { TrucoTable } from '@/components/truco/TrucoTable';
import { TransferModal } from '@/components/payments/TransferModal';
import { WithdrawalModal } from '@/components/payments/WithdrawalModal';

export default function LobbyPage() {
  const [selectedMode, setSelectedMode] = useState<GameMode>('1v1');
  const [florEnabled, setFlorEnabled] = useState(true);
  const [activeMatch, setActiveMatch] = useState<{
    matchId: string;
    mode: GameMode;
    poolTier: PoolTier;
    buyInArs: number;
    isPvp: boolean;
  } | null>(null);

  const [pvpRooms, setPvpRooms] = useState<PvpRoom[]>([]);
  const [queueStatus, setQueueStatus] = useState<{
    mode: GameMode;
    poolTier: PoolTier;
    buyInArs: number;
    queuedCount: number;
    requiredCount: number;
  } | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [reconnectMatch, setReconnectMatch] = useState<{
    matchId: string;
    mode: GameMode;
    poolTier: PoolTier;
    buyInArs: number;
  } | null>(null);

  const [depositTarget, setDepositTarget] = useState<{
    amount: number;
    tier: PoolTier;
  } | null>(null);

  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const [userId, setUserId] = useState('demo-user-cba');
  const [userName, setUserName] = useState('Jugador');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [balanceArs, setBalanceArs] = useState(0);
  const [lockedArs, setLockedArs] = useState(0);
  const [bankSettings, setBankSettings] = useState({
    bank_alias: 'jesus2210.dolarapp',
    bank_cvu: '0000003100084920192837',
    bank_holder: 'Vale Cuatro S.R.L.',
  });

  const [authModal, setAuthModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const supabaseReady = isSupabaseConfigured();

  // Identidad única por pestaña en Modo Demo para probar PvP real entre pestañas
  useEffect(() => {
    if (supabaseReady || typeof window === 'undefined') return;
    let tabId = sessionStorage.getItem('vc_tab_player_id');
    let tabName = sessionStorage.getItem('vc_tab_player_name');
    if (!tabId) {
      const suffix = Math.floor(100 + Math.random() * 900);
      tabId = `player-${Date.now().toString(36)}-${suffix}`;
      tabName = `Jugador #${suffix}`;
      sessionStorage.setItem('vc_tab_player_id', tabId);
      sessionStorage.setItem('vc_tab_player_name', tabName);
    }
    setUserId(tabId);
    setUserName(tabName || 'Jugador');
    setPvpRooms(getPvpRooms());
    return subscribePvpRooms((rooms) => setPvpRooms(rooms));
  }, [supabaseReady]);

  const enterPvpMatch = async (mode: GameMode, poolTier: PoolTier, buyInArs: number) => {
    setQueueError(null);
    if (supabaseReady && buyInArs > 0) {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('join_match_queue', {
        p_mode: mode,
        p_buy_in_tier: poolTier,
      });
      if (error) {
        setQueueError(error.message);
        return;
      }
      if (data?.status === 'matched' && data.match_id) {
        setQueueStatus(null);
        setActiveMatch({
          matchId: data.match_id,
          mode,
          poolTier,
          buyInArs,
          isPvp: true,
        });
        return;
      }
      setQueueStatus({
        mode,
        poolTier,
        buyInArs,
        queuedCount: data?.queued_count ?? 1,
        requiredCount: data?.required_count ?? (mode === '1v1' ? 2 : 6),
      });
      return;
    }

    const room = joinOrCreatePvpRoom({
      mode,
      poolTier,
      buyInArs,
      florEnabled,
      playerId: userId,
      playerName: userName,
    });
    setActiveMatch({
      matchId: room.id,
      mode: room.mode,
      poolTier: room.poolTier,
      buyInArs: room.buyInArs,
      isPvp: true,
    });
  };

  useEffect(() => {
    if (!supabaseReady) return;
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        setUserName(data.user.email?.split('@')[0] || 'Jugador');
        setIsLoggedIn(true);

        const { data: wallet } = await supabase
          .from('wallets')
          .select('balance_ars, locked_ars')
          .eq('user_id', data.user.id)
          .single();

        if (wallet) {
          setBalanceArs(Number(wallet.balance_ars));
          setLockedArs(Number(wallet.locked_ars));
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin, display_name')
          .eq('id', data.user.id)
          .single();

        if (profile) {
          setIsAdmin(Boolean(profile.is_admin));
          if (profile.display_name) setUserName(profile.display_name);
        }

        // Reconexión automática si el jugador tiene una partida activa (<45s)
        const { data: activeSeat } = await supabase
          .from('match_players')
          .select('match_id, matches!inner(id, mode, pool_tier, buy_in_ars, status)')
          .eq('user_id', data.user.id)
          .eq('matches.status', 'playing')
          .limit(1)
          .maybeSingle();

        if (activeSeat?.matches) {
          const m = activeSeat.matches as unknown as {
            id: string;
            mode: GameMode;
            pool_tier: PoolTier;
            buy_in_ars: number;
          };
          setReconnectMatch({
            matchId: m.id,
            mode: m.mode,
            poolTier: m.pool_tier,
            buyInArs: Number(m.buy_in_ars),
          });
        }
      }
    });

    supabase
      .from('app_settings')
      .select('bank_alias, bank_cvu, bank_holder')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (data) setBankSettings(data);
      });

    const queueChannel = supabase
      .channel('my-match-queue')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'match_queues' },
        (payload) => {
          const row = payload.new as {
            user_id: string;
            status: string;
            match_id: string | null;
            mode: GameMode;
            buy_in_tier: PoolTier;
            buy_in_ars: number;
          };
          if (row.user_id === userId && row.status === 'matched' && row.match_id) {
            setQueueStatus(null);
            setActiveMatch({
              matchId: row.match_id,
              mode: row.mode,
              poolTier: row.buy_in_tier,
              buyInArs: Number(row.buy_in_ars),
              isPvp: true,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(queueChannel);
    };
  }, [supabaseReady, userId]);

  const handleAuth = async (isSignUp: boolean) => {
    setAuthError(null);
    const supabase = createClient();
    const res = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (res.error) {
      setAuthError(res.error.message);
      return;
    }
    if (res.data.user) {
      setUserId(res.data.user.id);
      setUserName(res.data.user.email?.split('@')[0] || 'Jugador');
      setIsLoggedIn(true);
      setAuthModal(false);

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin, display_name')
        .eq('id', res.data.user.id)
        .single();
      if (profile) {
        setIsAdmin(Boolean(profile.is_admin));
        if (profile.display_name) setUserName(profile.display_name);
      }
    }
  };

  const handleLogout = async () => {
    if (!supabaseReady) return;
    const supabase = createClient();
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setIsAdmin(false);
    setUserId('demo-user-cba');
    setUserName('Jugador');
  };

  if (activeMatch) {
    return (
      <TrucoTable
        matchId={activeMatch.matchId}
        mode={activeMatch.mode}
        poolTier={activeMatch.poolTier}
        buyInArs={activeMatch.buyInArs}
        florEnabled={florEnabled}
        playerName={userName}
        localPlayerId={userId}
        isPvp={activeMatch.isPvp}
        onExit={() => setActiveMatch(null)}
        onRequestWithdraw={() => {
          setActiveMatch(null);
          setWithdrawOpen(true);
        }}
      />
    );
  }

  const totalSeatsForMode = selectedMode === '1v1' ? 2 : 6;
  const occupiedSeats = selectedMode === '1v1' ? 1 : selectedMode === '3v3' ? 4 : 3;

  return (
    <div className="min-h-screen emerald-canvas text-white relative overflow-x-hidden">
      {/* Visible Fileteado Porteño Viewport Corners (kept away from logo) */}
      <FileteadoCorner variant="emerald" position="tl" className="fixed top-20 left-2 w-16 h-16 sm:w-24 sm:h-24 z-10 opacity-75" />
      <FileteadoCorner variant="emerald" position="tr" className="fixed top-20 right-2 w-16 h-16 sm:w-24 sm:h-24 z-10 opacity-75" />
      <FileteadoCorner variant="gilded" position="bl" className="fixed bottom-2 left-2 w-20 h-20 sm:w-28 sm:h-28 z-10" />
      <FileteadoCorner variant="gilded" position="br" className="fixed bottom-2 right-2 w-20 h-20 sm:w-28 sm:h-28 z-10" />

      {/* Clean Header: Keep accents away from the logo */}
      <header className="sticky top-0 z-30 bg-[#0E3324]/75 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-3.5 flex items-center justify-between gap-3">
          <Wordmark size="md" />

          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link
                href="/admin"
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#164A34]/80 hover:bg-[#1D5C41] border border-[#C9A24B]/50 text-[#F2D283] text-xs font-semibold transition ease-fluid"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#F2D283]" />
                Panel Admin
              </Link>
            )}

            {isLoggedIn ? (
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white hover:bg-[#F5F7F6] text-[#0E3324] text-xs font-bold transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                {userName}
              </button>
            ) : (
              <button
                onClick={() => setAuthModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white hover:bg-[#F5F7F6] text-[#0E3324] text-xs font-bold shadow-sm transition"
              >
                <LogIn className="w-3.5 h-3.5" />
                Ingresar
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-5 sm:px-8 pt-8 pb-16 space-y-10">
        {reconnectMatch && (
          <div className="max-w-3xl mx-auto rounded-3xl bg-gradient-to-r from-[#D9B35F] to-[#F2D283] text-[#0E3324] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 shadow-ambient">
            <div>
              <div className="text-sm font-bold">Tenés una partida en curso</div>
              <div className="text-xs opacity-85">
                Tu silla sigue reservada. Volvé al paño antes de que corra el reloj.
              </div>
            </div>
            <button
              onClick={() => {
                setActiveMatch({ ...reconnectMatch, isPvp: true });
                setReconnectMatch(null);
              }}
              className="px-5 py-2 rounded-full bg-[#0E3324] text-white text-xs font-bold"
            >
              Reconectar ahora
            </button>
          </div>
        )}

        {queueError && (
          <div className="max-w-3xl mx-auto rounded-3xl bg-rose-500/20 border border-rose-400/30 p-4 text-xs text-rose-200 font-medium">
            {queueError}
          </div>
        )}

        {queueStatus && (
          <div className="max-w-3xl mx-auto rounded-3xl bg-[#164A34]/90 border border-[#D9B35F]/50 p-5 flex flex-wrap items-center justify-between gap-3 shadow-ambient">
            <div>
              <div className="text-sm font-bold text-[#F2D283]">
                Buscando mesa {queueStatus.mode.toUpperCase()} ({formatARS(queueStatus.buyInArs)})...
              </div>
              <div className="text-xs text-[#E4E9E6]">
                Jugadores en cola: {queueStatus.queuedCount}/{queueStatus.requiredCount}. Arranca al instante cuando se complete.
              </div>
            </div>
            <button
              onClick={() => setQueueStatus(null)}
              className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-white"
            >
              Cancelar
            </button>
          </div>
        )}
        {/* Conversational Argentine Greeting */}
        <section className="relative text-center max-w-2xl mx-auto space-y-4">
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="text-3xl sm:text-5xl font-bold tracking-[-0.03em] text-white leading-tight"
          >
            ¿Se arma partida?
          </motion.h1>
          <p className="text-sm sm:text-base text-[#9EB3A8] leading-relaxed">
            Elegí tu mesa y entrá al paño. Jugá gratis contra la IA para calentar motores o metete en un pozo en pesos al instante.
          </p>

          {/* Fluid Mode Pills with Flavor Subtitles + Direct Play */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
            {[
              { id: '1v1' as GameMode, label: '1v1 Mano a Mano', sub: 'Sin excusas', icon: Swords },
              { id: '3v3' as GameMode, label: '3v3 En Equipo', sub: 'Con señas y código', icon: Users },
              { id: 'gallo' as GameMode, label: '6 Todos contra Todos', sub: 'Sálvese quien pueda', icon: Crown },
            ].map((m) => {
              const Icon = m.icon;
              const active = selectedMode === m.id;
              const waitingRoom = pvpRooms.find(
                (r) => r.status === 'waiting' && r.mode === m.id && r.poolTier === 'practice'
              );
              const launchMode = () => enterPvpMatch(m.id, 'practice', 0);

              return (
                <div
                  key={m.id}
                  onClick={() => {
                    if (active) {
                      launchMode();
                    } else {
                      setSelectedMode(m.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (active) launchMode();
                      else setSelectedMode(m.id);
                    }
                  }}
                  className={`cursor-pointer flex items-center gap-3 pl-5 pr-2.5 py-2 rounded-full text-left transition-all ease-fluid border ${
                    active
                      ? 'bg-[#154732] text-white border-[#C9A24B] shadow-ambient scale-[1.02]'
                      : 'bg-[#164A34]/70 backdrop-blur-xl text-white border-[#C9A24B]/35 hover:border-[#C9A24B]/70'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 text-[#F2D283]" />
                  <div>
                    <div className="text-xs sm:text-sm font-bold leading-none">{m.label}</div>
                    <div className="text-[10px] mt-0.5 text-[#9EB3A8]">
                      {waitingRoom
                        ? `${waitingRoom.players.length}/${waitingRoom.maxSeats} esperando`
                        : m.sub}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMode(m.id);
                      launchMode();
                    }}
                    className={`ml-1 px-3 py-1.5 rounded-full text-[11px] font-bold transition ${
                      active
                        ? 'bg-[#C9A24B] text-[#0E3324] hover:bg-[#F2D283]'
                        : 'bg-white/10 text-white hover:bg-[#C9A24B] hover:text-[#0E3324]'
                    }`}
                  >
                    Jugar
                  </button>
                </div>
              );
            })}
          </div>

          {/* Practice + Flor Pill Row */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              onClick={() =>
                setActiveMatch({
                  matchId: `practice-bot-${Date.now()}`,
                  mode: selectedMode,
                  poolTier: 'practice',
                  buyInArs: 0,
                  isPvp: false,
                })
              }
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[#D9B35F] to-[#F2D283] hover:opacity-95 text-[#0E3324] font-bold text-sm shadow-ambient transition ease-fluid active:scale-95"
            >
              <Bot className="w-4 h-4" />
              Práctica Solo vs Bots
            </button>

            <label className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#164A34]/75 backdrop-blur-xl border border-white/[0.08] cursor-pointer text-xs font-semibold text-[#E4E9E6]">
              <Flower2 className="w-4 h-4 text-[#F2D283]" />
              <span>Con Flor</span>
              <input
                type="checkbox"
                checked={florEnabled}
                onChange={(e) => setFlorEnabled(e.target.checked)}
                className="accent-[#F2D283] w-3.5 h-3.5"
              />
            </label>
          </div>
          <FileteadoBottomBracket className="w-72 h-7 mx-auto pt-2" />
        </section>

        {/* Frosted Emerald Wallet Pill Card */}
        <section className="max-w-3xl mx-auto">
          <div className="rounded-3xl bg-[#164A34]/75 backdrop-blur-xl border border-white/[0.08] p-5 sm:p-6 shadow-ambient flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-[#F2D283]">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-medium text-[#9EB3A8]">
                  Tu Billetera ARS • {userName}
                </div>
                <div className="flex items-baseline gap-3 mt-0.5">
                  <span className="text-2xl font-bold tracking-tight text-white tabular-nums">
                    {formatARS(balanceArs)}
                  </span>
                  <span className="text-xs text-[#9EB3A8] tabular-nums">
                    En pozo: <strong className="text-[#F2D283]">{formatARS(lockedArs)}</strong>
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setWithdrawOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white hover:bg-[#F5F7F6] text-xs font-bold text-[#0E3324] transition shrink-0"
            >
              <ArrowDownToLine className="w-4 h-4" />
              Retirar CBU / CVU
            </button>
          </div>
          <FileteadoBottomBracket className="w-72 h-7 mx-auto pt-2" />
        </section>

        {/* Frosted Emerald-Slate Pool Wrapper + Double-Line Gold Pinstripe Cards */}
        <section className="space-y-4">
          <div className="rounded-3xl bg-[#164231]/65 backdrop-blur-md p-5 sm:p-6 shadow-ambient space-y-5 border border-white/[0.06]">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-bold tracking-tight text-white">
                Mesas por Dinero Real
              </h2>
              <span className="text-xs text-[#9EB3A8]">
                Transferencia Bancaria con chequeo en vivo
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {POOL_TIERS.map((tier, idx) => {
                const isHighStakes = tier.amount >= 50000;
                return (
                  <motion.div
                    key={tier.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05, duration: 0.3 }}
                    whileHover={{ y: -4 }}
                    className="relative overflow-hidden rounded-3xl p-6 flex flex-col justify-between transition shadow-ambient bg-[#154732]/85 border border-[#C9A24B]/60"
                  >
                    {/* Inner fine gold double-line pinstripe */}
                    <div className="pointer-events-none absolute inset-1.5 rounded-[20px] border border-[#C9A24B]/35" />
                    {/* Microscopic corner scroll curls */}
                    <FileteadoCardFiligree position="tl" className="absolute top-1 left-1 w-4 h-4" />
                    <FileteadoCardFiligree position="tr" className="absolute top-1 right-1 w-4 h-4" />
                    <FileteadoCardFiligree position="bl" className="absolute bottom-1 left-1 w-4 h-4" />
                    <FileteadoCardFiligree position="br" className="absolute bottom-1 right-1 w-4 h-4" />

                    {/* Top & bottom centered 3-dot perlita accents */}
                    <div className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-[#C9A24B]/70" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F2D283]" />
                      <span className="w-1 h-1 rounded-full bg-[#C9A24B]/70" />
                    </div>
                    <div className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-[#C9A24B]/70" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F2D283]" />
                      <span className="w-1 h-1 rounded-full bg-[#C9A24B]/70" />
                    </div>

                    <div className="relative z-10">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[11px] font-semibold px-3 py-1 rounded-full ${
                            isHighStakes
                              ? 'bg-gradient-to-r from-[#D9B35F] to-[#F2D283] text-[#0E3324]'
                              : 'bg-white/10 text-[#E4E9E6]'
                          }`}
                        >
                          {tier.badge}
                        </span>

                        <div className="flex items-center gap-1" title="Asientos ocupados">
                          {Array.from({ length: totalSeatsForMode }).map((_, i) => (
                            <span
                              key={i}
                              className={`w-1.5 h-1.5 rounded-full ${
                                i < occupiedSeats ? 'bg-[#F2D283]' : 'bg-white/20'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="text-2xl font-bold tracking-tight text-white mt-4 tabular-nums">
                        {tier.label}
                      </div>
                      <p className="text-xs text-[#9EB3A8] mt-1.5 leading-relaxed">
                        {tier.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDepositTarget({ amount: tier.amount, tier: tier.id })}
                      className={`relative z-10 mt-6 w-full py-2.5 rounded-full font-bold text-xs transition ease-fluid border ${
                        isHighStakes
                          ? 'bg-gradient-to-r from-[#D9B35F] to-[#F2D283] border-[#F2D283] hover:opacity-95 text-[#0E3324]'
                          : 'bg-[#0E3324] hover:bg-[#1D5C41] border-[#C9A24B]/55 text-white'
                      }`}
                    >
                      Unirse / Depositar
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
          <FileteadoBottomBracket className="w-72 h-9 mx-auto" />
        </section>

        {/* Bottom Centered Logo (same size as top-left header logo) */}
        <footer className="pt-4 pb-2 flex justify-center">
          <Wordmark size="md" />
        </footer>
      </main>

      {depositTarget && (
        <TransferModal
          open={true}
          onClose={() => setDepositTarget(null)}
          amountArs={depositTarget.amount}
          poolTier={depositTarget.tier}
          gameMode={selectedMode}
          userId={userId}
          userName={userName}
          bankAlias={bankSettings.bank_alias}
          bankCvu={bankSettings.bank_cvu}
          bankHolder={bankSettings.bank_holder}
          onApprovedPlay={() => {
            const amt = depositTarget.amount;
            const t = depositTarget.tier;
            setDepositTarget(null);
            enterPvpMatch(selectedMode, t, amt);
          }}
        />
      )}

      <WithdrawalModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        availableBalance={balanceArs}
        userId={userId}
      />

      {authModal && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#164A34]/95 backdrop-blur-xl border border-white/[0.12] rounded-[28px] max-w-sm w-full p-7 space-y-4 shadow-ambient">
            <div className="text-center">
              <Wordmark size="md" />
              <p className="text-xs text-[#9EB3A8] mt-1">Ingresá con tu cuenta</p>
            </div>
            <input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl bg-white text-[#1A1D1B] text-sm outline-none"
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl bg-white text-[#1A1D1B] text-sm outline-none"
            />
            {authError && <p className="text-xs text-rose-200 font-medium">{authError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => handleAuth(false)}
                className="flex-1 py-2.5 rounded-full bg-white text-[#0E3324] font-bold text-xs"
              >
                Iniciar Sesión
              </button>
              <button
                onClick={() => handleAuth(true)}
                className="flex-1 py-2.5 rounded-full bg-white/15 text-white font-semibold text-xs"
              >
                Registrarse
              </button>
            </div>
            <button
              onClick={() => setAuthModal(false)}
              className="w-full text-xs text-[#9EB3A8] hover:text-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
