import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'

// ─── Firebase ─────────────────────────────────────────────────────────────────

// Remove undefined antes de salvar no Firestore
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T
}


// ─── Types ────────────────────────────────────────────────────────────────────
type MediaType   = 'filme' | 'serie' | 'livro'
type MediaStatus = 'andamento' | 'fila' | 'pausado' | 'concluido'

interface MediaItem {
  id: string
  tipo: MediaType
  status: MediaStatus
  titulo: string
  subtitulo?: string        // autor (livro) ou criador (série)
  ano?: string
  genero?: string
  sinopse?: string
  coverUrl?: string
  rating: number            // 0-5
  notaPessoal?: string
  // Progresso
  totalEpisodios?: number
  episodiosAssistidos?: number
  temporadaAtual?: number
  totalPaginas?: number
  paginaAtual?: number
  totalCapitulos?: number
  capituloAtual?: number
  // Datas
  dataInicio?: string
  dataConclusao?: string
  criadoEm: number
  updatedAt: number
}

function newId() { return Math.random().toString(36).slice(2, 10) }

// ─── Progresso ────────────────────────────────────────────────────────────────
function calcProgresso(item: MediaItem): number {
  if (item.tipo === 'filme') return item.status === 'concluido' ? 100 : 0
  if (item.tipo === 'serie') {
    if (!item.totalEpisodios || item.totalEpisodios === 0) return 0
    return Math.min(Math.round(((item.episodiosAssistidos || 0) / item.totalEpisodios) * 100), 100)
  }
  if (item.tipo === 'livro') {
    if (item.totalPaginas && item.totalPaginas > 0)
      return Math.min(Math.round(((item.paginaAtual || 0) / item.totalPaginas) * 100), 100)
    if (item.totalCapitulos && item.totalCapitulos > 0)
      return Math.min(Math.round(((item.capituloAtual || 0) / item.totalCapitulos) * 100), 100)
  }
  return item.status === 'concluido' ? 100 : 0
}

function progressoLabel(item: MediaItem): string {
  if (item.tipo === 'filme') return item.status === 'concluido' ? 'Assistido' : 'Não assistido'
  if (item.tipo === 'serie') return `Ep. ${item.episodiosAssistidos || 0}/${item.totalEpisodios || '?'}${item.temporadaAtual ? ` · T${item.temporadaAtual}` : ''}`
  if (item.tipo === 'livro') {
    if (item.totalPaginas) return `p. ${item.paginaAtual || 0}/${item.totalPaginas}`
    if (item.totalCapitulos) return `cap. ${item.capituloAtual || 0}/${item.totalCapitulos}`
  }
  return ''
}

// ─── Constantes visuais ───────────────────────────────────────────────────────
const TIPO_CONFIG: Record<MediaType, { label: string; icon: string; color: string }> = {
  filme: { label: 'Filme',  icon: '🎬', color: '#60a5fa' },
  serie: { label: 'Série',  icon: '📺', color: '#a78bfa' },
  livro: { label: 'Livro',  icon: '📚', color: '#34d399' },
}
const STATUS_CONFIG: Record<MediaStatus, { label: string; icon: string; color: string }> = {
  andamento: { label: 'Em Andamento', icon: '▶', color: '#fbbf24' },
  fila:      { label: 'Na Fila',      icon: '⏭', color: '#60a5fa' },
  pausado:   { label: 'Pausado',      icon: '⏸', color: '#f87171' },
  concluido: { label: 'Concluído',    icon: '✓', color: '#6ee7a0' },
}

// ─── Placeholder de capa ──────────────────────────────────────────────────────
function CoverPlaceholder({ titulo, tipo, size }: { titulo: string; tipo: MediaType; size: number }) {
  const { color, icon } = TIPO_CONFIG[tipo]
  const initials = titulo.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{ width: size, height: size * 1.5, borderRadius: 8, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, gap: 4 }}>
      <span style={{ fontSize: size * 0.25 }}>{icon}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: size * 0.14, color, textAlign: 'center', padding: '0 4px', lineHeight: 1.2 }}>{initials}</span>
    </div>
  )
}

