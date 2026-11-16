import type { Rect } from '../types';

/**
 * 视线遮挡判定（需求 2.4：墙体与掩体遮挡视线，被遮挡区域内的敌人不渲染）。
 *
 * 做法：把"我 → 敌人"连成一条线段，逐个检查是否与任意墙体矩形相交。
 * 这里用 Liang–Barsky 线段裁剪算法，它比"采样一串点看有没有落在墙里"更准也更便宜：
 * 不会有采样点跳过薄墙的漏判，也不需要循环次数。
 *
 * 这是纯几何函数，不认识任何渲染概念，所以既可以给客户端算"画不画"，
 * 也可以将来给服务端算"该不该下发这个敌人的位置"。
 */

/** 线段与单个矩形是否相交 */
export function isSegmentBlockedByRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: Rect,
): boolean {
  // 先用包围盒快速排除：绝大多数墙体在这一步就能被跳过
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  if (maxX < rect.x || minX > rect.x + rect.width) {
    return false;
  }
  if (maxY < rect.y || minY > rect.y + rect.height) {
    return false;
  }

  const deltaX = x2 - x1;
  const deltaY = y2 - y1;

  // 四条边分别做参数裁剪：t 是线段上的比例位置，范围 [0, 1]
  let tEnter = 0;
  let tExit = 1;

  const edges: Array<[number, number]> = [
    [-deltaX, x1 - rect.x], // 左边界
    [deltaX, rect.x + rect.width - x1], // 右边界
    [-deltaY, y1 - rect.y], // 上边界
    [deltaY, rect.y + rect.height - y1], // 下边界
  ];

  for (const [p, q] of edges) {
    if (p === 0) {
      // 线段平行于该边界：只要起点在外侧就永不相交
      if (q < 0) {
        return false;
      }
      continue;
    }

    const t = q / p;
    if (p < 0) {
      if (t > tExit) {
        return false;
      }
      if (t > tEnter) {
        tEnter = t;
      }
    } else {
      if (t < tEnter) {
        return false;
      }
      if (t < tExit) {
        tExit = t;
      }
    }
  }

  return tEnter <= tExit;
}

/** 两点之间是否没有墙体阻挡（true = 视线可达） */
export function hasLineOfSight(
  walls: Rect[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  for (const wall of walls) {
    if (isSegmentBlockedByRect(x1, y1, x2, y2, wall)) {
      return false;
    }
  }
  return true;
}
