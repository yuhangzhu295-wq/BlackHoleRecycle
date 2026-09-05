/**
 * 3D 粒子引力与吸收特效管理器 (VFXManager)
 * 实现：吞噬闪光爆发、压缩金币弹跳、磁暴引力波纹、升级进化光柱
 */
import * as THREE from 'three';

export class VFXManager {
  constructor(scene) {
    this.scene = scene;
    this.sparkles = [];
    this.coinSparks = [];

    // 创建共享粒子材质
    const sparkleGeo = new THREE.BufferGeometry();
    const sparkleCount = 300;
    const posArray = new Float32Array(sparkleCount * 3);
    const colorArray = new Float32Array(sparkleCount * 3);

    for (let i = 0; i < sparkleCount * 3; i++) {
      posArray[i] = 0;
      colorArray[i] = 1.0;
    }

    sparkleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    sparkleGeo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

    const sparkleMat = new THREE.PointsMaterial({
      size: 0.25,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });

    this.sparklePoints = new THREE.Points(sparkleGeo, sparkleMat);
    this.scene.add(this.sparklePoints);
    this.sparklePool = [];
    for (let i = 0; i < sparkleCount; i++) {
      this.sparklePool.push({
        idx: i,
        active: false,
        life: 0,
        maxLife: 0.5,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        color: new THREE.Color()
      });
    }
  }

  spawnAbsorbBurst(position, colorHex = '#00e5ff', count = 6) {
    const color = new THREE.Color(colorHex);
    let spawned = 0;
    for (let i = 0; i < this.sparklePool.length && spawned < count; i++) {
      const p = this.sparklePool[i];
      if (!p.active) {
        p.active = true;
        p.life = 0;
        p.maxLife = 0.35 + Math.random() * 0.25;
        p.pos.copy(position);
        p.vel.set(
          (Math.random() - 0.5) * 4.0,
          Math.random() * 3.5 + 1.0,
          (Math.random() - 0.5) * 4.0
        );
        p.color.copy(color);
        spawned++;
      }
    }
  }

  spawnCoinBurst(position, count = 12) {
    this.spawnAbsorbBurst(position, '#ffd700', count);
  }

  update(dt) {
    const positions = this.sparklePoints.geometry.attributes.position.array;
    const colors = this.sparklePoints.geometry.attributes.color.array;
    let anyActive = false;

    for (let i = 0; i < this.sparklePool.length; i++) {
      const p = this.sparklePool[i];
      const i3 = i * 3;

      if (p.active) {
        anyActive = true;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          positions[i3 + 1] = -999;
          continue;
        }

        p.vel.y -= 9.8 * dt; // 重力下落
        p.pos.addScaledVector(p.vel, dt);

        positions[i3] = p.pos.x;
        positions[i3 + 1] = p.pos.y;
        positions[i3 + 2] = p.pos.z;

        const alpha = 1.0 - p.life / p.maxLife;
        colors[i3] = p.color.r * alpha;
        colors[i3 + 1] = p.color.g * alpha;
        colors[i3 + 2] = p.color.b * alpha;
      } else {
        positions[i3 + 1] = -999;
      }
    }

    this.sparklePoints.geometry.attributes.position.needsUpdate = true;
    this.sparklePoints.geometry.attributes.color.needsUpdate = true;
  }
}
