import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Map, Pickaxe, Search, UserPlus, TrendingUp, Mail } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

import { GoogleMapsSearch } from '@/components/prospeccao/GoogleMapsSearch';
import { MiningMode } from '@/components/prospeccao/MiningMode';

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

    // Se o usuário for SDR, filtramos para mostrar apenas a produção dele.
    // Se for admin, vê o volume global da operação.
    const queryFilter = profile.role === 'sdr' ? supabase.from('cnpj_consultas').select('id', { count: 'exact', head: true }).eq('user_id', profile.id) : supabase.from('cnpj_consultas').select('id', { count: 'exact', head: true });

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

  const taxa = consultadasHoje > 0 ? Math.round((importadasHoje / consultadasHoje) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-[1600px] mx-auto pb-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight">Central de Prospecção</h1>
          <p className="text-muted-foreground">
            Descubra novos leads B2B, analise empresas e importe contatos qualificados para o funil.
          </p>
        </div>

        {/* Dashboards de Performance */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-card hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Empresas Analisadas</CardTitle>
              <Search className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{consultadasHoje}</div>
              <p className="text-xs text-muted-foreground mt-1">Buscas realizadas hoje</p>
            </CardContent>
          </Card>

          <Card className="bg-card hover:shadow-md transition-shadow border-emerald-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Leads Importados</CardTitle>
              <UserPlus className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{importadasHoje}</div>
              <p className="text-xs text-muted-foreground mt-1">Contatos salvos no CRM</p>
            </CardContent>
          </Card>

          <Card className="bg-card hover:shadow-md transition-shadow border-blue-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{taxa}%</div>
              <p className="text-xs text-muted-foreground mt-1">Análise vs Importação</p>
            </CardContent>
          </Card>

          <Card className="bg-card hover:shadow-md transition-shadow border-orange-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cold Mails</CardTitle>
              <Mail className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{emailsHoje}</div>
              <p className="text-xs text-muted-foreground mt-1">E-mails disparados hoje</p>
            </CardContent>
          </Card>
        </div>

        {/* Espaço de Trabalho de Mineração */}
        <Card className="border shadow-sm bg-background/50 backdrop-blur-sm">
          <CardHeader className="pb-4 border-b bg-muted/20">
            <CardTitle className="text-lg">Ferramentas de Mineração</CardTitle>
            <CardDescription>Escolha o método de busca para encontrar seu Perfil de Cliente Ideal (ICP).</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Tabs defaultValue="google" className="space-y-6">
              <TabsList className="grid w-full md:w-[400px] grid-cols-2 p-1 bg-muted/50">
                <TabsTrigger value="google" className="gap-2 font-semibold">
                  <Map className="h-4 w-4" />
                  Google Maps
                </TabsTrigger>
                <TabsTrigger value="mineracao" className="gap-2 font-semibold">
                  <Pickaxe className="h-4 w-4" />
                  Por CNPJ
                </TabsTrigger>
              </TabsList>

              <TabsContent value="google" className="m-0 focus-visible:outline-none">
                <div className="animate-in slide-in-from-bottom-2 duration-300">
                  <GoogleMapsSearch />
                </div>
              </TabsContent>

              <TabsContent value="mineracao" className="m-0 focus-visible:outline-none">
                <div className="animate-in slide-in-from-bottom-2 duration-300">
                  <MiningMode />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
