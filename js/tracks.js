// tracks.js: the venues. A race track is a closed curve through control points (Catmull-Rom), sampled every few
// pixels; the road is everything within half a road width of it. The derby arena is an oval bowl with a wall.
(function (global) {
  'use strict';

  const VENUES = {
    kennel: {
      name: 'KENNEL LOOP', kind: 'race', laps: 3, w: 1640, h: 1120, road: 72,
      ground: '#4f7a37', ground2: '#5c8a3f', dirt: '#8a6d45', trees: 0.9, pines: 0.3, junk: 0.05,
      pts: [[220, 560], [240, 320], [370, 190], [600, 180], [790, 270], [990, 190], [1240, 190], [1410, 330], [1420, 560], [1320, 790], [1110, 900], [910, 810], [700, 910], [450, 930], [270, 810]]
    },
    scrapyard: {
      name: 'SCRAPYARD RUN', kind: 'race', laps: 3, w: 1820, h: 1340, road: 70,
      ground: '#6b5b3e', ground2: '#76664a', dirt: '#5a4a33', trees: 0.25, pines: 0.15, junk: 0.9,
      pts: [[260, 310], [600, 210], [900, 330], [1160, 210], [1500, 260], [1610, 500], [1420, 660], [1110, 610], [900, 730], [1060, 910], [1500, 960], [1560, 1160], [1110, 1220], [610, 1160], [310, 1010], [460, 760], [260, 560]]
    },
    pit: {
      name: 'THE PIT', kind: 'derby', w: 1060, h: 840, cx: 530, cy: 420, rx: 470, ry: 360, time: 150,
      ground: '#7b6446', ground2: '#866e4e', dirt: '#6a5439', trees: 0, pines: 0, junk: 0.5
    }
  };

  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return [0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
            0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)];
  }

  // Sample the centre line every `step` pixels: x, y, tangent angle, distance along.
  function sampleTrack(pts, step) {
    const dense = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      for (let k = 0; k < 60; k++) dense.push(catmull(p0, p1, p2, p3, k / 60));
    }
    // resample at even spacing
    const out = { x: [], y: [], a: [], s: [] };
    let carry = 0, total = 0;
    out.x.push(dense[0][0]); out.y.push(dense[0][1]);
    for (let i = 1; i <= dense.length; i++) {
      const a = dense[i - 1], b = dense[i % dense.length];
      let seg = Math.hypot(b[0] - a[0], b[1] - a[1]), pos = 0;
      while (carry + seg - pos >= step) { pos += step - carry; carry = 0; const t = pos / seg; out.x.push(a[0] + (b[0] - a[0]) * t); out.y.push(a[1] + (b[1] - a[1]) * t); }
      carry += seg - pos; total += seg;
    }
    if (Math.hypot(out.x[out.x.length - 1] - out.x[0], out.y[out.y.length - 1] - out.y[0]) < step * 0.5) { out.x.pop(); out.y.pop(); }
    const N = out.x.length;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, h = (i - 1 + N) % N;
      out.a.push(Math.atan2(out.y[j] - out.y[h], out.x[j] - out.x[h]));
      out.s.push(i * step);
    }
    out.n = N; out.len = N * step; out.step = step;
    return out;
  }

  // A coarse grid: for each cell, the distance to the centre line and the nearest sample. Cells far from the road
  // keep a large distance.
  function distanceGrid(T, w, h, cell, reach) {
    const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell), dist = new Float32Array(gw * gh).fill(1e4), near = new Int32Array(gw * gh).fill(-1);
    const rc = Math.ceil(reach / cell);
    for (let i = 0; i < T.n; i++) {
      const cx = Math.floor(T.x[i] / cell), cy = Math.floor(T.y[i] / cell);
      for (let gy = Math.max(0, cy - rc); gy <= Math.min(gh - 1, cy + rc); gy++) for (let gx = Math.max(0, cx - rc); gx <= Math.min(gw - 1, cx + rc); gx++) {
        const d = Math.hypot((gx + 0.5) * cell - T.x[i], (gy + 0.5) * cell - T.y[i]), k = gy * gw + gx;
        if (d < dist[k]) { dist[k] = d; near[k] = i; }
      }
    }
    return { gw: gw, gh: gh, cell: cell, dist: dist, near: near,
      at: function (x, y) { const gx = Math.floor(x / cell), gy = Math.floor(y / cell); if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return 1e4; return dist[gy * gw + gx]; },
      nearest: function (x, y) { const gx = Math.floor(x / cell), gy = Math.floor(y / cell); if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return -1; return near[gy * gw + gx]; } };
  }

  global.Tracks = { VENUES: VENUES, sampleTrack: sampleTrack, distanceGrid: distanceGrid };
})(window);
