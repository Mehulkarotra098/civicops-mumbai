import { redirect } from 'next/navigation';
import { currentUser, homeFor } from '@/lib/session';
import { DEMO_USERS, DEMO_PASSWORD } from '@/lib/demo-seed';
import { Icon } from '@/components/icons';
import { LoginForm } from './LoginForm';
import { safeNext } from '@/lib/next-path';

const ROLE_CARDS: { email: string; title: string; does: string; icon: string }[] = [
  { email: 'asha@civicops.demo', title: 'Resident', does: 'Report a problem and follow it to the fix.', icon: 'camera' },
  { email: 'kw.officer@civicops.demo', title: 'Ward officer', does: 'Work the K/W queue with photo proof.', icon: 'wrench' },
  { email: 'kw.admin@civicops.demo', title: 'Ward office', does: 'Answer public questions about spending.', icon: 'rupee' },
  { email: 'auditor@civicops.demo', title: 'Auditor', does: 'Decide on overdue and answered cases.', icon: 'shield' },
  { email: 'admin@civicops.demo', title: 'Super admin', does: 'Verify closures and watch every ward.', icon: 'zoom' },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const u = await currentUser();
  if (u) redirect(safeNext(next, homeFor(u.role)));
  const demo = process.env.DEMO_MODE !== '0';
  const featured = new Set(ROLE_CARDS.map((r) => r.email));
  return (
    <div className={`mx-auto grid gap-6 ${demo ? 'max-w-6xl lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]' : 'max-w-md'}`}>
      <section className="card overflow-hidden">
        <div className="bg-navy-900 px-6 py-5 text-white">
          <div className="flex items-center gap-2 text-sm font-semibold text-teal-200"><Icon name="shield" className="h-4 w-4" />CivicOps Mumbai</div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Sign in</h1>
          <p className="mt-1 text-sm text-slate-300">One sign-in for residents, ward teams and reviewers. What you see depends on your role.</p>
          <div className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-300" aria-hidden>
            {['Report', 'Ward', 'Crew', 'Proof', 'Verified'].map((s, i) => (
              <span key={s} className="flex items-center gap-1.5">{i ? <span className="h-0.5 w-3 bg-teal-400/60 sm:w-6" /> : null}<span className="h-2 w-2 rounded-full bg-teal-400" />{s}</span>
            ))}
          </div>
        </div>
        <div className="p-6">
          {next?.startsWith('/report') ? <p className="mb-4 flex items-start gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900"><Icon name="arrowRight" className="mt-0.5 h-4 w-4 shrink-0" />Sign in or create an account, and you will go straight to your report.</p> : null}
          <LoginForm next={next} />
        </div>
      </section>
      {demo ? (
        <section className="card p-6" aria-labelledby="demo-h">
          <h2 id="demo-h" className="h2">Try a demo account</h2>
          <p className="mt-1 text-sm text-muted">One click signs you in. Local demo only; every account uses the password <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-ink">{DEMO_PASSWORD}</code>. Use a private window to keep two roles signed in at once.</p>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {ROLE_CARDS.map((r) => {
              const d = DEMO_USERS.find((x) => x.email === r.email);
              return d ? <li key={r.email} className="min-w-0"><LoginForm quick={d.email} next={next} card={{ title: r.title, who: `${d.name} · ${d.blurb}`, does: r.does, icon: r.icon }} /></li> : null;
            })}
          </ul>
          <details className="mt-4 rounded-xl border border-line">
            <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold">More demo accounts</summary>
            <ul className="divide-y divide-line border-t border-line px-3">
              {DEMO_USERS.filter((d) => !featured.has(d.email)).map((d) => (
                <li key={d.email} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{d.name} <span className="font-normal text-muted">· {d.role.replace('_', ' ')}</span></div>
                    <div className="truncate text-xs text-muted">{d.email} · {d.blurb}</div>
                  </div>
                  <LoginForm quick={d.email} next={next} />
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}
    </div>
  );
}
