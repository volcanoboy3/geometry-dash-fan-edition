// Debug tracer: replays the solver on one level and prints what killed the bot.
// Usage: node tests/debug.js <levelId>
'use strict';
const path = require('path');
const root = path.join(__dirname, '..', 'js');
const { PHYS_DT } = require(path.join(root, 'constants.js'));
const { OBJ_DEFS, objHitbox } = require(path.join(root, 'objects.js'));
const { createRun, stepRun } = require(path.join(root, 'physics.js'));
const { getLevelById } = require(path.join(root, 'levelgen.js'));

const id = process.argv[2] || 'main-1';
const level = getLevelById(id);
if (!level) { console.log('no level', id); process.exit(1); }

console.log(`level ${id}: len=${level.length.toFixed(1)}, objs=${level.objects.length}, presses=${level.bot.presses.length}, guide=${level.bot.guide.length}`);

const run = createRun(level);
const input = { held: false, pressT: -1 };
const presses = level.bot.presses, guide = level.bot.guide;
let pi = 0, releaseX = -1, ufoCd = 0;

function guideYAt(x) {
  if (!guide.length) return 4;
  if (x <= guide[0].x) return guide[0].y;
  for (let i = 1; i < guide.length; i++) {
    if (x <= guide[i].x) {
      const a = guide[i - 1], b = guide[i];
      return a.y + (b.y - a.y) * ((x - a.x) / Math.max(0.0001, b.x - a.x));
    }
  }
  return guide[guide.length - 1].y;
}

const trail = [];
let wasFly = false;
for (let i = 0; i < 240 * 400; i++) {
  const p = run.player;
  const fly = p.mode === 'ship' || p.mode === 'wave' || p.mode === 'ufo';
  if (wasFly && !fly) { input.held = false; input.pressT = -1; releaseX = -1; }
  wasFly = fly;
  if (!fly) {
    while (pi < presses.length && p.x >= presses[pi].x) {
      input.held = true; input.pressT = run.time; releaseX = presses[pi].holdX; pi++;
    }
    if (input.held && releaseX >= 0 && p.x >= releaseX) { input.held = false; releaseX = -1; }
  } else {
    while (pi < presses.length && p.x >= presses[pi].x) pi++;
    const { SPEEDS } = require(path.join(root, 'constants.js'));
    const gy = guideYAt(p.x + SPEEDS[p.speedIdx] * 0.22);
    if (p.mode === 'ufo') {
      ufoCd -= PHYS_DT; input.held = false;
      if (p.y < gy - 0.9 && p.vy * p.gravDir < 2 && ufoCd <= 0) { input.pressT = run.time; ufoCd = 0.14; }
    } else if (p.mode === 'wave') {
      if (p.y < gy - 0.15) input.held = true;
      else if (p.y > gy + 0.15) input.held = false;
    } else {
      input.held = (p.y - gy) + p.vy * 0.3 < 0;
    }
  }
  trail.push({ x: p.x, y: p.y, vy: p.vy, mode: p.mode, held: input.held, og: p.onGround });
  if (trail.length > 400) trail.shift();
  stepRun(run, input, PHYS_DT);
  run.fx.length = 0;
  if (p.dead || p.won) break;
}

const p = run.player;
console.log(p.won ? 'WON' : p.dead ? `DIED at x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} mode=${p.mode} grav=${p.gravDir}` : `STALLED at x=${p.x.toFixed(2)}`);

// nearby objects
console.log('\nnearby objects:');
for (const o of run.objects) {
  if (o.x > p.x - 16 && o.x < p.x + 6) {
    const hb = objHitbox(o);
    console.log(` ${o.t} @ (${o.x.toFixed(2)}, ${o.y.toFixed(2)})${o.r ? ' r' + o.r : ''} hb=${hb ? (hb.circle ? 'r' + hb.r : `${hb.w}x${hb.h}@${hb.x.toFixed(1)},${hb.y.toFixed(1)}`) : '-'}`);
  }
}
console.log('\npresses near death:');
for (const pr of presses) if (pr.x > p.x - 16 && pr.x < p.x + 6) console.log(` press ${pr.x.toFixed(2)} → ${pr.holdX.toFixed(2)}`);
console.log('\ntrail (last ~0.25s):');
for (let i = Math.max(0, trail.length - 260); i < trail.length; i += 12) {
  const t = trail[i];
  console.log(` x=${t.x.toFixed(2)} y=${t.y.toFixed(2)} vy=${t.vy.toFixed(2)} ${t.mode}${t.og ? ' G' : ''}${t.held ? ' H' : ''}`);
}
