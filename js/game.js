// Game runtime: canvas renderer, fixed-timestep loop, input, HUD, particles,
// practice mode, death/respawn, win handling. Also exposes the shared world
// renderer used by the editor.
'use strict';

const Renderer = {
  // view: {camX, camY, zoom, w, h, groundScreenY, bgColor, groundColor, time}
  worldToScreen(view, wx, wy) {
    return {
      x: (wx - view.camX) * view.zoom + view.px,
      y: view.groundScreenY - (wy - view.camY) * view.zoom,
    };
  },

  drawBackground(ctx, view) {
    const { w, h } = view;
    const c = view.bgColor;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, shadeColor(c, 18));
    grad.addColorStop(1, shadeColor(c, -30));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // parallax deco squares
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#ffffff';
    const par = view.camX * 0.35;
    const size = view.zoom * 5;
    for (let i = -1; i < w / size + 1; i++) {
      const gx = Math.floor(par / size) + i;
      const sx = gx * size - par;
      const yy = h * 0.28 + Math.sin(gx * 2.4) * h * 0.14;
      ctx.fillRect(sx, yy, size * 0.62, size * 0.62);
    }
    ctx.restore();
  },

  drawGround(ctx, view) {
    const { w, h, groundScreenY } = view;
    const gy = groundScreenY - (0 - view.camY) * view.zoom;
    if (gy < h) {
      const grad = ctx.createLinearGradient(0, gy, 0, h);
      grad.addColorStop(0, shadeColor(view.groundColor, 14));
      grad.addColorStop(1, shadeColor(view.groundColor, -26));
      ctx.fillStyle = grad;
      ctx.fillRect(0, gy, w, h - gy);
      // moving deco squares on the ground
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = '#ffffff';
      const size = view.zoom * 2;
      for (let i = -1; i < w / size + 1; i++) {
        const gx = Math.floor(view.camX * view.zoom / size) + i;
        const sx = gx * size - view.camX * view.zoom;
        ctx.fillRect(sx + size * 0.2, gy + size * 0.25, size * 0.55, size * 0.55);
      }
      ctx.restore();
      // glow line
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillRect(0, gy - 1.5, w, 3);
    }
  },

  // draw all level objects with x-culling. showInvisible=true in the editor.
  drawObjects(ctx, view, objects, time, showInvisible, selection) {
    const left = view.camX - 3 + (0 - view.px / view.zoom);
    const right = view.camX + (view.w - view.px) / view.zoom + 3;
    for (let i = 0; i < objects.length; i++) {
      const o = objects[i];
      if (o.x < left) continue;
      if (o.x > right) break;
      const def = OBJ_DEFS[o.t];
      if (!def) continue;
      if (def.invisible && !showInvisible) continue;
      const s = this.worldToScreen(view, o.x, o.y);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(view.zoom, -view.zoom);
      if (o.r) ctx.rotate(-o.r * Math.PI / 180);
      if (o.fx) ctx.scale(-1, 1);
      def.draw(ctx, o, time);
      if (selection && selection.has(i)) {
        ctx.strokeStyle = '#ffd51e';
        ctx.lineWidth = 0.08;
        ctx.strokeRect(-0.55, -0.55, 1.1, 1.1);
      }
      ctx.restore();
    }
  },

  drawPlayer(ctx, view, p, save, trail) {
    // wave trail
    if (trail && trail.length > 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(55,227,227,.7)';
      ctx.lineWidth = Math.max(2, view.zoom * 0.16);
      ctx.beginPath();
      for (let i = 0; i < trail.length; i++) {
        const s = this.worldToScreen(view, trail[i].x, trail[i].y);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      }
      ctx.stroke();
      ctx.restore();
    }
    const s = this.worldToScreen(view, p.x, p.y);
    const size = view.zoom * (p.mini ? 0.6 : 1) * 0.96;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(p.rotation * Math.PI / 180 * (p.mode === 'ship' || p.mode === 'wave' ? -1 : 1));
    if (p.gravDir === -1) ctx.scale(1, -1);
    const design = save.icons.selected[p.mode] || 0;
    Icons.draw(ctx, p.mode, design, save.icons.colorP, save.icons.colorS, size);
    ctx.restore();
  },
};

