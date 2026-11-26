import type { StaticProp, World } from '@demodogs/sim';
import { armsLights } from '../arms-fx';
import { arsenalLights } from '../arsenal-fx';
import type { Art } from '../art';
import type { Effects } from '../effects';
import { groundMode, type Ground } from '../ground';
import type { WorldRenderer } from '../overlay';
import { PITCH, type Camera } from '../scene';
import type { Strip } from '../stack';
import { BODY_UP } from '../lamps';
import { lampsOut, queueShadows, queueStacks, type StackSink } from '../stacks';
import { QuadBatch, Shape } from './batch';
import { prelink } from './gl';
import { GroundLayer, groundSources } from './ground-layer';
import { SUN_PROGRAMS, SunShadow } from './sun-shadow';
import { LightBlock } from './light-block';
import { TRACED_PROGRAMS, TracedLight } from './traced-light';
import { BeamHaze, HAZE_PROGRAMS } from './beam-haze';
import { FOG_PROGRAMS, FogFluid, FogPass, MAX_STIRS, type Stir } from './fog';
import { SHADOW_PROGRAMS, ShadowLayer } from './shadow-layer';
import { ReliefLayer } from './relief-layer';
import { leapFaces, leapHeights } from '../leaps';
import { ShadowMap, casts } from '../cast';
import { pixels } from '../strips';
import { Lights, MAX_CONES, MAX_LIGHTS } from './lighting';
import { drawParticle, overSmoke, type Put } from './particles';
import { fineGrid } from '../strips';
import { GAS_PROGRAMS, GasGpu, type GasView } from './gas-gpu';
import { StackAtlas } from './stack-atlas';
import { STACK_PROGRAMS, StackBatch, type Lie, type StackSky, type StackView } from './stack-batch';
import { Atmosphere } from '../atmosphere';
import { LensPass, MAX_RIPPLES, POST_PROGRAMS, rippleAt, type Lens } from './post';
import { DUSK_PROGRAMS, DuskPass } from './dusk';
import type { WeatherDraw } from '../weather-fx';
import { OverdrawMeter, type Channel, type CountSource, type OverdrawStats } from './overdraw';

const hex = (h: string) => parseInt(h.slice(1), 16);

/**
 * The world drawn by mudders' pixel engine with the sprite-stack addon: WebGL2, one instanced
 * draw for every slice on screen, depth-tested on the GPU, lit by the frame's point lights.
 *
 * Frame order: ground quad, cast shadows (ShadowLayer), soft shadows (QuadBatch), stacks (StackBatch, depth on), particles
 * (QuadBatch with mudders' pixel-blob and stipple shapes, then an additive pass for the glow). Words and the HUD go on the overlay.
 */
/**
 * A thing is taken to stand at least this high when its shadow is looked for (art px): for
 * callers that give no height.
 */
const SHADOW_OVER = 12;

/** Gas cells the GPU holds at once (a blast lets go thousands; a big fire tens of thousands). */
const GAS_CAP = 131072;

