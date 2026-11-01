// Content pages built in the admin site (site.Page / site.PageContent in the database).
// English holds the whole page: an ordered list of blocks. Other languages hold only translated text, matched to the
// English blocks and items by "id". The API checks every block again (types, fields, plain text, safe links, images).

/** Languages of the public website. English is the main version; the others are translations. */
export const LANGUAGES = [
  { code: 'en', name: 'English' }, { code: 'hi', name: 'हिन्दी (Hindi)' }, { code: 'bn', name: 'বাংলা (Bengali)' },
  { code: 'ar', name: 'العربية (Arabic)' }, { code: 'es', name: 'Español (Spanish)' }, { code: 'fr', name: 'Français (French)' }
] as const;

/** Fields a translation may replace. Links, icons, images and layout always come from English. */
export const TEXT_KEYS = new Set([
  'eyebrow', 'title', 'highlight', 'lead', 'kicker', 'heading', 'intro', 'text', 'note', 'question', 'answer',
  'cite', 'label', 'value', 'role', 'badge', 'linkLabel', 'caption', 'alt', 'imageAlt', 'name', 'signature'
]);

export type FieldKind = 'text' | 'textarea' | 'url' | 'image' | 'icon' | 'select' | 'number' | 'bool' | 'anchor' | 'short';

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  hint?: string;
  options?: readonly string[];
  /** For 'number': allowed range. */
  min?: number;
  max?: number;
}

export interface ListDef {
  key: string;
  label: string;
  /** Name of one entry, e.g. "card". */
  item: string;
  fields: FieldDef[];
  lists?: ListDef[];
}

export interface BlockDef {
  type: string;
  name: string;
  icon: string;
  description: string;
  fields: FieldDef[];
  lists: ListDef[];
}

// Reusable fields
const background: FieldDef = { key: 'background', label: 'Background', kind: 'select', options: ['plain', 'soft'] };
const anchor: FieldDef = { key: 'anchor', label: 'Anchor', kind: 'anchor', hint: 'Optional. Lets a link jump here, e.g. /what-we-do#get-involved.' };
const kicker: FieldDef = { key: 'kicker', label: 'Small heading', kind: 'text' };
const heading: FieldDef = { key: 'heading', label: 'Heading', kind: 'text' };
const intro: FieldDef = { key: 'intro', label: 'Introduction', kind: 'textarea' };
const note: FieldDef = { key: 'note', label: 'Note', kind: 'text', hint: 'Small print shown with the section.' };
const icon: FieldDef = { key: 'icon', label: 'Icon', kind: 'icon' };
const title: FieldDef = { key: 'title', label: 'Title', kind: 'text' };
const text: FieldDef = { key: 'text', label: 'Text', kind: 'textarea' };
const url: FieldDef = { key: 'url', label: 'Link', kind: 'url' };
const buttons: ListDef = {
  key: 'buttons', label: 'Buttons', item: 'button',
  fields: [{ key: 'label', label: 'Label', kind: 'text' }, url, icon, { key: 'style', label: 'Style', kind: 'select', options: ['primary', 'secondary'] }]
};
const paragraphs: ListDef = { key: 'paragraphs', label: 'Paragraphs', item: 'paragraph', fields: [text] };

