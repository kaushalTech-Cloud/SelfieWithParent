// The home page's content: what staff set in the admin site (Home page) over the website's built-in defaults.
// Order for every field: this language's content → the English content → the built-in default (translated). So nothing
// the page needs is ever blank — a new site, an unreachable API or a half-filled form all still show a full page.

import { environment } from '../../../environments/environment';
import { siteImage } from '../../core/site-images';
import { QUESTIONS, STATS, THEMES } from './home.data';

// ---------- What the API returns (all optional) ----------

export interface HomeSlideData { image?: string; eyebrow?: string; title?: string; highlight?: string; text?: string;
  button1Label?: string; button1Link?: string; button2Label?: string; button2Link?: string; }
export interface HomeTileData { icon?: string; title?: string; text?: string; link?: string; }
export interface HomeStoryData { eyebrow?: string; title?: string; quote?: string; name?: string; role?: string; image?: string; }
export interface HomeStatData { label?: string; value?: number | null; source?: string | null; }
export interface HomeThemeData { month?: number; icon?: string; title?: string; text?: string; }
export interface HomePriorityData { icon?: string; title?: string; text?: string; }
export interface HomePledgeData { title?: string; text?: string; count?: number | null; }
export interface HomeAppData { title?: string; text?: string; playUrl?: string; appStoreUrl?: string; }
export type ShowcaseKind = 'frame' | 'reel' | 'contest' | 'tree';
export interface HomeShowcaseCardData { kind?: string; hidden?: boolean | null; title?: string; text?: string; note?: string; button?: string; }
export interface HomeShowcaseData { hidden?: boolean | null; eyebrow?: string; title?: string; intro?: string; cards?: HomeShowcaseCardData[]; }
export interface HomeContentData {
  slides?: HomeSlideData[]; tiles?: HomeTileData[]; story?: HomeStoryData; stats?: HomeStatData[]; statsNote?: string;
  questions?: string[]; themes?: HomeThemeData[]; priorities?: HomePriorityData[]; pledge?: HomePledgeData; app?: HomeAppData;
  showcase?: HomeShowcaseData;
  /** Sections staff switched off (English content only). */
  hiddenSections?: string[];
}
export interface HomeNumbers { selfies: number; towns: number; countries: number; families: number; visitors: number; }
export interface HomeApiResponse { en: HomeContentData | null; local: HomeContentData | null; numbers: HomeNumbers; }

// ---------- Built-in defaults (English; shown translated) ----------

export const DEFAULT_SLIDES: Required<HomeSlideData>[] = [
  { image: 'img/hero-1.svg', eyebrow: 'A movement of gratitude', title: 'They held your hand first.', highlight: 'Now hold the camera.',
    text: 'Take a selfie with your mother, father or grandparent and tell the world one thing they taught you.',
    button1Label: 'Share your selfie', button1Link: '/upload', button2Label: 'See the stories', button2Link: '/selfies' },
  { image: 'img/hero-2.svg', eyebrow: 'Photo of the Week', title: 'Every heart is a vote.', highlight: 'Win a golden frame.',
    text: 'Like the selfies you love. Each week the most-liked one wins a winner badge, a certificate and a golden photo frame.',
    button1Label: 'Vote now', button1Link: '/contest', button2Label: 'Share your selfie', button2Link: '/upload' },
  { image: 'img/hero-3.svg', eyebrow: 'Never miss their day', title: 'Remember every birthday.', highlight: "We'll remind you.",
    text: "Save your parents' birthdays and anniversaries. We'll remind you a few days before, with ideas for a selfie together.",
    button1Label: 'Add family dates', button1Link: '/account#reminders', button2Label: 'Then & Now', button2Link: '/then-now' }
];

export const DEFAULT_TILES: Required<HomeTileData>[] = [
  { icon: 'bi-stars', title: 'AI Selfie with Parent', text: 'Make one from old photos', link: '/upload?kind=ai' },
  { icon: 'bi-camera', title: 'Upload a Selfie', text: 'Share a moment together', link: '/upload' },
  { icon: 'bi-house-heart', title: 'Adopt a Grandparent', text: 'Visit an elder near you', link: '/impact#adopt' },
  { icon: 'bi-chat-heart', title: 'Letters of Thanks', text: 'Write what you never said', link: '/#about' }
];

