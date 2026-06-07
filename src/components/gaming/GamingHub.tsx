import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, setDoc, deleteDoc, getFirestore } from 'firebase/firestore'
import { getApp } from 'firebase/app'
import { useUid } from '../../hooks/useUid'

function getDB() { return getFirestore(getApp() as any) }

// ─── Types ────────────────────────────────────────────────────────────────────

// Remove undefined antes de salvar no Firestore
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T
}

type GameStatus = 'jogando' | 'backlog' | 'concluido' | 'pausado'

interface Game {
  id: string
  titulo: string
  plataforma: string
  status: GameStatus
  progresso: number        // 0-100
  coverUrl?: string
  dataInicio?: string
  dataFim?: string
  nota?: number            // 1-5
  notaPessoal?: string
  criadoEm: number
  updatedAt: number
}

function newId() { return Math.random().toString(36).slice(2, 10) }

// ─── Constantes ───────────────────────────────────────────────────────────────
const PLATAFORMAS = ['Steam', 'PlayStation', 'Xbox', 'Nintendo Switch', 'PC', 'Mobile', 'Game Pass', 'Epic Games', 'Outro']

const STATUS_CONFIG: Record<GameStatus, { label: string; icon: string; color: string }> = {
  jogando:  { label: 'Jogando',  icon: '🎮', color: '#6ee7a0' },
  backlog:  { label: 'Backlog',  icon: '⏭',  color: '#60a5fa' },
  concluido:{ label: 'Concluído',icon: '🏆', color: '#fbbf24' },
  pausado:  { label: 'Pausado',  icon: '⏸',  color: '#f87171' },
}

const PLAT_COLORS: Record<string, string> = {
  'Steam': '#1b2838',
  'PlayStation': '#003791',
  'Xbox': '#107c10',
  'Nintendo Switch': '#e4000f',
  'PC': '#2d2d2d',
  'Mobile': '#a855f7',
  'Game Pass': '#107c10',
  'Epic Games': '#2d2d2d',
  'Outro': '#4b5563',
}

// ─── Estilos base ─────────────────────────────────────────────────────────────
const IS: React.CSSProperties = {
  background: 'var(--input-bg)', border: '1px solid var(--border-md)',
  borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)',
  fontSize: '0.82rem', width: '100%', outline: 'none', boxSizing: 'border-box',
}

// ─── Cover Placeholder ────────────────────────────────────────────────────────
function GameCover({ game, size = 80 }: { game: Game; size: number }) {
  const platColor = PLAT_COLORS[game.plataforma] || '#4b5563'
  const initials = game.titulo.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()
  if (game.coverUrl) {
    return <img src={game.coverUrl} alt={game.titulo}
      style={{ width: size, height: size * 1.35, objectFit: 'cover', borderRadius: 8, display: 'block', flexShrink: 0 }}
      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
  }
  return (
    <div style={{ width: size, height: size * 1.35, borderRadius: 8, background: `${platColor}cc`, border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, gap: 4 }}>
      <span style={{ fontSize: size * 0.22 }}>🎮</span>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: size * 0.13, color: 'rgba(255,255,255,0.9)', textAlign: 'center', padding: '0 4px', lineHeight: 1.2 }}>{initials}</span>
    </div>
  )
}

// ─── Barra de progresso ───────────────────────────────────────────────────────
function ProgressBar({ pct, color, height = 5 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ height, borderRadius: height, background: 'var(--bg-4)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}aa)`, borderRadius: height, transition: 'width 0.5s ease', boxShadow: pct > 0 ? `0 0 6px ${color}60` : 'none' }} />
    </div>
  )
}

