import { isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, PLATFORM_ID, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { environment } from '../../environments/environment';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/t.pipe';
import { LikesService } from '../core/likes.service';
import { RichShareService } from '../core/rich-share';

interface ShareTarget { name: string; icon: string; href: string; }

/**
 * A heart with its count, and a Share menu for every social network: WhatsApp, Facebook, X, LinkedIn, Telegram,
 * Pinterest, Reddit, email, copy link — and the phone's own share sheet, which sends the real photo or video (with the
 * caption and the link) to Instagram, WhatsApp status, Facebook stories or anything installed.
 * Used on gallery tiles, story pages and Photo Frames cards.
 */
@Component({
  selector: 'app-like-share',
  imports: [TranslatePipe],
  template: `
    <div class="like-share" [class.compact]="compact()" [class]="'ls-' + look()">
      @if (!shareOnly()) {
      <button type="button" class="ls-like" [class.on]="liked()" [attr.aria-pressed]="liked()" (click)="like()" [disabled]="busy()"
              [attr.aria-label]="(liked() ? 'Unlike' : 'Like') | t" [title]="(liked() ? 'Unlike' : 'Like') | t">
        <i class="bi" [class.bi-heart-fill]="liked()" [class.bi-heart]="!liked()"></i><span class="ls-count">{{ count() }}</span>
      </button>
      }
      <div class="ls-wrap">
        <button #shareBtn type="button" class="ls-share" [attr.aria-expanded]="!!menu()" aria-haspopup="menu" (click)="toggleMenu($event)"
                [attr.aria-label]="('Share' | t) + ' ' + title()">
          <i class="bi bi-share"></i>@if (!compact() && look() !== 'fab' && look() !== 'icon') { <span>{{ 'Share' | t }}</span> }
        </button>
        <!-- Floats above the page (position: fixed), so cards that clip their content can't hide it -->
        @if (menu(); as m) {
        <ul #menuEl class="dropdown-menu share-menu show" role="menu" (click)="$event.stopPropagation()"
            [style.top.px]="m.top" [style.bottom.px]="m.bottom" [style.left.px]="m.left" [style.max-height.px]="m.maxHeight">
          @if (canNativeShare) {
            @if (hasMedia()) {
              <li><button type="button" class="dropdown-item rich" (click)="nativeShare()" [disabled]="preparing()">
                @if (preparing()) { <span class="spinner-border spinner-border-sm me-2"></span> } @else { <i class="bi" [class]="video() ? 'bi-camera-video' : 'bi-image'"></i> }
                <span>{{ (ready() ? 'Ready — tap to share' : video() ? 'Share the video' : 'Share the photo') | t }}<small>{{ 'WhatsApp, Instagram, Facebook… with the link' | t }}</small></span>
              </button></li>
            } @else {
              <li><button type="button" class="dropdown-item" (click)="nativeShare()"><i class="bi bi-phone"></i>{{ 'Instagram & more apps' | t }}</button></li>
            }
            <li><hr class="dropdown-divider"></li>
          }
          @for (l of targets(); track l.name) {
            <li><a class="dropdown-item" [href]="l.href" target="_blank" rel="noopener noreferrer"><i class="bi" [class]="l.icon"></i>{{ l.name | t }}</a></li>
          }
          <li><button type="button" class="dropdown-item" (click)="copy()"><i class="bi bi-link-45deg"></i>{{ (copied() ? 'Link copied' : 'Copy link') | t }}</button></li>
        </ul>
        }
      </div>
    </div>`,
  styles: `
    .like-share { display: inline-flex; align-items: center; gap: .4rem; }
    .ls-like, .ls-share { display: inline-flex; align-items: center; gap: .35rem; border: 1px solid rgba(0,0,0,.12); background: var(--bs-body-bg, #fff);
      color: inherit; border-radius: 999px; padding: .3rem .75rem; font-size: .9rem; line-height: 1.2; }
    .ls-like .bi { color: var(--accent); }
    .ls-like.on { background: rgba(240,101,67,.1); border-color: var(--accent); }
    .ls-like:hover, .ls-share:hover { border-color: var(--accent); }
    .compact .ls-like, .compact .ls-share { padding: .2rem .55rem; font-size: .82rem; }
    /* glass: on a coloured header banner */
    .ls-glass .ls-like, .ls-glass .ls-share { color: #fff; background: rgba(255,255,255,.14); border-color: rgba(255,255,255,.3); padding: .4rem .95rem;
      backdrop-filter: blur(6px); font-weight: 600; }
    .ls-glass .ls-like .bi { color: #ffb3a3; }
    .ls-glass .ls-like:hover, .ls-glass .ls-share:hover, .ls-glass .ls-like.on { background: #fff; color: var(--primary-dark); border-color: #fff; }
    .ls-glass .ls-like.on .bi { color: var(--accent); }
    /* icon: a small round button on a photo */
    .ls-icon .ls-share { width: 36px; height: 36px; padding: 0; justify-content: center; border: 0; background: rgba(255,255,255,.92);
      color: var(--primary-dark); box-shadow: 0 6px 14px -6px rgba(0,0,0,.45); }
    .ls-icon .ls-share:hover { background: var(--accent); color: #fff; }
    /* fab: the floating round button on phones */
    .ls-fab .ls-share { width: 56px; height: 56px; padding: 0; justify-content: center; border: 0; font-size: 1.35rem; color: #fff;
      background: linear-gradient(135deg, var(--accent), #d64563); box-shadow: 0 14px 28px -10px rgba(214,69,99,.75); }
    .ls-fab .ls-share:hover { filter: brightness(1.05); }
    .share-menu { position: fixed; z-index: 1080; display: block; min-width: 230px; margin: 0; overflow-y: auto; overscroll-behavior: contain;
      border-radius: 14px; box-shadow: 0 18px 44px -14px rgba(0,0,0,.35); }
    .share-menu .dropdown-item .bi { width: 1.4rem; display: inline-block; }
    .share-menu .dropdown-item.rich { display: flex; align-items: flex-start; font-weight: 600; }
    .share-menu .dropdown-item.rich small { display: block; font-weight: 400; font-size: .74rem; color: var(--bs-secondary-color, #6c757d); white-space: normal; }
  `
})
export class LikeShare implements OnDestroy {
  private readonly likesService = inject(LikesService);
  private readonly i18n = inject(I18nService);

  /** The approved selfie / frame. */
  readonly id = input.required<string>();
  /** Its like count from the page's data. */
  readonly likes = input(0);
  readonly title = input.required<string>();
  /** The page to share, e.g. /selfies/{id}. */
  readonly path = input.required<string>();
  /** The picture: shared as a file from the share sheet (and to Pinterest). */
  readonly image = input<string | null>(null);
  /** The video (a video selfie or reel): shared as a file from the share sheet instead of the picture. */
  readonly video = input<string | null>(null);
  /** The caption to share with it (the visitor's message); the title when empty. */
  readonly caption = input<string | null>(null);
  /** Small, for gallery tiles. */
  readonly compact = input(false);
  /** Only the Share button (no heart): for the photo icon and the floating button. */
  readonly shareOnly = input(false);
  /** default · glass (on a header banner) · icon (round, on a photo) · fab (the floating button on phones). */
  readonly look = input<'default' | 'glass' | 'icon' | 'fab'>('default');

  protected readonly liked = computed(() => this.likesService.likes(this.id()));
  protected readonly count = computed(() => this.likesService.count(this.id(), this.likes()));
  protected readonly busy = signal(false);
  protected readonly copied = signal(false);
  /** The open menu's place on the screen: below the button, or above it when there's no room below; scrolls when taller than the screen. */
  protected readonly menu = signal<{ top: number | null; bottom: number | null; left: number; maxHeight: number } | null>(null);
  private readonly shareBtn = viewChild<ElementRef<HTMLButtonElement>>('shareBtn');
  private readonly menuEl = viewChild<ElementRef<HTMLUListElement>>('menuEl');

  constructor() {
    // The open menu moves to <body>: a card with a blur, a hover lift or hidden overflow would otherwise trap or clip it
    effect(() => {
      const el = this.menuEl()?.nativeElement;
      if (el && el.parentElement !== document.body) document.body.appendChild(el);
    });
  }

  ngOnDestroy(): void { this.menuEl()?.nativeElement.remove(); }
  protected readonly canNativeShare = isPlatformBrowser(inject(PLATFORM_ID)) && typeof navigator.share === 'function';
  private readonly rich = inject(RichShareService);
  protected readonly hasMedia = computed(() => !!(this.video() || this.image()) && this.rich.canShareFiles);
  protected readonly preparing = signal(false);
  /** The files are downloaded; the browser wants one more tap to open the share sheet. */
  protected readonly ready = signal(false);

  private readonly url = computed(() => `${environment.siteUrl}${this.path()}`);
  private readonly text = computed(() => {
    const c = this.caption()?.trim();
    return `${this.title()}${c ? ` — “${c}”` : ''}
#SelfieWithParent`;
  });

  protected readonly targets = computed<ShareTarget[]>(() => {
    const u = encodeURIComponent(this.url()), t = encodeURIComponent(this.text()), img = this.image();
    return [
      { name: 'WhatsApp', icon: 'bi-whatsapp', href: `https://wa.me/?text=${t}%20${u}` },
      { name: 'Facebook', icon: 'bi-facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
      { name: 'X', icon: 'bi-twitter-x', href: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
      { name: 'LinkedIn', icon: 'bi-linkedin', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
      { name: 'Telegram', icon: 'bi-telegram', href: `https://t.me/share/url?url=${u}&text=${t}` },
      { name: 'Pinterest', icon: 'bi-pinterest', href: `https://pinterest.com/pin/create/button/?url=${u}&description=${t}${img ? '&media=' + encodeURIComponent(img) : ''}` },
      { name: 'Reddit', icon: 'bi-reddit', href: `https://www.reddit.com/submit?url=${u}&title=${t}` },
      { name: 'Email', icon: 'bi-envelope', href: `mailto:?subject=${encodeURIComponent(this.title())}&body=${t}%0A${u}` }
    ];
  });

  protected toggleMenu(e: Event): void {
    e.stopPropagation();
    if (this.menu()) { this.menu.set(null); return; }
    const r = this.shareBtn()!.nativeElement.getBoundingClientRect();
    const width = 250, gap = 6, vw = window.innerWidth, vh = window.innerHeight;
    const left = Math.max(8, Math.min(r.right - width, vw - width - 8));
    const below = vh - r.bottom - gap - 8, above = r.top - gap - 8;
    this.menu.set(below >= 320 || below >= above
      ? { top: r.bottom + gap, bottom: null, left, maxHeight: below }
      : { top: null, bottom: vh - r.top + gap, left, maxHeight: above });
  }

  /** Close on a click elsewhere, Escape, scrolling or resizing (the menu would no longer sit by its button). */
  @HostListener('document:click') @HostListener('window:resize') @HostListener('document:keydown.escape')
  protected closeMenu(): void { if (this.menu()) this.menu.set(null); }
  @HostListener('window:scroll', ['$event'])
  protected onScroll(e: Event): void {
    if (this.menu() && !(e.target instanceof HTMLElement && e.target.classList.contains('share-menu'))) this.menu.set(null);
  }

  protected async like(): Promise<void> {
    this.busy.set(true);
    try { await this.likesService.toggle(this.id()); } catch { /* the heart stays as it was */ } finally { this.busy.set(false); }
  }

  /** The phone's share sheet: the real video / photo with the caption and the link (just the link where files can't be shared). */
  protected async nativeShare(): Promise<void> {
    this.preparing.set(true);
    try {
      const media = this.video() ? { url: this.video()!, kind: 'video' as const } : this.image() ? { url: this.image()!, kind: 'photo' as const } : null;
      const r = await this.rich.share({ title: this.title(), text: this.text(), url: this.url(), media: [media] });
      this.ready.set(r === 'tap-again');
    } finally { this.preparing.set(false); }
  }

  protected async copy(): Promise<void> {
    try { await navigator.clipboard.writeText(this.url()); } catch { window.prompt(this.i18n.t('Copy this link'), this.url()); return; }
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1800);
  }
}
