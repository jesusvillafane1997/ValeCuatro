'use client';

import React, { useId } from 'react';

/**
 * Ornamento de esquina estilo Fileteado Porteño inspirado directamente en la imagen de referencia:
 * Volutas doradas/bronce con flor roja de cinco pétalos y perla dorada (para esquinas inferiores y mesa),
 * o en tonos verde esmeralda para las esquinas superiores.
 */
export function FileteadoCorner({
  position = 'tl',
  variant = 'gilded',
  className = '',
}: {
  position?: 'tl' | 'tr' | 'bl' | 'br';
  variant?: 'gilded' | 'emerald';
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const transform =
    position === 'tr'
      ? 'scale-x-[-1]'
      : position === 'bl'
      ? 'scale-y-[-1]'
      : position === 'br'
      ? 'scale-[-1]'
      : '';

  const strokeMain = variant === 'gilded' ? `url(#${uid}-gold)` : '#2E8A63';
  const strokeSub = variant === 'gilded' ? '#B8892E' : '#1F6346';

  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      className={`pointer-events-none select-none ${
        variant === 'emerald' ? 'opacity-75' : 'opacity-95'
      } ${transform} ${className}`}
      style={{ filter: 'drop-shadow(0 4px 10px rgba(0, 0, 0, 0.45))' }}
    >
      <defs>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F7D97E" />
          <stop offset="55%" stopColor="#C99A3B" />
          <stop offset="100%" stopColor="#6E4B12" />
        </linearGradient>
      </defs>

      {/* Sombra profunda */}
      <path
        d="M8 106 C8 48, 22 18, 106 8"
        stroke="#061A11"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Acanto principal en S */}
      <path
        d="M8 106 C8 48, 22 18, 106 8"
        stroke={strokeMain}
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Espiral interior */}
      <path
        d="M18 84 C18 48, 34 28, 74 22 C54 31, 42 44, 46 56 C49 63, 59 60, 58 52 C57 45, 50 45, 48 50"
        stroke="#061A11"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M18 84 C18 48, 34 28, 74 22 C54 31, 42 44, 46 56 C49 63, 59 60, 58 52 C57 45, 50 45, 48 50"
        stroke={strokeMain}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Hojas de acanto laterales */}
      <path
        d="M34 36 C46 21, 66 17, 86 21 C74 28, 62 29, 54 25"
        stroke={strokeSub}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M28 62 C34 48, 48 40, 62 40"
        stroke={strokeSub}
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Flor fileteada de cinco pétalos */}
      <g transform="translate(22, 22)">
        {[0, 72, 144, 216, 288].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <circle
              key={deg}
              cx={(Math.cos(rad) * 5.8).toFixed(2)}
              cy={(Math.sin(rad) * 5.8).toFixed(2)}
              r="3.8"
              fill={variant === 'gilded' ? '#C43E2B' : '#267554'}
              stroke="#061A11"
              strokeWidth="1"
            />
          );
        })}
        <circle
          cx="0"
          cy="0"
          r="2.8"
          fill={variant === 'gilded' ? '#F7D97E' : '#38B580'}
          stroke="#061A11"
          strokeWidth="0.8"
        />
      </g>

      {/* Perlitas */}
      <circle cx="42" cy="14" r="2" fill={variant === 'gilded' ? '#F7D97E' : '#38B580'} stroke="#061A11" strokeWidth="0.6" />
      <circle cx="14" cy="42" r="2" fill={variant === 'gilded' ? '#F7D97E' : '#38B580'} stroke="#061A11" strokeWidth="0.6" />
    </svg>
  );
}

/**
 * Volutas doradas para las 4 esquinas de la mesa de juego (52px-72px, bien visibles).
 */
export function FileteadoTableCornerGold({
  position = 'tl',
  className = '',
}: {
  position?: 'tl' | 'tr' | 'bl' | 'br';
  className?: string;
}) {
  return <FileteadoCorner position={position} variant="gilded" className={className} />;
}

/**
 * Rizo dorado para esquinas de tarjetas de pozo.
 */
export function FileteadoCardFiligree({
  position = 'tr',
  className = '',
}: {
  position?: 'tl' | 'tr' | 'bl' | 'br';
  className?: string;
}) {
  const transform =
    position === 'tr'
      ? 'scale-x-[-1]'
      : position === 'bl'
      ? 'scale-y-[-1]'
      : position === 'br'
      ? 'scale-[-1]'
      : '';

  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className={`pointer-events-none select-none opacity-85 ${transform} ${className}`}
    >
      <path
        d="M3 23 C3 10, 10 3, 23 3"
        stroke="#C9A24B"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="5.5" cy="5.5" r="1.2" fill="#F7D97E" />
    </svg>
  );
}

/**
 * Ornamento simétrico debajo del contenedor de pozos (como en la imagen central de referencia).
 */
export function FileteadoBottomBracket({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 40"
      fill="none"
      aria-hidden="true"
      className={`pointer-events-none select-none opacity-80 ${className}`}
      style={{ filter: 'drop-shadow(0 3px 8px rgba(0, 0, 0, 0.35))' }}
    >
      <path
        d="M16 20 C68 20, 102 6, 134 20 C145 25, 152 20, 160 20 C168 20, 175 25, 186 20 C218 6, 252 20, 304 20"
        stroke="#061A11"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M16 20 C68 20, 102 6, 134 20 C145 25, 152 20, 160 20 C168 20, 175 25, 186 20 C218 6, 252 20, 304 20"
        stroke="#2E8A63"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M110 20 C124 31, 142 28, 151 20 M210 20 C196 31, 178 28, 169 20"
        stroke="#38B580"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <g transform="translate(160, 20)">
        {[0, 72, 144, 216, 288].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <circle
              key={deg}
              cx={(Math.cos(rad) * 4.2).toFixed(2)}
              cy={(Math.sin(rad) * 4.2).toFixed(2)}
              r="2.4"
              fill="#2E8A63"
              stroke="#061A11"
              strokeWidth="0.7"
            />
          );
        })}
        <circle cx="0" cy="0" r="2" fill="#38B580" />
      </g>
    </svg>
  );
}

/**
 * Marca de agua del Sol de Mayo (opacity 0.25) centrada en El Paño.
 */
export function FileteadoSolDeMayoWatermark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden="true"
      className={`pointer-events-none select-none opacity-25 ${className}`}
    >
      <circle cx="100" cy="100" r="66" stroke="#2E8A63" strokeWidth="1.4" strokeDasharray="4 4" />
      <circle cx="100" cy="100" r="24" stroke="#38B580" strokeWidth="1.8" fill="#061A11" />
      {Array.from({ length: 16 }).map((_, i) => {
        const angle = (i * 22.5 * Math.PI) / 180;
        const r1 = 29;
        const r2 = i % 2 === 0 ? 58 : 46;
        const x1 = (100 + Math.cos(angle) * r1).toFixed(2);
        const y1 = (100 + Math.sin(angle) * r1).toFixed(2);
        const x2 = (100 + Math.cos(angle) * r2).toFixed(2);
        const y2 = (100 + Math.sin(angle) * r2).toFixed(2);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#38B580"
            strokeWidth={i % 2 === 0 ? '1.8' : '1.1'}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
