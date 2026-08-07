import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import {
  Libre_Baskerville, DM_Sans, DM_Mono,
  Instrument_Serif,
} from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

// ── Dashboard fonts ───────────────────────────────────────────
const libreBaskerville = Libre_Baskerville({
  subsets: ['latin'], weight: ['400', '700'], style: ['normal', 'italic'],
  variable: '--font-serif', display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'], weight: ['300', '400', '500', '600'],
  variable: '--font-sans', display: 'swap',
})

const dmMono = DM_Mono({
  subsets: ['latin'], weight: ['300', '400', '500'],
  variable: '--font-mono', display: 'swap',
})

// ── Marketing site fonts ──────────────────────────────────────
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'], weight: ['400'], style: ['normal', 'italic'],
  variable: '--font-marketing-serif', display: 'swap',
})


export const metadata: Metadata = {
  title: { template: '%s · StitchBook', default: 'StitchBook' },
  description: 'The complete tailoring intelligence platform',
  icons: { icon: '/favicon.ico' },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale   = await getLocale()
  const messages = await getMessages()

  return (
    <html
      lang={locale}
      className={[
        libreBaskerville.variable,
        dmSans.variable,
        dmMono.variable,
        instrumentSerif.variable,
      ].join(' ')}
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
