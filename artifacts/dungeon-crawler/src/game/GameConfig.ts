import Phaser from 'phaser';
import { GameScene } from './GameScene';

export const getGameConfig = (parent: HTMLElement): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  parent,
  width: '100%',
  height: '100%',
  backgroundColor: '#07070c',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // Mobile viewport sizes can resolve to fractional CSS pixels. Keep the
    // backing canvas on whole pixels so the browser does not resample it.
    autoRound: true,
  },
  render: {
    // The generated dungeon textures are deliberately pixel-styled. Nearest
    // filtering keeps them crisp when a high-DPI phone scales the canvas.
    pixelArt: true,
    roundPixels: true,
  },
  scene: [GameScene],
});
