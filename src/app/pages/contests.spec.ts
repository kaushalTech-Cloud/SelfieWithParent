import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../core/auth.service';
import { Contests } from './contests';

describe('Winners & contests', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Contests], providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).profile.set({ publicId: 'x', signUpMethod: 'Email', mobileMasked: null, email: 'a@b.co', fullName: 'A B',
      hasPassword: true, roles: ['Admin'] });
  });

  it('lists contests with their winners, and adds a festival contest', async () => {
    const fixture = TestBed.createComponent(Contests);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/admin/contests')).flush([
      { publicId: 'w1', kind: 'week', title: 'Photo of the Week', startsAtUtc: '2026-10-26T00:00:00', endsAtUtc: '2026-11-02T00:00:00',
        closedAtUtc: '2026-11-02T00:30:00', winnerLikes: 12, winnerPublicId: 's1', winnerReference: 'SWP-000042' },
      { publicId: 'f1', kind: 'festival', title: 'Christmas 2099', startsAtUtc: '2099-12-20T00:00:00', endsAtUtc: '2099-12-27T00:00:00',
        closedAtUtc: null, winnerLikes: null, winnerPublicId: null, winnerReference: null }]);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('SWP-000042');
    expect(rows[0].textContent).toContain('12 likes');
    expect(rows[0].textContent).toContain('Decided');
    expect(rows[1].textContent).toContain('Upcoming');
    expect(rows[1].querySelector('button[title="Remove"]')).not.toBeNull();     // undecided festival: can change / remove
    expect(rows[0].querySelector('button[title="Remove"]')).toBeNull();
    expect(el.textContent).not.toContain('Decide now');                         // super admins only

    const c = fixture.componentInstance as unknown as { startAdd(): void; form: Record<string, string>; save(): Promise<void> };
    [...el.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('Festival contest'))!.click();
    fixture.detectChanges();
    expect(el.querySelector('#cTitle')).not.toBeNull();                          // the form opens for a new contest
    (rows[1].querySelector('button[title="Change"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('#cTitle')).not.toBeNull();        // ... and to change one
    c.startAdd();
    Object.assign(c.form, { title: 'Diwali 2026', startsOn: '2026-11-01', endsOn: '2026-11-07' });
    const saving = c.save();
    const post = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/api/v1/admin/contests'));
    expect(post.request.body).toEqual({ title: 'Diwali 2026', startsOn: '2026-11-01', endsOn: '2026-11-07' });
    post.flush({ publicId: 'f2' }, { status: 201, statusText: 'Created' });
    await new Promise(r => setTimeout(r));
    http.expectOne(r => r.url.endsWith('/api/v1/admin/contests')).flush([]);
    await saving;
  });
});
