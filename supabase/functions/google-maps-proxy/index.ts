import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'GOOGLE_MAPS_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const { type, query, placeId, location } = body;

    let url: string;

    if (type === 'textSearch') {
      // Returns only basic info — save place_id + name + address to save credit
      const params = new URLSearchParams({
        query,
        key: apiKey,
        language: 'pt-BR',
      });
      if (location) {
        params.append('location', location);
        params.append('radius', '50000');
      }
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`;
    } else if (type === 'getDetails') {
      // Lazy load: only called when user clicks a lead row
      const params = new URLSearchParams({
        place_id: placeId,
        fields: 'formatted_phone_number,website,photos,rating,geometry,opening_hours,formatted_address,business_status',
        key: apiKey,
        language: 'pt-BR',
      });
      url = `https://maps.googleapis.com/maps/api/place/details/json?${params}`;
    } else if (type === 'photo') {
      // Serve photo through proxy so key stays hidden
      const params = new URLSearchParams({
        maxwidth: '400',
        photo_reference: body.photoReference,
        key: apiKey,
      });
      const photoRes = await fetch(`https://maps.googleapis.com/maps/api/place/photo?${params}`);
      const blob = await photoRes.blob();
      return new Response(blob, {
        headers: {
          ...corsHeaders,
          'Content-Type': photoRes.headers.get('Content-Type') || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid type. Use textSearch, getDetails, or photo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response = await fetch(url);
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('google-maps-proxy error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
