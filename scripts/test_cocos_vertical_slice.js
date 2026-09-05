/**
 * BlackHoleRecycle Cocos vertical-slice source-contract regression.
 *
 * This is deliberately a Node-side contract check, not a Cocos runtime test:
 * it reads the current TypeScript configuration and inspects
 * the current Cocos source/prefab files. It never substitutes MockNode,
 * simulated object states or a reimplemented suction algorithm. The real
 * touch-driven T1 -> LV2 -> T2 flow is owned by acceptance:v2.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cocosDirectory = path.join(rootDirectory, 'cocos');

const readSource = (relativePath) => fs.readFileSync(path.join(cocosDirectory, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(cocosDirectory, relativePath));

const evolutionBlock = (source, level) => source.match(new RegExp(`\\{\\s*level:\\s*${level},([\\s\\S]*?)\\n  \\}`, 'm'))?.[1] || '';

const containsAll = (source, snippets) => snippets.every((snippet) => source.includes(snippet));

async function run() {
  console.log('====================================================');
  console.log('Cocos vertical-slice source-contract regression (non-runtime)');
  console.log('====================================================\n');

  const record = (name, pass, detail) => {
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
    if (!pass) throw new Error(`Vertical-slice source contract failed: ${name}`);
  };

  const gameConfig = readSource('assets/scripts/data/GameConfig.ts');
  const level1 = evolutionBlock(gameConfig, 1);
  const level2 = evolutionBlock(gameConfig, 2);
  const chunkConfig = readSource('assets/scripts/world/ChunkConfig.ts');
  const compressibleObject = readSource('assets/scripts/gameplay/CompressibleObject.ts');
  const machine = readSource('assets/scripts/machine/BlackHoleMachine.ts');
  const visualLibrary = readSource('assets/scripts/machine/MachineVisualLibrary.ts');

  record(
    'CHECK_SCENE_AND_PREFABS',
    [
      'assets/scenes/Game.scene',
      'assets/prefabs/machine/BlackHoleMachine.prefab',
      'assets/prefabs/machine/MachineVisual_LV2.prefab',
      'assets/prefabs/objects/TrashObject.prefab',
    ].every(exists),
    'Current Game.scene, machine, LV2 assembly and recyclable prefabs exist.',
  );

  record(
    'CHECK_LV1_INITIAL_STATE',
    containsAll(level1, ['massThreshold: 0', 'suctionRadius: 2.4', 'maxTier: ObjectTier.T1']),
    'Current GameConfig LV1 radius=2.4m, maxTier=T1.',
  );

  const hasOpeningCluster = /starter_recycling_cluster_\$\{index\}/.test(chunkConfig)
    && /starterPositions/.test(chunkConfig)
    && /t2_target_bed_box/.test(chunkConfig)
    && /cellX === 0 && cellZ === 0/.test(chunkConfig);
  record(
    'CHECK_OPENING_RECYCLABLE_LAYOUT',
    hasOpeningCluster,
    'Current CellItemGenerator defines a real opening T1 cluster and adjacent T2 target.',
  );

  const hasLockContract = /this\.template\.tier > machineMaxTier && !isMagnetStorm/.test(compressibleObject)
    && /this\.showLockAlert\(\)/.test(compressibleObject)
    && /TierLockWarning/.test(compressibleObject);
  record(
    'CHECK_LV1_TIER_LOCK',
    hasLockContract,
    'Current CompressibleObject blocks over-tier idle objects and displays a lock warning.',
  );

  const hasLv2Visuals = exists('assets/prefabs/machine/MachineVisual_LV2.prefab')
    && /MagneticTurbineLeft/.test(visualLibrary)
    && /MagneticTurbineRight/.test(visualLibrary)
    && /applyEvolutionLevel\(cfg\.level, true\)/.test(machine);
  record(
    'CHECK_LV1_TO_LV2_EVOLUTION',
    containsAll(level2, ['massThreshold: 900', 'suctionRadius: 3.4', 'maxTier: ObjectTier.T2'])
      && hasLv2Visuals,
    'Current GameConfig LV2 threshold=900, radius=3.4m, T2 enabled with saved turbine assembly.',
  );

  const hasT2 = /tier:\s*ObjectTier\.T2/.test(gameConfig);
  const hasAbsorbPath = /this\.fsm\.setState\('ATTRACTED'\)/.test(compressibleObject)
    && /this\.fsm\.setState\('ABSORBED'\)/.test(compressibleObject)
    && /this\.template\.tier > machineMaxTier/.test(compressibleObject);
  record(
    'CHECK_LV2_SUCTION_T2_OBJECT',
    hasT2 && hasAbsorbPath,
    'Current T2 templates and the real lower-or-equal-tier absorption path exist.',
  );

  console.log('\n[PASS] 6/6 current Cocos source contracts passed (non-runtime).');
  console.log('[NOTE] Runtime evidence remains npm run acceptance:v2 -- --scope=full.\n');
}

run().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
