import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { saveEvidence, MAX_UPLOAD_BYTES, type Phase } from '@/lib/evidence';
import { apiError, requireApiUser } from '@/lib/session';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const len = Number(req.headers.get('content-length') ?? 0);
    if (len > MAX_UPLOAD_BYTES + 512 * 1024) return NextResponse.json({ error: 'too_large', message: 'Photos must be under 12 MB' }, { status: 413 });
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'no_file', message: 'Choose a photo to upload' }, { status: 400 });
    const r = await saveEvidence(await getDb(), user, decodeURIComponent(id),
      { data: Buffer.from(await file.arrayBuffer()), mime: file.type, name: file.name },
      { phase: (String(form.get('phase') ?? 'report') as Phase), note: form.get('note') ? String(form.get('note')) : undefined, workOrderRef: form.get('workOrderRef') ? String(form.get('workOrderRef')) : undefined },
      new Date());
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
