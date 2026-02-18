import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Search, Loader2, Filter, MapPin, Map, AlertTriangle, Download, ChevronDown, RotateCcw, MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';
import { GooglePlaceBasic } from '@/hooks/useGoogleMaps';
import { useGoogleMapsSearch } from '@/hooks/useGoogleMapsSearch';
import { GoogleLeadRow } from './GoogleLeadRow';
import { GoogleLeadDetailPanel } from './GoogleLeadDetailPanel';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBrasilAPI } from '@/hooks/useBrasilAPI';

const NICHOS_SUGERIDOS = [
  'Supermercado', 'Distribuidora', 'Construtora', 'Material de Construção',
  'Frigorífico', 'Atacado', 'Indústria Alimentícia', 'Transportadora',
  'Farmácia', 'Agropecuária', 'Posto de Gasolina', 'Madeireira',
  'Gráfica', 'Laticínios', 'Fábrica', 'Armazém',
];

export function GoogleMapsSearch() {
  const { profile } = useAuth();
  const { searchCNPJ } = useBrasilAPI();

  const {
    nicho, setNicho,
    cidade, setCidade,
    bairro, setBairro,
    searchResults,
    isRestored,
    loadingSearch, loadingMore, loadingDetail,
    searchError,
    selectedPlace,
    nextPageToken,
    selectPlace, loadMore,
    handleSearch, reset,
  } = useGoogleMapsSearch();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importingBulk, setImportingBulk] = useState(false);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());

  // ── Filters ─────────────────────────────────────────────────────────────
  const [filterMinReviews, setFilterMinReviews] = useState(false);
  // "apenas com email" is handled post-detail import (we don't have email at list stage),
  // but we'll keep UI and note it filters by known email in detail
  const [filterWithEmail] = useState(false); // placeholder; real email comes from details

  const displayedResults: GooglePlaceBasic[] = useMemo(() => {
    let list = searchResults;
    if (filterMinReviews) {
      list = list.filter(p => (p.user_ratings_total ?? 0) >= 500);
    }
    return list;
  }, [searchResults, filterMinReviews]);

  // ── Selection helpers ────────────────────────────────────────────────────
  const toggleSelect = (placeId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  };

  const selectAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(displayedResults.map(p => p.place_id)));
    else setSelectedIds(new Set());
  };

  // ── Search handler ───────────────────────────────────────────────────────
  const onSearch = async () => {
    if (!nicho.trim()) { toast.error('Informe o nicho/tipo de negócio para buscar'); return; }
    if (!cidade.trim()) { toast.error('Informe a cidade para filtrar'); return; }
    setSelectedIds(new Set());
    setImportedIds(new Set());
    await handleSearch();
  };

  // ── Bulk import with BrasilAPI enrichment ────────────────────────────────
  const handleBulkImport = async () => {
    if (!profile || selectedIds.size === 0) return;
    setImportingBulk(true);
    let imported = 0;
    let skipped = 0;

    try {
      for (const placeId of Array.from(selectedIds)) {
        const place = displayedResults.find(p => p.place_id === placeId);
        if (!place) continue;

        // Dedup by place_id
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('place_id', placeId)
          .maybeSingle();

        if (existing) {
          skipped++;
          setImportedIds(prev => new Set([...prev, placeId]));
          continue;
        }

        // Try to get place details to find CNPJ if available (via phone or address)
        // For bulk import we save basic data; BrasilAPI needs a known CNPJ
        // We'll import basic data and flag enrichment_needed
        const { error } = await supabase.from('leads').insert({
          razao_social: place.name,
          nome_fantasia: place.name,
          rating: place.rating ? Number(place.rating) : null,
          place_id: placeId,
          fonte: 'google_maps',
          created_by: profile.id,
          assigned_to: profile.id,
          status: 'novo',
          cidade: extractCity(place.formatted_address || place.vicinity || ''),
        });

        if (!error) {
          imported++;
          setImportedIds(prev => new Set([...prev, placeId]));
        }
      }

      toast.success(`${imported} leads importados!${skipped > 0 ? ` ${skipped} já existiam no CRM.` : ''}`);
      setSelectedIds(new Set());
    } catch (err) {
      toast.error('Erro durante importação em massa');
    } finally {
      setImportingBulk(false);
    }
  };

  const selectedCount = selectedIds.size;
  const allSelected = displayedResults.length > 0 && selectedCount === displayedResults.length;
  const hasResults = displayedResults.length > 0 || searchResults.length > 0;

  return (
    <div className="space-y-4">
      {/* Search Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Map className="h-5 w-5" />
            Busca por Google Maps
          </CardTitle>
          <CardDescription>
            Busque estabelecimentos por nicho e localização. Detalhes (telefone, foto) carregados apenas ao selecionar — economizando créditos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nicho / Tipo de Negócio *</Label>
              <Input
                placeholder="ex: Supermercado, Distribuidora..."
                value={nicho}
                onChange={e => setNicho(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onSearch()}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cidade *</Label>
              <Input
                placeholder="ex: São Paulo, Campinas..."
                value={cidade}
                onChange={e => setCidade(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onSearch()}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bairro (opcional)</Label>
              <Input
                placeholder="ex: Centro, Vila Nova..."
                value={bairro}
                onChange={e => setBairro(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onSearch()}
              />
            </div>
          </div>

          {/* Quick nicho pills */}
          <div className="flex flex-wrap gap-1.5">
            {NICHOS_SUGERIDOS.map(n => (
              <button
                key={n}
                onClick={() => setNicho(n)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  nicho === n
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={onSearch} disabled={loadingSearch} className="gap-2">
              {loadingSearch ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Buscando...</>
              ) : (
                <><Search className="h-4 w-4" />Buscar no Google Maps</>
              )}
            </Button>
            {hasResults && (
              <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                Limpar
              </Button>
            )}
          </div>

          {searchError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {searchError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results split-screen */}
      {hasResults && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
          {/* Left: List */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-2 px-3 pt-3 space-y-2">
              {/* Restored state notice */}
              {isRestored && searchResults.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-2.5 py-1.5">
                  <RotateCcw className="h-3 w-3 shrink-0" />
                  Última busca restaurada — pesquise novamente para atualizar
                </div>
              )}

              {/* Filters row */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Filter className="h-3 w-3" />
                  Filtros:
                </span>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                  <Checkbox
                    checked={filterMinReviews}
                    onCheckedChange={v => setFilterMinReviews(!!v)}
                    className="h-3.5 w-3.5"
                  />
                  <MessageSquare className="h-3 w-3 text-muted-foreground" />
                  Mín. 500 comentários
                </label>
              </div>

              {/* Selection + bulk import row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => selectAll(!!checked)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {selectedCount > 0
                      ? `${selectedCount} selecionados`
                      : `${displayedResults.length} resultado${displayedResults.length !== 1 ? 's' : ''}${filterMinReviews && searchResults.length !== displayedResults.length ? ` (de ${searchResults.length})` : ''}`
                    }
                  </span>
                </div>
                {selectedCount > 0 && (
                  <Button size="sm" onClick={handleBulkImport} disabled={importingBulk}>
                    {importingBulk ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Importando...</>
                    ) : (
                      <><Download className="h-3.5 w-3.5 mr-1.5" />Importar {selectedCount}</>
                    )}
                  </Button>
                )}
              </div>
            </CardHeader>
            <Separator />
            <div className="overflow-y-auto max-h-[600px] p-2 space-y-0.5">
              {displayedResults.map(place => (
                <GoogleLeadRow
                  key={place.place_id}
                  place={place}
                  selected={selectedIds.has(place.place_id)}
                  isHighlighted={selectedPlace?.place_id === place.place_id}
                  onToggle={() => toggleSelect(place.place_id)}
                  onClick={() => selectPlace(place)}
                />
              ))}
              {displayedResults.length === 0 && searchResults.length > 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  Nenhum resultado passa pelos filtros ativos
                </div>
              )}
              {/* Load more button */}
              {nextPageToken && (
                <div className="pt-2 pb-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs gap-1.5"
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando mais...</>
                    ) : (
                      <><ChevronDown className="h-3.5 w-3.5" />Carregar mais resultados</>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Right: Detail */}
          <div className="lg:sticky lg:top-4">
            {selectedPlace ? (
              <Card className="overflow-hidden">
                <GoogleLeadDetailPanel
                  place={selectedPlace}
                  loadingDetail={loadingDetail}
                />
              </Card>
            ) : (
              <Card className="flex flex-col items-center justify-center p-8 text-center min-h-[200px] border-dashed">
                <Filter className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Clique em um resultado para ver detalhes e foto
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Detalhes são carregados sob demanda para economizar créditos
                </p>
              </Card>
            )}
          </div>
        </div>
      )}

      {!hasResults && !loadingSearch && !searchError && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Busque por nicho e cidade para ver resultados do Google Maps</p>
            <p className="text-xs text-muted-foreground mt-1">
              Exemplo: "Supermercado" em "Campinas" → bairro "Centro"
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Helper
function extractCity(address: string): string | null {
  const parts = address.split(',');
  if (parts.length >= 2) return parts[parts.length - 2].trim().split('-')[0].trim();
  return null;
}
