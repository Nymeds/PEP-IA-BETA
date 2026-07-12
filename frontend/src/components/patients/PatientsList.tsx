'use client'

import { useDeferredValue, useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  Plus,
  Search,
} from 'lucide-react'
import { api } from '@/services/api'
import { calcAge, format } from '../shared/utils'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/AsyncState'

const PAGE_SIZE = 25

export function PatientsList() {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const [filter, setFilter] = useState<'all' | 'risk' | 'incomplete'>('all')
  const [sort, setSort] = useState<'name_asc' | 'name_desc' | 'recent'>('name_asc')
  const [page, setPage] = useState(0)

  useEffect(() => setPage(0), [deferredSearch, filter, sort])

  const patientsQuery = useQuery({
    queryKey: ['patients-page', deferredSearch, filter, sort, page],
    queryFn: () => api.patients.page({
      query: deferredSearch || undefined,
      filter,
      sort,
      cursor: page ? String(page * PAGE_SIZE) : undefined,
      limit: PAGE_SIZE,
    }),
    placeholderData: (previous) => previous,
  })

  const response = patientsQuery.data
  const patients = response?.items || []
  const totalPages = Math.max(1, Math.ceil((response?.total || 0) / PAGE_SIZE))

  return (
    <div className="mx-auto w-full max-w-6xl p-4 lg:p-6">
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">Pacientes</h1>
          <p className="mt-0.5 text-sm text-slate-500">{response?.total || 0} paciente(s) encontrado(s)</p>
        </div>
        <Link href="/patients/new" className="btn-primary justify-center">
          <Plus className="h-4 w-4" />
          Novo paciente
        </Link>
      </header>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1" htmlFor="patient-search">
            <span className="sr-only">Buscar paciente</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              id="patient-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, CPF ou telefone"
              className="form-input pl-9"
              autoComplete="off"
            />
          </label>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <label className="relative">
              <span className="sr-only">Filtrar pacientes</span>
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="form-input min-w-40 py-2 pl-8">
                <option value="all">Todos</option>
                <option value="risk">Com alertas clínicos</option>
                <option value="incomplete">Cadastro incompleto</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Ordenar pacientes</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="form-input min-w-40 py-2">
                <option value="name_asc">Nome A-Z</option>
                <option value="name_desc">Nome Z-A</option>
                <option value="recent">Atualizados recentemente</option>
              </select>
            </label>
          </div>
        </div>

        {patientsQuery.isLoading ? (
          <LoadingState label="Carregando pacientes..." />
        ) : patientsQuery.isError ? (
          <ErrorState message={patientsQuery.error.message} onRetry={() => void patientsQuery.refetch()} />
        ) : !patients.length ? (
          <EmptyState
            title={deferredSearch ? 'Nenhum paciente encontrado' : 'Nenhum paciente cadastrado'}
            description={deferredSearch ? 'Revise os termos ou remova os filtros.' : 'Cadastre o primeiro paciente para iniciar o fluxo clínico.'}
            action={!deferredSearch ? <Link href="/patients/new" className="btn-primary"><Plus className="h-4 w-4" /> Cadastrar paciente</Link> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full table-fixed">
              <thead className="bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                <tr className="h-9">
                  <th className="w-[38%] px-4">Paciente</th>
                  <th className="w-[24%] px-4">Contato</th>
                  <th className="px-4">Última consulta</th>
                  <th className="w-24 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => {
                  const last = patient.consultations?.[0]
                  const hasRisk = Boolean(patient.allergies || patient.chronicDiseases)
                  return (
                    <tr key={patient.id} className="h-14 border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="px-4 py-2">
                        <Link href={`/patients/${patient.id}`} className="flex min-w-0 items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">{patient.name.charAt(0).toUpperCase()}</div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold text-slate-900">{patient.name}</p>
                              {hasRisk ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" aria-label="Possui alerta clínico" /> : null}
                              {patient.quickCreated ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Completar cadastro</span> : null}
                            </div>
                            <p className="truncate text-xs text-slate-500">{calcAge(patient.birthDate)}{patient.sex ? ` · ${patient.sex}` : ''}{patient.cpf ? ` · CPF ${patient.cpf}` : ''}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-sm text-slate-600">{patient.phone || patient.email || 'Não informado'}</td>
                      <td className="px-4 py-2">
                        <p className="truncate text-sm text-slate-700">{last?.chiefComplaint || (last ? 'Consulta sem queixa' : 'Sem consultas')}</p>
                        {last ? <p className="text-xs text-slate-400">{format(last.scheduledAt || last.createdAt)}</p> : null}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link href={`/patients/${patient.id}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-white" aria-label={`Abrir prontuário de ${patient.name}`} title="Abrir prontuário">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {response?.total ? (
          <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5">
            <p className="text-xs text-slate-500">Página {page + 1} de {totalPages}</p>
            <div className="flex gap-1">
              <Button size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="icon" className="h-8 w-8" disabled={!response.nextCursor} onClick={() => setPage((value) => value + 1)} aria-label="Próxima página"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </footer>
        ) : null}
      </section>
    </div>
  )
}
