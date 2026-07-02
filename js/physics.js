// Pure physics core: all 7 game modes, gravity flips, mini forms, speeds,
// solid/hazard collision, orbs/pads/portals/speed/triggers/coins.
// Faithful GD model: outer box for hazards/landing, inner box (0.3) for wall crashes,
// per-speed cube gravity/jump, asymmetric ship thrust, gravity flips halve vy.
// No DOM access — also runs headless in Node for level verification.
'use strict';

if (typeof require !== 'undefined' && typeof window === 'undefined') {
  // Node (test harness): expose deps as globals without redeclaring browser consts
  Object.assign(globalThis, require('./constants.js'), require('./objects.js'));
}

// ---------- run state ----------
function createRun(level, opts = {}) {
  const objects = level.objects.slice().sort((a, b) => a.x - b.x);
  return {
    level,
    objects,
    scanStart: 0,
    player: {
      x: -8, y: GROUND_Y + 0.5, vy: 0,
      mode: level.mode0 || 'cube',
      speedIdx: level.speed0 != null ? level.speed0 : 1,
      gravDir: 1,           // 1 = falls down, -1 = falls up
      mini: false,
      onGround: true,
      rotation: 0,
      holdTime: 0, thrusting: false,
      dead: false, won: false,
    },
    used: new Set(),        // one-shot object indices (orbs, pads, portals)
    coinsGot: new Set(),
    firedTriggers: new Set(),
    fx: [],                 // render/sfx events for the game layer
    time: 0,
    ceilH: level.ceilH || 12,
    deathX: null,
  };
}

function playerHalf(p) {
  return (PLAYER_SIZE * (p.mini ? PHYS.mini.size : 1)) / 2;
}
function playerInnerHalf(p) {
  return (PLAYER_INNER * (p.mini ? PHYS.mini.size : 1)) / 2;
}

function snapshotRun(run) {
  return {
    player: Object.assign({}, run.player),
    used: new Set(run.used),
    coinsGot: new Set(run.coinsGot),
    firedTriggers: new Set(run.firedTriggers),
    time: run.time,
    scanStart: run.scanStart,
  };
}
function restoreRun(run, snap) {
  run.player = Object.assign({}, snap.player);
  run.used = new Set(snap.used);
  run.coinsGot = new Set(snap.coinsGot);
  run.firedTriggers = new Set(snap.firedTriggers);
  run.time = snap.time;
  run.scanStart = snap.scanStart;
  run.fx.length = 0;
}

// ---------- helpers ----------
function overlapAABB(px, py, phw, phh, hb) {
  return Math.abs(px - hb.x) < phw + hb.w / 2 && Math.abs(py - hb.y) < phh + hb.h / 2;
}
function overlapCircle(px, py, phw, phh, hb) {
  const dx = Math.max(Math.abs(px - hb.x) - phw, 0);
  const dy = Math.max(Math.abs(py - hb.y) - phh, 0);
  return dx * dx + dy * dy < hb.r * hb.r;
}
function overlaps(px, py, phw, phh, hb) {
  return hb.circle ? overlapCircle(px, py, phw, phh, hb) : overlapAABB(px, py, phw, phh, hb);
}

// window of objects near x (objects sorted by x; window ±8 blocks)
function nearObjects(run, x, out) {
  out.length = 0;
  const objs = run.objects;
  while (run.scanStart < objs.length && objs[run.scanStart].x < x - 9) run.scanStart++;
  for (let i = run.scanStart; i < objs.length; i++) {
    const o = objs[i];
    if (o.x > x + 9) break;
    out.push(i);
  }
  return out;
}

const _near = [];

function flipGravity(p) {
  p.gravDir *= -1;
  p.vy *= FLIP_VEL_MULT;
}

