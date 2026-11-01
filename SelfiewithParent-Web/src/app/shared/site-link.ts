import { Directive, HostBinding, HostListener, inject, input } from '@angular/core';
import { Router } from '@angular/router';

/**
 * A link whose address comes from content (menus, pages): site paths open inside the app (no page reload),
 * https / mailto / tel stay normal links. Ctrl/Cmd/Shift-click and middle-click keep the browser's own behaviour.
 */
@Directive({ selector: 'a[siteLink]' })
export class SiteLink {
  private readonly router = inject(Router);
  readonly siteLink = input<string | null | undefined>('');

  private get url(): string { return (this.siteLink() ?? '').trim(); }
  private get internal(): boolean { return this.url.startsWith('/') && !this.url.startsWith('//'); }

  @HostBinding('attr.href') get href(): string | null { return this.url || null; }
  @HostBinding('attr.target') get target(): string | null { return /^https:/.test(this.url) ? '_blank' : null; }
  @HostBinding('attr.rel') get rel(): string | null { return /^https:/.test(this.url) ? 'noopener noreferrer' : null; }

  @HostListener('click', ['$event'])
  onClick(e: MouseEvent): boolean {
    if (!this.internal || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return true;
    void this.router.navigateByUrl(this.url);
    return false;
  }
}
