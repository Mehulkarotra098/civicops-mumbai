import { cookies } from 'next/headers';
import type { Locale } from '@/i18n';

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get('civicops_locale')?.value;
  return v === 'mr' || v === 'hi' ? v : 'en';
}