/** Every block the page builder offers. The website renders each one in the About pages' design. */
export const BLOCKS: BlockDef[] = [
  {
    type: 'hero', name: 'Page header', icon: 'bi-type-h1', description: 'Big title at the top of the page.',
    fields: [{ key: 'eyebrow', label: 'Small heading', kind: 'text' }, title,
      { key: 'highlight', label: 'Highlighted words', kind: 'text', hint: 'Shown after the title in colour.' },
      { key: 'lead', label: 'Introduction', kind: 'textarea' }],
    lists: []
  },
  {
    type: 'tabs', name: 'Page links (tabs)', icon: 'bi-segmented-nav', description: 'A row of links to related pages. The current page is highlighted.',
    fields: [],
    lists: [{ key: 'items', label: 'Links', item: 'link', fields: [{ key: 'label', label: 'Label', kind: 'text' }, url, icon] }]
  },
  {
    type: 'text', name: 'Text with facts', icon: 'bi-text-paragraph', description: 'Heading, paragraphs and an optional list of short facts.',
    fields: [kicker, heading, background, anchor],
    lists: [paragraphs, { key: 'facts', label: 'Facts', item: 'fact', fields: [icon, { key: 'text', label: 'Text', kind: 'text' }] }]
  },
  {
    type: 'cards', name: 'Cards', icon: 'bi-grid-3x2-gap', description: 'Cards in a grid, a bento layout, links, programmes or activities.',
    fields: [{ key: 'layout', label: 'Layout', kind: 'select', options: ['grid', 'bento', 'links', 'programmes', 'activities'] },
      { key: 'columns', label: 'Columns', kind: 'number', min: 1, max: 4, hint: 'Cards per row on large screens.' },
      kicker, heading, intro, background, anchor],
    lists: [{
      key: 'items', label: 'Cards', item: 'card',
      fields: [icon, title, text, url, { key: 'linkLabel', label: 'Link text', kind: 'text' },
        { key: 'style', label: 'Colour (bento)', kind: 'select', options: ['plain', 'dark', 'gold'] },
        { key: 'width', label: 'Width (bento, out of 12)', kind: 'number', min: 1, max: 12 }],
      lists: [{ key: 'bullets', label: 'Bullet points (programmes)', item: 'bullet', fields: [{ key: 'text', label: 'Text', kind: 'text' }] }]
    }]
  },
  {
    type: 'steps', name: 'Steps', icon: 'bi-list-ol', description: 'Numbered steps, or a flow with icons.',
    fields: [{ key: 'style', label: 'Style', kind: 'select', options: ['numbered', 'flow'] }, kicker, heading, background, anchor],
    lists: [{ key: 'items', label: 'Steps', item: 'step', fields: [icon, title, text] }, buttons]
  },
  {
    type: 'timeline', name: 'Timeline', icon: 'bi-signpost-split', description: 'Milestones in order.',
    fields: [kicker, heading, note, background, anchor],
    lists: [{
      key: 'items', label: 'Milestones', item: 'milestone',
      fields: [{ key: 'year', label: 'Year', kind: 'short' }, icon, title, text, { key: 'upcoming', label: 'Still to come', kind: 'bool' }]
    }]
  },
  {
    type: 'stats', name: 'Numbers', icon: 'bi-bar-chart', description: 'Big numbers that count up.',
    fields: [note, background],
    lists: [{
      key: 'items', label: 'Numbers', item: 'number',
      fields: [{ key: 'value', label: 'Number', kind: 'text', hint: 'Digits only to count up, e.g. 25000.' },
        { key: 'suffix', label: 'After the number', kind: 'short', hint: 'e.g. + or %' }, { key: 'label', label: 'Label', kind: 'text' }]
    }]
  },
  {
    type: 'faq', name: 'Questions & answers', icon: 'bi-question-circle', description: 'Questions that open to show the answer.',
    fields: [kicker, heading, background, anchor],
    lists: [{ key: 'items', label: 'Questions', item: 'question',
      fields: [{ key: 'question', label: 'Question', kind: 'text' }, { key: 'answer', label: 'Answer', kind: 'textarea' }] }]
  },
  {
    type: 'quote', name: 'Quote', icon: 'bi-quote', description: 'A large quotation.',
    fields: [{ key: 'text', label: 'Quote', kind: 'textarea' }, { key: 'cite', label: 'Who said it', kind: 'text' }, background],
    lists: []
  },
  {
    type: 'profile', name: 'Profile', icon: 'bi-person-badge', description: 'A photo, name, role, short facts and social links.',
    fields: [{ key: 'image', label: 'Photo', kind: 'image' }, { key: 'imageAlt', label: 'Photo description', kind: 'text', hint: 'For screen readers.' },
      { key: 'badge', label: 'Badge', kind: 'text' }, { key: 'name', label: 'Name', kind: 'text' }, { key: 'role', label: 'Role', kind: 'text' },
      intro, note],
    lists: [{ key: 'facts', label: 'Facts', item: 'fact', fields: [{ key: 'label', label: 'Label', kind: 'text' }, { key: 'value', label: 'Value', kind: 'text' }] },
      { key: 'socials', label: 'Social links', item: 'link', fields: [icon, url, { key: 'label', label: 'Label', kind: 'text' }] }]
  },
  {
    type: 'letter', name: 'Letter', icon: 'bi-envelope-paper', description: 'A personal letter with a signature.',
    fields: [kicker, heading, { key: 'signature', label: 'Signature', kind: 'text' }, background],
    lists: [paragraphs]
  },
  {
    type: 'gallery', name: 'Photo gallery', icon: 'bi-images', description: 'Photos with captions.',
    fields: [kicker, heading, background],
    lists: [{ key: 'items', label: 'Photos', item: 'photo',
      fields: [{ key: 'image', label: 'Photo', kind: 'image' }, { key: 'alt', label: 'Photo description', kind: 'text' }, { key: 'caption', label: 'Caption', kind: 'text' }] }]
  },
  {
    type: 'cta', name: 'Call to action', icon: 'bi-megaphone', description: 'A coloured band with a title, text and buttons.',
    fields: [title, text],
    lists: [buttons]
  }
];

