import type { Metadata } from 'next';
import { Instrument_Serif, JetBrains_Mono, Manrope } from 'next/font/google';
import './globals.css';

const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
});

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Kavrix — Gold trading intelligence',
  description:
    'Profit tells you what happened. Karat tells you if it will last. Discipline analytics for XAUUSD traders and EA users on MetaTrader 5.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${instrumentSerif.variable} ${manrope.variable} ${jetbrainsMono.variable} bg-bg text-text antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
