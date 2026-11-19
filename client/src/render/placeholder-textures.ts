import Phaser from 'phaser';
import { CHARACTER_LIST, MAP_LIST } from '@shared';
import type { CharacterPlaceholder, GameMap } from '@shared';
import { ITEM_LIST } from '@shared/config/items';
import type { ItemId } from '@shared/types';

/**
 * 程序化占位贴图。
 *
 * 正式素材（`assets/images/`，见 assets/README.md）还没有时，
 * 用 Graphics 现场画一张能分辨「谁是谁、往哪走」的图，把玩法跑通。
 *
 * 关键点：**这里只补缺失的图**。
 * 素材目录里有同名 PNG 时贴图已经存在，函数会跳过；没有的才画占位图。
 * 所以用户可以只替换一部分素材，剩下的继续用占位图，不需要一次性全做。
 */

/** 与具体角色/地图无关的固定贴图 key */
export const TEX = {
  dummy: 'char_dummy',
  bullet: 'bullet_player',
  /** 粒子用的小白点，命中火花与枪口闪光都用它 */
  particle: 'fx_particle',
} as const;

/** 角色贴图边长（art-spec 2.3：48×48，四周至少留 2px 给描边） */
export const CHARACTER_SIZE = 48;

/** 子弹贴图边长，比碰撞半径略大，视觉上不会「看不见的判定框」 */
export const BULLET_SIZE = 12;

/** 道具贴图边长（art-spec 2.3：24×24，比角色小一圈，好辨认） */
export const ITEM_SIZE = 24;

/** 道具贴图 key：每个道具一张，颜色取自配置表 */
export function itemTextureKey(itemId: ItemId): string {
  return `item_${itemId}`;
}

/**
 * 补齐所有缺失的占位贴图。
 *
 * @returns 实际画出来的 key 列表（供启动日志说明哪些还是占位图）
 */
export function createMissingPlaceholders(scene: Phaser.Scene): string[] {
  const generated: string[] = [];

  const ensure = (key: string, draw: () => void): void => {
    if (scene.textures.exists(key)) {
      return;
    }
    draw();
    generated.push(key);
  };

  // 角色：遍历注册表，加角色不需要改这里
  for (const character of CHARACTER_LIST) {
    ensure(character.textureKey, () =>
      drawCharacter(scene, character.textureKey, character.placeholder),
    );
  }

  // 地图瓦片：每张地图用自己的 key 与配色
  for (const map of MAP_LIST) {
    ensure(map.floorTextureKey, () => drawFloor(scene, map));
    ensure(map.wallTextureKey, () => drawWall(scene, map));
  }

  // 练习场假人靶
  ensure(TEX.dummy, () => drawDummy(scene, TEX.dummy));
  ensure(TEX.bullet, () => drawBullet(scene, TEX.bullet));
  ensure(TEX.particle, () => drawParticle(scene, TEX.particle));

  // 道具：颜色直接取自配置表，加道具不需要画图
  for (const item of ITEM_LIST) {
    ensure(itemTextureKey(item.id), () => drawItem(scene, item.id));
  }

  return generated;
}

/** 正面视角的角色占位图（左右对称，翻转表示朝向） */
function drawCharacter(scene: Phaser.Scene, key: string, placeholder: CharacterPlaceholder): void {
  const graphics = scene.add.graphics();
  const { hairColor, robeColor, skirtColor, accentColor, accessory } = placeholder;

  // 头发
  graphics.fillStyle(hairColor, 1);
  graphics.fillRect(13, 8, 22, 12);
  // 脸
  graphics.fillStyle(0xf3cfae, 1);
  graphics.fillRect(17, 13, 14, 10);
  // 眼睛
  graphics.fillStyle(0x1b1b24, 1);
  graphics.fillRect(20, 17, 2, 3);
  graphics.fillRect(26, 17, 2, 3);
  // 上衣
  graphics.fillStyle(robeColor, 1);
  graphics.fillRect(14, 23, 20, 13);
  // 下装
  graphics.fillStyle(skirtColor, 1);
  graphics.fillRect(14, 36, 20, 9);
  // 双臂
  graphics.fillStyle(robeColor, 1);
  graphics.fillRect(10, 25, 4, 9);
  graphics.fillRect(34, 25, 4, 9);

  switch (accessory) {
    case 'bow':
      // 蝴蝶结 + 领口
      graphics.fillStyle(accentColor, 1);
      graphics.fillRect(21, 5, 6, 4);
      graphics.fillRect(18, 23, 12, 2);
      break;
    case 'hat':
      // 魔女帽 + 帽带
      graphics.fillStyle(0x15151c, 1);
      graphics.fillRect(9, 4, 30, 6);
      graphics.fillStyle(accentColor, 1);
      graphics.fillRect(9, 9, 30, 2);
      // 围裙
      graphics.fillStyle(accentColor, 1);
      graphics.fillRect(18, 26, 12, 16);
      break;
    case 'none':
    default:
      graphics.fillStyle(accentColor, 1);
      graphics.fillRect(18, 23, 12, 2);
      break;
  }

  graphics.generateTexture(key, CHARACTER_SIZE, CHARACTER_SIZE);
  graphics.destroy();
}

