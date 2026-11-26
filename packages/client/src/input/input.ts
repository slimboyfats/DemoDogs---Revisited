import type { Controls } from '@demodogs/shared';
import { toControls, type RawInput } from './controls';
import type { Pads } from './gamepad';
import { isKey, KEYS } from './keys';

/** CSS pixels from the stick's centre to its edge. */
const RADIUS = 56;

/**
 * Touch and keyboard. The left of the screen is a floating stick (it appears where the finger
 * lands); BRAKE, BOOST and FIRE are buttons on the right. The keys are in `keys.ts`: arrows or
 * WASD, Space boosts, X, F or Shift fires, P or Esc pauses.
 */
export class Input {
  private readonly keys = new Set<string>();
  private readonly raw: RawInput = {
    up: false,
    down: false,
    left: false,
    right: false,
    stick: { active: false, mag: 0, angle: 0 },
    brake: false,
    boost: false,
    fire: false,
  };
  private pausePressed = false;

  constructor(
    private readonly onGesture: () => void,
    private readonly pads?: Pads,
  ) {
    const $ = (id: string) => document.getElementById(id)!;
    const zone = $('stickZone');
    const base = $('stickBase');
    const knob = $('stickKnob');
    let pid: number | null = null;
    let cx = 0;
    let cy = 0;
    const move = (e: PointerEvent) => {
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > RADIUS) {
        dx *= RADIUS / d;
        dy *= RADIUS / d;
      }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.raw.stick.mag = Math.min(1, d / RADIUS);
      this.raw.stick.angle = Math.atan2(dy, dx);
    };
    zone.addEventListener('pointerdown', (e) => {
      if (pid !== null) return;
      e.preventDefault();
      pid = e.pointerId;
      try {
        zone.setPointerCapture(pid);
      } catch {
        /* ignore */
      }
      cx = e.clientX;
      cy = e.clientY;
      base.style.left = `${cx}px`;
      base.style.top = `${cy}px`;
      base.classList.add('on');
      // (the DRAG TO DRIVE hint has done its work)
      document.body.classList.add('driven');
      this.raw.stick.active = true;
      move(e);
      this.onGesture();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      e.preventDefault();
      move(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      pid = null;
      this.raw.stick.active = false;
      this.raw.stick.mag = 0;
      knob.style.transform = '';
      base.classList.remove('on');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    const hold = (id: string, set: (on: boolean) => void, onPress?: () => void) => {
      const el = $(id);
      const ids = new Set<number>();
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        ids.add(e.pointerId);
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        set(true);
        el.classList.add('down');
        onPress?.();
        this.onGesture();
      });
      const up = (e: PointerEvent) => {
        ids.delete(e.pointerId);
        if (ids.size) return;
        set(false);
        el.classList.remove('down');
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    let brakeBtn = false;
    let boostBtn = false;
    hold('btnBrake', (on) => (brakeBtn = on));
    hold('btnBoost', (on) => (boostBtn = on));
    hold(
      'btnFire',
      () => undefined,
      () => (this.raw.fire = true),
    );
    this.buttons = () => ({ brake: brakeBtn, boost: boostBtn });

    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (this.keys.has(k)) return;
      this.keys.add(k);
      if (isKey('fire', k)) this.raw.fire = true;
      if (isKey('pause', k)) this.pausePressed = true;
      this.onGesture();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }

  private readonly buttons: () => { brake: boolean; boost: boolean };

  /** Controls for this tick, for a car facing `heading`. Consumes a fire press. */
  read(heading: number): Controls {
    const k = this.keys;
    const b = this.buttons();
    const r = this.raw;
    const held = (keys: readonly string[]) => keys.some((key) => k.has(key));
    r.up = held(KEYS.gas);
    r.down = held(KEYS.brake);
    r.left = held(KEYS.left);
    r.right = held(KEYS.right);
    r.brake = b.brake;
    r.boost = b.boost || held(KEYS.boost);
    let out = toControls(r, heading);
    // a gamepad drives while the keys and the screen are left alone
    const pad = this.pads?.controls(heading);
    if (pad && !out.throttle && !out.steer && !out.brake && !out.boost)
      out = { ...pad, fire: out.fire };
    if (this.pads?.takeFire()) out.fire = true;
    r.fire = false;
    return out;
  }

  takePause(): boolean {
    const p = this.pausePressed;
    this.pausePressed = false;
    return p;
  }
}
