import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'

// ══════════════════════════════════════════════════════════════════════════════
//  BIBLIOTECA — acervo de materiais em HTML organizados em pastas.
//  Armazenamento: coleção Firestore 'biblioteca'. Cada documento é uma
//  PASTA (kind:'folder') ou um MATERIAL (kind:'material'). HTML salvo como texto.
// ══════════════════════════════════════════════════════════════════════════════

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface BiblioItem {
  id: string
  userId: string
  kind: 'material'
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
  folderId: string | null
  createdAt?: any
  updatedAt?: any
}
interface BiblioFolder {
  id: string
  userId: string
  kind: 'folder'
  nome: string
  cor: string
  parentId: string | null
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
const COR_CAT: Record<string, string> = {
  'Material de estudo': '#2563EB', 'Resumo': '#0EA5E9', 'Mapa mental': '#8B5CF6',
  'Jurisprudência': '#D97706', 'Legislação': '#059669', 'Modelo / Peça': '#4F46E5',
  'Doutrina': '#DB2777', 'Questões': '#DC2626', 'Outros': '#64748B',
}
const corDe = (c: string) => COR_CAT[c] ?? '#8a9199'
const CORES_PASTA = ['#4c635a', '#2563EB', '#7C3AED', '#D97706', '#DC2626', '#059669', '#0891B2', '#DB2777', '#64748B']

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
function extrairTitulo(html: string): string {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?? html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? ''
  return t.replace(/<[^>]+>/g, '').trim().slice(0, 120)
}
function iconeCat(cat: string): string {
  const m: Record<string, string> = {
    'Material de estudo': '📚', 'Resumo': '📝', 'Mapa mental': '🧠', 'Jurisprudência': '⚖️',
    'Legislação': '📜', 'Modelo / Peça': '📄', 'Doutrina': '📖', 'Questões': '🎯', 'Outros': '🗂',
  }
  return m[cat] ?? '📄'
}
const LIMITE = 1024 * 1024 // ~1MB (limite do documento Firestore)

// ─── Hook Firestore ──────────────────────────────────────────────────────────
function useBiblioteca() {
  const { user } = useAuth()
  const [docs, setDocs] = useState<(BiblioItem | BiblioFolder)[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'biblioteca'), where('userId', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      setDocs(snap.docs.map((d) => {
        const data = d.data() as any
        return { id: d.id, kind: data.kind ?? 'material', ...data }
      }))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [user])

  const materials = useMemo(() => docs.filter(d => d.kind === 'material') as BiblioItem[], [docs])
  const folders = useMemo(() => docs.filter(d => d.kind === 'folder') as BiblioFolder[], [docs])

  async function addMaterial(data: Omit<BiblioItem, 'id' | 'userId' | 'kind' | 'createdAt' | 'updatedAt'>) {
    if (!user) throw new Error('Sem usuário autenticado.')
    await addDoc(collection(db, 'biblioteca'), {
      ...data, kind: 'material', userId: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
  }
  async function updateMaterial(id: string, data: Partial<BiblioItem>) {
    await updateDoc(doc(db, 'biblioteca', id), { ...data, updatedAt: serverTimestamp() })
  }
  async function removeMaterial(id: string) {
    await deleteDoc(doc(db, 'biblioteca', id))
  }
  async function addFolder(nome: string, cor: string, parentId: string | null) {
    if (!user) throw new Error('Sem usuário autenticado.')
    await addDoc(collection(db, 'biblioteca'), {
      kind: 'folder', nome, cor, parentId: parentId ?? null,
      userId: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
  }
  async function updateFolder(id: string, data: Partial<BiblioFolder>) {
    await updateDoc(doc(db, 'biblioteca', id), { ...data, updatedAt: serverTimestamp() })
  }
  async function removeFolder(f: BiblioFolder) {
    // Reparenta conteúdo direto para o pai da pasta e então exclui.
    const subF = folders.filter(x => x.parentId === f.id)
    const mats = materials.filter(x => (x.folderId ?? null) === f.id)
    await Promise.all([
      ...subF.map(sf => updateDoc(doc(db, 'biblioteca', sf.id), { parentId: f.parentId ?? null })),
      ...mats.map(m => updateDoc(doc(db, 'biblioteca', m.id), { folderId: f.parentId ?? null })),
    ])
    await deleteDoc(doc(db, 'biblioteca', f.id))
  }
  return { materials, folders, loading, addMaterial, updateMaterial, removeMaterial, addFolder, updateFolder, removeFolder }
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
const iconBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)',
  cursor: 'pointer', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
const btnTop: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text-secondary)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
}
const btnVerde: React.CSSProperties = {
  border: 'none', background: 'linear-gradient(135deg,#647d72,#4c635a)', color: '#f3f7f4', fontWeight: 800, cursor: 'pointer',
}

function CatBadge({ cat }: { cat: string }) {
  const c = corDe(cat)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, background: `${c}18`, border: `1px solid ${c}40`, color: c, fontSize: '0.63rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />{cat}
    </span>
  )
}

// Caminho da pasta (breadcrumb helper)
function caminhoPasta(folders: BiblioFolder[], id: string | null): BiblioFolder[] {
  const path: BiblioFolder[] = []
  let cur = id
  const byId = new Map(folders.map(f => [f.id, f]))
  let guard = 0
  while (cur && guard < 50) {
    const f = byId.get(cur); if (!f) break
    path.unshift(f); cur = f.parentId; guard++
  }
  return path
}

// ══════════════════════════════════════════════════════════════════════════════
//  MODAL — Nova / Editar pasta
// ══════════════════════════════════════════════════════════════════════════════
function ModalPasta({ pasta, parentId, onClose, onSave }: {
  pasta: BiblioFolder | null
  parentId: string | null
  onClose: () => void
  onSave: (nome: string, cor: string) => Promise<void>
}) {
  const [nome, setNome] = useState(pasta?.nome ?? '')
  const [cor, setCor] = useState(pasta?.cor ?? CORES_PASTA[0])
  const [erro, setErro] = useState('')
  const [saving, setSaving] = useState(false)
  async function salvar() {
    if (!nome.trim()) { setErro('Dê um nome à pasta.'); return }
    setSaving(true)
    try { await onSave(nome.trim(), cor); onClose() }
    catch (e: any) { setErro(msgErro(e)) }
    finally { setSaving(false) }
  }
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-2,#1a1b26)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, width: '100%', maxWidth: 420, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.98rem', color: 'var(--text-primary)' }}>{pasta ? '✏️ Editar pasta' : '📁 Nova pasta'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <Lbl>Nome da pasta</Lbl>
            <input autoFocus style={IS} value={nome} onChange={e => setNome(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') salvar() }} placeholder="Ex: Constitucional, Concurso PGM…" />
          </div>
          <div>
            <Lbl>Cor</Lbl>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CORES_PASTA.map(cc => (
                <button key={cc} onClick={() => setCor(cc)}
                  style={{ width: 28, height: 28, borderRadius: 8, cursor: 'pointer', background: cc, border: cor === cc ? '2px solid #fff' : '2px solid transparent', boxShadow: cor === cc ? `0 0 0 2px ${cc}` : 'none' }} />
              ))}
            </div>
          </div>
          {!pasta && parentId && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Será criada dentro da pasta atual.</div>}
          {erro && <div style={{ fontSize: '0.74rem', color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 9, padding: '8px 12px' }}>⚠ {erro}</div>}
        </div>
        <div style={{ padding: '12px 22px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'none', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={salvar} disabled={saving} style={{ ...btnVerde, padding: '8px 22px', borderRadius: 9, fontSize: '0.8rem', opacity: saving ? 0.6 : 1 }}>{saving ? 'Salvando…' : (pasta ? 'Salvar' : '+ Criar')}</button>
        </div>
      </div>
    </div>
  )
}

function msgErro(e: any): string {
  const m = e?.code === 'permission-denied' || /permission/i.test(e?.message ?? '')
    ? 'Permissão negada pelo Firestore. Publique as regras (coleção "biblioteca") antes de salvar.'
    : (e?.message ?? String(e))
  return `Erro ao salvar: ${m}`
}

// ══════════════════════════════════════════════════════════════════════════════
//  MODAL — Novo / Editar material
// ══════════════════════════════════════════════════════════════════════════════
function ModalMaterial({ item, folders, folderAtual, onClose, onSave }: {
  item: BiblioItem | null
  folders: BiblioFolder[]
  folderAtual: string | null
  onClose: () => void
  onSave: (data: Omit<BiblioItem, 'id' | 'userId' | 'kind' | 'createdAt' | 'updatedAt'>, id?: string) => Promise<void>
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
  const [folderId, setFolderId] = useState<string | null>(item ? (item.folderId ?? null) : folderAtual)
  const [erro, setErro] = useState('')
  const [saving, setSaving] = useState(false)
  const [previewOn, setPreviewOn] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const tamanho = bytesDe(html)
  const excedeu = tamanho > LIMITE
  // opções de pasta ordenadas por caminho legível
  const opcoesPasta = useMemo(() => folders.map(f => ({
    id: f.id, label: caminhoPasta(folders, f.id).map(p => p.nome).join(' / '),
  })).sort((a, b) => a.label.localeCompare(b.label)), [folders])

  async function lerArquivos(files: FileList | null) {
    if (!files || !files.length) return
    if (files.length === 1) {
      const f = files[0]
      const txt = await f.text()
      setHtml(txt); setNomeArquivo(f.name); setFonte('upload')
      if (!titulo.trim()) setTitulo(extrairTitulo(txt) || f.name.replace(/\.html?$/i, ''))
      setErro('')
    } else {
      const tags = tagsStr.split(',').map(s => s.trim()).filter(Boolean)
      setSaving(true)
      try {
        for (const f of Array.from(files)) {
          const txt = await f.text()
          if (bytesDe(txt) > LIMITE) continue
          await onSave({
            titulo: extrairTitulo(txt) || f.name.replace(/\.html?$/i, ''),
            descricao, categoria, disciplina, tags, favorito,
            html: txt, fonte: 'upload', nomeArquivo: f.name, tamanho: bytesDe(txt), folderId,
          })
        }
        onClose()
      } catch (e: any) { setErro(msgErro(e)) }
      finally { setSaving(false) }
    }
  }

  async function salvar() {
    if (!titulo.trim()) { setErro('Informe um título.'); return }
    if (!html.trim()) { setErro('Adicione o conteúdo HTML (upload ou colado).'); return }
    if (excedeu) { setErro(`Arquivo muito grande (${fmtTamanho(tamanho)}). Limite ~1MB.`); return }
    const tags = tagsStr.split(',').map(s => s.trim()).filter(Boolean)
    setSaving(true)
    try {
      await onSave({
        titulo: titulo.trim(), descricao: descricao.trim(), categoria, disciplina: disciplina.trim(),
        tags, favorito, html, fonte, nomeArquivo, tamanho, folderId,
      }, item?.id)
      onClose()
    } catch (e: any) { setErro(msgErro(e)) }
    finally { setSaving(false) }
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 16px', overflowY: 'auto' }}>
      <div style={{ background: 'var(--bg-2,#1a1b26)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.6)', margin: 'auto' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{item ? '✏️ Editar material' : '📚 Novo material'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '78vh', overflowY: 'auto' }}>
          {!item && (
            <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {([['upload', '⬆ Enviar arquivo(s) .html'], ['colar', '</> Colar código HTML']] as const).map(([id, lbl]) => (
                <button key={id} onClick={() => { setAba(id); setFonte(id === 'colar' ? 'colado' : 'upload') }}
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', background: aba === id ? 'linear-gradient(135deg,#647d72,#4c635a)' : 'transparent', color: aba === id ? '#f3f7f4' : 'var(--text-muted)' }}>{lbl}</button>
              ))}
            </div>
          )}

          {aba === 'upload' && !item && (
            <div>
              <div onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); lerArquivos(e.dataTransfer.files) }}
                style={{ border: '2px dashed rgba(255,255,255,0.16)', borderRadius: 14, padding: '30px 20px', textAlign: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>📄</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{nomeArquivo ? `✅ ${nomeArquivo}` : 'Clique ou arraste arquivos .html aqui'}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>Vários de uma vez são salvos automaticamente com a categoria/pasta abaixo.</div>
                {html && <div style={{ fontSize: '0.66rem', color: excedeu ? '#f87171' : '#34d399', marginTop: 6 }}>{fmtTamanho(tamanho)}{excedeu ? ' · excede o limite de 1MB' : ''}</div>}
              </div>
              <input ref={fileRef} type="file" accept=".html,.htm,text/html" multiple style={{ display: 'none' }} onChange={e => lerArquivos(e.target.files)} />
            </div>
          )}

          {(aba === 'colar' || item) && (
            <div>
              <Lbl>Código HTML</Lbl>
              <textarea value={html} onChange={e => { setHtml(e.target.value); setFonte('colado') }} spellCheck={false} placeholder="<html>…</html>"
                style={{ ...IS, minHeight: 150, resize: 'vertical', fontFamily: 'var(--font-mono,monospace)', fontSize: '0.76rem', lineHeight: 1.5 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: '0.66rem', color: excedeu ? '#f87171' : 'var(--text-muted)' }}>
                <span>{fmtTamanho(tamanho)}{excedeu ? ' · excede 1MB' : ''}</span>
                {html.trim() && <button onClick={() => setPreviewOn(p => !p)} style={{ background: 'none', border: 'none', color: 'var(--text-accent)', cursor: 'pointer', fontWeight: 700, fontSize: '0.66rem' }}>{previewOn ? 'Ocultar prévia' : '👁 Pré-visualizar'}</button>}
              </div>
              {previewOn && html.trim() && <iframe title="prévia" sandbox="allow-scripts allow-same-origin" srcDoc={html} style={{ width: '100%', height: 260, border: '1px solid var(--border)', borderRadius: 10, marginTop: 8, background: '#fff' }} />}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: 'span 2' }}><Lbl>Título *</Lbl><input style={IS} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Resumo — Controle de Constitucionalidade" /></div>
            <div><Lbl>Categoria</Lbl><select style={IS} value={categoria} onChange={e => setCategoria(e.target.value)}>{CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><Lbl>Pasta</Lbl>
              <select style={IS} value={folderId ?? ''} onChange={e => setFolderId(e.target.value || null)}>
                <option value="">📚 Raiz (biblioteca)</option>
                {opcoesPasta.map(o => <option key={o.id} value={o.id}>📁 {o.label}</option>)}
              </select>
            </div>
            <div><Lbl>Disciplina</Lbl><input style={IS} value={disciplina} onChange={e => setDisciplina(e.target.value)} placeholder="Ex: Constitucional" list="disc-list" /></div>
            <div><Lbl>Tags (vírgula)</Lbl><input style={IS} value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="Ex: STF, súmula, revisão" /></div>
            <div style={{ gridColumn: 'span 2' }}><Lbl>Descrição</Lbl><input style={IS} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Breve descrição do conteúdo" /></div>
            <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setFavorito(f => !f)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 9, border: `1px solid ${favorito ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.12)'}`, background: favorito ? 'rgba(251,191,36,0.1)' : 'transparent', color: favorito ? '#fbbf24' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>{favorito ? '★' : '☆'} Favorito</button>
            </div>
          </div>

          {erro && <div style={{ fontSize: '0.74rem', color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 9, padding: '8px 12px' }}>⚠ {erro}</div>}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'none', color: 'var(--text-secondary)', fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={salvar} disabled={saving} style={{ ...btnVerde, padding: '9px 28px', borderRadius: 10, fontSize: '0.84rem', opacity: saving ? 0.6 : 1 }}>{saving ? 'Salvando…' : (item ? '✅ Salvar' : '📚 Adicionar')}</button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  VISUALIZADOR — abre o HTML em tela cheia
// ══════════════════════════════════════════════════════════════════════════════
function Visualizador({ item, onClose, onEdit, onSaveHtml }: {
  item: BiblioItem; onClose: () => void; onEdit: () => void; onSaveHtml: (html: string) => Promise<void>
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [editando, setEditando] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [estado, setEstado] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [autosave, setAutosave] = useState(() => localStorage.getItem('nexus-biblio-autosave') !== 'off')
  const [msg, setMsg] = useState('')
  const readyRef = useRef(false)
  const dirtyRef = useRef(false)
  const suppressRef = useRef(false)
  const editandoRef = useRef(false)
  const autosaveRef = useRef(autosave)
  const timerRef = useRef<any>(null)
  const obsRef = useRef<MutationObserver | null>(null)
  const lastPosRef = useRef({ x: 0, y: 0 })

  const setAutosaveP = (v: boolean) => { setAutosave(v); autosaveRef.current = v; localStorage.setItem('nexus-biblio-autosave', v ? 'on' : 'off') }
  const getDoc = (): Document | null => iframeRef.current?.contentDocument ?? null

  function capturarHtml(): string | null {
    const d = getDoc(); if (!d) return null
    const body = d.body
    const ce = body?.getAttribute('contenteditable')
    if (body) body.removeAttribute('contenteditable')
    const html = '<!DOCTYPE html>\n' + d.documentElement.outerHTML
    if (editandoRef.current && body && ce != null) body.setAttribute('contenteditable', ce)
    return html
  }

  const salvar = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    const html = capturarHtml(); if (html == null) return
    if (bytesDe(html) > LIMITE) { setEstado('error'); setMsg(`Muito grande (${fmtTamanho(bytesDe(html))}). Limite ~1MB.`); return }
    setEstado('saving'); setMsg('')
    try {
      await onSaveHtml(html)
      dirtyRef.current = false; setDirty(false); setEstado('saved')
      setTimeout(() => setEstado(s => (s === 'saved' ? 'idle' : s)), 1800)
    } catch (e: any) {
      setEstado('error'); setMsg(e?.code === 'permission-denied' ? 'Permissão negada pelo Firestore.' : 'Erro ao salvar.')
    }
  }, [onSaveHtml])

  const marcarSujo = useCallback(() => {
    dirtyRef.current = true; setDirty(true)
    if (autosaveRef.current) {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => { salvar() }, 2500)
    }
  }, [salvar])

  function onLoadIframe() {
    const d = getDoc(); if (!d) return
    readyRef.current = false
    setTimeout(() => { readyRef.current = true }, 900) // ignora renderização inicial dos scripts
    obsRef.current?.disconnect()
    const obs = new MutationObserver(() => { if (readyRef.current && !suppressRef.current) marcarSujo() })
    obs.observe(d.documentElement, { subtree: true, childList: true, characterData: true, attributes: true })
    obsRef.current = obs
    instalarFerramentas(d)
  }

  // ── Ferramentas injetadas no documento (sublinhado por Shift + post-its) ──
  function instalarFerramentas(d: Document) {
    d.addEventListener('mousemove', (e: MouseEvent) => { lastPosRef.current = { x: e.clientX, y: e.clientY } })
    d.addEventListener('keydown', (e: KeyboardEvent) => {
      // Shift (sozinho) sublinha a palavra sob o cursor — desativado enquanto edita/digita
      if (e.key === 'Shift' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && !editandoRef.current) {
        const alvo = e.target as HTMLElement | null
        if (alvo && (alvo.isContentEditable || alvo.closest('[data-nx-postit]'))) return
        sublinharNoPonto(d, lastPosRef.current.x, lastPosRef.current.y)
      }
    })
    // reativa post-its já salvos
    if (d.querySelector('[data-nx-postit]')) garantirBodyRelativo(d)
    d.querySelectorAll<HTMLElement>('[data-nx-postit]').forEach(el => attachPostit(el, d))
  }

  function rangeDoPonto(d: Document, x: number, y: number): Range | null {
    const anyD = d as any
    if (anyD.caretRangeFromPoint) return anyD.caretRangeFromPoint(x, y)
    if (anyD.caretPositionFromPoint) { const p = anyD.caretPositionFromPoint(x, y); if (p) { const r = d.createRange(); r.setStart(p.offsetNode, p.offset); r.collapse(true); return r } }
    return null
  }

  function sublinharNoPonto(d: Document, x: number, y: number) {
    const cr = rangeDoPonto(d, x, y); if (!cr) return
    const node = cr.startContainer
    if (node.nodeType !== 3) return
    const el = (node.parentElement)
    if (el && el.closest('[data-nx-postit]')) return
    // toggle: se já está dentro de um sublinhado, remove
    const ja = el?.closest('[data-nx-u]') as HTMLElement | null
    if (ja) {
      const pai = ja.parentNode; if (!pai) return
      while (ja.firstChild) pai.insertBefore(ja.firstChild, ja)
      pai.removeChild(ja); (pai as HTMLElement).normalize?.()
      marcarSujo(); return
    }
    const text = node.textContent || ''
    const isW = (c: string) => /[\p{L}\p{N}]/u.test(c)
    let i = cr.startOffset
    if (i >= text.length) i = text.length - 1
    if (i < 0 || !text[i] || !isW(text[i])) { if (i > 0 && isW(text[i - 1])) i -= 1; else return }
    let s = i, e = i
    while (s > 0 && isW(text[s - 1])) s--
    while (e < text.length && isW(text[e])) e++
    if (e <= s) return
    try {
      const span = d.createElement('span')
      span.setAttribute('data-nx-u', '1')
      span.style.textDecoration = 'underline'
      span.style.textDecorationColor = '#111'
      span.style.textDecorationThickness = '2px'
      span.style.textUnderlineOffset = '2px'
      const r = d.createRange(); r.setStart(node, s); r.setEnd(node, e)
      r.surroundContents(span)
      marcarSujo()
    } catch { /* noop */ }
  }

  function garantirBodyRelativo(d: Document) {
    if (d.body && d.defaultView && d.defaultView.getComputedStyle(d.body).position === 'static') d.body.style.position = 'relative'
  }

  function attachPostit(el: HTMLElement, d: Document) {
    const bar = el.querySelector<HTMLElement>('[data-nx-bar]')
    const del = el.querySelector<HTMLElement>('[data-nx-del]')
    del?.addEventListener('click', ev => { ev.stopPropagation(); el.remove(); marcarSujo() })
    bar?.addEventListener('mousedown', ev => {
      ev.preventDefault()
      const sx = ev.clientX, sy = ev.clientY
      const x0 = parseFloat(el.style.left) || 0, y0 = parseFloat(el.style.top) || 0
      const mv = (e2: MouseEvent) => { el.style.left = (x0 + (e2.clientX - sx)) + 'px'; el.style.top = (y0 + (e2.clientY - sy)) + 'px' }
      const up = () => { d.removeEventListener('mousemove', mv); d.removeEventListener('mouseup', up); marcarSujo() }
      d.addEventListener('mousemove', mv); d.addEventListener('mouseup', up)
    })
  }

  const POSTIT_CORES = ['#fff9c4', '#ffd8b0', '#c9f7d4', '#cfe4ff', '#f7c9e3']
  function criarPostit() {
    const d = getDoc(); if (!d?.body) return
    garantirBodyRelativo(d)
    const cor = POSTIT_CORES[d.querySelectorAll('[data-nx-postit]').length % POSTIT_CORES.length]
    const sX = d.documentElement.scrollLeft || d.body.scrollLeft || 0
    const sY = d.documentElement.scrollTop || d.body.scrollTop || 0
    const vw = iframeRef.current?.clientWidth || 640
    const el = d.createElement('div')
    el.setAttribute('data-nx-postit', '1')
    el.style.cssText = `position:absolute;width:200px;min-height:130px;background:${cor};color:#4a3f00;border-radius:9px;box-shadow:0 10px 24px rgba(0,0,0,0.28);font-family:inherit;font-size:14px;line-height:1.45;z-index:2147483000;transform:rotate(-1.4deg);overflow:hidden;`
    el.style.left = (sX + Math.max(20, (vw - 200) / 2)) + 'px'
    el.style.top = (sY + 56) + 'px'
    el.innerHTML =
      '<div data-nx-bar style="height:24px;background:rgba(0,0,0,0.08);cursor:move;display:flex;align-items:center;justify-content:space-between;padding:0 8px;font-size:12px;color:rgba(0,0,0,0.45)">📌<span data-nx-del style="cursor:pointer;font-size:17px;line-height:1;font-weight:700">×</span></div>' +
      '<div data-nx-body contenteditable="true" style="outline:none;padding:10px 12px 14px;min-height:86px">Escreva sua nota…</div>'
    d.body.appendChild(el)
    attachPostit(el, d)
    const body = el.querySelector<HTMLElement>('[data-nx-body]')
    if (body) { const r = d.createRange(); r.selectNodeContents(body); const sel = d.defaultView?.getSelection(); sel?.removeAllRanges(); sel?.addRange(r); body.focus() }
    marcarSujo()
  }

  function toggleEdit() {
    const d = getDoc(); if (!d?.body) return
    const novo = !editando
    suppressRef.current = true
    if (novo) { d.body.setAttribute('contenteditable', 'true'); d.body.style.outline = 'none' }
    else { d.body.removeAttribute('contenteditable') }
    editandoRef.current = novo; setEditando(novo)
    setTimeout(() => { suppressRef.current = false; if (novo) iframeRef.current?.contentWindow?.focus() }, 60)
  }

  function cmd(action: string, value?: string) {
    const d = getDoc(); if (!d) return
    iframeRef.current?.contentWindow?.focus()
    try { d.execCommand('styleWithCSS', false, 'true') } catch { /* noop */ }
    try { d.execCommand(action, false, value) } catch { /* noop */ }
    marcarSujo()
  }
  const inserirNota = () => cmd('insertHTML',
    '<div style="border-left:4px solid #f59e0b;background:#fff7e6;color:#7c4a03;padding:10px 14px;margin:12px 0;border-radius:8px;font-family:inherit;font-size:0.95em"><strong>📝 Nota:</strong>&nbsp;escreva aqui…</div>&nbsp;')

  const abrirNovaAba = () => {
    const html = editando ? (capturarHtml() ?? item.html) : item.html
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  const fechar = useCallback(async () => {
    if (dirtyRef.current) { await salvar() }
    onClose()
  }, [salvar, onClose])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); salvar() }
    }
    window.addEventListener('keydown', h)
    return () => {
      window.removeEventListener('keydown', h)
      obsRef.current?.disconnect()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [fechar, salvar])

  const statusTxt = estado === 'saving' ? 'Salvando…' : estado === 'saved' ? 'Salvo ✓' : estado === 'error' ? `⚠ ${msg}` : (dirty ? 'Alterações não salvas' : '')
  const statusCor = estado === 'error' ? '#f87171' : estado === 'saved' ? '#34d399' : dirty ? '#fbbf24' : 'var(--text-muted)'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--bg-0,#0c0d14)', display: 'flex', flexDirection: 'column' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--border)', background: 'var(--card-bg,#14151f)' }}>
        <span style={{ fontSize: '1.05rem' }}>📖</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.titulo}</div>
          <div style={{ fontSize: '0.62rem', color: statusCor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{statusTxt || `${item.categoria}${item.disciplina ? ` · ${item.disciplina}` : ''}`}</div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} title="Salvar automaticamente enquanto edita">
          <input type="checkbox" checked={autosave} onChange={e => setAutosaveP(e.target.checked)} /> Autosave
        </label>
        <button onClick={() => salvar()} disabled={estado === 'saving'} style={{ ...btnTop, ...(dirty ? { background: 'linear-gradient(135deg,#647d72,#4c635a)', color: '#f3f7f4', borderColor: 'transparent' } : {}) }}>💾 Salvar</button>
        <button onClick={toggleEdit} style={{ ...btnTop, ...(editando ? { background: 'rgba(251,191,36,0.14)', borderColor: 'rgba(251,191,36,0.4)', color: '#fbbf24' } : {}) }}>{editando ? '🖊 Anotando' : '✏️ Anotar'}</button>
        <button onClick={criarPostit} style={btnTop} title="Adicionar nota post-it flutuante">🗒 Post-it</button>
        <button onClick={onEdit} style={btnTop} title="Editar o código-fonte HTML">⟨/⟩ Código</button>
        <button onClick={abrirNovaAba} style={btnTop}>⇱ Nova aba</button>
        <button onClick={() => fechar()} style={{ ...btnTop, background: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.3)', color: '#f87171' }}>✕ Fechar</button>
      </div>

      {/* Barra de ferramentas de anotação */}
      {editando && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexWrap: 'wrap' }}>
          <TBtn onClick={() => cmd('hiliteColor', '#fde68a')} title="Marca-texto amarelo"><span style={{ background: '#fde68a', color: '#000', padding: '0 5px', borderRadius: 3 }}>H</span></TBtn>
          <TBtn onClick={() => cmd('hiliteColor', '#bbf7d0')} title="Marca-texto verde"><span style={{ background: '#bbf7d0', color: '#000', padding: '0 5px', borderRadius: 3 }}>H</span></TBtn>
          <TBtn onClick={() => cmd('hiliteColor', '#bfdbfe')} title="Marca-texto azul"><span style={{ background: '#bfdbfe', color: '#000', padding: '0 5px', borderRadius: 3 }}>H</span></TBtn>
          <Sep />
          <TBtn onClick={() => cmd('bold')} title="Negrito"><b>B</b></TBtn>
          <TBtn onClick={() => cmd('italic')} title="Itálico"><i>I</i></TBtn>
          <TBtn onClick={() => cmd('underline')} title="Sublinhado"><u>U</u></TBtn>
          <TBtn onClick={() => cmd('foreColor', '#dc2626')} title="Texto vermelho"><span style={{ color: '#dc2626' }}>A</span></TBtn>
          <Sep />
          <TBtn onClick={inserirNota} title="Inserir nota">📝 Nota</TBtn>
          <TBtn onClick={() => cmd('formatBlock', 'H2')} title="Título">H₂</TBtn>
          <TBtn onClick={() => cmd('insertUnorderedList')} title="Lista">• Lista</TBtn>
          <Sep />
          <TBtn onClick={() => cmd('undo')} title="Desfazer">↶</TBtn>
          <TBtn onClick={() => cmd('redo')} title="Refazer">↷</TBtn>
          <span style={{ marginLeft: 'auto', fontSize: '0.66rem', color: 'var(--text-muted)' }}>Selecione um trecho e aplique · Ctrl+S salva</span>
        </div>
      )}

      <iframe ref={iframeRef} title={item.titulo} onLoad={onLoadIframe}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
        srcDoc={item.html} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />
    </div>
  )
}
function TBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button title={title} onMouseDown={e => e.preventDefault()} onClick={onClick}
      style={{ minWidth: 30, height: 30, padding: '0 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </button>
  )
}
function Sep() { return <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 3px' }} /> }

// ─── Card de pasta ───────────────────────────────────────────────────────────
function CardPasta({ folder, count, onOpen, onEdit, onDelete }: any) {
  return (
    <div onClick={onOpen}
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 15px', borderRadius: 14, border: '1px solid var(--border)', background: `linear-gradient(135deg, ${folder.cor}14, transparent)`, cursor: 'pointer', transition: 'transform .18s, box-shadow .18s, border-color .18s' }}
      onMouseEnter={e => { const el = e.currentTarget; el.style.transform = 'translateY(-4px)'; el.style.boxShadow = `0 16px 34px ${folder.cor}30`; el.style.borderColor = `${folder.cor}70` }}
      onMouseLeave={e => { const el = e.currentTarget; el.style.transform = 'none'; el.style.boxShadow = 'none'; el.style.borderColor = 'var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '2rem', filter: `drop-shadow(0 2px 4px ${folder.cor}55)` }}>📁</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={e => { e.stopPropagation(); onEdit() }} title="Editar pasta" style={iconBtn}>✏️</button>
          <button onClick={e => { e.stopPropagation(); onDelete() }} title="Excluir pasta" style={iconBtn}>🗑</button>
        </div>
      </div>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{folder.nome}</div>
        <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: 3 }}>{count.subs > 0 ? `${count.subs} pasta(s) · ` : ''}{count.mats} material(is)</div>
      </div>
    </div>
  )
}
function LinhaPasta({ folder, count, onOpen, onEdit, onDelete }: any) {
  return (
    <div onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 11, border: '1px solid var(--border)', background: `linear-gradient(90deg, ${folder.cor}10, var(--card-bg) 40%)`, cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${folder.cor}60` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}>
      <span style={{ fontSize: '1.4rem' }}>📁</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{folder.nome}</div>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{count.subs > 0 ? `${count.subs} pasta(s) · ` : ''}{count.mats} material(is)</div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={e => { e.stopPropagation(); onEdit() }} title="Editar" style={iconBtn}>✏️</button>
        <button onClick={e => { e.stopPropagation(); onDelete() }} title="Excluir" style={iconBtn}>🗑</button>
      </div>
    </div>
  )
}

// ─── Card / Linha de material ────────────────────────────────────────────────
function CardMaterial({ item, onOpen, onEdit, onDelete, onToggleFav }: any) {
  const c = corDe(item.categoria)
  return (
    <div onClick={onOpen}
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', transition: 'transform .18s, box-shadow .18s, border-color .18s' }}
      onMouseEnter={e => { const el = e.currentTarget; el.style.transform = 'translateY(-4px)'; el.style.boxShadow = `0 16px 34px ${c}30`; el.style.borderColor = `${c}70` }}
      onMouseLeave={e => { const el = e.currentTarget; el.style.transform = 'none'; el.style.boxShadow = 'none'; el.style.borderColor = 'var(--border)' }}>
      <div style={{ height: 96, position: 'relative', background: `linear-gradient(135deg, ${c}, ${c}bb 60%, ${c}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.25, background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.14) 0 3px, transparent 3px 13px)' }} />
        <span style={{ fontSize: '2.1rem', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>{iconeCat(item.categoria)}</span>
        <button onClick={e => { e.stopPropagation(); onToggleFav() }} title="Favorito" style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 8, border: 'none', background: 'rgba(0,0,0,0.28)', color: item.favorito ? '#fbbf24' : '#fff', cursor: 'pointer', fontSize: '0.95rem' }}>{item.favorito ? '★' : '☆'}</button>
      </div>
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
function LinhaMaterial({ item, onOpen, onEdit, onDelete, onToggleFav }: any) {
  const c = corDe(item.categoria)
  return (
    <div onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', transition: 'background .15s, border-color .15s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${c}60`; e.currentTarget.style.background = 'var(--surface)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--card-bg)' }}>
      <div style={{ width: 38, height: 46, borderRadius: 6, background: `linear-gradient(135deg, ${c}, ${c}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0, boxShadow: 'inset -3px 0 6px rgba(0,0,0,0.2)' }}>{iconeCat(item.categoria)}</div>
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
  const { materials, folders, loading, addMaterial, updateMaterial, removeMaterial, addFolder, updateFolder, removeFolder } = useBiblioteca()
  const [modal, setModal] = useState<{ open: boolean; item: BiblioItem | null }>({ open: false, item: null })
  const [modalPasta, setModalPasta] = useState<{ open: boolean; pasta: BiblioFolder | null }>({ open: false, pasta: null })
  const [visor, setVisor] = useState<BiblioItem | null>(null)
  const [pastaAtual, setPastaAtual] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem('nexus-biblio-view') as ViewMode) ?? 'quadro')
  const [sort, setSort] = useState<SortMode>('recente')
  const [busca, setBusca] = useState('')
  const [fCat, setFCat] = useState('')
  const [fDisc, setFDisc] = useState('')
  const [fTag, setFTag] = useState('')
  const [soFav, setSoFav] = useState(false)
  const [sel, setSel] = useState<string | null>(null)

  const setViewP = (v: ViewMode) => { setView(v); localStorage.setItem('nexus-biblio-view', v) }

  const disciplinas = useMemo(() => [...new Set(materials.map(i => i.disciplina).filter(Boolean))].sort(), [materials])
  const todasTags = useMemo(() => [...new Set(materials.flatMap(i => i.tags ?? []))].sort(), [materials])
  const temFiltro = !!(busca || fCat || fDisc || fTag || soFav)

  // Contagem por pasta (materiais diretos + subpastas)
  const contarPasta = (fid: string) => ({
    mats: materials.filter(m => (m.folderId ?? null) === fid).length,
    subs: folders.filter(f => f.parentId === fid).length,
  })

  const passaFiltro = (i: BiblioItem) => {
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
  }
  const ordenar = (arr: BiblioItem[]) => [...arr].sort((a, b) => {
    if (sort === 'titulo') return a.titulo.localeCompare(b.titulo)
    if (sort === 'categoria') return a.categoria.localeCompare(b.categoria) || a.titulo.localeCompare(b.titulo)
    const ta = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0
    const tb = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0
    return tb - ta
  })

  // Com filtro/busca: resultados GLOBAIS (todas as pastas). Sem filtro: conteúdo da pasta atual.
  const subpastas = useMemo(() => folders.filter(f => f.parentId === pastaAtual).sort((a, b) => a.nome.localeCompare(b.nome)), [folders, pastaAtual])
  const materiaisMostrados = useMemo(() => {
    const base = temFiltro ? materials.filter(passaFiltro) : materials.filter(m => (m.folderId ?? null) === pastaAtual)
    return ordenar(base)
  }, [materials, temFiltro, pastaAtual, busca, fCat, fDisc, fTag, soFav, sort])

  const breadcrumb = caminhoPasta(folders, pastaAtual)
  const selItem = materiaisMostrados.find(i => i.id === sel) ?? materiaisMostrados[0] ?? null

  async function salvarMaterial(data: Omit<BiblioItem, 'id' | 'userId' | 'kind' | 'createdAt' | 'updatedAt'>, id?: string) {
    if (id) await updateMaterial(id, data); else await addMaterial(data)
  }
  function excluir(item: BiblioItem) {
    if (confirm(`Excluir "${item.titulo}"? Esta ação não pode ser desfeita.`)) removeMaterial(item.id)
  }
  function excluirPasta(f: BiblioFolder) {
    if (confirm(`Excluir a pasta "${f.nome}"? Os materiais e subpastas dentro dela serão movidos para o nível acima.`)) removeFolder(f)
  }
  const acoes = (item: BiblioItem) => ({
    onOpen: () => setVisor(item),
    onEdit: () => setModal({ open: true, item }),
    onDelete: () => excluir(item),
    onToggleFav: () => updateMaterial(item.id, { favorito: !item.favorito }),
  })
  const acoesPasta = (f: BiblioFolder) => ({
    onOpen: () => { setPastaAtual(f.id); setSel(null) },
    onEdit: () => setModalPasta({ open: true, pasta: f }),
    onDelete: () => excluirPasta(f),
  })

  const vazio = subpastas.length === 0 && materiaisMostrados.length === 0

  return (
    <div style={{ padding: '18px 20px 40px', maxWidth: 1400, margin: '0 auto' }}>
      <datalist id="disc-list">{disciplinas.map(d => <option key={d} value={d} />)}</datalist>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.5rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>📚 Biblioteca</div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>{materials.length} material(is) · {folders.length} pasta(s)</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setModalPasta({ open: true, pasta: null })} style={{ padding: '10px 16px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>📁 Nova pasta</button>
          <button onClick={() => setModal({ open: true, item: null })} style={{ ...btnVerde, padding: '10px 20px', borderRadius: 11, fontSize: '0.84rem', boxShadow: '0 6px 18px rgba(76,99,90,0.4)' }}>+ Adicionar material</button>
        </div>
      </div>

      {/* Breadcrumb */}
      {!temFiltro && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14, fontSize: '0.78rem' }}>
          <button onClick={() => { setPastaAtual(null); setSel(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: pastaAtual === null ? 'var(--text-primary)' : 'var(--text-accent)', fontWeight: 700, padding: 0 }}>📚 Biblioteca</button>
          {breadcrumb.map((f, i) => (
            <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--text-muted)' }}>/</span>
              <button onClick={() => { setPastaAtual(f.id); setSel(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: i === breadcrumb.length - 1 ? 'var(--text-primary)' : 'var(--text-accent)', fontWeight: 700, padding: 0 }}>{f.nome}</button>
            </span>
          ))}
        </div>
      )}

      {/* Controles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16, padding: 12, borderRadius: 14, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>🔍</span>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar em toda a biblioteca…" style={{ ...IS, paddingLeft: 32 }} />
        </div>
        <select value={fCat} onChange={e => setFCat(e.target.value)} style={{ ...IS, width: 'auto', minWidth: 130 }}>
          <option value="">Todas categorias</option>{CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fDisc} onChange={e => setFDisc(e.target.value)} style={{ ...IS, width: 'auto', minWidth: 120 }} disabled={!disciplinas.length}>
          <option value="">Todas disciplinas</option>{disciplinas.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={fTag} onChange={e => setFTag(e.target.value)} style={{ ...IS, width: 'auto', minWidth: 100 }} disabled={!todasTags.length}>
          <option value="">Todas tags</option>{todasTags.map(t => <option key={t} value={t}>#{t}</option>)}
        </select>
        <button onClick={() => setSoFav(f => !f)} style={{ padding: '9px 13px', borderRadius: 9, border: `1px solid ${soFav ? 'rgba(251,191,36,0.5)' : 'var(--border)'}`, background: soFav ? 'rgba(251,191,36,0.1)' : 'var(--surface)', color: soFav ? '#fbbf24' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{soFav ? '★' : '☆'} Favoritos</button>
        {temFiltro && <button onClick={() => { setBusca(''); setFCat(''); setFDisc(''); setFTag(''); setSoFav(false) }} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.74rem' }}>✕ Limpar</button>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={sort} onChange={e => setSort(e.target.value as SortMode)} style={{ ...IS, width: 'auto', fontSize: '0.76rem', padding: '8px 10px' }}>
            <option value="recente">↓ Recentes</option><option value="titulo">A–Z Título</option><option value="categoria">Categoria</option>
          </select>
          <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
            {([['quadro', '▦', 'Quadro'], ['lista', '☰', 'Lista'], ['ladoalado', '◫', 'Lado a lado']] as const).map(([id, ic, t]) => (
              <button key={id} onClick={() => setViewP(id)} title={t} style={{ padding: '6px 11px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '0.9rem', background: view === id ? 'linear-gradient(135deg,#647d72,#4c635a)' : 'transparent', color: view === id ? '#f3f7f4' : 'var(--text-muted)' }}>{ic}</button>
            ))}
          </div>
        </div>
      </div>

      {temFiltro && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 12 }}>🔎 Mostrando resultados de toda a biblioteca ({materiaisMostrados.length}). Limpe os filtros para navegar pelas pastas.</div>}

      {/* Conteúdo */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Carregando acervo…</div>
      ) : vazio ? (
        <div style={{ textAlign: 'center', padding: '70px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12, opacity: 0.6 }}>📚</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>{temFiltro ? 'Nenhum material encontrado' : (pastaAtual ? 'Pasta vazia' : 'Sua biblioteca está vazia')}</div>
          <div style={{ fontSize: '0.78rem', marginBottom: 18 }}>{temFiltro ? 'Ajuste os filtros.' : 'Crie pastas e adicione seus materiais em HTML.'}</div>
          {!temFiltro && <button onClick={() => setModal({ open: true, item: null })} style={{ ...btnVerde, padding: '10px 22px', borderRadius: 11, fontSize: '0.82rem' }}>+ Adicionar material</button>}
        </div>
      ) : view === 'ladoalado' ? (
        // Lado a lado: lista (pastas + materiais) à esquerda + prévia à direita
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 360px) 1fr', gap: 14, height: 'calc(100vh - 250px)', minHeight: 440 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto', paddingRight: 4 }}>
            {!temFiltro && subpastas.map(f => (
              <div key={f.id} onClick={() => { setPastaAtual(f.id); setSel(null) }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--border)', background: `linear-gradient(90deg, ${f.cor}12, var(--card-bg))` }}>
                <span style={{ fontSize: '1.2rem' }}>📁</span>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{f.nome}</div><div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{contarPasta(f.id).mats} material(is)</div></div>
                <span style={{ color: 'var(--text-muted)' }}>›</span>
              </div>
            ))}
            {materiaisMostrados.map(item => {
              const ativo = selItem?.id === item.id; const c = corDe(item.categoria)
              return (
                <div key={item.id} onClick={() => setSel(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${ativo ? `${c}70` : 'var(--border)'}`, background: ativo ? `${c}12` : 'var(--card-bg)' }}>
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
                <iframe title={selItem.titulo} sandbox="allow-scripts allow-same-origin" srcDoc={selItem.html} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />
              </>
            ) : <div style={{ margin: 'auto', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Selecione um material</div>}
          </div>
        </div>
      ) : view === 'quadro' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {!temFiltro && subpastas.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
              {subpastas.map(f => <CardPasta key={f.id} folder={f} count={contarPasta(f.id)} {...acoesPasta(f)} />)}
            </div>
          )}
          {materiaisMostrados.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
              {materiaisMostrados.map(item => <CardMaterial key={item.id} item={item} {...acoes(item)} />)}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!temFiltro && subpastas.map(f => <LinhaPasta key={f.id} folder={f} count={contarPasta(f.id)} {...acoesPasta(f)} />)}
          {materiaisMostrados.map(item => <LinhaMaterial key={item.id} item={item} {...acoes(item)} />)}
        </div>
      )}

      {modal.open && <ModalMaterial item={modal.item} folders={folders} folderAtual={pastaAtual} onClose={() => setModal({ open: false, item: null })} onSave={salvarMaterial} />}
      {modalPasta.open && <ModalPasta pasta={modalPasta.pasta} parentId={pastaAtual}
        onClose={() => setModalPasta({ open: false, pasta: null })}
        onSave={async (nome, cor) => { if (modalPasta.pasta) await updateFolder(modalPasta.pasta.id, { nome, cor }); else await addFolder(nome, cor, pastaAtual) }} />}
      {visor && <Visualizador item={visor} onClose={() => setVisor(null)}
        onEdit={() => { const it = visor; setVisor(null); setModal({ open: true, item: it }) }}
        onSaveHtml={async (html) => { await updateMaterial(visor.id, { html, tamanho: bytesDe(html) }) }} />}
    </div>
  )
}
