import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { I18nService } from '../../core/i18n/i18n.service';
import { Home } from './home';

describe('Home › Get in touch', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Home], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(I18nService).setLanguage('en', false);
  });

  it('shows the contact details from the admin site, and the form sends the message', async () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/site/contact')).flush({ email: 'team@selfiewithparent.org', phone: '+91 98765 43210', address: '12 MG Road, Pune' });
    http.match(r => !r.url.endsWith('/api/v1/contact')).forEach(r => r.flush({ items: [], contests: [] }));
    fixture.detectChanges();
    await fixture.whenStable();
    http.match(r => r.method === 'GET').forEach(r => r.flush({ items: [], contests: [] }));
    const el = fixture.nativeElement as HTMLElement;
    const list = el.querySelector('.contact-list')!;
    expect(list.textContent).toContain('team@selfiewithparent.org');
    expect(list.textContent).toContain('12 MG Road, Pune');
    expect(list.querySelector('a[href^="tel:"]')?.getAttribute('href')).toBe('tel:+919876543210');

    const form = el.querySelector<HTMLFormElement>('.contact-form')!;
    const set = (name: string, value: string) => {
      const box = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
      box.value = value;
      box.dispatchEvent(new Event('input'));
    };
    set('cname', 'Asha'); set('cemail', 'asha@example.com'); set('csubject', 'Hello'); set('cmessage', 'Can my school join?');
    fixture.detectChanges();
    await fixture.whenStable();
    form.dispatchEvent(new Event('submit'));
    const req = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/api/v1/contact'));
    expect(req.request.body).toEqual({ name: 'Asha', email: 'asha@example.com', subject: 'Hello', message: 'Can my school join?' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();
    expect(el.querySelector('.form-note.ok')?.textContent).toContain("Thanks for writing to us");
  });
});
