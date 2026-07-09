// @ts-nocheck
/* ════════════════════════════════════════════════════════════════════════════
   NEXUS LINKS · camada de conexões estilo Obsidian para o PDF Reader
   ----------------------------------------------------------------------------
   Recursos (autocontidos, zero dependências externas — só React + SVG/Canvas):

     1) LINKS [[wiki]] + BACKLINKS
        · Sintaxe [[Título]] com autocompletar ao digitar "[["
        · Links para outros documentos, para páginas do PDF ([[página 42]]) e
          para URLs externas ([[http...]])
        · Links clicáveis dentro do editor (contentEditable)
        · Painel lateral com: links de saída, backlinks (quem cita este doc),
          contador de referências e navegação bidirecional

     2) GRAFO DE CONECTORES (SVG force-directed, sem D3)
        · Nó por documento; tamanho ∝ nº de conexões; cor = cor da pasta
        · Global (tudo) e Local (nó atual + vizinhos)
        · Zoom (scroll), pan (arrastar fundo), arrastar/fixar nós
        · Filtro por texto, modo foco (destaca caminhos), tooltip
        · Linha sólida = mesma pasta · tracejada = pasta diferente (int/ext)
        · Espessura ∝ força (nº de citações) · exportar PNG e SVG

     3) MODOS DE VISUALIZAÇÃO + EXPANDIR/RECOLHER (no painel de conexões)
        · Compacto / Detalhado / Completo · Expandir todos / Recolher todos
        · Estado lembrado por sessão (localStorage) · atalho Ctrl+M

   Uso: import { useWikiLinks, ConexoesPanel, GrafoConectores, WIKILINK_CSS } from './NexusLinks'
   ════════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

/* ───────────────────────────── helpers ───────────────────────────── */
const escapeHtml = (s = '') => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const stripHtml = (h = '') => { const d = document.createElement('div'); d.innerHTML = h; return (d.textContent || '').replace(/\s+/g, ' ').trim() }
const norm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export const WIKILINK_CSS = `
  .nx-wikilink{color:#5b5bd6;background:rgba(91,91,214,.10);border-radius:5px;padding:0 4px;
    text-decoration:none;font-weight:600;cursor:pointer;white-space:nowrap;border:1px solid rgba(91,91,214,.22)}
  .nx-wikilink:hover{background:rgba(91,91,214,.22);text-decoration:underline}
  .nx-wikilink[data-page]{color:#0891b2;background:rgba(8,145,178,.10);border-color:rgba(8,145,178,.22)}
  .nx-wikilink[data-url]{color:#16a34a;background:rgba(22,163,74,.10);border-color:rgba(22,163,74,.22)}
`

export function extrairLinks(html = '') {
  const out = { docIds: new Set(), titulos: new Set(), pages: [], urls: [], embeds: [] }
  if (!html) return out
  const d = document.createElement('div'); d.innerHTML = html
  d.querySelectorAll('a.nx-wikilink').forEach((a) => {
    const id = a.getAttribute('data-doc'); const pg = a.getAttribute('data-page'); const url = a.getAttribute('data-url')
    if (id) out.docIds.add(id)
    else if (pg) out.pages.push(Number(pg))
    else if (url) out.urls.push(url)
    else { const t = (a.textContent || '').replace(/^\[\[|\]\]$/g, '').trim(); if (t) out.titulos.add(norm(t)) }
  })
  d.querySelectorAll('.nx-embed-store').forEach((s) => { const id = s.getAttribute('data-embed'); const t = s.getAttribute('data-title') || 'Nota'; if (id) out.embeds.push({ id, title: t }) })
  const texto = stripHtml(html)
  let m; const re = /\[\[([^\]]+)\]\]/g
  while ((m = re.exec(texto))) {
    const alvo = m[1].trim()
    if (/^p(á|a)gina\s+\d+/i.test(alvo)) out.pages.push(Number(alvo.replace(/\D+/g, '')))
    else if (/^https?:\/\//i.test(alvo)) out.urls.push(alvo)
    else out.titulos.add(norm(alvo))
  }
  return out
}

