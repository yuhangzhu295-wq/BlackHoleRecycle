/**
 * V4 references 06 / 07 — the real map preview.
 *
 * Before V4 the Ready pages reused the *mode card* artwork as their preview.
 * That art has the mode title and description baked into its pixels, so it was
 * never a map preview and it leaked copy onto the page.
 *
 * V7 PHASE 7: the preview is now the authored **UICard prefab** from
 * `game_art/ui/prefabs/UICard.prefab` — a 9-slice card frame, the authored
 * thumbnail Sprite (`map_preview_city` / `map_preview_arena`) and the
 * "地图预览 / 竞技场预览" caption the design reference carries. This component
 * only mounts the card, selects the frame and sets the caption; it no longer
 * draws geometry in the normal path.
 *
 * The old `cc.Graphics` vector preview survives as `drawCity` / `drawArena`, a
 * **degradation path reachable only when the authored card is unavailable**
 * (the same contract `BlackHoleMachine.activatePrimitiveCoreFallback` uses). A
 * failed download therefore leaves a schematic preview instead of a blank card,
 * and play is never affected.
 */
import { _decorator, Color, Component, Enum, Graphics, instantiate, Label, Layers, Node, Sprite, UITransform } from 'cc';

import { UIAssetLibrary, type UIFrameKey } from './UIAssetLibrary';

const { ccclass, property } = _decorator;

/** Child node that owns the vector fallback preview (see `ensureArtNode`). */
const ART_NODE_NAME = 'PreviewArt';
/** Child node the authored `UICard` prefab is instantiated as. */
const CARD_NODE_NAME = 'PreviewCard';

export enum MapPreviewKind {
  CITY = 0,
  ARENA = 1,
}

export interface MapPreviewDiagnostics {
  readonly kind: 'CITY' | 'ARENA';
  readonly redrawCount: number;
  readonly drawnWidth: number;
  readonly drawnHeight: number;
  readonly bakedCardArtCleared: boolean;
  readonly bakedSpriteFrame: string | null;
  readonly graphicsEnabled: boolean;
  readonly artNodeName: string | null;
  readonly artLayerIsUi2d: boolean | null;
  readonly spriteEnabled: boolean | null;
  /** V7: true when the authored thumbnail is the thing on screen. */
  readonly usesAuthoredArt: boolean;
  readonly authoredFrame: string | null;
  /** Why the vector path ran instead, or null when it did not. */
  readonly fallbackReason: string | null;
}

/** Kenney-style flat cartoon palette, matched to the V4 colour tokens. */
const INK = new Color(16, 24, 39, 255);
const GROUND = new Color(233, 226, 208, 255);
const SKY = new Color(198, 235, 250, 255);
const ROAD = new Color(110, 116, 128, 255);
const ROAD_EDGE = new Color(87, 92, 102, 255);
const DASH = new Color(242, 233, 200, 255);
const CORE = new Color(5, 7, 14, 255);
const RIM = new Color(95, 233, 255, 255);
const BUILDINGS: readonly Color[] = [
  new Color(127, 180, 232, 255),
  new Color(240, 178, 122, 255),
  new Color(154, 214, 160, 255),
  new Color(242, 166, 166, 255),
  new Color(199, 168, 232, 255),
];
const ARENA_FLOOR = new Color(59, 42, 102, 255);
const ARENA_FLOOR_DARK = new Color(42, 31, 78, 255);
const ARENA_RING = new Color(255, 255, 255, 92);
const BOTS: readonly Color[] = [
  new Color(139, 92, 246, 255),
  new Color(244, 63, 94, 255),
  new Color(16, 185, 129, 255),
  new Color(255, 160, 0, 255),
  new Color(0, 192, 255, 255),
];

@ccclass('MapPreviewGraphic')
export class MapPreviewGraphic extends Component {
  @property({ type: Enum(MapPreviewKind), tooltip: '预览对应的玩法模式。' })
  public kind: MapPreviewKind = MapPreviewKind.CITY;

  private graphics: Graphics | null = null;
  private artNode: Node | null = null;
  private cardNode: Node | null = null;
  private redrawCount = 0;
  private drawnWidth = 0;
  private drawnHeight = 0;
  private bakedCardArtCleared = false;
  private usesAuthoredArt = false;
  private authoredFrame: string | null = null;
  private fallbackReason: string | null = null;
  private waitingForAssets = false;

