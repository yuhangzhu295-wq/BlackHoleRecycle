/**
 * Editor-saved virtual joystick renderer. The input is owned by PlayerController;
 * this component only renders the real normalized input state and never emits
 * movement commands itself.
 */
import { _decorator, Color, Component, director, Graphics, Node } from 'cc';
import { PlayerController } from '../gameplay/PlayerController';

const { ccclass, property } = _decorator;

@ccclass('JoystickVisual')
export class JoystickVisual extends Component {
  @property(Node)
  public base: Node | null = null;

  @property(Node)
  public knob: Node | null = null;

  private playerController: PlayerController | null = null;
  private readonly knobRadius: number = 68;

  onLoad(): void {
    this.drawBase();
    this.drawKnob();
  }

  update(): void {
    if (!this.playerController) {
      this.playerController = director.getScene()?.getComponentInChildren(PlayerController) || null;
    }
    if (!this.knob || !this.playerController) return;

    const input = this.playerController.moveInput;
    this.knob.setPosition(input.x * this.knobRadius, input.y * this.knobRadius, 0);
  }

  private drawBase(): void {
    const graphics = this.base?.getComponent(Graphics);
    if (!graphics) return;
    graphics.clear();
    graphics.lineWidth = 7;
    graphics.fillColor = new Color(21, 36, 55, 112);
    graphics.strokeColor = new Color(238, 247, 255, 205);
    graphics.circle(0, 0, 83);
    graphics.fill();
    graphics.stroke();
    graphics.lineWidth = 2;
    graphics.strokeColor = new Color(147, 224, 255, 180);
    graphics.circle(0, 0, 57);
    graphics.stroke();
  }

  private drawKnob(): void {
    const graphics = this.knob?.getComponent(Graphics);
    if (!graphics) return;
    graphics.clear();
    graphics.lineWidth = 5;
    graphics.fillColor = new Color(239, 251, 255, 190);
    graphics.strokeColor = new Color(94, 195, 243, 240);
    graphics.circle(0, 0, 34);
    graphics.fill();
    graphics.stroke();
  }
}
