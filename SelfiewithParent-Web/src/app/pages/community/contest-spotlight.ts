import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { ContestEntry, ContestInfo, ContestWinner, contestDays, contestTitle } from './contest.models';

/**
 * Home page: the latest Photo of the Week winner with its badge, and this week's top 3 with a "Vote now" button.
 * Loaded in the browser (the home page is built ahead of time, and the contest changes every day).
 */
@Component({
  selector: 'app-contest-spotlight',
  imports: [RouterLink, TranslatePipe],
  template: `
    @if (winner() || leaders().length) {
      <div class="spotlight card-soft lift mb-5">
        @if (winner(); as w) {
          <a class="spot-winner" [routerLink]="['/selfies', w.winner.publicId]">
            @if (w.winner.photoId) { <img [src]="file(w.winner.photoId)" [alt]="w.winner.name"> }
            <div>
              <span class="spot-badge"><i class="bi bi-trophy-fill"></i> {{ title(w.contest) }}</span>
              <h3 class="mb-0 mt-1">{{ w.winner.name }}</h3>
              <small class="text-muted">{{ days(w.contest) }} · <i class="bi bi-heart-fill text-accent"></i> {{ w.votes }}</small>
            </div>
          </a>
        }
        @if (leaders().length) {
          <div class="spot-week">
            <div class="small fw-semibold mb-2">{{ "This week's top selfies" | t }}</div>
            <div class="d-flex gap-2">
              @for (e of leaders(); track e.item.publicId) {
                <a class="spot-leader" [routerLink]="['/selfies', e.item.publicId]" [attr.aria-label]="e.item.name">
                  @if (e.item.photoId) { <img [src]="file(e.item.photoId)" [alt]="e.item.name" loading="lazy"> }
                  <span>{{ ['🥇', '🥈', '🥉'][e.rank - 1] }} {{ e.votes }}</span>
                </a>
              }
            </div>
          </div>
        }
        <a class="btn btn-accent" routerLink="/contest"><i class="bi bi-heart"></i> {{ 'Vote for the Photo of the Week' | t }}</a>
      </div>
    }`,
  styles: `
    .spotlight { display: flex; flex-wrap: wrap; align-items: center; gap: 1.25rem; }
    .spot-winner { display: flex; align-items: center; gap: .9rem; color: inherit; text-decoration: none; flex: 1 1 260px; }
    .spot-winner img { width: 5.5rem; height: 5.5rem; object-fit: cover; border-radius: .8rem; border: 3px solid #f7b733; }
    .spot-winner h3 { font-size: 1.1rem; }
    .spot-badge { display: inline-block; background: #f7b733; color: #3d2f12; font-weight: 700; font-size: .78rem; border-radius: 999px; padding: .15rem .6rem; }
    .spot-week { flex: 1 1 220px; }
    .spot-leader { position: relative; display: block; }
    .spot-leader img { width: 4rem; height: 4rem; object-fit: cover; border-radius: .6rem; display: block; }
    .spot-leader span { position: absolute; left: 0; right: 0; bottom: 0; text-align: center; font-size: .72rem; font-weight: 700; color: #fff;
      background: rgba(0,0,0,.55); border-radius: 0 0 .6rem .6rem; }
  `
})
export class ContestSpotlight {
  private readonly i18n = inject(I18nService);
  protected readonly winner = signal<ContestWinner | null>(null);
  protected readonly leaders = signal<ContestEntry[]>([]);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const http = inject(HttpClient);
    http.get<{ items: ContestWinner[] }>(`${environment.apiBaseUrl}/api/v1/contests/winners`, { params: { pageSize: 1 } })
      .subscribe({ next: r => this.winner.set(r.items[0] ?? null), error: () => {} });
    http.get<{ contests: { contest: ContestInfo; leaders: ContestEntry[] }[] }>(`${environment.apiBaseUrl}/api/v1/contests/current`)
      .subscribe({ next: r => this.leaders.set((r.contests.find(c => c.contest.kind === 'week') ?? r.contests[0])?.leaders.slice(0, 3) ?? []), error: () => {} });
  }

  protected file(id: string): string { return `${environment.apiBaseUrl}/api/v1/selfies/files/${id}`; }
  protected title(c: ContestInfo): string { return contestTitle(c, s => this.i18n.t(s)); }
  protected days(c: ContestInfo): string { return contestDays(c, this.i18n.locale()); }
}
