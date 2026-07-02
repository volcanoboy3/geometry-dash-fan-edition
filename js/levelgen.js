// Level generator: pattern-grammar levels whose spacing is DERIVED from the physics
// constants, so generated levels are beatable by construction. Every level also
// carries bot data (press events + guide path) so solveLevel() can verify it headless.
// Also defines: main level set, online level database, gauntlets.
'use strict';

if (typeof require !== 'undefined' && typeof window === 'undefined') {
  // Node (test harness): expose deps as globals without redeclaring browser consts
  Object.assign(globalThis,
    require('./constants.js'), require('./rng.js'),
    require('./objects.js'), require('./physics.js'));
}

// ---------- physics-derived motion math ----------
const GenMath = {
  apex(v, g) { return v * v / (2 * g); },
  // time to fall/land at dy below launch point (dy >= 0), starting with upward v
  landTime(v, g, dy) { return (v + Math.sqrt(v * v + 2 * g * dy)) / g; },
  cubeJumpV(mini) { return PHYS.cube.jumpVel * (mini ? PHYS.mini.jump : 1); },
  airtime(v, g) { return 2 * v / g; },

  // Numeric jump sim using the SAME integration order as physics.js (semi-implicit
  // Euler @240Hz). profile: {v0, g, hold, cancel} — cancel=true models the robot's
  // gravity-cancelled hold phase. Returns curve info:
  //   apex, T (back to launch height), t1(h)/t2(h) = first/last time at height ≥ h.
  jumpInfo(profile) {
    const dt = PHYS_DT;
    let y = 0, vy = profile.v0, t = 0, apex = 0;
    const samples = [{ t: 0, y: 0 }];
    for (let i = 0; i < 240 * 6; i++) {
      if (!(profile.cancel && t < profile.hold)) vy -= profile.g * dt;
      y += vy * dt;
      t += dt;
      samples.push({ t, y });
      if (y > apex) apex = y;
      if (y <= 0 && vy < 0 && t > 0.02) break;
    }
    const T = t;
    return {
      apex, T,
      // first time height crosses h going up
      t1(h) { for (const s of samples) if (s.y >= h) return s.t; return null; },
      // last time height is still ≥ h (descending crossing)
      t2(h) { let last = null; for (const s of samples) if (s.y >= h) last = s.t; return last; },
    };
  },
};

function cubeG(ctx) { return GRAV_CUBE[ctx.speedIdx]; }

function jumpProfile(ctx, robot, holdOverride) {
  const mini = ctx.mini ? PHYS.mini.jump : 1;
  if (robot) {
    const hold = holdOverride != null ? holdOverride : 0.12 + Math.min(ctx.d, 8) * 0.019;
    return { v0: PHYS.robot.initVel * mini, g: PHYS.robot.gravity, hold, cancel: true };
  }
  return { v0: JUMP_CUBE[ctx.speedIdx] * mini, g: cubeG(ctx), hold: 0 };
}

// snap to cell center
const cell = v => Math.floor(v) + 0.5;

// ---------- generator context ----------
function makeCtx(seed, d) {
  return {
    x: 4,               // cursor (blocks)
    d,                  // difficulty scalar 1..10
    rng: makeRNG(hashSeed(seed)),
    speedIdx: 1,
    mini: false,
    objects: [],
    presses: [],        // [{x, holdX}] discrete inputs (cube/robot/ball/spider/orbs)
    guide: [],          // [{x, y}] target path for fly modes
    coinSpots: [],
    add(t, x, y, extra) { const o = Object.assign({ t, x, y }, extra || {}); this.objects.push(o); return o; },
    press(x, holdX) { this.presses.push({ x, holdX: holdX != null ? holdX : x + 0.6 }); },
    guidePt(x, y) { this.guide.push({ x, y }); },
    speed() { return SPEEDS[this.speedIdx]; },
    scale() { return SPEEDS[this.speedIdx] / SPEEDS[1]; }, // pattern width scale vs 1x
  };
}

// ================= CUBE / ROBOT patterns =================
// Every pattern starts AND ends with the player grounded at floor level.

// helper: full jump info for the current mode/speed
function jumpParams(ctx, robot, holdOverride) {
  const prof = jumpProfile(ctx, robot, holdOverride);
  const info = GenMath.jumpInfo(prof);
  return { D: ctx.speed() * info.T, apex: info.apex, T: info.T, info, prof };
}
function pressFor(ctx, robot, pressX, prof) {
  ctx.press(pressX, robot ? pressX + Math.max(0.6, prof.hold * ctx.speed()) : pressX + 0.6);
}

function patSpikeRow(ctx, robot) {
  const jp = jumpParams(ctx, robot);
  const half = (ctx.mini ? PHYS.mini.size : 1) / 2;
  // window where the player is safely above spike tips (hazard top 0.7 + margin)
  const hClear = 0.7 + half * 0.9 - half + 0.35;
  const t1 = jp.info.t1(hClear), t2 = jp.info.t2(hClear);
  if (t1 == null || t2 == null) return;   // degenerate jump — skip pattern
  const reach = half * 0.9 + 0.1 + 0.35;  // lateral spike reach + safety
  const fit = Math.floor(ctx.speed() * (t2 - t1) - 2 * reach) + 1;
  const wantN = ctx.d < 2.5 ? 1 : ctx.d < 5 ? ctx.rng.int(1, 2) : ctx.rng.int(2, 3);
  const n = Math.max(1, Math.min(wantN, fit));
  const windowMid = (t1 + t2) / 2 * ctx.speed();
  const firstCell = cell(ctx.x + 2.5 + windowMid - (n - 1) / 2);
  for (let i = 0; i < n; i++) ctx.add('spike', firstCell + i, 0.5);
  const center = firstCell + (n - 1) / 2;
  const pressX = center - windowMid;
  pressFor(ctx, robot, pressX, jp.prof);
  if (ctx.rng.chance(0.3)) ctx.coinSpots.push({ x: center, y: jp.apex + 1.6 });
  ctx.x = pressX + jp.D + 1.6;
}

