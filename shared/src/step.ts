import type { BattleConfig } from './config/types';
import type { BattleState, PlayerInput, PlayerState } from './types';
import { updatePlayerMovement } from './sim/movement';
import { applyDamage, updateShieldRegen } from './sim/damage';
import { isPointInRects, isSegmentHittingCircle } from './sim/projectile';
import {
  collectPickups,
  updateEffectTimers,
  updateItemSpawns,
  updatePickupLifetimes,
} from './sim/items';
import { respawnFighter } from './world';

/**
 * 推进一帧世界（固定步长）。
 *
 * 这是本项目唯一的"战斗逻辑"入口：
 * 服务端以 30Hz 调用它作为权威，离线练习场以 30Hz 在本地调用它，
 * 联机客户端**不调用**它（只预测自身移动并渲染快照，tech-design 8.3）。
 *
 * 函数本身不碰任何框架 API，因此可被 Node 与浏览器同时执行，也可单测。
 * 顺序固定为：增益倒计时 → 移动 → 瞄准 → 回盾 → 开火 → 子弹推进与命中 → 道具刷新/拾取 → 清理。
 */
export function step(
  state: BattleState,
  inputs: ReadonlyMap<number, PlayerInput>,
  config: BattleConfig,
): void {
  const dtMs = config.stepMs;
  const dtSeconds = dtMs / 1000;

  // 对局结束后世界冻结：不再推进、不再产生事件（渲染层会在收到 matchEnd 后切结算）
  if (state.isFinished) {
    state.events.length = 0;
    return;
  }

  state.tick += 1;
  state.timeMs += dtMs;
  state.events.length = 0;

  // 限时对局：到点立即结束。
  // 练习场自由模式把 matchEndsAtMs 设为 Infinity，这段就永远不会触发。
  if (state.matchEndsAtMs !== Infinity && state.timeMs >= state.matchEndsAtMs) {
    state.isFinished = true;
    state.events.push({ type: 'matchEnd' });
    return;
  }

  for (const player of state.players) {
    if (!player.alive) {
      if (state.timeMs >= player.respawnAtMs) {
        respawnFighter(state, player);
      }
      continue;
    }

    // 增益倒计时（到期后 modifiers 会自动恢复为 1）
    updateEffectTimers(player, dtMs);

    player.fireCooldownMs = Math.max(0, player.fireCooldownMs - dtMs);

    if (player.isDummy) {
      player.vx = 0;
      player.vy = 0;
      continue;
    }

    const input = inputs.get(player.id);
    updatePlayerMovement(state, player, input, dtSeconds);
    updateAim(player, input);
    updateShieldRegen(state, player, dtSeconds);
    tryFire(state, player, input);
  }

  updateBullets(state, dtMs, dtSeconds);

  // 道具：先处理过期，再刷新新的，最后判定拾取
  updatePickupLifetimes(state, dtMs);
  updateItemSpawns(state, config);
  collectPickups(state, config);

  if (state.bullets.some((bullet) => bullet.lifeMs <= 0)) {
    state.bullets = state.bullets.filter((bullet) => bullet.lifeMs > 0);
  }
}

/** 朝向永远指向光标位置（需求 2.2：光标绝对定位；art-spec 2.1.1：贴图朝向与瞄准解绑） */
function updateAim(player: PlayerState, input: PlayerInput | undefined): void {
  if (!input) {
    return;
  }
  player.aimAngle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
}

/** 冷却结束且按住开火时发射一发子弹 */
function tryFire(state: BattleState, player: PlayerState, input: PlayerInput | undefined): void {
  if (!input?.isFiring || player.fireCooldownMs > 0) {
    return;
  }

  const { bulletSpeed, bulletRadius, damage, bulletLife, bodyRadius, fireInterval } = player.stats;
  // 白值 × 增益：射速强化缩短间隔，攻击强化提高单发伤害
  const effectiveFireInterval = fireInterval * player.modifiers.fireIntervalMultiplier;
  const effectiveDamage = damage * player.modifiers.damageMultiplier;
  const muzzleOffset = bodyRadius + bulletRadius + 2;
  const directionX = Math.cos(player.aimAngle);
  const directionY = Math.sin(player.aimAngle);
  const originX = player.x + directionX * muzzleOffset;
  const originY = player.y + directionY * muzzleOffset;

  state.bullets.push({
    id: state.nextBulletId,
    ownerId: player.id,
    x: originX,
    y: originY,
    prevX: originX,
    prevY: originY,
    vx: directionX * bulletSpeed,
    vy: directionY * bulletSpeed,
    radius: bulletRadius,
    damage: effectiveDamage,
    lifeMs: bulletLife,
  });
  state.nextBulletId += 1;

  player.fireCooldownMs = effectiveFireInterval;
  state.events.push({
    type: 'shoot',
    playerId: player.id,
    x: originX,
    y: originY,
    angle: player.aimAngle,
  });
}

/** 子弹推进、撞墙判定、扫掠命中判定 */
function updateBullets(state: BattleState, dtMs: number, dtSeconds: number): void {
  for (const bullet of state.bullets) {
    bullet.prevX = bullet.x;
    bullet.prevY = bullet.y;
    bullet.x += bullet.vx * dtSeconds;
    bullet.y += bullet.vy * dtSeconds;
    bullet.lifeMs -= dtMs;

    if (bullet.lifeMs <= 0) {
      continue;
    }

    // 墙体优先于角色：躲在掩体后面就是打不到
    if (isPointInRects(state.walls, bullet.x, bullet.y)) {
      bullet.lifeMs = 0;
      continue;
    }

    for (const target of state.players) {
      if (!target.alive || target.id === bullet.ownerId) {
        continue;
      }
      const hitRadius = target.stats.bodyRadius + bullet.radius;
      if (
        !isSegmentHittingCircle(
          bullet.prevX,
          bullet.prevY,
          bullet.x,
          bullet.y,
          target.x,
          target.y,
          hitRadius,
        )
      ) {
        continue;
      }

      // 护盾硬化倍率来自目标自己的 modifiers；攻击者 id 用于统计伤害与击杀
      const result = applyDamage(
        state,
        target,
        bullet.damage,
        target.modifiers.shieldAbsorbMultiplier,
        bullet.ownerId,
      );
      state.events.push({
        type: 'hit',
        targetId: target.id,
        hpDamage: result.hpDamage,
        shieldDamage: result.shieldDamage,
        x: bullet.x,
        y: bullet.y,
      });
      bullet.lifeMs = 0;
      break;
    }
  }
}
