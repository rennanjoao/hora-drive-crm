import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { CalendarIcon, Video, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Lead {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  email: string | null;
  telefone: string | null;
}

interface SDRProfile {
  id: string;
  full_name: string | null;
}

interface ScheduleMeetingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onMeetingCreated?: () => void;
  leads?: Lead[];
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

export function ScheduleMeetingModal({ open, onOpenChange, lead, onMeetingCreated, leads = [] }: ScheduleMeetingModalProps) {
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const activeLead = lead || leads.find(l => l.id === selectedLeadId) || null;
  const { profile, isAdmin } = useAuth();

  // Reset selectedLeadId when modal closes
  useEffect(() => {
    if (!open) setSelectedLeadId('');
  }, [open]);
  const [sdrs, setSdrs] = useState<SDRProfile[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    contact_name: '',
    start_time: '09:00',
    duration: '30',
    sdr_id: '',
  });

  // Pre-fill when lead changes
  useEffect(() => {
    const l = activeLead;
    if (l) {
      setForm(prev => ({
        ...prev,
        title: `Reunião com ${l.nome_fantasia || l.razao_social}`,
        contact_name: '',
      }));
    }
  }, [lead, selectedLeadId]);

  // Set default SDR
  useEffect(() => {
    if (profile && !isAdmin) {
      setForm(prev => ({ ...prev, sdr_id: profile.id }));
    }
  }, [profile, isAdmin]);

  // Fetch SDRs for admin
  useEffect(() => {
    if (!isAdmin) return;
    const fetchSDRs = async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'sdr');
      if (roles && roles.length > 0) {
        const userIds = roles.map(r => r.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, user_id')
          .in('user_id', userIds);
        setSdrs(profiles?.map(p => ({ id: p.id, full_name: p.full_name })) || []);
      }
    };
    fetchSDRs();
  }, [isAdmin]);

  const handleSave = async () => {
    if (!profile) {
      toast.error('Utilizador não autenticado. Faça login novamente.');
      return;
    }
    if (!selectedDate) {
      toast.error('Selecione uma data para a reunião.');
      return;
    }
    if (!form.title.trim()) {
      toast.error('Insira um título para a reunião.');
      return;
    }

    const sdrId = form.sdr_id || profile.id;

    setSaving(true);
    try {
      const meetingDate = new Date(`${format(selectedDate, 'yyyy-MM-dd')}T${form.start_time}`);
      
      // Generate unique Jitsi room name
      const companySlug = activeLead
        ? sanitizeForUrl(activeLead.nome_fantasia || activeLead.razao_social)
        : 'NaHora';
      const dateStr = format(selectedDate, 'ddMMyyyy');
      const uniqueId = Math.random().toString(36).substring(2, 7).toUpperCase();
      const jitsiLink = `https://meet.jit.si/NaHora-${companySlug}-${dateStr}-${uniqueId}`;

      // Insert meeting — lead_id is now nullable in the DB
      const { error: meetingError } = await supabase.from('meetings').insert({
        lead_id: activeLead?.id || null,
        sdr_id: sdrId,
        created_by: profile.id,
        title: form.title,
        description: form.description || null,
        meeting_date: meetingDate.toISOString(),
        duration_minutes: parseInt(form.duration),
        jitsi_link: jitsiLink,
        contact_name: form.contact_name || null,
        status: 'agendada',
        meeting_type: 'scheduled',
      } as any);

      if (meetingError) {
        console.error('Meeting insert error:', meetingError);
        throw meetingError;
      }

      // Log to lead timeline only if a lead is linked
      if (activeLead) {
        const { error: timelineError } = await supabase.from('lead_timeline').insert({
          lead_id: activeLead.id,
          author_id: profile.id,
          content: `📅 Reunião agendada: ${form.title} — ${format(meetingDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} — Link: ${jitsiLink}`,
          contact_type: 'meeting',
        });
        if (timelineError) console.warn('Timeline insert warning:', timelineError);
      }

      toast.success('Reunião agendada com sucesso! 🎉');
      onOpenChange(false);
      setSelectedDate(undefined);
      setForm({ title: '', description: '', contact_name: '', start_time: '09:00', duration: '30', sdr_id: profile?.id || '' });
      onMeetingCreated?.();
    } catch (err: any) {
      console.error('Error creating meeting:', err);
      const msg = err?.message || '';
      if (msg.includes('row-level security')) {
        toast.error('Sem permissão para agendar reuniões. Verifique se está autenticado.');
      } else if (msg.includes('violates not-null')) {
        toast.error('Erro de dados: campo obrigatório em falta.');
      } else {
        toast.error(msg || 'Erro ao agendar reunião. Tente novamente.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            Agendar Reunião
          </DialogTitle>
          <DialogDescription>
            {activeLead ? `Empresa: ${activeLead.nome_fantasia || activeLead.razao_social}` : 'Selecione uma empresa'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {!lead && leads.length > 0 && (
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Select value={selectedLeadId} onValueChange={setSelectedLeadId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {leads.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.nome_fantasia || l.razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Título da Reunião</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex: Reunião de apresentação"
            />
          </div>

          <div className="space-y-2">
            <Label>Contato Principal</Label>
            <Input
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              placeholder="Nome do contato na empresa"
            />
          </div>

          <div className="space-y-2">
            <Label>Data</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP", { locale: ptBR }) : <span>Selecione a data</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  initialFocus
                  className="pointer-events-auto"
                  disabled={(date) => date < new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Horário</Label>
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Duração (min)</Label>
              <Select value={form.duration} onValueChange={(v) => setForm({ ...form, duration: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="45">45 min</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                  <SelectItem value="90">1h30</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isAdmin && sdrs.length > 0 && (
            <div className="space-y-2">
              <Label>SDR Responsável</Label>
              <Select value={form.sdr_id} onValueChange={(v) => setForm({ ...form, sdr_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o SDR" />
                </SelectTrigger>
                <SelectContent>
                  {sdrs.map(sdr => (
                    <SelectItem key={sdr.id} value={sdr.id}>
                      {sdr.full_name || 'Sem nome'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Pauta, objetivos da reunião..."
              rows={3}
            />
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">🔗 Link da reunião (Jitsi Meet)</p>
            <p>Um link único será gerado automaticamente ao salvar a reunião.</p>
          </div>

          {!activeLead && (
            <p className="text-xs text-muted-foreground text-center">💡 Sem empresa selecionada — a reunião será criada sem vínculo a um lead.</p>
          )}

          <Button onClick={handleSave} className="w-full" disabled={saving || !form.title.trim() || !selectedDate}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Video className="h-4 w-4 mr-2" />}
            Agendar Reunião
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
