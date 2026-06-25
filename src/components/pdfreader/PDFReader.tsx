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
import Icon from '../Icon'
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

/* ─────────────────────────── OCR (Tesseract.js via CDN, sob demanda) ─────────────────────────── */
const TESS_CDN = ['https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js', 'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js']
async function ensureTesseract() {
  if (!(window as any).Tesseract) {
    let ok = false
    for (const u of TESS_CDN) { try { await loadScript(u); if ((window as any).Tesseract) { ok = true; break } } catch {} }
    if (!ok) throw new Error('OCR não carregou (Tesseract.js)')
  }
  return (window as any).Tesseract
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
   cfg em localStorage('nexus_ai_cfg') = { url, key, model, kind:'openai'|'anthropic'|'gemini', workerUrl } */

// Chamada direta ao Gemini (pode falhar atrás de firewall corporativo)
async function geminiDireto(cfg: any, prompt: string): Promise<string> {
  const r = await fetch(`${cfg.url}?key=${cfg.key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) })
  if (!r.ok) throw new Error(`Gemini direto falhou (HTTP ${r.status})`)
  const d = await r.json()
  if (d?.error) throw new Error(d.error.message)
  return d?.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

// Chamada via Worker (proxy próprio — contorna bloqueios de rede; chave fica no servidor)
async function geminiViaWorker(cfg: any, prompt: string): Promise<string> {
  const model = cfg.model || 'gemini-2.5-flash'
  const r = await fetch(`${cfg.workerUrl}?model=${model}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) })
  if (!r.ok) throw new Error(`Worker falhou (HTTP ${r.status})`)
  const d = await r.json()
  if (d?.error) throw new Error(d.error.message)
  return d?.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function callLLM(prompt: string): Promise<string> {
  const cfg = (() => { try { return JSON.parse(localStorage.getItem('nexus_ai_cfg') || '{}') } catch { return {} } })()
  if (cfg.kind === 'gemini') {
    if (!cfg.url || !cfg.key) throw new Error('IA não configurada (defina nexus_ai_cfg: url, key, model).')
    // 1º tenta direto; se falhar (firewall, 503, CORS) e houver Worker, usa o fallback
    try {
      return await geminiDireto(cfg, prompt)
    } catch (err) {
      if (cfg.workerUrl) {
        try { return await geminiViaWorker(cfg, prompt) } catch (e2: any) { throw new Error(`Direto e Worker falharam. ${e2?.message || ''}`) }
      }
      throw err
    }
  }
  if (cfg.kind === 'anthropic') {
    if (!cfg.url || !cfg.key) throw new Error('IA não configurada (defina nexus_ai_cfg: url, key, model).')
    const r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: cfg.model || 'claude-haiku-4-5', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }) })
    const d = await r.json(); return (d?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
  }
  // OpenAI-compatible (DeepSeek, etc.)
  if (!cfg.url || !cfg.key) throw new Error('IA não configurada (defina nexus_ai_cfg: url, key, model).')
  const r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` }, body: JSON.stringify({ model: cfg.model || 'gpt-4o-mini', temperature: 0.4, messages: [{ role: 'user', content: prompt }] }) })
  const d = await r.json(); return d?.choices?.[0]?.message?.content || ''
}
async function gerarPerguntasIA(termo: string, contexto: string): Promise<string[]> {
  const raw = await callLLM(promptPerguntas(termo, contexto))
  return parsePerguntas(raw)
}

/* extrai as PALAVRAS-CHAVE de um trecho (parágrafo) — devolve array limpo */
function promptPalavrasChave(trecho: string) {
  return [
    'Você é um assistente de estudos jurídicos para concursos públicos brasileiros.',
    'Extraia as PALAVRAS-CHAVE e termos técnicos mais relevantes do trecho abaixo (conceitos, institutos, expressões essenciais).',
    'Regras: de 3 a 12 itens; cada item curto (1 a 4 palavras); sem repetir; priorize termos jurídicos/técnicos; mantenha a grafia do texto.',
    'Responda ESTRITAMENTE com um array JSON de strings, sem markdown, sem texto antes ou depois. Ex.: ["termo 1","termo 2"]',
    'Trecho:', '"""', trecho.slice(0, 4000), '"""',
  ].join('\n')
}
async function gerarPalavrasChaveIA(trecho: string): Promise<string[]> {
  const raw = await callLLM(promptPalavrasChave(trecho))
  return parsePerguntas(raw)  // mesmo parser robusto de array JSON
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

/* marcadores hierárquicos — 4 níveis × 6 famílias */
const BULLET_SETS: Record<string, string[]> = {
  'Bolas':   ['●', '○', '◉', '◌'],
  'Setas':   ['▸', '▹', '›', '»'],
  'Quadros': ['■', '□', '▪', '▫'],
  'Check':   ['✔', '✓', '☑', '☐'],
  'Estrela': ['★', '☆', '✦', '✧'],
  'Traço':   ['—', '–', '-', '·'],
}
const DEFAULT_SET = 'Bolas'

/* insere <hr> no contentEditable */
function insertHR(ed: HTMLElement) {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount) return
  const range = sel.getRangeAt(0); range.deleteContents()
  const hr = document.createElement('hr')
  hr.style.cssText = 'border:none;border-top:2px solid var(--border);margin:12px 0'
  const br = document.createElement('p'); br.innerHTML = '<br>'
  const frag = document.createDocumentFragment(); frag.appendChild(hr); frag.appendChild(br)
  range.insertNode(frag)
  const r2 = document.createRange(); r2.setStartAfter(br); r2.collapse(true)
  sel.removeAllRanges(); sel.addRange(r2); ed.focus()
}

/* insere tabela NxM no contentEditable */
function insertTable(ed: HTMLElement, rows: number, cols: number) {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount) return
  const range = sel.getRangeAt(0); range.deleteContents()
  const tbl = document.createElement('table')
  tbl.style.cssText = 'border-collapse:collapse;width:100%;margin:10px 0;font-size:.88rem'
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement('tr')
    for (let c = 0; c < cols; c++) {
      const td = document.createElement(r === 0 ? 'th' : 'td')
      td.contentEditable = 'true'
      td.style.cssText = 'border:1px solid var(--border);padding:6px 8px;min-width:60px;' + (r === 0 ? 'background:var(--surface);font-weight:700;' : '')
      td.innerHTML = '<br>'
      tr.appendChild(td)
    }
    tbl.appendChild(tr)
  }
  const after = document.createElement('p'); after.innerHTML = '<br>'
  const frag = document.createDocumentFragment(); frag.appendChild(tbl); frag.appendChild(after)
  range.insertNode(frag)
  const r2 = document.createRange(); r2.setStart(tbl.rows[0].cells[0], 0); r2.collapse(true)
  sel.removeAllRanges(); sel.addRange(r2); ed.focus()
}

/* inserção de marcador custom hierárquico via Tab/Shift+Tab */
function insertCustomBullet(ed: HTMLElement, symbol: string) {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount) return
  const range = sel.getRangeAt(0)
  let node: Node | null = range.startContainer
  while (node && node !== ed) { if ((node as HTMLElement).dataset?.bulletDepth) break; node = node.parentElement }
  const depth = node && node !== ed ? Math.min(3, Number((node as HTMLElement).dataset.bulletDepth) || 0) : 0
  const p = document.createElement('p')
  p.dataset.bulletDepth = String(depth)
  p.style.cssText = `margin:2px 0;padding-left:${(depth + 1) * 20}px;position:relative`
  const sym = document.createElement('span')
  sym.style.cssText = 'position:absolute;left:' + (depth * 20 + 4) + 'px;user-select:none'
  sym.textContent = symbol; sym.contentEditable = 'false'
  const txt = document.createElement('span'); txt.innerHTML = '\u200b'
  p.appendChild(sym); p.appendChild(txt)
  range.deleteContents(); range.insertNode(p)
  const r2 = document.createRange(); r2.setStart(txt, 1); r2.collapse(true)
  sel.removeAllRanges(); sel.addRange(r2); ed.focus()
}

function shiftBulletDepth(ed: HTMLElement, delta: number, symbol: string) {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount) return
  let node: Node | null = sel.getRangeAt(0).startContainer
  while (node && node !== ed) { if ((node as Element).tagName === 'P' && (node as HTMLElement).dataset.bulletDepth !== undefined) break; node = node.parentElement }
  if (!node || node === ed) { insertCustomBullet(ed, symbol); return }
  const p = node as HTMLElement
  const d = Math.max(0, Math.min(3, Number(p.dataset.bulletDepth || 0) + delta))
  p.dataset.bulletDepth = String(d)
  p.style.paddingLeft = ((d + 1) * 20) + 'px'
  const sym = p.querySelector('span[contenteditable="false"]') as HTMLElement
  if (sym) sym.style.left = (d * 20 + 4) + 'px'
  ed.focus()
}

const menuItem: any = { display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.84rem' }
const menuItemRow: any = { flex: 1, padding: '7px 4px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 600 }
const inpNum: any = { width: 60, padding: '4px 7px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.82rem' }

/* símbolos para inserir no texto (feature 10) */
const SIMBOLOS: { s: string; t: string }[] = [
  { s: '|', t: 'Barra vertical' }, { s: '★', t: 'Estrela cheia' }, { s: '☆', t: 'Estrela vazia' }, { s: '⭐', t: 'Estrela' },
  { s: '→', t: 'Seta direita' }, { s: '←', t: 'Seta esquerda' }, { s: '↑', t: 'Seta cima' }, { s: '↓', t: 'Seta baixo' },
  { s: '↔', t: 'Seta dupla' }, { s: '⇒', t: 'Implica' }, { s: '⇐', t: 'Implicado por' }, { s: '➜', t: 'Seta grossa' },
  { s: '➤', t: 'Ponta' }, { s: '▶', t: 'Play' }, { s: '◀', t: 'Voltar' }, { s: '»', t: 'Avançar' },
  { s: '👍', t: 'Joinha (positivo)' }, { s: '👎', t: 'Joinha (negativo)' }, { s: '💣', t: 'Bomba' }, { s: '⚠️', t: 'Perigo / atenção' },
  { s: '❗', t: 'Importante' }, { s: '‼️', t: 'Muito importante' }, { s: '✅', t: 'OK / feito' }, { s: '❌', t: 'Errado' },
  { s: '✔', t: 'Check' }, { s: '✘', t: 'X' }, { s: '👀', t: 'Olhos (atenção)' }, { s: '🔥', t: 'Quente / urgente' },
  { s: '📌', t: 'Fixar' }, { s: '💡', t: 'Ideia' }, { s: '🔑', t: 'Chave' }, { s: '⭕', t: 'Círculo' },
  { s: '§', t: 'Parágrafo (lei)' }, { s: '¶', t: 'Pilcrow' }, { s: '•', t: 'Bola' }, { s: '◦', t: 'Bola vazia' },
]

/* insere um símbolo no ponto do cursor (feature 10) */
function insertSymbol(ed: HTMLElement, symbol: string) {
  ed.focus()
  document.execCommand('insertText', false, symbol)
}

/* insere uma nota adesiva (post-it) flutuante sobre a página (feature 9) */
function insertPostit(ed: HTMLElement) {
  const note = document.createElement('div')
  note.className = 'nexus-postit'
  note.contentEditable = 'false'
  // posiciona próxima ao topo visível da área de edição
  const left = 40 + Math.round(Math.random() * 30)
  const top = (ed.scrollTop || 0) + 28 + Math.round(Math.random() * 30)
  note.setAttribute('style', `position:absolute;left:${left}px;top:${top}px;width:190px;min-height:96px;background:#fff7ae;border:1px solid #e6d667;border-radius:5px;box-shadow:0 5px 16px rgba(0,0,0,.20);z-index:6;resize:both;overflow:auto;font-size:.82rem;color:#5b4b00;font-family:var(--font-body,inherit)`)
  note.innerHTML =
    '<div class="nexus-postit-drag" contenteditable="false" style="cursor:move;height:20px;background:#ffe96b;border-bottom:1px solid #e6d667;border-radius:5px 5px 0 0;display:flex;align-items:center;justify-content:space-between;padding:0 4px 0 7px;user-select:none">' +
    '<span style="font-size:.62rem;font-weight:700;color:#8a7300;letter-spacing:.04em">NOTA</span>' +
    '<span class="nexus-postit-x" style="cursor:pointer;font-weight:800;line-height:1;padding:0 4px;color:#8a6f00;font-size:1rem">×</span></div>' +
    '<div contenteditable="true" style="padding:7px 9px;outline:none;min-height:54px">Escreva aqui…</div>'
  ed.appendChild(note)
}

