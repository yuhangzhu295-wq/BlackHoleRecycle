/**
 * Home 预制体的布局器。正式视觉由编辑器保存的 Sprite 资源提供；这里不生成
 * Graphics 原型，也不根据桌面窗口尺寸重排为横屏。
 */
import { _decorator, Component, Node, UITransform } from 'cc';

const { ccclass } = _decorator;

type HomeLayoutEntry = readonly [width: number, height: number, x: number, y: number];

// Keep runtime geometry aligned with home.json without serializing authoring data.
const HOME_LAYOUT: Readonly<Record<string, HomeLayoutEntry>> = {
  Background: [720, 1280, 0, 0],
  CoinPanel: [220, 64, -224, 564],
  MachineStatus: [220, 64, 224, 564],
  CoinIcon: [54, 54, -302, 560],
  CoinValue: [140, 50, -190, 560],
  MachineName: [200, 34, 216, 580],
  MachineValue: [200, 34, 216, 544],
  Logo: [600, 180, 0, 370],
  HeroBlackHole: [360, 360, 0, 30],
  BtnStart: [360, 104, 0, -312],
  BtnMode: [160, 112, -208, -468],
  BtnSkin: [160, 112, 0, -468],
  BtnMachine: [160, 112, 208, -468],
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
