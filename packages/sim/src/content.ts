import {
  CONTENT_TYPES,
  PackSchema,
  SCHEMAS,
  type ContentType,
  type ManifestByType,
  type PackManifest,
} from '@demodogs/shared';
import type { AiBehaviour } from './behaviours';

/** What the content package hands the kernel: raw manifests and behaviour modules. */
export interface RawManifest {
  path: string;
  data: unknown;
}
export interface ContentSource {
  packs: { pack: unknown; manifests: RawManifest[] }[];
  behaviours: AiBehaviour[];
}

/** Everything resolved and validated, by id. */
export interface Content {
  packs: PackManifest[];
  car: Map<string, ManifestByType['car']>;
  venue: Map<string, ManifestByType['venue']>;
  mode: Map<string, ManifestByType['mode']>;
  weapon: Map<string, ManifestByType['weapon']>;
  pickup: Map<string, ManifestByType['pickup']>;
  prop: Map<string, ManifestByType['prop']>;
  material: Map<string, ManifestByType['material']>;
  bot: Map<string, ManifestByType['bot']>;
  ai: Map<string, ManifestByType['ai']>;
  modifier: Map<string, ManifestByType['modifier']>;
  behaviours: Map<string, AiBehaviour>;
}

export class ContentError extends Error {
  constructor(readonly problems: string[]) {
    super(`content has ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  }
}

function typeOf(id: unknown): ContentType | null {
  if (typeof id !== 'string') return null;
  const t = id.split('.')[0] as ContentType;
  return CONTENT_TYPES.includes(t) ? t : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Resolve every pack: apply `extends` (shallow merge, base first), validate each manifest against
 * its type's schema, check that every id an item refers to exists, and register behaviours.
 * Throws ContentError listing every problem at once.
 */
export function resolveContent(src: ContentSource): Content {
  const problems: string[] = [];
  const raw = new Map<string, { path: string; data: Record<string, unknown> }>();
  const out: Content = {
    packs: [],
    car: new Map(),
    venue: new Map(),
    mode: new Map(),
    weapon: new Map(),
    pickup: new Map(),
    prop: new Map(),
    material: new Map(),
    bot: new Map(),
    ai: new Map(),
    modifier: new Map(),
    behaviours: new Map(),
  };
  for (const p of src.packs) {
    const pack = PackSchema.safeParse(p.pack);
    if (!pack.success) problems.push(`pack: ${pack.error.message}`);
    else out.packs.push(pack.data);
    for (const m of p.manifests) {
      if (!isRecord(m.data) || typeof m.data.id !== 'string') {
        problems.push(`${m.path}: no id`);
        continue;
      }
      if (raw.has(m.data.id)) problems.push(`${m.path}: duplicate id ${m.data.id}`);
      raw.set(m.data.id, { path: m.path, data: m.data });
    }
  }

  const merged = (id: string, seen: string[]): Record<string, unknown> | null => {
    const r = raw.get(id);
    if (!r) return null;
    const ext = r.data.extends;
    if (typeof ext !== 'string') return r.data;
    if (seen.includes(ext)) {
      problems.push(`${r.path}: extends cycle ${[...seen, ext].join(' -> ')}`);
      return r.data;
    }
    if (typeOf(ext) !== typeOf(id))
      problems.push(`${r.path}: extends ${ext}, which is another type`);
    const b = merged(ext, [...seen, ext]);
    if (!b) {
      problems.push(`${r.path}: extends missing ${ext}`);
      return r.data;
    }
    const rest = { ...r.data };
    delete rest.extends;
    return { ...b, meta: r.data.meta ?? b.meta, ...rest, id };
  };

  for (const [id, r] of [...raw.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const type = typeOf(id);
    if (!type) {
      problems.push(`${r.path}: unknown type in id ${id}`);
      continue;
    }
    const folder = r.path.split('/');
    if (folder[folder.length - 3] !== type || `${type}.${folder[folder.length - 2]}` !== id)
      problems.push(`${r.path}: id ${id} does not match its folder`);
    const data = merged(id, [id]);
    const parsed = SCHEMAS[type].safeParse(data);
    if (!parsed.success) {
      problems.push(
        `${r.path}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      );
      continue;
    }
    (out[type] as Map<string, unknown>).set(id, parsed.data);
  }

  for (const b of src.behaviours) {
    if (out.behaviours.has(b.id)) problems.push(`behaviour ${b.id} registered twice`);
    out.behaviours.set(b.id, b);
  }

  // references between items
  const need = (from: string, type: ContentType, ref: string) => {
    if (!(out[type] as Map<string, unknown>).has(ref))
      problems.push(`${from}: refers to missing ${ref}`);
  };
  for (const v of out.venue.values()) {
    need(v.id, 'mode', v.mode);
    need(v.id, 'bot', v.bots.bot);
    for (const p of v.pickups) need(v.id, 'pickup', p);
    for (const r of v.scenery) {
      if (r.rule === 'bend-wall' || r.rule === 'ring')
        for (const p of r.props) need(v.id, 'prop', p);
      if (r.rule === 'scatter' || r.rule === 'oval-scatter')
        for (const i of r.items) need(v.id, 'prop', i.prop);
      if (r.rule === 'border' || r.rule === 'oval-wall' || r.rule === 'barricade')
        need(v.id, 'prop', r.prop);
      if (r.rule === 'build')
        for (const k of r.kinds)
          for (const p of [k.wall, k.window, k.post, k.roof, ...k.inside])
            if (p) need(v.id, 'prop', p);
      if (r.rule === 'patches') need(v.id, 'material', r.material);
      if (r.rule === 'river') {
        for (const m of [r.material, r.bank]) need(v.id, 'material', m);
        for (const b of r.bridges) for (const p of [b.deck, b.rail]) need(v.id, 'prop', p);
        if (r.dam) need(v.id, 'prop', r.dam.wall);
        for (const i of r.edge?.items ?? []) need(v.id, 'prop', i.prop);
      }
      if (r.rule === 'place') for (const i of r.items) need(v.id, 'prop', i.prop);
      if (r.rule === 'harbour') {
        need(v.id, 'material', r.material);
        for (const p of [r.piers.deck, r.piers.post, r.bollard, r.barges?.prop])
          if (p) need(v.id, 'prop', p);
        if (r.cranes) for (const p of [r.cranes.leg, r.cranes.beam]) need(v.id, 'prop', p);
      }
      if (r.rule === 'stacks') for (const p of [...r.bottom, ...r.top]) need(v.id, 'prop', p);
      if (r.rule === 'roadside')
        for (const p of [r.pair, r.stack, r.drum, ...r.tanks]) need(v.id, 'prop', p);
    }
    if (!v.track && !v.oval) problems.push(`${v.id}: needs a track or an oval`);
  }
  for (const p of out.prop.values()) {
    if (p.spills) need(p.id, 'material', p.spills.material);
    if (p.made) need(p.id, 'material', p.made);
    if (p.topples) {
      if (p.body !== 'static') problems.push(`${p.id}: only static props topple`);
      if (out.prop.get(p.topples.into)?.body !== 'loose')
        problems.push(`${p.id}: topples into ${p.topples.into}, which is not a loose prop`);
    }
    if (p.throws?.drums) {
      if (!p.throws.drum) problems.push(`${p.id}: throws drums but names none`);
      else if (!out.prop.get(p.throws.drum)?.rocket)
        problems.push(`${p.id}: throws ${p.throws.drum}, which cannot rocket`);
    }
  }
  for (const w of out.weapon.values()) {
    if (w.material) need(w.id, 'material', w.material);
    else if (w.kind === 'slick') problems.push(`${w.id}: a slick needs a material`);
    if (w.cluster) {
      const b = out.weapon.get(w.cluster.bomblet);
      if (!b) need(w.id, 'weapon', w.cluster.bomblet);
      else if (b.kind !== 'rocket' || b.cluster)
        problems.push(`${w.id}: bomblet ${b.id} must be a rocket that does not split again`);
    }
  }
  for (const m of out.modifier.values()) {
    if (m.pools) need(m.id, 'material', m.pools.material);
    if (m.leaves) {
      need(m.id, 'prop', m.leaves.prop);
      if (out.prop.get(m.leaves.prop)?.body === 'loose')
        problems.push(`${m.id}: leaves ${m.leaves.prop}, which is not a static prop`);
    }
  }
  for (const m of out.mode.values()) need(m.id, 'ai', m.ai);
  for (const a of out.ai.values())
    if (!out.behaviours.has(a.behaviour)) problems.push(`${a.id}: no behaviour ${a.behaviour}`);
  for (const p of out.pickup.values()) for (const w of p.weapons ?? []) need(p.id, 'weapon', w);

  if (problems.length) throw new ContentError(problems);
  return out;
}
