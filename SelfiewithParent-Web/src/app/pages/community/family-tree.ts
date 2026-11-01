import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, PLATFORM_ID, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { SeoService } from '../../core/seo.service';
import { FamilyTreeDraft } from './then-now-draft';
import { DonatePill } from '../../shared/donate-pill';

/** Generations, oldest first. Each offers the relations that fit it. */
interface Generation { id: number; name: string; relations: string[]; sides: boolean; }
interface Person { key: string; gen: number; relation: string; side: string; name: string; img: HTMLImageElement | null; url: string | null; }

const GENERATIONS: Generation[] = [
  { id: 0, name: 'Great-grandparents', relations: ['Great-grandfather', 'Great-grandmother'], sides: true },
  { id: 1, name: 'Grandparents', relations: ['Grandfather', 'Grandmother'], sides: true },
  { id: 2, name: 'Parents, uncles and aunts', relations: ['Father', 'Mother', 'Step-parent', 'Guardian', 'Uncle', 'Aunt'], sides: false },
  { id: 3, name: 'You, brothers and sisters', relations: ['You', 'Brother', 'Sister', 'Husband', 'Wife', 'Partner', 'Cousin'], sides: false },
  { id: 4, name: 'Children', relations: ['Son', 'Daughter', 'Child', 'Son-in-law', 'Daughter-in-law'], sides: false },
  { id: 5, name: 'Grandchildren', relations: ['Grandson', 'Granddaughter'], sides: false }
];
const SIDES = ['', "Father's side", "Mother's side"];
const MAX_PER_ROW = 12;
const STORE = 'swp-family-tree';

// Drawing sizes
const SLOT = 300, MIN_W = 1600, ROW_H = 360, TOP = 170, BOTTOM = 120;

/**
 * Family Tree (from the design), for families of any size: generations from great-grandparents to grandchildren, as
 * many people in each as needed, each with a relation, a name and a photo. Drawn on a canvas that grows with the family,
 * and downloaded as a picture. Nothing is uploaded: photos stay on the device; names are remembered in this browser.
 */
@Component({
  selector: 'app-family-tree',
  imports: [DonatePill, FormsModule, TranslatePipe],
  templateUrl: './family-tree.html',
  styles: `
    /* The card keeps its rounded corners; only the list inside it scrolls */
    @media (min-width: 992px) { .tree-wrap { grid-template-columns: 390px minmax(0, 1fr); } }
    .tree-form { display: flex; flex-direction: column; padding: 0; overflow: hidden; max-height: calc(100vh - 120px); }
    .tree-form-head { padding: 1.4rem 1.4rem 1rem; border-bottom: 1px solid #f2e9e1; background: linear-gradient(180deg, #fffaf6, #fff); }
    .tree-form-head .form-label { margin-bottom: .55rem; color: var(--primary-dark); }
    .tf-icon { width: 34px; height: 34px; border-radius: 11px; display: inline-grid; place-items: center; color: #fff; font-size: 1rem;
      background: linear-gradient(135deg, var(--primary), #2a9d8f); box-shadow: 0 8px 16px -8px var(--primary); }
    .tree-form-head .form-control { border-radius: 12px; border-color: #e6dcd2; padding: .6rem .85rem; }
    .tree-form-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 1rem 1.1rem 1.1rem 1.4rem; margin-right: .3rem;
      scrollbar-width: thin; scrollbar-color: #e2cfc2 transparent; }
    .tree-form-body::-webkit-scrollbar { width: 8px; }
    .tree-form-body::-webkit-scrollbar-track { background: transparent; margin: 10px 0; }
    .tree-form-body::-webkit-scrollbar-thumb { background: #e2cfc2; border-radius: 999px; }
    .tree-form-body::-webkit-scrollbar-thumb:hover { background: var(--accent); }
    .tree-form-foot { margin: 0; padding: .85rem 1.4rem; font-size: .8rem; color: var(--muted); border-top: 1px solid #f2e9e1; background: #fbf8f5; }
    .tree-form-foot i { color: var(--primary); }

    .gen-box { border: 1px solid #f0e6dd; border-radius: 18px; padding: .8rem .8rem .9rem; margin: 0 0 1rem; background: #fdfbf9; }
    .gen-box legend { float: none; width: 100%; font-size: .74rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em;
      color: var(--accent); padding: 0; margin: 0 0 .6rem; }
    .gen-box legend span { display: inline-flex; padding: .25rem .75rem; border-radius: 999px; background: #fde9df; }
    .tree-form .member { grid-template-columns: 56px 1fr auto; margin-bottom: .55rem; box-shadow: 0 8px 18px -16px rgba(60,30,20,.5); }
    .member-fields { min-width: 0; }
    .member-fields select, .member-fields input { border-radius: 10px; }
    .member-fields select { font-size: .8rem; padding: .25rem 1.55rem .25rem .55rem; background-position: right .45rem center; min-width: 0; }
    .tree-form .member { grid-template-columns: 48px minmax(0, 1fr) auto; gap: .6rem; }
    .tree-form .member .pic { width: 48px; height: 48px; }
    .member-fields .d-flex { flex-wrap: wrap; }
    .member-fields .d-flex select { flex: 1 1 100%; }
    .gen-box { padding: .7rem .65rem .8rem; }
    .member-actions { display: flex; flex-direction: column; gap: .35rem; align-items: center; }
    .add-person { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: .4rem; padding: .5rem; border-radius: 14px;
      border: 1.5px dashed #f0b9a3; background: transparent; color: var(--accent); font-weight: 600; font-size: .85rem; transition: background .2s, border-color .2s; }
    .add-person:hover { background: #fff3ed; border-color: var(--accent); }
    @media (max-width: 991px) {
      .tree-form { max-height: none; }
      .tree-form-body { overflow: visible; margin-right: 0; padding-right: 1.4rem; }
    }
  `
})
export class FamilyTree implements AfterViewInit, OnDestroy {
  protected readonly i18n = inject(I18nService);
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('tree');
  private readonly router = inject(Router);
  private readonly draft = inject(FamilyTreeDraft);
  protected readonly auth = inject(AuthService);
  protected readonly posting = signal(false);
  protected readonly postError = signal('');

