import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth/auth.service';

/**
 * Likes (hearts) on approved selfies and photo frames: which ones I like (loaded once when I'm signed in) and the latest
 * counts after I tap. Liking needs sign-in; a signed-out tap goes to sign-in and comes back to the same page.
 */
@Injectable({ providedIn: 'root' })
export class LikesService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly api = `${environment.apiBaseUrl}/api/v1/selfies`;

  /** The selfies / frames I like. */
  readonly mine = signal<ReadonlySet<string>>(new Set());
  /** Counts changed by my taps (the page's own count is used until then). */
  readonly counts = signal<ReadonlyMap<string, number>>(new Map());
  private loadedFor: string | null = null;

  constructor() {
    // Load my likes when I sign in; forget them when I sign out
    effect(() => {
      const who = this.auth.profile() ? 'me' : null;
      if (who === this.loadedFor) return;
      this.loadedFor = who;
      this.mine.set(new Set());
      if (who) this.http.get<string[]>(`${this.api}/likes/mine`).subscribe({ next: ids => this.mine.set(new Set(ids)), error: () => {} });
    });
  }

  likes(id: string): boolean { return this.mine().has(id); }

  count(id: string, fallback: number): number { return this.counts().get(id) ?? fallback; }

  /** Likes / unlikes; sends a signed-out visitor to sign in first. */
  async toggle(id: string): Promise<void> {
    await this.auth.init();
    if (!this.auth.isSignedIn()) {
      await this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    const liked = !this.likes(id);
    const r = await firstValueFrom(this.http.put<{ likes: number; liked: boolean }>(`${this.api}/${id}/like`, { liked }));
    this.mine.update(s => { const n = new Set(s); if (r.liked) n.add(id); else n.delete(id); return n; });
    this.counts.update(m => new Map(m).set(id, r.likes));
  }
}
