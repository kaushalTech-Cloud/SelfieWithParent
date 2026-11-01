import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, PLATFORM_ID, RESPONSE_INIT, ViewEncapsulation, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { RichShareService } from '../../core/rich-share';
import { SeoService } from '../../core/seo.service';
import { ParentStory, STORIES_API, excerpt, parentName, storyFile, writtenByText } from './parent-stories.models';
import { DonatePill } from '../../shared/donate-pill';

/** /parents-voices/:id — one parent's story: their words, photo / video / voice note, their wish, and "send love". */
@Component({
  selector: 'app-parent-story',
  imports: [DonatePill, RouterLink, TranslatePipe],
  styleUrls: ['../../../styles/voices.css', '../../../styles/voices-story.css'],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="pv-page">
      @if (story(); as s) {
        <header class="pv-hero pv-story-hero">
          <app-donate-pill />
          <span class="pv-fly"></span><span class="pv-fly"></span><span class="pv-fly"></span><span class="pv-fly"></span>
          <div class="container">
            <a class="pv-back" routerLink="/parents-voices"><i class="bi bi-arrow-left"></i> {{ "Parents' Voices" | t }}</a>
            <h1>{{ s.title }}</h1>
            <div class="pv-meta">
              <span><i class="bi bi-person-heart"></i> {{ name(s) }}</span>
              @if (s.place) { <span><i class="bi bi-geo-alt"></i> {{ s.place }}</span> }
              <span><i class="bi bi-calendar-heart"></i> {{ date(s.approvedAtUtc) }}</span>
            </div>
            <!-- Send love / share straight away -->
            <div class="pv-top-actions">
              <button type="button" class="pv-pill" [class.on]="loved()" (click)="love()" [disabled]="busy()" [attr.aria-pressed]="loved()">
                <i class="bi" [class.bi-heart-fill]="loved()" [class.bi-heart]="!loved()"></i> {{ (loved() ? 'Love sent' : 'Send love') | t }} · {{ s.loves }}</button>
              <button type="button" class="pv-pill" (click)="share(s)" [disabled]="sharing()">
                @if (sharing()) { <span class="spinner-border spinner-border-sm"></span> } @else { <i class="bi bi-share"></i> }
                {{ (shareReady() ? 'Ready — tap to share' : 'Share') | t }}</button>
            </div>
          </div>
        </header>
        <!-- Phones: a floating Share button while scrolling -->
        <button type="button" class="pv-fab" (click)="share(s)" [disabled]="sharing()" [attr.aria-label]="'Share' | t">
          @if (sharing()) { <span class="spinner-border spinner-border-sm"></span> } @else { <i class="bi bi-share"></i> }
        </button>

        <main id="main" class="pb-5" tabindex="-1">
          <div class="container">
            <div class="pv-story">
              <div>
                @if (s.photoId) {
                  <figure class="pv-polaroid"><img [src]="file(s.photoId)" [alt]="s.title"><figcaption>{{ name(s) }}</figcaption></figure>
                } @else if (!s.videoId) {
                  <figure class="pv-polaroid"><div class="pv-media" style="aspect-ratio: 4 / 5"><span class="pv-ph"><i class="bi bi-house-heart-fill"></i></span></div><figcaption>{{ name(s) }}</figcaption></figure>
                }
                @if (s.videoId) {
                  <div class="pv-media-video"><video [src]="file(s.videoId)" controls playsinline preload="metadata"></video></div>
                }
                @if (s.voiceId) {
                  <div class="pv-voice">
                    <div class="lbl"><i class="bi bi-mic-fill"></i> {{ 'Hear it in their voice' | t }}</div>
                    <audio [src]="file(s.voiceId)" controls preload="metadata"></audio>
                  </div>
                }
              </div>

              <article class="pv-paper">
                <p class="pv-text">{{ s.story }}</p>
                <p class="pv-written">— {{ written(s) | t }}</p>
                @if (s.wish) {
                  <div class="pv-wish"><small>{{ 'If my children read this…' | t }}</small><p>“{{ s.wish }}”</p></div>
                }
                <div class="pv-actions">
                  <button type="button" class="pv-love-btn" [class.on]="loved()" (click)="love()" [disabled]="busy()" [attr.aria-pressed]="loved()">
                    <i class="bi" [class.bi-heart-fill]="loved()" [class.bi-heart]="!loved()"></i>
                    {{ (loved() ? 'Love sent' : 'Send love') | t }} · {{ s.loves }}
                  </button>
                  <button type="button" class="btn btn-outline-accent pv-share-btn" (click)="share(s)" [disabled]="sharing()">
                    @if (sharing()) { <span class="spinner-border spinner-border-sm"></span> } @else { <i class="bi bi-share"></i> }
                    {{ (shareReady() ? 'Ready — tap to share' : (s.photoId || s.videoId) && canShareFiles ? (s.videoId ? 'Share the video' : 'Share the photo') : 'Share') | t }}</button>
                  <a class="btn btn-light pv-share-btn" [href]="whatsApp(s)" target="_blank" rel="noopener"><i class="bi bi-whatsapp text-success"></i> WhatsApp</a>
                </div>
                @if (notice()) { <p class="small text-muted mt-2 mb-0" role="status">{{ notice() }}</p> }
              </article>
            </div>

            <section class="pv-call">
              <h2>{{ 'Your parents might be waiting too.' | t }}</h2>
              <p>{{ 'A five-minute call can be the best part of their week. Call them today — and save their birthdays so you never miss one.' | t }}</p>
              <div class="d-flex flex-wrap justify-content-center gap-2">
                <a class="btn btn-white" routerLink="/account" fragment="reminders"><i class="bi bi-bell"></i> {{ 'Add family dates' | t }}</a>
                <a class="btn btn-ghost-light" routerLink="/parents-voices"><i class="bi bi-chat-heart"></i> {{ 'Read more stories' | t }}</a>
              </div>
            </section>
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
          </div>
        </main>
      } @else {
        <main id="main" class="section status-page" tabindex="-1">
          <div class="container">
            <div class="status-card">
              @if (state() === 'loading') {
                <p class="text-muted mb-0"><span class="spinner-border spinner-border-sm"></span> {{ 'Loading…' | t }}</p>
              } @else {
                <div class="status-icon" aria-hidden="true"><i class="bi bi-chat-heart"></i></div>
                <h1 class="section-title">{{ (state() === 'missing' ? 'Story not found' : "We couldn't load this page") | t }}</h1>
                <p class="text-muted">{{ (state() === 'missing' ? 'It may have been removed, or the link is wrong.' : 'Please check your connection and try again.') | t }}</p>
                <a class="btn btn-accent" routerLink="/parents-voices"><i class="bi bi-arrow-left"></i> {{ "Parents' Voices" | t }}</a>
              }
            </div>
          </div>
        </main>
      }
    </div>`
})
export class ParentStoryPage {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly seo = inject(SeoService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly response = inject(RESPONSE_INIT, { optional: true });

  protected readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  protected readonly story = signal<ParentStory | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  protected readonly loved = signal(false);
  protected readonly busy = signal(false);
  protected readonly notice = signal('');

  constructor() { effect(() => this.load(this.id())); }

  private load(id: string): void {
    this.story.set(null);
    if (!/^[0-9a-f-]{36}$/i.test(id)) { this.notFound(); return; }
    this.state.set('loading');
    this.http.get<ParentStory>(`${STORIES_API}/${id}`).subscribe({
      next: s => {
        this.story.set(s);
        this.state.set('ready');
        this.seo.set({ title: s.title, description: excerpt(s.story, 155), path: `/parents-voices/${id}`, type: 'article',
          image: s.photoId ? storyFile(s.photoId) : undefined, imageAlt: `${s.title} — ${this.name(s)}`,
          video: s.videoId ? storyFile(s.videoId) : undefined });
        if (this.inBrowser) void this.loadMine(id);
      },
      error: (e: HttpErrorResponse) => e.status === 404 ? this.notFound() : this.state.set('error')
    });
  }

  private notFound(): void {
    this.state.set('missing');
    if (this.response) this.response.status = 404;
    this.seo.set({ title: 'Story not found', description: 'This story is not available.', path: `/parents-voices/${this.id()}`, noIndex: true });
  }

  private async loadMine(id: string): Promise<void> {
    await this.auth.init();
    if (!this.auth.isSignedIn()) return;
    try { this.loved.set((await firstValueFrom(this.http.get<string[]>(`${STORIES_API}/loves/mine`))).includes(id)); }
    catch { /* the count still shows */ }
  }

  /** Send / take back my love. Signed out: sign in first, then come back here. */
  protected async love(): Promise<void> {
    const s = this.story();
    if (!s) return;
    await this.auth.init();
    if (!this.auth.isSignedIn()) { await this.router.navigate(['/login'], { queryParams: { returnUrl: `/parents-voices/${s.publicId}` } }); return; }
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.http.put<{ loves: number; loved: boolean }>(`${STORIES_API}/${s.publicId}/love`, { loved: !this.loved() }));
      this.loved.set(r.loved);
      this.story.set({ ...s, loves: r.loves });
      this.notice.set(r.loved ? this.i18n.t('Thank you. Your love reaches them.') : '');
    } catch { this.notice.set(this.i18n.t('Something went wrong. Please try again.')); }
    finally { this.busy.set(false); }
  }

  private readonly rich = inject(RichShareService);
  protected readonly canShareFiles = this.rich.canShareFiles;
  protected readonly sharing = signal(false);
  protected readonly shareReady = signal(false);

  /** The photo or video with the story's opening lines and the link — just the link where files can't be shared. */
  protected async share(s: ParentStory): Promise<void> {
    const url = this.url(s);
    const text = `“${s.title}” — ${this.name(s)}
${excerpt(s.story, 160)}${s.wish ? `
❤ ${s.wish}` : ''}
#ParentsVoices #SelfieWithParent`;
    this.sharing.set(true);
    try {
      const r = await this.rich.share({ title: s.title, text, url, media: [
        s.videoId ? { url: storyFile(s.videoId), kind: 'video' } : s.photoId ? { url: storyFile(s.photoId), kind: 'photo' } : null] });
      this.shareReady.set(r === 'tap-again');
      if (r === 'unsupported') {
        try { await navigator.clipboard.writeText(url); this.notice.set(this.i18n.t('Link copied')); } catch { /* no clipboard */ }
      }
    } finally { this.sharing.set(false); }
  }

  protected whatsApp(s: ParentStory): string { return `https://wa.me/?text=${encodeURIComponent(`${s.title} — ${this.url(s)}`)}`; }
  private url(s: ParentStory): string { return `${this.inBrowser ? location.origin : 'https://www.selfiewithparent.org'}/parents-voices/${s.publicId}`; }

  protected file(id: string | null): string { return storyFile(id); }
  protected name(s: ParentStory): string { return parentName(s, k => this.i18n.t(k)); }
  protected written(s: ParentStory): string { return writtenByText(s); }
  protected date(utc: string): string {
    try { return new Date(utc + 'Z').toLocaleDateString(this.i18n.locale(), { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { return utc.slice(0, 10); }
  }
}
