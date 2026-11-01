import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { MessageAlertsService } from '../core/message-alerts.service';
import { problemMessage } from '../core/problem';

interface ContactMessage {
  publicId: string; name: string; email: string; subject: string | null; message: string; status: 'New' | 'Read' | 'Archived';
  createdAtUtc: string; readAtUtc: string | null; readBy: string | null; fromAccount: boolean;
}
interface MessagePage { items: ContactMessage[]; total: number; page: number; pageSize: number; new: number; read: number; archived: number; }
interface ContactDetails { email: string; phone: string; address: string; }

/**
 * Messages: the website's contact form ("Get in touch") — new ones first; opening a message marks it read; reply by email,
 * archive, or mark it new again. And the contact details shown on the website (email, phone, address).
 * Super admins and admins.
 */
@Component({
  selector: 'app-messages',
  imports: [FormsModule, DatePipe],
  template: `
    <section class="panel">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h2 class="mb-0">Messages</h2>
        <ul class="nav nav-pills lang-tabs" role="tablist">
          <li class="nav-item"><button class="nav-link" type="button" role="tab" [class.active]="tab() === 'inbox'" (click)="tab.set('inbox')">
            Inbox @if (data()?.new) { <span class="badge text-bg-danger ms-1">{{ data()!.new }}</span> }</button></li>
          <li class="nav-item"><button class="nav-link" type="button" role="tab" [class.active]="tab() === 'details'" (click)="tab.set('details'); loadDetails()">Contact details</button></li>
        </ul>
      </div>

      @if (error()) { <div class="alert alert-danger small" role="alert">{{ error() }}</div> }

      @if (tab() === 'inbox') {
        <div class="btn-group btn-group-sm mb-3" role="group" aria-label="Show">
          @for (f of filters; track f[0]) {
            <button class="btn btn-outline-secondary" type="button" [class.active]="status() === f[0]" (click)="setStatus(f[0])">{{ f[1] }}</button>
          }
        </div>
        @if (loading()) {
          <p class="text-muted small"><span class="spinner-border spinner-border-sm"></span> Loading…</p>
        } @else {
          @for (m of data()?.items ?? []; track m.publicId) {
            <article class="msg" [class.new]="m.status === 'New'">
              <button type="button" class="msg-head" (click)="toggle(m)" [attr.aria-expanded]="open() === m.publicId">
                @if (m.status === 'New') { <span class="dot" aria-label="New"></span> }
                <strong>{{ m.name }}</strong>
                <span class="text-muted small text-truncate">{{ m.subject || (m.message.length > 70 ? m.message.slice(0, 70) + '…' : m.message) }}</span>
                <span class="ms-auto small text-muted text-nowrap">{{ m.createdAtUtc + 'Z' | date: 'd MMM, HH:mm' }}</span>
              </button>
              @if (open() === m.publicId) {
                <div class="msg-body">
                  <p class="small mb-2"><a [href]="'mailto:' + m.email">{{ m.email }}</a>
                    @if (m.fromAccount) { <span class="badge text-bg-light ms-1">signed-in visitor</span> }
                    @if (m.readAtUtc) { <span class="text-muted"> · read {{ m.readAtUtc + 'Z' | date: 'd MMM, HH:mm' }}@if (m.readBy) { by {{ m.readBy }} }</span> }</p>
                  @if (m.subject) { <p class="fw-semibold mb-1">{{ m.subject }}</p> }
                  <p class="msg-text">{{ m.message }}</p>
                  <div class="d-flex flex-wrap gap-2">
                    <a class="btn btn-accent btn-sm" [href]="replyHref(m)"><i class="bi bi-reply"></i> Reply by email</a>
                    @if (m.status !== 'Archived') { <button class="btn btn-light btn-sm" type="button" (click)="mark(m, 'Archived')"><i class="bi bi-archive"></i> Archive</button> }
                    @if (m.status !== 'New') { <button class="btn btn-light btn-sm" type="button" (click)="mark(m, 'New')"><i class="bi bi-envelope"></i> Mark as new</button> }
                  </div>
                </div>
              }
            </article>
          } @empty {
            <p class="text-muted small">{{ status() === 'Archived' ? 'Nothing archived.' : 'No messages yet. They appear here when someone uses the contact form on the website.' }}</p>
          }
          @if ((data()?.total ?? 0) > page() * pageSize) {
            <button class="btn btn-light btn-sm mt-2" type="button" (click)="page.set(page() + 1); load()">Older messages</button>
          }
        }
      } @else {
        <p class="small text-muted">Shown on the website's top bar and in "Get in touch". Leave a field empty to hide it.</p>
        <form class="row g-3" style="max-width: 640px" (ngSubmit)="saveDetails()">
          <div class="col-md-6"><label class="form-label small" for="dEmail">Email</label>
            <input class="form-control" id="dEmail" name="dEmail" type="email" maxlength="200" [(ngModel)]="details.email"></div>
          <div class="col-md-6"><label class="form-label small" for="dPhone">Phone</label>
            <input class="form-control" id="dPhone" name="dPhone" maxlength="40" placeholder="+91 98765 43210" [(ngModel)]="details.phone"></div>
          <div class="col-12"><label class="form-label small" for="dAddress">Address</label>
            <input class="form-control" id="dAddress" name="dAddress" maxlength="200" placeholder="Office address, City, State, PIN" [(ngModel)]="details.address"></div>
          <div class="col-12 d-flex align-items-center gap-2">
            <button class="btn btn-accent btn-sm" type="submit" [disabled]="saving()">Save contact details</button>
            @if (saved()) { <span class="small text-success" role="status"><i class="bi bi-check-circle"></i> Saved — the website shows them now.</span> }
          </div>
        </form>
      }
    </section>`,
  styles: `
    .msg { border: 1px solid rgba(0,0,0,.08); border-radius: .6rem; margin-bottom: .5rem; background: #fff; }
    .msg.new { border-color: var(--accent, #f06543); }
    .msg-head { display: flex; align-items: center; gap: .6rem; width: 100%; background: none; border: 0; padding: .6rem .8rem; text-align: start; min-width: 0; }
    .msg-head .text-truncate { min-width: 0; }
    .dot { width: .55rem; height: .55rem; border-radius: 50%; background: var(--accent, #f06543); flex: 0 0 auto; }
    .msg-body { padding: 0 .8rem .8rem; }
    .msg-text { white-space: pre-wrap; background: #faf6f0; border-radius: .5rem; padding: .6rem .8rem; }
  `
})
export class Messages implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly alerts = inject(MessageAlertsService);
  private readonly api = `${environment.apiBaseUrl}/api/v1/admin`;

  protected readonly filters = [['', 'Inbox'], ['New', 'New'], ['Read', 'Read'], ['Archived', 'Archived']] as const;
  protected readonly tab = signal<'inbox' | 'details'>('inbox');
  protected readonly status = signal<string>('');
  protected readonly page = signal(1);
  protected readonly pageSize = 20;
  protected readonly data = signal<MessagePage | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly open = signal<string | null>(null);
  protected details: ContactDetails = { email: '', phone: '', address: '' };
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);

  ngOnInit(): void { void this.load(); }

  protected setStatus(s: string): void { this.status.set(s); this.page.set(1); void this.load(); }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      const params: Record<string, string | number> = { page: 1, pageSize: this.page() * this.pageSize };
      if (this.status()) params['status'] = this.status();
      this.data.set(await firstValueFrom(this.http.get<MessagePage>(`${this.api}/contact-messages`, { params })));
      this.error.set('');
    } catch (e) { this.error.set(problemMessage(e)); }
    finally { this.loading.set(false); }
  }

  /** Opening a new message marks it read. */
  protected async toggle(m: ContactMessage): Promise<void> {
    this.open.set(this.open() === m.publicId ? null : m.publicId);
    if (this.open() === m.publicId && m.status === 'New') await this.mark(m, 'Read', false);
  }

  protected async mark(m: ContactMessage, status: ContactMessage['status'], reload = true): Promise<void> {
    try {
      await firstValueFrom(this.http.put(`${this.api}/contact-messages/${m.publicId}/status`, { status }));
      this.data.update(d => d && {
        ...d, items: d.items.map(x => x.publicId === m.publicId ? { ...x, status, readAtUtc: status === 'New' ? null : x.readAtUtc ?? new Date().toISOString().slice(0, 19) } : x),
        new: d.new + (status === 'New' ? 1 : 0) - (m.status === 'New' ? 1 : 0)
      });
      this.alerts.check();
      if (reload) await this.load();
    } catch (e) { this.error.set(problemMessage(e)); }
  }

  protected replyHref(m: ContactMessage): string {
    const subject = encodeURIComponent('Re: ' + (m.subject || 'Your message to Selfie with Parent'));
    const body = encodeURIComponent(`\n\n---\n${m.name} wrote:\n${m.message}`);
    return `mailto:${m.email}?subject=${subject}&body=${body}`;
  }

  protected async loadDetails(): Promise<void> {
    try { this.details = await firstValueFrom(this.http.get<ContactDetails>(`${this.api}/contact`)); }
    catch (e) { this.error.set(problemMessage(e)); }
  }

  protected async saveDetails(): Promise<void> {
    this.saving.set(true);
    this.saved.set(false);
    this.error.set('');
    try {
      this.details = await firstValueFrom(this.http.put<ContactDetails>(`${this.api}/contact`, this.details));
      this.saved.set(true);
    } catch (e) { this.error.set(problemMessage(e)); }
    finally { this.saving.set(false); }
  }
}
