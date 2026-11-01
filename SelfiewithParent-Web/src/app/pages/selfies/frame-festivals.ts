// Festival & event photo frames: each has its own colours, decorations and greeting, for the countries that celebrate it.
// All drawn here (our own designs); the greeting is shown in the visitor's language.

import { Box, Deco, FrameDesign, FramePalette, diya, dot } from './frame-draw';

export interface Festival {
  id: string;
  name: string;
  /** Drawn above the photo, translated ("Happy Diwali"). */
  greeting: string;
  icon: string;
  /** Country codes (as in the site's forms), or 'all'. */
  countries: string[] | 'all';
  palette: FramePalette;
  window: FrameDesign;
  back?: Deco;
  front?: Deco;
}

const GULF = ['AE', 'SA', 'QA', 'KW', 'OM', 'BH'];
const MUSLIM = [...GULF, 'BD', 'MY', 'IN', 'GB', 'NG', 'KE', 'SG', 'LK', 'ZA', 'US', 'CA', 'AU', 'DE', 'FR', 'NL'];
const WESTERN = ['US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'DE', 'FR', 'ES', 'IT', 'NL', 'ZA', 'KE', 'NG'];

/** Repeatable "random" numbers, so a frame looks the same every time. */
function rng(seed: number): () => number {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

// ---------- small shapes ----------

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.25 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, points = 5): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function flower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, petals: number, color: string, centre: string): void {
  ctx.fillStyle = color;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.45, r * 0.25, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = centre;
  dot(ctx, x, y, r * 0.25);
}

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, angle: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.bezierCurveTo(s * 0.8, -s * 0.5, s * 0.6, s * 0.5, 0, s);
  ctx.bezierCurveTo(-s * 0.6, s * 0.5, -s * 0.8, -s * 0.5, 0, -s);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.18)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -s * 0.9); ctx.lineTo(0, s * 1.2); ctx.stroke();
  ctx.restore();
}

function crescent(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, bg: string): void {
  ctx.fillStyle = color;
  dot(ctx, x, y, r);
  ctx.fillStyle = bg;
  dot(ctx, x + r * 0.42, y - r * 0.18, r * 0.86);
}

/** A hanging lantern on a string: Arabic fanous (pointed) or round Chinese lantern. */
function lantern(ctx: CanvasRenderingContext2D, x: number, top: number, len: number, s: number, kind: 'fanous' | 'round' | 'star', body: string, trim: string): void {
  ctx.strokeStyle = trim;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + len); ctx.stroke();
  const y = top + len + s;
  const glow = ctx.createRadialGradient(x, y, 2, x, y, s * 2.2);
  glow.addColorStop(0, 'rgba(255,225,140,.55)');
  glow.addColorStop(1, 'rgba(255,225,140,0)');
  ctx.fillStyle = glow;
  dot(ctx, x, y, s * 2.2);
  ctx.fillStyle = body;
  if (kind === 'round') {
    ctx.beginPath(); ctx.ellipse(x, y, s * 1.1, s * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = trim;
    ctx.fillRect(x - s * 0.5, y - s * 1.0, s, s * 0.18);
    ctx.fillRect(x - s * 0.5, y + s * 0.82, s, s * 0.18);
    ctx.strokeStyle = trim; ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.ellipse(x, y, s * 0.45 * Math.abs(i) + 2, s * 0.88, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x, y + s); ctx.lineTo(x, y + s * 1.8); ctx.lineWidth = 5; ctx.stroke();   // tassel
  } else if (kind === 'star') {
    star(ctx, x, y, s * 1.3, 8);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    star(ctx, x, y, s * 0.6, 8);
  } else {
    ctx.beginPath();
    ctx.moveTo(x, y - s * 1.4);
    ctx.lineTo(x + s * 0.7, y - s * 0.5); ctx.lineTo(x + s * 0.7, y + s * 0.7); ctx.lineTo(x, y + s * 1.3);
    ctx.lineTo(x - s * 0.7, y + s * 0.7); ctx.lineTo(x - s * 0.7, y - s * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = trim; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,190,.85)';
    ctx.beginPath(); ctx.ellipse(x, y + s * 0.1, s * 0.3, s * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function kite(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, angle: number, a: string, b: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = a;
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.75, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.75, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = b;
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.75, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, s);
  for (let i = 1; i <= 6; i++) ctx.lineTo(Math.sin(i) * 12, s + i * 16);
  ctx.stroke();
  ctx.restore();
}

function egg(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, angle: number, body: string, stripe: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.72, s, 0, 0, Math.PI * 2);
  ctx.fillStyle = body; ctx.fill();
  ctx.clip();
  ctx.strokeStyle = stripe; ctx.lineWidth = s * 0.12;
  ctx.beginPath();
  for (let i = -6; i <= 6; i++) ctx.lineTo(i * s * 0.14, (i % 2 ? -1 : 1) * s * 0.12);
  ctx.stroke();
  ctx.fillStyle = stripe;
  for (const yy of [-0.5, 0.5]) for (const xx of [-0.3, 0, 0.3]) dot(ctx, xx * s, yy * s, s * 0.07);
  ctx.restore();
}

function firework(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3);
    ctx.lineTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85);
    ctx.stroke();
    dot(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, 4);
  }
}

