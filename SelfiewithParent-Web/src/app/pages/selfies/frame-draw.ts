// Drawing the photo frames on a canvas (the studio is in photo-frame.ts, the festival frames in frame-festivals.ts).

/** A colour set for the frame: background gradient, text colours, accent and the photo's border. */
export interface FramePalette { id: string; name: string; bg: [string, string]; ink: string; muted: string; accent: string; line: string; }

export const FRAME_PALETTES: FramePalette[] = [
  { id: 'brand', name: 'Selfie with Parent', bg: ['#0f5b5c', '#0a3d3e'], ink: '#ffffff', muted: '#bfe0de', accent: '#f06543', line: '#fff3ee' },
  { id: 'marigold', name: 'Marigold', bg: ['#fff4dc', '#ffd27a'], ink: '#5a2a00', muted: '#8a5a1f', accent: '#e8860c', line: '#fffaf0' },
  { id: 'peacock', name: 'Peacock', bg: ['#0b5563', '#06303a'], ink: '#ffffff', muted: '#b5e3e0', accent: '#2ec4b6', line: '#e9fffb' },
  { id: 'lotus', name: 'Lotus', bg: ['#fff0f4', '#f5bfd1'], ink: '#6b1d3a', muted: '#9a5470', accent: '#e0517f', line: '#ffffff' },
  { id: 'mehendi', name: 'Mehendi', bg: ['#eef3df', '#c5d59c'], ink: '#33401a', muted: '#5f6e3c', accent: '#6f8f2f', line: '#fbfff1' },
  { id: 'indigo', name: 'Indigo night', bg: ['#22255a', '#0d0f2b'], ink: '#fff7e6', muted: '#c4c6ef', accent: '#f5b942', line: '#f5e6c4' },
  { id: 'terracotta', name: 'Terracotta', bg: ['#fbe7dc', '#e6a283'], ink: '#5c2414', muted: '#8a4a33', accent: '#c4552e', line: '#fff6f0' },
  { id: 'monsoon', name: 'Monsoon', bg: ['#e4f0f6', '#a5c8de'], ink: '#123247', muted: '#3f6680', accent: '#2f7fb0', line: '#ffffff' },
  { id: 'ivory', name: 'Ivory & gold', bg: ['#fffdf7', '#f1e3c2'], ink: '#3d2f12', muted: '#7a6a45', accent: '#b8892c', line: '#ffffff' },
  { id: 'mono', name: 'Black & white', bg: ['#ffffff', '#e6e6e6'], ink: '#111111', muted: '#555555', accent: '#111111', line: '#ffffff' }
];

/** Picture sizes: Instagram portrait, a square post, and a phone story / status. */
export const FRAME_SHAPES = [
  { id: 'portrait', name: 'Portrait', w: 1080, h: 1350, icon: 'bi-file-earmark-image' },
  { id: 'square', name: 'Square', w: 1080, h: 1080, icon: 'bi-square' },
  { id: 'story', name: 'Story', w: 1080, h: 1920, icon: 'bi-phone' }
] as const;
export type FrameShape = (typeof FRAME_SHAPES)[number]['id'];

/** Frame designs (all our own), each works with every colour and size. */
export const FRAME_DESIGNS = [
  { id: 'arch', name: 'Jharokha arch', icon: 'bi-door-closed' },
  { id: 'locket', name: 'Locket', icon: 'bi-circle' },
  { id: 'print', name: 'Keepsake print', icon: 'bi-card-image' },
  { id: 'stamp', name: 'Postage stamp', icon: 'bi-postage-heart' },
  { id: 'lights', name: 'Festive lights', icon: 'bi-lightbulb' },
  { id: 'wave', name: 'Wave', icon: 'bi-water' }
] as const;
export type FrameDesign = (typeof FRAME_DESIGNS)[number]['id'];

type Photo = { width: number; height: number } & CanvasImageSource;
export interface Box { x: number; y: number; w: number; h: number; }

/** Festival decoration, drawn behind (back) or over (front) the photo window. `a` is the photo's area. */
export type Deco = (ctx: CanvasRenderingContext2D, w: number, h: number, a: Box, p: FramePalette) => void;

