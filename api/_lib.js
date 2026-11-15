// Utilitaires partagés par les fonctions serverless.
// Les fichiers préfixés par "_" dans /api ne sont pas exposés comme routes par Vercel.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** fetch avec délai maximal et en-têtes par défaut. Lève une erreur si statut ≠ 2xx. */
export async function fetchWithTimeout(url, { timeout = 8000, headers = {}, as = 'json' } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: as === 'json' ? 'application/json' : '*/*', ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${new URL(url).host}`);
  return as === 'json' ? res.json() : res.text();
}

// Cache mémoire par instance (réutilisée tant que la fonction reste "chaude").
// Complété par le cache CDN de Vercel via l'en-tête Vercel-CDN-Cache-Control.
const memory = new Map();

/**
 * Renvoie la valeur en cache si elle a moins de ttlMs, sinon appelle loader().
 * Si loader() échoue et qu'une ancienne valeur existe, on la renvoie marquée "stale"
 * (ce sont de vraies données plus anciennes, horodatées — jamais inventées).
 */
export async function cached(key, ttlMs, loader) {
  const now = Date.now();
  const entry = memory.get(key);
  if (entry?.value && now - entry.at < ttlMs) return entry.value;
  if (entry?.pending) return entry.pending;

  const pending = (async () => {
    try {
      const value = await loader();
      memory.set(key, { at: Date.now(), value });
      return value;
    } catch (err) {
      if (entry?.value) {
        memory.set(key, { ...entry, pending: null });
        return { ...entry.value, stale: true, error: String(err.message || err) };
      }
      memory.delete(key);
      throw err;
    }
  })();
  memory.set(key, { ...(entry || {}), pending });
  return pending;
}

/** Réponse JSON avec cache CDN partagé (45 s par défaut) et pas de cache navigateur. */
export function json(data, status = 200, cdnMaxAge = 45) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cdnMaxAge > 0 ? 'public, max-age=0, must-revalidate' : 'no-store',
      'Vercel-CDN-Cache-Control': status === 200 && cdnMaxAge > 0 ? `max-age=${cdnMaxAge}, stale-while-revalidate=30` : 'no-store',
      // Pas d'en-tête CORS : l'API ne sert que l'app elle-même (même origine), pas des sites tiers.
    },
  });
}

export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
