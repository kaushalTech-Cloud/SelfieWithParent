import { HttpClient } from '@angular/common/http';
import { Component, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { FeaturesService } from '../../core/features.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { siteImage } from '../../core/site-images';
import { FESTIVALS } from '../selfies/frame-festivals';
import { OpenContest } from '../community/contest.models';
import { ShowcaseKind, ShowcaseView } from './home-content';

/**
 * Home page: "What you can do with your selfie" — shows the photo frame, the reel, the Photo of the Week and the family tree
 * with a real selfie (the latest approved one; a sample picture until there is one), so a first-time visitor sees what they get.
 * The words, the order and which cards show come from the admin site (Home page › Photo features), over the built-in defaults.
 * Self-contained: remove <app-feature-showcase /> from home.html to take it off the page.
 */
@Component({
  selector: 'app-feature-showcase',
  imports: [RouterLink, TranslatePipe],
  template: `
    @if (cards().length) {
    <section class="showcase section" aria-labelledby="showcaseTitle">
      <div class="container">
        <div class="text-center mb-5">
          @if (content().eyebrow) { <span class="eyebrow text-accent">{{ content().eyebrow }}</span> }
          <h2 class="section-title" id="showcaseTitle">{{ content().title }}</h2>
          @if (content().intro) { <p class="sc-intro">{{ content().intro }}</p> }
        </div>

        <div class="sc-grid" [class.n3]="cards().length === 3" [class.n2]="cards().length <= 2">
          @for (c of cards(); track c.kind) {
            <article class="sc-card">
              @switch (c.kind) {
                @case ('frame') {
                  <div class="sc-art art-frame" aria-hidden="true">
                    <div class="sc-framed"><img [src]="photo()" alt=""><span>{{ name() }}</span></div>
                    <span class="sc-chip"><i class="bi bi-stars"></i> {{ '{count} festival frames' | t: { count: festivalCount } }}</span>
                  </div>
                }
                @case ('reel') {
                  <div class="sc-art art-reel" aria-hidden="true">
                    <div class="sc-phone">
                      <img [src]="photo()" alt="">
                      <span class="sc-play"><i class="bi bi-play-fill"></i></span>
                      <span class="sc-bar"><span></span></span>
                    </div>
                    <span class="sc-note n1"><i class="bi bi-music-note-beamed"></i></span><span class="sc-note n2"><i class="bi bi-music-note"></i></span>
                  </div>
                }
                @case ('contest') {
                  <div class="sc-art art-contest" aria-hidden="true">
                    <i class="bi bi-trophy-fill sc-trophy"></i>
                    <div class="sc-winner"><img [src]="photo()" alt=""></div>
                    @if (left(); as l) { <span class="sc-chip gold"><i class="bi bi-hourglass-split"></i> {{ l }}</span> }
                  </div>
                }
                @case ('tree') {
                  <div class="sc-art art-tree" aria-hidden="true">
                    <div class="sc-tree">
                      <div class="row1"><span></span><span></span><span></span><span></span></div>
                      <div class="row2"><span></span><span></span></div>
                      <div class="row3"><span class="me"><img [src]="photo()" alt=""></span></div>
                    </div>
                  </div>
                }
              }
              <div class="sc-body">
                <span class="sc-icon" [class.gold]="c.kind === 'contest'" [class.teal]="c.kind === 'tree'"><i class="bi" [class]="icons[c.kind]"></i></span>
                <h3>{{ c.title }}</h3>
                @if (c.text) { <p>{{ c.text }}</p> }
                @if (c.note) { <small><i class="bi" [class]="noteIcons[c.kind]"></i> {{ c.note }}</small> }
                <a class="btn btn-accent" [routerLink]="link(c.kind)">{{ c.button }} <i class="bi bi-arrow-right"></i></a>
              </div>
            </article>
          }
        </div>
      </div>
    </section>
    }`,
  styles: `
    .showcase { background: linear-gradient(180deg, #fff, #fbf6f1); }
    .showcase .eyebrow.text-accent { display: inline-flex; padding: .3rem .85rem; border-radius: 999px; background: #fde9df; }
    .sc-intro { color: var(--muted); max-width: 560px; margin: 0 auto; }
    .sc-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1.2rem; }
    .sc-card { display: flex; flex-direction: column; background: #fff; border: 1px solid #f0e6dd; border-radius: 26px; overflow: hidden;
      box-shadow: 0 24px 50px -34px rgba(60,30,20,.5); transition: transform .3s, box-shadow .3s; }
    .sc-card:hover { transform: translateY(-6px); box-shadow: 0 34px 60px -32px rgba(60,30,20,.55); }
    .sc-art { position: relative; height: 220px; display: grid; place-items: center; overflow: hidden; }
    .sc-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .sc-chip { position: absolute; left: .8rem; bottom: .8rem; display: inline-flex; align-items: center; gap: .35rem; padding: .25rem .7rem; border-radius: 999px;
      background: rgba(255,255,255,.9); color: var(--accent); font-size: .74rem; font-weight: 700; box-shadow: 0 6px 14px -8px rgba(0,0,0,.4); }
    .sc-chip.gold { color: #8a5a00; }
    /* Frame */
    .art-frame { background: radial-gradient(circle at 20% 20%, rgba(244,185,66,.35), transparent 50%), linear-gradient(135deg, #2b1a47, #6a2d5a); }
    .sc-framed { position: relative; width: 136px; height: 168px; padding: 9px 9px 30px; border-radius: 12px; transform: rotate(-4deg);
      background: linear-gradient(135deg, #f7b733, #f06543, #f7b733); box-shadow: 0 20px 34px -14px rgba(0,0,0,.6); transition: transform .4s; }
    .sc-framed img { border-radius: 8px; border: 3px solid #fff8ea; }
    .sc-framed span { position: absolute; left: 0; right: 0; bottom: 7px; text-align: center; color: #fff; font-family: "Playfair Display", serif; font-style: italic;
      font-size: .78rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 .4rem; }
    .sc-card:hover .sc-framed { transform: rotate(0) scale(1.05); }
    /* Reel */
    .art-reel { background: radial-gradient(circle at 80% 20%, rgba(244,185,66,.3), transparent 50%), linear-gradient(135deg, #3a1c4a, #7a2e5c 60%, var(--accent)); }
    .sc-phone { position: relative; width: 104px; height: 184px; padding: 6px; border-radius: 20px; background: #111; transform: rotate(5deg); box-shadow: 0 20px 34px -14px rgba(0,0,0,.65); overflow: hidden; }
    .sc-phone img { border-radius: 15px; animation: sc-zoom 6s ease-in-out infinite alternate; }
    .sc-play { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center;
      background: rgba(255,255,255,.9); color: var(--accent); font-size: 1.2rem; }
    .sc-bar { position: absolute; left: 14px; right: 14px; bottom: 14px; height: 3px; border-radius: 3px; background: rgba(255,255,255,.35); overflow: hidden; }
    .sc-bar span { display: block; height: 100%; width: 0; background: #fff; animation: sc-progress 6s linear infinite; }
    .sc-note { position: absolute; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: var(--gold); color: #3a1c4a; font-size: .85rem;
      animation: sc-float 4s ease-in-out infinite; }
    .sc-note.n1 { left: 22%; top: 22%; } .sc-note.n2 { right: 20%; bottom: 24%; background: #fff; color: var(--accent); animation-delay: -2s; }
    /* Contest */
    .art-contest { background: radial-gradient(circle at 50% 30%, rgba(247,183,51,.4), transparent 55%), linear-gradient(135deg, #1d1438, #4a1d4f); }
    .sc-trophy { position: absolute; top: 18px; right: 22px; font-size: 2.4rem; color: #f7b733; text-shadow: 0 6px 18px rgba(247,183,51,.6); animation: sc-float 5s ease-in-out infinite; }
    .sc-winner { width: 128px; height: 128px; border-radius: 50%; padding: 5px; background: linear-gradient(135deg, #ffe08a, #f7b733, #c98a00);
      box-shadow: 0 0 0 6px rgba(247,183,51,.18), 0 18px 34px -14px rgba(0,0,0,.6); }
    .sc-winner img { border-radius: 50%; }
    /* Family tree */
    .art-tree { background: radial-gradient(circle at 20% 80%, rgba(42,157,143,.25), transparent 50%), linear-gradient(135deg, #f3f9f8, #fdf3ea); }
    .sc-tree { display: grid; gap: 16px; justify-items: center; }
    .sc-tree > div { display: flex; gap: 10px; position: relative; }
    .sc-tree span { width: 30px; height: 30px; border-radius: 50%; background: #fff; border: 3px solid #f4b942; box-shadow: 0 6px 12px -8px rgba(0,0,0,.4); }
    .sc-tree .row2 span { width: 38px; height: 38px; border-color: #2a9d8f; }
    .sc-tree .row1::after, .sc-tree .row2::after { content: ""; position: absolute; left: 50%; bottom: -14px; width: 2px; height: 12px; background: #d8c3b0; }
    .sc-tree .me { width: 62px; height: 62px; border-color: var(--accent); overflow: hidden; padding: 0; }
    .sc-tree .me img { border-radius: 50%; }
    .sc-body { position: relative; display: flex; flex-direction: column; gap: .4rem; flex: 1; padding: 1.6rem 1.3rem 1.3rem; }
    .sc-icon { position: absolute; top: -24px; left: 1.3rem; width: 48px; height: 48px; border-radius: 16px; display: grid; place-items: center; font-size: 1.3rem; color: #fff;
      background: linear-gradient(135deg, var(--accent), var(--gold)); box-shadow: 0 0 0 4px #fff, 0 12px 22px -10px var(--accent); }
    .sc-icon.gold { background: linear-gradient(135deg, #ffd36e, #c98a00); }
    .sc-icon.teal { background: linear-gradient(135deg, var(--primary), #2a9d8f); }
    .sc-body h3 { font-size: 1.2rem; color: var(--primary-dark); margin: .6rem 0 0; }
    .sc-body p { color: var(--muted); font-size: .9rem; margin: 0; }
    .sc-body small { color: var(--accent); font-weight: 600; font-size: .78rem; }
    .sc-body .btn { margin-top: auto; align-self: flex-start; border-radius: 999px; padding: .55rem 1.1rem; font-size: .88rem; }
    .sc-body small + .btn { margin-top: .9rem; }
    .sc-body .btn i { transition: transform .2s; }
    .sc-card:hover .sc-body .btn i { transform: translateX(3px); }
    @keyframes sc-zoom { from { transform: scale(1); } to { transform: scale(1.18); } }
    @keyframes sc-progress { from { width: 0; } to { width: 100%; } }
    @keyframes sc-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
    .sc-grid.n3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .sc-grid.n2 { grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: 760px; margin: 0 auto; }
    @media (max-width: 1199.98px) { .sc-grid, .sc-grid.n3 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 575.98px) { .sc-grid, .sc-grid.n3, .sc-grid.n2 { grid-template-columns: 1fr; } .sc-art { height: 200px; } }
    @media (prefers-reduced-motion: reduce) {
      .sc-phone img, .sc-bar span, .sc-note, .sc-trophy { animation: none; }
      .sc-card, .sc-framed { transition: none; }
    }
  `
})
export class FeatureShowcase {
  readonly content = input.required<ShowcaseView>();
  private readonly features = inject(FeaturesService);
  /** The cards to show: staff's choice, minus features switched off in Site features. */
  protected readonly cards = computed(() => this.content().cards.filter(c =>
    this.features.on(({ frame: 'photo-frames', reel: 'reels', contest: 'contest', tree: 'family-tree' } as const)[c.kind])));
  protected readonly icons: Record<ShowcaseKind, string> = { frame: 'bi-image', reel: 'bi-camera-reels', contest: 'bi-trophy', tree: 'bi-diagram-3' };
  protected readonly noteIcons: Record<ShowcaseKind, string> = { frame: 'bi-download', reel: 'bi-music-note-beamed', contest: 'bi-heart-fill', tree: 'bi-download' };
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);

  protected readonly festivalCount = FESTIVALS.length;
  /** The latest approved photo selfie: its picture shows on every card, and Frame / Reel open on it. */
  private readonly sample = signal<{ id: string; photoId: string; name: string } | null>(null);
  private readonly contest = signal<OpenContest | null>(null);
  private readonly now = signal(Date.now());

  protected readonly photo = computed(() => {
    const s = this.sample();
    return s ? `${environment.apiBaseUrl}/api/v1/selfies/files/${s.photoId}` : siteImage('selfie-1.svg');
  });
  protected readonly name = computed(() => this.sample()?.name ?? this.i18n.t('Selfie with Parent'));
  /** "3 days left" / "Ends today" for this week's contest. */
  protected readonly left = computed(() => {
    const c = this.contest()?.contest;
    if (!c) return '';
    const ms = new Date(c.endsAtUtc + 'Z').getTime() - this.now();
    if (ms <= 0) return '';
    const days = Math.floor(ms / 86_400_000);
    return days >= 1 ? this.i18n.t('{n} days left', { n: days }) : this.i18n.t('Ends today');
  });

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    this.http.get<{ items: { publicId: string; photoId: string | null; kind: string; firstName: string; parentName: string }[] }>(
      `${environment.apiBaseUrl}/api/v1/selfies/gallery`, { params: { tab: 'latest', pageSize: 6 } }).subscribe({
      next: r => {
        const x = r.items.find(i => i.photoId);
        if (x) this.sample.set({ id: x.publicId, photoId: x.photoId!, name: x.kind === 'family' ? x.parentName : this.i18n.t('{name} with {parent}', { name: x.firstName, parent: x.parentName }) });
      },
      error: () => { /* the sample picture stays */ }
    });
    this.http.get<{ contests: OpenContest[] }>(`${environment.apiBaseUrl}/api/v1/contests/current`).subscribe({
      next: r => this.contest.set(r.contests.find(c => c.contest.kind === 'week') ?? r.contests[0] ?? null),
      error: () => { /* no countdown */ }
    });
  }

  /** Frame / reel open on the latest selfie; the gallery until there is one. */
  protected link(kind: ShowcaseKind): unknown[] {
    if (kind === 'contest') return ['/contest'];
    if (kind === 'tree') return ['/family-tree'];
    const s = this.sample();
    return s ? ['/selfies', s.id, kind] : ['/selfies'];
  }
}
