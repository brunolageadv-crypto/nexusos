// @ts-nocheck
/* ════════════════════════════════════════════════════════════════════════════
   NEXUS EDITOR · marcadores por teclado + conectores com janelas flutuantes
   ----------------------------------------------------------------------------
   A) MARCADORES POR TECLADO (useMarkerKeys)
      · Alt+M → transforma a linha atual num MARCADOR (símbolo + texto)
      · Enter num marcador → cria o próximo (mesmo nível)
      · Tab / Alt+Tab → desce / sobe nível (até 10 níveis)
      · Alt+N → troca o símbolo/ícone do marcador atual
      · Marcador com conteúdo abaixo pode ser RECOLHIDO (clique na frase; fica
        azul no hover quando há conteúdo); nasce recolhido; estado persiste no HTML

   B) CONECTORES (useConnectors) — Alt+B sobre uma palavra
      · Vincular a uma NOTA EXISTENTE → clicar no conector abre a nota numa
        JANELA FLUTUANTE (a nota principal NÃO fecha). A janela também tem
        "Abrir na edição completa".
      · Criar NOTA ADESIVA → conteúdo novo que mora DENTRO da nota principal
        (não vira documento). Tem título, é redimensionável e sem limite de texto.
        Mesmo assim APARECE NO GRAFO (via <div class="nx-embed-store">).
   ════════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

export const NX_ICONES = ['⭐', '❓', '📝', '📌', '💡', '✏️', '🔄', '🔗', '⚠️', '✅', '●', '▸', '■', '✔', '★']
const norm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const nid = () => 'e' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3)
const MAX_NIVEL = 9

export const NEXUS_EDITOR_CSS = `
  .nx-marker{ margin:2px 0; position:relative; }
  .nx-marker > .nx-marker-ico{ display:inline-block; min-width:20px; margin-right:6px; user-select:none; }
  .nx-marker > .nx-marker-txt{ outline:none; }
  .nx-marker[data-nx-haschildren="1"] > .nx-marker-txt{ cursor:pointer; }
  .nx-marker[data-nx-haschildren="1"]:hover > .nx-marker-txt{ color:#5b5bd6; }
  .nx-marker[data-nx-haschildren="1"] > .nx-marker-ico::after{ font-size:.72em; opacity:.55; margin-left:2px; }
  .nx-marker[data-nx-haschildren="1"][data-nx-collapsed="1"] > .nx-marker-ico::after{ content:'▸'; }
  .nx-marker[data-nx-haschildren="1"][data-nx-collapsed="0"] > .nx-marker-ico::after{ content:'▾'; }
  .nx-embed{ background:rgba(245,158,11,.12) !important; border-color:rgba(245,158,11,.30) !important; color:#b45309 !important; }
  .nx-win-body{ outline:none; }
  .nx-win-body:empty:before{ content:'Escreva aqui…'; color:var(--text-muted); }
`

/* ───────── helpers de DOM (marcadores) ───────── */
function blocosDoEditor(ed) { return Array.from(ed.children) }
function nivelDe(el) { return el?.dataset?.nxLevel != null ? Number(el.dataset.nxLevel) : null }
function ehMarcador(el) { return el?.classList?.contains?.('nx-marker') }
function filhosDoMarcador(ed, marker) {
  const L = Number(marker.dataset.nxLevel || 0)
  const irmaos = blocosDoEditor(ed); const i = irmaos.indexOf(marker); const out = []
  for (let j = i + 1; j < irmaos.length; j++) {
    const el = irmaos[j]; const nl = nivelDe(el)
    if (ehMarcador(el) && nl != null && nl <= L) break
    out.push(el)
  }
  return out
}
function recomputarMarcadores(ed) {
  if (!ed) return
  blocosDoEditor(ed).forEach((m) => {
    if (!ehMarcador(m)) return
    const filhos = filhosDoMarcador(ed, m)
    m.dataset.nxHaschildren = filhos.length ? '1' : '0'
    if (!filhos.length) { m.dataset.nxCollapsed = '0'; return }
    const oculto = m.dataset.nxCollapsed === '1'
    filhos.forEach((f) => { if (!f.classList?.contains('nx-embed-store')) f.style.display = oculto ? 'none' : '' })
  })
}
function marcadorNoCursor(ed) {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount) return null
  let n = sel.getRangeAt(0).startContainer
  while (n && n.parentElement && n.parentElement !== ed) n = n.parentElement
  const bloco = (n && n.parentElement === ed) ? n : null
  return bloco && ehMarcador(bloco) ? bloco : null
}
function blocoNoCursor(ed) {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount) return null
  let n = sel.getRangeAt(0).startContainer
  while (n && n.parentElement && n.parentElement !== ed) n = n.parentElement
  return (n && n.parentElement === ed) ? n : null
}
function aplicarNivel(m, L) { L = Math.max(0, Math.min(MAX_NIVEL, L)); m.dataset.nxLevel = String(L); m.style.paddingLeft = (L * 22) + 'px'; m.style.position = 'relative' }
function novoMarcador(doc, texto, level, icone) {
  const p = doc.createElement('p'); p.className = 'nx-marker'; p.dataset.nxCollapsed = '0'; p.dataset.nxHaschildren = '0'
  const ico = doc.createElement('span'); ico.className = 'nx-marker-ico'; ico.contentEditable = 'false'; ico.textContent = icone
  const txt = doc.createElement('span'); txt.className = 'nx-marker-txt'; txt.innerHTML = texto && texto.length ? texto : '​'
  p.appendChild(ico); p.appendChild(txt); aplicarNivel(p, level); return p
}
function focarFimDe(txtEl) { const sel = window.getSelection(); const r = document.createRange(); r.selectNodeContents(txtEl); r.collapse(false); sel.removeAllRanges(); sel.addRange(r) }

