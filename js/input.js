// input.js: touch controls and the keyboard.
//
// Touch: the left half of the screen is a floating stick. Push it the way you want the car to go: the car turns
// to face that way, and how far you push is the throttle. The right side has BRAKE (reverse when stopped, a
// handbrake slide when fast), BOOST and FIRE.
// Keyboard: arrows or WASD steer and drive, Space boosts, X or Shift fires, P or Esc pauses.
(function (global) {
  'use strict';
  const I = {
    stick: { active: false, x: 0, y: 0, mag: 0, angle: 0 },   // the touch stick, x and y from -1 to 1
    keys: {}, brake: false, boost: false, fire: false, firePressed: false, pausePressed: false, usedTouch: false
  };
  const RADIUS = 56;   // CSS pixels from the stick's centre to its edge

  function setup() {
    const zone = document.getElementById('stickZone'), base = document.getElementById('stickBase'), knob = document.getElementById('stickKnob');
    let pid = null, cx = 0, cy = 0;
    function move(e) {
      let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy);
      if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      I.stick.x = dx / RADIUS; I.stick.y = dy / RADIUS; I.stick.mag = Math.min(1, d / RADIUS); I.stick.angle = Math.atan2(dy, dx);
    }
    zone.addEventListener('pointerdown', function (e) {
      if (pid !== null) return; e.preventDefault(); pid = e.pointerId; I.usedTouch = e.pointerType !== 'mouse';
      try { zone.setPointerCapture(pid); } catch (err) { /* ignore */ }
      cx = e.clientX; cy = e.clientY; base.style.left = cx + 'px'; base.style.top = cy + 'px'; base.classList.add('on');
      I.stick.active = true; move(e); if (global.Sound) Sound.init();
    });
    zone.addEventListener('pointermove', function (e) { if (e.pointerId === pid) { e.preventDefault(); move(e); } });
    function end(e) {
      if (e.pointerId !== pid) return; pid = null; I.stick.active = false; I.stick.mag = 0; I.stick.x = I.stick.y = 0;
      knob.style.transform = ''; base.classList.remove('on');
    }
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);

    function hold(id, prop, onPress) {
      const el = document.getElementById(id); const ids = new Set();
      el.addEventListener('pointerdown', function (e) { e.preventDefault(); ids.add(e.pointerId); try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } I[prop] = true; el.classList.add('down'); if (onPress) onPress(); if (global.Sound) Sound.init(); });
      const up = function (e) { ids.delete(e.pointerId); if (!ids.size) { I[prop] = false; el.classList.remove('down'); } };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }
    hold('btnBrake', 'brake'); hold('btnBoost', 'boost'); hold('btnFire', 'fire', function () { I.firePressed = true; });

    global.addEventListener('keydown', function (e) {
      const k = e.key.toLowerCase(); if (I.keys[k]) return; I.keys[k] = true;
      if (k === 'x' || k === 'shift' || k === 'f') I.firePressed = true;
      if (k === 'p' || k === 'escape') I.pausePressed = true;
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) e.preventDefault();
      if (global.Sound) Sound.init();
    });
    global.addEventListener('keyup', function (e) { I.keys[e.key.toLowerCase()] = false; });
    global.addEventListener('blur', function () { I.keys = {}; });
  }

  // The driver's controls for this step. heading is the car's facing (radians), speed its forward speed.
  I.read = function (heading) {
    const k = I.keys, out = { throttle: 0, steer: 0, brake: I.brake, boost: I.boost, fire: false };
    const up = k.arrowup || k.w, down = k.arrowdown || k.s, left = k.arrowleft || k.a, right = k.arrowright || k.d;
    if (up || down || left || right) {
      out.throttle = up ? 1 : 0; out.brake = out.brake || !!down; out.steer = (right ? 1 : 0) - (left ? 1 : 0);
    } else if (I.stick.active && I.stick.mag > 0.18) {
      // point-to-steer: turn towards the stick; the further from it the car points, the harder it turns
      let d = I.stick.angle - heading; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      out.steer = Math.max(-1, Math.min(1, d * 2.4));
      out.throttle = Math.min(1, (I.stick.mag - 0.18) / 0.6);
      if (Math.abs(d) > 2.4 && I.brake) out.steer = 0;
    }
    out.boost = out.boost || !!k[' '];
    out.fire = I.firePressed; I.firePressed = false;
    return out;
  };
  I.takePause = function () { const p = I.pausePressed; I.pausePressed = false; return p; };
  I.setup = setup;
  global.Input = I;
})(window);
