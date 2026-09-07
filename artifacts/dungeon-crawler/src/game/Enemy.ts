import Phaser from 'phaser';
import { ENEMY_TYPES, type EnemyKind, type EnemyStats, type ShootSpec } from './enemyTypes';

type Mode =
  | 'idle'
  | 'wander'
  | 'chase'
  | 'stunned'
  | 'windup'
  | 'charge'
  | 'fuse'
  | 'leap';

/** Payloads for the events an enemy raises; the scene owns the consequences. */
export interface ShootEvent {
  angle: number;
  spec: ShootSpec;
  damage: number;
}
export interface AoeEvent {
  radius: number;
  damage: number;
}

/**
 * Every enemy in the bestiary. Stats come from ENEMY_TYPES; `think()` picks
 * the behaviour routine. Anything that needs world knowledge (projectiles,
 * blasts, summons, teleport targets) is raised as an event on this sprite:
 *   'shoot' (ShootEvent) · 'aoe' (AoeEvent) · 'summon' (kind) · 'teleport' ·
 *   'detonate' (bomber blew itself up)
 */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  public readonly kind: EnemyKind;
  public readonly stats: EnemyStats;
  public hp: number;
  public maxHp: number;
  public damage: number;
  public speed: number;
  /** Carries the key to the exit door; shows an icon overhead. */
  public carriesKey = false;
  /** Summoner bookkeeping. */
  public owner: Enemy | null = null;
  public minions = 0;
  /** Set by takeHit when a shield absorbed most of the blow. */
  public lastHitBlocked = false;

  private target: Phaser.GameObjects.Components.Transform;
  private mode: Mode = 'idle';
  private modeUntil = 0;
  private nextDecisionAt = 0;
  private attackReadyAt = 0;
  private stunnedUntil = 0;
  private nextShotAt = 0;
  private nextAbilityAt = 0;
  private wobblePhase = Math.random() * Math.PI * 2;
  private chargeDir = new Phaser.Math.Vector2();
  /** Direction the Bone Warden's shield points; turns slowly so it can be flanked. */
  private guardAngle = 0;
  private healthBar: Phaser.GameObjects.Graphics;
  private shadow: Phaser.GameObjects.Image;
  private keyIcon: Phaser.GameObjects.Image | null = null;
  private depthLevel: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    kind: EnemyKind,
    depth: number,
    target: Phaser.GameObjects.Components.Transform,
  ) {
    const stats = ENEMY_TYPES[kind];
    super(scene, x, y, stats.texture);
    this.kind = kind;
    this.stats = stats;
    this.target = target;
    this.depthLevel = depth;

    // Every floor down, enemies hit harder, take more punishment and move
    // a little quicker. Speed is capped so fast kinds stay dodgeable.
    const floors = Math.max(0, depth - stats.minDepth);
    this.maxHp = Math.round(stats.hp * (1 + floors * 0.22));
    this.hp = this.maxHp;
    this.damage = stats.damage + floors * 2;
    this.speed = Math.round(stats.speed * Math.min(1.6, 1 + floors * 0.05));

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(8);
    const d = Math.min(this.width, this.height);
    this.body!.setCircle(d / 2 - 3, (this.width - (d - 6)) / 2, (this.height - (d - 6)) / 2);

    this.shadow = scene.add.image(x, y + 8, 'shadow').setDepth(5).setAlpha(0.6).setScale(0.9);
    this.healthBar = scene.add.graphics().setDepth(9);
    this.nextDecisionAt = scene.time.now + Math.random() * 1000;
    this.nextShotAt = scene.time.now + 600 + Math.random() * 800;
    this.nextAbilityAt = scene.time.now + 800;
    if (stats.stationary) this.setImmovable(true);
    if (stats.phasing) this.shadow.setAlpha(0.25);
    this.guardAngle = Phaser.Math.Angle.Between(x, y, target.x, target.y);

    // Enemies pop in so a freshly generated floor feels alive.
    this.setScale(0);
    scene.tweens.add({ targets: this, scale: 1, duration: 250, ease: 'Back.easeOut' });
  }

  /** Damage dealt when touching the hero right now. */
  get contactDamage() {
    return this.mode === 'charge' ? Math.round(this.damage * 1.5) : this.damage;
  }

  /** Bolt damage for shooters, scaled by depth. */
  get shotDamage() {
    const base = this.stats.shoot?.damage ?? 0;
    return base + Math.max(0, this.depthLevel - this.stats.minDepth) * 2;
  }

  get canAttack() {
    return this.scene.time.now >= this.attackReadyAt && this.mode !== 'stunned' && this.mode !== 'fuse';
  }

  giveKey() {
    this.carriesKey = true;
    this.keyIcon = this.scene.add.image(this.x, this.y - this.height / 2 - 10, 'key').setDepth(9);
    this.scene.tweens.add({
      targets: this.keyIcon,
      y: '-=4',
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Called by the scene after this enemy damages the hero. */
  didAttack() {
    this.attackReadyAt = this.scene.time.now + this.stats.attackRate;
    if (this.stats.stationary) return;
    // Recoil so the enemy does not stay glued to the hero.
    const angle = Phaser.Math.Angle.Between(this.target.x, this.target.y, this.x, this.y);
    this.setVelocity(Math.cos(angle) * 120, Math.sin(angle) * 120);
    if (this.mode === 'charge') this.mode = 'idle';
    this.stun(250);
  }

  /**
   * Returns true when the hit was fatal. The scene handles the death.
   * `fromAngle` points from the attacker toward this enemy.
   */
  takeHit(amount: number, fromAngle: number, knockback = 220): boolean {
    this.lastHitBlocked = false;
    if (this.stats.behavior === 'shield') {
      // The shield covers the front 120° of where the warden is guarding.
      // The guard turns slowly (see think), so circling gets behind it.
      const attackerDir = Phaser.Math.Angle.Wrap(fromAngle + Math.PI);
      if (Math.abs(Phaser.Math.Angle.Wrap(attackerDir - this.guardAngle)) < Phaser.Math.DegToRad(60)) {
        amount = Math.max(1, Math.ceil(amount * 0.25));
        knockback *= 0.3;
        this.lastHitBlocked = true;
      }
    }

    this.hp -= amount;
    if (!this.stats.stationary) {
      const push = knockback / this.stats.mass;
      this.setVelocity(Math.cos(fromAngle) * push, Math.sin(fromAngle) * push);
    }
    if (this.mode !== 'fuse') this.stun(260);

    // Cultists blink away when struck, if they can.
    if (this.stats.behavior === 'teleporter' && this.hp > 0 && this.scene.time.now >= this.nextAbilityAt) {
      this.nextAbilityAt = this.scene.time.now + 2500;
      this.scene.time.delayedCall(120, () => {
        if (this.active) this.emit('teleport');
      });
    }

    this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(70, () => {
      if (this.active) this.clearTint();
    });
    this.scene.tweens.add({ targets: this, scaleX: 1.25, scaleY: 0.8, duration: 60, yoyo: true });

    return this.hp <= 0;
  }

  private stun(ms: number) {
    this.mode = 'stunned';
    this.stunnedUntil = this.scene.time.now + ms;
  }

  // ---- Per-frame ---------------------------------------------------------

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    this.think(time, delta);
    // An ability may have removed this enemy (or the scene may have) while
    // thinking; never touch the body after that.
    if (!this.active || !this.body) return;
    this.shadow.setPosition(this.x, this.y + 9);
    if (this.keyIcon) this.keyIcon.x = this.x;
    this.drawHealthBar();

    if (this.stats.phasing) {
      // Fade in and out; always at least faintly visible.
      this.setAlpha(0.45 + 0.4 * (0.5 + 0.5 * Math.sin(time / 380 + this.wobblePhase)));
    }

    // Face the way we are moving, or the hero when standing still. Wardens
    // always show which way the shield points.
    const vx = this.body!.velocity.x;
    if (this.stats.behavior === 'shield') this.setFlipX(Math.cos(this.guardAngle) < 0);
    else if (Math.abs(vx) > 5) this.setFlipX(vx < 0);
    else if (this.mode !== 'wander') this.setFlipX(this.target.x < this.x);
  }

  private think(time: number, delta: number) {
    const dist = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
    const toTarget = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);

    if (this.stats.behavior === 'shield' && this.mode !== 'stunned') {
      // ~1.6 rad/s: a hero circling at sword range turns faster than this.
      this.guardAngle = Phaser.Math.Angle.RotateTo(this.guardAngle, toTarget, (1.6 * delta) / 1000);
    }

    if (this.mode === 'stunned') {
      if (time < this.stunnedUntil) return;
      this.mode = 'idle';
    }

    switch (this.stats.behavior) {
      case 'stationary':
        this.setVelocity(0, 0);
        this.tryShoot(time, dist, toTarget);
        return;
      case 'summoner':
        this.setVelocity(0, 0);
        if (dist < this.stats.sight && this.stats.summon && this.minions < this.stats.summon.max && time >= this.nextAbilityAt) {
          this.nextAbilityAt = time + this.stats.summon.rate;
          this.scene.tweens.add({ targets: this, scaleY: 1.2, duration: 120, yoyo: true });
          this.emit('summon', this.stats.summon.kind);
        }
        return;
      case 'kiter':
      case 'teleporter':
        this.kite(time, dist, toTarget);
        return;
      case 'charger':
        this.chargeBehaviour(time, dist, toTarget);
        return;
      case 'bomber':
        this.bomberBehaviour(time, dist, toTarget);
        return;
      case 'leaper':
        this.leaperBehaviour(time, dist, toTarget);
        return;
      case 'slam':
        this.slamBehaviour(time, dist, toTarget);
        return;
      case 'phase':
        // Drifts straight through walls toward the hero, always.
        this.moveToward(toTarget, this.speed);
        return;
      case 'flutter':
      case 'shield':
      case 'chase':
      default:
        this.chaseOrWander(time, delta, dist, toTarget);
    }
  }

  // ---- Behaviour routines ------------------------------------------------

  private moveToward(angle: number, speed: number) {
    this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  private chaseOrWander(time: number, delta: number, dist: number, toTarget: number) {
    if (dist < this.stats.sight) {
      this.mode = 'chase';
    } else if (this.mode === 'chase') {
      this.mode = 'idle';
      this.nextDecisionAt = time + 400;
    }

    switch (this.mode) {
      case 'chase': {
        let vx = Math.cos(toTarget) * this.speed;
        let vy = Math.sin(toTarget) * this.speed;
        if (this.stats.behavior === 'flutter') {
          this.wobblePhase += delta / 90;
          const side = Math.sin(this.wobblePhase) * this.speed * 0.9;
          vx += Math.cos(toTarget + Math.PI / 2) * side;
          vy += Math.sin(toTarget + Math.PI / 2) * side;
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

  /** Shooters that hold a comfortable distance. */
  private kite(time: number, dist: number, toTarget: number) {
    if (dist > this.stats.sight) {
      this.chaseOrWander(time, 16, dist, toTarget);
      return;
    }
    const near = 130;
    const far = 230;
    if (dist < near) {
      this.moveToward(toTarget + Math.PI, this.speed);
      if (this.stats.behavior === 'teleporter' && dist < 90 && time >= this.nextAbilityAt) {
        this.nextAbilityAt = time + 2500;
        this.emit('teleport');
        return;
      }
    } else if (dist > far) {
      this.moveToward(toTarget, this.speed);
    } else {
      this.setVelocity(0, 0);
    }
    this.mode = 'chase';
    this.tryShoot(time, dist, toTarget);
  }

  private tryShoot(time: number, dist: number, toTarget: number) {
    const spec = this.stats.shoot;
    if (!spec || dist > this.stats.sight || time < this.nextShotAt) return;
    this.nextShotAt = time + Math.max(700, spec.rate - Math.max(0, this.depthLevel - this.stats.minDepth) * 80);
    // Wind-up squash so the shot is telegraphed.
    this.scene.tweens.add({ targets: this, scaleX: 1.2, scaleY: 0.85, duration: 90, yoyo: true });
    const ev: ShootEvent = { angle: toTarget, spec, damage: this.shotDamage };
    this.emit('shoot', ev);
  }

  private chargeBehaviour(time: number, dist: number, toTarget: number) {
    if (this.mode === 'windup') {
      this.setVelocity(0, 0);
      if (time >= this.modeUntil) {
        this.mode = 'charge';
        this.modeUntil = time + 750;
        this.chargeDir.set(Math.cos(toTarget), Math.sin(toTarget));
      }
      return;
    }
    if (this.mode === 'charge') {
      this.setVelocity(this.chargeDir.x * this.speed * 3.2, this.chargeDir.y * this.speed * 3.2);
      const blocked = this.body!.blocked;
      if (blocked.left || blocked.right || blocked.up || blocked.down) {
        // Slammed into a wall: dazed.
        this.setVelocity(0, 0);
        this.scene.cameras.main.shake(60, 0.003);
        this.stun(900);
        this.nextAbilityAt = time + 1500;
        return;
      }
      if (time >= this.modeUntil) {
        this.mode = 'idle';
        this.nextDecisionAt = time + 500;
        this.nextAbilityAt = time + 1200;
      }
      return;
    }
    if (dist < this.stats.sight && time >= this.nextAbilityAt) {
      this.mode = 'windup';
      this.modeUntil = time + 600;
      this.setVelocity(0, 0);
      this.scene.tweens.add({ targets: this, x: this.x + 2, duration: 50, yoyo: true, repeat: 5 });
      return;
    }
    this.chaseOrWander(time, 16, dist, toTarget);
  }

  private bomberBehaviour(time: number, dist: number, toTarget: number) {
    const aoe = this.stats.aoe!;
    if (this.mode === 'fuse') {
      this.setVelocity(0, 0);
      if (time >= this.modeUntil) {
        const ev: AoeEvent = { radius: aoe.radius, damage: aoe.damage + Math.max(0, this.depthLevel - this.stats.minDepth) * 2 };
        // Blast exactly once; the scene removes us on the next tick.
        this.mode = 'stunned';
        this.stunnedUntil = Number.POSITIVE_INFINITY;
        this.emit('aoe', ev);
        this.emit('detonate');
      }
      return;
    }
    if (dist < aoe.range) {
      this.mode = 'fuse';
      this.modeUntil = time + aoe.windup;
      this.setVelocity(0, 0);
      this.scene.tweens.add({
        targets: this,
        alpha: 0.4,
        duration: 90,
        yoyo: true,
        repeat: Math.floor(aoe.windup / 180),
      });
      this.setTint(0xff6b6b);
      return;
    }
    this.chaseOrWander(time, 16, dist, toTarget);
  }

  private leaperBehaviour(time: number, dist: number, toTarget: number) {
    if (this.mode === 'leap') {
      if (time >= this.modeUntil) {
        this.mode = 'idle';
        this.nextDecisionAt = time + 300;
      }
      return;
    }
    if (dist > 60 && dist < 150 && time >= this.nextAbilityAt && dist < this.stats.sight) {
      this.mode = 'leap';
      this.modeUntil = time + 350;
      this.nextAbilityAt = time + 1700;
      this.moveToward(toTarget, 340);
      this.scene.tweens.add({ targets: this, scale: 1.3, duration: 170, yoyo: true });
      return;
    }
    this.chaseOrWander(time, 16, dist, toTarget);
  }

  private slamBehaviour(time: number, dist: number, toTarget: number) {
    const aoe = this.stats.aoe!;
    if (this.mode === 'windup') {
      this.setVelocity(0, 0);
      if (time >= this.modeUntil) {
        this.mode = 'idle';
        this.nextDecisionAt = time + 400;
        this.nextAbilityAt = time + aoe.rate;
        const ev: AoeEvent = { radius: aoe.radius, damage: aoe.damage + Math.max(0, this.depthLevel - this.stats.minDepth) * 2 };
        this.emit('aoe', ev);
      }
      return;
    }
    if (dist < aoe.range && time >= this.nextAbilityAt) {
      this.mode = 'windup';
      this.modeUntil = time + aoe.windup;
      this.setVelocity(0, 0);
      this.scene.tweens.add({ targets: this, scaleY: 1.25, scaleX: 0.9, duration: aoe.windup, yoyo: false, onComplete: () => this.setScale(1) });
      return;
    }
    this.chaseOrWander(time, 16, dist, toTarget);
  }

  // ---- Visuals -----------------------------------------------------------

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
    this.keyIcon?.destroy();
    super.destroy();
  }
}
