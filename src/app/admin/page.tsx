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
} from 'lucide-react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  getDemoTransfers,
  subscribeDemoTransfers,
  TransferRequestRecord,
  updateDemoTransferStatus,
} from '@/lib/demo-store';
import { formatARS } from '@/lib/format';
import { Wordmark } from '@/components/Wordmark';

export default function AdminGreenlightPage() {
  const [requests, setRequests] = useState<TransferRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabaseReady = isSupabaseConfigured();

  const loadSupabaseRequests = async () => {
    setLoading(true);
    setErrorMsg(null);
    const supabase = createClient();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

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

    const { data, error } = await supabase
      .from('transfer_requests')
      .select('*, profiles!transfer_requests_user_id_fkey(display_name)')
      .order('created_at', { ascending: false });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    const mapped: TransferRequestRecord[] = (data || []).map((row: Record<string, unknown>) => ({
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
    }));

    setRequests(mapped);

    const urls: Record<string, string> = {};
    for (const r of mapped) {
      if (r.receipt_url && !r.receipt_url.startsWith('data:') && !r.receipt_url.startsWith('demo://')) {
        const { data: signed } = await supabase.storage
          .from('comprobantes')
          .createSignedUrl(r.receipt_url, 3600);
        if (signed?.signedUrl) urls[r.id] = signed.signedUrl;
      }
    }
    setSignedUrls(urls);
    setLoading(false);
  };

  useEffect(() => {
    if (!supabaseReady) {
      setIsAdmin(true);
      setRequests(getDemoTransfers());
      setLoading(false);
      return subscribeDemoTransfers((list) => setRequests(list));
    }

    loadSupabaseRequests();

    const supabase = createClient();
    const channel = supabase
      .channel('admin-transfer-requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transfer_requests' },
        () => {
          loadSupabaseRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabaseReady]);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    setErrorMsg(null);
    try {
      if (!supabaseReady) {
        const next = updateDemoTransferStatus(id, 'approved');
        setRequests(next);
        setProcessingId(null);
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.rpc('approve_transfer_request', {
        p_request_id: id,
      });
      if (error) throw error;
      await loadSupabaseRequests();
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
      if (!supabaseReady) {
        const next = updateDemoTransferStatus(id, 'rejected', reason);
        setRequests(next);
        setProcessingId(null);
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.rpc('reject_transfer_request', {
        p_request_id: id,
        p_reason: reason,
      });
      if (error) throw error;
      await loadSupabaseRequests();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al rechazar');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="min-h-screen emerald-canvas text-white">
      <header className="bg-[#0E3324]/75 backdrop-blur-xl border-b border-white/[0.08] sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-full bg-[#164A34]/80 hover:bg-[#1D5C41] border border-white/[0.08] text-white transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <Wordmark size="sm" />
            <span className="text-xs px-3 py-1 rounded-full bg-[#164A34]/75 border border-white/[0.08] text-[#9EB3A8] font-medium">
              Panel Operador
            </span>
          </div>

          {supabaseReady && isAdmin && (
            <button
              onClick={loadSupabaseRequests}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#164A34]/80 hover:bg-[#1D5C41] border border-white/[0.08] text-xs font-semibold transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Actualizar
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-6 space-y-5">
        {!supabaseReady && (
          <div className="rounded-3xl bg-[#164A34]/75 backdrop-blur-xl border border-white/[0.08] p-4 text-xs text-[#E4E9E6]">
            <strong className="text-[#F2D283]">Modo Demo Local:</strong> Enviá un comprobante desde el Lobby en otra pestaña y tocá <strong>Aprobar / Greenlight</strong> acá para habilitar al jugador en vivo.
          </div>
        )}

        {errorMsg && (
          <div className="rounded-3xl bg-rose-500/20 border border-rose-400/30 p-4 text-xs text-rose-200 font-medium">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-sm text-[#9EB3A8]">
            Cargando solicitudes...
          </div>
        ) : !isAdmin ? (
          <div className="rounded-3xl bg-[#164A34]/75 backdrop-blur-xl border border-white/[0.08] p-10 text-center space-y-2 shadow-ambient">
            <XCircle className="w-10 h-10 text-rose-300 mx-auto" />
            <h2 className="text-lg font-bold">Acceso Restringido</h2>
            <p className="text-xs text-[#9EB3A8]">
              Iniciá sesión con una cuenta que tenga <code>is_admin = true</code> en <code>public.profiles</code>.
            </p>
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-3xl bg-[#164A34]/75 backdrop-blur-xl border border-white/[0.08] p-12 text-center space-y-2 shadow-ambient">
            <Clock className="w-10 h-10 text-[#F2D283] mx-auto" />
            <h2 className="text-base font-semibold text-white">
              Todavía no cayó ninguna transferencia
            </h2>
            <p className="text-xs text-[#9EB3A8]">
              Apenas un jugador avise que transfirió desde el Lobby, aparece acá al instante.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {requests.map((req) => {
              const previewSrc =
                signedUrls[req.id] ||
                (req.receipt_url.startsWith('data:') ? req.receipt_url : null);
              return (
                <div
                  key={req.id}
                  className="rounded-3xl bg-white text-[#1A1D1B] p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 shadow-ambient"
                >
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-24 h-24 rounded-2xl bg-[#F5F7F6] flex items-center justify-center overflow-hidden shrink-0">
                      {previewSrc ? (
                        <img
                          src={previewSrc}
                          alt={`Comprobante ${req.reference_code}`}
                          className="w-full h-full object-cover"
                        />
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
        )}
      </main>
    </div>
  );
}
