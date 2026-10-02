/**
 * Editor-saved virtual joystick renderer. The input is owned by PlayerController;
 * this component only renders the real normalized input state and never emits
 * movement commands itself.
 *
 * V7 PHASE 7: the base plate and knob are **authored SpriteFrames**
 * (`game_art/ui/textures/joystick_base.png` / `joystick_knob.png`) drawn on
 * child Sprites sized to the serialized nodes. This component no longer draws
 * geometry in the normal path — it positions the knob and selects the frame.
 *
 * The `cc.Graphics` rings survive as `drawBase` / `drawKnob`, a **degradation
 * path reachable only when the authored frames are unavailable**, so a failed
 * download leaves the old schematic rings rather than an invisible joystick.
 */
import { _decorator, Color, Component, director, Graphics, Node, Sprite, SpriteFrame, UITransform } from 'cc';

import { PlayerController } from '../gameplay/PlayerController';
import { UIAssetLibrary, type UIFrameKey } from './UIAssetLibrary';

const { ccclass, property } = _decorator;

/** Child node names for the authored art, one per serialized ring node. */
const BASE_ART_NODE = 'JoystickBaseArt';
const KNOB_ART_NODE = 'JoystickKnobArt';

@ccclass('JoystickVisual')
export class JoystickVisual extends Component {
  @property(Node)
  public base: Node | null = null;

  @property(Node)
  public knob: Node | null = null;

  private playerController: PlayerController | null = null;
  private readonly knobRadius: number = 68;
  private waitingForAssets = false;
  private usesAuthoredArt = false;
  private fallbackReason: string | null = null;
  /**
   * The authored x=232 placed the 196-unit control almost against the right
   * edge after full-height FIXED_WIDTH adaptation.  At 390px wide that left
   * fewer than 45 physical pixels for a westward drag, so a player could not
   * request full left input.  This position leaves a real 92px drag radius
   * while preserving the lower-right affordance from the V2 reference.
   */
  private readonly rightHandSafeX: number = 148;

  onLoad(): void {
    this.node.setPosition(this.rightHandSafeX, this.node.position.y, this.node.position.z);
    this.applyAuthoredArt();
  }

  update(): void {
    if (!this.playerController) {
      this.playerController = director.getScene()?.getComponentInChildren(PlayerController) || null;
    }
    if (!this.knob || !this.playerController) return;

    const input = this.playerController.moveInput;
    this.knob.setPosition(input.x * this.knobRadius, input.y * this.knobRadius, 0);
  }

  /** Read-only observation: authored art or the vector degradation path. */
  public getDiagnostics(): {
    readonly usesAuthoredArt: boolean;
    readonly baseFrame: string | null;
    readonly knobFrame: string | null;
    readonly fallbackReason: string | null;
  } {
    return {
      usesAuthoredArt: this.usesAuthoredArt,
      baseFrame: this.base?.getChildByName(BASE_ART_NODE)?.getComponent(Sprite)?.spriteFrame?.name || null,
      knobFrame: this.knob?.getChildByName(KNOB_ART_NODE)?.getComponent(Sprite)?.spriteFrame?.name || null,
      fallbackReason: this.fallbackReason,
    };
  }

  /**
   * Prefer the authored sprites. `Graphics` and `Sprite` are both `UIRenderer`s
   * and cannot share one node, so the art lives on a dedicated child sized from
   * the serialized ring node and the ring's `Graphics` is disabled once the
   * frame is on screen.
   */
  private applyAuthoredArt(): void {
    const baseFrame = UIAssetLibrary.getFrame('joystickBase');
    const knobFrame = UIAssetLibrary.getFrame('joystickKnob');
    if (baseFrame && knobFrame) {
      this.mountArt(this.base, BASE_ART_NODE, baseFrame, 196);
      this.mountArt(this.knob, KNOB_ART_NODE, knobFrame, 76);
      this.setVectorEnabled(this.base, false);
      this.setVectorEnabled(this.knob, false);
      this.usesAuthoredArt = true;
      this.fallbackReason = null;
      return;
    }

    this.usesAuthoredArt = false;
    this.fallbackReason = UIAssetLibrary.getLastError()
      || (UIAssetLibrary.isPending() ? 'authored UI assets pending' : 'authored UI assets unavailable');
    this.drawBase();
    this.drawKnob();
    UIAssetLibrary.ensure();
    if (!this.waitingForAssets) {
      this.waitingForAssets = true;
      UIAssetLibrary.whenReady(() => {
        this.waitingForAssets = false;
        if (this.node?.isValid) this.applyAuthoredArt();
      });
    }
  }

  private mountArt(host: Node | null, name: string, frame: SpriteFrame, fallbackSize: number): void {
    if (!host?.isValid) return;
    const existing = host.getChildByName(name);
    const art = existing || new Node(name);
    art.layer = host.layer;
    if (!existing) host.addChild(art);
    art.setPosition(0, 0, 0);
    const hostTransform = host.getComponent(UITransform);
    const transform = art.getComponent(UITransform) || art.addComponent(UITransform);
    transform.setContentSize(hostTransform?.width || fallbackSize, hostTransform?.height || fallbackSize);
    const sprite = art.getComponent(Sprite) || art.addComponent(Sprite);
    sprite.spriteFrame = frame;
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.enabled = true;
  }

  private setVectorEnabled(host: Node | null, enabled: boolean): void {
    const graphics = host?.getComponent(Graphics);
    if (graphics) graphics.enabled = enabled;
  }

  private drawBase(): void {
    const graphics = this.base?.getComponent(Graphics);
    if (!graphics) return;
    graphics.enabled = true;
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
    graphics.enabled = true;
    graphics.clear();
    graphics.lineWidth = 5;
    graphics.fillColor = new Color(239, 251, 255, 190);
    graphics.strokeColor = new Color(94, 195, 243, 240);
    graphics.circle(0, 0, 34);
    graphics.fill();
    graphics.stroke();
  }
}
