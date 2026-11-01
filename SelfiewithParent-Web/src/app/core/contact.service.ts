import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';

export interface ContactDetails { email: string; phone: string; address: string; }

/**
 * The website's contact details (top bar and "Get in touch"), set by staff in the admin site. Loaded once in the browser;
 * the site's address is shown until then (and if the API can't be reached). An empty value is not shown.
 */
@Injectable({ providedIn: 'root' })
export class ContactService {
  readonly details = signal<ContactDetails>({ email: 'hello@selfiewithparent.org', phone: '', address: '' });

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    inject(HttpClient).get<ContactDetails>(`${environment.apiBaseUrl}/api/v1/site/contact`)
      .subscribe({ next: d => this.details.set(d), error: () => { /* keep the site's address */ } });
  }

  /** "tel:" link: digits and + only. */
  static telHref(phone: string): string { return 'tel:' + phone.replace(/[^\d+]/g, ''); }
}
