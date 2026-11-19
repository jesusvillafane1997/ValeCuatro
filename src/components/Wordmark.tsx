'use client';

import React from 'react';

export function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'hero' }) {
  const heightClass =
    size === 'sm'
      ? 'h-10 sm:h-11'
      : size === 'hero' || size === 'lg'
      ? 'h-16 sm:h-20'
      : 'h-12 sm:h-14';

  return (
    <div className="inline-flex items-center justify-center select-none">
      <img
        src="/vale-cuatro-logo.png"
        alt="Vale Cuatro"
        className={`${heightClass} w-auto object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]`}
      />
    </div>
  );
}
