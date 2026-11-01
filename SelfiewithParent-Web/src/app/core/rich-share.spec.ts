import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { RichShareService } from './rich-share';
import { SeoService } from './seo.service';

describe('Rich sharing', () => {
  let shared: ShareData[];
  const realShare = navigator.share, realCanShare = navigator.canShare, realFetch = window.fetch;

  beforeEach(() => {
    shared = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: (d: ShareData) => { shared.push(d); return Promise.resolve(); } });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d: ShareData) => !!d.files });
    window.fetch = (() => Promise.resolve(new Response(new Blob(['jpeg'], { type: 'image/jpeg' })))) as typeof fetch;
  });
  afterEach(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: realShare });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: realCanShare });
    window.fetch = realFetch;
  });

  it('shares the real photo with the caption and the link in the text', async () => {
    const r = await TestBed.inject(RichShareService).share({ title: 'Asha with Maa', text: 'Asha with Maa #SelfieWithParent',
      url: 'https://www.selfiewithparent.org/selfies/1', media: [{ url: 'https://api.example/files/p1', kind: 'photo' }] });
    expect(r).toBe('shared');
    expect(shared[0].files?.length).toBe(1);
    expect(shared[0].files![0].name).toBe('Asha-with-Maa.jpg');
    expect(shared[0].text).toContain('https://www.selfiewithparent.org/selfies/1');
  });

  it('no photo or video: shares the link', async () => {
    await TestBed.inject(RichShareService).share({ title: 'A story', text: 'A story', url: 'https://www.selfiewithparent.org/x', media: [null] });
    expect(shared[0].files).toBeUndefined();
    expect(shared[0].url).toBe('https://www.selfiewithparent.org/x');
  });

  it('a page with a video gets video preview tags and a big-picture card; others drop them', () => {
    const seo = TestBed.inject(SeoService), meta = TestBed.inject(Meta);
    seo.set({ title: 'Asha with Maa', description: 'Thank you', path: '/selfies/1', image: 'https://api.example/p.jpg', video: 'https://api.example/v.mp4' });
    expect(meta.getTag("property='og:video'")?.content).toBe('https://api.example/v.mp4');
    expect(meta.getTag("property='og:type'")?.content).toBe('video.other');
    expect(meta.getTag("name='twitter:image'")?.content).toBe('https://api.example/p.jpg');
    expect(meta.getTag("property='og:image:width'")).toBeNull();          // a visitor's photo: no made-up size
    seo.set({ title: 'Home', description: 'Hi', path: '/' });
    expect(meta.getTag("property='og:video'")).toBeNull();
    expect(meta.getTag("property='og:image:width'")?.content).toBe('1200');
  });
});
