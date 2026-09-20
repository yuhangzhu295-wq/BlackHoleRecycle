/**
 * S5 implementation contract for machine evolution, compression feedback and
 * persistence. This reads the production sources and evaluates the authored
 * GameConfig table; it does not grant runtime state or use QABridge setters.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const record = (name, pass, detail) => {
  console.log('[' + (pass ? 'PASS' : 'FAIL') + '] ' + name + ': ' + detail);
  if (!pass) throw new Error(name);
};

const configSource = read('cocos/assets/scripts/data/GameConfig.ts');
const configCode = transformSync(configSource + '\nglobalThis.__S5_CONFIG = { MACHINE_EVOLUTION_CONFIG, ObjectTier };', {
  loader: 'ts', target: 'es2022', format: 'iife',
}).code;
new Function(configCode)();
const { MACHINE_EVOLUTION_CONFIG } = globalThis.__S5_CONFIG;

record('FIVE_AUTHORED_LEVELS', MACHINE_EVOLUTION_CONFIG.length === 5
  && MACHINE_EVOLUTION_CONFIG.every((entry, index) => entry.level === index + 1),
  'LV1-LV5 are present in the production evolution table.');

const expectedNames = ['Small Core', 'Magnetic Turbine', 'Compression Engine', 'Gravity Harvester', 'Singularity Core'];
record('STRUCTURAL_EVOLUTION_NAMES', MACHINE_EVOLUTION_CONFIG.every((entry, index) => entry.name.startsWith(expectedNames[index])),
  'Each level has its own authored machine assembly name.');

record('REAL_SUCTION_AND_TIER_PROGRESSION', MACHINE_EVOLUTION_CONFIG.every((entry, index) =>
  entry.suctionRadius > 0 && entry.maxTier === index + 1)
  && MACHINE_EVOLUTION_CONFIG.every((entry, index) => index === 0 || entry.suctionRadius > MACHINE_EVOLUTION_CONFIG[index - 1].suctionRadius),
  'Suction radius and max tier advance per level.');

record('DISTINCT_PULL_AND_COMPRESSION_FEEDBACK', MACHINE_EVOLUTION_CONFIG.every((entry) =>
  entry.suctionPullMultiplier > 0 && entry.compressionDuration > 0
  && entry.compressionShakeAmplitude > 0 && entry.compressionEjectSpeed > 0)
  && new Set(MACHINE_EVOLUTION_CONFIG.map((entry) => entry.suctionPullMultiplier)).size === 5
  && new Set(MACHINE_EVOLUTION_CONFIG.map((entry) => entry.compressionShakeAmplitude)).size === 5,
  'Every level has distinct suction and compression feedback parameters.');

const machineSource = read('cocos/assets/scripts/machine/BlackHoleMachine.ts');
const compressionSource = read('cocos/assets/scripts/gameplay/CompressionSystem.ts');
const objectSource = read('cocos/assets/scripts/gameplay/CompressibleObject.ts');
const saveSource = read('cocos/assets/scripts/data/SaveService.ts');
const managerSource = read('cocos/assets/scripts/gameplay/GameManager.ts');

record('MASS_TO_UPGRADE_CHAIN', machineSource.includes('public addMass(amount: number)')
  && machineSource.includes('this.checkEvolution()')
  && machineSource.includes('applyEvolutionLevel(cfg.level, true)'),
  'Collected mass is the existing authority that triggers evolution.');
record('SUCTION_TO_COMPRESSION_CHAIN', objectSource.includes("this.transitionTo('ABSORBED')")
  && objectSource.includes('if (!this.fsm.setState(nextState)) return;')
  && managerSource.includes('this.compressionSystem.absorbObject(obj, this.machine)')
  && compressionSource.includes('this.machine.addMass(this.bufferMass)'),
  'The real suction FSM feeds the existing compression system and then machine mass.');
record('BLOCK_REWARD_COINS_CHAIN', compressionSource.includes('spawnResourceBlock()')
  && compressionSource.includes('saveService.addCoins(earnedCoins)')
  && compressionSource.includes('this.resourceBlockCount++'),
  'Compression emits a real resource block and settles its reward into coins.');
record('LEVEL_SPECIFIC_COMPRESSION_FEEDBACK', compressionSource.includes('compressionDuration')
  && compressionSource.includes('compressionShakeAmplitude')
  && compressionSource.includes('compressionEjectSpeed')
  && compressionSource.includes('COMPRESSION_STARTED'),
  'Compression timing, shake and ejection feedback come from the active machine level.');
record('SAVE_RESUME_MASS', saveSource.includes('machineMass: number')
  && saveSource.includes('setMachineProgression')
  && machineSource.includes('saveService.data.machineMass')
  && machineSource.includes('saveService.data.machineLevel'),
  'Machine mass and level are persisted and restored through SaveService.');
record('PULL_MULTIPLIER_REACHES_RUNTIME', managerSource.includes('getSuctionPullMultiplier()')
  && objectSource.includes('suctionPullMultiplier')
  && read('cocos/assets/scripts/gameplay/SuctionMotion.ts').includes('pullMultiplier'),
  'The level-specific pull multiplier reaches the production suction calculator.');

console.log('[PASS] S5 machine evolution/compression contract (implementation-level, non-renderer).');
console.log('[NOTE] Browser runtime evidence remains acceptance:p0b; no QA setter was used.');
