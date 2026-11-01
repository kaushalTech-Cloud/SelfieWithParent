import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, PLATFORM_ID, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { SeoService } from '../../core/seo.service';
import { AlbumInvite, AlbumLink } from '../../shared/album-invite';
import { DonatePill } from '../../shared/donate-pill';
import { LikeShare } from '../../shared/like-share';

interface AlbumItem { publicId: string; kind: string; firstName: string; parentName: string; relation: string | null; photoId: string | null; videoId: string | null; likes?: number; }
export interface Album { publicId: string; parentName: string | null; relation: string | null; members: number; selfies: number; createdAtUtc: string; items: AlbumItem[]; }
interface MyAlbum { publicId: string; inviteCode: string; parentName: string; }

/**
 * A family album (/albums/{id}): brothers, sisters and cousins, each with their own selfie with the same parent. The invite
 * page (/albums/join/{code}) shows the same album with "Add my selfie" for the person who was sent the link.
 */
@Component({
  selector: 'app-album-page',
  imports: [AlbumInvite, DonatePill, LikeShare, RouterLink, TranslatePipe],
  styleUrl: '../../../styles/albums.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="fa-page">
      <header class="fa-hero">
        <app-donate-pill />
        <div class="container">
          @if (a(); as a) {
            <span class="fa-eyebrow"><i class="bi bi-people-fill"></i> {{ 'Family album' | t }}</span>
            @if (code) {
              <h1>{{ "You're invited!" | t }}</h1>
              <p class="fa-lead">{{ (a.parentName ? 'Your family is collecting selfies with {name}. Add yours to the family album.' : 'Your family is making a family album. Add your selfie with your parent.') | t: { name: a.parentName ?? '' } }}</p>
            } @else {
              <h1>{{ (a.parentName ? "{name}'s family album" : 'A family album') | t: { name: a.parentName ?? '' } }}</h1>
              <p class="fa-lead">{{ 'Brothers, sisters and cousins — each with their own selfie with the same parent.' | t }}</p>
            }
            <div class="fa-who">
              <div class="fa-chips" aria-hidden="true">
                @for (n of names().slice(0, 5); track $index) { <span>{{ n.charAt(0).toUpperCase() }}</span> }
              </div>
              <span>{{ (a.members === 1 ? '1 family member' : '{n} family members') | t: { n: a.members } }}@if (names().length) { · {{ names().join(', ') }} }</span>
            </div>
            <div class="fa-actions">
              @if (code) {
                <a class="btn btn-accent btn-lg" routerLink="/upload" [queryParams]="{ album: code }"><i class="bi bi-camera"></i>
                  {{ (a.parentName ? 'Add my selfie with {name}' : 'Add my selfie') | t: { name: a.parentName ?? '' } }}</a>
              } @else {
                <app-like-share [id]="'album-' + a.publicId" [title]="title()" [path]="'/albums/' + a.publicId" [image]="cover()" [shareOnly]="true" look="glass" />
              }
            </div>
          } @else if (missing()) {
            <h1>{{ 'Family album not found' | t }}</h1>
            <p class="fa-lead">{{ "This link doesn't work any more. Ask for a new one." | t }}</p>
          } @else {
            <div class="fa-loading" aria-busy="true"><span></span><span></span></div>
          }
        </div>
      </header>

      <main id="main" class="container pb-5" tabindex="-1">
        @if (a(); as a) {
          @if (mine(); as m) {
            <div class="fa-invite"><app-album-invite [album]="m" [parentName]="m.parentName" [showView]="false" /></div>
          }
          @if (a.items.length) {
            <div class="fa-grid">
              @for (i of a.items; track i.publicId; let n = $index) {
                <a class="fa-tile" [routerLink]="['/selfies', i.publicId]" [style.--tilt]="(n % 2 ? 1.2 : -1.2) + 'deg'">
                  <span class="fa-photo">
                    @if (i.photoId) { <img [src]="file(i.photoId)" [alt]="i.firstName + ' & ' + i.parentName" loading="lazy"> }
                    @else { <span class="fa-ph"><i class="bi bi-camera-video-fill"></i></span> }
                  </span>
                  <span class="fa-cap"><strong>{{ i.firstName }}</strong> @if (i.relation) { <small>{{ 'with' | t }} {{ i.relation | t }}</small> }</span>
                </a>
              }
              @if (code) {
                <a class="fa-tile fa-add" routerLink="/upload" [queryParams]="{ album: code }">
                  <span class="fa-photo"><span class="fa-ph"><i class="bi bi-plus-lg"></i></span></span>
                  <span class="fa-cap"><strong>{{ 'Your selfie here' | t }}</strong></span>
                </a>
              }
            </div>
          } @else {
            <p class="fa-empty"><i class="bi bi-hourglass-split"></i> {{ 'The selfies appear here once our team approves them (usually within 48 hours).' | t }}</p>
          }
          @if (!code && !mine()) {
            <div class="fa-cta">
              <p>{{ 'Start a family album with your brothers, sisters and cousins.' | t }}</p>
              <a class="btn btn-accent" routerLink="/upload"><i class="bi bi-camera"></i> {{ 'Share a selfie' | t }}</a>
            </div>
          }
        }
      </main>
    </div>`
})
export class AlbumPage {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly seo = inject(SeoService);
  private readonly auth = inject(AuthService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly api = `${environment.apiBaseUrl}/api/v1`;

  /** Set on the invite page (/albums/join/{code}). */
  protected readonly code: string | null;
  protected readonly a = signal<Album | null>(null);
  protected readonly missing = signal(false);
  /** The album's invite link, when the visitor has a selfie in it. */
  protected readonly mine = signal<(AlbumLink & { parentName: string }) | null>(null);

  protected readonly names = computed(() => [...new Set((this.a()?.items ?? []).map(i => i.firstName))]);
  protected readonly title = computed(() => {
    const a = this.a();
    return a?.parentName ? this.i18n.t("{name}'s family album", { name: a.parentName }) : this.i18n.t('A family album');
  });
  protected readonly cover = computed(() => this.file(this.a()?.items.find(i => i.photoId)?.photoId ?? null) || null);

  constructor() {
    const p = inject(ActivatedRoute).snapshot.paramMap;
    this.code = p.get('code')?.toLowerCase() ?? null;
    void this.load(this.code ? `${this.api}/albums/invite/${encodeURIComponent(this.code)}` : `${this.api}/albums/${encodeURIComponent(p.get('id') ?? '')}`);
  }

  private async load(url: string): Promise<void> {
    try {
      const a = await firstValueFrom(this.http.get<Album>(url));
      this.a.set(a);
      this.seo.set({
        title: this.code ? this.i18n.t('Join {title}', { title: this.title() }) : this.title(),
        description: this.i18n.t('Brothers, sisters and cousins — each with their own selfie with the same parent.'),
        path: this.code ? `/albums/join/${this.code}` : `/albums/${a.publicId}`,
        image: this.cover() ?? undefined, imageAlt: this.title(), noIndex: !!this.code
      });
      if (this.browser) await this.auth.init();   // not behind the sign-in guard: wait until the session is restored
      if (this.browser && this.auth.isSignedIn()) {
        const mine = await firstValueFrom(this.http.get<MyAlbum[]>(`${this.api}/me/albums`));
        const m = mine.find(x => x.publicId === a.publicId);
        if (m) this.mine.set({ publicId: m.publicId, inviteCode: m.inviteCode, parentName: m.parentName });
      }
    } catch {
      if (!this.a()) this.missing.set(true);
    }
  }

  protected file(id: string | null): string { return id ? `${this.api}/selfies/files/${id}` : ''; }
}
