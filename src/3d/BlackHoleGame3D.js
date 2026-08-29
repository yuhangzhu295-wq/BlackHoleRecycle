/**
 * 《黑洞回收站》3D WebGL 游戏核心控制器 (BlackHoleGame3D)
 * 整合 Three.js 渲染管线、等轴平滑摄像机、光照阴影、黑洞机器、无尽 Chunk 流式加载、
 * 粒子引力特效、音频合成与全套 UI 视图
 */
import * as THREE from 'three';
import { BlackHoleMachine } from './machine/BlackHoleMachine.js';
import { WorldChunkManager } from './chunks/WorldChunkManager.js';
import { VFXManager } from './vfx/VFXManager.js';
import { UIManager } from '../ui/UIManager.js';
import { saveManager } from '../data/SaveManager.js';
import { audio } from '../engine/audio.js';
import { analytics } from '../analytics/AnalyticsService.js';
import { platform } from '../adapter/platform.js';
import { eventBus } from '../core/EventBus.js';

export class BlackHoleGame3D {
  constructor(canvasContainer, canvasElement) {
    this.container = canvasContainer;
    this.canvas = canvasElement;

    this.state = 'START'; // 'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'
    this.mode = 'ENDLESS'; // 'ENDLESS' | 'CHALLENGE'

    // 游戏内核心指标数值
    this.score = 0;
    this.coinsEarned = 0;
    this.currentMass = 0;
    this.absorbedCount = 0;
    this.compressCount = 0;
    this.cleanProgress = 0;
    this.timeElapsed = 0;
    this.timeLimit = 60.0; // 挑战模式限时

    // 连击与压缩缓存
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.compressionBuffer = 0;

    // Roguelike 进化里程碑
    this.nextUpgradeThreshold = 1800;
    this.nextEvolutionLevel = 2;

    // 技能冷却与可用次数
    this.skillCharges = {
      MAGNET: 2,
      SPEED: 1,
      COMPRESS: 3
    };

    // 触摸/拖拽与射线拾取
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.isDragging = false;
    this.pointerPos = new THREE.Vector2();

    this.initThreeJS();
    this.ui = new UIManager(this.container, this);
    this.bindInputEvents();
  }

  initThreeJS() {
    const width = this.container.clientWidth || window.innerWidth || 375;
    const height = this.container.clientHeight || window.innerHeight || 667;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);
    this.scene.fog = new THREE.FogExp2(0x0f172a, 0.015);

