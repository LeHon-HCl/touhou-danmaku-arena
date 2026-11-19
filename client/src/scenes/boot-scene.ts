import Phaser from 'phaser';
import { loadExternalAssets, logAssetReport } from '../assets/loader';
import { AUDIO_ASSETS, IMAGE_ASSETS } from '../assets/manifest';
import { AUDIO_REGISTRY_KEY, AudioManager } from '../audio/audio-manager';
import { createMissingPlaceholders } from '../render/placeholder-textures';
import { SceneKeys } from './scene-keys';

/**
 * 启动场景。
 *
 * 三件事，全部就绪后才进大厅（这样第一枪打出去就有声音、有图）：
 * 1. 尝试加载 `assets/images`、`assets/audio` 里的真实素材；
 * 2. 没加载到的部分，用代码生成占位贴图 / 合成占位音；
 * 3. 把 AudioManager 放进 registry，供各场景共用。
 *
 * 素材缺失是**正常状态**（占位素材阶段就是这样），所以加载失败不会报错，
 * 只会在控制台打一行 `[素材] 图片 x/12 来自文件…` 说明当前用的是哪些。
 *
 * 改素材的具体做法见仓库根目录 `assets/README.md`。
 */
export class BootScene extends Phaser.Scene {
  static readonly KEY = SceneKeys.Boot;

  constructor() {
    super(BootScene.KEY);
  }

  create(): void {
    void this.boot();
  }

  private async boot(): Promise<void> {
    try {
      // 1. 真实素材（缺失的会记进 report.missing*，不抛错）
      const report = await loadExternalAssets(this, IMAGE_ASSETS, AUDIO_ASSETS);

      // 2. 补齐缺的占位贴图；已经有文件贴图的 key 会被跳过
      createMissingPlaceholders(this);
      logAssetReport(report, IMAGE_ASSETS.length, AUDIO_ASSETS.length);

      // 3. 音效管理：已从文件加载的不会再合成
      const audioManager = new AudioManager(this);
      // registry 是 Phaser 提供的「跨场景共享储物柜」，战斗场景从这里取同一个实例
      this.registry.set(AUDIO_REGISTRY_KEY, audioManager);

      await audioManager.prepare();
    } catch (error) {
      // 任何意外都不能把玩家卡在启动画面：素材出问题也要能进大厅
      console.error('素材初始化异常，将以占位素材/静音继续：', error);
    } finally {
      console.log('[boot] 素材准备结束，进入大厅');
      this.scene.start(SceneKeys.Menu);
    }
  }
}