function shadeColor(col, amt) {
  // accepts #rrggbb or hsl(...)
  if (col.startsWith('hsl')) return col;
  const n = parseInt(col.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 0xff) + amt, b = (n & 0xff) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}

function lerpColor(a, b, t) {
  const pa = parseCssColor(a), pb = parseCssColor(b);
  return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * t)},${Math.round(pa[1] + (pb[1] - pa[1]) * t)},${Math.round(pa[2] + (pb[2] - pa[2]) * t)})`;
}
let _ccCanvas = null;
function parseCssColor(c) {
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16);
    return [n >> 16, (n >> 8) & 0xff, n & 0xff];
  }
  if (c.startsWith('rgb')) {
    const m = c.match(/[\d.]+/g);
    return [+m[0], +m[1], +m[2]];
  }
  // hsl etc: rasterize once
  if (!_ccCanvas) { _ccCanvas = document.createElement('canvas'); _ccCanvas.width = _ccCanvas.height = 1; }
  const cx = _ccCanvas.getContext('2d');
  cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
  const d = cx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

// ================= GAME =================
const Game = {
  session: null,

  start(level, opts = {}) {
    this.stop();
    const canvas = document.getElementById('gamecanvas');
    const sess = {
      level, opts,
      canvas, ctx: canvas.getContext('2d'),
      run: createRun(level),
      input: { held: false, pressT: -1 },
      attempts: 1,
      bestPct: 0,
      practice: !!opts.practice,
      checkpoints: [],
      lastCpTime: 0,
      particles: [],
      waveTrail: [],
      camY: 0,
      bgColor: level.bg || DEFAULT_BG,
      groundColor: level.ground || DEFAULT_GROUND,
      bgLerp: null, groundLerp: null,
      acc: 0, lastT: performance.now(),
      deadTimer: 0,
      wonHandled: false,
      raf: 0,
      time: 0,
      coinAnim: [],
    };
    this.session = sess;

    // input handlers
    sess.onDown = (e) => {
      if (e.type === 'keydown') {
        if (e.code === 'Escape') { this.togglePause(); return; }
        if (e.code !== 'Space' && e.code !== 'ArrowUp' && e.code !== 'KeyW') return;
        if (e.repeat) return;
        e.preventDefault();
      }
      if (this.paused) return;
      sess.input.held = true;
      sess.input.pressT = sess.run.time;
      AudioEngine.resume();
    };
    sess.onUp = (e) => {
      if (e.type === 'keyup' && e.code !== 'Space' && e.code !== 'ArrowUp' && e.code !== 'KeyW') return;
      sess.input.held = false;
    };
    canvas.addEventListener('pointerdown', sess.onDown);
    window.addEventListener('pointerup', sess.onUp);
    window.addEventListener('keydown', sess.onDown);
    window.addEventListener('keyup', sess.onUp);

    this.paused = false;
    this.startMusic(sess, 0);
    UI.showHUD(true, sess);
    sess.raf = requestAnimationFrame((t) => this.loop(t));
    // rAF stops in hidden tabs — keep simulating so the run stays consistent
    sess.hiddenTicker = setInterval(() => {
      if (document.visibilityState === 'hidden' && this.session === sess) {
        this.tick(performance.now());
      }
    }, 16);
  },

  stop() {
    const sess = this.session;
    if (!sess) return;
    cancelAnimationFrame(sess.raf);
    clearInterval(sess.hiddenTicker);
    sess.canvas.removeEventListener('pointerdown', sess.onDown);
    window.removeEventListener('pointerup', sess.onUp);
    window.removeEventListener('keydown', sess.onDown);
    window.removeEventListener('keyup', sess.onUp);
    AudioEngine.stopMusic();
    UI.showHUD(false);
    this.session = null;
    this.paused = false;
  },

  togglePause() {
    if (!this.session) return;
    this.paused = !this.paused;
    if (this.paused) {
      AudioEngine.stopMusic();
      UI.showPause(this.session);
    } else {
      UI.hidePause();
      const sess = this.session;
      sess.lastT = performance.now();
      if (!sess.run.player.dead) this.startMusic(sess, sess.run.time);
    }
  },

  // plays the user's own local audio file for this level if one is attached,
  // otherwise the built-in synth song
  startMusic(sess, offset) {
    const go = () => {
      if (this.session !== sess || this.paused) return;
      if (sess.customBlob) AudioEngine.playCustom(sess.customBlob, offset);
      else if (sess.level.song) AudioEngine.playSong(sess.level.song, offset);
    };
    if (sess.customChecked) { go(); return; }
    MusicStore.get(sess.level.id)
      .then(b => { sess.customBlob = b; sess.customChecked = true; go(); })
      .catch(() => { sess.customChecked = true; go(); });
  },

  restartAttempt(full) {
    const sess = this.session;
    if (!sess) return;
    sess.attempts++;
    if (sess.practice && sess.checkpoints.length && !full) {
      restoreRun(sess.run, sess.checkpoints[sess.checkpoints.length - 1]);
    } else {
      sess.run = createRun(sess.level);
      sess.checkpoints = [];
      sess.lastCpTime = 0;
      this.startMusic(sess, 0);
    }
    sess.input.held = false;
    sess.input.pressT = -1;
    sess.waveTrail = [];
    sess.deadTimer = 0;
    sess.bgColor = sess.level.bg || DEFAULT_BG;
    sess.groundColor = sess.level.ground || DEFAULT_GROUND;
    sess.bgLerp = sess.groundLerp = null;
  },

  setPractice(on) {
    const sess = this.session;
    if (!sess) return;
    sess.practice = on;
    sess.checkpoints = [];
    UI.updateHUD(sess);
  },

  loop(t) {
    const sess = this.session;
    if (!sess) return;
    sess.raf = requestAnimationFrame((tt) => this.loop(tt));
    this.tick(t);
  },

  tick(t) {
    const sess = this.session;
    if (!sess) return;
    const dtReal = Math.min(0.25, (t - sess.lastT) / 1000);
    sess.lastT = t;
    sess.time += dtReal;
    if (this.paused) { this.render(); return; }

    const p = sess.run.player;

    if (p.dead) {
      sess.deadTimer += dtReal;
      if (sess.deadTimer > 0.85) this.restartAttempt(false);
    } else if (!p.won) {
      sess.acc += dtReal;
      let steps = 0;
      while (sess.acc >= PHYS_DT && steps < 24) {
        stepRun(sess.run, sess.input, PHYS_DT);
        sess.acc -= PHYS_DT;
        steps++;
        if (p.dead || p.won) break;
      }
      this.handleFx(sess);

      // practice auto-checkpoints
      if (sess.practice && !p.dead && !p.won && p.onGround && sess.run.time - sess.lastCpTime > 3) {
        sess.checkpoints.push(snapshotRun(sess.run));
        if (sess.checkpoints.length > 40) sess.checkpoints.shift();
        sess.lastCpTime = sess.run.time;
        AudioEngine.sfxCheckpoint();
      }

      // wave trail
      if (p.mode === 'wave') {
        sess.waveTrail.push({ x: p.x, y: p.y });
        if (sess.waveTrail.length > 90) sess.waveTrail.shift();
      } else if (sess.waveTrail.length) {
        sess.waveTrail.shift();
      }

      const pct = Math.min(100, Math.round(p.x / sess.level.length * 100));
      if (pct > sess.bestPct) sess.bestPct = pct;
    }

    if (p.won && !sess.wonHandled) {
      sess.wonHandled = true;
      AudioEngine.stopMusic();
      AudioEngine.sfxWin();
      setTimeout(() => {
        if (sess.opts.onComplete) sess.opts.onComplete(sess);
      }, 700);
    }

    UI.updateHUD(sess);
    this.render();
  },

  handleFx(sess) {
    for (const fx of sess.run.fx) {
      switch (fx.type) {
        case 'death': {
          AudioEngine.sfxDeath();
          for (let i = 0; i < 26; i++) {
            const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 9;
            sess.particles.push({
              x: fx.x, y: fx.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 0.65, maxLife: 0.65, color: Save.data.icons.colorP, size: 0.16 + Math.random() * 0.14,
            });
          }
          if (sess.opts.onDeath) sess.opts.onDeath(sess);
          break;
        }
        case 'orb': AudioEngine.sfxOrb(); this.ring(sess, fx.x, fx.y, '#fff'); break;
        case 'pad': AudioEngine.sfxPad(); break;
        case 'portal': AudioEngine.sfxPortal(); this.ring(sess, fx.x, fx.y, '#c2ecff'); break;
        case 'speed': AudioEngine.sfxPortal(); break;
        case 'coin': {
          AudioEngine.sfxCoin();
          sess.coinAnim.push({ idx: fx.idx, t: 0 });
          this.ring(sess, fx.x, fx.y, '#ffd51e');
          break;
        }
        case 'trigger': {
          if (fx.trigger === 'bg') sess.bgLerp = { from: sess.bgColor, to: fx.color, t: 0, dur: fx.dur };
          else sess.groundLerp = { from: sess.groundColor, to: fx.color, t: 0, dur: fx.dur };
          break;
        }
        case 'spiderTp': {
          for (let i = 0; i < 8; i++) {
            sess.particles.push({
              x: fx.x, y: fx.y0 + (fx.y1 - fx.y0) * (i / 8), vx: 0, vy: 0,
              life: 0.3, maxLife: 0.3, color: '#b44eff', size: 0.14,
            });
          }
          break;
        }
      }
    }
    sess.run.fx.length = 0;
  },

  ring(sess, x, y, color) {
    sess.particles.push({ x, y, vx: 0, vy: 0, life: 0.35, maxLife: 0.35, color, size: 0.5, ring: true });
  },

  render() {
    const sess = this.session;
    if (!sess) return;
    const { canvas, ctx, run } = sess;
    const p = run.player;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth * dpr, H = canvas.clientHeight * dpr;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }

    // color lerps from triggers
    for (const key of ['bgLerp', 'groundLerp']) {
      const l = sess[key];
      if (l) {
        l.t += 1 / 60;
        const t = Math.min(1, l.t / l.dur);
        const col = lerpColor(l.from, l.to, t);
        if (key === 'bgLerp') sess.bgColor = col; else sess.groundColor = col;
        if (t >= 1) sess[key] = null;
      }
    }

    // camera
    const zoom = Math.max(24, H / 13.5);
    const groundScreenY = H - Math.max(70 * dpr, H * 0.16);
    const targetCamY = Math.max(0, p.y - 4.6);
    sess.camY += (targetCamY - sess.camY) * 0.08;
    const view = {
      camX: p.x, camY: sess.camY, zoom,
      px: W * 0.3, w: W, h: H,
      groundScreenY,
      bgColor: sess.bgColor, groundColor: sess.groundColor,
    };

    Renderer.drawBackground(ctx, view);
    Renderer.drawGround(ctx, view);

    // finish line
    const fin = Renderer.worldToScreen(view, sess.level.length, 0);
    if (fin.x < W + 60) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.fillRect(fin.x, 0, 6 * dpr, groundScreenY - (0 - view.camY) * zoom);
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.5)';
        ctx.fillRect(fin.x, i * zoom * 0.8, 6 * dpr, zoom * 0.4);
      }
      ctx.restore();
    }

    Renderer.drawObjects(ctx, view, run.objects, sess.time, false, null);

    if (!p.dead) Renderer.drawPlayer(ctx, view, p, Save.data, p.mode === 'wave' ? sess.waveTrail : null);

    // particles
    for (let i = sess.particles.length - 1; i >= 0; i--) {
      const pt = sess.particles[i];
      pt.life -= 1 / 60;
      if (pt.life <= 0) { sess.particles.splice(i, 1); continue; }
      pt.x += pt.vx / 60; pt.y += pt.vy / 60;
      pt.vy -= 12 / 60;
      const s = Renderer.worldToScreen(view, pt.x, pt.y);
      const a = pt.life / pt.maxLife;
      ctx.globalAlpha = a;
      if (pt.ring) {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 3 * dpr;
        ctx.beginPath();
        ctx.arc(s.x, s.y, (1 - a + 0.2) * zoom * pt.size * 2.4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = pt.color;
        ctx.fillRect(s.x - pt.size * zoom / 2, s.y - pt.size * zoom / 2, pt.size * zoom, pt.size * zoom);
      }
      ctx.globalAlpha = 1;
    }
  },
};

if (typeof module !== 'undefined') module.exports = { Game, Renderer };
