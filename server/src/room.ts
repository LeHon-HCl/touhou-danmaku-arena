import { WebSocket } from 'ws';
import {
  addPlayer,
  createBattleState,
  createSnapshot,
  removePlayer,
  step,
} from '../../shared/src';
import type {
  BattleConfig,
  BattleState,
  CharacterId,
  PlayerInput,
  ServerMessage,
} from '../../shared/src';
import { appendMatchLog } from './log';

/** 逻辑帧间隔：30Hz，与服务端/客户端约定一致（tech-design 4.4） */
const TICK_MS = 1000 / 30;

/** 单局时长。可用环境变量 MATCH_SECONDS 覆盖，方便本地测试 */
const MATCH_DURATION_MS = Number(process.env.MATCH_SECONDS ?? 180) * 1000;

interface ClientEntry {
  socket: WebSocket;
  nickname: string;
}

/**
 * 一个房间（tech-design 第 5 章：自研薄房间层）。
 *
 * 职责只有四件：收输入、30Hz 推进 `shared/step()`、广播全量快照、结束写日志。
 * 刻意不做的事：不做增量同步、不做延迟补偿回溯、不做持久化
 * —— 都是技术方案里明确的取舍，理由见 docs/tech-design.md 第 4 章。
 */
export class Room {
  readonly code: string;
  private readonly config: BattleConfig;
  private readonly configVersion: string;
  private readonly state: BattleState;
  private readonly inputs = new Map<number, PlayerInput>();
  private readonly clients = new Map<number, ClientEntry>();
  private nextPlayerId = 1;
  private spawnIndex = 0;
  private timer: NodeJS.Timeout | null = null;
  private isMatchStarted = false;
  private isOver = false;
  private readonly startedAt = new Date();

  constructor(
    code: string,
    config: BattleConfig,
    configVersion: string,
    private readonly onDestroy: () => void,
  ) {
    this.code = code;
    this.config = config;
    this.configVersion = configVersion;

    // 联机房间没有假人：真实玩家之间的对战。开局预置几个道具。
    this.state = createBattleState(config, {
      dummyCount: 0,
      seedPickups: 3,
      matchDurationMs: MATCH_DURATION_MS,
    });
    // 房间从"空世界"开始，玩家在 join 时才加进来
    this.state.players = [];

    // 服务端自己跑定时器推进世界（客户端不推进）
    this.timer = setInterval(() => this.tick(), TICK_MS);
    console.log(`[房间 ${code}] 已创建，数值配置版本 ${configVersion}`);
  }

  get isEmpty(): boolean {
    return this.clients.size === 0;
  }

  /** 有人入房：分配 id、放进世界、回 welcome + 一份即时快照 */
  join(socket: WebSocket, nickname: string, characterId: CharacterId): number {
    const playerId = this.nextPlayerId;
    this.nextPlayerId += 1;

    this.clients.set(playerId, { socket, nickname });
    addPlayer(this.state, this.config, playerId, characterId, this.spawnIndex);
    this.spawnIndex += 1;

    this.sendTo(playerId, {
      type: 'welcome',
      playerId,
      room: this.code,
      configVersion: this.configVersion,
    });
    this.sendTo(playerId, { type: 'snapshot', snapshot: createSnapshot(this.state) });

    // 第二个人进来才正式开局计时，否则单人在房间里干等会把比赛"耗光"
    if (!this.isMatchStarted && this.clients.size >= 2) {
      this.isMatchStarted = true;
      this.state.matchEndsAtMs = this.state.timeMs + MATCH_DURATION_MS;
      console.log(`[房间 ${this.code}] 对局开始（${this.clients.size} 人）`);
    }

    console.log(`[房间 ${this.code}] 玩家 ${playerId}（${nickname}）入房，当前 ${this.clients.size} 人`);
    return playerId;
  }

  /** 收到某个玩家的输入意图 */
  setInput(playerId: number, input: PlayerInput): void {
    this.inputs.set(playerId, input);
  }

  /** 玩家离开（主动退出或断线） */
  leave(playerId: number): void {
    if (!this.clients.has(playerId)) {
      return;
    }
    removePlayer(this.state, playerId);
    this.clients.delete(playerId);
    this.inputs.delete(playerId);
    console.log(`[房间 ${this.code}] 玩家 ${playerId} 离开，当前 ${this.clients.size} 人`);

    if (this.isEmpty) {
      this.destroy();
    }
  }

  /** 每个逻辑帧：推进世界 → 广播快照 → 判断是否结束 */
  private tick(): void {
    if (this.isOver) {
      return;
    }

    step(this.state, this.inputs, this.config);
    this.broadcast({ type: 'snapshot', snapshot: createSnapshot(this.state) });

    if (this.state.isFinished) {
      this.finish();
    }
  }

  /** 对局结束：广播结算、写日志、停表 */
  private finish(): void {
    this.isOver = true;

    const scores = this.state.players.map((player) => ({
      playerId: player.id,
      score: { ...player.score },
    }));
    this.broadcast({ type: 'matchEnd', scores });

    const endedAt = new Date();
    void appendMatchLog({
      startedAt: this.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      room: this.code,
      configVersion: this.configVersion,
      durationMs: endedAt.getTime() - this.startedAt.getTime(),
      players: this.state.players.map((player) => ({
        playerId: player.id,
        nickname: this.clients.get(player.id)?.nickname ?? '未知',
        kills: player.score.kills,
        deaths: player.score.deaths,
      })),
    });

    console.log(
      `[房间 ${this.code}] 对局结束：` +
        this.state.players
          .map((player) => `${this.clients.get(player.id)?.nickname ?? player.id}=${player.score.kills}杀`)
          .join(' '),
    );

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private broadcast(message: ServerMessage): void {
    for (const playerId of this.clients.keys()) {
      this.sendTo(playerId, message);
    }
  }

  private sendTo(playerId: number, message: ServerMessage): void {
    const entry = this.clients.get(playerId);
    if (!entry || entry.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    entry.socket.send(JSON.stringify(message));
  }

  private destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log(`[房间 ${this.code}] 已空，销毁`);
    this.onDestroy();
  }
}
