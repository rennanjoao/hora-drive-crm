import { 
  LayoutDashboard, 
  Users, 
  Search, 
  Calendar, 
  UserCog, 
  LogOut,
  Truck,
  Target,
  ChevronRight,
  Video,
  Film,
  Mail
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  roles: Array<'admin' | 'sdr' | 'gerente' | 'motorista'>;
}

const navItems: NavItem[] = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'sdr', 'gerente', 'motorista'] },
  { title: 'Leads', url: '/leads', icon: Target, roles: ['admin', 'sdr', 'gerente'] },
  { title: 'Prospecção', url: '/prospeccao', icon: Search, roles: ['admin', 'sdr'] },
  { title: 'Reuniões', url: '/reunioes', icon: Video, roles: ['admin', 'sdr', 'gerente'] },
  { title: 'Automação', url: '/automacao', icon: Mail, roles: ['admin', 'sdr'] },
  { title: 'Vídeos', url: '/videos', icon: Film, roles: ['admin', 'sdr', 'gerente'] },
  { title: 'Calendário', url: '/calendario', icon: Calendar, roles: ['admin', 'sdr', 'gerente'] },
  { title: 'Administração', url: '/admin', icon: UserCog, roles: ['admin'] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { user, profile, role, signOut } = useAuth();
  const location = useLocation();
  const collapsed = state === 'collapsed';

  // Show all items while role is loading (null), filtered once role is known
  const filteredItems = role
    ? navItems.filter(item => item.roles.includes(role))
    : navItems.filter(item => item.roles.includes('sdr')); // fallback during load

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getRoleBadge = (userRole: string | null) => {
    const badges: Record<string, { label: string; className: string }> = {
      admin: { label: 'Admin', className: 'bg-accent text-accent-foreground' },
      sdr: { label: 'SDR', className: 'bg-blue-500 text-white' },
      gerente: { label: 'Gerente', className: 'bg-purple-500 text-white' },
      motorista: { label: 'Motorista', className: 'bg-orange-500 text-white' },
    };
    return badges[userRole || ''] || { label: 'Usuário', className: 'bg-muted text-muted-foreground' };
  };

  const badge = getRoleBadge(role);

  return (
    <Sidebar className="sidebar-gradient border-r-0">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
            <Truck className="h-6 w-6 text-accent-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-display text-lg font-bold text-sidebar-foreground">Na Hora</span>
              <span className="text-xs text-sidebar-foreground/70">Transporte CRM</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60 text-xs uppercase tracking-wider">
            Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink 
                        to={item.url}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sidebar-foreground/80 transition-all hover:bg-sidebar-accent hover:text-sidebar-foreground",
                          isActive && "bg-sidebar-accent text-sidebar-foreground font-medium"
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        {!collapsed && <span>{item.title}</span>}
                        {!collapsed && isActive && (
                          <ChevronRight className="ml-auto h-4 w-4" />
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <Avatar className="h-9 w-9 border-2 border-sidebar-accent">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground text-sm">
              {getInitials(profile?.full_name)}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {profile?.full_name || 'Usuário'}
              </p>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", badge.className)}>
                {badge.label}
              </span>
            </div>
          )}
          {!collapsed && (
            <Button 
              variant="ghost" 
              size="icon"
              onClick={signOut}
              className="text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
