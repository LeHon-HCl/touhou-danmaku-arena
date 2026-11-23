/**
 * 用纯代码合成 16bit PCM WAV 音频。
 *
 * 为什么不用素材文件：
 * 1. 现在还没有音频素材（art-spec 8.2 的音效清单仍在待定），但打击感离不开声音；
 * 2. 合成音频体积几乎为 0，也不需要走网络请求，本地第一次跑就能听到声音；
 * 3. 将来换成 CC0 素材时，只要把 AudioManager 里的「生成 WAV」换成 load.audio，其余代码不变。
 *
 * WAV 是最简单的音频格式：开头 44 字节是文件头（说明采样率、声道数、位深等），
 * 后面紧跟一段原始采样数据。这里就是按这个结构一块一块写进去的。
 */

/** 合成一个音色的参数 */
export interface ToneOptions {
  /** 时长（秒）。建议 0.05–0.4，太长会盖住别的音效 */
  durationSeconds: number;
  /**
   * 采样函数：给出当前时刻 t（秒）与进度 progress（0–1），返回 -1 到 1 之间的振幅。
   * 返回值超过 ±1 会被截断，所以不用自己担心破音。
   */
  sample: (t: number, progress: number) => number;
  /** 采样率（Hz）。默认 22050，对短促音效足够，体积也只有 44.1k 的一半 */
  sampleRate?: number;
}

const DEFAULT_SAMPLE_RATE = 22050;
const BYTES_PER_SAMPLE = 2; // 16bit = 2 字节
const WAV_HEADER_BYTES = 44;

/** 合成一段音频并返回 WAV 文件的二进制数据（ArrayBuffer），可直接交给 sound.decodeAudio */
export function createWavBuffer(options: ToneOptions): ArrayBuffer {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const totalSamples = Math.floor(sampleRate * options.durationSeconds);
  const dataSize = totalSamples * BYTES_PER_SAMPLE;

  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataSize);
  const view = new DataView(buffer);

  // ---- 1. 写 44 字节的文件头 ----
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // 后面还有多少字节
  writeAscii(view, 8, 'WAVE');

  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt 段长度，PCM 固定 16
  view.setUint16(20, 1, true); // 1 = 未压缩 PCM
  view.setUint16(22, 1, true); // 1 = 单声道
  view.setUint32(24, sampleRate, true); // 采样率
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true); // 每秒字节数
  view.setUint16(32, BYTES_PER_SAMPLE, true); // 每帧字节数
  view.setUint16(34, 16, true); // 位深

  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // ---- 2. 逐个采样点写入振幅 ----
  let offset = WAV_HEADER_BYTES;
  for (let index = 0; index < totalSamples; index += 1) {
    const t = index / sampleRate;
    const progress = index / totalSamples;
    const rawValue = options.sample(t, progress);
    const clamped = Math.max(-1, Math.min(1, rawValue));
    // 16bit 有符号整数的范围是 -32768..32767
    view.setInt16(offset, clamped * 0x7fff, true);
    offset += BYTES_PER_SAMPLE;
  }

  return buffer;
}

/** 按 ASCII 写四个字节（RIFF / WAVE / fmt / data 这些标记） */
function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

/**
 * 起音包络：让声音从 0 快速升到最大，避免开头「啪」的一声爆音。
 * 返回值 0–1。
 */
export function attackEnvelope(t: number, speed = 300): number {
  return Math.min(1, t * speed);
}

/** 生成 -1..1 的白噪声，用来做打击类的「沙沙」质感 */
export function whiteNoise(): number {
  return Math.random() * 2 - 1;
}
