import Phaser from 'phaser';
import type { PlayerInput } from '@shared/types';

interface MoveKeys {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
}

/**
 * 键鼠输入采集。
 *
 * 只负责把「按键 + 光标位置」翻译成共享层的 PlayerInput 意图，
 * 不做任何游戏判定——判定全部在 shared/ 里（tech-design 8.2）。
 * 将来接手柄、触屏、网络时，替换这个类即可，step() 不需要改动。
 */
export class KeyboardMouseInput {
  private readonly keys: MoveKeys;
  /** 复用的输出对象，避免每帧新建 Vector2 */
  private readonly aimPoint = new Phaser.Math.Vector2();

  constructor(private readonly scene: Phaser.Scene) {
    this.keys = scene.input.keyboard!.addKeys('W,A,S,D') as MoveKeys;
  }

  /**
   * 光标当前对应的**世界坐标**。
   *
   * 为什么不用 `pointer.worldX / worldY`：
   * Phaser 只在「指针事件触发命中测试」时才刷新这两个值（见 Phaser 的
   * `InputManager.hitTest`）。相机跟着玩家滚动、而鼠标没动的时候，
   * 它们会**停留在旧值上**，于是瞄准方向会出现偏差
   * （表现为"子弹落点和光标不一致"，且只在移动时偶发）。
   *
   * 这里用当前相机的变换矩阵反算，永远和屏幕上看到的位置一致。
   */
  getAimPoint(): { x: number; y: number } {
    const pointer = this.scene.input.activePointer;
    this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y, this.aimPoint);
    return this.aimPoint;
  }

  /**
   * 采样当前帧的输入意图。
   * @param fallback 光标尚未进入画布时的默认瞄准点，取角色自身位置右侧一点，避免瞄向 (0,0)
   */
  sample(fallback: { x: number; y: number }): PlayerInput {
    const pointer = this.scene.input.activePointer;
    const hasPointer = pointer.active;
    const aim = this.getAimPoint();

    return {
      moveX: (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0),
      moveY: (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0),
      aimX: hasPointer ? aim.x : fallback.x + 1,
      aimY: hasPointer ? aim.y : fallback.y,
      isFiring: pointer.leftButtonDown(),
    };
  }
}
