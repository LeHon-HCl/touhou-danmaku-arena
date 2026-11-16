import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/integer-scale';
import type { BattleSceneData } from './scene-data';
import { SceneKeys } from './scene-keys';

/**
 * 暂停界面（需求 2.2：ESC 打开菜单）。
 *
 * 它是**独立场景**，叠在战斗场景上面：
 * 战斗场景被 `this.scene.pause()` 冻住（update 不再执行），暂停界面自己处理输入，
 * 这样"暂停"与"游戏逻辑"完全解耦，不需要在战斗场景里塞一堆 if (isPaused)。
 */
export class PauseScene extends Phaser.Scene {
  static readonly KEY = SceneKeys.Pause;

  private battleData!: BattleSceneData;

  constructor() {
    super(PauseScene.KEY);
  }

  init(data: BattleSceneData): void {
    this.battleData = data;
  }

  create(): void {
    // 半透明遮罩，同时吃掉鼠标事件，避免点穿到下面的战斗场景
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.66).setOrigin(0).setInteractive();

    this.add
      .text(GAME_WIDTH / 2, 96, '已暂停', {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '22px',
        color: '#f2f2f7',
      })
      .setOrigin(0.5);

    this.createButton('继续（ESC / P）', 164, () => this.resumeBattle());
    this.createButton('重新开始（R）', 206, () => this.restartBattle());
    this.createButton('返回大厅（Q）', 248, () => this.backToMenu());

    const keyboard = this.input.keyboard!;
    keyboard.on('keydown-ESC', () => this.resumeBattle());
    keyboard.on('keydown-P', () => this.resumeBattle());
    keyboard.on('keydown-R', () => this.restartBattle());
    keyboard.on('keydown-Q', () => this.backToMenu());
  }

  private createButton(label: string, y: number, onClick: () => void): void {
    const text = this.add
      .text(GAME_WIDTH / 2, y, label, {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '15px',
        color: '#cdd6ea',
        backgroundColor: '#1b1b26',
        padding: { x: 16, y: 7 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    text.on('pointerover', () => text.setColor('#ffe9a8'));
    text.on('pointerout', () => text.setColor('#cdd6ea'));
    text.on('pointerdown', onClick);
  }

  /** 关掉暂停界面，让战斗场景继续跑 */
  private resumeBattle(): void {
    this.scene.stop();
    this.scene.resume(SceneKeys.Battle);
  }

  /** 重开一局：把原来的角色与时长参数原样传回去 */
  private restartBattle(): void {
    this.scene.start(SceneKeys.Battle, this.battleData);
  }

  private backToMenu(): void {
    this.scene.stop(SceneKeys.Battle);
    this.scene.start(SceneKeys.Menu);
  }
}
