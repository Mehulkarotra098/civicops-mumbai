// Where to send someone after sign-in. Only same-site relative paths are allowed (no "//evil.com",
// no "/\evil", no schemes), and resident-only pages are not offered to staff.
const RESIDENT_ONLY = ['/report', '/my'];

export function safeNext(next: string | null | undefined, home: string): string {
  if (!next || typeof next !== 'string' || next.length > 300) return home;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || [...next].some((ch) => ch.charCodeAt(0) < 32)) return home;
  try {
    const u = new URL(next, 'http://x.invalid');
    if (u.origin !== 'http://x.invalid') return home;
    const isResident = home === '/my';
    if (!isResident && RESIDENT_ONLY.some((p) => u.pathname === p || u.pathname.startsWith(p + '/'))) return home;
    if (u.pathname === '/login') return home;
    return u.pathname + u.search + u.hash;
  } catch { return home; }
}
