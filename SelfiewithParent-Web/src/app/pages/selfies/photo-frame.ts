import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, OnInit, PLATFORM_ID, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { countryList } from '../../shared/places';

import { FRAME_DESIGNS, FRAME_PALETTES, FRAME_SHAPES, FrameDesign, FramePalette, FrameShape, drawFrame } from './frame-draw';
import { FESTIVALS, Festival, WINNER_FRAME, festivalSwatch, festivalsFor } from './frame-festivals';

export * from './frame-draw';
export * from './frame-festivals';

/**
 * The photo frame studio (on the selfie's frame page): pick a design, a colour and a size, see the preview, and download it.
 * Everything is drawn in the browser; nothing is uploaded.
 */
@Component({
  selector: 'app-photo-frame',
  imports: [TranslatePipe, RouterLink],
  template: `
    <div class="frame-layout">
      <div class="frame-preview">
        <div class="frame-stage">
        <canvas #canvas [attr.aria-label]="'Photo frame preview' | t" role="img"></canvas>
        @if (loading()) { <div class="frame-loading"><span class="spinner-border"></span></div> }
        </div>
      </div>
      <div class="frame-controls">
        <div class="frame-modes" role="tablist" [class.three]="wins().length">
          @if (wins().length) {
            <button type="button" role="tab" class="seg seg-win" [class.on]="winner()"
                    [attr.aria-selected]="winner()" (click)="winner.set(true); festive.set(false)"><i class="bi bi-trophy-fill"></i> {{ 'Winner' | t }}</button>
          }
          <button type="button" role="tab" class="seg" [class.on]="!festive() && !winner()"
                  [attr.aria-selected]="!festive() && !winner()" (click)="festive.set(false); winner.set(false)"><i class="bi bi-heart"></i> {{ 'Everyday' | t }}</button>
          <button type="button" role="tab" class="seg" [class.on]="festive()"
                  [attr.aria-selected]="festive()" (click)="festive.set(true); winner.set(false)"><i class="bi bi-stars"></i> {{ 'Festivals & events' | t }}</button>
        </div>
        @if (winner()) {
          @if (wins().length > 1) {
            <label class="frame-label d-block" for="frameWin">{{ 'Which win' | t }}</label>
            <select class="form-select form-select-sm" id="frameWin" [value]="winIndex()" (change)="winIndex.set(+$any($event.target).value)">
              @for (w of wins(); track $index) { <option [value]="$index">{{ winTitle(w) }} · {{ winDays(w) }}</option> }
            </select>
          }
          <p class="small text-muted mt-2 mb-0"><i class="bi bi-trophy"></i> {{ 'A golden frame for your winning selfie. Congratulations!' | t }}</p>
        } @else if (festive()) {
          <label class="frame-label d-block" for="frameCountry">{{ 'Country' | t }}</label>
          <select class="form-select form-select-sm" id="frameCountry" [value]="country()" (change)="pickCountry($any($event.target).value)">
            <option value="">{{ 'All countries' | t }}</option>
            @for (c of countries(); track c.code) { <option [value]="c.code">{{ c.name }}</option> }
          </select>
          <h2 class="frame-label">{{ 'Festival or event' | t }}</h2>
          <div class="frame-festivals" role="group" [attr.aria-label]="'Festival or event' | t">
            @for (f of festivals(); track f.id) {
              <button type="button" class="frame-festival" [class.on]="f.id === festival().id" [attr.aria-pressed]="f.id === festival().id" (click)="festival.set(f)">
                <span class="dot" [style.background]="swatch(f)"><i class="bi" [class]="f.icon"></i></span>{{ f.name | t }}
              </button>
            }
          </div>
        } @else {
        <h2 class="frame-label">{{ 'Design' | t }}</h2>
        <div class="frame-designs" role="group" [attr.aria-label]="'Design' | t">
          @for (d of designs; track d.id) {
            <button type="button" class="opt" [class.on]="d.id === design()"
                    [attr.aria-pressed]="d.id === design()" (click)="design.set(d.id)"><i class="bi" [class]="d.icon"></i><span>{{ d.name | t }}</span></button>
          }
        </div>
        <h2 class="frame-label">{{ 'Colour' | t }} · <span class="text-muted fw-normal">{{ palette().name | t }}</span></h2>
        <div class="frame-swatches" role="group" [attr.aria-label]="'Colour' | t">
          @for (p of palettes; track p.id) {
            <button type="button" class="frame-swatch" [class.on]="p.id === palette().id" [attr.aria-pressed]="p.id === palette().id"
                    [attr.aria-label]="p.name | t" [title]="p.name | t" (click)="palette.set(p)"
                    [style.background]="'linear-gradient(135deg,' + p.bg[0] + ' 0 50%,' + p.accent + ' 50% 100%)'">@if (p.id === palette().id) { <i class="bi bi-check-lg"></i> }</button>
          }
        </div>
        }
        <h2 class="frame-label">{{ 'Size' | t }}</h2>
        <div class="frame-sizes" role="group" [attr.aria-label]="'Size' | t">
          @for (s of shapes; track s.id) {
            <button type="button" class="opt" [class.on]="s.id === shape()"
                    [attr.aria-pressed]="s.id === shape()" (click)="shape.set(s.id)"><i class="bi" [class]="s.icon"></i><span>{{ s.name | t }}</span></button>
          }
        </div>
        <div class="frame-download">
          <button type="button" class="btn btn-accent btn-lg w-100" (click)="download()" [disabled]="loading() || failed()">
            <i class="bi bi-download"></i> {{ 'Download HD picture' | t }}
          </button>
          @if (canShareFiles) {
            <button type="button" class="btn btn-outline-accent w-100 mt-2 frame-share-apps" (click)="shareApps()" [disabled]="loading() || failed()">
              <i class="bi bi-share"></i> {{ 'Share the picture' | t }} <small class="d-block fw-normal">{{ 'WhatsApp, Instagram, Facebook… with the link' | t }}</small>
            </button>
          }
        </div>
        @if (failed()) { <div class="small text-danger mt-2" role="alert">{{ "We couldn't load the photo. Please try again." | t }}</div> }
        <p class="small text-muted mt-2 mb-0">{{ 'Made on your device — share it on WhatsApp, Instagram or print it.' | t }}</p>

        <!-- Share to the Photo Frames gallery: the selfie's owner only, reviewed first -->
        @if (selfieId()) {
          <div class="frame-share">
            @if (!auth.isSignedIn()) {
              <p class="small text-muted mb-0"><i class="bi bi-images"></i> {{ 'Is this your selfie?' | t }}
                <a routerLink="/login" [queryParams]="{ returnUrl: '/selfies/' + selfieId() + '/frame' }">{{ 'Sign in to share it in the Photo Frames gallery.' | t }}</a></p>
            } @else if (canShare()) {
              @if (sharedStatus(); as st) {
                <div class="small text-success" role="status"><i class="bi bi-check-circle"></i>
                  {{ (st === 'Approved' ? 'This frame is in the Photo Frames gallery.' : 'Shared! Our team will review it before it shows in the Photo Frames gallery.') | t }}</div>
              } @else {
                <button type="button" class="btn btn-outline-accent w-100" (click)="share()" [disabled]="loading() || failed() || sharing()">
                  @if (sharing()) { <span class="spinner-border spinner-border-sm"></span> } @else { <i class="bi bi-images"></i> }
                  {{ 'Share to the Photo Frames gallery' | t }}
                </button>
                <p class="small text-muted mt-1 mb-0">{{ 'Our team reviews it first. It shows with your first name, town and country.' | t }}</p>
              }
              @if (shareError()) { <div class="small text-danger mt-1" role="alert">{{ shareError() }}</div> }
            } @else if (shareChecked()) {
              <p class="small text-muted mb-0"><i class="bi bi-info-circle"></i> {{ 'Only the person who shared this selfie can post it to the Photo Frames gallery. You can still download it.' | t }}</p>
            }
          </div>
        }
      </div>
    </div>`,
  styles: `
    .frame-layout { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: clamp(1rem, 3vw, 2rem); align-items: start; }
    .frame-preview { position: sticky; top: 90px; }
    .frame-stage { position: relative; display: flex; justify-content: center; align-items: center; min-height: 320px; padding: clamp(1rem, 3vw, 2rem); border-radius: 28px;
      background: radial-gradient(circle at 20% 15%, rgba(244,185,66,.22), transparent 45%), radial-gradient(circle at 85% 85%, rgba(232,106,61,.16), transparent 45%), linear-gradient(135deg, #fff7f0, #f6efe8);
      border: 1px solid #f0e4da; }
    .frame-stage canvas { max-width: 100%; max-height: 74vh; width: auto; height: auto; border-radius: 10px; box-shadow: 0 26px 50px -22px rgba(40,20,10,.55); }
    .frame-loading { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(255,250,246,.6); border-radius: 28px; }
    .frame-controls { background: #fff; border: 1px solid #f0e4da; border-radius: 24px; padding: clamp(1rem, 2.5vw, 1.6rem); box-shadow: 0 16px 40px -26px rgba(60,30,20,.35); }
    .frame-label { font-size: .78rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 1.4rem 0 .6rem; }
    .frame-label .text-muted { text-transform: none; letter-spacing: 0; }
    .frame-label:first-child { margin-top: 0; }
    .frame-modes { display: grid; grid-template-columns: 1fr 1fr; gap: .25rem; padding: .3rem; border-radius: 999px; background: #f6efe9; margin-bottom: .6rem; }
    .frame-modes.three { grid-template-columns: repeat(3, 1fr); }
    .seg { border: 0; background: transparent; border-radius: 999px; padding: .55rem .6rem; font-weight: 600; font-size: .86rem; color: var(--ink);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: background .2s, color .2s, box-shadow .2s; }
    .seg.on { background: #fff; color: var(--accent); box-shadow: 0 4px 12px -4px rgba(60,30,20,.3); }
    .seg-win.on { color: #9a6a00; }
    .seg-win i { color: #f2a81a; }
    .frame-designs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem; }
    .frame-sizes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem; }
    .opt { display: flex; flex-direction: column; align-items: center; gap: .3rem; padding: .7rem .4rem; border-radius: 16px; border: 1px solid #efe4da; background: #fff;
      color: var(--ink); font-size: .8rem; font-weight: 600; line-height: 1.2; text-align: center; transition: border-color .15s, box-shadow .15s, transform .15s; }
    .opt i { font-size: 1.3rem; color: var(--accent); }
    .opt span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .opt:hover { border-color: var(--accent); transform: translateY(-1px); }
    .opt.on { border-color: var(--accent); background: #fff5ef; box-shadow: 0 0 0 2px var(--accent); }
    .frame-swatches { display: flex; flex-wrap: wrap; gap: .6rem; }
    .frame-swatch { width: 2.6rem; height: 2.6rem; border-radius: 50%; border: 3px solid #fff; padding: 0; box-shadow: 0 0 0 1px rgba(0,0,0,.12), 0 4px 10px -4px rgba(0,0,0,.3);
      display: grid; place-items: center; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.6); transition: transform .15s; }
    .frame-swatch:hover { transform: scale(1.08); }
    .frame-swatch.on { box-shadow: 0 0 0 3px var(--accent), 0 4px 10px -4px rgba(0,0,0,.3); }
    .frame-download { margin-top: 1.6rem; }
    .frame-download .btn { border-radius: 16px; font-weight: 700; box-shadow: 0 12px 24px -12px var(--accent); }
    .frame-share { margin-top: 1.2rem; padding: 1rem; border-radius: 16px; background: #faf6f2; }
    .frame-festivals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; max-height: 22rem; overflow-y: auto; padding: 3px; }
    .frame-festival { display: flex; align-items: center; gap: .55rem; text-align: start; font-size: .84rem; line-height: 1.2; font-weight: 500;
      border: 1px solid #efe4da; border-radius: 14px; background: #fff; padding: .45rem .55rem; color: inherit; transition: border-color .15s; }
    .frame-festival:hover { border-color: var(--accent); }
    .frame-festival.on { border-color: var(--accent); background: #fff5ef; box-shadow: 0 0 0 2px var(--accent); font-weight: 600; }
    .frame-festival .dot { flex: 0 0 2rem; height: 2rem; border-radius: 50%; display: grid; place-items: center; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.5); }
    /* Tablets and phones: the preview on top, the choices under it, and the download button always in reach */
    @media (max-width: 991.98px) {
      .frame-layout { grid-template-columns: 1fr; gap: 1rem; }
      .frame-preview { position: static; }
      .frame-stage canvas { max-height: 60vh; }
    }
    @media (max-width: 767.98px) {
      .frame-stage { border-radius: 20px; min-height: 0; padding: .8rem; }
      .frame-controls { border-radius: 20px; }
      .frame-download { position: sticky; bottom: 0; z-index: 5; margin: 1.25rem -1rem -1rem; padding: .75rem 1rem;
        background: rgba(255,255,255,.92); backdrop-filter: blur(8px); border-radius: 0 0 20px 20px; box-shadow: 0 -6px 18px rgba(0,0,0,.08); }
      .frame-designs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (prefers-reduced-motion: reduce) { .opt, .frame-swatch, .seg { transition: none; } }
  `
})
export class PhotoFrame implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly platform = inject(PLATFORM_ID);

  readonly photoUrl = input.required<string>();
  readonly title = input.required<string>();
  /** "Kochi, Kerala · 28 October 2026" */
  readonly line = input('');
  readonly message = input('');
  /** The contests this photo won (the Winner tab, open first). */
  readonly wins = input<{ kind: string; title: string; startsAtUtc: string; endsAtUtc: string }[]>([]);
  protected readonly winner = signal(false);
  protected readonly winIndex = signal(0);
  protected winTitle(w: { kind: string; title: string }): string { return w.kind === 'week' ? this.i18n.t('Photo of the Week') : w.title; }
  protected winDays(w: { startsAtUtc: string; endsAtUtc: string }): string {
    const f = new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return `${f.format(new Date(w.startsAtUtc + 'Z'))} – ${f.format(new Date(new Date(w.endsAtUtc + 'Z').getTime() - 86_400_000))}`;
  }

  /** The selfie (to share the frame to the Photo Frames gallery; its owner only). */
  readonly selfieId = input<string | null>(null);

  protected readonly palettes = FRAME_PALETTES;
  protected readonly shapes = FRAME_SHAPES;
  protected readonly designs = FRAME_DESIGNS;
  protected readonly design = signal<FrameDesign>('arch');

  // Festivals & events: the visitor's country (guessed from the time zone) first, any country on request
  private readonly i18n = inject(I18nService);
  protected readonly festive = signal(false);
  protected readonly countries = computed(() => {
    const used = new Set(FESTIVALS.flatMap(f => f.countries === 'all' ? [] : f.countries));
    return countryList(this.i18n.lang()).filter(c => used.has(c.code));
  });
  protected readonly country = signal('');
  protected readonly festivals = computed(() => festivalsFor(this.country()));
  protected readonly festival = signal<Festival>(FESTIVALS[0]);
  protected swatch(f: Festival): string { return festivalSwatch(f); }

  // Sharing to the Photo Frames gallery
  protected readonly auth = inject(AuthService);
  protected readonly canShare = signal(false);
  /** The owner check has answered (so a non-owner sees why there's no share button). */
  protected readonly shareChecked = signal(false);
  private readonly shared = signal<{ style: string; status: string }[]>([]);
  protected readonly sharing = signal(false);
  protected readonly shareError = signal('');
  /** e.g. "arch-marigold" or "festival-diwali" */
  protected readonly style = computed(() => this.winner() ? 'winner-gold'
    : this.festive() ? `festival-${this.festival().id}` : `${this.design()}-${this.palette().id}`);
  /** Pending / Approved when this exact frame has been shared already. */
  protected readonly sharedStatus = computed(() => this.shared().find(s => s.style === this.style())?.status ?? null);

  /** A country shows its festivals; the chosen one stays if that country celebrates it too. */
  protected pickCountry(code: string): void {
    this.country.set(code);
    if (!this.festivals().some(f => f.id === this.festival().id)) this.festival.set(this.festivals()[0]);
  }
  protected readonly palette = signal<FramePalette>(FRAME_PALETTES[0]);
  protected readonly shape = signal<FrameShape>('portrait');
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  private readonly photo = signal<ImageBitmap | null>(null);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    effect(() => this.draw());
  }

  // In the browser only: the server can't draw pictures (the page shows the spinner until the browser takes over)
  ngOnInit(): void {
    if (!isPlatformBrowser(this.platform)) return;
    const guess = this.i18n.guessCountry();
    if (this.countries().some(c => c.code === guess)) this.pickCountry(guess);
    if (this.wins().length) this.winner.set(true);   // a winning photo opens on its golden frame
    void this.load();
    void this.loadShareState();
  }

  /** Whether I can share this selfie in a frame (it's my own approved photo selfie), and what I've shared of it. */
  private async loadShareState(): Promise<void> {
    const id = this.selfieId();
    if (!id) return;
    await this.auth.init();
    if (!this.auth.isSignedIn()) return;
    try {
      const r = await firstValueFrom(this.http.get<{ canShare: boolean; shared: { style: string; status: string }[] }>(
        `${environment.apiBaseUrl}/api/v1/selfies/${id}/frames/mine`));
      this.canShare.set(r.canShare);
      this.shared.set(r.shared);
      this.shareChecked.set(true);
    } catch { /* no share button */ }
  }

  /** Sends the framed picture (as shown) to the review queue. */
  protected async share(): Promise<void> {
    const el = this.canvas()?.nativeElement;
    const id = this.selfieId();
    if (!el || !id || this.sharing()) return;
    this.sharing.set(true);
    this.shareError.set('');
    try {
      this.draw();
      const blob = await new Promise<Blob | null>(r => el.toBlob(r, 'image/jpeg', 0.9));
      if (!blob) throw new Error('no picture');
      const body = new FormData();
      body.append('Picture', new File([blob], 'frame.jpg', { type: 'image/jpeg' }));
      body.append('Style', this.style());
      if (this.festive()) body.append('Festival', this.festival().id);
      const style = this.style();
      // Approved straight away when staff have switched auto-approve on; otherwise it waits for review
      const r = await firstValueFrom(this.http.post<{ status?: string }>(`${environment.apiBaseUrl}/api/v1/selfies/${id}/frames`, body));
      this.shared.update(s => [...s, { style, status: r?.status ?? 'Pending' }]);
    } catch (e) {
      const err = e instanceof HttpErrorResponse ? e.error : null;
      this.shareError.set(err?.title ?? (err?.errors ? Object.values(err.errors as Record<string, string[]>).flat()[0] : null)
        ?? this.i18n.t("We couldn't share it. Please try again."));
    } finally {
      this.sharing.set(false);
    }
  }

  ngOnDestroy(): void { this.photo()?.close(); }

  /** The photo is fetched with CORS, so the picture can be saved (an image from the API would "taint" the canvas otherwise). */
  private async load(): Promise<void> {
    try {
      // Its own address: the page's <img> already cached this photo without CORS headers, and the browser would reuse that copy
      const blob = await firstValueFrom(this.http.get(this.photoUrl(), { responseType: 'blob', params: { use: 'frame' } }));
      this.photo.set(await createImageBitmap(blob));
      await document.fonts?.load(`700 64px "Playfair Display"`).catch(() => undefined);
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected draw(): void {
    if (!isPlatformBrowser(this.platform)) return;   // the server can't draw (no canvas there)
    const el = this.canvas()?.nativeElement;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const s = FRAME_SHAPES.find(x => x.id === this.shape())!;
    el.width = s.w;
    el.height = s.h;
    const text = { title: this.title(), line: this.line(), message: this.message(), tag: '#SelfieWithParent',
      site: environment.siteUrl.replace(/^https?:\/\/(www\.)?/, '') };
    const win = this.winner() ? this.wins()[this.winIndex()] : null;
    if (win) {
      drawFrame(ctx, s.w, s.h, WINNER_FRAME.palette, this.photo(), {
        ...text, greeting: `${this.winTitle(win)} · ${this.i18n.t('Winner')}`, line: this.winDays(win)
      }, WINNER_FRAME.window, WINNER_FRAME);
    } else if (this.festive()) {
      const f = this.festival();
      drawFrame(ctx, s.w, s.h, f.palette, this.photo(), { ...text, greeting: this.i18n.t(f.greeting) }, f.window, f);
    } else {
      drawFrame(ctx, s.w, s.h, this.palette(), this.photo(), text, this.design());
    }
  }

  /** The phone can share files: the framed picture goes straight to WhatsApp / Instagram / Facebook, with the link. */
  protected readonly canShareFiles = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'
    && (() => { try { return navigator.canShare({ files: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })] }); } catch { return false; } })();

  protected shareApps(): void {
    const el = this.canvas()?.nativeElement;
    if (!el) return;
    this.draw();
    el.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], 'selfie-with-parent-frame.jpg', { type: 'image/jpeg' });
      const url = this.selfieId() ? `${location.origin}/selfies/${this.selfieId()}` : location.origin;
      navigator.share({ files: [file], title: this.title(), text: `${this.title()}
#SelfieWithParent
${url}` }).catch(() => { /* closed by the visitor */ });
    }, 'image/jpeg', 0.92);
  }

  protected download(): void {
    const el = this.canvas()?.nativeElement;
    if (!el) return;
    this.draw();
    el.toBlob(blob => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = this.winner() ? `selfie-with-parent-winner-${this.shape()}.jpg` : this.festive() ? `selfie-with-parent-${this.festival().id}-${this.shape()}.jpg`
        : `selfie-with-parent-${this.design()}-${this.palette().id}-${this.shape()}.jpg`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/jpeg', 0.92);
  }
}
