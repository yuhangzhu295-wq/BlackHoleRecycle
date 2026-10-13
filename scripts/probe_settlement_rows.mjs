/**
 * Judge the Arena settlement board against DESIGN_06's four-column row.
 *
 * The reference's rows are rank badge, coloured hole avatar, name with a 称号
 * underneath, and mass on the right. A screenshot shows whether it *looks* right;
 * this says whether each column is actually there, active, and carrying the value
 * it should -- a title node that exists but is inactive, or a label whose string
 * was never bound, both look like "the row is fine" at a glance.
 *
 * It also checks the two properties a single asset tinted per row can get wrong:
 * that the seven avatar colours are actually distinct, and that the void stays
 * dark under the brightest of them.
 *
 * Usage: node scripts/probe_settlement_rows.mjs [WxH] [--out=path.png]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');

const sizeArg = process.argv[2] && /^\d+x\d+$/.test(process.argv[2]) ? process.argv[2] : '390x844';
const [WIDTH, HEIGHT] = sizeArg.split('x').map(Number);
const outArg = process.argv.find((a) => a.startsWith('--out='));
const shotPath = outArg
  ? path.resolve(outArg.split('=')[1])
  : path.join(repoRoot, 'artifacts', 'qa', 'v12', 'settlement', `rows-${sizeArg}.png`);
mkdirSync(path.dirname(shotPath), { recursive: true });

function serve(root) {
  return new Promise((resolve) => {
    const server = createServer((req, rep) => {
      const u = new URL(req.url, 'http://127.0.0.1').pathname;
      const safe = path.normalize(u).replace(/^(\.\.[/\\])+/, '');
      let fp = path.join(root, safe === '/' ? 'index.html' : safe);
      if (!existsSync(fp) || statSync(fp).isDirectory()) {
        if (statSync(fp).isDirectory() && existsSync(path.join(fp, 'index.html'))) fp = path.join(fp, 'index.html');
        else { rep.writeHead(404); rep.end('404'); return; }
      }
      const ct = {
        '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
        '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
      }[path.extname(fp).toLowerCase()] || 'application/octet-stream';
      rep.writeHead(200, { 'Content-Type': ct });
      rep.end(readFileSync(fp));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { server, port } = await serve(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});
const problems = [];
try {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 60000 });
  await sleep(1200);

  const cdp = await context.newCDPSession(page);
  const rect = await page.locator('#GameCanvas').evaluate((c) => {
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const snapshot = () => page.evaluate(() => window.__BHR_QA__.snapshot());
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(650);
  };
  const at = (node, label) => {
    if (!node?.active || !node?.screen) throw new Error(`invisible: ${label} ${JSON.stringify(node)}`);
    return [rect.left + rect.width * node.screen.x, rect.top + rect.height * node.screen.y];
  };
  const waitState = (want, ms = 30000) => page.waitForFunction(
    (state) => window.__BHR_QA__.snapshot().gameState === state, want, { timeout: ms });

  let s = await snapshot();
  await tap(...at(s.ui.start, 'start'));
  await waitState('MODE_SELECT');
  s = await snapshot();
  await tap(...at(s.ui.modeArena, 'modeArena'));
  await waitState('MODE_READY');
  s = await snapshot();
  await tap(...at((s.ui.arenaReady || s.ui.endlessReady).start, 'arenaReady.start'));
  await waitState('ARENA');
  // Let the field separate and grow so the rows carry real, differing values.
  await sleep(9000);
  s = await snapshot();
  await tap(...at(s.ui.arenaHUD.pauseButton, 'arenaHUD.pauseButton'));
  await sleep(700);
  s = await snapshot();
  await tap(...at(s.ui.formalPages.pauseSettle, 'pauseSettle'));
  await waitState('SETTLEMENT');
  await sleep(1500);

  const report = await page.evaluate(() => {
    const scene = (globalThis.cc || globalThis.__cc__)?.director?.getScene?.() || null;
    if (!scene) return { error: 'no engine global' };
    const find = (root, name) => {
      if (root.name === name) return root;
      for (const child of root.children) {
        const hit = find(child, name);
        if (hit) return hit;
      }
      return null;
    };
    const page = find(scene, 'SettlementPage');
    if (!page) return { error: 'SettlementPage not in the live tree' };

    const describe = (node) => {
      const transform = node.getComponent('cc.UITransform');
      const label = node.getComponent('cc.Label');
      const sprite = node.getComponent('cc.Sprite');
      const world = node.worldPosition;
      return {
        name: node.name,
        active: node.activeInHierarchy,
        width: transform ? Math.round(transform.width) : null,
        height: transform ? Math.round(transform.height) : null,
        local: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
        world: world ? { x: Math.round(world.x), y: Math.round(world.y) } : null,
        string: label ? label.string : null,
        fontSize: label ? label.fontSize : null,
        align: label ? label.horizontalAlign : null,
        colour: label
          ? `${label.color.r},${label.color.g},${label.color.b}`
          : sprite ? `${sprite.color.r},${sprite.color.g},${sprite.color.b}` : null,
        rgb: label
          ? [label.color.r, label.color.g, label.color.b]
          : sprite ? [sprite.color.r, sprite.color.g, sprite.color.b] : null,
        alpha: label ? label.color.a : sprite ? sprite.color.a : null,
        spriteFrame: sprite?.spriteFrame?.name || null,
      };
    };

    const names = [];
    for (let rank = 1; rank <= 5; rank += 1) {
      names.push(`ArenaRankRow_${rank}`, `ArenaRankBadge_${rank}`, `ArenaRankAvatar_${rank}`,
        `ArenaRankName_${rank}`, `ArenaRankTitle_${rank}`, `ArenaRankScore_${rank}`);
    }
    names.push('ArenaPlayerRow', 'ArenaPlayerBadge', 'ArenaPlayerAvatar',
      'ArenaPlayerName', 'ArenaPlayerTitle', 'ArenaPlayerScore');
    names.push('ArenaLeaderboardPanel', 'ArenaResult');

    const nodes = {};
    for (const name of names) {
      // The avatar and title are children of their ROW, not of the page, so a
      // direct getChildByName on the page reports them absent while they are on
      // screen -- which is exactly what this probe did on its first run.
      const node = find(page, name);
      nodes[name] = node ? describe(node) : null;
    }
    return { nodes };
  });

  if (report.error) {
    console.log('PROBE_ERROR', JSON.stringify(report));
    problems.push(report.error);
  } else {
    const { nodes } = report;
    console.log('=== Arena settlement rows ===');
    for (let rank = 1; rank <= 5; rank += 1) {
      const row = nodes[`ArenaRankRow_${rank}`];
      if (!row) { console.log(`row ${rank}: ABSENT`); continue; }
      if (!row.active) { console.log(`row ${rank}: inactive`); continue; }
      const cols = ['Badge', 'Avatar', 'Name', 'Title', 'Score'].map((part) => nodes[`ArenaRank${part}_${rank}`]);
      console.log(`row ${rank}  y=${row.local.y}  ` + cols.map((c) => {
        if (!c) return 'MISSING';
        if (!c.active) return `[${c.name}:INACTIVE]`;
        const value = c.string ?? c.colour;
        return `${c.name.replace(`ArenaRank`, '').replace(`_${rank}`, '')}=${JSON.stringify(value)}@(${c.local.x},${c.local.y})box${c.width}x${c.height}`;
      }).join('  '));
    }
    const player = ['Badge', 'Avatar', 'Name', 'Title', 'Score'].map((part) => nodes[`ArenaPlayer${part}`]);
    console.log(`player row  ` + player.map((c) => {
      if (!c) return 'MISSING';
      if (!c.active) return `[${c.name}:INACTIVE]`;
      const value = c.string ?? c.colour;
      return `${c.name.replace('ArenaPlayer', '')}=${JSON.stringify(value)}@x${c.local.x}`;
    }).join('  '));

    // Every visible row must carry all four reference columns.
    for (let rank = 1; rank <= 5; rank += 1) {
      const row = nodes[`ArenaRankRow_${rank}`];
      if (!row?.active) continue;
      for (const part of ['Badge', 'Avatar', 'Name', 'Title', 'Score']) {
        const column = nodes[`ArenaRank${part}_${rank}`];
        if (!column) problems.push(`row ${rank} has no ${part} node`);
        else if (!column.active) problems.push(`row ${rank} ${part} is inactive`);
        else if (part === 'Title' && !column.string) problems.push(`row ${rank} title is empty`);
        else if (part === 'Name' && !column.string) problems.push(`row ${rank} name is empty`);
      }
    }
    for (const part of ['Avatar', 'Name', 'Title', 'Score']) {
      const column = nodes[`ArenaPlayer${part}`];
      if (!column) problems.push(`player row has no ${part} node`);
      else if (!column.active) problems.push(`player row ${part} is inactive`);
      else if ((part === 'Title' || part === 'Name') && !column.string) problems.push(`player row ${part} is empty`);
    }

    // One asset, many tints: two rows the same colour is the failure mode this
    // whole approach has, so it is asserted rather than eyeballed.
    const tints = [];
    for (let rank = 1; rank <= 5; rank += 1) {
      const avatar = nodes[`ArenaRankAvatar_${rank}`];
      if (avatar?.active) tints.push({ label: `row${rank}`, colour: avatar.colour, frame: avatar.spriteFrame });
    }
    if (nodes.ArenaPlayerAvatar?.active) {
      tints.push({ label: 'player', colour: nodes.ArenaPlayerAvatar.colour, frame: nodes.ArenaPlayerAvatar.spriteFrame });
    }
    console.log('=== avatar tints ===');
    for (const tint of tints) console.log(`  ${tint.label.padEnd(7)} ${tint.colour}  frame=${tint.frame}`);
    const distinct = new Set(tints.map((t) => t.colour));
    if (distinct.size !== tints.length) {
      problems.push(`avatar tints not distinct: ${tints.length} avatars, ${distinct.size} colours`);
    }
    const frames = new Set(tints.map((t) => t.frame));
    if (frames.size !== 1) problems.push(`avatars do not share one asset: ${[...frames].join(', ')}`);

    // Legibility: every label drawn ON the board has to be readable against the
    // surface it sits on. Dark-on-dark is precisely the defect the dark-board
    // retint introduced -- `ArenaResult` fell inside the panel and stayed dark --
    // and no count of nodes or tints would have caught it.
    const luma = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    const contrast = (a, b) => {
      const first = luma(a) / 255;
      const second = luma(b) / 255;
      const hi = Math.max(first, second);
      const lo = Math.min(first, second);
      return (hi + 0.05) / (lo + 0.05);
    };
    const MIN_CONTRAST = 3.0;
    const surfaces = [
      ['ArenaResult', nodes.ArenaLeaderboardPanel],
      ...['Name', 'Title', 'Score'].flatMap((part) => [1, 2, 3, 4, 5]
        .filter((rank) => nodes[`ArenaRankRow_${rank}`]?.active)
        .map((rank) => [`ArenaRank${part}_${rank}`, nodes[`ArenaRankRow_${rank}`]])),
    ];
    console.log('=== board legibility (contrast against the surface behind) ===');
    for (const [labelName, surface] of surfaces) {
      const label = nodes[labelName];
      if (!label?.active || !label.rgb || !surface?.rgb) continue;
      const ratio = contrast(label.rgb, surface.rgb);
      const verdict = ratio >= MIN_CONTRAST ? 'ok' : 'LOW';
      console.log(`  ${labelName.padEnd(20)} ${label.colour} on ${surface.colour}  ratio ${ratio.toFixed(2)}  ${verdict}`);
      if (ratio < MIN_CONTRAST) {
        problems.push(`${labelName} contrast ${ratio.toFixed(2)} against its surface is below ${MIN_CONTRAST}`);
      }
    }
  }

  await page.screenshot({ path: shotPath });
  console.log(`[shot] ${shotPath}`);
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.log('\nFAIL');
  for (const problem of problems) console.log('  - ' + problem);
  process.exit(1);
}
console.log('\nPASS: every visible row carries badge, avatar, name, title and mass');
