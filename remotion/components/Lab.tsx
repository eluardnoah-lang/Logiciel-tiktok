// Décor : laboratoire scientifique (mur carrelé, étagères, lampes chaudes, paillasse avec fioles qui bouillonnent).
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { hash } from "../lib";

const BLEED = 220;

/** Mur du fond + étagères + lampes (calque lointain). */
// part = "static" : tout ce qui ne bouge pas (pré-rendu une fois en image, beaucoup plus rapide)
// part = "live"   : uniquement les éléments animés, dessinés à chaque image par-dessus.
export type Part = "all" | "static" | "live";

export const LabWall: React.FC<{ part?: Part }> = ({ part = "all" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const flicker = 0.92 + 0.04 * Math.sin(t * 7.3) * Math.sin(t * 2.1);
  if (part === "live") {
    return (
      <svg width={1080 + BLEED * 2} height={1920 + BLEED * 2} viewBox={`${-BLEED} ${-BLEED} ${1080 + BLEED * 2} ${1920 + BLEED * 2}`} style={{ position: "absolute", left: -BLEED, top: -BLEED }}>
        {[180, 900].map((x) => <ellipse key={x} cx={x} cy={150} rx={70} ry={12} fill="#fff6dc" opacity={flicker - 0.55} />)}
      </svg>
    );
  }
  const tiles = [];
  for (let y = -BLEED; y < 1920 + BLEED; y += 90) {
    for (let x = -BLEED; x < 1080 + BLEED; x += 90) {
      tiles.push(<rect key={`${x}_${y}`} x={x + 3} y={y + 3} width={84} height={84} rx={6} fill="#efe1c6" opacity={0.08 + hash(x * 13 + y) * 0.05} />);
    }
  }
  const jars = [
    { x: 640, w: 60, h: 90, c: "#4cc9f0" }, { x: 715, w: 44, h: 120, c: "#ef476f" }, { x: 775, w: 70, h: 70, c: "#06d6a0" },
    { x: 860, w: 50, h: 105, c: "#ffd166" }, { x: 925, w: 64, h: 82, c: "#b39ddb" }, { x: 1005, w: 46, h: 115, c: "#f77f00" },
  ];
  return (
    <svg width={1080 + BLEED * 2} height={1920 + BLEED * 2} viewBox={`${-BLEED} ${-BLEED} ${1080 + BLEED * 2} ${1920 + BLEED * 2}`} style={{ position: "absolute", left: -BLEED, top: -BLEED }}>
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a3326" />
          <stop offset="0.45" stopColor="#7a5640" />
          <stop offset="1" stopColor="#5b3e2d" />
        </linearGradient>
        <radialGradient id="lampGlow" cx="0.5" cy="0" r="0.8">
          <stop offset="0" stopColor="#ffd59a" stopOpacity={0.55 * flicker} />
          <stop offset="1" stopColor="#ffb35c" stopOpacity={0} />
        </radialGradient>
        <radialGradient id="vig" cx="0.5" cy="0.45" r="0.62">
          <stop offset="0.6" stopColor="#1e0f05" stopOpacity={0} />
          <stop offset="1" stopColor="#1e0f05" stopOpacity={0.6} />
        </radialGradient>
        <radialGradient id="warm" cx="0.35" cy="0.62" r="0.65">
          <stop offset="0" stopColor="#ffcf8a" stopOpacity={0.35} />
          <stop offset="1" stopColor="#000" stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect x={-BLEED} y={-BLEED} width={1080 + BLEED * 2} height={1920 + BLEED * 2} fill="url(#wall)" />
      {tiles}
      <rect x={-BLEED} y={-BLEED} width={1080 + BLEED * 2} height={1920 + BLEED * 2} fill="url(#warm)" />
      {/* bandeau de faïence */}
      <rect x={-BLEED} y={1180} width={1080 + BLEED * 2} height={14} fill="#2f7f86" opacity={0.6} />

      {/* étagère droite (derrière/à côté du prof) */}
      {[1110, 1300].map((y, k) => (
        <g key={y}>
          <rect x={590} y={y} width={500} height={18} rx={4} fill="#6b4226" />
          <rect x={590} y={y + 18} width={500} height={8} fill="#000" opacity={0.25} />
          {k === 0 ? (
            jars.map((j, i) => (
              <g key={i}>
                <rect x={j.x - j.w / 2} y={y - j.h} width={j.w} height={j.h} rx={10} fill="#ffffff" opacity={0.18} stroke="#fff" strokeOpacity={0.35} strokeWidth={3} />
                <rect x={j.x - j.w / 2 + 5} y={y - j.h * 0.62} width={j.w - 10} height={j.h * 0.62 - 4} rx={7} fill={j.c} opacity={0.75} />
                <rect x={j.x - j.w / 2 + 4} y={y - j.h - 10} width={j.w - 8} height={14} rx={4} fill="#3d2a1f" />
                <rect x={j.x - j.w / 2 + 9} y={y - j.h + 12} width={6} height={j.h * 0.5} rx={3} fill="#fff" opacity={0.35} />
              </g>
            ))
          ) : (
            <g>
              {["#e63946", "#457b9d", "#f4a261", "#2a9d8f", "#8d6cab", "#e9c46a", "#264653"].map((c, i) => (
                <rect key={i} x={620 + i * 34} y={y - 130 + (i % 3) * 8} width={30} height={130 - (i % 3) * 8} rx={4} fill={c} opacity={0.9} />
              ))}
              {/* microscope */}
              <g transform={`translate(905 ${y})`} fill="#c9ced6" stroke="#6b7280" strokeWidth={3}>
                <rect x={-50} y={-18} width={100} height={18} rx={5} />
                <rect x={-8} y={-140} width={18} height={125} rx={6} transform="rotate(-14)" />
                <rect x={-30} y={-175} width={34} height={70} rx={10} transform="rotate(-28 -10 -140)" fill="#e5e7eb" />
                <rect x={-36} y={-62} width={80} height={10} rx={4} />
              </g>
              {/* plante */}
              <g transform={`translate(1030 ${y})`}>
                <rect x={-26} y={-50} width={52} height={50} rx={8} fill="#c46b3c" />
                {[-0.6, -0.2, 0.25, 0.7].map((a, i) => (
                  <ellipse key={i} cx={Math.sin(a) * 40} cy={-80 - Math.cos(a) * 20} rx={16} ry={42} transform={`rotate(${a * 50} ${Math.sin(a) * 40} ${-80 - Math.cos(a) * 20})`} fill="#3aa76d" />
                ))}
              </g>
            </g>
          )}
        </g>
      ))}

      {/* affiche "squelette" à gauche du tableau, partiellement visible lors des travellings */}
      <g transform="translate(-120 1150)" opacity={0.85}>
        <rect x={0} y={0} width={150} height={220} rx={8} fill="#f1e6cf" />
        <circle cx={75} cy={45} r={24} fill="none" stroke="#7a5640" strokeWidth={5} />
        <line x1={75} y1={70} x2={75} y2={165} stroke="#7a5640" strokeWidth={6} />
        {[90, 105, 120].map((y) => <line key={y} x1={50} y1={y} x2={100} y2={y} stroke="#7a5640" strokeWidth={4} />)}
        <line x1={75} y1={165} x2={50} y2={210} stroke="#7a5640" strokeWidth={5} />
        <line x1={75} y1={165} x2={100} y2={210} stroke="#7a5640" strokeWidth={5} />
      </g>

      {/* lampes suspendues avec halo chaud */}
      {[180, 900].map((x) => (
        <g key={x}>
          <line x1={x} y1={-BLEED} x2={x} y2={70} stroke="#2b1d16" strokeWidth={5} />
          <path d={`M ${x - 70} 150 Q ${x} 40 ${x + 70} 150 Z`} fill="#2f2420" />
          <ellipse cx={x} cy={150} rx={70} ry={12} fill="#ffe3b0" opacity={flicker} />
          <path d={`M ${x - 70} 150 L ${x - 330} 1100 L ${x + 330} 1100 L ${x + 70} 150 Z`} fill="url(#lampGlow)" />
        </g>
      ))}
      {/* vignette chaude */}
      <rect x={-BLEED} y={-BLEED} width={1080 + BLEED * 2} height={1920 + BLEED * 2} fill="url(#vig)" />
    </svg>
  );
};

const Bubbles: React.FC<{ x: number; y: number; w: number; h: number; color: string; seed: number; t: number; n?: number }> = ({ x, y, w, h, color, seed, t, n = 7 }) => (
  <g>
    {Array.from({ length: n }).map((_, i) => {
      const speed = 0.55 + hash(seed + i) * 0.6;
      const ph = (t * speed + hash(seed * 3 + i)) % 1;
      const bx = x + (hash(seed + i * 9) - 0.5) * w * 0.7 + Math.sin(t * 4 + i) * 4;
      const by = y - ph * h;
      const r = 4 + hash(seed + i * 5) * 7;
      return <circle key={i} cx={bx} cy={by} r={r * (0.6 + ph * 0.6)} fill="#ffffff" opacity={0.55 * (1 - ph)} stroke={color} strokeWidth={2} />;
    })}
  </g>
);

/** Paillasse au premier plan (calque proche). */
export const LabBench: React.FC<{ part?: Part }> = ({ part = "all" }) => {
  const S = part !== "live";
  const L = part !== "static";
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const top = 1530;
  const glow = 0.5 + 0.2 * Math.sin(t * 3);
  const steam = (cx: number, base: number, seed: number) =>
    Array.from({ length: 4 }).map((_, i) => {
      const ph = (t * 0.35 + i / 4 + hash(seed)) % 1;
      return (
        <ellipse key={i} cx={cx + Math.sin(t * 1.5 + i * 2) * 14 * ph} cy={base - ph * 170} rx={14 + ph * 30} ry={10 + ph * 16} fill="#ffffff" opacity={0.28 * Math.sin(ph * Math.PI)} />
      );
    });
  return (
    <svg width={1080 + BLEED * 2} height={1920 + BLEED * 2} viewBox={`${-BLEED} ${-BLEED} ${1080 + BLEED * 2} ${1920 + BLEED * 2}`} style={{ position: "absolute", left: -BLEED, top: -BLEED }}>
      <defs>
        <linearGradient id="benchTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3f4a" />
          <stop offset="1" stopColor="#23262d" />
        </linearGradient>
        <linearGradient id="cabinet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c08552" />
          <stop offset="1" stopColor="#8a5a35" />
        </linearGradient>
      </defs>
      {/* ombre portée sur le mur */}
      {S && <rect x={-BLEED} y={top - 30} width={1080 + BLEED * 2} height={40} fill="#000" opacity={0.18} />}

      {/* --- objets posés sur la paillasse --- */}
      {/* support + tubes à essai */}
      <g transform={`translate(600 ${top})`}>
        {S && <rect x={0} y={-70} width={190} height={14} rx={4} fill="#8a5a35" />}
        {S && <rect x={6} y={-70} width={10} height={70} fill="#8a5a35" />}
        {S && <rect x={174} y={-70} width={10} height={70} fill="#8a5a35" />}
        {["#ef476f", "#4cc9f0", "#06d6a0", "#ffd166"].map((c, i) => (
          <g key={i}>
            {S && <rect x={28 + i * 40} y={-150} width={26} height={140} rx={13} fill="#ffffff" opacity={0.25} stroke="#ffffff" strokeOpacity={0.6} strokeWidth={3} />}
            {L && <rect x={31 + i * 40} y={-95 + Math.sin(t * 2 + i) * 3} width={20} height={82} rx={10} fill={c} opacity={0.85} />}
          </g>
        ))}
      </g>
      {/* erlenmeyer qui bout sur un bec Bunsen */}
      <g transform={`translate(885 ${top})`}>
        {S && <rect x={-28} y={-48} width={56} height={48} rx={6} fill="#6b7280" />}
        {L && <path d={`M -10 -48 Q ${-8 + Math.sin(t * 20) * 3} -82 0 ${-100 - Math.sin(t * 13) * 8} Q ${8 + Math.cos(t * 17) * 3} -82 10 -48 Z`} fill="#4cc9f0" opacity={0.85} />}
        {L && <path d={`M -5 -50 Q -3 -70 0 ${-80 - Math.sin(t * 11) * 5} Q 3 -70 5 -50 Z`} fill="#ffffff" opacity={0.8} />}
        {S && <rect x={-75} y={-112} width={150} height={10} rx={4} fill="#9ca3af" />}
        {S && <path d="M -24 -330 L 24 -330 L 24 -255 L 90 -125 Q 96 -112 80 -112 L -80 -112 Q -96 -112 -90 -125 L -24 -255 Z" fill="#ffffff" opacity={0.22} stroke="#ffffff" strokeOpacity={0.7} strokeWidth={4} />}
        {L && <path d={`M -62 -170 Q 0 ${-178 + Math.sin(t * 6) * 5} 62 -170 L 80 -125 Q 84 -116 72 -116 L -72 -116 Q -84 -116 -80 -125 Z`} fill="#ef476f" opacity={0.8} />}
        {L && <ellipse cx={0} cy={-150} rx={70} ry={40} fill="#ff8fa3" opacity={glow * 0.4} />}
        {L && <Bubbles x={0} y={-125} w={110} h={150} color="#ef476f" seed={11} t={t} n={9} />}
        {L && steam(0, -340, 3)}
      </g>
      {/* ballon rond vert à droite */}
      <g transform={`translate(1035 ${top})`}>
        {S && <rect x={-14} y={-210} width={28} height={70} rx={6} fill="#ffffff" opacity={0.25} stroke="#fff" strokeOpacity={0.6} strokeWidth={3} />}
        {S && <circle cx={0} cy={-80} r={70} fill="#ffffff" opacity={0.2} stroke="#fff" strokeOpacity={0.6} strokeWidth={4} />}
        {L && <path d={`M -64 -62 Q 0 ${-70 + Math.sin(t * 4) * 6} 64 -62 A 70 70 0 0 1 -64 -62 Z`} fill="#06d6a0" opacity={0.85} />}
        {L && <Bubbles x={0} y={-30} w={90} h={90} color="#06d6a0" seed={5} t={t} n={6} />}
      </g>
      {/* petite fiole jaune à gauche, devant le prof */}
      <g transform={`translate(95 ${top})`}>
        {S && <path d="M -16 -150 L 16 -150 L 16 -100 L 55 -20 Q 60 0 40 0 L -40 0 Q -60 0 -55 -20 L -16 -100 Z" fill="#ffffff" opacity={0.22} stroke="#fff" strokeOpacity={0.6} strokeWidth={3} />}
        {L && <path d={`M -38 -55 Q 0 ${-60 + Math.sin(t * 5) * 4} 38 -55 L 52 -20 Q 56 -4 40 -4 L -40 -4 Q -56 -4 -52 -20 Z`} fill="#ffd166" opacity={0.9} />}
        {L && <Bubbles x={0} y={-15} w={70} h={70} color="#ffd166" seed={21} t={t} n={5} />}
      </g>

      {/* plan de travail */}
      {S && (<>
      <rect x={-BLEED} y={top} width={1080 + BLEED * 2} height={46} fill="url(#benchTop)" />
      <rect x={-BLEED} y={top} width={1080 + BLEED * 2} height={6} fill="#ffffff" opacity={0.25} />
      {/* meubles */}
      <rect x={-BLEED} y={top + 46} width={1080 + BLEED * 2} height={1920 - top + BLEED} fill="url(#cabinet)" />
      {[-140, 200, 540, 880, 1220].map((x) => (
        <g key={x}>
          <rect x={x - 150} y={top + 80} width={300} height={150} rx={10} fill="#000" opacity={0.12} />
          <rect x={x - 40} y={top + 145} width={80} height={14} rx={7} fill="#e9d8bf" opacity={0.8} />
        </g>
      ))}
      </>)}
    </svg>
  );
};
