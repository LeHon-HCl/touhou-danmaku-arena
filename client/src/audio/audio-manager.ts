import Phaser from 'phaser';
import { attackEnvelope, createWavBuffer, whiteNoise } from './wav-synth';

/**
 * 占位音效管理器。
 *
 * 三件事：
 * 1. 启动时用代码合成几个短音效并解码进 Phaser 的音频缓存（不依赖素材文件）；
 * 2. 播放时按「声源位置 vs 玩家位置」算左右声道偏移与音量衰减，
 *    满足需求 8.2「完整 2D 定位音效」——屏幕外有人开枪能听出方向；
 * 3. 对同一音效做最小间隔限流，避免连射时几十个声音叠在一起变成噪音。
 *
 * 说明：左右声道与距离衰减依赖 Web Audio 后端（Phaser 会自动优先选它）。
 * 若浏览器退回到 HTML5 Audio 后端，pan 不会生效（这是该后端的已知限制）。
 */

/** 音效 key，全项目统一在这里定义 */
export const SFX = {
  shoot: 'sfx_shoot',
  hit: 'sfx_hit',
  shieldBreak: 'sfx_shield_break',
  death: 'sfx_death',
  hurt: 'sfx_hurt',
  pickup: 'sfx_pickup',
} as const;

export type SfxKey = (typeof SFX)[keyof typeof SFX];

/** 存入 Phaser 全局 registry 时用的键名（registry 相当于一个跨场景共享的储物柜） */
export const AUDIO_REGISTRY_KEY = 'audioManager';

/** 每个音效的基础音量，避免单独调参时改到播放代码 */
const BASE_VOLUME: Record<SfxKey, number> = {
  [SFX.shoot]: 0.32,
  [SFX.hit]: 0.45,
  [SFX.shieldBreak]: 0.5,
  [SFX.death]: 0.65,
  [SFX.hurt]: 0.6,
  [SFX.pickup]: 0.5,
};

/** 同一音效两次播放的最小间隔（毫秒），防止叠成一团噪音 */
const MIN_INTERVAL_MS: Record<SfxKey, number> = {
  [SFX.shoot]: 55,
  [SFX.hit]: 35,
  [SFX.shieldBreak]: 120,
  [SFX.death]: 150,
  [SFX.hurt]: 150,
  [SFX.pickup]: 120,
};

/** 播放参数 */
export interface PlaySfxOptions {
  /** 声源世界坐标 X；不传则按「无定位」播放 */
  x?: number;
  /** 声源世界坐标 Y */
  y?: number;
  /** 播放速率倍数，1 为原速；轻微随机可以让连续射击不呆板 */
  rate?: number;
  /** 覆盖基础音量（0–1） */
  volume?: number;
}

export class AudioManager {
  private readonly lastPlayedAt = new Map<SfxKey, number>();
  private listenerX = 0;
  private listenerY = 0;
  private isReady = false;
  private readonly hasWebAudio: boolean;

  constructor(private readonly scene: Phaser.Scene) {
    // HTML5 兜底后端没有 context 与 decodeAudio，此时直接静音，不影响游戏运行
    this.hasWebAudio =
      typeof (scene.sound as Phaser.Sound.WebAudioSoundManager).context !== 'undefined';
  }

