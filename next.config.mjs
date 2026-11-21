/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['@electric-sql/pglite', 'sharp', 'pg'],
  experimental: { serverActions: { bodySizeLimit: '14mb' } },
  // Files read at runtime on serverless hosts.
  outputFileTracingIncludes: { '/api/admin/bootstrap': ['./migrations/**', './seed-data/**'], '/api/cron/sla': ['./migrations/**'] },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
      ],
    }];
  },
};
export default nextConfig;
