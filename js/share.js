// Community level sharing: encode a level to a compact shareable code (and back).
// A level is just data, so this lets players trade their OWN creations freely.
'use strict';

const Share = {
  MAGIC: 'GDLV1:',

  // doc: {name, difficulty, author, objects:[{t,x,y,r?,fx?,color?,dur?}]}
  encode(doc) {
    const compact = {
      n: (doc.name || 'Untitled').slice(0, 40),
      d: doc.difficulty || 'normal',
      a: (doc.author || (typeof Save !== 'undefined' ? Save.data.username : 'Anon')).slice(0, 20),
      o: (doc.objects || []).map(o => {
        const e = [o.t, round2(o.x), round2(o.y)];
        if (o.r) e.push('r', o.r);
        if (o.fx) e.push('f', 1);
        if (o.color) e.push('c', o.color);
        if (o.dur) e.push('u', o.dur);
        return e;
      }),
    };
    const json = JSON.stringify(compact);
    return this.MAGIC + b64EncodeUnicode(json);
  },

  decode(str) {
    str = (str || '').trim();
    // tolerate a full URL with ?lvl=CODE
    const m = str.match(/[?&]lvl=([^&\s]+)/);
    if (m) str = decodeURIComponent(m[1]);
    if (!str.startsWith(this.MAGIC)) throw new Error('That is not a valid level code.');
    let c;
    try {
      c = JSON.parse(b64DecodeUnicode(str.slice(this.MAGIC.length)));
    } catch (e) {
      throw new Error('Level code is corrupted or incomplete.');
    }
    if (!c || !Array.isArray(c.o)) throw new Error('Level code has no objects.');
    const objects = c.o.map(e => {
      const o = { t: e[0], x: e[1], y: e[2] };
      for (let i = 3; i < e.length; i += 2) {
        const k = e[i], v = e[i + 1];
        if (k === 'r') o.r = v;
        else if (k === 'f') o.fx = true;
        else if (k === 'c') o.color = v;
        else if (k === 'u') o.dur = v;
      }
      return o;
    }).filter(o => o.t && typeof o.x === 'number' && typeof o.y === 'number' && OBJ_DEFS[o.t]);
    return { name: c.n || 'Imported Level', difficulty: c.d || 'normal', author: c.a || 'Anon', objects };
  },

  shareUrl(doc) {
    const base = (typeof location !== 'undefined') ? location.origin + location.pathname : '';
    return base + '?lvl=' + encodeURIComponent(this.encode(doc));
  },
};

function round2(v) { return Math.round(v * 100) / 100; }

// UTF-8 safe base64 (handles any level name)
function b64EncodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode('0x' + p1)));
}
function b64DecodeUnicode(str) {
  return decodeURIComponent(Array.prototype.map.call(atob(str), c =>
    '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
}

if (typeof module !== 'undefined') module.exports = { Share };
