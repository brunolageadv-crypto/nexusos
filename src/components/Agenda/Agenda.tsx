import { useState, useEffect, useCallback, useMemo } from 'react'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore'

// ─── Types ────────────────────────────────────────────────────────────────────
type TipoEvento = 'reuniao' | 'prazo' | 'pessoal' | 'juridico' | 'saude' | 'financeiro' | 'estudo' | 'viagem' | 'aniversario' | 'outro'
type Prioridade = 'alta' | 'media' | 'baixa'
type Recorrencia = 'nenhuma' | 'diaria' | 'semanal' | 'mensal' | 'anual'

interface Evento {
  id: string
  titulo: string
  descricao: string
  data: string        // YYYY-MM-DD
  horaInicio: string  // HH:MM
  horaFim: string     // HH:MM
  tipo: TipoEvento
  prioridade: Prioridade
  recorrencia: Recorrencia
  local: string
  lembrete: number    // minutos antes (0 = sem lembrete)
  concluido: boolean
  criadoEm: string
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const TIPOS: Record<TipoEvento, { label: string; icon: string; cor: string; bg: string }> = {
  reuniao:     { label: 'Reunião',     icon: '🗣',  cor: '#1A73E8', bg: 'rgba(26,115,232,0.10)' },
  prazo:       { label: 'Prazo',       icon: '⏰',  cor: '#D93025', bg: 'rgba(217,48,37,0.10)'  },
  pessoal:     { label: 'Pessoal',     icon: '🏠',  cor: '#F29900', bg: 'rgba(242,153,0,0.10)'  },
  juridico:    { label: 'Jurídico',    icon: '⚖',   cor: '#7B1FA2', bg: 'rgba(123,31,162,0.10)' },
  saude:       { label: 'Saúde',       icon: '✚',   cor: '#0F9D58', bg: 'rgba(15,157,88,0.10)'  },
  financeiro:  { label: 'Financeiro',  icon: '◎',   cor: '#00897B', bg: 'rgba(0,137,123,0.10)'  },
  estudo:      { label: 'Estudo',      icon: '📚',  cor: '#3949AB', bg: 'rgba(57,73,171,0.10)'  },
  viagem:      { label: 'Viagem',      icon: '✈',   cor: '#039BE5', bg: 'rgba(3,155,229,0.10)'  },
  aniversario: { label: 'Aniversário', icon: '🎂',  cor: '#E91E63', bg: 'rgba(233,30,99,0.10)'  },
  outro:       { label: 'Outro',       icon: '◈',   cor: '#78909C', bg: 'rgba(120,144,156,0.10)'}
}

const PRIO: Record<Prioridade, { label: string; cor: string }> = {
  alta:  { label: 'Alta',  cor: '#D93025' },
  media: { label: 'Média', cor: '#F29900' },
  baixa: { label: 'Baixa', cor: '#0F9D58' },
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const DIAS_SEMANA_FULL = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado']

function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function todayISO() { return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10) }
function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, dy] = d.split('-')
  return `${dy}/${m}/${y}`
}

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 13px',
  background: 'var(--input-bg)', border: '1.5px solid var(--border-md)',
  borderRadius: 8, color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)', fontSize: '0.87rem',
}
const sel: React.CSSProperties = { ...inp, cursor: 'pointer' }

function FL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
function useAgenda() {
  const uid = useUid()
  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid || !db) { setLoading(false); return }
    const q = query(collection(db, `users/${uid}/agenda`), orderBy('data', 'asc'))
    return onSnapshot(q, snap => {
      setEventos(snap.docs.map(d => d.data() as Evento))
      setLoading(false)
    })
  }, [uid])

  const save = useCallback(async (e: Evento) => {
    if (uid && db) await setDoc(doc(db, `users/${uid}/agenda`, e.id), e)
    else setEventos(prev => [...prev.filter(x => x.id !== e.id), e].sort((a, b) => a.data.localeCompare(b.data)))
  }, [uid])

  const remove = useCallback(async (id: string) => {
    if (uid && db) await deleteDoc(doc(db, `users/${uid}/agenda`, id))
    else setEventos(prev => prev.filter(x => x.id !== id))
  }, [uid])

  return { eventos, loading, save, remove }
}

