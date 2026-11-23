import type Phaser from 'phaser';
import type { AudioAsset, ImageAsset } from './manifest';

/**
 * 加载 `assets/` 下的真实素材。
 *
 * 为什么不用 Phaser 自带的 `this.load.image()`：
 * 那套 Loader 把「文件不存在」当成错误事件，占位素材还没做的时候，
 * 每次启动刷一屏红色报错，而这里的语义是「没文件是正常情况」。
 * 这里用 fetch/img 自己判断存在与否，缺失就静默跳过，交给占位图/合成音兜底。
 *
 * 为了少让换素材的人被细节绊住，还额外做了三件事：
 * 1. 清单写 `xxx.png`、实际存成 `xxx.jpg` / `xxx.webp` 也能读到（同名文件逐个换扩展名）；
 * 2. 尺寸与清单不符时等比缩放居中到目标尺寸，而不是按原图铺满整屏；
 * 3. 文件名里的空格、中文等字符先做 URL 转义再请求。
 */

/** 认识的图片扩展名，按优先级排列；清单里写的扩展名永远排在最前 */
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp'];

/** 认识的音频扩展名，同上 */
const AUDIO_EXTENSIONS = ['ogg', 'mp3', 'wav', 'm4a', 'aac'];

export interface AssetLoadReport {
  /** 成功从文件加载的图片 key */
  loadedImages: string[];
  /** 没有文件、需要用占位图的图片 key */
  missingImages: string[];
  /** 成功从文件加载的音频 key */
  loadedAudio: string[];
  /** 没有文件、需要用合成音的音频 key */
  missingAudio: string[];
  /** 尺寸与清单不符的告警（仍然会加载，只是提示换图） */
  sizeWarnings: string[];
  /** 清单路径不存在、但同名其它格式读到了（仍然算加载成功，只做提示） */
  substitutions: string[];
}

/**
 * 把相对 assets/ 的路径变成浏览器 URL。
 * 文件名里的空格、中文等字符要先转义，否则部分浏览器/静态服务器会读不到。
 */
function toUrl(file: string): string {
  const path = file
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => (/^[\w.~-]+$/.test(segment) ? segment : encodeURIComponent(segment)))
    .join('/');
  return `/${path}`;
}

/**
 * 生成一个素材路径的候选列表：清单里写的路径优先，然后是同名文件的其它扩展名。
 *
 * 这样「清单写 `char_reimu.png`、实际存成 `char_reimu.jpg`」也能被读到，
 * 不会因为导出格式不同就整张图回退成占位图。文件名（不含扩展名）仍需一致。
 */
export function candidateFiles(file: string, extensions: readonly string[]): string[] {
  const clean = file.replace(/^\/+/, '');
  const slash = clean.lastIndexOf('/');
  const dot = clean.lastIndexOf('.');
  const hasExtension = dot > slash;
  const base = hasExtension ? clean.slice(0, dot) : clean;
  const declared = hasExtension ? clean.slice(dot + 1) : '';

  const candidates: string[] = [];
  const push = (candidate: string): void => {
    if (candidate && !candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  };

  // 1. 清单里写的路径最优先：路径写对了就只发这一次请求
  push(clean);

  // 2. 同名其它格式；大写后缀单独试一遍（Windows 不区分大小写，Linux 部署会区分）
  for (const extension of [declared, ...extensions]) {
    if (!extension) {
      continue;
    }
    push(`${base}.${extension.toLowerCase()}`);
    push(`${base}.${extension.toUpperCase()}`);
  }

  return candidates;
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`无法加载图片：${url}`));
    image.src = url;
  });
}

/** 依次尝试多个候选路径，返回第一个能取到内容的 ArrayBuffer */
async function fetchFirstAvailable(
  files: readonly string[],
): Promise<{ file: string; buffer: ArrayBuffer } | null> {
  for (const file of files) {
    try {
      const response = await fetch(toUrl(file));
      if (!response.ok) {
        continue;
      }

      // 注意：开发服务器（Vite）对不存在的路径会回退返回 index.html + 200，
      // 直接拿去解码只会得到 EncodingError 并刷一屏警告。
      // 所以这里排除 text/*（HTML/纯文本），其余交给 decodeAudioData 判断。
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.startsWith('text/')) {
        continue;
      }

      return { file, buffer: await response.arrayBuffer() };
    } catch {
      // 网络层失败也当作「这个文件没有」，继续试下一个候选
    }
  }
  return null;
}

/** 依次尝试多个候选路径，返回第一张能解码成功的图片 */
async function loadFirstImage(
  files: readonly string[],
): Promise<{ file: string; image: HTMLImageElement } | null> {
  for (const file of files) {
    try {
      const image = await loadImageElement(toUrl(file));
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        return { file, image };
      }
    } catch {
      // 文件不存在、或拿到的是 HTML 回退页 —— 换下一个候选
    }
  }
  return null;
}

/**
 * 尺寸与清单不符时，等比缩放并居中到目标尺寸，四周留透明。
 *
 * 为什么不再「按原图显示」：渲染层是 1:1 摆贴图的，
 * 一张 2048×2048 的图会直接盖住整屏，效果等同于素材没生效。
 * 缩小时开启平滑避免摩尔纹，放大时关掉以保留像素画边缘。
 */
