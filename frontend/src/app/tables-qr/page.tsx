'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Plus, Trash2, Download, Printer } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/lib/store';
import { getLocations, createLocation, deleteLocation } from '@/lib/api';
import { toast } from 'sonner';

interface Location {
  id: string;
  name: string;
  location_type: string;
  created_at: string;
}

function buildWaUrl(phone: string | null | undefined, message: string) {
  const clean = (phone ?? '').replace(/\D/g, '');
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

function QrCard({
  loc,
  waUrl,
  businessName,
  locationType,
  onDelete,
}: {
  loc: Location;
  waUrl: string;
  businessName: string;
  locationType: 'table' | 'room';
  onDelete: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, waUrl, {
        width: 200,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      });
    }
  }, [waUrl]);

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Render a decorated canvas for download
    const out = document.createElement('canvas');
    out.width = 240;
    out.height = 300;
    const ctx = out.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 240, 300);

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(businessName, 120, 24);

    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#000000';
    ctx.fillText(loc.name, 120, 50);

    ctx.drawImage(canvas, 20, 60, 200, 200);

    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#374151';
    ctx.fillText('Scan to Order', 120, 276);
    ctx.fillText('on WhatsApp', 120, 294);

    const link = document.createElement('a');
    link.download = `${loc.name.replace(/\s+/g, '-')}-qr.png`;
    link.href = out.toDataURL('image/png');
    link.click();
  };

  const isTable = locationType === 'table';

  return (
    <div
      className="rounded-xl bg-white/5 border border-white/8 p-5 flex flex-col items-center gap-3 qr-card print:border print:border-gray-300 print:rounded-lg print:p-6 print:bg-white"
      data-name={loc.name}
    >
      {/* Print header */}
      <div className="print:block hidden text-center">
        <p className="text-sm font-semibold text-gray-600">{businessName}</p>
      </div>

      <p className="text-base font-bold text-white print:text-black print:text-lg">{loc.name}</p>

      <canvas
        ref={canvasRef}
        className="rounded-lg"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* Print footer */}
      <div className="print:block hidden text-center">
        <p className="text-xs text-gray-500">Scan to {isTable ? 'Order' : 'Request Service'}</p>
        <p className="text-xs text-gray-500">on WhatsApp</p>
      </div>

      {/* Screen-only actions */}
      <div className="flex gap-2 w-full print:hidden">
        <Button
          size="sm"
          onClick={downloadPng}
          className="flex-1 bg-white/8 hover:bg-white/12 text-white/70 hover:text-white border border-white/10"
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Download PNG
        </Button>
        <Button
          size="sm"
          onClick={onDelete}
          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function TablesQrPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const qc = useQueryClient();

  const isHotel = activeWorkspace?.business_type === 'hotel';
  const locationType: 'table' | 'room' = isHotel ? 'room' : 'table';
  const pageTitle = isHotel ? 'Rooms & QR Codes' : 'Tables & QR Codes';
  const addLabel = isHotel ? 'Add Room' : 'Add Table';
  const emptyLabel = isHotel
    ? 'Koi room nahi hai — Add Room karein!'
    : 'Koi table nahi hai — Add Table karein!';

  const { data: locations = [], isLoading } = useQuery<Location[]>({
    queryKey: ['locations', activeWorkspace?.id],
    queryFn: () => getLocations(activeWorkspace!.id),
    enabled: !!activeWorkspace,
  });

  const add = useMutation({
    mutationFn: () => {
      const next = locations.length + 1;
      const name = isHotel ? `Room ${100 + next}` : `Table ${next}`;
      return createLocation(activeWorkspace!.id, { name, location_type: locationType });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', activeWorkspace?.id] }),
    onError: () => toast.error('Failed to add'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteLocation(activeWorkspace!.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', activeWorkspace?.id] }),
    onError: () => toast.error('Failed to delete'),
  });

  const [downloading, setDownloading] = useState(false);

  const downloadAllZip = async () => {
    if (locations.length === 0) return;
    setDownloading(true);
    try {
      // Dynamically import JSZip to avoid SSR issues
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      await Promise.all(
        locations.map(async (loc) => {
          const waUrl = buildWaUrl(
            activeWorkspace?.wa_phone_number,
            isHotel
              ? `Room ${loc.name} se order/service chahiye`
              : `Table ${loc.name} se order karna hai`
          );
          const dataUrl = await QRCode.toDataURL(waUrl, { width: 300, margin: 2 });
          const base64 = dataUrl.split(',')[1];
          zip.file(`${loc.name.replace(/\s+/g, '-')}-qr.png`, base64, { base64: true });
        })
      );
      const blob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${locationType}s-qr-codes.zip`;
      link.click();
    } catch {
      toast.error('Failed to generate ZIP');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AppShell>
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area {
            position: absolute; left: 0; top: 0; width: 100%;
            display: grid !important;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            padding: 24px;
          }
          .qr-card { page-break-inside: avoid; }
        }
      `}</style>

      <div className="p-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">{pageTitle}</h1>
            <p className="text-sm text-white/40 mt-0.5">
              {activeWorkspace?.name ?? ''} — {locations.length} {locationType}
              {locations.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button
              size="sm"
              onClick={() => window.print()}
              className="bg-white/8 hover:bg-white/12 text-white/70 hover:text-white border border-white/10"
            >
              <Printer className="h-3.5 w-3.5 mr-1.5" />
              Print All
            </Button>
            <Button
              size="sm"
              onClick={downloadAllZip}
              disabled={downloading || locations.length === 0}
              className="bg-white/8 hover:bg-white/12 text-white/70 hover:text-white border border-white/10"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              {downloading ? 'Generating…' : 'Download All ZIP'}
            </Button>
            <Button
              size="sm"
              onClick={() => add.mutate()}
              disabled={add.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {add.isPending ? 'Adding…' : addLabel}
            </Button>
          </div>
        </div>

        {/* No workspace */}
        {!activeWorkspace && (
          <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
            <p className="text-white/40 text-sm">Select a workspace to manage {locationType}s.</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-white/5 border border-white/8 p-5 h-64 animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && activeWorkspace && locations.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 p-14 text-center">
            <p className="text-4xl mb-4">{isHotel ? '🏨' : '🪑'}</p>
            <p className="text-white/40 text-sm mb-4">{emptyLabel}</p>
            <Button
              size="sm"
              onClick={() => add.mutate()}
              disabled={add.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {addLabel}
            </Button>
          </div>
        )}

        {/* Grid */}
        {!isLoading && locations.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print-area">
            {locations.map((loc) => {
              const message = isHotel
                ? `Room ${loc.name} se order/service chahiye`
                : `Table ${loc.name} se order karna hai`;
              const waUrl = buildWaUrl(activeWorkspace?.wa_phone_number, message);
              return (
                <QrCard
                  key={loc.id}
                  loc={loc}
                  waUrl={waUrl}
                  businessName={activeWorkspace?.name ?? ''}
                  locationType={locationType}
                  onDelete={() => remove.mutate(loc.id)}
                />
              );
            })}
          </div>
        )}

        {/* No phone number warning */}
        {activeWorkspace && !activeWorkspace.wa_phone_number && locations.length > 0 && (
          <p className="mt-4 text-xs text-amber-400/70 print:hidden">
            ⚠️ WhatsApp phone number Settings mein set karein — QR codes mein number missing hai.
          </p>
        )}
      </div>
    </AppShell>
  );
}
