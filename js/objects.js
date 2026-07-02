// Object registry: every placeable object with hitbox data + canvas draw function.
// World space: 1 unit = 1 block (30px at zoom 1). +y is UP. Object (x,y) is the CELL CENTER.
// Draw functions run with origin at object center, +y up (renderer pre-flips the axis),
// in a space where 1 block = 1.0 — they draw within roughly [-0.5, 0.5].
'use strict';

const OBJ_CATS = ['blocks', 'spikes', 'pads', 'orbs', 'portals', 'speed', 'triggers', 'special', 'deco'];

// ---------- shared drawing helpers ----------
const D = {
  rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },
  blockBase(ctx, w, h, fill, edge) {
    ctx.fillStyle = fill;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = edge;
    ctx.strokeRect(-w / 2 + 0.03, -h / 2 + 0.03, w - 0.06, h - 0.06);
  },
  spikeTri(ctx, w, h, yBase) {
    ctx.beginPath();
    ctx.moveTo(-w / 2, yBase);
    ctx.lineTo(w / 2, yBase);
    ctx.lineTo(0, yBase + h);
    ctx.closePath();
  },
  portalFrame(ctx, color, inner) {
    // 1 wide × 2.8 tall swirl portal
    ctx.lineWidth = 0.16;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.42, 1.35, 0, 0, Math.PI * 2);
    ctx.stroke();
    const g = ctx.createRadialGradient(0, 0, 0.05, 0, 0, 1.3);
    g.addColorStop(0, inner);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.34, 1.24, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  orbBase(ctx, color, glow, time) {
    const pulse = 1 + 0.08 * Math.sin((time || 0) * 6);
    const g = ctx.createRadialGradient(0, 0, 0.02, 0, 0, 0.5 * pulse);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 0.5 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 0.07;
    ctx.strokeStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, 0.3, 0, Math.PI * 2); ctx.stroke();
  },
  padBase(ctx, color) {
    // sits on the floor of its cell
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, -0.42, 0.46, 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath();
    ctx.ellipse(0, -0.44, 0.3, 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  arrowUp(ctx, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-s, y); ctx.lineTo(s, y); ctx.lineTo(0, y + s * 1.6);
    ctx.closePath(); ctx.fill();
  },
};

