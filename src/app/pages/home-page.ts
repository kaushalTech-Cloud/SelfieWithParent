import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { problemMessage } from '../core/problem';
import { ImageLibrary, imageUrl } from './content/image-library';
import {
  DEFAULT_APP, DEFAULT_PLEDGE, DEFAULT_PRIORITIES, DEFAULT_QUESTIONS, DEFAULT_SHOWCASE, DEFAULT_SLIDES, DEFAULT_STATS, DEFAULT_STATS_NOTE,
  DEFAULT_STORY, DEFAULT_THEMES, DEFAULT_TILES
} from './home-defaults';

type Item = Record<string, string | number | null | undefined>;
interface ShowcaseCard { kind: string; hidden?: boolean | null; title?: string | null; text?: string | null; note?: string | null; button?: string | null; }
interface Showcase { hidden?: boolean | null; eyebrow?: string | null; title?: string | null; intro?: string | null; cards?: ShowcaseCard[] | null; }
interface HomeContent {
  slides?: Item[]; tiles?: Item[]; story?: Item; stats?: Item[]; statsNote?: string; questions?: string[];
  themes?: Item[]; priorities?: Item[]; pledge?: Item; app?: Item; showcase?: Showcase; hiddenSections?: string[];
}
type CardKey = 'title' | 'text' | 'note' | 'button';
const CARD_KEYS: CardKey[] = ['title', 'text', 'note', 'button'];
interface Numbers { selfies: number; towns: number; countries: number; families: number; visitors: number; }
interface AdminHome { language: string; content: HomeContent | null; updatedAtUtc: string | null; numbers: Numbers; }

const LANGS = [['en', 'English'], ['hi', 'हिन्दी'], ['bn', 'বাংলা'], ['ar', 'العربية'], ['es', 'Español'], ['fr', 'Français']] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Home page: the website's home page, section by section (top slider, action tiles, photo features, our story, impact numbers,
 * questions, theme of the month, programme priorities, pledge, app). Per language: English is the base; other languages only need
 * what's translated. Anything left empty shows the website's built-in content (shown here as the grey placeholder),
 * so the home page is never blank. Super admins and admins.
 */
