/** Digits only; Indian (+91) numbers must be 10 digits starting 6–9 (same rule as the API). */
export function isValidMobile(dial: string, input: string): boolean {
  const d = input.replace(/\D/g, '');
  return dial === '+91' ? /^[6-9]\d{9}$/.test(d) : /^\d{6,14}$/.test(d);
}

/** A plain email address with a dotted domain (same shape the API accepts). */
export function isValidEmail(input: string): boolean {
  const e = input.trim().toLowerCase();
  return e.length >= 6 && e.length <= 254 && /^[a-z0-9._%+\-]{1,64}@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$/.test(e);
}

/** "k•••@gmail.com" — how an email is shown back after it's typed. */
export function maskEmail(input: string): string {
  const e = input.trim().toLowerCase();
  const at = e.indexOf('@');
  return at <= 0 ? '•••' : `${e[0]}•••${e.slice(at)}`;
}

/** "+91 ••••• 3210" — the only form of a number shown on screen after it's typed. */
export function maskMobile(dial: string, input: string): string {
  return `${dial} ••••• ${input.replace(/\D/g, '').slice(-4)}`;
}
