import React from 'react';

export default function Loading() {
  return (
    <div className="min-h-screen emerald-canvas flex flex-col items-center justify-center gap-3 text-white">
      <div className="w-10 h-10 rounded-full border-2 border-[#D4A438]/30 border-t-[#F7D97E] animate-spin" />
      <p className="text-xs text-[#9EB3A8] font-medium">Preparando el paño...</p>
    </div>
  );
}
