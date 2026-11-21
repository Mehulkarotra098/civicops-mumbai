// Pure geometry and gazetteer helpers. No database or framework imports, so the same
// code runs in the importer, the tests and the Next.js server.
// Ward polygons are the organiser's synthetic Voronoi approximation (WGS84 lon/lat).

export interface WardShape {
  ward_code: string;
  ward_name: string;
  polygon: number[][][]; // GeoJSON Polygon coordinates: [ring][point][lon, lat]
}
export interface LocalityRow {
  name: string;
  ward_code: string;
  lat: number | null;
  lon: number | null;
  aliases: string[];
}
export interface RoadRow {
  road_id: string;
  road_name: string;
  ward_code: string;
  road_type: string;
  under_dlp: boolean;
  bus_route: boolean;
  start_lat: number; start_lon: number; end_lat: number; end_lon: number;
}

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Ray casting on the outer ring (wards have no holes in this dataset). */
export function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function wardForPoint(lat: number, lon: number, wards: WardShape[]): WardShape | null {
  for (const w of wards) {
    if (w.polygon.length && pointInRing(lon, lat, w.polygon[0])) return w;
  }
  return null;
}

/** Distance in metres from a point to a segment, using a local equirectangular projection. */
export function pointToSegmentM(lat: number, lon: number, aLat: number, aLon: number, bLat: number, bLon: number): number {
  const kx = Math.cos(rad(lat)) * 111320;
  const ky = 110540;
  const px = (lon - aLon) * kx, py = (lat - aLat) * ky;
  const bx = (bLon - aLon) * kx, by = (bLat - aLat) * ky;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  const dx = px - t * bx, dy = py - t * by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function nearestRoad(lat: number, lon: number, roads: RoadRow[], maxM = 250): { road: RoadRow; distanceM: number } | null {
  let best: { road: RoadRow; distanceM: number } | null = null;
  for (const r of roads) {
    const d = pointToSegmentM(lat, lon, r.start_lat, r.start_lon, r.end_lat, r.end_lon);
    if (!best || d < best.distanceM) best = { road: r, distanceM: d };
  }
  return best && best.distanceM <= maxM ? best : null;
}

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\(e\)|\be\b\.?$/g, ' east')
    .replace(/\(w\)|\bw\b\.?$/g, ' west')
    .replace(/[.,;:()\-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface LocalityMatch {
  locality: LocalityRow;
  matchedOn: string;
  exact: boolean;
}

/**
 * Find localities mentioned in free text. Returns every candidate so the caller can
 * decide whether the text is ambiguous (e.g. "Andheri" matches K/E and K/W).
 */
export function matchLocalities(text: string, localities: LocalityRow[]): LocalityMatch[] {
  const t = normalizeText(text);
  if (!t) return [];
  const out: LocalityMatch[] = [];
  for (const loc of localities) {
    const names = [loc.name, ...loc.aliases];
    let best: LocalityMatch | null = null;
    for (const n of names) {
      const nn = normalizeText(n);
      if (!nn) continue;
      if (t === nn) { best = { locality: loc, matchedOn: n, exact: true }; break; }
      const re = new RegExp(`(^|\\s)${nn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
      if (re.test(t)) best = best ?? { locality: loc, matchedOn: n, exact: false };
    }
    if (best) out.push(best);
  }
  // Prefer longer, more specific names ("Andheri East" over "Andheri").
  out.sort((a, b) => normalizeText(b.matchedOn).length - normalizeText(a.matchedOn).length);
  const longest = out.length ? normalizeText(out[0].matchedOn).length : 0;
  const specific = out.filter((m) => normalizeText(m.matchedOn).length === longest);
  return specific.length ? specific : out;
}

/**
 * Localities whose name begins with a bare place word typed by the resident, such as
 * "Andheri" → Andheri East (K/E) and Andheri West (K/W). Used to ask for confirmation.
 */
export function prefixCandidates(text: string, localities: LocalityRow[]): LocalityRow[] {
  const t = normalizeText(text);
  if (t.length < 3) return [];
  return localities.filter((l) => {
    const n = normalizeText(l.name);
    return n !== t && n.startsWith(t + ' ');
  });
}

export function searchLocalities(q: string, localities: LocalityRow[], limit = 8): LocalityRow[] {
  const t = normalizeText(q);
  if (!t) return [];
  const scored: { l: LocalityRow; s: number }[] = [];
  for (const l of localities) {
    const names = [l.name, ...l.aliases].map(normalizeText);
    let s = 0;
    for (const n of names) {
      if (n === t) s = Math.max(s, 100);
      else if (n.startsWith(t)) s = Math.max(s, 80 - (n.length - t.length));
      else if (n.includes(t)) s = Math.max(s, 50);
    }
    if (s > 0) scored.push({ l, s });
  }
  return scored.sort((a, b) => b.s - a.s || a.l.name.localeCompare(b.l.name)).slice(0, limit).map((x) => x.l);
}

export function bboxOf(coords: number[][]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of coords) {
    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}