function snowflake(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.lineWidth = Math.max(2, r / 8);
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, ex = x + Math.cos(a) * r, ey = y + Math.sin(a) * r;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    const mx = x + Math.cos(a) * r * 0.6, my = y + Math.sin(a) * r * 0.6;
    for (const d of [-0.6, 0.6]) {
      ctx.beginPath(); ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(a + d) * r * 0.3, my + Math.sin(a + d) * r * 0.3); ctx.stroke();
    }
  }
}

/** Scatter `n` shapes over the canvas, away from the greeting, the photo and the text below it. */
function scatter(w: number, h: number, a: Box, n: number, seed: number, draw: (x: number, y: number, r: () => number, i: number) => void): void {
  const r = rng(seed);
  let placed = 0;
  for (let tries = 0; placed < n && tries < n * 30; tries++) {
    const x = r() * w, y = r() * h;
    const inPhoto = x > a.x - 30 && x < a.x + a.w + 30 && y > a.y - 30 && y < a.y + a.h + 60;
    const inGreeting = y < a.y && x > w * 0.12 && x < w * 0.88;
    const inText = y > a.y + a.h + 30;
    if (inPhoto || inGreeting || inText) continue;
    draw(x, y, r, placed++);
  }
}

// ---------- the festivals ----------

const pal = (id: string, bg: [string, string], ink: string, muted: string, accent: string, line: string): FramePalette =>
  ({ id, name: id, bg, ink, muted, accent, line });