function patWall(ctx, robot) {
  // wall the player must jump over. Cube can only clear h=1 (+optional spike on top
  // needs extra clearance); robot's high jump clears h=2.
  const h = robot && ctx.d >= 4.5 ? 2 : 1;
  const spikeTop = !robot && ctx.d >= 5 && ctx.rng.chance(0.4);
  const jp = jumpParams(ctx, robot, robot ? PHYS.robot.maxHold : undefined);
  const hClear = h + (spikeTop ? 0.75 : 0.15);
  const t1 = jp.info.t1(hClear), t2 = jp.info.t2(hClear);
  if (t1 == null || t2 == null || (t2 - t1) * ctx.speed() < 2.3) return patSpikeRow(ctx, robot);
  const wx = cell(ctx.x + 2.5 + ctx.speed() * t1 + 1.1);
  const skin = ctx.rng.pick(['block', 'block_grid', 'block_brick']);
  for (let i = 0; i < h; i++) ctx.add(skin, wx, 0.5 + i);
  if (spikeTop) ctx.add('spike', wx, 0.5 + h);
  // press so the rising crossing of hClear happens just before the wall's left face
  const pressX = (wx - 1.1) - ctx.speed() * t1;
  pressFor(ctx, robot, pressX, jp.prof);
  ctx.x = pressX + jp.D + 1.6;
}

function patBlockHop(ctx, robot) {
  // jump over a base spike and land ON TOP of a height-1 platform, run off it
  const jp = jumpParams(ctx, robot, robot ? 0.2 : undefined);
  const t2 = jp.info.t2(1.0);            // descending crossing of the platform top
  if (t2 == null) return patSpikeRow(ctx, robot);
  const len = ctx.rng.int(2, 4);
  const bx = cell(ctx.x + 2 + ctx.speed() * t2);
  for (let i = 0; i < len; i++) ctx.add('block', bx + i, 0.5);
  ctx.add('spike', bx - 1, 0.5);         // forces the jump
  const landX = bx + 0.4;
  const pressX = landX - ctx.speed() * t2;
  pressFor(ctx, robot, pressX, jp.prof);
  if (ctx.rng.chance(0.35)) ctx.coinSpots.push({ x: bx + len / 2, y: 3.4 });
  ctx.x = bx + len + 3;                  // walk off the end and fall back to ground
}

function patOrbHop(ctx, robot) {
  const jp = jumpParams(ctx, robot);
  const orb = ctx.d >= 7 ? ctx.rng.pick(['yellow', 'pink', 'red']) : ctx.d >= 4 ? ctx.rng.pick(['yellow', 'pink']) : 'yellow';
  const miniJ = ctx.mini ? PHYS.mini.jump : 1;
  const vOrb = ORB_VEL[orb].v * miniJ;
  const g = cubeG(ctx);
  const press1 = ctx.x + 2.2;
  const orbX = press1 + jp.D * 0.62;
  const orbY = Math.max(1.6, jp.apex * 0.8 + 0.5);
  ctx.add('orb_' + orb, orbX, orbY);
  pressFor(ctx, robot, press1, jp.prof);
  ctx.press(orbX - 0.15, orbX + 0.7);
  // after the orb: rise then land back on ground. Land window depends on the exact
  // y at activation (±0.6) — use the EARLIEST landing for hazard placement.
  const tLandEarly = GenMath.landTime(vOrb, g, Math.max(0, orbY - 0.6 - 0.5));
  const tLandLate = GenMath.landTime(vOrb, g, orbY + 0.6 - 0.5);
  const landEarly = orbX + ctx.speed() * tLandEarly;
  // carpet start: after the RISING clearance crossing of this mode's jump curve
  // (the robot rises much slower than the cube)
  const half = (ctx.mini ? PHYS.mini.size : 1) / 2;
  const hClear = 0.7 + half * 0.9 - half + 0.35;
  const reach = half * 0.9 + 0.1 + 0.35;
  const t1c = jp.info.t1(hClear);
  if (t1c == null) return patSpikeRow(ctx, robot);
  const from = cell(press1 + ctx.speed() * t1c + reach), to = cell(landEarly - 1.5);
  for (let cx = from; cx <= to; cx++) ctx.add(ctx.rng.chance(0.85) ? 'spike' : 'spikes_triple_small', cx, 0.5);
  ctx.coinSpots.push({ x: orbX, y: orbY + GenMath.apex(vOrb, g) + 1.2 });
  ctx.x = orbX + ctx.speed() * tLandLate + 2;
}

