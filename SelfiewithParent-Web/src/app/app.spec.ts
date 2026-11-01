import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { I18nService } from './core/i18n/i18n.service';
import { MenuItem, MenuService } from './core/menu/menu.service';
import { isValidMobile, maskMobile } from './core/phone';

const item = (key: string, type: MenuItem['type'], label: string, url: string | null, visibility: MenuItem['visibility'] = 'Always',
  children: MenuItem[] = []): MenuItem => ({ key, type, label, url, actionCode: null, icon: null, visibility, opensNewTab: false, children });

// A small menu as the API returns it from the database
const MAIN: MenuItem[] = [
  item('home', 'Link', 'Home', '/'),
  item('community', 'Dropdown', 'Community', null, 'Always', [item('community.then-now', 'Link', 'Then & Now', '/then-now')]),
  item('signin', 'Link', 'Sign in', '/login', 'SignedOut'),
  item('account', 'Dropdown', 'My account', null, 'SignedIn', [item('account.profile', 'Link', 'My account', '/account', 'SignedIn')]),
  item('share', 'Button', 'Share a Selfie', '/upload')
];
const FOOTER: MenuItem[] = [item('privacy', 'Link', 'Privacy Policy', '/privacy')];

describe('App', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  function render() {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(I18nService).setLanguage('en', false);   // the app picks a language from the browser's country
    fixture.detectChanges();
    http.match(r => r.url.endsWith('/api/v1/menus/main')).forEach(r => r.flush({ menuCode: 'main', language: 'en', items: MAIN }));
    http.match(r => r.url.endsWith('/api/v1/menus/footer')).forEach(r => r.flush({ menuCode: 'footer', language: 'en', items: FOOTER }));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('builds the header and footer from the menus in the database', () => {
    const el = render();
    const top = Array.from(el.querySelectorAll('#mainMenu > ul > li')).map(li => (li.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(top).toEqual(['Home', 'Community Then & Now', 'Sign in', 'Share a Selfie']);
    expect(el.querySelector('.footer-links a')?.textContent).toContain('Privacy Policy');
    expect(el.querySelector('a.skip-link')?.getAttribute('href')).toBe('#main');
  });

  it('shows "Sign in" and hides the account menu when nobody is signed in', () => {
    const el = render();
    expect(el.querySelector('#mainMenu')?.textContent).toContain('Sign in');
    expect(el.querySelector('.user-menu')).toBeNull();
  });

  it('asks the API for menus in the visitor\'s language', () => {
    TestBed.createComponent(App).detectChanges();
    TestBed.inject(I18nService).setLanguage('hi', false);
    TestBed.flushEffects();
    const hi = http.match(r => r.url.endsWith('/api/v1/menus/main') && r.params.get('lang') === 'hi');
    expect(hi.length).toBeGreaterThan(0);
  });
});

describe('MenuService.target', () => {
  it('splits site paths for the router', () => {
    expect(MenuService.target('/upload?kind=family')).toEqual(jasmine.objectContaining({ internal: true, path: '/upload', queryParams: { kind: 'family' } }));
    expect(MenuService.target('/#about')).toEqual(jasmine.objectContaining({ internal: true, path: '/', fragment: 'about' }));
  });

  it('treats other addresses as plain links (never routed)', () => {
    expect(MenuService.target('https://example.org').internal).toBeFalse();
    expect(MenuService.target('//evil.example').internal).toBeFalse();
  });
});

describe('I18nService', () => {
  it('translates and falls back to English', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLanguage('hi', false);
    expect(i18n.t('Home')).toBe('होम');
    expect(i18n.t('A phrase with no translation')).toBe('A phrase with no translation');
    expect(i18n.t('Showing {from}–{to} of {total}', { from: 1, to: 12, total: 34 })).toBe('34 में से 1–12');
    i18n.setLanguage('en', false);
    expect(i18n.t('Home')).toBe('Home');
  });
});

describe('Phone helpers', () => {
  it('never shows more than the last 4 digits', () => {
    expect(maskMobile('+91', '98765 43210')).toBe('+91 ••••• 3210');
  });

  it('applies the same number rules as the API', () => {
    expect(isValidMobile('+91', '9876543210')).toBeTrue();
    expect(isValidMobile('+91', '1234567890')).toBeFalse();   // Indian numbers start 6–9
    expect(isValidMobile('+91', '98765')).toBeFalse();
    expect(isValidMobile('+44', '7700900123')).toBeTrue();
  });
});
