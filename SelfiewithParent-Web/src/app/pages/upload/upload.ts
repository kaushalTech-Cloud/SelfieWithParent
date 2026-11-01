import { NgTemplateOutlet } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ProblemDetails } from '../../core/api/api.models';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { isValidMobile } from '../../core/phone';
import { SeoService } from '../../core/seo.service';
import { DialCodeSelect } from '../../shared/dial-code-select';
import { INDIA_STATES, countryList } from '../../shared/places';
import { FamilyTreeDraft, ThenNowDraft } from '../community/then-now-draft';
import { DonatePill } from '../../shared/donate-pill';
import { FeaturesService } from '../../core/features.service';
import { AlbumInvite } from '../../shared/album-invite';
import type { Album } from '../albums/album-page';

type Kind = 'real' | 'ai' | 'memory' | 'family' | 'thennow';
type Slot = 'main' | 'source' | 'video' | 'voice' | 'then';

interface Picked { file: File; url: string; }

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const MAX_PHOTO = 10 * 1024 * 1024;
const MAX_VIDEO = 50 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 60;
const VOICE_TYPES = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/wave'];
const MAX_VOICE = 5 * 1024 * 1024;
const MAX_VOICE_SECONDS = 60;
const SAMPLE_PROMPT = 'A warm, natural selfie of a smiling adult child and their elderly mother sitting close together at home, soft daylight, realistic photo, both faces clearly visible.';

/**
 * Share a selfie, family photo or video (signed-in visitors). Three steps, as in the design: about you → photo / video →
 * review and consent. The photo and video are saved in the database and wait in the review queue.
 */
@Component({
  selector: 'app-upload',
  imports: [AlbumInvite, DonatePill, FormsModule, NgTemplateOutlet, RouterLink, TranslatePipe, DialCodeSelect],
  templateUrl: './upload.html',
  // The design's stylesheet, as it is (it styles the whole page)
  styleUrls: ['../../../styles/upload-hero.css', '../../../styles/upload.css'],
  encapsulation: ViewEncapsulation.None
})
export class Upload implements OnDestroy {
  protected readonly features = inject(FeaturesService);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly states = INDIA_STATES;
  protected readonly countries = computed(() => countryList(this.i18n.lang()));
  protected readonly relations = ['Mother', 'Father', 'Both parents', 'Grandmother', 'Grandfather', 'Grandparents', 'Step-parent', 'Guardian'];
  protected readonly familySizes = ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11-15', '16+'];
  protected readonly years = Array.from({ length: 61 }, (_, i) => new Date().getFullYear() - i);
  protected kinds: { code: Kind; icon: string; title: string; hint: string }[] = [
    { code: 'real', icon: 'bi-camera', title: 'A real selfie', hint: 'Taken together with your camera' },
    { code: 'ai', icon: 'bi-stars', title: 'AI-made', hint: 'Created from photos with an AI tool' },
    { code: 'memory', icon: 'bi-flower1', title: 'In loving memory', hint: 'Honouring a parent who has passed' },
    { code: 'family', icon: 'bi-people-fill', title: 'Family', hint: 'The whole family together — photo and video' },
    { code: 'thennow', icon: 'bi-arrow-left-right', title: 'Then & Now', hint: 'An old photo and the same picture today' }
  ];
  protected readonly kindLabel: Record<Kind, string> = { real: 'Selfie', ai: 'AI-made', memory: 'In loving memory', family: 'Family', thennow: 'Then & Now' };

