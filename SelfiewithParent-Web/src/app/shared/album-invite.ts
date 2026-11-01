import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { ProblemDetails } from '../core/api/api.models';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/t.pipe';
import { LikeShare } from './like-share';

export interface AlbumLink { publicId: string; inviteCode: string; }

/**
 * "Tag your sibling": invite a brother, sister or cousin to add their own selfie with the same parent to a family album.
 * Given a selfie, the album is made when the visitor asks for the link; given an album, its link is shown straight away.
 */
@Component({
  selector: 'app-album-invite',
  imports: [RouterLink, TranslatePipe, LikeShare],
  template: `
    <div class="ai-card" [class.ai-compact]="compact()">
      <div class="ai-faces" aria-hidden="true"><span><i class="bi bi-person-heart"></i></span><span><i class="bi bi-plus-lg"></i></span><span><i class="bi bi-people-fill"></i></span></div>
      <div class="ai-body">
        <strong>{{ (parentName() ? 'Invite your brothers, sisters and cousins to add their selfie with {name}' : 'Invite your brothers, sisters and cousins') | t: { name: parentName() ?? '' } }}</strong>
        <small>{{ 'Everyone adds their own selfie with the same parent — together they make one family album.' | t }}</small>

        @if (link(); as l) {
          <div class="ai-link">
            <input class="form-control form-control-sm" [value]="url()" readonly [attr.aria-label]="'Invite link' | t" (focus)="$any($event.target).select()">
            <button type="button" class="btn btn-sm btn-light" (click)="copy()"><i class="bi" [class]="copied() ? 'bi-check2' : 'bi-copy'"></i> {{ (copied() ? 'Copied' : 'Copy') | t }}</button>
          </div>
          <div class="ai-actions">
            <a class="btn btn-sm ai-wa" [href]="whatsApp()" target="_blank" rel="noopener noreferrer"><i class="bi bi-whatsapp"></i> WhatsApp</a>
            <app-like-share [id]="'album-' + l.inviteCode" [title]="shareText()" [caption]="shareText()" [path]="'/albums/join/' + l.inviteCode" [shareOnly]="true" [compact]="true" />
            @if (showView()) { <a class="btn btn-sm btn-link" [routerLink]="['/albums', l.publicId]">{{ 'View the album' | t }} <i class="bi bi-arrow-right"></i></a> }
          </div>
        } @else {
          <button type="button" class="btn btn-accent btn-sm mt-2" [disabled]="busy()" (click)="start()"><i class="bi bi-link-45deg"></i> {{ 'Get my invite link' | t }}</button>
        }
        @if (error()) { <p class="small text-danger mt-2 mb-0" role="alert">{{ error() }}</p> }
      </div>
    </div>`,
  styles: `
    .ai-card { display: flex; gap: 1rem; align-items: flex-start; padding: 1.1rem 1.2rem; border-radius: 18px; text-align: start;
      background: linear-gradient(135deg, #fff6ef, #fdf1f6); border: 1px solid #f6d9cf; }
    .ai-faces { display: flex; flex: none; }
    .ai-faces span { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; color: #fff; font-size: 1rem; border: 2px solid #fff;
      background: linear-gradient(135deg, var(--accent), #f59a5b); }
    .ai-faces span + span { margin-left: -10px; }
    .ai-faces span:nth-child(2) { background: #fff; color: var(--accent); width: 28px; height: 28px; margin-top: 6px; font-size: .8rem; z-index: 1; }
    .ai-faces span:nth-child(3) { background: linear-gradient(135deg, var(--primary, #0f5b5c), #2a9d8f); }
    .ai-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .25rem; }
    .ai-body > strong { color: var(--primary-dark, #0a3d3e); }
    .ai-body > small { color: var(--muted, #6b7280); }
    .ai-link { display: flex; gap: .4rem; margin-top: .5rem; }
    .ai-link input { min-width: 0; background: #fff; }
    .ai-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; margin-top: .45rem; }
    .ai-wa { background: #25d366; color: #fff; border: 0; }
    .ai-wa:hover { background: #1ebe5a; color: #fff; }
    .ai-compact { padding: .9rem 1rem; }
    @media (max-width: 575.98px) { .ai-card { flex-direction: column; } }
  `
})
export class AlbumInvite {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The visitor's selfie to start the album from (when there's no album yet). */
  readonly selfieId = input<string | null>(null);
  /** An album the visitor is already in. */
  readonly album = input<AlbumLink | null>(null);
  readonly parentName = input<string | null>(null);
  readonly showView = input(true);
  readonly compact = input(false);

  private readonly started = signal<AlbumLink | null>(null);
  protected readonly link = computed(() => this.started() ?? this.album());
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly copied = signal(false);

  protected readonly url = computed(() => {
    const l = this.link();
    return l ? `${this.browser ? location.origin : ''}/albums/join/${l.inviteCode}` : '';
  });
  protected readonly shareText = computed(() => this.parentName()
    ? this.i18n.t('Add your selfie with {name} to our family album', { name: this.parentName() ?? '' })
    : this.i18n.t('Add your selfie to our family album'));
  protected readonly whatsApp = computed(() => `https://wa.me/?text=${encodeURIComponent(this.shareText() + ' ' + this.url())}`);

  protected async start(): Promise<void> {
    const id = this.selfieId();
    if (!id) return;
    this.busy.set(true);
    this.error.set('');
    try {
      this.started.set(await firstValueFrom(this.http.post<AlbumLink>(`${environment.apiBaseUrl}/api/v1/albums`, { selfieId: id })));
    } catch (e) {
      const p = e instanceof HttpErrorResponse ? e.error as ProblemDetails : null;
      this.error.set(this.i18n.t(p?.title ?? 'Something went wrong. Please try again.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(): Promise<void> {
    try { await navigator.clipboard.writeText(this.url()); this.copied.set(true); setTimeout(() => this.copied.set(false), 2500); } catch { /* the field can be copied by hand */ }
  }
}
