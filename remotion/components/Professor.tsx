// Professeur 3D cartoon (Three.js / react-three-fiber) : blouse blanche, lunettes rondes, moustache.
// Animé image par image : lip-sync par visèmes, clignements aléatoires, respiration, tête et gestes.
import React, { useMemo } from "react";
import { ThreeCanvas } from "@remotion/three";
import { useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import type { VisemeSeg } from "../../src/types";
import { clamp01, easeInOut, gestureEnvelope, hash, lerp, mouthAt, speechEnergy, wobble } from "../lib";

const SKIN = "#f3c39d";
const SKIN_DARK = "#e5a882";
const HAIR = "#eceff4";
const COAT = "#fbfbfd";
const COAT_SHADE = "#dfe3ec";

type V3 = [number, number, number];

const Mat: React.FC<{ color: string; rough?: number; metal?: number; opacity?: number; emissive?: string }> = ({ color, rough = 0.62, metal = 0, opacity, emissive }) => (
  <meshStandardMaterial
    color={color}
    roughness={rough}
    metalness={metal}
    transparent={opacity !== undefined}
    opacity={opacity ?? 1}
    emissive={emissive ?? "#000000"}
    emissiveIntensity={emissive ? 0.25 : 0}
  />
);

const Ball: React.FC<{ p?: V3; s?: V3; r?: number; color: string; rough?: number; rot?: V3 }> = ({ p = [0, 0, 0], s = [1, 1, 1], r = 1, color, rough, rot }) => (
  <mesh position={p} scale={s} rotation={rot}>
    <sphereGeometry args={[r, 40, 32]} />
    <Mat color={color} rough={rough} />
  </mesh>
);

const Capsule: React.FC<{ p?: V3; rot?: V3; r: number; len: number; color: string; s?: V3 }> = ({ p = [0, 0, 0], rot, r, len, color, s }) => (
  <mesh position={p} rotation={rot} scale={s}>
    <capsuleGeometry args={[r, len, 10, 24]} />
    <Mat color={color} />
  </mesh>
);

/** Instants de clignement : intervalles aléatoires 2-5 s, parfois double clignement. */
function blinkTimes(duration: number, seed: number): number[] {
  const out: number[] = [];
  let t = 0.8 + hash(seed) * 1.5;
  let k = 0;
  while (t < duration) {
    out.push(t);
    if (hash(seed + k * 7.3) > 0.82) out.push(t + 0.32);
    t += 2.0 + hash(seed + k * 3.1) * 3.2;
    k++;
  }
  return out;
}

function blinkAmount(times: number[], t: number): number {
  let b = 0;
  for (const bt of times) {
    const d = t - bt;
    if (d < 0 || d > 0.22) continue;
    // fermeture rapide (60 ms), réouverture plus lente
    b = Math.max(b, d < 0.06 ? d / 0.06 : 1 - (d - 0.06) / 0.16);
  }
  return clamp01(b);
}

const Arm: React.FC<{ side: 1 | -1; raise: number; beat: number; t: number; seed: number }> = ({ side, raise, beat, t, seed }) => {
  // Repos : bras le long du corps, avant-bras légèrement vers l'avant.
  // Geste : bras levé vers le tableau (côté droit de l'écran), main ouverte.
  const sway = wobble(t * 0.9, seed) * 0.05;
  const shoulderZ = side * lerp(0.16 + sway, 1.45, raise); // abduction : bras écarté
  const shoulderX = lerp(-0.12, -0.3, raise) - beat * 0.35;
  const elbowX = lerp(-0.45, -0.15, raise) - beat * 0.75;
  const elbowZ = side * lerp(0.0, 1.45, raise); // avant-bras qui remonte vers le tableau
  const wrist = Math.sin(t * 6 + seed) * 0.15 * (raise + beat) - side * 0.3 * raise;
  return (
    <group position={[side * 0.98, -0.1, 0.05]} rotation={[shoulderX, 0, shoulderZ]}>
      {/* épaule arrondie */}
      <Ball r={0.3} color={COAT} />
      <Capsule p={[0, -0.5, 0]} r={0.24} len={0.65} color={COAT} />
      <group position={[0, -0.98, 0]} rotation={[elbowX, 0, elbowZ]}>
        <Capsule p={[0, -0.42, 0]} r={0.21} len={0.55} color={COAT} />
        {/* poignet de manche */}
        <mesh position={[0, -0.8, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 0.1, 24]} />
          <Mat color={COAT_SHADE} />
        </mesh>
        <group position={[0, -0.98, 0]} rotation={[0, 0, wrist]}>
          <Ball r={0.19} s={[1, 1.1, 0.75]} color={SKIN} />
          {/* doigts */}
          {[-0.09, -0.03, 0.03, 0.09].map((x, i) => (
            <Capsule key={i} p={[x, -0.2 - (i === 1 || i === 2 ? 0.02 : 0), 0.02]} r={0.045} len={0.14 + (i === 1 ? 0.03 : 0)} color={SKIN} />
          ))}
          <Capsule p={[side * -0.15, -0.06, 0.06]} rot={[0, 0, side * 0.9]} r={0.05} len={0.12} color={SKIN} />
        </group>
      </group>
    </group>
  );
};

export const Professor: React.FC<{ visemes: VisemeSeg[]; gestures: number[]; sceneStarts: number[]; seed: number; width: number; height: number }> = ({
  visemes,
  gestures,
  sceneStarts,
  seed,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const blinks = useMemo(() => blinkTimes(durationInFrames / fps + 2, seed), [durationInFrames, fps, seed]);

  const m = mouthAt(visemes, t);
  const energy = speechEnergy(visemes, t);
  const blink = blinkAmount(blinks, t);

  // Gestes : un geste sur deux pointe le tableau (bras droit écran), les autres sont des gestes "explicatifs" des deux mains
  const g = gestureEnvelope(gestures, t);
  const pointing = g.index % 3 !== 2;
  const raiseR = pointing ? g.v : g.v * 0.35;
  const beatL = (!pointing ? g.v * 0.9 : 0) + energy * 0.25 * (0.5 + 0.5 * Math.sin(t * 3.1 + seed));
  const beatR = pointing ? 0 : g.v * 0.8;

  // Coup d'œil vers le tableau au début de chaque scène, puis retour au regard caméra
  let glance = 0;
  for (const s of sceneStarts) {
    const d = t - s;
    if (d > 0 && d < 1.1) glance = Math.max(glance, Math.min(easeInOut(d / 0.2), 1 - easeInOut((d - 0.6) / 0.4)));
  }

  const breath = Math.sin((t / 3.6) * Math.PI * 2);
  const headYaw = 0.1 * wobble(t * 0.45, seed) + glance * 0.38 + (pointing ? g.v * 0.12 : 0);
  const headPitch = -0.03 + 0.045 * Math.sin(t * 2.2 + seed) * (0.3 + energy) + 0.06 * g.v * (1 - glance) - glance * 0.1;
  const headRoll = 0.05 * wobble(t * 0.6, seed + 4) + energy * 0.02 * Math.sin(t * 1.7);
  const bodyRoll = 0.02 * wobble(t * 0.35, seed + 9);
  const bob = 0.03 * Math.sin(t * 2.2 + seed) * energy + breath * 0.015;

  // Bouche
  const open = m.open;
  const mouthW = lerp(0.12, 0.3, m.wide) * lerp(1, 0.7, m.round);
  const mouthH = 0.018 + open * 0.17;
  const brow = 0.03 * energy + 0.05 * g.v + 0.04 * glance;
  // Regard : légèrement vers le tableau pendant le coup d'œil
  const eyeX = glance * 0.05;
  const eyeY = glance * 0.025;

  const lidRot = lerp(-0.7, 1.57, blink);

  return (
    <ThreeCanvas width={width} height={height} dpr={1.4} camera={{ fov: 22, position: [0, 0.25, 13.5], near: 0.1, far: 100 }} gl={{ antialias: false, preserveDrawingBuffer: true }}>
      <hemisphereLight args={["#fff1dc", "#5b3b2a", 1.15]} />
      <directionalLight position={[-4, 5, 6]} intensity={2.3} color="#ffe2b8" />
      <directionalLight position={[5, 1, 3]} intensity={0.7} color="#cfe0ff" />
      <directionalLight position={[0, 3, -5]} intensity={1.6} color="#ffd28a" />
      <group position={[0.15, -0.95 + bob, 0]} rotation={[0, -0.1, bodyRoll]}>
        {/* ----- CORPS ----- */}
        <group scale={[1, 1 + breath * 0.012, 1]}>
          {/* blouse */}
          <mesh position={[0, -1.25, 0]} scale={[1.08, 1, 0.72]}>
            <capsuleGeometry args={[1.05, 1.5, 12, 32]} />
            <Mat color={COAT} rough={0.75} />
          </mesh>
          {/* chemise bleue (V) */}
          <mesh position={[0, -0.32, 0.66]} rotation={[0.15, 0, Math.PI]} scale={[1, 1, 0.3]}>
            <coneGeometry args={[0.42, 0.95, 3]} />
            <Mat color="#7fb2e5" />
          </mesh>
          {/* cravate */}
          <Ball p={[0, -0.02, 0.78]} r={0.09} s={[1.2, 0.9, 0.7]} color="#d8343f" />
          <mesh position={[0, -0.42, 0.74]} rotation={[0.12, 0, Math.PI]} scale={[1, 1, 0.35]}>
            <coneGeometry args={[0.12, 0.7, 4]} />
            <Mat color="#d8343f" />
          </mesh>
          {/* revers de la blouse */}
          {[-1, 1].map((sd) => (
            <mesh key={sd} position={[sd * 0.3, -0.45, 0.72]} rotation={[0.1, 0, sd * 0.35]}>
              <boxGeometry args={[0.16, 1.15, 0.06]} />
              <Mat color={COAT_SHADE} />
            </mesh>
          ))}
          {/* poche + stylos */}
          <mesh position={[-0.55, -0.85, 0.74]} rotation={[0.1, 0.25, 0]}>
            <boxGeometry args={[0.38, 0.32, 0.04]} />
            <Mat color={COAT_SHADE} />
          </mesh>
          <mesh position={[-0.62, -0.66, 0.76]} rotation={[0.1, 0.25, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.28, 12]} />
            <Mat color="#2b6cd8" />
          </mesh>
          <mesh position={[-0.5, -0.67, 0.77]} rotation={[0.1, 0.25, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.26, 12]} />
            <Mat color="#e63946" />
          </mesh>
          {/* badge */}
          <mesh position={[0.58, -0.8, 0.74]} rotation={[0.1, -0.25, 0]}>
            <boxGeometry args={[0.3, 0.16, 0.03]} />
            <Mat color="#ffd166" />
          </mesh>
          <Arm side={1} raise={raiseR} beat={beatR} t={t} seed={seed} />
          <Arm side={-1} raise={0} beat={beatL} t={t} seed={seed + 2} />
        </group>

        {/* cou */}
        <mesh position={[0, 0.15, 0]}>
          <cylinderGeometry args={[0.3, 0.34, 0.5, 24]} />
          <Mat color={SKIN_DARK} />
        </mesh>

        {/* ----- TÊTE ----- */}
        <group position={[0, 0.42, 0]} rotation={[headPitch, headYaw, headRoll]}>
          <Ball p={[0, 0.95, 0]} r={0.9} s={[1, 1.06, 0.95]} color={SKIN} rough={0.5} />
          {/* oreilles */}
          {[-1, 1].map((sd) => (
            <Ball key={sd} p={[sd * 0.88, 0.95, -0.05]} r={0.2} s={[0.6, 1, 0.8]} color={SKIN_DARK} />
          ))}
          {/* cheveux blancs ébouriffés sur les côtés et à l'arrière (crâne dégarni) */}
          {[
            [0.78, 1.25, -0.25, 0.32], [0.86, 0.95, -0.35, 0.3], [0.62, 1.5, -0.45, 0.3], [0.7, 0.72, -0.5, 0.26],
            [0.35, 1.55, -0.7, 0.32], [0, 1.4, -0.8, 0.38],
          ].flatMap(([x, y, z, r], i) =>
            [1, -1].map((sd) => <Ball key={`${i}${sd}`} p={[sd * x, y, z]} r={r} color={HAIR} rough={0.9} />),
          )}
          {/* petite mèche rebelle */}
          <Ball p={[0.12, 1.86, 0.1]} r={0.12} s={[1.4, 0.7, 1]} rot={[0, 0, 0.5]} color={HAIR} rough={0.9} />
          {/* sourcils */}
          {[-1, 1].map((sd) => (
            <Capsule key={sd} p={[sd * 0.32, 1.34 + brow + (sd === 1 ? 0.02 * g.v : 0), 0.8]} rot={[0, 0, Math.PI / 2 + sd * (0.12 - brow)]} r={0.05} len={0.25} color="#d8dbe2" />
          ))}
          {/* yeux */}
          {[-1, 1].map((sd) => (
            <group key={sd} position={[sd * 0.3, 1.08, 0.73]}>
              <Ball r={0.17} color="#ffffff" rough={0.25} />
              <Ball p={[eyeX * 1.2, eyeY, 0.12]} r={0.095} s={[1, 1, 0.6]} color="#5a3a22" rough={0.3} />
              <Ball p={[eyeX * 1.3, eyeY, 0.17]} r={0.05} s={[1, 1, 0.5]} color="#0d0a0a" rough={0.2} />
              <Ball p={[eyeX + 0.03, eyeY + 0.04, 0.2]} r={0.022} color="#ffffff" rough={0.1} />
              {/* paupière supérieure */}
              <mesh rotation={[lidRot, 0, 0]}>
                <sphereGeometry args={[0.185, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <Mat color={SKIN} />
              </mesh>
            </group>
          ))}
          {/* lunettes rondes */}
          {[-1, 1].map((sd) => (
            <group key={sd} position={[sd * 0.31, 1.07, 0.9]}>
              <mesh>
                <torusGeometry args={[0.25, 0.028, 16, 48]} />
                <Mat color="#3b2a1e" rough={0.35} metal={0.2} />
              </mesh>
              <mesh>
                <circleGeometry args={[0.245, 40]} />
                <meshStandardMaterial color="#cfe8ff" transparent opacity={0.12} roughness={0.05} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[sd * 0.4, 0.02, -0.45]} rotation={[Math.PI / 2, 0, -sd * 0.32]}>
                <cylinderGeometry args={[0.02, 0.02, 0.95, 8]} />
                <Mat color="#3b2a1e" />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 1.1, 0.93]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.02, 0.02, 0.14, 8]} />
            <Mat color="#3b2a1e" />
          </mesh>
          {/* nez */}
          <Ball p={[0, 0.86, 0.9]} r={0.15} s={[1, 0.9, 1]} color="#f0ad8a" rough={0.45} />
          {/* joues */}
          {[-1, 1].map((sd) => (
            <Ball key={sd} p={[sd * 0.5, 0.72, 0.6]} r={0.17} s={[1, 0.8, 0.6]} color="#f6a99b" rough={0.6} />
          ))}
          {/* moustache (bouge un peu avec la bouche) */}
          {[-1, 1].map((sd) => (
            <Capsule key={sd} p={[sd * 0.16, 0.66 + open * 0.025, 0.88]} rot={[0, sd * 0.25, Math.PI / 2 + sd * 0.38]} r={0.075} len={0.2} color="#e4e6ec" />
          ))}
          {/* bouche */}
          <group position={[0, 0.5 - open * 0.03, 0.82]} rotation={[-0.15, 0, 0]}>
            {/* lèvres */}
            <mesh scale={[mouthW + 0.03, mouthH + 0.03, 0.08 + m.round * 0.04]} position={[0, 0, m.round * 0.025]}>
              <sphereGeometry args={[1, 32, 20]} />
              <Mat color="#c96b68" rough={0.4} />
            </mesh>
            {/* intérieur */}
            <mesh scale={[mouthW, mouthH, 0.1]} position={[0, 0, 0.02 + m.round * 0.025]}>
              <sphereGeometry args={[1, 32, 20]} />
              <Mat color="#4a1418" rough={0.8} />
            </mesh>
            {/* dents du haut */}
            {open > 0.12 && (
              <mesh position={[0, mouthH * 0.62, 0.07 + m.round * 0.02]} scale={[mouthW * 0.78, Math.min(0.05, mouthH * 0.35), 0.03]}>
                <sphereGeometry args={[1, 24, 12]} />
                <Mat color="#fbf8f0" rough={0.3} />
              </mesh>
            )}
            {/* langue */}
            {open > 0.25 && (
              <mesh position={[0, -mouthH * 0.55, 0.06]} scale={[mouthW * 0.6, mouthH * 0.35, 0.05]}>
                <sphereGeometry args={[1, 24, 12]} />
                <Mat color="#e06c75" rough={0.5} />
              </mesh>
            )}
          </group>
          {/* menton qui descend avec la mâchoire */}
          <Ball p={[0, 0.3 - open * 0.06, 0.55]} r={0.32} s={[1.1, 0.6, 0.7]} color={SKIN} rough={0.5} />
        </group>
      </group>
    </ThreeCanvas>
  );
};
