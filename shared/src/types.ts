/**
 * 世界状态与战斗逻辑共用的基础类型。
 *
 * 本目录（shared/）被客户端、服务端、离线练习场三处共同执行，因此：
 * 禁止 import Phaser / ws / node 模块 / 任何 DOM API（tech-design 8.2）。
 */

/** 二维坐标，单位像素（dev-conventions 6.2：距离一律像素） */
export interface Vec2 {
  x: number;
  y: number;
}

/** 轴对齐矩形（墙体等），单位像素 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 可选角色 id。dummy 仅供练习场假人使用，不代表可选角色 */
export type CharacterId = 'reimu' | 'marisa';

/** 决定渲染用贴图的标识，假人单独一档 */
export type FighterSpriteId = CharacterId | 'dummy';

/**
 * 道具 id。
 * 只放"已实现"的道具：配置里每加一个 id，就必须在 sim/items.ts 里能被正确处理。
 * 需求 6.5 的 8 种里，护盾发生器 / 隐身 / 符卡加速 依赖的系统（强制回盾、小地图、符卡）还没做，
 * 所以先不进这个联合类型 —— 让 TypeScript 帮我们保证"配置与处理逻辑一一对应"。
 */
export type ItemId = 'heal' | 'armorHarden' | 'attackBoost' | 'fireRateBoost' | 'speedBoost';

/** 一条正在生效的增益（需求 6.3：同类增益不叠加，只刷新时间） */
export interface ActiveEffect {
  itemId: ItemId;
  /** 剩余时长（毫秒），归零即失效 */
  remainingMs: number;
}

/**
 * 由生效增益算出来的倍率。
 *
 * 为什么不直接改 stats？因为 stats 是配置派生出的基础值，
 * 改它等于污染"白值"（需求 2.3.2 的数值都以白值为基准）。
 * 这里单独存一份倍率，伤害与移动时临时乘上去，增益到期只要重算倍率即可。
 */
export interface PlayerModifiers {
  /** 伤害倍率，1 = 无增益 */
  damageMultiplier: number;
  /** 射击间隔倍率，小于 1 表示射得更快 */
  fireIntervalMultiplier: number;
  /** 移动速度倍率 */
  moveSpeedMultiplier: number;
  /** 护盾可吸收倍率：1 = 1 点盾挡 1 点伤；2 = 1 点盾挡 2 点伤（防御强化） */
  shieldAbsorbMultiplier: number;
}

/** 单局战果统计（需求 4.7 固定四个维度） */
export interface PlayerScore {
  /** 击杀数 */
  kills: number;
  /** 阵亡数 */
  deaths: number;
  /** 对别人造成的总伤害（含被护盾吸收的部分） */
  damageDealt: number;
  /** 捡到的道具数 */
  itemsPicked: number;
}

/** 掉在地上的道具 */
export interface PickupState {
  id: number;
  itemId: ItemId;
  x: number;
  y: number;
  /** 剩余存在时长（毫秒），到期自动消失 */
  lifeMs: number;
}

/**
 * 玩家在单帧内的输入意图。
 * 共享层不关心它来自键鼠、手柄还是网络，统一成这个结构（需求 2.2 / ADR-8）。
 */
export interface PlayerInput {
  /** 水平移动意图，-1 到 1 */
  moveX: number;
  /** 垂直移动意图，-1 到 1 */
  moveY: number;
  /** 瞄准点世界坐标 X（像素），来自光标绝对定位 */
  aimX: number;
  /** 瞄准点世界坐标 Y（像素） */
  aimY: number;
  /** 本帧是否按住开火 */
  isFiring: boolean;
}

/**
 * 战斗数值快照。
 * 由 shared/config 派生一次后存进世界状态，避免每帧查表（配置仍以 config 为唯一真源）。
 */
export interface FighterStats {
  /** 最大生命值 */
  maxHp: number;
  /** 最大护盾值 */
  maxShield: number;
  /** 脱战多久后开始回盾（毫秒） */
  shieldRegenDelay: number;
  /** 每秒回盾量（点/秒） */
  shieldRegenPerSecond: number;
  /** 移动速度（像素/秒） */
  moveSpeed: number;
  /** 射击间隔（毫秒） */
  fireInterval: number;
  /** 单发伤害（点） */
  damage: number;
  /** 弹速（像素/秒） */
  bulletSpeed: number;
  /** 子弹半径（像素） */
  bulletRadius: number;
  /** 子弹存活时长（毫秒） */
  bulletLife: number;
  /** 角色碰撞半径（像素），用于命中与墙体分离 */
  bodyRadius: number;
  /** 阵亡后重生延迟（毫秒） */
  respawnDelay: number;
}

