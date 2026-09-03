import Phaser from 'phaser';
import { DungeonGenerator, FLOOR, type ItemKind } from './DungeonGenerator';
import { Enemy } from './Enemy';
import { Fireball } from './Fireball';
import { Player, SWORD_ARC } from './Player';
import { buy, type ShopItemId } from './shop';
import { installHero } from './hero/heroTexture';
import {
  createPlaceholderTextures,
  pickFloorTile,
  pickWallTile,
  TILE,
  type WallContext,
} from './textures';
import {
  GAME_ATTACK,
  GAME_BUY,
  GAME_INIT,
  GAME_JOYSTICK,
  GAME_LEVEL,
  GAME_MESSAGE,
  GAME_OVER,
  GAME_RESTART,
  GAME_SHOP,
  GAME_SHOP_LEAVE,
  GAME_SPELL,
  GAME_UPDATE,
  createRunState,
  emit,
  type RunState,
} from './events';

const MAP_W = 50;
const MAP_H = 50;
const SPELL_AOE = 40;
const COIN_VALUE = 5;
const GEM_VALUE = 25;
const FOOD_HEAL = 30;

interface SceneData {
  run?: RunState;
}

export class GameScene extends Phaser.Scene {
  private run!: RunState;
  private dungeon!: DungeonGenerator;
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.Group;
  private fireballs!: Phaser.Physics.Arcade.Group;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private exit!: Phaser.Physics.Arcade.Image;
  private vignette!: Phaser.GameObjects.Image;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private joystick = new Phaser.Math.Vector2();
  private hudDirty = true;
  private nextHudAt = 0;
  private levelOver = false;
  private shopOpen = false;

  constructor() {
    super('GameScene');
  }

  init(data: SceneData) {
    this.run = data.run ?? createRunState();
    this.levelOver = false;
    this.shopOpen = false;
  }

  preload() {
    createPlaceholderTextures(this);
    installHero(this);
  }

  // ---- Setup -------------------------------------------------------------

