// Core constants. World units: 1 block = 1 unit (rendered at 30px * zoom).
// Physics values are decompile-accurate GD 2.2 numbers converted to blocks
// (source values in game-units/s ÷ 30). Physics runs at 240Hz substeps like real GD.
'use strict';

const UNIT = 30;              // px per block at zoom 1
const PHYS_DT = 1 / 240;      // physics substep (s)
const GROUND_Y = 0;           // floor line (top surface of the ground)

// horizontal speeds in blocks/s — index: 0=0.5x, 1=1x, 2=2x, 3=3x, 4=4x
const SPEEDS = [8.372, 10.386, 12.914, 15.6, 19.2];

// cube gravity & jump velocity vary slightly per speed portal (real GD behavior)
const GRAV_CUBE = [91.387, 93.137, 93.040, 93.429, 93.429];  // blocks/s²
const JUMP_CUBE = [19.116, 20.124, 20.556, 20.214, 20.214];  // blocks/s

const PHYS = {
  cube: {
    gravity: 93.137,       // 1x reference; per-speed via GRAV_CUBE
    jumpVel: 20.124,
    maxFall: 27.0,         // terminal velocity (cube/ball/robot/spider)
    rotSpeed: 415.4,       // deg/s airborne spin
  },
  ship: {
    // asymmetric thrust (blocks/s²): depends on hold state AND current direction
    holdFall: 46.568,      // holding while moving down
    holdRise: 37.255,      // holding while moving up
    relRise: 44.706,       // released while moving up
    relFall: 29.804,       // released while moving down
    maxUp: 14.4,
    maxDown: 11.52,
    miniCapMult: 1 / 0.85, // mini fly caps are ÷0.85
  },
  ball: {
    gravity: 55.882,
    maxFall: 27.0,
    clickPop: 6.037,       // small pop toward the new floor on flip
    rotSpeed: 600,         // deg/s at 1x, scales with speed
  },
  ufo: {
    gravFall: 37.255,      // falling gravity
    gravRise: 55.882,      // rising decays faster
    tap: 12.6,             // sets vy (never slows an existing boost)
    maxUp: 14.4,
    maxDown: 11.52,
  },
  wave: {
    slope: 1.0,            // dy/dx (45°)
    miniSlope: 2.0,        // mini wave 2:1
  },
  robot: {
    initVel: 10.062,       // 0.5 × jump; while held, gravity is CANCELLED
    maxHold: 0.278,
    gravity: 83.823,       // 0.9 × cube, resumes after release/timeout
    maxFall: 27.0,
  },
  spider: {
    gravity: 55.882,       // ball's multiplier while falling between surfaces
    maxFall: 27.0,
  },
  mini: {
    size: 0.6,             // hitbox/visual scale
    jump: 0.8,             // jump/orb/pad multiplier
  },
};

// orb strengths (blocks/s). flip:true = gravity flips first; value is the FINAL
// velocity applied afterward (sign: + = away from gravity, − = into the fall).
const ORB_VEL = {
  yellow: { v: 20.124 },
  pink:   { v: 14.489 },
  red:    { v: 27.771 },
  green:  { v: 20.124, flip: true },
  blue:   { v: -8.05,  flip: true },
  black:  { v: -27.0 },
};
// mode multipliers on orb results
const ORB_MODE_MULT = { ball: 0.7, spider: 0.7 };

// pad strengths (blocks/s)
const PAD_VEL = {
  yellow: { v: 28.8 },
  pink:   { v: 18.72 },
  red:    { v: 36.0 },
  blue:   { v: -11.52, flip: true },
};
const PAD_MODE_MULT = { ball: 0.6, spider: 0.6 };

// player hitboxes (blocks):
//  - outer box: vs hazards, orbs, pads, portals, ground/ceiling, landing
//  - inner box: vs solid blocks for crash death (GD forgiveness system)
const PLAYER_SIZE = 1.0;
const PLAYER_INNER = 0.3;
const LAND_SNAP = 0.333;       // may snap-land if feet within this above a surface
const LAND_SNAP_SHIP = 0.2;
const WAVE_SIZE = 1.0;         // wave uses same outer box (visual is smaller)
const FLIP_VEL_MULT = 0.5;     // every gravity flip halves vy (portals, ball click)

const GAME_MODES = ['cube', 'ship', 'ball', 'ufo', 'wave', 'robot', 'spider'];
const FLY_MODES = { ship: true, ufo: true, wave: true };
const CEILING_MODES = { ship: true, wave: true, ball: true, spider: true, ufo: true };

// difficulty registry (order used by search filters). orbs = full-completion award.
const DIFFS = [
  { id: 'easy',    name: 'Easy',         stars: 2,  orbs: 50,  color: '#37c3ff', face: '😊' },
  { id: 'normal',  name: 'Normal',       stars: 3,  orbs: 75,  color: '#68e838', face: '🙂' },
  { id: 'hard',    name: 'Hard',         stars: 4,  orbs: 125, color: '#ffd51e', face: '😐' },
  { id: 'harder',  name: 'Harder',       stars: 6,  orbs: 225, color: '#ff8038', face: '😠' },
  { id: 'insane',  name: 'Insane',       stars: 8,  orbs: 350, color: '#ff5ea8', face: '😡' },
  { id: 'demon-easy',   name: 'Easy Demon',   stars: 10, orbs: 500, color: '#c81010', face: '👿' },
  { id: 'demon-medium', name: 'Medium Demon', stars: 10, orbs: 500, color: '#8a0808', face: '😈' },
];
function diffById(id) { return DIFFS.find(d => d.id === id) || DIFFS[0]; }

// map difficulty id → generator difficulty scalar 1..10
const DIFF_GEN = {
  easy: 1.5, normal: 3, hard: 4.5, harder: 6, insane: 7.5,
  'demon-easy': 8.5, 'demon-medium': 9.5,
};

const DEFAULT_BG = '#287dff';
const DEFAULT_GROUND = '#1a4fb0';

if (typeof module !== 'undefined') {
  module.exports = {
    UNIT, PHYS_DT, GROUND_Y, SPEEDS, GRAV_CUBE, JUMP_CUBE, PHYS,
    ORB_VEL, ORB_MODE_MULT, PAD_VEL, PAD_MODE_MULT,
    PLAYER_SIZE, PLAYER_INNER, LAND_SNAP, LAND_SNAP_SHIP, WAVE_SIZE, FLIP_VEL_MULT,
    GAME_MODES, FLY_MODES, CEILING_MODES,
    DIFFS, diffById, DIFF_GEN, DEFAULT_BG, DEFAULT_GROUND,
  };
}
