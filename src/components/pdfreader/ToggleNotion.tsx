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
    if (par.r.trim()) out.push({ ...blocoVazio(nivelBase + 1), html: escapeHtml(par.r.trim()) })
  }
  return out
}
// constrói blocos a partir de grupos (título + perguntas dentro)
function blocosDeGrupos(grupos: { grupo: string; itens: { p: string; r: string }[] }[]): Bloco[] {
  const out: Bloco[] = []
  for (const g of grupos) {
    if (g.grupo && g.grupo.trim()) out.push({ ...blocoVazio(0), grupo: true, aberto: true, html: `<b>${escapeHtml(g.grupo.trim())}</b>` })
    for (const par of (g.itens || [])) {
      if (!par.p?.trim()) continue
      out.push({ ...blocoVazio(0), html: `<b>${escapeHtml(par.p.trim())}</b>`, aberto: !par.r?.trim() })
      if (par.r?.trim()) out.push({ ...blocoVazio(1), html: escapeHtml(par.r.trim()) })
    }
  }
  return out.length ? out : [blocoVazio()]
}
function promptQAGrupos(t: string): string {
  return `Abaixo há um documento de estudo com perguntas e respostas, possivelmente organizado em tópicos/títulos/seções (ex.: "Introdução", "Princípios", "Casos concretos").
Tarefa: (1) identifique os tópicos/títulos que agrupam as perguntas; (2) separe cada pergunta da respectiva resposta, mantendo-as dentro do tópico correto.
Responda APENAS com um array JSON válido, sem texto antes ou depois, no formato:
[{"grupo":"Título do tópico","itens":[{"p":"pergunta","r":"resposta"}]}]
Regras: se uma pergunta não tiver resposta clara, use "r":"". Se o documento não tiver tópicos evidentes, devolva um único grupo com "grupo":"" contendo todos os itens. Preserve o conteúdo — não invente perguntas nem respostas. Texto:\n\n${t}`
}
function parseJSONgrupos(raw: string): { grupo: string; itens: { p: string; r: string }[] }[] {
  let s = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim()
  const m = s.match(/\[[\s\S]*\]/); if (m) s = m[0]
  try {
    const arr = JSON.parse(s); if (!Array.isArray(arr)) return []
    return arr.map((g: any) => ({
      grupo: String(g.grupo || g.titulo || g.topico || '').trim(),
      itens: (Array.isArray(g.itens || g.pares || g.perguntas) ? (g.itens || g.pares || g.perguntas) : []).map((x: any) => ({ p: String(x.p || x.pergunta || '').trim(), r: String(x.r || x.resposta || '').trim() })).filter((x: any) => x.p),
    })).filter(g => g.itens.length)
  } catch { return [] }
}
// heurística: a linha é um título/tópico? (para PDFs sem marcação)
function ehTituloTxt(t: string): boolean {
  const s = t.trim()
  if (s.length < 3 || s.length > 70) return false
  if (/[?]/.test(s)) return false
  if (ehPerguntaTxt(s)) return false
  if (/^(t[íi]tulo|cap[íi]tulo|se[çc][ãa]o|parte|tema|t[óo]pico|unidade|m[óo]dulo)\b/i.test(s)) return true
  const letras = s.replace(/[^A-Za-zÀ-ú]/g, '')
  if (letras.length >= 3 && s === s.toUpperCase() && /[A-ZÀ-Ú]/.test(s) && !/[.;:]$/.test(s)) return true
  return false
}
function parseJSONpares(raw: string): { p: string; r: string }[] {
  let s = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim()
  const m = s.match(/\[[\s\S]*\]/); if (m) s = m[0]
  try { const arr = JSON.parse(s); return Array.isArray(arr) ? arr.map((x: any) => ({ p: String(x.p || x.pergunta || '').trim(), r: String(x.r || x.resposta || '').trim() })).filter(x => x.p) : [] } catch { return [] }
}

