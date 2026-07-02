// AudioEngine: procedural chiptune music (100% original compositions) + SFX via Web Audio.
// Each level has a "song spec" {bpm, root, scale, prog, drums, bass, lead, seed, name, artist}
// and the engine composes a deterministic track from it in real time.
'use strict';

const SCALES = {
  minor:      [0, 2, 3, 5, 7, 8, 10],
  major:      [0, 2, 4, 5, 7, 9, 11],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  phrygian:   [0, 1, 3, 5, 7, 8, 10],
  harmMinor:  [0, 2, 3, 5, 7, 8, 11],
  minorPent:  [0, 3, 5, 7, 10],
};

const AudioEngine = {
  ctx: null,
  masterGain: null, musicGain: null, sfxGain: null,
  song: null,
  songStart: 0,
  nextStepTime: 0,
  stepIndex: 0,
  schedTimer: null,
  musicVolume: 0.7,
  sfxVolume: 0.8,
  rngCache: {},

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.9;
    this.masterGain.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.masterGain);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.masterGain);
    // gentle compressor to keep the mix from clipping
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    this.masterGain.disconnect();
    this.masterGain.connect(comp); comp.connect(this.ctx.destination);
  },

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  setMusicVolume(v) { this.musicVolume = v; if (this.musicGain) this.musicGain.gain.value = v; },
  setSfxVolume(v) { this.sfxVolume = v; if (this.sfxGain) this.sfxGain.gain.value = v; },

  midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); },

  // ================= MUSIC =================
  playSong(spec, offsetSec = 0) {
    this.init(); this.resume();
    this.stopMusic();
    this.song = spec;
    const stepDur = 60 / spec.bpm / 4; // 16th notes
    this.stepIndex = Math.max(0, Math.floor(offsetSec / stepDur));
    this.songStart = this.ctx.currentTime - this.stepIndex * stepDur;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.schedTimer = setInterval(() => this._scheduler(), 25);
  },

  stopMusic() {
    if (this.schedTimer) { clearInterval(this.schedTimer); this.schedTimer = null; }
    this.song = null;
  },

  musicTime() {
    if (!this.song || !this.ctx) return 0;
    return this.ctx.currentTime - this.songStart;
  },

  _scheduler() {
    if (!this.song) return;
    const spec = this.song;
    const stepDur = 60 / spec.bpm / 4;
    while (this.nextStepTime < this.ctx.currentTime + 0.14) {
      this._scheduleStep(this.stepIndex, this.nextStepTime, stepDur, spec);
      this.nextStepTime += stepDur;
      this.stepIndex++;
    }
  },

  // deterministic per-bar random values so the tune is stable & loopable
  _barRng(spec, bar, salt) {
    const key = spec.seed + '|' + (bar % spec.loopBars) + '|' + salt;
    if (!(key in this.rngCache)) {
      this.rngCache[key] = makeRNG(hashSeed(key)).next();
      // cap cache size
      const keys = Object.keys(this.rngCache);
      if (keys.length > 4000) this.rngCache = {};
    }
    return this.rngCache[key];
  },

  _scheduleStep(step, t, stepDur, spec) {
    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    const section = Math.floor(bar / 8) % 4; // 0 intro-ish, 1..3 fuller
    const scale = SCALES[spec.scale] || SCALES.minor;
    const chordDeg = spec.prog[Math.floor(bar / (spec.barsPerChord || 1)) % spec.prog.length];
    const chordRootMidi = spec.root + this._degToSemis(scale, chordDeg);

    // --- drums ---
    const D = spec.drums; // e.g. 'four' | 'breaks' | 'half'
    const drumsOn = section >= 1 || bar % 8 >= 4;
    if (drumsOn) {
      if (D === 'four') {
        if (s16 % 4 === 0) this._kick(t);
        if (s16 === 4 || s16 === 12) this._snare(t);
        if (s16 % 2 === 0) this._hat(t, s16 % 4 === 2 ? 0.5 : 0.25);
      } else if (D === 'half') {
        if (s16 === 0 || s16 === 10) this._kick(t);
        if (s16 === 8) this._snare(t);
        if (s16 % 4 === 0) this._hat(t, 0.3);
      } else { // 'breaks'
        if (s16 === 0 || s16 === 6 || s16 === 10) this._kick(t);
        if (s16 === 4 || s16 === 12) this._snare(t);
        if (s16 % 2 === 1) this._hat(t, 0.2);
      }
      // fill at end of 8-bar phrase
      if (bar % 8 === 7 && s16 >= 12) this._snare(t, 0.4 + (s16 - 12) * 0.15);
    }

    // --- bass ---
    const bassOn = true;
    if (bassOn) {
      const B = spec.bass;
      let play = false, note = chordRootMidi - 24, dur = stepDur * 0.9;
      if (B === 'eighth') play = s16 % 2 === 0;
      else if (B === 'offbeat') play = s16 % 4 === 2;
      else if (B === 'pump') { play = s16 % 4 === 0 || s16 % 8 === 6; dur = stepDur * (s16 % 4 === 0 ? 1.8 : 0.9); }
      else play = s16 === 0 || s16 === 8; // 'slow'
      if (play) {
        const octJump = this._barRng(spec, bar, 'bo' + s16) < 0.15;
        this._tone(note + (octJump ? 12 : 0), t, dur, 'square', 0.16, 500);
      }
    }

    // --- pad chords (soft) on chord changes ---
    if (s16 === 0 && bar % (spec.barsPerChord || 1) === 0 && section >= 1) {
      const chordSemis = [0, 2, 4].map(ci => this._degToSemis(scale, chordDeg + ci));
      for (const semi of chordSemis) {
        this._tone(spec.root + semi, t, stepDur * 16 * (spec.barsPerChord || 1) * 0.95, 'sawtooth', 0.035, 900, 0.4);
      }
    }

    // --- lead melody: seeded per bar ---
    const L = spec.lead;
    const leadOn = section >= 1 || bar % 8 >= 2;
    if (leadOn) {
      if (L === 'arp') {
        if (s16 % 2 === 0) {
          const arpNotes = [0, 2, 4, 7]; // chord degrees + octave
          const idx = (s16 / 2) % arpNotes.length;
          const semi = this._degToSemis(scale, chordDeg + arpNotes[idx]);
          this._tone(spec.root + 12 + semi, t, stepDur * 0.85, spec.leadWave || 'square', 0.09, 2600);
        }
      } else if (L === 'riff') {
        // 8-step motif repeated, seeded once per loop
        const motifStep = s16 % 8;
        const rOn = this._barRng(spec, 0, 'riffOn' + motifStep) < 0.7;
        if (rOn && s16 % 2 === 0) {
          const dg = Math.floor(this._barRng(spec, 0, 'riffN' + motifStep) * 6);
          const semi = this._degToSemis(scale, chordDeg + dg);
          this._tone(spec.root + 12 + semi, t, stepDur * 0.8, spec.leadWave || 'square', 0.09, 2400);
        }
      } else { // 'melody' — per-bar generated phrase
        const on = this._barRng(spec, bar, 'mOn' + s16) < (s16 % 4 === 0 ? 0.85 : 0.42);
        if (on && s16 % 2 === 0) {
          const drift = Math.floor(this._barRng(spec, bar, 'mN' + s16) * 8) - 2;
          const semi = this._degToSemis(scale, chordDeg + Math.max(0, drift));
          const dur = this._barRng(spec, bar, 'mD' + s16) < 0.3 ? stepDur * 3.4 : stepDur * 1.6;
          this._tone(spec.root + 12 + semi, t, dur, spec.leadWave || 'square', 0.085, 2600);
        }
      }
    }
  },

  _degToSemis(scale, deg) {
    const n = scale.length;
    const oct = Math.floor(deg / n);
    const idx = ((deg % n) + n) % n;
    return oct * 12 + scale[idx];
  },

  // basic synth voice
  _tone(midi, t, dur, wave, vol, cutoff, attack) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = this.midiToFreq(midi);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = cutoff || 3000;
    const g = ctx.createGain();
    const atk = attack || 0.008;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.setValueAtTime(vol, t + Math.max(atk, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(filt); filt.connect(g); g.connect(this.musicGain);
    osc.start(t); osc.stop(t + dur + 0.05);
  },

  _kick(t, vol = 0.5) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g); g.connect(this.musicGain);
    osc.start(t); osc.stop(t + 0.2);
  },

  _noiseBuf() {
    if (!this._nb) {
      const len = this.ctx.sampleRate * 0.4;
      this._nb = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._nb.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this._nb;
  },

  _snare(t, vol = 0.3) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this._noiseBuf();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    src.connect(bp); bp.connect(g); g.connect(this.musicGain);
    src.start(t); src.stop(t + 0.15);
  },

  _hat(t, vol = 0.25) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this._noiseBuf();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 8000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(hp); hp.connect(g); g.connect(this.musicGain);
    src.start(t); src.stop(t + 0.06);
  },

  // ================= SFX =================
  _sfxTone(freq0, freq1, dur, wave, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq0, t);
    if (freq1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t); osc.stop(t + dur + 0.02);
  },

  sfxDeath() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf();
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(g); g.connect(this.sfxGain);
    src.start(t); src.stop(t + 0.4);
    this._sfxTone(400, 60, 0.35, 'sawtooth', 0.3);
  },

  sfxWin() {
    if (!this.ctx) return;
    const notes = [72, 76, 79, 84, 88];
    notes.forEach((n, i) => {
      const t = this.ctx.currentTime + i * 0.09;
      const osc = this.ctx.createOscillator(); osc.type = 'square';
      osc.frequency.value = this.midiToFreq(n);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(g); g.connect(this.sfxGain);
      osc.start(t); osc.stop(t + 0.4);
    });
  },

  sfxOrb() { this._sfxTone(700, 1300, 0.09, 'square', 0.15); },
  sfxPad() { this._sfxTone(300, 900, 0.12, 'square', 0.15); },
  sfxPortal() { this._sfxTone(500, 1500, 0.2, 'sine', 0.2); },
  sfxCoin() { this._sfxTone(1200, 2100, 0.15, 'square', 0.15); setTimeout(() => this._sfxTone(1800, 2600, 0.18, 'square', 0.12), 70); },
  sfxClick() { this._sfxTone(900, 500, 0.05, 'square', 0.1); },
  sfxBuy() { [800, 1000, 1300].forEach((f, i) => setTimeout(() => this._sfxTone(f, f * 1.1, 0.1, 'square', 0.12), i * 60)); },
  sfxUnlock() { [500, 700, 900, 1200].forEach((f, i) => setTimeout(() => this._sfxTone(f, f, 0.14, 'triangle', 0.15), i * 80)); },
  sfxDeny() { this._sfxTone(300, 200, 0.18, 'sawtooth', 0.15); },
  sfxCheckpoint() { this._sfxTone(600, 900, 0.1, 'sine', 0.12); },
};

if (typeof module !== 'undefined') module.exports = { AudioEngine, SCALES };