/* ajusta o recuo (margem esquerda) dos parágrafos no trecho selecionado (feature 11).
   delta em px; passos finos dão mais controle que o execCommand('indent') padrão. */
function ajustarRecuo(ed: HTMLElement, delta: number) {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount) { ed.focus(); return }
  const range = sel.getRangeAt(0)
  const ehBloco = (el: HTMLElement) => el.nodeType === 1 && /^(P|DIV|LI|H1|H2|H3|BLOCKQUOTE)$/.test(el.tagName)
  const subir = (n: Node | null): HTMLElement | null => {
    let x: Node | null = n
    while (x && x !== ed) { const el = x as HTMLElement; if (ehBloco(el)) return el; x = x.parentElement }
    return null
  }
  const blocos = new Set<HTMLElement>()
  if (range.collapsed) {
    const b = subir(range.startContainer); if (b) blocos.add(b)
  } else {
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node: any) => ehBloco(node) && range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
    } as any)
    let node = walker.nextNode()
    while (node) { blocos.add(node as HTMLElement); node = walker.nextNode() }
    const bi = subir(range.startContainer); if (bi) blocos.add(bi)
    const bf = subir(range.endContainer); if (bf) blocos.add(bf)
  }
  if (blocos.size === 0) {
    document.execCommand('formatBlock', false, 'p')
    const b = subir(window.getSelection()?.getRangeAt(0).startContainer || null); if (b) blocos.add(b)
  }
  blocos.forEach(b => {
    const atual = parseFloat(b.style.marginLeft || '0') || 0
    b.style.marginLeft = Math.max(0, Math.min(320, atual + delta)) + 'px'
  })
  ed.focus()
}

