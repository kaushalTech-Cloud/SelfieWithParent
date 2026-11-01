import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProblemDetails } from '../../core/api/api.models';
import { FeaturesService } from '../../core/features.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';

export interface Streak {
  current: number; best: number; total: number; thisWeek: boolean; thisWeekKind: string | null; badges: string[];
  recentWeeks: string[]; weekStart: string; reminders: boolean;
}

/** Badge → icon and name (earned at 4, 12, 26 and 52 weeks in a row). */
export const STREAK_BADGES: Record<string, { icon: string; name: string }> = {
  month: { icon: 'bi-award', name: '1 month of gratitude' },
  season: { icon: 'bi-award-fill', name: '3 months of gratitude' },
  'half-year': { icon: 'bi-trophy', name: '6 months of gratitude' },
  year: { icon: 'bi-trophy-fill', name: 'A whole year of gratitude' }
};

/**
 * My account › Gratitude streak: once a week the visitor marks how they stayed in touch with their parents (a call, a visit,
 * a selfie together, a message). Weeks in a row make the streak ("Called Maa 4 weeks in a row") and earn badges shown on
 * their public profile. On Sundays the site emails a reminder to keep the streak; it can be switched off here.
 */
@Component({
  selector: 'app-gratitude-streak',
  imports: [FormsModule, TranslatePipe],
  template: `
    @if (features.on('streaks')) {
    <section class="card-soft" id="streak">
      <h2 class="acc-title">{{ 'Gratitude streak' | t }}</h2>
      <p class="small text-muted">{{ 'Once a week, mark how you stayed in touch with your parents. Weeks in a row make your streak.' | t }}</p>

      @if (s(); as s) {
        <div class="gs-top">
          <div class="gs-flame" [class.gs-cold]="!s.current"><i class="bi bi-fire"></i><strong>{{ s.current }}</strong></div>
          <div>
            <div class="fw-semibold">{{ (s.current === 1 ? '1 week in a row' : '{n} weeks in a row') | t: { n: s.current } }}</div>
            <small class="text-muted">{{ 'Best: {n} weeks' | t: { n: s.best } }} · {{ 'Total: {n} weeks' | t: { n: s.total } }}</small>
          </div>
        </div>

        <div class="gs-weeks" aria-hidden="true">
          @for (w of weeks(); track w.start) { <span [class.on]="w.on" [class.now]="w.now" [title]="w.start"></span> }
        </div>

        @if (s.thisWeek) {
          <p class="gs-done"><i class="bi bi-check-circle-fill"></i> {{ 'This week: {kind}. Lovely!' | t: { kind: (kindName(s.thisWeekKind) | t) } }}</p>
        } @else {
          @if (weekend()) { <p class="gs-nudge" role="status"><i class="bi bi-bell-fill"></i> {{ "It's the weekend — have you called your parents this week?" | t }}</p> }
          <p class="small fw-semibold mb-2">{{ 'This week I…' | t }}</p>
          <div class="gs-kinds">
            @for (k of kinds; track k.key) {
              <button type="button" class="btn btn-outline-accent btn-sm" [disabled]="busy()" (click)="checkIn(k.key)"><i class="bi" [class]="k.icon"></i> {{ k.name | t }}</button>
            }
          </div>
          <input class="form-control form-control-sm mt-2" maxlength="140" [placeholder]="'Add a note (optional), e.g. Called Maa after dinner' | t" [(ngModel)]="note" name="gsNote" aria-label="Note">
        }
        @if (error()) { <p class="small text-danger mt-2 mb-0" role="alert">{{ error() }}</p> }

        @if (s.badges.length) {
          <div class="gs-badges">
            @for (b of s.badges; track b) { <span class="gs-badge"><i class="bi" [class]="badge(b).icon"></i> {{ badge(b).name | t }}</span> }
          </div>
        } @else {
          <p class="small text-muted mt-3 mb-0"><i class="bi bi-award"></i> {{ 'Keep it going 4 weeks in a row to earn your first badge.' | t }}</p>
        }

        <div class="form-check form-switch mt-3 pt-3 border-top">
          <input class="form-check-input" type="checkbox" role="switch" id="gsRemind" [checked]="s.reminders" (change)="setReminders($any($event.target).checked)">
          <label class="form-check-label" for="gsRemind">{{ 'Email me on Sundays to keep my streak' | t }}</label>
        </div>
      }
    </section>
    }`,
  styles: `
    .gs-top { display: flex; align-items: center; gap: 1rem; margin-bottom: .75rem; }
    .gs-flame { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #ff9a3c, #e8505b); color: #fff; line-height: 1; }
    .gs-flame .bi { font-size: 1.1rem; } .gs-flame strong { font-size: 1.35rem; }
    .gs-flame.gs-cold { background: #cfd8dc; }
    .gs-weeks { display: flex; gap: 4px; margin-bottom: .9rem; }
    .gs-weeks span { flex: 1; height: 8px; border-radius: 4px; background: rgba(15,91,92,.12); }
    .gs-weeks span.on { background: var(--accent); }
    .gs-weeks span.now { outline: 2px solid var(--accent); outline-offset: 1px; }
    .gs-kinds { display: flex; flex-wrap: wrap; gap: .5rem; }
    .gs-done { color: #1f7a4d; font-weight: 600; margin: 0; }
    .gs-nudge { background: #fff4e0; border-radius: .6rem; padding: .5rem .75rem; font-size: .9rem; }
    .gs-badges { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: 1rem; }
    .gs-badge { display: inline-flex; align-items: center; gap: .35rem; padding: .3rem .7rem; border-radius: 999px; background: #fff4e0; color: #8a5300; font-size: .85rem; font-weight: 600; }
  `
})
export class GratitudeStreak implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  protected readonly features = inject(FeaturesService);
  private readonly api = `${environment.apiBaseUrl}/api/v1/me/streak`;

  protected readonly kinds = [
    { key: 'call', icon: 'bi-telephone-fill', name: 'Called them' },
    { key: 'visit', icon: 'bi-house-heart-fill', name: 'Visited them' },
    { key: 'selfie', icon: 'bi-camera-fill', name: 'Took a selfie together' },
    { key: 'message', icon: 'bi-chat-heart-fill', name: 'Sent a message' }
  ];
  protected readonly s = signal<Streak | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected note = '';

  /** The last 12 weeks, oldest first. */
  protected readonly weeks = computed(() => {
    const s = this.s();
    if (!s) return [];
    const marked = new Set(s.recentWeeks.map(w => w.slice(0, 10)));
    const monday = new Date(s.weekStart + 'T00:00:00Z');
    return Array.from({ length: 12 }, (_, i) => {
      const start = new Date(monday.getTime() - (11 - i) * 7 * 86400000).toISOString().slice(0, 10);
      return { start, on: marked.has(start), now: i === 11 };
    });
  });

  ngOnInit(): void { void this.load(); }

  /** Friday to Sunday: the on-site "have you called this week?" notice. */
  protected weekend(): boolean { return [0, 5, 6].includes(new Date().getDay()); }

  protected kindName(k: string | null): string { return this.kinds.find(x => x.key === k)?.name ?? ''; }
  protected badge(b: string) { return STREAK_BADGES[b] ?? { icon: 'bi-award', name: b }; }

  private async load(): Promise<void> {
    try { this.s.set(await firstValueFrom(this.http.get<Streak>(this.api))); } catch { /* the card stays empty */ }
  }

  protected async checkIn(kind: string): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      this.s.set(await firstValueFrom(this.http.post<Streak>(`${this.api}/check-in`, { kind, note: this.note.trim() || null })));
      this.note = '';
    } catch (e) {
      const p = e instanceof HttpErrorResponse ? e.error as ProblemDetails : null;
      this.error.set(this.i18n.t(p?.title ?? "We couldn't save it. Please try again."));
    } finally {
      this.busy.set(false);
    }
  }

  protected async setReminders(on: boolean): Promise<void> {
    this.s.update(s => s && { ...s, reminders: on });
    try { await firstValueFrom(this.http.put(`${this.api}/reminders`, { on })); } catch { await this.load(); }
  }
}