// ─── Modal de Evento ──────────────────────────────────────────────────────────
function ModalEvento({ initial, onSave, onClose }: {
  initial?: Partial<Evento>; onSave: (e: Evento) => void; onClose: () => void
}) {
  const [form, setForm] = useState({
    titulo: initial?.titulo ?? '',
    descricao: initial?.descricao ?? '',
    data: initial?.data ?? todayISO(),
    horaInicio: initial?.horaInicio ?? '09:00',
    horaFim: initial?.horaFim ?? '10:00',
    tipo: (initial?.tipo ?? 'pessoal') as TipoEvento,
    prioridade: (initial?.prioridade ?? 'media') as Prioridade,
    recorrencia: (initial?.recorrencia ?? 'nenhuma') as Recorrencia,
    local: initial?.local ?? '',
    lembrete: initial?.lembrete ?? 0,
    concluido: initial?.concluido ?? false,
  })

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const tipo = TIPOS[form.tipo]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-md)', borderRadius: 18, width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow-xl)' }}>
        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--bg-2)', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: tipo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>{tipo.icon}</span>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {(initial as any)?.id ? 'Editar' : 'Novo'} Evento
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{tipo.label}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '18px 22px' }}>
          <FL label="Título">
            <input style={inp} value={form.titulo} onChange={f('titulo')} placeholder="Nome do evento…" autoFocus />
          </FL>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FL label="Tipo">
              <select style={sel} value={form.tipo} onChange={f('tipo')}>
                {(Object.entries(TIPOS) as [TipoEvento, typeof TIPOS[TipoEvento]][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </FL>
            <FL label="Prioridade">
              <select style={sel} value={form.prioridade} onChange={f('prioridade')}>
                <option value="alta">🔴 Alta</option>
                <option value="media">🟡 Média</option>
                <option value="baixa">🟢 Baixa</option>
              </select>
            </FL>
          </div>

          <FL label="Data">
            <input type="date" style={inp} value={form.data} onChange={f('data')} />
          </FL>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FL label="Hora início"><input type="time" style={inp} value={form.horaInicio} onChange={f('horaInicio')} /></FL>
            <FL label="Hora fim"><input type="time" style={inp} value={form.horaFim} onChange={f('horaFim')} /></FL>
          </div>

          <FL label="Local">
            <input style={inp} value={form.local} onChange={f('local')} placeholder="Endereço ou local do evento…" />
          </FL>

          <FL label="Descrição / Notas">
            <textarea style={{ ...inp, minHeight: 72, resize: 'vertical' } as React.CSSProperties}
              value={form.descricao} onChange={f('descricao')}
              placeholder="Detalhes, pauta, observações…" />
          </FL>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FL label="Recorrência">
              <select style={sel} value={form.recorrencia} onChange={f('recorrencia')}>
                <option value="nenhuma">Sem recorrência</option>
                <option value="diaria">Diária</option>
                <option value="semanal">Semanal</option>
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
              </select>
            </FL>
            <FL label="Lembrete">
              <select style={sel} value={form.lembrete} onChange={e => setForm(p => ({ ...p, lembrete: +e.target.value }))}>
                <option value={0}>Sem lembrete</option>
                <option value={5}>5 minutos antes</option>
                <option value={15}>15 minutos antes</option>
                <option value={30}>30 minutos antes</option>
                <option value={60}>1 hora antes</option>
                <option value={1440}>1 dia antes</option>
              </select>
            </FL>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 18 }}>
            <input type="checkbox" checked={form.concluido}
              onChange={e => setForm(p => ({ ...p, concluido: e.target.checked }))} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Marcar como concluído</span>
          </label>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose}
              style={{ padding: '9px 18px', borderRadius: 20, border: '1.5px solid var(--border-md)', background: 'none', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button onClick={() => {
              if (!form.titulo.trim()) return
              onSave({
                id: (initial as any)?.id ?? newId(),
                criadoEm: (initial as any)?.criadoEm ?? new Date().toISOString(),
                ...form,
              })
            }}
              style={{ padding: '9px 22px', borderRadius: 20, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 4px rgba(26,115,232,0.3)' }}>
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Chip de tipo ─────────────────────────────────────────────────────────────
function TipoChip({ tipo, small = false }: { tipo: TipoEvento; small?: boolean }) {
  const t = TIPOS[tipo]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: small ? '2px 7px' : '3px 9px',
      borderRadius: 12, fontSize: small ? '0.6rem' : '0.68rem',
      fontWeight: 600, background: t.bg, color: t.cor,
      border: `1px solid ${t.cor}30`,
    }}>
      {t.icon} {t.label}
    </span>
  )
}

// ─── Mini calendário inline ───────────────────────────────────────────────────
function MiniCalendario({ eventos, selectedDate, onSelectDate, mesAtual, onMesChange }: {
  eventos: Evento[]; selectedDate: string; onSelectDate: (d: string) => void
  mesAtual: Date; onMesChange: (d: Date) => void
}) {
  const ano = mesAtual.getFullYear()
  const mes = mesAtual.getMonth()
  const primeiroDia = new Date(ano, mes, 1).getDay()
  const totalDias = new Date(ano, mes + 1, 0).getDate()
  const hoje = todayISO()

  const diasComEventos = useMemo(() => {
    const set: Record<string, TipoEvento[]> = {}
    eventos.forEach(e => {
      if (!set[e.data]) set[e.data] = []
      if (!set[e.data].includes(e.tipo)) set[e.data].push(e.tipo)
    })
    return set
  }, [eventos])

  const cells = [
    ...Array(primeiroDia).fill(null),
    ...Array.from({ length: totalDias }, (_, i) => i + 1),
  ]

  return (
    <div style={{ userSelect: 'none' }}>
      {/* Navegação do mês */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={() => onMesChange(new Date(ano, mes - 1, 1))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, color: 'var(--text-muted)', fontSize: '1rem' }}>‹</button>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
          {MESES[mes]} {ano}
        </div>
        <button onClick={() => onMesChange(new Date(ano, mes + 1, 1))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, color: 'var(--text-muted)', fontSize: '1rem' }}>›</button>
      </div>

      {/* Header dias */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
        {DIAS_SEMANA.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', padding: '2px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {cells.map((dia, i) => {
          if (!dia) return <div key={i} />
          const ds = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
          const isToday = ds === hoje
          const isSelected = ds === selectedDate
          const tipos = diasComEventos[ds] || []
          return (
            <button key={i} onClick={() => onSelectDate(ds)}
              style={{
                position: 'relative', textAlign: 'center', padding: '5px 2px',
                borderRadius: 8, border: 'none', cursor: 'pointer',
                background: isSelected ? 'var(--accent)' : isToday ? 'rgba(26,115,232,0.1)' : 'transparent',
                color: isSelected ? '#fff' : isToday ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: '0.8rem', fontWeight: isToday || isSelected ? 700 : 400,
                outline: isToday && !isSelected ? '1.5px solid var(--accent)' : 'none',
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
              {dia}
              {tipos.length > 0 && (
                <div style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 2 }}>
                  {tipos.slice(0, 3).map((t, ti) => (
                    <div key={ti} style={{ width: 4, height: 4, borderRadius: '50%', background: TIPOS[t].cor }} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Card de evento ───────────────────────────────────────────────────────────
function EventoCard({ evento, onEdit, onDelete, onToggle }: {
  evento: Evento; onEdit: () => void; onDelete: () => void; onToggle: () => void
}) {
  const t = TIPOS[evento.tipo]
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '12px 14px',
      borderRadius: 12, border: `1px solid ${evento.concluido ? 'var(--border)' : t.cor + '25'}`,
      background: evento.concluido ? 'var(--bg-1)' : t.bg,
      marginBottom: 8, transition: 'all 0.15s',
      opacity: evento.concluido ? 0.65 : 1,
    }}>
      {/* Ícone + check */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{t.icon}</span>
        <input type="checkbox" checked={evento.concluido} onChange={onToggle}
          style={{ width: 14, height: 14, cursor: 'pointer', accentColor: t.cor }} />
      </div>
      {/* Conteúdo */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)', textDecoration: evento.concluido ? 'line-through' : 'none', flex: 1 }}>
            {evento.titulo}
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <TipoChip tipo={evento.tipo} small />
            <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: 8, background: PRIO[evento.prioridade].cor + '15', color: PRIO[evento.prioridade].cor, border: `1px solid ${PRIO[evento.prioridade].cor}30`, fontWeight: 600 }}>
              {PRIO[evento.prioridade].label}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          {(evento.horaInicio || evento.horaFim) && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
              🕐 {evento.horaInicio}{evento.horaFim ? ` – ${evento.horaFim}` : ''}
            </span>
          )}
          {evento.local && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
              📍 {evento.local}
            </span>
          )}
          {evento.recorrencia !== 'nenhuma' && (
            <span style={{ fontSize: '0.72rem', color: 'var(--accent)' }}>🔄 {evento.recorrencia}</span>
          )}
        </div>
        {evento.descricao && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
            {evento.descricao}
          </div>
        )}
      </div>
      {/* Ações */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button onClick={onEdit} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 7px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.72rem' }}>✎</button>
        <button onClick={onDelete} style={{ background: 'none', border: '1px solid rgba(217,48,37,0.2)', borderRadius: 6, padding: '3px 7px', color: '#D93025', cursor: 'pointer', fontSize: '0.72rem' }}>✕</button>
      </div>
    </div>
  )
}

// ─── View semanal ─────────────────────────────────────────────────────────────
function ViewSemanal({ eventos, onAddEvento, onEditEvento }: { eventos: Evento[]; onAddEvento: (data: string) => void; onEditEvento: (e: Evento) => void }) {
  const hoje = new Date(Date.now()-3*3600000)
  const inicioSemana = new Date(hoje)
  inicioSemana.setDate(hoje.getDate() - hoje.getDay())
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicioSemana)
    d.setDate(inicioSemana.getDate() + i)
    return d
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
      {dias.map((d, i) => {
        const ds = d.toISOString().slice(0, 10)
        const evDia = eventos.filter(e => e.data === ds)
        const isToday = ds === todayISO()
        return (
          <div key={i} style={{ minHeight: 120, borderRadius: 12, border: `1.5px solid ${isToday ? 'var(--accent)' : 'var(--border)'}`, padding: '8px', background: isToday ? 'rgba(26,115,232,0.04)' : 'var(--card-bg)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: isToday ? 700 : 500, fontSize: '0.75rem', color: isToday ? 'var(--accent)' : 'var(--text-muted)', marginBottom: 6, textAlign: 'center' }}>
              <div>{DIAS_SEMANA[i]}</div>
              <div style={{ fontSize: '1.2rem', color: isToday ? 'var(--accent)' : 'var(--text-primary)', fontWeight: 700 }}>{d.getDate()}</div>
            </div>
            {evDia.slice(0, 3).map(ev => (
              <div key={ev.id} onClick={() => onEditEvento(ev)}
                style={{ padding: '3px 6px', borderRadius: 6, marginBottom: 3, background: TIPOS[ev.tipo].bg, color: TIPOS[ev.tipo].cor, fontSize: '0.62rem', fontWeight: 600, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: `1px solid ${TIPOS[ev.tipo].cor}25` }}>
                {ev.horaInicio && `${ev.horaInicio} `}{ev.titulo}
              </div>
            ))}
            {evDia.length > 3 && <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textAlign: 'center' }}>+{evDia.length - 3}</div>}
            <button onClick={() => onAddEvento(ds)}
              style={{ width: '100%', marginTop: 4, padding: '3px', border: '1px dashed var(--border-md)', borderRadius: 6, background: 'none', color: 'var(--text-subtle)', fontSize: '0.65rem', cursor: 'pointer' }}>+</button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Agenda ──────────────────────────────────────────────────────────────
type AgendaView = 'mes' | 'semana' | 'lista'
type FiltroTipo = TipoEvento | 'todos'

export default function Agenda() {
  const { eventos, loading, save, remove } = useAgenda()
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [mesAtual, setMesAtual] = useState(new Date())
  const [view, setView] = useState<AgendaView>('mes')
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos')
  const [filtroPrio, setFiltroPrio] = useState<Prioridade | 'todos'>('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [editEvento, setEditEvento] = useState<Partial<Evento> | null>(null)
  const [busca, setBusca] = useState('')

  const eventosData = useMemo(() =>
    eventos.filter(e => e.data === selectedDate), [eventos, selectedDate])

  const eventosFiltrados = useMemo(() => {
    return eventosData.filter(e => {
      if (filtroTipo !== 'todos' && e.tipo !== filtroTipo) return false
      if (filtroPrio !== 'todos' && e.prioridade !== filtroPrio) return false
      if (busca && !e.titulo.toLowerCase().includes(busca.toLowerCase()) && !e.descricao?.toLowerCase().includes(busca.toLowerCase())) return false
      return true
    })
  }, [eventosData, filtroTipo, filtroPrio, busca])

  const eventosLista = useMemo(() => {
    return [...eventos].filter(e => {
      if (filtroTipo !== 'todos' && e.tipo !== filtroTipo) return false
      if (filtroPrio !== 'todos' && e.prioridade !== filtroPrio) return false
      if (busca && !e.titulo.toLowerCase().includes(busca.toLowerCase())) return false
      return true
    }).sort((a, b) => a.data.localeCompare(b.data) || a.horaInicio.localeCompare(b.horaInicio))
  }, [eventos, filtroTipo, filtroPrio, busca])

  // Stats
  const hoje = todayISO()
  const eventosHoje = eventos.filter(e => e.data === hoje)
  const eventosSemana = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay())
    const ini = d.toISOString().slice(0, 10)
    d.setDate(d.getDate() + 6)
    const fim = d.toISOString().slice(0, 10)
    return eventos.filter(e => e.data >= ini && e.data <= fim)
  }, [eventos])
  const proximos = useMemo(() => eventos.filter(e => e.data >= hoje && !e.concluido).slice(0, 5), [eventos, hoje])

  const openAdd = (data?: string) => { setEditEvento({ data: data || selectedDate }); setModalOpen(true) }
  const openEdit = (e: Evento) => { setEditEvento(e); setModalOpen(true) }
  const handleSave = async (e: Evento) => { await save(e); setModalOpen(false); setEditEvento(null) }

  const tabBtn = (v: AgendaView, _label?: string) => ({
    padding: '7px 16px', borderRadius: 20, border: 'none',
    background: view === v ? 'var(--accent)' : 'var(--bg-3)',
    color: view === v ? '#fff' : 'var(--text-secondary)',
    fontWeight: 500, fontSize: '0.82rem', cursor: 'pointer',
    fontFamily: 'var(--font-body)', transition: 'all 0.15s',
  } as React.CSSProperties)

  // Dia selecionado formatado
  const dataSel = new Date(selectedDate + 'T12:00:00')
  const dataLabel = `${DIAS_SEMANA_FULL[dataSel.getDay()]}, ${dataSel.getDate()} de ${MESES[dataSel.getMonth()]}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-0)' }}>
      {/* ── HEADER ── */}
      <div style={{ padding: '16px 24px 12px', background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)', margin: 0 }}>
              📅 Agenda
            </h2>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {eventosHoje.length} evento{eventosHoje.length !== 1 ? 's' : ''} hoje · {eventosSemana.length} esta semana
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-1)', padding: 4, borderRadius: 24, border: '1px solid var(--border)' }}>
              {(['mes', 'semana', 'lista'] as AgendaView[]).map(v => (
                <button key={v} style={tabBtn(v, v)} onClick={() => setView(v)}>
                  {v === 'mes' ? '📅 Mês' : v === 'semana' ? '📆 Semana' : '☰ Lista'}
                </button>
              ))}
            </div>
            <button onClick={() => openAdd()}
              style={{ padding: '8px 18px', borderRadius: 20, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 1px 4px rgba(26,115,232,0.3)' }}>
              + Novo Evento
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="🔍 Buscar eventos…"
            style={{ padding: '6px 12px', borderRadius: 20, border: '1.5px solid var(--border-md)', background: 'var(--bg-1)', color: 'var(--text-primary)', fontSize: '0.82rem', fontFamily: 'var(--font-body)', outline: 'none', width: 180 }} />
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as FiltroTipo)}
            style={{ ...sel, width: 'auto', padding: '6px 12px', borderRadius: 20 }}>
            <option value="todos">Todos os tipos</option>
            {(Object.entries(TIPOS) as [TipoEvento, typeof TIPOS[TipoEvento]][]).map(([k, v]) => (
              <option key={k} value={k}>{v.icon} {v.label}</option>
            ))}
          </select>
          <select value={filtroPrio} onChange={e => setFiltroPrio(e.target.value as Prioridade | 'todos')}
            style={{ ...sel, width: 'auto', padding: '6px 12px', borderRadius: 20 }}>
            <option value="todos">Todas prioridades</option>
            <option value="alta">🔴 Alta</option>
            <option value="media">🟡 Média</option>
            <option value="baixa">🟢 Baixa</option>
          </select>
          {(busca || filtroTipo !== 'todos' || filtroPrio !== 'todos') && (
            <button onClick={() => { setBusca(''); setFiltroTipo('todos'); setFiltroPrio('todos') }}
              style={{ padding: '6px 12px', borderRadius: 20, border: '1px solid var(--border-md)', background: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer' }}>
              ✕ Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* ── CORPO ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* View LISTA */}
        {view === 'lista' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando…</div>
            ) : eventosLista.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📅</div>
                <div className="empty-state-title">Nenhum evento</div>
                <div className="empty-state-desc">Adicione seu primeiro evento clicando em "+ Novo Evento"</div>
              </div>
            ) : (() => {
              let lastDate = ''
              return eventosLista.map(ev => {
                const showHeader = ev.data !== lastDate
                lastDate = ev.data
                return (
                  <div key={ev.id}>
                    {showHeader && (
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.82rem', color: ev.data === hoje ? 'var(--accent)' : 'var(--text-muted)', padding: '12px 0 6px', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
                        {fmtDate(ev.data)} — {(() => { const d = new Date(ev.data + 'T12:00:00'); return `${DIAS_SEMANA_FULL[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}` })()}
                        {ev.data === hoje && <span style={{ marginLeft: 8, fontSize: '0.65rem', background: 'var(--accent)', color: '#fff', padding: '1px 8px', borderRadius: 10 }}>HOJE</span>}
                      </div>
                    )}
                    <EventoCard evento={ev} onEdit={() => openEdit(ev)} onDelete={() => { if (confirm('Remover evento?')) remove(ev.id) }} onToggle={() => save({ ...ev, concluido: !ev.concluido })} />
                  </div>
                )
              })
            })()}
          </div>
        )}

        {/* View SEMANA */}
        {view === 'semana' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            <ViewSemanal eventos={eventosLista} onAddEvento={openAdd} onEditEvento={openEdit} />
          </div>
        )}

        {/* View MÊS — layout dividido */}
        {view === 'mes' && (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', overflow: 'hidden' }}>
            {/* Coluna calendário */}
            <div style={{ padding: '20px 16px 20px 24px', borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--card-bg)' }}>
              <MiniCalendario
                eventos={eventos}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                mesAtual={mesAtual}
                onMesChange={setMesAtual}
              />

              {/* Mini stats */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Próximos</div>
                {proximos.length === 0 ? (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem eventos futuros</div>
                ) : proximos.map(e => (
                  <div key={e.id} onClick={() => { setSelectedDate(e.data); setMesAtual(new Date(e.data + 'T12:00:00')) }}
                    style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    <span style={{ width: 4, height: 32, borderRadius: 2, background: TIPOS[e.tipo].cor, flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.titulo}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{fmtDate(e.data)}{e.horaInicio ? ` · ${e.horaInicio}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Coluna eventos do dia */}
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Header do dia */}
              <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--card-bg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: selectedDate === hoje ? 'var(--accent)' : 'var(--text-primary)' }}>
                      {dataLabel}
                      {selectedDate === hoje && <span style={{ marginLeft: 8, fontSize: '0.6rem', background: 'var(--accent)', color: '#fff', padding: '2px 8px', borderRadius: 10 }}>HOJE</span>}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {eventosFiltrados.length} evento{eventosFiltrados.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <button onClick={() => openAdd(selectedDate)}
                    style={{ padding: '7px 14px', borderRadius: 20, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: '0.80rem', cursor: 'pointer' }}>
                    + Adicionar
                  </button>
                </div>
              </div>

              {/* Lista de eventos do dia */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {eventosFiltrados.length === 0 ? (
                  <div className="empty-state" style={{ paddingTop: 48 }}>
                    <div className="empty-state-icon">📅</div>
                    <div className="empty-state-title">Nenhum evento neste dia</div>
                    <div className="empty-state-desc">Clique em "+ Adicionar" para criar um evento</div>
                    <button onClick={() => openAdd(selectedDate)}
                      style={{ marginTop: 12, padding: '8px 18px', borderRadius: 20, border: '1.5px dashed var(--border-md)', background: 'none', color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer' }}>
                      + Criar evento para {fmtDate(selectedDate)}
                    </button>
                  </div>
                ) : (
                  eventosFiltrados.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio)).map(ev => (
                    <EventoCard key={ev.id} evento={ev}
                      onEdit={() => openEdit(ev)}
                      onDelete={() => { if (confirm('Remover evento?')) remove(ev.id) }}
                      onToggle={() => save({ ...ev, concluido: !ev.concluido })}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <ModalEvento
          initial={editEvento ?? undefined}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditEvento(null) }}
        />
      )}
    </div>
  )
}
