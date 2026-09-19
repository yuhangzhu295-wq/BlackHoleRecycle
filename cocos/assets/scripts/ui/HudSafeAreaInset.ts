/**
 * HUD safe-area clamp.
 *
 * ## Why this exists
 *
 * The design resolution is 720x1280 (9:16, aspect 0.5625). The UI layer is drawn
 * by an **orthographic** `UICamera` whose `orthoHeight` is 640
 * (= `designHeight / 2`, serialized in `Game.scene -> Canvas/UICamera`), so the
 * UI renders at **fit-height** even though the global view policy is
 * `ResolutionPolicy.FIXED_WIDTH` (`PortraitGameplayCameraController.ts:45-48`).
 *
 * At 390x844 that means the horizontally usable design range is only
 * `640 * (390/844) = +/-295.75`, not `+/-360`. The serialized `EndlessHUD` row
 * spans design `[-319, 303]` (622 px wide) against a 591.5 px safe width, so the
 * coin pill and the pause button are cut by the frame edge.
 *
 * ## Why it must NOT use `view.getVisibleSize()`
 *
 * An earlier revision of this module derived the visible width from
 * `view.getVisibleSize().width`. Under `FIXED_WIDTH` that returns the **full
 * design width (720)**, so the computed half-width equalled the design half-width
 * and the guard below returned early on every frame — the module was a silent
 * no-op and the pills stayed clipped. The scale must come from the UI camera.
 *
 * ## What it does
 *
 * Shifts only the clusters that actually overflow, and shifts every node in a
 * cluster by the same delta so panel/value alignment is preserved. Clusters are
 * found by rectangle overlap rather than by "left half / right half": `BtnPause`
 * needs a -7.3 px shift while `Joystick` needs -34.3 px, and moving them together
 * would push `BtnPause` into `LevelPanel` (they overlap vertically by 17 px).
 *
 * Full-bleed backdrops are excluded from both the clamp and the grouping. They
 * cannot be shifted without tearing a gap, and including them is actively
 * harmful: `TopShade` is 720 px wide and vertically overlaps the whole top row,
 * so grouping it merged the coin pill, the level pill and the pause button into
 * a single 720 px cluster. That cluster then hit the "wider than the safe span"
 * branch and shifted by exactly zero, which made the clamp a silent no-op for
 * the entire top row — the very defect it exists to fix.
 *
 * It never creates UI, never touches gameplay state, and is idempotent: the first
 * observed position of each node is remembered as its base, so repeated calls
 * cannot accumulate drift.
 *
 * ## Known shortfall
 *
 * The locked rule is "lateral padding >= 24 px for any interactive element". That
 * is **not reachable** at 390x844 with the current authored row: a 24 px margin
 * needs `S = 295.75 - 24/0.65938 = 259.3` design px, which forces `BtnPause` left
 * by 43.7 px into `LevelPanel`. The maximum collision-free margin is ~4.4 px.
 * This clamp therefore targets **zero clipping** (`SAFE_AREA_MARGIN_SCREEN_PX = 0`),
 * which removes the visible defect without inventing overlaps; the padding
 * shortfall is recorded in `design-lock.md` as requiring an authoring pass.
 */
import { Camera, Node, UITransform, Vec3, view } from 'cc';

/**
 * Design-space lateral padding, in SCREEN px. See "Known shortfall" above: 24 is
 * the locked target but is not collision-free at 390x844, so this clamp enforces
 * zero clipping instead of shipping a layout that overlaps itself.
 */
const SAFE_AREA_MARGIN_SCREEN_PX = 0;

/** Rect-overlap tolerance in design px. */
const OVERLAP_EPSILON = 1;

interface SafeAreaState {
  /** First observed position per child, used as the shift origin. */
  readonly base: Map<Node, Vec3>;
  /** Last computed pass, for the read-only QA diagnostic. */
  last: HudSafeAreaPass | null;
}

export interface HudSafeAreaGroup {
  readonly names: readonly string[];
  readonly left: number;
  readonly right: number;
  readonly shift: number;
}

