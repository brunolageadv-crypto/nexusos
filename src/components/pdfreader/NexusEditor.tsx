// @ts-nocheck
/* ════════════════════════════════════════════════════════════════════════════
   NEXUS EDITOR · edição avançada de marcadores + conexões rápidas (Obsidian/Word)
   ----------------------------------------------------------------------------
   Recursos (autocontidos; ligados ao contentEditable do PDF Reader):

   A) MARCADORES POR TECLADO (useMarkerKeys)
      · Alt+M  → transforma a linha atual num MARCADOR (símbolo + texto)
      · Enter num marcador → cria o próximo marcador (mesmo nível) automaticamente
      · Tab / Alt+Tab → desce / sobe um nível na hierarquia (até 10 níveis)
      · Alt+N  → troca o símbolo/ícone do marcador atual (cicla a coleção)
      · Marcador com conteúdo abaixo (níveis mais fundos) pode ser RECOLHIDO:
          - clique na frase abre/fecha (toggle)
          - ao passar o mouse, a frase fica AZUL se houver conteúdo dentro
          - nasce recolhido; o estado fica salvo no próprio HTML (persistente)

   B) CONEXÃO RÁPIDA (useQuickLink)
      · Alt+B sobre uma palavra → abre um POP-UP para:
          - vincular a uma NOTA EXISTENTE (busca), ou
          - criar uma NOTA RÁPIDA e escrever o conteúdo ali mesmo
      · Em ambos os casos o pop-up permite "Abrir na edição" a nota referenciada
      · O link vira <a class="nx-wikilink" data-doc="ID"> → entra AUTOMATICAMENTE
        no grafo de conectores (mesma convenção do NexusLinks)
   ════════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

/* coleção de ícones dos marcadores (categorias do spec + bullets) */
export const NX_ICONES = ['⭐', '❓', '📝', '📌', '💡', '✏️', '🔄', '🔗', '⚠️', '✅', '●', '▸', '■', '✔', '★']
const norm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const MAX_NIVEL = 9  // 10 níveis (0..9)

export const NEXUS_EDITOR_CSS = `
  .nx-marker{ margin:2px 0; position:relative; }
  .nx-marker > .nx-marker-ico{ display:inline-block; min-width:20px; margin-right:6px; user-select:none; }
  .nx-marker > .nx-marker-txt{ outline:none; }
  .nx-marker[data-nx-haschildren="1"] > .nx-marker-txt{ cursor:pointer; }
  .nx-marker[data-nx-haschildren="1"]:hover > .nx-marker-txt{ color:#5b5bd6; }
  .nx-marker[data-nx-haschildren="1"] > .nx-marker-ico::after{ font-size:.72em; opacity:.55; margin-left:2px; }
  .nx-marker[data-nx-haschildren="1"][data-nx-collapsed="1"] > .nx-marker-ico::after{ content:'▸'; }
  .nx-marker[data-nx-haschildren="1"][data-nx-collapsed="0"] > .nx-marker-ico::after{ content:'▾'; }
`

/* ───────── helpers de DOM sobre os filhos diretos do editor ───────── */
function blocosDoEditor(ed) { return Array.from(ed.children) }
function nivelDe(el) { return el?.dataset?.nxLevel != null ? Number(el.dataset.nxLevel) : null }
function ehMarcador(el) { return el?.classList?.contains?.('nx-marker') }

/* filhos de um marcador = irmãos seguintes até o próximo marcador de nível <= L */
function filhosDoMarcador(ed, marker) {
  const L = Number(marker.dataset.nxLevel || 0)
  const irmaos = blocosDoEditor(ed)
  const i = irmaos.indexOf(marker)
  const out = []
  for (let j = i + 1; j < irmaos.length; j++) {
    const el = irmaos[j]
    const nl = nivelDe(el)
    if (ehMarcador(el) && nl != null && nl <= L) break
    out.push(el)
  }
  return out
}

