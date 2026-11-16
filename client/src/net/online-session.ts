import type { CharacterId, ClientMessage, PlayerInput, PlayerScore, ServerMessage } from '@shared';
import { PROTOCOL_VERSION } from '@shared';
import type { WorldSnapshot } from '@shared';
import { SnapshotBuffer } from './snapshot-buffer';

export interface ConnectOptions {
  /** WebSocket 地址，例如 ws://localhost:8080 */
  url: string;
  /** 房间号。同一房间的人才会互相看见 */
  room: string;
  nickname: string;
  characterId: CharacterId;
}

/**
 * 联机会话：只负责"收发字节"，不负责判定。
 *
 * 上行：每 33ms 发一次输入意图（tech-design 4.4：30Hz 上行）。
 * 下行：服务端 30Hz 推快照，这里存进 SnapshotBuffer 供渲染层插值。
 *
 * 为什么不做子弹预测：tech-design ADR-8 已经定了只预测自己的移动。
 * 预测子弹要额外处理"服务端拒绝了这批子弹"，复杂度不划算。
 */
export class OnlineSession {
  /** 服务端分配的玩家 id（入房后才知道） */
  playerId = 0;
  /** 服务端当前加载的数值配置版本（只用于日志排查） */
  configVersion = '';
  /** 本局结算数据（收到 matchEnd 后才有） */
  finalScores: Array<{ playerId: number; score: PlayerScore }> = [];

  private readonly buffer = new SnapshotBuffer();
  private socket: WebSocket | null = null;

  /** 连接并发起入房；失败会抛错（调用方负责提示玩家） */
  async connect(options: ConnectOptions): Promise<void> {
    const socket = new WebSocket(options.url);
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`连接超时：${options.url}（服务端启动了吗？）`));
      }, 5000);

      socket.addEventListener('open', () => {
        const joinMessage: ClientMessage = {
          type: 'join',
          version: PROTOCOL_VERSION,
          room: options.room,
          nickname: options.nickname,
          characterId: options.characterId,
        };
        socket.send(JSON.stringify(joinMessage));
      });

      socket.addEventListener('message', (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }

        if (message.type === 'welcome') {
          this.playerId = message.playerId;
          this.configVersion = message.configVersion;
          clearTimeout(timeout);
          resolve();
        } else if (message.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(message.message));
        } else {
          this.handleMessage(message);
        }
      });

      socket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error(`无法连接服务端：${options.url}`));
      });

      socket.addEventListener('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  private handleMessage(message: ServerMessage): void {
    if (message.type === 'snapshot') {
      this.buffer.push(performance.now(), message.snapshot);
    } else if (message.type === 'matchEnd') {
      this.finalScores = message.scores;
    }
  }

  /** 发送本帧的输入意图 */
  sendInput(input: PlayerInput): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const message: ClientMessage = { type: 'input', input };
    this.socket.send(JSON.stringify(message));
  }

  /** 取用于渲染的插值快照；delayMs 是"往后延迟多久播放"，用来换平滑 */
  sampleSnapshot(delayMs = 90): WorldSnapshot | null {
    return this.buffer.sample(performance.now() - delayMs);
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }
}
