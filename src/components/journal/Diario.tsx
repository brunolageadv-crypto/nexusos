import { useEffect, useState, useCallback, useRef } from 'react'
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Task { id: string; texto: string; feito: boolean; prioridade: 'alta' | 'media' | 'baixa' }
interface Evento { id: string; hora: string; descricao: string; tipo: 'work' | 'study' | 'personal' | 'health' }

interface JournalDia {
  planejamento: Task[]
  timeline: Evento[]
  pensamento: string
  updatedAt: number
}

function today() { return new Date().toISOString().slice(0, 10) }
function newId() { return Math.random().toString(36).slice(2, 10) }
function fmtData(d: string) {
  const dt = new Date(d + 'T12:00:00')
  return dt.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function defaultDia(): JournalDia {
  return { planejamento: [], timeline: [], pensamento: '', updatedAt: Date.now() }
}

// ─── Hook principal ───────────────────────────────────────────────────────────
function useJournalDia(uid: string | null, data: string) {
  const [dia, setDia] = useState<JournalDia>(defaultDia())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!uid) return
    getDoc(doc(db, 'users', uid, 'journal', data)).then(snap => {
      if (snap.exists()) setDia({ ...defaultDia(), ...snap.data() as JournalDia })
      else setDia(defaultDia())
    })
  }, [uid, data])

  const update = useCallback((partial: Partial<JournalDia>) => {
    setDia(prev => {
      const next = { ...prev, ...partial, updatedAt: Date.now() }
      setSaved(false)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(async () => {
        if (!uid) return
        setSaving(true)
        await setDoc(doc(db, 'users', uid, 'journal', data), next)
        setSaving(false)
        setSaved(true)
      }, 1200)
      return next
    })
  }, [uid, data])

  return { dia, update, saving, saved }
}

// ─── Componente Tasks ─────────────────────────────────────────────────────────
function SecaoTasks({ tasks, onChange }: { tasks: Task[]; onChange: (t: Task[]) => void }) {
  const [novoTexto, setNovoTexto] = useState('')
  const [novaPrioridade, setNovaPrioridade] = useState<Task['prioridade']>('media')

  const addTask = () => {
    if (!novoTexto.trim()) return
    onChange([...tasks, { id: newId(), texto: novoTexto.trim(), feito: false, prioridade: novaPrioridade }])
    setNovoTexto('')
  }
  const toggleTask = (id: string) => onChange(tasks.map(t => t.id === id ? { ...t, feito: !t.feito } : t))
  const removeTask = (id: string) => onChange(tasks.filter(t => t.id !== id))

  const PR_COR: Record<Task['prioridade'], string> = { alta: '#f87171', media: '#fbbf24', baixa: '#6ee7a0' }
  const PR_LABEL: Record<Task['prioridade'], string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }

  const sorted = [...tasks].sort((a, b) => {
    const ord = { alta: 0, media: 1, baixa: 2 }
    return ord[a.prioridade] - ord[b.prioridade]
  })

  const concluidas = tasks.filter(t => t.feito).length
  const pct = tasks.length > 0 ? Math.round((concluidas / tasks.length) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Progress bar */}
      {tasks.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            <span>{concluidas}/{tasks.length} concluídas</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: pct === 100 ? '#6ee7a0' : 'var(--text-muted)' }}>{pct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'linear-gradient(90deg,#6ee7a0,#34d399)' : 'linear-gradient(90deg,#6366f1,#8b5cf6)', borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
        </div>
      )}

      {/* Lista de tasks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
            Nenhuma task. Adicione abaixo.
          </div>
        )}
        {sorted.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: t.feito ? 'rgba(110,231,160,0.04)' : 'rgba(255,255,255,0.03)', border: `1px solid ${t.feito ? 'rgba(110,231,160,0.15)' : 'rgba(255,255,255,0.07)'}`, transition: 'all 0.2s' }}>
            <button
              onClick={() => toggleTask(t.id)}
              style={{ width: 24, height: 24, borderRadius: 7, border: `2px solid ${t.feito ? '#6ee7a0' : PR_COR[t.prioridade]}`, background: t.feito ? '#6ee7a0' : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#0a0f1a', transition: 'all 0.2s' }}>
              {t.feito ? '✓' : ''}
            </button>
            <span style={{ flex: 1, fontSize: '0.84rem', color: t.feito ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: t.feito ? 'line-through' : 'none', transition: 'all 0.2s' }}>{t.texto}</span>
            <span style={{ fontSize: '0.6rem', padding: '2px 8px', borderRadius: 10, background: `${PR_COR[t.prioridade]}15`, color: PR_COR[t.prioridade], fontWeight: 700, flexShrink: 0, border: `1px solid ${PR_COR[t.prioridade]}30` }}>{PR_LABEL[t.prioridade]}</span>
            <button onClick={() => removeTask(t.id)} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.35)', cursor: 'pointer', fontSize: '0.9rem', padding: 2, lineHeight: 1, flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>

      {/* Adicionar nova */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input
          style={{ flex: 1, padding: '9px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.84rem', outline: 'none' }}
          value={novoTexto}
          onChange={e => setNovoTexto(e.target.value)}
          placeholder="Nova task..."
          onKeyDown={e => e.key === 'Enter' && addTask()}
        />
        <select
          style={{ padding: '9px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer', outline: 'none' }}
          value={novaPrioridade}
          onChange={e => setNovaPrioridade(e.target.value as Task['prioridade'])}>
          <option value="alta">🔴 Alta</option>
          <option value="media">🟡 Média</option>
          <option value="baixa">🟢 Baixa</option>
        </select>
        <button
          onClick={addTask}
          style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: 'rgba(99,102,241,0.2)', color: '#818cf8', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.15s' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.35)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.2)'}>
          + Add
        </button>
      </div>
    </div>
  )
}

