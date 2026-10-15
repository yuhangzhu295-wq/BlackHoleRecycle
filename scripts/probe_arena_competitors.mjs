/**
 * Verify V12's arena-competitor rule against the live scene.
 *
 * The rule (DESIGN_04): all eight competitors are black holes, distinguished by
 * colour; crawler/vehicle models are scenery and edible objects, not rival
 * presentations. The original defect was names on screen with nothing under
 * them, which only a runtime dump can settle -- reading the code told us what it
 * intended, not what the arena looked like.
 *
 * Asserts, for every ArenaBot_* node: the black-hole core is active, and no
 * bulldozer is mounted. Also reports each bot's rim colour so the identities are
 * visibly distinct rather than seven copies of one colour.
 *
 * Usage: node scripts/probe_arena_competitors.mjs [WxH]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, openPage, serve, sleep } from './lib/page_layout_geometry.mjs';

/**
 * Everything wrong with one nameplate row, as the HUD's own decision and the
 * geometry it reported describe it. Pure, so `--selftest` can hand it
 * counter-examples and prove the checks can fire at all.
 */
function nameplateProblems(row) {
  const problems = [];
  // The node must be in the state the decision asked for. The end of the pass
  // hides plates whose competitor left the snapshot, so a plate can still be
  // stale here even when the decision itself was right.
  const wanted = row.alive === true && row.inside === true;
  if (row.active !== wanted) {
    problems.push(`plate=${row.active} but decision says ${wanted}`);
  }
  // The decision must follow from the geometry the HUD reported for it.
  if (!row.decisionMatchesGeometry) {
    problems.push(`inside=${row.inside} but the reported geometry says ${row.strictInside}`);
  }
  // An active plate must have a body in the frame and text in it.
  if (row.active === true && !row.bodyInFrame) {
    problems.push('an active nameplate for a body outside the frame -- an orphan name');
  }
  if (row.active === true && !row.label) {
    problems.push('an active nameplate with no text -- a name with nothing in it');
  }
  return problems;
}

// A check that has only ever been seen to pass is not evidence. These are the
// counter-examples the assertions above must reject, each a defect the arena has
// actually shipped at some point: a name over an empty cell, a plate left behind
// by a departed rival, a plate hidden for a body that is on screen.
if (process.argv.includes('--selftest')) {
  const base = {
    id: 'synthetic',
    alive: true,
    inside: true,
    active: true,
    label: 'bot 100kg',
    nx: 0.5,
    ny: 0.5,
    marginX: 0.2,
    plateWidth: 184,
    strictInside: true,
    decisionMatchesGeometry: true,
    bodyInFrame: true,
  };
  const cases = [
    ['healthy plate', {}, null],
    ['orphan name: active plate over a body outside the frame', { bodyInFrame: false }, 'orphan name'],
    ['stale plate: the decision hid it, the node is still active', { inside: false, strictInside: false }, 'plate=true but decision says false'],
    ['missing plate: the decision showed it, the node is inactive', { active: false }, 'plate=false but decision says true'],
    ['blank plate: active with no text', { label: '' }, 'no text'],
    ['decision contradicts the geometry it reported', { decisionMatchesGeometry: false }, 'reported geometry'],
    ['dead competitor leaves a name behind', { alive: false, inside: false, strictInside: false, bodyInFrame: false }, 'plate=true but decision says false'],
  ];
  let bad = 0;
  for (const [name, patch, expect] of cases) {
    const problems = nameplateProblems({ ...base, ...patch });
    const hit = expect === null ? problems.length === 0 : problems.some((p) => p.includes(expect));
    if (!hit) bad += 1;
    console.log(`${hit ? 'ok  ' : 'FAIL'} ${name}${expect === null ? ' (expected no problem)' : ` (expected "${expect}")`}`
      + (problems.length ? ` -> ${JSON.stringify(problems)}` : ''));
  }
  console.log(`[selftest] ${cases.length - bad} of ${cases.length} cases behaved as intended`);
  process.exit(bad === 0 ? 0 : 1);
}

