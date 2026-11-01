// Drawing one moment of a reel (1080 × 1920, for Instagram Reels and WhatsApp Status): the photo with a slow zoom, the
// title / place / message appearing one after another, a sound wave while the voice note plays, and a closing card.

import { FrameDesign, FramePalette, FrameText, dotFlower, drawFrame, heart } from './frame-draw';

export type ReelStyle = 'full' | 'framed';
type Photo = { width: number; height: number } & CanvasImageSource;

export interface ReelScene {
  style: ReelStyle;
  palette: FramePalette;
  design: FrameDesign;
  photo: Photo | null;
  text: FrameText;
  /** The voice note's loudness now (0–1), for the sound wave; null when there is no voice note. */
  level: number | null;
}

const SERIF = '"Playfair Display", Georgia, serif';
const SANS = 'Poppins, "Segoe UI", sans-serif';
export const REEL_W = 1080, REEL_H = 1920;
/** The closing card's length, in seconds. */
export const OUTRO = 2.4;

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
/** 0 → 1 between from and from + length seconds. */
const at = (t: number, from: number, length = 0.6) => ease((t - from) / length);

/** A copy of the photo zoomed in by <paramref name="zoom"/> around a point that drifts slowly (a gentle Ken Burns move). */
function zoomed(photo: Photo, zoom: number, drift: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const w = photo.width / zoom, h = photo.height / zoom;
  c.width = Math.round(w); c.height = Math.round(h);
  const x = (photo.width - w) * (0.5 + 0.35 * Math.sin(drift)), y = (photo.height - h) * (0.45 + 0.25 * Math.cos(drift));
  c.getContext('2d')!.drawImage(photo, x, y, w, h, 0, 0, w, h);
  return c;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/), lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; if (lines.length === max) break; }
    else line = next;
  }
  if (line && lines.length < max) lines.push(line);
  if (lines.length === max && words.join(' ').length > lines.join(' ').length) lines[max - 1] = lines[max - 1].replace(/\W*\S*$/, '') + '…';
  return lines;
}

/** Sound wave bars (moving with the voice's loudness), centred at y. */
function wave(ctx: CanvasRenderingContext2D, t: number, level: number, y: number, color: string): void {
  ctx.fillStyle = color;
  const n = 28, gap = 22, x0 = REEL_W / 2 - (n - 1) * gap / 2;
  for (let i = 0; i < n; i++) {
    const shape = 0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + t * 6));
    const h = 10 + 90 * shape * (0.25 + 0.75 * level);
    ctx.beginPath();
    ctx.roundRect(x0 + i * gap - 5, y - h / 2, 10, h, 5);
    ctx.fill();
  }
}

/** Draws the reel at <paramref name="t"/> seconds of <paramref name="duration"/>. */
export function drawReel(ctx: CanvasRenderingContext2D, t: number, duration: number, s: ReelScene): void {
  const w = REEL_W, h = REEL_H, p = s.palette;
  const progress = clamp(t / duration);
  const photo = s.photo ? zoomed(s.photo, 1 + 0.14 * progress, progress * 2.2) : null;

  if (s.style === 'framed') {
    // The photo frame (story size), its photo slowly zooming
    drawFrame(ctx, w, h, p, photo, s.text, s.design);
    if (s.level !== null) {
      ctx.save();
      ctx.globalAlpha = at(t, 1, 0.5);
      wave(ctx, t, s.level, h - 300, p.accent);
      ctx.restore();
    }
  } else {
    // Full photo, a dark fade at the bottom, the text rising in
    ctx.fillStyle = p.bg[1];
    ctx.fillRect(0, 0, w, h);
    if (photo) {
      const k = Math.max(w / photo.width, h / photo.height), dw = photo.width * k, dh = photo.height * k;
      ctx.globalAlpha = at(t, 0, 0.8);
      ctx.drawImage(photo, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;
    }
    const g = ctx.createLinearGradient(0, h * 0.45, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.82)');
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.45, w, h * 0.55);
    // Brand at the top
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.roundRect(56, 70, 470, 76, 38); ctx.fill();
    heart(ctx, 104, 110, 30, p.accent);
    ctx.fillStyle = '#fff';
    ctx.font = `700 34px ${SERIF}`;
    ctx.fillText('Selfie with Parent', 140, 120);

    ctx.textAlign = 'center';
    const rise = (from: number) => (1 - at(t, from)) * 40;
    ctx.globalAlpha = at(t, 0.6);
    ctx.fillStyle = '#fff';
    let size = 76;
    do { ctx.font = `700 ${size}px ${SERIF}`; size -= 4; } while (size > 40 && ctx.measureText(s.text.title).width > w - 120);
    ctx.fillText(s.text.title, w / 2, h - 560 + rise(0.6));
    ctx.globalAlpha = at(t, 1.2);
    ctx.fillStyle = p.accent;
    ctx.font = `600 34px ${SANS}`;
    ctx.fillText(s.text.line, w / 2, h - 495 + rise(1.2));
    if (s.text.message) {
      ctx.globalAlpha = at(t, 2);
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = `italic 42px ${SERIF}`;
      wrap(ctx, `“${s.text.message}”`, w - 160, 3).forEach((l, i) => ctx.fillText(l, w / 2, h - 410 + i * 56 + rise(2)));
    }
    ctx.globalAlpha = 1;
    if (s.level !== null) { ctx.globalAlpha = at(t, 1, 0.5); wave(ctx, t, s.level, h - 170, p.accent); ctx.globalAlpha = 1; }
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.font = `600 28px ${SANS}`;
    ctx.fillText(`${s.text.tag}  ·  ${s.text.site}`, w / 2, h - 70);
  }

  // The closing card
  const o = at(t, duration - OUTRO, 0.7);
  if (o > 0) {
    ctx.save();
    ctx.globalAlpha = o * 0.94;
    const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
    g.addColorStop(0, p.bg[0]);
    g.addColorStop(1, p.bg[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = o;
    dotFlower(ctx, 0, 0, 320, p.accent);
    dotFlower(ctx, w, h, 320, p.accent);
    const pop = 1 + 0.15 * Math.sin(Math.min(1, (t - (duration - OUTRO)) / 0.5) * Math.PI);
    heart(ctx, w / 2, h / 2 - 210, 120 * pop, p.accent);
    ctx.textAlign = 'center';
    ctx.fillStyle = p.ink;
    ctx.font = `700 78px ${SERIF}`;
    ctx.fillText('Selfie with Parent', w / 2, h / 2);
    ctx.font = `500 38px ${SANS}`;
    ctx.fillStyle = p.muted;
    ctx.fillText(s.text.title, w / 2, h / 2 + 80);
    ctx.fillStyle = p.accent;
    ctx.font = `700 40px ${SANS}`;
    ctx.fillText(s.text.tag, w / 2, h / 2 + 190);
    ctx.fillStyle = p.ink;
    ctx.font = `500 34px ${SANS}`;
    ctx.fillText(s.text.site, w / 2, h / 2 + 245);
    ctx.restore();
  }
}