// ─── Componente Timeline ──────────────────────────────────────────────────────
function SecaoTimeline({ eventos, onChange }: { eventos: Evento[]; onChange: (e: Evento[]) => void }) {
  const [novaHora, setNovaHora] = useState('')
  const [novaDesc, setNovaDesc] = useState('')
  const [novoTipo, setNovoTipo] = useState<Evento['tipo']>('work')

  const add = () => {
    if (!novaDesc.trim()) return
    const sorted = [...eventos, { id: newId(), hora: novaHora || new Date().toTimeString().slice(0, 5), descricao: novaDesc.trim(), tipo: novoTipo }]
      .sort((a, b) => a.hora.localeCompare(b.hora))
    onChange(sorted)
    setNovaDesc('')
  }

  const TIPO_COR: Record<Evento['tipo'], string> = { work: '#60a5fa', study: '#a78bfa', personal: '#fbbf24', health: '#34d399' }
  const TIPO_ICON: Record<Evento['tipo'], string> = { work: '💼', study: '📚', personal: '🏠', health: '✚' }
  const TIPO_LABEL: Record<Evento['tipo'], string> = { work: 'Trabalho', study: 'Estudo', personal: 'Pessoal', health: 'Saúde' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {eventos.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
          Nenhum evento registrado.
        </div>
      )}

      {eventos.map((ev, i) => (
        <div key={ev.id} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', paddingBottom: 4 }}>
          {/* Coluna de hora + linha */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 48 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: TIPO_COR[ev.tipo], fontWeight: 700, marginBottom: 4, lineHeight: 1 }}>{ev.hora}</div>
            {i < eventos.length - 1 && (
              <div style={{ width: 2, height: 28, background: `${TIPO_COR[ev.tipo]}30`, borderRadius: 2 }} />
            )}
          </div>
          {/* Bolinha */}
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: TIPO_COR[ev.tipo], flexShrink: 0, marginTop: 3, boxShadow: `0 0 8px ${TIPO_COR[ev.tipo]}50` }} />
          {/* Conteúdo */}
          <div style={{ flex: 1, padding: '8px 14px', borderRadius: 10, background: `${TIPO_COR[ev.tipo]}08`, border: `1px solid ${TIPO_COR[ev.tipo]}20`, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>{TIPO_ICON[ev.tipo]}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500 }}>{ev.descricao}</div>
              <div style={{ fontSize: '0.62rem', color: TIPO_COR[ev.tipo], marginTop: 2, fontWeight: 600, letterSpacing: '0.05em' }}>{TIPO_LABEL[ev.tipo]}</div>
            </div>
            <button onClick={() => onChange(eventos.filter(e => e.id !== ev.id))} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.3)', cursor: 'pointer', fontSize: '0.85rem', padding: 2, flexShrink: 0 }}>✕</button>
          </div>
        </div>
      ))}

      {/* Adicionar */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input type="time" style={{ padding: '9px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.84rem', outline: 'none', width: 100 }} value={novaHora} onChange={e => setNovaHora(e.target.value)} />
        <input style={{ flex: 1, padding: '9px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.84rem', outline: 'none' }} value={novaDesc} onChange={e => setNovaDesc(e.target.value)} placeholder="Descreva o evento..." onKeyDown={e => e.key === 'Enter' && add()} />
        <select style={{ padding: '9px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer', outline: 'none' }} value={novoTipo} onChange={e => setNovoTipo(e.target.value as Evento['tipo'])}>
          <option value="work">💼 Trabalho</option>
          <option value="study">📚 Estudo</option>
          <option value="personal">🏠 Pessoal</option>
          <option value="health">✚ Saúde</option>
        </select>
        <button onClick={add} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: 'rgba(96,165,250,0.15)', color: '#60a5fa', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>+</button>
      </div>
    </div>
  )
}

