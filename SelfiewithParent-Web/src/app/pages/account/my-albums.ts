import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { FeaturesService } from '../../core/features.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { AlbumInvite } from '../../shared/album-invite';

interface MyAlbum { publicId: string; inviteCode: string; parentName: string; mySelfies: string[]; approved: boolean; }
interface Candidate { selfieId: string; kind: string; parentName: string; relation: string | null; approved: boolean; createdAtUtc: string; }

/**
 * My account › Family albums: the albums the visitor's selfies are in (with the invite link to send again), and their
 * selfies with a parent that could start one ("invite your brothers, sisters and cousins").
 */
@Component({
  selector: 'app-my-albums',
  imports: [AlbumInvite, RouterLink, TranslatePipe],
  template: `
    @if (features.on('albums') && loaded()) {
    <section class="card-soft" id="albums">
      <h2 class="acc-title">{{ 'Family albums' | t }}</h2>
      <p class="small text-muted">{{ 'Invite your brothers, sisters and cousins to add their own selfie with the same parent. Together your selfies make one family album.' | t }}</p>

      @for (a of albums(); track a.publicId) {
        <div class="ma-album">
          <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
            <strong><i class="bi bi-people-fill text-accent"></i> {{ "{name}'s family album" | t: { name: a.parentName } }}</strong>
            <a class="small" [routerLink]="['/albums', a.publicId]">{{ 'View the album' | t }} <i class="bi bi-arrow-right"></i></a>
          </div>
          <app-album-invite [album]="a" [parentName]="a.parentName" [showView]="false" [compact]="true" />
        </div>
      }

      @if (!albums().length && !candidates().length) {
        <div class="ma-empty">
          <i class="bi bi-people"></i>
          <p class="mb-2">{{ 'Share a selfie with your parent, then invite your brothers, sisters and cousins to add theirs.' | t }}</p>
          <a class="btn btn-accent btn-sm" routerLink="/upload"><i class="bi bi-camera"></i> {{ 'Share a selfie' | t }}</a>
        </div>
      }
      @if (candidates().length) {
        <p class="small fw-semibold mt-3 mb-2">{{ (albums().length ? 'Start another album from a selfie:' : 'Start an album from one of your selfies:') | t }}</p>
        <ul class="list-unstyled ma-list">
          @for (c of candidates(); track c.selfieId) {
            <li>
              @if (picked() === c.selfieId) {
                <app-album-invite [selfieId]="c.selfieId" [parentName]="c.parentName" [compact]="true" />
              } @else {
                <div class="ma-cand">
                  <i class="bi bi-camera"></i>
                  <div class="me-auto">
                    <div class="fw-semibold">{{ c.relation ? (c.relation | t) + ' · ' : '' }}{{ c.parentName }}</div>
                    <small class="text-muted">{{ date(c.createdAtUtc) }} · {{ (c.approved ? 'In the gallery' : 'Waiting for review') | t }}</small>
                  </div>
                  <button type="button" class="btn btn-outline-accent btn-sm" (click)="picked.set(c.selfieId)"><i class="bi bi-person-plus"></i> {{ 'Invite family' | t }}</button>
                </div>
              }
            </li>
          }
        </ul>
      }
    </section>
    }`,
  styles: `
    .ma-album { padding: .8rem 0; border-bottom: 1px solid rgba(15,91,92,.1); }
    .ma-list { display: grid; gap: .5rem; }
    .ma-cand { display: flex; align-items: center; gap: .75rem; padding: .6rem .8rem; border-radius: .6rem; background: rgba(15,91,92,.05); }
    .ma-cand > .bi { font-size: 1.2rem; color: var(--accent); }
    .ma-empty { text-align: center; padding: 1.5rem 1rem; border-radius: 1rem; background: rgba(15,91,92,.04); }
    .ma-empty > .bi { font-size: 2rem; color: var(--accent); }
  `
})
export class MyAlbums implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly features = inject(FeaturesService);
  private readonly api = `${environment.apiBaseUrl}/api/v1/me/albums`;

  protected readonly albums = signal<MyAlbum[]>([]);
  protected readonly candidates = signal<Candidate[]>([]);
  protected readonly picked = signal<string | null>(null);
  protected readonly loaded = signal(false);

  ngOnInit(): void { if (this.browser) void this.load(); }

  private async load(): Promise<void> {
    try {
      const [albums, candidates] = await Promise.all([
        firstValueFrom(this.http.get<MyAlbum[]>(this.api)), firstValueFrom(this.http.get<Candidate[]>(`${this.api}/candidates`))]);
      this.albums.set(albums);
      this.candidates.set(candidates.slice(0, 5));
      this.loaded.set(true);
    } catch { /* the section stays hidden */ }
  }

  protected date(utc: string): string { return new Date(utc).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
}