export interface HudSafeAreaPass {
  readonly designHalfWidth: number;
  readonly visibleHalfWidth: number;
  readonly safeHalfWidth: number;
  readonly scale: number | null;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly childCount: number;
  readonly itemCount: number;
  readonly skippedFullBleed: readonly string[];
  readonly earlyReturn: boolean;
  readonly groups: readonly HudSafeAreaGroup[];
}

/**
 * Read-only view of the last clamp pass. Exists because the clamp can be a
 * silent no-op for reasons that are invisible from the rendered frame — a wrong
 * frame size, an early return, or a full-bleed backdrop merging the whole row
 * into one unshiftable group. Without this the only symptom is "the pills still
 * look clipped", which is not diagnosable.
 */
export function getHudSafeAreaPass(host: Node): HudSafeAreaPass | null {
  return states.get(host)?.last || null;
}

const states = new WeakMap<Node, SafeAreaState>();

interface Item {
  readonly node: Node;
  readonly base: Vec3;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
}

function uiCameraOf(host: Node): Camera | null {
  const scene = host.scene;
  if (!scene) return null;
  const canvas = scene.getChildByName('Canvas');
  const uiCamera = canvas?.getChildByName('UICamera');
  return uiCamera?.getComponent(Camera) || null;
}

/**
 * Frame px per design px for the UI layer, taken from the orthographic UI
 * camera. Falls back to the authored invariant (`orthoHeight = designHeight / 2`)
 * when the camera is not reachable.
 */
export function hudDesignToFrameScale(host: Node): number | null {
  const frame = view.getFrameSize();
  if (!(frame.height > 0)) return null;
  const orthoHeight = uiCameraOf(host)?.orthoHeight;
  if (orthoHeight !== undefined && orthoHeight > 0) {
    return frame.height / (2 * orthoHeight);
  }
  const design = view.getDesignResolutionSize();
  if (design.height > 0) return frame.height / design.height;
  return null;
}

/**
 * Half-width, in design units, of the region the UI camera actually shows.
 * Equals the design half-width on a 9:16 screen and shrinks on narrower ones.
 */
export function hudVisibleHalfWidth(host: Node): number {
  const transform = host.getComponent(UITransform);
  const designHalfWidth = (transform?.width || 720) * 0.5;
  const frame = view.getFrameSize();
  const scale = hudDesignToFrameScale(host);
  if (!scale || !(frame.width > 0)) return designHalfWidth;
  const visibleHalfWidth = frame.width / scale / 2;
  if (!Number.isFinite(visibleHalfWidth) || visibleHalfWidth <= 0) return designHalfWidth;
  return Math.min(designHalfWidth, visibleHalfWidth);
}

/** The x-range every HUD child must stay inside, in design units. */
export function hudSafeHalfWidth(host: Node): number {
  const scale = hudDesignToFrameScale(host) || 1;
  return hudVisibleHalfWidth(host) - SAFE_AREA_MARGIN_SCREEN_PX / scale;
}

