import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProvider } from '@/components/providers';
import { AppShell } from '@/components/shell';

export const metadata: Metadata = {
  title: 'SADEQ DRAWER — Cash & Gold Reconciliation',
  description: 'مطابقة يومية للكاش والذهب في محل الذهب — Daily cash and gold drawer reconciliation.',
  manifest: '/manifest.webmanifest',
  applicationName: 'SADEQ DRAWER',
  appleWebApp: { capable: true, title: 'SADEQ DRAWER', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#08090c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

/** Applies the stored theme before paint so there is no flash and no hydration mismatch. */
const THEME_BOOT = `(function(){try{
var s=JSON.parse(localStorage.getItem('sadeq.settings.v1')||'{}');
var d=document.documentElement;
d.lang=s.language||'ar';d.dir=(s.language==='en')?'ltr':'rtl';
d.classList.add(s.theme==='light'?'light':'dark');
d.dataset.palette=s.palette||'black_gold';
}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Inter:wght@400;500;600;700&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
