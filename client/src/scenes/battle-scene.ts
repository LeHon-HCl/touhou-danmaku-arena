import Phaser from 'phaser';
import {
  PLAYER_ID,
  applySnapshotToState,
  battleConfig,
  createBattleState,
  hasLineOfSight,
  step,
} from '@shared';
import type { BattleState, PlayerInput, PlayerState } from '@shared';
import { ITEMS } from '@shared/config/items';
import { AUDIO_REGISTRY_KEY, SFX, type AudioManager } from '../audio/audio-manager';
import { KeyboardMouseInput } from '../input/keyboard-mouse-input';
import { OnlineSession } from '../net/online-session';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/integer-scale';
import { Minimap, type MinimapMarker } from '../render/minimap';
import { TEX, itemTextureKey } from '../render/placeholder-textures';
import type { BattleSceneData, ResultSceneData } from './scene-data';
import { SceneKeys } from './scene-keys';

/** 记忆标记保留时长（毫秒）：敌人躲进掩体后，小地图上的旧位置还能看到这么久 */
const MEMORY_MARKER_LIFETIME = 4000;

/** 联机服务端地址（本地开发）。上线后改成部署域名 + wss:// */
const ONLINE_SERVER_URL = 'ws://localhost:8080';

/**
 * 练习场战斗场景。
 *
 * 【这份代码怎么读】
 * 整个世界只有两份东西：
 *   1. `this.state` —— 数据（谁在哪、剩多少血、有几颗子弹）。它来自 shared/，是纯数据。
 *   2. 各种 Sprite / Graphics —— 画面。它们每帧从 `this.state` 里"抄"一次位置来显示。
 *
 * 数据是唯一真相，画面只是它的影子。所以：
 *   - `step()` 负责改数据（移动、命中、扣血），它不认识 Phaser；
 *   - `syncSprites()` 负责把数据抄到画面上，它不修改数据。
 * 这两件事分开，将来接服务端时，只要把"改数据"那一半搬到服务器即可。
 *
 * 每帧的流程（见 update）：
 *   采样输入 → 按固定 30Hz 调 step() → 处理事件（音效/特效）→ 同步画面 → 画 HUD
 */
export class BattleScene extends Phaser.Scene {
  static readonly KEY = SceneKeys.Battle;

  /** 世界状态：唯一真相，来自 shared/ */
  private state!: BattleState;
  /** 键鼠输入采集器 */
  private inputSource!: KeyboardMouseInput;
  /** 音效管理器（由 BootScene 创建并放进 registry） */
  private audio!: AudioManager;
  /** 本地玩家的贴图（联机时本地玩家可能是 2 号、3 号，所以只存引用） */
  private playerSprite?: Phaser.GameObjects.Image;
  /** 其他战斗单位的贴图：练习场里是假人，联机里是别的玩家 */
  private readonly otherSprites = new Map<number, Phaser.GameObjects.Image>();
  /** 其他单位头顶的血条/盾条 */
  private readonly otherBars = new Map<number, Phaser.GameObjects.Graphics>();
  /** 子弹的贴图，key 是子弹 id；子弹消失时同步删掉 */
  private readonly bulletSprites = new Map<number, Phaser.GameObjects.Image>();
  /** 本帧要喂给 step() 的输入，key 是玩家 id */
  private readonly frameInputs = new Map<number, PlayerInput>();
  /** 固定步长累加器：攒够 33.33ms 就推进一帧逻辑 */
  private accumulatorMs = 0;
  /** 复用的粒子发射器（命中火花、枪口闪光） */
  private impactEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** 受伤时的全屏红闪遮罩 */
  private dangerOverlay!: Phaser.GameObjects.Rectangle;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  /** 挑战模式的倒计时文字（自由练习时不显示） */
  private timerText!: Phaser.GameObjects.Text;
  /** 地上的道具贴图，key 是道具 id */
  private readonly pickupSprites = new Map<number, Phaser.GameObjects.Image>();
  /** 进入本局时带的参数（角色 / 时长），暂停与重开时原样传回去 */
  private battleData!: BattleSceneData;
  /** 结算界面是否已经弹出，防止同一帧重复 launch */
  private isResultShown = false;
  /** 小地图 */
  private minimap!: Minimap;
  /** 敌人"最后已知位置"：被墙挡住后，小地图上留一个淡标记（需求 2.4） */
  private readonly lastKnownPositions = new Map<number, { x: number; y: number; atMs: number }>();