  create() {
    this.physics.resume();
    this.cameras.main.setBackgroundColor('#07070c');

    this.buildMap();
    this.spawnPlayer();
    this.spawnEnemies();
    this.spawnPickups();
    this.spawnExit();
    this.setupCollisions();
    this.setupCamera();
    this.setupInput();

    emit(GAME_INIT, this.run);
    emit(GAME_LEVEL, { depth: this.run.depth });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  private buildMap() {
    this.dungeon = new DungeonGenerator(MAP_W, MAP_H);
    this.dungeon.generate(this.run.depth);

    const map = this.make.tilemap({
      tileWidth: TILE,
      tileHeight: TILE,
      width: MAP_W,
      height: MAP_H,
    });
    const floors = map.addTilesetImage('floors', undefined, TILE, TILE)!;
    const walls = map.addTilesetImage('walls', undefined, TILE, TILE)!;
    const floorLayer = map.createBlankLayer('Floor', floors)!;
    this.wallLayer = map.createBlankLayer('Wall', walls)!;

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.dungeon.map[y][x] === FLOOR) {
          floorLayer.putTileAt(pickFloorTile(), x, y);
        } else {
          this.wallLayer.putTileAt(pickWallTile(this.wallContext(x, y)), x, y);
        }
      }
    }
    this.wallLayer.setCollisionByExclusion([-1]);

    const worldW = MAP_W * TILE;
    const worldH = MAP_H * TILE;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBounds(0, 0, worldW, worldH);
  }

  private spawnPlayer() {
    const { x, y } = this.toWorld(this.dungeon.startPos);
    this.player = new Player(this, x, y, this.run);
  }

  private spawnEnemies() {
    // Group defaults are re-applied to every member on add, so the physics
    // flags enemies rely on live here rather than in the Enemy constructor.
    this.enemies = this.physics.add.group({
      collideWorldBounds: true,
      bounceX: 0.3,
      bounceY: 0.3,
    });
    for (const spawn of this.dungeon.enemies) {
      const { x, y } = this.toWorld(spawn);
      this.enemies.add(new Enemy(this, x, y, spawn.kind, this.run.depth, this.player));
    }
  }

  private spawnPickups() {
    this.pickups = this.physics.add.group();
    for (const item of this.dungeon.items) {
      const { x, y } = this.toWorld(item);
      this.addPickup(x, y, item.kind);
    }
  }

  private addPickup(x: number, y: number, kind: ItemKind, scatter = false) {
    const sprite = this.pickups.create(x, y, kind) as Phaser.Physics.Arcade.Image;
    sprite.setDepth(6);
    sprite.setData('kind', kind);
    sprite.setData('readyAt', this.time.now + (scatter ? 350 : 0));

    if (scatter) {
      // Loot bursts out of a slain enemy and skids to a stop.
      const angle = Math.random() * Math.PI * 2;
      const speed = Phaser.Math.Between(80, 160);
      sprite.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      sprite.setDrag(220);
      sprite.setBounce(0.6);
      sprite.setCollideWorldBounds(true);
    }

    // Gentle bob so pickups are easy to spot.
    this.tweens.add({
      targets: sprite,
      y: y - 3,
      duration: 600 + Math.random() * 300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private spawnExit() {
    const { x, y } = this.toWorld(this.dungeon.endPos);
    this.exit = this.physics.add.staticImage(x, y, 'stairs').setDepth(4);
    this.tweens.add({
      targets: this.exit,
      alpha: 0.7,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private setupCollisions() {
    this.fireballs = this.physics.add.group();

    this.physics.add.collider(this.player, this.wallLayer);
    this.physics.add.collider(this.enemies, this.wallLayer);
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.collider(this.pickups, this.wallLayer);

    this.physics.add.collider(this.player, this.enemies, (_p, e) => {
      this.enemyTouchesPlayer(e as Enemy);
    });
    this.physics.add.overlap(this.player, this.pickups, (_p, item) => {
      this.collectPickup(item as Phaser.Physics.Arcade.Image);
    });
    this.physics.add.overlap(this.player, this.exit, () => this.descend());

    this.physics.add.collider(this.fireballs, this.wallLayer, (fb) => {
      (fb as Fireball).explode();
    });
    this.physics.add.overlap(this.fireballs, this.enemies, (fb) => {
      (fb as Fireball).explode();
    });
  }

  private setupCamera() {
    const cam = this.cameras.main;
    cam.startFollow(this.player, true, 0.12, 0.12);
    this.vignette = this.add
      .image(0, 0, 'vignette')
      .setScrollFactor(0)
      .setDepth(50)
      .setAlpha(0.75);
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    cam.fadeIn(350, 0, 0, 0);
  }

  /** Keeps roughly the same number of tiles visible on phones and desktops. */
  private fitCamera() {
    const { width, height } = this.scale;
    const short = Math.min(width, height);
    const targetZoom = Phaser.Math.Clamp(short / (11 * TILE), 1.1, 2.6);
    // A fractional rendered tile size makes the browser interpolate every
    // texture edge. Snap the 64px tiles to a whole number of screen pixels.
    const minTilePixels = Math.ceil(1.1 * TILE);
    const maxTilePixels = Math.floor(2.6 * TILE);
    const tilePixels = Phaser.Math.Clamp(
      Math.round(targetZoom * TILE),
      minTilePixels,
      maxTilePixels,
    );
    const zoom = tilePixels / TILE;
    const cam = this.cameras.main;
    cam.setZoom(zoom);
    // Vignette is in screen space, so size it to the unzoomed viewport.
    this.vignette.setPosition(width / 2, height / 2);
    this.vignette.setDisplaySize((width / zoom) * 1.04, (height / zoom) * 1.04);
  }

  private setupInput() {
    const kb = this.input.keyboard;
    if (kb) {
      this.cursors = kb.createCursorKeys();
      this.keys = kb.addKeys('W,A,S,D,SPACE,J,F,K,E,SHIFT,R,ENTER') as Record<
        string,
        Phaser.Input.Keyboard.Key
      >;
    }
    window.addEventListener(GAME_ATTACK, this.onAttack);
    window.addEventListener(GAME_SPELL, this.onSpell);
    window.addEventListener(GAME_RESTART, this.onRestart);
    window.addEventListener(GAME_JOYSTICK, this.onJoystick);
    window.addEventListener(GAME_BUY, this.onBuy);
    window.addEventListener(GAME_SHOP_LEAVE, this.onShopLeave);
  }

  // ---- Bridge handlers (arrow functions keep `this` bound) -------------

  private onAttack = () => this.swordAttack();
  private onSpell = () => this.castSpell();
  private onRestart = () => this.restartRun();
  private onJoystick = (e: Event) => {
    const d = (e as CustomEvent<{ x: number; y: number }>).detail;
    this.joystick.set(d?.x ?? 0, d?.y ?? 0);
  };
  private onBuy = (e: Event) => {
    if (!this.shopOpen) return;
    const id = (e as CustomEvent<{ id: ShopItemId }>).detail?.id;
    if (id && buy(this.run, id)) emit(GAME_SHOP, { ...this.run });
  };
  private onShopLeave = () => {
    if (!this.shopOpen) return;
    this.shopOpen = false;
    this.startNextFloor();
  };

  // ---- Combat ------------------------------------------------------------

  private swordAttack() {
    if (this.run.health <= 0 || this.levelOver) return;

    // Aim assist: snap toward the closest enemy already roughly in front.
    const { swordRange, swordDamage } = this.player.stats;
    const target = this.closestEnemy(swordRange * 1.6, Math.PI / 2);
    if (target) this.player.faceTowards(target.x, target.y);

    this.player.swing(() => {
      const { x, y, facing } = this.player;
      let hits = 0;
      for (const child of this.enemies.getChildren()) {
        const enemy = child as Enemy;
        if (!enemy.active) continue;
        const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
        if (dist > swordRange + enemy.width / 2) continue;
        const toEnemy = Phaser.Math.Angle.Between(x, y, enemy.x, enemy.y);
        if (Math.abs(Phaser.Math.Angle.Wrap(toEnemy - facing)) > SWORD_ARC) continue;
        this.damageEnemy(enemy, swordDamage, toEnemy, 240);
        hits++;
      }
      if (hits > 0) this.cameras.main.shake(60, 0.003);
    });
  }

  private castSpell() {
    if (this.run.health <= 0 || this.levelOver) return;

    const { spellLifetime } = this.player.stats;
    const target = this.closestEnemy(spellLifetime * 0.45, Math.PI / 3);
    if (target) this.player.faceTowards(target.x, target.y);

    if (!this.player.cast()) {
      if (this.run.mana < 20) {
        this.floatText(this.player.x, this.player.y - 26, 'no mana', '#93c5fd', 11);
      }
      return;
    }
    this.hudDirty = true;

    const angle = this.player.facing;
    const fb = new Fireball(
      this,
      this.player.x + Math.cos(angle) * 18,
      this.player.y + Math.sin(angle) * 18,
      angle,
      spellLifetime,
      (x, y) => this.spellExplosion(x, y),
    );
    this.fireballs.add(fb);
    fb.launch();
  }

  private spellExplosion(x: number, y: number) {
    this.cameras.main.shake(80, 0.004);
    const { spellDamage } = this.player.stats;
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Enemy;
      if (!enemy.active) continue;
      const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
      if (dist <= SPELL_AOE + enemy.width / 2) {
        const angle = Phaser.Math.Angle.Between(x, y, enemy.x, enemy.y);
        this.damageEnemy(enemy, spellDamage, angle, 200);
      }
    }
  }

  private damageEnemy(enemy: Enemy, amount: number, angle: number, knockback: number) {
    const died = enemy.takeHit(amount, angle, knockback);
    this.floatText(enemy.x, enemy.y - 16, `${amount}`, '#ffffff', 13);
    if (died) this.killEnemy(enemy);
  }

  private killEnemy(enemy: Enemy) {
    this.run.kills += 1;
    const { x, y } = enemy;
    const { bonusCoins, gemChance } = this.player.stats;
    const [min, max] = enemy.stats.coins;
    const coins = Phaser.Math.Between(min, max) + bonusCoins;
    for (let i = 0; i < coins; i++) this.addPickup(x, y, 'coin', true);
    if (Math.random() < 0.12) this.addPickup(x, y, 'food', true);
    const baseGem = enemy.kind === 'skeleton' ? 0.3 : 0.04;
    if (Math.random() < baseGem + gemChance) this.addPickup(x, y, 'gem', true);

    const burst = this.add.particles(x, y, 'spark', {
      speed: { min: 40, max: 140 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 350,
      tint: enemy.kind === 'slime' ? 0x22c55e : enemy.kind === 'bat' ? 0xa855f7 : 0xe5e7eb,
      emitting: false,
    });
    burst.setDepth(13);
    burst.explode(14);
    this.time.delayedCall(450, () => burst.destroy());

    this.enemies.remove(enemy, true, true);
    this.hudDirty = true;

    if (this.enemies.countActive() === 0) {
      emit(GAME_MESSAGE, { text: 'Floor cleared! Find the stairs.' });
    }
  }

  private enemyTouchesPlayer(enemy: Enemy) {
    if (!enemy.canAttack || this.run.health <= 0) return;
    const dealt = this.player.takeDamage(enemy.damage, enemy.x, enemy.y);
    if (dealt <= 0) return;
    enemy.didAttack();
    this.hudDirty = true;

    this.floatText(this.player.x, this.player.y - 26, `-${dealt}`, '#f87171', 14);
    this.cameras.main.shake(120, 0.006);
    this.cameras.main.flash(80, 120, 0, 0);

    if (this.run.health <= 0) this.gameOver();
  }

  /** Nearest active enemy within `range` whose bearing is inside ±halfAngle. */
  private closestEnemy(range: number, halfAngle: number): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = range;
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Enemy;
      if (!enemy.active) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (dist >= bestDist) continue;
      const bearing = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (Math.abs(Phaser.Math.Angle.Wrap(bearing - this.player.facing)) > halfAngle) continue;
      best = enemy;
      bestDist = dist;
    }
    return best;
  }

  // ---- Pickups & progression --------------------------------------------

  private collectPickup(item: Phaser.Physics.Arcade.Image) {
    if (this.time.now < (item.getData('readyAt') as number)) return;
    const kind = item.getData('kind') as ItemKind;
    const { x, y } = item;
    this.pickups.remove(item, true, true);

    switch (kind) {
      case 'coin':
        this.run.coins += COIN_VALUE;
        this.floatText(x, y - 10, `+${COIN_VALUE}`, '#fbbf24');
        break;
      case 'gem':
        this.run.coins += GEM_VALUE;
        this.floatText(x, y - 10, `+${GEM_VALUE} gem!`, '#67e8f9', 13);
        break;
      case 'food': {
        const before = this.run.health;
        this.player.heal(FOOD_HEAL);
        this.floatText(x, y - 10, `+${this.run.health - before} hp`, '#4ade80', 13);
        break;
      }
    }
    this.hudDirty = true;
  }

  private descend() {
    if (this.levelOver || this.run.health <= 0) return;
    this.levelOver = true;
    this.player.setMoveInput(0, 0);
    this.floatText(this.player.x, this.player.y - 30, 'Descending...', '#fbbf24', 14);
    emit(GAME_MESSAGE, { text: `Depth ${this.run.depth} cleared` });

    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      // Rest at the merchant between floors. The scene stays alive (paused)
      // so purchases mutate the live run state; leaving restarts the scene.
      this.physics.pause();
      this.shopOpen = true;
      emit(GAME_SHOP, { ...this.run });
    });
  }

  private startNextFloor() {
    const next: RunState = {
      ...this.run,
      upgrades: { ...this.run.upgrades },
      depth: this.run.depth + 1,
      // A short rest between floors: a little health, full mana.
      health: Math.min(this.run.maxHealth, this.run.health + 10),
      mana: this.run.maxMana,
    };
    this.scene.restart({ run: next } satisfies SceneData);
  }

  private gameOver() {
    this.levelOver = true;
    this.player.die();
    this.physics.pause();
    this.cameras.main.shake(300, 0.01);
    this.pushHud(true);
    emit(GAME_OVER, this.run);
  }

  private restartRun() {
    this.scene.restart({ run: createRunState() } satisfies SceneData);
  }

  // ---- Loop --------------------------------------------------------------

  update(time: number) {
    if (this.run.health <= 0) {
      if (this.keys && (Phaser.Input.Keyboard.JustDown(this.keys.R) || Phaser.Input.Keyboard.JustDown(this.keys.ENTER))) {
        this.restartRun();
      }
      return;
    }
    if (this.levelOver) return;

    // Movement: joystick wins whenever it is active, otherwise keyboard.
    let vx = 0;
    let vy = 0;
    if (this.joystick.lengthSq() > 0.001) {
      vx = this.joystick.x;
      vy = this.joystick.y;
    } else if (this.cursors && this.keys) {
      if (this.cursors.left.isDown || this.keys.A.isDown) vx -= 1;
      if (this.cursors.right.isDown || this.keys.D.isDown) vx += 1;
      if (this.cursors.up.isDown || this.keys.W.isDown) vy -= 1;
      if (this.cursors.down.isDown || this.keys.S.isDown) vy += 1;
    }
    this.player.setMoveInput(vx, vy);

    if (this.keys) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.J)) {
        this.swordAttack();
      }
      if (
        Phaser.Input.Keyboard.JustDown(this.keys.F) ||
        Phaser.Input.Keyboard.JustDown(this.keys.K) ||
        Phaser.Input.Keyboard.JustDown(this.keys.E) ||
        Phaser.Input.Keyboard.JustDown(this.keys.SHIFT)
      ) {
        this.castSpell();
      }
    }

    // Mana regen changes every frame; throttle HUD pushes to ~8/sec unless
    // something important happened.
    if (this.hudDirty || time >= this.nextHudAt) this.pushHud();
  }

  private pushHud(force = false) {
    this.hudDirty = false;
    this.nextHudAt = this.time.now + 125;
    void force;
    emit(GAME_UPDATE, { ...this.run });
  }

  // ---- Utilities ---------------------------------------------------------

  /** Classifies a wall tile by its surroundings so the tileset can autotile. */
  private wallContext(x: number, y: number): WallContext {
    if (this.dungeon.isFloor(x, y + 1)) return 'face';
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && this.dungeon.isFloor(x + dx, y + dy)) return 'edge';
      }
    }
    return 'deep';
  }

  private toWorld(p: { x: number; y: number }) {
    return { x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 };
  }

  private floatText(x: number, y: number, text: string, color: string, size = 12) {
    const t = this.add
      .text(x, y, text, {
        fontSize: `${size}px`,
        color,
        fontFamily: 'monospace',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({
      targets: t,
      y: y - 26,
      alpha: 0,
      duration: 750,
      ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private shutdown() {
    window.removeEventListener(GAME_ATTACK, this.onAttack);
    window.removeEventListener(GAME_SPELL, this.onSpell);
    window.removeEventListener(GAME_RESTART, this.onRestart);
    window.removeEventListener(GAME_JOYSTICK, this.onJoystick);
    window.removeEventListener(GAME_BUY, this.onBuy);
    window.removeEventListener(GAME_SHOP_LEAVE, this.onShopLeave);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    this.joystick.set(0, 0);
  }
}