function patPad(ctx) {
  const padType = ctx.d >= 6 && ctx.rng.chance(0.4) ? 'red' : 'yellow';
  const vPad = PAD_VEL[padType].v * (ctx.mini ? PHYS.mini.jump : 1);
  const g = cubeG(ctx);
  const T = GenMath.airtime(vPad, g);
  const padX = cell(ctx.x + 2.5);
  // pads auto-fire when the outer box touches: activation ≈ 1 block before center
  const liftX = padX - 1.0;
  const D = ctx.speed() * T;
  ctx.add('pad_' + padType, padX, 0.5);
  const from = cell(liftX + 1.6), to = cell(liftX + D - 1.6);
  for (let cx = from; cx <= to; cx++) ctx.add('spike', cx, 0.5);
  ctx.coinSpots.push({ x: liftX + D / 2, y: GenMath.apex(vPad, g) + 1.4 });
  ctx.x = liftX + D + 2;
}

function patStairs(ctx, robot) {
  // two-step staircase: land on 1-high block, then onto a 2-high stack, hop off
  const jp = jumpParams(ctx, robot, robot ? 0.2 : undefined);
  const t2 = jp.info.t2(1.0);
  if (t2 == null) return patSpikeRow(ctx, robot);
  const dxLand = ctx.speed() * t2;
  const b1 = cell(ctx.x + 2 + dxLand);
  ctx.add('block_grid', b1, 0.5);
  ctx.add('spike', b1 - 1, 0.5);
  const press1 = (b1 - 0.1) - dxLand;
  pressFor(ctx, robot, press1, jp.prof);
  const press2 = b1 + 0.65;
  const b2 = cell(press2 + dxLand - 0.2);
  ctx.add('block_grid', b2, 0.5); ctx.add('block_grid', b2, 1.5);
  pressFor(ctx, robot, press2, jp.prof);
  ctx.x = b2 + 4.5; // hop off the double stack
}

const CUBE_PATTERNS = [
  { minD: 0, w: patSpikeRow },
  { minD: 1.5, w: patBlockHop },
  { minD: 1.2, w: patPad, needs: 'pads' },
  { minD: 2.5, w: patOrbHop, needs: 'orbs' },
  { minD: 3.5, w: patWall },
  { minD: 4, w: patStairs },
];

function genGroundSegment(ctx, endX, robot) {
  while (ctx.x < endX - 8 * ctx.scale()) {
    const pool = CUBE_PATTERNS.filter(p =>
      p.minD <= ctx.d && (!p.needs || !ctx.features || ctx.features[p.needs] !== false));
    ctx.rng.pick(pool).w(ctx, robot);
    const rest = Math.max(1.2, 4.4 - 0.34 * ctx.d) + ctx.rng.range(0, 1.6);
    ctx.x += rest * ctx.scale();
  }
  ctx.x = Math.max(ctx.x, endX);
}

// ================= BALL / SPIDER corridor =================
function genBallSegment(ctx, endX, spider) {
  const top = 4; // corridor: floor 0 → ceiling 4
  const rowY = top + 0.5;
  const startX = cell(ctx.x);
  let side = 1; // 1=floor, -1=ceiling
  const transit = Math.sqrt(2 * (top - 1) / (spider ? 1 : PHYS.ball.gravity) ) ; // spider is instant
  const transitDx = spider ? 0.4 : ctx.speed() * Math.sqrt(2 * (top - 1) / PHYS.ball.gravity);
  let x = ctx.x + 6 * ctx.scale();
  const spacing = () => (Math.max(3.2, 7.5 - 0.45 * ctx.d) + ctx.rng.range(0, 2)) * ctx.scale();

  while (x < endX - 8 * ctx.scale()) {
    const n = ctx.d < 4 ? 1 : ctx.rng.int(1, 2);
    const sx = cell(x + transitDx + 1);
    for (let i = 0; i < n; i++) {
      if (side === 1) ctx.add('spike', sx + i, 0.5);                    // floor spike → flee to ceiling
      else ctx.add('spike', sx + i, top - 0.5, { r: 180 });             // ceiling spike → flee to floor
    }
    ctx.press(x, x + 0.5);
    side *= -1;
    x = sx + n + spacing();
  }
  // ensure we end on the floor
  if (side === -1) { ctx.press(x, x + 0.5); x += transitDx + 2; }
  const endCell = cell(Math.max(x, endX) + 2);
  for (let cx = startX; cx <= endCell; cx++) ctx.add('block_dark', cx, rowY);
  ctx.x = Math.max(x, endX);
}

// ================= SHIP / UFO / WAVE corridor =================
function genFlySegment(ctx, endX, mode) {
  const top = mode === 'wave' ? 6 : 8;
  const rowY = top + 0.5;
  const startX = cell(ctx.x);
  const gapMin = mode === 'wave' ? Math.max(2.4, 4.6 - 0.2 * ctx.d)
    : mode === 'ufo' ? Math.max(3.4, 5.7 - 0.24 * ctx.d)
      : Math.max(3.0, 5.4 - 0.24 * ctx.d);
  let gc = top / 2;
  ctx.guidePt(ctx.x, 1.5);
  ctx.guidePt(ctx.x + 4 * ctx.scale(), gc);
  let x = ctx.x + 7 * ctx.scale();
  while (x < endX - 9 * ctx.scale()) {
    const gp = gapMin + ctx.rng.range(0, 1.2);
    // limit vertical shift between consecutive gaps — ship/ufo dive/climb ramps are slow
    const maxShift = mode === 'wave' ? 2.4 : 1.7;
    let ngc = gc + ctx.rng.range(-maxShift, maxShift);
    ngc = Math.max(gp / 2 + 0.6, Math.min(top - gp / 2 - 0.6, ngc));
    gc = ngc;
    const bx = cell(x);
    const gapLo = gc - gp / 2, gapHi = gc + gp / 2;
    for (let y = 0.5; y < gapLo; y++) ctx.add('block_dark', bx, y);
    for (let y = top - 0.5; y > gapHi; y--) ctx.add('block_dark', bx, y);
    // spice: sawblade in wide gaps at high difficulty
    if (ctx.d >= 6.5 && gp > gapMin + 0.8 && ctx.rng.chance(0.3)) {
      ctx.add('sawblade', bx, ctx.rng.chance(0.5) ? gapHi + 1 : Math.max(0.8, gapLo - 1));
    }
    ctx.guidePt(bx - 3.4 * ctx.scale(), gc);
    ctx.guidePt(bx + 1.2, gc);
    x = bx + (Math.max(6, 9.5 - 0.35 * ctx.d) + ctx.rng.range(0, 2.5)) * ctx.scale();
  }
  // glide back down to ground level for the segment exit
  ctx.guidePt(x, 2.2);
  ctx.guidePt(Math.max(x + 3, endX), 1.2);
  const endCell = cell(Math.max(x, endX) + 2);
  for (let cx = startX; cx <= endCell; cx++) ctx.add('block_dark', cx, rowY);
  ctx.x = Math.max(x, endX);
}

