/**
 * Looks: how an item is drawn as a sprite stack. A part is a block of voxels described by a
 * function: w runs front to back (+x is forward), h side to side, layers is the height, all in art
 * pixels. fn(x, y, z) names the material at that point (x and y from the middle of the cell) or
 * returns null for empty. The client turns parts into slice strips; the sim never reads looks.
 */
export type ShapeFn = (x: number, y: number, z: number) => string | null;

export interface Part {
  w: number;
  h: number;
  layers: number;
  fn: ShapeFn;
}

/** Three tones per material: side in shade, side, top. */
export type Tones = readonly [string, string, string];

export interface CarLook {
  kind: 'car';
  body: Part;
  /** The roof piece (light bar, rack, spoiler) that can be knocked off. */
  top: Part;
}

export interface PropLook {
  kind: 'prop';
  part: Part;
  /** Extra materials this look uses beyond the shared palette. */
  materials?: Record<string, Tones>;
}

export interface BotLook {
  kind: 'bot';
  body: Part;
  aerial: Part;
  limb: Part;
  foot: Part;
  chunk: Part;
}

export type Look = CarLook | PropLook | BotLook;

/** A look module: the item id it draws, and the look. */
export interface LookModule {
  id: string;
  look: Look;
}
