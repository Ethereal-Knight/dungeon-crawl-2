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
  },
  // Placeholder art is vector-drawn and rotates freely, so keep smoothing on.
  // Switch to `pixelArt: true` once real pixel sprites replace it.
  pixelArt: false,
  antialias: true,
  scene: [GameScene],
});
