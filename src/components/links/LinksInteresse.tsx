import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore'
import { getFirestore } from 'firebase/firestore'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { getApp } from 'firebase/app'

function getDB() { return getFirestore(getApp() as any) }
function useUid() {
  const [uid, setUid] = useState<string | null>(null)
  useEffect(() => {
    return onAuthStateChanged(getAuth(getApp() as any), u => setUid(u?.uid ?? null))
  }, [])
  return uid
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Categoria = 'profissional' | 'pessoal' | 'sistemas' | 'interesse' | 'educacional' | 'diversos'

interface Link {
  id: string
  titulo: string
  url: string
  descricao?: string
  categoria: Categoria
  criadoEm: number
}

function newId() { return Math.random().toString(36).slice(2, 10) }
function fmtData(ts: number) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function dominio(url: string) {
  try { return new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace('www.', '') } catch { return url }
}

// ─── Config categorias ────────────────────────────────────────────────────────
const CAT_CONFIG: Record<Categoria, { label: string; icon: string; color: string }> = {
  profissional: { label: 'Profissional', icon: '💼', color: '#60a5fa' },
  pessoal:      { label: 'Pessoal',      icon: '🌿', color: '#34d399' },
  sistemas:     { label: 'Sistemas',     icon: '⚙️',  color: '#a78bfa' },
  interesse:    { label: 'Interesse',    icon: '⭐', color: '#fbbf24' },
  educacional:  { label: 'Educacional',  icon: '📚', color: '#f97316' },
  diversos:     { label: 'Diversos',     icon: '📦', color: '#9ca3af' },
}

const IS: React.CSSProperties = {
  background: 'var(--input-bg)', border: '1px solid var(--border-md)',
  borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)',
  fontSize: '0.82rem', width: '100%', outline: 'none', boxSizing: 'border-box',
}

// ─── Favicon ──────────────────────────────────────────────────────────────────
function Favicon({ url }: { url: string }) {
  const [ok, setOk] = useState(true)
  const src = `https://www.google.com/s2/favicons?domain=${dominio(url)}&sz=32`
  if (!ok) return <span style={{ fontSize: '1rem' }}>🔗</span>
  return <img src={src} alt="" width={16} height={16} style={{ borderRadius: 3 }} onError={() => setOk(false)} />
}

