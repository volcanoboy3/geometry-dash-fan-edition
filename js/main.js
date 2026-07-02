// Boot + persistent save data (localStorage).
'use strict';

const Save = {
  KEY: 'gd-fan-save-v1',
  data: null,

  defaults() {
    return {
      username: 'Player',
      orbs: 0,
      stars: 0,
      coins: 0,           // secret coins
      completions: {},    // levelId → {best, practiceBest, done, coins:[], orbsBanked, attempts}
      downloaded: [],
      myLevels: [],
      published: [],      // full level objects published from the editor
      shopBought: [],
      icons: {
        selected: { cube: 0, ship: 0, ball: 0, ufo: 0, wave: 0, robot: 0, spider: 0 },
        unlocked: { cube: [0], ship: [0], ball: [0], ufo: [0], wave: [0], robot: [0], spider: [0] },
        colorP: '#7dff00',
        colorS: '#00ffff',
        unlockedColors: ['#7dff00', '#00ffff', '#00c8ff', '#0078ff', '#00ff7d', '#ff4b00', '#ff9600', '#c8c8c8', '#787878', '#3c3cff', '#7d00ff', '#b900ff', '#ff0078', '#ffc800', '#c8ff00'],
      },
      vaultUsed: [],
      secrets: {},
      gauntlets: {},      // gid → [bool,bool,bool]
      settings: { music: 0.7, sfx: 0.8 },
    };
  },

  read() {
    try {
      const raw = localStorage.getItem(this.KEY);
      this.data = raw ? Object.assign(this.defaults(), JSON.parse(raw)) : this.defaults();
    } catch (e) {
      this.data = this.defaults();
    }
    // deep-merge icons (in case of older saves)
    const d = this.defaults();
    this.data.icons = Object.assign(d.icons, this.data.icons || {});
    this.data.settings = Object.assign(d.settings, this.data.settings || {});
    this.data.secrets = this.data.secrets || {};
  },

  write() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* full */ }
  },

  addOrbs(n) { this.data.orbs += n; this.write(); },

  comp(levelId) {
    if (!this.data.completions[levelId]) {
      this.data.completions[levelId] = { best: 0, practiceBest: 0, done: false, coins: [], orbsBanked: 0, attempts: 0 };
    }
    return this.data.completions[levelId];
  },

  // partial orb banking on death: floor(orbs × 0.8 × pct/100), best-so-far
  bankProgress(level, pct) {
    const meta = diffById(level.difficulty);
    if (!meta.orbs || level.id.startsWith('my-')) return;
    const c = this.comp(level.id);
    c.attempts++;
    if (pct > c.best) c.best = pct;
    const target = Math.floor(meta.orbs * 0.8 * c.best / 100);
    if (target > c.orbsBanked && !c.done) {
      this.data.orbs += target - c.orbsBanked;
      c.orbsBanked = target;
    }
    this.write();
  },

  completeLevel(level, sess) {
    const c = this.comp(level.id);
    const meta = diffById(level.difficulty);
    const award = { orbs: 0, stars: 0, coins: 0, firstTime: false, gauntletDone: null };
    c.attempts += 1;

    if (sess.practice) {
      c.practiceBest = 100;
      this.write();
      return award;
    }
    c.best = 100;

    // coins collected this run (persist only on completion, like real GD)
    const runCoins = sess.run.coinsGot.size;
    const newCoins = Math.max(0, runCoins - (c.coins ? c.coins.length : 0));
    if (runCoins > (c.coins ? c.coins.length : 0)) {
      c.coins = Array.from({ length: runCoins }, (_, i) => i);
      this.data.coins += newCoins;
      award.coins = newCoins;
    }

    if (!c.done) {
      c.done = true;
      award.firstTime = true;
      if (!level.id.startsWith('my-')) {
        award.stars = level.stars || meta.stars;
        this.data.stars += award.stars;
        const fullOrbs = meta.orbs || 0;
        award.orbs = Math.max(0, fullOrbs - (c.orbsBanked || 0));
        this.data.orbs += award.orbs;
        c.orbsBanked = fullOrbs;
      }
      // gauntlet completion check
      if (level.id.startsWith('g-')) {
        const [, gid, idxStr] = level.id.split('-');
        const arr = this.gauntletProgress(gid);
        arr[parseInt(idxStr, 10)] = true;
        this.data.gauntlets[gid] = arr;
        const g = GAUNTLETS.find(x => x.id === gid);
        if (g && arr.every(Boolean) && !this.data.secrets['gauntlet-' + gid]) {
          this.data.secrets['gauntlet-' + gid] = true;
          this.data.orbs += g.reward;
          award.gauntletDone = g;
          // exclusive icon per gauntlet
          const iconMap = {
            fire: ['cube', 2], ice: ['ship', 4], shadow: ['ball', 4],
            lava: ['ufo', 3], chaos: ['robot', 3],
          };
          const [m, d] = iconMap[gid] || ['cube', 6];
          this.unlockIcon(m, d);
        }
      }
    }
    this.write();
    return award;
  },

  gauntletProgress(gid) {
    return (this.data.gauntlets[gid] || [false, false, false]).slice();
  },

  // ---------- icons ----------
  unlockIcon(mode, design) {
    const u = this.data.icons.unlocked[mode] || (this.data.icons.unlocked[mode] = [0]);
    if (!u.includes(design)) u.push(design);
    this.write();
  },
  iconUnlocked(mode, design) {
    return (this.data.icons.unlocked[mode] || [0]).includes(design);
  },
  colorUnlocked(col) {
    return this.data.icons.unlockedColors.includes(col);
  },

  // ---------- my levels / publishing ----------
  upsertMyLevel(doc) {
    const i = this.data.myLevels.findIndex(l => l.id === doc.id);
    if (i >= 0) this.data.myLevels[i] = doc;
    else this.data.myLevels.unshift(doc);
    this.write();
  },
  deleteMyLevel(id) {
    this.data.myLevels = this.data.myLevels.filter(l => l.id !== id);
    this.unpublishLevel(id);
    this.write();
  },
  publishLevel(level) {
    level.downloads = 0;
    level.likes = 0;
    this.unpublishLevel(level.id);
    this.data.published.unshift(level);
    this.write();
  },
  unpublishLevel(id) {
    this.data.published = this.data.published.filter(l => l.id !== id);
    this.write();
  },

  // ---------- the Vault ----------
  tryVaultCode(code) {
    const used = this.data.vaultUsed;
    const give = (key, msg, rewardText, fn) => {
      if (used.includes(key)) return { ok: false, msg: '"You already used that one. I never forget. NEVER."' };
      used.push(key);
      fn();
      this.write();
      return { ok: true, msg: msg, reward: rewardText };
    };
    switch (code) {
      case 'lenny':
        return give('lenny', '"Ugh, that smug face. FINE, take the cube."', '🔓 Happy Cube unlocked!', () => this.unlockIcon('cube', 5));
      case 'spooky':
        return give('spooky', '"WHAT!? How did you know my name!?"', '🔓 Skull Cube unlocked!', () => this.unlockIcon('cube', 7));
      case 'blockbite':
        return give('blockbite', '"Chomp chomp. Here\'s your flying saucer."', '🔓 Tri-Light UFO unlocked!', () => this.unlockIcon('ufo', 2));
      case 'neverending':
        return give('neverending', '"It never ends, does it? Take the UFO and go."', '🔓 Lamp UFO unlocked!', () => this.unlockIcon('ufo', 1));
      case 'mule':
        return give('mule', '"A mule? In space? Whatever, enjoy the ship."', '🔓 Racer Ship unlocked!', () => this.unlockIcon('ship', 3));
      case 'ahead':
        return give('ahead', '"Always one step ahead, huh."', '🔓 Bullseye Wave unlocked!', () => this.unlockIcon('wave', 4));
      case 'robotop':
        return give('robotop', '"Beep boop. He said you\'d come."', '🔓 Antenna Bot unlocked!', () => this.unlockIcon('robot', 2));
      case 'sparky':
        return give('sparky', '"You found my dog\'s name!? Take his favorite coin."', '🪙 SECRET COIN found!', () => { this.data.coins++; });
      case 'octocube':
        return give('octocube', '"Eight legs, six faces. Math checks out."', '🔓 Fang Spider unlocked!', () => this.unlockIcon('spider', 2));
      case 'seven':
        return give('seven', '"Lucky number! Here\'s some shiny stuff."', '✨ +300 mana orbs!', () => { this.data.orbs += 300; });
      case 'brainpower':
        return give('brainpower', '"O-oooooooooo AAAAE-A-A-I-A-U… ahem. Nothing."', '✨ +200 mana orbs!', () => { this.data.orbs += 200; });
      case 'finalboss':
        return give('finalboss', '"You haven\'t even MET the final boss. Cheeky."', '🔓 Circuit Cube unlocked!', () => this.unlockIcon('cube', 6));
      default:
        if (code === this.data.username.toLowerCase()) {
          return give('self', '"Talking to yourself? Concerning. Rewarding, though."', '✨ +100 mana orbs!', () => { this.data.orbs += 100; });
        }
        const sass = [
          '"No."', '"Not even close."', '"Did you just mash the keyboard?"',
          '"I\'ve heard better codes from a sleeping fish."', '"Try harder, cube."',
          '"Hint: my name is written on my face."', '"Hint: a certain dog likes coins."',
          '"Hint: what never ends?"',
        ];
        return { ok: false, msg: sass[Math.floor(Math.random() * sass.length)] };
    }
  },
};

// ---------- boot ----------
window.addEventListener('DOMContentLoaded', () => {
  Save.read();
  AudioEngine.musicVolume = Save.data.settings.music;
  AudioEngine.sfxVolume = Save.data.settings.sfx;
  UI.init();

  // menu music after first interaction (browser autoplay policy)
  const startMenuMusic = () => {
    AudioEngine.init();
    AudioEngine.setMusicVolume(Save.data.settings.music);
    AudioEngine.setSfxVolume(Save.data.settings.sfx);
    if (!Game.session && !AudioEngine.song) {
      AudioEngine.playSong(makeSong('menu-theme', 'chill', 112, 'Menu Loop', 'SynthBot'));
    }
    window.removeEventListener('pointerdown', startMenuMusic);
  };
  window.addEventListener('pointerdown', startMenuMusic);

  window.addEventListener('resize', () => {
    if (!Game.session && !Editor.active && UI.currentScreen) UI.paintMenuBg(UI.currentScreen);
  });
});
