import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { retry, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { SeoService } from '../../core/seo.service';
import { LikeShare } from '../../shared/like-share';
import { countryList } from '../../shared/places';
import { FESTIVALS } from '../selfies/frame-festivals';
import { DonatePill } from '../../shared/donate-pill';

interface FrameItem {
  publicId: string; name: string; place: string | null; countryCode: string; festival: string | null; style: string;
  approvedAtUtc: string; photoId: string; storyId: string | null; likes?: number;
}
interface FilterCount { key: string; count: number; }
interface FramePage { items: FrameItem[]; total: number; countries: FilterCount[]; festivals: FilterCount[]; }

const PAGE = 12;

/**
 * Community › Photo Frames: approved selfies that their owners shared in a photo frame (from a selfie's frame page),
 * filtered by country and by festival / event. Every frame is reviewed by the team first.
 */
@Component({
  selector: 'app-photo-frames',
  imports: [DonatePill, RouterLink, TranslatePipe, LikeShare],
  template: `
    <header class="page-hero">
      <app-donate-pill />
      <div class="container">
        <span class="eyebrow">{{ 'Festivals & everyday moments' | t }}</span>
        <h1><em>{{ 'Photo Frames' | t }}</em></h1>
        <p class="lead">{{ 'Selfies our community shared in a photo frame — for Diwali, Eid, Christmas and every day in between.' | t }}</p>
      </div>
    </header>

    <main id="main" class="pb-5" tabindex="-1">
      <div class="container">
        <div class="frames-filters card-soft lift mb-4">
          <div>
            <label class="form-label small fw-semibold" for="fCountry">{{ 'Country' | t }}</label>
            <select class="form-select" id="fCountry" [value]="country()" (change)="setCountry($any($event.target).value)">
              <option value="">{{ 'All countries' | t }}</option>
              @for (c of countryOptions(); track c.key) { <option [value]="c.key">{{ c.name }} ({{ c.count }})</option> }
            </select>
          </div>
          <div>
            <label class="form-label small fw-semibold" for="fFestival">{{ 'Festival or event' | t }}</label>
            <select class="form-select" id="fFestival" [value]="festival()" (change)="setFestival($any($event.target).value)">
              <option value="">{{ 'All festivals & events' | t }}</option>
              @for (f of festivalOptions(); track f.key) { <option [value]="f.key">{{ f.name | t }} ({{ f.count }})</option> }
            </select>
          </div>
          <a class="btn btn-accent" routerLink="/selfies"><i class="bi bi-image"></i> {{ 'Frame your selfie' | t }}</a>
        </div>

        @if (state() === 'loading' && !items().length) {
          <p class="text-center text-muted py-5"><span class="spinner-border spinner-border-sm"></span> {{ 'Loading…' | t }}</p>
        } @else if (state() === 'error') {
          <p class="text-center text-muted py-5">{{ "We couldn't load the photo frames. Please try again." | t }}</p>
        } @else if (!items().length) {
          <div class="text-center text-muted py-5">
            <i class="bi bi-images fs-1 d-block mb-2"></i>
            <p class="mb-1">{{ 'No photo frames here yet.' | t }}</p>
            <p class="small">{{ 'Open your approved selfie, choose Photo frame, and share it to this gallery.' | t }}</p>
          </div>
        } @else {
          <p class="small text-muted">{{ total() }} {{ (total() === 1 ? 'photo frame' : 'photo frames') | t }}</p>
          <div class="frames-grid">
            @for (f of items(); track f.publicId) {
              <article class="frame-card">
                <app-like-share class="photo-share" look="icon" [shareOnly]="true" [id]="f.publicId" [title]="f.name"
                                [path]="f.storyId ? '/selfies/' + f.storyId : '/photo-frames'" [image]="file(f.photoId)" />
                @if (f.storyId) {
                  <a [routerLink]="['/selfies', f.storyId]" [attr.aria-label]="f.name"><img [src]="file(f.photoId)" [alt]="f.name" loading="lazy"></a>
                } @else {
                  <img [src]="file(f.photoId)" [alt]="f.name" loading="lazy">
                }
                <div class="frame-card-body">
                  <h3>{{ f.name }}</h3>
                  <small class="text-muted"><i class="bi bi-geo-alt"></i> {{ (f.place ? f.place + ', ' : '') + countryName(f.countryCode) }}</small>
                  <span class="frame-tag"><i class="bi" [class]="festivalIcon(f.festival)"></i> {{ festivalName(f.festival) | t }}</span>
                  <app-like-share class="d-block mt-1" [id]="f.publicId" [likes]="f.likes ?? 0" [title]="f.name" [compact]="true"
                                  [path]="f.storyId ? '/selfies/' + f.storyId : '/photo-frames'" [image]="file(f.photoId)" />
                </div>
              </article>
            }
          </div>
          @if (items().length < total()) {
            <div class="text-center mt-4">
              <button class="btn btn-outline-accent" type="button" (click)="more()" [disabled]="state() === 'loading'">{{ 'Show more' | t }}</button>
            </div>
          }
        }
      </div>
    </main>`,
  styles: `
    .frames-filters { display: grid; grid-template-columns: 1fr 1fr auto; gap: 1rem; align-items: end; }
    .frames-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1.25rem; }
    .frame-card { position: relative; background: var(--bs-body-bg, #fff); border-radius: 22px; overflow: hidden; border: 1px solid #f0e6dd; box-shadow: 0 22px 44px -30px rgba(40,20,10,.55);
      display: flex; flex-direction: column; transition: transform .25s, box-shadow .25s; }
    .frame-card:hover { transform: translateY(-5px) rotate(-.4deg); box-shadow: 0 30px 54px -28px rgba(40,20,10,.6); }
    @media (prefers-reduced-motion: reduce) { .frame-card { transition: none; } }
    .frame-card img { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; display: block; background: #f3f0ea; }
    .frame-card-body { padding: .75rem .9rem 1rem; display: flex; flex-direction: column; gap: .3rem; }
    .frame-card h3 { font-size: 1rem; margin: 0; }
    .frame-tag { align-self: flex-start; font-size: .78rem; font-weight: 600; color: var(--accent); background: rgba(240,101,67,.1); border-radius: 999px; padding: .15rem .6rem; }
    @media (max-width: 767.98px) {
      .frames-filters { grid-template-columns: 1fr; }
      .frames-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
      .frame-card-body { padding: .55rem .6rem .7rem; }
      .frame-card h3 { font-size: .9rem; }
    }
  `
})
export class PhotoFrames {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);

  protected readonly items = signal<FrameItem[]>([]);
  protected readonly total = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly country = signal('');
  protected readonly festival = signal('');
  private readonly countries = signal<FilterCount[]>([]);
  private readonly festivals = signal<FilterCount[]>([]);
  private page = 1;

  private readonly names = computed(() => new Map(countryList(this.i18n.lang()).map(c => [c.code, c.name])));
  protected readonly countryOptions = computed(() => this.countries().map(c => ({ ...c, name: this.countryName(c.key) }))
    .sort((a, b) => a.name.localeCompare(b.name)));
  protected readonly festivalOptions = computed(() => this.festivals().map(f => ({ ...f, name: this.festivalName(f.key === 'everyday' ? null : f.key) })));

  constructor() {
    inject(SeoService).set({ title: 'Photo Frames', description: 'Selfies shared in festival and everyday photo frames, by country and festival.', path: '/photo-frames' });
    this.load(true);
  }

  protected setCountry(code: string): void { this.country.set(code); this.load(true); }
  protected setFestival(id: string): void { this.festival.set(id); this.load(true); }
  protected more(): void { this.page++; this.load(false); }

  private load(reset: boolean): void {
    if (reset) this.page = 1;
    this.state.set('loading');
    const params: Record<string, string | number> = { page: this.page, pageSize: PAGE };
    if (this.country()) params['country'] = this.country();
    if (this.festival()) params['festival'] = this.festival();
    this.http.get<FramePage>(`${environment.apiBaseUrl}/api/v1/selfies/frames`, { params })
      .pipe(retry({ count: 2, delay: () => timer(1500) }))
      .subscribe({
        next: r => {
          this.items.update(x => reset ? r.items : [...x, ...r.items]);
          this.total.set(r.total);
          this.countries.set(r.countries);
          this.festivals.set(r.festivals);
          this.state.set('ready');
        },
        error: () => this.state.set('error')
      });
  }

  protected file(id: string): string { return `${environment.apiBaseUrl}/api/v1/selfies/files/${id}`; }
  protected countryName(code: string): string { return this.names().get(code) ?? code; }
  /** The festival's name (translated in the template); an everyday frame says so. */
  protected festivalName(id: string | null): string { return FESTIVALS.find(f => f.id === id)?.name ?? 'Everyday frame'; }
  protected festivalIcon(id: string | null): string { return FESTIVALS.find(f => f.id === id)?.icon ?? 'bi-heart'; }
}
