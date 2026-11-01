import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { FramePage } from './frame-page';
import { FESTIVALS, FRAME_DESIGNS, FRAME_PALETTES, drawFrame, festivalsFor } from './photo-frame';

const ID = 'd932059a-ec83-4b6c-b746-eb8582513d0d';

describe('Photo frame page', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FramePage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: ID })) } }]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(I18nService).setLanguage('en', false);
  });

  it('is a page: a photo selfie gets the designs, colours and sizes, and the picture is ready to download', async () => {
    spyOn(window, 'createImageBitmap').and.callFake(() => Promise.resolve(Object.assign(document.createElement('canvas'), { close() {} }) as unknown as ImageBitmap));
    const fixture = TestBed.createComponent(FramePage);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}`)).flush({
      tab: 'parent', item: { publicId: ID, kind: 'real', name: 'Kaushal with Mom', firstName: 'Kaushal', parentName: 'Mom',
        relation: 'Mother', memoryYear: null, place: 'Pune', message: 'Thank you', approvedAtUtc: '2026-10-28T17:33:41', photoId: 'p1', videoId: null }
    });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Download a photo frame');
    expect(el.querySelector('.breadcrumb')?.textContent).toContain('Kaushal with Mom');
    http.expectOne(r => r.url.endsWith('/api/v1/selfies/files/p1') && r.params.get('use') === 'frame' && r.responseType === 'blob').flush(new Blob(['x'], { type: 'image/png' }));
    await new Promise(r => setTimeout(r, 50));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelectorAll('.frame-swatch').length).toBe(FRAME_PALETTES.length);
    expect(el.querySelectorAll('.frame-designs button').length).toBe(FRAME_DESIGNS.length);
    const canvas = el.querySelector<HTMLCanvasElement>('.frame-preview canvas')!;
    expect([canvas.width, canvas.height]).toEqual([1080, 1350]);   // portrait first
    [...el.querySelectorAll<HTMLButtonElement>('.frame-sizes button')].find(b => b.textContent?.includes('Story'))!.click();
    fixture.detectChanges();
    expect([canvas.width, canvas.height]).toEqual([1080, 1920]);
    expect(el.querySelector<HTMLButtonElement>('.frame-controls .btn-accent.w-100')!.disabled).toBeFalse();
  });

  it('Festivals & events: pick a country to see its festivals; the frame shows the greeting', async () => {
    spyOn(window, 'createImageBitmap').and.callFake(() => Promise.resolve(Object.assign(document.createElement('canvas'), { close() {} }) as unknown as ImageBitmap));
    const fixture = TestBed.createComponent(FramePage);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}`)).flush({
      item: { publicId: ID, kind: 'real', firstName: 'Asha', parentName: 'Papa', place: null, message: null, approvedAtUtc: '2026-10-28T17:33:41', photoId: 'p1' }
    });
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/selfies/files/p1')).flush(new Blob(['x'], { type: 'image/png' }));
    await new Promise(r => setTimeout(r, 50));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    [...el.querySelectorAll<HTMLButtonElement>('.frame-modes button')].find(b => b.textContent?.includes('Festivals'))!.click();
    fixture.detectChanges();
    expect(el.querySelector('.frame-designs')).toBeNull();          // a festival brings its own design and colours

    const select = el.querySelector<HTMLSelectElement>('#frameCountry')!;
    select.value = 'AE';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const names = [...el.querySelectorAll('.frame-festival')].map(b => b.textContent?.trim());
    expect(names).toContain('Eid');
    expect(names).toContain('Diwali');
    expect(names).not.toContain('Thanksgiving');

    const ctx = el.querySelector<HTMLCanvasElement>('.frame-preview canvas')!.getContext('2d')!;
    const drawn: string[] = [];
    spyOn(ctx, 'fillText').and.callFake((t: string) => { drawn.push(t); });
    [...el.querySelectorAll<HTMLButtonElement>('.frame-festival')].find(b => b.textContent?.includes('Eid'))!.click();
    fixture.detectChanges();
    expect(drawn).toContain('Eid Mubarak');
  });

  it('the selfie\'s owner can share the frame to the Photo Frames gallery (others can\'t)', async () => {
    spyOn(window, 'createImageBitmap').and.callFake(() => Promise.resolve(Object.assign(document.createElement('canvas'), { close() {} }) as unknown as ImageBitmap));
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'init').and.resolveTo();
    (auth.profile as unknown as { set(v: object): void }).set({ profileComplete: true });
    const fixture = TestBed.createComponent(FramePage);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}`)).flush({
      item: { publicId: ID, kind: 'real', firstName: 'Asha', parentName: 'Papa', place: null, message: null, approvedAtUtc: '2026-10-28T17:33:41', photoId: 'p1' }
    });
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/selfies/files/p1')).flush(new Blob(['x'], { type: 'image/png' }));
    await new Promise(r => setTimeout(r, 30));
    http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}/frames/mine`)).flush({ canShare: true, shared: [{ style: 'arch-brand', status: 'Approved' }] });
    await new Promise(r => setTimeout(r, 30));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.frame-share')?.textContent).toContain('This frame is in the Photo Frames gallery.');   // the first design + colour is shared already

    [...el.querySelectorAll<HTMLButtonElement>('.frame-modes button')].find(b => b.textContent?.includes('Festivals'))!.click();
    fixture.detectChanges();
    [...el.querySelectorAll<HTMLButtonElement>('.frame-festival')].find(b => b.textContent?.includes('Diwali'))!.click();
    fixture.detectChanges();
    const share = [...el.querySelectorAll<HTMLButtonElement>('.frame-share button')].find(b => b.textContent?.includes('Share to the Photo Frames gallery'))!;
    share.click();
    await new Promise(r => setTimeout(r, 100));
    const req = http.expectOne(r => r.method === 'POST' && r.url.endsWith(`/api/v1/selfies/${ID}/frames`));
    const body = req.request.body as FormData;
    expect(body.get('Style')).toBe('festival-diwali');
    expect(body.get('Festival')).toBe('diwali');
    expect((body.get('Picture') as File).type).toBe('image/jpeg');
    req.flush({ publicId: 'f1', reference: 'SWP-000009', status: 'Pending' }, { status: 201, statusText: 'Created' });
    await new Promise(r => setTimeout(r, 30));
    fixture.detectChanges();
    expect(el.querySelector('.frame-share')?.textContent).toContain('Our team will review it');
  });

  it('with auto-approve on, a shared frame is in the gallery straight away', async () => {
    spyOn(window, 'createImageBitmap').and.callFake(() => Promise.resolve(Object.assign(document.createElement('canvas'), { close() {} }) as unknown as ImageBitmap));
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'init').and.resolveTo();
    (auth.profile as unknown as { set(v: object): void }).set({ profileComplete: true });
    const fixture = TestBed.createComponent(FramePage);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}`)).flush({
      item: { publicId: ID, kind: 'real', firstName: 'Asha', parentName: 'Papa', place: null, message: null, approvedAtUtc: '2026-10-28T17:33:41', photoId: 'p1' }
    });
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/selfies/files/p1')).flush(new Blob(['x'], { type: 'image/png' }));
    await new Promise(r => setTimeout(r, 30));
    http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}/frames/mine`)).flush({ canShare: true, shared: [] });
    await new Promise(r => setTimeout(r, 30));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    [...el.querySelectorAll<HTMLButtonElement>('.frame-share button')].find(b => b.textContent?.includes('Share to the Photo Frames gallery'))!.click();
    await new Promise(r => setTimeout(r, 100));
    http.expectOne(r => r.method === 'POST' && r.url.endsWith(`/api/v1/selfies/${ID}/frames`))
      .flush({ publicId: 'f2', reference: 'SWP-000010', status: 'Approved' }, { status: 201, statusText: 'Created' });
    await new Promise(r => setTimeout(r, 30));
    fixture.detectChanges();
    expect(el.querySelector('.frame-share')?.textContent).toContain('This frame is in the Photo Frames gallery.');
  });

  it('someone else\'s selfie: no share button', async () => {
    spyOn(window, 'createImageBitmap').and.callFake(() => Promise.resolve(Object.assign(document.createElement('canvas'), { close() {} }) as unknown as ImageBitmap));
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'init').and.resolveTo();
    (auth.profile as unknown as { set(v: object): void }).set({ profileComplete: true });
    const fixture = TestBed.createComponent(FramePage);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}`)).flush({
      item: { publicId: ID, kind: 'real', firstName: 'Asha', parentName: 'Papa', place: null, message: null, approvedAtUtc: '2026-10-28T17:33:41', photoId: 'p1' }
    });
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/selfies/files/p1')).flush(new Blob(['x'], { type: 'image/png' }));
    await new Promise(r => setTimeout(r, 30));
    http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}/frames/mine`)).flush({ canShare: false, shared: [] });
    await new Promise(r => setTimeout(r, 30));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.frame-share button')).toBeNull();
    expect(el.querySelector('.frame-share')?.textContent).toContain('Only the person who shared this selfie');
    expect(el.querySelector('.frame-download button')).not.toBeNull();   // anyone can still download it
  });

  it('has festivals for every country in the list, and every festival draws in every size', () => {
    expect(festivalsFor('IN').map(f => f.id)).toEqual(jasmine.arrayContaining(['diwali', 'holi', 'durga', 'onam', 'eid', 'christmas']));
    expect(festivalsFor('US').map(f => f.id)).toEqual(jasmine.arrayContaining(['thanksgiving', 'christmas', 'easter']));
    expect(festivalsFor('JP').map(f => f.id)).toContain('keiro');
    const photo = document.createElement('canvas');
    for (const f of FESTIVALS) for (const [w, h] of [[1080, 1350], [1080, 1080], [1080, 1920]]) {
      const ctx = document.createElement('canvas').getContext('2d')!;
      const drawn: string[] = [];
      spyOn(ctx, 'fillText').and.callFake((t: string) => { drawn.push(t); });
      drawFrame(ctx, w, h, f.palette, photo, { title: 'Asha with Papa', line: 'Kochi', message: 'Thank you', tag: '#SelfieWithParent', site: 'x', greeting: f.greeting }, f.window, f);
      expect(drawn).withContext(`${f.id} ${w}x${h}`).toContain(f.greeting);
      expect(drawn).withContext(`${f.id} ${w}x${h}`).toContain('Asha with Papa');
    }
  });

  it('says "not found" for a video selfie (frames are for photos)', () => {
    const fixture = TestBed.createComponent(FramePage);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}`)).flush({
      tab: 'video', item: { publicId: ID, kind: 'real', firstName: 'Asha', parentName: 'Papa', place: null, message: null, approvedAtUtc: '2026-10-28T17:33:41', photoId: null }
    });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Photo frames are for approved photo selfies.');
    expect((fixture.nativeElement as HTMLElement).querySelector('canvas')).toBeNull();
  });

  it('a winning photo opens on the golden Winner frame', async () => {
    spyOn(window, 'createImageBitmap').and.callFake(() => Promise.resolve(Object.assign(document.createElement('canvas'), { close() {} }) as unknown as ImageBitmap));
    const fixture = TestBed.createComponent(FramePage);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}`)).flush({
      item: { publicId: ID, kind: 'real', firstName: 'Asha', parentName: 'Papa', place: null, message: null, approvedAtUtc: '2026-10-28T17:33:41', photoId: 'p1' },
      wins: [{ kind: 'week', title: 'Photo of the Week', startsAtUtc: '2026-10-26T00:00:00', endsAtUtc: '2026-11-02T00:00:00' }]
    });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const ctx = el.querySelector<HTMLCanvasElement>('.frame-preview canvas')!.getContext('2d')!;
    const drawn: string[] = [];
    spyOn(ctx, 'fillText').and.callFake((t: string) => { drawn.push(t); });
    http.expectOne(r => r.url.endsWith('/api/v1/selfies/files/p1')).flush(new Blob(['x'], { type: 'image/png' }));
    await new Promise(r => setTimeout(r, 50));
    fixture.detectChanges();
    const tab = el.querySelector('.frame-modes button');
    expect(tab?.textContent).toContain('Winner');
    expect(tab?.getAttribute('aria-selected')).toBe('true');
    expect(drawn).toContain('Photo of the Week · Winner');
  });
});
