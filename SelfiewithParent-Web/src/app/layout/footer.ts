import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../core/i18n/t.pipe';
import { MenuService } from '../core/menu/menu.service';

/** Site footer. The footer links come from the database (menu code "footer"). */
@Component({
  selector: 'app-footer',
  imports: [RouterLink, TranslatePipe],
  template: `
    <footer class="site-footer">
      <div class="container">
        <div class="row g-4 align-items-center">
          <div class="col-md-6">
            <img src="img/logo-light.svg" alt="Selfie with Parent" height="44">
            <p class="mt-3 mb-0">{{ 'Celebrating parents. Caring for elders.' | t }}</p>
          </div>
          <div class="col-md-6 text-md-end">
            <div class="social">
              <a href="#" aria-label="Facebook"><i class="bi bi-facebook"></i></a>
              <a href="#" aria-label="Instagram"><i class="bi bi-instagram"></i></a>
              <a href="#" aria-label="X"><i class="bi bi-twitter-x"></i></a>
              <a href="#" aria-label="YouTube"><i class="bi bi-youtube"></i></a>
            </div>
          </div>
        </div>
        <hr>
        <div class="d-flex flex-wrap justify-content-between gap-2 small">
          <span>&copy; {{ year }} {{ 'Selfie with Parent. All rights reserved.' | t }}</span>
          <nav class="footer-links" aria-label="Footer">
            @for (item of links(); track item.key; let last = $last) {
              @let t = target(item.url!);
              @if (t.internal) {
                <a [routerLink]="t.path" [queryParams]="t.queryParams" [fragment]="t.fragment">{{ item.label }}</a>
              } @else {
                <a [href]="t.href" [attr.target]="item.opensNewTab ? '_blank' : null" [attr.rel]="item.opensNewTab ? 'noopener noreferrer' : null">{{ item.label }}</a>
              }
              @if (!last) { <span aria-hidden="true"> · </span> }
            }
          </nav>
        </div>
      </div>
    </footer>
  `
})
export class Footer {
  protected readonly year = new Date().getFullYear();
  protected readonly links = inject(MenuService).items('footer');
  protected target = MenuService.target;
}
