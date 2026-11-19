import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/integer-scale';
import { SceneKeys } from './scene-keys';

/** 昵称存在浏览器本地，刷新页面还记得（需求 7.6：只做昵称，不做账号） */
const NICKNAME_STORAGE_KEY = 'tda.nickname';

/** 挑战模式时长（毫秒）。需求 4.2 建议单局 3–5 分钟，练习挑战先取 60 秒好测 */
const CHALLENGE_DURATION_MS = 60_000;

/**
 * 大厅场景（需求 7.1）。
 *
 * 现在提供两个入口：
 * - 练习场（自由）：不计时，随便打，按 ESC 可以暂停后返回大厅；
 * - 练习挑战：限时 60 秒，时间到进结算面板（跑通"对局 → 结算 → 再来一局"的完整流程）。
 *
 * 房间号 / 联机按钮先置灰，等 server/ 做出来再开（README 里写的是 1.1 阶段）。
 */
export class MenuScene extends Phaser.Scene {
  static readonly KEY = SceneKeys.Menu;

  private nicknameInput: HTMLInputElement | null = null;

  constructor() {
    super(MenuScene.KEY);
  }

  create(): void {
    // 背景
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b0b12).setOrigin(0);

    // 标题区
    this.add
      .text(GAME_WIDTH / 2, 124, '东方闯创爆', {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '52px',
        color: '#f2f2f7',
      })
      .setOrigin(0.5)
      .setShadow(0, 2, '#000000', 4);

    this.add
      .text(GAME_WIDTH / 2, 188, '敢不敢和我举行一下别样的碰碰车大赛', {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '24px',
        color: '#7b7b90',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 228, '深圳高中生诹访子爱好者团体不匠心巨献', {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '24px',
        color: '#7b7b90',
      })
      .setOrigin(0.5);

    this.setupNicknameInput();

    // 入口按钮
    this.createButton('练习场（自由）', 284, () => this.startBattle());
    this.createButton('挑战 AI（60 秒）', 364, () => this.startBattle(CHALLENGE_DURATION_MS, 1));
    this.createButton('联机对战（本地房间 test）', 444, () => this.startOnlineBattle());

    // 未实现的功能：明确写出"什么时候有"，比藏起来好
    this.add
      .text(GAME_WIDTH / 2, 536, '联机需要先在本机跑服务端：npm run server', {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '22px',
        color: '#4a4a58',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 672, '1 = 练习场 · 2 = 挑战 AI · 3 = 联机（需服务端）', {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '20px',
        color: '#4a4a58',
      })
      .setOrigin(0.5);

    // 键盘快捷入口，省得每次点鼠标
    this.input.keyboard!.on('keydown-ONE', () => this.startBattle());
    this.input.keyboard!.on('keydown-TWO', () => this.startBattle(CHALLENGE_DURATION_MS, 1));
    this.input.keyboard!.on('keydown-THREE', () => this.startOnlineBattle());
  }

  /**
   * 昵称输入用原生 HTML 输入框，而不是在 canvas 里自己画光标。
   * 原因：canvas 里做文本输入要处理光标、选择、输入法，成本远高于收益；
   * 这里的输入框只是覆盖在画布上方的一层 DOM（见 client/index.html）。
   */
  private setupNicknameInput(): void {
    const wrap = document.getElementById('nickname-wrap');
    const input = document.getElementById('nickname');
    if (!wrap || !(input instanceof HTMLInputElement)) {
      return;
    }

    this.nicknameInput = input;

    wrap.hidden = false;
    input.value = localStorage.getItem(NICKNAME_STORAGE_KEY) ?? '灵梦';
    this.registry.set('nickname', input.value.trim() || '灵梦');

    // 用直接赋值而不是 addEventListener：重复进入大厅时不会叠加多个监听
    const persist = (): void => {
      const value = input.value.trim() || '灵梦';
      localStorage.setItem(NICKNAME_STORAGE_KEY, value);
      this.registry.set('nickname', value);
    };
    input.onchange = persist;
    input.onblur = persist;

    // 离开大厅时把输入框收起来，否则它会一直压在战斗画面上
    this.events.once('shutdown', () => {
      persist();
      wrap.hidden = true;
    });
  }

  /** 造一个可点击的文字按钮（悬停变亮，点击进下一层） */
  private createButton(label: string, y: number, onClick: () => void): void {
    const text = this.add
      .text(GAME_WIDTH / 2, y, label, {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '32px',
        color: '#cdd6ea',
        backgroundColor: '#1b1b26',
        padding: { x: 36, y: 16 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    text.on('pointerover', () => text.setColor('#ffe9a8'));
    text.on('pointerout', () => text.setColor('#cdd6ea'));
    text.on('pointerdown', onClick);
  }

  /**
   * 进入选人界面。
   * @param matchDurationMs 本局时长；不传 = 自由练习
   * @param aiOpponents AI 对手数量；不传 = 0（只有站桩假人）
   */
  private startBattle(matchDurationMs?: number, aiOpponents?: number): void {
    if (this.nicknameInput) {
      this.registry.set('nickname', this.nicknameInput.value.trim() || '灵梦');
    }
    this.scene.start(SceneKeys.CharacterSelect, { matchDurationMs, aiOpponents });
  }

  /** 联机：房间名先写死 test，跑通后再做房间号/大厅（1.1） */
  private startOnlineBattle(): void {
    if (this.nicknameInput) {
      this.registry.set('nickname', this.nicknameInput.value.trim() || '灵梦');
    }
    this.scene.start(SceneKeys.CharacterSelect, { onlineRoom: 'test' });
  }
}