export interface FrameText { title: string; line: string; message: string; tag: string; site: string; greeting?: string; }

const SERIF = '"Playfair Display", Georgia, serif';
const SANS = 'Poppins, "Segoe UI", sans-serif';

/**
 * Draws a keepsake frame: the photo in the chosen design, the title, place and date, the message and the site's name,
 * over the palette's background with dotted rangoli corners. Our own designs.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, p: FramePalette,
  photo: Photo | null, t: FrameText, design: FrameDesign = 'arch', deco?: { back?: Deco; front?: Deco }): void {
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, p.bg[0]);
  g.addColorStop(1, p.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  dotFlower(ctx, 0, 0, Math.min(w, h) * 0.3, p.accent);
  dotFlower(ctx, w, h, Math.min(w, h) * 0.3, p.accent);

  const m = 72, textW = w - 2 * m;
  const maxLines = h >= 1800 ? 4 : h >= 1300 ? 2 : 1;
  ctx.font = `italic 34px ${SERIF}`;
  const msg = t.message ? wrap(ctx, `“${t.message}”`, textW - 40, maxLines) : [];
  const textH = 84 + 46 + msg.length * 46 + (msg.length ? 24 : 0);
  const footerH = 118;

  // The photo's area; the text starts just below it (room for a seal on its bottom edge)
  // A festival greeting ("Happy Diwali") takes a line above the photo
  const top = m + 26 + (t.greeting ? 84 : 0);
  const area: Box = { x: m + 10, y: top, w: w - 2 * m - 20, h: h - footerH - textH - 70 - top };
  deco?.back?.(ctx, w, h, area, p);
  ({ arch: archWindow, locket, print: keepsakePrint, stamp, lights: festiveLights, wave } as const)[design](ctx, area, p, photo, g, w);
  deco?.front?.(ctx, w, h, area, p);
  if (t.greeting) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    fit(ctx, t.greeting, w - 2 * m - 120, 58, `italic 700 {size}px ${SERIF}`);
    const gw = Math.min(ctx.measureText(t.greeting).width, w - 2 * m - 120);
    ctx.fillStyle = p.ink;
    ctx.fillText(t.greeting, w / 2, m + 52);
    ctx.fillStyle = p.accent;
    diamond(ctx, w / 2 - gw / 2 - 30, m + 34, 10);
    diamond(ctx, w / 2 + gw / 2 + 30, m + 34, 10);
  }

  // Title, place · date, message
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let y = area.y + area.h + 48 + 76;
  ctx.fillStyle = p.ink;
  fit(ctx, t.title, textW, 64, `700 {size}px ${SERIF}`);
  ctx.fillText(t.title, w / 2, y);
  y += 46;
  ctx.fillStyle = p.muted;
  fit(ctx, t.line, textW, 28, `500 {size}px ${SANS}`);
  ctx.fillText(t.line, w / 2, y);
  y += 22;
  ctx.fillStyle = p.ink;
  ctx.font = `italic 34px ${SERIF}`;
  for (const l of msg) { y += 46; ctx.fillText(l, w / 2, y); }

  // Footer: a dotted rule, the site's name and hashtag
  const fy = h - footerH + 18;
  ctx.fillStyle = p.accent;
  for (let x = m; x <= w - m; x += 18) {
    ctx.beginPath();
    ctx.arc(x, fy, Math.abs(x - w / 2) < 30 ? 5 : 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = p.ink;
  ctx.font = `700 36px ${SERIF}`;
  ctx.fillText('Selfie with Parent', w / 2, fy + 52);
  ctx.fillStyle = p.accent;
  ctx.font = `600 24px ${SANS}`;
  ctx.fillText(`${t.tag}  ·  ${t.site}`, w / 2, fy + 88);
}

type Window = (ctx: CanvasRenderingContext2D, a: Box, p: FramePalette, photo: Photo | null, bg: CanvasGradient, w: number) => void;

/** Jharokha: an onion-dome arched window with a white border, a finial on top and a heart seal below. */
const archWindow: Window = (ctx, a, p, photo) => {
  ctx.save();
  shadow(ctx);
  arch(ctx, a.x - 14, a.y - 14, a.w + 28, a.h + 28);
  ctx.fillStyle = p.line;
  ctx.fill();
  ctx.restore();
  ctx.save();
  arch(ctx, a.x, a.y, a.w, a.h);
  ctx.clip();
  cover(ctx, photo, a, p);
  ctx.restore();
  arch(ctx, a.x + 10, a.y + 10, a.w - 20, a.h - 20);
  ctx.strokeStyle = 'rgba(255,255,255,.65)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = p.accent;
  diamond(ctx, a.x + a.w / 2, a.y - 34, 14);
  seal(ctx, a.x + a.w / 2, a.y + a.h + 4, p);
};