  /** 本地玩家在本局的 id：练习场固定是 PLAYER_ID，联机由服务端分配 */
  private localPlayerId = PLAYER_ID;
  /** 联机会话；为 null 表示单机练习 */
  private onlineSession: OnlineSession | null = null;
  /** 上行节流：攒够 33ms 发一次输入 */
  private onlineSendAccumulatorMs = 0;
  /** 自身的本地预测位置（tech-design ADR-8：只预测自己的移动） */
  private predictedSelf = { x: 0, y: 0, ready: false };
  /** 当前"玩家 id + 角色"列表的签名，变了就重建贴图（联机有人入房/离开） */
  private actorSignature = '';

  constructor() {
    super(BattleScene.KEY);
  }

  /** 接收从选人界面传来的参数（角色、是否限时、是否联机） */
  init(data: BattleSceneData): void {
    this.battleData = {
      characterId: data.characterId ?? 'reimu',
      matchDurationMs: data.matchDurationMs,
      onlineRoom: data.onlineRoom,
    };
  }

  /**
   * 场景初始化，只执行一次。
   * （Phaser 的生命周期是 init → preload → create → 每帧 update，
   *   这里的 create 是"创建场景对象"，和"开火"没有关系，名字容易误会。）
   */
  create(): void {
    // 1. 造一份全新的世界状态。重开时场景会重新 create，所以旧状态自然被丢掉
    if (this.battleData.onlineRoom) {
      // 联机：本地只维护一份"影子世界"，真正推进在服务端。
      // 先用同一份地图配置把墙、尺寸建好，玩家等快照到了再补。
      this.state = createBattleState(battleConfig, { dummyCount: 0, seedPickups: 3 });
      this.state.players = [];
      this.localPlayerId = 0;
    } else {
      this.state = createBattleState(battleConfig, {
        characterId: this.battleData.characterId,
        matchDurationMs: this.battleData.matchDurationMs,
      });
      this.localPlayerId = PLAYER_ID;
    }
    this.accumulatorMs = 0;
    this.onlineSendAccumulatorMs = 0;
    this.predictedSelf = { x: 0, y: 0, ready: false };
    this.actorSignature = '';
    this.isResultShown = false;

    // 2. 清空"从 state 派生出来的显示对象"索引表，避免重开时残留旧引用
    this.playerSprite = undefined;
    this.otherSprites.clear();
    this.otherBars.clear();
    this.bulletSprites.clear();
    this.pickupSprites.clear();
    this.frameInputs.clear();
    this.lastKnownPositions.clear();

    // 3. 搭画面：地图 → 角色 → 相机 → HUD → 特效
    //    注意：createActors 换成了每帧调用的 ensureActors()，因为联机时玩家是陆续入房的
    this.createMap();
    this.setupCamera();
    this.createHud();
    this.createEffects();

    // 4. 输入与音效
    this.inputSource = new KeyboardMouseInput(this);
    //
    // 暂停/重开用「事件监听」而不是每帧轮询 Key 对象：
    // Phaser 的 Key 对象依赖 KeyboardPlugin 每帧更新，实测在某些宿主环境（VS Code 内置浏览器）
    // 里 isDown 一直是 false，轮询永远拿不到按下状态；而 keydown 事件是稳定送达的。
    // ESC 也可能被宿主拦走，所以额外支持 P，并额外提供右下角的可点击暂停按钮。
    this.input.keyboard!.on('keydown-ESC', this.openPause, this);
    this.input.keyboard!.on('keydown-P', this.openPause, this);
    this.input.keyboard!.on('keydown-R', this.restartRound, this);
    this.input.setDefaultCursor('crosshair');
    // BootScene 已经把 AudioManager 放进 registry，这里取的是同一个实例（音效只解码一次）
    this.audio = this.registry.get(AUDIO_REGISTRY_KEY) as AudioManager;

    // 5. 联机：连服务端
    if (this.battleData.onlineRoom) {
      this.connectOnline(this.battleData.onlineRoom);
    }
  }

