import { Component, inject } from '@angular/core';
import { SeoService } from '../../core/seo.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { DonatePill } from '../../shared/donate-pill';

/** Privacy policy — DRAFT, English only until reviewed by a lawyer (DPDP Act 2023). */
@Component({
  selector: 'app-privacy',
  imports: [DonatePill, TranslatePipe],
  styles: `
    .policy { max-width: 780px; margin: 0 auto; }
    .policy h2 { font-size: 1.35rem; color: var(--primary-dark); margin-top: 2rem; }
    .policy p, .policy li { color: #3b474b; line-height: 1.75; }
    .policy .toc { background: var(--soft); border-radius: 14px; padding: 1rem 1.3rem; }
    .policy .toc ol { margin: 0; padding-left: 1.2rem; columns: 2; }
    .draft-banner { border-left: 4px solid var(--gold); background: #fff8e6; padding: .9rem 1.1rem; border-radius: 10px; color: #6b5313; }
    @media (max-width: 575px) { .policy .toc ol { columns: 1; } }
  `,
  template: `
    <header class="page-hero">
      <app-donate-pill />
      <div class="container">
        <span class="eyebrow">{{ 'Your information, your choice' | t }}</span>
        <h1>{{ 'Privacy Policy' | t }}</h1>
        <p class="lead">{{ 'Plain-language answers about what we collect, why, and how you stay in control.' | t }}</p>
      </div>
    </header>
    <main id="main" class="pb-5" tabindex="-1">
      <div class="container">
        <article class="card-soft lift policy" lang="en" dir="ltr">
          <p class="draft-banner"><i class="bi bi-exclamation-triangle"></i> <strong>Draft for review.</strong> This page is a design draft. It must be checked by a qualified lawyer against India's Digital Personal Data Protection Act, 2023 and its rules before the website goes live. Replace every [bracketed] item.</p>
          <p class="small text-muted">Last updated: [date]</p>
          <nav class="toc" aria-label="Contents">
            <ol>
              <li><a href="/privacy#who">Who we are</a></li><li><a href="/privacy#collect">What we collect</a></li>
              <li><a href="/privacy#why">Why we use it</a></li><li><a href="/privacy#children">Children under 18</a></li>
              <li><a href="/privacy#public">What is shown publicly</a></li><li><a href="/privacy#share">Who we share it with</a></li>
              <li><a href="/privacy#keep">How long we keep it</a></li><li><a href="/privacy#rights">Your rights</a></li>
              <li><a href="/privacy#security">Keeping it safe</a></li><li><a href="/privacy#contact">Contact &amp; complaints</a></li>
            </ol>
          </nav>
          <h2 id="who">1. Who we are</h2>
          <p>Selfie with Parent ("we", "us") is run by [organisation name], [registered address]. We decide how your information is used, so we are responsible for it.</p>
          <h2 id="collect">2. What we collect</h2>
          <ul>
            <li><strong>Details you give us:</strong> your name, your parent's or family's name, relationship, city, state and country, mobile number and (optionally) email.</li>
            <li><strong>What you share:</strong> photos, videos, voice notes and messages you upload.</li>
            <li><strong>Volunteer and school forms:</strong> the details you type in those forms.</li>
            <li><strong>Basic technical data:</strong> such as your browser type and language choice, to make the site work. [List any analytics tools here, or state that none are used.]</li>
          </ul>
          <h2 id="why">3. Why we use it</h2>
          <p>We use your information only with your consent, and only to:</p>
          <ul>
            <li>review your submission and, if approved, show it in the gallery;</li>
            <li>contact you about your submission, competitions or the volunteer programme;</li>
            <li>send reminders you have asked for;</li>
            <li>keep the site safe and prevent misuse.</li>
          </ul>
          <p>We do not sell your information, and we do not use it for advertising.</p>
          <h2 id="children">4. Children under 18</h2>
          <p>Accounts are for adults. A parent or guardian signs in and shares on behalf of a child. We do not track children's behaviour or show them targeted advertising. A parent or guardian can ask us to remove a child's submission at any time.</p>
          <h2 id="public">5. What is shown publicly</h2>
          <p>If your submission is approved, we show the photo, video or voice note, the names you entered, your message and your city. <strong>Your mobile number and email are never shown publicly.</strong></p>
          <h2 id="share">6. Who we share it with</h2>
          <p>Only with service providers who help us run the site — for example, hosting and storage, and SMS or WhatsApp messages — under contracts that require them to protect it: [list providers]. We share information with authorities only when the law requires it.</p>
          <h2 id="keep">7. How long we keep it</h2>
          <p>We keep gallery submissions while the campaign runs, and your contact details for [period]. If you withdraw consent or ask us to delete your information, we remove it within [number] days, unless the law requires us to keep it.</p>
          <h2 id="rights">8. Your rights</h2>
          <ul>
            <li>Ask what information we hold about you — or download it yourself from My account.</li>
            <li>Ask us to correct or update it.</li>
            <li>Withdraw your consent and delete your account — as easily as you gave it.</li>
            <li>Nominate someone to exercise these rights for you if you are unable to.</li>
            <li>Raise a complaint with us, and then with the Data Protection Board of India if you are not satisfied.</li>
          </ul>
          <h2 id="security">9. Keeping it safe</h2>
          <p>We use reasonable security measures, such as encrypted connections, sign-in codes instead of passwords, and restricted access for our team. If a breach affects your information, we will inform you and the authorities as the law requires.</p>
          <h2 id="contact">10. Contact &amp; complaints</h2>
          <p>Grievance officer: [name]<br>Email: [privacy&#64;selfiewithparent.org]<br>Address: [address]<br>We aim to respond within [number] days.</p>
        </article>
      </div>
    </main>
  `
})
export class Privacy {
  constructor() {
    inject(SeoService).set({ title: 'Privacy Policy', description: 'How Selfie with Parent collects, uses and protects your information, and how to ask us to remove it.', path: '/privacy' });
  }
}
