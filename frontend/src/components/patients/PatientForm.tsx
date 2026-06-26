'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { Patient } from '@/types'

const schema = z.object({
  name: z.string().min(2, 'Nome é obrigatório'),
  socialName: z.string().optional(),
  cpf: z.string().optional(),
  rg: z.string().optional(),
  birthDate: z.string().optional(),
  sex: z.string().optional(),
  maritalStatus: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  cep: z.string().optional(),
  address: z.string().optional(),
  addressNumber: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
  bloodType: z.string().optional(),
  allergies: z.string().optional(),
  chronicDiseases: z.string().optional(),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  patient?: Patient
}

export function PatientForm({ patient }: Props) {
  const router = useRouter()
  const qc = useQueryClient()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: patient || {},
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      patient ? api.patients.update(patient.id, data) : api.patients.create(data),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['patients'] })
      router.push(`/patients/${saved.id}`)
    },
  })

  const F = ({ label, name, type = 'text', placeholder = '' }: { label: string; name: keyof FormData; type?: string; placeholder?: string }) => (
    <div>
      <label className="form-label">{label}</label>
      <input
        {...register(name)}
        type={type}
        placeholder={placeholder}
        className="form-input"
      />
      {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name]?.message}</p>}
    </div>
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/patients" className="btn-secondary p-2">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            {patient ? 'Editar Paciente' : 'Novo Paciente'}
          </h1>
          <p className="text-sm text-slate-500">Preencha os dados do paciente</p>
        </div>
      </div>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-6">
        <div className="card p-6">
          <h2 className="section-title">Dados Pessoais</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <F label="Nome Completo *" name="name" placeholder="Nome do paciente" />
            </div>
            <F label="Nome Social" name="socialName" />
            <F label="CPF" name="cpf" placeholder="000.000.000-00" />
            <F label="RG" name="rg" />
            <F label="Data de Nascimento" name="birthDate" type="date" />
            <div>
              <label className="form-label">Sexo</label>
              <select {...register('sex')} className="form-input">
                <option value="">Selecionar</option>
                <option value="Masculino">Masculino</option>
                <option value="Feminino">Feminino</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
            <div>
              <label className="form-label">Estado Civil</label>
              <select {...register('maritalStatus')} className="form-input">
                <option value="">Selecionar</option>
                <option value="Solteiro(a)">Solteiro(a)</option>
                <option value="Casado(a)">Casado(a)</option>
                <option value="Divorciado(a)">Divorciado(a)</option>
                <option value="Viúvo(a)">Viúvo(a)</option>
                <option value="União estável">União estável</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="section-title">Contato</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <F label="Telefone" name="phone" placeholder="(11) 99999-9999" />
            <F label="WhatsApp" name="whatsapp" placeholder="(11) 99999-9999" />
            <F label="E-mail" name="email" type="email" placeholder="email@exemplo.com" />
          </div>
        </div>

        <div className="card p-6">
          <h2 className="section-title">Endereço</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <F label="CEP" name="cep" placeholder="00000-000" />
            <div className="md:col-span-2">
              <F label="Logradouro" name="address" />
            </div>
            <F label="Número" name="addressNumber" />
            <F label="Bairro" name="neighborhood" />
            <F label="Cidade" name="city" />
            <F label="Estado" name="state" />
          </div>
        </div>

        <div className="card p-6">
          <h2 className="section-title">Emergência & Dados Clínicos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <F label="Contato de Emergência" name="emergencyContact" />
            <F label="Telefone de Emergência" name="emergencyPhone" />
            <div>
              <label className="form-label">Tipo Sanguíneo</label>
              <select {...register('bloodType')} className="form-input">
                <option value="">Selecionar</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Alergias Conhecidas</label>
              <input {...register('allergies')} className="form-input" placeholder="Ex: Penicilina, AAS" />
            </div>
            <div className="md:col-span-2">
              <label className="form-label">Doenças Crônicas</label>
              <input {...register('chronicDiseases')} className="form-input" placeholder="Ex: Diabetes tipo 2, HAS" />
            </div>
            <div className="md:col-span-2">
              <label className="form-label">Observações</label>
              <textarea {...register('notes')} rows={3} className="form-textarea" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link href="/patients" className="btn-secondary">
            Cancelar
          </Link>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            <Save className="w-4 h-4" />
            {mutation.isPending ? 'Salvando...' : 'Salvar Paciente'}
          </button>
        </div>

        {mutation.isError && (
          <p className="text-red-500 text-sm text-center">{mutation.error.message}</p>
        )}
      </form>
    </div>
  )
}
