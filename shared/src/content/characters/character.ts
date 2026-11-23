import type { FighterStats } from '../../types';

/**
 * 占位图配色与装饰。
 *
 * 正式素材（assets/images/）还没做好时，程序用这些参数现场画一个能分辨的角色图。
 * 新角色只需要在这里给一组颜色，就能在没有美术资源的情况下先跑起来。
 */
export interface CharacterPlaceholder {
  /** 头发颜色 */
  hairColor: number;
  /** 上衣颜色 */
  robeColor: number;
  /** 下装颜色 */
  skirtColor: number;
  /** 装饰颜色（蝴蝶结 / 帽带） */
  accentColor: number;
  /** 头顶装饰类型，决定占位图多画哪一笔 */
  accessory: 'bow' | 'hat' | 'none';
}

/** 构造一个角色所需的全部信息 */
export interface CharacterInit {
  /** 角色 id，必须与 CHARACTERS 注册表里的键一致（小写 ASCII） */
  id: string;
  /** 界面显示名（中文） */
  displayName: string;
  /** 战斗数值；改平衡只动这里 */
  stats: FighterStats;
  /** 素材路径（相对 assets/），例如 images/char_reimu.png */
  assetFile: string;
  /** Phaser 贴图 key，渲染层用它引用这张图 */
  textureKey: string;
  /** 占位图配色 */
  placeholder: CharacterPlaceholder;
  /** 是否出现在选人界面；false 表示只能由服务端/脚本使用 */
  selectable?: boolean;
}

/**
 * 一个角色。
 *
 * 为什么做成类而不是一个对象字面量：
 * 1. 数值、贴图、占位配色必须**成套**存在，否则加角色时容易漏掉某一项；
 * 2. 构造时统一做校验（id 格式、贴图 key 非空），把"加错了"提前到启动时报错；
 * 3. 渲染层与逻辑层拿到的是同一个实例，避免两边各维护一份角色表。
 *
 * 加一个新角色 = 新建 `content/characters/<id>.ts` + 在 `index.ts` 注册一次。
 * 详细步骤见 `docs/extending-content.md`。
 */
export class Character {
  readonly id: string;
  readonly displayName: string;
  readonly stats: FighterStats;
  readonly assetFile: string;
  readonly textureKey: string;
  readonly placeholder: CharacterPlaceholder;
  readonly selectable: boolean;

  constructor(init: CharacterInit) {
    if (!/^[a-z][a-z0-9]*$/.test(init.id)) {
      throw new Error(`角色 id 必须是小写字母开头的 ASCII 标识符：${init.id}`);
    }
    if (!init.textureKey) {
      throw new Error(`角色 ${init.id} 缺少 textureKey`);
    }

    this.id = init.id;
    this.displayName = init.displayName;
    this.stats = init.stats;
    this.assetFile = init.assetFile;
    this.textureKey = init.textureKey;
    this.placeholder = init.placeholder;
    this.selectable = init.selectable ?? true;
  }
}
