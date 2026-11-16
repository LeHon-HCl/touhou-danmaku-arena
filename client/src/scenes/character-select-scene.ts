import Phaser from 'phaser';
import { characters } from '@shared/config';
import type { CharacterId } from '@shared';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/integer-scale';
import type { CharacterSelectSceneData } from './scene-data';
import { SceneKeys } from './scene-keys';

/** 可选角色顺序（MVP 只有两个，需求 3.6） */
const CHARACTER_ORDER: CharacterId[] = ['reimu', 'marisa'];

/**
 * 选人界面（需求 7.3 局内流程的第一步）。
 *
 * 交互：← → 切换，Enter / 空格 确认；也可以直接点卡片。
 * 角色数值全部从 shared/config 读，界面上不写死任何数字。
 */
export class CharacterSelectScene extends Phaser.Scene {
  static readonly KEY = SceneKeys.CharacterSelect;

  private selectedIndex = 0;
  private matchDurationMs: number | undefined;
  private onlineRoom: string | undefined;
  private cards: Phaser.GameObjects.Container[] = [];
  private confirmText!: Phaser.GameObjects.Text;

  constructor() {
    super(CharacterSelectScene.KEY);
  }

  init(data: CharacterSelectSceneData): void {
    this.matchDurationMs = data.matchDurationMs;
    this.onlineRoom = data.onlineRoom;
    this.selectedIndex = 0;
  }

  create(): void {
    this.cards = [];

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b0b12).setOrigin(0);

    this.add
      .text(GAME_WIDTH / 2, 40, '选择角色', {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '20px',
        color: '#f2f2f7',
      })
      .setOrigin(0.5);

    // 两张卡片：横坐标固定，卡片内容由配置生成
    const cardY = 170;
    CHARACTER_ORDER.forEach((characterId, index) => {
      const x = GAME_WIDTH / 2 + (index === 0 ? -130 : 130);
      const card = this.createCard(characterId, x, cardY);
      card.setInteractive(
        new Phaser.Geom.Rectangle(-80, -90, 160, 180),
        Phaser.Geom.Rectangle.Contains,
      );
      card.on('pointerdown', () => {
        this.selectedIndex = index;
        this.refreshSelection();
      });
      this.cards.push(card);
    });

    this.confirmText = this.add
      .text(GAME_WIDTH / 2, 300, '', {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '13px',
        color: '#9aa6bd',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 336, '← → 切换 · Enter 确认 · ESC 返回大厅', {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '10px',
        color: '#4a4a58',
      })
      .setOrigin(0.5);

    const keyboard = this.input.keyboard!;
    keyboard.on('keydown-LEFT', () => this.moveSelection(-1));
    keyboard.on('keydown-RIGHT', () => this.moveSelection(1));
    keyboard.on('keydown-ENTER', () => this.confirm());
    keyboard.on('keydown-SPACE', () => this.confirm());
    keyboard.on('keydown-ESC', () => this.scene.start(SceneKeys.Menu));

    this.refreshSelection();
  }

  /** 造一张角色卡：底色 + 名字 + 关键数值 */
  private createCard(characterId: CharacterId, x: number, y: number): Phaser.GameObjects.Container {
    const config = characters[characterId];

    const container = this.add.container(x, y);
    const background = this.add.rectangle(0, 0, 160, 180, 0x14141c).setStrokeStyle(2, 0x33334a);
    const name = this.add
      .text(0, -62, config.displayName, {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '16px',
        color: '#f2f2f7',
      })
      .setOrigin(0.5);

    const stats = this.add
      .text(
        0,
        40,
        [
          `生命 ${config.maxHp}`,
          `护盾 ${config.maxShield}`,
          `移速 ${config.moveSpeed}`,
          `射击间隔 ${Math.round(config.fireInterval)}ms`,
        ].join('\n'),
        {
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: '12px',
          color: '#9aa6bd',
          align: 'center',
          lineSpacing: 6,
        },
      )
      .setOrigin(0.5);

    // 用一张缩小的角色贴图当头像（贴图 key 与配置的 id 对应）
    const portrait = this.add
      .image(0, -26, characterId === 'reimu' ? 'char_reimu' : 'char_marisa')
      .setScale(0.8);

    container.add([background, portrait, name, stats]);
    // 把背景存进容器的 data，方便选中时改边框颜色
    container.setData('background', background);
    return container;
  }

  /** 左右切换（到边界循环） */
  private moveSelection(direction: number): void {
    this.selectedIndex =
      (this.selectedIndex + direction + CHARACTER_ORDER.length) % CHARACTER_ORDER.length;
    this.refreshSelection();
  }

  /** 更新卡片高亮与底部提示 */
  private refreshSelection(): void {
    this.cards.forEach((card, index) => {
      const background = card.getData('background') as Phaser.GameObjects.Rectangle;
      const isSelected = index === this.selectedIndex;
      background.setStrokeStyle(2, isSelected ? 0xffe9a8 : 0x33334a);
      background.setFillStyle(isSelected ? 0x1c1c27 : 0x14141c);
    });

    const characterId = CHARACTER_ORDER[this.selectedIndex];
    const mode = this.matchDurationMs ? `挑战 ${this.matchDurationMs / 1000} 秒` : '自由练习';
    this.confirmText.setText(`当前：${characters[characterId].displayName} · ${mode} · Enter 开始`);
  }

  private confirm(): void {
    const characterId = CHARACTER_ORDER[this.selectedIndex];
    this.scene.start(SceneKeys.Battle, {
      characterId,
      matchDurationMs: this.matchDurationMs,
      onlineRoom: this.onlineRoom,
    });
  }
}
