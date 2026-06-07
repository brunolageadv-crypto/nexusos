// ProntuarioADM.tsx
// Coloque em: src/components/prontuario/ProntuarioADM.tsx
// Adicionar rota no App.tsx: case 'prontuario' => <ProntuarioADM />

import { useEffect, useState, useRef } from 'react'
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc, Timestamp
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'

// ─── Types ────────────────────────────────────────────────────────────────────

type Prioridade = 'baixa' | 'media' | 'alta' | 'urgente'
type Status = 'aberta' | 'em_andamento' | 'aguardando' | 'concluida' | 'cancelada'

interface Encaminhamento {
  id: string
  de: string
  para: string
  data: string
  observacao?: string
}

interface Movimentacao {
  id: string
  data: string
  tipo: 'registro' | 'encaminhamento' | 'prazo' | 'conclusao' | 'nota'
  descricao: string
  autor?: string
}

interface Demanda {
  id: string
  numeroDemanda?: string
  processoSEI?: string
  titulo: string
  descricao: string
  dataAbertura: string
  prazo: string
  solicitante: string
  unidadeDemandante: string
  categoria: string
  prioridade: Prioridade
  status: Status
  encaminhamentos: Encaminhamento[]
  movimentacoes: Movimentacao[]
  criadoEm: number
}

const CATEGORIAS = [
  'Contratação', 'Licitação', 'Assessoria Jurídica', 'Parecer',
  'Recurso Administrativo', 'Auditoria', 'Pessoal / RH',
  'Convênio / Parceria', 'Legislação / Regulamentação', 'Outro',
]

const PRIORIDADE_CONFIG: Record<Prioridade, { label: string; color: string; bg: string }> = {
  baixa:   { label: 'Baixa',   color: '#6b9e7a', bg: 'rgba(107,158,122,0.15)' },
  media:   { label: 'Média',   color: '#a0956b', bg: 'rgba(160,149,107,0.15)' },
  alta:    { label: 'Alta',    color: '#c47c2e', bg: 'rgba(196,124,46,0.15)'  },
  urgente: { label: 'Urgente', color: '#b94a4a', bg: 'rgba(185,74,74,0.15)'  },
}

