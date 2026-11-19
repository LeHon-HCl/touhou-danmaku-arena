import { getMap } from '../content/maps';

/**
 * 默认地图的便捷引用。
 *
 * 新代码请直接用 `getMap(state.mapId)`（每局地图可能不同）；
 * 这里保留 `DEFAULT_MAP` / `DEFAULT_MAP_TILE_SIZE` 只是为了兼容占位贴图、
 * 素材清单这类「只需要一个瓦片尺寸」的场景。
 */
export const DEFAULT_MAP = getMap(undefined);

/** 默认地图的瓦片边长（像素）。建议 24–32 */
export const DEFAULT_MAP_TILE_SIZE = DEFAULT_MAP.tileSize;