// ─── Componente Pensamento ────────────────────────────────────────────────────
function SecaoPensamento({ texto, onChange }: { texto: string; onChange: (t: string) => void }) {
  const palavras = texto.trim() ? texto.trim().split(/\s+/).length : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Mensagem inspiracional */}
      <div style={{ padding: '12px 16px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.06) 100%)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '0.75rem', color: 'rgba(165,163,245,0.8)', fontStyle: 'italic', lineHeight: 1.7 }}>
        ✨ Este é o seu espaço de pensamento livre. Anote reflexões, insights, notas de apoio, frases que marcaram o dia — sem julgamentos.
      </div>

      <div style={{ position: 'relative' }}>
        <textarea
          value={texto}
          onChange={e => onChange(e.target.value)}
          placeholder="O que está na sua mente hoje? Um pensamento, uma frase de apoio, algo que quer lembrar..."
          style={{
            width: '100%',
            minHeight: 200,
            padding: '16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 14,
            color: 'var(--text-primary)',
            fontSize: '0.92rem',
            lineHeight: 1.9,
            resize: 'vertical',
            outline: 'none',
            fontFamily: 'var(--font-body)',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s',
          }}
          onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.4)'}
          onBlur={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        {palavras} palavra{palavras !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
type SecaoId = 'tasks' | 'timeline' | 'pensamento'

interface SecaoConfig {
  id: SecaoId
  icon: string
  label: string
  desc: string
  cor: string
  gradiente: string
}

const SECOES: SecaoConfig[] = [
  {
    id: 'tasks',
    icon: '✅',
    label: 'Tasks',
    desc: 'Planejamento do dia',
    cor: '#818cf8',
    gradiente: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.08) 100%)',
  },
  {
    id: 'timeline',
    icon: '⏱',
    label: 'Timeline',
    desc: 'Registro de atividades',
    cor: '#60a5fa',
    gradiente: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(96,165,250,0.08) 100%)',
  },
  {
    id: 'pensamento',
    icon: '💭',
    label: 'Pensamento',
    desc: 'Notas & reflexões do dia',
    cor: '#f59e0b',
    gradiente: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(251,191,36,0.06) 100%)',
  },
]

interface Props { onNavigate: (id: string) => void }

