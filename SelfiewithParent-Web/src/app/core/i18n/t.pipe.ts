import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from './i18n.service';

/** {{ 'Home' | t }} or {{ 'in {n} days' | t: { n: 5 } }} — re-evaluates when the language changes. */
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(src: string, vars?: Record<string, string | number>): string {
    this.i18n.lang();               // read the signal so a language switch refreshes the view
    return this.i18n.t(src, vars);
  }
}
