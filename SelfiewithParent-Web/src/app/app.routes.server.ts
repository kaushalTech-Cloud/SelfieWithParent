import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Public pages: built ahead of time (fast, and share previews / search engines see full HTML)
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'privacy', renderMode: RenderMode.Prerender },

  // Personal pages: rendered only in the browser — never on the server, never cached
  { path: 'login', renderMode: RenderMode.Client },
  { path: 'account', renderMode: RenderMode.Client },
  { path: 'upload', renderMode: RenderMode.Client },
  { path: 'parents-voices/share', renderMode: RenderMode.Client },
  { path: 'reminders/off', renderMode: RenderMode.Client },
  { path: 'selfies/:id/reel', renderMode: RenderMode.Client },

  // Everything else (coming-soon pages, not found) is rendered on request
  { path: '**', renderMode: RenderMode.Server }
];
