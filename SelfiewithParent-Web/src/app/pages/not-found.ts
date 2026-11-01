import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../core/i18n/t.pipe';
import { SeoService } from '../core/seo.service';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, TranslatePipe],
  template: `
    <main id="main" class="section status-page" tabindex="-1">
      <div class="container">
        <div class="status-card">
        <div class="status-icon" aria-hidden="true"><i class="bi bi-signpost-split"></i></div>
        <h1 class="section-title">{{ 'Page not found' | t }}</h1>
        <p class="text-muted">{{ "The page you're looking for doesn't exist or has moved." | t }}</p>
        <div class="d-flex flex-wrap justify-content-center gap-2">
          <a class="btn btn-accent" routerLink="/"><i class="bi bi-house"></i> {{ 'Home' | t }}</a>
          <a class="btn btn-outline-accent" routerLink="/selfies"><i class="bi bi-images"></i> {{ 'Latest Selfies' | t }}</a>
        </div>
        </div>
      </div>
    </main>
  `
})
export class NotFound {
  constructor() {
    inject(SeoService).set({ title: 'Page not found', description: 'This page does not exist.', path: '/404', noIndex: true });
  }
}
