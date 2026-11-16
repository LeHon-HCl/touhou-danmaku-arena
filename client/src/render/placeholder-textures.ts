import Phaser from 'phaser';
import { MAP_TILE_SIZE } from '@shared/config';
import { ITEM_LIST } from '@shared/config/items';
import type { ItemId } from '@shared/types';

/**
 * 程序化占位贴图。
 *
 * 正式素材（AI 生成 + 人工修整，art-spec 2.5）尚未产出，
 * 这里先用 Graphics 画出能分辨「谁是谁、朝哪走」的占位图，把玩法跑通。
 * 将来替换真素材时，只需要改这个文件里的加载逻辑，渲染代码引用的是 TEX 常量。
 */

/** 贴图 key 常量，全项目只在这里定义一次 */
export const TEX = {
  reimu: 'char_reimu',
  marisa: 'char_marisa',
  dummy: 'char_dummy',
  bullet: 'bullet_player',
  wall: 'tile_wall',
  floor: 'tile_floor',
  /** 粒子用的小白点，命中火花与枪口闪光都用它 */
  particle: 'fx_particle',
} as const;

/** 角色贴图边长（art-spec 2.3 已定：48×48，四周至少留 2px 给描边） */
export const CHARACTER_SIZE = 48;

/** 子弹贴图边长，比碰撞半径略大，视觉上不会「看不见的判定框」 */
export const BULLET_SIZE = 12;

/** 道具贴图边长（像素）。art-spec 2.3 该项仍待定，先取 24（比角色小一圈，好辨认） */
export const ITEM_SIZE = 24;

/** 道具贴图 key：每个道具一张，颜色取自配置表 */
export function itemTextureKey(itemId: ItemId): string {
  return `item_${itemId}`;
}

/** 生成全部占位贴图 */
export function createPlaceholderTextures(scene: Phaser.Scene): void {
  createCharacterTexture(scene, TEX.reimu, 'reimu');
  createCharacterTexture(scene, TEX.marisa, 'marisa');
  createDummyTexture(scene, TEX.dummy);
  createBulletTexture(scene, TEX.bullet);
  createParticleTexture(scene, TEX.particle);
  createFloorTexture(scene, TEX.floor);
  createWallTexture(scene, TEX.wall);
  createItemTextures(scene);
}

type CharacterVariant = 'reimu' | 'marisa';

function createCharacterTexture(scene: Phaser.Scene, key: string, variant: CharacterVariant): void {
  const graphics = scene.add.graphics();

  // 正面视角、轮廓左右近似对称（art-spec 2.1.2 允许细节级不对称，禁止结构级不对称）
  const hairColor = variant === 'reimu' ? 0x5a3a2a : 0xe8cf6a;
  const robeColor = variant === 'reimu' ? 0xf2f2f2 : 0x24242c;
  const skirtColor = variant === 'reimu' ? 0xd2352f : 0xf2f2f2;

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

  if (variant === 'reimu') {
    // 灵梦：红色蝴蝶结 + 白色领口
    graphics.fillStyle(0xd2352f, 1);
    graphics.fillRect(21, 5, 6, 4);
    graphics.fillStyle(0xd2352f, 1);
    graphics.fillRect(18, 23, 12, 2);
  } else {
    // 魔理沙：黑色魔女帽 + 帽带
    graphics.fillStyle(0x15151c, 1);
    graphics.fillRect(9, 4, 30, 6);
    graphics.fillStyle(0xf2f2f2, 1);
    graphics.fillRect(9, 9, 30, 2);
    // 围裙
    graphics.fillStyle(0xf2f2f2, 1);
    graphics.fillRect(18, 26, 12, 16);
  }

  graphics.generateTexture(key, CHARACTER_SIZE, CHARACTER_SIZE);
  graphics.destroy();
}

function createDummyTexture(scene: Phaser.Scene, key: string): void {
  const graphics = scene.add.graphics();
  // 练习靶要一眼能从深色地面与墙体里分出来，所以取中高明度
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

function createBulletTexture(scene: Phaser.Scene, key: string): void {
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
/**
 * 生成道具贴图：一个菱形宝石，颜色直接取自配置表。
 * 这样以后新增道具只要改配置，不需要再画图。
 */
function createItemTextures(scene: Phaser.Scene): void {
  for (const item of ITEM_LIST) {
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
}

function createParticleTexture(scene: Phaser.Scene, key: string): void {
  const graphics = scene.add.graphics();
  // 4×4 的小白点：粒子会被缩放与染色，形状本身越简单越好看
  graphics.fillStyle(0xffffff, 1);
  graphics.fillRect(0, 0, 4, 4);
  graphics.generateTexture(key, 4, 4);
  graphics.destroy();
}

function createFloorTexture(scene: Phaser.Scene, key: string): void {
  const graphics = scene.add.graphics();
  graphics.fillStyle(0x12121a, 1);
  graphics.fillRect(0, 0, MAP_TILE_SIZE, MAP_TILE_SIZE);
  graphics.fillStyle(0x1b1b26, 1);
  graphics.fillRect(3, 3, 2, 2);
  graphics.fillRect(MAP_TILE_SIZE - 6, MAP_TILE_SIZE / 2, 2, 2);
  graphics.generateTexture(key, MAP_TILE_SIZE, MAP_TILE_SIZE);
  graphics.destroy();
}

function createWallTexture(scene: Phaser.Scene, key: string): void {
  const graphics = scene.add.graphics();
  graphics.fillStyle(0x2b2b3a, 1);
  graphics.fillRect(0, 0, MAP_TILE_SIZE, MAP_TILE_SIZE);
  graphics.fillStyle(0x3d3d52, 1);
  graphics.fillRect(0, 0, MAP_TILE_SIZE, 4);
  graphics.fillStyle(0x22222e, 1);
  graphics.fillRect(0, MAP_TILE_SIZE - 3, MAP_TILE_SIZE, 3);
  graphics.generateTexture(key, MAP_TILE_SIZE, MAP_TILE_SIZE);
  graphics.destroy();
}
