import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { By } from '@angular/platform-browser';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { ReelMaker } from './reel-maker';
import { FRAME_PALETTES } from './frame-draw';
import { OUTRO, REEL_H, REEL_W, drawReel } from './reel-draw';
import { ReelPage } from './reel-page';
import { scheduleTune } from './reel-music';

const ID = 'd932059a-ec83-4b6c-b746-eb8582513d0d';
const text = { title: 'Asha with Papa', line: 'Kochi · 28 October 2026', message: 'You taught me to be brave.', tag: '#SelfieWithParent', site: 'selfiewithparent.org' };

describe('Reels', () => {
  function drawn(t: number, style: 'full' | 'framed', level: number | null = null): string[] {
    const ctx = document.createElement('canvas').getContext('2d')!;
    const out: string[] = [];
    spyOn(ctx, 'fillText').and.callFake((s: string) => { out.push(s); });
    const photo = document.createElement('canvas');
    photo.width = 600; photo.height = 800;
    drawReel(ctx, t, 10, { style, palette: FRAME_PALETTES[0], design: 'arch', photo, text, level });
    return out;
  }

  it('full photo: the name, place and message appear one after another; the closing card at the end', () => {
    expect(drawn(3, 'full')).toEqual(jasmine.arrayContaining(['Selfie with Parent', 'Asha with Papa', 'Kochi · 28 October 2026', '“You taught me to be brave.”']));
    const end = drawn(10 - OUTRO + 1, 'full');
    expect(end.filter(s => s === 'Selfie with Parent').length).toBe(2);   // the brand, and the closing card's big title
    expect(end).toContain('#SelfieWithParent');
  });

  it('in a frame: the photo frame, with a sound wave while the voice plays', () => {
    expect(drawn(4, 'framed', 0.8)).toEqual(jasmine.arrayContaining(['Asha with Papa', 'Selfie with Parent']));
    expect(REEL_W / REEL_H).toBeCloseTo(9 / 16, 3);
  });

  it('music: notes are scheduled for the whole reel, none after it ends', () => {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const starts: number[] = [];
    const real = ctx.createOscillator.bind(ctx);
    spyOn(ctx, 'createOscillator').and.callFake(() => { const o = real(); const start = o.start.bind(o); o.start = (w?: number) => { starts.push(w ?? 0); start(w); }; return o; });
    scheduleTune(ctx, ctx.destination, 'warm', 0, 10);
    expect(starts.length).toBeGreaterThan(30);
    expect(Math.max(...starts)).toBeLessThan(10);
    starts.length = 0;
    scheduleTune(ctx, ctx.destination, 'none', 0, 10);
    expect(starts.length).toBe(0);
  });

  describe('page', () => {
    let http: HttpTestingController;
    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [ReelPage],
        providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
          { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: ID })) } }]
      }).compileComponents();
      http = TestBed.inject(HttpTestingController);
      TestBed.inject(I18nService).setLanguage('en', false);
    });

    it('a photo selfie with a voice note: loads the photo and the voice for the reel', async () => {
      const fixture = TestBed.createComponent(ReelPage);
      fixture.detectChanges();
      http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}`)).flush({ item: { publicId: ID, kind: 'real', firstName: 'Asha', parentName: 'Papa',
        place: 'Kochi', message: 'Thank you', approvedAtUtc: '2026-10-28T10:00:00', photoId: 'p1', voiceId: 'v1' } });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('h1')?.textContent).toContain('Make a reel');
      expect(el.querySelector('app-reel-maker')).not.toBeNull();
      http.expectOne(r => r.url.endsWith('/api/v1/selfies/files/p1') && r.params.get('use') === 'frame').flush(new Blob(['x'], { type: 'image/png' }));
      expect(el.querySelectorAll('.reel-tunes button').length).toBe(4);
    });

    it('the owner posts the finished reel: it is in the Videos gallery straight away', async () => {
      spyOn(window, 'createImageBitmap').and.callFake(() => Promise.resolve(Object.assign(document.createElement('canvas'), { close() {} }) as unknown as ImageBitmap));
      const auth = TestBed.inject(AuthService);
      spyOn(auth, 'init').and.resolveTo();
      (auth.profile as unknown as { set(v: object): void }).set({ profileComplete: true });
      const fixture = TestBed.createComponent(ReelPage);
      fixture.detectChanges();
      http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}`)).flush({ item: { publicId: ID, kind: 'real', firstName: 'Asha', parentName: 'Papa',
        place: null, message: null, approvedAtUtc: '2026-10-28T10:00:00', photoId: 'p1', voiceId: null } });
      fixture.detectChanges();
      http.expectOne(r => r.url.endsWith('/api/v1/selfies/files/p1')).flush(new Blob(['x'], { type: 'image/png' }));
      await new Promise(r => setTimeout(r, 30));
      http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}/reel/mine`)).flush({ canShare: true, status: null });
      await new Promise(r => setTimeout(r, 10));
      const maker = fixture.debugElement.query(By.directive(ReelMaker)).componentInstance as unknown as { result: { set(v: object): void } };
      const blob = new Blob(['mp4'], { type: 'video/mp4' });
      maker.result.set({ url: 'blob:x', name: 'selfie-with-parent-reel.mp4', mp4: true, blob });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      [...el.querySelectorAll<HTMLButtonElement>('.reel-post button')].find(b => b.textContent?.includes('Post to the Videos gallery'))!.click();
      const post = http.expectOne(r => r.method === 'POST' && r.url.endsWith(`/api/v1/selfies/${ID}/reel`));
      expect(((post.request.body as FormData).get('Video') as File).type).toBe('video/mp4');
      post.flush({ publicId: 'r1', reference: 'SWP-000050' }, { status: 201, statusText: 'Created' });
      await new Promise(r => setTimeout(r, 10));
      fixture.detectChanges();
      expect(el.querySelector('.reel-post')?.textContent).toContain('Your reel is in the Videos gallery.');
    });

    it('a video selfie has no reel', () => {
      const fixture = TestBed.createComponent(ReelPage);
      fixture.detectChanges();
      http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}`)).flush({ item: { publicId: ID, kind: 'real', firstName: 'A', parentName: 'B', place: null,
        message: null, approvedAtUtc: '2026-10-28T10:00:00', photoId: null } });
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Reels are for approved photo selfies.');
    });
  });
});
