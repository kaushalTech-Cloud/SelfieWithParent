// Parents' Voices: what the API returns, and how a story's parent is named on the website.
import { environment } from '../../../environments/environment';

export interface ParentStory {
  publicId: string; writtenBy: 'parent' | 'family' | 'friend'; parentRole: 'mother' | 'father' | 'both';
  shownName: string | null; age: number | null; place: string | null; countryCode: string;
  title: string; story: string; wish: string | null; approvedAtUtc: string;
  photoId: string | null; videoId: string | null; voiceId: string | null; isFeatured: boolean; loves: number;
}

export const STORIES_API = `${environment.apiBaseUrl}/api/v1/parent-stories`;

export function storyFile(id: string | null): string { return id ? `${STORIES_API}/files/${id}` : ''; }

/** "Kamala, 72" — or "A mother" when they chose to stay anonymous. */
export function parentName(s: ParentStory, t: (k: string) => string): string {
  const name = s.shownName?.trim() || t(s.parentRole === 'father' ? 'A father' : s.parentRole === 'both' ? 'A mother and father' : 'A mother');
  return s.age ? `${name}, ${s.age}` : name;
}

/** Who wrote it down: in their own words, or shared by family / a friend with their permission. */
export function writtenByText(s: ParentStory): string {
  return s.writtenBy === 'parent' ? 'In their own words'
    : s.writtenBy === 'family' ? 'Shared by their family, with their permission'
    : 'Shared by a friend or volunteer, with their permission';
}

/** The first lines of the story, for a card. */
export function excerpt(text: string, max = 180): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, t.lastIndexOf(' ', max) > 80 ? t.lastIndexOf(' ', max) : max) + '…';
}