// ─── Modal cadastro ───────────────────────────────────────────────────────────
function ModalLink({ link, uid, onClose }: { link: Link | null; uid: string | null; onClose: () => void }) {
  const isEdit = !!link
  const [titulo, setTitulo] = useState(link?.titulo || '')
  const [url, setUrl] = useState(link?.url || '')
  const [descricao, setDescricao] = useState(link?.descricao || '')
  const [categoria, setCategoria] = useState<Categoria>(link?.categoria || 'interesse')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  // Auto-preencher título com domínio se vazio
  const handleUrlBlur = () => {
    if (!titulo.trim() && url.trim()) setTitulo(dominio(url))
  }

  const save = async () => {
    if (!uid || !url.trim()) return
    setSaving(true)
    const db = getDB()
    const id = isEdit ? link!.id : newId()
    const urlFinal = url.startsWith('http') ? url : 'https://' + url
    await setDoc(doc(db, 'users', uid, 'links', id), {
      id, titulo: titulo.trim() || dominio(urlFinal),
      url: urlFinal, descricao: descricao.trim() || undefined,
      categoria, criadoEm: link?.criadoEm || Date.now(),
    })
    setSaving(false)
    onClose()
  }

  const del = async () => {
    if (!uid || !link) return
    const db = getDB()
    await deleteDoc(doc(db, 'users', uid, 'links', link.id))
    onClose()
  }

  const cor = CAT_CONFIG[categoria].color

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 18, width: '100%', maxWidth: 500, boxShadow: '0 32px 80px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>{isEdit ? 'Editar Link' : 'Novo Link'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* URL */}
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>URL *</label>
            <input style={IS} value={url} onChange={e => setUrl(e.target.value)} onBlur={handleUrlBlur} placeholder="https://..." autoFocus />
          </div>

          {/* Título */}
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Título</label>
            <input style={IS} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Nome do link (auto-preenchido se vazio)" />
          </div>

          {/* Descrição */}
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Descrição</label>
            <textarea style={{ ...IS, minHeight: 64, resize: 'vertical', lineHeight: 1.5 }} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Para que serve? Por que salvei?" />
          </div>

          {/* Categoria */}
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>Categoria</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
              {(Object.entries(CAT_CONFIG) as [Categoria, any][]).map(([k, v]) => (
                <button key={k} onClick={() => setCategoria(k)}
                  style={{ padding: '8px 6px', borderRadius: 9, border: `1px solid ${categoria === k ? v.color : 'var(--border-md)'}`, background: categoria === k ? `${v.color}15` : 'transparent', color: categoria === k ? v.color : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: categoria === k ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-md)', display: 'flex', justifyContent: 'space-between' }}>
          <div>{isEdit && <button onClick={del} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', color: '#f87171', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}>Excluir</button>}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={save} disabled={saving || !url.trim()}
              style={{ padding: '8px 20px', borderRadius: 8, background: `linear-gradient(135deg,${cor},${cor}bb)`, border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', opacity: !url.trim() ? 0.5 : 1 }}>
              {saving ? 'Salvando…' : isEdit ? 'Salvar' : '+ Adicionar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Link Card ────────────────────────────────────────────────────────────────
function LinkCard({ link, onEdit }: { link: Link; onEdit: () => void }) {
  const cat = CAT_CONFIG[link.categoria]
  const urlFinal = link.url.startsWith('http') ? link.url : 'https://' + link.url

  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', transition: 'all 0.18s', position: 'relative', overflow: 'hidden' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = cat.color + '50'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; (e.currentTarget as HTMLElement).style.transform = 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: cat.color, borderRadius: '3px 0 0 3px' }} />

      {/* Favicon */}
      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${cat.color}12`, border: `1px solid ${cat.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 4 }}>
        <Favicon url={urlFinal} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
          <a href={urlFinal} target="_blank" rel="noopener noreferrer"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = cat.color}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}>
            {link.titulo}
          </a>
          <span style={{ fontSize: '0.58rem', padding: '2px 7px', borderRadius: 8, background: `${cat.color}15`, color: cat.color, fontWeight: 700, flexShrink: 0, border: `1px solid ${cat.color}30` }}>
            {cat.icon} {cat.label}
          </span>
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: link.descricao ? 5 : 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {dominio(urlFinal)}
        </div>
        {link.descricao && (
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {link.descricao}
          </p>
        )}
        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 5, opacity: 0.7 }}>
          {fmtData(link.criadoEm)}
        </div>
      </div>

      {/* Editar */}
      <button onClick={onEdit} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = cat.color; (e.currentTarget as HTMLElement).style.color = cat.color }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}>
        ✎
      </button>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function LinksInteresse() {
  const uid = useUid()
  const [links, setLinks] = useState<Link[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroCategoria, setFiltroCategoria] = useState<Categoria | 'todas'>('todas')
  const [ordenar, setOrdenar] = useState<'recente' | 'antigo' | 'titulo'>('recente')
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Link | null>(null)

  useEffect(() => {
    if (!uid) return
    const db = getDB()
    return onSnapshot(collection(db, 'users', uid, 'links'), snap => {
      setLinks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Link)).sort((a, b) => b.criadoEm - a.criadoEm))
      setLoading(false)
    })
  }, [uid])

  const filtrados = links
    .filter(l => filtroCategoria === 'todas' || l.categoria === filtroCategoria)
    .filter(l => !busca || l.titulo.toLowerCase().includes(busca.toLowerCase()) || (l.descricao || '').toLowerCase().includes(busca.toLowerCase()) || l.url.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => {
      if (ordenar === 'recente') return b.criadoEm - a.criadoEm
      if (ordenar === 'antigo')  return a.criadoEm - b.criadoEm
      return a.titulo.localeCompare(b.titulo)
    })

  // Contagem por categoria
  const counts = Object.keys(CAT_CONFIG).reduce((acc, k) => {
    acc[k as Categoria] = links.filter(l => l.categoria === k).length
    return acc
  }, {} as Record<Categoria, number>)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#60a5fa', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* ── BANNER ── */}
      <div style={{ background: 'linear-gradient(135deg, rgba(0,229,255,0.08) 0%, transparent 100%)', borderBottom: '1px solid var(--border-md)', padding: '18px 28px 16px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,229,255,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', color: 'var(--text-primary)' }}>Links de Interesse</h1>
            <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{links.length} link{links.length !== 1 ? 's' : ''} salvos</p>
          </div>
          <button onClick={() => { setEditando(null); setModal(true) }}
            style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#0ea5e9,#00e5ff)', color: '#0a0f1a', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,229,255,0.25)' }}>
            + Novo Link
          </button>
        </div>

        {/* Categorias como pills com contador */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={() => setFiltroCategoria('todas')}
            style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${filtroCategoria === 'todas' ? 'var(--text-accent)' : 'var(--border)'}`, background: filtroCategoria === 'todas' ? 'var(--accent-bg)' : 'transparent', color: filtroCategoria === 'todas' ? 'var(--text-accent)' : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: filtroCategoria === 'todas' ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s' }}>
            Todas ({links.length})
          </button>
          {(Object.entries(CAT_CONFIG) as [Categoria, any][]).map(([k, v]) => (
            counts[k] > 0 && (
              <button key={k} onClick={() => setFiltroCategoria(filtroCategoria === k ? 'todas' : k)}
                style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${filtroCategoria === k ? v.color : 'var(--border)'}`, background: filtroCategoria === k ? `${v.color}15` : 'transparent', color: filtroCategoria === k ? v.color : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: filtroCategoria === k ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5 }}>
                {v.icon} {v.label} <span style={{ fontSize: '0.62rem', opacity: 0.75 }}>({counts[k]})</span>
              </button>
            )
          ))}
        </div>
      </div>

      {/* ── FILTROS ── */}
      <div style={{ padding: '12px 28px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por título, URL ou descrição..."
          style={{ ...IS, flex: 1, minWidth: 200 }} />
        <select value={ordenar} onChange={e => setOrdenar(e.target.value as any)}
          style={{ background: 'var(--input-bg)', border: '1px solid var(--border-md)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-secondary)', fontSize: '0.75rem', outline: 'none' }}>
          <option value="recente">↓ Mais recente</option>
          <option value="antigo">↑ Mais antigo</option>
          <option value="titulo">A–Z Título</option>
        </select>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── LISTA ── */}
      <div style={{ flex: 1, padding: '16px 28px', overflowY: 'auto' }}>
        {links.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔗</div>
            <p style={{ fontSize: '0.88rem', marginBottom: 20 }}>Nenhum link salvo ainda</p>
            <button onClick={() => { setEditando(null); setModal(true) }}
              style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#0ea5e9,#00e5ff)', color: '#0a0f1a', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
              + Salvar primeiro link
            </button>
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhum resultado para os filtros selecionados</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtrados.map(l => (
              <LinkCard key={l.id} link={l} onEdit={() => { setEditando(l); setModal(true) }} />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && <ModalLink link={editando} uid={uid} onClose={() => { setModal(false); setEditando(null) }} />}
    </div>
  )
}
