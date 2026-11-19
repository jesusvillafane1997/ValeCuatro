'use client';

import React from 'react';
import { motion } from 'framer-motion';

function MatchStick({
  x1,
  y1,
  x2,
  y2,
  headX,
  headY,
  headColor,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  headX: number;
  headY: number;
  headColor: string;
}) {
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 22 }}
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#FAF6EA"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <circle cx={headX} cy={headY} r="2.3" fill={headColor} />
    </motion.g>
  );
}

function MatchSquare({ count, headColor }: { count: number; headColor: string }) {
  return (
    <svg viewBox="0 0 36 36" className="w-6 h-6 sm:w-7 sm:h-7">
      {count >= 1 && <MatchStick x1={6} y1={6} x2={30} y2={6} headX={30} headY={6} headColor={headColor} />}
      {count >= 2 && <MatchStick x1={30} y1={6} x2={30} y2={30} headX={30} headY={30} headColor={headColor} />}
      {count >= 3 && <MatchStick x1={30} y1={30} x2={6} y2={30} headX={6} headY={30} headColor={headColor} />}
      {count >= 4 && <MatchStick x1={6} y1={30} x2={6} y2={6} headX={6} headY={6} headColor={headColor} />}
      {count >= 5 && <MatchStick x1={7} y1={29} x2={29} y2={7} headX={29} headY={7} headColor={headColor} />}
    </svg>
  );
}

function FosforosHalf({
  points,
  label,
  headColor,
}: {
  points: number;
  label: string;
  headColor: string;
}) {
  const clamped = Math.max(0, Math.min(15, points));
  const squares = [
    Math.min(5, clamped),
    Math.min(5, Math.max(0, clamped - 5)),
    Math.min(5, Math.max(0, clamped - 10)),
  ];

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9px] uppercase tracking-widest text-white/65 font-semibold">
        {label}
      </span>
      <div className="flex items-center gap-1 min-h-[26px]">
        {squares.map((cnt, idx) =>
          cnt > 0 ? (
            <MatchSquare key={`${idx}-${cnt}`} count={cnt} headColor={headColor} />
          ) : (
            <div
              key={idx}
              className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/5"
            />
          )
        )}
      </div>
    </div>
  );
}

export function FosforosBoard({
  labelA,
  scoreA,
  labelB,
  scoreB,
  compact = false,
}: {
  labelA: string;
  scoreA: number;
  labelB: string;
  scoreB: number;
  compact?: boolean;
}) {
  return (
    <div
      className={`bg-white/10 backdrop-blur-md rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] text-white ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <div className="text-[10px] tracking-wider text-white/70 font-semibold text-center mb-2 uppercase">
        Buenas y Malas
      </div>
      <div className="grid grid-cols-2 gap-3 divide-x divide-white/15">
        <div className="flex flex-col items-center gap-1.5 pr-1.5">
          <div className="flex items-center justify-between w-full gap-1">
            <span className="text-[11px] font-semibold text-white truncate">
              {labelA}
            </span>
            <span className="text-xs font-bold tabular-nums text-[#133B2A] bg-white px-2 py-0.5 rounded-full">
              {scoreA}
            </span>
          </div>
          <FosforosHalf points={scoreA} label="Malas" headColor="#E07A5F" />
          <div className="w-full h-px bg-white/10" />
          <FosforosHalf points={Math.max(0, scoreA - 15)} label="Buenas" headColor="#F4D35E" />
        </div>

        <div className="flex flex-col items-center gap-1.5 pl-2.5">
          <div className="flex items-center justify-between w-full gap-1">
            <span className="text-[11px] font-semibold text-white truncate">
              {labelB}
            </span>
            <span className="text-xs font-bold tabular-nums text-white bg-white/15 px-2 py-0.5 rounded-full">
              {scoreB}
            </span>
          </div>
          <FosforosHalf points={scoreB} label="Malas" headColor="#E07A5F" />
          <div className="w-full h-px bg-white/10" />
          <FosforosHalf points={Math.max(0, scoreB - 15)} label="Buenas" headColor="#F4D35E" />
        </div>
      </div>
    </div>
  );
}
