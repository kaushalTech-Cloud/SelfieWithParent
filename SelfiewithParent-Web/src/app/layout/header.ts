import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { ContactService } from '../core/contact.service';
import { ProfilePhotoService } from '../core/auth/profile-photo.service';
import { I18nService, LangCode } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/t.pipe';
import { MenuItem, MenuService, MenuTarget } from '../core/menu/menu.service';

/** Top contact bar + main menu. The menu itself comes from the database (menu code "main"). */
@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, NgTemplateOutlet, TranslatePipe],
  template: `
    <a class="skip-link" href="#main">{{ 'Skip to content' | t }}</a>
    <div class="topbar">
      <div class="container d-flex justify-content-end gap-4">
        <label class="lang-switch me-auto">
          <i class="bi bi-translate" aria-hidden="true"></i>
          <select (change)="setLang($event)" aria-label="Language">
            @for (l of i18n.languages; track l.code) {
              <option [value]="l.code" [selected]="l.code === i18n.lang()">{{ l.name }}</option>
            }
          </select>
        </label>
        @if (contact.details().email; as email) { <a [href]="'mailto:' + email"><i class="bi bi-envelope"></i> {{ email }}</a> }
        @if (contact.details().phone; as phone) { <a [href]="tel(phone)" class="d-none d-sm-inline"><i class="bi bi-telephone"></i> {{ phone }}</a> }
      </div>
    </div>

    <nav class="navbar navbar-expand-xl sticky-top main-nav">
      <div class="container">
        <a class="navbar-brand" routerLink="/"><img src="img/logo.svg" alt="Selfie with Parent" height="52"></a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainMenu"
                aria-controls="mainMenu" aria-expanded="false" [attr.aria-label]="'Toggle menu' | t">
          <i class="bi bi-list"></i>
        </button>
        <div class="collapse navbar-collapse" id="mainMenu">
          <ul class="navbar-nav ms-auto align-items-lg-center">
            @for (item of items(); track item.key) {
              @switch (item.type) {
                @case ('Link') {
                  <li class="nav-item">
                    <ng-container [ngTemplateOutlet]="link" [ngTemplateOutletContext]="{ $implicit: item, cls: 'nav-link' }" />
                  </li>
                }
                @case ('Button') {
                  <li class="nav-item ms-lg-2">
                    <ng-container [ngTemplateOutlet]="link" [ngTemplateOutletContext]="{ $implicit: item, cls: 'btn btn-accent btn-sm nav-cta' }" />
                  </li>
                }
                @case ('Action') {
                  <li class="nav-item"><button class="nav-link btn btn-link" type="button" (click)="runAction(item)">{{ item.label }}</button></li>
                }
                @case ('Dropdown') {
                  <li class="nav-item dropdown" [class.user-menu]="item.key === 'account'" [class.ms-lg-2]="item.key === 'account'">
                    <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                      @if (item.key === 'account') {
                        <span class="avatar-sm" aria-hidden="true">@if (photo.url(); as src) { <img [src]="src" alt=""> } @else { {{ initials() }} }</span><span class="user-name">{{ firstName() || item.label }}</span>
                      } @else {
                        {{ item.label }}
                      }
                    </a>
                    <ul class="dropdown-menu" [class.dropdown-menu-end]="item.key === 'account'">
                      @for (child of visible(item.children); track child.key) {
                        @switch (child.type) {
                          @case ('Divider') { <li><hr class="dropdown-divider"></li> }
                          @case ('Action') {
                            <li><button class="dropdown-item" type="button" (click)="runAction(child)">
                              @if (child.icon) { <i class="bi me-2" [class]="child.icon"></i> }{{ child.label }}
                            </button></li>
                          }
                          @default {
                            <li><ng-container [ngTemplateOutlet]="link" [ngTemplateOutletContext]="{ $implicit: child, cls: 'dropdown-item' }" /></li>
                          }
                        }
                      }
                    </ul>
                  </li>
                }
              }
            }
          </ul>
        </div>
      </div>
    </nav>

    <!-- A menu link: site paths use the router, other addresses are plain links -->
    <ng-template #link let-item let-cls="cls">
      @let t = target(item.url);
      @if (t.internal) {
        <a [class]="cls" [routerLink]="t.path" [queryParams]="t.queryParams" [fragment]="t.fragment"
           [routerLinkActive]="t.fragment || hasQuery(t) ? '' : 'active'" [routerLinkActiveOptions]="{ exact: t.path === '/' }">
          @if (item.icon) { <i class="bi" [class]="item.icon"></i> }{{ item.label }}
        </a>
      } @else {
        <a [class]="cls" [href]="t.href" [attr.target]="item.opensNewTab ? '_blank' : null" [attr.rel]="item.opensNewTab ? 'noopener noreferrer' : null">
          @if (item.icon) { <i class="bi" [class]="item.icon"></i> }{{ item.label }}
        </a>
      }
    </ng-template>
  `
})
export class Header {
  /** Email and phone in the top bar, set by staff in the admin site. */
  protected readonly contact = inject(ContactService);
  protected tel(phone: string): string { return ContactService.telHref(phone); }

  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);
  protected readonly photo = inject(ProfilePhotoService);
  private readonly router = inject(Router);
  private readonly menu = inject(MenuService).items('main');

  /** Top-level items for the current sign-in state. */
  protected readonly items = computed(() => this.visible(this.menu()));

  /** First name once the profile has one; until then the menu's own label ("My account") is shown. */
  protected readonly firstName = computed(() => (this.auth.profile()?.fullName ?? '').trim().split(/\s+/)[0] ?? '');
  protected readonly initials = computed(() => {
    const parts = (this.auth.profile()?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
    return parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() : '•';
  });

  protected visible(items: MenuItem[]): MenuItem[] {
    const signedIn = this.auth.isSignedIn();
    return items.filter(i => i.visibility === 'Always' || (i.visibility === 'SignedIn') === signedIn);
  }

  protected target(url: string): MenuTarget { return MenuService.target(url); }
  protected hasQuery(t: MenuTarget): boolean { return Object.keys(t.queryParams).length > 0; }

  protected setLang(e: Event): void {
    this.i18n.setLanguage((e.target as HTMLSelectElement).value as LangCode, true);
  }

  protected async runAction(item: MenuItem): Promise<void> {
    if (item.actionCode === 'signout') {
      await this.auth.signOut();
      await this.router.navigateByUrl('/');
    }
  }
}
