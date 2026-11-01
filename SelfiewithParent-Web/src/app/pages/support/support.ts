import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, PLATFORM_ID, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { RazorpayOrder, payWithRazorpay } from '../../core/razorpay';
import { SeoService } from '../../core/seo.service';
import { LikeShare } from '../../shared/like-share';
import { SiteLink } from '../../shared/site-link';
import { Campaign, SupportApi, buildSupportView } from './support-content';
import { homeImage } from '../home/home-content';

const API = `${environment.apiBaseUrl}/api/v1/support`;

/**
 * /support — Support Selfie with Parent: campaigns with progress, donating (Razorpay; closed with "open soon" until staff
 * switch it on and the keys are set up), other ways to help (volunteer / CSR / wishlist enquiries go to the admin site's
 * Messages), trust and transparency, partners, the donor wall and FAQs. Every word is editable in the admin site.
 */
@Component({
  selector: 'app-support',
  imports: [FormsModule, TranslatePipe, LikeShare, SiteLink],
  styleUrl: '../../../styles/support.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="sp-page">
      @let v = view();
      <header class="sp-hero">
        @if (v.hero.image) { <div class="sp-hero-photo" aria-hidden="true" [style.background-image]="'url(' + v.hero.image + ')'"></div> }
        <span class="sp-glow g1" aria-hidden="true"></span><span class="sp-glow g2" aria-hidden="true"></span>
        <div class="container sp-hero-grid">
          <div>
            <span class="sp-eyebrow"><i class="bi bi-heart-fill"></i> {{ v.hero.eyebrow }}</span>
            <h1>{{ v.hero.title }} <em>{{ v.hero.highlight }}</em></h1>
            <p class="lead">{{ v.hero.text }}</p>
            <div class="sp-hero-actions">
              @if (!hide('donate')) { <a class="btn btn-accent" href="#donate"><i class="bi bi-heart"></i> {{ 'Donate now' | t }}</a> }
              @if (!hide('ways')) { <a class="btn btn-ghost-light" href="#ways"><i class="bi bi-people"></i> {{ 'Other ways to help' | t }}</a> }
            </div>
          </div>
          @if (!hide('stats')) {
          <div class="sp-stats">
            <div><b>{{ money(data()?.raised ?? 0) }}</b><small>{{ 'raised for elders' | t }}</small></div>
            <div><b>{{ count(data()?.donors ?? 0) }}</b><small>{{ 'kind donors' | t }}</small></div>
            <div><b>{{ count(data()?.campaignsRun ?? 0) }}</b><small>{{ 'campaigns' | t }}</small></div>
          </div>
          }
        </div>
      </header>

      <main id="main" class="pb-5" tabindex="-1">
        <div class="container">
          <!-- Campaigns -->
          @if (campaigns().length && !hide('campaigns')) {
            <section class="sp-section sp-campaigns-sec">
              <div class="sp-head"><span class="sp-kicker">{{ 'Campaigns' | t }}</span><h2>{{ 'Where your gift goes now' | t }}</h2></div>
              <div class="sp-campaigns">
                @for (c of campaigns(); track c.publicId) {
                  <article class="sp-campaign" [class.featured]="c.isFeatured">
                    <div class="sp-c-photo">
                      @if (c.image) { <img [src]="img(c.image)" [alt]="c.title" loading="lazy"> } @else { <span class="sp-c-ph"><i class="bi bi-heart-pulse"></i></span> }
                      @if (c.isFeatured) { <span class="sp-c-badge"><i class="bi bi-star-fill"></i> {{ 'Featured' | t }}</span> }
                      <app-like-share class="photo-share" look="icon" [shareOnly]="true" [id]="c.publicId" [title]="c.title" [path]="'/support?c=' + c.slug"
                                      [image]="c.image ? img(c.image) : null" [caption]="c.summary" />
                    </div>
                    <div class="sp-c-body">
                      <h3>{{ c.title }}</h3>
                      @if (c.summary) { <p>{{ c.summary }}</p> }
                      <div class="sp-progress" role="progressbar" [attr.aria-valuenow]="pct(c)" aria-valuemin="0" aria-valuemax="100"><span [style.width.%]="pct(c)"></span></div>
                      <div class="sp-c-nums"><b>{{ money(c.raised) }}</b> <span>{{ 'of {goal}' | t: { goal: money(c.goalAmount) } }}</span>
                        <span class="ms-auto">{{ pct(c) }}%</span></div>
                      <div class="sp-c-meta">
                        <span><i class="bi bi-people"></i> {{ '{n} donors' | t: { n: c.donors } }}</span>
                        @if (daysLeft(c); as d) { <span><i class="bi bi-hourglass-split"></i> {{ '{n} days left' | t: { n: d } }}</span> }
                      </div>
                      @if (c.story) { <details class="sp-c-story"><summary>{{ 'Read more' | t }}</summary><p>{{ c.story }}</p></details> }
                      <button type="button" class="btn btn-accent w-100 mt-auto" (click)="giveTo(c)"><i class="bi bi-heart"></i> {{ 'Give to this' | t }}</button>
                    </div>
                  </article>
                }
              </div>
            </section>
          }

          <!-- Donate -->
          @if (!hide('donate')) {
          <section class="sp-section" id="donate">
            <div class="sp-donate">
              <div class="sp-donate-side">
                <span class="sp-kicker">{{ 'Donate' | t }}</span>
                <h2>{{ 'Every rupee reaches an elder' | t }}</h2>
                <ul class="sp-impacts">
                  @for (i of v.impacts; track $index) {
                    <li [class.on]="amount() === i.amount" (click)="setAmount(i.amount)">
                      <span class="ic"><i class="bi" [class]="i.icon"></i></span><span><b>{{ money(i.amount) }}</b>{{ i.label }}</span>
                    </li>
                  }
                </ul>
                <p class="sp-safe"><i class="bi bi-shield-lock-fill"></i> {{ v.trust.note }}</p>
              </div>

              <div class="sp-donate-form">
                @if (receipt(); as r) {
                  <div class="sp-thanks" role="status">
                    <span class="sp-thanks-icon"><i class="bi bi-heart-fill"></i></span>
                    <h3>{{ 'Thank you, {name}!' | t: { name: firstName() } }}</h3>
                    <p>{{ 'Your gift of {amount} has reached us. A receipt is on its way to your email.' | t: { amount: money(r.amount) } }}</p>
                    <p class="small text-muted">{{ 'Receipt:' | t }} <b>{{ r.receiptNo }}</b>@if (r.campaign) { · {{ r.campaign }} }</p>
                    <p class="small">{{ 'Tell your friends — every share brings another gift.' | t }}</p>
                    <app-like-share [shareOnly]="true" [id]="'support'" [title]="'I just gave to help elders who live alone' | t" path="/support" />
                    <button type="button" class="btn btn-link btn-sm mt-2" (click)="receipt.set(null)">{{ 'Give again' | t }}</button>
                  </div>
                } @else if (!data()?.donations?.open) {
                  <div class="sp-soon">
                    <span class="sp-thanks-icon soon"><i class="bi bi-hourglass-split"></i></span>
                    <h3>{{ 'Online donations open soon' | t }}</h3>
                    <p>{{ 'We are completing our registrations so every gift gets a proper receipt. Until then, you can help in many other ways.' | t }}</p>
                    <a class="btn btn-accent" href="#ways">{{ 'Other ways to help' | t }}</a>
                  </div>
                } @else {
                  <form novalidate (ngSubmit)="donate()">
                    @if (data()?.donations?.testMode) { <div class="alert alert-warning small py-2"><i class="bi bi-cone-striped"></i> {{ 'Test mode: no real money is taken.' | t }}</div> }
                    <label class="form-label small fw-semibold" for="spCampaign">{{ 'Give to' | t }}</label>
                    <select class="form-select mb-3" id="spCampaign" name="campaign" [(ngModel)]="f.campaignId">
                      <option value="">{{ 'Wherever it is needed most' | t }}</option>
                      @for (c of campaigns(); track c.publicId) { <option [value]="c.publicId">{{ c.title }}</option> }
                    </select>
                    <div class="sp-amounts">
                      @for (i of v.impacts; track $index) {
                        <button type="button" class="sp-amount" [class.on]="amount() === i.amount" (click)="setAmount(i.amount)">{{ money(i.amount) }}</button>
                      }
                      <input class="form-control sp-amount-other" type="number" min="10" name="other" [ngModel]="otherAmount()" (ngModelChange)="setOther($event)"
                             [placeholder]="'Other amount' | t" [attr.aria-label]="'Other amount' | t">
                    </div>
                    <div class="row g-2 mt-1">
                      <div class="col-md-6"><input class="form-control" name="name" maxlength="100" [(ngModel)]="f.name" [placeholder]="'Your name' | t" [attr.aria-label]="'Your name' | t"></div>
                      <div class="col-md-6"><input class="form-control" type="email" name="email" maxlength="254" [(ngModel)]="f.email" [placeholder]="'Email (for your receipt)' | t" [attr.aria-label]="'Email' | t"></div>
                      <div class="col-md-6"><input class="form-control" name="phone" maxlength="20" [(ngModel)]="f.phone" [placeholder]="'Phone (optional)' | t" [attr.aria-label]="'Phone' | t"></div>
                      <div class="col-md-6"><input class="form-control text-uppercase" name="pan" maxlength="10" [(ngModel)]="f.pan" [placeholder]="'PAN for 80G receipt (optional)' | t" [attr.aria-label]="'PAN' | t"></div>
                    </div>
                    <div class="form-check form-switch mt-3">
                      <input class="form-check-input" type="checkbox" id="spHonour" name="honourOn" [(ngModel)]="f.honourOn">
                      <label class="form-check-label small fw-semibold" for="spHonour">{{ "Give in my parent's name" | t }}</label>
                    </div>
                    @if (f.honourOn) {
                      <input class="form-control mt-2" name="honour" maxlength="100" [(ngModel)]="f.inHonourOf" [placeholder]="'e.g. In honour of Maa on her 70th birthday' | t">
                    }
                    <textarea class="form-control mt-2" name="message" rows="2" maxlength="300" [(ngModel)]="f.message" [placeholder]="'A message (optional)' | t"></textarea>
                    <div class="form-check mt-2">
                      <input class="form-check-input" type="checkbox" id="spWall" name="wall" [(ngModel)]="f.showOnWall">
                      <label class="form-check-label small" for="spWall">{{ 'Show my name on the donor wall' | t }}</label>
                    </div>
                    @if (f.showOnWall) { <input class="form-control form-control-sm mt-1" name="wallName" maxlength="60" [(ngModel)]="f.wallName" [placeholder]="'Name to show (or leave empty: Anonymous)' | t"> }
                    @if (error()) { <div class="alert alert-danger small mt-3 mb-0" role="alert">{{ error() }}</div> }
                    <button type="submit" class="btn btn-accent sp-donate-btn" [disabled]="busy()">
                      @if (busy()) { <span class="spinner-border spinner-border-sm"></span> } @else { <i class="bi bi-lock-fill"></i> }
                      {{ 'Donate {amount}' | t: { amount: money(amount() || 0) } }}
                    </button>
                    <p class="sp-secure"><i class="bi bi-shield-check"></i> {{ 'Secure payment by Razorpay · UPI, cards, net banking' | t }}</p>
                  </form>
                }
              </div>
            </div>
          </section>

          }

          <!-- Other ways to help -->
          @if (!hide('ways')) {
          <section class="sp-section" id="ways">
            <div class="sp-head"><span class="sp-kicker">{{ 'Other ways to help' | t }}</span><h2>{{ 'Give time, things or your voice' | t }}</h2></div>
            <div class="sp-ways">
              @for (w of v.ways; track $index) {
                <div class="sp-way">
                  <span class="ic"><i class="bi" [class]="w.icon"></i></span>
                  <h3>{{ w.title }}</h3><p>{{ w.text }}</p>
                  @if (w.kind === 'link' && w.link) { <a class="btn btn-outline-accent btn-sm" [siteLink]="w.link">{{ w.buttonLabel || ('Learn more' | t) }}</a> }
                  @else { <button type="button" class="btn btn-outline-accent btn-sm" (click)="ask(w.kind, w.title)">{{ w.buttonLabel || ('Talk to us' | t) }}</button> }
                </div>
              }
            </div>
            @if (asking(); as a) {
              <form class="sp-enquiry" novalidate (ngSubmit)="sendEnquiry()">
                <h3><i class="bi bi-envelope-heart"></i> {{ a.title }}</h3>
                @if (enquirySent()) {
                  <p class="text-success mb-0" role="status"><i class="bi bi-check-circle"></i> {{ "Thank you! We'll get in touch soon." | t }}</p>
                } @else {
                  <div class="row g-2">
                    <div class="col-md-6"><input class="form-control" name="eName" maxlength="60" [(ngModel)]="e.name" [placeholder]="'Your name' | t"></div>
                    <div class="col-md-6"><input class="form-control" type="email" name="eEmail" maxlength="120" [(ngModel)]="e.email" [placeholder]="'Email' | t"></div>
                    @if (a.kind === 'csr') { <div class="col-12"><input class="form-control" name="eOrg" maxlength="80" [(ngModel)]="e.org" [placeholder]="'Company / organisation' | t"></div> }
                    <div class="col-12"><textarea class="form-control" name="eMsg" rows="3" maxlength="900" [(ngModel)]="e.message" [placeholder]="'How would you like to help? Your town, and how to reach you.' | t"></textarea></div>
                  </div>
                  @if (enquiryError()) { <div class="small text-danger mt-2" role="alert">{{ enquiryError() }}</div> }
                  <div class="d-flex gap-2 mt-2">
                    <button class="btn btn-accent btn-sm" type="submit" [disabled]="enquiryBusy()">{{ 'Send' | t }}</button>
                    <button class="btn btn-light btn-sm" type="button" (click)="asking.set(null)">{{ 'Cancel' | t }}</button>
                  </div>
                }
              </form>
            }
          </section>

          }

          <!-- Trust -->
          @if (!hide('trust')) {
          <section class="sp-section sp-trust">
            <div>
              <span class="sp-kicker">{{ 'Trust & transparency' | t }}</span>
              <h2>{{ 'Where the money goes' | t }}</h2>
              <ul class="sp-funds">
                @for (fd of v.funds; track $index) {
                  <li><span>{{ fd.label }}</span><b>{{ fd.percent }}%</b><i class="bar"><i [style.width.%]="fd.percent"></i></i></li>
                }
              </ul>
              @if (v.fundsNote) { <p class="small text-muted mb-0">{{ v.fundsNote }}</p> }
            </div>
            <div class="sp-trust-card">
              <p class="mb-1"><i class="bi bi-patch-check-fill"></i> <b>{{ v.trust.legalName }}</b></p>
              @if (v.trust.registration) { <p class="small mb-1">{{ v.trust.registration }}</p> }
              <p class="small mb-2">{{ v.trust.taxNote }}</p>
              @if (v.reports.length) {
                <p class="small fw-semibold mb-1">{{ 'Reports' | t }}</p>
                <ul class="sp-reports">@for (r of v.reports; track $index) { <li><a [siteLink]="r.link"><i class="bi bi-file-earmark-text"></i> {{ r.title }}</a></li> }</ul>
              }
            </div>
          </section>

          }

          @if (data()?.wall?.length && !hide('wall')) {
            <section class="sp-section">
              <div class="sp-head"><span class="sp-kicker">{{ 'Donor wall' | t }}</span><h2>{{ 'Thank you, kind hearts' | t }}</h2></div>
              <div class="sp-wall">
                @for (w of data()!.wall; track $index) {
                  <div class="sp-wall-item"><b>{{ w.name || ('Anonymous' | t) }}</b> <span>{{ money(w.amount) }}</span>
                    @if (w.inHonourOf) { <small><i class="bi bi-heart-fill"></i> {{ w.inHonourOf }}</small> } @else if (w.campaign) { <small>{{ w.campaign }}</small> }</div>
                }
              </div>
            </section>
          }

          @if (v.partners.length && !hide('partners')) {
            <section class="sp-section">
              <div class="sp-head"><span class="sp-kicker">{{ 'Partners' | t }}</span><h2>{{ 'With the support of' | t }}</h2></div>
              <div class="sp-partners">
                @for (p of v.partners; track $index) {
                  @if (p.link) { <a class="sp-partner" [siteLink]="p.link" [title]="p.name">@if (p.logo) { <img [src]="p.logo" [alt]="p.name"> } @else { {{ p.name }} }</a> }
                  @else { <span class="sp-partner">@if (p.logo) { <img [src]="p.logo" [alt]="p.name"> } @else { {{ p.name }} }</span> }
                }
              </div>
            </section>
          }

          @if (!hide('faqs')) {
          <section class="sp-section sp-faq-sec">
            <div class="sp-head"><span class="sp-kicker">{{ 'Questions' | t }}</span><h2>{{ 'Good to know' | t }}</h2></div>
            <div class="sp-faq">
              @for (q of v.faqs; track $index) { <details><summary>{{ q.question }}</summary><p>{{ q.answer }}</p></details> }
            </div>
          </section>
          }
        </div>
      </main>
    </div>`
})
export class Support {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly data = signal<SupportApi | null>(null);
  protected readonly view = computed(() => buildSupportView(this.data()?.en ?? null, this.data()?.local ?? null, s => this.i18n.t(s)));
  protected readonly campaigns = computed<Campaign[]>(() => this.data()?.campaigns ?? []);
  /** Sections staff switched off in the admin site (Support page; the English content decides for every language). */
  private readonly hidden = computed(() => new Set(this.data()?.en?.hiddenSections ?? []));
  protected hide(section: string): boolean { return this.hidden().has(section); }

  protected f = { campaignId: '', name: '', email: '', phone: '', pan: '', honourOn: false, inHonourOf: '', message: '', showOnWall: false, wallName: '' };
  protected readonly amount = signal(1500);
  protected readonly otherAmount = signal<number | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly receipt = signal<{ receiptNo: string; amount: number; campaign: string | null } | null>(null);
  protected readonly firstName = signal('');

  protected readonly asking = signal<{ kind: string; title: string } | null>(null);
  protected e = { name: '', email: '', org: '', message: '' };
  protected readonly enquiryBusy = signal(false);
  protected readonly enquirySent = signal(false);
  protected readonly enquiryError = signal('');

  constructor() {
    inject(SeoService).set({ title: 'Support Selfie with Parent', description: 'Help no parent feel forgotten: health check-ups, spectacles, medicines and festival meals for elders who live alone.', path: '/support' });
    this.http.get<SupportApi>(API, { params: { lang: this.i18n.lang() } }).subscribe({
      next: d => {
        this.data.set(d);
        if (this.inBrowser) {
          const slug = new URLSearchParams(location.search).get('c');
          const c = d.campaigns.find(x => x.slug === slug);
          if (c) this.f.campaignId = c.publicId;
        }
        const amounts = buildSupportView(d.en, d.local, s => s).impacts.map(i => i.amount);
        if (amounts.length && !amounts.includes(this.amount())) this.amount.set(amounts[Math.min(1, amounts.length - 1)]);
      },
      error: () => { /* the built-in page still shows; donating says "open soon" */ }
    });
  }

  protected money(n: number): string {
    try { return new Intl.NumberFormat(this.i18n.locale(), { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n); }
    catch { return `₹${Math.round(n)}`; }
  }
  protected count(n: number): string { return n.toLocaleString(this.i18n.locale()); }
  protected img(path: string): string { return homeImage(path); }
  protected pct(c: Campaign): number { return Math.min(100, Math.round(100 * c.raised / Math.max(1, c.goalAmount))); }
  protected daysLeft(c: Campaign): number | null {
    if (!c.endsAtUtc) return null;
    const d = Math.ceil((new Date(c.endsAtUtc + 'Z').getTime() - Date.now()) / 86_400_000);
    return d > 0 ? d : null;
  }

  protected setAmount(n: number): void { this.amount.set(n); this.otherAmount.set(null); }
  protected setOther(v: number | null): void { this.otherAmount.set(v); if (v && v > 0) this.amount.set(Math.round(v)); }
  protected giveTo(c: Campaign): void {
    this.f.campaignId = c.publicId;
    document.getElementById('donate')?.scrollIntoView({ behavior: 'smooth' });
  }

  /** Checks here first (the API checks everything again). */
  private problem(): string | null {
    const f = this.f, a = this.amount();
    if (!a || a < 10) return 'Choose an amount between ₹10 and ₹10,00,000.';
    if (a > 1_000_000) return 'Choose an amount between ₹10 and ₹10,00,000.';
    if (f.name.trim().length < 2) return 'Please tell us your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return 'Enter your email for the receipt.';
    if (f.pan.trim() && !/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(f.pan.trim())) return 'Enter a valid PAN (e.g. ABCDE1234F).';
    if (/[<>]/.test(f.name + f.inHonourOf + f.message + f.wallName)) return "Text can't contain < or >.";
    return null;
  }

  protected async donate(): Promise<void> {
    const p = this.problem();
    if (p) { this.error.set(this.i18n.t(p)); return; }
    const f = this.f;
    this.busy.set(true);
    this.error.set('');
    try {
      const order = await firstValueFrom(this.http.post<RazorpayOrder & { donationId: string }>(`${API}/donations`, {
        campaignId: f.campaignId || null, amount: this.amount(), name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || null,
        pan: f.pan.trim() || null, inHonourOf: f.honourOn ? f.inHonourOf.trim() || null : null, message: f.message.trim() || null,
        showOnWall: f.showOnWall, wallName: f.showOnWall ? f.wallName.trim() || null : null }));
      const campaign = this.campaigns().find(c => c.publicId === f.campaignId);
      const paid = await payWithRazorpay(order, campaign?.title ?? this.i18n.t('Donation for elders'), reason => this.error.set(reason));
      if (!paid) {
        void firstValueFrom(this.http.post(`${API}/donations/cancel`, { orderId: order.orderId, reason: this.error() || null })).catch(() => undefined);
        return;
      }
      const r = await firstValueFrom(this.http.post<{ receiptNo: string; amount: number; campaign: string | null }>(`${API}/donations/confirm`,
        { orderId: paid.razorpay_order_id, paymentId: paid.razorpay_payment_id, signature: paid.razorpay_signature }));
      this.firstName.set(f.name.trim().split(/\s+/)[0]);
      this.receipt.set(r);
      this.error.set('');
    } catch (e) {
      const err = e instanceof HttpErrorResponse ? e.error as { title?: string; errors?: Record<string, string[]> } | null : null;
      this.error.set(this.i18n.t(err?.errors ? Object.values(err.errors).flat()[0] : err?.title ?? "We couldn't start the payment. Please try again in a moment."));
    } finally {
      this.busy.set(false);
    }
  }

  protected ask(kind: string, title: string): void {
    this.asking.set({ kind, title });
    this.enquirySent.set(false);
    this.enquiryError.set('');
  }

  /** Volunteer / CSR / wishlist enquiries arrive in the admin site's Messages (with the 🔔). */
  protected async sendEnquiry(): Promise<void> {
    const a = this.asking(), e = this.e;
    if (!a) return;
    if (e.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email.trim()) || e.message.trim().length < 5) {
      this.enquiryError.set(this.i18n.t('Please fill in the required fields.'));
      return;
    }
    this.enquiryBusy.set(true);
    try {
      await firstValueFrom(this.http.post(`${environment.apiBaseUrl}/api/v1/contact`, {
        name: e.name.trim(), email: e.email.trim(), subject: `Support: ${a.title}`.slice(0, 100),
        message: (e.org.trim() ? `Organisation: ${e.org.trim()}\n` : '') + e.message.trim() }));
      this.enquirySent.set(true);
      this.e = { name: '', email: '', org: '', message: '' };
    } catch (err) {
      const p = err instanceof HttpErrorResponse ? err.error as { title?: string; errors?: Record<string, string[]> } | null : null;
      this.enquiryError.set(this.i18n.t(p?.errors ? Object.values(p.errors).flat()[0] : p?.title ?? "We couldn't send your message. Please try again."));
    } finally {
      this.enquiryBusy.set(false);
    }
  }
}
