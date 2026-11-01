import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ParentStories } from './parent-stories';

const story = (o: object = {}) => ({
  publicId: 's1', reference: 'PV-000001', writtenBy: 'friend', parentRole: 'father', shownName: null, age: 81, countryCode: 'IN',
  stateName: 'Maharashtra', city: 'Pune', title: 'The man on the bench', story: 'He waits on the same bench every evening.', wish: null,
  status: 'Pending', reviewNote: null, reviewedBy: null, reviewedAtUtc: null, createdAtUtc: '2026-10-30T10:00:00', isFeatured: false,
  loves: 0, ownerEmail: 'v1@example.test', files: [], ...o
});

describe("Parents' stories (review)", () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ParentStories], providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  it('shows the pending stories; approving and rejecting (with a reason) go to the API', async () => {
    const fixture = TestBed.createComponent(ParentStories);
    fixture.detectChanges();
    const list = http.expectOne(r => r.url.endsWith('/api/v1/admin/parent-stories'));
    expect(list.request.params.get('status')).toBe('Pending');
    list.flush({ items: [story()], total: 1, page: 1, pageSize: 12, pending: 1, approved: 0, rejected: 0 });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.ps-card h3')?.textContent).toContain('The man on the bench');
    expect(el.querySelector('.ps-who')?.textContent).toContain('Anonymous');
    expect(el.textContent).toContain('Written by a friend / volunteer');

    const c = fixture.componentInstance as unknown as { review(s: unknown, status: string, featured?: boolean): Promise<void>; reason: string };
    const approving = c.review(story(), 'Approved');
    const put = http.expectOne(r => r.method === 'PUT' && r.url.endsWith('/api/v1/admin/parent-stories/s1/review'));
    expect(put.request.body).toEqual({ status: 'Approved', note: null, featured: false });
    put.flush(null, { status: 204, statusText: 'No Content' });
    await new Promise(r => setTimeout(r));
    http.expectOne(r => r.method === 'GET').flush({ items: [], total: 0, page: 1, pageSize: 12, pending: 0, approved: 1, rejected: 0 });
    await approving;

    c.reason = '  Shares a phone number ';
    const rejecting = c.review(story({ status: 'Approved' }), 'Rejected');
    const put2 = http.expectOne(r => r.method === 'PUT');
    expect(put2.request.body).toEqual({ status: 'Rejected', note: 'Shares a phone number', featured: null });
    put2.flush(null, { status: 204, statusText: 'No Content' });
    await new Promise(r => setTimeout(r));
    http.expectOne(r => r.method === 'GET').flush({ items: [], total: 0, page: 1, pageSize: 12, pending: 0, approved: 0, rejected: 1 });
    await rejecting;
    fixture.detectChanges();
    expect(el.querySelector('.alert-success')?.textContent).toContain('taken down');
  });
});
