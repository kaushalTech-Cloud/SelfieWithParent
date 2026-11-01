import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { ProfilePhotoService } from '../core/profile-photo.service';
import { problemMessage } from '../core/problem';

/** Every staff member: their own profile photo (stored in the database), shown in the top bar. */
@Component({
  selector: 'app-profile',
  template: `
    <div class="row g-4">
      <div class="col-lg-6 col-xl-5">
        <section class="panel">
          <h2>My profile photo</h2>
          <div class="d-flex align-items-center gap-3 my-3">
            <span class="avatar avatar-xl" aria-hidden="true">
              @if (photo.url(); as src) { <img [src]="src" alt=""> } @else { {{ initials() }} }
            </span>
            <div>
              <div class="fw-semibold">{{ auth.profile()?.fullName || 'Staff' }}</div>
              <div class="small text-muted">{{ auth.profile()?.email ?? auth.profile()?.mobileMasked }}</div>
            </div>
          </div>
          <p class="small text-muted">JPG, PNG or WebP, up to 10 MB. It's shown next to your name in the admin site.</p>
          @if (error()) { <div class="alert alert-danger py-2 small" role="alert">{{ error() }}</div> }
          @if (notice()) { <div class="alert alert-success py-2 small" role="status">{{ notice() }}</div> }
          <div class="d-flex flex-wrap gap-2">
            <label class="btn btn-accent mb-0" [class.disabled]="busy()">
              @if (busy()) { <span class="spinner-border spinner-border-sm"></span> } @else { <i class="bi bi-camera"></i> }
              {{ photo.url() ? 'Change photo' : 'Add a photo' }}
              <input type="file" class="visually-hidden" accept="image/jpeg,image/png,image/webp" (change)="choose($event)" [disabled]="busy()">
            </label>
            @if (photo.url()) {
              <button class="btn btn-outline-danger" type="button" (click)="remove()" [disabled]="busy()"><i class="bi bi-trash"></i> Remove photo</button>
            }
          </div>
        </section>
      </div>
    </div>
  `
})
export class Profile {
  protected readonly auth = inject(AuthService);
  protected readonly photo = inject(ProfilePhotoService);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');

  protected readonly initials = computed(() => {
    const parts = (this.auth.profile()?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
    return parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() : 'ST';
  });

  protected async choose(event: Event): Promise<void> {
    const box = event.target as HTMLInputElement;
    const file = box.files?.[0];
    box.value = '';
    if (!file) return;
    this.error.set('');
    this.notice.set('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      this.error.set('Choose a JPG, PNG or WebP photo up to 10 MB.');
      return;
    }
    this.busy.set(true);
    try {
      await this.photo.upload(file);
      this.notice.set('Photo saved.');
    } catch (e) {
      this.error.set(problemMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await this.photo.remove();
      this.notice.set('Photo removed.');
    } catch (e) {
      this.error.set(problemMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
