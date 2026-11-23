import Phaser from 'phaser';
import {
  PLAYER_ID,
  AiController,
  applySnapshotToState,
  battleConfig,
  createBattleState,
  getCharacter,
  getMap,
  hasLineOfSight,
  step,
} from '@shared';
import type { BattleState, PlayerInput, PlayerState, Rect } from '@shared';
import { ITEMS } from '@shared/config/items';
import { AUDIO_REGISTRY_KEY, SFX, type AudioManager } from '../audio/audio-manager';
import { KeyboardMouseInput } from '../input/keyboard-mouse-input';
import { OnlineSession } from '../net/online-session';
import { GAME_HEIGHT, GAME_WIDTH } from '../render/integer-scale';
import { Minimap, type MinimapMarker } from '../render/minimap';
import { TEX, itemTextureKey } from '../render/placeholder-textures';
import type { BattleSceneData, ResultSceneData } from './scene-data';
import { SceneKeys } from './scene-keys';

/** 视野核心半角：这个范围内按遮挡结果给正常亮度，敌人也在这里才算"看得见" */
const VISION_CORE_HALF = (55 * Math.PI) / 180;
/** 视野外沿半角：核心 → 外沿之间亮度渐暗，避免扇区出现一条硬边 */
const VISION_OUTER_HALF = (80 * Math.PI) / 180;
/** 每弧度采样多少条射线：越大亮区边界越平滑（数值与性能的折中） */
const VISION_RAYS_PER_RADIAN = 120;
/** 墙角射线两侧的微小角度偏移：让亮区边界精确卡在墙角上（约 0.02°） */
const CORNER_EPSILON = 0.0004;
/** 遮罩超出屏幕四角的余量（像素） */
const SHADOW_MARGIN = 48;
/** 地图灰暗遮罩透明度 */
const FOG_ALPHA = 0.35;

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
  /** 视野外压暗遮罩：放在世界物件上方、HUD 下方 */
  private visionOverlay!: Phaser.GameObjects.Graphics;
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
  /** 会遮挡视线的墙体（排除地图边界墙），按需缓存 */
  private occluders: Rect[] | null = null;

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
  /** 复用的瞄准点对象，避免每帧新建 Vector2 */
  private readonly aimPoint = new Phaser.Math.Vector2();
  /** AI 控制器：单人模式下驱动 isAi 单位（只产出输入，不碰判定） */
  private ai = new AiController();
  /** 真人玩家 id 集合：AI 只把这些人当目标 */
  private readonly humanIds = new Set<number>([PLAYER_ID]);
  /** 热键监听器（window 捕获阶段），场景 shutdown 时解绑 */
  private hotkeyHandler: ((event: KeyboardEvent) => void) | null = null;

  constructor() {
    super(BattleScene.KEY);
  }

  /** 接收从选人界面传来的参数（角色、是否限时、是否联机、AI 数量） */
  init(data: BattleSceneData): void {
    this.battleData = {
      characterId: data.characterId ?? 'reimu',
      matchDurationMs: data.matchDurationMs,
      onlineRoom: data.onlineRoom,
      aiOpponents: data.aiOpponents ?? 0,
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
        // 单人模式：生成一个会走位、会开火的 AI 对手（练习场假人仍保留，可当靶子）
        aiCount: this.battleData.aiOpponents ?? 0,
        dummyCount: this.battleData.aiOpponents ? 1 : undefined,
      });
      this.localPlayerId = PLAYER_ID;
    }
    this.accumulatorMs = 0;
    this.onlineSendAccumulatorMs = 0;
    this.predictedSelf = { x: 0, y: 0, ready: false };
    this.actorSignature = '';
    this.isResultShown = false;
    // 重开时世界会被重建，缓存必须一起清掉，否则会拿上一局的地图判定遮挡
    this.occluders = null;
    // AI 记忆里存着上一局的位置基准，重开必须重置
    this.ai.reset();
    this.humanIds.clear();
    this.humanIds.add(PLAYER_ID);

    // 2. 清空"从 state 派生出来的显示对象"索引表，避免重开时残留旧引用
    this.playerSprite = undefined;
    this.otherSprites.clear();
    this.otherBars.clear();
    this.bulletSprites.clear();
    this.pickupSprites.clear();
    this.frameInputs.clear();

    // 3. 搭画面：地图 → 角色 → 相机 → HUD → 特效
    //    注意：createActors 换成了每帧调用的 ensureActors()，因为联机时玩家是陆续入房的
    this.createMap();
    this.setupCamera();
    this.createHud();
    this.createEffects();

    // 4. 输入与音效
    this.inputSource = new KeyboardMouseInput(this);
    //
    // 暂停/重开的按键监听**不走 Phaser 的 KeyboardPlugin**：
    // 1. Phaser 的 Key.isDown 依赖每帧更新，在某些宿主环境（VS Code 内置浏览器）里一直是 false；
    // 2. 更要紧的是：Escape 常被宿主或浏览器先 preventDefault，而 Phaser 的 KeyboardManager
    //    遇到 `event.defaultPrevented` 会直接丢弃事件（源码见 KeyboardManager.onKeyDown），
    //    于是"ESC 暂停"时好时坏、甚至完全没反应。
    // 所以在 window 的**捕获阶段**直接监听原生事件，早于任何冒泡阶段的 preventDefault 处理。
    this.bindHotkeys();
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
        fontSize: '24px',
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

    // 固定步长推进：渲染帧率与逻辑帧率解耦；单帧最多补 5 步，避免切回标签页时一次性快进
    this.accumulatorMs += Math.min(deltaMs, 200);
    let steps = 0;
    while (!this.state.isFinished && this.accumulatorMs >= battleConfig.stepMs && steps < 5) {
      // 每个逻辑帧重新采样输入：AI 必须和真人用同一份输入结构，才能共用同一个 step()
      this.frameInputs.clear();
      this.frameInputs.set(player.id, this.inputSource.sample({ x: player.x, y: player.y }));
      this.ai.fillInputs(this.state, this.humanIds, this.frameInputs);

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
    // 地图从 state.mapId 还原：同一份地图定义在服务端与客户端各自生成墙体（协议里不发墙体）
    const map = getMap(this.state.mapId);

    this.add
      .tileSprite(0, 0, this.state.mapWidth, this.state.mapHeight, map.floorTextureKey)
      .setOrigin(0)
      .setDepth(-20);

    for (const wall of this.state.walls) {
      this.add
        .tileSprite(wall.x, wall.y, wall.width, wall.height, map.wallTextureKey)
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
        fighter.characterId === 'dummy' ? TEX.dummy : getCharacter(fighter.characterId).textureKey;
      const sprite = this.add.image(fighter.x, fighter.y, texture).setDepth(10);
      if (fighter.id === this.localPlayerId) {
        this.playerSprite = sprite;
        sprite.setDepth(850);
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
      .text(16, 52, '', {
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: '22px',
        color: '#cdd6ea',
      })
      .setScrollFactor(0)
      .setDepth(1001);

    // 挑战模式的倒计时，放在屏幕正上方居中
    this.timerText = this.add
      .text(GAME_WIDTH / 2, 16, '', {
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: '28px',
        color: '#ffe9a8',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1001);

    this.add
      .text(16, 680, 'WASD 移动 · 鼠标瞄准 · 左键射击 · ESC/P 暂停 · R 重开', {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '20px',
        color: '#5a5a6a',
      })
      .setScrollFactor(0)
      .setDepth(1001);

    // 可点击的暂停按钮：键位在某些宿主环境里可能被拦截，鼠标点总能用
    this.add
      .text(GAME_WIDTH - 16, 12, 'Ⅱ 暂停', {
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        fontSize: '22px',
        color: '#8b93a8',
        backgroundColor: '#14141c',
        padding: { x: 16, y: 8 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1001)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openPause());

    // 小地图放右下角：雷达半径 300 世界像素（大于半个屏幕宽），符合"雷达范围大于可视范围"的设计
    this.minimap = new Minimap(this, this.state.walls, {
      x: GAME_WIDTH - 192,
      y: GAME_HEIGHT - 192,
      size: 176,
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
      // 视野外或被墙挡住的敌人不渲染，视野内敌人置于压暗遮罩上方。
      const visible = this.isFighterVisible(fighter);
      sprite.setVisible(visible);
      if (fighter.id !== this.localPlayerId) {
        sprite.setDepth(visible ? 850 : 10);
      }
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
    return (
      this.isInVisionCone(viewer, fighter.x, fighter.y) &&
      hasLineOfSight(this.state.walls, viewer.x, viewer.y, fighter.x, fighter.y)
    );
  }

  private isInVisionCone(viewer: PlayerState, x: number, y: number): boolean {
    const aim = this.getAimWorldPoint();
    const aimX = aim.x - viewer.x;
    const aimY = aim.y - viewer.y;
    const targetX = x - viewer.x;
    const targetY = y - viewer.y;
    if (Math.hypot(aimX, aimY) < 1 || Math.hypot(targetX, targetY) < 1) {
      return true;
    }
    const cosine =
      (aimX * targetX + aimY * targetY) / (Math.hypot(aimX, aimY) * Math.hypot(targetX, targetY));
    return cosine >= Math.cos(VISION_CORE_HALF);
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

  /**
   * 绑定暂停/重开热键（ESC / P / R）。
   *
   * 用 window 的捕获阶段监听原生事件，而不是 Phaser 的 KeyboardPlugin：
   * - 捕获阶段先于冒泡，任何后加的 preventDefault 都拦不住；
   * - 不必担心 `event.defaultPrevented` 被 Phaser 丢弃。
   * 监听器在场景 shutdown 时解绑，避免重开后叠加多个。
   */
  private bindHotkeys(): void {
    if (this.hotkeyHandler) {
      window.removeEventListener('keydown', this.hotkeyHandler, true);
    }

    this.hotkeyHandler = (event: KeyboardEvent): void => {
      // 场景没在跑（已暂停 / 已被结算界面顶掉）时不要抢键：
      // 暂停界面自己也要用 ESC 继续，这里必须放行，否则会被永久卡住。
      if (!this.scene.isActive()) {
        return;
      }

      // 输入框里打字时不要抢键：ESC 例外（用于脱离输入框）
      const target = event.target as HTMLElement | null;
      const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.openPause();
        return;
      }

      if (isTyping) {
        return;
      }

      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        this.openPause();
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        this.restartRound();
      }
    };

    window.addEventListener('keydown', this.hotkeyHandler, true);

    this.events.once('shutdown', () => {
      if (this.hotkeyHandler) {
        window.removeEventListener('keydown', this.hotkeyHandler, true);
        this.hotkeyHandler = null;
      }
    });
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
    // 视野遮罩画在世界坐标里（不钉屏）：相机每帧会插值滚动，
    // 若钉屏后再减 scrollX/scrollY，用的还是上一帧的相机位置，阴影会整体相对地图抖动几个像素，
    // 表现为"阴影边缘和障碍物对不齐"。跟着世界一起动就没有这个问题。
    this.visionOverlay = this.add.graphics().setDepth(800);
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
        bar.setDepth(15);
        continue;
      }
      bar.setDepth(850);

      const barWidth = 80;
      const barHeight = 8;
      const left = fighter.x - barWidth / 2;
      const top = fighter.y - 72;

      // 底板
      bar.fillStyle(0x000000, 0.6);
      bar.fillRect(left - 2, top - 2, barWidth + 4, barHeight * 2 + 8);

      // 生命条
      bar.fillStyle(0x40161d, 1);
      bar.fillRect(left, top, barWidth, barHeight);
      bar.fillStyle(0xff4d5e, 1);
      bar.fillRect(left, top, barWidth * (fighter.hp / fighter.stats.maxHp), barHeight);

      // 护盾条（与生命分开，和 HUD 保持一致）
      bar.fillStyle(0x152a3d, 1);
      bar.fillRect(left, top + barHeight + 4, barWidth, barHeight);
      bar.fillStyle(0x4dc3ff, 1);
      bar.fillRect(
        left,
        top + barHeight + 4,
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
    this.updateVisionOverlay();
    const player = this.findLocalPlayer();
    if (!player) {
      // 联机刚入房、还没收到快照：先不画 HUD，避免读到不存在的玩家
      this.hudGraphics.clear();
      this.hudText.setText('正在连接…');
      this.timerText.setText('');
      return;
    }
    const barWidth = 264;
    const barHeight = 12;
    const left = 16;
    const top = 16;

    this.hudGraphics.clear();
    this.hudGraphics.fillStyle(0x000000, 0.55);
    this.hudGraphics.fillRect(left - 4, top - 4, barWidth + 8, barHeight * 2 + 16);

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
      `存活对手 ${aliveOpponents}    击倒 ${player.score.kills}`,
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

  private updateVisionOverlay(): void {
    const viewer = this.findLocalPlayer();
    const overlay = this.visionOverlay;
    overlay.clear();
    if (!viewer) {
      return;
    }

    const aim = this.getAimWorldPoint();
    const aimX = aim.x - viewer.x;
    const aimY = aim.y - viewer.y;
    const aimAngle = Math.hypot(aimX, aimY) < 1 ? 0 : Math.atan2(aimY, aimX);

    // 遮罩只需盖住屏幕：按屏幕四角算半径，比用整张地图的对角线更省填充面积、也少些浮点抖动
    const coverRadius = this.getCoverRadius(viewer);
    const centerX = viewer.x;
    const centerY = viewer.y;

    // 射线角度 = 均匀采样 + 墙角射线。
    // 只做均匀采样时，亮区边界会停在"某条射线正好打到的墙面"上，与墙角差半个角步长，
    // 表现为阴影边缘和障碍物边缘对不齐；补上墙角射线（两侧各紧贴一条）后，
    // 亮区边界就能精确贴合墙角。
    const offsets: number[] = [];
    const rayCount = Math.ceil(VISION_OUTER_HALF * 2 * VISION_RAYS_PER_RADIAN);
    for (let i = 0; i <= rayCount; i += 1) {
      offsets.push(-VISION_OUTER_HALF + (VISION_OUTER_HALF * 2 * i) / rayCount);
    }
    for (const wall of this.state.walls) {
      for (const cornerX of [wall.x, wall.x + wall.width]) {
        for (const cornerY of [wall.y, wall.y + wall.height]) {
          const offset = Phaser.Math.Angle.Wrap(
            Math.atan2(cornerY - viewer.y, cornerX - viewer.x) - aimAngle,
          );
          if (Math.abs(offset) > VISION_OUTER_HALF) {
            continue;
          }
          offsets.push(offset - CORNER_EPSILON, offset + CORNER_EPSILON);
        }
      }
    }
    offsets.sort((a, b) => a - b);

    // 每条射线：可视距离。终点取「墙的外沿」，阴影从墙轮廓之后开始。
    const distances: number[] = [];
    for (const offset of offsets) {
      distances.push(
        Math.min(
          this.getVisibilityDistance(viewer.x, viewer.y, aimAngle + offset, coverRadius),
          coverRadius,
        ),
      );
    }

    const angleAt = (index: number): number => aimAngle + offsets[index];
    const pointAt = (angle: number, radius: number): [number, number] => [
      centerX + Math.cos(angle) * radius,
      centerY + Math.sin(angle) * radius,
    ];

    /**
     * 逐条射线区间绘制，alpha 由该区间的**连续角度**决定。
     *
     * 之前按 10 个「渐暗档」绘制，相邻档位的 alpha 是跳变的，
     * 于是每一档的边界都变成一条从玩家向外发散的硬边（截图里那几条斜线）。
     * 改成按区间连续插值后，相邻区间 alpha 只差千分之几，肉眼看不到接缝。
     *
     * 分两遍画，避免每个三角形都切换一次填充色（那会让 draw call 翻几倍）：
     *  第一遍：所有「可见边界之外」的梯形，统一满强度 —— 墙后一律不透光；
     *  第二遍：所有「可见边界之内」的三角形 —— 核心视野内跳过，向外连续加深。
     */
    const nearPoints: Array<[[number, number], [number, number]]> = [];
    for (let i = 0; i < offsets.length - 1; i += 1) {
      nearPoints.push([
        pointAt(angleAt(i), distances[i]),
        pointAt(angleAt(i + 1), distances[i + 1]),
      ]);
    }

    overlay.fillStyle(0x000000, FOG_ALPHA);
    for (let i = 0; i < nearPoints.length; i += 1) {
      const [nearA, nearB] = nearPoints[i];
      const farA = pointAt(angleAt(i), coverRadius);
      const farB = pointAt(angleAt(i + 1), coverRadius);
      overlay.fillTriangle(nearA[0], nearA[1], farA[0], farA[1], farB[0], farB[1]);
      overlay.fillTriangle(nearA[0], nearA[1], farB[0], farB[1], nearB[0], nearB[1]);
    }

    // 渐暗区按 32 级 alpha 分组绘制：32 级在 25° 内每级约 0.8°，肉眼看不出台阶，
    // 却能把几百次填充色切换压缩到几十次。
    const ALPHA_LEVELS = 32;
    const buckets = new Map<number, number[]>();
    for (let i = 0; i < nearPoints.length; i += 1) {
      const midAngle = Math.abs(
        Phaser.Math.Angle.Wrap((angleAt(i) + angleAt(i + 1)) / 2 - aimAngle),
      );
      if (midAngle <= VISION_CORE_HALF) {
        continue;
      }
      const t =
        midAngle >= VISION_OUTER_HALF
          ? 1
          : (midAngle - VISION_CORE_HALF) / (VISION_OUTER_HALF - VISION_CORE_HALF);
      const level = Math.min(ALPHA_LEVELS, Math.ceil(t * ALPHA_LEVELS));
      const list = buckets.get(level);
      if (list) {
        list.push(i);
      } else {
        buckets.set(level, [i]);
      }
    }

    for (const [level, indices] of buckets) {
      overlay.fillStyle(0x000000, (FOG_ALPHA * level) / ALPHA_LEVELS);
      for (const i of indices) {
        const [nearA, nearB] = nearPoints[i];
        overlay.fillTriangle(centerX, centerY, nearA[0], nearA[1], nearB[0], nearB[1]);
      }
    }

    // 3) 外沿之外：整片暗色（覆盖到屏幕角）
    overlay.fillStyle(0x000000, FOG_ALPHA);
    overlay.beginPath();
    overlay.moveTo(centerX, centerY);
    const outsideSteps = 128;
    for (let i = 0; i <= outsideSteps; i += 1) {
      const angle =
        aimAngle + VISION_OUTER_HALF + (Math.PI * 2 - VISION_OUTER_HALF * 2) * (i / outsideSteps);
      overlay.lineTo(...pointAt(angle, coverRadius));
    }
    overlay.closePath();
    overlay.fillPath();
  }

  /** 遮罩半径：覆盖到屏幕四角即可，留一点余量防止相机移动时露边 */
  private getCoverRadius(viewer: PlayerState): number {
    const camera = this.cameras.main;
    const corners: Array<[number, number]> = [
      [camera.scrollX, camera.scrollY],
      [camera.scrollX + camera.width, camera.scrollY],
      [camera.scrollX, camera.scrollY + camera.height],
      [camera.scrollX + camera.width, camera.scrollY + camera.height],
    ];

    let radius = 0;
    for (const [cornerX, cornerY] of corners) {
      radius = Math.max(radius, Math.hypot(cornerX - viewer.x, cornerY - viewer.y));
    }
    return radius + SHADOW_MARGIN;
  }

  /**
   * 遮挡视线的墙：排除地图四周的边界墙。
   *
   * 边界墙厚一整个 tile，浅角度射线会「走在墙体内」很久才穿出，
   * 深角度射线则很快穿出，于是屏幕边缘会出现一条与任何障碍物都无关的水平/垂直阴影分界。
   * 边界墙外本来就没有东西可看，让它遮挡只会产生这种假阴影。
   */
  private getOccluders(): Rect[] {
    if (!this.occluders) {
      const { mapWidth, mapHeight } = this.state;
      this.occluders = this.state.walls.filter(
        (wall) =>
          wall.x > 0 &&
          wall.y > 0 &&
          wall.x + wall.width < mapWidth &&
          wall.y + wall.height < mapHeight,
      );
    }
    return this.occluders;
  }

  /**
   * 这条射线能照多远。
   *
   * 返回的是「最近那块墙的远侧」，而不是近侧：
   * 亮的区域要包含整块墙本身，阴影从墙的外轮廓之后开始。
   * 若取近侧，阴影会把墙切掉一半，视觉上阴影边缘与障碍物轮廓永远差一截。
   */
  private getVisibilityDistance(x: number, y: number, angle: number, maxDistance: number): number {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let nearestEntry = maxDistance;
    let wallExit = maxDistance;

    for (const wall of this.getOccluders()) {
      if (Math.abs(dx) < 1e-9 && (x < wall.x || x > wall.x + wall.width)) {
        continue;
      }
      if (Math.abs(dy) < 1e-9 && (y < wall.y || y > wall.y + wall.height)) {
        continue;
      }
      const t1 = Math.abs(dx) < 1e-9 ? -Infinity : (wall.x - x) / dx;
      const t2 = Math.abs(dx) < 1e-9 ? Infinity : (wall.x + wall.width - x) / dx;
      const t3 = Math.abs(dy) < 1e-9 ? -Infinity : (wall.y - y) / dy;
      const t4 = Math.abs(dy) < 1e-9 ? Infinity : (wall.y + wall.height - y) / dy;
      const entry = Math.max(Math.min(t1, t2), Math.min(t3, t4));
      const exit = Math.min(Math.max(t1, t2), Math.max(t3, t4));

      // 只考虑射线前方真正穿过的墙（entry > 0），且取最近的那一块
      if (exit < 0 || entry > exit || entry <= 0) {
        continue;
      }
      if (entry < nearestEntry) {
        nearestEntry = entry;
        wallExit = exit;
      }
    }

    return Math.max(0, Math.min(wallExit, maxDistance));
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

    for (const other of this.state.players) {
      if (other.id === viewer.id || !other.alive) {
        continue;
      }

      if (this.isFighterVisible(other)) {
        markers.push({ x: other.x, y: other.y, color: 0xff4d5e, alpha: 1 });
      }
    }

    this.minimap.update({ x: viewer.x, y: viewer.y }, markers);
  }

  /** 找本地玩家：联机还没收到快照时可能不存在，所以返回可能为 null */
  private findLocalPlayer(): PlayerState | null {
    return this.state.players.find((player) => player.id === this.localPlayerId) ?? null;
  }

  /**
   * 光标当前对应的世界坐标。
   *
   * 每次实时按当前相机反算，**不要**直接读 `pointer.worldX / worldY`：
   * 那两个值只在指针事件触发命中测试时才刷新，相机跟随玩家滚动而鼠标没动时会停在旧值上，
   * 导致瞄准方向偏移（"子弹落点和光标不一致"，且只在移动时偶发）。
   */
  private getAimWorldPoint(): Phaser.Math.Vector2 {
    const pointer = this.input.activePointer;
    this.cameras.main.getWorldPoint(pointer.x, pointer.y, this.aimPoint);
    return this.aimPoint;
  }
}