// ─── Card de mídia ────────────────────────────────────────────────────────────
function MediaCard({ item, onClick, compact = false }: { item: MediaItem; onClick: () => void; compact?: boolean }) {
  const pct = calcProgresso(item)
  const tipo = TIPO_CONFIG[item.tipo]
  const status = STATUS_CONFIG[item.status]
  const W = compact ? 56 : 72

  return (
    <div onClick={onClick}
      style={{ display: 'flex', gap: 12, padding: compact ? '10px 12px' : '14px 16px', background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 14, cursor: 'pointer', transition: 'all 0.18s', alignItems: 'flex-start', position: 'relative', overflow: 'hidden' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = tipo.color + '60'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 6px 20px ${tipo.color}15` }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>

      {/* Barra colorida lateral */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: tipo.color, borderRadius: '3px 0 0 3px' }} />

      {/* Capa */}
      <div style={{ marginLeft: 4, flexShrink: 0 }}>
        {item.coverUrl
          ? <img src={item.coverUrl} alt={item.titulo} style={{ width: W, height: W * 1.5, objectFit: 'cover', borderRadius: 8, display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          : <CoverPlaceholder titulo={item.titulo} tipo={item.tipo} size={W} />
        }
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {/* Badges */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.6rem', padding: '2px 7px', borderRadius: 10, background: `${tipo.color}18`, color: tipo.color, fontWeight: 700, border: `1px solid ${tipo.color}30` }}>
            {tipo.icon} {tipo.label}
          </span>
          <span style={{ fontSize: '0.6rem', padding: '2px 7px', borderRadius: 10, background: `${status.color}12`, color: status.color, fontWeight: 700 }}>
            {status.icon} {status.label}
          </span>
        </div>

        {/* Título */}
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: compact ? '0.82rem' : '0.92rem', color: 'var(--text-primary)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {item.titulo}
        </div>

        {/* Subtítulo */}
        {item.subtitulo && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subtitulo}{item.ano ? ` · ${item.ano}` : ''}</div>}

        {/* Rating */}
        <div style={{ display: 'flex', gap: 2 }}>
          {[1, 2, 3, 4, 5].map(s => (
            <span key={s} style={{ fontSize: '0.72rem', color: s <= item.rating ? '#fbbf24' : 'rgba(255,255,255,0.15)', cursor: 'default' }}>★</span>
          ))}
        </div>

        {/* Progresso */}
        {item.tipo !== 'filme' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.6rem', color: 'var(--text-muted)' }}>
              <span>{progressoLabel(item)}</span>
              <span style={{ fontWeight: 700, color: pct === 100 ? '#6ee7a0' : tipo.color }}>{pct}%</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-4)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${tipo.color}, ${tipo.color}aa)`, borderRadius: 2, transition: 'width 0.5s ease', boxShadow: pct > 0 ? `0 0 6px ${tipo.color}60` : 'none' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Drawer lateral de detalhes ───────────────────────────────────────────────
function MediaDrawer({ item, uid, onClose, onSave }: { item: MediaItem; uid: string | null; onClose: () => void; onSave: (i: MediaItem) => void }) {
  const [editado, setEditado] = useState<MediaItem>(item)
  const [saving, setSaving] = useState(false)
  const pct = calcProgresso(editado)
  const tipo = TIPO_CONFIG[editado.tipo]
  const IS: React.CSSProperties = { background: 'var(--input-bg)', border: '1px solid var(--border-md)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-primary)', fontSize: '0.8rem', width: '100%', outline: 'none', boxSizing: 'border-box' }

  const save = async () => {
    if (!uid) return
    setSaving(true)
    const updated = { ...editado, updatedAt: Date.now() }
    await setDoc(doc(db, 'users', uid, 'media', updated.id), clean(updated))
    onSave(updated)
    setSaving(false)
  }

  const del = async () => {
    if (!uid) return
    await deleteDoc(doc(db, 'users', uid, 'media', item.id))
    onClose()
  }

  const upd = (p: Partial<MediaItem>) => setEditado(prev => ({ ...prev, ...p }))

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 998, backdropFilter: 'blur(3px)' }} />

      {/* Drawer */}
      <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 420, background: 'var(--card-bg)', borderLeft: `1px solid ${tipo.color}40`, zIndex: 999, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: `-8px 0 40px rgba(0,0,0,0.4)` }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-md)', background: `linear-gradient(135deg, ${tipo.color}10, transparent)`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            {editado.coverUrl
              ? <img src={editado.coverUrl} alt={editado.titulo} style={{ width: 64, height: 96, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
              : <CoverPlaceholder titulo={editado.titulo} tipo={editado.tipo} size={64} />
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                <span style={{ fontSize: '0.62rem', padding: '2px 8px', borderRadius: 10, background: `${tipo.color}18`, color: tipo.color, fontWeight: 700 }}>{tipo.icon} {tipo.label}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>{editado.titulo}</div>
              {editado.subtitulo && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>{editado.subtitulo}</div>}
              {editado.ano && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{editado.ano}{editado.genero ? ` · ${editado.genero}` : ''}</div>}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', padding: 4, flexShrink: 0 }}>✕</button>
          </div>

          {/* Progresso destaque */}
          {editado.tipo !== 'filme' && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <span>{progressoLabel(editado)}</span>
                <span style={{ fontWeight: 800, color: tipo.color, fontSize: '0.82rem' }}>{pct}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-4)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${tipo.color}, ${tipo.color}aa)`, borderRadius: 3, transition: 'width 0.5s', boxShadow: `0 0 8px ${tipo.color}60` }} />
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Status */}
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Status</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.entries(STATUS_CONFIG) as [MediaStatus, typeof STATUS_CONFIG[MediaStatus]][]).map(([k, v]) => (
                <button key={k} onClick={() => upd({ status: k, dataConclusao: k === 'concluido' ? (editado.dataConclusao || new Date(Date.now()-3*3600000).toISOString().slice(0,10)) : editado.dataConclusao })}
                  style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${editado.status === k ? v.color : 'var(--border-md)'}`, background: editado.status === k ? `${v.color}18` : 'transparent', color: editado.status === k ? v.color : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: editado.status === k ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s' }}>
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rating */}
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Avaliação</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => upd({ rating: editado.rating === s ? 0 : s })}
                  style={{ fontSize: '1.4rem', background: 'none', border: 'none', cursor: 'pointer', color: s <= editado.rating ? '#fbbf24' : 'rgba(255,255,255,0.15)', transition: 'all 0.15s', transform: s <= editado.rating ? 'scale(1.1)' : 'scale(1)' }}>★</button>
              ))}
            </div>
          </div>

          {/* Progresso — Série */}
          {editado.tipo === 'serie' && (
            <div>
              <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Progresso</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Episódios vistos', val: editado.episodiosAssistidos || 0, key: 'episodiosAssistidos' },
                  { label: 'Total episódios', val: editado.totalEpisodios || 0, key: 'totalEpisodios' },
                  { label: 'Temporada atual', val: editado.temporadaAtual || 1, key: 'temporadaAtual' },
                ].map(f => (
                  <div key={f.key}>
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginBottom: 3 }}>{f.label}</div>
                    <input type="number" min={0} style={IS} value={f.val || ''} onChange={e => upd({ [f.key]: parseInt(e.target.value) || 0 } as any)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progresso — Livro */}
          {editado.tipo === 'livro' && (
            <div>
              <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Progresso</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Página atual', val: editado.paginaAtual || 0, key: 'paginaAtual' },
                  { label: 'Total páginas', val: editado.totalPaginas || 0, key: 'totalPaginas' },
                  { label: 'Capítulo atual', val: editado.capituloAtual || 0, key: 'capituloAtual' },
                  { label: 'Total capítulos', val: editado.totalCapitulos || 0, key: 'totalCapitulos' },
                ].map(f => (
                  <div key={f.key}>
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginBottom: 3 }}>{f.label}</div>
                    <input type="number" min={0} style={IS} value={f.val || ''} onChange={e => upd({ [f.key]: parseInt(e.target.value) || 0 } as any)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Datas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Data de início', val: editado.dataInicio || '', key: 'dataInicio' },
              { label: 'Data de conclusão', val: editado.dataConclusao || '', key: 'dataConclusao' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input type="date" style={IS} value={f.val} onChange={e => upd({ [f.key]: e.target.value } as any)} />
              </div>
            ))}
          </div>

          {/* Sinopse */}
          {editado.sinopse && (
            <div>
              <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Sinopse</label>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6, padding: '10px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>{editado.sinopse}</p>
            </div>
          )}

          {/* Nota pessoal */}
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Nota Pessoal</label>
            <textarea style={{ ...IS, minHeight: 80, resize: 'vertical', lineHeight: 1.6 }} value={editado.notaPessoal || ''} onChange={e => upd({ notaPessoal: e.target.value })} placeholder="O que você achou? Pontos marcantes, citações, impressões..." />
          </div>

          {/* URL da capa */}
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>URL da Capa (manual)</label>
            <input style={IS} value={editado.coverUrl || ''} onChange={e => upd({ coverUrl: e.target.value })} placeholder="https://..." />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-md)', display: 'flex', gap: 10, justifyContent: 'space-between', flexShrink: 0 }}>
          <button onClick={del} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', color: '#f87171', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}>Excluir</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={save} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, background: `linear-gradient(135deg,${tipo.color},${tipo.color}cc)`, border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Modal Adicionar (formulário manual completo) ────────────────────────────
