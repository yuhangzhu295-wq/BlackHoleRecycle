/**
 * 3D 黑洞回收车实体 (BlackHoleMachine)
 * 实现 LV1~LV5 真实 3D 外观进化、车轮旋转与倾角动力学、黑洞视界涡轮特效、引力光环与技能形变
 */
import * as THREE from 'three';
import { MACHINE_EVOLUTION_CONFIG, SKINS_CONFIG } from '../../data/GameConfig.js';
import { eventBus } from '../../core/EventBus.js';

export class BlackHoleMachine {
  constructor(scene, skinId = 'skin_classic') {
    this.scene = scene;
    this.level = 1;
    this.config = MACHINE_EVOLUTION_CONFIG[0];
    this.skinId = skinId;

    // 运行时属性
    this.position = new THREE.Vector3(0, 0, 0);
    this.targetPosition = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.isMoving = false;
    this.currentSpeed = this.config.moveSpeed;

    // 技能与增益状态
    this.perks = {
      suctionMultiplier: 1.0,
      speedMultiplier: 1.0,
      compressMultiplier: 1.0,
      forceMultiplier: 1.0,
      magnetExtraDuration: 0,
      comboExtraTime: 0
    };
    this.isMagnetStormActive = false;
    this.magnetStormTimer = 0;
    this.isSpeedBoostActive = false;
    this.speedBoostTimer = 0;

    // 进化动画状态
    this.isEvolving = false;
    this.evolveTimer = 0;

    // Three.js 根节点
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.wheels = [];
    this.rotators = [];
    this.vortexMesh = null;
    this.suctionAuraMesh = null;
    this.magnetWaveMesh = null;

    this.buildModel();
    this.buildSuctionAura();
  }

  getSuctionRadius() {
    let r = this.config.suctionRadius * this.perks.suctionMultiplier;
    if (this.isMagnetStormActive) {
      r *= 1.8;
    }
    return r;
  }

  getMaxTier() {
    return this.config.maxTier;
  }

