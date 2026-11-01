import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { problemMessage } from '../core/problem';

interface State { features: Record<string, boolean>; show: Record<string, boolean>; }

const FEATURES: { key: string; name: string; icon: string; what: string; path: string }[] = [
  { key: 'support', name: 'Support & Donate', icon: 'bi-heart', path: '/support',
    what: 'The Support page, the ❤ Donate button on every banner and online donations. Off: all hidden, donations refused.' },
  { key: 'parents-voices', name: "Parents' Voices", icon: 'bi-chat-heart', path: '/parents-voices',
    what: "Parents' stories (reading and sharing). Off: the pages say “not available right now”; new stories are refused." },
  { key: 'contest', name: 'Photo of the Week', icon: 'bi-trophy', path: '/contest', what: 'The contest page and the home page spotlight.' },
  { key: 'photo-frames', name: 'Photo frames', icon: 'bi-image', path: '/photo-frames', what: 'Making frames (the button on every story) and the Photo Frames gallery.' },
  { key: 'reels', name: 'Reels', icon: 'bi-camera-reels', path: '', what: 'The “Make a reel” button on every story and the reel page.' },
  { key: 'family-tree', name: 'Family tree', icon: 'bi-diagram-3', path: '/family-tree', what: 'The family tree builder.' },
  { key: 'then-now', name: 'Then & Now', icon: 'bi-clock-history', path: '/then-now', what: 'The Then & Now page.' },
  { key: 'memories', name: 'Memory Wall', icon: 'bi-flower1', path: '/memories', what: 'The Memory Wall page.' },
  { key: 'streaks', name: 'Gratitude streaks', icon: 'bi-fire', path: '',
    what: 'Weekly “I called / visited my parents” check-ins in My account, badges, and the Sunday reminder email. Off: hidden, no emails.' },
  { key: 'profiles', name: 'Visitor profile pages', icon: 'bi-person-badge', path: '/p',
    what: 'Public pages at /p/name showing a visitor’s selfies, frames, reels, wins and badges (only when they switch theirs on).' },
  { key: 'albums', name: 'Family albums', icon: 'bi-people-fill', path: '/albums',
    what: '“Invite your brothers, sisters and cousins”: siblings add their own selfie with the same parent to one album page. Off: invite links and album pages say “not available”.' }
];
const LINES = [
  { key: 'contact-email', name: 'Email address' }, { key: 'contact-phone', name: 'Phone number' }, { key: 'contact-address', name: 'Postal address' }
];

/**
 * Site features: switch whole parts of the website on or off. A switched-off feature disappears from the menus, its buttons
 * and banners, and its pages show “not available right now” (nothing is deleted — switch it on again any time).
 * Also: which contact lines the top bar, footer and contact section show. Super admins and admins.
 */
@Component({
  selector: 'app-site-features',
  template: `
    <section class="panel">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <h2 class="mb-0">Site features</h2>
        <a class="btn btn-light btn-sm" [href]="site" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i> View website</a>
      </div>
      <p class="small text-muted">Switch a part of the website off and it disappears for visitors straight away — from the menus, buttons and banners — and its
        pages show “not available right now”. Nothing is deleted: switch it on again any time.
        Single menu items: <b>Menus</b>. Single sections of the home / Support page: <b>Home page</b> / <b>Support page</b> › Sections on the page.</p>
      @if (error()) { <div class="alert alert-danger small" role="alert">{{ error() }}</div> }
      @if (notice()) { <div class="alert alert-success small" role="status">{{ notice() }}</div> }

      @if (state(); as s) {
        <div class="sf-grid">
          @for (f of features; track f.key) {
            <div class="sf-card" [class.off]="!s.features[f.key]">
              <span class="sf-icon"><i class="bi" [class]="f.icon"></i></span>
              <div class="sf-body">
                <div class="d-flex align-items-center gap-2">
                  <strong>{{ f.name }}</strong>
                  <span class="badge ms-auto" [class.text-bg-success]="s.features[f.key]" [class.text-bg-secondary]="!s.features[f.key]">{{ s.features[f.key] ? 'On' : 'Off' }}</span>
                </div>
                <small class="text-muted d-block">{{ f.what }}</small>
                <div class="form-check form-switch mt-2 mb-0">
                  <input class="form-check-input" type="checkbox" [id]="'f-' + f.key" [checked]="s.features[f.key]" [disabled]="busy()"
                         (change)="set('feature', f.key, $any($event.target).checked, f.name)">
                  <label class="form-check-label small" [for]="'f-' + f.key">Show to visitors</label>
                  @if (f.path) { <a class="small ms-2" [href]="site + f.path" target="_blank" rel="noopener">open</a> }
                </div>
              </div>
            </div>
          }
        </div>

        <h3 class="h6 mt-4">Contact details shown on the website</h3>
        <p class="small text-muted">The details themselves are edited in <b>Messages</b> › Contact details.</p>
        <div class="d-flex flex-wrap gap-4">
          @for (l of lines; track l.key) {
            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" [id]="'l-' + l.key" [checked]="s.show[l.key]" [disabled]="busy()"
                     (change)="set('show', l.key, $any($event.target).checked, l.name)">
              <label class="form-check-label small" [for]="'l-' + l.key">{{ l.name }}</label>
            </div>
          }
        </div>
      } @else if (!error()) {
        <p class="small text-muted"><span class="spinner-border spinner-border-sm"></span> Loading…</p>
      }
    </section>`,
  styles: `
    .sf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: .8rem; }
    .sf-card { display: flex; gap: .8rem; padding: .9rem 1rem; border-radius: .8rem; border: 1px solid rgba(0,0,0,.1); background: #fff; }
    .sf-card.off { background: #f6f6f6; }
    .sf-card.off .sf-icon { filter: grayscale(1); opacity: .6; }
    .sf-icon { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; flex-shrink: 0; font-size: 1.2rem; color: #fff;
      background: linear-gradient(135deg, #f06543, #d64563); }
    .sf-body { flex: 1; min-width: 0; }
  `
})
export class SiteFeatures implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiBaseUrl}/api/v1/admin/features`;
  protected readonly site = environment.publicSiteUrl;
  protected readonly features = FEATURES;
  protected readonly lines = LINES;
  protected readonly state = signal<State | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');

  ngOnInit(): void { void this.load(); }

  private async load(): Promise<void> {
    try { this.state.set(await firstValueFrom(this.http.get<State>(this.api))); }
    catch (e) { this.error.set(problemMessage(e)); }
  }

  protected async set(group: 'feature' | 'show', key: string, on: boolean, name: string): Promise<void> {
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      await firstValueFrom(this.http.put(this.api, { group, key, on }));
      this.notice.set(`${name} is ${on ? 'on — visitors see it now' : 'off — hidden from visitors now'}.`);
    } catch (e) { this.error.set(problemMessage(e)); }
    finally { this.busy.set(false); await this.load(); }
  }
}
