import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** A photo, video or voice note to send with a share. */
export interface ShareMedia { url: string; kind: 'photo' | 'video' | 'voice'; }
export interface ShareContent { title: string; text: string; url: string; media?: (ShareMedia | null | undefined)[]; }
/** shared: done · cancelled: closed by the visitor · tap-again: the files are ready, the browser wants one more tap · unsupported: no share sheet */
export type ShareResult = 'shared' | 'cancelled' | 'tap-again' | 'unsupported';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm',
  'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav' };

/**
 * Rich sharing: sends the real photo / video (not only a link) to WhatsApp, Instagram, Facebook… through the phone's share
 * sheet, with the caption and the link as text. Browsers that can't share files share the link. Files are fetched once
 * and kept, so a second tap shares at once (a browser may refuse to open the share sheet after a slow download).
 */
@Injectable({ providedIn: 'root' })
export class RichShareService {
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly cache = new Map<string, File>();

  /** The phone / browser has a share sheet. */
  get canShare(): boolean { return this.inBrowser && typeof navigator.share === 'function'; }

  /** The share sheet can take files (most phones; Chrome / Edge on Windows). */
  get canShareFiles(): boolean {
    if (!this.canShare || typeof navigator.canShare !== 'function') return false;
    try { return navigator.canShare({ files: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })] }); } catch { return false; }
  }

  async share(c: ShareContent): Promise<ShareResult> {
    if (!this.canShare) return 'unsupported';
    const media = (c.media ?? []).filter((m): m is ShareMedia => !!m?.url);
    const text = `${c.text}\n${c.url}`;   // apps that take a file often drop the link field: put it in the text too
    let files: File[] = [];
    if (media.length && this.canShareFiles) {
      const fresh = media.some(m => !this.cache.has(m.url));
      files = (await Promise.all(media.map(m => this.file(m, c.title)))).filter((f): f is File => !!f);
      // Too big together / a type this phone can't share: try the photo or video alone, then just the link
      if (files.length && !navigator.canShare({ files })) files = files.filter(f => !f.type.startsWith('audio/')).slice(0, 1);
      if (files.length && !navigator.canShare({ files })) files = [];
      if (files.length && fresh) {
        try { await navigator.share({ files, title: c.title, text }); return 'shared'; }
        catch (e) { return this.outcome(e, true); }
      }
    }
    try {
      await navigator.share(files.length ? { files, title: c.title, text } : { title: c.title, text: c.text, url: c.url });
      return 'shared';
    } catch (e) { return this.outcome(e, false); }
  }

  /** The visitor closed the sheet, or the browser wanted a fresh tap after downloading the files. */
  private outcome(e: unknown, afterDownload: boolean): ShareResult {
    const name = (e as { name?: string })?.name;
    if (name === 'AbortError') return 'cancelled';
    return afterDownload && name === 'NotAllowedError' ? 'tap-again' : 'cancelled';
  }

  private async file(m: ShareMedia, title: string): Promise<File | null> {
    const hit = this.cache.get(m.url);
    if (hit) return hit;
    try {
      // Its own address: the page's <img> / <video> may have cached the file without CORS headers
      const r = await fetch(m.url + (m.url.includes('?') ? '&' : '?') + 'use=share', { mode: 'cors' });
      if (!r.ok) return null;
      const blob = await r.blob();
      const type = blob.type || (m.kind === 'photo' ? 'image/jpeg' : m.kind === 'video' ? 'video/mp4' : 'audio/mpeg');
      const name = `${title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'selfie-with-parent'}.${EXT[type] ?? 'bin'}`;
      const f = new File([blob], name, { type });
      this.cache.set(m.url, f);
      return f;
    } catch { return null; }
  }
}
