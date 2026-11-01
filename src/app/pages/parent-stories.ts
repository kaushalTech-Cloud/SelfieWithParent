import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { problemMessage } from '../core/problem';

interface StoryFile { publicId: string; role: 'main' | 'video' | 'voice'; contentType: string; sizeBytes: number; }
interface Story {
  publicId: string; reference: string; writtenBy: 'parent' | 'family' | 'friend'; parentRole: 'mother' | 'father' | 'both';
  shownName: string | null; age: number | null; countryCode: string; stateName: string | null; city: string | null;
  title: string; story: string; wish: string | null; status: 'Pending' | 'Approved' | 'Rejected'; reviewNote: string | null;
  reviewedBy: string | null; reviewedAtUtc: string | null; createdAtUtc: string; isFeatured: boolean; loves: number; ownerEmail: string | null;
  files: StoryFile[];
}
interface StoryPage { items: Story[]; total: number; page: number; pageSize: number; pending: number; approved: number; rejected: number; }

const WRITERS = { parent: 'Written by the parent', family: 'Written by family', friend: 'Written by a friend / volunteer' };

/**
 * Parents' stories: Parents' Voices stories waiting for review (oldest first), and the approved / rejected ones.
 * Read the whole story with its photo, video and voice note; approve, reject with a reason (the visitor can share again),
 * take an approved one down, or feature it at the top of the page. Super admins, admins and moderators.
 */