  protected readonly generations = GENERATIONS;
  protected readonly sides = SIDES;
  protected readonly maxPerRow = MAX_PER_ROW;
  protected familyTitle = '';
  protected readonly people = signal<Person[]>(FamilyTree.starter());
  /** Generations shown in the form (those with people, plus any the visitor added). */
  protected readonly shown = signal<Set<number>>(new Set([1, 2, 3]));
  protected readonly hidden = computed(() => GENERATIONS.filter(g => !this.shown().has(g.id)));
  protected readonly size = signal({ w: MIN_W, h: TOP + 3 * ROW_H + BOTTOM });
  private seq = 100;

  constructor() {
    inject(SeoService).set({ title: 'Family Tree', description: 'Build your family tree with names and photos for every generation, then download it.', path: '/family-tree' });
    if (this.inBrowser) this.restore();
    effect(() => { this.i18n.lang(); if (this.inBrowser) queueMicrotask(() => this.draw()); });   // labels follow the language
  }

  ngAfterViewInit(): void {
    if (!this.inBrowser) return;
    this.draw();
    void document.fonts?.ready.then(() => this.draw());
  }

  ngOnDestroy(): void { this.people().forEach(p => p.url && URL.revokeObjectURL(p.url)); }

  /** The design's starting family: four grandparents, two parents and you. */
  private static starter(): Person[] {
    const p = (key: string, gen: number, relation: string, side = ''): Person => ({ key, gen, relation, side, name: '', img: null, url: null });
    return [
      p('pgf', 1, 'Grandfather', "Father's side"), p('pgm', 1, 'Grandmother', "Father's side"),
      p('mgf', 1, 'Grandfather', "Mother's side"), p('mgm', 1, 'Grandmother', "Mother's side"),
      p('fa', 2, 'Father'), p('mo', 2, 'Mother'), p('me', 3, 'You')
    ];
  }

  protected inGen(gen: number): Person[] { return this.people().filter(p => p.gen === gen); }

  protected label(p: Person): string { return this.i18n.t(p.relation) + (p.side ? ' · ' + this.i18n.t(p.side) : ''); }

  // ---------- Editing ----------

  protected add(gen: Generation): void {
    if (this.inGen(gen.id).length >= MAX_PER_ROW) return;
    const relation = gen.relations[this.inGen(gen.id).length % gen.relations.length];
    this.people.update(list => [...list, { key: 'p' + this.seq++, gen: gen.id, relation, side: '', name: '', img: null, url: null }]);
    this.changed();
  }

