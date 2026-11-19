/**
 * shared/ 对外的唯一入口。
 *
 * 本包被三种运行环境共同执行：浏览器（联机客户端）、Node（服务端）、浏览器（离线练习场）。
 * 因此这里导出的任何东西都不得引入 Phaser / ws / node 模块 / DOM API（tech-design 8.2）。
 */
export type {
  ActiveEffect,
  BattleEvent,
  BattleState,
  BulletState,
  CharacterId,
  FighterSpriteId,
  FighterStats,
  ItemId,
  PickupState,
  PlayerInput,
  PlayerModifiers,
  PlayerScore,
  PlayerState,
  Rect,
  Vec2,
} from './types';

export {
  ITEMS,
  ITEM_LIST,
  DEFAULT_MAP,
  DEFAULT_MAP_TILE_SIZE,
  battleConfig,
  characters,
  pickWeightedItemId,
} from './config';
export type {
  BattleConfig,
  CharacterConfig,
  DummyConfig,
  ItemConfig,
  ItemEffect,
  ItemSpawnConfig,
} from './config';

/**
 * 可玩内容（角色 / 地图）的注册表。
 * 加角色或加地图只动 `content/` 目录，见 docs/extending-content.md。
 */
export {
  CHARACTERS,
  CHARACTER_COUNT,
  CHARACTER_LIST,
  DEFAULT_CHARACTER_ID,
  DEFAULT_MAP_ID,
  MAPS,
  MAP_LIST,
  SELECTABLE_CHARACTERS,
  getCharacter,
  getMap,
  isCharacterId,
  isMapId,
} from './content';
export type {
  Character,
  CharacterInit,
  CharacterPlaceholder,
  GameMap,
  MapId,
  MapInit,
  TileBlock,
  TilePlaceholder,
  TilePoint,
} from './content';

export {
  PLAYER_ID,
  addPlayer,
  buildMapWalls,
  createBattleState,
  findPlayer,
  removePlayer,
  respawnFighter,
} from './world';
export type { CreateBattleOptions } from './world';
export { AI_SKILLS, AiController } from './ai';
export type { AiSkill } from './ai';
export { PROTOCOL_VERSION, parseClientMessage, sanitizeInput } from './protocol';
export type {
  ClientMessage,
  ServerMessage,
  SnapshotBullet,
  SnapshotPickup,
  SnapshotPlayer,
  WorldSnapshot,
} from './protocol';
export { applySnapshotToState, createSnapshot } from './snapshot';
export { step } from './step';
export { applyDamage, updateShieldRegen } from './sim/damage';
export type { DamageResult } from './sim/damage';
export { isPointInRects, isSegmentHittingCircle } from './sim/projectile';
export { hasLineOfSight, isSegmentBlockedByRect } from './sim/visibility';
export { updatePlayerMovement } from './sim/movement';
export {
  applyItemToPlayer,
  collectPickups,
  createDefaultModifiers,
  recomputeModifiers,
  spawnPickup,
  updateEffectTimers,
  updateItemSpawns,
  updatePickupLifetimes,
} from './sim/items';
