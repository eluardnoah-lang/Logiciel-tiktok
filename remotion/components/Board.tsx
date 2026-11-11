// Tableau noir du labo : mot-clé en gros + emoji animé + illustration SVG dessinée + chiffre qui défile.
import React from "react";
import type { SceneNumber, TimedScene } from "../../src/types";
import { backOut, clamp01, easeInOut, easeOut, hash } from "../lib";
import { SvgTree } from "./SvgTree";

export const BOARD = { x: 70, y: 240, w: 940, h: 760 };

export function formatNumber(n: SceneNumber, p: number): string {
  // les petites valeurs (0,5 L, x10…) apparaissent directement, les grandes défilent
  const v = Math.abs(n.value) >= 20 ? n.value * p : n.value;
  const dec = n.decimals ?? 0;
  const s = v.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: Math.abs(n.value) >= 10000 });
  return `${n.prefix ?? ""}${s}${n.suffix ?? ""}`;
}

export const Emoji: React.FC<{ e: string; size: number; t: number; seed?: number; style?: React.CSSProperties }> = ({ e, size, t, seed = 0, style }) => {
  const s = backOut(t / 0.45) * (1 + 0.06 * Math.sin(t * 5 + seed));
  const rot = Math.sin(t * 2.6 + seed) * 10;
  const y = Math.sin(t * 3.2 + seed) * 6;
  return (
    <span style={{ display: "inline-block", fontSize: size, lineHeight: 1, transform: `translateY(${y}px) rotate(${rot}deg) scale(${s})`, fontFamily: "'Noto Color Emoji', 'Apple Color Emoji', sans-serif", ...style }}>
      {e}
    </span>
  );
};

/** Petite explosion d'emojis quand le mot-clé apparaît. */
const Burst: React.FC<{ e: string; t: number; seed: number }> = ({ e, t, seed }) => {
  if (t > 1.0) return null;
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => {
        const a = (i / 6) * Math.PI * 2 + hash(seed + i) * 0.8;
        const d = easeOut(t / 0.9) * (140 + hash(seed * 2 + i) * 80);
        return (
          <span
            key={i}
            style={{ position: "absolute", left: "50%", top: 70, fontSize: 40, transform: `translate(${Math.cos(a) * d - 20}px, ${Math.sin(a) * d * 0.6 - 20}px) scale(${1 - t * 0.6})`, opacity: 1 - clamp01((t - 0.4) / 0.6), fontFamily: "'Noto Color Emoji', sans-serif" }}
          >
            {e}
          </span>
        );
      })}
    </>
  );
};

const SceneContent: React.FC<{ s: TimedScene; t: number; exit: number }> = ({ s, t, exit }) => {
  const dur = s.end - s.start;
  const kw = backOut(t / 0.4);
  const hasNum = !!s.number;
  const numP = hasNum ? easeInOut((t - 0.45) / Math.min(1.6, Math.max(0.6, dur * 0.45))) : 0;
  const numPop = backOut((t - 0.4) / 0.35);
  const out = easeInOut(exit);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: 1 - out, transform: `translateX(${-out * 80}px) scale(${1 - out * 0.06})` }}>
      {/* mot-clé + emoji */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 34, height: 140, display: "flex", alignItems: "center", justifyContent: "center", gap: 22 }}>
        <div
          style={{
            fontFamily: "Fredoka, sans-serif", fontWeight: 700, fontSize: s.keyword.length > 14 ? 74 : 96, color: "#FFD166",
            transform: `scale(${kw}) rotate(${-2 + Math.sin(t * 1.5) * 1}deg)`, textShadow: "0 4px 0 rgba(0,0,0,0.3)",
            letterSpacing: 1, whiteSpace: "nowrap",
          }}
        >
          {s.keyword}
        </div>
        <Emoji e={s.emoji} size={92} t={t - 0.15} seed={s.index} />
      </div>
      <Burst e={s.emoji} t={t - 0.15} seed={s.index * 7} />
      {/* illustration */}
      <div style={{ position: "absolute", left: 60, right: 60, top: 190, bottom: hasNum ? 150 : 40 }}>
        {s.svgTree ? <SvgTree tree={s.svgTree} t={t} duration={dur} /> : null}
      </div>
      {/* chiffre clé */}
      {hasNum && t > 0.4 && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 26, display: "flex", alignItems: "baseline", justifyContent: "center", gap: 18, transform: `scale(${numPop})` }}>
          <span style={{ fontFamily: "Fredoka, sans-serif", fontWeight: 700, fontSize: 104, color: "#EF476F", textShadow: "0 4px 0 rgba(0,0,0,0.3)" }}>
            {formatNumber(s.number!, numP)}
          </span>
          {s.number!.label ? (
            <span style={{ fontFamily: "Nunito, sans-serif", fontWeight: 800, fontSize: 40, color: "#F8F4E3", maxWidth: 380, lineHeight: 1.05 }}>{s.number!.label}</span>
          ) : null}
        </div>
      )}
    </div>
  );
};

