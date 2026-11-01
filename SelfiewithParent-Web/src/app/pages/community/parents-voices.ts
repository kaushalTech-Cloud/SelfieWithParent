import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, PLATFORM_ID, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { retry, timer } from 'rxjs';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { SeoService } from '../../core/seo.service';
import { LikeShare } from '../../shared/like-share';
import { ParentStory, STORIES_API, excerpt, parentName, storyFile } from './parent-stories.models';
import { DonatePill } from '../../shared/donate-pill';

const PAGE = 12;

/**
 * Parents' Voices: stories of mothers and fathers whose children moved away or stopped calling, with a photo, a video or
 * a voice note. Every story is reviewed by staff first. Visitors read them, send love, and are nudged to call their own
 * parents; parents living alone are shown where to get help.
 */
@Component({
  selector: 'app-parents-voices',
  imports: [DonatePill, RouterLink, TranslatePipe, LikeShare],
  styleUrl: '../../../styles/voices.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="pv-page">
      <header class="pv-hero">
        <app-donate-pill />
        <span class="pv-fly"></span><span class="pv-fly"></span><span class="pv-fly"></span><span class="pv-fly"></span><span class="pv-fly"></span><span class="pv-fly"></span>
        <div class="container pv-hero-grid">
          <div>
            <span class="pv-eyebrow"><i class="bi bi-heart-fill"></i> {{ "Parents' Voices" | t }}</span>
            <h1>{{ 'Some parents are still' | t }} <em>{{ 'waiting for a call.' | t }}</em></h1>
            <p class="lead">{{ 'Stories from mothers and fathers whose children moved away or stopped calling. Read them, send them love — and then call your own.' | t }}</p>
            <div class="pv-hero-actions">
              <a class="btn btn-accent" routerLink="/parents-voices/share"><i class="bi bi-pencil-square"></i> {{ "Share a parent's story" | t }}</a>
              <a class="btn btn-ghost-light" href="#stories"><i class="bi bi-book"></i> {{ 'Read the stories' | t }}</a>
            </div>
            @if (total()) { <p class="pv-count"><i class="bi bi-chat-heart"></i> {{ '{n} stories shared' | t: { n: total() } }}</p> }
          </div>
          <div class="pv-window" aria-hidden="true"><span class="pv-moon"></span><div class="pane"></div><span class="pv-phone"><i class="bi bi-telephone-fill"></i></span></div>
        </div>
      </header>

      <main id="main" class="pb-5" tabindex="-1">
        <div class="container">
          @if (featured(); as f) {
          <div class="pv-card-wrap pv-featured-wrap">
            <a class="pv-featured" [routerLink]="['/parents-voices', f.publicId]">
              <div class="pv-media">
                @if (f.photoId) { <img [src]="file(f.photoId)" [alt]="f.title"> } @else { <span class="pv-ph"><i class="bi bi-house-heart-fill"></i></span> }
                <span class="pv-kind">@if (f.videoId) { <span><i class="bi bi-camera-video-fill"></i></span> } @if (f.voiceId) { <span><i class="bi bi-mic-fill"></i></span> }</span>
              </div>
              <div class="pv-featured-body">
                <span class="pv-badge"><i class="bi bi-star-fill"></i> {{ 'Featured story' | t }}</span>
                <span class="pv-who">{{ name(f) }}@if (f.place) { <small> · {{ f.place }}</small> }</span>
                <h2>{{ f.title }}</h2>
                <p class="pv-quote">“{{ short(f.story, 260) }}”</p>
                @if (f.wish) { <p class="small mb-0"><i class="bi bi-heart-fill text-danger"></i> {{ f.wish }}</p> }
                <span class="pv-read mt-2">{{ 'Read the story' | t }} <i class="bi bi-arrow-right"></i></span>
              </div>
            </a>
            <app-like-share class="pv-share" look="icon" [shareOnly]="true" [id]="f.publicId" [title]="f.title" [path]="'/parents-voices/' + f.publicId"
                            [image]="f.photoId ? file(f.photoId) : null" [video]="f.videoId ? file(f.videoId) : null" [caption]="caption(f)" />
          </div>
          }

          <div class="pv-section-head" id="stories">
            <h2>{{ 'Their stories' | t }}</h2>
            <a class="btn btn-outline-accent btn-sm" routerLink="/parents-voices/share"><i class="bi bi-plus-lg"></i> {{ 'Share a story' | t }}</a>
          </div>

          @if (state() === 'loading') {
            <p class="text-center text-muted py-5"><span class="spinner-border spinner-border-sm"></span> {{ 'Loading…' | t }}</p>
          } @else if (state() === 'error') {
            <p class="text-center text-muted py-5">{{ "We couldn't load the stories. Please try again in a moment." | t }}</p>
          } @else if (!rest().length && !featured()) {
            <div class="text-center py-5">
              <p class="text-muted mb-3">{{ 'No stories yet. Be the first to give a parent a voice.' | t }}</p>
              <a class="btn btn-accent" routerLink="/parents-voices/share">{{ "Share a parent's story" | t }}</a>
            </div>
          } @else {
            <div class="pv-grid">
              @for (s of rest(); track s.publicId) {
              <div class="pv-card-wrap">
                <a class="pv-card" [routerLink]="['/parents-voices', s.publicId]">
                  <div class="pv-media">
                    @if (s.photoId) { <img [src]="file(s.photoId)" [alt]="s.title" loading="lazy"> } @else { <span class="pv-ph"><i class="bi bi-house-heart-fill"></i></span> }
                    <span class="pv-kind">@if (s.videoId) { <span><i class="bi bi-camera-video-fill"></i></span> } @if (s.voiceId) { <span><i class="bi bi-mic-fill"></i></span> }</span>
                  </div>
                  <div class="pv-card-body">
                    <span class="pv-who">{{ name(s) }}@if (s.place) { <small> · {{ s.place }}</small> }</span>
                    <h3>{{ s.title }}</h3>
                    <p>{{ short(s.story, 150) }}</p>
                    <div class="pv-card-foot">
                      <span class="pv-loves"><i class="bi bi-heart-fill"></i> {{ s.loves }}</span>
                      <span class="pv-read">{{ 'Read' | t }} <i class="bi bi-arrow-right"></i></span>
                    </div>
                  </div>
                </a>
                <app-like-share class="pv-share" look="icon" [shareOnly]="true" [id]="s.publicId" [title]="s.title" [path]="'/parents-voices/' + s.publicId"
                                [image]="s.photoId ? file(s.photoId) : null" [video]="s.videoId ? file(s.videoId) : null" [caption]="caption(s)" />
              </div>
              }
            </div>
            @if (items().length < total()) {
              <div class="text-center mt-4"><button class="btn btn-outline-accent" type="button" (click)="more()">{{ 'Show more' | t }}</button></div>
            }
          }

          <!-- For a parent living alone -->
          <section class="pv-help">
            <span class="pv-help-icon" aria-hidden="true"><i class="bi bi-telephone-inbound-fill"></i></span>
            <div>
              <h2>{{ 'Living alone? You are not alone.' | t }}</h2>
              <p>{{ 'If you are a parent living on your own and need help or someone to talk to, call the free Elder Line (India): 14567. You can also share your story here — we will read every word.' | t }}</p>
            </div>
            <div class="d-flex flex-column gap-2">
              <a class="btn btn-accent" href="tel:14567"><i class="bi bi-telephone"></i> {{ 'Call 14567' | t }}</a>
              <a class="btn btn-outline-accent" routerLink="/parents-voices/share">{{ 'Share my story' | t }}</a>
            </div>
          </section>

          <!-- For the children -->
          <section class="pv-call">
            <h2>{{ 'Your parents might be waiting too.' | t }}</h2>
            <p>{{ 'A five-minute call can be the best part of their week. Call them today — and save their birthdays so you never miss one.' | t }}</p>
            <div class="d-flex flex-wrap justify-content-center gap-2">
              <a class="btn btn-white" routerLink="/account" fragment="reminders"><i class="bi bi-bell"></i> {{ 'Add family dates' | t }}</a>
              <a class="btn btn-ghost-light" routerLink="/upload"><i class="bi bi-camera"></i> {{ 'Take a selfie together' | t }}</a>
            </div>
          </section>
        </div>
      </main>
    </div>`
})
export class ParentsVoices {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly items = signal<ParentStory[]>([]);
  protected readonly total = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  /** The featured story (staff choose it) goes on top; the rest in the grid. */
  protected readonly featured = computed(() => this.items().find(s => s.isFeatured) ?? null);
  protected readonly rest = computed(() => this.items().filter(s => s !== this.featured()));
  private page = 1;

  constructor() {
    inject(SeoService).set({ title: "Parents' Voices", description: 'Stories from parents whose children moved away or stopped calling. Read them, send love, and call your own.', path: '/parents-voices' });
    this.load();
  }

  private load(): void {
    this.http.get<{ items: ParentStory[]; total: number }>(STORIES_API, { params: { page: this.page, pageSize: PAGE } })
      .pipe(retry({ count: this.inBrowser ? 3 : 0, delay: (_, n) => timer(2000 * n) }))
      .subscribe({
        next: r => { this.items.update(l => [...l, ...r.items]); this.total.set(r.total); this.state.set('ready'); },
        error: () => this.state.set(this.items().length ? 'ready' : 'error')
      });
  }

  protected more(): void { this.page++; this.load(); }
  protected file(id: string | null): string { return storyFile(id); }
  protected name(s: ParentStory): string { return parentName(s, k => this.i18n.t(k)); }
  protected short(text: string, max: number): string { return excerpt(text, max); }
  /** Shared with the photo / video: who they are, the opening lines and their wish. */
  protected caption(s: ParentStory): string {
    return `${this.name(s)}: ${excerpt(s.story, 140)}${s.wish ? ` ❤ ${s.wish}` : ''} #ParentsVoices`;
  }
}