  protected readonly step = signal(1);
  protected form = this.blankForm();
  protected readonly media = signal<'photo' | 'video'>('photo');
  protected readonly files = signal<Partial<Record<Slot, Picked>>>({});
  protected readonly fileError = signal<Partial<Record<Slot, string>>>({});
  protected readonly dragOver = signal<Slot | null>(null);
  protected readonly errors = signal<Record<string, boolean>>({});
  protected readonly consentError = signal(false);
  protected readonly apiErrors = signal<string[]>([]);
  protected readonly sending = signal(false);
  protected readonly progress = signal(0);
  protected readonly done = signal<{ reference: string; name: string; selfieId: string; kind: Kind; parentName: string } | null>(null);
  /** Opened from a family album invite link (/upload?album={code}): the album, and whether the new selfie went into it. */
  protected readonly albumCode = signal<string | null>(null);
  protected readonly album = signal<Album | null>(null);
  protected readonly joined = signal<string | null>(null);
  /** The new selfie is being added to the album (the invite card waits, so it can't start a second album meanwhile). */
  protected readonly joining = signal(false);
  protected readonly joinError = signal('');
  /** Selfies with a parent can be in a family album. */
  protected canAlbum(kind: Kind): boolean { return kind !== 'family' && this.features.on('albums'); }
  protected readonly copied = signal(false);

  constructor() {
    inject(SeoService).set({ title: 'Share your selfie', description: 'Share a selfie, family photo or video with your parent or grandparent.', path: '/upload', noIndex: true });
    const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
    const k = q.get('kind') as Kind | null;
    if (k && this.kinds.some(x => x.code === k)) this.form.kind = k;
    if (q.get('media') === 'video') this.media.set('video');
    const code = q.get('album');
    if (code && /^[a-zA-Z0-9]{10}$/.test(code)) this.openAlbum(code.toLowerCase());
    // From the Then & Now page ("Submit to the gallery"): the pair the visitor made there
    const pair = inject(ThenNowDraft).take();
    if (pair && this.form.kind === 'thennow') {
      this.form.thenYear = pair.thenYear;
      this.form.nowYear = pair.nowYear;
      if (pair.then) void this.setFile('then', pair.then);
      if (pair.now) void this.setFile('main', pair.now);
    }
    // From the Family Tree page ("Post to the gallery"): the tree as a family photo
    const tree = inject(FamilyTreeDraft).take();
    if (tree && this.form.kind === 'family') {
      this.form.parentName = tree.familyName;
      const n = Math.max(2, tree.people);
      this.form.familySize = n <= 10 ? String(n) : n <= 15 ? '11-15' : '16+';
      this.form.generations = tree.generations >= 4 ? '4+' : tree.generations >= 2 ? String(tree.generations) : '';
      this.fromTree.set(true);
      void this.setFile('main', tree.picture);
    }
    this.knownPlace();
  }

  /**
   * The visitor's place is known (their last upload, or their profile): shown on one line with "Change", not asked again.
   * Shown as fields when it isn't known yet, when they choose Change, or when it needs fixing.
   */
  protected readonly placeKnown = signal(false);

  private knownPlace(): void {
    const p = this.auth.profile();
    if (p?.countryCode && (p.countryCode !== 'IN' || p.stateName)) this.placeKnown.set(true);
    if (!this.auth.isSignedIn()) return;
    this.http.get<{ countryCode: string; stateName: string | null; city: string | null } | null>(`${environment.apiBaseUrl}/api/v1/selfies/mine/place`)
      .subscribe({
        next: last => {
          if (!last?.countryCode || this.step() > 1) return;   // nothing shared yet, or already moved on
          const india = last.countryCode === 'IN';
          if (india && !last.stateName) return;
          Object.assign(this.form, { countryCode: last.countryCode, stateName: india ? last.stateName ?? '' : '',
            region: india ? '' : last.stateName ?? '', city: last.city ?? '' });
          this.placeKnown.set(true);
        },
        error: () => { /* the fields (or the profile's place) are shown as before */ }
      });
  }

  /** From an invite link: the album's parent is filled in, and family photos aren't offered (an album is selfies with one parent). */
  private openAlbum(code: string): void {
    this.albumCode.set(code);
    const all = this.kinds;
    this.kinds = all.filter(k => k.code !== 'family');
    if (this.form.kind === 'family') this.form.kind = 'real';
    this.http.get<Album>(`${environment.apiBaseUrl}/api/v1/albums/invite/${code}`).subscribe({
      next: a => {
        this.album.set(a);
        if (a.parentName && !this.form.parentName) this.form.parentName = a.parentName;
        if (a.relation && !this.form.relation) this.form.relation = a.relation;
      },
      error: () => { this.albumCode.set(null); this.kinds = all; }   // an old link: an ordinary upload
    });
  }