export const DEFAULT_STORY: Required<HomeStoryData> = {
  eyebrow: 'Our story', title: 'One photo can start a conversation that is years overdue.',
  quote: 'Our parents and grandparents gave us everything they had. Selfie with Parent is a simple way to say thank you: take one photo together, share one thing they taught you, and let the people who raised you know they matter — while you still can.',
  name: 'The Selfie with Parent team', role: 'Why we started', image: 'img/family.svg'
};

export const DEFAULT_PRIORITIES: Required<HomePriorityData>[] = [
  { icon: 'bi-heart-pulse', title: 'Elder health', text: 'Free check-up camps and medicine support for senior citizens in rural areas.' },
  { icon: 'bi-people', title: 'Bridging generations', text: 'School programmes that bring grandparents into classrooms to share skills and stories.' },
  { icon: 'bi-shield-check', title: 'Rights and dignity', text: 'Helping elders understand pension, welfare schemes and protection against neglect.' },
  { icon: 'bi-phone', title: 'Digital inclusion', text: 'Teaching parents to video-call, pay bills and stay connected with family far away.' }
];

export const DEFAULT_PLEDGE: Required<HomePledgeData> = {
  title: 'One small promise, every week', text: 'Call them every Sunday. Share a meal. Visit an elder who lives alone.', count: 48213
};

export const DEFAULT_APP: Required<HomeAppData> = {
  title: 'Take the campaign with you',
  text: "Capture, caption and share straight from your phone. Get a reminder on your parents' birthdays and anniversaries.",
  playUrl: '', appStoreUrl: ''
};

/** "What you can do with your selfie": the cards' pictures are built in; staff can change the words, hide or reorder them. */
export const DEFAULT_SHOWCASE = {
  eyebrow: 'One photo, many keepsakes', title: 'What you can do with your selfie',
  intro: 'Share one selfie with your parents — then turn it into keepsakes the whole family will love.',
  cards: [
    { kind: 'frame', title: 'Photo frame', text: 'Put your selfie in a festive frame and download it free.', note: 'Free HD download', button: 'Make a photo frame' },
    { kind: 'reel', title: 'Make a reel', text: 'Turn your selfie into a short video with music for Instagram and WhatsApp.', note: 'Music & voice note', button: 'Make a reel' },
    { kind: 'contest', title: 'Photo of the Week', text: 'The most-loved selfie each week wins a badge, a certificate and a golden frame.', note: 'Win a golden frame', button: 'Vote for the Photo of the Week' },
    { kind: 'tree', title: 'Family tree', text: 'Every generation in one picture, ready to print or share.', note: 'Download tree', button: 'Build your family tree' }
  ] as { kind: ShowcaseKind; title: string; text: string; note: string; button: string }[]
};

export const DEFAULT_STATS_NOTE = 'Sample figures — replace with your real numbers.';

// ---------- The page's view (everything filled in) ----------

export interface Slide { image: string; eyebrow: string; title: string; highlight: string; text: string; buttons: { label: string; link: string }[]; }
export interface Tile { icon: string; title: string; text: string; link: string; }
export interface HomeView {
  slides: Slide[]; tiles: Tile[];
  story: { eyebrow: string; title: string; quote: string; name: string; role: string; image: string };
  stats: { label: string; value: number }[]; statsNote: string;
  questions: string[];
  theme: { icon: string; title: string; text: string };
  priorities: { icon: string; title: string; text: string }[];
  pledge: { title: string; text: string; count: number };
  app: { title: string; text: string; playUrl: string; appStoreUrl: string };
  showcase: ShowcaseView;
}
export interface ShowcaseCard { kind: ShowcaseKind; title: string; text: string; note: string; button: string; }
export interface ShowcaseView { show: boolean; eyebrow: string; title: string; intro: string; cards: ShowcaseCard[]; }

