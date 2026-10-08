/**
 * Generate the game's sound effects.
 *
 * These are **provisional**: synthesised here so the audio path is real, audible
 * and testable end to end, rather than shipping empty AudioSources. §42 forbids
 * claiming completion with silent placeholder assets, so these make actual
 * sound; what they are not is licensed production audio, and the release
 * checklist still needs the owner to supply or buy that.
 *
 * Generating rather than committing opaque binaries keeps the assets reviewable:
 * the character of each sound is a few lines of oscillator and envelope below,
 * so changing one is a code change rather than a file swap.
 *
 * Output: 44.1 kHz, 16-bit mono PCM WAV under `game_art/audio/`.
 * Run: node scripts/generate_audio_sfx.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const outDir = path.join(repoRoot, 'cocos', 'assets', 'game_art', 'audio');

const SAMPLE_RATE = 44100;
/** Peak amplitude. Leaves headroom so six effects can overlap without clipping. */
const PEAK = 0.42;

const TAU = Math.PI * 2;

/** Exponential decay envelope: 1 at t=0, ~0 at t=duration. */
const decay = (t, duration, curve) => Math.exp(-curve * (t / duration));

/** Short raised-cosine attack so a clip never starts with a click. */
const attack = (t, seconds) => (t >= seconds ? 1 : 0.5 - 0.5 * Math.cos((t / seconds) * Math.PI));

/** Linear ramp from `from` to `to` over the clip. */
const sweep = (t, duration, from, to) => from + (to - from) * (t / duration);

/** Deterministic noise, so regenerating produces byte-identical files. */
function noiseAt(index) {
  const x = Math.sin(index * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

const sine = (phase) => Math.sin(phase);
const triangle = (phase) => (2 / Math.PI) * Math.asin(Math.sin(phase));
const square = (phase) => (Math.sin(phase) >= 0 ? 1 : -1);

/**
 * Render one effect.
 * @param {object} spec
 * @param {number} spec.seconds
 * @param {(t: number, index: number) => number} spec.sample
 */
function render(spec) {
  const total = Math.floor(SAMPLE_RATE * spec.seconds);
  const samples = new Float64Array(total);
  let phase = 0;
  let peak = 0;
  for (let i = 0; i < total; i += 1) {
    const t = i / SAMPLE_RATE;
    // Phase is integrated per sample so a frequency sweep stays continuous.
    phase += (TAU * spec.frequency(t, spec.seconds)) / SAMPLE_RATE;
    const value = spec.sample(t, phase, i, spec.seconds);
    samples[i] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  const gain = peak > 0 ? PEAK / peak : 0;
  const pcm = Buffer.alloc(total * 2);
  for (let i = 0; i < total; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] * gain));
    pcm.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }
  return pcm;
}

function wav(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);          // PCM chunk size
  header.writeUInt16LE(1, 20);           // format = PCM
  header.writeUInt16LE(1, 22);           // channels = mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32);           // block align
  header.writeUInt16LE(16, 34);          // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * The six moments §42 names: absorb, swallow, upgrade, kill, death, button.
 * Each is deliberately short -- these fire many times per second during play.
 */
const EFFECTS = {
  // 吸附: a quick rising blip as the field takes hold.
  sfx_absorb: {
    seconds: 0.18,
    frequency: (t, d) => sweep(t, d, 320, 760),
    sample: (t, phase, _i, d) => sine(phase) * decay(t, d, 5.5) * attack(t, 0.004),
  },
  // 吞噬: a low thump plus a transient, so it lands with weight.
  sfx_swallow: {
    seconds: 0.26,
    frequency: (t, d) => sweep(t, d, 190, 110),
    sample: (t, phase, i, d) => (
      (triangle(phase) * 0.8 + noiseAt(i) * 0.2 * decay(t, d, 18)) * decay(t, d, 6) * attack(t, 0.003)
    ),
  },
  // 升级: an ascending triad, the only sound long enough to be melodic.
  sfx_upgrade: {
    seconds: 0.70,
    frequency: (t, d) => {
      const step = Math.min(2, Math.floor((t / d) * 3));
      return [523.25, 659.25, 783.99][step]; // C5 E5 G5
    },
    sample: (t, phase, _i, d) => (
      (sine(phase) * 0.7 + triangle(phase * 2) * 0.3) * decay(t, d, 2.4) * attack(t, 0.006)
    ),
  },
  // 击杀: a downward snap, clearly distinct from the upgrade triad.
  sfx_kill: {
    seconds: 0.32,
    frequency: (t, d) => sweep(t, d, 900, 220),
    sample: (t, phase, i, d) => (
      (square(phase) * 0.5 + sine(phase) * 0.5 + noiseAt(i) * 0.25 * decay(t, d, 30))
      * decay(t, d, 5) * attack(t, 0.002)
    ),
  },
  // 死亡: the longest fall, so defeat reads as heavier than a kill.
  sfx_death: {
    seconds: 0.60,
    frequency: (t, d) => sweep(t, d, 420, 70),
    sample: (t, phase, i, d) => (
      (triangle(phase) * 0.8 + noiseAt(i) * 0.1) * decay(t, d, 2.6) * attack(t, 0.008)
    ),
  },
  // 按钮: a very short tick; it must not become fatiguing.
  sfx_button: {
    seconds: 0.09,
    frequency: () => 1180,
    sample: (t, phase, _i, d) => sine(phase) * decay(t, d, 12) * attack(t, 0.002),
  },
};

mkdirSync(outDir, { recursive: true });

for (const [name, spec] of Object.entries(EFFECTS)) {
  const bytes = wav(render(spec));
  const file = path.join(outDir, `${name}.wav`);
  writeFileSync(file, bytes);
  console.log(`${name}.wav: ${(bytes.length / 1024).toFixed(1)} KB, ${(spec.seconds * 1000).toFixed(0)} ms`);
}
console.log(`\nwrote ${Object.keys(EFFECTS).length} provisional effects to ${path.relative(repoRoot, outDir)}`);
