import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { I18nService } from '../../core/i18n/i18n.service';
import { FRAME_DESIGNS, FRAME_PALETTES, FRAME_SHAPES, drawFrame } from './photo-frame';
import { Story } from './story';

const ID = 'd932059a-ec83-4b6c-b746-eb8582513d0d';

describe('Story page', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Story],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: ID })) } }]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(I18nService).setLanguage('en', false);
  });

  it('shows the approved photo, title, message, certificate and more stories from the same category', () => {
    const fixture = TestBed.createComponent(Story);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}`)).flush({
      tab: 'parent', item: { publicId: ID, kind: 'real', name: 'Kaushal with Mom and DAD', firstName: 'Kaushal', parentName: 'Mom and DAD',
        relation: 'Both parents', memoryYear: null, place: 'Bangaluru, Karnataka', message: 'Care for one another',
        approvedAtUtc: '2026-10-28T17:33:41', photoId: 'p1', videoId: null, voiceId: 'a1' }
    });
    const more = http.expectOne(r => r.url.endsWith('/api/v1/selfies/gallery'));
    expect(more.request.params.get('tab')).toBe('parent');
    more.flush({ items: [
      { publicId: ID, kind: 'real', firstName: 'Kaushal', parentName: 'Mom and DAD', photoId: 'p1' },
      { publicId: 'other', kind: 'real', firstName: 'Asha', parentName: 'Meena', photoId: 'p2', place: 'Kochi' }] });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Kaushal with Mom and DAD');
    expect(el.querySelector<HTMLImageElement>('.story-media img')?.src).toContain('/api/v1/selfies/files/p1');
    expect(el.querySelector('.story-quote')?.textContent).toContain('Care for one another');
    expect(el.querySelector('.story-meta')?.textContent).toContain('Bangaluru, Karnataka');
    expect(el.querySelector<HTMLAudioElement>('.voice-note audio')?.src).toContain('/api/v1/selfies/files/a1');
    expect(el.querySelector('.voice-note')?.textContent).toContain('A message from Mom and DAD');
    const tiles = el.querySelectorAll('.selfie-tile');
    expect(tiles.length).toBe(1);   // the current selfie isn't repeated
    expect(tiles[0].textContent).toContain('Asha with Meena');

    (el.querySelector('.story-actions .btn-accent') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.certificate .names')?.textContent).toContain('Kaushal with Mom and DAD');
    const cert = el.querySelector<HTMLElement>('.certificate')!;
    expect(cert.classList).toContain('with-photo');
    expect(cert.style.getPropertyValue('--cert-photo')).toContain('/api/v1/selfies/files/p1');
  });

  it('says "not found" when the selfie isn\'t approved (any more)', () => {
    const fixture = TestBed.createComponent(Story);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}`)).flush({ title: 'Selfie not found.' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Selfie not found');
  });

  it('links a photo selfie to its photo frame page', () => {
    const fixture = TestBed.createComponent(Story);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}`)).flush({
      tab: 'parent', item: { publicId: ID, kind: 'real', name: 'Kaushal with Mom', firstName: 'Kaushal', parentName: 'Mom',
        relation: 'Mother', memoryYear: null, place: 'Pune', message: 'Thank you', approvedAtUtc: '2026-10-28T17:33:41', photoId: 'p1', videoId: null }
    });
    http.match(() => true).forEach(r => r.flush({ items: [] }));
    fixture.detectChanges();
    const link = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('.story-actions a')].find(a => a.textContent?.includes('Photo frame'));
    expect(link?.getAttribute('href')).toBe(`/selfies/${ID}/frame`);
  });

  it('draws every design in every size with the photo, title, place and date, message and the site name', () => {
    const photo = document.createElement('canvas');
    photo.width = 300; photo.height = 400;
    for (const d of FRAME_DESIGNS) for (const shape of FRAME_SHAPES) {
      const ctx = document.createElement('canvas').getContext('2d')!;
      const drawn: string[] = [];
      spyOn(ctx, 'fillText').and.callFake((t: string) => { drawn.push(t); });
      const images = spyOn(ctx, 'drawImage');
      drawFrame(ctx, shape.w, shape.h, FRAME_PALETTES[1], photo,
        { title: 'Asha with Papa', line: 'Kochi · 28 October 2026', message: 'You taught me to be brave.', tag: '#SelfieWithParent', site: 'selfiewithparent.org' }, d.id);
      expect(images).toHaveBeenCalledTimes(1);
      expect(drawn).withContext(`${d.id} ${shape.id}`).toEqual(['Asha with Papa', 'Kochi · 28 October 2026', '“You taught me to be brave.”',
        'Selfie with Parent', '#SelfieWithParent  ·  selfiewithparent.org']);
    }
  });

  it('a winning selfie: trophy badge, Winner frame button and a certificate of achievement', () => {
    const fixture = TestBed.createComponent(Story);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith(`/api/v1/selfies/${ID}`)).flush({
      tab: 'parent', item: { publicId: ID, kind: 'real', name: 'Kaushal with Mom', firstName: 'Kaushal', parentName: 'Mom', relation: 'Mother',
        memoryYear: null, place: null, message: null, approvedAtUtc: '2026-10-28T17:33:41', photoId: 'p1', videoId: null, likes: 9, isWinner: true },
      wins: [{ publicId: 'w1', kind: 'week', title: 'Photo of the Week', startsAtUtc: '2026-10-26T00:00:00', endsAtUtc: '2026-11-02T00:00:00', decided: true }]
    });
    http.match(() => true).forEach(r => r.flush({ items: [] }));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.win-badge')?.textContent).toContain('Photo of the Week');
    expect(el.querySelector('.win-badge')?.textContent).toContain('1 Nov 2026');           // the last day, not the end
    const frame = [...el.querySelectorAll<HTMLAnchorElement>('.story-actions a')].find(a => a.getAttribute('href')?.endsWith('/frame'));
    expect(frame?.textContent).toContain('Winner frame');
    (el.querySelector('.story-actions .btn-accent') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.certificate h2')?.textContent).toContain('Certificate of Achievement');
    expect(el.querySelector('.certificate')?.textContent).toContain('winner of Photo of the Week');
  });
});
