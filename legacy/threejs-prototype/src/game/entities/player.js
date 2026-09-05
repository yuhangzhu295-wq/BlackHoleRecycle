/**
 * 玩家战机实体 (Player Fighter)
 * 具备多级火力系统 (单发 -> 双发 -> 散射 -> 聚能激光)、能量护盾、绝招大招
 */
export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = 46;
    this.height = 54;
    this.speed = 360;
    this.hp = 3;
    this.maxHp = 3;
    this.weaponLevel = 1; // 1 ~ 4
    this.maxWeaponLevel = 4;
    this.shieldActive = false;
    this.shieldTime = 0;
    this.invulnerableTime = 0;
    this.shootTimer = 0;
    this.shootInterval = 0.12;
    this.targetX = x;
    this.targetY = y;
    this.isDragging = false;
    this.engineAnim = 0;
  }
  update(dt) {
    this.engineAnim += dt * 15;
    if (this.invulnerableTime > 0) {
      this.invulnerableTime -= dt;
    }
    if (this.shieldActive) {
      this.shieldTime -= dt;
      if (this.shieldTime <= 0) {
        this.shieldActive = false;
      }
    }
    // 平滑插值跟随目标手指/光标位置
    const lerpFactor = 0.35;
    this.x += (this.targetX - this.x) * lerpFactor;
    this.y += (this.targetY - this.y) * lerpFactor;
    this.shootTimer += dt;
  }
  canShoot() {
    return this.shootTimer >= this.shootInterval;
  }
  resetShootTimer() {
    this.shootTimer = 0;
  }
  upgradeWeapon() {
    if (this.weaponLevel < this.maxWeaponLevel) {
      this.weaponLevel++;
      return true;
    }
    return false;
  }
  activateShield(duration = 6) {
    this.shieldActive = true;
    this.shieldTime = duration;
  }
  hit() {
    if (this.shieldActive) {
      this.shieldActive = false;
      this.invulnerableTime = 0.8;
      return 'shield_blocked';
    }
    if (this.invulnerableTime > 0) {
      return 'invulnerable';
    }
    this.hp--;
    this.weaponLevel = Math.max(1, this.weaponLevel - 1);
    this.invulnerableTime = 1.6;
    return 'damaged';
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    // 无敌闪烁处理
    if (this.invulnerableTime > 0 && Math.floor(Date.now() / 60) % 2 === 0) {
      ctx.globalAlpha = 0.4;
    }
    // 尾焰喷射
    const flameHeight = 12 + Math.sin(this.engineAnim) * 4;
    const flameGrad = ctx.createLinearGradient(0, this.height / 2, 0, this.height / 2 + flameHeight);
    flameGrad.addColorStop(0, '#00f0ff');
    flameGrad.addColorStop(0.5, '#0077ff');
    flameGrad.addColorStop(1, 'rgba(0, 50, 255, 0)');
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(-8, this.height / 2 - 4);
    ctx.lineTo(8, this.height / 2 - 4);
    ctx.lineTo(0, this.height / 2 + flameHeight);
    ctx.closePath();
    ctx.fill();
    // 战机机翼与机身 (矢量硬派科技造型)
    ctx.fillStyle = '#1e3c72';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -this.height / 2);
    ctx.lineTo(this.width / 2, this.height / 2 - 8);
    ctx.lineTo(this.width / 4, this.height / 2);
    ctx.lineTo(0, this.height / 2 - 6);
    ctx.lineTo(-this.width / 4, this.height / 2);
    ctx.lineTo(-this.width / 2, this.height / 2 - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 机舱玻璃
    ctx.fillStyle = '#00f0ff';
    ctx.beginPath();
    ctx.ellipse(0, -6, 5, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // 武器挂载翼灯
    if (this.weaponLevel >= 2) {
      ctx.fillStyle = '#ff0055';
      ctx.fillRect(-this.width / 2 + 2, this.height / 4, 3, 6);
      ctx.fillRect(this.width / 2 - 5, this.height / 4, 3, 6);
    }
    // 能量护盾绘制
    if (this.shieldActive) {
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2.5;
      ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
      ctx.beginPath();
      const pulse = Math.sin(Date.now() / 100) * 2;
      ctx.arc(0, 0, this.width / 2 + 10 + pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
