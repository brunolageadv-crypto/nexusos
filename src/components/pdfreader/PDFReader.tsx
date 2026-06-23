// @ts-nocheck
/* ════════════════════════════════════════════════════════════════════════════
   PDF READER · aba de leitura dinâmica + extração para editor Rich Text + IA
   ----------------------------------------------------------------------------
   Arquitetura (3 colunas + overlays):
     ┌── Sidebar Pastas (colapsável) ──┬── Visualizador PDF + Toolbar ──┬── Editor "Palavras Destacadas" ──┐
     │  árvore de pastas/subpastas     │  PDF.js (client-side, sem DB)  │  Rich Text (contentEditable)     │
     │  documentos salvos              │  zoom · realce · sublinhar     │  toolbar de formatação           │
     │                                 │  lupa/máscara/régua/foco       │  botão flutuante de IA → perguntas│
     └─────────────────────────────────┴────────────────────────────────┴──────────────────────────────────┘
   Persistência: SÓ o conteúdo do editor + anotações (realces) vão pro Firestore.
   O PDF fica apenas em memória (ArrayBuffer) — nunca é salvo (custo zero de storage).

   Integração (marcada com  TODO-WIRE):
     1) Firestore: salvar/carregar documentos de "Palavras Destacadas" e pastas.
     2) LLM: função callLLM() — pluga no seu provider (Gemini/DeepSeek/Claude).
   ════════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'

/* remove undefined (Firestore não aceita) — mesmo helper do AnalisePDF */
function clean<T extends object>(obj: T): T { return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T }
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

/* ─────────────────────────── PDF.js (CDN, mesmo padrão do AnalisePDF) ─────────────────────────── */
const PDFJS_CDN = ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build', 'https://unpkg.com/pdfjs-dist@3.11.174/build']
function loadScript(src: string) { return new Promise<void>((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('fail ' + src)); document.head.appendChild(s) }) }
async function ensurePdfjs() {
  if (!(window as any).pdfjsLib) {
    let base = ''
    for (const b of PDFJS_CDN) { try { await loadScript(b + '/pdf.min.js'); if ((window as any).pdfjsLib) { base = b; break } } catch {} }
    if (!base) throw new Error('PDF.js não carregou')
    const lib = (window as any).pdfjsLib
    try { if (lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = base + '/pdf.worker.min.js' } catch {}
  }
  return (window as any).pdfjsLib
}

/* normaliza texto capturado do PDF: tira hifenização de quebra e colapsa espaços
   (espelha o mmNormalize do AnalisePDF → mesma precisão da "árvore (capturar)") */
function prNormalize(raw: string): string {
  if (!raw) return ''
  let s = raw.replace(/\r/g, '')
  s = s.replace(/([A-Za-zÀ-ÿ])-\s*\n\s*([a-zà-ÿ])/g, '$1$2')   // consti-\ntuição → constituição
  s = s.replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim()
  return s
}
const esc = (s = '') => s.replace(/[&<>]/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))

/* ═══════════════════════════════ IA · GERAÇÃO DE PERGUNTAS ═══════════════════════════════
   Estrutura da requisição garantindo retorno LIMPO (array de perguntas):
   - prompt força "responda APENAS com um array JSON de strings, sem markdown"
   - parsePerguntas() extrai o array mesmo que o modelo embrulhe em ```json ou texto. */
function promptPerguntas(termo: string, contexto: string) {
  return [
    'Você é um gerador de perguntas de estudo para concursos públicos brasileiros.',
    `Termo/foco: "${termo}".`,
    contexto ? `Contexto do trecho: "${contexto.slice(0, 600)}".` : '',
    'Gere de 4 a 6 perguntas curtas, claras e distintas sobre o termo (definição, características, aplicação, exceções).',
    'Responda ESTRITAMENTE com um array JSON de strings em português, sem comentários, sem markdown, sem texto antes ou depois.',
    'Exemplo de formato: ["Pergunta 1?","Pergunta 2?"]',
  ].filter(Boolean).join('\n')
}
/* extrai o array de perguntas de forma robusta */
function parsePerguntas(raw: string): string[] {
  if (!raw) return []
  let t = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  // tenta achar o primeiro array JSON dentro do texto
  const m = t.match(/\[[\s\S]*\]/)
  if (m) t = m[0]
  try {
    const arr = JSON.parse(t)
    if (Array.isArray(arr)) return arr.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 8)
  } catch {}
  // fallback: linhas que terminam em "?" ou começam com bullet/numeração
  return raw.split('\n').map(l => l.replace(/^[\s\-\*\d\.\)]+/, '').trim()).filter(l => l.endsWith('?')).slice(0, 8)
}
/* chamada genérica ao LLM — pluga no seu provider.  TODO-WIRE
   cfg em localStorage('nexus_ai_cfg') = { url, key, model, kind:'openai'|'anthropic'|'gemini' } */
async function callLLM(prompt: string): Promise<string> {
  const cfg = (() => { try { return JSON.parse(localStorage.getItem('nexus_ai_cfg') || '{}') } catch { return {} } })()
  if (!cfg.url || !cfg.key) throw new Error('IA não configurada (defina nexus_ai_cfg: url, key, model).')
  if (cfg.kind === 'gemini') {
    const r = await fetch(`${cfg.url}?key=${cfg.key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) })
    const d = await r.json(); return d?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }
  if (cfg.kind === 'anthropic') {
    const r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: cfg.model || 'claude-haiku-4-5', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }) })
    const d = await r.json(); return (d?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
  }
  // OpenAI-compatible (DeepSeek, etc.)
  const r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` }, body: JSON.stringify({ model: cfg.model || 'gpt-4o-mini', temperature: 0.4, messages: [{ role: 'user', content: prompt }] }) })
  const d = await r.json(); return d?.choices?.[0]?.message?.content || ''
}
async function gerarPerguntasIA(termo: string, contexto: string): Promise<string[]> {
  const raw = await callLLM(promptPerguntas(termo, contexto))
  return parsePerguntas(raw)
}