  onLoad(): void {
    this.ensureArtNode();
    this.redraw();
  }

  onEnable(): void {
    this.clearBakedCardArt();
    this.redraw();
  }

  /**
   * Read-only observation for the V4/V7 design gate: proves whether the runtime
   * preview is the authored thumbnail or the vector degradation path, and that
   * the stale mode-card pixels are gone either way.
   */
  public getDiagnostics(): MapPreviewDiagnostics {
    const sprite = this.getComponent(Sprite);
    return {
      kind: this.kind === MapPreviewKind.ARENA ? 'ARENA' : 'CITY',
      redrawCount: this.redrawCount,
      drawnWidth: this.drawnWidth,
      drawnHeight: this.drawnHeight,
      bakedCardArtCleared: this.bakedCardArtCleared,
      bakedSpriteFrame: sprite?.spriteFrame?.name || null,
      graphicsEnabled: Boolean(this.graphics?.enabled),
      artNodeName: this.artNode?.name || null,
      artLayerIsUi2d: this.artNode ? this.artNode.layer === Layers.Enum.UI_2D : null,
      spriteEnabled: sprite?.enabled ?? null,
      usesAuthoredArt: this.usesAuthoredArt,
      authoredFrame: this.authoredFrame,
      fallbackReason: this.fallbackReason,
    };
  }

  /** The frame key this preview kind resolves to in the authored library. */
  private get frameKey(): UIFrameKey {
    return this.kind === MapPreviewKind.ARENA ? 'mapPreviewArena' : 'mapPreviewCity';
  }

  /**
   * The vector fallback lives on a dedicated child node, for two engine reasons
   * that a built player enforces and the editor preview hides:
   *  - a `Node` created in code starts on `Layers.Enum.DEFAULT`, and the UI
   *    camera only draws `UI_2D`, so the art is silently invisible unless the
   *    layer is copied from the host;
   *  - `Sprite` and `Graphics` are both `UIRenderer`s, and two renderers on one
   *    node fight over the node's UI component. The authored path uses the
   *    host's own serialized `Sprite`; the fallback uses this child's `Graphics`.
   */
  private ensureArtNode(): Node | null {
    if (this.artNode?.isValid && this.graphics?.isValid) return this.artNode;
    const hostTransform = this.getComponent(UITransform);
    const existing = this.node.getChildByName(ART_NODE_NAME);
    const art = existing || new Node(ART_NODE_NAME);
    art.layer = this.node.layer;
    if (!existing) this.node.addChild(art);
    art.setPosition(0, 0, 0);
    const transform = art.getComponent(UITransform) || art.addComponent(UITransform);
    transform.setContentSize(hostTransform?.width || 560, hostTransform?.height || 260);
    this.graphics = art.getComponent(Graphics) || art.addComponent(Graphics);
    this.artNode = art;
    return art;
  }

  /**
   * The serialized node still carries the old mode-card SpriteFrame. Replacing
   * it (authored path) or clearing it (fallback path) removes the baked
   * title/description copy.
   */
  private clearBakedCardArt(): void {
    const sprite = this.getComponent(Sprite);
    if (!sprite) return;
    if (sprite.spriteFrame && !this.usesAuthoredArt) {
      sprite.spriteFrame = null;
      this.bakedCardArtCleared = true;
    }
    if (!this.usesAuthoredArt) sprite.enabled = false;
  }