// ================= full level assembly =================
// cfg: { id, name, author, difficulty, lengthSec, modeSeq:[{mode,frac}], seed,
//        song, bgTheme:[hues], speeds:bool, mini:bool, coins:bool }
function generateLevel(cfg) {
  const d = DIFF_GEN[cfg.difficulty] != null ? DIFF_GEN[cfg.difficulty] : 3;
  const ctx = makeCtx(cfg.seed, d);
  ctx.features = cfg.features || null;   // e.g. {pads:false, orbs:false} for early levels
  const lengthSec = cfg.lengthSec || 60;
  const totalBlocks = SPEEDS[1] * lengthSec; // approx; speed portals stretch play time
  const modeSeq = cfg.modeSeq && cfg.modeSeq.length ? cfg.modeSeq : [{ mode: 'cube', frac: 1 }];
  const fracSum = modeSeq.reduce((s, m) => s + (m.frac || 1), 0);

  let firstMode = modeSeq[0].mode;
  let curMode = firstMode;
  let miniOn = false;

  modeSeq.forEach((seg, si) => {
    const segBlocks = totalBlocks * (seg.frac || 1) / fracSum;
    const endX = ctx.x + segBlocks;

    if (si > 0) {
      // transition portal near the ground
      const px = cell(ctx.x + 1);
      ctx.add('portal_' + seg.mode, px, 1.5);
      curMode = seg.mode;
      ctx.x = px + 3.5;
    }

    // occasional speed portal at segment start (ground modes only)
    if (cfg.speeds && si > 0 && (seg.mode === 'cube' || seg.mode === 'robot')) {
      const maxSpeed = d >= 9 ? 4 : d >= 7 ? 3 : d >= 4 ? 2 : 1;
      const ns = ctx.rng.int(1, maxSpeed);
      if (ns !== ctx.speedIdx) {
        ctx.add('speed_' + (ns === 0 ? '05' : ns), cell(ctx.x + 0.6), 1.0);
        ctx.speedIdx = ns;
        ctx.x += 2;
      }
    }

    // mini section: only inside cube segments, difficulty-gated
    let doMini = cfg.mini && seg.mode === 'cube' && d >= 5.5 && ctx.rng.chance(0.5) && !miniOn;

    switch (seg.mode) {
      case 'cube': {
        if (doMini) {
          const midEnd = ctx.x + (endX - ctx.x) * 0.45;
          genGroundSegment(ctx, midEnd, false);
          ctx.add('portal_mini', cell(ctx.x + 1), 1.5); ctx.x += 3; ctx.mini = true;
          genGroundSegment(ctx, ctx.x + (endX - ctx.x) * 0.6, false);
          ctx.add('portal_big', cell(ctx.x + 1), 1.5); ctx.x += 3; ctx.mini = false;
          genGroundSegment(ctx, endX, false);
        } else {
          genGroundSegment(ctx, endX, false);
        }
        break;
      }
      case 'robot': genGroundSegment(ctx, endX, true); break;
      case 'ball': genBallSegment(ctx, endX, false); break;
      case 'spider': genBallSegment(ctx, endX, true); break;
      case 'ship': case 'ufo': case 'wave': genFlySegment(ctx, endX, seg.mode); break;
      default: genGroundSegment(ctx, endX, false);
    }
    ctx.x += 3;
  });

  // background/ground color triggers along the way
  const hues = cfg.bgTheme || [215, 265, 315, 195];
  const levelLen = ctx.x + 6;
  const nTrig = Math.max(2, Math.floor(lengthSec / 15));
  for (let i = 1; i <= nTrig; i++) {
    const tx = (levelLen * i) / (nTrig + 1);
    const hue = hues[i % hues.length];
    ctx.objects.push({ t: 'trigger_bg', x: tx, y: 5, color: `hsl(${hue},72%,42%)`, dur: 2 });
    ctx.objects.push({ t: 'trigger_ground', x: tx + 0.5, y: 5, color: `hsl(${hue},70%,28%)`, dur: 2 });
  }

  // coins: pick 3 spread-out spots
  if (cfg.coins !== false && ctx.coinSpots.length) {
    const spots = ctx.coinSpots.sort((a, b) => a.x - b.x);
    const picks = [];
    for (const f of [0.2, 0.55, 0.85]) {
      const target = levelLen * f;
      let best = null, bd = 1e9;
      for (const s of spots) { const dd = Math.abs(s.x - target); if (dd < bd && !picks.includes(s)) { bd = dd; best = s; } }
      if (best) picks.push(best);
    }
    for (const s of picks) ctx.objects.push({ t: 'coin', x: s.x, y: Math.min(s.y, 10) });
  }

  const diffMeta = diffById(cfg.difficulty);
  return {
    id: cfg.id,
    name: cfg.name,
    author: cfg.author || 'RobTopFan',
    difficulty: cfg.difficulty,
    stars: cfg.stars != null ? cfg.stars : diffMeta.stars,
    length: levelLen,
    lengthSec,
    mode0: firstMode,
    speed0: 1,
    ceilH: 12,
    objects: ctx.objects,
    bot: { presses: ctx.presses.sort((a, b) => a.x - b.x), guide: ctx.guide },
    song: cfg.song,
    coinsTotal: ctx.objects.filter(o => o.t === 'coin').length,
  };
}

