import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { problemMessage } from '../core/problem';

interface WeekNumber { thisWeek: number; lastWeek: number; }
interface QueueItem { publicId: string; reference: string; kind: string; name: string; createdAtUtc: string; hasPhoto: boolean; hasVideo: boolean; hasVoice: boolean; }
interface DashboardData {
  pending: number; oldestPendingAtUtc: string | null; approvedWeek: WeekNumber; sharedWeek: WeekNumber; videosWeek: WeekNumber; newVisitorsWeek: WeekNumber;
  total: number; approved: number; rejected: number; uploaders: number; photos: number; videos: number; voiceNotes: number; visitors: number;
  last7Days: { day: string; count: number }[]; byKind: Record<string, number>; queue: QueueItem[] | null;
}

const KIND: Record<string, string> = { real: 'Selfie', ai: 'AI-made', memory: 'In loving memory', family: 'Family', thennow: 'Then & Now', frame: 'Photo frame', reel: 'Reel' };

/** Dashboard as in the design, with real numbers from the database (selfies, videos, voice notes, visitors). */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, DecimalPipe, NgTemplateOutlet],
  template: `
    @if (loading()) {
      <p class="text-muted small"><span class="spinner-border spinner-border-sm"></span> Loading…</p>
    } @else if (error()) {
      <div class="alert alert-danger small" role="alert">{{ error() }} <button class="btn btn-link btn-sm p-0 align-baseline" type="button" (click)="load()">Try again</button></div>
    } @else if (data(); as d) {
      @if (busy(d); as b) {
        <!-- Festival peaks: more is waiting than the team can review in a day -->
        <div class="alert alert-warning d-flex flex-wrap align-items-center gap-2 small" role="alert">
          <i class="bi bi-exclamation-triangle-fill"></i>
          <span class="me-auto"><strong>Busy time:</strong> {{ d.pending | number }} waiting for review, the oldest for {{ age(d.oldestPendingAtUtc) }}.
            {{ b }}</span>
          @if (isReviewer()) { <a class="btn btn-sm btn-warning" routerLink="/queue">Open review queue</a> }
        </div>
      }
      <div class="row g-3 mb-4">
        <div class="col-6 col-xl-3">
          <div class="kpi"><small>Waiting for review</small><div class="v">{{ d.pending | number }}</div>
            <span class="d" [class.warn]="d.pending" [class.text-muted]="!d.pending">{{ d.pending ? 'Oldest: ' + age(d.oldestPendingAtUtc) : 'All caught up' }}</span></div>
        </div>
        <div class="col-6 col-xl-3">
          <div class="kpi"><small>Approved this week</small><div class="v">{{ d.approvedWeek.thisWeek | number }}</div>
            <ng-container [ngTemplateOutlet]="trend" [ngTemplateOutletContext]="{ $implicit: d.approvedWeek }" /></div>
        </div>
        <div class="col-6 col-xl-3">
          <div class="kpi"><small>Videos received</small><div class="v">{{ d.videos | number }}</div>
            <span class="d text-muted">{{ d.videosWeek.thisWeek | number }} this week · {{ d.voiceNotes | number }} voice notes</span></div>
        </div>
        <div class="col-6 col-xl-3">
          <div class="kpi"><small>Visitors</small><div class="v">{{ d.visitors | number }}</div>
            <span class="d text-muted">{{ d.newVisitorsWeek.thisWeek | number }} new this week · {{ d.uploaders | number }} have shared</span></div>
        </div>
      </div>

      <div class="row g-4">
        <div class="col-xl-8">
          @if (d.queue) {
            <section class="panel mb-4">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h2 class="mb-0">Review queue</h2>
                <a class="small link-accent" routerLink="/queue">Open queue <i class="bi bi-arrow-right"></i></a>
              </div>
              @for (q of d.queue; track q.publicId) {
                <div class="dash-row">
                  <span class="dash-icon"><i class="bi" [class.bi-camera-video]="q.hasVideo && !q.hasPhoto" [class.bi-image]="q.hasPhoto"></i></span>
                  <div class="me-auto">
                    <div class="fw-semibold">{{ q.name }} · {{ q.reference }}</div>
                    <div class="small text-muted">{{ kind(q.kind) }} · {{ media(q) }} · {{ q.createdAtUtc + 'Z' | date: 'd MMM, HH:mm' }}</div>
                  </div>
                  <a class="btn btn-sm btn-light" routerLink="/queue">Review</a>
                </div>
              } @empty {
                <div class="empty-state"><i class="bi bi-check2-all"></i><p class="mb-0">All caught up — nothing waiting for review.</p></div>
              }
              @if (d.pending > d.queue.length) { <p class="small text-muted mt-2 mb-0">and {{ d.pending - d.queue.length }} more waiting.</p> }
            </section>
          }

          <section class="panel">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h2 class="mb-0">What's been shared</h2>
              @if (isReviewer()) { <a class="small link-accent" routerLink="/uploads">Uploads by visitor <i class="bi bi-arrow-right"></i></a> }
            </div>
            <div class="row g-3 text-center">
              @for (t of tiles(); track t.label) {
                <div class="col-6 col-md-4 col-lg-2"><div class="stat-tile"><i class="bi" [class]="t.icon"></i><strong>{{ t.value | number }}</strong><small>{{ t.label }}</small></div></div>
              }
            </div>
            <h3 class="dash-sub mt-4">By kind</h3>
            @for (k of kinds(); track k.kind) {
              <div class="kind-bar">
                <span class="label">{{ k.label }}</span>
                <span class="track"><span [style.width.%]="k.percent"></span></span>
                <span class="n">{{ k.count | number }}</span>
              </div>
            }
          </section>
        </div>

        <div class="col-xl-4">
          <section class="panel mb-4">
            <h2>Uploads, last 7 days</h2>
            <p class="small text-muted mb-3">{{ d.sharedWeek.thisWeek | number }} this week · {{ d.sharedWeek.lastWeek | number }} the week before</p>
            <div class="bars" role="img" [attr.aria-label]="chartLabel()">
              @for (b of bars(); track b.day) {
                <div [style.height.%]="b.height" [title]="b.count + ' on ' + b.label"><span>{{ b.short }}</span>@if (b.count) { <em>{{ b.count }}</em> }</div>
              }
            </div>
            <div style="height:24px"></div>
          </section>
          <section class="panel">
            <h2>Pick this year's winners</h2>
            <div class="empty-state small"><i class="bi bi-trophy"></i><p class="mb-0">Winners are chosen from approved selfies ({{ d.approved | number }} so far).</p></div>
            <a class="btn btn-accent btn-sm w-100 mt-2" routerLink="/winners">Go to winners</a>
          </section>
        </div>
      </div>
    }

    <ng-template #trend let-w>
      @let diff = w.thisWeek - w.lastWeek;
      <span class="d" [class.up]="diff > 0" [class.warn]="diff < 0" [class.text-muted]="diff === 0">
        @if (diff > 0) { <i class="bi bi-arrow-up"></i> } @else if (diff < 0) { <i class="bi bi-arrow-down"></i> }
        {{ w.lastWeek ? (diff >= 0 ? '+' : '') + diff + ' vs last week' : (w.thisWeek ? 'none last week' : 'none yet') }}
      </span>
    </ng-template>
  `
})
export class Dashboard implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  protected readonly data = signal<DashboardData | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly isReviewer = computed(() => this.auth.staffRoles().some(r => r === 'SuperAdmin' || r === 'Admin' || r === 'Moderator'));

  protected readonly tiles = computed(() => {
    const d = this.data();
    if (!d) return [];
    return [
      { label: 'Shared in total', value: d.total, icon: 'bi-collection' },
      { label: 'Approved', value: d.approved, icon: 'bi-check-circle' },
      { label: 'Rejected', value: d.rejected, icon: 'bi-x-circle' },
      { label: 'Photos', value: d.photos, icon: 'bi-image' },
      { label: 'Videos', value: d.videos, icon: 'bi-camera-video' },
      { label: 'Voice notes', value: d.voiceNotes, icon: 'bi-mic' }
    ];
  });

  protected readonly kinds = computed(() => {
    const d = this.data();
    if (!d) return [];
    const max = Math.max(1, ...Object.values(d.byKind));
    return Object.entries(KIND).map(([kind, label]) => ({ kind, label, count: d.byKind[kind] ?? 0, percent: (d.byKind[kind] ?? 0) / max * 100 }));
  });

  protected readonly bars = computed(() => {
    const days = this.data()?.last7Days ?? [];
    const max = Math.max(1, ...days.map(d => d.count));
    return days.map(d => {
      const date = new Date(d.day + 'T00:00:00');
      return {
        day: d.day, count: d.count, height: Math.max(4, d.count / max * 100),
        short: date.toLocaleDateString('en-GB', { weekday: 'short' }), label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      };
    });
  });

  protected readonly chartLabel = computed(() => 'Uploads per day: ' + this.bars().map(b => `${b.label} ${b.count}`).join(', '));

  ngOnInit(): void { void this.load(); }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.data.set(await firstValueFrom(this.http.get<DashboardData>(`${environment.apiBaseUrl}/api/v1/admin/dashboard`)));
    } catch (e) {
      this.error.set(problemMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected kind(k: string): string { return KIND[k] ?? k; }

  protected media(q: QueueItem): string {
    return [q.hasPhoto ? 'photo' : '', q.hasVideo ? 'video' : '', q.hasVoice ? 'voice note' : ''].filter(Boolean).join(' + ');
  }

  /** "15 hours", "3 days" since a time. */
  /** Thresholds for the "busy time" warning: this many waiting, or the oldest waiting this many hours. */
  static readonly BusyPending = 25;
  static readonly BusyHours = 24;

  /** A tip when the queue is building up (festival peaks), or null when it's under control. */
  protected busy(d: { pending: number; oldestPendingAtUtc: string | null }): string | null {
    const hours = d.oldestPendingAtUtc ? (Date.now() - new Date(d.oldestPendingAtUtc + 'Z').getTime()) / 3_600_000 : 0;
    if (d.pending < Dashboard.BusyPending && hours < Dashboard.BusyHours) return null;
    return 'Visitors wait to see their selfie: ask more moderators to help, and switch on "Auto-approve photo frames" in the review queue.';
  }

  protected age(utc: string | null): string {
    if (!utc) return '';
    const mins = Math.max(0, Math.round((Date.now() - new Date(utc + 'Z').getTime()) / 60000));
    if (mins < 60) return `${mins} min`;
    const hours = Math.round(mins / 60);
    return hours < 48 ? `${hours} hour${hours === 1 ? '' : 's'}` : `${Math.round(hours / 24)} days`;
  }
}
