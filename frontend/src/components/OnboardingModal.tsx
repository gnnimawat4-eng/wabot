'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Check, ArrowRight, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { updateWorkspace, createFlow } from '@/lib/api';
import { useWorkspaceStore } from '@/lib/store';
import { BUSINESS_TYPES, type BusinessType } from '@/lib/businessConfig';

const STEPS = ['Business Type', 'Business Name', 'WhatsApp Setup', 'First Flow', 'All Set!'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-8">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full transition-all ${i < current ? 'bg-green-400' : i === current ? 'bg-green-400 w-6' : 'bg-white/15'}`} title={label} />
        </div>
      ))}
    </div>
  );
}

export function OnboardingModal() {
  const { activeWorkspace, setWorkspaces, workspaces } = useWorkspaceStore();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<BusinessType | null>(null);
  const [bizName, setBizName] = useState('');
  const [selectedTemplates, setSelectedTemplates] = useState<number[]>([]);

  const businessConfig = BUSINESS_TYPES.find((b) => b.type === selected);

  const complete = useMutation({
    mutationFn: async () => {
      if (!activeWorkspace) throw new Error('No workspace');
      const finalName = bizName.trim() || activeWorkspace.name;

      const updated = await updateWorkspace(activeWorkspace.id, {
        name: finalName,
        business_type: selected || activeWorkspace.business_type,
        onboarding_completed: true,
      });

      // Create selected (or all) flow templates
      const config = BUSINESS_TYPES.find((b) => b.type === (selected || activeWorkspace.business_type));
      if (config) {
        const templatesToCreate = selectedTemplates.length > 0
          ? config.flowTemplates.filter((_, i) => selectedTemplates.includes(i))
          : config.flowTemplates;
        await Promise.allSettled(
          templatesToCreate.map((tpl) =>
            createFlow(activeWorkspace.id, { name: tpl.name, trigger: tpl.trigger, steps: tpl.steps })
          )
        );
      }
      return updated;
    },
    onSuccess: (updated) => {
      const next = workspaces.map((ws) => (ws.id === updated.id ? updated : ws));
      setWorkspaces(next);
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      qc.invalidateQueries({ queryKey: ['flows', activeWorkspace?.id] });
    },
    onError: () => toast.error('Setup failed — please try again'),
  });

  if (!activeWorkspace || activeWorkspace.onboarding_completed) return null;

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="fixed inset-0 z-50 bg-[#060b17]/95 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl py-8">
        <div className="text-center mb-2">
          <span className="text-xs text-white/30 font-medium">Step {step + 1} of {STEPS.length}</span>
        </div>

        <StepIndicator current={step} />

        {/* ── Step 0: Business Type ── */}
        {step === 0 && (
          <div>
            <div className="text-center mb-8">
              <p className="text-2xl font-bold text-white mb-2">What type of business do you run?</p>
              <p className="text-white/40 text-sm">We'll set up your dashboard and automation flows for you</p>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-8">
              {BUSINESS_TYPES.map((biz) => (
                <button
                  key={biz.type}
                  onClick={() => setSelected(biz.type)}
                  className={`relative rounded-xl p-4 text-left transition-all border ${
                    selected === biz.type
                      ? 'border-green-500 bg-green-500/10 shadow-lg shadow-green-500/10'
                      : 'border-white/8 bg-white/5 hover:bg-white/8 hover:border-white/15'
                  }`}
                >
                  {selected === biz.type && (
                    <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    </div>
                  )}
                  <span className="text-2xl block mb-2">{biz.emoji}</span>
                  <p className="text-sm font-semibold text-white leading-tight">{biz.label}</p>
                  <p className="text-xs text-white/40 mt-1">{biz.subtitle}</p>
                </button>
              ))}
            </div>
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-base font-semibold"
              disabled={!selected}
              onClick={next}
            >
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* ── Step 1: Business Name ── */}
        {step === 1 && (
          <div>
            <div className="text-center mb-8">
              <span className="text-4xl">{businessConfig?.emoji ?? '🏢'}</span>
              <p className="text-2xl font-bold text-white mt-3 mb-2">What's your business name?</p>
              <p className="text-white/40 text-sm">This will appear in your WhatsApp messages to customers</p>
            </div>
            <div className="mb-8">
              <input
                autoFocus
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && next()}
                placeholder={`e.g. Raj's ${businessConfig?.label ?? 'Business'}`}
                className="w-full rounded-xl bg-white/5 border border-white/10 text-white text-lg px-5 py-4 focus:outline-none focus:border-green-500/60 placeholder:text-white/20 text-center"
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={prev} className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 border border-white/10">Back</Button>
              <Button onClick={next} disabled={!bizName.trim()} className="flex-1 bg-green-600 hover:bg-green-700 text-white h-11 font-semibold">
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: WhatsApp Setup ── */}
        {step === 2 && (
          <div>
            <div className="text-center mb-8">
              <span className="text-4xl">📱</span>
              <p className="text-2xl font-bold text-white mt-3 mb-2">Connect your WhatsApp number</p>
              <p className="text-white/40 text-sm">Follow these steps to connect your WhatsApp Business account</p>
            </div>
            <div className="space-y-3 mb-8">
              {[
                { step: '1', text: 'Go to Meta Business Manager', sub: 'business.facebook.com', link: 'https://business.facebook.com' },
                { step: '2', text: 'Create a WhatsApp Business Account', sub: 'Under Business Settings → WhatsApp Accounts', link: null },
                { step: '3', text: 'Get your Phone Number ID & Access Token', sub: 'Meta Developer Portal → Your App → WhatsApp', link: 'https://developers.facebook.com' },
                { step: '4', text: 'Enter credentials in Settings → WhatsApp', sub: 'You can do this after completing setup', link: null },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-4 rounded-xl bg-white/5 border border-white/8 px-4 py-3">
                  <span className="flex-shrink-0 h-7 w-7 rounded-full bg-green-500/20 text-green-400 text-sm font-bold flex items-center justify-center">{item.step}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{item.text}</p>
                    <p className="text-xs text-white/40">{item.sub}</p>
                  </div>
                  {item.link && (
                    <a href={item.link} target="_blank" rel="noreferrer" className="text-white/30 hover:text-white/60">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <Button onClick={prev} className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 border border-white/10">Back</Button>
              <Button onClick={next} className="flex-1 bg-green-600 hover:bg-green-700 text-white h-11 font-semibold">
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Flow Templates ── */}
        {step === 3 && (
          <div>
            <div className="text-center mb-8">
              <span className="text-4xl">🤖</span>
              <p className="text-2xl font-bold text-white mt-3 mb-2">Create your first automation flows</p>
              <p className="text-white/40 text-sm">Select the flows you want to create (or create all)</p>
            </div>
            <div className="space-y-2 mb-6">
              {(businessConfig?.flowTemplates ?? []).map((tpl, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedTemplates((prev) =>
                    prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
                  )}
                  className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left border transition-all ${
                    selectedTemplates.includes(i) || selectedTemplates.length === 0
                      ? 'border-green-500/30 bg-green-500/8'
                      : 'border-white/8 bg-white/3'
                  }`}
                >
                  <div className={`h-5 w-5 rounded border flex items-center justify-center flex-shrink-0 ${
                    selectedTemplates.includes(i) || selectedTemplates.length === 0
                      ? 'bg-green-500 border-green-500'
                      : 'border-white/20'
                  }`}>
                    {(selectedTemplates.includes(i) || selectedTemplates.length === 0) && (
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{tpl.name}</p>
                    <p className="text-xs text-white/40">Trigger: {tpl.trigger.keyword || tpl.trigger.type}</p>
                  </div>
                </button>
              ))}
              {!businessConfig?.flowTemplates?.length && (
                <p className="text-white/30 text-sm text-center py-4">No templates for this business type</p>
              )}
            </div>
            <div className="flex gap-3">
              <Button onClick={prev} className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 border border-white/10">Back</Button>
              <Button
                onClick={() => { complete.mutate(); next(); }}
                disabled={complete.isPending}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white h-11 font-semibold"
              >
                {complete.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : 'Create Flows & Continue'}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Ready! ── */}
        {step === 4 && (
          <div className="text-center">
            <div className="text-6xl mb-4 animate-bounce">🎉</div>
            <p className="text-3xl font-bold text-white mb-3">Your WaBot is ready!</p>
            <p className="text-white/50 mb-2">{bizName || activeWorkspace.name} is all set up</p>
            <div className="flex flex-col items-center gap-2 mb-8">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <Check className="h-4 w-4" /> Business type: {businessConfig?.label ?? 'Configured'}
              </div>
              <div className="flex items-center gap-2 text-sm text-green-400">
                <Check className="h-4 w-4" /> Automation flows created
              </div>
              <div className="flex items-center gap-2 text-sm text-green-400">
                <Check className="h-4 w-4" /> 7-day free trial started 🎁
              </div>
            </div>
            <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-4 mb-8 text-sm text-green-300">
              🎁 <strong>Free Trial Active</strong> — 7 days free, no credit card required.
              <br />Upgrade anytime to keep your automation running.
            </div>
            <Button
              onClick={() => {
                const next = workspaces.map((ws) => ws.id === activeWorkspace.id ? { ...ws, onboarding_completed: true } : ws);
                setWorkspaces(next);
              }}
              className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-base font-semibold"
            >
              Go to Dashboard 🚀
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
