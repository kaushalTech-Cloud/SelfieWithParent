import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, retry, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { SeoService } from '../../core/seo.service';
import { siteImage } from '../../core/site-images';
import { ThenNowDraft } from './then-now-draft';
import { DonatePill } from '../../shared/donate-pill';

interface Pair {
  publicId: string; kind: string; name: string; firstName: string; parentName: string; place: string | null;
  photoId: string | null; thenId: string | null; thenYear: number | null; nowYear: number | null;
}

const PAGE = 12;

/**
 * Then & Now (from the design): make your own then-and-now comparison and download it (all in the browser), submit it to
 * the gallery (it goes through review like every upload), and browse the approved pairs.
 */
@Component({
  selector: 'app-then-now',
  imports: [DonatePill, TranslatePipe],
  templateUrl: './then-now.html'
})
export class ThenNow implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly draft = inject(ThenNowDraft);
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // Make your own (the sample pictures until the visitor picks theirs)
  protected readonly thenUrl = signal(siteImage('then-2.svg'));
  protected readonly nowUrl = signal(siteImage('selfie-2.svg'));
  protected readonly thenFile = signal<File | null>(null);
  protected readonly nowFile = signal<File | null>(null);
  protected thenYear = '';
  protected nowYear = '';
  protected readonly pos = signal(50);
  protected readonly makeError = signal('');
  protected readonly downloading = signal(false);

  // Gallery
  protected readonly pairs = signal<Pair[]>([]);
  protected readonly total = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly positions = signal<Partial<Record<string, number>>>({});
  private page = 1;

  constructor() {
    inject(SeoService).set({ title: 'Then & Now', description: 'Recreate an old photo with your parents and slide between the years.', path: '/then-now' });
    this.load(true);
    // From the yearly reminder email ("take it again"): last year's selfie as the old photo
    const again = this.inBrowser ? new URLSearchParams(location.search).get('again') : null;
    if (again && /^[0-9a-f-]{36}$/i.test(again)) void this.takeAgain(again);
  }

  /** Shown when last year's selfie was put in as the old photo. */
  protected readonly againNote = signal('');

  private async takeAgain(id: string): Promise<void> {
    try {
      const s = await firstValueFrom(this.http.get<{ item: { photoId: string | null; approvedAtUtc: string; parentName: string } }>(
        `${environment.apiBaseUrl}/api/v1/selfies/${id}`));
      if (!s.item.photoId) return;
      // Its own address (use=frame): the browser may hold a copy of this photo without the CORS headers a canvas needs
      const blob = await firstValueFrom(this.http.get(this.file(s.item.photoId), { responseType: 'blob', params: { use: 'frame' } }));
      const f = new File([blob], 'last-year.jpg', { type: blob.type || 'image/jpeg' });
      if (this.thenUrl().startsWith('blob:')) URL.revokeObjectURL(this.thenUrl());
      this.thenUrl.set(URL.createObjectURL(f));
      this.thenFile.set(f);
      this.thenYear = String(new Date(s.item.approvedAtUtc + 'Z').getFullYear());
      this.nowYear = String(new Date().getFullYear());
      this.againNote.set(this.i18n.t("Your earlier selfie with {parent} is ready as the old photo. Take the same picture today and add it.", { parent: s.item.parentName }));
    } catch { /* the maker starts empty as usual */ }
  }

  ngOnDestroy(): void {
    for (const u of [this.thenUrl(), this.nowUrl()]) if (u.startsWith('blob:')) URL.revokeObjectURL(u);
  }

  protected file(id: string | null): string { return id ? `${environment.apiBaseUrl}/api/v1/selfies/files/${id}` : ''; }

  protected title(p: Pair): string { return this.i18n.t('{name} with {parent}', { name: p.firstName, parent: p.parentName }); }

  protected load(reset = false): void {
    if (reset) { this.page = 1; this.pairs.set([]); this.state.set('loading'); }
    this.http.get<{ items: Pair[]; total: number }>(`${environment.apiBaseUrl}/api/v1/selfies/gallery`, { params: { tab: 'thennow', page: this.page, pageSize: PAGE } })
      .pipe(retry({ count: this.inBrowser ? 3 : 0, delay: (_, n) => timer(2000 * n) }))
      .subscribe({
        next: r => { this.pairs.update(list => [...list, ...r.items]); this.total.set(r.total); this.state.set('ready'); },
        error: () => this.state.set(this.pairs().length ? 'ready' : 'error')
      });
  }

  protected more(): void { this.page++; this.load(); }

  protected slide(id: string, event: Event): void {
    const v = Number((event.target as HTMLInputElement).value);
    this.positions.update(p => ({ ...p, [id]: v }));
  }

  // ---------- Make your own ----------

  protected pick(which: 'then' | 'now', event: Event): void {
    const box = event.target as HTMLInputElement;
    const f = box.files?.[0];
    box.value = '';
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 10 * 1024 * 1024) {
      this.makeError.set(this.i18n.t('Choose a JPG, PNG or WebP photo up to 10 MB.'));
      return;
    }
    this.makeError.set('');
    const url = URL.createObjectURL(f);
    const target = which === 'then' ? this.thenUrl : this.nowUrl;
    if (target().startsWith('blob:')) URL.revokeObjectURL(target());
    target.set(url);
    (which === 'then' ? this.thenFile : this.nowFile).set(f);
  }

  protected digits(which: 'then' | 'now', event: Event): void {
    const box = event.target as HTMLInputElement;
    box.value = box.value.replace(/\D/g, '').slice(0, 4);
    if (which === 'then') this.thenYear = box.value; else this.nowYear = box.value;
  }

  /** A 1600 × 1100 side-by-side card, as in the design (the old photo slightly sepia). */
  protected async download(): Promise<void> {
    this.downloading.set(true);
    try {
      const [a, b] = await Promise.all([this.image(this.thenUrl()), this.image(this.nowUrl())]);
      const W = 1600, H = 1100, c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#0a3d3e'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.filter = 'sepia(55%)'; this.cover(ctx, a, 60, 60, 720, 880); ctx.restore();
      this.cover(ctx, b, 820, 60, 720, 880);
      ctx.fillStyle = '#f4b942'; ctx.font = "700 46px 'Playfair Display', Georgia, serif"; ctx.textAlign = 'center';
      ctx.fillText(this.thenYear || this.i18n.t('Then'), 420, 1015);
      ctx.fillText(this.nowYear || this.i18n.t('Now'), 1180, 1015);
      ctx.fillStyle = '#ffffff'; ctx.font = '500 30px Poppins, Arial, sans-serif';
      ctx.fillText('#SelfieWithParent · Then & Now', W / 2, 1070);
      const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png'));
      if (!blob) throw new Error('canvas');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'then-and-now.png';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch {
      this.makeError.set(this.i18n.t("We couldn't make the picture. Please try other photos."));
    } finally {
      this.downloading.set(false);
    }
  }

  private image(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  private cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number): void {
    const iw = img.naturalWidth || w, ih = img.naturalHeight || h;
    const r = Math.max(w / iw, h / ih), sw = w / r, sh = h / r;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  }

  /** "Submit to the gallery": the upload form opens with this pair filled in (sign-in first if needed). */
  protected submit(): void {
    if (!this.thenFile() || !this.nowFile()) {
      this.makeError.set(this.i18n.t('Add the old photo and the new photo first.'));
      return;
    }
    this.draft.pair.set({ then: this.thenFile(), now: this.nowFile(), thenYear: this.thenYear, nowYear: this.nowYear });
    void this.router.navigate(['/upload'], { queryParams: { kind: 'thennow' } });
  }
}