/* ═══════════════════════════ A) MARCADORES POR TECLADO ═══════════════════════════ */
export function useMarkerKeys({ editorRef, onChange }) {
  useEffect(() => {
    const ed = editorRef.current; if (!ed) return
    const transformarEmMarcador = () => {
      const bloco = blocoNoCursor(ed); if (!bloco || ehMarcador(bloco)) return
      const texto = bloco.innerHTML.replace(/<br\s*\/?>(\s*)$/i, '') || '​'
      const m = novoMarcador(document, texto, 0, NX_ICONES[0])
      bloco.replaceWith(m); focarFimDe(m.querySelector('.nx-marker-txt'))
      recomputarMarcadores(ed); onChange?.()
    }
    const ciclarSimbolo = () => {
      const m = marcadorNoCursor(ed); if (!m) return
      const ico = m.querySelector('.nx-marker-ico'); if (!ico) return
      const i = NX_ICONES.indexOf(ico.textContent); ico.textContent = NX_ICONES[(i + 1) % NX_ICONES.length]; onChange?.()
    }
    const mudarNivel = (delta) => {
      const m = marcadorNoCursor(ed); if (!m) return
      aplicarNivel(m, Number(m.dataset.nxLevel || 0) + delta); recomputarMarcadores(ed); onChange?.()
    }
    const enterNoMarcador = () => {
      const m = marcadorNoCursor(ed); if (!m) return false
      const L = Number(m.dataset.nxLevel || 0)
      const filhos = filhosDoMarcador(ed, m); const ref = filhos.length ? filhos[filhos.length - 1] : m
      const novo = novoMarcador(document, '', L, m.querySelector('.nx-marker-ico')?.textContent || NX_ICONES[0])
      ref.after(novo); focarFimDe(novo.querySelector('.nx-marker-txt')); recomputarMarcadores(ed); onChange?.(); return true
    }
    const onKey = (e) => {
      if (e.altKey && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); e.stopPropagation(); transformarEmMarcador(); return }
      if (e.altKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); e.stopPropagation(); ciclarSimbolo(); return }
      if (e.altKey && e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); mudarNivel(-1); return }
      if (e.key === 'Tab' && marcadorNoCursor(ed)) { e.preventDefault(); e.stopPropagation(); mudarNivel(e.shiftKey ? -1 : 1); return }
      if (e.key === 'Enter' && !e.shiftKey && marcadorNoCursor(ed)) { if (enterNoMarcador()) { e.preventDefault(); e.stopPropagation() } return }
    }
    const onClick = (e) => {
      const txt = e.target.closest?.('.nx-marker-txt'); if (!txt) return
      const m = txt.closest('.nx-marker'); if (!m || m.dataset.nxHaschildren !== '1') return
      const sel = window.getSelection(); if (sel && !sel.isCollapsed) return
      m.dataset.nxCollapsed = m.dataset.nxCollapsed === '1' ? '0' : '1'; recomputarMarcadores(ed); onChange?.()
    }
    ed.addEventListener('keydown', onKey); ed.addEventListener('click', onClick)
    const obs = new MutationObserver(() => recomputarMarcadores(ed)); obs.observe(ed, { childList: true, subtree: false })
    recomputarMarcadores(ed)
    return () => { ed.removeEventListener('keydown', onKey); ed.removeEventListener('click', onClick); obs.disconnect() }
  }, [editorRef, onChange])
}

