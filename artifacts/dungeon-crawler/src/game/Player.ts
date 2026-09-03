import Phaser from 'phaser';
import type { RunState } from './events';

export const SWORD_RANGE = 48;
export const SWORD_ARC = Phaser.Math.DegToRad(70); // half-angle of the hit cone
export const SWORD_DAMAGE = 15;
export const SWORD_COOLDOWN = 280;

export const SPELL_COST = 20;
export const SPELL_COOLDOWN = 380;
export const SPELL_DAMAGE = 25;
export const SPELL_SPEED = 320;
export const SPELL_LIFETIME = 650; // ms => roughly 6.5 tiles of range

const MOVE_SPEED = 165;
const ATTACK_MOVE_FACTOR = 0.45;
const SWORD_REST = 0.75; // radians off the facing direction when idle
const INVULN_MS = 700;

/**
 * The hero. An Arcade sprite whose body texture points along `facing`.
 * The sword and shadow are separate sprites that follow it each frame so the
 * swing can be animated independently of the body.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  public facing = 0;
  public readonly run: RunState;

  private sword: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private moveInput = new Phaser.Math.Vector2();
  private swingOffset = SWORD_REST;
  private swingDir = 1;
  private attackingUntil = 0;
  private attackReadyAt = 0;
  private spellReadyAt = 0;
  private invulnerableUntil = 0;
  private knockback = new Phaser.Math.Vector2();

  constructor(scene: Phaser.Scene, x: number, y: number, run: RunState) {
    super(scene, x, y, 'player');
    this.run = run;
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(10);
    this.setCollideWorldBounds(true);
    this.body!.setCircle(10, 6, 6);

    this.shadow = scene.add.image(x, y + 10, 'shadow').setDepth(5).setAlpha(0.8);
    this.sword = scene.add
      .sprite(x, y, 'sword')
      .setOrigin(0.12, 0.5)
      .setDepth(11);
  }

  // ---- Input -------------------------------------------------------------

  setMoveInput(x: number, y: number) {
    this.moveInput.set(x, y);
    if (this.moveInput.lengthSq() > 1) this.moveInput.normalize();
  }

  get isAttacking() {
    return this.scene.time.now < this.attackingUntil;
  }

  get isInvulnerable() {
    return this.scene.time.now < this.invulnerableUntil;
  }

  /** Points the hero at a world position (used for aim assist). */
  faceTowards(x: number, y: number) {
    this.facing = Phaser.Math.Angle.Between(this.x, this.y, x, y);
  }

  /**
   * Starts a sword swing. Returns false when still cooling down. The caller
   * resolves hits at the swing's midpoint via `onHitFrame`.
   */
  swing(onHitFrame: () => void): boolean {
    const now = this.scene.time.now;
    if (now < this.attackReadyAt) return false;

    this.attackReadyAt = now + SWORD_COOLDOWN;
    this.attackingUntil = now + 200;
    this.swingDir *= -1;

    const from = -1.7 * this.swingDir;
    const to = 1.7 * this.swingDir;
    this.swingOffset = from;
    let hitDone = false;

    this.scene.tweens.addCounter({
      from,
      to,
      duration: 170,
      ease: 'Cubic.easeOut',
      onUpdate: (tween) => {
        this.swingOffset = tween.getValue() ?? to;
        if (!hitDone && tween.progress >= 0.35) {
          hitDone = true;
          onHitFrame();
        }
      },
      onComplete: () => {
        this.scene.tweens.add({
          targets: this,
          swingOffset: SWORD_REST,
          duration: 120,
          ease: 'Sine.easeOut',
        });
      },
    });

    // Slash arc flashes in front of the hero.
    const slash = this.scene.add
      .image(
        this.x + Math.cos(this.facing) * 8,
        this.y + Math.sin(this.facing) * 8,
        'slash',
      )
      .setRotation(this.facing)
      .setDepth(12)
      .setScale(0.6)
      .setAlpha(0.9);
    if (this.swingDir < 0) slash.setFlipY(true);
    this.scene.tweens.add({
      targets: slash,
      scale: 1.05,
      alpha: 0,
      duration: 180,
      ease: 'Quad.easeOut',
      onComplete: () => slash.destroy(),
    });

    return true;
  }

  /** Spends mana for a spell. Returns false when broke or cooling down. */
  cast(): boolean {
    const now = this.scene.time.now;
    if (now < this.spellReadyAt || this.run.mana < SPELL_COST) return false;
    this.spellReadyAt = now + SPELL_COOLDOWN;
    this.run.mana -= SPELL_COST;

    // Small recoil pulse so casting has weight.
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.18,
      scaleY: 0.86,
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    return true;
  }

  get spellReady() {
    return this.scene.time.now >= this.spellReadyAt && this.run.mana >= SPELL_COST;
  }

  // ---- Damage ------------------------------------------------------------

  /**
   * Applies enemy damage after armor. Returns the health actually lost, or 0
   * when the hero was invulnerable.
   */
  takeDamage(amount: number, fromX: number, fromY: number): number {
    if (this.isInvulnerable || this.run.health <= 0) return 0;

    const reduction = this.run.armor / (this.run.armor + 60); // 20 armor ≈ 25%
    const dealt = Math.max(1, Math.round(amount * (1 - reduction)));
    this.run.health = Math.max(0, this.run.health - dealt);
    if (this.run.armor > 0 && Math.random() < 0.5) this.run.armor -= 1;

    this.invulnerableUntil = this.scene.time.now + INVULN_MS;
    const angle = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.y);
    this.knockback.set(Math.cos(angle) * 260, Math.sin(angle) * 260);

    this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(60, () => this.clearTint());
    this.scene.tweens.add({
      targets: [this, this.sword],
      alpha: 0.3,
      duration: 80,
      yoyo: true,
      repeat: Math.floor(INVULN_MS / 160) - 1,
      onComplete: () => {
        this.setAlpha(1);
        this.sword.setAlpha(1);
      },
    });

    return dealt;
  }

  heal(amount: number) {
    this.run.health = Math.min(this.run.maxHealth, this.run.health + amount);
  }

  // ---- Per-frame ---------------------------------------------------------

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (this.run.health <= 0) {
      this.setVelocity(0, 0);
      this.syncAttachments();
      return;
    }

    // Movement. Attacks slow the hero rather than rooting them, which keeps
    // combat mobile and lets you circle enemies.
    const factor = this.isAttacking ? ATTACK_MOVE_FACTOR : 1;
    let vx = this.moveInput.x * MOVE_SPEED * factor;
    let vy = this.moveInput.y * MOVE_SPEED * factor;

    if (this.knockback.lengthSq() > 1) {
      vx += this.knockback.x;
      vy += this.knockback.y;
      const decay = Math.exp(-delta / 90);
      this.knockback.scale(decay);
    } else {
      this.knockback.set(0, 0);
    }
    this.setVelocity(vx, vy);

    // Face the direction of travel, turning smoothly. Attacks lock facing so
    // the swing lands where you aimed.
    if (!this.isAttacking && this.moveInput.lengthSq() > 0.01) {
      const target = Math.atan2(this.moveInput.y, this.moveInput.x);
      this.facing = Phaser.Math.Angle.RotateTo(this.facing, target, 0.35);
    }

    // Mana regenerates slowly at all times.
    if (this.run.mana < this.run.maxMana) {
      this.run.mana = Math.min(this.run.maxMana, this.run.mana + (delta / 1000) * 4);
    }

    this.syncAttachments();
  }

  private syncAttachments() {
    this.setRotation(this.facing);
    this.shadow.setPosition(this.x, this.y + 11);

    const swordAngle = this.facing + this.swingOffset;
    this.sword.setPosition(
      this.x + Math.cos(this.facing) * 3 + Math.cos(swordAngle) * 6,
      this.y + Math.sin(this.facing) * 3 + Math.sin(swordAngle) * 6,
    );
    this.sword.setRotation(swordAngle);
  }

  destroy() {
    this.sword?.destroy();
    this.shadow?.destroy();
    super.destroy();
  }
}
