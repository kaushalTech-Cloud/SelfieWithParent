import { Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { isValidEmail, isValidMobile, maskEmail, maskMobile } from '../../core/phone';
import { problemMessage } from '../../core/problem';
import { DialCodeSelect } from '../../shared/dial-code-select';

/** Only allow returning to pages on this site (prevents open redirects). */
function safeReturnUrl(value: string | null): string | null {
  return value && /^\/(?!\/)[\w\-/?=&.%#]*$/.test(value) ? value : null;
}

/**
 * Staff sign-in. Same accounts as the public site (email code, email + password, or mobile code), but only
 * accounts with a staff role get in: anyone else is signed straight back out.
 */
@Component({
  selector: 'app-login',
  imports: [FormsModule, DialCodeSelect],
  templateUrl: './login.html'
})
export class Login implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly returnUrl = safeReturnUrl(inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl'));

  protected readonly method = signal<'email' | 'mobile'>('email');
  protected readonly usePassword = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly passwordMode = computed(() => this.method() === 'email' && this.usePassword());
  protected email = '';
  protected password = '';
  protected dial = '+91';
  protected phone = '';
  protected channel: 'sms' | 'whatsapp' = 'sms';
  protected code = '';

  protected readonly step = signal<'start' | 'code'>('start');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly resendIn = signal(0);
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly codeBox = viewChild<ElementRef<HTMLInputElement>>('codeBox');

  ngOnDestroy(): void { clearInterval(this.timer); }

  protected chooseMethod(m: 'email' | 'mobile'): void { this.method.set(m); this.error.set(''); }

  protected togglePassword(): void {
    this.usePassword.set(!this.usePassword());
    this.password = '';
    this.showPassword.set(false);
    this.error.set('');
  }

  protected sentTo(): string {
    return this.method() === 'email' ? maskEmail(this.email) : maskMobile(this.dial, this.phone);
  }

  protected async start(): Promise<void> {
    this.error.set('');
    const byEmail = this.method() === 'email';
    if (byEmail && !isValidEmail(this.email)) { this.error.set('Enter a valid email address.'); return; }
    if (!byEmail && !isValidMobile(this.dial, this.phone)) { this.error.set('Enter a valid mobile number.'); return; }
    if (this.passwordMode() && !this.password) { this.error.set('Enter your password.'); return; }

    this.busy.set(true);
    try {
      if (this.passwordMode()) {
        await this.finish(this.auth.signInWithPassword(this.email.trim().toLowerCase(), this.password));
        this.password = '';
        return;
      }
      if (byEmail) await this.auth.requestEmailCode(this.email.trim().toLowerCase());
      else await this.auth.requestMobileCode(this.dial, this.phone.replace(/\D/g, ''), this.channel);
      this.code = '';
      this.step.set('code');
      this.startTimer();
      setTimeout(() => this.codeBox()?.nativeElement.focus());
    } catch (e) {
      this.error.set(problemMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async verify(): Promise<void> {
    this.error.set('');
    const code = this.code.replace(/\D/g, '');
    if (code.length !== 6) { this.error.set('Please enter all 6 digits.'); return; }
    this.busy.set(true);
    try {
      await this.finish(this.method() === 'email'
        ? this.auth.verifyEmailCode(this.email.trim().toLowerCase(), code)
        : this.auth.verifyMobileCode(this.dial, this.phone.replace(/\D/g, ''), code));
    } catch (e) {
      this.error.set(problemMessage(e));
      this.code = '';
    } finally {
      this.busy.set(false);
    }
  }

  protected back(): void { this.step.set('start'); this.error.set(''); clearInterval(this.timer); }

  /** Signed in: staff go on; anyone else is signed out again with a clear message. */
  private async finish(signIn: Promise<unknown>): Promise<void> {
    await signIn;
    if (!this.auth.isStaff()) {
      await this.auth.signOut();
      this.step.set('start');
      this.error.set("This account doesn't have access to the admin site. Ask a super admin if you need it.");
      return;
    }
    await this.router.navigateByUrl(this.returnUrl ?? '/');
  }

  private startTimer(): void {
    clearInterval(this.timer);
    this.resendIn.set(30);
    this.timer = setInterval(() => {
      this.resendIn.update(s => s - 1);
      if (this.resendIn() <= 0) clearInterval(this.timer);
    }, 1000);
  }
}
