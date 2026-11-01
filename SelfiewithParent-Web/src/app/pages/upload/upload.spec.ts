import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { Upload } from './upload';

describe('Share a selfie', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Upload],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(I18nService).setLanguage('en', false);
  });

  // The component's state, for the test (the template drives it the same way)
  const state = (c: Upload) => c as unknown as {
    form: Record<string, unknown>; step: () => number; next(): void; errors: () => Record<string, boolean>;
    files: { set(v: unknown): void }; submit(): void; done: () => { reference: string } | null; consentError: () => boolean;
  };

  it('needs a parent / guardian for under-18s before moving on', () => {
    const c = state(TestBed.createComponent(Upload).componentInstance);
    Object.assign(c.form, { yourName: 'Asha', parentName: 'Meena', relation: 'Mother', countryCode: 'IN', stateName: 'Kerala', adult: 'no' });
    c.next();
    expect(c.step()).toBe(1);
    expect(c.errors()['guardianName']).toBeTrue();
    expect(c.errors()['guardianConsent']).toBeTrue();
    Object.assign(c.form, { guardianName: 'Kavita', guardianDial: '+91', guardianMobile: '98765 43210', guardianConsent: true });
    c.next();
    expect(c.step()).toBe(2);
  });

  it('sends the details and the photo to the API and shows the reference', () => {
    const c = state(TestBed.createComponent(Upload).componentInstance);
    Object.assign(c.form, { yourName: 'Asha Nair', parentName: 'Meena', relation: 'Mother', countryCode: 'IN', stateName: 'Kerala', adult: 'yes',
      message: 'She taught me to read.' });
    const photo = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'me.png', { type: 'image/png' });
    const voice = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], 'voice-note.webm', { type: 'audio/webm' });
    c.files.set({ main: { file: photo, url: 'blob:x' }, video: { file: new File(['x'], 'v.mp4', { type: 'video/mp4' }), url: 'blob:y' }, voice: { file: voice, url: 'blob:z' } });

    c.submit();
    expect(c.consentError()).toBeTrue();   // consents first
    Object.assign(c.form, { consentShown: true, consentOwn: true, consentTerms: true });
    c.submit();

    const req = http.expectOne(r => r.url.endsWith('/api/v1/selfies') && r.method === 'POST');
    const body = req.request.body as FormData;
    expect(body.get('Kind')).toBe('real');
    expect(body.get('Relation')).toBe('Mother');
    expect(body.get('IsAdult')).toBe('true');
    expect(body.get('GuardianName')).toBeNull();
    expect((body.get('Photo') as File).name).toBe('me.png');
    expect(body.get('Video')).toBeNull();   // a photo was chosen, so the video is left out
    expect((body.get('Voice') as File).name).toBe('voice-note.webm');   // voice note goes with a photo
    req.flush({ publicId: 'p', reference: 'SWP-000042' });
    expect(c.done()?.reference).toBe('SWP-000042');
  });

  it('from a family album invite: fills in the parent, adds the selfie to the album, and the invite card waits until it is in', () => {
    const fixture = TestBed.createComponent(Upload);
    const c = fixture.componentInstance as unknown as ReturnType<typeof state> & {
      openAlbum(code: string): void; kinds: { code: string }[]; joining: () => boolean; joined: () => string | null; again(): void; albumCode: () => string | null;
    };
    c.openAlbum('abcde23456');
    expect(c.kinds.some(k => k.code === 'family')).toBeFalse();
    http.expectOne(r => r.url.endsWith('/api/v1/albums/invite/abcde23456')).flush({ publicId: 'a1', parentName: 'Meena', relation: 'Mother', members: 1, selfies: 1, createdAtUtc: '', items: [] });
    expect(c.form['parentName']).toBe('Meena');
    expect(c.form['relation']).toBe('Mother');

    Object.assign(c.form, { yourName: 'Ravi Nair', countryCode: 'IN', stateName: 'Kerala', adult: 'yes', consentShown: true, consentOwn: true, consentTerms: true });
    c.files.set({ main: { file: new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'me.png', { type: 'image/png' }), url: 'blob:x' } });
    c.submit();
    http.expectOne(r => r.url.endsWith('/api/v1/selfies') && r.method === 'POST').flush({ publicId: 'p2', reference: 'SWP-000043' });
    const join = http.expectOne(r => r.url.endsWith('/api/v1/albums/join'));
    expect(join.request.body).toEqual({ code: 'abcde23456', selfieId: 'p2' });
    expect(c.joining()).toBeTrue();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-album-invite')).toBeNull();   // no "Get my invite link" while it joins
    join.flush({ publicId: 'a1' });
    expect(c.joined()).toBe('a1');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.album-joined')?.textContent).toContain('family album');
    expect(el.querySelector('.ai-link input')).not.toBeNull();   // the same album's link, ready to send on

    c.again();
    expect(c.joined()).toBeNull();
  });

  it('an invite link that no longer works: an ordinary upload with every photo type', () => {
    const c = TestBed.createComponent(Upload).componentInstance as unknown as { openAlbum(code: string): void; kinds: { code: string }[]; albumCode: () => string | null };
    c.openAlbum('zzzzzzzzzz');
    http.expectOne(r => r.url.endsWith('/api/v1/albums/invite/zzzzzzzzzz')).flush({ title: 'Family album not found.' }, { status: 404, statusText: 'Not Found' });
    expect(c.albumCode()).toBeNull();
    expect(c.kinds.some(k => k.code === 'family')).toBeTrue();
  });

  it('offers the voice note only with a photo (not with a video or a family share)', () => {
    const c = TestBed.createComponent(Upload).componentInstance as unknown as { form: { kind: string }; media: { set(v: string): void }; showVoice(): boolean };
    c.form.kind = 'ai';
    expect(c.showVoice()).toBeTrue();
    c.media.set('video');
    expect(c.showVoice()).toBeFalse();
    c.media.set('photo');
    c.form.kind = 'family';
    expect(c.showVoice()).toBeFalse();
  });

  it("doesn't ask for the place again: it comes from the visitor's last upload, with Change to edit it", () => {
    (TestBed.inject(AuthService).profile as unknown as { set(v: object): void }).set({ fullName: 'Asha Nair', countryCode: null, stateName: null, city: null, profileComplete: true });
    const fixture = TestBed.createComponent(Upload);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/selfies/mine/place')).flush({ countryCode: 'IN', stateName: 'Kerala', city: 'Kochi' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#country')).toBeNull();
    expect(el.querySelector('#city')).toBeNull();
    expect(el.querySelector('.place-known')?.textContent).toContain('Kochi, Kerala, India');
    const c = state(fixture.componentInstance);
    expect(c.form['stateName']).toBe('Kerala');

    (el.querySelector('.place-known button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('#country')).not.toBeNull();     // Change: the fields come back, filled in
  });

  it('asks for the place when it is not known yet (first upload, no place in the profile)', () => {
    (TestBed.inject(AuthService).profile as unknown as { set(v: object): void }).set({ fullName: 'Asha', countryCode: null, stateName: null, city: null, profileComplete: true });
    const fixture = TestBed.createComponent(Upload);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/selfies/mine/place')).flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.place-known')).toBeNull();
    expect(el.querySelector('#country')).not.toBeNull();
  });
});