export function construirGrafo(docs = [], pastas = []) {
  const porId = new Map(docs.map((d) => [d.id, d]))
  const porTitulo = new Map()
  docs.forEach((d) => { const t = norm(d.title || ''); if (t && !porTitulo.has(t)) porTitulo.set(t, d.id) })
  const corPasta = (folderId) => { const p = pastas.find((x) => x.id === folderId); return p?.cor || '#94a3b8' }

  const nodes = docs.map((d) => ({ id: d.id, title: d.title || 'Sem título', folderId: d.folderId ?? null, cor: corPasta(d.folderId), grau: 0 }))
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const edgeKey = new Map()

  docs.forEach((d) => {
    const L = extrairLinks(d.html || '')
    const alvos = new Set()
    L.docIds.forEach((id) => { if (porId.has(id)) alvos.add(id) })
    L.titulos.forEach((t) => { const id = porTitulo.get(t); if (id && id !== d.id) alvos.add(id) })
    alvos.forEach((to) => {
      if (to === d.id) return
      const k = d.id + '|' + to
      edgeKey.set(k, (edgeKey.get(k) || 0) + 1)
    })
  })

  const edges = []
  edgeKey.forEach((peso, k) => {
    const [from, to] = k.split('|')
    const nf = nodeMap.get(from), nt = nodeMap.get(to)
    if (!nf || !nt) return
    nf.grau++; nt.grau++
    edges.push({ from, to, peso, cross: (nf.folderId ?? null) !== (nt.folderId ?? null) })
  })
  // nós de notas adesivas (embeds) — cada uma vira um nó ligado ao seu documento
  docs.forEach((d) => {
    const L = extrairLinks(d.html || '')
    ;(L.embeds || []).forEach((em) => {
      const eid = 'emb:' + em.id
      let ne = nodeMap.get(eid)
      if (!ne) { ne = { id: eid, title: em.title || 'Nota', folderId: d.folderId ?? null, cor: corPasta(d.folderId), grau: 0, kind: 'embed', parent: d.id }; nodes.push(ne); nodeMap.set(eid, ne) }
      const nd = nodeMap.get(d.id); if (nd) { nd.grau++; ne.grau++; edges.push({ from: d.id, to: eid, peso: 1, cross: false, embed: true }) }
    })
  })
  return { nodes, edges, nodeMap }
}

export function calcularBacklinks(docId, docs = []) {
  if (!docId) return []
  const alvo = docs.find((d) => d.id === docId); const alvoTit = norm(alvo?.title || '')
  return docs.filter((d) => {
    if (d.id === docId) return false
    const L = extrairLinks(d.html || '')
    return L.docIds.has(docId) || (alvoTit && L.titulos.has(alvoTit))
  })
}

