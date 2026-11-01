import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export type Feature = 'then-now' | 'memories' | 'family-tree' | 'contest' | 'photo-frames' | 'reels' | 'parents-voices' | 'support'
  | 'streaks' | 'profiles' | 'albums';

/**
 * Which website features staff switched on (admin site › Site features). Loaded once (on the server too, so a switched-off
 * feature never flashes). Everything counts as on until the answer arrives, and if the API can't be reached.
 */
@Injectable({ providedIn: 'root' })
export class FeaturesService {
  private readonly state = signal<Record<string, boolean>>({});
  /** Resolves once the switches are known (or the API couldn't be reached). */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = firstValueFrom(inject(HttpClient).get<{ features: Record<string, boolean> }>(`${environment.apiBaseUrl}/api/v1/site/features`))
      .then(r => this.state.set(r.features ?? {}))
      .catch(() => { /* all on */ });
  }

  on(f: Feature): boolean { return this.state()[f] !== false; }
}

/** Route guard: a switched-off feature's page shows "not available right now" instead. */
export function featureGuard(f: Feature): CanActivateFn {
  return async () => {
    const features = inject(FeaturesService), router = inject(Router);   // before the await: inject() only works synchronously
    await features.ready;
    return features.on(f) ? true : router.createUrlTree(['/not-available']);
  };
}
