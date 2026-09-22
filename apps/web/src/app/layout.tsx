import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'PollWave — Live Polling & Presentations',
    template: '%s | PollWave',
  },
  description:
    'Create stunning live polls and interactive presentations. Engage your audience in real time with PollWave.',
  keywords: ['live polling', 'presentations', 'audience engagement', 'real time', 'interactive'],
  authors: [{ name: 'PollWave' }],
  openGraph: {
    type: 'website',
    title: 'PollWave — Live Polling & Presentations',
    description: 'Engage your audience in real time with beautiful live polls.',
    siteName: 'PollWave',
  },
};

import { Providers } from '@/components/Providers';
import { Navbar } from '@/components/Navbar';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <Providers>
          <Navbar />
          <main className="app-main">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
