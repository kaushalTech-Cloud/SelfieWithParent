import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { I18nService } from '../../core/i18n/i18n.service';
import { Support } from './support';
import { buildSupportView } from './support-content';

const campaign = { publicId: 'c1', slug: 'diwali-elders', title: 'Diwali with our elders', summary: 'A festival meal', story: null, image: null,
  goalAmount: 50000, raised: 12500, donors: 9, endsAtUtc: null, isFeatured: true };
const api = (open: boolean) => ({ en: null, local: null, campaigns: [campaign], raised: 12500, donors: 9, campaignsRun: 1,
  wall: [{ name: 'Asha', amount: 1500, inHonourOf: 'In honour of Maa', campaign: null, paidAtUtc: '2026-10-30T10:00:00' }],
  donations: { open, testMode: open } });

describe('Support page', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Support], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(I18nService).setLanguage('en', false);
  });

  it('nothing set in the admin site: the built-in page shows (never blank)', () => {
    const v = buildSupportView(null, null, s => `[${s}]`);
    expect(v.hero.title).toBe('[Help no parent]');
    expect(v.impacts.map(i => i.amount)).toEqual([500, 1500, 2500, 5000]);
    expect(v.ways.length).toBe(4);
    expect(v.faqs.length).toBe(4);
    expect(v.fundsNote).toContain('Sample');
    const staff = buildSupportView({ hero: { title: 'Light a lamp' }, funds: [{ label: 'Programmes', percent: 90 }] }, null, s => s);
    expect(staff.hero.title).toBe('Light a lamp');
    expect(staff.hero.highlight).toBe('feel forgotten.');       // empty: the built-in words
    expect(staff.fundsNote).toBe('');                          // real figures: no "sample" note
  });

  it('giving closed: campaigns with progress, the donor wall, and "open soon" instead of the form', () => {
    const fixture = TestBed.createComponent(Support);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/support')).flush(api(false));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.sp-campaign h3')?.textContent).toContain('Diwali with our elders');
    expect(el.querySelector<HTMLElement>('.sp-progress span')?.style.width).toBe('25%');
    expect(el.querySelector('.sp-soon')?.textContent).toContain('Online donations open soon');
    expect(el.querySelector('.sp-donate-btn')).toBeNull();
    expect(el.querySelector('.sp-wall')?.textContent).toContain('Asha');
  });

  it('giving open: the form checks the details before anything is sent', () => {
    const fixture = TestBed.createComponent(Support);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/support')).flush(api(true));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.alert-warning')?.textContent).toContain('Test mode');
    const c = fixture.componentInstance as unknown as { f: Record<string, unknown>; donate(): Promise<void>; error(): string };
    void c.donate();
    expect(c.error()).toContain('your name');
    Object.assign(c.f, { name: 'Asha Rao', email: 'asha@example.com', pan: 'BAD' });
    void c.donate();
    expect(c.error()).toContain('PAN');
    http.expectNone(r => r.method === 'POST');
  });

  it('a volunteer enquiry goes to the Messages inbox', async () => {
    const fixture = TestBed.createComponent(Support);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/support')).flush(api(false));
    const c = fixture.componentInstance as unknown as { ask(k: string, t: string): void; e: Record<string, string>; sendEnquiry(): Promise<void>; enquirySent(): boolean };
    c.ask('volunteer', 'Volunteer');
    Object.assign(c.e, { name: 'Ravi', email: 'ravi@example.com', message: 'I can help on Sundays in Pune.' });
    const sending = c.sendEnquiry();
    const req = http.expectOne(r => r.url.endsWith('/api/v1/contact'));
    expect(req.request.body.subject).toBe('Support: Volunteer');
    req.flush({});
    await sending;
    expect(c.enquirySent()).toBeTrue();
  });
});
