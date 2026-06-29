import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'
import { callLLM3D, iaConfigurada } from '../projetos3d/ai3d'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clean<T extends object>(o: T): T { return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T }
function nid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4) }
function escapeHtml(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function stripHtml(h: string): string { const d = document.createElement('div'); d.innerHTML = h; return (d.textContent || '').replace(/\s+/g, ' ').trim() }

// Detecção local de pergunta/resposta (vários formatos comuns)
const QRE = /^\s*(perguntas?|quest(ão|ao|ion)?|p|q)\s*[:.)\-]\s+/i
const ARE = /^\s*(respostas?|resp|answer|gabarito|r|a)\s*[:.)\-]\s+/i
function parseQA(text: string): { p: string; r: string }[] {
  const linhas = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  if (!linhas.length) return []
  const pares: { p: string; r: string }[] = []
  const temMarc = linhas.some(l => QRE.test(l) || ARE.test(l))
  let cur: { p: string; r: string } | null = null
  if (temMarc) {
    let modo: 'p' | 'r' = 'p'
    for (const l of linhas) {
      if (QRE.test(l)) { if (cur) pares.push(cur); cur = { p: l.replace(QRE, '').trim(), r: '' }; modo = 'p' }
      else if (ARE.test(l)) { if (!cur) cur = { p: '', r: '' }; cur.r = (cur.r ? cur.r + ' ' : '') + l.replace(ARE, '').trim(); modo = 'r' }
      else if (cur) { if (modo === 'p') cur.p += ' ' + l; else cur.r += ' ' + l }
      else cur = { p: l, r: '' }
    }
  } else {
    for (const l of linhas) {
      if (/\?\s*$/.test(l)) { if (cur) pares.push(cur); cur = { p: l, r: '' } }
      else if (cur) cur.r = (cur.r ? cur.r + ' ' : '') + l
      else cur = { p: l, r: '' }
    }
  }
  if (cur) pares.push(cur)
  return pares.filter(x => x.p.trim())
}
function blocosDePares(pares: { p: string; r: string }[], nivelBase = 0): Bloco[] {
  const out: Bloco[] = []
  for (const par of pares) {
    out.push({ ...blocoVazio(nivelBase), html: `<b>${escapeHtml(par.p.trim())}</b>`, aberto: !par.r.trim() })
    if (par.r.trim()) out.push({ ...blocoVazio(nivelBase + 1), html: escapeHtml(par.r.trim()), cor: 'verde' })
  }
  return out
}
function promptQA(t: string): string {
  return `Abaixo há um texto com perguntas e respostas misturadas. Separe-o em pares pergunta/resposta. Responda APENAS com um array JSON válido, sem nenhum texto antes ou depois, no formato [{"p":"pergunta","r":"resposta"}]. Se houver algo que seja claramente só pergunta sem resposta, deixe "r" como string vazia. Preserve o conteúdo, não invente. Texto:\n\n${t}`
}
function parseJSONpares(raw: string): { p: string; r: string }[] {
  let s = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim()
  const m = s.match(/\[[\s\S]*\]/); if (m) s = m[0]
  try { const arr = JSON.parse(s); return Array.isArray(arr) ? arr.map((x: any) => ({ p: String(x.p || x.pergunta || '').trim(), r: String(x.r || x.resposta || '').trim() })).filter(x => x.p) : [] } catch { return [] }
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Pasta { id: string; nome: string; parent: string; cor: string; criadoEm: number }
interface Bloco { id: string; html: string; nivel: number; aberto: boolean; cor: string }
interface DocT { id: string; pasta: string; titulo: string; cor: string; blocos: Bloco[]; updatedAt: number }

const PALETA = ['#7c3aed', '#0891b2', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#64748b']
const COR_BLOCO: Record<string, string> = { '': 'transparent', amarelo: 'rgba(245,158,11,0.14)', verde: 'rgba(16,185,129,0.14)', azul: 'rgba(14,165,233,0.14)', roxo: 'rgba(124,58,237,0.14)', rosa: 'rgba(236,72,153,0.14)', vermelho: 'rgba(239,68,68,0.14)' }
const CORES_BLOCO = ['', 'amarelo', 'verde', 'azul', 'roxo', 'rosa', 'vermelho']

function blocoVazio(nivel = 0): Bloco { return { id: nid(), html: '', nivel, aberto: true, cor: '' } }

// ═══════════════════════════════════════════════════════════════════════════
export default function ToggleNotion({ open, onClose }: { open: boolean; onClose: () => void }) {
  const uid = useUid()
  const [pastas, setPastas] = useState<Pasta[]>([])
  const [docs, setDocs] = useState<DocT[]>([])
  const [abertas, setAbertas] = useState<Record<string, boolean>>({})
  const [docId, setDocId] = useState<string>('')
  const [doc_, setDoc_] = useState<DocT | null>(null)
  const [iaBusy, setIaBusy] = useState(false)

  // janela
  const [pos, setPos] = useState({ x: 80, y: 60 })
  const [size, setSize] = useState({ w: Math.min(1100, window.innerWidth - 120), h: Math.min(720, window.innerHeight - 120) })
  const [max, setMax] = useState(false)
  const drag = useRef<{ ox: number; oy: number } | null>(null)
  const rez = useRef<{ ow: number; oh: number; px: number; py: number } | null>(null)

  // ── Firestore ──
  useEffect(() => {
    if (!open || !uid || !db) return
    const u1 = onSnapshot(collection(db, 'users', uid, 'toggle_pastas'), s => setPastas(s.docs.map(d => ({ ...(d.data() as Pasta), id: d.id }))))
    const u2 = onSnapshot(collection(db, 'users', uid, 'toggle_docs'), s => setDocs(s.docs.map(d => { const x = d.data() as DocT; return { id: d.id, pasta: x.pasta || '', titulo: x.titulo || '', cor: x.cor || '', blocos: x.blocos || [], updatedAt: x.updatedAt || 0 } })))
    return () => { u1(); u2() }
  }, [open, uid])

  // carrega doc selecionado
  useEffect(() => { const d = docs.find(x => x.id === docId); if (d) setDoc_(JSON.parse(JSON.stringify(d))) ; else setDoc_(null) }, [docId])

  // autosave (debounce)
  const saveT = useRef<any>(null)
  function salvarDoc(d: DocT) {
    setDoc_(d)
    if (!uid || !db) return
    clearTimeout(saveT.current)
    saveT.current = setTimeout(() => { setDoc(doc(db, 'users', uid, 'toggle_docs', d.id), clean({ ...d, updatedAt: Date.now() })) }, 600)
  }

  // ── Pastas/Docs CRUD ──
  async function novaPasta(parent: string) {
    if (!uid || !db) return
    const nome = window.prompt(parent ? 'Nome da subpasta:' : 'Nome da pasta:'); if (!nome) return
    const id = nid(); await setDoc(doc(db, 'users', uid, 'toggle_pastas', id), clean({ id, nome, parent, cor: PALETA[pastas.length % PALETA.length], criadoEm: Date.now() }))
    setAbertas(a => ({ ...a, [parent]: true }))
  }
  async function renomearPasta(p: Pasta) { if (!uid || !db) return; const nome = window.prompt('Renomear:', p.nome); if (!nome) return; await setDoc(doc(db, 'users', uid, 'toggle_pastas', p.id), clean({ ...p, nome })) }
  async function corPasta(p: Pasta) { if (!uid || !db) return; const i = PALETA.indexOf(p.cor); await setDoc(doc(db, 'users', uid, 'toggle_pastas', p.id), clean({ ...p, cor: PALETA[(i + 1) % PALETA.length] })) }
  async function excluirPasta(p: Pasta) {
    if (!uid || !db) return
    const filhas = pastas.filter(x => x.parent === p.id).length, arqs = docs.filter(x => x.pasta === p.id).length
    if (!window.confirm(`Excluir "${p.nome}"${filhas || arqs ? ` e tudo dentro (${filhas} subpasta(s), ${arqs} arquivo(s))` : ''}?`)) return
    const apagarRec = async (pid: string) => { for (const sub of pastas.filter(x => x.parent === pid)) await apagarRec(sub.id); for (const dd of docs.filter(x => x.pasta === pid)) await deleteDoc(doc(db!, 'users', uid, 'toggle_docs', dd.id)); await deleteDoc(doc(db!, 'users', uid, 'toggle_pastas', pid)) }
    await apagarRec(p.id)
  }
  async function novoArquivo(pastaId: string) {
    if (!uid || !db) return
    const titulo = window.prompt('Nome do arquivo:') || 'Sem título'
    const id = nid(); const novo: DocT = { id, pasta: pastaId, titulo, cor: '', blocos: [blocoVazio()], updatedAt: Date.now() }
    await setDoc(doc(db, 'users', uid, 'toggle_docs', id), clean(novo)); setAbertas(a => ({ ...a, [pastaId]: true })); setDocId(id)
  }
  async function excluirArquivo(d: DocT) { if (!uid || !db) return; if (!window.confirm(`Excluir o arquivo "${d.titulo}"?`)) return; await deleteDoc(doc(db, 'users', uid, 'toggle_docs', d.id)); if (docId === d.id) { setDocId(''); setDoc_(null) } }

  // ── Operações de blocos (lista plana com nível) ──
  const blocos = doc_?.blocos || []
  const setBlocos = (bs: Bloco[]) => { if (doc_) salvarDoc({ ...doc_, blocos: bs }) }
  const temFilhos = (i: number) => i < blocos.length - 1 && blocos[i + 1].nivel > blocos[i].nivel

  function editar(i: number, html: string) { const bs = blocos.slice(); bs[i] = { ...bs[i], html }; setBlocos(bs) }
  function novoApos(i: number) { const bs = blocos.slice(); bs.splice(i + 1, 0, blocoVazio(bs[i]?.nivel || 0)); setBlocos(bs); setTimeout(() => focar(bs[i + 1].id), 30) }
  function indentar(i: number, dir: 1 | -1) { if (i === 0 && dir === 1) return; const bs = blocos.slice(); const max = i > 0 ? bs[i - 1].nivel + 1 : 0; let n = bs[i].nivel + dir; n = Math.max(0, Math.min(n, dir === 1 ? max : 6)); bs[i] = { ...bs[i], nivel: n }; setBlocos(bs); setTimeout(() => focar(bs[i].id), 10) }
  function apagar(i: number) { if (blocos.length <= 1) { const bs = [blocoVazio()]; setBlocos(bs); return } const bs = blocos.slice(); bs.splice(i, 1); setBlocos(bs); setTimeout(() => focar(bs[Math.max(0, i - 1)].id), 10) }
  function alternar(i: number) { const bs = blocos.slice(); bs[i] = { ...bs[i], aberto: !bs[i].aberto }; setBlocos(bs) }
  function corBloco(i: number) { const bs = blocos.slice(); const idx = CORES_BLOCO.indexOf(bs[i].cor); bs[i] = { ...bs[i], cor: CORES_BLOCO[(idx + 1) % CORES_BLOCO.length] }; setBlocos(bs) }
  function colarMulti(i: number, linhas: string[]) { const bs = blocos.slice(); const nv = bs[i].nivel; const novos = linhas.map(l => ({ ...blocoVazio(nv), html: escapeHtml(l) })); bs.splice(i + (bs[i].html ? 1 : 0), bs[i].html ? 0 : 1, ...novos); setBlocos(bs) }
  // colar com detecção automática de pergunta→resposta (resposta aninhada e oculta)
  function colarInteligente(i: number, texto: string) {
    const pares = parseQA(texto)
    if (pares.length && pares.some(p => p.r.trim())) {
      const bs = blocos.slice(); const novos = blocosDePares(pares, bs[i].nivel)
      bs.splice(i + (bs[i].html ? 1 : 0), bs[i].html ? 0 : 1, ...novos); setBlocos(bs)
    } else {
      colarMulti(i, texto.split(/\r?\n/).map(s => s.trim()).filter(Boolean))
    }
  }
  // reorganizar TODO o arquivo em pares pergunta/resposta com IA (perguntas com resposta oculta)
  async function organizarIA() {
    if (!doc_ || iaBusy) return
    const texto = blocos.map(b => stripHtml(b.html)).filter(Boolean).join('\n')
    if (!texto.trim()) { alert('Sem conteúdo para organizar.'); return }
    if (!iaConfigurada()) { alert('Configure a IA (Gemini) — a mesma do PDF Reader.'); return }
    setIaBusy(true)
    try {
      const raw = await callLLM3D(promptQA(texto))
      const pares = parseJSONpares(raw)
      if (!pares.length) throw new Error('Não consegui identificar pares pergunta/resposta.')
      salvarDoc({ ...doc_, blocos: blocosDePares(pares, 0) })
    } catch (e: any) { alert('IA: ' + (e?.message || e)) }
    setIaBusy(false)
  }
  function focar(id: string) { const el = document.querySelector(`[data-bloco="${id}"]`) as HTMLElement | null; if (el) { el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r) } }

  // visibilidade (collapse): pula descendentes de blocos fechados
  const visiveis = useMemo(() => {
    const out: number[] = []; let corte = -1
    blocos.forEach((b, i) => { if (corte >= 0) { if (b.nivel > corte) return; corte = -1 } out.push(i); if (!b.aberto && i < blocos.length - 1 && blocos[i + 1].nivel > b.nivel) corte = b.nivel })
    return out
  }, [blocos])

  // ── Janela: mover / redimensionar ──
  useEffect(() => {
    const mm = (e: MouseEvent) => {
      if (drag.current) setPos({ x: Math.max(0, e.clientX - drag.current.ox), y: Math.max(0, e.clientY - drag.current.oy) })
      if (rez.current) setSize({ w: Math.max(560, rez.current.ow + (e.clientX - rez.current.px)), h: Math.max(360, rez.current.oh + (e.clientY - rez.current.py)) })
    }
    const mu = () => { drag.current = null; rez.current = null }
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu)
    return () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu) }
  }, [])

  if (!open) return null

  const arvore = (parent: string, depth: number): React.ReactNode => pastas.filter(p => p.parent === parent).sort((a, b) => a.nome.localeCompare(b.nome)).map(p => {
    const aberta = abertas[p.id]
    const arqs = docs.filter(d => d.pasta === p.id).sort((a, b) => a.titulo.localeCompare(b.titulo))
    const subs = pastas.filter(x => x.parent === p.id).length
    return (
      <div key={p.id} style={{ marginLeft: depth ? 12 : 0 }}>
        <div className="tg-row" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 7, cursor: 'pointer' }}>
          <span onClick={() => setAbertas(a => ({ ...a, [p.id]: !a[p.id] }))} style={{ width: 14, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.7rem' }}>{(subs || arqs.length) ? (aberta ? '▾' : '▸') : '·'}</span>
          <span onClick={() => corPasta(p)} title="cor" style={{ width: 9, height: 9, borderRadius: '50%', background: p.cor, flexShrink: 0, cursor: 'pointer' }} />
          <span onClick={() => setAbertas(a => ({ ...a, [p.id]: !a[p.id] }))} onDoubleClick={() => renomearPasta(p)} style={{ flex: 1, fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</span>
          <span className="tg-act" style={{ display: 'flex', gap: 2 }}>
            <button onClick={() => novoArquivo(p.id)} title="Novo arquivo" style={miniBtn}>📄</button>
            <button onClick={() => novaPasta(p.id)} title="Nova subpasta" style={miniBtn}>📁</button>
            <button onClick={() => excluirPasta(p)} title="Excluir" style={miniBtn}>🗑️</button>
          </span>
        </div>
        {aberta && (
          <div style={{ marginLeft: 14 }}>
            {arqs.map(d => (
              <div key={d.id} className="tg-row" onClick={() => setDocId(d.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 7, cursor: 'pointer', background: docId === d.id ? 'var(--surface)' : 'transparent' }}>
                <span style={{ fontSize: '.78rem' }}>📄</span>
                <span style={{ flex: 1, fontSize: '.8rem', color: docId === d.id ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: docId === d.id ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.titulo || 'Sem título'}</span>
                <button className="tg-act" onClick={e => { e.stopPropagation(); excluirArquivo(d) }} style={miniBtn}>🗑️</button>
              </div>
            ))}
            {arvore(p.id, depth + 1)}
          </div>
        )}
      </div>
    )
  })

  const winStyle: React.CSSProperties = max
    ? { position: 'fixed', inset: 8, zIndex: 9700 }
    : { position: 'fixed', left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex: 9700 }

  return createPortal(<>
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9699, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }} />
    <div style={{ ...winStyle, display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 16, boxShadow: '0 40px 100px rgba(0,0,0,0.55)', overflow: 'hidden' }}>
      <style>{`
        .tg-row .tg-act{opacity:0;transition:opacity .15s}
        .tg-row:hover .tg-act{opacity:1}
        .tg-row:hover{background:var(--surface)}
        .tg-blk .tg-bact{opacity:0;transition:opacity .15s}
        .tg-blk:hover .tg-bact{opacity:1}
        .tg-ed:empty:before{content:attr(data-ph);color:var(--text-muted);opacity:.6}
      `}</style>
      {/* barra de título */}
      <div onMouseDown={e => { if (!max) drag.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y } }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'linear-gradient(135deg,rgba(124,58,237,0.14),rgba(8,145,178,0.06))', borderBottom: '1px solid var(--border)', cursor: max ? 'default' : 'move', userSelect: 'none' }}>
        <span style={{ fontSize: '1.05rem' }}>🔀</span>
        <b style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-primary)' }}>Toggle</b>
        <span style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>blocos aninhados · estilo Notion</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setMax(m => !m)} title={max ? 'Restaurar' : 'Maximizar'} style={winBtn}>{max ? '🗗' : '🗖'}</button>
        <button onClick={onClose} title="Fechar" style={{ ...winBtn, color: '#ef4444' }}>✕</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* sidebar de pastas */}
        <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg-1)' }}>
          <div style={{ display: 'flex', gap: 6, padding: 10, borderBottom: '1px solid var(--border)' }}>
            <button onClick={() => novaPasta('')} style={{ flex: 1, ...softBtn }}>+ Pasta</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {pastas.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: '.78rem', textAlign: 'center', padding: 20 }}>Crie uma pasta para começar.</div> : arvore('', 0)}
          </div>
        </div>

        {/* editor */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {!doc_ ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.4rem' }}>🔀</div>
              <div style={{ fontSize: '.86rem' }}>Selecione ou crie um arquivo.</div>
              <div style={{ fontSize: '.72rem', maxWidth: 360, textAlign: 'center' }}>Cada bloco pode esconder outros dentro dele. Use <b>Tab</b> para aninhar, <b>Enter</b> para novo bloco, e o <b>▾</b> para recolher/expandir.</div>
            </div>
          ) : (<>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
              <input value={doc_.titulo} onChange={e => salvarDoc({ ...doc_, titulo: e.target.value })} placeholder="Título do arquivo" style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }} />
              <button onClick={organizarIA} disabled={iaBusy} title="Identifica perguntas e respostas e aninha as respostas (ocultas) dentro de cada pergunta" style={{ ...softBtn, background: 'linear-gradient(135deg,#7c3aed,#5b5bd6)', color: '#fff', border: 'none', opacity: iaBusy ? 0.6 : 1 }}>{iaBusy ? '⏳ Organizando…' : '✨ Organizar P/R com IA'}</button>
              <button onClick={() => { const bs = blocos.concat(blocoVazio(0)); setBlocos(bs); setTimeout(() => focar(bs[bs.length - 1].id), 30) }} style={softBtn}>+ Bloco</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
              {visiveis.map(i => {
                const b = blocos[i]; const filhos = temFilhos(i)
                return (
                  <div key={b.id} className="tg-blk" style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginLeft: b.nivel * 22, padding: '2px 4px', borderRadius: 7, background: COR_BLOCO[b.cor] || 'transparent' }}>
                    <button onClick={() => filhos && alternar(i)} title={filhos ? (b.aberto ? 'Recolher' : 'Expandir') : ''} style={{ ...caret, color: filhos ? 'var(--text-secondary)' : 'transparent', cursor: filhos ? 'pointer' : 'default' }}>{b.aberto ? '▾' : '▸'}</button>
                    <span style={{ color: 'var(--text-muted)', fontSize: '.5rem', marginTop: 9 }}>●</span>
                    <div
                      data-bloco={b.id} className="tg-ed" data-ph="Escreva… (Tab aninha, Enter novo)"
                      contentEditable suppressContentEditableWarning
                      ref={el => { if (el && el.innerHTML !== b.html && document.activeElement !== el) el.innerHTML = b.html }}
                      onInput={e => editar(i, (e.currentTarget as HTMLElement).innerHTML)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); novoApos(i) }
                        else if (e.key === 'Tab') { e.preventDefault(); indentar(i, e.shiftKey ? -1 : 1) }
                        else if (e.key === 'Backspace' && (e.currentTarget as HTMLElement).innerHTML === '') { e.preventDefault(); apagar(i) }
                        else if (e.key === 'b' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); document.execCommand('bold') }
                      }}
                      onPaste={e => { const t = e.clipboardData.getData('text/plain'); if (t && t.includes('\n')) { e.preventDefault(); colarInteligente(i, t) } }}
                      style={{ flex: 1, outline: 'none', fontSize: '.9rem', lineHeight: 1.55, color: 'var(--text-primary)', minHeight: 22, padding: '2px 4px', wordBreak: 'break-word' }}
                    />
                    <span className="tg-bact" style={{ display: 'flex', gap: 1, marginTop: 2 }}>
                      <button onClick={() => corBloco(i)} title="Cor" style={miniBtn}>🎨</button>
                      <button onClick={() => indentar(i, 1)} title="Aninhar" style={miniBtn}>⇥</button>
                      <button onClick={() => apagar(i)} title="Excluir" style={miniBtn}>🗑️</button>
                    </span>
                  </div>
                )
              })}
            </div>
          </>)}
        </div>
      </div>

      {/* alça de redimensionar */}
      {!max && <div onMouseDown={e => { rez.current = { ow: size.w, oh: size.h, px: e.clientX, py: e.clientY } }} style={{ position: 'absolute', right: 0, bottom: 0, width: 18, height: 18, cursor: 'nwse-resize', background: 'linear-gradient(135deg,transparent 45%,var(--text-muted) 45%,var(--text-muted) 55%,transparent 55%)', opacity: 0.5 }} />}
    </div>
  </>, document.body)
}

const miniBtn: React.CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '.74rem', padding: '1px 3px', borderRadius: 5, lineHeight: 1 }
const winBtn: React.CSSProperties = { border: 'none', background: 'var(--surface)', cursor: 'pointer', fontSize: '.8rem', width: 28, height: 26, borderRadius: 7, color: 'var(--text-secondary)' }
const softBtn: React.CSSProperties = { border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '.76rem', fontWeight: 700, padding: '6px 10px', borderRadius: 8 }
const caret: React.CSSProperties = { border: 'none', background: 'transparent', fontSize: '.7rem', width: 16, marginTop: 4, padding: 0 }
