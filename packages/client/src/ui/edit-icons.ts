/**
 * The track creator's pictures: line drawings on a 24 by 24 square, so a button says what it does
 * without a word on a phone's narrow screen. Each is one SVG path, stroked in the button's colour.
 */
const PATHS: Record<string, string> = {
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  road: 'M6 21L9 3M18 21L15 3M12 4v3M12 10.5v3M12 17v3',
  cone: 'M10 4h4l4 14H6zM4 20.5h16M8.6 10h6.8M7.3 14.5h9.4',
  hills: 'M2 19c3-6 6-6 9-1 2-5 6-7 11 0M2 21h20M17 4.5a2 2 0 1 0 .01 0',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  undo: 'M8 5L3 10l5 5M3 10h11a5 5 0 0 1 0 10h-3',
  redo: 'M16 5l5 5-5 5M21 10H10a5 5 0 0 0 0 10h3',
  back: 'M15 5l-7 7 7 7',
  share: 'M12 15V3M8 7l4-4 4 4M5 12v8h14v-8',
  play: 'M8 5l11 7-11 7z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  grid: 'M4 9h16M4 15h16M9 4v16M15 4v16',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  turnl: 'M4 4v6h6M4.6 10a8 8 0 1 1 1.7 8',
  turnr: 'M20 4v6h-6M19.4 10a8 8 0 1 0-1.7 8',
  check: 'M5 12l5 5 9-10',
  pencil: 'M4 20l1-5L16 4l4 4L9 19zM14 6l4 4',
};

const NS = 'http://www.w3.org/2000/svg';

/** One of the pictures, as an element to put in a button. */
export function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ic', `ic-${name}`);
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', PATHS[name] ?? '');
  svg.append(path);
  return svg;
}
