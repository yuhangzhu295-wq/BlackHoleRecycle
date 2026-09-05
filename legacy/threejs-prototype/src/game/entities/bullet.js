/**
 * 子弹与道具类 (Bullet & Drop Item)
 */
export class Bullet {
  constructor(x, y, vx, vy, isPlayer = true, color = '#00f0ff', dmg = 1) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.isPlayer = isPlayer;
    this.color = color;
    this.dmg = dmg;
    this.radius = isPlayer ? 4 : 4.5;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    if (this.isPlayer) {
      ctx.fillRect(this.x - 2, this.y - 8, 4, 16);
    } else {
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export class DropItem {
  constructor(x, y, type = 'weapon') {
    this.x = x;
    this.y = y;
    this.type = type; // 'weapon' | 'shield' | 'nuke' | 'score'
    this.vy = 80;
    this.radius = 14;
    this.anim = Math.random() * 5;
  }
  update(dt) {
    this.anim += dt * 4;
    this.y += this.vy * dt;
    this.x += Math.sin(this.anim) * 0.8;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    let color = '#ffd700';
    let text = 'P';
    if (this.type === 'shield') {
      color = '#00f0ff';
      text = 'S';
    } else if (this.type === 'nuke') {
      color = '#ff0055';
      text = 'B';
    } else if (this.type === 'weapon') {
      color = '#ffaa00';
      text = 'W';
    }
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 1);
    ctx.restore();
  }
}