// hb: hitbox {w,h,ox,oy} in units relative to center. solid=landable AABB. hazard=kill.
// act: 'orb'|'pad'|'portal'|'speed'|'trigger'|'coin' → game applies effect.
const OBJ_DEFS = {
  // ================= BLOCKS =================
  block: {
    cat: 'blocks', solid: true, hb: { w: 1, h: 1 },
    draw(ctx) {
      D.blockBase(ctx, 1, 1, '#0e1620', '#9adcff');
      ctx.strokeStyle = 'rgba(154,220,255,.35)';
      ctx.lineWidth = 0.03;
      ctx.strokeRect(-0.36, -0.36, 0.72, 0.72);
    },
  },
  block_grid: {
    cat: 'blocks', solid: true, hb: { w: 1, h: 1 },
    draw(ctx) {
      D.blockBase(ctx, 1, 1, '#101a26', '#8fb7d8');
      ctx.strokeStyle = 'rgba(143,183,216,.3)';
      ctx.lineWidth = 0.025;
      ctx.beginPath();
      ctx.moveTo(0, -0.47); ctx.lineTo(0, 0.47);
      ctx.moveTo(-0.47, 0); ctx.lineTo(0.47, 0);
      ctx.stroke();
    },
  },
  block_brick: {
    cat: 'blocks', solid: true, hb: { w: 1, h: 1 },
    draw(ctx) {
      D.blockBase(ctx, 1, 1, '#1a1210', '#d8a06a');
      ctx.strokeStyle = 'rgba(216,160,106,.4)';
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.moveTo(-0.47, 0); ctx.lineTo(0.47, 0);
      ctx.moveTo(0, 0); ctx.lineTo(0, 0.47);
      ctx.moveTo(-0.24, -0.47); ctx.lineTo(-0.24, 0);
      ctx.moveTo(0.24, -0.47); ctx.lineTo(0.24, 0);
      ctx.stroke();
    },
  },
  block_dark: {
    cat: 'blocks', solid: true, hb: { w: 1, h: 1 },
    draw(ctx) {
      D.blockBase(ctx, 1, 1, '#05070c', '#3c4f66');
    },
  },
  block_girder: {
    cat: 'blocks', solid: true, hb: { w: 1, h: 1 },
    draw(ctx) {
      D.blockBase(ctx, 1, 1, '#141c14', '#9be58a');
      ctx.strokeStyle = 'rgba(155,229,138,.4)';
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(-0.42, -0.42); ctx.lineTo(0.42, 0.42);
      ctx.moveTo(-0.42, 0.42); ctx.lineTo(0.42, -0.42);
      ctx.stroke();
    },
  },
  block_half: { // occupies BOTTOM half of its cell (floor at cell mid-line)
    cat: 'blocks', solid: true, hb: { w: 1, h: 0.5, oy: -0.25 },
    draw(ctx) {
      ctx.save(); ctx.translate(0, -0.25);
      D.blockBase(ctx, 1, 0.5, '#0e1620', '#9adcff');
      ctx.restore();
    },
  },
  block_platform: { // thin one-way platform on top edge of cell region (bottom half)
    cat: 'blocks', solid: true, oneWay: true, hb: { w: 1, h: 0.24, oy: -0.38 },
    draw(ctx) {
      ctx.save(); ctx.translate(0, -0.38);
      D.blockBase(ctx, 1, 0.24, '#161028', '#c49aff');
      ctx.restore();
    },
  },

  // ================= SPIKES / HAZARDS =================
  spike: {
    cat: 'spikes', hazard: true, hb: { w: 0.2, h: 0.4 }, // real GD id-8 hitbox: 6×12 units

    draw(ctx) {
      D.spikeTri(ctx, 0.92, 0.95, -0.48);
      ctx.fillStyle = '#0e1620'; ctx.fill();
      ctx.lineWidth = 0.06; ctx.strokeStyle = '#cfeaff'; ctx.stroke();
    },
  },
  spike_small: {
    cat: 'spikes', hazard: true, hb: { w: 0.2, h: 0.19, oy: -0.28 }, // short spike id-39: 6×5.6

    draw(ctx) {
      D.spikeTri(ctx, 0.9, 0.5, -0.48);
      ctx.fillStyle = '#0e1620'; ctx.fill();
      ctx.lineWidth = 0.055; ctx.strokeStyle = '#cfeaff'; ctx.stroke();
    },
  },
  spikes_triple_small: { // 3 tiny floor spikes in one cell (tiny spike hitboxes)
    cat: 'spikes', hazard: true, hb: { w: 0.85, h: 0.16, oy: -0.4 },
    draw(ctx) {
      ctx.fillStyle = '#0e1620';
      ctx.lineWidth = 0.045; ctx.strokeStyle = '#cfeaff';
      for (let i = -1; i <= 1; i++) {
        ctx.save(); ctx.translate(i * 0.31, 0);
        D.spikeTri(ctx, 0.3, 0.34, -0.48);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    },
  },
  sawblade: {
    cat: 'spikes', hazard: true, hb: { r: 0.44 }, // saws use circles ≈ 0.85× visual

    draw(ctx, o, time) {
      ctx.save();
      ctx.rotate((time || 0) * 3.2);
      ctx.fillStyle = '#20242c';
      ctx.beginPath(); ctx.arc(0, 0, 0.36, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#aeb6c4';
      for (let i = 0; i < 8; i++) {
        ctx.save(); ctx.rotate(i * Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(0.3, -0.1); ctx.lineTo(0.52, 0.02); ctx.lineTo(0.3, 0.12);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = '#dfe6f0'; ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.arc(0, 0, 0.36, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#dfe6f0';
      ctx.beginPath(); ctx.arc(0, 0, 0.09, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },
  },
  sawblade_big: {
    cat: 'spikes', hazard: true, hb: { r: 0.79 },
    draw(ctx, o, time) {
      ctx.save(); ctx.scale(1.8, 1.8);
      OBJ_DEFS.sawblade.draw(ctx, o, time);
      ctx.restore();
    },
  },
  spikeball: {
    cat: 'spikes', hazard: true, hb: { r: 0.4 },
    draw(ctx, o, time) {
      ctx.save();
      ctx.rotate((time || 0) * 1.4);
      ctx.fillStyle = '#0e1620';
      ctx.strokeStyle = '#cfeaff'; ctx.lineWidth = 0.05;
      for (let i = 0; i < 8; i++) {
        ctx.save(); ctx.rotate(i * Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(-0.12, 0.2); ctx.lineTo(0.12, 0.2); ctx.lineTo(0, 0.52);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, 0.3, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    },
  },

  // ================= PADS (auto-activate) =================
  pad_yellow: { cat: 'pads', act: 'pad', pad: 'yellow', hb: { w: 0.83, h: 0.14, oy: -0.43 }, draw(ctx) { D.padBase(ctx, '#ffd51e'); } },
  pad_pink:   { cat: 'pads', act: 'pad', pad: 'pink',   hb: { w: 0.83, h: 0.17, oy: -0.42 }, draw(ctx) { D.padBase(ctx, '#ff6ee0'); } },
  pad_red:    { cat: 'pads', act: 'pad', pad: 'red',    hb: { w: 0.97, h: 0.23, oy: -0.38 }, draw(ctx) { D.padBase(ctx, '#ff4038'); } },
  pad_blue:   { cat: 'pads', act: 'pad', pad: 'blue',   hb: { w: 0.83, h: 0.14, oy: -0.43 }, draw(ctx) { D.padBase(ctx, '#37c3ff'); } },

  // ================= ORBS (click to activate) =================
  orb_yellow: { cat: 'orbs', act: 'orb', orb: 'yellow', hb: { r: 0.6 }, draw(ctx, o, t) { D.orbBase(ctx, '#ffd51e', '#fff3a0', t); } },
  orb_pink:   { cat: 'orbs', act: 'orb', orb: 'pink',   hb: { r: 0.6 }, draw(ctx, o, t) { D.orbBase(ctx, '#ff6ee0', '#ffc4f2', t); } },
  orb_red:    { cat: 'orbs', act: 'orb', orb: 'red',    hb: { r: 0.6 }, draw(ctx, o, t) { D.orbBase(ctx, '#ff4038', '#ffb0ac', t); } },
  orb_blue:   { cat: 'orbs', act: 'orb', orb: 'blue',   hb: { r: 0.6 }, draw(ctx, o, t) { D.orbBase(ctx, '#37c3ff', '#c2ecff', t); } },
  orb_green:  { cat: 'orbs', act: 'orb', orb: 'green',  hb: { r: 0.6 }, draw(ctx, o, t) { D.orbBase(ctx, '#68e838', '#d0ffc0', t); } },
  orb_black:  {
    cat: 'orbs', act: 'orb', orb: 'black', hb: { r: 0.6 },
    draw(ctx, o, t) {
      D.orbBase(ctx, '#22252d', '#8892a4', t);
      ctx.fillStyle = '#8892a4';
      ctx.beginPath(); ctx.arc(0, 0, 0.12, 0, Math.PI * 2); ctx.fill();
    },
  },

  // ================= PORTALS =================
  portal_gravity_up:   { cat: 'portals', act: 'portal', portal: 'gravUp',   hb: { w: 0.83, h: 2.5 }, draw(ctx) { D.portalFrame(ctx, '#ffd51e', 'rgba(255,213,30,.5)'); D.arrowUp(ctx, 0.1, 0.18, '#fff3a0'); } },
  portal_gravity_down: { cat: 'portals', act: 'portal', portal: 'gravDown', hb: { w: 0.83, h: 2.5 }, draw(ctx) { D.portalFrame(ctx, '#37c3ff', 'rgba(55,195,255,.5)'); ctx.save(); ctx.scale(1, -1); D.arrowUp(ctx, 0.1, 0.18, '#c2ecff'); ctx.restore(); } },
  portal_cube:   { cat: 'portals', act: 'portal', portal: 'cube',   hb: { w: 1.13, h: 2.87 }, draw(ctx) { D.portalFrame(ctx, '#68e838', 'rgba(104,232,56,.5)'); } },
  portal_ship:   { cat: 'portals', act: 'portal', portal: 'ship',   hb: { w: 1.13, h: 2.87 }, draw(ctx) { D.portalFrame(ctx, '#ff6ee0', 'rgba(255,110,224,.5)'); } },
  portal_ball:   { cat: 'portals', act: 'portal', portal: 'ball',   hb: { w: 1.13, h: 2.87 }, draw(ctx) { D.portalFrame(ctx, '#ff8038', 'rgba(255,128,56,.5)'); } },
  portal_ufo:    { cat: 'portals', act: 'portal', portal: 'ufo',    hb: { w: 0.9, h: 2.7 }, draw(ctx) { D.portalFrame(ctx, '#ffd51e', 'rgba(255,213,30,.45)'); ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(0, 0, 0.14, 0, Math.PI * 2); ctx.fill(); } },
  portal_wave:   { cat: 'portals', act: 'portal', portal: 'wave',   hb: { w: 1.13, h: 2.87 }, draw(ctx) { D.portalFrame(ctx, '#37e3e3', 'rgba(55,227,227,.5)'); } },
  portal_robot:  { cat: 'portals', act: 'portal', portal: 'robot',  hb: { w: 1.13, h: 2.87 }, draw(ctx) { D.portalFrame(ctx, '#e8e8e8', 'rgba(232,232,232,.5)'); } },
  portal_spider: { cat: 'portals', act: 'portal', portal: 'spider', hb: { w: 1.13, h: 2.87 }, draw(ctx) { D.portalFrame(ctx, '#b44eff', 'rgba(180,78,255,.5)'); } },
  portal_mini:   { cat: 'portals', act: 'portal', portal: 'mini',   hb: { w: 1.13, h: 2.87 }, draw(ctx) { D.portalFrame(ctx, '#ff5ea8', 'rgba(255,94,168,.5)'); ctx.strokeStyle = '#ffd0e8'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.arc(0, 0, 0.12, 0, Math.PI * 2); ctx.stroke(); } },
  portal_big:    { cat: 'portals', act: 'portal', portal: 'big',    hb: { w: 0.9, h: 2.7 }, draw(ctx) { D.portalFrame(ctx, '#68e880', 'rgba(104,232,128,.5)'); ctx.strokeStyle = '#d0ffd8'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.arc(0, 0, 0.22, 0, Math.PI * 2); ctx.stroke(); } },

  // ================= SPEED CHANGERS =================
  speed_05: { cat: 'speed', act: 'speed', speed: 0, hb: { w: 1.3, h: 1.0 }, draw(ctx) { drawSpeedArrows(ctx, 1, '#ffb13d'); } },
  speed_1:  { cat: 'speed', act: 'speed', speed: 1, hb: { w: 1.3, h: 1.0 }, draw(ctx) { drawSpeedArrows(ctx, 1, '#37c3ff'); } },
  speed_2:  { cat: 'speed', act: 'speed', speed: 2, hb: { w: 1.3, h: 1.0 }, draw(ctx) { drawSpeedArrows(ctx, 2, '#68e838'); } },
  speed_3:  { cat: 'speed', act: 'speed', speed: 3, hb: { w: 1.3, h: 1.0 }, draw(ctx) { drawSpeedArrows(ctx, 3, '#ff5ea8'); } },
  speed_4:  { cat: 'speed', act: 'speed', speed: 4, hb: { w: 1.3, h: 1.0 }, draw(ctx) { drawSpeedArrows(ctx, 4, '#ff4038'); } },

  // ================= TRIGGERS (invisible in play) =================
  trigger_bg: {
    cat: 'triggers', act: 'trigger', trigger: 'bg', invisible: true, hb: { w: 0.4, h: 30, oy: 0 },
    defaults: { color: '#287dff', dur: 1.5 },
    draw(ctx, o) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = (o && o.color) || '#287dff';
      ctx.beginPath(); ctx.arc(0, 0, 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.05; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '0.32px Arial'; ctx.textAlign = 'center';
      ctx.save(); ctx.scale(1, -1); ctx.fillText('BG', 0, 0.11); ctx.restore();
      ctx.globalAlpha = 1;
    },
  },
  trigger_ground: {
    cat: 'triggers', act: 'trigger', trigger: 'ground', invisible: true, hb: { w: 0.4, h: 30, oy: 0 },
    defaults: { color: '#1c53b0', dur: 1.5 },
    draw(ctx, o) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = (o && o.color) || '#1c53b0';
      ctx.beginPath(); ctx.arc(0, 0, 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd51e'; ctx.lineWidth = 0.05; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '0.32px Arial'; ctx.textAlign = 'center';
      ctx.save(); ctx.scale(1, -1); ctx.fillText('G', 0, 0.11); ctx.restore();
      ctx.globalAlpha = 1;
    },
  },

  // ================= SPECIAL =================
  coin: {
    cat: 'special', act: 'coin', hb: { r: 0.4 },
    draw(ctx, o, t) {
      const wob = Math.sin((t || 0) * 3) * 0.05;
      ctx.save(); ctx.translate(0, wob);
      const g = ctx.createRadialGradient(-0.08, 0.1, 0.04, 0, 0, 0.42);
      g.addColorStop(0, '#fff8d0'); g.addColorStop(0.6, '#ffd51e'); g.addColorStop(1, '#a87b00');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7a5200'; ctx.lineWidth = 0.05; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 0.04;
      ctx.beginPath(); ctx.arc(0, 0, 0.26, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    },
  },

  // ================= DECO (no collision) =================
  deco_chain: {
    cat: 'deco', deco: true, hb: { w: 0.2, h: 1 },
    draw(ctx) {
      ctx.strokeStyle = 'rgba(200,220,255,.5)'; ctx.lineWidth = 0.05;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0.33 - i * 0.33, 0.08, 0.15, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
  },
  deco_spikes: { // harmless decorative ground spikes
    cat: 'deco', deco: true, hb: { w: 1, h: 0.3 },
    draw(ctx) {
      ctx.fillStyle = 'rgba(20,30,44,.9)';
      ctx.strokeStyle = 'rgba(154,220,255,.35)'; ctx.lineWidth = 0.03;
      for (let i = -1; i <= 1; i++) {
        ctx.save(); ctx.translate(i * 0.31, 0);
        D.spikeTri(ctx, 0.3, 0.26, -0.48);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    },
  },
  deco_arrow: {
    cat: 'deco', deco: true, hb: { w: 1, h: 1 },
    draw(ctx) {
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 0.09;
      ctx.beginPath();
      ctx.moveTo(-0.3, 0); ctx.lineTo(0.3, 0);
      ctx.moveTo(0.08, 0.2); ctx.lineTo(0.32, 0); ctx.lineTo(0.08, -0.2);
      ctx.stroke();
    },
  },
};

function drawSpeedArrows(ctx, count, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(255,255,255,.8)';
  ctx.lineWidth = 0.04;
  const start = -(count - 1) * 0.17;
  for (let i = 0; i < count; i++) {
    const x = start + i * 0.34;
    ctx.beginPath();
    ctx.moveTo(x - 0.22, 0.3); ctx.lineTo(x + 0.16, 0); ctx.lineTo(x - 0.22, -0.3);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // base plate
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.fillRect(-0.55, -0.48, 1.1, 0.09);
}

// editor palette grouping (order matters for tabs)
const PALETTE = {
  blocks:  ['block', 'block_grid', 'block_brick', 'block_dark', 'block_girder', 'block_half', 'block_platform'],
  spikes:  ['spike', 'spike_small', 'spikes_triple_small', 'sawblade', 'sawblade_big', 'spikeball'],
  pads:    ['pad_yellow', 'pad_pink', 'pad_red', 'pad_blue'],
  orbs:    ['orb_yellow', 'orb_pink', 'orb_red', 'orb_blue', 'orb_green', 'orb_black'],
  portals: ['portal_gravity_up', 'portal_gravity_down', 'portal_cube', 'portal_ship', 'portal_ball',
            'portal_ufo', 'portal_wave', 'portal_robot', 'portal_spider', 'portal_mini', 'portal_big'],
  speed:   ['speed_05', 'speed_1', 'speed_2', 'speed_3', 'speed_4'],
  triggers: ['trigger_bg', 'trigger_ground'],
  special: ['coin'],
  deco:    ['deco_chain', 'deco_spikes', 'deco_arrow'],
};

// Effective hitbox of a placed object instance (applies rotation in 90° steps for w/h boxes)
function objHitbox(o) {
  const def = OBJ_DEFS[o.t];
  if (!def || !def.hb) return null;
  const hb = def.hb;
  if (hb.r != null) return { circle: true, x: o.x, y: o.y, r: hb.r };
  let w = hb.w, h = hb.h;
  let ox = hb.ox || 0, oy = hb.oy || 0;
  const rot = ((o.r || 0) % 360 + 360) % 360;
  if (rot === 90 || rot === 270) { [w, h] = [h, w]; }
  if (rot === 90) { [ox, oy] = [oy, -ox]; }
  else if (rot === 180) { ox = -ox; oy = -oy; }
  else if (rot === 270) { [ox, oy] = [-oy, ox]; }
  return { circle: false, x: o.x + ox, y: o.y + oy, w, h };
}

if (typeof module !== 'undefined') module.exports = { OBJ_DEFS, PALETTE, OBJ_CATS, objHitbox, drawSpeedArrows, D };