/** Cadre en bois + ardoise (partie statique, pré-rendue en image). */
export const BoardChrome: React.FC = () => (
  <div style={{ position: "absolute", left: BOARD.x, top: BOARD.y, width: BOARD.w, height: BOARD.h }}>
    <div style={{ position: "absolute", inset: -24, borderRadius: 26, background: "linear-gradient(180deg,#9a6337,#6e4223)", boxShadow: "0 30px 60px rgba(0,0,0,0.45)" }} />
    <div
      style={{
        position: "absolute", inset: 0, borderRadius: 12, overflow: "hidden",
        background: "radial-gradient(ellipse at 30% 25%, #2c5544 0%, #1f3b2f 55%, #172c23 100%)",
        boxShadow: "inset 0 0 60px rgba(0,0,0,0.55)",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 70% 60%, rgba(255,255,255,0.06), transparent 40%), radial-gradient(circle at 20% 80%, rgba(255,255,255,0.05), transparent 35%)" }} />
    </div>
    <div style={{ position: "absolute", left: 40, right: 40, bottom: -40, height: 20, borderRadius: 6, background: "#5a361c" }}>
      <div style={{ position: "absolute", left: 120, top: -10, width: 60, height: 14, borderRadius: 6, background: "#f8f4e3" }} />
      <div style={{ position: "absolute", left: 200, top: -9, width: 44, height: 13, borderRadius: 6, background: "#ffd166" }} />
      <div style={{ position: "absolute", right: 140, top: -12, width: 90, height: 18, borderRadius: 5, background: "#4b5563" }} />
    </div>
  </div>
);

/** Contenu animé du tableau (au-dessus du cadre). */
export const Board: React.FC<{ scenes: TimedScene[]; t: number; withChrome?: boolean }> = ({ scenes, t, withChrome = true }) => {
  let i = scenes.findIndex((s) => t >= s.start && t < s.end);
  if (i < 0) i = t < (scenes[0]?.start ?? 0) ? 0 : scenes.length - 1;
  const cur = scenes[i];
  const prev = i > 0 ? scenes[i - 1] : null;
  const since = t - (cur?.start ?? 0);
  return (
    <>
      {withChrome ? <BoardChrome /> : null}
      <div style={{ position: "absolute", left: BOARD.x, top: BOARD.y, width: BOARD.w, height: BOARD.h, borderRadius: 12, overflow: "hidden" }}>
        {prev && since < 0.3 ? <SceneContent s={prev} t={t - prev.start} exit={since / 0.3} /> : null}
        {cur ? <SceneContent s={cur} t={since} exit={0} /> : null}
        <div style={{ position: "absolute", right: 22, top: 14, fontFamily: "Nunito, sans-serif", fontWeight: 800, fontSize: 24, color: "rgba(248,244,227,0.45)" }}>
          {i + 1}/{scenes.length}
        </div>
      </div>
    </>
  );
};
