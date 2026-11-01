// The Support page's words: what staff set in the admin site (Support page) over the built-in defaults.
// Order for every field: this language → English → the built-in default (translated). The page is never blank.
import { homeImage } from '../home/home-content';

export interface SupportContentData {
  hero?: { eyebrow?: string; title?: string; highlight?: string; text?: string; image?: string };
  impacts?: { amount?: number; label?: string; icon?: string }[];
  ways?: { kind?: string; icon?: string; title?: string; text?: string; buttonLabel?: string; link?: string }[];
  trust?: { legalName?: string; registration?: string; taxNote?: string; note?: string };
  funds?: { label?: string; percent?: number }[];
  reports?: { title?: string; link?: string }[];
  partners?: { name?: string; logo?: string; link?: string }[];
  faqs?: { question?: string; answer?: string }[];
  /** Sections staff switched off (English content only). */
  hiddenSections?: string[];
}
export interface Campaign { publicId: string; slug: string; title: string; summary: string | null; story: string | null; image: string | null;
  goalAmount: number; raised: number; donors: number; endsAtUtc: string | null; isFeatured: boolean; }
export interface WallEntry { name: string | null; amount: number; inHonourOf: string | null; campaign: string | null; paidAtUtc: string; }
export interface SupportApi { en: SupportContentData | null; local: SupportContentData | null; campaigns: Campaign[]; raised: number; donors: number;
  campaignsRun: number; wall: WallEntry[]; donations: { open: boolean; testMode: boolean }; }

export const DEFAULT_SUPPORT = {
  hero: { eyebrow: 'Support Selfie with Parent', title: 'Help no parent', highlight: 'feel forgotten.',
    text: 'Your gift brings health check-ups, spectacles, medicines and festival meals to elders who live alone — and keeps this movement of gratitude growing.', image: '' },
  impacts: [
    { amount: 500, label: 'One health check-up for an elder', icon: 'bi-heart-pulse' },
    { amount: 1500, label: 'Spectacles for a grandparent', icon: 'bi-eyeglasses' },
    { amount: 2500, label: "A month of medicines", icon: 'bi-capsule' },
    { amount: 5000, label: 'A festival meal at an old-age home', icon: 'bi-cup-hot' }
  ],
  ways: [
    { kind: 'volunteer', icon: 'bi-person-hearts', title: 'Volunteer', text: 'Visit an elder, call one every Sunday, or help at a health camp near you.', buttonLabel: 'I want to volunteer', link: '' },
    { kind: 'csr', icon: 'bi-building', title: 'Partner with us (CSR)', text: 'Sponsor a campaign, a health camp or a festival drive with your company.', buttonLabel: 'Talk to us', link: '' },
    { kind: 'wishlist', icon: 'bi-gift', title: 'Give things, not money', text: 'Blankets, spectacles, walking sticks, books — old-age homes tell us what they need.', buttonLabel: 'Ask for the wishlist', link: '' },
    { kind: 'link', icon: 'bi-share', title: 'Share a story', text: 'Tell the story of a parent who waits for a call. Stories move people to help.', buttonLabel: 'Share a story', link: '/parents-voices/share' }
  ],
  trust: { legalName: 'Selfie with Parent', registration: '', taxNote: 'Donations to registered charities in India may be eligible for tax benefits under Section 80G. Add your PAN to get an 80G receipt.',
    note: 'Payments are handled securely by Razorpay. We never see or store your card or bank details.' },
  funds: [{ label: 'Programmes for elders', percent: 80 }, { label: 'Outreach and awareness', percent: 12 }, { label: 'Running costs', percent: 8 }],
  faqs: [
    { question: 'Is my donation safe?', answer: 'Yes. Payments go through Razorpay, a secure payment gateway trusted by Indian charities. We never see or store your card or bank details.' },
    { question: 'Will I get a receipt?', answer: 'Yes. A receipt is emailed to you as soon as the payment goes through. Add your PAN for an 80G receipt.' },
    { question: "Can I give in my parent's name?", answer: "Yes. Tick “Give in my parent's name” — perfect for a birthday, an anniversary or in loving memory." },
    { question: 'Can I give without money?', answer: 'Yes — volunteer, give things old-age homes need, or share a parent’s story. See “Other ways to help”.' }
  ]
};
export const FUNDS_NOTE = 'Sample figures — the team will update them.';

