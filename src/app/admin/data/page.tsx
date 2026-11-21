import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import { formatIST } from '@/lib/time';
import { PageHeader, SyntheticNote } from '@/components/ui';

export default async function DataQuality() {
  const user = await requirePageUser(['super_admin']);
  const d = await withUser(user, async (q) => ({
    run: (await q.query<{ id: number; started_at: Date; finished_at: Date; source_repo: string; source_commit: string; row_counts: Record<string, { source_rows: number; imported: number; note?: string }>; notes: string }>('select * from import_runs where status = \'completed\' order by id desc limit 1')).rows[0],
    issues: (await q.query<{ file: string; issue_type: string; severity: string; n: number; example: string }>(`select file, issue_type, severity, count(*)::int as n, min(coalesce(record_id,'') || ': ' || message) as example from import_issues group by 1,2,3 order by n desc`)).rows,
    sample: (await q.query<{ record_id: string; message: string }>(`select record_id, message from import_issues where issue_type in ('sla_inconsistent','missing_linked_complaint','ward_mismatch','resolved_without_work_order') order by record_id limit 30`)).rows,
  }), await getDb());
  return (
    <div className="space-y-6">
      <PageHeader kicker="Super admin" title="Data quality and import">Re-run with <code>npm run db:import</code>. The organiser's repository is only read; source IDs, original descriptions, statuses and timestamps are preserved.</PageHeader>
      <SyntheticNote />
      {d.run ? (
        <section className="card p-4 text-sm">
          <p><b>Last import:</b> {formatIST(d.run.finished_at)} · commit <code className="font-mono">{d.run.source_commit}</code> · {d.run.source_repo}</p>
          <p className="text-muted">{d.run.notes}</p>
          <table className="table mt-3"><thead><tr><th>File</th><th>Source rows</th><th>Imported</th><th>Note</th></tr></thead>
            <tbody>{Object.entries(d.run.row_counts).map(([f, c]) => <tr key={f}><td className="font-mono text-xs">{f}</td><td>{c.source_rows}</td><td>{c.imported}</td><td className="text-xs">{c.note}</td></tr>)}</tbody></table>
        </section>
      ) : null}
      <section className="card overflow-x-auto">
        <h2 className="h2 p-4 pb-0">Validation issues</h2>
        <table className="table mt-2"><thead><tr><th>File</th><th>Issue</th><th>Severity</th><th>Count</th><th>Example</th></tr></thead>
          <tbody>{d.issues.map((i) => <tr key={i.file + i.issue_type}><td className="font-mono text-xs">{i.file}</td><td>{i.issue_type.replace(/_/g, ' ')}</td><td>{i.severity}</td><td>{i.n}</td><td className="text-xs">{i.example}</td></tr>)}</tbody></table>
      </section>
      {d.sample.length ? <section className="card p-4 text-sm"><h2 className="h2">Records flagged for review</h2><ul className="mt-2 space-y-1">{d.sample.map((s) => <li key={s.record_id + s.message}><code className="font-mono">{s.record_id}</code>: {s.message}</li>)}</ul></section> : null}
    </div>
  );
}
