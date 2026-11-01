import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { MenuService } from '../core/menu.service';

/** Admin pages whose data (uploads) isn't built yet. The title comes from the route. */
@Component({
  selector: 'app-coming-soon',
  imports: [RouterLink],
  template: `
    <section class="panel">
      <h2>{{ title() }}</h2>
      <div class="empty-state">
        <i class="bi bi-cone-striped"></i>
        <p>{{ title() }} will work once selfie uploads are built. Nothing here is sample data.</p>
        <a class="btn btn-light btn-sm" routerLink="/"><i class="bi bi-arrow-left"></i> Back to dashboard</a>
      </div>
    </section>
  `
})
export class ComingSoon {
  protected readonly title = toSignal(inject(ActivatedRoute).data.pipe(map(d => d['title'] as string)), { initialValue: '' });
}

/** Signed in, but the account has no staff role. */
@Component({
  selector: 'app-no-access',
  template: `
    <div class="login-page">
      <section class="login-art">
        <img src="img/logo-light.svg" alt="Selfie with Parent" height="48">
        <div><h2>Team access only.</h2></div>
        <small class="opacity-75">Selfie with Parent Admin</small>
      </section>
      <section class="login-form-wrap">
        <div class="login-card">
          <h1>No access</h1>
          <p class="text-muted">You're signed in as <strong>{{ who() }}</strong>, but this account doesn't have a staff role, so it can't open the admin site.</p>
          <p class="text-muted small">If you should have access, ask a super admin to give your account a staff role, then sign in again.</p>
          <button class="btn btn-accent w-100" type="button" (click)="signOut()"><i class="bi bi-box-arrow-left"></i> Sign out</button>
        </div>
      </section>
    </div>
  `
})
export class NoAccess {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly menu = inject(MenuService);
  protected readonly who = computed(() => this.auth.profile()?.email ?? this.auth.profile()?.mobileMasked ?? 'this account');

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    this.menu.clear();
    await this.router.navigateByUrl('/login');
  }
}

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <section class="panel">
      <h2>Page not found</h2>
      <div class="empty-state">
        <i class="bi bi-signpost-split"></i>
        <p>There's no admin page at this address.</p>
        <a class="btn btn-light btn-sm" routerLink="/"><i class="bi bi-arrow-left"></i> Back to dashboard</a>
      </div>
    </section>
  `
})
export class NotFound {}
