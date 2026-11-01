import { isPlatformBrowser } from '@angular/common';
import { Component, NgZone, OnDestroy, PLATFORM_ID, computed, effect, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { SiteLink } from '../../shared/site-link';
import { Slide } from './home-content';
import { DonatePill } from '../../shared/donate-pill';

/**
 * The home page's top slider: full-width slides (picture, small heading, title with a highlighted line, text, up to two
 * buttons). Moves on by itself every 6 seconds; arrows, dots and swipe; pauses while hovered or focused, and doesn't move
 * by itself for visitors who prefer reduced motion. One slide: no controls.
 */
@Component({
  selector: 'app-hero-slider',
  imports: [DonatePill, SiteLink, TranslatePipe],
  template: `
    <header id="home" class="hero hero-slider" [attr.aria-roledescription]="slides().length > 1 ? 'carousel' : null"
            [attr.aria-label]="'Highlights' | t" (mouseenter)="paused.set(true)" (mouseleave)="paused.set(false)"
            (focusin)="paused.set(true)" (focusout)="paused.set(false)" (touchstart)="touchStart($event)" (touchend)="touchEnd($event)">
      <app-donate-pill />
      @for (s of slides(); track $index; let i = $index) {
        <div class="hero-slide hs-slide" [class.active]="i === index()" [style.background-image]="'url(' + s.image + ')'"
             role="group" [attr.aria-roledescription]="slides().length > 1 ? 'slide' : null" [attr.aria-label]="(i + 1) + ' / ' + slides().length"
             [attr.aria-hidden]="i !== index()" [attr.inert]="i !== index() ? '' : null">
          <div class="container">
            <div class="row align-items-center min-vh-hero">
              <div class="col-lg-7 text-white">
                @if (s.eyebrow) { <span class="eyebrow">{{ s.eyebrow }}</span> }
                @if (i === 0) {
                  <h1 class="display-4">{{ s.title }}@if (s.highlight) { <br><em>{{ s.highlight }}</em> }</h1>
                } @else {
                  <h2 class="display-4">{{ s.title }}@if (s.highlight) { <br><em>{{ s.highlight }}</em> }</h2>
                }
                @if (s.text) { <p class="lead">{{ s.text }}</p> }
                @if (s.buttons.length) {
                  <div class="d-flex flex-wrap gap-3 align-items-center">
                    @for (b of s.buttons; track $index; let first = $first) {
                      <a [siteLink]="b.link" class="btn btn-lg" [class.btn-accent]="first" [class.btn-ghost-light]="!first">{{ b.label }}</a>
                    }
                  </div>
                }
                @if (trust()) { <p class="hero-trust"><i class="bi bi-people-fill"></i> {{ trust() }}</p> }
              </div>
            </div>
          </div>
        </div>
      }
      @if (slides().length > 1) {
        <button type="button" class="hs-arrow prev" (click)="go(index() - 1)" [attr.aria-label]="'Previous' | t"><i class="bi bi-chevron-left"></i></button>
        <button type="button" class="hs-arrow next" (click)="go(index() + 1)" [attr.aria-label]="'Next' | t"><i class="bi bi-chevron-right"></i></button>
        <div class="hs-dots">
          @for (s of slides(); track $index; let i = $index) {
            <button type="button" [class.on]="i === index()" (click)="go(i)" [attr.aria-label]="('Slide' | t) + ' ' + (i + 1)" [attr.aria-current]="i === index()"></button>
          }
        </div>
      }
    </header>`,
  styles: `
    .hero-slider { position: relative; overflow: hidden; background: var(--primary-dark, #0a3d3e); }
    /* Crossfade: the old picture fades out (and only then hides) while the new slide fades in */
    .hs-slide { position: absolute; inset: 0; opacity: 0; visibility: hidden; transition: opacity .8s ease, visibility 0s linear .8s; }
    .hs-slide.active { position: relative; opacity: 1; visibility: visible; transition: opacity .8s ease, visibility 0s; }
    .hs-slide:not(.active) .container { visibility: hidden; }   /* only the pictures crossfade; the old text goes at once */
    .hs-arrow { position: absolute; top: 50%; transform: translateY(-50%); z-index: 3; width: 2.8rem; height: 2.8rem; border-radius: 50%;
      border: 1px solid rgba(255,255,255,.45); background: rgba(0,0,0,.18); color: #fff; font-size: 1.2rem; display: grid; place-items: center; }
    .hs-arrow:hover { background: rgba(0,0,0,.35); }
    .hs-arrow.prev { left: 1rem; } .hs-arrow.next { right: 1rem; }
    .hs-dots { position: absolute; left: 0; right: 0; bottom: 92px; z-index: 3; display: flex; justify-content: center; gap: .5rem; }
    .hs-dots button { width: .65rem; height: .65rem; border-radius: 999px; border: 0; background: rgba(255,255,255,.55); padding: 0; transition: width .3s; }
    .hs-dots button.on { width: 1.8rem; background: var(--gold, #f7b733); }
    @media (max-width: 1199.98px) { .hs-arrow { display: none; } }   /* dots and swipe; arrows only where they clear the text */
    @media (max-width: 767.98px) { .hs-dots { bottom: 84px; } }
    @media (prefers-reduced-motion: reduce) { .hs-slide { transition: none; } }
  `
})
export class HeroSlider implements OnDestroy {
  readonly slides = input.required<Slide[]>();
  /** The line under the first slide's buttons, e.g. "25,000+ selfies shared · 6 languages · free for everyone". */
  readonly trustLine = input('');

  protected readonly index = signal(0);
  protected readonly paused = signal(false);
  protected readonly trust = computed(() => this.index() === 0 ? this.trustLine() : '');
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly still = this.inBrowser && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private timer: ReturnType<typeof setInterval> | null = null;
  private touchX = 0;

  constructor() {
    // Keep the slide in range when the list changes (staff content arriving, language switch)
    effect(() => { if (this.index() >= this.slides().length) this.index.set(0); });
    // Outside Angular's zone, so the page still counts as settled (hydration, tests); the slide is a signal, so it still updates
    if (this.inBrowser && !this.still) inject(NgZone).runOutsideAngular(() => {
      this.timer = setInterval(() => { if (!this.paused() && this.slides().length > 1) this.go(this.index() + 1); }, 6000);
    });
  }

  ngOnDestroy(): void { if (this.timer) clearInterval(this.timer); }

  protected go(i: number): void {
    const n = this.slides().length;
    if (n) this.index.set((i + n) % n);
  }

  protected touchStart(e: TouchEvent): void { this.touchX = e.changedTouches[0]?.clientX ?? 0; }

  protected touchEnd(e: TouchEvent): void {
    const dx = (e.changedTouches[0]?.clientX ?? 0) - this.touchX;
    if (Math.abs(dx) > 50) this.go(this.index() + (dx < 0 ? 1 : -1) * (document.dir === 'rtl' ? -1 : 1));
  }
}
