/**
 * 场景可吸附 3D 垃圾/物体对象 (TrashObject)
 * 包含：低模程序化网格、FSM 状态流转 (IDLE -> ATTRACTED -> SUCKING -> ABSORBED)、
 * 物理引力贝塞尔螺旋下潜吞噬曲线与等级锁标 (Tier Lock Indicator)
 */
import * as THREE from 'three';
import { OBJECT_TEMPLATES } from '../../data/GameConfig.js';

// 共享材质与几何体缓存，极大降低 DrawCall 与内存
const geometryCache = new Map();
const materialCache = new Map();

function getOrCreateGeometry(template) {
  const key = `${template.type}_${template.shape}`;
  if (geometryCache.has(key)) return geometryCache.get(key);

  let geo;
  const r = template.radius || 0.3;
  const h = template.height || 0.6;

  switch (template.shape) {
    case 'cylinder':
      geo = new THREE.CylinderGeometry(r * 0.9, r, h, 14);
      break;
    case 'sphere':
      geo = new THREE.SphereGeometry(r, 14, 14);
      break;
    case 'cone':
      geo = new THREE.ConeGeometry(r, h, 14);
      break;
    case 'torus':
      geo = new THREE.TorusGeometry(r * 0.8, r * 0.35, 10, 20);
      break;
    case 'box':
    default:
      const [bx, by, bz] = template.size || [r * 2, r * 2, r * 2];
      geo = new THREE.BoxGeometry(bx, by, bz);
      break;
  }
  geometryCache.set(key, geo);
  return geo;
}

function getOrCreateMaterial(colorHex) {
  if (materialCache.has(colorHex)) return materialCache.get(colorHex);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex),
    roughness: 0.45,
    metalness: 0.2
  });
  materialCache.set(colorHex, mat);
  return mat;
}

// 跨平台共享锁标材质
let sharedLockSpriteMat = null;

function getSharedLockSpriteMaterial() {
  if (sharedLockSpriteMat) return sharedLockSpriteMat;

  let canvas = null;
  if (typeof wx !== 'undefined' && wx.createCanvas) {
    canvas = wx.createCanvas();
  } else if (typeof tt !== 'undefined' && tt.createCanvas) {
    canvas = tt.createCanvas();
  } else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
  }

  if (canvas) {
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    if (ctx.roundRect) {
      ctx.roundRect(4, 4, 120, 56, 12);
      ctx.fill();
    } else {
      ctx.fillRect(4, 4, 120, 56);
    }
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🔒 需升级', 64, 38);

    const texture = new THREE.CanvasTexture(canvas);
    sharedLockSpriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.0 });
  } else {
    sharedLockSpriteMat = new THREE.SpriteMaterial({ color: 0xff3b30, transparent: true, opacity: 0.0 });
  }

  return sharedLockSpriteMat;
}

export class TrashObject {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.template = null;
    this.state = 'IDLE'; // 'IDLE' | 'ATTRACTED' | 'SUCKING' | 'ABSORBED'

    this.position = new THREE.Vector3();
    this.spawnPosition = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.rotationSpeed = new THREE.Vector3();

    // 吞噬过渡动画变量
    this.suckTimer = 0;
    this.suckDuration = 0.45;
    this.initialScale = new THREE.Vector3(1, 1, 1);

    // 等级锁定提示气泡
    this.lockBadge = null;
    this.lockVisibleTimer = 0;

