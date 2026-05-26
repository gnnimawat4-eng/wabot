'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateWorkspace, createFlow } from '@/lib/api';
import { useWorkspaceStore } from '@/lib/store';
import { BUSINESS_TYPES, type BusinessType } from '@/lib/businessConfig';

export function OnboardingModal() {
  const { activeWorkspace, setWorkspaces, workspaces } = useWorkspaceStore();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<BusinessType | null>(null);
  const [step, setStep] = useState<'select' | 'creating'>('select');

  const complete = useMutation({
    mutationFn: async () => {
      if (!selected || !activeWorkspace) throw new Error('No selection');

      // Save business type + mark onboarding done
      const updated = await updateWorkspace(activeWorkspace.id, {
        business_type: selected,
        onboarding_completed: true,
      });

      // Create pre-built flows for this business type
      const config = BUSINESS_TYPES.find((b) => b.type === selected);
      if (config) {
        await Promise.allSettled(
          config.flowTemplates.map((tpl) =>
            createFlow(activeWorkspace.id, {
              name: tpl.name,
              trigger: tpl.trigger,
              steps: tpl.steps,
            })
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
      toast.success('Setup complete! Pre-built flows created 🚀');
    },
    onError: () => toast.error('Setup failed — please try again'),
  });

  if (!activeWorkspace || activeWorkspace.onboarding_completed) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#060b17]/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-green-500/15 mb-4">
            <span className="text-3xl">🚀</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Aapka business kya hai?</h1>
          <p className="text-white/50 text-sm">
            Hum aapke liye personalized dashboard banayenge
          </p>
        </div>

        {/* Business type grid */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {BUSINESS_TYPES.map((biz) => (
            <button
              key={biz.type}
              onClick={() => setSelected(biz.type)}
              className={`
                relative rounded-xl p-4 text-left transition-all border
                ${selected === biz.type
                  ? 'border-green-500 bg-green-500/10 shadow-lg shadow-green-500/10'
                  : 'border-white/8 bg-white/5 hover:bg-white/8 hover:border-white/15'
                }
              `}
            >
              {selected === biz.type && (
                <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              <span className="text-2xl block mb-2">{biz.emoji}</span>
              <p className="text-sm font-semibold text-white leading-tight">{biz.label}</p>
              <p className="text-xs text-white/40 mt-1 leading-snug">{biz.subtitle}</p>
            </button>
          ))}
        </div>

        {/* Selected preview */}
        {selected && (
          <div className="mb-6 rounded-xl bg-green-500/8 border border-green-500/20 px-4 py-3">
            <p className="text-sm text-green-400">
              <span className="font-semibold">{BUSINESS_TYPES.find(b => b.type === selected)?.emoji} {BUSINESS_TYPES.find(b => b.type === selected)?.label}</span>
              {' '}select kiya — hum{' '}
              <span className="font-semibold">{BUSINESS_TYPES.find(b => b.type === selected)?.flowTemplates.length} ready-made flows</span>
              {' '}aur personalized dashboard banayenge!
            </p>
          </div>
        )}

        {/* CTA */}
        <Button
          className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-base font-semibold disabled:opacity-40"
          disabled={!selected || complete.isPending}
          onClick={() => { setStep('creating'); complete.mutate(); }}
        >
          {complete.isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Setup ho raha hai…
            </span>
          ) : (
            'Continue →'
          )}
        </Button>

        <p className="text-center text-xs text-white/25 mt-3">
          Baad mein Settings mein change kar sakte hain
        </p>
      </div>
    </div>
  );
}
