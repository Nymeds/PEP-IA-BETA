'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { Plus, Search, User } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { format, calcAge } from '../shared/utils'

export function PatientsList() {
  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['patients'],
    queryFn: api.patients.list,
  })

  const [search, setSearch] = useState('')

  const filtered = patients.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.cpf?.includes(search) ||
    p.phone?.includes(search)
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pacientes</h1>
          <p className="text-sm text-slate-500 mt-0.5">{patients.length} paciente(s) cadastrado(s)</p>
        </div>
        <Link href="/patients/new" className="btn-primary">
          <Plus className="w-4 h-4" />
          Novo Paciente
        </Link>
      </div>

      <div className="card mb-4">
        <div className="p-4 flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, CPF ou telefone..."
            className="flex-1 text-sm bg-transparent outline-none text-slate-800 placeholder-slate-400"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-slate-400 text-sm">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <User className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">
            {search ? 'Nenhum paciente encontrado' : 'Nenhum paciente cadastrado'}
          </p>
          {!search && (
            <Link href="/patients/new" className="btn-primary mt-4">
              <Plus className="w-4 h-4" />
              Cadastrar Paciente
            </Link>
          )}
        </div>
      ) : (
        <div className="card divide-y divide-slate-50">
          {filtered.map((p) => {
            const last = p.consultations?.[0]
            return (
              <div key={p.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors">
                <Link href={`/patients/${p.id}`} className="flex items-center gap-3 flex-1">
                  <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 font-semibold text-sm flex-shrink-0">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-400">
                      {calcAge(p.birthDate)} {p.sex ? `· ${p.sex}` : ''} {p.cpf ? `· CPF: ${p.cpf}` : ''}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-6 text-xs text-slate-400">
                  <span>{p.phone || '—'}</span>
                  <span>{last ? format(last.createdAt) : 'Sem consultas'}</span>
                  <Link
                    href={`/patients/${p.id}`}
                    className="btn-secondary text-xs py-1.5"
                  >
                    Abrir
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
