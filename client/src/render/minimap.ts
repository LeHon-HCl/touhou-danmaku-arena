import Phaser from 'phaser';
import type { Rect } from '@shared';

/**
 * 小地图上的一个点。
 * `isMemory = true` 表示"最后已知位置"——敌人已经躲到墙后，只留一个淡标记（需求 2.4）。
 */
export interface MinimapMarker {
  x: number;
  y: number;
  color: number;
  /** 0–1，记忆标记用较低的透明度 */
  alpha: number;
  /** 是否画成方框（区分"实时看到"与"记忆里的旧位置"） */
  isMemory?: boolean;
}

export interface MinimapOptions {
  /** 左上角屏幕坐标 X */
  x: number;
  /** 左上角屏幕坐标 Y */
  y: number;
  /** 小地图边长（像素） */
  size?: number;
  /** 雷达半径（世界像素）：只有这个范围内的东西会显示 */
  worldRadius?: number;
}

/**
 * 小地图（需求 2.4：开阔区雷达 + 掩体后记忆）。
 *
 * 它是纯表现层：每帧拿"玩家位置 + 一组标记"重画一次，不持有任何游戏数据。
 * 哪些点该出现、哪些该是记忆标记，由战斗场景用 `hasLineOfSight` 判断后传进来。
 *
 * 坐标系换算是这里唯一需要小心的地方：
 *   雷达坐标 = 屏幕中心 + (世界坐标 - 玩家坐标) × 缩放比
 * 缩放比 = (小地图边长 / 2) / 雷达半径
 */
export class Minimap {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly left: number;
  private readonly top: number;
  private readonly size: number;
  private readonly worldRadius: number;

  constructor(
    scene: Phaser.Scene,
    private readonly walls: Rect[],
    options: MinimapOptions,
  ) {
    this.left = options.x;
    this.top = options.y;
    this.size = options.size ?? 88;
    this.worldRadius = options.worldRadius ?? 300;

    // scrollFactor(0) 表示钉在屏幕上，不随相机滚动；depth 保证它盖在地图上面
    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(1002);
  }

  /** 重画一帧 */
  update(viewer: { x: number; y: number }, markers: MinimapMarker[]): void {
    const graphics = this.graphics;
    const centerX = this.left + this.size / 2;
    const centerY = this.top + this.size / 2;
    /** 世界像素 → 雷达像素 */
    const scale = this.size / 2 / this.worldRadius;

    graphics.clear();

    // 底板与边框
    graphics.fillStyle(0x05050a, 0.75);
    graphics.fillRect(this.left, this.top, this.size, this.size);
    graphics.lineStyle(1, 0x33334a, 1);
    graphics.strokeRect(this.left, this.top, this.size, this.size);

    // 墙体：换算到雷达坐标后，再与雷达方框求交集（避免画到框外）
    graphics.fillStyle(0x3d3d52, 1);
    for (const wall of this.walls) {
      const radarX = centerX + (wall.x - viewer.x) * scale;
      const radarY = centerY + (wall.y - viewer.y) * scale;
      const radarWidth = wall.width * scale;
      const radarHeight = wall.height * scale;

      const clippedLeft = Math.max(radarX, this.left);
      const clippedTop = Math.max(radarY, this.top);
      const clippedRight = Math.min(radarX + radarWidth, this.left + this.size);
      const clippedBottom = Math.min(radarY + radarHeight, this.top + this.size);

      if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) {
        continue;
      }
      graphics.fillRect(
        clippedLeft,
        clippedTop,
        clippedRight - clippedLeft,
        clippedBottom - clippedTop,
      );
    }

    // 敌人标记
    for (const marker of markers) {
      const radarX = centerX + (marker.x - viewer.x) * scale;
      const radarY = centerY + (marker.y - viewer.y) * scale;

      // 超出雷达范围的直接不画（小地图的视野半径是有限的）
      const distance = Math.hypot(marker.x - viewer.x, marker.y - viewer.y);
      if (distance > this.worldRadius) {
        continue;
      }

      graphics.fillStyle(marker.color, marker.alpha);
      if (marker.isMemory) {
        // 记忆标记画成小方框，和实时的圆点区分开
        graphics.fillRect(radarX - 2, radarY - 2, 4, 4);
      } else {
        graphics.fillCircle(radarX, radarY, 2.5);
      }
    }

    // 自己永远在正中心
    graphics.fillStyle(0xffe9a8, 1);
    graphics.fillCircle(centerX, centerY, 3);
    graphics.lineStyle(1, 0xffe9a8, 0.5);
    graphics.strokeCircle(centerX, centerY, 5);
  }
}
