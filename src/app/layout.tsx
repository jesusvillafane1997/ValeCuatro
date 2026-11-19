import type { Metadata } from 'next';
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Vale Cuatro — Truco Cordobés Online',
  description:
    'Jugá al Truco Argentino en Córdoba. Mesas 1v1, 3v3 con señas y código, y 6 todos contra todos con pozos en ARS.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-AR" className={`${fraunces.variable} ${plusJakarta.variable}`}>
      <body className="min-h-screen bg-[#0E3324] text-white font-sans antialiased selection:bg-[#D9B35F]/30">
        {children}
      </body>
    </html>
  );
}