  buildModel() {
    // 清空现有子物体
    while (this.root.children.length > 0) {
      const obj = this.root.children[0];
      this.root.remove(obj);
    }
    this.wheels = [];
    this.rotators = [];

    const cfg = this.config;
    const skin = SKINS_CONFIG.find(s => s.id === this.skinId) || SKINS_CONFIG[0];
    const bodyColor = skin.color || cfg.baseColor;
    const rimColor = skin.rimColor || cfg.rimColor;

    const machineGroup = new THREE.Group();
    machineGroup.name = 'machineBody';

    // 1. 底盘与主车体 (Chassis)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.35,
      metalness: 0.4
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x22262c,
      roughness: 0.5,
      metalness: 0.7
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: rimColor,
      emissive: rimColor,
      emissiveIntensity: 0.4,
      roughness: 0.2
    });

    // 底盘方盒
    const bodyGeo = new THREE.BoxGeometry(1.6 * cfg.scale, 0.45 * cfg.scale, 2.0 * cfg.scale);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.35 * cfg.scale;
    bodyMesh.castShadow = true;
    machineGroup.add(bodyMesh);

    // 后置储物/压缩箱
    const rearGeo = new THREE.BoxGeometry(1.4 * cfg.scale, 0.8 * cfg.scale, 0.9 * cfg.scale);
    const rearMesh = new THREE.Mesh(rearGeo, bodyMat);
    rearMesh.position.set(0, 0.75 * cfg.scale, 0.55 * cfg.scale);
    rearMesh.castShadow = true;
    machineGroup.add(rearMesh);

    // 2. 前置核心黑洞引力舱 (Black Hole Well)
    const holeWellGeo = new THREE.CylinderGeometry(0.75 * cfg.scale, 0.65 * cfg.scale, 0.6 * cfg.scale, 32, 1, true);
    const wellMat = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.9 });
    const wellMesh = new THREE.Mesh(holeWellGeo, wellMat);
    wellMesh.position.set(0, 0.4 * cfg.scale, -0.45 * cfg.scale);
    machineGroup.add(wellMesh);

    // 黑洞发光外环 (Rim Ring)
    const rimGeo = new THREE.TorusGeometry(0.78 * cfg.scale, 0.08 * cfg.scale, 16, 32);
    const rimMesh = new THREE.Mesh(rimGeo, accentMat);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.set(0, 0.68 * cfg.scale, -0.45 * cfg.scale);
    machineGroup.add(rimMesh);

    // 内部纯黑深渊视界 (Event Horizon Disk)
    const horizonGeo = new THREE.CircleGeometry(0.72 * cfg.scale, 32);
    const horizonMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const horizonMesh = new THREE.Mesh(horizonGeo, horizonMat);
    horizonMesh.rotation.x = -Math.PI / 2;
    horizonMesh.position.set(0, 0.25 * cfg.scale, -0.45 * cfg.scale);
    machineGroup.add(horizonMesh);

    // 旋转吸入涡流光环 (Spinning Vortex)
    const vortexGeo = new THREE.RingGeometry(0.2 * cfg.scale, 0.7 * cfg.scale, 32);
    const vortexMat = new THREE.MeshBasicMaterial({
      color: rimColor,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    this.vortexMesh = new THREE.Mesh(vortexGeo, vortexMat);
    this.vortexMesh.rotation.x = -Math.PI / 2;
    this.vortexMesh.position.set(0, 0.3 * cfg.scale, -0.45 * cfg.scale);
    machineGroup.add(this.vortexMesh);

    // 3. 随等级演化的特殊结构模块 (LV2~LV5)
    if (this.level >= 2) {
      // 双侧引力涡轮
      const turbGeo = new THREE.CylinderGeometry(0.25 * cfg.scale, 0.25 * cfg.scale, 0.8 * cfg.scale, 16);
      turbGeo.rotateZ(Math.PI / 2);
      const leftTurb = new THREE.Mesh(turbGeo, accentMat);
      leftTurb.position.set(-0.95 * cfg.scale, 0.5 * cfg.scale, -0.2 * cfg.scale);
      const rightTurb = new THREE.Mesh(turbGeo, accentMat);
      rightTurb.position.set(0.95 * cfg.scale, 0.5 * cfg.scale, -0.2 * cfg.scale);
      machineGroup.add(leftTurb, rightTurb);
      this.rotators.push(leftTurb, rightTurb);
    }

    if (this.level >= 3) {
      // 后置液压压缩巨型冲压机
      const pistonGeo = new THREE.BoxGeometry(0.8 * cfg.scale, 0.4 * cfg.scale, 0.4 * cfg.scale);
      const piston = new THREE.Mesh(pistonGeo, darkMetalMat);
      piston.position.set(0, 1.25 * cfg.scale, 0.6 * cfg.scale);
      machineGroup.add(piston);
    }

    if (this.level >= 4) {
      // 环绕双悬浮引力稳定翼
      const wingGeo = new THREE.BoxGeometry(0.15 * cfg.scale, 0.9 * cfg.scale, 1.4 * cfg.scale);
      const leftWing = new THREE.Mesh(wingGeo, accentMat);
      leftWing.position.set(-1.1 * cfg.scale, 0.8 * cfg.scale, 0.2 * cfg.scale);
      const rightWing = new THREE.Mesh(wingGeo, accentMat);
      rightWing.position.set(1.1 * cfg.scale, 0.8 * cfg.scale, 0.2 * cfg.scale);
      machineGroup.add(leftWing, rightWing);
    }

    if (this.level >= 5) {
      // 奇点天体光环 (Floating Singularity Halo)
      const haloGeo = new THREE.TorusGeometry(1.3 * cfg.scale, 0.05 * cfg.scale, 16, 48);
      const haloMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 1.0
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      haloMesh.rotation.x = Math.PI / 4;
      haloMesh.position.set(0, 1.0 * cfg.scale, -0.45 * cfg.scale);
      machineGroup.add(haloMesh);
      this.rotators.push(haloMesh);
    }

    // 4. 四个橡胶工业车轮
    const wheelGeo = new THREE.CylinderGeometry(0.26 * cfg.scale, 0.26 * cfg.scale, 0.22 * cfg.scale, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x181a1e, roughness: 0.8 });

    const wheelPositions = [
      [-0.85 * cfg.scale, 0.26 * cfg.scale, -0.65 * cfg.scale],
      [0.85 * cfg.scale, 0.26 * cfg.scale, -0.65 * cfg.scale],
      [-0.85 * cfg.scale, 0.26 * cfg.scale, 0.65 * cfg.scale],
      [0.85 * cfg.scale, 0.26 * cfg.scale, 0.65 * cfg.scale]
    ];

    wheelPositions.forEach(pos => {
      const wMesh = new THREE.Mesh(wheelGeo, wheelMat);
      wMesh.position.set(...pos);
      wMesh.castShadow = true;
      machineGroup.add(wMesh);
      this.wheels.push(wMesh);
    });

    this.root.add(machineGroup);
    this.bodyMesh = machineGroup;
  }

  buildSuctionAura() {
    // 地面吸附引力范围光环 (Ground Suction Aura)
    const auraGeo = new THREE.RingGeometry(0.4, 2.5, 32);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide
    });
    this.suctionAuraMesh = new THREE.Mesh(auraGeo, auraMat);
    this.suctionAuraMesh.rotation.x = -Math.PI / 2;
    this.suctionAuraMesh.position.y = 0.03;
    this.root.add(this.suctionAuraMesh);

    // 磁暴全屏引力冲击光圈
    const waveGeo = new THREE.RingGeometry(0.5, 5.5, 32);
    const waveMat = new THREE.MeshBasicMaterial({
      color: 0x7c4dff,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide
    });
    this.magnetWaveMesh = new THREE.Mesh(waveGeo, waveMat);
    this.magnetWaveMesh.rotation.x = -Math.PI / 2;
    this.magnetWaveMesh.position.y = 0.06;
    this.root.add(this.magnetWaveMesh);
  }

  setTargetPosition(x, z) {
    this.targetPosition.set(x, 0, z);
  }

  evolveTo(newLevel) {
    if (newLevel <= this.level || newLevel > 5) return;
    this.level = newLevel;
    this.config = MACHINE_EVOLUTION_CONFIG[newLevel - 1];
    this.isEvolving = true;
    this.evolveTimer = 0.9; // 0.9秒进化缩放弹跳动画

    this.buildModel();
    eventBus.emit('MACHINE_EVOLVED', { level: this.level, config: this.config });
  }

  setSkin(skinId) {
    this.skinId = skinId;
    this.buildModel();
  }

  triggerMagnetStorm(duration = 6.0) {
    this.isMagnetStormActive = true;
    this.magnetStormTimer = duration + (this.perks.magnetExtraDuration || 0);
    eventBus.emit('SKILL_MAGNET_STORM_START', { duration: this.magnetStormTimer });
  }

  triggerSpeedBoost(duration = 5.0) {
    this.isSpeedBoostActive = true;
    this.speedBoostTimer = duration;
  }

  update(dt) {
    // 1. 移动动力学模拟 (Smooth Damp & Rotation)
    const toTarget = new THREE.Vector3().subVectors(this.targetPosition, this.position);
    toTarget.y = 0;
    const dist = toTarget.length();

    let maxSpeed = this.config.moveSpeed * this.perks.speedMultiplier;
    if (this.isSpeedBoostActive) maxSpeed *= 1.6;
    if (this.isMagnetStormActive) maxSpeed *= 1.2;

    if (dist > 0.05) {
      this.isMoving = true;
      const moveStep = Math.min(dist, maxSpeed * dt * 7.0);
      toTarget.normalize();
      this.position.addScaledVector(toTarget, moveStep);

      // 车体朝向与车轮转动
      const targetYaw = Math.atan2(-toTarget.x, -toTarget.z);
      this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, targetYaw, dt * 10);

      // 车体运动倾角 (Tilt)
      this.bodyMesh.rotation.z = THREE.MathUtils.lerp(this.bodyMesh.rotation.z, -toTarget.x * 0.1, dt * 8);
      this.bodyMesh.rotation.x = THREE.MathUtils.lerp(this.bodyMesh.rotation.x, toTarget.z * 0.1, dt * 8);

      // 滚动车轮
      this.wheels.forEach(w => {
        w.rotation.x += moveStep * 4;
      });
    } else {
      this.isMoving = false;
      this.bodyMesh.rotation.z = THREE.MathUtils.lerp(this.bodyMesh.rotation.z, 0, dt * 8);
      this.bodyMesh.rotation.x = THREE.MathUtils.lerp(this.bodyMesh.rotation.x, 0, dt * 8);
    }

    this.root.position.copy(this.position);

    // 2. 涡流与光环旋转动画
    if (this.vortexMesh) {
      this.vortexMesh.rotation.z += (this.isMagnetStormActive ? 12 : 5) * dt;
    }
    this.rotators.forEach((r, idx) => {
      r.rotation.y += (idx % 2 === 0 ? 4 : -4) * dt;
    });

    // 3. 动态更新吸附范围指示圈
    const currentRadius = this.getSuctionRadius();
    if (this.suctionAuraMesh) {
      const auraScale = currentRadius / 2.5;
      this.suctionAuraMesh.scale.set(auraScale, auraScale, auraScale);
      this.suctionAuraMesh.material.opacity = 0.22 + Math.sin(Date.now() * 0.005) * 0.08;
    }

    // 4. 磁暴技能逻辑
    if (this.isMagnetStormActive) {
      this.magnetStormTimer -= dt;
      if (this.magnetWaveMesh) {
        this.magnetWaveMesh.material.opacity = 0.45 + Math.sin(Date.now() * 0.02) * 0.25;
        this.magnetWaveMesh.rotation.z += 8 * dt;
      }
      if (this.magnetStormTimer <= 0) {
        this.isMagnetStormActive = false;
        if (this.magnetWaveMesh) this.magnetWaveMesh.material.opacity = 0.0;
        eventBus.emit('SKILL_MAGNET_STORM_END');
      }
    }

    // 5. 加速技能计时
    if (this.isSpeedBoostActive) {
      this.speedBoostTimer -= dt;
      if (this.speedBoostTimer <= 0) {
        this.isSpeedBoostActive = false;
      }
    }

    // 6. 进化缩放弹跳特效
    if (this.isEvolving) {
      this.evolveTimer -= dt;
      const pulse = 1.0 + Math.sin((0.9 - this.evolveTimer) * Math.PI * 4) * 0.3;
      this.bodyMesh.scale.set(pulse, pulse, pulse);
      if (this.evolveTimer <= 0) {
        this.isEvolving = false;
        this.bodyMesh.scale.set(1, 1, 1);
      }
    }
  }
}
