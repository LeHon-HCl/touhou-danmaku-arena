import type { BattleConfig, DummyConfig } from './types';
import { characters } from './characters';

/**
 * 练习场假人：站桩、不开火，用于验证命中、护盾与击杀反馈。
 * 护盾回复设为 0，避免"打半天打不死"干扰手感调试。
 */
const dummy: DummyConfig = {
  /** 最大生命值。建议范围 60–150 */
  maxHp: 100,
  /** 最大护盾值。建议 0–40；0 表示直接掉血，便于观察伤害数字 */
  maxShield: 30,
  /** 脱战开始回盾时间（毫秒）。假人不回盾，此处给一个不会触发的值 */
  shieldRegenDelay: 999999,
  /** 每秒回盾量。建议 0；假人不回盾 */
  shieldRegenPerSecond: 0,

  /** 移动速度（像素/秒）。假人为 0 */
  moveSpeed: 0,
  /** 射击间隔（毫秒）。假人不开火，填 0 即可（不会触发） */
  fireInterval: 0,
  /** 单发伤害。假人不开火，填 0 */
  damage: 0,
  /** 弹速（像素/秒）。假人不开火，填 0 */
  bulletSpeed: 0,
  /** 子弹半径。假人不开火，填 0 */
  bulletRadius: 0,
  /** 子弹存活时长（毫秒）。假人不开火，填 0 */
  bulletLife: 0,
  /** 碰撞半径。建议 12–18；越大越好打中 */
  bodyRadius: 14,

  /** 被击倒后重生延迟（毫秒）。建议 1000–3000 */
  respawnDelay: 2000,
};

/** 一局战斗的全部数值（练习场与对局共用这一份） */
export const battleConfig: BattleConfig = {
  /** 逻辑帧间隔（毫秒）。30Hz = 33.33，与服务端一致（tech-design 4.4） */
  stepMs: 1000 / 30,
  characters,
  dummy,

  items: {
    /** 固定刷新点间隔（毫秒）。建议 4000–8000 */
    fixedSpawnInterval: 5000,
    /** 随机点间隔（毫秒）。建议 6000–12000 */
    randomSpawnInterval: 9000,
    /** 同屏上限。建议 4–8；太多会让碰撞反馈变乱 */
    maxOnGround: 6,
    /** 落地存活时间（毫秒）。建议 15000–30000 */
    groundLife: 20000,
    /** 拾取半径（像素）。建议 18–26 */
    pickupRadius: 20,
  },
};
