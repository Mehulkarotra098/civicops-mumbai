// Small inline icon set (no icon package download needed). Decorative by default.
import type { SVGProps } from 'react';

const paths: Record<string, string> = {
  alert: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  clock: 'M12 7v5l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  circle: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  check: 'M20 6 9 17l-5-5',
  checkCircle: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3',
  droplets: 'M7 16.3c2.2 0 4-1.8 4-4 0-1.2-.6-2.3-1.8-3.3S7.2 6.6 7 5.3c-.3 1.3-1 2.6-2.2 3.6S3 11.1 3 12.3c0 2.2 1.8 4 4 4zM12.6 6.6A11 11 0 0 0 14 3.6c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.9 4.9',
  tree: 'M12 22v-7M8 15h8l-4-6 3 0-3-5-3 5h3z',
  pipe: 'M4 10h6v4H4zM10 11h10M14 6v5M18 14c0 1.5-1 3-2 3s-2-1.5-2-3 2-3 2-3 2 1.5 2 3z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  manhole: 'M12 3a9 4 0 1 0 0 8 9 4 0 1 0 0-8zM3 7v10c0 2.2 4 4 9 4s9-1.8 9-4V7',
  road: 'M4 21 8 3M20 21 16 3M12 5v2M12 11v2M12 17v2',
  bulb: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  user: 'M20 21a8 8 0 1 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  arrowRight: 'M5 12h14M13 5l7 7-7 7',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  rupee: 'M6 3h12M6 8h12M6 13l8.5 8M6 13h3c6.7 0 6.7-10 0-10',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  board: 'M3 3h7v18H3zM14 3h7v10h-7z',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  transfer: 'M17 3l4 4-4 4M21 7H9M7 21l-4-4 4-4M3 17h12',
  info: 'M12 16v-4M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  x: 'M18 6 6 18M6 6l12 12',
  zoom: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3M11 8v6M8 11h6',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
};

export function Icon({ name, className = 'h-4 w-4', title, ...rest }: { name: keyof typeof paths | string; className?: string; title?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} {...rest}>
      {title ? <title>{title}</title> : null}
      <path d={paths[name] ?? paths.circle} />
    </svg>
  );
}
