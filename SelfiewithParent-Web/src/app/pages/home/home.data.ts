import { siteImage } from '../../core/site-images';

// Sample content for the home page (moved from the static site). Replace with API data as endpoints arrive.

export interface Theme { month: number; title: string; text: string; icon: string; }

export const THEMES: Theme[] = [
  { month: 0, title: 'New Year, Old Wisdom', text: "Share one piece of advice from your parents you'll carry into this year.", icon: 'bi-stars' },
  { month: 1, title: 'Love Letters to Maa & Papa', text: 'Write the note you never said out loud.', icon: 'bi-envelope-heart' },
  { month: 2, title: 'Colours of Holi', text: 'Your brightest family moment of the festival.', icon: 'bi-palette' },
  { month: 3, title: 'Kitchen Stories', text: 'The dish only your parent makes right.', icon: 'bi-egg-fried' },
  { month: 4, title: "Mother's Month", text: 'A selfie for the woman who started it all.', icon: 'bi-flower1' },
  { month: 5, title: "Father's Month", text: 'Celebrate the quiet hero.', icon: 'bi-trophy' },
  { month: 6, title: 'Monsoon Memories', text: 'Rain, chai and family — show us yours.', icon: 'bi-cloud-rain' },
  { month: 7, title: "Grandparents' Wisdom", text: 'Ask your grandparent one question and share the answer.', icon: 'bi-book' },
  { month: 8, title: 'Teachers at Home', text: 'Something your parent taught you that no school could.', icon: 'bi-mortarboard' },
  { month: 9, title: 'Festival of Lights', text: 'Light a diya together and share the glow.', icon: 'bi-brightness-high' },
  { month: 10, title: 'Then & Now', text: 'Recreate an old family photo.', icon: 'bi-arrow-left-right' },
  { month: 11, title: 'Year of Gratitude', text: 'Your favourite family moment of the year.', icon: 'bi-gift' }
];

export const QUESTIONS: string[] = [
  'What was your first job, and what did it pay?',
  'How did you and Papa / Maa first meet?',
  'What was your favourite game as a child?',
  'Which festival memory makes you smile the most?',
  'What is one thing you wish you had learned earlier?',
  'What did your own parents teach you that you taught me?',
  'Which song reminds you of your youth?',
  'What was the hardest year of your life, and how did you get through it?',
  'What is the best advice you ever received?',
  'What were you like at my age?'
];

export const FEATURED = [
  { name: 'Aarav & his mother', city: 'Jaipur', img: siteImage('selfie-1.svg') },
  { name: 'Meera & her father', city: 'Pune', img: siteImage('selfie-2.svg') },
  { name: 'Kabir & grandparents', city: 'Lucknow', img: siteImage('selfie-3.svg') },
  { name: 'Ananya & her parents', city: 'Kochi', img: siteImage('selfie-4.svg') },
  { name: 'Rohan & his grandmother', city: 'Indore', img: siteImage('selfie-5.svg') },
  { name: 'Sara & her father', city: 'Guwahati', img: siteImage('selfie-6.svg') }
];

export const STATS = [
  { value: 25000, label: 'Selfies shared' },
  { value: 320, label: 'Villages and towns' },
  { value: 1800, label: 'Elders visited' },
  { value: 45, label: 'Health camps' }
];
