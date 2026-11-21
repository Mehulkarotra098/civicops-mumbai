import type { Metadata, Viewport } from 'next';
import './globals.css';
import './motion.css';
import { currentUser } from '@/lib/session';
import { getLocale } from '@/lib/locale';
import { t } from '@/i18n';
import { getDb, withUser } from '@/lib/db';
import { SiteNav } from '@/components/SiteNav';
import { after } from 'next/server';
import { maybeSweep } from '@/lib/sweep';

export const metadata: Metadata = {
  title: 'CivicOps Mumbai',
  description: 'Municipal issue reporting and repair accountability (hackathon demo on synthetic data).',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f1b33' };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, locale] = await Promise.all([currentUser(), getLocale()]);
  // Serverless hosts have no always-on timer: page views trigger a throttled deadline sweep.
  after(() => maybeSweep());
  let unread = 0;
  if (user) {
    const r = await withUser(user, (q) => q.query<{ n: number }>('select count(*)::int as n from notifications where user_id = $1 and read_at is null', [user.id]), await getDb());
    unread = r.rows[0]?.n ?? 0;
  }
  const L = (href: string, key: string, icon: string, label?: string) => ({ href, label: label ?? t(locale, key), icon });
  const report = L('/report', 'nav.report', 'camera'), my = L('/my', 'nav.my', 'list'), wards = L('/wards', 'nav.wards', 'map');
  const live = L('/live', 'nav.live', 'sparkle', 'Live'), spend = L('/spending', 'nav.spending', 'rupee', 'Public spending'), trail = L('/accountability', 'nav.accountability', 'link');
  const role = user?.role;
  const nav: { primary: typeof report[]; more: typeof report[]; groups: { title: string; links: typeof report[] }[]; bottom: typeof report[] } =
    !user ? {
      primary: [L('/login?next=%2Freport', 'nav.report', 'camera'), spend, wards, live], more: [trail],
      groups: [{ title: 'For residents', links: [L('/login?next=%2Freport', 'nav.report', 'camera'), wards] }, { title: 'Public records', links: [spend, live, trail] }],
      bottom: [L('/login?next=%2Freport', 'nav.report', 'camera', 'Report'), L('/login?next=%2Fmy', 'nav.my', 'list', 'My tickets'), L('/wards', 'nav.wards', 'map'), L('/spending', 'nav.spending', 'rupee', 'Spending')],
    } : role === 'resident' ? {
      primary: [report, my, wards, spend], more: [live, trail],
      groups: [{ title: 'My reports', links: [report, my] }, { title: 'Explore', links: [wards, spend, live, trail] }],
      bottom: [L('/report', 'nav.report', 'camera', 'Report'), L('/my', 'nav.my', 'list', 'My tickets'), wards, L('/spending', 'nav.spending', 'rupee', 'Spending')],
    } : role === 'auditor' ? {
      primary: [L('/oversight', 'nav.oversight', 'shield'), spend, trail, live], more: [wards],
      groups: [{ title: 'Oversight', links: [L('/oversight', 'nav.oversight', 'shield')] }, { title: 'Public records', links: [spend, trail, live, wards] }],
      bottom: [],
    } : role === 'super_admin' ? {
      primary: [L('/admin', 'nav.admin', 'board', 'Command centre'), L('/ward', 'nav.ward', 'list', 'All tickets'), L('/admin/review', 'nav.review', 'zoom', 'Review'), live, spend],
      more: [L('/admin/triage', 'nav.triage', 'alert'), L('/oversight', 'nav.oversight', 'shield'), trail, wards, L('/admin/data', 'nav.data', 'upload', 'Live data'), L('/admin/config', 'nav.config', 'clock'), L('/admin/audit', 'nav.audit', 'history')],
      groups: [
        { title: 'Operations', links: [L('/admin', 'nav.admin', 'board', 'Command centre'), L('/ward', 'nav.ward', 'list', 'All tickets'), L('/admin/review', 'nav.review', 'zoom', 'Review'), L('/admin/triage', 'nav.triage', 'alert'), live] },
        { title: 'Money', links: [spend, L('/oversight', 'nav.oversight', 'shield'), trail] },
        { title: 'Settings', links: [L('/admin/data', 'nav.data', 'upload', 'Live data'), L('/admin/config', 'nav.config', 'clock'), L('/admin/audit', 'nav.audit', 'history'), wards] },
      ],
      bottom: [],
    } : {
      primary: [L('/ward', 'nav.ward', 'list'), L('/ward/map', 'nav.map', 'map'), L('/cases', 'nav.cases', 'rupee'), live], more: [spend, trail],
      groups: [{ title: 'My ward', links: [L('/ward', 'nav.ward', 'list'), L('/ward/map', 'nav.map', 'map'), L('/cases', 'nav.cases', 'rupee'), live] }, { title: 'Public records', links: [spend, trail] }],
      bottom: [],
    };
  const homeHref = user ? (role === 'resident' ? '/my' : role === 'super_admin' ? '/admin' : role === 'auditor' ? '/oversight' : '/ward') : '/';

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" />
      </head>
      <body className="min-h-screen">
        <a href="#main" className="skip-link">Skip to content</a>
        <header className="sticky top-0 z-30 bg-navy-900 text-white shadow">
          <SiteNav primary={nav.primary} more={nav.more} groups={nav.groups} bottom={nav.bottom} user={user ? { name: user.name, role: user.role } : null} unread={unread} locale={locale}
            signInLabel={t(locale, 'nav.signin')} signOutLabel={t(locale, 'nav.signout')} homeHref={homeHref} appName={t(locale, 'app.name')} />
          <div className="bg-indigo-950/60 px-4 py-1 text-center text-[11px] text-indigo-100">{t(locale, 'synthetic.banner')}</div>
        </header>
        <main id="main" className={`mx-auto max-w-7xl px-4 py-6 ${nav.bottom.length ? 'pb-24 lg:pb-6' : ''}`}>{children}</main>
      </body>
    </html>
  );
}
