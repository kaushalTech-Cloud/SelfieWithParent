// Background music for reels, played by the browser itself (Web Audio oscillators): our own short tunes, so there is no
// licence or copyright question, and nothing to download. A gentle I–V–vi–IV progression (C, G, Am, F), 2 seconds a chord.

export const REEL_TUNES = [
  { id: 'warm', name: 'Warm piano', icon: 'bi-music-note-beamed' },
  { id: 'calm', name: 'Calm strings', icon: 'bi-moon-stars' },
  { id: 'festive', name: 'Festive bells', icon: 'bi-bell' },
  { id: 'none', name: 'No music', icon: 'bi-volume-mute' }
] as const;
export type ReelTune = (typeof REEL_TUNES)[number]['id'];

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
/** C, G, Am, F — as MIDI notes (root, third, fifth), with the bass an octave and a half lower. */
const CHORDS = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]];
const CHORD_SECONDS = 2;

/** One note: an oscillator with a soft attack and decay into the output. */
function note(ctx: BaseAudioContext, out: AudioNode, freq: number, at: number, length: number, volume: number,
  type: OscillatorType = 'triangle', attack = 0.01): void {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

/** A bell: a sine with two quickly fading overtones. */
function bell(ctx: BaseAudioContext, out: AudioNode, freq: number, at: number, volume: number): void {
  note(ctx, out, freq, at, 1.6, volume, 'sine', 0.005);
  note(ctx, out, freq * 2.01, at, 0.7, volume * 0.35, 'sine', 0.005);
  note(ctx, out, freq * 3.02, at, 0.35, volume * 0.15, 'sine', 0.005);
}

/**
 * Plays a tune from <paramref name="start"/> for <paramref name="duration"/> seconds into <paramref name="out"/>,
 * fading in and out. Returns nothing to stop: every note is scheduled to end by itself.
 */
export function scheduleTune(ctx: BaseAudioContext, out: AudioNode, tune: ReelTune, start: number, duration: number): void {
  if (tune === 'none') return;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(1, start + 1);
  master.gain.setValueAtTime(1, Math.max(start + 1, start + duration - 1.5));
  master.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  if (tune === 'calm') {
    // A soft, filtered pad that swells on each chord
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    filter.connect(master);
    master.connect(out);
    for (let t = 0, i = 0; t < duration; t += CHORD_SECONDS, i++) {
      const chord = CHORDS[i % CHORDS.length];
      for (const m of chord) note(ctx, filter, hz(m), start + t, CHORD_SECONDS + 0.6, 0.06, 'sawtooth', 0.6);
      note(ctx, filter, hz(chord[0] - 12), start + t, CHORD_SECONDS + 0.4, 0.08, 'sine', 0.4);
    }
    return;
  }
  master.connect(out);
  for (let t = 0, i = 0; t < duration; t += CHORD_SECONDS, i++) {
    const chord = CHORDS[i % CHORDS.length];
    note(ctx, master, hz(chord[0] - 24), start + t, CHORD_SECONDS, 0.12, 'sine', 0.02);   // bass
    // Eight notes a chord: up and down the chord (warm) or a little bell melody (festive)
    const pattern = tune === 'festive' ? [2, 1, 0, 1, 2, 1, 2, 0] : [0, 1, 2, 1, 0, 2, 1, 2];
    pattern.forEach((p, k) => {
      const at = start + t + k * (CHORD_SECONDS / 8);
      if (at >= start + duration) return;
      if (tune === 'festive') bell(ctx, master, hz(chord[p] + 12), at, 0.07);
      else note(ctx, master, hz(chord[p] + (k > 3 ? 12 : 0)), at, 0.9, 0.08, 'triangle', 0.01);
    });
  }
}
