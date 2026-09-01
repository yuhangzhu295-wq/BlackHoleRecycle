/**
 * Home 预制体的静态绘制器。它不创建节点或控件，只为编辑器保存的 Graphics 组件绘制
 * 背景、面板、按钮和黑洞主视觉，使 Home 页面在任意 9:16 浏览器尺寸下保持布局。
 */
import { _decorator, Component, Graphics, Node, UITransform, Color, view } from 'cc';

const { ccclass } = _decorator;

@ccclass('HomePageVisual')
export class HomePageVisual extends Component {
  onEnable(): void {
    this.layout();
    this.draw();
  }

  private layout(): void {
    const size = view.getVisibleSize();
    const halfW = size.width / 2;
    const halfH = size.height / 2;
    this.resize('Background', size.width, size.height, 0, 0);
    this.resize('TopBar', size.width - 40, 104, 0, halfH - 68);
    this.resize('CoinPanel', 236, 66, -halfW + 144, halfH - 68);
    this.resize('MachineStatus', 236, 66, halfW - 144, halfH - 68);
    this.resize('CoinValue', 150, 50, -halfW + 158, halfH - 68);
    this.resize('MachineName', 200, 34, halfW - 144, halfH - 48);
    this.resize('MachineValue', 200, 34, halfW - 144, halfH - 84);
    this.resize('Logo', Math.min(size.width - 56, 600), 92, 0, halfH - 220);
    this.resize('HeroBlackHole', Math.min(size.width * 0.62, 420), Math.min(size.width * 0.62, 420), 0, 20);
    this.resize('BtnStart', Math.min(size.width - 160, 520), 104, 0, -halfH + 284);
    this.resize('BtnMode', 168, 142, -190, -halfH + 134);
    this.resize('BtnSkin', 168, 142, 0, -halfH + 134);
    this.resize('BtnMachine', 168, 142, 190, -halfH + 134);
    this.resize('BtnSettings', 80, 80, halfW - 62, -halfH + 62);
  }

  private resize(name: string, width: number, height: number, x: number, y: number): void {
    const node = this.node.getChildByName(name);
    const transform = node?.getComponent(UITransform);
    if (!node || !transform) return;
    transform.setContentSize(width, height);
    node.setPosition(x, y, 0);
  }

  private draw(): void {
    this.rect('Background', new Color(105, 180, 48, 255), 0);
    this.roundRect('TopBar', new Color(24, 47, 35, 222), 28);
    this.roundRect('CoinPanel', new Color(25, 25, 28, 238), 28);
    this.roundRect('MachineStatus', new Color(25, 25, 28, 238), 28);
    this.blackHole('HeroBlackHole');
    this.roundRect('BtnStart', new Color(255, 190, 25, 255), 24, new Color(158, 83, 2, 255), 10);
    this.roundRect('BtnMode', new Color(127, 72, 201, 255), 22, new Color(66, 31, 128, 255), 8);
    this.roundRect('BtnSkin', new Color(69, 143, 236, 255), 22, new Color(28, 83, 164, 255), 8);
    this.roundRect('BtnMachine', new Color(91, 182, 56, 255), 22, new Color(41, 116, 28, 255), 8);
    this.roundRect('BtnSettings', new Color(45, 48, 57, 238), 40, new Color(16, 18, 22, 255), 5);
  }

  private rect(name: string, color: Color, radius = 0): void {
    const node = this.node.getChildByName(name);
    const graphics = node?.getComponent(Graphics);
    const transform = node?.getComponent(UITransform);
    if (!graphics || !transform) return;
    graphics.clear();
    graphics.fillColor = color;
    const x = -transform.width / 2;
    const y = -transform.height / 2;
    if (radius > 0) graphics.roundRect(x, y, transform.width, transform.height, radius);
    else graphics.rect(x, y, transform.width, transform.height);
    graphics.fill();
  }

  private roundRect(name: string, color: Color, radius: number, stroke?: Color, lineWidth = 0): void {
    this.rect(name, color, radius);
    if (!stroke) return;
    const node = this.node.getChildByName(name);
    const graphics = node?.getComponent(Graphics);
    const transform = node?.getComponent(UITransform);
    if (!graphics || !transform) return;
    graphics.lineWidth = lineWidth;
    graphics.strokeColor = stroke;
    graphics.roundRect(-transform.width / 2, -transform.height / 2, transform.width, transform.height, radius);
    graphics.stroke();
  }

  private blackHole(name: string): void {
    const node = this.node.getChildByName(name);
    const graphics = node?.getComponent(Graphics);
    const transform = node?.getComponent(UITransform);
    if (!graphics || !transform) return;
    graphics.clear();
    const radius = Math.min(transform.width, transform.height) / 2;
    const rings: Array<[number, Color]> = [
      [1, new Color(69, 48, 190, 255)],
      [0.82, new Color(108, 87, 255, 255)],
      [0.64, new Color(49, 29, 142, 255)],
      [0.43, new Color(20, 13, 58, 255)],
      [0.25, Color.BLACK],
    ];
    for (const [ratio, color] of rings) {
      graphics.fillColor = color;
      graphics.circle(0, 0, radius * ratio);
      graphics.fill();
    }
    graphics.lineWidth = Math.max(4, radius * 0.04);
    graphics.strokeColor = new Color(230, 224, 255, 190);
    graphics.circle(0, 0, radius * 0.92);
    graphics.stroke();
  }
}
