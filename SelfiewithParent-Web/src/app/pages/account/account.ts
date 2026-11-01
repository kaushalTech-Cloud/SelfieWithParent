import { HttpErrorResponse } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, OnDestroy, PLATFORM_ID, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProblemDetails, UpdateProfileRequest } from '../../core/api/api.models';
import { AuthService } from '../../core/auth/auth.service';
import { ProfilePhotoService } from '../../core/auth/profile-photo.service';
import { I18nService, LangCode } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { isValidMobile, maskMobile } from '../../core/phone';
import { SeoService } from '../../core/seo.service';
import { DialCodeSelect } from '../../shared/dial-code-select';
import { INDIA_STATES, countryList } from '../../shared/places';
import { FamilyDates } from './family-dates';
import { GratitudeStreak } from './gratitude-streak';
import { PublicProfileSettings } from './public-profile-settings';
import { MyAlbums } from './my-albums';
import { Feature, FeaturesService } from '../../core/features.service';

/** The parts of My account in the left menu (#key in the address; old links to #mobile / #password open "Mobile & password"). */
const SECTIONS: { key: string; name: string; icon: string; feature?: Feature }[] = [
  { key: 'profile', name: 'Profile', icon: 'bi-person' },
  { key: 'sign-in', name: 'Mobile & password', icon: 'bi-shield-lock' },
  { key: 'streak', name: 'Gratitude streak', icon: 'bi-fire', feature: 'streaks' },
  { key: 'albums', name: 'Family albums', icon: 'bi-people', feature: 'albums' },
  { key: 'my-page', name: 'My profile page', icon: 'bi-person-badge', feature: 'profiles' },
  { key: 'reminders', name: 'Family dates & reminders', icon: 'bi-calendar-heart' },
  { key: 'privacy', name: 'Privacy & data', icon: 'bi-shield-check' }
];
const ALIASES: Record<string, string> = { mobile: 'sign-in', password: 'sign-in' };


@Component({
  selector: 'app-account',
  imports: [FormsModule, RouterLink, TranslatePipe, DialCodeSelect, FamilyDates, GratitudeStreak, PublicProfileSettings, MyAlbums],
  templateUrl: './account.html'
})
export class Account implements OnDestroy {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  protected readonly photo = inject(ProfilePhotoService);
  protected readonly photoBusy = signal(false);
  protected readonly photoError = signal('');
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly query = this.route.snapshot.queryParamMap;
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly features = inject(FeaturesService);
  /** The part of My account shown (from the address, e.g. /account#albums). */
  protected readonly section = signal('profile');
  protected readonly sections = computed(() => SECTIONS.filter(s => !s.feature || this.features.on(s.feature)));

  protected readonly welcome = signal(this.query.has('welcome') || !this.auth.profileComplete());
  protected readonly states = INDIA_STATES;
  protected readonly countries = computed(() => countryList(this.i18n.lang()));

  protected form: UpdateProfileRequest = this.fromProfile();
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected mobile = { dial: '+91', number: '', channel: 'sms' as 'sms' | 'whatsapp', code: '' };
  protected readonly mobileStep = signal<'view' | 'number' | 'code'>('view');
  protected readonly mobileBusy = signal(false);
  protected readonly mobileSaved = signal(false);
  protected readonly mobileError = signal('');
  protected readonly mobileResendIn = signal(0);
  private mobileTimer: ReturnType<typeof setInterval> | undefined;
  private readonly mobileCodeBox = viewChild<ElementRef<HTMLInputElement>>('mCode');

  protected pw = { current: '', next: '', confirm: '' };
  protected readonly showPw = signal(false);
  protected readonly pwSaving = signal(false);
  protected readonly pwSaved = signal(false);
  protected readonly pwErrors = signal<string[]>([]);
  protected deleteConfirm = '';
  protected readonly deleting = signal(false);

