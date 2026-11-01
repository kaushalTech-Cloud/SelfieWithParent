import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { problemMessage } from '../core/problem';

interface Settings { enabled: boolean; gatewayConfigured: boolean; testMode: boolean; webhookConfigured: boolean; webhookPath: string; }
interface Donation { publicId: string; receiptNo: string | null; amount: number; donorName: string; email: string; phone: string | null; pan: string | null;
  inHonourOf: string | null; message: string | null; showOnWall: boolean; wallName: string | null; method: string; paymentId: string | null; reference: string | null;
  status: 'Created' | 'Paid' | 'Failed' | 'Refunded'; statusNote: string | null; campaign: string | null; createdAtUtc: string; paidAtUtc: string | null; receiptSentAtUtc: string | null; }
interface DonationPage { items: Donation[]; total: number; page: number; pageSize: number; paidAmount: number; paid: number; created: number; failed: number; refunded: number; }
interface CampaignOption { publicId: string; title: string; }

/**
 * Donations: the "accept online donations" switch (with what's still missing: Razorpay keys, webhook), every donation
 * (search, filter, details), recording a gift received offline (cash / bank / cheque / UPI) with its receipt number,
 * marking a refund, and a CSV export for the accountant. Super admins and admins.
 */
@Component({
  selector: 'app-donations',
  imports: [FormsModule, DatePipe, DecimalPipe],
  template: `
    <section class="panel">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h2 class="mb-0">Donations</h2>
        <div class="d-flex gap-2">
          <button class="btn btn-light btn-sm" type="button" (click)="exportCsv()"><i class="bi bi-download"></i> Export CSV</button>
          <button class="btn btn-accent btn-sm" type="button" (click)="offlineOpen.set(!offlineOpen())"><i class="bi bi-plus-lg"></i> Record an offline gift</button>
        </div>
      </div>
      @if (error()) { <div class="alert alert-danger small" role="alert">{{ error() }}</div> }
      @if (notice()) { <div class="alert alert-success small" role="status">{{ notice() }}</div> }

      <!-- Online giving switch -->
      @if (settings(); as s) {
        <div class="dn-switch" [class.on]="s.enabled && s.gatewayConfigured">
          <div class="form-check form-switch mb-0">
            <input class="form-check-input" type="checkbox" id="dnOn" [checked]="s.enabled" (change)="toggle($any($event.target).checked)" [disabled]="busy()">
            <label class="form-check-label fw-semibold" for="dnOn">Accept online donations on the website</label>
          </div>
          <ul class="dn-check">
            <li [class.ok]="s.gatewayConfigured"><i class="bi" [class]="s.gatewayConfigured ? 'bi-check-circle-fill' : 'bi-x-circle'"></i>
              Razorpay keys on the server @if (s.gatewayConfigured) { ({{ s.testMode ? 'TEST mode — no real money' : 'LIVE' }}) } @else { — not set: add Razorpay:KeyId and Razorpay:KeySecret }</li>
            <li [class.ok]="s.webhookConfigured"><i class="bi" [class]="s.webhookConfigured ? 'bi-check-circle-fill' : 'bi-exclamation-circle'"></i>
              Webhook @if (s.webhookConfigured) { set } @else { — recommended: in Razorpay add {{ apiBase }}{{ s.webhookPath }} (events payment.captured, payment.failed) and set Razorpay:WebhookSecret }</li>
            <li class="ok"><i class="bi bi-info-circle"></i> Until it's on, the Support page says “Online donations open soon” and shows the other ways to help.</li>
          </ul>
        </div>
      }

      <!-- Offline gift -->
      @if (offlineOpen()) {
        <form class="dn-offline" (ngSubmit)="recordOffline()">
          <h3 class="h6">Record a gift received offline</h3>
          <div class="row g-2">
            <div class="col-6 col-md-2"><label class="form-label small">Amount (₹)</label><input class="form-control form-control-sm" type="number" min="1" name="amt" [(ngModel)]="o.amount"></div>
            <div class="col-6 col-md-2"><label class="form-label small">Paid by</label>
              <select class="form-select form-select-sm" name="m" [(ngModel)]="o.method"><option value="bank">Bank transfer</option><option value="upi">UPI</option><option value="cheque">Cheque</option><option value="cash">Cash</option></select></div>
            <div class="col-md-3"><label class="form-label small">Reference (cheque no. / UTR)</label><input class="form-control form-control-sm" name="ref" maxlength="100" [(ngModel)]="o.reference"></div>
            <div class="col-md-2"><label class="form-label small">Date received</label><input class="form-control form-control-sm" type="date" name="d" [(ngModel)]="o.date"></div>
            <div class="col-md-3"><label class="form-label small">Campaign</label>
              <select class="form-select form-select-sm" name="c" [(ngModel)]="o.campaignId"><option value="">Wherever needed most</option>@for (c of campaigns(); track c.publicId) { <option [value]="c.publicId">{{ c.title }}</option> }</select></div>
            <div class="col-md-3"><label class="form-label small">Donor's name</label><input class="form-control form-control-sm" name="n" maxlength="100" [(ngModel)]="o.name"></div>
            <div class="col-md-3"><label class="form-label small">Email (for the receipt)</label><input class="form-control form-control-sm" type="email" name="e" maxlength="254" [(ngModel)]="o.email"></div>
            <div class="col-md-2"><label class="form-label small">Phone</label><input class="form-control form-control-sm" name="p" maxlength="20" [(ngModel)]="o.phone"></div>
            <div class="col-md-2"><label class="form-label small">PAN (80G)</label><input class="form-control form-control-sm text-uppercase" name="pan" maxlength="10" [(ngModel)]="o.pan"></div>
            <div class="col-md-2"><label class="form-label small">In honour of</label><input class="form-control form-control-sm" name="h" maxlength="100" [(ngModel)]="o.inHonourOf"></div>
          </div>
          <div class="d-flex gap-2 mt-2">
            <button class="btn btn-accent btn-sm" type="submit" [disabled]="busy()">Record with a receipt number</button>
            <button class="btn btn-light btn-sm" type="button" (click)="offlineOpen.set(false)">Cancel</button>
          </div>
        </form>
      }

      <!-- Totals + filters -->
      @if (data(); as d) {
        <div class="dn-totals">
          <div><b>₹{{ d.paidAmount | number: '1.0-0' }}</b><small>received ({{ d.paid }} gifts)</small></div>
          <div><b>{{ d.created }}</b><small>started, not paid</small></div>
          <div><b>{{ d.failed }}</b><small>failed / closed</small></div>
          <div><b>{{ d.refunded }}</b><small>refunded</small></div>
        </div>
      }
      <div class="d-flex flex-wrap gap-2 mb-2">
        <div class="btn-group btn-group-sm">
          @for (f of filters; track f[0]) { <button class="btn btn-outline-secondary" type="button" [class.active]="status() === f[0]" (click)="setStatus(f[0])">{{ f[1] }}</button> }
        </div>
        <input class="form-control form-control-sm dn-search" type="search" [(ngModel)]="search" (keyup.enter)="go(1)" placeholder="Search name, email or receipt" aria-label="Search">
        <button class="btn btn-light btn-sm" type="button" (click)="go(1)">Search</button>
      </div>

      @if (loading()) { <p class="small text-muted"><span class="spinner-border spinner-border-sm"></span> Loading…</p> }
      @else {
        <div class="table-responsive">
          <table class="table table-sm align-middle dn-table">
            <thead><tr><th>Date</th><th>Donor</th><th class="text-end">Amount</th><th>For</th><th>Status</th><th>Receipt</th><th></th></tr></thead>
            <tbody>
              @for (x of data()?.items ?? []; track x.publicId) {
                <tr (click)="open.set(open() === x.publicId ? null : x.publicId)" class="dn-row">
                  <td class="small">{{ (x.paidAtUtc ?? x.createdAtUtc) + 'Z' | date: 'd MMM y, HH:mm' }}</td>
                  <td><b>{{ x.donorName }}</b><br><small class="text-muted">{{ x.email }}</small></td>
                  <td class="text-end fw-semibold">₹{{ x.amount | number: '1.0-0' }}</td>
                  <td class="small">{{ x.campaign || 'Where needed most' }}@if (x.inHonourOf) { <br><i class="bi bi-heart-fill text-danger"></i> {{ x.inHonourOf }} }</td>
                  <td><span class="badge" [class]="badge(x.status)">{{ x.status }}</span> <small class="text-muted">{{ x.method }}</small></td>
                  <td class="small">{{ x.receiptNo || '—' }}@if (x.receiptSentAtUtc) { <i class="bi bi-envelope-check text-success" title="Receipt emailed"></i> }</td>
                  <td class="text-end"><i class="bi" [class]="open() === x.publicId ? 'bi-chevron-up' : 'bi-chevron-down'"></i></td>
                </tr>
                @if (open() === x.publicId) {
                  <tr class="dn-detail"><td colspan="7">
                    <div class="row g-2 small">
                      <div class="col-md-4">Phone: {{ x.phone || '—' }}<br>PAN: {{ x.pan || '—' }}<br>Donor wall: {{ x.showOnWall ? (x.wallName || 'Anonymous') : 'No' }}</div>
                      <div class="col-md-4">{{ x.method === 'razorpay' ? 'Payment id' : 'Reference' }}: {{ x.paymentId || x.reference || '—' }}<br>
                        Started: {{ x.createdAtUtc + 'Z' | date: 'd MMM y, HH:mm' }}@if (x.statusNote) { <br>Note: {{ x.statusNote }} }</div>
                      <div class="col-md-4">@if (x.message) { “{{ x.message }}” }</div>
                    </div>
                    @if (x.status === 'Paid') {
                      <div class="d-flex flex-wrap gap-2 mt-2 align-items-center">
                        <input class="form-control form-control-sm dn-search" maxlength="300" [(ngModel)]="refundNote" placeholder="Why refunded (at least 5 characters)" aria-label="Refund reason">
                        <button class="btn btn-outline-danger btn-sm" type="button" (click)="refund(x)" [disabled]="busy() || refundNote.trim().length < 5">Mark refunded</button>
                        <small class="text-muted">Refund the money itself in the Razorpay dashboard / by bank first.</small>
                      </div>
                    }
                  </td></tr>
                }
              } @empty { <tr><td colspan="7" class="text-muted small">No donations here yet.</td></tr> }
            </tbody>
          </table>
        </div>
        <div class="d-flex gap-2">
          @if (page() > 1) { <button class="btn btn-light btn-sm" type="button" (click)="go(page() - 1)">Previous</button> }
          @if ((data()?.total ?? 0) > page() * 25) { <button class="btn btn-light btn-sm" type="button" (click)="go(page() + 1)">Next</button> }
        </div>
      }
    </section>`,
  styles: `
    .dn-switch { padding: .9rem 1.1rem; border-radius: .8rem; border: 1px solid rgba(0,0,0,.1); background: #fffaf0; margin-bottom: 1rem; }
    .dn-switch.on { background: #effaf6; border-color: #9fd8c5; }
    .dn-check { list-style: none; padding: 0; margin: .6rem 0 0; font-size: .85rem; display: grid; gap: .25rem; }
    .dn-check li { color: #9a5b00; } .dn-check li.ok { color: #2d6a4f; }
    .dn-offline { padding: .9rem 1.1rem; border-radius: .8rem; border: 1px solid rgba(0,0,0,.1); background: #fff; margin-bottom: 1rem; }
    .dn-totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .6rem; margin-bottom: 1rem; }
    .dn-totals div { padding: .7rem .9rem; border-radius: .7rem; background: #f8f5f1; }
    .dn-totals b { display: block; font-size: 1.2rem; } .dn-totals small { color: #777; }
    .dn-search { max-width: 280px; }
    .dn-row { cursor: pointer; } .dn-detail td { background: #fbf9f6; }
  `
})
export class Donations implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiBaseUrl}/api/v1/admin/support`;
  protected readonly apiBase = environment.apiBaseUrl;
  protected readonly filters = [['', 'All'], ['Paid', 'Paid'], ['Created', 'Started'], ['Failed', 'Failed'], ['Refunded', 'Refunded']] as const;

  protected readonly settings = signal<Settings | null>(null);
  protected readonly data = signal<DonationPage | null>(null);
  protected readonly campaigns = signal<CampaignOption[]>([]);
  protected readonly status = signal('');
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly open = signal<string | null>(null);
  protected readonly offlineOpen = signal(false);
  protected search = '';
  protected refundNote = '';
  protected o = this.blank();

  ngOnInit(): void {
    void this.loadSettings();
    void this.load();
    firstValueFrom(this.http.get<CampaignOption[]>(`${this.api}/campaigns`)).then(c => this.campaigns.set(c)).catch(() => undefined);
  }

  private blank() { return { amount: null as number | null, method: 'bank', reference: '', date: '', campaignId: '', name: '', email: '', phone: '', pan: '', inHonourOf: '' }; }

  private async loadSettings(): Promise<void> {
    try { this.settings.set(await firstValueFrom(this.http.get<Settings>(`${this.api}/settings`))); } catch (e) { this.error.set(problemMessage(e)); }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const params: Record<string, string | number> = { page: this.page(), pageSize: 25 };
      if (this.status()) params['status'] = this.status();
      if (this.search.trim()) params['search'] = this.search.trim();
      this.data.set(await firstValueFrom(this.http.get<DonationPage>(`${this.api}/donations`, { params })));
    } catch (e) { this.error.set(problemMessage(e)); }
    finally { this.loading.set(false); }
  }

  protected setStatus(s: string): void { this.status.set(s); this.go(1); }
  protected go(p: number): void { this.page.set(p); this.open.set(null); void this.load(); }
  protected badge(s: string): string { return s === 'Paid' ? 'text-bg-success' : s === 'Refunded' ? 'text-bg-warning' : s === 'Failed' ? 'text-bg-secondary' : 'text-bg-light'; }

  protected async toggle(on: boolean): Promise<void> {
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      await firstValueFrom(this.http.put(`${this.api}/settings`, { enabled: on }));
      this.notice.set(on ? 'Online donations are on — the Support page shows the donate form.' : 'Online donations are off — the page says “open soon”.');
    } catch (e) { this.error.set(problemMessage(e)); }
    finally { this.busy.set(false); await this.loadSettings(); }
  }

  protected async recordOffline(): Promise<void> {
    const o = this.o;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      const r = await firstValueFrom(this.http.post<{ receiptNo: string }>(`${this.api}/donations/offline`, {
        campaignId: o.campaignId || null, amount: o.amount, method: o.method, reference: o.reference.trim() || null, name: o.name.trim(), email: o.email.trim(),
        phone: o.phone.trim() || null, pan: o.pan.trim() || null, inHonourOf: o.inHonourOf.trim() || null, showOnWall: false,
        paidAtUtc: o.date ? `${o.date}T12:00:00` : null }));
      this.notice.set(`Recorded with receipt ${r.receiptNo}.`);
      this.o = this.blank();
      this.offlineOpen.set(false);
      await this.load();
    } catch (e) { this.error.set(problemMessage(e)); }
    finally { this.busy.set(false); }
  }

  protected async refund(x: Donation): Promise<void> {
    if (!confirm(`Mark ${x.receiptNo} (₹${x.amount}) as refunded?`)) return;
    this.busy.set(true); this.error.set('');
    try {
      await firstValueFrom(this.http.put(`${this.api}/donations/${x.publicId}/refund`, { note: this.refundNote.trim() }));
      this.refundNote = '';
      this.notice.set(`${x.receiptNo} marked refunded.`);
      await this.load();
    } catch (e) { this.error.set(problemMessage(e)); }
    finally { this.busy.set(false); }
  }

  /** Downloads the CSV with the staff sign-in (a plain link can't send it). */
  protected async exportCsv(): Promise<void> {
    try {
      const blob = await firstValueFrom(this.http.get(`${this.api}/donations/export`, { responseType: 'blob' }));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `donations-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { this.error.set(problemMessage(e)); }
  }
}
