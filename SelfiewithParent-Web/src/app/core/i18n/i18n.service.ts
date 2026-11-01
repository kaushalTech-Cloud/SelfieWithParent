import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { I18N_DATA } from './strings';

export type LangCode = 'en' | 'hi' | 'bn' | 'ar' | 'es' | 'fr';

interface LangInfo { name: string; locale: string; font?: string; rtl?: boolean; }

export const LANGUAGES: Record<LangCode, LangInfo> = {
  en: { name: 'English', locale: 'en-IN' },
  hi: { name: 'हिन्दी', locale: 'hi-IN', font: 'Noto Sans Devanagari' },
  bn: { name: 'বাংলা', locale: 'bn-IN', font: 'Noto Sans Bengali' },
  ar: { name: 'العربية', locale: 'ar', font: 'Noto Sans Arabic', rtl: true },
  es: { name: 'Español', locale: 'es' },
  fr: { name: 'Français', locale: 'fr' }
};

// Country → default language
const COUNTRY_LANG: Record<string, LangCode> = {
  IN: 'hi', BD: 'bn',
  AE: 'ar', SA: 'ar', QA: 'ar', KW: 'ar', OM: 'ar', BH: 'ar', EG: 'ar', JO: 'ar', IQ: 'ar', LB: 'ar',
  MA: 'ar', DZ: 'ar', TN: 'ar', LY: 'ar', SY: 'ar', YE: 'ar', SD: 'ar',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', PE: 'es', CL: 'es', VE: 'es', EC: 'es', GT: 'es', CU: 'es',
  BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es',
  FR: 'fr', BE: 'fr', SN: 'fr', CI: 'fr', CM: 'fr', ML: 'fr', BF: 'fr', NE: 'fr', TG: 'fr', BJ: 'fr',
  GA: 'fr', CG: 'fr', CD: 'fr', MG: 'fr', HT: 'fr', LU: 'fr', MC: 'fr'
};

// Time zone → country, to guess the visitor's country without any network call
const TZ_COUNTRY: Record<string, string> = {
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dhaka': 'BD', 'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA',
  'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Muscat': 'OM', 'Asia/Bahrain': 'BH', 'Africa/Cairo': 'EG',
  'Asia/Amman': 'JO', 'Asia/Baghdad': 'IQ', 'Asia/Beirut': 'LB', 'Africa/Casablanca': 'MA', 'Africa/Algiers': 'DZ',
  'Africa/Tunis': 'TN', 'Europe/Madrid': 'ES', 'America/Mexico_City': 'MX', 'America/Argentina/Buenos_Aires': 'AR',
  'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Santiago': 'CL', 'America/Caracas': 'VE',
  'Europe/Paris': 'FR', 'Europe/Brussels': 'BE', 'Africa/Dakar': 'SN', 'Africa/Abidjan': 'CI', 'Europe/Luxembourg': 'LU'
};

const STORE_KEY = 'swp-lang';

/** Runtime translation (switches live, no reload). Keys are the English text; missing entries fall back to English. */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly lang = signal<LangCode>('en');
  readonly locale = computed(() => LANGUAGES[this.lang()].locale);
  readonly isRtl = computed(() => !!LANGUAGES[this.lang()].rtl);
  readonly languages = (Object.keys(LANGUAGES) as LangCode[]).map(code => ({ code, name: LANGUAGES[code].name }));

  /** Called once in the browser (the server always renders English). */
  init(): void {
    if (!this.isBrowser) return;
    this.setLanguage(this.detect(), false);
  }

  t(src: string, vars?: Record<string, string | number>): string {
    let s = this.lookup(src, this.lang());
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
    return s;
  }

  countryLanguage(countryCode: string): LangCode { return COUNTRY_LANG[countryCode] ?? 'en'; }

  setLanguage(lang: LangCode, remember: boolean): void {
    if (!LANGUAGES[lang]) lang = 'en';
    this.lang.set(lang);
    if (!this.isBrowser) return;
    if (remember) { try { localStorage.setItem(STORE_KEY, lang); } catch { /* private mode */ } }

    const html = this.doc.documentElement;
    html.lang = lang;
    html.dir = LANGUAGES[lang].rtl ? 'rtl' : 'ltr';

    // Bootstrap is loaded as a separate stylesheet so it can be swapped for its right-to-left build
    const bs = this.doc.getElementById('bootstrap-css') as HTMLLinkElement | null;
    const want = LANGUAGES[lang].rtl ? 'bootstrap-rtl.css' : 'bootstrap-ltr.css';
    if (bs && !bs.href.endsWith(want)) bs.href = want;

    const font = LANGUAGES[lang].font;
    if (font && !this.doc.getElementById('font-' + lang)) {
      const link = this.doc.createElement('link');
      link.id = 'font-' + lang;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=' + font.replace(/ /g, '+') + ':wght@400;500;600;700&display=swap';
      this.doc.head.appendChild(link);
    }
  }

  private lookup(src: string, lang: LangCode): string {
    if (lang === 'en') return src;
    const idx = I18N_DATA.langs.indexOf(lang);
    const row = I18N_DATA.strings[src];
    const value = row && idx >= 0 ? row[idx] : null;
    return value ?? src;
  }

  /** English by default. Another language only when chosen (saved) or asked for in the link (?lang=hi). */
  private detect(): LangCode {
    const q = new URLSearchParams(location.search).get('lang') as LangCode | null;
    if (q && LANGUAGES[q]) return q;
    try {
      const saved = localStorage.getItem(STORE_KEY) as LangCode | null;
      if (saved && LANGUAGES[saved]) return saved;
    } catch { /* private mode */ }
    return 'en';
  }

  /** The visitor's likely country from their time zone (used to suggest a language, never to switch automatically). */
  guessCountry(): string {
    if (!this.isBrowser) return '';
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''; } catch { /* old browser */ }
    return TZ_COUNTRY[tz] ?? (/-([A-Z]{2})\b/i.exec(navigator.language ?? '')?.[1] ?? '').toUpperCase();
  }
}
