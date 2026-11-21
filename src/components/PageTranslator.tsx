'use client';
// Whole-page language switch. Pages render in English on the server; for Marathi or Hindi this walks the
// page once (and again whenever live content changes) and swaps every known phrase for its translation:
// text, placeholders, labels and tooltips. Data such as ticket IDs, amounts and place names stay as they are.
import { useEffect } from 'react';
import mr from '@/i18n/phrases-mr.json';
import hi from '@/i18n/phrases-hi.json';
import { PATTERNS } from '@/i18n/patterns';

const DICTS: Record<string, Record<string, string>> = { mr, hi };
const SKIP = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT', 'TEXTAREA']);
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
const SEP = /(\s[·•|→–]\s)/;
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
// Keep in step with scripts/phrase-templates.py.
const TOK = /(\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}(?:, \d{1,2}:\d{2} (?:AM|PM) IST)?|\d{1,2}:\d{2}(?::\d{2})? ?(?:am|pm|AM|PM)?(?: IST)?|₹[\d,]+(?:\.\d+)?(?: ?(?:Cr|L))?|\b(?:CO|WO|BMC|CT|RD|WP)[-A-Z0-9]*\d[-A-Z0-9]*\b|\b[A-Z](?:\/[A-Z])\b|\d[\d,]*(?:\.\d+)?)/g;

function makeTranslator(locale: string) {
  const dict = DICTS[locale] ?? {};
  const cache = new Map<string, string | null>();
  const one = (text: string): string | null => {
    if (dict[text]) return dict[text];
    // Same sentence with different data (amounts, dates, IDs, ward codes): look up its template.
    const vals: string[] = [];
    const k = text.replace(TOK, (m) => `{${vals.push(m) - 1}}`);
    if (vals.length && dict[k]) return dict[k].replace(/\{(\d+)\}/g, (_, i: string) => vals[Number(i)] ?? '');
    for (const p of PATTERNS) {
      const m = text.match(p.re);
      if (m) return (locale === 'mr' ? p.mr : p.hi).replace(/\$(\d)/g, (_, i: string) => m[Number(i)] ?? '');
    }
    return null;
  };
  return (raw: string): string | null => {
    const text = norm(raw);
    if (!text || text.length > 600 || !/[A-Za-z]/.test(text)) return null;
    if (cache.has(text)) return cache.get(text) ?? null;
    let out = one(text);
    if (!out && SEP.test(text)) {
      // Compound labels such as "Ward K/W · Solid Waste Management": translate each part.
      let changed = false;
      const parts = text.split(SEP).map((p) => {
        if (SEP.test(p)) return p;
        const x = one(p.trim());
        if (x) { changed = true; return x; }
        return p;
      });
      out = changed ? parts.join('') : null;
    }
    if (!out) {
      // "Label: value" lines.
      const m = text.match(/^([^:]{2,60}):\s(.+)$/);
      if (m && dict[m[1]]) out = `${dict[m[1]]}: ${one(m[2]) ?? m[2]}`;
    }
    cache.set(text, out);
    return out;
  };
}

export function PageTranslator({ locale }: { locale: string }) {
  useEffect(() => {
    const root = document.documentElement;
    if (locale === 'en' || !DICTS[locale]) { root.classList.remove('i18n-pending'); return; }
    const tr = makeTranslator(locale);
    const written = new WeakMap<Node, string>();

    const doText = (n: Text) => {
      const cur = n.nodeValue ?? '';
      if (written.get(n) === cur) return; // our own output
      const out = tr(cur);
      if (!out) return;
      const lead = cur.match(/^\s*/)?.[0] ?? '', trail = cur.match(/\s*$/)?.[0] ?? '';
      const v = lead + out + trail;
      written.set(n, v);
      if (v !== cur) n.nodeValue = v;
    };
    const doEl = (el: Element) => {
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (!v || el.getAttribute(`data-tr-${a}`) === v) continue;
        const out = tr(v);
        if (out) { el.setAttribute(`data-tr-${a}`, out); el.setAttribute(a, out); }
      }
    };
    const blocked = (el: Element | null) => !!el && (SKIP.has(el.tagName) || !!el.closest('[data-no-translate]'));
    const walk = (start: Node) => {
      if (start.nodeType === Node.TEXT_NODE) { if (!blocked(start.parentElement)) doText(start as Text); return; }
      if (start.nodeType !== Node.ELEMENT_NODE || blocked(start as Element)) return;
      doEl(start as Element);
      const w = document.createTreeWalker(start, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && (SKIP.has((n as Element).tagName) || (n as Element).hasAttribute('data-no-translate')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) doText(n as Text); else doEl(n as Element);
      }
    };

    walk(document.body);
    root.classList.remove('i18n-pending');
    let queued: Node[] = [];
    let raf = 0;
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'childList') m.addedNodes.forEach((n) => queued.push(n));
        else queued.push(m.target);
      }
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; const q = queued; queued = []; q.forEach(walk); });
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [locale]);
  return null;
}
