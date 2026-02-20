import { useEffect, useState, useCallback } from 'react';
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
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Loader2, Plus, Mail, Send, Eye, MessageSquare, ArrowRight, Trash2,
  Play, Pause, BarChart3, User, CheckCircle, Tag, Search, List,
  FileText, GitBranch, AlertTriangle, Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Types ────────────────────────────────────────────────────────────────────
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
  status_automacao: string | null;
}

// ─── Email validation ──────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(v: string) { return EMAIL_RE.test(v.trim()); }

// ─── Template variables ────────────────────────────────────────────────────────
const TEMPLATE_VARS = [
  { label: '{{nome_empresa}}', desc: 'Nome da empresa/lead' },
  { label: '{{nome_remetente}}', desc: 'Nome do remetente configurado' },
  { label: '{{email_remetente}}', desc: 'E-mail do remetente' },
  { label: '{{cidade}}', desc: 'Cidade do lead' },
  { label: '{{telefone}}', desc: 'Telefone do lead' },
];

// ─── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    rascunho: { label: 'Rascunho', variant: 'secondary' },
    ativa: { label: 'Ativa', variant: 'default' },
    pausada: { label: 'Pausada', variant: 'outline' },
    concluida: { label: 'Concluída', variant: 'secondary' },
  };
  const v = map[status] ?? map.rascunho;
  return <Badge variant={v.variant}>{v.label}</Badge>;
}

