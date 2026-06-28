'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { ShieldCheck, Stethoscope } from 'lucide-react'
import { api } from '@/services/api'
import { useSession } from '@/components/providers/SessionProvider'

interface Props {
  mode: 'login' | 'register'
}

type FormData = {
  name?: string
  suggestedName?: string
  email: string
  password: string
}

export function AuthPage({ mode }: Props) {
  const router = useRouter()
  const { setSessionUser } = useSession()

  const schema = useMemo(() => {
    return z.object({
      name:
        mode === 'register'
          ? z.string().min(2, 'Informe o nome completo')
          : z.string().optional(),
      suggestedName:
        mode === 'register'
          ? z.string().min(2, 'Informe o nome sugerido para as sessoes')
          : z.string().optional(),
      email: z.string().email('Informe um e-mail valido'),
      password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
    })
  }, [mode])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues:
      mode === 'register'
        ? { suggestedName: 'Dr(a).', email: '', password: '', name: '' }
        : { email: '', password: '' },
  })

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (mode === 'register') {
        return api.auth.register({
          email: data.email,
          password: data.password,
          name: data.name || '',
          suggestedName: data.suggestedName || '',
        })
      }

      return api.auth.login({
        email: data.email,
        password: data.password,
      })
    },
    onSuccess: ({ user }) => {
      setSessionUser(user)
      router.replace('/')
    },
  })

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,116,144,0.12),_transparent_38%),linear-gradient(160deg,#f8fafc_0%,#eef2ff_45%,#f8fafc_100%)]">
      <div className="max-w-6xl mx-auto min-h-screen grid lg:grid-cols-[1.1fr_0.9fr] gap-8 px-6 py-10 items-center">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 backdrop-blur px-4 py-2 border border-white shadow-sm text-sm text-slate-600 mb-6">
              <Stethoscope className="w-4 h-4 text-primary-600" />
              PEP IA para consultas em portugues do Brasil
            </div>
            <h1 className="text-5xl font-bold text-slate-900 leading-tight">
              Prontuario com IA, agenda visual e sessao segura por JWT.
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-600">
              O medico entra com e-mail e senha, protege todas as rotas e organiza os
              atendimentos em uma agenda clicavel com cadastro rapido de pacientes.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 mt-8">
              <div className="card p-5 bg-white/85 backdrop-blur">
                <p className="text-sm font-semibold text-slate-800 mb-1">Sessao protegida</p>
                <p className="text-sm text-slate-500">
                  JWT em cookie `httpOnly`, rotas privadas e isolamento por usuario.
                </p>
              </div>
              <div className="card p-5 bg-white/85 backdrop-blur">
                <p className="text-sm font-semibold text-slate-800 mb-1">Agenda clinica</p>
                <p className="text-sm text-slate-500">
                  Calendario mensal, turnos configuraveis e agendamento rapido por nome.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full max-w-md mx-auto">
          <div className="card p-8 shadow-lg shadow-slate-200/70">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-2xl bg-primary-600 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {mode === 'register' ? 'Criar conta medica' : 'Entrar no sistema'}
                </p>
                <p className="text-sm text-slate-500">
                  {mode === 'register'
                    ? 'Cadastre o acesso do medico e defina o nome usado nas sessoes.'
                    : 'Use seu e-mail e senha para acessar o PEP IA.'}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div>
                    <label className="form-label">Nome completo</label>
                    <input {...register('name')} className="form-input" placeholder="Nome do medico" />
                    {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
                  </div>

                  <div>
                    <label className="form-label">Nome sugerido</label>
                    <input
                      {...register('suggestedName')}
                      className="form-input"
                      placeholder="Ex: Dr. Marcelo"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Esse nome aparece durante as sessoes e na interface do atendimento.
                    </p>
                    {errors.suggestedName && (
                      <p className="text-xs text-red-500 mt-1">{errors.suggestedName.message}</p>
                    )}
                  </div>
                </>
              )}

              <div>
                <label className="form-label">E-mail</label>
                <input {...register('email')} type="email" className="form-input" placeholder="medico@clinica.com" />
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <label className="form-label">Senha</label>
                <input {...register('password')} type="password" className="form-input" placeholder="Minimo de 8 caracteres" />
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
              </div>

              {mutation.isError && (
                <p className="text-sm text-red-500">{mutation.error.message}</p>
              )}

              <button type="submit" disabled={mutation.isPending} className="btn-primary w-full justify-center py-2.5">
                {mutation.isPending
                  ? mode === 'register'
                    ? 'Criando acesso...'
                    : 'Entrando...'
                  : mode === 'register'
                    ? 'Cadastrar usuario'
                    : 'Entrar'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 text-sm text-slate-500">
              {mode === 'register' ? (
                <p>
                  Ja possui acesso?{' '}
                  <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium">
                    Fazer login
                  </Link>
                </p>
              ) : (
                <p>
                  Primeiro acesso?{' '}
                  <Link href="/cadastro" className="text-primary-600 hover:text-primary-700 font-medium">
                    Criar usuario
                  </Link>
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
