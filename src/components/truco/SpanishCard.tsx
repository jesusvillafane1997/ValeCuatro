'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Card, Rank, Suit } from '@/lib/truco/types';

interface SpanishCardProps {
  card?: Card;
  faceDown?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  highlighted?: boolean;
  size?: 'sm' | 'md' | 'lg';
  slapRotation?: number;
  dealIndex?: number;
}

const SUIT_INK: Record<Suit, string> = {
  espadas: '#1E3A5F',
  bastos: '#235329',
  oro: '#9A5B13',
  copas: '#8C1D18',
};

/**
 * Pinta tradicional de la baraja española en los bordes superior e inferior.
 */
function PintaBorder({ suit }: { suit: Suit }) {
  const color = SUIT_INK[suit];
  const segments =
    suit === 'oro' ? 1 : suit === 'copas' ? 2 : suit === 'espadas' ? 3 : 4;

  const renderEdge = (pos: 'top' | 'bottom') => (
    <div
      className={`absolute left-2 right-2 flex gap-1 ${
        pos === 'top' ? 'top-1.5' : 'bottom-1.5'
      }`}
    >
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className="h-[1.5px] flex-1 rounded-full opacity-70"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );

  return (
    <div className="pointer-events-none absolute inset-0">
      {renderEdge('top')}
      {renderEdge('bottom')}
      <div
        className="absolute top-2 bottom-2 left-1.5 w-[1.2px] opacity-55"
        style={{ backgroundColor: color }}
      />
      <div
        className="absolute top-2 bottom-2 right-1.5 w-[1.2px] opacity-55"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

/**
 * Ilustraciones estilo grabado clásico (Fournier / Naipes Españoles)
 */
function WoodcutSuit({
  suit,
  className = 'w-4 h-4',
  ornate = false,
  inverted = false,
}: {
  suit: Suit;
  className?: string;
  ornate?: boolean;
  inverted?: boolean;
}) {
  const rotClass = inverted ? 'rotate-180' : '';

  if (suit === 'oro') {
    return (
      <svg viewBox="0 0 48 48" className={`${className} ${rotClass}`} fill="none">
        <circle cx="24" cy="24" r="17" fill="#E5B94B" stroke="#7A480B" strokeWidth="2" />
        <circle cx="24" cy="24" r="13.5" fill="#F8E28C" stroke="#9A5B13" strokeWidth="1.2" strokeDasharray="2 1.5" />
        <circle cx="24" cy="24" r="8.5" fill="#E5B94B" stroke="#7A480B" strokeWidth="1.4" />
        {/* 8-point solar engraving */}
        <path
          d="M24 10v5M24 33v5M10 24h5M33 24h5M14.2 14.2l3.5 3.5M30.3 30.3l3.5 3.5M33.8 14.2l-3.5 3.5M17.7 30.3l-3.5 3.5"
          stroke="#7A480B"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="24" cy="24" r="3" fill="#FFF3C4" stroke="#7A480B" strokeWidth="1.1" />
      </svg>
    );
  }

  if (suit === 'copas') {
    return (
      <svg viewBox="0 0 48 48" className={`${className} ${rotClass}`} fill="none">
        {/* Bowl */}
        <path
          d="M12 12c0 9 4.5 15 12 15s12-6 12-15H12z"
          fill="#C0392B"
          stroke="#5C130E"
          strokeWidth="1.8"
        />
        {/* Rim highlight */}
        <ellipse cx="24" cy="12" rx="12" ry="3" fill="#E5B94B" stroke="#5C130E" strokeWidth="1.6" />
        <path d="M16 15c1 4 3 7 6 8.5" stroke="#F5B7B1" strokeWidth="1.4" strokeLinecap="round" opacity="0.65" />
        {/* Stem & Knop */}
        <path d="M24 27v11" stroke="#9A5B13" strokeWidth="3.5" strokeLinecap="round" />
        <ellipse cx="24" cy="31.5" rx="4" ry="2.2" fill="#E5B94B" stroke="#5C130E" strokeWidth="1.3" />
        {/* Base */}
        <path d="M15 39c2-2 16-2 18 0H15z" fill="#E5B94B" stroke="#5C130E" strokeWidth="1.6" />
      </svg>
    );
  }

  if (suit === 'espadas') {
    return (
      <svg viewBox="0 0 48 48" className={`${className} ${rotClass}`} fill="none">
        {ornate && (
          <>
            <path d="M10 29c-3-6-1-14 5-19" stroke="#235329" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M38 29c3-6 1-14-5-19" stroke="#235329" strokeWidth="1.6" strokeLinecap="round" />
          </>
        )}
        {/* Blade */}
        <path
          d="M24 4l4 7.5-2 20h-4l-2-20L24 4z"
          fill="#CBD5E1"
          stroke="#1E3A5F"
          strokeWidth="1.8"
        />
        <path d="M24 6v24" stroke="#1E3A5F" strokeWidth="1.1" opacity="0.7" />
        {/* Scrolled Spanish Crossguard */}
        <path
          d="M13 30c2 2.5 5 2 11 1.5 6 .5 9 1 11-1.5"
          stroke="#9A5B13"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Grip & Pommel */}
        <path d="M24 32v9" stroke="#5C2D12" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="24" cy="42" r="2.8" fill="#E5B94B" stroke="#5C2D12" strokeWidth="1.3" />
      </svg>
    );
  }

  // Bastos: organic knotted olive-wood cudgel
  return (
    <svg viewBox="0 0 48 48" className={`${className} ${rotClass}`} fill="none">
      <path
        d="M20.5 41c.5-7 .8-13 0-19-2.2-5.5-1-12.5 3.5-15.5 4.5 3 5.7 10 3.5 15.5-.8 6-.5 12 0 19h-7z"
        fill="#3B7A3E"
        stroke="#1C3F1E"
        strokeWidth="1.8"
      />
      {/* Woodgrain knots */}
      <ellipse cx="22.5" cy="15" rx="1.6" ry="2.2" fill="#8B5A2B" stroke="#1C3F1E" strokeWidth="1" />
      <ellipse cx="25.8" cy="23" rx="1.4" ry="2" fill="#8B5A2B" stroke="#1C3F1E" strokeWidth="1" />
      {ornate && (
        <>
          <path d="M19 20c-3-1-5-3-6-5 2-.5 5 .5 6 3" fill="#4E9A51" stroke="#1C3F1E" strokeWidth="1.2" />
          <path d="M29 14c3-1 5-3 6-5-2-.5-5 .5-6 3" fill="#4E9A51" stroke="#1C3F1E" strokeWidth="1.2" />
        </>
      )}
      <path d="M18 41h12" stroke="#5C2D12" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Figuras tradicionales (10 Sota, 11 Caballo, 12 Rey) sin emojis, en estilo grabado clásico.
 */
function TraditionalCourtFigure({
  rank,
  suit,
  size,
}: {
  rank: Rank;
  suit: Suit;
  size: 'sm' | 'md' | 'lg';
}) {
  const ink = SUIT_INK[suit];
  const boxSize = size === 'sm' ? 'w-9 h-12' : size === 'lg' ? 'w-16 h-24' : 'w-13 h-18';

  return (
    <div
      className={`${boxSize} rounded-md border flex flex-col items-center justify-between p-1 bg-[#EFE5CA]/85 shadow-inner`}
      style={{ borderColor: `${ink}66` }}
    >
      <svg viewBox="0 0 40 44" className="w-full h-full" fill="none">
        {rank === 12 && (
          <>
            {/* Rey: Corona + Rostro barbado + Manto */}
            <path d="M11 14l3-7 6 4 6-4 3 7H11z" fill="#E5B94B" stroke="#7A480B" strokeWidth="1.5" />
            <circle cx="20" cy="20" r="5" fill="#F5CBA7" stroke="#5C2D12" strokeWidth="1.4" />
            <path d="M15 21c1 4 9 4 10 0" fill="#5C2D12" />
            <path d="M10 40c1-9 4-13 10-13s9 4 10 13H10z" fill={ink} stroke="#1A1917" strokeWidth="1.4" />
            <path d="M20 27v13" stroke="#E5B94B" strokeWidth="1.5" />
          </>
        )}
        {rank === 11 && (
          <>
            {/* Caballo: Corcel encabritado + Jinete */}
            <path
              d="M12 38c0-7 3-11 7-13l-2-7 5-3 3 4c3 1 5 4 5 9l-3 10H12z"
              fill="#A06B3B"
              stroke="#4A2B11"
              strokeWidth="1.5"
            />
            <circle cx="20" cy="11" r="3.8" fill="#F5CBA7" stroke="#4A2B11" strokeWidth="1.3" />
            <path d="M16 9h8l-1-3h-6l-1 3z" fill={ink} />
            <path d="M24 22l6-4" stroke="#E5B94B" strokeWidth="1.8" strokeLinecap="round" />
          </>
        )}
        {rank === 10 && (
          <>
            {/* Sota: Paje con boina y túnica */}
            <path d="M13 13c2-3 12-3 14 0H13z" fill={ink} stroke="#1A1917" strokeWidth="1.3" />
            <circle cx="20" cy="18" r="4.5" fill="#F5CBA7" stroke="#5C2D12" strokeWidth="1.3" />
            <path d="M12 40l2-15h12l2 15H12z" fill={ink} stroke="#1A1917" strokeWidth="1.4" />
            <path d="M14 30h12" stroke="#E5B94B" strokeWidth="1.8" />
          </>
        )}
      </svg>
      <div className="flex items-center justify-center">
        <WoodcutSuit suit={suit} className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      </div>
    </div>
  );
}

function TraditionalCenter({
  rank,
  suit,
  size,
}: {
  rank: Rank;
  suit: Suit;
  size: 'sm' | 'md' | 'lg';
}) {
  if (rank >= 10) {
    return <TraditionalCourtFigure rank={rank} suit={suit} size={size} />;
  }

  if (rank === 1) {
    return (
      <WoodcutSuit
        suit={suit}
        ornate
        className={size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-16 h-16' : 'w-12 h-12'}
      />
    );
  }

  const pipSize = size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';

  if (rank === 2) {
    return (
      <div className="flex flex-col items-center justify-between h-full py-1">
        <WoodcutSuit suit={suit} className={pipSize} />
        <WoodcutSuit suit={suit} className={pipSize} inverted />
      </div>
    );
  }

  if (rank === 3) {
    return (
      <div className="flex flex-col items-center justify-between h-full py-0.5">
        <WoodcutSuit suit={suit} className={pipSize} />
        <WoodcutSuit suit={suit} className={pipSize} />
        <WoodcutSuit suit={suit} className={pipSize} inverted />
      </div>
    );
  }

  if (rank === 4) {
    return (
      <div className="grid grid-cols-2 gap-x-2 gap-y-2">
        <WoodcutSuit suit={suit} className={pipSize} />
        <WoodcutSuit suit={suit} className={pipSize} />
        <WoodcutSuit suit={suit} className={pipSize} inverted />
        <WoodcutSuit suit={suit} className={pipSize} inverted />
      </div>
    );
  }

  if (rank === 5) {
    return (
      <div className="relative flex items-center justify-center">
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-2.5">
          <WoodcutSuit suit={suit} className={pipSize} />
          <WoodcutSuit suit={suit} className={pipSize} />
          <WoodcutSuit suit={suit} className={pipSize} inverted />
          <WoodcutSuit suit={suit} className={pipSize} inverted />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <WoodcutSuit suit={suit} className={pipSize} />
        </div>
      </div>
    );
  }

  if (rank === 6) {
    return (
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        <WoodcutSuit suit={suit} className={pipSize} />
        <WoodcutSuit suit={suit} className={pipSize} />
        <WoodcutSuit suit={suit} className={pipSize} />
        <WoodcutSuit suit={suit} className={pipSize} />
        <WoodcutSuit suit={suit} className={pipSize} inverted />
        <WoodcutSuit suit={suit} className={pipSize} inverted />
      </div>
    );
  }

  // 7
  return (
    <div className="relative flex items-center justify-center">
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-0.5">
        <WoodcutSuit suit={suit} className={pipSize} />
        <WoodcutSuit suit={suit} className={pipSize} />
        <WoodcutSuit suit={suit} className={pipSize} />
        <WoodcutSuit suit={suit} className={pipSize} />
        <WoodcutSuit suit={suit} className={pipSize} inverted />
        <WoodcutSuit suit={suit} className={pipSize} inverted />
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none -translate-y-1.5">
        <WoodcutSuit suit={suit} className={pipSize} />
      </div>
    </div>
  );
}

export function SpanishCard({
  card,
  faceDown = false,
  onClick,
  disabled = false,
  highlighted = false,
  size = 'md',
  slapRotation = 0,
  dealIndex = 0,
}: SpanishCardProps) {
  const dims =
    size === 'sm'
      ? 'w-14 h-20 rounded-[7px]'
      : size === 'lg'
      ? 'w-24 h-36 sm:w-28 sm:h-40 rounded-[10px]'
      : 'w-20 h-28 sm:w-22 sm:h-32 rounded-[9px]';

  if (faceDown || !card) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24, delay: dealIndex * 0.05 }}
        className={`${dims} relative select-none bg-[#F7F1DF] p-1 shadow-md flex items-center justify-center overflow-hidden border border-[#CBBFA3]`}
      >
        <div className="w-full h-full rounded-[5px] bg-[#7D1D1D] border border-[#D4AF37]/50 bg-[repeating-linear-gradient(45deg,rgba(247,241,223,0.14)_0px,rgba(247,241,223,0.14)_1.5px,transparent_1.5px,transparent_5px),repeating-linear-gradient(-45deg,rgba(247,241,223,0.14)_0px,rgba(247,241,223,0.14)_1.5px,transparent_1.5px,transparent_5px)] flex items-center justify-center">
          <div className="w-5 h-5 rounded-full bg-[#F7F1DF] border border-[#7D1D1D] flex items-center justify-center shadow-xs">
            <div className="w-2.5 h-2.5 rotate-45 bg-[#7D1D1D]" />
          </div>
        </div>
      </motion.div>
    );
  }

  const ink = SUIT_INK[card.suit];
  const isAnchoBravo =
    card.rank === 1 && (card.suit === 'espadas' || card.suit === 'bastos');

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      title={card.label}
      initial={{ opacity: 0, y: -18, scale: 0.9, rotate: slapRotation }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: slapRotation }}
      whileHover={
        onClick && !disabled
          ? { y: -10, scale: 1.04, transition: { type: 'spring', stiffness: 400, damping: 20 } }
          : undefined
      }
      whileTap={onClick && !disabled ? { scale: 0.96 } : undefined}
      transition={{ type: 'spring', stiffness: 340, damping: 24, delay: dealIndex * 0.06 }}
      style={{
        boxShadow: isAnchoBravo
          ? 'inset 0 0 16px rgba(217,179,95,0.28), 0 8px 24px rgba(242,210,131,0.45)'
          : highlighted
          ? 'inset 0 0 14px rgba(139,108,66,0.16), 0 10px 24px rgba(217,179,95,0.38)'
          : 'inset 0 0 14px rgba(139,108,66,0.15), 0 4px 12px rgba(0,0,0,0.3)',
      }}
      className={`${dims} relative select-none bg-[#F7F1DF] text-[#1A1917] border transition-shadow flex flex-col justify-between p-2 ${
        isAnchoBravo
          ? 'border-[#D9B35F] ring-2 ring-[#F2D283]/85'
          : highlighted
          ? 'border-[#D9B35F] ring-2 ring-[#F2D283]/75'
          : 'border-[#CBBFA3]'
      } ${onClick && !disabled ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {/* Traditional Pinta Frame */}
      <PintaBorder suit={card.suit} />

      {/* Top-left traditional serif index */}
      <div className="relative z-10 flex items-center justify-start leading-none pl-0.5 pt-0.5">
        <span
          className="font-serif font-bold text-xs sm:text-sm tabular-nums tracking-tighter"
          style={{ color: ink }}
        >
          {card.rank}
        </span>
      </div>

      {/* Hand-crafted Woodcut Center */}
      <div className="relative z-10 flex items-center justify-center flex-1 py-0.5">
        <TraditionalCenter rank={card.rank} suit={card.suit} size={size} />
      </div>

      {/* Bottom-right inverted serif index */}
      <div className="relative z-10 flex items-center justify-start leading-none pl-0.5 pt-0.5 rotate-180">
        <span
          className="font-serif font-bold text-xs sm:text-sm tabular-nums tracking-tighter"
          style={{ color: ink }}
        >
          {card.rank}
        </span>
      </div>
    </motion.button>
  );
}