export const FESTIVALS: Festival[] = [
  {
    id: 'diwali', name: 'Diwali', greeting: 'Happy Diwali', icon: 'bi-brightness-alt-high', window: 'arch',
    countries: ['IN', 'NP', 'SG', 'MY', 'LK', 'GB', 'US', 'CA', 'AU', 'NZ', 'AE', 'ZA', 'KE'],
    palette: pal('diwali', ['#2a1b5c', '#120a2e'], '#fff3d6', '#e9d9ff', '#f7b733', '#ffe9b0'),
    back: (ctx, w, h, a) => {
      ctx.fillStyle = '#ffd36b';
      scatter(w, h, a, 26, 7, (x, y, r) => { ctx.globalAlpha = 0.35 + r() * 0.5; sparkle(ctx, x, y, 6 + r() * 12); });
      ctx.globalAlpha = 1;
    },
    front: (ctx, _w, _h, a, p) => { diya(ctx, a.x + 30, a.y + a.h + 10, p); diya(ctx, a.x + a.w - 30, a.y + a.h + 10, p); }
  },
  {
    id: 'holi', name: 'Holi', greeting: 'Happy Holi', icon: 'bi-palette', window: 'print', countries: ['IN', 'NP'],
    palette: pal('holi', ['#ffffff', '#fdf3ff'], '#3b1650', '#6e4a80', '#e0218a', '#ffffff'),
    back: (ctx, w, h) => {
      const r = rng(11), colours = ['#ff2e93', '#ffd400', '#00c2ff', '#7cfc00', '#a24bff', '#ff7a00'];
      for (let i = 0; i < 60; i++) {
        const side = i % 3, t = r();
        const x = side === 0 ? t * w : side === 1 ? w - r() * 120 : r() * 120;
        const y = side === 0 ? r() * 120 : t * h * 0.62;
        ctx.globalAlpha = 0.18 + r() * 0.3;
        ctx.fillStyle = colours[i % colours.length];
        dot(ctx, x, y, 20 + r() * 70);
      }
      ctx.globalAlpha = 1;
    }
  },
  {
    id: 'durga', name: 'Durga Puja', greeting: 'Happy Durga Puja', icon: 'bi-flower3', window: 'arch', countries: ['IN', 'BD'],
    palette: pal('durga', ['#fffaf0', '#fff1dc'], '#7a0b0b', '#9c4a3a', '#c8102e', '#ffffff'),
    back: (ctx, w, h, _a, p) => {
      ctx.fillStyle = p.accent;                                 // red-bordered white, like a festive sari
      ctx.fillRect(0, 0, w, 26); ctx.fillRect(0, h - 8, w, 8); ctx.fillRect(0, 0, 26, h); ctx.fillRect(w - 26, 0, 26, h);
      ctx.strokeStyle = '#d4a017'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(38, h - 20); ctx.lineTo(38, 38); ctx.lineTo(w - 38, 38); ctx.lineTo(w - 38, h - 20); ctx.stroke();
      ctx.fillStyle = p.accent;
      for (let y = 70; y < h - 160; y += 40) { dot(ctx, 52, y, 4); dot(ctx, w - 52, y, 4); }
    }
  },
  {
    id: 'onam', name: 'Onam', greeting: 'Happy Onam', icon: 'bi-flower1', window: 'locket', countries: ['IN', 'AE', 'QA', 'KW', 'OM', 'BH', 'SA'],
    palette: pal('onam', ['#fffbea', '#f3f0c8'], '#2f4a12', '#5d6e2a', '#e4572e', '#fffdf0'),
    back: (ctx, w) => {
      for (const [cx, cy] of [[0, 0], [w, 0]]) {                // pookalam (flower carpets) in two corners
        const rings = ['#e4572e', '#ffb400', '#f7e04b', '#8bc34a', '#9c27b0', '#ff7043'];
        rings.forEach((c, i) => {
          const rr = 200 - i * 31;
          ctx.fillStyle = c;
          dot(ctx, cx, cy, rr);
          ctx.fillStyle = 'rgba(255,255,255,.35)';
          for (let k = 0; k < 24; k++) { const t = (k / 24) * Math.PI * 2; dot(ctx, cx + Math.cos(t) * (rr - 20), cy + Math.sin(t) * (rr - 20), 6); }
        });
      }
    }
  },
  {
    id: 'sankranti', name: 'Makar Sankranti', greeting: 'Happy Makar Sankranti', icon: 'bi-diamond', window: 'print', countries: ['IN', 'NP'],
    palette: pal('sankranti', ['#e6f6ff', '#9fd8f5'], '#0e3550', '#2e5f7d', '#ff6b35', '#ffffff'),
    back: (ctx, w, h, a) => {
      const colours: [string, string][] = [['#ff6b35', '#ffd23f'], ['#e63946', '#f1faee'], ['#7b2cbf', '#ffb703'], ['#06d6a0', '#118ab2'], ['#ff006e', '#ffbe0b']];
      scatter(w, h, a, 9, 5, (x, y, r, i) => kite(ctx, x, y, 34 + r() * 22, (r() - 0.5) * 0.8, ...colours[i % colours.length]));
    }
  },
  {
    id: 'rakhi', name: 'Raksha Bandhan', greeting: 'Happy Raksha Bandhan', icon: 'bi-link-45deg', window: 'arch', countries: ['IN', 'NP'],
    palette: pal('rakhi', ['#fff5e6', '#ffd9a8'], '#6b2600', '#8c4a1f', '#d62828', '#fffaf0'),
    front: (ctx, w, _h, a) => {                                 // a rakhi tied across the bottom of the photo
      const y = a.y + a.h + 4;
      ctx.strokeStyle = '#d62828'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(40, y + 6); ctx.quadraticCurveTo(w / 2, y - 20, w - 40, y + 6); ctx.stroke();
      ctx.strokeStyle = '#f4a261'; ctx.lineWidth = 3; ctx.stroke();
      flower(ctx, w / 2, y - 6, 62, 12, '#f7b801', '#d62828');
      flower(ctx, w / 2, y - 6, 30, 8, '#ffffff', '#2a9d8f');
    }
  },
  {
    id: 'eid', name: 'Eid', greeting: 'Eid Mubarak', icon: 'bi-moon-stars', window: 'arch', countries: MUSLIM,
    palette: pal('eid', ['#0c5b45', '#06352a'], '#fff6dc', '#cde8d9', '#e2b34a', '#fff3cf'),
    back: (ctx, w, h, a, p) => {
      crescent(ctx, w - 130, 120, 54, p.accent, p.bg[0]);
      ctx.fillStyle = p.accent;
      scatter(w, h, a, 16, 3, (x, y, r) => { ctx.globalAlpha = 0.4 + r() * 0.5; star(ctx, x, y, 6 + r() * 10); });
      ctx.globalAlpha = 1;
    },
    front: (ctx, _w, _h, a, p) => {
      lantern(ctx, a.x + 20, 0, a.y + 40, 34, 'fanous', p.accent, '#7a5a12');
      lantern(ctx, a.x + a.w - 20, 0, a.y + 110, 28, 'fanous', p.accent, '#7a5a12');
    }
  },
  {
    id: 'ramadan', name: 'Ramadan', greeting: 'Ramadan Kareem', icon: 'bi-moon', window: 'locket', countries: MUSLIM,
    palette: pal('ramadan', ['#14214a', '#070d24'], '#fff6dc', '#c9d2f2', '#f0c35a', '#fff0c9'),
    back: (ctx, w, h, a, p) => {
      crescent(ctx, 130, 130, 60, p.accent, p.bg[0]);
      ctx.fillStyle = '#ffffff';
      scatter(w, h, a, 30, 9, (x, y, r) => { ctx.globalAlpha = 0.25 + r() * 0.6; dot(ctx, x, y, 1.5 + r() * 3); });
      ctx.globalAlpha = 1;
    },
    front: (ctx, w, _h, a, p) => {
      for (const [x, len, s] of [[w - 110, a.y + 10, 30], [w - 200, a.y - 40, 22]]) lantern(ctx, x, 0, len, s, 'fanous', p.accent, '#7a5a12');
    }
  },
  {
    id: 'christmas', name: 'Christmas', greeting: 'Merry Christmas', icon: 'bi-snow', window: 'locket', countries: 'all',
    palette: pal('christmas', ['#a3162c', '#5e0b18'], '#ffffff', '#f6d5d9', '#2e8b57', '#fff8f0'),
    back: (ctx, w, h, a) => {
      ctx.strokeStyle = '#ffffff';
      scatter(w, h, a, 22, 13, (x, y, r) => { ctx.globalAlpha = 0.3 + r() * 0.5; snowflake(ctx, x, y, 10 + r() * 18); });
      ctx.globalAlpha = 1;
    },
    front: (ctx, _w, _h, a) => {                                // the round photo becomes a bauble: a cap and a bow on top
      const r = Math.min(a.w, a.h) / 2 - 34, cx = a.x + a.w / 2, cy = a.y + a.h / 2 - 10, top = cy - r - 10;
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(cx - 40, top - 34, 80, 40);
      ctx.fillStyle = '#2e8b57';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * 70, top - 20, 36, 16, s * 0.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#e63946';
      for (const dx of [-14, 0, 14]) dot(ctx, cx + 70 + dx, top - 8 + Math.abs(dx) / 2, 8);
    }
  },
  {
    id: 'newyear', name: 'New Year', greeting: 'Happy New Year', icon: 'bi-stars', window: 'lights', countries: 'all',
    palette: pal('newyear', ['#1b1340', '#05030f'], '#ffffff', '#cfc7f5', '#ffcc33', '#f3eaff'),
    back: (ctx, w, h, a) => {
      const colours = ['#ffcc33', '#ff4d8d', '#4dd2ff', '#9b6bff'];
      scatter(w, h, a, 6, 21, (x, y, r, i) => { ctx.globalAlpha = 0.8; firework(ctx, x, y, 40 + r() * 40, colours[i % 4]); });
      scatter(w, h, a, 40, 4, (x, y, r, i) => {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = colours[i % 4];
        ctx.save(); ctx.translate(x, y); ctx.rotate(r() * 3); ctx.fillRect(-7, -3, 14, 6); ctx.restore();
      });
      ctx.globalAlpha = 1;
    }
  },
  {
    id: 'lunar', name: 'Lunar New Year', greeting: 'Happy Lunar New Year', icon: 'bi-lamp', window: 'arch',
    countries: ['SG', 'MY', 'AU', 'NZ', 'US', 'CA', 'GB', 'JP'],
    palette: pal('lunar', ['#c1121f', '#7a0010'], '#fff3c4', '#ffd6d6', '#ffc300', '#fff3c4'),
    back: (ctx, w, h, a, p) => {
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.3;
      scatter(w, h, a, 14, 17, (x, y, r) => {
        const s = 16 + r() * 18;
        ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeRect(x - s * 0.35, y - s * 0.35, s * 0.7, s * 0.7);
      });
      ctx.globalAlpha = 1;
    },
    front: (ctx, _w, _h, a) => {
      lantern(ctx, a.x + 10, 0, a.y + 20, 40, 'round', '#e5383b', '#ffc300');
      lantern(ctx, a.x + a.w - 10, 0, a.y + 70, 34, 'round', '#e5383b', '#ffc300');
    }
  },
  {
    id: 'vesak', name: 'Vesak', greeting: 'Happy Vesak', icon: 'bi-star', window: 'locket', countries: ['LK', 'SG', 'MY', 'NP', 'IN'],
    palette: pal('vesak', ['#0f2d5c', '#071a38'], '#fff7e0', '#cfdcf3', '#ffb703', '#fff4d6'),
    front: (ctx, w, _h, a) => {
      const colours = ['#ffb703', '#fb8500', '#e5383b', '#8ecae6'];
      [[90, a.y + 30, 30], [200, a.y - 40, 22], [w - 90, a.y + 50, 30], [w - 200, a.y - 30, 22]]
        .forEach(([x, len, s], i) => lantern(ctx, x, 0, len, s, 'star', colours[i], '#ffffff'));
    }
  },
  {
    id: 'easter', name: 'Easter', greeting: 'Happy Easter', icon: 'bi-egg', window: 'print', countries: WESTERN,
    palette: pal('easter', ['#f4fbe9', '#dff2c8'], '#2d4a1e', '#5a7346', '#9b5de5', '#ffffff'),
    back: (ctx, w, h, a) => {
      const sets: [string, string][] = [['#ffafcc', '#ffffff'], ['#a2d2ff', '#ffffff'], ['#ffd166', '#ef476f'], ['#cdb4db', '#ffffff'], ['#b9fbc0', '#06d6a0']];
      scatter(w, h, a, 10, 31, (x, y, r, i) => egg(ctx, x, y, 30 + r() * 18, (r() - 0.5) * 0.7, ...sets[i % sets.length]));
    }
  },
  {
    id: 'mothers', name: "Mother's Day", greeting: "Happy Mother's Day", icon: 'bi-flower2', window: 'locket', countries: 'all',
    palette: pal('mothers', ['#fff0f5', '#f8c8dc'], '#6d1a3c', '#9a4f6e', '#e75480', '#ffffff'),
    back: (ctx, w, h, a) => {
      const colours = ['#e75480', '#ff99c8', '#c77dff', '#ffb3c6'];
      scatter(w, h, a, 16, 41, (x, y, r, i) => { ctx.globalAlpha = 0.75; flower(ctx, x, y, 22 + r() * 22, 5, colours[i % 4], '#ffd166'); });
      ctx.globalAlpha = 1;
    }
  },
  {
    id: 'fathers', name: "Father's Day", greeting: "Happy Father's Day", icon: 'bi-star-fill', window: 'stamp', countries: 'all',
    palette: pal('fathers', ['#1d3557', '#0b1a2e'], '#ffffff', '#c6d4e6', '#f4a261', '#f1faee'),
    back: (ctx, w, h, a, p) => {
      ctx.strokeStyle = 'rgba(255,255,255,.06)';
      ctx.lineWidth = 18;
      for (let x = -h; x < w; x += 70) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.stroke(); }
      ctx.fillStyle = p.accent;
      scatter(w, h, a, 12, 51, (x, y, r) => { ctx.globalAlpha = 0.5 + r() * 0.4; star(ctx, x, y, 8 + r() * 12); });
      ctx.globalAlpha = 1;
    }
  },
  {
    id: 'grandparents', name: 'Grandparents Day', greeting: 'Happy Grandparents Day', icon: 'bi-tree', window: 'print',
    countries: ['US', 'CA', 'GB', 'AU', 'NZ', 'IE', 'DE', 'FR', 'ES', 'IT', 'NL', 'IN', 'SG', 'ZA'],
    palette: pal('grandparents', ['#fff8ec', '#f6dfb8'], '#4a2e12', '#7a5a3a', '#c06014', '#fffdf6'),
    back: (ctx, w, h, a) => {
      const colours = ['#c06014', '#e09f3e', '#9e2a2b', '#7f5539', '#bc6c25'];
      scatter(w, h, a, 18, 61, (x, y, r, i) => leaf(ctx, x, y, 18 + r() * 16, r() * 6, colours[i % 5]));
    }
  },
  {
    id: 'keiro', name: 'Respect for the Aged Day', greeting: 'Happy Respect for the Aged Day', icon: 'bi-sun', window: 'arch', countries: ['JP'],
    palette: pal('keiro', ['#fffdf8', '#f4ede1'], '#3a2a1a', '#6e5a44', '#bc002d', '#ffffff'),
    back: (ctx, w, h, a) => {
      ctx.fillStyle = 'rgba(188,0,45,.12)';
      dot(ctx, w, h, 220);                                         // a soft rising sun
      flower(ctx, 34, a.y + a.h * 0.45, 62, 16, '#f2c14e', '#d4880f');   // chrysanthemums beside the photo
      flower(ctx, w - 30, a.y + a.h * 0.7, 44, 14, '#f7d774', '#d4880f');
    }
  },
  {
    id: 'thanksgiving', name: 'Thanksgiving', greeting: 'Happy Thanksgiving', icon: 'bi-basket', window: 'wave', countries: ['US', 'CA'],
    palette: pal('thanksgiving', ['#fff3e0', '#f5c99b'], '#4e2a0e', '#7c4a24', '#d35400', '#fffaf2'),
    back: (ctx, w, h, a) => {
      const colours = ['#d35400', '#e67e22', '#b03a2e', '#8d5524', '#f1c40f'];
      scatter(w, h, a, 16, 71, (x, y, r, i) => leaf(ctx, x, y, 20 + r() * 16, r() * 6, colours[i % 5]));
    }
  }
];