/* ═══════════════════════════ 1) HOOK: wiki-links no editor ═══════════════════════════ */
export function useWikiLinks({ editorRef, docs, onOpenDoc, onGotoPage, onChange }) {
  const [pop, setPop] = useState(null)
  const docsRef = useRef(docs); useEffect(() => { docsRef.current = docs }, [docs])
  const rangeRef = useRef(null)

  const sugestoes = useMemo(() => {
    if (!pop) return []
    const q = norm(pop.query)
    const base = (docsRef.current || []).map((d) => ({ tipo: 'doc', id: d.id, label: d.title || 'Sem título' }))
    const extras = []
    if (/^p/i.test(pop.query) || /\d/.test(pop.query)) {
      const n = Number((pop.query.match(/\d+/) || [])[0])
      if (n) extras.push({ tipo: 'page', page: n, label: `página ${n}` })
    }
    if (/^https?:\/\//i.test(pop.query)) extras.push({ tipo: 'url', url: pop.query, label: pop.query })
    const filtrados = q ? base.filter((s) => norm(s.label).includes(q)) : base
    return [...extras, ...filtrados].slice(0, 8)
  }, [pop])

  const inserirLink = useCallback((s) => {
    const ed = editorRef.current; if (!ed) return
    const r = rangeRef.current
    const a = document.createElement('a')
    a.className = 'nx-wikilink'; a.contentEditable = 'false'
    if (s.tipo === 'doc') { a.setAttribute('data-doc', s.id); a.textContent = `[[${s.label}]]` }
    else if (s.tipo === 'page') { a.setAttribute('data-page', String(s.page)); a.textContent = `[[página ${s.page}]]` }
    else { a.setAttribute('data-url', s.url); a.textContent = `[[${s.label}]]` }
    if (r) {
      r.deleteContents(); r.insertNode(a)
      const space = document.createTextNode(' ')
      a.parentNode.insertBefore(space, a.nextSibling)
      const nr = document.createRange(); nr.setStartAfter(space); nr.collapse(true)
      const selc = window.getSelection(); selc.removeAllRanges(); selc.addRange(nr)
    } else { ed.appendChild(a) }
    setPop(null); rangeRef.current = null
    ed.focus(); onChange?.()
  }, [editorRef, onChange])

  const detectar = useCallback(() => {
    const ed = editorRef.current; if (!ed) return
    const sel = window.getSelection(); if (!sel || !sel.rangeCount) { setPop(null); return }
    const r = sel.getRangeAt(0); if (!r.collapsed) { setPop(null); return }
    const node = r.startContainer; if (node.nodeType !== 3) { setPop(null); return }
    const texto = node.textContent.slice(0, r.startOffset)
    const m = texto.match(/\[\[([^\[\]]*)$/)
    if (!m) { setPop(null); return }
    const start = r.startOffset - m[0].length
    const rr = document.createRange(); rr.setStart(node, start); rr.setEnd(node, r.startOffset)
    rangeRef.current = rr
    const rect = rr.getBoundingClientRect()
    setPop({ x: rect.left, y: rect.bottom + 4, query: m[1], sel: 0 })
  }, [editorRef])

  const abrirInsercao = useCallback(() => {
    const ed = editorRef.current; if (!ed) return
    ed.focus()
    const sel = window.getSelection(); if (!sel || !sel.rangeCount) return
    const r = sel.getRangeAt(0)
    r.deleteContents(); const t = document.createTextNode('[['); r.insertNode(t)
    const nr = document.createRange(); nr.setStartAfter(t); nr.collapse(true)
    sel.removeAllRanges(); sel.addRange(nr)
    detectar()
  }, [editorRef, detectar])

  useEffect(() => {
    const ed = editorRef.current; if (!ed) return
    const onInput = () => detectar()
    ed.addEventListener('input', onInput)
    return () => { ed.removeEventListener('input', onInput) }
  }, [editorRef, detectar])

  useEffect(() => {
    if (!pop) return
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setPop(null); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setPop((p) => p && ({ ...p, sel: Math.min((p.sel || 0) + 1, sugestoes.length - 1) })); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPop((p) => p && ({ ...p, sel: Math.max((p.sel || 0) - 1, 0) })); return }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (sugestoes.length) { e.preventDefault(); inserirLink(sugestoes[pop.sel || 0]) }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [pop, sugestoes, inserirLink])

  const overlay = pop && sugestoes.length ? createPortal(
    <div style={{ position: 'fixed', left: Math.min(pop.x, window.innerWidth - 300), top: pop.y, zIndex: 9999, width: 280, maxHeight: 260, overflowY: 'auto', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 14px 40px rgba(0,0,0,.35)', padding: 5 }}>
      <div style={{ fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', padding: '4px 8px' }}>Vincular a…</div>
      {sugestoes.map((s, i) => (
        <div key={i} onMouseDown={(e) => { e.preventDefault(); inserirLink(s) }} onMouseEnter={() => setPop((p) => p && ({ ...p, sel: i }))}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', borderRadius: 7, cursor: 'pointer', fontSize: '.82rem', color: 'var(--text-primary)', background: (pop.sel || 0) === i ? 'var(--surface)' : 'transparent' }}>
          <span>{s.tipo === 'page' ? '📄' : s.tipo === 'url' ? '🔗' : '✦'}</span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
        </div>
      ))}
    </div>, document.body) : null

  return { overlay, inserirLink: abrirInsercao }
}

/* ═══════════════════════════ 2) PAINEL DE CONEXÕES + MODOS DE VISUALIZAÇÃO ═══════════════════════════ */
const VIEWKEY = 'nexus_pr_notes_view'
const preview = (html, linhas = 3) => { const t = stripHtml(html); return t.length > linhas * 60 ? t.slice(0, linhas * 60) + '…' : t }

export function ConexoesPanel({ docs, pastas, docId, onClose, onOpenDoc, onAbrirGrafo }) {
  const [modo, setModo] = useState(() => { try { return localStorage.getItem(VIEWKEY) || 'detalhado' } catch { return 'detalhado' } })
  const [exp, setExp] = useState({})
  const setModoP = (m) => { setModo(m); try { localStorage.setItem(VIEWKEY, m) } catch {} }

  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); const ordem = ['compacto', 'detalhado', 'completo']; setModoP(ordem[(ordem.indexOf(modo) + 1) % 3]) } }
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey)
  }, [modo])

  const backlinks = useMemo(() => calcularBacklinks(docId, docs), [docId, docs])
  const docAtual = docs.find((d) => d.id === docId)
  const saidas = useMemo(() => {
    if (!docAtual) return { docs: [], pages: [], urls: [] }
    const L = extrairLinks(docAtual.html || '')
    const porTitulo = new Map(docs.map((d) => [norm(d.title || ''), d]))
    const alvo = new Map()
    L.docIds.forEach((id) => { const d = docs.find((x) => x.id === id); if (d) alvo.set(d.id, d) })
    L.titulos.forEach((t) => { const d = porTitulo.get(t); if (d && d.id !== docId) alvo.set(d.id, d) })
    return { docs: [...alvo.values()], pages: [...new Set(L.pages)], urls: [...new Set(L.urls)] }
  }, [docAtual, docs, docId])

  const arvore = useMemo(() => {
    const grupos = [{ id: null, name: '(Raiz)', cor: '#94a3b8' }, ...pastas]
    return grupos.map((g) => ({ pasta: g, docs: docs.filter((d) => (d.folderId ?? null) === (g.id ?? null)) })).filter((x) => x.docs.length)
  }, [docs, pastas])

  const expandirTodos = () => { const o = {}; arvore.forEach((g) => { o[g.pasta.id ?? '__root'] = true }); setExp(o) }
  const recolherTodos = () => { const o = {}; arvore.forEach((g) => { o[g.pasta.id ?? '__root'] = false }); setExp(o) }
  const toggleF = (id) => setExp((e) => ({ ...e, [id ?? '__root']: !(e[id ?? '__root'] ?? true) }))

  const refCount = (d) => calcularBacklinks(d.id, docs).length
  const btnMini = { border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: '.68rem', padding: '2px 6px', fontWeight: 700 }

  const Item = ({ d }) => (
    <div onClick={() => onOpenDoc?.(d.id)} className="nx-noterow" style={{ padding: modo === 'compacto' ? '3px 8px' : '6px 8px', borderRadius: 7, cursor: 'pointer', background: d.id === docId ? 'var(--surface)' : 'transparent' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: '.78rem', fontWeight: d.id === docId ? 700 : 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>✦ {d.title || 'Sem título'}</span>
        {refCount(d) > 0 && <span title="referências recebidas" style={{ fontSize: '.6rem', fontWeight: 800, color: '#5b5bd6', background: 'rgba(91,91,214,.12)', borderRadius: 6, padding: '0 5px' }}>🔗{refCount(d)}</span>}
      </div>
      {modo === 'detalhado' && <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: 2, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{preview(d.html)}</div>}
      {modo === 'completo' && <div style={{ fontSize: '.7rem', color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.45 }} dangerouslySetInnerHTML={{ __html: d.html || '<i style="opacity:.5">vazio</i>' }} />}
    </div>
  )

  return createPortal(
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(360px, 92vw)', zIndex: 47, background: 'var(--card-bg)', borderLeft: '1px solid var(--border)', boxShadow: '-12px 0 40px rgba(0,0,0,.30)', display: 'flex', flexDirection: 'column' }}>
      <style>{`.nx-noterow:hover{background:var(--surface)!important}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <b style={{ fontSize: '.86rem', color: 'var(--text-primary)' }}>🔗 Conexões</b>
        <span style={{ flex: 1 }} />
        <button onClick={onAbrirGrafo} title="Abrir grafo (Ctrl+G)" style={{ ...btnMini, background: '#5b5bd6', color: '#fff', border: 'none', padding: '3px 8px' }}>🕸 Grafo</button>
        <button onClick={onClose} title="Fechar" style={btnMini}>✕</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 10px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', borderRadius: 8, padding: 2 }}>
          {[['compacto', 'Compacto'], ['detalhado', 'Detalhado'], ['completo', 'Completo']].map(([m, l]) => (
            <button key={m} onClick={() => setModoP(m)} title={`${l} (Ctrl+M)`} style={{ border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '.68rem', fontWeight: 700, padding: '3px 8px', background: modo === m ? '#5b5bd6' : 'transparent', color: modo === m ? '#fff' : 'var(--text-secondary)' }}>{l}</button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <button onClick={expandirTodos} title="Expandir todos" style={btnMini}>▼</button>
        <button onClick={recolherTodos} title="Recolher todos" style={btnMini}>▶</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8 }}>
        {docAtual && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '.64rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', margin: '4px 6px' }}>Documento atual · {docAtual.title || 'Sem título'}</div>
            <div style={{ fontSize: '.66rem', fontWeight: 800, color: 'var(--text-secondary)', margin: '8px 6px 3px' }}>➜ Links de saída ({saidas.docs.length + saidas.pages.length + saidas.urls.length})</div>
            {saidas.docs.length + saidas.pages.length + saidas.urls.length === 0 && <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', padding: '2px 8px' }}>Nenhum. Digite <code>[[</code> no editor para criar.</div>}
            {saidas.docs.map((d) => <Item key={d.id} d={d} />)}
            {saidas.pages.map((pg) => <div key={'p' + pg} style={{ padding: '4px 8px', fontSize: '.76rem', color: '#0891b2' }}>📄 página {pg}</div>)}
            {saidas.urls.map((u, i) => <a key={'u' + i} href={u} target="_blank" rel="noopener" style={{ display: 'block', padding: '4px 8px', fontSize: '.72rem', color: '#16a34a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🔗 {u}</a>)}

            <div style={{ fontSize: '.66rem', fontWeight: 800, color: 'var(--text-secondary)', margin: '10px 6px 3px' }}>⬅ Backlinks ({backlinks.length})</div>
            {backlinks.length === 0 && <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', padding: '2px 8px' }}>Nenhum documento cita este ainda.</div>}
            {backlinks.map((d) => <Item key={d.id} d={d} />)}
          </div>
        )}

        <div style={{ fontSize: '.64rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', margin: '4px 6px' }}>Todas as notas ({docs.length})</div>
        {arvore.map((g) => {
          const open = exp[g.pasta.id ?? '__root'] ?? true
          return (
            <div key={g.pasta.id ?? '__root'} style={{ marginBottom: 4 }}>
              <div onClick={() => toggleF(g.pasta.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', cursor: 'pointer', fontSize: '.74rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                <span style={{ width: 10 }}>{open ? '▾' : '▸'}</span>
                <span style={{ color: g.pasta.cor || '#EAB308' }}>📁</span>
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.pasta.name}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '.66rem' }}>({g.docs.length})</span>
              </div>
              {open && <div style={{ paddingLeft: 12 }}>{g.docs.map((d) => <Item key={d.id} d={d} />)}</div>}
            </div>
          )
        })}
      </div>
    </div>, document.body)
}

/* ═══════════════════════════ 3) GRAFO DE CONECTORES (SVG force-directed) ═══════════════════════════ */
export function GrafoConectores({ docs, pastas, docId, onClose, onOpenDoc }) {
  const { nodes, edges } = useMemo(() => construirGrafo(docs, pastas), [docs, pastas])
  const [escopo, setEscopo] = useState('global')
  const [filtro, setFiltro] = useState('')
  const [foco, setFoco] = useState(null)
  const svgRef = useRef(null)
  const posRef = useRef(new Map())
  const [, force] = useState(0)
  const viewRef = useRef({ k: 1, x: 0, y: 0 })
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const dragRef = useRef(null)
  const W = 900, H = 620

  const { vnodes, vedges } = useMemo(() => {
    if (escopo === 'local' && docId) {
      const viz = new Set([docId])
      edges.forEach((e) => { if (e.from === docId) viz.add(e.to); if (e.to === docId) viz.add(e.from) })
      return { vnodes: nodes.filter((n) => viz.has(n.id)), vedges: edges.filter((e) => viz.has(e.from) && viz.has(e.to)) }
    }
    return { vnodes: nodes, vedges: edges }
  }, [escopo, docId, nodes, edges])

  useEffect(() => {
    const p = posRef.current
    vnodes.forEach((n, i) => { if (!p.has(n.id)) { const a = (i / Math.max(1, vnodes.length)) * Math.PI * 2; p.set(n.id, { x: W / 2 + Math.cos(a) * 180 + (Math.random() - .5) * 40, y: H / 2 + Math.sin(a) * 180 + (Math.random() - .5) * 40, vx: 0, vy: 0 }) } })
  }, [vnodes])

  useEffect(() => {
    let raf, iter = 0
    const step = () => {
      const p = posRef.current
      const ns = vnodes
      for (let i = 0; i < ns.length; i++) {
        const a = p.get(ns[i].id); if (!a) continue
        for (let j = i + 1; j < ns.length; j++) {
          const b = p.get(ns[j].id); if (!b) continue
          let dx = a.x - b.x, dy = a.y - b.y; let d2 = dx * dx + dy * dy || 0.01
          const f = 2600 / d2; const d = Math.sqrt(d2)
          const ux = dx / d, uy = dy / d
          a.vx += ux * f; a.vy += uy * f; b.vx -= ux * f; b.vy -= uy * f
        }
      }
      vedges.forEach((e) => {
        const a = p.get(e.from), b = p.get(e.to); if (!a || !b) return
        let dx = b.x - a.x, dy = b.y - a.y; const d = Math.sqrt(dx * dx + dy * dy) || 0.01
        const f = (d - 90) * 0.012; const ux = dx / d, uy = dy / d
        a.vx += ux * f; a.vy += uy * f; b.vx -= ux * f; b.vy -= uy * f
      })
      ns.forEach((n) => {
        const a = p.get(n.id); if (!a) return
        if (a.fx != null) { a.x = a.fx; a.y = a.fy; a.vx = 0; a.vy = 0; return }
        a.vx += (W / 2 - a.x) * 0.002; a.vy += (H / 2 - a.y) * 0.002
        a.vx *= 0.82; a.vy *= 0.82
        a.x += a.vx; a.y += a.vy
      })
      force((t) => t + 1)
      iter++
      if (iter < 480) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [vnodes, vedges])

  const onWheel = (e) => {
    e.preventDefault()
    const v = viewRef.current
    const scale = e.deltaY < 0 ? 1.12 : 0.89
    const rect = svgRef.current.getBoundingClientRect()
    const mx = (e.clientX - rect.left - v.x) / v.k, my = (e.clientY - rect.top - v.y) / v.k
    const nk = Math.max(0.2, Math.min(4, v.k * scale))
    v.x -= mx * (nk - v.k); v.y -= my * (nk - v.k); v.k = nk
    setView({ ...v })
  }
  const onDown = (e, id) => {
    if (id) { dragRef.current = { id }; const a = posRef.current.get(id); if (a) { a.fx = a.x; a.fy = a.y } }
    else dragRef.current = { pan: true, sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y }
  }
  const onMove = (e) => {
    const dr = dragRef.current; if (!dr) return
    const rect = svgRef.current.getBoundingClientRect(); const v = viewRef.current
    if (dr.id) { const a = posRef.current.get(dr.id); if (a) { a.fx = (e.clientX - rect.left - v.x) / v.k; a.fy = (e.clientY - rect.top - v.y) / v.k; force((t) => t + 1) } }
    else if (dr.pan) { v.x = dr.ox + (e.clientX - dr.sx); v.y = dr.oy + (e.clientY - dr.sy); setView({ ...v }) }
  }
  const onUp = () => { const dr = dragRef.current; if (dr?.id) { const a = posRef.current.get(dr.id); if (a) { a.fx = null; a.fy = null } } dragRef.current = null }

  const filtroN = norm(filtro)
  const conjFoco = useMemo(() => {
    if (!foco) return null
    const s = new Set([foco]); vedges.forEach((e) => { if (e.from === foco) s.add(e.to); if (e.to === foco) s.add(e.from) }); return s
  }, [foco, vedges])

  const raio = (n) => 6 + Math.min(18, n.grau * 2.2)
  const p = posRef.current

  const exportarSVG = () => {
    const svg = svgRef.current; if (!svg) return
    const clone = svg.cloneNode(true)
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'grafo-conexoes.svg'; a.click(); URL.revokeObjectURL(url)
  }
  const exportarPNG = () => {
    const svg = svgRef.current; if (!svg) return
    const clone = svg.cloneNode(true); clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const data = new XMLSerializer().serializeToString(clone)
    const img = new Image()
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#0b0f19'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.scale(2, 2); ctx.drawImage(img, 0, 0)
      cv.toBlob((b) => { const url = URL.createObjectURL(b); const a = document.createElement('a'); a.href = url; a.download = 'grafo-conexoes.png'; a.click(); URL.revokeObjectURL(url) })
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)))
  }

  const bd = { border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', borderRadius: 7, cursor: 'pointer', fontSize: '.72rem', fontWeight: 700, padding: '4px 9px' }
  return createPortal(<>
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 8000 }} />
    <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 8001, width: 'min(960px,95vw)', height: 'min(720px,92vh)', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 70px rgba(0,0,0,.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <b style={{ fontSize: '.92rem', color: 'var(--text-primary)' }}>🕸 Grafo de Conectores</b>
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', borderRadius: 8, padding: 2 }}>
          {[['global', 'Global'], ['local', 'Local']].map(([m, l]) => (
            <button key={m} onClick={() => setEscopo(m)} disabled={m === 'local' && !docId} style={{ border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '.7rem', fontWeight: 700, padding: '3px 10px', background: escopo === m ? '#5b5bd6' : 'transparent', color: escopo === m ? '#fff' : 'var(--text-secondary)', opacity: (m === 'local' && !docId) ? .4 : 1 }}>{l}</button>
          ))}
        </div>
        <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por título…" style={{ padding: '5px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '.76rem', width: 160 }} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>{vnodes.length} nós · {vedges.length} conexões</span>
        <button onClick={exportarPNG} style={bd}>⬇ PNG</button>
        <button onClick={exportarSVG} style={bd}>⬇ SVG</button>
        <button onClick={onClose} style={bd}>✕</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: 'radial-gradient(circle at 50% 40%, #141a2b, #0b0f19)' }}>
        {vnodes.length === 0 && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9aa4bf', fontSize: '.85rem', textAlign: 'center', padding: 20 }}>Nenhuma nota para exibir.<br />Crie documentos e conecte-os com <code style={{ color: '#a5b4fc' }}>[[links]]</code>.</div>}
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" onWheel={onWheel}
          onMouseDown={(e) => onDown(e, null)} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          style={{ cursor: dragRef.current?.pan ? 'grabbing' : 'grab', display: 'block' }}>
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {vedges.map((e, i) => {
              const a = p.get(e.from), b = p.get(e.to); if (!a || !b) return null
              const inFoco = !conjFoco || (conjFoco.has(e.from) && conjFoco.has(e.to))
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={e.cross ? '#f59e0b' : '#5b6b9a'} strokeWidth={Math.min(4, 1 + e.peso * 0.7)}
                strokeDasharray={e.cross ? '5 4' : undefined} strokeOpacity={inFoco ? 0.75 : 0.12} />
            })}
            {vnodes.map((n) => {
              const a = p.get(n.id); if (!a) return null
              const match = !filtroN || norm(n.title).includes(filtroN)
              const inFoco = !conjFoco || conjFoco.has(n.id)
              const op = (match && inFoco) ? 1 : 0.18
              const r = raio(n)
              return (
                <g key={n.id} transform={`translate(${a.x},${a.y})`} style={{ cursor: 'pointer' }} opacity={op}
                  onMouseDown={(e) => { e.stopPropagation(); onDown(e, n.id) }}
                  onClick={(e) => { e.stopPropagation(); setFoco((f) => f === n.id ? null : n.id) }}
                  onDoubleClick={(e) => { e.stopPropagation(); onOpenDoc?.(n.kind === 'embed' ? n.parent : n.id); onClose?.() }}>
                  <title>{`${n.title} — ${n.grau} conexão(ões)`}</title>
                  <circle r={r} fill={n.kind === 'embed' ? '#f59e0b' : n.cor} strokeDasharray={n.kind === 'embed' ? '3 2' : undefined} stroke={n.id === docId ? '#fff' : (foco === n.id ? '#fde047' : 'rgba(255,255,255,.35)')} strokeWidth={n.id === docId || foco === n.id ? 2.5 : 1} />
                  <text x={0} y={r + 12} textAnchor="middle" fontSize={11} fill="#dbe2f5" style={{ pointerEvents: 'none', userSelect: 'none' }}>{n.title.length > 22 ? n.title.slice(0, 21) + '…' : n.title}</text>
                </g>
              )
            })}
          </g>
        </svg>
        <div style={{ position: 'absolute', left: 12, bottom: 12, background: 'rgba(11,15,25,.8)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: '8px 11px', fontSize: '.66rem', color: '#c7cfe6', lineHeight: 1.7 }}>
          <div><span style={{ display: 'inline-block', width: 22, borderTop: '2px solid #5b6b9a', verticalAlign: 'middle', marginRight: 6 }} /> Mesma pasta (interno)</div>
          <div><span style={{ display: 'inline-block', width: 22, borderTop: '2px dashed #f59e0b', verticalAlign: 'middle', marginRight: 6 }} /> Pasta diferente (externo)</div>
          <div style={{ opacity: .8, marginTop: 3 }}>Clique = foco · Duplo-clique = abrir · Scroll = zoom</div>
        </div>
      </div>
    </div>
  </>, document.body)
}
