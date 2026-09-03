import Phaser from 'phaser';
import { SPELL_SPEED } from './Player';

/**
 * Medium-range spell projectile. Flies straight along `angle`, leaves a
 * spark trail, and explodes on walls, enemies, or when its fuse runs out.
 */
export class Fireball extends Phaser.Physics.Arcade.Sprite {
  private trail: Phaser.GameObjects.Particles.ParticleEmitter;
  private angle_: number;
  private diesAt: number;
  private exploded = false;
  private onExplode: (x: number, y: number) => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    angle: number,
    lifetime: number,
    onExplode: (x: number, y: number) => void,
  ) {
    super(scene, x, y, 'fireball');
    this.onExplode = onExplode;
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.angle_ = angle;
    this.setDepth(12);
    this.setRotation(angle);
    this.body!.setCircle(6, 2, 2);
    this.diesAt = scene.time.now + lifetime;

    this.trail = scene.add.particles(0, 0, 'spark', {
      follow: this,
      speed: { min: 10, max: 40 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.9, end: 0 },
      lifespan: { min: 180, max: 320 },
      frequency: 18,
      tint: [0xfde047, 0xf97316, 0xef4444],
      blendMode: 'ADD',
    });
    this.trail.setDepth(11);

    scene.tweens.add({
      targets: this,
      scale: { from: 0.8, to: 1.15 },
      duration: 120,
      yoyo: true,
      repeat: -1,
    });
  }

  /**
   * Sets the projectile moving. Call this AFTER adding the fireball to a
   * physics group: Arcade groups reset a new member's velocity to zero.
   */
  launch() {
    this.setVelocity(Math.cos(this.angle_) * SPELL_SPEED, Math.sin(this.angle_) * SPELL_SPEED);
    return this;
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (!this.exploded && time >= this.diesAt) this.explode();
  }

  explode() {
    if (this.exploded) return;
    this.exploded = true;
    const { x, y } = this;

    this.trail.stop();
    this.scene.time.delayedCall(400, () => this.trail.destroy());

    const burst = this.scene.add.particles(x, y, 'spark', {
      speed: { min: 60, max: 180 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.2, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 200, max: 420 },
      tint: [0xfde047, 0xf97316, 0xffffff],
      blendMode: 'ADD',
      emitting: false,
    });
    burst.setDepth(13);
    burst.explode(18);
    this.scene.time.delayedCall(500, () => burst.destroy());

    this.onExplode(x, y);
    this.destroy();
  }
}
