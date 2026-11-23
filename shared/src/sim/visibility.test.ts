import { describe, expect, it } from 'vitest';
import { hasLineOfSight, isSegmentBlockedByRect } from './visibility';

/** 一块 x 100–164、y 100–164 的墙 */
const wall = { x: 100, y: 100, width: 64, height: 64 };

describe('视线遮挡（需求 2.4）', () => {
  it('线段穿过墙体时被遮挡', () => {
    expect(isSegmentBlockedByRect(0, 132, 200, 132, wall)).toBe(true);
  });

  it('线段从墙体旁边经过时不遮挡', () => {
    expect(isSegmentBlockedByRect(0, 60, 200, 60, wall)).toBe(false);
  });

  it('线段完全在墙内时算遮挡', () => {
    expect(isSegmentBlockedByRect(110, 110, 150, 150, wall)).toBe(true);
  });

  it('线段擦过墙体边缘算遮挡（闭区间）', () => {
    expect(isSegmentBlockedByRect(0, 100, 200, 100, wall)).toBe(true);
  });

  it('hasLineOfSight 汇总多块墙的结果', () => {
    const walls = [wall, { x: 300, y: 0, width: 32, height: 32 }];
    // 从左边穿墙看右边 → 不可见
    expect(hasLineOfSight(walls, 0, 132, 200, 132)).toBe(false);
    // 从上方看下方，中间没有墙 → 可见
    expect(hasLineOfSight(walls, 0, 40, 200, 40)).toBe(true);
  });
});
