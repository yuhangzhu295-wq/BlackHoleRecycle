/**
 * Home 预制体的布局器。正式视觉由编辑器保存的 Sprite 资源提供；这里不生成
 * Graphics 原型，也不根据桌面窗口尺寸重排为横屏。
 */
import { _decorator, Component, Node, UITransform } from 'cc';

const { ccclass } = _decorator;

type HomeLayoutEntry = readonly [width: number, height: number, x: number, y: number];

// Keep runtime geometry aligned with home.json without serializing authoring data.
// V4 reference (05-home.png) button order left-to-right: 模式 / 机器 / 皮肤
const HOME_LAYOUT: Readonly<Record<string, HomeLayoutEntry>> = {
  Background: [720, 1280, 0, 0],
  // Move panels 16 px inward from canvas edges to clear device safe-area insets.
  // Design-space left edge of CoinPanel: 720/2 - (224-16) - 110 = 42 px (was 26 px).
  CoinPanel: [220, 64, -208, 564],
  MachineStatus: [220, 64, 208, 564],
  CoinIcon: [54, 54, -286, 560],
  CoinValue: [140, 50, -174, 560],
  MachineName: [200, 34, 200, 580],
  MachineValue: [200, 34, 200, 544],
  Logo: [600, 180, 0, 370],
  HeroBlackHole: [360, 360, 0, 30],
  // V4: BtnStart is wider (~490 px in reference); 480 keeps safe margins.
  BtnStart: [480, 104, 0, -312],
  // V4 order: 模式 (left) · 机器 (center) · 皮肤 (right)
  BtnMode: [160, 112, -208, -468],
  BtnMachine: [160, 112, 0, -468],
  BtnSkin: [160, 112, 208, -468],
  BtnSettings: [80, 80, 288, -540],
};

@ccclass('HomePageVisual')
export class HomePageVisual extends Component {
  onEnable(): void {
    this.layout();
  }

  private layout(): void {
    // Product UI owns a 720×1280 portrait design space. Widgets may later
    // apply safe-area offsets, but desktop window dimensions must never
    // stretch the gameplay page into a landscape composition.
    for (const [name, [width, height, x, y]] of Object.entries(HOME_LAYOUT)) {
      this.resize(name, width, height, x, y);
    }

    this.centerButtonLabel('BtnStart');
    // The three small action cards carry pictograms in their upper half. Keep
    // their captions on the lower strip just like the V2 home reference;
    // centering them over the icons made both affordances harder to read.
    this.positionButtonLabel('BtnMode', -32);
    this.positionButtonLabel('BtnSkin', -32);
    this.positionButtonLabel('BtnMachine', -32);
  }

  private resize(name: string, width: number, height: number, x: number, y: number): void {
    const node = this.findNode(name);
    const transform = node?.getComponent(UITransform);
    if (!node || !transform) return;
    transform.setContentSize(width, height);
    node.setPosition(x, y, 0);
  }

  private centerButtonLabel(buttonName: string): void {
    this.positionButtonLabel(buttonName, 0);
  }

  private positionButtonLabel(buttonName: string, y: number): void {
    const button = this.findNode(buttonName);
    const label = button?.getChildByName(`${buttonName}Label`);
    if (label) label.setPosition(0, y, 0);
  }

  private findNode(name: string): Node | null {
    return this.node.getChildByName(name) ?? this.node.getChildByName('SafeAreaRoot')?.getChildByName(name) ?? null;
  }

}
