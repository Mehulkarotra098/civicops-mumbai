// Photo evidence: private storage, metadata stripping, duplicate-photo detection.
// Storage driver: local private directory (outside /public), served only through an
// authenticated route that re-checks row-level security. To use S3/R2, implement
// `putObject` / `getObject` for that bucket; nothing else changes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { HttpError, withUser, type Actor, type Db } from './db.ts';
import { addEvent, getTicketRow, notify, superAdmins } from './tickets.ts';
import { formatIST } from './time.ts';

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export function storageDir(): string {
  return process.env.STORAGE_DIR || path.join(process.cwd(), '.data', 'uploads');
}

async function putObject(key: string, data: Buffer) {
  const p = path.join(storageDir(), key);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  await fs.promises.writeFile(p, data);
}
async function getObject(key: string): Promise<Buffer> {
  const p = path.join(storageDir(), key);
  if (!p.startsWith(storageDir())) throw new HttpError(400, 'bad_key', 'Invalid key');
  return fs.promises.readFile(p);
}

export type Phase = 'report' | 'before' | 'during' | 'after' | 'info';

export async function processImage(input: Buffer) {
  // rotate() applies EXIF orientation; sharp drops EXIF/GPS/XMP on output unless asked to keep it.
  const img = sharp(input, { failOn: 'error' }).rotate();
  const full = await img.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const thumb = await img.clone().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
  return { full: full.data, width: full.info.width, height: full.info.height, thumb };
}

