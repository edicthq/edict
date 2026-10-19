import type { Metadata } from 'next';
import { Provider } from '@/components/provider';
import './global.css';

export const metadata: Metadata = {
  title: { default: 'Edict docs', template: '%s · Edict docs' },
  description: 'Self-host Edict, connect your agents, and use its API.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
