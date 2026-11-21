import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ingestUploads } from '@/lib/live';
import { apiError, requireApiUser } from '@/lib/session';

/** Upload one or more dataset CSV/GeoJSON files; rows are merged by ID and everything is recomputed. */
export async function POST(req: Request) {
  try {
    await requireApiUser(['super_admin']);
    const form = await req.formData();
    const files: { name: string; text: string }[] = [];
    for (const [field, v] of form.entries()) {
      if (!(v instanceof File) || !v.size) continue;
      if (v.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'too_large', message: `${v.name} is over 20 MB` }, { status: 413 });
      const target = field.startsWith('as:') ? field.slice(3) : v.name;
      files.push({ name: target, text: await v.text() });
    }
    if (!files.length) return NextResponse.json({ error: 'no_file', message: 'Choose at least one file' }, { status: 400 });
    const r = await ingestUploads(await getDb(), files, new Date());
    return NextResponse.json({ counts: r.counts, issues: r.issues.length, errors: r.issues.filter((i) => i.severity === 'error').slice(0, 20), newFlags: r.newFlags.length, newFlagSample: r.newFlags.slice(0, 20), casesOpened: r.opened, escalated: r.escalated });
  } catch (e) {
    if (e instanceof Error && /missing column|Unknown file name/.test(e.message)) return NextResponse.json({ error: 'invalid_file', message: e.message }, { status: 400 });
    return apiError(e);
  }
}
