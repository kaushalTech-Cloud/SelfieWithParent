import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { I18nService } from '../core/i18n/i18n.service';
import { LikeShare } from './like-share';

describe('Like & share', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LikeShare], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(I18nService).setLanguage('en', false);
  });

  function create() {
    const fixture = TestBed.createComponent(LikeShare);
    fixture.componentRef.setInput('id', 's1');
    fixture.componentRef.setInput('likes', 4);
    fixture.componentRef.setInput('title', 'Asha with Papa');
    fixture.componentRef.setInput('path', '/selfies/s1');
    fixture.componentRef.setInput('image', 'https://api.example/p1.jpg');
    fixture.detectChanges();
    return fixture;
  }

  it('shares to every network with the selfie\'s link', () => {
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    expect(document.querySelector('.share-menu')).toBeNull();                         // closed until Share is tapped
    el.querySelector<HTMLButtonElement>('.ls-share')!.click();
    fixture.detectChanges();
    const menu = document.querySelector<HTMLElement>('.share-menu')!;
    expect(menu.parentElement).toBe(document.body);                                    // floats above the page: no card can clip it
    const links = [...menu.querySelectorAll<HTMLAnchorElement>('a')];
    expect(links.map(a => a.textContent?.trim())).toEqual(['WhatsApp', 'Facebook', 'X', 'LinkedIn', 'Telegram', 'Pinterest', 'Reddit', 'Email']);
    for (const a of links) expect(decodeURIComponent(a.href)).toContain('/selfies/s1');
    expect(decodeURIComponent(links[5].href)).toContain('media=https://api.example/p1.jpg');     // Pinterest gets the picture
    expect(el.querySelector('.ls-count')?.textContent).toBe('4');
    document.body.click();                                                             // a click elsewhere closes it
    fixture.detectChanges();
    expect(document.querySelector('.share-menu')).toBeNull();
  });

  it('a signed-out heart goes to sign-in and comes back', async () => {
    spyOn(TestBed.inject(AuthService), 'init').and.resolveTo();
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    const fixture = create();
    (fixture.nativeElement.querySelector('.ls-like') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], jasmine.objectContaining({ queryParams: jasmine.any(Object) }));
  });

  it('signed in: the heart likes and unlikes, and the count follows', async () => {
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'init').and.resolveTo();
    (auth.profile as unknown as { set(v: object): void }).set({ profileComplete: true });
    const fixture = create();
    http.expectOne(r => r.url.endsWith('/api/v1/selfies/likes/mine')).flush([]);
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.ls-like') as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r));
    const put = http.expectOne(r => r.method === 'PUT' && r.url.endsWith('/api/v1/selfies/s1/like'));
    expect(put.request.body).toEqual({ liked: true });
    put.flush({ likes: 5, liked: true });
    await new Promise(r => setTimeout(r));
    fixture.detectChanges();
    expect(el.querySelector('.ls-count')?.textContent).toBe('5');
    expect(el.querySelector('.ls-like')?.getAttribute('aria-pressed')).toBe('true');
  });
});