// ---------- the substep ----------
// input: { held: bool, pressT: number (run.time of last unconsumed press, or -1) }
function stepRun(run, input, dt) {
  const p = run.player;
  if (p.dead || p.won) return;

  const level = run.level;
  const speed = SPEEDS[p.speedIdx];
  const half = playerHalf(p);
  const prevY = p.y;
  const miniJ = p.mini ? PHYS.mini.jump : 1;
  const flyCap = p.mini ? PHYS.ship.miniCapMult : 1;
  const pressBuffered = input.pressT >= 0 && (run.time - input.pressT) <= 0.12;

  // ----- horizontal -----
  p.x += speed * dt;

  // ----- vertical / mode behavior -----
  const g = p.gravDir;
  switch (p.mode) {
    case 'cube': {
      const grav = GRAV_CUBE[p.speedIdx], jv = JUMP_CUBE[p.speedIdx];
      if ((input.held || pressBuffered) && p.onGround) {
        p.vy = jv * miniJ * g;
        p.onGround = false;
        if (pressBuffered) input.pressT = -1;
        run.fx.push({ type: 'jump' });
      }
      p.vy -= grav * dt * g;
      clampFall(p, PHYS.cube.maxFall);
      if (!p.onGround) p.rotation += PHYS.cube.rotSpeed * dt * g;
      break;
    }
    case 'robot': {
      if ((input.held || pressBuffered) && p.onGround && !p.thrusting) {
        p.vy = PHYS.robot.initVel * miniJ * g;
        p.onGround = false;
        p.thrusting = true; p.holdTime = 0;
        if (pressBuffered) input.pressT = -1;
        run.fx.push({ type: 'jump' });
      }
      if (p.thrusting && input.held && p.holdTime < PHYS.robot.maxHold) {
        p.holdTime += dt;    // gravity cancelled: constant rise
      } else {
        p.thrusting = false;
        p.vy -= PHYS.robot.gravity * dt * g;
      }
      clampFall(p, PHYS.robot.maxFall);
      break;
    }
    case 'ship': {
      const risingg = p.vy * g > 0;
      let a;
      if (input.held) a = risingg ? PHYS.ship.holdRise : PHYS.ship.holdFall;
      else a = -(risingg ? PHYS.ship.relRise : PHYS.ship.relFall);
      p.vy += a * dt * g;
      const up = PHYS.ship.maxUp * flyCap, dn = PHYS.ship.maxDown * flyCap;
      if (g === 1) p.vy = Math.max(-dn, Math.min(up, p.vy));
      else p.vy = Math.max(-up, Math.min(dn, p.vy));
      p.rotation = -Math.atan2(p.vy * 0.35, speed) * 57.3;
      break;
    }
    case 'ball': {
      if (pressBuffered && p.onGround) {
        flipGravity(p);
        p.vy = -PHYS.ball.clickPop * p.gravDir; // small pop toward the new floor
        p.onGround = false;
        input.pressT = -1;
        run.fx.push({ type: 'flip' });
      }
      p.vy -= PHYS.ball.gravity * dt * p.gravDir;
      clampFall(p, PHYS.ball.maxFall);
      p.rotation += PHYS.ball.rotSpeed * (speed / SPEEDS[1]) * dt;
      break;
    }
    case 'ufo': {
      if (pressBuffered) {
        const tap = PHYS.ufo.tap * miniJ;
        if (p.vy * g < tap) p.vy = tap * g;  // never slows an existing boost
        p.onGround = false;
        input.pressT = -1;
        run.fx.push({ type: 'ufoHop' });
      }
      const grav = p.vy * g > 0 ? PHYS.ufo.gravRise : PHYS.ufo.gravFall;
      p.vy -= grav * dt * g;
      const up = PHYS.ufo.maxUp * flyCap, dn = PHYS.ufo.maxDown * flyCap;
      if (g === 1) p.vy = Math.max(-dn, Math.min(up, p.vy));
      else p.vy = Math.max(-up, Math.min(dn, p.vy));
      break;
    }
    case 'wave': {
      const slope = (p.mini ? PHYS.wave.miniSlope : PHYS.wave.slope) * speed;
      p.vy = (input.held ? slope : -slope) * g;
      p.rotation = Math.atan2(p.vy, speed) * 57.3 * -1;
      break;
    }
    case 'spider': {
      if (pressBuffered && p.onGround) {
        input.pressT = -1;
        spiderTeleport(run, half);
      }
      p.vy -= PHYS.spider.gravity * dt * p.gravDir;
      clampFall(p, PHYS.spider.maxFall);
      break;
    }
  }

  p.y += p.vy * dt;

  // assume airborne unless a surface says otherwise this substep
  const wasOnGround = p.onGround;
  p.onGround = false;

  // ----- global floor & ceiling -----
  if (p.y - half <= GROUND_Y) {
    p.y = GROUND_Y + half;
    if (p.gravDir === 1) land(p);
    else if (p.vy < 0) p.vy = 0;
  }
  const ceilY = run.ceilH;
  if ((CEILING_MODES[p.mode] || p.gravDir === -1) && p.y + half >= ceilY) {
    p.y = ceilY - half;
    if (p.gravDir === -1) land(p);
    else if (p.vy > 0) p.vy = 0;
  }
  if (!CEILING_MODES[p.mode] && p.gravDir === 1 && p.y + half > run.ceilH + 14) {
    p.y = run.ceilH + 14 - half;
    if (p.vy > 0) p.vy = 0;
  }

  // ----- object collisions -----
  nearObjects(run, p.x, _near);
  const innerHalf = playerInnerHalf(p);
  const snap = (p.mode === 'ship' || p.mode === 'wave' || p.mode === 'ufo') ? LAND_SNAP_SHIP : LAND_SNAP;
  const ride = CEILING_MODES[p.mode]; // modes that slide along both surfaces

  for (const idx of _near) {
    const o = run.objects[idx];
    const def = OBJ_DEFS[o.t];
    if (!def || def.deco) continue;
    const hb = objHitbox(o);
    if (!hb) continue;

    // --- solids ---
    if (def.solid) {
      if (!overlapAABB(p.x, p.y, half, half, hb)) continue;
      const top = hb.y + hb.h / 2, bot = hb.y - hb.h / 2;
      const wasAbove = prevY - half >= top - snap;
      const wasBelow = prevY + half <= bot + snap;

      if (def.oneWay) {
        if (p.gravDir === 1 && wasAbove && p.vy <= 0) { p.y = top + half; land(p); }
        else if (p.gravDir === -1 && wasBelow && p.vy >= 0) { p.y = bot - half; land(p); }
        continue;
      }

      if (wasAbove && p.vy <= 0) {
        // touching the top surface
        p.y = top + half;
        if (p.gravDir === 1) land(p);
        else if (ride) p.vy = 0;                       // flipped riders slide
        else { die(run); return; }                     // flipped cube/robot head bump
      } else if (wasBelow && p.vy >= 0) {
        // touching the bottom surface
        p.y = bot - half;
        if (p.gravDir === -1) land(p);
        else if (ride) p.vy = 0;
        else { die(run); return; }                     // cube/robot head bump
      } else {
        // frontal: only lethal once the INNER box overlaps (GD forgiveness)
        if (overlapAABB(p.x, p.y, innerHalf, innerHalf, hb)) { die(run); return; }
      }
      continue;
    }

    // --- hazards (outer box vs small hazard hitboxes) ---
    if (def.hazard) {
      if (overlaps(p.x, p.y, half * 0.9, half * 0.9, hb)) { die(run); return; }
      continue;
    }

    // --- interactives ---
    if (!def.act) continue;
    if (!overlaps(p.x, p.y, half, half, hb)) continue;

    switch (def.act) {
      case 'orb':
        if (!run.used.has(idx) && (pressBuffered || input.held) && !run.heldUsed) {
          if (pressBuffered) input.pressT = -1;
          else run.heldUsed = true;  // a continuous hold only fires one orb per press-cycle
          applyOrb(run, def.orb, miniJ);
          run.used.add(idx);
          run.fx.push({ type: 'orb', x: o.x, y: o.y, orb: def.orb });
        }
        break;
      case 'pad':
        if (!run.used.has(idx)) {
          applyPad(run, def.pad, miniJ);
          run.used.add(idx);
          run.fx.push({ type: 'pad', x: o.x, y: o.y, pad: def.pad });
        }
        break;
      case 'portal':
        if (!run.used.has(idx)) {
          applyPortal(run, def.portal);
          run.used.add(idx);
          run.fx.push({ type: 'portal', x: o.x, y: o.y, portal: def.portal });
        }
        break;
      case 'speed':
        if (!run.used.has(idx)) {
          p.speedIdx = def.speed;
          run.used.add(idx);
          run.fx.push({ type: 'speed', x: o.x, y: o.y });
        }
        break;
      case 'trigger':
        if (!run.firedTriggers.has(idx)) {
          run.firedTriggers.add(idx);
          run.fx.push({
            type: 'trigger', trigger: def.trigger,
            color: o.color || (def.defaults && def.defaults.color),
            dur: o.dur || (def.defaults && def.defaults.dur) || 1.5,
          });
        }
        break;
      case 'coin':
        if (!run.coinsGot.has(idx)) {
          run.coinsGot.add(idx);
          run.fx.push({ type: 'coin', x: o.x, y: o.y, idx });
        }
        break;
    }
  }

  if (!input.held) run.heldUsed = false;

  // landing rotation snap for cube/robot
  if (p.onGround && (p.mode === 'cube' || p.mode === 'robot')) {
    p.rotation = Math.round(p.rotation / 90) * 90;
  }
  if (p.onGround && !input.held) p.thrusting = false;

  // ----- win -----
  if (p.x >= level.length) {
    p.won = true;
    run.fx.push({ type: 'win' });
  }

  run.time += dt;
}

