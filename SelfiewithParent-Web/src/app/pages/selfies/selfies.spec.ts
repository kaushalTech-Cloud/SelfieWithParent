import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { I18nService } from '../../core/i18n/i18n.service';
import { Selfies } from './selfies';

describe('Latest selfies', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Selfies],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({ tab: 'family', page: '1' })) } }]
    }).compileComponents();
    TestBed.inject(I18nService).setLanguage('en', false);
  });

  it('titles a selfie with the parent name as typed, e.g. "Kaushal with Mom and DAD"', () => {
    const c = TestBed.createComponent(Selfies).componentInstance as unknown as { title(s: object): string };
    expect(c.title({ kind: 'real', firstName: 'Kaushal', parentName: 'Mom and DAD' })).toBe('Kaushal with Mom and DAD');
    expect(c.title({ kind: 'family', firstName: 'Asha', parentName: 'The Nairs' })).toBe('The Nairs');
  });

  it('shows the approved selfies of the chosen tab, with photos and videos from the API', () => {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Selfies);
    fixture.detectChanges();
    const req = http.expectOne(r => r.url.endsWith('/api/v1/selfies/gallery'));
    expect(req.request.params.get('tab')).toBe('family');
    req.flush({
      tab: 'family', total: 1, page: 1, pageSize: 12, counts: { parent: 3, grand: 0, ai: 0, family: 1, video: 1 },
      items: [{ publicId: 's1', kind: 'family', name: 'The Nairs', firstName: 'Asha', parentName: 'The Nairs', relation: null, memoryYear: null, place: 'Kochi, Kerala',
        message: 'Sunday lunch, every week.', approvedAtUtc: '2026-10-28T06:00:00', photoId: 'p1', videoId: 'v1' }]
    });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.selfie-tile').length).toBe(1);
    expect(el.querySelector('.selfie-tile h3')?.textContent).toContain('The Nairs');
    expect(el.querySelector<HTMLImageElement>('.tile-photo img')?.src).toContain('/api/v1/selfies/files/p1');
    expect(el.querySelector('.tile-play')).not.toBeNull();
    expect(el.querySelector('.cat-tabs a.active')?.textContent).toContain('Family');
    expect(el.querySelector('.cat-tabs a .badge')?.textContent?.trim()).toBe('3');
  });
});