/** Locket: a round photo in a double ring, with a garland of petals around it. */
const locket: Window = (ctx, a, p, photo) => {
  const r = Math.min(a.w, a.h) / 2 - 34, cx = a.x + a.w / 2, cy = a.y + a.h / 2 - 10;
  const n = Math.round(r / 9);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + Math.cos(t) * (r + 26), cy + Math.sin(t) * (r + 26));
    ctx.rotate(t);
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? p.accent : p.line;
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  shadow(ctx);
  ctx.beginPath();
  ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
  ctx.fillStyle = p.line;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  cover(ctx, photo, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }, p);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 12, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,.7)';
  ctx.lineWidth = 3;
  ctx.stroke();
  seal(ctx, cx, Math.min(cy + r + 26, a.y + a.h + 4), p);
};

/** Keepsake print: a slightly tilted printed photo with two strips of tape and a handwritten-style heart. */
const keepsakePrint: Window = (ctx, a, p, photo) => {
  for (let i = 0; i < 9; i++) {                 // scattered little hearts behind the print
    const hx = a.x + ((i * 263) % a.w), hy = a.y + ((i * 181) % a.h);
    ctx.save();
    ctx.globalAlpha = 0.18;
    heart(ctx, hx, hy, 26 + (i % 3) * 8, p.accent);
    ctx.restore();
  }
  const pad = 26, bottom = 96;
  const cw = Math.min(a.w - 40, (a.h - 30 - pad - bottom) * 0.95 + 2 * pad), ch = a.h - 30;
  ctx.save();
  ctx.translate(a.x + a.w / 2, a.y + a.h / 2);
  ctx.rotate(-0.035);
  ctx.save();
  shadow(ctx);
  ctx.fillStyle = '#fffdf8';
  ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
  ctx.restore();
  const inner = { x: -cw / 2 + pad, y: -ch / 2 + pad, w: cw - 2 * pad, h: ch - pad - bottom };
  ctx.save();
  ctx.beginPath();
  ctx.rect(inner.x, inner.y, inner.w, inner.h);
  ctx.clip();
  cover(ctx, photo, inner, p);
  ctx.restore();
  heart(ctx, 0, ch / 2 - bottom / 2 + 4, 40, p.accent);
  ctx.globalAlpha = 0.55;                       // tape
  ctx.fillStyle = p.accent;
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.translate(sx * (cw / 2 - 40), -ch / 2 + 4);
    ctx.rotate(sx * 0.6);
    ctx.fillRect(-60, -18, 120, 36);
    ctx.restore();
  }
  ctx.restore();
};

