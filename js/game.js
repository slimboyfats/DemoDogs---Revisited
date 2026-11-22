// game.js: DemoDogs. Cars, scrap bots, weapons, the race and the derby, the camera, the HUD and the menus.
(function () {
  'use strict';
  const TAU = Math.PI * 2, DT = 1 / 60, PITCH = 56 * Math.PI / 180, CAR_R = 6.2, CAR_K = 5.5;
  const $ = function (id) { return document.getElementById(id); };
  const clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  const angDiff = function (a, b) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const rand = function (a, b) { return a + Math.random() * (b - a); };
  const pick = function (arr) { return arr[(Math.random() * arr.length) | 0]; };
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const params = new URLSearchParams(location.search);

  const canvas = $('game'), ctx = canvas.getContext('2d');
  const R = SpriteStack.createRenderer(ctx);
  let W = 0, H = 0, DPR = 1, SCALE = 4;

  function resize() {
    DPR = Math.min(2, global().devicePixelRatio || 1);
    W = Math.round(innerWidth * DPR); H = Math.round(innerHeight * DPR); canvas.width = W; canvas.height = H;
    const short = Math.min(W, H), long = Math.max(W, H);
    SCALE = Math.max(2, Math.round(Math.min(short / 180, long / 300) * 2) / 2);
    R.setView(SCALE, PITCH);
    if (G) buildMinimap();
  }
  function global() { return window; }

  // ------------------------------------------------------------------ art, built once
  const ART = { wheels: [0, 1, 2].map(function (f) { return Art.build(Art.wheelStrip(f)); }), props: {}, cars: {}, bots: [] };
  Object.keys(Art.PROPS).forEach(function (k) { ART.props[k] = Art.build(Art.PROPS[k]); });
  ART.bots = ['#e9c23b', '#3fb7a8', '#e3609a', '#8fd14f', '#f08a3c', '#b3b8c4'].map(Art.botParts);
  const C = Art.COMMON;
  ART.husk = Art.build({ w: Art.CAR_W, h: Art.CAR_H, layers: Art.CAR_L, fn: Art.CARS.mutt.fn }, Object.assign({}, C, { paint: C.rust, glass: C.under, light: C.rust2, tail: C.rust2, trim: C.rust2, bumper: C.rust2 }));
  ART.husk2 = Art.build({ w: Art.CAR_W, h: Art.CAR_H, layers: Art.CAR_L, fn: Art.CARS.bruiser.fn }, Object.assign({}, C, { paint: C.rust2, glass: C.under, light: C.rust, tail: C.rust, trim: C.rust, bumper: C.rust }));

  function carArt(type, paint) {
    const key = type + paint; if (ART.cars[key]) return ART.cars[key];
    const T = Art.CARS[type], m = Art.carMaterials(paint);
    return (ART.cars[key] = {
      body: Art.build({ w: Art.CAR_W, h: Art.CAR_H, layers: Art.CAR_L, fn: T.fn }, m),
      top: Art.build(T.extras.top, m), bumper: Art.build(Art.BUMPER, m),
      chunk: Art.build({ w: 5, h: 5, layers: 3, fn: function (x, y, z) { return Art.disc(x, y, 2.2 - z * 0.4) ? (z === 0 ? 'under' : 'paint') : null; } }, m)
    });
  }
  const CAR_KEYS = ['mutt', 'whippet', 'bruiser', 'pug'];
  const AI_PAINT = ['#4fbf6a', '#9b5bd6', '#e45fa8', '#34b6c2', '#8a8f99', '#f08c2a', '#5a6cf0', '#c9d23a'];
  const AI_NAMES = ['REX', 'BISCUIT', 'FANG', 'DOZER', 'GNASHER', 'SCRAPS', 'BONES', 'TANK'];

  // ------------------------------------------------------------------ world
  let G = null;

  function makeGround(V, T) {
    const cv = document.createElement('canvas'); cv.width = V.w; cv.height = V.h;
    const g = cv.getContext('2d'), r = rng(7);
    g.fillStyle = V.ground; g.fillRect(0, 0, V.w, V.h);
    for (let i = 0; i < V.w * V.h / 260; i++) { g.fillStyle = r() < 0.5 ? V.ground2 : V.dirt; g.globalAlpha = 0.35; const s = 2 + r() * 5; g.fillRect(r() * V.w, r() * V.h, s, s * 0.7); }
    g.globalAlpha = 1;
    if (V.kind === 'race') {
      const path = function () { g.beginPath(); g.moveTo(T.x[0], T.y[0]); for (let i = 1; i < T.n; i++) g.lineTo(T.x[i], T.y[i]); g.closePath(); };
      g.lineJoin = 'round'; g.lineCap = 'round';
      path(); g.strokeStyle = V.dirt; g.lineWidth = V.road + 30; g.stroke();
      path(); g.strokeStyle = '#efeae0'; g.lineWidth = V.road + 9; g.stroke();
      path(); g.strokeStyle = '#c8322e'; g.setLineDash([9, 9]); g.stroke(); g.setLineDash([]);
      path(); g.strokeStyle = '#47474d'; g.lineWidth = V.road; g.stroke();
      path(); g.strokeStyle = '#4f4f56'; g.lineWidth = V.road * 0.55; g.stroke();
      path(); g.strokeStyle = 'rgba(230,224,200,0.7)'; g.lineWidth = 2; g.setLineDash([12, 16]); g.stroke(); g.setLineDash([]);
      // the start line, a chequer across the road at sample 0, and the grid boxes behind it
      const a = T.a[0], nx = -Math.sin(a), ny = Math.cos(a), fx = Math.cos(a), fy = Math.sin(a);
      for (let k = -V.road / 2; k < V.road / 2; k += 4) for (let row = 0; row < 2; row++) {
        g.fillStyle = ((k / 4 + row) & 1) ? '#111' : '#f2f2f2';
        g.save(); g.translate(T.x[0] + nx * (k + 2) + fx * (row * 4 - 4), T.y[0] + ny * (k + 2) + fy * (row * 4 - 4)); g.rotate(a); g.fillRect(-2, -2, 4.4, 4.4); g.restore();
      }
      for (let slot = 0; slot < 6; slot++) {
        const i = (T.n - 6 - Math.floor(slot / 2) * 8 + T.n) % T.n, side = slot % 2 ? 1 : -1, x = T.x[i] + nx * side * V.road * 0.22, y = T.y[i] + ny * side * V.road * 0.22;
        g.save(); g.translate(x, y); g.rotate(T.a[i]); g.strokeStyle = 'rgba(240,240,240,0.55)'; g.lineWidth = 1.2; g.strokeRect(-11, -7, 24, 14); g.restore();
      }
    } else {
      g.fillStyle = '#4b4b50'; g.fillRect(0, 0, V.w, V.h);
      g.beginPath(); g.ellipse(V.cx, V.cy, V.rx + 6, V.ry + 6, 0, 0, TAU); g.fillStyle = V.dirt; g.fill();
      g.beginPath(); g.ellipse(V.cx, V.cy, V.rx - 2, V.ry - 2, 0, 0, TAU); g.fillStyle = V.ground; g.fill();
      for (let i = 0; i < 1600; i++) { const t = r() * TAU, q = Math.sqrt(r()) * 0.97; g.fillStyle = r() < 0.5 ? V.ground2 : V.dirt; g.globalAlpha = 0.4; g.fillRect(V.cx + Math.cos(t) * V.rx * q, V.cy + Math.sin(t) * V.ry * q, 3 + r() * 6, 2 + r() * 3); }
      g.globalAlpha = 1;
      g.beginPath(); g.ellipse(V.cx, V.cy, 70, 54, 0, 0, TAU); g.strokeStyle = 'rgba(240,230,200,0.35)'; g.lineWidth = 3; g.stroke();
    }
    // grain over everything, so the pixels read as texture when scaled up
    const id = g.getImageData(0, 0, V.w, V.h), px = id.data;
    for (let i = 0; i < px.length; i += 4) { const n = (r() - 0.5) * 16; px[i] += n; px[i + 1] += n; px[i + 2] += n; }
    g.putImageData(id, 0, 0);
    return { cv: cv, g: g };
  }

  function addStatic(list, kind, x, y, r, strip, opt) {
    const s = Object.assign({ kind: kind, x: x, y: y, r: r, strip: strip, rot: 0, sway: 0, seed: Math.random() * 10, col: true }, opt || {});
    list.push(s); return s;
  }
  function addProp(kind, x, y) {
    const spec = { barrel: [4.2, 0.45], crate: [5, 0.6], cone: [2.6, 0.12] }[kind];
    G.props.push({ kind: kind, x: x, y: y, z: 0, vx: 0, vy: 0, vz: 0, rot: Math.random() * TAU, spin: 0, r: spec[0], mass: spec[1], strip: ART.props[kind], alive: true });
  }
  function free(x, y, d) {
    for (const s of G.statics) if (Math.abs(s.x - x) < d + s.r && Math.abs(s.y - y) < d + s.r && Math.hypot(s.x - x, s.y - y) < d + s.r) return false;
    return true;
  }

  function buildScenery(V, T) {
    const S = G.statics, r = rng(V.kind === 'race' ? V.pts.length * 31 : 99), half = V.kind === 'race' ? V.road / 2 : 0;
    if (V.kind === 'race') {
      // tyre walls on the outside of the bends
      for (let i = 0; i < T.n; i += 3) {
        const k = angDiff(T.a[(i + 4) % T.n], T.a[(i - 4 + T.n) % T.n]); if (Math.abs(k) < 0.2) continue;
        const side = k > 0 ? -1 : 1, nx = -Math.sin(T.a[i]) * side, ny = Math.cos(T.a[i]) * side;
        const x = T.x[i] + nx * (half + 17), y = T.y[i] + ny * (half + 17);
        if (G.grid.at(x, y) < half + 12 || !free(x, y, 6)) continue;
        addStatic(S, 'tyres', x, y, 5, (i / 3) % 2 ? ART.props.tyres : ART.props.tyresR);
      }
      // trees, pines, rocks and scrap husks on the grass
      const area = V.w * V.h;
      for (let k = 0; k < area / 5200; k++) {
        const x = 30 + r() * (V.w - 60), y = 30 + r() * (V.h - 60), d = G.grid.at(x, y), roll = r();
        if (d < half + 34) continue;
        if (roll < V.junk * 0.18) { if (free(x, y, 18)) addStatic(S, 'husk', x, y, 9, r() < 0.5 ? ART.husk : ART.husk2, { rot: r() * TAU }); }
        else if (roll < V.junk * 0.18 + 0.06) { if (free(x, y, 12)) addStatic(S, 'rock', x, y, 6, ART.props.rock, { rot: r() * TAU }); }
        else if (r() < V.trees) { if (free(x, y, 14)) addStatic(S, r() < V.pines ? 'pine' : 'tree', x, y, 4, r() < V.pines ? ART.props.pine : ART.props.tree, { rot: r() * TAU, sway: 1 }); }
      }
      // props near the road: crates, barrels, cones
      for (let i = 9; i < T.n; i += 23) {
        const side = r() < 0.5 ? -1 : 1, nx = -Math.sin(T.a[i]) * side, ny = Math.cos(T.a[i]) * side, kind = r();
        const x = T.x[i] + nx * (half - 6), y = T.y[i] + ny * (half - 6);
        if (kind < 0.45) { addProp('cone', x, y); addProp('cone', x + Math.cos(T.a[i]) * 9, y + Math.sin(T.a[i]) * 9); }
        else if (kind < 0.75) { const x2 = T.x[i] + nx * (half + 24), y2 = T.y[i] + ny * (half + 24); if (free(x2, y2, 10)) { addProp('crate', x2, y2); addProp('crate', x2 + 10, y2 + 3); addProp('barrel', x2 + 4, y2 - 10); } }
        else { const x2 = T.x[i] + nx * (half + 22), y2 = T.y[i] + ny * (half + 22); if (free(x2, y2, 10)) { addProp('barrel', x2, y2); addProp('barrel', x2 + 8, y2 + 4); } }
      }
      // a tyre fence around the edge of the world (looks only; the edge itself is the wall)
      for (let x = 6; x < V.w; x += 10) { addStatic(S, 'tyres', x, 5, 5, ART.props.tyres, { col: false }); addStatic(S, 'tyres', x, V.h - 5, 5, ART.props.tyres, { col: false }); }
      for (let y = 15; y < V.h - 10; y += 10) { addStatic(S, 'tyres', 5, y, 5, ART.props.tyres, { col: false }); addStatic(S, 'tyres', V.w - 5, y, 5, ART.props.tyres, { col: false }); }
    } else {
      // the wall of the bowl: concrete blocks around the oval
      const per = Math.PI * (3 * (V.rx + V.ry) - Math.sqrt((3 * V.rx + V.ry) * (V.rx + 3 * V.ry)));
      const n = Math.round(per / 12);
      for (let i = 0; i < n; i++) {
        const t = i / n * TAU, x = V.cx + Math.cos(t) * (V.rx + 3), y = V.cy + Math.sin(t) * (V.ry + 3);
        const tx = -Math.sin(t) * V.rx, ty = Math.cos(t) * V.ry;
        addStatic(S, 'block', x, y, 6, ART.props.block, { rot: Math.atan2(ty, tx), col: false });
      }
      // junk in the middle and scattered
      addStatic(S, 'husk', V.cx - 40, V.cy - 10, 9, ART.husk, { rot: 0.4 }); addStatic(S, 'husk', V.cx + 36, V.cy + 14, 9, ART.husk2, { rot: 2.6 });
      for (let i = 0; i < 10; i++) { const t = i / 10 * TAU; addStatic(S, 'tyres', V.cx + Math.cos(t) * 64, V.cy + Math.sin(t) * 50, 5, i % 2 ? ART.props.tyres : ART.props.tyresR); }
      for (let k = 0; k < 8; k++) { const t = r() * TAU, q = 0.45 + r() * 0.35, x = V.cx + Math.cos(t) * V.rx * q, y = V.cy + Math.sin(t) * V.ry * q; if (free(x, y, 22)) addStatic(S, r() < 0.5 ? 'rock' : 'husk', x, y, r() < 0.5 ? 6 : 9, r() < 0.5 ? ART.props.rock : ART.husk, { rot: r() * TAU }); }
      for (let k = 0; k < 26; k++) { const t = r() * TAU, q = 0.3 + r() * 0.6, x = V.cx + Math.cos(t) * V.rx * q, y = V.cy + Math.sin(t) * V.ry * q; addProp(r() < 0.5 ? 'barrel' : 'crate', x, y); }
      for (let k = 0; k < 16; k++) { const t = r() * TAU, q = 0.2 + r() * 0.7; addProp('cone', V.cx + Math.cos(t) * V.rx * q, V.cy + Math.sin(t) * V.ry * q); }
    }
  }

  function makeCar(type, paint, isPlayer, name) {
    const T = Art.CARS[type], A = carArt(type, paint);
    return {
      T: T, type: type, A: A, body: Art.clone(A.body), paint: paint, isPlayer: isPlayer, name: name,
      x: 0, y: 0, z: 0, vz: 0, h: 0, vx: 0, vy: 0, vf: 0, spin: 0, steerVis: 0, throttle: 0, boosting: false, handbrake: false,
      nitro: 1, hp: 100, wheelDist: 0, roll: 0, lurch: 0, bounce: 0, wrecked: false, wreckT: 0,
      idx: 0, lap: 0, progress: 0, finished: false, finishTime: 0, place: 0, wrongT: 0,
      score: 0, wrecks: 0, smashed: 0, weapon: null, ammo: 0, invuln: 0, fireCd: 0, hitCd: 0, scrapeCd: 0,
      has: { front: true, rear: true, top: true }, smokeT: 0, aiSpeed: 1,
      ai: isPlayer && !params.has('autoplay') ? null : { lane: rand(-0.5, 0.5), seed: Math.random() * 100, skill: rand(0.9, 1.0), aggro: rand(0.25, 0.8), stuckT: 0, revT: 0, boostT: 0, target: null, targetT: 0 }
    };
  }

  function placeOnTrack(car, i, side) {
    const T = G.T, V = G.V, a = T.a[i];
    car.x = T.x[i] - Math.sin(a) * side * V.road * 0.22; car.y = T.y[i] + Math.cos(a) * side * V.road * 0.22; car.h = a; car.idx = i;
  }

  function newGame(venueKey, playerType) {
    const V = Tracks.VENUES[venueKey];
    G = { key: venueKey, V: V, kind: V.kind, T: null, grid: null, statics: [], props: [], cars: [], bots: [], debris: [], rockets: [], mines: [], pickups: [], parts: [], fx: [], texts: [],
      time: 0, raceTime: 0, state: 'countdown', countdown: 3.6, lastBeep: 4, finishers: [], endT: -1, shake: 0, cam: { x: 0, y: 0 }, msg: '', msgT: 0, playerType: playerType, over: false };
    if (V.kind === 'race') { G.T = Tracks.sampleTrack(V.pts, 4); G.grid = Tracks.distanceGrid(G.T, V.w, V.h, 6, V.road / 2 + 80); }
    const gr = makeGround(V, G.T); G.ground = gr.cv; G.gctx = gr.g;
    buildScenery(V, G.T);

    // the field: the player and five rivals, all different paint
    const paints = AI_PAINT.slice().sort(function () { return Math.random() - 0.5; }), names = AI_NAMES.slice().sort(function () { return Math.random() - 0.5; });
    const player = makeCar(playerType, Art.CARS[playerType].paint, true, 'YOU');
    const rivals = [];
    for (let i = 0; i < 5; i++) rivals.push(makeCar(CAR_KEYS[(CAR_KEYS.indexOf(playerType) + 1 + i) % 4], paints[i], false, names[i]));
    if (V.kind === 'race') {
      const order = rivals.slice(0, 3).concat([player]).concat(rivals.slice(3));   // the player starts mid-pack
      order.forEach(function (c, k) { placeOnTrack(c, (G.T.n - 6 - Math.floor(k / 2) * 8 + G.T.n) % G.T.n, k % 2 ? 1 : -1); c.lap = 0; });
      G.cars = order;
      // pickups: rows of three across the road
      for (let q = 1; q <= 4; q++) {
        const i = Math.floor(G.T.n * q / 4.6) % G.T.n, a = G.T.a[i];
        for (let k = -1; k <= 1; k++) G.pickups.push({ x: G.T.x[i] - Math.sin(a) * k * V.road * 0.3, y: G.T.y[i] + Math.cos(a) * k * V.road * 0.3, on: true, t: 0 });
      }
    } else {
      const all = [player].concat(rivals);
      all.forEach(function (c, k) { const t = k / all.length * TAU + 0.3; c.x = V.cx + Math.cos(t) * V.rx * 0.7; c.y = V.cy + Math.sin(t) * V.ry * 0.7; c.h = t + Math.PI; });
      G.cars = all;
      for (let k = 0; k < 8; k++) { const t = k / 8 * TAU + 0.2, q = k % 2 ? 0.35 : 0.62; G.pickups.push({ x: V.cx + Math.cos(t) * V.rx * q, y: V.cy + Math.sin(t) * V.ry * q, on: true, t: 0 }); }
      G.timeLeft = V.time;
    }
    G.player = G.cars.find(function (c) { return c.isPlayer; });
    // scrap bots
    const nBots = V.kind === 'race' ? 16 : 14;
    for (let i = 0; i < nBots; i++) { const b = makeBot(); spawnBot(b, true); G.bots.push(b); }
    G.cam.x = G.player.x; G.cam.y = G.player.y;
    buildMinimap(); updateFireButton();
  }

  // ------------------------------------------------------------------ scrap bots: tiny walkers that wander the course
  function makeBot() {
    const w = Rig.createWalker({ thigh: 3.4, shin: 3.6, ankle: 0.8, hipHalf: 2.2, standHip: 6.2, stride: 9, duty: 0.58, lift: 2.2, bob: 0.45, twist: 0.12, spine: 6, arms: false, kneeHint: -1 });
    return { w: w, art: pick(ART.bots), x: 0, y: 0, h: 0, tx: 0, ty: 0, alive: true, deadT: 0, speed: 0, hopZ: 0 };
  }
  function botSpot(farFromPlayer) {
    const V = G.V;
    for (let tries = 0; tries < 30; tries++) {
      let x, y;
      if (G.kind === 'race') { const i = (Math.random() * G.T.n) | 0, off = rand(-1, 1) * (V.road / 2 + 30); x = G.T.x[i] - Math.sin(G.T.a[i]) * off; y = G.T.y[i] + Math.cos(G.T.a[i]) * off; }
      else { const t = Math.random() * TAU, q = Math.sqrt(Math.random()) * 0.85; x = V.cx + Math.cos(t) * V.rx * q; y = V.cy + Math.sin(t) * V.ry * q; }
      if (farFromPlayer && G.player && Math.hypot(x - G.player.x, y - G.player.y) < 260) continue;
      if (!free(x, y, 6)) continue;
      return [x, y];
    }
    return [V.w / 2, V.h / 2];
  }
  function spawnBot(b, initial) {
    const p = botSpot(!initial); b.x = p[0]; b.y = p[1]; b.h = Math.random() * TAU; b.alive = true; b.art = pick(ART.bots);
    if (initial && G.kind === 'race' && Math.hypot(b.x - G.player.x, b.y - G.player.y) < 120) { const q = botSpot(true); b.x = q[0]; b.y = q[1]; }
    Rig.place(b.w, b.x, b.y, b.h); const t = botSpot(false); b.tx = t[0]; b.ty = t[1];
  }
  function updateBot(b) {
    if (!b.alive) { b.deadT -= DT; if (b.deadT <= 0) spawnBot(b, false); return; }
    // flee the nearest fast car, otherwise stroll to a target
    let fx = 0, fy = 0, scared = false;
    for (const c of G.cars) {
      if (c.wrecked) continue; const dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy), sp = Math.hypot(c.vx, c.vy);
      if (d < 64 && sp > 30) { scared = true; fx += dx / (d + 1); fy += dy / (d + 1); }
    }
    let want;
    if (scared) { want = Math.atan2(fy, fx); b.speed += (40 - b.speed) * 0.1; }
    else {
      if (Math.hypot(b.tx - b.x, b.ty - b.y) < 8) { const t = botSpot(false); b.tx = t[0]; b.ty = t[1]; }
      want = Math.atan2(b.ty - b.y, b.tx - b.x); b.speed += (17 - b.speed) * 0.05;
    }
    b.h += clamp(angDiff(want, b.h), -5 * DT, 5 * DT);
    let nx = b.x + Math.cos(b.h) * b.speed * DT, ny = b.y + Math.sin(b.h) * b.speed * DT;
    for (const s of G.statics) if (s.col && Math.abs(s.x - nx) < s.r + 4 && Math.abs(s.y - ny) < s.r + 4) { const d = Math.hypot(nx - s.x, ny - s.y) || 1; if (d < s.r + 3.5) { nx = s.x + (nx - s.x) / d * (s.r + 3.5); ny = s.y + (ny - s.y) / d * (s.r + 3.5); const t = botSpot(false); b.tx = t[0]; b.ty = t[1]; } }
    const p = keepInside(nx, ny, 5); b.x = p[0]; b.y = p[1];
    Rig.step(b.w, b.x, b.y, b.h, DT);
    // cars
    for (const c of G.cars) {
      const d = Math.hypot(b.x - c.x, b.y - c.y);
      if (d < 12 && c.z < 8) {
        const sp = Math.hypot(c.vx, c.vy);
        if (sp > 24 && !c.wrecked) { smashBot(b, c); return; }
        const k = (12 - d) / (d || 1); b.x += (b.x - c.x) * k; b.y += (b.y - c.y) * k; Rig.place(b.w, b.x, b.y, b.h);
      }
    }
  }
  function smashBot(b, c) {
    b.alive = false; b.deadT = rand(4, 8);
    const sp = Math.hypot(c.vx, c.vy), ux = c.vx / (sp || 1), uy = c.vy / (sp || 1);
    G.debris.push({ strip: b.art.body, x: b.x, y: b.y, z: 4, vx: ux * sp * 0.9 + rand(-20, 20), vy: uy * sp * 0.9 + rand(-20, 20), vz: rand(110, 170), rot: b.h, spin: rand(-12, 12), life: 7 });
    for (let i = 0; i < 5; i++) G.debris.push({ strip: i < 2 ? b.art.foot : b.art.chunk, x: b.x, y: b.y, z: 3, vx: ux * sp * 0.6 + rand(-60, 60), vy: uy * sp * 0.6 + rand(-60, 60), vz: rand(70, 160), rot: rand(0, TAU), spin: rand(-15, 15), life: 6 });
    for (let i = 0; i < 14; i++) spark(b.x, b.y, 5, sp * 0.3);
    for (let i = 0; i < 4; i++) puff(b.x, b.y, 4, 'smoke');
    splat(b.x, b.y);
    c.score += 100; c.smashed++; c.nitro = Math.min(1, c.nitro + 0.22);
    c.vx *= 0.94; c.vy *= 0.94;
    if (c.isPlayer) { floatText(b.x, b.y, pick(['SCRAPPED!', 'CLANK!', 'BOT BOWLED!', 'BOLTS!']) + ' +100', '#7ff0ff'); Sound.smash(); }
    else if (near(b.x, b.y, 220)) Sound.smash();
  }

  // ------------------------------------------------------------------ effects
  function spark(x, y, z, sp) { if (G.fx.length > 700) return; const a = rand(0, TAU), v = rand(20, 60) + (sp || 0) * Math.random(); G.fx.push({ kind: 'spark', x: x, y: y, z: z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(30, 110), life: rand(0.25, 0.55), max: 0.55, size: 1 }); }
  function puff(x, y, z, kind, vx, vy) { if (G.fx.length > 700) return; G.fx.push({ kind: kind, x: x + rand(-2, 2), y: y + rand(-2, 2), z: z, vx: (vx || 0) + rand(-8, 8), vy: (vy || 0) + rand(-8, 8), vz: kind === 'fire' ? rand(18, 36) : rand(8, 20), life: kind === 'fire' ? rand(0.3, 0.6) : rand(0.8, 1.6), max: kind === 'fire' ? 0.6 : 1.6, size: kind === 'fire' ? rand(1.5, 3) : rand(2, 3.5) }); }
  function floatText(x, y, text, col, big) { G.texts.push({ x: x, y: y, z: 18, text: text, col: col || '#fff', life: big ? 1.8 : 1.2, max: big ? 1.8 : 1.2, big: !!big }); }
  function splat(x, y) { const g = G.gctx; g.fillStyle = 'rgba(16,14,20,0.55)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(x + rand(-6, 6), y + rand(-5, 5), rand(1.5, 4), 0, TAU); g.fill(); } g.fillStyle = 'rgba(60,200,220,0.25)'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); }
  function scorch(x, y, r) { const g = G.gctx, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(10,8,6,0.6)'); gr.addColorStop(1, 'rgba(10,8,6,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  function skid(x, y, a) { const g = G.gctx; g.fillStyle = a; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2); }
  function near(x, y, d) { return Math.hypot(x - G.player.x, y - G.player.y) < d; }
  function vol(x, y) { return clamp(1 - Math.hypot(x - G.player.x, y - G.player.y) / 380, 0, 1); }

  function explode(x, y, power, owner) {
    for (let i = 0; i < 18 * power; i++) puff(x, y, rand(1, 8), 'fire', rand(-40, 40), rand(-40, 40));
    for (let i = 0; i < 12 * power; i++) puff(x, y, rand(2, 10), 'smoke', rand(-25, 25), rand(-25, 25));
    for (let i = 0; i < 16; i++) spark(x, y, 4, 120);
    scorch(x, y, 16 * power);
    const v = vol(x, y); if (v > 0) Sound.boom(v);
    if (near(x, y, 160)) G.shake = Math.max(G.shake, 9 * power * v);
    const rad = 48 * power;
    for (const c of G.cars) {
      const dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy); if (d > rad) continue;
      const k = 1 - d / rad;
      c.vx += dx / (d || 1) * 230 * k; c.vy += dy / (d || 1) * 230 * k; c.vz = Math.max(c.vz, 150 * k); c.z = Math.max(c.z, 0.5); c.spin += rand(-6, 6) * k;
      damage(c, 36 * k * power, owner && owner !== c ? owner : null, x, y);
    }
    for (const b of G.bots) if (b.alive && Math.hypot(b.x - x, b.y - y) < rad) { if (owner) smashBot(b, owner); else { b.alive = false; b.deadT = 5; G.debris.push({ strip: b.art.body, x: b.x, y: b.y, z: 4, vx: rand(-80, 80), vy: rand(-80, 80), vz: 160, rot: 0, spin: 10, life: 6 }); } }
    for (const p of G.props) {
      if (!p.alive) continue; const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy); if (d > rad * 1.2 || d < 0.01) continue;
      const k = 1 - d / (rad * 1.2);
      if (p.kind === 'barrel' && !p.fuse) { p.fuse = 0.12 + Math.random() * 0.12; p.owner = owner; }
      else if (p.kind === 'crate' && k > 0.4) breakCrate(p);
      p.vx += dx / d * 260 * k; p.vy += dy / d * 260 * k; p.vz = 170 * k; p.spin += rand(-10, 10);
    }
  }
  function breakCrate(p) {
    p.alive = false;
    for (let i = 0; i < 6; i++) G.debris.push({ strip: ART.props.plank, x: p.x, y: p.y, z: rand(1, 6), vx: p.vx * 0.5 + rand(-60, 60), vy: p.vy * 0.5 + rand(-60, 60), vz: rand(60, 140), rot: rand(0, TAU), spin: rand(-12, 12), life: 5 });
    for (let i = 0; i < 4; i++) puff(p.x, p.y, 4, 'smoke');
    if (near(p.x, p.y, 250)) Sound.crash(20);
  }

  // ------------------------------------------------------------------ damage and wrecks
  function toLocal(c, x, y) { const cs = Math.cos(c.h), sn = Math.sin(c.h), dx = x - c.x, dy = y - c.y; return [dx * cs + dy * sn, -dx * sn + dy * cs]; }
  function damage(c, amount, by, px, py) {
    if (c.wrecked || c.invuln > 0 || amount <= 0.5 || G.state !== 'race') return;
    amount *= (G.kind === 'derby' ? 0.3 : 0.9) / c.T.armor; c.hp -= amount;
    const L = toLocal(c, px, py), lx = clamp(L[0], -12, 12), ly = clamp(L[1], -6, 6);
    Art.dent(c.body, lx * 0.9, ly * 0.85, clamp(3 + amount * 0.14, 3, 7), clamp(amount / 45, 0.05, 0.6), 1);
    if (c.hp < 74 || (amount > 14 && lx < -7)) detach(c, 'rear');
    if (c.hp < 52 || (amount > 18 && lx > 7)) detach(c, 'front');
    if (c.hp < 34) detach(c, 'top');
    if (by && by !== c && !by.wrecked) {
      by.score += Math.round(amount * 3);
      if (by.isPlayer && amount > 9) floatText(c.x, c.y, '+' + Math.round(amount * 3), '#ffd24a');
    }
    if (c.isPlayer && amount > 6) G.shake = Math.max(G.shake, Math.min(10, amount * 0.35));
    if (c.hp <= 0) wreck(c, by);
  }
  function detach(c, which) {
    if (!c.has[which]) return; c.has[which] = false;
    const cs = Math.cos(c.h), sn = Math.sin(c.h), ex = c.T.extras.top;
    const off = which === 'front' ? c.T.a + 0.5 : which === 'rear' ? -c.T.a - 0.5 : ex.x;
    G.debris.push({ strip: which === 'top' ? c.A.top : c.A.bumper, x: c.x + cs * off, y: c.y + sn * off, z: c.z + (which === 'top' ? ex.z : 1), vx: c.vx * 0.5 + rand(-50, 50), vy: c.vy * 0.5 + rand(-50, 50), vz: rand(70, 140), rot: c.h, spin: rand(-9, 9), life: 9 });
    for (let i = 0; i < 6; i++) spark(c.x + cs * off, c.y + sn * off, 3, 60);
  }
  function wreck(c, by) {
    c.wrecked = true; c.wreckT = 0; c.hp = 0; Art.char(c.body); detach(c, 'front'); detach(c, 'rear'); detach(c, 'top');
    c.vz = 140; c.z = Math.max(c.z, 0.5); c.spin += rand(-8, 8); c.weapon = null; c.ammo = 0;
    for (let i = 0; i < 4; i++) G.debris.push({ strip: c.A.chunk, x: c.x, y: c.y, z: 4, vx: rand(-90, 90), vy: rand(-90, 90), vz: rand(90, 180), rot: rand(0, TAU), spin: rand(-14, 14), life: 7 });
    explode(c.x, c.y, 0.5, null);
    if (by && by !== c) { by.wrecks++; by.score += 500; if (by.isPlayer) floatText(c.x, c.y, 'WRECKED ' + c.name + '! +500', '#ff6a3d', true); }
    if (c.isPlayer) { setMsg(G.kind === 'race' ? 'TOTALLED! TOWING YOU BACK' : 'YOU ARE SCRAP', 2.4); }
    else if (G.kind === 'derby' && near(c.x, c.y, 300) && !(by && by.isPlayer)) floatText(c.x, c.y, c.name + ' IS OUT', '#ffb08a');
    if (c.isPlayer) updateFireButton();
  }
  function respawn(c) {
    const T = G.T, i = (c.idx - 2 + T.n) % T.n;
    c.body = Art.clone(c.A.body); c.has = { front: true, rear: true, top: true }; c.hp = 100; c.wrecked = false;
    placeOnTrack(c, i, 0); c.vx = c.vy = c.vz = c.z = c.spin = 0; c.invuln = 2.2; c.nitro = Math.max(c.nitro, 0.5);
    let tries = 0; while (tries++ < 6 && G.cars.some(function (o) { return o !== c && Math.hypot(o.x - c.x, o.y - c.y) < 18; })) { c.x -= Math.sin(c.h) * 14; c.y += Math.cos(c.h) * 14; }
    for (let k = 0; k < 6; k++) puff(c.x, c.y, 2, 'smoke');
  }

  // ------------------------------------------------------------------ driving
  function surfaceOff(c) { return G.kind === 'race' && G.grid.at(c.x, c.y) > G.V.road / 2 + 3; }

  function drive(c, ctl) {
    const T = c.T, cs0 = Math.cos(c.h), sn0 = Math.sin(c.h), off = surfaceOff(c), airborne = c.z > 0.6;
    let vf = c.vx * cs0 + c.vy * sn0;
    const weak = c.hp < 35 ? 0.86 : 1;
    // steering turns the car; the speed it already has keeps going the way it was, and grip pulls it round
    const grip = clamp(Math.abs(vf) / 50, 0, 1);
    c.handbrake = ctl.brake && vf > 45 && Math.abs(ctl.steer) > 0.3;
    let turn = ctl.steer * 3.0 * T.grip * grip * Math.sign(vf || 1) * (c.handbrake ? 1.4 : 1);
    if (c.hp < 30) turn += Math.sin(G.time * 9 + c.wheelDist * 0.05) * 0.25 * grip;
    if (airborne) turn *= 0.15;
    c.h += (turn + c.spin) * DT; c.spin *= Math.exp(-3.5 * DT);
    const cs = Math.cos(c.h), sn = Math.sin(c.h);
    vf = c.vx * cs + c.vy * sn; let vl = -c.vx * sn + c.vy * cs;
    const boost = ctl.boost && c.nitro > 0.02 && !airborne;
    c.boosting = boost;
    if (boost) c.nitro = Math.max(0, c.nitro - 0.32 * DT); else c.nitro = Math.min(1, c.nitro + 0.025 * DT);
    const maxS = 178 * T.speed * weak * (off ? 0.56 : 1) * (boost ? 1.33 : 1) * c.aiSpeed;
    const before = vf;
    if (!airborne) {
      if (ctl.brake) {
        if (vf > 15) vf -= 330 * DT; else { vf -= 150 * DT; if (vf < -72) vf = -72; }
      } else if (ctl.throttle > 0) {
        const acc = 240 * T.accel * (boost ? 1.8 : 1);
        if (vf < maxS) vf += acc * ctl.throttle * DT * clamp(1.05 - vf / (maxS * 1.1), 0.12, 1);
      }
      vf -= vf * (off ? 1.4 : 0.42) * DT;
      if (vf > maxS) vf -= (vf - maxS) * 2.6 * DT;
      const lg = 8 * T.grip * (off ? 0.55 : 1) * (c.handbrake ? 0.22 : 1);
      vl *= Math.exp(-lg * DT);
    }
    c.vx = cs * vf - sn * vl; c.vy = sn * vf + cs * vl; c.vf = vf;
    c.x += c.vx * DT; c.y += c.vy * DT;
    // height: jumps from blasts and bounces on landing
    if (c.z > 0 || c.vz !== 0) { c.vz -= 420 * DT; c.z += c.vz * DT; if (c.z <= 0) { c.z = 0; if (c.vz < -90) { c.vz = -c.vz * 0.3; if (near(c.x, c.y, 300)) Sound.crash(10); } else c.vz = 0; } }
    // the stack's animation: body lean in corners, squat under power, nose-dive on brakes, rattle on grass
    const lat = vf * (turn) * 0.0045 - vl * 0.012;
    c.roll += (clamp(lat, -1.6, 1.6) - c.roll) * Math.min(1, 9 * DT);
    c.lurch += (clamp((vf - before) / DT * -0.004, -1.2, 1.2) - c.lurch) * Math.min(1, 8 * DT);
    c.bounce = off && Math.abs(vf) > 30 ? (Math.random() < 0.3 ? rand(0, 0.8) : c.bounce * 0.7) : c.bounce * 0.8;
    c.wheelDist += vf * DT; c.steerVis += (ctl.steer - c.steerVis) * Math.min(1, 12 * DT);
    c.throttle = ctl.throttle;
    // marks, smoke and flame
    if (!airborne && !c.wrecked) {
      const slide = Math.abs(vl) > 38 || c.handbrake || (boost && vf < 70) || (ctl.brake && vf > 60);
      if (slide) for (const sgn of [-1, 1]) { const wx = -7, wy = 5.4 * sgn; skid(c.x + cs * wx - sn * wy, c.y + sn * wx + cs * wy, off ? 'rgba(60,40,20,0.3)' : 'rgba(18,16,14,0.3)'); }
      if (slide && Math.random() < 0.3) puff(c.x - cs * 9, c.y - sn * 9, 1, 'smoke');
      if (off && Math.abs(vf) > 50 && Math.random() < 0.25) puff(c.x - cs * 9, c.y - sn * 9, 1, 'dust');
      if (boost) for (let i = 0; i < 2; i++) G.fx.push({ kind: 'flame', x: c.x - cs * (c.T.a + 2), y: c.y - sn * (c.T.a + 2), z: 3, vx: -cs * 60 + rand(-10, 10), vy: -sn * 60 + rand(-10, 10), vz: rand(-4, 6), life: rand(0.12, 0.22), max: 0.22, size: rand(1.4, 2.4) });
    }
    if (c.wrecked || c.hp < 50) {
      c.smokeT -= DT;
      if (c.smokeT <= 0) { c.smokeT = c.wrecked ? 0.05 : c.hp < 25 ? 0.07 : 0.16; puff(c.x + cs * 6, c.y + sn * 6, 6, 'smoke'); if (c.wrecked || c.hp < 20) puff(c.x + cs * 6, c.y + sn * 6, 5, 'fire'); }
    }
  }

  function keepInside(x, y, r) {
    const V = G.V;
    if (G.kind === 'race') return [clamp(x, 10 + r, V.w - 10 - r), clamp(y, 10 + r, V.h - 10 - r)];
    const ex = (x - V.cx) / V.rx, ey = (y - V.cy) / V.ry, q = Math.hypot(ex, ey), lim = 1 - r / ((V.rx + V.ry) / 2);
    if (q <= lim) return [x, y];
    return [V.cx + (x - V.cx) * lim / q, V.cy + (y - V.cy) * lim / q];
  }

  function circles(c) { const cs = Math.cos(c.h), sn = Math.sin(c.h); return [[c.x + cs * CAR_K, c.y + sn * CAR_K], [c.x - cs * CAR_K, c.y - sn * CAR_K]]; }

  // a car against something that does not move
  function bump(c, px, py, nx, ny, depth, hard) {
    c.x += nx * depth; c.y += ny * depth;
    const vn = c.vx * nx + c.vy * ny; if (vn >= 0) return;
    c.vx -= 1.35 * vn * nx; c.vy -= 1.35 * vn * ny;
    const L = toLocal(c, px, py); c.spin += clamp(L[1] * vn * 0.004 * Math.sign(L[0] || 1), -4, 4);
    const impact = -vn;
    if (impact > 30) { if (c.hitCd <= 0) { c.hitCd = 0.15; damage(c, (impact - 28) * 0.24 * (hard || 1), null, px, py); for (let i = 0; i < 6; i++) spark(px, py, 3, impact * 0.4); const v = vol(px, py); if (v > 0) Sound.crash(impact * 0.5 * v); } }
    else if (impact > 8 && c.scrapeCd <= 0) { c.scrapeCd = 0.12; spark(px, py, 3, 20); if (c.isPlayer) Sound.scrape(); }
  }

  function collideWorld(c) {
    const V = G.V;
    for (const p of circles(c)) {
      if (G.kind === 'race') {
        if (p[0] < 10 + CAR_R) bump(c, p[0] - CAR_R, p[1], 1, 0, 10 + CAR_R - p[0]);
        if (p[0] > V.w - 10 - CAR_R) bump(c, p[0] + CAR_R, p[1], -1, 0, p[0] - (V.w - 10 - CAR_R));
        if (p[1] < 10 + CAR_R) bump(c, p[0], p[1] - CAR_R, 0, 1, 10 + CAR_R - p[1]);
        if (p[1] > V.h - 10 - CAR_R) bump(c, p[0], p[1] + CAR_R, 0, -1, p[1] - (V.h - 10 - CAR_R));
      } else {
        const ex = (p[0] - V.cx) / V.rx, ey = (p[1] - V.cy) / V.ry, q = Math.hypot(ex, ey), lim = 1 - CAR_R / ((V.rx + V.ry) / 2);
        if (q > lim) {
          let nx = -ex / V.rx, ny = -ey / V.ry; const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
          const depth = (q - lim) * (V.rx + V.ry) / 2;
          bump(c, p[0] - nx * CAR_R, p[1] - ny * CAR_R, nx, ny, depth, 1.1);
        }
      }
    }
    for (const s of G.statics) {
      if (!s.col || Math.abs(s.x - c.x) > s.r + 16 || Math.abs(s.y - c.y) > s.r + 16) continue;
      for (const p of circles(c)) {
        const dx = p[0] - s.x, dy = p[1] - s.y, d = Math.hypot(dx, dy), m = s.r + CAR_R;
        if (d < m && d > 0.001) bump(c, s.x + dx / d * s.r, s.y + dy / d * s.r, dx / d, dy / d, m - d, s.kind === 'tyres' ? 0.5 : 1);
      }
    }
    // a wrecked car in the derby stays where it died, as an obstacle
  }

  function collideCars(a, b) {
    if (Math.abs(a.x - b.x) > 30 || Math.abs(a.y - b.y) > 30 || Math.abs(a.z - b.z) > 10) return;
    const pa = circles(a), pb = circles(b);
    let best = null;
    for (const p of pa) for (const q of pb) {
      const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy), ov = CAR_R * 2 - d;
      if (ov > 0 && (!best || ov > best.ov)) best = { p: p, q: q, d: d, ov: ov, nx: d > 0.001 ? dx / d : 1, ny: d > 0.001 ? dy / d : 0 };
    }
    if (!best) return;
    const ma = a.T.mass * (a.wrecked ? 1.6 : 1), mb = b.T.mass * (b.wrecked ? 1.6 : 1), tot = ma + mb;
    a.x -= best.nx * best.ov * mb / tot; a.y -= best.ny * best.ov * mb / tot;
    b.x += best.nx * best.ov * ma / tot; b.y += best.ny * best.ov * ma / tot;
    const vrel = (b.vx - a.vx) * best.nx + (b.vy - a.vy) * best.ny;
    if (vrel >= 0) return;
    const j = -(1 + 0.32) * vrel / (1 / ma + 1 / mb);
    a.vx -= j / ma * best.nx; a.vy -= j / ma * best.ny; b.vx += j / mb * best.nx; b.vy += j / mb * best.ny;
    const px = best.p[0] + best.nx * CAR_R, py = best.p[1] + best.ny * CAR_R;
    // spin: a hit off the car's centre line turns it
    const ra = toLocal(a, px, py), rb = toLocal(b, px, py);
    a.spin += clamp(-ra[1] * j * 0.0016 / ma * Math.sign(ra[0] + 0.01), -5, 5); b.spin += clamp(rb[1] * j * 0.0016 / mb * Math.sign(rb[0] + 0.01), -5, 5);
    const impact = -vrel;
    if (impact < 20) { if (impact > 8 && (a.isPlayer || b.isPlayer) && a.scrapeCd <= 0) { a.scrapeCd = 0.1; spark(px, py, 3, 20); Sound.scrape(); } return; }
    // who hit whom: the front of a car is its ram, a door is soft
    const zoneMul = function (L) { return L[0] > 6 ? 0.45 : Math.abs(L[0]) < 5 ? 1.35 : 0.9; };
    const base = (impact - 20) * 0.28;
    const da = base * zoneMul(ra) * mb / 1.1, db = base * zoneMul(rb) * ma / 1.1;
    // a pinned pair keeps touching: only the first knock of a shove does damage
    const fresh = a.hitCd <= 0 && b.hitCd <= 0; a.hitCd = b.hitCd = 0.3;
    if (fresh) { damage(a, da, b, px, py); damage(b, db, a, px, py); }
    if (a.ai && G.kind === 'derby' && impact > 60) a.ai.revT = rand(0.3, 0.7);
    if (b.ai && G.kind === 'derby' && impact > 60) b.ai.revT = rand(0.3, 0.7);
    for (let i = 0; i < 6 + impact * 0.1; i++) spark(px, py, 4, impact * 0.5);
    if (impact > 60) puff(px, py, 4, 'smoke');
    const v = vol(px, py); if (v > 0) Sound.crash(impact * v);
  }

  function collideProps(c) {
    for (const p of G.props) {
      if (!p.alive || p.z > 10 || Math.abs(p.x - c.x) > 22 || Math.abs(p.y - c.y) > 22) continue;
      for (const q of circles(c)) {
        const dx = p.x - q[0], dy = p.y - q[1], d = Math.hypot(dx, dy), m = p.r + CAR_R;
        if (d >= m || d < 0.001) continue;
        const nx = dx / d, ny = dy / d; p.x += nx * (m - d); p.y += ny * (m - d);
        const vrel = (p.vx - c.vx) * nx + (p.vy - c.vy) * ny; if (vrel >= 0) continue;
        const mc = c.T.mass * 3, j = -(1.5) * vrel / (1 / mc + 1 / p.mass);
        p.vx += j / p.mass * nx; p.vy += j / p.mass * ny; c.vx -= j / mc * nx; c.vy -= j / mc * ny;
        const impact = -vrel; p.spin += rand(-1, 1) * impact * 0.15;
        if (p.kind === 'cone') { p.vz = Math.max(p.vz, impact * 0.7); if (c.isPlayer && impact > 40) Sound.scrape(); }
        else if (p.kind === 'crate') { if (impact > 55) { breakCrate(p); if (c.isPlayer) { c.score += 25; floatText(p.x, p.y, '+25', '#ffd24a'); } } else p.vz = Math.max(p.vz, impact * 0.3); }
        else if (p.kind === 'barrel') { if (impact > 75 && !p.fuse) { p.fuse = 0.05; p.owner = c; } else { p.vz = Math.max(p.vz, impact * 0.25); if (near(p.x, p.y, 200)) Sound.crash(impact * 0.25); } }
      }
    }
  }

  function updateProps() {
    for (const p of G.props) {
      if (!p.alive) continue;
      if (p.fuse) { p.fuse -= DT; if (Math.random() < 0.5) puff(p.x, p.y, 8, 'fire'); if (p.fuse <= 0) { p.alive = false; explode(p.x, p.y, 1.1, p.owner || null); continue; } }
      p.x += p.vx * DT; p.y += p.vy * DT; p.rot += p.spin * DT;
      if (p.z > 0 || p.vz) { p.vz -= 400 * DT; p.z += p.vz * DT; if (p.z <= 0) { p.z = 0; p.vz = p.vz < -60 ? -p.vz * 0.35 : 0; } }
      if (p.z <= 0) { const f = Math.exp(-4 * DT); p.vx *= f; p.vy *= f; p.spin *= f; }
      const k = keepInside(p.x, p.y, p.r); if (k[0] !== p.x || k[1] !== p.y) { p.x = k[0]; p.y = k[1]; p.vx *= -0.4; p.vy *= -0.4; }
      for (const s of G.statics) if (s.col && Math.abs(s.x - p.x) < s.r + p.r && Math.abs(s.y - p.y) < s.r + p.r) { const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1, m = s.r + p.r; if (d < m) { p.x = s.x + dx / d * m; p.y = s.y + dy / d * m; p.vx *= -0.4; p.vy *= -0.4; } }
    }
  }

  function updateDebris() {
    for (let i = G.debris.length - 1; i >= 0; i--) {
      const d = G.debris[i]; d.life -= DT; if (d.life <= 0) { G.debris.splice(i, 1); continue; }
      d.x += d.vx * DT; d.y += d.vy * DT; d.rot += d.spin * DT; d.vz -= 400 * DT; d.z += d.vz * DT;
      if (d.z <= 0) { d.z = 0; d.vz = d.vz < -50 ? -d.vz * 0.35 : 0; const f = Math.exp(-5 * DT); d.vx *= f; d.vy *= f; d.spin *= f; }
      const k = keepInside(d.x, d.y, 3); d.x = k[0]; d.y = k[1];
    }
    if (G.debris.length > 160) G.debris.splice(0, G.debris.length - 160);
  }

  // ------------------------------------------------------------------ weapons and pickups
  const WEAPONS = { rocket: { name: 'ROCKETS', ammo: 3 }, mine: { name: 'MINES', ammo: 3 } };
  function updatePickups() {
    for (const p of G.pickups) {
      p.t += DT; if (!p.on) { if (p.t > 7) { p.on = true; p.t = 0; } continue; }
      for (const c of G.cars) {
        if (c.wrecked || Math.hypot(c.x - p.x, c.y - p.y) > 13) continue;
        p.on = false; p.t = 0;
        const roll = Math.random(), hurt = c.hp < 70;
        let got;
        if (roll < (hurt ? 0.4 : 0.15)) { c.hp = Math.min(100, c.hp + 45); got = 'REPAIR +45'; if (c.isPlayer) Sound.repair(); }
        else if (roll < (hurt ? 0.55 : 0.32)) { c.nitro = 1; got = 'BOOST REFILL'; if (c.isPlayer) Sound.nitro(); }
        else { const w = Math.random() < 0.55 ? 'rocket' : 'mine'; c.weapon = w; c.ammo = WEAPONS[w].ammo; got = WEAPONS[w].name + ' x' + c.ammo; if (c.isPlayer) Sound.pickup(); }
        if (c.isPlayer) { floatText(p.x, p.y, got, '#a6fbff'); updateFireButton(); }
        for (let i = 0; i < 8; i++) spark(p.x, p.y, 6, 30);
        break;
      }
    }
  }
  function fire(c) {
    if (!c.weapon || c.ammo <= 0 || c.fireCd > 0 || c.wrecked) return;
    const cs = Math.cos(c.h), sn = Math.sin(c.h); c.fireCd = 0.4; c.ammo--;
    if (c.weapon === 'rocket') { G.rockets.push({ x: c.x + cs * 15, y: c.y + sn * 15, h: c.h, v: 340 + Math.max(0, c.vf), owner: c, life: 2.0 }); if (vol(c.x, c.y) > 0) Sound.fire(); }
    else { G.mines.push({ x: c.x - cs * 15, y: c.y - sn * 15, owner: c, arm: 0.7, t: 0 }); if (c.isPlayer) Sound.drop(); }
    if (c.ammo <= 0) c.weapon = null;
    if (c.isPlayer) updateFireButton();
  }
  function updateRockets() {
    for (let i = G.rockets.length - 1; i >= 0; i--) {
      const r = G.rockets[i]; r.life -= DT;
      // a little homing: rockets lean towards a car in front of them
      let best = null, bd = 160;
      for (const c of G.cars) { if (c === r.owner || c.wrecked) continue; const d = Math.hypot(c.x - r.x, c.y - r.y), a = Math.abs(angDiff(Math.atan2(c.y - r.y, c.x - r.x), r.h)); if (d < bd && a < 0.5) { bd = d; best = c; } }
      if (best) r.h += clamp(angDiff(Math.atan2(best.y - r.y, best.x - r.x), r.h), -2.2 * DT, 2.2 * DT);
      r.x += Math.cos(r.h) * r.v * DT; r.y += Math.sin(r.h) * r.v * DT;
      if (Math.random() < 0.8) puff(r.x - Math.cos(r.h) * 4, r.y - Math.sin(r.h) * 4, 4, 'smoke');
      let hit = r.life <= 0;
      const k = keepInside(r.x, r.y, 2); if (k[0] !== r.x || k[1] !== r.y) hit = true;
      if (!hit) for (const c of G.cars) if (c !== r.owner && Math.hypot(c.x - r.x, c.y - r.y) < 10 && c.z < 10) { hit = true; break; }
      if (!hit) for (const s of G.statics) if (s.col && Math.abs(s.x - r.x) < s.r + 3 && Math.abs(s.y - r.y) < s.r + 3 && Math.hypot(s.x - r.x, s.y - r.y) < s.r + 2) { hit = true; break; }
      if (!hit) for (const p of G.props) if (p.alive && p.kind !== 'cone' && Math.hypot(p.x - r.x, p.y - r.y) < p.r + 2) { hit = true; break; }
      if (hit) { G.rockets.splice(i, 1); explode(r.x, r.y, 0.85, r.owner); }
    }
  }
  function updateMines() {
    for (let i = G.mines.length - 1; i >= 0; i--) {
      const m = G.mines[i]; m.t += DT; if (m.t < m.arm) continue;
      for (const c of G.cars) {
        if (c.wrecked || (c === m.owner && m.t < 2) || c.z > 6) continue;
        if (Math.hypot(c.x - m.x, c.y - m.y) < 11) { G.mines.splice(i, 1); explode(m.x, m.y, 0.95, m.owner); break; }
      }
    }
    if (G.mines.length > 14) G.mines.splice(0, 1);
  }

  // ------------------------------------------------------------------ the rivals
  function aiRace(c) {
    const T = G.T, N = T.n, ai = c.ai, sp = c.vf, V = G.V;
    const k = Math.round((26 + Math.abs(sp) * 0.5) / T.step), i2 = (c.idx + k) % N;
    const lane = clamp(ai.lane + Math.sin(G.time * 0.35 + ai.seed) * 0.25, -0.6, 0.6);
    let tx = T.x[i2] - Math.sin(T.a[i2]) * lane * V.road / 2, ty = T.y[i2] + Math.cos(T.a[i2]) * lane * V.road / 2;
    // pick a fight with a car just ahead, or grab a pickup in reach
    let prey = null, pd = 75;
    for (const o of G.cars) { if (o === c || o.wrecked) continue; const d = Math.hypot(o.x - c.x, o.y - c.y), a = Math.abs(angDiff(Math.atan2(o.y - c.y, o.x - c.x), c.h)); if (d < pd && a < 0.8) { pd = d; prey = o; } }
    if (prey && ai.aggro > 0.35 && Math.abs(angDiff(T.a[prey.idx], T.a[c.idx])) < 0.6) { tx = tx * 0.35 + (prey.x + prey.vx * 0.2) * 0.65; ty = ty * 0.35 + (prey.y + prey.vy * 0.2) * 0.65; }
    else if (!c.weapon) for (const p of G.pickups) { if (!p.on) continue; const d = Math.hypot(p.x - c.x, p.y - c.y); if (d < 70 && Math.abs(angDiff(Math.atan2(p.y - c.y, p.x - c.x), c.h)) < 0.5) { tx = p.x; ty = p.y; break; } }
    const d = angDiff(Math.atan2(ty - c.y, tx - c.x), c.h);
    const out = { steer: clamp(d * 2.6, -1, 1), throttle: 1, brake: false, boost: false, fire: false };
    const curv = Math.abs(angDiff(T.a[(c.idx + Math.round(k * 2.2)) % N], T.a[c.idx]));
    const target = 178 * c.T.speed * (1 - Math.min(0.5, curv * 0.5));
    if (sp > target + 25) out.brake = true; else if (sp > target) out.throttle = 0.3;
    if (Math.abs(d) > 1.1 && sp > 70) out.throttle = 0.25;
    if (ai.boostT > 0) { ai.boostT -= DT; out.boost = true; } else if (curv < 0.15 && c.nitro > 0.5 && Math.random() < 0.006) ai.boostT = 1.3;
    // weapons
    if (c.weapon === 'rocket' && prey && pd < 200 && Math.abs(d) < 0.2) out.fire = true;
    if (c.weapon === 'mine') for (const o of G.cars) { if (o !== c && !o.wrecked && Math.hypot(o.x - c.x, o.y - c.y) < 70 && Math.abs(angDiff(Math.atan2(o.y - c.y, o.x - c.x), c.h)) > 2.5) { out.fire = true; break; } }
    // rubber band so the pack stays a fight
    if (G.player && G.player !== c) { const gap = c.progress - G.player.progress; c.aiSpeed = ai.skill * (gap > 300 ? 0.9 : gap < -300 ? 1.07 : 1); } else c.aiSpeed = 1;
    return unstick(c, out);
  }
  function aiDerby(c) {
    const ai = c.ai, V = G.V;
    ai.targetT -= DT;
    if (ai.targetT <= 0 || !ai.target || ai.target.wrecked) {
      ai.targetT = rand(1.5, 3.5); let best = null, bd = 1e9;
      for (const o of G.cars) { if (o === c || o.wrecked) continue; const d = Math.hypot(o.x - c.x, o.y - c.y) * (o.isPlayer ? 0.75 : 1) * rand(0.8, 1.2); if (d < bd) { bd = d; best = o; } }
      ai.target = best;
    }
    let tx = V.cx, ty = V.cy;
    if (ai.target) { tx = ai.target.x + ai.target.vx * 0.3; ty = ai.target.y + ai.target.vy * 0.3; }
    if (!c.weapon && Math.random() < 0.004) { const p = G.pickups.find(function (p) { return p.on; }); if (p) { ai.target = null; ai.targetT = 2; tx = p.x; ty = p.y; } }
    const ex = (c.x - V.cx) / V.rx, ey = (c.y - V.cy) / V.ry, q = Math.hypot(ex, ey);
    if (q > 0.78) { const w = clamp((q - 0.78) * 3.5, 0, 0.9); tx = tx * (1 - w) + V.cx * w; ty = ty * (1 - w) + V.cy * w; }
    const d = angDiff(Math.atan2(ty - c.y, tx - c.x), c.h);
    const out = { steer: clamp(d * 2.6, -1, 1), throttle: 1, brake: Math.abs(d) > 1.9 && c.vf > 40, boost: false, fire: false };
    if (ai.target && Math.abs(d) < 0.25 && Math.hypot(tx - c.x, ty - c.y) < 120 && c.nitro > 0.3 && Math.random() < 0.03) ai.boostT = 0.8;
    if (ai.boostT > 0) { ai.boostT -= DT; out.boost = true; }
    if (c.weapon === 'rocket' && ai.target && Math.abs(d) < 0.2) out.fire = true;
    if (c.weapon === 'mine' && Math.random() < 0.01) out.fire = true;
    c.aiSpeed = ai.skill * 0.95;
    return unstick(c, out);
  }
  function unstick(c, out) {
    const ai = c.ai;
    if (ai.revT > 0) { ai.revT -= DT; return { steer: -out.steer || 1, throttle: 0, brake: true, boost: false, fire: false }; }
    if (out.throttle > 0.5 && Math.abs(c.vf) < 12) { ai.stuckT += DT; if (ai.stuckT > 0.9) { ai.stuckT = 0; ai.revT = rand(0.6, 1.0); } } else ai.stuckT = Math.max(0, ai.stuckT - DT);
    return out;
  }

  // ------------------------------------------------------------------ race order
  function trackIndex(c) {
    const T = G.T, N = T.n; let best = c.idx, bd = 1e12;
    for (let o = -24; o <= 24; o++) { const i = (c.idx + o + N) % N, dx = T.x[i] - c.x, dy = T.y[i] - c.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    if (bd > 130 * 130) { const g = G.grid.nearest(c.x, c.y); if (g >= 0) best = g; }
    const delta = best - c.idx;
    if (delta < -N / 2) c.lap++; else if (delta > N / 2) c.lap--;
    c.idx = best; c.progress = c.lap * T.len + T.s[best];
    if (!c.finished && c.lap > G.V.laps) { c.finished = true; c.finishTime = G.raceTime; G.finishers.push(c); if (c.isPlayer) { G.endT = 2.8; setMsg(placeName(G.finishers.length) + ' PLACE!', 3); } }
    if (c.isPlayer) {
      const wrong = Math.abs(angDiff(c.h, T.a[best])) > 2.1 && c.vf > 15;
      c.wrongT = wrong ? c.wrongT + DT : 0;
    }
  }
  function placeName(n) { return n + (n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH'); }
  function standings() {
    if (G.kind === 'race') {
      const rest = G.cars.filter(function (c) { return !c.finished; }).sort(function (a, b) { return b.progress - a.progress; });
      return G.finishers.concat(rest);
    }
    return G.cars.slice().sort(function (a, b) { return (a.wrecked - b.wrecked) || (a.wrecked && b.wrecked ? b.wreckAt - a.wreckAt : 0) || (b.score - a.score); });
  }
  function setMsg(m, t) { G.msg = m; G.msgT = t; }

  // ------------------------------------------------------------------ the step
  function step() {
    G.time += DT;
    if (G.state === 'countdown') {
      G.countdown -= DT; const n = Math.ceil(G.countdown);
      if (n !== G.lastBeep && n >= 1 && n <= 3) { G.lastBeep = n; Sound.beep(false); }
      if (G.countdown <= 0) { G.state = 'race'; Sound.beep(true); setMsg('GO!', 0.9); }
    } else if (G.state === 'race') G.raceTime += DT;
    const live = G.state === 'race';
    for (const c of G.cars) {
      c.invuln = Math.max(0, c.invuln - DT); c.fireCd -= DT; c.hitCd -= DT; c.scrapeCd -= DT;
      let ctl = { steer: 0, throttle: 0, brake: false, boost: false, fire: false };
      if (c.wrecked) { c.wreckT += DT; if (G.kind === 'race' && c.wreckT > 2.6) respawn(c); }
      else if (live) ctl = c.ai ? (G.kind === 'race' ? aiRace(c) : aiDerby(c)) : Input.read(c.h);
      else if (c.isPlayer) { const k = Input.read(c.h); c.throttle = k.throttle; }
      if (c.finished && c.ai === null) ctl = { steer: 0, throttle: 0, brake: true, boost: false, fire: false };
      if (live || c.wrecked) drive(c, ctl); else { c.roll *= 0.9; c.bounce = c.isPlayer && c.throttle > 0 ? rand(0, 0.4) : 0; }
      if (ctl.fire) fire(c);
    }
    for (let i = 0; i < G.cars.length; i++) for (let j = i + 1; j < G.cars.length; j++) collideCars(G.cars[i], G.cars[j]);
    for (const c of G.cars) { collideWorld(c); collideProps(c); if (G.kind === 'race') trackIndex(c); }
    for (const c of G.cars) if (c.wrecked && c.wreckAt === undefined) c.wreckAt = G.time; else if (!c.wrecked) c.wreckAt = undefined;
    for (const b of G.bots) updateBot(b);
    updateProps(); updateDebris(); updatePickups(); updateRockets(); updateMines();
    for (let i = G.fx.length - 1; i >= 0; i--) {
      const f = G.fx[i]; f.life -= DT; if (f.life <= 0) { G.fx.splice(i, 1); continue; }
      f.x += f.vx * DT; f.y += f.vy * DT; f.z += f.vz * DT;
      if (f.kind === 'spark') { f.vz -= 300 * DT; if (f.z < 0) { f.z = 0; f.vz *= -0.4; } }
      else { f.vx *= 0.96; f.vy *= 0.96; }
    }
    for (let i = G.texts.length - 1; i >= 0; i--) { const t = G.texts[i]; t.life -= DT; t.z += 14 * DT; if (t.life <= 0) G.texts.splice(i, 1); }
    G.msgT -= DT; G.shake *= Math.exp(-8 * DT);
    // the end
    const P = G.player;
    if (G.kind === 'derby' && live) {
      G.timeLeft -= DT;
      const alive = G.cars.filter(function (c) { return !c.wrecked; });
      if (G.endT < 0 && (alive.length <= 1 || P.wrecked || G.timeLeft <= 0)) { G.endT = P.wrecked ? 2.6 : 2; if (!P.wrecked) setMsg(alive.length <= 1 ? 'LAST DOG STANDING!' : 'TIME!', 3); }
    }
    if (G.endT > 0) { G.endT -= DT; if (G.endT <= 0) finish(); }
    if (P.isPlayer && !P.ai) Sound.engineSet(Math.abs(P.vf), P.throttle, P.boosting);
    // camera: ahead of the car, the way it is going
    const lead = 0.42, tx = P.x + clamp(P.vx * lead, -110, 110), ty = P.y + clamp(P.vy * lead, -80, 80);
    G.cam.x += (tx - G.cam.x) * Math.min(1, 4 * DT); G.cam.y += (ty - G.cam.y) * Math.min(1, 4 * DT);
  }

  // ------------------------------------------------------------------ drawing
  function drawCar(c) {
    if (!R.visible(c.x, c.y, 20, 14)) return;
    R.group(c.y);
    const cs = Math.cos(c.h), sn = Math.sin(c.h), T = c.T;
    const alpha = c.invuln > 0 && Math.floor(G.time * 12) % 2 ? 0.4 : 1;
    const frame = ((Math.floor(c.wheelDist / 2.2) % 3) + 3) % 3, z = c.z;
    for (const w of T.wheels) for (const sg of [-1, 1]) {
      const wx = w[0], wy = w[1] * sg, front = wx > 0;
      R.stack(ART.wheels[frame], c.x + cs * wx - sn * wy, c.y + sn * wx + cs * wy, z, c.h + (front && !c.wrecked ? c.steerVis * 0.45 : 0), alpha);
    }
    // the body: each slice shifted a little more than the one below, so the stack leans into corners and squats
    const n = c.body.n, rx = -sn, ry = cs;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), o = c.roll * t, l = c.lurch * t;
      R.slice(c.body, i, c.x + rx * o + cs * l, c.y + ry * o + sn * l, z + 0.6 + i + c.bounce, c.h, 1, alpha);
    }
    const top = T.extras.top, o = c.roll, l = c.lurch;
    if (c.has.front) R.stack(c.A.bumper, c.x + cs * (T.a + 0.6) + rx * o * 0.15, c.y + sn * (T.a + 0.6) + ry * o * 0.15, z + 1.4 + c.bounce, c.h, alpha);
    if (c.has.rear) R.stack(c.A.bumper, c.x - cs * (T.a + 0.6) + rx * o * 0.15, c.y - sn * (T.a + 0.6) + ry * o * 0.15, z + 1.4 + c.bounce, c.h, alpha);
    if (c.has.top) R.stack(c.A.top, c.x + cs * (top.x + l) + rx * o, c.y + sn * (top.x + l) + ry * o, z + 0.6 + top.z + c.bounce, c.h, alpha);
  }
  function drawBot(b) {
    if (!b.alive || !R.visible(b.x, b.y, 10, 14)) return;
    R.group(b.y);
    const P = Rig.pose(b.w), A = b.art;
    for (let i = 0; i < 2; i++) { const L = P.legs[i]; R.stack(A.foot, L.sole[0], L.sole[1], L.sole[2], L.rot); R.limb(A.limb, L.ankle, L.knee, 3); R.limb(A.limb, L.knee, L.hip, 3); }
    const z0 = P.pelvis[2] - 1, a = P.heading + (P.hipsAngle - P.heading) * 0.6;
    R.stack(A.body, P.x, P.y, z0, a);
    R.stack(A.aerial, P.x - Math.cos(a) * 1.4, P.y - Math.sin(a) * 1.4, z0 + A.body.n, a);
  }
  // Static stacks are baked once per strip and angle into a canvas (the camera never turns, so they always look
  // the same) and then drawn as one image. The cache is cleared when the zoom changes.
  let bakeCache = {}, bakeScale = 0;
  function baked(strip, rot) {
    if (bakeScale !== SCALE) { bakeCache = {}; bakeScale = SCALE; }
    const q = Math.round(rot / (TAU / 32)) & 31, key = (strip.id || (strip.id = Math.random().toString(36).slice(2))) + q;
    if (bakeCache[key]) return bakeCache[key];
    const diag = Math.hypot(strip.cw, strip.ch), w = Math.ceil(diag * SCALE) + 4, gy = Math.ceil(strip.n * R.zk + diag * SCALE * R.ys / 2) + 3;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = gy * 2;
    const r2 = SpriteStack.createRenderer(cv.getContext('2d')); r2.setView(SCALE, PITCH); r2.begin(0, 0, w, gy * 2);
    r2.stack(strip, 0, 0, 0, q * TAU / 32); r2.flush();
    return (bakeCache[key] = { img: cv, ax: Math.round(w / 2), ay: gy });
  }
  function drawStatic(s) {
    if (!R.visible(s.x, s.y, s.r + 12, s.strip.n)) return;
    R.group(s.y);
    if (!s.sway) { const b = baked(s.strip, s.rot); R.image(b.img, s.x, s.y, b.ax, b.ay); return; }
    if (s.sway) {
      // trees sway: the higher the slice, the further it moves
      const w = Math.sin(G.time * 1.3 + s.seed) * 0.9 + Math.sin(G.time * 2.9 + s.seed * 2) * 0.3;
      for (let i = 0; i < s.strip.n; i++) { const t = i / s.strip.n, o = w * t * t * 1.8; R.slice(s.strip, i, s.x + o, s.y + o * 0.4, i, s.rot, 1); }
    } else R.stack(s.strip, s.x, s.y, 0, s.rot);
  }
  function shadow(x, y, rx, ry, rot, a) {
    const sx = R.sx(x), sy = R.sy(y, 0);
    ctx.globalAlpha = a; ctx.beginPath(); ctx.ellipse(sx, sy, rx * SCALE, ry * SCALE * R.ys, Math.atan2(Math.sin(rot) * R.ys, Math.cos(rot)), 0, TAU); ctx.fill();
  }

  function render() {
    const P = G.player;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    ctx.fillStyle = G.kind === 'race' ? '#2d3a24' : '#3a3a3e'; ctx.fillRect(0, 0, W, H);
    const shx = (Math.random() - 0.5) * G.shake, shy = (Math.random() - 0.5) * G.shake;
    R.begin(G.cam.x + shx / SCALE, G.cam.y + shy / SCALE, W, H);
    // the ground: only the part on screen, scaled up with hard pixels
    const vw = W / SCALE, vh = H / (SCALE * R.ys), x0 = G.cam.x - vw / 2 - 2, y0 = G.cam.y - vh / 2 - 2;
    const sx0 = Math.max(0, Math.floor(x0)), sy0 = Math.max(0, Math.floor(y0)), sx1 = Math.min(G.V.w, Math.ceil(x0 + vw + 4)), sy1 = Math.min(G.V.h, Math.ceil(y0 + vh + 30));
    ctx.imageSmoothingEnabled = false;
    if (sx1 > sx0 && sy1 > sy0) ctx.drawImage(G.ground, sx0, sy0, sx1 - sx0, sy1 - sy0, R.sx(sx0), R.sy(sy0), (sx1 - sx0) * SCALE, (sy1 - sy0) * SCALE * R.ys);
    // shadows
    ctx.fillStyle = '#000';
    for (const s of G.statics) if ((s.kind === 'tree' || s.kind === 'pine') && R.visible(s.x, s.y, 14)) shadow(s.x + 3, s.y + 2, s.kind === 'tree' ? 9 : 6.5, s.kind === 'tree' ? 8 : 6, 0, 0.22);
    for (const c of G.cars) if (R.visible(c.x, c.y, 20)) shadow(c.x + 1.5, c.y + 1.5, 13.5 * (1 - Math.min(0.4, c.z / 80)), 7.5, c.h, 0.3);
    for (const b of G.bots) if (b.alive && R.visible(b.x, b.y, 8)) shadow(b.x, b.y, 4, 3, 0, 0.25);
    ctx.globalAlpha = 1;
    // stacks
    for (const s of G.statics) drawStatic(s);
    for (const p of G.props) if (p.alive && R.visible(p.x, p.y, 8, 10)) { R.group(p.y); R.stack(p.strip, p.x, p.y, p.z, p.rot); }
    for (const p of G.pickups) if (p.on && R.visible(p.x, p.y, 8, 12)) { R.group(p.y); R.stack(ART.props.pickup, p.x, p.y, 2.5 + Math.sin(G.time * 3 + p.x) * 1.5, G.time * 1.8 + p.y); }
    for (const m of G.mines) if (R.visible(m.x, m.y, 6)) { R.group(m.y - 5); R.stack(Math.floor(m.t * 4) % 2 ? ART.props.mine : ART.props.mineOff, m.x, m.y, 0, 0); }
    for (const r of G.rockets) { R.group(r.y); R.stack(ART.props.rocket, r.x, r.y, 4, r.h); }
    for (const b of G.bots) drawBot(b);
    for (const d of G.debris) if (R.visible(d.x, d.y, 8, 10)) { R.group(d.y); R.stack(d.strip, d.x, d.y, d.z, d.rot, d.life < 1.5 ? d.life / 1.5 : 1); }
    for (const c of G.cars) drawCar(c);
    R.flush();
    // particles
    for (const f of G.fx) {
      const sx = R.sx(f.x), sy = R.sy(f.y, f.z), t = f.life / f.max; let s = f.size * SCALE;
      if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;
      if (f.kind === 'smoke') { s *= 1 + (1 - t) * 1.8; ctx.globalAlpha = 0.45 * t; ctx.fillStyle = '#3a3836'; }
      else if (f.kind === 'dust') { s *= 1 + (1 - t) * 1.5; ctx.globalAlpha = 0.4 * t; ctx.fillStyle = '#9a8460'; }
      else if (f.kind === 'fire') { ctx.globalAlpha = Math.min(1, t * 1.5); ctx.fillStyle = t > 0.6 ? '#ffe27a' : t > 0.3 ? '#ff8a2a' : '#c0321c'; }
      else if (f.kind === 'flame') { ctx.globalAlpha = 1; ctx.fillStyle = t > 0.5 ? '#bff4ff' : '#4fb8ff'; }
      else { ctx.globalAlpha = 1; ctx.fillStyle = t > 0.5 ? '#fff6c0' : '#ffb03a'; s = Math.max(2, SCALE * 0.8); }
      ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    // floating words
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of G.texts) {
      const a = Math.min(1, t.life / t.max * 2.5); ctx.globalAlpha = a;
      const fs = Math.round((t.big ? 22 : 15) * DPR); ctx.font = '900 ' + fs + 'px system-ui, sans-serif';
      const sx = R.sx(t.x), sy = R.sy(t.y, t.z);
      ctx.lineWidth = 4 * DPR; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(t.text, sx, sy); ctx.fillStyle = t.col; ctx.fillText(t.text, sx, sy);
    }
    ctx.globalAlpha = 1;
    // off-screen rival arrows in the derby
    if (G.kind === 'derby') for (const c of G.cars) {
      if (c === P || c.wrecked) continue; const sx = R.sx(c.x), sy = R.sy(c.y, 4); if (sx > 0 && sx < W && sy > 0 && sy < H) continue;
      const a = Math.atan2(sy - H / 2, sx - W / 2), ex = W / 2 + Math.cos(a) * (W / 2 - 24 * DPR), ey = H / 2 + Math.sin(a) * (H / 2 - 24 * DPR);
      ctx.save(); ctx.translate(clamp(ex, 20 * DPR, W - 20 * DPR), clamp(ey, 20 * DPR, H - 20 * DPR)); ctx.rotate(a); ctx.fillStyle = c.paint; ctx.beginPath(); ctx.moveTo(10 * DPR, 0); ctx.lineTo(-6 * DPR, -7 * DPR); ctx.lineTo(-6 * DPR, 7 * DPR); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    hud();
  }

  // ------------------------------------------------------------------ HUD
  let mini = null;
  function buildMinimap() {
    const V = G.V, size = Math.round(Math.min(150, Math.max(90, Math.min(innerWidth, innerHeight) * 0.3)) * DPR), k = size / Math.max(V.w, V.h);
    const cv = document.createElement('canvas'); cv.width = Math.ceil(V.w * k) + 8; cv.height = Math.ceil(V.h * k) + 8;
    const g = cv.getContext('2d'); g.fillStyle = 'rgba(10,12,16,0.55)'; g.fillRect(0, 0, cv.width, cv.height);
    g.translate(4, 4);
    if (G.kind === 'race') { g.beginPath(); for (let i = 0; i < G.T.n; i++) g[i ? 'lineTo' : 'moveTo'](G.T.x[i] * k, G.T.y[i] * k); g.closePath(); g.strokeStyle = 'rgba(230,230,230,0.85)'; g.lineWidth = Math.max(2, V.road * k * 0.6); g.lineJoin = 'round'; g.stroke(); }
    else { g.beginPath(); g.ellipse(V.cx * k, V.cy * k, V.rx * k, V.ry * k, 0, 0, TAU); g.fillStyle = 'rgba(150,120,80,0.6)'; g.fill(); g.strokeStyle = 'rgba(230,230,230,0.8)'; g.lineWidth = 2; g.stroke(); }
    mini = { cv: cv, k: k };
  }
  function bar(x, y, w, h, v, col, label) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = col; ctx.fillRect(x + 2 * DPR, y + 2 * DPR, Math.max(0, (w - 4 * DPR) * v), h - 4 * DPR);
    ctx.font = '800 ' + Math.round(9 * DPR) + 'px system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + 5 * DPR, y + h / 2 + 0.5);
  }
  function hud() {
    const P = G.player, u = DPR, pad = 12 * u, left = pad + 46 * u;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    const big = '900 ' + Math.round(20 * u) + 'px system-ui, sans-serif', small = '800 ' + Math.round(12 * u) + 'px system-ui, sans-serif';
    const text = function (t, x, y, f, col, align) { ctx.font = f; ctx.textAlign = align || 'left'; ctx.lineWidth = 4 * u; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(t, x, y); ctx.fillStyle = col || '#fff'; ctx.fillText(t, x, y); };
    const st = standings(), place = st.indexOf(P) + 1;
    if (G.kind === 'race') {
      text(placeName(place), left, pad, big, '#ffd24a');
      text('LAP ' + clamp(P.lap, 1, G.V.laps) + '/' + G.V.laps, left + 62 * u, pad + 4 * u, small);
      text(fmtTime(G.raceTime), left + 62 * u, pad + 19 * u, small, '#cfd6e0');
    } else {
      const alive = G.cars.filter(function (c) { return !c.wrecked; }).length;
      text(alive + ' LEFT', left, pad, big, '#ffd24a');
      text(fmtTime(Math.max(0, G.timeLeft)), left + 92 * u, pad + 4 * u, small, G.timeLeft < 20 ? '#ff7a6a' : '#fff');
    }
    text('SCORE ' + P.score, left, pad + 38 * u, small, '#fff');
    bar(left, pad + 56 * u, 110 * u, 13 * u, P.hp / 100, P.hp > 50 ? '#5fd35a' : P.hp > 25 ? '#f0b52c' : '#e8442e', 'ARMOR');
    bar(left, pad + 72 * u, 110 * u, 13 * u, P.nitro, '#4fb8ff', 'BOOST');
    // minimap
    if (mini) {
      const mx = W - mini.cv.width - pad, my = pad;
      ctx.drawImage(mini.cv, mx, my);
      for (const c of G.cars) { if (c.wrecked && G.kind === 'derby') continue; ctx.fillStyle = c.isPlayer ? '#fff' : c.paint; const s = (c.isPlayer ? 6 : 4.5) * u; ctx.fillRect(mx + 4 + c.x * mini.k - s / 2, my + 4 + c.y * mini.k - s / 2, s, s); }
    }
    // standings strip under the minimap
    if (mini) {
      let y = pad + mini.cv.height + 6 * u;
      for (let i = 0; i < Math.min(6, st.length); i++) { const c = st[i]; ctx.fillStyle = c.paint; ctx.fillRect(W - pad - 8 * u, y + 2 * u, 7 * u, 9 * u); text((i + 1) + ' ' + c.name + (c.wrecked && G.kind === 'derby' ? ' ✕' : ''), W - pad - 12 * u, y, '800 ' + Math.round(10 * u) + 'px system-ui, sans-serif', c.isPlayer ? '#ffd24a' : c.wrecked ? '#999' : '#fff', 'right'); y += 13 * u; }
    }
    // big centre messages
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (G.state === 'countdown') { const n = Math.ceil(G.countdown); if (n <= 3) text(String(n), W / 2, H * 0.36, '900 ' + Math.round(64 * u) + 'px system-ui, sans-serif', '#ffd24a', 'center'); else text(G.V.name, W / 2, H * 0.36, '900 ' + Math.round(30 * u) + 'px system-ui, sans-serif', '#fff', 'center'); }
    if (G.msgT > 0 && G.msg) text(G.msg, W / 2, H * 0.3, '900 ' + Math.round(34 * u) + 'px system-ui, sans-serif', '#ffd24a', 'center');
    if (P.wrongT > 1.0 && !P.wrecked) text('WRONG WAY!', W / 2, H * 0.42, '900 ' + Math.round(28 * u) + 'px system-ui, sans-serif', '#ff6a5a', 'center');
    if (G.state === 'race' && G.kind === 'race' && P.lap === G.V.laps && !P.finished && P.lapShown !== P.lap) { P.lapShown = P.lap; setMsg('FINAL LAP', 1.6); }
  }
  function fmtTime(t) { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); }

  function updateFireButton() {
    const b = $('btnFire'), P = G && G.player; if (!b || !P) return;
    b.textContent = P.weapon ? (P.weapon === 'rocket' ? 'ROCKET' : 'MINE') + ' ×' + P.ammo : 'FIRE';
    b.classList.toggle('empty', !P.weapon);
  }

  // ------------------------------------------------------------------ screens
  let screen = 'menu', paused = false, garageType = 0;
  const garage = $('garage'), gctx = garage.getContext('2d'), GR = SpriteStack.createRenderer(gctx);
  let garageT = 0;
  function show(id) { ['menu', 'results', 'pauseMenu'].forEach(function (k) { $(k).classList.toggle('hidden', k !== id); }); }
  function setScreen(s) {
    screen = s; document.body.dataset.screen = s;
    if (s === 'menu') { show('menu'); Sound.engineStop(); }
    else if (s === 'game') { show(null); Sound.engineStart(); }
    else if (s === 'results') { show('results'); Sound.engineStop(); }
  }
  function startGame(venue) {
    Sound.init();
    try { if (matchMedia('(pointer: coarse)').matches && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().then(function () { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); }).catch(function () {}); } catch (e) { /* not allowed */ }
    lastVenue = venue; newGame(venue, CAR_KEYS[garageType]); paused = false; setScreen('game');
  }
  let lastVenue = 'kennel';
  function finish() {
    const st = standings(), P = G.player, place = st.indexOf(P) + 1;
    let title;
    if (G.kind === 'race') title = P.finished ? (place === 1 ? 'YOU WIN!' : placeName(place) + ' PLACE') : 'RACE OVER';
    else title = !P.wrecked && G.cars.filter(function (c) { return !c.wrecked; }).length === 1 ? 'LAST DOG STANDING!' : P.wrecked ? 'SCRAPPED IN ' + placeName(place) : 'SURVIVED: ' + placeName(place);
    $('resTitle').textContent = title;
    $('resSub').textContent = G.V.name + ' · ' + (G.kind === 'race' ? fmtTime(P.finished ? P.finishTime : G.raceTime) : 'Score ' + P.score);
    const rows = st.map(function (c, i) {
      const extra = G.kind === 'race' ? (c.finished ? fmtTime(c.finishTime) : 'racing') : (c.wrecked ? 'wrecked' : 'survived');
      return '<tr class="' + (c.isPlayer ? 'me' : '') + '"><td>' + (i + 1) + '</td><td><span class="dot" style="background:' + c.paint + '"></span>' + c.name + ' <small>' + c.T.name + '</small></td><td>' + extra + '</td><td>' + c.wrecks + '</td><td>' + c.smashed + '</td><td>' + c.score + '</td></tr>';
    }).join('');
    $('resTable').innerHTML = '<tr><th>#</th><th>Driver</th><th>' + (G.kind === 'race' ? 'Time' : 'Status') + '</th><th>Wrecks</th><th>Bots</th><th>Score</th></tr>' + rows;
    try { const k = 'dd-best-' + G.key, best = +localStorage.getItem(k) || 0; if (P.score > best) { localStorage.setItem(k, P.score); $('resSub').textContent += ' · NEW BEST SCORE!'; } } catch (e) { /* ignore */ }
    setScreen('results');
  }

  function renderGarage(dt) {
    garageT += dt;
    const r = garage.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    if (garage.width !== Math.round(r.width * d)) { garage.width = Math.round(r.width * d); garage.height = Math.round(r.height * d); }
    gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.clearRect(0, 0, garage.width, garage.height);
    const s = Math.max(3, Math.min(garage.width / 34, garage.height / 22));
    GR.setView(s, 50 * Math.PI / 180); GR.begin(0, 0, garage.width, garage.height + s * 6);
    const type = CAR_KEYS[garageType], T = Art.CARS[type], A = carArt(type, T.paint), h = garageT * 0.8, cs = Math.cos(h), sn = Math.sin(h), frame = ((Math.floor(garageT * 10) % 3) + 3) % 3;
    gctx.fillStyle = 'rgba(0,0,0,0.3)'; gctx.beginPath(); gctx.ellipse(GR.sx(0), GR.sy(0, 0), 15 * s, 9 * s * GR.ys, 0, 0, TAU); gctx.fill();
    GR.group(0);
    for (const w of T.wheels) for (const sg of [-1, 1]) GR.stack(ART.wheels[frame], cs * w[0] - sn * w[1] * sg, sn * w[0] + cs * w[1] * sg, 0, h);
    for (let i = 0; i < A.body.n; i++) GR.slice(A.body, i, 0, 0, 0.6 + i, h, 1);
    GR.stack(A.bumper, cs * (T.a + 0.6), sn * (T.a + 0.6), 1.4, h); GR.stack(A.bumper, -cs * (T.a + 0.6), -sn * (T.a + 0.6), 1.4, h);
    GR.stack(A.top, cs * T.extras.top.x, sn * T.extras.top.x, 0.6 + T.extras.top.z, h);
    GR.flush();
  }
  function showCar() {
    const T = Art.CARS[CAR_KEYS[garageType]];
    $('carName').textContent = T.name; $('carBlurb').textContent = T.blurb;
    const stat = function (v, lo, hi) { return Math.round(clamp((v - lo) / (hi - lo), 0.1, 1) * 100) + '%'; };
    $('stSpeed').style.width = stat(T.speed, 0.85, 1.1); $('stAccel').style.width = stat(T.accel, 0.75, 1.2); $('stGrip').style.width = stat(T.grip, 0.85, 1.18); $('stArmor').style.width = stat(T.armor * T.mass, 0.6, 1.8);
  }

  // ------------------------------------------------------------------ the loop
  let last = performance.now(), acc = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = clamp((t - last) / 1000, 0, 0.1); last = t;
    if (screen === 'game' && G) {
      if (Input.takePause()) togglePause();
      if (!paused) { acc += dt; let n = 0; while (acc >= DT && n < 5) { step(); acc -= DT; n++; } if (n === 5) acc = 0; }
      render();
    } else if (screen === 'menu') renderGarage(dt);
  }
  function togglePause() {
    if (screen !== 'game') return; paused = !paused; show(paused ? 'pauseMenu' : null);
    if (paused) Sound.engineStop(); else { Sound.engineStart(); last = performance.now(); acc = 0; }
  }

  function boot() {
    Input.setup(); resize(); addEventListener('resize', resize);
    $('prevCar').onclick = function () { garageType = (garageType + 3) % 4; showCar(); };
    $('nextCar').onclick = function () { garageType = (garageType + 1) % 4; showCar(); };
    document.querySelectorAll('[data-venue]').forEach(function (b) { b.onclick = function () { startGame(b.dataset.venue); }; });
    $('again').onclick = function () { startGame(lastVenue); };
    $('toMenu').onclick = function () { setScreen('menu'); };
    $('pauseBtn').onclick = togglePause;
    $('resume').onclick = togglePause;
    $('restart').onclick = function () { paused = false; startGame(lastVenue); };
    $('quit').onclick = function () { paused = false; setScreen('menu'); };
    const mute = function () { const m = Sound.toggle(); document.querySelectorAll('.muteBtn').forEach(function (b) { b.textContent = m ? 'SOUND OFF' : 'SOUND ON'; }); };
    document.querySelectorAll('.muteBtn').forEach(function (b) { b.textContent = Sound.muted ? 'SOUND OFF' : 'SOUND ON'; b.onclick = mute; });
    document.addEventListener('visibilitychange', function () { if (document.hidden && screen === 'game' && !paused) togglePause(); });
    showCar(); setScreen('menu');
    const st = params.get('start'); if (st && Tracks.VENUES[st]) { garageType = Math.max(0, CAR_KEYS.indexOf(params.get('car'))); startGame(st); }
    window.__dd = { get G() { return G; }, step: step, render: render, finish: finish };
    requestAnimationFrame(frame);
  }
  boot();
})();
