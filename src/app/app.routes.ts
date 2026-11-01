import { Routes } from '@angular/router';
import { contentEditorGuard, reviewerGuard, signedOutGuard, staffGuard, superAdminGuard } from './core/guards';
import { AdminLayout } from './layout/admin-layout';

export const routes: Routes = [
  { path: 'login', title: 'Sign in | Selfie with Parent Admin', canActivate: [signedOutGuard], loadComponent: () => import('./pages/login/login').then(m => m.Login) },
  { path: 'no-access', title: 'No access | Selfie with Parent Admin', loadComponent: () => import('./pages/simple-pages').then(m => m.NoAccess) },

  // Every admin page: staff roles only (SuperAdmin, Admin, Moderator, Support, PrivacyOfficer)
  {
    path: '',
    component: AdminLayout,
    canActivate: [staffGuard],
    canActivateChild: [staffGuard],
    children: [
      { path: '', title: 'Dashboard | Selfie with Parent Admin', loadComponent: () => import('./pages/dashboard').then(m => m.Dashboard) },
      { path: 'queue', title: 'Review queue | Selfie with Parent Admin', canActivate: [reviewerGuard], loadComponent: () => import('./pages/review/review-queue').then(m => m.ReviewQueue) },
      { path: 'parent-stories', title: 'Parents’ stories | Selfie with Parent Admin', canActivate: [reviewerGuard], loadComponent: () => import('./pages/parent-stories').then(m => m.ParentStories) },
      { path: 'uploads', title: 'Uploads by visitor | Selfie with Parent Admin', canActivate: [reviewerGuard], loadComponent: () => import('./pages/review/uploads').then(m => m.Uploads) },
      { path: 'profile', title: 'My profile | Selfie with Parent Admin', loadComponent: () => import('./pages/profile').then(m => m.Profile) },
      { path: 'activity', title: 'Activity | Selfie with Parent Admin', canActivate: [reviewerGuard], loadComponent: () => import('./pages/review/activity').then(m => m.Activity) },
      { path: 'winners', title: 'Winners | Selfie with Parent Admin', canActivate: [contentEditorGuard], loadComponent: () => import('./pages/contests').then(m => m.Contests) },
      { path: 'visitors', title: 'Visitors | Selfie with Parent Admin', canActivate: [superAdminGuard], loadComponent: () => import('./pages/visitors/visitors').then(m => m.Visitors) },
      { path: 'staff', title: 'Staff | Selfie with Parent Admin', canActivate: [superAdminGuard], loadComponent: () => import('./pages/staff/staff').then(m => m.Staff) },
      { path: 'pages', title: 'Pages | Selfie with Parent Admin', canActivate: [contentEditorGuard], loadComponent: () => import('./pages/content/pages-list').then(m => m.PagesList) },
      {
        path: 'pages/:id', title: 'Page builder | Selfie with Parent Admin', canActivate: [contentEditorGuard],
        canDeactivate: [(c: { canLeave?: () => boolean }) => c.canLeave?.() ?? true],
        loadComponent: () => import('./pages/content/page-editor').then(m => m.PageEditor)
      },
      { path: 'home-page', title: 'Home page | Selfie with Parent Admin', canActivate: [contentEditorGuard], loadComponent: () => import('./pages/home-page').then(m => m.HomePage) },
      { path: 'features', title: 'Site features | Selfie with Parent Admin', canActivate: [contentEditorGuard], loadComponent: () => import('./pages/site-features').then(m => m.SiteFeatures) },
      { path: 'support-page', title: 'Support page | Selfie with Parent Admin', canActivate: [contentEditorGuard], loadComponent: () => import('./pages/support-page').then(m => m.SupportPage) },
      { path: 'donations', title: 'Donations | Selfie with Parent Admin', canActivate: [contentEditorGuard], loadComponent: () => import('./pages/donations').then(m => m.Donations) },
      { path: 'messages', title: 'Messages | Selfie with Parent Admin', canActivate: [contentEditorGuard], loadComponent: () => import('./pages/messages').then(m => m.Messages) },
      { path: 'menus', title: 'Menus | Selfie with Parent Admin', canActivate: [contentEditorGuard], loadComponent: () => import('./pages/content/menus').then(m => m.Menus) },
      { path: '**', title: 'Not found | Selfie with Parent Admin', loadComponent: () => import('./pages/simple-pages').then(m => m.NotFound) }
    ]
  }
];
