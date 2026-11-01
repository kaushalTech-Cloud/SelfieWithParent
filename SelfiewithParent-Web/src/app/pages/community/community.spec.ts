import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { FamilyTree } from './family-tree';
import { Memories } from './memories';
import { ThenNow } from './then-now';
import { FamilyTreeDraft, ThenNowDraft } from './then-now-draft';

describe('Community pages', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ThenNow, Memories, FamilyTree],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(I18nService).setLanguage('en', false);
  });

  it('Then & Now shows the approved pairs with their years', () => {
    const fixture = TestBed.createComponent(ThenNow);
    fixture.detectChanges();
    const req = http.expectOne(r => r.url.endsWith('/api/v1/selfies/gallery'));
    expect(req.request.params.get('tab')).toBe('thennow');
    req.flush({ total: 1, items: [{ publicId: 'p1', kind: 'thennow', firstName: 'Asha', parentName: 'Papa', place: 'Pune', photoId: 'now1', thenId: 'then1', thenYear: 1998, nowYear: 2026 }] });
    fixture.detectChanges();
    const card = (fixture.nativeElement as HTMLElement).querySelector('.compare-card')!;
    expect(card.querySelector('h3')?.textContent).toContain('Asha with Papa');
    expect(card.querySelector('.tag.then')?.textContent).toContain('1998');
    expect(card.querySelector<HTMLImageElement>('.then-layer')?.src).toContain('/api/v1/selfies/files/then1');
  });

  it('Then & Now "Submit to the gallery" hands the pair to the upload form', () => {
    const fixture = TestBed.createComponent(ThenNow);
    const c = fixture.componentInstance as unknown as { thenFile: { set(f: File): void }; nowFile: { set(f: File): void }; thenYear: string; submit(): void };
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    c.thenFile.set(new File(['a'], 'then.jpg', { type: 'image/jpeg' }));
    c.nowFile.set(new File(['b'], 'now.jpg', { type: 'image/jpeg' }));
    c.thenYear = '1998';
    c.submit();
    expect(router.navigate).toHaveBeenCalledWith(['/upload'], { queryParams: { kind: 'thennow' } });
    expect(TestBed.inject(ThenNowDraft).take()?.thenYear).toBe('1998');
    http.match(() => true).forEach(r => r.flush({ items: [], total: 0 }));
  });

  it('Memory Wall shows tributes and the wall\'s candles; lighting one needs sign-in', async () => {
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'init').and.resolveTo();
    const fixture = TestBed.createComponent(Memories);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/selfies/gallery') && r.params.get('tab') === 'memory').flush({ total: 1, counts: { candles: 42 },
      items: [{ publicId: 'm1', firstName: 'Asha', parentName: 'Nani', relation: 'Grandmother', memoryYear: 2020, place: 'Kochi', message: 'We miss you', photoId: 'p1', candles: 7 }] });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.pledge-count')?.textContent?.trim()).toBe('42');
    expect(el.querySelector('.memory-card h3')?.textContent).toContain('Nani');
    expect(el.querySelector('.candle-btn')?.textContent).toContain('Light a candle · 7');

    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    (el.querySelector('.candle-btn') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/memories' } });
  });

  it('Family Tree grows with the family: add people and generations, and the picture gets bigger', () => {
    localStorage.removeItem('swp-family-tree');
    const fixture = TestBed.createComponent(FamilyTree);
    fixture.detectChanges();
    type P = { relation: string; name: string; gen: number };
    const c = fixture.componentInstance as unknown as { people: () => P[]; familyTitle: string; draw(): void; add(g: object): void;
      showGen(id: number): void; hideGen(g: object): void; generations: { id: number }[]; size: () => { w: number; h: number } };
    const el = fixture.nativeElement as HTMLElement;
    expect(c.people().length).toBe(7);                     // starts like the design: 4 grandparents, 2 parents, you
    const start = c.size();

    const ctx = el.querySelector('canvas')!.getContext('2d')!;
    const drawn: string[] = [];
    spyOn(ctx, 'fillText').and.callFake((t: string) => { drawn.push(t); });
    c.familyTitle = 'The Sharma family';
    c.people().find(p => p.relation === 'You')!.name = 'Asha';
    c.showGen(4);                                           // add Children
    for (let i = 0; i < 8; i++) c.add(c.generations[3]);    // a big row: you + 8 brothers / sisters / partners
    c.draw();
    fixture.detectChanges();

    expect(drawn).toContain('The Sharma family');
    expect(drawn).toContain('Asha');
    expect(c.people().filter(p => p.gen === 4).length).toBe(1);
    expect(c.size().h).toBeGreaterThan(start.h);            // one more generation: taller
    expect(c.size().w).toBeGreaterThan(start.w);            // 9 in a row: wider
    expect(el.querySelectorAll('.gen-box').length).toBe(4);

    c.hideGen(c.generations[1]);                            // no grandparents
    fixture.detectChanges();
    expect(c.people().some(p => p.gen === 1)).toBeFalse();
    expect(el.querySelectorAll('.gen-box').length).toBe(3);
    expect(JSON.parse(localStorage.getItem('swp-family-tree')!).people.length).toBe(c.people().length);   // remembered in this browser
    localStorage.removeItem('swp-family-tree');
  });

  it('Family Tree "Post to the gallery" makes the picture and opens the upload form (sign-in first when signed out)', async () => {
    localStorage.removeItem('swp-family-tree');
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'init').and.resolveTo();
    const fixture = TestBed.createComponent(FamilyTree);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const btn = el.querySelector('.post-tree button') as HTMLButtonElement;
    expect(btn.textContent).toContain('Sign in to post to the gallery');   // signed out
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    (fixture.componentInstance as unknown as { familyTitle: string }).familyTitle = 'The Sharma family';
    await (fixture.componentInstance as unknown as { post(): Promise<void> }).post();
    expect(router.navigate).toHaveBeenCalledWith(['/upload'], { queryParams: { kind: 'family', from: 'tree' } });   // the form's guard asks to sign in
    const posted = TestBed.inject(FamilyTreeDraft).take();
    expect(posted?.picture.type).toBe('image/jpeg');
    expect(posted?.familyName).toBe('The Sharma family');
    expect(posted?.people).toBe(7);
    expect(posted?.generations).toBe(3);
  });
});
