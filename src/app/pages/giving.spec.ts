import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Donations } from './donations';
import { SupportPage } from './support-page';

describe('Giving (admin)', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SupportPage, Donations], providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  it('Support page: built-in text as placeholders; saves only what is filled in', async () => {
    const fixture = TestBed.createComponent(SupportPage);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/admin/support/content')).flush({ content: null, updatedAtUtc: null });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector<HTMLInputElement>('input[placeholder="Help no parent"]')).not.toBeNull();
    const c = fixture.componentInstance as unknown as { obj(k: string): Record<string, unknown>; startFrom(s: unknown): void; sections: { key: string }[];
      list(k: string): Record<string, unknown>[]; save(): Promise<void> };
    c.obj('hero')['title'] = '  Light a lamp ';
    c.startFrom(c.sections.find(s => s.key === 'impacts'));
    c.list('impacts')[0]['amount'] = 700;
    const saving = c.save();
    const put = http.expectOne(r => r.method === 'PUT');
    const body = put.request.body as Record<string, unknown>;
    expect(body['hero']).toEqual({ title: 'Light a lamp' });
    expect((body['impacts'] as Record<string, unknown>[])[0]['amount']).toBe(700);
    expect(body['faqs']).toBeUndefined();                                    // untouched: the website keeps its built-in questions
    put.flush(null, { status: 204, statusText: 'No Content' });
    await new Promise(r => setTimeout(r));
    http.expectOne(r => r.method === 'GET').flush({ content: body, updatedAtUtc: '2026-10-31T08:00:00' });
    await saving;
  });

  it('Donations: shows what is missing before giving can go live; offline gifts get a receipt number', async () => {
    const fixture = TestBed.createComponent(Donations);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/settings')).flush({ enabled: false, gatewayConfigured: false, testMode: false, webhookConfigured: false, webhookPath: '/api/v1/support/razorpay/webhook' });
    http.expectOne(r => r.url.endsWith('/donations')).flush({ items: [], total: 0, page: 1, pageSize: 25, paidAmount: 0, paid: 0, created: 0, failed: 0, refunded: 0 });
    http.expectOne(r => r.url.endsWith('/campaigns')).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.dn-check')?.textContent).toContain('not set: add Razorpay:KeyId');
    const c = fixture.componentInstance as unknown as { o: Record<string, unknown>; recordOffline(): Promise<void>; notice(): string };
    Object.assign(c.o, { amount: 5000, method: 'cheque', reference: 'CHQ 1122', name: 'Meera', email: 'meera@example.com' });
    const rec = c.recordOffline();
    const post = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/donations/offline'));
    expect(post.request.body).toEqual(jasmine.objectContaining({ amount: 5000, method: 'cheque', reference: 'CHQ 1122', name: 'Meera' }));
    post.flush({ receiptNo: 'SWP-2026-000001' });
    await new Promise(r => setTimeout(r));
    http.expectOne(r => r.url.endsWith('/donations')).flush({ items: [], total: 0, page: 1, pageSize: 25, paidAmount: 5000, paid: 1, created: 0, failed: 0, refunded: 0 });
    await rec;
    expect(c.notice()).toContain('SWP-2026-000001');
  });
});
