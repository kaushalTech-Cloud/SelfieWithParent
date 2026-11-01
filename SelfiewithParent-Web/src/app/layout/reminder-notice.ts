import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth/auth.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/t.pipe';

interface UpcomingDate { publicId: string; name: string; relation: string; occasion: string; date: string; daysAway: number; turning: number | null; }
interface Anniversary { publicId: string; parentName: string; years: number; photoId: string; }
interface Upcoming { dates: UpcomingDate[]; anniversaries: Anniversary[]; }

const DISMISS_KEY = 'swp-notice-dismissed';

/**
 * A slim notice under the menu when I'm signed in: a family date in the next week ("Papa's birthday is in 3 days") or a
 * selfie I shared about a year ago ("take it again"), with one button to act on it. Closed for the rest of the day.
 */
@Component({
  selector: 'app-reminder-notice',
  imports: [RouterLink, TranslatePipe],
  template: `
    @if (notice(); as n) {
      <div class="reminder-notice" role="status">
        <div class="container d-flex align-items-center gap-2 flex-wrap">
          <i class="bi" [class]="n.icon"></i>
          <span class="me-auto">{{ n.text }}</span>
          <a class="btn btn-sm btn-light" [routerLink]="n.link" [queryParams]="n.query">{{ n.action | t }}</a>
          <button type="button" class="btn-close btn-close-white" (click)="dismiss()" [attr.aria-label]="'Close' | t"></button>
        </div>
      </div>
    }`,
  styles: `
    .reminder-notice { background: linear-gradient(90deg, var(--primary-dark, #0a3d3e), var(--primary, #0f5b5c)); color: #fff; padding: .5rem 0; font-size: .92rem; }
    .reminder-notice .bi { color: #ffd166; font-size: 1.1rem; }
  `
})
export class ReminderNotice {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18nService);
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly upcoming = signal<Upcoming | null>(null);
  private readonly dismissed = signal(this.readDismissed());
  private loaded = false;

  constructor() {
    // Load once I'm signed in (the notice is only for me); forget it when I sign out
    effect(() => {
      const signedIn = this.auth.isSignedIn();
      if (!this.inBrowser) return;
      if (!signedIn) { this.loaded = false; this.upcoming.set(null); return; }
      if (this.loaded) return;
      this.loaded = true;
      this.http.get<Upcoming>(`${environment.apiBaseUrl}/api/v1/me/reminders/upcoming`)
        .subscribe({ next: u => this.upcoming.set(u), error: () => {} });
    });
  }

  /** The most pressing thing: a family date within a week first, then a selfie to take again. */
  protected readonly notice = computed(() => {
    const u = this.upcoming();
    if (!u || this.dismissed()) return null;
    const d = u.dates.find(x => x.daysAway <= 7);
    if (d) {
      const when = d.daysAway === 0 ? 'today' : d.daysAway === 1 ? 'tomorrow' : 'soon';
      const key = {
        Birthday: { today: "Today is {name}'s birthday", tomorrow: "{name}'s birthday is tomorrow", soon: "{name}'s birthday is in {n} days" },
        Anniversary: { today: "Today is {name}'s anniversary", tomorrow: "{name}'s anniversary is tomorrow", soon: "{name}'s anniversary is in {n} days" },
        Remembrance: { today: 'Remembering {name} today', tomorrow: 'Remembering {name} tomorrow', soon: 'Remembering {name} in {n} days' }
      }[d.occasion as 'Birthday' | 'Anniversary' | 'Remembrance'][when];
      const remembrance = d.occasion === 'Remembrance';
      return {
        icon: remembrance ? 'bi-flower1' : d.occasion === 'Anniversary' ? 'bi-hearts' : 'bi-cake2',
        text: this.i18n.t(key, { name: d.name, n: d.daysAway }),
        action: remembrance ? 'Light a candle' : 'Share a selfie together',
        link: remembrance ? '/memories' : '/upload',
        query: null as Record<string, string> | null
      };
    }
    const a = u.anniversaries[0];
    if (a) return {
      icon: 'bi-clock-history',
      text: this.i18n.t(a.years === 1 ? 'A year ago you shared a selfie with {parent}.' : '{n} years ago you shared a selfie with {parent}.',
        { parent: a.parentName, n: a.years }),
      action: 'Take it again',
      link: '/then-now',
      query: { again: a.publicId } as Record<string, string> | null
    };
    return null;
  });

  protected dismiss(): void {
    this.dismissed.set(true);
    try { localStorage.setItem(DISMISS_KEY, new Date().toDateString()); } catch { /* private window */ }
  }

  private readDismissed(): boolean {
    try { return typeof localStorage !== 'undefined' && localStorage.getItem(DISMISS_KEY) === new Date().toDateString(); } catch { return false; }
  }
}
