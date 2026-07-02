// Procedural icon rendering: cubes, ships, balls, UFOs, waves, robots, spiders.
// Every icon is drawn into a size×size box centered at (0,0) of the current transform.
'use strict';

const ICON_COLORS = [
  '#7dff00', '#00ff7d', '#00ffff', '#00c8ff', '#0078ff', '#3c3cff',
  '#7d00ff', '#b900ff', '#ff00ff', '#ff0078', '#ff0000', '#ff4b00',
  '#ff9600', '#ffc800', '#ffff00', '#c8ff00', '#ffffff', '#c8c8c8',
  '#787878', '#141414', '#96ffc8', '#ffb4d2',
];

const ICON_COUNTS = { cube: 8, ship: 6, ball: 6, ufo: 5, wave: 5, robot: 4, spider: 4 };

const Icons = {
  // ---- master entry ----
  draw(ctx, mode, design, p, s, size) {
    ctx.save();
    ctx.lineJoin = 'round';
    switch (mode) {
      case 'cube': this.cube(ctx, design, p, s, size); break;
      case 'ship': this.ship(ctx, design, p, s, size); break;
      case 'ball': this.ball(ctx, design, p, s, size); break;
      case 'ufo': this.ufo(ctx, design, p, s, size); break;
      case 'wave': this.wave(ctx, design, p, s, size); break;
      case 'robot': this.robot(ctx, design, p, s, size); break;
      case 'spider': this.spider(ctx, design, p, s, size); break;
      default: this.cube(ctx, 0, p, s, size);
    }
    ctx.restore();
  },

  rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  // ---- CUBE: 8 designs ----
  cube(ctx, d, p, s, size) {
    const h = size / 2, b = size * 0.12; // border thickness
    // outer body
    this.rrect(ctx, -h, -h, size, size, size * 0.14);
    ctx.fillStyle = p; ctx.fill();
    ctx.lineWidth = size * 0.06; ctx.strokeStyle = '#000'; ctx.stroke();
    // inner face plate
    this.rrect(ctx, -h + b, -h + b, size - 2 * b, size - 2 * b, size * 0.09);
    ctx.fillStyle = s; ctx.fill();
    ctx.lineWidth = size * 0.035; ctx.stroke();
    // face variants
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = size * 0.04;
    const eye = (x, y, w, hh) => { ctx.fillRect(x - w / 2, y - hh / 2, w, hh); ctx.strokeRect(x - w / 2, y - hh / 2, w, hh); };
    const ew = size * 0.16, eh = size * 0.22, ey = -size * 0.08, ex = size * 0.17;
    switch (d % ICON_COUNTS.cube) {
      case 0: // classic: two eyes + mouth
        eye(-ex, ey, ew, eh); eye(ex, ey, ew, eh);
        ctx.fillRect(-size * 0.18, size * 0.16, size * 0.36, size * 0.09);
        ctx.strokeRect(-size * 0.18, size * 0.16, size * 0.36, size * 0.09);
        break;
      case 1: // visor
        ctx.fillRect(-size * 0.3, ey - eh / 2, size * 0.6, eh);
        ctx.strokeRect(-size * 0.3, ey - eh / 2, size * 0.6, eh);
        break;
      case 2: // angry slant eyes
        ctx.save(); ctx.translate(-ex, ey); ctx.rotate(0.4); eye(0, 0, ew, eh * 0.8); ctx.restore();
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(-0.4); eye(0, 0, ew, eh * 0.8); ctx.restore();
        ctx.fillRect(-size * 0.14, size * 0.18, size * 0.28, size * 0.08);
        break;
      case 3: // big single eye
        ctx.beginPath(); ctx.arc(0, ey, size * 0.19, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(0, ey, size * 0.08, 0, Math.PI * 2); ctx.fill();
        break;
      case 4: { // cross-brace + dot eyes
        ctx.strokeStyle = p; ctx.lineWidth = size * 0.09;
        ctx.beginPath(); ctx.moveTo(-h + b, 0); ctx.lineTo(h - b, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -h + b); ctx.lineTo(0, h - b); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = size * 0.04;
        eye(-ex, -ex, ew * 0.8, ew * 0.8); eye(ex, -ex, ew * 0.8, ew * 0.8);
        break;
      }
      case 5: // happy closed eyes (arcs)
        ctx.strokeStyle = '#fff'; ctx.lineWidth = size * 0.07;
        ctx.beginPath(); ctx.arc(-ex, ey, size * 0.1, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(ex, ey, size * 0.1, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, size * 0.12, size * 0.14, 0, Math.PI); ctx.stroke();
        break;
      case 6: { // circuit pattern
        ctx.strokeStyle = '#fff'; ctx.lineWidth = size * 0.05;
        ctx.strokeRect(-size * 0.24, -size * 0.24, size * 0.48, size * 0.48);
        ctx.fillStyle = '#fff';
        ctx.fillRect(-size * 0.08, -size * 0.08, size * 0.16, size * 0.16);
        break;
      }
      case 7: // skull-ish
        eye(-ex, ey, ew * 1.1, eh * 1.1); eye(ex, ey, ew * 1.1, eh * 1.1);
        ctx.fillRect(-size * 0.03, size * 0.02, size * 0.06, size * 0.12);
        for (let i = -1; i <= 1; i++) { ctx.fillRect(i * size * 0.11 - size * 0.03, size * 0.2, size * 0.06, size * 0.12); }
        break;
    }
  },

  // ---- SHIP: 6 designs ----
  ship(ctx, d, p, s, size) {
    const w = size * 1.15, hh = size * 0.55;
    ctx.lineWidth = size * 0.05; ctx.strokeStyle = '#000';
    const variant = d % ICON_COUNTS.ship;
    // hull
    ctx.beginPath();
    if (variant % 2 === 0) { // dart
      ctx.moveTo(-w / 2, hh * 0.35);
      ctx.lineTo(-w * 0.28, -hh * 0.45);
      ctx.lineTo(w * 0.42, -hh * 0.2);
      ctx.lineTo(w / 2, hh * 0.1);
      ctx.lineTo(w * 0.3, hh * 0.5);
      ctx.lineTo(-w * 0.3, hh * 0.5);
    } else { // saucer belly
      ctx.moveTo(-w / 2, 0);
      ctx.quadraticCurveTo(-w * 0.2, -hh * 0.9, w * 0.35, -hh * 0.35);
      ctx.quadraticCurveTo(w * 0.55, -hh * 0.05, w * 0.45, hh * 0.25);
      ctx.quadraticCurveTo(0, hh * 0.75, -w * 0.45, hh * 0.35);
    }
    ctx.closePath();
    ctx.fillStyle = p; ctx.fill(); ctx.stroke();
    // cockpit dome
    ctx.beginPath(); ctx.arc(-size * 0.1, -hh * 0.25, size * 0.22, Math.PI, 0);
    ctx.closePath(); ctx.fillStyle = s; ctx.fill(); ctx.stroke();
    // detail stripes per variant
    ctx.fillStyle = s;
    if (variant >= 2) { ctx.fillRect(w * 0.05, -hh * 0.05, w * 0.3, hh * 0.14); ctx.strokeRect(w * 0.05, -hh * 0.05, w * 0.3, hh * 0.14); }
    if (variant >= 4) {
      ctx.beginPath(); ctx.moveTo(-w / 2, hh * 0.35); ctx.lineTo(-w * 0.62, 0); ctx.lineTo(-w / 2, -hh * 0.1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  },

  // ---- BALL: 6 designs ----
  ball(ctx, d, p, s, size) {
    const r = size / 2;
    ctx.lineWidth = size * 0.055; ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
    ctx.fillStyle = p; ctx.fill(); ctx.stroke();
    ctx.fillStyle = s;
    const variant = d % ICON_COUNTS.ball;
    switch (variant) {
      case 0: // inner circle
        ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
      case 1: // quarters
        for (let i = 0; i < 4; i++) {
          ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.arc(0, 0, r * 0.9, i * Math.PI / 2 + 0.14, (i + 0.5) * Math.PI + 0.14 - Math.PI / 2);
          ctx.closePath(); if (i % 2 === 0) ctx.fill();
        }
        ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
        break;
      case 2: // cross
        ctx.fillRect(-r * 0.75, -r * 0.16, r * 1.5, r * 0.32);
        ctx.fillRect(-r * 0.16, -r * 0.75, r * 0.32, r * 1.5);
        ctx.strokeRect(-r * 0.16, -r * 0.75, r * 0.32, r * 1.5);
        break;
      case 3: { // star
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const rr = i % 2 === 0 ? r * 0.65 : r * 0.28;
          const a = i * Math.PI / 5 - Math.PI / 2;
          ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      }
      case 4: // ring
        ctx.lineWidth = size * 0.12; ctx.strokeStyle = s;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = size * 0.055; ctx.strokeStyle = '#000';
        break;
      case 5: // three dots
        for (let i = 0; i < 3; i++) {
          const a = i * Math.PI * 2 / 3 - Math.PI / 2;
          ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.2, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }
        break;
    }
  },

  // ---- UFO: 5 designs ----
  ufo(ctx, d, p, s, size) {
    const w = size * 1.1, hh = size * 0.62;
    ctx.lineWidth = size * 0.05; ctx.strokeStyle = '#000';
    const variant = d % ICON_COUNTS.ufo;
    // dome
    ctx.beginPath(); ctx.arc(0, -hh * 0.12, size * 0.3, Math.PI, 0); ctx.closePath();
    ctx.fillStyle = s; ctx.fill(); ctx.stroke();
    // saucer
    ctx.beginPath();
    ctx.ellipse(0, hh * 0.08, w / 2, hh * 0.34, 0, 0, Math.PI * 2);
    ctx.fillStyle = p; ctx.fill(); ctx.stroke();
    // bottom variants
    ctx.fillStyle = s;
    if (variant >= 1) {
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.arc(i * w * 0.26, hh * 0.26, size * 0.07, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    if (variant >= 3) {
      ctx.beginPath(); ctx.moveTo(-w * 0.14, hh * 0.36); ctx.lineTo(w * 0.14, hh * 0.36); ctx.lineTo(0, hh * 0.62);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  },

  // ---- WAVE: 5 designs (arrow/dart) ----
  wave(ctx, d, p, s, size) {
    const w = size, hh = size * 0.72;
    ctx.lineWidth = size * 0.06; ctx.strokeStyle = '#000';
    const variant = d % ICON_COUNTS.wave;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(-w / 2, -hh / 2);
    ctx.lineTo(variant >= 2 ? -w * 0.15 : -w * 0.3, 0);
    ctx.lineTo(-w / 2, hh / 2);
    ctx.closePath();
    ctx.fillStyle = p; ctx.fill(); ctx.stroke();
    if (variant >= 1) {
      ctx.beginPath();
      ctx.moveTo(w * 0.22, 0); ctx.lineTo(-w * 0.22, -hh * 0.22);
      ctx.lineTo(-w * 0.1, 0); ctx.lineTo(-w * 0.22, hh * 0.22);
      ctx.closePath(); ctx.fillStyle = s; ctx.fill(); ctx.stroke();
    }
    if (variant >= 4) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(w * 0.18, 0, size * 0.07, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  },

  // ---- ROBOT: 4 designs ----
  robot(ctx, d, p, s, size) {
    const variant = d % ICON_COUNTS.robot;
    ctx.lineWidth = size * 0.05; ctx.strokeStyle = '#000';
    // legs
    ctx.strokeStyle = '#000'; ctx.fillStyle = s;
    ctx.fillRect(-size * 0.28, size * 0.1, size * 0.14, size * 0.4);
    ctx.strokeRect(-size * 0.28, size * 0.1, size * 0.14, size * 0.4);
    ctx.fillRect(size * 0.14, size * 0.1, size * 0.14, size * 0.4);
    ctx.strokeRect(size * 0.14, size * 0.1, size * 0.14, size * 0.4);
    // body
    this.rrect(ctx, -size * 0.38, -size * 0.5, size * 0.76, size * 0.66, size * 0.1);
    ctx.fillStyle = p; ctx.fill(); ctx.stroke();
    // eye visor
    ctx.fillStyle = '#fff';
    if (variant === 0 || variant === 2) {
      ctx.fillRect(size * 0.0, -size * 0.38, size * 0.28, size * 0.16);
      ctx.strokeRect(size * 0.0, -size * 0.38, size * 0.28, size * 0.16);
    } else {
      ctx.beginPath(); ctx.arc(size * 0.12, -size * 0.3, size * 0.11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (variant >= 2) { // antenna
      ctx.beginPath(); ctx.moveTo(-size * 0.2, -size * 0.5); ctx.lineTo(-size * 0.2, -size * 0.66); ctx.stroke();
      ctx.beginPath(); ctx.arc(-size * 0.2, -size * 0.7, size * 0.05, 0, Math.PI * 2); ctx.fillStyle = s; ctx.fill(); ctx.stroke();
    }
  },

  // ---- SPIDER: 4 designs ----
  spider(ctx, d, p, s, size) {
    const variant = d % ICON_COUNTS.spider;
    ctx.lineWidth = size * 0.06; ctx.strokeStyle = '#000';
    // legs (angled)
    ctx.strokeStyle = s; ctx.lineWidth = size * 0.08;
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sx * size * 0.15, 0);
      ctx.lineTo(sx * size * 0.42, -size * 0.18);
      ctx.lineTo(sx * size * 0.52, size * 0.42);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx * size * 0.12, size * 0.08);
      ctx.lineTo(sx * size * 0.3, size * 0.16);
      ctx.lineTo(sx * size * 0.34, size * 0.46);
      ctx.stroke();
    }
    // body
    ctx.strokeStyle = '#000'; ctx.lineWidth = size * 0.05;
    this.rrect(ctx, -size * 0.28, -size * 0.3, size * 0.56, size * 0.5, size * 0.12);
    ctx.fillStyle = p; ctx.fill(); ctx.stroke();
    // eyes
    ctx.fillStyle = '#fff';
    if (variant % 2 === 0) {
      ctx.beginPath(); ctx.arc(-size * 0.1, -size * 0.1, size * 0.08, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(size * 0.1, -size * 0.1, size * 0.08, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillRect(-size * 0.18, -size * 0.16, size * 0.36, size * 0.12);
      ctx.strokeRect(-size * 0.18, -size * 0.16, size * 0.36, size * 0.12);
    }
    if (variant >= 2) { // fangs
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(-size * 0.1, size * 0.2); ctx.lineTo(-size * 0.04, size * 0.34); ctx.lineTo(0, size * 0.2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(size * 0.1, size * 0.2); ctx.lineTo(size * 0.04, size * 0.34); ctx.lineTo(0, size * 0.2); ctx.closePath(); ctx.fill();
    }
  },
};

if (typeof module !== 'undefined') module.exports = { Icons, ICON_COLORS, ICON_COUNTS };