  public redraw(): void {
    const hostTransform = this.getComponent(UITransform);
    const width = hostTransform?.width || 0;
    const height = hostTransform?.height || 0;
    if (width <= 0 || height <= 0) return;

    const art = this.ensureArtNode();
    const graphics = this.graphics;
    if (!art || !graphics) return;
    art.getComponent(UITransform)?.setContentSize(width, height);

    // Primary path: the authored UICard prefab (frame + thumbnail + caption).
    const frame = UIAssetLibrary.getFrame(this.frameKey);
    const card = frame ? this.ensureCard(width, height) : null;
    const previewSprite = card?.getChildByName('Preview')?.getComponent(Sprite) || null;
    if (card && previewSprite && frame) {
      if (previewSprite.spriteFrame !== frame) previewSprite.spriteFrame = frame;
      previewSprite.type = Sprite.Type.SIMPLE;
      previewSprite.sizeMode = Sprite.SizeMode.CUSTOM;
      const caption = card.getChildByName('Caption')?.getComponent(Label);
      if (caption) caption.string = this.kind === MapPreviewKind.ARENA ? '竞技场预览' : '地图预览';
      this.hideVectorFallback(art, graphics);
      this.usesAuthoredArt = true;
      this.authoredFrame = frame.name || this.frameKey;
      this.fallbackReason = null;
      this.redrawCount += 1;
      this.drawnWidth = width;
      this.drawnHeight = height;
      return;
    }

    // Degradation path: the authored card has not arrived (yet).
    this.usesAuthoredArt = false;
    this.authoredFrame = null;
    this.fallbackReason = UIAssetLibrary.getLastError()
      || (UIAssetLibrary.isPending() ? 'authored UI assets pending' : 'authored UI assets unavailable');
    const hostSprite = this.getComponent(Sprite);
    if (hostSprite) {
      if (hostSprite.spriteFrame) {
        hostSprite.spriteFrame = null;
        this.bakedCardArtCleared = true;
      }
      hostSprite.enabled = false;
    }
    UIAssetLibrary.ensure();
    if (!this.waitingForAssets) {
      this.waitingForAssets = true;
      UIAssetLibrary.whenReady(() => {
        this.waitingForAssets = false;
        if (this.node?.isValid) this.redraw();
      });
    }

    art.active = true;
    graphics.enabled = true;
    const left = -width * 0.5;
    const bottom = -height * 0.5;
    graphics.clear();
    if (this.kind === MapPreviewKind.ARENA) this.drawArena(graphics, left, bottom, width, height);
    else this.drawCity(graphics, left, bottom, width, height);
    this.redrawCount += 1;
    this.drawnWidth = width;
    this.drawnHeight = height;
  }

  /**
   * Mount (or reuse) the authored `UICard` under the host node. It is a child
   * rather than a replacement so the serialized `MapPreview` node — whose
   * position and size MODE_READY_LAYOUT owns — keeps its identity.
   */
  private ensureCard(width: number, height: number): Node | null {
    if (this.cardNode?.isValid) {
      this.cardNode.getComponent(UITransform)?.setContentSize(width, height);
      return this.cardNode;
    }
    const prefab = UIAssetLibrary.getPrefab('card');
    if (!prefab) return null;
    const card = instantiate(prefab);
    card.name = CARD_NODE_NAME;
    card.layer = this.node.layer;
    this.node.addChild(card);
    card.setPosition(0, 0, 0);
    card.getComponent(UITransform)?.setContentSize(width, height);
    this.cardNode = card;
    return card;
  }

  /** Turn off the vector child and the stale mode-card sprite on the host. */
  private hideVectorFallback(art: Node, graphics: Graphics): void {
    graphics.enabled = false;
    art.active = false;
    const hostSprite = this.getComponent(Sprite);
    if (hostSprite) {
      if (hostSprite.spriteFrame) {
        hostSprite.spriteFrame = null;
        this.bakedCardArtCleared = true;
      }
      hostSprite.enabled = false;
    }
  }