/** 练习靶：一眼能从深色地面与墙体里分出来，所以取中高明度 */
function drawDummy(scene: Phaser.Scene, key: string): void {
  const graphics = scene.add.graphics();
  graphics.fillStyle(0x8a8aa6, 1);
  graphics.fillRect(12, 6, 24, 38);
  graphics.fillStyle(0x6f6f8a, 1);
  graphics.fillRect(12, 6, 24, 4);
  graphics.fillStyle(0x2b2b3a, 1);
  graphics.fillRect(18, 16, 12, 12);
  graphics.fillStyle(0xd2352f, 1);
  graphics.fillRect(21, 19, 6, 6);
  graphics.fillStyle(0x2b2b3a, 1);
  graphics.fillRect(14, 34, 20, 3);
  graphics.generateTexture(key, CHARACTER_SIZE, CHARACTER_SIZE);
  graphics.destroy();
}

function drawBullet(scene: Phaser.Scene, key: string): void {
  const graphics = scene.add.graphics();
  const center = BULLET_SIZE / 2;
  // 外圈柔光，保证在任何底色上都够显眼（art-spec 3.2）
  graphics.fillStyle(0xffe9a8, 0.35);
  graphics.fillCircle(center, center, center);
  graphics.fillStyle(0xfff6cf, 1);
  graphics.fillCircle(center, center, center - 3);
  graphics.generateTexture(key, BULLET_SIZE, BULLET_SIZE);
  graphics.destroy();
}

function drawParticle(scene: Phaser.Scene, key: string): void {
  const graphics = scene.add.graphics();
  // 4×4 的小白点：粒子会被缩放与染色，形状本身越简单越好看
  graphics.fillStyle(0xffffff, 1);
  graphics.fillRect(0, 0, 4, 4);
  graphics.generateTexture(key, 4, 4);
  graphics.destroy();
}

/** 地面瓦片占位图：底色 + 少量浅色噪点（必须能无缝平铺） */
function drawFloor(scene: Phaser.Scene, map: GameMap): void {
  const { tileSize, floorPlaceholder } = map;
  const graphics = scene.add.graphics();
  graphics.fillStyle(floorPlaceholder.base, 1);
  graphics.fillRect(0, 0, tileSize, tileSize);
  graphics.fillStyle(floorPlaceholder.detail, 1);
  graphics.fillRect(3, 3, 2, 2);
  graphics.fillRect(tileSize - 6, tileSize / 2, 2, 2);
  graphics.generateTexture(map.floorTextureKey, tileSize, tileSize);
  graphics.destroy();
}

/** 墙体瓦片占位图：顶面高光 + 底部暗边，做出高度感 */
function drawWall(scene: Phaser.Scene, map: GameMap): void {
  const { tileSize, wallPlaceholder } = map;
  const graphics = scene.add.graphics();
  graphics.fillStyle(wallPlaceholder.base, 1);
  graphics.fillRect(0, 0, tileSize, tileSize);
  graphics.fillStyle(wallPlaceholder.detail, 1);
  graphics.fillRect(0, 0, tileSize, 4);
  graphics.fillStyle(0x22222e, 1);
  graphics.fillRect(0, tileSize - 3, tileSize, 3);
  graphics.generateTexture(map.wallTextureKey, tileSize, tileSize);
  graphics.destroy();
}

/** 道具占位图：一个菱形宝石，颜色直接取自配置表 */
function drawItem(scene: Phaser.Scene, itemId: ItemId): void {
  const item = ITEM_LIST.find((candidate) => candidate.id === itemId);
  if (!item) {
    return;
  }

  const graphics = scene.add.graphics();
  const center = ITEM_SIZE / 2;

  // 两个三角形拼成菱形（Graphics 没有现成的"画菱形"方法）
  graphics.fillStyle(item.color, 1);
  graphics.fillTriangle(center, 1, ITEM_SIZE - 1, center, 1, center);
  graphics.fillTriangle(1, center, ITEM_SIZE - 1, center, center, ITEM_SIZE - 1);

  // 中心高光，让小图标不显得死板
  graphics.fillStyle(0xffffff, 0.55);
  graphics.fillTriangle(center, 6, center + 4, center, center, center + 2);

  graphics.generateTexture(itemTextureKey(item.id), ITEM_SIZE, ITEM_SIZE);
  graphics.destroy();
}
