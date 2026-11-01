import { Component, RESPONSE_INIT, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../core/i18n/t.pipe';
import { SeoService } from '../core/seo.service';

/** A feature staff switched off (admin site › Site features): a polite page instead of a broken one. */
@Component({
  selector: 'app-not-available',
  imports: [RouterLink, TranslatePipe],
  template: `
    <main id="main" class="section status-page" tabindex="-1">
      <div class="container">
        <div class="status-card">
          <div class="status-icon teal" aria-hidden="true"><i class="bi bi-cup-hot"></i></div>
          <h1 class="section-title">{{ 'Not available right now' | t }}</h1>
          <p class="text-muted">{{ "This part of the website is taking a little rest. Please come back soon — there's plenty more to see meanwhile." | t }}</p>
          <div class="d-flex flex-wrap justify-content-center gap-2">
            <a class="btn btn-accent" routerLink="/"><i class="bi bi-house"></i> {{ 'Home' | t }}</a>
            <a class="btn btn-outline-accent" routerLink="/selfies"><i class="bi bi-images"></i> {{ 'Latest Selfies' | t }}</a>
          </div>
        </div>
      </div>
    </main>`
})
export class NotAvailable {
  constructor() {
    const response = inject(RESPONSE_INIT, { optional: true });
    if (response) response.status = 404;
    inject(SeoService).set({ title: 'Not available right now', description: 'This part of the website is not available right now.', path: '/not-available', noIndex: true });
  }
}
