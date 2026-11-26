import type { Part, Tones } from '@demodogs/shared';
import { noise3 } from './shapes';

/**
 * Tones for the themed courses' own pieces (the bay, the peak, the funfair, the castle, the
 * grotto), on top of the shared palette. Each look that uses them passes what it needs as its
 * `materials`. A name with `glow` or `lava` in it gives light off (see `shineOf` in the client).
 */
export const BAY: Record<string, Tones> = {
  frond: ['#2f8a3c', '#46b04e', '#86dc66'],
  frond2: ['#256e30', '#37903f', '#62c052'],
  trunk: ['#7a5a36', '#a47c4a', '#c9a26a'],
  trunk2: ['#63472a', '#86643a', '#a98552'],
  sandy: ['#c9a561', '#e6c887', '#f8e6b0'],
  sandy2: ['#b08d4e', '#cfb070', '#e8d096'],
  shell: ['#c4452f', '#ea6a48', '#ff9a78'],
  shell2: ['#9c3424', '#c4523a', '#e87a5c'],
  sea: ['#1d6f9c', '#2c93c4', '#58c0ea'],
  sunny: ['#c79a14', '#f0c228', '#ffe262'],
  plank: ['#8a6a44', '#b08a58', '#d0aa74'],
  plank2: ['#6e5234', '#8e6c46', '#ac8858'],
  plankgap: ['#3c2c1c', '#4c3824', '#5c452c'],
  path: ['#8e6e48', '#b08c5e', '#c9a070'],
  path2: ['#7a5c3a', '#99774e', '#b48c5e'],
  beamglow: ['#e8c860', '#fff0a0', '#fffbe0'],
  gunmetal: ['#25282c', '#3b3f45', '#6b7078'],
};

export const PEAK: Record<string, Tones> = {
  basalt: ['#24222a', '#383640', '#55525e'],
  basalt2: ['#1a181e', '#2a2830', '#403e48'],
  basalt3: ['#34303a', '#4c4854', '#6c6876'],
  lava: ['#e8480c', '#ff7a18', '#ffc040'],
  lava2: ['#c02c08', '#f05010', '#ff8a24'],
  geywater: ['#2a8fb8', '#48b8de', '#9ae4fa'],
  geyfoam: ['#b8e6f4', '#e2f8ff', '#fafeff'],
};

export const FAIR: Record<string, Tones> = {
  fairb: ['#1c58b0', '#2c78de', '#5aa2ff'],
  fairy: ['#c79a14', '#f0c228', '#ffe262'],
  fairg: ['#1f8a4a', '#2eb060', '#5cd888'],
  fairp: ['#a02c8a', '#cc44b0', '#f070d4'],
  bulbglow: ['#ffb637', '#ffd870', '#fff4c0'],
  pony: ['#c8c0b0', '#eee8dc', '#fffdf6'],
  pony2: ['#6a4630', '#8c5e40', '#b07c58'],
};

export const KEEP: Record<string, Tones> = {
  ashlar: ['#7c7f88', '#a4a8b2', '#cfd3da'],
  ashlar2: ['#6a6d76', '#8e929c', '#b6bac2'],
  mortar: ['#55585f', '#72757d', '#94979f'],
  rooftile: ['#9c2c24', '#c84434', '#ee6a52'],
  rooftile2: ['#7e2019', '#a63428', '#cc5240'],
  gold: ['#b88a14', '#e6b82a', '#ffe070'],
  dark: ['#17181c', '#22242a', '#34363e'],
};

export const GROTTO: Record<string, Tones> = {
  cave: ['#3a3450', '#544c70', '#7a7098'],
  cave2: ['#2c2740', '#423a5c', '#62587e'],
  crystglow: ['#28c8d8', '#6aeef8', '#d8ffff'],
  crystglow2: ['#1898b0', '#40d0e4', '#a0f6ff'],
  roseglow: ['#e044b0', '#ff7cd4', '#ffd8f4'],
  roseglow2: ['#b02c8c', '#e85cbc', '#ffaae6'],
  capv: ['#5a2c9c', '#7c44cc', '#a870f2'],
  capv2: ['#44207a', '#6234a6', '#8a56d2'],
  spotglow: ['#48e8b0', '#90ffd4', '#e0fff4'],
  stalk: ['#b8b0c8', '#dcd6e8', '#f6f2ff'],
  lampglow: ['#ffa030', '#ffd070', '#fff2c0'],
  gunmetal: ['#25282c', '#3b3f45', '#6b7078'],
};

/**
 * A cluster of crystal spikes, each a six-sided shard leaning out from the middle, of the glowing
 * material `core` with its edges and its foot in `rim`.
 */
export function crystal(core: string, rim: string): Part {
  // each spike: where its foot is, which way it leans (px per px of height), how tall and how thick
  const SPIKES = [
    [0, 0, 0.02, -0.03, 15, 2.5],
    [2.6, 1.2, 0.2, 0.1, 10, 1.9],
    [-2.4, 1.6, -0.22, 0.12, 8.5, 1.7],
    [-1.2, -2.4, -0.1, -0.24, 9.5, 1.8],
    [2.4, -2, 0.24, -0.16, 6.5, 1.5],
  ] as const;
  return {
    w: 14,
    h: 14,
    layers: 16,
    smooth: true,
    fn: (x, y, z) => {
      for (const [bx, by, lx, ly, tall, thick] of SPIKES) {
        if (z > tall) continue;
        const dx = x - bx - lx * z;
        const dy = y - by - ly * z;
        // six flat sides, tapering to a point
        const r = thick * (1 - (z / tall) ** 1.6);
        const a = Math.atan2(dy, dx);
        const d = Math.hypot(dx, dy) * Math.cos(((a + 20) % (Math.PI / 3)) - Math.PI / 6);
        if (d > r) continue;
        return d > r - 0.5 || z < 1 ? rim : core;
      }
      return null;
    },
  };
}

/** Rough rock for the peak and the grotto: `a` with patches of `b`, by a soft noise. */
export function rocky(x: number, y: number, z: number, a: string, b: string): string {
  return noise3(x * 0.3, y * 0.3, z * 0.3) > 0.52 ? b : a;
}
