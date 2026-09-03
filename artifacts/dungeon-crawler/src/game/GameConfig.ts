import Phaser from 'phaser';
import { GameScene } from './GameScene';

export const getGameConfig = (parent: HTMLElement): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  parent,
  width: '100%',
  height: '100%',
  backgroundColor: '#000000',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  pixelArt: true,
  scene: [GameScene]
});
