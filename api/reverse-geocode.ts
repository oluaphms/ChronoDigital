import { resolveAddressFromCoordinates } from '../src/utils/reverseGeocodeCore';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  }

  const { searchParams } = new URL(request.url);
  const latRaw = searchParams.get('lat');
  const lonRaw = searchParams.get('lon') ?? searchParams.get('lng');
  if (latRaw == null || lonRaw == null) {
    return Response.json({ error: 'Parâmetros lat e lon são obrigatórios.' }, { status: 400, headers: corsHeaders });
  }

  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ error: 'lat e lon devem ser números válidos.' }, { status: 400, headers: corsHeaders });
  }

  try {
    const address = await resolveAddressFromCoordinates(lat, lon);
    return Response.json({ address }, { status: 200, headers: corsHeaders });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Falha na geocodificação';
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
