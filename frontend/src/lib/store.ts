import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  wa_phone_number_id?: string;
  wa_phone_number?: string;
  wa_access_token?: string;
  wa_business_id?: string;
  ai_system_prompt?: string;
  business_type?: string | null;
  onboarding_completed?: boolean;
  upi_id?: string | null;
  upi_name?: string | null;
  created_at: string;
}

interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setWorkspaces: (ws: Workspace[]) => void;
  setWorkspace: (ws: Workspace) => void;
  removeWorkspace: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      workspaces: [],
      activeWorkspace: null,
      // Preserve the user's selection when the list refreshes; only fall back
      // to workspaces[0] when the previously-selected workspace no longer exists.
      setWorkspaces: (workspaces) =>
        set((state) => ({
          workspaces,
          activeWorkspace:
            workspaces.find((w) => w.id === state.activeWorkspace?.id) ??
            workspaces[0] ??
            null,
        })),
      setWorkspace: (activeWorkspace) => set({ activeWorkspace }),
      removeWorkspace: (id) =>
        set((state) => {
          const remaining = state.workspaces.filter((w) => w.id !== id);
          const active = state.activeWorkspace?.id === id
            ? (remaining[0] ?? null)
            : state.activeWorkspace;
          return { workspaces: remaining, activeWorkspace: active };
        }),
    }),
    {
      name: 'wabot-workspace',
      // Only persist the active selection — the list always comes from the API
      partialize: (state) => ({ activeWorkspace: state.activeWorkspace }),
    }
  )
);
