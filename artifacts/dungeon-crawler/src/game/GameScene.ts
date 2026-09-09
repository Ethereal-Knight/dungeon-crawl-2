import Phaser from 'phaser';
import { DungeonGenerator, FLOOR, type ItemKind } from './DungeonGenerator';
import { Enemy, type AoeEvent, type ShootEvent } from './Enemy';
import type { EnemyKind } from './enemyTypes';
import { Fireball } from './Fireball';
import { Player, SWORD_ARC } from './Player';
import { buy, isShopItemId, rollOffers, type ShopItemId } from './shop';
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
  GAME_PAUSE,
  GAME_RESTART,
  GAME_SHOP,
  GAME_SHOP_LEAVE,
  GAME_SPELL,
  GAME_UPDATE,
  createRunState,
  emit,
  type RunState,
  type ShopEvent,
  type ShopSession,
} from './events';

const MAP_W = 72;
const MAP_H = 72;
const SPELL_AOE = 40;
const SILVER_VALUE = 1;
const COIN_VALUE = 5;
const GEM_VALUE = 25;
const FOOD_HEAL = 30;
const CHEST_HITS = 3;
const BULLET_LIFETIME = 2600;
const MAX_ENEMIES = 70;
const FLOOR_SHOP_ITEMS = 3;
const CAVE_SHOP_ITEMS = 2;

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
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private chests!: Phaser.Physics.Arcade.Group;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private exit!: Phaser.Physics.Arcade.Image;
  private door: Phaser.Physics.Arcade.Image | null = null;
  private merchant: Phaser.Physics.Arcade.Image | null = null;
  private merchantZone: Phaser.Physics.Arcade.Image | null = null;
  private vignette!: Phaser.GameObjects.Image;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private joystick = new Phaser.Math.Vector2();
  private hudDirty = true;
  private nextHudAt = 0;
  private levelOver = false;
  private paused = false;
  private shop: ShopSession | null = null;
  private caveOffers: ShopItemId[] = [];
  private merchantReady = true;
  private lockedMessageAt = 0;

  constructor() {
    super('GameScene');
  }

  init(data: SceneData) {
    this.run = data.run ?? createRunState();
    this.run.hasKey = false;
    this.levelOver = false;
    this.paused = false;
    this.shop = null;
    this.door = null;
    this.merchant = null;
    this.merchantZone = null;
    this.merchantReady = true;
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
    this.spawnChests();
    this.spawnExit();
    this.spawnMerchant();
    this.setupCollisions();
    this.setupCamera();
    this.setupInput();

    this.caveOffers = rollOffers(this.run, CAVE_SHOP_ITEMS);

    emit(GAME_INIT, this.run);
    emit(GAME_LEVEL, { depth: this.run.depth });
    emit(GAME_MESSAGE, { text: 'The exit is locked. One of them carries the key.' });

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

    const depth = this.run.depth;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.dungeon.map[y][x] === FLOOR) {
          floorLayer.putTileAt(pickFloorTile(depth), x, y);
        } else {
          this.wallLayer.putTileAt(pickWallTile(this.wallContext(x, y), depth), x, y);
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
      const enemy = this.addEnemy(x, y, spawn.kind);
      if (spawn.hasKey) enemy.giveKey();
    }
  }

  /** Creates an enemy, adds it to the group and wires its ability events. */
  private addEnemy(x: number, y: number, kind: EnemyKind): Enemy {
    const enemy = new Enemy(this, x, y, kind, this.run.depth, this.player);
    this.enemies.add(enemy);
    if (enemy.stats.stationary) enemy.setImmovable(true);
    enemy.on('shoot', (ev: ShootEvent) => this.spawnVolley(enemy, ev));
    enemy.on('aoe', (ev: AoeEvent) => this.blast(enemy.x, enemy.y, ev.radius, ev.damage, 0xf97316));
    // Defer: the bomber raises this from inside its own preUpdate, and
    // destroying a sprite mid-update would throw and stall the game loop.
    enemy.on('detonate', () => {
      this.time.delayedCall(0, () => {
        if (enemy.active) this.killEnemy(enemy);
      });
    });
    enemy.on('summon', (minionKind: EnemyKind) => this.summon(enemy, minionKind));
    enemy.on('teleport', () => this.teleport(enemy));
    return enemy;
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

    if (kind === 'key') {
      sprite.setDepth(9).setScale(1.3);
      this.tweens.add({ targets: sprite, angle: 12, duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
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

  private spawnChests() {
    this.chests = this.physics.add.group({ immovable: true });
    for (const pos of this.dungeon.chests) {
      const { x, y } = this.toWorld(pos);
      const chest = this.chests.create(x, y, 'chest') as Phaser.Physics.Arcade.Image;
      chest.setDepth(7);
      chest.setData('hp', CHEST_HITS);
      chest.body!.setSize(26, 20);
    }
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

    // The gate sits on top of the stairs until the key is used.
    this.door = this.physics.add.image(x, y, 'door').setDepth(7).setImmovable(true);
    this.door.body!.setSize(TILE, TILE);
  }

  private spawnMerchant() {
    if (!this.dungeon.merchant) return;
    const { x, y } = this.toWorld(this.dungeon.merchant);
    this.merchant = this.physics.add.staticImage(x, y - 2, 'merchant').setDepth(8);
    // A wider invisible zone opens the stall, so approaching from any side
    // works even when the merchant stands against a wall.
    this.merchantZone = this.physics.add.staticImage(x, y, 'shadow').setVisible(false);
    this.merchantZone.body!.setSize(TILE + 20, TILE + 20);
    this.merchantZone.body!.setOffset(-(TILE + 20 - this.merchantZone.width) / 2, -(TILE + 20 - this.merchantZone.height) / 2);
    this.add.image(x, y + 12, 'shadow').setDepth(5).setAlpha(0.7);
    // A gentle lantern glow so the merchant stands out in the dark.
    const glow = this.add.image(x + 10, y + 4, 'spark').setDepth(6).setScale(3).setAlpha(0.25).setTint(0xfbbf24);
    this.tweens.add({ targets: glow, alpha: 0.45, scale: 3.6, duration: 900, yoyo: true, repeat: -1 });
    this.floatText(x, y - 26, 'Merchant', '#fbbf24', 11);
  }

  private setupCollisions() {
    this.fireballs = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();

    const solidEnemy = (obj: unknown) => !(obj as Enemy).stats?.phasing;

    this.physics.add.collider(this.player, this.wallLayer);
    this.physics.add.collider(this.enemies, this.wallLayer, undefined, (e) => solidEnemy(e));
    this.physics.add.collider(this.enemies, this.enemies, undefined, (a, b) => solidEnemy(a) && solidEnemy(b));
    this.physics.add.collider(this.pickups, this.wallLayer);
    this.physics.add.collider(this.player, this.chests);
    this.physics.add.collider(this.enemies, this.chests, undefined, (e) => solidEnemy(e));
    this.physics.add.collider(this.pickups, this.chests);

    if (this.door) {
      this.physics.add.collider(this.player, this.door, () => this.tryOpenDoor());
      this.physics.add.collider(this.enemies, this.door, undefined, (e) => solidEnemy(e));
      this.physics.add.collider(this.pickups, this.door);
    }
    if (this.merchant && this.merchantZone) {
      this.physics.add.collider(this.player, this.merchant);
      this.physics.add.collider(this.enemies, this.merchant);
      this.physics.add.overlap(this.player, this.merchantZone, () => this.openCaveShop());
    }

    this.physics.add.collider(this.enemyBullets, this.wallLayer, (b) => {
      (b as Phaser.Physics.Arcade.Image).destroy();
    });
    this.physics.add.overlap(this.player, this.enemyBullets, (_p, b) => {
      this.bulletHitsPlayer(b as Phaser.Physics.Arcade.Image);
    });

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
    this.physics.add.overlap(this.fireballs, this.chests, (fb) => {
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
    const zoom = Phaser.Math.Clamp(short / (11 * TILE), 1.1, 2.6);
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
    window.addEventListener(GAME_PAUSE, this.onPause);
  }

  // ---- Bridge handlers (arrow functions keep `this` bound) -------------

  private onAttack = () => this.swordAttack();
  private onSpell = () => this.castSpell();
  private onRestart = () => this.restartRun();
  /**
   * The pause menu freezes the whole scene (physics, enemy thinking, tweens
   * and timers) so nothing sneaks up while the player reads their stats.
   */
  private onPause = (e: Event) => {
    const paused = (e as CustomEvent<{ paused: boolean }>).detail?.paused ?? false;
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) {
      this.player.setMoveInput(0, 0);
      this.joystick.set(0, 0);
      this.scene.pause();
    } else {
      this.scene.resume();
    }
  };
  private onJoystick = (e: Event) => {
    const d = (e as CustomEvent<{ x: number; y: number }>).detail;
    this.joystick.set(d?.x ?? 0, d?.y ?? 0);
  };
  private onBuy = (e: Event) => {
    if (!this.shop) return;
    const id = (e as CustomEvent<{ id: string }>).detail?.id;
    if (!id || !isShopItemId(id) || !this.shop.offers.includes(id)) return;
    if (buy(this.run, id)) this.emitShop();
  };
  private onShopLeave = () => {
    if (!this.shop) return;
    const kind = this.shop.kind;
    this.shop = null;
    if (kind === 'floor') {
      this.startNextFloor();
    } else {
      // Back into the cave: the merchant needs a little space before the
      // stall can be re-entered.
      this.merchantReady = false;
      this.physics.resume();
      this.hudDirty = true;
    }
  };

  // ---- Shops -------------------------------------------------------------

  private emitShop() {
    if (!this.shop) return;
    const detail: ShopEvent = { run: { ...this.run }, session: { ...this.shop } };
    emit(GAME_SHOP, detail);
  }

  private openShop(kind: ShopSession['kind'], offers: ShopItemId[]) {
    this.physics.pause();
    this.player.setMoveInput(0, 0);
    this.shop = { kind, offers };
    this.emitShop();
  }

  private openCaveShop() {
    if (this.shop || this.levelOver || !this.merchantReady || this.run.health <= 0) return;
    this.openShop('cave', this.caveOffers);
  }

  // ---- Combat ------------------------------------------------------------

  private swordAttack() {
    if (this.run.health <= 0 || this.levelOver || this.shop) return;

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
      for (const child of this.chests.getChildren()) {
        const chest = child as Phaser.Physics.Arcade.Image;
        if (!chest.active) continue;
        const dist = Phaser.Math.Distance.Between(x, y, chest.x, chest.y);
        if (dist > swordRange + chest.width / 2) continue;
        const toChest = Phaser.Math.Angle.Between(x, y, chest.x, chest.y);
        if (Math.abs(Phaser.Math.Angle.Wrap(toChest - facing)) > SWORD_ARC) continue;
        this.hitChest(chest);
        hits++;
      }
      if (hits > 0) this.cameras.main.shake(60, 0.003);
    });
  }

  private castSpell() {
    if (this.run.health <= 0 || this.levelOver || this.shop) return;

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
    for (const child of this.chests.getChildren()) {
      const chest = child as Phaser.Physics.Arcade.Image;
      if (!chest.active) continue;
      if (Phaser.Math.Distance.Between(x, y, chest.x, chest.y) <= SPELL_AOE + chest.width / 2) {
        this.hitChest(chest);
      }
    }
  }

  private damageEnemy(enemy: Enemy, amount: number, angle: number, knockback: number) {
    const before = enemy.hp;
    const died = enemy.takeHit(amount, angle, knockback);
    const dealt = Math.max(0, before - enemy.hp);
    if (enemy.lastHitBlocked) {
      this.floatText(enemy.x, enemy.y - 18, `blocked ${dealt}`, '#9ca3af', 11);
    } else {
      this.floatText(enemy.x, enemy.y - 16, `${dealt}`, '#ffffff', 13);
    }
    if (died) this.killEnemy(enemy);
  }

  private killEnemy(enemy: Enemy) {
    this.run.kills += 1;
    const { x, y, kind, stats } = enemy;

    const { gemChance, extraDropChance } = this.player.stats;
    const [min, max] = stats.coins;
    let coins = Phaser.Math.Between(min, max);
    if (Math.random() < extraDropChance) coins += 1;
    this.dropCoins(x, y, coins);
    if (Math.random() < 0.06) this.addPickup(x, y, 'food', true);
    const baseGem = kind === 'skeleton' || kind === 'shieldbearer' || kind === 'golem' ? 0.2 : 0.03;
    if (Math.random() < baseGem + gemChance) this.addPickup(x, y, 'gem', true);

    if (enemy.carriesKey) {
      this.addPickup(x, y, 'key');
      this.floatText(x, y - 28, 'The key!', '#fbbf24', 14);
      emit(GAME_MESSAGE, { text: 'It dropped the key. Take it to the gate.' });
    }
    if (enemy.owner) enemy.owner.minions = Math.max(0, enemy.owner.minions - 1);

    const burst = this.add.particles(x, y, 'spark', {
      speed: { min: 40, max: 140 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 350,
      tint: this.deathColor(kind),
      emitting: false,
    });
    burst.setDepth(13);
    burst.explode(14);
    this.time.delayedCall(450, () => burst.destroy());

    this.enemies.remove(enemy, true, true);
    this.hudDirty = true;

    // Great slimes break into smaller ones.
    if (stats.splitInto && this.enemies.countActive() < MAX_ENEMIES) {
      for (let i = 0; i < stats.splitInto.count; i++) {
        const a = (i / stats.splitInto.count) * Math.PI * 2;
        const child = this.addEnemy(x + Math.cos(a) * 14, y + Math.sin(a) * 14, stats.splitInto.kind);
        child.setVelocity(Math.cos(a) * 140, Math.sin(a) * 140);
      }
    }

    if (this.enemies.countActive() === 0) {
      emit(GAME_MESSAGE, { text: 'Floor cleared! Find the stairs.' });
    }
  }

  private deathColor(kind: EnemyKind) {
    switch (kind) {
      case 'slime':
      case 'bigslime':
        return 0x22c55e;
      case 'bat':
      case 'spitter':
      case 'mage':
      case 'summoner':
        return 0xa855f7;
      case 'wraith':
        return 0x7dd3fc;
      case 'bomber':
        return 0xef4444;
      case 'charger':
      case 'archer':
        return 0x92400e;
      default:
        return 0xe5e7eb;
    }
  }

  /** Scatters `count` coins; each is gold with the luck-adjusted chance. */
  private dropCoins(x: number, y: number, count: number, goldBonus = 0) {
    const { goldChance } = this.player.stats;
    const dropSpot = this.nearestFloorDrop(x, y);
    for (let i = 0; i < count; i++) {
      this.addPickup(
        dropSpot.x,
        dropSpot.y,
        Math.random() < goldChance + goldBonus ? 'coin' : 'silver',
        true,
      );
    }
  }

  /** Returns the nearest reachable floor tile so phased enemies cannot drop loot in walls. */
  private nearestFloorDrop(wx: number, wy: number) {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    let best: { x: number; y: number } | null = null;
    let bestDistance = Infinity;

    for (let y = ty - 4; y <= ty + 4; y++) {
      for (let x = tx - 4; x <= tx + 4; x++) {
        if (!this.dungeon.isFloor(x, y) || this.dungeon.distance[y][x] < 0) continue;
        const distance = Math.abs(x - tx) + Math.abs(y - ty);
        if (distance < bestDistance) {
          best = { x, y };
          bestDistance = distance;
        }
      }
    }

    return this.toWorld(best ?? this.dungeon.startPos);
  }

  private hitChest(chest: Phaser.Physics.Arcade.Image) {
    const hp = (chest.getData('hp') as number) - 1;
    chest.setData('hp', hp);
    this.tweens.add({ targets: chest, scaleX: 1.15, scaleY: 0.85, duration: 60, yoyo: true });
    const splinters = this.add.particles(chest.x, chest.y, 'spark', {
      speed: { min: 40, max: 110 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 300,
      tint: 0xa0642c,
      emitting: false,
    });
    splinters.setDepth(13);
    splinters.explode(hp <= 0 ? 22 : 6);
    this.time.delayedCall(400, () => splinters.destroy());

    if (hp <= 0) {
      this.breakChest(chest);
    } else if (hp === 1) {
      chest.setTexture('chest-cracked');
    }
  }

  /** A broken chest always holds a gem and a handful of coins, sometimes food. */
  private breakChest(chest: Phaser.Physics.Arcade.Image) {
    const { x, y } = chest;
    this.chests.remove(chest, true, true);
    this.cameras.main.shake(80, 0.004);
    this.floatText(x, y - 18, 'Treasure!', '#fbbf24', 13);
    this.addPickup(x, y, 'gem', true);
    this.dropCoins(x, y, Phaser.Math.Between(3, 5), 0.2);
    if (Math.random() < 0.4) this.addPickup(x, y, 'food', true);
  }

  // ---- Enemy abilities -----------------------------------------------------

  private spawnVolley(enemy: Enemy, ev: ShootEvent) {
    if (this.levelOver || this.run.health <= 0 || this.shop) return;
    const count = ev.spec.count ?? 1;
    const spread = ev.spec.spread ?? 0;
    for (let i = 0; i < count; i++) {
      const offset = count > 1 ? -spread / 2 + (spread * i) / (count - 1) : 0;
      const angle = ev.angle + offset;
      const bullet = this.enemyBullets.create(
        enemy.x + Math.cos(angle) * 14,
        enemy.y + Math.sin(angle) * 14,
        ev.spec.texture,
      ) as Phaser.Physics.Arcade.Image;
      bullet.setDepth(9);
      bullet.setRotation(angle);
      bullet.body!.setCircle(4, bullet.width / 2 - 4, bullet.height / 2 - 4);
      bullet.setVelocity(Math.cos(angle) * ev.spec.speed, Math.sin(angle) * ev.spec.speed);
      bullet.setData('damage', ev.damage);
      bullet.setData('diesAt', this.time.now + BULLET_LIFETIME);
      if (ev.spec.texture === 'bullet') {
        this.tweens.add({ targets: bullet, scale: { from: 0.8, to: 1.15 }, duration: 140, yoyo: true, repeat: -1 });
      }
    }
  }

  private bulletHitsPlayer(bullet: Phaser.Physics.Arcade.Image) {
    if (!bullet.active) return;
    const damage = bullet.getData('damage') as number;
    const fromX = bullet.x - bullet.body!.velocity.x;
    const fromY = bullet.y - bullet.body!.velocity.y;
    bullet.destroy();
    this.hurtPlayer(damage, fromX, fromY, '#f0abfc');
  }

  /** Expanding shockwave that hurts the hero if caught inside. */
  private blast(x: number, y: number, radius: number, damage: number, color: number) {
    const ring = this.add.image(x, y, 'ring').setDepth(13).setTint(color).setScale(0.2).setAlpha(0.9);
    this.tweens.add({
      targets: ring,
      scale: (radius * 2) / 64,
      alpha: 0,
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
    const burst = this.add.particles(x, y, 'spark', {
      speed: { min: 60, max: 200 },
      scale: { start: 1.1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 200, max: 420 },
      tint: [color, 0xffffff],
      emitting: false,
    });
    burst.setDepth(13);
    burst.explode(20);
    this.time.delayedCall(500, () => burst.destroy());
    this.cameras.main.shake(140, 0.006);

    if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) <= radius + 8) {
      this.hurtPlayer(damage, x, y, '#fb923c');
    }
  }

  private summon(summoner: Enemy, kind: EnemyKind) {
    if (this.levelOver || this.shop || this.enemies.countActive() >= MAX_ENEMIES) return;
    const spot = this.nearbyFloor(summoner.x, summoner.y, 1, 2) ?? { x: summoner.x, y: summoner.y + TILE };
    const minion = this.addEnemy(spot.x, spot.y, kind);
    minion.owner = summoner;
    summoner.minions += 1;
    this.puff(spot.x, spot.y, 0xa855f7);
  }

  private teleport(enemy: Enemy) {
    if (!enemy.active || this.levelOver) return;
    const spot = this.nearbyFloor(enemy.x, enemy.y, 4, 9);
    if (!spot) return;
    this.puff(enemy.x, enemy.y, 0xc084fc);
    enemy.setPosition(spot.x, spot.y);
    enemy.body!.reset(spot.x, spot.y);
    this.puff(spot.x, spot.y, 0xc084fc);
  }

  /** Random reachable floor tile between minTiles and maxTiles away (world coords). */
  private nearbyFloor(wx: number, wy: number, minTiles: number, maxTiles: number) {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = minTiles + Math.random() * (maxTiles - minTiles);
      const x = Math.round(tx + Math.cos(a) * r);
      const y = Math.round(ty + Math.sin(a) * r);
      if (this.dungeon.isFloor(x, y) && this.dungeon.distance[y][x] >= 0) return this.toWorld({ x, y });
    }
    return null;
  }

  private puff(x: number, y: number, color: number) {
    const p = this.add.particles(x, y, 'spark', {
      speed: { min: 20, max: 80 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.9, end: 0 },
      lifespan: 300,
      tint: color,
      emitting: false,
    });
    p.setDepth(13);
    p.explode(10);
    this.time.delayedCall(400, () => p.destroy());
  }

  // ---- Damage to the hero ----------------------------------------------------

  private hurtPlayer(amount: number, fromX: number, fromY: number, color: string) {
    if (this.run.health <= 0 || this.shop) return 0;
    const dealt = this.player.takeDamage(amount, fromX, fromY);
    if (dealt <= 0) return 0;
    this.hudDirty = true;
    this.floatText(this.player.x, this.player.y - 26, `-${dealt}`, color, 14);
    this.cameras.main.shake(120, 0.006);
    this.cameras.main.flash(80, 120, 0, 0);
    if (this.run.health <= 0) this.gameOver();
    return dealt;
  }

  private enemyTouchesPlayer(enemy: Enemy) {
    if (!enemy.canAttack || this.run.health <= 0) return;
    const dealt = this.hurtPlayer(enemy.contactDamage, enemy.x, enemy.y, '#f87171');
    if (dealt <= 0) return;
    enemy.didAttack();
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

  // ---- Pickups, door & progression -----------------------------------------

  private collectPickup(item: Phaser.Physics.Arcade.Image) {
    if (this.time.now < (item.getData('readyAt') as number)) return;
    const kind = item.getData('kind') as ItemKind;
    const { x, y } = item;
    this.pickups.remove(item, true, true);

    switch (kind) {
      case 'silver':
        this.run.coins += SILVER_VALUE;
        this.floatText(x, y - 10, `+${SILVER_VALUE}`, '#d1d5db', 11);
        break;
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
      case 'key':
        this.run.hasKey = true;
        this.floatText(x, y - 12, 'Key taken!', '#fbbf24', 14);
        emit(GAME_MESSAGE, { text: 'You have the key. Find the gate over the stairs.' });
        if (this.door) {
          this.tweens.add({ targets: this.door, alpha: 0.6, duration: 500, yoyo: true, repeat: -1 });
        }
        break;
    }
    this.hudDirty = true;
  }

  private tryOpenDoor() {
    if (!this.door || this.levelOver) return;
    if (!this.run.hasKey) {
      if (this.time.now > this.lockedMessageAt) {
        this.lockedMessageAt = this.time.now + 1500;
        this.floatText(this.door.x, this.door.y - 22, 'Locked', '#9ca3af', 12);
        emit(GAME_MESSAGE, { text: 'Locked. Kill the enemy carrying the key.' });
      }
      return;
    }
    const door = this.door;
    this.door = null;
    door.body!.enable = false;
    this.puff(door.x, door.y, 0xfbbf24);
    this.floatText(door.x, door.y - 22, 'Unlocked!', '#fbbf24', 14);
    emit(GAME_MESSAGE, { text: 'The gate is open. Descend when ready.' });
    this.tweens.add({
      targets: door,
      alpha: 0,
      scale: 1.3,
      duration: 350,
      ease: 'Quad.easeOut',
      onComplete: () => door.destroy(),
    });
  }

  private descend() {
    if (this.levelOver || this.run.health <= 0 || this.door) return;
    this.levelOver = true;
    this.player.setMoveInput(0, 0);
    this.floatText(this.player.x, this.player.y - 30, 'Descending...', '#fbbf24', 14);
    emit(GAME_MESSAGE, { text: `Depth ${this.run.depth} cleared` });

    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      // Rest at the merchant between floors with a random three-item stock.
      this.openShop('floor', rollOffers(this.run, FLOOR_SHOP_ITEMS));
    });
  }

  private startNextFloor() {
    const next: RunState = {
      ...this.run,
      upgrades: { ...this.run.upgrades },
      depth: this.run.depth + 1,
      hasKey: false,
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
    this.pushHud();
    emit(GAME_OVER, this.run);
  }

  private restartRun() {
    if (this.paused) {
      this.paused = false;
      this.scene.resume();
    }
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
    if (this.levelOver || this.shop) return;

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

    // Projectiles fizzle out after their lifetime.
    for (const child of this.enemyBullets.getChildren().slice()) {
      const bullet = child as Phaser.Physics.Arcade.Image;
      if (bullet.active && time >= (bullet.getData('diesAt') as number)) bullet.destroy();
    }

    // The merchant re-arms once the hero has stepped away from the stall.
    if (this.merchant && !this.merchantReady) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.merchant.x, this.merchant.y);
      if (d > 60) this.merchantReady = true;
    }

    // Mana regen changes every frame; throttle HUD pushes to ~8/sec unless
    // something important happened.
    if (this.hudDirty || time >= this.nextHudAt) this.pushHud();
  }

  private pushHud() {
    this.hudDirty = false;
    this.nextHudAt = this.time.now + 125;
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
    window.removeEventListener(GAME_PAUSE, this.onPause);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    this.joystick.set(0, 0);
  }
}
