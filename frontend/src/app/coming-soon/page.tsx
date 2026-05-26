'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

function ComingSoonContent() {
  const params = useSearchParams();
  const feature = params.get('feature') ?? 'This feature';

  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <div className="text-6xl mb-6">🚧</div>
        <h1 className="text-2xl font-bold text-white mb-2">{decodeURIComponent(feature)}</h1>
        <p className="text-white/40 text-sm mb-6 max-w-sm">
          Yeh feature abhi development mein hai. Jald hi aayega!
        </p>
        <div className="flex gap-3">
          <Link href="/dashboard">
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
              Dashboard par jayein
            </Button>
          </Link>
          <Link href="/flows">
            <Button size="sm" variant="outline" className="border-white/10 text-white/60 hover:bg-white/5">
              Flows dekhen
            </Button>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

export default function ComingSoonPage() {
  return (
    <Suspense>
      <ComingSoonContent />
    </Suspense>
  );
}
