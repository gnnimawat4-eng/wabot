'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Settings, Plus, Sun, Moon, Monitor, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { getWorkspaces, createWorkspace, getContacts, getSubscription } from '@/lib/api';
import { useWorkspaceStore } from '@/lib/store';
import { initials } from '@/lib/utils';
import { getBusinessConfig, DEFAULT_NAV } from '@/lib/businessConfig';
import { OnboardingModal } from '@/components/OnboardingModal';
import { useTheme } from '@/app/providers';

const ADMIN_EMAIL = 'gnnimawat4@gmail.com';

const s = {
  sidebar: { background: 'var(--wb-bg-sidebar)', borderRight: '1px solid var(--wb-border)' } as React.CSSProperties,
  main:    { background: 'var(--wb-bg)' } as React.CSSProperties,
};

function IconBtn({ onClick, href, title, children }: {
  onClick?: () => void; href?: string; title?: string; children: React.ReactNode;
}) {
  const cls = "p-1.5 rounded transition-colors flex items-center justify-center";
  const style = { color: 'var(--wb-text-3)' } as React.CSSProperties;
  const hover = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.color = 'var(--wb-text-2)';
    e.currentTarget.style.background = 'var(--wb-bg-hover)';
  };
  const leave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.color = 'var(--wb-text-3)';
    e.currentTarget.style.background = 'transparent';
  };
  if (href) return (
    <Link href={href} className={cls} style={style} title={title} onMouseEnter={hover} onMouseLeave={leave}>{children}</Link>
  );
  return (
    <button onClick={onClick} className={cls} style={style} title={title} onMouseEnter={hover} onMouseLeave={leave}>{children}</button>
  );
}

