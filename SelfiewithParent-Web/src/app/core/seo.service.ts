import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { environment } from '../../environments/environment';

/**
 * Page title + share-preview tags (Open Graph for WhatsApp / Facebook / LinkedIn / Telegram, Twitter cards for X).
 * Runs on the server too, so the apps that build link previews see them in the HTML: a big picture, the title, the
 * message — and, for a video, the video itself (Facebook / Telegram play it in the preview).
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  set(page: { title: string; description: string; path: string; image?: string; imageAlt?: string; video?: string; videoType?: string;
    type?: 'website' | 'article' | 'video.other'; noIndex?: boolean }): void {
    const fullTitle = page.title.includes('Selfie with Parent') ? page.title : `${page.title} | Selfie with Parent`;
    const url = environment.siteUrl + page.path;
    const image = page.image ?? environment.siteUrl + '/img/og-image.jpg';
    const description = page.description.length > 200 ? page.description.slice(0, 197).trimEnd() + '…' : page.description;
    this.title.setTitle(fullTitle);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:site_name', content: 'Selfie with Parent' });
    this.meta.updateTag({ property: 'og:type', content: page.type ?? (page.video ? 'video.other' : page.image ? 'article' : 'website') });
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:image:secure_url', content: image });
    this.meta.updateTag({ property: 'og:image:alt', content: page.imageAlt ?? fullTitle });
    // The built-in picture is 1200 × 630; a visitor's photo can be any size, so don't claim one
    if (page.image) { this.meta.removeTag("property='og:image:width'"); this.meta.removeTag("property='og:image:height'"); }
    else { this.meta.updateTag({ property: 'og:image:width', content: '1200' }); this.meta.updateTag({ property: 'og:image:height', content: '630' }); }
    if (page.video) {
      this.meta.updateTag({ property: 'og:video', content: page.video });
      this.meta.updateTag({ property: 'og:video:secure_url', content: page.video });
      this.meta.updateTag({ property: 'og:video:type', content: page.videoType ?? 'video/mp4' });
    } else {
      for (const p of ['og:video', 'og:video:secure_url', 'og:video:type']) this.meta.removeTag(`property='${p}'`);
    }
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: fullTitle });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: image });
    this.meta.updateTag({ name: 'twitter:image:alt', content: page.imageAlt ?? fullTitle });
    this.meta.updateTag({ name: 'robots', content: page.noIndex ? 'noindex' : 'index, follow' });
  }
}
