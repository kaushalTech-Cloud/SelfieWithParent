import { Component, computed, input } from '@angular/core';

/** Content text with [bracketed] placeholders highlighted, so the owner can see what still needs replacing. Text only, never HTML. */
@Component({
  selector: 'swp-text',
  host: { style: 'display: contents' },
  template: `@for (p of parts(); track $index) { @if (p.ph) { <span class="ph">{{ p.text }}</span> } @else { {{ p.text }} } }`
})
export class ContentText {
  readonly value = input<unknown>('');
  protected readonly parts = computed(() => {
    const v = this.value();
    if (typeof v !== 'string' && typeof v !== 'number') return [];
    return String(v).split(/(\[[^\]]+\])/).filter(Boolean).map(text => ({ text, ph: /^\[[^\]]+\]$/.test(text) }));
  });
}
