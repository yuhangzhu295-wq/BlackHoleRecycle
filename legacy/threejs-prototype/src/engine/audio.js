/**
 * 统一音效管理器 (WebAudio API + 小游戏原生 InnerAudioContext 合成器)
 * 为《黑洞回收站》量身定制：
 * 包含吸力呼啸、物品吞噬、阶梯连击上升音、机器进化号角、液压压缩金属冲击、金币叮咚、磁暴重低音与按钮点击
 */

class AudioManager {
  constructor() {
    this.enabled = true;
    this.sfxEnabled = true;
    this.musicEnabled = true;
    this.audioCtx = null;
    this.bgmOsc = null;
    this.initAudioContext();
  }

  initAudioContext() {
    try {
      const AudioContextClass = (typeof window !== 'undefined') ? (window.AudioContext || window.webkitAudioContext) : null;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    } catch (e) {
      console.warn('[Audio] WebAudio not supported, audio disabled', e);
    }
  }

  resumeCtx() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  setSettings(settings) {
    if (settings.sfx !== undefined) this.sfxEnabled = !!settings.sfx;
    if (settings.music !== undefined) this.musicEnabled = !!settings.music;
    if (!this.musicEnabled && this.bgmOsc) {
      this.stopBgm();
    }
  }

  // 1. 吸力呼啸音效 (Suction Whoosh)
  playSuction(pitch = 1.0) {
    if (!this.sfxEnabled || !this.audioCtx) return;
    this.resumeCtx();
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140 * pitch, now);
      osc.frequency.exponentialRampToValueAtTime(320 * pitch, now + 0.15);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {}
  }

  // 2. 物品吞噬进入黑洞音效 (Object Absorb Pop)
  playAbsorb(tier = 1) {
    if (!this.sfxEnabled || !this.audioCtx) return;
    this.resumeCtx();
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      const baseFreq = 420 - Math.min(tier * 50, 200);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 2.2, now + 0.08);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.08);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {}
  }

  // 3. 动态阶梯连击音效 (Combo Pitch Chime)
  playCombo(combo = 1) {
    if (!this.sfxEnabled || !this.audioCtx) return;
    this.resumeCtx();
    try {
      const now = this.audioCtx.currentTime;
      const baseFreq = 400 + Math.min(combo * 35, 750);
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, now + 0.1);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.1);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch (e) {}
  }

  // 4. 机器进化号角 (Evolution Fanfare)
  playEvolution() {
    if (!this.sfxEnabled || !this.audioCtx) return;
    this.resumeCtx();
    try {
      const now = this.audioCtx.currentTime;
      const chords = [523.25, 659.25, 783.99, 1046.50]; // C - E - G - High C
      chords.forEach((freq, idx) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        const t = now + idx * 0.09;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.35);
      });
    } catch (e) {}
  }

  // 5. 机械液压压缩金属冲击声 (Hydraulic Compression Crunch)
  playCompress() {
    if (!this.sfxEnabled || !this.audioCtx) return;
    this.resumeCtx();
    try {
      const now = this.audioCtx.currentTime;
      const bufferSize = this.audioCtx.sampleRate * 0.35;
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.audioCtx.sampleRate * 0.08));
      }

      const noise = this.audioCtx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, now);
      filter.frequency.linearRampToValueAtTime(80, now + 0.35);

      const gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.audioCtx.destination);
      noise.start(now);
      noise.stop(now + 0.35);
    } catch (e) {}
  }

  // 6. 金币入账清脆声 (Coin Chime)
  playCoin() {
    if (!this.sfxEnabled || !this.audioCtx) return;
    this.resumeCtx();
    try {
      const now = this.audioCtx.currentTime;
      const notes = [987.77, 1318.51]; // B5 -> E6
      notes.forEach((freq, idx) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        const t = now + idx * 0.06;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.005, t + 0.15);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.15);
      });
    } catch (e) {}
  }

  // 7. 磁暴重低音能量爆发 (Magnet Storm Energy Bass Drop)
  playMagnetStorm() {
    if (!this.sfxEnabled || !this.audioCtx) return;
    this.resumeCtx();
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.6);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.6);
    } catch (e) {}
  }

  // 8. 界面点击提示音 (UI Button Click)
  playClick() {
    if (!this.sfxEnabled || !this.audioCtx) return;
    this.resumeCtx();
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {}
  }

  // 9. 区域解锁庆祝音效 (Region Unlock Jingle)
  playUnlock() {
    if (!this.sfxEnabled || !this.audioCtx) return;
    this.resumeCtx();
    try {
      const now = this.audioCtx.currentTime;
      const notes = [440, 554.37, 659.25, 880];
      notes.forEach((freq, idx) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        const t = now + idx * 0.08;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.22, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.25);
      });
    } catch (e) {}
  }
}

export const audio = new AudioManager();
