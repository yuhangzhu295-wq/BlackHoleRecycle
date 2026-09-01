/**
 * Home 预制体的布局器。正式视觉由编辑器保存的 Sprite 资源提供；这里不生成
 * Graphics 原型，也不根据桌面窗口尺寸重排为横屏。
 */
import { _decorator, Component, Node, UITransform } from 'cc';

const { ccclass } = _decorator;

@ccclass('HomePageVisual')
export class HomePageVisual extends Component {
  onEnable(): void {
    this.layout();
  }

  private layout(): void {
    // Product UI owns a 720×1280 portrait design space. Widgets may later
    // apply safe-area offsets, but desktop window dimensions must never
    // stretch the gameplay page into a landscape composition.
    this.resize('Background', 720, 1280, 0, 0);
    this.resize('CoinPanel', 236, 66, -216, 560);
    this.resize('MachineStatus', 236, 66, 216, 560);
    this.resize('CoinIcon', 54, 54, -302, 560);
    this.resize('CoinValue', 140, 50, -190, 560);
    this.resize('MachineName', 200, 34, 216, 580);
    this.resize('MachineValue', 200, 34, 216, 544);
    this.resize('Logo', 600, 180, 0, 398);
    this.resize('HeroBlackHole', 360, 360, 0, 35);
    this.resize('BtnStart', 430, 104, 0, -350);
    this.resize('BtnMode', 168, 142, -190, -510);
    this.resize('BtnSkin', 168, 142, 0, -510);
    this.resize('BtnMachine', 168, 142, 190, -510);
    this.resize('BtnSettings', 80, 80, 288, -578);

    this.centerButtonLabel('BtnStart');
    this.centerButtonLabel('BtnMode');
    this.centerButtonLabel('BtnSkin');
    this.centerButtonLabel('BtnMachine');
  }

  private resize(name: string, width: number, height: number, x: number, y: number): void {
    const node = this.node.getChildByName(name);
    const transform = node?.getComponent(UITransform);
    if (!node || !transform) return;
    transform.setContentSize(width, height);
    node.setPosition(x, y, 0);
  }

  private centerButtonLabel(buttonName: string): void {
    const button = this.node.getChildByName(buttonName);
    const label = button?.getChildByName(`${buttonName}Label`);
    if (label) label.setPosition(0, 0, 0);
  }

}
