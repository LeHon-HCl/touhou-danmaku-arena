import type { Rect } from '../types';

/** 点是否落在任一矩形内（用于子弹撞墙） */
export function isPointInRects(rects: Rect[], x: number, y: number): boolean {
  for (const rect of rects) {
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
      return true;
    }
  }
  return false;
}

/**
 * 线段与圆是否相交。
 *
 * 子弹在 30Hz 下单帧可移动约 20 像素，已大于角色半径，
 * 若只判断「当前帧位置是否在圆内」会直接穿过目标。
 * 所以必须用「上一帧位置 → 当前帧位置」的线段做扫掠检测（tech-design 4.4）。
 */
export function isSegmentHittingCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  circleX: number,
  circleY: number,
  radius: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;

  let t = 0;
  if (lengthSquared > 0) {
    t = ((circleX - x1) * dx + (circleY - y1) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
  }

  const nearestX = x1 + dx * t;
  const nearestY = y1 + dy * t;
  const distanceX = circleX - nearestX;
  const distanceY = circleY - nearestY;

  return distanceX * distanceX + distanceY * distanceY <= radius * radius;
}
