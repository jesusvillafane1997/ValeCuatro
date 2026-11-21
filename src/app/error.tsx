'use client';

import React from 'react';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen emerald-canvas flex flex-col items-center justify-center p-6 text-center gap-4 text-white">
      <h2 className="text-2xl font-bold">Algo se trabó en la mesa</h2>
      <p className="text-xs text-[#9EB3A8] max-w-sm">
        No te preocupes, tus fichas y tu billetera están seguras.
      </p>
      <button
        onClick={() => reset()}
        className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#D9B35F] to-[#F2D283] text-[#0E3324] font-bold text-xs"
      >
        Reintentar
      </button>
    </div>
  );
}
