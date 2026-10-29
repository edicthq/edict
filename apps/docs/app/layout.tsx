import type { Metadata, Viewport } from 'next';
import { Provider } from '@/components/provider';
import { appName, ogImage, siteUrl } from '@/lib/shared';
import './global.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Edict docs', template: '%s · Edict docs' },
  description: 'Self-host Edict, connect your agents, and use its API.',
  applicationName: appName,
  openGraph: { type: 'website', siteName: appName, locale: 'en_US', images: [ogImage] },
  twitter: { card: 'summary_large_image', images: [ogImage] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafbfc' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1013' },
  ],
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
