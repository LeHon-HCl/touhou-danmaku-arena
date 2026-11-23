import type { GameMap } from './map';
import { shrine } from './shrine';

/**
 * 地图注册表 —— **加地图的唯一入口**。
 *
 * 加一张新地图只需两步：
 * 1. 照 `shrine.ts` 的样子新建 `content/maps/<id>.ts`；
 * 2. 在下面的 `MAPS` 里加一行（id 必须与 new GameMap({ id }) 一致）。
 *
 * 其余都自动生效：贴图占位图生成、素材清单、出生点分配、墙体生成都遍历本表。
 *
 * ⚠️ 联机目前固定使用默认地图（见 `DEFAULT_MAP_ID`）。
 * 要让房主选图，需要把 mapId 加进 join / 快照协议，属于后续工作；
 * 单机练习与本地调试已经可以按 `mapId` 指定任意地图。
 */
export const MAPS = {
  shrine,
} as const;

/** 合法地图 id。新增地图后自动扩展 */
export type MapId = keyof typeof MAPS;

/** 全部地图 */
export const MAP_LIST: readonly GameMap[] = Object.values(MAPS);

/** 默认地图：不指定时的兜底，也是联机当前固定使用的地图 */
export const DEFAULT_MAP_ID: MapId = 'shrine';

/** 判断一个任意值是不是已知地图 id */
export function isMapId(value: unknown): value is MapId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MAPS, value);
}

/** 取地图定义；未知 id 回退到默认地图（理由同 getCharacter） */
export function getMap(id: string | undefined): GameMap {
  return id !== undefined && isMapId(id) ? MAPS[id] : MAPS[DEFAULT_MAP_ID];
}

export type { GameMap, MapInit, TileBlock, TilePlaceholder, TilePoint } from './map';
