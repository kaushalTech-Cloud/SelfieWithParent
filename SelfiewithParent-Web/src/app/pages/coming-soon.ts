import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '../core/i18n/t.pipe';
import { SeoService } from '../core/seo.service';
import { DonatePill } from '../shared/donate-pill';

/** Placeholder for pages whose API isn't built yet (gallery, upload, winners, community, impact). */
@Component({
  selector: 'app-coming-soon',
  imports: [DonatePill, RouterLink, TranslatePipe],
  template: `
    <header class="page-hero">
      <app-donate-pill />
      <div class="container">
        <span class="eyebrow">{{ 'Coming soon' | t }}</span>
        <h1>{{ title | t }}</h1>
        <p class="lead">{{ "We're moving this page to the new site. It will be back very soon." | t }}</p>
      </div>
    </header>
    <main id="main" class="pb-5" tabindex="-1">
      <div class="container">
        <div class="card-soft lift text-center">
          <p class="mb-3">{{ 'Meanwhile, you can sign in and get your profile ready.' | t }}</p>
          <a class="btn btn-accent" routerLink="/account"><i class="bi bi-person"></i> {{ 'My account' | t }}</a>
          <a class="btn btn-outline-accent ms-2" routerLink="/">{{ 'Home' | t }}</a>
        </div>
      </div>
    </main>
  `
})
export class ComingSoon {
  protected readonly title: string = inject(ActivatedRoute).snapshot.data['title'] ?? 'Coming soon';

  constructor() {
    inject(SeoService).set({ title: this.title, description: 'This page is coming soon to Selfie with Parent.', path: '/', noIndex: true });
  }
}
