import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, retry, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { SeoService } from '../../core/seo.service';
import { DonatePill } from '../../shared/donate-pill';

interface Tribute {
  publicId: string; firstName: string; parentName: string; relation: string | null; memoryYear: number | null;
  place: string | null; message: string | null; photoId: string | null; candles: number;
}

const PAGE = 12;

/**
 * Memory Wall (from the design): approved "in loving memory" tributes. Signed-in visitors light a candle (one each per
 * tribute, counted in the database); everyone sees the counts. "Add a tribute" opens the upload form.
 */
@Component({
  selector: 'app-memories',
  imports: [DonatePill, RouterLink, TranslatePipe],
  templateUrl: './memories.html'
})
export class Memories {
  private readonly http = inject(HttpClient);
  protected readonly i18n = inject(I18nService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly tributes = signal<Tribute[]>([]);
  protected readonly total = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly mine = signal<Set<string>>(new Set());
  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal('');
  /** Candles lit on the whole wall (from the API; kept up to date when I light / put out mine). */
  protected readonly candleTotal = signal(0);
  private page = 1;

  constructor() {
    inject(SeoService).set({ title: 'Memory Wall', description: 'A quiet place to remember the parents and grandparents who shaped us.', path: '/memories' });
    this.load();
    if (this.inBrowser) void this.loadMine();
  }

  private load(): void {
    this.http.get<{ items: Tribute[]; total: number; counts: Record<string, number> }>(`${environment.apiBaseUrl}/api/v1/selfies/gallery`, { params: { tab: 'memory', page: this.page, pageSize: PAGE } })
      .pipe(retry({ count: this.inBrowser ? 3 : 0, delay: (_, n) => timer(2000 * n) }))
      .subscribe({
        next: r => {
          this.tributes.update(list => [...list, ...r.items]);
          this.total.set(r.total);
          this.candleTotal.set(r.counts?.['candles'] ?? 0);
          this.state.set('ready');
        },
        error: () => this.state.set(this.tributes().length ? 'ready' : 'error')
      });
  }

  protected more(): void { this.page++; this.load(); }

  /** The tributes I've lit a candle for (signed-in visitors). */
  private async loadMine(): Promise<void> {
    await this.auth.init();
    if (!this.auth.isSignedIn()) return;
    try {
      const ids = await firstValueFrom(this.http.get<string[]>(`${environment.apiBaseUrl}/api/v1/selfies/candles/mine`));
      this.mine.set(new Set(ids));
    } catch { /* candles still show; mine just aren't marked */ }
  }

  protected file(id: string | null): string { return id ? `${environment.apiBaseUrl}/api/v1/selfies/files/${id}` : ''; }

  protected lit(t: Tribute): boolean { return this.mine().has(t.publicId); }

  protected count(n: number | undefined): string { return (n ?? 0).toLocaleString(this.i18n.locale()); }

  /** Light / put out my candle. Signed out: sign in first, then come back here. */
  protected async toggle(t: Tribute): Promise<void> {
    await this.auth.init();
    if (!this.auth.isSignedIn()) {
      await this.router.navigate(['/login'], { queryParams: { returnUrl: '/memories' } });
      return;
    }
    const lit = !this.lit(t);
    this.busy.set(t.publicId);
    this.error.set('');
    try {
      const r = await firstValueFrom(this.http.put<{ candles: number; lit: boolean }>(`${environment.apiBaseUrl}/api/v1/selfies/${t.publicId}/candle`, { lit }));
      this.candleTotal.update(n => n + (r.candles - t.candles));
      this.tributes.update(list => list.map(x => x.publicId === t.publicId ? { ...x, candles: r.candles } : x));
      this.mine.update(s => { const n = new Set(s); if (r.lit) n.add(t.publicId); else n.delete(t.publicId); return n; });
    } catch {
      this.error.set(this.i18n.t('Something went wrong. Please try again.'));
    } finally {
      this.busy.set(null);
    }
  }
}