// ─── Modal rápido de progresso ────────────────────────────────────────────────
function ModalProgresso({ game, uid, onClose, onSave }: { game: Game; uid: string | null; onClose: () => void; onSave: (g: Game) => void }) {
  const [pct, setPct] = useState(game.progresso)
  const [status, setStatus] = useState<GameStatus>(game.status)
  const [saving, setSaving] = useState(false)
  const cor = STATUS_CONFIG[status].color

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  // Auto-completar ao chegar em 100%
  useEffect(() => {
    if (pct === 100 && status === 'jogando') setStatus('concluido')
  }, [pct, status])

  const save = async () => {
    if (!uid) return
    setSaving(true)
    const updated: Game = {
      ...game, progresso: pct, status,
      dataFim: status === 'concluido' && !game.dataFim ? new Date().toISOString().slice(0, 10) : game.dataFim,
      updatedAt: Date.now(),
    }
    const db = getDB()
    await setDoc(doc(db, 'users', uid, 'games', game.id), clean(updated))
    onSave(updated)
    setSaving(false)
    onClose()
  }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--card-bg)', border: `1px solid ${cor}40`, borderRadius: 18, width: '100%', maxWidth: 400, padding: '24px', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <GameCover game={game} size={52} />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{game.titulo}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{game.plataforma}</div>
          </div>
        </div>

        {/* Slider de progresso */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Progresso</label>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: cor }}>{pct}%</span>
          </div>
          <input type="range" min={0} max={100} value={pct} onChange={e => setPct(parseInt(e.target.value))}
            style={{ width: '100%', accentColor: cor, cursor: 'pointer' }} />
          <ProgressBar pct={pct} color={cor} height={8} />
          {/* Atalhos rápidos */}
          <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
            {[25, 50, 75, 100].map(v => (
              <button key={v} onClick={() => setPct(v)}
                style={{ padding: '3px 10px', borderRadius: 8, border: `1px solid ${pct === v ? cor : 'var(--border-md)'}`, background: pct === v ? `${cor}18` : 'transparent', color: pct === v ? cor : 'var(--text-muted)', fontSize: '0.7rem', fontWeight: pct === v ? 700 : 400, cursor: 'pointer' }}>
                {v}%
              </button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>Status</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {(Object.entries(STATUS_CONFIG) as [GameStatus, any][]).map(([k, v]) => (
              <button key={k} onClick={() => setStatus(k)}
                style={{ padding: '7px', borderRadius: 8, border: `1px solid ${status === k ? v.color : 'var(--border-md)'}`, background: status === k ? `${v.color}15` : 'transparent', color: status === k ? v.color : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: status === k ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s' }}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
        </div>

        {pct === 100 && status === 'concluido' && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', fontSize: '0.78rem', color: '#fbbf24', marginBottom: 16, textAlign: 'center' }}>
            🏆 Jogo concluído! Data de conclusão registrada.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={saving}
            style={{ padding: '8px 20px', borderRadius: 8, background: `linear-gradient(135deg, ${cor}, ${cor}cc)`, border: 'none', color: '#0a0f1a', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal cadastro/edição completo ──────────────────────────────────────────
function ModalGame({ game, uid, onClose }: { game: Game | null; uid: string | null; onClose: () => void }) {
  const isEdit = !!game
  const [titulo, setTitulo] = useState(game?.titulo || '')
  const [plataforma, setPlataforma] = useState(game?.plataforma || 'Steam')
  const [status, setStatus] = useState<GameStatus>(game?.status || 'backlog')
  const [progresso, setProgresso] = useState(game?.progresso || 0)
  const [coverUrl, setCoverUrl] = useState(game?.coverUrl || '')
  const [dataInicio, setDataInicio] = useState(game?.dataInicio || '')
  const [dataFim, setDataFim] = useState(game?.dataFim || '')
  const [nota, setNota] = useState(game?.nota || 0)
  const [notaPessoal, setNotaPessoal] = useState(game?.notaPessoal || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const save = async () => {
    if (!uid || !titulo.trim()) return
    setSaving(true)
    const db = getDB()
    const id = isEdit ? game!.id : newId()
    const item: Game = {
      id, titulo: titulo.trim(), plataforma, status, progresso,
      coverUrl: coverUrl || undefined,
      dataInicio: dataInicio || undefined,
      dataFim: status === 'concluido' ? (dataFim || new Date().toISOString().slice(0, 10)) : (dataFim || undefined),
      nota: nota || undefined,
      notaPessoal: notaPessoal || undefined,
      criadoEm: game?.criadoEm || Date.now(),
      updatedAt: Date.now(),
    }
    await setDoc(doc(db, 'users', uid, 'games', id), clean(item))
    setSaving(false)
    onClose()
  }

  const del = async () => {
    if (!uid || !game) return
    const db = getDB()
    await deleteDoc(doc(db, 'users', uid, 'games', game.id))
    onClose()
  }

  const cor = STATUS_CONFIG[status].color

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 18, width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>{isEdit ? 'Editar Jogo' : 'Adicionar Jogo'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Título *</label>
              <input style={IS} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Nome do jogo..." autoFocus />
            </div>
            <div>
              <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Plataforma</label>
              <select style={{ ...IS, width: 'auto' }} value={plataforma} onChange={e => setPlataforma(e.target.value)}>
                {PLATAFORMAS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Status */}
          <div>
            <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Status</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.entries(STATUS_CONFIG) as [GameStatus, any][]).map(([k, v]) => (
                <button key={k} onClick={() => setStatus(k)}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: `1px solid ${status === k ? v.color : 'var(--border-md)'}`, background: status === k ? `${v.color}15` : 'transparent', color: status === k ? v.color : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: status === k ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Progresso */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Progresso</label>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: cor }}>{progresso}%</span>
            </div>
            <input type="range" min={0} max={100} value={progresso} onChange={e => setProgresso(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: cor, marginBottom: 6, cursor: 'pointer' }} />
            <ProgressBar pct={progresso} color={cor} height={6} />
          </div>

          {/* Datas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Data de início</label>
              <input type="date" style={IS} value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Data de conclusão</label>
              <input type="date" style={IS} value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
          </div>

          {/* Avaliação */}
          <div>
            <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Avaliação</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1,2,3,4,5].map(s => (
                <button key={s} onClick={() => setNota(nota === s ? 0 : s)}
                  style={{ fontSize: '1.4rem', background: 'none', border: 'none', cursor: 'pointer', color: s <= nota ? '#fbbf24' : 'rgba(255,255,255,0.15)', transition: 'all 0.15s', transform: s <= nota ? 'scale(1.1)' : 'scale(1)' }}>★</button>
              ))}
            </div>
          </div>

          {/* Cover URL */}
          <div>
            <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>URL da capa (opcional)</label>
            <input style={IS} value={coverUrl} onChange={e => setCoverUrl(e.target.value)} placeholder="https://..." />
          </div>

          {/* Nota pessoal */}
          <div>
            <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Nota pessoal</label>
            <textarea style={{ ...IS, minHeight: 64, resize: 'vertical', lineHeight: 1.5 }} value={notaPessoal} onChange={e => setNotaPessoal(e.target.value)} placeholder="Impressões, momentos marcantes, recomendaria?" />
          </div>
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-md)', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>{isEdit && <button onClick={del} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', color: '#f87171', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}>Excluir</button>}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={save} disabled={saving || !titulo.trim()}
              style={{ padding: '8px 20px', borderRadius: 8, background: saving ? 'rgba(110,231,160,0.2)' : 'linear-gradient(135deg,#059669,#6ee7a0)', border: 'none', color: '#0a0f1a', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', opacity: !titulo.trim() ? 0.5 : 1 }}>
              {saving ? 'Salvando…' : isEdit ? 'Salvar' : '+ Adicionar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Game Card ────────────────────────────────────────────────────────────────
function GameCard({ game, onEdit, onProgress }: { game: Game; onEdit: () => void; onProgress: () => void }) {
  const st = STATUS_CONFIG[game.status]
  const platColor = PLAT_COLORS[game.plataforma] || '#4b5563'

  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 14, overflow: 'hidden', transition: 'all 0.18s', display: 'flex', flexDirection: 'column' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = st.color + '50'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 24px ${st.color}15` }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>

      {/* Capa */}
      <div style={{ position: 'relative', aspectRatio: '4/3', overflow: 'hidden', background: `${platColor}66` }}>
        {game.coverUrl
          ? <img src={game.coverUrl} alt={game.titulo} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ fontSize: '2.5rem' }}>🎮</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', textAlign: 'center', padding: '0 8px' }}>{game.titulo}</span>
            </div>
        }
        {/* Overlay status */}
        <div style={{ position: 'absolute', top: 8, left: 8 }}>
          <span style={{ fontSize: '0.6rem', padding: '3px 8px', borderRadius: 10, background: `${st.color}dd`, color: '#0a0f1a', fontWeight: 800, backdropFilter: 'blur(4px)' }}>
            {st.icon} {st.label}
          </span>
        </div>
        {/* Plataforma */}
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          <span style={{ fontSize: '0.58rem', padding: '3px 7px', borderRadius: 8, background: 'rgba(0,0,0,0.7)', color: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(4px)', fontFamily: 'var(--font-mono)' }}>
            {game.plataforma}
          </span>
        </div>
        {/* Progresso overlay na base */}
        {game.status !== 'backlog' && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 10px 6px', background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.6rem', color: 'rgba(255,255,255,0.7)' }}>
              <span>Progresso</span>
              <span style={{ fontWeight: 700, color: st.color }}>{game.progresso}%</span>
            </div>
            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${game.progresso}%`, background: st.color, borderRadius: 2, boxShadow: `0 0 6px ${st.color}` }} />
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{game.titulo}</div>
          {game.nota ? <div style={{ fontSize: '0.7rem', color: '#fbbf24', marginTop: 2 }}>{'★'.repeat(game.nota)}{'☆'.repeat(5 - game.nota)}</div> : null}
        </div>
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          {game.status !== 'concluido' && (
            <button onClick={onProgress}
              title="Atualizar progresso"
              style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${st.color}40`, background: `${st.color}10`, color: st.color, cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = `${st.color}25`}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = `${st.color}10`}>
              ✎
            </button>
          )}
          <button onClick={onEdit}
            style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
            ⋯
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Currently Playing destaque ───────────────────────────────────────────────
function CurrentlyPlaying({ games, onProgress, onEdit }: { games: Game[]; onProgress: (g: Game) => void; onEdit: (g: Game) => void }) {
  if (games.length === 0) return null

  return (
    <div>
      <div style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: '#6ee7a0', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>🎮 Jogando agora</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
        {games.map(g => <GameCard key={g.id} game={g} onEdit={() => onEdit(g)} onProgress={() => onProgress(g)} />)}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function GamingHub() {
  const uid = useUid()
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'jogando' | 'backlog' | 'historico'>('jogando')
  const [modalAdd, setModalAdd] = useState(false)
  const [editando, setEditando] = useState<Game | null>(null)
  const [progressGame, setProgressGame] = useState<Game | null>(null)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (!uid) return
    const db = getDB()
    return onSnapshot(collection(db, 'users', uid, 'games'), snap => {
      setGames(snap.docs.map(d => ({ id: d.id, ...d.data() } as Game)).sort((a, b) => b.updatedAt - a.updatedAt))
      setLoading(false)
    })
  }, [uid])

  const jogando  = games.filter(g => g.status === 'jogando')
  const backlog  = games.filter(g => g.status === 'backlog' || g.status === 'pausado')
  const historico= games.filter(g => g.status === 'concluido')

  const filtrar = (list: Game[]) => busca ? list.filter(g => g.titulo.toLowerCase().includes(busca.toLowerCase()) || g.plataforma.toLowerCase().includes(busca.toLowerCase())) : list

  const stats = {
    total: games.length,
    jogando: jogando.length,
    concluido: historico.length,
    backlog: backlog.length,
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#6ee7a0', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* ── BANNER ── */}
      <div style={{ background: 'linear-gradient(135deg, rgba(110,231,160,0.1) 0%, rgba(124,58,237,0.06) 50%, transparent 100%)', borderBottom: '1px solid var(--border-md)', padding: '18px 28px 16px', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(110,231,160,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', color: 'var(--text-primary)' }}>Gaming Hub</h1>
            <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stats.total} jogos · {stats.jogando} em andamento</p>
          </div>
          <button onClick={() => setModalAdd(true)}
            style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#059669,#6ee7a0)', color: '#0a0f1a', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(110,231,160,0.3)' }}>
            + Adicionar Jogo
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          {[
            { icon: '🎮', label: 'Jogando',   val: stats.jogando,   color: '#6ee7a0' },
            { icon: '⏭',  label: 'Backlog',   val: stats.backlog,   color: '#60a5fa' },
            { icon: '🏆', label: 'Concluídos', val: stats.concluido, color: '#fbbf24' },
            { icon: '📚', label: 'Total',      val: stats.total,     color: 'var(--text-secondary)' },
          ].map(k => (
            <div key={k.label} style={{ padding: '6px 14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span>{k.icon}</span>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: k.color as string, lineHeight: 1 }}>{k.val}</div>
                <div style={{ fontSize: '0.57rem', color: 'var(--text-muted)', marginTop: 1 }}>{k.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── ABAS ── */}
      <div style={{ borderBottom: '1px solid var(--border-md)', padding: '0 28px', display: 'flex', gap: 0 }}>
        {[
          { id: 'jogando',  label: `🎮 Jogando (${jogando.length})` },
          { id: 'backlog',  label: `⏭ Backlog (${backlog.length})` },
          { id: 'historico',label: `🏆 Histórico (${historico.length})` },
        ].map(a => (
          <button key={a.id} onClick={() => setAba(a.id as any)}
            style={{ padding: '11px 18px', border: 'none', background: 'transparent', color: aba === a.id ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: aba === a.id ? 700 : 500, fontSize: '0.82rem', cursor: 'pointer', borderBottom: aba === a.id ? '2px solid #6ee7a0' : '2px solid transparent', marginBottom: -1, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            {a.label}
          </button>
        ))}
      </div>

      {/* ── CONTEÚDO ── */}
      <div style={{ flex: 1, padding: '20px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Busca */}
        {(aba === 'backlog' || aba === 'historico') && (
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar jogo ou plataforma..."
            style={{ background: 'var(--input-bg)', border: '1px solid var(--border-md)', borderRadius: 8, padding: '8px 14px', color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none', maxWidth: 360 }} />
        )}

        {/* Aba Jogando */}
        {aba === 'jogando' && (
          jogando.length === 0
            ? <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎮</div>
                <p style={{ fontSize: '0.88rem', marginBottom: 20 }}>Nenhum jogo em andamento</p>
                <button onClick={() => setModalAdd(true)} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#059669,#6ee7a0)', color: '#0a0f1a', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                  + Adicionar Jogo
                </button>
              </div>
            : <CurrentlyPlaying games={jogando} onProgress={setProgressGame} onEdit={setEditando} />
        )}

        {/* Aba Backlog */}
        {aba === 'backlog' && (
          <div>
            {filtrar(backlog).length === 0
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Backlog vazio{busca ? ' para essa busca' : ''}</div>
              : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 12 }}>
                  {filtrar(backlog).map(g => <GameCard key={g.id} game={g} onEdit={() => setEditando(g)} onProgress={() => setProgressGame(g)} />)}
                </div>
            }
          </div>
        )}

        {/* Aba Histórico */}
        {aba === 'historico' && (
          <div>
            {/* Agrupar por ano */}
            {filtrar(historico).length === 0
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhum jogo concluído{busca ? ' para essa busca' : ''}</div>
              : (() => {
                  const porAno: Record<string, Game[]> = {}
                  filtrar(historico).forEach(g => {
                    const ano = g.dataFim?.slice(0, 4) || 'Sem data'
                    if (!porAno[ano]) porAno[ano] = []
                    porAno[ano].push(g)
                  })
                  return Object.entries(porAno).sort(([a], [b]) => b.localeCompare(a)).map(([ano, lista]) => (
                    <div key={ano} style={{ marginBottom: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: '#fbbf24' }}>🏆 {ano}</span>
                        <div style={{ flex: 1, height: 1, background: 'rgba(251,191,36,0.2)' }} />
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{lista.length} jogo{lista.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 10 }}>
                        {lista.map(g => <GameCard key={g.id} game={g} onEdit={() => setEditando(g)} onProgress={() => {}} />)}
                      </div>
                    </div>
                  ))
                })()
            }
          </div>
        )}
      </div>

      {/* ── MODAIS ── */}
      {(modalAdd || editando) && (
        <ModalGame game={editando} uid={uid} onClose={() => { setModalAdd(false); setEditando(null) }} />
      )}
      {progressGame && (
        <ModalProgresso game={progressGame} uid={uid} onClose={() => setProgressGame(null)} onSave={updated => {
          setGames(prev => prev.map(g => g.id === updated.id ? updated : g))
          setProgressGame(null)
        }} />
      )}
    </div>
  )
}