    this.initMesh();
  }

  initMesh() {
    const defaultTemplate = OBJECT_TEMPLATES[0];
    const geo = getOrCreateGeometry(defaultTemplate);
    const mat = getOrCreateMaterial(defaultTemplate.color);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    this.scene.add(this.mesh);

    // 创建等级锁定提示小标 (Lock Sprite)
    const spriteMat = getSharedLockSpriteMaterial().clone();
    this.lockBadge = new THREE.Sprite(spriteMat);
    this.lockBadge.scale.set(1.4, 0.7, 1);
    this.lockBadge.visible = false;
    this.scene.add(this.lockBadge);
  }

  spawn(template, x, z, yOffset = 0) {
    this.template = template;
    this.state = 'IDLE';
    this.suckTimer = 0;

    // 更新几何体与材质
    this.mesh.geometry = getOrCreateGeometry(template);
    this.mesh.material = getOrCreateMaterial(template.color);

    const halfH = (template.height || (template.size ? template.size[1] : template.radius * 2)) * 0.5;
    this.position.set(x, halfH + yOffset, z);
    this.spawnPosition.copy(this.position);
    this.mesh.position.copy(this.position);

    // 随机初始旋转与微微扰动
    this.mesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
    this.rotationSpeed.set(
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 4
    );
    this.mesh.scale.set(1, 1, 1);
    this.initialScale.set(1, 1, 1);
    this.mesh.visible = true;
    this.velocity.set(0, 0, 0);

    if (this.lockBadge) {
      this.lockBadge.visible = false;
      this.lockBadge.material.opacity = 0;
    }
  }

  showLockAlert() {
    if (this.lockVisibleTimer > 0) return;
    this.lockVisibleTimer = 1.0;
    if (this.lockBadge) {
      this.lockBadge.visible = true;
      this.lockBadge.material.opacity = 1.0;
      this.lockBadge.position.set(this.position.x, this.position.y + 1.2, this.position.z);
    }
  }

  update(dt, machinePos, machineRadius, machineMaxTier, isMagnetStorm = false) {
    if (this.state === 'ABSORBED') return false;

    // 1. 等级提示淡出处理
    if (this.lockVisibleTimer > 0) {
      this.lockVisibleTimer -= dt;
      if (this.lockBadge) {
        this.lockBadge.position.set(this.position.x, this.position.y + 1.2, this.position.z);
        this.lockBadge.material.opacity = Math.max(0, this.lockVisibleTimer);
        if (this.lockVisibleTimer <= 0) {
          this.lockBadge.visible = false;
        }
      }
    }

    // 2. 引力吸附距离判定
    const dx = machinePos.x - this.position.x;
    const dz = machinePos.z - this.position.z;
    const distSq = dx * dx + dz * dz;
    const r = machineRadius;

    if (this.state === 'IDLE') {
      if (distSq < r * r) {
        // 校验等级 Tier
        if (this.template.tier > machineMaxTier && !isMagnetStorm) {
          this.showLockAlert();
        } else {
          this.state = 'ATTRACTED';
        }
      }
    }

    // 3. 飞向黑洞动力学
    if (this.state === 'ATTRACTED') {
      const dist = Math.sqrt(distSq);
      if (dist < 0.6) {
        // 进入黑洞深渊核心吞噬态
        this.state = 'SUCKING';
        this.suckTimer = 0;
      } else {
        // 沿引力矢量加速飞向中心，带切向微旋
        const pullSpeed = isMagnetStorm ? 18.0 : (10.0 + (1.0 - dist / r) * 12.0);
        const dirX = dx / dist;
        const dirZ = dz / dist;

        // 加入切向螺旋力
        const tangentX = -dirZ * 0.4;
        const tangentZ = dirX * 0.4;

        this.position.x += (dirX + tangentX) * pullSpeed * dt;
        this.position.z += (dirZ + tangentZ) * pullSpeed * dt;
        this.position.y = THREE.MathUtils.lerp(this.position.y, 0.4, dt * 6.0);

        this.mesh.position.copy(this.position);
        this.mesh.rotation.x += this.rotationSpeed.x * dt * 3;
        this.mesh.rotation.y += this.rotationSpeed.y * dt * 3;
        this.mesh.rotation.z += this.rotationSpeed.z * dt * 3;
      }
    }

    // 4. 旋转压缩沉入黑洞深处
    if (this.state === 'SUCKING') {
      this.suckTimer += dt;
      const progress = Math.min(1.0, this.suckTimer / this.suckDuration);

      // 向黑洞中心极速收敛并下沉
      this.position.x = THREE.MathUtils.lerp(this.position.x, machinePos.x, progress * 0.3);
      this.position.z = THREE.MathUtils.lerp(this.position.z, machinePos.z, progress * 0.3);
      this.position.y = THREE.MathUtils.lerp(0.4, -0.8, progress);

      // 体积逐渐缩减至 0
      const scaleFactor = Math.max(0.01, 1.0 - progress);
      this.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
      this.mesh.position.copy(this.position);
      this.mesh.rotation.y += 18.0 * dt;

      if (progress >= 1.0) {
        this.state = 'ABSORBED';
        this.mesh.visible = false;
        if (this.lockBadge) this.lockBadge.visible = false;
        return true; // 返回 true 表示已完成吞噬吸收
      }
    }

    return false;
  }

  recycle() {
    this.state = 'ABSORBED';
    this.mesh.visible = false;
    if (this.lockBadge) {
      this.lockBadge.visible = false;
      this.lockBadge.material.opacity = 0;
    }
  }
}
