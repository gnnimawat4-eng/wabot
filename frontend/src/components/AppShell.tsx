'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { LogOut, ChevronDown, Zap, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { getWorkspaces, createWorkspace, getContacts } from '@/lib/api';
import { useWorkspaceStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { getBusinessConfig, DEFAULT_NAV, type NavItem } from '@/lib/businessConfig';
import { OnboardingModal } from '@/components/OnboardingModal';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { workspaces, activeWorkspace, setWorkspaces, setWorkspace } = useWorkspaceStore();

  const businessConfig = getBusinessConfig(activeWorkspace?.business_type);
  const nav: NavItem[] = activeWorkspace?.onboarding_completed
    ? businessConfig.nav
    : DEFAULT_NAV;

  // Auth guard — redirect only on explicit sign-out, not on API errors
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.push('/login');
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isError } = useQuery({
    queryKey: ['workspaces'],
    queryFn: getWorkspaces,
    retry: 1,
  });

  const { data: recentContacts } = useQuery({
    queryKey: ['inbox-activity', activeWorkspace?.id],
    queryFn: () => getContacts(activeWorkspace!.id, { limit: 1, order: 'last_message_at' }),
    enabled: !!activeWorkspace,
    refetchInterval: 30_000,
  });
  const hasInboxActivity = (recentContacts?.total ?? recentContacts?.data?.length ?? 0) > 0;

  const autoCreate = useMutation({
    mutationFn: () => createWorkspace('My Workspace'),
    onSuccess: (ws) => {
      setWorkspaces([ws]);
      toast.success('Workspace "My Workspace" created');
    },
    onError: () => {
      toast.error('Could not create workspace — go to Settings to create one manually');
    },
  });

  const createNew = useMutation({
    mutationFn: () => createWorkspace(`Workspace ${workspaces.length + 1}`),
    onSuccess: (ws) => {
      setWorkspaces([...workspaces, ws]);
      setWorkspace(ws);
      toast.success(`"${ws.name}" created`);
    },
    onError: () => toast.error('Failed to create workspace'),
  });

  useEffect(() => {
    if (data !== undefined) {
      if (data.length > 0) {
        setWorkspaces(data);
      } else if (!isError && !autoCreate.isPending && !autoCreate.isSuccess && !autoCreate.isError) {
        autoCreate.mutate();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isError]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // Active check: exact match or prefix match for business-specific routes
  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === href;
    return pathname.startsWith(href.split('?')[0]);
  };

  return (
    <>
      <OnboardingModal />

      <div className="flex h-screen bg-[#0a0f1e]">
        {/* Sidebar */}
        <aside className="w-60 bg-[#0d1424] border-r border-white/5 flex flex-col">
          {/* Brand */}
          <div className="px-4 py-5 border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-500/20">
                <Zap className="h-4 w-4 text-green-400" />
              </div>
              <span className="text-base font-bold text-white tracking-tight">WaBot</span>
              {activeWorkspace?.onboarding_completed && activeWorkspace.business_type && (
                <span className="ml-auto text-base leading-none" title={businessConfig.label}>
                  {businessConfig.emoji}
                </span>
              )}
            </div>
          </div>

          {/* Workspace switcher */}
          <div className="px-3 py-3 border-b border-white/5">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex w-full items-center justify-between rounded-md bg-white/5 hover:bg-white/8 px-3 py-2 text-sm text-white/80 transition-colors outline-none">
                <span className="truncate font-medium">
                  {activeWorkspace?.name ?? (autoCreate.isPending ? 'Creating…' : 'No workspace')}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/40" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-52 bg-[#0d1424] border-white/10 text-white">
                {workspaces.map((ws) => (
                  <DropdownMenuItem
                    key={ws.id}
                    onClick={() => setWorkspace(ws)}
                    className={cn(
                      'hover:bg-white/5 focus:bg-white/5 cursor-pointer',
                      ws.id === activeWorkspace?.id && 'text-green-400'
                    )}
                  >
                    {ws.name}
                  </DropdownMenuItem>
                ))}
                {workspaces.length === 0 && (
                  <DropdownMenuItem disabled className="text-white/30 text-xs">
                    No workspaces yet
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => createNew.mutate()}
                  disabled={createNew.isPending}
                  className="hover:bg-white/5 focus:bg-white/5 cursor-pointer border-t border-white/5 mt-1 pt-2 text-green-400 hover:text-green-300"
                >
                  <Plus className="h-3.5 w-3.5 mr-2" />
                  {createNew.isPending ? 'Creating…' : 'New Workspace'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
            {nav.map(({ href, label, emoji }) => (
              <Link
                key={href + label}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive(href)
                    ? 'bg-green-500/15 text-green-400'
                    : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                )}
              >
                <span className="text-base leading-none w-4 text-center">{emoji}</span>
                <span className="flex-1">{label}</span>
                {href.includes('/inbox') && hasInboxActivity && !pathname.startsWith('/inbox') && (
                  <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                )}
              </Link>
            ))}
          </nav>

          {/* Logout */}
          <div className="px-3 py-3 border-t border-white/5">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-white/40 hover:bg-white/5 hover:text-white/60 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-[#0a0f1e]">
          {children}
        </main>
      </div>
    </>
  );
}
