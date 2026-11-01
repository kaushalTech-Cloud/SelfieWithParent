import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { I18nService } from '../../core/i18n/i18n.service';
import { GratitudeStreak } from '../account/gratitude-streak';
import { ProfilePage } from './profile-page';

const tick = () => new Promise(r => setTimeout(r));

describe('Gratitude streak and profile page', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GratitudeStreak, ProfilePage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ handle: 'Asha-Nair' }) } } }]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(I18nService).setLanguage('en', false);
  });

  it('shows my streak and marks this week', async () => {
    const fixture = TestBed.createComponent(GratitudeStreak);
    fixture.detectChanges();
    http.match(r => r.url.endsWith('/api/v1/site/features')).forEach(r => r.flush({ features: {} }));
    const week = { current: 3, best: 5, total: 9, thisWeek: false, thisWeekKind: null, badges: ['month'], recentWeeks: ['2026-10-19', '2026-10-12', '2026-10-05'], weekStart: '2026-10-26', reminders: true };
    http.expectOne(r => r.url.endsWith('/api/v1/me/streak')).flush(week);
    await tick();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('3 weeks in a row');
    expect(el.querySelector('.gs-badge')?.textContent).toContain('1 month of gratitude');
    expect(el.querySelectorAll('.gs-weeks span.on').length).toBe(3);

    [...el.querySelectorAll<HTMLButtonElement>('.gs-kinds button')].find(b => b.textContent?.includes('Called them'))!.click();
    const post = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/api/v1/me/streak/check-in'));
    expect(post.request.body).toEqual({ kind: 'call', note: null });
    post.flush({ ...week, current: 4, thisWeek: true, thisWeekKind: 'call', recentWeeks: ['2026-10-26', ...week.recentWeeks] });
    await tick();
    fixture.detectChanges();
    expect(el.textContent).toContain('4 weeks in a row');
    expect(el.querySelector('.gs-done')?.textContent).toContain('Called them');
    expect(el.querySelector('.gs-kinds')).toBeNull();
  });

  it('is hidden when staff switched streaks off', async () => {
    const fixture = TestBed.createComponent(GratitudeStreak);
    fixture.detectChanges();
    http.match(r => r.url.endsWith('/api/v1/site/features')).forEach(r => r.flush({ features: { streaks: false } }));
    http.match(r => r.url.endsWith('/api/v1/me/streak')).forEach(r => r.flush(null));
    await tick();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('#streak')).toBeNull();
  });

  it('shows a public profile with badges, stats and items by tab', async () => {
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    http.match(r => r.url.endsWith('/api/v1/site/features')).forEach(r => r.flush({ features: {} }));
    const item = (id: string, kind: string, win = false) => ({ publicId: id, kind, parentName: 'Meena', relation: 'Mother', photoId: 'f' + id, videoId: null, likes: 2, isWinner: win, approvedAtUtc: '2026-10-01T00:00:00Z' });
    http.expectOne(r => r.url.endsWith('/api/v1/profiles/asha-nair')).flush({
      handle: 'asha-nair', displayName: 'Asha Nair', bio: 'Daughter of Meena', memberSinceUtc: '2026-01-10T00:00:00Z', hasPhoto: false,
      streak: { current: 4, best: 4, badges: ['month'] }, shared: 3, likes: 6, wins: 1,
      items: [item('a', 'real', true), item('b', 'frame'), item('c', 'reel')]
    });
    await tick();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Asha Nair');
    expect(el.querySelector('.pf-avatar')?.textContent?.trim()).toBe('AN');
    expect(el.querySelector('.pf-flame')?.textContent).toContain('4 weeks in a row');
    expect(el.querySelectorAll('.pf-tile').length).toBe(3);
    expect(el.querySelectorAll('.pf-win').length).toBe(1);
    [...el.querySelectorAll<HTMLButtonElement>('.pf-tabs button')].find(b => b.textContent?.includes('Frames'))!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.pf-tile').length).toBe(1);
  });

  it('says not found for a private or unknown profile', async () => {
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    http.match(r => r.url.endsWith('/api/v1/site/features')).forEach(r => r.flush({ features: {} }));
    http.expectOne(r => r.url.endsWith('/api/v1/profiles/asha-nair')).flush({ title: 'Profile not found.' }, { status: 404, statusText: 'Not Found' });
    await tick();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain('Profile not found');
  });
});
