import Phaser from 'phaser';
import { BootScene } from './scenes/boot-scene';
import { MenuScene } from './scenes/menu-scene';
import { CharacterSelectScene } from './scenes/character-select-scene';
import { BattleScene } from './scenes/battle-scene';
import { PauseScene } from './scenes/pause-scene';
import { ResultScene } from './scenes/result-scene';
import { GAME_HEIGHT, GAME_WIDTH, applyIntegerScale } from './render/integer-scale';

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game',
  backgroundColor: '#08080d',
  // 像素风：关闭线性采样（antialias），但**不开启** roundPixels ——
  // pixelArt: true 会同时把 roundPixels 打开，与 art-spec 2.4「保留亚像素位置」冲突。
  render: { antialias: false, roundPixels: false },
  // 逻辑分辨率固定 640×360，缩放方式自己算（art-spec 2.2：整数倍放大，非整数倍留黑边）
  scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH },
  // 第一个场景会自动启动，其余场景等被 start / launch 时才创建
  scene: [BootScene, MenuScene, CharacterSelectScene, BattleScene, PauseScene, ResultScene],
});

applyIntegerScale(game);

// 开发期调试出口：在控制台里可以直接查看世界状态（生产构建不会执行到这里）
if (import.meta.env.DEV) {
  (window as unknown as { __game?: Phaser.Game }).__game = game;
}