export const blockDef = (type: string): BlockDef | undefined => BLOCKS.find(b => b.type === type);

/** A JSON node of the page (block or list entry). */
export type Node = Record<string, unknown> & { id: string };

/** A new id for a block or list entry (unique within the page). */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return 'n' + Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
}

/** An empty block of this type, with one empty entry in each list. */
export function newBlock(type: string): Node {
  const def = blockDef(type)!;
  const block: Node = { id: newId(), type };
  for (const f of def.fields) if (f.kind === 'select') block[f.key] = f.options![0];
  for (const l of def.lists) block[l.key] = [newItem(l)];
  return block;
}

export function newItem(list: ListDef): Node {
  const item: Node = { id: newId() };
  for (const f of list.fields) if (f.kind === 'select') item[f.key] = f.options![0];
  return item;
}

/** A copy of a block with new ids everywhere (so it can sit next to the original). */
export function cloneWithNewIds<T>(node: T): T {
  if (Array.isArray(node)) return node.map(cloneWithNewIds) as T;
  if (node && typeof node === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) copy[k] = k === 'id' ? newId() : cloneWithNewIds(v);
    return copy as T;
  }
  return node;
}

/**
 * Removes empty text / links before saving (an empty field means "not used"), and unused list entries' empty fields.
 * Numbers typed as digits in "value" are saved as numbers so the website can count up to them.
 */
export function cleanForSave(blocks: Node[]): Node[] {
  const clean = (n: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n)) {
      if (v === null || v === undefined || v === '' || v === false && k !== 'hidden' && k !== 'upcoming') continue;
      if (Array.isArray(v)) out[k] = v.map(x => clean(x as Record<string, unknown>));
      else if (typeof v === 'string') out[k] = k === 'value' && /^\d{1,12}$/.test(v.trim()) ? Number(v.trim()) : v.trim();
      else out[k] = v;
    }
    return out;
  };
  return blocks.map(b => clean(b) as Node);
}

/** Translated text by id: { [id]: { title: '...', text: '...' } }. */
export type Translations = Record<string, Record<string, string>>;

/** Reads a saved translation (nested like the English page) into text-by-id. */
export function indexTranslation(blocks: unknown): Translations {
  const out: Translations = {};
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    if (typeof o['id'] === 'string') {
      const texts: Record<string, string> = {};
      for (const [k, v] of Object.entries(o)) if (TEXT_KEYS.has(k) && typeof v === 'string') texts[k] = v;
      out[o['id']] = { ...out[o['id']], ...texts };
    }
    for (const v of Object.values(o)) if (Array.isArray(v)) walk(v);
  };
  walk(blocks);
  return out;
}

