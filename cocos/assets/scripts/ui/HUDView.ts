/**
 * 正式 UI 的页面状态与数据绑定器。
 *
 * 视觉节点、Button、Label 均由 Cocos Creator 保存的 Prefab 提供。本组件绝不
 * 在运行时创建 Node、Graphics、Label 或 Button，也不会退回到旧 HUD 作为替代品。
 */
import { _decorator, Component, director, Node } from 'cc';
import { EndlessHUDController } from './EndlessHUDController';
import { SettlementPageController } from './SettlementPageController';

const { ccclass } = _decorator;

export type FormalScreenName = 'Gameplay' | 'Pause' | 'Settlement';

@ccclass('HUDView')
export class HUDView extends Component {
  public currentScreenName: FormalScreenName | null = null;

  onLoad(): void {
    this.hideAllScreens();
  }

  public showScreen(name: FormalScreenName): void {
    const endless = this.findPage('EndlessHUD');
    const pause = this.findPage('PausePage');
    const settlement = this.findPage('SettlementPage');

    if (!endless || !pause || !settlement) {
      console.error('[HUDView] Missing editor-saved formal runtime pages. Legacy HUD fallback is disabled.');
      return;
    }

    endless.active = name === 'Gameplay';
    pause.active = name === 'Pause';
    settlement.active = name === 'Settlement';
    this.currentScreenName = name;
  }

  public hideAllScreens(): void {
    for (const name of ['EndlessHUD', 'PausePage', 'SettlementPage']) {
      const page = this.findPage(name);
      if (page) page.active = false;
    }
    this.currentScreenName = null;
  }

  public updateStats(mass: number, level: number, levelTitle: string, coins: number, regionName?: string): void {
    const controller = this.findPage('EndlessHUD')?.getComponent(EndlessHUDController);
    controller?.updateStats(mass, level, levelTitle, coins, regionName || '未知区域');
  }

  public updateSettlement(absorbed: number, coins: number, level: number, regions: number, mass: number = 0): void {
    const controller = this.findPage('SettlementPage')?.getComponent(SettlementPageController);
    controller?.updateStats(absorbed, coins, level, regions, mass);
  }

  private findPage(name: string): Node | null {
    return director.getScene()?.getChildByName('Canvas')?.getChildByName(name) || null;
  }
}