  /** 连接服务端并入房；失败就提示并回大厅，不让玩家卡在一片空白里 */
  private connectOnline(room: string): void {
    const session = new OnlineSession();
    this.onlineSession = session;

    const nickname = String(this.registry.get('nickname') ?? '玩家');
    void session
      .connect({
        url: ONLINE_SERVER_URL,
        room,
        nickname,
        characterId: this.battleData.characterId,
      })
      .then(() => {
        this.localPlayerId = session.playerId;
        console.log(`[联机] 已入房 ${room}，本地玩家 id=${session.playerId}`);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[联机] 连接失败', message);
        this.showConnectionError(message);
      });
  }

  /** 联机连不上时的提示（2.5 秒后回大厅） */
  private showConnectionError(message: string): void {
    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.8)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(2000);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, `联机失败\n${message}\n\n2.5 秒后返回大厅`, {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '12px',
        color: '#ff8a8a',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2001);
    this.time.delayedCall(2500, () => this.scene.start(SceneKeys.Menu));
  }

  override update(_time: number, delta: number): void {
    // 单机：本地推进世界；联机：只发输入 + 应用服务端快照
    if (this.onlineSession) {
      this.updateOnline(delta);
    } else {
      this.updateLocal(delta);
    }

    const player = this.findLocalPlayer();
    if (player) {
      // 音效的"听者"就是本地玩家：定位音效据此算左右声道偏移与距离衰减
      this.audio.updateListener(player.x, player.y);
    }

    // 贴图按需创建（联机时玩家陆续入房，不能只在 create 里建一次）
    this.ensureActors();
    this.syncSprites();
    this.drawOtherBars();
    this.updateHud();

    // 时间到了：把最后一帧画完，再切结算界面
    if (this.state.isFinished) {
      this.showResult();
    }
  }

  /** 单机/练习场：本地按 30Hz 推进世界 */
  private updateLocal(deltaMs: number): void {
    const player = this.findLocalPlayer();
    if (!player) {
      return;
    }

    this.frameInputs.clear();
    this.frameInputs.set(player.id, this.inputSource.sample({ x: player.x, y: player.y }));

    // 固定步长推进：渲染帧率与逻辑帧率解耦；单帧最多补 5 步，避免切回标签页时一次性快进
    this.accumulatorMs += Math.min(deltaMs, 200);
    let steps = 0;
    while (!this.state.isFinished && this.accumulatorMs >= battleConfig.stepMs && steps < 5) {
      step(this.state, this.frameInputs, battleConfig);
      this.accumulatorMs -= battleConfig.stepMs;
      steps += 1;
      // 事件是每步清空的，所以必须紧跟 step() 处理，不能留到 while 外面
      this.handleEvents();
    }
  }

  /** 联机：上行输入、下行应用插值快照、只对自身做预测 */
  private updateOnline(deltaMs: number): void {
    const session = this.onlineSession;
    if (!session || session.playerId === 0) {
      return;
    }

    const self = this.findLocalPlayer();
    const aimFrom = self ?? { x: this.state.mapWidth / 2, y: this.state.mapHeight / 2 };
    const input = this.inputSource.sample({ x: aimFrom.x, y: aimFrom.y });

    // 30Hz 上行（与服务端逻辑帧率一致）
    this.onlineSendAccumulatorMs += deltaMs;
    if (this.onlineSendAccumulatorMs >= battleConfig.stepMs) {
      this.onlineSendAccumulatorMs -= battleConfig.stepMs;
      session.sendInput(input);
    }

    // 下行：取 90ms 前的插值快照写进影子世界
    const snapshot = session.sampleSnapshot(90);
    if (snapshot) {
      const previousHp = new Map(this.state.players.map((p) => [p.id, p.hp + p.shield]));
      applySnapshotToState(this.state, snapshot, battleConfig);
      this.handleRemoteDamage(previousHp);
    }

    this.updatePrediction(deltaMs, input);
  }

  /**
   * 自身移动预测（tech-design ADR-8：只预测自己的移动）。
   * 收到快照时把预测结果往服务端位置靠拢，误差过大（>60px）就直接吸附，避免越走越偏。
   */
  private updatePrediction(deltaMs: number, input: PlayerInput): void {
    const self = this.findLocalPlayer();
    if (!self) {
      return;
    }

    if (!this.predictedSelf.ready) {
      this.predictedSelf = { x: self.x, y: self.y, ready: true };
      return;
    }

    const length = Math.hypot(input.moveX, input.moveY);
    if (length > 0) {
      const speed = self.stats.moveSpeed * self.modifiers.moveSpeedMultiplier;
      this.predictedSelf.x += (input.moveX / length) * speed * (deltaMs / 1000);
      this.predictedSelf.y += (input.moveY / length) * speed * (deltaMs / 1000);
    }

    const errorX = self.x - this.predictedSelf.x;
    const errorY = self.y - this.predictedSelf.y;
    if (Math.hypot(errorX, errorY) > 60) {
      this.predictedSelf.x = self.x;
      this.predictedSelf.y = self.y;
    } else {
      this.predictedSelf.x += errorX * 0.12;
      this.predictedSelf.y += errorY * 0.12;
    }

    // 把预测位置写回影子世界，渲染与相机都跟着它走
    self.x = this.predictedSelf.x;
    self.y = this.predictedSelf.y;
  }

  /** 联机下没有 step() 的事件队列，靠"血量变化"推断命中并给反馈 */
  private handleRemoteDamage(previousHp: Map<number, number>): void {
    for (const player of this.state.players) {
      const before = previousHp.get(player.id);
      if (before === undefined) {
        continue;
      }
      if (player.hp + player.shield >= before) {
        continue;
      }
      const sprite =
        player.id === this.localPlayerId ? this.playerSprite : this.otherSprites.get(player.id);
      if (sprite) {
        this.flashSprite(sprite);
      }
      this.impactEmitter.explode(6, player.x, player.y);
      this.audio.play(SFX.hit, { x: player.x, y: player.y });
    }
  }

  /** 铺地面与墙体（视觉与碰撞是同一份地图数据） */
  private createMap(): void {
    this.add
      .tileSprite(0, 0, this.state.mapWidth, this.state.mapHeight, TEX.floor)
      .setOrigin(0)
      .setDepth(-20);

    for (const wall of this.state.walls) {
      this.add
        .tileSprite(wall.x, wall.y, wall.width, wall.height, TEX.wall)
        .setOrigin(0)
        .setDepth(-10);
    }
  }

  /**
   * 按需建贴图。
   *
   * 为什么不是 create() 里建一次就好：联机时玩家是陆续入房的，
   * 而且可能中途离开，所以每帧比对一下"当前玩家列表的签名"，
   * 变了就整体重建（这种情况很少发生，重建成本可以忽略，代码也更简单）。
   *
   * 贴图选择只看 characterId，以后加角色只需要补一个分支 + 一张贴图。
   */
  private ensureActors(): void {
    const signature = this.state.players.map((p) => `${p.id}:${p.characterId}`).join('|');
    if (signature === this.actorSignature) {
      return;
    }
    this.actorSignature = signature;

    this.playerSprite?.destroy();
    this.playerSprite = undefined;
    for (const sprite of this.otherSprites.values()) {
      sprite.destroy();
    }
    this.otherSprites.clear();
    for (const bar of this.otherBars.values()) {
      bar.destroy();
    }
    this.otherBars.clear();

    for (const fighter of this.state.players) {
      const texture =
        fighter.characterId === 'reimu'
          ? TEX.reimu
          : fighter.characterId === 'marisa'
            ? TEX.marisa
            : TEX.dummy;
      const sprite = this.add.image(fighter.x, fighter.y, texture).setDepth(10);
      if (fighter.id === this.localPlayerId) {
        this.playerSprite = sprite;
        this.setupCamera();
      } else {
        this.otherSprites.set(fighter.id, sprite);
        // 其他单位头顶的血条/盾条。正式对局里这些信息主要看 HUD 与小地图
        this.otherBars.set(fighter.id, this.add.graphics().setDepth(15));
      }
    }
  }

  private setupCamera(): void {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.state.mapWidth, this.state.mapHeight);
    camera.setDeadzone(48, 32);
    camera.setRoundPixels(false);
    // 联机刚入房时本地玩家还没出现，等贴图建好再跟随（ensureActors 会再调一次）
    if (this.playerSprite) {
      // 第二个参数 roundPixels 必须为 false：art-spec 2.4 要求保留亚像素位置
      camera.startFollow(this.playerSprite, false, 0.18, 0.18);
    }
  }

  private createHud(): void {
    this.hudGraphics = this.add.graphics().setScrollFactor(0).setDepth(1000);
    this.hudText = this.add
      .text(8, 26, '', {
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: '11px',
        color: '#cdd6ea',
      })
      .setScrollFactor(0)
      .setDepth(1001);

    // 挑战模式的倒计时，放在屏幕正上方居中
    this.timerText = this.add
      .text(GAME_WIDTH / 2, 8, '', {
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: '14px',
        color: '#ffe9a8',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1001);

    this.add
      .text(8, 340, 'WASD 移动 · 鼠标瞄准 · 左键射击 · ESC/P 暂停 · R 重开', {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '10px',
        color: '#5a5a6a',
      })
      .setScrollFactor(0)
      .setDepth(1001);

    // 可点击的暂停按钮：键位在某些宿主环境里可能被拦截，鼠标点总能用
    this.add
      .text(GAME_WIDTH - 8, 6, 'Ⅱ 暂停', {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '11px',
        color: '#8b93a8',
        backgroundColor: '#14141c',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1001)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openPause());

    // 小地图放右下角：雷达半径 300 世界像素（大于半个屏幕宽），符合"雷达范围大于可视范围"的设计
    this.minimap = new Minimap(this, this.state.walls, {
      x: GAME_WIDTH - 96,
      y: GAME_HEIGHT - 96,
      size: 88,
      worldRadius: 300,
    });
  }

  /** 世界状态 → 画面（只读，绝不反向写入 state） */
  private syncSprites(): void {
    for (const fighter of this.state.players) {
      const sprite =
        fighter.id === this.localPlayerId ? this.playerSprite : this.otherSprites.get(fighter.id);
      if (!sprite) {
        continue;
      }
      // 被墙体挡住的敌人不渲染；自己永远可见
      sprite.setVisible(this.isFighterVisible(fighter));
      sprite.setPosition(fighter.x, fighter.y);
      if (!fighter.isDummy) {
        sprite.setFlipX(fighter.facingX < 0);
      }
    }

    this.syncBullets();
    this.syncPickups();
  }

  /**
   * 这个单位现在应不应该被本地玩家看到（需求 2.4：墙体遮挡视线）。
   * 假人与其他玩家都走同一条规则。
   */
  private isFighterVisible(fighter: PlayerState): boolean {
    if (!fighter.alive) {
      return false;
    }
    if (fighter.id === this.localPlayerId) {
      return true;
    }
    const viewer = this.findLocalPlayer();
    if (!viewer) {
      return false;
    }
    return hasLineOfSight(this.state.walls, viewer.x, viewer.y, fighter.x, fighter.y);
  }

  /** 子弹与 state.bullets 对齐：state 里有的保证有贴图，消失的销毁 */
  private syncBullets(): void {
    const liveBulletIds = new Set<number>();
    for (const bullet of this.state.bullets) {
      liveBulletIds.add(bullet.id);
      let sprite = this.bulletSprites.get(bullet.id);
      if (!sprite) {
        sprite = this.add.image(bullet.x, bullet.y, TEX.bullet).setDepth(20);
        this.bulletSprites.set(bullet.id, sprite);
      }
      sprite.setPosition(bullet.x, bullet.y);
    }

    for (const [id, sprite] of this.bulletSprites) {
      if (liveBulletIds.has(id)) {
        continue;
      }
      sprite.destroy();
      this.bulletSprites.delete(id);
    }
  }

  /**
   * 同步地上的道具。
   *
   * 与子弹的做法一致：state 里有就确保有贴图，state 里没了就销毁贴图。
   * 道具不会移动，所以只在新出现时创建一次，之后不用每帧改位置。
   */
  private syncPickups(): void {
    const liveIds = new Set<number>();

    for (const pickup of this.state.pickups) {
      liveIds.add(pickup.id);
      if (this.pickupSprites.has(pickup.id)) {
        continue;
      }

      const sprite = this.add.image(pickup.x, pickup.y, itemTextureKey(pickup.itemId)).setDepth(6);
      // 轻微呼吸缩放，让道具在满屏子弹里也容易被注意到
      this.tweens.add({
        targets: sprite,
        scale: { from: 0.85, to: 1.1 },
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.pickupSprites.set(pickup.id, sprite);
    }

    for (const [id, sprite] of this.pickupSprites) {
      if (liveIds.has(id)) {
        continue;
      }
      // 先停掉补间再销毁，避免补间继续操作已经被销毁的对象
      this.tweens.killTweensOf(sprite);
      sprite.destroy();
      this.pickupSprites.delete(id);
    }
  }

  /** R：重开一局（保留角色与时长参数） */
  private restartRound(): void {
    this.scene.restart();
  }

  /** ESC：打开暂停界面并把战斗场景冻住 */
  private openPause(): void {
    if (!this.scene.isActive()) {
      return;
    }
    this.scene.launch(SceneKeys.Pause, this.battleData);
    this.scene.pause();
  }

  /** 对局结束：把战果交给结算界面 */
  private showResult(): void {
    if (this.isResultShown) {
      return;
    }
    const player = this.findLocalPlayer();
    if (!player) {
      return;
    }
    this.isResultShown = true;

    // 联机时结算分数以服务端下发为准（客户端只知道自己看到的那部分）
    const officialScore = this.onlineSession?.finalScores.find(
      (entry) => entry.playerId === player.id,
    )?.score;

    const resultData: ResultSceneData = {
      characterId: this.battleData.characterId,
      matchDurationMs: this.battleData.matchDurationMs,
      score: { ...player.score, ...(officialScore ?? {}) },
      isTimeUp: this.battleData.matchDurationMs !== undefined || Boolean(this.onlineSession),
    };

    this.scene.launch(SceneKeys.Result, resultData);
    this.scene.pause();
  }

  /**
   * 消费本步产生的事件，把"逻辑上发生了什么"翻译成声音和画面。
   *
   * 事件由 shared/step() 收集，每步开始时清空——
   * 所以一定要在每次 step() 之后立刻调用，否则一帧里多步的事件会被下一步覆盖。
   */
  private handleEvents(): void {
    for (const event of this.state.events) {
      switch (event.type) {
        case 'shoot': {
          // 枪口闪光：几颗粒子向外扩散。rate 轻微随机，连射时不会听起来像复读机
          this.impactEmitter.explode(3, event.x, event.y);
          this.audio.play(SFX.shoot, {
            x: event.x,
            y: event.y,
            rate: Phaser.Math.FloatBetween(0.94, 1.06),
          });
          break;
        }

        case 'hit': {
          const targetSprite =
            event.targetId === this.localPlayerId
              ? this.playerSprite
              : this.otherSprites.get(event.targetId);
          if (targetSprite) {
            this.flashSprite(targetSprite);
          }
          // 命中火花放在子弹的位置，而不是目标中心，看起来更像"打在表面"
          this.impactEmitter.explode(8, event.x, event.y);
          this.audio.play(SFX.hit, {
            x: event.x,
            y: event.y,
            rate: Phaser.Math.FloatBetween(0.92, 1.08),
          });

          // 自己挨打时额外给红闪 + 镜头轻震，这是"被击中"最直接的感知
          if (event.targetId === this.localPlayerId) {
            this.cameras.main.shake(90, 0.004);
            this.audio.play(SFX.hurt);
            this.flashDangerOverlay();
          }
          break;
        }

        case 'shieldBreak': {
          const sprite =
            event.playerId === this.localPlayerId
              ? this.playerSprite
              : this.otherSprites.get(event.playerId);
          // 破盾用更长的闪白，让玩家明确知道"盾没了，接下来掉血"
          if (sprite) {
            this.flashSprite(sprite, 140);
          }
          this.audio.play(SFX.shieldBreak, { x: sprite?.x, y: sprite?.y });
          break;
        }

        case 'death': {
          const sprite =
            event.playerId === this.localPlayerId
              ? this.playerSprite
              : this.otherSprites.get(event.playerId);
          if (sprite) {
            sprite.setTint(0x50505f);
            this.impactEmitter.explode(20, sprite.x, sprite.y);
          }
          this.audio.play(SFX.death, { x: sprite?.x, y: sprite?.y });
          this.cameras.main.shake(160, 0.006);
          break;
        }

        case 'respawn': {
          const sprite =
            event.playerId === this.localPlayerId
              ? this.playerSprite
              : this.otherSprites.get(event.playerId);
          sprite?.clearTint();
          break;
        }

        case 'pickup': {
          // 捡到道具：一圈小光点 + 上扬音效，告诉玩家"生效了"
          this.impactEmitter.explode(10, event.x, event.y);
          this.audio.play(SFX.pickup);
          break;
        }

        case 'matchEnd': {
          // 这里只做音效提示，真正的切场景在 update 末尾统一处理（保证画面先画完）
          this.audio.play(SFX.pickup, { rate: 0.8 });
          break;
        }

        default:
          break;
      }
    }
  }

  /**
   * 创建可复用的粒子发射器与受伤遮罩。
   *
   * 粒子不要"每次命中新建一个"——那样会不断创建对象，帧率会被 GC 拖低。
   * 正确做法是建一个不自动发射的发射器，命中时调用 explode(数量, x, y) 借它喷一下。
   */
  private createEffects(): void {
    this.impactEmitter = this.add.particles(0, 0, TEX.particle, {
      /** 每颗粒子活多久（毫秒） */
      lifespan: 260,
      /** 初速度范围（像素/秒） */
      speed: { min: 60, max: 220 },
      /** 由大到小 */
      scale: { start: 1.6, end: 0 },
      /** 由不透明到透明 */
      alpha: { start: 1, end: 0 },
      /** ADD 混合让火花在深色背景上发光 */
      blendMode: 'ADD',
      /** 不自动发射，等我们手动 explode */
      emitting: false,
    });
    this.impactEmitter.setDepth(30);

    // 受伤红闪：一张铺满屏幕的红色矩形，平时 alpha 为 0
    this.dangerOverlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xff2233, 0)
      .setOrigin(0)
      // scrollFactor(0) = 不随相机滚动，钉在屏幕上（HUD 类元素都要这样）
      .setScrollFactor(0)
      .setDepth(900);
  }

  /** 受伤红闪：瞬间提高遮罩不透明度，再用补间淡回透明 */
  private flashDangerOverlay(): void {
    this.dangerOverlay.setAlpha(0.28);
    this.tweens.add({
      targets: this.dangerOverlay,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeOut',
    });
  }

  /**
   * 画其他战斗单位头顶的血条与盾条（假人 / 联机里的其他玩家）。
   *
   * Graphics 是"每帧重新画"的画笔：先 clear() 清掉上一帧，再按当前数值画。
   * 单位数量少（十几个以内），重画的成本可以忽略，而代码读起来更直白。
   */
  private drawOtherBars(): void {
    for (const fighter of this.state.players) {
      if (fighter.id === this.localPlayerId) {
        continue;
      }
      const bar = this.otherBars.get(fighter.id);
      if (!bar) {
        continue;
      }

      bar.clear();
      if (!this.isFighterVisible(fighter)) {
        // 看不见的敌人，血条也一起隐藏
        continue;
      }

      const barWidth = 40;
      const barHeight = 4;
      const left = fighter.x - barWidth / 2;
      const top = fighter.y - 36;

      // 底板
      bar.fillStyle(0x000000, 0.6);
      bar.fillRect(left - 1, top - 1, barWidth + 2, barHeight * 2 + 4);

      // 生命条
      bar.fillStyle(0x40161d, 1);
      bar.fillRect(left, top, barWidth, barHeight);
      bar.fillStyle(0xff4d5e, 1);
      bar.fillRect(left, top, barWidth * (fighter.hp / fighter.stats.maxHp), barHeight);

      // 护盾条（与生命分开，和 HUD 保持一致）
      bar.fillStyle(0x152a3d, 1);
      bar.fillRect(left, top + barHeight + 2, barWidth, barHeight);
      bar.fillStyle(0x4dc3ff, 1);
      bar.fillRect(
        left,
        top + barHeight + 2,
        barWidth * (fighter.shield / fighter.stats.maxShield),
        barHeight,
      );
    }
  }

  /** 受击闪白：v4 的 tint 需要显式指定 FILL 模式（setTintFill 已移除） */
  private flashSprite(sprite: Phaser.GameObjects.Image, durationMs = 70): void {
    sprite.setTint(0xffffff);
    sprite.setTintMode(Phaser.TintModes.FILL);
    this.time.delayedCall(durationMs, () => {
      if (sprite.active) {
        sprite.clearTint();
      }
    });
  }

  private updateHud(): void {
    const player = this.findLocalPlayer();
    if (!player) {
      // 联机刚入房、还没收到快照：先不画 HUD，避免读到不存在的玩家
      this.hudGraphics.clear();
      this.hudText.setText('正在连接…');
      this.timerText.setText('');
      return;
    }
    const barWidth = 132;
    const barHeight = 6;
    const left = 8;
    const top = 8;

    this.hudGraphics.clear();
    this.hudGraphics.fillStyle(0x000000, 0.55);
    this.hudGraphics.fillRect(left - 2, top - 2, barWidth + 4, barHeight * 2 + 8);

    // 生命条
    this.hudGraphics.fillStyle(0x40161d, 1);
    this.hudGraphics.fillRect(left, top, barWidth, barHeight);
    this.hudGraphics.fillStyle(0xff4d5e, 1);
    this.hudGraphics.fillRect(left, top, barWidth * (player.hp / player.stats.maxHp), barHeight);

    // 护盾条（需求 8.3：与 HP 分开显示）
    this.hudGraphics.fillStyle(0x152a3d, 1);
    this.hudGraphics.fillRect(left, top + barHeight + 4, barWidth, barHeight);
    this.hudGraphics.fillStyle(0x4dc3ff, 1);
    this.hudGraphics.fillRect(
      left,
      top + barHeight + 4,
      barWidth * (player.shield / player.stats.maxShield),
      barHeight,
    );

    const aliveOpponents = this.state.players.filter(
      (fighter) => fighter.alive && fighter.id !== player.id,
    ).length;

    // 增益列表：HUD 上必须能看到"我现在身上有什么、还剩多久"（需求 8.3 的增益状态图标）
    const buffText =
      player.activeEffects.length === 0
        ? '增益：无'
        : `增益：${player.activeEffects
            .map(
              (effect) =>
                `${ITEMS[effect.itemId].shortLabel} ${(effect.remainingMs / 1000).toFixed(1)}s`,
            )
            .join('  ')}`;

    this.hudText.setText([
      `HP ${Math.ceil(player.hp)}/${player.stats.maxHp}    护盾 ${Math.floor(player.shield)}/${player.stats.maxShield}`,
      `子弹 ${this.state.bullets.length}    存活对手 ${aliveOpponents}    击倒 ${player.score.kills}    帧 ${this.state.tick}`,
      buffText,
    ]);

    // 倒计时只在限时模式显示
    if (this.state.matchEndsAtMs === Infinity) {
      this.timerText.setText('');
    } else {
      const remainingMs = Math.max(0, this.state.matchEndsAtMs - this.state.timeMs);
      this.timerText.setText(`${(remainingMs / 1000).toFixed(1)}s`);
    }

    this.updateMinimap(player);
  }

  /**
   * 小地图（需求 2.4：开阔区雷达 + 掩体后记忆）。
   *
   * - 视线可达的敌人：实时圆点；
   * - 被墙挡住的敌人：显示"最后已知位置"方框，超过 4 秒没再看到就消失；
   * - 超出雷达半径的点不显示（由 Minimap 内部裁剪）。
   */
  private updateMinimap(viewer: PlayerState): void {
    const markers: MinimapMarker[] = [];
    const now = this.state.timeMs;

    for (const other of this.state.players) {
      if (other.id === viewer.id || !other.alive) {
        continue;
      }

      if (this.isFighterVisible(other)) {
        this.lastKnownPositions.set(other.id, { x: other.x, y: other.y, atMs: now });
        markers.push({ x: other.x, y: other.y, color: 0xff4d5e, alpha: 1 });
        continue;
      }

      const memory = this.lastKnownPositions.get(other.id);
      if (!memory) {
        continue;
      }
      if (now - memory.atMs > MEMORY_MARKER_LIFETIME) {
        this.lastKnownPositions.delete(other.id);
        continue;
      }
      markers.push({ x: memory.x, y: memory.y, color: 0xff4d5e, alpha: 0.45, isMemory: true });
    }

    this.minimap.update({ x: viewer.x, y: viewer.y }, markers);
  }

  /** 找本地玩家：联机还没收到快照时可能不存在，所以返回可能为 null */
  private findLocalPlayer(): PlayerState | null {
    return this.state.players.find((player) => player.id === this.localPlayerId) ?? null;
  }
}
