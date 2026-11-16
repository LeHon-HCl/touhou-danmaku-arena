import type { BattleConfig } from './config/types';
import {
  DUMMY_SPAWN_TILES,
  ITEM_SPAWN_TILES,
  MAP_COLUMNS,
  MAP_ROWS,
  MAP_TILE_SIZE,
  MAP_WALL_BLOCKS,
  MULTI_SPAWN_TILES,
  PLAYER_SPAWN_TILE,
} from './config/map-shrine';
import { pickWeightedItemId } from './config/items';
import { createDefaultModifiers, spawnPickup } from './sim/items';
import type {
  BattleState,
  CharacterId,
  FighterSpriteId,
  FighterStats,
  PlayerState,
  Rect,
} from './types';

/** 本地玩家固定 id */
export const PLAYER_ID = 1;

/** 创建一局时的可选项 */
export interface CreateBattleOptions {
  /** 本地玩家选的角色，默认灵梦 */
  characterId?: CharacterId;
  /** 本局时长（毫秒）。不传表示不计时（练习场自由模式） */
  matchDurationMs?: number;
  /** 开局时在地上预置的道具数量，默认 2（方便测试，也让开局有奔头） */
  seedPickups?: number;
  /** 假人数量，默认 3（联机对战传 0） */
  dummyCount?: number;
}

/** 瓦片坐标取中心点（像素），保证角色站在格子正中而不是格线交叉处 */
export function tileCenterToWorld(column: number, row: number): { x: number; y: number } {
  return {
    x: column * MAP_TILE_SIZE + MAP_TILE_SIZE / 2,
    y: row * MAP_TILE_SIZE + MAP_TILE_SIZE / 2,
  };
}

/**
 * 由瓦片配置生成墙体矩形列表（像素）。
 * 四周边界墙自动补齐，避免地图表的每一行都要写满 '#'。
 */
export function buildMapWalls(): Rect[] {
  const mapWidth = MAP_COLUMNS * MAP_TILE_SIZE;
  const mapHeight = MAP_ROWS * MAP_TILE_SIZE;

  const walls: Rect[] = [
    { x: 0, y: 0, width: MAP_TILE_SIZE, height: mapHeight },
    { x: mapWidth - MAP_TILE_SIZE, y: 0, width: MAP_TILE_SIZE, height: mapHeight },
    { x: 0, y: 0, width: mapWidth, height: MAP_TILE_SIZE },
    { x: 0, y: mapHeight - MAP_TILE_SIZE, width: mapWidth, height: MAP_TILE_SIZE },
  ];

  for (const block of MAP_WALL_BLOCKS) {
    walls.push({
      x: block.column * MAP_TILE_SIZE,
      y: block.row * MAP_TILE_SIZE,
      width: block.widthInTiles * MAP_TILE_SIZE,
      height: block.heightInTiles * MAP_TILE_SIZE,
    });
  }

  return walls;
}

/** 创建一个满血满盾的战斗单位 */
export function createFighter(
  id: number,
  characterId: FighterSpriteId,
  isDummy: boolean,
  stats: FighterStats,
  x: number,
  y: number,
): PlayerState {
  return {
    id,
    characterId,
    isDummy,
    stats,
    x,
    y,
    vx: 0,
    vy: 0,
    hp: stats.maxHp,
    shield: stats.maxShield,
    alive: true,
    respawnAtMs: 0,
    lastDamagedAtMs: -1_000_000,
    fireCooldownMs: 0,
    aimAngle: 0,
    facingX: 1,
    spawnX: x,
    spawnY: y,
    activeEffects: [],
    modifiers: createDefaultModifiers(),
    score: { kills: 0, deaths: 0, damageDealt: 0, itemsPicked: 0 },
  };
}

/**
 * 创建一局初始世界状态。
 *
 * @param options.characterId 本地玩家的角色，默认灵梦
 * @param options.matchDurationMs 限时对局时长；不传 = 练习场自由模式（不计时）
 * @param options.seedPickups 开局预置几个道具，默认 2
 */
