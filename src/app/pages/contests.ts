import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { problemMessage } from '../core/problem';

interface AdminContest {
  publicId: string; kind: 'week' | 'festival'; title: string; startsAtUtc: string; endsAtUtc: string;
  closedAtUtc: string | null; winnerLikes: number | null; winnerPublicId: string | null; winnerReference: string | null;
}

/**
 * Winners: Photo of the Week (made and decided by itself every week) and festival contests that super admins / admins add
 * (e.g. "Diwali 2026", 1–7 November). The most-liked photo approved during a contest wins: a badge, a certificate and a
 * golden Winner frame on the public site, and a congratulations email.
 */
@Component({
  selector: 'app-contests',
  imports: [FormsModule, DatePipe],
  template: `
    <section class="panel">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <h2 class="mb-0">Winners &amp; contests</h2>
        <div class="d-flex gap-2">
          @if (isSuperAdmin()) {
            <button class="btn btn-light btn-sm" type="button" (click)="runNow()" [disabled]="busy()" title="Decide ended contests now (it also happens by itself every 30 minutes)">
              <i class="bi bi-lightning"></i> Decide now</button>
          }
          <button class="btn btn-accent btn-sm" type="button" (click)="startAdd()"><i class="bi bi-plus-lg"></i> Festival contest</button>
        </div>
      </div>
      <p class="small text-muted">Photo of the Week runs every Monday–Sunday (UTC) by itself. The most-liked photo approved during a contest wins
        (the owner's own like doesn't count; a tie goes to the one approved first).</p>

      @if (editing() !== null) {
        <form class="row g-2 align-items-end border rounded p-2 mb-3" (ngSubmit)="save()">
          <div class="col-12 col-lg-4"><label class="form-label small" for="cTitle">Name</label>
            <input class="form-control form-control-sm" id="cTitle" name="cTitle" maxlength="80" required placeholder="e.g. Diwali 2026" [(ngModel)]="form.title"></div>
          <div class="col-6 col-lg-3"><label class="form-label small" for="cStart">First day</label>
            <input class="form-control form-control-sm" id="cStart" name="cStart" type="date" required [(ngModel)]="form.startsOn"></div>
          <div class="col-6 col-lg-3"><label class="form-label small" for="cEnd">Last day</label>
            <input class="form-control form-control-sm" id="cEnd" name="cEnd" type="date" required [(ngModel)]="form.endsOn"></div>
          <div class="col-12 col-lg-2 d-flex gap-1">
            <button class="btn btn-accent btn-sm" type="submit" [disabled]="busy()">Save</button>
            <button class="btn btn-light btn-sm" type="button" (click)="editing.set(null)">Cancel</button>
          </div>
        </form>
      }
      @if (error()) { <div class="alert alert-danger small" role="alert">{{ error() }}</div> }
      @if (notice()) { <div class="alert alert-success small" role="status">{{ notice() }}</div> }

      @if (loading()) {
        <p class="text-muted small"><span class="spinner-border spinner-border-sm"></span> Loading…</p>
      } @else {
        <div class="table-responsive">
          <table class="table table-sm align-middle">
            <thead><tr><th>Contest</th><th>Dates (UTC)</th><th>Status</th><th>Winner</th><th></th></tr></thead>
            <tbody>
              @for (c of contests(); track c.publicId) {
                <tr>
                  <td><i class="bi" [class.bi-calendar-week]="c.kind === 'week'" [class.bi-stars]="c.kind === 'festival'"></i> {{ c.title }}</td>
                  <td class="small">{{ c.startsAtUtc + 'Z' | date: 'd MMM' : 'UTC' }} – {{ lastDay(c) | date: 'd MMM y' : 'UTC' }}</td>
                  <td><span class="badge" [class.text-bg-success]="status(c) === 'Running'" [class.text-bg-secondary]="status(c) === 'Decided'"
                            [class.text-bg-info]="status(c) === 'Upcoming'" [class.text-bg-warning]="status(c) === 'Deciding…'">{{ status(c) }}</span></td>
                  <td>
                    @if (c.winnerPublicId) {
                      <a [href]="site + '/selfies/' + c.winnerPublicId" target="_blank" rel="noopener"><i class="bi bi-trophy-fill text-warning"></i> {{ c.winnerReference }}</a>
                      <span class="small text-muted"> · {{ c.winnerLikes }} {{ c.winnerLikes === 1 ? 'like' : 'likes' }}</span>
                    } @else if (c.closedAtUtc) { <span class="small text-muted">No votes</span> }
                  </td>
                  <td class="text-end">
                    @if (c.kind === 'festival' && !c.closedAtUtc) {
                      <button class="btn btn-link btn-sm p-0 me-2" type="button" (click)="startEdit(c)" title="Change"><i class="bi bi-pencil"></i></button>
                      <button class="btn btn-link btn-sm p-0 text-danger" type="button" (click)="remove(c)" title="Remove"><i class="bi bi-trash"></i></button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="text-muted small">No contests yet — this week's Photo of the Week starts by itself.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>`
})
export class Contests implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly api = `${environment.apiBaseUrl}/api/v1/admin/contests`;
  protected readonly site = environment.publicSiteUrl;

  protected readonly contests = signal<AdminContest[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  /** null: not editing; '': adding; otherwise the contest being changed. */
  protected readonly editing = signal<string | null>(null);
  protected form = { title: '', startsOn: '', endsOn: '' };

  protected isSuperAdmin(): boolean { return this.auth.staffRoles().includes('SuperAdmin'); }

  ngOnInit(): void { void this.load(); }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try { this.contests.set(await firstValueFrom(this.http.get<AdminContest[]>(this.api))); this.error.set(''); }
    catch (e) { this.error.set(problemMessage(e)); }
    finally { this.loading.set(false); }
  }

  /** The last day (the end is not included). */
  protected lastDay(c: AdminContest): Date { return new Date(new Date(c.endsAtUtc + 'Z').getTime() - 86_400_000); }

  protected status(c: AdminContest): string {
    const now = Date.now();
    if (c.closedAtUtc) return 'Decided';
    if (new Date(c.startsAtUtc + 'Z').getTime() > now) return 'Upcoming';
    return new Date(c.endsAtUtc + 'Z').getTime() > now ? 'Running' : 'Deciding…';
  }

  protected startAdd(): void { this.form = { title: '', startsOn: '', endsOn: '' }; this.editing.set(''); this.notice.set(''); }

  protected startEdit(c: AdminContest): void {
    this.form = { title: c.title, startsOn: c.startsAtUtc.slice(0, 10), endsOn: this.lastDay(c).toISOString().slice(0, 10) };
    this.editing.set(c.publicId);
    this.notice.set('');
  }

  protected async save(): Promise<void> {
    if (!this.form.title.trim() || !this.form.startsOn || !this.form.endsOn) { this.error.set('Give the contest a name and both days.'); return; }
    this.busy.set(true);
    this.error.set('');
    const id = this.editing();
    try {
      if (id) await firstValueFrom(this.http.put(`${this.api}/${id}`, this.form));
      else await firstValueFrom(this.http.post(this.api, this.form));
      this.editing.set(null);
      this.notice.set(`Saved "${this.form.title.trim()}".`);
      await this.load();
    } catch (e) { this.error.set(problemMessage(e)); }
    finally { this.busy.set(false); }
  }

  protected async remove(c: AdminContest): Promise<void> {
    if (!confirm(`Remove the contest "${c.title}"?`)) return;
    try { await firstValueFrom(this.http.delete(`${this.api}/${c.publicId}`)); await this.load(); }
    catch (e) { this.error.set(problemMessage(e)); }
  }

  protected async runNow(): Promise<void> {
    this.busy.set(true);
    try {
      const told = await firstValueFrom(this.http.post<number>(`${this.api}/run`, null));
      this.notice.set(told ? `Decided — ${told} winner(s) emailed.` : 'Up to date: nothing new to decide.');
      await this.load();
    } catch (e) { this.error.set(problemMessage(e)); }
    finally { this.busy.set(false); }
  }
}
