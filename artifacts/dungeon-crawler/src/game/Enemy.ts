import Phaser from 'phaser';
import type { EnemyKind } from './DungeonGenerator';

interface EnemyStats {
  texture: string;
  hp: number;
  speed: number;
  damage: number;
  sight: number;
  /** ms between contact hits */
  attackRate: number;
  coins: [number, number];
  /** Weight of the body for knockback; heavier enemies budge less. */
  mass: number;
}

const STATS: Record<EnemyKind, EnemyStats> = {
  slime: {
    texture: 'slime',
    hp: 30,
    speed: 55,
    damage: 8,
    sight: 150,
    attackRate: 900,
    coins: [1, 2],
    mass: 1,
  },
  bat: {
    texture: 'bat',
    hp: 18,
    speed: 125,
    damage: 5,
    sight: 220,
    attackRate: 700,
    coins: [1, 1],
    mass: 0.6,
  },
  skeleton: {
    texture: 'skeleton',
    hp: 60,
    speed: 72,
    damage: 14,
    sight: 190,
    attackRate: 1100,
    coins: [2, 4],
    mass: 1.8,
  },
};

type State = 'idle' | 'wander' | 'chase' | 'stunned';

/**
 * A simple state-machine enemy: wanders until the hero comes into sight,
 * then chases. Bats weave while chasing so they are harder to line up.
 */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  public readonly kind: EnemyKind;
  public readonly stats: EnemyStats;
  public hp: number;
  public maxHp: number;
  public damage: number;
  public speed: number;

  private target: Phaser.GameObjects.Components.Transform;
  private mode: State = 'idle';
  private nextDecisionAt = 0;
  private attackReadyAt = 0;
  private stunnedUntil = 0;
  private wobblePhase = Math.random() * Math.PI * 2;
  private healthBar: Phaser.GameObjects.Graphics;
  private shadow: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    kind: EnemyKind,
    depth: number,
    target: Phaser.GameObjects.Components.Transform,
  ) {
    const stats = STATS[kind];
    super(scene, x, y, stats.texture);
    this.kind = kind;
    this.stats = stats;
    this.target = target;

    // Every floor down, enemies hit harder, take more punishment and move
    // a little quicker. Speed is capped so bats stay dodgeable.
    const floors = depth - 1;
    this.maxHp = Math.round(stats.hp * (1 + floors * 0.25));
    this.hp = this.maxHp;
    this.damage = stats.damage + floors * 2;
    this.speed = Math.round(stats.speed * Math.min(1.6, 1 + floors * 0.05));

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(8);
    this.body!.setCircle(
      Math.min(this.width, this.height) / 2 - 3,
      (this.width - (Math.min(this.width, this.height) - 6)) / 2,
      (this.height - (Math.min(this.width, this.height) - 6)) / 2,
    );

    this.shadow = scene.add.image(x, y + 8, 'shadow').setDepth(5).setAlpha(0.6).setScale(0.9);
    this.healthBar = scene.add.graphics().setDepth(9);
    this.nextDecisionAt = scene.time.now + Math.random() * 1000;

    // Enemies pop in so a freshly generated floor feels alive.
    this.setScale(0);
    scene.tweens.add({ targets: this, scale: 1, duration: 250, ease: 'Back.easeOut' });
  }

  get canAttack() {
    return this.scene.time.now >= this.attackReadyAt && this.mode !== 'stunned';
  }

  /** Called by the scene after this enemy damages the hero. */
  didAttack() {
    this.attackReadyAt = this.scene.time.now + this.stats.attackRate;
    // Recoil so the enemy does not stay glued to the hero.
    const angle = Phaser.Math.Angle.Between(this.target.x, this.target.y, this.x, this.y);
    this.setVelocity(Math.cos(angle) * 120, Math.sin(angle) * 120);
    this.stun(250);
  }

  /** Returns true when the hit was fatal. The scene handles the death. */
  takeHit(amount: number, fromAngle: number, knockback = 220): boolean {
    this.hp -= amount;
    const push = knockback / this.stats.mass;
    this.setVelocity(Math.cos(fromAngle) * push, Math.sin(fromAngle) * push);
    this.stun(260);

    this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(70, () => {
      if (this.active) this.clearTint();
    });
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.25,
      scaleY: 0.8,
      duration: 60,
      yoyo: true,
    });

    return this.hp <= 0;
  }

  private stun(ms: number) {
    this.mode = 'stunned';
    this.stunnedUntil = this.scene.time.now + ms;
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    this.think(time, delta);
    this.shadow.setPosition(this.x, this.y + 9);
    this.drawHealthBar();

    // Face the way we are moving.
    const vx = this.body!.velocity.x;
    if (Math.abs(vx) > 5) this.setFlipX(vx < 0);
  }

  private think(time: number, delta: number) {
    const dist = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);

    if (this.mode === 'stunned') {
      if (time < this.stunnedUntil) return;
      this.mode = 'idle';
    }

    if (dist < this.stats.sight) {
      this.mode = 'chase';
    } else if (this.mode === 'chase') {
      this.mode = 'idle';
      this.nextDecisionAt = time + 400;
    }

    switch (this.mode) {
      case 'chase': {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
        let vx = Math.cos(angle) * this.speed;
        let vy = Math.sin(angle) * this.speed;
        if (this.kind === 'bat') {
          this.wobblePhase += delta / 90;
          const side = Math.sin(this.wobblePhase) * this.speed * 0.9;
          vx += Math.cos(angle + Math.PI / 2) * side;
          vy += Math.sin(angle + Math.PI / 2) * side;
        }
        this.setVelocity(vx, vy);
        break;
      }
      case 'wander':
        if (time >= this.nextDecisionAt) {
          this.mode = 'idle';
          this.setVelocity(0, 0);
          this.nextDecisionAt = time + Phaser.Math.Between(400, 1400);
        }
        break;
      case 'idle':
      default:
        this.setVelocity(this.body!.velocity.x * 0.85, this.body!.velocity.y * 0.85);
        if (time >= this.nextDecisionAt) {
          this.mode = 'wander';
          const angle = Math.random() * Math.PI * 2;
          const speed = this.speed * 0.45;
          this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
          this.nextDecisionAt = time + Phaser.Math.Between(500, 1200);
        }
        break;
    }
  }

  private drawHealthBar() {
    this.healthBar.clear();
    if (this.hp >= this.maxHp || this.hp <= 0) return;
    const w = 24;
    const x = this.x - w / 2;
    const y = this.y - this.height / 2 - 8;
    this.healthBar.fillStyle(0x000000, 0.6);
    this.healthBar.fillRect(x - 1, y - 1, w + 2, 5);
    this.healthBar.fillStyle(0xef4444, 1);
    this.healthBar.fillRect(x, y, w * Math.max(0, this.hp / this.maxHp), 3);
  }

  destroy() {
    this.healthBar?.destroy();
    this.shadow?.destroy();
    super.destroy();
  }
}
