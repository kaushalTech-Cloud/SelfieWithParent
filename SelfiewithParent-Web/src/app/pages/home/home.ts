import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { of, switchMap } from 'rxjs';
import { Component, PLATFORM_ID, ViewEncapsulation, computed, effect, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { SeoService } from '../../core/seo.service';
import { siteImage } from '../../core/site-images';
import { ContactService } from '../../core/contact.service';
import { FeaturesService } from '../../core/features.service';
import { ContestSpotlight } from '../community/contest-spotlight';
import { environment } from '../../../environments/environment';
import { SiteLink } from '../../shared/site-link';
import { FEATURED } from './home.data';
import { HomeApiResponse, buildHomeView } from './home-content';
import { FeatureShowcase } from './feature-showcase';
import { HeroSlider } from './hero-slider';

interface FamilyDate { publicId: string; name: string; occasion: string; month: number; day: number; daysUntil: number; }

@Component({
  selector: 'app-home',
  imports: [RouterLink, FormsModule, TranslatePipe, ContestSpotlight, HeroSlider, SiteLink, FeatureShowcase],
  templateUrl: './home.html',
  styleUrl: '../../../styles/home.css',
  encapsulation: ViewEncapsulation.None
})
export class Home {
  protected readonly i18n = inject(I18nService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly featured = FEATURED;
  /** The latest approved selfies with a photo (from the database); the sample pictures until there are some. */
  protected readonly featuredNow = signal<{ name: string; city: string; img: string }[]>(FEATURED);
  /** Pictures stored in the database (site.Media), served by the API. */
  protected readonly img = siteImage;
  // ---------- Content from the admin site (Home page) over the built-in defaults: never blank ----------
  private readonly content = signal<HomeApiResponse | null>(null);
  protected readonly features = inject(FeaturesService);
  /** Sections staff switched off in the admin site (Home page; the English content decides for every language). */
  private readonly hidden = computed(() => new Set(this.content()?.en?.hiddenSections ?? []));
  protected hide(section: string): boolean { return this.hidden().has(section); }
  protected readonly view = computed(() => {
    const c = this.content();
    return buildHomeView(c?.en ?? null, c?.local ?? null, c?.numbers ?? null, s => this.i18n.t(s), new Date().getMonth());
  });
  /** Under the first slide: the real number of selfies once there are some. */
  protected readonly trustLine = computed(() => {
    const n = this.content()?.numbers?.selfies ?? 0;
    return n > 0 ? this.i18n.t('{n} selfies shared · 6 languages · free for everyone', { n: n.toLocaleString(this.i18n.locale()) })
      : this.i18n.t('25,000+ selfies shared · 6 languages · free for everyone');
  });

  // Question of the day — changes daily, "Another question" shuffles
  private readonly qIndex = signal(Math.floor(Date.now() / 86_400_000));
  protected readonly question = computed(() => { const q = this.view().questions; return q[this.qIndex() % q.length]; });

  // Birthday & anniversary reminders: the visitor's family dates (saved in the database, emailed before the day)
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly familyDates = signal<FamilyDate[]>([]);
  protected readonly reminderBusy = signal(false);
  protected readonly reminderError = signal('');
  protected newReminder = { name: '', date: '', type: 'Birthday' as 'Birthday' | 'Anniversary' };
  protected contactSent = signal(false);
  protected readonly contactSending = signal(false);
  protected readonly contactError = signal('');
  /** Email, phone and address in "Get in touch", set by staff in the admin site. */
  protected readonly contact = inject(ContactService);
  protected tel(phone: string): string { return ContactService.telHref(phone); }

  /** Sends the contact form; staff read it in the admin site (Messages). */
  protected sendContact(form: NgForm): void {
    const v = form.value as { cname: string; cemail: string; csubject?: string; cmessage: string };
    this.contactSending.set(true);
    this.contactError.set('');
    this.contactHttp.post(`${environment.apiBaseUrl}/api/v1/contact`,
      { name: v.cname, email: v.cemail, subject: v.csubject || null, message: v.cmessage }).subscribe({
      next: () => { this.contactSending.set(false); this.contactSent.set(true); form.resetForm(); },
      error: (e: HttpErrorResponse) => {
        this.contactSending.set(false);
        const p = e.error as { title?: string; errors?: Record<string, string[]> } | null;
        this.contactError.set(this.i18n.t(p?.errors ? Object.values(p.errors).flat()[0] : p?.title ?? "We couldn't send your message. Please try again."));
      }
    });
  }
  private readonly contactHttp = inject(HttpClient);

  constructor() {
    // In the browser only: the home page is built ahead of time, and new approvals must show without a rebuild
    const http = inject(HttpClient);
    if (this.isBrowser) {
      // The admin site's content for the visitor's language (again when they switch language)
      effect(() => {
        const lang = this.i18n.lang();
        http.get<HomeApiResponse>(`${environment.apiBaseUrl}/api/v1/site/home`, { params: { lang } })
          .subscribe({ next: r => this.content.set(r), error: () => { /* the built-in content stays */ } });
      });
      effect(() => { if (this.auth.isSignedIn()) this.loadFamilyDates(); else this.familyDates.set([]); });
    }
    if (isPlatformBrowser(inject(PLATFORM_ID))) http.get<{ items: { kind: string; firstName: string; parentName: string; place: string | null; photoId: string | null }[] }>(
      `${environment.apiBaseUrl}/api/v1/selfies/gallery`, { params: { tab: 'featured', pageSize: 12 } }).pipe(
        // Featured Stories: the selfies staff featured; the latest approved ones until there are some
        switchMap(res => res.items.some(x => x.photoId) ? of(res) : http.get<typeof res>(`${environment.apiBaseUrl}/api/v1/selfies/gallery`, { params: { tab: 'latest', pageSize: 12 } }))
      ).subscribe({
      next: res => {
        const real = res.items.filter(x => x.photoId).slice(0, 6)
          .map(x => ({ name: x.kind === 'family' ? x.parentName : this.i18n.t('{name} with {parent}', { name: x.firstName, parent: x.parentName }), city: x.place ?? '', img: `${environment.apiBaseUrl}/api/v1/selfies/files/${x.photoId}` }));
        if (real.length) this.featuredNow.set(real);
      },
      error: () => { /* keep the sample pictures */ }
    });
    inject(SeoService).set({
      title: 'Selfie with Parent | Celebrate the people who raised you',
      description: 'Selfie with Parent is a campaign that celebrates parents and elders. Share a selfie with your parent and tell the world why they matter.',
      path: '/'
    });
  }

  protected formatNumber(n: number): string { return n.toLocaleString(this.i18n.locale()) + '+'; }

  protected nextQuestion(): void { this.qIndex.update(i => i + 1); }

  protected askOnWhatsApp(): void {
    const msg = `${this.question()}\n\n— ${this.i18n.t('asked via Selfie with Parent')}`;
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  }

  protected dayText(month: number, day: number): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, month - 1, day)));
  }

  private loadFamilyDates(): void {
    this.contactHttp.get<FamilyDate[]>(`${environment.apiBaseUrl}/api/v1/me/family-dates`)
      .subscribe({ next: d => this.familyDates.set(d.slice(0, 5)), error: () => {} });
  }

  /** Saves the date as a family date (sign-in first); it's emailed 3 days before and on the day. */
  protected addReminder(): void {
    const r = this.newReminder;
    if (!this.auth.isSignedIn()) {
      void this.router.navigate(['/login'], { queryParams: { returnUrl: '/account#reminders' } });
      return;
    }
    if (!r.name.trim() || !r.date) return;
    const [y, m, d] = r.date.split('-').map(Number);
    this.reminderBusy.set(true);
    this.reminderError.set('');
    this.contactHttp.post(`${environment.apiBaseUrl}/api/v1/me/family-dates`, {
      name: r.name.trim(), relation: 'Other', occasion: r.type, month: m, day: d, year: y && y <= new Date().getFullYear() ? y : null
    }).subscribe({
      next: () => { this.reminderBusy.set(false); this.newReminder = { name: '', date: '', type: 'Birthday' }; this.loadFamilyDates(); },
      error: (e: HttpErrorResponse) => {
        this.reminderBusy.set(false);
        this.reminderError.set(this.i18n.t((e.error as { title?: string } | null)?.title ?? "We couldn't save it. Please try again."));
      }
    });
  }

  protected removeReminder(r: FamilyDate): void {
    this.contactHttp.delete(`${environment.apiBaseUrl}/api/v1/me/family-dates/${r.publicId}`)
      .subscribe({ next: () => this.familyDates.update(list => list.filter(x => x !== r)), error: () => {} });
  }
}
