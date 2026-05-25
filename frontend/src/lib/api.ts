import axios from 'axios';
import { supabase } from './supabase';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  let { data: { session } } = await supabase.auth.getSession();

  // Session missing — attempt a silent refresh before failing
  if (!session) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    session = refreshed.session;
  }

  if (!session) throw new Error('Not authenticated');

  config.headers['Authorization'] = `Bearer ${session.access_token}`;
  config.headers['Content-Type'] = 'application/json';
  return config;
});

// Workspaces
export const getWorkspaces = () => api.get('/workspaces').then((r) => r.data);
export const createWorkspace = (name: string) => api.post('/workspaces', { name }).then((r) => r.data);
export const updateWorkspace = (id: string, data: Record<string, unknown>) =>
  api.patch(`/workspaces/${id}`, data).then((r) => r.data);
export const getWorkspaceStats = (id: string) => api.get(`/workspaces/${id}/stats`).then((r) => r.data);

// Contacts
export const getContacts = (workspaceId: string, params?: Record<string, unknown>) =>
  api.get(`/workspaces/${workspaceId}/contacts`, { params }).then((r) => r.data);
export const createContact = (workspaceId: string, data: Record<string, unknown>) =>
  api.post(`/workspaces/${workspaceId}/contacts`, data).then((r) => r.data);
export const updateContact = (workspaceId: string, contactId: string, data: Record<string, unknown>) =>
  api.patch(`/workspaces/${workspaceId}/contacts/${contactId}`, data).then((r) => r.data);
export const deleteContact = (workspaceId: string, contactId: string) =>
  api.delete(`/workspaces/${workspaceId}/contacts/${contactId}`);
export const importContacts = (workspaceId: string, contacts: unknown[]) =>
  api.post(`/workspaces/${workspaceId}/contacts/import`, { contacts }).then((r) => r.data);
export const getMessages = (workspaceId: string, contactId: string) =>
  api.get(`/workspaces/${workspaceId}/contacts/${contactId}/messages`).then((r) => r.data);

// Flows
export const getFlows = (workspaceId: string) =>
  api.get(`/workspaces/${workspaceId}/flows`).then((r) => r.data);
export const createFlow = (workspaceId: string, data: Record<string, unknown>) =>
  api.post(`/workspaces/${workspaceId}/flows`, data).then((r) => r.data);
export const updateFlow = (workspaceId: string, flowId: string, data: Record<string, unknown>) =>
  api.patch(`/workspaces/${workspaceId}/flows/${flowId}`, data).then((r) => r.data);
export const deleteFlow = (workspaceId: string, flowId: string) =>
  api.delete(`/workspaces/${workspaceId}/flows/${flowId}`);
export const updateFlowSteps = (workspaceId: string, flowId: string, steps: unknown[]) =>
  api.put(`/workspaces/${workspaceId}/flows/${flowId}/steps`, { steps }).then((r) => r.data);

// Broadcasts
export const getBroadcasts = (workspaceId: string) =>
  api.get(`/workspaces/${workspaceId}/broadcasts`).then((r) => r.data);
export const createBroadcast = (workspaceId: string, data: Record<string, unknown>) =>
  api.post(`/workspaces/${workspaceId}/broadcasts`, data).then((r) => r.data);
export const getBroadcast = (workspaceId: string, broadcastId: string) =>
  api.get(`/workspaces/${workspaceId}/broadcasts/${broadcastId}`).then((r) => r.data);

// Billing
export const createSubscription = (plan: string, workspaceId: string) =>
  api.post('/billing/subscribe', { plan, workspaceId }).then((r) => r.data);
export const getSubscription = (workspaceId: string) =>
  api.get(`/billing/subscription/${workspaceId}`).then((r) => r.data);

export default api;
