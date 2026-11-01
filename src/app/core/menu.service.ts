import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { MenuItem, MenuResponse } from './api.models';

/** A site path for routerLink, or an external address for href. */
export interface MenuTarget { internal: boolean; path: string; href: string; }

/**
 * The admin sidebar comes from the database (menu code "admin"). The API only returns it to staff, and leaves out
 * items limited to a role the signed-in person doesn't have (super admins see everything). English only.
 */
@Injectable({ providedIn: 'root' })
export class MenuService {
  private readonly http = inject(HttpClient);
  readonly items = signal<MenuItem[]>([]);
  readonly failed = signal(false);

  /** Loads the sidebar for the signed-in staff member (call again after signing in as someone else). */
  async load(): Promise<void> {
    this.failed.set(false);
    try {
      const res = await firstValueFrom(this.http.get<MenuResponse>(`${environment.apiBaseUrl}/api/v1/menus/admin`, { params: { lang: 'en' } }));
      this.items.set(res.items);
    } catch {
      this.items.set([]);
      this.failed.set(true);
    }
  }

  clear(): void { this.items.set([]); }

  /** Site paths use the router; https / mailto / tel stay plain links. */
  static target(url: string): MenuTarget {
    return url.startsWith('/') && !url.startsWith('//')
      ? { internal: true, path: url, href: url }
      : { internal: false, path: '', href: url };
  }
}
