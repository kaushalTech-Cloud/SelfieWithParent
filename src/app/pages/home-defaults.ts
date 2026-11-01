// The public website's built-in home page content (the same as the website's home-content.ts / home.data.ts), shown here
// as placeholders: what staff leave empty, the website shows this. Keep in step with the website when its defaults change.

export const DEFAULT_SLIDES = [
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

export const DEFAULT_TILES = [
  { icon: 'bi-stars', title: 'AI Selfie with Parent', text: 'Make one from old photos', link: '/upload?kind=ai' },
  { icon: 'bi-camera', title: 'Upload a Selfie', text: 'Share a moment together', link: '/upload' },
  { icon: 'bi-house-heart', title: 'Adopt a Grandparent', text: 'Visit an elder near you', link: '/impact#adopt' },
  { icon: 'bi-chat-heart', title: 'Letters of Thanks', text: 'Write what you never said', link: '/#about' }
];

export const DEFAULT_STORY = {
  eyebrow: 'Our story', title: 'One photo can start a conversation that is years overdue.',
  quote: 'Our parents and grandparents gave us everything they had. Selfie with Parent is a simple way to say thank you: take one photo together, share one thing they taught you, and let the people who raised you know they matter — while you still can.',
  name: 'The Selfie with Parent team', role: 'Why we started', image: 'img/family.svg'
};

export const DEFAULT_STATS = [
  { value: 25000, label: 'Selfies shared' },
  { value: 320, label: 'Villages and towns' },
  { value: 1800, label: 'Elders visited' },
  { value: 45, label: 'Health camps' }
];

export const DEFAULT_STATS_NOTE = 'Sample figures — replace with your real numbers.';

export const DEFAULT_QUESTIONS = [
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

export const DEFAULT_THEMES = [
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

export const DEFAULT_PRIORITIES = [
  { icon: 'bi-heart-pulse', title: 'Elder health', text: 'Free check-up camps and medicine support for senior citizens in rural areas.' },
  { icon: 'bi-people', title: 'Bridging generations', text: 'School programmes that bring grandparents into classrooms to share skills and stories.' },
  { icon: 'bi-shield-check', title: 'Rights and dignity', text: 'Helping elders understand pension, welfare schemes and protection against neglect.' },
  { icon: 'bi-phone', title: 'Digital inclusion', text: 'Teaching parents to video-call, pay bills and stay connected with family far away.' }
];

export const DEFAULT_PLEDGE = {
  title: 'One small promise, every week', text: 'Call them every Sunday. Share a meal. Visit an elder who lives alone.', count: 48213
};

export const DEFAULT_APP = {
  title: 'Take the campaign with you',
  text: "Capture, caption and share straight from your phone. Get a reminder on your parents' birthdays and anniversaries.",
  playUrl: '', appStoreUrl: ''
};

/** "What you can do with your selfie" (photo frame, reel, Photo of the Week, family tree). The pictures are built into the website. */
export const DEFAULT_SHOWCASE = {
  eyebrow: 'One photo, many keepsakes', title: 'What you can do with your selfie',
  intro: 'Share one selfie with your parents — then turn it into keepsakes the whole family will love.',
  cards: [
    { kind: 'frame', name: 'Photo frame', title: 'Photo frame', text: 'Put your selfie in a festive frame and download it free.', note: 'Free HD download', button: 'Make a photo frame' },
    { kind: 'reel', name: 'Reel', title: 'Make a reel', text: 'Turn your selfie into a short video with music for Instagram and WhatsApp.', note: 'Music & voice note', button: 'Make a reel' },
    { kind: 'contest', name: 'Photo of the Week', title: 'Photo of the Week', text: 'The most-loved selfie each week wins a badge, a certificate and a golden frame.', note: 'Win a golden frame', button: 'Vote for the Photo of the Week' },
    { kind: 'tree', name: 'Family tree', title: 'Family tree', text: 'Every generation in one picture, ready to print or share.', note: 'Download tree', button: 'Build your family tree' }
  ]
};
