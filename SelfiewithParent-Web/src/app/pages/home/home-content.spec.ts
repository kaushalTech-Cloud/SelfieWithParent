import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { HeroSlider } from './hero-slider';
import { DEFAULT_SLIDES, DEFAULT_STATS_NOTE, buildHomeView } from './home-content';

const t = (s: string) => `[${s}]`;   // a pretend translation, to see which text is a default
const numbers = { selfies: 412, towns: 37, countries: 5, families: 20, visitors: 900 };

describe('Home page content', () => {
  it('nothing set: every section shows the built-in content, translated — never blank', () => {
    const v = buildHomeView(null, null, null, t, 9);
    expect(v.slides.length).toBe(3);
    expect(v.slides[0].title).toBe(`[${DEFAULT_SLIDES[0].title}]`);
    expect(v.slides[0].buttons.map(b => b.link)).toEqual(['/upload', '/selfies']);
    expect(v.tiles.length).toBe(4);
    expect(v.story.quote).toContain('[');
    expect(v.story.name).toBeTruthy();
    expect(v.stats.length).toBe(4);
    expect(v.statsNote).toBe(`[${DEFAULT_STATS_NOTE}]`);
    expect(v.questions.length).toBeGreaterThan(5);
    expect(v.theme.title).toBe('[Festival of Lights]');           // October's built-in theme
    expect(v.priorities.length).toBe(4);
    expect(v.pledge.count).toBe(48213);
    expect(v.app.playUrl).toBe('');
  });

  it('staff content shows; what they leave empty falls back to English, then to the default', () => {
    const en = {
      slides: [{ title: 'Light a diya together', image: 'media/0b1e0b1e-0000-4000-8000-000000000001', button1Label: 'Share', button1Link: '/upload' }, { title: 'Second' }],
      story: { quote: 'I started this because…', name: 'Asha Rao' },
      stats: [{ label: 'Selfies shared', source: 'selfies' }, { label: 'Health camps', value: 45 }],
      themes: [{ month: 9, title: 'Diwali selfies', text: 'Light a diya with them.' }],
      app: { playUrl: 'https://play.google.com/store/apps/details?id=x' }
    };
    const hi = { slides: [{ title: 'साथ में दीया जलाएँ' }] };
    const v = buildHomeView(en, hi, numbers, t, 9);
    expect(v.slides.map(s => s.title)).toEqual(['साथ में दीया जलाएँ']);              // Hindi has its own list
    expect(v.slides[0].image).toContain('/api/v1/media/0b1e0b1e');                 // ... the picture from English
    expect(v.slides[0].buttons[0]).toEqual({ label: 'Share', link: '/upload' });
    expect(v.slides[0].eyebrow).toBe(`[${DEFAULT_SLIDES[0].eyebrow}]`);              // ... and the default where both are empty
    expect(v.story.quote).toBe('I started this because…');
    expect(v.story.eyebrow).toBe('[Our story]');
    expect(v.stats).toEqual([{ label: 'Selfies shared', value: 412 }, { label: 'Health camps', value: 45 }]);   // counted from the database
    expect(v.statsNote).toBe('');                                                     // their own numbers: no "sample" note
    expect(v.theme.title).toBe('Diwali selfies');
    expect(v.app.playUrl).toContain('play.google.com');
    expect(v.tiles.length).toBe(4);                                                   // not set: the defaults
  });

  it('photo features: built-in cards until staff change them; their words, order and hidden cards win', () => {
    const d = buildHomeView(null, null, null, t, 9).showcase;
    expect(d.show).toBeTrue();
    expect(d.cards.map(c => c.kind)).toEqual(['frame', 'reel', 'contest', 'tree']);
    expect(d.cards[0].button).toBe('[Make a photo frame]');
    const en = { showcase: { title: 'Make something lovely', cards: [{ kind: 'reel', title: 'Your reel' }, { kind: 'tree', hidden: true }, { kind: 'frame' }] } };
    const v = buildHomeView(en, null, null, t, 9).showcase;
    expect(v.title).toBe('Make something lovely');
    expect(v.cards.map(c => c.kind)).toEqual(['reel', 'frame']);       // staff's order; the tree is hidden; the contest isn't listed
    expect(v.cards[0].title).toBe('Your reel');
    expect(v.cards[1].text).toContain('[');                            // empty: the built-in words
    const hi = buildHomeView(en, { showcase: { cards: [{ kind: 'reel', title: 'आपकी रील' }] } }, null, t, 9).showcase;
    expect(hi.cards.map(c => c.kind)).toEqual(['reel']);
    expect(hi.cards[0].title).toBe('आपकी रील');
    expect(buildHomeView({ showcase: { hidden: true } }, null, null, t, 9).showcase.show).toBeFalse();
  });

  it('a counted number that is still 0 shows the typed or sample figure instead', () => {
    const v = buildHomeView({ stats: [{ label: 'Selfies', source: 'selfies', value: 100 }] }, null, { ...numbers, selfies: 0 }, t, 0);
    expect(v.stats[0].value).toBe(100);
  });

  it('the slider shows one slide at a time, with arrows and dots', () => {
    TestBed.configureTestingModule({ imports: [HeroSlider], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(HeroSlider);
    fixture.componentRef.setInput('slides', buildHomeView(null, null, null, s => s, 0).slides);
    fixture.componentRef.setInput('trustLine', '412 selfies shared');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.hs-slide').length).toBe(3);
    expect(el.querySelector('.hs-slide.active h1')?.textContent).toContain('They held your hand first.');
    expect(el.querySelector('.hero-trust')?.textContent).toContain('412 selfies shared');
    (el.querySelector('.hs-arrow.next') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.hs-slide.active h2')?.textContent).toContain('Every heart is a vote.');
    expect(el.querySelector('.hero-trust')).toBeNull();                    // the trust line is on the first slide
    (el.querySelectorAll('.hs-dots button')[2] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.hs-slide.active a')?.getAttribute('href')).toBe('/account#reminders');
    (el.querySelector('.hs-arrow.next') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.hs-slide.active h1')).not.toBeNull();        // round again to the first
  });
});
