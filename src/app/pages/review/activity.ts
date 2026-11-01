import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { problemMessage } from '../../core/problem';

interface ActivityItem {
  type: 'shared' | 'Approved' | 'Rejected'; atUtc: string; publicId: string; reference: string; kind: string; name: string;
  reviewer: string | null; note: string | null; hasPhoto: boolean; hasVideo: boolean; hasVoice: boolean;
}
interface ActivityPage { items: ActivityItem[]; total: number; page: number; pageSize: number; days: number; perDay: { day: string; shared: number; approved: number; rejected: number }[]; }

const KIND: Record<string, string> = { real: 'Selfie', ai: 'AI-made', memory: 'In loving memory', family: 'Family', thennow: 'Then & Now', frame: 'Photo frame', reel: 'Reel' };
const PAGE = 25;

/**
 * Super admins, admins and moderators: what happened — visitors sharing selfies / videos / voice notes, and review
 * decisions (who approved or rejected what, and why) — with a per-day chart. From the selfie tables (latest decision each).
 */
@Component({
  selector: 'app-activity',
  imports: [DatePipe, RouterLink],
  template: `
    <section class="panel mb-4">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <h2 class="mb-0">Activity</h2>
        <div class="d-flex flex-wrap gap-2">
          <div class="btn-group btn-group-sm" role="group" aria-label="Period">
            @for (d of [7, 30, 90]; track d) {
              <button class="btn btn-outline-secondary" type="button" [class.active]="days() === d" (click)="setDays(d)">{{ d }} days</button>
            }
          </div>
          <button class="btn btn-light btn-sm" type="button" (click)="load()" [disabled]="loading()"><i class="bi bi-arrow-clockwise"></i></button>
        </div>
      </div>
      @if (data(); as d) {
        <div class="activity-legend small text-muted mb-2">
          <span><i class="dot shared"></i> Shared {{ sum().shared }}</span>
          <span><i class="dot approved"></i> Approved {{ sum().approved }}</span>
          <span><i class="dot rejected"></i> Rejected {{ sum().rejected }}</span>
        </div>
        <div class="activity-chart" role="img" [attr.aria-label]="'Per day, last ' + d.days + ' days: ' + sum().shared + ' shared, ' + sum().approved + ' approved, ' + sum().rejected + ' rejected'">
          @for (b of bars(); track b.day) {
            <div class="col" [title]="b.label + ': ' + b.shared + ' shared, ' + b.approved + ' approved, ' + b.rejected + ' rejected'">
              <span class="bar shared" [style.height.%]="b.shared / max() * 100"></span>
              <span class="bar approved" [style.height.%]="b.approved / max() * 100"></span>
              <span class="bar rejected" [style.height.%]="b.rejected / max() * 100"></span>
              @if (b.showLabel) { <small>{{ b.short }}</small> }
            </div>
          }
        </div>
      }
    </section>

    <section class="panel">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h2 class="mb-0">What happened</h2>
        <div class="btn-group btn-group-sm" role="group" aria-label="Show">
          @for (f of [['all', 'Everything'], ['shared', 'Uploads'], ['reviewed', 'Decisions']]; track f[0]) {
            <button class="btn btn-outline-secondary" type="button" [class.active]="filter() === f[0]" (click)="setFilter(f[0])">{{ f[1] }}</button>
          }
        </div>
      </div>

      @if (loading()) {
        <p class="text-muted small py-3"><span class="spinner-border spinner-border-sm"></span> Loading…</p>
      } @else if (error()) {
        <div class="alert alert-danger small" role="alert">{{ error() }}</div>
      } @else if (data(); as d) {
        <ul class="activity-feed">
          @for (a of d.items; track a.type + a.publicId) {
            <li>
              <span class="feed-icon" [class.shared]="a.type === 'shared'" [class.approved]="a.type === 'Approved'" [class.rejected]="a.type === 'Rejected'">
                <i class="bi" [class.bi-cloud-arrow-up]="a.type === 'shared'" [class.bi-check-lg]="a.type === 'Approved'" [class.bi-x-lg]="a.type === 'Rejected'"></i>
              </span>
              <div class="me-auto">
                @if (a.type === 'shared') {
                  <div><strong>{{ a.name }}</strong> shared {{ media(a) }} <span class="text-muted">· {{ kind(a.kind) }} · {{ a.reference }}</span></div>
                } @else {
                  <div><strong>{{ a.reviewer ?? 'A staff member' }}</strong> {{ a.type === 'Approved' ? 'approved' : 'rejected' }} <strong>{{ a.name }}</strong>
                    <span class="text-muted">· {{ a.reference }}</span></div>
                  @if (a.note) { <div class="small text-muted">Reason: {{ a.note }}</div> }
                }
              </div>
              <span class="small text-muted text-nowrap">{{ a.atUtc + 'Z' | date: 'd MMM y, HH:mm' }}</span>
            </li>
          } @empty {
            <li class="text-muted small">Nothing happened in the last {{ d.days }} days.</li>
          }
        </ul>
        @if (pages() > 1) {
          <nav class="d-flex justify-content-center align-items-center gap-2 mt-3" aria-label="Pages">
            <button class="btn btn-sm btn-light" type="button" (click)="goPage(page() - 1)" [disabled]="page() === 1"><i class="bi bi-chevron-left"></i> Newer</button>
            <span class="small text-muted">Page {{ page() }} of {{ pages() }}</span>
            <button class="btn btn-sm btn-light" type="button" (click)="goPage(page() + 1)" [disabled]="page() >= pages()">Older <i class="bi bi-chevron-right"></i></button>
          </nav>
        }
        <p class="small text-muted mt-3 mb-0">Shows uploads and each upload's latest review decision. See who shared what on <a routerLink="/uploads">Uploads by visitor</a>.</p>
      }
    </section>
  `
})
export class Activity implements OnInit {
  private readonly http = inject(HttpClient);

