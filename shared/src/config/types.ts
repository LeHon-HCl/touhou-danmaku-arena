import type { CharacterId, FighterStats } from '../types';

/**
 * 配置表类型定义。
 *
 * 规则见 dev-conventions 第 6 章：
 * 字段名全小写驼峰；时间一律毫秒、距离一律像素、速度一律像素/秒、角度一律度；
 * 每个字段必须有中文说明与建议范围。
 */

/** 可选角色的数值配置 */
export interface CharacterConfig extends FighterStats {
  id: CharacterId;
  /** 角色显示名（中文），仅用于界面，不参与战斗判定 */
  displayName: string;
}

/**
 * 练习场假人的数值配置。
 * 重生延迟等通用字段已在 FighterStats 中，这里不再重复声明。
 */
export type DummyConfig = FighterStats;

/** 道具刷新与拾取的规则参数（需求 6.1） */
export interface ItemSpawnConfig {
  /** 固定刷新点多久刷一次（毫秒）。建议 4000–8000 */
  fixedSpawnInterval: number;
  /** 随机位置多久刷一次（毫秒）。建议 6000–12000 */
  randomSpawnInterval: number;
  /** 同屏道具数量上限。建议 4–8 */
  maxOnGround: number;
  /** 道具落地后多久消失（毫秒）。建议 15000–30000 */
  groundLife: number;
  /** 拾取判定半径（像素，叠加在角色半径之外）。建议 18–26 */
  pickupRadius: number;
}

/** 一局战斗需要的全部数值 */
export interface BattleConfig {
  /** 逻辑帧间隔（毫秒）。30Hz = 33.33；改它等于改整个游戏的推进速度 */
  stepMs: number;
  /** 可选角色 */
  characters: Record<CharacterId, CharacterConfig>;
  /** 练习场假人 */
  dummy: DummyConfig;
  /** 道具刷新与拾取参数 */
  items: ItemSpawnConfig;
}
