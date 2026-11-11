// Sous-titres discrets : 2-4 mots à la fois, mot prononcé en surbrillance, calés sur les timestamps.
import React, { useMemo } from "react";
import type { TimedWord } from "../../src/types";
import { backOut, clamp01 } from "../lib";

interface Group {
  words: TimedWord[];
  start: number;
  end: number;
}

export function groupWords(words: TimedWord[]): Group[] {
  const groups: Group[] = [];
  let cur: TimedWord[] = [];
  const close = () => {
    if (cur.length) groups.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  words.forEach((w, i) => {
    const next = words[i + 1];
    cur.push(w);
    const chars = cur.reduce((a, x) => a + x.text.length + 1, 0);
    const punct = /[.,;:!?…]$/.test(w.text);
    const gap = next ? next.start - w.end : 1;
    if (cur.length >= 4 || chars > 22 || (punct && cur.length >= 2) || /[.!?…]$/.test(w.text) || gap > 0.35) close();
  });
  close();
  return groups;
}

export const Subtitles: React.FC<{ words: TimedWord[]; t: number }> = ({ words, t }) => {
  const groups = useMemo(() => groupWords(words), [words]);
  let gi = -1;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const until = Math.min(groups[i + 1]?.start ?? g.end + 0.6, g.end + 0.6);
    if (t >= g.start - 0.04 && t < until) gi = i;
  }
  if (gi < 0) return null;
  const g = groups[gi];
  const appear = clamp01((t - g.start + 0.04) / 0.12);
  return (
    <div style={{ position: "absolute", left: 60, right: 150, top: 1352, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          padding: "10px 26px", borderRadius: 22, background: "rgba(10,8,6,0.5)", display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center",
          transform: `translateY(${(1 - appear) * 10}px)`, opacity: appear,
        }}
      >
        {g.words.map((w, i) => {
          const active = t >= w.start - 0.02 && t < Math.max(w.end, (g.words[i + 1]?.start ?? w.end) - 0.01);
          const done = t >= w.end;
          const s = active ? 1 + 0.08 * backOut(clamp01((t - w.start) / 0.12)) - 0.08 * clamp01((t - w.start - 0.12) / 0.2) : 1;
          return (
            <span
              key={i}
              style={{
                fontFamily: "Nunito, sans-serif", fontWeight: 900, fontSize: 54, lineHeight: 1.15,
                color: active ? "#FFD166" : done ? "#ffffff" : "rgba(255,255,255,0.78)",
                transform: `scale(${s})`, display: "inline-block", textShadow: "0 3px 6px rgba(0,0,0,0.6)",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export const ProgressBar: React.FC<{ p: number }> = ({ p }) => (
  <div style={{ position: "absolute", left: 0, top: 0, right: 0, height: 9, background: "rgba(0,0,0,0.35)" }}>
    <div style={{ width: `${p * 100}%`, height: "100%", background: "linear-gradient(90deg,#FFD166,#EF476F)", boxShadow: "0 0 10px rgba(239,71,111,0.8)" }} />
  </div>
);
