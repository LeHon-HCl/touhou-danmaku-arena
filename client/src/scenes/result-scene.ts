import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/integer-scale';
import type { ResultSceneData } from './scene-data';
import { SceneKeys } from './scene-keys';

/**
 * 结算界面（需求 4.7）。
 *
 * 固定展示四个统计维度：击杀数、死亡数、对敌方造成的总伤害、拾取道具数。
 * 这些数字由 shared/ 在战斗中统计（将来由服务端下发），客户端只负责显示。
 */
export class ResultScene extends Phaser.Scene {
  static readonly KEY = SceneKeys.Result;

  private result!: ResultSceneData;

  constructor() {
    super(ResultScene.KEY);
  }

  init(data: ResultSceneData): void {
    this.result = data;
  }

  create(): void {
    const { score, isTimeUp, characterId, matchDurationMs } = this.result;

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b0b12).setOrigin(0);

    this.add
      .text(GAME_WIDTH / 2, 120, isTimeUp ? '时间到' : '对局结束', {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '48px',
        color: '#ffe9a8',
      })
      .setOrigin(0.5);

    this.add
      .text(
        GAME_WIDTH / 2,
        184,
        matchDurationMs ? `练习挑战 · ${matchDurationMs / 1000} 秒` : '自由练习',
        {
          fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
          fontSize: '24px',
          color: '#7b7b90',
        },
      )
      .setOrigin(0.5);

    // 四行统计：标签左对齐、数字右对齐，两列布局比一行长文本更好读
    const rows: Array<[string, number]> = [
      ['击倒', score.kills],
      ['阵亡', score.deaths],
      ['造成伤害', Math.round(score.damageDealt)],
      ['拾取道具', score.itemsPicked],
    ];
    const startY = 272;
    rows.forEach(([label, value], index) => {
      const y = startY + index * 52;
      this.add
        .text(GAME_WIDTH / 2 - 180, y, label, {
          fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
          fontSize: '28px',
          color: '#9aa6bd',
        })
        .setOrigin(0, 0.5);
      this.add
        .text(GAME_WIDTH / 2 + 180, y, String(value), {
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: '32px',
          color: '#f2f2f7',
        })
        .setOrigin(1, 0.5);
    });

    this.createButton('再来一局（R）', 536, () => {
      this.scene.start(SceneKeys.Battle, { characterId, matchDurationMs });
    });
    this.createButton('返回大厅（Q）', 616, () => this.scene.start(SceneKeys.Menu));

    const keyboard = this.input.keyboard!;
    keyboard.on('keydown-R', () =>
      this.scene.start(SceneKeys.Battle, { characterId, matchDurationMs }),
    );
    keyboard.on('keydown-Q', () => this.scene.start(SceneKeys.Menu));
  }

  private createButton(label: string, y: number, onClick: () => void): void {
    const text = this.add
      .text(GAME_WIDTH / 2, y, label, {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '30px',
        color: '#cdd6ea',
        backgroundColor: '#1b1b26',
        padding: { x: 32, y: 14 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    text.on('pointerover', () => text.setColor('#ffe9a8'));
    text.on('pointerout', () => text.setColor('#cdd6ea'));
    text.on('pointerdown', onClick);
  }
}
