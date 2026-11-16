import { ITEMS, pickWeightedItemId } from '../config/items';
import { ITEM_SPAWN_TILES, MAP_TILE_SIZE } from '../config/map-shrine';
import type { BattleConfig } from '../config/types';
import type { BattleState, ItemId, PickupState, PlayerModifiers, PlayerState } from '../types';
import { isPointInRects } from './projectile';

/**
 * 道具系统：效果结算、刷新与拾取。
 *
 * 设计要点（对应需求 6.3 / 6.4）：
 * - 效果是"原子"的，道具只是原子效果的组合，加新道具不改战斗主逻辑；
 * - 同类增益不叠加数值，再次拾取只刷新剩余时间；
 * - 增益不修改 stats（白值），只产出一份倍率 modifiers，攻击/移动时临时乘上去。
 */

/** 生成一份"无增益"倍率。每次新建，避免多个角色共用同一个对象被一起改掉 */
export function createDefaultModifiers(): PlayerModifiers {
  return {
    damageMultiplier: 1,
    fireIntervalMultiplier: 1,
    moveSpeedMultiplier: 1,
    shieldAbsorbMultiplier: 1,
  };
}

/**
 * 根据当前生效增益重算倍率。
 * 增益变化（拾取、到期）时调用即可，不必每帧调用。
 */
export function recomputeModifiers(player: PlayerState): void {
  const modifiers = createDefaultModifiers();

  for (const active of player.activeEffects) {
    const item = ITEMS[active.itemId];
    for (const effect of item.effects) {
      switch (effect.type) {
        case 'damageMultiplier':
          modifiers.damageMultiplier *= effect.multiplier;
          break;
        case 'fireIntervalMultiplier':
          modifiers.fireIntervalMultiplier *= effect.multiplier;
          break;
        case 'moveSpeedMultiplier':
          modifiers.moveSpeedMultiplier *= effect.multiplier;
          break;
        case 'shieldAbsorbMultiplier':
          modifiers.shieldAbsorbMultiplier *= effect.multiplier;
          break;
        case 'healHp':
          // 瞬时效果，不产生倍率
          break;
      }
    }
  }

  player.modifiers = modifiers;
}

/** 增益倒计时；有增益到期时重算倍率 */
export function updateEffectTimers(player: PlayerState, dtMs: number): void {
  if (player.activeEffects.length === 0) {
    return;
  }

  for (const effect of player.activeEffects) {
    effect.remainingMs -= dtMs;
  }

  const expiredCount = player.activeEffects.filter((effect) => effect.remainingMs <= 0).length;
  if (expiredCount === 0) {
    return;
  }

  player.activeEffects = player.activeEffects.filter((effect) => effect.remainingMs > 0);
  recomputeModifiers(player);
}

/**
 * 把道具效果作用到一个角色身上。
 * 瞬时效果（回血）立即生效；增益效果按"同类只刷新时间"处理。
 */
export function applyItemToPlayer(player: PlayerState, itemId: ItemId): void {
  const item = ITEMS[itemId];

  for (const effect of item.effects) {
    if (effect.type === 'healHp') {
      player.hp = Math.min(player.stats.maxHp, player.hp + effect.amount);
      continue;
    }

    const existing = player.activeEffects.find((active) => active.itemId === item.id);
    if (existing) {
      // 需求 6.3 第 2 条：不叠加数值，只刷新持续时间
      existing.remainingMs = item.duration;
    } else {
      player.activeEffects.push({ itemId: item.id, remainingMs: item.duration });
    }
  }

  recomputeModifiers(player);
}

/** 在指定坐标放一个道具到地上 */
export function spawnPickup(
  state: BattleState,
  config: BattleConfig,
  x: number,
  y: number,
  itemId: ItemId = pickWeightedItemId(),
): PickupState {
  const pickup: PickupState = {
    id: state.nextPickupId,
    itemId,
    x,
    y,
    lifeMs: config.items.groundLife,
  };
  state.nextPickupId += 1;
  state.pickups.push(pickup);
  return pickup;
}

