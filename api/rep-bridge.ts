/**
 * Proxy REP consolidado (1 Serverless Function).
 * URLs públicas: /api/rep/status, /api/rep/punches, /api/rep/push-employee, /api/rep/exchange, etc. (via rewrite em vercel.json).
 * Não usar api/rep/[slug].ts — em alguns deploys Vercel isso resulta em FUNCTION_INVOCATION_FAILED.
 */

import { handleRepSlug } from '../modules/rep-integration/repApiRoutes';

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let slug = (url.searchParams.get('slug') || '').trim();
  if (!slug) {
    const parts = url.pathname.split('/').filter(Boolean);
    slug = parts[2] ?? '';
  }
  const response = await handleRepSlug(request, slug);
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  console.log('[API RESPONSE]', `/api/rep/${slug || 'unknown'}`, Date.now());
  return response;
}
