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
  created_at: string;
}

interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setWorkspaces: (ws: Workspace[]) => void;
  setWorkspace: (ws: Workspace) => void;
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
    }),
    {
      name: 'wabot-workspace',
      // Only persist the active selection — the list always comes from the API
      partialize: (state) => ({ activeWorkspace: state.activeWorkspace }),
    }
  )
);
