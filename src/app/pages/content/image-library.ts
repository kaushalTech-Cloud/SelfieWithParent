import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MediaItem } from '../../core/content.models';
import { problemMessage } from '../../core/problem';

/** Where an image can be viewed: media/… (in the database, served by the API), or an older img/… path on the website. */
export function imageUrl(path: string): string {
  return path.startsWith('media/') ? `${environment.apiBaseUrl}/api/v1/${path}` : `${environment.publicSiteUrl}/${path}`;
}

/** Choose an image for a page: uploaded images or the website's own pictures (all stored in the database), or upload a PNG / JPEG / WebP (up to 2 MB). */
@Component({
  selector: 'app-image-library',
  template: `
    <div class="lib-backdrop" (click)="closed.emit()"></div>
    <div class="lib-dialog panel" role="dialog" aria-modal="true" aria-labelledby="libTitle" (keydown.escape)="closed.emit()">
      <div class="d-flex align-items-center gap-2 mb-3">
        <h2 id="libTitle" class="mb-0 me-auto">Choose an image</h2>
        <label class="btn btn-accent btn-sm mb-0" [class.disabled]="uploading()">
          @if (uploading()) { <span class="spinner-border spinner-border-sm"></span> } @else { <i class="bi bi-upload"></i> }
          Upload image
          <input type="file" class="visually-hidden" accept="image/png,image/jpeg,image/webp" (change)="upload($event)" [disabled]="uploading()">
        </label>
        <button class="btn btn-light btn-sm" type="button" (click)="closed.emit()" aria-label="Close"><i class="bi bi-x-lg"></i></button>
      </div>
      <p class="small text-muted">PNG, JPEG or WebP, up to 2 MB. Use photos only with the permission of the people in them.</p>
      @if (error()) { <div class="alert alert-danger py-2 small" role="alert">{{ error() }}</div> }

      <h3 class="lib-heading">Uploaded</h3>
      @if (loading()) {
        <p class="small text-muted"><span class="spinner-border spinner-border-sm"></span> Loading…</p>
      } @else {
        <div class="lib-grid">
          @for (m of uploaded(); track m.publicId) {
            <div class="lib-item" [class.current]="current() === m.path">
              <button type="button" class="lib-pick" (click)="chosen.emit(m.path)" [title]="m.fileName"><img [src]="url(m.path)" [alt]="m.fileName" loading="lazy"></button>
              <div class="lib-meta"><span class="text-truncate">{{ m.fileName }}</span>
                @if (confirmDelete() === m.publicId) {
                  <button class="btn btn-sm btn-danger py-0" type="button" (click)="remove(m)">Delete?</button>
                } @else {
                  <button class="btn btn-sm btn-link text-danger p-0" type="button" (click)="confirmDelete.set(m.publicId)" [attr.aria-label]="'Delete ' + m.fileName" title="Delete"><i class="bi bi-trash"></i></button>
                }
              </div>
            </div>
          } @empty { <p class="small text-muted">No uploaded images yet.</p> }
        </div>
      }

      <h3 class="lib-heading mt-3">Website pictures</h3>
      <div class="lib-grid">
        @for (m of siteImages(); track m.publicId) {
          <div class="lib-item" [class.current]="current() === m.path">
            <button type="button" class="lib-pick" (click)="chosen.emit(m.path)" [title]="m.fileName"><img [src]="url(m.path)" [alt]="m.fileName" loading="lazy"></button>
            <div class="lib-meta"><span class="text-truncate">{{ m.fileName }}</span></div>
          </div>
        }
      </div>
    </div>
  `
})
export class ImageLibrary implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl + '/api/v1/admin/media';

  readonly current = input<string>('');
  readonly chosen = output<string>();
  readonly closed = output<void>();

  protected readonly uploaded = computed(() => this.media().filter(m => !m.isSystem));
  protected readonly siteImages = computed(() => this.media().filter(m => m.isSystem));
  protected readonly media = signal<MediaItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly uploading = signal(false);
  protected readonly error = signal('');
  protected readonly confirmDelete = signal<string | null>(null);
  protected readonly url = imageUrl;

  ngOnInit(): void { void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.media.set(await firstValueFrom(this.http.get<MediaItem[]>(this.api)));
    } catch (e) {
      this.error.set(problemMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async upload(event: Event): Promise<void> {
    const box = event.target as HTMLInputElement;
    const file = box.files?.[0];
    box.value = '';
    if (!file) return;
    this.error.set('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { this.error.set('Only PNG, JPEG and WebP images can be uploaded.'); return; }
    if (file.size > 2 * 1024 * 1024) { this.error.set('Choose an image up to 2 MB.'); return; }

    const body = new FormData();
    body.append('file', file, file.name);
    this.uploading.set(true);
    try {
      const m = await firstValueFrom(this.http.post<MediaItem>(this.api, body));
      this.media.update(list => [m, ...list]);
      this.chosen.emit(m.path);
    } catch (e) {
      this.error.set(problemMessage(e));
    } finally {
      this.uploading.set(false);
    }
  }

  protected async remove(m: MediaItem): Promise<void> {
    this.error.set('');
    try {
      await firstValueFrom(this.http.delete(`${this.api}/${m.publicId}`));
      this.media.update(list => list.filter(x => x.publicId !== m.publicId));
      this.confirmDelete.set(null);
    } catch (e) {
      this.error.set(problemMessage(e));
    }
  }
}