// ================= bot solver (headless verification) =================
function guideYAt(guide, x, fallback) {
  if (!guide || !guide.length) return fallback;
  if (x <= guide[0].x) return guide[0].y;
  for (let i = 1; i < guide.length; i++) {
    if (x <= guide[i].x) {
      const a = guide[i - 1], b = guide[i];
      const t = (x - a.x) / Math.max(0.0001, b.x - a.x);
      return a.y + (b.y - a.y) * t;
    }
  }
  return guide[guide.length - 1].y;
}

function solveLevel(level, maxTime = 400) {
  const run = createRun(level);
  const input = { held: false, pressT: -1 };
  const presses = (level.bot && level.bot.presses) || [];
  const guide = (level.bot && level.bot.guide) || [];
  let pi = 0;
  let releaseX = -1;
  let ufoCd = 0;
  let wasFly = false;
  const maxSteps = Math.ceil(maxTime / PHYS_DT);

  for (let i = 0; i < maxSteps; i++) {
    const p = run.player;
    const fly = p.mode === 'ship' || p.mode === 'wave' || p.mode === 'ufo';
    if (wasFly && !fly) {          // fly → ground transition: release the button
      input.held = false;
      input.pressT = -1;
      releaseX = -1;
    }
    wasFly = fly;

    if (!fly) {
      // discrete press schedule
      while (pi < presses.length && p.x >= presses[pi].x) {
        input.held = true;
        input.pressT = run.time;
        releaseX = presses[pi].holdX;
        pi++;
      }
      if (input.held && releaseX >= 0 && p.x >= releaseX) { input.held = false; releaseX = -1; }
    } else {
      // skip any stale discrete presses so they don't fire later
      while (pi < presses.length && p.x >= presses[pi].x) pi++;
      // look ahead so slow thrust ramps start early enough
      const gy = guideYAt(guide, p.x + SPEEDS[p.speedIdx] * 0.22, 4);
      if (p.mode === 'ufo') {
        ufoCd -= PHYS_DT;
        input.held = false;
        // a tap rises ≈ tap²/2g ≈ 1.42 blocks — only tap when that apex stays near the gap
        if (p.y < gy - 0.9 && p.vy * p.gravDir < 2 && ufoCd <= 0) {
          input.pressT = run.time;
          ufoCd = 0.14;
        }
      } else if (p.mode === 'wave') {
        if (p.y < gy - 0.15) input.held = true;
        else if (p.y > gy + 0.15) input.held = false;
      } else {
        // ship: velocity-compensated bang-bang (momentum overshoots ~vy²/2a)
        input.held = (p.y - gy) + p.vy * 0.3 < 0;
      }
    }

    stepRun(run, input, PHYS_DT);
    run.fx.length = 0;
    if (p.dead || p.won) break;
  }

  return {
    won: run.player.won,
    dead: run.player.dead,
    x: run.player.x,
    percent: Math.max(0, Math.min(100, Math.round(run.player.x / level.length * 100))),
    time: run.time,
  };
}

// ================= song spec factory =================
function makeSong(seed, mood, bpm, name, artist) {
  const MOODS = {
    upbeat:  { scale: 'major',     prog: [0, 5, 3, 4], drums: 'four',   bass: 'eighth',  lead: 'arp',    leadWave: 'square' },
    house:   { scale: 'minor',     prog: [0, 5, 1, 4], drums: 'four',   bass: 'pump',    lead: 'melody', leadWave: 'square' },
    funky:   { scale: 'dorian',    prog: [0, 3, 4, 3], drums: 'breaks', bass: 'offbeat', lead: 'riff',   leadWave: 'sawtooth' },
    dark:    { scale: 'harmMinor', prog: [0, 1, 0, 4], drums: 'half',   bass: 'pump',    lead: 'riff',   leadWave: 'sawtooth' },
    intense: { scale: 'phrygian',  prog: [0, 1, 3, 1], drums: 'four',   bass: 'eighth',  lead: 'arp',    leadWave: 'sawtooth' },
    chill:   { scale: 'minorPent', prog: [0, 3, 4, 3], drums: 'half',   bass: 'slow',    lead: 'melody', leadWave: 'triangle' },
  };
  const m = MOODS[mood] || MOODS.house;
  const rng = makeRNG(hashSeed(seed + '-song'));
  return Object.assign({
    bpm, root: 45 + rng.int(0, 7), barsPerChord: 1, loopBars: 16,
    seed: seed + '-song', name: name || 'Untitled Loop', artist: artist || 'SynthBot',
  }, m);
}

