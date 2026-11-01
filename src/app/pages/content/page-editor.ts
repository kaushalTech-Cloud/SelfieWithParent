import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  BLOCKS, FieldDef, LANGUAGES, ListDef, Node, PageDetail, Translations, blockDef, buildTranslation, cleanForSave,
  cloneWithNewIds, findProblems, indexTranslation, newBlock, newItem, slugProblem, translatableFields
} from '../../core/content.models';
import { problemMessage } from '../../core/problem';
import { ImageLibrary, imageUrl } from './image-library';

/** Icons offered in the icon boxes (any Bootstrap icon name works). */
const ICONS = ['bi-heart', 'bi-person', 'bi-people', 'bi-camera', 'bi-house-heart', 'bi-hand-thumbs-up', 'bi-signpost-split', 'bi-compass',
  'bi-eye', 'bi-gift', 'bi-translate', 'bi-shield-lock', 'bi-shield-check', 'bi-heart-pulse', 'bi-mortarboard', 'bi-globe2', 'bi-flag',
  'bi-lightbulb', 'bi-envelope', 'bi-telephone', 'bi-phone', 'bi-linkedin', 'bi-twitter-x', 'bi-instagram', 'bi-facebook', 'bi-youtube',
  'bi-award', 'bi-newspaper', 'bi-mic', 'bi-star', 'bi-check-circle', 'bi-calendar-event', 'bi-geo-alt', 'bi-chat-heart', 'bi-megaphone'];

interface Draft { title: string; description: string; tr: Translations; exists: boolean; }

/**
 * The page builder: English holds the page (add, move, hide, copy and delete blocks; edit every field); each other
 * language shows the English text next to a box for the translation. Saving checks the content the same way the API does.
 */
