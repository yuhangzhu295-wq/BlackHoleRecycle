/** 页面标识在单独模块中声明，供页面与路由器共同引用，避免组件脚本循环依赖。 */
export enum UIPageId {
  Home = 0,
  ModeSelect = 1,
  Arena = 2,
  Endless = 3,
  Revive = 4,
  Settlement = 5,
  Pause = 6,
  Upgrade = 7,
  /** Read-only current-machine and progression reference opened from Home. */
  MachineInfo = 8,
  /** Persisted cosmetic selection and coin-backed unlock page opened from Home. */
  SkinSelection = 9,
}
