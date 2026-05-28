'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { useWorkspaceStore } from '@/lib/store';
import { getContacts, getBusinessAppointments } from '@/lib/api';
import { initials } from '@/lib/utils';

export default function PatientsPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const [search, setSearch] = useState('');

  const { data: contactsData, isLoading } = useQuery({
    queryKey: ['contacts-patients', activeWorkspace?.id],
    queryFn: () => getContacts(activeWorkspace!.id, { limit: 200 }),
    enabled: !!activeWorkspace,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments-all', activeWorkspace?.id],
    queryFn: () => getBusinessAppointments(activeWorkspace!.id, 'appointment'),
    enabled: !!activeWorkspace,
  });

  const contacts = (contactsData?.data ?? []) as Array<{ id: string; name: string; phone: string; created_at: string; stage?: string }>;

  const apptByPhone = (appointments as Array<{ client_phone?: string; status: string }>).reduce<Record<string, number>>((acc, a) => {
    const p = a.client_phone ?? '';
    if (p) acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {});

  const filtered = contacts.filter((c) =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  );

  return (
    <AppShell>
      <div className="p-6 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Patients</h1>
          <p className="text-sm text-white/40 mt-0.5">{filtered.length} patients</p>
        </div>

        {!activeWorkspace ? (
          <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
            <p className="text-white/40 text-sm">Select a workspace to view patients.</p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or phone…"
                className="w-full max-w-sm rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-green-500/60 placeholder:text-white/20"
              />
            </div>

            {isLoading ? (
              <div className="rounded-xl bg-white/5 border border-white/8 p-8 text-center text-white/30 animate-pulse">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
                <p className="text-4xl mb-3">🏥</p>
                <p className="text-white/40 text-sm">No patients yet. They appear here when they message your WhatsApp.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-white/8 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/8 bg-white/3">
                      <th className="text-left text-xs text-white/40 font-medium px-4 py-3">Patient</th>
                      <th className="text-left text-xs text-white/40 font-medium px-4 py-3">Phone</th>
                      <th className="text-left text-xs text-white/40 font-medium px-4 py-3">Appointments</th>
                      <th className="text-left text-xs text-white/40 font-medium px-4 py-3">Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c, i) => (
                      <tr key={c.id} className={`border-b border-white/5 last:border-0 ${i % 2 ? 'bg-white/[0.02]' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-blue-500/20 text-blue-400 text-xs font-semibold flex items-center justify-center shrink-0">
                              {initials(c.name)}
                            </div>
                            <span className="text-white font-medium">{c.name || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white/50 font-mono text-xs">{c.phone}</td>
                        <td className="px-4 py-3">
                          {(apptByPhone[c.phone] ?? 0) > 0 ? (
                            <span className="text-blue-400 font-medium">{apptByPhone[c.phone]} appt{apptByPhone[c.phone] !== 1 ? 's' : ''}</span>
                          ) : (
                            <span className="text-white/20">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-white/40 text-xs">
                          {new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
