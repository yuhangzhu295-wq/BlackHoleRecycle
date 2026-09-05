/**
 * 强类型持久化存档服务 (SaveService.ts)
 */
import { sys } from 'cc';
import { SKINS_CONFIG } from './GameConfig';

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
/** Starter appearances are always selectable after save migration. */
const STARTER_SKIN_IDS = ['skin_classic', 'skin_violet_vortex'] as const;

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
      coins: 0,
      highScore: 0,
      highestRegion: 0,
      machineLevel: 1,
      currentSkinId: 'skin_classic',
      unlockedSkins: [...STARTER_SKIN_IDS],
      metaUpgrades: {
        suctionRadius: 0,
        moveSpeed: 0,
        compressionValue: 0,
        startingMass: 0
      },
      tasks: {
        absorbedCount: 0,
        compressTimes: 0,
        maxSingleMass: 0,
        magnetUses: 0,
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
      // Existing players may have a V1 save whose only unlocked skin was the
      // original default. Migrate it in place so the Home skin control has a
      // real, immediately selectable second appearance.
      this.normalizeUnlockedSkins();
      if (!this.data.unlockedSkins.includes(this.data.currentSkinId)) {
        this.data.currentSkinId = STARTER_SKIN_IDS[0];
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

  /**
   * Older editor/browser saves can contain malformed values in unlockedSkins.
   * Keep only persisted string ids, then restore the free starter set. Paid
   * skin ids remain valid only when they are explicitly stored as strings.
   */
  private normalizeUnlockedSkins(): void {
    const stored = Array.isArray(this.data.unlockedSkins)
      ? this.data.unlockedSkins.filter((skinId): skinId is string => typeof skinId === 'string')
      : [];
    this.data.unlockedSkins = [...new Set([...STARTER_SKIN_IDS, ...stored])];
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

  /** Selects only a skin that this save has genuinely unlocked. */
  public selectSkin(skinId: string): boolean {
    this.normalizeUnlockedSkins();
    const isStarterSkin = (STARTER_SKIN_IDS as readonly string[]).includes(skinId);
    if (!skinId || (!isStarterSkin && !this.data.unlockedSkins.includes(skinId))) return false;
    this.data.currentSkinId = skinId;
    this.save();
    return true;
  }

  /**
   * Unlock one configured paid appearance with coins earned by real sessions.
   * Validation and the coin deduction live together so a UI click can never
   * mark an unconfigured skin as owned or spend only part of the transaction.
   */
  public unlockSkin(skinId: string): boolean {
    this.normalizeUnlockedSkins();
    const skin = SKINS_CONFIG.find((entry) => entry.id === skinId) || null;
    if (!skin) return false;
    if (skin.unlocked || this.data.unlockedSkins.includes(skin.id)) return true;
    if (!Number.isSafeInteger(skin.price) || skin.price <= 0 || this.data.coins < skin.price) return false;

    this.data.coins -= skin.price;
    this.data.unlockedSkins.push(skin.id);
    this.normalizeUnlockedSkins();
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
