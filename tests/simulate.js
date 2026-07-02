// Headless verification: the solver bot must beat EVERY built-in level.
// Usage: node tests/simulate.js [--verbose]
'use strict';

const path = require('path');
const root = path.join(__dirname, '..', 'js');
const { MAIN_LEVELS, getMainLevel, ONLINE_DB, getOnlineLevel, GAUNTLETS, getGauntletLevel, solveLevel } =
  require(path.join(root, 'levelgen.js'));

const verbose = process.argv.includes('--verbose');
let pass = 0, fail = 0;
const failures = [];

function check(label, level) {
  if (!level) { fail++; failures.push({ label, reason: 'level is null' }); return; }
  const r = solveLevel(level);
  if (r.won) {
    pass++;
    if (verbose) console.log(`PASS  ${label}  (${r.percent}% in ${r.time.toFixed(1)}s, ${level.objects.length} objs)`);
  } else {
    fail++;
    failures.push({ label, reason: `died/stalled at ${r.percent}% (x=${r.x.toFixed(1)}/${level.length.toFixed(0)})` });
  }
}

console.log('=== main levels ===');
for (const m of MAIN_LEVELS) check(`main-${m.n} ${m.name}`, getMainLevel(m.n));

console.log('=== online levels ===');
for (const meta of ONLINE_DB) check(`${meta.id} ${meta.name} [${meta.difficulty}]`, getOnlineLevel(meta.id));

console.log('=== gauntlet levels ===');
for (const g of GAUNTLETS) for (let i = 0; i < 3; i++) check(`g-${g.id}-${i}`, getGauntletLevel(g.id, i));

console.log(`\n${pass} passed, ${fail} failed`);
for (const f of failures) console.log(`FAIL  ${f.label}: ${f.reason}`);
process.exit(fail ? 1 : 0);
