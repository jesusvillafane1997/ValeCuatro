'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { X, BookOpen } from 'lucide-react';

export function RulesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-[#164A34]/95 backdrop-blur-xl border border-[#C9A24B]/45 text-white rounded-[28px] max-w-2xl w-full p-6 sm:p-8 shadow-ambient relative max-h-[88vh] overflow-y-auto space-y-5"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-[#E4E9E6] transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5">
          <BookOpen className="w-5 h-5 text-[#F2D283]" />
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            Reglamento — Truco Argentino
          </h2>
        </div>

        <div className="space-y-4 text-xs sm:text-sm text-[#E4E9E6] leading-relaxed">
          <div className="rounded-2xl bg-white/[0.06] border border-white/[0.08] p-4 space-y-1.5">
            <h3 className="font-bold text-[#F2D283]">1. Jerarquía de Cartas (40 Naipes Españoles)</h3>
            <p className="text-[#9EB3A8] text-xs">
              De mayor a menor poder (sin 8, 9 ni comodines):
            </p>
            <ol className="list-decimal list-inside space-y-0.5 text-xs">
              <li><strong>Ancho de Espadas</strong> (1♠)</li>
              <li><strong>Ancho de Bastos</strong> (1♣)</li>
              <li><strong>Siete de Espadas</strong> (7♠)</li>
              <li><strong>Siete de Oro</strong> (7🪙)</li>
              <li>Todos los <strong>Tres (3)</strong>, luego todos los <strong>Doses (2)</strong></li>
              <li><strong>Anchos falsos</strong> (1 de Copas, 1 de Oro)</li>
              <li><strong>Reyes (12)</strong>, <strong>Caballos (11)</strong>, <strong>Sotas (10)</strong></li>
              <li><strong>Sietes falsos</strong> (7 de Copas, 7 de Bastos)</li>
              <li><strong>Seises (6)</strong>, <strong>Cincos (5)</strong> y <strong>Cuatros (4)</strong></li>
            </ol>
          </div>

          <div className="rounded-2xl bg-white/[0.06] border border-white/[0.08] p-4 space-y-1.5">
            <h3 className="font-bold text-[#F2D283]">2. Envido y Flor (Primera Mano)</h3>
            <p className="text-xs">
              • <strong>Envido (2 pts)</strong>, <strong>Real Envido (3 pts)</strong>, <strong>Falta Envido</strong> (los puntos que le faltan al puntero para llegar a 30).<br />
              • Dos cartas del mismo palo suman <strong>20 + valor de ambas</strong> (10, 11 y 12 valen 0). Sin ligue vale la carta más alta.<br />
              • <strong>Flor (3 pts)</strong>: 3 cartas del mismo palo (si la mesa tiene Flor habilitada).
            </p>
          </div>

          <div className="rounded-2xl bg-white/[0.06] border border-white/[0.08] p-4 space-y-1.5">
            <h3 className="font-bold text-[#F2D283]">3. Truco, Parda y Modos</h3>
            <p className="text-xs">
              • <strong>Truco (2 pts)</strong> → <strong>Retruco (3 pts)</strong> → <strong>Vale Cuatro (4 pts)</strong>.<br />
              • <strong>Parda (empate)</strong>: Quien gana 1ra mano gana los empates siguientes; si 1ra es parda, define la 2da.<br />
              • <strong>3v3 Pica-Pica</strong>: Entre 5 y 25 puntos se alternan rondas de duelos 1v1 con menú de <strong>Señas</strong> privadas por equipo.<br />
              • <strong>6 Todos contra Todos (Gallo)</strong>: El primero en llegar a 30 puntos se lleva el pozo completo.
            </p>
          </div>

          <div className="rounded-2xl bg-white/[0.06] border border-white/[0.08] p-4 space-y-1.5">
            <h3 className="font-bold text-[#F2D283]">4. Pozos ARS y Retiros</h3>
            <p className="text-xs">
              Elegí tu mesa, transferí el monto exacto al Alias/CVU oficial y subí el comprobante. Un operador aprueba tu ingreso al instante; al llegar a 30 puntos el pozo neto (92%) se acredita en tu billetera para retirar por CBU/CVU.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-full bg-white text-[#0E3324] font-bold text-xs"
        >
          Entendido, ¡a jugar!
        </button>
      </motion.div>
    </div>
  );
}
