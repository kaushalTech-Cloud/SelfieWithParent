import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { retry, throwError, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { I18nService } from '../i18n/i18n.service';

/** One menu entry as stored in the database (site.MenuItem) and served by GET /api/v1/menus/{code}. */
export interface MenuItem {
  key: string;
  type: 'Link' | 'Dropdown' | 'Button' | 'Divider' | 'Action';
  label: string;
  url: string | null;
  actionCode: string | null;
  icon: string | null;
  visibility: 'Always' | 'SignedIn' | 'SignedOut';
  opensNewTab: boolean;
  children: MenuItem[];
}

interface MenuResponse { menuCode: string; language: string; items: MenuItem[]; }

/** A site path split for routerLink, or an external address for href. */
export interface MenuTarget { internal: boolean; path: string; queryParams: Record<string, string>; fragment?: string; href: string; }

/**
 * Menus come from the database through the API. They reload when the language changes,
 * so labels are always in the visitor's language (English where a translation is missing).
 */
@Injectable({ providedIn: 'root' })
export class MenuService {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly menus = new Map<string, ReturnType<typeof signal<MenuItem[]>>>();
  private readonly requested = new Map<string, string>();   // menu code → language last asked for

  constructor() {
    effect(() => {
      const lang = this.i18n.lang();
      for (const code of this.menus.keys()) this.fetch(code, lang);
    });
  }

  /** The items of a menu (empty until loaded, or if the API can't be reached). */
  items(code: string) {
    let menu = this.menus.get(code);
    if (!menu) {
      menu = signal<MenuItem[]>([]);
      this.menus.set(code, menu);
      this.fetch(code, this.i18n.lang());
    }
    return menu.asReadonly();
  }

  private fetch(code: string, lang: string): void {
    if (this.requested.get(code) === lang) return;   // already loaded / loading in this language
    this.requested.set(code, lang);
    // Show the last copy this browser loaded straight away, so the menu is never blank; the API refreshes it below
    const saved = this.readSaved(code, lang);
    if (saved) this.menus.get(code)?.set(saved);
    this.http.get<MenuResponse>(`${environment.apiBaseUrl}/api/v1/menus/${encodeURIComponent(code)}`, { params: { lang } })
      .pipe(
        // API not reachable yet (starting up, restarting)? Keep trying in the browser: 2s, 4s, 8s … up to every 30s.
        // The server render doesn't wait; the browser fills the menu in once the API answers.
        retry({
          count: this.inBrowser ? 20 : 0,
          delay: (err, attempt) => this.requested.get(code) === lang
            ? timer(Math.min(2000 * 2 ** (attempt - 1), 30000))
            : throwError(() => err)   // language changed meanwhile: stop, the new request takes over
        })
      )
      .subscribe({
        next: res => {
          if (this.requested.get(code) !== lang) return;
          this.menus.get(code)?.set(res.items);
          this.save(code, lang, res.items);
        },
        error: () => { if (this.requested.get(code) === lang) this.requested.delete(code); }   // keep whatever is shown; try again on the next language change
      });
  }

  /** The menu last loaded in this browser for this language (menus are public, so keeping a copy is fine). */
  private readSaved(code: string, lang: string): MenuItem[] | null {
    if (!this.inBrowser) return null;
    try {
      const items = JSON.parse(localStorage.getItem(`swp-menu:${code}:${lang}`) ?? 'null');
      return Array.isArray(items) && items.length ? items as MenuItem[] : null;
    } catch { return null; }   // storage blocked or the copy is damaged: wait for the API
  }

  private save(code: string, lang: string, items: MenuItem[]): void {
    if (!this.inBrowser) return;
    try { localStorage.setItem(`swp-menu:${code}:${lang}`, JSON.stringify(items)); } catch { /* storage blocked or full */ }
  }

  /** Turns a stored URL into something the router (site paths) or a plain link (https / mailto / tel) can use. */
  static target(url: string): MenuTarget {
    if (!url.startsWith('/') || url.startsWith('//')) {
      return { internal: false, path: '', queryParams: {}, href: url };
    }
    const parsed = new URL(url, 'https://site.invalid');
    const queryParams: Record<string, string> = {};
    parsed.searchParams.forEach((v, k) => (queryParams[k] = v));
    return {
      internal: true,
      path: parsed.pathname,
      queryParams,
      fragment: parsed.hash ? parsed.hash.slice(1) : undefined,
      href: url
    };
  }
}
