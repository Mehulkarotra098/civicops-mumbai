'use client';
// Site navigation. Desktop: a few main links + "More" + account menu. Phone: a menu drawer with grouped
// links, and (for residents and visitors) a fixed bottom bar with the three things people come for.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { LocaleSwitcher, SignOutButton } from './client';

export interface NavLink { href: string; label: string; icon: string }
export interface NavGroup { title: string; links: NavLink[] }

function isCurrent(path: string, href: string) {
  if (href === '/') return path === '/';
  return path === href || (path.startsWith(href + '/') && !['/admin', '/ward'].includes(href)) || (href === '/admin' && path === '/admin') || (href === '/ward' && path === '/ward');
}

export function SiteNav({ primary, more, groups, bottom, user, unread, locale, signInLabel, signOutLabel, homeHref, appName }: {
  primary: NavLink[]; more: NavLink[]; groups: NavGroup[]; bottom: NavLink[];
  user: { name: string; role: string } | null; unread: number; locale: string;
  signInLabel: string; signOutLabel: string; homeHref: string; appName: string;
}) {
  const path = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const drawer = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => { setOpen(false); setMoreOpen(false); setAcctOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const first = drawer.current?.querySelector<HTMLElement>('a,button'); first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); opener.current?.focus(); }
      if (e.key === 'Tab' && drawer.current) {
        const f = [...drawer.current.querySelectorAll<HTMLElement>('a,button,select')];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-pop]')) { setMoreOpen(false); setAcctOpen(false); } };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const moreActive = more.some((l) => isCurrent(path, l.href));
  const linkCls = (on: boolean) => `inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${on ? 'bg-white/12 text-white shadow-[inset_0_-2px_0_0_#2dd4bf]' : 'text-slate-300 hover:bg-white/8 hover:text-white'}`;

  return (
    <>
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <Link href={homeHref} className="mr-2 flex shrink-0 items-center gap-2 font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-action"><Icon name="shield" className="h-5 w-5" /></span>
          <span className="text-[15px]">{appName}</span>
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 lg:flex">
          {primary.map((l) => (
            <Link key={l.href} href={l.href} aria-current={isCurrent(path, l.href) ? 'page' : undefined} className={linkCls(isCurrent(path, l.href))}>{l.label}</Link>
          ))}
          {more.length ? (
            <div className="relative" data-pop>
              <button type="button" aria-expanded={moreOpen} aria-haspopup="true" onClick={() => { setMoreOpen((o) => !o); setAcctOpen(false); }} className={linkCls(moreActive)}>
                More <svg aria-hidden viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${moreOpen ? 'rotate-180' : ''}`}><path d="M5 7l5 6 5-6" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
              </button>
              {moreOpen ? (
                <div className="absolute left-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-white py-1 text-gray-900 shadow-xl">
                  {more.map((l) => (
                    <Link key={l.href} href={l.href} aria-current={isCurrent(path, l.href) ? 'page' : undefined} className={`flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 ${isCurrent(path, l.href) ? 'bg-teal-50 font-semibold text-action' : ''}`}>
                      <Icon name={l.icon} className="h-4 w-4 text-gray-500" />{l.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <div className="hidden sm:block"><LocaleSwitcher current={locale} /></div>
          {user ? (
            <>
              <Link href="/notifications" className="relative rounded-lg p-2 text-slate-200 hover:bg-white/8" aria-label={`Notifications: ${unread} unread`}>
                <Icon name="bell" className="h-5 w-5" />
                {unread > 0 ? <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4">{unread > 99 ? '99+' : unread}</span> : null}
              </Link>
              <div className="relative hidden lg:block" data-pop>
                <button type="button" aria-expanded={acctOpen} aria-haspopup="true" onClick={() => { setAcctOpen((o) => !o); setMoreOpen(false); }} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/8">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-400/20 text-sm font-bold text-teal-200">{user.name.slice(0, 1).toUpperCase()}</span>
                  <span className="text-left leading-tight"><span className="block max-w-36 truncate text-sm font-semibold">{user.name}</span><span className="block text-[11px] capitalize text-slate-400">{user.role.replace('_', ' ')}</span></span>
                </button>
                {acctOpen ? (
                  <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-line bg-white p-2 text-gray-900 shadow-xl">
                    <div className="px-2 py-1.5 text-xs text-muted">Signed in as <b className="text-gray-900">{user.name}</b></div>
                    <div className="[&_button]:w-full [&_button]:justify-center [&_button]:rounded-lg [&_button]:bg-gray-100 [&_button]:py-2 [&_button]:text-gray-900"><SignOutButton label={signOutLabel} /></div>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <Link href="/login" className="rounded-lg bg-action px-3.5 py-2 text-sm font-semibold hover:brightness-110">{signInLabel}</Link>
          )}
          <button ref={opener} type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="mobile-menu" className="rounded-lg p-2 text-slate-100 hover:bg-white/8 lg:hidden" aria-label="Open menu">
            <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>

      {/* Phone drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu" id="mobile-menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} tabIndex={-1} />
          <div ref={drawer} className="drawer-in absolute right-0 top-0 flex h-full w-[86%] max-w-sm flex-col overflow-y-auto bg-white text-gray-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              {user ? <div className="leading-tight"><div className="font-semibold">{user.name}</div><div className="text-xs capitalize text-muted">{user.role.replace('_', ' ')}</div></div> : <div className="font-semibold">{appName}</div>}
              <button type="button" onClick={() => { setOpen(false); opener.current?.focus(); }} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Close menu">
                <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>
            <nav aria-label="Menu" className="flex-1 px-2 py-2">
              {groups.map((g) => (
                <div key={g.title} className="py-2">
                  <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.title}</div>
                  {g.links.map((l) => {
                    const on = isCurrent(path, l.href);
                    return (
                      <Link key={l.href} href={l.href} aria-current={on ? 'page' : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] ${on ? 'bg-teal-50 font-semibold text-action' : 'hover:bg-gray-50'}`}>
                        <Icon name={l.icon} className={`h-5 w-5 ${on ? 'text-action' : 'text-gray-500'}`} />{l.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="space-y-3 border-t border-line p-4">
              <div className="[&_select]:w-full [&_select]:bg-white [&_select]:text-gray-900"><LocaleSwitcher current={locale} /></div>
              {user ? <div className="[&_button]:w-full [&_button]:justify-center [&_button]:rounded-lg [&_button]:bg-gray-100 [&_button]:py-2.5 [&_button]:text-gray-900"><SignOutButton label={signOutLabel} /></div>
                : <Link href="/login" className="btn-primary w-full justify-center">{signInLabel}</Link>}
            </div>
          </div>
        </div>
      ) : null}

      {/* Phone bottom bar: residents and visitors */}
      {bottom.length ? (
        <nav aria-label="Quick links" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] text-gray-700 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden">
          <div className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${bottom.length}, minmax(0, 1fr))` }}>
            {bottom.map((l) => {
              const on = isCurrent(path, l.href);
              return (
                <Link key={l.href} href={l.href} aria-current={on ? 'page' : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${on ? 'text-action' : ''}`}>
                  <Icon name={l.icon} className="h-5 w-5" />{l.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </>
  );
}
