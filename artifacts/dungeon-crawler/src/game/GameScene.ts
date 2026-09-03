import Phaser from 'phaser';
import { DungeonGenerator } from './DungeonGenerator';

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: any;
  private enemies!: Phaser.Physics.Arcade.Group;
  private coins!: Phaser.Physics.Arcade.Group;
  
  private tileSize = 32;
  private speed = 150;
  private dungeon!: DungeonGenerator;
  
  // Game State
  private health = 100;
  private mana = 100;
  private coinsCollected = 0;
  private armor = 20;
  private isAttacking = false;
  private attackTimer = 0;

  constructor() {
    super('GameScene');
  }

  preload() {
    // Generate placeholder textures
    const g = this.add.graphics();
    
    // Player texture
    g.fillStyle(0x3b82f6, 1); // Blue
    g.fillCircle(16, 16, 12);
    g.generateTexture('player', 32, 32);
    g.clear();

    // Enemy texture
    g.fillStyle(0xef4444, 1); // Red
    g.fillRect(4, 4, 24, 24);
    g.generateTexture('enemy', 32, 32);
    g.clear();

    // Coin texture
    g.fillStyle(0xf59e0b, 1); // Yellow
    g.fillCircle(8, 8, 6);
    g.generateTexture('coin', 16, 16);
    g.clear();

    // Wall texture
    g.fillStyle(0x1e1e2e, 1); // Dark wall
    g.fillRect(0, 0, 32, 32);
    g.lineStyle(2, 0x111118, 1);
    g.strokeRect(0, 0, 32, 32);
    g.generateTexture('wall', 32, 32);
    g.clear();

    // Floor texture
    g.fillStyle(0x2a2a35, 1); // Floor
    g.fillRect(0, 0, 32, 32);
    g.generateTexture('floor', 32, 32);
    g.clear();

    // Sword slash
    g.fillStyle(0xffffff, 0.8);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(32, 16);
    g.lineTo(0, 32);
    g.closePath();
    g.fillPath();
    g.generateTexture('slash', 32, 32);
    g.clear();
  }

  private boundTriggerAttack = this.triggerAttack.bind(this);
  private boundTriggerRestart = this.triggerRestart.bind(this);
  private boundHandleJoystick = this.handleJoystick.bind(this);

  create() {
    this.cameras.main.setBackgroundColor('#000000');
    
    // Generate Dungeon
    this.dungeon = new DungeonGenerator(50, 50);
    this.dungeon.generate();

    const map = this.make.tilemap({
      tileWidth: this.tileSize,
      tileHeight: this.tileSize,
      width: this.dungeon.width,
      height: this.dungeon.height,
    });

    const tilesetWall = map.addTilesetImage('wall');
    const tilesetFloor = map.addTilesetImage('floor');
    
    const floorLayer = map.createBlankLayer('Floor', tilesetFloor!);
    const wallLayer = map.createBlankLayer('Wall', tilesetWall!);

    for (let y = 0; y < this.dungeon.height; y++) {
      for (let x = 0; x < this.dungeon.width; x++) {
        if (this.dungeon.map[y][x] === 1) {
          floorLayer?.putTileAt(0, x, y);
        } else {
          wallLayer?.putTileAt(0, x, y);
        }
      }
    }

    wallLayer?.setCollisionByExclusion([-1]);

    // Setup Player
    const startX = this.dungeon.startPos.x * this.tileSize + this.tileSize / 2;
    const startY = this.dungeon.startPos.y * this.tileSize + this.tileSize / 2;

    this.player = this.physics.add.sprite(startX, startY, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.body!.setSize(20, 20);

    this.physics.add.collider(this.player, wallLayer!);

    // Setup Enemies
    this.enemies = this.physics.add.group();
    this.dungeon.enemies.forEach(pos => {
      const ex = pos.x * this.tileSize + this.tileSize / 2;
      const ey = pos.y * this.tileSize + this.tileSize / 2;
      const enemy = this.enemies.create(ex, ey, 'enemy') as Phaser.Physics.Arcade.Sprite;
      enemy.setBounce(1);
      enemy.setCollideWorldBounds(true);
      // Give random velocity
      enemy.setVelocity(Phaser.Math.Between(-50, 50), Phaser.Math.Between(-50, 50));
      enemy.setData('health', 30);
    });
    this.physics.add.collider(this.enemies, wallLayer!);
    this.physics.add.collider(this.enemies, this.enemies);

    // Coins
    this.coins = this.physics.add.group();
    this.dungeon.items.forEach(pos => {
      const cx = pos.x * this.tileSize + this.tileSize / 2;
      const cy = pos.y * this.tileSize + this.tileSize / 2;
      this.coins.create(cx, cy, 'coin');
    });

    this.physics.add.overlap(this.player, this.coins, this.collectCoin, undefined, this);
    this.physics.add.collider(this.player, this.enemies, this.hitEnemy, undefined, this);

    this.cameras.main.startFollow(this.player, true, 0.05, 0.05);
    this.cameras.main.setZoom(1.5);

    // Input
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys('W,S,A,D,SPACE');
    }

    // Set up a custom event emitter for React to listen to
    window.dispatchEvent(new CustomEvent('game-init', {
      detail: {
        health: this.health,
        mana: this.mana,
        coins: this.coinsCollected,
        armor: this.armor
      }
    }));
    
    // Listen for inputs from React UI
    window.addEventListener('game-attack', this.boundTriggerAttack as EventListener);
    window.addEventListener('game-restart', this.boundTriggerRestart as EventListener);
    window.addEventListener('game-joystick', this.boundHandleJoystick as EventListener);

    this.events.on('shutdown', this.shutdown, this);
  }

  private joystickVector = { x: 0, y: 0 };

  private handleJoystick(e: Event) {
    const detail = (e as CustomEvent).detail;
    if (detail) {
      this.joystickVector = { x: detail.x, y: detail.y };
    } else {
      this.joystickVector = { x: 0, y: 0 };
    }
  }

  private triggerRestart() {
    this.health = 100;
    this.mana = 100;
    this.coinsCollected = 0;
    this.scene.restart();
    this.updateHUD();
  }

  private collectCoin(player: any, coin: any) {
    coin.destroy();
    this.coinsCollected += 5;
    this.updateHUD();
    
    // Feedback
    this.showFloatingText(coin.x, coin.y, '+5', '#f59e0b');
  }

  private hitEnemy(player: any, enemy: any) {
    if (this.isAttacking) return; // Don't take damage while slicing
    
    this.health -= 5;
    this.updateHUD();
    this.showFloatingText(player.x, player.y - 20, '-5', '#ef4444');
    
    // Knockback
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, player.x, player.y);
    player.body.velocity.x = Math.cos(angle) * 300;
    player.body.velocity.y = Math.sin(angle) * 300;

    this.cameras.main.shake(100, 0.005);
    
    if (this.health <= 0) {
      // Game over
      this.player.setTint(0xff0000);
      this.physics.pause();
    }
  }

  private triggerAttack() {
    if (this.isAttacking || this.health <= 0 || this.mana < 10) return;
    this.isAttacking = true;
    this.attackTimer = 15; // frames
    this.mana -= 10;
    this.updateHUD();

    // Determine facing direction based on velocity or last velocity
    let angle = 0;
    if (this.player.body!.velocity.x > 0) angle = 0;
    else if (this.player.body!.velocity.x < 0) angle = Math.PI;
    else if (this.player.body!.velocity.y > 0) angle = Math.PI / 2;
    else if (this.player.body!.velocity.y < 0) angle = -Math.PI / 2;
    else angle = this.player.rotation;

    this.player.rotation = angle;

    const slashX = this.player.x + Math.cos(angle) * 24;
    const slashY = this.player.y + Math.sin(angle) * 24;

    const slash = this.add.sprite(slashX, slashY, 'slash');
    slash.setRotation(angle);
    
    this.tweens.add({
      targets: slash,
      alpha: 0,
      duration: 200,
      onComplete: () => slash.destroy()
    });

    // Hit detection using distance and angle
    this.enemies.getChildren().forEach(c => {
      const enemy = c as Phaser.Physics.Arcade.Sprite;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (dist < 40) {
        // Check angle
        const angleToEnemy = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
        const diff = Phaser.Math.Angle.ShortestBetween(Phaser.Math.RadToDeg(angle), Phaser.Math.RadToDeg(angleToEnemy));
        if (Math.abs(diff) < 60) {
          // Hit!
          let hp = enemy.getData('health');
          hp -= 15;
          
          this.showFloatingText(enemy.x, enemy.y - 10, '15', '#ffffff');
          
          if (hp <= 0) {
            enemy.destroy();
          } else {
            enemy.setData('health', hp);
            // Knockback enemy
            enemy.setVelocity(Math.cos(angle) * 200, Math.sin(angle) * 200);
            enemy.setTint(0xff0000);
            this.time.delayedCall(100, () => enemy.clearTint());
          }
        }
      }
    });
  }

  private showFloatingText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, { fontSize: '12px', color: color, fontFamily: 'monospace' });
    t.setOrigin(0.5);
    this.tweens.add({
      targets: t,
      y: y - 20,
      alpha: 0,
      duration: 800,
      onComplete: () => t.destroy()
    });
  }

  private updateHUD() {
    window.dispatchEvent(new CustomEvent('game-update', {
      detail: {
        health: this.health,
        mana: this.mana,
        coins: this.coinsCollected,
        armor: this.armor
      }
    }));
  }

  update(time: number, delta: number) {
    if (this.health <= 0) return;

    // Movement
    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -1;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = 1;

    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -1;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = 1;

    // Joystick overrides keyboard
    if (this.joystickVector.x !== 0 || this.joystickVector.y !== 0) {
      vx = this.joystickVector.x;
      vy = this.joystickVector.y;
    }

    if (!this.isAttacking) {
      // Normalize vector
      const length = Math.sqrt(vx * vx + vy * vy);
      if (length > 0) {
        vx = vx / length;
        vy = vy / length;
        
        // Face movement direction
        this.player.rotation = Math.atan2(vy, vx);
      }
      
      this.player.setVelocity(vx * this.speed, vy * this.speed);
    } else {
      this.player.setVelocity(0, 0);
      this.attackTimer--;
      if (this.attackTimer <= 0) {
        this.isAttacking = false;
      }
    }

    // Keyboard attack
    if (Phaser.Input.Keyboard.JustDown(this.wasd.SPACE)) {
      this.triggerAttack();
    }

    // Mana regen
    if (this.mana < 100) {
      this.mana += 0.05;
      if (this.mana > 100) this.mana = 100;
      if (time % 500 < delta) { // update occasionally
        this.updateHUD();
      }
    }

    // Basic enemy AI (bounce naturally, but occasional homing)
    this.enemies.getChildren().forEach((c) => {
      const enemy = c as Phaser.Physics.Arcade.Sprite;
      const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      if (dist < 100 && Math.random() < 0.05) {
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
        enemy.setVelocity(Math.cos(angle) * 60, Math.sin(angle) * 60);
      }
    });
  }

  shutdown() {
    window.removeEventListener('game-attack', this.boundTriggerAttack as EventListener);
    window.removeEventListener('game-restart', this.boundTriggerRestart as EventListener);
    window.removeEventListener('game-joystick', this.boundHandleJoystick as EventListener);
  }
}
