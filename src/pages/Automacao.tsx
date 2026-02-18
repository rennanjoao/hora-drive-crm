import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';
import { Loader2, Plus, Mail, Send, Eye, MessageSquare, ArrowRight, Trash2, Play, Pause, BarChart3, Settings, User, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';


interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_by: string;
  created_at: string;
}

interface EmailStep {
  id: string;
  campaign_id: string;
  step_order: number;
  subject: string;
  body_html: string;
  delay_days: number;
  step_type: string;
  condition_type: string | null;
  condition_ref_step_id: string | null;
}

interface EmailSend {
  id: string;
  campaign_id: string;
  step_id: string;
  lead_id: string;
  sdr_id: string;
  tracking_id: string;
  status: string;
  sent_at: string | null;
  open_count: number;
  last_opened_at: string | null;
  replied: boolean;
  replied_at: string | null;
}

interface Lead {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  email: string | null;
}

export default function Automacao() {
  const { profile, isAdmin } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [steps, setSteps] = useState<EmailStep[]>([]);
  const [sends, setSends] = useState<EmailSend[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [addStepOpen, setAddStepOpen] = useState(false);

  // Sender settings
  const [selectedSender, setSelectedSender] = useState<'felipe' | 'mabile' | 'sistema'>('sistema');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [newCampaign, setNewCampaign] = useState({ name: '', description: '' });
  const [newStep, setNewStep] = useState({
    subject: '',
    body_html: '',
    delay_days: 0,
    step_type: 'initial',
    condition_type: '',
  });

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLeads = async () => {
    const { data } = await supabase.from('leads').select('id, razao_social, nome_fantasia, email');
    setLeads(data || []);
  };

  useEffect(() => {
    fetchCampaigns();
    fetchLeads();
  }, []);

  const createCampaign = async () => {
    if (!profile || !newCampaign.name.trim()) return;
    try {
      const { error } = await supabase.from('email_campaigns').insert({
        name: newCampaign.name,
        description: newCampaign.description || null,
        created_by: profile.id,
      } as any);
      if (error) throw error;
      toast.success('Campanha criada!');
      setCreateOpen(false);
      setNewCampaign({ name: '', description: '' });
      fetchCampaigns();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao criar campanha');
    }
  };

  const openCampaignDetails = async (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    try {
      const [stepsRes, sendsRes] = await Promise.all([
        supabase.from('email_steps').select('*').eq('campaign_id', campaign.id).order('step_order'),
        supabase.from('email_sends').select('*').eq('campaign_id', campaign.id),
      ]);
      setSteps((stepsRes.data as EmailStep[]) || []);
      setSends((sendsRes.data as EmailSend[]) || []);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const addStep = async () => {
    if (!selectedCampaign || !newStep.subject.trim()) return;
    try {
      const nextOrder = steps.length + 1;
      const { error } = await supabase.from('email_steps').insert({
        campaign_id: selectedCampaign.id,
        step_order: nextOrder,
        subject: newStep.subject,
        body_html: newStep.body_html,
        delay_days: newStep.delay_days,
        step_type: newStep.step_type,
        condition_type: newStep.condition_type || null,
      } as any);
      if (error) throw error;
      toast.success('Etapa adicionada!');
      setAddStepOpen(false);
      setNewStep({ subject: '', body_html: '', delay_days: 0, step_type: 'initial', condition_type: '' });
      openCampaignDetails(selectedCampaign);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao adicionar etapa');
    }
  };

  const deleteCampaign = async (id: string) => {
    try {
      const { error } = await supabase.from('email_campaigns').delete().eq('id', id);
      if (error) throw error;
      setCampaigns(prev => prev.filter(c => c.id !== id));
      if (selectedCampaign?.id === id) setSelectedCampaign(null);
      toast.success('Campanha removida');
    } catch (error) {
      toast.error('Erro ao deletar campanha');
    }
  };

  const toggleCampaignStatus = async (campaign: Campaign) => {
    const newStatus = campaign.status === 'ativa' ? 'pausada' : 'ativa';
    try {
      const { error } = await supabase
        .from('email_campaigns')
        .update({ status: newStatus })
        .eq('id', campaign.id);
      if (error) throw error;
      setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: newStatus } : c));
      toast.success(`Campanha ${newStatus === 'ativa' ? 'ativada' : 'pausada'}`);
    } catch (error) {
      toast.error('Erro ao atualizar status');
    }
  };

  // Metrics
  const totalSent = sends.filter(s => s.status === 'enviado').length;
  const totalOpened = sends.filter(s => s.open_count > 0).length;
  const totalReplied = sends.filter(s => s.replied).length;
  const hotLeads = sends.filter(s => s.open_count >= 5).length;

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      rascunho: { label: 'Rascunho', variant: 'secondary' },
      ativa: { label: 'Ativa', variant: 'default' },
      pausada: { label: 'Pausada', variant: 'outline' },
      concluida: { label: 'Concluída', variant: 'secondary' },
    };
    const v = map[status] || map.rascunho;
    return <Badge variant={v.variant}>{v.label}</Badge>;
  };

  const getConditionLabel = (type: string | null) => {
    const map: Record<string, string> = {
      opened: 'Se abriu o e-mail anterior',
      not_opened: 'Se NÃO abriu o e-mail anterior',
      replied: 'Se respondeu ao e-mail',
    };
    return type ? map[type] || type : 'Sem condição';
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Automação de E-mails</h1>
            <p className="text-muted-foreground mt-1">Crie fluxos de cadência e acompanhe métricas</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Campanha
          </Button>
        </div>

        <Tabs defaultValue="campaigns">
          <TabsList>
            <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
            <TabsTrigger value="metrics">Métricas</TabsTrigger>
            <TabsTrigger value="configuracoes" className="gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              Configurações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="space-y-4">
            {/* Campaign List */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {campaigns.map(campaign => (
                <Card
                  key={campaign.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => openCampaignDetails(campaign)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{campaign.name}</CardTitle>
                      {getStatusBadge(campaign.status)}
                    </div>
                    <CardDescription className="line-clamp-2">
                      {campaign.description || 'Sem descrição'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Criada em {format(new Date(campaign.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                      </p>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); toggleCampaignStatus(campaign); }}
                        >
                          {campaign.status === 'ativa' ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={(e) => { e.stopPropagation(); deleteCampaign(campaign.id); }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {campaigns.length === 0 && (
                <div className="col-span-full py-12 text-center text-muted-foreground">
                  Nenhuma campanha criada ainda
                </div>
              )}
            </div>

            {/* Campaign Details */}
            {selectedCampaign && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Fluxo: {selectedCampaign.name}</CardTitle>
                      <CardDescription>Configure as etapas do fluxo de cadência</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => setAddStepOpen(true)}>
                      <Plus className="h-4 w-4 mr-1" />
                      Adicionar Etapa
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {steps.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                      Nenhuma etapa configurada. Adicione a primeira etapa do fluxo.
                    </div>
                  ) : (
                    <Accordion type="single" collapsible className="w-full">
                      {steps.map((step, index) => (
                        <AccordionItem key={step.id} value={step.id}>
                          <AccordionTrigger>
                            <div className="flex items-center gap-3 text-left">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                                {step.step_order}
                              </div>
                              <div>
                                <p className="font-medium">{step.subject}</p>
                                <p className="text-xs text-muted-foreground">
                                  {step.delay_days > 0 ? `Aguardar ${step.delay_days} dia(s)` : 'Enviar imediatamente'}
                                  {step.condition_type && ` • ${getConditionLabel(step.condition_type)}`}
                                </p>
                              </div>
                              {index < steps.length - 1 && (
                                <ArrowRight className="h-4 w-4 text-muted-foreground ml-2" />
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3 pl-11">
                              <div>
                                <Label className="text-xs text-muted-foreground">Assunto</Label>
                                <p className="text-sm font-medium">{step.subject}</p>
                              </div>
                              {step.condition_type && (
                                <div className="rounded-lg bg-muted/50 p-3">
                                  <p className="text-sm font-medium">
                                    🔀 Condição: {getConditionLabel(step.condition_type)}
                                  </p>
                                </div>
                              )}
                              <div>
                                <Label className="text-xs text-muted-foreground">Conteúdo</Label>
                                <div className="mt-1 rounded-lg border p-3 text-sm bg-card" dangerouslySetInnerHTML={{ __html: step.body_html }} />
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="metrics" className="space-y-4">
            {/* Metric Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="metric-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Send className="h-4 w-4" /> Enviados
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{totalSent}</div>
                </CardContent>
              </Card>
              <Card className="metric-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Eye className="h-4 w-4" /> Abertos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{totalOpened}</div>
                  <p className="text-xs text-muted-foreground">{totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : 0}% taxa de abertura</p>
                </CardContent>
              </Card>
              <Card className="metric-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" /> Respondidos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{totalReplied}</div>
                </CardContent>
              </Card>
              <Card className="metric-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Leads Quentes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-amber-500">{hotLeads}</div>
                  <p className="text-xs text-muted-foreground">5+ aberturas</p>
                </CardContent>
              </Card>
            </div>

            {/* Leads Metrics Table */}
            <Card>
              <CardHeader>
                <CardTitle>Métricas por Lead</CardTitle>
                <CardDescription>Acompanhamento detalhado de engajamento</CardDescription>
              </CardHeader>
              <CardContent>
                {sends.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    Nenhum e-mail enviado ainda. Ative uma campanha para começar.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead</TableHead>
                        <TableHead>Enviados</TableHead>
                        <TableHead>Aberturas</TableHead>
                        <TableHead>Respondido</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const leadSends: Record<string, { sent: number; opens: number; replied: boolean; maxOpens: number }> = {};
                        sends.forEach(s => {
                          if (!leadSends[s.lead_id]) leadSends[s.lead_id] = { sent: 0, opens: 0, replied: false, maxOpens: 0 };
                          if (s.status === 'enviado') leadSends[s.lead_id].sent++;
                          leadSends[s.lead_id].opens += s.open_count;
                          if (s.open_count > leadSends[s.lead_id].maxOpens) leadSends[s.lead_id].maxOpens = s.open_count;
                          if (s.replied) leadSends[s.lead_id].replied = true;
                        });

                        return Object.entries(leadSends)
                          .sort(([, a], [, b]) => b.opens - a.opens)
                          .map(([leadId, data]) => {
                            const lead = leads.find(l => l.id === leadId);
                            return (
                              <TableRow key={leadId}>
                                <TableCell className="font-medium">{lead?.nome_fantasia || lead?.razao_social || leadId}</TableCell>
                                <TableCell>{data.sent}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {data.opens}x
                                    {data.maxOpens >= 5 && <Badge className="bg-amber-500 text-white">🔥 Quente</Badge>}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {data.replied ? <Badge variant="default">✓ Sim</Badge> : <span className="text-muted-foreground">Não</span>}
                                </TableCell>
                                <TableCell>
                                  {data.replied ? (
                                    <Badge variant="default">Respondeu</Badge>
                                  ) : data.maxOpens >= 5 ? (
                                    <Badge className="bg-amber-500 text-white">Interessado</Badge>
                                  ) : data.opens > 0 ? (
                                    <Badge variant="outline">Abriu</Badge>
                                  ) : (
                                    <Badge variant="secondary">Aguardando</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          });
                      })()}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Configurações de Remetente */}
          <TabsContent value="configuracoes" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-5 w-5" />
                  Remetente dos E-mails
                </CardTitle>
                <CardDescription>
                  Escolha qual nome aparecerá como remetente nas campanhas de e-mail enviadas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { value: 'felipe', label: 'Felipe', desc: 'Felipe — Na Hora Transporte' },
                    { value: 'mabile', label: 'Mabile', desc: 'Mabile — Na Hora Transporte' },
                    { value: 'sistema', label: 'Sistema', desc: 'Na Hora Transporte (padrão)' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setSelectedSender(opt.value as any); setSettingsSaved(false); }}
                      className={`rounded-lg border-2 p-4 text-left transition-all ${
                        selectedSender === opt.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          selectedSender === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}>
                          {opt.label[0]}
                        </div>
                        <span className="font-medium text-sm">{opt.label}</span>
                        {selectedSender === opt.value && (
                          <CheckCircle className="h-4 w-4 text-primary ml-auto" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </button>
                  ))}
                </div>

                <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-1">
                  <p className="font-medium">Como funciona</p>
                  <p className="text-muted-foreground text-xs">
                    O remetente selecionado será usado em todas as campanhas enviadas por você.
                    O endereço de e-mail real é definido na sua conta Resend (domínio verificado).
                    Você pode sobrescrever isso por campanha individualmente.
                  </p>
                </div>

                <Button
                  onClick={async () => {
                    if (!profile) return;
                    setSavingSettings(true);
                    try {
                      await supabase.from('api_settings').upsert({
                        user_id: profile.user_id,
                        email_remetente_padrao: selectedSender,
                        updated_at: new Date().toISOString(),
                      }, { onConflict: 'user_id' });
                      setSettingsSaved(true);
                      toast.success(`Remetente "${selectedSender}" salvo com sucesso!`);
                    } catch (err) {
                      toast.error('Erro ao salvar configuração');
                    } finally {
                      setSavingSettings(false);
                    }
                  }}
                  disabled={savingSettings}
                >
                  {savingSettings ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
                  ) : settingsSaved ? (
                    <><CheckCircle className="h-4 w-4 mr-2" />Salvo!</>
                  ) : (
                    'Salvar Configuração'
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Create Campaign Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Campanha de E-mail</DialogTitle>
              <DialogDescription>Crie uma sequência de e-mails automatizada</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Nome da Campanha</Label>
                <Input
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  placeholder="Ex: Cadência Transportadoras Q1"
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={newCampaign.description}
                  onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
                  placeholder="Objetivo da campanha..."
                />
              </div>
              <Button onClick={createCampaign} className="w-full" disabled={!newCampaign.name.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Campanha
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Step Dialog */}
        <Dialog open={addStepOpen} onOpenChange={setAddStepOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Adicionar Etapa ao Fluxo</DialogTitle>
              <DialogDescription>Configure o e-mail e as condições desta etapa</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Assunto do E-mail</Label>
                <Input
                  value={newStep.subject}
                  onChange={(e) => setNewStep({ ...newStep, subject: e.target.value })}
                  placeholder="Ex: Proposta para otimizar sua logística"
                />
              </div>
              <div className="space-y-2">
                <Label>Conteúdo (HTML)</Label>
                <Textarea
                  value={newStep.body_html}
                  onChange={(e) => setNewStep({ ...newStep, body_html: e.target.value })}
                  placeholder="<p>Olá {{nome}},</p><p>Gostaria de apresentar...</p>"
                  rows={6}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Aguardar (dias)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={newStep.delay_days}
                    onChange={(e) => setNewStep({ ...newStep, delay_days: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Condição</Label>
                  <Select value={newStep.condition_type} onValueChange={(v) => setNewStep({ ...newStep, condition_type: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sem condição" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem condição</SelectItem>
                      <SelectItem value="opened">Se abriu o anterior</SelectItem>
                      <SelectItem value="not_opened">Se NÃO abriu o anterior</SelectItem>
                      <SelectItem value="replied">Se respondeu</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">💡 Dica de Fluxo</p>
                <p>• <strong>Condição A:</strong> Se abriu → Move lead para "Interessado" e envia próximo e-mail após X dias</p>
                <p>• <strong>Condição B:</strong> Se NÃO abriu → Envia e-mail de reengajamento</p>
                <p>• <strong>Condição C:</strong> Se respondeu → Para o fluxo e notifica o SDR</p>
              </div>
              <Button onClick={addStep} className="w-full" disabled={!newStep.subject.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Etapa
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
