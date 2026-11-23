import type { BattleConfig } from '../../shared/src';
import { Room } from './room';

/**
 * 房间注册表。
 *
 * 规模很小（预期同时 1–3 个房间），所以就是一个 Map，不做持久化：
 * 进程重启房间丢失可以接受（README 已写明）。
 */
const rooms = new Map<string, Room>();

/** 取房间；没有就创建 */
export function getOrCreateRoom(code: string, config: BattleConfig, configVersion: string): Room {
  const existing = rooms.get(code);
  if (existing) {
    return existing;
  }

  const room = new Room(code, config, configVersion, () => rooms.delete(code));
  rooms.set(code, room);
  return room;
}

/** 当前房间数（给启动日志与调试用） */
export function countRooms(): number {
  return rooms.size;
}
