import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search, Loader2, Filter, MapPin, Map, AlertTriangle, Download, ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import { useGoogleMaps, GooglePlaceBasic } from '@/hooks/useGoogleMaps';
import { GoogleLeadRow } from './GoogleLeadRow';
import { GoogleLeadDetailPanel } from './GoogleLeadDetailPanel';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const NICHOS_SUGERIDOS = [
  'Supermercado', 'Distribuidora', 'Construtora', 'Material de Construção',
  'Frigorífico', 'Atacado', 'Indústria Alimentícia', 'Transportadora',
  'Farmácia', 'Agropecuária', 'Posto de Gasolina', 'Madeireira',
  'Gráfica', 'Laticínios', 'Fábrica', 'Armazém',
];

export function GoogleMapsSearch() {
  const { profile } = useAuth();
  const { searchResults, loadingSearch, loadingMore, loadingDetail, searchError, selectedPlace, nextPageToken, searchPlaces, selectPlace, loadMore, reset } = useGoogleMaps();

  const [nicho, setNicho] = useState('');
  const [cidade, setCidade] = useState('');
  const [bairro, setBairro] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importingBulk, setImportingBulk] = useState(false);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());

  const handleSearch = async () => {
    if (!nicho.trim()) {
      toast.error('Informe o nicho/tipo de negócio para buscar');
      return;
    }
    if (!cidade.trim()) {
      toast.error('Informe a cidade para filtrar');
      return;
    }
    setSelectedIds(new Set());
    setImportedIds(new Set());
    await searchPlaces(nicho, cidade, bairro || undefined);
  };

  const toggleSelect = (placeId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  };

  const selectAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(searchResults.map(p => p.place_id)));
    else setSelectedIds(new Set());
  };

  const handleBulkImport = async () => {
    if (!profile || selectedIds.size === 0) return;
    setImportingBulk(true);
    let imported = 0;
    let skipped = 0;

    try {
      for (const placeId of Array.from(selectedIds)) {
        const place = searchResults.find(p => p.place_id === placeId);
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

        const { error } = await supabase.from('leads').insert({
          razao_social: place.name,
          nome_fantasia: place.name,
          rating: place.rating ? Number(place.rating) : null,
          place_id: placeId,
          fonte: 'google_maps',
          created_by: profile.id,
          assigned_to: profile.id,
          status: 'novo',
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
  const allSelected = searchResults.length > 0 && selectedCount === searchResults.length;

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
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cidade *</Label>
              <Input
                placeholder="ex: São Paulo, Campinas..."
                value={cidade}
                onChange={e => setCidade(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bairro (opcional)</Label>
              <Input
                placeholder="ex: Centro, Vila Nova..."
                value={bairro}
                onChange={e => setBairro(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
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

          <div className="flex gap-2">
            <Button onClick={handleSearch} disabled={loadingSearch} className="gap-2">
              {loadingSearch ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Buscando...</>
              ) : (
                <><Search className="h-4 w-4" />Buscar no Google Maps</>
              )}
            </Button>
            {searchResults.length > 0 && (
              <Button variant="ghost" size="sm" onClick={reset}>
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
      {searchResults.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
          {/* Left: List */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-2 px-3 pt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => selectAll(!!checked)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {selectedCount > 0 ? `${selectedCount} selecionados` : `${searchResults.length} resultados`}
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
              {searchResults.map(place => (
                <GoogleLeadRow
                  key={place.place_id}
                  place={place}
                  selected={selectedIds.has(place.place_id)}
                  isHighlighted={selectedPlace?.place_id === place.place_id}
                  onToggle={() => toggleSelect(place.place_id)}
                  onClick={() => selectPlace(place)}
                />
              ))}
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

      {searchResults.length === 0 && !loadingSearch && !searchError && (
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
