// Level editor: place/edit/delete every object type, pan/zoom, playtest,
// verify (must beat your level) → publish into the local search database.
'use strict';

const Editor = {
  active: false,
  levelDoc: null,      // {id, name, objects:[...], verified, published, song...}
  camX: 8, camY: 1.5, zoom: 34,
  tool: 'build',       // build | edit | delete
  tab: 'blocks',
  selType: 'block',
  selRot: 0,
  selection: new Set(),
  dragging: false,
  panning: false,
  lastPointer: null,
  raf: 0,
  time: 0,
  swipe: false,
  testReturn: null,

  open(levelDoc) {
    this.levelDoc = levelDoc;
    this.levelDoc.objects = this.levelDoc.objects || [];
    this.active = true;
    this.selection.clear();
    this.camX = 8; this.camY = 1.5;
    this.tool = 'build';
    UI.showScreen('editor');
    this.buildUI();
    this.attach();
    this.raf = requestAnimationFrame((t) => this.loop(t));
    this.hiddenTicker = setInterval(() => {
      if (document.visibilityState === 'hidden' && this.active) this.loopBody(performance.now());
    }, 32);
  },

  close(save = true) {
    if (save) this.saveDoc();
    this.active = false;
    cancelAnimationFrame(this.raf);
    clearInterval(this.hiddenTicker);
    this.detach();
    UI.showScreen('mylevels');
    UI.renderMyLevels();
  },

  saveDoc() {
    if (!this.levelDoc) return;
    this.levelDoc.updatedAt = Date.now();
    Save.upsertMyLevel(this.levelDoc);
  },

  // ---------- UI ----------
  buildUI() {
    const top = document.getElementById('editor-topbar');
    top.innerHTML = '';
    const mkBtn = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'gd-btn small ' + cls;
      b.textContent = label;
      b.onclick = fn;
      top.appendChild(b);
      return b;
    };
    mkBtn('⬅ Save+Exit', 'gray', () => this.close(true));
    const nameEl = document.createElement('span');
    nameEl.style.cssText = 'color:#fff;font-family:var(--font);font-size:14px;margin:0 8px;';
    nameEl.textContent = this.levelDoc.name;
    top.appendChild(nameEl);
    const spacer = document.createElement('div');
    spacer.className = 'spacer';
    top.appendChild(spacer);
    this.verifyBadge = document.createElement('span');
    this.verifyBadge.style.cssText = 'color:#9fe88f;font-family:var(--font);font-size:12px;margin-right:8px;';
    top.appendChild(this.verifyBadge);
    mkBtn('▶ Playtest', 'blue', () => this.playtest(false));
    this.verifyBtn = mkBtn('✓ Verify', 'orange', () => this.playtest(true));
    this.publishBtn = mkBtn('⇧ Publish', 'purple', () => this.publish());
    this.refreshBadges();

    // bottom panel
    const panel = document.getElementById('editor-panel');
    panel.innerHTML = '';

    const modeRow = document.createElement('div');
    modeRow.className = 'editor-mode-row';
    const mkTool = (id, label) => {
      const b = document.createElement('button');
      b.className = 'gd-btn small ' + (this.tool === id ? 'blue' : 'gray');
      b.textContent = label;
      b.onclick = () => { this.tool = id; this.selection.clear(); this.buildUI(); };
      modeRow.appendChild(b);
    };
    mkTool('build', '🔨 Build');
    mkTool('edit', '✏️ Edit');
    mkTool('delete', '🗑 Delete');
    // rotation + actions
    const rotBtn = document.createElement('button');
    rotBtn.className = 'gd-btn small gray';
    rotBtn.textContent = '↻ Rot ' + this.selRot + '°';
    rotBtn.onclick = () => {
      this.selRot = (this.selRot + 90) % 360;
      if (this.tool === 'edit' && this.selection.size) {
        for (const i of this.selection) {
          const o = this.levelDoc.objects[i];
          o.r = ((o.r || 0) + 90) % 360;
        }
        this.saveDoc();
      }
      this.buildUI();
    };
    modeRow.appendChild(rotBtn);
    if (this.tool === 'edit') {
      const delSel = document.createElement('button');
      delSel.className = 'gd-btn small red';
      delSel.textContent = 'Delete Sel';
      delSel.onclick = () => this.deleteSelection();
      modeRow.appendChild(delSel);
      const dupSel = document.createElement('button');
      dupSel.className = 'gd-btn small blue';
      dupSel.textContent = 'Copy +2→';
      dupSel.onclick = () => this.duplicateSelection();
      modeRow.appendChild(dupSel);
    }
    const hint = document.createElement('span');
    hint.className = 'ed-hint';
    hint.textContent = this.tool === 'build'
      ? 'click/drag: place · right-drag or 2 fingers: pan · wheel: zoom'
      : this.tool === 'edit'
        ? 'click: select · drag: move · arrows: nudge'
        : 'click/drag objects to delete';
    modeRow.appendChild(hint);
    panel.appendChild(modeRow);

    // tabs
    const tabs = document.createElement('div');
    tabs.className = 'editor-tabs';
    for (const cat of Object.keys(PALETTE)) {
      const t = document.createElement('button');
      t.className = 'editor-tab' + (this.tab === cat ? ' on' : '');
      t.textContent = cat.toUpperCase();
      t.onclick = () => { this.tab = cat; this.buildUI(); };
      tabs.appendChild(t);
    }
    panel.appendChild(tabs);

    // palette
    const pal = document.createElement('div');
    pal.className = 'editor-palette';
    for (const type of PALETTE[this.tab]) {
      const cellEl = document.createElement('div');
      cellEl.className = 'pal-item' + (this.selType === type ? ' sel' : '');
      const cv = document.createElement('canvas');
      cv.width = cv.height = 48;
      const c2 = cv.getContext('2d');
      c2.translate(24, 24);
      c2.scale(15, -15);
      try { OBJ_DEFS[type].draw(c2, { color: OBJ_DEFS[type].defaults && OBJ_DEFS[type].defaults.color }, 0); } catch (e) { /* palette preview */ }
      cellEl.appendChild(cv);
      cellEl.onclick = () => { this.selType = type; this.tool = 'build'; this.buildUI(); };
      pal.appendChild(cellEl);
    }
    panel.appendChild(pal);

    // trigger color editor
    if (this.tab === 'triggers') {
      const row = document.createElement('div');
      row.className = 'editor-mode-row';
      const lab = document.createElement('span');
      lab.className = 'ed-hint';
      lab.textContent = 'trigger color:';
      row.appendChild(lab);
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.value = this.triggerColor || '#287dff';
      inp.oninput = () => { this.triggerColor = inp.value; };
      row.appendChild(inp);
      panel.appendChild(row);
    }
  },

  refreshBadges() {
    if (!this.verifyBadge) return;
    this.verifyBadge.textContent = this.levelDoc.published ? '★ PUBLISHED' : this.levelDoc.verified ? '✓ VERIFIED' : 'unverified';
    this.verifyBadge.style.color = this.levelDoc.published ? '#ffd51e' : this.levelDoc.verified ? '#9fe88f' : '#c8d4e8';
    if (this.publishBtn) this.publishBtn.disabled = !this.levelDoc.verified || this.levelDoc.published;
  },

  // ---------- input ----------
  attach() {
    const canvas = document.getElementById('gamecanvas');
    this.onPointerDown = (e) => this.pointerDown(e);
    this.onPointerMove = (e) => this.pointerMove(e);
    this.onPointerUp = (e) => this.pointerUp(e);
    this.onWheel = (e) => {
      e.preventDefault();
      const f = e.deltaY > 0 ? 0.9 : 1.11;
      this.zoom = Math.max(12, Math.min(90, this.zoom * f));
    };
    this.onKey = (e) => {
      if (e.code === 'Escape') this.close(true);
      if (this.tool === 'edit' && this.selection.size) {
        const dx = e.code === 'ArrowLeft' ? -0.5 : e.code === 'ArrowRight' ? 0.5 : 0;
        const dy = e.code === 'ArrowDown' ? -0.5 : e.code === 'ArrowUp' ? 0.5 : 0;
        if (dx || dy) {
          e.preventDefault();
          for (const i of this.selection) { this.levelDoc.objects[i].x += dx; this.levelDoc.objects[i].y += dy; }
          this.saveDoc();
        }
        if (e.code === 'Backspace' || e.code === 'Delete') this.deleteSelection();
      }
    };
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKey);
    canvas.addEventListener('contextmenu', this.noCtx = (e) => e.preventDefault());
  },

  detach() {
    const canvas = document.getElementById('gamecanvas');
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKey);
    canvas.removeEventListener('contextmenu', this.noCtx);
  },

  screenToWorld(e) {
    const canvas = document.getElementById('gamecanvas');
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sx = (e.clientX - r.left) * dpr, sy = (e.clientY - r.top) * dpr;
    const H = canvas.height;
    const groundScreenY = H * 0.52;
    const wx = (sx - 120) / this.zoomPx() + this.camX;
    const wy = (groundScreenY - sy) / this.zoomPx() + this.camY;
    return { x: wx, y: wy };
  },
  zoomPx() { return this.zoom * Math.min(window.devicePixelRatio || 1, 2); },

  cellAt(e) {
    const w = this.screenToWorld(e);
    return { x: Math.floor(w.x) + 0.5, y: Math.floor(w.y) + 0.5 };
  },

  objectAt(e) {
    const w = this.screenToWorld(e);
    const objs = this.levelDoc.objects;
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (Math.abs(o.x - w.x) < 0.55 && Math.abs(o.y - w.y) < 0.55) return i;
    }
    return -1;
  },

  pointerDown(e) {
    if (e.button === 2 || e.pointerType === 'touch' && this.activeTouches > 0) {
      this.panning = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      return;
    }
    this.lastPointer = { x: e.clientX, y: e.clientY };
    if (this.tool === 'build') {
      this.dragging = true;
      this.placeAt(e);
    } else if (this.tool === 'delete') {
      this.dragging = true;
      this.deleteAt(e);
    } else if (this.tool === 'edit') {
      const idx = this.objectAt(e);
      if (idx >= 0) {
        if (!e.shiftKey && !this.selection.has(idx)) this.selection.clear();
        this.selection.add(idx);
        this.dragging = true;
        this.dragStart = this.screenToWorld(e);
      } else {
        this.selection.clear();
        this.panning = true;
      }
    }
  },

  pointerMove(e) {
    if (!this.active) return;
    if (this.panning && this.lastPointer) {
      const dx = (e.clientX - this.lastPointer.x) / this.zoom;
      const dy = (e.clientY - this.lastPointer.y) / this.zoom;
      this.camX -= dx; this.camY += dy;
      this.camX = Math.max(-4, this.camX);
      this.camY = Math.max(-2, Math.min(40, this.camY));
      this.lastPointer = { x: e.clientX, y: e.clientY };
      return;
    }
    if (!this.dragging) return;
    if (this.tool === 'build') this.placeAt(e);
    else if (this.tool === 'delete') this.deleteAt(e);
    else if (this.tool === 'edit' && this.selection.size && this.dragStart) {
      const w = this.screenToWorld(e);
      const dx = Math.round((w.x - this.dragStart.x) * 2) / 2;
      const dy = Math.round((w.y - this.dragStart.y) * 2) / 2;
      if (dx || dy) {
        for (const i of this.selection) {
          this.levelDoc.objects[i].x += dx;
          this.levelDoc.objects[i].y += dy;
        }
        this.dragStart = { x: this.dragStart.x + dx, y: this.dragStart.y + dy };
      }
    }
  },

  pointerUp() {
    if (this.dragging && this.tool !== 'build') this.saveDoc();
    if (this.dragging && this.tool === 'build') this.saveDoc();
    this.dragging = false;
    this.panning = false;
    this.dragStart = null;
  },

  placeAt(e) {
    const c = this.cellAt(e);
    if (c.x < 0.5) return;
    const objs = this.levelDoc.objects;
    // avoid exact duplicates in the same cell
    for (const o of objs) {
      if (o.t === this.selType && o.x === c.x && o.y === c.y) return;
    }
    const def = OBJ_DEFS[this.selType];
    const o = { t: this.selType, x: c.x, y: c.y };
    if (this.selRot) o.r = this.selRot;
    if (def.act === 'trigger') {
      o.color = this.triggerColor || (def.defaults && def.defaults.color) || '#287dff';
      o.dur = 1.5;
    }
    objs.push(o);
    this.markDirty();
  },

  deleteAt(e) {
    const idx = this.objectAt(e);
    if (idx >= 0) {
      this.levelDoc.objects.splice(idx, 1);
      this.selection.clear();
      this.markDirty();
    }
  },

  deleteSelection() {
    const idxs = [...this.selection].sort((a, b) => b - a);
    for (const i of idxs) this.levelDoc.objects.splice(i, 1);
    this.selection.clear();
    this.markDirty();
    this.saveDoc();
  },

  duplicateSelection() {
    const objs = this.levelDoc.objects;
    const newSel = new Set();
    for (const i of this.selection) {
      const c = Object.assign({}, objs[i]);
      c.x += 2;
      objs.push(c);
      newSel.add(objs.length - 1);
    }
    this.selection = newSel;
    this.markDirty();
    this.saveDoc();
  },

  markDirty() {
    // any structural change invalidates verification
    if (this.levelDoc.verified || this.levelDoc.published) {
      if (this.levelDoc.published) Save.unpublishLevel(this.levelDoc.id);
      this.levelDoc.verified = false;
      this.levelDoc.published = false;
      this.refreshBadges();
    }
  },

  // ---------- playtest / verify / publish ----------
  buildPlayableLevel() {
    const objs = this.levelDoc.objects;
    const maxX = objs.reduce((m, o) => Math.max(m, o.x), 10);
    return {
      id: this.levelDoc.id,
      name: this.levelDoc.name,
      author: Save.data.username,
      difficulty: this.levelDoc.difficulty || 'normal',
      stars: diffById(this.levelDoc.difficulty || 'normal').stars,
      length: maxX + 8,
      mode0: 'cube',
      speed0: 1,
      ceilH: 14,
      objects: objs.map(o => Object.assign({}, o)),
      song: this.levelDoc.song || makeSong(this.levelDoc.id, 'house', 132, this.levelDoc.name + ' Theme', Save.data.username),
      coinsTotal: objs.filter(o => o.t === 'coin').length,
    };
  },

  playtest(isVerify) {
    if (!this.levelDoc.objects.length) { UI.toast('Place some objects first!'); return; }
    const level = this.buildPlayableLevel();
    this.detach();
    cancelAnimationFrame(this.raf);
    this.active = false;
    UI.showScreen(null);
    const returnToEditor = () => {
      Game.stop();
      this.active = true;
      UI.showScreen('editor');
      this.buildUI();
      this.attach();
      this.raf = requestAnimationFrame((t) => this.loop(t));
    };
    Game.start(level, {
      editorTest: true,
      onExit: returnToEditor,
      onComplete: (sess) => {
        Game.stop();
        if (isVerify) {
          this.levelDoc.verified = true;
          this.saveDoc();
          AudioEngine.sfxUnlock();
          UI.toast('✓ LEVEL VERIFIED! You can publish it now.');
        } else {
          UI.toast('Playtest complete!');
        }
        returnToEditor();
      },
    });
    if (isVerify) UI.toast('VERIFY RUN: beat the whole level!');
  },

  publish() {
    if (!this.levelDoc.verified) { UI.toast('Verify the level first!'); return; }
    UI.publishDialog(this.levelDoc, () => {
      const level = this.buildPlayableLevel();
      level.difficulty = this.levelDoc.difficulty || 'normal';
      level.stars = diffById(level.difficulty).stars;
      Save.publishLevel(level);
      this.levelDoc.published = true;
      this.saveDoc();
      this.refreshBadges();
      AudioEngine.sfxUnlock();
      UI.toast('⇧ PUBLISHED! Find it in Search.');
    });
  },

  // ---------- render loop ----------
  loop(t) {
    if (!this.active) return;
    this.raf = requestAnimationFrame((tt) => this.loop(tt));
    this.loopBody(t);
  },

  loopBody(t) {
    if (!this.active) return;
    this.time = t / 1000;
    const canvas = document.getElementById('gamecanvas');
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth * dpr, H = canvas.clientHeight * dpr;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }

    const view = {
      camX: this.camX, camY: this.camY, zoom: this.zoomPx(),
      px: 120, w: W, h: H,
      groundScreenY: H * 0.52,
      bgColor: '#1b2f52', groundColor: '#142344',
    };
    Renderer.drawBackground(ctx, view);
    Renderer.drawGround(ctx, view);

    // grid
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.lineWidth = 1;
    const z = view.px / view.zoom;
    const left = Math.floor(view.camX - z);
    const right = Math.ceil(view.camX + (W - view.px) / view.zoom);
    for (let gx = Math.max(0, left); gx <= right; gx++) {
      const s = Renderer.worldToScreen(view, gx, 0);
      ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, H); ctx.stroke();
    }
    const bot = Math.floor(view.camY - 3), top = Math.ceil(view.camY + H / view.zoom);
    for (let gy = Math.max(0, bot); gy <= top; gy++) {
      const s = Renderer.worldToScreen(view, 0, gy);
      ctx.beginPath(); ctx.moveTo(0, s.y); ctx.lineTo(W, s.y); ctx.stroke();
    }
    // start line
    const sl = Renderer.worldToScreen(view, 0, 0);
    ctx.strokeStyle = 'rgba(104,232,56,.6)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(sl.x, 0); ctx.lineTo(sl.x, H); ctx.stroke();
    ctx.restore();

    const objs = this.levelDoc.objects;
    const sorted = objs.map((o, i) => i).sort((a, b) => objs[a].x - objs[b].x);
    // draw via a temp sorted array but keep selection indices mapped
    const sortedObjs = sorted.map(i => objs[i]);
    const selSorted = new Set();
    sorted.forEach((origIdx, k) => { if (this.selection.has(origIdx)) selSorted.add(k); });
    Renderer.drawObjects(ctx, view, sortedObjs, this.time, true, selSorted);
  },
};
