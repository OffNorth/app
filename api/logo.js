// GET /api/logo?u=<URL> — relais des logos (cryptos, entreprises).
// But : protéger la vie privée. Le navigateur du visiteur ne contacte plus les CDN tiers
// (son adresse IP ne leur est pas transmise) ; seul ce serveur le fait.
// Sécurité : https uniquement, liste blanche de domaines, pas de redirection suivie,
// type image obligatoire, taille limitée (évite tout usage comme proxy ouvert / SSRF).
const HOSTS = new Set(['coin-images.coingecko.com', 'assets.coingecko.com', 'static.coinpaprika.com', 'companiesmarketcap.com', 's3-symbol-logo.tradingview.com']);
const MAX_BYTES = 300 * 1024;

const fail = (status) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request) {
  let target;
  try {
    target = new URL(new URL(request.url).searchParams.get('u') || '');
  } catch {
    return fail(400);
  }
  if (target.protocol !== 'https:' || !HOSTS.has(target.hostname) || target.username || target.password || target.port) return fail(400);

  let res;
  try {
    res = await fetch(target.href, {
      redirect: 'error',
      headers: { Accept: 'image/avif,image/webp,image/png,image/*;q=0.8', 'User-Agent': 'Mozilla/5.0 (compatible; marches-logo-proxy)' },
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    return fail(502);
  }
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !/^image\/(png|jpeg|webp|gif|avif|svg\+xml)\b/.test(type)) return fail(res.status === 404 ? 404 : 502);
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return fail(502);

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=86400',
      'Vercel-CDN-Cache-Control': 'max-age=604800, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff',
      // Un SVG servi directement ne doit jamais pouvoir exécuter de script.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
