import type { Rect, Vec2 } from '../../types';

/** 瓦片坐标（第几列、第几行） */
export interface TilePoint {
  column: number;
  row: number;
}

/** 一块矩形墙体，单位瓦片 */
export interface TileBlock {
  /** 起始列，从 0 开始 */
  column: number;
  /** 起始行，从 0 开始 */
  row: number;
  /** 横向占几个瓦片 */
  widthInTiles: number;
  /** 纵向占几个瓦片 */
  heightInTiles: number;
}

/** 瓦片贴图的占位配色 */
export interface TilePlaceholder {
  /** 底色 */
  base: number;
  /** 装饰/高光色 */
  detail: number;
}

/** 构造一张地图所需的全部信息 */
export interface MapInit {
  /** 地图 id，必须与 MAPS 注册表里的键一致（小写 ASCII） */
  id: string;
  /** 界面显示名（中文） */
  displayName: string;
  /** 瓦片边长（像素）。建议 24–32 */
  tileSize: number;
  /** 地图宽（瓦片数） */
  columns: number;
  /** 地图高（瓦片数） */
  rows: number;
  /** 内部墙体与掩体；四周边界墙由 GameMap 自动补齐 */
  wallBlocks: TileBlock[];
  /** 本地练习的出生点 */
  playerSpawn: TilePoint;
  /** 联机出生点，按入场顺序分配 */
  multiSpawns: TilePoint[];
  /** 练习场假人出生点 */
  dummySpawns: TilePoint[];
  /** 道具固定刷新点 */
  itemSpawns: TilePoint[];

  /** 地面贴图 key（Phaser） */
  floorTextureKey: string;
  /** 墙体贴图 key（Phaser） */
  wallTextureKey: string;
  /** 地面素材路径（相对 assets/） */
  floorFile: string;
  /** 墙体素材路径（相对 assets/） */
  wallFile: string;

  /** 地面占位图配色 */
  floorPlaceholder: TilePlaceholder;
  /** 墙体占位图配色（顶面亮、底面暗，制造高度感） */
  wallPlaceholder: TilePlaceholder;
}

/**
 * 一张对战地图。
 *
 * 以前地图是一堆散落的常量（MAP_COLUMNS / MAP_WALL_BLOCKS / PLAYER_SPAWN_TILE …），
 * 谁要用都得 import 一串，且天然只能存在一张图。做成类之后：
 * 1. 尺寸、墙体、出生点、贴图**成套**绑定，加地图不会漏项；
 * 2. 瓦片坐标 → 世界像素的换算收敛到方法里，不各写一遍乘法；
 * 3. `BattleState` 只记 `mapId`，逻辑层与渲染层用 `getMap(state.mapId)` 还原同一张图。
 *
 * 加一张新地图 = 新建 `content/maps/<id>.ts` + 在 `index.ts` 注册一次。
 * 详细步骤见 `docs/extending-content.md`。
 */
export class GameMap {
  readonly id: string;
  readonly displayName: string;
  readonly tileSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly floorTextureKey: string;
  readonly wallTextureKey: string;
  readonly floorFile: string;
  readonly wallFile: string;
  readonly floorPlaceholder: TilePlaceholder;
  readonly wallPlaceholder: TilePlaceholder;

  private readonly wallBlocks: readonly TileBlock[];
  private readonly playerSpawn: TilePoint;
  private readonly multiSpawns: readonly TilePoint[];
  private readonly dummySpawns: readonly TilePoint[];
  private readonly itemSpawns: readonly TilePoint[];

  constructor(init: MapInit) {
    if (!/^[a-z][a-z0-9]*$/.test(init.id)) {
      throw new Error(`地图 id 必须是小写字母开头的 ASCII 标识符：${init.id}`);
    }
    if (init.playerSpawn.column < 0 || init.playerSpawn.row < 0) {
      throw new Error(`地图 ${init.id} 的出生点不能为负`);
    }
    if (init.multiSpawns.length === 0) {
      throw new Error(`地图 ${init.id} 至少要有一个联机出生点`);
    }

    this.id = init.id;
    this.displayName = init.displayName;
    this.tileSize = init.tileSize;
    this.columns = init.columns;
    this.rows = init.rows;
    this.floorTextureKey = init.floorTextureKey;
    this.wallTextureKey = init.wallTextureKey;
    this.floorFile = init.floorFile;
    this.wallFile = init.wallFile;
    this.floorPlaceholder = init.floorPlaceholder;
    this.wallPlaceholder = init.wallPlaceholder;
    this.wallBlocks = init.wallBlocks;
    this.playerSpawn = init.playerSpawn;
    this.multiSpawns = init.multiSpawns;
    this.dummySpawns = init.dummySpawns;
    this.itemSpawns = init.itemSpawns;
  }

  /** 地图宽（像素） */
  get width(): number {
    return this.columns * this.tileSize;
  }

  /** 地图高（像素） */
  get height(): number {
    return this.rows * this.tileSize;
  }

  /** 固定道具刷新点数量 */
  get itemSpawnCount(): number {
    return this.itemSpawns.length;
  }

  /** 瓦片坐标取中心点（像素）：角色站在格子正中，而不是格线交叉处 */
  tileCenter(column: number, row: number): Vec2 {
    return {
      x: column * this.tileSize + this.tileSize / 2,
      y: row * this.tileSize + this.tileSize / 2,
    };
  }

  /**
   * 生成全部墙体矩形（像素）。
   * 四周边界墙自动补齐，这样地图表只需要写内部掩体。
   */
  buildWalls(): Rect[] {
    const walls: Rect[] = [
      { x: 0, y: 0, width: this.tileSize, height: this.height },
      { x: this.width - this.tileSize, y: 0, width: this.tileSize, height: this.height },
      { x: 0, y: 0, width: this.width, height: this.tileSize },
      { x: 0, y: this.height - this.tileSize, width: this.width, height: this.tileSize },
    ];

    for (const block of this.wallBlocks) {
      walls.push({
        x: block.column * this.tileSize,
        y: block.row * this.tileSize,
        width: block.widthInTiles * this.tileSize,
        height: block.heightInTiles * this.tileSize,
      });
    }

    return walls;
  }

  /** 本地练习出生点（世界像素） */
  playerSpawnPoint(): Vec2 {
    return this.tileCenter(this.playerSpawn.column, this.playerSpawn.row);
  }

  /** 第 index 个联机出生点；超出数量时循环使用 */
  multiSpawnPoint(index: number): Vec2 {
    const tile =
      this.multiSpawns[
        ((index % this.multiSpawns.length) + this.multiSpawns.length) % this.multiSpawns.length
      ];
    return this.tileCenter(tile.column, tile.row);
  }

  /** 全部假人出生点（世界像素） */
  dummySpawnPoints(): Vec2[] {
    return this.dummySpawns.map((tile) => this.tileCenter(tile.column, tile.row));
  }

  /** 第 index 个固定道具刷新点；越界返回 null */
  itemSpawnPoint(index: number): Vec2 | null {
    const tile = this.itemSpawns[index];
    return tile ? this.tileCenter(tile.column, tile.row) : null;
  }

  /**
   * 按随机数取一个固定刷新点。
   * @param random 0–1 的随机数来源，默认 Math.random（测试时可注入固定值）
   */
  randomItemSpawnPoint(random: () => number = Math.random): Vec2 | null {
    if (this.itemSpawns.length === 0) {
      return null;
    }
    const index = Math.min(
      this.itemSpawns.length - 1,
      Math.floor(random() * this.itemSpawns.length),
    );
    return this.itemSpawnPoint(index);
  }
}
