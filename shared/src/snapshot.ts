import type { BattleConfig } from './config/types';
import { ITEMS } from './config/items';
import type { WorldSnapshot } from './protocol';
import type { BattleState, PlayerState } from './types';
import { createFighter } from './world';

/**
 * 世界状态 ↔ 网络快照的互转（纯函数，前后端共用）。
 *
 * - 服务端：`createSnapshot(state)` 每帧生成一个快照广播出去；
 * - 客户端：`applySnapshotToState(state, snapshot)` 把快照写进本地的"影子世界"，
 *   渲染层照旧读这份影子世界，不需要知道"数据是从网络来的"。
 *
 * 两边都用同一份实现，是为了避免"服务端序列化用 A 规则、客户端反序列化用 B 规则"
 * 这种最难查的错位（正是技术方案风险 R1 说的那类问题）。
 */

/** 把一份完整世界状态压成发得出去的快照 */
export function createSnapshot(state: BattleState): WorldSnapshot {
  return {
    tick: state.tick,
    timeMs: state.timeMs,
    players: state.players.map((player) => ({
      id: player.id,
      characterId: player.characterId,
      isDummy: player.isDummy,
      x: player.x,
      y: player.y,
      hp: player.hp,
      shield: player.shield,
      maxHp: player.stats.maxHp,
      maxShield: player.stats.maxShield,
      alive: player.alive,
      facingX: player.facingX,
      aimAngle: player.aimAngle,
      kills: player.score.kills,
      deaths: player.score.deaths,
      effects: player.activeEffects.map((effect) => ({
        itemId: effect.itemId,
        remainingMs: effect.remainingMs,
      })),
    })),
    bullets: state.bullets.map((bullet) => ({ id: bullet.id, x: bullet.x, y: bullet.y })),
    pickups: state.pickups.map((pickup) => ({
      id: pickup.id,
      itemId: pickup.itemId,
      x: pickup.x,
      y: pickup.y,
    })),
    isFinished: state.isFinished,
  };
}

/**
 * 把快照写进客户端的影子世界。
 *
 * 说明：这里**只更新渲染需要的字段**，不重算移动/命中（那些由服务端算）。
 * 缺的角色会按 id 补一个（玩家中途加入时会出现这种情况）。
 */
export function applySnapshotToState(
  state: BattleState,
  snapshot: WorldSnapshot,
  config: BattleConfig,
): void {
  state.tick = snapshot.tick;
  state.timeMs = snapshot.timeMs;
  state.isFinished = snapshot.isFinished;

  state.players = snapshot.players.map((snapshotPlayer) => {
    const existing = state.players.find((player) => player.id === snapshotPlayer.id);
    if (existing) {
      existing.characterId = snapshotPlayer.characterId;
      existing.isDummy = snapshotPlayer.isDummy;
      existing.x = snapshotPlayer.x;
      existing.y = snapshotPlayer.y;
      existing.hp = snapshotPlayer.hp;
      existing.shield = snapshotPlayer.shield;
      existing.alive = snapshotPlayer.alive;
      existing.facingX = snapshotPlayer.facingX;
      existing.aimAngle = snapshotPlayer.aimAngle;
      existing.score.kills = snapshotPlayer.kills;
      existing.score.deaths = snapshotPlayer.deaths;
      existing.activeEffects = snapshotPlayer.effects.map((effect) => ({
        itemId: effect.itemId,
        remainingMs: effect.remainingMs,
      }));
      existing.modifiers = recomputeModifiersFromEffects(snapshotPlayer.effects);
      return existing;
    }

    // 新出现的单位：用配置里的数值造一个，再用快照覆盖位置与血量
    const stats = snapshotPlayer.isDummy
      ? config.dummy
      : config.characters[snapshotPlayer.characterId === 'marisa' ? 'marisa' : 'reimu'];
    const created = createFighter(
      snapshotPlayer.id,
      snapshotPlayer.characterId,
      snapshotPlayer.isDummy,
      stats,
      snapshotPlayer.x,
      snapshotPlayer.y,
    );
    created.hp = snapshotPlayer.hp;
    created.shield = snapshotPlayer.shield;
    created.alive = snapshotPlayer.alive;
    created.facingX = snapshotPlayer.facingX;
    created.aimAngle = snapshotPlayer.aimAngle;
    created.score.kills = snapshotPlayer.kills;
    created.score.deaths = snapshotPlayer.deaths;
    created.activeEffects = snapshotPlayer.effects.map((effect) => ({ ...effect }));
    created.modifiers = recomputeModifiersFromEffects(snapshotPlayer.effects);
    return created;
  });

  state.bullets = snapshot.bullets.map((bullet) => ({
    id: bullet.id,
    ownerId: 0,
    x: bullet.x,
    y: bullet.y,
    prevX: bullet.x,
    prevY: bullet.y,
    vx: 0,
    vy: 0,
    radius: 0,
    damage: 0,
    lifeMs: 1,
  }));

  state.pickups = snapshot.pickups.map((pickup) => ({
    id: pickup.id,
    itemId: pickup.itemId,
    x: pickup.x,
    y: pickup.y,
    lifeMs: 1,
  }));
}

/** 客户端本地重算增益倍率（与 sim/items.ts 的算法一致，但不需要完整 PlayerState） */
function recomputeModifiersFromEffects(
  effects: Array<{ itemId: keyof typeof ITEMS; remainingMs: number }>,
): PlayerState['modifiers'] {
  const modifiers = {
    damageMultiplier: 1,
    fireIntervalMultiplier: 1,
    moveSpeedMultiplier: 1,
    shieldAbsorbMultiplier: 1,
  };

  for (const effect of effects) {
    for (const itemEffect of ITEMS[effect.itemId].effects) {
      if (itemEffect.type === 'damageMultiplier') {
        modifiers.damageMultiplier *= itemEffect.multiplier;
      } else if (itemEffect.type === 'fireIntervalMultiplier') {
        modifiers.fireIntervalMultiplier *= itemEffect.multiplier;
      } else if (itemEffect.type === 'moveSpeedMultiplier') {
        modifiers.moveSpeedMultiplier *= itemEffect.multiplier;
      } else if (itemEffect.type === 'shieldAbsorbMultiplier') {
        modifiers.shieldAbsorbMultiplier *= itemEffect.multiplier;
      }
    }
  }

  return modifiers;
}