// ─── Condition label ───────────────────────────────────────────────────────────
function condLabel(type: string | null) {
  const map: Record<string, string> = {
    opened: 'Se abriu o e-mail anterior',
    not_opened: 'Se NÃO abriu o e-mail anterior',
    replied: 'Se respondeu ao e-mail',
  };
  return type ? map[type] || type : 'Sem condição';
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function Automacao() {
  const { profile } = useAuth();

  // ── Global data ────────────────────────────────────────────────────────────
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);

  // ── Campaign/Step details (Fluxos tab) ────────────────────────────────────
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [steps, setSteps] = useState<EmailStep[]>([]);
  const [sends, setSends] = useState<EmailSend[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [addStepOpen, setAddStepOpen] = useState(false);

  // ── Sender settings (Listas tab) ──────────────────────────────────────────
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // ── Lista tab state ────────────────────────────────────────────────────────
  const [automationTag, setAutomationTag] = useState('');
  const [tagLeads, setTagLeads] = useState<Lead[]>([]);
  const [loadingTagLeads, setLoadingTagLeads] = useState(false);
  const [dispatchingTag, setDispatchingTag] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');

  // ── Templates tab ─────────────────────────────────────────────────────────
  const [templateName, setTemplateName] = useState('');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [templates, setTemplates] = useState<{ id: string; name: string; subject: string; body: string }[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // ── New campaign / step forms ──────────────────────────────────────────────
  const [newCampaign, setNewCampaign] = useState({ name: '', description: '' });
  const [newStep, setNewStep] = useState({
    subject: '', body_html: '', delay_days: 0,
    step_type: 'initial', condition_type: '',
  });

  // ── Fetch helpers ──────────────────────────────────────────────────────────
  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_campaigns').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setCampaigns(data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLeads = useCallback(async () => {
    const { data } = await supabase
      .from('leads').select('id, razao_social, nome_fantasia, email, status_automacao');
    setLeads(data || []);
  }, []);

  const fetchTemplates = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('email_templates').select('*').order('created_at', { ascending: false });
    setTemplates((data || []) as any);
  }, [profile]);

  const fetchSenderSettings = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('api_settings').select('email_remetente_padrao').eq('user_id', profile.user_id).maybeSingle();
    if (data?.email_remetente_padrao) {
      // Format: "Nome|email@dom.com"
      const [name, email] = data.email_remetente_padrao.split('|');
      setFromName(name || '');
      setFromEmail(email || '');
    }
  }, [profile]);

  const fetchTagLeads = useCallback(async (tag: string) => {
    if (!tag.trim()) { setTagLeads([]); return; }
    setLoadingTagLeads(true);
    const { data } = await supabase
      .from('leads').select('id, razao_social, nome_fantasia, email, status_automacao')
      .eq('status_automacao', tag.trim());
    setTagLeads(data || []);
    setLoadingTagLeads(false);
  }, []);

  useEffect(() => {
    fetchCampaigns();
    fetchLeads();
    fetchTemplates();
    fetchSenderSettings();
  }, [fetchCampaigns, fetchLeads, fetchTemplates, fetchSenderSettings]);

  const openCampaignDetails = async (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    const [stepsRes, sendsRes] = await Promise.all([
      supabase.from('email_steps').select('*').eq('campaign_id', campaign.id).order('step_order'),
      supabase.from('email_sends').select('*').eq('campaign_id', campaign.id),
    ]);
    setSteps((stepsRes.data as EmailStep[]) || []);
    setSends((sendsRes.data as EmailSend[]) || []);
  };

  // ── Campaigns CRUD ─────────────────────────────────────────────────────────
  const createCampaign = async () => {
    if (!profile || !newCampaign.name.trim()) return;
    const { error } = await supabase.from('email_campaigns').insert({
      name: newCampaign.name,
      description: newCampaign.description || null,
      created_by: profile.id,
    } as any);
    if (error) { toast.error('Erro ao criar campanha'); return; }
    toast.success('Campanha criada!');
    setCreateOpen(false);
    setNewCampaign({ name: '', description: '' });
    fetchCampaigns();
  };

  const deleteCampaign = async (id: string) => {
    const { error } = await supabase.from('email_campaigns').delete().eq('id', id);
    if (error) { toast.error('Erro ao deletar campanha'); return; }
    setCampaigns(prev => prev.filter(c => c.id !== id));
    if (selectedCampaign?.id === id) setSelectedCampaign(null);
    toast.success('Campanha removida');
  };

  const toggleCampaignStatus = async (campaign: Campaign) => {
    const newStatus = campaign.status === 'ativa' ? 'pausada' : 'ativa';
    const { error } = await supabase.from('email_campaigns')
      .update({ status: newStatus }).eq('id', campaign.id);
    if (error) { toast.error('Erro ao atualizar status'); return; }
    setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: newStatus } : c));
    toast.success(`Campanha ${newStatus === 'ativa' ? 'ativada' : 'pausada'}`);
  };

  // ── Steps ──────────────────────────────────────────────────────────────────
  const addStep = async () => {
    if (!selectedCampaign || !newStep.subject.trim()) return;
    const { error } = await supabase.from('email_steps').insert({
      campaign_id: selectedCampaign.id,
      step_order: steps.length + 1,
      subject: newStep.subject,
      body_html: newStep.body_html,
      delay_days: newStep.delay_days,
      step_type: newStep.step_type,
      condition_type: newStep.condition_type || null,
    } as any);
    if (error) { toast.error('Erro ao adicionar etapa'); return; }
    toast.success('Etapa adicionada!');
    setAddStepOpen(false);
    setNewStep({ subject: '', body_html: '', delay_days: 0, step_type: 'initial', condition_type: '' });
    openCampaignDetails(selectedCampaign);
  };

  // ── Sender settings save ───────────────────────────────────────────────────
  const saveSenderSettings = async () => {
    if (!profile) return;
    if (!fromName.trim()) { toast.error('Informe o nome do remetente'); return; }
    if (!isValidEmail(fromEmail)) { toast.error('E-mail do remetente inválido'); return; }
    setSavingSettings(true);
    try {
      await supabase.from('api_settings').upsert({
        user_id: profile.user_id,
        // store as "Name|email" in the existing text column
        email_remetente_padrao: `${fromName.trim()}|${fromEmail.trim()}`,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      setSettingsSaved(true);
      toast.success('Configuração de remetente salva!');
    } catch {
      toast.error('Erro ao salvar configuração');
    } finally {
      setSavingSettings(false);
    }
  };

  // ── Templates CRUD ─────────────────────────────────────────────────────────
  const saveTemplate = async () => {
    if (!profile || !templateName.trim() || !templateSubject.trim()) return;
    setSavingTemplate(true);
    try {
      await supabase.from('email_templates').insert({
        user_id: profile.user_id,
        name: templateName.trim(),
        subject: templateSubject.trim(),
        body: templateBody,
      } as any);
      toast.success('Template salvo!');
      setTemplateName('');
      setTemplateSubject('');
      setTemplateBody('');
      fetchTemplates();
    } catch {
      toast.error('Erro ao salvar template');
    } finally {
      setSavingTemplate(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    await supabase.from('email_templates').delete().eq('id', id);
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast.success('Template removido');
  };

  // ── Dispatch by tag ────────────────────────────────────────────────────────
  const dispatchToTag = async () => {
    if (!profile || !automationTag.trim() || !selectedCampaignId) {
      toast.error('Selecione uma campanha e informe a tag');
      return;
    }
    const validLeads = tagLeads.filter(l => l.email && isValidEmail(l.email));
    if (validLeads.length === 0) {
      toast.error('Nenhum lead com e-mail válido nesta lista');
      return;
    }
    if (!fromName.trim() || !isValidEmail(fromEmail)) {
      toast.error('Configure o remetente antes de disparar');
      return;
    }

    // Fetch campaign steps
    const { data: campaignSteps } = await supabase
      .from('email_steps').select('*').eq('campaign_id', selectedCampaignId).order('step_order');
    if (!campaignSteps?.length) { toast.error('A campanha não tem etapas configuradas'); return; }

    const firstStep = campaignSteps[0] as EmailStep;
    setDispatchingTag(true);

    let sent = 0; let skipped = 0; let errors = 0;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    try {
      for (const lead of validLeads) {
        // Skip if already replied or opened many times (smart pause)
        const { data: existingSend } = await supabase
          .from('email_sends').select('replied, open_count')
          .eq('lead_id', lead.id).eq('campaign_id', selectedCampaignId).maybeSingle();
        if (existingSend?.replied) { skipped++; continue; }

        // Replace template variables
        const resolvedSubject = firstStep.subject
          .replace(/{{nome_empresa}}/g, lead.nome_fantasia || lead.razao_social)
          .replace(/{{nome_remetente}}/g, fromName)
          .replace(/{{email_remetente}}/g, fromEmail);
        const resolvedBody = firstStep.body_html
          .replace(/{{nome_empresa}}/g, lead.nome_fantasia || lead.razao_social)
          .replace(/{{nome_remetente}}/g, fromName)
          .replace(/{{email_remetente}}/g, fromEmail);

        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': anonKey,
              'Authorization': `Bearer ${anonKey}`,
            },
            body: JSON.stringify({
              campaign_id: selectedCampaignId,
              step_id: firstStep.id,
              lead_id: lead.id,
              sdr_id: profile.id,
              to_email: lead.email,
              subject: resolvedSubject,
              body_html: resolvedBody,
              from_name: fromName,
              from_email: fromEmail,
            }),
          });
          if (res.ok) sent++;
          else errors++;
        } catch { errors++; }

        // Anti-spam jitter
        await new Promise(r => setTimeout(r, 30000 + Math.random() * 60000));
      }
      toast.success(`Disparado: ${sent} enviados, ${skipped} pausados (responderam), ${errors} erros`);
      fetchLeads();
    } finally {
      setDispatchingTag(false);
    }
  };

  // ── Metrics ────────────────────────────────────────────────────────────────
  const totalSent = sends.filter(s => s.status === 'enviado').length;
  const totalOpened = sends.filter(s => s.open_count > 0).length;
  const totalReplied = sends.filter(s => s.replied).length;
  const hotLeads = sends.filter(s => s.open_count >= 5).length;

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
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Automação de E-mails</h1>
            <p className="text-muted-foreground mt-1">Gerencie listas, templates e fluxos de cadência</p>
          </div>
        </div>

        {/* 3 main tabs */}
        <Tabs defaultValue="listas" className="space-y-4">
          <TabsList className="w-full max-w-md">
            <TabsTrigger value="listas" className="flex-1 gap-1.5">
              <List className="h-4 w-4" /> Listas
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex-1 gap-1.5">
              <FileText className="h-4 w-4" /> Templates
            </TabsTrigger>
            <TabsTrigger value="fluxos" className="flex-1 gap-1.5">
              <GitBranch className="h-4 w-4" /> Fluxos
            </TabsTrigger>
          </TabsList>

          {/* ══════════════════════════════════════════════════════════════════
              TAB: LISTAS
          ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="listas" className="space-y-4">
            {/* Sender configuration */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-5 w-5" />
                  Configuração do Remetente
                </CardTitle>
                <CardDescription>
                  Defina o nome e o e-mail usado em todos os disparos desta conta
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Nome do Remetente</Label>
                    <Input
                      placeholder="ex: João Silva"
                      value={fromName}
                      onChange={e => { setFromName(e.target.value); setSettingsSaved(false); }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm flex items-center gap-1.5">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      E-mail de Disparo
                    </Label>
                    <Input
                      type="email"
                      placeholder="ex: vendas@suaempresa.com.br"
                      value={fromEmail}
                      onChange={e => { setFromEmail(e.target.value); setSettingsSaved(false); }}
                      className={fromEmail && !isValidEmail(fromEmail) ? 'border-destructive' : ''}
                    />
                    {fromEmail && !isValidEmail(fromEmail) && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> E-mail inválido
                      </p>
                    )}
                  </div>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                  O e-mail deve estar verificado na sua conta Resend para garantir entregabilidade.
                  O campo <code>nome_remetente</code> e <code>email_remetente</code> também funcionam como variáveis nos templates.
                </div>
                <Button onClick={saveSenderSettings} disabled={savingSettings}>
                  {savingSettings ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
                  ) : settingsSaved ? (
                    <><CheckCircle className="h-4 w-4 mr-2 text-accent" />Salvo!</>
                  ) : (
                    'Salvar Configuração'
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Tag list + dispatch */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Tag className="h-5 w-5" />
                  Lista de Disparo por Tag
                </CardTitle>
                <CardDescription>
                  Busque leads pela <code>automation_tag</code> e dispare uma campanha para eles
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs">Tag de Automação</Label>
                    <Input
                      placeholder="ex: supermercados-sp, prospectos-novembro..."
                      value={automationTag}
                      onChange={e => setAutomationTag(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && fetchTagLeads(automationTag)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      onClick={() => fetchTagLeads(automationTag)}
                      disabled={!automationTag.trim() || loadingTagLeads}
                    >
                      {loadingTagLeads ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {tagLeads.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        <strong>{tagLeads.length}</strong> lead(s) com a tag "<strong>{automationTag}</strong>"
                        {' · '}
                        <span className="text-accent">{tagLeads.filter(l => l.email).length} com e-mail</span>
                        {tagLeads.some(l => !l.email) && (
                          <span className="text-destructive"> · {tagLeads.filter(l => !l.email).length} sem e-mail (serão ignorados)</span>
                        )}
                      </p>
                    </div>

                    <div className="max-h-52 overflow-y-auto rounded-lg border divide-y">
                      {tagLeads.map(lead => (
                        <div key={lead.id} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span className="font-medium truncate">{lead.nome_fantasia || lead.razao_social}</span>
                          {lead.email
                            ? <span className="text-xs text-muted-foreground shrink-0">{lead.email}</span>
                            : <span className="text-xs text-destructive shrink-0 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Sem e-mail</span>
                          }
                        </div>
                      ))}
                    </div>

                    <Separator />

                    {/* Campaign selector + dispatch */}
                    <div className="space-y-2">
                      <Label className="text-xs">Campanha para Disparar</Label>
                      <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma campanha..." />
                        </SelectTrigger>
                        <SelectContent>
                          {campaigns.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      className="w-full gap-2"
                      onClick={dispatchToTag}
                      disabled={dispatchingTag || !selectedCampaignId || tagLeads.filter(l => l.email).length === 0}
                    >
                      {dispatchingTag ? (
                        <><Loader2 className="h-4 w-4 animate-spin" />Disparando (aguarde — anti-spam ativo)...</>
                      ) : (
                        <><Send className="h-4 w-4" />Disparar para {tagLeads.filter(l => l.email).length} lead(s) com e-mail</>
                      )}
                    </Button>

                    <p className="text-xs text-muted-foreground">
                      ⚠️ Leads que já responderam terão o disparo pausado automaticamente.
                      O envio usa um intervalo de 30–90 segundos entre cada e-mail para evitar bloqueio de spam.
                    </p>
                  </div>
                )}

                {tagLeads.length === 0 && automationTag && !loadingTagLeads && (
                  <p className="text-xs text-muted-foreground">
                    Nenhum lead com a tag "<strong>{automationTag}</strong>".
                    Atribua a tag em Prospecção (botão "Gerar Lista") ou em Leads → editar lead.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Quick metrics */}
            <div className="grid gap-4 md:grid-cols-4">
              {[
                { icon: Send, label: 'Enviados', value: sends.filter(s => s.status === 'enviado').length, hot: false },
                { icon: Eye, label: 'Abertos', value: sends.filter(s => s.open_count > 0).length, hot: false },
                { icon: MessageSquare, label: 'Respondidos', value: sends.filter(s => s.replied).length, hot: false },
                { icon: BarChart3, label: 'Leads Quentes', value: sends.filter(s => s.open_count >= 5).length, hot: true },
              ].map(({ icon: Icon, label, value, hot }) => (
                <Card key={label}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Icon className="h-4 w-4" /> {label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-3xl font-bold ${hot ? 'text-primary' : ''}`}>{value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════
              TAB: TEMPLATES
          ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="templates" className="space-y-4">
            {/* Variable reference */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Variáveis Disponíveis
                </CardTitle>
                <CardDescription>Use estas variáveis nos assuntos e corpos dos e-mails</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_VARS.map(v => (
                    <div key={v.label} className="rounded-md border bg-muted/50 px-2.5 py-1.5 text-xs">
                      <code className="text-primary font-mono">{v.label}</code>
                      <span className="text-muted-foreground ml-2">{v.desc}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Template editor */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Novo Template
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome do Template</Label>
                    <Input
                      placeholder="ex: Apresentação Inicial"
                      value={templateName}
                      onChange={e => setTemplateName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Assunto</Label>
                    <Input
                      placeholder="ex: Proposta para {{nome_empresa}}"
                      value={templateSubject}
                      onChange={e => setTemplateSubject(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Corpo do E-mail (HTML ou Texto)</Label>
                  <Textarea
                    rows={8}
                    placeholder={`<p>Olá, {{nome_empresa}}!</p>\n<p>Meu nome é {{nome_remetente}} e gostaria de apresentar...</p>`}
                    value={templateBody}
                    onChange={e => setTemplateBody(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
                <Button onClick={saveTemplate} disabled={savingTemplate || !templateName.trim() || !templateSubject.trim()}>
                  {savingTemplate ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : 'Salvar Template'}
                </Button>
              </CardContent>
            </Card>

            {/* Saved templates */}
            {templates.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Templates Salvos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {templates.map(t => (
                    <div key={t.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{t.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => {
                            setTemplateName(t.name + ' (cópia)');
                            setTemplateSubject(t.subject);
                            setTemplateBody(t.body);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="text-destructive"
                          onClick={() => deleteTemplate(t.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════
              TAB: FLUXOS
          ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="fluxos" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Construa sequências de e-mail com condições e delays
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Campanha
              </Button>
            </div>

            {/* Campaign Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {campaigns.map(campaign => (
                <Card
                  key={campaign.id}
                  className={`cursor-pointer hover:border-primary/50 transition-colors ${selectedCampaign?.id === campaign.id ? 'border-primary/60 bg-primary/5' : ''}`}
                  onClick={() => openCampaignDetails(campaign)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{campaign.name}</CardTitle>
                      <StatusBadge status={campaign.status} />
                    </div>
                    <CardDescription className="line-clamp-2">
                      {campaign.description || 'Sem descrição'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(campaign.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                      </p>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost"
                          onClick={e => { e.stopPropagation(); toggleCampaignStatus(campaign); }}>
                          {campaign.status === 'ativa' ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive"
                          onClick={e => { e.stopPropagation(); deleteCampaign(campaign.id); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {campaigns.length === 0 && (
                <div className="col-span-full py-12 text-center text-muted-foreground">
                  Nenhuma campanha criada ainda. Crie a primeira acima.
                </div>
              )}
            </div>

            {/* Campaign details + steps */}
            {selectedCampaign && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle>Fluxo: {selectedCampaign.name}</CardTitle>
                      <CardDescription>Configure as etapas do fluxo de cadência</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {/* Metrics inline */}
                      {sends.length > 0 && (
                        <div className="flex gap-3 text-xs text-muted-foreground items-center">
                          <span className="flex items-center gap-1"><Send className="h-3 w-3" />{totalSent}</span>
                          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{totalOpened}</span>
                          <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{totalReplied}</span>
                          {hotLeads > 0 && <Badge variant="secondary" className="text-xs">🔥 {hotLeads} quentes</Badge>}
                        </div>
                      )}
                      <Button size="sm" onClick={() => setAddStepOpen(true)}>
                        <Plus className="h-4 w-4 mr-1" /> Etapa
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {steps.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">
                      Nenhuma etapa configurada. Clique em "Etapa" para adicionar a primeira.
                    </div>
                  ) : (
                    <Accordion type="single" collapsible className="w-full">
                      {steps.map((step, index) => (
                        <AccordionItem key={step.id} value={step.id}>
                          <AccordionTrigger>
                            <div className="flex items-center gap-3 text-left">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                                {step.step_order}
                              </div>
                              <div>
                                <p className="font-medium">{step.subject}</p>
                                <p className="text-xs text-muted-foreground">
                                  {step.delay_days > 0 ? `Aguardar ${step.delay_days} dia(s)` : 'Enviar imediatamente'}
                                  {step.condition_type && ` • ${condLabel(step.condition_type)}`}
                                </p>
                              </div>
                              {index < steps.length - 1 && (
                                <ArrowRight className="h-4 w-4 text-muted-foreground ml-2" />
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3 pl-11">
                              {step.condition_type && step.condition_type !== 'none' && (
                                <div className="rounded-lg bg-muted/50 px-3 py-2">
                                  <p className="text-sm font-medium">🔀 Condição: {condLabel(step.condition_type)}</p>
                                </div>
                              )}
                              <div>
                                <Label className="text-xs text-muted-foreground">Conteúdo do E-mail</Label>
                                <div className="mt-1 rounded-lg border p-3 text-sm bg-card max-h-40 overflow-y-auto"
                                  dangerouslySetInnerHTML={{ __html: step.body_html }} />
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}

                  {/* Lead engagement table */}
                  {sends.length > 0 && (
                    <>
                      <Separator className="my-4" />
                      <p className="text-sm font-medium mb-3">Engajamento por Lead</p>
                      <div className="overflow-x-auto">
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
                              const byLead: Record<string, { sent: number; opens: number; replied: boolean; maxOpens: number }> = {};
                              sends.forEach(s => {
                                if (!byLead[s.lead_id]) byLead[s.lead_id] = { sent: 0, opens: 0, replied: false, maxOpens: 0 };
                                if (s.status === 'enviado') byLead[s.lead_id].sent++;
                                byLead[s.lead_id].opens += s.open_count;
                                if (s.open_count > byLead[s.lead_id].maxOpens) byLead[s.lead_id].maxOpens = s.open_count;
                                if (s.replied) byLead[s.lead_id].replied = true;
                              });
                              return Object.entries(byLead).sort(([, a], [, b]) => b.opens - a.opens).map(([lid, d]) => {
                                const lead = leads.find(l => l.id === lid);
                                return (
                                  <TableRow key={lid}>
                                    <TableCell className="font-medium">{lead?.nome_fantasia || lead?.razao_social || lid}</TableCell>
                                    <TableCell>{d.sent}</TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-2">
                                        {d.opens}x
                                        {d.maxOpens >= 5 && <Badge variant="secondary" className="text-xs">🔥 Quente</Badge>}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      {d.replied ? <Badge>✓ Sim</Badge> : <span className="text-muted-foreground text-xs">Não</span>}
                                    </TableCell>
                                    <TableCell>
                                      {d.replied ? <Badge>Respondeu</Badge>
                                        : d.maxOpens >= 5 ? <Badge variant="secondary" className="text-xs">Interessado</Badge>
                                        : d.opens > 0 ? <Badge variant="outline">Abriu</Badge>
                                        : <Badge variant="secondary">Aguardando</Badge>}
                                    </TableCell>
                                  </TableRow>
                                );
                              });
                            })()}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
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
                  onChange={e => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  placeholder="Ex: Cadência Transportadoras Q1"
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={newCampaign.description}
                  onChange={e => setNewCampaign({ ...newCampaign, description: e.target.value })}
                  placeholder="Objetivo da campanha..."
                />
              </div>
              <Button onClick={createCampaign} className="w-full" disabled={!newCampaign.name.trim()}>
                <Plus className="h-4 w-4 mr-2" /> Criar Campanha
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
                  onChange={e => setNewStep({ ...newStep, subject: e.target.value })}
                  placeholder="Ex: Proposta para {{nome_empresa}}"
                />
              </div>
              <div className="space-y-2">
                <Label>Conteúdo (HTML ou Texto)</Label>
                <Textarea
                  value={newStep.body_html}
                  onChange={e => setNewStep({ ...newStep, body_html: e.target.value })}
                  placeholder={`<p>Olá, {{nome_empresa}}!</p>\n<p>Meu nome é {{nome_remetente}}...</p>`}
                  rows={6}
                  className="font-mono text-xs"
                />
              </div>

              {/* Variable helper */}
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_VARS.map(v => (
                  <button
                    key={v.label}
                    type="button"
                    onClick={() => setNewStep(s => ({ ...s, body_html: s.body_html + v.label }))}
                    className="text-xs px-2 py-0.5 rounded border bg-muted/50 hover:bg-muted font-mono"
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Aguardar (dias)</Label>
                  <Input
                    type="number" min="0"
                    value={newStep.delay_days}
                    onChange={e => setNewStep({ ...newStep, delay_days: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Condição de Envio</Label>
                  <Select value={newStep.condition_type} onValueChange={v => setNewStep({ ...newStep, condition_type: v })}>
                    <SelectTrigger><SelectValue placeholder="Sem condição" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem condição</SelectItem>
                      <SelectItem value="opened">Se abriu o anterior</SelectItem>
                      <SelectItem value="not_opened">Se NÃO abriu</SelectItem>
                      <SelectItem value="replied">Se respondeu → pausa fluxo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">💡 Dica de Fluxo</p>
                <p>• <strong>Se abriu</strong> → Move lead para "Interessado" e envia próximo e-mail</p>
                <p>• <strong>Se NÃO abriu</strong> → Envia e-mail de reengajamento</p>
                <p>• <strong>Se respondeu</strong> → Pausa o fluxo e notifica o SDR no Dashboard</p>
              </div>
              <Button onClick={addStep} className="w-full" disabled={!newStep.subject.trim()}>
                <Plus className="h-4 w-4 mr-2" /> Adicionar Etapa
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
