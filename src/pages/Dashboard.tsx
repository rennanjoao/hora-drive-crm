import { useEffect, useState, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Target, Users, Calendar, CheckCircle, Clock, XCircle, Video,
  ExternalLink, Mail, MailOpen, MessageSquare, X, Sparkles,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

import { format, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

interface Stats {
  totalLeads: number;
  leadsGanhos: number;
  leadsPerdidos: number;
  leadsEmAndamento: number;
  tasksPendentes: number;
  tasksCompletadas: number;
}

interface EmailFunnelData {
  enviados: number;
  abertos: number;
  respondidos: number;
}

interface UpcomingMeeting {
  id: string;
  title: string;
  meeting_date: string;
  jitsi_link: string;
  contact_name: string | null;
  lead_name?: string;
}

interface EmailAlert {
  id: string;
  lead_id: string;
  lead_name: string;
  opened_at: string;
}

const COLORS = [
  'hsl(217, 71%, 23%)',
  'hsl(166, 64%, 42%)',
  'hsl(142, 71%, 45%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)',
];

export default function Dashboard() {
  const { profile, isAdmin, isGerente } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<Stats>({
    totalLeads: 0,
    leadsGanhos: 0,
    leadsPerdidos: 0,
    leadsEmAndamento: 0,
    tasksPendentes: 0,
    tasksCompletadas: 0,
  });
  const [leadsByStatus, setLeadsByStatus] = useState<{ name: string; value: number }[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<UpcomingMeeting[]>([]);
  const [emailFunnel, setEmailFunnel] = useState<EmailFunnelData>({ enviados: 0, abertos: 0, respondidos: 0 });
  const [emailAlerts, setEmailAlerts] = useState<EmailAlert[]>([]);

  // Track which email_send ids we've already alerted to avoid duplicates on reconnect
  const alertedIds = useRef<Set<string>>(new Set());

  // ── Stats fetch ────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchStats = async () => {
      const { data: leads } = await supabase.from('leads').select('status');
      if (leads) {
        const ganhos = leads.filter(l => l.status === 'ganho').length;
        const perdidos = leads.filter(l => l.status === 'perdido').length;
        const emAndamento = leads.filter(l => !['ganho', 'perdido'].includes(l.status || '')).length;

        setStats(prev => ({
          ...prev,
          totalLeads: leads.length,
          leadsGanhos: ganhos,
          leadsPerdidos: perdidos,
          leadsEmAndamento: emAndamento,
        }));

        const statusCount: Record<string, number> = {};
        leads.forEach(lead => {
          const status = lead.status || 'novo';
          statusCount[status] = (statusCount[status] || 0) + 1;
        });

        const statusLabels: Record<string, string> = {
          novo: 'Novo', contato: 'Contato', qualificado: 'Qualificado',
          proposta: 'Proposta', negociacao: 'Negociação', ganho: 'Ganho', perdido: 'Perdido',
        };

        setLeadsByStatus(
          Object.entries(statusCount).map(([key, value]) => ({
            name: statusLabels[key] || key,
            value,
          }))
        );
      }

      const { data: tasks } = await supabase.from('tasks').select('completed');
      if (tasks) {
        setStats(prev => ({
          ...prev,
          tasksPendentes: tasks.filter(t => !t.completed).length,
          tasksCompletadas: tasks.filter(t => t.completed).length,
        }));
      }
    };

    const fetchUpcomingMeetings = async () => {
      if (!profile) return;
      const now = new Date().toISOString();
      let query = supabase
        .from('meetings')
        .select('id, title, meeting_date, jitsi_link, contact_name, lead_id')
        .gte('meeting_date', now)
        .order('meeting_date', { ascending: true })
        .limit(5);

      if (!isAdmin && !isGerente) {
        query = query.eq('sdr_id', profile.id);
      }

      const { data } = await query;
      if (data && data.length > 0) {
        const leadIds = [...new Set(data.map(m => m.lead_id).filter(Boolean))];
        const { data: leadsData } = await supabase
          .from('leads')
          .select('id, razao_social, nome_fantasia')
          .in('id', leadIds as string[]);

        const leadMap = new Map(leadsData?.map(l => [l.id, l.nome_fantasia || l.razao_social]) || []);
        setUpcomingMeetings(data.map(m => ({
          ...m,
          lead_name: leadMap.get(m.lead_id || '') || 'Empresa',
        })));
      }
    };

    // ── Funil de e-mail ──────────────────────────────────────────────────────
    const fetchEmailFunnel = async () => {
      const { data: sends } = await supabase
        .from('email_sends')
        .select('status, last_opened_at, replied');

      if (sends) {
        const enviados = sends.filter(s => s.status !== 'pendente').length;
        const abertos = sends.filter(s => !!s.last_opened_at).length;
        const respondidos = sends.filter(s => s.replied).length;
        setEmailFunnel({ enviados, abertos, respondidos });
      }
    };

    fetchStats();
    fetchUpcomingMeetings();
    fetchEmailFunnel();
  }, [profile]);

  // ── Realtime: alertas de abertura de e-mail ────────────────────────────────
  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel('email-open-alerts')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'email_sends',
          filter: 'last_opened_at=neq.null',
        },
        async (payload) => {
          const send = payload.new as {
            id: string;
            lead_id: string;
            last_opened_at: string | null;
          };

          // Ignorar se já alertamos ou se não tem abertura
          if (!send.last_opened_at || alertedIds.current.has(send.id)) return;
          alertedIds.current.add(send.id);

          // Buscar nome da empresa
          const { data: lead } = await supabase
            .from('leads')
            .select('razao_social, nome_fantasia')
            .eq('id', send.lead_id)
            .maybeSingle();

          const leadName = lead?.nome_fantasia || lead?.razao_social || 'Empresa desconhecida';

          setEmailAlerts(prev => [
            {
              id: send.id,
              lead_id: send.lead_id,
              lead_name: leadName,
              opened_at: send.last_opened_at!,
            },
            ...prev.slice(0, 4), // Máx 5 alertas
          ]);

          // Atualizar contadores do funil
          setEmailFunnel(prev => ({ ...prev, abertos: prev.abertos + 1 }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  const dismissAlert = (id: string) => {
    setEmailAlerts(prev => prev.filter(a => a.id !== id));
  };

  // ── Derived chart data ─────────────────────────────────────────────────────
  const conversionData = [
    { name: 'Ganhos', value: stats.leadsGanhos, fill: 'hsl(142, 71%, 45%)' },
    { name: 'Perdidos', value: stats.leadsPerdidos, fill: 'hsl(0, 84%, 60%)' },
    { name: 'Em Andamento', value: stats.leadsEmAndamento, fill: 'hsl(38, 92%, 50%)' },
  ];

  const funnelChartData = [
    {
      name: 'Enviados',
      value: emailFunnel.enviados,
      fill: 'hsl(217, 71%, 45%)',
    },
    {
      name: 'Abertos',
      value: emailFunnel.abertos,
      fill: 'hsl(166, 64%, 42%)',
    },
    {
      name: 'Respondidos',
      value: emailFunnel.respondidos,
      fill: 'hsl(142, 71%, 45%)',
    },
  ];

  const getMeetingUrgency = (meetingDate: string) => {
    const diff = differenceInMinutes(new Date(meetingDate), new Date());
    if (diff <= 15 && diff >= 0) return 'urgent';
    if (diff <= 60 && diff >= 0) return 'soon';
    return 'normal';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">
            Bem-vindo, {profile?.full_name?.split(' ')[0] || 'Usuário'}!
          </h1>
          <p className="text-muted-foreground mt-1">
            Aqui está o resumo das suas atividades
          </p>
        </div>

        {/* ── Alertas de abertura de e-mail em tempo real ───────────────────── */}
        {emailAlerts.length > 0 && (
          <div className="space-y-2">
            {emailAlerts.map(alert => (
              <div
                key={alert.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 animate-in slide-in-from-top-2 duration-300"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-accent/20 p-1.5 shrink-0">
                    <MailOpen className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      📬 <span className="text-accent">{alert.lead_name}</span> acabou de ler sua proposta!
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(alert.opened_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-accent/40 text-accent hover:bg-accent/10"
                    onClick={() => navigate('/leads')}
                  >
                    Ver ficha
                  </Button>
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming Meetings Alert */}
        {upcomingMeetings.length > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Video className="h-5 w-5 text-primary" />
                Próximas Reuniões
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {upcomingMeetings.map((meeting) => {
                  const urgency = getMeetingUrgency(meeting.meeting_date);
                  return (
                    <div
                      key={meeting.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        urgency === 'urgent'
                          ? 'bg-destructive/10 border-destructive/30 animate-pulse'
                          : urgency === 'soon'
                          ? 'bg-amber-500/10 border-amber-500/30'
                          : 'bg-card'
                      }`}
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm">{meeting.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {meeting.lead_name}
                          {meeting.contact_name && ` • ${meeting.contact_name}`}
                        </p>
                        <p className={`text-xs mt-1 font-medium ${
                          urgency === 'urgent' ? 'text-destructive' :
                          urgency === 'soon' ? 'text-amber-600' : 'text-muted-foreground'
                        }`}>
                          {urgency === 'urgent'
                            ? `⚠️ Em ${differenceInMinutes(new Date(meeting.meeting_date), new Date())} minutos!`
                            : format(new Date(meeting.meeting_date), "dd/MM 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={urgency === 'urgent' ? 'default' : 'outline'}
                        onClick={() => window.open(`${meeting.jitsi_link}#config.startWithVideoMuted=false`, '_blank')}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Entrar
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="metric-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de Leads</CardTitle>
              <Target className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalLeads}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.leadsEmAndamento} em andamento
              </p>
            </CardContent>
          </Card>

          <Card className="metric-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Leads Ganhos</CardTitle>
              <CheckCircle className="h-5 w-5 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-success">{stats.leadsGanhos}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.totalLeads > 0 ? ((stats.leadsGanhos / stats.totalLeads) * 100).toFixed(1) : 0}% de conversão
              </p>
            </CardContent>
          </Card>

          <Card className="metric-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Leads Perdidos</CardTitle>
              <XCircle className="h-5 w-5 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">{stats.leadsPerdidos}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Oportunidades não convertidas
              </p>
            </CardContent>
          </Card>

          <Card className="metric-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tarefas Pendentes</CardTitle>
              <Clock className="h-5 w-5 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.tasksPendentes}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.tasksCompletadas} completadas
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Leads por Status */}
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Leads por Status</CardTitle>
              <CardDescription>Distribuição atual dos leads no funil</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={leadsByStatus}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Taxa de Conversão */}
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Taxa de Conversão</CardTitle>
              <CardDescription>Proporção de leads ganhos vs perdidos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={conversionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {conversionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-6 mt-4">
                {conversionData.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }} />
                    <span className="text-sm text-muted-foreground">{item.name}: {item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Funil de E-mail */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Funil de E-mail
              </CardTitle>
              <CardDescription>
                Enviados → Abertos → Respondidos · dados em tempo real
              </CardDescription>
            </CardHeader>
            <CardContent>
              {emailFunnel.enviados === 0 ? (
                <div className="flex flex-col items-center justify-center h-[180px] gap-3 text-muted-foreground">
                  <Mail className="h-10 w-10 opacity-20" />
                  <p className="text-sm">Nenhum e-mail disparado ainda</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Visual funnel bars */}
                  {funnelChartData.map((item, i) => {
                    const pct = emailFunnel.enviados > 0
                      ? Math.round((item.value / emailFunnel.enviados) * 100)
                      : 0;
                    return (
                      <div key={item.name} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            {i === 0 && <Mail className="h-4 w-4 text-muted-foreground" />}
                            {i === 1 && <MailOpen className="h-4 w-4 text-muted-foreground" />}
                            {i === 2 && <MessageSquare className="h-4 w-4 text-muted-foreground" />}
                            <span className="font-medium">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-xs">{pct}%</span>
                            <Badge variant="outline" className="font-mono text-xs">
                              {item.value}
                            </Badge>
                          </div>
                        </div>
                        <div className="h-3 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: item.fill,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground text-center">
                      Taxa de abertura:{' '}
                      <span className="font-semibold text-foreground">
                        {emailFunnel.enviados > 0
                          ? `${Math.round((emailFunnel.abertos / emailFunnel.enviados) * 100)}%`
                          : '—'}
                      </span>
                      {' · '}
                      Taxa de resposta:{' '}
                      <span className="font-semibold text-foreground">
                        {emailFunnel.abertos > 0
                          ? `${Math.round((emailFunnel.respondidos / emailFunnel.abertos) * 100)}%`
                          : '—'}
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
