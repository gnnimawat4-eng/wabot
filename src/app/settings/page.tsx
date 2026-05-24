'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkspaceStore } from '@/lib/store';
import { updateWorkspace, getSubscription, createSubscription } from '@/lib/api';
import { toast } from 'sonner';

const PLANS = [
  { id: 'starter', name: 'Starter', price: '₹7,999/mo', desc: 'For solo agents — 1 workspace, 1,000 contacts' },
  { id: 'growth', name: 'Growth', price: '₹14,999/mo', desc: 'For growing teams — 3 workspaces, 10,000 contacts' },
  { id: 'agency', name: 'Agency', price: '₹24,999/mo', desc: 'Unlimited workspaces, 50,000 contacts, white-label' },
];

export default function SettingsPage() {
  const { activeWorkspace, setWorkspaces, workspaces } = useWorkspaceStore();
  const qc = useQueryClient();

  const [wsName, setWsName] = useState('');
  const [waForm, setWaForm] = useState({
    wa_phone_number_id: '',
    wa_phone_number: '',
    wa_access_token: '',
    wa_business_id: '',
  });

  useEffect(() => {
    if (activeWorkspace) {
      setWsName(activeWorkspace.name ?? '');
      setWaForm({
        wa_phone_number_id: activeWorkspace.wa_phone_number_id ?? '',
        wa_phone_number: activeWorkspace.wa_phone_number ?? '',
        wa_access_token: activeWorkspace.wa_access_token ?? '',
        wa_business_id: activeWorkspace.wa_business_id ?? '',
      });
    }
  }, [activeWorkspace]);

  const saveWorkspaceName = useMutation({
    mutationFn: () => updateWorkspace(activeWorkspace!.id, { name: wsName }),
    onSuccess: (updated) => {
      const next = workspaces.map((ws) => (ws.id === updated.id ? updated : ws));
      setWorkspaces(next);
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Workspace saved');
    },
    onError: () => toast.error('Failed to save'),
  });

  const saveWa = useMutation({
    mutationFn: () => updateWorkspace(activeWorkspace!.id, waForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('WhatsApp settings saved');
    },
    onError: () => toast.error('Failed to save'),
  });

  const { data: sub } = useQuery({
    queryKey: ['subscription', activeWorkspace?.id],
    queryFn: () => getSubscription(activeWorkspace!.id),
    enabled: !!activeWorkspace,
  });

  const subscribe = useMutation({
    mutationFn: (plan: string) => createSubscription(plan, activeWorkspace!.id),
    onSuccess: (data) => {
      if (data.shortUrl) window.open(data.shortUrl, '_blank');
    },
    onError: () => toast.error('Failed to create subscription'),
  });

  const webhookUrl = typeof window !== 'undefined'
    ? `${process.env.NEXT_PUBLIC_API_URL}/webhook/whatsapp`
    : '';

  return (
    <AppShell>
      <div className="p-6 max-w-2xl">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Settings</h1>
          <p className="text-sm text-white/40 mt-0.5">Manage your workspace and integrations</p>
        </div>

        <Tabs defaultValue="workspace">
          <TabsList className="mb-6 bg-white/5 border border-white/8">
            <TabsTrigger value="workspace" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">Workspace</TabsTrigger>
            <TabsTrigger value="whatsapp" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">WhatsApp</TabsTrigger>
            <TabsTrigger value="billing" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">Billing</TabsTrigger>
          </TabsList>

          {/* Workspace tab */}
          <TabsContent value="workspace">
            <Card className="bg-white/5 border-white/8">
              <CardHeader>
                <CardTitle className="text-white">Workspace Settings</CardTitle>
                <CardDescription className="text-white/40">Manage your workspace details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-white/70">Workspace Name</label>
                  <Input
                    className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-green-500/50"
                    placeholder="e.g. Acme Corp"
                    value={wsName}
                    onChange={(e) => setWsName(e.target.value)}
                    disabled={!activeWorkspace}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-white/40">Workspace ID</label>
                  <Input
                    className="mt-1 bg-white/5 border-white/10 text-white/30 font-mono text-xs"
                    readOnly
                    value={activeWorkspace?.id ?? '—'}
                  />
                </div>
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => saveWorkspaceName.mutate()}
                  disabled={saveWorkspaceName.isPending || !activeWorkspace || !wsName.trim()}
                >
                  {saveWorkspaceName.isPending ? 'Saving…' : 'Save'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* WhatsApp tab */}
          <TabsContent value="whatsapp">
            <Card className="bg-white/5 border-white/8">
              <CardHeader>
                <CardTitle className="text-white">WhatsApp Business Connection</CardTitle>
                <CardDescription className="text-white/40">Connect your Meta WhatsApp Business account</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-white/70">Phone Number ID</label>
                  <Input
                    className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/25"
                    placeholder="From Meta Business Manager"
                    value={waForm.wa_phone_number_id}
                    onChange={(e) => setWaForm({ ...waForm, wa_phone_number_id: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-white/70">Display Phone Number</label>
                  <Input
                    className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/25"
                    placeholder="+91 99999 99999"
                    value={waForm.wa_phone_number}
                    onChange={(e) => setWaForm({ ...waForm, wa_phone_number: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-white/70">Access Token</label>
                  <Input
                    className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/25"
                    type="password"
                    placeholder="Permanent or temporary access token"
                    value={waForm.wa_access_token}
                    onChange={(e) => setWaForm({ ...waForm, wa_access_token: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-white/70">Webhook URL (copy to Meta)</label>
                  <Input className="mt-1 bg-white/5 border-white/10 text-white/50 font-mono text-xs" readOnly value={webhookUrl} />
                </div>
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => saveWa.mutate()}
                  disabled={saveWa.isPending}
                >
                  {saveWa.isPending ? 'Saving…' : 'Save'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Billing tab */}
          <TabsContent value="billing">
            <div className="space-y-4">
              {sub?.plan && (
                <Card className="border-green-500/30 bg-green-500/10">
                  <CardContent className="p-4">
                    <p className="text-sm font-medium text-green-400">
                      Current plan: <span className="capitalize">{sub.plan}</span>
                    </p>
                    <p className="text-xs text-green-500/70 mt-0.5">Status: {sub.status}</p>
                  </CardContent>
                </Card>
              )}
              {PLANS.map((plan) => (
                <Card key={plan.id} className={`bg-white/5 ${sub?.plan === plan.id ? 'border-green-500/40' : 'border-white/8'}`}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white">{plan.name} — {plan.price}</p>
                      <p className="text-sm text-white/40 mt-0.5">{plan.desc}</p>
                    </div>
                    <Button
                      variant={sub?.plan === plan.id ? 'outline' : 'default'}
                      size="sm"
                      className={sub?.plan === plan.id ? 'border-white/20 text-white/60' : 'bg-green-600 hover:bg-green-700 text-white'}
                      onClick={() => subscribe.mutate(plan.id)}
                      disabled={subscribe.isPending || sub?.plan === plan.id}
                    >
                      {sub?.plan === plan.id ? 'Current' : 'Subscribe'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
