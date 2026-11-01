import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Profile, TokenResponse, UpdateProfileRequest } from '../api/api.models';

const REFRESH_KEY = 'swp-rt';

/**
 * Visitor sign-in state.
 * - The access token (15 min) is kept only in memory — never written to storage.
 * - The refresh token is kept in localStorage so visitors stay signed in. The API rotates it on every use and
 *   revokes the whole session if an old one is ever reused, which limits the damage if it were stolen.
 *   (When the site gets its own backend-for-frontend, move it to an httpOnly cookie.)
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly api = environment.apiBaseUrl + '/api/v1';

  private accessToken: string | null = null;
  private accessExpiresAt = 0;
  private refreshing: Promise<boolean> | null = null;
  private initPromise: Promise<void> | null = null;

  readonly profile = signal<Profile | null>(null);
  readonly isSignedIn = computed(() => this.profile() !== null);
  readonly profileComplete = computed(() => this.profile()?.profileComplete ?? false);

  /** Restores the session on page load (browser only). Safe to call many times. */
  init(): Promise<void> {
    if (!this.isBrowser) return Promise.resolve();
    this.initPromise ??= (async () => {
      if (this.storedRefreshToken() && await this.refresh()) await this.loadProfile();
    })();
    return this.initPromise;
  }

  // ---------- Sign-in ----------

  requestCode(countryCode: string, mobileNumber: string, channel: 'sms' | 'whatsapp'): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.api}/auth/otp/request`, { countryCode, mobileNumber, channel }));
  }

  async verifyCode(countryCode: string, mobileNumber: string, code: string): Promise<Profile | null> {
    const tokens = await firstValueFrom(this.http.post<TokenResponse>(`${this.api}/auth/otp/verify`, { countryCode, mobileNumber, code }));
    this.storeTokens(tokens);
    return this.loadProfile();
  }

  requestEmailCode(email: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.api}/auth/email/request`, { email }));
  }

  async verifyEmailCode(email: string, code: string): Promise<Profile | null> {
    const tokens = await firstValueFrom(this.http.post<TokenResponse>(`${this.api}/auth/email/verify`, { email, code }));
    this.storeTokens(tokens);
    return this.loadProfile();
  }

  /** Email accounts that have added a password. */
  async signInWithPassword(email: string, password: string): Promise<Profile | null> {
    const tokens = await firstValueFrom(this.http.post<TokenResponse>(`${this.api}/auth/email/password`, { email, password }));
    this.storeTokens(tokens);
    return this.loadProfile();
  }

  async signOut(): Promise<void> {
    const refreshToken = this.storedRefreshToken();
    try {
      if (this.accessToken) await firstValueFrom(this.http.post(`${this.api}/auth/logout`, { refreshToken }));
    } catch { /* already signed out on the server */ }
    this.clear();
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

  // ---------- My account ----------

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

  async updateProfile(request: UpdateProfileRequest): Promise<Profile> {
    const p = await firstValueFrom(this.http.put<Profile>(`${this.api}/me/profile`, request));
    this.profile.set(p);
    await this.refresh();            // new token carries the completed-profile flag
    return p;
  }

  /** Add or change my mobile number, step 1: a code goes to the new number. */
  requestMobileChange(countryCode: string, mobileNumber: string, channel: 'sms' | 'whatsapp'): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.api}/me/mobile/request`, { countryCode, mobileNumber, channel }));
  }

  /** Step 2: the code is checked and the number saved (it can then be used to sign in). */
  async verifyMobileChange(countryCode: string, mobileNumber: string, code: string): Promise<Profile> {
    const p = await firstValueFrom(this.http.post<Profile>(`${this.api}/me/mobile/verify`, { countryCode, mobileNumber, code }));
    this.profile.set(p);
    return p;
  }

  /** Add a password (email accounts), or change it — changing needs the current one. */
  async setPassword(newPassword: string, currentPassword: string | null): Promise<void> {
    await firstValueFrom(this.http.put(`${this.api}/me/password`, { newPassword, currentPassword }));
    const p = this.profile();
    if (p) this.profile.set({ ...p, hasPassword: true });
  }

  exportData(): Promise<Blob> {
    return firstValueFrom(this.http.get(`${this.api}/me/export`, { responseType: 'blob' }));
  }

  async deleteAccount(): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/me`));
    this.clear();
  }

  // ---------- Storage ----------

  private storeTokens(t: TokenResponse): void {
    this.accessToken = t.accessToken;
    this.accessExpiresAt = Date.parse(t.accessTokenExpiresAt);
    try { localStorage.setItem(REFRESH_KEY, t.refreshToken); } catch { /* private mode: session lasts until reload */ }
  }

  private storedRefreshToken(): string | null {
    if (!this.isBrowser) return null;
    try { return localStorage.getItem(REFRESH_KEY); } catch { return null; }
  }

  private clear(): void {
    this.accessToken = null;
    this.accessExpiresAt = 0;
    this.profile.set(null);
    if (this.isBrowser) { try { localStorage.removeItem(REFRESH_KEY); } catch { /* ignore */ } }
  }
}
