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
  LogOut,
  ArrowDownToLine,
  Flower2,
  BookOpen,
  ArrowLeft,
} from 'lucide-react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { formatARS, POOL_TIERS } from '@/lib/format';
import { GameMode, PoolTier } from '@/lib/truco/types';
import { Wordmark } from '@/components/Wordmark';
import {
  FileteadoBottomBracket,
  FileteadoCardFiligree,
  FileteadoCorner,
} from '@/components/FileteadoAccents';
import { TrucoTable } from '@/components/truco/TrucoTable';
import { RulesModal } from '@/components/truco/RulesModal';
import { TransferModal } from '@/components/payments/TransferModal';
import { WithdrawalModal } from '@/components/payments/WithdrawalModal';

const MODE_LABELS: Record<GameMode, { title: string; sub: string; seats: number }> = {
  '1v1': { title: '1v1 Mano a Mano', sub: 'Sin excusas', seats: 2 },
  '3v3': { title: '3v3 En Equipo', sub: 'Con señas y código', seats: 6 },
  gallo: { title: '6 Todos contra Todos', sub: 'Sálvese quien pueda', seats: 6 },
};

export default function LobbyPage() {
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null);
  const [florEnabled, setFlorEnabled] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(false);

  const [activeMatch, setActiveMatch] = useState<{
    matchId: string;
    mode: GameMode;
    poolTier: PoolTier;
    buyInArs: number;
    isPvp: boolean;
  } | null>(null);

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

  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('Jugador');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const [balanceArs, setBalanceArs] = useState(0);
  const [lockedArs, setLockedArs] = useState(0);
  const [bankSettings, setBankSettings] = useState({
    bank_alias: 'jesus2210.dolarapp',
    bank_cvu: '0000003100084920192837',
    bank_holder: 'Vale Cuatro S.R.L.',
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const supabaseReady = isSupabaseConfigured();

  const hydrateUser = async (uid: string, fallbackEmail?: string) => {
    const supabase = createClient();
    setUserId(uid);
    setUserName(fallbackEmail?.split('@')[0] || 'Jugador');
    setIsLoggedIn(true);

    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance_ars, locked_ars')
      .eq('user_id', uid)
      .single();

    if (wallet) {
      setBalanceArs(Number(wallet.balance_ars));
      setLockedArs(Number(wallet.locked_ars));
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin, display_name')
      .eq('id', uid)
      .single();

    if (profile) {
      setIsAdmin(Boolean(profile.is_admin));
      if (profile.display_name) setUserName(profile.display_name);
    }

    const { data: activeSeat } = await supabase
      .from('match_players')
      .select('match_id, matches!inner(id, mode, pool_tier, buy_in_ars, status)')
      .eq('user_id', uid)
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
  };

  useEffect(() => {
    if (!supabaseReady) {
      setAuthLoading(false);
      return;
    }
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        await hydrateUser(data.user.id, data.user.email);
      }
      setAuthLoading(false);
    });

    supabase
      .from('app_settings')
      .select('bank_alias, bank_cvu, bank_holder')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (data) setBankSettings(data);
      });
  }, [supabaseReady]);

  // Realtime subscriptions for matchmaking queue & wallet updates
  useEffect(() => {
    if (!supabaseReady || !userId) return;
    const supabase = createClient();

    const queueChannel = supabase
      .channel(`my-match-queue-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'match_queues',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            status: string;
            match_id: string | null;
            mode: GameMode;
            buy_in_tier: PoolTier;
            buy_in_ars: number;
          };
          if (row.status === 'matched' && row.match_id) {
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

    const walletChannel = supabase
      .channel(`my-wallet-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const w = payload.new as { balance_ars?: number; locked_ars?: number };
          if (w.balance_ars !== undefined) setBalanceArs(Number(w.balance_ars));
          if (w.locked_ars !== undefined) setLockedArs(Number(w.locked_ars));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(queueChannel);
      supabase.removeChannel(walletChannel);
    };
  }, [supabaseReady, userId]);

  // Mobile-safe fallback poll while waiting in queue so two phones always connect
  useEffect(() => {
    if (!queueStatus || !supabaseReady || !userId) return;
    const supabase = createClient();
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('match_queues')
        .select('status, match_id, mode, buy_in_tier, buy_in_ars')
        .eq('user_id', userId)
        .eq('status', 'matched')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.match_id) {
        setQueueStatus(null);
        setActiveMatch({
          matchId: data.match_id,
          mode: data.mode as GameMode,
          poolTier: data.buy_in_tier as PoolTier,
          buyInArs: Number(data.buy_in_ars),
          isPvp: true,
        });
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [queueStatus, supabaseReady, userId]);

  const enterPvpMatch = async (mode: GameMode, poolTier: PoolTier, buyInArs: number) => {
    setQueueError(null);
    if (!supabaseReady) {
      setQueueError('Falta configurar la conexión con Supabase.');
      return;
    }

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
  };

  const handleCancelQueue = async () => {
    setQueueStatus(null);
    if (!supabaseReady || !userId) return;
    const supabase = createClient();
    await supabase
      .from('match_queues')
      .update({ status: 'cancelled' })
      .eq('user_id', userId)
      .eq('status', 'waiting');
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);
    setAuthSubmitting(true);

    try {
      const supabase = createClient();
      const res = isSignUpMode
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo:
                typeof window !== 'undefined' ? window.location.origin : undefined,
            },
          })
        : await supabase.auth.signInWithPassword({ email, password });

      if (res.error) {
        setAuthError(res.error.message);
        return;
      }
      if (isSignUpMode && res.data.user && !res.data.session) {
        setAuthNotice('¡Cuenta creada! Revisá tu email para confirmarla y luego iniciá sesión.');
        return;
      }
      if (res.data.user) {
        await hydrateUser(res.data.user.id, res.data.user.email);
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (!supabaseReady) return;
    const supabase = createClient();
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setIsAdmin(false);
    setSelectedMode(null);
    setUserId('');
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

  const chosenModeInfo = selectedMode ? MODE_LABELS[selectedMode] : null;

  return (
    <div className="min-h-screen emerald-canvas text-white relative overflow-x-hidden">
      {/* Visible Fileteado Porteño Viewport Corners */}
      <FileteadoCorner variant="emerald" position="tl" className="fixed top-20 left-2 w-16 h-16 sm:w-24 sm:h-24 z-10 opacity-75" />
      <FileteadoCorner variant="emerald" position="tr" className="fixed top-20 right-2 w-16 h-16 sm:w-24 sm:h-24 z-10 opacity-75" />
      <FileteadoCorner variant="gilded" position="bl" className="fixed bottom-2 left-2 w-20 h-20 sm:w-28 sm:h-28 z-10" />
      <FileteadoCorner variant="gilded" position="br" className="fixed bottom-2 right-2 w-20 h-20 sm:w-28 sm:h-28 z-10" />

      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0E3324]/75 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-3.5 flex items-center justify-between gap-3">
          <Wordmark size="md" />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#164A34]/80 hover:bg-[#1D5C41] border border-white/[0.1] text-[#E4E9E6] text-xs font-semibold transition"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#F2D283]" />
              Reglamento
            </button>

            {isAdmin && (
              <Link
                href="/admin"
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#164A34]/80 hover:bg-[#1D5C41] border border-[#C9A24B]/50 text-[#F2D283] text-xs font-semibold transition"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#F2D283]" />
                Panel Admin
              </Link>
            )}

            {isLoggedIn && (
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white hover:bg-[#F5F7F6] text-[#0E3324] text-xs font-bold transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                {userName}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-5 sm:px-8 pt-8 pb-16 space-y-10">
        {authLoading ? (
          <div className="py-16 text-center text-sm text-[#9EB3A8]">
            Cargando tu cuenta...
          </div>
        ) : !isLoggedIn ? (
          /* STEP 1: MUST CREATE AN ACCOUNT / SIGN IN TO PLAY */
          <section className="max-w-md mx-auto">
            <div className="rounded-3xl bg-[#164A34]/85 backdrop-blur-xl border border-[#C9A24B]/45 p-7 sm:p-8 shadow-ambient space-y-5">
              <div className="text-center space-y-1.5">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  {isSignUpMode ? 'Creá tu cuenta' : '¿Se arma partida?'}
                </h1>
                <p className="text-xs sm:text-sm text-[#9EB3A8]">
                  {isSignUpMode
                    ? 'Registrate en segundos para elegir tu mesa y jugar.'
                    : 'Iniciá sesión para elegir mesa, jugar gratis o competir por pozos en ARS.'}
                </p>
              </div>

              <form onSubmit={handleAuth} className="space-y-3">
                <input
                  type="email"
                  required
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-white text-[#1A1D1B] text-sm outline-none"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Contraseña (mínimo 6 caracteres)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-white text-[#1A1D1B] text-sm outline-none"
                />
                {authError && <p className="text-xs text-rose-200 font-medium">{authError}</p>}
                {authNotice && <p className="text-xs text-[#F2D283] font-medium">{authNotice}</p>}
                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full py-3 rounded-full bg-gradient-to-r from-[#D9B35F] to-[#F2D283] text-[#0E3324] font-bold text-sm shadow-ambient transition"
                >
                  {authSubmitting
                    ? 'Procesando...'
                    : isSignUpMode
                    ? 'Crear Cuenta'
                    : 'Iniciar Sesión'}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setIsSignUpMode((v) => !v);
                  setAuthError(null);
                  setAuthNotice(null);
                }}
                className="w-full text-center text-xs text-[#F2D283] hover:underline font-medium"
              >
                {isSignUpMode
                  ? '¿Ya tenés cuenta? Iniciá sesión'
                  : '¿No tenés cuenta? Registrate gratis'}
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* Reconnect Banner */}
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
                    Buscando rival en {MODE_LABELS[queueStatus.mode].title} (
                    {queueStatus.buyInArs > 0 ? formatARS(queueStatus.buyInArs) : 'Gratis'})...
                  </div>
                  <div className="text-xs text-[#E4E9E6]">
                    Jugadores listos: {queueStatus.queuedCount}/{queueStatus.requiredCount}. La partida arranca automáticamente cuando entren todos.
                  </div>
                </div>
                <button
                  onClick={handleCancelQueue}
                  className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-white"
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* STEP 2: CHOOSE A TABLE */}
            {!selectedMode ? (
              <section className="text-center max-w-3xl mx-auto space-y-6">
                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-3xl sm:text-5xl font-bold tracking-[-0.03em] text-white leading-tight"
                >
                  Elegí tu mesa
                </motion.h1>
                <p className="text-sm sm:text-base text-[#9EB3A8]">
                  Seleccioná la modalidad para ver los pozos disponibles o jugar gratis contra otros jugadores.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  {(
                    [
                      { id: '1v1' as GameMode, icon: Swords },
                      { id: '3v3' as GameMode, icon: Users },
                      { id: 'gallo' as GameMode, icon: Crown },
                    ] as const
                  ).map(({ id, icon: Icon }) => {
                    const info = MODE_LABELS[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSelectedMode(id)}
                        className="rounded-3xl p-6 bg-[#154732]/85 hover:bg-[#1D5C41] border border-[#C9A24B]/55 text-left transition shadow-ambient flex flex-col justify-between gap-4"
                      >
                        <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center text-[#F2D283]">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-lg font-bold text-white">{info.title}</div>
                          <div className="text-xs text-[#9EB3A8] mt-1">
                            {info.sub} • {info.seats} jugadores
                          </div>
                        </div>
                        <span className="inline-block self-start px-4 py-1.5 rounded-full bg-[#C9A24B] text-[#0E3324] text-xs font-bold">
                          Elegir mesa →
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : (
              /* STEP 3: SHOW CHOSEN TABLE + REAL MONEY POOLS + FREE PVP */
              <>
                <section className="max-w-3xl mx-auto rounded-3xl bg-[#154732]/85 border border-[#C9A24B]/50 p-5 sm:p-6 shadow-ambient flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedMode(null)}
                      className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
                      title="Cambiar mesa"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-[#F2D283] font-semibold">
                        Mesa elegida
                      </div>
                      <h1 className="text-xl sm:text-2xl font-bold text-white">
                        {chosenModeInfo?.title}{' '}
                        <span className="text-xs font-normal text-[#9EB3A8]">
                          ({chosenModeInfo?.seats} jugadores)
                        </span>
                      </h1>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#0E3324]/70 border border-white/[0.1] cursor-pointer text-xs font-semibold text-[#E4E9E6]">
                      <Flower2 className="w-3.5 h-3.5 text-[#F2D283]" />
                      <span>Con Flor</span>
                      <input
                        type="checkbox"
                        checked={florEnabled}
                        onChange={(e) => setFlorEnabled(e.target.checked)}
                        className="accent-[#F2D283] w-3.5 h-3.5"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => enterPvpMatch(selectedMode, 'practice', 0)}
                      className="px-4 py-2 rounded-full bg-white text-[#0E3324] font-bold text-xs shadow-sm transition"
                    >
                      Jugar Gratis PvP
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setActiveMatch({
                          matchId: `practice-bot-${Date.now()}`,
                          mode: selectedMode,
                          poolTier: 'practice',
                          buyInArs: 0,
                          isPvp: false,
                        })
                      }
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition"
                    >
                      <Bot className="w-3.5 h-3.5 text-[#F2D283]" />
                      Solo vs Bots
                    </button>
                  </div>
                </section>

                {/* Wallet Card */}
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
                </section>

                {/* Mesas por Dinero Real */}
                <section className="space-y-4">
                  <div className="rounded-3xl bg-[#164231]/65 backdrop-blur-md p-5 sm:p-6 shadow-ambient space-y-5 border border-white/[0.06]">
                    <div className="flex items-center justify-between px-1">
                      <h2 className="text-lg font-bold tracking-tight text-white">
                        Mesas por Dinero Real — {chosenModeInfo?.title}
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
                            <div className="pointer-events-none absolute inset-1.5 rounded-[20px] border border-[#C9A24B]/35" />
                            <FileteadoCardFiligree position="tl" className="absolute top-1 left-1 w-4 h-4" />
                            <FileteadoCardFiligree position="tr" className="absolute top-1 right-1 w-4 h-4" />
                            <FileteadoCardFiligree position="bl" className="absolute bottom-1 left-1 w-4 h-4" />
                            <FileteadoCardFiligree position="br" className="absolute bottom-1 right-1 w-4 h-4" />

                            <div className="relative z-10">
                              <span
                                className={`inline-block text-[11px] font-semibold px-3 py-1 rounded-full ${
                                  isHighStakes
                                    ? 'bg-gradient-to-r from-[#D9B35F] to-[#F2D283] text-[#0E3324]'
                                    : 'bg-white/10 text-[#E4E9E6]'
                                }`}
                              >
                                {tier.badge}
                              </span>

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
              </>
            )}
          </>
        )}

        <footer className="pt-4 pb-2 flex justify-center">
          <Wordmark size="md" />
        </footer>
      </main>

      {depositTarget && selectedMode && (
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

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
