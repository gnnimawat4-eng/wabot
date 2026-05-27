'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Plus, Trash2, Download, Printer, Pencil, Check, X, LogIn, LogOut, Receipt, Send } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/lib/store';
import {
  getLocations, createLocation, updateLocation, deleteLocation,
  getHotelRooms, createHotelRoom, deleteHotelRoom,
  checkInGuest, checkOutGuest,
  getRoomBill, addBillItem, deleteBillItem, sendBillUpdate,
} from '@/lib/api';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Location {
  id: string;
  name: string;
  location_type: string;
  created_at: string;
}

interface HotelRoom {
  id: string;
  room_number: string;
  status: 'vacant' | 'occupied';
  guest_name: string | null;
  guest_phone: string | null;
  check_in_time: string | null;
  expected_checkout: string | null;
  running_total: number;
}

interface BillItem {
  id: string;
  item_name: string;
  amount: number;
  quantity: number;
  ordered_at: string;
}

// ── QR helpers ────────────────────────────────────────────────────────────────

function buildWaUrl(phone: string | null | undefined, message: string) {
  const clean = (phone ?? '').replace(/\D/g, '');
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

// ── QrCard ────────────────────────────────────────────────────────────────────

function QrCard({
  loc, waUrl, businessName, locationType, onDelete, onRename,
}: {
  loc: Location;
  waUrl: string;
  businessName: string;
  locationType: 'table' | 'room';
  onDelete: () => void;
  onRename: (newName: string) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(loc.name);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, waUrl, {
        width: 200, margin: 1, color: { dark: '#000000', light: '#ffffff' },
      });
    }
  }, [waUrl]);

  useEffect(() => {
    if (editing) {
      setDraft(loc.name);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [editing, loc.name]);

  const commitRename = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === loc.name) { setEditing(false); return; }
    setSaving(true);
    try { await onRename(trimmed); setEditing(false); }
    finally { setSaving(false); }
  };

  const cancelEdit = () => { setDraft(loc.name); setEditing(false); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') cancelEdit();
  };

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const out = document.createElement('canvas');
    out.width = 240; out.height = 300;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 240, 300);
    ctx.fillStyle = '#111827'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(businessName, 120, 24);
    ctx.font = 'bold 18px sans-serif'; ctx.fillStyle = '#000000';
    ctx.fillText(loc.name, 120, 50);
    ctx.drawImage(canvas, 20, 60, 200, 200);
    ctx.font = '13px sans-serif'; ctx.fillStyle = '#374151';
    ctx.fillText(locationType === 'table' ? 'Scan to Order' : 'Scan to Request Service', 120, 276);
    ctx.fillText('on WhatsApp', 120, 294);
    const link = document.createElement('a');
    link.download = `${loc.name.replace(/\s+/g, '-')}-qr.png`;
    link.href = out.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="rounded-xl bg-white/5 border border-white/8 p-5 flex flex-col items-center gap-3 qr-card print:border print:border-gray-300 print:rounded-lg print:p-6 print:bg-white" data-name={loc.name}>
      <div className="print:block hidden text-center">
        <p className="text-sm font-semibold text-gray-600">{businessName}</p>
      </div>
      {editing ? (
        <div className="flex items-center gap-1.5 w-full">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={saving}
            className="flex-1 rounded-md bg-white/10 border border-white/20 text-white text-sm font-bold px-2 py-1 text-center focus:outline-none focus:border-green-500/60"
          />
          <button onClick={commitRename} disabled={saving || !draft.trim()} className="p-1.5 rounded-md bg-green-500/15 hover:bg-green-500/25 text-green-400 disabled:opacity-40">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={cancelEdit} className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/50">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 print:hidden">
          <p className="text-base font-bold text-white">{loc.name}</p>
          <button onClick={() => setEditing(true)} className="p-1 rounded-md text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors" title="Rename">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <p className="hidden print:block text-lg font-bold text-black">{loc.name}</p>
      <canvas ref={canvasRef} className="rounded-lg" style={{ imageRendering: 'pixelated' }} />
      <div className="print:block hidden text-center">
        <p className="text-xs text-gray-500">Scan to {locationType === 'table' ? 'Order' : 'Request Service'}</p>
        <p className="text-xs text-gray-500">on WhatsApp</p>
      </div>
      <div className="flex gap-2 w-full print:hidden">
        <Button size="sm" onClick={downloadPng} className="flex-1 bg-white/8 hover:bg-white/12 text-white/70 hover:text-white border border-white/10">
          <Download className="h-3.5 w-3.5 mr-1.5" />Download PNG
        </Button>
        <Button size="sm" onClick={onDelete} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Check-In Modal ────────────────────────────────────────────────────────────

function CheckInModal({
  room, workspaceId, onClose, onSuccess,
}: { room: HotelRoom; workspaceId: string; onClose: () => void; onSuccess: () => void }) {
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('+91 ');
  const [expectedCheckout, setExpectedCheckout] = useState('');
  const [loading, setLoading] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const handleSubmit = async () => {
    if (!guestName.trim()) { toast.error('Guest name is required'); return; }
    const cleanPhone = guestPhone.replace(/\s/g, '');
    if (!cleanPhone || cleanPhone === '+91') { toast.error('Phone number is required'); return; }
    setLoading(true);
    try {
      await checkInGuest(workspaceId, room.id, {
        guest_name: guestName.trim(),
        guest_phone: cleanPhone,
        expected_checkout: expectedCheckout || null,
      });
      toast.success(`${room.room_number} checked in — WhatsApp welcome sent!`);
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (err as Error)?.message
        || 'Check-in failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Check In — {room.room_number}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/70"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Guest Name *</label>
            <input
              autoFocus
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="e.g. Rahul Sharma"
              className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-green-500/60 placeholder:text-white/20"
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5">WhatsApp Phone *</label>
            <input
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-green-500/60 placeholder:text-white/20"
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Expected Checkout Date</label>
            <input
              type="date"
              min={today}
              value={expectedCheckout}
              onChange={(e) => setExpectedCheckout(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-green-500/60"
              style={{ colorScheme: 'dark' }}
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button onClick={onClose} className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 border border-white/10">Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
            <LogIn className="h-4 w-4 mr-1.5" />
            {loading ? 'Checking in…' : 'Check In & Send WhatsApp'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── View Bill Modal ───────────────────────────────────────────────────────────

function ViewBillModal({
  room, workspaceId, onClose,
}: { room: HotelRoom; workspaceId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [sending, setSending] = useState(false);

  const { data: bills = [], isLoading } = useQuery<BillItem[]>({
    queryKey: ['room-bill', room.id],
    queryFn: () => getRoomBill(workspaceId, room.id),
  });

  const total = bills.reduce((s, b) => s + b.amount * b.quantity, 0);

  const addItem = useMutation({
    mutationFn: () => addBillItem(workspaceId, room.id, {
      item_name: itemName.trim(),
      amount: parseFloat(amount) || 0,
      quantity: parseInt(quantity) || 1,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-bill', room.id] });
      qc.invalidateQueries({ queryKey: ['hotel-rooms', workspaceId] });
      setItemName(''); setAmount(''); setQuantity('1');
    },
    onError: () => toast.error('Failed to add item'),
  });

  const removeItem = useMutation({
    mutationFn: (billId: string) => deleteBillItem(workspaceId, room.id, billId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-bill', room.id] });
      qc.invalidateQueries({ queryKey: ['hotel-rooms', workspaceId] });
    },
    onError: () => toast.error('Failed to remove item'),
  });

  const handleSendBill = async () => {
    setSending(true);
    try {
      await sendBillUpdate(workspaceId, room.id);
      toast.success('Bill sent to guest via WhatsApp!');
    } catch {
      toast.error('Failed to send bill');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white">Bill — {room.room_number}</h2>
            <p className="text-xs text-white/40">{room.guest_name} · {room.guest_phone}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/70"><X className="h-5 w-5" /></button>
        </div>

        {/* Bill items */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="text-center text-white/30 text-sm py-6">Loading…</div>
          ) : bills.length === 0 ? (
            <div className="text-center text-white/20 text-sm py-6">No items yet</div>
          ) : (
            <div className="space-y-2 mb-4">
              {bills.map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{b.item_name}</p>
                    <p className="text-xs text-white/40">x{b.quantity} · ₹{b.amount} each</p>
                  </div>
                  <span className="text-sm font-semibold text-white/80 shrink-0">₹{(b.amount * b.quantity).toFixed(2)}</span>
                  <button onClick={() => removeItem.mutate(b.id)} className="text-red-400/60 hover:text-red-400 shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 border-t border-white/10">
                <span className="text-sm text-white/50">Running Total</span>
                <span className="text-base font-bold text-green-400">₹{total.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Add item form */}
        <div className="border-t border-white/10 pt-4 mt-2">
          <p className="text-xs text-white/40 mb-2">Add Item</p>
          <div className="flex gap-2 mb-3">
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="Item name"
              className="flex-1 rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-green-500/60 placeholder:text-white/20"
            />
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="₹ amt"
              type="number"
              min="0"
              className="w-20 rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-green-500/60 placeholder:text-white/20"
            />
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="qty"
              type="number"
              min="1"
              className="w-14 rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-green-500/60 placeholder:text-white/20"
            />
            <Button
              size="sm"
              onClick={() => { if (itemName.trim()) addItem.mutate(); }}
              disabled={addItem.isPending || !itemName.trim()}
              className="bg-green-600 hover:bg-green-700 text-white shrink-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Button
            onClick={handleSendBill}
            disabled={sending || bills.length === 0}
            className="w-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30"
          >
            <Send className="h-4 w-4 mr-2" />
            {sending ? 'Sending…' : 'Send Bill Update via WhatsApp'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Checkout Modal ────────────────────────────────────────────────────────────

function CheckoutModal({
  room, workspaceId, onClose, onSuccess,
}: { room: HotelRoom; workspaceId: string; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);

  const { data: bills = [] } = useQuery<BillItem[]>({
    queryKey: ['room-bill', room.id],
    queryFn: () => getRoomBill(workspaceId, room.id),
  });

  const total = bills.reduce((s, b) => s + b.amount * b.quantity, 0);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      await checkOutGuest(workspaceId, room.id);
      toast.success(`${room.room_number} checked out — bill sent to guest!`);
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (err as Error)?.message
        || 'Checkout failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Checkout — {room.room_number}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/70"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-white/50 mb-4">Guest: <span className="text-white">{room.guest_name}</span></p>

        {bills.length > 0 ? (
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 mb-5 space-y-1.5">
            {bills.map((b) => (
              <div key={b.id} className="flex justify-between text-sm">
                <span className="text-white/70">{b.item_name} x{b.quantity}</span>
                <span className="text-white/80">₹{(b.amount * b.quantity).toFixed(2)}</span>
              </div>
            ))}
            <div className="border-t border-white/10 pt-2 flex justify-between">
              <span className="text-sm font-semibold text-white/60">Total</span>
              <span className="text-base font-bold text-green-400">₹{total.toFixed(2)}</span>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 mb-5 text-center text-white/30 text-sm">No charges</div>
        )}

        <p className="text-xs text-white/30 mb-4 text-center">Bill summary will be sent to guest via WhatsApp and room will be marked vacant.</p>

        <div className="flex gap-3">
          <Button onClick={onClose} className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 border border-white/10">Cancel</Button>
          <Button onClick={handleCheckout} disabled={loading} className="flex-1 bg-red-600/80 hover:bg-red-600 text-white">
            <LogOut className="h-4 w-4 mr-1.5" />
            {loading ? 'Checking out…' : 'Send Bill & Check Out'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Room Card ─────────────────────────────────────────────────────────────────

function RoomCard({
  room, workspaceId, onCheckin, onViewBill, onCheckout, onDelete,
}: {
  room: HotelRoom;
  workspaceId: string;
  onCheckin: () => void;
  onViewBill: () => void;
  onCheckout: () => void;
  onDelete: () => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const isDueCheckout = room.status === 'occupied' && room.expected_checkout && room.expected_checkout < today;
  const displayStatus = isDueCheckout ? 'due_checkout' : room.status;

  const statusBadge = {
    vacant: { label: 'Vacant', cls: 'bg-green-500/15 text-green-400 border-green-500/25' },
    occupied: { label: 'Occupied', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25' },
    due_checkout: { label: 'Due Checkout', cls: 'bg-red-500/15 text-red-400 border-red-500/25' },
  }[displayStatus];

  return (
    <div className={`rounded-xl border p-5 flex flex-col gap-3 ${isDueCheckout ? 'bg-red-500/5 border-red-500/20' : 'bg-white/5 border-white/8'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xl font-bold text-white">{room.room_number}</p>
          <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border mt-1 ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
        </div>
        {room.status === 'occupied' && (
          <div className="text-right">
            <p className="text-xs text-white/40">Running total</p>
            <p className="text-base font-bold text-white">₹{(room.running_total || 0).toFixed(2)}</p>
          </div>
        )}
      </div>

      {room.status === 'occupied' && (
        <div className="rounded-lg bg-white/5 border border-white/8 p-3 space-y-1">
          <p className="text-sm text-white">{room.guest_name}</p>
          <p className="text-xs text-white/40">{room.guest_phone}</p>
          {room.check_in_time && (
            <p className="text-xs text-white/30">Checked in: {new Date(room.check_in_time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
          )}
          {room.expected_checkout && (
            <p className={`text-xs ${isDueCheckout ? 'text-red-400 font-semibold' : 'text-white/30'}`}>
              Checkout: {new Date(room.expected_checkout + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              {isDueCheckout && ' ⚠️'}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-auto">
        {room.status === 'vacant' ? (
          <>
            <Button size="sm" onClick={onCheckin} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
              <LogIn className="h-3.5 w-3.5 mr-1.5" />Check In
            </Button>
            <Button size="sm" onClick={onDelete} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={onViewBill} className="flex-1 bg-white/8 hover:bg-white/12 text-white/70 hover:text-white border border-white/10">
              <Receipt className="h-3.5 w-3.5 mr-1.5" />View Bill
            </Button>
            <Button size="sm" onClick={onCheckout} className="flex-1 bg-red-500/15 hover:bg-red-500/25 text-red-400 hover:text-red-300 border border-red-500/20">
              <LogOut className="h-3.5 w-3.5 mr-1.5" />Check Out
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Room Status Tab ───────────────────────────────────────────────────────────

function RoomStatusTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [checkinRoom, setCheckinRoom] = useState<HotelRoom | null>(null);
  const [billRoom, setBillRoom] = useState<HotelRoom | null>(null);
  const [checkoutRoom, setCheckoutRoom] = useState<HotelRoom | null>(null);
  const [addRoomName, setAddRoomName] = useState('');
  const [showAddRoom, setShowAddRoom] = useState(false);

  const { data: rooms = [], isLoading } = useQuery<HotelRoom[]>({
    queryKey: ['hotel-rooms', workspaceId],
    queryFn: () => getHotelRooms(workspaceId),
    refetchInterval: 30_000,
  });

  const addRoom = useMutation({
    mutationFn: (name: string) => createHotelRoom(workspaceId, name.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hotel-rooms', workspaceId] });
      setShowAddRoom(false); setAddRoomName('');
      toast.success('Room added');
    },
    onError: () => toast.error('Failed to add room'),
  });

  const removeRoom = useMutation({
    mutationFn: (id: string) => deleteHotelRoom(workspaceId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotel-rooms', workspaceId] }),
    onError: () => toast.error('Failed to delete room'),
  });

  const suggestName = () => `Room ${100 + rooms.length + 1}`;

  const openAdd = () => { setAddRoomName(suggestName()); setShowAddRoom(true); };

  const occupied = rooms.filter((r) => r.status === 'occupied').length;
  const vacant = rooms.filter((r) => r.status === 'vacant').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex gap-4 text-sm">
          <span className="text-white/50">{rooms.length} rooms total</span>
          <span className="text-green-400">{vacant} vacant</span>
          <span className="text-yellow-400">{occupied} occupied</span>
        </div>
        <Button size="sm" onClick={openAdd} className="bg-green-600 hover:bg-green-700 text-white">
          <Plus className="h-3.5 w-3.5 mr-1.5" />Add Room
        </Button>
      </div>

      {showAddRoom && (
        <div className="mb-5 flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
          <input
            autoFocus
            value={addRoomName}
            onChange={(e) => setAddRoomName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && addRoomName.trim()) addRoom.mutate(addRoomName);
              if (e.key === 'Escape') { setShowAddRoom(false); setAddRoomName(''); }
            }}
            placeholder="e.g. Room 101, VIP Suite"
            className="flex-1 bg-transparent text-white text-sm placeholder:text-white/30 focus:outline-none"
          />
          <Button size="sm" onClick={() => { if (addRoomName.trim()) addRoom.mutate(addRoomName); }} disabled={addRoom.isPending || !addRoomName.trim()} className="bg-green-600 hover:bg-green-700 text-white">
            {addRoom.isPending ? 'Adding…' : 'Add'}
          </Button>
          <button onClick={() => { setShowAddRoom(false); setAddRoomName(''); }} className="p-1.5 rounded-md text-white/40 hover:text-white/70 hover:bg-white/8">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-white/5 border border-white/8 p-5 h-48 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && rooms.length === 0 && !showAddRoom && (
        <div className="rounded-xl border border-dashed border-white/10 p-14 text-center">
          <p className="text-4xl mb-4">🏨</p>
          <p className="text-white/40 text-sm mb-4">No rooms yet — add rooms to start managing check-ins</p>
          <Button size="sm" onClick={openAdd} className="bg-green-600 hover:bg-green-700 text-white">
            <Plus className="h-3.5 w-3.5 mr-1.5" />Add Room
          </Button>
        </div>
      )}

      {!isLoading && rooms.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              workspaceId={workspaceId}
              onCheckin={() => setCheckinRoom(room)}
              onViewBill={() => setBillRoom(room)}
              onCheckout={() => setCheckoutRoom(room)}
              onDelete={() => removeRoom.mutate(room.id)}
            />
          ))}
        </div>
      )}

      {checkinRoom && (
        <CheckInModal
          room={checkinRoom}
          workspaceId={workspaceId}
          onClose={() => setCheckinRoom(null)}
          onSuccess={() => { setCheckinRoom(null); qc.invalidateQueries({ queryKey: ['hotel-rooms', workspaceId] }); }}
        />
      )}
      {billRoom && (
        <ViewBillModal
          room={billRoom}
          workspaceId={workspaceId}
          onClose={() => setBillRoom(null)}
        />
      )}
      {checkoutRoom && (
        <CheckoutModal
          room={checkoutRoom}
          workspaceId={workspaceId}
          onClose={() => setCheckoutRoom(null)}
          onSuccess={() => { setCheckoutRoom(null); qc.invalidateQueries({ queryKey: ['hotel-rooms', workspaceId] }); }}
        />
      )}
    </div>
  );
}

// ── QR Codes Tab ──────────────────────────────────────────────────────────────

function QrTab({
  workspaceId, isHotel, waPhone, workspaceName,
}: { workspaceId: string; isHotel: boolean; waPhone?: string | null; workspaceName: string }) {
  const qc = useQueryClient();
  const locationType: 'table' | 'room' = isHotel ? 'room' : 'table';
  const addLabel = isHotel ? 'Add Room QR' : 'Add Table';
  const placeholder = isHotel ? 'e.g. Room 101, VIP Suite' : 'e.g. Table 5, Garden Seating';
  const emptyLabel = isHotel ? 'Koi room QR nahi hai — Add Room QR karein!' : 'Koi table nahi hai — Add Table karein!';

  const { data: locations = [], isLoading } = useQuery<Location[]>({
    queryKey: ['locations', workspaceId],
    queryFn: () => getLocations(workspaceId),
  });

  const [addName, setAddName] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const suggestName = () => {
    const next = locations.length + 1;
    return isHotel ? `Room ${100 + next}` : `Table ${next}`;
  };

  const openAdd = () => { setAddName(suggestName()); setShowAddInput(true); };

  const add = useMutation({
    mutationFn: (name: string) => createLocation(workspaceId, { name: name.trim(), location_type: locationType }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['locations', workspaceId] }); setShowAddInput(false); setAddName(''); },
    onError: () => toast.error('Failed to add'),
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateLocation(workspaceId, id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', workspaceId] }),
    onError: () => toast.error('Failed to rename'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteLocation(workspaceId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', workspaceId] }),
    onError: () => toast.error('Failed to delete'),
  });

  const downloadAllZip = async () => {
    if (!locations.length) return;
    setDownloading(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      await Promise.all(locations.map(async (loc) => {
        const msg = isHotel ? `Room ${loc.name} se order/service chahiye` : `Table ${loc.name} se order karna hai`;
        const dataUrl = await QRCode.toDataURL(buildWaUrl(waPhone, msg), { width: 300, margin: 2 });
        zip.file(`${loc.name.replace(/\s+/g, '-')}-qr.png`, dataUrl.split(',')[1], { base64: true });
      }));
      const blob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${locationType}s-qr-codes.zip`;
      link.click();
    } catch { toast.error('Failed to generate ZIP'); }
    finally { setDownloading(false); }
  };

  return (
    <div>
      <div className="flex gap-2 mb-5 flex-wrap">
        <Button size="sm" onClick={() => window.print()} className="bg-white/8 hover:bg-white/12 text-white/70 hover:text-white border border-white/10">
          <Printer className="h-3.5 w-3.5 mr-1.5" />Print All
        </Button>
        <Button size="sm" onClick={downloadAllZip} disabled={downloading || !locations.length} className="bg-white/8 hover:bg-white/12 text-white/70 hover:text-white border border-white/10">
          <Download className="h-3.5 w-3.5 mr-1.5" />{downloading ? 'Generating…' : 'Download All ZIP'}
        </Button>
        <Button size="sm" onClick={openAdd} className="bg-green-600 hover:bg-green-700 text-white">
          <Plus className="h-3.5 w-3.5 mr-1.5" />{addLabel}
        </Button>
      </div>

      {showAddInput && (
        <div className="mb-5 flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-3 print:hidden">
          <input
            autoFocus
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && addName.trim()) add.mutate(addName);
              if (e.key === 'Escape') { setShowAddInput(false); setAddName(''); }
            }}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-white text-sm placeholder:text-white/30 focus:outline-none"
          />
          <Button size="sm" onClick={() => { if (addName.trim()) add.mutate(addName); }} disabled={add.isPending || !addName.trim()} className="bg-green-600 hover:bg-green-700 text-white">
            {add.isPending ? 'Adding…' : 'Add'}
          </Button>
          <button onClick={() => { setShowAddInput(false); setAddName(''); }} className="p-1.5 rounded-md text-white/40 hover:text-white/70 hover:bg-white/8">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-white/5 border border-white/8 p-5 h-64 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && locations.length === 0 && !showAddInput && (
        <div className="rounded-xl border border-dashed border-white/10 p-14 text-center">
          <p className="text-4xl mb-4">{isHotel ? '🏨' : '🪑'}</p>
          <p className="text-white/40 text-sm mb-4">{emptyLabel}</p>
          <Button size="sm" onClick={openAdd} className="bg-green-600 hover:bg-green-700 text-white">
            <Plus className="h-3.5 w-3.5 mr-1.5" />{addLabel}
          </Button>
        </div>
      )}

      {!isLoading && locations.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print-area">
          {locations.map((loc) => {
            const msg = isHotel ? `Room ${loc.name} se order/service chahiye` : `Table ${loc.name} se order karna hai`;
            return (
              <QrCard
                key={loc.id}
                loc={loc}
                waUrl={buildWaUrl(waPhone, msg)}
                businessName={workspaceName}
                locationType={locationType}
                onDelete={() => remove.mutate(loc.id)}
                onRename={(name) => rename.mutateAsync({ id: loc.id, name })}
              />
            );
          })}
        </div>
      )}

      {!waPhone && locations.length > 0 && (
        <p className="mt-4 text-xs text-amber-400/70 print:hidden">
          ⚠️ WhatsApp phone number Settings mein set karein — QR codes mein number missing hai.
        </p>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TablesQrPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const isHotel = activeWorkspace?.business_type === 'hotel';
  const pageTitle = isHotel ? 'Rooms & QR Codes' : 'Tables & QR Codes';
  const [activeTab, setActiveTab] = useState<'qr' | 'rooms'>('qr');

  return (
    <AppShell>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area {
            position: absolute; left: 0; top: 0; width: 100%;
            display: grid !important;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px; padding: 24px;
          }
          .qr-card { page-break-inside: avoid; }
        }
      `}</style>

      <div className="p-6 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">{pageTitle}</h1>
          <p className="text-sm text-white/40 mt-0.5">{activeWorkspace?.name ?? ''}</p>
        </div>

        {!activeWorkspace && (
          <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
            <p className="text-white/40 text-sm">Select a workspace to get started.</p>
          </div>
        )}

        {activeWorkspace && (
          <>
            {/* Tabs — only shown for hotels */}
            {isHotel && (
              <div className="flex gap-1 mb-6 bg-white/5 rounded-xl p-1 w-fit border border-white/8">
                {([['qr', '🏷️ QR Codes'], ['rooms', '🛏️ Room Status']] as const).map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {(!isHotel || activeTab === 'qr') && (
              <QrTab
                workspaceId={activeWorkspace.id}
                isHotel={isHotel}
                waPhone={activeWorkspace.wa_phone_number}
                workspaceName={activeWorkspace.name ?? ''}
              />
            )}

            {isHotel && activeTab === 'rooms' && (
              <RoomStatusTab workspaceId={activeWorkspace.id} />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
