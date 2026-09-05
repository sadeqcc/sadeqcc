import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProvider } from '@/components/providers';
import { AppShell } from '@/components/shell';

export const metadata: Metadata = {
  title: 'GOLD ORDERS · طلبات الذهب',
  description:
    'متابعة طلبات الذهب من الكاونتر حتى تسليم العميل — الصنّاع والمسافرون والدفعات والتسليم. ' +
    'Track every gold jewellery order from the counter to the customer.',
  manifest: '/manifest.webmanifest',
  applicationName: 'GOLD ORDERS',
  appleWebApp: { capable: true, title: 'GOLD ORDERS', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

/** Applies the stored theme and language before paint — no flash, no mismatch. */
const BOOT = `(function(){try{
var s=JSON.parse(localStorage.getItem('go.settings.v1')||'{}');
var t=s.theme||'dark';
if(t==='system'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}
var d=document.documentElement;
d.classList.add(t==='light'?'light':'dark');
var l=s.language||'ar';
d.lang=l; d.dir=(l==='ar')?'rtl':'ltr';
}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
