/** @type {import('next').NextConfig} */

// Cabeçalhos de segurança do painel: não pode ser aberto dentro de outro site (iframe), não fica em cache,
// não aparece em buscadores e não envia o endereço do painel para outros sites.
const ADMIN_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Cache-Control', value: 'no-store' },
];

const nextConfig = {
  reactStrictMode: true,
  // A home era /login: links antigos (convites enviados, WhatsApp, QR Codes) continuam funcionando.
  // O ?intro e o #seção (ex.: /login#rsvp) seguem junto no redirecionamento.
  async redirects() {
    return [{ source: '/login', destination: '/home', permanent: true }];
  },
  async headers() {
    return [
      { source: '/admin', headers: ADMIN_HEADERS },
      { source: '/admin/:path*', headers: ADMIN_HEADERS },
      { source: '/api/admin/:path*', headers: ADMIN_HEADERS },
    ];
  },
};

export default nextConfig;
