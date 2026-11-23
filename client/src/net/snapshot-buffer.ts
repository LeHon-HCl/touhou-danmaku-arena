import type { WorldSnapshot } from '@shared';

/** 带到达时间的快照 */
interface TimedSnapshot {
  atMs: number;
  snapshot: WorldSnapshot;
}

/** 保留最近多少个快照（30Hz 下 20 个约 0.66 秒，足够插值用） */
const MAX_ENTRIES = 20;

/**
 * 快照缓冲与插值。
 *
 * 为什么需要它：服务端 30Hz 发快照，屏幕 60Hz 渲染。
 * 如果直接拿"最新快照"画，画面会每两帧跳一次（30Hz 的抖动）。
 * 标准做法是延迟一段时间再播放：渲染时刻取"90ms 前"，在前后两个快照之间做线性插值，
 * 这样画面始终平滑，代价是别人看到你的位置比真实晚约 90ms —— 这正是 tech-design 4.4 的取舍。
 */
export class SnapshotBuffer {
  private readonly entries: TimedSnapshot[] = [];

  push(atMs: number, snapshot: WorldSnapshot): void {
    this.entries.push({ atMs, snapshot });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.shift();
    }
  }

  /**
   * 取 renderAtMs 时刻的插值快照。
   * - 比所有快照都新：返回最新那份（网络卡顿时不要让画面停住）
   * - 比所有快照都旧：返回最旧那份
   */
  sample(renderAtMs: number): WorldSnapshot | null {
    if (this.entries.length === 0) {
      return null;
    }
    if (this.entries.length === 1) {
      return this.entries[0].snapshot;
    }

    const newest = this.entries[this.entries.length - 1];
    const oldest = this.entries[0];
    if (renderAtMs >= newest.atMs) {
      return newest.snapshot;
    }
    if (renderAtMs <= oldest.atMs) {
      return oldest.snapshot;
    }

    // 找到夹住 renderAtMs 的两个快照
    for (let index = 0; index < this.entries.length - 1; index += 1) {
      const from = this.entries[index];
      const to = this.entries[index + 1];
      if (renderAtMs < from.atMs || renderAtMs > to.atMs) {
        continue;
      }
      const span = to.atMs - from.atMs;
      const alpha = span <= 0 ? 1 : (renderAtMs - from.atMs) / span;
      return interpolateSnapshots(from.snapshot, to.snapshot, alpha);
    }

    return newest.snapshot;
  }
}

/** 在两个快照之间插值：位置做线性插值，其余数值取较新的那份 */
function interpolateSnapshots(
  from: WorldSnapshot,
  to: WorldSnapshot,
  alpha: number,
): WorldSnapshot {
  const lerp = (a: number, b: number): number => a + (b - a) * alpha;

  const toPlayersById = new Map(to.players.map((player) => [player.id, player]));
  const fromBulletsById = new Map(from.bullets.map((bullet) => [bullet.id, bullet]));

  return {
    tick: to.tick,
    timeMs: to.timeMs,
    isFinished: to.isFinished,
    players: to.players.map((player) => {
      const previous = toPlayersById.has(player.id)
        ? from.players.find((candidate) => candidate.id === player.id)
        : undefined;
      if (!previous) {
        // 新出现的单位（比如刚入房）没有可插值的起点，直接用最新位置
        return player;
      }
      return {
        ...player,
        x: lerp(previous.x, player.x),
        y: lerp(previous.y, player.y),
      };
    }),
    bullets: to.bullets.map((bullet) => {
      const previous = fromBulletsById.get(bullet.id);
      if (!previous) {
        return bullet;
      }
      return { ...bullet, x: lerp(previous.x, bullet.x), y: lerp(previous.y, bullet.y) };
    }),
    // 道具不会动，直接取最新的
    pickups: to.pickups,
  };
}
