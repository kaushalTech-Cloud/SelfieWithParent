import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { AuthService } from './core/auth.service';
import { MenuService } from './core/menu.service';

describe('Admin site', () => {
  beforeEach(async () => {
    localStorage.removeItem('swp-admin-rt');
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });

  it('creates the app', () => {
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });

  it('sends signed-out visitors to the sign-in page', async () => {
    TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/queue');
    expect(router.url).toBe('/login?returnUrl=%2Fqueue');
  });

  it('allows only the five staff roles', () => {
    const auth = TestBed.inject(AuthService);
    const base = { publicId: 'x', signUpMethod: 'Email' as const, mobileMasked: null, email: 'a@b.co', fullName: 'A B', hasPassword: false };
    for (const role of ['SuperAdmin', 'Admin', 'Moderator', 'Support', 'PrivacyOfficer']) {
      auth.profile.set({ ...base, roles: ['Visitor', role] });
      expect(auth.isStaff()).withContext(role).toBeTrue();
    }
    auth.profile.set({ ...base, roles: ['Visitor'] });
    expect(auth.isStaff()).toBeFalse();
    auth.profile.set({ ...base, roles: ['SomethingElse'] });
    expect(auth.isStaff()).toBeFalse();
  });

  it('sends a signed-in visitor without a staff role to "no access"', async () => {
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'init').and.resolveTo();
    auth.profile.set({ publicId: 'x', signUpMethod: 'Email', mobileMasked: null, email: 'a@b.co', fullName: 'A B', hasPassword: false, roles: ['Visitor'] });
    TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    expect(router.url).toBe('/no-access');
  });

  it('loads the sidebar from the database menu "admin" in English', async () => {
    const menu = TestBed.inject(MenuService);
    const http = TestBed.inject(HttpTestingController);
    const done = menu.load();
    const req = http.expectOne(r => r.url.endsWith('/api/v1/menus/admin'));
    expect(req.request.params.get('lang')).toBe('en');
    req.flush({ menuCode: 'admin', language: 'en', items: [{ key: 'dashboard', type: 'Link', label: 'Dashboard', url: '/', actionCode: null, icon: 'bi-speedometer2', visibility: 'Always', opensNewTab: false, children: [] }] });
    await done;
    expect(menu.items().map(i => i.key)).toEqual(['dashboard']);
  });

  it('keeps the Staff page for super admins only', async () => {
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'init').and.resolveTo();
    const base = { publicId: 'x', signUpMethod: 'Email' as const, mobileMasked: null, email: 'a@b.co', fullName: 'A B', hasPassword: false };
    TestBed.createComponent(App);
    const router = TestBed.inject(Router);

    auth.profile.set({ ...base, roles: ['Visitor', 'Admin'] });
    await router.navigateByUrl('/staff');
    expect(router.url).toBe('/');

    auth.profile.set({ ...base, roles: ['Visitor', 'SuperAdmin'] });
    await router.navigateByUrl('/staff');
    expect(router.url).toBe('/staff');
  });

  it('sends signed-in staff from the sign-in page to the dashboard', async () => {
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'init').and.resolveTo();
    auth.profile.set({ publicId: 'x', signUpMethod: 'Email', mobileMasked: null, email: 'a@b.co', fullName: 'A B', hasPassword: false, roles: ['Moderator'] });
    TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/login');
    expect(router.url).toBe('/');
  });

  it('offers Edit / Make inactive / Delete only for staff who are not super admins (and never for yourself)', async () => {
    const auth = TestBed.inject(AuthService);
    auth.profile.set({ publicId: 'me', signUpMethod: 'Email', mobileMasked: null, email: 'me@b.co', fullName: 'Me', hasPassword: true, roles: ['SuperAdmin'] });
    const { Staff } = await import('./pages/staff/staff');
    const fixture = TestBed.createComponent(Staff);
    fixture.detectChanges();
    const row = (publicId: string, name: string, roles: string[]) =>
      ({ publicId, email: `${publicId}@b.co`, mobileMasked: null, fullName: name, roles, createdAtUtc: '2026-10-25T00:00:00', lastSignInAtUtc: null, isActive: true });
    TestBed.inject(HttpTestingController).expectOne(r => r.url.endsWith('/api/v1/admin/staff')).flush([
      row('me', 'Me', ['SuperAdmin']), row('other-super', 'Other Super', ['SuperAdmin']), row('mod', 'A Moderator', ['Moderator'])
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.staff-table button[aria-label]')]
      .map(b => b.getAttribute('aria-label'));
    expect(labels).toEqual(['Edit A Moderator', 'Make inactive: A Moderator', 'Delete A Moderator']);
  });

  it('edits staff in the same form used to add them', async () => {
    const auth = TestBed.inject(AuthService);
    auth.profile.set({ publicId: 'me', signUpMethod: 'Email', mobileMasked: null, email: 'me@b.co', fullName: 'Me', hasPassword: true, roles: ['SuperAdmin'] });
    const { Staff } = await import('./pages/staff/staff');
    const fixture = TestBed.createComponent(Staff);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const mod = { publicId: 'mod', email: 'mod@b.co', mobileMasked: null, fullName: 'A Moderator', roles: ['Moderator', 'Visitor'],
      createdAtUtc: '2026-10-25T00:00:00', lastSignInAtUtc: null, isActive: true };
    http.expectOne(r => r.url.endsWith('/api/v1/admin/staff')).flush([mod]);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('form').length).toBe(1);   // no separate edit form
    (el.querySelector('button[aria-label="Edit A Moderator"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.staff-form h2')?.textContent).toBe('Edit staff member');
    expect((el.querySelector('#sName') as HTMLInputElement).value).toBe('A Moderator');
    expect((el.querySelector('#sEmail') as HTMLInputElement).value).toBe('mod@b.co');
    expect((el.querySelector('#sRole') as HTMLSelectElement).value).toBe('Moderator');

    const name = el.querySelector('#sName') as HTMLInputElement;
    name.value = 'Renamed Moderator';
    name.dispatchEvent(new Event('input'));
    (el.querySelector('.staff-form button[type=submit]') as HTMLButtonElement).click();
    const put = http.expectOne(r => r.method === 'PUT' && r.url.endsWith('/api/v1/admin/staff/mod'));
    expect(put.request.body).toEqual({ fullName: 'Renamed Moderator', email: 'mod@b.co', roleCode: 'Moderator', newPassword: null });
    put.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    http.expectOne(r => r.method === 'GET' && r.url.endsWith('/api/v1/admin/staff')).flush([{ ...mod, fullName: 'Renamed Moderator' }]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('.staff-form h2')?.textContent).toBe('Add a staff member');   // back to adding
    expect(el.querySelector('.staff-form .alert-success')?.textContent).toContain('Renamed Moderator was updated.');
  });

  it('keeps the Visitors page for super admins only', async () => {
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'init').and.resolveTo();
    TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    auth.profile.set({ publicId: 'x', signUpMethod: 'Email', mobileMasked: null, email: 'a@b.co', fullName: 'A B', hasPassword: false, roles: ['Admin'] });
    await router.navigateByUrl('/visitors');
    expect(router.url).toBe('/');
  });

  it('needs a reason before a visitor is made inactive (nothing is sent without one)', async () => {
    const { Visitors } = await import('./pages/visitors/visitors');
    const fixture = TestBed.createComponent(Visitors);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const v = { publicId: 'v1', fullName: 'Vee Visitor', email: 'v@b.co', mobileMasked: null, signUpMethod: 'Email', countryCode: 'IN',
      createdAtUtc: '2026-10-25T00:00:00', lastSignInAtUtc: null, isActive: true, lastReason: null, lastStatusChangeAtUtc: null };
    http.expectOne(r => r.url.endsWith('/api/v1/admin/visitors')).flush({ items: [v], total: 1, page: 1, pageSize: 25 });
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('button[aria-label="Make inactive: Vee Visitor"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('form[aria-label="Make inactive: Vee Visitor"] button[type=submit]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    http.expectNone(r => r.method === 'PUT');
    expect(el.querySelector('[role=alert]')?.textContent).toContain('at least 10 characters');
  });

  it('only treats site paths as internal menu links', () => {
    expect(MenuService.target('/queue').internal).toBeTrue();
    expect(MenuService.target('//evil.example').internal).toBeFalse();
    expect(MenuService.target('https://www.selfiewithparent.org/').internal).toBeFalse();
  });
});
