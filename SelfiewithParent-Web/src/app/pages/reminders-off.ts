import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';
import { TranslatePipe } from '../core/i18n/t.pipe';
import { SeoService } from '../core/seo.service';

/**
 * /reminders/off?u=…&t=… — the "switch off all reminder emails" link from a reminder email. Works without signing in
 * (the link is signed by the API). Reminders can be switched on again in My account.
 */
@Component({
  selector: 'app-reminders-off',
  imports: [RouterLink, TranslatePipe],
  template: `
    <main id="main" class="section status-page" tabindex="-1">
      <div class="container">
        <div class="status-card">
        @switch (state()) {
          @case ('working') { <p class="text-muted"><span class="spinner-border spinner-border-sm"></span> {{ 'Switching off reminder emails…' | t }}</p> }
          @case ('done') {
            <div class="status-icon teal" aria-hidden="true"><i class="bi bi-bell-slash"></i></div>
            <h1 class="section-title">{{ 'Reminder emails are off' | t }}</h1>
            <p class="text-muted">{{ "You won't get family date reminders or yearly Then & Now emails any more. You can switch them on again in My account." | t }}</p>
            <a class="btn btn-accent" routerLink="/account" fragment="reminders">{{ 'My account' | t }}</a>
          }
          @default {
            <div class="status-icon" aria-hidden="true"><i class="bi bi-link-45deg"></i></div>
            <h1 class="section-title">{{ "This link doesn't work any more" | t }}</h1>
            <p class="text-muted">{{ 'Sign in and change reminders in My account.' | t }}</p>
            <a class="btn btn-accent" routerLink="/account" fragment="reminders">{{ 'My account' | t }}</a>
          }
        }
        </div>
      </div>
    </main>`
})
export class RemindersOff {
  protected readonly state = signal<'working' | 'done' | 'failed'>('working');

  constructor() {
    inject(SeoService).set({ title: 'Reminder emails', description: 'Switch off reminder emails.', path: '/reminders/off', noIndex: true });
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const q = new URLSearchParams(location.search);
    const user = q.get('u'), token = q.get('t');
    if (!user || !token) { this.state.set('failed'); return; }
    inject(HttpClient).post(`${environment.apiBaseUrl}/api/v1/reminders/off`, { user, token })
      .subscribe({ next: () => this.state.set('done'), error: () => this.state.set('failed') });
  }
}
