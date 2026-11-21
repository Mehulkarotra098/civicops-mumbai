import en from './en.json';
import mr from './mr.json';
import hi from './hi.json';

export const LOCALES = { en: 'English', mr: 'मराठी', hi: 'हिन्दी' } as const;
export type Locale = keyof typeof LOCALES;
const dicts: Record<Locale, Record<string, string>> = { en, mr, hi };

export function t(locale: string | undefined, key: string): string {
  const l = (locale && locale in dicts ? locale : 'en') as Locale;
  return dicts[l][key] ?? dicts.en[key] ?? key;
}
