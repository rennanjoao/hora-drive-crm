import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Upload, Play, Pause, Download, Filter, MapPin, Loader2,
  Pickaxe, AlertTriangle, SlidersHorizontal, Layers, Map
} from 'lucide-react';
import { BrasilAPICompany } from '@/hooks/useBrasilAPI';
import { NICHE_FILTERS, PORTE_OPTIONS, UF_OPTIONS, CARGO_PROFILES, getProfileSummary } from '@/lib/cnae-profiles';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MiningLeadRow } from './MiningLeadRow';
import { LeadDetailPanel } from './LeadDetailPanel';
import { GoogleMapsSearch } from './GoogleMapsSearch';

interface EnrichedCompany {
  cnpj: string;
  data: BrasilAPICompany | null;
  status: 'pending' | 'loading' | 'success' | 'error';
  error?: string;
  selected: boolean;
}

const DELAY_MS = 2000;

// Normalize phone for deduplication
function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/\D/g, '').slice(-11);
}

// Normalize name+city for deduplication
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
}

export function MiningMode() {
  const { profile } = useAuth();
  const [companies, setCompanies] = useState<EnrichedCompany[]>([]);
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [importing, setImporting] = useState(false);
  const [selectedCNPJ, setSelectedCNPJ] = useState<string | null>(null);
  const [importingDetail, setImportingDetail] = useState(false);
  const [importedCNPJs, setImportedCNPJs] = useState<Set<string>>(new Set());
  const abortRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [filterNiche, setFilterNiche] = useState<string>('all');
  const [filterUF, setFilterUF] = useState<string>('all');
  const [filterCidade, setFilterCidade] = useState('');
  const [filterBairro, setFilterBairro] = useState('');
  const [filterPorte, setFilterPorte] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/[\r\n]+/).filter(Boolean);
      const cnpjs: string[] = [];
      for (const line of lines) {
        const parts = line.split(/[,;\t]/);
        for (const part of parts) {
          const digits = part.replace(/\D/g, '');
          if (digits.length === 14 && !cnpjs.includes(digits)) cnpjs.push(digits);
        }
      }
      if (cnpjs.length === 0) {
        toast.error('Nenhum CNPJ válido (14 dígitos) encontrado no arquivo');
        return;
      }
      setCompanies(cnpjs.map(cnpj => ({ cnpj, data: null, status: 'pending', selected: false })));
      setCurrentIndex(0);
      setSelectedCNPJ(null);
      toast.success(`${cnpjs.length} CNPJs carregados`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const processQueue = useCallback(async () => {
    setProcessing(true);
    abortRef.current = false;
    for (let i = currentIndex; i < companies.length; i++) {
      if (abortRef.current) break;
      if (companies[i].status === 'success') { setCurrentIndex(i + 1); continue; }
      setCompanies(prev => prev.map((c, idx) => idx === i ? { ...c, status: 'loading' } : c));
      setCurrentIndex(i);
      try {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${companies[i].cnpj}`);
        if (!res.ok) throw new Error(res.status === 404 ? 'Não encontrado' : `Erro ${res.status}`);
        const data: BrasilAPICompany = await res.json();
        setCompanies(prev => prev.map((c, idx) => idx === i ? { ...c, data, status: 'success' } : c));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro';
        setCompanies(prev => prev.map((c, idx) => idx === i ? { ...c, status: 'error', error: msg } : c));
      }
      if (i < companies.length - 1 && !abortRef.current) await new Promise(r => setTimeout(r, DELAY_MS));
    }
    setProcessing(false);
  }, [companies, currentIndex]);

  const toggleSelect = (cnpj: string) => {
    setCompanies(prev => prev.map(c => c.cnpj === cnpj ? { ...c, selected: !c.selected } : c));
  };

  const selectAllFiltered = (checked: boolean) => {
    const filteredCnpjs = new Set(filtered.map(c => c.cnpj));
    setCompanies(prev => prev.map(c =>
      c.status === 'success' && filteredCnpjs.has(c.cnpj) ? { ...c, selected: checked } : c
    ));
  };

  // Apply filters
  const filtered = companies.filter(c => {
    if (c.status !== 'success' || !c.data) return false;
    const d = c.data;
    const cnaeCode = String(d.cnae_fiscal);
    if (filterNiche !== 'all') {
      const niche = NICHE_FILTERS.find(n => n.label === filterNiche);
      if (niche && !niche.prefixes.some(p => cnaeCode.startsWith(p))) return false;
    }
    if (filterUF !== 'all' && d.uf !== filterUF) return false;
    if (filterCidade && !d.municipio.toLowerCase().includes(filterCidade.toLowerCase())) return false;
    if (filterBairro && !(d.bairro || '').toLowerCase().includes(filterBairro.toLowerCase())) return false;
    if (filterPorte !== 'all') {
      const porte = (d.porte || '').toUpperCase();
      if (filterPorte === 'MEI' && !porte.includes('MEI')) return false;
      if (filterPorte === 'ME' && !porte.includes('MICRO') && !porte.includes(' ME')) return false;
      if (filterPorte === 'EPP' && !porte.includes('PEQUENO')) return false;
      if (filterPorte === 'DEMAIS' && (porte.includes('MEI') || porte.includes('MICRO') || porte.includes('PEQUENO'))) return false;
    }
    return true;
  });

  const selectedCount = filtered.filter(c => c.selected).length;
  const successCount = companies.filter(c => c.status === 'success').length;
  const errorCount = companies.filter(c => c.status === 'error').length;
  const progress = companies.length > 0 ? Math.round(((successCount + errorCount) / companies.length) * 100) : 0;

  // Hot zones
  const bairroGroupsObj: Record<string, number> = {};
  filtered.forEach(c => {
    if (c.data?.bairro) {
      const b = c.data.bairro.toUpperCase();
      bairroGroupsObj[b] = (bairroGroupsObj[b] || 0) + 1;
    }
  });
  const hotZones = Object.entries(bairroGroupsObj).filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const hotZoneBairros = new Set(hotZones.map(([b]) => b));

  // Profile summary
  const profileSummary = getProfileSummary(filtered.map(c => ({ cnae_codigo: c.data ? String(c.data.cnae_fiscal) : null })));

  const selectedCompany = selectedCNPJ ? companies.find(c => c.cnpj === selectedCNPJ)?.data ?? null : null;

  // Deduplication: CNPJ > phone > name+city
  const checkDuplicate = async (d: BrasilAPICompany): Promise<boolean> => {
    const cnpjClean = d.cnpj.replace(/\D/g, '');
    const phoneClean = normalizePhone(d.ddd_telefone_1 || d.ddd_telefone_2);
    const nameNorm = normalizeName(d.razao_social);
    const cityNorm = normalizeName(d.municipio);

    // Priority 1: CNPJ
    const { data: byCNPJ } = await supabase.from('leads').select('id').eq('cnpj', cnpjClean).maybeSingle();
    if (byCNPJ) return true;

    // Priority 2: phone
    if (phoneClean) {
      const { data: byPhone } = await supabase.from('leads').select('id').eq('telefone', phoneClean).maybeSingle();
      if (byPhone) return true;
    }

    // Priority 3: name+city similarity (exact normalized match)
    const { data: byName } = await supabase
      .from('leads')
      .select('id, razao_social, cidade')
      .ilike('razao_social', `%${d.razao_social.slice(0, 20)}%`)
      .ilike('cidade', `%${d.municipio}%`)
      .maybeSingle();
    if (byName) return true;

    return false;
  };

  const handleBulkImport = async () => {
    if (!profile) return;
    const toImport = filtered.filter(c => c.selected && c.data);
    if (toImport.length === 0) return;
    setImporting(true);
    let imported = 0;
    let skipped = 0;
    try {
      for (const item of toImport) {
        const d = item.data!;
        const isDup = await checkDuplicate(d);
        if (isDup) { skipped++; continue; }
        const cnpjClean = d.cnpj.replace(/\D/g, '');
        const { error } = await supabase.from('leads').insert({
          cnpj: cnpjClean,
          razao_social: d.razao_social,
          nome_fantasia: d.nome_fantasia,
          telefone: normalizePhone(d.ddd_telefone_1 || d.ddd_telefone_2),
          email: d.email,
          cidade: d.municipio,
          estado: d.uf,
          cnae_codigo: String(d.cnae_fiscal),
          cnae_descricao: d.cnae_fiscal_descricao,
          setor: d.cnae_fiscal_descricao,
          created_by: profile.id,
          assigned_to: profile.id,
          status: 'novo',
          fonte: 'Mineração em Massa',
        });
        if (!error) {
          imported++;
          setImportedCNPJs(prev => new Set([...prev, cnpjClean]));
        }
      }
      toast.success(`${imported} leads importados!${skipped > 0 ? ` ${skipped} duplicatas ignoradas.` : ''}`);
      setCompanies(prev => prev.map(c => c.selected ? { ...c, selected: false } : c));
    } catch (err) {
      console.error('Bulk import error:', err);
      toast.error('Erro durante importação em massa');
    } finally {
      setImporting(false);
    }
  };

  const handleSingleImport = async () => {
    if (!profile || !selectedCompany) return;
    setImportingDetail(true);
    try {
      const isDup = await checkDuplicate(selectedCompany);
      if (isDup) {
        toast.error('Esta empresa já está cadastrada como lead');
        const cnpjClean = selectedCompany.cnpj.replace(/\D/g, '');
        setImportedCNPJs(prev => new Set([...prev, cnpjClean]));
        return;
      }
      const cnpjClean = selectedCompany.cnpj.replace(/\D/g, '');
      const { error } = await supabase.from('leads').insert({
        cnpj: cnpjClean,
        razao_social: selectedCompany.razao_social,
        nome_fantasia: selectedCompany.nome_fantasia,
        telefone: normalizePhone(selectedCompany.ddd_telefone_1 || selectedCompany.ddd_telefone_2),
        email: selectedCompany.email,
        cidade: selectedCompany.municipio,
        estado: selectedCompany.uf,
        cnae_codigo: String(selectedCompany.cnae_fiscal),
        cnae_descricao: selectedCompany.cnae_fiscal_descricao,
        setor: selectedCompany.cnae_fiscal_descricao,
        created_by: profile.id,
        assigned_to: profile.id,
        status: 'novo',
        fonte: 'Mineração em Massa',
      });
      if (error) throw error;
      setImportedCNPJs(prev => new Set([...prev, cnpjClean]));
      toast.success('Lead importado para o funil!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao importar lead');
    } finally {
      setImportingDetail(false);
    }
  };

  const handleStartEmailFlow = () => toast.info('Acesse a aba Automação para configurar o fluxo');

  const handleSendWhatsApp = () => {
    if (!selectedCompany) return;
    const phone = normalizePhone(selectedCompany.ddd_telefone_1 || selectedCompany.ddd_telefone_2);
    if (!phone) return;
    const msg = encodeURIComponent(`Olá! Somos especializados em soluções de transporte e logística. Gostaríamos de apresentar nossos serviços para a ${selectedCompany.nome_fantasia || selectedCompany.razao_social}.`);
    window.open(`https://wa.me/55${phone}?text=${msg}`, '_blank');
  };

  const isImported = selectedCNPJ ? importedCNPJs.has(selectedCNPJ.replace(/\D/g, '')) : false;

  return (
    <Tabs defaultValue="google" className="space-y-4">
      <TabsList>
        <TabsTrigger value="google" className="gap-2">
          <Map className="h-4 w-4" />
          Google Maps
        </TabsTrigger>
        <TabsTrigger value="cnpj" className="gap-2">
          <Pickaxe className="h-4 w-4" />
          Mineração por CNPJ
        </TabsTrigger>
      </TabsList>

      <TabsContent value="google">
        <GoogleMapsSearch />
      </TabsContent>

      <TabsContent value="cnpj" className="space-y-4">
      {/* Upload & Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Pickaxe className="h-5 w-5" />
                Modo Mineração de Leads
              </CardTitle>
              <CardDescription className="mt-1">
                Upload CSV com CNPJs → Enriquecimento automático via Receita Federal → Importação em massa com deduplicação
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Upload CSV / TXT
            </Button>
            {companies.length > 0 && !processing && (
              <Button size="sm" onClick={processQueue}>
                <Play className="h-4 w-4 mr-2" />
                {currentIndex > 0 ? 'Continuar' : 'Iniciar'} Enriquecimento
              </Button>
            )}
            {processing && (
              <Button size="sm" variant="destructive" onClick={() => { abortRef.current = true; }}>
                <Pause className="h-4 w-4 mr-2" />
                Pausar
              </Button>
            )}
            {successCount > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setShowFilters(v => !v)}>
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                Filtros
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {companies.length > 0 && `${companies.length} CNPJs • ${successCount} enriquecidos • ${errorCount} erros`}
            </span>
          </div>

          {companies.length > 0 && (
            <div className="space-y-1">
              <Progress value={progress} className="h-1.5" />
              <p className="text-xs text-muted-foreground">{progress}% concluído — intervalo de 2s entre consultas</p>
            </div>
          )}

          {companies.length === 0 && (
            <p className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-3">
              💡 <strong>Dica:</strong> Use o <a href="https://www.econodata.com.br" target="_blank" rel="noopener noreferrer" className="underline">Econodata</a> ou <a href="https://casadosdados.com.br" target="_blank" rel="noopener noreferrer" className="underline">Casa dos Dados</a> para exportar CNPJs por CNAE e região, então faça upload aqui.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      {showFilters && successCount > 0 && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Select value={filterNiche} onValueChange={setFilterNiche}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nicho" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os nichos</SelectItem>
                  {NICHE_FILTERS.map(n => <SelectItem key={n.label} value={n.label}>{n.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterUF} onValueChange={setFilterUF}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os estados</SelectItem>
                  {UF_OPTIONS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input className="h-8 text-xs" placeholder="Cidade..." value={filterCidade} onChange={e => setFilterCidade(e.target.value)} />
              <Input className="h-8 text-xs" placeholder="Bairro..." value={filterBairro} onChange={e => setFilterBairro(e.target.value)} />
              <Select value={filterPorte} onValueChange={setFilterPorte}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Porte" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os portes</SelectItem>
                  {PORTE_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profile summary + Hot zones */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          {Object.entries(profileSummary).map(([id, count]) => {
            const prof = CARGO_PROFILES.find(p => p.id === id);
            if (!prof) return null;
            return (
              <Badge key={id} variant="secondary" className="gap-1 text-xs">
                <Layers className="h-3 w-3" />
                {prof.label}: {count}
              </Badge>
            );
          })}
          {hotZones.slice(0, 5).map(([bairro, count]) => (
            <Badge
              key={bairro}
              variant="outline"
              className="gap-1 text-xs cursor-pointer border-warning/50 text-warning-foreground"
              onClick={() => setFilterBairro(bairro)}
            >
              <MapPin className="h-3 w-3" />
              🔥 {bairro} ({count})
            </Badge>
          ))}
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} empresas</span>
        </div>
      )}

      {/* Split-screen: List + Detail */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
          {/* Left: List */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-2 px-3 pt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedCount > 0 && selectedCount === filtered.length}
                    onCheckedChange={(checked) => selectAllFiltered(!!checked)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {selectedCount > 0 ? `${selectedCount} selecionados` : 'Selecionar todos'}
                  </span>
                </div>
                {selectedCount > 0 && (
                  <Button size="sm" onClick={handleBulkImport} disabled={importing}>
                    {importing ? (
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
              {filtered.map(c => (
                <MiningLeadRow
                  key={c.cnpj}
                  company={c.data!}
                  cnpj={c.cnpj}
                  selected={c.selected}
                  isActive={c.data?.situacao_cadastral === 2}
                  hotZoneBairros={hotZoneBairros}
                  onToggle={() => toggleSelect(c.cnpj)}
                  onClick={() => setSelectedCNPJ(c.cnpj === selectedCNPJ ? null : c.cnpj)}
                  isHighlighted={c.cnpj === selectedCNPJ}
                />
              ))}
            </div>
          </Card>

          {/* Right: Detail */}
          <div className="lg:sticky lg:top-4">
            {selectedCompany ? (
              <Card className="overflow-hidden">
                <LeadDetailPanel
                  company={selectedCompany}
                  onImport={handleSingleImport}
                  importing={importingDetail}
                  alreadyImported={isImported}
                  onStartEmailFlow={isImported ? handleStartEmailFlow : undefined}
                  onSendWhatsApp={isImported ? handleSendWhatsApp : undefined}
                />
              </Card>
            ) : (
              <Card className="flex flex-col items-center justify-center p-8 text-center min-h-[200px] border-dashed">
                <Filter className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">Selecione uma empresa da lista para ver os detalhes</p>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Processing queue */}
      {companies.length > 0 && companies.some(c => c.status !== 'success') && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Fila de Processamento</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {companies.filter(c => c.status !== 'success').map(c => (
                <div key={c.cnpj} className="flex items-center gap-3 text-xs py-1">
                  <span className="font-mono w-36 shrink-0 text-muted-foreground">{c.cnpj}</span>
                  {c.status === 'pending' && <Badge variant="outline" className="text-xs py-0">Aguardando</Badge>}
                  {c.status === 'loading' && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                  {c.status === 'error' && (
                    <Badge variant="destructive" className="text-xs py-0 gap-1">
                      <AlertTriangle className="h-2.5 w-2.5" /> {c.error}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      </TabsContent>
    </Tabs>
  );
}
