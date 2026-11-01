import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, PLATFORM_ID, RESPONSE_INIT, ViewEncapsulation, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { SeoService } from '../../core/seo.service';
import { LikeShare } from '../../shared/like-share';
import { contestDays } from '../community/contest.models';
import { DonatePill } from '../../shared/donate-pill';
import { FeaturesService } from '../../core/features.service';

interface StoryItem {
  publicId: string; kind: 'real' | 'ai' | 'memory' | 'family'; name: string; firstName: string; parentName: string;
  relation: string | null; memoryYear: number | null; place: string | null; message: string | null; approvedAtUtc: string;
  photoId: string | null; videoId: string | null; voiceId?: string | null; likes?: number;
}
interface StoryWin { publicId: string; kind: string; title: string; startsAtUtc: string; endsAtUtc: string; }
interface StoryResponse { tab: string; item: StoryItem; wins?: StoryWin[]; }

const TAB_LABEL: Record<string, string> = {
  parent: 'Selfie with Parent', grand: 'With Grandparents', ai: 'AI Selfies', family: 'Family', video: 'Videos', thennow: 'Then & Now'
};

/**
 * One approved selfie's story page (from the design's story.html): the photo, who and where, the message, sharing,
 * a printable certificate of gratitude, and more stories from the same category. Opened from a photo in the gallery.
 */
@Component({
  selector: 'app-story',
  imports: [DonatePill, RouterLink, TranslatePipe, LikeShare],
  templateUrl: './story.html',
  // Gallery tiles + share menu come from the gallery's stylesheet (the story styles are in features.css)
  styleUrl: '../../../styles/selfies.css',
  encapsulation: ViewEncapsulation.None,
  host: { '(document:keydown.escape)': 'certOpen.set(false)' }
})
export class Story {
  private readonly http = inject(HttpClient);
  protected readonly i18n = inject(I18nService);
  protected readonly features = inject(FeaturesService);
  private readonly seo = inject(SeoService);
  private readonly response = inject(RESPONSE_INIT, { optional: true });
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  protected readonly story = signal<StoryResponse | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  protected readonly more = signal<StoryItem[]>([]);
  protected readonly certOpen = signal(false);
  protected readonly today = new Date();

  protected readonly tabLabel = computed(() => TAB_LABEL[this.story()?.tab ?? 'parent'] ?? '');
  protected readonly url = computed(() => `${environment.siteUrl}/selfies/${this.id()}`);

  constructor() {
    effect(() => this.load(this.id()));
  }

  private load(id: string): void {
    if (!/^[0-9a-f-]{36}$/i.test(id)) { this.notFound(); return; }
    this.state.set('loading');
    this.more.set([]);
    this.http.get<StoryResponse>(`${environment.apiBaseUrl}/api/v1/selfies/${id}`).subscribe({
      next: s => {
        this.story.set(s);
        this.state.set('ready');
        const title = this.title(s.item);
        this.seo.set({ title, description: s.item.message ?? 'A selfie shared on Selfie with Parent.', path: `/selfies/${id}`,
          image: s.item.photoId ? this.file(s.item.photoId) : undefined, imageAlt: title,
          video: s.item.videoId ? this.file(s.item.videoId) : undefined });
        // More stories from the same category
        this.http.get<{ items: StoryItem[] }>(`${environment.apiBaseUrl}/api/v1/selfies/gallery`, { params: { tab: s.tab, pageSize: 5 } })
          .subscribe({ next: g => this.more.set(g.items.filter(x => x.publicId !== id && x.photoId).slice(0, 4)), error: () => {} });
      },
      error: (e: HttpErrorResponse) => e.status === 404 ? this.notFound() : this.state.set('error')
    });
  }

  private notFound(): void {
    this.story.set(null);
    this.state.set('missing');
    if (this.response) this.response.status = 404;
    this.seo.set({ title: 'Selfie not found', description: 'This selfie is not available.', path: `/selfies/${this.id()}`, noIndex: true });
  }

  /** "Kaushal with Mom and DAD" in the visitor's language; a family shows its family name. */
  protected title(s: StoryItem): string {
    return s.kind === 'family' ? s.parentName : this.i18n.t('{name} with {parent}', { name: s.firstName, parent: s.parentName });
  }

  protected file(id: string | null): string { return id ? `${environment.apiBaseUrl}/api/v1/selfies/files/${id}` : ''; }

  /** A date in the visitor's language, e.g. "28 Oct 2026" / "28 October 2026". */
  protected dateText(iso: string, month: 'short' | 'long'): string {
    try { return new Date(iso).toLocaleDateString(this.i18n.locale(), { day: 'numeric', month, year: 'numeric' }); }
    catch { return iso.slice(0, 10); }
  }

  // ---------- Voice note ----------

  protected readonly playing = signal(false);
  protected readonly voiceAt = signal(0);
  protected readonly voiceLength = signal(0);
  /** Waveform bars (their heights are only decoration, from the selfie's id). */
  protected readonly bars = computed(() => {
    const seed = [...this.id()].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 997, 7);
    return Array.from({ length: 38 }, (_, i) => 20 + Math.abs(Math.sin(i * 1.7 + seed)) * 80);
  });
  protected readonly barsOn = computed(() => this.voiceLength() ? Math.round(this.voiceAt() / this.voiceLength() * 38) : 0);

  protected togglePlay(audio: HTMLAudioElement): void {
    if (audio.paused) void audio.play(); else audio.pause();
  }

  protected onVoiceTime(audio: HTMLAudioElement): void {
    this.voiceAt.set(audio.currentTime);
    if (Number.isFinite(audio.duration)) this.voiceLength.set(audio.duration);
  }

  protected clock(seconds: number): string {
    const s = Math.floor(seconds || 0);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  /** "Photo of the Week" (in the visitor's language) or the festival contest's name. */
  protected winTitle(w: StoryWin): string { return w.kind === 'week' ? this.i18n.t('Photo of the Week') : w.title; }
  protected winDays(w: StoryWin): string { return contestDays(w, this.i18n.locale()); }

  protected print(): void { if (this.inBrowser) window.print(); }
}
