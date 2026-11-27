/**
 * The level builder's signs: line drawings on a 24 by 24 square, stroked in the colour of the
 * words beside them. A sign whose name ends in `!` here is filled, not stroked.
 */
const SIGNS: Record<string, string> = {
  select: 'M6 3l12 9-5.5 1.2L15.5 20l-2.6 1.2-3-6.6L6 18z',
  road: 'M7 3L4 21M17 3l3 18M12 4v3M12 11v3M12 18v3',
  raise: 'M3 19h18M6 19l3-9h6l3 9M12 3v4M10 5l2-2 2 2',
  surface: 'M4 14l8-10 8 10a8 8 0 01-16 0z',
  bridge: 'M2 9h20M2 9c4 6 16 6 20 0M6 12v7M18 12v7',
  things: 'M10 3h4l5 16H5zM4 21h16M8 11h8',
  ground: 'M2 20l7-12 4 6 3-4 6 10z',
  erase: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  back: 'M15 5l-7 7 7 7',
  undo: 'M9 6L4 11l5 5M4 11h10a5 5 0 010 10h-2',
  redo: 'M15 6l5 5-5 5M20 11H10a5 5 0 000 10h2',
  play: 'M7 4l13 8-13 8z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M18.4 5.6l-2.2 2.2M7.8 16.2l-2.2 2.2',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v6h14v-6',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  magnet: 'M6 4v8a6 6 0 0012 0V4h-4v8a2 2 0 01-4 0V4zM6 8h4M14 8h4',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  turnl: 'M4 4v6h6M4.6 10a8 8 0 111.7 8',
  turnr: 'M20 4v6h-6M19.4 10a8 8 0 10-1.7 8',
  pencil: 'M4 20l1-5L16 4l4 4L9 19zM14 6l4 4',
  flag: 'M5 21V4M5 4h13l-3 4 3 4H5',
  swap: 'M4 8h13M14 5l3 3-3 3M20 16H7M10 13l-3 3 3 3',
  layers: 'M12 4l9 5-9 5-9-5zM3 14l9 5 9-5',
  panel: 'M9 6l6 6-6 6',
  save: 'M12 4v11M8 11l4 4 4-4M5 19h14',
  open: 'M12 15V4M8 8l4-4 4 4M5 19h14',
  shuffle: 'M4 7h3l10 10h3M17 14l3 3-3 3M4 17h3l3-3M14 10l3-3h3M17 4l3 3-3 3',
  keys: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8',
};

const FILLED = new Set(['play', 'select']);
const NS = 'http://www.w3.org/2000/svg';

/** One of the signs, as an element to put in a button. */
export function sign(name: string): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('sg');
  if (FILLED.has(name)) svg.classList.add('full');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', SIGNS[name] ?? '');
  svg.append(path);
  return svg;
}