@Component({
  selector: 'app-home-page',
  imports: [FormsModule, DatePipe, ImageLibrary],
  template: `
    <section class="panel">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <h2 class="mb-0">Home page</h2>
        <div class="d-flex gap-2">
          <a class="btn btn-light btn-sm" [href]="site + '/'" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i> View home page</a>
          <button class="btn btn-light btn-sm text-danger" type="button" (click)="reset()" [disabled]="saving()">Reset {{ langName() }}</button>
          <button class="btn btn-accent btn-sm" type="button" (click)="save()" [disabled]="saving()"><i class="bi bi-check2"></i> Save {{ langName() }}</button>
        </div>
      </div>
      <p class="small text-muted mb-2">Anything you leave empty shows the grey text — the website's built-in content@if (lang() !== 'en') { , or your English text }.
        The home page is never blank. @if (updated()) { Last saved {{ updated()! + 'Z' | date: 'd MMM y, HH:mm' }}. }</p>
      <ul class="nav nav-pills lang-tabs mb-3" role="tablist">
        @for (l of langs; track l[0]) {
          <li class="nav-item"><button class="nav-link" type="button" role="tab" [class.active]="lang() === l[0]" (click)="switchLang(l[0])">{{ l[1] }}</button></li>
        }
      </ul>
      @if (error()) { <div class="alert alert-danger small" role="alert">{{ error() }}</div> }
      @if (notice()) { <div class="alert alert-success small" role="status">{{ notice() }}</div> }

      @if (loading()) {
        <p class="text-muted small"><span class="spinner-border spinner-border-sm"></span> Loading…</p>
      } @else {
        <!-- Which sections the page shows (English decides for every language) -->
        <details class="hp-section" open>
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

        <!-- Top slider -->
        <details class="hp-section">
          <summary><i class="bi bi-images"></i> Top slider <span class="text-muted small">({{ c.slides?.length || 'built-in ' + defaults.slides.length }} slides)</span></summary>
          @if (!c.slides?.length) {
            <p class="small text-muted">Showing the built-in slides. <button class="btn btn-link btn-sm p-0 align-baseline" type="button" (click)="startFrom('slides')">Edit them</button>
              or <button class="btn btn-link btn-sm p-0 align-baseline" type="button" (click)="add('slides')">add your own slide</button>.</p>
          }
          @for (s of c.slides ?? []; track $index; let i = $index; let last = $last) {
            <div class="hp-item">
              <div class="hp-item-head">
                <strong>Slide {{ i + 1 }}</strong>
                <span class="ms-auto d-flex gap-1">
                  <button class="btn btn-light btn-sm" type="button" (click)="move('slides', i, -1)" [disabled]="i === 0" title="Move up"><i class="bi bi-arrow-up"></i></button>
                  <button class="btn btn-light btn-sm" type="button" (click)="move('slides', i, 1)" [disabled]="last" title="Move down"><i class="bi bi-arrow-down"></i></button>
                  <button class="btn btn-light btn-sm text-danger" type="button" (click)="remove('slides', i)" title="Remove"><i class="bi bi-trash"></i></button>
                </span>
              </div>
              <div class="row g-2">
                <div class="col-md-3">
                  <button type="button" class="hp-thumb" (click)="pick(s, 'image')" title="Choose picture">
                    <img [src]="thumb(s['image'] || ph('slides', i, 'image') || 'img/hero-1.svg')" alt=""><span>Choose picture</span>
                  </button>
                </div>
                <div class="col-md-9 row g-2 m-0 p-0">
                  <div class="col-md-6"><label class="form-label small">Small heading</label><input class="form-control form-control-sm" maxlength="60" [(ngModel)]="s['eyebrow']" [placeholder]="ph('slides', i, 'eyebrow')"></div>
                  <div class="col-md-6"><label class="form-label small">Title</label><input class="form-control form-control-sm" maxlength="120" [(ngModel)]="s['title']" [placeholder]="ph('slides', i, 'title')"></div>
                  <div class="col-md-6"><label class="form-label small">Highlighted line (gold)</label><input class="form-control form-control-sm" maxlength="120" [(ngModel)]="s['highlight']" [placeholder]="ph('slides', i, 'highlight')"></div>
                  <div class="col-md-6"><label class="form-label small">Text</label><input class="form-control form-control-sm" maxlength="400" [(ngModel)]="s['text']" [placeholder]="ph('slides', i, 'text')"></div>
                  <div class="col-6 col-md-3"><label class="form-label small">Button 1</label><input class="form-control form-control-sm" maxlength="40" [(ngModel)]="s['button1Label']" [placeholder]="ph('slides', i, 'button1Label')"></div>
                  <div class="col-6 col-md-3"><label class="form-label small">Button 1 link</label><input class="form-control form-control-sm" maxlength="300" [(ngModel)]="s['button1Link']" [placeholder]="ph('slides', i, 'button1Link') || '/upload'"></div>
                  <div class="col-6 col-md-3"><label class="form-label small">Button 2</label><input class="form-control form-control-sm" maxlength="40" [(ngModel)]="s['button2Label']" [placeholder]="ph('slides', i, 'button2Label')"></div>
                  <div class="col-6 col-md-3"><label class="form-label small">Button 2 link</label><input class="form-control form-control-sm" maxlength="300" [(ngModel)]="s['button2Link']" [placeholder]="ph('slides', i, 'button2Link') || '/selfies'"></div>
                </div>
              </div>
            </div>
          }
          @if (c.slides?.length && c.slides!.length < 8) { <button class="btn btn-outline-secondary btn-sm" type="button" (click)="add('slides')"><i class="bi bi-plus-lg"></i> Add slide</button> }
        </details>

        <!-- Action tiles -->
        <details class="hp-section">
          <summary><i class="bi bi-grid"></i> Action tiles</summary>
          @if (!c.tiles?.length) { <p class="small text-muted">Showing the built-in tiles. <button class="btn btn-link btn-sm p-0 align-baseline" type="button" (click)="startFrom('tiles')">Edit them</button>.</p> }
          @for (t of c.tiles ?? []; track $index; let i = $index; let last = $last) {
            <div class="hp-item row g-2 align-items-end">
              <div class="col-6 col-md-2"><label class="form-label small">Icon</label><input class="form-control form-control-sm" maxlength="45" [(ngModel)]="t['icon']" [placeholder]="ph('tiles', i, 'icon') || 'bi-heart'"></div>
              <div class="col-6 col-md-3"><label class="form-label small">Title</label><input class="form-control form-control-sm" maxlength="60" [(ngModel)]="t['title']" [placeholder]="ph('tiles', i, 'title')"></div>
              <div class="col-md-3"><label class="form-label small">Text</label><input class="form-control form-control-sm" maxlength="100" [(ngModel)]="t['text']" [placeholder]="ph('tiles', i, 'text')"></div>
              <div class="col-md-3"><label class="form-label small">Link</label><input class="form-control form-control-sm" maxlength="300" [(ngModel)]="t['link']" [placeholder]="ph('tiles', i, 'link')"></div>
              <div class="col-md-1 d-flex gap-1">
                <button class="btn btn-light btn-sm" type="button" (click)="move('tiles', i, -1)" [disabled]="i === 0" title="Move up"><i class="bi bi-arrow-up"></i></button>
                <button class="btn btn-light btn-sm text-danger" type="button" (click)="remove('tiles', i)" title="Remove"><i class="bi bi-trash"></i></button>
              </div>
            </div>
          }
          @if (c.tiles?.length && c.tiles!.length < 8) { <button class="btn btn-outline-secondary btn-sm" type="button" (click)="add('tiles')"><i class="bi bi-plus-lg"></i> Add tile</button> }
          <p class="small text-muted mt-2 mb-0">Icons: any <a href="https://icons.getbootstrap.com/" target="_blank" rel="noopener">Bootstrap icon</a> name, e.g. bi-camera, bi-heart.</p>
        </details>

        <!-- Photo features: what you can do with your selfie -->
        <details class="hp-section">
          <summary><i class="bi bi-magic"></i> Photo features <span class="text-muted small">(photo frame, reel, Photo of the Week, family tree)</span></summary>
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" id="scShow" [checked]="!showcase.hidden" (change)="showcase.hidden = !$any($event.target).checked">
            <label class="form-check-label small" for="scShow">Show this section on the home page (under the action tiles)</label>
          </div>
          <div class="row g-2">
            <div class="col-md-4"><label class="form-label small">Small heading</label><input class="form-control form-control-sm" maxlength="60" [(ngModel)]="showcase.eyebrow" [placeholder]="scPh('eyebrow')"></div>
            <div class="col-md-8"><label class="form-label small">Title</label><input class="form-control form-control-sm" maxlength="120" [(ngModel)]="showcase.title" [placeholder]="scPh('title')"></div>
            <div class="col-12"><label class="form-label small">Text</label><input class="form-control form-control-sm" maxlength="300" [(ngModel)]="showcase.intro" [placeholder]="scPh('intro')"></div>
          </div>
          @for (k of scCards; track k.kind; let i = $index; let last = $last) {
            <div class="hp-item sc-item" [class.opacity-50]="k.hidden">
              <div class="hp-item-head gap-2">
                <strong>{{ cardName(k.kind) }}</strong>
                <div class="form-check form-switch mb-0 ms-2">
                  <input class="form-check-input" type="checkbox" [id]="'sc-' + k.kind" [checked]="!k.hidden" (change)="k.hidden = !$any($event.target).checked">
                  <label class="form-check-label small" [for]="'sc-' + k.kind">Show</label>
                </div>
                <span class="ms-auto d-flex gap-1">
                  <button class="btn btn-light btn-sm" type="button" (click)="moveCard(i, -1)" [disabled]="i === 0" title="Move up"><i class="bi bi-arrow-up"></i></button>
                  <button class="btn btn-light btn-sm" type="button" (click)="moveCard(i, 1)" [disabled]="last" title="Move down"><i class="bi bi-arrow-down"></i></button>
                </span>
              </div>
              <div class="row g-2">
                <div class="col-md-3"><label class="form-label small">Title</label><input class="form-control form-control-sm" maxlength="60" [(ngModel)]="k.title" [placeholder]="cardPh(k.kind, 'title')"></div>
                <div class="col-md-5"><label class="form-label small">Text</label><input class="form-control form-control-sm" maxlength="200" [(ngModel)]="k.text" [placeholder]="cardPh(k.kind, 'text')"></div>
                <div class="col-6 col-md-2"><label class="form-label small">Note</label><input class="form-control form-control-sm" maxlength="80" [(ngModel)]="k.note" [placeholder]="cardPh(k.kind, 'note')"></div>
                <div class="col-6 col-md-2"><label class="form-label small">Button</label><input class="form-control form-control-sm" maxlength="40" [(ngModel)]="k.button" [placeholder]="cardPh(k.kind, 'button')"></div>
              </div>
            </div>
          }
          <p class="small text-muted mt-2 mb-0">The pictures on the cards are made by the website from the latest selfie. The buttons open the photo frame, the reel, the contest and the family tree.</p>
        </details>

        <!-- Our story -->
        <details class="hp-section">
          <summary><i class="bi bi-quote"></i> Our story (founder's message)</summary>
          <div class="row g-2">
            <div class="col-md-3">
              <button type="button" class="hp-thumb" (click)="pick(story, 'image')"><img [src]="thumb(story['image'] || phObj('story', 'image'))" alt=""><span>Choose picture</span></button>
            </div>
            <div class="col-md-9 row g-2 m-0 p-0">
              <div class="col-md-4"><label class="form-label small">Small heading</label><input class="form-control form-control-sm" maxlength="60" [(ngModel)]="story['eyebrow']" [placeholder]="phObj('story', 'eyebrow')"></div>
              <div class="col-md-8"><label class="form-label small">Title</label><input class="form-control form-control-sm" maxlength="160" [(ngModel)]="story['title']" [placeholder]="phObj('story', 'title')"></div>
              <div class="col-12"><label class="form-label small">Message</label><textarea class="form-control form-control-sm" rows="4" maxlength="1500" [(ngModel)]="story['quote']" [placeholder]="phObj('story', 'quote')"></textarea></div>
              <div class="col-md-6"><label class="form-label small">Name</label><input class="form-control form-control-sm" maxlength="80" [(ngModel)]="story['name']" [placeholder]="phObj('story', 'name')"></div>
              <div class="col-md-6"><label class="form-label small">Role</label><input class="form-control form-control-sm" maxlength="80" [(ngModel)]="story['role']" [placeholder]="phObj('story', 'role')"></div>
            </div>
          </div>
        </details>

        <!-- Impact numbers -->
        <details class="hp-section">
          <summary><i class="bi bi-bar-chart"></i> Impact numbers</summary>
          @if (!c.stats?.length) { <p class="small text-muted">Showing the built-in sample figures. <button class="btn btn-link btn-sm p-0 align-baseline" type="button" (click)="startFrom('stats')">Use your own numbers</button>.</p> }
          @for (s of c.stats ?? []; track $index; let i = $index) {
            <div class="hp-item row g-2 align-items-end">
              <div class="col-md-4"><label class="form-label small">Label</label><input class="form-control form-control-sm" maxlength="60" [(ngModel)]="s['label']" [placeholder]="ph('stats', i, 'label')"></div>
              <div class="col-md-4"><label class="form-label small">Number</label>
                <select class="form-select form-select-sm" [(ngModel)]="s['source']">
                  <option [ngValue]="null">Type a number</option>
                  <option value="selfies">Count: selfies shared ({{ numbers()?.selfies }})</option>
                  <option value="towns">Count: towns and villages ({{ numbers()?.towns }})</option>
                  <option value="countries">Count: countries ({{ numbers()?.countries }})</option>
                  <option value="families">Count: family photos ({{ numbers()?.families }})</option>
                  <option value="visitors">Count: visitors signed up ({{ numbers()?.visitors }})</option>
                </select></div>
              <div class="col-md-3"><label class="form-label small">{{ s['source'] ? 'Until the count is above 0' : 'Value' }}</label>
                <input class="form-control form-control-sm" type="number" min="0" [(ngModel)]="s['value']" [placeholder]="ph('stats', i, 'value')"></div>
              <div class="col-md-1"><button class="btn btn-light btn-sm text-danger" type="button" (click)="remove('stats', i)" title="Remove"><i class="bi bi-trash"></i></button></div>
            </div>
          }
          @if (c.stats?.length) {
            @if (c.stats!.length < 6) { <button class="btn btn-outline-secondary btn-sm" type="button" (click)="add('stats')"><i class="bi bi-plus-lg"></i> Add number</button> }
            <div class="mt-2"><label class="form-label small">Note under the numbers (optional)</label><input class="form-control form-control-sm" maxlength="200" [(ngModel)]="c.statsNote"></div>
          }
        </details>

        <!-- Questions -->
        <details class="hp-section">
          <summary><i class="bi bi-chat-quote"></i> Question of the day</summary>
          <label class="form-label small">One question per line (a different one each day)</label>
          <textarea class="form-control form-control-sm" rows="8" [(ngModel)]="questionsText" [placeholder]="questionsPlaceholder()"></textarea>
        </details>

        <!-- Themes -->
        <details class="hp-section">
          <summary><i class="bi bi-calendar-heart"></i> Theme of the month</summary>
          @for (m of themes; track m.month) {
            <div class="hp-item row g-2 align-items-end">
              <div class="col-md-2 small fw-semibold pb-1">{{ monthName(m.month) }}</div>
              <div class="col-6 col-md-2"><input class="form-control form-control-sm" maxlength="45" [(ngModel)]="m.icon" [placeholder]="themePh(m.month, 'icon')" aria-label="Icon"></div>
              <div class="col-6 col-md-3"><input class="form-control form-control-sm" maxlength="80" [(ngModel)]="m.title" [placeholder]="themePh(m.month, 'title')" aria-label="Title"></div>
              <div class="col-md-5"><input class="form-control form-control-sm" maxlength="200" [(ngModel)]="m.text" [placeholder]="themePh(m.month, 'text')" aria-label="Text"></div>
            </div>
          }
        </details>

        <!-- Priorities -->
        <details class="hp-section">
          <summary><i class="bi bi-flag"></i> Programme priorities</summary>
          @if (!c.priorities?.length) { <p class="small text-muted">Showing the built-in cards. <button class="btn btn-link btn-sm p-0 align-baseline" type="button" (click)="startFrom('priorities')">Edit them</button>.</p> }
          @for (p of c.priorities ?? []; track $index; let i = $index) {
            <div class="hp-item row g-2 align-items-end">
              <div class="col-6 col-md-2"><label class="form-label small">Icon</label><input class="form-control form-control-sm" maxlength="45" [(ngModel)]="p['icon']" [placeholder]="ph('priorities', i, 'icon') || 'bi-heart'"></div>
              <div class="col-6 col-md-3"><label class="form-label small">Title</label><input class="form-control form-control-sm" maxlength="60" [(ngModel)]="p['title']" [placeholder]="ph('priorities', i, 'title')"></div>
              <div class="col-md-6"><label class="form-label small">Text</label><input class="form-control form-control-sm" maxlength="300" [(ngModel)]="p['text']" [placeholder]="ph('priorities', i, 'text')"></div>
              <div class="col-md-1"><button class="btn btn-light btn-sm text-danger" type="button" (click)="remove('priorities', i)" title="Remove"><i class="bi bi-trash"></i></button></div>
            </div>
          }
          @if (c.priorities?.length && c.priorities!.length < 8) { <button class="btn btn-outline-secondary btn-sm" type="button" (click)="add('priorities')"><i class="bi bi-plus-lg"></i> Add card</button> }
        </details>

        <!-- Pledge -->
        <details class="hp-section">
          <summary><i class="bi bi-hand-thumbs-up"></i> Pledge</summary>
          <div class="row g-2">
            <div class="col-md-5"><label class="form-label small">Title</label><input class="form-control form-control-sm" maxlength="100" [(ngModel)]="pledge['title']" [placeholder]="phObj('pledge', 'title')"></div>
            <div class="col-md-5"><label class="form-label small">Text</label><input class="form-control form-control-sm" maxlength="300" [(ngModel)]="pledge['text']" [placeholder]="phObj('pledge', 'text')"></div>
            <div class="col-md-2"><label class="form-label small">People</label><input class="form-control form-control-sm" type="number" min="0" [(ngModel)]="pledge['count']" [placeholder]="phObj('pledge', 'count')"></div>
          </div>
        </details>

        <!-- App -->
        <details class="hp-section">
          <summary><i class="bi bi-phone"></i> App</summary>
          <div class="row g-2">
            <div class="col-md-5"><label class="form-label small">Title</label><input class="form-control form-control-sm" maxlength="100" [(ngModel)]="app['title']" [placeholder]="phObj('app', 'title')"></div>
            <div class="col-md-7"><label class="form-label small">Text</label><input class="form-control form-control-sm" maxlength="300" [(ngModel)]="app['text']" [placeholder]="phObj('app', 'text')"></div>
            <div class="col-md-6"><label class="form-label small">Google Play link</label><input class="form-control form-control-sm" maxlength="300" [(ngModel)]="app['playUrl']" placeholder="https://play.google.com/… (empty: “Coming soon”)"></div>
            <div class="col-md-6"><label class="form-label small">App Store link</label><input class="form-control form-control-sm" maxlength="300" [(ngModel)]="app['appStoreUrl']" placeholder="https://apps.apple.com/… (empty: “Coming soon”)"></div>
          </div>
        </details>

        <div class="d-flex justify-content-end mt-3">
          <button class="btn btn-accent" type="button" (click)="save()" [disabled]="saving()"><i class="bi bi-check2"></i> Save {{ langName() }}</button>
        </div>
      }
    </section>

    @if (picking(); as p) {
      <app-image-library [current]="str(p.item[p.key])" (chosen)="p.item[p.key] = $event; picking.set(null)" (closed)="picking.set(null)" />
    }`,
  styles: `
    .hp-section { border: 1px solid rgba(0,0,0,.08); border-radius: .7rem; padding: .6rem .9rem; margin-bottom: .75rem; background: #fff; }
    .hp-section > summary { font-weight: 600; cursor: pointer; padding: .2rem 0; }
    .sec-switches { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: .2rem 1rem; }
    .hp-section[open] > summary { margin-bottom: .6rem; }
    .hp-item { border-top: 1px dashed rgba(0,0,0,.1); padding: .6rem 0; margin: 0; }
    .hp-item-head { display: flex; align-items: center; margin-bottom: .4rem; }
    .hp-thumb { position: relative; display: block; width: 100%; padding: 0; border: 1px solid rgba(0,0,0,.12); border-radius: .5rem; overflow: hidden; background: #f3f0ea; }
    .hp-thumb img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; }
    .hp-thumb span { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.55); color: #fff; font-size: .75rem; padding: .2rem; }
  `
})
export class HomePage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiBaseUrl}/api/v1/admin/home`;
  protected readonly site = environment.publicSiteUrl;
  protected readonly langs = LANGS;
  protected readonly sectionList: [string, string][] = [['slider', 'Top slider'], ['tiles', 'Action tiles'], ['showcase', 'Photo features'],
    ['story', 'Our story'], ['stats', 'Impact numbers'], ['question', 'Question of the day'], ['reminders', 'Birthday reminders'], ['theme', 'Theme of the month'],
    ['contest', 'Photo of the Week spotlight'], ['featured', 'Featured selfies'], ['priorities', 'Programme priorities'], ['pledge', 'Pledge'], ['app', 'App'],
    ['contact', 'Contact']];
  protected readonly defaults = { slides: DEFAULT_SLIDES as Item[], tiles: DEFAULT_TILES as Item[], stats: DEFAULT_STATS as Item[], priorities: DEFAULT_PRIORITIES as Item[] };

  protected readonly lang = signal('en');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly updated = signal<string | null>(null);
  protected readonly numbers = signal<Numbers | null>(null);
  protected readonly picking = signal<{ item: Item; key: string } | null>(null);

  /** What's being edited (this language), and English (for the placeholders of other languages). */
  protected c: HomeContent = {};
  protected story: Item = {};
  protected pledge: Item = {};
  protected app: Item = {};
  protected themes: { month: number; icon: string; title: string; text: string }[] = [];
  protected questionsText = '';
  protected showcase = { hidden: false, eyebrow: '', title: '', intro: '' };
  protected scCards: { kind: string; hidden: boolean; title: string; text: string; note: string; button: string }[] = [];
  private english: HomeContent = {};

  ngOnInit(): void { void this.load(); }

  protected langName(): string { return LANGS.find(l => l[0] === this.lang())![1]; }
  protected monthName(m: number): string { return MONTHS[m]; }
  protected str(v: unknown): string { return typeof v === 'string' ? v : ''; }
  protected thumb(path: unknown): string { return imageUrl(this.str(path) || 'img/hero-1.svg'); }

  protected async switchLang(l: string): Promise<void> {
    if (l === this.lang()) return;
    this.lang.set(l);
    this.notice.set('');
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await firstValueFrom(this.http.get<AdminHome>(this.api, { params: { lang: this.lang() } }));
      this.english = this.lang() === 'en' ? (r.content ?? {}) : ((await firstValueFrom(this.http.get<AdminHome>(this.api, { params: { lang: 'en' } }))).content ?? {});
      this.numbers.set(r.numbers);
      this.updated.set(r.updatedAtUtc);
      this.fill(r.content ?? {});
    } catch (e) { this.error.set(problemMessage(e)); }
    finally { this.loading.set(false); }
  }

  private fill(content: HomeContent): void {
    const copy = (x?: Item[]) => (x ?? []).map(i => ({ ...i }));
    this.c = { slides: copy(content.slides), tiles: copy(content.tiles), stats: copy(content.stats), priorities: copy(content.priorities), statsNote: content.statsNote ?? '' };
    this.story = { ...(content.story ?? {}) };
    this.pledge = { ...(content.pledge ?? {}) };
    this.app = { ...(content.app ?? {}) };
    this.themes = MONTHS.map((_, m) => {
      const t = (content.themes ?? []).find(x => x['month'] === m);
      return { month: m, icon: this.str(t?.['icon']), title: this.str(t?.['title']), text: this.str(t?.['text']) };
    });
    this.questionsText = (content.questions ?? []).join('\n');
    this.hiddenSet = new Set((this.lang() === 'en' ? content : this.english).hiddenSections ?? []);
    // Photo features: this language's cards; until it has some, English's order and hidden cards (other languages only add words)
    const sc = content.showcase ?? {};
    const base = this.baseCards(sc);
    this.showcase = { hidden: sc.hidden ?? this.baseHidden(), eyebrow: sc.eyebrow ?? '', title: sc.title ?? '', intro: sc.intro ?? '' };
    this.scCards = this.order(base).map(kind => {
      const own = sc.cards?.find(x => x.kind === kind), b = base.find(x => x.kind === kind);
      return { kind, hidden: !!b?.hidden, title: own?.title ?? '', text: own?.text ?? '', note: own?.note ?? '', button: own?.button ?? '' };
    });
  }

  // ---------- Sections on the page ----------

  protected hiddenSet = new Set<string>();
  protected visibleCount(): number { return this.sectionList.length - this.sectionList.filter(x => this.hiddenSet.has(x[0])).length; }
  protected toggleSection(key: string, on: boolean): void {
    const s = new Set(this.hiddenSet);
    if (on) s.delete(key); else s.add(key);
    this.hiddenSet = s;
  }

  // ---------- Photo features ----------

  /** The cards the website shows for this language when it has none of its own: English's (other languages), else the built-in. */
  private baseCards(sc: Showcase = {}): ShowcaseCard[] {
    if (sc.cards?.length) return sc.cards;
    return this.lang() !== 'en' ? this.english.showcase?.cards ?? [] : [];
  }
  private baseHidden(): boolean { return this.lang() !== 'en' ? !!this.english.showcase?.hidden : false; }
  /** Card order: the given cards first, then any built-in ones they leave out. */
  private order(cards: ShowcaseCard[]): string[] {
    return [...cards.map(x => x.kind), ...DEFAULT_SHOWCASE.cards.map(x => x.kind)]
      .filter((k, i, a) => a.indexOf(k) === i && DEFAULT_SHOWCASE.cards.some(d => d.kind === k));
  }

  protected cardName(kind: string): string { return DEFAULT_SHOWCASE.cards.find(x => x.kind === kind)?.name ?? kind; }
  protected scPh(key: 'eyebrow' | 'title' | 'intro'): string {
    return (this.lang() !== 'en' ? this.english.showcase?.[key] : null) || DEFAULT_SHOWCASE[key];
  }
  protected cardPh(kind: string, key: CardKey): string {
    const en = this.lang() !== 'en' ? this.english.showcase?.cards?.find(x => x.kind === kind)?.[key] : null;
    return en || DEFAULT_SHOWCASE.cards.find(x => x.kind === kind)?.[key] || '';
  }
  protected moveCard(i: number, by: number): void {
    const j = i + by;
    if (j < 0 || j >= this.scCards.length) return;
    const l = [...this.scCards];
    [l[i], l[j]] = [l[j], l[i]];
    this.scCards = l;
  }

  /** Photo features to save: only what differs from what the website would show anyway. */
  private showcasePayload(): Showcase | null {
    const out: Showcase = {};
    if (this.showcase.hidden !== this.baseHidden()) out.hidden = this.showcase.hidden;
    for (const k of ['eyebrow', 'title', 'intro'] as const) if (this.showcase[k].trim()) out[k] = this.showcase[k].trim();
    const before = this.baseCards();
    const sameOrder = this.scCards.map(x => x.kind).join() === this.order(before).join();
    const sameHidden = this.scCards.every(x => x.hidden === !!before.find(b => b.kind === x.kind)?.hidden);
    const words = this.scCards.some(x => CARD_KEYS.some(k => x[k].trim()));
    if (!sameOrder || !sameHidden || words) {
      out.cards = this.scCards.map(x => {
        const c: ShowcaseCard = { kind: x.kind };
        if (x.hidden) c.hidden = true;
        for (const k of CARD_KEYS) if (x[k].trim()) c[k] = x[k].trim();
        return c;
      });
    }
    return Object.keys(out).length ? out : null;
  }

  // ---------- Placeholders: English (for other languages), then the website's default ----------

  protected ph(list: 'slides' | 'tiles' | 'stats' | 'priorities', i: number, key: string): string {
    const en = this.lang() !== 'en' ? this.english[list]?.[i]?.[key] : undefined;
    const def = (this.defaults[list][i] ?? {})[key];
    return String(en ?? def ?? '');
  }

  protected phObj(obj: 'story' | 'pledge' | 'app', key: string): string {
    const en = this.lang() !== 'en' ? this.english[obj]?.[key] : undefined;
    const def = ({ story: DEFAULT_STORY, pledge: DEFAULT_PLEDGE, app: DEFAULT_APP } as Record<string, Item>)[obj][key];
    return String(en ?? def ?? '');
  }

  protected themePh(month: number, key: 'icon' | 'title' | 'text'): string {
    const en = this.lang() !== 'en' ? (this.english.themes ?? []).find(x => x['month'] === month)?.[key] : undefined;
    return String(en ?? DEFAULT_THEMES.find(x => x.month === month)?.[key] ?? '');
  }

  protected questionsPlaceholder(): string {
    return (this.lang() !== 'en' && this.english.questions?.length ? this.english.questions : DEFAULT_QUESTIONS).join('\n');
  }

  // ---------- Lists ----------

  /** Starts editing a list from what the website shows now (English / the built-in content). */
  protected startFrom(list: 'slides' | 'tiles' | 'stats' | 'priorities'): void {
    const from = this.lang() !== 'en' && this.english[list]?.length ? this.english[list]! : this.defaults[list];
    this.c[list] = from.map(x => ({ ...x }));
  }

  protected add(list: 'slides' | 'tiles' | 'stats' | 'priorities'): void { this.c[list] = [...(this.c[list] ?? []), {}]; }
  protected remove(list: 'slides' | 'tiles' | 'stats' | 'priorities', i: number): void { this.c[list] = (this.c[list] ?? []).filter((_, j) => j !== i); }
  protected move(list: 'slides' | 'tiles', i: number, by: number): void {
    const l = [...(this.c[list] ?? [])];
    const j = i + by;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    this.c[list] = l;
  }

  protected pick(item: Item, key: string): void { this.picking.set({ item, key }); }

  // ---------- Save / reset ----------

  /** Only what's filled in is saved; empty fields and lists show the defaults on the website. */
  private payload(): HomeContent {
    const clean = (o: Item): Item | null => {
      const r: Item = {};
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string' ? v.trim() : v !== null && v !== undefined && v !== ('' as unknown)) r[k] = typeof v === 'string' ? v.trim() : v;
      }
      return Object.keys(r).length ? r : null;
    };
    const items = (l?: Item[]) => (l ?? []).map(clean).filter((x): x is Item => !!x);
    const out: HomeContent = {};
    for (const k of ['slides', 'tiles', 'stats', 'priorities'] as const) { const v = items(this.c[k]); if (v.length) out[k] = v; }
    if (this.c.statsNote?.trim()) out.statsNote = this.c.statsNote.trim();
    const story = clean(this.story), pledge = clean(this.pledge), app = clean(this.app);
    if (story) out.story = story;
    if (pledge) out.pledge = pledge;
    if (app) out.app = app;
    const themes = this.themes.filter(t => t.icon.trim() || t.title.trim() || t.text.trim()).map(t => clean({ ...t }) as Item);
    if (themes.length) out.themes = themes;
    const questions = this.questionsText.split('\n').map(q => q.trim()).filter(Boolean);
    if (questions.length) out.questions = questions;
    if (this.lang() === 'en' && this.hiddenSet.size) out.hiddenSections = [...this.hiddenSet];
    const showcase = this.showcasePayload();
    if (showcase) out.showcase = showcase;
    return out;
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await firstValueFrom(this.http.put(this.api, this.payload(), { params: { lang: this.lang() } }));
      this.notice.set(`Saved the ${this.langName()} home page — the website shows it now.`);
      await this.load();
      this.notice.set(`Saved the ${this.langName()} home page — the website shows it now.`);
    } catch (e) { this.error.set(problemMessage(e)); }
    finally { this.saving.set(false); }
  }

  protected async reset(): Promise<void> {
    const what = this.lang() === 'en' ? "the website's built-in home page" : 'the English text';
    if (!confirm(`Reset the ${this.langName()} home page? It will show ${what} again.`)) return;
    this.saving.set(true);
    try {
      await firstValueFrom(this.http.delete(this.api, { params: { lang: this.lang() } }));
      await this.load();
      this.notice.set(`The ${this.langName()} home page shows ${what} again.`);
    } catch (e) { this.error.set(problemMessage(e)); }
    finally { this.saving.set(false); }
  }
}
