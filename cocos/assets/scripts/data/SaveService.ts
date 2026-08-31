/**
 * 强类型持久化存档服务 (SaveService.ts)
 */
import { sys } from 'cc';

export interface ISaveData {
  version: number;
  coins: number;
  highScore: number;
  highestRegion: number;
  machineLevel: number;
  currentSkinId: string;
  unlockedSkins: string[];
  metaUpgrades: {
    suctionRadius: number;
    moveSpeed: number;
    compressionValue: number;
    startingMass: number;
  };
  tasks: {
    absorbedCount: number;
    compressTimes: number;
    maxSingleMass: number;
    magnetUses: number;
    reachedRegionWarehouse: number;
    claimedTasks: string[];
  };
  settings: {
    music: boolean;
    sfx: boolean;
    vibration: boolean;
    quality: 'low' | 'medium' | 'high';
  };
  tutorialCompleted: boolean;
}

const SAVE_KEY = 'BLACK_HOLE_RECYCLE_SAVEDATA_COCOS_V1';

export class SaveService {
  private static instance: SaveService;
  public data: ISaveData;

  private constructor() {
    this.data = this.getDefaultData();
    this.load();
  }

  public static getInstance(): SaveService {
    if (!SaveService.instance) {
      SaveService.instance = new SaveService();
    }
    return SaveService.instance;
  }

  public getDefaultData(): ISaveData {
    return {
      version: 1,
      coins: 2360,
      highScore: 128580,
      highestRegion: 0,
      machineLevel: 1,
      currentSkinId: 'skin_classic',
      unlockedSkins: ['skin_classic'],
      metaUpgrades: {
        suctionRadius: 0,
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
        quality: 'high'
      },
      tutorialCompleted: false
    };
  }

  public load(): ISaveData {
    try {
      let raw: string | null = null;
      if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
        raw = localStorage.getItem(SAVE_KEY);
      } else if (typeof sys !== 'undefined' && sys && sys.localStorage && typeof sys.localStorage.getItem === 'function') {
        raw = sys.localStorage.getItem(SAVE_KEY);
      }

      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = {
          ...this.getDefaultData(),
          ...parsed,
          metaUpgrades: { ...this.getDefaultData().metaUpgrades, ...(parsed.metaUpgrades || {}) },
          tasks: { ...this.getDefaultData().tasks, ...(parsed.tasks || {}) },
          settings: { ...this.getDefaultData().settings, ...(parsed.settings || {}) }
        };
      }
    } catch (e) {
      console.warn('[SaveService] Load failed, fallback to defaults', e);
      this.data = this.getDefaultData();
    }
    return this.data;
  }

  public save(): void {
    try {
      const raw = JSON.stringify(this.data);
      if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
        localStorage.setItem(SAVE_KEY, raw);
      } else if (typeof sys !== 'undefined' && sys && sys.localStorage && typeof sys.localStorage.setItem === 'function') {
        sys.localStorage.setItem(SAVE_KEY, raw);
      }
    } catch (e) {
      console.error('[SaveService] Save failed', e);
    }
  }

  public addCoins(amount: number): number {
    this.data.coins += Math.round(Math.max(0, amount));
    this.save();
    return this.data.coins;
  }

  public setMachineLevel(level: number): void {
    if (level > this.data.machineLevel) {
      this.data.machineLevel = level;
      this.save();
    }
  }

  public spendCoins(amount: number): boolean {
    if (this.data.coins < amount) return false;
    this.data.coins -= amount;
    this.save();
    return true;
  }

  public updateHighScore(score: number): boolean {
    if (score > this.data.highScore) {
      this.data.highScore = Math.round(score);
      this.save();
      return true;
    }
    return false;
  }
}

export const saveService = SaveService.getInstance();
