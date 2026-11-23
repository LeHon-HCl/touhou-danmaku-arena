import Phaser from 'phaser';
import { SELECTABLE_CHARACTERS } from '@shared';
import type { Character } from '@shared';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/integer-scale';
import type { CharacterSelectSceneData } from './scene-data';
import { SceneKeys } from './scene-keys';

/**
 * 选人界面（需求 7.3 局内流程的第一步）。
 *
 * 交互：← → 切换，Enter / 空格 确认；也可以直接点卡片。
 *
 * 角色**不写死**：列表来自 `shared/content/characters` 的注册表，
 * 加角色后这里自动多一张卡片（卡片会按数量自适应缩放，避免互相压住）。
 * 数值与贴图都从角色实例读，界面不写死任何数字。
 */
export class CharacterSelectScene extends Phaser.Scene {
  static readonly KEY = SceneKeys.CharacterSelect;

  private selectedIndex = 0;
  private matchDurationMs: number | undefined;
  private onlineRoom: string | undefined;
  private aiOpponents = 0;
  private cards: Phaser.GameObjects.Container[] = [];
  private confirmText!: Phaser.GameObjects.Text;

  constructor() {
    super(CharacterSelectScene.KEY);
  }

  init(data: CharacterSelectSceneData): void {
    this.matchDurationMs = data.matchDurationMs;
    this.onlineRoom = data.onlineRoom;
    this.aiOpponents = data.aiOpponents ?? 0;
    this.selectedIndex = 0;
  }

  create(): void {
    this.cards = [];

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b0b12).setOrigin(0);

    this.add
      .text(GAME_WIDTH / 2, 80, '选择角色', {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '40px',
        color: '#f2f2f7',
      })
      .setOrigin(0.5);

    // 卡片横向排布：数量变化时自动收紧间距并缩放，避免互相压住
    const characters = SELECTABLE_CHARACTERS;
    const cardY = 340;
    const cardWidth = 320;
    const gap = 40;
    const usableWidth = GAME_WIDTH - 120;
    const spacing = Math.min(cardWidth + gap, usableWidth / Math.max(1, characters.length));
    const cardScale = Math.min(1, spacing / (cardWidth + gap));
    const startX = GAME_WIDTH / 2 - (spacing * (characters.length - 1)) / 2;

    characters.forEach((character, index) => {
      const x = startX + spacing * index;
      const card = this.createCard(character, x, cardY);
      card.setScale(cardScale);
      card.setInteractive(
        new Phaser.Geom.Rectangle(-160, -180, 320, 360),
        Phaser.Geom.Rectangle.Contains,
      );
      card.on('pointerdown', () => {
        this.selectedIndex = index;
        this.refreshSelection();
      });
      this.cards.push(card);
    });

    this.confirmText = this.add
      .text(GAME_WIDTH / 2, 600, '', {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '26px',
        color: '#9aa6bd',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 672, '← → 切换 · Enter 确认 · ESC 返回大厅', {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '20px',
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
  private createCard(character: Character, x: number, y: number): Phaser.GameObjects.Container {
    const { stats: stat } = character;

    const container = this.add.container(x, y);
    const background = this.add.rectangle(0, 0, 320, 360, 0x14141c).setStrokeStyle(4, 0x33334a);
    const name = this.add
      .text(0, -124, character.displayName, {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '32px',
        color: '#f2f2f7',
      })
      .setOrigin(0.5);

    const stats = this.add
      .text(
        0,
        80,
        [
          `生命 ${stat.maxHp}`,
          `护盾 ${stat.maxShield}`,
          `移速 ${stat.moveSpeed}`,
          `射击间隔 ${Math.round(stat.fireInterval)}ms`,
        ].join('\n'),
        {
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: '24px',
          color: '#9aa6bd',
          align: 'center',
          lineSpacing: 6,
        },
      )
      .setOrigin(0.5);

    // 用一张缩小的角色贴图当头像（key 由角色定义给出，加角色不用改这里）
    const portrait = this.add.image(0, -52, character.textureKey).setScale(1.6);

    container.add([background, portrait, name, stats]);
    // 把背景存进容器的 data，方便选中时改边框颜色
    container.setData('background', background);
    return container;
  }

  /** 左右切换（到边界循环） */
  private moveSelection(direction: number): void {
    const count = SELECTABLE_CHARACTERS.length;
    this.selectedIndex = (this.selectedIndex + direction + count) % count;
    this.refreshSelection();
  }

  /** 更新卡片高亮与底部提示 */
  private refreshSelection(): void {
    this.cards.forEach((card, index) => {
      const background = card.getData('background') as Phaser.GameObjects.Rectangle;
      const isSelected = index === this.selectedIndex;
      background.setStrokeStyle(4, isSelected ? 0xffe9a8 : 0x33334a);
      background.setFillStyle(isSelected ? 0x1c1c27 : 0x14141c);
    });

    const character = SELECTABLE_CHARACTERS[this.selectedIndex];
    const mode = this.matchDurationMs ? `挑战 ${this.matchDurationMs / 1000} 秒` : '自由练习';
    const opponent = this.aiOpponents > 0 ? ` · 对手：AI ×${this.aiOpponents}` : '';
    this.confirmText.setText(`当前：${character.displayName} · ${mode}${opponent} · Enter 开始`);
  }

  private confirm(): void {
    const character = SELECTABLE_CHARACTERS[this.selectedIndex];
    this.scene.start(SceneKeys.Battle, {
      characterId: character.id,
      matchDurationMs: this.matchDurationMs,
      onlineRoom: this.onlineRoom,
      aiOpponents: this.aiOpponents,
    });
  }
}
