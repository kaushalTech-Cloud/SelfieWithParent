import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { Account } from './account';

describe('My account left menu', () => {
  const fragment = new BehaviorSubject<string | null>(null);

  beforeEach(() => {
    fragment.next(null);
    TestBed.configureTestingModule({
      imports: [Account],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { fragment, snapshot: { queryParamMap: convertToParamMap({}) } } }]
    });
    TestBed.inject(I18nService).setLanguage('en', false);
    TestBed.inject(AuthService).profile.set({ publicId: 'u', signUpMethod: 'Email', mobileMasked: null, email: 'asha@example.com', fullName: 'Asha Nair',
      countryCode: 'IN', stateName: 'Kerala', city: 'Kochi', hasPassword: false, profileComplete: true, roles: ['Visitor'] } as never);
  });

  it('shows one part at a time, picked from the menu (the address #part)', () => {
    const fixture = TestBed.createComponent(Account);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const links = [...el.querySelectorAll<HTMLAnchorElement>('.acc-nav nav .acc-nav-link')];
    expect(links.map(a => a.textContent!.trim())).toEqual(['Profile', 'Mobile & password', 'Gratitude streak', 'Family albums', 'My profile page',
      'Family dates & reminders', 'Privacy & data']);
    expect(links[3].getAttribute('href')).toBe('/account#albums');

    // nothing chosen: the profile
    expect(el.querySelector('#profile')).not.toBeNull();
    expect(el.querySelector('#privacy')).toBeNull();
    expect(links[0].classList).toContain('active');

    fragment.next('privacy');
    fixture.detectChanges();
    expect(el.querySelector('#profile')).toBeNull();
    expect(el.querySelector('#privacy')).not.toBeNull();
    expect(el.querySelector('.acc-nav .active')?.textContent).toContain('Privacy & data');

    // old links (#mobile, #password) open "Mobile & password"; the Sunday email's #streak opens the streak
    fragment.next('password');
    fixture.detectChanges();
    expect(el.querySelector('#mobile')).not.toBeNull();
    expect(el.querySelector('#password')).not.toBeNull();
    fragment.next('streak');
    fixture.detectChanges();
    expect(el.querySelector('app-gratitude-streak')).not.toBeNull();
    expect(el.querySelector('#mobile')).toBeNull();
  });

  it('no menu during the welcome step (the profile, sign-in and privacy parts as before)', () => {
    TestBed.inject(AuthService).profile.update(p => ({ ...p!, profileComplete: false }));
    const fixture = TestBed.createComponent(Account);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.acc-nav')).toBeNull();
    expect(el.querySelector('#profile')).not.toBeNull();
    expect(el.querySelector('#privacy')).not.toBeNull();
    expect(el.querySelector('app-gratitude-streak')).toBeNull();
  });
});