/** The Winner frame: only for photos that won Photo of the Week or a festival contest (gold, laurels, sparkles). */
export const WINNER_FRAME: Festival = {
  id: 'winner', name: 'Winner', greeting: 'Photo of the Week', icon: 'bi-trophy-fill', window: 'locket', countries: 'all',
  palette: pal('winner', ['#3a2a07', '#140d02'], '#fff6d6', '#f2dca0', '#f7b733', '#fff1c1'),
  back: (ctx, w, h, a) => {
    ctx.fillStyle = '#f7d774';
    scatter(w, h, a, 28, 91, (x, y, r) => { ctx.globalAlpha = 0.35 + r() * 0.55; sparkle(ctx, x, y, 6 + r() * 12); });
    ctx.globalAlpha = 1;
    // Laurel branches around the round photo (same centre and size as the locket)
    const rr = Math.min(a.w, a.h) / 2 - 34, cx = a.x + a.w / 2, cy = a.y + a.h / 2 - 10, R = rr + 62;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 11; i++) {
        const t = Math.PI / 2 + side * (0.35 + i * 0.2);
        leaf(ctx, cx + Math.cos(t) * R, cy + Math.sin(t) * R, 22, t + side * 0.6, i % 2 ? '#f7b733' : '#d99a1e');
      }
    }
  }
};

/** The festivals for a country ('' = all of them), in the list's order. */
export function festivalsFor(country: string): Festival[] {
  return country ? FESTIVALS.filter(f => f.countries === 'all' || f.countries.includes(country)) : FESTIVALS;
}

// Re-used by the studio's preview swatch
export function festivalSwatch(f: Festival): string {
  return `linear-gradient(135deg, ${f.palette.bg[0]} 0 50%, ${f.palette.accent} 50% 100%)`;
}