const STATUS_CONFIG: Record<Status, { label: string; color: string }> = {
  aberta:        { label: 'Aberta',        color: '#6b9fd4' },
  em_andamento:  { label: 'Em Andamento',  color: '#a0956b' },
  aguardando:    { label: 'Aguardando',    color: '#9b7cc4' },
  concluida:     { label: 'Concluída',     color: '#6b9e7a' },
  cancelada:     { label: 'Cancelada',     color: '#7a7a7a' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function diasRestantes(prazo: string): number {
  if (!prazo) return 999
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const p = new Date(prazo + 'T00:00:00')
  return Math.ceil((p.getTime() - hoje.getTime()) / 86400000)
}

function cardBorderColor(dias: number, status: Status): string {
  if (status === 'concluida' || status === 'cancelada') return 'rgba(100,100,100,0.3)'
  if (dias <= 0)  return 'rgba(180,60,60,0.7)'
  if (dias <= 10) return 'rgba(180,60,60,0.5)'
  if (dias <= 15) return 'rgba(200,160,50,0.5)'
  return 'rgba(80,140,100,0.4)'
}

function cardBg(dias: number, status: Status): string {
  if (status === 'concluida' || status === 'cancelada') return 'rgba(50,50,60,0.4)'
  if (dias <= 0)  return 'rgba(100,20,20,0.2)'
  if (dias <= 10) return 'rgba(80,20,20,0.15)'
  if (dias <= 15) return 'rgba(80,65,10,0.15)'
  return 'rgba(15,35,25,0.15)'
}

function prazoLabel(dias: number): { text: string; color: string } {
  if (dias <= 0)  return { text: 'Vencido',       color: '#ef4444' }
  if (dias <= 10) return { text: `${dias}d restantes`, color: '#f87171' }
  if (dias <= 15) return { text: `${dias}d restantes`, color: '#fbbf24' }
  return { text: `${dias}d restantes`, color: '#6ee7a0' }
}

function newId() { return Math.random().toString(36).slice(2, 10) }

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProntuarioADM() {
  const uid = useUid()
  const [demandas, setDemandas] = useState<Demanda[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'cards' | 'calendario'>('cards')
  const [filtroStatus, setFiltroStatus] = useState<Status | 'todas'>('todas')
  const [filtroPrioridade, setFiltroPrioridade] = useState<Prioridade | 'todas'>('todas')
  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [demandaSelecionada, setDemandaSelecionada] = useState<Demanda | null>(null)
  const [modalDetalhe, setModalDetalhe] = useState<Demanda | null>(null)
  const [deletandoId, setDeletandoId] = useState<string | null>(null)

  // Carrega demandas do Firestore
  useEffect(() => {
    if (!uid) return
    const colRef = collection(db, 'users', uid, 'prontuario')
    const unsub = onSnapshot(colRef, (snap) => {
      const list: Demanda[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Demanda))
      list.sort((a, b) => b.criadoEm - a.criadoEm)
      setDemandas(list)
      setLoading(false)
    })
    return () => unsub()
  }, [uid])

  const demandasFiltradas = demandas.filter(d => {
    if (filtroStatus !== 'todas' && d.status !== filtroStatus) return false
    if (filtroPrioridade !== 'todas' && d.prioridade !== filtroPrioridade) return false
    if (busca && !d.titulo.toLowerCase().includes(busca.toLowerCase()) &&
        !(d.numeroDemanda || '').includes(busca) &&
        !(d.processoSEI || '').includes(busca)) return false
    return true
  })

  const abrirNovaDemanda = () => {
    setDemandaSelecionada(null)
    setModalAberto(true)
  }

  const abrirEditar = (d: Demanda) => {
    setDemandaSelecionada(d)
    setModalAberto(true)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col gap-4 p-4 pb-8 h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)', fontFamily: "'DM Sans', sans-serif" }}>
            Prontuário ADM
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {demandas.filter(d => d.status !== 'concluida' && d.status !== 'cancelada').length} demandas ativas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView(v => v === 'cards' ? 'calendario' : 'cards')}
            className="px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 transition-all"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            {view === 'cards' ? '📅 Calendário' : '🗂 Cards'}
          </button>
          <button
            onClick={abrirNovaDemanda}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #3b7cc9, #5b5bd6)', color: '#fff' }}>
            + Nova Demanda
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por título, nº demanda, SEI..."
          className="text-xs px-3 py-1.5 rounded-lg flex-1 min-w-48 outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        <select
          value={filtroStatus}
          onChange={e => setFiltroStatus(e.target.value as any)}
          className="text-xs px-2 py-1.5 rounded-lg outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          <option value="todas">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select
          value={filtroPrioridade}
          onChange={e => setFiltroPrioridade(e.target.value as any)}
          className="text-xs px-2 py-1.5 rounded-lg outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          <option value="todas">Todas prioridades</option>
          {Object.entries(PRIORIDADE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Abertas',      val: demandas.filter(d => d.status === 'aberta').length,       color: '#6b9fd4' },
          { label: 'Em Andamento', val: demandas.filter(d => d.status === 'em_andamento').length, color: '#fbbf24' },
          { label: 'Urgentes',     val: demandas.filter(d => d.prioridade === 'urgente' && d.status !== 'concluida').length, color: '#f87171' },
          { label: 'Concluídas',   val: demandas.filter(d => d.status === 'concluida').length,    color: '#6ee7a0' },
        ].map(s => (
          <div key={s.label} className="rounded-xl px-3 py-2 text-center"
            style={{ background: 'var(--widget-bg)', border: '1px solid var(--border)' }}>
            <div className="text-lg font-bold" style={{ color: s.color }}>{s.val}</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* View: Cards */}
      {view === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {demandasFiltradas.length === 0 && (
            <div className="col-span-3 text-center py-16" style={{ color: 'var(--text-muted)' }}>
              <div className="text-4xl mb-2">📂</div>
              <p className="text-sm">Nenhuma demanda encontrada</p>
            </div>
          )}
          {demandasFiltradas.map(d => {
            const dias = diasRestantes(d.prazo)
            const pz = prazoLabel(dias)
            const pr = PRIORIDADE_CONFIG[d.prioridade]
            const st = STATUS_CONFIG[d.status]
            return (
              <div key={d.id}
                className="rounded-2xl p-4 flex flex-col gap-3 cursor-pointer transition-all hover:scale-[1.01]"
                style={{
                  background: cardBg(dias, d.status),
                  border: `1px solid ${cardBorderColor(dias, d.status)}`,
                  backdropFilter: 'blur(8px)',
                }}
                onClick={() => setModalDetalhe(d)}>
                {/* Card header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      {d.numeroDemanda && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>
                          #{d.numeroDemanda}
                        </span>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: pr.bg, color: pr.color }}>
                        {pr.label}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ color: st.color, background: `${st.color}20` }}>
                        {st.label}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
                      {d.titulo}
                    </h3>
                  </div>
                </div>

                {/* Descricao breve */}
                {d.descricao && (
                  <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {d.descricao}
                  </p>
                )}

                {/* Meta */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {d.solicitante && <span>👤 {d.solicitante}</span>}
                  {d.unidadeDemandante && <span>🏛 {d.unidadeDemandante}</span>}
                  {d.categoria && <span>🏷 {d.categoria}</span>}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t"
                  style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                  <span className="text-xs" style={{ color: pz.color }}>
                    ⏱ {d.prazo ? pz.text : 'Sem prazo'}
                  </span>
                  <div className="flex items-center gap-2">
                    {d.movimentacoes?.length > 0 && (
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        💬 {d.movimentacoes.length}
                      </span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); abrirEditar(d) }}
                      className="text-[10px] px-2 py-0.5 rounded transition-colors"
                      style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>
                      Editar
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* View: Calendário */}
      {view === 'calendario' && (
        <CalendarioDemandas demandas={demandas} onClickDemanda={setModalDetalhe} />
      )}

      {/* Modal Formulário */}
      {modalAberto && (
        <ModalFormDemanda
          uid={uid}
          demanda={demandaSelecionada}
          onClose={() => setModalAberto(false)}
          onDelete={async (id) => {
            setDeletandoId(id)
            await deleteDoc(doc(db, 'users', uid!, 'prontuario', id))
            setDeletandoId(null)
            setModalAberto(false)
          }}
          deletandoId={deletandoId}
        />
      )}

      {/* Modal Detalhe */}
      {modalDetalhe && (
        <ModalDetalheDemanda
          uid={uid}
          demanda={modalDetalhe}
          onClose={() => setModalDetalhe(null)}
          onEdit={() => { setDemandaSelecionada(modalDetalhe); setModalDetalhe(null); setModalAberto(true) }}
        />
      )}
    </div>
  )
}

// ─── Modal Formulário ─────────────────────────────────────────────────────────

function ModalFormDemanda({ uid, demanda, onClose, onDelete, deletandoId }: {
  uid: string | null
  demanda: Demanda | null
  onClose: () => void
  onDelete: (id: string) => void
  deletandoId: string | null
}) {
  const isEdit = !!demanda
  const [form, setForm] = useState<Omit<Demanda, 'id' | 'criadoEm' | 'encaminhamentos' | 'movimentacoes'>>({
    numeroDemanda: demanda?.numeroDemanda || '',
    processoSEI:   demanda?.processoSEI || '',
    titulo:        demanda?.titulo || '',
    descricao:     demanda?.descricao || '',
    dataAbertura:  demanda?.dataAbertura || new Date().toISOString().slice(0, 10),
    prazo:         demanda?.prazo || '',
    solicitante:   demanda?.solicitante || '',
    unidadeDemandante: demanda?.unidadeDemandante || '',
    categoria:     demanda?.categoria || '',
    prioridade:    demanda?.prioridade || 'media',
    status:        demanda?.status || 'aberta',
  })
  const [saving, setSaving] = useState(false)
  // Encaminhamentos
  const [encaminhamentos, setEncaminhamentos] = useState<Encaminhamento[]>(demanda?.encaminhamentos || [])
  const [novoEnc, setNovoEnc] = useState({ de: '', para: '', data: '', observacao: '' })

  const handleSave = async () => {
    if (!uid || !form.titulo.trim()) return
    setSaving(true)
    const id = isEdit ? demanda!.id : newId()
    const payload: Demanda = {
      id,
      ...form,
      encaminhamentos,
      movimentacoes: demanda?.movimentacoes || [],
      criadoEm: demanda?.criadoEm || Date.now(),
    }
    await setDoc(doc(db, 'users', uid, 'prontuario', id), payload)
    setSaving(false)
    onClose()
  }

  const field = (label: string, node: React.ReactNode) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {node}
    </div>
  )

  const inputCls = "text-xs px-3 py-2 rounded-lg outline-none w-full"
  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b sticky top-0"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            {isEdit ? 'Editar Demanda' : 'Nova Demanda'}
          </h2>
          <button onClick={onClose} className="text-xl leading-none" style={{ color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Identificação */}
          <SectionTitle>Identificação</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {field('Nº da Demanda', <input className={inputCls} style={inputStyle} value={form.numeroDemanda} onChange={e => setForm(f => ({ ...f, numeroDemanda: e.target.value }))} placeholder="Ex: 2025/0123" />)}
            {field('Processo SEI', <input className={inputCls} style={inputStyle} value={form.processoSEI} onChange={e => setForm(f => ({ ...f, processoSEI: e.target.value }))} placeholder="Ex: 1234.000123/2025-99" />)}
          </div>
          {field('Título *', <input className={inputCls} style={inputStyle} value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Título descritivo da demanda" />)}
          {field('Descrição Detalhada', <textarea className={inputCls} style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descreva em detalhes o objeto da demanda..." />)}

          {/* Partes */}
          <SectionTitle>Solicitação</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {field('Solicitante', <input className={inputCls} style={inputStyle} value={form.solicitante} onChange={e => setForm(f => ({ ...f, solicitante: e.target.value }))} placeholder="Nome do solicitante" />)}
            {field('Unidade Demandante', <input className={inputCls} style={inputStyle} value={form.unidadeDemandante} onChange={e => setForm(f => ({ ...f, unidadeDemandante: e.target.value }))} placeholder="Ex: Diretoria de Contratos" />)}
          </div>

          {/* Classificação */}
          <SectionTitle>Classificação & Prazos</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {field('Categoria', (
              <select className={inputCls} style={inputStyle} value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                <option value="">Selecionar...</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ))}
            {field('Prioridade', (
              <select className={inputCls} style={inputStyle} value={form.prioridade} onChange={e => setForm(f => ({ ...f, prioridade: e.target.value as Prioridade }))}>
                {Object.entries(PRIORIDADE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            ))}
            {field('Data de Abertura', <input type="date" className={inputCls} style={inputStyle} value={form.dataAbertura} onChange={e => setForm(f => ({ ...f, dataAbertura: e.target.value }))} />)}
            {field('Prazo de Conclusão', <input type="date" className={inputCls} style={inputStyle} value={form.prazo} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))} />)}
            {field('Status', (
              <select className={inputCls} style={inputStyle} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Status }))}>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            ))}
          </div>

          {/* Encaminhamentos */}
          <SectionTitle>Fluxo entre Setores</SectionTitle>
          <div className="flex flex-col gap-2">
            {encaminhamentos.map((enc, i) => (
              <div key={enc.id} className="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)' }}>{enc.de}</span>
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <span style={{ color: 'var(--text-primary)' }} className="font-medium">{enc.para}</span>
                <span style={{ color: 'var(--text-muted)' }}>{enc.data}</span>
                {enc.observacao && <span className="italic" style={{ color: 'var(--text-muted)' }}>— {enc.observacao}</span>}
                <button onClick={() => setEncaminhamentos(e => e.filter((_, j) => j !== i))}
                  className="ml-auto text-red-400/60 hover:text-red-400">✕</button>
              </div>
            ))}
            <div className="grid grid-cols-4 gap-2">
              <input placeholder="De" className={inputCls} style={inputStyle} value={novoEnc.de} onChange={e => setNovoEnc(n => ({ ...n, de: e.target.value }))} />
              <input placeholder="Para" className={inputCls} style={inputStyle} value={novoEnc.para} onChange={e => setNovoEnc(n => ({ ...n, para: e.target.value }))} />
              <input type="date" className={inputCls} style={inputStyle} value={novoEnc.data} onChange={e => setNovoEnc(n => ({ ...n, data: e.target.value }))} />
              <button
                onClick={() => {
                  if (!novoEnc.de || !novoEnc.para) return
                  setEncaminhamentos(e => [...e, { id: newId(), ...novoEnc }])
                  setNovoEnc({ de: '', para: '', data: '', observacao: '' })
                }}
                className="text-xs rounded-lg font-medium transition-colors"
                style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                + Adicionar
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t sticky bottom-0"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <div>
            {isEdit && (
              <button
                onClick={() => onDelete(demanda!.id)}
                disabled={deletandoId === demanda!.id}
                className="text-xs px-3 py-1.5 rounded-lg text-red-400/70 hover:text-red-400 transition-colors"
                style={{ border: '1px solid rgba(239,68,68,0.2)' }}>
                {deletandoId === demanda!.id ? 'Removendo...' : 'Excluir'}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-xs px-4 py-1.5 rounded-lg"
              style={{ background: 'var(--surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving || !form.titulo.trim()}
              className="text-xs px-5 py-1.5 rounded-lg font-semibold transition-opacity disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #3b7cc9, #5b5bd6)', color: '#fff' }}>
              {saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Demanda'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Detalhe ────────────────────────────────────────────────────────────

function ModalDetalheDemanda({ uid, demanda, onClose, onEdit }: {
  uid: string | null
  demanda: Demanda
  onClose: () => void
  onEdit: () => void
}) {
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>(demanda.movimentacoes || [])
  const [novoRelato, setNovoRelato] = useState('')
  const [salvando, setSalvando] = useState(false)
  const dias = diasRestantes(demanda.prazo)
  const pz = prazoLabel(dias)
  const pr = PRIORIDADE_CONFIG[demanda.prioridade]
  const st = STATUS_CONFIG[demanda.status]
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const salvarRelato = async () => {
    if (!uid || !novoRelato.trim()) return
    setSalvando(true)
    const nova: Movimentacao = {
      id: newId(),
      data: new Date().toISOString().slice(0, 16).replace('T', ' '),
      tipo: 'registro',
      descricao: novoRelato.trim(),
    }
    const updated = [...movimentacoes, nova]
    setMovimentacoes(updated)
    await updateDoc(doc(db, 'users', uid, 'prontuario', demanda.id), { movimentacoes: updated })
    setNovoRelato('')
    setSalvando(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto flex flex-col"
        style={{ background: 'var(--card)', border: `1px solid ${cardBorderColor(dias, demanda.status)}` }}>
        {/* Header */}
        <div className="p-5 border-b sticky top-0"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {demanda.numeroDemanda && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>
                    #{demanda.numeroDemanda}
                  </span>
                )}
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: pr.bg, color: pr.color }}>{pr.label}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ color: st.color, background: `${st.color}20` }}>{st.label}</span>
                <span className="text-[10px] font-medium" style={{ color: pz.color }}>⏱ {pz.text}</span>
              </div>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{demanda.titulo}</h2>
            </div>
            <div className="flex gap-2">
              <button onClick={onEdit} className="text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                ✏ Editar
              </button>
              <button onClick={onClose} className="text-lg leading-none" style={{ color: 'var(--text-muted)' }}>✕</button>
            </div>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {[
              ['Solicitante', demanda.solicitante],
              ['Unidade', demanda.unidadeDemandante],
              ['Categoria', demanda.categoria],
              ['Processo SEI', demanda.processoSEI],
              ['Data Abertura', demanda.dataAbertura],
              ['Prazo', demanda.prazo],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k}>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{k}</div>
                <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Descricao */}
          {demanda.descricao && (
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Descrição</div>
              <p className="text-xs leading-relaxed rounded-xl px-3 py-2"
                style={{ color: 'var(--text-secondary)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                {demanda.descricao}
              </p>
            </div>
          )}

          {/* Fluxo */}
          {demanda.encaminhamentos?.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Fluxo entre Setores</div>
              <div className="flex flex-col gap-1.5">
                {demanda.encaminhamentos.map((enc, i) => (
                  <div key={enc.id} className="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <span className="text-[10px] font-mono text-blue-400/70">{String(i + 1).padStart(2, '0')}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{enc.de}</span>
                    <span className="text-amber-400/60">→</span>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{enc.para}</span>
                    <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>{enc.data}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Histórico de movimentações */}
          <div>
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
              Histórico de Movimentações
            </div>
            {movimentacoes.length === 0 ? (
              <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>Nenhum registro ainda.</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                {[...movimentacoes].reverse().map(m => (
                  <div key={m.id} className="flex gap-3 text-xs rounded-xl px-3 py-2"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full mt-1" style={{ background: '#6b9fd4' }} />
                    </div>
                    <div className="flex-1">
                      <div className="font-mono text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>{m.data}</div>
                      <p style={{ color: 'var(--text-secondary)' }} className="leading-relaxed">{m.descricao}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Novo relato */}
          <div className="rounded-xl p-3 flex flex-col gap-2"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>📝 Registrar Movimentação</div>
            <textarea
              ref={textareaRef}
              value={novoRelato}
              onChange={e => setNovoRelato(e.target.value)}
              placeholder="Descreva o que aconteceu com esta demanda..."
              className="text-xs w-full outline-none resize-none leading-relaxed"
              style={{ background: 'transparent', color: 'var(--text-primary)', minHeight: 72 }}
            />
            <div className="flex justify-end">
              <button
                onClick={salvarRelato}
                disabled={salvando || !novoRelato.trim()}
                className="text-xs px-4 py-1.5 rounded-lg font-semibold transition-opacity disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #3b7cc9, #5b5bd6)', color: '#fff' }}>
                {salvando ? 'Salvando...' : '+ Registrar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Calendário de Demandas ───────────────────────────────────────────────────

function CalendarioDemandas({ demandas, onClickDemanda }: {
  demandas: Demanda[]
  onClickDemanda: (d: Demanda) => void
}) {
  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth())
  const [ano, setAno] = useState(hoje.getFullYear())

  const primeiroDia = new Date(ano, mes, 1).getDay()
  const diasNoMes = new Date(ano, mes + 1, 0).getDate()
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

  const eventosPorDia: Record<number, Demanda[]> = {}
  demandas.forEach(d => {
    if (!d.prazo) return
    const dp = new Date(d.prazo + 'T00:00:00')
    if (dp.getMonth() === mes && dp.getFullYear() === ano) {
      const dia = dp.getDate()
      if (!eventosPorDia[dia]) eventosPorDia[dia] = []
      eventosPorDia[dia].push(d)
    }
  })

  const prevMes = () => { if (mes === 0) { setMes(11); setAno(a => a - 1) } else setMes(m => m - 1) }
  const nextMes = () => { if (mes === 11) { setMes(0); setAno(a => a + 1) } else setMes(m => m + 1) }

  const cells: (number | null)[] = [
    ...Array(primeiroDia).fill(null),
    ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
  ]

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-4"
      style={{ background: 'var(--widget-bg)', border: '1px solid var(--border)' }}>
      {/* Nav */}
      <div className="flex items-center justify-between">
        <button onClick={prevMes} className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
          style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>‹</button>
        <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          {MESES[mes]} {ano}
        </div>
        <button onClick={nextMes} className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
          style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>›</button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {DIAS_SEMANA.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold py-1"
            style={{ color: 'var(--text-muted)' }}>{d}</div>
        ))}
        {cells.map((dia, i) => {
          if (!dia) return <div key={i} />
          const eventos = eventosPorDia[dia] || []
          const isHoje = dia === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear()
          return (
            <div key={i}
              className="rounded-xl p-1 min-h-[52px] flex flex-col gap-0.5"
              style={{
                background: isHoje ? 'rgba(91,91,214,0.15)' : eventos.length ? 'rgba(59,124,201,0.08)' : 'transparent',
                border: isHoje ? '1px solid rgba(91,91,214,0.4)' : '1px solid transparent',
              }}>
              <div className="text-[11px] font-medium text-center"
                style={{ color: isHoje ? '#a5a3f5' : 'var(--text-secondary)' }}>{dia}</div>
              {eventos.slice(0, 2).map(ev => {
                const dias = diasRestantes(ev.prazo)
                const cor = dias <= 10 ? '#f87171' : dias <= 15 ? '#fbbf24' : '#6ee7a0'
                return (
                  <button key={ev.id} onClick={() => onClickDemanda(ev)}
                    className="text-[9px] rounded px-1 py-0.5 truncate text-left w-full leading-tight"
                    style={{ background: `${cor}20`, color: cor, border: `1px solid ${cor}30` }}>
                    {ev.titulo}
                  </button>
                )
              })}
              {eventos.length > 2 && (
                <div className="text-[9px] text-center" style={{ color: 'var(--text-muted)' }}>+{eventos.length - 2}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legenda */}
      <div className="flex gap-4 text-[10px] justify-center pt-1" style={{ color: 'var(--text-muted)' }}>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400/60" />≤ 10 dias</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400/60" />11–15 dias</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400/60" />≥ 16 dias</span>
      </div>
    </div>
  )
}

// ─── Section Title helper ─────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{children}</div>
      <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
    </div>
  )
}
