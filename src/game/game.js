/**
 * 游戏主逻辑调度器 (Main Game Controller)
 * 包含关卡波次推进、碰撞检测、分数倍率计算、全屏清屏大招与 Boss 战状态流转
 */
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { Bullet, DropItem } from './entities/bullet.js';
import { ParticleSystem } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
import { platform } from '../adapter/platform.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = new ParticleSystem();
    this.state = 'START';
    this.score = 0;
    this.highScore = platform.getStorage('MINIGAME_HIGH_SCORE', 0);
    this.combo = 0;
    this.comboTimer = 0;
    this.wave = 1;
    this.waveTimer = 0;
    this.bossSpawned = false;
    this.nukes = 2;
    this.player = null;
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.dropItems = [];
    this.stars = [];
    this.initStars();
    this.initPlayer();
    this.bindEvents();
  }
  initStars() {
    this.stars = [];
    for (let i = 0; i < 70; i++) {
      this.stars.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        size: Math.random() * 2 + 0.5,
        speed: Math.random() * 80 + 30,
        alpha: Math.random() * 0.7 + 0.3
      });
    }
  }
  initPlayer() {
    this.player = new Player(this.canvas.width / 2, this.canvas.height - 120);
  }
  start() {
    this.state = 'PLAYING';
    this.score = 0;
    this.combo = 0;
    this.wave = 1;
    this.waveTimer = 0;
    this.bossSpawned = false;
    this.nukes = 2;
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.dropItems = [];
    this.initPlayer();
    platform.startScreenRecording({
      onStart: () => console.log('Recording started...'),
      onStop: () => console.log('Recording saved')
    });
  }
  bindEvents() {
    const handleTouchStart = (clientX, clientY) => {
      audio.resumeCtx();
      if (this.state === 'START' || this.state === 'GAMEOVER') {
        this.start();
        return;
      }
      if (this.state === 'PLAYING') {
        this.player.targetX = clientX;
        this.player.targetY = clientY - 40;
        this.player.isDragging = true;
      }
    };
    const handleTouchMove = (clientX, clientY) => {
      if (this.state === 'PLAYING' && this.player) {
        this.player.targetX = Math.max(20, Math.min(this.canvas.width - 20, clientX));
        this.player.targetY = Math.max(40, Math.min(this.canvas.height - 40, clientY - 40));
      }
    };
    const handleTouchEnd = () => {
      if (this.player) this.player.isDragging = false;
    };
    if (typeof wx !== 'undefined' && wx.onTouchStart) {
      wx.onTouchStart((e) => {
        const touch = e.touches[0];
        if (touch) handleTouchStart(touch.clientX, touch.clientY);
      });
      wx.onTouchMove((e) => {
        const touch = e.touches[0];
        if (touch) handleTouchMove(touch.clientX, touch.clientY);
      });
      wx.onTouchEnd(handleTouchEnd);
    } else if (typeof tt !== 'undefined' && tt.onTouchStart) {
      tt.onTouchStart((e) => {
        const touch = e.touches[0];
        if (touch) handleTouchStart(touch.clientX, touch.clientY);
      });
      tt.onTouchMove((e) => {
        const touch = e.touches[0];
        if (touch) handleTouchMove(touch.clientX, touch.clientY);
      });
      tt.onTouchEnd(handleTouchEnd);
    } else {
      this.canvas.addEventListener('mousedown', (e) => {
        const rect = this.canvas.getBoundingClientRect();
        handleTouchStart(e.clientX - rect.left, e.clientY - rect.top);
      });
      this.canvas.addEventListener('mousemove', (e) => {
        if (this.player && this.player.isDragging) {
          const rect = this.canvas.getBoundingClientRect();
          handleTouchMove(e.clientX - rect.left, e.clientY - rect.top);
        }
      });
      window.addEventListener('mouseup', handleTouchEnd);
      this.canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const t = e.touches[0];
        handleTouchStart(t.clientX - rect.left, t.clientY - rect.top);
      }, { passive: false });
      this.canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const t = e.touches[0];
        handleTouchMove(t.clientX - rect.left, t.clientY - rect.top);
      }, { passive: false });
      this.canvas.addEventListener('touchend', handleTouchEnd);
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
          this.useNuke();
        }
      });
    }
  }
  useNuke() {
    if (this.state !== 'PLAYING' || this.nukes <= 0) return;
    this.nukes--;
    platform.vibrate('heavy');
    audio.playExplosion('boss');
    this.particles.spawnShockwave(this.canvas.width / 2, this.canvas.height / 2, this.canvas.width * 0.9, '#ff0055', 0.6);
    this.enemyBullets = [];
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const isDead = e.hit(30);
      if (isDead) {
        this.score += e.score;
        this.particles.spawnExplosion(e.x, e.y, e.color, 25, 6);
        this.enemies.splice(i, 1);
      }
    }
  }
  spawnWaveEnemies(dt) {
    this.waveTimer += dt;
    if (this.waveTimer > 18 && !this.bossSpawned) {
      this.bossSpawned = true;
      audio.playWarning();
      this.particles.spawnFloatingText('⚠️ 警告: 敌方旗舰逼近! ⚠️', this.canvas.width / 2, 100, '#ff0055', 20);
      this.enemies.push(new Enemy(this.canvas.width / 2, -60, 'boss', this.canvas.width));
      return;
    }
    if (!this.bossSpawned) {
      const spawnRate = Math.max(0.4, 1.2 - this.wave * 0.15);
      if (Math.random() < dt / spawnRate) {
        const types = ['scout', 'scout', 'interceptor', 'heavy'];
        const chosen = types[Math.floor(Math.random() * types.length)];
        const spawnX = Math.random() * (this.canvas.width - 60) + 30;
        this.enemies.push(new Enemy(spawnX, -30, chosen, this.canvas.width));
      }
    }
  }
  firePlayerBullets() {
    if (!this.player || !this.player.canShoot()) return;
    this.player.resetShootTimer();
    audio.playLaser(1 + this.player.weaponLevel * 0.05);
    const level = this.player.weaponLevel;
    const px = this.player.x;
    const py = this.player.y - this.player.height / 2;
    if (level === 1) {
      this.playerBullets.push(new Bullet(px, py, 0, -650, true, '#00f0ff', 1));
    } else if (level === 2) {
      this.playerBullets.push(new Bullet(px - 12, py, 0, -650, true, '#00f0ff', 1));
      this.playerBullets.push(new Bullet(px + 12, py, 0, -650, true, '#00f0ff', 1));
    } else if (level === 3) {
      this.playerBullets.push(new Bullet(px, py - 4, 0, -680, true, '#ff00ea', 1.5));
      this.playerBullets.push(new Bullet(px - 14, py, -90, -650, true, '#00f0ff', 1));
      this.playerBullets.push(new Bullet(px + 14, py, 90, -650, true, '#00f0ff', 1));
    } else {
      this.playerBullets.push(new Bullet(px - 8, py - 4, 0, -700, true, '#ffd700', 2));
      this.playerBullets.push(new Bullet(px + 8, py - 4, 0, -700, true, '#ffd700', 2));
      this.playerBullets.push(new Bullet(px - 20, py, -140, -660, true, '#ff0055', 1.2));
      this.playerBullets.push(new Bullet(px + 20, py, 140, -660, true, '#ff0055', 1.2));
    }
  }
  fireEnemyBullets(e) {
    if (!e.canShoot()) return;
    if (e.type === 'heavy') {
      this.enemyBullets.push(new Bullet(e.x - 10, e.y + e.height / 2, 0, 220, false, '#cc00ff'));
      this.enemyBullets.push(new Bullet(e.x + 10, e.y + e.height / 2, 0, 220, false, '#cc00ff'));
    } else if (e.type === 'boss') {
      audio.playLaser(0.5);
      for (let angle = -0.6; angle <= 0.6; angle += 0.3) {
        const vx = Math.sin(angle) * 240;
        const vy = Math.cos(angle) * 240;
        this.enemyBullets.push(new Bullet(e.x, e.y + e.height / 2, vx, vy, false, '#ff0033'));
      }
    }
  }
  update(dt) {
    for (const s of this.stars) {
      s.y += s.speed * dt;
      if (s.y > this.canvas.height) {
        s.y = 0;
        s.x = Math.random() * this.canvas.width;
      }
    }
    this.particles.update(dt);
    if (this.state !== 'PLAYING') return;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
      }
    }
    this.player.update(dt);
    this.firePlayerBullets();
    this.spawnWaveEnemies(dt);
    for (let i = this.playerBullets.length - 1; i >= 0; i--) {
      const b = this.playerBullets[i];
      b.update(dt);
      if (b.y < -20 || b.x < -20 || b.x > this.canvas.width + 20) {
        this.playerBullets.splice(i, 1);
      }
    }
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i];
      b.update(dt);
      if (b.y > this.canvas.height + 20 || b.x < -20 || b.x > this.canvas.width + 20) {
        this.enemyBullets.splice(i, 1);
      }
    }
    for (let i = this.dropItems.length - 1; i >= 0; i--) {
      const item = this.dropItems[i];
      item.update(dt);
      if (item.y > this.canvas.height + 30) {
        this.dropItems.splice(i, 1);
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, this.player.x);
      this.fireEnemyBullets(e);
      if (e.y > this.canvas.height + 60 && !e.isBoss) {
        this.enemies.splice(i, 1);
      }
    }
    this.checkCollisions();
  }
  checkCollisions() {
    for (let i = this.playerBullets.length - 1; i >= 0; i--) {
      const b = this.playerBullets[i];
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        const dist = Math.hypot(b.x - e.x, b.y - e.y);
        if (dist < (b.radius + e.width / 2)) {
          this.playerBullets.splice(i, 1);
          this.particles.spawnSparks(b.x, b.y, '#00f0ff', 5);
          const isDead = e.hit(b.dmg);
          if (isDead) {
            this.combo++;
            this.comboTimer = 2.5;
            const comboBonus = Math.min(this.combo, 10);
            const addScore = e.score * comboBonus;
            this.score += addScore;
            platform.vibrate('light');
            if (this.combo > 1) {
              audio.playCombo(this.combo);
              this.particles.spawnFloatingText(`${this.combo}连击! +${addScore}`, e.x, e.y, '#ffd700', 16);
            }
            audio.playExplosion(e.isBoss ? 'boss' : 'medium');
            this.particles.spawnExplosion(e.x, e.y, e.color, e.isBoss ? 50 : 20, e.isBoss ? 7 : 4);
            if (Math.random() < 0.35 || e.isBoss) {
              const types = ['weapon', 'weapon', 'shield', 'nuke'];
              const dropType = types[Math.floor(Math.random() * types.length)];
              this.dropItems.push(new DropItem(e.x, e.y, dropType));
            }
            if (e.isBoss) {
              this.bossSpawned = false;
              this.wave++;
              this.waveTimer = 0;
              this.particles.spawnFloatingText('🏆 旗舰歼灭! WAVE UP!', this.canvas.width / 2, 200, '#00ffcc', 24);
            }
            this.enemies.splice(j, 1);
          }
          break;
        }
      }
    }
    for (let i = this.dropItems.length - 1; i >= 0; i--) {
      const item = this.dropItems[i];
      const dist = Math.hypot(item.x - this.player.x, item.y - this.player.y);
      if (dist < (item.radius + this.player.width / 2)) {
        audio.playPowerup();
        platform.vibrate('medium');
        if (item.type === 'weapon') {
          this.player.upgradeWeapon();
          this.particles.spawnFloatingText('火力升级!', this.player.x, this.player.y - 30, '#ffd700', 18);
        } else if (item.type === 'shield') {
          this.player.activateShield(8);
          this.particles.spawnFloatingText('能量护盾!', this.player.x, this.player.y - 30, '#00f0ff', 18);
        } else if (item.type === 'nuke') {
          this.nukes = Math.min(5, this.nukes + 1);
          this.particles.spawnFloatingText('获得清屏核弹!', this.player.x, this.player.y - 30, '#ff0055', 18);
        }
        this.dropItems.splice(i, 1);
      }
    }
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i];
      const dist = Math.hypot(b.x - this.player.x, b.y - this.player.y);
      if (dist < (b.radius + this.player.width / 3)) {
        this.enemyBullets.splice(i, 1);
        this.handlePlayerDamage();
        break;
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dist = Math.hypot(e.x - this.player.x, e.y - this.player.y);
      if (dist < (e.width / 2 + this.player.width / 3)) {
        this.handlePlayerDamage();
        if (!e.isBoss) {
          this.enemies.splice(i, 1);
          this.particles.spawnExplosion(e.x, e.y, e.color, 15, 3);
        }
        break;
      }
    }
  }
  handlePlayerDamage() {
    const result = this.player.hit();
    if (result === 'shield_blocked') {
      audio.playExplosion('heavy');
      platform.vibrate('medium');
      this.particles.spawnShockwave(this.player.x, this.player.y, 45, '#00f0ff', 0.25);
    } else if (result === 'damaged') {
      audio.playExplosion('heavy');
      platform.vibrate('heavy');
      this.particles.spawnExplosion(this.player.x, this.player.y, '#ff0055', 30, 5);
      if (this.player.hp <= 0) {
        this.gameOver();
      }
    }
  }
  gameOver() {
    this.state = 'GAMEOVER';
    platform.stopScreenRecording();
    if (this.score > this.highScore) {
      this.highScore = this.score;
      platform.setStorage('MINIGAME_HIGH_SCORE', this.highScore);
    }
  }
  drawUI() {
    const ctx = this.ctx;
    ctx.save();
    const safeArea = platform.getSafeArea();
    const top = Math.max(16, safeArea.top);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE: ${this.score}`, 16, top + 20);
    ctx.textAlign = 'right';
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText(`WAVE ${this.wave} | BEST: ${this.highScore}`, this.canvas.width - 16, top + 20);
    ctx.textAlign = 'left';
    for (let i = 0; i < this.player.maxHp; i++) {
      ctx.fillStyle = i < this.player.hp ? '#ff0055' : 'rgba(255,255,255,0.2)';
      ctx.fillRect(16 + i * 22, top + 32, 16, 6);
    }
    ctx.fillStyle = '#ffaa00';
    ctx.font = '13px sans-serif';
    ctx.fillText(`💣 核弹: ${this.nukes}`, 16, top + 56);
    if (this.combo > 1 && this.comboTimer > 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd700';
      ctx.font = 'italic bold 22px sans-serif';
      ctx.fillText(`${this.combo} COMBO!`, this.canvas.width / 2, top + 50);
    }
    if (this.state === 'START') {
      this.drawStartScreen();
    } else if (this.state === 'GAMEOVER') {
      this.drawGameOverScreen();
    }
    ctx.restore();
  }
  drawStartScreen() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = 'rgba(10, 15, 30, 0.75)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('雷霆星战: 守护银河', w / 2, h / 2 - 100);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#a0aec0';
    ctx.fillText(`[${platform.getPlatformName()}]`, w / 2, h / 2 - 65);
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px sans-serif';
    ctx.fillText('按住拖动机身进行移动与自动射击', w / 2, h / 2);
    ctx.fillText('击杀敌机掉落武器强化、能量护盾与核弹', w / 2, h / 2 + 30);
    ctx.fillStyle = '#00f0ff';
    ctx.beginPath();
    ctx.roundRect(w / 2 - 90, h / 2 + 90, 180, 48, 8);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('点击立即启航', w / 2, h / 2 + 120);
  }
  drawGameOverScreen() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = 'rgba(15, 5, 20, 0.82)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff0055';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText('战机坠毁', w / 2, h / 2 - 110);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`最终得分: ${this.score}`, w / 2, h / 2 - 60);
    ctx.fillStyle = '#ffd700';
    ctx.font = '16px sans-serif';
    ctx.fillText(`历史最高分: ${this.highScore}`, w / 2, h / 2 - 30);
    ctx.fillStyle = '#00f0ff';
    ctx.beginPath();
    ctx.roundRect(w / 2 - 90, h / 2 + 20, 180, 46, 8);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('重新出击', w / 2, h / 2 + 48);
    ctx.fillStyle = '#333344';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(w / 2 - 90, h / 2 + 80, 180, 42, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#00f0ff';
    ctx.font = '15px sans-serif';
    ctx.fillText('分享战绩给好友', w / 2, h / 2 + 106);
  }
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#060913';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (const s of this.stars) {
      ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    for (const item of this.dropItems) item.draw(ctx);
    for (const b of this.playerBullets) b.draw(ctx);
    for (const b of this.enemyBullets) b.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
    if (this.player && this.player.hp > 0) {
      this.player.draw(ctx);
    }
    this.particles.draw(ctx);
    this.drawUI();
  }
}
