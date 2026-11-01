import { NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminMenu, AdminMenuItem, LANGUAGES, PageListItem, isSafeUrl } from '../../core/content.models';
import { problemMessage } from '../../core/problem';

const MENUS = [
  { code: 'main', name: 'Main menu', hint: 'The menu at the top of every page.' },
  { code: 'footer', name: 'Footer', hint: 'The links at the bottom of every page. Dropdowns are shown as columns.' }
] as const;

const TYPES = [
  { code: 'Link', name: 'Link' }, { code: 'Dropdown', name: 'Dropdown (group of links)' },
  { code: 'Button', name: 'Button' }, { code: 'Divider', name: 'Divider line (inside a dropdown)' }
] as const;

interface ItemForm {
  itemType: string; label: string; labels: Record<string, string>; url: string; parentMenuItemId: number | null;
  icon: string; visibility: string; opensNewTab: boolean; isActive: boolean; itemKey: string;
}

const emptyForm = (): ItemForm => ({
  itemType: 'Link', label: '', labels: {}, url: '', parentMenuItemId: null, icon: '', visibility: 'Always',
  opensNewTab: false, isActive: true, itemKey: ''
});

/** Super admins and admins: the public website's menus (main + footer) — add, edit, move and delete entries, labels per language. */
@Component({
  selector: 'app-menus',
  imports: [FormsModule, NgTemplateOutlet],
  templateUrl: './menus.html'
})
export class Menus implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl + '/api/v1/admin/menus';

  protected readonly menus = MENUS;
  protected readonly types = TYPES;
  protected readonly translations = LANGUAGES.filter(l => l.code !== 'en');

  protected readonly menuCode = signal<string>('main');
  protected readonly items = signal<AdminMenuItem[]>([]);
  protected readonly pages = signal<PageListItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly busy = signal(false);
  protected readonly listNotice = signal('');
  protected readonly listError = signal('');
  protected readonly confirming = signal<number | null>(null);

  protected form: ItemForm = emptyForm();
  protected keyEdited = false;
  protected readonly editing = signal<AdminMenuItem | null>(null);
  protected readonly saving = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly notice = signal('');
  private readonly formPanel = viewChild<ElementRef<HTMLElement>>('formPanel');

  /** Top-level entries in order, each with its children in order. */
  protected readonly tree = computed(() => {
    const all = this.items();
    const sorted = (list: AdminMenuItem[]) => [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.menuItemId - b.menuItemId);
    return sorted(all.filter(i => i.parentMenuItemId === null))
      .map(i => ({ item: i, children: sorted(all.filter(c => c.parentMenuItemId === i.menuItemId)) }));
  });

  protected readonly topItems = computed(() => this.tree().map(n => n.item));

  /** Dropdowns an entry can go inside. */
  protected readonly dropdowns = computed(() => this.items().filter(i => i.itemType === 'Dropdown' && i.parentMenuItemId === null));

  protected readonly menuHint = computed(() => MENUS.find(m => m.code === this.menuCode())?.hint ?? '');

  ngOnInit(): void {
    void this.load();
    void this.loadPages();
  }

  protected switchMenu(code: string): void {
    if (code === this.menuCode()) return;
    this.menuCode.set(code);
    this.cancelEdit();
    this.listNotice.set('');
    this.notice.set('');
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const res = await firstValueFrom(this.http.get<AdminMenu>(`${this.api}/${this.menuCode()}`));
      this.items.set(res.items);
    } catch (e) {
      this.loadError.set(problemMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** Content pages, so a link can point at one by picking it. */
  private async loadPages(): Promise<void> {
    try {
      this.pages.set(await firstValueFrom(this.http.get<PageListItem[]>(environment.apiBaseUrl + '/api/v1/admin/pages')));
    } catch { /* the address can still be typed */ }
  }

  protected typeName(code: string): string { return TYPES.find(t => t.code === code)?.name.replace(/ \(.*/, '') ?? code; }

  protected canEdit(i: AdminMenuItem): boolean { return i.itemType !== 'Action'; }

  protected translatedCount(i: AdminMenuItem): number { return Object.keys(i.labels).length; }

  // ---------- Add / edit (one form) ----------

  protected startEdit(i: AdminMenuItem): void {
    this.confirming.set(null);
    this.errors.set([]);
    this.notice.set('');
    this.listNotice.set('');
    this.form = {
      itemType: i.itemType, label: i.label, labels: { ...i.labels }, url: i.url ?? '', parentMenuItemId: i.parentMenuItemId,
      icon: i.icon ?? '', visibility: i.visibility, opensNewTab: i.opensNewTab, isActive: i.isActive, itemKey: i.itemKey
    };
    this.keyEdited = true;
    this.editing.set(i);
    setTimeout(() => this.formPanel()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected startAdd(parent: AdminMenuItem | null): void {
    this.cancelEdit();
    this.form.parentMenuItemId = parent?.menuItemId ?? null;
    setTimeout(() => this.formPanel()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected cancelEdit(): void {
    this.editing.set(null);
    this.errors.set([]);
    this.form = emptyForm();
    this.keyEdited = false;
  }

  /** A key is suggested from the label for new entries (e.g. "about.our-team"). */
  protected suggestKey(): void {
    if (this.keyEdited) return;
    const base = this.form.label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'item';
    const parent = this.items().find(i => i.menuItemId === this.form.parentMenuItemId);
    this.form.itemKey = (parent ? `${parent.itemKey}.${base}` : base).slice(0, 50);
  }

  protected pickPage(slug: string): void {
    if (!slug) return;
    this.form.url = '/' + slug;
    const p = this.pages().find(x => x.slug === slug);
    if (p && !this.form.label.trim()) { this.form.label = p.title.replace(/ \|.*$/, ''); this.suggestKey(); }
  }

  private check(): string[] {
    const f = this.form;
    const problems: string[] = [];
    const needsUrl = f.itemType === 'Link' || f.itemType === 'Button';
    if (!f.label.trim()) problems.push('Enter the English label.');
    if ([f.label, ...Object.values(f.labels)].some(v => /[<>]/.test(v ?? ''))) problems.push("Labels can't contain < or >.");
    if (needsUrl && !isSafeUrl(f.url.trim())) problems.push('Enter a link starting with /, https://, mailto: or tel:.');
    if (f.icon.trim() && !/^bi-[a-z0-9-]{1,37}$/.test(f.icon.trim())) problems.push('Icons look like "bi-heart".');
    if (!/^[a-z0-9.-]{1,50}$/.test(f.itemKey)) problems.push('The key can use lower-case letters, numbers, dots and hyphens.');
    if (f.itemType === 'Dropdown' && f.parentMenuItemId !== null) problems.push("A dropdown can't go inside another dropdown.");
    if (f.itemType === 'Divider' && f.parentMenuItemId === null) problems.push('A divider goes inside a dropdown.');
    return problems;
  }

  protected async submit(): Promise<void> {
    this.errors.set([]);
    this.notice.set('');
    const problems = this.check();
    if (problems.length) { this.errors.set(problems); return; }

    const f = this.form;
    const editing = this.editing();
    const siblings = this.items().filter(i => i.parentMenuItemId === f.parentMenuItemId && i.menuItemId !== editing?.menuItemId);
    // New entries (or entries moved to another group) go last; others keep their place
    const sortOrder = editing && editing.parentMenuItemId === f.parentMenuItemId
      ? editing.sortOrder
      : Math.min(32000, Math.max(0, ...siblings.map(s => s.sortOrder)) + 10);
    const labels: Record<string, string> = {};
    for (const l of this.translations) if (f.labels[l.code]?.trim()) labels[l.code] = f.labels[l.code].trim();
    const body = {
      parentMenuItemId: f.parentMenuItemId, itemKey: f.itemKey, itemType: f.itemType, label: f.label.trim(), labels,
      url: f.itemType === 'Link' || f.itemType === 'Button' ? f.url.trim() : null, icon: f.icon.trim() || null,
      visibility: f.visibility, opensNewTab: f.opensNewTab, isActive: f.isActive, sortOrder
    };

    this.saving.set(true);
    try {
      if (editing) await firstValueFrom(this.http.put(`${this.api}/${this.menuCode()}/items/${editing.menuItemId}`, body));
      else await firstValueFrom(this.http.post(`${this.api}/${this.menuCode()}/items`, body));
      const message = `"${body.label}" was ${editing ? 'updated' : 'added'}. Visitors see the change now.`;
      this.cancelEdit();
      this.notice.set(message);
      await this.load();
    } catch (e) {
      this.errors.set([problemMessage(e)]);
    } finally {
      this.saving.set(false);
    }
  }

  // ---------- Move / delete ----------

  /** Swaps an entry with its neighbour, then saves the whole menu's order. */
  protected async move(list: AdminMenuItem[], index: number, by: number): Promise<void> {
    const j = index + by;
    if (j < 0 || j >= list.length) return;
    const ordered = [...list];
    [ordered[index], ordered[j]] = [ordered[j], ordered[index]];
    const changed = new Map(ordered.map((i, n) => [i.menuItemId, (n + 1) * 10]));
    const order = this.items().map(i => ({ id: i.menuItemId, parentId: i.parentMenuItemId, sortOrder: changed.get(i.menuItemId) ?? i.sortOrder }));

    this.busy.set(true);
    this.listError.set('');
    this.listNotice.set('');
    try {
      await firstValueFrom(this.http.put(`${this.api}/${this.menuCode()}/order`, order));
      await this.load();
    } catch (e) {
      this.listError.set(problemMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** One click: hide an entry from visitors (or show it again) without opening the form. */
  protected async toggleActive(i: AdminMenuItem): Promise<void> {
    const body = {
      parentMenuItemId: i.parentMenuItemId, itemKey: i.itemKey, itemType: i.itemType, label: i.label, labels: { ...i.labels },
      url: i.url, icon: i.icon, visibility: i.visibility, opensNewTab: i.opensNewTab, isActive: !i.isActive, sortOrder: i.sortOrder
    };
    this.busy.set(true);
    this.listError.set('');
    try {
      await firstValueFrom(this.http.put(`${this.api}/${this.menuCode()}/items/${i.menuItemId}`, body));
      this.listNotice.set(`"${i.label}" is ${body.isActive ? 'shown to visitors again' : 'hidden from visitors'}.`);
      await this.load();
    } catch (e) {
      this.listError.set(problemMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(i: AdminMenuItem): Promise<void> {
    this.busy.set(true);
    this.listError.set('');
    try {
      await firstValueFrom(this.http.delete(`${this.api}/items/${i.menuItemId}`));
      this.confirming.set(null);
      if (this.editing()?.menuItemId === i.menuItemId) this.cancelEdit();
      this.listNotice.set(`"${i.label}" was deleted.`);
      await this.load();
    } catch (e) {
      this.listError.set(problemMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
