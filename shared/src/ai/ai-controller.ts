import { hasLineOfSight } from '../sim/visibility';
import { isPointInRects } from '../sim/projectile';
import type { BattleState, PlayerInput, PlayerState } from '../types';

/**
 * 单人模式的 AI 对手。
 *
 * 设计原则：**AI 不碰判定，只产出 `PlayerInput`**。
 * 移动、开火、命中、伤害全部还是由同一个 `step()` 处理，
 * 所以 AI 和真人玩家走的是完全相同的规则，不会出现"AI 打人特别疼"这类两套逻辑的 bug。
 *
 * 行为分四层，逐层决定：
 * 1. **选目标**：只打真人；优先看得见的、更近的；
 * 2. **瞄准**：带反应延迟 + 固定相位抖动 + 弹道预判；
 * 3. **走位**：保持理想交战距离，并侧向游走避免站桩；
 * 4. **开火**：有视线且瞄得够准时才开火（否则会显得"隔墙乱打"）。
 *
 * 难度通过 `AiSkill` 调整，`AI_SKILLS` 提供三档预设。
 */
export interface AiSkill {
  /** 名字，只用于日志与调试 */
  name: string;
  /** 瞄准抖动幅度（弧度）。0 = 完美瞄准；0.12 ≈ 7° 的晃动 */
  aimJitter: number;
  /** 反应延迟（毫秒）：目标移动后，AI 隔多久才更新瞄准点 */
  reactionMs: number;
  /** 是否只在有视线时才开火（false = 隔墙乱打，观感更差） */
  requireLineOfSight: boolean;
  /** 开火前要求瞄准精度：cos(误差角) ≥ 这个值才扣扳机，越接近 1 越苛刻 */
  fireAimTolerance: number;
  /** 理想交战距离（像素） */
  preferredRange: number;
  /** 距离容差（像素）：在这个范围内只侧向游走，不做前后调整 */
  rangeTolerance: number;
}

/** 三档预设难度 */
export const AI_SKILLS: Record<'easy' | 'normal' | 'hard', AiSkill> = {
  easy: {
    name: '简单',
    aimJitter: 0.16,
    reactionMs: 420,
    requireLineOfSight: true,
    fireAimTolerance: 0.9,
    preferredRange: 260,
    rangeTolerance: 90,
  },
  normal: {
    name: '普通',
    aimJitter: 0.07,
    reactionMs: 220,
    requireLineOfSight: true,
    fireAimTolerance: 0.97,
    preferredRange: 300,
    rangeTolerance: 70,
  },
  hard: {
    name: '困难',
    aimJitter: 0.02,
    reactionMs: 90,
    requireLineOfSight: true,
    fireAimTolerance: 0.995,
    preferredRange: 320,
    rangeTolerance: 50,
  },
};

/** 单个 AI 的运行时记忆（每个 AI 单位一份） */
interface AiMemory {
  /** 上一次真正更新瞄准点的时刻（毫秒，世界时间） */
  lastAimUpdateMs: number;
  /** 缓存的目标位置：用于实现"反应延迟" */
  targetX: number;
  targetY: number;
  /** 固定的抖动相位，避免每帧重新随机导致抖动变成高频噪音 */
  jitterPhase: number;
  /** 侧向游走方向，1 或 -1；撞墙后翻转 */
  strafeDirection: 1 | -1;
  /** 卡住判定的上一帧位置 */
  lastX: number;
  lastY: number;
  /** 连续卡住的帧数 */
  stuckFrames: number;
  /** 上一次脱困翻转的时刻（毫秒）：用于冷却，避免频繁翻转 */
  lastDetourMs: number;
}

/**
 * 一局的 AI 控制器。
 *
 * 为什么集中成一个控制器而不是每个单位一个实例：
 * `step()` 每帧只需要一批 `PlayerInput`，算完一次性喂进去最简单；
 * 以后若要统一限制"AI 是否知道墙后的敌人"，也只需要改这一处。
 */
export class AiController {
  private readonly memories = new Map<number, AiMemory>();

