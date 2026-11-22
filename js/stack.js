// stack.js: sprite stacking on a 2D canvas, with a following camera and many objects.
//
// Adapted from js/stack.js of loktar00/sprite-stack-animation (MIT, see THIRD_PARTY_NOTICES.md).
// The idea is the same: a stack is a strip image, the object's slices side by side, bottom slice first. Each slice
// is one drawImage, turned by the object's angle and drawn a little further up the screen than the one below it,
// repeated a row or two so a layer has thickness. There is no depth buffer: everything queued is sorted and drawn
// back to front.
//
// What this version adds for a game world:
//  - a camera: begin(camX, camY, w, h) puts the world point (camX, camY) in the middle of the canvas;
//  - groups: every object opens a group keyed by its ground y. Groups are drawn far to near, and the slices inside
//    a group lowest first, so a car passing behind a tree is covered by it;
//  - per-slice alpha, and an item pool so a frame does not allocate;
//  - image(): a static stack that never turns can be drawn once into a canvas and then queued as one image, so a
//    tree line or a tyre wall costs one drawImage per object instead of one per slice.
//
// World coordinates: x and y lie on the ground, z is height, all in art pixels.
(function (global) {
  'use strict';

  function createRenderer(ctx) {
    let scale = 4, ys = 0.8, zk = 2.4;
    let camX = 0, camY = 0, ox = 0, oy = 0, group = 0, groupN = 0;
    const pool = []; let count = 0; let order = [];

    function take() {
      if (count === pool.length) pool.push({ s: null, i: 0, x: 0, y: 0, rot: 0, g: 0, gn: 0, h: 0, n: 0, a: 1 });
      return pool[count++];
    }

    const R = {
      vw: 0, vh: 0, calls: 0,
      setView: function (s, pitch) { scale = s; ys = Math.sin(pitch); zk = s * Math.cos(pitch); R.scale = s; R.ys = ys; R.zk = zk; },
      begin: function (cx, cy, w, h) { camX = cx; camY = cy; ox = w / 2; oy = h / 2; count = 0; R.vw = w; R.vh = h; groupN = 0; },
      // where a world point lands on the canvas
      sx: function (x) { return ox + (x - camX) * scale; },
      sy: function (y, z) { return oy + (y - camY) * scale * ys - (z || 0) * zk; },
      // is a thing of radius rad (art px) and height ht near the screen?
      visible: function (x, y, rad, ht) {
        const sx = ox + (x - camX) * scale, sy = oy + (y - camY) * scale * ys, m = rad * scale;
        return sx > -m && sx < R.vw + m && sy > -m && sy < R.vh + m + (ht || 0) * zk;
      },
      // start an object: its slices are drawn together, after objects with a smaller key
      group: function (key) { group = key; groupN++; },
      // queue slice i of a strip, its axis at (x, y), its underside at height z, turned by rot, thick layers thick
      slice: function (strip, i, x, y, z, rot, thick, alpha) {
        const sx = ox + Math.round((x - camX) * scale), sy = oy + Math.round((y - camY) * scale * ys), up = Math.round(z * zk);
        const rows = Math.max(1, Math.ceil(zk * (thick || 1) - 0.02));
        for (let k = 0; k < rows; k++) {
          const it = take();
          it.s = strip; it.i = i; it.x = sx; it.y = sy - up - k; it.rot = rot; it.g = group; it.gn = groupN; it.h = up + k; it.n = count; it.a = alpha === undefined ? 1 : alpha;
        }
      },
      // queue a pre-drawn image (a whole static stack baked once); (ax, ay) is where its ground point is in the image
      image: function (img, x, y, ax, ay) {
        const it = take();
        it.s = img; it.i = -1; it.x = ox + Math.round((x - camX) * scale) - ax; it.y = oy + Math.round((y - camY) * scale * ys) - ay; it.rot = 0; it.g = group; it.gn = groupN; it.h = 0; it.n = count; it.a = 1;
      },
      // queue a whole stack standing at (x, y, z)
      stack: function (strip, x, y, z, rot, alpha) { for (let i = 0; i < strip.n; i++) R.slice(strip, i, x, y, z + i, rot, 1, alpha); },
      // one single-slice strip repeated n times along a bone from a to b ([x, y, z] each)
      limb: function (strip, a, b, n, alpha) {
        for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; R.slice(strip, 0, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - 0.5, 0, 1, alpha); }
      },
      // draw everything queued: far groups first, inside a group lowest first
      flush: function () {
        order.length = count;
        for (let q = 0; q < count; q++) order[q] = pool[q];
        order.sort(function (a, b) { return a.g - b.g || a.gn - b.gn || a.h - b.h || a.n - b.n; });
        ctx.imageSmoothingEnabled = false;
        let lastA = 1; ctx.globalAlpha = 1;
        for (let q = 0; q < count; q++) {
          const it = order[q], s = it.s, c = Math.cos(it.rot), sn = Math.sin(it.rot);
          if (it.a !== lastA) { ctx.globalAlpha = it.a; lastA = it.a; }
          if (it.i < 0) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(s, it.x, it.y); continue; }
          // translate(x, y) * scale(1, ys) * rotate(rot), in one call
          ctx.setTransform(c, ys * sn, -sn, ys * c, it.x, it.y);
          ctx.drawImage(s.img, it.i * s.cw, 0, s.cw, s.ch, -s.cw * scale / 2, -s.ch * scale / 2, s.cw * scale, s.ch * scale);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
        R.calls = count;
      }
    };
    return R;
  }

  global.SpriteStack = { createRenderer: createRenderer };
})(window);
