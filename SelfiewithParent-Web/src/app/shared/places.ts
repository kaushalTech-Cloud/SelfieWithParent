// Countries offered in the website's forms (account, upload) and India's states / union territories.

export const COUNTRY_CODES = 'IN AE US GB CA AU SG SA QA KW OM BH NP BD LK MY NZ DE FR ES IT NL IE ZA KE NG JP'.split(' ');

export const INDIA_STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra',
  'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

/** Country names in the given language (English when the browser can't name them), sorted. */
export function countryList(lang: string): { code: string; name: string }[] {
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames([lang, 'en'], { type: 'region' }); } catch { /* old browser */ }
  return COUNTRY_CODES.map(c => ({ code: c, name: names?.of(c) ?? c })).sort((a, b) => a.name.localeCompare(b.name));
}