function RichEditor({ editorRef, onChange }: any) {
  const [aiBtn, setAiBtn] = useState<{ x: number; y: number; termo: string } | null>(null)
  const [aiMenu, setAiMenu] = useState<{ x: number; y: number; loading: boolean; opts: string[] } | null>(null)
  const savedRange = useRef<Range | null>(null)
  const [bulletSet, setBulletSet] = useState(DEFAULT_SET)
  const [pageStyle, setPageStyle] = useState<'blank' | 'lined' | 'grid'>('blank')   // feature 1
  const [autoQ, setAutoQ] = useState(false)                                          // feature 2
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)  // menu suspenso ancorado
  const openMenu = (id: string, e: React.MouseEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu(m => m && m.id === id ? null : { id, x: r.left, y: r.bottom + 4 }) }
  const [tRows, setTRows] = useState(3)
  const [tCols, setTCols] = useState(3)
  const exec = (cmd: string, val?: string) => { document.execCommand(cmd, false, val); editorRef.current?.focus(); onChange?.() }
  const symbols = BULLET_SETS[bulletSet]

  /* Tab / Shift+Tab dentro do editor → ajusta profundidade do marcador.
     Enter no "modo pergunta" → adiciona ? ao fim da linha antes de quebrar (feature 2). */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && autoQ && !e.shiftKey) {
      e.preventDefault()
      document.execCommand('insertText', false, '?')
      document.execCommand('insertParagraph')
      onChange?.()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const ed = editorRef.current; if (!ed) return
      shiftBulletDepth(ed, e.shiftKey ? -1 : 1, symbols[0])
      onChange?.()
    }
  }

  /* arrastar / excluir post-its (feature 9) — via delegação no editor */
  useEffect(() => {
    const ed = editorRef.current; if (!ed) return
    let drag: { note: HTMLElement; dx: number; dy: number } | null = null
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.classList.contains('nexus-postit-x')) {
        const n = t.closest('.nexus-postit'); if (n) { n.remove(); onChange?.() } e.preventDefault(); return
      }
      const handle = t.closest('.nexus-postit-drag') as HTMLElement | null
      if (handle) {
        const note = handle.closest('.nexus-postit') as HTMLElement; if (!note) return
        const r = note.getBoundingClientRect()
        drag = { note, dx: e.clientX - r.left, dy: e.clientY - r.top }
        e.preventDefault()
      }
    }
    const move = (e: MouseEvent) => {
      if (!drag) return
      const er = ed.getBoundingClientRect()
      const left = e.clientX - er.left - drag.dx + ed.scrollLeft
      const top = e.clientY - er.top - drag.dy + ed.scrollTop
      drag.note.style.left = Math.max(0, left) + 'px'
      drag.note.style.top = Math.max(0, top) + 'px'
    }
    const up = () => { if (drag) { drag = null; onChange?.() } }
    ed.addEventListener('mousedown', down)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { ed.removeEventListener('mousedown', down); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [])

  const onMouseUp = () => {
    setTimeout(() => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) { setAiBtn(null); return }
      const r = sel.getRangeAt(0)
      if (!editorRef.current?.contains(r.commonAncestorContainer)) { setAiBtn(null); return }
      const termo = sel.toString().trim(); if (!termo) { setAiBtn(null); return }
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
  const aplicar = (pergunta: string) => {
    const r = savedRange.current; if (r) { const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r) }
    document.execCommand('insertText', false, pergunta)
    setAiMenu(null); onChange?.()
  }

  const Sep = () => <span style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch', margin: '0 2px' }} />
  const Btn = ({ cmd, val, children, title, active }: any) => (
    <button onMouseDown={e => { e.preventDefault(); exec(cmd, val) }} title={title}
      style={{ minWidth: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: active ? '#5b5bd6' : 'var(--surface)', color: active ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>{children}</button>
  )
  const IBtn = ({ onClick, children, title, active }: any) => (
    <button onMouseDown={e => { e.preventDefault(); onClick?.() }} title={title}
      style={{ minWidth: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: active ? '#5b5bd6' : 'var(--surface)', color: active ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>{children}</button>
  )
  // botão que abre um menu suspenso
  const MenuBtn = ({ id, label, title }: any) => (
    <button onMouseDown={e => { e.preventDefault(); openMenu(id, e) }} title={title}
      style={{ height: 28, padding: '0 9px', borderRadius: 7, border: '1px solid var(--border)', background: menu?.id === id ? '#5b5bd6' : 'var(--surface)', color: menu?.id === id ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
      {label}<span style={{ fontSize: '0.6rem' }}>▾</span>
    </button>
  )
  // painel suspenso ancorado (fecha ao clicar fora) — itens executam ações da família
  const Painel = ({ id, width, children }: any) => menu?.id === id ? createPortal(<>
    <div onMouseDown={() => setMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 7900 }} />
    <div style={{ position: 'fixed', left: Math.min(menu.x, window.innerWidth - (width + 16)), top: menu.y, zIndex: 7901, width, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 11, boxShadow: '0 14px 40px rgba(0,0,0,.32)', padding: 10 }}>{children}</div>
  </>, document.body) : null

  const run = (fn: () => void) => { fn(); onChange?.() }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* ── TOOLBAR (uma linha) ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: '7px 10px', borderBottom: '1px solid var(--border)' }}>
        <MenuBtn id="estilo" label="Estilo" title="Título / parágrafo" />
        <Sep />
        <Btn cmd="bold" title="Negrito (Ctrl+B)">B</Btn>
        <Btn cmd="italic" title="Itálico (Ctrl+I)"><i>I</i></Btn>
        <Btn cmd="underline" title="Sublinhado (Ctrl+U)"><u>U</u></Btn>
        <Btn cmd="strikeThrough" title="Tachado">S̶</Btn>
        <Sep />
        <MenuBtn id="alinhar" label="Alinhar" title="Alinhamento" />
        <IBtn title="Diminuir recuo (trazer parágrafo para a esquerda)"
          onClick={() => { const ed = editorRef.current; if (ed) run(() => ajustarRecuo(ed, -24)) }}>⇤</IBtn>
        <IBtn title="Aumentar recuo (empurrar parágrafo para a direita)"
          onClick={() => { const ed = editorRef.current; if (ed) run(() => ajustarRecuo(ed, 24)) }}>⇥</IBtn>
        <MenuBtn id="cor" label="🎨" title="Cores" />
        <MenuBtn id="marcadores" label="≔" title="Marcadores e listas" />
        <MenuBtn id="inserir" label="＋" title="Linha divisória e tabela" />
        <MenuBtn id="simbolos" label="✶" title="Inserir símbolo (seta, estrela, joinha, perigo…)" />
        <Sep />
        {/* fundo da página: branca → pautada → quadriculada (feature 1) */}
        <IBtn title={`Fundo da página: ${ { blank: 'branca', lined: 'pautada', grid: 'quadriculada' }[pageStyle] } (clique para alternar)`}
          active={pageStyle !== 'blank'}
          onClick={() => setPageStyle(p => p === 'blank' ? 'lined' : p === 'lined' ? 'grid' : 'blank')}>
          {{ blank: '▢', lined: '▤', grid: '▦' }[pageStyle]}
        </IBtn>
        {/* modo pergunta: Enter adiciona "?" no fim da linha (feature 2) */}
        <IBtn title={autoQ ? 'Modo pergunta ATIVO — Enter adiciona "?" no fim da linha (clique para desativar)' : 'Modo pergunta — ao dar Enter adiciona "?" no fim da linha'}
          active={autoQ} onClick={() => setAutoQ(v => !v)}>?</IBtn>
        {/* nota adesiva / post-it (feature 9) */}
        <IBtn title="Inserir nota adesiva (post-it) — arraste, redimensione, feche no ×"
          onClick={() => { const ed = editorRef.current; if (ed) run(() => insertPostit(ed)) }}>📌</IBtn>
        <Sep />
        <Btn cmd="undo" title="Desfazer (Ctrl+Z)">↩</Btn>
        <Btn cmd="redo" title="Refazer (Ctrl+Y)">↪</Btn>
      </div>

      {/* ── PAINÉIS DOS MENUS ── */}
      <Painel id="estilo" width={150}>
        {[['h1', 'Título 1'], ['h2', 'Título 2'], ['h3', 'Título 3'], ['p', 'Parágrafo']].map(([v, l]) => (
          <button key={v} onMouseDown={e => { e.preventDefault(); exec('formatBlock', v); setMenu(null) }} style={menuItem}>{l}</button>
        ))}
      </Painel>

      <Painel id="alinhar" width={150}>
        {[['justifyLeft', '⬅ Esquerda'], ['justifyCenter', '↔ Centro'], ['justifyRight', '➡ Direita'], ['justifyFull', '☰ Justificar']].map(([c, l]) => (
          <button key={c} onMouseDown={e => { e.preventDefault(); exec(c); setMenu(null) }} style={menuItem}>{l}</button>
        ))}
      </Painel>

      <Painel id="cor" width={220}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 7 }}>Cor do texto</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
          {['#202124', '#DC2626', '#EA580C', '#16A34A', '#2563EB', '#7C3AED', '#DB2777', '#0891B2'].map(c => (
            <button key={c} onMouseDown={e => { e.preventDefault(); exec('foreColor', c) }} style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid var(--border)', background: c, cursor: 'pointer' }} />
          ))}
          <input type="color" title="Outra cor" onChange={e => exec('foreColor', e.target.value)} style={{ width: 22, height: 22, border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', padding: 1 }} />
        </div>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 7 }}>Realce</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {['#fff3a3', '#ffd28a', '#ffb3c1', '#c3f0c8', '#bfe3ff', '#e3c8ff', 'transparent'].map(c => (
            <button key={c} onMouseDown={e => { e.preventDefault(); exec('hiliteColor', c === 'transparent' ? '#ffffff' : c) }} title={c === 'transparent' ? 'Remover' : c} style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid var(--border)', background: c === 'transparent' ? 'var(--surface)' : c, cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)' }}>{c === 'transparent' ? '✕' : ''}</button>
          ))}
          <input type="color" title="Outro realce" defaultValue="#fff3a3" onChange={e => exec('hiliteColor', e.target.value)} style={{ width: 22, height: 22, border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', padding: 1 }} />
        </div>
      </Painel>

      <Painel id="marcadores" width={250}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 8 }}>Família</div>
        {Object.entries(BULLET_SETS).map(([name, syms]) => (
          <button key={name} onMouseDown={e => { e.preventDefault(); setBulletSet(name) }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '6px 8px', borderRadius: 7, border: 'none', background: name === bulletSet ? 'var(--surface)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ display: 'flex', gap: 6, fontSize: '0.9rem', width: 78 }}>{syms.map((s, i) => <span key={i} style={{ opacity: 1 - i * 0.15 }}>{s}</span>)}</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{name}</span>
          </button>
        ))}
        <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', margin: '10px 0 6px' }}>Inserir nível</div>
        <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
          {symbols.map((s, i) => (
            <button key={i} onMouseDown={e => { e.preventDefault(); const ed = editorRef.current; if (ed) run(() => insertCustomBullet(ed, s)) }} title={`Nível ${i + 1}`}
              style={{ flex: 1, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '0.9rem' }}>{s}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          <button onMouseDown={e => { e.preventDefault(); const ed = editorRef.current; if (ed) run(() => shiftBulletDepth(ed, 1, symbols[0])) }} style={menuItemRow}>⇥ Recuar</button>
          <button onMouseDown={e => { e.preventDefault(); const ed = editorRef.current; if (ed) run(() => shiftBulletDepth(ed, -1, symbols[0])) }} style={menuItemRow}>⇤ Voltar</button>
          <button onMouseDown={e => { e.preventDefault(); exec('insertOrderedList') }} style={menuItemRow}>1. Lista</button>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 6, fontSize: '0.64rem', color: 'var(--text-muted)' }}>No texto: Tab aprofunda · Shift+Tab volta</div>
      </Painel>

      <Painel id="inserir" width={210}>
        <button onMouseDown={e => { e.preventDefault(); const ed = editorRef.current; if (ed) run(() => insertHR(ed)); setMenu(null) }} style={menuItem}>─ Linha divisória</button>
        <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
        <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 8 }}>Tabela</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', width: 52 }}>Linhas</label>
          <input type="number" min={1} max={30} value={tRows} onChange={e => setTRows(Number(e.target.value))} style={inpNum} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', width: 52 }}>Colunas</label>
          <input type="number" min={1} max={10} value={tCols} onChange={e => setTCols(Number(e.target.value))} style={inpNum} />
        </div>
        <button onMouseDown={e => { e.preventDefault(); const ed = editorRef.current; if (ed) run(() => insertTable(ed, tRows, tCols)); setMenu(null) }}
          style={{ width: '100%', padding: '7px 0', borderRadius: 8, border: 'none', background: '#5b5bd6', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>⊞ Inserir {tRows}×{tCols}</button>
      </Painel>

      <Painel id="simbolos" width={232}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 8 }}>Inserir símbolo</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
          {SIMBOLOS.map((it, i) => (
            <button key={i} title={it.t}
              onMouseDown={e => { e.preventDefault(); const ed = editorRef.current; if (ed) run(() => insertSymbol(ed, it.s)) }}
              style={{ height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '0.92rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              {it.s}
            </button>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 6, fontSize: '0.62rem', color: 'var(--text-muted)' }}>Passe o mouse para ver o nome de cada símbolo.</div>
      </Painel>

      {/* área editável */}
      <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={onChange} onMouseUp={onMouseUp} onKeyDown={onKeyDown}
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px', outline: 'none', color: 'var(--text-primary)', lineHeight: 1.7, fontSize: '0.94rem',
          position: 'relative',
          backgroundImage: pageStyle === 'lined'
            ? 'repeating-linear-gradient(var(--border) 0 1px, transparent 1px 28px)'
            : pageStyle === 'grid'
              ? 'repeating-linear-gradient(var(--border) 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, var(--border) 0 1px, transparent 1px 28px)'
              : 'none',
          backgroundAttachment: 'local',
        }}>
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
/* tonalizações (filtro CSS — puramente visual, não afeta OCR nem seleção) */
const TONS: { id: string; label: string; icon: string; filter: string }[] = [
  { id: 'cor', label: 'Cor (original)', icon: '🎨', filter: 'none' },
  { id: 'cinza', label: 'Cinza', icon: '◐', filter: 'grayscale(1)' },
  { id: 'pb', label: 'P&B alto contraste', icon: '◑', filter: 'grayscale(1) contrast(1.45) brightness(1.05)' },
  { id: 'sepia', label: 'Sépia (tom quente)', icon: '🟤', filter: 'sepia(0.6) contrast(1.05) brightness(1.02)' },
  { id: 'escuro', label: 'Modo escuro', icon: '🌙', filter: 'invert(0.92) hue-rotate(180deg) contrast(0.95) brightness(1.05)' },
]
const tomFilter = (id: string) => (TONS.find(t => t.id === id) || TONS[0]).filter
function PdfViewer({ onExtract, viewMode, setViewMode }: any) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<any>(null); const libRef = useRef<any>(null)
  const [numPages, setNumPages] = useState(0)
  const [curPage, setCurPage] = useState(1)
  const [pageBox, setPageBox] = useState(1)
  useEffect(() => { setPageBox(curPage) }, [curPage])
  useEffect(() => { setPaginaImagem(!!semTextoRef.current[curPage]) }, [curPage])
  const [zoom, setZoom] = useState(1.25)
  const [fitWidth, setFitWidth] = useState(true)
  const fitRef = useRef(true); fitRef.current = fitWidth
  const [tom, setTom] = useState<string>(() => { try { return localStorage.getItem('nexus_pr_tom') || 'cor' } catch { return 'cor' } })
  const [tomOpen, setTomOpen] = useState(false)
  useEffect(() => { try { localStorage.setItem('nexus_pr_tom', tom) } catch {} }, [tom])
  const [nome, setNome] = useState('')
  const [ferramenta, setFerramenta] = useState<'none' | 'lupa' | 'mascara' | 'regua' | 'foco'>('none')
  const [modo, setModo] = useState<'selecionar' | 'realcar'>('selecionar')  // marquee → editor  ou  marquee → realce
  const [tipoMarca, setTipoMarca] = useState<'realce' | 'sublinhado'>('realce')
  const modoRef = useRef(modo); modoRef.current = modo
  const tipoRef = useRef(tipoMarca); tipoRef.current = tipoMarca
  const [corRealce, setCorRealce] = useState('#fff3a3')
  const corRef = useRef(corRealce); corRef.current = corRealce
  const [paletaOpen, setPaletaOpen] = useState(false)
  const [popup, setPopup] = useState<{ x: number; y: number; text: string; shown: string } | null>(null)
  const acumRef = useRef<string>('')        // trecho em composição (várias seleções)
  const [acumLen, setAcumLen] = useState(0)
  const [pos, setPos] = useState({ x: 0, y: 0 })          // posição do cursor RELATIVA à coluna do PDF
  const viewBoxRef = useRef<HTMLDivElement>(null)         // contêiner relativo da área do PDF
  const dragRef = useRef<{ x0: number; y0: number } | null>(null)  // arraste do marquee
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const lastCapRef = useRef<{ words: any[] } | null>(null)        // última captura (p/ realce)
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
  // OCR (sessão): palavras reconhecidas por página, em FRAÇÕES da página
  const ocrRef = useRef<Record<number, { fx: number; fy: number; fw: number; fh: number; text: string }[]>>({})
  const semTextoRef = useRef<Record<number, boolean>>({})
  const curPageRef = useRef(1); curPageRef.current = curPage
  const [paginaImagem, setPaginaImagem] = useState(false)
  const [ocrStatus, setOcrStatus] = useState<{ running: boolean; pct: number; page: number } | null>(null)

  // importa o PDF (apenas em memória — nunca persistido)
  const importar = async (file: File) => {
    const buf = await file.arrayBuffer()
    const lib = await ensurePdfjs(); libRef.current = lib
    const pdf = await lib.getDocument({ data: buf }).promise
    pdfRef.current = pdf; setNumPages(pdf.numPages); setNome(file.name.replace(/\.pdf$/i, '')); setCurPage(1)
    pageElsRef.current = {}; rsRef.current = {}; tcRef.current = {}; visRef.current = new Set()
    ocrRef.current = {}; semTextoRef.current = {}; setPaginaImagem(false); setOcrStatus(null)
    try { anotKeyRef.current = 'nexus_pr_annot_' + file.name; anotRef.current = JSON.parse(localStorage.getItem(anotKeyRef.current) || '{}') } catch { anotRef.current = {} }
    // metadados (tamanho em escala 1) p/ placeholders — não renderiza nada ainda
    const metas: any[] = []
    for (let i = 1; i <= pdf.numPages; i++) { const pg = await pdf.getPage(i); const vp = pg.getViewport({ scale: 1 }); metas.push({ n: i, w: vp.width, h: vp.height }) }
    metaRef.current = metas
    if (fitRef.current) { const z = calcFit(metas); if (z) { setZoom(z); scaleRef.current = z } }
    requestAnimationFrame(montarPlaceholders)
  }
  // calcula a escala que faz a página caber na largura da coluna
  const calcFit = (metas = metaRef.current) => {
    const host = wrapRef.current; if (!host || !metas.length) return 0
    const avail = host.clientWidth - 36; const w = Math.max(...metas.map((m: any) => m.w))
    return (w > 0 && avail > 60) ? +Math.max(0.4, Math.min(3, avail / w)).toFixed(3) : 0
  }
  const ajustarLargura = () => { setFitWidth(true); const z = calcFit(); if (z) setZoom(z) }
  const mudarZoom = (delta: number) => { setFitWidth(false); setZoom(z => +Math.max(0.4, Math.min(3, z + delta)).toFixed(2)) }
  const irParaPagina = (n: number) => { const p = Math.max(1, Math.min(numPages || 1, n || 1)); const el = pageElsRef.current[p]; const host = wrapRef.current; if (el && host) { host.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' }); setCurPage(p) } }
  // re-ajusta à largura quando a coluna muda de tamanho (divisória / tela cheia)
  useEffect(() => {
    const host = wrapRef.current; if (!host) return
    let t: any
    const ro = new ResizeObserver(() => { if (fitRef.current && pdfRef.current) { clearTimeout(t); t = setTimeout(() => { const z = calcFit(); if (z) setZoom(z) }, 120) } })
    ro.observe(host); return () => { ro.disconnect(); clearTimeout(t) }
  }, [])
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
      // se a página não tem texto nativo mas já tem OCR nesta sessão, reinjeta a camada OCR
      if (ocrRef.current[pn]) injetarOCR(tl, pn)
      // detecta página-imagem (sem texto e sem OCR) p/ sugerir o botão OCR
      const semTexto = (tc?.items?.length || 0) === 0 && !ocrRef.current[pn]
      semTextoRef.current[pn] = semTexto
      if (pn === curPageRef.current) setPaginaImagem(semTexto)
      pintarPagina(el, pn)
    } catch { rsRef.current[pn] = -1 }
  }
  // injeta as palavras do OCR como spans invisíveis (mesmo formato que o marquee lê)
  const injetarOCR = (tl: HTMLElement, pn: number) => {
    const words = ocrRef.current[pn]; if (!words) return
    const W = tl.clientWidth || parseFloat(tl.style.width), H = tl.clientHeight || parseFloat(tl.style.height)
    const frag = document.createDocumentFragment()
    for (const w of words) {
      const span = document.createElement('span')
      const h = w.fh * H
      span.textContent = w.text
      span.dataset.ocr = '1'   // marca: hit-test usa a CAIXA do Tesseract (precisa), não o texto interno
      span.style.cssText = `position:absolute;left:${w.fx * W}px;top:${w.fy * H}px;width:${w.fw * W}px;height:${h}px;font-size:${Math.max(6, h * 0.78)}px;line-height:${h}px;color:transparent;white-space:nowrap;overflow:hidden`
      frag.appendChild(span)
    }
    tl.appendChild(frag)
  }
  // roda OCR na página (sob demanda) e injeta a camada de texto reconhecida
  const ocrPagina = async (n: number) => {
    if (ocrStatus?.running) return
    const pdf = pdfRef.current; if (!pdf) return
    setOcrStatus({ running: true, pct: 0, page: n })
    try {
      const page = await pdf.getPage(n)
      // Render dedicado em ALTA resolução (independe do zoom de exibição) → ~300 DPI.
      // É o fator nº 1 de acurácia: o Tesseract acerta muito mais com imagem grande e nítida.
      const base = page.getViewport({ scale: 1 })
      const escalaOCR = Math.min(4, Math.max(2.2, 2200 / base.width))
      const vp = page.getViewport({ scale: escalaOCR })
      const oc = document.createElement('canvas')
      oc.width = Math.floor(vp.width); oc.height = Math.floor(vp.height)
      const octx = oc.getContext('2d', { willReadFrequently: true })!
      octx.fillStyle = '#ffffff'; octx.fillRect(0, 0, oc.width, oc.height)   // fundo branco = melhor contraste
      await page.render({ canvasContext: octx, viewport: vp }).promise
      const T = await ensureTesseract()
      const worker = await T.createWorker('por', 1, { logger: (m: any) => { if (m.status === 'recognizing text') setOcrStatus({ running: true, pct: Math.round((m.progress || 0) * 100), page: n }) } })
      try { await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '3' }) } catch {}
      const { data } = await worker.recognize(oc)
      await worker.terminate()
      // fractions (0..1) são independentes de escala → válidas para qualquer zoom de exibição
      const ws = (data?.words || [])
        .filter((w: any) => (w.text || '').trim() && (w.confidence == null || w.confidence > 12))
        .map((w: any) => ({ fx: w.bbox.x0 / oc.width, fy: w.bbox.y0 / oc.height, fw: (w.bbox.x1 - w.bbox.x0) / oc.width, fh: (w.bbox.y1 - w.bbox.y0) / oc.height, text: w.text.trim() }))
      ocrRef.current[n] = ws; semTextoRef.current[n] = false
      const el = pageElsRef.current[n]
      const tl = el?.querySelector('.pr-textlayer') as HTMLElement
      if (tl) { tl.querySelectorAll('span').forEach(s => s.remove()); injetarOCR(tl, n) }
      if (n === curPageRef.current) setPaginaImagem(false)
      setOcrStatus(null)
    } catch (e) { setOcrStatus(null); alert('Falha no OCR: ' + ((e as any)?.message || e)) }
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

  // ── SELEÇÃO POR MARQUEE (espelha mmCollectInRect do AnalisePDF: geometria pura, sem seleção nativa) ──
  const joinWords = (arr: string[]): string => {
    const merged: string[] = []
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].endsWith('-') && i + 1 < arr.length && /^[a-zà-ÿ]/.test(arr[i + 1])) { merged.push(arr[i].slice(0, -1) + arr[i + 1]); i++ }
      else merged.push(arr[i])
    }
    return prNormalize(merged.join(' '))
  }
  // coleta as PALAVRAS cujo centro cai dentro do retângulo (ou sob o ponto, no clique simples)
  const collectInRect = (b: any, mode: 'center' | 'point' = 'center') => {
    const words: any[] = []
    const hit = (r: DOMRect) => mode === 'point'
      ? (b.left >= r.left && b.left <= r.right && b.top >= r.top && b.top <= r.bottom)
      : (() => { const cx = r.left + r.width / 2, cy = r.top + r.height / 2; return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom })()
    for (const key of Object.keys(pageElsRef.current)) {
      const pn = Number(key); const pageEl = pageElsRef.current[pn]; if (!pageEl) continue
      const pr = pageEl.getBoundingClientRect()
      if (pr.right < b.left || pr.left > b.right || pr.bottom < b.top || pr.top > b.bottom) continue
      const tl = pageEl.querySelector('.pr-textlayer'); if (!tl) continue
      tl.querySelectorAll('span').forEach((span: any) => {
        const sr = span.getBoundingClientRect()
        if (sr.right < b.left || sr.left > b.right || sr.bottom < b.top || sr.top > b.bottom) return
        const node = span.firstChild
        const push = (rect: DOMRect, word: string) => words.push({ page: pn, top: rect.top, left: rect.left, word, frac: { fx: (rect.left - pr.left) / pr.width, fy: (rect.top - pr.top) / pr.height, fw: rect.width / pr.width, fh: rect.height / pr.height } })
        // Spans de OCR: usa a CAIXA do span (= bbox do Tesseract), não o texto interno —
        // isso evita que o texto transparente transborde e "encoste" na palavra vizinha.
        if (!node || node.nodeType !== 3 || (span as HTMLElement).dataset.ocr) { if (hit(sr)) { const tx = (span.textContent || '').trim(); if (tx) push(sr, tx) } return }
        const text = node.textContent || ''; const re = /\S+/g; let m: any
        while ((m = re.exec(text))) {
          const r = document.createRange(); try { r.setStart(node, m.index); r.setEnd(node, m.index + m[0].length) } catch { continue }
          const rect = r.getBoundingClientRect(); if (!rect.width && !rect.height) continue
          if (hit(rect)) push(rect, m[0])
        }
      })
    }
    words.sort((a, b2) => Math.abs(a.top - b2.top) > 4 ? a.top - b2.top : a.left - b2.left)
    return words
  }
  const onDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    if (!(e.target as HTMLElement).closest('.pr-page')) return   // só inicia sobre uma página
    if (ferramenta !== 'none') return                            // ferramentas de foco não capturam
    e.preventDefault(); window.getSelection()?.removeAllRanges()
    dragRef.current = { x0: e.clientX, y0: e.clientY }
    setBox({ left: e.clientX, top: e.clientY, width: 0, height: 0 })
    const move = (ev: MouseEvent) => { const d = dragRef.current; if (!d) return; setBox({ left: Math.min(d.x0, ev.clientX), top: Math.min(d.y0, ev.clientY), width: Math.abs(ev.clientX - d.x0), height: Math.abs(ev.clientY - d.y0) }) }
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up)
      const d = dragRef.current; dragRef.current = null; setBox(null); if (!d) return
      const left = Math.min(d.x0, ev.clientX), top = Math.min(d.y0, ev.clientY), right = Math.max(d.x0, ev.clientX), bottom = Math.max(d.y0, ev.clientY)
      const words = ((right - left) < 4 && (bottom - top) < 4)
        ? collectInRect({ left: ev.clientX, top: ev.clientY, right: ev.clientX, bottom: ev.clientY }, 'point')
        : collectInRect({ left, top, right, bottom }, 'center')
      if (!words.length) { setPopup(null); return }
      lastCapRef.current = { words }
      if (modoRef.current === 'realcar') {                 // modo realce: aplica direto, sem pop-up
        aplicarAnotacao(tipoRef.current, corRef.current)
        return
      }
      const text = joinWords(words.map((w: any) => w.word))
      const acc = acumRef.current
      setPopup({ x: (left + right) / 2, y: top - 8, text, shown: acc ? prNormalize(acc + ' ' + text) : text })
    }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  // "Enviar para Palavras Destacadas"
  const enviar = () => {
    if (!popup) return
    onExtract?.(popup.shown)
    acumRef.current = ''; setAcumLen(0); setPopup(null); lastCapRef.current = null
  }
  // "Continuar compondo a frase"
  const compor = () => {
    if (!popup) return
    acumRef.current = popup.shown
    setAcumLen(acumRef.current.length); setPopup(null)
  }
  // ── PALAVRAS-CHAVE VIA IA (revisão antes de enviar) ──
  const [kw, setKw] = useState<{ loading: boolean; itens: { t: string; on: boolean }[]; erro?: string } | null>(null)
  const pedirPalavrasChave = async () => {
    if (!popup) return
    const trecho = popup.shown; setPopup(null)
    setKw({ loading: true, itens: [] })
    try {
      const lista = await gerarPalavrasChaveIA(trecho)
      setKw({ loading: false, itens: lista.map(t => ({ t, on: true })) })
    } catch (e: any) { setKw({ loading: false, itens: [], erro: e?.message || 'Falha na IA' }) }
  }
  const toggleKw = (i: number) => setKw(k => k && ({ ...k, itens: k.itens.map((x, j) => j === i ? { ...x, on: !x.on } : x) }))
  // posição do pop-up (arrastável e sempre visível na tela)
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 })
  useEffect(() => {
    if (!popup) return
    const W = 290, H = 300
    let x = popup.x - W / 2, y = popup.y - H
    x = Math.max(10, Math.min(x, window.innerWidth - W - 10))
    if (y < 10) y = popup.y + 26
    y = Math.max(10, Math.min(y, window.innerHeight - H - 10))
    setPopupPos({ x, y })
  }, [popup])
  const arrastarPopup = (e: React.MouseEvent) => {
    e.preventDefault()
    const ox = e.clientX - popupPos.x, oy = e.clientY - popupPos.y
    const move = (ev: MouseEvent) => setPopupPos({ x: Math.max(0, Math.min(ev.clientX - ox, window.innerWidth - 80)), y: Math.max(0, Math.min(ev.clientY - oy, window.innerHeight - 40)) })
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  const editKw = (i: number, v: string) => setKw(k => k && ({ ...k, itens: k.itens.map((x, j) => j === i ? { ...x, t: v } : x) }))
  const confirmarKw = () => {
    const sel = (kw?.itens || []).filter(x => x.on && x.t.trim()).map(x => x.t.trim())
    if (sel.length) sel.forEach(t => onExtract?.(t))   // cada palavra-chave vira um item no editor
    acumRef.current = ''; setAcumLen(0); lastCapRef.current = null; setKw(null)
  }

  // ── ANOTAÇÕES (realce/sublinhado) por retângulos de overlay ──
  const salvarAnot = () => { try { if (anotKeyRef.current) localStorage.setItem(anotKeyRef.current, JSON.stringify(anotRef.current)) } catch {} }
  // aplica realce/sublinhado na ÚLTIMA captura do marquee (frações por página, sobrevivem ao zoom)
  const aplicarAnotacao = (kind: 'realce' | 'sublinhado', cor?: string) => {
    const cap = lastCapRef.current; if (!cap || !cap.words.length) return
    const id = Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    let added = false
    for (const w of cap.words) {
      if (!pageElsRef.current[w.page]) continue
      ;(anotRef.current[w.page] ||= [])
      let a = anotRef.current[w.page].find((x: any) => x.id === id)
      if (!a) { a = { id, kind, cor: cor || '#fff3a3', rects: [] }; anotRef.current[w.page].push(a) }
      a.rects.push(w.frac); added = true
    }
    if (added) { pintarAnotacoes(); salvarAnot(); forceAnot(x => x + 1) }
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
  const onMouseMove = (e: React.MouseEvent) => { const r = viewBoxRef.current?.getBoundingClientRect(); if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top }); if (ferramenta === 'lupa') desenharLupa(e.clientX, e.clientY) }

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
        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600, maxWidth: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nome || '—'}</span>
        <span style={{ width: 1, height: 22, background: 'var(--border)' }} />
        {/* zoom + ajustar à largura */}
        <button onClick={() => mudarZoom(-0.15)} style={btn}>−</button>
        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', width: 42, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => mudarZoom(0.15)} style={btn}>+</button>
        <button onClick={ajustarLargura} title="Ajustar à largura" style={{ ...btn, width: 'auto', padding: '0 8px', background: fitWidth ? '#5b5bd6' : 'var(--surface)', color: fitWidth ? '#fff' : 'var(--text-secondary)', border: fitWidth ? 'none' : '1px solid var(--border)' }}>↔</button>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setTomOpen(o => !o)} title="Tonalização" style={{ ...btn, width: 'auto', padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, background: tom !== 'cor' ? '#5b5bd6' : 'var(--surface)', color: tom !== 'cor' ? '#fff' : 'var(--text-secondary)', border: tom !== 'cor' ? 'none' : '1px solid var(--border)' }}>
            {(TONS.find(t => t.id === tom) || TONS[0]).icon}<span style={{ fontSize: '0.6rem' }}>▾</span>
          </button>
          {tomOpen && (
            <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 30, width: 190, padding: 6, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.25)' }}>
              {TONS.map(t => (
                <button key={t.id} onClick={() => { setTom(t.id); setTomOpen(false) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 9px', borderRadius: 7, border: 'none', cursor: 'pointer', textAlign: 'left', background: t.id === tom ? 'var(--surface)' : 'transparent', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: t.id === tom ? 700 : 500 }}>
                  <span style={{ fontSize: '0.95rem', width: 18 }}>{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <span style={{ width: 1, height: 22, background: 'var(--border)' }} />

        {/* MODO: selecionar palavra(s)  vs  realçar */}
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <button onClick={() => setModo('selecionar')} title="Selecionar palavra(s) → enviar ao editor"
            style={{ height: 30, padding: '0 9px', border: 'none', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 700, background: modo === 'selecionar' ? '#5b5bd6' : 'var(--surface)', color: modo === 'selecionar' ? '#fff' : 'var(--text-secondary)' }}>✛ Selecionar</button>
          <button onClick={() => setModo('realcar')} title="Realçar / sublinhar com o retângulo"
            style={{ height: 30, padding: '0 9px', border: 'none', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 700, background: modo === 'realcar' ? '#5b5bd6' : 'var(--surface)', color: modo === 'realcar' ? '#fff' : 'var(--text-secondary)' }}>🖊 Realçar</button>
        </div>

        {/* opções do modo realçar */}
        {modo === 'realcar' && <>
          <button onClick={() => setTipoMarca('realce')} title="Realce" style={{ ...btn, width: 'auto', padding: '0 7px', background: tipoMarca === 'realce' ? '#5b5bd6' : 'var(--surface)', color: tipoMarca === 'realce' ? '#fff' : 'var(--text-secondary)' }}>✎</button>
          <button onClick={() => setTipoMarca('sublinhado')} title="Sublinhado" style={{ ...btn, width: 'auto', padding: '0 7px', background: tipoMarca === 'sublinhado' ? '#5b5bd6' : 'var(--surface)', color: tipoMarca === 'sublinhado' ? '#fff' : 'var(--text-secondary)' }}><u>S</u></button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setPaletaOpen(o => !o)} title="Cor do realce" style={{ ...btn, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: corRealce, border: '1px solid var(--border)' }} />▾
            </button>
            {paletaOpen && (
              <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 30, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, padding: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.25)' }}>
                {PALETA_REALCE.map(c => <button key={c} onClick={() => { setCorRealce(c); setPaletaOpen(false) }} style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', background: c, cursor: 'pointer' }} />)}
              </div>
            )}
          </div>
          <button onClick={limparAnotacoes} title="Limpar realces deste PDF" style={btn}>🧽</button>
        </>}

        <span style={{ width: 1, height: 22, background: 'var(--border)' }} />
        <Tool id="lupa" title="Lupa"><Icon e="🔍" size={15} /></Tool>
        <Tool id="mascara" title="Máscara de leitura">▭</Tool>
        <Tool id="regua" title="Régua de acompanhamento">▬</Tool>
        <Tool id="foco" title="Foco dinâmico">◎</Tool>
        <span style={{ width: 1, height: 22, background: 'var(--border)' }} />
        {/* OCR sob demanda da página atual */}
        <button onClick={() => ocrPagina(curPage)} disabled={!numPages || ocrStatus?.running}
          title="Reconhecer texto desta página (OCR) — para PDFs digitalizados/imagem"
          style={{ ...btn, width: 'auto', padding: '0 10px', background: ocrStatus?.running ? 'var(--surface)' : paginaImagem ? '#EA580C' : 'var(--surface)', color: ocrStatus?.running ? 'var(--text-muted)' : paginaImagem ? '#fff' : 'var(--text-secondary)', border: paginaImagem && !ocrStatus?.running ? 'none' : '1px solid var(--border)', whiteSpace: 'nowrap' }}>
          {ocrStatus?.running ? `OCR… ${ocrStatus.pct}%` : '🔎 OCR'}
        </button>

        <span style={{ flex: 1 }} />
        {/* indicador de página + ir para página (campo integrado, sem setinhas) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Página</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <input value={pageBox}
              onChange={e => { const v = e.target.value.replace(/\D/g, ''); setPageBox(v === '' ? ('' as any) : Number(v)) }}
              onKeyDown={e => { if (e.key === 'Enter') { irParaPagina(Number(pageBox) || 1); (e.target as HTMLInputElement).blur() } }}
              onBlur={() => irParaPagina(Number(pageBox) || 1)}
              inputMode="numeric" title="Digite a página e tecle Enter"
              style={{ width: Math.max(22, String(numPages || 1).length * 10), border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 700, textAlign: 'center', outline: 'none', fontFamily: 'var(--font-mono)', padding: 0 }} />
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>de {numPages || 0}</span>
          </div>
        </div>

        {/* alternador de visualização (sempre acessível, inclusive em tela cheia do PDF) */}
        <span style={{ width: 1, height: 22, background: 'var(--border)' }} />
        {(['pdf', 'split', 'editor'] as const).map(m => (
          <button key={m} onClick={() => setViewMode?.(m)} title={{ pdf: 'PDF em tela cheia', split: 'Dividido', editor: 'Editor em tela cheia' }[m]}
            style={{ ...btn, width: 'auto', padding: '0 7px', fontSize: '0.72rem', background: viewMode === m ? '#5b5bd6' : 'var(--surface)', color: viewMode === m ? '#fff' : 'var(--text-secondary)', border: viewMode === m ? 'none' : '1px solid var(--border)' }}>
            {{ pdf: '📄', split: '⬜', editor: '✦' }[m]}
          </button>
        ))}
      </div>

      {/* SCROLLER DO PDF + overlays de foco */}
      <div ref={viewBoxRef} style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={wrapRef} onMouseDown={onDown} onScroll={onScroll} style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: 18, background: 'var(--bg-subtle, #1112)', ['--pr-filter' as any]: tomFilter(tom) }}>
          {!numPages && <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Importe um PDF para começar a leitura.</div>}
        </div>
        {/* régua (confinada à coluna do PDF) */}
        {ferramenta === 'regua' && <div style={{ position: 'absolute', left: 0, right: 0, top: pos.y, height: 2, background: '#5b5bd6cc', pointerEvents: 'none', zIndex: 40 }} />}
        {/* máscara de leitura (faixa clara, resto escurecido) */}
        {ferramenta === 'mascara' && <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(0, pos.y - 26), background: 'rgba(0,0,0,0.55)', pointerEvents: 'none', zIndex: 40 }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: pos.y + 26, bottom: 0, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none', zIndex: 40 }} />
        </>}
        {/* foco dinâmico (vinheta radial seguindo o cursor) */}
        {ferramenta === 'foco' && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40, background: `radial-gradient(circle 140px at ${pos.x}px ${pos.y}px, transparent 0%, rgba(0,0,0,0.55) 100%)` }} />}
        {/* marquee (retângulo de captura) */}
        {box && <div style={{ position: 'fixed', left: box.left, top: box.top, width: box.width, height: box.height, border: '1.5px solid #5b5bd6', background: 'rgba(91,91,214,.12)', pointerEvents: 'none', zIndex: 46 }} />}
        {/* lupa: canvas circular ampliando a região sob o cursor */}
        <canvas ref={lensRef} width={LENS} height={LENS} style={{ position: 'fixed', left: lupa.x + 22, top: lupa.y - LENS - 16, width: LENS, height: LENS, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.9)', boxShadow: '0 8px 28px rgba(0,0,0,0.4)', pointerEvents: 'none', zIndex: 50, display: ferramenta === 'lupa' && lupa.show ? 'block' : 'none', background: '#fff', filter: tomFilter(tom) }} />
        {/* aviso: página é imagem (sem texto) */}
        {paginaImagem && !ocrStatus?.running && (
          <div onClick={() => ocrPagina(curPage)} title="Clique para reconhecer o texto"
            style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 48, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 20, background: '#EA580C', color: '#fff', fontSize: '0.76rem', fontWeight: 700, boxShadow: '0 6px 18px rgba(234,88,12,.4)', cursor: 'pointer' }}>
            📄 Página sem texto selecionável — clique para rodar OCR 🔎
          </div>
        )}
        {/* progresso do OCR */}
        {ocrStatus?.running && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 49, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.25)' }}>
            <div style={{ padding: '14px 22px', borderRadius: 12, background: 'var(--card-bg)', border: '1px solid var(--border)', boxShadow: '0 12px 36px rgba(0,0,0,.3)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              🔎 Reconhecendo texto da página {ocrStatus.page}… {ocrStatus.pct}%
              <div style={{ marginTop: 8, height: 5, borderRadius: 3, background: 'var(--surface)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${ocrStatus.pct}%`, background: '#5b5bd6', transition: 'width .2s' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* POP-UP DE DECISÃO — mostra o texto capturado */}
      {popup && createPortal(<>
        <div onMouseDown={() => setPopup(null)} style={{ position: 'fixed', inset: 0, zIndex: 6500 }} />
        <div style={{ position: 'fixed', left: popupPos.x, top: popupPos.y, zIndex: 6501, display: 'flex', flexDirection: 'column', gap: 6, padding: 10, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 36px rgba(0,0,0,0.35)', width: 280 }}>
          <div onMouseDown={arrastarPopup} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'move', marginBottom: 2, userSelect: 'none' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>⠿</span>
            <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{acumLen > 0 ? 'Frase em composição' : 'Texto capturado'}</span>
            <span style={{ flex: 1 }} />
            <button onMouseDown={e => { e.preventDefault(); acumRef.current = ''; setAcumLen(0); setPopup(null); lastCapRef.current = null }} title="Fechar" style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.4, maxHeight: 90, overflowY: 'auto', padding: '6px 8px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>{popup.shown}</div>
          <button onMouseDown={e => { e.preventDefault(); enviar() }} style={{ ...popBtn, background: '#15803D', color: '#fff', border: 'none', fontWeight: 700 }}>➜ Enviar para Palavras Destacadas</button>
          <button onMouseDown={e => { e.preventDefault(); pedirPalavrasChave() }} style={{ ...popBtn, background: '#EA580C', color: '#fff', border: 'none', fontWeight: 700 }}>✦ Extrair palavras-chave (IA)</button>
          <button onMouseDown={e => { e.preventDefault(); compor() }} style={popBtn}>＋ Continuar compondo a frase</button>
        </div>
      </>, document.body)}

      {/* REVISÃO DAS PALAVRAS-CHAVE (IA) — confirme antes de enviar ao editor */}
      {kw && createPortal(<>
        <div onMouseDown={() => setKw(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 8200 }} />
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 8201, width: 'min(440px,94vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,.42)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: '1.05rem' }}>✦</span><b style={{ color: 'var(--text-primary)' }}>Palavras-chave</b>
            <span style={{ flex: 1 }} /><button onMouseDown={e => { e.preventDefault(); setKw(null) }} style={btn}>✕</button>
          </div>
          {kw.loading && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>Extraindo palavras-chave…</div>}
          {kw.erro && <div style={{ padding: '12px', color: '#DC2626', fontSize: '0.82rem' }}>⚠ {kw.erro}</div>}
          {!kw.loading && !kw.erro && (<>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 8 }}>Revise, edite ou desmarque. As marcadas vão para o editor (uma por linha).</div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
              {kw.itens.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', padding: 8 }}>Nenhuma palavra-chave retornada.</div>}
              {kw.itens.map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 8, background: it.on ? 'var(--surface)' : 'transparent', border: '1px solid var(--border)' }}>
                  <input type="checkbox" checked={it.on} onChange={() => toggleKw(i)} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#5b5bd6' }} />
                  <input value={it.t} onChange={e => editKw(i, e.target.value)} style={{ flex: 1, border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.86rem', outline: 'none', opacity: it.on ? 1 : 0.5 }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onMouseDown={e => { e.preventDefault(); setKw(k => k && ({ ...k, itens: k.itens.map(x => ({ ...x, on: true })) })) }} style={{ ...btn, width: 'auto', flex: '0 0 auto', padding: '0 10px', fontWeight: 600 }}>Todas</button>
              <button onMouseDown={e => { e.preventDefault(); setKw(k => k && ({ ...k, itens: k.itens.map(x => ({ ...x, on: false })) })) }} style={{ ...btn, width: 'auto', flex: '0 0 auto', padding: '0 10px', fontWeight: 600 }}>Nenhuma</button>
              <span style={{ flex: 1 }} />
              <button onMouseDown={e => { e.preventDefault(); confirmarKw() }} style={{ height: 30, padding: '0 16px', borderRadius: 8, border: 'none', background: '#5b5bd6', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>✓ Enviar {kw.itens.filter(x => x.on).length}</button>
            </div>
          </>)}
        </div>
      </>, document.body)}
    </div>
  )
}
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
      <button onClick={onToggle} title="Abrir pastas" style={{ ...btn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon e="📁" size={16} /></button>
    </div>
  )

  const nivel = (pid: string | null, depth: number): any => (<>
    {pastas.filter((p: any) => (p.parentId ?? null) === pid).map((p: any) => {
      const aberta = exp[p.id]; const nf = docs.filter((d: any) => d.folderId === p.id).length
      return (
        <div key={p.id}>
          <div className="pr-row" draggable onDragStart={() => (drag.current = { tipo: 'pasta', id: p.id })} onDragOver={e => e.preventDefault()} onDrop={() => soltar(p.id)} style={{ paddingLeft: 6 + depth * 14 }}>
            <span onClick={() => toggle(p.id)} style={{ cursor: 'pointer', width: 12, display: 'inline-block' }}>{aberta ? '▾' : '▸'}</span>
            <span onClick={() => toggle(p.id)} style={{ flex: 1, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-flex', color: p.cor || '#EAB308' }}><Icon e="📁" size={15} /></span>
              {p.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>({nf})</span>
            </span>
            <span className="pr-acts">
              <button title="Novo documento" onClick={() => onNewDoc(p.id)} style={miniBtn}>📄</button>
              <button title="Nova subpasta" onClick={() => novaPasta(p.id)} style={miniBtn}>📁</button>
              <button title="Renomear" onClick={() => renomearPasta(p)} style={miniBtn}>✎</button>
              <label title="Cor da pasta" style={{ ...miniBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative', cursor: 'pointer' }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.cor || '#EAB308', border: '1px solid var(--border)', display: 'inline-block' }} />
                <input type="color" value={p.cor || '#EAB308'} onChange={e => salvarPasta({ id: p.id, cor: e.target.value })}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
              </label>
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
  const [workerUrl, setWorkerUrl] = useState(cur.workerUrl || '')
  const [status, setStatus] = useState('')
  const presetGemini = () => { setUrl('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'); setModel('gemini-2.5-flash') }
  const salvar = async () => { await store.salvarAiCfg({ kind, url, key, model, workerUrl }); setStatus(store.uid ? '✓ Salvo e sincronizado' : '✓ Salvo neste navegador') }
  const testar = async () => {
    setStatus('Testando…')
    try { await store.salvarAiCfg({ kind, url, key, model, workerUrl }); const r = await gerarPerguntasIA('Direito Administrativo', 'Conceito e princípios.'); setStatus(r.length ? `✓ Funcionou — ${r.length} perguntas geradas` : '⚠ Resposta vazia (verifique modelo/endpoint)') }
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
      {kind === 'gemini' && <>
        <label style={lblCfg}>Worker URL (fallback — opcional)</label>
        <input value={workerUrl} onChange={e => setWorkerUrl(e.target.value)} placeholder="https://nexus-gemini.SEU-USUARIO.workers.dev" style={inpCfg} />
        <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>Se a chamada direta ao Gemini falhar (ex.: bloqueio de rede no trabalho), o NexusOS usa este proxy automaticamente.</div>
      </>}
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


/* ═══════════════════════════════ DIÁRIO DE LEITURA (Firestore) ═══════════════════════════════
   users/{uid}/leituraConcursos/{id}   -> { id, nome, criadoEm }
   users/{uid}/leituraDisciplinas/{id} -> { id, concursoId, nome }
   users/{uid}/leituraItens/{id}       -> { id, disciplinaId, tipo:'pdf'|'lei', titulo, descricao, total, atual, lido, estudado } */
function useDiarioStore() {
  const uid = useUid()
  const [concursos, setConcursos] = useState<any[]>([])
  const [disciplinas, setDisciplinas] = useState<any[]>([])
  const [itens, setItens] = useState<any[]>([])
  const discRef = useRef<any[]>([]); useEffect(() => { discRef.current = disciplinas }, [disciplinas])
  const itensRef = useRef<any[]>([]); useEffect(() => { itensRef.current = itens }, [itens])
  useEffect(() => {
    if (!uid) return
    const a = onSnapshot(collection(db, 'users', uid, 'leituraConcursos'), s => setConcursos(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    const b = onSnapshot(collection(db, 'users', uid, 'leituraDisciplinas'), s => setDisciplinas(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    const c = onSnapshot(collection(db, 'users', uid, 'leituraItens'), s => setItens(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    return () => { a(); b(); c() }
  }, [uid])
  const salvarConcurso = useCallback(async (o: any) => { if (uid) await setDoc(doc(db, 'users', uid, 'leituraConcursos', o.id), clean(o), { merge: true }) }, [uid])
  const removerConcurso = useCallback(async (id: string) => {
    if (!uid) return
    const discs = discRef.current.filter(d => d.concursoId === id).map(d => d.id)
    for (const it of itensRef.current) if (discs.includes(it.disciplinaId)) await deleteDoc(doc(db, 'users', uid, 'leituraItens', it.id))
    for (const did of discs) await deleteDoc(doc(db, 'users', uid, 'leituraDisciplinas', did))
    await deleteDoc(doc(db, 'users', uid, 'leituraConcursos', id))
  }, [uid])
  const salvarDisciplina = useCallback(async (o: any) => { if (uid) await setDoc(doc(db, 'users', uid, 'leituraDisciplinas', o.id), clean(o), { merge: true }) }, [uid])
  const removerDisciplina = useCallback(async (id: string) => {
    if (!uid) return
    for (const it of itensRef.current) if (it.disciplinaId === id) await deleteDoc(doc(db, 'users', uid, 'leituraItens', it.id))
    await deleteDoc(doc(db, 'users', uid, 'leituraDisciplinas', id))
  }, [uid])
  const salvarItem = useCallback(async (o: any) => { if (uid) await setDoc(doc(db, 'users', uid, 'leituraItens', o.id), clean(o), { merge: true }) }, [uid])
  const removerItem = useCallback(async (id: string) => { if (uid) await deleteDoc(doc(db, 'users', uid, 'leituraItens', id)) }, [uid])
  return { uid, concursos, disciplinas, itens, salvarConcurso, removerConcurso, salvarDisciplina, removerDisciplina, salvarItem, removerItem }
}

const Barra = ({ pct, cor }: any) => (
  <div style={{ height: 7, borderRadius: 4, background: 'var(--surface)', overflow: 'hidden', flex: 1 }}>
    <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct || 0))}%`, background: cor || '#5b5bd6', transition: 'width .3s', borderRadius: 4 }} />
  </div>
)
const inpD: any = { padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }
/* campo numérico com estado local: digita livremente e salva ao sair do campo ou no Enter
   (evita o "trava" causado por depender do retorno do Firestore a cada tecla) */
function NumInput({ valor, onSave, width = 70 }: any) {
  const [v, setV] = useState(String(valor ?? 0))
  const focado = useRef(false)
  useEffect(() => { if (!focado.current) setV(String(valor ?? 0)) }, [valor])
  const commit = () => { const n = v.trim() === '' ? 0 : Math.max(0, Number(v.replace(/\D/g, '')) || 0); onSave(n); setV(String(n)) }
  return (
    <input type="text" inputMode="numeric" value={v}
      onFocus={e => { focado.current = true; e.currentTarget.select() }}
      onChange={e => setV(e.target.value.replace(/\D/g, ''))}
      onBlur={() => { focado.current = false; commit() }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      style={{ ...inpD, width, textAlign: 'center', fontFamily: 'var(--font-mono)' }} />
  )
}
const DIFIC = [
  { id: 'tranquila', emoji: '😌', label: 'Tranquila', cor: '#16A34A' },
  { id: 'mediana', emoji: '😐', label: 'Mediana', cor: '#EA580C' },
  { id: 'dificil', emoji: '🥵', label: 'Difícil', cor: '#DC2626' },
]

function DiarioLeitura({ onClose }: any) {
  const st = useDiarioStore()
  const [sel, setSel] = useState<string | null>(null)
  const [novoConc, setNovoConc] = useState('')
  const [aberta, setAberta] = useState<Record<string, boolean>>({})        // disciplinas abertas
  const [abaTipo, setAbaTipo] = useState<Record<string, 'pdf' | 'lei' | 'info'>>({})  // sub-aba por disciplina
  const [filtroDif, setFiltroDif] = useState<string>('')  // '', 'tranquila', 'mediana', 'dificil'
  const [estudoDe, setEstudoDe] = useState<any | null>(null)
  const [estudoTxt, setEstudoTxt] = useState('')

  useEffect(() => { if (!sel && st.concursos.length) setSel(st.concursos[0].id) }, [st.concursos, sel])

  const addConcurso = () => { const nome = novoConc.trim(); if (!nome) return; const id = newId(); st.salvarConcurso({ id, nome, criadoEm: Date.now() }); setNovoConc(''); setSel(id) }
  const addDisciplina = () => { if (!sel) return; const nome = prompt('Nome da disciplina:'); if (nome?.trim()) { const id = newId(); st.salvarDisciplina({ id, concursoId: sel, nome: nome.trim() }); setAberta(a => ({ ...a, [id]: true })) } }
  const addItem = (disciplinaId: string, tipo: 'pdf' | 'lei' | 'info') => st.salvarItem({ id: newId(), disciplinaId, tipo, titulo: tipo === 'pdf' ? 'Novo PDF' : tipo === 'lei' ? 'Nova legislação' : 'Informativo', descricao: '', tribunal: tipo === 'info' ? 'STF' : '', total: 0, atual: 0, lido: false, estudado: '', criadoEm: Date.now() })

  const discs = st.disciplinas.filter(d => d.concursoId === sel)
  const itensDe = (did: string) => st.itens.filter(i => i.disciplinaId === did)
  const pctItem = (it: any) => it.total > 0 ? (it.atual / it.total) * 100 : (it.lido ? 100 : 0)
  // progresso de uma disciplina = média do progresso de seus itens
  const pctDisc = (did: string) => { const its = itensDe(did); if (!its.length) return 0; return its.reduce((s, it) => s + pctItem(it), 0) / its.length }
  // progresso do concurso = média das disciplinas (que têm itens)
  const pctConc = (cid: string) => { const ds = st.disciplinas.filter(d => d.concursoId === cid).filter(d => itensDe(d.id).length); if (!ds.length) return 0; return ds.reduce((s, d) => s + pctDisc(d.id), 0) / ds.length }

  const META: any = {
    pdf: { ico: '📄', lbl: 'PDFs', uni: 'pág.', campo: 'Página' },
    lei: { ico: '§', lbl: 'Leis', uni: 'art.', campo: 'Artigo' },
    info: { ico: '⚖️', lbl: 'Informativos', uni: 'info', campo: 'Info nº' },
  }

  const abrirEstudo = (it: any) => { setEstudoDe(it); setEstudoTxt(it.estudado || '') }
  const salvarEstudo = () => { if (estudoDe) st.salvarItem({ id: estudoDe.id, estudado: estudoTxt }); setEstudoDe(null) }

  const renderItem = (it: any) => {
    const pct = pctItem(it); const m = META[it.tipo] || META.pdf
    return (
      <div key={it.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px', background: it.lido ? 'rgba(22,163,74,.06)' : 'var(--card-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: '0.95rem' }}>{m.ico}</span>
          <input defaultValue={it.titulo} onBlur={e => st.salvarItem({ id: it.id, titulo: e.target.value })} placeholder={it.tipo === 'info' ? 'Título do informativo' : 'Título'} style={{ ...inpD, flex: 1, minWidth: 80, fontWeight: 600 }} />
          {it.tipo === 'info' && (
            <select value={it.tribunal || 'STF'} onChange={e => st.salvarItem({ id: it.id, tribunal: e.target.value })} style={{ ...inpD, width: 78, flex: '0 0 auto', padding: '5px 6px', cursor: 'pointer' }}>
              <option>STF</option><option>STJ</option><option value="Outro">Outro</option>
            </select>
          )}
          {it.tipo === 'info' && it.tribunal === 'Outro' && (
            <input defaultValue={it.tribunalLivre || ''} onBlur={e => st.salvarItem({ id: it.id, tribunalLivre: e.target.value })} placeholder="Tribunal" style={{ ...inpD, width: 80, flex: '0 0 auto' }} />
          )}
          {/* classificação de dificuldade da leitura */}
          <div style={{ display: 'flex', gap: 2 }}>
            {DIFIC.map(d => (
              <button key={d.id} onClick={() => st.salvarItem({ id: it.id, dificuldade: it.dificuldade === d.id ? '' : d.id })} title={d.label}
                style={{ width: 26, height: 26, borderRadius: 6, border: it.dificuldade === d.id ? `2px solid ${d.cor}` : '1px solid var(--border)', background: it.dificuldade === d.id ? d.cor + '22' : 'var(--surface)', cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1, padding: 0, opacity: it.dificuldade && it.dificuldade !== d.id ? 0.4 : 1 }}>{d.emoji}</button>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={!!it.lido} onChange={e => st.salvarItem({ id: it.id, lido: e.target.checked })} style={{ accentColor: '#16A34A', width: 15, height: 15 }} /> {it.tipo === 'info' ? 'em dia' : 'lido'}
          </label>
          <button onClick={() => abrirEstudo(it)} title="O que foi estudado" style={{ ...btn, width: 'auto', padding: '0 8px', fontSize: '0.7rem', background: it.estudado ? '#5b5bd6' : 'var(--surface)', color: it.estudado ? '#fff' : 'var(--text-secondary)', border: it.estudado ? 'none' : '1px solid var(--border)' }}>📝</button>
          <button onClick={() => { if (confirm('Excluir este item?')) st.removerItem(it.id) }} title="Excluir" style={{ ...btn, width: 'auto', padding: '0 7px' }}>🗑</button>
        </div>
        <input defaultValue={it.descricao} onBlur={e => st.salvarItem({ id: it.id, descricao: e.target.value })} placeholder={it.tipo === 'info' ? 'Tema / assunto da jurisprudência…' : 'Descrição (tema, assunto, observações…)'} style={{ ...inpD, width: '100%', boxSizing: 'border-box', marginBottom: 8, fontSize: '0.78rem', color: 'var(--text-secondary)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{m.campo}</span>
          <NumInput valor={it.atual} onSave={(n: number) => st.salvarItem({ id: it.id, atual: n })} />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>de</span>
          <NumInput valor={it.total} onSave={(n: number) => st.salvarItem({ id: it.id, total: n })} />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.uni}</span>
          <Barra pct={pct} cor="#5b5bd6" />
          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#5b5bd6', width: 38, textAlign: 'right' }}>{Math.round(pct)}%</span>
        </div>
      </div>
    )
  }

  return createPortal(<>
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9000 }} />
    <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 9001, width: '94vw', height: '92vh', maxWidth: 1180, display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 30px 90px rgba(0,0,0,.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,rgba(91,91,214,.12),transparent)' }}>
        <span style={{ display: 'inline-flex', color: '#5b5bd6' }}><Icon e="📖" size={22} /></span>
        <b style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>Diário de Leitura</b>
        <span style={{ flex: 1 }} />
        {!st.uid && <span style={{ fontSize: '0.72rem', color: '#EA580C' }}>Faça login para salvar</span>}
        <button onClick={onClose} style={btn}>✕</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* concursos / temas */}
        <div style={{ width: 250, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 7 }}>Concursos / Temas</div>
            <div style={{ display: 'flex', gap: 5 }}>
              <input value={novoConc} onChange={e => setNovoConc(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addConcurso() }} placeholder="Ex.: PGM-BH, AGU…" style={{ ...inpD, flex: 1, minWidth: 0 }} />
              <button onClick={addConcurso} title="Adicionar" style={{ ...btn, background: '#5b5bd6', color: '#fff', border: 'none' }}>＋</button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8 }}>
            {st.concursos.length === 0 && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: 8 }}>Crie um concurso ou tema acima.</div>}
            {st.concursos.map(c => {
              const p = pctConc(c.id); const nd = st.disciplinas.filter(d => d.concursoId === c.id).length
              const on = sel === c.id
              return (
                <div key={c.id} onClick={() => setSel(c.id)} style={{ padding: '9px 10px', borderRadius: 9, cursor: 'pointer', marginBottom: 4, background: on ? '#5b5bd6' : 'transparent', color: on ? '#fff' : 'var(--text-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ flex: 1, fontWeight: on ? 700 : 600, fontSize: '0.86rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</span>
                    <span style={{ fontSize: '0.74rem', fontWeight: 700 }}>{Math.round(p)}%</span>
                    <button onClick={e => { e.stopPropagation(); if (confirm(`Excluir "${c.nome}" e tudo dentro?`)) st.removerConcurso(c.id) }} title="Excluir" style={{ border: 'none', background: 'transparent', color: on ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem' }}>🗑</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                    <Barra pct={p} cor={on ? '#fff' : '#16A34A'} />
                    <span style={{ fontSize: '0.6rem', opacity: 0.8, whiteSpace: 'nowrap' }}>{nd} disc.</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* conteúdo do concurso */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {!sel ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Selecione um concurso/tema.</div> : <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <b style={{ fontSize: '0.98rem', color: 'var(--text-primary)' }}>{st.concursos.find(c => c.id === sel)?.nome}</b>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#16A34A' }}>{Math.round(pctConc(sel))}% concluído</span>
              {(() => {
                const dids = discs.map(d => d.id)
                const dificeis = st.itens.filter(i => dids.includes(i.disciplinaId) && i.dificuldade === 'dificil').length
                const medianos = st.itens.filter(i => dids.includes(i.disciplinaId) && i.dificuldade === 'mediana').length
                if (!dificeis && !medianos) return null
                return (
                  <button onClick={() => setFiltroDif(f => f === 'dificil' ? '' : 'dificil')} title="Filtrar itens difíceis em todas as disciplinas"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 16, border: filtroDif === 'dificil' ? '2px solid #DC2626' : '1px solid var(--border)', background: filtroDif === 'dificil' ? '#DC262615' : 'var(--surface)', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {!!dificeis && <span style={{ color: '#DC2626' }}>🥵 {dificeis} difícil{dificeis > 1 ? 's' : ''}</span>}
                    {!!medianos && <span style={{ color: '#EA580C' }}>😐 {medianos}</span>}
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>· revisar</span>
                  </button>
                )
              })()}
              <span style={{ flex: 1 }} />
              <button onClick={addDisciplina} style={{ ...btn, width: 'auto', padding: '0 12px', background: '#5b5bd6', color: '#fff', border: 'none', fontWeight: 700 }}>＋ Disciplina</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {discs.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>Nenhuma disciplina ainda. Clique em "＋ Disciplina".</div>}
              {discs.map(d => {
                const its = itensDe(d.id)
                const cont = { pdf: its.filter(i => i.tipo === 'pdf'), lei: its.filter(i => i.tipo === 'lei'), info: its.filter(i => i.tipo === 'info') }
                const lidos = its.filter(i => i.lido).length
                const p = pctDisc(d.id); const isOpen = !!aberta[d.id] || !!filtroDif
                const aba = abaTipo[d.id] || 'pdf'
                const lista = (cont[aba] as any[]).filter(i => !filtroDif || i.dificuldade === filtroDif)
                return (
                  <div key={d.id} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card-bg)' }}>
                    {/* cabeçalho recolhível */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'var(--surface)', cursor: 'pointer' }} onClick={() => setAberta(a => ({ ...a, [d.id]: !a[d.id] }))}>
                      <span style={{ width: 14, color: 'var(--text-muted)' }}>{isOpen ? '▾' : '▸'}</span>
                      <b style={{ flex: 1, minWidth: 0, fontSize: '0.92rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.nome}</b>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>📄{cont.pdf.length} · §{cont.lei.length} · ⚖️{cont.info.length}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>· {lidos}/{its.length} ok</span>
                      <div style={{ width: 100, display: 'flex' }}><Barra pct={p} cor="#16A34A" /></div>
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#16A34A', width: 38, textAlign: 'right' }}>{Math.round(p)}%</span>
                      <button onClick={e => { e.stopPropagation(); const nome = prompt('Renomear disciplina:', d.nome); if (nome?.trim()) st.salvarDisciplina({ id: d.id, nome: nome.trim() }) }} title="Renomear" style={{ ...btn, width: 'auto', padding: '0 7px' }}>✎</button>
                      <button onClick={e => { e.stopPropagation(); if (confirm(`Excluir disciplina "${d.nome}"?`)) st.removerDisciplina(d.id) }} title="Excluir" style={{ ...btn, width: 'auto', padding: '0 7px' }}>🗑</button>
                    </div>
                    {/* corpo (só quando aberta) */}
                    {isOpen && (
                      <div style={{ padding: 12 }}>
                        {/* sub-abas por tipo */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                          {(['pdf', 'lei', 'info'] as const).map(t => (
                            <button key={t} onClick={() => setAbaTipo(a => ({ ...a, [d.id]: t }))}
                              style={{ height: 30, padding: '0 11px', borderRadius: 8, border: aba === t ? 'none' : '1px solid var(--border)', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700, background: aba === t ? '#5b5bd6' : 'var(--surface)', color: aba === t ? '#fff' : 'var(--text-secondary)' }}>
                              {META[t].ico} {META[t].lbl} <span style={{ opacity: 0.75 }}>({cont[t].length})</span>
                            </button>
                          ))}
                          <span style={{ flex: 1 }} />
                          {/* filtro por dificuldade */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginRight: 6 }}>
                            <button onClick={() => setFiltroDif('')} title="Todas as dificuldades" style={{ height: 28, padding: '0 8px', borderRadius: 7, border: filtroDif === '' ? 'none' : '1px solid var(--border)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, background: filtroDif === '' ? '#5b5bd6' : 'var(--surface)', color: filtroDif === '' ? '#fff' : 'var(--text-secondary)' }}>Todas</button>
                            {DIFIC.map(df => (
                              <button key={df.id} onClick={() => setFiltroDif(f => f === df.id ? '' : df.id)} title={`Filtrar: ${df.label}`}
                                style={{ width: 28, height: 28, borderRadius: 7, border: filtroDif === df.id ? `2px solid ${df.cor}` : '1px solid var(--border)', cursor: 'pointer', fontSize: '0.9rem', padding: 0, background: filtroDif === df.id ? df.cor + '22' : 'var(--surface)' }}>{df.emoji}</button>
                            ))}
                          </div>
                          <button onClick={() => addItem(d.id, aba)} style={{ ...btn, width: 'auto', padding: '0 12px', background: '#5b5bd6', color: '#fff', border: 'none', fontWeight: 700 }}>＋ {META[aba].lbl.replace(/s$/, '')}</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {lista.length === 0 && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '4px 6px' }}>{filtroDif ? `Nenhum item ${DIFIC.find(x => x.id === filtroDif)?.label.toLowerCase()} em ${META[aba].lbl}.` : `Nenhum item em ${META[aba].lbl}. Clique em "＋ ${META[aba].lbl.replace(/s$/, '')}".`}</div>}
                          {lista.sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0)).map(renderItem)}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>}
        </div>
      </div>
    </div>

    {/* modal "o que foi estudado" */}
    {estudoDe && createPortal(<>
      <div onMouseDown={() => setEstudoDe(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9100 }} />
      <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 9101, width: 'min(560px,94vw)', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,.45)', padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: '1.05rem' }}>📝</span>
          <b style={{ color: 'var(--text-primary)' }}>O que foi estudado</b>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>· {estudoDe.titulo}</span>
          <span style={{ flex: 1 }} /><button onClick={() => setEstudoDe(null)} style={btn}>✕</button>
        </div>
        <textarea value={estudoTxt} onChange={e => setEstudoTxt(e.target.value)} placeholder="Descreva o que foi abordado/estudado neste material…" autoFocus
          style={{ width: '100%', minHeight: 200, boxSizing: 'border-box', padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.5, resize: 'vertical', outline: 'none' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button onClick={() => setEstudoDe(null)} style={{ ...btn, width: 'auto', padding: '0 14px' }}>Cancelar</button>
          <button onClick={salvarEstudo} style={{ ...btn, width: 'auto', padding: '0 16px', background: '#5b5bd6', color: '#fff', border: 'none', fontWeight: 700 }}>💾 Salvar</button>
        </div>
      </div>
    </>, document.body)}
  </>, document.body)
}

export default function PDFReader() {
  const editorRef = useRef<HTMLDivElement>(null)
  const store = usePdfReaderStore()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [previa, setPrevia] = useState<string | null>(null)
  const [cfgIA, setCfgIA] = useState(false)
  const [diario, setDiario] = useState(false)
  const [split, setSplit] = useState(0.56)
  const [viewMode, setViewMode] = useState<'split' | 'pdf' | 'editor'>('split')               // fração de largura da coluna do PDF
  const rowRef = useRef<HTMLDivElement>(null)
  const startSplit = (e: React.MouseEvent) => {
    e.preventDefault()
    const move = (ev: MouseEvent) => { const r = rowRef.current?.getBoundingClientRect(); if (!r) return; let p = (ev.clientX - r.left) / r.width; p = Math.max(0.28, Math.min(0.78, p)); setSplit(p) }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.style.userSelect = '' }
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
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
      {/* linha redimensionável: PDF | divisória | editor */}
      <div ref={rowRef} style={{ flex: 1, minWidth: 0, display: 'flex' }}>
        {/* coluna PDF */}
        <div style={{ flexBasis: viewMode === 'editor' ? '0%' : viewMode === 'pdf' ? '100%' : `${split * 100}%`, flexGrow: 0, flexShrink: 0, minWidth: 0, overflow: 'hidden', display: viewMode === 'editor' ? 'none' : 'block' }}>
          <PdfViewer onExtract={onExtract} viewMode={viewMode} setViewMode={setViewMode} />
        </div>
        {/* divisória arrastável — só no modo dividido */}
        {viewMode === 'split' && (
          <div onMouseDown={startSplit} title="Arraste para ajustar" style={{ width: 6, flexShrink: 0, cursor: 'col-resize', background: 'var(--border)' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#5b5bd6')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--border)')} />
        )}
        {/* coluna editor */}
        <div style={{ flex: 1, minWidth: 0, display: viewMode === 'pdf' ? 'none' : 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>✦</span>
          <input value={titulo} onChange={e => onTitulo(e.target.value)} placeholder="Título do documento" disabled={!store.uid}
            style={{ flex: 1, minWidth: 60, border: '1px solid transparent', background: 'transparent', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.88rem', padding: '4px 6px', borderRadius: 7, outline: 'none' }}
            onFocus={e => (e.target.style.border = '1px solid var(--border)')} onBlur={e => (e.target.style.border = '1px solid transparent')} />
          <span title={salvo ? 'Salvo' : 'Não salvo'} style={{ fontSize: '0.8rem', color: salvo ? '#22c55e' : '#EA580C', flexShrink: 0, marginRight: 2 }}>{salvo ? '✓' : '●'}</span>
          {/* botões de modo de visualização — só ícones, agrupados */}
          <div style={{ display: 'flex', gap: 2, flexShrink: 0, background: 'var(--surface)', borderRadius: 8, padding: 2 }}>
            {(['pdf', 'split', 'editor'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)} title={{ pdf: 'Tela cheia: PDF', split: 'Dividido', editor: 'Tela cheia: Editor' }[m]}
                style={{ ...btn, width: 30, padding: 0, background: viewMode === m ? '#5b5bd6' : 'transparent', color: viewMode === m ? '#fff' : 'var(--text-secondary)', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon e={{ pdf: '📄', split: '⬜', editor: '✦' }[m]} size={16} />
              </button>
            ))}
          </div>
          <span style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />
          <button onClick={() => setDiario(true)} title="Diário de Leitura" style={{ ...btn, width: 32, padding: 0, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon e="📖" size={16} /></button>
          <button onClick={() => setCfgIA(true)} title="Configurar IA" style={{ ...btn, width: 32, padding: 0, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon e="⚙" size={16} /></button>
          <button onClick={onSalvar} disabled={!store.uid} title="Salvar (Firestore)" style={{ ...btn, width: 32, padding: 0, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon e="💾" size={16} /></button>
          <button onClick={abrirPrevia} title="Exportar / Imprimir" style={{ ...btn, width: 'auto', padding: '0 11px', background: '#5b5bd6', color: '#fff', border: 'none', fontSize: '0.78rem', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon e="🖨️" size={14} /> Exportar</button>
        </div>
        {!store.uid && <div style={{ padding: '6px 12px', fontSize: '0.7rem', color: '#EA580C', background: 'var(--surface)' }}>Faça login para salvar documentos no Firestore.</div>}
        <div style={{ flex: 1, minHeight: 0 }}>
          <RichEditor editorRef={editorRef} onChange={onEditorChange} />
        </div>
      </div>
      </div>
      {previa != null && <PreviaImpressao html={previa} titulo={titulo || 'Palavras Destacadas'} onClose={() => setPrevia(null)} />}
      {cfgIA && <ConfigIAModal store={store} onClose={() => setCfgIA(false)} />}
      {diario && <DiarioLeitura onClose={() => setDiario(false)} />}
      <style>{`
        .pr-page{position:relative;margin:0 auto 16px;background:#fff;border-radius:4px;box-shadow:0 2px 14px rgba(0,0,0,.18);overflow:hidden;cursor:crosshair}
        .pr-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#c4c4c4;font:600 22px/1 system-ui;z-index:0}
        .pr-page canvas{position:relative;z-index:1;display:block;filter:var(--pr-filter,none)}
        .pr-textlayer{position:absolute;top:0;left:0;overflow:hidden;line-height:1;z-index:3;transform-origin:0 0;opacity:1;user-select:none}
        .pr-textlayer span,.pr-textlayer br{color:transparent;position:absolute;white-space:pre;cursor:crosshair;transform-origin:0 0;user-select:none}
        .pr-row{display:flex;align-items:center;gap:4px;padding:5px 6px;border-radius:7px;font-size:.82rem;color:var(--text-secondary)}
        .pr-row:hover{background:var(--surface)}
        .pr-acts{display:none;gap:1px;flex-shrink:0}
        .pr-row:hover .pr-acts{display:flex}
      `}</style>
    </div>
  )
}
