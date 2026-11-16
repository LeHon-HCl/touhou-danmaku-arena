import Phaser from 'phaser';

/** 逻辑分辨率（art-spec 2.2 已定案，所有 UI 与素材按这个尺寸设计） */
export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;

/**
 * 把画布按**整数倍**放大铺满窗口，非整数倍时留黑边。
 *
 * 直接拉伸（如 Scale.FIT）会让像素块变成宽高不等的长方形，像素风立刻糊掉；
 * 宁可留边，不可破坏像素形状（art-spec 2.2）。
 * 这里用 ScaleManager 的 zoom 而不是改 CSS 尺寸，保证 Phaser 自己算的
 * 显示尺寸与输入坐标换算保持一致。
 */
export function applyIntegerScale(game: Phaser.Game): void {
  const fit = (): void => {
    const zoom = Math.max(
      1,
      Math.floor(Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT)),
    );
    game.scale.setZoom(zoom);
  };

  window.addEventListener('resize', fit);
  fit();
}