function addScaledTexture(
  scene: Phaser.Scene,
  key: string,
  image: HTMLImageElement,
  width: number,
  height: number,
): boolean {
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) {
    return false;
  }

  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const drawHeight = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = texture.getContext();
  context.imageSmoothingEnabled = image.naturalWidth > width || image.naturalHeight > height;
  context.clearRect(0, 0, width, height);
  context.drawImage(
    image,
    Math.floor((width - drawWidth) / 2),
    Math.floor((height - drawHeight) / 2),
    drawWidth,
    drawHeight,
  );
  texture.refresh();
  return true;
}

/**
 * 加载图片素材并注册进 Phaser 的贴图管理器。
 * 加载失败不抛错：只是不进 loadedImages，让调用方补占位图。
 */
async function loadImages(
  scene: Phaser.Scene,
  assets: readonly ImageAsset[],
  report: AssetLoadReport,
): Promise<void> {
  await Promise.all(
    assets.map(async (asset) => {
      const candidates = candidateFiles(asset.file, IMAGE_EXTENSIONS);
      const found = await loadFirstImage(candidates);
      if (!found) {
        report.missingImages.push(asset.key);
        return;
      }

      if (found.file !== candidates[0]) {
        report.substitutions.push(`${asset.file}（清单）→ ${found.file}（实际）`);
      }

      const width = found.image.naturalWidth;
      const height = found.image.naturalHeight;
      if (width !== asset.width || height !== asset.height) {
        report.sizeWarnings.push(
          `${found.file} 是 ${width}×${height}，清单要求 ${asset.width}×${asset.height}` +
            `（${asset.usage}）；已等比缩放居中，建议换成目标尺寸的透明 PNG`,
        );
      }

      // 同名的占位贴图若已存在，先移除，避免「替换了文件却还是旧图」
      if (scene.textures.exists(asset.key)) {
        scene.textures.remove(asset.key);
      }

      const registered =
        width === asset.width && height === asset.height
          ? scene.textures.addImage(asset.key, found.image) !== null
          : addScaledTexture(scene, asset.key, found.image, asset.width, asset.height);

      if (!registered) {
        report.missingImages.push(asset.key);
        return;
      }

      report.loadedImages.push(asset.key);
    }),
  );
}

/**
 * 加载音频素材并解码进 Phaser 的音频缓存。
 *
 * 用 Web Audio 的 decodeAudioData 自己解码，而不是 Phaser 的 load.audio：
 * 理由同图片——文件缺失是正常状态，不该当成加载错误。
 */
async function loadAudios(
  scene: Phaser.Scene,
  assets: readonly AudioAsset[],
  report: AssetLoadReport,
): Promise<void> {
  const soundManager = scene.sound as Phaser.Sound.WebAudioSoundManager;
  const context = soundManager.context;

  if (!context) {
    // HTML5 / NoAudio 后端：没有 decodeAudioData，全部走合成音兜底
    report.missingAudio.push(...assets.map((asset) => asset.key));
    return;
  }

  await Promise.all(
    assets.map(async (asset) => {
      const candidates = asset.files.flatMap((file) => candidateFiles(file, AUDIO_EXTENSIONS));
      const found = await fetchFirstAvailable(candidates);
      if (!found) {
        report.missingAudio.push(asset.key);
        return;
      }

      if (found.file !== candidates[0]) {
        report.substitutions.push(`${asset.files[0]}（清单）→ ${found.file}（实际）`);
      }

      try {
        const audioBuffer = await context.decodeAudioData(found.buffer);
        scene.cache.audio.add(asset.key, audioBuffer);
        report.loadedAudio.push(asset.key);
      } catch (error) {
        console.warn(`音频解码失败，将使用合成音：${found.file}`, error);
        report.missingAudio.push(asset.key);
      }
    }),
  );
}

/** 加载全部素材；任何失败都只记录、不抛错 */
export async function loadExternalAssets(
  scene: Phaser.Scene,
  images: readonly ImageAsset[],
  audios: readonly AudioAsset[],
): Promise<AssetLoadReport> {
  const report: AssetLoadReport = {
    loadedImages: [],
    missingImages: [],
    loadedAudio: [],
    missingAudio: [],
    sizeWarnings: [],
    substitutions: [],
  };

  await Promise.all([loadImages(scene, images, report), loadAudios(scene, audios, report)]);

  return report;
}

/** 把加载结果打印成一行，方便用户确认自己的素材到底有没有生效 */
export function logAssetReport(
  report: AssetLoadReport,
  imageTotal: number,
  audioTotal: number,
): void {
  console.log(
    `[素材] 图片 ${report.loadedImages.length}/${imageTotal} 来自文件，其余用占位图；` +
      `音效 ${report.loadedAudio.length}/${audioTotal} 来自文件，其余用合成音`,
  );

  for (const warning of report.sizeWarnings) {
    console.warn(`[素材] 尺寸不符：${warning}`);
  }

  for (const substitution of report.substitutions) {
    console.info(`[素材] 已自动匹配同名文件：${substitution}`);
  }
}
