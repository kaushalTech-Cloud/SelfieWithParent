import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, computed, inject, signal, viewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ProblemDetails } from '../../core/api/api.models';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { isValidEmail, isValidMobile, maskEmail, maskMobile } from '../../core/phone';
import { SeoService } from '../../core/seo.service';
import { DialCodeSelect } from '../../shared/dial-code-select';

/** Only allow returning to pages on this site (prevents open redirects). */
function safeReturnUrl(value: string | null): string | null {
  return value && /^\/(?!\/)[\w\-/?=&.%#]*$/.test(value) ? value : null;
}

@Component({
  selector: 'app-login',
  imports: [FormsModule, TranslatePipe, DialCodeSelect],
  templateUrl: './login.html'
})
export class Login implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);
  private readonly returnUrl = safeReturnUrl(inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl'));

  protected readonly method = signal<'mobile' | 'email'>('mobile');
  protected dial = '+91';
  protected phone = '';
  protected email = '';
  protected password = '';
  /** Email tab: sign in with a password (accounts that added one) instead of an emailed code. */
  protected readonly usePassword = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly passwordMode = computed(() => this.method() === 'email' && this.usePassword());
  protected channel: 'sms' | 'whatsapp' = 'sms';

  protected readonly step = signal<'phone' | 'code'>('phone');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly resendIn = signal(0);
  protected readonly digits = signal<string[]>(['', '', '', '', '', '']);
  private readonly boxes = viewChildren<ElementRef<HTMLInputElement>>('box');
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    inject(SeoService).set({ title: 'Sign in', description: 'Sign in with your mobile number to share selfies, videos and family stories.', path: '/login', noIndex: true });
  }

  ngOnDestroy(): void { clearInterval(this.timer); }

  /** Where the code went, masked: "+91 ••••• 3210" or "k•••@gmail.com". */
  protected sentTo(): string {
    return this.method() === 'email' ? maskEmail(this.email) : maskMobile(this.dial, this.phone);
  }

  protected chooseMethod(m: 'mobile' | 'email'): void { this.method.set(m); this.error.set(''); }

  protected togglePassword(): void {
    this.usePassword.set(!this.usePassword());
    this.password = '';
    this.showPassword.set(false);
    this.error.set('');
  }

  protected async sendCode(): Promise<void> {
    if (this.passwordMode()) return this.signInWithPassword();
    this.error.set('');
    const byEmail = this.method() === 'email';
    if (byEmail && !isValidEmail(this.email)) { this.error.set(this.i18n.t('Enter a valid email address.')); return; }
    if (!byEmail && !isValidMobile(this.dial, this.phone)) { this.error.set(this.i18n.t('Enter a valid mobile number.')); return; }
    this.busy.set(true);
    try {
      if (byEmail) await this.auth.requestEmailCode(this.email.trim().toLowerCase());
      else await this.auth.requestCode(this.dial, this.phone.replace(/\D/g, ''), this.channel);
      this.digits.set(['', '', '', '', '', '']);
      this.step.set('code');
      this.startTimer();
      setTimeout(() => this.boxes()[0]?.nativeElement.focus());
    } catch (e) {
      this.error.set(this.message(e));
    } finally {
      this.busy.set(false);
    }
  }

  private async signInWithPassword(): Promise<void> {
    this.error.set('');
    if (!isValidEmail(this.email)) { this.error.set(this.i18n.t('Enter a valid email address.')); return; }
    if (!this.password) { this.error.set(this.i18n.t('Enter your password.')); return; }
    this.busy.set(true);
    try {
      const profile = await this.auth.signInWithPassword(this.email.trim().toLowerCase(), this.password);
      this.password = '';
      await this.afterSignIn(profile);
    } catch (e) {
      this.error.set(this.message(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** First sign-in → complete the profile once; afterwards go straight back. */
  private async afterSignIn(profile: { profileComplete: boolean } | null): Promise<void> {
    if (!profile?.profileComplete) {
      await this.router.navigate(['/account'], { queryParams: { welcome: 1, ...(this.returnUrl ? { returnUrl: this.returnUrl } : {}) } });
    } else {
      await this.router.navigateByUrl(this.returnUrl ?? '/account');
    }
  }

  protected onDigit(i: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const v = input.value.replace(/\D/g, '').slice(-1);
    input.value = v;
    this.digits.update(d => { const c = [...d]; c[i] = v; return c; });
    this.error.set('');
    if (v && i < 5) this.boxes()[i + 1]?.nativeElement.focus();
    if (this.digits().every(Boolean)) void this.verify();
  }

  protected onKey(i: number, event: KeyboardEvent): void {
    const box = this.boxes();
    if (event.key === 'Backspace' && !this.digits()[i] && i > 0) box[i - 1].nativeElement.focus();
    if (event.key === 'ArrowLeft' && i > 0) box[i - 1].nativeElement.focus();
    if (event.key === 'ArrowRight' && i < 5) box[i + 1].nativeElement.focus();
  }

  protected onPaste(event: ClipboardEvent): void {
    const text = (event.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    event.preventDefault();
    const next = ['', '', '', '', '', ''].map((_, k) => text[k] ?? '');
    this.digits.set(next);
    this.boxes().forEach((b, k) => (b.nativeElement.value = next[k]));
    if (text.length === 6) void this.verify();
  }

  protected async verify(): Promise<void> {
    const code = this.digits().join('');
    if (code.length !== 6) { this.error.set(this.i18n.t('Please enter all 6 digits.')); return; }
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const profile = this.method() === 'email'
        ? await this.auth.verifyEmailCode(this.email.trim().toLowerCase(), code)
        : await this.auth.verifyCode(this.dial, this.phone.replace(/\D/g, ''), code);
      await this.afterSignIn(profile);
    } catch (e) {
      this.error.set(this.message(e));
      this.digits.set(['', '', '', '', '', '']);
      this.boxes().forEach(b => (b.nativeElement.value = ''));
      this.boxes()[0]?.nativeElement.focus();
    } finally {
      this.busy.set(false);
    }
  }

  protected changeNumber(): void { this.step.set('phone'); this.error.set(''); clearInterval(this.timer); }

  protected resend(): void { void this.sendCode(); }

  private startTimer(): void {
    clearInterval(this.timer);
    this.resendIn.set(30);
    this.timer = setInterval(() => {
      this.resendIn.update(s => s - 1);
      if (this.resendIn() <= 0) clearInterval(this.timer);
    }, 1000);
  }

  /** Shows the API's own (already friendly, non-revealing) message, translated where we have it. */
  private message(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      const p = e.error as ProblemDetails | null;
      if (e.status === 0) return this.i18n.t("We couldn't reach the server. Please check your connection and try again.");
      if (p?.errors) return this.i18n.t(Object.values(p.errors)[0]?.[0] ?? 'Please check the details and try again.');
      if (p?.title) return this.i18n.t(p.title);
    }
    return this.i18n.t('Something went wrong. Please try again.');
  }
}
