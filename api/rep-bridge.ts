/**
 * Proxy REP consolidado (1 Serverless Function).
 * URLs públicas: /api/rep/status, /api/rep/punches, etc. (via rewrite em vercel.json).
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
  return handleRepSlug(request, slug);
}
