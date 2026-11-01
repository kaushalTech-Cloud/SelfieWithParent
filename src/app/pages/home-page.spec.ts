import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HomePage } from './home-page';

const numbers = { selfies: 412, towns: 37, countries: 5, families: 20, visitors: 900 };

describe('Home page editor', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HomePage], providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  it('shows the built-in content as placeholders, and saves only what is filled in', async () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/v1/admin/home') && r.params.get('lang') === 'en').flush({ language: 'en', content: null, updatedAtUtc: null, numbers });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('built-in 3 slides');
    expect(el.querySelector<HTMLTextAreaElement>('textarea[placeholder]')?.placeholder).toContain('Our parents and grandparents');   // founder's message default

    const c = fixture.componentInstance as unknown as {
      startFrom(l: string): void; c: { slides: Record<string, unknown>[] }; story: Record<string, unknown>; questionsText: string; save(): Promise<void>;
      themes: { month: number; title: string }[];
    };
    c.startFrom('slides');
    fixture.detectChanges();
    expect(el.querySelectorAll('.hp-item:not(.sc-item) .hp-item-head').length).toBe(3);                // the built-in slides, ready to edit
    c.c.slides[0]['title'] = 'Light a diya together';
    c.c.slides.splice(2, 1);
    c.story['quote'] = '  I started this because…  ';
    c.questionsText = 'What was your first job?\n\nWho was your best friend?';
    c.themes[9].title = 'Diwali selfies';
    const saving = c.save();
    const put = http.expectOne(r => r.method === 'PUT' && r.url.endsWith('/api/v1/admin/home'));
    expect(put.request.params.get('lang')).toBe('en');
    const body = put.request.body as Record<string, unknown>;
    expect((body['slides'] as Record<string, unknown>[]).length).toBe(2);
    expect((body['slides'] as Record<string, unknown>[])[0]['title']).toBe('Light a diya together');
    expect(body['story']).toEqual({ quote: 'I started this because…' });
    expect(body['questions']).toEqual(['What was your first job?', 'Who was your best friend?']);
    expect(body['themes']).toEqual([{ month: 9, title: 'Diwali selfies' }]);
    expect(body['tiles']).toBeUndefined();                                       // not touched: the website keeps its tiles
    put.flush(null, { status: 204, statusText: 'No Content' });
    await new Promise(r => setTimeout(r));
    http.expectOne(r => r.url.endsWith('/api/v1/admin/home')).flush({ language: 'en', content: body, updatedAtUtc: '2026-10-30T08:00:00', numbers });
    await saving;
    fixture.detectChanges();
    expect(el.querySelector('.alert-success')?.textContent).toContain('the website shows it now');
  });

  it('photo features: hide a card, reorder, change words; nothing saved when untouched', async () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    http.expectOne(r => r.params.get('lang') === 'en').flush({ language: 'en', content: null, updatedAtUtc: null, numbers });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.sc-item').length).toBe(4);
    const c = fixture.componentInstance as unknown as {
      payload(): Record<string, unknown>; moveCard(i: number, by: number): void;
      scCards: { kind: string; hidden: boolean; title: string }[]; showcase: { hidden: boolean; title: string };
    };
    expect(c.payload()['showcase']).toBeUndefined();                   // untouched: the website keeps its built-in section
    c.moveCard(1, -1);                                                  // reel first
    c.scCards.find(x => x.kind === 'tree')!.hidden = true;
    c.scCards[0].title = 'Your reel';
    c.showcase.title = 'Make something lovely';
    expect(c.payload()['showcase']).toEqual({
      title: 'Make something lovely',
      cards: [{ kind: 'reel', title: 'Your reel' }, { kind: 'frame' }, { kind: 'contest' }, { kind: 'tree', hidden: true }]
    });
    c.showcase.hidden = true;
    expect((c.payload()['showcase'] as Record<string, unknown>)['hidden']).toBeTrue();
  });

  it('another language: English is the placeholder', async () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    http.expectOne(r => r.params.get('lang') === 'en').flush({ language: 'en', content: { story: { quote: 'English message' } }, updatedAtUtc: null, numbers });
    await fixture.whenStable();
    const c = fixture.componentInstance as unknown as { switchLang(l: string): Promise<void>; phObj(o: string, k: string): string };
    const switching = c.switchLang('hi');
    http.expectOne(r => r.params.get('lang') === 'hi').flush({ language: 'hi', content: null, updatedAtUtc: null, numbers });
    await new Promise(r => setTimeout(r));
    http.expectOne(r => r.params.get('lang') === 'en').flush({ language: 'en', content: { story: { quote: 'English message' } }, updatedAtUtc: null, numbers });
    await switching;
    expect(c.phObj('story', 'quote')).toBe('English message');
  });
});
