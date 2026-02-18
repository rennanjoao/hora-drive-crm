import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Map, Pickaxe } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { GoogleMapsSearch } from '@/components/prospeccao/GoogleMapsSearch';
import { MiningMode } from '@/components/prospeccao/MiningMode';
import { ProspeccaoStatusBar } from '@/components/prospeccao/ProspeccaoStatusBar';

export default function Prospeccao() {
  const { isAllowed, loading: guardLoading } = useRoleGuard(['admin', 'sdr'], '/dashboard');
  const { profile } = useAuth();

  const [consultadasHoje, setConsultadasHoje] = useState(0);
  const [importadasHoje, setImportadasHoje] = useState(0);
  const [emailsHoje, setEmailsHoje] = useState(0);

  const loadStats = useCallback(async () => {
    if (!profile) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [{ count: countHoje }, { count: countImportadas }, { count: countEmails }] = await Promise.all([
      supabase.from('cnpj_consultas').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
      supabase.from('cnpj_consultas').select('id', { count: 'exact', head: true }).eq('importado', true).gte('created_at', today.toISOString()),
      supabase.from('email_sends').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
    ]);
    setConsultadasHoje(countHoje || 0);
    setImportadasHoje(countImportadas || 0);
    setEmailsHoje(countEmails || 0);
  }, [profile]);

  useEffect(() => {
    if (profile) loadStats();
  }, [profile, loadStats]);

  if (guardLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-bold">Prospecção B2B</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Busque empresas no Google Maps e importe leads qualificados para o CRM
            </p>
          </div>
        </div>

        <ProspeccaoStatusBar
          consultadasHoje={consultadasHoje}
          importadasHoje={importadasHoje}
          emailsHoje={emailsHoje}
        />

        <Tabs defaultValue="google" className="space-y-4">
          <TabsList>
            <TabsTrigger value="google" className="gap-2">
              <Map className="h-4 w-4" />
              Google Maps
            </TabsTrigger>
            <TabsTrigger value="mineracao" className="gap-2">
              <Pickaxe className="h-4 w-4" />
              Mineração por CNPJ
            </TabsTrigger>
          </TabsList>

          <TabsContent value="google">
            <GoogleMapsSearch />
          </TabsContent>

          <TabsContent value="mineracao">
            <MiningMode />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
