import { HttpClient } from '@angular/common/http';
import { Injectable, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/**
 * The admin site's notification for contact-form messages (super admins and admins): how many are new, checked every
 * minute, with a short pop-up when a new one arrives while the admin site is open.
 */
@Injectable({ providedIn: 'root' })
export class MessageAlertsService implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly unread = signal(0);
  /** "New message from Asha" — shown for a few seconds when the count goes up. */
  readonly toast = signal<string | null>(null);
  readonly canSee = computed(() => this.auth.staffRoles().some(r => r === 'SuperAdmin' || r === 'Admin'));

  private timer: ReturnType<typeof setInterval> | null = null;
  private first = true;

  constructor() {
    effect(() => {
      if (this.canSee()) this.start(); else this.stop();
    });
  }

  ngOnDestroy(): void { this.stop(); }

  private start(): void {
    if (this.timer) return;
    this.first = true;
    this.check();
    this.timer = setInterval(() => this.check(), 60_000);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unread.set(0);
  }

  /** Checks now (also after reading or archiving a message in the inbox). */
  check(): void {
    this.http.get<{ count: number; latestFrom: string | null }>(`${environment.apiBaseUrl}/api/v1/admin/contact-messages/unread`).subscribe({
      next: r => {
        if (!this.first && r.count > this.unread()) {
          this.toast.set(r.latestFrom ? `New message from ${r.latestFrom}` : 'New message');
          setTimeout(() => this.toast.set(null), 6000);
        }
        this.first = false;
        this.unread.set(r.count);
      },
      error: () => { /* try again next minute */ }
    });
  }
}
