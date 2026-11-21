'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  FileImage,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Building2,
  ArrowDownToLine,
  LogOut,
  Trash2,
} from 'lucide-react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { TransferRequestRecord } from '@/lib/demo-store';
import { formatARS } from '@/lib/format';
import { Wordmark } from '@/components/Wordmark';

interface WithdrawalRecord {
  id: string;
  user_id: string;
  user_name: string;
  amount_ars: number;
  destination_cbu_cvu: string;
  destination_alias: string | null;
  status: 'pending' | 'paid' | 'rejected';
  created_at: string;
}

interface AdminUserRecord {
  id: string;
  username: string;
  display_name: string;
  is_admin: boolean;
}

export default function AdminGreenlightPage() {
  const [tab, setTab] = useState<'transfers' | 'withdrawals' | 'settings'>('transfers');
  const [requests, setRequests] = useState<TransferRequestRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [admins, setAdmins] = useState<AdminUserRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentEmail, setCurrentEmail] = useState('');

  // Login / Sign-up state for operators visiting /admin directly
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);

  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Bank & Commission settings
  const [bankAlias, setBankAlias] = useState('jesus2210.dolarapp');
  const [bankCvu, setBankCvu] = useState('0000003100084920192837');
  const [bankHolder, setBankHolder] = useState('Vale Cuatro S.R.L.');
  const [commissionPct, setCommissionPct] = useState('8');

  // Add new admin by email
  const [newAdminEmail, setNewAdminEmail] = useState('');

  const supabaseReady = isSupabaseConfigured();

  const loadAllAdminData = async () => {
    if (!supabaseReady) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    const supabase = createClient();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setIsLoggedIn(false);
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    setIsLoggedIn(true);
    setCurrentEmail(authData.user.email || '');

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', authData.user.id)
      .single();

    if (!profile?.is_admin) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    setIsAdmin(true);

    // 1. Transferencias
    const { data: txData, error: txErr } = await supabase
      .from('transfer_requests')
      .select('*, profiles!transfer_requests_user_id_fkey(display_name)')
      .order('created_at', { ascending: false });

    if (txErr) setErrorMsg(txErr.message);

    const mappedTx: TransferRequestRecord[] = (txData || []).map(
      (row: Record<string, unknown>) => ({
        id: row.id as string,
        user_id: row.user_id as string,
        user_name:
          ((row.profiles as { display_name?: string } | null)?.display_name) ||
          'Jugador',
        amount_ars: Number(row.amount_ars),
        pool_tier: row.pool_tier as TransferRequestRecord['pool_tier'],
        game_mode: row.game_mode as TransferRequestRecord['game_mode'],
        reference_code: row.reference_code as string,
        receipt_url: row.receipt_url as string,
        status: row.status as TransferRequestRecord['status'],
        rejection_reason: row.rejection_reason as string | null,
        match_id: row.match_id as string | null,
        created_at: row.created_at as string,
      })
    );
    setRequests(mappedTx);

    const urls: Record<string, string> = {};
    for (const r of mappedTx) {
      if (r.receipt_url && !r.receipt_url.startsWith('data:') && !r.receipt_url.startsWith('demo://')) {
        const { data: signed } = await supabase.storage
          .from('comprobantes')
          .createSignedUrl(r.receipt_url, 3600);
        if (signed?.signedUrl) urls[r.id] = signed.signedUrl;
      }
    }
    setSignedUrls(urls);

    // 2. Retiros
    const { data: wData } = await supabase
      .from('withdrawal_requests')
      .select('*, profiles!withdrawal_requests_user_id_fkey(display_name)')
      .order('created_at', { ascending: false });

    setWithdrawals(
      (wData || []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        user_id: row.user_id as string,
        user_name:
          ((row.profiles as { display_name?: string } | null)?.display_name) ||
          'Jugador',
        amount_ars: Number(row.amount_ars),
        destination_cbu_cvu: row.destination_cbu_cvu as string,
        destination_alias: (row.destination_alias as string | null) ?? null,
        status: row.status as WithdrawalRecord['status'],
        created_at: row.created_at as string,
      }))
    );

    // 3. Configuración bancaria y lista de admins
    const { data: settings } = await supabase
      .from('app_settings')
      .select('bank_alias, bank_cvu, bank_holder, commission_rate')
      .eq('id', 1)
      .single();

    if (settings) {
      setBankAlias(settings.bank_alias);
      setBankCvu(settings.bank_cvu);
      setBankHolder(settings.bank_holder);
      setCommissionPct(String(Math.round(Number(settings.commission_rate) * 100)));
    }

    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, is_admin')
      .eq('is_admin', true)
      .order('created_at', { ascending: true });

    setAdmins((adminProfiles as AdminUserRecord[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadAllAdminData();
    if (!supabaseReady) return;

    const supabase = createClient();
    const channel = supabase
      .channel('admin-console-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transfer_requests' },
        () => loadAllAdminData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'withdrawal_requests' },
        () => loadAllAdminData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabaseReady]);

  const handleOperatorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginNotice(null);
    const supabase = createClient();

    if (isSignUpMode) {
      const { data, error } = await supabase.auth.signUp({
        email: loginEmail,
        password: loginPassword,
        options: {
          emailRedirectTo:
            typeof window !== 'undefined' ? `${window.location.origin}/admin` : undefined,
        },
      });
      if (error) {
        setLoginError(error.message);
        return;
      }
      if (data.user && !data.session) {
        setLoginNotice(
          '¡Cuenta creada! Confirmá tu email y pedile al administrador principal que habilite tu correo como operador.'
        );
        return;
      }
      await loadAllAdminData();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    if (error) {
      setLoginError(error.message);
      return;
    }
    await loadAllAdminData();
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setIsAdmin(false);
  };

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    setErrorMsg(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('approve_transfer_request', {
        p_request_id: id,
      });
      if (error) throw error;
      setSuccessMsg('Transferencia aprobada y asiento acreditado.');
      await loadAllAdminData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al aprobar');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    setErrorMsg(null);
    const reason = rejectReason[id] || 'Comprobante ilegible o no acreditado';
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('reject_transfer_request', {
        p_request_id: id,
        p_reason: reason,
      });
      if (error) throw error;
      setSuccessMsg('Transferencia rechazada.');
      await loadAllAdminData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al rechazar');
    } finally {
      setProcessingId(null);
    }
  };

  const handleWithdrawal = async (id: string, status: 'paid' | 'rejected') => {
    setProcessingId(id);
    setErrorMsg(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('admin_process_withdrawal', {
        p_withdrawal_id: id,
        p_status: status,
      });
      if (error) throw error;
      setSuccessMsg(status === 'paid' ? 'Retiro marcado como pagado.' : 'Retiro rechazado.');
      await loadAllAdminData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al procesar retiro');
    } finally {
      setProcessingId(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const supabase = createClient();
      const rate = Math.min(0.3, Math.max(0, Number(commissionPct) / 100));
      const { error } = await supabase
        .from('app_settings')
        .update({
          bank_alias: bankAlias.trim(),
          bank_cvu: bankCvu.trim(),
          bank_holder: bankHolder.trim(),
          commission_rate: rate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
      if (error) throw error;
      setSuccessMsg('Datos bancarios y comisión actualizados.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al guardar configuración');
    }
  };

  const handleGrantAdmin = async (email: string, makeAdmin: boolean) => {
    if (!email.trim()) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('admin_set_user_role', {
        p_email: email.trim(),
        p_is_admin: makeAdmin,
      });
      if (error) throw error;
      setNewAdminEmail('');
      setSuccessMsg(
        makeAdmin
          ? `Permiso de operador otorgado a ${email}.`
          : `Permiso de operador revocado.`
      );
      await loadAllAdminData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo actualizar el operador');
    }
  };

  const pendingTransfersCount = requests.filter((r) => r.status === 'pending').length;
  const pendingWithdrawalsCount = withdrawals.filter((w) => w.status === 'pending').length;

  return (
    <div className="min-h-screen emerald-canvas text-white">
      <header className="bg-[#0E3324]/80 backdrop-blur-xl border-b border-white/[0.08] sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-full bg-[#164A34]/80 hover:bg-[#1D5C41] border border-white/[0.08] text-white transition"
              title="Volver al Juego"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <Wordmark size="sm" />
            <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-[#164A34]/75 border border-[#C9A24B]/40 text-[#F2D283] font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              Modo Operador
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={loadAllAdminData}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#164A34]/80 hover:bg-[#1D5C41] border border-white/[0.08] text-xs font-semibold transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Actualizar
              </button>
            )}
            {isLoggedIn && (
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-[#0E3324] text-xs font-bold transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                Salir
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-8 space-y-6">
        {errorMsg && (
          <div className="rounded-3xl bg-rose-500/20 border border-rose-400/30 p-4 text-xs text-rose-200 font-medium">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="rounded-3xl bg-[#164A34] border border-[#C9A24B]/50 p-4 text-xs text-[#F2D283] font-medium">
            {successMsg}
          </div>
        )}

        {!supabaseReady ? (
          <div className="rounded-3xl bg-[#164A34]/80 border border-white/[0.1] p-8 text-center space-y-2">
            <h2 className="text-lg font-bold">Variables de Supabase requeridas</h2>
            <p className="text-xs text-[#9EB3A8]">
              Configurá <code>NEXT_PUBLIC_SUPABASE_URL</code> y <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> para habilitar el panel de operadores.
            </p>
          </div>
        ) : loading ? (
          <div className="text-center py-12 text-sm text-[#9EB3A8]">
            Verificando permisos de operador...
          </div>
        ) : !isLoggedIn ? (
          <div className="max-w-sm mx-auto rounded-3xl bg-[#164A34]/85 backdrop-blur-xl border border-[#C9A24B]/40 p-7 space-y-4 shadow-ambient">
            <div className="text-center space-y-1">
              <ShieldCheck className="w-9 h-9 text-[#F2D283] mx-auto" />
              <h2 className="text-xl font-bold">
                {isSignUpMode ? 'Crear Cuenta de Operador' : 'Acceso Operadores'}
              </h2>
              <p className="text-xs text-[#9EB3A8]">
                {isSignUpMode
                  ? 'Registrate y luego pedile al administrador que habilite tu acceso.'
                  : 'Ingresá con tu cuenta autorizada como administrador.'}
              </p>
            </div>
            <form onSubmit={handleOperatorLogin} className="space-y-3">
              <input
                type="email"
                required
                placeholder="operador@email.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-white text-[#1A1D1B] text-sm outline-none"
              />
              <input
                type="password"
                required
                placeholder="Contraseña"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-white text-[#1A1D1B] text-sm outline-none"
              />
              {loginError && <p className="text-xs text-rose-200">{loginError}</p>}
              {loginNotice && <p className="text-xs text-[#F2D283]">{loginNotice}</p>}
              <button
                type="submit"
                className="w-full py-3 rounded-full bg-gradient-to-r from-[#D9B35F] to-[#F2D283] text-[#0E3324] font-bold text-sm"
              >
                {isSignUpMode ? 'Crear Cuenta' : 'Ingresar al Panel'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                setIsSignUpMode((v) => !v);
                setLoginError(null);
                setLoginNotice(null);
              }}
              className="w-full text-center text-xs text-[#F2D283] hover:underline font-medium"
            >
              {isSignUpMode
                ? '¿Ya tenés cuenta? Iniciar sesión'
                : '¿Nuevo operador? Crear cuenta'}
            </button>
          </div>
        ) : !isAdmin ? (
          <div className="rounded-3xl bg-[#164A34]/80 border border-white/[0.1] p-10 text-center space-y-3 shadow-ambient">
            <XCircle className="w-10 h-10 text-rose-300 mx-auto" />
            <h2 className="text-lg font-bold">Solo Operadores Autorizados</h2>
            <p className="text-xs text-[#9EB3A8] max-w-md mx-auto">
              La cuenta <strong>{currentEmail}</strong> es una cuenta de jugador. Si necesitás acceso de operador, pedile al dueño que te habilite desde este panel.
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-2.5 rounded-full bg-white text-[#0E3324] text-xs font-bold"
            >
              Volver al Juego
            </Link>
          </div>
        ) : (
          <>
            {/* Navigation Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setTab('transfers')}
                className={`px-5 py-2.5 rounded-full text-xs font-bold transition border ${
                  tab === 'transfers'
                    ? 'bg-white text-[#0E3324] border-white'
                    : 'bg-[#164A34]/75 text-white border-[#C9A24B]/35 hover:border-[#C9A24B]'
                }`}
              >
                Transferencias ({pendingTransfersCount} pendientes)
              </button>
              <button
                onClick={() => setTab('withdrawals')}
                className={`px-5 py-2.5 rounded-full text-xs font-bold transition border ${
                  tab === 'withdrawals'
                    ? 'bg-white text-[#0E3324] border-white'
                    : 'bg-[#164A34]/75 text-white border-[#C9A24B]/35 hover:border-[#C9A24B]'
                }`}
              >
                Retiros CBU/CVU ({pendingWithdrawalsCount})
              </button>
              <button
                onClick={() => setTab('settings')}
                className={`px-5 py-2.5 rounded-full text-xs font-bold transition border ${
                  tab === 'settings'
                    ? 'bg-white text-[#0E3324] border-white'
                    : 'bg-[#164A34]/75 text-white border-[#C9A24B]/35 hover:border-[#C9A24B]'
                }`}
              >
                Equipo Admin &amp; Banco
              </button>
            </div>

            {/* Tab 1: Transferencias */}
            {tab === 'transfers' && (
              requests.length === 0 ? (
                <div className="rounded-3xl bg-[#164A34]/75 border border-white/[0.08] p-12 text-center space-y-2">
                  <Clock className="w-10 h-10 text-[#F2D283] mx-auto" />
                  <h2 className="text-base font-semibold">Todavía no cayó ninguna transferencia</h2>
                  <p className="text-xs text-[#9EB3A8]">
                    Apenas un jugador avise que transfirió, aparece acá al instante.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {requests.map((req) => {
                    const previewSrc = signedUrls[req.id] || null;
                    return (
                      <div
                        key={req.id}
                        className="rounded-3xl bg-white text-[#1A1D1B] p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 shadow-ambient"
                      >
                        <div className="flex items-start gap-4 flex-1">
                          <div className="w-24 h-24 rounded-2xl bg-[#F5F7F6] flex items-center justify-center overflow-hidden shrink-0">
                            {previewSrc ? (
                              <a href={previewSrc} target="_blank" rel="noreferrer" className="w-full h-full">
                                <img
                                  src={previewSrc}
                                  alt={`Comprobante ${req.reference_code}`}
                                  className="w-full h-full object-cover"
                                />
                              </a>
                            ) : (
                              <FileImage className="w-7 h-7 text-[#5F6368]" />
                            )}
                          </div>

                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono font-bold text-[#0E3324] text-sm tabular-nums">
                                {req.reference_code}
                              </span>
                              <span
                                className={`text-[11px] font-semibold px-3 py-0.5 rounded-full ${
                                  req.status === 'approved'
                                    ? 'bg-[#E8F3EE] text-[#0E3324]'
                                    : req.status === 'rejected'
                                    ? 'bg-rose-50 text-rose-700'
                                    : 'bg-[#FEF3C7] text-[#92400E]'
                                }`}
                              >
                                {req.status}
                              </span>
                              <span className="text-xs text-[#5F6368] tabular-nums">
                                {new Date(req.created_at).toLocaleString('es-AR')}
                              </span>
                            </div>

                            <div className="text-base font-bold text-[#1A1D1B] tabular-nums">
                              {req.user_name} —{' '}
                              <span className="text-[#154732]">{formatARS(req.amount_ars)}</span>
                            </div>
                            <div className="text-xs text-[#5F6368]">
                              Pozo: <strong className="tabular-nums">${req.pool_tier}</strong> • Modo:{' '}
                              <strong className="uppercase">{req.game_mode}</strong>
                            </div>
                            {req.rejection_reason && (
                              <div className="text-xs text-rose-600">
                                Motivo rechazo: {req.rejection_reason}
                              </div>
                            )}
                          </div>
                        </div>

                        {req.status === 'pending' && (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
                            <input
                              type="text"
                              placeholder="Motivo si se rechaza..."
                              value={rejectReason[req.id] || ''}
                              onChange={(e) =>
                                setRejectReason((prev) => ({ ...prev, [req.id]: e.target.value }))
                              }
                              className="px-4 py-2.5 rounded-full bg-[#F5F7F6] text-xs text-[#1A1D1B] outline-none"
                            />
                            <button
                              type="button"
                              disabled={processingId === req.id}
                              onClick={() => handleApprove(req.id)}
                              className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-[#0E3324] hover:bg-[#154732] disabled:opacity-50 text-white font-semibold text-xs shadow-sm transition"
                            >
                              <CheckCircle2 className="w-4 h-4 text-[#F2D283]" />
                              Aprobar / Greenlight
                            </button>
                            <button
                              type="button"
                              disabled={processingId === req.id}
                              onClick={() => handleReject(req.id)}
                              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-[#F5F7F6] hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 text-[#5F6368] font-semibold text-xs transition"
                            >
                              <XCircle className="w-4 h-4" />
                              Rechazar
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Tab 2: Retiros CBU/CVU */}
            {tab === 'withdrawals' && (
              withdrawals.length === 0 ? (
                <div className="rounded-3xl bg-[#164A34]/75 border border-white/[0.08] p-12 text-center space-y-2">
                  <ArrowDownToLine className="w-10 h-10 text-[#F2D283] mx-auto" />
                  <h2 className="text-base font-semibold">No hay solicitudes de retiro</h2>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {withdrawals.map((w) => (
                    <div
                      key={w.id}
                      className="rounded-3xl bg-white text-[#1A1D1B] p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-ambient"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-base tabular-nums">
                            {w.user_name} — {formatARS(w.amount_ars)}
                          </span>
                          <span
                            className={`text-[11px] font-semibold px-3 py-0.5 rounded-full ${
                              w.status === 'paid'
                                ? 'bg-[#E8F3EE] text-[#0E3324]'
                                : w.status === 'rejected'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-[#FEF3C7] text-[#92400E]'
                            }`}
                          >
                            {w.status}
                          </span>
                        </div>
                        <div className="text-xs text-[#5F6368] font-mono tabular-nums">
                          CBU/CVU: {w.destination_cbu_cvu}
                          {w.destination_alias && ` • Alias: ${w.destination_alias}`}
                        </div>
                      </div>

                      {w.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <button
                            disabled={processingId === w.id}
                            onClick={() => handleWithdrawal(w.id, 'paid')}
                            className="px-4 py-2 rounded-full bg-[#0E3324] text-white text-xs font-semibold"
                          >
                            Marcar Pagado
                          </button>
                          <button
                            disabled={processingId === w.id}
                            onClick={() => handleWithdrawal(w.id, 'rejected')}
                            className="px-4 py-2 rounded-full bg-[#F5F7F6] text-rose-700 text-xs font-semibold"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}

            {/* Tab 3: Equipo Admin & Datos Bancarios */}
            {tab === 'settings' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Datos Bancarios */}
                <form
                  onSubmit={handleSaveSettings}
                  className="rounded-3xl bg-[#164A34]/80 border border-[#C9A24B]/35 p-6 space-y-4 shadow-ambient"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-[#F2D283]" />
                    <h2 className="text-lg font-bold">Datos Bancarios y Comisión</h2>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#E4E9E6] block mb-1">Alias destino</label>
                    <input
                      type="text"
                      value={bankAlias}
                      onChange={(e) => setBankAlias(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-2xl bg-white text-[#1A1D1B] text-sm font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#E4E9E6] block mb-1">CVU</label>
                    <input
                      type="text"
                      value={bankCvu}
                      onChange={(e) => setBankCvu(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-2xl bg-white text-[#1A1D1B] text-sm font-mono tabular-nums outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#E4E9E6] block mb-1">Titular</label>
                    <input
                      type="text"
                      value={bankHolder}
                      onChange={(e) => setBankHolder(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-2xl bg-white text-[#1A1D1B] text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#E4E9E6] block mb-1">Comisión de la casa (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={commissionPct}
                      onChange={(e) => setCommissionPct(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-2xl bg-white text-[#1A1D1B] text-sm tabular-nums outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-3 rounded-full bg-gradient-to-r from-[#D9B35F] to-[#F2D283] text-[#0E3324] font-bold text-sm"
                  >
                    Guardar Configuración
                  </button>
                </form>

                {/* Gestión de Operadores Admin */}
                <div className="rounded-3xl bg-[#164A34]/80 border border-[#C9A24B]/35 p-6 space-y-4 shadow-ambient">
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-[#F2D283]" />
                    <h2 className="text-lg font-bold">Operadores en Modo Admin</h2>
                  </div>
                  <p className="text-xs text-[#9EB3A8]">
                    Otorgá acceso de administrador a personas de confianza (primero deben registrarse como usuarios en la app).
                  </p>

                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="email@operador.com"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-full bg-white text-[#1A1D1B] text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleGrantAdmin(newAdminEmail, true)}
                      className="px-5 py-2.5 rounded-full bg-white text-[#0E3324] font-bold text-xs shrink-0"
                    >
                      Hacer Admin
                    </button>
                  </div>

                  <div className="space-y-2 pt-2">
                    {admins.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-white/10 text-xs"
                      >
                        <div>
                          <div className="font-bold text-white">{a.display_name}</div>
                          <div className="text-[11px] text-[#9EB3A8]">{a.username}</div>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full bg-[#D9B35F]/20 text-[#F2D283] font-semibold">
                          Admin
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
