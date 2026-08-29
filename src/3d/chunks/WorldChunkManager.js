/**
 * 无尽地图分块管理与流式加载系统 (WorldChunkManager)
 * 实现无缝滚动 Chunk、环境地表贴图/光照自然流转、对象池管理与垃圾物体批量生成与回收
 */
import * as THREE from 'three';
import { REGION_THEMES, OBJECT_TEMPLATES } from '../../data/GameConfig.js';
import { TrashObject } from '../objects/TrashObject.js';
import { ObjectPool } from '../../core/ObjectPool.js';
import { eventBus } from '../../core/EventBus.js';

export class WorldChunkManager {
  constructor(scene) {
    this.scene = scene;
    this.chunkLength = 40.0;
    this.chunkWidth = 24.0;
    this.activeChunks = [];
    this.chunkIndexCounter = 0;
    this.currentThemeIndex = 0;

    // 物体对象池 (ObjectPool)
    this.objectPool = new ObjectPool(
      () => new TrashObject(this.scene),
      (obj) => obj.recycle(),
      40,
      200
    );

    // 当前场景中活跃的物体列表
    this.activeObjects = [];

    // 地面与环境材质缓存
    this.groundMaterials = new Map();
  }

  initWorld() {
    this.clearAll();
    this.chunkIndexCounter = 0;
    this.currentThemeIndex = 0;

    // 初始连续生成 3 个 Chunk (Previous, Current, Next)
    this.spawnChunk(0);
    this.spawnChunk(1);
    this.spawnChunk(2);
  }

  getThemeForChunk(chunkIdx) {
    const themeIdx = Math.min(REGION_THEMES.length - 1, Math.floor(chunkIdx / 2));
    return REGION_THEMES[themeIdx];
  }

  spawnChunk(index) {
    const theme = this.getThemeForChunk(index);
    const zStart = -index * this.chunkLength;
    const zCenter = zStart - this.chunkLength * 0.5;

    const chunkGroup = new THREE.Group();
    chunkGroup.position.set(0, 0, zCenter);

    // 1. 地板网格
    const groundGeo = new THREE.PlaneGeometry(this.chunkWidth, this.chunkLength);
    let groundMat = this.groundMaterials.get(theme.id);
    if (!groundMat) {
      groundMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(theme.groundColor),
        roughness: 0.8,
        metalness: 0.1
      });
      this.groundMaterials.set(theme.id, groundMat);
    }
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    chunkGroup.add(groundMesh);

    // 2. 左右边界护栏/墙壁
    const wallGeo = new THREE.BoxGeometry(0.8, 2.0, this.chunkLength);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2c3437, roughness: 0.9 });
    const leftWall = new THREE.Mesh(wallGeo, wallMat);
    leftWall.position.set(-this.chunkWidth * 0.5 - 0.4, 1.0, 0);
    const rightWall = new THREE.Mesh(wallGeo, wallMat);
    rightWall.position.set(this.chunkWidth * 0.5 + 0.4, 1.0, 0);
    chunkGroup.add(leftWall, rightWall);

    // 3. 装饰性主题地标/货架/路灯
    this.buildChunkProps(chunkGroup, theme);

    this.scene.add(chunkGroup);

    // 4. 在该 Chunk 区域批量分布可吸附物体
    const chunkObjects = [];
    const objectDensity = 25 + Math.floor(Math.random() * 10);

    for (let i = 0; i < objectDensity; i++) {
      // 根据主题可用 Tier 筛选物品
      const availableTiers = theme.availableTiers || [1, 2];
      const candidates = OBJECT_TEMPLATES.filter(t => availableTiers.includes(t.tier));
      const template = candidates[Math.floor(Math.random() * candidates.length)];

      const localX = (Math.random() - 0.5) * (this.chunkWidth - 4.0);
      const localZ = (Math.random() - 0.5) * (this.chunkLength - 4.0);
      const worldZ = zCenter + localZ;

      const trash = this.objectPool.get();
      trash.spawn(template, localX, worldZ);
      this.activeObjects.push(trash);
      chunkObjects.push(trash);
    }

    this.activeChunks.push({
      index,
      theme,
      group: chunkGroup,
      zCenter,
      objects: chunkObjects
    });

    this.chunkIndexCounter++;
  }

  buildChunkProps(chunkGroup, theme) {
    // 根据主题添加少量低模环境装饰道具 (静态不移动)
    const propMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
    for (let i = 0; i < 4; i++) {
      const propGeo = new THREE.BoxGeometry(1.2, 2.5, 3.5);
      const shelf = new THREE.Mesh(propGeo, propMat);
      const side = i % 2 === 0 ? -1 : 1;
      shelf.position.set(side * (this.chunkWidth * 0.5 - 1.5), 1.25, (i - 1.5) * 8);
      shelf.castShadow = true;
      chunkGroup.add(shelf);
    }
  }

  update(dt, machinePosition, machineRadius, machineMaxTier, isMagnetStorm = false) {
    let absorbedInThisFrame = [];

    // 1. 更新所有活跃物体的物理引力与吸附状态
    for (let i = this.activeObjects.length - 1; i >= 0; i--) {
      const obj = this.activeObjects[i];
      const isAbsorbed = obj.update(dt, machinePosition, machineRadius, machineMaxTier, isMagnetStorm);
      if (isAbsorbed) {
        absorbedInThisFrame.push(obj.template);
        this.objectPool.release(obj);
        this.activeObjects.splice(i, 1);
      }
    }

    // 2. Chunk Streaming 动态流式滚动检测
    // 如果机器往前移动超过当前 Chunk，动态加载前方新 Chunk 并释放后方远离的旧 Chunk
    const machineZ = machinePosition.z;
    const furthestChunk = this.activeChunks[this.activeChunks.length - 1];
    if (machineZ < furthestChunk.zCenter + this.chunkLength * 0.5) {
      this.spawnChunk(this.chunkIndexCounter);
    }

    // 释放身后落后太远的 Chunk
    if (this.activeChunks.length > 4) {
      const oldest = this.activeChunks[0];
      if (machineZ < oldest.zCenter - this.chunkLength * 1.5) {
        this.scene.remove(oldest.group);
        // 回收该 Chunk 内残留的物体
        oldest.objects.forEach(obj => {
          const idx = this.activeObjects.indexOf(obj);
          if (idx !== -1) {
            this.activeObjects.splice(idx, 1);
          }
          this.objectPool.release(obj);
        });
        this.activeChunks.shift();
      }
    }

    // 3. 检测区域主题切换
    const currentChunk = this.activeChunks.find(c => Math.abs(c.zCenter - machineZ) <= this.chunkLength * 0.5);
    if (currentChunk && currentChunk.theme) {
      const themeIdx = REGION_THEMES.findIndex(t => t.id === currentChunk.theme.id);
      if (themeIdx !== -1 && themeIdx !== this.currentThemeIndex) {
        this.currentThemeIndex = themeIdx;
        eventBus.emit('REGION_CHANGED', {
          theme: currentChunk.theme,
          index: themeIdx
        });
      }
    }

    return absorbedInThisFrame;
  }

  clearAll() {
    this.activeObjects.forEach(obj => {
      this.objectPool.release(obj);
    });
    this.activeObjects = [];

    this.activeChunks.forEach(c => {
      this.scene.remove(c.group);
    });
    this.activeChunks = [];
  }
}