    // 2. Camera (等轴俯视角度)
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 120);
    this.camera.position.set(0, 16, 11);
    this.camera.lookAt(0, 0, -2);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // 4. Lights
    this.ambientLight = new THREE.AmbientLight(0xfff5ea, 0.85);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.dirLight.position.set(10, 25, 15);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 60;
    this.dirLight.shadow.camera.left = -20;
    this.dirLight.shadow.camera.right = 20;
    this.dirLight.shadow.camera.top = 20;
    this.dirLight.shadow.camera.bottom = -20;
    this.scene.add(this.dirLight);

    // 5. 核心子系统实例
    this.machine = new BlackHoleMachine(this.scene, saveManager.data.currentSkinId);
    this.chunkManager = new WorldChunkManager(this.scene);
    this.vfx = new VFXManager(this.scene);

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  bindInputEvents() {
    const updateTargetFromScreen = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((clientY - rect.top) / rect.height) * 2 + 1;
      this.pointerPos.set(x, y);

      this.raycaster.setFromCamera(this.pointerPos, this.camera);
      const hitPoint = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.groundPlane, hitPoint)) {
        // 限制移动边界
        hitPoint.x = Math.max(-10, Math.min(10, hitPoint.x));
        this.machine.setTargetPosition(hitPoint.x, hitPoint.z);
      }
    };

    // 触摸事件
    this.canvas.addEventListener('touchstart', (e) => {
      if (this.state !== 'PLAYING') return;
      this.isDragging = true;
      const t = e.touches[0];
      if (t) updateTargetFromScreen(t.clientX, t.clientY);
    }, { passive: true });

    this.canvas.addEventListener('touchmove', (e) => {
      if (!this.isDragging || this.state !== 'PLAYING') return;
      const t = e.touches[0];
      if (t) updateTargetFromScreen(t.clientX, t.clientY);
    }, { passive: true });

    window.addEventListener('touchend', () => {
      this.isDragging = false;
    });

    // 鼠标事件
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.state !== 'PLAYING') return;
      this.isDragging = true;
      updateTargetFromScreen(e.clientX, e.clientY);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.isDragging || this.state !== 'PLAYING') return;
      updateTargetFromScreen(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // PC 键盘 WASD / 方向键
    window.addEventListener('keydown', (e) => {
      if (this.state !== 'PLAYING') return;
      const curPos = this.machine.position;
      const step = 1.2;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') this.machine.setTargetPosition(curPos.x, curPos.z - step);
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.machine.setTargetPosition(curPos.x, curPos.z + step);
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.machine.setTargetPosition(curPos.x - step, curPos.z);
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.machine.setTargetPosition(curPos.x + step, curPos.z);
      if (e.code === 'Digit1') this.triggerSkill('MAGNET');
      if (e.code === 'Digit2') this.triggerSkill('SPEED');
      if (e.code === 'Digit3') this.triggerSkill('COMPRESS');
    });
  }

  start(mode = 'ENDLESS') {
    this.state = 'PLAYING';
    this.mode = mode;
    this.score = 0;
    this.coinsEarned = 0;
    this.currentMass = 0;
    this.absorbedCount = 0;
    this.compressCount = 0;
    this.cleanProgress = 0;
    this.timeElapsed = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.compressionBuffer = 0;
    this.nextUpgradeThreshold = 1800;
    this.nextEvolutionLevel = 2;

    this.skillCharges = { MAGNET: 2, SPEED: 1, COMPRESS: 3 };

    // 初始化黑洞位置与地图
    this.machine.position.set(0, 0, 0);
    this.machine.targetPosition.set(0, 0, 0);
    this.machine.evolveTo(1);
    this.machine.setSkin(saveManager.data.currentSkinId);
    this.chunkManager.initWorld();
  }

  pause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
    }
  }

  resume() {
    if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
    }
  }

  triggerSkill(type) {
    if (this.state !== 'PLAYING') return;

    if (type === 'MAGNET' && this.skillCharges.MAGNET > 0) {
      this.skillCharges.MAGNET--;
      this.machine.triggerMagnetStorm(6.0);
      audio.playMagnetStorm();
      platform.vibrate('heavy');
      saveManager.recordTaskProgress('magnetUses', 1);
      analytics.track('magnet_storm', { remaining: this.skillCharges.MAGNET });
    } else if (type === 'SPEED' && this.skillCharges.SPEED > 0) {
      this.skillCharges.SPEED--;
      this.machine.triggerSpeedBoost(5.0);
      audio.playSuction(1.8);
      platform.vibrate('light');
    } else if (type === 'COMPRESS' && this.skillCharges.COMPRESS > 0) {
      this.skillCharges.COMPRESS--;
      const yieldCoins = Math.max(100, Math.round(this.compressionBuffer * 0.5));
      this.compressCount++;
      eventBus.emit('TRIGGER_COMPRESSION_EVENT', { mass: this.compressionBuffer, coins: yieldCoins });
      this.pause();
      this.compressionBuffer = 0;
    }
  }

  gameOver() {
    this.state = 'GAMEOVER';
    this.ui.showSettlementModal({
      score: this.score,
      coins: this.coinsEarned,
      absorbedCount: this.absorbedCount,
      compressCount: this.compressCount,
      maxCombo: this.maxCombo
    });
  }

  update(dt) {
    if (this.state !== 'PLAYING') return;

    this.timeElapsed += dt;

    // 挑战模式倒计时
    if (this.mode === 'CHALLENGE') {
      if (this.timeElapsed >= this.timeLimit) {
        this.gameOver();
        return;
      }
    }

    // 连击倒计时衰减
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
      }
    }

    // 1. 更新黑洞机器
    this.machine.update(dt);

    // 2. 摄像机与平行光平滑跟随
    const machPos = this.machine.position;
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, machPos.x * 0.4, dt * 6);
    this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, machPos.z + 10, dt * 6);
    this.camera.position.y = 16;
    this.camera.lookAt(this.camera.position.x, 0, machPos.z - 2);

    this.dirLight.position.set(machPos.x + 10, 25, machPos.z + 15);
    this.dirLight.target.position.set(machPos.x, 0, machPos.z);
    this.dirLight.target.updateMatrixWorld();

    // 3. 更新无尽 Chunk 与物理引力吸附
    const absorbedList = this.chunkManager.update(
      dt,
      machPos,
      this.machine.getSuctionRadius(),
      this.machine.getMaxTier(),
      this.machine.isMagnetStormActive
    );

    // 4. 处理本帧吞噬物品
    if (absorbedList.length > 0) {
      absorbedList.forEach(item => {
        this.absorbedCount++;
        this.currentMass += item.mass;
        this.compressionBuffer += item.mass;

        // 连击累加
        this.combo++;
        this.comboTimer = 2.5 + (this.machine.perks.comboExtraTime || 0);
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;

        const comboBonus = Math.min(this.combo, 20);
        const itemScore = item.value * 10 * comboBonus;
        this.score += itemScore;
        this.coinsEarned += Math.round(item.value * 0.4 * (this.machine.perks.compressMultiplier || 1.0));

        audio.playAbsorb(item.tier);
        audio.playCombo(this.combo);
        platform.vibrate('light');

        // 产生吞噬粒子火花
        this.vfx.spawnAbsorbBurst(machPos, item.color, 5);

        saveManager.recordTaskProgress('absorbedCount', 1);
        saveManager.recordTaskProgress('maxSingleMass', this.currentMass);
        analytics.track('object_absorb', { type: item.type, tier: item.tier, mass: item.mass });
      });

      // 机器自动进化检查 (LV1 -> LV5)
      const nextCfg = MACHINE_EVOLUTION_CONFIG[this.nextEvolutionLevel - 1];
      if (nextCfg && this.currentMass >= nextCfg.massThreshold) {
        this.machine.evolveTo(this.nextEvolutionLevel);
        this.nextEvolutionLevel++;
        analytics.track('machine_evolve', { level: this.machine.level });
      }

      // Roguelike 三选一强化触发检查
      if (this.currentMass >= this.nextUpgradeThreshold) {
        this.nextUpgradeThreshold *= 2.8;
        this.pause();
        eventBus.emit('TRIGGER_ROGUELIKE_UPGRADE');
      }

      // 累计 600kg 自动触发装车压缩事件
      if (this.compressionBuffer >= 600) {
        this.compressCount++;
        const yieldCoins = Math.round(this.compressionBuffer * 0.45 * (this.machine.perks.compressMultiplier || 1.0));
        eventBus.emit('TRIGGER_COMPRESSION_EVENT', { mass: this.compressionBuffer, coins: yieldCoins });
        this.pause();
        this.compressionBuffer = 0;
      }
    }

    // 5. 更新粒子特效
    this.vfx.update(dt);

    // 6. 计算清理进度 (0 ~ 100%)
    this.cleanProgress = Math.min(100, (this.currentMass % 12000) / 120);

    // 7. 更新 HUD
    this.ui.updateHUD({
      cleanProgress: this.cleanProgress,
      coins: saveManager.data.coins + this.coinsEarned,
      timeElapsed: this.timeElapsed,
      combo: this.combo,
      comboScore: this.combo * 20
    });
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
