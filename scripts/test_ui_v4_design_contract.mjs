/**
 * UI V4 Expanded design contract (implementation-level, non-renderer).
 *
 * Locks the ten-page reference set and the code facts the references depend on.
 * Everything asserted here is read from the real repository: the real reference
 * files, the real design documents, and the real Cocos sources.
 *
 * It deliberately does NOT claim a visual PASS. Portrait CDP acceptance and a
 * human/Kimi-K3 visual review remain required and are recorded elsewhere.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readFile = (relative) => fs.readFileSync(path.join(rootDirectory, relative), 'utf8');
const readBuffer = (relative) => fs.readFileSync(path.join(rootDirectory, relative));
const exists = (relative) => fs.existsSync(path.join(rootDirectory, relative));

const record = (name, pass, detail) => {
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  if (!pass) throw new Error(name);
};

const V4_DIR = 'cocos/docs/design-reference/ui-v4-expanded';
const V3_DIR = 'cocos/docs/design-reference/ui-v3';

const INHERITED = [
  ['01-arena-gameplay.png', 'arena-hud-reference.png'],
  ['02-revive.png', 'revive-reference.png'],
  ['03-mode-select.png', 'mode-select-reference.png'],
  ['04-settlement.png', 'settlement-reference.png'],
];
const RENDERED = [
  '05-home.png',
  '06-endless-ready.png',
  '07-arena-ready.png',
  '08-endless-gameplay.png',
  '09-large-target-suction.png',
  '10-tier-upgrade-feedback.png',
];
const DOCUMENTS = [
  'design-lock.md',
  'design-lineage.md',
  'ui-gap-audit.md',
  'gameplay-composition-contract.md',
  'implementation-map.md',
];

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const pngSize = (buffer) => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) });

// ---- 1. the ten reference files exist with the locked names -----------------
const allReferences = [...INHERITED.map(([target]) => target), ...RENDERED];
const missing = allReferences.filter((name) => !exists(`${V4_DIR}/${name}`));
record('V4_REFERENCE_SET_PRESENT', missing.length === 0,
  missing.length === 0 ? `${allReferences.length} files, one page each` : `missing ${missing.join(', ')}`);

// ---- 2. pages 01-04 are byte-identical to the V3 masters -------------------
for (const [target, source] of INHERITED) {
  const targetHash = sha256(readBuffer(`${V4_DIR}/${target}`));
  const sourceHash = sha256(readBuffer(`${V3_DIR}/${source}`));
  record(`V4_INHERITS_V3_${target.replace(/\.png$/, '').toUpperCase()}`,
    targetHash === sourceHash && exists(`${V3_DIR}/${source}`),
    `sha256 ${targetHash.slice(0, 12)} matches ui-v3/${source}`);
}

// ---- 3. pages 05-10 are one 720x1280 page each -----------------------------
for (const name of RENDERED) {
  const size = pngSize(readBuffer(`${V4_DIR}/${name}`));
  record(`V4_CANVAS_${name.replace(/\.png$/, '').toUpperCase()}`,
    size.width === 720 && size.height === 1280,
    `${size.width}x${size.height}`);
}

// ---- 4. the manifest records real provenance -------------------------------
const manifest = JSON.parse(readFile(`${V4_DIR}/reference-manifest.json`));
record('V4_MANIFEST_TEN_ENTRIES', manifest.references.length === 10,
  `${manifest.references.length} entries, imageGenerationModel=${manifest.imageGenerationModel}`);
record('V4_MANIFEST_PROVENANCE_SPLIT',
  manifest.references.filter((entry) => entry.provenance === 'V3_MASTER_COPY').length === 4
  && manifest.references.filter((entry) => entry.provenance === 'DETERMINISTIC_LAYOUT_RENDER').length === 6,
  '4 inherited masters + 6 deterministic layout renders');
record('V4_NO_GENERATED_ART_CLAIM', manifest.imageGenerationModel === 'NONE',
  'no image-generation model is claimed for this set');

// The manifest records a sha256 and a byte count per reference. Nothing else
// cross-checks those against the bytes on disk, so a re-render that forgot to
// regenerate the manifest — or a manifest regenerated against a stale tree —
// would leave the two silently disagreeing while every other assertion passed.
const drifted = [];
for (const entry of manifest.references) {
  const buffer = readBuffer(`${V4_DIR}/${entry.file}`);
  const actualHash = sha256(buffer);
  if (actualHash !== entry.sha256 || buffer.length !== entry.bytes) {
    drifted.push(`${entry.file} manifest=${entry.sha256.slice(0, 12)}/${entry.bytes}`
      + ` actual=${actualHash.slice(0, 12)}/${buffer.length}`);
  }
}
record('V4_MANIFEST_MATCHES_ARTIFACTS', drifted.length === 0,
  drifted.length === 0
    ? `all 10 recorded sha256 + byte counts match the files on disk`
    : drifted.join('; '));

// A V3_MASTER_COPY entry claims byte identity with its source. The hash gate
// above only proves the copy is self-consistent with the manifest, so the
// source side has to be checked too or a tampered master would go unnoticed.
const masterDrift = manifest.references
  .filter((entry) => entry.provenance === 'V3_MASTER_COPY')
  .filter((entry) => {
    const sourcePath = `cocos/docs/design-reference/${entry.source}`;
    if (!exists(sourcePath)) return true;
    return sha256(readBuffer(sourcePath)) !== entry.sha256;
  })
  .map((entry) => entry.file);
record('V4_MASTER_COPY_SOURCE_INTACT', masterDrift.length === 0,
  masterDrift.length === 0
    ? 'every V3_MASTER_COPY entry still byte-matches its ui-v3 source'
    : `drifted: ${masterDrift.join(', ')}`);

// The 08 visual-share bands. The runtime screen-space probe is NOT admissible
// here (gameplay-composition-contract.md §2.2); this is the reference band only.
const BANDS = { open: [55, 65], environment: [15, 20], static: [10, 15], dynamic: [5, 10] };
const budget = manifest.references.find((entry) => entry.file === '08-endless-gameplay.png')?.spaceBudget;
const budgetDetail = [];
const outOfBand = [];
for (const [key, [min, max]] of Object.entries(BANDS)) {
  const value = budget?.[`${key}Share`];
  if (typeof value !== 'number') {
    outOfBand.push(`${key}:missing`);
    continue;
  }
  const percent = value * 100;
  budgetDetail.push(`${key} ${percent.toFixed(1)}%`);
  if (!(percent >= min && percent <= max)) outOfBand.push(`${key} ${percent.toFixed(1)}%`);
}
record('V4_REFERENCE_08_SPACE_BUDGET_IN_BAND', outOfBand.length === 0,
  outOfBand.length === 0
    ? budgetDetail.join(' / ')
    : `out of band: ${outOfBand.join(', ')}`);

// ---- 5. the design documents exist and are substantive ---------------------
for (const name of DOCUMENTS) {
  const present = exists(`${V4_DIR}/${name}`);
  const length = present ? readFile(`${V4_DIR}/${name}`).length : 0;
  record(`V4_DOC_${name.replace(/\.md$/, '').replace(/-/g, '_').toUpperCase()}`,
    present && length > 1200, `${length} chars`);
}

// ---- 6. Ready pages carry the locked copy ----------------------------------
const ready = readFile('cocos/assets/scripts/ui/ModeReadyPageController.ts');
record('V4_READY_ENDLESS_COPY',
  ready.includes('不断吞噬 · 不断成长') && ready.includes('解锁更大目标'),
  '06 Endless Ready shows the two locked lines');
const arenaRules = ['• 8 人', '• 3:00', '• 吞噬成长', '• 淘汰弱小玩家', '• 躲避更大玩家'];
record('V4_READY_ARENA_RULES',
  arenaRules.every((rule) => ready.includes(rule)),
  `07 Arena Ready shows all five rules: ${arenaRules.join(' / ')}`);
record('V4_READY_REAL_MAP_PREVIEW',
  ready.includes('MapPreviewGraphic') && ready.includes('MapPreviewKind'),
  'MapPreview is a real drawn preview, not the mode-card artwork');
record('V4_READY_SINGLE_START_ROUTE',
  ready.includes("'READY_START_REQUESTED'") && ready.includes("'READY_BACK_REQUESTED'"),
  'only BtnStart starts a run; BtnBack returns');

// ---- 7. Endless HUD stays minimal ------------------------------------------
const endlessHud = readFile('cocos/assets/scripts/ui/EndlessHUDController.ts');
const forbiddenHudFeatures = ['Leaderboard', 'QuestBar', 'ShopButton', 'BtnShop', 'BtnQuest', 'Elimination'];
const leaked = forbiddenHudFeatures.filter((token) => endlessHud.includes(token));
record('V4_ENDLESS_HUD_MINIMAL', leaked.length === 0,
  leaked.length === 0 ? 'no leaderboard / quest / shop / elimination chrome' : `leaked ${leaked.join(', ')}`);
record('V4_ENDLESS_HUD_UPGRADE_WIRED',
  endlessHud.includes('TierUpgradePresenter') && endlessHud.includes('.enable()'),
  'the upgrade banner is wired into the Endless HUD');

// ---- 8. Arena HUD also carries the upgrade feedback ------------------------
const arenaHud = readFile('cocos/assets/scripts/ui/ArenaHUDController.ts');
record('V4_ARENA_HUD_UPGRADE_WIRED',
  arenaHud.includes('TierUpgradePresenter') && arenaHud.includes('.enable()'),
  'the upgrade banner is wired into the Arena HUD');

// ---- 9. tier lock feedback is unchanged and still truthful ------------------
const compressible = readFile('cocos/assets/scripts/gameplay/CompressibleObject.ts');
record('V4_TIER_LOCK_TEXT', compressible.includes('需要 LV.'), 'lock feedback still reads 需要 LV.X');
// The file mentions `constructionCone` only in the comment that documents its
// removal, so assert on the mechanism instead: the indicator must be a Label
// node and no mesh/primitive may be built for it.
record('V4_TIER_LOCK_NO_CONE_HAT',
  compressible.includes("new Node('TierLockWarning')")
  && !compressible.includes('getConeMesh')
  && !compressible.includes('MeshFactory'),
  'lock feedback is the TierLockWarning Label node, never a cone/hat mesh');
record('V4_TIER_LOCK_NEVER_SWALLOWS',
  compressible.includes("if (this.template.tier > machineMaxTier && !isMagnetStorm)"),
  'a locked target still cannot enter the formal swallow chain');
record('V4_SUCTION_PHASE_EXPOSED',
  compressible.includes('getSuctionPhase') && compressible.includes('LOCKED_LEVEL'),
  'the real phase chain is readable for runtime evidence');
record('V4_LARGE_TARGET_STRAIN',
  compressible.includes('strainSeconds') && compressible.includes('this.template.tier >= 4'),
  'reference 09 legibility: tier 4/5 visibly fights the pull');

// ---- 10. the upgrade banner is short and non-blocking ----------------------
const upgrade = readFile('cocos/assets/scripts/ui/TierUpgradePresenter.ts');
record('V4_UPGRADE_BANNER_COPY',
  upgrade.includes('升级！') && upgrade.includes('解锁更大型目标') && upgrade.includes('LV.${level}'),
  'banner shows 升级！ / LV.X <title> / 解锁更大型目标');
const durationMatch = /BANNER_DURATION_SECONDS\s*=\s*([0-9.]+)/.exec(upgrade);
const duration = durationMatch ? Number(durationMatch[1]) : Number.NaN;
record('V4_UPGRADE_BANNER_TRANSIENT', duration > 0 && duration <= 2,
  `lifetime ${duration}s (lock requires <= 2s, no full-screen page)`);
record('V4_UPGRADE_IGNORES_BOTS', upgrade.includes('isBotPresentation'),
  'a 1v7 match never announces an opponent upgrade');
record('V4_UPGRADE_REUSES_HUD_GLYPH',
  upgrade.includes('instantiate(template)') && upgrade.includes('LabelOutline'),
  'clones an editor-saved Label instead of building a new glyph path');
record('V4_BOT_IDENTITY_ACCESSOR',
  readFile('cocos/assets/scripts/machine/BlackHoleMachine.ts').includes('public isBotPresentation()'),
  'presentation-layer listeners can distinguish a bot without private access');

// ---- 11. distribution cadence matches the composition contract -------------
const chunkConfig = readFile('cocos/assets/scripts/world/ChunkConfig.ts');
const hotspotMatch = /clusterBudget\s*=\s*Math\.max\(2,\s*Math\.round\(count \* (0\.[0-9]+)\)\)/.exec(chunkConfig);
const groupMatch = /groupBudget\s*=\s*Math\.round\(count \* (0\.[0-9]+)\)/.exec(chunkConfig);
const hotspotShare = hotspotMatch ? Number(hotspotMatch[1]) : Number.NaN;
const groupShare = groupMatch ? Number(groupMatch[1]) : Number.NaN;
record('V4_HOTSPOT_BAND', hotspotShare >= 0.1 && hotspotShare <= 0.15,
  `hotspot share ${hotspotShare} inside 0.10-0.15`);
record('V4_SMALL_GROUP_BAND', groupShare >= 0.25 && groupShare <= 0.35,
  `small-group share ${groupShare} inside 0.25-0.35`);
record('V4_SINGLE_BAND', 1 - hotspotShare - groupShare >= 0.5 && 1 - hotspotShare - groupShare <= 0.6,
  `single share ${(1 - hotspotShare - groupShare).toFixed(2)} inside 0.50-0.60`);
record('V4_SPACING_FLOORS',
  chunkConfig.includes('tier <= ObjectTier.T1 ? 2.5 : tier <= ObjectTier.T3 ? 4.0 : 8.0'),
  'T1 >= 2.5m, T2/T3 >= 4m, T4/T5 >= 8m');
record('V4_TIER_WEIGHTS_DESCENDING',
  /\[ObjectTier\.T1, 50\][\s\S]*\[ObjectTier\.T2, 25\][\s\S]*\[ObjectTier\.T3, 15\][\s\S]*\[ObjectTier\.T4, 8\][\s\S]*\[ObjectTier\.T5, 2\]/.test(chunkConfig),
  'T1 50 / T2 25 / T3 15 / T4 8 / T5 2');
record('V4_ASPIRATIONAL_VISIBLE_TARGETS',
  chunkConfig.includes('aspirational') && chunkConfig.includes('template.tier > maxRegionTier'),
  'a low-level player always sees a T4/T5 it cannot yet swallow');
// Uniform sampling over the aspirational pool made T3 and T5 equally likely and
// allowed two T5 in one cell, breaking "T5: 0-1 obvious large target".
record('V4_ASPIRATIONAL_LADDER_WEIGHTED',
  /\[ObjectTier\.T3, 4\][\s\S]*\[ObjectTier\.T4, 3\][\s\S]*\[ObjectTier\.T5, 1\]/.test(chunkConfig),
  'aspirational sampling is weighted T3 4 / T4 3 / T5 1 so the ladder reads T3 > T4 > T5');
record('V4_ASPIRATIONAL_T5_CAPPED',
  chunkConfig.includes('aspirationalT5Placed >= 1'),
  'at most one T5 aspirational target per cell');

// ---- 12. the runtime reports the composition buckets ----------------------
const world = readFile('cocos/assets/scripts/world/InfiniteWorldManager.ts');
record('V4_COMPOSITION_DIAGNOSTIC',
  world.includes('gameplayComposition') && world.includes('computeCompositionBuckets'),
  'opening-cell buckets (singles / smallGroups / hotspots) are exposed at runtime');
// The authored opening cell runs no CellItemGenerator, so it needs its own pass
// or it ships with tierCounts {1:20, 2:1, 3:0, 4:0, 5:0} and no T4/T5 at all.
record('V4_AUTHORED_CELL_EXPOSES_T4_T5',
  world.includes('populateAuthoredAspirational')
  && world.includes('aspirational_authored_')
  && /populateAuthoredContent[\s\S]*populateAuthoredAspirational/.test(world),
  'the authored opening cell runs the aspirational pass and exposes a T4 and a T5 target');
record('V4_COMPOSITION_MEASUREMENT_DECLARED',
  world.includes('PLACEMENT_TAGS') && world.includes('PROXIMITY_FALLBACK'),
  'both the generator-tag and the proximity measurement are reported');

// ---- 14. HUD chrome stays inside the 390x844 crop --------------------------
// The 720x1280 design is 9:16; a 390x844 device is narrower, so the UI camera
// (orthographic, orthoHeight 640 = designHeight/2) only shows +/-295.75 design px
// and the coin pill / pause button were cut by the frame edge.
//
// The clamp must derive that width from the UI camera. It must NOT read
// `view.getVisibleSize()`: under this project's global ResolutionPolicy.FIXED_WIDTH
// that returns the full design width (720), which makes the clamp a silent no-op.
const safeArea = readFile('cocos/assets/scripts/ui/HudSafeAreaInset.ts');
// Strip comments before asserting: the module's own docstring explains why
// `view.getVisibleSize()` must not be used, and that prose would otherwise
// satisfy a naive substring check.
const safeAreaCode = safeArea.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
record('V4_HUD_SAFE_AREA_INSET',
  safeArea.includes('export function applyHudSafeAreaInset')
  && safeAreaCode.includes('orthoHeight')
  && !safeAreaCode.includes('view.getVisibleSize()')
  && readFile('cocos/assets/scripts/ui/EndlessHUDController.ts').includes('applyHudSafeAreaInset(this.node)')
  && readFile('cocos/assets/scripts/ui/ArenaHUDController.ts').includes('applyHudSafeAreaInset(this.node)'),
  'both HUDs clamp their edge chrome using the UI camera visible width, not view.getVisibleSize()');

// The mass readout must not contain a space character. `MassValue` is fontSize
// 18 and its serialized `cc.LabelOutline` carries no `_width`, so it uses the
// default 2 and each glyph's outline grows 2px into an adjacent ~4px space and
// fills it. Both spaces did this: `质量 56150 kg` rendered as `质量-56150-kg`,
// and after only the unit space was removed the remaining one still rendered
// `质量-3715kg`, which reads like a negative mass in the real 390x844 frame
// (verified by cropping the reference-08 PNG). Asserted on the template literal
// itself rather than on a rendered string, so the guard cannot be satisfied by
// a comment, and on both HUDs because both render a mass readout.
const massLabelOffenders = [];
for (const [hudName, hudSource] of [
  ['EndlessHUDController', readFile('cocos/assets/scripts/ui/EndlessHUDController.ts')],
  ['ArenaHUDController', readFile('cocos/assets/scripts/ui/ArenaHUDController.ts')],
]) {
  const massTemplate = /setLabel\(\s*'MassValue'\s*,\s*`([^`]*)`/.exec(hudSource);
  if (!massTemplate) massLabelOffenders.push(`${hudName}: no MassValue template literal`);
  else if (/ /.test(massTemplate[1])) massLabelOffenders.push(`${hudName}: ${JSON.stringify(massTemplate[1])}`);
}
record('V4_MASS_LABEL_NO_BRIDGED_SPACE', massLabelOffenders.length === 0,
  massLabelOffenders.length === 0
    ? 'neither HUD mass readout contains a space the outline can bridge into a hyphen'
    : `the outline would bridge the space in ${massLabelOffenders.join('; ')}`);

// The clamp's grouping must not use an iterator spread. `cocos/tsconfig.json`
// declares `target: ES2022`, so `tsc --noEmit` is happy — but the Creator
// pipeline downlevels to ES5, where `[...map.values()]` becomes
// `[].concat(map.values())`. `concat` does not spread iterators, so it appends
// the Map *iterator* as a single element; the caller then loops once with an
// iterator as the "group", reads `item.left` off bucket ARRAYS (always
// undefined, so the union stays at +-Infinity) and computes a shift of exactly
// 0. The clamp silently never moved anything while the source looked correct.
// `SaveService.ts:154` documents the same trap for `[...new Set(...)]`.
const iteratorSpread = [
  /\[\.\.\.[^\][()]*\.(?:values|keys|entries)\(\)\]/,
  /\[\.\.\.new (?:Set|Map)\(/,
];
// The two patterns above only cover `[...x.values()]` and `[...new Set()]`. A
// bare `[...groups]` where `groups` is a locally declared Map/Set is the same
// defect — `[].concat(groups)` appends the Map itself as one element — and it
// slipped past this guard once. So also collect every name the file binds to
// (or annotates as) a Map/Set and flag a direct spread of that name. Array
// spreads stay legal, which is why this cannot be a blanket identifier rule.
const iterableBinding = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)[^=;\n]*=\s*new\s+(?:Map|Set)\s*[<(]/g;
const iterableAnnotation = /([A-Za-z_$][\w$]*)\s*:\s*(?:readonly\s+)?(?:Readonly)?(?:Map|Set)\s*</g;
const spreadOffenders = [];
const scanSpread = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) { scanSpread(full); continue; }
    if (!entry.name.endsWith('.ts')) continue;
    const text = fs.readFileSync(full, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const iterableNames = new Set();
    for (const match of text.matchAll(iterableBinding)) iterableNames.add(match[1]);
    for (const match of text.matchAll(iterableAnnotation)) iterableNames.add(match[1]);
    const spreadsIterable = iteratorSpread.some((pattern) => pattern.test(text))
      || [...iterableNames].some((name) => new RegExp(`\\[\\.\\.\\.(?:this\\.)?${name}\\]`).test(text));
    if (spreadsIterable) {
      spreadOffenders.push(path.relative(rootDirectory, full));
    }
  }
};
scanSpread(path.join(rootDirectory, 'cocos', 'assets', 'scripts'));
record('V4_NO_ES5_UNSAFE_ITERATOR_SPREAD', spreadOffenders.length === 0,
  spreadOffenders.length === 0
    ? 'no [...x.values()] / [...new Set()] spread that Cocos lowers to a broken [].concat'
    : `would break in the ES5 bundle: ${spreadOffenders.join(', ')}`);

// ---- 13. no parallel V2 subsystems were introduced -------------------------
const forbiddenNames = ['UIRouterV2', 'HUDV2', 'VehicleV2', 'SuctionV2', 'WorldV2'];
const scriptRoots = ['cocos/assets/scripts'];
const offending = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.ts')) {
      const text = fs.readFileSync(full, 'utf8');
      for (const token of forbiddenNames) {
        if (text.includes(token)) offending.push(`${full.replace(rootDirectory + path.sep, '')}:${token}`);
      }
    }
  }
};
for (const scriptRoot of scriptRoots) walk(path.join(rootDirectory, scriptRoot));
record('V4_NO_PARALLEL_SUBSYSTEMS', offending.length === 0,
  offending.length === 0 ? 'no UIRouterV2 / HUDV2 / VehicleV2 / SuctionV2 / WorldV2' : offending.join(', '));

console.log('[PASS] UI V4 expanded design contract (implementation-level, non-renderer).');
console.log('[NOTE] 08 space budget and the ten references still require a real 390x844 runtime capture and a visual review; this test does not claim either.');