  protected readonly initials = computed(() => {
    const parts = (this.auth.profile()?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
    return parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() : '•';
  });

  constructor() {
    this.route.fragment.pipe(takeUntilDestroyed()).subscribe(f => {
      const key = ALIASES[f ?? ''] ?? f ?? 'profile';
      this.section.set(SECTIONS.some(s => s.key === key) ? key : 'profile');
      // on phones the menu sits above the content: bring the chosen part into view
      if (f && this.browser && window.innerWidth < 992) setTimeout(() => document.querySelector('.account-sections')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    });
    inject(SeoService).set({ title: 'My account', description: 'Your profile and privacy settings on Selfie with Parent.', path: '/account', noIndex: true });
  }

  private fromProfile(): UpdateProfileRequest {
    const p = this.auth.profile();
    return {
      fullName: p?.fullName ?? '',
      email: p?.email ?? '',
      countryCode: p?.countryCode ?? 'IN',
      stateName: p?.stateName ?? '',
      city: p?.city ?? '',
      preferredLanguage: p?.preferredLanguage ?? this.i18n.lang(),
      isAdultConfirmed: p?.isAdultConfirmed ?? false,
      whatsAppOptIn: p?.whatsAppOptIn ?? false
    };
  }

  protected async save(valid: boolean | null): Promise<void> {
    this.saved.set(false);
    this.errors.set([]);
    if (!valid) { this.errors.set([this.i18n.t('Please fill in the required fields.')]); return; }
    this.saving.set(true);
    try {
      await this.auth.updateProfile({
        ...this.form,
        fullName: this.form.fullName.trim(),
        email: this.form.email?.trim() || null,
        stateName: this.form.stateName?.trim() || null,
        city: this.form.city?.trim() || null
      });
      if (this.form.preferredLanguage !== this.i18n.lang()) this.i18n.setLanguage(this.form.preferredLanguage as LangCode, true);
      this.saved.set(true);
      // First-time setup done → take them back to what they were doing
      const returnUrl = this.query.get('returnUrl');
      if (this.welcome() && returnUrl && /^\/(?!\/)/.test(returnUrl)) await this.router.navigateByUrl(returnUrl);
      this.welcome.set(false);
    } catch (e) {
      const p = e instanceof HttpErrorResponse ? (e.error as ProblemDetails | null) : null;
      const list = p?.errors ? Object.values(p.errors).flat() : [p?.title ?? 'Something went wrong. Please try again.'];
      this.errors.set(list.map(m => this.i18n.t(m)));
    } finally {
      this.saving.set(false);
    }
  }

  // ---------- Profile photo (stored in the database) ----------

  protected async choosePhoto(event: Event): Promise<void> {
    const box = event.target as HTMLInputElement;
    const file = box.files?.[0];
    box.value = '';
    if (!file) return;
    this.photoError.set('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      this.photoError.set(this.i18n.t('Choose a JPG, PNG or WebP photo up to 10 MB.'));
      return;
    }
    this.photoBusy.set(true);
    try {
      await this.photo.upload(file);
    } catch (e) {
      this.photoError.set(this.problem(e));
    } finally {
      this.photoBusy.set(false);
    }
  }

  protected async removePhoto(): Promise<void> {
    this.photoBusy.set(true);
    this.photoError.set('');
    try {
      await this.photo.remove();
    } catch (e) {
      this.photoError.set(this.problem(e));
    } finally {
      this.photoBusy.set(false);
    }
  }

  // ---------- Mobile number: add or change, confirmed with a code ----------

  protected startMobile(): void {
    this.mobile = { ...this.mobile, number: '', code: '' };
    this.mobileError.set('');
    this.mobileSaved.set(false);
    this.mobileStep.set('number');
  }

  protected cancelMobile(): void {
    clearInterval(this.mobileTimer);
    this.mobileError.set('');
    this.mobileStep.set('view');
  }

  protected mobileSentTo(): string { return maskMobile(this.mobile.dial, this.mobile.number); }

  protected async sendMobileCode(): Promise<void> {
    this.mobileError.set('');
    if (!isValidMobile(this.mobile.dial, this.mobile.number)) { this.mobileError.set(this.i18n.t('Enter a valid mobile number.')); return; }
    this.mobileBusy.set(true);
    try {
      await this.auth.requestMobileChange(this.mobile.dial, this.mobile.number.replace(/\D/g, ''), this.mobile.channel);
      this.mobile.code = '';
      this.mobileStep.set('code');
      this.startMobileTimer();
      setTimeout(() => this.mobileCodeBox()?.nativeElement.focus());
    } catch (e) {
      this.mobileError.set(this.problem(e));
    } finally {
      this.mobileBusy.set(false);
    }
  }

  protected async verifyMobileCode(): Promise<void> {
    this.mobileError.set('');
    const code = this.mobile.code.replace(/\D/g, '');
    if (code.length !== 6) { this.mobileError.set(this.i18n.t('Please enter all 6 digits.')); return; }
    this.mobileBusy.set(true);
    try {
      await this.auth.verifyMobileChange(this.mobile.dial, this.mobile.number.replace(/\D/g, ''), code);
      clearInterval(this.mobileTimer);
      this.mobileStep.set('view');
      this.mobileSaved.set(true);
    } catch (e) {
      this.mobileError.set(this.problem(e));
    } finally {
      this.mobileBusy.set(false);
    }
  }

  private startMobileTimer(): void {
    clearInterval(this.mobileTimer);
    this.mobileResendIn.set(30);
    this.mobileTimer = setInterval(() => {
      this.mobileResendIn.update(s => s - 1);
      if (this.mobileResendIn() <= 0) clearInterval(this.mobileTimer);
    }, 1000);
  }

  ngOnDestroy(): void { clearInterval(this.mobileTimer); }

  /** Whether a part is shown: the chosen one; during the welcome step, the profile, sign-in and privacy parts as before. */
  protected show(key: string): boolean {
    return this.welcome() ? ['profile', 'sign-in', 'privacy'].includes(key) : this.section() === key;
  }

  /** The API's own (friendly) message, translated where we have it. */
  private problem(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 0) return this.i18n.t("We couldn't reach the server. Please check your connection and try again.");
      const p = e.error as ProblemDetails | null;
      if (p?.errors) return this.i18n.t(Object.values(p.errors)[0]?.[0] ?? 'Please check the details and try again.');
      if (p?.title) return this.i18n.t(p.title);
    }
    return this.i18n.t('Something went wrong. Please try again.');
  }

