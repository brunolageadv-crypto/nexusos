import { useEffect, useState, useMemo, useCallback } from 'react'
import { collection, doc, setDoc, deleteDoc, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'

// ─── Types ────────────────────────────────────────────────────────────────────
export type CategoriaLog =
  | 'Trabalho'
  | 'Estudo'
  | 'Jurídico'
  | 'Concurso'
  | 'Saúde'
  | 'Exercício'
  | 'Alimentação'
  | 'Finanças'
  | 'Reunião'
  | 'Leitura'
  | 'Escrita'
  | 'Planejamento'
  | 'Pesquisa'
  | 'Viagem'
  | 'Lazer'
  | 'Família'
  | 'Compras'
  | 'Tecnologia'
  | 'Criativo'
  | 'Rotina'
  | 'Outros'

export interface LogEntry {
  id: string
  data: string        // YYYY-MM-DD
  hora: string        // HH:MM
  categoria: CategoriaLog
  titulo: string
  descricao: string
  duracao?: number    // minutos
  cancelado?: boolean
  criadoEm: number
}

// ─── Category config ──────────────────────────────────────────────────────────
export const CAT_CFG: Record<CategoriaLog, { icon: string; cor: string; bg: string }> = {
  'Trabalho':     { icon: '💼', cor: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  'Estudo':       { icon: '📚', cor: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  'Jurídico':     { icon: '⚖️', cor: '#818cf8', bg: 'rgba(129,140,248,0.1)' },
  'Concurso':     { icon: '🎯', cor: '#c084fc', bg: 'rgba(192,132,252,0.1)' },
  'Saúde':        { icon: '✚', cor: '#34d399', bg: 'rgba(52,211,153,0.1)' },
  'Exercício':    { icon: '🏋️', cor: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  'Alimentação':  { icon: '🥗', cor: '#6ee7b7', bg: 'rgba(110,231,183,0.1)' },
  'Finanças':     { icon: '◎', cor: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  'Reunião':      { icon: '🗣️', cor: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  'Leitura':      { icon: '📖', cor: '#e879f9', bg: 'rgba(232,121,249,0.1)' },
  'Escrita':      { icon: '✍️', cor: '#f472b6', bg: 'rgba(244,114,182,0.1)' },
  'Planejamento': { icon: '🗂️', cor: '#38bdf8', bg: 'rgba(56,189,248,0.1)' },
  'Pesquisa':     { icon: '🔍', cor: '#67e8f9', bg: 'rgba(103,232,249,0.1)' },
  'Viagem':       { icon: '✈️', cor: '#818cf8', bg: 'rgba(129,140,248,0.1)' },
  'Lazer':        { icon: '🎮', cor: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  'Família':      { icon: '🏠', cor: '#fb923c', bg: 'rgba(251,146,60,0.1)' },
  'Compras':      { icon: '🛒', cor: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  'Tecnologia':   { icon: '💻', cor: '#22d3ee', bg: 'rgba(34,211,238,0.1)' },
  'Criativo':     { icon: '🎨', cor: '#e879f9', bg: 'rgba(232,121,249,0.1)' },
  'Rotina':       { icon: '🔄', cor: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  'Outros':       { icon: '◈', cor: '#cbd5e1', bg: 'rgba(203,213,225,0.1)' },
}

const CATEGORIAS = Object.keys(CAT_CFG) as CategoriaLog[]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function todayISO() { return new Date().toISOString().slice(0, 10) }
function nowHHMM() { return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
function fmtData(d: string) {
  return d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)) as T
}

const IS: React.CSSProperties = {
  background: 'var(--input-bg,rgba(255,255,255,0.05))',
  border: '1px solid var(--border,rgba(255,255,255,0.1))',
  borderRadius: 9, padding: '9px 12px',
  color: 'var(--text-primary)', fontSize: '0.83rem',
  width: '100%', outline: 'none', boxSizing: 'border-box',
}
function Lbl({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.09em', display: 'block', marginBottom: 5 }}>{children}</label>
}

// ─── Modal Nova Entrada ───────────────────────────────────────────────────────
function ModalLog({ entry, onClose, onSave }: { entry: LogEntry | null; onClose: () => void; onSave: (e: LogEntry) => void }) {
  const [f, setF] = useState<Omit<LogEntry, 'id' | 'criadoEm'>>(entry ? { ...entry } : {
    data: todayISO(), hora: nowHHMM(), categoria: 'Trabalho', titulo: '', descricao: '', duracao: undefined,
  })
  const [saving, setSaving] = useState(false)
  const upd = useCallback((p: Partial<typeof f>) => setF(prev => ({ ...prev, ...p })), [])

  const save = async () => {
    if (!f.titulo.trim()) return
    setSaving(true)
    onSave({ ...f, id: entry?.id || newId(), criadoEm: entry?.criadoEm || Date.now() } as LogEntry)
    setSaving(false)
    onClose()
  }

  const cfg = CAT_CFG[f.categoria]

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-2,#1a1b26)', border: `1px solid ${cfg.cor}30`, borderRadius: 20, width: '100%', maxWidth: 560, boxShadow: `0 32px 80px rgba(0,0,0,0.6)`, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', border: `1px solid ${cfg.cor}30` }}>
              {cfg.icon}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {entry ? '✏️ Editar Registro' : '+ Novo Log'}
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1 }}>Registro de atividade diária</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', maxHeight: '70vh' }}>
          {/* Data e Hora */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: 'span 1' }}>
              <Lbl>Data</Lbl>
              <input type="date" style={IS} value={f.data} onChange={e => upd({ data: e.target.value })} />
            </div>
            <div>
              <Lbl>Hora</Lbl>
              <input type="time" style={IS} value={f.hora} onChange={e => upd({ hora: e.target.value })} />
            </div>
            <div>
              <Lbl>Duração (min)</Lbl>
              <input type="number" style={IS} value={f.duracao || ''} onChange={e => upd({ duracao: e.target.value ? Number(e.target.value) : undefined })} placeholder="Ex: 60" min={1} />
            </div>
          </div>

          {/* Categoria */}
          <div>
            <Lbl>Categoria</Lbl>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CATEGORIAS.map(cat => {
                const c = CAT_CFG[cat]
                const sel = f.categoria === cat
                return (
                  <button key={cat} onClick={() => upd({ categoria: cat })}
                    style={{ padding: '5px 11px', borderRadius: 20, border: `1px solid ${sel ? c.cor + '80' : 'rgba(255,255,255,0.1)'}`, background: sel ? c.bg : 'rgba(255,255,255,0.03)', color: sel ? c.cor : 'var(--text-muted)', fontSize: '0.7rem', fontWeight: sel ? 700 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{c.icon}</span> {cat}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Título */}
          <div>
            <Lbl>O que fiz *</Lbl>
            <input style={IS} value={f.titulo} onChange={e => upd({ titulo: e.target.value })} placeholder="Ex: Estudei CF/88 Art. 5° ao 17, Reunião com equipe, Revisão de processo..." autoFocus />
          </div>

          {/* Descrição */}
          <div>
            <Lbl>Detalhes / Observações</Lbl>
            <textarea style={{ ...IS, minHeight: 80, resize: 'vertical', lineHeight: 1.65 }}
              value={f.descricao} onChange={e => upd({ descricao: e.target.value })}
              placeholder="Detalhes adicionais, resultados, próximos passos..." />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'none', color: 'var(--text-secondary)', fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={saving || !f.titulo.trim()}
            style={{ padding: '9px 24px', borderRadius: 10, border: 'none', background: saving || !f.titulo.trim() ? 'rgba(96,165,250,0.2)' : `linear-gradient(135deg,${cfg.cor},${cfg.cor}aa)`, color: '#fff', fontWeight: 800, fontSize: '0.84rem', cursor: saving || !f.titulo.trim() ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Salvando…' : entry ? '✅ Atualizar' : '+ Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Linha de Log (pauta) ─────────────────────────────────────────────────────
function LinhaLog({ entry, onEdit, onDelete, onToggleCancel }: { entry: LogEntry; onEdit: () => void; onDelete: () => void; onToggleCancel: () => void }) {
  const cfg = CAT_CFG[entry.categoria]
  const [hover, setHover] = useState(false)
  const cancelado = !!entry.cancelado

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'grid', gridTemplateColumns: '80px 28px 1fr auto', gap: 0, alignItems: 'stretch', minHeight: 54, position: 'relative', transition: 'background 0.15s', background: hover ? (cancelado ? 'rgba(248,113,113,0.04)' : 'rgba(255,255,255,0.025)') : 'transparent', borderRadius: 4, opacity: cancelado ? 0.55 : 1 }}>

      {/* Hora */}
      <div style={{ padding: '14px 12px 14px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', borderRight: `2px solid rgba(255,255,255,0.06)` }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', userSelect: 'none' }}>{entry.hora}</span>
      </div>

      {/* Indicador vertical colorido */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
        <div style={{ width: 1, flex: 1, background: `linear-gradient(to bottom, ${cancelado ? '#f87171' : cfg.cor}40, ${cancelado ? '#f87171' : cfg.cor}10)` }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: cancelado ? '#f87171' : cfg.cor, border: `2px solid var(--bg-1,#13141f)`, boxShadow: `0 0 8px ${cancelado ? '#f8717150' : cfg.cor + '50'}`, zIndex: 1, flexShrink: 0, margin: '4px 0' }} />
        <div style={{ width: 1, flex: 1, background: `linear-gradient(to bottom, ${cancelado ? '#f87171' : cfg.cor}10, transparent)` }} />
      </div>

      {/* Conteúdo */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 20, background: cancelado ? 'rgba(248,113,113,0.1)' : cfg.bg, color: cancelado ? '#f87171' : cfg.cor, border: `1px solid ${cancelado ? 'rgba(248,113,113,0.3)' : cfg.cor + '30'}`, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            {cancelado ? '🚫' : cfg.icon} {entry.categoria}
          </span>
          {cancelado && <span style={{ fontSize: '0.62rem', color: '#f87171', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.06em' }}>CANCELADO</span>}
          {entry.duracao && !cancelado && (
            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>⏱ {entry.duracao < 60 ? `${entry.duracao}min` : `${Math.floor(entry.duracao / 60)}h${entry.duracao % 60 > 0 ? (entry.duracao % 60) + 'min' : ''}`}</span>
          )}
        </div>
        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: cancelado ? 'var(--text-muted)' : 'var(--text-primary)', lineHeight: 1.3, textDecoration: cancelado ? 'line-through' : 'none' }}>{entry.titulo}</div>
        {entry.descricao && !cancelado && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{entry.descricao}</div>
        )}
      </div>

      {/* Ações */}
      <div style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', justifyContent: 'center', opacity: hover ? 1 : 0, transition: 'opacity 0.15s' }}>
        {!cancelado && (
          <button onClick={onEdit} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', color: '#93c5fd', fontSize: '0.65rem', cursor: 'pointer' }}>✏️</button>
        )}
        <button onClick={onToggleCancel}
          style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${cancelado ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`, background: cancelado ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.06)', color: cancelado ? '#6ee7b7' : '#f87171', fontSize: '0.65rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {cancelado ? '↩ Restaurar' : '🚫 Cancelar'}
        </button>
        <button onClick={() => { if (window.confirm('Excluir permanentemente?')) onDelete() }}
          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(100,100,100,0.3)', background: 'rgba(100,100,100,0.06)', color: 'var(--text-muted)', fontSize: '0.6rem', cursor: 'pointer' }}>🗑</button>
      </div>
    </div>
  )
}

// ─── Separador de dia ─────────────────────────────────────────────────────────
function SeparadorDia({ data, count }: { data: string; count: number }) {
  const isHoje = data === todayISO()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 4px', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-1,#13141f)', padding: '4px 0' }}>
      <div style={{ padding: '4px 14px', borderRadius: 20, background: isHoje ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isHoje ? 'rgba(96,165,250,0.35)' : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        {isHoje && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', boxShadow: '0 0 6px #60a5fa' }} />}
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.7rem', color: isHoje ? '#60a5fa' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {isHoje ? 'Hoje · ' : ''}{fmtData(data)}
        </span>
      </div>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{count} reg.</span>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function Logs() {
  const uid = useUid()
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<LogEntry | null>(null)
  const [filtroCat, setFiltroCat] = useState<CategoriaLog | 'Todas'>('Todas')
  const [filtroData, setFiltroData] = useState('')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (!uid) return
    return onSnapshot(query(collection(db, 'users', uid, 'logs'), orderBy('data', 'desc')), snap => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as LogEntry)))
      setLoading(false)
    })
  }, [uid])

  const saveEntry = useCallback(async (e: LogEntry) => {
    if (!uid) return
    await setDoc(doc(db, 'users', uid, 'logs', e.id), clean(e))
  }, [uid])

  const delEntry = useCallback(async (id: string) => {
    if (!uid) return
    await deleteDoc(doc(db, 'users', uid, 'logs', id))
  }, [uid])

  const toggleCancel = useCallback(async (entry: LogEntry) => {
    if (!uid) return
    await setDoc(doc(db, 'users', uid, 'logs', entry.id), clean({ ...entry, cancelado: !entry.cancelado }))
  }, [uid])

  // Filtros
  const filtradas = useMemo(() => entries.filter(e => {
    if (filtroCat !== 'Todas' && e.categoria !== filtroCat) return false
    if (filtroData && e.data !== filtroData) return false
    if (busca) {
      const q = busca.toLowerCase()
      if (!e.titulo.toLowerCase().includes(q) && !(e.descricao || '').toLowerCase().includes(q)) return false
    }
    return true
  }), [entries, filtroCat, filtroData, busca])

  // Agrupar por data
  const porData = useMemo(() => {
    const grupos: Record<string, LogEntry[]> = {}
    const sorted = [...filtradas].sort((a, b) => {
      const dateCompare = b.data.localeCompare(a.data)
      if (dateCompare !== 0) return dateCompare
      return b.hora.localeCompare(a.hora)
    })
    sorted.forEach(e => {
      if (!grupos[e.data]) grupos[e.data] = []
      grupos[e.data].push(e)
    })
    return grupos
  }, [filtradas])

  const datasOrdenadas = Object.keys(porData).sort((a, b) => b.localeCompare(a))

  // Stats
  const hoje = todayISO()
  const regHoje = entries.filter(e => e.data === hoje)
  const minHoje = regHoje.reduce((a, e) => a + (e.duracao || 0), 0)
  const catMaisUsada = useMemo(() => {
    const counts: Record<string, number> = {}
    entries.filter(e => e.data.startsWith(hoje.slice(0, 7))).forEach(e => { counts[e.categoria] = (counts[e.categoria] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as CategoriaLog | undefined
  }, [entries, hoje])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#60a5fa', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* ── Header ── */}
      <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid rgba(96,165,250,0.15)', background: 'linear-gradient(135deg,rgba(96,165,250,0.05),transparent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.5rem', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>📋 Logs Diários</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{entries.length} registro(s) · {regHoje.length} hoje</p>
          </div>
          <button onClick={() => { setEditando(null); setModalOpen(true) }}
            style={{ padding: '10px 22px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#1A73E8,#a78bfa)', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 4px 16px rgba(26,115,232,0.35)', whiteSpace: 'nowrap' }}>
            + Registrar
          </button>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
          {[
            { l: 'Registros hoje', v: regHoje.length, c: '#60a5fa', e: '📝' },
            { l: 'Tempo hoje', v: minHoje > 0 ? `${Math.floor(minHoje / 60)}h${minHoje % 60 > 0 ? (minHoje % 60) + 'min' : ''}` : '—', c: '#34d399', e: '⏱' },
            { l: 'Total este mês', v: entries.filter(e => e.data.startsWith(hoje.slice(0, 7))).length, c: '#a78bfa', e: '📊' },
            { l: 'Cat. mais ativa', v: catMaisUsada ? `${CAT_CFG[catMaisUsada].icon} ${catMaisUsada}` : '—', c: catMaisUsada ? CAT_CFG[catMaisUsada].cor : '#94a3b8', e: '🏷' },
          ].map(k => (
            <div key={k.l} style={{ padding: '11px 14px', borderRadius: 12, background: 'var(--card-bg,rgba(255,255,255,0.03))', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.85rem', marginBottom: 2 }}>{k.e}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: k.c, lineHeight: 1 }}>{k.v}</div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{k.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filtros ── */}
      <div style={{ padding: '14px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Busca */}
        <div style={{ position: 'relative', minWidth: 200, flex: 1 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.8rem', pointerEvents: 'none' }}>🔍</span>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar registros…"
            style={{ ...IS, paddingLeft: 30, maxWidth: 280 }} />
        </div>

        {/* Filtro data */}
        <input type="date" value={filtroData} onChange={e => setFiltroData(e.target.value)}
          style={{ ...IS, width: 160 }} />

        {filtroData && (
          <button onClick={() => setFiltroData('')}
            style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.06)', color: '#f87171', fontSize: '0.72rem', cursor: 'pointer' }}>
            ✕ Limpar data
          </button>
        )}

        {/* Filtros de categoria */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: '1 0 100%', marginTop: 4 }}>
          <button onClick={() => setFiltroCat('Todas')}
            style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${filtroCat === 'Todas' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'}`, background: filtroCat === 'Todas' ? 'rgba(255,255,255,0.08)' : 'transparent', color: filtroCat === 'Todas' ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '0.7rem', fontWeight: filtroCat === 'Todas' ? 700 : 400, cursor: 'pointer' }}>
            Todas
          </button>
          {CATEGORIAS.map(cat => {
            const c = CAT_CFG[cat]
            const sel = filtroCat === cat
            const cnt = entries.filter(e => e.categoria === cat).length
            if (cnt === 0) return null
            return (
              <button key={cat} onClick={() => setFiltroCat(sel ? 'Todas' : cat)}
                style={{ padding: '5px 11px', borderRadius: 20, border: `1px solid ${sel ? c.cor + '60' : 'rgba(255,255,255,0.08)'}`, background: sel ? c.bg : 'transparent', color: sel ? c.cor : 'var(--text-muted)', fontSize: '0.68rem', fontWeight: sel ? 700 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                {c.icon} {cat} <span style={{ opacity: 0.6, fontSize: '0.6rem' }}>({cnt})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Timeline ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 28px 40px' }}>
        {datasOrdenadas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {busca || filtroCat !== 'Todas' || filtroData ? 'Nenhum registro encontrado' : 'Nenhum registro ainda'}
            </div>
            {!busca && filtroCat === 'Todas' && !filtroData && (
              <div style={{ fontSize: '0.75rem', marginTop: 8 }}>
                Clique em <strong>+ Registrar</strong> para começar a documentar seu dia
              </div>
            )}
          </div>
        ) : (
          datasOrdenadas.map(data => (
            <div key={data}>
              <SeparadorDia data={data} count={porData[data].length} />
              <div style={{ borderLeft: '2px solid rgba(255,255,255,0.06)', marginLeft: 79 }}>
                {porData[data].map(entry => (
                  <LinhaLog
                    key={entry.id}
                    entry={entry}
                    onEdit={() => { setEditando(entry); setModalOpen(true) }}
                    onDelete={() => delEntry(entry.id)}
                    onToggleCancel={() => toggleCancel(entry)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Modal ── */}
      {modalOpen && (
        <ModalLog
          entry={editando}
          onClose={() => { setModalOpen(false); setEditando(null) }}
          onSave={saveEntry}
        />
      )}
    </div>
  )
}
