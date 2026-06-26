import type { Metadata } from 'next'
import './globals.css'
import { QueryProvider } from '@/components/providers/QueryProvider'

export const metadata: Metadata = {
  title: 'PEP IA — Prontuário Eletrônico com IA',
  description: 'Sistema de prontuário eletrônico assistido por inteligência artificial',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
