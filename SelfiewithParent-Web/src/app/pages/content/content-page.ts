import { DecimalPipe, DOCUMENT, NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, PLATFORM_ID, RESPONSE_INIT, ViewEncapsulation, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map, retry, throwError, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { SeoService } from '../../core/seo.service';
import { ContentText } from '../../shared/content-text';
import { SiteLink } from '../../shared/site-link';
import { DonatePill } from '../../shared/donate-pill';

/** A block of a content page (built in the admin site). All values are plain text: shown as text, never as HTML. */
type Block = Record<string, any> & { id: string; type: string };

interface PageResponse { slug: string; language: string; title: string; description: string | null; blocks: Block[]; }

/**
 * Content pages managed in the admin site (About us, Our founder, Our journey, What we do, and any new page), at /<slug>.
 * The page comes from the API in the visitor's language (English wherever a translation is missing).
 */
@Component({
  selector: 'app-content-page',
  imports: [DonatePill, RouterLink, DecimalPipe, NgTemplateOutlet, TranslatePipe, SiteLink, ContentText],
  templateUrl: './content-page.html',
  // The About pages' stylesheet from the design, as it is (it styles the whole page)
  styleUrls: ['../../../styles/about.css', '../../../styles/about-modern.css'],
  encapsulation: ViewEncapsulation.None
})
export class ContentPage {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly seo = inject(SeoService);
  private readonly doc = inject(DOCUMENT);
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly response = inject(RESPONSE_INIT, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  protected readonly slug = toSignal(inject(ActivatedRoute).paramMap.pipe(map(p => p.get('slug') ?? '')), { initialValue: '' });
  protected readonly page = signal<PageResponse | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  /** FAQ: which question is open per block (the first one starts open). */
  protected readonly openFaq = signal<Record<string, string | null>>({});

  private cleanup: (() => void)[] = [];
  private request = 0;

  constructor() {
    effect(() => this.load(this.slug(), this.i18n.lang()));
    this.destroyRef.onDestroy(() => this.cleanup.forEach(f => f()));
  }

  private load(slug: string, lang: string): void {
    if (!slug) return;
    const id = ++this.request;
    // Same page in another language: keep showing it while the translation loads
    if (this.page()?.slug !== slug) this.state.set('loading');
    this.http.get<PageResponse>(`${environment.apiBaseUrl}/api/v1/pages/${encodeURIComponent(slug)}`, { params: { lang } })
      .pipe(
        // API busy (429), restarting or not reachable for a moment: keep trying in the browser (2s, 4s, 8s … up to every 30s)
        // and keep showing "loading". A missing page (404) is final. The server render doesn't wait.
        retry({
          count: this.inBrowser ? 8 : 0,
          delay: (err: HttpErrorResponse, attempt) => id === this.request && (err.status === 0 || err.status === 429 || err.status >= 500)
            ? timer(Math.min(2000 * 2 ** (attempt - 1), 30000))
            : throwError(() => err)
        })
      )
      .subscribe({
      next: p => {
        if (id !== this.request) return;
        this.page.set(p);
        this.state.set('ready');
        this.seo.set({ title: p.title, description: p.description ?? '', path: '/' + p.slug });
        if (this.inBrowser) setTimeout(() => this.enhance());
      },
      error: (e: HttpErrorResponse) => {
        if (id !== this.request) return;
        this.page.set(null);
        const missing = e.status === 404;
        this.state.set(missing ? 'missing' : 'error');
        if (this.response) this.response.status = missing ? 404 : 503;
        this.seo.set(missing
          ? { title: 'Page not found', description: 'This page does not exist.', path: '/' + slug, noIndex: true }
          : { title: 'Please try again', description: "This page couldn't be loaded.", path: '/' + slug, noIndex: true });
      }
    });
  }

  // ---------- Template helpers ----------

  /** The whole text is a placeholder (e.g. "[Founder Name]"). */
  protected isPh(text: unknown): boolean { return typeof text === 'string' && /^\s*\[[^\]]+\]\s*$/.test(text); }

  protected img(path: string | undefined): string {
    if (!path) return '';
    return path.startsWith('media/') ? `${environment.apiBaseUrl}/api/v1/${path}` : '/' + path;
  }

  /** The tab pointing at this page is highlighted. */
  protected isCurrent(url: string | undefined): boolean {
    return !!url && url.split(/[?#]/)[0].replace(/\/$/, '') === '/' + this.slug();
  }

  protected isNumber(v: unknown): v is number { return typeof v === 'number'; }

  protected cols(b: Block, fallback: number): string {
    const n = Math.min(4, Math.max(1, Number(b['columns']) || fallback));
    return n === 1 ? 'col-12' : n === 2 ? 'col-lg-6' : n === 3 ? 'col-md-4' : 'col-md-6 col-lg-3';
  }

  protected faqOpen(b: Block, itemId: string, index: number): boolean {
    const open = this.openFaq();
    return b.id in open ? open[b.id] === itemId : index === 0;
  }

  protected toggleFaq(b: Block, itemId: string, index: number): void {
    const isOpen = this.faqOpen(b, itemId, index);
    this.openFaq.update(o => ({ ...o, [b.id]: isOpen ? null : itemId }));
  }

  // ---------- Motion (browser only; everything is visible without it) ----------

  /** Reveal on scroll, count-up numbers and the timeline's progress line, as in the static design. */
  private enhance(): void {
    this.cleanup.forEach(f => f());
    this.cleanup = [];
    const win = this.doc.defaultView;
    if (!win || !('IntersectionObserver' in win)) return;
    const calm = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const root = this.doc.querySelector('app-content-page');
    if (!root) return;

    if (!calm) {
      this.doc.documentElement.classList.add('js-reveal');
      const io = new IntersectionObserver(entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }), { rootMargin: '0px 0px -10% 0px' });
      root.querySelectorAll('.reveal:not(.in)').forEach(el => io.observe(el));
      this.cleanup.push(() => io.disconnect());

      const locale = this.i18n.locale();
      const co = new IntersectionObserver(entries => entries.forEach(e => {
        if (!e.isIntersecting) return;
        co.unobserve(e.target);
        const el = e.target as HTMLElement, end = Number(el.dataset['count']);
        let t0 = 0;
        const tick = (t: number) => {
          t0 ||= t;
          const p = Math.min(1, (t - t0) / 1200);
          el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))).toLocaleString(locale);
          if (p < 1) win.requestAnimationFrame(tick);
        };
        win.requestAnimationFrame(tick);
      }), { threshold: .5 });
      root.querySelectorAll('[data-count]').forEach(el => co.observe(el));
      this.cleanup.push(() => co.disconnect());
    }

    root.querySelectorAll<HTMLElement>('.timeline').forEach(line => {
      const bar = line.querySelector<HTMLElement>('.tl-progress');
      if (!bar) return;
      if (calm) { bar.style.height = '100%'; return; }
      const update = () => {
        const r = line.getBoundingClientRect();
        bar.style.height = Math.min(1, Math.max(0, (win.innerHeight * .6 - r.top) / r.height)) * 100 + '%';
      };
      win.addEventListener('scroll', update, { passive: true });
      win.addEventListener('resize', update);
      update();
      this.cleanup.push(() => { win.removeEventListener('scroll', update); win.removeEventListener('resize', update); });
    });
  }
}
