import Phaser from 'phaser';
import { AUDIO_REGISTRY_KEY, AudioManager } from '../audio/audio-manager';
import { createPlaceholderTextures } from '../render/placeholder-textures';
import { SceneKeys } from './scene-keys';

/**
 * 启动场景。
 *
 * 现在只做两件事：
 * 1. 用代码生成全部占位贴图；
 * 2. 合成并解码占位音效。
 * 两件事都就绪后再进入大厅——这样第一枪打出去就有声音。
 *
 * 将来接入正式素材时，这里会变成 this.load.image / this.load.audio + 进度条，
 * 加载策略按场景分包（tech-design 7.2.2）。
 */
export class BootScene extends Phaser.Scene {
  static readonly KEY = SceneKeys.Boot;

  constructor() {
    super(BootScene.KEY);
  }

  create(): void {
    createPlaceholderTextures(this);

    const audioManager = new AudioManager(this);
    // registry 是 Phaser 提供的「跨场景共享储物柜」，战斗场景从这里取同一个实例
    this.registry.set(AUDIO_REGISTRY_KEY, audioManager);

    // 音效初始化失败绝不能挡住游戏：catch 住错误，finally 里无论如何都进大厅。
    // （这里踩过一次：解码异常时 Promise 一直不 settle，页面就卡在启动场景了。）
    void audioManager
      .prepare()
      .catch((error: unknown) => {
        console.error('音效初始化失败，将以静音继续：', error);
      })
      .finally(() => {
        console.log('[boot] 音效准备结束，进入大厅');
        this.scene.start(SceneKeys.Menu);
      });
  }
}
