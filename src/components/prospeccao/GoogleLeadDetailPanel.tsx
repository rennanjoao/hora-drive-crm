import { supabase } from '@/integrations/supabase/client';
import { GooglePlaceWithDetail } from '@/hooks/useGoogleMaps';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Loader2, Download, Mail, MessageCircle, MapPin, Phone, Globe,
  Star, Building2, AlertTriangle, CheckCircle, Image as ImageIcon, ExternalLink, Map
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect } from 'react';

interface GoogleLeadDetailPanelProps {
  place: GooglePlaceWithDetail;
  loadingDetail: boolean;
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/\D/g, '').slice(-11);
}

export function GoogleLeadDetailPanel({ place, loadingDetail }: GoogleLeadDetailPanelProps) {
  const { profile } = useAuth();
  const [importing, setImporting] = useState(false);
  const [alreadyImported, setAlreadyImported] = useState(false);
  const [photoBlob, setPhotoBlob] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  const detail = place.detail;
  const isOpen = detail?.opening_hours?.open_now;
  const hasPhone = !!detail?.formatted_phone_number;
  const hasPhoto = !!(detail?.photos && detail.photos.length > 0);

  // Load photo when detail + photo_reference arrives
  useEffect(() => {
    if (!detail?.photos?.[0]?.photo_reference) return;
    setPhotoBlob(null);
    setPhotoLoading(true);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const url = `${supabaseUrl}/functions/v1/google-maps-proxy`;

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ type: 'photo', photoReference: detail.photos[0].photo_reference }),
    })
      .then(async res => {
        if (!res.ok) throw new Error('Photo fetch failed');
        const blob = await res.blob();
        setPhotoBlob(URL.createObjectURL(blob));
      })
      .catch(() => {
        // Silently skip if photo unavailable
      })
      .finally(() => setPhotoLoading(false));
  }, [detail?.photos?.[0]?.photo_reference]);

  const handleImport = async () => {
    if (!profile) return;
    setImporting(true);
    try {
      // Deduplication: check place_id first
      const { data: byPlaceId } = await supabase
        .from('leads')
        .select('id')
        .eq('place_id', place.place_id)
        .maybeSingle();

      if (byPlaceId) {
        toast.error('Lead já cadastrado no CRM');
        setAlreadyImported(true);
        return;
      }

      // Check by phone if available
      const phoneNorm = normalizePhone(detail?.formatted_phone_number || null);
      if (phoneNorm) {
        const { data: byPhone } = await supabase
          .from('leads')
          .select('id')
          .eq('telefone', phoneNorm)
          .maybeSingle();
        if (byPhone) {
          toast.error('Lead com este telefone já existe no CRM');
          setAlreadyImported(true);
          return;
        }
      }

      const { error } = await supabase.from('leads').insert({
        razao_social: place.name,
        nome_fantasia: place.name,
        telefone: phoneNorm,
        website: detail?.website || null,
        cidade: extractCity(place.formatted_address || place.vicinity || ''),
        bairro: extractBairro(place.formatted_address || place.vicinity || ''),
        rating: place.rating ? Number(place.rating) : null,
        place_id: place.place_id,
        foto_url: photoBlob || null,
        fonte: 'google_maps',
        created_by: profile.id,
        assigned_to: profile.id,
        status: 'novo',
      });

      if (error) throw error;

      toast.success('Lead importado para o funil!');
      setAlreadyImported(true);
    } catch (err) {
      console.error('Import error:', err);
      toast.error('Erro ao importar lead');
    } finally {
      setImporting(false);
    }
  };

  const handleWhatsApp = () => {
    const phone = normalizePhone(detail?.formatted_phone_number || null);
    if (!phone) return;
    const msg = encodeURIComponent(`Olá! Somos especializados em soluções de transporte e logística. Gostaríamos de apresentar nossos serviços para a ${place.name}.`);
    window.open(`https://wa.me/55${phone}?text=${msg}`, '_blank');
  };

  const handleEmailFlow = () => {
    toast.info('Acesse a aba Automação para configurar o fluxo de boas-vindas');
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-y-auto">
      {/* Photo */}
      {(hasPhoto || photoLoading) && (
        <div className="relative rounded-lg overflow-hidden bg-muted aspect-video w-full">
          {photoLoading && !photoBlob && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {photoBlob && (
            <img
              src={photoBlob}
              alt={`Fachada de ${place.name}`}
              className="w-full h-full object-cover"
            />
          )}
          {!hasPhoto && !photoLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <ImageIcon className="h-8 w-8 opacity-40" />
              <span className="text-xs">Sem foto disponível</span>
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-base font-bold leading-tight">{place.name}</h2>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {place.rating && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Star className="h-3 w-3 fill-warning text-warning" />
                {place.rating.toFixed(1)}
                {place.user_ratings_total && (
                  <span className="text-muted-foreground">({place.user_ratings_total})</span>
                )}
              </Badge>
            )}
            {detail && (
              isOpen === true ? (
                <Badge variant="outline" className="text-xs gap-1 border-accent/50 text-accent">
                  <CheckCircle className="h-3 w-3" /> Aberto agora
                </Badge>
              ) : isOpen === false ? (
                <Badge variant="destructive" className="text-xs">Fechado agora</Badge>
              ) : null
            )}
          </div>
        </div>

        {(place.vicinity || place.formatted_address) && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{place.formatted_address || place.vicinity}</span>
          </div>
        )}
      </div>

      <Separator />

      {/* Loading skeleton for details */}
      {loadingDetail && !detail && (
        <div className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}

      {/* Details */}
      {detail && (
        <div className="space-y-3">
          {detail.formatted_phone_number && (
            <div className="flex items-center gap-2.5">
              <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Telefone</p>
                <p className="text-sm">{detail.formatted_phone_number}</p>
              </div>
            </div>
          )}

          {!detail.formatted_phone_number && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
              Telefone não disponível no Google
            </div>
          )}

          {detail.website && (
            <div className="flex items-start gap-2.5">
              <Globe className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Website</p>
                <a
                  href={detail.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1 truncate"
                >
                  {detail.website.replace(/^https?:\/\//, '').split('/')[0]}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            </div>
          )}

          {detail.opening_hours?.weekday_text && (
            <div className="flex items-start gap-2.5">
              <Building2 className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Horários</p>
                {detail.opening_hours.weekday_text.map((line, i) => (
                  <p key={i} className="text-xs">{line}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Separator />

      {/* Actions */}
      <div className="space-y-2 pb-2">
        {/* Primary action: Import */}
        {!alreadyImported ? (
          <Button className="w-full" onClick={handleImport} disabled={importing || loadingDetail}>
            {importing ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando...</>
            ) : (
              <><Download className="h-4 w-4 mr-2" />Importar para o CRM</>
            )}
          </Button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 rounded-md bg-muted/60 py-2">
              <CheckCircle className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs text-muted-foreground">Já importado para o CRM</span>
            </div>
            {hasPhone && (
              <Button variant="outline" size="sm" className="w-full" onClick={handleWhatsApp}>
                <MessageCircle className="h-4 w-4 mr-2" />
                Enviar WhatsApp
              </Button>
            )}
            <Button variant="outline" size="sm" className="w-full" onClick={handleEmailFlow}>
              <Mail className="h-4 w-4 mr-2" />
              Iniciar Fluxo de E-mail
            </Button>
          </div>
        )}

        <Separator />

        {/* Quick-access buttons always visible */}
        <div className="grid grid-cols-2 gap-2">
          {/* Ver no Google Maps */}
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => {
              // Prefer the Maps URL from detail, fallback to search URL
              const mapsUrl = detail?.url
                || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${place.place_id}`;
              window.open(mapsUrl, '_blank');
            }}
          >
            <Map className="h-3.5 w-3.5" />
            Ver no Maps
          </Button>

          {/* Acessar Website */}
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            disabled={!detail?.website}
            onClick={() => {
              if (detail?.website) window.open(detail.website, '_blank');
            }}
          >
            <Globe className="h-3.5 w-3.5" />
            {detail?.website ? 'Acessar Site' : 'Sem Website'}
          </Button>
        </div>

        {/* Street View */}
        {detail?.geometry && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={() => {
              const { lat, lng } = detail.geometry!.location;
              window.open(
                `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`,
                '_blank'
              );
            }}
          >
            <MapPin className="h-3.5 w-3.5 mr-2" />
            Ver Acesso de Caminhões (Street View)
          </Button>
        )}
      </div>
    </div>
  );
}

// Helper to extract city from formatted address
function extractCity(address: string): string | null {
  const parts = address.split(',');
  if (parts.length >= 2) return parts[parts.length - 2].trim().split('-')[0].trim();
  return null;
}

function extractBairro(address: string): string | null {
  const parts = address.split(',');
  if (parts.length >= 3) return parts[parts.length - 3].trim();
  return null;
}
