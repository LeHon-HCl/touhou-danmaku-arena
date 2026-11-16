import { describe, expect, it } from 'vitest';
import { isPointInRects, isSegmentHittingCircle } from './projectile';

describe('子弹命中判定（tech-design 4.4：必须做线段扫掠）', () => {
  it('高速子弹穿过目标时也能判定命中', () => {
    // 30Hz 下 600px/s 的子弹单帧走 20px，逐点判定会直接穿过去
    const isHit = isSegmentHittingCircle(0, 0, 0, 40, 0, 20, 6);
    expect(isHit).toBe(true);
  });

  it('线段掠过圆外侧则不命中', () => {
    const isHit = isSegmentHittingCircle(0, 0, 0, 40, 30, 20, 6);
    expect(isHit).toBe(false);
  });

  it('子弹起点已在圆内视为命中', () => {
    const isHit = isSegmentHittingCircle(0, 0, 0, 5, 0, 0, 6);
    expect(isHit).toBe(true);
  });

  it('点落在墙体内判定为撞墙', () => {
    const walls = [{ x: 100, y: 100, width: 32, height: 32 }];
    expect(isPointInRects(walls, 116, 116)).toBe(true);
    // 边界 132 视为命中（闭区间），140 在墙外
    expect(isPointInRects(walls, 140, 116)).toBe(false);
  });
});