  /** The form was opened from the Family Tree page with the tree picture attached. */
  protected readonly fromTree = signal(false);

  ngOnDestroy(): void {
    this.stopRecording(true);
    Object.values(this.files()).forEach(f => f && URL.revokeObjectURL(f.url));
  }

  private blankForm() {
    const p = this.auth.profile();
    return {
      kind: 'real' as Kind, yourName: p?.fullName ?? '', parentName: '', relation: '', familySize: '', generations: '', memoryYear: '',
      countryCode: p?.countryCode ?? 'IN', stateName: p?.countryCode === 'IN' || !p?.countryCode ? (p?.stateName ?? '') : '',
      region: p?.countryCode && p.countryCode !== 'IN' ? (p.stateName ?? '') : '', city: p?.city ?? '',
      adult: (p?.isAdultConfirmed ? 'yes' : '') as '' | 'yes' | 'no', guardianName: '', guardianDial: '+91', guardianMobile: '', guardianConsent: false,
      message: '', consentShown: false, consentOwn: false, consentTerms: false, thenYear: '', nowYear: ''
    };
  }

  protected get family(): boolean { return this.form.kind === 'family'; }

  /** Family: photo and / or video. Others: the photo or the video (whichever is chosen). */
  protected get thenNow(): boolean { return this.form.kind === 'thennow'; }
  /** Family: photo and / or video. Then & Now: two photos. Others: the photo or the video (whichever is chosen). */
  protected showPhoto(): boolean { return this.family || this.thenNow || this.media() === 'photo'; }
  protected showVideo(): boolean { return !this.thenNow && (this.family || this.media() === 'video'); }
  /** A voice note goes only with a photo or AI-made photo (not with a video, not for a family share). */
  protected showVoice(): boolean { return !this.family && this.media() === 'photo'; }

  protected mainLabel(): string {
    return this.thenNow ? 'The same picture today' : this.family ? 'Family photo' : this.form.kind === 'memory' ? 'A favourite photo together' : this.form.kind === 'ai' ? 'Your AI-made photo' : 'Your selfie';
  }

  protected countryName(code: string): string { return this.countries().find(c => c.code === code)?.name ?? code; }

  /** City, state and country, for the review step. */
  protected place(): string {
    const f = this.form;
    return [f.city.trim(), f.countryCode === 'IN' ? f.stateName : f.region.trim(), this.countryName(f.countryCode)].filter(Boolean).join(', ');
  }

  // ---------- Step 1 ----------

  private checkStep1(): boolean {
    const f = this.form;
    const e: Record<string, boolean> = {
      yourName: !f.yourName.trim(), parentName: !f.parentName.trim(),
      relation: !this.family && !f.relation, familySize: this.family && !f.familySize,
      country: !f.countryCode, state: f.countryCode === 'IN' && !f.stateName, adult: !f.adult,
      guardianName: f.adult === 'no' && f.guardianName.trim().length < 2,
      guardianMobile: f.adult === 'no' && !isValidMobile(f.guardianDial, f.guardianMobile),
      guardianConsent: f.adult === 'no' && !f.guardianConsent,
      markup: /[<>]/.test(f.yourName + f.parentName + f.city + f.region + f.guardianName)
    };
    this.errors.set(e);
    return !Object.values(e).some(Boolean);
  }

  // ---------- Step 2: files ----------

  protected pick(slot: Slot, event: Event): void {
    const box = event.target as HTMLInputElement;
    const file = box.files?.[0];
    box.value = '';
    if (file) void this.setFile(slot, file);
  }

  protected dropFile(slot: Slot, event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(null);
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.setFile(slot, file);
  }

  protected fileIn(slot: Slot): Picked | undefined { return this.files()[slot]; }
  protected errorIn(slot: Slot): string { return this.fileError()[slot] ?? ''; }

