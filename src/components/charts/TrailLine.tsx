// The signature "trail line": a thin teal line with dots that joins each step of a story
// (money path, case lifecycle). Vertical on phones, horizontal from `sm` up. Server component.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '../icons';

export type StepState = 'done' | 'current' | 'warn' | 'crit' | 'todo' | 'na';

export interface TrailStep {
  key: string;
  label: string;
  value?: ReactNode;
  sub?: ReactNode;
  state: StepState;
  href?: string;
}

const STATE_WORD: Record<StepState, string> = {
  done: 'Done', current: 'In progress', warn: 'Needs a look', crit: 'Question raised', todo: 'Not yet', na: 'Not published',
};

const DOT: Record<StepState, string> = {
  done: 'border-action bg-action text-white',
  current: 'border-action bg-white text-action ring-4 ring-action/15',
  warn: 'border-amber-500 bg-amber-50 text-amber-700',
  crit: 'border-crit bg-crit text-white',
  todo: 'border-gray-300 bg-white text-gray-400',
  na: 'border-dashed border-gray-400 bg-white text-gray-400',
};

const DOT_ICON: Record<StepState, string> = {
  done: 'check', current: 'clock', warn: 'info', crit: 'alert', todo: 'circle', na: 'x',
};

export function TrailLine({ steps, label, tone = 'light', className = '' }: { steps: TrailStep[]; label: string; tone?: 'light' | 'dark'; className?: string }) {
  const dark = tone === 'dark';
  return (
    <ol className={`relative grid sm:grid-flow-col sm:auto-cols-fr ${className}`} aria-label={label}>
      {steps.map((s, i) => {
        const next = steps[i + 1];
        const solid = next && !['todo', 'na'].includes(next.state);
        const body = (
          <>
            <span className={`block text-[11px] font-bold uppercase tracking-wider ${dark ? 'text-slate-400' : 'text-muted'}`}>{s.label}</span>
            {s.value != null ? <span className={`mt-0.5 block text-base font-extrabold leading-tight tnum ${s.state === 'crit' ? (dark ? 'text-red-300' : 'text-crit') : dark ? 'text-white' : 'text-ink'}`}>{s.value}</span> : null}
            {s.sub != null ? <span className={`mt-0.5 block text-xs ${dark ? 'text-slate-300' : 'text-muted'}`}>{s.sub}</span> : null}
            <span className="sr-only"> ({STATE_WORD[s.state]})</span>
          </>
        );
        return (
          <li key={s.key} className="relative flex min-w-0 gap-3 pb-5 last:pb-0 sm:flex-col sm:gap-2 sm:pb-0 sm:pr-4">
            {next ? (
              <span aria-hidden="true" className={`absolute left-[11px] top-7 bottom-1 w-0.5 sm:left-8 sm:right-1 sm:top-[11px] sm:bottom-auto sm:h-0.5 sm:w-auto ${solid ? 'bg-action' : dark ? 'border-l-2 border-dashed border-slate-500 sm:border-l-0 sm:border-t-2' : 'border-l-2 border-dashed border-gray-300 sm:border-l-0 sm:border-t-2'} ${solid ? '' : 'bg-transparent'}`} />
            ) : null}
            <span aria-hidden="true" className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${DOT[s.state]}`}>
              <Icon name={DOT_ICON[s.state]} className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              {s.href ? <Link href={s.href} className="block rounded hover:underline focus-visible:outline-2">{body}</Link> : body}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
