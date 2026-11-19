/**
 * 游戏内容注册表（角色 / 地图）。
 *
 * 这一层是「可玩内容」的唯一真源：加角色、加地图只动这里，逻辑层与渲染层都从这里取。
 * 本目录同样遵守 shared/ 的硬约束：不得 import Phaser / ws / node / DOM。
 */
export {
  CHARACTERS,
  CHARACTER_COUNT,
  CHARACTER_LIST,
  DEFAULT_CHARACTER_ID,
  SELECTABLE_CHARACTERS,
  getCharacter,
  isCharacterId,
} from './characters';
export type { Character, CharacterId, CharacterInit, CharacterPlaceholder } from './characters';

export { DEFAULT_MAP_ID, MAPS, MAP_LIST, getMap, isMapId } from './maps';
export type { GameMap, MapId, MapInit, TileBlock, TilePlaceholder, TilePoint } from './maps';
