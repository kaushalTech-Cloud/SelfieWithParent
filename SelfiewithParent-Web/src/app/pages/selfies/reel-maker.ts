import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, OnInit, PLATFORM_ID, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { FRAME_DESIGNS, FRAME_PALETTES, FrameDesign, FramePalette } from './frame-draw';
import { OUTRO, REEL_H, REEL_W, ReelStyle, drawReel } from './reel-draw';
import { REEL_TUNES, ReelTune, scheduleTune } from './reel-music';

/** Video types, best first: MP4 (H.264 + AAC) is what Instagram and WhatsApp want; WebM where a browser can't record MP4. */
const MIME_TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4',
  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

/**
 * Make a reel: the selfie, its voice note and music as a 9:16 video (1080 × 1920) for Instagram Reels and WhatsApp Status,
 * made in the visitor's browser (canvas + Web Audio + MediaRecorder; nothing is uploaded). About 10 seconds, or as long as
 * the voice note (up to 30). MP4 where the browser can record it; otherwise WebM, which the API turns into MP4 when it can.
 */
@Component({
  selector: 'app-reel-maker',
  imports: [TranslatePipe, RouterLink],
  template: `
    <div class="reel-layout">
      <div class="reel-preview">
        <div class="reel-stage">
        <canvas #canvas [width]="W" [height]="H" [attr.aria-label]="'Reel preview' | t" role="img"></canvas>
        @if (loading()) { <div class="reel-busy"><span class="spinner-border"></span></div> }
        @if (recording()) { <div class="reel-rec"><span class="dot"></span> {{ 'Making your reel…' | t }} {{ percent() }}%</div> }
        </div>
      </div>
      <div class="reel-controls">
        @if (!supported) {
          <div class="alert alert-warning small">{{ "This browser can't make videos. Please try Chrome, Edge or Safari." | t }}</div>
        }
        <h2 class="frame-label">{{ 'Style' | t }}</h2>
        <div class="reel-two">
          <button type="button" class="seg" [class.on]="style() === 'full'" [attr.aria-pressed]="style() === 'full'" (click)="style.set('full')"><i class="bi bi-image"></i> {{ 'Full photo' | t }}</button>
          <button type="button" class="seg" [class.on]="style() === 'framed'" [attr.aria-pressed]="style() === 'framed'" (click)="style.set('framed')"><i class="bi bi-bounding-box"></i> {{ 'In a frame' | t }}</button>
        </div>
        @if (style() === 'framed') {
          <h2 class="frame-label">{{ 'Design' | t }}</h2>
          <select class="form-select reel-select" [value]="design()" (change)="design.set($any($event.target).value)" [attr.aria-label]="'Design' | t">
            @for (d of designs; track d.id) { <option [value]="d.id">{{ d.name | t }}</option> }
          </select>
        }
        <h2 class="frame-label">{{ 'Colour' | t }}</h2>
        <div class="frame-swatches">
          @for (p of palettes; track p.id) {
            <button type="button" class="frame-swatch" [class.on]="p.id === palette().id" [attr.aria-pressed]="p.id === palette().id"
                    [attr.aria-label]="p.name | t" [title]="p.name | t" (click)="palette.set(p)"
                    [style.background]="'linear-gradient(135deg,' + p.bg[0] + ' 0 50%,' + p.accent + ' 50% 100%)'">@if (p.id === palette().id) { <i class="bi bi-check-lg"></i> }</button>
          }
        </div>
        <h2 class="frame-label">{{ 'Music' | t }}</h2>
        <div class="reel-tunes">
          @for (m of tunes; track m.id) {
            <button type="button" class="opt" [class.on]="tune() === m.id" [attr.aria-pressed]="tune() === m.id" (click)="tune.set(m.id)">
              <i class="bi" [class]="m.icon"></i><span>{{ m.name | t }}</span></button>
          }
        </div>
        <p class="reel-info">
          @if (voice()) { <i class="bi bi-mic-fill text-accent"></i> {{ 'With the voice note — the music goes quieter while it plays.' | t }} }
          @else { {{ 'Music only (this selfie has no voice note).' | t }} }
          · {{ seconds() }} {{ 'seconds' | t }}
        </p>

        <div class="reel-go">
          <button type="button" class="btn btn-outline-accent btn-lg" (click)="preview()" [disabled]="loading() || recording() || failed()">
            <i class="bi" [class.bi-play-fill]="!playing()" [class.bi-stop-fill]="playing()"></i> {{ (playing() ? 'Stop' : 'Preview') | t }}</button>
          <button type="button" class="btn btn-accent btn-lg" (click)="make()" [disabled]="loading() || recording() || failed() || !supported">
            <i class="bi bi-camera-reels"></i> {{ 'Make my reel' | t }}</button>
        </div>
        @if (failed()) { <div class="small text-danger mt-2" role="alert">{{ "We couldn't load the photo. Please try again." | t }}</div> }
        @if (error()) { <div class="small text-danger mt-2" role="alert">{{ error() }}</div> }

        @if (result(); as r) {
          <div class="reel-result">
            <video [src]="r.url" controls playsinline></video>
            <div class="d-flex flex-wrap gap-2 mt-2">
              <a class="btn btn-accent btn-sm" [href]="r.url" [download]="r.name"><i class="bi bi-download"></i> {{ 'Download reel' | t }}</a>
              @if (canShareFile()) { <button type="button" class="btn btn-outline-accent btn-sm" (click)="share()"><i class="bi bi-share"></i> {{ 'Share to Instagram or WhatsApp' | t }}</button> }
            </div>
            <!-- Post it to the Videos gallery: the selfie's owner only, reviewed first -->
            @if (selfieId()) {
              <div class="reel-post">
                @if (!auth.isSignedIn()) {
                  <p class="small text-muted mb-0"><i class="bi bi-collection-play"></i> {{ 'Is this your selfie?' | t }}
                    <a routerLink="/login" [queryParams]="{ returnUrl: '/selfies/' + selfieId() + '/reel' }">{{ 'Sign in to post it in the Videos gallery.' | t }}</a></p>
                } @else if (postState(); as st) {
                  @if (st.status === 'Approved') {
                    <div class="small text-success" role="status"><i class="bi bi-check-circle"></i> {{ 'Your reel is in the Videos gallery.' | t }}
                      <a routerLink="/selfies" [queryParams]="{ tab: 'video' }">{{ 'See it' | t }}</a></div>
                  } @else if (st.status === 'Pending') {
                    <div class="small text-success" role="status"><i class="bi bi-check-circle"></i> {{ 'Posted! Our team will review it before it shows in the Videos gallery.' | t }}</div>
                  } @else if (st.canShare) {
                    <button type="button" class="btn btn-outline-accent btn-sm" (click)="post()" [disabled]="posting()">
                      @if (posting()) { <span class="spinner-border spinner-border-sm"></span> } @else { <i class="bi bi-collection-play"></i> }
                      {{ 'Post to the Videos gallery' | t }}</button>
                    <p class="small text-muted mt-1 mb-0">{{ 'It shows in the Videos gallery straight away, with your first name, town and country.' | t }}</p>
                  } @else {
                    <p class="small text-muted mb-0"><i class="bi bi-info-circle"></i> {{ 'Only the person who shared this selfie can post its reel to the Videos gallery. You can still download it.' | t }}</p>
                  }
                  @if (postError()) { <div class="small text-danger mt-1" role="alert">{{ postError() }}</div> }
                }
              </div>
            }
            @if (!r.mp4) { <p class="small text-muted mt-2 mb-0">{{ 'This browser made a WebM video. WhatsApp takes it; for Instagram, make the reel in Chrome or Safari for an MP4.' | t }}</p> }
          </div>
        }
        <p class="reel-safe"><i class="bi bi-shield-check"></i> {{ 'Made on your device — nothing is uploaded.' | t }}</p>
      </div>
    </div>`,
  styles: `
    .reel-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: clamp(1rem, 3vw, 2rem); align-items: start; }
    .reel-preview { position: sticky; top: 90px; }
    .reel-stage { position: relative; display: flex; justify-content: center; padding: clamp(1rem, 3vw, 2rem); border-radius: 28px; border: 1px solid #efe4da;
      background: radial-gradient(circle at 20% 15%, rgba(244,185,66,.22), transparent 45%), radial-gradient(circle at 85% 85%, rgba(122,46,92,.16), transparent 45%), linear-gradient(135deg, #fff7f0, #f5eef3); }
    .reel-stage canvas { width: auto; max-width: 100%; max-height: 74vh; aspect-ratio: 9 / 16; border-radius: 22px; border: 6px solid #111; box-shadow: 0 26px 50px -22px rgba(40,20,10,.6); background: #0a3d3e; }
    .reel-busy { position: absolute; inset: 0; display: grid; place-items: center; border-radius: 28px; background: rgba(255,250,246,.5); }
    .reel-rec { position: absolute; top: 1.6rem; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,.7); color: #fff; padding: .35rem .9rem; border-radius: 999px; font-size: .85rem; white-space: nowrap; }
    .reel-rec .dot { display: inline-block; width: .6rem; height: .6rem; border-radius: 50%; background: #e63946; margin-right: .3rem; animation: blink 1s infinite; }
    @keyframes blink { 50% { opacity: .2; } }
    .reel-controls { background: #fff; border: 1px solid #f0e4da; border-radius: 24px; padding: clamp(1rem, 2.5vw, 1.6rem); box-shadow: 0 16px 40px -26px rgba(60,30,20,.35); }
    .frame-label { font-size: .78rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 1.3rem 0 .6rem; }
    .frame-label:first-of-type { margin-top: 0; }
    .reel-two { display: grid; grid-template-columns: 1fr 1fr; gap: .25rem; padding: .3rem; border-radius: 999px; background: #f6efe9; }
    .seg { border: 0; background: transparent; border-radius: 999px; padding: .55rem .6rem; font-weight: 600; font-size: .86rem; color: var(--ink); white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; transition: background .2s, color .2s, box-shadow .2s; }
    .seg.on { background: #fff; color: var(--accent); box-shadow: 0 4px 12px -4px rgba(60,30,20,.3); }
    .reel-select { border-radius: 14px; border-color: #efe4da; }
    .reel-tunes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .5rem; }
    .opt { display: flex; flex-direction: column; align-items: center; gap: .3rem; padding: .7rem .3rem; border-radius: 16px; border: 1px solid #efe4da; background: #fff;
      color: var(--ink); font-size: .78rem; font-weight: 600; line-height: 1.2; text-align: center; transition: border-color .15s, transform .15s; }
    .opt i { font-size: 1.3rem; color: var(--accent); }
    .opt:hover { border-color: var(--accent); transform: translateY(-1px); }
    .opt.on { border-color: var(--accent); background: #fff5ef; box-shadow: 0 0 0 2px var(--accent); }
    .frame-swatches { display: flex; flex-wrap: wrap; gap: .6rem; }
    .frame-swatch { width: 2.5rem; height: 2.5rem; border-radius: 50%; border: 3px solid #fff; padding: 0; box-shadow: 0 0 0 1px rgba(0,0,0,.12), 0 4px 10px -4px rgba(0,0,0,.3);
      display: grid; place-items: center; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.6); transition: transform .15s; }
    .frame-swatch:hover { transform: scale(1.08); }
    .frame-swatch.on { box-shadow: 0 0 0 3px var(--accent), 0 4px 10px -4px rgba(0,0,0,.3); }
    .reel-info { margin: .9rem 0 0; padding: .6rem .8rem; border-radius: 12px; background: #faf6f2; font-size: .84rem; color: var(--muted); }
    .reel-go { display: grid; grid-template-columns: 1fr 1.4fr; gap: .6rem; margin-top: 1.3rem; }
    .reel-go .btn { border-radius: 16px; font-weight: 700; }
    .reel-go .btn-accent { box-shadow: 0 12px 24px -12px var(--accent); }
    .reel-result { margin-top: 1.2rem; padding: 1rem; border-radius: 18px; background: #faf6f2; }
    .reel-result video { width: 100%; max-height: 50vh; border-radius: 14px; background: #000; }
    .reel-post { margin-top: .9rem; padding-top: .8rem; border-top: 1px dashed rgba(0,0,0,.15); }
    .reel-safe { margin: 1rem 0 0; font-size: .8rem; color: var(--muted); }
    .reel-safe i { color: #2a9d8f; }
    @media (max-width: 991.98px) {
      .reel-layout { grid-template-columns: 1fr; gap: 1rem; }
      .reel-preview { position: static; }
      .reel-stage canvas { max-height: 64vh; }
    }
    @media (max-width: 575.98px) {
      .reel-stage { border-radius: 20px; padding: .8rem; }
      .reel-controls { border-radius: 20px; }
      .reel-tunes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .reel-go { grid-template-columns: 1fr; }
    }
    @media (prefers-reduced-motion: reduce) { .opt, .frame-swatch, .seg { transition: none; } }
  `
})
export class ReelMaker implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly photoUrl = input.required<string>();
  readonly voiceUrl = input<string | null>(null);
  readonly title = input.required<string>();
  /** "Kochi, Kerala · 28 October 2026" */
  readonly line = input('');
  readonly message = input('');
  /** The selfie (to post the reel to the Videos gallery; its owner only). */
  readonly selfieId = input<string | null>(null);

  protected readonly auth = inject(AuthService);
  /** Whether I can post this selfie's reel, and my reel of it (Pending / Approved) if I already did. */
  protected readonly postState = signal<{ canShare: boolean; status: string | null } | null>(null);
  protected readonly posting = signal(false);
  protected readonly postError = signal('');

  protected readonly W = REEL_W;
  protected readonly H = REEL_H;
  protected readonly palettes = FRAME_PALETTES;
  protected readonly designs = FRAME_DESIGNS;
  protected readonly tunes = REEL_TUNES;
  protected readonly style = signal<ReelStyle>('full');
  protected readonly design = signal<FrameDesign>('arch');
  protected readonly palette = signal<FramePalette>(FRAME_PALETTES[0]);
  protected readonly tune = signal<ReelTune>('warm');
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly playing = signal(false);
  protected readonly recording = signal(false);
  protected readonly percent = signal(0);
  protected readonly error = signal('');
  protected readonly result = signal<{ url: string; name: string; mp4: boolean; blob: Blob } | null>(null);
  protected readonly supported = this.inBrowser && typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private photo: ImageBitmap | null = null;
  private voiceData: ArrayBuffer | null = null;
  protected readonly voice = signal(false);
  private voiceSeconds = 0;
  private audio: AudioContext | null = null;
  private stopRun: (() => void) | null = null;

  /** 10 seconds, or the voice note plus a little (up to 30). */
  protected readonly seconds = computed(() => this.voice() ? Math.round(Math.min(30, Math.max(10, this.voiceSeconds + 1 + OUTRO + 0.5))) : 10);

  constructor() {
    // Redraw the still picture when a choice changes (not while it's playing)
    effect(() => {
      this.style(); this.design(); this.palette();
      if (!this.playing() && !this.recording()) this.drawAt(3.2, null);
    });
  }

  async ngOnInit(): Promise<void> {
    if (!this.inBrowser) return;
    try {
      // Their own address (use=frame): the browser may hold copies without the CORS headers a canvas / audio needs
      const blob = await firstValueFrom(this.http.get(this.photoUrl(), { responseType: 'blob', params: { use: 'frame' } }));
      this.photo = await createImageBitmap(blob);
      const v = this.voiceUrl();
      if (v) {
        this.voiceData = await (await firstValueFrom(this.http.get(v, { responseType: 'blob', params: { use: 'frame' } }))).arrayBuffer();
        this.voiceSeconds = (await this.decode()).duration;
        this.voice.set(true);
      }
      await document.fonts?.load(`700 64px "Playfair Display"`).catch(() => undefined);
      void this.loadPostState();
    } catch {
      this.failed.set(!this.photo);
    } finally {
      this.loading.set(false);
      this.drawAt(3.2, null);
    }
  }

  ngOnDestroy(): void {
    this.stopRun?.();
    void this.audio?.close();
    const r = this.result();
    if (r) URL.revokeObjectURL(r.url);
  }

  private ctx(): AudioContext {
    this.audio ??= new AudioContext();
    return this.audio;
  }

  private async decode(): Promise<AudioBuffer> {
    return this.ctx().decodeAudioData(this.voiceData!.slice(0));
  }

  private text() {
    return { title: this.title(), line: this.line(), message: this.message(), tag: '#SelfieWithParent',
      site: environment.siteUrl.replace(/^https?:\/\/(www\.)?/, '') };
  }

  private drawAt(t: number, level: number | null): void {
    const el = this.canvas()?.nativeElement, ctx = el?.getContext('2d');
    if (!ctx) return;
    drawReel(ctx, t, this.seconds(), { style: this.style(), palette: this.palette(), design: this.design(), photo: this.photo, text: this.text(), level });
  }

  /**
   * Plays the reel once: music and voice through <paramref name="out"/> (and the speakers), the canvas animating with the
   * audio clock. Resolves when it ends (or is stopped).
   */
  private async run(out: AudioNode | null): Promise<void> {
    const ctx = this.ctx();
    await ctx.resume();
    const duration = this.seconds(), t0 = ctx.currentTime + 0.15;
    const outputs: AudioNode[] = [ctx.destination, ...(out ? [out] : [])];
    const music = ctx.createGain();
    music.gain.value = 0.55;
    outputs.forEach(o => music.connect(o));
    scheduleTune(ctx, music, this.tune(), t0, duration);

    let analyser: AnalyserNode | null = null;
    const voiceStart = t0 + 1;
    if (this.voice()) {
      const buffer = await this.decode();
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 1;
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(gain).connect(analyser);
      outputs.forEach(o => gain.connect(o));
      src.start(voiceStart, 0, Math.min(buffer.duration, duration - OUTRO - 1));
      // The music steps back while the voice plays
      const end = Math.min(voiceStart + buffer.duration, t0 + duration - OUTRO);
      music.gain.setValueAtTime(0.55, voiceStart - 0.3);
      music.gain.linearRampToValueAtTime(0.14, voiceStart);
      music.gain.setValueAtTime(0.14, end);
      music.gain.linearRampToValueAtTime(0.55, end + 0.5);
    }
    const samples = new Uint8Array(analyser?.fftSize ?? 0);
    await new Promise<void>(done => {
      let stopped = false;
      this.stopRun = () => { stopped = true; music.disconnect(); done(); };
      const frame = () => {
        const t = ctx.currentTime - t0;
        let level: number | null = null;
        if (analyser) {
          analyser.getByteTimeDomainData(samples);
          let peak = 0;
          for (const v of samples) peak = Math.max(peak, Math.abs(v - 128));
          level = Math.min(1, peak / 64);
        }
        this.drawAt(Math.max(0, t), level);
        this.percent.set(Math.min(100, Math.round(t / duration * 100)));
        if (stopped) return;
        if (t >= duration) { this.stopRun = null; done(); return; }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  protected async preview(): Promise<void> {
    if (this.playing()) { this.stopRun?.(); return; }
    this.playing.set(true);
    try { await this.run(null); } finally { this.playing.set(false); this.drawAt(3.2, null); }
  }

  /** Records the reel in real time and offers it to download / share. */
  protected async make(): Promise<void> {
    const el = this.canvas()?.nativeElement;
    if (!el) return;
    this.error.set('');
    this.recording.set(true);
    this.percent.set(0);
    try {
      const ctx = this.ctx();
      const audioOut = ctx.createMediaStreamDestination();
      const stream = new MediaStream([...el.captureStream(30).getVideoTracks(), ...audioOut.stream.getAudioTracks()]);
      const mime = MIME_TYPES.find(m => MediaRecorder.isTypeSupported(m)) ?? '';
      const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise<void>(r => (rec.onstop = () => r()));
      rec.start(250);
      await this.run(audioOut);
      await new Promise(r => setTimeout(r, 200));
      rec.stop();
      await stopped;
      stream.getTracks().forEach(t => t.stop());
      let blob = new Blob(chunks, { type: (rec.mimeType || mime || 'video/webm').split(';')[0] });
      let mp4 = blob.type === 'video/mp4';
      if (!mp4) {
        // Ask the API to turn the WebM into MP4 (for Instagram); keep the WebM if it can't
        try {
          const body = new FormData();
          body.append('Video', new File([blob], 'reel.webm', { type: 'video/webm' }));
          blob = await firstValueFrom(this.http.post(`${environment.apiBaseUrl}/api/v1/reels/convert`, body, { responseType: 'blob' }));
          mp4 = true;
        } catch { /* WebM it is */ }
      }
      const old = this.result();
      if (old) URL.revokeObjectURL(old.url);
      const name = `selfie-with-parent-reel.${mp4 ? 'mp4' : 'webm'}`;
      this.result.set({ url: URL.createObjectURL(blob), name, mp4, blob });
    } catch {
      this.error.set(this.i18n.t("We couldn't make the reel in this browser. Please try Chrome, Edge or Safari."));
    } finally {
      this.recording.set(false);
      this.drawAt(3.2, null);
    }
  }

  private async loadPostState(): Promise<void> {
    const id = this.selfieId();
    if (!id) return;
    await this.auth.init();
    if (!this.auth.isSignedIn()) return;
    try { this.postState.set(await firstValueFrom(this.http.get<{ canShare: boolean; status: string | null }>(`${environment.apiBaseUrl}/api/v1/selfies/${id}/reel/mine`))); }
    catch { /* no post button */ }
  }

  /** Posts the finished reel: it's in Selfies › Videos straight away. */
  protected async post(): Promise<void> {
    const r = this.result(), id = this.selfieId();
    if (!r || !id) return;
    this.posting.set(true);
    this.postError.set('');
    try {
      const body = new FormData();
      body.append('Video', new File([r.blob], r.name, { type: r.blob.type }));
      await firstValueFrom(this.http.post(`${environment.apiBaseUrl}/api/v1/selfies/${id}/reel`, body));
      this.postState.set({ canShare: true, status: 'Approved' });   // shown straight away
    } catch (e) {
      const err = e instanceof HttpErrorResponse ? e.error as { title?: string; errors?: Record<string, string[]> } | null : null;
      this.postError.set(this.i18n.t(err?.errors ? Object.values(err.errors).flat()[0] : err?.title ?? "We couldn't post it. Please try again."));
    } finally {
      this.posting.set(false);
    }
  }

  protected canShareFile(): boolean {
    const r = this.result();
    return !!r && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([r.blob], r.name, { type: r.blob.type })] });
  }

  protected async share(): Promise<void> {
    const r = this.result();
    if (!r) return;
    try { await navigator.share({ files: [new File([r.blob], r.name, { type: r.blob.type })], title: this.title(), text: `${this.title()} #SelfieWithParent` }); }
    catch { /* closed */ }
  }
}
