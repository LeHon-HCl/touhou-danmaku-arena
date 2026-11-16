import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/**
 * 对局日志（需求 10.7）。
 *
 * 只做"每局追加一行 JSON"，不做汇总报表、不做可视化。
 * 将来想统计角色胜率，写个脚本聚合这些行就行。
 *
 * 两条硬要求：
 * - 追加写入，不覆盖历史；
 * - 写入必须异步且失败不影响对局（打日志把服务器搞崩就太蠢了）。
 */
const logPath = resolve('logs/matches.log');

export interface MatchLogEntry {
  startedAt: string;
  endedAt: string;
  room: string;
  configVersion: string;
  durationMs: number;
  players: Array<{ playerId: number; nickname: string; kills: number; deaths: number }>;
}

/** 追加一条对局日志；失败只在控制台提示，不抛错 */
export async function appendMatchLog(entry: MatchLogEntry): Promise<void> {
  try {
    await mkdir(dirname(logPath), { recursive: true });
    await appendFile(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (error) {
    console.error('写入对局日志失败（不影响对局）：', error);
  }
}
