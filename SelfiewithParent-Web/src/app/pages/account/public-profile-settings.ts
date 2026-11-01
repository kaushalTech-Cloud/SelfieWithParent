import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProblemDetails } from '../../core/api/api.models';
import { AuthService } from '../../core/auth/auth.service';
import { FeaturesService } from '../../core/features.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { LikeShare } from '../../shared/like-share';

interface MyProfile { handle: string | null; isPublic: boolean; displayName: string; bio: string | null; showStreak: boolean; exists: boolean; }

/**
 * My account › My profile page: a page at /p/{address} showing the visitor's approved selfies, frames, reels, contest wins
 * and streak badges, which they can share. Private until they switch it on.
 */
@Component({
  selector: 'app-public-profile-settings',
  imports: [FormsModule, RouterLink, TranslatePipe, LikeShare],
  template: `
    @if (features.on('profiles') && loaded()) {
    <section class="card-soft" id="my-page">
      <h2 class="acc-title">{{ 'My profile page' | t }}</h2>
      <p class="small text-muted">{{ 'A page with all your selfies, frames, reels, wins and badges that you can share with family and friends. Only your approved photos are shown.' | t }}</p>

      <form class="row g-2" (ngSubmit)="save()">
        <div class="col-12">
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" role="switch" id="ppPublic" name="ppPublic" [(ngModel)]="form.isPublic">
            <label class="form-check-label fw-semibold" for="ppPublic">{{ 'Show my profile page to everyone' | t }}</label>
          </div>
        </div>
        <div class="col-md-6">
          <label class="form-label small" for="ppHandle">{{ 'Page address' | t }}</label>
          <div class="input-group input-group-sm">
            <span class="input-group-text">/p/</span>
            <input class="form-control" id="ppHandle" name="ppHandle" maxlength="30" required autocapitalize="off" spellcheck="false" [(ngModel)]="form.handle" (ngModelChange)="form.handle = clean($event)">
          </div>
          <small class="text-muted">{{ '3 to 30 small letters, numbers and dashes.' | t }}</small>
        </div>
        <div class="col-md-6">
          <label class="form-label small" for="ppName">{{ 'Name to show' | t }}</label>
          <input class="form-control form-control-sm" id="ppName" name="ppName" maxlength="60" required [(ngModel)]="form.displayName">
        </div>
        <div class="col-12">
          <label class="form-label small" for="ppBio">{{ 'A line about you (optional)' | t }}</label>
          <input class="form-control form-control-sm" id="ppBio" name="ppBio" maxlength="160" [placeholder]="'e.g. Daughter of Meena and Raj, living in Dubai' | t" [(ngModel)]="form.bio">
        </div>
        @if (features.on('streaks')) {
          <div class="col-12 form-check form-switch ms-2">
            <input class="form-check-input" type="checkbox" role="switch" id="ppStreak" name="ppStreak" [(ngModel)]="form.showStreak">
            <label class="form-check-label" for="ppStreak">{{ 'Show my gratitude streak and badges' | t }}</label>
          </div>
        }
        @if (error()) { <div class="col-12 small text-danger" role="alert">{{ error() }}</div> }
        @if (saved()) { <div class="col-12 small text-success" role="status">{{ 'Saved.' | t }}</div> }
        <div class="col-12 d-flex flex-wrap align-items-center gap-2">
          <button type="submit" class="btn btn-accent btn-sm" [disabled]="busy()">{{ 'Save' | t }}</button>
          @if (live(); as h) {
            <a class="btn btn-light btn-sm" [routerLink]="['/p', h]"><i class="bi bi-box-arrow-up-right"></i> {{ 'View my page' | t }}</a>
            <app-like-share [id]="'p-' + h" [title]="form.displayName" [path]="'/p/' + h" [shareOnly]="true" [compact]="true" />
          }
        </div>
      </form>
    </section>
    }`
})
export class PublicProfileSettings implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly auth = inject(AuthService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly features = inject(FeaturesService);
  private readonly api = `${environment.apiBaseUrl}/api/v1/me/public-profile`;

  protected form = { handle: '', isPublic: false, displayName: '', bio: '', showStreak: true };
  protected readonly loaded = signal(false);
  /** The saved address, while the page is public. */
  protected readonly live = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly saved = signal(false);

  ngOnInit(): void { if (this.browser) void this.load(); }

  /** Small letters, numbers and dashes only. */
  protected clean(v: string): string { return (v ?? '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 30); }

  private async load(): Promise<void> {
    try {
      const p = await firstValueFrom(this.http.get<MyProfile>(this.api));
      const name = this.auth.profile()?.fullName ?? '';
      this.form = p.exists
        ? { handle: p.handle ?? '', isPublic: p.isPublic, displayName: p.displayName, bio: p.bio ?? '', showStreak: p.showStreak }
        : { handle: this.clean(name).replace(/^-+|-+$/g, ''), isPublic: false, displayName: name, bio: '', showStreak: true };
      this.live.set(p.exists && p.isPublic ? p.handle : null);
      this.loaded.set(true);
    } catch { /* the section stays hidden */ }
  }

  protected async save(): Promise<void> {
    const f = this.form;
    this.saved.set(false);
    if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(f.handle)) { this.error.set(this.i18n.t('The address can have 3 to 30 small letters, numbers and dashes.')); return; }
    if (f.displayName.trim().length < 2) { this.error.set(this.i18n.t('Add the name to show.')); return; }
    this.busy.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.http.put(this.api, { ...f, displayName: f.displayName.trim(), bio: f.bio.trim() || null }));
      this.live.set(f.isPublic ? f.handle : null);
      this.saved.set(true);
    } catch (e) {
      const p = e instanceof HttpErrorResponse ? e.error as ProblemDetails : null;
      this.error.set(this.i18n.t(p?.title ?? "We couldn't save it. Please try again."));
    } finally {
      this.busy.set(false);
    }
  }
}