  constructor(private readonly skill: AiSkill = AI_SKILLS.normal) {}

  /** 清空记忆（重开一局时调用，避免沿用上一局的位置基准） */
  reset(): void {
    this.memories.clear();
  }

  /**
   * 为所有 AI 单位生成本帧输入，直接写进 `out`。
   *
   * @param state 当前世界状态（只读）
   * @param humanIds 真人玩家 id 集合；AI 只把这些人当目标
   * @param out 输出表，由调用方每帧清空后复用
   */
  fillInputs(
    state: BattleState,
    humanIds: ReadonlySet<number>,
    out: Map<number, PlayerInput>,
  ): void {
    for (const player of state.players) {
      if (!player.isAi || !player.alive) {
        continue;
      }
      const input = this.think(state, player, humanIds);
      if (input) {
        out.set(player.id, input);
      }
    }
  }

  /** 单个 AI 的思考；找不到目标时返回 null（保持静止） */
  private think(
    state: BattleState,
    self: PlayerState,
    humanIds: ReadonlySet<number>,
  ): PlayerInput | null {
    const target = this.pickTarget(state, self, humanIds);
    if (!target) {
      return null;
    }

    const memory = this.memoryFor(self);

    // 1. 反应延迟：按 reactionMs 节流刷新目标位置
    if (state.timeMs - memory.lastAimUpdateMs >= this.skill.reactionMs) {
      memory.lastAimUpdateMs = state.timeMs;
      memory.targetX = target.x;
      memory.targetY = target.y;
    }

    // 2. 弹道预判：按子弹飞行时间加提前量
    const distance = Math.hypot(target.x - self.x, target.y - self.y);
    const flightSeconds = distance / Math.max(1, self.stats.bulletSpeed);
    const predictX = memory.targetX + target.vx * flightSeconds;
    const predictY = memory.targetY + target.vy * flightSeconds;

    // 固定相位的正弦抖动：比每帧随机更像人，也不会让准心高频乱跳
    const jitter = Math.sin(state.timeMs / 260 + memory.jitterPhase) * this.skill.aimJitter;
    const aimAngle = Math.atan2(predictY - self.y, predictX - self.x) + jitter;

    // 瞄准点取 200px 外的一个点：step() 只用方向，距离不影响结果
    const aimX = self.x + Math.cos(aimAngle) * 200;
    const aimY = self.y + Math.sin(aimAngle) * 200;

    // 3. 视线：决定"能不能开火"以及"要不要先过去"
    const canSee =
      !this.skill.requireLineOfSight ||
      hasLineOfSight(state.walls, self.x, self.y, target.x, target.y);

    // 4. 走位
    const movement = this.decideMovement(state, self, target, memory, distance, canSee);

    // 5. 开火：有视线 + 瞄得够准
    const exactAngle = Math.atan2(target.y - self.y, target.x - self.x);
    const aimError = Math.abs(normalizeAngle(aimAngle - exactAngle));
    const wellAimed = Math.cos(aimError) >= this.skill.fireAimTolerance;

    return {
      moveX: movement.x,
      moveY: movement.y,
      aimX,
      aimY,
      isFiring: canSee && wellAimed,
    };
  }

  /** 选目标：只打真人，优先看得见的、更近的 */
  private pickTarget(
    state: BattleState,
    self: PlayerState,
    humanIds: ReadonlySet<number>,
  ): PlayerState | null {
    let best: PlayerState | null = null;
    let bestScore = Infinity;

    for (const other of state.players) {
      if (other.id === self.id || !other.alive || !humanIds.has(other.id)) {
        continue;
      }

      const distance = Math.hypot(other.x - self.x, other.y - self.y);
      // 看不见的目标当作"更远"：让它优先打眼前的人，而不是隔墙执着追人
      const visible = hasLineOfSight(state.walls, self.x, self.y, other.x, other.y);
      const score = visible ? distance : distance + 2000;
      if (score < bestScore) {
        bestScore = score;
        best = other;
      }
    }

    return best;
  }