/* ═══════════════════════════════ EXPORTAÇÃO ═══════════════════════════════ */
function wordDoc(innerHTML: string, titulo: string) {
  const t = (titulo || 'Palavras Destacadas').replace(/[<>]/g, '')
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${t}</title>` +
    `<style>body{font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt;color:#1a1a1a;}h1{font-size:16pt}h2{font-size:13pt}</style></head><body>${innerHTML}</body></html>`
}
function download(name: string, content: string, mime: string) {
  const blob = new Blob(['\ufeff', content], { type: mime })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

/* ═══════════════════════════════ EDITOR RICH TEXT ═══════════════════════════════ */
const MARCADORES = ['●', '○', '■', '□', '▸', '–']
function RichEditor({ editorRef, onChange }: any) {
  const [aiBtn, setAiBtn] = useState<{ x: number; y: number; termo: string } | null>(null)
  const [aiMenu, setAiMenu] = useState<{ x: number; y: number; loading: boolean; opts: string[] } | null>(null)
  const savedRange = useRef<Range | null>(null)
  const exec = (cmd: string, val?: string) => { document.execCommand(cmd, false, val); editorRef.current?.focus(); onChange?.() }

  // mostra o botão de IA ao selecionar texto dentro do editor
  const onMouseUp = () => {
    setTimeout(() => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) { setAiBtn(null); return }
      const r = sel.getRangeAt(0)
      if (!editorRef.current?.contains(r.commonAncestorContainer)) { setAiBtn(null); return }
      const termo = sel.toString().trim()
      if (!termo) { setAiBtn(null); return }
      savedRange.current = r.cloneRange()
      const rect = r.getBoundingClientRect()
      setAiBtn({ x: rect.left + rect.width / 2, y: rect.top - 8, termo })
    }, 10)
  }
  const pedirPerguntas = async () => {
    if (!aiBtn) return
    const ctx = editorRef.current?.innerText || ''
    setAiMenu({ x: aiBtn.x, y: aiBtn.y + 26, loading: true, opts: [] }); setAiBtn(null)
    try { const opts = await gerarPerguntasIA(aiBtn.termo, ctx); setAiMenu(m => m && { ...m, loading: false, opts }) }
    catch (e: any) { setAiMenu(m => m && { ...m, loading: false, opts: ['⚠ ' + (e?.message || 'Falha na IA')] }) }
  }
  // substitui o termo selecionado pela pergunta escolhida
  const aplicar = (pergunta: string) => {
    const r = savedRange.current; if (r) { const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r) }
    document.execCommand('insertText', false, pergunta)
    setAiMenu(null); onChange?.()
  }

  const Btn = ({ cmd, val, children, title }: any) => (
    <button onMouseDown={e => { e.preventDefault(); exec(cmd, val) }} title={title}
      style={{ minWidth: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>{children}</button>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* toolbar de formatação */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <Btn cmd="formatBlock" val="h1" title="Título 1">H1</Btn>
        <Btn cmd="formatBlock" val="h2" title="Título 2">H2</Btn>
        <Btn cmd="formatBlock" val="p" title="Parágrafo">¶</Btn>
        <span style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
        <Btn cmd="bold" title="Negrito">B</Btn>
        <Btn cmd="italic" title="Itálico"><i>I</i></Btn>
        <Btn cmd="underline" title="Sublinhar"><u>U</u></Btn>
        <span style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
        <Btn cmd="insertUnorderedList" title="Lista">•</Btn>
        <Btn cmd="outdent" title="Diminuir recuo">⇤</Btn>
        <Btn cmd="indent" title="Aumentar recuo">⇥</Btn>
        <span style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
        <input type="color" title="Cor do texto" onChange={e => exec('foreColor', e.target.value)} style={{ width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', cursor: 'pointer', padding: 2 }} />
        <input type="color" title="Cor de realce" defaultValue="#fff3a3" onChange={e => exec('hiliteColor', e.target.value)} style={{ width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', cursor: 'pointer', padding: 2 }} />
      </div>
      {/* área editável */}
      <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={onChange} onMouseUp={onMouseUp}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px', outline: 'none', color: 'var(--text-primary)', lineHeight: 1.6, fontSize: '0.95rem' }}>
        <p style={{ color: 'var(--text-muted)' }}>Os trechos extraídos do PDF aparecem aqui. Selecione um termo para gerar perguntas com IA.</p>
      </div>

      {/* botão flutuante de IA */}
      {aiBtn && createPortal(
        <button onMouseDown={e => { e.preventDefault(); pedirPerguntas() }}
          style={{ position: 'fixed', left: aiBtn.x, top: aiBtn.y, transform: 'translate(-50%,-100%)', zIndex: 7000, padding: '5px 11px', borderRadius: 20, border: 'none', background: 'linear-gradient(135deg,#5b5bd6,#7c5cff)', color: '#fff', fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer', boxShadow: '0 6px 18px rgba(91,91,214,0.45)', whiteSpace: 'nowrap' }}>
          ✦ Gerar perguntas
        </button>, document.body)}

      {/* menu de perguntas da IA */}
      {aiMenu && createPortal(<>
        <div onMouseDown={() => setAiMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 7001 }} />
        <div style={{ position: 'fixed', left: aiMenu.x, top: aiMenu.y, transform: 'translateX(-50%)', zIndex: 7002, width: 320, maxWidth: '90vw', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,0.35)', padding: 8 }}>
          <div style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', padding: '4px 8px' }}>Perguntas sugeridas</div>
          {aiMenu.loading && <div style={{ padding: '10px 8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Gerando…</div>}
          {!aiMenu.loading && aiMenu.opts.map((p, i) => (
            <button key={i} onMouseDown={e => { e.preventDefault(); if (!p.startsWith('⚠')) aplicar(p) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1.35 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{p}</button>
          ))}
        </div>
      </>, document.body)}
    </div>
  )
}

/* ═══════════════════════════════ VISUALIZADOR PDF ═══════════════════════════════ */
const PALETA_REALCE = ['#fff3a3', '#ffd28a', '#ffb3c1', '#c3f0c8', '#bfe3ff', '#e3c8ff', '#ffe0b0', '#d9d9d9']
function PdfViewer({ onExtract }: any) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<any>(null); const libRef = useRef<any>(null)
  const [numPages, setNumPages] = useState(0)
  const [curPage, setCurPage] = useState(1)
  const [zoom, setZoom] = useState(1.25)
  const [nome, setNome] = useState('')
  const [ferramenta, setFerramenta] = useState<'none' | 'lupa' | 'mascara' | 'regua' | 'foco'>('none')
  const [corRealce, setCorRealce] = useState('#fff3a3')
  const [paletaOpen, setPaletaOpen] = useState(false)
  const [popup, setPopup] = useState<{ x: number; y: number; text: string } | null>(null)
  const acumRef = useRef<string>('')        // trecho em composição (várias seleções)
  const [acumLen, setAcumLen] = useState(0)
  const [mouseY, setMouseY] = useState(0)
  // anotações (realce/sublinhado) por página, em coords FRACIONÁRIAS (sobrevivem ao zoom)
  const anotRef = useRef<Record<number, any[]>>({})
  const [, forceAnot] = useState(0)
  const [lupa, setLupa] = useState<{ x: number; y: number; show: boolean }>({ x: 0, y: 0, show: false })
  const lensRef = useRef<HTMLCanvasElement>(null)
  const anotKeyRef = useRef('')
  const LENS = 168, LENS_ZOOM = 2.4

  // refs de virtualização (espelha o AnalisePDF)
  const metaRef = useRef<any[]>([])                       // {n,w,h} em escala 1
  const pageElsRef = useRef<Record<number, HTMLElement>>({})
  const rsRef = useRef<Record<number, number>>({})        // escala já renderizada por página
  const tcRef = useRef<Record<number, any>>({})           // cache de textContent
  const ioRef = useRef<IntersectionObserver | null>(null)
  const visRef = useRef<Set<number>>(new Set())
  const scaleRef = useRef(zoom); scaleRef.current = zoom

  // importa o PDF (apenas em memória — nunca persistido)
  const importar = async (file: File) => {
    const buf = await file.arrayBuffer()
    const lib = await ensurePdfjs(); libRef.current = lib
    const pdf = await lib.getDocument({ data: buf }).promise
    pdfRef.current = pdf; setNumPages(pdf.numPages); setNome(file.name.replace(/\.pdf$/i, '')); setCurPage(1)
    pageElsRef.current = {}; rsRef.current = {}; tcRef.current = {}; visRef.current = new Set()
    try { anotKeyRef.current = 'nexus_pr_annot_' + file.name; anotRef.current = JSON.parse(localStorage.getItem(anotKeyRef.current) || '{}') } catch { anotRef.current = {} }
    // metadados (tamanho em escala 1) p/ placeholders — não renderiza nada ainda
    const metas: any[] = []
    for (let i = 1; i <= pdf.numPages; i++) { const pg = await pdf.getPage(i); const vp = pg.getViewport({ scale: 1 }); metas.push({ n: i, w: vp.width, h: vp.height }) }
    metaRef.current = metas
    requestAnimationFrame(montarPlaceholders)
  }
  // cria placeholders dimensionados e liga o observer (render só do que entra na viewport)
  const montarPlaceholders = () => {
    const host = wrapRef.current; if (!host) return
    host.innerHTML = ''; pageElsRef.current = {}; rsRef.current = {}
    if (ioRef.current) ioRef.current.disconnect()
    ioRef.current = new IntersectionObserver(ents => {
      for (const e of ents) { const n = Number((e.target as HTMLElement).dataset.page); if (e.isIntersecting) { visRef.current.add(n); renderPage(n) } else visRef.current.delete(n) }
    }, { root: host, rootMargin: '700px 0px' })
    const sc = scaleRef.current
    for (const m of metaRef.current) {
      const el = document.createElement('div'); el.className = 'pr-page'; el.dataset.page = String(m.n)
      el.style.width = (m.w * sc) + 'px'; el.style.height = (m.h * sc) + 'px'
      const num = document.createElement('div'); num.className = 'pr-num'; num.textContent = String(m.n); el.appendChild(num)
      host.appendChild(el); pageElsRef.current[m.n] = el; ioRef.current!.observe(el)
    }
  }
  // renderiza canvas (dpr) + camada de texto + anotações de UMA página
  const renderPage = async (pn: number) => {
    const pdf = pdfRef.current, lib = libRef.current; if (!pdf || !lib) return
    const sc = scaleRef.current
    if (rsRef.current[pn] === sc) return
    const el = pageElsRef.current[pn]; if (!el) return
    rsRef.current[pn] = sc
    try {
      const page = await pdf.getPage(pn); const vp = page.getViewport({ scale: sc })
      el.style.width = vp.width + 'px'; el.style.height = vp.height + 'px'
      let canvas = el.querySelector('canvas') as HTMLCanvasElement
      if (!canvas) { canvas = document.createElement('canvas'); el.insertBefore(canvas, el.firstChild) }
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.floor(vp.width * ratio); canvas.height = Math.floor(vp.height * ratio)
      canvas.style.width = vp.width + 'px'; canvas.style.height = vp.height + 'px'
      const ctx = canvas.getContext('2d'); ctx!.setTransform(ratio, 0, 0, ratio, 0, 0)
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      let tl = el.querySelector('.pr-textlayer') as HTMLElement
      if (!tl) { tl = document.createElement('div'); tl.className = 'pr-textlayer'; el.appendChild(tl) }
      tl.innerHTML = ''; tl.style.width = vp.width + 'px'; tl.style.height = vp.height + 'px'; tl.style.setProperty('--scale-factor', String(sc))
      const tc = tcRef.current[pn] || await page.getTextContent(); tcRef.current[pn] = tc
      try { const t = lib.renderTextLayer({ textContentSource: tc, container: tl, viewport: vp, textDivs: [] }); await (t.promise || t) }
      catch { try { const t2 = lib.renderTextLayer({ textContent: tc, container: tl, viewport: vp, textDivs: [] }); await (t2.promise || t2) } catch {} }
      pintarPagina(el, pn)
    } catch { rsRef.current[pn] = -1 }
  }
  // página atual = a que cruza o centro do viewer (sem observer extra)
  const onScroll = () => {
    const host = wrapRef.current; if (!host || !metaRef.current.length) return
    const mid = host.scrollTop + host.clientHeight / 2; let acc = 18, atual = 1
    for (const m of metaRef.current) { const h = (pageElsRef.current[m.n]?.offsetHeight || m.h * scaleRef.current) + 16; if (mid >= acc && mid < acc + h) { atual = m.n; break } acc += h; atual = m.n }
    setCurPage(atual)
  }
  // zoom: redimensiona placeholders e re-renderiza só as páginas visíveis
  useEffect(() => {
    if (!pdfRef.current) return
    scaleRef.current = zoom; rsRef.current = {}
    for (const m of metaRef.current) { const el = pageElsRef.current[m.n]; if (el) { el.style.width = (m.w * zoom) + 'px'; el.style.height = (m.h * zoom) + 'px' } }
    requestAnimationFrame(() => visRef.current.forEach(n => renderPage(n)))
  }, [zoom])

  // SELEÇÃO PRECISA (espelha getViewerSelection + mmNormalize do AnalisePDF)
  const getSel = () => {
    const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return null
    const v = wrapRef.current; if (!v) return null
    const range = sel.getRangeAt(0)
    if (!v.contains(range.commonAncestorContainer)) return null
    const text = prNormalize(sel.toString()); if (!text) return null
    return { text, rect: range.getBoundingClientRect() }
  }
  const onMouseUp = () => {
    setTimeout(() => {
      const s = getSel()
      if (s) setPopup({ x: s.rect.left + s.rect.width / 2, y: s.rect.top - 6, text: s.text })
      else setPopup(null)
    }, 10)
  }
  // "Enviar para Palavras Destacadas"
  const enviar = () => {
    if (!popup) return
    const full = (acumRef.current ? acumRef.current + ' ' : '') + popup.text
    onExtract?.(full.trim())
    acumRef.current = ''; setAcumLen(0); setPopup(null); window.getSelection()?.removeAllRanges()
  }
  // "Continuar selecionando para compor a frase"
  const compor = () => {
    if (!popup) return
    acumRef.current = (acumRef.current ? acumRef.current + ' ' : '') + popup.text
    setAcumLen(acumRef.current.length); setPopup(null); window.getSelection()?.removeAllRanges()
  }

  // ── ANOTAÇÕES (realce/sublinhado) por retângulos de overlay ──
  const salvarAnot = () => { try { if (anotKeyRef.current) localStorage.setItem(anotKeyRef.current, JSON.stringify(anotRef.current)) } catch {} }
  // aplica na seleção atual: quebra em getClientRects(), converte p/ frações por página
  const aplicarAnotacao = (kind: 'realce' | 'sublinhado', cor?: string) => {
    const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const v = wrapRef.current; if (!v || !v.contains(range.commonAncestorContainer)) return
    const pages = Array.from(v.querySelectorAll('.pr-page')) as HTMLElement[]
    const rects = Array.from(range.getClientRects()).filter(r => r.width > 1 && r.height > 1)
    const id = Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    let added = false
    for (const r of rects) {
      const cy = r.top + r.height / 2, cx = r.left + r.width / 2
      const pg = pages.find(p => { const b = p.getBoundingClientRect(); return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom })
      if (!pg) continue
      const n = Number(pg.dataset.page), b = pg.getBoundingClientRect()
      const frac = { fx: (r.left - b.left) / b.width, fy: (r.top - b.top) / b.height, fw: r.width / b.width, fh: r.height / b.height }
        ; (anotRef.current[n] ||= [])
      let a = anotRef.current[n].find((x: any) => x.id === id)
      if (!a) { a = { id, kind, cor: cor || '#fff3a3', rects: [] }; anotRef.current[n].push(a) }
      a.rects.push(frac); added = true
    }
    if (added) { sel.removeAllRanges(); pintarAnotacoes(); salvarAnot(); forceAnot(x => x + 1) }
  }
  const limparAnotacoes = () => { if (!confirm('Remover todos os realces deste PDF?')) return; anotRef.current = {}; pintarAnotacoes(); salvarAnot(); forceAnot(x => x + 1) }
  // (re)desenha os overlays a partir das frações (independe do zoom)
  const pintarPagina = (el: HTMLElement, n: number) => {
    el.querySelector('.pr-annot')?.remove()
    const list = anotRef.current[n]; if (!list || !list.length) return
    const layer = document.createElement('div'); layer.className = 'pr-annot'
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2'
    const W = el.clientWidth, H = el.clientHeight
    for (const a of list) for (const r of a.rects) {
      const d = document.createElement('div')
      const x = r.fx * W, y = r.fy * H, w = r.fw * W, h = r.fh * H
      if (a.kind === 'sublinhado') d.style.cssText = `position:absolute;left:${x}px;top:${y + h - 2}px;width:${w}px;height:2px;background:${a.cor};`
      else d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${a.cor};opacity:.42;mix-blend-mode:multiply;border-radius:2px;`
      layer.appendChild(d)
    }
    el.appendChild(layer)
  }
  const pintarAnotacoes = () => {
    const v = wrapRef.current; if (!v) return
    v.querySelectorAll('.pr-page').forEach(pg => pintarPagina(pg as HTMLElement, Number((pg as HTMLElement).dataset.page)))
  }
  // ── LUPA (drawImage da região sob o cursor, ampliada) ──
  const desenharLupa = (clientX: number, clientY: number) => {
    const elx = document.elementFromPoint(clientX, clientY) as HTMLElement
    const pg = elx?.closest('.pr-page') as HTMLElement
    const cv = pg?.querySelector('canvas') as HTMLCanvasElement
    const lens = lensRef.current
    if (!cv || !lens) { setLupa(p => ({ ...p, show: false })); return }
    const pr = cv.getBoundingClientRect()
    const scaleX = cv.width / pr.width, scaleY = cv.height / pr.height
    const srcW = LENS / LENS_ZOOM, srcH = LENS / LENS_ZOOM
    const sx = (clientX - pr.left) * scaleX - (srcW * scaleX) / 2
    const sy = (clientY - pr.top) * scaleY - (srcH * scaleY) / 2
    const lc = lens.getContext('2d'); if (!lc) return
    lc.clearRect(0, 0, LENS, LENS); lc.save()
    lc.beginPath(); lc.arc(LENS / 2, LENS / 2, LENS / 2 - 2, 0, 6.283); lc.clip()
    lc.fillStyle = '#fff'; lc.fillRect(0, 0, LENS, LENS)
    lc.drawImage(cv, sx, sy, srcW * scaleX, srcH * scaleY, 0, 0, LENS, LENS)
    lc.restore()
    setLupa({ x: clientX, y: clientY, show: true })
  }
  const onMouseMove = (e: React.MouseEvent) => { setMouseY(e.clientY); if (ferramenta === 'lupa') desenharLupa(e.clientX, e.clientY) }

  const Tool = ({ id, children, title }: any) => (
    <button onClick={() => setFerramenta(f => f === id ? 'none' : id)} title={title}
      style={{ minWidth: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.85rem', background: ferramenta === id ? '#5b5bd6' : 'var(--surface)', color: ferramenta === id ? '#fff' : 'var(--text-secondary)' }}>{children}</button>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }} onMouseMove={onMouseMove}>
      {/* TOOLBAR DE LEITURA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <label style={{ padding: '6px 12px', borderRadius: 8, background: '#5b5bd6', color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
          ↥ Importar PDF<input type="file" accept="application/pdf" hidden onChange={e => e.target.files?.[0] && importar(e.target.files[0])} />
        </label>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, marginRight: 4 }}>{nome || '—'}</span>
        <span style={{ width: 1, height: 22, background: 'var(--border)' }} />
        <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.15).toFixed(2)))} style={btn}>−</button>
        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', width: 42, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(3, +(z + 0.15).toFixed(2)))} style={btn}>+</button>
        <span style={{ width: 1, height: 22, background: 'var(--border)' }} />
        {/* realce com paleta expansível */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setPaletaOpen(o => !o)} title="Realce" style={{ ...btn, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: corRealce, border: '1px solid var(--border)' }} />▾
          </button>
          {paletaOpen && (
            <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 30, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, padding: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.25)' }}>
              {PALETA_REALCE.map(c => <button key={c} onClick={() => { setCorRealce(c); setPaletaOpen(false) }} style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', background: c, cursor: 'pointer' }} />)}
            </div>
          )}
        </div>
        <button onClick={() => aplicarAnotacao('realce', corRealce)} title="Realçar a seleção" style={btn}>✎ Realçar</button>
        <button onClick={() => aplicarAnotacao('sublinhado', corRealce)} title="Sublinhar a seleção" style={btn}><u>S</u></button>
        <button onClick={limparAnotacoes} title="Limpar realces deste PDF" style={btn}>🧽</button>
        <span style={{ width: 1, height: 22, background: 'var(--border)' }} />
        <Tool id="lupa" title="Lupa">🔍</Tool>
        <Tool id="mascara" title="Máscara de leitura">▭</Tool>
        <Tool id="regua" title="Régua de acompanhamento">▬</Tool>
        <Tool id="foco" title="Foco dinâmico">◎</Tool>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          Página {String(curPage).padStart(2, '0')} de {String(numPages).padStart(2, '0')}
        </span>
      </div>

      {/* SCROLLER DO PDF + overlays de foco */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={wrapRef} onMouseUp={onMouseUp} onScroll={onScroll} style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: 18, background: 'var(--bg-subtle, #1112)' }}>
          {!numPages && <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Importe um PDF para começar a leitura.</div>}
        </div>
        {/* régua */}
        {ferramenta === 'regua' && <div style={{ position: 'fixed', left: 0, right: 0, top: mouseY, height: 2, background: '#5b5bd6cc', pointerEvents: 'none', zIndex: 40 }} />}
        {/* máscara de leitura (faixa clara, resto escurecido) */}
        {ferramenta === 'mascara' && <>
          <div style={{ position: 'fixed', left: 0, right: 0, top: 0, height: Math.max(0, mouseY - 26), background: 'rgba(0,0,0,0.55)', pointerEvents: 'none', zIndex: 40 }} />
          <div style={{ position: 'fixed', left: 0, right: 0, top: mouseY + 26, bottom: 0, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none', zIndex: 40 }} />
        </>}
        {/* foco dinâmico (vinheta radial seguindo o cursor) */}
        {ferramenta === 'foco' && <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 40, background: `radial-gradient(circle 140px at 50% ${mouseY}px, transparent 0%, rgba(0,0,0,0.55) 100%)` }} />}
        {/* lupa: canvas circular ampliando a região sob o cursor */}
        <canvas ref={lensRef} width={LENS} height={LENS} style={{ position: 'fixed', left: lupa.x + 22, top: lupa.y - LENS - 16, width: LENS, height: LENS, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.9)', boxShadow: '0 8px 28px rgba(0,0,0,0.4)', pointerEvents: 'none', zIndex: 50, display: ferramenta === 'lupa' && lupa.show ? 'block' : 'none', background: '#fff' }} />
      </div>

      {/* POP-UP DE DECISÃO ao terminar a seleção */}
      {popup && createPortal(<>
        <div onMouseDown={() => setPopup(null)} style={{ position: 'fixed', inset: 0, zIndex: 6500 }} />
        <div style={{ position: 'fixed', left: popup.x, top: popup.y, transform: 'translate(-50%,-100%)', zIndex: 6501, display: 'flex', flexDirection: 'column', gap: 5, padding: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 36px rgba(0,0,0,0.35)', width: 240 }}>
          {acumLen > 0 && <div style={{ fontSize: '0.6rem', color: '#5b5bd6', fontFamily: 'var(--font-mono)' }}>compondo… {acumLen} caracteres acumulados</div>}
          <button onMouseDown={e => { e.preventDefault(); enviar() }} style={popBtnPrim}>➜ Enviar para Palavras Destacadas</button>
          <button onMouseDown={e => { e.preventDefault(); compor() }} style={popBtn}>＋ Continuar compondo a frase</button>
        </div>
      </>, document.body)}
    </div>
  )
}
/* helpers de estilo da toolbar/pop-up */
const btn: any = { minWidth: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }
const popBtn: any = { textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }
const popBtnPrim: any = { ...popBtn, background: '#5b5bd6', color: '#fff', border: 'none', fontWeight: 700 }

/* ═══════════════════════════════ STORE FIRESTORE (pastas + documentos) ═══════════════════════════════
   users/{uid}/pdfReaderFolders/{id}  -> { id, name, parentId }
   users/{uid}/pdfReaderDocs/{id}     -> { id, folderId, title, html, criadoEm, atualizadoEm }
   (o PDF nunca é salvo — só pastas e o conteúdo do editor) */
function usePdfReaderStore() {
  const uid = useUid()
  const [pastas, setPastas] = useState<any[]>([])
  const [docs, setDocs] = useState<any[]>([])
  const [aiCfg, setAiCfg] = useState<any>(null)
  const pastasRef = useRef<any[]>([]); useEffect(() => { pastasRef.current = pastas }, [pastas])
  const docsRef = useRef<any[]>([]); useEffect(() => { docsRef.current = docs }, [docs])
  useEffect(() => {
    if (!uid) return
    const u1 = onSnapshot(collection(db, 'users', uid, 'pdfReaderFolders'), s => setPastas(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    const u2 = onSnapshot(collection(db, 'users', uid, 'pdfReaderDocs'), s => setDocs(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    // config de IA sincronizada → espelha no localStorage p/ o callLLM (que lê de forma síncrona)
    const u3 = onSnapshot(doc(db, 'users', uid, 'settings', 'ai'), snap => { const d = snap.data() || null; setAiCfg(d); if (d) { try { localStorage.setItem('nexus_ai_cfg', JSON.stringify(d)) } catch {} } })
    return () => { u1(); u2(); u3() }
  }, [uid])
  const salvarAiCfg = useCallback(async (cfg: any) => { try { localStorage.setItem('nexus_ai_cfg', JSON.stringify(cfg)) } catch {}; if (uid) await setDoc(doc(db, 'users', uid, 'settings', 'ai'), clean(cfg), { merge: true }) }, [uid])
  const salvarPasta = useCallback(async (p: any) => { if (!uid) return; await setDoc(doc(db, 'users', uid, 'pdfReaderFolders', p.id), clean(p), { merge: true }) }, [uid])
  const removerPasta = useCallback(async (id: string) => {
    if (!uid) return
    const kill = new Set([id]); let changed = true
    while (changed) { changed = false; for (const p of pastasRef.current) if (p.parentId && kill.has(p.parentId) && !kill.has(p.id)) { kill.add(p.id); changed = true } }
    for (const fid of kill) await deleteDoc(doc(db, 'users', uid, 'pdfReaderFolders', fid))
    for (const d of docsRef.current) if (kill.has(d.folderId)) await deleteDoc(doc(db, 'users', uid, 'pdfReaderDocs', d.id))
  }, [uid])
  const salvarDoc = useCallback(async (d: any) => { if (!uid) return; await setDoc(doc(db, 'users', uid, 'pdfReaderDocs', d.id), clean(d), { merge: true }) }, [uid])
  const removerDoc = useCallback(async (id: string) => { if (!uid) return; await deleteDoc(doc(db, 'users', uid, 'pdfReaderDocs', id)) }, [uid])
  const moverDoc = useCallback(async (id: string, folderId: string | null) => { if (!uid) return; await setDoc(doc(db, 'users', uid, 'pdfReaderDocs', id), { folderId: folderId ?? null }, { merge: true }) }, [uid])
  const moverPasta = useCallback(async (id: string, parentId: string | null) => { if (!uid) return; await setDoc(doc(db, 'users', uid, 'pdfReaderFolders', id), { parentId: parentId ?? null }, { merge: true }) }, [uid])
  return { uid, pastas, docs, aiCfg, salvarAiCfg, salvarPasta, removerPasta, salvarDoc, removerDoc, moverDoc, moverPasta }
}

/* ═══════════════════════════════ SIDEBAR DE PASTAS (árvore Firestore + DnD) ═══════════════════════════════ */
const miniBtn: any = { width: 22, height: 22, borderRadius: 5, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.72rem' }
function PastasSidebar({ open, onToggle, store, docId, onOpenDoc, onNewDoc }: any) {
  const { pastas, docs, salvarPasta, removerPasta, removerDoc, moverDoc, moverPasta } = store
  const [exp, setExp] = useState<Record<string, boolean>>({})
  const drag = useRef<{ tipo: 'doc' | 'pasta'; id: string } | null>(null)
  const toggle = (id: string) => setExp(e => ({ ...e, [id]: !e[id] }))
  const novaPasta = (parentId: string | null) => { const name = prompt('Nome da pasta:'); if (name) salvarPasta({ id: newId(), name, parentId: parentId ?? null }) }
  const renomearPasta = (p: any) => { const name = prompt('Renomear pasta:', p.name); if (name != null && name.trim()) salvarPasta({ id: p.id, name: name.trim() }) }
  const soltar = (folderId: string | null) => { const d = drag.current; if (!d) return; if (d.tipo === 'doc') moverDoc(d.id, folderId); else if (d.id !== folderId) moverPasta(d.id, folderId); drag.current = null }

  if (!open) return (
    <div style={{ width: 38, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 10 }}>
      <button onClick={onToggle} title="Abrir pastas" style={btn}>📁</button>
    </div>
  )

  const nivel = (pid: string | null, depth: number): any => (<>
    {pastas.filter((p: any) => (p.parentId ?? null) === pid).map((p: any) => {
      const aberta = exp[p.id]; const nf = docs.filter((d: any) => d.folderId === p.id).length
      return (
        <div key={p.id}>
          <div className="pr-row" draggable onDragStart={() => (drag.current = { tipo: 'pasta', id: p.id })} onDragOver={e => e.preventDefault()} onDrop={() => soltar(p.id)} style={{ paddingLeft: 6 + depth * 14 }}>
            <span onClick={() => toggle(p.id)} style={{ cursor: 'pointer', width: 12, display: 'inline-block' }}>{aberta ? '▾' : '▸'}</span>
            <span onClick={() => toggle(p.id)} style={{ flex: 1, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📂 {p.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>({nf})</span></span>
            <span className="pr-acts">
              <button title="Novo documento" onClick={() => onNewDoc(p.id)} style={miniBtn}>📄</button>
              <button title="Nova subpasta" onClick={() => novaPasta(p.id)} style={miniBtn}>📁</button>
              <button title="Renomear" onClick={() => renomearPasta(p)} style={miniBtn}>✎</button>
              <button title="Excluir" onClick={() => { if (confirm('Excluir a pasta e tudo dentro dela?')) removerPasta(p.id) }} style={miniBtn}>🗑</button>
            </span>
          </div>
          {aberta && nivel(p.id, depth + 1)}
        </div>
      )
    })}
    {docs.filter((d: any) => (d.folderId ?? null) === pid).map((d: any) => (
      <div key={d.id} className="pr-row" draggable onDragStart={() => (drag.current = { tipo: 'doc', id: d.id })} style={{ paddingLeft: 6 + depth * 14 + 14, background: docId === d.id ? 'var(--surface)' : undefined }}>
        <span onClick={() => onOpenDoc(d)} style={{ flex: 1, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: docId === d.id ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: docId === d.id ? 700 : 500 }}>📄 {d.title || 'Sem título'}</span>
        <span className="pr-acts"><button title="Excluir" onClick={() => { if (confirm('Excluir este documento?')) removerDoc(d.id) }} style={miniBtn}>🗑</button></span>
      </div>
    ))}
  </>)

  return (
    <div style={{ width: 250, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <b style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>📁 Pastas</b>
        <span style={{ flex: 1 }} />
        <button onClick={() => onNewDoc(null)} title="Novo documento (raiz)" style={btn}>📄</button>
        <button onClick={() => novaPasta(null)} title="Nova pasta (raiz)" style={btn}>＋</button>
        <button onClick={onToggle} title="Ocultar" style={btn}>«</button>
      </div>
      <div onDragOver={e => e.preventDefault()} onDrop={() => soltar(null)} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 6 }}>
        {pastas.length === 0 && docs.length === 0 && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: 8 }}>Crie uma pasta (＋) ou um documento (📄). Arraste para reorganizar.</div>}
        {nivel(null, 0)}
      </div>
    </div>
  )
}

/* ═══════════════════════════════ MODAL PRÉ-VISUALIZAÇÃO DE IMPRESSÃO ═══════════════════════════════ */
function PreviaImpressao({ html, titulo, onClose }: any) {
  const exportarWord = () => download(`${(titulo || 'palavras_destacadas').replace(/[^\w\-]+/g, '_')}.doc`, wordDoc(html, titulo), 'application/msword;charset=utf-8')
  const imprimirPDF = () => {
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(wordDoc(html, titulo)); w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
  }
  return createPortal(<>
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 8000 }} />
    <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 8001, width: 'min(840px,94vw)', height: 'min(640px,90vh)', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <b style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>🖨️ Pré-visualização de Impressão</b>
        <span style={{ flex: 1 }} />
        <button onClick={imprimirPDF} style={{ ...btn, width: 'auto', padding: '0 12px', background: '#5b5bd6', color: '#fff', border: 'none' }}>⬇ PDF / Imprimir</button>
        <button onClick={exportarWord} style={{ ...btn, width: 'auto', padding: '0 12px' }}>⬇ Word (.docx)</button>
        <button onClick={onClose} style={btn}>✕</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24, background: '#525659' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', background: '#fff', color: '#1a1a1a', padding: '40px 48px', borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,.3)', fontFamily: "Calibri,'Segoe UI',Arial,sans-serif", lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: html || '<p style="color:#888">Editor vazio.</p>' }} />
      </div>
    </div>
  </>, document.body)
}

/* ═══════════════════════════════ CONFIGURAR IA (Firestore + localStorage) ═══════════════════════════════ */
const lblCfg: any = { display: 'block', fontSize: '.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', margin: '9px 0 3px' }
const inpCfg: any = { width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg, var(--surface))', color: 'var(--text-primary)', fontSize: '.82rem', boxSizing: 'border-box' }
function ConfigIAModal({ store, onClose }: any) {
  const cur = store.aiCfg || (() => { try { return JSON.parse(localStorage.getItem('nexus_ai_cfg') || 'null') } catch { return null } })() || {}
  const [kind, setKind] = useState(cur.kind || 'gemini')
  const [url, setUrl] = useState(cur.url || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent')
  const [key, setKey] = useState(cur.key || '')
  const [model, setModel] = useState(cur.model || 'gemini-2.5-flash')
  const [status, setStatus] = useState('')
  const presetGemini = () => { setUrl('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'); setModel('gemini-2.5-flash') }
  const salvar = async () => { await store.salvarAiCfg({ kind, url, key, model }); setStatus(store.uid ? '✓ Salvo e sincronizado' : '✓ Salvo neste navegador') }
  const testar = async () => {
    setStatus('Testando…')
    try { await store.salvarAiCfg({ kind, url, key, model }); const r = await gerarPerguntasIA('Direito Administrativo', 'Conceito e princípios.'); setStatus(r.length ? `✓ Funcionou — ${r.length} perguntas geradas` : '⚠ Resposta vazia (verifique modelo/endpoint)') }
    catch (e: any) { setStatus('⚠ ' + (e?.message || 'falha na chamada')) }
  }
  return createPortal(<>
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 8000 }} />
    <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 8001, width: 'min(460px,94vw)', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,.4)', padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: '1.1rem' }}>✦</span><b style={{ color: 'var(--text-primary)' }}>Configurar IA</b>
        <span style={{ flex: 1 }} /><button onClick={onClose} style={btn}>✕</button>
      </div>
      {!store.uid && <div style={{ fontSize: '.72rem', color: '#EA580C', marginBottom: 6 }}>Sem login: salva só neste navegador. Faça login para sincronizar entre aparelhos.</div>}
      <label style={lblCfg}>Provedor</label>
      <div style={{ display: 'flex', gap: 6 }}>
        {[['gemini', 'Gemini'], ['openai', 'OpenAI/DeepSeek'], ['anthropic', 'Anthropic']].map(([k, l]) => (
          <button key={k} onClick={() => { setKind(k); if (k === 'gemini') presetGemini() }} style={{ ...btn, width: 'auto', flex: 1, padding: '0 6px', fontSize: '.72rem', background: kind === k ? '#5b5bd6' : 'var(--surface)', color: kind === k ? '#fff' : 'var(--text-secondary)', border: kind === k ? 'none' : '1px solid var(--border)' }}>{l}</button>
        ))}
      </div>
      <label style={lblCfg}>Endpoint (URL)</label>
      <input value={url} onChange={e => setUrl(e.target.value)} style={inpCfg} />
      <label style={lblCfg}>Chave da API</label>
      <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="cole sua API key" style={inpCfg} />
      <label style={lblCfg}>Modelo</label>
      <input value={model} onChange={e => setModel(e.target.value)} style={inpCfg} />
      {kind !== 'gemini' && <div style={{ fontSize: '.66rem', color: '#EA580C', marginTop: 4 }}>OpenAI/DeepSeek/Anthropic costumam bloquear CORS no navegador — pode exigir um proxy serverless.</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={testar} style={{ ...btn, width: 'auto', flex: 1, padding: '0 10px' }}>⚡ Testar</button>
        <button onClick={salvar} style={{ ...btn, width: 'auto', flex: 1, padding: '0 10px', background: '#5b5bd6', color: '#fff', border: 'none' }}>💾 Salvar</button>
      </div>
      {status && <div style={{ marginTop: 10, fontSize: '.76rem', color: 'var(--text-secondary)' }}>{status}</div>}
      <div style={{ marginTop: 10, fontSize: '.62rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>Gemini funciona direto do navegador. Restrinja a chave por referenciador (brunolageadv-crypto.github.io) no Google Cloud Console.</div>
    </div>
  </>, document.body)
}


export default function PDFReader() {
  const editorRef = useRef<HTMLDivElement>(null)
  const store = usePdfReaderStore()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [previa, setPrevia] = useState<string | null>(null)
  const [cfgIA, setCfgIA] = useState(false)
  const [docId, setDocId] = useState<string | null>(null)
  const [titulo, setTitulo] = useState('')
  const [salvo, setSalvo] = useState(true)
  const folderRef = useRef<string | null>(null)
  const saveT = useRef<any>(null)
  const scheduleRef = useRef<() => void>(() => {})

  // salvar agora (doc já existente)
  const salvarAgora = useCallback(async () => {
    if (!docId) return
    await store.salvarDoc({ id: docId, folderId: folderRef.current, title: titulo || 'Sem título', html: editorRef.current?.innerHTML || '', atualizadoEm: Date.now() })
    setSalvo(true)
  }, [docId, titulo, store])
  // autosave com debounce
  const agendarSalvar = useCallback(() => {
    if (!docId) { setSalvo(false); return }
    setSalvo(false); clearTimeout(saveT.current); saveT.current = setTimeout(() => salvarAgora(), 1400)
  }, [docId, salvarAgora])
  scheduleRef.current = agendarSalvar
  useEffect(() => () => clearTimeout(saveT.current), [])

  // trecho extraído do PDF → insere no editor
  const onExtract = useCallback((texto: string) => {
    const ed = editorRef.current; if (!ed) return
    if (ed.querySelector('p')?.textContent?.startsWith('Os trechos extraídos')) ed.innerHTML = ''
    const p = document.createElement('p'); p.textContent = texto
    ed.appendChild(p); ed.scrollTop = ed.scrollHeight
    scheduleRef.current()
  }, [])
  const onEditorChange = useCallback(() => { scheduleRef.current() }, [])
  const onTitulo = (v: string) => { setTitulo(v); scheduleRef.current() }

  // abrir documento (faz flush do atual antes)
  const abrirDoc = useCallback(async (d: any) => {
    clearTimeout(saveT.current)
    if (docId) await store.salvarDoc({ id: docId, folderId: folderRef.current, title: titulo || 'Sem título', html: editorRef.current?.innerHTML || '', atualizadoEm: Date.now() })
    setDocId(d.id); setTitulo(d.title || ''); folderRef.current = d.folderId ?? null
    if (editorRef.current) editorRef.current.innerHTML = d.html || '<p><br></p>'
    setSalvo(true)
  }, [docId, titulo, store])
  // novo documento (vazio) numa pasta
  const novoDoc = useCallback(async (folderId: string | null) => {
    clearTimeout(saveT.current)
    if (docId) await store.salvarDoc({ id: docId, folderId: folderRef.current, title: titulo || 'Sem título', html: editorRef.current?.innerHTML || '', atualizadoEm: Date.now() })
    const id = newId()
    await store.salvarDoc({ id, folderId: folderId ?? null, title: 'Sem título', html: '', criadoEm: Date.now(), atualizadoEm: Date.now() })
    setDocId(id); setTitulo('Sem título'); folderRef.current = folderId ?? null
    if (editorRef.current) editorRef.current.innerHTML = '<p><br></p>'
    setSalvo(true)
  }, [docId, titulo, store])
  // botão Salvar: cria na raiz se ainda não houver doc aberto
  const onSalvar = useCallback(async () => {
    if (docId) return salvarAgora()
    const id = newId()
    await store.salvarDoc({ id, folderId: null, title: titulo || 'Sem título', html: editorRef.current?.innerHTML || '', criadoEm: Date.now(), atualizadoEm: Date.now() })
    setDocId(id); folderRef.current = null; setSalvo(true)
  }, [docId, titulo, store, salvarAgora])

  const abrirPrevia = () => setPrevia(editorRef.current?.innerHTML || '')

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--card-bg)' }}>
      <PastasSidebar open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} store={store} docId={docId} onOpenDoc={abrirDoc} onNewDoc={novoDoc} />
      {/* coluna PDF */}
      <div style={{ flex: 1.25, minWidth: 0, borderRight: '1px solid var(--border)' }}>
        <PdfViewer onExtract={onExtract} />
      </div>
      {/* coluna editor */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '1rem' }}>✦</span>
          <input value={titulo} onChange={e => onTitulo(e.target.value)} placeholder="Título do documento" disabled={!store.uid}
            style={{ flex: 1, minWidth: 0, border: '1px solid transparent', background: 'transparent', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.88rem', padding: '4px 6px', borderRadius: 7, outline: 'none' }}
            onFocus={e => (e.target.style.border = '1px solid var(--border)')} onBlur={e => (e.target.style.border = '1px solid transparent')} />
          <span style={{ fontSize: '0.66rem', color: salvo ? 'var(--text-muted)' : '#EA580C', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{salvo ? '✓ salvo' : '● não salvo'}</span>
          <button onClick={() => setCfgIA(true)} title="Configurar IA" style={{ ...btn, width: 'auto', padding: '0 9px' }}>⚙</button>
          <button onClick={onSalvar} disabled={!store.uid} style={{ ...btn, width: 'auto', padding: '0 12px' }}>💾 Salvar</button>
          <button onClick={abrirPrevia} style={{ ...btn, width: 'auto', padding: '0 12px', background: '#5b5bd6', color: '#fff', border: 'none' }}>🖨️ Exportar…</button>
        </div>
        {!store.uid && <div style={{ padding: '6px 12px', fontSize: '0.7rem', color: '#EA580C', background: 'var(--surface)' }}>Faça login para salvar documentos no Firestore.</div>}
        <div style={{ flex: 1, minHeight: 0 }}>
          <RichEditor editorRef={editorRef} onChange={onEditorChange} />
        </div>
      </div>
      {previa != null && <PreviaImpressao html={previa} titulo={titulo || 'Palavras Destacadas'} onClose={() => setPrevia(null)} />}
      {cfgIA && <ConfigIAModal store={store} onClose={() => setCfgIA(false)} />}
      <style>{`
        .pr-page{position:relative;margin:0 auto 16px;background:#fff;border-radius:4px;box-shadow:0 2px 14px rgba(0,0,0,.18);overflow:hidden}
        .pr-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#c4c4c4;font:600 22px/1 system-ui;z-index:0}
        .pr-page canvas{position:relative;z-index:1;display:block}
        .pr-textlayer{position:absolute;top:0;left:0;overflow:hidden;line-height:1;z-index:3;transform-origin:0 0;opacity:1}
        .pr-textlayer span,.pr-textlayer br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0 0}
        .pr-textlayer ::selection{background:rgba(91,91,214,.35)}
        .pr-row{display:flex;align-items:center;gap:4px;padding:5px 6px;border-radius:7px;font-size:.82rem;color:var(--text-secondary)}
        .pr-row:hover{background:var(--surface)}
        .pr-acts{display:none;gap:1px;flex-shrink:0}
        .pr-row:hover .pr-acts{display:flex}
      `}</style>
    </div>
  )
}