/** Group children whose rectangles overlap, so a cluster moves as one unit. */
function buildGroups(items: Item[]): Item[][] {
  const parent = items.map((_item, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let cursor = index;
    while (parent[cursor] !== cursor) {
      const next = parent[cursor];
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      const overlapsX = a.left - OVERLAP_EPSILON < b.right && b.left - OVERLAP_EPSILON < a.right;
      const overlapsY = a.bottom - OVERLAP_EPSILON < b.top && b.bottom - OVERLAP_EPSILON < a.top;
      if (overlapsX && overlapsY) union(i, j);
    }
  }
  const buckets = new Map<number, Item[]>();
  items.forEach((item, index) => {
    const root = find(index);
    const bucket = buckets.get(root);
    if (bucket) bucket.push(item);
    else buckets.set(root, [item]);
  });
  // Do NOT write `[...buckets.values()]`. The Cocos build targets ES5, where
  // that spread compiles to `[].concat(buckets.values())` — and `concat` does
  // not spread iterators, so it appends the Map *iterator itself* as a single
  // element. The caller then loops once with a MapIterator as the "group":
  // `for (const item of group)` yields the bucket ARRAYS (so `item.left` is
  // undefined and the union stays at +-Infinity) and `group.map(...)` silently
  // returns a lazy iterator instead of a name list. Net effect: every group
  // computed a shift of exactly 0 and the clamp never moved anything, while
  // looking correct in source. `Map.forEach` avoids the whole class of bug.
  const result: Item[][] = [];
  buckets.forEach((bucket) => result.push(bucket));
  return result;
}

/**
 * Clamp the HUD's direct children into the region the UI camera can actually
 * show. Safe to call every frame; it does nothing once everything fits.
 */
export function applyHudSafeAreaInset(host: Node): void {
  if (!host?.isValid) return;

  const transform = host.getComponent(UITransform);
  const designHalfWidth = (transform?.width || 720) * 0.5;
  const safeHalfWidth = hudSafeHalfWidth(host);
  const frame = view.getFrameSize();
  let state = states.get(host);
  if (!state) {
    state = { base: new Map(), last: null };
    states.set(host, state);
  }

  const record = (pass: Partial<HudSafeAreaPass>): void => {
    state!.last = {
      designHalfWidth,
      visibleHalfWidth: hudVisibleHalfWidth(host),
      safeHalfWidth,
      scale: hudDesignToFrameScale(host),
      frameWidth: frame.width,
      frameHeight: frame.height,
      childCount: host.children.length,
      itemCount: 0,
      skippedFullBleed: [],
      earlyReturn: false,
      groups: [],
      ...pass,
    };
  };

  // Nothing can overflow when the safe range already covers the whole design.
  if (safeHalfWidth >= designHalfWidth) {
    record({ earlyReturn: true });
    return;
  }

  const items: Item[] = [];
  const skippedFullBleed: string[] = [];
  for (const child of host.children) {
    if (!child.isValid) continue;
    const childTransform = child.getComponent(UITransform);
    if (!childTransform) continue;
    const width = childTransform.width || 0;
    const height = childTransform.height || 0;
    if (!(width > 0) || !(height > 0)) continue;
    // Full-bleed backdrops are not clampable: shifting one would tear a gap
    // along the edge it is meant to cover. They must also be kept OUT of the
    // overlap grouping, because `TopShade` is 720 px wide and vertically
    // overlaps every top-row element — including it merges the coin pill, the
    // level pill and the pause button into one 720 px group, which then takes
    // the "wider than the safe span" branch and shifts by exactly zero. That
    // made the whole clamp a silent no-op for the top row.
    if (width >= designHalfWidth * 2 - OVERLAP_EPSILON) {
      skippedFullBleed.push(child.name);
      continue;
    }
    let base = state.base.get(child);
    if (!base) {
      base = child.position.clone();
      state.base.set(child, base);
    }
    const anchorX = childTransform.anchorX ?? 0.5;
    const anchorY = childTransform.anchorY ?? 0.5;
    // Convert the anchor-relative origin into an absolute design-space rect.
    const left = base.x - anchorX * width;
    const right = left + width;
    const bottom = base.y - anchorY * height;
    const top = bottom + height;
    items.push({ node: child, base, left, right, bottom, top });
  }

  const groups: HudSafeAreaGroup[] = [];
  for (const group of buildGroups(items)) {
    let unionLeft = Infinity;
    let unionRight = -Infinity;
    for (const item of group) {
      if (item.left < unionLeft) unionLeft = item.left;
      if (item.right > unionRight) unionRight = item.right;
    }
    const width = unionRight - unionLeft;
    let shift = 0;
    if (width > safeHalfWidth * 2) {
      // Wider than the safe span: centre it rather than clipping one side.
      shift = -(unionLeft + unionRight) * 0.5;
    } else if (unionLeft < -safeHalfWidth) {
      shift = -safeHalfWidth - unionLeft;
    } else if (unionRight > safeHalfWidth) {
      shift = -(unionRight - safeHalfWidth);
    }
    groups.push({ names: group.map((item) => item.node.name), left: unionLeft, right: unionRight, shift });
    if (shift === 0) continue;
    for (const item of group) {
      item.node.setPosition(item.base.x + shift, item.base.y, item.base.z);
    }
  }

  record({ itemCount: items.length, skippedFullBleed, groups });
}
