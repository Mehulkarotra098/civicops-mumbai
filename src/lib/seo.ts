// Share previews (LinkedIn, WhatsApp, X, Slack): every key page gets a title, description and a 1200x630 image.
import type { Metadata } from 'next';

export const SITE = 'CivicOps Mumbai + WardProof';
export const DEFAULT_DESC =
  'Report a civic problem in Mumbai and see who owns it, the deadline and photo proof of the fix. Follow every rupee of road-repair money, and scan the QR on any road to see its free-repair guarantee. Built at the Claude Community Impact Lab, Mumbai.';

const IMAGES = {
  main: { url: '/og/civicops.jpg', alt: 'CivicOps Mumbai + WardProof: every complaint has an owner, every rupee has a reason' },
  road: { url: '/og/road-qr.jpg', alt: 'Road QR: scan any road to see its free-repair guarantee and report a problem' },
} as const;

/** Metadata for one page. `image` defaults to the main card; pages with their own opengraph-image file omit it. */
export function pageMeta(title: string, description: string, image: keyof typeof IMAGES | null = 'main'): Metadata {
  const img = image ? [{ ...IMAGES[image], width: 1200, height: 630 }] : undefined;
  return {
    title,
    description,
    openGraph: { title, description, siteName: SITE, type: 'website', locale: 'en_IN', ...(img ? { images: img } : {}) },
    twitter: { card: 'summary_large_image', title, description, ...(img ? { images: img.map((i) => i.url) } : {}) },
  };
}
