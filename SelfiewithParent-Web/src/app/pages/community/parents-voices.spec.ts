import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { I18nService } from '../../core/i18n/i18n.service';
import { ParentStoryShare } from './parent-story-share';
import { ParentStoryPage } from './parent-story';
import { ParentsVoices } from './parents-voices';

const ID = '0b1e0b1e-0000-4000-8000-000000000001';
const story = (o: object = {}) => ({
  publicId: ID, writtenBy: 'parent', parentRole: 'mother', shownName: 'Kamala', age: 72, place: 'Kochi, Kerala', countryCode: 'IN',
  title: 'His room is still the same', story: 'My son moved to the city ten years ago. He calls on Diwali, sometimes. I keep his room the way he left it.',
  wish: 'Just call me on Sunday.', approvedAtUtc: '2026-10-30T10:00:00', photoId: 'p1', videoId: null, voiceId: 'v1', isFeatured: false, loves: 3, ...o
});

describe("Parents' Voices", () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParentsVoices, ParentStoryPage, ParentStoryShare],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: ID })) } }]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(I18nService).setLanguage('en', false);
  });

  it('lists the stories: the featured one on top, anonymous parents unnamed, never blank', () => {
    const fixture = TestBed.createComponent(ParentsVoices);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/parent-stories')).flush({ total: 2, items: [
      story({ publicId: 'a', isFeatured: true }),
      story({ publicId: 'b', shownName: null, age: null, parentRole: 'father', photoId: null, title: 'The man on the bench' })] });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('waiting for a call');
    expect(el.querySelector('.pv-featured')?.textContent).toContain('Kamala, 72');
    expect(el.querySelector('.pv-featured')?.getAttribute('href')).toBe('/parents-voices/a');
    const cards = el.querySelectorAll('.pv-card');
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain('A father');
    expect(cards[0].querySelector('.pv-ph')).not.toBeNull();                // no photo: a warm placeholder
    expect(el.querySelector('a[href="tel:14567"]')).not.toBeNull();          // help for a parent living alone
  });

  it('a story: their words, their wish, the voice note, and send love (sign in first)', () => {
    const fixture = TestBed.createComponent(ParentStoryPage);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith(`/api/v1/parent-stories/${ID}`)).flush(story());
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('His room is still the same');
    expect(el.querySelector('.pv-text')?.textContent).toContain('I keep his room');
    expect(el.querySelector('.pv-wish')?.textContent).toContain('Just call me on Sunday.');
    expect(el.querySelector<HTMLAudioElement>('.pv-voice audio')?.src).toContain('/api/v1/parent-stories/files/v1');
    expect(el.querySelector('.pv-written')?.textContent).toContain('In their own words');
    expect(el.querySelector('.pv-love-btn')?.textContent).toContain('3');
  });

  it('share: checks the form first, then sends it for review', () => {
    const fixture = TestBed.createComponent(ParentStoryShare);
    fixture.detectChanges();
    const c = fixture.componentInstance as unknown as { f: Record<string, unknown>; submit(): void; error(): string; done(): string | null };
    c.submit();
    expect(c.error()).toContain('Add a name');
    Object.assign(c.f, { shownName: 'Kamala', title: 'His room', story: 'My son moved to the city ten years ago. He calls on Diwali, sometimes.',
      consentParent: true, consentTerms: true, countryCode: 'IN', city: 'Kochi' });
    c.submit();
    const req = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/api/v1/parent-stories'));
    const body = req.request.body as FormData;
    expect(body.get('ShownName')).toBe('Kamala');
    expect(body.get('WrittenBy')).toBe('parent');
    expect(body.get('Photo')).toBeNull();
    req.flush({ publicId: ID, reference: 'PV-000001' });
    fixture.detectChanges();
    expect(c.done()).toBe('PV-000001');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('PV-000001');
  });
});
