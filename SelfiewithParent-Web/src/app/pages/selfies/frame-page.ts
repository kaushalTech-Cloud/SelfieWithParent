import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, RESPONSE_INIT, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { SeoService } from '../../core/seo.service';
import { FESTIVALS, FRAME_DESIGNS, FRAME_PALETTES, PhotoFrame } from './photo-frame';
import { DonatePill } from '../../shared/donate-pill';

interface FrameItem {
  publicId: string; kind: string; firstName: string; parentName: string; place: string | null; message: string | null;
  approvedAtUtc: string; photoId: string | null;
}

/**
 * /selfies/:id/frame — a page (not a pop-up, so it works well on phones) where a visitor puts an approved
 * photo selfie in a frame: a design, a colour and a size, then downloads the picture. Opened from the story page.
 */
@Component({
  selector: 'app-frame-page',
  imports: [DonatePill, RouterLink, TranslatePipe, PhotoFrame],
  template: `
    <main id="main" class="section pt-4" tabindex="-1">
      <div class="container">
        @if (state() === 'loading') {
          <p class="text-center text-muted py-5"><span class="spinner-border spinner-border-sm"></span> {{ 'Loading…' | t }}</p>
        } @else if (item(); as s) {
          <nav [attr.aria-label]="'You are here' | t" class="mb-3">
            <ol class="breadcrumb small mb-0">
              <li class="breadcrumb-item"><a routerLink="/selfies">{{ 'Selfies' | t }}</a></li>
              <li class="breadcrumb-item"><a [routerLink]="['/selfies', s.publicId]">{{ title(s) }}</a></li>
              <li class="breadcrumb-item active" aria-current="page">{{ 'Photo frame' | t }}</li>
            </ol>
          </nav>
          <!-- Hero: the selfie in a tilted card, with what the studio offers -->
          <header class="frame-hero">
            <app-donate-pill />
            <span class="fh-glow g1" aria-hidden="true"></span><span class="fh-glow g2" aria-hidden="true"></span>
            <i class="bi bi-stars fh-spark s1" aria-hidden="true"></i><i class="bi bi-heart-fill fh-spark s2" aria-hidden="true"></i><i class="bi bi-flower1 fh-spark s3" aria-hidden="true"></i>
            <div class="fh-text">
              <a class="frame-back" [routerLink]="['/selfies', s.publicId]"><i class="bi bi-arrow-left"></i> {{ 'Back to the story' | t }}</a>
              <span class="frame-eyebrow"><i class="bi bi-image"></i> {{ 'Photo frame' | t }}</span>
              <h1 class="frame-title">{{ 'Download a photo frame' | t }}</h1>
              <p>{{ 'Pick a design, a colour and a size for “{name}”, then download it.' | t: { name: title(s) } }}</p>
              <ul class="fh-stats">
                <li><i class="bi bi-grid-1x2"></i> {{ '{count} designs' | t: { count: designCount } }}</li>
                <li><i class="bi bi-palette"></i> {{ '{count} colours' | t: { count: colourCount } }}</li>
                <li><i class="bi bi-stars"></i> {{ '{count} festival frames' | t: { count: festivalCount } }}</li>
                <li><i class="bi bi-download"></i> {{ 'Free HD download' | t }}</li>
              </ul>
            </div>
            <div class="fh-art" aria-hidden="true">
              <div class="fh-card back"></div>
              <div class="fh-card front"><img [src]="file(s.photoId!)" alt=""><span>{{ title(s) }}</span></div>
            </div>
          </header>
          <app-photo-frame [photoUrl]="file(s.photoId!)" [title]="title(s)" [message]="s.message ?? ''" [line]="line(s)" [selfieId]="s.publicId" [wins]="wins()" />
        } @else {
          <div class="text-center py-5">
            <h1 class="section-title">{{ (state() === 'missing' ? 'Selfie not found' : "We couldn't load this page") | t }}</h1>
            <p class="text-muted">{{ (state() === 'missing' ? 'Photo frames are for approved photo selfies.' : 'Please check your connection and try again.') | t }}</p>
            <a class="btn btn-accent" routerLink="/selfies"><i class="bi bi-arrow-left"></i> {{ 'Latest Selfies' | t }}</a>
          </div>
        }
      </div>
    </main>`,
  styles: `
    .frame-hero { position: relative; overflow: hidden; isolation: isolate; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2rem; align-items: center;
      margin-bottom: 1.8rem; padding: clamp(1.4rem, 4vw, 2.8rem); border-radius: 28px; color: #fff;
      background: linear-gradient(120deg, var(--primary-dark), var(--primary) 55%, #2a9d8f); box-shadow: 0 26px 50px -28px rgba(10,61,62,.75); }
    .fh-glow { position: absolute; z-index: -1; border-radius: 50%; filter: blur(10px); }
    .fh-glow.g1 { width: 320px; height: 320px; right: -80px; top: -120px; background: rgba(244,185,66,.3); }
    .fh-glow.g2 { width: 240px; height: 240px; left: 35%; bottom: -160px; background: rgba(232,106,61,.28); }
    .fh-spark { position: absolute; z-index: -1; color: rgba(255,255,255,.25); animation: fh-float 6s ease-in-out infinite; }
    .fh-spark.s1 { font-size: 1.6rem; left: 46%; top: 14%; color: rgba(244,185,66,.6); }
    .fh-spark.s2 { font-size: 1.1rem; left: 4%; bottom: 10%; animation-delay: -2s; }
    .fh-spark.s3 { font-size: 1.4rem; right: 30%; bottom: 12%; animation-delay: -4s; }
    @keyframes fh-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    .fh-text .frame-back { margin-bottom: 1rem; }
    .frame-eyebrow { display: flex; width: fit-content; align-items: center; gap: .35rem; font-size: .72rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
      color: #fff; background: rgba(255,255,255,.15); border-radius: 999px; padding: .28rem .8rem; margin-bottom: .7rem; }
    .frame-eyebrow i { color: var(--gold); }
    .frame-title { font-family: "Playfair Display", serif; font-weight: 700; font-size: clamp(1.8rem, 4vw, 2.8rem); line-height: 1.12; color: #fff; margin: 0 0 .5rem; }
    .frame-hero p { opacity: .88; margin: 0 0 1.2rem; max-width: 540px; }
    .fh-stats { display: flex; flex-wrap: wrap; gap: .5rem; list-style: none; padding: 0; margin: 0; }
    .fh-stats li { display: inline-flex; align-items: center; gap: .4rem; font-size: .82rem; font-weight: 600; padding: .35rem .8rem; border-radius: 999px;
      background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.22); backdrop-filter: blur(6px); }
    .fh-stats i { color: var(--gold); }
    .fh-art { position: relative; width: 230px; height: 260px; margin-right: 1rem; }
    .fh-card { position: absolute; border-radius: 18px; }
    .fh-card.back { inset: 14px 0 0 30px; background: linear-gradient(135deg, var(--gold), var(--accent)); transform: rotate(9deg); opacity: .9; }
    .fh-card.front { inset: 0 30px 14px 0; background: #fffdf8; padding: 10px 10px 34px; transform: rotate(-5deg); box-shadow: 0 22px 40px -16px rgba(0,0,0,.55); }
    .fh-card.front img { width: 100%; height: 100%; object-fit: cover; border-radius: 10px; display: block; }
    .fh-card.front span { position: absolute; left: 0; right: 0; bottom: 8px; text-align: center; font-family: "Playfair Display", serif; font-style: italic;
      font-size: .9rem; color: var(--primary-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 .6rem; }
    @media (max-width: 767.98px) {
      .frame-hero { grid-template-columns: 1fr; border-radius: 22px; }
      .fh-art { display: none; }
    }
    @media (prefers-reduced-motion: reduce) { .fh-spark { animation: none; } }
    .frame-back { display: inline-flex; align-items: center; gap: .4rem; padding: .4rem .9rem; border-radius: 999px; background: rgba(255,255,255,.12);
      border: 1px solid rgba(255,255,255,.3); color: #fff; font-weight: 600; font-size: .84rem; text-decoration: none; white-space: nowrap; }
    .frame-back:hover { background: #fff; color: var(--primary-dark); }
  `
})
export class FramePage {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly seo = inject(SeoService);
  private readonly response = inject(RESPONSE_INIT, { optional: true });

