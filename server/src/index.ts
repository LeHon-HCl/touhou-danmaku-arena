import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { PROTOCOL_VERSION, parseClientMessage, sanitizeInput } from '../../shared/src';
import type { BattleConfig, ServerMessage } from '../../shared/src';
import type { Room } from './room';
import { countRooms, getOrCreateRoom } from './rooms';

/**
 * 服务端入口。
 *
 * 只做四件事（tech-design 5.1）：WebSocket 连接、房间管理、30Hz tick（在 Room 里）、快照广播。
 * 战斗判定一律在 shared/step() —— 与离线练习场是同一份代码，这是本项目最重要的约束。
 */

const PORT = Number(process.env.PORT ?? 8080);

/** 配置加载：只校验三项（存在 / 可解析 / 有 version），不引 schema（dev-conventions 6.6.3） */
function loadConfig(): { config: BattleConfig; version: string } {
  const configPath = resolve('config/game-config.json');

  if (!existsSync(configPath)) {
    console.error(`找不到数值配置：${configPath}`);
    console.error('请先运行：npm run build:config');
    process.exit(1);
  }

  let parsed: { version?: string; config?: BattleConfig };
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf8')) as { version?: string; config?: BattleConfig };
  } catch (error) {
    console.error(`数值配置解析失败：${configPath}`, error);
    process.exit(1);
  }

  if (!parsed.version || !parsed.config) {
    console.error(`数值配置缺少 version 或 config 字段：${configPath}（构建脚本跑错了吗？）`);
    process.exit(1);
  }

  return { config: parsed.config, version: parsed.version };
}

const { config, version } = loadConfig();

const server = new WebSocketServer({ port: PORT });

console.log(`服务端已启动：ws://localhost:${PORT}`);
console.log(`数值配置版本：${version}`);

server.on('listening', () => {
  console.log(`等待客户端连接（当前房间数 ${countRooms()}）`);
});

server.on('connection', (socket: WebSocket) => {
  let room: Room | null = null;
  let playerId = 0;

  const send = (message: ServerMessage): void => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  socket.on('message', (raw) => {
    const message = parseClientMessage(String(raw));
    if (!message) {
      return;
    }

    if (message.type === 'join') {
      if (message.version !== PROTOCOL_VERSION) {
        send({ type: 'error', message: `协议版本不一致（服务端 ${PROTOCOL_VERSION}，客户端 ${message.version}）` });
        socket.close();
        return;
      }

      const targetRoom = getOrCreateRoom(message.room || 'test', config, version);
      room = targetRoom;
      playerId = targetRoom.join(socket, message.nickname || `玩家${Date.now() % 1000}`, message.characterId);
      return;
    }

    if (message.type === 'input' && room && playerId > 0) {
      // 客户端发来的任何数字都不可信：先清洗再进世界
      room.setInput(playerId, sanitizeInput(message.input));
      return;
    }

    if (message.type === 'leave' && room && playerId > 0) {
      room.leave(playerId);
      room = null;
      playerId = 0;
    }
  });

  socket.on('close', () => {
    if (room && playerId > 0) {
      room.leave(playerId);
    }
  });

  socket.on('error', (error) => {
    console.error('连接异常：', error.message);
  });
});
