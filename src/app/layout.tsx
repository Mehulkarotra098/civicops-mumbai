import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { currentUser } from '@/lib/session';
import { getLocale } from '@/lib/locale';
import { t } from '@/i18n';
import { getDb, withUser } from '@/lib/db';
import { Icon } from '@/components/icons';
import { LocaleSwitcher, SignOutButton } from '@/components/client';

export const metadata: Metadata = {
  title: 'CivicOps Mumbai',
  description: 'Municipal issue reporting and repair accountability (hackathon demo on synthetic data).',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f1b33' };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, locale] = await Promise.all([currentUser(), getLocale()]);
  let unread = 0;
  if (user) {
    const r = await withUser(user, (q) => q.query<{ n: number }>('select count(*)::int as n from notifications where user_id = $1 and read_at is null', [user.id]), await getDb());
    unread = r.rows[0]?.n ?? 0;
  }
  const spend = { href: '/spending', key: 'nav.spending' };
  const links: { href: string; key: string }[] = !user
    ? [spend, { href: '/wards', key: 'nav.wards' }, { href: '/accountability', key: 'nav.accountability' }]
    : user.role === 'resident'
      ? [{ href: '/report', key: 'nav.report' }, { href: '/my', key: 'nav.my' }, spend, { href: '/wards', key: 'nav.wards' }]
      : user.role === 'auditor'
        ? [{ href: '/oversight', key: 'nav.oversight' }, spend, { href: '/accountability', key: 'nav.accountability' }]
        : user.role === 'super_admin'
          ? [{ href: '/admin', key: 'nav.admin' }, { href: '/admin/review', key: 'nav.review' }, { href: '/admin/triage', key: 'nav.triage' }, { href: '/oversight', key: 'nav.oversight' }, spend, { href: '/accountability', key: 'nav.accountability' }, { href: '/admin/config', key: 'nav.config' }, { href: '/admin/audit', key: 'nav.audit' }, { href: '/admin/data', key: 'nav.data' }]
          : [{ href: '/ward', key: 'nav.ward' }, { href: '/cases', key: 'nav.cases' }, spend, { href: '/ward/map', key: 'nav.map' }, { href: '/accountability', key: 'nav.accountability' }];

  return (
    <html lang={locale}>
      <body className="min-h-screen">
        <a href="#main" className="skip-link">Skip to content</a>
        <header className="sticky top-0 z-30 bg-navy-900 text-white shadow">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
            <Link href={user ? (user.role === 'resident' ? '/my' : user.role === 'super_admin' ? '/admin' : user.role === 'auditor' ? '/oversight' : '/ward') : '/'} className="flex items-center gap-2 font-bold tracking-tight">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-action"><Icon name="shield" className="h-5 w-5" /></span>
              <span className="hidden sm:inline">{t(locale, 'app.name')}</span>
            </Link>
            <nav aria-label="Main" className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1 text-sm">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-md px-2.5 py-1.5 font-medium text-slate-200 hover:bg-navy-800 hover:text-white">{t(locale, l.key)}</Link>
              ))}
            </nav>
            <div className="flex shrink-0 items-center gap-2">
              <LocaleSwitcher current={locale} />
              {user ? (
                <>
                  <Link href="/notifications" className="relative rounded-md p-1.5 text-slate-200 hover:bg-navy-800" aria-label={`${t(locale, 'nav.notifications')}: ${unread} unread`}>
                    <Icon name="bell" className="h-5 w-5" />
                    {unread > 0 ? <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold">{unread > 99 ? '99+' : unread}</span> : null}
                  </Link>
                  <span className="hidden text-xs text-slate-300 md:inline">{user.name} · {user.role.replace('_', ' ')}</span>
                  <SignOutButton label={t(locale, 'nav.signout')} />
                </>
              ) : (
                <Link href="/login" className="rounded-md bg-action px-3 py-1.5 text-xs font-semibold">{t(locale, 'nav.signin')}</Link>
              )}
            </div>
          </div>
          <div className="bg-indigo-950/60 px-4 py-1 text-center text-[11px] text-indigo-100">{t(locale, 'synthetic.banner')}</div>
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
