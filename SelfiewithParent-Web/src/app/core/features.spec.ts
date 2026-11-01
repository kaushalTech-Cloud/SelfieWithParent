import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { DonatePill } from '../shared/donate-pill';
import { FeaturesService, featureGuard } from './features.service';
import { FeatureShowcase } from '../pages/home/feature-showcase';
import { buildHomeView } from '../pages/home/home-content';

describe('Site features (switched on / off in the admin site)', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DonatePill, FeatureShowcase], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  const answer = (features: Record<string, boolean>) =>
    http.expectOne(r => r.url.endsWith('/api/v1/site/features')).flush({ features, show: {} });

  it('everything is on until the switches arrive, and if the API cannot be reached', async () => {
    const f = TestBed.inject(FeaturesService);
    expect(f.on('support')).toBeTrue();
    http.expectOne(r => r.url.endsWith('/api/v1/site/features')).flush(null, { status: 500, statusText: 'Down' });
    await f.ready;
    expect(f.on('support')).toBeTrue();
  });

  it('a switched-off feature: its page shows "not available", its Donate button disappears', async () => {
    const fixture = TestBed.createComponent(DonatePill);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.donate-pill')).not.toBeNull();
    answer({ support: false, contest: true });
    const f = TestBed.inject(FeaturesService);
    await f.ready;
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.donate-pill')).toBeNull();
    const off = await TestBed.runInInjectionContext(() => featureGuard('support')({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
    expect((off as UrlTree).toString()).toBe('/not-available');
    expect(await TestBed.runInInjectionContext(() => featureGuard('contest')({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot))).toBeTrue();
  });

  it('the home showcase leaves out cards of switched-off features', async () => {
    const fixture = TestBed.createComponent(FeatureShowcase);
    fixture.componentRef.setInput('content', buildHomeView(null, null, null, s => s, 9).showcase);
    fixture.detectChanges();
    answer({ reels: false, 'family-tree': false });
    http.match(() => true).forEach(r => r.flush({ items: [], contests: [] }));
    await TestBed.inject(FeaturesService).ready;
    fixture.detectChanges();
    const titles = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.sc-card h3')].map(h => h.textContent?.trim());
    expect(titles).toEqual(['Photo frame', 'Photo of the Week']);
  });
});
