import {
  Component, ElementRef, HostListener, computed, effect, inject, input, model, signal, untracked, viewChild, viewChildren
} from '@angular/core';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/t.pipe';
import { DIAL_CODES } from './dial-countries';

/** A calling code with the country it belongs to (flag file = ISO code, from the flag-icons package). */
export interface DialCountry { dial: string; iso: string; name: string; }

/** Which country to show when a code is shared by several (e.g. +1 → United States). */
const PREFERRED: Record<string, string> = {
  '+1': 'us', '+7': 'ru', '+44': 'gb', '+39': 'it', '+47': 'no', '+61': 'au', '+212': 'ma',
  '+262': 're', '+358': 'fi', '+590': 'gp', '+599': 'cw'
};

/**
 * Country-code picker with flags, for every country. A native <select> can't show images (and Windows doesn't
 * draw flag emoji), so this is a small listbox: click or Enter/Space/↓ opens it, ↑/↓ moves, Enter picks, Esc closes,
 * and typing a country's name jumps to it. Names are shown in the visitor's language.
 */
@Component({
  selector: 'app-dial-code-select',
  imports: [TranslatePipe],
  template: `
    <button type="button" class="form-select dial-select dial-trigger" [id]="id()"
            aria-haspopup="listbox" [attr.aria-expanded]="open()" [attr.aria-label]="'Country code' | t"
            [title]="current().name" (click)="toggle()" (keydown)="onTriggerKey($event)">
      <img class="dial-flag" [src]="flag(current().iso)" alt="" width="20" height="15">
      <span>{{ current().dial }}</span>
    </button>
    @if (open()) {
      <ul #list class="dial-list" role="listbox" tabindex="-1" [attr.aria-label]="'Country code' | t"
          [attr.aria-activedescendant]="id() + '-opt-' + active()" (keydown)="onListKey($event)">
        @for (c of countries(); track c.iso; let i = $index) {
          <li #option role="option" class="dial-option" [id]="id() + '-opt-' + i"
              [class.active]="i === active()" [attr.aria-selected]="c.iso === current().iso"
              (click)="pick(i)" (mouseenter)="active.set(i)">
            <img class="dial-flag" [src]="flag(c.iso)" alt="" width="20" height="15" loading="lazy">
            <span class="dial-name">{{ c.name }}</span>
            <span class="dial-code">{{ c.dial }}</span>
          </li>
        }
      </ul>
    }
  `,
  host: { class: 'dial-picker' }
})
export class DialCodeSelect {
  readonly value = model('+91');
  readonly id = input('dial');

  private readonly i18n = inject(I18nService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly options = viewChildren<ElementRef<HTMLLIElement>>('option');
  private readonly list = viewChild<ElementRef<HTMLUListElement>>('list');

  constructor() {
    // Once the list is on screen: give it the keyboard and show the chosen country in the middle
    effect(() => {
      const el = this.list()?.nativeElement;
      if (!el) return;
      el.focus();
      this.options()[untracked(this.active)]?.nativeElement.scrollIntoView({ block: 'center' });
    });
  }

  /** Every country, named in the current language and sorted by that name. */
  protected readonly countries = computed<DialCountry[]>(() => {
    const lang = this.i18n.lang();
    let names: Intl.DisplayNames | null = null;
    try { names = new Intl.DisplayNames([lang, 'en'], { type: 'region' }); } catch { /* very old browser: show codes */ }
    return DIAL_CODES
      .map(([iso, dial]) => ({ iso, dial, name: names?.of(iso.toUpperCase()) ?? iso.toUpperCase() }))
      .sort((a, b) => a.name.localeCompare(b.name, lang));
  });

  /** The country picked here; when the code is set from outside, the usual country for that code. */
  private readonly pickedIso = signal<string | null>(null);
  protected readonly current = computed<DialCountry>(() => {
    const list = this.countries();
    const dial = this.value();
    const picked = list.find(c => c.iso === this.pickedIso() && c.dial === dial);
    return picked
      ?? list.find(c => c.iso === PREFERRED[dial])
      ?? list.find(c => c.dial === dial)
      ?? list.find(c => c.iso === 'in')!;
  });

  protected readonly open = signal(false);
  protected readonly active = signal(0);
  private typed = '';
  private typedAt = 0;

  protected flag(iso: string): string { return `img/flags/${iso}.svg`; }

  protected toggle(): void { this.open() ? this.close() : this.show(); }

  protected pick(i: number): void {
    const c = this.countries()[i];
    this.pickedIso.set(c.iso);
    this.value.set(c.dial);
    this.close();
  }

  protected onTriggerKey(e: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); this.show(); }
  }

  protected onListKey(e: KeyboardEvent): void {
    const last = this.countries().length - 1;
    switch (e.key) {
      case 'ArrowDown': this.move(Math.min(this.active() + 1, last)); break;
      case 'ArrowUp': this.move(Math.max(this.active() - 1, 0)); break;
      case 'PageDown': this.move(Math.min(this.active() + 8, last)); break;
      case 'PageUp': this.move(Math.max(this.active() - 8, 0)); break;
      case 'Home': this.move(0); break;
      case 'End': this.move(last); break;
      case 'Enter': this.pick(this.active()); break;
      case 'Escape': this.close(); break;
      case 'Tab': this.open.set(false); return;
      default: {
        // Type the start of a country's name to jump to it ("uni" → United Arab Emirates, United Kingdom …)
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
        const now = Date.now();
        this.typed = (now - this.typedAt > 700 ? '' : this.typed) + e.key.toLocaleLowerCase();
        this.typedAt = now;
        if (this.typed === ' ') { this.typed = ''; this.pick(this.active()); break; }
        const i = this.countries().findIndex(c => c.name.toLocaleLowerCase().startsWith(this.typed));
        if (i >= 0) this.move(i);
      }
    }
    e.preventDefault();
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(e: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }

  private show(): void {
    this.active.set(Math.max(0, this.countries().findIndex(c => c.iso === this.current().iso)));
    this.typed = '';
    this.open.set(true);
  }

  private close(): void {
    this.open.set(false);
    (this.host.nativeElement.querySelector('.dial-trigger') as HTMLElement | null)?.focus();
  }

  private move(i: number): void {
    this.active.set(i);
    this.options()[i]?.nativeElement.scrollIntoView({ block: 'nearest' });
  }
}
