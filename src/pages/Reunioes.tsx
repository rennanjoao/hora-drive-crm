import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Video, Trash2, ExternalLink, Plus, Zap, X, Building2, Phone, Link2, Copy, Check, LogIn } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScheduleMeetingModal } from '@/components/ScheduleMeetingModal';

interface MeetingRow {
  id: string;
  title: string;
  description: string | null;
  meeting_date: string;
  duration_minutes: number;
  jitsi_link: string;
  contact_name: string | null;
  sdr_id: string;
  lead_id: string;
  meeting_type: string;
  status: string;
  created_at: string;
}

interface Lead {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  email: string | null;
  telefone: string | null;
}

interface ActiveRoom {
  meeting: MeetingRow;
  lead: Lead | null;
  linkCopied: boolean;
}

function sanitizeForUrl(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);
}

export default function Reunioes() {
  const { profile, isAdmin, isSDR, isGerente } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadMap, setLeadMap] = useState<Record<string, Lead>>({});
  const [sdrMap, setSdrMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activeRoom, setActiveRoom] = useState<ActiveRoom | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Instant meeting modal
  const [instantOpen, setInstantOpen] = useState(false);
  const [instantLeadId, setInstantLeadId] = useState<string>('none');
  const [instantTitle, setInstantTitle] = useState('Reunião Instantânea');
  const [creatingInstant, setCreatingInstant] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [meetingsRes, leadsRes, profilesRes] = await Promise.all([
        supabase.from('meetings').select('*').order('meeting_date', { ascending: false }),
        supabase.from('leads').select('id, razao_social, nome_fantasia, email, telefone').order('razao_social'),
        supabase.from('profiles').select('id, full_name'),
      ]);

      setMeetings((meetingsRes.data as MeetingRow[]) || []);
      setLeads(leadsRes.data || []);

      const lMap: Record<string, Lead> = {};
      (leadsRes.data || []).forEach(l => { lMap[l.id] = l; });
      setLeadMap(lMap);

      const sMap: Record<string, string> = {};
      (profilesRes.data || []).forEach(p => { sMap[p.id] = p.full_name || 'Sem nome'; });
      setSdrMap(sMap);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao carregar reuniões');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const openInstantModal = () => {
    setInstantTitle('Reunião Instantânea');
    setInstantLeadId('none');
    setInstantOpen(true);
  };

  const startInstantMeeting = async () => {
    if (!profile) return;
    setCreatingInstant(true);
    try {
      const roomId = `NaHora-Instantanea-${Date.now()}`;
      const jitsiLink = `https://meet.jit.si/${roomId}`;

      // Find lead or use null
      const linkedLead = instantLeadId !== 'none' ? leads.find(l => l.id === instantLeadId) || null : null;

      // Requires a lead_id - if none selected, we'll skip saving to DB or use first lead
      if (!linkedLead && leads.length === 0) {
        // Just open Jitsi without DB record
        toast.info('Sala criada (sem vínculo com lead)');
        const fakeMeeting: MeetingRow = {
          id: crypto.randomUUID(),
          title: instantTitle || 'Reunião Instantânea',
          description: null,
          meeting_date: new Date().toISOString(),
          duration_minutes: 30,
          jitsi_link: jitsiLink,
          contact_name: null,
          sdr_id: profile.id,
          lead_id: '',
          meeting_type: 'instant',
          status: 'em_andamento',
          created_at: new Date().toISOString(),
        };
        setActiveRoom({ meeting: fakeMeeting, lead: null, linkCopied: false });
        setInstantOpen(false);
        return;
      }

      const targetLeadId = linkedLead?.id || leads[0]?.id;

      const { data: newMeeting, error } = await supabase.from('meetings').insert({
        title: instantTitle || 'Reunião Instantânea',
        meeting_date: new Date().toISOString(),
        duration_minutes: 30,
        jitsi_link: jitsiLink,
        sdr_id: profile.id,
        created_by: profile.id,
        lead_id: targetLeadId,
        meeting_type: 'instant',
        status: 'em_andamento',
      } as any).select().single();

      if (error) throw error;

      // Log to lead timeline
      if (linkedLead) {
        await supabase.from('lead_timeline').insert({
          lead_id: linkedLead.id,
          author_id: profile.id,
          content: `🎥 Reunião instantânea iniciada: "${instantTitle}" — Link: ${jitsiLink}`,
          contact_type: 'meeting',
        });
      }

      toast.success('Sala criada!');
      setActiveRoom({ meeting: newMeeting as MeetingRow, lead: linkedLead, linkCopied: false });
      setInstantOpen(false);
      fetchAll();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao criar reunião instantânea');
    } finally {
      setCreatingInstant(false);
    }
  };

  const enterMeeting = (meeting: MeetingRow) => {
    const lead = leadMap[meeting.lead_id] || null;
    setActiveRoom({ meeting, lead, linkCopied: false });
  };

  const closeRoom = async () => {
    if (!activeRoom || !profile) { setActiveRoom(null); return; }

    // Log end of meeting in lead timeline
    const lead = activeRoom.lead;
    if (lead) {
      try {
        await supabase.from('lead_timeline').insert({
          lead_id: lead.id,
          author_id: profile.id,
          content: `✅ Reunião encerrada: "${activeRoom.meeting.title}" — ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
          contact_type: 'meeting',
        });
      } catch (e) { console.error(e); }
    }

    // Update status to concluida
    if (activeRoom.meeting.id) {
      try {
        await supabase.from('meetings').update({ status: 'concluida' })
          .eq('id', activeRoom.meeting.id);
      } catch (e) { console.error(e); }
    }

    setActiveRoom(null);
    fetchAll();
    toast.success('Reunião encerrada e registrada no histórico');
  };

  const copyLink = () => {
    if (!activeRoom) return;
    navigator.clipboard.writeText(activeRoom.meeting.jitsi_link);
    setActiveRoom(prev => prev ? { ...prev, linkCopied: true } : prev);
    setTimeout(() => setActiveRoom(prev => prev ? { ...prev, linkCopied: false } : prev), 2000);
    toast.success('Link copiado!');
  };

  const deleteMeeting = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from('meetings').delete().eq('id', id);
      if (error) throw error;
      setMeetings(prev => prev.filter(m => m.id !== id));
      toast.success('Reunião removida');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao deletar reunião');
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusBadge = (status: string, meetingDate: string) => {
    const isPast = new Date(meetingDate) < new Date();
    if (isPast && status === 'agendada') {
      return <Badge variant="secondary">Concluída</Badge>;
    }
    const variants: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      agendada: { label: 'Agendada', variant: 'default' },
      em_andamento: { label: 'Em Andamento', variant: 'outline' },
      concluida: { label: 'Concluída', variant: 'secondary' },
    };
    const v = variants[status] || variants.agendada;
    return <Badge variant={v.variant}>{v.label}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    if (type === 'instant') return <Badge variant="outline" className="text-xs border-warning/60 text-warning">⚡ Instantânea</Badge>;
    return <Badge variant="outline" className="text-xs">📅 Agendada</Badge>;
  };

  const filteredMeetings = meetings.filter(m => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'instant') return m.meeting_type === 'instant';
    if (statusFilter === 'concluida') return m.status === 'concluida' || new Date(m.meeting_date) < new Date();
    if (statusFilter === 'agendada') return m.status === 'agendada' && new Date(m.meeting_date) >= new Date();
    return true;
  });

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
        {/* Active Jitsi Room */}
        {activeRoom && (
          <Card className="border-primary/50 shadow-lg">
            <CardHeader className="pb-2 bg-primary/5 rounded-t-xl">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                    <Video className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{activeRoom.meeting.title}</CardTitle>
                    {activeRoom.lead && (
                      <CardDescription className="flex items-center gap-1.5 mt-0.5">
                        <Building2 className="h-3 w-3" />
                        {activeRoom.lead.nome_fantasia || activeRoom.lead.razao_social}
                        {activeRoom.lead.telefone && (
                          <span className="flex items-center gap-1 ml-2">
                            <Phone className="h-3 w-3" />
                            {activeRoom.lead.telefone}
                          </span>
                        )}
                      </CardDescription>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyLink}
                    className="gap-1.5 text-xs"
                  >
                    {activeRoom.linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {activeRoom.linkCopied ? 'Copiado!' : 'Copiar Link'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(activeRoom.meeting.jitsi_link, '_blank')}
                    className="gap-1.5 text-xs"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Nova Aba
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={closeRoom}
                    className="gap-1.5 text-xs"
                  >
                    <X className="h-3.5 w-3.5" />
                    Encerrar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <iframe
                src={`${activeRoom.meeting.jitsi_link}#config.startWithVideoMuted=false&config.prejoinPageEnabled=false&config.startWithAudioMuted=false&interfaceConfig.TOOLBAR_BUTTONS=[%22microphone%22,%22camera%22,%22desktop%22,%22fullscreen%22,%22hangup%22,%22chat%22,%22recording%22,%22livestreaming%22,%22etherpad%22,%22sharedvideo%22,%22settings%22,%22raisehand%22,%22videoquality%22,%22filmstrip%22,%22feedback%22,%22shortcuts%22,%22tileview%22]`}
                className="w-full rounded-b-xl"
                style={{ height: '520px', border: 'none' }}
                allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
                title="Jitsi Meeting"
              />
            </CardContent>
          </Card>
        )}

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Reuniões</h1>
            <p className="text-muted-foreground mt-1">Gerencie videoconferências vinculadas aos seus leads</p>
          </div>
          <div className="flex items-center gap-3">
            {(isAdmin || isSDR) && (
              <>
                <Button variant="outline" onClick={openInstantModal}>
                  <Zap className="h-4 w-4 mr-2" />
                  Iniciar Agora
                </Button>
                <Button onClick={() => { setSelectedLead(null); setScheduleOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Agendar Reunião
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Meetings Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Video className="h-5 w-5" />
                  Lista de Reuniões
                </CardTitle>
                <CardDescription>{filteredMeetings.length} reunião(ões)</CardDescription>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Filtrar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="agendada">Agendadas</SelectItem>
                  <SelectItem value="concluida">Concluídas</SelectItem>
                  <SelectItem value="instant">Instantâneas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>SDR</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMeetings.map((meeting) => {
                  const lead = leadMap[meeting.lead_id];
                  const isActive = activeRoom?.meeting.id === meeting.id;
                  return (
                    <TableRow key={meeting.id} className={isActive ? 'bg-primary/5' : ''}>
                      <TableCell className="font-medium">
                        {isActive && <span className="inline-block w-2 h-2 bg-accent rounded-full mr-2 animate-pulse" />}
                        {meeting.title}
                      </TableCell>
                      <TableCell className="text-sm">
                        {lead ? (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            {lead.nome_fantasia || lead.razao_social}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(meeting.meeting_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-sm">{sdrMap[meeting.sdr_id] || '-'}</TableCell>
                      <TableCell>{getTypeBadge(meeting.meeting_type)}</TableCell>
                      <TableCell>{getStatusBadge(meeting.status, meeting.meeting_date)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant={isActive ? 'default' : 'outline'}
                            onClick={() => isActive ? closeRoom() : enterMeeting(meeting)}
                            className="text-xs gap-1"
                          >
                            {isActive ? (
                              <><X className="h-3 w-3" />Encerrar</>
                            ) : (
                              <><LogIn className="h-3 w-3" />Entrar</>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs gap-1"
                            onClick={() => {
                              navigator.clipboard.writeText(meeting.jitsi_link);
                              toast.success('Link copiado!');
                            }}
                          >
                            <Link2 className="h-3 w-3" />
                          </Button>
                          {(isAdmin || isSDR) && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Deletar Reunião?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Essa ação não pode ser desfeita. A reunião "{meeting.title}" será removida permanentemente.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMeeting(meeting.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    {deletingId === meeting.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Deletar'}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {filteredMeetings.length === 0 && (
              <div className="py-10 text-center text-muted-foreground">
                <Video className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p>Nenhuma reunião encontrada</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instant Meeting Modal */}
        <Dialog open={instantOpen} onOpenChange={setInstantOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-warning" />
                Iniciar Reunião Agora
              </DialogTitle>
              <DialogDescription>
                A sala será criada imediatamente. Você pode vincular a um lead existente.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Título da sala</Label>
                <Input
                  value={instantTitle}
                  onChange={e => setInstantTitle(e.target.value)}
                  placeholder="Ex: Demo com cliente"
                />
              </div>
              <div className="space-y-2">
                <Label>Vincular a um lead (opcional)</Label>
                <Select value={instantLeadId} onValueChange={setInstantLeadId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o lead" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem vínculo</SelectItem>
                    {leads.map(l => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.nome_fantasia || l.razao_social}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Se vinculado, o acesso à reunião será registrado no histórico do lead.
                </p>
              </div>
              <Separator />
              <Button
                className="w-full"
                onClick={startInstantMeeting}
                disabled={creatingInstant}
              >
                {creatingInstant ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Criando sala...</>
                ) : (
                  <><Video className="h-4 w-4 mr-2" />Criar e Entrar na Sala</>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Schedule Meeting Modal */}
        <ScheduleMeetingModal
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          lead={selectedLead}
          onMeetingCreated={fetchAll}
          leads={leads}
        />
      </div>
    </DashboardLayout>
  );
}