  /**
   * 走位决策，返回归一化后的方向。
   *
   * - 太远 → 靠近；太近 → 后退；距离合适 → 侧向游走（制造对枪走位）
   * - 看不见目标 → 直接朝目标走，先恢复视线
   * - 邻近地图边缘 → 施加朝向场内的排斥力（稳定，不会来回抖）
   * - 卡住 → 翻转游走方向，但带冷却（避免每 6 帧翻一次、原地抽搐）
   */
  private decideMovement(
    state: BattleState,
    self: PlayerState,
    target: PlayerState,
    memory: AiMemory,
    distance: number,
    canSeeTarget: boolean,
  ): { x: number; y: number } {
    // 卡住检测：这一帧的实际位移远小于"应该走的距离"就累加
    const moved = Math.hypot(self.x - memory.lastX, self.y - memory.lastY);
    const expected = (self.stats.moveSpeed * (1000 / 30)) / 1000;
    memory.stuckFrames = moved < expected * 0.15 ? memory.stuckFrames + 1 : 0;
    memory.lastX = self.x;
    memory.lastY = self.y;

    // 卡住超过约 0.2 秒：翻转游走方向；加 500ms 冷却，避免两堵墙之间来回抽搐
    if (memory.stuckFrames >= 6 && state.timeMs - memory.lastDetourMs >= 500) {
      memory.strafeDirection = memory.strafeDirection === 1 ? -1 : 1;
      memory.lastDetourMs = state.timeMs;
      memory.stuckFrames = 0;
    }

    const toTargetX = target.x - self.x;
    const toTargetY = target.y - self.y;
    const length = Math.max(1, Math.hypot(toTargetX, toTargetY));
    const dirX = toTargetX / length;
    const dirY = toTargetY / length;

    // 侧向方向不靠"撞墙后翻转"来选，而是**先看哪边有空间**：
    // 垂直于连线的两个方向各探一次，选空间大的那侧。
    // 这样 AI 不会一直朝墙里侧移、然后被卡在原地（那是"站着对枪"的根因）。
    const perpBaseX = -dirY;
    const perpBaseY = dirX;
    const roomPositive = this.freeDistance(state, self, perpBaseX, perpBaseY, 120);
    const roomNegative = this.freeDistance(state, self, -perpBaseX, -perpBaseY, 120);
    if (roomPositive > roomNegative + 12) {
      memory.strafeDirection = 1;
    } else if (roomNegative > roomPositive + 12) {
      memory.strafeDirection = -1;
    }

    const perpX = perpBaseX * memory.strafeDirection;
    const perpY = perpBaseY * memory.strafeDirection;

    let forward = 0;
    if (!canSeeTarget) {
      // 看不见目标就先朝它走：隔墙原地转圈没有任何意义
      forward = 1;
    } else if (distance > this.skill.preferredRange + this.skill.rangeTolerance) {
      forward = 1;
    } else if (distance < this.skill.preferredRange - this.skill.rangeTolerance) {
      forward = -1;
    }

    // 侧向权重：
    // - 看得见 → 0.75（积极对枪走位）
    // - 看不见 → 0.6（斜着往目标走；轴分离碰撞会让它沿墙滑行，从而绕过掩体）
    //   之前这里给 0.15，几乎是直线推进，一顶到墙上就卡死 —— 那正是 AI 不开火的根因。
    const strafeWeight = canSeeTarget ? 0.75 : 0.6;
    let moveX = dirX * forward + perpX * strafeWeight;
    let moveY = dirY * forward + perpY * strafeWeight;

    // 边缘排斥力：离边界越近，向内推力越强。
    // 用固定的向内分量代替"翻转游走方向"——后者在贴着边界时每帧都会触发，
    // 结果是原地来回抖（这是之前的 bug）。
    const margin = 96;
    const push = 2;
    if (self.x < margin) {
      moveX += push * (1 - self.x / margin);
    } else if (self.x > state.mapWidth - margin) {
      moveX -= push * (1 - (state.mapWidth - self.x) / margin);
    }
    if (self.y < margin) {
      moveY += push * (1 - self.y / margin);
    } else if (self.y > state.mapHeight - margin) {
      moveY -= push * (1 - (state.mapHeight - self.y) / margin);
    }

    const magnitude = Math.max(1, Math.hypot(moveX, moveY));
    // 最后一步：如果期望方向正对墙体，就依次尝试左右偏转，选第一个通路方向。
    // 这是最便宜的"绕障"做法（不需要 A*），但足以让 AI 绕过掩体重新拿到视线。
    return this.steerAroundWalls(state, self, moveX / magnitude, moveY / magnitude);
  }

