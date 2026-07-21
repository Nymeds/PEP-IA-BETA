import { notFound } from 'next/navigation'
import { dynamicPsychologyFormsEnabled } from '@/lib/features'

export default function FormsLayout({ children }: { children: React.ReactNode }) {
  if (!dynamicPsychologyFormsEnabled) notFound()
  return children
}
