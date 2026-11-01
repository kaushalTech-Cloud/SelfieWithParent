import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FeaturesService } from '../core/features.service';
import { TranslatePipe } from '../core/i18n/t.pipe';

/**
 * The "❤ Donate" button in the top-right corner of every page's banner (it replaced the Donate item in the header menu,
 * which hid inside ☰ on laptops and phones). Opens the Support page's donate box. Hidden while Support is switched off in
 * the admin site (Site features). The banner must be position: relative.
 */
@Component({
  selector: 'app-donate-pill',
  imports: [RouterLink, TranslatePipe],
  template: `@if (features.on('support')) { <a class="donate-pill" routerLink="/support" fragment="donate"><i class="bi bi-heart-fill" aria-hidden="true"></i> {{ 'Donate' | t }}</a> }`,
  styles: `
    :host { position: absolute; top: 16px; right: 16px; z-index: 6; }
    :host-context([dir="rtl"]) { right: auto; left: 16px; }
    .donate-pill { display: inline-flex; align-items: center; gap: .4rem; padding: .45rem 1rem; border-radius: 999px; font-weight: 700; font-size: .88rem;
      color: #fff; text-decoration: none; background: linear-gradient(135deg, #f06543, #d64563); border: 1px solid rgba(255,255,255,.35);
      box-shadow: 0 10px 24px -10px rgba(214,69,99,.85); transition: transform .2s, box-shadow .2s; }
    .donate-pill:hover { color: #fff; transform: translateY(-2px); box-shadow: 0 14px 28px -10px rgba(214,69,99,.95); }
    .donate-pill i { animation: dp-beat 2.4s ease-in-out infinite; }
    @keyframes dp-beat { 0%, 60%, 100% { transform: scale(1); } 70% { transform: scale(1.25); } 80% { transform: scale(1); } 90% { transform: scale(1.15); } }
    @media (max-width: 575.98px) { :host { top: 10px; right: 10px; } .donate-pill { padding: .35rem .8rem; font-size: .8rem; } }
    @media (prefers-reduced-motion: reduce) { .donate-pill, .donate-pill i { animation: none; transition: none; } }
  `
})
export class DonatePill {
  protected readonly features = inject(FeaturesService);
}
