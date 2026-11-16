import type { CharacterConfig } from './types';

/**
 * 首版两个角色的数值（MVP 只做灵梦与魔理沙，需求 3.6）。
 *
 * 当前数值只用于跑通手感，全部为暂定值（需求 0.3 第 4 条）。
 * 校核依据：需求 2.3.2 要求「HP 打空 5–10 秒 + 护盾打空 2–4 秒 = 实际击杀 8–13 秒」，
 * 因此单发伤害 ÷ 射击间隔（即 DPS）≈ 14 点/秒，配合 100 + 40 的有效血量落在该区间。
 */
export const characters: Record<'reimu' | 'marisa', CharacterConfig> = {
  reimu: {
    id: 'reimu',
    displayName: '博丽灵梦',

    /** 最大生命值。建议范围 80–120；越高 TTK 越长 */
    maxHp: 100,
    /** 最大护盾值。建议范围 30–50；与 HP 相加决定实际击杀时长 */
    maxShield: 40,
    /** 脱战多久开始回盾（毫秒）。建议 4000–6000；需求 2.3.4 暂定 5000 */
    shieldRegenDelay: 5000,
    /** 每秒回盾量。建议 1.0–2.0；硬约束：5 秒回复量不得超过护盾上限的 20% */
    shieldRegenPerSecond: 1.5,

    /** 移动速度（像素/秒）。建议 150–200 */
    moveSpeed: 170,
    /** 射击间隔（毫秒）。建议 400–700；越小越接近连射 */
    fireInterval: 560,
    /** 单发伤害。建议 6–12；与射击间隔共同决定 DPS */
    damage: 8,
    /** 弹速（像素/秒）。建议 500–800 */
    bulletSpeed: 620,
    /** 子弹半径。建议 4–7 */
    bulletRadius: 5,
    /** 子弹存活时长（毫秒）。建议 800–1600 */
    bulletLife: 1200,
    /** 角色碰撞半径。建议 10–14 */
    bodyRadius: 12,
    /** 阵亡后重生延迟（毫秒）。建议 3000–6000；需求 4.2 暂定 5000 */
    respawnDelay: 5000,
  },

  marisa: {
    id: 'marisa',
    displayName: '雾雨魔理沙',

    /** 最大生命值。建议范围 80–120 */
    maxHp: 90,
    /** 最大护盾值。建议范围 30–50 */
    maxShield: 35,
    /** 脱战开始回盾时间（毫秒）。建议 4000–6000 */
    shieldRegenDelay: 5000,
    /** 每秒回盾量。建议 1.0–2.0 */
    shieldRegenPerSecond: 1.4,

    /** 移动速度（像素/秒）。建议 150–200；散射型略快 */
    moveSpeed: 180,
    /** 射击间隔（毫秒）。建议 350–600；单发弱但更密 */
    fireInterval: 450,
    /** 单发伤害。建议 5–10 */
    damage: 6.5,
    /** 弹速（像素/秒）。建议 550–800 */
    bulletSpeed: 660,
    /** 子弹半径。建议 4–6 */
    bulletRadius: 4.5,
    /** 子弹存活时长（毫秒）。建议 800–1400 */
    bulletLife: 1100,
    /** 角色碰撞半径。建议 10–14 */
    bodyRadius: 12,
    /** 阵亡后重生延迟（毫秒）。建议 3000–6000 */
    respawnDelay: 5000,
  },
};
