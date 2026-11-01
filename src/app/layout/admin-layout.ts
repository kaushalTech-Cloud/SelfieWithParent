import { NgTemplateOutlet } from '@angular/common';
import { Component, HostListener, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { MenuItem } from '../core/api.models';
import { AuthService } from '../core/auth.service';
import { ProfilePhotoService } from '../core/profile-photo.service';
import { MenuService, MenuTarget } from '../core/menu.service';
import { MessageAlertsService } from '../core/message-alerts.service';

/** Sidebar (from the database, menu code "admin"; dropdowns are accordion groups, one open at a time) + top bar + the current admin page. */
@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <div class="admin-shell">
      @if (navOpen()) { <div class="side-backdrop" (click)="navOpen.set(false)"></div> }
      <aside class="admin-side" id="admin-side" aria-label="Admin menu" [class.open]="navOpen()">
        <a class="brand" routerLink="/"><img src="img/logo-light.svg" alt="Selfie with Parent" height="34"><small>Admin</small></a>
        <button type="button" class="side-close" aria-label="Close menu" (click)="navOpen.set(false)"><i class="bi bi-x-lg"></i></button>
        <p class="side-label" aria-hidden="true">Menu</p>
        <nav class="side-main" aria-label="Admin pages">
          @for (item of mainItems(); track item.key) {
            @if (item.type === 'Dropdown') {
              <div class="side-group" [class.open]="openGroup() === item.key">
                <button type="button" class="link side-group-head" [class.has-active]="activeGroup() === item.key" (click)="toggle(item.key)"
                        [attr.aria-expanded]="openGroup() === item.key" [attr.aria-controls]="'side-grp-' + item.key">
                  @if (item.icon) { <i class="bi" [class]="item.icon"></i> } {{ item.label }} <i class="bi bi-chevron-down side-caret" aria-hidden="true"></i>
                </button>
                <div class="side-group-body" [id]="'side-grp-' + item.key" [attr.inert]="openGroup() === item.key ? null : ''">
                  <div class="side-group-inner">
                    @for (child of children(item); track child.key) {
                      <ng-container [ngTemplateOutlet]="entry" [ngTemplateOutletContext]="{ $implicit: child }" />
                    }
                  </div>
                </div>
              </div>
            } @else {
              <ng-container [ngTemplateOutlet]="entry" [ngTemplateOutletContext]="{ $implicit: item }" />
            }
          }
          @if (menu.failed()) {
            <p class="side-note"><i class="bi bi-exclamation-triangle"></i> Menu couldn't load. <button type="button" class="btn btn-link btn-sm p-0 align-baseline" (click)="menu.load()">Try again</button></p>
          }
        </nav>
        <div class="side-bottom">
          @for (item of bottomItems(); track item.key) {
            <ng-container [ngTemplateOutlet]="entry" [ngTemplateOutletContext]="{ $implicit: item }" />
          }
        </div>
      </aside>

      <main class="admin-main" id="main" tabindex="-1">
        <div class="admin-top">
          <div class="d-flex align-items-center gap-3">
            <button type="button" class="side-toggle" aria-label="Open menu" aria-controls="admin-side" [attr.aria-expanded]="navOpen()" (click)="navOpen.set(true)"><i class="bi bi-list"></i></button>
            <div>
              <h1>{{ greeting() }}, {{ firstName() }}</h1>
              <span class="text-muted small">{{ roleText() }}</span>
            </div>
          </div>
          <div class="d-flex align-items-center gap-2">
          @if (alerts.canSee()) {
            <a class="bell" routerLink="/messages" [attr.aria-label]="alerts.unread() ? alerts.unread() + ' new messages' : 'Messages'" title="Messages">
              <i class="bi" [class.bi-bell-fill]="alerts.unread()" [class.bi-bell]="!alerts.unread()"></i>
              @if (alerts.unread()) { <span class="bell-count">{{ alerts.unread() > 99 ? '99+' : alerts.unread() }}</span> }
            </a>
          }
          <a class="user-chip" routerLink="/profile" [title]="'My profile — ' + (auth.profile()?.email ?? auth.profile()?.mobileMasked ?? '')">
            <span class="avatar" aria-hidden="true">@if (photo.url(); as src) { <img [src]="src" alt=""> } @else { {{ initials() }} }</span> {{ auth.profile()?.fullName || 'Staff' }}
          </a>
          </div>
        </div>
        @if (alerts.toast(); as t) {
          <a class="msg-toast" routerLink="/messages" role="status"><i class="bi bi-envelope-paper-heart"></i> {{ t }} — open messages</a>
        }
        <router-outlet />
      </main>
    </div>

    <!-- One sidebar entry: site paths use the router, other addresses are plain links, actions run here -->
    <ng-template #entry let-item>
      @if (item.type === 'Action') {
        <a class="link" href="#" role="button" (click)="$event.preventDefault(); run(item)">
          @if (item.icon) { <i class="bi" [class]="item.icon"></i> } {{ item.label }}
        </a>
      } @else if (item.url) {
        @let t = target(item.url);
        @if (t.internal) {
          <a class="link" [routerLink]="t.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: t.path === '/' }">
            @if (item.icon) { <i class="bi" [class]="item.icon"></i> } {{ item.label }}
          </a>
        } @else {
          <a class="link" [href]="t.href" [attr.target]="item.opensNewTab ? '_blank' : null" [attr.rel]="item.opensNewTab ? 'noopener noreferrer' : null">
            @if (item.icon) { <i class="bi" [class]="item.icon"></i> } {{ item.label }}
          </a>
        }
      }
    </ng-template>
  `,
  styles: `
    .bell { position: relative; display: inline-grid; place-items: center; width: 2.4rem; height: 2.4rem; border-radius: 50%; background: #fff;
      color: inherit; text-decoration: none; box-shadow: 0 2px 8px rgba(0,0,0,.08); font-size: 1.15rem; }
    .bell .bi-bell-fill { color: var(--accent, #f06543); }
    .bell-count { position: absolute; top: -.2rem; right: -.25rem; min-width: 1.15rem; height: 1.15rem; padding: 0 .25rem; border-radius: 999px;
      background: #dc3545; color: #fff; font-size: .68rem; font-weight: 700; display: grid; place-items: center; }
    .msg-toast { position: fixed; right: 1.25rem; bottom: 1.25rem; z-index: 1080; background: #0f5b5c; color: #fff; padding: .75rem 1rem;
      border-radius: .75rem; box-shadow: 0 8px 24px rgba(0,0,0,.2); text-decoration: none; }
  `
})
export class AdminLayout implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly photo = inject(ProfilePhotoService);
  protected readonly menu = inject(MenuService);
  /** The notification for new contact-form messages (super admins and admins). */
  protected readonly alerts = inject(MessageAlertsService);
  private readonly router = inject(Router);

  /** Admin pages at the top; outside links and actions (view public site, sign out) at the bottom, as in the design. */
  private readonly visible = computed(() => this.menu.items().filter(i => i.visibility !== 'SignedOut' && i.type !== 'Divider'));
  /** Admin pages and groups of admin pages. */
  protected readonly mainItems = computed(() => this.visible().filter(i => i.type === 'Dropdown' ? this.children(i).length > 0 : this.isPage(i)));
  /** The open group (one at a time); it follows the current page, and a click opens or closes it. */
  protected readonly openGroup = signal<string | null>(null);
  /** Phones and tablets: the sidebar slides in as a drawer. */
  protected readonly navOpen = signal(false);
  private readonly url = signal('/');
  /** The group holding the current page. */
  protected readonly activeGroup = computed(() => {
    const url = this.url().split(/[?#]/)[0];
    return this.mainItems().find(g => g.type === 'Dropdown' && this.children(g).some(c => c.url === '/' ? url === '/' : url === c.url || url.startsWith(c.url + '/')))?.key ?? null;
  });
  protected readonly bottomItems = computed(() => this.visible().filter(i => !this.mainItems().includes(i)));

  protected readonly firstName = computed(() => (this.auth.profile()?.fullName ?? '').trim().split(/\s+/)[0] || 'Team');
  protected readonly initials = computed(() => {
    const parts = (this.auth.profile()?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
    return parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() : 'ST';
  });
  protected readonly roleText = computed(() => this.auth.staffRoles().map(r => r.replace(/([a-z])([A-Z])/g, '$1 $2')).join(' · '));

  constructor() {
    this.url.set(this.router.url);
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(e => { this.url.set((e as NavigationEnd).urlAfterRedirects); this.navOpen.set(false); });
    effect(() => { const g = this.activeGroup(); if (g) untracked(() => this.openGroup.set(g)); });
  }

  ngOnInit(): void { void this.menu.load(); }

  @HostListener('document:keydown.escape') protected closeNav(): void { this.navOpen.set(false); }

  protected toggle(key: string): void { this.openGroup.update(k => k === key ? null : key); }

  /** A group's admin pages (visible, inside this site). */
  protected children(group: MenuItem): MenuItem[] {
    return group.children.filter(c => c.visibility !== 'SignedOut' && this.isPage(c));
  }

  private isPage(i: MenuItem): boolean { return i.type !== 'Action' && i.type !== 'Dropdown' && !!i.url && MenuService.target(i.url).internal; }

  protected greeting(): string {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  protected target(url: string): MenuTarget { return MenuService.target(url); }

  protected async run(item: MenuItem): Promise<void> {
    if (item.actionCode === 'signout') {
      await this.auth.signOut();
      this.menu.clear();
      await this.router.navigateByUrl('/login');
    }
  }
}
