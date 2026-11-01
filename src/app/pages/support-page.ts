import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { problemMessage } from '../core/problem';
import { ImageLibrary, imageUrl } from './content/image-library';

type Item = Record<string, string | number | null | undefined>;
interface Field { k: string; label: string; max?: number; type?: 'text' | 'textarea' | 'number' | 'image' | 'select'; options?: string[]; col?: string; }
interface Section { key: string; label: string; icon: string; list: boolean; max: number; fields: Field[]; defaults: Item[] | Item; help?: string; }

// The website's built-in Support page (the same as the website's support-content.ts): shown as grey placeholders.
const SECTIONS: Section[] = [
  { key: 'hero', label: 'Header', icon: 'bi-stars', list: false, max: 1, defaults: { eyebrow: 'Support Selfie with Parent', title: 'Help no parent', highlight: 'feel forgotten.',
      text: 'Your gift brings health check-ups, spectacles, medicines and festival meals to elders who live alone — and keeps this movement of gratitude growing.' },
    fields: [{ k: 'eyebrow', label: 'Small heading', max: 60, col: 'col-md-4' }, { k: 'title', label: 'Title', max: 120, col: 'col-md-4' },
      { k: 'highlight', label: 'Highlighted line (gold)', max: 120, col: 'col-md-4' }, { k: 'text', label: 'Text', max: 400, type: 'textarea', col: 'col-md-9' },
      { k: 'image', label: 'Background picture', type: 'image', col: 'col-md-3' }] },
  { key: 'impacts', label: 'Amounts and what they do', icon: 'bi-cash-stack', list: true, max: 8, help: 'The quick amounts on the donate form, e.g. ₹500 = one health check-up.',
    defaults: [{ amount: 500, label: 'One health check-up for an elder', icon: 'bi-heart-pulse' }, { amount: 1500, label: 'Spectacles for a grandparent', icon: 'bi-eyeglasses' },
      { amount: 2500, label: 'A month of medicines', icon: 'bi-capsule' }, { amount: 5000, label: 'A festival meal at an old-age home', icon: 'bi-cup-hot' }],
    fields: [{ k: 'amount', label: 'Amount (₹)', type: 'number', col: 'col-6 col-md-2' }, { k: 'label', label: 'What it does', max: 80, col: 'col-md-7' }, { k: 'icon', label: 'Icon', max: 45, col: 'col-6 col-md-3' }] },
  { key: 'ways', label: 'Other ways to help', icon: 'bi-people', list: true, max: 8, help: 'Volunteer / CSR / wishlist open an enquiry form (it arrives in Messages); Link opens the link.',
    defaults: [{ kind: 'volunteer', icon: 'bi-person-hearts', title: 'Volunteer', text: 'Visit an elder, call one every Sunday, or help at a health camp near you.', buttonLabel: 'I want to volunteer' },
      { kind: 'csr', icon: 'bi-building', title: 'Partner with us (CSR)', text: 'Sponsor a campaign, a health camp or a festival drive with your company.', buttonLabel: 'Talk to us' },
      { kind: 'wishlist', icon: 'bi-gift', title: 'Give things, not money', text: 'Blankets, spectacles, walking sticks, books — old-age homes tell us what they need.', buttonLabel: 'Ask for the wishlist' },
      { kind: 'link', icon: 'bi-share', title: 'Share a story', text: 'Tell the story of a parent who waits for a call. Stories move people to help.', buttonLabel: 'Share a story', link: '/parents-voices/share' }],
    fields: [{ k: 'kind', label: 'Type', type: 'select', options: ['volunteer', 'csr', 'wishlist', 'link'], col: 'col-6 col-md-2' }, { k: 'icon', label: 'Icon', max: 45, col: 'col-6 col-md-2' },
      { k: 'title', label: 'Title', max: 60, col: 'col-md-3' }, { k: 'buttonLabel', label: 'Button', max: 40, col: 'col-md-2' }, { k: 'link', label: 'Link (Type: link)', max: 300, col: 'col-md-3' },
      { k: 'text', label: 'Text', max: 300, col: 'col-12' }] },
  { key: 'trust', label: 'Trust details (registration, 80G)', icon: 'bi-patch-check', list: false, max: 1,
    defaults: { legalName: 'Selfie with Parent', registration: 'e.g. Registered trust no. …, 12A: …, 80G: …',
      taxNote: 'Donations to registered charities in India may be eligible for tax benefits under Section 80G. Add your PAN to get an 80G receipt.',
      note: 'Payments are handled securely by Razorpay. We never see or store your card or bank details.' },
    fields: [{ k: 'legalName', label: 'Legal name', max: 120, col: 'col-md-5' }, { k: 'registration', label: 'Registration / 12A / 80G numbers', max: 200, col: 'col-md-7' },
      { k: 'taxNote', label: 'Tax note (also on the receipt email)', max: 300, type: 'textarea', col: 'col-md-6' }, { k: 'note', label: 'Safety note', max: 600, type: 'textarea', col: 'col-md-6' }] },
  { key: 'funds', label: 'Where the money goes', icon: 'bi-pie-chart', list: true, max: 6, help: 'Shares must add up to 100% or less. Until you set your own, the page shows sample figures marked as samples.',
    defaults: [{ label: 'Programmes for elders', percent: 80 }, { label: 'Outreach and awareness', percent: 12 }, { label: 'Running costs', percent: 8 }],
    fields: [{ k: 'label', label: 'Label', max: 60, col: 'col-md-9' }, { k: 'percent', label: '%', type: 'number', col: 'col-md-3' }] },
  { key: 'reports', label: 'Reports', icon: 'bi-file-earmark-text', list: true, max: 12, help: 'Annual reports, audited accounts — a link to the file (e.g. a page or a PDF on your drive).', defaults: [],
    fields: [{ k: 'title', label: 'Title', max: 100, col: 'col-md-5' }, { k: 'link', label: 'Link', max: 300, col: 'col-md-7' }] },
  { key: 'partners', label: 'Partners and sponsors', icon: 'bi-building', list: true, max: 24, defaults: [],
    fields: [{ k: 'name', label: 'Name', max: 80, col: 'col-md-4' }, { k: 'link', label: 'Website', max: 300, col: 'col-md-5' }, { k: 'logo', label: 'Logo', type: 'image', col: 'col-md-3' }] },
  { key: 'faqs', label: 'Questions', icon: 'bi-question-circle', list: true, max: 20,
    defaults: [{ question: 'Is my donation safe?' }, { question: 'Will I get a receipt?' }, { question: "Can I give in my parent's name?" }, { question: 'Can I give without money?' }],
    fields: [{ k: 'question', label: 'Question', max: 200, col: 'col-12' }, { k: 'answer', label: 'Answer', max: 1000, type: 'textarea', col: 'col-12' }] }
];
const LANGS = [['en', 'English'], ['hi', 'हिन्दी'], ['bn', 'বাংলা'], ['ar', 'العربية'], ['es', 'Español'], ['fr', 'Français']] as const;

