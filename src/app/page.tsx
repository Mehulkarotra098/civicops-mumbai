import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser, homeFor } from '@/lib/session';
import { getLocale } from '@/lib/locale';
import { t } from '@/i18n';
import { Icon } from '@/components/icons';
import { CATEGORIES } from '@/lib/config';

export default async function Home() {
  const u = await currentUser();
  if (u) redirect(homeFor(u.role));
  const locale = await getLocale();
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl bg-navy-900 px-6 py-10 text-white sm:px-10">
        <div className="kicker text-teal-300">CivicOps Mumbai</div>
        <h1 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">{t(locale, 'app.tagline')}</h1>
        <p className="mt-3 max-w-2xl text-slate-300">Every report gets a ward, a responsible team, a visible deadline and a timestamped history. Closure needs evidence and a recorded human decision.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/login" className="btn-primary">{t(locale, 'nav.report')} <Icon name="arrowRight" /></Link>
          <Link href="/accountability/work-orders/WO25-01590" className="btn border border-slate-500 text-white hover:bg-navy-800">Trace a historical repair (Link Road, Juhu)</Link>
        </div>
      </section>
      <section>
        <h2 className="h2">What you can report</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CATEGORIES.map((c) => (
            <li key={c.code} className="card flex items-center gap-2 p-3 text-sm font-medium"><Icon name={c.icon} className="h-5 w-5 text-action" />{c.label}</li>
          ))}
        </ul>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {[
          ['Who owns it', 'Location → ward (24 wards) → department by configurable rules. Unclear locations go to a visible triage queue.'],
          ['When it is due', 'Red critical: first action within 5 hours. Yellow medium: resolve by day 7. Orange standard: resolve by day 10. Missed deadlines escalate automatically.'],
          ['Proof it was fixed', 'Before/after photos, a Claude-assisted comparison, and a super admin decision that is recorded with a reason.'],
        ].map(([h, p]) => <div key={h} className="card p-5"><h3 className="font-semibold">{h}</h3><p className="mt-1 text-sm text-muted">{p}</p></div>)}
      </section>
    </div>
  );
}
