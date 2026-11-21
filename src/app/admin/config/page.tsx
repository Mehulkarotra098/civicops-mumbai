import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import { formatIST } from '@/lib/time';
import { PageHeader } from '@/components/ui';
import { ConfigForms } from './ConfigForms';

export default async function Config() {
  const user = await requirePageUser(['super_admin']);
  const d = await withUser(user, async (q) => ({
    rules: (await q.query<{ id: number; ward_code: string | null; category_code: string; primary_department: string; supporting_departments: string[]; version: number; active: boolean; note: string | null; updated_at: Date }>('select * from routing_rules order by active desc, coalesce(ward_code, \'\'), category_code, version desc')).rows,
    policies: (await q.query<{ id: number; version: number; priority: string; label: string; first_action_hours: number | null; reminder_hours: number | null; resolution_hours: number; active: boolean; note: string | null; created_at: Date }>('select * from sla_policies order by version desc, priority')).rows,
  }), await getDb());
  return (
    <div className="space-y-6">
      <PageHeader kicker="Super admin" title="Routing rules and SLA policies">Changes create a new version; earlier versions stay on record and existing tickets keep the policy version they were created under. Every change is written to the audit log.</PageHeader>
      <ConfigForms />
      <section className="card overflow-x-auto">
        <h2 className="h2 p-4 pb-0">Routing rules</h2>
        <table className="table mt-2"><thead><tr><th>Scope</th><th>Category</th><th>Primary</th><th>Supporting</th><th>Version</th><th>Status</th><th>Note</th><th>Updated</th></tr></thead>
          <tbody>{d.rules.map((r) => <tr key={r.id} className={r.active ? '' : 'text-gray-400'}><td>{r.ward_code ? `Ward ${r.ward_code}` : 'City-wide'}</td><td>{r.category_code}</td><td>{r.primary_department}</td><td>{r.supporting_departments.join(', ') || '—'}</td><td>v{r.version}</td><td>{r.active ? 'Active' : 'Superseded'}</td><td className="text-xs">{r.note}</td><td className="text-xs">{formatIST(r.updated_at)}</td></tr>)}</tbody></table>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="h2 p-4 pb-0">SLA policies</h2>
        <table className="table mt-2"><thead><tr><th>Version</th><th>Priority</th><th>First action</th><th>Reminder</th><th>Resolution</th><th>Status</th><th>Note</th><th>Created</th></tr></thead>
          <tbody>{d.policies.map((p) => <tr key={p.id} className={p.active ? '' : 'text-gray-400'}><td>v{p.version}</td><td>{p.label}</td><td>{p.first_action_hours != null ? `${p.first_action_hours} h` : '—'}</td><td>{p.reminder_hours != null ? `${p.reminder_hours} h` : '—'}</td><td>{p.resolution_hours} h ({Math.round(p.resolution_hours / 24 * 10) / 10} d)</td><td>{p.active ? 'Active' : 'Superseded'}</td><td className="text-xs">{p.note}</td><td className="text-xs">{formatIST(p.created_at)}</td></tr>)}</tbody></table>
      </section>
    </div>
  );
}
