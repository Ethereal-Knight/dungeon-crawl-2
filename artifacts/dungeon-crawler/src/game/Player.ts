import Phaser from 'phaser';
import type { RunState } from './events';
import { derive } from './shop';
import type { Anim, Dir } from './hero/heroSheet';
import { HERO_TEXTURE, heroAnimKey } from './hero/heroTexture';

export const SWORD_ARC = Phaser.Math.DegToRad(70); // half-angle of the hit cone

export const SPELL_COST = 20;
export const SPELL_COOLDOWN = 380;
export const SPELL_SPEED = 320;

const MOVE_SPEED = 165;
const ATTACK_MOVE_FACTOR = 0.45;
const INVULN_MS = 700;
/** Knockback speed above which the hero plays the skid animation. */
const KNOCKBACK_ANIM_SPEED = 40;

/** One-shot animations that take priority over idle/walk until they finish. */
type Action = 'none' | 'sword' | 'cast' | 'hurt';

/**
 * The hero, Wren. An Arcade sprite driven by the procedural pixel-art sheet
 * in ./hero. `facing` is a free angle used for aiming; the visible sprite
 * snaps it to down / up / side (side is flipped for left).
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  public facing = Math.PI / 2; // start facing the camera
  public readonly run: RunState;

  private shadow: Phaser.GameObjects.Image;
  private moveInput = new Phaser.Math.Vector2();
  private knockback = new Phaser.Math.Vector2();
  private attackingUntil = 0;
  private attackReadyAt = 0;
  private spellReadyAt = 0;
  private invulnerableUntil = 0;

  private dir: Dir = 'down';
  private action: Action = 'none';
  private dead = false;

  constructor(scene: Phaser.Scene, x: number, y: number, run: RunState) {
    super(scene, x, y, HERO_TEXTURE, 'idle-down-0');
    this.run = run;
    this.run.maxHealth = derive(run).maxHealth;
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(10);
    this.setCollideWorldBounds(true);
    // The drawn body spans roughly x 9..23, y 4..29 of the 32px frame.
    this.body!.setCircle(9, 7, 12);

    this.shadow = scene.add.image(x, y + 13, 'shadow').setDepth(5).setAlpha(0.8);

    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, this.onAnimationComplete, this);
    this.play(heroAnimKey('idle', 'down'));
  }

  // ---- Input -------------------------------------------------------------

  setMoveInput(x: number, y: number) {
    this.moveInput.set(x, y);
    if (this.moveInput.lengthSq() > 1) this.moveInput.normalize();
  }

  /** Upgrade- and gear-adjusted numbers, recomputed on demand. */
  get stats() {
    return derive(this.run);
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
    this.updateDirection();
  }

  /**
   * Starts a sword swing. Returns false when still cooling down. The caller
   * resolves hits at the swing's midpoint via `onHitFrame`.
   */
  swing(onHitFrame: () => void): boolean {
    const now = this.scene.time.now;
    if (now < this.attackReadyAt || this.dead) return false;

    this.attackReadyAt = now + this.stats.swordCooldown;
    this.attackingUntil = now + 200;
    this.startAction('sword');

    // The blade crosses the front of the body on the third frame (~85 ms at
    // 24 fps); resolve the hit there so damage lands with the visual.
    this.scene.time.delayedCall(80, () => {
      if (this.active && !this.dead) onHitFrame();
    });

    // Slash arc flashes in front of the hero.
    const slash = this.scene.add
      .image(
        this.x + Math.cos(this.facing) * 10,
        this.y + 4 + Math.sin(this.facing) * 10,
        'slash',
      )
      .setRotation(this.facing)
      .setDepth(12)
      .setScale(0.6)
      .setAlpha(0.85);
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
    if (now < this.spellReadyAt || this.run.mana < SPELL_COST || this.dead) return false;
    this.spellReadyAt = now + SPELL_COOLDOWN;
    this.run.mana -= SPELL_COST;
    this.attackingUntil = now + 150;
    this.startAction('cast');
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
    if (this.isInvulnerable || this.run.health <= 0 || this.dead) return 0;

    const reduction = this.run.armor / (this.run.armor + 60); // 20 armor ≈ 25%
    const dealt = Math.max(1, Math.round(amount * (1 - reduction)));
    this.run.health = Math.max(0, this.run.health - dealt);
    if (this.run.armor > 0 && Math.random() < 0.5) this.run.armor -= 1;

    this.invulnerableUntil = this.scene.time.now + INVULN_MS;
    const angle = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.y);
    this.knockback.set(Math.cos(angle) * 260, Math.sin(angle) * 260);

    // Face the attacker so the flinch and the skid read correctly.
    this.facing = Phaser.Math.Angle.Between(this.x, this.y, fromX, fromY);
    this.updateDirection();
    this.startAction('hurt');

    // Blink for the rest of the invulnerability window (after the flinch).
    this.scene.tweens.add({
      targets: this,
      alpha: 0.35,
      duration: 80,
      yoyo: true,
      delay: 200,
      repeat: Math.floor((INVULN_MS - 200) / 160) - 1,
      onComplete: () => this.setAlpha(1),
    });

    return dealt;
  }

  heal(amount: number) {
    this.run.health = Math.min(this.run.maxHealth, this.run.health + amount);
  }

  /** Plays the death animation and freezes on the final frame. */
  die() {
    if (this.dead) return;
    this.dead = true;
    this.action = 'none';
    this.setAlpha(1);
    this.setFlipX(false);
    this.setVelocity(0, 0);
    this.play(heroAnimKey('death', 'down'));
  }

  get isDead() {
    return this.dead;
  }

  // ---- Per-frame ---------------------------------------------------------

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    this.shadow.setPosition(this.x, this.y + 13);

    if (this.dead || this.run.health <= 0) {
      this.setVelocity(0, 0);
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
      this.knockback.scale(Math.exp(-delta / 150));
    } else {
      this.knockback.set(0, 0);
    }
    this.setVelocity(vx, vy);

    // Face the direction of travel, turning smoothly. Attacks and flinches
    // lock facing so the swing lands where you aimed.
    if (this.action === 'none' && this.moveInput.lengthSq() > 0.01) {
      const target = Math.atan2(this.moveInput.y, this.moveInput.x);
      this.facing = Phaser.Math.Angle.RotateTo(this.facing, target, 0.35);
      this.updateDirection();
    }

    // Mana regenerates slowly at all times.
    if (this.run.mana < this.run.maxMana) {
      this.run.mana = Math.min(
        this.run.maxMana,
        this.run.mana + (delta / 1000) * this.stats.manaRegen,
      );
    }

    this.updateAnimation();
  }

  // ---- Animation ---------------------------------------------------------

  /** Snaps the free aiming angle to one of the drawn directions. */
  private updateDirection() {
    const deg = Phaser.Math.RadToDeg(Phaser.Math.Angle.Wrap(this.facing));
    let dir: Dir;
    let flip = false;
    if (deg > -45 && deg <= 45) dir = 'side';
    else if (deg > 45 && deg <= 135) dir = 'down';
    else if (deg <= -45 && deg > -135) dir = 'up';
    else {
      dir = 'side';
      flip = true;
    }
    this.dir = dir;
    this.setFlipX(flip);
  }

  private startAction(action: Exclude<Action, 'none'>) {
    this.action = action;
    this.play(heroAnimKey(action, this.dir), false);
  }

  private onAnimationComplete(anim: Phaser.Animations.Animation) {
    if (anim.key.startsWith(`hero-${this.action}-`)) this.action = 'none';
  }

  private updateAnimation() {
    if (this.action !== 'none') return;
    let anim: Anim;
    if (this.knockback.length() > KNOCKBACK_ANIM_SPEED) anim = 'knockback';
    else if (this.moveInput.lengthSq() > 0.01) anim = 'walk';
    else anim = 'idle';
    this.play(heroAnimKey(anim, this.dir), true);
  }

  destroy() {
    this.shadow?.destroy();
    super.destroy();
  }
}
