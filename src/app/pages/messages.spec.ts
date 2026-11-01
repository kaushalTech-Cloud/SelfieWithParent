import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../core/auth.service';
import { MessageAlertsService } from '../core/message-alerts.service';
import { Messages } from './messages';

const msg = (id: string, name: string, status = 'New') => ({ publicId: id, name, email: name.toLowerCase() + '@example.com', subject: 'Hello',
  message: 'Can my school join?', status, createdAtUtc: '2026-10-30T06:00:00', readAtUtc: null, readBy: null, fromAccount: false });

describe('Messages', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Messages], providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  it('lists messages; opening one marks it read; reply by email; archive', async () => {
    const fixture = TestBed.createComponent(Messages);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/admin/contact-messages')).flush({ items: [msg('m1', 'Asha'), msg('m2', 'Ravi', 'Read')], total: 2, page: 1, pageSize: 20, new: 1, read: 1, archived: 0 });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.msg').length).toBe(2);
    expect(el.querySelector('.msg.new')?.textContent).toContain('Asha');
    expect(el.querySelector('.nav-link .badge')?.textContent).toContain('1');

    (el.querySelector('.msg.new .msg-head') as HTMLButtonElement).click();
    const put = http.expectOne(r => r.method === 'PUT' && r.url.endsWith('/contact-messages/m1/status'));
    expect(put.request.body).toEqual({ status: 'Read' });
    put.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    http.match(r => r.url.endsWith('/unread')).forEach(r => r.flush({ count: 0, latestFrom: null }));
    fixture.detectChanges();
    expect(el.querySelector('.msg-text')?.textContent).toContain('Can my school join?');
    const reply = el.querySelector<HTMLAnchorElement>('.msg-body a.btn-accent')!;
    expect(reply.getAttribute('href')).toContain('mailto:asha@example.com?subject=Re%3A%20Hello');
    expect(el.querySelector('.msg.new')).toBeNull();
  });

  it('saves the contact details shown on the website', async () => {
    const fixture = TestBed.createComponent(Messages);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/admin/contact-messages')).flush({ items: [], total: 0, page: 1, pageSize: 20, new: 0, read: 0, archived: 0 });
    const c = fixture.componentInstance as unknown as { tab: { set(v: string): void }; loadDetails(): Promise<void>; details: Record<string, string>; saveDetails(): Promise<void> };
    c.tab.set('details');
    const loading = c.loadDetails();
    http.expectOne(r => r.method === 'GET' && r.url.endsWith('/api/v1/admin/contact')).flush({ email: 'hello@selfiewithparent.org', phone: '', address: '' });
    await loading;
    Object.assign(c.details, { phone: '+91 98765 43210', address: '12 MG Road, Pune' });
    const saving = c.saveDetails();
    const put = http.expectOne(r => r.method === 'PUT' && r.url.endsWith('/api/v1/admin/contact'));
    expect(put.request.body).toEqual({ email: 'hello@selfiewithparent.org', phone: '+91 98765 43210', address: '12 MG Road, Pune' });
    put.flush(put.request.body);
    await saving;
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Saved — the website shows them now.');
  });

  it('notification: admins get the new-message count and a pop-up when one arrives; moderators don’t', () => {
    jasmine.clock().install();
    const auth = TestBed.inject(AuthService);
    auth.profile.set({ publicId: 'x', signUpMethod: 'Email', mobileMasked: null, email: 'a@b.co', fullName: 'A', hasPassword: true, roles: ['Admin'] });
    const alerts = TestBed.inject(MessageAlertsService);
    TestBed.tick();
    http.expectOne(r => r.url.endsWith('/contact-messages/unread')).flush({ count: 2, latestFrom: 'Asha' });
    expect(alerts.unread()).toBe(2);
    expect(alerts.toast()).toBeNull();                        // no pop-up for what was already waiting
    jasmine.clock().tick(60_000);
    http.expectOne(r => r.url.endsWith('/contact-messages/unread')).flush({ count: 3, latestFrom: 'Ravi' });
    expect(alerts.unread()).toBe(3);
    expect(alerts.toast()).toBe('New message from Ravi');

    auth.profile.set({ publicId: 'x', signUpMethod: 'Email', mobileMasked: null, email: 'a@b.co', fullName: 'A', hasPassword: true, roles: ['Moderator'] });
    TestBed.tick();
    expect(alerts.unread()).toBe(0);
    jasmine.clock().tick(60_000);
    http.expectNone(r => r.url.endsWith('/contact-messages/unread'));
    jasmine.clock().uninstall();
  });
});
