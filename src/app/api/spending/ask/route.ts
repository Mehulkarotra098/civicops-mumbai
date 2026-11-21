import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { askQuestion } from '@/lib/cases';
import { apiError, currentUser } from '@/lib/session';
import { formatIST } from '@/lib/time';

// Very small in-memory rate limit for the public endpoint: 5 questions per IP per 10 minutes.
const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 600_000);
    if (recent.length >= 5) return NextResponse.json({ error: 'rate_limited', message: 'Too many questions from this connection. Please try again in a few minutes.' }, { status: 429 });
    hits.set(ip, [...recent, now]);
    const b = await req.json();
    const user = await currentUser();
    const r = await askQuestion(await getDb(), { workOrderId: String(b.workOrderId ?? ''), type: String(b.type ?? ''), text: String(b.text ?? ''), name: b.name ? String(b.name) : undefined, contact: b.contact ? String(b.contact) : undefined, userId: user?.id ?? null }, new Date());
    return NextResponse.json({ ref: r.ref, due: formatIST(r.due), office: r.office }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
