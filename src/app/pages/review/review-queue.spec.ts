import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth.service';
import { ReviewQueue } from './review-queue';

describe('Review queue', () => {
  let http: HttpTestingController;
  const item = (ref: string, kind = 'real') => ({
    publicId: ref, reference: ref, kind, yourName: 'Asha', parentName: 'Meena', relation: 'Mother', familySize: null, generations: null,
    memoryYear: null, countryCode: 'IN', stateName: 'Kerala', city: 'Kochi', isAdult: true, guardianName: null, guardianMobileMasked: null,
    message: 'Hi', status: 'Pending', reviewNote: null, reviewedBy: null, reviewedAtUtc: null, createdAtUtc: '2026-10-28T06:00:00',
    ownerEmailMasked: 'a***@example.com', files: [{ publicId: 'f-' + ref, role: 'main', contentType: 'image/png', sizeBytes: 100, fileName: 'me.png' }]
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ReviewQueue], providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  it('loads the waiting submissions with their photos, and approving / rejecting sends the decision', async () => {
    const fixture = TestBed.createComponent(ReviewQueue);
    fixture.detectChanges();
    const list = http.expectOne(r => r.url.endsWith('/api/v1/admin/selfies'));
    expect(list.request.params.get('status')).toBe('Pending');
    list.flush({ items: [item('SWP-000001'), item('SWP-000002', 'family')], total: 2, page: 1, pageSize: 12, pending: 2, approved: 0, rejected: 0 });
    await fixture.whenStable();
    http.match(r => r.url.includes('/api/v1/admin/selfies/files/')).forEach(r => r.flush(new Blob(['x'], { type: 'image/png' })));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.queue-item').length).toBe(2);

    const c = fixture.componentInstance as unknown as { approve(s: unknown): Promise<void>; startReject(s: unknown): void; confirmReject(s: unknown): Promise<void>; data: () => { items: unknown[]; pending: number } };
    const [first, second] = c.data().items;
    const approving = c.approve(first);
    const put = http.expectOne(r => r.url.endsWith('/SWP-000001/review'));
    expect(put.request.body).toEqual({ status: 'Approved', note: null });
    put.flush(null);
    await approving;
    expect(c.data().pending).toBe(1);

    c.startReject(second);
    const rejecting = c.confirmReject(second);
    const rej = http.expectOne(r => r.url.endsWith('/SWP-000002/review'));
    expect(rej.request.body).toEqual({ status: 'Rejected', note: 'Faces are not clearly visible' });
    rej.flush(null);
    await rejecting;
    http.match(r => r.url.endsWith('/api/v1/admin/selfies')).forEach(r => r.flush({ items: [], total: 0, page: 1, pageSize: 12, pending: 0, approved: 1, rejected: 1 }));
  });

  it('shows a photo frame with its festival and the selfie it was made from, and filters to frames', async () => {
    const fixture = TestBed.createComponent(ReviewQueue);
    fixture.detectChanges();
    const frame = { ...item('SWP-000009', 'frame'), frameStyle: 'festival-diwali', festival: 'diwali', sourceReference: 'SWP-000003' };
    http.expectOne(r => r.url.endsWith('/api/v1/admin/selfies')).flush({ items: [item('SWP-000001'), frame], total: 2, page: 1, pageSize: 12, pending: 2, approved: 0, rejected: 0 });
    await fixture.whenStable();
    http.match(r => r.url.includes('/api/v1/admin/selfies/files/')).forEach(r => r.flush(new Blob(['x'], { type: 'image/jpeg' })));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    [...el.querySelectorAll<HTMLButtonElement>('[aria-label="Filter by type"] button')].find(b => b.textContent?.includes('Photo frames'))!.click();
    fixture.detectChanges();
    const rows = el.querySelectorAll('.queue-item');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Photo frame');
    expect(rows[0].textContent).toContain('Framed picture');
    (rows[0].querySelector('button[title="Details"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    http.match(r => r.url.includes('/api/v1/admin/selfies/files/')).forEach(r => r.flush(new Blob(['x'], { type: 'image/jpeg' })));
    fixture.detectChanges();
    expect(el.querySelector('.review-list')?.textContent).toContain('Festival: Diwali');
    expect(el.querySelector('.review-list')?.textContent).toContain('SWP-000003');
  });

  it('Auto-approve photo frames: an admin switches it; a moderator only sees it', async () => {
    (TestBed.inject(AuthService).profile as unknown as { set(v: object): void }).set({ roles: ['Admin'] });
    const fixture = TestBed.createComponent(ReviewQueue);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/admin/selfies') && r.method === 'GET').flush({ items: [], total: 0, page: 1, pageSize: 12, pending: 0, approved: 0, rejected: 0 });
    http.expectOne(r => r.url.endsWith('/frame-settings') && r.method === 'GET').flush({ autoApprove: false });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const sw = el.querySelector<HTMLInputElement>('#autoApproveFrames')!;
    expect(sw.checked).toBeFalse();
    expect(sw.disabled).toBeFalse();
    expect(el.querySelector('.auto-approve')?.textContent).toContain('wait here for review');
    sw.checked = true;
    sw.dispatchEvent(new Event('change'));
    const put = http.expectOne(r => r.url.endsWith('/frame-settings') && r.method === 'PUT');
    expect(put.request.body).toEqual({ autoApprove: true });
    put.flush({ autoApprove: true });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('.auto-approve')?.textContent).toContain('go straight to the Photo Frames gallery');
  });

  it('a moderator sees the auto-approve switch but cannot change it', async () => {
    (TestBed.inject(AuthService).profile as unknown as { set(v: object): void }).set({ roles: ['Moderator'] });
    const fixture = TestBed.createComponent(ReviewQueue);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/admin/selfies') && r.method === 'GET').flush({ items: [], total: 0, page: 1, pageSize: 12, pending: 0, approved: 0, rejected: 0 });
    http.expectOne(r => r.url.endsWith('/frame-settings')).flush({ autoApprove: true });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector<HTMLInputElement>('#autoApproveFrames')!.disabled).toBeTrue();
    expect(el.querySelector('.auto-approve')?.textContent).toContain('Only a super admin or admin can change this.');
  });
});