  protected dragEnter(slot: Slot, event: DragEvent): void { event.preventDefault(); this.dragOver.set(slot); }

  private async setFile(slot: Slot, file: File): Promise<void> {
    if (slot === 'voice') { await this.setVoice(file); return; }
    const video = slot === 'video';
    const ok = (video ? VIDEO_TYPES : PHOTO_TYPES).includes(file.type) && file.size > 0 && file.size <= (video ? MAX_VIDEO : MAX_PHOTO);
    this.fileError.update(e => ({ ...e, [slot]: ok ? '' : video ? 'Choose an MP4, WebM or MOV video up to 50 MB.' : 'Choose a JPG, PNG or WebP photo up to 10 MB.' }));
    if (!ok) return;
    const url = URL.createObjectURL(file);
    if (video && (await this.videoSeconds(url)) > MAX_VIDEO_SECONDS + 1) {
      URL.revokeObjectURL(url);
      this.fileError.update(e => ({ ...e, video: 'Videos can be up to 60 seconds.' }));
      return;
    }
    this.clearFile(slot);
    this.files.update(f => ({ ...f, [slot]: { file, url } }));
  }

  // ---------- Voice note: record in the browser, or choose an audio file ----------

  protected readonly recording = signal(false);
  protected readonly recordSeconds = signal(0);
  private recorder: MediaRecorder | null = null;
  private recordTimer: ReturnType<typeof setInterval> | undefined;

  /** Recording works in this browser (it needs a microphone and MediaRecorder). */
  protected canRecord(): boolean {
    return typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;
  }

