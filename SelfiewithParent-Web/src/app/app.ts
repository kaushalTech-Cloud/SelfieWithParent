import { isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { I18nService } from './core/i18n/i18n.service';
import { Footer } from './layout/footer';
import { Header } from './layout/header';
import { ReminderNotice } from './layout/reminder-notice';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, ReminderNotice],
  template: `
    <app-header />
    <app-reminder-notice />
    <router-outlet />
    <app-footer />
  `
})
export class App {
  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      inject(I18nService).init();      // language from saved choice, browser or country
      void inject(AuthService).init(); // restore the signed-in visitor, if any
    }
  }
}
