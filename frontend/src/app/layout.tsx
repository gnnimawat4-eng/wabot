import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'WaBot — WhatsApp Automation',
  description: 'Automate your WhatsApp Business for Indian SMEs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply stored theme before paint to avoid flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('wabot-theme');var d=window.matchMedia('(prefers-color-scheme:dark)').matches;if(t==='dark'||(t==='system'&&d)||(t===null&&d)){document.documentElement.classList.add('dark')}})()`,
          }}
        />
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
