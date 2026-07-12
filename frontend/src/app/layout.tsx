import type { Metadata } from 'next'
import './globals.css'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { FeedbackProvider } from '@/components/ui/FeedbackProvider'

export const metadata: Metadata = {
  title: 'PEP IA — Prontuário Eletrônico com IA',
  description: 'Sistema de prontuário eletrônico assistido por inteligência artificial',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <QueryProvider>
          <FeedbackProvider>
            <SessionProvider>{children}</SessionProvider>
          </FeedbackProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
