import Link from 'next/link';
import type { PublicCase } from '@/lib/spending';
import { isOverdue } from '@/lib/spending';
import { STATUS_PUBLIC } from '@/lib/cases';
import { formatIST, inr } from '@/lib/time';

export function CaseTable({ cases, empty }: { cases: PublicCase[]; empty: string }) {
  if (!cases.length) return <p className="card p-6 text-sm text-muted">{empty}</p>;
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead><tr><th>Case</th><th>Work order</th><th>Question</th><th>Responsible office</th><th>Amount under review</th><th>Response due</th><th>Status</th></tr></thead>
        <tbody>{cases.map((c) => {
          const od = isOverdue(c);
          return (
            <tr key={c.id}>
              <td className="whitespace-nowrap"><Link className="font-mono font-semibold text-action underline" href={`/spending/case/${c.ref}`}>{c.ref}</Link>{c.is_demo_example ? <div className="text-xs text-amber-800">Demo example</div> : null}</td>
              <td><Link className="font-mono underline" href={`/spending/wo/${c.work_order_id}`}>{c.work_order_id}</Link><div className="text-xs text-muted">Ward {c.ward_code}</div></td>
              <td className="max-w-xs text-xs">{c.public_question}</td>
              <td className="text-xs">{c.responsible_office}</td>
              <td className="whitespace-nowrap">{c.amount_under_review ? inr(c.amount_under_review) : '—'}</td>
              <td className={`whitespace-nowrap text-xs ${od ? 'font-semibold text-crit' : ''}`}>{formatIST(c.response_due_at)}</td>
              <td className="text-xs"><span className={`chip ${od ? 'border-red-300 bg-crit-soft text-crit' : ['justified', 'corrected'].includes(c.status) ? 'border-green-200 bg-ok-soft text-ok' : 'border-gray-300 text-gray-700'}`}>{od ? 'Response overdue' : STATUS_PUBLIC[c.status]}</span>{c.escalated_at ? <div className="mt-1 text-crit">escalated</div> : null}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}
