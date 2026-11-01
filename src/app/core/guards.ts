import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Admin pages: signed in AND holding a staff role (SuperAdmin, Admin, Moderator, Support or PrivacyOfficer).
 * Signed out → sign-in page; signed in without a staff role → "no access" page.
 * The API enforces the same rule on every staff request; this only decides what the screens show.
 */
export const staffGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  if (!auth.isSignedIn()) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  return auth.isStaff() ? true : router.createUrlTree(['/no-access']);
};

/** Super admin pages (Staff). Other staff go back to the dashboard. The API checks this again. */
export const superAdminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);   // inject() only works before the first await
  await auth.init();
  return auth.staffRoles().includes('SuperAdmin') ? true : router.createUrlTree(['/']);
};

/** Content pages and public menus: super admins and admins only. Others go back to the dashboard. The API checks this again. */
export const contentEditorGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  return auth.staffRoles().some(r => r === 'SuperAdmin' || r === 'Admin') ? true : router.createUrlTree(['/']);
};

/** The review queue: super admins, admins and moderators. Others go back to the dashboard. The API checks this again. */
export const reviewerGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  return auth.staffRoles().some(r => r === 'SuperAdmin' || r === 'Admin' || r === 'Moderator') ? true : router.createUrlTree(['/']);
};

/** The sign-in page: staff who are already signed in go straight to the dashboard. */
export const signedOutGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  return auth.isStaff() ? router.createUrlTree(['/']) : true;
};