/** Builds the translation to save: the English structure (ids only) with the translated text, empty parts left out. */
export function buildTranslation(english: Node[], tr: Translations): Node[] {
  const build = (n: Record<string, unknown>): Record<string, unknown> | null => {
    const id = n['id'] as string;
    const out: Record<string, unknown> = { id };
    for (const [k, v] of Object.entries(tr[id] ?? {})) if (TEXT_KEYS.has(k) && k in n && v.trim()) out[k] = v.trim();
    for (const [k, v] of Object.entries(n)) {
      if (!Array.isArray(v)) continue;
      const items = v.map(x => build(x as Record<string, unknown>)).filter(x => x !== null);
      if (items.length) out[k] = items;
    }
    return Object.keys(out).length > 1 ? out : null;
  };
  return english.map(b => build(b)).filter((x): x is Node => x !== null);
}

/** Text fields of a node that have English text (what a translator fills in). */
export function translatableFields(fields: FieldDef[], node: Record<string, unknown>): FieldDef[] {
  return fields.filter(f => TEXT_KEYS.has(f.key) && typeof node[f.key] === 'string' && (node[f.key] as string).trim() !== '');
}

/** Same rule as the API: a site path, https, mailto or tel. */
export function isSafeUrl(u: string): boolean {
  return /^(\/(?![\/\\])|https:\/\/.|mailto:|tel:)/.test(u) && !/[<>"]|javascript:/i.test(u) && u.length <= 300;
}

/** Problems the API would refuse, found before saving (so the editor can point at them). */
export function findProblems(blocks: Node[]): string[] {
  const problems: string[] = [];
  blocks.forEach((b, i) => {
    const where = `Block ${i + 1} (${blockDef(b['type'] as string)?.name ?? b['type']})`;
    const check = (n: Record<string, unknown>): void => {
      for (const [k, v] of Object.entries(n)) {
        if (typeof v === 'string') {
          if (/[<>]/.test(v)) problems.push(`${where}: text can't contain < or >.`);
          if (k === 'url' && v.trim() && !isSafeUrl(v.trim())) problems.push(`${where}: links must start with /, https://, mailto: or tel:.`);
          if (k === 'icon' && v.trim() && !/^bi-[a-z0-9-]{1,40}$/.test(v.trim())) problems.push(`${where}: icons look like "bi-heart".`);
          if (k === 'anchor' && v.trim() && !/^[a-z][a-z0-9-]{0,39}$/.test(v.trim())) problems.push(`${where}: anchors use lower-case letters, numbers and hyphens.`);
        } else if (Array.isArray(v)) v.forEach(x => check(x as Record<string, unknown>));
      }
    };
    check(b);
  });
  return [...new Set(problems)];
}

// ---------- API shapes ----------

export interface PageListItem { pageId: number; slug: string; isPublished: boolean; title: string; languages: string[]; updatedAtUtc: string; updatedBy: string | null; }
export interface PageContent { language: string; title: string; description: string | null; blocks: Node[]; }
export interface PageDetail { pageId: number; slug: string; isPublished: boolean; updatedAtUtc: string; contents: PageContent[]; }
/** An image in the database. isSystem: one of the website's own pictures (can be used, not deleted). */
export interface MediaItem { publicId: string; path: string; fileName: string; contentType: string; sizeBytes: number; createdAtUtc: string; isSystem: boolean; }

export interface AdminMenuItem {
  menuItemId: number; parentMenuItemId: number | null; itemKey: string; itemType: 'Link' | 'Dropdown' | 'Button' | 'Divider' | 'Action';
  label: string; labels: Record<string, string>; url: string | null; actionCode: string | null; icon: string | null;
  visibility: 'Always' | 'SignedIn' | 'SignedOut'; opensNewTab: boolean; isActive: boolean; sortOrder: number; requiredRole: string | null;
}
export interface AdminMenu { menuCode: string; items: AdminMenuItem[]; }

/** Same reserved web addresses as the API (the website already uses them). */
export const RESERVED_SLUGS = new Set(['login', 'account', 'privacy', 'terms', 'selfies', 'upload', 'winners', 'impact', 'then-now', 'memories',
  'family-tree', 'api', 'admin', 'assets', 'img', 'media', 'health', 'swagger', 'index', 'home']);

export function slugProblem(slug: string): string | null {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 60)
    return 'The web address can use lower-case letters, numbers and single hyphens (2 to 60 characters).';
  return RESERVED_SLUGS.has(slug) ? `"/${slug}" is already used by the website. Choose another web address.` : null;
}