/* ───────── palavra sob o cursor ───────── */
function rangeDaPalavra() {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount) return null
  const r = sel.getRangeAt(0)
  if (!sel.isCollapsed) return r.cloneRange()
  const node = r.startContainer; if (node.nodeType !== 3) return null
  const t = node.textContent || ''; let s = r.startOffset, e = r.startOffset
  while (s > 0 && /\S/.test(t[s - 1])) s--
  while (e < t.length && /\S/.test(t[e])) e++
  if (s === e) return null
  const rr = document.createRange(); rr.setStart(node, s); rr.setEnd(node, e); return rr
}

/* ───────── Janela flutuante (arrastável + redimensionável) ───────── */
function Janela({ title, subtitle, editableTitle, onTitle, initX, initY, initW, initH, onGeom, onClose, extra, children }) {
  const [pos, setPos] = useState({ x: initX, y: initY })
  const ref = useRef(null)
  const drag = useRef(null)
  const iniDrag = (e) => { drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }; e.preventDefault() }
  useEffect(() => {
    const mv = (e) => { const d = drag.current; if (!d) return; setPos({ x: Math.max(0, d.ox + e.clientX - d.sx), y: Math.max(0, d.oy + e.clientY - d.sy) }) }
    const up = () => { if (drag.current) { drag.current = null; salvarGeom() } }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
  })
  const salvarGeom = () => { const el = ref.current; if (el && onGeom) onGeom({ x: pos.x, y: pos.y, w: el.offsetWidth, h: el.offsetHeight }) }
  return createPortal(
    <div ref={ref} onMouseUp={salvarGeom}
      style={{ position: 'fixed', left: pos.x, top: pos.y, width: initW, height: initH, minWidth: 240, minHeight: 160, zIndex: 8500, display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.45)', overflow: 'hidden', resize: 'both' }}>
      <div onMouseDown={iniDrag} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', cursor: 'move', userSelect: 'none' }}>
        <span style={{ fontSize: '.9rem' }}>📝</span>
        {editableTitle
          ? <input value={title} onChange={(e) => onTitle?.(e.target.value)} onMouseDown={(e) => e.stopPropagation()} placeholder="Título da nota adesiva"
              style={{ flex: 1, border: '1px solid transparent', background: 'transparent', color: 'var(--text-primary)', fontWeight: 700, fontSize: '.84rem', padding: '3px 5px', borderRadius: 6, outline: 'none' }}
              onFocus={(e) => (e.target.style.border = '1px solid var(--border)')} onBlur={(e) => (e.target.style.border = '1px solid transparent')} />
          : <b style={{ flex: 1, fontSize: '.84rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</b>}
        {extra}
        <button onClick={onClose} title="Fechar" style={{ border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontWeight: 800, padding: '2px 8px' }}>✕</button>
      </div>
      {subtitle && <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', padding: '3px 10px', borderBottom: '1px solid var(--border)' }}>{subtitle}</div>}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
    </div>, document.body)
}

/* ═══════════════════════════ B) CONECTORES + JANELAS FLUTUANTES ═══════════════════════════ */
export function useConnectors({ editorRef, docs, salvarDoc, onOpenDocFull, onGotoPage, onChange }) {
  const [pop, setPop] = useState(null)      // popup do Alt+B
  const [janelas, setJanelas] = useState([]) // janelas flutuantes abertas
  const rangeRef = useRef(null)
  const docsRef = useRef(docs); useEffect(() => { docsRef.current = docs }, [docs])

  const abrirJanelaDoc = useCallback((id) => {
    setJanelas((js) => js.some((j) => j.kind === 'doc' && j.docId === id) ? js : [...js, { key: nid(), kind: 'doc', docId: id }])
  }, [])
  const abrirJanelaEmbed = useCallback((embedId) => {
    setJanelas((js) => js.some((j) => j.kind === 'embed' && j.embedId === embedId) ? js : [...js, { key: nid(), kind: 'embed', embedId }])
  }, [])
  const fechar = (key) => setJanelas((js) => js.filter((j) => j.key !== key))

  /* Alt+B → abre popup sobre a palavra */
  const abrir = useCallback(() => {
    const ed = editorRef.current; if (!ed) return
    const rr = rangeDaPalavra(); if (!rr) return
    rangeRef.current = rr
    const palavra = rr.toString().trim(); const rect = rr.getBoundingClientRect()
    setPop({ x: rect.left, y: rect.bottom + 6, palavra, busca: palavra, titulo: palavra })
  }, [editorRef])

  useEffect(() => {
    const ed = editorRef.current; if (!ed) return
    const onKey = (e) => { if (e.altKey && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); e.stopPropagation(); abrir() } }
    ed.addEventListener('keydown', onKey)
    return () => ed.removeEventListener('keydown', onKey)
  }, [editorRef, abrir])

  /* clique num conector → janela flutuante (nota existente) / adesiva (embed) / página / url */
  useEffect(() => {
    const ed = editorRef.current; if (!ed) return
    const onClick = (e) => {
      const a = e.target.closest?.('a.nx-wikilink'); if (!a) return
      e.preventDefault(); e.stopPropagation()
      const emb = a.getAttribute('data-embed'); const id = a.getAttribute('data-doc'); const pg = a.getAttribute('data-page'); const url = a.getAttribute('data-url')
      if (emb) abrirJanelaEmbed(emb)
      else if (id) abrirJanelaDoc(id)
      else if (pg) onGotoPage?.(Number(pg))
      else if (url) window.open(url, '_blank', 'noopener')
    }
    ed.addEventListener('click', onClick)
    return () => ed.removeEventListener('click', onClick)
  }, [editorRef, abrirJanelaEmbed, abrirJanelaDoc, onGotoPage])

  const linkarDoc = (docId, texto) => {
    const ed = editorRef.current; const r = rangeRef.current; if (!ed || !r) return
    const a = document.createElement('a'); a.className = 'nx-wikilink nx-connector'; a.contentEditable = 'false'; a.setAttribute('data-doc', docId); a.textContent = texto
    r.deleteContents(); r.insertNode(a)
    const sp = document.createTextNode(' '); a.parentNode.insertBefore(sp, a.nextSibling)
    const nr = document.createRange(); nr.setStartAfter(sp); nr.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(nr)
    onChange?.()
  }
  const criarEmbed = (titulo, texto) => {
    const ed = editorRef.current; const r = rangeRef.current; if (!ed || !r) return null
    const embedId = nid()
    const a = document.createElement('a'); a.className = 'nx-wikilink nx-embed'; a.contentEditable = 'false'
    a.setAttribute('data-embed', embedId); a.setAttribute('data-title', titulo); a.textContent = texto
    r.deleteContents(); r.insertNode(a)
    const sp = document.createTextNode(' '); a.parentNode.insertBefore(sp, a.nextSibling)
    // depósito oculto que guarda o conteúdo da nota adesiva (persiste no HTML → entra no grafo)
    const store = document.createElement('div'); store.className = 'nx-embed-store'; store.contentEditable = 'false'
    store.setAttribute('data-embed', embedId); store.setAttribute('data-title', titulo)
    store.setAttribute('data-w', '340'); store.setAttribute('data-h', '260')
    store.style.display = 'none'; store.innerHTML = ''
    ed.appendChild(store)
    onChange?.()
    return embedId
  }

  const escolherNota = (d) => { linkarDoc(d.id, pop.palavra); setPop(null) }
  const criar = () => { const t = (pop.titulo || pop.palavra || 'Nota').trim(); const id = criarEmbed(t, pop.palavra); setPop(null); if (id) abrirJanelaEmbed(id) }

  const sugestoes = useMemo(() => {
    if (!pop) return []
    const q = norm(pop.busca)
    return (docsRef.current || []).filter((d) => q ? norm(d.title || '').includes(q) : true).slice(0, 6)
  }, [pop])

  /* ───────── render: popup + janelas ───────── */
  const bd = { border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', borderRadius: 7, cursor: 'pointer', fontSize: '.74rem', fontWeight: 700, padding: '5px 10px' }
  const inp = { width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '.82rem' }

  const popup = pop ? createPortal(<>
    <div onMouseDown={() => setPop(null)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
    <div style={{ position: 'fixed', left: Math.min(pop.x, window.innerWidth - 340), top: Math.min(pop.y, window.innerHeight - 340), zIndex: 9999, width: 320, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,.4)', padding: 12 }}>
      <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginBottom: 6 }}>Conectar <b style={{ color: 'var(--text-primary)' }}>“{pop.palavra}”</b> a…</div>
      <div style={{ fontSize: '.64rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', margin: '4px 0 4px' }}>Nota existente (abre em janela flutuante)</div>
      <input autoFocus value={pop.busca} onChange={(e) => setPop((p) => ({ ...p, busca: e.target.value }))} placeholder="Buscar nota…" style={{ ...inp, marginBottom: 6 }} />
      <div style={{ maxHeight: 150, overflowY: 'auto' }}>
        {sugestoes.map((d) => (
          <div key={d.id} onMouseDown={(e) => { e.preventDefault(); escolherNota(d) }}
            style={{ padding: '7px 9px', borderRadius: 7, cursor: 'pointer', fontSize: '.82rem', color: 'var(--text-primary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>✦ {d.title || 'Sem título'}</div>
        ))}
        {sugestoes.length === 0 && <div style={{ padding: '6px 9px', fontSize: '.74rem', color: 'var(--text-muted)' }}>Nenhuma nota encontrada.</div>}
      </div>
      <div style={{ borderTop: '1px solid var(--border)', margin: '10px 0 8px' }} />
      <div style={{ fontSize: '.64rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', marginBottom: 4 }}>Nota adesiva (fica dentro desta nota · aparece no grafo)</div>
      <input value={pop.titulo} onChange={(e) => setPop((p) => ({ ...p, titulo: e.target.value }))} placeholder="Título da nota adesiva" style={{ ...inp, marginBottom: 6 }} />
      <button onMouseDown={(e) => { e.preventDefault(); criar() }} style={{ ...bd, width: '100%', background: '#f59e0b', color: '#fff', border: 'none' }}>📝 Criar nota adesiva</button>
    </div>
  </>, document.body) : null

  const overlay = <>
    {popup}
    {janelas.map((j) => j.kind === 'doc'
      ? <JanelaDoc key={j.key} docId={j.docId} docs={docsRef.current} salvarDoc={salvarDoc} onOpenDocFull={onOpenDocFull} onClose={() => fechar(j.key)} />
      : <JanelaEmbed key={j.key} embedId={j.embedId} editorRef={editorRef} onChange={onChange} onClose={() => fechar(j.key)} />)}
  </>

  return { overlay }
}

/* janela flutuante de NOTA EXISTENTE (documento) — editável, não fecha a principal */
function JanelaDoc({ docId, docs, salvarDoc, onOpenDocFull, onClose }) {
  const d = (docs || []).find((x) => x.id === docId)
  const bodyRef = useRef(null); const t = useRef(null)
  useEffect(() => { if (bodyRef.current) bodyRef.current.innerHTML = d?.html || '<p><br></p>' }, [docId])
  const salvar = () => { clearTimeout(t.current); t.current = setTimeout(() => salvarDoc?.(docId, bodyRef.current?.innerHTML || ''), 900) }
  return (
    <Janela title={d?.title || 'Nota'} initX={Math.min(window.innerWidth - 400, 160 + Math.random() * 120)} initY={90 + Math.random() * 80} initW={380} initH={300} onClose={onClose}
      extra={<button onMouseDown={(e) => { e.preventDefault(); onOpenDocFull?.(docId); onClose?.() }} title="Abrir na edição completa" style={{ border: '1px solid var(--border)', background: '#5b5bd6', color: '#fff', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '.68rem', padding: '3px 7px' }}>✦ Edição completa</button>}>
      <div ref={bodyRef} contentEditable suppressContentEditableWarning onInput={salvar}
        style={{ padding: '10px 12px', outline: 'none', color: 'var(--text-primary)', fontSize: '.86rem', lineHeight: 1.6, minHeight: '100%' }} />
    </Janela>
  )
}

/* janela flutuante de NOTA ADESIVA (embed) — conteúdo vive no HTML da nota principal */
function JanelaEmbed({ embedId, editorRef, onChange, onClose }) {
  const store = editorRef.current?.querySelector(`.nx-embed-store[data-embed="${embedId}"]`)
  const [titulo, setTitulo] = useState(store?.getAttribute('data-title') || 'Nota')
  const bodyRef = useRef(null); const t = useRef(null)
  useEffect(() => { if (bodyRef.current && store) bodyRef.current.innerHTML = store.innerHTML || '' }, [embedId])
  const salvarCorpo = () => {
    const s = editorRef.current?.querySelector(`.nx-embed-store[data-embed="${embedId}"]`); if (!s) return
    s.innerHTML = bodyRef.current?.innerHTML || ''
    clearTimeout(t.current); t.current = setTimeout(() => onChange?.(), 700)
  }
  const salvarTitulo = (v) => {
    setTitulo(v)
    const ed = editorRef.current; if (!ed) return
    const s = ed.querySelector(`.nx-embed-store[data-embed="${embedId}"]`); if (s) s.setAttribute('data-title', v)
    ed.querySelectorAll(`a.nx-embed[data-embed="${embedId}"]`).forEach((a) => a.setAttribute('data-title', v))
    onChange?.()
  }
  const geom = (g) => {
    const s = editorRef.current?.querySelector(`.nx-embed-store[data-embed="${embedId}"]`); if (!s) return
    s.setAttribute('data-w', String(g.w)); s.setAttribute('data-h', String(g.h)); onChange?.()
  }
  const iw = Number(store?.getAttribute('data-w')) || 340
  const ih = Number(store?.getAttribute('data-h')) || 260
  return (
    <Janela title={titulo} editableTitle onTitle={salvarTitulo} subtitle="Nota adesiva — vive dentro da nota principal e aparece no grafo"
      initX={Math.min(window.innerWidth - iw - 20, 200 + Math.random() * 120)} initY={110 + Math.random() * 70} initW={iw} initH={ih} onGeom={geom} onClose={onClose}>
      <div ref={bodyRef} className="nx-win-body" contentEditable suppressContentEditableWarning onInput={salvarCorpo}
        style={{ padding: '10px 12px', outline: 'none', color: 'var(--text-primary)', fontSize: '.86rem', lineHeight: 1.6, minHeight: '100%' }} />
    </Janela>
  )
}
