import { CHARACTER_LIST, MAP_LIST } from '@shared';
import { ITEM_LIST } from '@shared/config/items';
import { SFX, type SfxKey } from '../audio/audio-manager';
import {
  BULLET_SIZE,
  CHARACTER_SIZE,
  ITEM_SIZE,
  TEX,
  itemTextureKey,
} from '../render/placeholder-textures';

/**
 * 素材清单：程序认识的每个图片/音频 key，对应仓库根目录 `assets/` 下的哪个文件。
 *
 * **加角色 / 加地图不需要改这个文件**：角色与地图的素材路径写在各自的
 * `shared/src/content/characters/*.ts`、`shared/src/content/maps/*.ts` 里，
 * 这里只是把它们收集成一个列表给加载器用。
 *
 * 路径相对 `assets/` 目录（Vite 的 publicDir 指向它），所以运行时 URL 是 `/images/xxx.png`。
 */

/** 一张图片素材 */
export interface ImageAsset {
  /** Phaser 贴图 key，渲染代码用这个引用 */
  key: string;
  /** 相对 assets/ 的路径 */
  file: string;
  /** 期望宽度（像素），用于加载后校验并给出告警 */
  width: number;
  /** 期望高度（像素） */
  height: number;
  /** 用途说明，只用于日志与文档 */
  usage: string;
}

/** 一个音频素材 */
export interface AudioAsset {
  /** Phaser 音频缓存 key */
  key: SfxKey;
  /** 候选文件（相对 assets/），按顺序取第一个存在的；用于 ogg / mp3 双格式 */
  files: string[];
  /** 用途说明，只用于日志与文档 */
  usage: string;
}

/** 全部图片素材：角色 → 地图瓦片 → 道具 → 固定贴图 */
export const IMAGE_ASSETS: ImageAsset[] = [
  ...CHARACTER_LIST.map((character) => ({
    key: character.textureKey,
    file: character.assetFile,
    width: CHARACTER_SIZE,
    height: CHARACTER_SIZE,
    usage: `角色：${character.displayName}`,
  })),

  ...MAP_LIST.flatMap((map) => [
    {
      key: map.floorTextureKey,
      file: map.floorFile,
      width: map.tileSize,
      height: map.tileSize,
      usage: `地面瓦片：${map.displayName}`,
    },
    {
      key: map.wallTextureKey,
      file: map.wallFile,
      width: map.tileSize,
      height: map.tileSize,
      usage: `墙体瓦片：${map.displayName}`,
    },
  ]),

  {
    key: TEX.dummy,
    file: 'images/char_dummy.png',
    width: CHARACTER_SIZE,
    height: CHARACTER_SIZE,
    usage: '练习场假人靶',
  },
  {
    key: TEX.bullet,
    file: 'images/bullet_player.png',
    width: BULLET_SIZE,
    height: BULLET_SIZE,
    usage: '玩家子弹',
  },
  {
    key: TEX.particle,
    file: 'images/fx_particle.png',
    width: 4,
    height: 4,
    usage: '粒子（会被染色/缩放）',
  },

  ...ITEM_LIST.map((item) => ({
    key: itemTextureKey(item.id),
    file: `images/item_${item.id}.png`,
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    usage: `道具：${item.displayName}`,
  })),
];

/** 全部音频素材 */
export const AUDIO_ASSETS: AudioAsset[] = [
  { key: SFX.shoot, files: ['audio/shoot.ogg', 'audio/shoot.mp3'], usage: '开枪' },
  { key: SFX.hit, files: ['audio/hit.ogg', 'audio/hit.mp3'], usage: '子弹命中' },
  {
    key: SFX.shieldBreak,
    files: ['audio/shield_break.ogg', 'audio/shield_break.mp3'],
    usage: '护盾破碎',
  },
  { key: SFX.death, files: ['audio/death.ogg', 'audio/death.mp3'], usage: '角色被击倒' },
  { key: SFX.hurt, files: ['audio/hurt.ogg', 'audio/hurt.mp3'], usage: '自己受伤' },
  { key: SFX.pickup, files: ['audio/pickup.ogg', 'audio/pickup.mp3'], usage: '拾取道具' },
];