interface Campaign { publicId: string; slug: string; title: string; summary: string | null; story: string | null; image: string | null; goalAmount: number;
  offlineRaised: number; raised: number; donors: number; startsAtUtc: string | null; endsAtUtc: string | null; status: string; isFeatured: boolean; sortOrder: number; }

/**
 * Support page: the website's /support page — every section's words per language (English is the base; empty shows the
 * built-in text, never blank) — and the fundraising campaigns (goal, story, picture, dates, status, featured).
 * Super admins and admins. Donations themselves are on the Donations page.
 */
@Component({
  selector: 'app-support-page',
  imports: [FormsModule, DatePipe, DecimalPipe, NgTemplateOutlet, ImageLibrary],
  template: `
    <section class="panel">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <h2 class="mb-0">Support page</h2>
        <div class="d-flex gap-2">
          <a class="btn btn-light btn-sm" [href]="site + '/support'" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i> View page</a>
          @if (tab() === 'content') {
            <button class="btn btn-light btn-sm text-danger" type="button" (click)="reset()" [disabled]="saving()">Reset {{ langName() }}</button>
            <button class="btn btn-accent btn-sm" type="button" (click)="save()" [disabled]="saving()"><i class="bi bi-check2"></i> Save {{ langName() }}</button>
          } @else {
            <button class="btn btn-accent btn-sm" type="button" (click)="edit(null)"><i class="bi bi-plus-lg"></i> New campaign</button>
          }
        </div>
      </div>
      <ul class="nav nav-tabs mb-3">
        <li class="nav-item"><button class="nav-link" type="button" [class.active]="tab() === 'content'" (click)="tab.set('content')">Page content</button></li>
        <li class="nav-item"><button class="nav-link" type="button" [class.active]="tab() === 'campaigns'" (click)="tab.set('campaigns'); loadCampaigns()">Campaigns</button></li>
      </ul>
      @if (error()) { <div class="alert alert-danger small" role="alert">{{ error() }}</div> }
      @if (notice()) { <div class="alert alert-success small" role="status">{{ notice() }}</div> }

      @if (tab() === 'content') {
        <p class="small text-muted mb-2">Anything you leave empty shows the grey text — the website's built-in content@if (lang() !== 'en') { , or your English text }.
          @if (updated()) { Last saved {{ updated()! + 'Z' | date: 'd MMM y, HH:mm' }}. }</p>
        <ul class="nav nav-pills mb-3">
          @for (l of langs; track l[0]) { <li class="nav-item"><button class="nav-link py-1" type="button" [class.active]="lang() === l[0]" (click)="switchLang(l[0])">{{ l[1] }}</button></li> }
        </ul>
        @if (loading()) { <p class="small text-muted"><span class="spinner-border spinner-border-sm"></span> Loading…</p> }
        @else {
          <!-- Which sections the page shows (English decides for every language) -->
        <details class="sp-sec" open>
          <summary><i class="bi bi-toggles"></i> Sections on the page <span class="text-muted small">({{ visibleCount() }} of {{ sectionList.length }} shown)</span></summary>
          @if (lang() !== 'en') { <p class="small text-muted">Switch sections on or off in <b>English</b> — it applies to every language.</p> }
          <div class="sec-switches">
            @for (x of sectionList; track x[0]) {
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" [id]="'sec-' + x[0]" [checked]="!hiddenSet.has(x[0])" [disabled]="lang() !== 'en'" (change)="toggleSection(x[0], $any($event.target).checked)">
                <label class="form-check-label small" [for]="'sec-' + x[0]">{{ x[1] }}</label>
              </div>
            }
          </div>
          <p class="small text-muted mt-2 mb-0">A section switched off is hidden from visitors (your text is kept). Save to apply.</p>
        </details>
          @for (s of sections; track s.key) {
            <details class="sp-sec" [open]="s.key === 'hero'">
              <summary><i class="bi" [class]="s.icon"></i> {{ s.label }}</summary>
              @if (s.help) { <p class="small text-muted">{{ s.help }}</p> }
              @if (s.list) {
                @if (!list(s.key).length) {
                  <p class="small text-muted">Showing the built-in {{ s.label.toLowerCase() }}@if (!asList(s.defaults).length) { (none — the section stays hidden) }.
                    <button class="btn btn-link btn-sm p-0 align-baseline" type="button" (click)="startFrom(s)">{{ asList(s.defaults).length ? 'Edit them' : 'Add one' }}</button></p>
                }
                @for (it of list(s.key); track $index; let i = $index; let last = $last) {
                  <div class="sp-item row g-2 align-items-end">
                    @for (fd of s.fields; track fd.k) { <div [class]="fd.col || 'col-md'"><ng-container *ngTemplateOutlet="field; context: { it, fd, ph: ph(s, i, fd.k) }" /></div> }
                    <div class="col-auto d-flex gap-1">
                      <button class="btn btn-light btn-sm" type="button" (click)="move(s.key, i, -1)" [disabled]="i === 0" title="Move up"><i class="bi bi-arrow-up"></i></button>
                      <button class="btn btn-light btn-sm" type="button" (click)="move(s.key, i, 1)" [disabled]="last" title="Move down"><i class="bi bi-arrow-down"></i></button>
                      <button class="btn btn-light btn-sm text-danger" type="button" (click)="remove(s.key, i)" title="Remove"><i class="bi bi-trash"></i></button>
                    </div>
                  </div>
                }
                @if (list(s.key).length && list(s.key).length < s.max) { <button class="btn btn-outline-secondary btn-sm mt-2" type="button" (click)="add(s.key)"><i class="bi bi-plus-lg"></i> Add</button> }
              } @else {
                <div class="row g-2">
                  @for (fd of s.fields; track fd.k) { <div [class]="fd.col || 'col-md'"><ng-container *ngTemplateOutlet="field; context: { it: obj(s.key), fd, ph: ph(s, 0, fd.k) }" /></div> }
                </div>
              }
            </details>
          }
          <div class="d-flex justify-content-end mt-3"><button class="btn btn-accent" type="button" (click)="save()" [disabled]="saving()"><i class="bi bi-check2"></i> Save {{ langName() }}</button></div>
        }
      } @else {
        <!-- Campaigns -->
        @if (editing(); as c) {
          <form class="sp-sec" (ngSubmit)="saveCampaign()">
            <h3 class="h6">{{ c.publicId ? 'Edit campaign' : 'New campaign' }}</h3>
            <div class="row g-2">
              <div class="col-md-3"><button type="button" class="sp-thumb" (click)="pick(c, 'image')"><img [src]="thumb(c['image'])" alt=""><span>Choose picture</span></button></div>
              <div class="col-md-9 row g-2 m-0 p-0">
                <div class="col-md-6"><label class="form-label small">Title</label><input class="form-control form-control-sm" name="title" maxlength="120" [(ngModel)]="c['title']" required></div>
                <div class="col-md-6"><label class="form-label small">Web address (/support?c=…)</label><input class="form-control form-control-sm" name="slug" maxlength="60" [(ngModel)]="c['slug']" placeholder="diwali-elders"></div>
                <div class="col-12"><label class="form-label small">Short summary</label><input class="form-control form-control-sm" name="summary" maxlength="300" [(ngModel)]="c['summary']"></div>
                <div class="col-6 col-md-3"><label class="form-label small">Goal (₹)</label><input class="form-control form-control-sm" type="number" min="1" name="goal" [(ngModel)]="c['goalAmount']"></div>
                <div class="col-6 col-md-3"><label class="form-label small">Received offline (₹)</label><input class="form-control form-control-sm" type="number" min="0" name="offline" [(ngModel)]="c['offlineRaised']"></div>
                <div class="col-6 col-md-3"><label class="form-label small">Starts</label><input class="form-control form-control-sm" type="date" name="starts" [(ngModel)]="c['starts']"></div>
                <div class="col-6 col-md-3"><label class="form-label small">Ends</label><input class="form-control form-control-sm" type="date" name="ends" [(ngModel)]="c['ends']"></div>
              </div>
              <div class="col-12"><label class="form-label small">The story (why it matters, what the money does)</label><textarea class="form-control form-control-sm" rows="4" name="story" maxlength="4000" [(ngModel)]="c['story']"></textarea></div>
              <div class="col-6 col-md-3"><label class="form-label small">Status</label>
                <select class="form-select form-select-sm" name="status" [(ngModel)]="c['status']"><option>Draft</option><option>Active</option><option>Paused</option><option>Closed</option></select></div>
              <div class="col-6 col-md-2"><label class="form-label small">Order</label><input class="form-control form-control-sm" type="number" name="sort" [(ngModel)]="c['sortOrder']"></div>
              <div class="col-md-4 d-flex align-items-end"><div class="form-check"><input class="form-check-input" type="checkbox" id="spFeat" name="feat" [(ngModel)]="c['isFeatured']">
                <label class="form-check-label small" for="spFeat">Featured (first, highlighted)</label></div></div>
            </div>
            <div class="d-flex gap-2 mt-3">
              <button class="btn btn-accent btn-sm" type="submit" [disabled]="saving()">Save campaign</button>
              <button class="btn btn-light btn-sm" type="button" (click)="editing.set(null)">Cancel</button>
              @if (c.publicId) { <button class="btn btn-outline-danger btn-sm ms-auto" type="button" (click)="deleteCampaign(c)">Delete</button> }
            </div>
          </form>
        }
        <div class="table-responsive">
          <table class="table table-sm align-middle">
            <thead><tr><th>Campaign</th><th>Status</th><th class="text-end">Raised / goal</th><th class="text-end">Donors</th><th>Ends</th><th></th></tr></thead>
            <tbody>
              @for (c of campaigns(); track c.publicId) {
                <tr>
                  <td>@if (c.isFeatured) { <i class="bi bi-star-fill text-warning"></i> } <b>{{ c.title }}</b><br><small class="text-muted">/support?c={{ c.slug }}</small></td>
                  <td><span class="badge" [class.text-bg-success]="c.status === 'Active'" [class.text-bg-secondary]="c.status !== 'Active'">{{ c.status }}</span></td>
                  <td class="text-end">₹{{ c.raised | number: '1.0-0' }} / ₹{{ c.goalAmount | number: '1.0-0' }}
                    <div class="progress mt-1" style="height: 5px"><div class="progress-bar bg-success" [style.width.%]="pct(c)"></div></div></td>
                  <td class="text-end">{{ c.donors }}</td>
                  <td class="small">{{ c.endsAtUtc ? (c.endsAtUtc + 'Z' | date: 'd MMM y') : '—' }}</td>
                  <td class="text-end"><button class="btn btn-light btn-sm" type="button" (click)="edit(c)"><i class="bi bi-pencil"></i> Edit</button></td>
                </tr>
              } @empty { <tr><td colspan="6" class="text-muted small">No campaigns yet. The page shows the donate box for "wherever it is needed most".</td></tr> }
            </tbody>
          </table>
        </div>
      }
    </section>

    <ng-template #field let-it="it" let-fd="fd" let-ph="ph">
      <label class="form-label small">{{ fd.label }}</label>
      @switch (fd.type) {
        @case ('textarea') { <textarea class="form-control form-control-sm" rows="2" [attr.maxlength]="fd.max" [(ngModel)]="it[fd.k]" [placeholder]="ph"></textarea> }
        @case ('number') { <input class="form-control form-control-sm" type="number" [(ngModel)]="it[fd.k]" [placeholder]="ph"> }
        @case ('select') { <select class="form-select form-select-sm" [(ngModel)]="it[fd.k]"><option [ngValue]="undefined">{{ ph || '—' }}</option>@for (o of fd.options; track o) { <option [value]="o">{{ o }}</option> }</select> }
        @case ('image') { <button type="button" class="sp-thumb small-thumb" (click)="pick(it, fd.k)"><img [src]="thumb(it[fd.k])" alt=""><span>{{ it[fd.k] ? 'Change' : 'Choose' }}</span></button> }
        @default { <input class="form-control form-control-sm" [attr.maxlength]="fd.max" [(ngModel)]="it[fd.k]" [placeholder]="ph"> }
      }
    </ng-template>

    @if (picking(); as p) {
      <app-image-library [current]="str(p.item[p.key])" (chosen)="p.item[p.key] = $event; picking.set(null)" (closed)="picking.set(null)" />
    }`,
  styles: `
    .sp-sec { border: 1px solid rgba(0,0,0,.08); border-radius: .7rem; padding: .6rem .9rem; margin-bottom: .75rem; background: #fff; }
    .sp-sec > summary { font-weight: 600; cursor: pointer; }
    .sec-switches { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: .2rem 1rem; }
    .sp-sec[open] > summary { margin-bottom: .6rem; }
    .sp-item { border-top: 1px dashed rgba(0,0,0,.1); padding: .5rem 0; margin: 0; }
    .sp-thumb { position: relative; display: block; width: 100%; padding: 0; border: 1px solid rgba(0,0,0,.12); border-radius: .5rem; overflow: hidden; background: #f3f0ea; }
    .sp-thumb img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; }
    .sp-thumb.small-thumb img { aspect-ratio: 3 / 1; }
    .sp-thumb span { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.55); color: #fff; font-size: .72rem; padding: .15rem; }
  `
})
export class SupportPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiBaseUrl}/api/v1/admin/support`;
  protected readonly site = environment.publicSiteUrl;
  protected readonly sections = SECTIONS;
  protected readonly sectionList: [string, string][] = [['stats', 'Totals in the header'], ['campaigns', 'Campaigns'], ['donate', 'Donate box'],
    ['ways', 'Other ways to help'], ['trust', 'Trust & where the money goes'], ['wall', 'Donor wall'], ['partners', 'Partners'], ['faqs', 'Questions']];

  protected readonly langs = LANGS;

  protected readonly tab = signal<'content' | 'campaigns'>('content');
  protected readonly lang = signal('en');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly updated = signal<string | null>(null);
  protected readonly picking = signal<{ item: Item; key: string } | null>(null);
  protected readonly campaigns = signal<Campaign[]>([]);
  protected readonly editing = signal<(Item & { publicId?: string }) | null>(null);

  /** This language's content being edited, and English (placeholders for other languages). */
  protected c: Record<string, Item | Item[]> = {};
  private english: Record<string, Item | Item[]> = {};

  ngOnInit(): void { void this.load(); }

  protected langName(): string { return LANGS.find(l => l[0] === this.lang())![1]; }
  protected str(v: unknown): string { return typeof v === 'string' ? v : ''; }
  protected thumb(path: unknown): string { return imageUrl(this.str(path) || 'img/hero-1.svg'); }
  protected asList(d: Item[] | Item): Item[] { return Array.isArray(d) ? d : []; }
  protected list(key: string): Item[] { return (this.c[key] as Item[] | undefined) ?? []; }
  protected obj(key: string): Item { return (this.c[key] ??= {}) as Item; }

  protected async switchLang(l: string): Promise<void> { if (l !== this.lang()) { this.lang.set(l); this.notice.set(''); await this.load(); } }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      type R = { content: Record<string, Item | Item[]> | null; updatedAtUtc: string | null };
      const r = await firstValueFrom(this.http.get<R>(`${this.api}/content`, { params: { lang: this.lang() } }));
      this.english = this.lang() === 'en' ? (r.content ?? {}) : ((await firstValueFrom(this.http.get<R>(`${this.api}/content`, { params: { lang: 'en' } }))).content ?? {});
      this.updated.set(r.updatedAtUtc);
      const content = r.content ?? {};
      this.hiddenSet = new Set(((this.lang() === 'en' ? content : this.english)['hiddenSections'] as unknown as string[] | undefined) ?? []);
      this.c = {};
      for (const s of SECTIONS) {
        const v = content[s.key];
        this.c[s.key] = s.list ? ((v as Item[] | undefined) ?? []).map(x => ({ ...x })) : { ...((v as Item | undefined) ?? {}) };
      }
    } catch (e) { this.error.set(problemMessage(e)); }
    finally { this.loading.set(false); }
  }

  /** Placeholder: English (other languages), then the built-in text. */
  protected ph(s: Section, i: number, k: string): string {
    const en = this.lang() !== 'en' ? (s.list ? (this.english[s.key] as Item[] | undefined)?.[i]?.[k] : (this.english[s.key] as Item | undefined)?.[k]) : undefined;
    const def = s.list ? this.asList(s.defaults)[i]?.[k] : (s.defaults as Item)[k];
    return String(en ?? def ?? '');
  }

  protected startFrom(s: Section): void {
    const en = this.lang() !== 'en' ? (this.english[s.key] as Item[] | undefined) : undefined;
    const from = en?.length ? en : this.asList(s.defaults);
    this.c[s.key] = from.length ? from.map(x => ({ ...x })) : [{}];
  }
  protected add(key: string): void { this.c[key] = [...this.list(key), {}]; }
  protected remove(key: string, i: number): void { this.c[key] = this.list(key).filter((_, j) => j !== i); }
  protected move(key: string, i: number, by: number): void {
    const l = [...this.list(key)], j = i + by;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    this.c[key] = l;
  }
  protected pick(item: Item, key: string): void { this.picking.set({ item, key }); }

  /** Only what's filled in is saved. */
  private payload(): Record<string, unknown> {
    const clean = (o: Item): Item | null => {
      const r: Item = {};
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string' ? v.trim() : v !== null && v !== undefined && (v as unknown) !== '') r[k] = typeof v === 'string' ? v.trim() : v;
      }
      return Object.keys(r).length ? r : null;
    };
    const out: Record<string, unknown> = {};
    for (const s of SECTIONS) {
      if (s.list) { const v = this.list(s.key).map(clean).filter((x): x is Item => !!x); if (v.length) out[s.key] = v; }
      else { const v = clean(this.obj(s.key)); if (v) out[s.key] = v; }
    }
    if (this.lang() === 'en' && this.hiddenSet.size) out['hiddenSections'] = [...this.hiddenSet];
    return out;
  }

  protected async save(): Promise<void> {
    this.saving.set(true); this.error.set(''); this.notice.set('');
    try {
      await firstValueFrom(this.http.put(`${this.api}/content`, this.payload(), { params: { lang: this.lang() } }));
      await this.load();
      this.notice.set(`Saved the ${this.langName()} Support page — the website shows it now.`);
    } catch (e) { this.error.set(problemMessage(e)); }
    finally { this.saving.set(false); }
  }

  protected async reset(): Promise<void> {
    if (!confirm(`Reset the ${this.langName()} Support page? It will show ${this.lang() === 'en' ? 'the built-in text' : 'the English text'} again.`)) return;
    this.saving.set(true);
    try { await firstValueFrom(this.http.delete(`${this.api}/content`, { params: { lang: this.lang() } })); await this.load(); this.notice.set('Reset.'); }
    catch (e) { this.error.set(problemMessage(e)); }
    finally { this.saving.set(false); }
  }

  // ---------- Sections on the page ----------

  protected hiddenSet = new Set<string>();
  protected visibleCount(): number { return this.sectionList.length - this.sectionList.filter(x => this.hiddenSet.has(x[0])).length; }
  protected toggleSection(key: string, on: boolean): void {
    const s = new Set(this.hiddenSet);
    if (on) s.delete(key); else s.add(key);
    this.hiddenSet = s;
  }

  // ---------- Campaigns ----------

  protected async loadCampaigns(): Promise<void> {
    try { this.campaigns.set(await firstValueFrom(this.http.get<Campaign[]>(`${this.api}/campaigns`))); }
    catch (e) { this.error.set(problemMessage(e)); }
  }

  protected pct(c: Campaign): number { return Math.min(100, Math.round(100 * c.raised / Math.max(1, c.goalAmount))); }

  protected edit(c: Campaign | null): void {
    this.notice.set('');
    this.editing.set(c ? { ...c, starts: c.startsAtUtc?.slice(0, 10) ?? '', ends: c.endsAtUtc?.slice(0, 10) ?? '' } as unknown as Item & { publicId?: string }
      : { title: '', slug: '', summary: '', story: '', image: '', goalAmount: 50000, offlineRaised: 0, status: 'Draft', isFeatured: false as unknown as string, sortOrder: 0, starts: '', ends: '' });
  }

  protected async saveCampaign(): Promise<void> {
    const c = this.editing();
    if (!c) return;
    const s = (k: string) => this.str(c[k]).trim() || null;
    const slug = s('slug') ?? (s('title') ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const body = { slug, title: s('title') ?? '', summary: s('summary'), story: s('story'), image: s('image'), goalAmount: Number(c['goalAmount']) || null,
      offlineRaised: Number(c['offlineRaised']) || 0, startsAtUtc: s('starts') ? `${s('starts')}T00:00:00` : null, endsAtUtc: s('ends') ? `${s('ends')}T23:59:59` : null,
      status: this.str(c['status']) || 'Draft', isFeatured: !!c['isFeatured'], sortOrder: Number(c['sortOrder']) || 0 };
    this.saving.set(true); this.error.set('');
    try {
      await firstValueFrom(c.publicId ? this.http.put(`${this.api}/campaigns/${c.publicId}`, body) : this.http.post(`${this.api}/campaigns`, body));
      this.editing.set(null);
      this.notice.set(`Saved “${body.title}”.`);
      await this.loadCampaigns();
    } catch (e) { this.error.set(problemMessage(e)); }
    finally { this.saving.set(false); }
  }

  protected async deleteCampaign(c: Item & { publicId?: string }): Promise<void> {
    if (!c.publicId || !confirm(`Delete “${this.str(c['title'])}”? (A campaign with donations can only be closed.)`)) return;
    try { await firstValueFrom(this.http.delete(`${this.api}/campaigns/${c.publicId}`)); this.editing.set(null); await this.loadCampaigns(); }
    catch (e) { this.error.set(problemMessage(e)); }
  }
}
