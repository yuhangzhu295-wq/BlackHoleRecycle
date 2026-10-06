/**
 * V8.3 §12 PROGRESSION CURVE MEASUREMENT.
 *
 * §12 says measure before touching thresholds. This runs one long real Endless
 * session with touch only and records the mass curve, so the thresholds can be
 * derived from how fast the player actually grows instead of guessed.
 *
 * Usage: node scripts/endless_progression_curve.mjs [--minutes=10]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const buildDirectory = path.join(repoRoot, 'cocos', 'build', 'web-mobile');
const outDir = path.join(repoRoot, 'artifacts', 'qa', 'progression');
mkdirSync(outDir, { recursive: true });

const argOf = (n, f) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? Number(h.split('=')[1]) : f;
};
const MINUTES = argOf('minutes', 10);

function serve(root) {
  return new Promise((res) => {
    const server = createServer((req, rep) => {
      const u = new URL(req.url, 'http://127.0.0.1').pathname;
      const safe = path.normalize(u).replace(/^(\.\.[/\\])+/, '');
      let fp = path.join(root, safe === '/' ? 'index.html' : safe);
      if (!existsSync(fp) || statSync(fp).isDirectory()) {
        if (statSync(fp).isDirectory() && existsSync(path.join(fp, 'index.html'))) fp = path.join(fp, 'index.html');
        else { rep.writeHead(404); rep.end('404'); return; }
      }
      const ext = path.extname(fp).toLowerCase();
      const ct = {
        '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
        '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
      }[ext] || 'application/octet-stream';
      rep.writeHead(200, { 'Content-Type': ct });
      rep.end(readFileSync(fp));
    });
    server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function tap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
function pt(rect, node, name) {
  if (!node?.active || !node?.screen) throw new Error('invisible node: ' + name + ' ' + JSON.stringify(node));
  return { x: rect.left + rect.width * node.screen.x, y: rect.top + rect.height * node.screen.y };
}

const { server, port } = await serve(buildDirectory);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-proxy-server'],
});
const report = { minutes: MINUTES, samples: [] };

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/?qa=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__BHR_QA__?.snapshot), undefined, { timeout: 90000 });
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'HOME', undefined, { timeout: 60000 });
  await sleep(1200);
  const cdp = await context.newCDPSession(page);
  const rect = await page.locator('#GameCanvas').evaluate((c) => {
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

  let s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  await tap(cdp, ...Object.values(pt(rect, s.ui.start, 'ST')));
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_SELECT', undefined, { timeout: 8000 });
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().ui?.modeEndless?.active === true, undefined, { timeout: 8000 });
  s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  await tap(cdp, ...Object.values(pt(rect, s.ui.modeEndless, 'ME')));
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'MODE_READY', undefined, { timeout: 8000 });
  await page.waitForFunction(() => {
    const r = window.__BHR_QA__.snapshot().ui?.endlessReady || window.__BHR_QA__.snapshot().ui?.arenaReady;
    return r?.start?.active === true;
  }, undefined, { timeout: 8000 });
  s = await page.evaluate(() => window.__BHR_QA__.snapshot());
  await tap(cdp, ...Object.values(pt(rect, s.ui.endlessReady.start, 'ES')));
  await page.waitForFunction(() => window.__BHR_QA__.snapshot().gameState === 'PLAYING', undefined, { timeout: 8000 });
  await sleep(600);

  const joystick = pt(rect, (await page.evaluate(() => window.__BHR_QA__.snapshot())).ui.runtimeHUD.joystick, 'JOY');
  let touchDown = false;
  const steerTo = async (dx, dz) => {
    const l = Math.hypot(dx, dz) || 1;
    const sc = Math.min(1, l / 4) * 88;
    if (!touchDown) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joystick.x, y: joystick.y, id: 3 }] });
      touchDown = true;
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: joystick.x + (dx / l) * sc, y: joystick.y + (dz / l) * sc, id: 3 }],
    });
  };

  const t0 = Date.now();
  const deadline = t0 + MINUTES * 60000;
  let lastLog = 0;
  while (Date.now() < deadline) {
    const r = await page.evaluate(() => {
      const sv = window.__BHR_QA__.snapshot();
      const p = sv.player.position;
      const maxTier = sv.machine.maxTier;
      let best = null;
      let bd = Infinity;
      const tiers = {};
      for (const o of (sv.objects || [])) {
        tiers[o.tier] = (tiers[o.tier] || 0) + 1;
        if (o.state !== 'IDLE' || o.tier > maxTier || o.owner) continue;
        const d = Math.hypot(o.x - p.x, o.z - p.z);
        if (d < bd) { bd = d; best = { x: o.x, z: o.z }; }
      }
      return { mass: sv.machine.mass, level: sv.machine.level, maxTier, px: p.x, pz: p.z, best, tiers, gameState: sv.gameState };
    });
    const elapsed = Date.now() - t0;
    if (r.best) await steerTo(r.best.x - r.px, r.best.z - r.pz);
    if (elapsed - lastLog >= 5000) {
      lastLog = elapsed;
      report.samples.push({ t: elapsed, mass: r.mass, level: r.level, maxTier: r.maxTier, tiers: r.tiers });
      console.log(`t=${(elapsed / 1000).toFixed(0)}s mass=${r.mass} level=${r.level} maxTier=${r.maxTier}`);
    }
    if (r.gameState !== 'PLAYING') break;
    await sleep(200);
  }
  if (touchDown) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  const first = report.samples[0];
  const last = report.samples[report.samples.length - 1];
  const minutes = (last.t - first.t) / 60000;
  report.summary = {
    minutesMeasured: minutes,
    startMass: first.mass,
    endMass: last.mass,
    endLevel: last.level,
    massPerMinute: minutes > 0 ? (last.mass - first.mass) / minutes : null,
    finalTierHistogram: last.tiers,
    consoleErrorCount: consoleErrors.length,
  };
  writeFileSync(path.join(outDir, 'endless_curve.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('\n' + JSON.stringify(report.summary, null, 2));
} finally {
  await browser.close();
  server.close();
}
