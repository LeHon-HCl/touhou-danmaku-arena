import type { BattleConfig } from './config/types';
import { DEFAULT_CHARACTER_ID } from './content/characters';
import { getMap } from './content/maps';
import type { GameMap } from './content/maps';
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
  /** 使用哪张地图；不传用默认地图（见 content/maps） */
  mapId?: string;
  /** 本局时长（毫秒）。不传表示不计时（练习场自由模式） */
  matchDurationMs?: number;
  /** 开局时在地上预置的道具数量，默认 2（方便测试，也让开局有奔头） */
  seedPickups?: number;
  /** 假人数量，默认 3（联机对战传 0） */
  dummyCount?: number;
  /**
   * AI 对手数量（单人模式用）。默认 0。
   * AI 会使用 `aiCharacterId` 指定的角色，从天生的联机出生点出发。
   */
  aiCount?: number;
  /** AI 使用的角色 id，默认与本地玩家不同（让对手一眼能区分） */
  aiCharacterId?: CharacterId;
}

/** 本地玩家的对手 id 起点：AI 与假人都从这个号段往后排 */
const OPPONENT_ID_BASE = 2;

/** 瓦片坐标取中心点（像素），保证角色站在格子正中而不是格线交叉处 */
export function tileCenterToWorld(
  column: number,
  row: number,
  map: GameMap = getMap(undefined),
): { x: number; y: number } {
  return map.tileCenter(column, row);
}

/**
 * 由地图定义生成墙体矩形列表（像素）。
 * 四周边界墙由 GameMap 自动补齐，避免地图表的每一行都要写满 '#'。
 */
export function buildMapWalls(map: GameMap = getMap(undefined)): Rect[] {
  return map.buildWalls();
}

/** 创建一个满血满盾的战斗单位 */
export function createFighter(
  id: number,
  characterId: FighterSpriteId,
  isDummy: boolean,
  stats: FighterStats,
  x: number,
  y: number,
  isAi = false,
): PlayerState {
  return {
    id,
    characterId,
    isDummy,
    isAi,
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
  const map = getMap(options.mapId);
  const characterId = options.characterId ?? DEFAULT_CHARACTER_ID;
  const playerSpawn = map.playerSpawnPoint();
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

  const dummySpawns = map.dummySpawnPoints();
  const dummyLimit = Math.min(options.dummyCount ?? dummySpawns.length, dummySpawns.length);
  for (let index = 0; index < dummyLimit; index += 1) {
    const spawn = dummySpawns[index];
    players.push(
      createFighter(PLAYER_ID + 1 + index, 'dummy', true, config.dummy, spawn.x, spawn.y),
    );
  }

  // AI 对手：用真角色数值、从联机出生点出发；isAi 让它们每帧接收 AI 产出的输入
  const aiCount = Math.max(0, options.aiCount ?? 0);
  const aiCharacterId =
    options.aiCharacterId ??
    (characterId === 'marisa' ? DEFAULT_CHARACTER_ID : ('marisa' as CharacterId));
  for (let index = 0; index < aiCount; index += 1) {
    const spawn = map.multiSpawnPoint(index + 1);
    players.push(
      createFighter(
        OPPONENT_ID_BASE + dummyLimit + index,
        aiCharacterId,
        false,
        config.characters[aiCharacterId],
        spawn.x,
        spawn.y,
        true,
      ),
    );
  }

  const state: BattleState = {
    tick: 0,
    timeMs: 0,
    mapWidth: map.width,
    mapHeight: map.height,
    mapId: map.id,
    walls: map.buildWalls(),
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
    const point = map.itemSpawnPoint(index);
    if (!point) {
      break;
    }
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
  const spawn = getMap(state.mapId).multiSpawnPoint(spawnIndex);
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