  protected async startRecording(): Promise<void> {
    this.fileError.update(e => ({ ...e, voice: '' }));
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.fileError.update(e => ({ ...e, voice: 'We couldn\'t use your microphone. Allow microphone access, or choose an audio file.' }));
      return;
    }
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      if (this.recorder !== rec) return;   // discarded
      this.recorder = null;
      const type = (rec.mimeType || 'audio/webm').split(';')[0];
      const ext = type === 'audio/mp4' ? 'm4a' : type === 'audio/ogg' ? 'ogg' : 'webm';
      void this.setVoice(new File(chunks, `voice-note.${ext}`, { type }), true);
    };
    this.recorder = rec;
    rec.start();
    this.recording.set(true);
    this.recordSeconds.set(0);
    this.recordTimer = setInterval(() => {
      this.recordSeconds.update(s => s + 1);
      if (this.recordSeconds() >= MAX_VOICE_SECONDS) this.stopRecording();   // up to 60 seconds
    }, 1000);
  }

  /** Stops recording and keeps the note (or throws it away when leaving the page). */
  protected stopRecording(discard = false): void {
    clearInterval(this.recordTimer);
    this.recording.set(false);
    const rec = this.recorder;
    if (!rec) return;
    if (discard) this.recorder = null;
    if (rec.state !== 'inactive') rec.stop();
  }

  protected timeText(seconds: number): string { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }

  private async setVoice(file: File, recorded = false): Promise<void> {
    const type = file.type.split(';')[0];
    if (!(VOICE_TYPES.includes(type) && file.size > 0 && file.size <= MAX_VOICE)) {
      this.fileError.update(e => ({ ...e, voice: 'Choose a voice note (audio) up to 5 MB.' }));
      return;
    }
    const url = URL.createObjectURL(file);
    // Recordings stop at 60 seconds by themselves; a chosen file is checked (0 = the browser can't tell)
    if (!recorded && (await this.mediaSeconds(url, 'audio')) > MAX_VOICE_SECONDS + 1) {
      URL.revokeObjectURL(url);
      this.fileError.update(e => ({ ...e, voice: 'Voice notes can be up to 60 seconds.' }));
      return;
    }
    this.fileError.update(e => ({ ...e, voice: '' }));
    this.clearFile('voice');
    this.files.update(f => ({ ...f, voice: { file, url } }));
  }

  /** The video's length (0 when the browser can't tell; the size limit still applies). */
  private videoSeconds(url: string): Promise<number> { return this.mediaSeconds(url, 'video'); }

  private mediaSeconds(url: string, kind: 'audio' | 'video'): Promise<number> {
    return new Promise(resolve => {
      const v = document.createElement(kind);
      v.preload = 'metadata';
      v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? v.duration : 0);
      v.onerror = () => resolve(0);
      v.src = url;
    });
  }

  protected clearFile(slot: Slot): void {
    const old = this.files()[slot];
    if (old) URL.revokeObjectURL(old.url);
    this.files.update(f => { const n = { ...f }; delete n[slot]; return n; });
  }

  protected openPicker(id: string): void { this.host.nativeElement.querySelector<HTMLInputElement>('#' + id)?.click(); }

  protected sizeText(bytes: number): string { return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.ceil(bytes / 1024) + ' KB'; }

  /** The files that will be sent (a hidden choice — e.g. a photo after switching to video — is left out). */
  private chosen(): Partial<Record<Slot, File>> {
    const f = this.files();
    return {
      main: this.showPhoto() ? f.main?.file : undefined,
      source: this.showPhoto() && this.form.kind === 'ai' ? f.source?.file : undefined,
      video: this.showVideo() ? f.video?.file : undefined,
      voice: this.showVoice() ? f.voice?.file : undefined,
      then: this.thenNow ? f.then?.file : undefined
    };
  }

  private checkStep2(): boolean {
    const c = this.chosen();
    const missing = !c.main && !c.video;
    this.fileError.update(e => ({
      ...e,
      [this.showPhoto() ? 'main' : 'video']: missing
        ? (this.family ? 'Add a family photo, a family video, or both.' : this.media() === 'video' ? 'Please add a video.' : 'Please add a photo.')
        : (e[this.showPhoto() ? 'main' : 'video'] ?? '')
    }));
    const noThen = this.thenNow && !c.then;
    if (noThen) this.fileError.update(e => ({ ...e, then: 'Add the old photo.' }));
    const years = this.thenNow && !!this.form.thenYear && !!this.form.nowYear && +this.form.thenYear > +this.form.nowYear;
    const badYear = this.thenNow && [this.form.thenYear, this.form.nowYear].some(y => !!y && !(+y >= 1900 && +y <= 2100));
    const markup = /[<>]/.test(this.form.message);
    this.errors.update(e => ({ ...e, message: markup, years: years || badYear }));
    return !missing && !markup && !noThen && !years && !badYear;
  }

  protected async copyPrompt(): Promise<void> {
    try { await navigator.clipboard.writeText(SAMPLE_PROMPT); this.copied.set(true); setTimeout(() => this.copied.set(false), 2500); }
    catch { window.prompt(this.i18n.t('Copy this prompt'), SAMPLE_PROMPT); }
  }

  // ---------- Steps ----------

  protected next(): void {
    if (this.step() === 1 && !this.checkStep1()) { this.focusFirstError(); return; }
    if (this.step() === 2 && !this.checkStep2()) return;
    this.go(this.step() + 1);
  }

  protected go(n: number): void {
    this.step.set(n);
    this.apiErrors.set([]);
    setTimeout(() => this.host.nativeElement.querySelector('.upload-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  private focusFirstError(): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.is-invalid, .invalid-msg')?.focus?.());
  }

  /** The review step's preview. */
  protected previewPhoto(): string | null { return this.showPhoto() ? this.files().main?.url ?? null : null; }
  protected previewVideo(): string | null { return this.showVideo() ? this.files().video?.url ?? null : null; }

  // ---------- Submit ----------

  protected submit(): void {
    const f = this.form;
    if (!(f.consentShown && f.consentOwn && f.consentTerms)) { this.consentError.set(true); return; }
    this.consentError.set(false);
    this.apiErrors.set([]);

    const body = new FormData();
    const add = (k: string, v: string | null | undefined) => { if (v !== null && v !== undefined && v !== '') body.append(k, v); };
    add('Kind', f.kind); add('YourName', f.yourName.trim()); add('ParentName', f.parentName.trim());
    add('Relation', this.family ? null : f.relation);
    add('FamilySize', this.family ? f.familySize : null); add('Generations', this.family ? f.generations : null);
    add('MemoryYear', f.kind === 'memory' ? f.memoryYear : null);
    add('CountryCode', f.countryCode); add('StateName', f.countryCode === 'IN' ? f.stateName : f.region.trim()); add('City', f.city.trim());
    add('IsAdult', String(f.adult === 'yes'));
    if (f.adult === 'no') {
      add('GuardianName', f.guardianName.trim()); add('GuardianCountryCode', f.guardianDial);
      add('GuardianMobile', f.guardianMobile.replace(/\D/g, '')); add('GuardianConsent', String(f.guardianConsent));
    }
    add('Message', f.message.trim());
    add('ConsentShown', 'true'); add('ConsentOwn', 'true'); add('ConsentTerms', 'true');
    const c = this.chosen();
    if (c.main) body.append('Photo', c.main, c.main.name);
    if (c.source) body.append('Source', c.source, c.source.name);
    if (c.video) body.append('Video', c.video, c.video.name);
    if (c.voice) body.append('Voice', c.voice, c.voice.name);
    if (c.then) body.append('Then', c.then, c.then.name);
    if (this.thenNow) { add('ThenYear', f.thenYear); add('NowYear', f.nowYear); }

    this.sending.set(true);
    this.progress.set(0);
    this.http.post<{ publicId: string; reference: string }>(`${environment.apiBaseUrl}/api/v1/selfies`, body, { reportProgress: true, observe: 'events' })
      .subscribe({
        next: ev => {
          if (ev.type === HttpEventType.UploadProgress && ev.total) this.progress.set(Math.round(100 * ev.loaded / ev.total));
          if (ev.type === HttpEventType.Response && ev.body) {
            this.sending.set(false);
            this.done.set({ reference: ev.body.reference, name: f.yourName.trim().split(/\s+/)[0], selfieId: ev.body.publicId, kind: f.kind, parentName: f.parentName.trim() });
            this.joinAlbum(ev.body.publicId);
            setTimeout(() => this.host.nativeElement.querySelector('.upload-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
          }
        },
        error: (e: HttpErrorResponse) => {
          this.sending.set(false);
          const p = e.error as ProblemDetails | null;
          const list = e.status === 0 ? ["We couldn't reach the server. Please check your connection and try again."]
            : e.status === 413 ? ['That file is too big. Photos can be up to 10 MB and videos up to 50 MB.']
            : p?.errors ? Object.values(p.errors).flat() : [p?.title ?? 'Something went wrong. Please try again.'];
          this.apiErrors.set(list.map(m => this.i18n.t(m)));
        }
      });
  }

  /** From an invite link: the new selfie goes into the family album (it shows there once approved). */
  private joinAlbum(selfieId: string): void {
    const code = this.albumCode();
    if (!code || !this.canAlbum(this.form.kind)) return;
    this.joining.set(true);
    this.http.post<{ publicId: string }>(`${environment.apiBaseUrl}/api/v1/albums/join`, { code, selfieId }).subscribe({
      next: r => { this.joining.set(false); this.joined.set(r.publicId); },
      error: (e: HttpErrorResponse) => {
        this.joining.set(false);
        this.joinError.set(this.i18n.t((e.error as ProblemDetails | null)?.title ?? 'Something went wrong. Please try again.'));
      }
    });
  }

  /** "Share another": a fresh form, keeping who you are and where you live. */
  protected again(): void {
    Object.keys(this.files()).forEach(s => this.clearFile(s as Slot));
    const keep = { yourName: this.form.yourName, countryCode: this.form.countryCode, stateName: this.form.stateName, region: this.form.region,
      city: this.form.city, adult: this.form.adult };
    this.form = { ...this.blankForm(), ...keep };
    this.fileError.set({});
    this.errors.set({});
    this.joined.set(null);
    this.joinError.set('');
    this.done.set(null);
    this.go(1);
  }
}