function NavItem({ href, label, emoji, active, dot, collapsed }: {
  href: string; label: string; emoji?: string; active: boolean; dot?: boolean; collapsed?: boolean;
}) {
  if (collapsed) {
    return (
      <Link
        href={href}
        title={label}
        className="flex items-center justify-center h-9 rounded-md transition-colors relative"
        style={active ? { background: 'var(--wb-bg-active)', color: 'var(--wb-accent)' } : { color: 'var(--wb-text-2)' }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--wb-bg-hover)'; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
      >
        <span className="text-base leading-none">{emoji || label[0]}</span>
        {dot && !active && (
          <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
        )}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-3 py-1.5 rounded-md text-sm transition-colors"
      style={active ? { background: 'var(--wb-bg-active)', color: 'var(--wb-accent)', fontWeight: 600 } : { color: 'var(--wb-text-2)' }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--wb-bg-hover)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <span>{label}</span>
      {(active || dot) && (
        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dot && !active ? 'bg-green-400 animate-pulse' : ''}`}
          style={active ? { background: 'var(--wb-accent)' } : {}} />
      )}
    </Link>
  );
}

function ThemeIcon({ theme }: { theme: 'dark' | 'light' | 'system' }) {
  if (theme === 'light') return <Sun className="h-3.5 w-3.5" />;
  if (theme === 'dark') return <Moon className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle: toggleTheme } = useTheme();
  const { workspaces, activeWorkspace, setWorkspaces, setWorkspace } = useWorkspaceStore();
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const [showNewWs, setShowNewWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const currentWidthRef = useRef(220);

  const isAdmin = user?.email === ADMIN_EMAIL;
  const businessConfig = getBusinessConfig(activeWorkspace?.business_type);
  const nav = activeWorkspace?.onboarding_completed ? businessConfig.nav : DEFAULT_NAV;

  useEffect(() => {
    const savedCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
    const savedWidth = parseInt(localStorage.getItem('sidebar_width') || '220', 10);
    setCollapsed(savedCollapsed);
    if (!isNaN(savedWidth)) {
      const w = Math.min(320, Math.max(180, savedWidth));
      setSidebarWidth(w);
      currentWidthRef.current = w;
    }
  }, []);

  useEffect(() => { currentWidthRef.current = sidebarWidth; }, [sidebarWidth]);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar_collapsed', String(next));
  };

  const handleDragStart = (e: React.MouseEvent) => {
    if (collapsed) return;
    dragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = currentWidthRef.current;
    e.preventDefault();

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = ev.clientX - dragStartX.current;
      const newWidth = Math.min(320, Math.max(180, dragStartWidth.current + delta));
      setSidebarWidth(newWidth);
      currentWidthRef.current = newWidth;
    };

    const onUp = () => {
      dragging.current = false;
      localStorage.setItem('sidebar_width', String(currentWidthRef.current));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (u) setUser({ email: u.email || '', name: u.user_metadata?.name || u.email?.split('@')[0] || 'User' });
    });
    supabase.auth.getSession().then(({ data: { session } }) => { if (!session) router.push('/login'); });
    const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((ev) => {
      if (ev === 'SIGNED_OUT') router.push('/login');
    });
    return () => sub.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isError } = useQuery({ queryKey: ['workspaces'], queryFn: getWorkspaces, retry: 1 });

  const { data: subscription } = useQuery({
    queryKey: ['subscription', activeWorkspace?.id],
    queryFn: () => getSubscription(activeWorkspace!.id),
    enabled: !!activeWorkspace,
    refetchInterval: 300_000,
    retry: 1,
  });

  const trialDaysLeft = (() => {
    if (!subscription?.trial_ends_at || subscription.status !== 'trial') return null;
    return Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / 86400000);
  })();

  const limitInfo = (() => {
    const count = subscription?.conversation_count ?? 0;
    const limit = subscription?.conversation_limit ?? 0;
    if (!limit || limit < 0) return null;
    const pct = count / limit;
    if (pct >= 1) return { type: 'danger' as const, count, limit };
    if (pct >= 0.8) return { type: 'warn' as const, count, limit };
    return null;
  })();

  const { data: recentContacts } = useQuery({
    queryKey: ['inbox-activity', activeWorkspace?.id],
    queryFn: () => getContacts(activeWorkspace!.id, { limit: 1 }),
    enabled: !!activeWorkspace,
    refetchInterval: 30_000,
  });
  const hasInboxActivity = (recentContacts?.data?.length ?? 0) > 0;

  const autoCreate = useMutation({
    mutationFn: () => createWorkspace('My Workspace'),
    onSuccess: (ws) => setWorkspaces([ws]),
    onError: () => toast.error('Could not create workspace'),
  });

  const createNew = useMutation({
    mutationFn: (name: string) => createWorkspace(name),
    onSuccess: (ws) => {
      setWorkspaces([...workspaces, ws]); setWorkspace(ws);
      setShowNewWs(false); setNewWsName('');
      toast.success(`"${ws.name}" created`);
    },
    onError: () => toast.error('Failed to create workspace'),
  });

  useEffect(() => {
    if (data !== undefined) {
      if (data.length > 0) setWorkspaces(data);
      else if (!isError && !autoCreate.isPending && !autoCreate.isSuccess && !autoCreate.isError) autoCreate.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isError]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isActive = (href: string) => href === '/dashboard' ? pathname === href : pathname.startsWith(href.split('?')[0]);

  const sidebarStyle: React.CSSProperties = {
    ...s.sidebar,
    width: collapsed ? 48 : sidebarWidth,
    minWidth: collapsed ? 48 : sidebarWidth,
    transition: 'width 0.2s ease, min-width 0.2s ease',
    position: 'relative',
    overflow: 'hidden',
  };

  return (
    <>
      <OnboardingModal />
      <div className="flex h-screen">
        {/* ── Sidebar ── */}
        <aside className="flex flex-col shrink-0" style={sidebarStyle}>

          {/* Brand + toggle */}
          <div
            className="flex items-center justify-between px-2"
            style={{ borderBottom: '1px solid var(--wb-border)', minHeight: 52, paddingTop: 12, paddingBottom: 12 }}
          >
            {!collapsed && (
              <div className="flex items-center gap-2 px-1 flex-1 min-w-0">
                <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--wb-bg-active)' }}>
                  <span className="text-xs font-bold" style={{ color: 'var(--wb-accent)' }}>W</span>
                </div>
                <span className="text-sm font-semibold truncate" style={{ color: 'var(--wb-text)' }}>WaBot</span>
              </div>
            )}
            {collapsed && (
              <div className="flex items-center justify-center flex-1">
                <div className="h-6 w-6 rounded-md flex items-center justify-center" style={{ background: 'var(--wb-bg-active)' }}>
                  <span className="text-xs font-bold" style={{ color: 'var(--wb-accent)' }}>W</span>
                </div>
              </div>
            )}
            <button
              onClick={toggleCollapse}
              className="p-1 rounded transition-colors shrink-0"
              style={{ color: 'var(--wb-text-3)' }}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--wb-bg-hover)'; e.currentTarget.style.color = 'var(--wb-text-2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--wb-text-3)'; }}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          {/* Workspace list — hidden when collapsed */}
          {!collapsed && (
            <div className="px-3 py-3" style={{ borderBottom: '1px solid var(--wb-border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider px-2 mb-1.5" style={{ color: 'var(--wb-text-3)' }}>Workspaces</p>
              <div className="space-y-0.5">
                {workspaces.map((ws) => (
                  <button key={ws.id} onClick={() => setWorkspace(ws)}
                    className="w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors"
                    style={ws.id === activeWorkspace?.id ? { color: 'var(--wb-text)', fontWeight: 600 } : { color: 'var(--wb-text-2)' }}
                    onMouseEnter={(e) => { if (ws.id !== activeWorkspace?.id) e.currentTarget.style.background = 'var(--wb-bg-hover)'; }}
                    onMouseLeave={(e) => { if (ws.id !== activeWorkspace?.id) e.currentTarget.style.background = 'transparent'; }}>
                    {ws.id === activeWorkspace?.id && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'var(--wb-accent)' }} />}
                    <span className="truncate">{ws.name}</span>
                  </button>
                ))}
                {showNewWs ? (
                  <div className="flex gap-1 mt-1">
                    <input autoFocus value={newWsName} onChange={(e) => setNewWsName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newWsName.trim()) createNew.mutate(newWsName.trim());
                        if (e.key === 'Escape') { setShowNewWs(false); setNewWsName(''); }
                      }}
                      placeholder="Workspace name"
                      className="flex-1 min-w-0 text-xs px-2 py-1 rounded focus:outline-none"
                      style={{ background: 'var(--wb-bg)', border: '1px solid var(--wb-border)', color: 'var(--wb-text)' }} />
                    <button onClick={() => newWsName.trim() && createNew.mutate(newWsName.trim())}
                      className="text-xs px-2 py-1 rounded font-medium" style={{ background: 'var(--wb-accent)', color: '#fff' }}>
                      Add
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowNewWs(true)}
                    className="w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-1.5 transition-colors"
                    style={{ color: 'var(--wb-text-3)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--wb-text-2)'; e.currentTarget.style.background = 'var(--wb-bg-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--wb-text-3)'; e.currentTarget.style.background = 'transparent'; }}>
                    <Plus className="h-3.5 w-3.5" /><span>New Workspace</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
            {nav.map(({ href, label, emoji }) => (
              <NavItem key={href + label} href={href} label={label} emoji={emoji} active={isActive(href)}
                collapsed={collapsed}
                dot={href.includes('/inbox') && hasInboxActivity && !pathname.startsWith('/inbox')} />
            ))}
            {isAdmin && (
              <NavItem href="/admin" label="Admin Panel" emoji="🛡️" active={pathname.startsWith('/admin')} collapsed={collapsed} />
            )}
          </nav>

          {/* ── User section ── */}
          <div className="px-2 py-3" style={{ borderTop: '1px solid var(--wb-border)' }}>
            {collapsed ? (
              <div className="flex flex-col items-center gap-1">
                <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: 'var(--wb-bg-active)', color: 'var(--wb-accent)' }}>
                  {initials(user?.name)}
                </div>
                <IconBtn onClick={toggleTheme} title={`Theme: ${theme}`}><ThemeIcon theme={theme} /></IconBtn>
                <IconBtn href="/settings" title="Settings"><Settings className="h-3.5 w-3.5" /></IconBtn>
                <IconBtn onClick={handleLogout} title="Sign out"><LogOut className="h-3.5 w-3.5" /></IconBtn>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-1">
                <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: 'var(--wb-bg-active)', color: 'var(--wb-accent)' }}>
                  {initials(user?.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--wb-text)' }}>
                      {user?.name ?? '—'}
                    </p>
                    {isAdmin && (
                      <span className="text-[10px] font-semibold px-1 py-0.5 rounded shrink-0"
                        style={{ background: 'var(--wb-bg-active)', color: 'var(--wb-accent)', lineHeight: 1 }}>
                        Admin
                      </span>
                    )}
                  </div>
                  <p className="text-xs truncate" style={{ color: 'var(--wb-text-3)' }}>
                    {user?.email ?? ''}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <IconBtn onClick={toggleTheme} title={`Theme: ${theme}`}><ThemeIcon theme={theme} /></IconBtn>
                  <IconBtn href="/settings" title="Settings"><Settings className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn onClick={handleLogout} title="Sign out"><LogOut className="h-3.5 w-3.5" /></IconBtn>
                </div>
              </div>
            )}
          </div>

          {/* Drag-to-resize handle on right edge */}
          {!collapsed && (
            <div
              style={{
                position: 'absolute', right: 0, top: 0, bottom: 0, width: 4,
                cursor: 'col-resize',
              }}
              className="hover:bg-green-500/20 transition-colors"
              onMouseDown={handleDragStart}
            />
          )}
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 flex flex-col overflow-hidden" style={s.main}>
          {/* Trial banner */}
          {trialDaysLeft !== null && trialDaysLeft > 0 && (
            <div className="shrink-0 px-4 py-2 flex items-center justify-between text-sm"
              style={{ background: 'rgba(22,163,74,0.08)', borderBottom: '1px solid rgba(22,163,74,0.15)' }}>
              <span style={{ color: 'var(--wb-text-2)' }}>🎉 Free trial: <strong style={{ color: 'var(--wb-text)' }}>{trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} remaining</strong></span>
              <Link href="/pricing" className="text-xs font-medium px-3 py-1 rounded-full" style={{ background: 'var(--wb-accent)', color: '#fff' }}>Upgrade</Link>
            </div>
          )}
          {trialDaysLeft !== null && trialDaysLeft <= 0 && subscription?.status === 'trial' && (
            <div className="shrink-0 px-4 py-2 flex items-center justify-between text-sm"
              style={{ background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
              <span style={{ color: 'var(--wb-text-2)' }}>Trial expired — upgrade to keep automation running</span>
              <Link href="/pricing" className="text-xs font-medium px-3 py-1 rounded-full bg-red-500 text-white">Upgrade</Link>
            </div>
          )}
          {limitInfo?.type === 'warn' && (
            <div className="shrink-0 px-4 py-2 flex items-center justify-between text-sm"
              style={{ background: 'rgba(234,179,8,0.08)', borderBottom: '1px solid rgba(234,179,8,0.15)' }}>
              <span style={{ color: 'var(--wb-text-2)' }}>⚡ {limitInfo.count} / {limitInfo.limit} conversations used this month</span>
              <Link href="/pricing" className="text-xs font-medium px-3 py-1 rounded-full bg-yellow-500 text-white">Upgrade</Link>
            </div>
          )}
          {limitInfo?.type === 'danger' && (
            <div className="shrink-0 px-4 py-2 flex items-center justify-between text-sm"
              style={{ background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
              <span style={{ color: 'var(--wb-text-2)' }}>Monthly limit reached — upgrade to continue</span>
              <Link href="/pricing" className="text-xs font-medium px-3 py-1 rounded-full bg-red-500 text-white">Upgrade now</Link>
            </div>
          )}
          <div className="flex-1 overflow-auto">{children}</div>
        </main>
      </div>
    </>
  );
}