  /** Endless Exploration fallback: an open low-poly city block with a core. */
  private drawCity(graphics: Graphics, left: number, bottom: number, width: number, height: number): void {
    const horizon = bottom + height * 0.62;

    graphics.fillColor = SKY;
    graphics.rect(left, horizon, width, height - (horizon - bottom));
    graphics.fill();

    graphics.fillColor = GROUND;
    graphics.rect(left, bottom, width, horizon - bottom);
    graphics.fill();

    // Two crossing roads.
    const roadH = height * 0.14;
    const roadY = bottom + (horizon - bottom) * 0.44;
    graphics.fillColor = ROAD_EDGE;
    graphics.rect(left, roadY - 4, width, roadH + 8);
    graphics.fill();
    graphics.fillColor = ROAD;
    graphics.rect(left, roadY, width, roadH);
    graphics.fill();

    const roadW = width * 0.16;
    const roadX = left + width * 0.66;
    graphics.fillColor = ROAD_EDGE;
    graphics.rect(roadX - 4, horizon - 8, roadW + 8, height - (horizon - bottom));
    graphics.fill();
    graphics.fillColor = ROAD;
    graphics.rect(roadX, horizon, roadW, height - (horizon - bottom));
    graphics.fill();

    graphics.fillColor = DASH;
    for (let x = left + 10; x < left + width - 10; x += 46) {
      graphics.rect(x, roadY + roadH * 0.5 - 4, 26, 8);
    }
    graphics.fill();

    // Buildings along the horizon.
    const buildingWidths = [0.17, 0.13, 0.15, 0.12, 0.16];
    let cursor = left + width * 0.02;
    for (let index = 0; index < buildingWidths.length; index++) {
      const buildingWidth = width * buildingWidths[index];
      const buildingHeight = height * (0.14 + ((index * 37) % 9) * 0.012);
      graphics.fillColor = BUILDINGS[index % BUILDINGS.length];
      graphics.roundRect(cursor, horizon - 4, buildingWidth, buildingHeight, 6);
      graphics.fill();
      graphics.lineWidth = 3;
      graphics.strokeColor = INK;
      graphics.roundRect(cursor, horizon - 4, buildingWidth, buildingHeight, 6);
      graphics.stroke();
      cursor += buildingWidth + width * 0.02;
    }

    // Trees.
    graphics.fillColor = new Color(70, 179, 74, 255);
    const treeSpots: ReadonlyArray<readonly [number, number, number]> = [
      [0.08, 0.24, 11], [0.22, 0.14, 9], [0.42, 0.3, 10],
      [0.78, 0.2, 12], [0.9, 0.34, 9],
    ];
    for (const [fx, fy, radius] of treeSpots) {
      graphics.circle(left + width * fx, bottom + (horizon - bottom) * fy, radius);
    }
    graphics.fill();

    // The black hole, at the intersection.
    const coreX = left + width * 0.34;
    const coreY = bottom + (horizon - bottom) * 0.3;
    const coreRadius = Math.min(width, height) * 0.13;
    graphics.fillColor = CORE;
    graphics.circle(coreX, coreY, coreRadius);
    graphics.fill();
    graphics.lineWidth = 4;
    graphics.strokeColor = RIM;
    graphics.circle(coreX, coreY, coreRadius);
    graphics.stroke();
    graphics.strokeColor = INK;
    graphics.circle(coreX, coreY, coreRadius + 4);
    graphics.stroke();
  }

  /** Arena Brawl fallback: a bounded ring with the local core and rivals. */
  private drawArena(graphics: Graphics, left: number, bottom: number, width: number, height: number): void {
    graphics.fillColor = ARENA_FLOOR_DARK;
    graphics.rect(left, bottom, width, height);
    graphics.fill();
    graphics.fillColor = ARENA_FLOOR;
    graphics.circle(left + width * 0.5, bottom + height * 0.5, Math.min(width, height) * 0.46);
    graphics.fill();

    const centerX = left + width * 0.5;
    const centerY = bottom + height * 0.5;
    graphics.lineWidth = 4;
    graphics.strokeColor = ARENA_RING;
    graphics.circle(centerX, centerY, Math.min(width, height) * 0.42);
    graphics.stroke();
    graphics.circle(centerX, centerY, Math.min(width, height) * 0.28);
    graphics.stroke();

    const botSpots: ReadonlyArray<readonly [number, number]> = [
      [0.14, 0.7], [0.84, 0.66], [0.2, 0.26], [0.8, 0.3], [0.5, 0.86],
    ];
    botSpots.forEach(([fx, fy], index) => {
      graphics.fillColor = BOTS[index % BOTS.length];
      graphics.circle(left + width * fx, bottom + height * fy, Math.min(width, height) * 0.075);
      graphics.fill();
      graphics.lineWidth = 3;
      graphics.strokeColor = INK;
      graphics.circle(left + width * fx, bottom + height * fy, Math.min(width, height) * 0.075);
      graphics.stroke();
    });

    graphics.fillColor = CORE;
    graphics.circle(centerX, centerY, Math.min(width, height) * 0.12);
    graphics.fill();
    graphics.lineWidth = 4;
    graphics.strokeColor = RIM;
    graphics.circle(centerX, centerY, Math.min(width, height) * 0.12);
    graphics.stroke();
    graphics.strokeColor = INK;
    graphics.circle(centerX, centerY, Math.min(width, height) * 0.12 + 4);
    graphics.stroke();
  }
}