function ModalAdicionar({ uid, onClose }: { uid: string | null; onClose: () => void }) {
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<MediaType>('filme')
  const [status, setStatus] = useState<MediaStatus>('fila')
  const [subtitulo, setSubtitulo] = useState('')
  const [ano, setAno] = useState('')
  const [genero, setGenero] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [totalEpisodios, setTotalEpisodios] = useState('')
  const [totalPaginas, setTotalPaginas] = useState('')
  const [totalCapitulos, setTotalCapitulos] = useState('')
  const [sinopse, setSinopse] = useState('')
  const [saving, setSaving] = useState(false)
  const IS: React.CSSProperties = { background: 'var(--input-bg)', border: '1px solid var(--border-md)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-primary)', fontSize: '0.8rem', width: '100%', outline: 'none', boxSizing: 'border-box' }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const save = async () => {
    if (!uid || !titulo.trim()) return
    setSaving(true)
    const id = newId()
    const item: MediaItem = {
      id, tipo, status, titulo: titulo.trim(), rating: 0,
      subtitulo: subtitulo || undefined,
      ano: ano || undefined,
      genero: genero || undefined,
      coverUrl: coverUrl || undefined,
      sinopse: sinopse || undefined,
      totalEpisodios: totalEpisodios ? parseInt(totalEpisodios) : undefined,
      totalPaginas: totalPaginas ? parseInt(totalPaginas) : undefined,
      totalCapitulos: totalCapitulos ? parseInt(totalCapitulos) : undefined,
      episodiosAssistidos: 0,
      paginaAtual: 0,
      capituloAtual: 0,
      dataInicio: status === 'andamento' ? new Date(Date.now()-3*3600000).toISOString().slice(0,10) : undefined,
      criadoEm: Date.now(), updatedAt: Date.now(),
    }
    await setDoc(doc(db, 'users', uid, 'media', id), clean(item))
    setSaving(false)
    onClose()
  }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 18, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>Adicionar Mídia</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Tipo */}
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>Tipo</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(Object.entries(TIPO_CONFIG) as [MediaType, typeof TIPO_CONFIG[MediaType]][]).map(([k, v]) => (
                <button key={k} onClick={() => setTipo(k)}
                  style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${tipo === k ? v.color : 'var(--border-md)'}`, background: tipo === k ? `${v.color}18` : 'transparent', color: tipo === k ? v.color : 'var(--text-muted)', fontSize: '0.78rem', fontWeight: tipo === k ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Título + Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Título *</label>
              <input style={IS} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder={tipo === 'livro' ? 'Nome do livro...' : tipo === 'serie' ? 'Nome da série...' : 'Nome do filme...'} autoFocus />
            </div>
            <div>
              <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Status</label>
              <select style={{ ...IS, width: 'auto' }} value={status} onChange={e => setStatus(e.target.value as MediaStatus)}>
                {(Object.entries(STATUS_CONFIG) as [MediaStatus, any][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Subtítulo + Ano */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
                {tipo === 'livro' ? 'Autor' : tipo === 'serie' ? 'Criador / Estúdio' : 'Diretor / Elenco'}
              </label>
              <input style={IS} value={subtitulo} onChange={e => setSubtitulo(e.target.value)} placeholder="Opcional..." />
            </div>
            <div>
              <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Ano</label>
              <input style={{ ...IS, width: 80 }} value={ano} onChange={e => setAno(e.target.value)} placeholder="2024" maxLength={4} />
            </div>
          </div>

          {/* Gênero */}
          <div>
            <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Gênero</label>
            <input style={IS} value={genero} onChange={e => setGenero(e.target.value)} placeholder="Ex: Drama, Ficção Científica, Fantasia..." />
          </div>

          {/* Progresso total — Série */}
          {tipo === 'serie' && (
            <div>
              <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Total de episódios</label>
              <input type="number" min={1} style={IS} value={totalEpisodios} onChange={e => setTotalEpisodios(e.target.value)} placeholder="Ex: 24" />
            </div>
          )}

          {/* Progresso total — Livro */}
          {tipo === 'livro' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Total de páginas</label>
                <input type="number" min={1} style={IS} value={totalPaginas} onChange={e => setTotalPaginas(e.target.value)} placeholder="Ex: 400" />
              </div>
              <div>
                <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Total de capítulos</label>
                <input type="number" min={1} style={IS} value={totalCapitulos} onChange={e => setTotalCapitulos(e.target.value)} placeholder="Ex: 32" />
              </div>
            </div>
          )}

          {/* URL da capa */}
          <div>
            <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>URL da capa (opcional)</label>
            <input style={IS} value={coverUrl} onChange={e => setCoverUrl(e.target.value)} placeholder="https://..." />
            {coverUrl && <img src={coverUrl} alt="preview" style={{ marginTop: 8, height: 80, borderRadius: 6, objectFit: 'cover' }} onError={e => (e.target as HTMLImageElement).style.display = 'none'} />}
          </div>

          {/* Sinopse */}
          <div>
            <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Sinopse (opcional)</label>
            <textarea style={{ ...IS, minHeight: 60, resize: 'vertical', lineHeight: 1.5 }} value={sinopse} onChange={e => setSinopse(e.target.value)} placeholder="Breve descrição..." />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-md)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={saving || !titulo.trim()}
            style={{ padding: '8px 22px', borderRadius: 8, background: saving ? 'rgba(96,165,250,0.2)' : `linear-gradient(135deg,${TIPO_CONFIG[tipo].color},${TIPO_CONFIG[tipo].color}bb)`, border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: saving || !titulo.trim() ? 'not-allowed' : 'pointer', opacity: !titulo.trim() ? 0.5 : 1 }}>
            {saving ? 'Salvando…' : '+ Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Next Up card ─────────────────────────────────────────────────────────────
function NextUpCard({ item, onClick }: { item: MediaItem; onClick: () => void }) {
  const tipo = TIPO_CONFIG[item.tipo]
  const pct = calcProgresso(item)

  return (
    <div onClick={onClick} style={{ padding: '16px 20px', borderRadius: 16, background: `linear-gradient(135deg, ${tipo.color}12, ${tipo.color}06)`, border: `1px solid ${tipo.color}35`, cursor: 'pointer', display: 'flex', gap: 16, alignItems: 'center', transition: 'all 0.18s', position: 'relative', overflow: 'hidden' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 30px ${tipo.color}20` }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
      <div style={{ position: 'absolute', top: 8, right: 12, fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: tipo.color, fontWeight: 700, letterSpacing: '0.1em', opacity: 0.8 }}>NEXT UP ▶</div>
      {item.coverUrl
        ? <img src={item.coverUrl} alt={item.titulo} style={{ width: 60, height: 90, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
        : <CoverPlaceholder titulo={item.titulo} tipo={item.tipo} size={60} />
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
          <span style={{ fontSize: '0.6rem', padding: '2px 7px', borderRadius: 10, background: `${tipo.color}20`, color: tipo.color, fontWeight: 700 }}>{tipo.icon} {tipo.label}</span>
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 3 }}>{item.titulo}</div>
        {item.subtitulo && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>{item.subtitulo}</div>}
        {item.tipo !== 'filme' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              <span>{progressoLabel(item)}</span>
              <span style={{ fontWeight: 700, color: tipo.color }}>{pct}%</span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${tipo.color}, ${tipo.color}aa)`, borderRadius: 3, boxShadow: `0 0 8px ${tipo.color}60` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MediaTracker() {
  const uid = useUid()
  const [itens, setItens] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState<MediaType | 'todos'>('todos')
  const [filtroStatus, setFiltroStatus] = useState<MediaStatus | 'todos'>('todos')
  const [busca, setBusca] = useState('')
  const [ordenar, setOrdenar] = useState<'recente' | 'titulo' | 'rating' | 'progresso'>('recente')
  const [itemAberto, setItemAberto] = useState<MediaItem | null>(null)
  const [modalAdicionar, setModalAdicionar] = useState(false)

  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, 'users', uid, 'media'), snap => {
      setItens(snap.docs.map(d => ({ id: d.id, ...d.data() } as MediaItem)).sort((a, b) => b.criadoEm - a.criadoEm))
      setLoading(false)
    })
  }, [uid])

  const filtrados = itens
    .filter(i => filtroTipo === 'todos' || i.tipo === filtroTipo)
    .filter(i => filtroStatus === 'todos' || i.status === filtroStatus)
    .filter(i => !busca || i.titulo.toLowerCase().includes(busca.toLowerCase()) || (i.subtitulo || '').toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => {
      if (ordenar === 'titulo') return a.titulo.localeCompare(b.titulo)
      if (ordenar === 'rating') return b.rating - a.rating
      if (ordenar === 'progresso') return calcProgresso(b) - calcProgresso(a)
      return b.updatedAt - a.updatedAt
    })

  // Next Up: item em andamento com maior progresso
  const nextUp = itens.filter(i => i.status === 'andamento').sort((a, b) => calcProgresso(b) - calcProgresso(a))[0]

  // Stats
  const stats = {
    total: itens.length,
    andamento: itens.filter(i => i.status === 'andamento').length,
    concluido: itens.filter(i => i.status === 'concluido').length,
    filmes: itens.filter(i => i.tipo === 'filme').length,
    series: itens.filter(i => i.tipo === 'serie').length,
    livros: itens.filter(i => i.tipo === 'livro').length,
  }

  // Agrupar por status quando não há filtro de status
  const grupos = filtroStatus === 'todos'
    ? (['andamento', 'fila', 'pausado', 'concluido'] as MediaStatus[]).map(s => ({ status: s, itens: filtrados.filter(i => i.status === s) })).filter(g => g.itens.length > 0)
    : [{ status: filtroStatus, itens: filtrados }]

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#60a5fa', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* ── BANNER ── */}
      <div style={{ background: 'linear-gradient(135deg, rgba(96,165,250,0.1) 0%, rgba(167,139,250,0.06) 50%, transparent 100%)', borderBottom: '1px solid var(--border-md)', padding: '18px 28px 16px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(96,165,250,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', color: 'var(--text-primary)' }}>Media Tracker</h1>
            <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stats.total} mídias · {stats.andamento} em andamento</p>
          </div>
          <button onClick={() => setModalAdicionar(true)}
            style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#3b82f6,#60a5fa)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.35)' }}>
            + Adicionar Mídia
          </button>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          {[
            { icon: '🎬', label: 'Filmes',  val: stats.filmes,   color: '#60a5fa' },
            { icon: '📺', label: 'Séries',  val: stats.series,   color: '#a78bfa' },
            { icon: '📚', label: 'Livros',  val: stats.livros,   color: '#34d399' },
            { icon: '▶', label: 'Andamento', val: stats.andamento, color: '#fbbf24' },
            { icon: '✓', label: 'Concluídos', val: stats.concluido, color: '#6ee7a0' },
          ].map(k => (
            <div key={k.label} style={{ padding: '6px 14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: '0.85rem' }}>{k.icon}</span>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.val}</div>
                <div style={{ fontSize: '0.57rem', color: 'var(--text-muted)', marginTop: 1 }}>{k.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, padding: '20px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── NEXT UP ── */}
        {nextUp && filtroStatus === 'todos' && filtroTipo === 'todos' && !busca && (
          <div>
            <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Continue assistindo / lendo</div>
            <NextUpCard item={nextUp} onClick={() => setItemAberto(nextUp)} />
          </div>
        )}

        {/* ── FILTROS ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..." style={{ background: 'var(--input-bg)', border: '1px solid var(--border-md)', borderRadius: 8, padding: '7px 12px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none', flex: 1, minWidth: 160 }} />

          {/* Filtro tipo */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
            {(['todos', 'filme', 'serie', 'livro'] as const).map(t => {
              const label = t === 'todos' ? 'Todos' : TIPO_CONFIG[t].label
              const color = t === 'todos' ? 'var(--text-accent)' : TIPO_CONFIG[t].color
              return (
                <button key={t} onClick={() => setFiltroTipo(t)}
                  style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: filtroTipo === t ? 'var(--bg-hover)' : 'transparent', color: filtroTipo === t ? color : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: filtroTipo === t ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
                  {t !== 'todos' && TIPO_CONFIG[t as MediaType].icon + ' '}{label}
                </button>
              )
            })}
          </div>

          {/* Filtro status */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
            {(['todos', 'andamento', 'fila', 'pausado', 'concluido'] as const).map(s => {
              const label = s === 'todos' ? 'Todos' : STATUS_CONFIG[s].label
              const color = s === 'todos' ? 'var(--text-accent)' : STATUS_CONFIG[s].color
              return (
                <button key={s} onClick={() => setFiltroStatus(s)}
                  style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: filtroStatus === s ? 'var(--bg-hover)' : 'transparent', color: filtroStatus === s ? color : 'var(--text-muted)', fontSize: '0.7rem', fontWeight: filtroStatus === s ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
                  {s !== 'todos' && STATUS_CONFIG[s as MediaStatus].icon + ' '}{label}
                </button>
              )
            })}
          </div>

          {/* Ordenação */}
          <select value={ordenar} onChange={e => setOrdenar(e.target.value as any)} style={{ background: 'var(--input-bg)', border: '1px solid var(--border-md)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-secondary)', fontSize: '0.75rem', outline: 'none' }}>
            <option value="recente">↓ Mais recente</option>
            <option value="titulo">A–Z Título</option>
            <option value="rating">★ Avaliação</option>
            <option value="progresso">% Progresso</option>
          </select>
        </div>

        {/* ── GRUPOS POR STATUS ── */}
        {itens.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎬</div>
            <p style={{ fontSize: '0.88rem', marginBottom: 20 }}>Nenhuma mídia cadastrada ainda</p>
            <button onClick={() => setModalAdicionar(true)} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#3b82f6,#60a5fa)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
              + Adicionar primeira mídia
            </button>
          </div>
        ) : grupos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhum resultado para os filtros selecionados</div>
        ) : (
          grupos.map(grupo => (
            <div key={grupo.status}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: STATUS_CONFIG[grupo.status].color, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                  {STATUS_CONFIG[grupo.status].icon} {STATUS_CONFIG[grupo.status].label}
                </span>
                <div style={{ flex: 1, height: 1, background: `${STATUS_CONFIG[grupo.status].color}25` }} />
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{grupo.itens.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 10 }}>
                {grupo.itens.map(item => (
                  <MediaCard key={item.id} item={item} onClick={() => setItemAberto(item)} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── DRAWER ── */}
      {itemAberto && (
        <MediaDrawer
          item={itemAberto}
          uid={uid}
          onClose={() => setItemAberto(null)}
          onSave={updated => setItemAberto(updated)}
        />
      )}

      {/* ── MODAL ADICIONAR ── */}
      {modalAdicionar && <ModalAdicionar uid={uid} onClose={() => setModalAdicionar(false)} />}
    </div>
  )
}
