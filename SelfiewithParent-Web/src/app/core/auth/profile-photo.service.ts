import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

/**
 * The signed-in account's profile photo, stored in the database. It is private, so it is fetched with the access token
 * and shown from a local copy (an object URL); it reloads only when the photo changes (new photo id).
 */
@Injectable({ providedIn: 'root' })
export class ProfilePhotoService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly api = `${environment.apiBaseUrl}/api/v1/me/photo`;
  private loadedFor: string | null = null;

  /** Address of the photo to show, or null (show initials). */
  readonly url = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.auth.profile()?.photoId ?? null;
      if (this.inBrowser && id !== this.loadedFor) void this.load(id);
    });
  }

  private async load(id: string | null): Promise<void> {
    this.loadedFor = id;
    if (!id) { this.show(null); return; }
    try {
      const blob = await firstValueFrom(this.http.get(this.api, { responseType: 'blob' }));
      if (this.loadedFor === id) this.show(URL.createObjectURL(blob));
    } catch {
      if (this.loadedFor === id) this.show(null);   // couldn't load: initials are shown
    }
  }

  private show(url: string | null): void {
    const old = this.url();
    this.url.set(url);
    if (old) URL.revokeObjectURL(old);
  }

  /** Saves a new photo (JPG, PNG or WebP up to 10 MB; the API checks it again). */
  async upload(file: File): Promise<void> {
    const body = new FormData();
    body.append('file', file, file.name);
    const res = await firstValueFrom(this.http.put<{ photoId: string }>(this.api, body));
    this.auth.profile.update(p => p && { ...p, photoId: res.photoId });
  }

  async remove(): Promise<void> {
    await firstValueFrom(this.http.delete(this.api));
    this.auth.profile.update(p => p && { ...p, photoId: null });
  }
}