/* recalcula data-nx-haschildren e reaplica visibilidade conforme collapsed */
function recomputarMarcadores(ed) {
  if (!ed) return
  const blocos = blocosDoEditor(ed)
  blocos.forEach((m) => {
    if (!ehMarcador(m)) return
    const filhos = filhosDoMarcador(ed, m)
    m.dataset.nxHaschildren = filhos.length ? '1' : '0'
    if (!filhos.length) { m.dataset.nxCollapsed = '0'; return }
    const oculto = m.dataset.nxCollapsed === '1'
    filhos.forEach((f) => { f.style.display = oculto ? 'none' : '' })
  })
}

/* acha o marcador que contém o cursor (subindo do container até o filho direto do editor) */
function marcadorNoCursor(ed) {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount) return null
  let n = sel.getRangeAt(0).startContainer
  while (n && n.parentElement && n.parentElement !== ed) n = n.parentElement
  const bloco = (n && n.parentElement === ed) ? n : null
  return bloco && ehMarcador(bloco) ? bloco : null
}
/* bloco (filho direto do editor) que contém o cursor — marcador ou não */
function blocoNoCursor(ed) {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount) return null
  let n = sel.getRangeAt(0).startContainer
  while (n && n.parentElement && n.parentElement !== ed) n = n.parentElement
  return (n && n.parentElement === ed) ? n : null
}

function aplicarNivel(m, L) {
  L = Math.max(0, Math.min(MAX_NIVEL, L))
  m.dataset.nxLevel = String(L)
  m.style.paddingLeft = (L * 22) + 'px'
  m.style.position = 'relative'
}

/* cria o elemento de marcador com ícone + texto */
function novoMarcador(doc, texto, level, icone) {
  const p = doc.createElement('p')
  p.className = 'nx-marker'
  p.dataset.nxCollapsed = '0'
  p.dataset.nxHaschildren = '0'
  const ico = doc.createElement('span')
  ico.className = 'nx-marker-ico'; ico.contentEditable = 'false'; ico.textContent = icone
  const txt = doc.createElement('span')
  txt.className = 'nx-marker-txt'
  txt.innerHTML = texto && texto.length ? texto : '​'
  p.appendChild(ico); p.appendChild(txt)
  aplicarNivel(p, level)
  return p
}

function focarFimDe(txtEl) {
  const sel = window.getSelection(); const r = document.createRange()
  r.selectNodeContents(txtEl); r.collapse(false)
  sel.removeAllRanges(); sel.addRange(r)
}