@Component({
  selector: 'app-page-editor',
  imports: [FormsModule, NgTemplateOutlet, RouterLink, DatePipe, ImageLibrary],
  templateUrl: './page-editor.html'
})
export class PageEditor implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl + '/api/v1/admin/pages';
  protected readonly site = environment.publicSiteUrl;

  private readonly route = inject(ActivatedRoute);

  protected readonly blockTypes = BLOCKS;
  protected readonly languages = LANGUAGES;
  protected readonly icons = ICONS;
  protected readonly def = blockDef;
  protected readonly img = imageUrl;

  protected readonly page = signal<PageDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');

  // Page settings (address, published)
  protected settings = { slug: '', isPublished: false };
  protected readonly settingsBusy = signal(false);
  protected readonly settingsMessage = signal<{ ok: boolean; text: string } | null>(null);

  // Content
  protected readonly lang = signal<string>('en');
  protected blocks: Node[] = [];
  protected en = { title: '', description: '' };
  protected drafts: Record<string, Draft> = {};
  protected readonly dirty = signal(false);
  protected readonly saving = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly notice = signal('');
  /** Language the editor asked to switch to while there were unsaved changes. */
  protected readonly pendingLang = signal<string | null>(null);

  protected readonly open = signal<Set<string>>(new Set());
  /** Where the "add a block" chooser is open (index to insert at), or null. */
  protected readonly addingAt = signal<number | null>(null);
  protected readonly confirmDelete = signal<string | null>(null);
  /** The node + field the image library is choosing for. */
  protected readonly picking = signal<{ node: Record<string, unknown>; key: string } | null>(null);

  protected readonly langName = computed(() => LANGUAGES.find(l => l.code === this.lang())?.name ?? this.lang());

  ngOnInit(): void { void this.load(); }

  @HostListener('window:beforeunload', ['$event'])
  protected warnBeforeUnload(e: BeforeUnloadEvent): void { if (this.dirty()) e.preventDefault(); }

  /** Route guard: leaving with unsaved changes asks first. */
  canLeave(): boolean { return !this.dirty() || confirm('You have unsaved changes on this page. Leave without saving?'); }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const p = await firstValueFrom(this.http.get<PageDetail>(`${this.api}/${encodeURIComponent(this.route.snapshot.paramMap.get('id') ?? '')}`));
      this.page.set(p);
      this.settings = { slug: p.slug, isPublished: p.isPublished };
      const en = p.contents.find(c => c.language === 'en')!;
      this.blocks = structuredClone(en.blocks);
      this.en = { title: en.title, description: en.description ?? '' };
      this.drafts = {};
      for (const l of LANGUAGES.filter(x => x.code !== 'en')) {
        const c = p.contents.find(x => x.language === l.code);
        this.drafts[l.code] = { title: c?.title ?? '', description: c?.description ?? '', tr: indexTranslation(c?.blocks ?? []), exists: !!c };
      }
      this.dirty.set(false);
    } catch (e) {
      this.loadError.set(problemMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  // ---------- Page settings ----------

  protected async saveSettings(): Promise<void> {
    const slug = this.settings.slug.trim();
    const problem = slugProblem(slug);
    if (problem) { this.settingsMessage.set({ ok: false, text: problem }); return; }
    this.settingsBusy.set(true);
    this.settingsMessage.set(null);
    try {
      await firstValueFrom(this.http.put(`${this.api}/${this.page()!.pageId}`, { slug, isPublished: this.settings.isPublished }));
      this.page.update(p => p && { ...p, slug, isPublished: this.settings.isPublished });
      this.settingsMessage.set({ ok: true, text: this.settings.isPublished ? `Published at /${slug}.` : `Saved. The page is a draft: visitors can't see it.` });
    } catch (e) {
      this.settingsMessage.set({ ok: false, text: problemMessage(e) });
    } finally {
      this.settingsBusy.set(false);
    }
  }

  // ---------- Languages ----------

  protected switchLang(code: string): void {
    if (code === this.lang()) return;
    if (this.dirty()) { this.pendingLang.set(code); return; }
    this.lang.set(code);
    this.errors.set([]);
    this.notice.set('');
  }

  protected async discardAndSwitch(): Promise<void> {
    const next = this.pendingLang();
    this.pendingLang.set(null);
    await this.load();
    if (next) this.switchLang(next);
  }

  protected draft(): Draft { return this.drafts[this.lang()]; }

  /** The translation boxes of one block / entry. */
  protected trOf(id: string): Record<string, string> {
    const tr = this.draft().tr;
    return tr[id] ??= {};
  }

  protected textFields(fields: FieldDef[], node: Record<string, unknown>): FieldDef[] { return translatableFields(fields, node); }

  // ---------- Blocks ----------

  protected summary(b: Node): string {
    const t = ['title', 'heading', 'kicker', 'eyebrow', 'name', 'text'].map(k => b[k]).find(v => typeof v === 'string' && v.trim());
    return (t as string | undefined)?.slice(0, 80) ?? '';
  }

  protected isOpen(id: string): boolean { return this.open().has(id); }

  protected toggle(id: string): void {
    this.open.update(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  protected addBlock(type: string, at: number): void {
    const b = newBlock(type);
    this.blocks.splice(at, 0, b);
    this.addingAt.set(null);
    this.open.update(s => new Set(s).add(b.id));
    this.dirty.set(true);
  }

  protected move<T>(list: T[], i: number, by: number): void {
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.dirty.set(true);
  }

  protected copyBlock(i: number): void {
    const copy = cloneWithNewIds(this.blocks[i]);
    this.blocks.splice(i + 1, 0, copy);
    this.open.update(s => new Set(s).add(copy.id));
    this.dirty.set(true);
  }

  protected toggleHidden(b: Node): void {
    if (b['hidden']) delete b['hidden']; else b['hidden'] = true;
    this.dirty.set(true);
  }

  protected removeBlock(i: number): void {
    this.blocks.splice(i, 1);
    this.confirmDelete.set(null);
    this.dirty.set(true);
  }

  protected listOf(node: Record<string, unknown>, list: ListDef): Node[] {
    return (node[list.key] as Node[] | undefined) ?? [];
  }

  protected addItem(node: Record<string, unknown>, list: ListDef): void {
    const items = (node[list.key] as Node[] | undefined) ?? [];
    items.push(newItem(list));
    node[list.key] = items;
    this.dirty.set(true);
  }

  protected removeItem(node: Record<string, unknown>, list: ListDef, i: number): void {
    (node[list.key] as Node[]).splice(i, 1);
    this.dirty.set(true);
  }

  protected chooseImage(path: string): void {
    const p = this.picking();
    if (p) { p.node[p.key] = path; this.dirty.set(true); }
    this.picking.set(null);
  }

  protected str(v: unknown): string { return typeof v === 'string' ? v : v == null ? '' : String(v); }

  // ---------- Save ----------

  protected async save(): Promise<void> {
    this.errors.set([]);
    this.notice.set('');
    const lang = this.lang();
    const pageId = this.page()!.pageId;
    const title = lang === 'en' ? this.en.title.trim() : this.draft().title.trim();
    const description = (lang === 'en' ? this.en.description : this.draft().description).trim();

    const problems: string[] = [];
    if (!title) problems.push(lang === 'en' ? 'Enter the page title.' : `Enter the page title in ${this.langName()}.`);
    if (/[<>]/.test(title + description)) problems.push("The title and description can't contain < or >.");
    let body: Node[];
    if (lang === 'en') {
      body = cleanForSave(this.blocks);
      problems.push(...findProblems(body));
    } else {
      body = buildTranslation(this.blocks, this.draft().tr);
      if (JSON.stringify(body).match(/[<>]/)) problems.push("Text can't contain < or >.");
    }
    if (problems.length) { this.errors.set(problems); return; }

    this.saving.set(true);
    try {
      await firstValueFrom(this.http.put(`${this.api}/${pageId}/content/${lang}`, { title, description: description || null, blocks: body }));
      if (lang === 'en') this.blocks = body; else this.draft().exists = true;
      this.dirty.set(false);
      this.notice.set(lang === 'en'
        ? 'English version saved.' + (this.page()!.isPublished ? ' Visitors see the changes now.' : '')
        : `${this.langName()} translation saved. Anything not translated shows in English.`);
      const next = this.pendingLang();
      if (next) { this.pendingLang.set(null); this.switchLang(next); }
    } catch (e) {
      this.errors.set([problemMessage(e)]);
    } finally {
      this.saving.set(false);
    }
  }

  protected async removeTranslation(): Promise<void> {
    const lang = this.lang();
    if (lang === 'en' || !confirm(`Remove the ${this.langName()} translation? Visitors will see this page in English.`)) return;
    this.saving.set(true);
    this.errors.set([]);
    try {
      await firstValueFrom(this.http.delete(`${this.api}/${this.page()!.pageId}/content/${lang}`));
      this.drafts[lang] = { title: '', description: '', tr: {}, exists: false };
      this.dirty.set(false);
      this.notice.set(`${this.langName()} translation removed.`);
    } catch (e) {
      this.errors.set([problemMessage(e)]);
    } finally {
      this.saving.set(false);
    }
  }
}