  /**
   * 合成并解码全部音效。
   * BootScene 会等它完成再进对局，避免第一枪打出去没声音。
   */
  async prepare(): Promise<void> {
    if (!this.hasWebAudio) {
      return;
    }

    const definitions = [
      {
        key: SFX.shoot,
        data: createWavBuffer({
          durationSeconds: 0.1,
          // 频率快速下滑 + 一点噪声，听起来像「啾」的激光
          sample: (t) => {
            const chirp = Math.sin(2 * Math.PI * (900 * t - 4000 * t * t));
            const noise = whiteNoise() * 0.25;
            return (chirp + noise) * Math.exp(-t * 34) * attackEnvelope(t, 400) * 0.55;
          },
        }),
      },
      {
        key: SFX.hit,
        data: createWavBuffer({
          durationSeconds: 0.07,
          // 短噪声 + 高频 ping，像打到硬物
          sample: (t) => {
            const noise = whiteNoise() * 0.8;
            const ping = Math.sin(2 * Math.PI * 2100 * t) * 0.4;
            return (noise + ping) * Math.exp(-t * 70) * attackEnvelope(t, 500) * 0.6;
          },
        }),
      },
      {
        key: SFX.shieldBreak,
        data: createWavBuffer({
          durationSeconds: 0.22,
          // 高频下滑，像玻璃/护盾碎裂
          sample: (t) => {
            const frequency = 1500 * Math.exp(-t * 12);
            const tone = Math.sin(2 * Math.PI * frequency * t);
            return tone * Math.exp(-t * 16) * attackEnvelope(t, 400) * 0.55;
          },
        }),
      },
      {
        key: SFX.death,
        data: createWavBuffer({
          durationSeconds: 0.35,
          // 低频下坠的方波 + 噪声，像"倒下"
          sample: (t) => {
            const frequency = 320 * Math.exp(-t * 6);
            const square = Math.sign(Math.sin(2 * Math.PI * frequency * t));
            return (
              (square * 0.35 + whiteNoise() * 0.15) *
              Math.exp(-t * 7) *
              attackEnvelope(t, 200) *
              0.8
            );
          },
        }),
      },
      {
        key: SFX.hurt,
        data: createWavBuffer({
          durationSeconds: 0.18,
          sample: (t) => {
            const frequency = 200 * Math.exp(-t * 8);
            const square = Math.sign(Math.sin(2 * Math.PI * frequency * t));
            return square * Math.exp(-t * 14) * attackEnvelope(t, 300) * 0.45;
          },
        }),
      },
      {
        key: SFX.pickup,
        data: createWavBuffer({
          durationSeconds: 0.16,
          // 两个音高叠在一起往上跳，听起来像"拿到了好东西"
          sample: (t) => {
            const first = Math.sin(2 * Math.PI * 660 * t);
            const second = Math.sin(2 * Math.PI * 990 * t) * 0.6;
            return (first + second) * Math.exp(-t * 16) * attackEnvelope(t, 500) * 0.4;
          },
        }),
      },
    ];

    await new Promise<void>((resolve) => {
      // Phaser 的 sound 是三选一的联合类型，只有 WebAudio 后端才有 decodeAudio，
      // 上面 hasWebAudio 已经做过判断，这里做一次类型收窄即可
      const manager = this.scene.sound as Phaser.Sound.WebAudioSoundManager;

      let isSettled = false;
      const settle = (): void => {
        if (isSettled) {
          return;
        }
        isSettled = true;
        resolve();
      };

      // decodeAudio 是异步的，全部解码完会抛 'decodedall'
      manager.once('decodedall', settle);

      try {
        manager.decodeAudio(definitions);
      } catch (error) {
        // 任何异常都不要让启动流程挂住：静音也能玩
        console.error('音效解码失败：', error);
        settle();
        return;
      }

      // 兜底：万一 'decodedall' 没来（后端切换/解码异常），1.5 秒后也放行
      this.scene.time.delayedCall(1500, settle);
    });

    this.isReady = true;
  }

  /** 每帧更新"听者"位置（就是本地玩家的位置），定位计算以它为中心 */
  updateListener(x: number, y: number): void {
    this.listenerX = x;
    this.listenerY = y;
  }

  /** 播放一个音效 */
  play(key: SfxKey, options: PlaySfxOptions = {}): void {
    if (!this.isReady) {
      return;
    }

    // 限流：同一音效在极短时间内重复触发时直接丢掉
    const now = this.scene.time.now;
    const lastPlayedAt = this.lastPlayedAt.get(key) ?? -Infinity;
    if (now - lastPlayedAt < MIN_INTERVAL_MS[key]) {
      return;
    }
    this.lastPlayedAt.set(key, now);

    const config: Phaser.Types.Sound.SoundConfig = {
      volume: options.volume ?? BASE_VOLUME[key],
      rate: options.rate ?? 1,
    };

    if (options.x !== undefined && options.y !== undefined) {
      const deltaX = options.x - this.listenerX;
      const deltaY = options.y - this.listenerY;
      const distance = Math.hypot(deltaX, deltaY);

      // 横向距离映射到 -1（全左）到 1（全右）
      config.pan = Phaser.Math.Clamp(deltaX / 320, -1, 1);
      // 距离衰减：越远越轻；保底 12%，这样屏幕外很远处的枪声仍能听见
      const attenuation = Phaser.Math.Clamp(1 - distance / 900, 0.12, 1);
      config.volume = (options.volume ?? BASE_VOLUME[key]) * attenuation;
    }

    this.scene.sound.play(key, config);
  }
}
