import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { featureGuard } from './core/features.service';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home').then(m => m.Home) },
  { path: 'login', loadComponent: () => import('./pages/login/login').then(m => m.Login) },
  { path: 'account', canActivate: [authGuard], loadComponent: () => import('./pages/account/account').then(m => m.Account) },
  { path: 'privacy', loadComponent: () => import('./pages/privacy/privacy').then(m => m.Privacy) },
  { path: 'selfies', loadComponent: () => import('./pages/selfies/selfies').then(m => m.Selfies) },
  { path: 'selfies/:id/reel', canActivate: [featureGuard('reels')], loadComponent: () => import('./pages/selfies/reel-page').then(m => m.ReelPage) },
  { path: 'selfies/:id/frame', canActivate: [featureGuard('photo-frames')], loadComponent: () => import('./pages/selfies/frame-page').then(m => m.FramePage) },
  { path: 'selfies/:id', loadComponent: () => import('./pages/selfies/story').then(m => m.Story) },
  // Community
  { path: 'then-now', canActivate: [featureGuard('then-now')], loadComponent: () => import('./pages/community/then-now').then(m => m.ThenNow) },
  { path: 'memories', canActivate: [featureGuard('memories')], loadComponent: () => import('./pages/community/memories').then(m => m.Memories) },
  { path: 'reminders/off', loadComponent: () => import('./pages/reminders-off').then(m => m.RemindersOff) },
  { path: 'contest', canActivate: [featureGuard('contest')], loadComponent: () => import('./pages/community/contest').then(m => m.Contest) },
  { path: 'photo-frames', canActivate: [featureGuard('photo-frames')], loadComponent: () => import('./pages/community/photo-frames').then(m => m.PhotoFrames) },
  { path: 'support', canActivate: [featureGuard('support')], loadComponent: () => import('./pages/support/support').then(m => m.Support) },
  { path: 'parents-voices', canActivate: [featureGuard('parents-voices')], loadComponent: () => import('./pages/community/parents-voices').then(m => m.ParentsVoices) },
  { path: 'parents-voices/share', canActivate: [featureGuard('parents-voices'), authGuard], loadComponent: () => import('./pages/community/parent-story-share').then(m => m.ParentStoryShare) },
  { path: 'parents-voices/:id', canActivate: [featureGuard('parents-voices')], loadComponent: () => import('./pages/community/parent-story').then(m => m.ParentStoryPage) },
  { path: 'family-tree', canActivate: [featureGuard('family-tree')], loadComponent: () => import('./pages/community/family-tree').then(m => m.FamilyTree) },
  { path: 'p/:handle', canActivate: [featureGuard('profiles')], loadComponent: () => import('./pages/profile/profile-page').then(m => m.ProfilePage) },
  { path: 'albums/join/:code', canActivate: [featureGuard('albums')], loadComponent: () => import('./pages/albums/album-page').then(m => m.AlbumPage) },
  { path: 'albums/:id', canActivate: [featureGuard('albums')], loadComponent: () => import('./pages/albums/album-page').then(m => m.AlbumPage) },
  { path: 'upload', canActivate: [authGuard], loadComponent: () => import('./pages/upload/upload').then(m => m.Upload) },

  // Moved over in the next steps, as their API endpoints are built
  ...([
    ['winners', 'Winners'], ['impact', 'Impact'],
    ['terms', 'Terms & Conditions']
  ] as const).map(([path, title]) => ({
    path, data: { title }, loadComponent: () => import('./pages/coming-soon').then(m => m.ComingSoon)
  })),

  // Content pages built in the admin site (About us, Our founder, …): /<slug>. Unknown addresses show "not found".
  { path: 'not-available', loadComponent: () => import('./pages/not-available').then(m => m.NotAvailable) },
  { path: ':slug', loadComponent: () => import('./pages/content/content-page').then(m => m.ContentPage) },

  { path: '**', loadComponent: () => import('./pages/not-found').then(m => m.NotFound) }
];
