/**
 * Creator-saved rounded panel renderer.
 *
 * Cocos does not serialize Graphics path commands written by an editor scene
 * script.  This component serializes only the panel contract (colour and
 * corner radius) on a normal scene node and redraws with the native engine
 * API when that node becomes visible in a built player.
 */
import { _decorator, Color, Component, Graphics, UITransform } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('RoundedPanelGraphic')
export class RoundedPanelGraphic extends Component {
  @property(Color)
  public fillColor: Color = new Color(255, 255, 255, 255);

  @property
  public cornerRadius: number = 28;

  private graphics: Graphics | null = null;

  onLoad(): void {
    this.graphics = this.getComponent(Graphics) || this.addComponent(Graphics);
    this.redraw();
  }

  onEnable(): void {
    this.redraw();
  }

  public redraw(): void {
    const transform = this.getComponent(UITransform);
    const graphics = this.graphics || this.getComponent(Graphics);
    if (!transform || !graphics) return;

    const width = transform.width;
    const height = transform.height;
    const radius = Math.max(0, Math.min(this.cornerRadius, Math.min(width, height) * 0.5));
    graphics.clear();
    graphics.fillColor = this.fillColor;
    if (radius > 0) graphics.roundRect(-width * 0.5, -height * 0.5, width, height, radius);
    else graphics.rect(-width * 0.5, -height * 0.5, width, height);
    graphics.fill();
  }
}