// ─── Importação (Word .docx via mammoth · PDF via pdf.js CDN) ───────────────
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174'
function carregarScript(src: string) { return new Promise<void>((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('falha ao carregar ' + src)); document.head.appendChild(s) }) }
async function garantePdfjs(): Promise<any> {
  if (!(window as any).pdfjsLib) { await carregarScript(PDFJS_CDN + '/pdf.min.js'); const lib = (window as any).pdfjsLib; if (lib?.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = PDFJS_CDN + '/pdf.worker.min.js' }
  return (window as any).pdfjsLib
}
async function pdfParaTexto(buf: ArrayBuffer): Promise<string> {
  const lib = await garantePdfjs(); const pdf = await lib.getDocument({ data: buf }).promise
  let txt = ''
  for (let p = 1; p <= pdf.numPages; p++) { const pg = await pdf.getPage(p); const c = await pg.getTextContent(); let lastY = 0; for (const it of c.items as any[]) { const y = it.transform?.[5] ?? 0; if (lastY && Math.abs(y - lastY) > 3) txt += '\n'; txt += (it.str || ''); lastY = y } txt += '\n' }
  return txt
}
function ehPerguntaTxt(t: string) { return QRE.test(t) || /\?\s*$/.test(t) || /^\s*\d+\s*[).\-]/.test(t) || /^(quest|pergunta)/i.test(t) }
// HTML do Word → blocos: mantém TABELAS como blocos próprios e aninha respostas nas perguntas
function htmlParaBlocos(html: string): Bloco[] {
  const dom = new DOMParser().parseFromString(html, 'text/html')
  const els: { tipo: 'texto' | 'tabela' | 'titulo'; html: string; txt: string }[] = []
  Array.from(dom.body.children).forEach(node => {
    const tag = node.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) { const t = (node.textContent || '').trim(); if (t) els.push({ tipo: 'titulo', html: node.innerHTML, txt: t }) }
    else if (tag === 'table') els.push({ tipo: 'tabela', html: node.outerHTML, txt: '' })
    else if (tag === 'ul' || tag === 'ol') Array.from(node.children).forEach(li => { const t = (li.textContent || '').trim(); if (t) els.push({ tipo: 'texto', html: li.innerHTML, txt: t }) })
    else { const t = (node.textContent || '').trim(); if (t) els.push({ tipo: 'texto', html: node.innerHTML, txt: t }) }
  })
  const out: Bloco[] = []; let temPergunta = false
  for (const el of els) {
    if (el.tipo === 'titulo') { out.push({ ...blocoVazio(0), grupo: true, aberto: true, html: `<b>${escapeHtml(el.txt)}</b>` }); temPergunta = false; continue }
    if (el.tipo === 'tabela') { out.push({ ...blocoVazio(temPergunta ? 1 : 0), html: el.html }); continue }
    if (ehPerguntaTxt(el.txt)) { const h = el.html.replace(/^\s*(\d+\s*[).\-]|p\s*[:.\-)]|pergunta\s*[:.\-)]|quest[ãa]o[^:]*[:.\-)])\s*/i, ''); out.push({ ...blocoVazio(0), html: `<b>${h}</b>`, aberto: false }); temPergunta = true }
    else { const h = el.html.replace(/^\s*(r\s*[:.\-)]|resp(osta)?\s*[:.\-)]|gabarito\s*[:.\-)]|a\s*[:.\-)])\s*/i, ''); out.push({ ...blocoVazio(temPergunta ? 1 : 0), html: h }) }
  }
  return out.length ? out : [blocoVazio()]
}
function textoParaBlocos(texto: string): Bloco[] {
  const pares = parseQA(texto)
  if (pares.length && pares.some(p => p.r.trim())) return blocosDePares(pares, 0)
  return texto.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(l => ehTituloTxt(l)
    ? ({ ...blocoVazio(0), grupo: true, aberto: true, html: `<b>${escapeHtml(l)}</b>` })
    : ({ ...blocoVazio(0), html: escapeHtml(l) }))
}
// Correção por IA (estilo prova de concurso)
function promptCorrecao(pergunta: string, gabarito: string, minha: string): string {
  return `Você é um avaliador rigoroso de provas discursivas de concurso público brasileiro (padrão CEBRASPE).
Pergunta: ${pergunta}
Gabarito / padrão esperado: ${gabarito || '(não informado — avalie pela técnica jurídica e correção do conteúdo)'}
Resposta do candidato: ${minha}
Avalie o quanto a resposta atende ao padrão esperado e se passaria na prova. Dê um percentual de adequação de 0 a 100 e um feedback curto e objetivo (o que acertou, o que faltou, erros a corrigir). Responda APENAS em JSON válido, sem texto extra: {"pct": <0-100>, "fb": "<feedback>"}.`
}
function parseCorrecao(raw: string): { pct: number; fb: string } {
  let s = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim()
  const m = s.match(/\{[\s\S]*\}/); if (m) s = m[0]
  try { const o = JSON.parse(s); return { pct: Math.max(0, Math.min(100, Math.round(Number(o.pct) || 0))), fb: String(o.fb || '').trim() } } catch { return { pct: 0, fb: raw.slice(0, 500) } }
}
function hojeISO() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}` }
function brData(iso?: string) { return iso ? iso.split('-').reverse().join('/') : '' }

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Pasta { id: string; nome: string; parent: string; cor: string; criadoEm: number }
interface Bloco { id: string; html: string; nivel: number; aberto: boolean; cor: string; resp?: string; res?: 'a' | 'e'; data?: string; pct?: number; fb?: string; grupo?: boolean }
interface DocT { id: string; pasta: string; titulo: string; cor: string; blocos: Bloco[]; updatedAt: number; numerado?: boolean }

const PALETA = ['#7c3aed', '#0891b2', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#64748b']
const COR_BLOCO: Record<string, string> = { '': 'transparent', amarelo: 'rgba(245,158,11,0.14)', verde: 'rgba(16,185,129,0.14)', azul: 'rgba(14,165,233,0.14)', roxo: 'rgba(124,58,237,0.14)', rosa: 'rgba(236,72,153,0.14)', vermelho: 'rgba(239,68,68,0.14)' }
const CORES_BLOCO = ['', 'amarelo', 'verde', 'azul', 'roxo', 'rosa', 'vermelho']

function blocoVazio(nivel = 0): Bloco { return { id: nid(), html: '', nivel, aberto: true, cor: '' } }
function fimSubarvore(arr: Bloco[], i: number): number { const nv = arr[i].nivel; let j = i + 1; while (j < arr.length && arr[j].nivel > nv) j++; return j - 1 }

// ═══════════════════════════════════════════════════════════════════════════
export default function ToggleNotion({ open, onClose }: { open: boolean; onClose: () => void }) {
  const uid = useUid()
  const [pastas, setPastas] = useState<Pasta[]>([])
  const [docs, setDocs] = useState<DocT[]>([])
  const [abertas, setAbertas] = useState<Record<string, boolean>>({})
  const [docId, setDocId] = useState<string>('')
  const [doc_, setDoc_] = useState<DocT | null>(null)
  const [iaBusy, setIaBusy] = useState(false)
  const [impBusy, setImpBusy] = useState(false)
  const [estudoAberto, setEstudoAberto] = useState<Record<string, boolean>>({})
  const [conferindo, setConferindo] = useState<Record<string, boolean>>({})
  // modo flashcard (por grupo): baralho de cartões pergunta/resposta
  const [flash, setFlash] = useState<{ titulo: string; cards: { p: string; r: string }[]; idx: number; virado: boolean } | null>(null)
  // seleção múltipla de perguntas (para mover várias para um grupo de uma vez)
  const [selMode, setSelMode] = useState(false)
  const [sel, setSel] = useState<Record<string, boolean>>({})
  // destino de importação / mover arquivo (escolha de pasta)
  const [destino, setDestino] = useState<{ tipo: 'import'; file: File } | { tipo: 'mover'; docId: string } | null>(null)

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
  // mover bloco (com seus filhos) para cima/baixo entre irmãos do mesmo nível
  function moverBloco(i: number, dir: -1 | 1) {
    const bs = blocos.slice(); const nv = bs[i].nivel; const fim = fimSubarvore(bs, i); const bloco = bs.slice(i, fim + 1)
    if (dir < 0) {
      let k = i - 1; if (k < 0 || bs[k].nivel < nv) return
      while (k > 0 && bs[k].nivel > nv) k--
      if (bs[k].nivel !== nv) return
      const prev = bs.slice(k, i)
      bs.splice(k, fim - k + 1, ...bloco, ...prev)
    } else {
      const prox = fim + 1; if (prox >= bs.length || bs[prox].nivel !== nv) return
      const fimProx = fimSubarvore(bs, prox); const proxArr = bs.slice(prox, fimProx + 1)
      bs.splice(i, fimProx - i + 1, ...proxArr, ...bloco)
    }
    setBlocos(bs); setTimeout(() => focar(bloco[0].id), 10)
  }
  // aplicar formatação ao bloco em foco (mantém a seleção via onMouseDown preventDefault)
  function aplicarFmt(cmd: string, valor?: string) {
    const el = document.activeElement as HTMLElement | null
    if (!el || !el.dataset || !el.dataset.bloco) return
    try { document.execCommand('styleWithCSS', false, 'true') } catch { /* */ }
    document.execCommand(cmd, false, valor)
    const idx = blocos.findIndex(b => b.id === el.dataset.bloco)
    if (idx >= 0) editar(idx, el.innerHTML)
  }
  // importar Word (.docx) ou PDF → novo arquivo na pasta escolhida (ou "Importados" se não informada)
  async function importarArquivo(file?: File, pastaAlvo?: string) {
    if (!file || !uid || !db) return
    setImpBusy(true)
    try {
      let novos: Bloco[]
      const nome = file.name.replace(/\.(docx|pdf)$/i, '')
      if (/\.docx$/i.test(file.name)) {
        // @ts-ignore — mammoth browser build não traz tipos próprios
        const mammoth: any = (await import('mammoth/mammoth.browser')).default
        const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
        novos = htmlParaBlocos(html)
      } else if (/\.pdf$/i.test(file.name)) {
        novos = textoParaBlocos(await pdfParaTexto(await file.arrayBuffer()))
      } else { alert('Envie um arquivo .docx (Word) ou .pdf'); setImpBusy(false); return }
      let pastaId = pastaAlvo
      if (!pastaId) {
        pastaId = pastas.find(p => p.nome === 'Importados' && p.parent === '')?.id
        if (!pastaId) { pastaId = nid(); await setDoc(doc(db, 'users', uid, 'toggle_pastas', pastaId), clean({ id: pastaId, nome: 'Importados', parent: '', cor: PALETA[2], criadoEm: Date.now() })) }
      }
      const id = nid()
      await setDoc(doc(db, 'users', uid, 'toggle_docs', id), clean({ id, pasta: pastaId, titulo: nome, cor: '', blocos: novos, numerado: true, updatedAt: Date.now() }))
      setAbertas(a => ({ ...a, [pastaId!]: true })); setDocId(id)
    } catch (e: any) { alert('Falha ao importar: ' + (e?.message || e)) }
    setImpBusy(false)
  }
  // mover um arquivo já existente para outra pasta/subpasta
  async function moverDoc(docId: string, pastaAlvo: string) {
    if (!uid || !db) return
    const d = docs.find(x => x.id === docId); if (!d) return
    await setDoc(doc(db, 'users', uid, 'toggle_docs', docId), clean({ ...d, pasta: pastaAlvo, updatedAt: Date.now() }))
    setAbertas(a => ({ ...a, [pastaAlvo]: true }))
  }
  // lista achatada de pastas (com indentação) para o seletor de destino
  function pastasPlanas(): { id: string; label: string }[] {
    const out: { id: string; label: string }[] = []
    const walk = (parent: string, depth: number) => {
      pastas.filter(p => p.parent === parent).sort((a, b) => a.nome.localeCompare(b.nome)).forEach(p => {
        out.push({ id: p.id, label: (depth ? '\u00A0\u00A0\u00A0'.repeat(depth) + '↳ ' : '') + p.nome })
        walk(p.id, depth + 1)
      })
    }
    walk('', 0)
    return out
  }
  // estudo: gabarito (texto dos blocos-filhos da pergunta), correção por IA e marcação de resultado
  function setBlocoCampo(i: number, campo: Partial<Bloco>) { const bs = blocos.slice(); bs[i] = { ...bs[i], ...campo }; setBlocos(bs) }
  function gabaritoDe(i: number): string { const nv = blocos[i].nivel; let g = ''; for (let j = i + 1; j < blocos.length && blocos[j].nivel > nv; j++) g += stripHtml(blocos[j].html) + '\n'; return g.trim() }
  function marcarResultado(i: number, res: 'a' | 'e') { setBlocoCampo(i, { res: blocos[i].res === res ? undefined : res, data: blocos[i].res === res ? undefined : hojeISO() }) }
  // limpa a resposta digitada e a correção da IA (mantém o histórico de acerto/erro) — permite reestudar do zero
  function limparResposta(i: number) { setBlocoCampo(i, { resp: '', pct: undefined, fb: undefined }) }
  // ── grupos de perguntas (títulos que contêm e recolhem as perguntas) ──
  function listaGrupos(): { id: string; titulo: string; idx: number }[] {
    return blocos.map((b, i) => ({ b, i })).filter(x => x.b.grupo).map(x => ({ id: x.b.id, titulo: stripHtml(x.b.html) || 'Grupo', idx: x.i }))
  }
  function contaPerguntasGrupo(gi: number): number { let n = 0; for (let j = gi + 1; j < blocos.length && !blocos[j].grupo; j++) if (blocos[j].nivel === 0) n++; return n }
  function novoGrupo() {
    if (!doc_) return
    const nome = window.prompt('Nome do grupo:', 'Novo grupo'); if (nome === null) return
    const bs = blocos.slice(); bs.push({ ...blocoVazio(0), grupo: true, aberto: true, html: `<b>${escapeHtml(nome || 'Novo grupo')}</b>` }); setBlocos(bs)
  }
  // move a pergunta i (com suas respostas aninhadas) para o fim do grupo gId
  function moverParaGrupo(i: number, gId: string) {
    const bs = blocos.slice(); const fim = fimSubarvore(bs, i); const bloco = bs.slice(i, fim + 1)
    bs.splice(i, bloco.length)
    const gIdx = bs.findIndex(b => b.id === gId && b.grupo); if (gIdx < 0) return
    let ins = gIdx + 1; while (ins < bs.length && !bs[ins].grupo) ins++
    bs.splice(ins, 0, ...bloco); setBlocos(bs)
  }
  // extrai as subárvores das perguntas selecionadas (na ordem do documento) e devolve [restantes, movidos]
  function extrairSelecionadas(ids: Record<string, boolean>): [Bloco[], Bloco[]] {
    const movidos: Bloco[] = []; const restantes: Bloco[] = []
    for (let i = 0; i < blocos.length;) {
      const b = blocos[i]
      if (b.nivel === 0 && !b.grupo && ids[b.id]) { const fim = fimSubarvore(blocos, i); movidos.push(...blocos.slice(i, fim + 1)); i = fim + 1 }
      else { restantes.push(b); i++ }
    }
    return [restantes, movidos]
  }
  // move TODAS as perguntas selecionadas para o fim de um grupo existente
  function moverVariasParaGrupo(gId: string) {
    const [restantes, movidos] = extrairSelecionadas(sel); if (!movidos.length) return
    const gIdx = restantes.findIndex(b => b.id === gId && b.grupo); if (gIdx < 0) return
    let ins = gIdx + 1; while (ins < restantes.length && !restantes[ins].grupo) ins++
    restantes.splice(ins, 0, ...movidos); setBlocos(restantes); setSel({})
  }
  // cria um grupo novo e move as selecionadas para dentro dele
  function novoGrupoComSelecionadas() {
    const [restantes, movidos] = extrairSelecionadas(sel); if (!movidos.length) return
    const nome = window.prompt('Nome do novo grupo:', 'Novo grupo'); if (nome === null) return
    const g: Bloco = { ...blocoVazio(0), grupo: true, aberto: true, html: `<b>${escapeHtml(nome || 'Novo grupo')}</b>` }
    setBlocos([...restantes, g, ...movidos]); setSel({})
  }
  const selCount = Object.values(sel).filter(Boolean).length
  // negrito em massa nas perguntas (todas em negrito, ou tirar de todas)
  function negritoTodas(on: boolean) {
    const bs = blocos.map(b => {
      if (b.nivel !== 0 || b.grupo) return b
      const semB = b.html.replace(/<\/?(b|strong)>/gi, '').replace(/font-weight\s*:\s*(bold|[5-9]00)\s*;?/gi, '')
      return { ...b, html: on ? `<b>${semB}</b>` : semB }
    })
    setBlocos(bs)
  }
  // monta os cartões (pergunta/resposta) de um grupo para o modo flashcard
  function cardsDoGrupo(gi: number): { p: string; r: string }[] {
    const cards: { p: string; r: string }[] = []
    for (let j = gi + 1; j < blocos.length && !blocos[j].grupo; j++) {
      if (blocos[j].nivel !== 0) continue
      let r = ''
      for (let k = j + 1; k < blocos.length && !blocos[k].grupo && blocos[k].nivel > 0; k++) r += `<div style="margin:3px 0">${blocos[k].html}</div>`
      cards.push({ p: blocos[j].html || '(sem pergunta)', r: r || '<i style="opacity:.55">(sem resposta cadastrada)</i>' })
    }
    return cards
  }
  function abrirFlashcards(gi: number, titulo: string) { const cards = cardsDoGrupo(gi); if (!cards.length) { alert('Este grupo não tem perguntas ainda.'); return } setFlash({ titulo, cards, idx: 0, virado: false }) }
  async function conferirIA(i: number) {
    const minha = (blocos[i].resp || '').trim()
    if (!minha) { alert('Escreva sua resposta primeiro.'); return }
    if (!iaConfigurada()) { alert('Configure a IA (Gemini) — a mesma do PDF Reader.'); return }
    const id = blocos[i].id
    setConferindo(c => ({ ...c, [id]: true }))
    try {
      const raw = await callLLM3D(promptCorrecao(stripHtml(blocos[i].html), gabaritoDe(i), minha))
      const r = parseCorrecao(raw)
      setBlocoCampo(i, { pct: r.pct, fb: r.fb })
    } catch (e: any) { alert('IA: ' + (e?.message || e)) }
    setConferindo(c => ({ ...c, [id]: false }))
  }
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
      const raw = await callLLM3D(promptQAGrupos(texto))
      const grupos = parseJSONgrupos(raw)
      if (grupos.length) {
        // se só houver 1 grupo sem título, cai no formato simples (sem cabeçalho de grupo)
        const semTitulos = grupos.length === 1 && !grupos[0].grupo
        salvarDoc({ ...doc_, blocos: semTitulos ? blocosDePares(grupos[0].itens, 0) : blocosDeGrupos(grupos) })
      } else {
        const pares = parseJSONpares(raw)
        if (!pares.length) throw new Error('Não consegui identificar as perguntas/respostas.')
        salvarDoc({ ...doc_, blocos: blocosDePares(pares, 0) })
      }
    } catch (e: any) { alert('IA: ' + (e?.message || e)) }
    setIaBusy(false)
  }
  function focar(id: string) { const el = document.querySelector(`[data-bloco="${id}"]`) as HTMLElement | null; if (el) { el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r) } }

  // visibilidade (collapse): grupos recolhem suas perguntas; blocos fechados pulam descendentes
  const visiveis = useMemo(() => {
    const out: number[] = []; let corte = -1; let grupoFechado = false
    blocos.forEach((b, i) => {
      if (b.grupo) { grupoFechado = b.aberto === false; corte = -1; out.push(i); return }  // título de grupo: sempre visível
      if (grupoFechado) return                                                               // dentro de grupo recolhido
      if (corte >= 0) { if (b.nivel > corte) return; corte = -1 }
      out.push(i)
      if (!b.aberto && i < blocos.length - 1 && blocos[i + 1].nivel > b.nivel && !blocos[i + 1].grupo) corte = b.nivel
    })
    return out
  }, [blocos])
  const numerado = doc_?.numerado !== false
  const numeroDe = useMemo(() => { const m: Record<string, number> = {}; let n = 0; blocos.forEach(b => { if (b.nivel === 0 && !b.grupo) { n++; m[b.id] = n } }); return m }, [blocos])
  const stats = useMemo(() => { const qs = blocos.filter(b => b.nivel === 0 && !b.grupo); const resp = qs.filter(b => b.res); const ac = qs.filter(b => b.res === 'a'); return { total: qs.length, respondidas: resp.length, acertos: ac.length, pct: resp.length ? Math.round(ac.length / resp.length * 100) : 0 } }, [blocos])

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
                <button className="tg-act" onClick={e => { e.stopPropagation(); setDestino({ tipo: 'mover', docId: d.id }) }} title="Mover para outra pasta" style={miniBtn}>📂</button>
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
        /* destaque visual ao passar o mouse sobre a pergunta/bloco */
        .tg-blk{transition:box-shadow .12s ease}
        .tg-blk:hover{box-shadow:inset 0 0 0 200px color-mix(in srgb,var(--accent) 7%,transparent), inset 0 0 0 1.5px color-mix(in srgb,var(--accent) 45%,transparent)}
        /* botão Responder: oculto por padrão, surge ao passar o mouse na pergunta (efeito forte no próprio botão) */
        .tg-respbtn{opacity:0}
        .tg-blk:hover .tg-respbtn{opacity:1}
        .tg-respbtn:hover{filter:brightness(1.06);transform:translateY(-1px) scale(1.04);box-shadow:0 4px 12px color-mix(in srgb,var(--accent) 35%,transparent)}
        .tg-caret:hover{background:var(--surface)!important}
        .tg-fmt{border:1px solid var(--border-md);background:var(--card-bg);color:var(--text-secondary);cursor:pointer;border-radius:7px;height:28px;min-width:28px;padding:0 7px;font-size:.82rem;display:inline-flex;align-items:center;justify-content:center;transition:all .12s}
        .tg-fmt:hover{background:var(--surface);color:var(--text-primary);transform:translateY(-1px)}
        .tg-sw{width:18px;height:18px;border-radius:5px;border:1px solid var(--border-md);cursor:pointer;padding:0;transition:transform .12s}
        .tg-sw:hover{transform:scale(1.15)}
        .tg-ed table{border-collapse:collapse;margin:5px 0;font-size:.82rem;max-width:100%}
        .tg-ed td,.tg-ed th{border:1px solid var(--border-md);padding:4px 8px;vertical-align:top}
        .tg-ed th{background:var(--surface)}
        .tg-ed img{max-width:100%;height:auto;border-radius:6px}
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
            <label style={{ ...softBtn, cursor: impBusy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Importar Word (.docx) ou PDF com perguntas e respostas">
              {impBusy ? '⏳' : '📥'} Importar
              <input type="file" accept=".docx,.pdf" disabled={impBusy} onChange={e => { const f = e.target.files?.[0]; if (f) setDestino({ tipo: 'import', file: f }); e.currentTarget.value = '' }} style={{ display: 'none' }} />
            </label>
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
              <button onClick={() => salvarDoc({ ...doc_, numerado: !numerado })} title={numerado ? 'Usando numeração — clique para marcador' : 'Usando marcador — clique para numeração'} style={{ ...softBtn, minWidth: 38 }}>{numerado ? '1.' : '•'}</button>
              <button onClick={organizarIA} disabled={iaBusy} title="Identifica perguntas e respostas e aninha as respostas (ocultas) dentro de cada pergunta" style={{ ...softBtn, background: 'linear-gradient(135deg,#7c3aed,#5b5bd6)', color: '#fff', border: 'none', opacity: iaBusy ? 0.6 : 1 }}>{iaBusy ? <><span className="nx-spin">⏳</span> Organizando…</> : '✨ Organizar P/R com IA'}</button>
              <button onClick={() => { const bs = blocos.concat(blocoVazio(0)); setBlocos(bs); setTimeout(() => focar(bs[bs.length - 1].id), 30) }} style={softBtn}>+ Bloco</button>
            </div>
            {stats.total > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 18px', borderBottom: '1px solid var(--border)', background: 'var(--card-bg)', fontSize: '.74rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, color: 'var(--text-accent)', textTransform: 'uppercase', letterSpacing: '.06em', fontSize: '.62rem' }}>📊 Desempenho</span>
                <span style={{ color: 'var(--text-secondary)' }}>{stats.total} pergunta(s)</span>
                <span style={{ color: 'var(--text-secondary)' }}>{stats.respondidas} respondida(s)</span>
                <span style={{ color: '#10b981', fontWeight: 700 }}>{stats.acertos} acerto(s)</span>
                {stats.respondidas > 0 && <span style={{ fontWeight: 800, color: stats.pct >= 70 ? '#10b981' : stats.pct >= 50 ? '#f59e0b' : '#ef4444' }}>{stats.pct}% de aproveitamento</span>}
                <span style={{ flex: 1 }} />
                {stats.respondidas > 0 && <button onClick={() => { if (window.confirm('Zerar os resultados (acertos/erros) deste arquivo?')) { const bs = blocos.map(b => b.nivel === 0 ? { ...b, res: undefined, data: undefined } : b); setBlocos(bs) } }} style={{ ...miniBtn, color: 'var(--text-muted)', fontSize: '.68rem' }}>zerar</button>}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', background: 'var(--bg-1)' }}>
              <button className="tg-fmt" title="Negrito (Ctrl+B)" onMouseDown={e => { e.preventDefault(); aplicarFmt('bold') }} style={{ fontWeight: 800 }}>B</button>
              <button className="tg-fmt" title="Itálico" onMouseDown={e => { e.preventDefault(); aplicarFmt('italic') }} style={{ fontStyle: 'italic' }}>I</button>
              <button className="tg-fmt" title="Sublinhado" onMouseDown={e => { e.preventDefault(); aplicarFmt('underline') }} style={{ textDecoration: 'underline' }}>U</button>
              <button className="tg-fmt" title="Tachado" onMouseDown={e => { e.preventDefault(); aplicarFmt('strikeThrough') }} style={{ textDecoration: 'line-through' }}>S</button>
              <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 3px' }} />
              <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>cor</span>
              {['#e8424d', '#2f7de1', '#16a34a', '#f59e0b', '#a855f7'].map(c => <button key={c} className="tg-sw" title="Cor do texto" onMouseDown={e => { e.preventDefault(); aplicarFmt('foreColor', c) }} style={{ background: c }} />)}
              <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 3px' }} />
              <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>realce</span>
              {[['am', 'rgba(245,158,11,.5)'], ['vd', 'rgba(16,185,129,.45)'], ['az', 'rgba(56,189,248,.45)'], ['rs', 'rgba(236,72,153,.4)']].map(([n, c]) => <button key={n} className="tg-sw" title="Realçar" onMouseDown={e => { e.preventDefault(); aplicarFmt('hiliteColor', c) }} style={{ background: c }} />)}
              <button className="tg-fmt" title="Remover realce" onMouseDown={e => { e.preventDefault(); aplicarFmt('hiliteColor', 'transparent') }} style={{ fontSize: '.7rem' }}>⌫</button>
              <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 3px' }} />
              <button className="tg-fmt" title="Limpar formatação" onMouseDown={e => { e.preventDefault(); aplicarFmt('removeFormat') }} style={{ fontSize: '.72rem' }}>✕ limpar</button>
              <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 3px' }} />
              <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>perguntas</span>
              <button className="tg-fmt" title="Deixar TODAS as perguntas em negrito" onMouseDown={e => { e.preventDefault(); negritoTodas(true) }} style={{ fontWeight: 800, fontSize: '.72rem' }}>B todas</button>
              <button className="tg-fmt" title="Tirar o negrito de TODAS as perguntas" onMouseDown={e => { e.preventDefault(); negritoTodas(false) }} style={{ fontSize: '.72rem', textDecoration: 'line-through' }}>B nenhuma</button>
              <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 3px' }} />
              <button className="tg-fmt" title="Criar um grupo (título) — arraste/classifique perguntas dentro dele" onMouseDown={e => { e.preventDefault(); novoGrupo() }} style={{ fontSize: '.72rem', fontWeight: 700 }}>＋ Grupo</button>
              <button className="tg-fmt" title="Selecionar várias perguntas para mover a um grupo de uma vez" onMouseDown={e => { e.preventDefault(); setSelMode(v => !v); setSel({}) }} style={{ fontSize: '.72rem', fontWeight: 700, background: selMode ? 'var(--accent)' : undefined, color: selMode ? '#fff' : undefined }}>☑️ Selecionar</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
              {visiveis.map(i => {
                const b = blocos[i]; const filhos = temFilhos(i)
                if (b.grupo) {
                  const qtd = contaPerguntasGrupo(i)
                  return (
                    <div key={b.id} className="tg-blk" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, marginBottom: 2, padding: '7px 8px', borderRadius: 9, background: 'var(--accent-bg, rgba(91,91,214,.1))', border: '1px solid var(--border)' }}>
                      <button onClick={() => alternar(i)} title={b.aberto === false ? 'Expandir grupo' : 'Recolher grupo'} style={{ ...caret, color: 'var(--text-primary)', fontSize: '.9rem' }}>{b.aberto === false ? '▸' : '▾'}</button>
                      <span style={{ fontSize: '1rem' }}>🗂️</span>
                      <div
                        data-bloco={b.id} className="tg-ed" data-ph="Nome do grupo"
                        contentEditable suppressContentEditableWarning
                        ref={el => { if (el && el.innerHTML !== b.html && document.activeElement !== el) el.innerHTML = b.html }}
                        onInput={e => editar(i, (e.currentTarget as HTMLElement).innerHTML)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLElement).blur() } }}
                        style={{ flex: 1, outline: 'none', fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)', minHeight: 20, padding: '1px 3px', wordBreak: 'break-word' }}
                      />
                      <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{qtd} pergunta(s)</span>
                      <button onClick={() => abrirFlashcards(i, stripHtml(b.html) || 'Grupo')} title="Estudar este grupo como flashcards" style={{ ...softBtn, padding: '0 10px', height: 28, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700 }}>🎴 Flashcards</button>
                      <button onClick={() => apagar(i)} title="Excluir o título do grupo (as perguntas continuam)" style={miniBtn}>🗑️</button>
                    </div>
                  )
                }
                return (
                  <div key={b.id}>
                  <div className="tg-blk" style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginLeft: b.nivel * 22, padding: '2px 4px', borderRadius: 7, background: (selMode && sel[b.id]) ? 'rgba(91,91,214,.14)' : (COR_BLOCO[b.cor] || 'transparent') }}>
                    {selMode && b.nivel === 0 && <input type="checkbox" checked={!!sel[b.id]} onChange={e => setSel(s => ({ ...s, [b.id]: e.target.checked }))} title="Selecionar esta pergunta" style={{ marginTop: 6, width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--accent)' }} />}
                    <button className="tg-caret" onClick={() => filhos && alternar(i)} title={filhos ? (b.aberto ? 'Recolher' : 'Expandir') : ''} style={{ ...caret, color: filhos ? 'var(--text-primary)' : 'transparent', cursor: filhos ? 'pointer' : 'default' }}>{b.aberto ? '▾' : '▸'}</button>
                    {numerado && b.nivel === 0
                      ? <span style={{ color: 'var(--text-accent)', fontWeight: 800, fontSize: '.82rem', marginTop: 3, minWidth: 20, textAlign: 'right' }}>{numeroDe[b.id]}.</span>
                      : <span style={{ color: 'var(--text-muted)', fontSize: '.5rem', marginTop: 9, minWidth: 12, textAlign: 'center' }}>•</span>}
                    <div
                      data-bloco={b.id} className="tg-ed" data-ph="Escreva… (Tab aninha, Enter novo)"
                      contentEditable suppressContentEditableWarning
                      ref={el => { if (el && el.innerHTML !== b.html && document.activeElement !== el) el.innerHTML = b.html }}
                      onInput={e => editar(i, (e.currentTarget as HTMLElement).innerHTML)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); novoApos(i) }
                        else if (e.key === 'Tab') { e.preventDefault(); indentar(i, e.shiftKey ? -1 : 1) }
                        else if (e.key === 'Backspace' && (e.currentTarget as HTMLElement).innerHTML === '') { e.preventDefault(); apagar(i) }
                        else if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) { e.preventDefault(); document.execCommand(e.key.toLowerCase() === 'b' ? 'bold' : e.key.toLowerCase() === 'i' ? 'italic' : 'underline'); editar(i, (e.currentTarget as HTMLElement).innerHTML) }
                      }}
                      onPaste={e => { const t = e.clipboardData.getData('text/plain'); if (t && t.includes('\n')) { e.preventDefault(); colarInteligente(i, t) } }}
                      style={{ flex: 1, outline: 'none', fontSize: '.9rem', lineHeight: 1.55, color: 'var(--text-primary)', minHeight: 22, padding: '2px 4px', wordBreak: 'break-word' }}
                    />
                    {b.nivel === 0 && (
                      <button className="tg-respbtn" onClick={() => setEstudoAberto(s => ({ ...s, [b.id]: !s[b.id] }))} title="Responder e conferir"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 9px', borderRadius: 7, cursor: 'pointer',
                          fontSize: '.7rem', fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 1, transition: 'all .12s',
                          ...(estudoAberto[b.id]
                            ? { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }
                            : b.res
                              ? { background: 'var(--card-bg)', color: b.res === 'a' ? '#10b981' : '#ef4444', border: `1px solid ${b.res === 'a' ? '#10b98155' : '#ef444455'}` }
                              : { background: 'var(--surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-md)' }),
                          opacity: (estudoAberto[b.id] || b.res) ? 1 : undefined,
                        }}>📝 Responder</button>
                    )}
                    <span className="tg-bact" style={{ display: 'flex', gap: 1, marginTop: 2, alignItems: 'center' }}>
                      {b.nivel === 0 && listaGrupos().length > 0 && (
                        <select value="" onChange={e => { if (e.target.value) moverParaGrupo(i, e.target.value) }} title="Mover esta pergunta para um grupo" style={{ height: 22, borderRadius: 6, border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: '.66rem', cursor: 'pointer', maxWidth: 90 }}>
                          <option value="">🗂️ grupo…</option>
                          {listaGrupos().map(g => <option key={g.id} value={g.id}>{g.titulo}</option>)}
                        </select>
                      )}
                      <button onClick={() => moverBloco(i, -1)} title="Mover para cima" style={miniBtn}>↑</button>
                      <button onClick={() => moverBloco(i, 1)} title="Mover para baixo" style={miniBtn}>↓</button>
                      <button onClick={() => corBloco(i)} title="Cor de fundo do bloco" style={miniBtn}>🎨</button>
                      <button onClick={() => indentar(i, 1)} title="Aninhar" style={miniBtn}>⇥</button>
                      <button onClick={() => apagar(i)} title="Excluir" style={miniBtn}>🗑️</button>
                    </span>
                  </div>
                  {b.nivel === 0 && estudoAberto[b.id] && (
                    <div style={{ marginLeft: b.nivel * 22 + 30, marginTop: 4, marginBottom: 10, padding: 12, borderRadius: 12, background: 'var(--bg-1)', border: '1px solid var(--border)' }}>
                      <textarea value={b.resp || ''} onChange={e => setBlocoCampo(i, { resp: e.target.value })} placeholder="Escreva aqui a sua resposta para comparar com o gabarito…" style={{ width: '100%', boxSizing: 'border-box', minHeight: 74, resize: 'vertical', border: '1px solid var(--border-md)', borderRadius: 8, background: 'var(--card-bg)', color: 'var(--text-primary)', padding: 9, fontSize: '.85rem', outline: 'none', lineHeight: 1.5 }} />
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginTop: 9 }}>
                        <button onClick={() => conferirIA(i)} disabled={conferindo[b.id]} style={{ ...softBtn, background: 'linear-gradient(135deg,#7c3aed,#5b5bd6)', color: '#fff', border: 'none', opacity: conferindo[b.id] ? 0.6 : 1 }}>{conferindo[b.id] ? <><span className="nx-spin">⏳</span> Conferindo…</> : '✓ Conferir com IA'}</button>
                        <button onClick={() => marcarResultado(i, 'a')} style={{ ...softBtn, color: b.res === 'a' ? '#fff' : '#10b981', background: b.res === 'a' ? '#10b981' : 'var(--card-bg)', border: b.res === 'a' ? 'none' : '1px solid #10b98155' }}>✓ Acertei</button>
                        <button onClick={() => marcarResultado(i, 'e')} style={{ ...softBtn, color: b.res === 'e' ? '#fff' : '#ef4444', background: b.res === 'e' ? '#ef4444' : 'var(--card-bg)', border: b.res === 'e' ? 'none' : '1px solid #ef444455' }}>✗ Errei</button>
                        {(b.resp || typeof b.pct === 'number' || b.fb) && <button onClick={() => limparResposta(i)} title="Apagar a resposta e a correção da IA para reestudar do zero (mantém o histórico de acerto/erro)" style={{ ...softBtn }}>🧹 Limpar</button>}
                        {b.res && b.data && <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{b.res === 'a' ? 'Acertou' : 'Errou'} em {brData(b.data)}</span>}
                      </div>
                      {typeof b.pct === 'number' && (b.pct > 0 || !!b.fb) && (
                        <div style={{ marginTop: 9, padding: 10, borderRadius: 9, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <strong style={{ color: b.pct >= 60 ? '#10b981' : b.pct >= 40 ? '#f59e0b' : '#ef4444', fontSize: '1.15rem', fontFamily: 'var(--font-display)' }}>{b.pct}%</strong>
                            <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>de adequação ao gabarito (estimativa da IA)</span>
                          </div>
                          {b.fb && <div style={{ marginTop: 5, fontSize: '.82rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{b.fb}</div>}
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                )
              })}
            </div>
          </>)}
        </div>
      </div>

      {/* modal: escolher pasta de destino (importar arquivo novo ou mover existente) */}
      {destino && (
        <div onMouseDown={() => setDestino(null)} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onMouseDown={e => e.stopPropagation()} style={{ width: 380, maxWidth: '92vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,.4)', overflow: 'hidden' }}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.05rem' }}>{destino.tipo === 'import' ? '📥' : '📂'}</span>
              <b style={{ fontSize: '.9rem', color: 'var(--text-primary)' }}>{destino.tipo === 'import' ? 'Importar para qual pasta?' : 'Mover para qual pasta?'}</b>
              <span style={{ flex: 1 }} />
              <button onClick={() => setDestino(null)} style={{ ...winBtn, width: 24, height: 24 }}>✕</button>
            </div>
            {destino.tipo === 'import' && <div style={{ padding: '8px 16px 0', fontSize: '.76rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{destino.file.name}</div>}
            <div style={{ padding: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {pastas.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '.8rem', textAlign: 'center', padding: 14 }}>Nenhuma pasta ainda — crie uma abaixo.</div>}
              {pastasPlanas().map(p => (
                <button key={p.id} onClick={async () => { const dst = destino; setDestino(null); if (dst.tipo === 'import') await importarArquivo(dst.file, p.id); else await moverDoc(dst.docId, p.id) }}
                  style={{ textAlign: 'left', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '.84rem', fontWeight: 600, whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis' }}>📁 {p.label}</button>
              ))}
            </div>
            <div style={{ padding: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              <button onClick={async () => { if (!uid || !db) return; const nome = window.prompt('Nome da nova pasta:'); if (!nome) return; const id = nid(); await setDoc(doc(db, 'users', uid, 'toggle_pastas', id), clean({ id, nome, parent: '', cor: PALETA[pastas.length % PALETA.length], criadoEm: Date.now() })); const dst = destino; setDestino(null); if (dst.tipo === 'import') await importarArquivo(dst.file, id); else await moverDoc(dst.docId, id) }}
                style={{ ...softBtn, flex: 1 }}>＋ Nova pasta e usar</button>
              {destino.tipo === 'import' && <button onClick={async () => { const dst = destino; setDestino(null); if (dst.tipo === 'import') await importarArquivo(dst.file) }} style={{ ...softBtn }} title="Pasta padrão 'Importados'">Importados</button>}
            </div>
          </div>
        </div>
      )}

      {/* barra de ações da seleção múltipla */}
      {selMode && selCount > 0 && (
        <div style={{ position: 'absolute', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', background: 'var(--card-bg)', border: '1px solid var(--accent)', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,.35)', flexWrap: 'wrap', maxWidth: '92%' }}>
          <b style={{ fontSize: '.82rem', color: 'var(--text-primary)' }}>{selCount} selecionada(s)</b>
          {listaGrupos().length > 0 && (
            <select value="" onChange={e => { if (e.target.value) moverVariasParaGrupo(e.target.value) }} style={{ height: 30, borderRadius: 8, border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '.78rem', cursor: 'pointer' }}>
              <option value="">🗂️ mover para grupo…</option>
              {listaGrupos().map(g => <option key={g.id} value={g.id}>{g.titulo}</option>)}
            </select>
          )}
          <button onClick={novoGrupoComSelecionadas} style={{ ...softBtn, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700 }}>＋ Novo grupo com estas</button>
          <button onClick={() => setSel({})} style={{ ...softBtn }}>Limpar</button>
        </div>
      )}

      {/* modo flashcard: cartões pergunta/resposta do grupo */}
      {flash && (
        <div onMouseDown={() => setFlash(null)} style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onMouseDown={e => e.stopPropagation()} style={{ width: 620, maxWidth: '95vw', height: 'min(80vh, 640px)', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,.45)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '1.15rem' }}>🎴</span>
              <b style={{ fontSize: '.98rem', color: 'var(--text-primary)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{flash.titulo}</b>
              <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>{flash.idx + 1} / {flash.cards.length}</span>
              <button onClick={() => setFlash(null)} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>
            </div>
            <div onClick={() => setFlash(f => f && { ...f, virado: !f.virado })} title="Clique no cartão para virar" style={{ flex: 1, minHeight: 0, margin: 18, borderRadius: 16, border: `2px solid ${flash.virado ? '#10b98155' : 'var(--border)'}`, background: flash.virado ? 'rgba(16,185,129,.06)' : 'var(--bg-1)', display: 'flex', flexDirection: 'column', cursor: 'pointer', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: '.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: flash.virado ? '#10b981' : 'var(--text-accent)' }}>{flash.virado ? 'Resposta' : 'Pergunta'}</div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', fontSize: '1rem', lineHeight: 1.6, color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: flash.virado ? flash.cards[flash.idx].r : flash.cards[flash.idx].p }} />
              {!flash.virado && <div style={{ padding: '10px 16px', textAlign: 'center', fontSize: '.74rem', color: 'var(--text-muted)' }}>Clique para ver a resposta</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setFlash(f => f && { ...f, idx: Math.max(0, f.idx - 1), virado: false })} disabled={flash.idx === 0} style={{ ...softBtn, opacity: flash.idx === 0 ? 0.4 : 1 }}>← Anterior</button>
              <button onClick={() => setFlash(f => f && { ...f, virado: !f.virado })} style={{ ...softBtn, flex: 1, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700 }}>{flash.virado ? 'Ver pergunta' : 'Virar cartão'}</button>
              {flash.idx < flash.cards.length - 1
                ? <button onClick={() => setFlash(f => f && { ...f, idx: f.idx + 1, virado: false })} style={{ ...softBtn }}>Próximo →</button>
                : <button onClick={() => setFlash(null)} style={{ ...softBtn, background: '#10b981', color: '#fff', border: 'none', fontWeight: 700 }}>✓ Concluir</button>}
            </div>
          </div>
        </div>
      )}

      {/* alça de redimensionar */}
      {!max && <div onMouseDown={e => { rez.current = { ow: size.w, oh: size.h, px: e.clientX, py: e.clientY } }} style={{ position: 'absolute', right: 0, bottom: 0, width: 18, height: 18, cursor: 'nwse-resize', background: 'linear-gradient(135deg,transparent 45%,var(--text-muted) 45%,var(--text-muted) 55%,transparent 55%)', opacity: 0.5 }} />}
    </div>
  </>, document.body)
}

const miniBtn: React.CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '.74rem', padding: '1px 3px', borderRadius: 5, lineHeight: 1 }
const winBtn: React.CSSProperties = { border: 'none', background: 'var(--surface)', cursor: 'pointer', fontSize: '.8rem', width: 28, height: 26, borderRadius: 7, color: 'var(--text-secondary)' }
const softBtn: React.CSSProperties = { border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '.76rem', fontWeight: 700, padding: '6px 10px', borderRadius: 8 }
const caret: React.CSSProperties = { border: 'none', background: 'transparent', fontSize: '1.05rem', fontWeight: 700, width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1, padding: 0, borderRadius: 6 }
