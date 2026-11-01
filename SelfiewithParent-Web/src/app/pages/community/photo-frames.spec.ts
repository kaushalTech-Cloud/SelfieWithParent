import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { I18nService } from '../../core/i18n/i18n.service';
import { PhotoFrames } from './photo-frames';

describe('Photo Frames gallery', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PhotoFrames],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(I18nService).setLanguage('en', false);
  });

  it('shows the approved frames and filters by country and festival', () => {
    const fixture = TestBed.createComponent(PhotoFrames);
    fixture.detectChanges();
    const first = http.expectOne(r => r.url.endsWith('/api/v1/selfies/frames'));
    expect(first.request.params.get('country')).toBeNull();
    first.flush({ total: 2, items: [
        { publicId: 'f1', name: 'Asha with Meena', place: 'Dubai', countryCode: 'AE', festival: 'eid', style: 'festival-eid', approvedAtUtc: '2026-10-28T10:00:00', photoId: 'p1', storyId: 's1' },
        { publicId: 'f2', name: 'Ravi with Papa', place: null, countryCode: 'IN', festival: null, style: 'arch-marigold', approvedAtUtc: '2026-10-27T10:00:00', photoId: 'p2', storyId: null }],
      countries: [{ key: 'AE', count: 1 }, { key: 'IN', count: 1 }], festivals: [{ key: 'eid', count: 1 }, { key: 'everyday', count: 1 }] });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const cards = el.querySelectorAll('.frame-card');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Asha with Meena');
    expect(cards[0].textContent).toContain('Eid');
    expect(cards[0].querySelector('a')?.getAttribute('href')).toBe('/selfies/s1');      // links to the selfie's story
    expect(cards[0].querySelector('img')?.getAttribute('src')).toContain('/api/v1/selfies/files/p1');
    expect(cards[1].textContent).toContain('Everyday frame');
    expect(cards[1].querySelector('a[href^="/selfies"]')).toBeNull();                  // its selfie isn't shown any more
    expect(cards[0].querySelector('.ls-count')?.textContent).toBe('0');                   // like count
    expect([...el.querySelectorAll('#fFestival option')].map(o => o.textContent?.trim())).toContain('Eid (1)');

    const country = el.querySelector<HTMLSelectElement>('#fCountry')!;
    country.value = 'AE';
    country.dispatchEvent(new Event('change'));
    const byCountry = http.expectOne(r => r.url.endsWith('/api/v1/selfies/frames'));
    expect(byCountry.request.params.get('country')).toBe('AE');
    byCountry.flush({ total: 1, items: [], countries: [{ key: 'AE', count: 1 }], festivals: [{ key: 'eid', count: 1 }] });
    fixture.detectChanges();
    const festival = el.querySelector<HTMLSelectElement>('#fFestival')!;
    festival.value = 'eid';
    festival.dispatchEvent(new Event('change'));
    const both = http.expectOne(r => r.url.endsWith('/api/v1/selfies/frames'));
    expect(both.request.params.get('country')).toBe('AE');
    expect(both.request.params.get('festival')).toBe('eid');
    both.flush({ total: 0, items: [], countries: [], festivals: [] });
    fixture.detectChanges();
    expect(el.textContent).toContain('No photo frames here yet.');
  });
});
