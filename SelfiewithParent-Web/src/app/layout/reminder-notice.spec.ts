import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { I18nService } from '../core/i18n/i18n.service';
import { ReminderNotice } from './reminder-notice';

describe('Reminder notice', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ReminderNotice], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(I18nService).setLanguage('en', false);
    localStorage.removeItem('swp-notice-dismissed');
  });

  it('shows the next family date when signed in, and closes for the day', () => {
    (TestBed.inject(AuthService).profile as unknown as { set(v: object): void }).set({ profileComplete: true });
    const fixture = TestBed.createComponent(ReminderNotice);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/me/reminders/upcoming')).flush({
      dates: [{ publicId: 'd1', name: 'Papa', relation: 'Father', occasion: 'Birthday', date: '2026-11-01', daysAway: 3, turning: 66 }],
      anniversaries: [{ publicId: 's1', parentName: 'Meena', years: 1, photoId: 'p1' }] });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.reminder-notice')?.textContent).toContain("Papa's birthday is in 3 days");
    expect(el.querySelector('.reminder-notice a')?.getAttribute('href')).toBe('/upload');
    (el.querySelector('.btn-close') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.reminder-notice')).toBeNull();
    expect(localStorage.getItem('swp-notice-dismissed')).toBe(new Date().toDateString());
    localStorage.removeItem('swp-notice-dismissed');
  });

  it('a year since a selfie: "take it again" opens Then & Now with it', () => {
    (TestBed.inject(AuthService).profile as unknown as { set(v: object): void }).set({ profileComplete: true });
    const fixture = TestBed.createComponent(ReminderNotice);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/me/reminders/upcoming')).flush({ dates: [], anniversaries: [{ publicId: 's1', parentName: 'Meena', years: 1, photoId: 'p1' }] });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.reminder-notice')?.textContent).toContain('A year ago you shared a selfie with Meena.');
    expect(el.querySelector('.reminder-notice a')?.getAttribute('href')).toBe('/then-now?again=s1');
  });

  it('nothing when signed out', () => {
    TestBed.createComponent(ReminderNotice).detectChanges();
    http.expectNone(r => r.url.includes('/reminders/upcoming'));
  });
});