export default function Diario({ onNavigate: _onNavigate }: Props) {
  const uid = useUid()
  const [dataSelecionada, setDataSelecionada] = useState(today())
  const [secaoAtiva, setSecaoAtiva] = useState<SecaoId>('tasks')
  const { dia, update, saving, saved } = useJournalDia(uid, dataSelecionada)
  const isHoje = dataSelecionada === today()

  const irParaOntem = () => {
    const d = new Date(dataSelecionada + 'T12:00:00'); d.setDate(d.getDate() - 1)
    setDataSelecionada(d.toISOString().slice(0, 10))
  }
  const irParaProximo = () => {
    const d = new Date(dataSelecionada + 'T12:00:00'); d.setDate(d.getDate() + 1)
    const nova = d.toISOString().slice(0, 10)
    if (nova <= today()) setDataSelecionada(nova)
  }

  const secaoAtual = SECOES.find(s => s.id === secaoAtiva)!

  // Contadores para badges
  const counts: Record<SecaoId, number | null> = {
    tasks: dia.planejamento.length,
    timeline: dia.timeline.length,
    pensamento: dia.pensamento.trim() ? dia.pensamento.trim().split(/\s+/).length : null,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-0)' }}>

      {/* ── HEADER ── */}
      <div style={{
        background: 'linear-gradient(180deg, rgba(99,102,241,0.1) 0%, transparent 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        padding: '20px 28px 18px',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Orb decorativo */}
        <div style={{ position: 'absolute', top: -60, right: -60, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          {/* Data e título */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Calendário visual */}
            <div style={{ width: 58, height: 58, borderRadius: 16, background: isHoje ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)', border: `2px solid ${isHoje ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: isHoje ? '0 0 20px rgba(99,102,241,0.2)' : 'none' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.4rem', color: isHoje ? '#818cf8' : 'var(--text-secondary)', lineHeight: 1 }}>
                {new Date(dataSelecionada + 'T12:00:00').getDate()}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: isHoje ? '#818cf8' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {new Date(dataSelecionada + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}
              </div>
            </div>
            <div>
              {isHoje && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', marginBottom: 5 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#818cf8', animation: 'pulse 2s infinite' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700, color: '#818cf8', letterSpacing: '0.12em' }}>HOJE</span>
                </div>
              )}
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>
                {fmtData(dataSelecionada)}
              </div>
            </div>
          </div>

          {/* Controles direita */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Navegação de data */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <button onClick={irParaOntem} style={{ width: 30, height: 30, borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
              <input type="date" value={dataSelecionada} max={today()} onChange={e => setDataSelecionada(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.75rem', outline: 'none', cursor: 'pointer' }} />
              <button onClick={irParaProximo} disabled={dataSelecionada >= today()} style={{ width: 30, height: 30, borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.05)', color: dataSelecionada >= today() ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: dataSelecionada >= today() ? 'not-allowed' : 'pointer', fontSize: '1.1rem', opacity: dataSelecionada >= today() ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
            </div>

            {/* Status sync */}
            <div style={{ fontSize: '0.62rem', color: saving ? '#fbbf24' : saved ? '#6ee7a0' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', minWidth: 70 }}>
              {saving ? '↻ Salvando…' : saved ? '✓ Salvo' : '○ Editando'}
            </div>
          </div>
        </div>
      </div>

      {/* ── CARDS DE NAVEGAÇÃO ── */}
      <div style={{ padding: '20px 28px 0', flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {SECOES.map(s => {
            const ativa = secaoAtiva === s.id
            const count = counts[s.id]
            return (
              <button
                key={s.id}
                onClick={() => setSecaoAtiva(s.id)}
                style={{
                  padding: '16px 18px',
                  borderRadius: 16,
                  border: `1px solid ${ativa ? `${s.cor}40` : 'rgba(255,255,255,0.07)'}`,
                  background: ativa ? s.gradiente : 'rgba(255,255,255,0.02)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                  outline: 'none',
                  boxShadow: ativa ? `0 4px 20px ${s.cor}15` : 'none',
                  transform: ativa ? 'translateY(-1px)' : 'none',
                }}
                onMouseEnter={e => {
                  if (!ativa) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
                }}
                onMouseLeave={e => {
                  if (!ativa) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{s.icon}</span>
                  {count !== null && count > 0 && (
                    <span style={{ fontSize: '0.6rem', padding: '2px 8px', borderRadius: 20, background: ativa ? `${s.cor}25` : 'rgba(255,255,255,0.08)', color: ativa ? s.cor : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 700, border: `1px solid ${ativa ? `${s.cor}30` : 'rgba(255,255,255,0.1)'}` }}>
                      {s.id === 'pensamento' ? `${count}w` : count}
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: ativa ? s.cor : 'var(--text-primary)', marginBottom: 3, transition: 'color 0.2s' }}>{s.label}</div>
                <div style={{ fontSize: '0.68rem', color: ativa ? `${s.cor}90` : 'var(--text-muted)', transition: 'color 0.2s' }}>{s.desc}</div>
                {/* Indicador ativo */}
                {ativa && (
                  <div style={{ marginTop: 10, height: 2, borderRadius: 2, background: `linear-gradient(90deg, ${s.cor}, transparent)` }} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── CONTEÚDO DA SEÇÃO ATIVA ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 28px' }}>
        {/* Título da seção */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: secaoAtual.gradiente, border: `1px solid ${secaoAtual.cor}30`, fontSize: '1.1rem' }}>
            {secaoAtual.icon}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>{secaoAtual.label}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{secaoAtual.desc}</div>
          </div>
        </div>

        {/* Painéis */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, padding: '20px 22px' }}>
          {secaoAtiva === 'tasks' && (
            <SecaoTasks
              tasks={dia.planejamento}
              onChange={t => update({ planejamento: t })}
            />
          )}
          {secaoAtiva === 'timeline' && (
            <SecaoTimeline
              eventos={dia.timeline}
              onChange={e => update({ timeline: e })}
            />
          )}
          {secaoAtiva === 'pensamento' && (
            <SecaoPensamento
              texto={dia.pensamento}
              onChange={t => update({ pensamento: t })}
            />
          )}
        </div>
      </div>
    </div>
  )
}
