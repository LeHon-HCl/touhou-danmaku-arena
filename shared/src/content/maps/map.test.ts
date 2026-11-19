import { describe, expect, it } from 'vitest';
import { GameMap } from './map';
import { MAP_LIST, getMap } from './index';

/** 造一张最小的测试地图，避免测试与真实地图的数值耦合 */
function makeMap(overrides: Partial<ConstructorParameters<typeof GameMap>[0]> = {}): GameMap {
  return new GameMap({
    id: 'test',
    displayName: '测试图',
    tileSize: 10,
    columns: 4,
    rows: 3,
    wallBlocks: [{ column: 1, row: 1, widthInTiles: 1, heightInTiles: 1 }],
    playerSpawn: { column: 0, row: 0 },
    multiSpawns: [{ column: 0, row: 0 }],
    dummySpawns: [],
    itemSpawns: [{ column: 2, row: 2 }],
    floorTextureKey: 'tile_floor',
    wallTextureKey: 'tile_wall',
    floorFile: 'images/tile_floor.png',
    wallFile: 'images/tile_wall.png',
    floorPlaceholder: { base: 0x000000, detail: 0x111111 },
    wallPlaceholder: { base: 0x222222, detail: 0x333333 },
    ...overrides,
  });
}

describe('GameMap', () => {
  it('尺寸按瓦片数换算成像素', () => {
    const map = makeMap();
    expect(map.width).toBe(40);
    expect(map.height).toBe(30);
  });

  it('瓦片中心点落在格子正中', () => {
    const map = makeMap();
    expect(map.tileCenter(0, 0)).toEqual({ x: 5, y: 5 });
    expect(map.tileCenter(2, 1)).toEqual({ x: 25, y: 15 });
  });

  it('墙体包含四周边界墙与内部掩体', () => {
    const map = makeMap();
    const walls = map.buildWalls();
    // 4 面边界墙 + 1 块内部掩体
    expect(walls).toHaveLength(5);
    // 内部掩体按瓦片换算到像素
    expect(walls[4]).toEqual({ x: 10, y: 10, width: 10, height: 10 });
  });

  it('联机出生点按序号循环，不会越界', () => {
    const map = makeMap({
      multiSpawns: [
        { column: 0, row: 0 },
        { column: 3, row: 2 },
      ],
    });
    expect(map.multiSpawnPoint(0)).toEqual({ x: 5, y: 5 });
    expect(map.multiSpawnPoint(2)).toEqual({ x: 5, y: 5 });
    expect(map.multiSpawnPoint(-1)).toEqual({ x: 35, y: 25 });
  });

  it('道具刷新点越界返回 null', () => {
    const map = makeMap();
    expect(map.itemSpawnPoint(0)).toEqual({ x: 25, y: 25 });
    expect(map.itemSpawnPoint(1)).toBeNull();
  });

  it('非法 id 在构造时就报错', () => {
    expect(() => makeMap({ id: 'Bad-Id' })).toThrow();
  });
});

describe('地图注册表', () => {
  it('未知 id 回退到默认地图，而不是抛错', () => {
    const fallback = getMap('no-such-map');
    expect(MAP_LIST).toContain(fallback);
    expect(getMap(undefined)).toBe(fallback);
  });

  it('注册表里的地图 key 与地图自身 id 一致', () => {
    for (const map of MAP_LIST) {
      expect(getMap(map.id)).toBe(map);
    }
  });
});