/* ═══════════════════════════ A) MARCADORES POR TECLADO ═══════════════════════════ */
export function useMarkerKeys({ editorRef, onChange }) {
  useEffect(() => {
    const ed = editorRef.current; if (!ed) return

    const transformarEmMarcador = () => {
      const bloco = blocoNoCursor(ed); if (!bloco) return
      if (ehMarcador(bloco)) return
      const texto = bloco.innerHTML.replace(/<br\s*\/?>(\s*)$/i, '') || '​'
      const m = novoMarcador(document, texto, 0, NX_ICONES[0])
      bloco.replaceWith(m)
      focarFimDe(m.querySelector('.nx-marker-txt'))
      recomputarMarcadores(ed); onChange?.()
    }

    const ciclarSimbolo = () => {
      const m = marcadorNoCursor(ed); if (!m) return
      const ico = m.querySelector('.nx-marker-ico'); if (!ico) return
      const i = NX_ICONES.indexOf(ico.textContent)
      ico.textContent = NX_ICONES[(i + 1) % NX_ICONES.length]
      onChange?.()
    }

    const mudarNivel = (delta) => {
      const m = marcadorNoCursor(ed); if (!m) return
      aplicarNivel(m, Number(m.dataset.nxLevel || 0) + delta)
      recomputarMarcadores(ed); onChange?.()
    }

    const enterNoMarcador = () => {
      const m = marcadorNoCursor(ed); if (!m) return false
      const L = Number(m.dataset.nxLevel || 0)
      // insere o novo marcador após a subárvore do marcador atual
      const filhos = filhosDoMarcador(ed, m)
      const ref = filhos.length ? filhos[filhos.length - 1] : m
      const novo = novoMarcador(document, '', L, m.querySelector('.nx-marker-ico')?.textContent || NX_ICONES[0])
      ref.after(novo)
      focarFimDe(novo.querySelector('.nx-marker-txt'))
      recomputarMarcadores(ed); onChange?.()
      return true
    }

    const onKey = (e) => {
      // Alt+M / Alt+N / Alt+Tab
      if (e.altKey && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); e.stopPropagation(); transformarEmMarcador(); return }
      if (e.altKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); e.stopPropagation(); ciclarSimbolo(); return }
      if (e.altKey && e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); mudarNivel(-1); return }
      // Tab / Shift+Tab dentro de um marcador → nível (senão deixa o comportamento nativo de bullets)
      if (e.key === 'Tab' && marcadorNoCursor(ed)) { e.preventDefault(); e.stopPropagation(); mudarNivel(e.shiftKey ? -1 : 1); return }
      // Enter dentro de um marcador → próximo marcador
      if (e.key === 'Enter' && !e.shiftKey && marcadorNoCursor(ed)) {
        if (enterNoMarcador()) { e.preventDefault(); e.stopPropagation() }
        return
      }
    }

    // clique na frase → recolhe/expande (quando tem conteúdo)
    const onClick = (e) => {
      const txt = e.target.closest?.('.nx-marker-txt'); if (!txt) return
      const m = txt.closest('.nx-marker'); if (!m) return
      if (m.dataset.nxHaschildren !== '1') return
      // não alterna se o usuário está selecionando texto
      const sel = window.getSelection(); if (sel && !sel.isCollapsed) return
      m.dataset.nxCollapsed = m.dataset.nxCollapsed === '1' ? '0' : '1'
      recomputarMarcadores(ed); onChange?.()
    }

    ed.addEventListener('keydown', onKey)          // fase bubble no próprio elemento → antes do React root
    ed.addEventListener('click', onClick)
    const obs = new MutationObserver(() => recomputarMarcadores(ed))
    obs.observe(ed, { childList: true, subtree: false })
    recomputarMarcadores(ed)
    return () => { ed.removeEventListener('keydown', onKey); ed.removeEventListener('click', onClick); obs.disconnect() }
  }, [editorRef, onChange])
}

/* ═══════════════════════════ B) CONEXÃO RÁPIDA (Alt+B) ═══════════════════════════ */
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

