/**
 * 高性能粒子系统 (Particle System & Visual Effects)
 * 支持发光火花、爆炸碎片、能量光晕、浮动文字与波纹扩散
 */
export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.floatingTexts = [];
    this.shockwaves = [];
  }
  spawnExplosion(x, y, color = '#ff7700', count = 25, speed = 4) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = (Math.random() * 0.8 + 0.2) * speed;
      const size = Math.random() * 4 + 2;
      const life = Math.random() * 0.4 + 0.3;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        size,
        color,
        alpha: 1,
        life,
        maxLife: life,
        drag: 0.94,
        shape: Math.random() > 0.5 ? 'circle' : 'spark'
      });
    }
  }
  spawnSparks(x, y, color = '#00f0ff', count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 2.5 + 1.5,
        color,
        alpha: 1,
        life: 0.25,
        maxLife: 0.25,
        drag: 0.9,
        shape: 'spark'
      });
    }
  }
  spawnShockwave(x, y, maxRadius = 60, color = '#ff0055', duration = 0.35) {
    this.shockwaves.push({
      x, y,
      radius: 5,
      maxRadius,
      color,
      life: duration,
      maxLife: duration
    });
  }
  spawnFloatingText(text, x, y, color = '#ffd700', size = 18) {
    this.floatingTexts.push({
      text,
      x,
      y,
      vy: -1.2,
      color,
      size,
      alpha: 1,
      life: 0.8,
      maxLife: 0.8
    });
  }
  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.alpha = Math.max(0, p.life / p.maxLife);
    }
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= dt;
      if (sw.life <= 0) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      const progress = 1 - sw.life / sw.maxLife;
      sw.radius = 5 + (sw.maxRadius - 5) * Math.sin(progress * Math.PI * 0.5);
      sw.alpha = 1 - progress;
    }
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const t = this.floatingTexts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      t.y += t.vy;
      t.alpha = Math.min(1, (t.life / t.maxLife) * 1.5);
    }
  }
  draw(ctx) {
    ctx.save();
    for (const sw of this.shockwaves) {
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = Math.max(1, 4 * sw.alpha);
      ctx.globalAlpha = Math.max(0, sw.alpha);
      ctx.stroke();
    }
    for (const p of this.particles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      if (p.shape === 'spark') {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const t of this.floatingTexts) {
      ctx.globalAlpha = t.alpha;
      ctx.fillStyle = t.color;
      ctx.font = `bold ${t.size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }
}