// ================= MAIN LEVELS =================
// Recreations of the 22 official main levels: names, difficulty faces, star values,
// lengths and mode sequences follow the real metadata (per wiki research); the
// layouts and music are original. Speed portals first appear in Electrodynamix (15).
const MAIN_LEVELS = [
  { n: 1,  name: 'Stereo Madness',        difficulty: 'easy',    stars: 1,  sec: 89,  mood: 'upbeat',  bpm: 126, modes: [['cube', 2.6], ['ship', 1.5], ['cube', 3.4], ['ship', 1.3]], features: { pads: false, orbs: false } },
  { n: 2,  name: 'Back On Track',         difficulty: 'easy',    stars: 2,  sec: 84,  mood: 'house',   bpm: 128, modes: [['cube', 4.4], ['ship', 1.5], ['cube', 3.1]], features: { orbs: false } },
  { n: 3,  name: 'Polargeist',            difficulty: 'normal',  stars: 3,  sec: 93,  mood: 'upbeat',  bpm: 130, modes: [['cube', 4], ['ship', 1.6], ['cube', 3.4]] },
  { n: 4,  name: 'Dry Out',               difficulty: 'normal',  stars: 4,  sec: 84,  mood: 'house',   bpm: 130, modes: [['cube', 3], ['cube', 1.5], ['ship', 1.5], ['cube', 1.5]] },
  { n: 5,  name: 'Base After Base',       difficulty: 'hard',    stars: 5,  sec: 86,  mood: 'funky',   bpm: 132, modes: [['cube', 4.5], ['ship', 1.5], ['cube', 1.4], ['cube', 1.3]] },
  { n: 6,  name: 'Cant Let Go',           difficulty: 'hard',    stars: 6,  sec: 83,  mood: 'house',   bpm: 134, modes: [['cube', 4], ['ship', 1.4], ['cube', 2.8]] },
  { n: 7,  name: 'Jumper',                difficulty: 'harder',  stars: 7,  sec: 89,  mood: 'intense', bpm: 136, modes: [['cube', 2.2], ['ship', 1.1], ['cube', 2.2], ['ship', 1.2], ['cube', 2.2]] },
  { n: 8,  name: 'Time Machine',          difficulty: 'harder',  stars: 8,  sec: 99,  mood: 'dark',    bpm: 138, modes: [['cube', 3], ['ship', 1.2], ['cube', 3], ['ship', 1], ['cube', 1.5]] },
  { n: 9,  name: 'Cycles',                difficulty: 'harder',  stars: 9,  sec: 82,  mood: 'house',   bpm: 140, modes: [['cube', 2.2], ['ball', 1.6], ['ship', 1.2], ['cube', 1.8], ['ball', 1.4]] },
  { n: 10, name: 'xStep',                 difficulty: 'insane',  stars: 10, sec: 84,  mood: 'funky',   bpm: 142, modes: [['cube', 2], ['ball', 1.2], ['ship', 1], ['cube', 1.4], ['ship', 1], ['cube', 1], ['ball', 1], ['ship', 0.9]] },
  { n: 11, name: 'Clutterfunk',           difficulty: 'insane',  stars: 11, sec: 99,  mood: 'funky',   bpm: 145, modes: [['cube', 2.2], ['ship', 1.2], ['ball', 1.1], ['cube', 1.6], ['ship', 1]], mini: true },
  { n: 12, name: 'Theory of Everything',  difficulty: 'insane',  stars: 12, sec: 86,  mood: 'intense', bpm: 146, modes: [['cube', 1.8], ['ship', 1], ['cube', 1.2], ['ufo', 1.2], ['ball', 1], ['ship', 1], ['ufo', 1]], mini: true },
  { n: 13, name: 'Electroman Adventures', difficulty: 'insane',  stars: 10, sec: 88,  mood: 'upbeat',  bpm: 148, modes: [['cube', 1.6], ['ufo', 1], ['ship', 1], ['ball', 1], ['ufo', 0.9], ['cube', 1.2]], mini: true },
  { n: 14, name: 'Clubstep',              difficulty: 'demon-easy', stars: 14, sec: 90, mood: 'dark',  bpm: 150, modes: [['cube', 1.4], ['ship', 1.1], ['cube', 1], ['ball', 1], ['ufo', 1], ['ship', 1], ['cube', 1], ['ship', 0.9]], mini: true, coinGate: 10 },
  { n: 15, name: 'Electrodynamix',        difficulty: 'insane',  stars: 12, sec: 84,  mood: 'intense', bpm: 152, modes: [['cube', 1.3], ['ship', 1], ['ball', 1], ['ufo', 1], ['cube', 1], ['ball', 0.9], ['ship', 1]], speeds: true },
  { n: 16, name: 'Hexagon Force',         difficulty: 'insane',  stars: 12, sec: 92,  mood: 'house',   bpm: 150, modes: [['cube', 1.6], ['ship', 1.1], ['ball', 1.1], ['cube', 1.2], ['ufo', 1], ['ball', 1], ['ship', 1]], speeds: true, mini: true },
  { n: 17, name: 'Blast Processing',      difficulty: 'harder',  stars: 10, sec: 102, mood: 'upbeat',  bpm: 148, modes: [['cube', 1.4], ['wave', 1.4], ['ship', 0.8], ['ball', 0.8], ['wave', 1.4], ['cube', 0.9], ['ufo', 0.9], ['ship', 0.6], ['cube', 1.3]] },
  { n: 18, name: 'Theory of Everything 2', difficulty: 'demon-easy', stars: 14, sec: 92, mood: 'dark',  bpm: 152, modes: [['cube', 1.3], ['wave', 1], ['ball', 1], ['ufo', 1], ['ship', 1], ['wave', 0.9], ['cube', 1]], speeds: true, mini: true, coinGate: 20 },
  { n: 19, name: 'Geometrical Dominator', difficulty: 'harder',  stars: 10, sec: 100, mood: 'upbeat',  bpm: 150, modes: [['cube', 1.4], ['robot', 1.4], ['ship', 1], ['wave', 1], ['cube', 1], ['robot', 1], ['ufo', 0.9], ['ball', 0.9]], speeds: true },
  { n: 20, name: 'Deadlocked',            difficulty: 'demon-medium', stars: 15, sec: 99, mood: 'intense', bpm: 155, modes: [['cube', 1.2], ['wave', 1], ['cube', 1], ['ship', 1], ['ball', 1], ['robot', 1], ['ufo', 1], ['wave', 0.9], ['robot', 0.8]], speeds: true, mini: true, coinGate: 30 },
  { n: 21, name: 'Fingerdash',            difficulty: 'insane',  stars: 12, sec: 85,  mood: 'funky',   bpm: 152, modes: [['cube', 2.6], ['spider', 1], ['ship', 0.9], ['robot', 1], ['wave', 1], ['spider', 0.8], ['ufo', 0.5], ['cube', 0.9]], speeds: true },
  { n: 22, name: 'Dash',                  difficulty: 'insane',  stars: 12, sec: 96,  mood: 'house',   bpm: 154, modes: [['cube', 1.4], ['ship', 1], ['ball', 1], ['robot', 1], ['wave', 1], ['spider', 1]], speeds: true, mini: true },
];