export function useQuickLink({ editorRef, docs, onOpenDoc, criarNota, salvarNota, onChange }) {
  const [pop, setPop] = useState(null) // { x, y, palavra, step, noteId, noteTitle, conteudo }
  const rangeRef = useRef(null)
  const docsRef = useRef(docs); useEffect(() => { docsRef.current = docs }, [docs])

  const abrir = useCallback(() => {
    const ed = editorRef.current; if (!ed) return
    const rr = rangeDaPalavra(); if (!rr) return
    rangeRef.current = rr
    const palavra = rr.toString().trim()
    const rect = rr.getBoundingClientRect()
    setPop({ x: rect.left, y: rect.bottom + 6, palavra, busca: palavra, step: 'choose', noteId: null, noteTitle: '', conteudo: '' })
  }, [editorRef])

  useEffect(() => {
    const ed = editorRef.current; if (!ed) return
    const onKey = (e) => { if (e.altKey && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); e.stopPropagation(); abrir() } }
    ed.addEventListener('keydown', onKey)
    return () => ed.removeEventListener('keydown', onKey)
  }, [editorRef, abrir])

  const linkar = useCallback((docId, texto) => {
    const ed = editorRef.current; const r = rangeRef.current; if (!ed || !r) return
    const a = document.createElement('a')
    a.className = 'nx-wikilink'; a.contentEditable = 'false'; a.setAttribute('data-doc', docId); a.textContent = texto
    r.deleteContents(); r.insertNode(a)
    const space = document.createTextNode(' '); a.parentNode.insertBefore(space, a.nextSibling)
    const nr = document.createRange(); nr.setStartAfter(space); nr.collapse(true)
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(nr)
    onChange?.()
  }, [editorRef, onChange])

  const escolherNota = (d) => { linkar(d.id, pop.palavra); setPop((p) => ({ ...p, step: 'note', noteId: d.id, noteTitle: d.title || 'Sem título', conteudo: d.html || '', novo: false })) }
  const criar = async () => {
    const titulo = (pop.busca || pop.palavra || 'Nota').trim()
    const id = await criarNota?.(titulo)
    if (!id) return
    linkar(id, pop.palavra)
    setPop((p) => ({ ...p, step: 'note', noteId: id, noteTitle: titulo, conteudo: '', novo: true }))
  }
  const salvarConteudo = (html) => { setPop((p) => ({ ...p, conteudo: html })); if (pop?.noteId) salvarNota?.(pop.noteId, html) }

  const sugestoes = useMemo(() => {
    if (!pop) return []
    const q = norm(pop.busca)
    return (docsRef.current || []).filter((d) => q ? norm(d.title || '').includes(q) : true).slice(0, 6)
  }, [pop])

  if (!pop) return { overlay: null, abrir }

  const bd = { border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', borderRadius: 7, cursor: 'pointer', fontSize: '.74rem', fontWeight: 700, padding: '5px 10px' }
  const overlay = createPortal(<>
    <div onMouseDown={() => setPop(null)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
    <div style={{ position: 'fixed', left: Math.min(pop.x, window.innerWidth - 340), top: Math.min(pop.y, window.innerHeight - 320), zIndex: 9999, width: 320, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,.4)', padding: 12 }}>
      {pop.step === 'choose' && <>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginBottom: 6 }}>Conectar <b style={{ color: 'var(--text-primary)' }}>“{pop.palavra}”</b> a…</div>
        <input autoFocus value={pop.busca} onChange={(e) => setPop((p) => ({ ...p, busca: e.target.value }))} placeholder="Buscar nota…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '.82rem', marginBottom: 6 }} />
        <div style={{ maxHeight: 170, overflowY: 'auto' }}>
          {sugestoes.map((d) => (
            <div key={d.id} onMouseDown={(e) => { e.preventDefault(); escolherNota(d) }}
              style={{ padding: '7px 9px', borderRadius: 7, cursor: 'pointer', fontSize: '.82rem', color: 'var(--text-primary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              ✦ {d.title || 'Sem título'}
            </div>
          ))}
          {sugestoes.length === 0 && <div style={{ padding: '6px 9px', fontSize: '.74rem', color: 'var(--text-muted)' }}>Nenhuma nota encontrada.</div>}
        </div>
        <button onMouseDown={(e) => { e.preventDefault(); criar() }} style={{ ...bd, width: '100%', marginTop: 8, background: '#5b5bd6', color: '#fff', border: 'none' }}>➕ Criar nota “{(pop.busca || pop.palavra).trim()}”</button>
      </>}
      {pop.step === 'note' && <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <b style={{ fontSize: '.86rem', color: 'var(--text-primary)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pop.novo ? '🆕 ' : '🔗 '}{pop.noteTitle}</b>
          <button onMouseDown={(e) => { e.preventDefault(); setPop(null) }} style={bd}>✕</button>
        </div>
        {pop.novo
          ? <textarea autoFocus defaultValue="" onChange={(e) => salvarConteudo('<p>' + e.target.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '</p><p>') + '</p>')} placeholder="Escreva o conteúdo desta nota…" rows={6}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '.82rem', resize: 'vertical' }} />
          : <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: '.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}
              dangerouslySetInnerHTML={{ __html: pop.conteudo || '<i style="opacity:.5">Nota vazia.</i>' }} />}
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button onMouseDown={(e) => { e.preventDefault(); const id = pop.noteId; setPop(null); onOpenDoc?.(id) }} style={{ ...bd, flex: 1, background: '#5b5bd6', color: '#fff', border: 'none' }}>✦ Abrir na edição</button>
          <button onMouseDown={(e) => { e.preventDefault(); setPop(null) }} style={{ ...bd, flex: 1 }}>Concluir</button>
        </div>
      </>}
    </div>
  </>, document.body)

  return { overlay, abrir }
}
