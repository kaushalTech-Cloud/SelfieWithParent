// Photo of the Week / festival contests, as the API returns them.

export interface ContestInfo { publicId: string; kind: 'week' | 'festival'; title: string; startsAtUtc: string; endsAtUtc: string; decided: boolean; }

export interface ContestItem {
  publicId: string; kind: string; name: string; firstName: string; parentName: string; place: string | null; message: string | null;
  photoId: string | null; likes?: number; isWinner?: boolean;
}

export interface ContestEntry { rank: number; votes: number; item: ContestItem; }
export interface OpenContest { contest: ContestInfo; leaders: ContestEntry[]; }
export interface ContestWinner { contest: ContestInfo; votes: number; winner: ContestItem; }

/** "26 Oct – 1 Nov 2026" (the end is not included, so the last day is the day before). */
export function contestDays(c: { startsAtUtc: string; endsAtUtc: string }, locale: string): string {
  const start = new Date(c.startsAtUtc + 'Z'), last = new Date(new Date(c.endsAtUtc + 'Z').getTime() - 86_400_000);
  try {
    const short = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const long = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return `${short.format(start)} – ${long.format(last)}`;
  } catch {
    return `${c.startsAtUtc.slice(0, 10)} – ${last.toISOString().slice(0, 10)}`;
  }
}

/** The contest's name in the visitor's language: weekly contests are all called "Photo of the Week". */
export function contestTitle(c: ContestInfo, t: (s: string) => string): string {
  return c.kind === 'week' ? t('Photo of the Week') : c.title;
}
