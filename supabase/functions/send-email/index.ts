import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SENDERS: Record<string, { name: string; email: string }> = {
  felipe:  { name: 'Felipe — Na Hora Transporte', email: 'onboarding@resend.dev' },
  mabile:  { name: 'Mabile — Na Hora Transporte', email: 'onboarding@resend.dev' },
  sistema: { name: 'Na Hora Transporte',           email: 'onboarding@resend.dev' },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const {
      campaign_id, step_id, lead_id, sdr_id,
      to_email, subject, body_html,
      sender = 'sistema',          // 'felipe' | 'mabile' | 'sistema'
      custom_from_name,            // optional override name
      custom_from_email,           // optional override email (must be Resend-verified)
    } = await req.json();

    if (!to_email || !subject || !body_html) {
      throw new Error('Missing required fields: to_email, subject, body_html');
    }

    // Resolve RESEND_API_KEY: prefer api_settings for the SDR, fallback to env secret
    let resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (sdr_id) {
      const { data: settings } = await supabase
        .from('api_settings')
        .select('resend_api_key')
        .eq('user_id', sdr_id)
        .maybeSingle();
      if (settings?.resend_api_key) resendApiKey = settings.resend_api_key;
    }

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    // Resolve sender
    const senderConfig = SENDERS[sender] ?? SENDERS['sistema'];
    const fromName  = custom_from_name  || senderConfig.name;
    const fromEmail = custom_from_email || senderConfig.email;

    // Create send record with tracking ID
    const { data: sendRecord, error: insertError } = await supabase
      .from('email_sends')
      .insert({
        campaign_id,
        step_id,
        lead_id,
        sdr_id,
        status: 'enviando',
      })
      .select('id, tracking_id')
      .single();

    if (insertError) throw insertError;

    // Build tracking pixel URL
    const trackingPixelUrl = `${supabaseUrl}/functions/v1/track-email?tid=${sendRecord.tracking_id}`;

    // Inject tracking pixel into email body
    const htmlWithTracking = `${body_html}<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />`;

    // Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [to_email],
        subject,
        html: htmlWithTracking,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      await supabase
        .from('email_sends')
        .update({ status: 'erro' })
        .eq('id', sendRecord.id);
      throw new Error(`Resend API error [${resendResponse.status}]: ${JSON.stringify(resendData)}`);
    }

    // Update send record
    await supabase
      .from('email_sends')
      .update({
        status: 'enviado',
        sent_at: new Date().toISOString(),
      })
      .eq('id', sendRecord.id);

    return new Response(JSON.stringify({ success: true, send_id: sendRecord.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Send email error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

