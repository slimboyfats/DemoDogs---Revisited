import type { VenueManifest } from '@demodogs/shared';
import { sampleTrack } from '@demodogs/sim';

/** A colour as the bright look shows it: more colour, more light (as the ground painter's `sunny`). */
export function sunny(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const l = rgb[0]! * 0.3 + rgb[1]! * 0.55 + rgb[2]! * 0.15;
  const out = rgb.map((c) => Math.round(Math.min(255, Math.max(0, l + (c - l) * 1.35) * 1.3 + 14)));
  return `rgb(${out.join(',')})`;
}

export interface ThumbPlan {
  /** Picture px to a world px, and where the world's corner lands. */
  k: number;
  ox: number;
  oy: number;
  ground: string;
  road: string;
  /** The road's middle as picture points (a closed loop), or none on a derby venue. */
  line: [number, number][];
  /** How wide the road is drawn, in picture px. */
  wide: number;
  /** The derby bowl in picture px, or null. */
  oval: { cx: number; cy: number; rx: number; ry: number } | null;
}

/** What a venue's little map shows, fitted into w × h with a margin (pure, so it can be tested). */
export function thumbPlan(v: VenueManifest, w: number, h: number, margin = 6): ThumbPlan {
  const k = Math.min((w - margin * 2) / v.size.w, (h - margin * 2) / v.size.h);
  const ox = (w - v.size.w * k) / 2;
  const oy = (h - v.size.h * k) / 2;
  const line: [number, number][] = [];
  let wide = 0;
  if (v.track) {
    const T = sampleTrack(v.track.points, Math.max(8, 3 / k));
    for (let i = 0; i < T.n; i++) line.push([ox + T.x[i]! * k, oy + T.y[i]! * k]);
    // (never so thin that the loop is lost at this size)
    wide = Math.max(5, v.track.road * k);
  }
  const O = v.oval;
  return {
    k,
    ox,
    oy,
    ground: sunny(v.colors.ground),
    road: v.colors.road === 'dirt' ? sunny(v.colors.dirt) : '#8f94a6',
    line,
    wide,
    oval: O ? { cx: ox + O.cx * k, cy: oy + O.cy * k, rx: O.rx * k, ry: O.ry * k } : null,
  };
}

/** A venue's little map for its card on the menu: the ground's colour and the road's loop on it. */
export function venueThumb(v: VenueManifest, w = 150, h = 84): HTMLCanvasElement {
  const dpr = Math.min(3, Math.max(1, Math.round(devicePixelRatio || 1)));
  const cv = document.createElement('canvas');
  cv.width = w * dpr;
  cv.height = h * dpr;
  cv.className = 'thumb';
  const g = cv.getContext('2d');
  if (!g) return cv;
  g.scale(dpr, dpr);
  const P = thumbPlan(v, w, h);
  g.fillStyle = P.ground;
  g.fillRect(0, 0, w, h);
  g.lineJoin = g.lineCap = 'round';
  if (P.oval) {
    const O = P.oval;
    g.beginPath();
    g.ellipse(O.cx, O.cy, O.rx, O.ry, 0, 0, Math.PI * 2);
    g.fillStyle = sunny(v.colors.dirt);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#1b2233';
    g.stroke();
  }
  if (P.line.length) {
    const path = (): void => {
      g.beginPath();
      P.line.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    };
    // an ink edge, the road, a white middle line
    path();
    g.lineWidth = P.wide + 3;
    g.strokeStyle = '#1b2233';
    g.stroke();
    path();
    g.lineWidth = P.wide;
    g.strokeStyle = P.road;
    g.stroke();
    path();
    g.lineWidth = 1;
    g.setLineDash([3, 3]);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.stroke();
    g.setLineDash([]);
    // the start: a white bar across the road
    const [x0, y0] = P.line[0]!;
    const [x1, y1] = P.line[1]!;
    const d = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = (-(y1 - y0) / d) * (P.wide / 2);
    const ny = ((x1 - x0) / d) * (P.wide / 2);
    g.beginPath();
    g.moveTo(x0 - nx, y0 - ny);
    g.lineTo(x0 + nx, y0 + ny);
    g.lineWidth = 2.5;
    g.lineCap = 'butt';
    g.strokeStyle = '#fff';
    g.stroke();
  }
  return cv;
}
