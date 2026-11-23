import { GameMap } from './map';

/**
 * 首版地图「博丽神社」（需求 5.4：1 张地图，含掩体走廊、开阔争夺区、多方向出生点）。
 *
 * 坐标一律用「瓦片」表达，避免手写像素坐标出错；GameMap 再换算成像素矩形。
 * 瓦片边长取自 art-spec 2.3（32px，与 48×48 角色比例合适）。
 */
export const shrine = new GameMap({
  id: 'shrine',
  displayName: '博丽神社',
  tileSize: 32,
  columns: 40,
  rows: 24,

  /** 内部墙体与掩体（四周边界墙自动补齐） */
  wallBlocks: [
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
  ],

  /** 本地练习出生点 */
  playerSpawn: { column: 3, row: 12 },

  /** 联机出生点：四个角 + 四条边中点，服务端按入场顺序分配 */
  multiSpawns: [
    { column: 3, row: 3 },
    { column: 36, row: 3 },
    { column: 3, row: 20 },
    { column: 36, row: 20 },
    { column: 3, row: 12 },
    { column: 36, row: 12 },
    { column: 20, row: 3 },
    { column: 20, row: 20 },
  ],

  /** 练习场假人出生点 */
  dummySpawns: [
    { column: 36, row: 12 },
    { column: 20, row: 4 },
    { column: 20, row: 19 },
  ],

  /** 道具固定刷新点（需求 5.4 要求至少 2 处） */
  itemSpawns: [
    { column: 20, row: 8 },
    { column: 20, row: 15 },
    { column: 10, row: 4 },
    { column: 30, row: 20 },
  ],

  floorTextureKey: 'tile_floor',
  wallTextureKey: 'tile_wall',
  floorFile: 'images/tile_floor.png',
  wallFile: 'images/tile_wall.png',

  /** 占位图：深色地面带少量浅色噪点 */
  floorPlaceholder: { base: 0x12121a, detail: 0x1b1b26 },
  /** 占位图：顶面高光 + 底部暗边，做出墙的高度感 */
  wallPlaceholder: { base: 0x2b2b3a, detail: 0x3d3d52 },
});
