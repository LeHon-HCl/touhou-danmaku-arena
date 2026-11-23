import { Character } from './character';

/**
 * 雾雨魔理沙（第二个角色，需求 3.6）。
 *
 * 定位：高频低伤。数值全部为暂定值（需求 0.3 第 4 条）。
 */
export const marisa = new Character({
  id: 'marisa',
  displayName: '雾雨魔理沙',

  stats: {
    /** 最大生命值。建议范围 80–120 */
    maxHp: 90,
    /** 最大护盾值。建议范围 30–50 */
    maxShield: 35,
    /** 脱战开始回盾时间（毫秒）。建议 4000–6000 */
    shieldRegenDelay: 5000,
    /** 每秒回盾量。建议 1.0–2.0 */
    shieldRegenPerSecond: 1.4,

    /** 移动速度（像素/秒）。建议 150–200；高频型略快 */
    moveSpeed: 180,
    /** 射击间隔（毫秒）。建议 350–600；单发弱但更密 */
    fireInterval: 100,
    /** 单发伤害。建议 5–10 */
    damage: 2,
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

  assetFile: 'images/char_marisa.png',
  textureKey: 'char_marisa',

  /** 占位图：黑白女巫服 + 黑色魔女帽 */
  placeholder: {
    hairColor: 0xe8cf6a,
    robeColor: 0x24242c,
    skirtColor: 0xf2f2f2,
    accentColor: 0xf2f2f2,
    accessory: 'hat',
  },
});