type T = (s: string) => string;
const pick = (l: string | undefined | null, e: string | undefined | null, d: string | undefined, t: T) => l?.trim() || e?.trim() || (d ? t(d) : '');
function list<D, V>(l: D[] | undefined, e: D[] | undefined, d: D[], build: (l: D | undefined, e: D | undefined, d: D | undefined) => V): V[] {
  if (l?.length) return l.map((x, i) => build(x, e?.[i], d[i]));
  if (e?.length) return e.map((x, i) => build(undefined, x, d[i]));
  return d.map(x => build(undefined, undefined, x));
}

export function buildSupportView(en: SupportContentData | null, local: SupportContentData | null, t: T) {
  const L = local ?? {}, E = en ?? {}, D = DEFAULT_SUPPORT;
  const h = { l: L.hero ?? {}, e: E.hero ?? {} };
  const customFunds = !!(L.funds?.length || E.funds?.length);
  return {
    hero: { eyebrow: pick(h.l.eyebrow, h.e.eyebrow, D.hero.eyebrow, t), title: pick(h.l.title, h.e.title, D.hero.title, t),
      highlight: pick(h.l.highlight, h.e.highlight, D.hero.highlight, t), text: pick(h.l.text, h.e.text, D.hero.text, t),
      image: (h.l.image || h.e.image) ? homeImage((h.l.image || h.e.image)!) : '' },
    impacts: list(L.impacts, E.impacts, D.impacts, (l, e, d) => ({ amount: l?.amount ?? e?.amount ?? d?.amount ?? 0, label: pick(l?.label, e?.label, d?.label, t),
      icon: l?.icon || e?.icon || d?.icon || 'bi-heart' })).filter(x => x.amount > 0),
    ways: list(L.ways, E.ways, D.ways, (l, e, d) => ({ kind: l?.kind || e?.kind || d?.kind || 'link', icon: l?.icon || e?.icon || d?.icon || 'bi-heart',
      title: pick(l?.title, e?.title, d?.title, t), text: pick(l?.text, e?.text, d?.text, t), buttonLabel: pick(l?.buttonLabel, e?.buttonLabel, d?.buttonLabel, t),
      link: (l?.link || e?.link || d?.link || '').trim() })).filter(x => x.title),
    trust: { legalName: pick(L.trust?.legalName, E.trust?.legalName, D.trust.legalName, t), registration: pick(L.trust?.registration, E.trust?.registration, '', t),
      taxNote: pick(L.trust?.taxNote, E.trust?.taxNote, D.trust.taxNote, t), note: pick(L.trust?.note, E.trust?.note, D.trust.note, t) },
    funds: list(L.funds, E.funds, D.funds, (l, e, d) => ({ label: pick(l?.label, e?.label, d?.label, t), percent: l?.percent ?? e?.percent ?? d?.percent ?? 0 })).filter(x => x.label),
    fundsNote: customFunds ? '' : t(FUNDS_NOTE),
    reports: (L.reports?.length ? L.reports : E.reports ?? []).filter(r => r.title && r.link) as { title: string; link: string }[],
    partners: (L.partners?.length ? L.partners : E.partners ?? []).filter(p => p.name).map(p => ({ name: p.name!, link: p.link ?? '', logo: p.logo ? homeImage(p.logo) : '' })),
    faqs: list(L.faqs, E.faqs, D.faqs, (l, e, d) => ({ question: pick(l?.question, e?.question, d?.question, t), answer: pick(l?.answer, e?.answer, d?.answer, t) })).filter(x => x.question)
  };
}
export type SupportView = ReturnType<typeof buildSupportView>;