  /**
   * 从当前位置沿给定方向能走多远（最多 maxDistance）。
   * 用固定步长连续试探，遇到墙体或地图边界就停。用于判断"哪一侧更有空间"。
   */
  private freeDistance(
    state: BattleState,
    self: PlayerState,
    dirX: number,
    dirY: number,
    maxDistance: number,
  ): number {
    const step = 12;
    const inset = self.stats.bodyRadius + 2;
    let distance = 0;

    for (let travelled = step; travelled <= maxDistance; travelled += step) {
      const x = self.x + dirX * travelled;
      const y = self.y + dirY * travelled;
      if (
        x < inset ||
        y < inset ||
        x > state.mapWidth - inset ||
        y > state.mapHeight - inset ||
        isPointInRects(state.walls, x, y)
      ) {
        break;
      }
      distance = travelled;
    }

    return distance;
  }

  /**
   * 前方被墙挡住时，把方向依次左右偏转，取第一个能走的方向。
   *
   * 为什么需要：轴分离碰撞只能让角色"贴着墙滑"，如果期望方向是正对墙（法线方向），
   * 滑动分量为 0，AI 就会一直顶着墙不动 —— 实测表现是"走到掩体后面就不动了、也不开枪"。
   * 逐个偏转角试探（每档 20°，最多 ±120°）能自然绕开矩形掩体。
   */
  private steerAroundWalls(
    state: BattleState,
    self: PlayerState,
    dirX: number,
    dirY: number,
  ): { x: number; y: number } {
    const baseAngle = Math.atan2(dirY, dirX);
    const probeDistance = 56;
    const offsets = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.75, -1.75, 2.1, -2.1];

    for (const offset of offsets) {
      const angle = baseAngle + offset;
      const probeX = self.x + Math.cos(angle) * probeDistance;
      const probeY = self.y + Math.sin(angle) * probeDistance;

      // 探针点必须在地图内、不在墙里，且从当前位置到探针点不被墙挡
      const inset = self.stats.bodyRadius + 2;
      if (
        probeX < inset ||
        probeY < inset ||
        probeX > state.mapWidth - inset ||
        probeY > state.mapHeight - inset
      ) {
        continue;
      }
      if (isPointInRects(state.walls, probeX, probeY)) {
        continue;
      }
      if (!hasLineOfSight(state.walls, self.x, self.y, probeX, probeY)) {
        continue;
      }
      return { x: Math.cos(angle), y: Math.sin(angle) };
    }

    // 四面都被挡住（几乎不可能）：保持原方向，交给碰撞分离处理
    return { x: dirX, y: dirY };
  }

  /** 取（或初始化）某个 AI 的记忆 */
  private memoryFor(self: PlayerState): AiMemory {
    let memory = this.memories.get(self.id);
    if (!memory) {
      memory = {
        lastAimUpdateMs: -Infinity,
        targetX: self.x,
        targetY: self.y,
        // 用 id 做相位：多个 AI 不会同步抖动
        jitterPhase: self.id * 1.7,
        strafeDirection: self.id % 2 === 0 ? 1 : -1,
        lastX: self.x,
        lastY: self.y,
        stuckFrames: 0,
        lastDetourMs: -Infinity,
      };
      this.memories.set(self.id, memory);
    }
    return memory;
  }
}

/** 把角度归一到 [-π, π]，用于比较两个方向的夹角 */
function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) {
    result -= Math.PI * 2;
  }
  while (result < -Math.PI) {
    result += Math.PI * 2;
  }
  return result;
}
