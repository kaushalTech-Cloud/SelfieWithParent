import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProblemDetails } from '../../core/api/api.models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';

interface FamilyDate { publicId: string; name: string; relation: string; occasion: string; month: number; day: number; year: number | null; daysUntil: number; }
interface Settings { emailReminders: boolean; thenNowNudges: boolean; }

/**
 * My account › Family dates & reminders: parents' and grandparents' birthdays, anniversaries and remembrance days. The site
 * emails a reminder 3 days before and on the day (with ideas: a selfie together, a photo frame, Then & Now), and shows a
 * notice here on the site. Also the yearly "take it again" Then & Now email. Both can be switched off.
 */
@Component({
  selector: 'app-family-dates',
  imports: [FormsModule, TranslatePipe],
  template: `
    <section class="card-soft" id="reminders">
      <h2 class="acc-title">{{ 'Family dates & reminders' | t }}</h2>
      <p class="small text-muted">{{ "Save your parents' and grandparents' birthdays and anniversaries. We'll remind you 3 days before and on the day — a perfect time for a selfie together." | t }}</p>

      @if (dates().length) {
        <ul class="list-unstyled fd-list mb-3">
          @for (d of dates(); track d.publicId) {
            <li class="fd-item">
              <i class="bi" [class]="icon(d.occasion)"></i>
              <div class="me-auto">
                <div class="fw-semibold">{{ d.name }} · {{ d.occasion | t }}</div>
                <small class="text-muted">{{ dayText(d.month, d.day) }}@if (d.year) { · {{ d.year }} } ·
                  {{ (d.daysUntil === 0 ? 'Today' : d.daysUntil === 1 ? 'Tomorrow' : 'In {n} days') | t: { n: d.daysUntil } }}</small>
              </div>
              <button type="button" class="btn btn-link btn-sm p-0 me-2" (click)="edit(d)" [attr.aria-label]="('Edit' | t) + ': ' + d.name"><i class="bi bi-pencil"></i></button>
              <button type="button" class="btn btn-link btn-sm p-0 text-danger" (click)="remove(d)" [attr.aria-label]="('Remove' | t) + ': ' + d.name"><i class="bi bi-trash"></i></button>
            </li>
          }
        </ul>
      }

      @if (adding()) {
        <form class="fd-form row g-2" (ngSubmit)="save()">
          <div class="col-md-6">
            <label class="form-label small" for="fdName">{{ 'Who' | t }}</label>
            <input class="form-control" id="fdName" name="fdName" maxlength="60" required [placeholder]="'e.g. Papa, Nani, Maa and Papa' | t" [(ngModel)]="form.name">
          </div>
          <div class="col-md-6">
            <label class="form-label small" for="fdRelation">{{ 'Relation' | t }}</label>
            <select class="form-select" id="fdRelation" name="fdRelation" [(ngModel)]="form.relation">
              @for (r of relations; track r) { <option [value]="r">{{ r | t }}</option> }
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label small" for="fdOccasion">{{ 'Occasion' | t }}</label>
            <select class="form-select" id="fdOccasion" name="fdOccasion" [(ngModel)]="form.occasion">
              @for (o of occasions; track o) { <option [value]="o">{{ o | t }}</option> }
            </select>
          </div>
          <div class="col-4 col-md-2">
            <label class="form-label small" for="fdDay">{{ 'Day' | t }}</label>
            <select class="form-select" id="fdDay" name="fdDay" [(ngModel)]="form.day">
              @for (n of days(); track n) { <option [ngValue]="n">{{ n }}</option> }
            </select>
          </div>
          <div class="col-8 col-md-3">
            <label class="form-label small" for="fdMonth">{{ 'Month' | t }}</label>
            <select class="form-select" id="fdMonth" name="fdMonth" [(ngModel)]="form.month">
              @for (m of months(); track m.n) { <option [ngValue]="m.n">{{ m.name }}</option> }
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small" for="fdYear">{{ 'Year (optional)' | t }}</label>
            <input class="form-control" id="fdYear" name="fdYear" inputmode="numeric" maxlength="4" [(ngModel)]="form.year">
          </div>
          @if (error()) { <div class="col-12 small text-danger" role="alert">{{ error() }}</div> }
          <div class="col-12 d-flex gap-2">
            <button type="submit" class="btn btn-accent btn-sm" [disabled]="busy()">{{ 'Save date' | t }}</button>
            <button type="button" class="btn btn-light btn-sm" (click)="adding.set(false)">{{ 'Cancel' | t }}</button>
          </div>
        </form>
      } @else if (dates().length < 20) {
        <button type="button" class="btn btn-outline-accent btn-sm" (click)="add()"><i class="bi bi-calendar-plus"></i> {{ 'Add a family date' | t }}</button>
      }

      @if (settings(); as s) {
        <div class="mt-3 pt-3 border-top">
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" role="switch" id="remEmail" [checked]="s.emailReminders" (change)="setSettings({ emailReminders: $any($event.target).checked })">
            <label class="form-check-label" for="remEmail">{{ 'Email me before family dates' | t }}</label>
          </div>
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" role="switch" id="remThenNow" [checked]="s.thenNowNudges" (change)="setSettings({ thenNowNudges: $any($event.target).checked })">
            <label class="form-check-label" for="remThenNow">{{ "Once a year, remind me to retake a selfie I shared (Then & Now)" | t }}</label>
          </div>
        </div>
      }
    </section>`,
  styles: `
    .fd-list { display: grid; gap: .5rem; }
    .fd-item { display: flex; align-items: center; gap: .75rem; padding: .6rem .8rem; border-radius: .6rem; background: rgba(15,91,92,.05); }
    .fd-item > .bi { font-size: 1.3rem; color: var(--accent); }
  `
})
export class FamilyDates implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly api = `${environment.apiBaseUrl}/api/v1/me`;

  protected readonly relations = ['Mother', 'Father', 'Parents', 'Grandmother', 'Grandfather', 'Grandparents', 'Step-parent', 'Guardian', 'Other'];
  protected readonly occasions = ['Birthday', 'Anniversary', 'Remembrance'];
  protected readonly dates = signal<FamilyDate[]>([]);
  protected readonly settings = signal<Settings | null>(null);
  protected readonly adding = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected form = this.blank();
  private editing: string | null = null;

  protected readonly months = computed(() => {
    const f = new Intl.DateTimeFormat(this.i18n.locale(), { month: 'long', timeZone: 'UTC' });
    return Array.from({ length: 12 }, (_, i) => ({ n: i + 1, name: f.format(new Date(Date.UTC(2024, i, 1))) }));
  });

  ngOnInit(): void { void this.load(); }

  private blank() { return { name: '', relation: 'Mother', occasion: 'Birthday', day: 1, month: 1, year: '' }; }

  protected days(): number[] {
    const max = this.form.month === 2 ? 29 : [4, 6, 9, 11].includes(this.form.month) ? 30 : 31;
    return Array.from({ length: max }, (_, i) => i + 1);
  }

  protected dayText(month: number, day: number): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, month - 1, day)));
  }

  protected icon(occasion: string): string {
    return occasion === 'Anniversary' ? 'bi-hearts' : occasion === 'Remembrance' ? 'bi-flower1' : 'bi-cake2';
  }

  private async load(): Promise<void> {
    try {
      const [dates, settings] = await Promise.all([
        firstValueFrom(this.http.get<FamilyDate[]>(`${this.api}/family-dates`)),
        firstValueFrom(this.http.get<Settings>(`${this.api}/reminders`))]);
      this.dates.set(dates);
      this.settings.set(settings);
    } catch { /* the section shows without the list */ }
  }

  protected add(): void { this.editing = null; this.form = this.blank(); this.error.set(''); this.adding.set(true); }

  protected edit(d: FamilyDate): void {
    this.editing = d.publicId;
    this.form = { name: d.name, relation: d.relation, occasion: d.occasion, day: d.day, month: d.month, year: d.year ? String(d.year) : '' };
    this.error.set('');
    this.adding.set(true);
  }

  protected async save(): Promise<void> {
    const f = this.form;
    if (!f.name.trim()) { this.error.set(this.i18n.t('Add their name.')); return; }
    if (f.year && !/^\d{4}$/.test(String(f.year))) { this.error.set(this.i18n.t('Enter the year as 4 digits, e.g. 1960.')); return; }
    this.busy.set(true);
    this.error.set('');
    const body = { name: f.name.trim(), relation: f.relation, occasion: f.occasion, month: f.month, day: Math.min(f.day, this.days().length), year: f.year ? Number(f.year) : null };
    try {
      if (this.editing) await firstValueFrom(this.http.put(`${this.api}/family-dates/${this.editing}`, body));
      else await firstValueFrom(this.http.post(`${this.api}/family-dates`, body));
      this.adding.set(false);
      await this.load();
    } catch (e) {
      const p = e instanceof HttpErrorResponse ? e.error as ProblemDetails : null;
      this.error.set(this.i18n.t(p?.title ?? "We couldn't save it. Please try again."));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(d: FamilyDate): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`${this.api}/family-dates/${d.publicId}`));
      this.dates.update(list => list.filter(x => x.publicId !== d.publicId));
    } catch { /* stays in the list */ }
  }

  protected async setSettings(change: Partial<Settings>): Promise<void> {
    const next = { ...this.settings()!, ...change };
    this.settings.set(next);
    try { this.settings.set(await firstValueFrom(this.http.put<Settings>(`${this.api}/reminders`, next))); }
    catch { await this.load(); }
  }
}
