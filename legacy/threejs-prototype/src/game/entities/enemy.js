/**
 * 敌人及 Boss 体系
 * 支持侦察机(Scout)、重装机(Heavy)、极速机(Interceptor)与旗舰母舰(Boss)
 */
export class Enemy {
  constructor(x, y, type = 'scout', screenWidth = 375) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.screenWidth = screenWidth;
    this.shootTimer = Math.random() * 1.5;
    this.shootInterval = 1.6;
    this.alive = true;
    this.animTime = Math.random() * 10;
    switch (type) {
      case 'scout':
        this.width = 30;
        this.height = 30;
        this.hp = 1;
        this.maxHp = 1;
        this.speedY = 120;
        this.speedX = 0;
        this.score = 100;
        this.color = '#ff3366';
        break;
      case 'interceptor':
        this.width = 24;
        this.height = 36;
        this.hp = 2;
        this.maxHp = 2;
        this.speedY = 190;
        this.speedX = Math.sin(this.animTime) * 60;
        this.score = 250;
        this.color = '#ff9900';
        break;
      case 'heavy':
        this.width = 48;
        this.height = 48;
        this.hp = 6;
        this.maxHp = 6;
        this.speedY = 65;
        this.speedX = 0;
        this.score = 500;
        this.color = '#cc00ff';
        this.shootInterval = 1.2;
        break;
      case 'boss':
        this.width = 110;
        this.height = 80;
        this.hp = 80;
        this.maxHp = 80;
        this.speedY = 25;
        this.speedX = 80;
        this.score = 5000;
        this.color = '#ff0033';
        this.shootInterval = 0.55;
        this.isBoss = true;
        this.entryPhase = true;
        break;
    }
  }
  update(dt, playerX = 0) {
    this.animTime += dt;
    this.shootTimer += dt;
    if (this.type === 'interceptor') {
      this.x += Math.sin(this.animTime * 4) * 2;
      this.y += this.speedY * dt;
    } else if (this.type === 'boss') {
      if (this.entryPhase) {
        this.y += 60 * dt;
        if (this.y >= 120) {
          this.entryPhase = false;
        }
      } else {
        this.x += this.speedX * dt;
        if (this.x > this.screenWidth - this.width / 2 - 10) {
          this.speedX = -Math.abs(this.speedX);
        } else if (this.x < this.width / 2 + 10) {
          this.speedX = Math.abs(this.speedX);
        }
      }
    } else {
      this.y += this.speedY * dt;
    }
  }
  canShoot() {
    if (this.type === 'scout') return false;
    if (this.shootTimer >= this.shootInterval) {
      this.shootTimer = 0;
      return true;
    }
    return false;
  }
  hit(dmg = 1) {
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.type === 'boss') {
      ctx.fillStyle = '#220033';
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, this.height / 2);
      ctx.lineTo(this.width / 2, 0);
      ctx.lineTo(this.width / 2 - 15, -this.height / 2);
      ctx.lineTo(-this.width / 2 + 15, -this.height / 2);
      ctx.lineTo(-this.width / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const coreGlow = Math.sin(this.animTime * 6) * 4;
      ctx.fillStyle = '#ff0055';
      ctx.beginPath();
      ctx.arc(0, 5, 12 + coreGlow, 0, Math.PI * 2);
      ctx.fill();
      const barW = this.width + 20;
      const hpRatio = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(-barW / 2, -this.height / 2 - 16, barW, 6);
      ctx.fillStyle = '#ff0055';
      ctx.fillRect(-barW / 2, -this.height / 2 - 16, barW * hpRatio, 6);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(-barW / 2, -this.height / 2 - 16, barW, 6);
    } else if (this.type === 'heavy') {
      ctx.fillStyle = '#3a1147';
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, this.height / 2);
      ctx.lineTo(this.width / 2, -this.height / 4);
      ctx.lineTo(this.width / 4, -this.height / 2);
      ctx.lineTo(-this.width / 4, -this.height / 2);
      ctx.lineTo(-this.width / 2, -this.height / 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (this.hp < this.maxHp) {
        const barW = this.width;
        const hpRatio = this.hp / this.maxHp;
        ctx.fillStyle = '#ff0055';
        ctx.fillRect(-barW / 2, -this.height / 2 - 6, barW * hpRatio, 3);
      }
    } else if (this.type === 'interceptor') {
      ctx.fillStyle = '#ff9900';
      ctx.beginPath();
      ctx.moveTo(0, this.height / 2);
      ctx.lineTo(this.width / 2, -this.height / 2);
      ctx.lineTo(0, -this.height / 3);
      ctx.lineTo(-this.width / 2, -this.height / 2);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(0, this.height / 2);
      ctx.lineTo(this.width / 2, -this.height / 2);
      ctx.lineTo(-this.width / 2, -this.height / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