@Component({
  selector: 'app-parent-stories',
  imports: [FormsModule, DatePipe],
  template: `
    <section class="panel">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <h2 class="mb-0">Parents' stories</h2>
        <a class="btn btn-light btn-sm" [href]="site + '/parents-voices'" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i> View Parents' Voices</a>
      </div>
      <p class="small text-muted mb-3">Read each story with care before it goes live. Check that it shows no address, phone number or anything that could put the parent at risk.</p>
      <div class="btn-group btn-group-sm mb-3" role="group" aria-label="Show">
        @for (f of filters; track f) {
          <button class="btn btn-outline-secondary" type="button" [class.active]="status() === f" (click)="setStatus(f)">
            {{ f }} <span class="badge text-bg-light ms-1">{{ count(f) }}</span></button>
        }
      </div>
      @if (error()) { <div class="alert alert-danger small" role="alert">{{ error() }}</div> }
      @if (notice()) { <div class="alert alert-success small" role="status">{{ notice() }}</div> }

      @if (loading()) {
        <p class="text-muted small"><span class="spinner-border spinner-border-sm"></span> Loading…</p>
      } @else {
        @for (s of data()?.items ?? []; track s.publicId) {
          <article class="ps-card">
            <div class="ps-media">
              @for (f of s.files; track f.publicId) {
                @if (media()[f.publicId]; as src) {
                  @switch (f.role) {
                    @case ('main') { <img [src]="src" alt="Photo"> }
                    @case ('video') { <video [src]="src" controls preload="metadata"></video> }
                    @case ('voice') { <audio [src]="src" controls preload="metadata"></audio> }
                  }
                } @else { <div class="ps-none"><span class="spinner-border spinner-border-sm"></span></div> }
              } @empty { <div class="ps-none"><i class="bi bi-chat-heart"></i><small>No photo, video or voice note</small></div> }
            </div>
            <div class="ps-body">
              <div class="d-flex flex-wrap align-items-center gap-2 small text-muted mb-1">
                <span class="badge text-bg-light">{{ s.reference }}</span>
                <span>{{ writer(s) }}</span> ·
                <span>{{ s.createdAtUtc + 'Z' | date: 'd MMM y, HH:mm' }}</span>
                @if (s.ownerEmail) { · <a [href]="'mailto:' + s.ownerEmail">{{ s.ownerEmail }}</a> }
                @if (s.isFeatured) { <span class="badge text-bg-warning"><i class="bi bi-star-fill"></i> Featured</span> }
                @if (s.status === 'Approved') { <span class="text-danger"><i class="bi bi-heart-fill"></i> {{ s.loves }}</span> }
              </div>
              <h3>{{ s.title }}</h3>
              <p class="ps-who"><i class="bi bi-person-heart"></i> {{ s.shownName || 'Anonymous' }} ({{ s.parentRole }})@if (s.age) {, {{ s.age }} }
                · {{ place(s) }}</p>
              <p class="ps-text">{{ s.story }}</p>
              @if (s.wish) { <p class="ps-wish"><i class="bi bi-heart"></i> “{{ s.wish }}”</p> }
              @if (s.reviewNote || s.reviewedBy) {
                <p class="small text-muted mb-2">{{ s.status }} @if (s.reviewedBy) { by {{ s.reviewedBy }} } @if (s.reviewedAtUtc) { on {{ s.reviewedAtUtc + 'Z' | date: 'd MMM y' }} }
                  @if (s.reviewNote) { — “{{ s.reviewNote }}” }</p>
              }
              <div class="d-flex flex-wrap gap-2 align-items-center">
                @if (s.status !== 'Approved') {
                  <button class="btn btn-success btn-sm" type="button" (click)="review(s, 'Approved')" [disabled]="busy()"><i class="bi bi-check2"></i> Approve</button>
                }
                @if (s.status === 'Approved') {
                  <button class="btn btn-sm" type="button" [class.btn-warning]="!s.isFeatured" [class.btn-outline-warning]="s.isFeatured"
                          (click)="review(s, 'Approved', !s.isFeatured)" [disabled]="busy()"><i class="bi bi-star"></i> {{ s.isFeatured ? 'Unfeature' : 'Feature on top' }}</button>
                }
                @if (s.status !== 'Rejected') {
                  @if (rejecting() === s.publicId) {
                    <input class="form-control form-control-sm ps-reason" maxlength="300" [(ngModel)]="reason" placeholder="Reason (at least 5 characters)" aria-label="Reason">
                    <button class="btn btn-danger btn-sm" type="button" (click)="review(s, 'Rejected')" [disabled]="busy() || reason.trim().length < 5">{{ s.status === 'Approved' ? 'Take down' : 'Reject' }}</button>
                    <button class="btn btn-light btn-sm" type="button" (click)="rejecting.set(null)">Cancel</button>
                  } @else {
                    <button class="btn btn-outline-danger btn-sm" type="button" (click)="rejecting.set(s.publicId); reason = ''">
                      <i class="bi bi-x-lg"></i> {{ s.status === 'Approved' ? 'Take down' : 'Reject' }}</button>
                  }
                }
                @if (s.status !== 'Pending') {
                  <button class="btn btn-light btn-sm" type="button" (click)="review(s, 'Pending')" [disabled]="busy()">Back to pending</button>
                }
                @if (s.status === 'Approved') { <a class="btn btn-link btn-sm" [href]="site + '/parents-voices/' + s.publicId" target="_blank" rel="noopener">View on site</a> }
              </div>
            </div>
          </article>
        } @empty {
          <p class="text-muted small">{{ status() === 'Pending' ? 'No stories waiting. Thank you!' : 'Nothing here yet.' }}</p>
        }
        @if ((data()?.total ?? 0) > page() * pageSize) {
          <button class="btn btn-outline-secondary btn-sm" type="button" (click)="go(page() + 1)">Next page</button>
        }
        @if (page() > 1) { <button class="btn btn-link btn-sm" type="button" (click)="go(page() - 1)">Previous page</button> }
      }
    </section>`,
  styles: `
    .ps-card { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 1.2rem; padding: 1rem 0; border-top: 1px solid rgba(0,0,0,.08); }
    .ps-media { display: flex; flex-direction: column; gap: .5rem; }
    .ps-media img, .ps-media video { width: 100%; border-radius: .6rem; max-height: 320px; object-fit: cover; background: #111; }
    .ps-media audio { width: 100%; }
    .ps-none { display: grid; place-items: center; gap: .3rem; height: 160px; border-radius: .6rem; background: #f6f1ec; color: #8a7a8e; text-align: center; }
    .ps-none i { font-size: 2rem; }
    .ps-body h3 { font-size: 1.15rem; margin: .2rem 0 .3rem; }
    .ps-who { font-size: .88rem; color: #6b2f55; margin-bottom: .5rem; }
    .ps-text { white-space: pre-line; font-size: .92rem; max-height: 260px; overflow-y: auto; padding: .7rem .9rem; border-radius: .6rem; background: #fbf8f5; }
    .ps-wish { font-style: italic; color: #a0475e; }
    .ps-reason { max-width: 280px; }
    @media (max-width: 767.98px) { .ps-card { grid-template-columns: 1fr; } }
  `
})
export class ParentStories implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiBaseUrl}/api/v1/admin/parent-stories`;
  protected readonly site = environment.publicSiteUrl;
  protected readonly filters = ['Pending', 'Approved', 'Rejected'] as const;
  protected readonly pageSize = 12;

  protected readonly status = signal<'Pending' | 'Approved' | 'Rejected'>('Pending');
  protected readonly page = signal(1);
  protected readonly data = signal<StoryPage | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly rejecting = signal<string | null>(null);
  protected reason = '';
  /** The files, fetched with the staff sign-in (an <img> can't send it), shown from local copies. */
  protected readonly media = signal<Record<string, string>>({});

  ngOnInit(): void { void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const d = await firstValueFrom(this.http.get<StoryPage>(this.api, { params: { status: this.status(), page: this.page(), pageSize: this.pageSize } }));
      this.data.set(d);
      void this.loadMedia(d.items.flatMap(i => i.files));
    } catch (e) { this.error.set(problemMessage(e)); }
    finally { this.loading.set(false); }
  }

  protected setStatus(s: 'Pending' | 'Approved' | 'Rejected'): void { this.status.set(s); this.page.set(1); this.notice.set(''); void this.load(); }
  protected go(p: number): void { this.page.set(p); void this.load(); }
  protected count(s: string): number { const d = this.data(); return !d ? 0 : s === 'Pending' ? d.pending : s === 'Approved' ? d.approved : d.rejected; }
  private async loadMedia(files: StoryFile[]): Promise<void> {
    this.freeMedia();
    for (const f of files) {
      try {
        const blob = await firstValueFrom(this.http.get(`${this.api}/files/${f.publicId}`, { responseType: 'blob' }));
        this.media.update(m => ({ ...m, [f.publicId]: URL.createObjectURL(blob) }));
      } catch { /* that file just doesn't show */ }
    }
  }

  private freeMedia(): void {
    Object.values(this.media()).forEach(u => URL.revokeObjectURL(u));
    this.media.set({});
  }

  ngOnDestroy(): void { this.freeMedia(); }
  protected writer(s: Story): string { return WRITERS[s.writtenBy]; }
  protected place(s: Story): string { return [s.city, s.stateName, s.countryCode].filter(Boolean).join(', '); }

  protected async review(s: Story, status: 'Approved' | 'Rejected' | 'Pending', featured?: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.http.put(`${this.api}/${s.publicId}/review`,
        { status, note: status === 'Rejected' ? this.reason.trim() : null, featured: featured ?? (status === 'Approved' ? s.isFeatured : null) }));
      this.rejecting.set(null);
      this.notice.set(featured !== undefined ? `${s.reference} ${featured ? 'is featured on top' : 'is no longer featured'}.`
        : `${s.reference}: ${status === 'Approved' ? 'approved — it is on Parents’ Voices now' : status === 'Rejected' ? (s.status === 'Approved' ? 'taken down' : 'rejected') : 'back in the queue'}.`);
      await this.load();
    } catch (e) { this.error.set(problemMessage(e)); }
    finally { this.busy.set(false); }
  }
}