/** Postage stamp: perforated edges, the photo inside, and a heart postmark across the corner. */
const stamp: Window = (ctx, a, p, photo, bg) => {
  const sw = Math.min(a.w - 20, a.h * 0.86), sx = a.x + (a.w - sw) / 2, sy = a.y + 10, sh = a.h - 20;
  ctx.save();
  shadow(ctx);
  ctx.fillStyle = p.line;
  ctx.fillRect(sx, sy, sw, sh);
  ctx.restore();
  ctx.fillStyle = bg;                           // perforations: bites of the background along every edge
  const step = 34, rr = 10;
  for (let x = sx + step / 2; x < sx + sw; x += step) { dot(ctx, x, sy, rr); dot(ctx, x, sy + sh, rr); }
  for (let y = sy + step / 2; y < sy + sh; y += step) { dot(ctx, sx, y, rr); dot(ctx, sx + sw, y, rr); }
  const inner = { x: sx + 34, y: sy + 34, w: sw - 68, h: sh - 68 };
  ctx.save();
  ctx.beginPath();
  ctx.rect(inner.x, inner.y, inner.w, inner.h);
  ctx.clip();
  cover(ctx, photo, inner, p);
  ctx.restore();
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(inner.x - 10, inner.y - 10, inner.w + 20, inner.h + 20);
  // Postmark
  const px = sx + sw - 60, py = sy + 70;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(px, py, 78, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(px, py, 64, 0, Math.PI * 2); ctx.stroke();
  heart(ctx, px, py + 6, 50, p.accent);
  ctx.lineWidth = 4;
  for (let i = 0; i < 3; i++) {                 // wavy cancellation lines
    ctx.beginPath();
    const ly = py - 26 + i * 26;
    ctx.moveTo(px - 290, ly);
    for (let x = px - 290; x <= px - 90; x += 10) ctx.lineTo(x, ly + Math.sin((x - px) / 16) * 7);
    ctx.stroke();
  }
  ctx.restore();
};

/** Festive lights: a rounded photo with a string of glowing bulbs across the top and a diya below. */
const festiveLights: Window = (ctx, a, p, photo) => {
  const r = 28;
  ctx.save();
  shadow(ctx);
  rounded(ctx, a.x - 14, a.y - 14, a.w + 28, a.h + 28, r + 12);
  ctx.fillStyle = p.line;
  ctx.fill();
  ctx.restore();
  ctx.save();
  rounded(ctx, a.x, a.y, a.w, a.h, r);
  ctx.clip();
  cover(ctx, photo, a, p);
  ctx.restore();
  // The string sags from corner to corner
  const x0 = a.x - 30, x1 = a.x + a.w + 30, top = a.y - 24, sag = 70;
  const at = (x: number) => top + sag * (1 - Math.pow((2 * (x - x0)) / (x1 - x0) - 1, 2));
  ctx.strokeStyle = 'rgba(40,30,20,.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 6) x === x0 ? ctx.moveTo(x, at(x)) : ctx.lineTo(x, at(x));
  ctx.stroke();
  const colours = ['#ffd34d', p.accent, '#ff7aa2', '#7fe0ff', '#9be15d'];
  let i = 0;
  for (let x = x0 + 40; x < x1 - 20; x += 64, i++) {
    const y = at(x) + 14;
    const glow = ctx.createRadialGradient(x, y + 10, 2, x, y + 10, 40);
    glow.addColorStop(0, 'rgba(255,240,180,.85)');
    glow.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = glow;
    dot(ctx, x, y + 10, 40);
    ctx.fillStyle = colours[i % colours.length];
    ctx.beginPath();
    ctx.ellipse(x, y + 12, 10, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a4630';
    ctx.fillRect(x - 6, y - 6, 12, 8);
  }
  diya(ctx, a.x + a.w / 2, a.y + a.h + 6, p);
};

/** Wave: the photo fills the top edge to edge and ends in a soft wave, with an accent wave under it. */
const wave: Window = (ctx, a, p, photo, _bg, w) => {
  const bottom = a.y + a.h - 10, amp = 26;
  const edge = (x: number) => bottom + Math.sin((x / w) * Math.PI * 2.2) * amp;
  ctx.save();
  ctx.beginPath();
  const y0 = a.y > 120 ? a.y - 20 : 0;   // under a festival greeting
  ctx.moveTo(0, y0);
  ctx.lineTo(w, y0);
  for (let x = w; x >= 0; x -= 8) ctx.lineTo(x, edge(x));
  ctx.closePath();
  ctx.clip();
  cover(ctx, photo, { x: 0, y: y0, w, h: bottom + amp - y0 }, p);
  ctx.restore();
  for (const [off, colour, width] of [[0, p.line, 12], [22, p.accent, 5]] as const) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) x === 0 ? ctx.moveTo(x, edge(x) + off) : ctx.lineTo(x, edge(x) + off);
    ctx.stroke();
  }
  seal(ctx, w / 2, edge(w / 2) + 12, p);
};

