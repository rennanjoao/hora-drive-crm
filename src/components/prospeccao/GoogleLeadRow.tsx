import { GooglePlaceBasic } from '@/hooks/useGoogleMaps';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { MapPin, Star, MessageSquare } from 'lucide-react';

interface GoogleLeadRowProps {
  place: GooglePlaceBasic;
  selected: boolean;
  isHighlighted: boolean;
  onToggle: () => void;
  onClick: () => void;
}

function businessTypeLabel(types?: string[]): string | null {
  if (!types) return null;
  if (types.includes('restaurant') || types.includes('food')) return 'Alimentação';
  if (types.includes('store') || types.includes('shopping_mall')) return 'Varejo';
  if (types.includes('factory') || types.includes('industrial_zone')) return 'Indústria';
  if (types.includes('lodging') || types.includes('hotel')) return 'Hospedagem';
  if (types.includes('car_dealer') || types.includes('car_repair')) return 'Automotivo';
  if (types.includes('supermarket') || types.includes('grocery_or_supermarket')) return 'Supermercado';
  if (types.includes('pharmacy')) return 'Farmácia';
  if (types.includes('hospital') || types.includes('health')) return 'Saúde';
  return null;
}

export function GoogleLeadRow({ place, selected, isHighlighted, onToggle, onClick }: GoogleLeadRowProps) {
  const typeLabel = businessTypeLabel(place.types);
  const isActive = place.business_status === 'OPERATIONAL';
  const reviewCount = place.user_ratings_total;
  const isHighReview = reviewCount !== undefined && reviewCount >= 500;

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-3 py-2.5 cursor-pointer rounded-lg transition-all border',
        isHighlighted
          ? 'bg-primary/10 border-primary/30'
          : 'border-transparent hover:bg-muted/60 hover:border-border'
      )}
      onClick={onClick}
    >
      <div className="pt-0.5" onClick={e => { e.stopPropagation(); onToggle(); }}>
        <Checkbox checked={selected} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-tight truncate">{place.name}</p>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {place.rating && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <Star className="h-3 w-3 fill-warning text-warning" />
                {place.rating.toFixed(1)}
              </span>
            )}
            {!isActive && place.business_status && (
              <span className="text-xs text-destructive">Fechado</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {(place.vicinity || place.formatted_address) && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[180px]">
              <MapPin className="h-3 w-3 shrink-0" />
              {(place.vicinity || place.formatted_address)?.split(',')[0]}
            </span>
          )}

          {/* Review count — highlighted if ≥ 500 */}
          {reviewCount !== undefined && (
            <span
              className={cn(
                'flex items-center gap-0.5 text-xs',
                isHighReview
                  ? 'text-accent font-semibold'
                  : 'text-muted-foreground'
              )}
            >
              <MessageSquare className="h-3 w-3 shrink-0" />
              {reviewCount.toLocaleString('pt-BR')}
            </span>
          )}

          {typeLabel && (
            <Badge variant="secondary" className="text-xs py-0">{typeLabel}</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
