import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Provedores } from '@/lib/provedores';
import './globals.css';

export const metadata: Metadata = { title: 'Gestão de TI · Suinco' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function Raiz({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <Provedores>{children}</Provedores>
      </body>
    </html>
  );
}