/** 一个战斗单位（玩家或假人）的完整状态 */
export interface PlayerState {
  /** 本局内唯一 id，1 为本地玩家 */
  id: number;
  /** 决定贴图与后续角色差异化逻辑 */
  characterId: FighterSpriteId;
  /** 假人不接收输入、不开火 */
  isDummy: boolean;
  /** 数值快照 */
  stats: FighterStats;
  /** 世界坐标（像素） */
  x: number;
  y: number;
  /** 当前速度（像素/秒），仅用于表现与调试 */
  vx: number;
  vy: number;
  /** 当前生命 */
  hp: number;
  /** 当前护盾 */
  shield: number;
  /** 是否存活 */
  alive: boolean;
  /** 重生时刻（毫秒，世界时间） */
  respawnAtMs: number;
  /** 最近一次受伤时刻（毫秒），用于脱战判定 */
  lastDamagedAtMs: number;
  /** 开火冷却剩余（毫秒） */
  fireCooldownMs: number;
  /** 瞄准角度（弧度），由光标位置算出 */
  aimAngle: number;
  /** 最近一次水平移动方向，决定贴图翻转（art-spec 2.1） */
  facingX: 1 | -1;
  /** 出生点世界坐标，重生时回到这里 */
  spawnX: number;
  spawnY: number;
  /** 当前生效的增益列表 */
  activeEffects: ActiveEffect[];
  /** 由 activeEffects 算出的倍率，每次增益变化时重算 */
  modifiers: PlayerModifiers;
  /** 本局战果统计 */
  score: PlayerScore;
}

/** 一颗飞行中的子弹 */
export interface BulletState {
  id: number;
  /** 发射者 id，用于排除自伤 */
  ownerId: number;
  x: number;
  y: number;
  /** 上一逻辑帧位置，用于线段扫掠命中（避免高速穿透） */
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  /** 碰撞半径（像素） */
  radius: number;
  /** 命中伤害（点） */
  damage: number;
  /** 剩余存活时长（毫秒），<= 0 表示本帧销毁 */
  lifeMs: number;
}

/** 单个逻辑帧内产生的事件，供渲染层做音效/特效，不参与判定 */
export type BattleEvent =
  | { type: 'shoot'; playerId: number; x: number; y: number; angle: number }
  | { type: 'hit'; targetId: number; hpDamage: number; shieldDamage: number; x: number; y: number }
  | { type: 'shieldBreak'; playerId: number }
  | { type: 'death'; playerId: number }
  | { type: 'respawn'; playerId: number }
  | { type: 'pickup'; playerId: number; itemId: ItemId; x: number; y: number }
  | { type: 'matchEnd' };

/** 一局战斗的完整世界状态：只有这一份，渲染层只读（需求 10.2.3） */
export interface BattleState {
  /** 已推进的逻辑帧数 */
  tick: number;
  /** 世界时间（毫秒），按固定步长累加 */
  timeMs: number;
  /** 地图宽高（像素） */
  mapWidth: number;
  mapHeight: number;
  /** 阻挡移动与子弹的墙体 */
  walls: Rect[];
  /** 全部战斗单位，含假人 */
  players: PlayerState[];
  /** 飞行中的子弹 */
  bullets: BulletState[];
  /** 掉在地上的道具 */
  pickups: PickupState[];
  /** 本帧事件，每帧清空 */
  events: BattleEvent[];
  /** 下一个子弹 id */
  nextBulletId: number;
  /** 下一个道具 id */
  nextPickupId: number;
  /** 下一次在固定刷新点生成道具的时刻（毫秒） */
  nextFixedItemSpawnAtMs: number;
  /** 下一次在随机位置生成道具的时刻（毫秒） */
  nextRandomItemSpawnAtMs: number;
  /** 本局结束时刻（毫秒）；练习场自由模式用 Infinity 表示不计时 */
  matchEndsAtMs: number;
  /** 本局是否已经结束（结束后世界冻结，不再推进） */
  isFinished: boolean;
}