function clampFall(p, maxFall) {
  if (p.gravDir === 1) { if (p.vy < -maxFall) p.vy = -maxFall; }
  else { if (p.vy > maxFall) p.vy = maxFall; }
}

function land(p) {
  p.vy = 0;
  p.onGround = true;
  p.thrusting = false;
}

function die(run) {
  const p = run.player;
  p.dead = true;
  run.deathX = p.x;
  run.fx.push({ type: 'death', x: p.x, y: p.y });
}

function applyOrb(run, orb, miniJ) {
  const p = run.player;
  const spec = ORB_VEL[orb];
  if (spec.flip) flipGravity(p);
  const mult = (ORB_MODE_MULT[p.mode] || 1) * miniJ;
  p.vy = spec.v * mult * p.gravDir;
  p.onGround = false;
  p.thrusting = false;
}

function applyPad(run, pad, miniJ) {
  const p = run.player;
  const spec = PAD_VEL[pad];
  if (spec.flip) flipGravity(p);
  const mult = (PAD_MODE_MULT[p.mode] || 1) * miniJ;
  p.vy = spec.v * mult * p.gravDir;
  p.onGround = false;
  p.thrusting = false;
}

function applyPortal(run, portal) {
  const p = run.player;
  switch (portal) {
    case 'gravUp': if (p.gravDir !== -1) flipGravity(p); break;
    case 'gravDown': if (p.gravDir !== 1) flipGravity(p); break;
    case 'mini': p.mini = true; break;
    case 'big': p.mini = false; break;
    default:
      if (GAME_MODES.includes(portal)) {
        p.mode = portal;
        p.thrusting = false;
        p.rotation = 0;
        p.vy *= 0.5;   // mode-change portals halve vy (real GD)
      }
  }
}

