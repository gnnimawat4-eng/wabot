'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, AlertTriangle } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWorkspaceStore } from '@/lib/store';
import { createWorkspace, updateWorkspace, getSubscription, createSubscription } from '@/lib/api';
import { BUSINESS_TYPES, type BusinessType } from '@/lib/businessConfig';
import { toast } from 'sonner';

const PLANS = [
  { id: 'starter', name: 'Starter', price: '₹7,999/mo', desc: 'For solo agents — 1 workspace, 1,000 contacts' },
  { id: 'growth', name: 'Growth', price: '₹14,999/mo', desc: 'For growing teams — 3 workspaces, 10,000 contacts' },
  { id: 'agency', name: 'Agency', price: '₹24,999/mo', desc: 'Unlimited workspaces, 50,000 contacts, white-label' },
];

const AI_LANGUAGES = [
  { value: 'auto', label: 'Auto-detect (recommended)' },
  { value: 'english', label: 'Always English' },
  { value: 'hindi', label: 'Always Hindi' },
];

function Toggle({ enabled, onChange, label, description }: {
  enabled: boolean; onChange: (v: boolean) => void; label: string; description: string;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-white/80">{label}</p>
        <p className="text-xs text-white/40 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? 'bg-green-500' : 'bg-white/10'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

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

  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [btChanged, setBtChanged] = useState(false);

  // AI settings — toggles stored in localStorage; system prompt saved to workspace in DB
  const [aiEnabled, setAiEnabled] = useState(true);
  const [langDetect, setLangDetect] = useState(false);
  const [aiLang, setAiLang] = useState('auto');
  const [aiSaved, setAiSaved] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');

  useEffect(() => {
    if (activeWorkspace) {
      setWsName(activeWorkspace.name ?? '');
      setWaForm({
        wa_phone_number_id: activeWorkspace.wa_phone_number_id ?? '',
        wa_phone_number: activeWorkspace.wa_phone_number ?? '',
        wa_access_token: activeWorkspace.wa_access_token ?? '',
        wa_business_id: activeWorkspace.wa_business_id ?? '',
      });
      setSystemPrompt(activeWorkspace.ai_system_prompt ?? '');
      setBusinessType((activeWorkspace.business_type as BusinessType) ?? null);
      setBtChanged(false);
    }
    const stored = localStorage.getItem('wabot_ai_settings');
    if (stored) {
      try {
        const { aiEnabled: ae, langDetect: ld, aiLang: al } = JSON.parse(stored);
        if (ae !== undefined) setAiEnabled(ae);
        if (ld !== undefined) setLangDetect(ld);
        if (al !== undefined) setAiLang(al);
      } catch { /* ignore */ }
    }
  }, [activeWorkspace]);

  const saveAiSystemPrompt = useMutation({
    mutationFn: () => updateWorkspace(activeWorkspace!.id, { ai_system_prompt: systemPrompt }),
    onSuccess: (result) => {
      const next = workspaces.map((ws) => (ws.id === result.id ? result : ws));
      setWorkspaces(next);
      qc.invalidateQueries({ queryKey: ['workspaces'] });
    },
    onError: () => toast.error('Failed to save system prompt'),
  });

  const saveAiSettings = () => {
    localStorage.setItem('wabot_ai_settings', JSON.stringify({ aiEnabled, langDetect, aiLang }));
    if (activeWorkspace) saveAiSystemPrompt.mutate();
    setAiSaved(true);
    toast.success('AI settings saved');
    setTimeout(() => setAiSaved(false), 2000);
  };

  const saveWorkspaceName = useMutation({
    mutationFn: () =>
      activeWorkspace
        ? updateWorkspace(activeWorkspace.id, { name: wsName })
        : createWorkspace(wsName),
    onSuccess: (result) => {
      if (activeWorkspace) {
        const next = workspaces.map((ws) => (ws.id === result.id ? result : ws));
        setWorkspaces(next);
      } else {
        setWorkspaces([result]);
      }
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success(activeWorkspace ? 'Workspace saved' : 'Workspace created!');
    },
    onError: () => toast.error('Failed to save'),
  });

  const saveBusinessType = useMutation({
    mutationFn: () => updateWorkspace(activeWorkspace!.id, { business_type: businessType }),
    onSuccess: (result) => {
      const next = workspaces.map((ws) => (ws.id === result.id ? result : ws));
      setWorkspaces(next);
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      setBtChanged(false);
      toast.success('Business type updated — dashboard has been personalised');
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
            <TabsTrigger value="ai" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">AI</TabsTrigger>
            <TabsTrigger value="billing" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">Billing</TabsTrigger>
          </TabsList>

          {/* Workspace tab */}
          <TabsContent value="workspace">
            <Card className="bg-white/5 border-white/8">
              <CardHeader>
                <CardTitle className="text-white">
                  {activeWorkspace ? 'Workspace Settings' : 'Create Your Workspace'}
                </CardTitle>
                <CardDescription className="text-white/40">
                  {activeWorkspace
                    ? 'Update your workspace name and details'
                    : 'You need a workspace to use WaBot. Create one to get started.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-white/70">Workspace Name</label>
                  <Input
                    className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-green-500/50"
                    placeholder="e.g. Acme Corp"
                    value={wsName}
                    onChange={(e) => setWsName(e.target.value)}
                  />
                </div>
                {activeWorkspace && (
                  <div>
                    <label className="text-sm font-medium text-white/40">Workspace ID</label>
                    <Input
                      className="mt-1 bg-white/5 border-white/10 text-white/30 font-mono text-xs"
                      readOnly
                      value={activeWorkspace.id}
                    />
                  </div>
                )}
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => saveWorkspaceName.mutate()}
                  disabled={saveWorkspaceName.isPending || !wsName.trim()}
                >
                  {saveWorkspaceName.isPending
                    ? (activeWorkspace ? 'Saving…' : 'Creating…')
                    : (activeWorkspace ? 'Save' : 'Create Workspace')}
                </Button>

                {/* Business Type */}
                {activeWorkspace && (
                  <div className="pt-2 border-t border-white/5">
                    <label className="text-sm font-medium text-white/70">Business Type</label>
                    <p className="text-xs text-white/40 mt-0.5 mb-3">
                      Dashboard aur sidebar aapke business ke hisaab se badal jaata hai
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {BUSINESS_TYPES.map((biz) => (
                        <button
                          key={biz.type}
                          onClick={() => { setBusinessType(biz.type); setBtChanged(true); }}
                          className={`
                            relative rounded-lg p-3 text-left transition-all border text-sm
                            ${businessType === biz.type
                              ? 'border-green-500 bg-green-500/10'
                              : 'border-white/8 bg-white/5 hover:bg-white/8 hover:border-white/15'
                            }
                          `}
                        >
                          <span className="text-lg block mb-1">{biz.emoji}</span>
                          <p className="font-medium text-white text-xs leading-tight">{biz.label}</p>
                          <p className="text-white/35 text-xs mt-0.5 leading-snug">{biz.subtitle}</p>
                        </button>
                      ))}
                    </div>

                    {btChanged && businessType !== activeWorkspace.business_type && (
                      <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
                        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-400">
                          Business type change karne se aapka dashboard aur sidebar badal jayega.
                        </p>
                      </div>
                    )}

                    <Button
                      className="mt-3 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => saveBusinessType.mutate()}
                      disabled={saveBusinessType.isPending || !btChanged || !businessType}
                    >
                      {saveBusinessType.isPending ? 'Saving…' : 'Save Business Type'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* WhatsApp tab */}
          <TabsContent value="whatsapp">
            {!activeWorkspace ? (
              <Card className="bg-white/5 border-white/8">
                <CardContent className="p-6 text-center text-white/40 text-sm">
                  Create a workspace first in the Workspace tab.
                </CardContent>
              </Card>
            ) : (
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
                    <label className="text-sm font-medium text-white/70">WhatsApp Business Account ID</label>
                    <Input
                      className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/25"
                      placeholder="e.g. 123456789012345"
                      value={waForm.wa_business_id}
                      onChange={(e) => setWaForm({ ...waForm, wa_business_id: e.target.value })}
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
            )}
          </TabsContent>

          {/* AI tab */}
          <TabsContent value="ai">
            <Card className="bg-white/5 border-white/8">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-green-500/15">
                    <Bot className="h-4 w-4 text-green-400" />
                  </div>
                  <div>
                    <CardTitle className="text-white">AI Settings</CardTitle>
                    <CardDescription className="text-white/40">
                      Configure the Groq-powered smart reply assistant
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-1 divide-y divide-white/5">
                <Toggle
                  enabled={aiEnabled}
                  onChange={setAiEnabled}
                  label="AI Smart Reply"
                  description="Automatically reply when no flow matches the customer's message"
                />
                <Toggle
                  enabled={langDetect}
                  onChange={setLangDetect}
                  label="Auto Language Detection"
                  description="Auto-detect customer language (Default: English — switches to Hindi only on explicit request)"
                />
                <div className="py-3 space-y-2">
                  <div>
                    <p className="text-sm font-medium text-white/80">AI Response Language</p>
                    <p className="text-xs text-white/40 mt-0.5 mb-2">Override language detection with a fixed language</p>
                  </div>
                  <Select value={aiLang} onValueChange={(v) => v && setAiLang(v)} disabled={langDetect}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white disabled:opacity-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d1424] border-white/10 text-white">
                      {AI_LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value} className="hover:bg-white/5 focus:bg-white/5">
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {langDetect && (
                    <p className="text-xs text-white/30">Disable Auto Language Detection to set a fixed language</p>
                  )}
                </div>
                <div className="py-3 space-y-2">
                  <div>
                    <p className="text-sm font-medium text-white/80">System Prompt</p>
                    <p className="text-xs text-white/40 mt-0.5 mb-2">
                      Tell AI about this business — timings, menu, services, FAQs
                    </p>
                  </div>
                  <textarea
                    rows={5}
                    className="w-full rounded-md bg-white/5 border border-white/10 text-white placeholder:text-white/25 text-sm px-3 py-2 resize-none focus:outline-none focus:border-green-500/50 disabled:opacity-40"
                    placeholder="Example: You are assistant for XYZ Restaurant. Shop opens at 10 AM, closes at 10 PM. Menu includes..."
                    value={systemPrompt}
                    disabled={!activeWorkspace}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                  />
                  {!activeWorkspace && (
                    <p className="text-xs text-white/30">Create a workspace first to save the system prompt</p>
                  )}
                </div>

                <div className="pt-2">
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={saveAiSettings}
                  >
                    {aiSaved ? (
                      <><Check className="h-4 w-4 mr-1.5" />Saved</>
                    ) : 'Save AI Settings'}
                  </Button>
                  <p className="text-xs text-white/25 mt-2">
                    Requires <code className="text-white/40">GROQ_API_KEY</code> set on the backend server
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Billing tab */}
          <TabsContent value="billing">
            {!activeWorkspace ? (
              <Card className="bg-white/5 border-white/8">
                <CardContent className="p-6 text-center text-white/40 text-sm">
                  Create a workspace first in the Workspace tab.
                </CardContent>
              </Card>
            ) : (
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
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