export async function saveEvidence(db: Db, actor: Actor, ticketId: string, file: { data: Buffer; mime: string; name?: string },
  meta: { phase: Phase; note?: string; workOrderRef?: string; origin?: 'upload' | 'illustration' }, now: Date) {
  if (!ALLOWED.has(file.mime)) throw new HttpError(415, 'bad_type', 'Upload a JPEG, PNG, WebP or AVIF photo');
  if (file.data.length > MAX_UPLOAD_BYTES) throw new HttpError(413, 'too_large', 'Photos must be under 12 MB');
  if (actor.role === 'resident' && !['report', 'info'].includes(meta.phase)) throw new HttpError(403, 'forbidden', 'Residents can add report photos only');
  if (actor.role !== 'resident' && meta.phase === 'report') meta.phase = 'before';

  let processed;
  try { processed = await processImage(file.data); }
  catch { throw new HttpError(422, 'unreadable', 'That file could not be read as an image. Try another photo.'); }
  const sha = crypto.createHash('sha256').update(processed.full).digest('hex');
  const id = crypto.randomUUID();

  return withUser(actor, async (q) => {
    const t = await getTicketRow(q, ticketId);
    if (actor.role === 'resident' && t.reporter_id !== actor.id) throw new HttpError(403, 'forbidden', 'You can only add photos to your own report');
    if (['verified_resolved', 'cancelled', 'duplicate', 'referred'].includes(t.status)) throw new HttpError(409, 'closed', 'This ticket is closed');
    const dup = await q.query<{ id: string; phase: string; created_at: Date }>('select id, phase, created_at from evidence where sha256 = $1 order by created_at limit 1', [sha]);
    const storageKey = `${t.id}/${id}.jpg`;
    const thumbKey = `${t.id}/${id}.thumb.jpg`;
    await putObject(storageKey, processed.full);
    await putObject(thumbKey, processed.thumb);
    await q.query(
      `insert into evidence (id, ticket_id, uploaded_by, uploader_role, phase, storage_key, thumb_key, mime, bytes, width, height, sha256,
         duplicate_of_evidence, note, work_order_ref, origin, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,'image/jpeg',$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id, t.id, actor.id, actor.role, meta.phase, storageKey, thumbKey, processed.full.length, processed.width, processed.height, sha,
        dup.rows[0]?.id ?? null, meta.note ?? null, meta.workOrderRef ?? null, meta.origin ?? 'upload', now],
    );
    const dupNote = dup.rows[0] ? ` Warning: identical to a ${dup.rows[0].phase} photo uploaded ${formatIST(dup.rows[0].created_at)}.` : '';
    await addEvent(q, t.id, actor, now, {
      type: 'evidence_added', note: `${meta.phase[0].toUpperCase() + meta.phase.slice(1)} photo added${meta.note ? `: ${meta.note}` : ''}.${dupNote}`,
      data: { evidence_id: id, phase: meta.phase, duplicate_of: dup.rows[0]?.id ?? null, work_order_ref: meta.workOrderRef ?? null, origin: meta.origin ?? 'upload' },
      visibility: meta.phase === 'report' ? 'all' : 'all',
    });
    if (dup.rows[0] && actor.role !== 'resident') {
      await notify(q, await superAdmins(q), { ticketId: t.id, kind: 'duplicate_photo', title: `${t.ref}: a re-used photo was uploaded as ${meta.phase} evidence`, dedupeBase: `${t.id}:dupphoto:${id}` }, now);
    }
    return { id, duplicateOf: dup.rows[0]?.id ?? null, width: processed.width, height: processed.height };
  }, db);
}

export async function readEvidence(db: Db, actor: Actor, evidenceId: string, thumb: boolean) {
  const row = await withUser(actor, async (q) => {
    const r = await q.query<{ storage_key: string; thumb_key: string }>('select storage_key, thumb_key from evidence where id = $1', [evidenceId]);
    return r.rows[0];
  }, db);
  if (!row) throw new HttpError(404, 'not_found', 'Photo not found or you do not have access to it');
  return getObject(thumb ? row.thumb_key : row.storage_key);
}

export async function readEvidenceForModel(key: string): Promise<Buffer> {
  return getObject(key);
}

// ---------------------------------------------------------------- illustration images for the demo
// Generated locally (no stock photos, no network). Every image carries a visible label.
type Scene = 'flood_before' | 'flood_after' | 'tree_before' | 'tree_after' | 'garbage_before' | 'garbage_after' | 'pipe_before' | 'pipe_after' | 'unrelated';

export async function illustration(scene: Scene, stamp = ''): Promise<Buffer> {
  const W = 960, H = 640;
  const sky = '#cbd5e1', road = '#475569', kerb = '#94a3b8', building = '#64748b';
  const label = `<rect x="0" y="${H - 44}" width="${W}" height="44" fill="rgba(15,23,42,0.82)"/>
    <text x="20" y="${H - 16}" font-family="Arial" font-size="20" fill="#fff">ILLUSTRATION · synthetic demo image · ${scene.replace('_', ' ')}</text>
    <text x="${W - 20}" y="${H - 16}" font-family="Arial" font-size="14" fill="#cbd5e1" text-anchor="end">${stamp.replace(/[<&>]/g, '')}</text>`;
  const street = `<rect width="${W}" height="${H}" fill="${sky}"/>
    <rect x="40" y="120" width="160" height="240" fill="${building}"/><rect x="230" y="80" width="140" height="280" fill="#52627a"/>
    <rect x="700" y="100" width="200" height="260" fill="${building}"/>
    <rect x="0" y="360" width="${W}" height="40" fill="${kerb}"/><rect x="0" y="400" width="${W}" height="200" fill="${road}"/>
    <rect x="80" y="490" width="90" height="10" fill="#e2e8f0"/><rect x="300" y="490" width="90" height="10" fill="#e2e8f0"/><rect x="520" y="490" width="90" height="10" fill="#e2e8f0"/><rect x="740" y="490" width="90" height="10" fill="#e2e8f0"/>
    <rect x="420" y="200" width="16" height="200" fill="#334155"/><rect x="380" y="190" width="100" height="18" fill="#0f766e"/>
    <text x="388" y="204" font-family="Arial" font-size="13" fill="#fff">JUHU TARA RD</text>`;
  const scenes: Record<Scene, string> = {
    flood_before: `${street}<rect x="0" y="380" width="${W}" height="220" fill="#7c6a46" opacity="0.88"/>
      <path d="M0 400 Q120 385 240 400 T480 400 T720 400 T960 400" stroke="#a8916a" stroke-width="6" fill="none"/>
      <rect x="560" y="430" width="160" height="50" rx="10" fill="#b91c1c"/><rect x="580" y="408" width="110" height="30" rx="6" fill="#dc2626"/>`,
    flood_after: `${street}<ellipse cx="640" cy="560" rx="90" ry="14" fill="#7c6a46" opacity="0.5"/>
      <rect x="560" y="440" width="160" height="50" rx="10" fill="#b91c1c"/><rect x="580" y="418" width="110" height="30" rx="6" fill="#dc2626"/>
      <circle cx="590" cy="492" r="14" fill="#111"/><circle cx="690" cy="492" r="14" fill="#111"/>`,
    tree_before: `${street}<rect x="250" y="430" width="520" height="40" rx="18" fill="#6b4f2a" transform="rotate(-6 510 450)"/>
      <circle cx="760" cy="420" r="70" fill="#166534"/><circle cx="700" cy="460" r="60" fill="#15803d"/><circle cx="820" cy="470" r="55" fill="#14532d"/>
      <line x1="0" y1="150" x2="${W}" y2="230" stroke="#111" stroke-width="3"/>`,
    tree_after: `${street}<rect x="860" y="250" width="26" height="150" fill="#6b4f2a"/><circle cx="873" cy="230" r="60" fill="#166534"/>
      <rect x="760" y="380" width="70" height="20" fill="#6b4f2a"/><line x1="0" y1="150" x2="${W}" y2="230" stroke="#111" stroke-width="3"/>`,
    garbage_before: `${street}<rect x="560" y="300" width="90" height="70" fill="#15803d"/>
      <circle cx="600" cy="370" r="50" fill="#78716c"/><circle cx="660" cy="380" r="40" fill="#a8a29e"/><circle cx="540" cy="385" r="35" fill="#57534e"/><circle cx="700" cy="392" r="28" fill="#d6d3d1"/>`,
    garbage_after: `${street}<rect x="560" y="300" width="90" height="70" fill="#15803d"/><rect x="570" y="292" width="70" height="10" fill="#14532d"/>`,
    pipe_before: `${street}<rect x="0" y="560" width="${W}" height="20" fill="#1e3a8a"/>
      <path d="M470 570 Q460 470 430 430 M480 570 Q490 470 520 420 M475 570 L475 410" stroke="#93c5fd" stroke-width="10" fill="none"/>
      <ellipse cx="475" cy="560" rx="260" ry="30" fill="#60a5fa" opacity="0.7"/>`,
    pipe_after: `${street}<rect x="0" y="560" width="${W}" height="20" fill="#1e3a8a"/><rect x="420" y="540" width="120" height="40" fill="#a3a3a3"/>`,
    unrelated: `<rect width="${W}" height="${H}" fill="#e7e5e4"/><rect x="100" y="100" width="760" height="420" fill="#fef3c7"/>
      <rect x="160" y="160" width="300" height="200" fill="#a16207"/><circle cx="650" cy="260" r="110" fill="#f59e0b"/>
      <text x="180" y="460" font-family="Arial" font-size="28" fill="#44403c">Indoor room: not the reported street</text>`,
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${scenes[scene]}${label}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}
