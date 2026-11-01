import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProblemDetails } from '../../core/api.models';
import { problemMessage } from '../../core/problem';

interface Visitor {
  publicId: string; fullName: string | null; email: string | null; mobileMasked: string | null; signUpMethod: string;
  countryCode: string | null; createdAtUtc: string; lastSignInAtUtc: string | null; isActive: boolean;
  lastReason: string | null; lastStatusChangeAtUtc: string | null;
}
interface VisitorPage { items: Visitor[]; total: number; page: number; pageSize: number; }
type EmailResult = 'Sent' | 'WrittenToConsole' | 'NoEmailOnFile' | 'NotConfigured' | 'Failed';

/** How the email went, in words for the super admin. */
const EMAIL_NOTE: Record<EmailResult, string> = {
  Sent: 'They were emailed with the reason.',
  WrittenToConsole: 'No email service is set up here, so the email was written to the API console instead.',
  NoEmailOnFile: "They have no verified email, so they couldn't be emailed.",
  NotConfigured: "No email service is set up, so they weren't emailed.",
  Failed: "The email couldn't be sent; the change was still saved."
};

/** Super admins: every visitor (account without a staff role); make them active / inactive with a reason they're emailed. */
@Component({
  selector: 'app-visitors',
  imports: [FormsModule, DatePipe],
  templateUrl: './visitors.html'
})
export class Visitors implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl + '/api/v1/admin/visitors';

  protected search = '';
  protected status: '' | 'active' | 'inactive' = '';
  protected readonly page = signal(1);
  protected readonly pageSize = 25;
  protected readonly data = signal<VisitorPage | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly pages = computed(() => Math.max(1, Math.ceil((this.data()?.total ?? 0) / this.pageSize)));

  /** The row whose status form is open, and that form. */
  protected readonly changing = signal<string | null>(null);
  protected reason = '';
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly notice = signal('');

  ngOnInit(): void { void this.load(); }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const params: Record<string, string> = { page: String(this.page()), pageSize: String(this.pageSize) };
      if (this.search.trim()) params['search'] = this.search.trim();
      if (this.status) params['status'] = this.status;
      this.data.set(await firstValueFrom(this.http.get<VisitorPage>(this.api, { params })));
    } catch (e) {
      this.loadError.set(problemMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected find(): void { this.page.set(1); this.changing.set(null); void this.load(); }

  protected goTo(p: number): void {
    if (p < 1 || p > this.pages()) return;
    this.page.set(p);
    this.changing.set(null);
    void this.load();
  }

  protected name(v: Visitor): string { return v.fullName || v.email || v.mobileMasked || 'This visitor'; }

  protected openChange(v: Visitor): void {
    this.notice.set('');
    this.formError.set('');
    this.reason = '';
    this.changing.set(v.publicId);
  }

  protected async applyChange(v: Visitor): Promise<void> {
    const reason = this.reason.trim();
    if (reason.length < 10) { this.formError.set('Give a reason of at least 10 characters. The visitor will see it.'); return; }
    this.busy.set(true);
    this.formError.set('');
    const makeActive = !v.isActive;
    try {
      const res = await firstValueFrom(this.http.put<{ isActive: boolean; email: EmailResult }>(
        `${this.api}/${encodeURIComponent(v.publicId)}/status`, { isActive: makeActive, reason }));
      this.notice.set(`${this.name(v)} is now ${makeActive ? 'active and can sign in again' : 'inactive and was signed out everywhere'}. ` +
        (EMAIL_NOTE[res.email] ?? ''));
      this.changing.set(null);
      await this.load();
    } catch (e) {
      const p = e instanceof HttpErrorResponse ? (e.error as ProblemDetails | null) : null;
      this.formError.set(p?.errors ? Object.values(p.errors).flat()[0] : problemMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
