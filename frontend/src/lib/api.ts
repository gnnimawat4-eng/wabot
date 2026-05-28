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
export const getFlow = (workspaceId: string, flowId: string) =>
  api.get(`/workspaces/${workspaceId}/flows/${flowId}`).then((r) => r.data);
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

// Locations (tables / rooms)
export const getLocations = (workspaceId: string) =>
  api.get(`/workspaces/${workspaceId}/locations`).then((r) => r.data);
export const createLocation = (workspaceId: string, data: { name: string; location_type: string }) =>
  api.post(`/workspaces/${workspaceId}/locations`, data).then((r) => r.data);
export const updateLocation = (workspaceId: string, locationId: string, name: string) =>
  api.patch(`/workspaces/${workspaceId}/locations/${locationId}`, { name }).then((r) => r.data);
export const deleteLocation = (workspaceId: string, locationId: string) =>
  api.delete(`/workspaces/${workspaceId}/locations/${locationId}`);

// Hotel Rooms
export const getHotelRooms = (workspaceId: string) =>
  api.get(`/workspaces/${workspaceId}/hotel-rooms`).then((r) => r.data);
export const createHotelRoom = (workspaceId: string, room_number: string) =>
  api.post(`/workspaces/${workspaceId}/hotel-rooms`, { room_number }).then((r) => r.data);
export const deleteHotelRoom = (workspaceId: string, roomId: string) =>
  api.delete(`/workspaces/${workspaceId}/hotel-rooms/${roomId}`);
export const checkInGuest = (workspaceId: string, roomId: string, data: Record<string, unknown>) =>
  api.post(`/workspaces/${workspaceId}/hotel-rooms/${roomId}/checkin`, data).then((r) => r.data);
export const checkinRoom = checkInGuest;
export const checkOutGuest = (workspaceId: string, roomId: string) =>
  api.post(`/workspaces/${workspaceId}/hotel-rooms/${roomId}/checkout`).then((r) => r.data);
export const checkoutRoom = checkOutGuest;
export const getRoomBill = (workspaceId: string, roomId: string) =>
  api.get(`/workspaces/${workspaceId}/hotel-rooms/${roomId}/bill`).then((r) => r.data);
export const addBillItem = (workspaceId: string, roomId: string, data: Record<string, unknown>) =>
  api.post(`/workspaces/${workspaceId}/hotel-rooms/${roomId}/bill`, data).then((r) => r.data);
export const deleteBillItem = (workspaceId: string, roomId: string, billId: string) =>
  api.delete(`/workspaces/${workspaceId}/hotel-rooms/${roomId}/bill/${billId}`);
export const sendBillUpdate = (workspaceId: string, roomId: string) =>
  api.post(`/workspaces/${workspaceId}/hotel-rooms/${roomId}/send-bill`).then((r) => r.data);
export const getRoomBills = (workspaceId: string, status?: string) =>
  api.get(`/workspaces/${workspaceId}/room-bills`, { params: status ? { status } : {} }).then((r) => r.data);
export const updateRoomBill = (workspaceId: string, billId: string, data: Record<string, unknown>) =>
  api.patch(`/workspaces/${workspaceId}/room-bills/${billId}`, data).then((r) => r.data);

// Billing
export const createSubscription = (plan: string, workspaceId: string) =>
  api.post('/billing/subscribe', { plan, workspaceId }).then((r) => r.data);
export const getSubscription = (workspaceId: string) =>
  api.get(`/billing/subscription/${workspaceId}`).then((r) => r.data);

export default api;
