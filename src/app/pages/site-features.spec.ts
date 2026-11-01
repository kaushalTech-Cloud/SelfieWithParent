import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SiteFeatures } from './site-features';

describe('Site features (admin)', () => {
  it('shows every feature with its switch; switching one off saves it', async () => {
    await TestBed.configureTestingModule({ imports: [SiteFeatures], providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SiteFeatures);
    fixture.detectChanges();
    const all = { support: true, 'parents-voices': true, contest: true, 'photo-frames': true, reels: true, 'family-tree': true, 'then-now': true, memories: true };
    http.expectOne(r => r.url.endsWith('/api/v1/admin/features')).flush({ features: all, show: { 'contact-email': true, 'contact-phone': true, 'contact-address': true } });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll(".sf-card").length).toBe(11);
    const donate = el.querySelector<HTMLInputElement>('#f-support')!;
    donate.checked = false;
    donate.dispatchEvent(new Event('change'));
    const put = http.expectOne(r => r.method === 'PUT');
    expect(put.request.body).toEqual({ group: 'feature', key: 'support', on: false });
    put.flush(null, { status: 204, statusText: 'No Content' });
    await new Promise(r => setTimeout(r));
    http.expectOne(r => r.method === 'GET').flush({ features: { ...all, support: false }, show: {} });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('.sf-card.off')?.textContent).toContain('Support & Donate');
  });
});