/**
 * 按两条并行途径刷新道具（需求 6.1）：
 * 1. 固定刷新点：地图上预设位置定时刷新，形成争夺焦点；
 * 2. 随机位置：在可行走区域随机刷新，增加局势变化。
 */
export function updateItemSpawns(
  state: BattleState,
  config: BattleConfig,
  random: () => number = Math.random,
): void {
  const spawnConfig = config.items;
  if (state.pickups.length >= spawnConfig.maxOnGround) {
    return;
  }

  // 1. 固定点
  if (state.timeMs >= state.nextFixedItemSpawnAtMs) {
    const tile = ITEM_SPAWN_TILES[Math.floor(random() * ITEM_SPAWN_TILES.length)];
    if (tile) {
      spawnPickup(
        state,
        config,
        tile.column * MAP_TILE_SIZE + MAP_TILE_SIZE / 2,
        tile.row * MAP_TILE_SIZE + MAP_TILE_SIZE / 2,
        pickWeightedItemId(random),
      );
    }
    state.nextFixedItemSpawnAtMs = state.timeMs + spawnConfig.fixedSpawnInterval;
  }

  // 2. 随机点
  if (
    state.pickups.length < spawnConfig.maxOnGround &&
    state.timeMs >= state.nextRandomItemSpawnAtMs
  ) {
    const point = findRandomOpenPoint(state, random);
    if (point) {
      spawnPickup(state, config, point.x, point.y, pickWeightedItemId(random));
    }
    state.nextRandomItemSpawnAtMs = state.timeMs + spawnConfig.randomSpawnInterval;
  }
}

/** 在地上找一块没被墙占住的地方；找不到就返回 null（这一轮不刷） */
function findRandomOpenPoint(
  state: BattleState,
  random: () => number,
): { x: number; y: number } | null {
  const margin = 24;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const x = margin + random() * (state.mapWidth - margin * 2);
    const y = margin + random() * (state.mapHeight - margin * 2);

    // 检查点自身与四周 14 像素：避免道具半个身子卡在墙里
    const isBlocked =
      isPointInRects(state.walls, x, y) ||
      isPointInRects(state.walls, x - 14, y) ||
      isPointInRects(state.walls, x + 14, y) ||
      isPointInRects(state.walls, x, y - 14) ||
      isPointInRects(state.walls, x, y + 14);
    if (isBlocked) {
      continue;
    }

    return { x, y };
  }
  return null;
}

/** 道具倒计时，超时消失 */
export function updatePickupLifetimes(state: BattleState, dtMs: number): void {
  if (state.pickups.length === 0) {
    return;
  }
  for (const pickup of state.pickups) {
    pickup.lifeMs -= dtMs;
  }
  if (state.pickups.some((pickup) => pickup.lifeMs <= 0)) {
    state.pickups = state.pickups.filter((pickup) => pickup.lifeMs > 0);
  }
}

/**
 * 判定拾取：走到道具上就自动拾取（需求 6.2 定为自动拾取，不按键）。
 * 假人不拾取，避免练习场里的靶子把道具吃光。
 */
export function collectPickups(state: BattleState, config: BattleConfig): void {
  for (let index = state.pickups.length - 1; index >= 0; index -= 1) {
    const pickup = state.pickups[index];

    for (const player of state.players) {
      if (!player.alive || player.isDummy) {
        continue;
      }
      const distance = Math.hypot(player.x - pickup.x, player.y - pickup.y);
      const pickRadius = player.stats.bodyRadius + config.items.pickupRadius;
      if (distance > pickRadius) {
        continue;
      }

      applyItemToPlayer(player, pickup.itemId);
      player.score.itemsPicked += 1;
      state.pickups.splice(index, 1);
      state.events.push({
        type: 'pickup',
        playerId: player.id,
        itemId: pickup.itemId,
        x: pickup.x,
        y: pickup.y,
      });
      break;
    }
  }
}
