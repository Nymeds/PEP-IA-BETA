'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Loader2, Save } from 'lucide-react'
import { api } from '@/services/api'
import { Patient } from '@/types'
import { useFeedback } from '@/components/ui/FeedbackProvider'
import { Button } from '@/components/ui/Button'

const schema = z.object({
  name: z.string().trim().min(2, 'Nome é obrigatório'),
  socialName: z.string().optional(), cpf: z.string().optional(), rg: z.string().optional(),
  birthDate: z.string().optional(), sex: z.string().optional(), maritalStatus: z.string().optional(),
  phone: z.string().optional(), whatsapp: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  cep: z.string().optional(), address: z.string().optional(), addressNumber: z.string().optional(),
  neighborhood: z.string().optional(), city: z.string().optional(), state: z.string().optional(),
  emergencyContact: z.string().optional(), emergencyPhone: z.string().optional(), bloodType: z.string().optional(),
  allergies: z.string().optional(), chronicDiseases: z.string().optional(), notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

function FormField({ label, name, register, error, type = 'text', placeholder = '' }: {
  label: string
  name: keyof FormData
  register: ReturnType<typeof useForm<FormData>>['register']
  error?: string
  type?: string
  placeholder?: string
}) {
  const id = `patient-${name}`
  return (
    <div>
      <label htmlFor={id} className="form-label">{label}</label>
      <input id={id} {...register(name)} type={type} placeholder={placeholder} className="form-input" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
      {error ? <p id={`${id}-error`} className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}

export function PatientForm({ patient }: { patient?: Patient }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { notify, confirm } = useFeedback()
  const [duplicates, setDuplicates] = useState<Patient[]>([])
  const form = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: patient || {} })
  const { register, handleSubmit, formState: { errors, isDirty } } = form

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [isDirty])

  const mutation = useMutation({
    mutationFn: (data: FormData) => patient ? api.patients.update(patient.id, data) : api.patients.create(data),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['patients'] })
      void queryClient.invalidateQueries({ queryKey: ['patients-page'] })
      notify('success', patient ? 'Cadastro atualizado' : 'Paciente cadastrado')
      router.push(`/patients/${saved.id}`)
    },
    onError: (error) => notify('error', 'Não foi possível salvar o paciente', error.message),
  })

  const submit = handleSubmit(async (data) => {
    const result = await api.patients.duplicates({ cpf: data.cpf, name: data.name, birthDate: data.birthDate })
    const matches = result.matches.filter((item) => item.id !== patient?.id)
    setDuplicates(matches)
    if (matches.length) {
      const proceed = await confirm({
        title: 'Possível cadastro duplicado',
        description: `Encontramos ${matches.length} paciente(s) com dados semelhantes. Confirme apenas se este for realmente um novo cadastro.`,
        confirmLabel: 'Salvar mesmo assim',
      })
      if (!proceed) return
    }
    mutation.mutate(data)
  })

  const field = (name: keyof FormData, label: string, options?: { type?: string; placeholder?: string }) => (
    <FormField label={label} name={name} register={register} error={errors[name]?.message} type={options?.type} placeholder={options?.placeholder} />
  )

  return (
    <div className="mx-auto w-full max-w-5xl p-4 lg:p-6">
      <header className="mb-4 flex items-center gap-3">
        <Link href="/patients" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" aria-label="Voltar para pacientes"><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-950">{patient ? 'Editar paciente' : 'Novo paciente'}</h1>
          <p className="text-sm text-slate-500">Dados cadastrais e alertas clínicos permanentes.</p>
        </div>
      </header>

      {duplicates.length ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3" role="alert">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> Possíveis duplicidades</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {duplicates.map((item) => <Link key={item.id} href={`/patients/${item.id}`} target="_blank" className="text-xs font-medium text-amber-800 underline">{item.name}{item.birthDate ? ` · ${item.birthDate}` : ''}</Link>)}
          </div>
        </div>
      ) : null}

      <form onSubmit={submit} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <section className="border-b border-slate-200 p-4 lg:p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Identificação</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="md:col-span-2">{field('name', 'Nome completo *', { placeholder: 'Nome do paciente' })}</div>
            {field('socialName', 'Nome social')}
            {field('cpf', 'CPF', { placeholder: '000.000.000-00' })}
            {field('rg', 'RG')}
            {field('birthDate', 'Data de nascimento', { type: 'date' })}
            <div><label htmlFor="patient-sex" className="form-label">Sexo</label><select id="patient-sex" {...register('sex')} className="form-input"><option value="">Selecionar</option><option>Masculino</option><option>Feminino</option><option>Outro</option></select></div>
            <div><label htmlFor="patient-marital" className="form-label">Estado civil</label><select id="patient-marital" {...register('maritalStatus')} className="form-input"><option value="">Selecionar</option><option>Solteiro(a)</option><option>Casado(a)</option><option>Divorciado(a)</option><option>Viúvo(a)</option><option>União estável</option></select></div>
          </div>
        </section>

        <section className="border-b border-slate-200 p-4 lg:p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Contato e endereço</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {field('phone', 'Telefone', { placeholder: '(11) 99999-9999' })}
            {field('whatsapp', 'WhatsApp', { placeholder: '(11) 99999-9999' })}
            {field('email', 'E-mail', { type: 'email' })}
            {field('cep', 'CEP')}
            <div className="md:col-span-2">{field('address', 'Logradouro')}</div>
            {field('addressNumber', 'Número')}{field('neighborhood', 'Bairro')}{field('city', 'Cidade')}{field('state', 'Estado')}
          </div>
        </section>

        <section className="p-4 lg:p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Segurança clínica e emergência</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {field('emergencyContact', 'Contato de emergência')}{field('emergencyPhone', 'Telefone de emergência')}
            <div><label htmlFor="patient-blood" className="form-label">Tipo sanguíneo</label><select id="patient-blood" {...register('bloodType')} className="form-input"><option value="">Selecionar</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((value) => <option key={value}>{value}</option>)}</select></div>
            <div className="lg:col-span-3">{field('allergies', 'Alergias conhecidas', { placeholder: 'Ex.: penicilina, AAS' })}</div>
            <div className="lg:col-span-3">{field('chronicDiseases', 'Doenças crônicas', { placeholder: 'Ex.: diabetes tipo 2, HAS' })}</div>
            <div className="lg:col-span-3"><label htmlFor="patient-notes" className="form-label">Observações</label><textarea id="patient-notes" {...register('notes')} rows={3} className="form-textarea" /></div>
          </div>
        </section>

        <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <p className="hidden text-xs text-slate-500 sm:block">{isDirty ? 'Alterações ainda não salvas' : 'Nenhuma alteração pendente'}</p>
          <div className="ml-auto flex gap-2">
            <Link href="/patients" className="btn-secondary">Cancelar</Link>
            <Button type="submit" variant="primary" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {mutation.isPending ? 'Salvando...' : 'Salvar paciente'}
            </Button>
          </div>
        </footer>
      </form>
    </div>
  )
}
