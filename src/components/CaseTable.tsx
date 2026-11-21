import Link from 'next/link';
import type { PublicCase } from '@/lib/spending';
import { isOverdue } from '@/lib/spending';
import { STATUS_PUBLIC } from '@/lib/cases';
import { formatIST, inr } from '@/lib/time';
import { Icon } from './icons';

function statusChip(c: PublicCase) {
  const od = isOverdue(c);
  const good = ['justified', 'corrected'].includes(c.status);
  return (
    <span className={`chip ${od ? 'border-red-300 bg-crit-soft text-crit' : good ? 'border-green-200 bg-ok-soft text-ok' : 'border-gray-300 text-gray-700'}`}>
      <Icon name={od ? 'alert' : good ? 'checkCircle' : 'clock'} className="h-3.5 w-3.5" />{od ? 'Response overdue' : STATUS_PUBLIC[c.status]}
    </span>
  );
}

/** Desktop: the table (first in the DOM, so text lookups find the visible copy). Phone: one card per case. */
export function CaseTable({ cases, empty }: { cases: PublicCase[]; empty: string }) {
  if (!cases.length) return <p className="card p-6 text-sm text-muted">{empty}</p>;
  return (
    <>
      <div className="card hidden overflow-x-auto md:block">
        <table className="table">
          <thead><tr><th>Case</th><th>Work order</th><th>Question</th><th>Responsible office</th><th>Amount under review</th><th>Response due</th><th>Status</th></tr></thead>
          <tbody>{cases.map((c) => {
            const od = isOverdue(c);
            return (
              <tr key={c.id}>
                <td className="whitespace-nowrap"><Link className="font-mono font-semibold text-action! underline" href={`/spending/case/${c.ref}`}>{c.ref}</Link>{c.is_demo_example ? <div className="text-xs text-amber-800">Demo example</div> : null}</td>
                <td><Link className="font-mono underline" href={`/spending/wo/${c.work_order_id}`}>{c.work_order_id}</Link><div className="text-xs text-muted">Ward {c.ward_code}</div></td>
                <td className="max-w-xs text-xs">{c.public_question}</td>
                <td className="text-xs">{c.responsible_office}</td>
                <td className="whitespace-nowrap font-semibold">{c.amount_under_review ? inr(c.amount_under_review) : '—'}</td>
                <td className={`whitespace-nowrap text-xs ${od ? 'font-semibold text-crit' : ''}`}>{formatIST(c.response_due_at)}</td>
                <td className="text-xs">{statusChip(c)}{c.escalated_at ? <div className="mt-1 text-crit">escalated</div> : null}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <ul className="grid gap-3 md:hidden">
        {cases.map((c) => {
          const od = isOverdue(c);
          return (
            <li key={c.id} className={`card p-4 ${od ? 'border-red-200' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <Link className="font-mono text-sm font-bold text-action! underline" href={`/spending/case/${c.ref}`}>{c.ref}</Link>
                <span className={`text-lg font-extrabold tnum ${c.amount_under_review ? 'text-crit' : 'text-muted'}`}>{c.amount_under_review ? inr(c.amount_under_review) : '—'}</span>
              </div>
              <p className="mt-1 line-clamp-3 text-sm">{c.public_question}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{statusChip(c)}{c.is_demo_example ? <span className="chip border-amber-300 bg-amber-50 text-amber-900">Demo example</span> : null}</div>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-muted">Responsible</dt><dd className="font-semibold">{c.responsible_office}</dd></div>
                <div><dt className="text-muted">Response due</dt><dd className={`tnum ${od ? 'font-semibold text-crit' : ''}`}>{formatIST(c.response_due_at)}</dd></div>
              </dl>
              <div className="mt-2 text-xs text-muted">About <Link className="font-mono underline" href={`/spending/wo/${c.work_order_id}`}>{c.work_order_id}</Link> · Ward {c.ward_code}</div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
