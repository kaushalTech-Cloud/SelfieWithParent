import { HttpClient } from '@angular/common/http';
import { Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { SeoService } from '../../core/seo.service';
import { DonatePill } from '../../shared/donate-pill';
import { LikeShare } from '../../shared/like-share';
import { STREAK_BADGES } from '../account/gratitude-streak';

interface ProfileItem { publicId: string; kind: string; parentName: string; relation: string | null; photoId: string | null; videoId: string | null; likes: number; isWinner: boolean; approvedAtUtc: string; }
interface PublicProfile {
  handle: string; displayName: string; bio: string | null; memberSinceUtc: string; hasPhoto: boolean;
  streak: { current: number; best: number; badges: string[] } | null; shared: number; likes: number; wins: number; items: ProfileItem[];
}

/**
 * A visitor's public profile page (/p/{address}): their approved selfies, family photos, Then & Now, frames and reels, contest
 * wins and gratitude streak badges. Only shown when the visitor switched it on in My account.
 */
@Component({
  selector: 'app-profile-page',
  imports: [DonatePill, RouterLink, TranslatePipe, LikeShare],
  styleUrl: '../../../styles/profile.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="pf-page">
      <header class="pf-hero">
        <app-donate-pill />
        <div class="container">
          @if (p(); as p) {
            <div class="pf-head">
              <div class="pf-avatar">
                @if (p.hasPhoto) { <img [src]="photo(p.handle)" [alt]="p.displayName"> } @else { <span>{{ initials(p.displayName) }}</span> }
              </div>
              <div class="pf-who">
                <h1>{{ p.displayName }}</h1>
                @if (p.bio) { <p class="pf-bio">{{ p.bio }}</p> }
                <small class="pf-since"><i class="bi bi-calendar-heart"></i> {{ 'Member since {date}' | t: { date: since(p.memberSinceUtc) } }}</small>
                @if (p.streak; as s) {
                  <div class="pf-badges">
                    @if (s.current) { <span class="pf-badge pf-flame"><i class="bi bi-fire"></i> {{ (s.current === 1 ? '1 week in a row' : '{n} weeks in a row') | t: { n: s.current } }}</span> }
                    @for (b of s.badges; track b) { <span class="pf-badge"><i class="bi" [class]="badge(b).icon"></i> {{ badge(b).name | t }}</span> }
                  </div>
                }
              </div>
              <div class="pf-share">
                <app-like-share [id]="'p-' + p.handle" [title]="p.displayName" [path]="'/p/' + p.handle" [shareOnly]="true" look="glass" />
              </div>
            </div>
            <div class="pf-stats">
              <div><strong>{{ p.shared }}</strong><span>{{ 'Shared' | t }}</span></div>
              <div><strong>{{ p.likes }}</strong><span>{{ 'Likes' | t }}</span></div>
              <div><strong>{{ p.wins }}</strong><span>{{ 'Wins' | t }}</span></div>
              @if (p.streak; as s) { <div><strong>{{ s.best }}</strong><span>{{ 'Best streak' | t }}</span></div> }
            </div>
          } @else if (missing()) {
            <div class="pf-head"><div class="pf-who"><h1>{{ 'Profile not found' | t }}</h1>
              <p class="pf-bio">{{ "This page doesn't exist or isn't public." | t }}</p></div></div>
          } @else {
            <div class="pf-head pf-loading" aria-busy="true"><div class="pf-avatar"></div><div class="pf-who"><h1>&nbsp;</h1></div></div>
          }
        </div>
      </header>

      <main id="main" class="container pb-5" tabindex="-1">
        @if (p(); as p) {
          <div class="pf-tabs" role="tablist">
            @for (t of tabs(); track t.key) {
              <button type="button" role="tab" [class.active]="tab() === t.key" [attr.aria-selected]="tab() === t.key" (click)="tab.set(t.key)">
                <i class="bi" [class]="t.icon"></i> {{ t.name | t }} <small>{{ t.count }}</small>
              </button>
            }
          </div>
          @if (shown().length) {
            <div class="pf-grid">
              @for (i of shown(); track i.publicId) {
                <a class="pf-tile" [routerLink]="['/selfies', i.publicId]">
                  @if (i.photoId) { <img [src]="file(i.photoId)" [alt]="i.parentName" loading="lazy"> }
                  @else { <span class="pf-ph"><i class="bi bi-camera-video-fill"></i></span> }
                  <span class="pf-kind"><i class="bi" [class]="kindIcon(i.kind)"></i></span>
                  @if (i.isWinner) { <span class="pf-win"><i class="bi bi-trophy-fill"></i> {{ 'Winner' | t }}</span> }
                  <span class="pf-cap">{{ i.relation ? (i.relation | t) + ' · ' : '' }}{{ i.parentName }}<span><i class="bi bi-heart-fill"></i> {{ i.likes }}</span></span>
                </a>
              }
            </div>
          } @else {
            <p class="pf-empty"><i class="bi bi-images"></i> {{ 'Nothing shared here yet.' | t }}</p>
          }
          <div class="pf-cta">
            <p>{{ 'Share your own selfie with your parents and make a page like this.' | t }}</p>
            <a class="btn btn-accent" routerLink="/upload"><i class="bi bi-camera"></i> {{ 'Share a selfie' | t }}</a>
          </div>
        }
      </main>
    </div>`
})
export class ProfilePage {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly seo = inject(SeoService);
  private readonly api = `${environment.apiBaseUrl}/api/v1/profiles`;

  protected readonly p = signal<PublicProfile | null>(null);
  protected readonly missing = signal(false);
  protected readonly tab = signal('all');

  protected readonly tabs = computed(() => {
    const items = this.p()?.items ?? [];
    const n = (f: (i: ProfileItem) => boolean) => items.filter(f).length;
    return [
      { key: 'all', icon: 'bi-grid-3x3-gap', name: 'All', count: items.length },
      { key: 'selfies', icon: 'bi-camera', name: 'Selfies', count: n(i => !['frame', 'reel'].includes(i.kind)) },
      { key: 'frame', icon: 'bi-image', name: 'Frames', count: n(i => i.kind === 'frame') },
      { key: 'reel', icon: 'bi-film', name: 'Reels', count: n(i => i.kind === 'reel') },
      { key: 'wins', icon: 'bi-trophy', name: 'Wins', count: n(i => i.isWinner) }
    ].filter(t => t.key === 'all' || t.count);
  });

  protected readonly shown = computed(() => {
    const items = this.p()?.items ?? [], t = this.tab();
    return t === 'all' ? items : t === 'wins' ? items.filter(i => i.isWinner)
      : t === 'selfies' ? items.filter(i => !['frame', 'reel'].includes(i.kind)) : items.filter(i => i.kind === t);
  });

  constructor() {
    const handle = (inject(ActivatedRoute).snapshot.paramMap.get('handle') ?? '').toLowerCase();
    void this.load(handle);
  }

  private async load(handle: string): Promise<void> {
    try {
      const p = await firstValueFrom(this.http.get<PublicProfile>(`${this.api}/${encodeURIComponent(handle)}`));
      this.p.set(p);
      const first = p.items.find(i => i.photoId);
      this.seo.set({
        title: this.i18n.t("{name}'s selfies with their parents", { name: p.displayName }),
        description: p.bio || this.i18n.t('{n} photos shared with love on Selfie with Parent.', { n: p.shared }),
        path: `/p/${p.handle}`,
        image: p.hasPhoto ? this.photo(p.handle) : first ? this.file(first.photoId) : undefined,
        imageAlt: p.displayName
      });
    } catch {
      this.missing.set(true);
    }
  }

  protected photo(handle: string): string { return `${this.api}/${handle}/photo`; }
  protected file(id: string | null): string { return id ? `${environment.apiBaseUrl}/api/v1/selfies/files/${id}` : ''; }
  protected badge(b: string) { return STREAK_BADGES[b] ?? { icon: 'bi-award', name: b }; }
  protected kindIcon(k: string): string { return k === 'frame' ? 'bi-image' : k === 'reel' ? 'bi-film' : k === 'thennow' ? 'bi-hourglass-split' : k === 'family' ? 'bi-people-fill' : 'bi-camera-fill'; }
  protected initials(name: string): string { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(''); }
  protected since(utc: string): string { return new Intl.DateTimeFormat(this.i18n.locale(), { month: 'long', year: 'numeric' }).format(new Date(utc)); }
}
