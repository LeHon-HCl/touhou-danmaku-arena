import type { CharacterId, FighterSpriteId, ItemId, PlayerInput, PlayerScore } from './types';

/**
 * 通信协议（tech-design 第 4 章：状态同步 + 服务端权威）。
 *
 * 方向：
 *   客户端 → 服务端：join / input / leave
 *   服务端 → 客户端：welcome / snapshot / matchEnd / error
 *
 * 设计取舍（写清楚，免得以后有人"优化"坏）：
 * - 快照是**全量**的，不做增量。8 人 30Hz 的全量快照只有几百字节，
 *   全量不会出现"漏了某条增量导致状态永久错位"这类难查的 bug。
 * - 墙体不放进快照：它由同一份地图配置在两端各自生成（确定性数据），
 *   每帧重发 1KB 没有收益。代价是"改了地图要同时更新客户端"，这点写在 docs/code-map.md。
 * - 协议带版本号：版本不一致直接拒绝入房，避免新旧两端互相喂错误格式。
 */

/** 协议版本。改消息结构时 +1 */
export const PROTOCOL_VERSION = 1;

/** 快照里的一个战斗单位 */
export interface SnapshotPlayer {
  id: number;
  characterId: FighterSpriteId;
  isDummy: boolean;
  /** 世界坐标（像素） */
  x: number;
  y: number;
  hp: number;
  shield: number;
  /** 上限也一起发：客户端要在联机模式下画血条，不能只靠本地配置推断 */
  maxHp: number;
  maxShield: number;
  alive: boolean;
  /** 贴图朝向：1 右 / -1 左 */
  facingX: 1 | -1;
  /** 瞄准角度（弧度） */
  aimAngle: number;
  kills: number;
  deaths: number;
  /** 当前生效的增益 [道具 id, 剩余毫秒] */
  effects: Array<{ itemId: ItemId; remainingMs: number }>;
}

/** 快照里的一颗子弹（只发渲染需要的字段） */
export interface SnapshotBullet {
  id: number;
  x: number;
  y: number;
}

/** 快照里的一个地面道具 */
export interface SnapshotPickup {
  id: number;
  itemId: ItemId;
  x: number;
  y: number;
}

/** 服务端每 33ms 广播一次的世界快照 */
export interface WorldSnapshot {
  /** 服务端逻辑帧号，可用于排查"客户端卡在旧帧" */
  tick: number;
  /** 世界时间（毫秒） */
  timeMs: number;
  players: SnapshotPlayer[];
  bullets: SnapshotBullet[];
  pickups: SnapshotPickup[];
  /** 本局是否已结束 */
  isFinished: boolean;
}

/** 客户端发给服务端的消息 */
export type ClientMessage =
  | { type: 'join'; version: number; room: string; nickname: string; characterId: CharacterId }
  | { type: 'input'; input: PlayerInput }
  | { type: 'leave' };

/** 服务端发给客户端的消息 */
export type ServerMessage =
  | { type: 'welcome'; playerId: number; room: string; configVersion: string }
  | { type: 'snapshot'; snapshot: WorldSnapshot }
  | { type: 'matchEnd'; scores: Array<{ playerId: number; score: PlayerScore }> }
  | { type: 'error'; message: string };

/** 把任意 JSON 文本安全地解析成客户端消息；格式不对返回 null（服务端不用信任客户端） */
export function parseClientMessage(raw: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const candidate = parsed as { type?: unknown };
  if (candidate.type !== 'join' && candidate.type !== 'input' && candidate.type !== 'leave') {
    return null;
  }
  return parsed as ClientMessage;
}

/** 客户端的输入必须清洗：NaN / 超大值会直接把服务端的世界搞坏 */
export function sanitizeInput(input: PlayerInput): PlayerInput {
  const clamp = (value: number, min: number, max: number): number =>
    Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0;

  return {
    moveX: clamp(input.moveX, -1, 1),
    moveY: clamp(input.moveY, -1, 1),
    aimX: clamp(input.aimX, -10_000, 10_000),
    aimY: clamp(input.aimY, -10_000, 10_000),
    isFiring: Boolean(input.isFiring),
  };
}
