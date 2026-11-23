export { battleConfig } from './match';
export { characters } from './characters';
export { ITEMS, ITEM_LIST, pickWeightedItemId } from './items';
export type { ItemConfig, ItemEffect } from './items';
/**
 * 地图定义已迁到 `content/maps/`（GameMap 类）。
 * 这里只保留默认地图的引用，方便老的 `MAP_TILE_SIZE` 用法平滑过渡。
 */
export { DEFAULT_MAP, DEFAULT_MAP_TILE_SIZE } from './map';
export type { BattleConfig, CharacterConfig, DummyConfig, ItemSpawnConfig } from './types';
