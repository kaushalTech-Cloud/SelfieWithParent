import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { I18nService } from '../../core/i18n/i18n.service';
import { Contest } from './contest';
import { ContestSpotlight } from './contest-spotlight';

const item = (id: string, name: string) => ({ publicId: id, kind: 'real', name, firstName: name.split(' ')[0], parentName: 'Papa', place: 'Pune', message: null, photoId: 'p-' + id, likes: 3 });
const week = { publicId: 'w1', kind: 'week', title: 'Photo of the Week', startsAtUtc: '2026-10-26T00:00:00', endsAtUtc: '2099-11-02T00:00:00', decided: false };

describe('Photo of the Week', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Contest, ContestSpotlight], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(I18nService).setLanguage('en', false);
  });

  it('shows the live leaderboard with votes and medals, a countdown, and past winners', () => {
    const fixture = TestBed.createComponent(Contest);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/contests/current')).flush({ contests: [{ contest: week, leaders: [
      { rank: 1, votes: 5, item: item('a', 'Asha with Maa') }, { rank: 2, votes: 3, item: item('b', 'Ravi with Papa') },
      { rank: 4, votes: 1, item: item('d', 'Meera with Nani') }] }] });
    http.expectOne(r => r.url.endsWith('/api/v1/contests/winners')).flush({ total: 1, items: [
      { contest: { ...week, publicId: 'w0', startsAtUtc: '2026-10-19T00:00:00', endsAtUtc: '2026-10-26T00:00:00', decided: true }, votes: 9, winner: item('z', 'Kabir with Dadu') }] });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const leaders = el.querySelectorAll('.leader');
    expect(leaders.length).toBe(3);
    expect(leaders[0].textContent).toContain('🥇');
    expect(leaders[0].textContent).toContain('Asha with Maa');
    expect(leaders[0].textContent).toContain('5 votes');
    expect(leaders[2].querySelector('.rank')?.textContent?.trim()).toBe('4');
    expect(leaders[0].querySelector('app-like-share')).not.toBeNull();          // vote + share right there
    expect(el.querySelector('.contest-clock')?.textContent).toContain('days');
    expect(el.querySelector('.winner-card')?.textContent).toContain('Kabir with Dadu');
    expect(el.querySelector('.winner-badge')?.textContent).toContain('Photo of the Week');
  });

  it('home spotlight: the latest winner and the top 3 of this week', () => {
    const fixture = TestBed.createComponent(ContestSpotlight);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/contests/winners')).flush({ total: 1, items: [
      { contest: { ...week, decided: true }, votes: 9, winner: item('z', 'Kabir with Dadu') }] });
    http.expectOne(r => r.url.endsWith('/api/v1/contests/current')).flush({ contests: [{ contest: week, leaders: [
      { rank: 1, votes: 5, item: item('a', 'A') }, { rank: 2, votes: 3, item: item('b', 'B') }, { rank: 3, votes: 2, item: item('c', 'C') }, { rank: 4, votes: 1, item: item('d', 'D') }] }] });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.spot-winner')?.textContent).toContain('Kabir with Dadu');
    expect(el.querySelectorAll('.spot-leader').length).toBe(3);
    expect(el.querySelector('a.btn-accent')?.getAttribute('href')).toBe('/contest');
  });
});