  protected readonly days = signal(30);
  protected readonly filter = signal('all');
  protected readonly page = signal(1);
  protected readonly data = signal<ActivityPage | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly pages = computed(() => Math.max(1, Math.ceil((this.data()?.total ?? 0) / PAGE)));
  protected readonly sum = computed(() => (this.data()?.perDay ?? []).reduce(
    (t, d) => ({ shared: t.shared + d.shared, approved: t.approved + d.approved, rejected: t.rejected + d.rejected }), { shared: 0, approved: 0, rejected: 0 }));
  protected readonly max = computed(() => Math.max(1, ...(this.data()?.perDay ?? []).map(d => Math.max(d.shared, d.approved, d.rejected))));
  protected readonly bars = computed(() => {
    const list = this.data()?.perDay ?? [];
    const every = list.length > 30 ? 14 : list.length > 7 ? 5 : 1;
    return list.map((d, i) => {
      const date = new Date(d.day + 'T00:00:00');
      return { ...d, label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        short: list.length > 7 ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : date.toLocaleDateString('en-GB', { weekday: 'short' }),
        showLabel: (list.length - 1 - i) % every === 0 };
    });
  });

  ngOnInit(): void { void this.load(); }

  protected setDays(d: number): void { this.days.set(d); this.page.set(1); void this.load(); }
  protected setFilter(f: string): void { this.filter.set(f); this.page.set(1); void this.load(); }
  protected goPage(n: number): void { this.page.set(n); void this.load(); }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.data.set(await firstValueFrom(this.http.get<ActivityPage>(`${environment.apiBaseUrl}/api/v1/admin/selfies/activity`,
        { params: { filter: this.filter(), days: this.days(), page: this.page(), pageSize: PAGE } })));
    } catch (e) {
      this.error.set(problemMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected kind(k: string): string { return KIND[k] ?? k; }

  protected media(a: ActivityItem): string {
    const parts = [a.hasPhoto ? 'a photo' : '', a.hasVideo ? 'a video' : '', a.hasVoice ? 'a voice note' : ''].filter(Boolean);
    return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0] ?? 'something';
  }
}
