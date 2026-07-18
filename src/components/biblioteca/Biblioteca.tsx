import { useEffect, useMemo, useRef, useState } from 'react'
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'

// ══════════════════════════════════════════════════════════════════════════════
//  BIBLIOTECA — acervo de materiais em HTML (estudo, resumos, mapas, peças…)
//  Armazenamento: coleção Firestore 'biblioteca' (HTML salvo como texto).
// ══════════════════════════════════════════════════════════════════════════════

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface BiblioItem {
  id: string
  userId: string
  titulo: string
  descricao: string
  categoria: string
  disciplina: string
  tags: string[]
  favorito: boolean
  html: string
  fonte: 'upload' | 'colado'
  nomeArquivo: string
  tamanho: number
  createdAt?: any
  updatedAt?: any
}

type ViewMode = 'quadro' | 'lista' | 'ladoalado'
type SortMode = 'recente' | 'titulo' | 'categoria'

// ─── Constantes ──────────────────────────────────────────────────────────────
const CATEGORIAS = [
  'Material de estudo', 'Resumo', 'Mapa mental', 'Jurisprudência',
  'Legislação', 'Modelo / Peça', 'Doutrina', 'Questões', 'Outros',
]

// Cor por categoria (para badges e capas)
const COR_CAT: Record<string, string> = {
  'Material de estudo': '#2563EB',
  'Resumo': '#0EA5E9',
  'Mapa mental': '#8B5CF6',
  'Jurisprudência': '#D97706',
  'Legislação': '#059669',
  'Modelo / Peça': '#4F46E5',
  'Doutrina': '#DB2777',
  'Questões': '#DC2626',
  'Outros': '#64748B',
}
const corDe = (c: string) => COR_CAT[c] ?? '#8a9199'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtTamanho(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
function fmtData(ts: any): string {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null)
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}
function bytesDe(str: string): number {
  try { return new Blob([str]).size } catch { return str.length }
}
// Título automático a partir do <title> ou <h1> do HTML
function extrairTitulo(html: string): string {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?? html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? ''
  return t.replace(/<[^>]+>/g, '').trim().slice(0, 120)
}
const LIMITE = 1024 * 1024 // ~1MB (limite do documento Firestore)