/** Photo features: this language's words → English's → the built-in ones; the card order and hiding from this language, else English. */
function buildShowcase(l: HomeShowcaseData, e: HomeShowcaseData, t: T): ShowcaseView {
  const d = DEFAULT_SHOWCASE;
  const known = (x: HomeShowcaseCardData) => d.cards.some(c => c.kind === x.kind);
  const order = (l.cards?.filter(known).length ? l.cards : e.cards?.filter(known).length ? e.cards : d.cards)!.filter(known);
  const cards = order.map(o => {
    const kind = o.kind as ShowcaseKind;
    const lc = l.cards?.find(x => x.kind === kind), ec = e.cards?.find(x => x.kind === kind), dc = d.cards.find(x => x.kind === kind)!;
    const hidden = lc?.hidden ?? (l.cards?.length ? null : ec?.hidden) ?? false;
    return hidden ? null : {
      kind, title: pick(lc?.title, ec?.title, dc.title, t), text: pick(lc?.text, ec?.text, dc.text, t),
      note: pick(lc?.note, ec?.note, dc.note, t), button: pick(lc?.button, ec?.button, dc.button, t)
    };
  }).filter((x): x is ShowcaseCard => !!x);
  return {
    show: !(l.hidden ?? e.hidden ?? false) && cards.length > 0,
    eyebrow: pick(l.eyebrow, e.eyebrow, d.eyebrow, t), title: pick(l.title, e.title, d.title, t), intro: pick(l.intro, e.intro, d.intro, t), cards
  };
}

/** A picture from the content: the website's own ("img/…") or an uploaded one ("media/…"). */
export function homeImage(path: string): string {
  if (path.startsWith('media/')) return `${environment.apiBaseUrl}/api/v1/${path}`;
  if (path.startsWith('img/')) return siteImage(path.slice(4));
  return path;
}

type T = (s: string) => string;

/** The first non-empty of: this language's, English's, the default (translated). */
function pick(local: string | undefined | null, en: string | undefined | null, def: string | undefined, t: T): string {
  return local?.trim() || en?.trim() || (def ? t(def) : '');
}

/**
 * A list: this language's items if it has any, else English's, else the defaults. Each item's empty fields fall back to
 * English's item at the same place, then to the default item at the same place.
 */
function list<D, V>(local: D[] | undefined, en: D[] | undefined, defs: D[], build: (l: D | undefined, e: D | undefined, d: D | undefined) => V): V[] {
  if (local?.length) return local.map((l, i) => build(l, en?.[i], defs[i]));
  if (en?.length) return en.map((e, i) => build(undefined, e, defs[i]));
  return defs.map(d => build(undefined, undefined, d));
}

