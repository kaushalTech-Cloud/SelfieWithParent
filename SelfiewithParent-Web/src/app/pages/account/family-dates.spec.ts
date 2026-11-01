import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { I18nService } from '../../core/i18n/i18n.service';
import { FamilyDates } from './family-dates';

describe('Family dates & reminders', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FamilyDates], providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(I18nService).setLanguage('en', false);
  });

  it('lists my dates, adds one and switches reminders', async () => {
    const fixture = TestBed.createComponent(FamilyDates);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/me/family-dates')).flush([
      { publicId: 'd1', name: 'Papa', relation: 'Father', occasion: 'Birthday', month: 3, day: 1, year: 1960, daysUntil: 3 }]);
    http.expectOne(r => r.url.endsWith('/api/v1/me/reminders')).flush({ emailReminders: true, thenNowNudges: true });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.fd-item')?.textContent).toContain('Papa · Birthday');
    expect(el.querySelector('.fd-item')?.textContent).toContain('In 3 days');

    [...el.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('Add a family date'))!.click();
    fixture.detectChanges();
    const c = fixture.componentInstance as unknown as { form: Record<string, unknown>; save(): Promise<void> };
    Object.assign(c.form, { name: 'Maa', relation: 'Mother', occasion: 'Birthday', month: 2, day: 29, year: '1962' });
    const saving = c.save();
    const post = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/api/v1/me/family-dates'));
    expect(post.request.body).toEqual({ name: 'Maa', relation: 'Mother', occasion: 'Birthday', month: 2, day: 29, year: 1962 });
    post.flush({}, { status: 201, statusText: 'Created' });
    await new Promise(r => setTimeout(r));
    http.expectOne(r => r.url.endsWith('/api/v1/me/family-dates')).flush([]);
    http.expectOne(r => r.url.endsWith('/api/v1/me/reminders')).flush({ emailReminders: true, thenNowNudges: true });
    await saving;
    fixture.detectChanges();

    const sw = el.querySelector<HTMLInputElement>('#remThenNow')!;
    sw.checked = false;
    sw.dispatchEvent(new Event('change'));
    const put = http.expectOne(r => r.method === 'PUT' && r.url.endsWith('/api/v1/me/reminders'));
    expect(put.request.body).toEqual({ emailReminders: true, thenNowNudges: false });
    put.flush({ emailReminders: true, thenNowNudges: false });
  });
});