// ─── Hook Firestore ──────────────────────────────────────────────────────────
function useBiblioteca() {
  const { user } = useAuth()
  const [items, setItems] = useState<BiblioItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    // Sem orderBy no servidor (evita índice composto); ordenamos no cliente.
    const q = query(collection(db, 'biblioteca'), where('userId', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BiblioItem)))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [user])

  async function add(data: Omit<BiblioItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) {
    if (!user) return
    await addDoc(collection(db, 'biblioteca'), {
      ...data, userId: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
  }
  async function update(id: string, data: Partial<BiblioItem>) {
    await updateDoc(doc(db, 'biblioteca', id), { ...data, updatedAt: serverTimestamp() })
  }
  async function remove(id: string) {
    await deleteDoc(doc(db, 'biblioteca', id))
  }
  return { items, loading, add, update, remove }
}

// ─── Estilos base ────────────────────────────────────────────────────────────
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

// ─── Badge de categoria ──────────────────────────────────────────────────────
function CatBadge({ cat }: { cat: string }) {
  const c = corDe(cat)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, background: `${c}18`, border: `1px solid ${c}40`, color: c, fontSize: '0.63rem', fontWeight: 800, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />{cat}
    </span>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  MODAL — Novo / Editar material
// ══════════════════════════════════════════════════════════════════════════════
function ModalMaterial({ item, onClose, onSave }: {
  item: BiblioItem | null
  onClose: () => void
  onSave: (data: Omit<BiblioItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'>, id?: string) => void
}) {
  const [aba, setAba] = useState<'upload' | 'colar'>(item?.fonte === 'colado' ? 'colar' : (item ? 'colar' : 'upload'))
  const [titulo, setTitulo] = useState(item?.titulo ?? '')
  const [descricao, setDescricao] = useState(item?.descricao ?? '')
  const [categoria, setCategoria] = useState(item?.categoria ?? CATEGORIAS[0])
  const [disciplina, setDisciplina] = useState(item?.disciplina ?? '')
  const [tagsStr, setTagsStr] = useState((item?.tags ?? []).join(', '))
  const [favorito, setFavorito] = useState(item?.favorito ?? false)
  const [html, setHtml] = useState(item?.html ?? '')
  const [nomeArquivo, setNomeArquivo] = useState(item?.nomeArquivo ?? '')
  const [fonte, setFonte] = useState<'upload' | 'colado'>(item?.fonte ?? 'upload')
  const [erro, setErro] = useState('')
  const [previewOn, setPreviewOn] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const tamanho = bytesDe(html)
  const excedeu = tamanho > LIMITE

  async function lerArquivos(files: FileList | null) {
    if (!files || !files.length) return
    // Um arquivo → preenche o formulário. Vários → salva todos direto.
    if (files.length === 1) {
      const f = files[0]
      const txt = await f.text()
      setHtml(txt)
      setNomeArquivo(f.name)
      setFonte('upload')
      if (!titulo.trim()) setTitulo(extrairTitulo(txt) || f.name.replace(/\.html?$/i, ''))
      setErro('')
    } else {
      // múltiplos: cria um item por arquivo, herdando categoria/disciplina/tags atuais
      const tags = tagsStr.split(',').map(s => s.trim()).filter(Boolean)
      for (const f of Array.from(files)) {
        const txt = await f.text()
        if (bytesDe(txt) > LIMITE) continue
        onSave({
          titulo: extrairTitulo(txt) || f.name.replace(/\.html?$/i, ''),
          descricao, categoria, disciplina, tags, favorito,
          html: txt, fonte: 'upload', nomeArquivo: f.name, tamanho: bytesDe(txt),
        })
      }
      onClose()
    }
  }

  function salvar() {
    if (!titulo.trim()) { setErro('Informe um título.'); return }
    if (!html.trim()) { setErro('Adicione o conteúdo HTML (upload ou colado).'); return }
    if (excedeu) { setErro(`Arquivo muito grande (${fmtTamanho(tamanho)}). Limite ~1MB.`); return }
    const tags = tagsStr.split(',').map(s => s.trim()).filter(Boolean)
    onSave({
      titulo: titulo.trim(), descricao: descricao.trim(), categoria, disciplina: disciplina.trim(),
      tags, favorito, html, fonte, nomeArquivo, tamanho,
    }, item?.id)
    onClose()
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 16px', overflowY: 'auto' }}>
      <div style={{ background: 'var(--bg-2,#1a1b26)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.6)', margin: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
            {item ? '✏️ Editar material' : '📚 Novo material'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '78vh', overflowY: 'auto' }}>
          {/* Seletor de fonte */}
          {!item && (
            <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {([['upload', '⬆ Enviar arquivo(s) .html'], ['colar', '</> Colar código HTML']] as const).map(([id, lbl]) => (
                <button key={id} onClick={() => { setAba(id); setFonte(id === 'colar' ? 'colado' : 'upload') }}
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', background: aba === id ? 'linear-gradient(135deg,#647d72,#4c635a)' : 'transparent', color: aba === id ? '#f3f7f4' : 'var(--text-muted)' }}>
                  {lbl}
                </button>
              ))}
            </div>
          )}

          {/* Upload */}
          {aba === 'upload' && !item && (
            <div>
              <div onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault() }}
                onDrop={e => { e.preventDefault(); lerArquivos(e.dataTransfer.files) }}
                style={{ border: '2px dashed rgba(255,255,255,0.16)', borderRadius: 14, padding: '30px 20px', textAlign: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>📄</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {nomeArquivo ? `✅ ${nomeArquivo}` : 'Clique ou arraste arquivos .html aqui'}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Vários arquivos de uma vez são salvos automaticamente com a categoria/disciplina abaixo.
                </div>
                {html && <div style={{ fontSize: '0.66rem', color: excedeu ? '#f87171' : '#34d399', marginTop: 6 }}>{fmtTamanho(tamanho)}{excedeu ? ' · excede o limite de 1MB' : ''}</div>}
              </div>
              <input ref={fileRef} type="file" accept=".html,.htm,text/html" multiple style={{ display: 'none' }}
                onChange={e => lerArquivos(e.target.files)} />
            </div>
          )}

          {/* Colar */}
          {(aba === 'colar' || item) && (
            <div>
              <Lbl>Código HTML</Lbl>
              <textarea value={html} onChange={e => { setHtml(e.target.value); setFonte('colado') }}
                spellCheck={false}
                placeholder="<html>…</html>"
                style={{ ...IS, minHeight: 150, resize: 'vertical', fontFamily: 'var(--font-mono,monospace)', fontSize: '0.76rem', lineHeight: 1.5 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: '0.66rem', color: excedeu ? '#f87171' : 'var(--text-muted)' }}>
                <span>{fmtTamanho(tamanho)}{excedeu ? ' · excede 1MB' : ''}</span>
                {html.trim() && <button onClick={() => setPreviewOn(p => !p)} style={{ background: 'none', border: 'none', color: 'var(--text-accent)', cursor: 'pointer', fontWeight: 700, fontSize: '0.66rem' }}>{previewOn ? 'Ocultar prévia' : '👁 Pré-visualizar'}</button>}
              </div>
              {previewOn && html.trim() && (
                <iframe title="prévia" sandbox="allow-scripts allow-same-origin" srcDoc={html}
                  style={{ width: '100%', height: 260, border: '1px solid var(--border)', borderRadius: 10, marginTop: 8, background: '#fff' }} />
              )}
            </div>
          )}

          {/* Metadados */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <Lbl>Título *</Lbl>
              <input style={IS} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Resumo — Controle de Constitucionalidade" />
            </div>
            <div>
              <Lbl>Categoria</Lbl>
              <select style={IS} value={categoria} onChange={e => setCategoria(e.target.value)}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Lbl>Disciplina</Lbl>
              <input style={IS} value={disciplina} onChange={e => setDisciplina(e.target.value)} placeholder="Ex: Constitucional" list="disc-list" />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Lbl>Tags (separadas por vírgula)</Lbl>
              <input style={IS} value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="Ex: STF, súmula, revisão" />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Lbl>Descrição</Lbl>
              <input style={IS} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Breve descrição do conteúdo" />
            </div>
            <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setFavorito(f => !f)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 9, border: `1px solid ${favorito ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.12)'}`, background: favorito ? 'rgba(251,191,36,0.1)' : 'transparent', color: favorito ? '#fbbf24' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                {favorito ? '★' : '☆'} Favorito
              </button>
            </div>
          </div>

          {erro && <div style={{ fontSize: '0.74rem', color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 9, padding: '8px 12px' }}>⚠ {erro}</div>}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'none', color: 'var(--text-secondary)', fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={salvar}
            style={{ padding: '9px 28px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#647d72,#4c635a)', color: '#f3f7f4', fontWeight: 800, fontSize: '0.84rem', cursor: 'pointer' }}>
            {item ? '✅ Salvar' : '📚 Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  VISUALIZADOR — abre o HTML em tela cheia
// ══════════════════════════════════════════════════════════════════════════════
function Visualizador({ item, onClose, onEdit }: { item: BiblioItem; onClose: () => void; onEdit: () => void }) {
  const abrirNovaAba = () => {
    const blob = new Blob([item.html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--bg-0,#0c0d14)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card-bg,#14151f)' }}>
        <span style={{ fontSize: '1.1rem' }}>📖</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.titulo}</div>
          <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>{item.categoria}{item.disciplina ? ` · ${item.disciplina}` : ''}</div>
        </div>
        <button onClick={onEdit} style={btnTop}>✏️ Editar</button>
        <button onClick={abrirNovaAba} style={btnTop}>⇱ Nova aba</button>
        <button onClick={onClose} style={{ ...btnTop, background: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.3)', color: '#f87171' }}>✕ Fechar</button>
      </div>
      <iframe title={item.titulo} sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals" srcDoc={item.html}
        style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />
    </div>
  )
}
const btnTop: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text-secondary)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
}

// ══════════════════════════════════════════════════════════════════════════════
//  CARD (modo quadro)
// ══════════════════════════════════════════════════════════════════════════════
function CardMaterial({ item, onOpen, onEdit, onDelete, onToggleFav }: any) {
  const c = corDe(item.categoria)
  return (
    <div onClick={onOpen}
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', transition: 'transform .18s, box-shadow .18s, border-color .18s' }}
      onMouseEnter={e => { const el = e.currentTarget; el.style.transform = 'translateY(-4px)'; el.style.boxShadow = `0 16px 34px ${c}30`; el.style.borderColor = `${c}70` }}
      onMouseLeave={e => { const el = e.currentTarget; el.style.transform = 'none'; el.style.boxShadow = 'none'; el.style.borderColor = 'var(--border)' }}>
      {/* Capa — lombada de livro estilizada */}
      <div style={{ height: 96, position: 'relative', background: `linear-gradient(135deg, ${c}, ${c}bb 60%, ${c}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.25, background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.14) 0 3px, transparent 3px 13px)' }} />
        <span style={{ fontSize: '2.1rem', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>{iconeCat(item.categoria)}</span>
        <button onClick={e => { e.stopPropagation(); onToggleFav() }} title="Favorito"
          style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 8, border: 'none', background: 'rgba(0,0,0,0.28)', color: item.favorito ? '#fbbf24' : '#fff', cursor: 'pointer', fontSize: '0.95rem' }}>
          {item.favorito ? '★' : '☆'}
        </button>
      </div>
      {/* Corpo */}
      <div style={{ padding: '11px 13px 13px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.86rem', color: 'var(--text-primary)', lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.titulo}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          <CatBadge cat={item.categoria} />
          {item.disciplina && <span style={{ fontSize: '0.63rem', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}>{item.disciplina}</span>}
        </div>
        {item.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {item.tags.slice(0, 3).map((t: string) => <span key={t} style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>#{t}</span>)}
            {item.tags.length > 3 && <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>+{item.tags.length - 3}</span>}
          </div>
        )}
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{fmtTamanho(item.tamanho)} · {fmtData(item.updatedAt)}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={e => { e.stopPropagation(); onEdit() }} title="Editar" style={iconBtn}>✏️</button>
            <button onClick={e => { e.stopPropagation(); onDelete() }} title="Excluir" style={iconBtn}>🗑</button>
          </div>
        </div>
      </div>
    </div>
  )
}
const iconBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)',
  cursor: 'pointer', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
function iconeCat(cat: string): string {
  const m: Record<string, string> = {
    'Material de estudo': '📚', 'Resumo': '📝', 'Mapa mental': '🧠', 'Jurisprudência': '⚖️',
    'Legislação': '📜', 'Modelo / Peça': '📄', 'Doutrina': '📖', 'Questões': '🎯', 'Outros': '🗂',
  }
  return m[cat] ?? '📄'
}

// ══════════════════════════════════════════════════════════════════════════════
//  LINHA (modo lista)
// ══════════════════════════════════════════════════════════════════════════════
function LinhaMaterial({ item, onOpen, onEdit, onDelete, onToggleFav }: any) {
  const c = corDe(item.categoria)
  return (
    <div onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', transition: 'background .15s, border-color .15s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${c}60`; e.currentTarget.style.background = 'var(--surface)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--card-bg)' }}>
      <div style={{ width: 38, height: 46, borderRadius: 6, background: `linear-gradient(135deg, ${c}, ${c}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0, boxShadow: `inset -3px 0 6px rgba(0,0,0,0.2)` }}>{iconeCat(item.categoria)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.titulo}</span>
          {item.favorito && <span style={{ color: '#fbbf24', fontSize: '0.8rem' }}>★</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
          <CatBadge cat={item.categoria} />
          {item.disciplina && <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>{item.disciplina}</span>}
          {item.tags?.slice(0, 4).map((t: string) => <span key={t} style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>#{t}</span>)}
        </div>
      </div>
      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtData(item.updatedAt)}</span>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button onClick={e => { e.stopPropagation(); onToggleFav() }} title="Favorito" style={{ ...iconBtn, color: item.favorito ? '#fbbf24' : 'var(--text-muted)' }}>{item.favorito ? '★' : '☆'}</button>
        <button onClick={e => { e.stopPropagation(); onEdit() }} title="Editar" style={iconBtn}>✏️</button>
        <button onClick={e => { e.stopPropagation(); onDelete() }} title="Excluir" style={iconBtn}>🗑</button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export default function Biblioteca() {
  const { items, loading, add, update, remove } = useBiblioteca()
  const [modal, setModal] = useState<{ open: boolean; item: BiblioItem | null }>({ open: false, item: null })
  const [visor, setVisor] = useState<BiblioItem | null>(null)
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem('nexus-biblio-view') as ViewMode) ?? 'quadro')
  const [sort, setSort] = useState<SortMode>('recente')
  const [busca, setBusca] = useState('')
  const [fCat, setFCat] = useState('')
  const [fDisc, setFDisc] = useState('')
  const [fTag, setFTag] = useState('')
  const [soFav, setSoFav] = useState(false)
  const [sel, setSel] = useState<string | null>(null) // seleção no modo lado a lado

  const setViewP = (v: ViewMode) => { setView(v); localStorage.setItem('nexus-biblio-view', v) }

  // Opções de filtro derivadas
  const disciplinas = useMemo(() => [...new Set(items.map(i => i.disciplina).filter(Boolean))].sort(), [items])
  const todasTags = useMemo(() => [...new Set(items.flatMap(i => i.tags ?? []))].sort(), [items])

  // Filtragem + ordenação
  const filtrados = useMemo(() => {
    let r = items.filter(i => {
      if (soFav && !i.favorito) return false
      if (fCat && i.categoria !== fCat) return false
      if (fDisc && i.disciplina !== fDisc) return false
      if (fTag && !(i.tags ?? []).includes(fTag)) return false
      if (busca.trim()) {
        const q = busca.toLowerCase()
        const alvo = `${i.titulo} ${i.descricao} ${i.disciplina} ${(i.tags ?? []).join(' ')} ${i.categoria}`.toLowerCase()
        if (!alvo.includes(q)) return false
      }
      return true
    })
    r = [...r].sort((a, b) => {
      if (sort === 'titulo') return a.titulo.localeCompare(b.titulo)
      if (sort === 'categoria') return a.categoria.localeCompare(b.categoria) || a.titulo.localeCompare(b.titulo)
      const ta = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0
      const tb = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0
      return tb - ta
    })
    return r
  }, [items, soFav, fCat, fDisc, fTag, busca, sort])

  const selItem = filtrados.find(i => i.id === sel) ?? filtrados[0] ?? null

  function salvar(data: Omit<BiblioItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'>, id?: string) {
    if (id) update(id, data); else add(data)
  }
  function excluir(item: BiblioItem) {
    if (confirm(`Excluir "${item.titulo}"? Esta ação não pode ser desfeita.`)) remove(item.id)
  }
  const acoes = (item: BiblioItem) => ({
    onOpen: () => setVisor(item),
    onEdit: () => setModal({ open: true, item }),
    onDelete: () => excluir(item),
    onToggleFav: () => update(item.id, { favorito: !item.favorito }),
  })

  const temFiltro = busca || fCat || fDisc || fTag || soFav

  return (
    <div style={{ padding: '18px 20px 40px', maxWidth: 1400, margin: '0 auto' }}>
      <datalist id="disc-list">{disciplinas.map(d => <option key={d} value={d} />)}</datalist>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.5rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            📚 Biblioteca
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {items.length} material(is){temFiltro ? ` · ${filtrados.length} exibido(s)` : ''} · acervo de arquivos HTML
          </div>
        </div>
        <button onClick={() => setModal({ open: true, item: null })}
          style={{ padding: '10px 20px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg,#647d72,#4c635a)', color: '#f3f7f4', fontWeight: 800, fontSize: '0.84rem', cursor: 'pointer', boxShadow: '0 6px 18px rgba(76,99,90,0.4)' }}>
          + Adicionar material
        </button>
      </div>

      {/* Barra de controles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16, padding: 12, borderRadius: 14, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>🔍</span>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por título, tag, disciplina…"
            style={{ ...IS, paddingLeft: 32 }} />
        </div>
        <select value={fCat} onChange={e => setFCat(e.target.value)} style={{ ...IS, width: 'auto', minWidth: 130 }}>
          <option value="">Todas categorias</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fDisc} onChange={e => setFDisc(e.target.value)} style={{ ...IS, width: 'auto', minWidth: 120 }} disabled={!disciplinas.length}>
          <option value="">Todas disciplinas</option>
          {disciplinas.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={fTag} onChange={e => setFTag(e.target.value)} style={{ ...IS, width: 'auto', minWidth: 100 }} disabled={!todasTags.length}>
          <option value="">Todas tags</option>
          {todasTags.map(t => <option key={t} value={t}>#{t}</option>)}
        </select>
        <button onClick={() => setSoFav(f => !f)}
          style={{ padding: '9px 13px', borderRadius: 9, border: `1px solid ${soFav ? 'rgba(251,191,36,0.5)' : 'var(--border)'}`, background: soFav ? 'rgba(251,191,36,0.1)' : 'var(--surface)', color: soFav ? '#fbbf24' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
          {soFav ? '★' : '☆'} Favoritos
        </button>
        {temFiltro && <button onClick={() => { setBusca(''); setFCat(''); setFDisc(''); setFTag(''); setSoFav(false) }} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.74rem' }}>✕ Limpar</button>}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Ordenação */}
          <select value={sort} onChange={e => setSort(e.target.value as SortMode)} style={{ ...IS, width: 'auto', fontSize: '0.76rem', padding: '8px 10px' }}>
            <option value="recente">↓ Recentes</option>
            <option value="titulo">A–Z Título</option>
            <option value="categoria">Categoria</option>
          </select>
          {/* Modos de visualização */}
          <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
            {([['quadro', '▦', 'Quadro'], ['lista', '☰', 'Lista'], ['ladoalado', '◫', 'Lado a lado']] as const).map(([id, ic, t]) => (
              <button key={id} onClick={() => setViewP(id)} title={t}
                style={{ padding: '6px 11px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '0.9rem', background: view === id ? 'linear-gradient(135deg,#647d72,#4c635a)' : 'transparent', color: view === id ? '#f3f7f4' : 'var(--text-muted)' }}>
                {ic}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Carregando acervo…</div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '70px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12, opacity: 0.6 }}>📚</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {temFiltro ? 'Nenhum material encontrado' : 'Sua biblioteca está vazia'}
          </div>
          <div style={{ fontSize: '0.78rem', marginBottom: 18 }}>
            {temFiltro ? 'Ajuste os filtros para ver mais.' : 'Adicione seus materiais em HTML para começar o acervo.'}
          </div>
          {!temFiltro && <button onClick={() => setModal({ open: true, item: null })} style={{ padding: '10px 22px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg,#647d72,#4c635a)', color: '#f3f7f4', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' }}>+ Adicionar primeiro material</button>}
        </div>
      ) : view === 'quadro' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
          {filtrados.map(item => <CardMaterial key={item.id} item={item} {...acoes(item)} />)}
        </div>
      ) : view === 'lista' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtrados.map(item => <LinhaMaterial key={item.id} item={item} {...acoes(item)} />)}
        </div>
      ) : (
        // Lado a lado: lista à esquerda + prévia à direita
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 360px) 1fr', gap: 14, height: 'calc(100vh - 230px)', minHeight: 440 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto', paddingRight: 4 }}>
            {filtrados.map(item => {
              const ativo = selItem?.id === item.id
              const c = corDe(item.categoria)
              return (
                <div key={item.id} onClick={() => setSel(item.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${ativo ? `${c}70` : 'var(--border)'}`, background: ativo ? `${c}12` : 'var(--card-bg)' }}>
                  <div style={{ width: 30, height: 38, borderRadius: 5, background: `linear-gradient(135deg, ${c}, ${c}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', flexShrink: 0 }}>{iconeCat(item.categoria)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.favorito ? '★ ' : ''}{item.titulo}</div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.categoria}{item.disciplina ? ` · ${item.disciplina}` : ''}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--card-bg)' }}>
            {selItem ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selItem.titulo}</div>
                    <div style={{ fontSize: '0.63rem', color: 'var(--text-muted)' }}>{fmtTamanho(selItem.tamanho)} · atualizado {fmtData(selItem.updatedAt)}</div>
                  </div>
                  <button onClick={() => setVisor(selItem)} style={btnTop}>⛶ Tela cheia</button>
                  <button onClick={() => setModal({ open: true, item: selItem })} style={btnTop}>✏️</button>
                </div>
                <iframe title={selItem.titulo} sandbox="allow-scripts allow-same-origin" srcDoc={selItem.html}
                  style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />
              </>
            ) : <div style={{ margin: 'auto', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Selecione um material</div>}
          </div>
        </div>
      )}

      {modal.open && <ModalMaterial item={modal.item} onClose={() => setModal({ open: false, item: null })} onSave={salvar} />}
      {visor && <Visualizador item={visor} onClose={() => setVisor(null)} onEdit={() => { const it = visor; setVisor(null); setModal({ open: true, item: it }) }} />}
    </div>
  )
}
