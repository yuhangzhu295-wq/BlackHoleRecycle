/**
 * 存档与持久化管理 (SaveManager)
 * 包含金币、最高分、Meta 永久升级、皮肤解锁、每日任务与设置数据的原子读写与校验
 */
import { platform } from '../adapter/platform.js';

const SAVE_KEY = 'BLACK_HOLE_RECYCLE_SAVEDATA_V1';

export class SaveManager {
  constructor() {
    this.data = this.getDefaultData();
    this.load();
  }

  getDefaultData() {
    return {
      version: 1,
      coins: 2360,
      highScore: 128580,
      highestRegion: 0,
      currentSkinId: 'skin_classic',
      unlockedSkins: ['skin_classic'],
      metaUpgrades: {
        suctionRadius: 0, // lv 0~10
        moveSpeed: 0,
        compressionValue: 0,
        startingMass: 0
      },
      tasks: {
        absorbedCount: 120,
        compressTimes: 3,
        maxSingleMass: 3200,
        magnetUses: 1,
        reachedRegionWarehouse: 0,
        claimedTasks: []
      },
      settings: {
        music: true,
        sfx: true,
        vibration: true,
        quality: 'high' // 'low' | 'medium' | 'high'
      },
      tutorialCompleted: false
    };
  }

  load() {
    const saved = platform.getStorage(SAVE_KEY, null);
    if (saved && typeof saved === 'object') {
      this.data = {
        ...this.getDefaultData(),
        ...saved,
        metaUpgrades: {
          ...this.getDefaultData().metaUpgrades,
          ...(saved.metaUpgrades || {})
        },
        tasks: {
          ...this.getDefaultData().tasks,
          ...(saved.tasks || {})
        },
        settings: {
          ...this.getDefaultData().settings,
          ...(saved.settings || {})
        }
      };
    } else {
      this.save();
    }
    return this.data;
  }

  save() {
    platform.setStorage(SAVE_KEY, this.data);
  }

  addCoins(amount) {
    if (amount <= 0) return this.data.coins;
    this.data.coins += Math.round(amount);
    this.save();
    return this.data.coins;
  }

  spendCoins(amount) {
    if (amount > this.data.coins) return false;
    this.data.coins -= amount;
    this.save();
    return true;
  }

  updateHighScore(score) {
    if (score > this.data.highScore) {
      this.data.highScore = Math.round(score);
      this.save();
      return true;
    }
    return false;
  }

  upgradeMeta(type) {
    const currentLevel = this.data.metaUpgrades[type] || 0;
    const cost = (currentLevel + 1) * 500;
    if (currentLevel >= 10) return { success: false, reason: 'MAX_LEVEL' };
    if (this.spendCoins(cost)) {
      this.data.metaUpgrades[type] = currentLevel + 1;
      this.save();
      return { success: true, level: this.data.metaUpgrades[type], nextCost: (currentLevel + 2) * 500 };
    }
    return { success: false, reason: 'NOT_ENOUGH_COINS' };
  }

  unlockSkin(skinId, price) {
    if (this.data.unlockedSkins.includes(skinId)) return true;
    if (this.spendCoins(price)) {
      this.data.unlockedSkins.push(skinId);
      this.data.currentSkinId = skinId;
      this.save();
      return true;
    }
    return false;
  }

  equipSkin(skinId) {
    if (this.data.unlockedSkins.includes(skinId)) {
      this.data.currentSkinId = skinId;
      this.save();
      return true;
    }
    return false;
  }

  recordTaskProgress(metric, amount = 1) {
    if (this.data.tasks[metric] !== undefined) {
      if (metric === 'maxSingleMass') {
        this.data.tasks[metric] = Math.max(this.data.tasks[metric], amount);
      } else {
        this.data.tasks[metric] += amount;
      }
      this.save();
    }
  }

  claimTaskReward(taskId, rewardCoins) {
    if (this.data.tasks.claimedTasks.includes(taskId)) return false;
    this.data.tasks.claimedTasks.push(taskId);
    this.addCoins(rewardCoins);
    this.save();
    return true;
  }
}

export const saveManager = new SaveManager();
