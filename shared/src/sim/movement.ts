import type { BattleState, PlayerInput, PlayerState } from '../types';

/**
 * 推进一名玩家的移动。
 *
 * 位移在共享层自己实现，不使用引擎物理（tech-design 3.3 / ADR-13），
 * 这样服务端与离线练习场跑的是同一套结果。
 * 采用「轴分离 + 最小重叠方向推出」，贴墙时能沿墙滑动而不是被完全卡死。
 */
export function updatePlayerMovement(
  state: BattleState,
  player: PlayerState,
  input: PlayerInput | undefined,
  dtSeconds: number,
): void {
  let moveX = input?.moveX ?? 0;
  let moveY = input?.moveY ?? 0;

  const length = Math.hypot(moveX, moveY);
  if (length > 0) {
    moveX /= length;
    moveY /= length;
  }

  // 白值 × 增益倍率：这样"移速强化"到期后自动回到白值，不需要去改 stats
  const speed = player.stats.moveSpeed * player.modifiers.moveSpeedMultiplier;
  player.vx = moveX * speed;
  player.vy = moveY * speed;

  moveAlongAxis(state, player, player.vx * dtSeconds, 0);
  moveAlongAxis(state, player, 0, player.vy * dtSeconds);

  if (moveX !== 0) {
    player.facingX = moveX > 0 ? 1 : -1;
  }
}

/** 只在一个轴上位移，然后在该轴上做墙体分离 */
function moveAlongAxis(state: BattleState, player: PlayerState, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) {
    return;
  }

  player.x += dx;
  player.y += dy;

  const radius = player.stats.bodyRadius;

  for (const wall of state.walls) {
    const isOverlappingX = player.x + radius > wall.x && player.x - radius < wall.x + wall.width;
    const isOverlappingY = player.y + radius > wall.y && player.y - radius < wall.y + wall.height;
    if (!isOverlappingX || !isOverlappingY) {
      continue;
    }

    if (dx !== 0) {
      const overlapX =
        Math.min(player.x + radius, wall.x + wall.width) - Math.max(player.x - radius, wall.x);
      player.x += player.x < wall.x + wall.width / 2 ? -overlapX : overlapX;
    } else {
      const overlapY =
        Math.min(player.y + radius, wall.y + wall.height) - Math.max(player.y - radius, wall.y);
      player.y += player.y < wall.y + wall.height / 2 ? -overlapY : overlapY;
    }
  }

  // 兜底：正常情况下边界墙已经拦住，这里只防数值异常把角色推出地图
  player.x = Math.min(Math.max(player.x, radius), state.mapWidth - radius);
  player.y = Math.min(Math.max(player.y, radius), state.mapHeight - radius);
}