  /** Add (first time) or change the password. The API checks the rules again; these checks just save a round trip. */
  protected async savePassword(hasPassword: boolean, email: string): Promise<void> {
    this.pwSaved.set(false);
    this.pwErrors.set([]);
    const { current, next, confirm } = this.pw;
    if (hasPassword && !current) { this.pwErrors.set([this.i18n.t('Enter your current password.')]); return; }
    if (next.length < 8) { this.pwErrors.set([this.i18n.t('Use at least 8 characters.')]); return; }
    if (next !== confirm) { this.pwErrors.set([this.i18n.t("The passwords don't match.")]); return; }
    const local = email.split('@')[0].toLowerCase();
    if (local.length >= 4 && next.toLowerCase().includes(local)) { this.pwErrors.set([this.i18n.t("Don't use your email address in your password.")]); return; }

    this.pwSaving.set(true);
    try {
      await this.auth.setPassword(next, hasPassword ? current : null);
      this.pw = { current: '', next: '', confirm: '' };
      this.showPw.set(false);
      this.pwSaved.set(true);
    } catch (e) {
      const p = e instanceof HttpErrorResponse ? (e.error as ProblemDetails | null) : null;
      const list = p?.errors ? Object.values(p.errors).flat() : [p?.title ?? 'Something went wrong. Please try again.'];
      this.pwErrors.set(list.map(m => this.i18n.t(m)));
    } finally {
      this.pwSaving.set(false);
    }
  }

  protected async download(): Promise<void> {
    const blob = await this.auth.exportData();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-selfie-with-parent-data.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/');
  }

  protected async deleteAccount(): Promise<void> {
    if (this.deleteConfirm.trim().toUpperCase() !== 'DELETE') return;
    this.deleting.set(true);
    try {
      await this.auth.deleteAccount();
      await this.router.navigateByUrl('/');
    } finally {
      this.deleting.set(false);
    }
  }
}