const [width, height] = (process.argv[2] || '390x844').split('x').map(Number);
// PHASE B/I evidence: the arena frame at a given size. PHASE B needs a before/after
// pair and PHASE I needs all three sizes, and both were previously only obtainable
// by driving a full acceptance scope.
//
// Writes to v13, not v12: `artifacts/qa/v12/arena/` is V12's frozen acceptance
// evidence (`V12_EXECUTION_CHECKPOINT.md` names its three sizes) and a probe run
// must not overwrite a closed phase's record with a frame from a later build.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = path.join(repoRoot, 'artifacts', 'qa', 'v13', 'arena');
mkdirSync(shotDir, { recursive: true });
const shotPath = path.join(shotDir, `arena-${width}x${height}.png`);

const { server, port } = await serve('cocos/build/web-mobile');
const browser = await launchBrowser();
const failures = [];
try {
  const { context, page, cdp, canvasRect } = await openPage(browser, port, { width, height });
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(700);
  };
  const tapUi = async (key) => {
    const snapshot = await page.evaluate(() => window.__BHR_QA__.snapshot());
    const node = snapshot.ui?.[key];
    if (!node?.active) throw new Error(`cannot tap ${key}: ${JSON.stringify(node)}`);
    await tap(canvasRect.left + canvasRect.width * node.screen.x,
      canvasRect.top + canvasRect.height * node.screen.y);
  };
  const waitState = (want, ms = 30000) => page.waitForFunction(
    (state) => window.__BHR_QA__.snapshot().gameState === state, want, { timeout: ms });

  await tapUi('start');
  await waitState('MODE_SELECT');
  await tapUi('modeArena');
  await waitState('MODE_READY');
  const ready = await page.evaluate(() => window.__BHR_QA__.snapshot());
  await tap(canvasRect.left + canvasRect.width * ready.ui.arenaReady.start.screen.x,
    canvasRect.top + canvasRect.height * ready.ui.arenaReady.start.screen.y);
  await waitState('ARENA');
  await sleep(2500);
  await page.screenshot({ path: shotPath });
  console.log(`[arena] capture -> ${path.relative(repoRoot, shotPath)}`);

  const report = await page.evaluate(() => {
    const cc = window.cc;
    const scene = cc.director.getScene();
    // Search from the SCENE root, not from Canvas: the arena competitors are 3D
    // nodes under GameRoot, and looking under Canvas is what made the first run
    // report "no ArenaBot_1 in the live tree" while the match was demonstrably
    // running.
    const root = scene;
    const find = (node, name) => {
      if (!node) return null;
      if (node.name === name) return node;
      for (const child of node.children) {
        const hit = find(child, name);
        if (hit) return hit;
      }
      return null;
    };
    // The arena container is wherever the ArenaBot_1 node lives.
    const first = find(root, 'ArenaBot_1');
    const container = first ? first.parent : null;
    if (!container) return { error: 'no ArenaBot_1 in the live tree' };

    const bots = [];
    for (const node of container.children) {
      if (!node.name.startsWith('ArenaBot_')) continue;
      const core = node.getChildByName('VisualRoot')?.getChildByName('CoreNode') || null;
      // PHASE A #3: the identity colour must be readable off the live material,
      // not inferred from the tint string that was requested. A shared material
      // instance would make seven bots share one colour, and that is exactly the
      // failure this reads for.
      const ringColour = (() => {
        const ring = find(node, 'HoleRing');
        const renderer = ring?.getComponent('cc.MeshRenderer') || null;
        const material = renderer?.material || renderer?.getMaterial?.(0) || null;
        const colour = material?.getProperty?.('mainColor') || null;
        if (!colour) return null;
        const hex = (value) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0');
        return `#${hex(colour.r)}${hex(colour.g)}${hex(colour.b)}`;
      })();
      const children = [];
      // Activity, not presence. The machine's level assemblies (MachineVisual_LV*)
      // are always children of VisualRoot; for a bot they are simply inactive. A
      // name-presence check reported "still mounts a crawler" on all seven while
      // nothing was actually drawn, which is a false positive of exactly the kind
      // this probe exists to avoid.
      let activeCrawler = null;
      const walk = (n) => {
        children.push(n.name);
        if (n.activeInHierarchy && /bulldozer|CrawlerChassis/i.test(n.name)) activeCrawler = n.name;
        for (const c of n.children) walk(c);
      };
      walk(node);
      bots.push({
        name: node.name,
        coreActive: core ? core.activeInHierarchy : null,
        hasBulldozer: Boolean(activeCrawler),
        activeCrawler,
        activeRenderers: children.filter((n) => /HoleRing|ShimmerSwirl|HoleInner|AbyssBase/i.test(n)).length,
        // PHASE A #1: the black hole's on-screen size must track its real mass.
        // Reported as the pair (mass, coreScaleXZ) so the two can be compared
        // across the seven rivals rather than eyeballed from a screenshot.
        coreScaleXZ: core ? Number(core.scale.x.toFixed(3)) : null,
        ringColour,
        worldPos: { x: Number(node.worldPosition.x.toFixed(1)), z: Number(node.worldPosition.z.toFixed(1)) },
        // PHASE A #4/#5: the name must belong to a real body, and a body that is
        // off screen must not leave a name behind.
        visible: node.activeInHierarchy,
      });
    }
    return { container: container.name, bots };
  });

  if (report.error) {
    failures.push(report.error);
  } else {
    console.log(`[arena] container=${report.container} competitors=${report.bots.length}`);
    for (const bot of report.bots) {
      console.log(`  ${bot.name}: core=${bot.coreActive} crawler=${bot.hasBulldozer}`
        + ` coreScale=${bot.coreScaleXZ} ring=${bot.ringColour}`
        + ` pos=(${bot.worldPos.x},${bot.worldPos.z}) visible=${bot.visible}`);
      if (bot.coreActive !== true) failures.push(`${bot.name}: black-hole core is NOT active`);
      if (bot.hasBulldozer) failures.push(`${bot.name}: still mounts an active crawler`);
      if (bot.visible !== true) failures.push(`${bot.name}: node is not active in hierarchy`);
      if (!bot.ringColour) failures.push(`${bot.name}: HoleRing has no readable material colour`);
    }
    if (report.bots.length !== 7) failures.push(`expected 7 bots, found ${report.bots.length}`);
    // PHASE A #3: seven rivals must be seven colours. A shared material would make
    // this list one entry long, which is the defect this asserts against.
    const colours = report.bots.map((b) => b.ringColour);
    console.log(`[arena] distinct rival rim colours: ${new Set(colours).size} of ${colours.length}`
      + ` -> ${JSON.stringify([...new Set(colours)])}`);
    if (new Set(colours).size !== report.bots.length) {
      failures.push(`rivals share rim colours: ${JSON.stringify(colours)}`);
    }
    // PHASE A #1: distinct core scales across rivals would mean size is not
    // tracking the shared start mass. All seven start at START_MASS, so a spread
    // here is a real defect rather than a design choice.
    const scales = [...new Set(report.bots.map((b) => b.coreScaleXZ))];
    console.log(`[arena] distinct core scales at match start: ${JSON.stringify(scales)}`);
  }
  // PHASE A #4/#5: the nameplate must belong to a body that is on screen, and a
  // body off screen must not leave a name behind. This is the contract the
  // original symptom broke, so it is asserted rather than eyeballed.
  //
  // The comparison is against the HUD's OWN decision, read from
  // `arenaHUD.nameplates` / `arenaHUD.nameplateFrame`, not against a window
  // re-derived here. This probe used to hardcode 0.15..0.85 and call anything
  // inside it "on screen", but the HUD reserves each plate's actual width inside
  // the VISIBLE half-width, so its limit moves per competitor and per aspect
  // ratio -- measured between 0.17 and 0.22 at 390x844. A bot at nx 0.837 sat
  // inside the hardcoded window and outside the real rule, and the probe failed
  // about one run in two with a defect that was its own. Two copies of one rule
  // is the bug; the HUD now publishes the one copy.
  const nameplateReport = await page.evaluate(() => {
    const snapshot = window.__BHR_QA__.snapshot();
    // The HUD block hangs off `ui`, beside the page descriptions -- reading it
    // from the snapshot root returned undefined and the probe reported "no
    // geometry" for a HUD that was publishing it. (`initialLayout.arenaHUD` in
    // the acceptance reports is that runner's own regrouping, not the live path.)
    const hud = snapshot.ui?.arenaHUD || {};
    const plates = hud.nameplates || [];
    const frame = hud.nameplateFrame || null;
    if (!frame) return { error: 'the HUD published no nameplate frame geometry' };
    if (!plates.length) return { error: 'the HUD published no nameplates' };
    const rows = [];
    // The HUD tests `nx >= 0.5 - slack/W`; this recomputes it as
    // `|nx - 0.5| * W <= slack`. Algebraically the same test, but the two forms
    // can differ in the last bit when a value sits exactly on the bound, so a
    // boundary case is accepted as consistent rather than reported as a defect
    // the HUD does not have.
    const EPS = 1e-6;
    for (const plate of plates) {
      // The rule restated from the HUD's own numbers: the plate's half-width plus
      // the edge inset must fit inside the visible half-width, with the same
      // clamp on the slack. No constant is written here -- every input comes from
      // `nameplateFrame`, so this cannot drift from the HUD the way a literal did.
      const slack = Math.max(0, frame.visibleHalfWidth - frame.edgeInset - plate.plateWidth / 2);
      const alive = plate.alive === true;
      const hasPosition = plate.nx !== null && plate.ny !== null;
      const xDistance = hasPosition ? Math.abs(plate.nx - 0.5) * frame.hudWidth : Number.POSITIVE_INFINITY;
      const strictInside = alive && hasPosition && xDistance <= slack
        && plate.ny >= frame.minY && plate.ny <= frame.maxY;
      const relaxedInside = alive && hasPosition && xDistance <= slack + EPS
        && plate.ny >= frame.minY - EPS && plate.ny <= frame.maxY + EPS;
      const decisionMatchesGeometry = alive
        ? (plate.inside === strictInside || plate.inside === relaxedInside)
        : plate.inside === false;
      // A plate drawn for a body outside the frame is the orphan name DESIGN_04
      // forbids; this needs no rule of the HUD's, only the frame itself.
      const bodyInFrame = hasPosition
        && plate.nx >= 0 && plate.nx <= 1 && plate.ny >= 0 && plate.ny <= 1;
      rows.push({
        id: plate.id,
        alive: plate.alive,
        inside: plate.inside,
        active: plate.active,
        label: plate.label,
        nx: hasPosition ? Number(plate.nx.toFixed(3)) : null,
        ny: hasPosition ? Number(plate.ny.toFixed(3)) : null,
        marginX: plate.marginX === null ? null : Number(plate.marginX.toFixed(4)),
        plateWidth: plate.plateWidth,
        strictInside,
        decisionMatchesGeometry,
        bodyInFrame,
      });
    }
    return { rows, frame };
  });

  if (nameplateReport.error) {
    failures.push(nameplateReport.error);
  } else {
    console.log('\n[plate] nameplate vs the HUD\'s own decision (PHASE A #4/#5)');
    console.log(`  frame: hudWidth=${nameplateReport.frame.hudWidth}`
      + ` visibleHalfWidth=${nameplateReport.frame.visibleHalfWidth}`
      + ` edgeInset=${nameplateReport.frame.edgeInset}`
      + ` y=[${nameplateReport.frame.minY},${nameplateReport.frame.maxY}]`);
    for (const row of nameplateReport.rows) {
      const at = row.nx === null ? 'not alive' : `(${row.nx},${row.ny}) marginX=${row.marginX}`;
      const problems = nameplateProblems(row);
      console.log(`  ${row.id}: alive=${row.alive} inside=${row.inside} plate=${row.active}`
        + ` ${at} label=${JSON.stringify(row.label)}`
        + ` ${problems.length ? 'MISMATCH' : 'ok'}`);
      for (const problem of problems) failures.push(`${row.id}: ${problem}`);
    }
  }

  // PHASE A: the single dump above says where the bots are, not whether two of
  // them STAY together. A pair 0.1 apart in one sample is an incidental crossing;
  // the same pair under 1.5 apart for most of ten seconds is a body that reads as
  // one opponent. Measure before changing the AI.
  const SAMPLES = 40;
  const INTERVAL_MS = 250;
  const pairs = new Map();
  const growth = new Map();
  const positionsBySample = [];
  let behaviourBySample = [];
  for (let index = 0; index < SAMPLES; index += 1) {
    const frame = await page.evaluate(() => {
      const cc = window.cc;
      const scene = cc.director.getScene();
      const find = (node, name) => {
        if (!node) return null;
        if (node.name === name) return node;
        for (const child of node.children) {
          const hit = find(child, name);
          if (hit) return hit;
        }
        return null;
      };
      const first = find(scene, 'ArenaBot_1');
      const container = first ? first.parent : null;
      const out = [];
      if (container) {
        for (const node of container.children) {
          if (!node.name.startsWith('ArenaBot_') || !node.activeInHierarchy) continue;
          // PHASE A #1: growth must be measured on the machine node's own scale,
          // not on the core's. `coreScale` is a binary (1.92 for SINGULARITY, 1.32
          // otherwise) and does not move with level, so reading it would report
          // "size does not track mass" no matter what the game actually does.
          out.push({
            name: node.name,
            x: node.worldPosition.x,
            z: node.worldPosition.z,
            nodeScale: Number(node.scale.x.toFixed(3)),
          });
        }
      }
      const snapshot = window.__BHR_QA__.snapshot();
      const masses = {};
      for (const entry of snapshot.arena?.leaderboard || []) masses[entry.id] = entry.mass;
      return { bots: out, arena: snapshot.arena || null, masses, gameState: snapshot.gameState };
    });
    if (frame.gameState !== 'ARENA') break;
    positionsBySample.push(frame.bots);
    for (const bot of frame.bots) {
      const id = bot.name.replace('ArenaBot_', 'bot-');
      const mass = frame.masses?.[id];
      if (typeof mass !== 'number') continue;
      const entry = growth.get(id) || { minMass: Infinity, maxMass: -Infinity, scaleAtMin: null, scaleAtMax: null };
      if (mass < entry.minMass) { entry.minMass = mass; entry.scaleAtMin = bot.nodeScale; }
      if (mass > entry.maxMass) { entry.maxMass = mass; entry.scaleAtMax = bot.nodeScale; }
      growth.set(id, entry);
    }
    const states = frame.arena?.botStates || {};
    behaviourBySample.push(states);
    for (let a = 0; a < frame.bots.length; a += 1) {
      for (let b = a + 1; b < frame.bots.length; b += 1) {
        const left = frame.bots[a];
        const right = frame.bots[b];
        const key = `${left.name}|${right.name}`;
        const gap = Math.hypot(left.x - right.x, left.z - right.z);
        const entry = pairs.get(key) || { min: Infinity, close: 0, total: 0, states: new Set() };
        entry.min = Math.min(entry.min, gap);
        entry.total += 1;
        if (gap < 1.5) {
          entry.close += 1;
          const leftState = states[left.name.replace('ArenaBot_', 'bot-')];
          const rightState = states[right.name.replace('ArenaBot_', 'bot-')];
          if (leftState) entry.states.add(leftState);
          if (rightState) entry.states.add(rightState);
        }
        pairs.set(key, entry);
      }
    }
    await sleep(INTERVAL_MS);
  }

  if (positionsBySample.length >= 3) {
    const ranked = [...pairs.entries()].sort((left, right) => left[1].min - right[1].min).slice(0, 5);
    console.log(`\n[overlap] ${positionsBySample.length} samples over ${(SAMPLES * INTERVAL_MS) / 1000}s`);
    console.log('[overlap] closest pairs (min gap / samples under 1.5 / samples seen):');
    for (const [key, entry] of ranked) {
      console.log(`  ${key}: min=${entry.min.toFixed(2)} close=${entry.close}/${entry.total}`
        + ` behaviours=${JSON.stringify([...entry.states])}`);
    }
    const persistent = ranked.filter(([, entry]) => entry.close / entry.total > 0.5);
    if (persistent.length) {
      // Report, do not fail: the fix decision belongs to the next step, and the
      // arena-ai contract is the thing that must not regress.
      console.log(`[overlap] PERSISTENT: ${persistent.length} pair(s) under 1.5 units for`
        + ' more than half the samples -- these read as one opponent.');
    } else {
      console.log('[overlap] no pair stayed under 1.5 units for more than half the samples.');
    }
  }

  // PHASE A #1: size must track real mass. Reported as (mass at smallest scale,
  // mass at largest scale) per rival.
  //
  // The assertion is monotonicity, NOT "every mass gain resizes the body". Growth
  // here is discrete: the node scale comes from the level's `config.scale`, and a
  // level only advances when mass crosses a MACHINE_EVOLUTION_CONFIG threshold. A
  // bot that gains 65 mass without crossing one is behaving correctly by not
  // resizing. The first version of this check asserted the continuous rule and
  // reported three false failures (bot-1, bot-2, bot-5) -- the detector was wrong,
  // not the game.
  if (growth.size) {
    console.log('\n[growth] node scale against real mass (PHASE A #1)');
    for (const [id, entry] of growth) {
      const grew = entry.maxMass > entry.minMass;
      const resized = entry.scaleAtMax !== entry.scaleAtMin;
      console.log(`  ${id}: mass ${entry.minMass} -> ${entry.maxMass}`
        + ` (grew=${grew}) scale ${entry.scaleAtMin} -> ${entry.scaleAtMax} (resized=${resized})`);
      if (entry.scaleAtMax < entry.scaleAtMin) {
        failures.push(`${id}: the body SHRANK while gaining mass`
          + ` (${entry.minMass}@${entry.scaleAtMin} -> ${entry.maxMass}@${entry.scaleAtMax})`);
      }
    }
    const resized = [...growth.values()].filter((e) => e.scaleAtMax !== e.scaleAtMin).length;
    console.log(`[growth] ${resized} of ${growth.size} rivals crossed a level threshold and resized`
      + '; the rest gained mass without levelling, which is correct.');
  }

  // PHASE B: the opening composition declares authored names (POI_CentralSquare,
  // ParkTreeSmall_1, ...) and the runtime warns it cannot find eight of them. The
  // prefab demonstrably contains all of them as real node names, so the question
  // is whether they survive to the live tree. Ask the scene directly.
  const compositionProbe = await page.evaluate(() => {
    const cc = window.cc;
    const scene = cc.director.getScene();
    const wanted = ['POI_CentralSquare', 'ParkTreeSmall_1',
      'SupermarketBuilding', 'SupermarketBuildingSouth1', 'SupermarketBuildingSouth5',
      'SupermarketTreeFarNW', 'SupermarketBoundaryFence'];
    const found = {};
    for (const name of wanted) found[name] = 0;
    let cells = 0;
    const walk = (node) => {
      if (/^WorldCell_/.test(node.name)) cells += 1;
      if (found[node.name] !== undefined) found[node.name] += 1;
      for (const child of node.children) walk(child);
    };
    const placements = [];
    const collect = (node) => {
      if (node.name === 'SupermarketBuilding' || node.name.startsWith('SupermarketBuildingSouth')) {
        const wp = node.worldPosition;
        placements.push({ name: node.name, active: node.activeInHierarchy,
          x: Number(wp.x.toFixed(1)), z: Number(wp.z.toFixed(1)) });
      }
      for (const child of node.children) collect(child);
    };
    collect(scene);
    const arenaRoot = find(scene, 'ArenaMatchRoot') || null;
    const competitors = [];
    if (arenaRoot) {
      for (const c of arenaRoot.children) {
        const wp = c.worldPosition;
        competitors.push({ name: c.name, x: Number(wp.x.toFixed(1)), z: Number(wp.z.toFixed(1)) });
      }
    }
    const playerPos = competitors.find((c) => !c.name.startsWith('ArenaBot_')) || competitors[0] || null;
    walk(scene);
    const snapshot = window.__BHR_QA__.snapshot();
    return {
      cells,
      found,
      // Which source the arena's own cell came from. A prefab edit to a district
      // map changes nothing if the cell fell back to procedural generation.
      cellSource: snapshot.world?.currentCellSource ?? null,
      region: snapshot.world?.currentRegion ?? null,
      placements: placements.slice(0, 14),
      player: playerPos,
      competitors: competitors.slice(0, 3),
    };
  });
  console.log(`\n[opening] WorldCell_* nodes in the live tree: ${compositionProbe.cells}`
    + ` | cellSource=${compositionProbe.cellSource} | region=${compositionProbe.region}`);
  console.log('[opening] player world =', JSON.stringify(compositionProbe.player));
  for (const p of compositionProbe.placements || []) {
    console.log('  building', p.name, 'active=' + p.active, 'world=(' + p.x + ',' + p.z + ')');
  }
  for (const [name, count] of Object.entries(compositionProbe.found)) {
    console.log(`  ${name}: ${count === 0 ? 'ABSENT from the live tree' : `present x${count}`}`);
  }

  await context.close();
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n[arena] FAIL (${failures.length}):`);
  for (const line of failures) console.error('  - ' + line);
  process.exit(1);
}
console.log('\n[arena] PASS: every competitor is a black hole and no crawler is mounted.');
