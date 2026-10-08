/**
 * V9 §42 — sound-effect asset contract (source-level, non-runtime).
 *
 * Locks the things that would silently rot:
 *
 *  1. Every clip `AudioAssetLibrary` declares exists on disk, and nothing is
 *     declared that is not there. A renamed or deleted file would otherwise only
 *     show up as a silent game.
 *  2. Every clip is a real PCM WAV at the format the generator promises. A file
 *     that is a header with no frames, or the wrong sample width, plays as
 *     nothing or as noise.
 *  3. **No clip is silent.** §42 forbids claiming audio is done with silent
 *     placeholder assets, so a zero-peak file fails here rather than passing as
 *     "present".
 *  4. The declared pitch shape matches the intent: absorb and upgrade rise, kill,
 *     swallow and death fall. This is what makes the six cues distinguishable at
 *     a glance rather than six variations of a blip -- measured with a hysteresis
 *     zero-crossing count, because a plain one is swamped by the noise transient
 *     these effects carry.
 *
 * It deliberately does NOT claim the audio is production-ready: these are
 * provisional synthesis, and the release checklist still needs licensed assets.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => existsSync(path.join(root, relative));

const AUDIO_DIR = 'cocos/assets/game_art/audio';
const LIBRARY = 'cocos/assets/scripts/audio/AudioAssetLibrary.ts';

// ---- 1. declared paths match the files on disk -----------------------------
const library = read(LIBRARY);
const declared = [...library.matchAll(/'(audio\/[A-Za-z0-9_]+)'/g)].map((match) => match[1]);
assert(declared.length >= 6, `AudioAssetLibrary declares only ${declared.length} clip paths`);
for (const declaredPath of declared) {
  assert(exists(`${AUDIO_DIR}/${path.basename(declaredPath)}.wav`),
    `AudioAssetLibrary declares ${declaredPath}, but the .wav does not exist`);
}
const declaredNames = new Set(declared.map((p) => path.basename(p)));
for (const name of ['sfx_absorb', 'sfx_swallow', 'sfx_upgrade', 'sfx_kill', 'sfx_death', 'sfx_button']) {
  assert(declaredNames.has(name), `§42 names this cue but the library does not declare it: ${name}`);
}

// ---- 2/3/4. each clip is real, audible, and shaped as intended -------------
/** Read a PCM WAV as {sampleRate, channels, bits, samples: Int16Array}. */
function readWav(relative) {
  const buffer = readFileSync(path.join(root, relative));
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF', `${relative} is not a RIFF file`);
  assert.equal(buffer.toString('ascii', 8, 12), 'WAVE', `${relative} is not a WAVE file`);
  assert.equal(buffer.toString('ascii', 12, 16), 'fmt ', `${relative} has no fmt chunk`);
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bits = buffer.readUInt16LE(34);
  const dataAt = buffer.indexOf('data', 12, 'ascii');
  assert(dataAt > 0, `${relative} has no data chunk`);
  const bytes = buffer.readUInt32LE(dataAt + 4);
  const count = Math.floor(bytes / 2);
  const samples = new Int16Array(count);
  for (let i = 0; i < count; i += 1) samples[i] = buffer.readInt16LE(dataAt + 8 + i * 2);
  return { channels, sampleRate, bits, samples };
}

/** Hysteresis zero-crossing rate, in Hz. A plain count is swamped by noise. */
function pitchHz(samples, fraction = 0.35) {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak === 0) return 0;
  const hi = peak * fraction;
  const lo = -peak * fraction;
  let state = 0;
  let crossings = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i];
    if (state <= 0 && v >= hi) {
      if (state < 0) crossings += 1;
      state = 1;
    } else if (state >= 0 && v <= lo) {
      if (state > 0) crossings += 1;
      state = -1;
    }
  }
  return (crossings / Math.max(1, samples.length)) * 22050;
}

/** rise / fall / steady, comparing the first and last third. */
function shape(samples) {
  const third = Math.floor(samples.length / 3);
  const head = pitchHz(samples.subarray(0, third));
  const tail = pitchHz(samples.subarray(samples.length - third));
  if (tail > head * 1.15) return 'rise';
  if (head > tail * 1.15) return 'fall';
  return 'steady';
}

const EXPECTED_SHAPE = {
  sfx_absorb: 'rise',
  sfx_upgrade: 'rise',
  sfx_kill: 'fall',
  sfx_swallow: 'fall',
  sfx_death: 'fall',
  // A fixed-pitch tick whose envelope decays: the shape measure reports the
  // envelope, not the pitch, so it is not asserted.
  sfx_button: 'any',
};

for (const declaredPath of declared) {
  const name = path.basename(declaredPath);
  const relative = `${AUDIO_DIR}/${name}.wav`;
  const wav = readWav(relative);
  assert.equal(wav.channels, 1, `${name} must be mono`);
  assert.equal(wav.sampleRate, 44100, `${name} must be 44.1 kHz`);
  assert.equal(wav.bits, 16, `${name} must be 16-bit PCM`);
  assert(wav.samples.length > 1000, `${name} has almost no audio data`);

  let peak = 0;
  for (let i = 0; i < wav.samples.length; i += 1) peak = Math.max(peak, Math.abs(wav.samples[i]));
  // §42: a silent file must fail, not count as a delivered cue.
  assert(peak > 3000, `${name} is effectively silent (peak ${peak}/32767)`);
  assert(peak <= 32767, `${name} peak out of range`);

  const expected = EXPECTED_SHAPE[name];
  if (expected && expected !== 'any') {
    assert.equal(shape(wav.samples), expected,
      `${name} should ${expected}, but measured ${shape(wav.samples)}`);
  }
  console.log(`[PASS] ${name}: ${(wav.samples.length / 44100 * 1000).toFixed(0)} ms,`
    + ` peak ${peak}, shape ${shape(wav.samples)}`);
}

console.log(`[PASS] audio asset contract: ${declared.length} real, audible, correctly shaped cues `
  + '(NON_RUNTIME; the runtime play path is covered by verify:audio).');
