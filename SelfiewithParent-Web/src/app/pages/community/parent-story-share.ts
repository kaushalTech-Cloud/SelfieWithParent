import { HttpClient, HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { SeoService } from '../../core/seo.service';
import { INDIA_STATES, countryList } from '../../shared/places';
import { STORIES_API } from './parent-stories.models';
import { DonatePill } from '../../shared/donate-pill';

type FileKey = 'photo' | 'video' | 'voice';
const LIMITS: Record<FileKey, { mb: number; types: RegExp; error: string }> = {
  photo: { mb: 10, types: /^image\/(jpeg|png|webp)$/, error: 'Choose a JPG, PNG or WebP photo up to 10 MB.' },
  video: { mb: 50, types: /^video\/(mp4|webm|quicktime)$/, error: 'Choose an MP4, WebM or MOV video up to 50 MB.' },
  voice: { mb: 5, types: /^audio\//, error: 'Choose a voice note (audio) up to 5 MB.' }
};

/** /parents-voices/share — a parent (or family / a friend, with their agreement) tells their story. Signed in; reviewed first. */
@Component({
  selector: 'app-parent-story-share',
  imports: [DonatePill, FormsModule, RouterLink, TranslatePipe],
  styleUrls: ['../../../styles/voices.css', '../../../styles/voices-story.css'],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="pv-page">
      <header class="pv-hero pv-story-hero text-center">
        <app-donate-pill />
        <span class="pv-fly"></span><span class="pv-fly"></span><span class="pv-fly"></span><span class="pv-fly"></span>
        <div class="container">
          <span class="pv-eyebrow"><i class="bi bi-heart-fill"></i> {{ "Parents' Voices" | t }}</span>
          <h1>{{ 'Every parent deserves' | t }} <em>{{ 'to be heard.' | t }}</em></h1>
          <p class="lead mx-auto">{{ 'Tell us what it is like when the children have gone. Our team reads every story with care before it appears.' | t }}</p>
        </div>
      </header>

      <main id="main" class="pb-5" tabindex="-1">
        <div class="container">
          <div class="pv-form">
            @if (done(); as d) {
              <div class="pv-done" role="status">
                <span class="pv-help-icon" aria-hidden="true"><i class="bi bi-heart-fill"></i></span>
                <h2 class="section-title">{{ 'Thank you for trusting us with this story.' | t }}</h2>
                <p class="text-muted">{{ 'Our team will read it soon. Once approved, it will appear on Parents’ Voices.' | t }}</p>
                <p class="small">{{ 'Reference:' | t }} <strong>{{ d }}</strong></p>
                <div class="d-flex flex-wrap justify-content-center gap-2 mt-3">
                  <a class="btn btn-accent" routerLink="/parents-voices">{{ 'Read other stories' | t }}</a>
                  <button class="btn btn-outline-accent" type="button" (click)="again()">{{ 'Share another' | t }}</button>
                </div>
              </div>
            } @else {
              <form novalidate (ngSubmit)="submit()">
                <!-- 1. Who is writing -->
                <section class="pv-step">
                  <h2><span>1</span> {{ 'Who is writing?' | t }}</h2>
                  <div class="pv-choices" role="radiogroup" [attr.aria-label]="'Who is writing?' | t">
                    @for (w of writers; track w.id) {
                      <label class="pv-choice">
                        <input type="radio" name="writtenBy" [value]="w.id" [(ngModel)]="f.writtenBy">
                        <i class="bi" [class]="w.icon"></i><strong>{{ w.title | t }}</strong><small>{{ w.text | t }}</small>
                      </label>
                    }
                  </div>
                </section>

                <!-- 2. About the parent -->
                <section class="pv-step">
                  <h2><span>2</span> {{ 'About the parent' | t }}</h2>
                  <div class="row g-3">
                    <div class="col-md-4">
                      <label class="form-label small fw-semibold" for="pvRole">{{ 'Mother or father?' | t }}</label>
                      <select class="form-select" id="pvRole" name="role" [(ngModel)]="f.parentRole">
                        <option value="mother">{{ 'Mother' | t }}</option><option value="father">{{ 'Father' | t }}</option><option value="both">{{ 'Both parents' | t }}</option>
                      </select>
                    </div>
                    <div class="col-md-5">
                      <label class="form-label small fw-semibold" for="pvName">{{ 'Name to show' | t }}</label>
                      <input class="form-control" id="pvName" name="name" maxlength="60" [(ngModel)]="f.shownName" [disabled]="f.anonymous" [placeholder]="'e.g. Kamala Amma' | t">
                      <div class="form-check mt-1">
                        <input class="form-check-input" type="checkbox" id="pvAnon" name="anon" [(ngModel)]="f.anonymous">
                        <label class="form-check-label small" for="pvAnon">{{ 'Stay anonymous (shown as “A mother” / “A father”)' | t }}</label>
                      </div>
                    </div>
                    <div class="col-md-3">
                      <label class="form-label small fw-semibold" for="pvAge">{{ 'Age (optional)' | t }}</label>
                      <input class="form-control" id="pvAge" name="age" type="number" min="40" max="120" [(ngModel)]="f.age">
                    </div>
                    <div class="col-md-4">
                      <label class="form-label small fw-semibold" for="pvCountry">{{ 'Country' | t }}</label>
                      <select class="form-select" id="pvCountry" name="country" [(ngModel)]="f.countryCode">
                        @for (c of countries(); track c.code) { <option [value]="c.code">{{ c.name }}</option> }
                      </select>
                    </div>
                    <div class="col-md-4">
                      <label class="form-label small fw-semibold" for="pvState">{{ 'State / UT' | t }}</label>
                      @if (f.countryCode === 'IN') {
                        <select class="form-select" id="pvState" name="state" [(ngModel)]="f.stateName">
                          <option value="">{{ 'Choose state / UT' | t }}</option>
                          @for (s of states; track s) { <option [value]="s">{{ s }}</option> }
                        </select>
                      } @else { <input class="form-control" id="pvState" name="state" maxlength="60" [(ngModel)]="f.stateName"> }
                    </div>
                    <div class="col-md-4">
                      <label class="form-label small fw-semibold" for="pvCity">{{ 'City / village' | t }}</label>
                      <input class="form-control" id="pvCity" name="city" maxlength="60" [(ngModel)]="f.city">
                    </div>
                  </div>
                  <p class="small text-muted mt-2 mb-0"><i class="bi bi-shield-lock"></i> {{ 'Never write an address or phone number. Only the name you choose, the age and the town are shown.' | t }}</p>
                </section>

                <!-- 3. The story -->
                <section class="pv-step">
                  <h2><span>3</span> {{ 'The story' | t }}</h2>
                  <label class="form-label small fw-semibold" for="pvTitle">{{ 'A title' | t }}</label>
                  <input class="form-control mb-3" id="pvTitle" name="title" maxlength="120" [(ngModel)]="f.title" [placeholder]="'e.g. His room is still the same' | t">
                  <label class="form-label small fw-semibold" for="pvStory">{{ 'Their story' | t }}</label>
                  <textarea class="form-control pv-story-input" id="pvStory" name="story" maxlength="3000" [(ngModel)]="f.story"
                            [placeholder]="'When did the children leave? What does a day feel like now? What do you remember, and what do you hope for?' | t"></textarea>
                  <div class="char-count small text-muted text-end">{{ f.story.length }} / 3000</div>
                  <label class="form-label small fw-semibold mt-2" for="pvWish">{{ 'If my children read this… (optional)' | t }}</label>
                  <input class="form-control" id="pvWish" name="wish" maxlength="300" [(ngModel)]="f.wish" [placeholder]="'e.g. Just call me on Sunday. I only want to hear your voice.' | t">
                </section>

                <!-- 4. Photo, video, voice -->
                <section class="pv-step">
                  <h2><span>4</span> {{ 'A photo, video or voice note (optional)' | t }}</h2>
                  <div class="pv-files">
                    @for (k of fileKeys; track k.key) {
                      <label class="pv-file" [class.has]="files()[k.key]">
                        <input type="file" [accept]="k.accept" (change)="pick(k.key, $event)" [attr.aria-label]="k.title | t">
                        <i class="bi" [class]="files()[k.key] ? 'bi-check-circle-fill' : k.icon"></i>
                        <strong>{{ k.title | t }}</strong>
                        <small>{{ files()[k.key]?.name || (k.hint | t) }}</small>
                      </label>
                    }
                  </div>
                </section>

                <div class="pv-consent mb-3">
                  <div class="form-check mb-1">
                    <input class="form-check-input" type="checkbox" id="pvC1" name="c1" [(ngModel)]="f.consentParent">
                    <label class="form-check-label small" for="pvC1">{{ (f.writtenBy === 'parent' ? 'I am the parent and I want to share my story.' : 'The parent knows about this story and agreed to share it.') | t }}</label>
                  </div>
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="pvC2" name="c2" [(ngModel)]="f.consentTerms">
                    <label class="form-check-label small" for="pvC2">{{ 'I agree to the terms and the privacy policy. Our team may shorten or decline a story to protect the parent.' | t }}</label>
                  </div>
                </div>

                @if (error()) { <div class="alert alert-danger small" role="alert">{{ error() }}</div> }
                @if (progress() !== null) {
                  <div class="progress mb-2" role="progressbar" [attr.aria-valuenow]="progress()"><div class="progress-bar bg-accent" [style.width.%]="progress()">{{ progress() }}%</div></div>
                }
                <button class="btn btn-accent pv-submit" type="submit" [disabled]="progress() !== null">
                  <i class="bi bi-send-fill"></i> {{ 'Send the story for review' | t }}
                </button>
              </form>
            }
          </div>
        </div>
      </main>
    </div>`
})
export class ParentStoryShare {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);

  protected readonly writers = [
    { id: 'parent', icon: 'bi-person-heart', title: 'I am the parent', text: 'My children live away from me' },
    { id: 'family', icon: 'bi-people', title: 'Family member', text: 'Writing for my mother, father or grandparent' },
    { id: 'friend', icon: 'bi-hand-thumbs-up', title: 'Friend or volunteer', text: 'A neighbour, carer or volunteer, with their agreement' }
  ];
  protected readonly fileKeys: { key: FileKey; icon: string; title: string; hint: string; accept: string }[] = [
    { key: 'photo', icon: 'bi-image', title: 'Photo', hint: 'JPG, PNG or WebP · up to 10 MB', accept: 'image/jpeg,image/png,image/webp' },
    { key: 'video', icon: 'bi-camera-video', title: 'Video', hint: 'MP4, WebM or MOV · up to 50 MB', accept: 'video/mp4,video/webm,video/quicktime' },
    { key: 'voice', icon: 'bi-mic', title: 'Voice note', hint: 'Audio · up to 5 MB', accept: 'audio/*' }
  ];
  protected readonly states = INDIA_STATES;
  protected readonly countries = computed(() => countryList(this.i18n.lang()));

  protected f = this.blank();
  protected readonly files = signal<Partial<Record<FileKey, File>>>({});
  protected readonly error = signal('');
  protected readonly progress = signal<number | null>(null);
  protected readonly done = signal<string | null>(null);

  constructor() {
    inject(SeoService).set({ title: "Share a parent's story", description: "Tell the story of a parent whose children moved away or stopped calling.", path: '/parents-voices/share', noIndex: true });
  }

  private blank() {
    return { writtenBy: 'parent', parentRole: 'mother', shownName: '', anonymous: false, age: null as number | null, countryCode: this.i18n.guessCountry() || 'IN',
      stateName: '', city: '', title: '', story: '', wish: '', consentParent: false, consentTerms: false };
  }

  protected pick(key: FileKey, e: Event): void {
    const input = e.target as HTMLInputElement, file = input.files?.[0];
    this.error.set('');
    if (!file) { this.files.update(x => ({ ...x, [key]: undefined })); return; }
    const l = LIMITS[key];
    if (file.size > l.mb * 1024 * 1024 || !l.types.test(file.type)) { this.error.set(this.i18n.t(l.error)); input.value = ''; return; }
    this.files.update(x => ({ ...x, [key]: file }));
  }

  /** Checks on this side first (the API checks everything again). */
  private problem(): string | null {
    const f = this.f;
    if (!f.anonymous && !f.shownName.trim()) return 'Add a name to show, or choose to stay anonymous.';
    if (f.age !== null && (f.age < 40 || f.age > 120)) return 'Age must be between 40 and 120.';
    if (f.title.trim().length < 3) return 'Give the story a short title.';
    if (f.story.trim().length < 40) return 'Please write a little more of the story (at least 40 characters).';
    if (/[<>]/.test(f.shownName + f.title + f.story + f.wish + f.city + f.stateName)) return "Text can't contain < or >.";
    if (!f.consentParent || !f.consentTerms) return 'Please tick both boxes to continue.';
    return null;
  }

  protected submit(): void {
    const p = this.problem();
    if (p) { this.error.set(this.i18n.t(p)); return; }
    const f = this.f, body = new FormData();
    body.append('WrittenBy', f.writtenBy); body.append('ParentRole', f.parentRole); body.append('Anonymous', String(f.anonymous));
    if (!f.anonymous) body.append('ShownName', f.shownName.trim());
    if (f.age !== null) body.append('Age', String(f.age));
    body.append('CountryCode', f.countryCode);
    if (f.stateName.trim()) body.append('StateName', f.stateName.trim());
    if (f.city.trim()) body.append('City', f.city.trim());
    body.append('Title', f.title.trim()); body.append('Story', f.story.trim());
    if (f.wish.trim()) body.append('Wish', f.wish.trim());
    body.append('ConsentParent', String(f.consentParent)); body.append('ConsentTerms', String(f.consentTerms));
    const files = this.files();
    if (files.photo) body.append('Photo', files.photo);
    if (files.video) body.append('Video', files.video);
    if (files.voice) body.append('Voice', files.voice);

    this.error.set('');
    this.progress.set(0);
    this.http.post<{ reference: string }>(STORIES_API, body, { reportProgress: true, observe: 'events' }).subscribe({
      next: ev => {
        if (ev.type === HttpEventType.UploadProgress && ev.total) this.progress.set(Math.round(100 * ev.loaded / ev.total));
        if (ev.type === HttpEventType.Response) { this.progress.set(null); this.done.set(ev.body?.reference ?? ''); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      },
      error: (e: HttpErrorResponse) => {
        this.progress.set(null);
        const err = e.error as { title?: string; errors?: Record<string, string[]> } | null;
        this.error.set(this.i18n.t(err?.errors ? Object.values(err.errors).flat()[0] : err?.title ?? "We couldn't send the story. Please try again."));
      }
    });
  }

  protected again(): void { this.f = this.blank(); this.files.set({}); this.done.set(null); this.error.set(''); }
}