const MAIN_BG_THEMES = [
  [215, 250, 290, 200], [200, 230, 260, 190], [260, 300, 220, 320], [30, 200, 260, 210],
  [280, 320, 210, 250], [190, 220, 320, 260], [340, 280, 220, 300], [260, 210, 180, 310],
];

const _levelCache = {};

function getMainLevel(n) {
  const id = 'main-' + n;
  if (_levelCache[id]) return _levelCache[id];
  const cfg = MAIN_LEVELS.find(m => m.n === n);
  if (!cfg) return null;
  const level = generateLevel({
    id,
    name: cfg.name,
    author: 'RobTop',
    difficulty: cfg.difficulty,
    stars: cfg.stars,
    lengthSec: cfg.sec || 80,
    modeSeq: cfg.modes.map(([mode, frac]) => ({ mode, frac })),
    seed: 'main-' + n + '-v1',
    speeds: !!cfg.speeds,
    mini: !!cfg.mini,
    features: cfg.features,
    bgTheme: MAIN_BG_THEMES[n % MAIN_BG_THEMES.length],
    song: makeSong('main-' + n, cfg.mood, cfg.bpm, cfg.name + ' (tribute mix)', 'SynthBot'),
  });
  level.coinGate = cfg.coinGate || 0;
  _levelCache[id] = level;
  return level;
}

// ================= ONLINE LEVEL DATABASE =================
const ONLINE_NAMES = [
  'Cosmic Rush', 'Neon Nights', 'Skyline Sprint', 'Pixel Panic', 'Turbo Temple', 'Frost Realm',
  'Magma Core', 'Star Sprint', 'Cyber Circuit', 'Gravity Falls', 'Echo Chamber', 'Prism Break',
  'Shadow Runner', 'Solar Flare', 'Midnight Dash', 'Crystal Caverns', 'Volt Storm', 'Retro Rocket',
  'Hyper Drive', 'Lunar Leap', 'Toxic Tunnel', 'Aurora Sky', 'Blaze Trail', 'Quantum Quake',
  'Dune Drifter', 'Iron Will', 'Nova Pulse', 'Mystic Maze', 'Rapid Fire', 'Zero Gravity',
  'Steel Storm', 'Jungle Jam', 'Arctic Ace', 'Phantom Force', 'Bass Cannon', 'Wired',
  'Overdrive', 'Sub Zero', 'Firewall', 'Dreamscape', 'Static Shock', 'Deep Space',
];
const ONLINE_AUTHORS = [
  'Zephyr', 'DashMaster99', 'PixelPro', 'NeonNinja', 'GDWizard', 'StormRider', 'CubeLord',
  'WaveKing', 'OrbitFox', 'TurboSnail', 'MiniMight', 'GlitchCat', 'RoboRex', 'SkyBlaze',
];

function makeOnlineDB() {
  const rng = makeRNG(hashSeed('online-db-v1'));
  const diffPool = ['easy', 'easy', 'normal', 'normal', 'hard', 'hard', 'harder', 'harder',
    'insane', 'insane', 'demon-easy', 'demon-medium'];
  const moods = ['upbeat', 'house', 'funky', 'dark', 'intense', 'chill'];
  const db = [];
  for (let i = 0; i < ONLINE_NAMES.length; i++) {
    const difficulty = diffPool[i % diffPool.length];
    const author = ONLINE_AUTHORS[i % ONLINE_AUTHORS.length];
    db.push({
      id: 'online-' + (i + 1),
      name: ONLINE_NAMES[i],
      author,
      difficulty,
      stars: diffById(difficulty).stars,
      downloads: 1200 + Math.floor(rng.next() * 980000),
      likes: 100 + Math.floor(rng.next() * 84000),
      lengthSec: 26 + rng.int(0, 34),
      mood: moods[i % moods.length],
      bpm: 122 + rng.int(0, 48),
    });
  }
  return db;
}