export function buildHomeView(en: HomeContentData | null, local: HomeContentData | null, numbers: HomeNumbers | null, t: T, month: number): HomeView {
  const L = local ?? {}, E = en ?? {};
  const slides = list(L.slides, E.slides, DEFAULT_SLIDES, (l, e, d) => {
    const buttons = [1, 2].map(n => {
      const label = pick(l?.[`button${n}Label` as 'button1Label'], e?.[`button${n}Label` as 'button1Label'], d?.[`button${n}Label` as 'button1Label'], t);
      const link = (l?.[`button${n}Link` as 'button1Link'] || e?.[`button${n}Link` as 'button1Link'] || d?.[`button${n}Link` as 'button1Link'] || '').trim();
      return { label, link };
    }).filter(b => b.label && b.link);
    return {
      image: homeImage(l?.image || e?.image || d?.image || DEFAULT_SLIDES[0].image),
      eyebrow: pick(l?.eyebrow, e?.eyebrow, d?.eyebrow, t), title: pick(l?.title, e?.title, d?.title, t),
      highlight: pick(l?.highlight, e?.highlight, d?.highlight, t), text: pick(l?.text, e?.text, d?.text, t), buttons
    };
  }).filter(s => s.title || s.text);

  const tiles = list(L.tiles, E.tiles, DEFAULT_TILES, (l, e, d) => ({
    icon: l?.icon || e?.icon || d?.icon || 'bi-heart', title: pick(l?.title, e?.title, d?.title, t), text: pick(l?.text, e?.text, d?.text, t),
    link: (l?.link || e?.link || d?.link || '/upload').trim()
  })).filter(x => x.title);

  const s = { l: L.story ?? {}, e: E.story ?? {}, d: DEFAULT_STORY };
  const story = {
    eyebrow: pick(s.l.eyebrow, s.e.eyebrow, s.d.eyebrow, t), title: pick(s.l.title, s.e.title, s.d.title, t),
    quote: pick(s.l.quote, s.e.quote, s.d.quote, t), name: pick(s.l.name, s.e.name, s.d.name, t), role: pick(s.l.role, s.e.role, s.d.role, t),
    image: homeImage(s.l.image || s.e.image || s.d.image)
  };

  // Numbers: counted from the database when chosen (and not zero yet), else typed, else the sample figure
  const custom = !!(L.stats?.length || E.stats?.length);
  const stats = list(L.stats, E.stats, STATS.map(x => ({ label: x.label, value: x.value }) as HomeStatData), (l, e, d) => {
    const source = (l?.source || e?.source) as keyof HomeNumbers | undefined;
    const counted = source && numbers ? (numbers[source] ?? 0) : 0;
    return { label: pick(l?.label, e?.label, d?.label, t), value: counted || l?.value || e?.value || d?.value || 0 };
  }).filter(x => x.label);
  const statsNote = custom ? (L.statsNote?.trim() || E.statsNote?.trim() || '') : t(DEFAULT_STATS_NOTE);

  const questions = (L.questions?.filter(q => q.trim()).length ? L.questions : E.questions?.filter(q => q.trim()).length ? E.questions : QUESTIONS.map(q => t(q)))!
    .filter(q => q.trim());

  // Theme of the month: staff's theme for this month, else the built-in one
  const own = (L.themes ?? []).find(x => x.month === month) ?? (E.themes ?? []).find(x => x.month === month);
  const def = THEMES.find(x => x.month === month) ?? THEMES[0];
  const ownEn = (E.themes ?? []).find(x => x.month === month);
  const theme = own
    ? { icon: own.icon || ownEn?.icon || def.icon, title: own.title || ownEn?.title || t(def.title), text: own.text || ownEn?.text || t(def.text) }
    : { icon: def.icon, title: t(def.title), text: t(def.text) };

  const priorities = list(L.priorities, E.priorities, DEFAULT_PRIORITIES, (l, e, d) => ({
    icon: l?.icon || e?.icon || d?.icon || 'bi-heart', title: pick(l?.title, e?.title, d?.title, t), text: pick(l?.text, e?.text, d?.text, t)
  })).filter(x => x.title);

  const p = { l: L.pledge ?? {}, e: E.pledge ?? {}, d: DEFAULT_PLEDGE };
  const a = { l: L.app ?? {}, e: E.app ?? {}, d: DEFAULT_APP };
  return {
    slides: slides.length ? slides : buildHomeView(null, null, numbers, t, month).slides,
    tiles: tiles.length ? tiles : DEFAULT_TILES.map(x => ({ ...x, title: t(x.title), text: t(x.text) })),
    story, stats: stats.length ? stats : STATS.map(x => ({ label: t(x.label), value: x.value })), statsNote, questions: questions.length ? questions : QUESTIONS.map(q => t(q)), theme,
    priorities: priorities.length ? priorities : DEFAULT_PRIORITIES.map(x => ({ ...x, title: t(x.title), text: t(x.text) })),
    pledge: { title: pick(p.l.title, p.e.title, p.d.title, t), text: pick(p.l.text, p.e.text, p.d.text, t), count: p.l.count ?? p.e.count ?? p.d.count ?? 0 },
    app: { title: pick(a.l.title, a.e.title, a.d.title, t), text: pick(a.l.text, a.e.text, a.d.text, t),
      playUrl: a.l.playUrl || a.e.playUrl || '', appStoreUrl: a.l.appStoreUrl || a.e.appStoreUrl || '' },
    showcase: buildShowcase(L.showcase ?? {}, E.showcase ?? {}, t)
  };
}
