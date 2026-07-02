// All menu screens, overlays, HUD and navigation.
'use strict';

const UI = {
  screens: {},
  currentScreen: null,
  mainPage: 0,
  searchDiff: null,
  searchText: '',

  // ---------- infrastructure ----------
  init() {
    const root = document.getElementById('ui');
    root.innerHTML = '';
    const mk = (id) => {
      const d = document.createElement('div');
      d.id = 'screen-' + id;
      d.className = 'screen';
      root.appendChild(d);
      this.screens[id] = d;
      return d;
    };
    ['menu', 'mainlevels', 'search', 'mylevels', 'gauntlets', 'gauntlet', 'shop', 'icons', 'vault', 'editor'].forEach(mk);
    this.screens.editor.classList.add('transparent');
    this.screens.editor.innerHTML = '<div id="editor-topbar"></div><div style="flex:1;pointer-events:none"></div><div id="editor-panel"></div>';

    // HUD
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
      <div class="prog-outer"><div class="prog-inner"></div></div>
      <div class="attempt"></div>
      <div class="pct"></div>
      <div class="practice-tag">◆ PRACTICE MODE</div>
      <button class="pause-btn">⏸</button>`;
    root.appendChild(hud);
    hud.querySelector('.pause-btn').onclick = () => Game.togglePause();

    // overlays
    const mkOverlay = (id) => {
      const d = document.createElement('div');
      d.id = 'overlay-' + id;
      d.className = 'overlay';
      root.appendChild(d);
      return d;
    };
    mkOverlay('pause');
    mkOverlay('win');
    mkOverlay('dialog');

    const toastWrap = document.createElement('div');
    toastWrap.id = 'toast-wrap';
    root.appendChild(toastWrap);

    this.buildMenu();
    this.showScreen('menu');
  },

  showScreen(id) {
    for (const key of Object.keys(this.screens)) {
      this.screens[key].classList.toggle('active', key === id);
    }
    this.currentScreen = id;
    if (id && id !== 'editor') this.paintMenuBg(id);
  },

  paintMenuBg(id) {
    // static pretty background on the canvas behind menus
    const canvas = document.getElementById('gamecanvas');
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth * dpr, H = canvas.clientHeight * dpr;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const hues = { menu: 215, mainlevels: 230, search: 260, mylevels: 200, gauntlets: 280, gauntlet: 280, shop: 30, icons: 190, vault: 262 };
    const hue = hues[id] != null ? hues[id] : 215;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `hsl(${hue},65%,38%)`);
    g.addColorStop(1, `hsl(${hue},70%,14%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#fff';
    const size = 90 * dpr;
    for (let x = 0; x < W / size + 1; x++) {
      for (let y = 0; y < H / size + 1; y++) {
        if ((x + y) % 2 === 0) ctx.fillRect(x * size, y * size, size, size);
      }
    }
    ctx.globalAlpha = 1;
    // ground strip
    ctx.fillStyle = `hsl(${hue},72%,22%)`;
    ctx.fillRect(0, H * 0.86, W, H * 0.14);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillRect(0, H * 0.86 - 2, W, 3);
  },

  toast(msg) {
    const wrap = document.getElementById('toast-wrap');
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; }, 2600);
    setTimeout(() => t.remove(), 3100);
  },

  statChips(el) {
    const chips = document.createElement('div');
    chips.className = 'stat-chips';
    chips.innerHTML = `
      <div class="stat-chip"><span class="orb-icon"></span> ${Save.data.orbs}</div>
      <div class="stat-chip">⭐ ${Save.data.stars}</div>
      <div class="stat-chip">🪙 ${Save.data.coins}</div>`;
    el.appendChild(chips);
  },

  backBtn(el, to = 'menu') {
    const b = document.createElement('button');
    b.className = 'gd-btn gray corner-btn left';
    b.textContent = '⬅';
    b.onclick = () => { AudioEngine.sfxClick(); this.showScreen(to); this['render' + to.charAt(0).toUpperCase() + to.slice(1)] && this['render' + to.charAt(0).toUpperCase() + to.slice(1)](); if (to === 'menu') this.buildMenu(); };
    el.appendChild(b);
  },

  // ---------- MAIN MENU ----------
  buildMenu() {
    const el = this.screens.menu;
    el.innerHTML = '';
    this.statChips(el);

    const logo = document.createElement('div');
    logo.id = 'menu-logo';
    logo.textContent = 'GEOMETRY DASH';
    logo.onclick = () => this.logoClicked();
    el.appendChild(logo);
    const sub = document.createElement('div');
    sub.id = 'menu-sub';
    sub.textContent = 'FAN EDITION — original tribute build';
    el.appendChild(sub);

    const row = document.createElement('div');
    row.className = 'menu-row';
    const mkBig = (icon, label, fn, main, grad) => {
      const b = document.createElement('button');
      b.className = 'menu-big-btn' + (main ? ' main' : '');
      if (grad) b.style.background = grad;
      b.innerHTML = `<div class="mi">${icon}</div><div>${label}</div>`;
      b.onclick = () => { AudioEngine.init(); AudioEngine.sfxClick(); fn(); };
      row.appendChild(b);
    };
    mkBig('🛠', 'CREATE', () => { this.showScreen('mylevels'); this.renderMyLevels(); }, false, 'linear-gradient(#ffb13d,#d4720e)');
    mkBig('▶', 'PLAY', () => { this.showScreen('mainlevels'); this.renderMainLevels(); }, true);
    mkBig('🔍', 'SEARCH', () => { this.showScreen('search'); this.renderSearch(); }, false, 'linear-gradient(#3fa9ff,#1c5fd4)');
    el.appendChild(row);

    const row2 = document.createElement('div');
    row2.className = 'menu-small-row';
    const mkSmall = (icon, label, fn) => {
      const b = document.createElement('button');
      b.className = 'gd-btn blue';
      b.innerHTML = icon + ' ' + label;
      b.onclick = () => { AudioEngine.init(); AudioEngine.sfxClick(); fn(); };
      row2.appendChild(b);
    };
    mkSmall('⚔️', 'Gauntlets', () => { this.showScreen('gauntlets'); this.renderGauntlets(); });
    mkSmall('🛒', 'Shop', () => { this.showScreen('shop'); this.renderShop(); });
    mkSmall('🧊', 'Icons', () => { this.showScreen('icons'); this.renderIcons(); });
    mkSmall('⚙️', 'Settings', () => this.settingsDialog());
    el.appendChild(row2);

    // the Vault — a subtle padlock in the top-right corner
    const vaultBtn = document.createElement('button');
    vaultBtn.className = 'gd-btn gray corner-btn right';
    vaultBtn.textContent = '🔒';
    vaultBtn.title = '???';
    vaultBtn.onclick = () => {
      AudioEngine.init();
      if (Save.data.coins < 3) { AudioEngine.sfxDeny(); this.toast('The lock rattles… it wants 3 secret coins.'); return; }
      this.showScreen('vault');
      this.renderVault();
    };
    el.appendChild(vaultBtn);

    // SECRET: a faint coin hiding in the corner
    if (!Save.data.secrets.menuCoin) {
      const c = document.createElement('div');
      c.style.cssText = 'position:absolute;bottom:8px;left:10px;font-size:14px;opacity:.16;cursor:pointer;transition:opacity .3s;';
      c.textContent = '🪙';
      c.onmouseenter = () => c.style.opacity = '.5';
      c.onmouseleave = () => c.style.opacity = '.16';
      c.onclick = () => {
        Save.data.secrets.menuCoin = true;
        Save.data.coins++;
        Save.write();
        AudioEngine.sfxCoin();
        this.toast('🪙 You found a SECRET COIN hiding in the corner!');
        this.buildMenu();
      };
      el.appendChild(c);
    }

    const foot = document.createElement('div');
    foot.style.cssText = 'position:absolute;bottom:8px;right:12px;color:rgba(255,255,255,.4);font-size:11px;font-family:var(--font)';
    foot.textContent = 'v1.0 — ' + Save.data.username;
    el.appendChild(foot);
  },

  logoClicked() {
    this._logoClicks = (this._logoClicks || 0) + 1;
    if (this._logoClicks === 7 && !Save.data.secrets.logoOrbs) {
      Save.data.secrets.logoOrbs = true;
      Save.addOrbs(250);
      AudioEngine.sfxUnlock();
      this.toast('✨ SECRET! The logo showers you with 250 mana orbs!');
      this.buildMenu();
    }
  },

  // ---------- MAIN LEVELS (carousel) ----------
  renderMainLevels() {
    const el = this.screens.mainlevels;
    el.innerHTML = '';
    this.backBtn(el);
    this.statChips(el);

    const n = MAIN_LEVELS.length;
    this.mainPage = Math.max(0, Math.min(this.mainPage, n - 1));
    const cfg = MAIN_LEVELS[this.mainPage];
    const meta = diffById(cfg.difficulty);
    const comp = Save.data.completions['main-' + cfg.n] || {};
    const locked = cfg.coinGate && Save.data.coins < cfg.coinGate;

    const title = document.createElement('div');
    title.className = 'screen-title';
    title.textContent = 'OFFICIAL LEVELS';
    el.appendChild(title);

    const wrap = document.createElement('div');
    wrap.className = 'level-card-wrap';
    wrap.style.marginTop = '18px';

    const mkArrow = (dir) => {
      const a = document.createElement('button');
      a.className = 'arrow-btn';
      a.textContent = dir < 0 ? '◀' : '▶';
      a.onclick = () => {
        AudioEngine.sfxClick();
        this.mainPage = (this.mainPage + dir + n) % n;
        this.renderMainLevels();
      };
      return a;
    };
    wrap.appendChild(mkArrow(-1));

    const card = document.createElement('div');
    card.className = 'level-card';
    const hue = (cfg.n * 37 + 190) % 360;
    card.style.background = `linear-gradient(135deg, hsl(${hue},60%,42%), hsl(${(hue + 40) % 360},65%,28%))`;
    const coinsGot = (comp.coins || []).length;
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <h2>${locked ? '🔒 ' : ''}${cfg.name}</h2>
          <div class="song">♫ ${cfg.name} (tribute mix) — SynthBot · original composition</div>
        </div>
        <div class="diff-badge">
          <div style="font-size:34px">${locked ? '🔒' : meta.face}</div>
          <div>${meta.name}</div>
          <div>⭐ ${cfg.stars}</div>
        </div>
      </div>
      <div style="flex:1"></div>
      <div class="progress-label">Normal Mode ${comp.best || 0}%</div>
      <div class="progress-outer"><div class="progress-inner" style="width:${comp.best || 0}%"></div></div>
      <div class="progress-label">Practice Mode ${comp.practiceBest || 0}%</div>
      <div class="progress-outer"><div class="progress-inner practice" style="width:${comp.practiceBest || 0}%"></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
        <div class="coin-dots">${[0, 1, 2].map(i => `<div class="coin-dot ${i < coinsGot ? 'got' : ''}"></div>`).join('')}</div>
        <div style="font-size:11px;opacity:.8">${locked ? `Collect ${cfg.coinGate} secret coins to unlock (you have ${Save.data.coins})` : (comp.done ? '✓ COMPLETED' : '')}</div>
      </div>`;
    card.onclick = () => {
      if (locked) { AudioEngine.sfxDeny(); this.toast(`Locked! Need ${cfg.coinGate} secret coins.`); return; }
      AudioEngine.sfxClick();
      const level = getMainLevel(cfg.n);
      this.playLevel(level);
    };
    card.style.cursor = locked ? 'default' : 'pointer';
    wrap.appendChild(card);
    wrap.appendChild(mkArrow(1));
    el.appendChild(wrap);

    const dots = document.createElement('div');
    dots.className = 'page-dots';
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'dot' + (i === this.mainPage ? ' on' : '');
      dots.appendChild(d);
    }
    el.appendChild(dots);

    // keyboard navigation
    el.tabIndex = 0;
  },

  // ---------- PLAY ----------
  playLevel(level, opts = {}) {
    this.showScreen(null);
    const meta = diffById(level.difficulty);
    Game.start(level, {
      practice: false,
      onDeath: (sess) => {
        // bank partial orbs at 0.8× proportional rate (like real GD)
        if (!sess.practice) Save.bankProgress(level, sess.bestPct);
      },
      onComplete: (sess) => {
        const award = Save.completeLevel(level, sess);
        Game.stop();
        this.winOverlay(level, sess, award, opts);
      },
    });
  },

  winOverlay(level, sess, award, opts) {
    const ov = document.getElementById('overlay-win');
    ov.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'gd-panel';
    panel.innerHTML = `
      <h2>LEVEL COMPLETE!</h2>
      <div class="stat-line">${level.name}</div>
      <div class="stat-line">Attempts: ${sess.attempts} ${sess.practice ? '· (practice — no rewards)' : ''}</div>
      <div class="stat-line">${award.orbs ? `+${award.orbs} <span class="orb-icon"></span> mana orbs` : ''} ${award.stars ? ` · +${award.stars} ⭐` : ''} ${award.coins ? ` · +${award.coins} 🪙` : ''}</div>
      ${award.firstTime ? '<div class="stat-line" style="color:#9fe88f">FIRST COMPLETION!</div>' : ''}`;
    const row = document.createElement('div');
    row.className = 'row';
    const mkB = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'gd-btn ' + cls;
      b.textContent = label;
      b.onclick = () => { AudioEngine.sfxClick(); ov.classList.remove('active'); fn(); };
      row.appendChild(b);
    };
    mkB('↺ Replay', 'blue', () => this.playLevel(level, opts));
    mkB('☰ Menu', 'green', () => {
      if (opts.returnTo) { this.showScreen(opts.returnTo); (opts.onReturn || (() => {}))(); }
      else { this.showScreen('menu'); this.buildMenu(); }
    });
    panel.appendChild(row);
    ov.appendChild(panel);
    ov.classList.add('active');
    if (award.gauntletDone) {
      setTimeout(() => this.toast(`⚔️ GAUNTLET COMPLETE! +${award.gauntletDone.reward} mana orbs!`), 600);
    }
  },

  // ---------- HUD / pause ----------
  showHUD(on, sess) {
    document.getElementById('hud').classList.toggle('active', on);
    if (on) this.updateHUD(sess);
  },

  updateHUD(sess) {
    if (!sess) return;
    const hud = document.getElementById('hud');
    const p = sess.run.player;
    const pct = Math.min(100, Math.round(p.x / sess.level.length * 100));
    hud.querySelector('.prog-inner').style.width = Math.max(0, pct) + '%';
    hud.querySelector('.attempt').textContent = 'Attempt ' + sess.attempts;
    hud.querySelector('.pct').textContent = Math.max(0, pct) + '%';
    hud.querySelector('.practice-tag').style.display = sess.practice ? 'block' : 'none';
  },

  showPause(sess) {
    const ov = document.getElementById('overlay-pause');
    ov.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'gd-panel';
    panel.innerHTML = `<h2>PAUSED</h2>
      <div class="stat-line">${sess.level.name} — best ${sess.bestPct}%</div>`;
    const row = document.createElement('div');
    row.className = 'row';
    const mkB = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'gd-btn ' + cls;
      b.textContent = label;
      b.onclick = () => { AudioEngine.sfxClick(); fn(); };
      row.appendChild(b);
    };
    mkB('▶ Resume', 'green', () => Game.togglePause());
    mkB(sess.practice ? '◆ Normal Mode' : '◆ Practice', 'blue', () => {
      Game.setPractice(!sess.practice);
      Game.togglePause();
      this.toast(sess.practice ? 'Practice mode ON — auto checkpoints' : 'Back to normal mode');
      Game.restartAttempt(true);
    });
    mkB('↺ Restart', 'orange', () => { Game.togglePause(); Game.restartAttempt(true); });
    mkB('✕ Exit', 'red', () => {
      const opts = sess.opts;
      Game.stop();
      if (opts.editorTest && opts.onExit) opts.onExit();
      else { this.showScreen('menu'); this.buildMenu(); }
    });
    panel.appendChild(row);
    ov.appendChild(panel);
    ov.classList.add('active');
  },

  hidePause() {
    document.getElementById('overlay-pause').classList.remove('active');
  },

  // ---------- SEARCH ----------
  renderSearch() {
    const el = this.screens.search;
    el.innerHTML = '';
    this.backBtn(el);
    this.statChips(el);

    const title = document.createElement('div');
    title.className = 'screen-title';
    title.textContent = 'ONLINE LEVELS';
    el.appendChild(title);

    const bar = document.createElement('div');
    bar.className = 'search-bar-row';
    const inp = document.createElement('input');
    inp.placeholder = 'Search levels…';
    inp.value = this.searchText;
    inp.oninput = () => { this.searchText = inp.value; renderList(); };
    bar.appendChild(inp);
    el.appendChild(bar);

    const diffRow = document.createElement('div');
    diffRow.className = 'diff-filter-row';
    for (const d of DIFFS) {
      const b = document.createElement('button');
      b.className = 'diff-filter' + (this.searchDiff === d.id ? ' on' : '');
      b.innerHTML = `<div style="font-size:20px">${d.face}</div><div>${d.name}</div>`;
      b.onclick = () => {
        AudioEngine.sfxClick();
        this.searchDiff = this.searchDiff === d.id ? null : d.id;
        this.renderSearch();
      };
      diffRow.appendChild(b);
    }
    el.appendChild(diffRow);

    const list = document.createElement('div');
    list.className = 'list-scroll';
    el.appendChild(list);

    const renderList = () => {
      list.innerHTML = '';
      let entries = ONLINE_DB.slice();
      // published user levels appear in search too
      for (const pl of Save.data.published) {
        entries.push({
          id: pl.id, name: pl.name, author: pl.author, difficulty: pl.difficulty,
          stars: pl.stars, downloads: pl.downloads || 0, likes: pl.likes || 0,
          lengthSec: Math.round(pl.length / 10.386), userLevel: true,
        });
      }
      if (this.searchDiff) entries = entries.filter(e => e.difficulty === this.searchDiff);
      const q = this.searchText.trim().toLowerCase();
      if (q) entries = entries.filter(e => e.name.toLowerCase().includes(q) || e.author.toLowerCase().includes(q));
      entries.sort((a, b) => b.downloads - a.downloads);
      if (!entries.length) {
        const none = document.createElement('div');
        none.style.cssText = 'color:#fff;font-family:var(--font);text-align:center;margin-top:30px;';
        none.textContent = 'No levels found :(';
        list.appendChild(none);
        return;
      }
      for (const e of entries) list.appendChild(this.levelRow(e));
    };
    renderList();
  },

  levelRow(e, opts = {}) {
    const meta = diffById(e.difficulty);
    const row = document.createElement('div');
    row.className = 'level-row';
    const downloaded = Save.data.downloaded.includes(e.id) || e.userLevel;
    const comp = Save.data.completions[e.id] || {};
    row.innerHTML = `
      <div class="facewrap"><div style="font-size:26px">${meta.face}</div><div>${meta.name}</div><div>⭐${e.stars}</div></div>
      <div class="info">
        <div class="name">${e.name} ${comp.done ? '✓' : ''}</div>
        <div class="author">by ${e.author}</div>
        <div class="meta"><span>⬇ ${fmtNum(e.downloads || 0)}</span><span>👍 ${fmtNum(e.likes || 0)}</span><span>⏱ ${e.lengthSec || '?'}s</span>${comp.best ? `<span>best ${comp.best}%</span>` : ''}</div>
      </div>
      <div class="actions"></div>`;
    const actions = row.querySelector('.actions');
    if (!downloaded && !opts.noDownload) {
      const dl = document.createElement('button');
      dl.className = 'gd-btn small blue';
      dl.textContent = '⬇ Download';
      dl.onclick = (ev) => {
        ev.stopPropagation();
        AudioEngine.sfxUnlock();
        Save.data.downloaded.push(e.id);
        const dbe = ONLINE_DB.find(x => x.id === e.id);
        if (dbe) dbe.downloads++;
        Save.write();
        this.toast(`⬇ Downloaded "${e.name}"! Find it in Create → Saved.`);
        dl.replaceWith(mkPlay());
      };
      actions.appendChild(dl);
    }
    const mkPlay = () => {
      const pb = document.createElement('button');
      pb.className = 'gd-btn small';
      pb.textContent = '▶ Play';
      pb.onclick = (ev) => {
        ev.stopPropagation();
        AudioEngine.sfxClick();
        const level = e.userLevel ? Save.data.published.find(x => x.id === e.id) : getOnlineLevel(e.id);
        if (level) this.playLevel(level, opts.playOpts || {});
      };
      return pb;
    };
    if (downloaded || opts.alwaysPlayable) actions.appendChild(mkPlay());
    row.onclick = () => {
      if (downloaded || opts.alwaysPlayable) {
        const level = e.userLevel ? Save.data.published.find(x => x.id === e.id) : getOnlineLevel(e.id);
        if (level) { AudioEngine.sfxClick(); this.playLevel(level, opts.playOpts || {}); }
      } else {
        this.toast('Download it first!');
      }
    };
    return row;
  },

  // ---------- MY LEVELS / SAVED ----------
  myTab: 'created',
  renderMyLevels() {
    const el = this.screens.mylevels;
    el.innerHTML = '';
    this.backBtn(el);
    this.statChips(el);
    const title = document.createElement('div');
    title.className = 'screen-title';
    title.textContent = 'CREATE';
    el.appendChild(title);

    const tabs = document.createElement('div');
    tabs.className = 'icon-tabs';
    for (const [id, label] of [['created', '🛠 My Levels'], ['saved', '⬇ Saved']]) {
      const b = document.createElement('button');
      b.className = 'gd-btn small ' + (this.myTab === id ? 'blue' : 'gray');
      b.textContent = label;
      b.onclick = () => { this.myTab = id; this.renderMyLevels(); };
      tabs.appendChild(b);
    }
    el.appendChild(tabs);

    const list = document.createElement('div');
    list.className = 'list-scroll';
    el.appendChild(list);

    if (this.myTab === 'created') {
      const newBtn = document.createElement('button');
      newBtn.className = 'gd-btn big';
      newBtn.textContent = '+ NEW LEVEL';
      newBtn.style.marginTop = '8px';
      newBtn.onclick = () => {
        AudioEngine.sfxClick();
        this.newLevelDialog();
      };
      el.insertBefore(newBtn, list);

      if (!Save.data.myLevels.length) {
        list.innerHTML = '<div style="color:#fff;font-family:var(--font);text-align:center;margin-top:24px">No levels yet — hit NEW LEVEL and start building!</div>';
      }
      for (const doc of Save.data.myLevels) {
        const row = document.createElement('div');
        row.className = 'level-row';
        row.innerHTML = `
          <div class="facewrap"><div style="font-size:26px">${doc.published ? '★' : doc.verified ? '✓' : '🛠'}</div><div>${doc.published ? 'published' : doc.verified ? 'verified' : 'draft'}</div></div>
          <div class="info">
            <div class="name">${doc.name}</div>
            <div class="author">${doc.objects.length} objects</div>
          </div>
          <div class="actions"></div>`;
        const actions = row.querySelector('.actions');
        const edit = document.createElement('button');
        edit.className = 'gd-btn small orange';
        edit.textContent = '✏️ Edit';
        edit.onclick = (ev) => { ev.stopPropagation(); AudioEngine.sfxClick(); Editor.open(doc); };
        actions.appendChild(edit);
        const del = document.createElement('button');
        del.className = 'gd-btn small red';
        del.textContent = '🗑';
        del.onclick = (ev) => {
          ev.stopPropagation();
          this.confirmDialog(`Delete "${doc.name}" forever?`, () => {
            Save.deleteMyLevel(doc.id);
            this.renderMyLevels();
          });
        };
        actions.appendChild(del);
        row.onclick = () => Editor.open(doc);
        list.appendChild(row);
      }
    } else {
      const saved = Save.data.downloaded.map(id => ONLINE_DB.find(e => e.id === id)).filter(Boolean);
      if (!saved.length) {
        list.innerHTML = '<div style="color:#fff;font-family:var(--font);text-align:center;margin-top:24px">Nothing downloaded yet — grab levels from Search!</div>';
      }
      for (const e of saved) list.appendChild(this.levelRow(e, { alwaysPlayable: true }));
    }
  },

  newLevelDialog() {
    this.dialog((panel, close) => {
      panel.innerHTML = '<h2>NEW LEVEL</h2>';
      const inp = document.createElement('input');
      inp.placeholder = 'Level name';
      inp.maxLength = 24;
      panel.appendChild(inp);
      const row = document.createElement('div');
      row.className = 'row';
      const create = document.createElement('button');
      create.className = 'gd-btn';
      create.textContent = 'CREATE';
      create.onclick = () => {
        const name = inp.value.trim() || 'Unnamed ' + (Save.data.myLevels.length + 1);
        const doc = {
          id: 'my-' + Date.now(),
          name,
          objects: [],
          verified: false,
          published: false,
          difficulty: 'normal',
        };
        Save.upsertMyLevel(doc);
        close();
        Editor.open(doc);
      };
      row.appendChild(create);
      panel.appendChild(row);
      setTimeout(() => inp.focus(), 50);
    });
  },

  publishDialog(doc, onConfirm) {
    this.dialog((panel, close) => {
      panel.innerHTML = `<h2>PUBLISH LEVEL</h2><div class="stat-line">"${doc.name}" — pick a difficulty rating</div>`;
      const sel = document.createElement('select');
      for (const d of DIFFS) {
        const o = document.createElement('option');
        o.value = d.id;
        o.textContent = `${d.face} ${d.name} (${d.stars}⭐, ${d.orbs} orbs)`;
        if (doc.difficulty === d.id) o.selected = true;
        sel.appendChild(o);
      }
      panel.appendChild(sel);
      const row = document.createElement('div');
      row.className = 'row';
      const go = document.createElement('button');
      go.className = 'gd-btn purple';
      go.textContent = '⇧ PUBLISH';
      go.onclick = () => { doc.difficulty = sel.value; close(); onConfirm(); };
      row.appendChild(go);
      panel.appendChild(row);
    });
  },

  // ---------- GAUNTLETS ----------
  renderGauntlets() {
    const el = this.screens.gauntlets;
    el.innerHTML = '';
    this.backBtn(el);
    this.statChips(el);
    const title = document.createElement('div');
    title.className = 'screen-title';
    title.textContent = '⚔️ THE LOST GAUNTLETS';
    el.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'gauntlet-grid';
    for (const g of GAUNTLETS) {
      const done = Save.gauntletProgress(g.id).every(Boolean);
      const card = document.createElement('div');
      card.className = 'gauntlet-card' + (done ? ' done' : '');
      card.style.background = `linear-gradient(160deg, ${g.color}, #10131f)`;
      const prog = Save.gauntletProgress(g.id).filter(Boolean).length;
      card.innerHTML = `<div class="gi">${g.icon}</div><div>${g.name}</div>
        <div class="greward">${done ? '✓ COMPLETE' : prog + '/3 · reward: ' + g.reward + ' orbs'}</div>`;
      card.onclick = () => {
        AudioEngine.sfxClick();
        this.currentGauntlet = g;
        this.showScreen('gauntlet');
        this.renderGauntlet();
      };
      grid.appendChild(card);
    }
    el.appendChild(grid);
  },

  renderGauntlet() {
    const g = this.currentGauntlet;
    const el = this.screens.gauntlet;
    el.innerHTML = '';
    this.backBtn(el, 'gauntlets');
    this.statChips(el);
    const title = document.createElement('div');
    title.className = 'screen-title';
    title.textContent = `${g.icon} ${g.name.toUpperCase()}`;
    el.appendChild(title);
    const sub = document.createElement('div');
    sub.style.cssText = 'color:#cfe4ff;font-size:13px;font-family:var(--font);margin-top:4px';
    sub.textContent = `Beat all 3 levels → ${g.reward} mana orbs + exclusive icon!`;
    el.appendChild(sub);

    const list = document.createElement('div');
    list.className = 'list-scroll';
    el.appendChild(list);
    const prog = Save.gauntletProgress(g.id);
    for (let i = 0; i < 3; i++) {
      const level = getGauntletLevel(g.id, i);
      const meta = diffById(level.difficulty);
      const row = document.createElement('div');
      row.className = 'level-row';
      row.innerHTML = `
        <div class="facewrap"><div style="font-size:26px">${prog[i] ? '✅' : meta.face}</div><div>${meta.name}</div><div>⭐${level.stars}</div></div>
        <div class="info">
          <div class="name">${i + 1}. ${level.name}</div>
          <div class="author">by ${level.author}</div>
          <div class="meta"><span>${(Save.data.completions[level.id] || {}).best || 0}% best</span></div>
        </div>
        <div class="actions"><button class="gd-btn small">▶ Play</button></div>`;
      row.onclick = () => {
        AudioEngine.sfxClick();
        this.playLevel(level, { returnTo: 'gauntlet', onReturn: () => this.renderGauntlet() });
      };
      list.appendChild(row);
    }
  },

  // ---------- SHOP ----------
  renderShop() {
    const el = this.screens.shop;
    el.innerHTML = '';
    this.backBtn(el);
    this.statChips(el);
    const title = document.createElement('div');
    title.className = 'screen-title';
    title.textContent = '🛒 THE SHOP';
    el.appendChild(title);
    const keeper = document.createElement('div');
    keeper.style.cssText = 'color:#ffe9a8;font-size:13px;font-family:var(--font);margin-top:4px';
    keeper.textContent = '"Welcome, welcome! Spend those shiny orbs!" — the Shopkeeper';
    el.appendChild(keeper);

    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    el.appendChild(grid);

    for (const item of SHOP_ITEMS) {
      const owned = Save.data.shopBought.includes(item.id);
      const card = document.createElement('div');
      card.className = 'shop-item';
      const cv = document.createElement('canvas');
      cv.width = cv.height = 84;
      const c2 = cv.getContext('2d');
      c2.translate(42, 42);
      if (item.kind === 'icon') {
        Icons.draw(c2, item.mode, item.design, Save.data.icons.colorP, Save.data.icons.colorS, 52);
      } else if (item.kind === 'color') {
        c2.fillStyle = item.color;
        c2.beginPath(); c2.arc(0, 0, 24, 0, Math.PI * 2); c2.fill();
        c2.strokeStyle = '#000'; c2.lineWidth = 3; c2.stroke();
      }
      card.appendChild(cv);
      const lab = document.createElement('div');
      lab.textContent = item.name;
      card.appendChild(lab);
      const btn = document.createElement('button');
      btn.className = 'gd-btn small ' + (owned ? 'gray' : 'blue');
      btn.innerHTML = owned ? 'OWNED' : `${item.price} <span class="orb-icon" style="width:12px;height:12px"></span>`;
      btn.disabled = owned;
      btn.onclick = () => {
        if (Save.data.orbs < item.price) { AudioEngine.sfxDeny(); this.toast('Not enough mana orbs!'); return; }
        Save.data.orbs -= item.price;
        Save.data.shopBought.push(item.id);
        if (item.kind === 'icon') Save.unlockIcon(item.mode, item.design);
        else if (item.kind === 'color') Save.data.icons.unlockedColors.push(item.color);
        Save.write();
        AudioEngine.sfxBuy();
        this.toast(`Bought ${item.name}!`);
        this.renderShop();
      };
      card.appendChild(btn);
      grid.appendChild(card);
    }

    // SECRET: the basement door
    const door = document.createElement('div');
    door.style.cssText = 'position:absolute;bottom:14px;right:18px;font-size:34px;cursor:pointer;filter:brightness(.6)';
    door.textContent = '🚪';
    door.title = 'A dusty old door…';
    door.onclick = () => this.basementDoor();
    el.appendChild(door);
  },

  basementDoor() {
    if (Save.data.secrets.basementOpened) {
      this.toast('The basement is empty now. The monster said "thanks for the chicken".');
      return;
    }
    if (!Save.data.secrets.rustyKey) {
      this.dialog((panel, close) => {
        panel.innerHTML = `<h2>🚪 A LOCKED DOOR</h2>
          <div class="stat-line">Something growls behind it… it smells like chicken?</div>
          <div class="stat-line">A rusty key hangs in the shop for 1000 orbs.</div>`;
        const row = document.createElement('div');
        row.className = 'row';
        const buy = document.createElement('button');
        buy.className = 'gd-btn orange';
        buy.textContent = '🗝 Buy Rusty Key (1000 orbs)';
        buy.onclick = () => {
          if (Save.data.orbs < 1000) { AudioEngine.sfxDeny(); this.toast('Not enough orbs for the key!'); return; }
          Save.data.orbs -= 1000;
          Save.data.secrets.rustyKey = true;
          Save.write();
          AudioEngine.sfxBuy();
          close();
          this.toast('🗝 You bought the Rusty Key… now what does it open?');
        };
        row.appendChild(buy);
        panel.appendChild(row);
      });
    } else {
      this.dialog((panel, close) => {
        panel.innerHTML = `<h2>🐲 THE BASEMENT</h2>
          <div class="stat-line">A green monster blinks at you: "FINALLY. RubRub locked me in here</div>
          <div class="stat-line">with nothing but false promises of chicken. Take this — and TELL NO ONE."</div>
          <div class="stat-line" style="color:#9fe88f">+500 mana orbs · secret DEMON cube unlocked!</div>`;
        const row = document.createElement('div');
        row.className = 'row';
        const ok = document.createElement('button');
        ok.className = 'gd-btn';
        ok.textContent = 'TAKE IT';
        ok.onclick = () => {
          Save.data.secrets.basementOpened = true;
          Save.addOrbs(500);
          Save.unlockIcon('cube', 7);
          Save.write();
          AudioEngine.sfxUnlock();
          close();
          this.toast('🐲 Secret found! Demon cube unlocked!');
          this.renderShop();
        };
        row.appendChild(ok);
        panel.appendChild(row);
      });
    }
  },

  // ---------- ICON KIT ----------
  iconTab: 'cube',
  renderIcons() {
    const el = this.screens.icons;
    el.innerHTML = '';
    this.backBtn(el);
    this.statChips(el);
    const title = document.createElement('div');
    title.className = 'screen-title';
    title.textContent = '🧊 ICON KIT';
    el.appendChild(title);

    // preview
    const prev = document.createElement('canvas');
    prev.width = prev.height = 110;
    prev.style.cssText = 'background:rgba(0,0,0,.3);border-radius:14px;margin-top:10px';
    const pc = prev.getContext('2d');
    pc.translate(55, 55);
    Icons.draw(pc, this.iconTab, Save.data.icons.selected[this.iconTab] || 0, Save.data.icons.colorP, Save.data.icons.colorS, 72);
    el.appendChild(prev);

    const tabs = document.createElement('div');
    tabs.className = 'icon-tabs';
    const emoji = { cube: '🟩', ship: '🚀', ball: '⚪', ufo: '🛸', wave: '🔺', robot: '🤖', spider: '🕷' };
    for (const mode of GAME_MODES) {
      const b = document.createElement('button');
      b.className = 'gd-btn small ' + (this.iconTab === mode ? 'blue' : 'gray');
      b.textContent = `${emoji[mode]} ${mode}`;
      b.onclick = () => { this.iconTab = mode; this.renderIcons(); };
      tabs.appendChild(b);
    }
    el.appendChild(tabs);

    const grid = document.createElement('div');
    grid.className = 'icon-grid';
    const count = ICON_COUNTS[this.iconTab];
    for (let i = 0; i < count; i++) {
      const unlocked = Save.iconUnlocked(this.iconTab, i);
      const c = document.createElement('div');
      c.className = 'icon-cell' + (Save.data.icons.selected[this.iconTab] === i ? ' sel' : '') + (unlocked ? '' : ' locked');
      const cv = document.createElement('canvas');
      cv.width = cv.height = 52;
      const c2 = cv.getContext('2d');
      c2.translate(26, 26);
      Icons.draw(c2, this.iconTab, i, Save.data.icons.colorP, Save.data.icons.colorS, 36);
      c.appendChild(cv);
      if (!unlocked) {
        const lm = document.createElement('div');
        lm.className = 'lockmark';
        lm.textContent = '🔒';
        c.appendChild(lm);
      }
      c.onclick = () => {
        if (!unlocked) { AudioEngine.sfxDeny(); this.toast('Locked! Buy it in the shop or find it in secrets/gauntlets.'); return; }
        Save.data.icons.selected[this.iconTab] = i;
        Save.write();
        AudioEngine.sfxClick();
        this.renderIcons();
      };
      grid.appendChild(c);
    }
    el.appendChild(grid);

    // colors
    const mkColorRow = (label, key) => {
      const lab = document.createElement('div');
      lab.style.cssText = 'color:#fff;font-family:var(--font);font-size:12px;margin-top:10px';
      lab.textContent = label;
      el.appendChild(lab);
      const row = document.createElement('div');
      row.className = 'color-swatches';
      for (const col of ICON_COLORS) {
        const unlocked = Save.colorUnlocked(col);
        const s = document.createElement('div');
        s.className = 'swatch' + (Save.data.icons[key] === col ? ' sel' : '');
        s.style.background = col;
        s.style.opacity = unlocked ? '1' : '.25';
        s.onclick = () => {
          if (!unlocked) { AudioEngine.sfxDeny(); this.toast('Color locked — check the shop!'); return; }
          Save.data.icons[key] = col;
          Save.write();
          AudioEngine.sfxClick();
          this.renderIcons();
        };
        row.appendChild(s);
      }
      el.appendChild(row);
    };
    mkColorRow('PRIMARY COLOR', 'colorP');
    mkColorRow('SECONDARY COLOR', 'colorS');
  },

  // ---------- THE VAULT ----------
  renderVault() {
    const el = this.screens.vault;
    el.innerHTML = '';
    this.backBtn(el);
    el.style.background = 'linear-gradient(#191033,#06040f)';

    const box = document.createElement('div');
    box.className = 'vault-box';
    box.innerHTML = `
      <div class="screen-title">THE VAULT</div>
      <div class="vault-face" id="vault-face">🔒</div>
      <div class="vault-msg" id="vault-msg">"I am Spooky, guardian of the Vault. Speak your codes… IF YOU DARE."</div>`;
    const inp = document.createElement('input');
    inp.placeholder = 'enter code…';
    inp.maxLength = 24;
    box.appendChild(inp);
    const btn = document.createElement('button');
    btn.className = 'gd-btn purple';
    btn.textContent = 'SUBMIT';
    box.appendChild(btn);
    el.appendChild(box);

    const msgEl = () => document.getElementById('vault-msg');
    const faceEl = () => document.getElementById('vault-face');
    const submit = () => {
      const code = inp.value.trim().toLowerCase();
      inp.value = '';
      if (!code) return;
      const res = Save.tryVaultCode(code);
      faceEl().textContent = res.ok ? '🔓' : '🔒';
      msgEl().textContent = res.msg;
      if (res.ok) { AudioEngine.sfxUnlock(); this.toast(res.reward); }
      else AudioEngine.sfxDeny();
      setTimeout(() => { faceEl().textContent = '🔒'; }, 1500);
    };
    btn.onclick = submit;
    inp.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    setTimeout(() => inp.focus(), 60);
  },

  // ---------- dialogs ----------
  dialog(build) {
    const ov = document.getElementById('overlay-dialog');
    ov.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'gd-panel';
    const close = () => ov.classList.remove('active');
    build(panel, close);
    const x = document.createElement('button');
    x.className = 'gd-btn small red';
    x.textContent = '✕ Close';
    x.onclick = close;
    panel.appendChild(x);
    ov.appendChild(panel);
    ov.classList.add('active');
  },

  confirmDialog(msg, onYes) {
    this.dialog((panel, close) => {
      panel.innerHTML = `<h2>Are you sure?</h2><div class="stat-line">${msg}</div>`;
      const row = document.createElement('div');
      row.className = 'row';
      const yes = document.createElement('button');
      yes.className = 'gd-btn red';
      yes.textContent = 'YES';
      yes.onclick = () => { close(); onYes(); };
      row.appendChild(yes);
      panel.appendChild(row);
    });
  },

  settingsDialog() {
    this.dialog((panel, close) => {
      panel.innerHTML = '<h2>⚙️ SETTINGS</h2>';
      const mkSlider = (label, val, fn) => {
        const lab = document.createElement('div');
        lab.className = 'stat-line';
        lab.textContent = label;
        panel.appendChild(lab);
        const s = document.createElement('input');
        s.type = 'range'; s.min = 0; s.max = 100; s.value = val * 100;
        s.style.width = '260px';
        s.oninput = () => fn(s.value / 100);
        panel.appendChild(s);
      };
      mkSlider('Music Volume', Save.data.settings.music, (v) => {
        Save.data.settings.music = v; AudioEngine.setMusicVolume(v); Save.write();
      });
      mkSlider('SFX Volume', Save.data.settings.sfx, (v) => {
        Save.data.settings.sfx = v; AudioEngine.setSfxVolume(v); Save.write(); AudioEngine.sfxClick();
      });
      const lab = document.createElement('div');
      lab.className = 'stat-line';
      lab.textContent = 'Username';
      panel.appendChild(lab);
      const inp = document.createElement('input');
      inp.value = Save.data.username;
      inp.maxLength = 16;
      inp.onchange = () => {
        Save.data.username = inp.value.trim() || 'Player';
        Save.write();
        this.buildMenu();
      };
      panel.appendChild(inp);
    });
  },
};

function fmtNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return '' + n;
}

// shop inventory: icons + colors purchasable with mana orbs
const SHOP_ITEMS = [
  { id: 'cube1', kind: 'icon', mode: 'cube', design: 1, name: 'Visor Cube', price: 500 },
  { id: 'cube2', kind: 'icon', mode: 'cube', design: 2, name: 'Angry Cube', price: 800 },
  { id: 'cube3', kind: 'icon', mode: 'cube', design: 3, name: 'Cyclops Cube', price: 1200 },
  { id: 'cube4', kind: 'icon', mode: 'cube', design: 4, name: 'Brace Cube', price: 2000 },
  { id: 'cube5', kind: 'icon', mode: 'cube', design: 5, name: 'Happy Cube', price: 3000 },
  { id: 'ship1', kind: 'icon', mode: 'ship', design: 1, name: 'Saucer Ship', price: 1000 },
  { id: 'ship2', kind: 'icon', mode: 'ship', design: 2, name: 'Striped Dart', price: 1800 },
  { id: 'ship3', kind: 'icon', mode: 'ship', design: 3, name: 'Racer', price: 2600 },
  { id: 'ball1', kind: 'icon', mode: 'ball', design: 1, name: 'Quarter Ball', price: 900 },
  { id: 'ball2', kind: 'icon', mode: 'ball', design: 2, name: 'Cross Ball', price: 1500 },
  { id: 'ball3', kind: 'icon', mode: 'ball', design: 3, name: 'Star Ball', price: 2400 },
  { id: 'ufo1', kind: 'icon', mode: 'ufo', design: 1, name: 'Lamp UFO', price: 1200 },
  { id: 'ufo2', kind: 'icon', mode: 'ufo', design: 2, name: 'Tri-Light UFO', price: 2200 },
  { id: 'wave1', kind: 'icon', mode: 'wave', design: 1, name: 'Double Dart', price: 1400 },
  { id: 'wave2', kind: 'icon', mode: 'wave', design: 2, name: 'Stub Wave', price: 2400 },
  { id: 'robot1', kind: 'icon', mode: 'robot', design: 1, name: 'Scout Bot', price: 1600 },
  { id: 'robot2', kind: 'icon', mode: 'robot', design: 2, name: 'Antenna Bot', price: 2800 },
  { id: 'spider1', kind: 'icon', mode: 'spider', design: 1, name: 'Visor Spider', price: 1800 },
  { id: 'spider2', kind: 'icon', mode: 'spider', design: 2, name: 'Fang Spider', price: 3200 },
  { id: 'col1', kind: 'color', color: '#ff00ff', name: 'Magenta', price: 400 },
  { id: 'col2', kind: 'color', color: '#ffff00', name: 'Yellow', price: 400 },
  { id: 'col3', kind: 'color', color: '#ff0000', name: 'Red', price: 600 },
  { id: 'col4', kind: 'color', color: '#ffffff', name: 'White', price: 800 },
  { id: 'col5', kind: 'color', color: '#141414', name: 'Void Black', price: 1000 },
  { id: 'col6', kind: 'color', color: '#96ffc8', name: 'Mint', price: 700 },
  { id: 'col7', kind: 'color', color: '#ffb4d2', name: 'Rose', price: 700 },
];

if (typeof module !== 'undefined') module.exports = { UI, SHOP_ITEMS };
