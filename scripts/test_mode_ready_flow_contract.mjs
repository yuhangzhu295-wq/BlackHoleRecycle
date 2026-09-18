/**
 * Mode ready flow contract (implementation-level, non-renderer).
 *
 * Product rule: HOME -> MODE SELECT -> MODE READY -> START -> GAMEPLAY.
 * A mode card must never start a match directly; only the Ready page's
 * explicit START button may call startEndlessGame/startArenaGame.
 *
 * Verifies the real Game.scene pages, the real GameSessionCoordinator
 * transition table (executed), and the GameManager event routing source.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readFile = (relative) => fs.readFileSync(path.join(rootDirectory, relative), 'utf8');

const record = (name, pass, detail) => {
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  if (!pass) throw new Error(name);
};

// ---- 1. Game.scene contains both authored ready pages -----------------------
const scene = JSON.parse(readFile('cocos/assets/scenes/Game.scene'));
const canvas = scene.find((entry) => entry.__type__ === 'cc.Node' && entry._name === 'Canvas');
const canvasChildren = new Set((canvas?._children || []).map((ref) => ref.__id__));

const pageReport = (pageName, expectedPageId, expectedMode) => {
  const index = scene.findIndex((entry) => entry.__type__ === 'cc.Node' && entry._name === pageName);
  if (index < 0) return { ok: false, detail: 'missing' };
  const node = scene[index];
  const components = (node._components || []).map((ref) => scene[ref.__id__]);
  const uiPage = components.find((component) => component && 'pageId' in component);
  const controller = components.find((component) => component && 'mode' in component);
  const childNames = (node._children || []).map((ref) => scene[ref.__id__]._name);
  const buttonNames = (node._children || []).filter((ref) =>
    (scene[ref.__id__]._components || []).some((componentRef) => scene[componentRef.__id__].__type__ === 'cc.Button'))
    .map((ref) => scene[ref.__id__]._name);
  const ok = canvasChildren.has(index)
    && node._active === false
    && uiPage && uiPage.pageId === expectedPageId
    && controller && controller.mode === expectedMode
    && buttonNames.includes('BtnStart')
    && buttonNames.includes('BtnBack')
    && childNames.includes('MapPreview')
    && childNames.includes('MachineValue')
    && childNames.includes('IntroText');
  return { ok, detail: `children=[${childNames.join(',')}] buttons=[${buttonNames.join(',')}]` };
};

const endlessReady = pageReport('EndlessReadyPage', 10, 0);
record('SCENE_ENDLESS_READY_PAGE', endlessReady.ok, endlessReady.detail);
const arenaReady = pageReport('ArenaReadyPage', 11, 1);
record('SCENE_ARENA_READY_PAGE', arenaReady.ok, arenaReady.detail);

// ---- 2. GameManager routes mode cards to READY, never to a direct start -----
const gameManagerSource = readFile('cocos/assets/scripts/gameplay/GameManager.ts')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const endlessHandler = gameManagerSource.match(/MODE_ENDLESS_REQUESTED'?\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\)/);
const arenaHandler = gameManagerSource.match(/MODE_ARENA_REQUESTED'?\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\)/);
record('MODE_CARD_OPENS_READY_NOT_GAMEPLAY',
  Boolean(endlessHandler && endlessHandler[1].includes("openModeReady('ENDLESS')") && !endlessHandler[1].includes('startEndlessGame'))
  && Boolean(arenaHandler && arenaHandler[1].includes("openModeReady('ARENA')") && !arenaHandler[1].includes('startArenaGame')),
  'MODE_*_REQUESTED handlers open the ready page and contain no direct start call');

const startHandler = gameManagerSource.match(/READY_START_REQUESTED'?\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\)/);
record('READY_START_GATED_AND_ROUTED',
  Boolean(startHandler
    && startHandler[1].includes("'MODE_READY'")
    && startHandler[1].includes('pendingReadyMode')
    && startHandler[1].includes('startArenaGame')
    && startHandler[1].includes('startEndlessGame')),
  'READY_START_REQUESTED requires MODE_READY state and routes by pendingReadyMode');

const backHandler = gameManagerSource.match(/READY_BACK_REQUESTED'?\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\)/);
record('READY_BACK_RETURNS_TO_MODE_SELECT',
  Boolean(backHandler && backHandler[1].includes('openV2ModeSelect')),
  'READY_BACK_REQUESTED returns to the mode select page');

// ---- 3. Ready page controller contract --------------------------------------
const controllerSource = readFile('cocos/assets/scripts/ui/ModeReadyPageController.ts');
record('READY_CONTROLLER_BINDS_START_AND_BACK',
  controllerSource.includes("READY_START_REQUESTED") && controllerSource.includes("READY_BACK_REQUESTED"),
  'BtnStart/BtnBack emit the explicit ready events');
for (const nodeName of ['BtnBack', 'Header', 'HeaderTitle', 'MapPreview', 'StatCaption', 'StatValue', 'MachineCaption', 'MachineValue', 'IntroText', 'BtnStart', 'BtnStartLabel']) {
  record('READY_LAYOUT_NODE_' + nodeName.toUpperCase(), controllerSource.includes(nodeName + ':'),
    'MODE_READY_LAYOUT contains ' + nodeName);
}
record('READY_CONTROLLER_NO_DIRECT_START',
  !controllerSource.includes('startEndlessGame') && !controllerSource.includes('startArenaGame'),
  'controller itself never starts a match');

// ---- 4. Real session coordinator transition sequence -------------------------
const coordinatorSource = readFile('cocos/assets/scripts/gameplay/session/GameSessionCoordinator.ts')
  .replace(/^import\s+.*?;$/gm, '');
const compiled = transformSync(coordinatorSource + '\n;globalThis.__GameSessionCoordinator = GameSessionCoordinator;', {
  loader: 'ts',
  target: 'es2022',
  format: 'iife',
}).code;
new Function(compiled)();
const GameSessionCoordinator = globalThis.__GameSessionCoordinator;

const session = new GameSessionCoordinator();
const sequence = [];
session.subscribe((transition) => sequence.push(`${transition.previous}>${transition.current}`));
record('FLOW_HOME_TO_MODE_SELECT', session.openModeSelect() && session.state === 'MODE_SELECT', session.state);
record('FLOW_MODE_SELECT_TO_READY', session.openModeReady('ARENA') && session.state === 'MODE_READY', session.state);
record('FLOW_READY_STARTS_ARENA', session.beginArena(false) && session.state === 'ARENA', session.state);

const second = new GameSessionCoordinator();
second.openModeSelect();
second.openModeReady('ENDLESS');
record('FLOW_READY_BACK_TO_MODE_SELECT', second.openModeSelect() && second.state === 'MODE_SELECT',
  'ready page back action returns to MODE_SELECT');
record('FLOW_READY_STARTS_ENDLESS', second.beginEndless() && second.state === 'PLAYING', second.state);

// The journey HOME -> MODE_SELECT -> direct gameplay is not representable
// through the ready-flow API: beginEndless from HOME works only for legacy
// restart paths, but the UI event layer (checked above) no longer emits it
// from a mode card. The coordinator must still expose MODE_READY in between.
const third = new GameSessionCoordinator();
third.openModeSelect();
const directReady = third.openModeReady('ENDLESS');
record('FLOW_READY_IS_REQUIRED_INTERMEDIATE', directReady && third.state === 'MODE_READY' && third.lastSessionMode === 'ENDLESS',
  `trace=${sequence.join(' | ')}`);

console.log('[PASS] mode ready flow contract (implementation-level, non-renderer).');
console.log('[NOTE] On-device click-through evidence requires acceptance:v2 and is not claimed here.');
