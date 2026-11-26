import { describe, expect, it } from 'vitest';
import { nextBox, type Box } from './pad-menu';

const box = (x: number, y: number, w = 100, h = 40): Box => ({ x, y, w, h });

describe('moving round a menu with a gamepad', () => {
  // two columns of three, and a wide button under them
  const grid = [box(0, 0), box(0, 50), box(0, 100), box(120, 0), box(120, 50), box(120, 100)];
  const wide = box(0, 160, 220, 40);
  const all = [...grid, wide];

  it('goes to the nearest thing that way', () => {
    expect(nextBox(grid[0]!, all, 'down')).toBe(1);
    expect(nextBox(grid[1]!, all, 'right')).toBe(4);
    expect(nextBox(grid[4]!, all, 'up')).toBe(3);
    expect(nextBox(grid[5]!, all, 'left')).toBe(2);
  });

  it('reaches a wide button from either column, and stops at the edge', () => {
    expect(nextBox(grid[2]!, all, 'down')).toBe(6);
    expect(nextBox(grid[5]!, all, 'down')).toBe(6);
    expect(nextBox(wide, all, 'down')).toBe(-1);
    expect(nextBox(grid[0]!, all, 'left')).toBe(-1);
  });

  it('would sooner go straight than to something nearer but off to the side', () => {
    const from = box(0, 0);
    const beside = box(110, 45);
    const below = box(0, 120);
    expect(nextBox(from, [beside, below], 'down')).toBe(1);
  });
});
