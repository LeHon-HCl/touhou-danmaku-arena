/**
 * 首版地图（需求 5.4：1 张地图，含掩体走廊、开阔争夺区、多方向出生点）。
 *
 * 坐标一律用「瓦片」表达，避免手写像素坐标出错；世界层再换算成像素矩形。
 * 瓦片边长在 art-spec 2.3 仍为待定项，这里先取 32（与角色 48 的比例合适），确定后回写文档。
 */

/** 瓦片边长（像素）。建议 24–32 */
export const MAP_TILE_SIZE = 32;

/** 地图宽（瓦片数） */
export const MAP_COLUMNS = 40;

/** 地图高（瓦片数） */
export const MAP_ROWS = 24;

/** 一块矩形墙体，单位为瓦片 */
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

/** 地图内部的墙体与掩体（四周边界墙由世界层自动补齐） */
export const MAP_WALL_BLOCKS: TileBlock[] = [
  { column: 5, row: 3, widthInTiles: 4, heightInTiles: 2 },
  { column: 31, row: 3, widthInTiles: 4, heightInTiles: 2 },
  { column: 5, row: 19, widthInTiles: 4, heightInTiles: 2 },
  { column: 31, row: 19, widthInTiles: 4, heightInTiles: 2 },

  // 中央争夺区
  { column: 18, row: 10, widthInTiles: 4, heightInTiles: 4 },

  // 左右走廊的隔断，制造绕后与视线遮挡
  { column: 8, row: 12, widthInTiles: 6, heightInTiles: 1 },
  { column: 26, row: 12, widthInTiles: 6, heightInTiles: 1 },

  // 四根柱子
  { column: 13, row: 7, widthInTiles: 2, heightInTiles: 2 },
  { column: 25, row: 7, widthInTiles: 2, heightInTiles: 2 },
  { column: 13, row: 15, widthInTiles: 2, heightInTiles: 2 },
  { column: 25, row: 15, widthInTiles: 2, heightInTiles: 2 },
];

/** 本地玩家出生点（瓦片坐标） */
export const PLAYER_SPAWN_TILE = { column: 3, row: 12 };

/**
 * 联机对战的出生点（瓦片坐标），四个角各一个。
 * 服务端按入场顺序依次分配，避免两人重登。
 */
export const MULTI_SPAWN_TILES: Array<{ column: number; row: number }> = [
  { column: 3, row: 3 },
  { column: 36, row: 3 },
  { column: 3, row: 20 },
  { column: 36, row: 20 },
  { column: 3, row: 12 },
  { column: 36, row: 12 },
  { column: 20, row: 3 },
  { column: 20, row: 20 },
];

/** 练习场假人出生点（瓦片坐标） */
export const DUMMY_SPAWN_TILES: Array<{ column: number; row: number }> = [
  { column: 36, row: 12 },
  { column: 20, row: 4 },
  { column: 20, row: 19 },
];

/** 道具固定刷新点（瓦片坐标）。道具系统尚未实现，先把位置定下来（需求 5.4 要求至少 2 处） */
export const ITEM_SPAWN_TILES: Array<{ column: number; row: number }> = [
  { column: 20, row: 8 },
  { column: 20, row: 15 },
  { column: 10, row: 4 },
  { column: 30, row: 20 },
];
