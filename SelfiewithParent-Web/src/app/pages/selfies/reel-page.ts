import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, RESPONSE_INIT, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { SeoService } from '../../core/seo.service';
import { ReelMaker } from './reel-maker';
import { DonatePill } from '../../shared/donate-pill';

interface ReelItem {
  publicId: string; kind: string; firstName: string; parentName: string; place: string | null; message: string | null;
  approvedAtUtc: string; photoId: string | null; voiceId?: string | null;
}

/** /selfies/:id/reel — make a short vertical video of an approved photo selfie (with its voice note and music). */
@Component({
  selector: 'app-reel-page',
  imports: [DonatePill, RouterLink, TranslatePipe, ReelMaker],
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
              <li class="breadcrumb-item active" aria-current="page">{{ 'Reel' | t }}</li>
            </ol>
          </nav>
          <!-- Hero: the selfie on a phone, with what the reel has -->
          <header class="reel-hero">
            <app-donate-pill />
            <span class="rh-glow g1" aria-hidden="true"></span><span class="rh-glow g2" aria-hidden="true"></span>
            <i class="bi bi-music-note-beamed rh-spark s1" aria-hidden="true"></i><i class="bi bi-heart-fill rh-spark s2" aria-hidden="true"></i><i class="bi bi-stars rh-spark s3" aria-hidden="true"></i>
            <div class="rh-text">
              <a class="rh-back" [routerLink]="['/selfies', s.publicId]"><i class="bi bi-arrow-left"></i> {{ 'Back to the story' | t }}</a>
              <span class="rh-eyebrow"><i class="bi bi-camera-reels"></i> {{ 'Reel' | t }}</span>
              <h1 class="rh-title">{{ 'Make a reel' | t }}</h1>
              <p>{{ 'A short vertical video for Instagram Reels and WhatsApp Status — with music, your frame and the name.' | t }}</p>
              <ul class="rh-stats">
                <li><i class="bi bi-phone"></i> {{ 'Vertical 9:16 video' | t }}</li>
                <li><i class="bi bi-music-note-beamed"></i> {{ 'Music & voice note' | t }}</li>
                <li><i class="bi bi-download"></i> {{ 'Free MP4 download' | t }}</li>
              </ul>
            </div>
            <div class="rh-art" aria-hidden="true">
              <div class="rh-phone"><img [src]="file(s.photoId!)" alt=""><span class="rh-play"><i class="bi bi-play-fill"></i></span><span class="rh-name">{{ title(s) }}</span></div>
              <span class="rh-note n1"><i class="bi bi-music-note"></i></span><span class="rh-note n2"><i class="bi bi-music-note-beamed"></i></span>
            </div>
          </header>
          <app-reel-maker [photoUrl]="file(s.photoId!)" [voiceUrl]="s.voiceId ? file(s.voiceId) : null" [title]="title(s)"
                          [message]="s.message ?? ''" [line]="line(s)" [selfieId]="s.publicId" />
        } @else {
          <div class="text-center py-5">
            <h1 class="section-title">{{ (state() === 'missing' ? 'Selfie not found' : "We couldn't load this page") | t }}</h1>
            <p class="text-muted">{{ (state() === 'missing' ? 'Reels are for approved photo selfies.' : 'Please check your connection and try again.') | t }}</p>
            <a class="btn btn-accent" routerLink="/selfies"><i class="bi bi-arrow-left"></i> {{ 'Latest Selfies' | t }}</a>
          </div>
        }
      </div>
    </main>`,
  styles: `
    .reel-hero { position: relative; overflow: hidden; isolation: isolate; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2rem; align-items: center;
      margin-bottom: 1.8rem; padding: clamp(1.4rem, 4vw, 2.8rem); border-radius: 28px; color: #fff;
      background: linear-gradient(120deg, #3a1c4a, #7a2e5c 50%, var(--accent)); box-shadow: 0 26px 50px -28px rgba(58,28,74,.8); }
    .rh-glow { position: absolute; z-index: -1; border-radius: 50%; filter: blur(10px); }
    .rh-glow.g1 { width: 320px; height: 320px; right: -80px; top: -120px; background: rgba(244,185,66,.3); }
    .rh-glow.g2 { width: 260px; height: 260px; left: 30%; bottom: -170px; background: rgba(42,157,143,.35); }
    .rh-spark { position: absolute; z-index: -1; color: rgba(255,255,255,.25); animation: rh-float 6s ease-in-out infinite; }
    .rh-spark.s1 { font-size: 1.5rem; left: 46%; top: 14%; color: rgba(244,185,66,.65); }
    .rh-spark.s2 { font-size: 1.1rem; left: 4%; bottom: 10%; animation-delay: -2s; }
    .rh-spark.s3 { font-size: 1.4rem; right: 30%; bottom: 12%; animation-delay: -4s; }
    @keyframes rh-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    .rh-back { display: inline-flex; align-items: center; gap: .4rem; padding: .4rem .9rem; margin-bottom: 1rem; border-radius: 999px; background: rgba(255,255,255,.12);
      border: 1px solid rgba(255,255,255,.3); color: #fff; font-weight: 600; font-size: .84rem; text-decoration: none; white-space: nowrap; }
    .rh-back:hover { background: #fff; color: #3a1c4a; }
    .rh-eyebrow { display: flex; width: fit-content; align-items: center; gap: .35rem; font-size: .72rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
      background: rgba(255,255,255,.15); border-radius: 999px; padding: .28rem .8rem; margin-bottom: .7rem; }
    .rh-eyebrow i, .rh-stats i { color: var(--gold); }
    .rh-title { font-family: "Playfair Display", serif; font-weight: 700; font-size: clamp(1.8rem, 4vw, 2.8rem); line-height: 1.12; color: #fff; margin: 0 0 .5rem; }
    .reel-hero p { opacity: .88; margin: 0 0 1.2rem; max-width: 540px; }
    .rh-stats { display: flex; flex-wrap: wrap; gap: .5rem; list-style: none; padding: 0; margin: 0; }
    .rh-stats li { display: inline-flex; align-items: center; gap: .4rem; font-size: .82rem; font-weight: 600; padding: .35rem .8rem; border-radius: 999px;
      background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.22); backdrop-filter: blur(6px); }
    .rh-art { position: relative; width: 190px; height: 300px; margin-right: 1.5rem; }
    .rh-phone { position: absolute; inset: 0; border-radius: 30px; padding: 8px; background: #111; transform: rotate(6deg); box-shadow: 0 26px 46px -18px rgba(0,0,0,.65); overflow: hidden; }
    .rh-phone img { width: 100%; height: 100%; object-fit: cover; border-radius: 23px; display: block; }
    .rh-phone::after { content: ""; position: absolute; inset: 8px; border-radius: 23px; background: linear-gradient(transparent 55%, rgba(0,0,0,.6)); }
    .rh-play { position: absolute; z-index: 1; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 52px; height: 52px; border-radius: 50%;
      background: rgba(255,255,255,.9); color: var(--accent); display: grid; place-items: center; font-size: 1.6rem; }
    .rh-name { position: absolute; z-index: 1; left: 18px; right: 18px; bottom: 22px; font-family: "Playfair Display", serif; font-weight: 700; font-size: .95rem;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rh-note { position: absolute; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: var(--gold); color: #3a1c4a;
      box-shadow: 0 8px 18px -8px rgba(0,0,0,.5); animation: rh-float 5s ease-in-out infinite; }
    .rh-note.n1 { left: -22px; top: 40px; }
    .rh-note.n2 { right: -18px; bottom: 60px; background: #fff; color: var(--accent); animation-delay: -2.5s; }
    @media (max-width: 767.98px) {
      .reel-hero { grid-template-columns: 1fr; border-radius: 22px; }
      .rh-art { display: none; }
    }
    @media (prefers-reduced-motion: reduce) { .rh-spark, .rh-note { animation: none; } }
  `
})
export class ReelPage {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly seo = inject(SeoService);
  private readonly response = inject(RESPONSE_INIT, { optional: true });

  protected readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  protected readonly item = signal<ReelItem | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');

  constructor() { effect(() => this.load(this.id())); }

  private load(id: string): void {
    this.item.set(null);
    if (!/^[0-9a-f-]{36}$/i.test(id)) { this.notFound(); return; }
    this.state.set('loading');
    this.http.get<{ item: ReelItem }>(`${environment.apiBaseUrl}/api/v1/selfies/${id}`).subscribe({
      next: r => {
        if (!r.item.photoId) { this.notFound(); return; }   // videos have no reel
        this.item.set(r.item);
        this.state.set('ready');
        this.seo.set({ title: `${this.title(r.item)} — ${this.i18n.t('Reel')}`, description: 'Make a short video of this selfie.', path: `/selfies/${id}/reel`, noIndex: true });
      },
      error: (e: HttpErrorResponse) => e.status === 404 ? this.notFound() : this.state.set('error')
    });
  }

  private notFound(): void {
    this.state.set('missing');
    if (this.response) this.response.status = 404;
    this.seo.set({ title: 'Selfie not found', description: 'This selfie is not available.', path: `/selfies/${this.id()}/reel`, noIndex: true });
  }

  protected title(s: ReelItem): string {
    return s.kind === 'family' ? s.parentName : this.i18n.t('{name} with {parent}', { name: s.firstName, parent: s.parentName });
  }

  protected line(s: ReelItem): string {
    let date: string;
    try { date = new Date(s.approvedAtUtc + 'Z').toLocaleDateString(this.i18n.locale(), { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { date = s.approvedAtUtc.slice(0, 10); }
    return (s.place ? `${s.place} · ` : '') + date;
  }

  protected file(id: string): string { return `${environment.apiBaseUrl}/api/v1/selfies/files/${id}`; }
}