export function createBattleState(
  config: BattleConfig,
  options: CreateBattleOptions = {},
): BattleState {
  const characterId = options.characterId ?? 'reimu';
  const playerSpawn = tileCenterToWorld(PLAYER_SPAWN_TILE.column, PLAYER_SPAWN_TILE.row);
  const players: PlayerState[] = [
    createFighter(
      PLAYER_ID,
      characterId,
      false,
      config.characters[characterId],
      playerSpawn.x,
      playerSpawn.y,
    ),
  ];

  DUMMY_SPAWN_TILES.forEach((tile, index) => {
    const spawn = tileCenterToWorld(tile.column, tile.row);
    players.push(
      createFighter(PLAYER_ID + 1 + index, 'dummy', true, config.dummy, spawn.x, spawn.y),
    );
  });

  const state: BattleState = {
    tick: 0,
    timeMs: 0,
    mapWidth: MAP_COLUMNS * MAP_TILE_SIZE,
    mapHeight: MAP_ROWS * MAP_TILE_SIZE,
    walls: buildMapWalls(),
    players,
    bullets: [],
    pickups: [],
    events: [],
    nextBulletId: 1,
    nextPickupId: 1,
    nextFixedItemSpawnAtMs: config.items.fixedSpawnInterval,
    nextRandomItemSpawnAtMs: config.items.randomSpawnInterval,
    matchEndsAtMs: options.matchDurationMs === undefined ? Infinity : options.matchDurationMs,
    isFinished: false,
  };

  // 开局预置几个道具：让玩家一进场就有目标，也方便第一次跑起来就能看到道具
  const seedCount = options.seedPickups ?? 2;
  for (let index = 0; index < seedCount; index += 1) {
    const tile = ITEM_SPAWN_TILES[index];
    if (!tile) {
      break;
    }
    const point = tileCenterToWorld(tile.column, tile.row);
    spawnPickup(state, config, point.x, point.y, pickWeightedItemId());
  }

  return state;
}

/** 按 id 查找战斗单位 */
export function findPlayer(state: BattleState, id: number): PlayerState | undefined {
  return state.players.find((player) => player.id === id);
}

/**
 * 往世界里加一个真人玩家（服务端在有人入房时调用）。
 * @param spawnIndex 第几个出生点，会自动对出生点数量取模
 */
export function addPlayer(
  state: BattleState,
  config: BattleConfig,
  playerId: number,
  characterId: CharacterId,
  spawnIndex: number,
): PlayerState {
  const tile = MULTI_SPAWN_TILES[spawnIndex % MULTI_SPAWN_TILES.length];
  const spawn = tileCenterToWorld(tile.column, tile.row);
  const player = createFighter(
    playerId,
    characterId,
    false,
    config.characters[characterId],
    spawn.x,
    spawn.y,
  );
  state.players.push(player);
  return player;
}

/** 把玩家从世界里移除（离开房间 / 超时未重连） */
export function removePlayer(state: BattleState, playerId: number): void {
  state.players = state.players.filter((player) => player.id !== playerId);
}

/** 让一名战斗单位回到出生点并恢复满状态 */
export function respawnFighter(state: BattleState, player: PlayerState): void {
  player.x = player.spawnX;
  player.y = player.spawnY;
  player.vx = 0;
  player.vy = 0;
  player.hp = player.stats.maxHp;
  player.shield = player.stats.maxShield;
  player.alive = true;
  player.respawnAtMs = 0;
  player.fireCooldownMs = 0;
  // 重生清空增益：否则"死了还带着攻击强化"会让对局变得莫名其妙
  player.activeEffects = [];
  player.modifiers = createDefaultModifiers();
  // 重生后不立刻开始回盾，需重新满足脱战条件
  player.lastDamagedAtMs = state.timeMs;
  state.events.push({ type: 'respawn', playerId: player.id });
}
