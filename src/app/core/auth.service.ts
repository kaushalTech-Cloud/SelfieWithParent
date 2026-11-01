import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Profile, STAFF_ROLES, TokenResponse } from './api.models';

const REFRESH_KEY = 'swp-admin-rt';   // separate from the public site's session

/**
 * Staff sign-in state. Same accounts and API as the public site; only staff roles may use the admin pages
 * (the API checks the role again on every staff request — this is just what the screens show).
 * - The access token (15 min) is kept only in memory — never written to storage.
 * - The refresh token is kept in localStorage; the API rotates it on every use and revokes the whole session
 *   if an old one is ever reused.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl + '/api/v1';

  private accessToken: string | null = null;
  private accessExpiresAt = 0;
  private refreshing: Promise<boolean> | null = null;
  private initPromise: Promise<void> | null = null;

  readonly profile = signal<Profile | null>(null);
  readonly isSignedIn = computed(() => this.profile() !== null);
  /** The signed-in person's staff roles (empty for visitors). */
  readonly staffRoles = computed(() => (this.profile()?.roles ?? []).filter(r => (STAFF_ROLES as readonly string[]).includes(r)));
  readonly isStaff = computed(() => this.staffRoles().length > 0);

  /** Restores the session on page load. Safe to call many times. */
  init(): Promise<void> {
    this.initPromise ??= (async () => {
      if (this.storedRefreshToken() && await this.refresh()) await this.loadProfile();
    })();
    return this.initPromise;
  }

  // ---------- Sign-in ----------

  requestEmailCode(email: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.api}/auth/email/request`, { email }));
  }

  verifyEmailCode(email: string, code: string): Promise<Profile | null> {
    return this.signIn(`${this.api}/auth/email/verify`, { email, code });
  }

  signInWithPassword(email: string, password: string): Promise<Profile | null> {
    return this.signIn(`${this.api}/auth/email/password`, { email, password });
  }

  requestMobileCode(countryCode: string, mobileNumber: string, channel: 'sms' | 'whatsapp'): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.api}/auth/otp/request`, { countryCode, mobileNumber, channel }));
  }

  verifyMobileCode(countryCode: string, mobileNumber: string, code: string): Promise<Profile | null> {
    return this.signIn(`${this.api}/auth/otp/verify`, { countryCode, mobileNumber, code });
  }

  async signOut(): Promise<void> {
    const refreshToken = this.storedRefreshToken();
    try {
      if (this.accessToken) await firstValueFrom(this.http.post(`${this.api}/auth/logout`, { refreshToken }));
    } catch { /* already signed out on the server */ }
    this.clear();
  }

  private async signIn(url: string, body: object): Promise<Profile | null> {
    const tokens = await firstValueFrom(this.http.post<TokenResponse>(url, body));
    this.storeTokens(tokens);
    return this.loadProfile();
  }

  // ---------- Tokens (used by the HTTP interceptor) ----------

  /** A valid access token, refreshed first if it has (nearly) expired. Null when signed out. */
  async getAccessToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.accessExpiresAt - 30_000) return this.accessToken;
    if (!this.storedRefreshToken()) return null;
    return (await this.refresh()) ? this.accessToken : null;
  }

  /** Exchanges the refresh token; only one exchange runs at a time. */
  refresh(): Promise<boolean> {
    this.refreshing ??= (async () => {
      const refreshToken = this.storedRefreshToken();
      if (!refreshToken) return false;
      try {
        const tokens = await firstValueFrom(this.http.post<TokenResponse>(`${this.api}/auth/refresh`, { refreshToken }));
        this.storeTokens(tokens);
        return true;
      } catch {
        this.clear();
        return false;
      }
    })().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  async loadProfile(): Promise<Profile | null> {
    try {
      const p = await firstValueFrom(this.http.get<Profile>(`${this.api}/me`));
      this.profile.set(p);
      return p;
    } catch {
      this.profile.set(null);
      return null;
    }
  }

  // ---------- Storage ----------

  private storeTokens(t: TokenResponse): void {
    this.accessToken = t.accessToken;
    this.accessExpiresAt = Date.parse(t.accessTokenExpiresAt);
    try { localStorage.setItem(REFRESH_KEY, t.refreshToken); } catch { /* private mode: session lasts until reload */ }
  }

  private storedRefreshToken(): string | null {
    try { return localStorage.getItem(REFRESH_KEY); } catch { return null; }
  }

  private clear(): void {
    this.accessToken = null;
    this.accessExpiresAt = 0;
    this.profile.set(null);
    try { localStorage.removeItem(REFRESH_KEY); } catch { /* ignore */ }
  }
}
