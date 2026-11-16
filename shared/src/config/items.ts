import type { ItemId } from '../types';

/**
 * 道具配置表（需求 6.4：必须数据驱动）。
 *
 * 【新增一个道具要改哪里】
 * 1. 在 types.ts 的 ItemId 里加一个 id（联合类型会让漏写处理逻辑的地方直接报红）；
 * 2. 在本文件里加一条配置；
 * 3. 如果引入了全新的效果类型，在 sim/items.ts 的效果分支里加一个 case。
 * 战斗主逻辑（step.ts）不需要改动 —— 这是需求 6.4 明确要求的"可扩展性"。
 *
 * 【原子效果】
 * 每个道具由若干"原子效果"组成，而不是给每个道具写死一段逻辑。
 * 这样"补给箱 = 同时给多个小增益"这类道具将来只需要改配置。
 */

/** 立即回复生命 */
export interface ItemEffectHeal {
  type: 'healHp';
  /** 回复量（点）。建议 20–50 */
  amount: number;
}

/** 提升伤害 */
export interface ItemEffectDamage {
  type: 'damageMultiplier';
  /** 倍率，1.3 表示 +30%。建议 1.1–1.4（输出向增益最敏感，别调太高） */
  multiplier: number;
}

/** 缩短射击间隔（射速变快） */
export interface ItemEffectFireRate {
  type: 'fireIntervalMultiplier';
  /** 倍率，0.75 表示间隔缩到 75%（更快）。建议 0.6–0.9 */
  multiplier: number;
}

/** 提升移动速度 */
export interface ItemEffectMoveSpeed {
  type: 'moveSpeedMultiplier';
  /** 倍率。建议 1.15–1.35 */
  multiplier: number;
}

/** 护盾硬化：1 点护盾可以吸收更多伤害 */
export interface ItemEffectShieldAbsorb {
  type: 'shieldAbsorbMultiplier';
  /** 倍率，2 表示 1 点盾挡 2 点伤害。建议固定 2 */
  multiplier: number;
}

/** 原子效果联合类型 */
export type ItemEffect =
  | ItemEffectHeal
  | ItemEffectDamage
  | ItemEffectFireRate
  | ItemEffectMoveSpeed
  | ItemEffectShieldAbsorb;

/** 一个道具的完整配置 */
export interface ItemConfig {
  id: ItemId;
  /** 显示名（中文） */
  displayName: string;
  /** HUD 上用的极短标签，2 个字以内最好认 */
  shortLabel: string;
  /** 增益持续时长（毫秒）；瞬时效果填 0 */
  duration: number;
  /** 由哪些原子效果组成 */
  effects: ItemEffect[];
  /** 刷新权重，越大越常见。建议 1–10 */
  spawnWeight: number;
  /** 是否稀有（HUD 上换个颜色，便于一眼看出这是好东西） */
  isRare: boolean;
  /** 世界里的显示颜色 */
  color: number;
}

/** 全部已实现的道具 */
export const ITEMS: Record<ItemId, ItemConfig> = {
  heal: {
    id: 'heal',
    displayName: '治疗包',
    shortLabel: '治疗',
    /** 瞬时效果，不占增益栏 */
    duration: 0,
    effects: [{ type: 'healHp', amount: 30 }],
    spawnWeight: 4,
    isRare: false,
    color: 0x54d98c,
  },

  armorHarden: {
    id: 'armorHarden',
    displayName: '防御强化',
    shortLabel: '硬化',
    duration: 9000,
    effects: [{ type: 'shieldAbsorbMultiplier', multiplier: 2 }],
    spawnWeight: 2,
    isRare: true,
    color: 0x4dc3ff,
  },

  attackBoost: {
    id: 'attackBoost',
    displayName: '攻击强化',
    shortLabel: '攻击',
    duration: 9000,
    effects: [{ type: 'damageMultiplier', multiplier: 1.35 }],
    spawnWeight: 3,
    isRare: false,
    color: 0xff8a4d,
  },

  fireRateBoost: {
    id: 'fireRateBoost',
    displayName: '射速强化',
    shortLabel: '射速',
    duration: 9000,
    effects: [{ type: 'fireIntervalMultiplier', multiplier: 0.72 }],
    spawnWeight: 3,
    isRare: false,
    color: 0xffd166,
  },

  speedBoost: {
    id: 'speedBoost',
    displayName: '移速强化',
    shortLabel: '移速',
    duration: 9000,
    effects: [{ type: 'moveSpeedMultiplier', multiplier: 1.25 }],
    spawnWeight: 3,
    isRare: false,
    color: 0xb98cff,
  },

  // 需求 6.5 里剩下的三个暂时不放进配置：
  // 护盾发生器（需要"临时抬高盾上限 + 强制回盾"）、隐身（需要小地图标记与描边移除）、
  // 符卡加速（符卡系统还没做）。缺系统就先不加，避免配置里出现"写了但不生效"的假道具。
};

/** 便于遍历的列表 */
export const ITEM_LIST: ItemConfig[] = Object.values(ITEMS);

/**
 * 按权重随机抽一个道具 id。
 * 传 random 参数是为了单测里可以固定随机源，保证结果可复现。
 */
export function pickWeightedItemId(random: () => number = Math.random): ItemId {
  const totalWeight = ITEM_LIST.reduce((sum, item) => sum + item.spawnWeight, 0);
  let roll = random() * totalWeight;
  for (const item of ITEM_LIST) {
    roll -= item.spawnWeight;
    if (roll <= 0) {
      return item.id;
    }
  }
  return ITEM_LIST[ITEM_LIST.length - 1].id;
}
