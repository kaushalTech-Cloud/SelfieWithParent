import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { retry, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { SeoService } from '../../core/seo.service';
import { LikeShare } from '../../shared/like-share';
import { ContestInfo, ContestWinner, OpenContest, contestDays, contestTitle } from './contest.models';
import { DonatePill } from '../../shared/donate-pill';

/**
 * Community › Photo of the Week: the contests running now with their live leaderboards (tap ❤ to vote, share to ask
 * friends to vote), a countdown, and past winners. The most-liked photo approved during a contest wins.
 */
@Component({
  selector: 'app-contest',
  imports: [DonatePill, RouterLink, TranslatePipe, LikeShare],
  template: `
    <header class="page-hero contest-hero">
      <app-donate-pill />
      <span class="ch-glow g1" aria-hidden="true"></span><span class="ch-glow g2" aria-hidden="true"></span>
      <i class="bi bi-stars ch-spark s1" aria-hidden="true"></i><i class="bi bi-heart-fill ch-spark s2" aria-hidden="true"></i><i class="bi bi-star-fill ch-spark s3" aria-hidden="true"></i>
      <div class="container">
        <div class="ch-grid">
          <div>
            <span class="eyebrow"><i class="bi bi-heart-fill"></i> {{ 'Vote with a heart' | t }}</span>
            <h1><em>{{ 'Photo of the Week' | t }}</em></h1>
            <p class="lead">{{ 'Every week the most-liked selfie wins a winner badge, a certificate and a golden photo frame. Tap ❤ to vote, and share to ask friends to vote too.' | t }}</p>
            <ol class="ch-steps">
              <li><span>1</span> {{ 'Share a selfie' | t }}</li>
              <li><span>2</span> {{ 'Collect hearts' | t }}</li>
              <li><span>3</span> {{ 'Win a golden frame' | t }}</li>
            </ol>
          </div>
          <div class="ch-trophy" aria-hidden="true"><i class="bi bi-trophy-fill"></i></div>
        </div>
      </div>
    </header>

    <main id="main" class="pb-5" tabindex="-1">
      <div class="container">
        @if (state() === 'loading') {
          <p class="text-center text-muted py-5"><span class="spinner-border spinner-border-sm"></span> {{ 'Loading…' | t }}</p>
        } @else if (state() === 'error') {
          <p class="text-center text-muted py-5">{{ "We couldn't load the contest. Please try again." | t }}</p>
        } @else {
          @for (o of open(); track o.contest.publicId) {
            <section class="contest-box mb-5">
              <div class="d-flex flex-wrap align-items-end gap-2 mb-3">
                <div class="me-auto">
                  <span class="cb-kind">{{ (o.contest.kind === 'week' ? 'This week' : 'Festival contest') | t }} · {{ days(o.contest) }}</span>
                  <h2 class="section-title mb-0">{{ title(o.contest) }}</h2>
                </div>
                <div class="contest-clock" [attr.aria-label]="'Time left' | t"><i class="bi bi-hourglass-split"></i> {{ timeLeft(o.contest) }}</div>
              </div>
              <p class="small text-muted">{{ 'Selfies approved during the contest take part. Likes count until it ends; your own like on your selfie doesn\\'t count.' | t }}</p>
              @if (o.leaders.length) {
                <ol class="leaders list-unstyled">
                  @for (e of o.leaders; track e.item.publicId) {
                    <li class="leader" [class.top]="e.rank <= 3" [attr.data-rank]="e.rank">
                      <span class="rank">@if (e.rank <= 3) { {{ medal(e.rank) }} } @else { {{ e.rank }} }</span>
                      <a [routerLink]="['/selfies', e.item.publicId]" class="leader-photo">@if (e.item.photoId) { <img [src]="file(e.item.photoId)" [alt]="e.item.name" loading="lazy"> }</a>
                      <div class="leader-body">
                        <a [routerLink]="['/selfies', e.item.publicId]" class="fw-semibold">{{ e.item.name }}</a>
                        @if (e.item.place) { <small class="text-muted d-block">{{ e.item.place }}</small> }
                        <small class="votes"><i class="bi bi-heart-fill"></i> {{ e.votes }} {{ (e.votes === 1 ? 'vote' : 'votes') | t }}</small>
                      </div>
                      <app-like-share [id]="e.item.publicId" [likes]="e.item.likes ?? 0" [title]="e.item.name" [path]="'/selfies/' + e.item.publicId"
                                      [image]="e.item.photoId ? file(e.item.photoId) : null" [compact]="true" />
                    </li>
                  }
                </ol>
              } @else {
                <div class="text-center text-muted py-3">
                  <p class="mb-2">{{ 'No votes yet this week. Open a selfie and tap ❤ to vote!' | t }}</p>
                  <a class="btn btn-outline-accent btn-sm" routerLink="/selfies">{{ 'See the latest selfies' | t }}</a>
                </div>
              }
              <div class="d-flex flex-wrap gap-2 mt-3">
                <a class="btn btn-accent" routerLink="/upload"><i class="bi bi-upload"></i> {{ 'Share your selfie to take part' | t }}</a>
              </div>
            </section>
          }

          <section>
            <h2 class="section-title mb-3 winners-title"><span><i class="bi bi-award"></i></span> {{ 'Past winners' | t }}</h2>
            @if (winners().length) {
              <div class="winners-grid">
                @for (w of winners(); track w.contest.publicId) {
                  <a class="winner-card" [routerLink]="['/selfies', w.winner.publicId]">
                    <div class="winner-photo">
                      @if (w.winner.photoId) { <img [src]="file(w.winner.photoId)" [alt]="w.winner.name" loading="lazy"> }
                      <span class="winner-badge"><i class="bi bi-trophy-fill"></i> {{ title(w.contest) }}</span>
                    </div>
                    <div class="p-2">
                      <div class="fw-semibold">{{ w.winner.name }}</div>
                      <small class="text-muted">{{ days(w.contest) }} · <i class="bi bi-heart-fill text-accent"></i> {{ w.votes }}</small>
                    </div>
                  </a>
                }
              </div>
              @if (winners().length < winnersTotal()) {
                <div class="text-center mt-3"><button class="btn btn-outline-accent" type="button" (click)="moreWinners()">{{ 'Show more' | t }}</button></div>
              }
            } @else {
              <p class="text-muted">{{ 'The first winner will be announced when this week ends.' | t }}</p>
            }
          </section>
        }
      </div>
    </main>`,
  styles: `
    .contest-hero { position: relative; overflow: hidden; isolation: isolate; text-align: start; padding: clamp(56px, 8vw, 96px) 0 clamp(70px, 9vw, 110px);
      background: radial-gradient(circle at 80% 30%, rgba(247,183,51,.35), transparent 40%), linear-gradient(125deg, #1d1438, #4a1d4f 55%, #8a2f4a); }
    .ch-glow { position: absolute; z-index: -1; border-radius: 50%; filter: blur(14px); }
    .ch-glow.g1 { width: 360px; height: 360px; right: -60px; top: -120px; background: rgba(247,183,51,.3); }
    .ch-glow.g2 { width: 300px; height: 300px; left: -80px; bottom: -170px; background: rgba(240,101,67,.3); }
    .ch-spark { position: absolute; z-index: -1; color: rgba(247,183,51,.55); animation: ch-float 6s ease-in-out infinite; }
    .ch-spark.s1 { font-size: 1.8rem; left: 48%; top: 16%; }
    .ch-spark.s2 { font-size: 1.1rem; left: 6%; bottom: 14%; color: rgba(240,101,67,.6); animation-delay: -2s; }
    .ch-spark.s3 { font-size: 1rem; right: 8%; bottom: 18%; animation-delay: -4s; }
    @keyframes ch-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    .ch-grid { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2rem; align-items: center; }
    .contest-hero .eyebrow { display: inline-flex; align-items: center; gap: .4rem; padding: .35rem .95rem; border-radius: 999px;
      background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.22); }
    .contest-hero .eyebrow i { color: #ff8a8a; }
    .contest-hero h1 { font-size: clamp(2.5rem, 6vw, 4.2rem); line-height: 1.05; margin: 1rem 0 .8rem; }
    .contest-hero h1 em { background: linear-gradient(90deg, #ffe08a, #f7b733, #ffd36e); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .contest-hero .lead { margin: 0; max-width: 580px; }
    .ch-steps { display: flex; flex-wrap: wrap; gap: .5rem; list-style: none; padding: 0; margin: 1.5rem 0 0; }
    .ch-steps li { display: inline-flex; align-items: center; gap: .5rem; padding: .35rem .9rem .35rem .35rem; border-radius: 999px; font-size: .86rem; font-weight: 600;
      background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); backdrop-filter: blur(6px); }
    .ch-steps span { width: 1.6rem; height: 1.6rem; border-radius: 50%; display: grid; place-items: center; background: #f7b733; color: #3d2f12; font-size: .8rem; font-weight: 800; }
    .ch-trophy { width: 190px; height: 190px; margin-right: 1rem; border-radius: 50%; display: grid; place-items: center; font-size: 6rem; color: #f7b733;
      background: radial-gradient(circle, rgba(247,183,51,.25), rgba(247,183,51,.05) 60%, transparent 70%); text-shadow: 0 10px 30px rgba(247,183,51,.5);
      animation: ch-float 5s ease-in-out infinite; }

    .contest-box { position: relative; margin-top: -48px; z-index: 2; padding: clamp(1.2rem, 3vw, 2rem); border-radius: 28px; background: #fff;
      border: 1px solid #f0e6dd; box-shadow: 0 30px 60px -36px rgba(29,20,56,.55); overflow: hidden; }
    .contest-box::before { content: ""; position: absolute; inset: 0 0 auto; height: 5px; background: linear-gradient(90deg, #f7b733, var(--accent), #8a2f4a); }
    .contest-box + .contest-box { margin-top: 0; }
    .cb-kind { display: inline-flex; padding: .3rem .85rem; border-radius: 999px; background: #fff3d6; color: #8a5a00; font-size: .75rem; font-weight: 700;
      letter-spacing: .08em; text-transform: uppercase; margin-bottom: .4rem; }
    .contest-clock { display: inline-flex; align-items: center; gap: .45rem; background: linear-gradient(135deg, #1d1438, #4a1d4f); color: #ffd36e; border-radius: 999px;
      padding: .5rem 1.1rem; font-weight: 700; font-variant-numeric: tabular-nums; box-shadow: 0 12px 24px -14px rgba(29,20,56,.8); }
    .leaders { display: grid; gap: .6rem; margin: 0; }
    .leader { display: grid; grid-template-columns: 2.6rem 4.2rem 1fr auto; align-items: center; gap: .85rem; padding: .6rem .9rem; border-radius: 18px;
      background: #faf7f4; border: 1px solid #f2ebe4; transition: transform .2s, box-shadow .2s; }
    .leader:hover { transform: translateY(-2px); box-shadow: 0 14px 30px -22px rgba(60,30,20,.5); }
    .leader.top { background: linear-gradient(90deg, rgba(247,183,51,.16), #fff 70%); border-color: rgba(247,183,51,.45); }
    .leader[data-rank="1"] { padding: .8rem 1rem; border: 2px solid #f7b733; box-shadow: 0 18px 36px -24px rgba(247,183,51,.9); }
    .leader[data-rank="2"] { background: linear-gradient(90deg, rgba(168,178,189,.22), #fff 70%); border-color: #cfd6dd; }
    .leader[data-rank="3"] { background: linear-gradient(90deg, rgba(205,127,50,.18), #fff 70%); border-color: #e7c4a2; }
    .leader .rank { font-size: 1.5rem; text-align: center; font-weight: 800; color: var(--primary-dark); }
    .leader[data-rank="1"] .rank { font-size: 2rem; }
    .leader-photo img { width: 4.2rem; height: 4.2rem; object-fit: cover; border-radius: 14px; display: block; box-shadow: 0 8px 18px -10px rgba(0,0,0,.5); }
    .leader[data-rank="1"] .leader-photo img { outline: 3px solid #f7b733; outline-offset: 2px; }
    .leader-body a { color: inherit; text-decoration: none; }
    .leader-body a:hover { color: var(--accent); }
    .votes { display: inline-flex; align-items: center; gap: .3rem; margin-top: .2rem; padding: .1rem .55rem; border-radius: 999px; background: #fde9df; color: var(--accent); font-weight: 700; }

    .winners-title { display: flex; align-items: center; gap: .6rem; }
    .winners-title span { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; font-size: 1.3rem; color: #3d2f12;
      background: linear-gradient(135deg, #ffe08a, #f7b733); box-shadow: 0 10px 20px -10px #f7b733; }
    .winners-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 1.2rem; }
    .winner-card { background: #fff; border-radius: 22px; overflow: hidden; border: 1px solid #f0e6dd; box-shadow: 0 20px 40px -28px rgba(40,20,10,.55);
      color: inherit; text-decoration: none; transition: transform .25s, box-shadow .25s; }
    .winner-card:hover { transform: translateY(-6px); box-shadow: 0 0 0 2px #f7b733, 0 28px 50px -28px rgba(247,183,51,.8); color: inherit; }
    .winner-photo { position: relative; overflow: hidden; }
    .winner-photo::after { content: ""; position: absolute; inset: auto 0 0; height: 40%; background: linear-gradient(transparent, rgba(0,0,0,.35)); }
    .winner-photo img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; transition: transform .5s; }
    .winner-card:hover .winner-photo img { transform: scale(1.05); }
    .winner-badge { position: absolute; z-index: 1; left: .6rem; bottom: .6rem; background: linear-gradient(135deg, #ffe08a, #f7b733); color: #3d2f12; font-weight: 700;
      font-size: .76rem; border-radius: 999px; padding: .25rem .7rem; box-shadow: 0 6px 14px -6px rgba(0,0,0,.5); }
    .winner-card .p-2 { padding: .8rem 1rem !important; }
    @media (max-width: 767.98px) {
      .ch-grid { grid-template-columns: 1fr; }
      .ch-trophy, .ch-spark { display: none; }
    }
    @media (max-width: 575.98px) {
      .leader { grid-template-columns: 2rem 3.4rem 1fr; }
      .leader app-like-share { grid-column: 2 / -1; }
      .leader-photo img { width: 3.4rem; height: 3.4rem; }
      .winners-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; }
    }
    @media (prefers-reduced-motion: reduce) { .ch-spark, .ch-trophy { animation: none; } .leader, .winner-card, .winner-photo img { transition: none; } }
  `
})
export class Contest implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly open = signal<OpenContest[]>([]);
  protected readonly winners = signal<ContestWinner[]>([]);
  protected readonly winnersTotal = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  /** Ticks every minute, for the countdown. */
  private readonly now = signal(Date.now());
  private readonly tick = this.inBrowser ? setInterval(() => this.now.set(Date.now()), 60_000) : null;
  private page = 1;

  constructor() {
    inject(SeoService).set({ title: 'Photo of the Week', description: 'Vote for the most-loved selfie with parents this week. The winner gets a badge, a certificate and a golden frame.', path: '/contest' });
    this.http.get<{ contests: OpenContest[] }>(`${environment.apiBaseUrl}/api/v1/contests/current`)
      .pipe(retry({ count: this.inBrowser ? 2 : 0, delay: () => timer(1500) }))
      .subscribe({ next: r => { this.open.set(r.contests); this.state.set('ready'); }, error: () => this.state.set('error') });
    this.loadWinners();
  }

  ngOnDestroy(): void { if (this.tick) clearInterval(this.tick); }

  private loadWinners(): void {
    this.http.get<{ items: ContestWinner[]; total: number }>(`${environment.apiBaseUrl}/api/v1/contests/winners`, { params: { page: this.page, pageSize: 12 } })
      .subscribe({ next: r => { this.winners.update(x => [...x, ...r.items]); this.winnersTotal.set(r.total); }, error: () => {} });
  }

  protected moreWinners(): void { this.page++; this.loadWinners(); }

  protected file(id: string): string { return `${environment.apiBaseUrl}/api/v1/selfies/files/${id}`; }
  protected title(c: ContestInfo): string { return contestTitle(c, s => this.i18n.t(s)); }
  protected days(c: ContestInfo): string { return contestDays(c, this.i18n.locale()); }
  protected medal(rank: number): string { return ['🥇', '🥈', '🥉'][rank - 1]; }

  /** "2 days 5 hours left" / "3 hours left" / "Ending now". */
  protected timeLeft(c: ContestInfo): string {
    const ms = new Date(c.endsAtUtc + 'Z').getTime() - this.now();
    if (ms <= 60_000) return this.i18n.t('Ending now');
    const d = Math.floor(ms / 86_400_000), h = Math.floor(ms % 86_400_000 / 3_600_000), m = Math.floor(ms % 3_600_000 / 60_000);
    return d > 0 ? this.i18n.t('{d} days {h} hours left', { d, h }) : h > 0 ? this.i18n.t('{h} hours left', { h }) : this.i18n.t('{m} minutes left', { m });
  }
}