  protected readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  protected readonly item = signal<FrameItem | null>(null);
  protected readonly designCount = FRAME_DESIGNS.length;
  protected readonly colourCount = FRAME_PALETTES.length;
  protected readonly festivalCount = FESTIVALS.length;
  /** The contests this photo won: the frame studio opens on the golden Winner frame. */
  protected readonly wins = signal<{ kind: string; title: string; startsAtUtc: string; endsAtUtc: string }[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');

  constructor() {
    effect(() => this.load(this.id()));
  }

  private load(id: string): void {
    this.item.set(null);
    if (!/^[0-9a-f-]{36}$/i.test(id)) { this.notFound(); return; }
    this.state.set('loading');
    this.http.get<{ item: FrameItem; wins?: { kind: string; title: string; startsAtUtc: string; endsAtUtc: string }[] }>(`${environment.apiBaseUrl}/api/v1/selfies/${id}`).subscribe({
      next: r => {
        if (!r.item.photoId) { this.notFound(); return; }   // videos have no frame
        this.wins.set(r.wins ?? []);
        this.item.set(r.item);
        this.state.set('ready');
        this.seo.set({ title: `${this.title(r.item)} — ${this.i18n.t('Photo frame')}`, description: 'Download this selfie in a photo frame.',
          path: `/selfies/${id}/frame`, noIndex: true });
      },
      error: (e: HttpErrorResponse) => e.status === 404 ? this.notFound() : this.state.set('error')
    });
  }

  private notFound(): void {
    this.state.set('missing');
    if (this.response) this.response.status = 404;
    this.seo.set({ title: 'Selfie not found', description: 'This selfie is not available.', path: `/selfies/${this.id()}/frame`, noIndex: true });
  }

  /** Same title as the gallery and story page: "Kaushal with Mom and DAD"; a family shows its family name. */
  protected title(s: FrameItem): string {
    return s.kind === 'family' ? s.parentName : this.i18n.t('{name} with {parent}', { name: s.firstName, parent: s.parentName });
  }

  /** "Kochi, Kerala · 28 October 2026" in the visitor's language. */
  protected line(s: FrameItem): string {
    let date: string;
    try { date = new Date(s.approvedAtUtc + 'Z').toLocaleDateString(this.i18n.locale(), { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { date = s.approvedAtUtc.slice(0, 10); }
    return (s.place ? `${s.place} · ` : '') + date;
  }

  protected file(id: string): string { return `${environment.apiBaseUrl}/api/v1/selfies/files/${id}`; }
}
