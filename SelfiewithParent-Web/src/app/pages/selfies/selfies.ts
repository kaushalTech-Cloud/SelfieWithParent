import { HttpClient } from '@angular/common/http';
import { Component, ViewEncapsulation, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { retry, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { LikeShare } from '../../shared/like-share';
import { SeoService } from '../../core/seo.service';
import { DonatePill } from '../../shared/donate-pill';

interface GalleryItem {
  publicId: string; kind: 'real' | 'ai' | 'memory' | 'family'; name: string; firstName: string; parentName: string;
  relation: string | null; memoryYear: number | null;
  place: string | null; message: string | null; approvedAtUtc: string; photoId: string | null; videoId: string | null;
  voiceId?: string | null; likes?: number; isWinner?: boolean;
}
interface GalleryPage { tab: string; items: GalleryItem[]; total: number; page: number; pageSize: number; counts: Record<string, number>; }

const TABS = [
  { id: 'parent', label: 'Selfie with Parent', icon: 'bi-camera' },
  { id: 'grand', label: 'With Grandparents', icon: 'bi-people' },
  { id: 'ai', label: 'AI Selfies', icon: 'bi-stars' },
  { id: 'family', label: 'Family', icon: 'bi-people-fill' },
  { id: 'video', label: 'Videos', icon: 'bi-camera-video' }
] as const;
const PER_PAGE = 12;

/**
 * Latest selfies: everything visitors shared that the review team approved (stored in the database), by category,
 * newest first. Names are first names only; contact details are never shown.
 */
@Component({
  selector: 'app-selfies',
  imports: [DonatePill, RouterLink, TranslatePipe, LikeShare],
  templateUrl: './selfies.html',
  // The design's stylesheet, as it is (it styles the whole page)
  styleUrl: '../../../styles/selfies.css',
  encapsulation: ViewEncapsulation.None,
  host: { '(document:keydown.escape)': 'close()' }
})
export class Selfies {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);

  protected readonly tabs = TABS;
  protected readonly tab = computed(() => {
    const t = this.query()?.get('tab');
    return TABS.some(x => x.id === t) ? t! : TABS[0].id;
  });
  protected readonly page = computed(() => Math.max(1, Number(this.query()?.get('page')) || 1));
  protected readonly data = signal<GalleryPage | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  /** The selfie open in the viewer (photo, or video when watching). */
  protected readonly viewing = signal<{ item: GalleryItem; video: boolean } | null>(null);

  protected readonly current = computed(() => TABS.find(t => t.id === this.tab())!);
  protected readonly pages = computed(() => Math.max(1, Math.ceil((this.data()?.total ?? 0) / PER_PAGE)));
  protected readonly pageList = computed(() => {
    const n = this.pages(), p = this.page();
    const list: (number | null)[] = [];
    for (let i = 1; i <= n; i++) {
      if (i === 1 || i === n || Math.abs(i - p) <= 1) list.push(i);
      else if (list[list.length - 1] !== null) list.push(null);   // "…"
    }
    return list;
  });

  constructor() {
    inject(SeoService).set({ title: 'Latest Selfies', description: 'Selfies, family photos and videos shared by families across the country.', path: '/selfies' });
    effect(() => this.load(this.tab(), this.page()));
  }

  private request = 0;

  private load(tab: string, page: number): void {
    const id = ++this.request;
    this.state.set(this.data() ? 'ready' : 'loading');
    this.http.get<GalleryPage>(`${environment.apiBaseUrl}/api/v1/selfies/gallery`, { params: { tab, page, pageSize: PER_PAGE } })
      .pipe(retry({ count: 3, delay: (_, n) => timer(2000 * n) }))
      .subscribe({
        next: d => { if (id === this.request) { this.data.set(d); this.state.set('ready'); } },
        error: () => { if (id === this.request) this.state.set(this.data() ? 'ready' : 'error'); }
      });
  }

  /** "Kaushal with Mom and Dad" in the visitor's language; a family shows its family name. */
  protected title(s: GalleryItem): string {
    return s.kind === 'family' ? s.parentName : this.i18n.t('{name} with {parent}', { name: s.firstName, parent: s.parentName });
  }

  protected file(id: string | null): string { return id ? `${environment.apiBaseUrl}/api/v1/selfies/files/${id}` : ''; }

  protected showing(): string {
    const d = this.data();
    if (!d?.total) return '';
    const from = (this.page() - 1) * PER_PAGE + 1;
    return this.i18n.t('Showing {from}–{to} of {total}', { from, to: Math.min(from + PER_PAGE - 1, d.total), total: d.total });
  }

  protected open(item: GalleryItem, video: boolean): void { this.viewing.set({ item, video }); }
  protected close(): void { this.viewing.set(null); }

  /** The page a share points to: the story for a photo, the gallery spot for a video. */
  protected sharePath(item: GalleryItem): string {
    return item.photoId ? `/selfies/${item.publicId}` : `/selfies?tab=${this.tab()}&page=${this.page()}#s-${item.publicId}`;
  }
}