const ONLINE_DB = makeOnlineDB();

function getOnlineLevel(id) {
  if (_levelCache[id]) return _levelCache[id];
  const meta = ONLINE_DB.find(l => l.id === id);
  if (!meta) return null;
  const d = DIFF_GEN[meta.difficulty];
  const rng = makeRNG(hashSeed(id));
  const modes = [{ mode: 'cube', frac: 2 }];
  const extraPool = d >= 7 ? ['ship', 'ball', 'ufo', 'wave', 'robot', 'spider']
    : d >= 4 ? ['ship', 'ball', 'ufo', 'robot'] : ['ship', 'ball'];
  const nExtra = d >= 6 ? 2 : 1;
  for (let i = 0; i < nExtra; i++) {
    modes.push({ mode: extraPool[rng.int(0, extraPool.length - 1)], frac: 1 });
    if (rng.chance(0.6)) modes.push({ mode: 'cube', frac: 1 });
  }
  const level = generateLevel({
    id,
    name: meta.name,
    author: meta.author,
    difficulty: meta.difficulty,
    stars: meta.stars,
    lengthSec: meta.lengthSec,
    modeSeq: modes,
    seed: id + '-v1',
    speeds: d >= 4,
    mini: d >= 6,
    bgTheme: [rng.int(0, 360), rng.int(0, 360), rng.int(0, 360)],
    song: makeSong(id, meta.mood, meta.bpm, meta.name + ' Theme', ONLINE_AUTHORS[(hashSeed(id) >>> 3) % ONLINE_AUTHORS.length] + 'Music'),
  });
  _levelCache[id] = level;
  return level;
}

// ================= GAUNTLETS =================
const GAUNTLETS = [
  { id: 'fire',   name: 'Fire Gauntlet',   icon: '🔥', color: '#c8401a', reward: 250, hues: [15, 35, 0],    diffs: ['hard', 'harder', 'harder'] },
  { id: 'ice',    name: 'Ice Gauntlet',    icon: '❄️', color: '#2a7fd4', reward: 200, hues: [200, 220, 185], diffs: ['normal', 'hard', 'hard'] },
  { id: 'shadow', name: 'Shadow Gauntlet', icon: '🌑', color: '#3a2a5e', reward: 300, hues: [265, 285, 240], diffs: ['harder', 'harder', 'insane'] },
  { id: 'lava',   name: 'Lava Gauntlet',   icon: '🌋', color: '#a02808', reward: 350, hues: [8, 25, 350],   diffs: ['harder', 'insane', 'insane'] },
  { id: 'chaos',  name: 'Chaos Gauntlet',  icon: '⚡', color: '#7a1090', reward: 500, hues: [300, 320, 275], diffs: ['insane', 'demon-easy', 'demon-medium'] },
];
const GAUNTLET_LEVEL_NAMES = {
  fire: ['Ember Alley', 'Flame Dancer', 'Inferno Peak'],
  ice: ['Frostbite', 'Glacier Glide', 'Blizzard Run'],
  shadow: ['Dusk Walker', 'Night Terror', 'Void Whisper'],
  lava: ['Magma Flow', 'Molten Path', 'Core Meltdown'],
  chaos: ['Static Storm', 'Pandemonium', 'Entropy'],
};

function getGauntletLevel(gid, i) {
  const id = 'g-' + gid + '-' + i;
  if (_levelCache[id]) return _levelCache[id];
  const g = GAUNTLETS.find(x => x.id === gid);
  if (!g) return null;
  const difficulty = g.diffs[i];
  const d = DIFF_GEN[difficulty];
  const rng = makeRNG(hashSeed(id));
  const pool = d >= 7 ? ['ship', 'ball', 'ufo', 'wave', 'robot', 'spider'] : ['ship', 'ball', 'ufo', 'robot'];
  const modes = [{ mode: 'cube', frac: 2 }, { mode: pool[rng.int(0, pool.length - 1)], frac: 1 }, { mode: 'cube', frac: 1 }];
  if (d >= 6) modes.push({ mode: pool[rng.int(0, pool.length - 1)], frac: 1 });
  const level = generateLevel({
    id,
    name: GAUNTLET_LEVEL_NAMES[gid][i],
    author: 'The Keeper',
    difficulty,
    lengthSec: 32 + i * 8 + d,
    modeSeq: modes,
    seed: id + '-v1',
    speeds: d >= 4,
    mini: d >= 6,
    bgTheme: g.hues,
    song: makeSong(id, d >= 7 ? 'intense' : 'dark', 128 + Math.round(d * 4), GAUNTLET_LEVEL_NAMES[gid][i] + ' Theme', 'The Keeper'),
  });
  _levelCache[id] = level;
  return level;
}

// unified fetch
function getLevelById(id) {
  if (_levelCache[id]) return _levelCache[id];
  if (id.startsWith('main-')) return getMainLevel(parseInt(id.slice(5), 10));
  if (id.startsWith('online-')) return getOnlineLevel(id);
  if (id.startsWith('g-')) {
    const parts = id.split('-');
    return getGauntletLevel(parts[1], parseInt(parts[2], 10));
  }
  return null;
}

if (typeof module !== 'undefined') {
  module.exports = {
    generateLevel, solveLevel, makeSong, GenMath,
    MAIN_LEVELS, getMainLevel, ONLINE_DB, getOnlineLevel,
    GAUNTLETS, GAUNTLET_LEVEL_NAMES, getGauntletLevel, getLevelById,
  };
}
