// Sample data for the new feature pages (design preview — replace with your backend later).
(function () {
  "use strict";

  // Monthly themes — the current month's theme is shown on Home and Selfies
  window.THEMES = [
    { month: 0, title: "New Year, Old Wisdom", text: "Share one piece of advice from your parents you'll carry into this year.", icon: "bi-stars" },
    { month: 1, title: "Love Letters to Maa & Papa", text: "Write the note you never said out loud.", icon: "bi-envelope-heart" },
    { month: 2, title: "Colours of Holi", text: "Your brightest family moment of the festival.", icon: "bi-palette" },
    { month: 3, title: "Kitchen Stories", text: "The dish only your parent makes right.", icon: "bi-egg-fried" },
    { month: 4, title: "Mother's Month", text: "A selfie for the woman who started it all.", icon: "bi-flower1" },
    { month: 5, title: "Father's Month", text: "Celebrate the quiet hero.", icon: "bi-trophy" },
    { month: 6, title: "Monsoon Memories", text: "Rain, chai and family — show us yours.", icon: "bi-cloud-rain" },
    { month: 7, title: "Grandparents' Wisdom", text: "Ask your grandparent one question and share the answer.", icon: "bi-book" },
    { month: 8, title: "Teachers at Home", text: "Something your parent taught you that no school could.", icon: "bi-mortarboard" },
    { month: 9, title: "Festival of Lights", text: "Light a diya together and share the glow.", icon: "bi-brightness-high" },
    { month: 10, title: "Then & Now", text: "Recreate an old family photo.", icon: "bi-arrow-left-right" },
    { month: 11, title: "Year of Gratitude", text: "Your favourite family moment of the year.", icon: "bi-gift" }
  ];

  // Question of the day (home)
  window.QUESTIONS = [
    "What was your first job, and what did it pay?",
    "How did you and Papa / Maa first meet?",
    "What was your favourite game as a child?",
    "Which festival memory makes you smile the most?",
    "What is one thing you wish you had learned earlier?",
    "What did your own parents teach you that you taught me?",
    "Which song reminds you of your youth?",
    "What was the hardest year of your life, and how did you get through it?",
    "What is the best advice you ever received?",
    "What were you like at my age?"
  ];

  // Campaign map — selfies per state / UT (sample numbers)
  window.STATE_COUNTS = [
    ["Uttar Pradesh", "UP", 4820], ["Maharashtra", "MH", 4410], ["Haryana", "HR", 3980], ["Rajasthan", "RJ", 3120],
    ["Bihar", "BR", 2890], ["West Bengal", "WB", 2760], ["Madhya Pradesh", "MP", 2410], ["Tamil Nadu", "TN", 2350],
    ["Karnataka", "KA", 2210], ["Gujarat", "GJ", 2080], ["Delhi", "DL", 1990], ["Punjab", "PB", 1820],
    ["Kerala", "KL", 1640], ["Telangana", "TS", 1510], ["Andhra Pradesh", "AP", 1460], ["Odisha", "OD", 1240],
    ["Assam", "AS", 1110], ["Jharkhand", "JH", 980], ["Chhattisgarh", "CG", 870], ["Uttarakhand", "UK", 820],
    ["Himachal Pradesh", "HP", 760], ["Jammu and Kashmir", "JK", 690], ["Goa", "GA", 410], ["Tripura", "TR", 330],
    ["Manipur", "MN", 290], ["Meghalaya", "ML", 260], ["Chandigarh", "CH", 240], ["Puducherry", "PY", 210],
    ["Nagaland", "NL", 180], ["Arunachal Pradesh", "AR", 160], ["Mizoram", "MZ", 140], ["Sikkim", "SK", 120],
    ["Ladakh", "LA", 80], ["Andaman and Nicobar Islands", "AN", 70], ["Dadra and Nagar Haveli and Daman and Diu", "DN", 60], ["Lakshadweep", "LD", 20]
  ];
  // Approximate grid positions (col, row) for a tile map of India
  window.STATE_TILES = {
    LA: [4, 0], JK: [3, 1], HP: [4, 1], PB: [3, 2], CH: [4, 2], UK: [5, 2], HR: [3, 3], DL: [4, 3], UP: [5, 3],
    AR: [10, 3], RJ: [2, 4], MP: [4, 4], BR: [6, 4], SK: [7, 3], AS: [8, 4], NL: [9, 4], GJ: [1, 5], CG: [5, 5],
    JH: [6, 5], WB: [7, 5], ML: [8, 5], MN: [9, 5], DN: [1, 6], MH: [3, 6], OD: [6, 6], TR: [8, 6], MZ: [9, 6],
    TS: [4, 6], GA: [2, 7], KA: [3, 7], AP: [4, 7], TN: [4, 8], PY: [5, 8], KL: [3, 8], LD: [1, 8], AN: [8, 8]
  };
  window.WORLD_COUNTS = [
    ["United Arab Emirates", 1240], ["United States", 1180], ["United Kingdom", 860], ["Canada", 640],
    ["Australia", 520], ["Saudi Arabia", 410], ["Singapore", 280], ["Nepal", 260], ["Bangladesh", 240], ["Qatar", 190]
  ];

  // School & college challenge leaderboard
  window.SCHOOLS = [
    { name: "Sample Public School", city: "Rohtak", count: 642, type: "School" },
    { name: "Sample Girls College", city: "Jaipur", count: 588, type: "College" },
    { name: "Sample Vidyalaya", city: "Lucknow", count: 541, type: "School" },
    { name: "Sample Institute of Technology", city: "Pune", count: 497, type: "College" },
    { name: "Sample Model School", city: "Patna", count: 463, type: "School" },
    { name: "Sample Convent School", city: "Kochi", count: 421, type: "School" },
    { name: "Sample Arts & Science College", city: "Chennai", count: 389, type: "College" },
    { name: "Sample International School", city: "Indore", count: 352, type: "School" }
  ];

  // Memory wall (In loving memory)
  window.MEMORIES = [
    { name: "Sample Name A", relation: "Mother", years: "1952 – 2021", by: "Her son", text: "She taught me to feed whoever knocks on the door. The door is still open, Maa.", photo: "img/selfie-1.svg", candles: 214 },
    { name: "Sample Name B", relation: "Father", years: "1948 – 2019", by: "His daughter", text: "Every morning walk still feels like yours.", photo: "img/selfie-2.svg", candles: 162 },
    { name: "Sample Name C", relation: "Grandmother", years: "1939 – 2022", by: "Her grandchildren", text: "Your stories are now bedtime stories for our children.", photo: "img/selfie-3.svg", candles: 301 },
    { name: "Sample Name D", relation: "Grandfather", years: "1935 – 2018", by: "The whole family", text: "The garden you planted still blooms every spring.", photo: "img/selfie-4.svg", candles: 98 },
    { name: "Sample Name E", relation: "Father", years: "1960 – 2023", by: "His children", text: "You never missed a single school function. We won't miss remembering you.", photo: "img/selfie-5.svg", candles: 187 },
    { name: "Sample Name F", relation: "Mother", years: "1958 – 2020", by: "Her daughter", text: "I still hear you humming in the kitchen.", photo: "img/selfie-6.svg", candles: 245 }
  ];

  // Then & Now pairs
  window.THEN_NOW = [
    { name: "Sample Family A", city: "Ambala", then: "1998", now: "2026", a: "img/then-1.svg", b: "img/selfie-1.svg" },
    { name: "Sample Family B", city: "Bhopal", then: "2003", now: "2026", a: "img/then-2.svg", b: "img/selfie-2.svg" },
    { name: "Sample Family C", city: "Mysuru", then: "1995", now: "2025", a: "img/then-3.svg", b: "img/selfie-3.svg" },
    { name: "Sample Family D", city: "Cuttack", then: "2001", now: "2026", a: "img/then-4.svg", b: "img/selfie-4.svg" }
  ];

})();
