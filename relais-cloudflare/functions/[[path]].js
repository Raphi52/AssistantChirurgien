// Adresse FIXE (assistant-chirurgien.pages.dev) qui relaie vers le tunnel du PC.
// Le tunnel trycloudflare change d'adresse à chaque lancement : scripts/public.js
// envoie la nouvelle adresse ici (POST /__relais, protégé par le secret RELAIS_TOKEN).
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (url.pathname === '/__relais') {
    if (request.method !== 'POST' || !env.RELAIS_TOKEN || request.headers.get('x-relais-token') !== env.RELAIS_TOKEN)
      return new Response('refusé', { status: 403 });
    const { cible } = await request.json();
    if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(cible || '')) return new Response('adresse invalide', { status: 400 });
    await env.RELAIS.put('cible', cible);
    return new Response('ok');
  }
  const cible = await env.RELAIS.get('cible');
  const horsLigne = () => new Response('<meta charset="utf-8"><meta name="viewport" content="width=device-width"><h2 style="font-family:sans-serif">Assistant momentanément indisponible</h2><p style="font-family:sans-serif">Le serveur est éteint. Réessayez plus tard ou contactez le secrétariat.</p>', { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (!cible) return horsLigne();
  const dest = new URL(url.pathname + url.search, cible);
  const headers = new Headers(request.headers);
  headers.delete('host');
  try {
    const r = await fetch(dest, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual' });
    if (r.status === 530 || r.status === 502) return horsLigne();
    return r;
  } catch { return horsLigne(); }
}
