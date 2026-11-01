import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { Dashboard } from './dashboard';
import { Uploads } from './review/uploads';
import { Activity } from './review/activity';

const week = (thisWeek: number, lastWeek: number) => ({ thisWeek, lastWeek });

describe('Dashboard and uploads by visitor', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard, Uploads, Activity],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).profile.set({ publicId: 'x', signUpMethod: 'Email', mobileMasked: null, email: 'a@b.co', fullName: 'A B',
      hasPassword: true, roles: ['Visitor', 'Moderator'] });
  });

  it('dashboard shows the real numbers from the API', async () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/admin/dashboard')).flush({
      pending: 3, oldestPendingAtUtc: new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 19),
      approvedWeek: week(4, 2), sharedWeek: week(9, 5), videosWeek: week(1, 0), newVisitorsWeek: week(6, 3),
      total: 12, approved: 7, rejected: 2, uploaders: 5, photos: 10, videos: 2, voiceNotes: 3, visitors: 40,
      last7Days: Array.from({ length: 7 }, (_, i) => ({ day: `2026-10-${23 + i}`, count: i })),
      byKind: { real: 6, ai: 2, memory: 1, family: 3 },
      queue: [{ publicId: 'q1', reference: 'SWP-000011', kind: 'real', name: 'Asha with Meena', createdAtUtc: '2026-10-29T01:00:00', hasPhoto: true, hasVideo: false, hasVoice: true }]
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const kpis = [...el.querySelectorAll('.kpi .v')].map(v => v.textContent?.trim());
    expect(kpis).toEqual(['3', '4', '2', '40']);
    expect(el.querySelector('.kpi .d.warn')?.textContent).toContain('Oldest: 5 hours');
    expect(el.textContent).toContain('+2 vs last week');
    expect(el.querySelector('.dash-row')?.textContent).toContain('Asha with Meena · SWP-000011');
    expect(el.querySelector('.dash-row')?.textContent).toContain('photo + voice note');
    expect(el.querySelectorAll('.bars > div').length).toBe(7);
    expect(el.querySelector('.alert-warning')).toBeNull();          // 3 waiting for 5 hours: not busy
    expect([...el.querySelectorAll('.stat-tile strong')].map(s => s.textContent?.trim())).toEqual(['12', '7', '2', '10', '2', '3']);
  });

  it('uploads by visitor lists who shared what, and opens a visitor\'s uploads', async () => {
    const fixture = TestBed.createComponent(Uploads);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/admin/selfies/by-visitor')).flush({
      total: 1, page: 1, pageSize: 20, items: [{ publicId: 'v1', fullName: 'Kaushal Kumar Singh', emailMasked: 'k•••@ezist.net', mobileMasked: null,
        status: 'Active', submissions: 3, pending: 1, approved: 2, rejected: 0, photos: 2, videos: 1, voiceNotes: 1,
        firstAtUtc: '2026-10-27T10:00:00', lastAtUtc: '2026-10-29T06:00:00' }]
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const cells = [...el.querySelectorAll('tbody tr:first-child td')].map(td => td.textContent?.trim());
    expect(cells[0]).toContain('Kaushal Kumar Singh');
    expect(cells.slice(1, 5)).toEqual(['3', '2', '1', '1']);
    expect(cells[5]).toContain('1 waiting');
    expect(cells[5]).toContain('2 approved');

    (el.querySelector('tbody tr:first-child button') as HTMLButtonElement).click();
    const detail = http.expectOne(r => r.url.endsWith('/api/v1/admin/selfies/by-visitor/v1'));
    detail.flush({ items: [{ publicId: 's1', reference: 'SWP-000001', kind: 'real', yourName: 'Kaushal Kumar Singh', parentName: 'Mom and DAD', relation: 'Both parents',
      message: 'Care for one another', status: 'Approved', reviewNote: null, reviewedBy: null, createdAtUtc: '2026-10-28T10:00:00',
      files: [{ publicId: 'f1', role: 'main', contentType: 'image/png', sizeBytes: 10, fileName: 'me.png' }, { publicId: 'f2', role: 'voice', contentType: 'audio/webm', sizeBytes: 10, fileName: null }] }] });
    await fixture.whenStable();
    http.match(r => r.url.includes('/files/')).forEach(r => r.flush(new Blob(['x'])));
    fixture.detectChanges();
    const card = el.querySelector('.upload-card-admin');
    expect(card?.textContent).toContain('Kaushal with Mom and DAD');
    expect(card?.textContent).toContain('Voice note');
  });

  it('activity shows uploads and decisions with who and why, and a per-day chart', async () => {
    const fixture = TestBed.createComponent(Activity);
    fixture.detectChanges();
    const req = http.expectOne(r => r.url.endsWith('/api/v1/admin/selfies/activity'));
    expect(req.request.params.get('days')).toBe('30');
    req.flush({ total: 2, page: 1, pageSize: 25, days: 7,
      perDay: Array.from({ length: 7 }, (_, i) => ({ day: `2026-10-${23 + i}`, shared: i, approved: 1, rejected: 0 })),
      items: [
        { type: 'Rejected', atUtc: '2026-10-29T07:00:00', publicId: 's2', reference: 'SWP-000002', kind: 'memory', name: 'Asha with Meena', reviewer: 'Super Admin',
          note: 'The video is too dark.', hasPhoto: false, hasVideo: true, hasVoice: false },
        { type: 'shared', atUtc: '2026-10-29T06:00:00', publicId: 's1', reference: 'SWP-000001', kind: 'ai', name: 'Kaushal with Mom and DAD', reviewer: null,
          note: null, hasPhoto: true, hasVideo: false, hasVoice: true }] });
    await fixture.whenStable();
    fixture.detectChanges();
    const items = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.activity-feed li')].map(li => li.textContent!.replace(/\s+/g, ' '));
    expect(items[0]).toContain('Super Admin rejected Asha with Meena');
    expect(items[0]).toContain('Reason: The video is too dark.');
    expect(items[1]).toContain('Kaushal with Mom and DAD shared a photo and a voice note');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.activity-chart .col').length).toBe(7);
  });

  it('warns at festival peaks: many waiting, or waiting more than a day', async () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/admin/dashboard')).flush({
      pending: 40, oldestPendingAtUtc: new Date(Date.now() - 30 * 3600000).toISOString().slice(0, 19),
      approvedWeek: week(0, 0), sharedWeek: week(40, 5), videosWeek: week(0, 0), newVisitorsWeek: week(0, 0),
      total: 40, approved: 0, rejected: 0, uploaders: 30, photos: 40, videos: 0, voiceNotes: 0, visitors: 50,
      last7Days: [], byKind: {}, queue: []
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const warn = (fixture.nativeElement as HTMLElement).querySelector('.alert-warning');
    expect(warn?.textContent).toContain('Busy time: 40 waiting for review');
    expect(warn?.textContent).toContain('Auto-approve photo frames');
    expect(warn?.querySelector('a')?.getAttribute('href')).toBe('/queue');
  });
});
