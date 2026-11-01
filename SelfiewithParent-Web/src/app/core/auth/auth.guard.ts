import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Pages that need a signed-in visitor. Sends everyone else to sign-in and brings them back afterwards. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  return auth.isSignedIn() ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
