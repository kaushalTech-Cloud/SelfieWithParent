import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProblemDetails } from '../../core/api.models';
import { AuthService } from '../../core/auth.service';
import { isValidEmail } from '../../core/phone';
import { problemMessage } from '../../core/problem';

interface StaffMember {
  publicId: string; email: string | null; mobileMasked: string | null; fullName: string | null;
  roles: string[]; createdAtUtc: string; lastSignInAtUtc: string | null; isActive: boolean;
}
interface CreateStaffResponse { publicId: string; outcome: 'Created' | 'RoleAdded' | 'AlreadyHadRole'; }

/** Roles a super admin can give here (SuperAdmin itself is set up by the database owner only). */
const ROLES = [
  { code: 'Admin', name: 'Admin', hint: 'Runs the site day to day.' },
  { code: 'Moderator', name: 'Moderator', hint: 'Reviews, approves and rejects submissions.' },
  { code: 'Support', name: 'Support', hint: 'Helps visitors; sees personal data masked.' },
  { code: 'PrivacyOfficer', name: 'Privacy officer', hint: 'Handles data requests (download / delete).' }
] as const;

/** Super admins: see the staff, add Admin / Moderator / Support / Privacy officer accounts, edit, (de)activate and delete them. */
@Component({
  selector: 'app-staff',
  imports: [FormsModule, DatePipe],
  templateUrl: './staff.html'
})
export class Staff implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl + '/api/v1/admin/staff';

  protected readonly roles = ROLES;
  protected form = { fullName: '', email: '', roleCode: 'Admin', password: '', confirm: '' };
  protected readonly showPassword = signal(false);
  protected readonly saving = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly notice = signal('');

  protected readonly staff = signal<StaffMember[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');

  private readonly auth = inject(AuthService);
  private readonly formPanel = viewChild<ElementRef<HTMLElement>>('formPanel');
  private readonly nameBox = viewChild<ElementRef<HTMLInputElement>>('nameBox');
  /** The row waiting for "are you sure?" (delete, or make inactive). */
  protected readonly confirming = signal<{ id: string; kind: 'delete' | 'deactivate' } | null>(null);
  /** The staff member loaded into the form for editing; null = the form adds a new staff member. */
  protected readonly editing = signal<StaffMember | null>(null);
  protected readonly busy = signal(false);
  protected readonly listNotice = signal('');
  protected readonly listError = signal('');

  ngOnInit(): void { void this.load(); }

  protected isMe(s: StaffMember): boolean { return s.publicId === this.auth.profile()?.publicId; }

  /** You, and other super admins, can't be edited / deactivated / deleted here; the API and database refuse it too. */
  protected canManage(s: StaffMember): boolean { return !this.isMe(s) && !s.roles.includes('SuperAdmin'); }

  private name(s: StaffMember): string { return s.fullName || s.email || 'The staff member'; }

  private clearMessages(): void { this.listNotice.set(''); this.listError.set(''); }

  /** The one staff role this person holds (the form shows it). */
  private staffRole(s: StaffMember): string { return s.roles.find(r => ROLES.some(x => x.code === r)) ?? 'Admin'; }

  // ---------- Edit: loads the person into the same form used to add staff ----------

  protected startEdit(s: StaffMember, f: NgForm): void {
    this.clearMessages();
    this.confirming.set(null);
    this.errors.set([]);
    this.notice.set('');
    this.showPassword.set(false);
    this.form = { fullName: s.fullName ?? '', email: s.email ?? '', roleCode: this.staffRole(s), password: '', confirm: '' };
    f.resetForm(this.form);
    this.editing.set(s);
    // Bring the form into view (it may be above the list on smaller screens) and start in the name box
    setTimeout(() => {
      this.formPanel()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.nameBox()?.nativeElement.focus({ preventScroll: true });
    });
  }

  /** Back to adding a new staff member (keeps any success message). */
  protected cancelEdit(f: NgForm): void {
    this.editing.set(null);
    this.errors.set([]);
    this.showPassword.set(false);
    this.form = { fullName: '', email: '', roleCode: 'Admin', password: '', confirm: '' };
    f.resetForm(this.form);
  }

  /** The form's button: add, or save the person being edited. */
  protected submit(f: NgForm): Promise<void> {
    const s = this.editing();
    return s ? this.saveEdit(s, f) : this.create(f);
  }

  /** Same checks for adding and editing; the API checks them again. */
  private check(): string[] {
    const { fullName, email, password, confirm } = this.form;
    const problems: string[] = [];
    if (fullName.trim().length < 2) problems.push('Enter their full name.');
    if (!isValidEmail(email)) problems.push('Enter a valid email address.');
    if (password && password.length < 8) problems.push('Use at least 8 characters for the password.');
    if (password && password !== confirm) problems.push("The passwords don't match.");
    return problems;
  }

  private apiErrors(e: unknown): string[] {
    const p = e instanceof HttpErrorResponse ? (e.error as ProblemDetails | null) : null;
    return p?.errors ? Object.values(p.errors).flat() : [problemMessage(e)];
  }

  private async saveEdit(s: StaffMember, f: NgForm): Promise<void> {
    this.errors.set([]);
    this.notice.set('');
    const problems = this.check();
    if (problems.length) { this.errors.set(problems); return; }

    const { fullName, email, roleCode, password } = this.form;
    this.saving.set(true);
    try {
      await firstValueFrom(this.http.put(`${this.api}/${encodeURIComponent(s.publicId)}`, {
        fullName: fullName.trim(), email: email.trim().toLowerCase(), roleCode, newPassword: password || null
      }));
      const roleChanged = roleCode !== this.staffRole(s);
      const message = `${fullName.trim()} was updated.` +
        (roleChanged ? ` They're now ${this.roleName(roleCode)} and were signed out so the new role applies.` : '') +
        (password ? ' Their password was changed.' : '');
      this.cancelEdit(f);
      this.notice.set(message);
      await this.load();
    } catch (e) {
      this.errors.set(this.apiErrors(e));
    } finally {
      this.saving.set(false);
    }
  }

  // ---------- Active / inactive ----------

  /** Making someone inactive asks first; making them active again happens straight away. */
  protected toggleActive(s: StaffMember): void {
    this.clearMessages();
    if (s.isActive) this.confirming.set({ id: s.publicId, kind: 'deactivate' });
    else void this.setActive(s, true);
  }

  protected async setActive(s: StaffMember, isActive: boolean): Promise<void> {
    this.busy.set(true);
    this.listError.set('');
    try {
      await firstValueFrom(this.http.put(`${this.api}/${encodeURIComponent(s.publicId)}/status`, { isActive }));
      this.listNotice.set(isActive
        ? `${this.name(s)} is active again and can sign in.`
        : `${this.name(s)} is now inactive: signed out everywhere and can't sign in until made active again.`);
      this.confirming.set(null);
      await this.load();
    } catch (e) {
      this.listError.set(problemMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  // ---------- Delete ----------

  protected askDelete(s: StaffMember): void {
    this.clearMessages();
    this.confirming.set({ id: s.publicId, kind: 'delete' });
  }

  protected async confirmDelete(s: StaffMember, f: NgForm): Promise<void> {
    this.busy.set(true);
    this.listError.set('');
    try {
      await firstValueFrom(this.http.delete(`${this.api}/${encodeURIComponent(s.publicId)}`));
      this.listNotice.set(`${this.name(s)} was deleted and signed out everywhere.`);
      this.confirming.set(null);
      if (this.editing()?.publicId === s.publicId) this.cancelEdit(f);   // the form was editing them
      await this.load();
    } catch (e) {
      this.listError.set(problemMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      this.staff.set(await firstValueFrom(this.http.get<StaffMember[]>(this.api)));
    } catch (e) {
      this.loadError.set(problemMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected roleName(code: string): string {
    return ROLES.find(r => r.code === code)?.name ?? code.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  protected roleHint(): string { return ROLES.find(r => r.code === this.form.roleCode)?.hint ?? ''; }

  private async create(f: NgForm): Promise<void> {
    this.errors.set([]);
    this.notice.set('');
    const problems = this.check();
    if (problems.length) { this.errors.set(problems); return; }

    const { fullName, email, roleCode, password } = this.form;
    this.saving.set(true);
    try {
      const res = await firstValueFrom(this.http.post<CreateStaffResponse>(this.api, {
        fullName: fullName.trim(), email: email.trim().toLowerCase(), roleCode, password: password || null
      }));
      const who = email.trim().toLowerCase();
      this.notice.set(
        res.outcome === 'Created' ? `${this.roleName(roleCode)} account created for ${who}. ${password ? 'They can sign in with this email and password, or with a code sent to the email.' : 'They sign in with a code sent to this email.'}`
        : res.outcome === 'RoleAdded' ? `${who} already had an account, so it was given the ${this.roleName(roleCode)} role. Their own password and name were kept.`
        : `${who} already has the ${this.roleName(roleCode)} role. Nothing changed.`);
      this.form = { fullName: '', email: '', roleCode, password: '', confirm: '' };
      this.showPassword.set(false);
      f.resetForm(this.form);
      await this.load();
    } catch (e) {
      this.errors.set(this.apiErrors(e));
    } finally {
      this.saving.set(false);
    }
  }
}
