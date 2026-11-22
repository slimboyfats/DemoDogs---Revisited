// art.js: every stack in the game, generated at load time from small functions.
//
// A part is { w, h, layers, fn(x, y, z) } in art pixels: w runs front to back (+x is forward), h side to side.
// fn returns a material name or null. Shading is baked in the way the reference kit's build-art.js does it: a
// pixel with nothing above it gets its material's top tone, the rest a side tone (darker low on the part).
// The result is a strip canvas: the layers side by side, bottom first.
//
// Strips are canvases, so a car can own a private copy and have dents punched into it while it races.
(function (global) {
  'use strict';

  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function css(c) { return '#' + c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  // three tones from one colour: [side in shade, side, top]
  function tones(h) { const c = hex(h); return [css(c.map(function (v) { return v * 0.52; })), css(c.map(function (v) { return v * 0.78; })), css(c.map(function (v) { return v + (255 - v) * 0.14; }))]; }
  function hash(x, y, z) { let n = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }

  const COMMON = {
    under: ['#121317', '#1b1c21', '#26282e'],
    bumper: ['#4b4d54', '#72757d', '#a3a6ae'],
    glass: ['#16222f', '#24384a', '#5d8db0'],
    light: ['#c79f2c', '#f1cf52', '#fff2ae'],
    tail: ['#7c1a1f', '#b8262d', '#ff5b5b'],
    tire: ['#111113', '#1b1c1f', '#2a2b2f'],
    tread: ['#2a2b2f', '#3a3b40', '#4c4d53'],
    engine: ['#34363c', '#555861', '#8a8d97'],
    cage: ['#5b5e66', '#8a8d96', '#c3c6ce'],
    seat: ['#2a1d18', '#3d2a22', '#55392d'],
    bark: ['#3b2616', '#55361f', '#6e4728'],
    leaf: ['#1f4a24', '#2d6a32', '#3f8a3f'],
    leaf2: ['#24562a', '#357a38', '#55a04a'],
    pine: ['#173a2a', '#20503a', '#2f6b4b'],
    rubber: ['#141416', '#1d1e21', '#303136'],
    paintw: ['#9a9a9a', '#c9c9c9', '#f2f2f2'],
    paintr: ['#7a1d1d', '#b02a2a', '#e04646'],
    barrel: ['#7d1f12', '#b03019', '#d8492a'],
    band: ['#6b6e74', '#94979e', '#c4c7cd'],
    hazard: ['#8f7a12', '#d1b11c', '#f6d93b'],
    black: ['#141414', '#1f1f1f', '#2e2e2e'],
    wood: ['#6b4724', '#8f6232', '#b88447'],
    wood2: ['#553819', '#704b24', '#8f6232'],
    cone: ['#9c3c0c', '#e05a12', '#ff8a3a'],
    glow: ['#1b7f86', '#2fc0c9', '#a6fbff'],
    crate: ['#24324a', '#33476b', '#4d6799'],
    concrete: ['#6e6c67', '#94918a', '#bdbab2'],
    rust: ['#4a2a18', '#6b3d22', '#8d5631'],
    rust2: ['#3a2a20', '#54402e', '#6e5640'],
    botdark: ['#1e2026', '#2c2f37', '#414550'],
    boteye: ['#3fb9c9', '#7ff0ff', '#e6ffff'],
    mine: ['#2b2d33', '#3d4048', '#5b5f69'],
    minelit: ['#a01010', '#ff2a2a', '#ff9a9a'],
    rocket: ['#9fa3ab', '#cfd2d8', '#f4f5f7'],
    stone: ['#55575c', '#74767c', '#9a9ca1']
  };

  function build(part, materials) {
    const mats = materials || COMMON;
    const at = function (x, y, z) { return x < 0 || y < 0 || x >= part.w || y >= part.h || z < 0 || z >= part.layers ? null : part.fn(x + 0.5 - part.w / 2, y + 0.5 - part.h / 2, z); };
    const W = part.w * part.layers, cv = document.createElement('canvas');
    cv.width = W; cv.height = part.h;
    const g = cv.getContext('2d'), id = g.createImageData(W, part.h), px = id.data, cache = {};
    for (let z = 0; z < part.layers; z++) for (let y = 0; y < part.h; y++) for (let x = 0; x < part.w; x++) {
      const m = at(x, y, z); if (!m) continue;
      const tm = mats[m] || COMMON[m]; if (!tm) throw new Error('no material ' + m);
      const tone = !at(x, y, z + 1) ? 2 : z < part.layers / 3 ? 0 : 1, key = m + tone;
      const c = cache[key] || (cache[key] = hex(tm[tone])), j = (y * W + z * part.w + x) * 4;
      px[j] = c[0]; px[j + 1] = c[1]; px[j + 2] = c[2]; px[j + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return { img: cv, cw: part.w, ch: part.h, n: part.layers };
  }

  function clone(strip) {
    const cv = document.createElement('canvas'); cv.width = strip.img.width; cv.height = strip.img.height;
    cv.getContext('2d').drawImage(strip.img, 0, 0);
    return { img: cv, cw: strip.cw, ch: strip.ch, n: strip.n };
  }

  // Punch a dent into a strip: (lx, ly) in art pixels from the middle of the cell, x forward. Near the centre the
  // top layers are crushed away; around it the paint is scuffed darker. keep: layers at the bottom never removed.
  function dent(strip, lx, ly, r, power, keep) {
    const g = strip.img.getContext('2d'), W = strip.img.width, H = strip.img.height;
    const id = g.getImageData(0, 0, W, H), px = id.data, cx = strip.cw / 2 + lx, cy = strip.ch / 2 + ly;
    const crush = Math.min(strip.n - (keep || 1), Math.round(power * strip.n));
    for (let z = 0; z < strip.n; z++) for (let y = 0; y < strip.ch; y++) for (let x = 0; x < strip.cw; x++) {
      const j = (y * W + z * strip.cw + x) * 4; if (!px[j + 3]) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r; if (d > 1) continue;
      const fromTop = strip.n - 1 - z;
      if (z >= (keep || 1) && ((d < 0.55 && fromTop < crush) || (d < 0.85 && Math.random() < 0.35 * power))) { px[j + 3] = 0; continue; }
      const k = 0.62 + 0.3 * d;
      px[j] *= k; px[j + 1] *= k; px[j + 2] *= k;
    }
    g.putImageData(id, 0, 0);
  }

  // A burnt-out shell: everything charred and dark
  function char(strip) {
    const g = strip.img.getContext('2d');
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(20,14,10,0.78)'; g.fillRect(0, 0, strip.img.width, strip.img.height);
    g.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ helpers for shapes
  function rr(x, y, a, b, r) { const dx = Math.max(Math.abs(x) - (a - r), 0), dy = Math.max(Math.abs(y) - (b - r), 0); return Math.abs(x) <= a && Math.abs(y) <= b && dx * dx + dy * dy <= r * r; }
  function disc(x, y, r) { return x * x + y * y <= r * r; }

  // ------------------------------------------------------------------ the cars (all 26 x 14 cells, 9 layers)
  // Body sits on the wheels: layer 0 is the undertray. Wheels are separate stacks so they can steer and spin.
  const CAR_W = 26, CAR_H = 14, CAR_L = 9;
  const CARS = {
    mutt: {
      name: 'MUTT', blurb: 'Pickup. All-rounder.', paint: '#e2682a', a: 11.5, b: 5.6,
      speed: 1.0, accel: 1.0, grip: 1.0, mass: 1.0, armor: 1.0,
      wheels: [[7.2, 5.4], [-7.2, 5.4]],
      fn: function (x, y, z) {
        const a = 11.5, b = 5.6, ax = Math.abs(x), ay = Math.abs(y);
        if (z === 0) return rr(x, y, a - 1.5, b - 1.2, 1) ? 'under' : null;
        if (z <= 3) {
          if (!rr(x, y, a, b, 2)) return null;
          if (z === 2 && x > a - 1.3 && ay > 2.3 && ay < 4.6) return 'light';
          if (z === 2 && x < -a + 1.3 && ay > 2.6) return 'tail';
          if (z <= 2 && ax > a - 1.1) return 'bumper';
          if (z === 3 && x > 3.5 && ay < 1.1) return 'trim';
          return 'paint';
        }
        if (x > -2.6 && x < 4.6 && rr(x - 1, y, 3.6, 4.6, 1.2)) {
          if (z === 6) return 'paint';
          if (z <= 5 && (x > 3.4 || ay > 3.6 || x < -1.6)) return 'glass';
          return z <= 5 ? 'paint' : null;
        }
        if (z === 4 && x < -2.6 && x > -a + 0.5 && (ay > 4.4 || x < -a + 1.6) && rr(x, y, a - 0.4, b - 0.2, 1.6)) return 'paint';
        return null;
      },
      extras: { top: { w: 3, h: 10, layers: 1, x: 1, z: 7, fn: function (x, y) { return Math.abs(y) < 4.2 && Math.abs(x) < 1.2 ? (Math.abs(y) > 2.6 ? 'tail' : 'light') : null; } } }
    },
    bruiser: {
      name: 'BRUISER', blurb: 'Van. Heavy, hits hard, slow off the line.', paint: '#3a79d6', a: 11.5, b: 5.9,
      speed: 0.94, accel: 0.85, grip: 0.92, mass: 1.35, armor: 1.3,
      wheels: [[7.0, 5.6], [-7.4, 5.6]],
      fn: function (x, y, z) {
        const a = 11.5, b = 5.9, ay = Math.abs(y);
        if (z === 0) return rr(x, y, a - 1.5, b - 1.2, 1) ? 'under' : null;
        if (z <= 3) {
          if (!rr(x, y, a, b, 1.6)) return null;
          if (z === 2 && x > a - 1.3 && ay > 2.6 && ay < 4.8) return 'light';
          if (z === 2 && x < -a + 1.2 && ay > 3.2) return 'tail';
          if (z <= 2 && Math.abs(x) > a - 1.1) return 'bumper';
          return 'paint';
        }
        if (!(x < a - 3.8 && rr(x + 1.6, y, a - 2.4, b - 0.2, 1.6))) return null;
        if (z >= 5 && z <= 7 && x > a - 5.6) return 'glass';
        if ((z === 6 || z === 7) && ay > 4.9 && x > -6 && x < 3) return 'glass';
        if (z === 8) return ay < 1.2 ? 'trim' : 'paint';
        return 'paint';
      },
      extras: { top: { w: 10, h: 12, layers: 1, x: -3, z: 9, fn: function (x, y) { return (Math.abs(x) > 3.6 || Math.abs(y) > 4.4 || Math.abs(x) < 0.6) && Math.abs(x) < 4.6 && Math.abs(y) < 5.2 ? 'cage' : null; } } }
    },
    whippet: {
      name: 'WHIPPET', blurb: 'Muscle car. Fastest, fragile.', paint: '#d3323e', a: 12, b: 5.6,
      speed: 1.08, accel: 1.1, grip: 1.05, mass: 0.95, armor: 0.85,
      wheels: [[7.6, 5.4], [-7.4, 5.4]],
      fn: function (x, y, z) {
        const a = 12, b = 5.6, ay = Math.abs(y);
        if (z === 0) return rr(x, y, a - 1.5, b - 1.2, 1) ? 'under' : null;
        if (z <= 3) {
          if (!rr(x, y, a - (z === 3 ? 0.6 : 0), b - (z === 3 ? 0.3 : 0), 2.4)) return null;
          if (z === 2 && x > a - 1.4 && ay > 2.6 && ay < 4.6) return 'light';
          if (z === 2 && x < -a + 1.4 && ay > 2.4) return 'tail';
          if (z <= 1 && Math.abs(x) > a - 1.1) return 'bumper';
          if (z === 3 && ay > 0.5 && ay < 1.7 && (x > 1.5 || x < -6.5)) return 'trim';
          return 'paint';
        }
        if (z <= 5 && x > -6.5 && x < 2 && rr(x + 2.2, y, 4.3 - (z - 4) * 0.6, 4.6 - (z - 4) * 0.4, 1.4)) {
          if (z === 5) return 'paint';
          return x > 0.6 || x < -5.4 || ay > 3.7 ? 'glass' : 'paint';
        }
        return null;
      },
      extras: { top: { w: 3, h: 12, layers: 3, x: -10.6, z: 4, fn: function (x, y, z) { return z < 2 ? (Math.abs(Math.abs(y) - 3.6) < 0.7 && Math.abs(x) < 0.8 ? 'bumper' : null) : (Math.abs(y) < 5.4 && Math.abs(x) < 1.4 ? 'trim' : null); } } }
    },
    pug: {
      name: 'PUG', blurb: 'Dune buggy. Nimble and light.', paint: '#e6bf33', a: 10.5, b: 5.4,
      speed: 1.02, accel: 1.18, grip: 1.15, mass: 0.8, armor: 0.85,
      wheels: [[7.0, 5.6], [-6.8, 5.8]],
      fn: function (x, y, z) {
        const a = 10.5, b = 5.4, ay = Math.abs(y), ax = Math.abs(x);
        if (z === 0) return rr(x, y, a - 1.5, b - 1.2, 1) ? 'under' : null;
        if (!rr(x, y, a, b, 2)) return null;
        if (z === 1) return ax > a - 1 ? 'bumper' : 'paint';
        if (z === 2) { if (x > 5) return x > a - 1.2 && ay > 2 && ay < 4 ? 'light' : 'paint'; if (ay > 4.2) return 'paint'; if (x < -5) return 'engine'; return x > -3 && x < 1 && ay < 3.6 ? 'seat' : null; }
        if (z === 3) { if (x > 5 && x < 8 && ay < 4) return 'paint'; if (x < -5 && x > -a + 1 && ay < 3) return 'engine'; return x > -3 && x < -1 && ay < 3.6 ? 'seat' : null; }
        if (z === 4 && x < -6 && x > -9 && ay < 2.2) return 'engine';
        // the roll cage: four posts and a frame on top
        const post = (Math.abs(x - 3) < 0.8 || Math.abs(x + 4) < 0.8) && Math.abs(ay - 4) < 0.8;
        if (z >= 3 && z <= 5 && post) return 'cage';
        if (z === 6 && x > -4.8 && x < 3.8 && (Math.abs(ay - 4) < 0.8 || Math.abs(x - 3) < 0.8 || Math.abs(x + 4) < 0.8) && ay < 4.8) return 'cage';
        return null;
      },
      extras: { top: { w: 4, h: 8, layers: 1, x: -0.5, z: 7, fn: function (x, y) { return Math.abs(x) < 1.6 && Math.abs(y) < 3.2 ? 'light' : null; } } }
    }
  };
  const BUMPER = { w: 3, h: 14, layers: 2, fn: function (x, y) { return Math.abs(y) < 5.6 && Math.abs(x) < 1 ? 'bumper' : null; } };

  function wheelStrip(frame) {
    return { w: 6, h: 3, layers: 5, fn: function (x, y, z) {
      const zc = z + 0.5 - 2.5; if (x * x + zc * zc > 2.75 * 2.75) return null;
      const ang = Math.atan2(zc, x) / (Math.PI * 2) + 0.5, band = Math.floor(ang * 10 + frame / 3) % 2;
      return band ? 'tread' : 'tire';
    } };
  }

  function carMaterials(paint, trim) {
    return Object.assign({}, COMMON, { paint: tones(paint), trim: tones(trim || '#f1ede2') });
  }

  // ------------------------------------------------------------------ scenery and props
  const PROPS = {
    tree: { w: 20, h: 20, layers: 18, fn: function (x, y, z) {
      if (z < 7 && disc(x, y, z < 2 ? 2.4 : 1.7)) return 'bark';
      if (z < 5) return null;
      const t = (z - 4) / 14, r = 8.6 * Math.sin(Math.PI * Math.min(1, t * 1.05)) + 1.4 * (hash(Math.round(x), Math.round(y), z) - 0.5);
      if (!disc(x, y, Math.max(0, r))) return null;
      return hash(Math.round(x * 0.5), Math.round(y * 0.5), z >> 1) > 0.55 ? 'leaf2' : 'leaf';
    } },
    pine: { w: 16, h: 16, layers: 22, fn: function (x, y, z) {
      if (z < 5 && disc(x, y, 1.6)) return 'bark';
      if (z < 3) return null;
      const r = (22 - z) * 0.36 + ((z % 4) < 2 ? 0.9 : 0);
      return disc(x, y, r) ? 'pine' : null;
    } },
    tyres: { w: 10, h: 10, layers: 6, fn: function (x, y) { const d = x * x + y * y; return d < 4.7 * 4.7 && d > 1.8 * 1.8 ? 'rubber' : null; } },
    tyresR: { w: 10, h: 10, layers: 6, fn: function (x, y, z) { const d = x * x + y * y; return d < 4.7 * 4.7 && d > 1.8 * 1.8 ? ((z >> 1) % 2 ? 'paintw' : 'paintr') : null; } },
    barrel: { w: 9, h: 9, layers: 8, fn: function (x, y, z) { if (!disc(x, y, 3.8)) return null; if (z === 7) return disc(x, y, 1.4) ? 'hazard' : 'barrel'; return z === 2 || z === 5 ? 'band' : 'barrel'; } },
    crate: { w: 10, h: 10, layers: 9, fn: function (x, y, z) { const ax = Math.abs(x), ay = Math.abs(y); if (ax > 4.5 || ay > 4.5) return null; if (z === 8) return ax > 3.4 || ay > 3.4 || Math.abs(ax - ay) < 0.8 ? 'wood2' : 'wood'; return ax > 3.6 && ay > 3.6 || z === 0 || z === 4 ? 'wood2' : 'wood'; } },
    cone: { w: 6, h: 6, layers: 7, fn: function (x, y, z) { if (z === 0) return Math.abs(x) < 2.8 && Math.abs(y) < 2.8 ? 'black' : null; return disc(x, y, 2.6 - z * 0.33) ? (z === 3 || z === 4 ? 'paintw' : 'cone') : null; } },
    block: { w: 12, h: 6, layers: 5, fn: function (x, y, z) { if (Math.abs(x) > 5.7 || Math.abs(y) > 2.9 - z * 0.35) return null; return z === 3 ? (Math.floor((x + 6) / 3) % 2 ? 'hazard' : 'black') : 'concrete'; } },
    rock: { w: 14, h: 14, layers: 7, fn: function (x, y, z) { const r = 6.2 - z * 0.7 + 1.1 * (hash(Math.round(x), Math.round(y), 3) - 0.5); return disc(x, y * 1.15, r) ? 'stone' : null; } },
    pickup: { w: 8, h: 8, layers: 8, fn: function (x, y, z) { const ax = Math.abs(x), ay = Math.abs(y); if (ax > 3.6 || ay > 3.6) return null; const edge = (ax > 2.6) + (ay > 2.6) + (z === 0 || z === 7); return edge >= 2 ? 'glow' : 'crate'; } },
    mine: { w: 6, h: 6, layers: 2, fn: function (x, y, z) { if (!disc(x, y, 2.7)) return null; return z === 1 && disc(x, y, 0.9) ? 'minelit' : 'mine'; } },
    mineOff: { w: 6, h: 6, layers: 2, fn: function (x, y, z) { if (!disc(x, y, 2.7)) return null; return z === 1 && disc(x, y, 0.9) ? 'black' : 'mine'; } },
    rocket: { w: 8, h: 4, layers: 2, fn: function (x, y) { if (x < -2.5) return Math.abs(y) < 1.9 ? 'tail' : null; if (Math.abs(y) > 1) return null; return x > 2.4 ? 'tail' : 'rocket'; } },
    plank: { w: 8, h: 3, layers: 1, fn: function (x, y) { return Math.abs(y) < 1.2 ? 'wood' : null; } }
  };

  // the scrap bots: small walkers on the reference kit's gait and IK
  function botParts(paint) {
    const m = Object.assign({}, COMMON, { paint: tones(paint) });
    return {
      body: build({ w: 9, h: 9, layers: 7, fn: function (x, y, z) {
        const r = z === 6 ? 2.6 : 3.6; if (!rr(x, y, r, r, 1.4)) return null;
        if (x > 2.4 && z >= 3 && z <= 4 && Math.abs(y) < 1.4) return 'boteye';
        return z === 1 ? 'botdark' : 'paint';
      } }, m),
      aerial: build({ w: 3, h: 3, layers: 4, fn: function (x, y, z) { return z === 3 ? (disc(x, y, 1.2) ? 'light' : null) : disc(x, y, 0.5) ? 'cage' : null; } }, m),
      limb: build({ w: 3, h: 3, layers: 1, fn: function (x, y) { return disc(x, y, 1.15) ? 'botdark' : null; } }, m),
      foot: build({ w: 5, h: 3, layers: 2, fn: function (x, y, z) { return Math.abs(y) < 1.3 && x > -1.8 && x < (z ? 1 : 2.2) ? 'paint' : null; } }, m),
      chunk: build({ w: 4, h: 4, layers: 3, fn: function (x, y, z) { return disc(x, y, 1.8 - z * 0.3) ? (z === 1 ? 'botdark' : 'paint') : null; } }, m)
    };
  }

  global.Art = {
    COMMON: COMMON, CARS: CARS, PROPS: PROPS, BUMPER: BUMPER, CAR_W: CAR_W, CAR_H: CAR_H, CAR_L: CAR_L,
    tones: tones, hash: hash, build: build, clone: clone, dent: dent, char: char, rr: rr, disc: disc,
    wheelStrip: wheelStrip, carMaterials: carMaterials, botParts: botParts
  };
})(window);
