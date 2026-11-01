import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { I18nService } from '../../core/i18n/i18n.service';
import { ContentPage } from './content-page';

describe('Content page', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContentPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ slug: 'founder' })) } }]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(I18nService).setLanguage('en', false);
  });

  function render(body: object | null, status = 200) {
    const fixture = TestBed.createComponent(ContentPage);
    fixture.detectChanges();
    const req = http.expectOne(r => r.url.endsWith('/api/v1/pages/founder'));
    expect(req.request.params.get('lang')).toBe('en');
    if (status === 200) req.flush(body); else req.flush({ title: 'Page not found.' }, { status, statusText: 'Not Found' });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders blocks as text, highlights placeholders and the current tab', () => {
    const el = render({
      slug: 'founder', language: 'en', title: 'Our Founder', description: null, blocks: [
        { id: 'h', type: 'hero', eyebrow: 'Our founder', title: 'The first person to', highlight: 'say thank you' },
        { id: 't', type: 'tabs', items: [{ id: 't1', label: 'About us', url: '/about' }, { id: 't2', label: 'Our founder', url: '/founder' }] },
        { id: 'q', type: 'quote', text: 'Hello <script>alert(1)</script> [Founder Name]' },
        { id: 'c', type: 'cta', title: 'Talk to us', buttons: [{ id: 'b', label: 'Write', url: 'mailto:hi@example.org' }, { id: 'b2', label: 'Go', url: 'https://example.org' }] }
      ]
    });
    expect(el.querySelector('h1')?.textContent).toContain('say thank you');
    expect(el.querySelector('.about-tabs a[aria-current="page"]')?.textContent).toContain('Our founder');
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('.pull-quote')?.textContent).toContain('<script>');
    expect(el.querySelector('.pull-quote .ph')?.textContent).toBe('[Founder Name]');
    const links = el.querySelectorAll<HTMLAnchorElement>('.cta-panel a');
    expect(links[0].getAttribute('href')).toBe('mailto:hi@example.org');
    expect(links[1].getAttribute('target')).toBe('_blank');
    expect(links[1].getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('shows "not found" for a missing page', () => {
    const el = render(null, 404);
    expect(el.textContent).toContain('Page not found');
  });
});
