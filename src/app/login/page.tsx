import { redirect } from 'next/navigation';
import { currentUser, homeFor } from '@/lib/session';
import { DEMO_USERS, DEMO_PASSWORD } from '@/lib/demo-seed';
import { LoginForm } from './LoginForm';
import { safeNext } from '@/lib/next-path';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const u = await currentUser();
  if (u) redirect(safeNext(next, homeFor(u.role)));
  const demo = process.env.DEMO_MODE !== '0';
  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_1.1fr]">
      <section className="card p-6">
        <h1 className="h1">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Residents, ward officers and super admins use the same sign-in. What you see depends on your role.</p>
        {next?.startsWith('/report') ? <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">Sign in or create an account, and you will go straight to your report.</p> : null}
        <div className="mt-5"><LoginForm next={next} /></div>
      </section>
      {demo ? (
        <section className="card p-6">
          <h2 className="h2">Demo accounts</h2>
          <p className="mt-1 text-sm text-muted">Local demo only. All accounts use the password <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-ink">{DEMO_PASSWORD}</code>. Use separate browser windows (or a private window) to keep two roles signed in at once.</p>
          <ul className="mt-4 divide-y divide-line">
            {DEMO_USERS.map((d) => (
              <li key={d.email} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{d.name} <span className="font-normal text-muted">· {d.role.replace('_', ' ')}</span></div>
                  <div className="truncate text-xs text-muted">{d.email} · {d.blurb}</div>
                </div>
                <LoginForm quick={d.email} next={next} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