function spiderTeleport(run, half) {
  const p = run.player;
  const dir = p.gravDir; // stuck on gravity side; jump to the opposite surface
  let targetY;
  nearObjects(run, p.x, _near);
  if (dir === 1) {
    targetY = run.ceilH - half;
    for (const idx of _near) {
      const o = run.objects[idx];
      const def = OBJ_DEFS[o.t];
      if (!def || !def.solid || def.oneWay) continue;
      const hb = objHitbox(o);
      if (Math.abs(p.x - hb.x) > hb.w / 2 + half * 0.8) continue;
      const bot = hb.y - hb.h / 2;
      if (bot >= p.y && bot - half < targetY) targetY = bot - half;
    }
  } else {
    targetY = GROUND_Y + half;
    for (const idx of _near) {
      const o = run.objects[idx];
      const def = OBJ_DEFS[o.t];
      if (!def || !def.solid || def.oneWay) continue;
      const hb = objHitbox(o);
      if (Math.abs(p.x - hb.x) > hb.w / 2 + half * 0.8) continue;
      const top = hb.y + hb.h / 2;
      if (top <= p.y && top + half > targetY) targetY = top + half;
    }
  }
  run.fx.push({ type: 'spiderTp', x: p.x, y0: p.y, y1: targetY });
  p.y = targetY;
  p.gravDir *= -1;
  p.vy = 0;
  land(p);
}

// ---------- headless simulation (plan replay) ----------
function simulatePlan(level, plan, maxTime = 300) {
  const run = createRun(level);
  const input = { held: false, pressT: -1 };
  let pi = 0;
  const maxSteps = Math.ceil(maxTime / PHYS_DT);
  for (let i = 0; i < maxSteps; i++) {
    while (pi < plan.length && run.player.x >= plan[pi].x) {
      if (plan[pi].a === 'p') { input.held = true; input.pressT = run.time; }
      else input.held = false;
      pi++;
    }
    stepRun(run, input, PHYS_DT);
    run.fx.length = 0;
    if (run.player.dead || run.player.won) break;
  }
  return {
    won: run.player.won,
    dead: run.player.dead,
    x: run.player.x,
    percent: Math.max(0, Math.min(100, run.player.x / level.length * 100)),
    time: run.time,
    coins: run.coinsGot.size,
  };
}

if (typeof module !== 'undefined') {
  module.exports = { createRun, stepRun, simulatePlan, snapshotRun, restoreRun, playerHalf };
}
