'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Copy,
  Check,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Play,
} from 'lucide-react';
import { formatARS, generateReferenceCode } from '@/lib/format';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  saveDemoTransfer,
  subscribeDemoTransfers,
  TransferRequestRecord,
} from '@/lib/demo-store';
import { soundFX } from '@/lib/truco/sound';
import { GameMode, PoolTier } from '@/lib/truco/types';
import { FileteadoCardFiligree } from '@/components/FileteadoAccents';

interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  amountArs: number;
  poolTier: PoolTier;
  gameMode: GameMode;
  userId: string;
  userName: string;
  bankAlias?: string;
  bankCvu?: string;
  bankHolder?: string;
  onApprovedPlay: (matchId: string) => void;
}

export function TransferModal({
  open,
  onClose,
  amountArs,
  poolTier,
  gameMode,
  userId,
  userName,
  bankAlias = 'jesus2210.dolarapp',
  bankCvu = '0000003100084920192837',
  bankHolder = 'Vale Cuatro S.R.L.',
  onApprovedPlay,
}: TransferModalProps) {
  const [referenceCode, setReferenceCode] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestRecord, setRequestRecord] = useState<TransferRequestRecord | null>(null);

  useEffect(() => {
    if (open) {
      setReferenceCode(generateReferenceCode());
      setFile(null);
      setPreviewUrl(null);
      setError(null);
      setRequestRecord(null);
    }
  }, [open, amountArs, gameMode]);

  useEffect(() => {
    if (!requestRecord || requestRecord.status !== 'pending') return;

    if (!isSupabaseConfigured()) {
      const unsub = subscribeDemoTransfers((list) => {
        const updated = list.find((r) => r.id === requestRecord.id);
        if (updated && updated.status !== requestRecord.status) {
          setRequestRecord(updated);
          if (updated.status === 'approved') {
            soundFX.playGreenlight();
          }
        }
      });
      return unsub;
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`transfer-status-${requestRecord.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'transfer_requests',
          filter: `id=eq.${requestRecord.id}`,
        },
        (payload) => {
          const row = payload.new as TransferRequestRecord;
          setRequestRecord((prev) => (prev ? { ...prev, ...row } : row));
          if (row.status === 'approved') {
            soundFX.playGreenlight();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestRecord]);

  if (!open) return null;

  const copyValue = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setError(null);
    if (selected.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setPreviewUrl(reader.result as string);
      reader.readAsDataURL(selected);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('Subí el comprobante de transferencia (JPG, PNG o PDF) antes de seguir.');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      if (!isSupabaseConfigured()) {
        const id = crypto.randomUUID();
        const rec: TransferRequestRecord = {
          id,
          user_id: userId,
          user_name: userName,
          amount_ars: amountArs,
          pool_tier: poolTier,
          game_mode: gameMode,
          reference_code: referenceCode,
          receipt_url: previewUrl || `demo://${file.name}`,
          status: 'pending',
          created_at: new Date().toISOString(),
        };
        saveDemoTransfer(rec);
        setRequestRecord(rec);
        setSubmitting(false);
        return;
      }

      const supabase = createClient();
      const ext = file.name.split('.').pop() || 'png';
      const path = `${userId}/${referenceCode.replace('#', '')}-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('comprobantes')
        .upload(path, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: inserted, error: insertErr } = await supabase
        .from('transfer_requests')
        .insert({
          user_id: userId,
          amount_ars: amountArs,
          pool_tier: poolTier,
          game_mode: gameMode,
          reference_code: referenceCode,
          receipt_url: path,
          status: 'pending',
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      setRequestRecord({
        ...inserted,
        user_name: userName,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al enviar comprobante.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        className="bg-[#164A34]/90 backdrop-blur-xl border border-white/[0.12] text-white rounded-[28px] max-w-lg w-full p-6 sm:p-8 shadow-ambient relative max-h-[92vh] overflow-y-auto overflow-x-hidden"
      >
        <FileteadoCardFiligree position="tl" className="absolute top-2.5 left-2.5 w-9 h-9" />
        <FileteadoCardFiligree position="bl" className="absolute bottom-2.5 left-2.5 w-9 h-9" />
        <FileteadoCardFiligree position="br" className="absolute bottom-2.5 right-2.5 w-9 h-9" />
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-[#E4E9E6] transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Estado 1: Transferencia Bancaria */}
        {!requestRecord && (
          <div className="space-y-5">
            <div>
              <span className="inline-block text-[11px] font-semibold text-[#F2D283] bg-[#D9B35F]/20 px-3 py-1 rounded-full">
                Transferencia Bancaria
              </span>
              <h3 className="text-2xl font-bold tracking-tight text-white mt-2 tabular-nums">
                Pozo {formatARS(amountArs)}
              </h3>
              <p className="text-xs text-[#9EB3A8] mt-1 leading-relaxed">
                Transferí el monto exacto desde tu homebanking, Mercado Pago o MODO y pegá el código de referencia.
              </p>
            </div>

            {/* Crisp White/Grey CVU/Alias Box inside Emerald Glass Modal */}
            <div className="bg-white text-[#1A1D1B] rounded-3xl p-4 sm:p-5 space-y-3 shadow-md">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] text-[#5F6368] block">Alias destino</span>
                  <span className="font-mono font-bold text-[#0E3324] text-sm tabular-nums">
                    {bankAlias}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyValue('alias', bankAlias)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#F5F7F6] hover:bg-[#E4E9E6] text-xs font-semibold text-[#0E3324] transition"
                >
                  {copiedField === 'alias' ? (
                    <Check className="w-3.5 h-3.5 text-[#154732]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-[#5F6368]" />
                  )}
                  Copiar
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] text-[#5F6368] block">CVU</span>
                  <span className="font-mono font-medium text-[#1A1D1B] text-xs sm:text-sm tabular-nums">
                    {bankCvu}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyValue('cvu', bankCvu)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#F5F7F6] hover:bg-[#E4E9E6] text-xs font-semibold text-[#0E3324] transition"
                >
                  {copiedField === 'cvu' ? (
                    <Check className="w-3.5 h-3.5 text-[#154732]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-[#5F6368]" />
                  )}
                  Copiar
                </button>
              </div>

              <div className="flex items-center justify-between pt-2.5 border-t border-[#E4E9E6] text-xs">
                <span className="text-[#5F6368]">
                  Titular: <strong className="text-[#1A1D1B]">{bankHolder}</strong>
                </span>
                <span className="font-mono font-bold text-[#0E3324] bg-[#F2D283]/45 px-3 py-1 rounded-full tabular-nums">
                  {referenceCode}
                </span>
              </div>
            </div>

            {/* Clean Receipt Upload Dropzone */}
            <div>
              <label className="block text-xs font-semibold text-[#E4E9E6] mb-2">
                Comprobante de Transferencia (JPG, PNG o PDF)
              </label>
              <label className="flex flex-col items-center justify-center gap-2 rounded-3xl p-5 cursor-pointer bg-white/[0.07] hover:bg-white/[0.12] border border-dashed border-white/25 transition">
                <Upload className="w-5 h-5 text-[#F2D283]" />
                <span className="text-xs text-[#E4E9E6] font-medium text-center">
                  {file ? file.name : 'Adjuntar captura o PDF del comprobante'}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              {previewUrl && (
                <div className="mt-3 p-2 rounded-2xl bg-white">
                  <img
                    src={previewUrl}
                    alt="Vista previa comprobante"
                    className="max-h-32 rounded-xl mx-auto object-contain"
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="text-xs text-rose-200 bg-rose-500/20 border border-rose-400/30 rounded-2xl px-4 py-2.5 font-medium">
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="w-full py-3.5 rounded-full bg-white hover:bg-[#F5F7F6] disabled:opacity-50 text-[#0E3324] font-bold text-sm shadow-md transition ease-fluid"
            >
              {submitting ? 'Enviando comprobante...' : 'Ya transferí / Solicitar Aprobación'}
            </button>
          </div>
        )}

        {/* Estado 2: Sala de Espera */}
        {requestRecord?.status === 'pending' && (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-[#D9B35F]/20 flex items-center justify-center mx-auto relative">
              <span className="w-6 h-6 rounded-full bg-[#F2D283] animate-ping absolute opacity-45" />
              <span className="w-3.5 h-3.5 rounded-full bg-[#F2D283] relative" />
            </div>
            <h3 className="text-2xl font-bold tracking-tight text-white">
              Ya recibimos tu aviso
            </h3>
            <p className="text-xs text-[#E4E9E6] max-w-sm mx-auto leading-relaxed">
              Estamos chequeando la transferencia{' '}
              <strong className="font-mono text-[#F2D283]">{requestRecord.reference_code}</strong> por{' '}
              <strong className="tabular-nums text-white">
                {formatARS(requestRecord.amount_ars)}
              </strong>{' '}
              para habilitarte la silla...
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-xs font-medium text-[#F2D283]">
              <span className="w-2 h-2 rounded-full bg-[#F2D283] animate-pulse" />
              Chequeo en vivo
            </div>
          </div>
        )}

        {/* Estado 3: Greenlight Aprobado */}
        {requestRecord?.status === 'approved' && (
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="py-8 text-center space-y-4"
          >
            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mx-auto shadow-lg">
              <CheckCircle2 className="w-9 h-9 text-[#0E3324]" />
            </div>
            <h3 className="text-2xl font-bold tracking-tight text-[#F2D283]">
              ¡Listo, adentro! Ya podés jugar
            </h3>
            <p className="text-xs text-[#E4E9E6] max-w-sm mx-auto">
              Tu buy-in de{' '}
              <strong className="tabular-nums text-white">
                {formatARS(requestRecord.amount_ars)}
              </strong>{' '}
              ya está acreditado en la mesa de Vale Cuatro.
            </p>
            <button
              type="button"
              onClick={() => onApprovedPlay(requestRecord.match_id || `match-${requestRecord.id}`)}
              className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full bg-gradient-to-r from-[#D9B35F] to-[#F2D283] hover:opacity-95 text-[#0E3324] font-bold text-sm shadow-lg transition"
            >
              <Play className="w-4 h-4 fill-current" />
              Entrar al Paño
            </button>
          </motion.div>
        )}

        {/* Estado 4: Rechazada */}
        {requestRecord?.status === 'rejected' && (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 flex items-center justify-center mx-auto">
              <AlertCircle className="w-9 h-9 text-rose-300" />
            </div>
            <h3 className="text-xl font-bold text-rose-200">
              No pudimos confirmar la transferencia
            </h3>
            <p className="text-xs text-[#E4E9E6] max-w-sm mx-auto">
              Motivo: {requestRecord.rejection_reason || 'Comprobante ilegible o no acreditado.'}
            </p>
            <button
              type="button"
              onClick={() => setRequestRecord(null)}
              className="px-5 py-2.5 rounded-full bg-white text-xs font-bold text-[#0E3324]"
            >
              Intentar nuevamente
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
