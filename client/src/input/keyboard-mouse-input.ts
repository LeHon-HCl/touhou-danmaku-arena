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

  constructor(private readonly scene: Phaser.Scene) {
    this.keys = scene.input.keyboard!.addKeys('W,A,S,D') as MoveKeys;
  }

  /**
   * 采样当前帧的输入意图。
   * @param fallback 光标尚未进入画布时的默认瞄准点，取角色自身位置右侧一点，避免瞄向 (0,0)
   */
  sample(fallback: { x: number; y: number }): PlayerInput {
    const pointer = this.scene.input.activePointer;
    const hasPointer = pointer.active;

    return {
      moveX: (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0),
      moveY: (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0),
      aimX: hasPointer ? pointer.worldX : fallback.x + 1,
      aimY: hasPointer ? pointer.worldY : fallback.y,
      isFiring: pointer.leftButtonDown(),
    };
  }
}
