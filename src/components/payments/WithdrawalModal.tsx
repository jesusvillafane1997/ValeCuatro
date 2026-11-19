'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, ArrowDownToLine, CheckCircle2 } from 'lucide-react';
import { formatARS } from '@/lib/format';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

interface WithdrawalModalProps {
  open: boolean;
  onClose: () => void;
  availableBalance: number;
  userId: string;
}

export function WithdrawalModal({
  open,
  onClose,
  availableBalance,
  userId,
}: WithdrawalModalProps) {
  const [amount, setAmount] = useState(String(Math.min(10000, availableBalance || 10000)));
  const [cbu, setCbu] = useState('');
  const [alias, setAlias] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amount);
    if (!num || num <= 0 || num > availableBalance) {
      setError('Ingresá un monto válido dentro de tu saldo disponible.');
      return;
    }
    if (cbu.trim().length < 10) {
      setError('Ingresá un CBU o CVU válido.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        const { error: err } = await supabase.from('withdrawal_requests').insert({
          user_id: userId,
          amount_ars: num,
          destination_cbu_cvu: cbu.trim(),
          destination_alias: alias.trim() || null,
          status: 'pending',
        });
        if (err) throw err;
      }
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo solicitar el retiro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-[#164A34]/90 backdrop-blur-xl border border-white/[0.12] text-white rounded-[28px] max-w-md w-full p-6 sm:p-7 relative shadow-ambient"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-[#E4E9E6]"
        >
          <X className="w-4 h-4" />
        </button>

        {submitted ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-[#F2D283] mx-auto" />
            <h3 className="text-xl font-bold">¡Retiro en camino!</h3>
            <p className="text-xs text-[#E4E9E6] tabular-nums">
              Transferencia saliente por {formatARS(Number(amount))} al CBU/CVU {cbu}.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-full bg-white text-[#0E3324] text-xs font-bold"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-2">
              <ArrowDownToLine className="w-5 h-5 text-[#F2D283]" />
              <h3 className="text-xl font-bold">Retirar Premios</h3>
            </div>
            <p className="text-xs text-[#9EB3A8] tabular-nums">
              Saldo disponible:{' '}
              <strong className="text-[#F2D283]">{formatARS(availableBalance)}</strong>
            </p>

            <div>
              <label className="text-xs font-semibold text-[#E4E9E6] block mb-1.5">Monto en ARS</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-white text-[#1A1D1B] text-sm tabular-nums outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#E4E9E6] block mb-1.5">CBU / CVU destino</label>
              <input
                type="text"
                placeholder="00000031000..."
                value={cbu}
                onChange={(e) => setCbu(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-white text-[#1A1D1B] text-sm font-mono tabular-nums outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#E4E9E6] block mb-1.5">Alias (opcional)</label>
              <input
                type="text"
                placeholder="MI.ALIAS.MP"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-white text-[#1A1D1B] text-sm outline-none"
              />
            </div>

            {error && <p className="text-xs text-rose-200 font-medium">{error}</p>}

            <button
              type="submit"
              disabled={loading || availableBalance <= 0}
              className="w-full py-3 rounded-full bg-white hover:bg-[#F5F7F6] disabled:opacity-50 text-[#0E3324] font-bold text-sm transition"
            >
              {loading ? 'Procesando...' : 'Solicitar Transferencia'}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