export class PixelScene implements WorldRenderer, StackSink, CountSource {
  readonly gl: WebGL2RenderingContext;
  private readonly atlas: StackAtlas;
  private fx: Effects | null = null;
  private readonly stacks: StackBatch;
  private readonly quads: QuadBatch;
  private readonly glow: QuadBatch;
  private readonly lights = new Lights();
  private groundLayer: GroundLayer | null = null;
  private relief: ReliefLayer | null = null;
  private shadowLayer: ShadowLayer | null = null;
  private shadows: ShadowMap | null = null;
  private ground: Ground | null = null;
  private scale = 4;
  /** Screen cells to the art pixel for particles (see `fineGrid`). */
  private fxGrid = fineGrid(4);
  /** Fire and smoke on the GPU; null where it cannot (then they stay on the CPU). */
  private gas: GasGpu | null | undefined = undefined;
  private readonly ys = Math.sin(PITCH);
  private readonly cosP = Math.cos(PITCH);
  private ox = 0;
  private oy = 0;
  private vw = 1;
  private vh = 1;
  /** The overdraw meter (made on first use), the heat map shown, and a read-back asked for. */
  private meter: OverdrawMeter | null = null;
  private heat: Channel | null = null;
  private metering = false;
  private wantRead = false;
  private last: OverdrawStats | null = null;
  private frameW: World | null = null;
  /** How strong sun shadows are this frame, 0 to 1. */
  private shade = 1;
  /** The shockwave lens (made on first use), and whether to bend the picture at all. */
  private lens: LensPass | null = null;
  private readonly lenses: Lens[] = [];
  distort = true;
  /** The sky: how dark, how wet, how much snow (set its `dark`, `wet`, `snow`; see Atmosphere). */
  readonly sky = new Atmosphere();
  /** A modifier's tint over the picture (made the first time one is needed). */
  private dusk: DuskPass | null = null;
  /**
   * Shadows from the sun's own map: everything throws its shape on everything (see SunShadow).
   * Off: the old way, tall scenery's baked shadows and an oval under what moves.
   */
  sunCast = true;
  private sun: SunShadow | null = null;
  /** Lights throw shadows too: what stands in their way is mapped each frame there is a light. */
  lightCast = true;
  private block: LightBlock | null = null;
  /**
   * Light traced across the frame (see TracedLight): what lit and glowing things throw on what
   * is round them, and shade where the sky is shut out. Off: the sun's one bounce, as before.
   */
  traced = true;
  /** Lights keep to their own level: none over a raised road's edge or under a car in the air. */
  lightLevels = true;
  /** Flames are light of their own in the traced light (FLAME LIGHT when paused, `?flames=0`). */
  flames = true;
  /** Show the traced light's field itself in place of the ground (to look at it). */
  showTraced = false;
  private field: TracedLight | null = null;
  private haze: BeamHaze | null = null;
  /** Ground fog (`sky.fog`): the sheets it is drawn as, and the air it is pushed about in. */
  groundFog = true;
  private fog: FogPass | null = null;
  private fluid: FogFluid | null = null;
  private readonly stirs: Stir[] = [];
  /** Where each car was at the fluid's last step, and the race's clock then. */
  private readonly stirAt = new Map<number, [number, number]>();
  private fogT = 0;
  /** Draw wet ground's reflections (off on a weak phone: the stacks are drawn a second time). */
  reflections = true;
  /** A line round your own car: always, never, or only when it is dark enough to lose it. */
  outline: 'on' | 'off' | 'auto' = 'auto';
  /** Draw a venue's raised ground raised (off: flat, as the canvas renderer does; to compare). */
  raised = true;
  /** Let a new race rise out of the ground, slice by slice. */
  bloom = true;
  /** Seconds the sky moves on each frame drawn, instead of the clock's (captures). */
  fixedDt: number | null = null;
  private lastT = 0;
  private readonly stackSky: StackSky;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly art: Art,
  ) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      depth: true,
      alpha: false,
      premultipliedAlpha: true,
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    // every shader the game draws with starts building now, while the menu is up: none is left
    // to be built in the middle of a race, the first time its effect is seen
    prelink(
      gl,
      ...STACK_PROGRAMS,
      ...SUN_PROGRAMS,
      ...TRACED_PROGRAMS,
      ...GAS_PROGRAMS,
      ...SHADOW_PROGRAMS,
      ...HAZE_PROGRAMS,
      ...FOG_PROGRAMS,
      ...POST_PROGRAMS,
      ...DUSK_PROGRAMS,
    );
    this.atlas = new StackAtlas(gl);
    this.stacks = new StackBatch(gl, this.atlas);
    this.quads = new QuadBatch(gl);
    this.glow = new QuadBatch(gl, 1024);
    this.atlas.setLit(true);
    const A = this.sky;
    this.stackSky = {
      lit: true,
      amb: A.amb,
      sun: A.sun,
      dir: A.dir,
      glow: 0,
      snow: 0,
      wet: 0,
      time: 0,
    };
  }

  /** Flat light and no second atlas texture (as before there was a sky), or the lit look. */
  setFlat(flat: boolean): void {
    this.sky.flat = flat;
    this.atlas.setLit(!flat);
  }

  // StackSink: where the next instance will go, and a line round everything queued since
  mark(): number {
    return this.stacks.count;
  }
  rim(from: number, rgb: number): void {
    this.stacks.outline(from, rgb);
  }
  warm(on: boolean): void {
    this.stacks.warm = on;
  }
  lamps(out: number): void {
    this.stacks.lampsOut = out;
  }
  /** Should your own car get its line this frame? */
  get rimOn(): boolean {
    return this.outline === 'on' || (this.outline === 'auto' && this.sky.now.dark >= 0.4);
  }

  /** Can this browser run the pixel engine? */
  static supported(): boolean {
    try {
      return !!document.createElement('canvas').getContext('webgl2');
    } catch {
      return false;
    }
  }

  setScale(s: number): void {
    this.scale = s;
    this.fxGrid = fineGrid(s);
  }

  sx(x: number): number {
    return this.ox + x * this.scale;
  }

  sy(y: number, z = 0): number {
    return this.oy + y * this.scale * this.ys - z * this.scale * this.cosP;
  }

  // StackSink: visibility and forwarding to the batch (the GPU needs no grouping)
  visible(x: number, y: number, rad: number, ht = 0): boolean {
    // (getting a race ready: everything in the world is "in view")
    if (this.everything) return true;
    const sx = this.sx(x);
    const sy = this.sy(y);
    // (raised ground lifts things up the screen: allow for the highest it stands)
    ht += this.relief?.top ?? 0;
    const m = rad * this.scale;
    // (and what stands off the screen on the sun's side still throws its shadow onto it: a
    // thing is in view for as long as its shadow is, or the shadow goes out while it is watched)
    const tall = ht + SHADOW_OVER;
    const ex = this.throwX * tall * this.scale;
    const ey = this.throwY * tall * this.scale * this.ys;
    return (
      sx > -m - Math.max(0, ex) &&
      sx < this.vw + m + Math.max(0, -ex) &&
      sy > -m - Math.max(0, ey) &&
      sy < this.vh + m + ht * this.scale * this.cosP + Math.max(0, -ey)
    );
  }
  /** How far the sun throws a shadow this frame, ground px per px of height (0 when it casts none). */
  private throwX = 0;
  private throwY = 0;
  group(): void {}
  slice(
    s: Strip,
    i: number,
    x: number,
    y: number,
    z: number,
    rot: number,
    thick?: number,
    alpha?: number,
  ): void {
    this.stacks.slice(s, i, x, y, z, rot, thick, alpha);
  }
  stack(s: Strip, x: number, y: number, z: number, rot: number, alpha?: number): void {
    this.stacks.stack(s, x, y, z, rot, alpha);
  }
  zoom(k: number): void {
    this.stacks.zoom(k);
  }
  tilt(lie: Lie | null): void {
    this.stacks.tilt(lie);
  }
  limb(s: Strip, a: readonly number[], b: readonly number[], n: number): void {
    this.stacks.limb(s, a, b, n);
  }

  /** Projected "map" y for the quad batch: ground y squashed, lifted by height. */
  private my(y: number, z: number): number {
    return y * this.ys - z * this.cosP;
  }

  /** How high the ground stands at (x, y): everything drawn there is lifted by it. */
  rise(x: number, y: number): number {
    return this.relief ? this.relief.at(x, y) : 0;
  }

  /** Where this frame's lamp pools are (x, y each), to keep a row of lamps from taking every light. */
  private readonly lit: number[] = [];

  /** Each car's speed at the last frame and how far on its brake lamps are (0 to 1), and when. */
  private readonly tailV: number[] = [];
  private readonly tailOn: number[] = [];
  private tailT = 0;

  private gatherLights(w: World, fx: Effects): void {
    const L = this.lights;
    L.clear();
    const t = w.time;
    // the darker it is the further a light carries, a little
    const night = Math.max(0, Math.min(1, (this.sky.now.dark - 0.42) / 0.58));
    L.spread = this.sky.flat ? 1 : 1 + 0.25 * night;
    // and in daylight a fire, a flash or a lamp is no match for the sun: none of them lights the
    // ground or anything else. They come up as the light goes, from dusk on
    L.gain = this.sky.flat ? 1 : Math.max(0, Math.min(1, (this.sky.now.dark - 0.25) / 0.35));
    for (const f of fx.flashes) L.add(f.x, f.y, f.r, 1.6 * (f.life / f.max), f.rgb);
    // a blast's ball lights the ground and its own smoke for as long as it burns
    for (const b of fx.blasts) {
      const k = 1 - b.age / 70;
      L.add(b.x, b.y, b.r * 7, (1.8 + Math.sin(t * 37 + b.x) * 0.15) * k * k, 0xff9a38);
    }
    for (const c of w.cars)
      // (not from a car up on a deck: these lights lie on the ground, which there is the road
      // under the bridge)
      if ((c.wrecked || c.hp < 20) && c.deck < 1 && this.visible(c.x, c.y, 60))
        L.add(c.x, c.y, 34, 0.7 + Math.sin(t * 23 + c.index * 3) * 0.2, 0xff7a20);
    for (const r of w.rockets) L.add(r.x, r.y, 28, 0.9, 0xffb060);
    armsLights(L, w);
    arsenalLights(L, w);
    for (const f of fx.fires)
      L.add(
        f.x,
        f.y,
        30 + f.r * 3,
        (0.5 + Math.sin(t * 31 + f.x) * 0.2) * (f.life / f.max) + 0.3,
        0xff8a30,
      );
    for (const m of w.mines)
      if (Math.floor(m.t * 4) % 2 && this.visible(m.x, m.y, 30)) L.add(m.x, m.y, 18, 0.8, 0xff2020);
    for (const p of w.pickups)
      if (p.on && this.visible(p.x, p.y, 30))
        L.add(p.x, p.y, p.gives ? 26 : 20, p.gives ? 0.6 : 0.45, p.gives ? 0xffd040 : 0x60f0ff);
    if (!this.sky.lamps) return;
    // dark enough for lamps: every running car throws a beam from its nose, your own first
    const lamp = (c: World['cars'][number]) => {
      if (c.wrecked || !c.has.front || !this.visible(c.x, c.y, 150)) return;
      // (a beam from whichever head lamps are lit this instant: both, one to its side, or none)
      const out = lampsOut(c, w.time) & 3;
      if (out === 3) return;
      // a car in the air: its beams leave its lamps where they are drawn, up off the ground, so
      // they never come loose from the car, and they tip and swing with it as on the ground
      const air = Math.max(0, c.z - c.deck);
      // from the lamps themselves: where this car's look has them, ahead of its middle, out to
      // each side and up off the ground (a car with none drawn throws its beam from its nose)
      const spot = this.art.headLamp(c.def.id);
      const a = (spot ? spot.x - 0.5 : c.def.body.halfLength - 1) * c.size;
      const wide = (spot ? spot.y : c.def.body.halfWidth * 0.6) * c.size;
      const high = spot ? (BODY_UP + spot.z) * c.size : 0;
      // a lamp up off the ground is drawn that far up the picture, and so is the start of its
      // beam: the light is seen to leave the lamp, not the ground under the bumper
      const up = Math.round(((air + high) * this.cosP) / this.ys);
      const side = out === 0 ? 0 : (out === 1 ? 1 : -1) * wide;
      L.cone(
        c.x + Math.cos(c.h) * a - Math.sin(c.h) * side,
        c.y + Math.sin(c.h) * a + Math.cos(c.h) * side - up,
        // (the beam lies as the car does: tipped to a side, it swings towards the low one; nose
        // up, it leaves the ground; nose down, it falls short)
        c.h - c.bank * 0.35,
        // (up on a deck it is the deck's light, and none of the ground's under it)
        c.deck,
        // (in the air too, as far as keeps some of it on the ground: nose up it reaches out and
        // thins, nose down it falls short under the car)
        air > 1 ? Math.max(-0.6, Math.min(0.12, c.pitch * 1.5)) : c.pitch * 1.5,
        // (two lamps, a beam from each, unless one of them is out)
        // (with how far up the picture the beam starts: its shadows fall from the car's foot)
        (out === 0 ? Math.min(31, wide) : 0) + up * 32,
      );
    };
    lamp(w.player);
    // (a phone that is struggling gets your own beam and two more)
    const most = fx.quality > 0.6 ? MAX_CONES : 3;
    for (const c of w.cars) if (c !== w.player && L.coneCount < most) lamp(c);
    const k = (this.sky.now.dark - 0.42) / 0.58;
    // and every running car's two tail lamps each lay a small red glow on the ground right at
    // its own corner of the bumper, as a car's do: dim while it runs, bright while it brakes
    // (it is slowing hard, backing up or on the handbrake). None from a car in the air or on a deck.
    const dt = Math.max(0, t - this.tailT);
    this.tailT = t;
    for (const c of w.cars) {
      // what it has slowed by since the last frame, eased so the lamps do not flicker
      const was = this.tailV[c.index] ?? c.vf;
      this.tailV[c.index] = c.vf;
      const slowing = dt > 0 && dt < 0.2 && c.vf > 5 && (was - c.vf) / dt > 45;
      const on = slowing || c.handbrake || c.vf < -1 ? 1 : 0;
      const lit = (this.tailOn[c.index] ?? 0) + (on - (this.tailOn[c.index] ?? 0)) * 0.35;
      this.tailOn[c.index] = lit;
      if (c.wrecked || !this.visible(c.x, c.y, 60)) continue;
      // (your own only, on a phone that is struggling)
      if (c !== w.player && fx.quality <= 0.6) continue;
      if (c.z - c.deck > 1 || c.deck >= 1) continue;
      const cs = Math.cos(c.h);
      const sn = Math.sin(c.h);
      const back = (c.def.body.halfLength + 1.5) * c.size;
      const side = c.def.body.halfWidth * 0.6 * c.size;
      for (const sgn of [-1, 1])
        L.add(
          c.x - cs * back - sn * side * sgn,
          c.y - sn * back + cs * side * sgn,
          (3.2 + 1.3 * lit) * c.size,
          (0.4 + 0.9 * lit) * k,
          0xff2030,
        );
    }
    // and scenery with a lamp in it lights the ground round its foot. A row of lit things (a run
    // of barriers) is a few pools, not one each: lights are few, and the cars' come first
    const lit = this.lit;
    lit.length = 0;
    for (const s of w.statics) {
      // (and only into light slots still free: a lamp post never puts a car's lamps out)
      if (lit.length >= 10 || L.count >= MAX_LIGHTS) break;
      if (s.down || !this.visible(s.x, s.y, 50)) continue;
      if (!this.art.prop(s.def.id).glow) continue;
      let near = false;
      for (let n = 0; n < lit.length; n += 2)
        if (Math.abs(lit[n]! - s.x) + Math.abs(lit[n + 1]! - s.y) < 70) near = true;
      if (near) continue;
      lit.push(s.x, s.y);
      L.add(s.x, s.y, 44, 0.6 * k, 0xffd890);
    }
  }

  /** Getting a race ready (`prepare`): everything counts as in view, and every pass is drawn. */
  private everything = false;
  private warming = false;

  /**
   * A venue's ground is known: start building the shader it is painted with, while the rest of
   * the race is still being made.
   */
  early(w: World, ground: Ground): void {
    prelink(this.gl, groundSources(ground, this.raised && !!w.relief));
    // and its heights and textures go to the GPU now, while the art is built on other threads
    this.lay(w, ground);
  }

  /**
   * Everything a race's first frames would otherwise stop to do, done behind the loader: the
   * raised ground's map, the ground's textures, the shadow map, every pass the frame may go
   * through, and every strip in the world packed into the atlas. `say` tells the loader what is
   * being done and comes back once that has been shown. Then one frame is drawn, with every pass
   * in it, so the first frame the player sees is like any other.
   */
  async prepare(
    w: World,
    fx: Effects,
    ground: Ground,
    cam: Camera,
    W: number,
    H: number,
    say: (text: string) => Promise<void>,
  ): Promise<void> {
    const gl = this.gl;
    await say('Raising the ground');
    this.adopt(w, fx, ground);
    await say('Lighting the scenery');
    this.sun ??= new SunShadow(gl);
    this.block ??= new LightBlock(gl);
    this.field ??= new TracedLight(gl);
    this.haze ??= new BeamHaze(gl);
    this.fog ??= new FogPass(gl);
    this.lens ??= new LensPass(gl);
    this.dusk ??= new DuskPass(gl);
    this.warming = true;
    try {
      this.draw(w, fx, ground, cam, W, H);
    } finally {
      this.warming = false;
    }
    // and wait until the GPU has really drawn it (a read-back of one pixel is the one call that
    // does): whatever it had to do for the first time is done behind the loader too
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }

  /** A race's ground and its heights onto the GPU (once: nothing to do for the ground there is). */
  private lay(w: World, ground: Ground): void {
    if (ground === this.ground) return;
    const gl = this.gl;
    this.groundLayer?.dispose();
    this.relief?.dispose();
    this.relief = new ReliefLayer(
      gl,
      this.raised ? w.relief : null,
      w.w,
      w.h,
      this.cosP / this.ys,
      leapFaces(w),
      leapHeights(w),
    );
    this.stacks.relief = this.relief;
    this.groundLayer = new GroundLayer(gl, ground, this.relief);
    this.ground = ground;
  }

  /** Take a race in: its ground and heights on the GPU, its shadows mapped, last race's art dropped. */
  private adopt(w: World, fx: Effects, ground: Ground): void {
    const gl = this.gl;
    this.lay(w, ground);
    // a new race: nothing of the last one's damaged art will be drawn again
    if (fx !== this.fx) {
      this.atlas.reset();
      if (this.fx) this.fx.cells.gpu = null;
      this.fx = fx;
      // fire and smoke go to the GPU from here on (if it can take them)
      if (this.gas === undefined) {
        try {
          this.gas = new GasGpu(gl, GAS_CAP);
        } catch {
          this.gas = null;
        }
      }
      this.gas?.clear();
      fx.cells.gpu = this.gas;
      // still air over the new map
      this.fluid?.reset(w.w, w.h);
      this.stirAt.clear();
      this.fogT = w.time;
      // and its tall scenery throws its shadows anew, from its own shape
      this.shadowLayer?.dispose();
      const art = this.art;
      this.shadows = new ShadowMap(
        w.w,
        w.h,
        (s) => fx.scarred.get(s) ?? art.prop(s.def.id),
        pixels,
      );
      this.shadows.build(w.statics);
      this.shadowLayer = new ShadowLayer(gl, this.shadows, this.relief);
    }
  }

  draw(w: World, fx: Effects, ground: Ground, cam: Camera, W: number, H: number): void {
    const gl = this.gl;
    const S = this.scale;
    this.adopt(w, fx, ground);
    // the sky follows its targets, and strips waiting for their lighting get a little time
    const clock = performance.now();
    const dt = this.fixedDt ?? (this.lastT ? Math.min(0.1, (clock - this.lastT) / 1000) : 0);
    this.lastT = clock;
    const A = this.sky;
    A.ask.dark = fx.weather.dark;
    A.ask.wet = fx.weather.wet;
    A.ask.fog = fx.weather.fog;
    A.update(dt);
    this.atlas.work(2.5, () => performance.now());
    const sky = this.stackSky;
    sky.lit = !A.flat;
    sky.glow = A.glow;
    sky.snow = A.now.snow;
    sky.wet = A.now.wet;
    sky.time = A.time;
    sky.grow = this.bloom && w.time < 2.6 ? [w.player.x, w.player.y, w.time * 70 - 6] : undefined;
    const tint = A.plain ? undefined : A.ground;
    this.shadows!.update(w);
    this.shadowLayer!.sync();
    for (const s of fx.dropped) this.atlas.release(s);
    fx.dropped.length = 0;
    for (const s of fx.changed) this.atlas.refresh(s);
    fx.changed.clear();
    this.groundLayer!.sync();
    // (the water moves with the race's own clock: stopped, it is a still picture like the rest)
    this.groundLayer!.waterTime = w.time % 3600;

    // the view: the camera point in the middle, origin snapped to whole device pixels (as mudders' Camera)
    const cx = cam.x + cam.ox;
    const cy = cam.y + cam.oy;
    this.vw = W;
    this.vh = H;
    this.ox = Math.round(W / 2 - cx * S);
    // (the camera point is on the ground, however high the ground stands there)
    this.oy = Math.round(H / 2 - cy * S * this.ys + this.rise(cam.x, cam.y) * S * this.cosP);
    const view: StackView = {
      w: W,
      h: H,
      ox: this.ox,
      oy: this.oy,
      scale: S,
      ys: this.ys,
      zk: S * this.cosP,
      worldH: w.h,
      top: this.relief!.top,
    };

    // every slice of the frame is queued first: the sun's map is drawn from them before anything
    // that reads it
    if (this.warming) {
      // every strip in the world takes its place in the atlas now, not as it comes into view
      this.everything = true;
      this.atlas.gather();
      this.stacks.begin(view);
      queueStacks(this, this.art, w, fx);
      this.atlas.pack();
      this.everything = false;
    }
    {
      const casts = this.sunCast && sky.lit && A.shade > 0.03 && fx.quality > 0.3;
      this.throwX = casts ? A.reach[0]! : 0;
      this.throwY = casts ? A.reach[1]! : 0;
    }
    this.stacks.begin(view);
    queueStacks(this, this.art, w, fx);
    for (const v of fx.voxels) this.stacks.voxel(v.rgb, v.x, v.y, v.z, v.rot, v.s);
    for (const v of fx.wreck.grains) this.stacks.voxel(v.rgb, v.x, v.y, v.z, v.rot, v.s);
    for (const v of fx.wreck.homing) this.stacks.voxel(v.rgb, v.x, v.y, v.z, v.rot, v.s);
    this.stacks.ready();
    // the bright look casts lighter shadows
    this.shade =
      A.shade * (sky.grow ? Math.min(1, w.time / 2.6) : 1) * (groundMode.bright ? 0.6 : 1);
    const warm = this.warming;
    const cast = this.sunCast && sky.lit && (warm || (this.shade > 0.03 && fx.quality > 0.3));
    if (cast) {
      const sun = (this.sun ??= new SunShadow(gl));
      sun.density = fx.quality > 0.6 ? 2 : 1;
      sun.begin(view, A.reach[0]!, A.reach[1]!);
      sun.castGround(this.relief!);
      this.stacks.cast(sun);
      sun.end(null, W, H);
      sky.cast = sun;
      sky.shade = this.shade;
    } else {
      sky.cast = undefined;
      sky.shade = 0;
    }

    this.gatherLights(w, fx);
    // (how high the ground stands under each light: none of it goes over a raised road's edge)
    {
      const L = this.lights;
      if (!this.lightLevels) {
        L.gz.fill(0);
        L.coneh.fill(0);
      } else {
        for (let i = 0; i < L.count; i++) L.gz[i] = this.rise(L.pos[i * 4]!, L.pos[i * 4 + 1]!);
        for (let i = 0; i < L.coneCount; i++)
          L.coneh[i * 4 + 1] = this.rise(L.cones[i * 4]!, L.cones[i * 4 + 1]!);
      }
    }
    const lit = this.lights.count + this.lights.coneCount > 0;
    // (by day it is wanted for the light things throw back on the ground beside them)
    const blocked = this.lightCast && sky.lit && (lit || cast) && (warm || fx.quality > 0.5);
    const rl = Math.hypot(A.reach[0]!, A.reach[1]!) || 1;
    const bounce: [number, number, number] = [
      A.reach[0]! / rl,
      A.reach[1]! / rl,
      cast ? this.shade * (A.sun[0]! + A.sun[1]! + A.sun[2]!) * 0.24 : 0,
    ];
    if (blocked) {
      const block = (this.block ??= new LightBlock(gl));
      block.begin(view);
      this.stacks.block(block);
      // (the flames too, as light: the traced light takes its shape from them)
      if (this.traced && this.flames && fx.quality > 0.6) this.gas?.emit(block.box);
      block.end(null, W, H);
      sky.block = block;
      // (the rays are walked while nothing else is bound: the frame's own target comes after)
      if (this.traced && (warm || fx.quality > 0.6)) {
        const field = (this.field ??= new TracedLight(gl));
        const k = cast ? this.shade : 0;
        field.trace(
          block,
          this.lights,
          this.relief!,
          cast ? this.sun : null,
          [A.sun[0]! * k, A.sun[1]! * k, A.sun[2]! * k],
          A.glow,
          null,
          W,
          H,
        );
        sky.traced = field;
      } else sky.traced = undefined;
    } else {
      sky.block = undefined;
      sky.traced = undefined;
    }

    // ground fog: the air it lies in moves on, stirred by what drives and bursts in it
    const foggy = this.groundFog && sky.lit ? (warm ? Math.max(A.now.fog, 0.5) : A.now.fog) : 0;
    const drift: [number, number] = [7 + w.wind[0] * 0.5, 2.5 + w.wind[1] * 0.5];
    if (foggy > 0.01) this.stir(w, fx, drift, W, H);
    else this.fogT = w.time;

    // shockwaves bend the picture: while one is on screen the frame goes through the lens pass
    const lenses = this.gatherLenses(fx);
    const bent = lenses.length > 0 || warm;
    if (bent) (this.lens ??= new LensPass(gl)).begin(W, H);

    gl.viewport(0, 0, W, H);
    const bg = hex(w.venue.colors.outside);
    gl.clearColor(((bg >> 16) & 255) / 255, ((bg >> 8) & 255) / 255, (bg & 255) / 255, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND);
    // raised ground writes its depth as it is drawn, so a bank hides what is behind it
    const raised = !!this.relief!.map;
    if (raised) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.ALWAYS);
      gl.depthMask(true);
    } else gl.disable(gl.DEPTH_TEST);
    const groundSky = { ground: A.ground, snow: sky.snow, wet: sky.wet };
    this.groundLayer!.draw(
      view,
      this.lights,
      groundSky,
      blocked ? this.block : null,
      bounce,
      sky.traced,
      this.showTraced,
    );
    gl.disable(gl.DEPTH_TEST);

    // shadows, in projected map space (x, squashed y) so mudders' quad batch draws them as is
    const quadView: [number, number] = [W, H];
    const quadOrigin: [number, number] = [this.ox, this.oy];
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.shadowLayer!.draw(view, this.shade, cast);
    if (cast) this.sun!.drawGround(view, this.relief!, [w.w, w.h], fineGrid(S), this.shade);
    this.queueShadows(w, fx, cast);
    this.quads.flush(quadView, quadOrigin, S);

    // stacks: one instanced draw, sorted by the depth buffer
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    if (sky.wet > 0.02 && this.reflections && fx.quality > 0.5) {
      // wet ground: the stacks upside down under their feet first, then the depth buffer afresh
      this.stacks.mirror(this.lights, sky);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      if (raised) {
        // (and the raised ground's depth again, without its colour)
        gl.colorMask(false, false, false, false);
        gl.depthFunc(gl.ALWAYS);
        this.groundLayer!.draw(view, this.lights, groundSky);
        gl.depthFunc(gl.LESS);
        gl.colorMask(true, true, true, true);
      }
    }
    this.stacks.flush(this.lights, sky);
    gl.disable(gl.DEPTH_TEST);
    // the fog lies over the ground and the feet of everything on it; fire and smoke are over it
    if (foggy > 0.01)
      (this.fog ??= new FogPass(gl)).draw(
        view,
        this.lights,
        this.relief!,
        [w.w, w.h],
        this.fluid!.pushed,
        {
          amount: foggy,
          time: w.time,
          wind: drift,
          light: A.ground,
          dark: A.now.dark,
          sheets: fx.quality > 0.6 ? 3 : fx.quality > 0.35 ? 2 : 1,
        },
      );

    // particles: mudders' single cells, on the screen's fine grid (about 2 device px a cell).
    // Smoke first, fire over it, then the additive cells (sparks, embers, the hot core of a flame).
    gl.enable(gl.BLEND);
    const gas: GasView = {
      w: W,
      h: H,
      ox: this.ox,
      oy: this.oy,
      scale: S,
      grid: this.fxGrid,
      ys: this.ys,
      cosP: this.cosP,
    };
    this.gas?.draw(gas, this.lights, 0, tint, this.relief!);
    this.queueParticles(fx);
    this.queueSnow(W, H);
    this.quads.flush(quadView, quadOrigin, S / this.fxGrid, undefined, tint);
    this.darken(fx, W, H);
    this.gas?.draw(gas, this.lights, 1, tint, this.relief!);
    gl.blendFunc(gl.ONE, gl.ONE);
    // the beams in the air: thin on a clear night, thick in rain and snow
    if (this.lightCast && this.lights.coneCount && fx.quality > 0.5)
      (this.haze ??= new BeamHaze(gl)).draw(
        view,
        this.lights,
        blocked ? this.block : null,
        this.relief!,
        [w.w, w.h],
        fineGrid(S),
        0.3 + 0.5 * Math.max(sky.wet, sky.snow),
      );
    this.glow.flush(quadView, quadOrigin, S / this.fxGrid);
    this.gas?.draw(gas, this.lights, 2, undefined, this.relief!);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
    if (bent) this.lens!.end(lenses, [this.ox, this.oy], S / this.fxGrid, this.ys);

    this.frameW = w;
    if (this.metering && (this.heat || this.wantRead)) {
      this.meter ??= new OverdrawMeter(gl);
      this.meter.count(this, W, H);
      if (this.wantRead) {
        this.last = this.meter.read(this.stacks.count);
        this.wantRead = false;
      }
      if (this.heat) this.meter.drawHeat(this.heat, W, H);
    }
  }

  /**
   * Move the fog's air on to the race's clock (see FogFluid). Cars on the ground shove it aside
   * and drag it after them, the faster the more; a rocket cuts a thin line; a blast blows a hole.
   */
  private stir(w: World, fx: Effects, wind: readonly [number, number], W: number, H: number): void {
    const gl = this.gl;
    if (!this.fluid) {
      this.fluid = new FogFluid(gl);
      this.fluid.reset(w.w, w.h);
      this.fogT = w.time;
    }
    const S = this.stirs;
    let n = 0;
    const put = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      vx: number,
      vy: number,
      r: number,
      push: number,
      clear: number,
    ) => {
      if (n >= MAX_STIRS) return;
      const s = (S[n] ??= { ax: 0, ay: 0, bx: 0, by: 0, vx: 0, vy: 0, r: 0, push: 0, clear: 0 });
      n++;
      s.ax = ax;
      s.ay = ay;
      s.bx = bx;
      s.by = by;
      s.vx = vx;
      s.vy = vy;
      s.r = r;
      s.push = push;
      s.clear = clear;
    };
    for (const b of fx.blasts) if (b.age < 8) put(b.x, b.y, b.x, b.y, 0, 0, b.r * 3.4, 170, 1);
    for (const c of w.cars) {
      const speed = Math.hypot(c.vx, c.vy);
      const was = this.stirAt.get(c.index);
      // (not from the air, and a car put back on the road did not drive there)
      if (c.z > 6 || speed < 10) continue;
      const far = was ? Math.hypot(was[0] - c.x, was[1] - c.y) : 99;
      const from = was && far < 70 ? was : [c.x, c.y];
      put(
        from[0]!,
        from[1]!,
        c.x,
        c.y,
        c.vx,
        c.vy,
        8 * c.size,
        speed * 0.32,
        Math.min(0.92, speed / 95),
      );
    }
    for (const r of w.rockets) {
      const vx = Math.cos(r.h) * r.v;
      const vy = Math.sin(r.h) * r.v;
      put(r.x - vx / 30, r.y - vy / 30, r.x, r.y, vx, vy, 4, 30, 0.6);
    }
    S.length = n;
    const dt = Math.min(0.1, Math.max(0, w.time - this.fogT));
    this.fogT = w.time;
    if (this.fluid.advance(dt, S, wind, null, W, H, this.warming) > 0)
      for (const c of w.cars) {
        const at = this.stirAt.get(c.index);
        if (at) {
          at[0] = c.x;
          at[1] = c.y;
        } else this.stirAt.set(c.index, [c.x, c.y]);
      }
  }

  /**
   * A modifier's own colour (dust in a gale, the heat of a dry spell): multiply the world drawn so
   * far by the weather's tint, less where a fire or a flash lights the ground, and blink the lot
   * for a bolt. Night and rain are the sky's work; fire and glow are drawn after this.
   */
  private darken(fx: Effects, W: number, H: number): void {
    const A = fx.weather;
    if (!A.dim && A.flash <= 0 && !this.warming) return;
    const D = (this.dusk ??= new DuskPass(this.gl));
    D.clear();
    D.take(this.lights);
    const f = A.flash * 0.85;
    const T = A.tint;
    D.draw({ w: W, h: H, ox: this.ox, oy: this.oy, scale: this.scale, ys: this.ys }, [
      T[0] + (1 - T[0]) * f,
      T[1] + (1 - T[1]) * f,
      T[2] + (1 - T[2]) * f,
    ]);
  }

  /** The frame's lens rings in device pixels: every ripple that has started and is near the view. */
  private gatherLenses(fx: Effects): Lens[] {
    const L = this.lenses;
    L.length = 0;
    if (!this.distort) return L;
    const S = this.scale;
    for (const r of fx.ripples) {
      if (L.length >= MAX_RIPPLES) break;
      if (r.t < 0 || r.t > r.dur) continue;
      const at = rippleAt(r.t / r.dur, r.maxR, r.width, r.strength);
      if (!this.visible(r.x, r.y, at.r + 4)) continue;
      L.push({
        x: this.sx(r.x),
        y: this.sy(r.y, r.z + this.rise(r.x, r.y)),
        r: at.r * S,
        width: at.width * S,
        strength: at.strength,
      });
    }
    return L;
  }

  private queueShadows(w: World, fx: Effects, sun: boolean): void {
    const art = this.art;
    const cast = (s: StaticProp) => casts(s, fx.scarred.get(s) ?? art.prop(s.def.id));
    queueShadows(this, art, w, cast, sun, (x, y, rx, ry, rot, a, box) =>
      this.quads.push(
        x,
        this.my(y, this.rise(x, y)),
        rx * 2,
        ry * 2 * this.ys,
        0x000000,
        a * this.shade,
        box ? Shape.Rect : Shape.Disc,
        Math.atan2(Math.sin(rot) * this.ys, Math.cos(rot)),
      ),
    );
  }

  /**
   * Particles, on the screen's own fine grid: one cell is `fxGrid` to the art pixel, about two
   * device pixels (one CSS pixel), as small as mudders draws its fire and smoke at a whole-map
   * view. Fire, smoke, sparks and embers are single cells on that grid; the few blob particles
   * left (art px sizes) are drawn on it too, so their edges step in fine cells. Smoke first, fire
   * over it; the additive cells (sparks, embers, the hot core of a flame) go to the glow batch.
   */
  private queueParticles(fx: Effects): void {
    const G = this.fxGrid;
    // a cell's place on the grid: odd sizes sit on a cell, even ones on the line between cells
    const at = (v: number, n: number) => (n & 1 ? Math.floor(v * G) + 0.5 : Math.round(v * G));
    // sizes in art px (blobs)
    const normal: Put = (x, y, z, d, rgb, a, shape) => {
      const n = Math.max(1, Math.round(d * G));
      this.quads.push(at(x, n), at(this.my(y, z + this.rise(x, y)), n), n, n, rgb, a, shape);
    };
    const glow: Put = (x, y, z, d, rgb, a) => {
      const n = Math.max(1, Math.round(d * G));
      this.glow.push(at(x, n), at(this.my(y, z + this.rise(x, y)), n), n, n, rgb, a, Shape.Rect);
    };
    // sizes in fine cells (fire, smoke, leaves, arcs: mudders' single cells)
    const cellN: Put = (x, y, z, n, rgb, a, shape) =>
      this.quads.push(at(x, n), at(this.my(y, z + this.rise(x, y)), n), n, n, rgb, a, shape);
    const cellG: Put = (x, y, z, n, rgb, a) =>
      this.glow.push(at(x, n), at(this.my(y, z + this.rise(x, y)), n), n, n, rgb, a, Shape.Rect);
    const one = 1 / G;
    for (const f of fx.fx)
      if (!overSmoke(f) && this.visible(f.x, f.y, 40, f.z)) drawParticle(f, normal, glow, one);
    for (const f of fx.fx)
      if (overSmoke(f) && this.visible(f.x, f.y, 40, f.z)) drawParticle(f, normal, glow, one);
    fx.cells.draw(cellN, cellG, (x, y, z) => this.visible(x, y, 4, z));
    fx.shock.sparks.draw(cellN, cellG, (x, y, z) => this.visible(x, y, 4, z));
    fx.defence.draw(glow, (x, y) => this.visible(x, y, 30, 10));
    const S = this.scale;
    const wd: WeatherDraw = {
      cx: (this.vw / 2 - this.ox) / S,
      cy: (this.vh / 2 - this.oy) / (S * this.ys),
      hw: this.vw / (2 * S),
      hh: this.vh / (2 * S * this.ys),
      cell: (x, y, z, n, rgb, a) => cellN(x, y, z, n, rgb, a, Shape.Rect),
      glow: (x, y, z, n, rgb, a) => cellG(x, y, z, n, rgb, a, Shape.Rect),
      bar: (x, y, z, bw, bh, rgb, a, rot) =>
        this.quads.push(
          Math.round(x * G),
          Math.round(this.my(y, z + this.rise(x, y)) * G),
          bw,
          bh,
          rgb,
          a,
          Shape.Rect,
          rot,
        ),
      shade: (x, y, d, a) =>
        this.quads.push(
          x * G,
          this.my(y, this.rise(x, y)) * G,
          d * G,
          d * G * this.ys,
          0x000000,
          a,
          Shape.Disc,
        ),
      ys: this.ys,
      cosP: this.cosP,
    };
    fx.weather.draw(wd);
  }

  /**
   * Falling snow: single cells on the fine grid, each on its own slow path down the screen,
   * drifting with the ground as the camera moves so they do not stick to the glass.
   */
  private queueSnow(W: number, H: number): void {
    const A = this.sky;
    const fall = Math.min(1, A.snow) * (this.fx ? Math.min(1, this.fx.quality + 0.2) : 1);
    if (fall <= 0.01 || A.flat) return;
    const cell = this.scale / this.fxGrid;
    const cw = W / cell;
    const ch = H / cell;
    const n = Math.round(((W * H) / 5200) * fall);
    const t = A.time;
    const ox = this.ox / cell;
    const oy = this.oy / cell;
    for (let i = 0; i < n; i++) {
      // a cheap hash per flake: where it starts, how fast it falls, how it wanders
      const a = Math.sin(i * 12.9898) * 43758.5453;
      const b = Math.sin(i * 78.233) * 12543.123;
      const fa = a - Math.floor(a);
      const fb = b - Math.floor(b);
      const near = 0.5 + fa * 0.9;
      const x = fa * cw * 7 + ox * near + Math.sin(t * (0.6 + fb) + i) * 5 + t * 6 * near;
      const y = fb * ch * 5 + oy * near + t * (16 + 22 * fb) * near;
      const sx = ((x % cw) + cw) % cw;
      const sy = ((y % ch) + ch) % ch;
      const big = near > 1.15 ? 2 : 1;
      this.glow.push(
        Math.floor(sx - ox) + 0.5 * (big & 1),
        Math.floor(sy - oy) + 0.5 * (big & 1),
        big,
        big,
        0xdfe8f4,
        0.55 + 0.4 * fb,
        Shape.Rect,
      );
    }
  }

  // ---- the overdraw meter (?dev OVERDRAW, ?overdraw with the perf recorder, __dd.overdraw())

  /** Draw slices nearest first (the default) or in the order they are queued (to compare). */
  set frontToBack(on: boolean) {
    this.stacks.frontToBack = on;
  }

  get frontToBack(): boolean {
    return this.stacks.frontToBack;
  }

  /** Turn the meter on (it keeps a shelled copy of the atlas while on) or off. */
  setMeter(on: boolean): void {
    if (on === this.metering) return;
    this.metering = on;
    this.atlas.setShell(on);
    if (!on) {
      this.heat = null;
      this.last = null;
    }
  }

  get meterOn(): boolean {
    return this.metering;
  }

  /** Show one count as a heat map over the world, or none. */
  setHeat(ch: Channel | null): void {
    if (ch) this.setMeter(true);
    this.heat = ch;
  }

  get heatShown(): Channel | null {
    return this.heat;
  }

  /** Ask for a read-back with the next frame; `overdraw` has it after that frame is drawn. */
  measureNext(): void {
    if (this.metering) this.wantRead = true;
  }

  /** The last read-back, if any. */
  get overdraw(): OverdrawStats | null {
    return this.last;
  }

  // CountSource: the frame's slices and particles drawn again with counting shaders
  slices(cover: boolean, shell: boolean, front: boolean, step: number): void {
    this.stacks.drawCount({ cover, shell, front, step }, this.lights);
  }
  particles(step: number): void {
    if (!this.frameW || !this.fx) return;
    const q: [number, number] = [this.vw, this.vh];
    const o: [number, number] = [this.ox, this.oy];
    this.queueShadows(this.frameW, this.fx, !!this.stackSky.cast);
    this.quads.flush(q, o, this.scale, step);
    this.queueParticles(this.fx);
    this.quads.flush(q, o, this.scale / this.fxGrid, step);
    this.glow.flush(q, o, this.scale / this.fxGrid, step);
  }

  /** Slices drawn last frame (for the perf readout and tests). */
  /** The sprite atlas: how full it is, and how often it filled up and was started again. */
  get atlasState(): { fill: number; flushes: number } {
    return { fill: this.atlas.fill, flushes: this.atlas.flushes };
  }

  /** Strips still waiting for their lighting to be baked. */
  get baking(): number {
    return this.atlas.baking;
  }

  get instances(): number {
    return this.stacks.count;
  }
}