  protected remove(p: Person): void {
    if (p.url) URL.revokeObjectURL(p.url);
    this.people.update(list => list.filter(x => x !== p));
    this.changed();
  }

  /** Shows another generation (with one person in it to start). */
  protected showGen(id: number): void {
    const gen = GENERATIONS.find(g => g.id === id);
    if (!gen) return;
    this.shown.update(s => new Set(s).add(id));
    if (!this.inGen(id).length) this.add(gen);
  }

  /** Removes a whole generation from the tree. */
  protected hideGen(gen: Generation): void {
    this.inGen(gen.id).forEach(p => p.url && URL.revokeObjectURL(p.url));
    this.people.update(list => list.filter(p => p.gen !== gen.id));
    this.shown.update(s => { const n = new Set(s); n.delete(gen.id); return n; });
    this.changed();
  }

  protected pick(p: Person, event: Event): void {
    const box = event.target as HTMLInputElement;
    const f = box.files?.[0];
    box.value = '';
    if (!f || !f.type.startsWith('image/')) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      if (p.url) URL.revokeObjectURL(p.url);
      p.img = img; p.url = url;
      this.people.update(list => [...list]);
      this.draw();
    };
    img.src = url;
  }

  protected clearPhoto(p: Person): void {
    if (p.url) URL.revokeObjectURL(p.url);
    p.img = null; p.url = null;
    this.people.update(list => [...list]);
    this.draw();
  }

  /** Called after any change: redraw, and remember names / relations in this browser. */
  protected changed(): void {
    this.draw();
    this.save();
  }

  protected reset(): void {
    this.people().forEach(p => p.url && URL.revokeObjectURL(p.url));
    this.people.set(FamilyTree.starter());
    this.shown.set(new Set([1, 2, 3]));
    this.familyTitle = '';
    try { localStorage.removeItem(STORE); } catch { /* storage blocked */ }
    this.draw();
  }

  private save(): void {
    if (!this.inBrowser) return;
    const data = { title: this.familyTitle, shown: [...this.shown()],
      people: this.people().map(p => ({ gen: p.gen, relation: p.relation, side: p.side, name: p.name })) };
    try { localStorage.setItem(STORE, JSON.stringify(data)); } catch { /* storage blocked or full */ }
  }

  private restore(): void {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) ?? 'null') as { title: string; shown: number[]; people: Omit<Person, 'key' | 'img' | 'url'>[] } | null;
      if (!d || !Array.isArray(d.people)) return;
      const ok = (x: Omit<Person, 'key' | 'img' | 'url'>) => GENERATIONS.some(g => g.id === x.gen && g.relations.includes(x.relation)) && SIDES.includes(x.side ?? '');
      this.people.set(d.people.filter(ok).slice(0, MAX_PER_ROW * GENERATIONS.length)
        .map(x => ({ key: 'p' + this.seq++, gen: x.gen, relation: x.relation, side: x.side ?? '', name: String(x.name ?? '').slice(0, 30), img: null, url: null })));
      this.shown.set(new Set((d.shown ?? []).filter(id => GENERATIONS.some(g => g.id === id))));
      this.familyTitle = String(d.title ?? '').slice(0, 40);
    } catch { /* nothing saved, or storage blocked */ }
  }

  protected download(): void {
    this.draw();
    this.canvas()?.nativeElement.toBlob(blob => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'family-tree.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  }

  /**
   * "Post to the gallery": the tree becomes a picture (JPEG, kept under the 10 MB photo limit) and the upload form opens as
   * a Family share with it attached. Posting needs a signed-in visitor: a signed-out one is asked to sign in first and then
   * lands on the form with the picture (it waits in this tab, so the tree and its photos aren't lost).
   */
  protected async post(): Promise<void> {
    const el = this.canvas()?.nativeElement;
    if (!el) return;
    this.posting.set(true);
    this.postError.set('');
    try {
      this.draw();
      let blob: Blob | null = null;
      for (const quality of [0.9, 0.75, 0.6, 0.45]) {
        blob = await new Promise<Blob | null>(r => el.toBlob(r, 'image/jpeg', quality));
        if (blob && blob.size <= 9.5 * 1024 * 1024) break;
      }
      if (!blob || blob.size > 10 * 1024 * 1024) throw new Error('too big');
      const rows = new Set(this.people().map(p => p.gen)).size;
      this.draft.post.set({
        picture: new File([blob], 'family-tree.jpg', { type: 'image/jpeg' }),
        familyName: this.familyTitle.trim(), people: this.people().length, generations: rows
      });
      await this.auth.init();
      // The upload form needs sign-in: signed out → sign in first, then straight on to the form
      await this.router.navigate(['/upload'], { queryParams: { kind: 'family', from: 'tree' } });
    } catch {
      this.postError.set(this.i18n.t("We couldn't make the picture. Please try other photos."));
    } finally {
      this.posting.set(false);
    }
  }

  // ---------- Drawing: one row per generation, as wide and as tall as the family needs ----------

  protected draw(): void {
    const el = this.canvas()?.nativeElement;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const rows = GENERATIONS.map(g => this.inGen(g.id)).filter(r => r.length);
    const widest = Math.max(1, ...rows.map(r => r.length));
    const W = Math.max(MIN_W, widest * SLOT + 200), H = TOP + Math.max(1, rows.length) * ROW_H + BOTTOM;
    if (el.width !== W || el.height !== H) { el.width = W; el.height = H; this.size.set({ w: W, h: H }); }

    const SERIF = "'Playfair Display', Georgia, serif", SANS = 'Poppins, Arial, sans-serif';
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#fffaf3'); g.addColorStop(1, '#f6f1ea');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#e3d9cc'; ctx.lineWidth = 16; ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.fillStyle = '#0a3d3e'; ctx.textAlign = 'center';
    ctx.font = '700 56px ' + SERIF;
    ctx.fillText(this.familyTitle.trim() || this.i18n.t('Our Family Tree'), W / 2, 95, W - 200);

    // Where each person goes: rows centred, people spread evenly
    const placed = rows.map((row, i) => {
      const y = TOP + i * ROW_H + 110;
      const span = row.length * SLOT;
      return row.map((p, j) => ({ p, x: (W - span) / 2 + SLOT / 2 + j * SLOT, y }));
    });

    // Branches: a bar joining each generation, and a trunk down to the next one
    ctx.strokeStyle = '#c9b79f'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    const line = (x1: number, y1: number, x2: number, y2: number) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    placed.forEach((row, i) => {
      if (row.length > 1) line(row[0].x, row[0].y, row[row.length - 1].x, row[0].y);
      const next = placed[i + 1];
      if (next) {
        const midY = row[0].y + (next[0].y - row[0].y) / 2 + 40;
        line(W / 2, row[0].y, W / 2, midY);
        if (next.length > 1) line(next[0].x, midY, next[next.length - 1].x, midY);
        next.forEach(n => line(n.x, midY, n.x, n.y));
      }
    });

    for (const row of placed) for (const { p, x, y } of row) {
      const me = p.relation === 'You', r = me ? 104 : 88;
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, r + 10, 0, Math.PI * 2);
      ctx.fillStyle = me ? '#f06543' : '#f4b942'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
      ctx.fillStyle = '#f6f1ea'; ctx.fill(); ctx.clip();
      if (p.img) {
        const s = Math.max((r * 2) / p.img.naturalWidth, (r * 2) / p.img.naturalHeight);
        ctx.drawImage(p.img, x - p.img.naturalWidth * s / 2, y - p.img.naturalHeight * s / 2, p.img.naturalWidth * s, p.img.naturalHeight * s);
      } else {
        ctx.fillStyle = '#d8cbbb';
        ctx.beginPath(); ctx.arc(x, y - r * .2, r * .35, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x, y + r * .75, r * .62, r * .5, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0a3d3e';
      ctx.font = '700 34px ' + SERIF;
      ctx.fillText(p.name.trim() || this.i18n.t(p.relation), x, y + r + 54, SLOT - 20);
      ctx.fillStyle = '#5d6b70';
      ctx.font = '500 22px ' + SANS;
      let sub = p.name.trim() ? this.i18n.t(p.relation) : '';
      if (p.side) sub = (sub ? sub + ' · ' : '') + this.i18n.t(p.side);
      if (sub) ctx.fillText(sub, x, y + r + 86, SLOT - 20);
    }
    ctx.fillStyle = '#f06543'; ctx.font = '600 26px ' + SANS;
    ctx.fillText('#SelfieWithParent', W / 2, H - 40);
  }
}
