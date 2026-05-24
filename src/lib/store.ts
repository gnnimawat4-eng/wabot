import { create } from 'zustand';

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

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaces: [],
  activeWorkspace: null,
  setWorkspaces: (workspaces) => set({ workspaces, activeWorkspace: workspaces[0] ?? null }),
  setWorkspace: (activeWorkspace) => set({ activeWorkspace }),
}));