/** The photo, cover-fitted into the box (inside the current clip); a soft fill while it loads. */
function cover(ctx: CanvasRenderingContext2D, photo: Photo | null, b: Box, p: FramePalette): void {
  if (!photo) { ctx.fillStyle = p.muted; ctx.fillRect(b.x, b.y, b.w, b.h); return; }
  const s = Math.max(b.w / photo.width, b.h / photo.height);
  const dw = photo.width * s, dh = photo.height * s;
  ctx.drawImage(photo, b.x + (b.w - dw) / 2, b.y + (b.h - dh) / 2, dw, dh);
}

export function shadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'rgba(0,0,0,.22)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
}

/** The round heart seal. */
export function seal(ctx: CanvasRenderingContext2D, x: number, y: number, p: FramePalette): void {
  ctx.beginPath();
  ctx.arc(x, y, 44, 0, Math.PI * 2);
  ctx.fillStyle = p.accent;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = p.line;
  ctx.stroke();
  heart(ctx, x, y + 2, 30, p.line);
}

/** A clay lamp with a flame. */
export function diya(ctx: CanvasRenderingContext2D, x: number, y: number, p: FramePalette): void {
  const flame = ctx.createLinearGradient(x, y - 70, x, y - 14);
  flame.addColorStop(0, '#fff3b0');
  flame.addColorStop(1, '#ff8a1f');
  const glow = ctx.createRadialGradient(x, y - 36, 4, x, y - 36, 70);
  glow.addColorStop(0, 'rgba(255,220,120,.7)');
  glow.addColorStop(1, 'rgba(255,220,120,0)');
  ctx.fillStyle = glow;
  dot(ctx, x, y - 36, 70);
  ctx.beginPath();
  ctx.moveTo(x, y - 74);
  ctx.bezierCurveTo(x + 22, y - 44, x + 16, y - 16, x, y - 14);
  ctx.bezierCurveTo(x - 16, y - 16, x - 22, y - 44, x, y - 74);
  ctx.fillStyle = flame;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 70, y - 14);
  ctx.quadraticCurveTo(x, y + 66, x + 70, y - 14);
  ctx.quadraticCurveTo(x + 84, y - 22, x + 96, y - 24);
  ctx.quadraticCurveTo(x, y - 2, x - 70, y - 14);
  ctx.closePath();
  ctx.fillStyle = p.accent;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = p.line;
  ctx.stroke();
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** An arched window: straight sides, rounded bottom corners, an onion-dome top. */
function arch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const a = Math.min(w * 0.3, h * 0.35), r = 28;
  ctx.beginPath();
  ctx.moveTo(x, y + a);
  ctx.bezierCurveTo(x, y + a * 0.35, x + w * 0.3, y + a * 0.12, x + w / 2, y);
  ctx.bezierCurveTo(x + w * 0.7, y + a * 0.12, x + w, y + a * 0.35, x + w, y + a);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.closePath();
}

/** Rings of dots around a corner, like a rangoli. */
export function dotFlower(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  for (let ring = 1; ring <= 5; ring++) {
    const rr = (size / 5) * ring, n = ring * 8;
    ctx.globalAlpha = 0.28 - ring * 0.04;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, ring % 2 ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.7, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.7, y);
  ctx.closePath();
  ctx.fill();
}

export function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.45);
  ctx.bezierCurveTo(x - s * 0.9, y - s * 0.05, x - s * 0.45, y - s * 0.75, x, y - s * 0.3);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 0.75, x + s * 0.9, y - s * 0.05, x, y + s * 0.45);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Shrinks the font until the text fits the width. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number, size: number, font: string): void {
  do { ctx.font = font.replace('{size}', String(size)); size -= 2; } while (size > 16 && ctx.measureText(text).width > width);
}

/** Splits text into at most `max` lines that fit the width; the last one ends with "…" when cut. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(next).width <= width || !line) { line = next; continue; }
    lines.push(line);
    line = words[i];
    if (lines.length === max) { line = ''; lines[max - 1] = ellipsis(ctx, lines[max - 1], width); break; }
  }
  if (line) lines.push(line);
  return lines.slice(0, max);
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  let s = text.replace(/[”"]$/, '');
  while (s && ctx.measureText(`${s}…”`).width > width) s = s.slice(0, -1);
  return `${s.trimEnd()}…”`;
}

