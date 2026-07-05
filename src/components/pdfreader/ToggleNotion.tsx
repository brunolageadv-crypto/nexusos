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
// Remove numeração no início da pergunta ("1 - ", "01) ", "1. ", "1 – ", "1: ") — inclusive dentro de um <b>/<strong> de abertura, preservando a tag
function stripNumInicial(s: string): string { return s.replace(/^(\s*<(?:b|strong)\b[^>]*>)?\s*\d{1,3}\s*[).\-–—:]\s+/i, '$1') }

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
    out.push({ ...blocoVazio(nivelBase), html: `<b>${escapeHtml(stripNumInicial(par.p.trim()))}</b>`, aberto: !par.r.trim() })
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
      out.push({ ...blocoVazio(0), html: `<b>${escapeHtml(stripNumInicial(par.p.trim()))}</b>`, aberto: !par.r?.trim() })
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
    : ({ ...blocoVazio(0), html: escapeHtml(stripNumInicial(l)) }))
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
//  TOGGLE · Sistema de estudo & desempenho (reformulação integral)
//  · Dois modos: Estudar (revisão + desempenho) e Editar (blocos aninhados)
//  · Preserva 100% das funcionalidades: pastas/subpastas, importação Word/PDF,
//    IA (organizar P/R e conferir resposta), grupos, flashcards, seleção múltipla,
//    formatação rica, numeração, cores de bloco, mover/aninhar, seed do PDF Reader.
// ═══════════════════════════════════════════════════════════════════════════
type Vista = 'estudar' | 'editar'
type Filtro = 'todas' | 'revisar' | 'acertos' | 'pendentes'
interface Questao { qi: number; id: string; numero: number; perguntaHtml: string; respostaHtml: string; res?: 'a' | 'e'; pct?: number; temResposta: boolean }
interface Secao { key: string; grupoId: string | null; gi: number | null; titulo: string; aberto: boolean; questoes: Questao[] }

export default function ToggleNotion({ open, onClose, seed, onSeedUsado }: { open: boolean; onClose: () => void; seed?: { titulo: string; texto: string } | null; onSeedUsado?: () => void }) {
  const uid = useUid()
  const [pastas, setPastas] = useState<Pasta[]>([])
  const [docs, setDocs] = useState<DocT[]>([])
  const [abertas, setAbertas] = useState<Record<string, boolean>>({})
  const [docId, setDocId] = useState<string>('')
  const [doc_, setDoc_] = useState<DocT | null>(null)
  const [iaBusy, setIaBusy] = useState(false)
  const [impBusy, setImpBusy] = useState(false)
  const [estudoAberto, setEstudoAberto] = useState<Record<string, boolean>>({})
  const [reveladas, setReveladas] = useState<Record<string, boolean>>({})
  const [conferindo, setConferindo] = useState<Record<string, boolean>>({})
  // modo flashcard: baralho de cartões pergunta/resposta (por grupo OU documento inteiro)
  const [flash, setFlash] = useState<{ titulo: string; cards: { p: string; r: string; id: string }[]; idx: number; virado: boolean } | null>(null)
  // seleção múltipla de perguntas (para mover várias para um grupo de uma vez)
  const [selMode, setSelMode] = useState(false)
  const [sel, setSel] = useState<Record<string, boolean>>({})
  // destino de importação / mover arquivo (escolha de pasta)
  const [destino, setDestino] = useState<{ tipo: 'import'; file: File } | { tipo: 'mover'; docId: string } | null>(null)
  // modo de visualização e ferramentas de estudo
  const [vista, setVista] = useState<Vista>('estudar')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busca, setBusca] = useState('')
  const [sidebar, setSidebar] = useState(true)
  const [painelAberto, setPainelAberto] = useState(true)

  // janela
  const [pos, setPos] = useState({ x: 70, y: 48 })
  const [size, setSize] = useState({ w: Math.min(1180, window.innerWidth - 90), h: Math.min(760, window.innerHeight - 90) })
  const [max, setMax] = useState(false)
  const drag = useRef<{ ox: number; oy: number } | null>(null)
  const rez = useRef<{ ow: number; oh: number; px: number; py: number } | null>(null)

  // ── Firestore ──
  useEffect(() => {
    if (!open || !uid || !db) return
    const u1 = onSnapshot(collection(db, 'users', uid, 'toggle_pastas'), s => setPastas(s.docs.map(d => ({ ...(d.data() as Pasta), id: d.id }))))
    const u2 = onSnapshot(collection(db, 'users', uid, 'toggle_docs'), s => setDocs(s.docs.map(d => { const x = d.data() as DocT; return { id: d.id, pasta: x.pasta || '', titulo: x.titulo || '', cor: x.cor || '', blocos: x.blocos || [], updatedAt: x.updatedAt || 0, numerado: x.numerado } })))
    return () => { u1(); u2() }
  }, [open, uid])

  // carrega doc selecionado
  useEffect(() => { const d = docs.find(x => x.id === docId); if (d) setDoc_(JSON.parse(JSON.stringify(d))); else setDoc_(null) }, [docId])
  // ao trocar de arquivo, volta a revisão limpa
  useEffect(() => { setReveladas({}); setEstudoAberto({}); setFiltro('todas'); setBusca('') }, [docId])

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
    await setDoc(doc(db, 'users', uid, 'toggle_docs', id), clean(novo)); setAbertas(a => ({ ...a, [pastaId]: true })); setDocId(id); setVista('editar')
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
  // seed vindo do PDF Reader (ex.: relatório de perguntas) → cria um doc novo na pasta "Relatórios"
  const seedRef = useRef<string>('')
  useEffect(() => {
    if (!open || !seed || !uid || !db) return
    const chave = seed.titulo + '::' + seed.texto.length
    if (seedRef.current === chave) return
    seedRef.current = chave
    ;(async () => {
      try {
        let pastaId = pastas.find(p => p.nome === 'Relatórios' && p.parent === '')?.id
        if (!pastaId) { pastaId = nid(); await setDoc(doc(db!, 'users', uid, 'toggle_pastas', pastaId), clean({ id: pastaId, nome: 'Relatórios', parent: '', cor: PALETA[4], criadoEm: Date.now() })) }
        const novos = textoParaBlocos(seed.texto)
        const id = nid()
        await setDoc(doc(db!, 'users', uid, 'toggle_docs', id), clean({ id, pasta: pastaId, titulo: seed.titulo, cor: '', blocos: novos, numerado: true, updatedAt: Date.now() }))
        setAbertas(a => ({ ...a, [pastaId!]: true })); setDocId(id)
      } catch (e: any) { alert('Falha ao criar no Toggle: ' + (e?.message || e)) }
      onSeedUsado?.()
    })()
  }, [open, seed, uid])

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
  // seleciona / limpa todas as perguntas de nível 0
  function selecionarTodas() {
    const todas: Record<string, boolean> = {}; blocos.forEach(b => { if (b.nivel === 0 && !b.grupo) todas[b.id] = true }); setSel(todas)
  }
  // aplica uma cor de fundo às perguntas selecionadas (e às respostas aninhadas)
  function corSelecionadas(cor: string) {
    const bs = blocos.slice()
    for (let i = 0; i < bs.length; i++) {
      if (bs[i].nivel === 0 && !bs[i].grupo && sel[bs[i].id]) { const fim = fimSubarvore(bs, i); for (let k = i; k <= fim; k++) bs[k] = { ...bs[k], cor } }
    }
    setBlocos(bs)
  }
  // negrito on/off apenas nas perguntas selecionadas
  function negritoSelecionadas(on: boolean) {
    const bs = blocos.map(b => {
      if (b.nivel !== 0 || b.grupo || !sel[b.id]) return b
      const semB = b.html.replace(/<\/?(b|strong)>/gi, '').replace(/font-weight\s*:\s*(bold|[5-9]00)\s*;?/gi, '')
      return { ...b, html: on ? `<b>${semB}</b>` : semB }
    })
    setBlocos(bs)
  }
  // remove numeração inicial só das perguntas selecionadas
  function stripNumSelecionadas() {
    const bs = blocos.map(b => (b.nivel === 0 && !b.grupo && sel[b.id]) ? { ...b, html: stripNumInicial(b.html) } : b); setBlocos(bs)
  }
  // exclui as perguntas selecionadas (com respostas aninhadas)
  function excluirSelecionadas() {
    const [restantes] = extrairSelecionadas(sel)
    if (!window.confirm(`Excluir ${selCount} pergunta(s) selecionada(s) e suas respostas?`)) return
    setBlocos(restantes.length ? restantes : [blocoVazio()]); setSel({})
  }
  // negrito em massa nas perguntas (todas em negrito, ou tirar de todas)
  function negritoTodas(on: boolean) {
    const bs = blocos.map(b => {
      if (b.nivel !== 0 || b.grupo) return b
      const semB = b.html.replace(/<\/?(b|strong)>/gi, '').replace(/font-weight\s*:\s*(bold|[5-9]00)\s*;?/gi, '')
      return { ...b, html: on ? `<b>${semB}</b>` : semB }
    })
    setBlocos(bs)
  }
  // remove a numeração que já veio embutida no texto das perguntas (evita "1 - 1")
  function removerNumeracaoTexto() {
    let n = 0
    const bs = blocos.map(b => {
      if (b.nivel !== 0 || b.grupo) return b
      const novo = stripNumInicial(b.html)
      if (novo !== b.html) n++
      return { ...b, html: novo }
    })
    if (!n) { window.alert('Nenhuma numeração no início das perguntas foi encontrada.'); return }
    setBlocos(bs)
  }
  // monta os cartões (pergunta/resposta) de um grupo para o modo flashcard
  function cardsDoGrupo(gi: number): { p: string; r: string; id: string }[] {
    const cards: { p: string; r: string; id: string }[] = []
    for (let j = gi + 1; j < blocos.length && !blocos[j].grupo; j++) {
      if (blocos[j].nivel !== 0) continue
      let r = ''
      for (let k = j + 1; k < blocos.length && !blocos[k].grupo && blocos[k].nivel > 0; k++) r += `<div style="margin:3px 0">${blocos[k].html}</div>`
      cards.push({ p: blocos[j].html || '(sem pergunta)', r: r || '<i style="opacity:.55">(sem resposta cadastrada)</i>', id: blocos[j].id })
    }
    return cards
  }
  // cartões de TODAS as perguntas do documento (flashcards do arquivo inteiro)
  function cardsDoDoc(): { p: string; r: string; id: string }[] {
    const cards: { p: string; r: string; id: string }[] = []
    for (let j = 0; j < blocos.length; j++) {
      if (blocos[j].grupo || blocos[j].nivel !== 0) continue
      let r = ''
      for (let k = j + 1; k < blocos.length && !blocos[k].grupo && blocos[k].nivel > 0; k++) r += `<div style="margin:3px 0">${blocos[k].html}</div>`
      cards.push({ p: blocos[j].html || '(sem pergunta)', r: r || '<i style="opacity:.55">(sem resposta cadastrada)</i>', id: blocos[j].id })
    }
    return cards
  }
  function abrirFlashcards(gi: number, titulo: string) { const cards = cardsDoGrupo(gi); if (!cards.length) { alert('Este grupo não tem perguntas ainda.'); return } setFlash({ titulo, cards, idx: 0, virado: false }) }
  function abrirFlashcardsDoc() { const cards = cardsDoDoc(); if (!cards.length) { alert('Este arquivo não tem perguntas ainda.'); return } setFlash({ titulo: doc_?.titulo || 'Arquivo', cards, idx: 0, virado: false }) }
  // marca acerto/erro a partir do flashcard (conecta o baralho ao desempenho)
  function marcarFlash(res: 'a' | 'e') {
    if (!flash) return
    const card = flash.cards[flash.idx]; const i = blocos.findIndex(b => b.id === card.id)
    if (i >= 0) setBlocoCampo(i, { res, data: hojeISO() })
    if (flash.idx < flash.cards.length - 1) setFlash(f => f && { ...f, idx: f.idx + 1, virado: false })
    else setFlash(f => f && { ...f, virado: true })
  }
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
  // salta para o modo de edição focando um bloco específico (da visão de estudo)
  function editarBloco(id: string) { setVista('editar'); setTimeout(() => focar(id), 120) }

  // visibilidade (collapse) no modo edição
  const visiveis = useMemo(() => {
    const out: number[] = []; let corte = -1; let grupoFechado = false
    blocos.forEach((b, i) => {
      if (b.grupo) { grupoFechado = b.aberto === false; corte = -1; out.push(i); return }
      if (grupoFechado) return
      if (corte >= 0) { if (b.nivel > corte) return; corte = -1 }
      out.push(i)
      if (!b.aberto && i < blocos.length - 1 && blocos[i + 1].nivel > b.nivel && !blocos[i + 1].grupo) corte = b.nivel
    })
    return out
  }, [blocos])
  const numerado = doc_?.numerado !== false
  const numeroDe = useMemo(() => { const m: Record<string, number> = {}; let n = 0; blocos.forEach(b => { if (b.nivel === 0 && !b.grupo) { n++; m[b.id] = n } }); return m }, [blocos])

  // ── Estrutura para o modo ESTUDAR: seções (grupos ou "Geral") com questões ──
  const secoes = useMemo<Secao[]>(() => {
    const out: Secao[] = []
    let atual: Secao = { key: '__geral__', grupoId: null, gi: null, titulo: 'Sem grupo', aberto: true, questoes: [] }
    let n = 0
    blocos.forEach((b, i) => {
      if (b.grupo) {
        if (atual.questoes.length || atual.gi !== null) out.push(atual)
        atual = { key: b.id, grupoId: b.id, gi: i, titulo: stripHtml(b.html) || 'Grupo', aberto: b.aberto !== false, questoes: [] }
        return
      }
      if (b.nivel === 0) {
        n++
        let r = ''
        for (let k = i + 1; k < blocos.length && !blocos[k].grupo && blocos[k].nivel > 0; k++) r += `<div style="margin:5px 0">${blocos[k].html}</div>`
        atual.questoes.push({ qi: i, id: b.id, numero: n, perguntaHtml: b.html || '<i style="opacity:.5">(sem pergunta)</i>', respostaHtml: r, res: b.res, pct: b.pct, temResposta: !!r.trim() })
      }
    })
    if (atual.questoes.length || atual.gi !== null) out.push(atual)
    return out
  }, [blocos])

  // desempenho detalhado (para o painel superior do modo estudar)
  const desempenho = useMemo(() => {
    const qs = blocos.filter(b => b.nivel === 0 && !b.grupo)
    const ac = qs.filter(b => b.res === 'a').length
    const er = qs.filter(b => b.res === 'e').length
    const resp = ac + er
    const pend = qs.length - resp
    return { total: qs.length, resp, ac, er, pend, aRevisar: er + pend, pct: resp ? Math.round(ac / resp * 100) : 0 }
  }, [blocos])

  // aplica filtro + busca às questões de uma seção (modo estudar)
  const termoBusca = busca.trim().toLowerCase()
  function filtrarQuestoes(qs: Questao[]): Questao[] {
    return qs.filter(q => {
      if (filtro === 'revisar' && q.res !== 'e') return false
      if (filtro === 'acertos' && q.res !== 'a') return false
      if (filtro === 'pendentes' && q.res) return false
      if (termoBusca) { const t = (stripHtml(q.perguntaHtml) + ' ' + stripHtml(q.respostaHtml)).toLowerCase(); if (!t.includes(termoBusca)) return false }
      return true
    })
  }
  const secoesFiltradas = useMemo(() => secoes.map(s => ({ ...s, questoesFiltradas: filtrarQuestoes(s.questoes) })).filter(s => s.questoesFiltradas.length > 0 || (filtro === 'todas' && !termoBusca && s.questoes.length === 0 && s.gi !== null)), [secoes, filtro, termoBusca])
  const totalFiltrado = useMemo(() => secoesFiltradas.reduce((a, s) => a + s.questoesFiltradas.length, 0), [secoesFiltradas])

  function zerarDesempenho() {
    if (!window.confirm('Zerar todos os resultados (acertos/erros) deste arquivo?')) return
    const bs = blocos.map(b => (b.nivel === 0 && !b.grupo) ? { ...b, res: undefined, data: undefined } : b); setBlocos(bs)
  }
  // desempenho por seção (para a barra de progresso de cada grupo)
  function statSecao(s: Secao) {
    const ac = s.questoes.filter(q => q.res === 'a').length
    const er = s.questoes.filter(q => q.res === 'e').length
    const resp = ac + er
    return { total: s.questoes.length, ac, er, resp, pct: resp ? Math.round(ac / resp * 100) : 0 }
  }

  // ── Janela: mover / redimensionar ──
  useEffect(() => {
    const mm = (e: MouseEvent) => {
      if (drag.current) setPos({ x: Math.max(0, e.clientX - drag.current.ox), y: Math.max(0, e.clientY - drag.current.oy) })
      if (rez.current) setSize({ w: Math.max(640, rez.current.ow + (e.clientX - rez.current.px)), h: Math.max(400, rez.current.oh + (e.clientY - rez.current.py)) })
    }
    const mu = () => { drag.current = null; rez.current = null }
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu)
    return () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu) }
  }, [])
  // teclado no flashcard: ←/→ navega, espaço vira
  useEffect(() => {
    if (!flash) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); setFlash(f => f && (f.idx < f.cards.length - 1 ? { ...f, idx: f.idx + 1, virado: false } : f)) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setFlash(f => f && (f.idx > 0 ? { ...f, idx: f.idx - 1, virado: false } : f)) }
      else if (e.key === ' ') { e.preventDefault(); setFlash(f => f && { ...f, virado: !f.virado }) }
      else if (e.key === 'Escape') setFlash(null)
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [flash])

  if (!open) return null

  // ─── Árvore de pastas (sidebar) ───
  const arvore = (parent: string, depth: number): React.ReactNode => pastas.filter(p => p.parent === parent).sort((a, b) => a.nome.localeCompare(b.nome)).map(p => {
    const aberta = abertas[p.id]
    const arqs = docs.filter(d => d.pasta === p.id).sort((a, b) => a.titulo.localeCompare(b.titulo))
    const subs = pastas.filter(x => x.parent === p.id).length
    return (
      <div key={p.id} style={{ marginLeft: depth ? 11 : 0 }}>
        <div className="tg-row" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', borderRadius: 8, cursor: 'pointer' }}>
          <span onClick={() => setAbertas(a => ({ ...a, [p.id]: !a[p.id] }))} style={{ width: 14, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.7rem' }}>{(subs || arqs.length) ? (aberta ? '▾' : '▸') : '·'}</span>
          <span onClick={() => corPasta(p)} title="Trocar a cor" style={{ width: 9, height: 9, borderRadius: 3, background: p.cor, flexShrink: 0, cursor: 'pointer' }} />
          <span onClick={() => setAbertas(a => ({ ...a, [p.id]: !a[p.id] }))} onDoubleClick={() => renomearPasta(p)} style={{ flex: 1, fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</span>
          <span className="tg-act" style={{ display: 'flex', gap: 1 }}>
            <button onClick={() => novoArquivo(p.id)} title="Novo arquivo" style={miniBtn}>📄</button>
            <button onClick={() => novaPasta(p.id)} title="Nova subpasta" style={miniBtn}>📁</button>
            <button onClick={() => excluirPasta(p)} title="Excluir" style={miniBtn}>🗑️</button>
          </span>
        </div>
        {aberta && (
          <div style={{ marginLeft: 13 }}>
            {arqs.map(d => {
              const nq = (d.blocos || []).filter(b => b.nivel === 0 && !b.grupo).length
              const ativa = docId === d.id
              return (
                <div key={d.id} className="tg-row" onClick={() => setDocId(d.id)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 7px', borderRadius: 8, cursor: 'pointer', background: ativa ? 'var(--accent-bg)' : 'transparent', boxShadow: ativa ? 'inset 2px 0 0 var(--accent)' : 'none' }}>
                  <span style={{ fontSize: '.78rem' }}>{ativa ? '📖' : '📄'}</span>
                  <span style={{ flex: 1, fontSize: '.8rem', color: ativa ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: ativa ? 800 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.titulo || 'Sem título'}</span>
                  {nq > 0 && <span style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 999, padding: '1px 6px' }}>{nq}</span>}
                  <button className="tg-act" onClick={e => { e.stopPropagation(); setDestino({ tipo: 'mover', docId: d.id }) }} title="Mover para outra pasta" style={miniBtn}>📂</button>
                  <button className="tg-act" onClick={e => { e.stopPropagation(); excluirArquivo(d) }} title="Excluir arquivo" style={miniBtn}>🗑️</button>
                </div>
              )
            })}
            {arvore(p.id, depth + 1)}
          </div>
        )}
      </div>
    )
  })

  const winStyle: React.CSSProperties = max
    ? { position: 'fixed', inset: 8, zIndex: 9700 }
    : { position: 'fixed', left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex: 9700 }

  const corDesemp = desempenho.pct >= 70 ? '#10b981' : desempenho.pct >= 50 ? '#f59e0b' : '#ef4444'

  return createPortal(<>
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9699, background: 'rgba(15,17,26,0.44)', backdropFilter: 'blur(3px)' }} />
    <div style={{ ...winStyle, display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 18, boxShadow: '0 44px 110px rgba(0,0,0,0.58)', overflow: 'hidden' }}>
      <style>{`
        .tg-row .tg-act{opacity:0;transition:opacity .15s}
        .tg-row:hover .tg-act{opacity:1}
        .tg-row:hover{background:var(--surface)}
        .tg-ed:empty:before{content:attr(data-ph);color:var(--text-muted);opacity:.55}
        .tg-ed{font-weight:400}
        .tg-ed b,.tg-ed strong{font-weight:800;color:var(--text-primary)}
        .tg-card b,.tg-card strong{font-weight:800}
        .tg-headbtn{border:1px solid var(--border-md);background:var(--card-bg);color:var(--text-secondary);cursor:pointer;font-size:.72rem;font-weight:700;padding:5px 10px;border-radius:8px;white-space:nowrap;transition:all .13s;display:inline-flex;align-items:center;gap:4px;font-family:var(--font-display)}
        .tg-headbtn:hover{border-color:var(--accent);color:var(--text-primary)}
        .tg-headbtn.on{background:var(--accent);color:#fff;border-color:transparent}
        .tg-ed table{border-collapse:collapse;margin:5px 0;font-size:.82rem;max-width:100%}
        .tg-ed td,.tg-ed th{border:1px solid var(--border-md);padding:4px 8px;vertical-align:top}
        .tg-ed th{background:var(--surface)}
        .tg-ed img{max-width:100%;height:auto;border-radius:6px}
        .tg-blk .tg-bact{opacity:0;transition:opacity .15s}
        .tg-blk:hover .tg-bact{opacity:1}
        .tg-blk:hover{background:var(--surface)!important}
        /* Segmented control */
        .tg-seg{display:inline-flex;background:var(--bg-1);border:1px solid var(--border);border-radius:11px;padding:3px}
        .tg-seg button{border:none;background:transparent;cursor:pointer;font-size:.8rem;font-weight:800;padding:6px 15px;border-radius:8px;color:var(--text-muted);display:inline-flex;align-items:center;gap:6px;transition:all .16s;font-family:var(--font-display)}
        .tg-seg button.on{background:var(--card-bg);color:var(--text-primary);box-shadow:0 2px 8px rgba(0,0,0,.14)}
        .tg-seg button:not(.on):hover{color:var(--text-secondary)}
        /* Chips de filtro */
        .tg-chip{border:1px solid var(--border-md);background:var(--card-bg);color:var(--text-secondary);cursor:pointer;font-size:.74rem;font-weight:700;padding:5px 12px;border-radius:999px;transition:all .14s;display:inline-flex;align-items:center;gap:5px}
        .tg-chip:hover{border-color:var(--accent);color:var(--text-primary)}
        .tg-chip.on{background:var(--accent);color:#fff;border-color:var(--accent)}
        /* Cartão de questão */
        .tg-card{border:1px solid var(--border);border-radius:14px;background:var(--card-bg);margin-bottom:11px;transition:box-shadow .18s,border-color .18s,transform .12s;overflow:hidden}
        .tg-card:hover{border-color:var(--border-md);box-shadow:0 6px 22px rgba(0,0,0,.08)}
        .tg-card.rev{border-color:color-mix(in srgb,var(--accent) 40%,var(--border))}
        .tg-card.esc{border-color:color-mix(in srgb,#7c3aed 38%,var(--border))}
        .tg-cardhead{display:flex;align-items:flex-start;gap:13px;padding:15px 17px;transition:background .14s}
        .tg-cardhead:hover{background:var(--surface)}
        .tg-num{flex-shrink:0;width:30px;height:30px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:.86rem;font-family:var(--font-display);border:1.5px solid transparent}
        .tg-cardbody{animation:tgReveal .22s ease}
        @keyframes tgReveal{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
        .tg-gbtn{border:1px solid var(--border-md);background:var(--card-bg);cursor:pointer;font-size:.78rem;font-weight:800;padding:7px 14px;border-radius:9px;transition:all .14s;font-family:var(--font-display);display:inline-flex;align-items:center;gap:5px}
        .tg-gbtn:hover{transform:translateY(-1px)}
        .tg-fmt{border:1px solid var(--border-md);background:var(--card-bg);color:var(--text-secondary);cursor:pointer;border-radius:8px;height:29px;min-width:29px;padding:0 8px;font-size:.82rem;display:inline-flex;align-items:center;justify-content:center;transition:all .12s}
        .tg-fmt:hover{background:var(--surface);color:var(--text-primary);transform:translateY(-1px)}
        .tg-sw{width:19px;height:19px;border-radius:5px;border:1px solid var(--border-md);cursor:pointer;padding:0;transition:transform .12s}
        .tg-sw:hover{transform:scale(1.15)}
        .tg-secbar{transition:width .5s cubic-bezier(.4,0,.2,1)}
      `}</style>

      {/* barra de título */}
      <div onMouseDown={e => { if (!max) drag.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y } }} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 15px', background: 'linear-gradient(120deg,color-mix(in srgb,var(--accent) 14%,transparent),transparent 65%)', borderBottom: '1px solid var(--border)', cursor: max ? 'default' : 'move', userSelect: 'none' }}>
        <span style={{ fontSize: '1.1rem' }}>🎯</span>
        <b style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-primary)', fontSize: '1.02rem' }}>Toggle</b>
        <span style={{ fontSize: '.66rem', color: 'var(--text-muted)', fontWeight: 600 }}>estudo ativo &amp; desempenho</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setSidebar(s => !s)} title={sidebar ? 'Ocultar pastas' : 'Mostrar pastas'} style={{ ...winBtn, color: sidebar ? 'var(--accent)' : 'var(--text-secondary)' }}>🗂️</button>
        <button onClick={() => setMax(m => !m)} title={max ? 'Restaurar' : 'Maximizar'} style={winBtn}>{max ? '🗗' : '🗖'}</button>
        <button onClick={onClose} title="Fechar" style={{ ...winBtn, color: '#ef4444' }}>✕</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* sidebar de pastas */}
        {sidebar && (
          <div style={{ width: 248, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg-1)' }}>
            <div style={{ display: 'flex', gap: 6, padding: 11, borderBottom: '1px solid var(--border)' }}>
              <button onClick={() => novaPasta('')} style={{ flex: 1, ...softBtn }}>＋ Pasta</button>
              <label style={{ ...softBtn, cursor: impBusy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Importar Word (.docx) ou PDF com perguntas e respostas">
                {impBusy ? <span className="nx-spin">⏳</span> : '📥'} Importar
                <input type="file" accept=".docx,.pdf" disabled={impBusy} onChange={e => { const f = e.target.files?.[0]; if (f) setDestino({ tipo: 'import', file: f }); e.currentTarget.value = '' }} style={{ display: 'none' }} />
              </label>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 9 }}>
              {pastas.length === 0
                ? <div style={{ color: 'var(--text-muted)', fontSize: '.78rem', textAlign: 'center', padding: 24, lineHeight: 1.6 }}>Crie uma <b>pasta</b> para organizar seus materiais de estudo.</div>
                : arvore('', 0)}
            </div>
            <div style={{ padding: '8px 11px', borderTop: '1px solid var(--border)', fontSize: '.64rem', color: 'var(--text-muted)', textAlign: 'center' }}>{docs.length} arquivo(s) · {pastas.length} pasta(s)</div>
          </div>
        )}

        {/* área principal */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {!doc_ ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-muted)', padding: 30 }}>
              <div style={{ fontSize: '3rem' }}>🎯</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>Selecione ou crie um arquivo</div>
              <div style={{ fontSize: '.82rem', maxWidth: 430, textAlign: 'center', lineHeight: 1.7 }}>No modo <b>Estudar</b> você revisa suas perguntas como cartões, acompanha o aproveitamento e faz flashcards. No modo <b>Editar</b> você escreve, aninha respostas, agrupa e organiza com IA.</div>
            </div>
          ) : (<>
            {/* cabeçalho do documento: título + alternância Estudar/Editar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderBottom: '1px solid var(--border)' }}>
              <input value={doc_.titulo} onChange={e => salvarDoc({ ...doc_, titulo: e.target.value })} placeholder="Título do arquivo" style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontSize: '1.22rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }} />
              {vista === 'estudar' && desempenho.total > 0 && (
                <button className={`tg-headbtn${painelAberto ? '' : ' on'}`} onClick={() => setPainelAberto(v => !v)} title={painelAberto ? 'Ocultar painel de desempenho e filtros (visão limpa só com as perguntas)' : 'Mostrar painel de desempenho e filtros'}>{painelAberto ? '▴ Ocultar painel' : '▾ Painel'}</button>
              )}
              <div className="tg-seg">
                <button className={vista === 'estudar' ? 'on' : ''} onClick={() => setVista('estudar')}>🎯 Estudar</button>
                <button className={vista === 'editar' ? 'on' : ''} onClick={() => setVista('editar')}>✏️ Editar</button>
              </div>
            </div>

            {vista === 'estudar' ? (
              /* ═══════════════ MODO ESTUDAR ═══════════════ */
              <>
                {/* Painel de desempenho */}
                {painelAberto && desempenho.total > 0 && (
                  <div style={{ padding: '15px 20px 13px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(160deg,var(--surface),transparent)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                      {/* anel de aproveitamento */}
                      <div style={{ position: 'relative', width: 76, height: 76, flexShrink: 0 }}>
                        <svg width="76" height="76" viewBox="0 0 76 76" style={{ transform: 'rotate(-90deg)' }}>
                          <circle cx="38" cy="38" r="32" fill="none" stroke="var(--border)" strokeWidth="7" />
                          <circle cx="38" cy="38" r="32" fill="none" stroke={corDesemp} strokeWidth="7" strokeLinecap="round" strokeDasharray={2 * Math.PI * 32} strokeDashoffset={2 * Math.PI * 32 * (1 - (desempenho.resp ? desempenho.pct / 100 : 0))} style={{ transition: 'stroke-dashoffset .6s ease' }} />
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: '1.15rem', fontWeight: 800, color: corDesemp, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{desempenho.resp ? desempenho.pct + '%' : '—'}</span>
                          <span style={{ fontSize: '.54rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 2 }}>aproveit.</span>
                        </div>
                      </div>
                      {/* números */}
                      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', flex: 1 }}>
                        {[
                          { lbl: 'Perguntas', v: desempenho.total, c: 'var(--text-primary)' },
                          { lbl: 'Acertos', v: desempenho.ac, c: '#10b981' },
                          { lbl: 'Erros', v: desempenho.er, c: '#ef4444' },
                          { lbl: 'Pendentes', v: desempenho.pend, c: 'var(--text-muted)' },
                        ].map(x => (
                          <div key={x.lbl}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: x.c, fontFamily: 'var(--font-display)', lineHeight: 1.1 }}>{x.v}</div>
                            <div style={{ fontSize: '.64rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{x.lbl}</div>
                          </div>
                        ))}
                      </div>
                      {/* ações rápidas */}
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        <button onClick={abrirFlashcardsDoc} title="Estudar todas as perguntas como flashcards" style={{ ...softBtn, background: 'var(--accent)', color: '#fff', border: 'none' }}>🎴 Flashcards</button>
                        {desempenho.resp > 0 && <button onClick={zerarDesempenho} style={{ ...softBtn }} title="Zerar acertos/erros">↺ Zerar</button>}
                      </div>
                    </div>
                    {/* barra de progresso respondidas */}
                    <div style={{ marginTop: 13, height: 8, borderRadius: 999, background: 'var(--border)', overflow: 'hidden', display: 'flex' }}>
                      <div className="tg-secbar" style={{ width: `${desempenho.total ? desempenho.ac / desempenho.total * 100 : 0}%`, background: '#10b981' }} />
                      <div className="tg-secbar" style={{ width: `${desempenho.total ? desempenho.er / desempenho.total * 100 : 0}%`, background: '#ef4444' }} />
                    </div>
                    <div style={{ marginTop: 5, fontSize: '.68rem', color: 'var(--text-muted)' }}>{desempenho.resp} de {desempenho.total} respondida(s){desempenho.aRevisar > 0 && ` · ${desempenho.aRevisar} a revisar`}</div>
                  </div>
                )}

                {/* Filtros + busca */}
                {painelAberto && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    {([['todas', 'Todas', '📋'], ['pendentes', 'Pendentes', '⚪'], ['revisar', 'Erros', '🔴'], ['acertos', 'Dominadas', '🟢']] as [Filtro, string, string][]).map(([f, lbl, ic]) => (
                      <button key={f} className={`tg-chip${filtro === f ? ' on' : ''}`} onClick={() => setFiltro(f)}>{ic} {lbl}</button>
                    ))}
                    <span style={{ flex: 1 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-1)', border: '1px solid var(--border-md)', borderRadius: 9, padding: '0 10px', height: 32 }}>
                      <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>🔍</span>
                      <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar…" style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '.8rem', color: 'var(--text-primary)', width: 130 }} />
                      {busca && <button onClick={() => setBusca('')} style={{ ...miniBtn, fontSize: '.7rem' }}>✕</button>}
                    </div>
                  </div>
                )}

                {/* Lista de questões por seção */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                  {desempenho.total === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-muted)', padding: '40px 20px', textAlign: 'center' }}>
                      <div style={{ fontSize: '2.2rem' }}>📝</div>
                      <div style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Nenhuma pergunta ainda</div>
                      <div style={{ fontSize: '.78rem', maxWidth: 360, lineHeight: 1.6 }}>Vá em <b>✏️ Editar</b> para escrever ou colar perguntas, ou importe um Word/PDF pela barra lateral. A IA pode organizar tudo em pares pergunta/resposta.</div>
                      <button onClick={() => setVista('editar')} style={{ ...softBtn, background: 'var(--accent)', color: '#fff', border: 'none', marginTop: 4 }}>✏️ Ir para o editor</button>
                    </div>
                  ) : totalFiltrado === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px', fontSize: '.85rem' }}>Nenhuma pergunta corresponde ao filtro{busca ? ' e à busca' : ''}.</div>
                  ) : secoesFiltradas.map(s => {
                    const st = statSecao(s)
                    return (
                      <div key={s.key} style={{ marginBottom: 22 }}>
                        {/* cabeçalho da seção (grupo) */}
                        {s.gi !== null && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11, paddingBottom: 9, borderBottom: '2px solid var(--border)' }}>
                            <button onClick={() => alternar(s.gi!)} title={s.aberto ? 'Recolher' : 'Expandir'} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '.85rem', color: 'var(--text-primary)' }}>{s.aberto ? '▾' : '▸'}</button>
                            <span style={{ fontSize: '1rem' }}>🗂️</span>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', flex: 1 }} dangerouslySetInnerHTML={{ __html: s.titulo }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {st.resp > 0 && <span style={{ fontSize: '.68rem', fontWeight: 800, color: st.pct >= 70 ? '#10b981' : st.pct >= 50 ? '#f59e0b' : '#ef4444' }}>{st.pct}%</span>}
                              <div style={{ width: 70, height: 6, borderRadius: 999, background: 'var(--border)', overflow: 'hidden', display: 'flex' }}>
                                <div style={{ width: `${st.total ? st.ac / st.total * 100 : 0}%`, background: '#10b981' }} />
                                <div style={{ width: `${st.total ? st.er / st.total * 100 : 0}%`, background: '#ef4444' }} />
                              </div>
                              <span style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{st.total} q</span>
                              <button onClick={() => abrirFlashcards(s.gi!, stripHtml(s.titulo) || 'Grupo')} title="Flashcards deste grupo" style={{ ...miniBtn, fontSize: '.9rem' }}>🎴</button>
                            </div>
                          </div>
                        )}
                        {s.aberto && s.questoesFiltradas.map(q => {
                          const rev = !!reveladas[q.id]
                          const esc = !!estudoAberto[q.id]
                          const b = blocos[q.qi] || ({} as Bloco)
                          const numCor = q.res === 'a' ? { color: '#fff', background: '#10b981', borderColor: '#10b981' } : q.res === 'e' ? { color: '#fff', background: '#ef4444', borderColor: '#ef4444' } : { color: 'var(--accent)', background: 'var(--accent-bg)', borderColor: 'transparent' }
                          return (
                            <div key={q.id} className={`tg-card${rev ? ' rev' : ''}${esc ? ' esc' : ''}`}>
                              <div className="tg-cardhead" onClick={() => setReveladas(r => ({ ...r, [q.id]: !r[q.id] }))} title="Clique para ver / ocultar a resposta" style={{ cursor: 'pointer' }}>
                                <span className="tg-num" style={numCor}>{q.numero}</span>
                                <div style={{ flex: 1, minWidth: 0, fontSize: '.96rem', lineHeight: 1.55, color: 'var(--text-primary)', fontWeight: 600 }} dangerouslySetInnerHTML={{ __html: q.perguntaHtml }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                  {q.res && <span title={b.data ? (q.res === 'a' ? 'Acertou' : 'Errou') + ' em ' + brData(b.data) : ''} style={{ fontSize: '.72rem', fontWeight: 800, color: q.res === 'a' ? '#10b981' : '#ef4444' }}>{q.res === 'a' ? '✓' : '✗'}</span>}
                                  <button onClick={e => { e.stopPropagation(); setEstudoAberto(x => ({ ...x, [q.id]: !x[q.id] })) }} className={`tg-headbtn${esc ? ' on' : ''}`} title="Responder de memória, sem ver o gabarito">✎ Responder</button>
                                  <span style={{ fontSize: '.8rem', color: 'var(--text-muted)', fontWeight: 700, width: 14, textAlign: 'center' }}>{rev ? '▾' : '▸'}</span>
                                </div>
                              </div>
                              {/* painel: RESPONDER por escrito (não mostra o gabarito) */}
                              {esc && (
                                <div className="tg-cardbody" style={{ padding: '0 17px 15px', borderTop: '1px solid var(--border)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '12px 0 7px' }}>
                                    <span style={{ fontSize: '.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-accent)' }}>✎ Sua resposta</span>
                                    <span style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>— de memória; o gabarito fica oculto até você pedir</span>
                                  </div>
                                  <textarea autoFocus value={b.resp || ''} onChange={e => setBlocoCampo(q.qi, { resp: e.target.value })} placeholder="Escreva aqui a sua resposta, testando o seu conhecimento…" style={{ width: '100%', boxSizing: 'border-box', minHeight: 90, resize: 'vertical', border: '1px solid var(--border-md)', borderRadius: 9, background: 'var(--bg-1)', color: 'var(--text-primary)', padding: 11, fontSize: '.88rem', outline: 'none', lineHeight: 1.55 }} />
                                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
                                    <button onClick={() => conferirIA(q.qi)} disabled={conferindo[q.id]} style={{ ...softBtn, background: 'linear-gradient(135deg,#7c3aed,#5b5bd6)', color: '#fff', border: 'none', opacity: conferindo[q.id] ? 0.6 : 1 }}>{conferindo[q.id] ? <><span className="nx-spin">⏳</span> Conferindo…</> : '✓ Conferir com IA'}</button>
                                    {(b.resp || typeof b.pct === 'number' || b.fb) && <button onClick={() => limparResposta(q.qi)} title="Apagar a resposta e a correção da IA (mantém o histórico de acerto/erro)" style={{ ...softBtn }}>🧹 Limpar</button>}
                                    <span style={{ flex: 1 }} />
                                    <button onClick={() => setReveladas(r => ({ ...r, [q.id]: true }))} style={{ ...softBtn }} title="Revelar o gabarito para comparar">👁 Ver gabarito</button>
                                  </div>
                                  {typeof b.pct === 'number' && (b.pct > 0 || !!b.fb) && (
                                    <div style={{ marginTop: 10, padding: 11, borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                        <strong style={{ color: b.pct >= 60 ? '#10b981' : b.pct >= 40 ? '#f59e0b' : '#ef4444', fontSize: '1.2rem', fontFamily: 'var(--font-display)' }}>{b.pct}%</strong>
                                        <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>de adequação ao gabarito (estimativa da IA)</span>
                                      </div>
                                      {b.fb && <div style={{ marginTop: 6, fontSize: '.83rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{b.fb}</div>}
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* painel: RESPOSTA / gabarito + auto-avaliação */}
                              {rev && (
                                <div className="tg-cardbody" style={{ padding: '0 17px 15px', borderTop: '1px solid var(--border)' }}>
                                  <div style={{ fontSize: '.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-accent)', margin: '12px 0 6px' }}>Resposta / gabarito</div>
                                  <div style={{ fontSize: '.9rem', lineHeight: 1.6, color: 'var(--text-secondary)', padding: '10px 13px', borderRadius: 10, background: 'var(--bg-1)', border: '1px solid var(--border)' }} dangerouslySetInnerHTML={{ __html: q.temResposta ? q.respostaHtml : '<i style="opacity:.55">Sem resposta cadastrada — avalie sozinho ou use ✎ Responder para escrever a sua.</i>' }} />
                                  {/* auto-avaliação */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '.76rem', fontWeight: 700, color: 'var(--text-muted)' }}>Como você foi?</span>
                                    <button onClick={() => marcarResultado(q.qi, 'a')} className="tg-gbtn" style={{ color: q.res === 'a' ? '#fff' : '#10b981', background: q.res === 'a' ? '#10b981' : 'var(--card-bg)', border: q.res === 'a' ? 'none' : '1px solid #10b98155' }}>✓ Acertei</button>
                                    <button onClick={() => marcarResultado(q.qi, 'e')} className="tg-gbtn" style={{ color: q.res === 'e' ? '#fff' : '#ef4444', background: q.res === 'e' ? '#ef4444' : 'var(--card-bg)', border: q.res === 'e' ? 'none' : '1px solid #ef444455' }}>✗ Errei</button>
                                    <span style={{ flex: 1 }} />
                                    {!esc && <button onClick={() => setEstudoAberto(x => ({ ...x, [q.id]: true }))} className="tg-gbtn" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-md)' }}>✎ Responder por escrito</button>}
                                    <button onClick={() => editarBloco(q.id)} title="Editar esta pergunta/resposta" className="tg-gbtn" style={{ color: 'var(--text-muted)', border: '1px solid var(--border-md)' }}>✏️</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                        {s.gi !== null && !s.aberto && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', paddingLeft: 34, marginTop: -4 }}>{st.total} pergunta(s) recolhida(s)</div>}
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              /* ═══════════════ MODO EDITAR ═══════════════ */
              <>
                {/* ações do documento */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', background: 'var(--bg-1)' }}>
                  <button onClick={() => salvarDoc({ ...doc_, numerado: !numerado })} title={numerado ? 'Numeração automática ATIVA (badge azul) — clicar troca para marcador •' : 'Marcador • ativo — clicar troca para numeração automática'} style={{ ...softBtn, minWidth: 40, background: numerado ? 'var(--accent-bg)' : undefined, color: numerado ? 'var(--accent)' : undefined, fontWeight: 800 }}>{numerado ? '1.' : '•'}</button>
                  <button onClick={removerNumeracaoTexto} title="Remover a numeração que veio junto no texto das perguntas (ex.: '1 - ', '2) '), deixando só a numeração automática do Toggle" style={{ ...softBtn }}>🔢⌫ Remover nº do texto</button>
                  <button onClick={() => { const bs = blocos.concat(blocoVazio(0)); setBlocos(bs); setTimeout(() => focar(bs[bs.length - 1].id), 30) }} style={softBtn}>＋ Bloco</button>
                  <button onClick={novoGrupo} title="Criar um grupo (título) para classificar perguntas" style={softBtn}>🗂️ Grupo</button>
                  <button onClick={() => { setSelMode(v => !v); setSel({}) }} title="Selecionar várias perguntas de uma vez para editar em massa (negrito, cor, numeração), agrupar ou excluir" style={{ ...softBtn, background: selMode ? 'var(--accent)' : undefined, color: selMode ? '#fff' : undefined, border: selMode ? 'none' : undefined }}>☑️ Selecionar</button>
                  <span style={{ flex: 1 }} />
                  <button onClick={organizarIA} disabled={iaBusy} title="Identifica perguntas e respostas e aninha as respostas (ocultas) dentro de cada pergunta" style={{ ...softBtn, background: 'linear-gradient(135deg,#7c3aed,#5b5bd6)', color: '#fff', border: 'none', opacity: iaBusy ? 0.6 : 1 }}>{iaBusy ? <><span className="nx-spin">⏳</span> Organizando…</> : '✨ Organizar P/R com IA'}</button>
                </div>
                {/* barra de formatação (contextual, compacta) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <button className="tg-fmt" title="Negrito (Ctrl+B)" onMouseDown={e => { e.preventDefault(); aplicarFmt('bold') }} style={{ fontWeight: 800 }}>B</button>
                  <button className="tg-fmt" title="Itálico (Ctrl+I)" onMouseDown={e => { e.preventDefault(); aplicarFmt('italic') }} style={{ fontStyle: 'italic' }}>I</button>
                  <button className="tg-fmt" title="Sublinhado (Ctrl+U)" onMouseDown={e => { e.preventDefault(); aplicarFmt('underline') }} style={{ textDecoration: 'underline' }}>U</button>
                  <button className="tg-fmt" title="Tachado" onMouseDown={e => { e.preventDefault(); aplicarFmt('strikeThrough') }} style={{ textDecoration: 'line-through' }}>S</button>
                  <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
                  {['#e8424d', '#2f7de1', '#16a34a', '#f59e0b', '#a855f7'].map(c => <button key={c} className="tg-sw" title="Cor do texto" onMouseDown={e => { e.preventDefault(); aplicarFmt('foreColor', c) }} style={{ background: c }} />)}
                  <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
                  {[['am', 'rgba(245,158,11,.5)'], ['vd', 'rgba(16,185,129,.45)'], ['az', 'rgba(56,189,248,.45)'], ['rs', 'rgba(236,72,153,.4)']].map(([n, c]) => <button key={n} className="tg-sw" title="Realçar" onMouseDown={e => { e.preventDefault(); aplicarFmt('hiliteColor', c) }} style={{ background: c }} />)}
                  <button className="tg-fmt" title="Remover realce" onMouseDown={e => { e.preventDefault(); aplicarFmt('hiliteColor', 'transparent') }} style={{ fontSize: '.7rem' }}>⌫</button>
                  <button className="tg-fmt" title="Limpar formatação" onMouseDown={e => { e.preventDefault(); aplicarFmt('removeFormat') }} style={{ fontSize: '.72rem' }}>✕</button>
                  <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
                  <button className="tg-fmt" title="Deixar TODAS as perguntas em negrito" onMouseDown={e => { e.preventDefault(); negritoTodas(true) }} style={{ fontSize: '.68rem', fontWeight: 800, minWidth: 'auto', padding: '0 10px', background: 'var(--text-primary)', color: 'var(--card-bg)', border: 'none' }}>Perguntas em <b style={{ fontWeight: 900, marginLeft: 3 }}>negrito</b></button>
                  <button className="tg-fmt" title="Tirar o negrito de TODAS as perguntas" onMouseDown={e => { e.preventDefault(); negritoTodas(false) }} style={{ fontSize: '.68rem', fontWeight: 400, minWidth: 'auto', padding: '0 10px' }}>Perguntas sem negrito</button>
                </div>
                {/* editor de blocos */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
                  {visiveis.map(i => {
                    const b = blocos[i]; const filhos = temFilhos(i)
                    if (b.grupo) {
                      const qtd = contaPerguntasGrupo(i)
                      return (
                        <div key={b.id} className="tg-blk" style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 16, marginBottom: 3, padding: '8px 10px', borderRadius: 10, background: 'var(--accent-bg)', border: '1px solid var(--border-md)' }}>
                          <button onClick={() => alternar(i)} title={b.aberto === false ? 'Expandir grupo' : 'Recolher grupo'} style={{ ...caret, color: 'var(--text-primary)', fontSize: '.9rem' }}>{b.aberto === false ? '▸' : '▾'}</button>
                          <span style={{ fontSize: '1rem' }}>🗂️</span>
                          <div data-bloco={b.id} className="tg-ed" data-ph="Nome do grupo" contentEditable suppressContentEditableWarning
                            ref={el => { if (el && el.innerHTML !== b.html && document.activeElement !== el) el.innerHTML = b.html }}
                            onInput={e => editar(i, (e.currentTarget as HTMLElement).innerHTML)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLElement).blur() } }}
                            style={{ flex: 1, outline: 'none', fontSize: '.98rem', fontWeight: 800, color: 'var(--text-primary)', minHeight: 20, padding: '1px 3px', wordBreak: 'break-word', fontFamily: 'var(--font-display)' }} />
                          <span style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap', background: 'var(--card-bg)', borderRadius: 999, padding: '2px 9px' }}>{qtd} q</span>
                          <button onClick={() => abrirFlashcards(i, stripHtml(b.html) || 'Grupo')} title="Estudar este grupo como flashcards" style={{ ...softBtn, padding: '0 11px', height: 29, background: 'var(--accent)', color: '#fff', border: 'none' }}>🎴</button>
                          <button onClick={() => apagar(i)} title="Excluir o título do grupo (as perguntas continuam)" style={miniBtn}>🗑️</button>
                        </div>
                      )
                    }
                    return (
                      <div key={b.id}>
                        <div className="tg-blk" style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginLeft: b.nivel * 22, padding: '3px 5px', borderRadius: 8, background: (selMode && sel[b.id]) ? 'var(--accent-bg)' : (COR_BLOCO[b.cor] || 'transparent') }}>
                          {selMode && b.nivel === 0 && <input type="checkbox" checked={!!sel[b.id]} onChange={e => setSel(s => ({ ...s, [b.id]: e.target.checked }))} title="Selecionar esta pergunta" style={{ marginTop: 5, width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }} />}
                          <button className="tg-caret" onClick={() => filhos && alternar(i)} title={filhos ? (b.aberto ? 'Recolher' : 'Expandir') : ''} style={{ ...caret, color: filhos ? 'var(--text-primary)' : 'transparent', cursor: filhos ? 'pointer' : 'default' }}>{b.aberto ? '▾' : '▸'}</button>
                          {numerado && b.nivel === 0
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 22, marginTop: 2, borderRadius: 7, background: 'var(--accent-bg)', color: 'var(--accent)', fontWeight: 800, fontSize: '.74rem', flexShrink: 0 }}>{numeroDe[b.id]}</span>
                            : <span style={{ color: 'var(--text-muted)', fontSize: '.5rem', marginTop: 9, minWidth: 12, textAlign: 'center' }}>•</span>}
                          <div data-bloco={b.id} className="tg-ed" data-ph="Escreva… (Tab aninha, Enter novo)" contentEditable={!(selMode && b.nivel === 0)} suppressContentEditableWarning
                            ref={el => { if (el && el.innerHTML !== b.html && document.activeElement !== el) el.innerHTML = b.html }}
                            onClick={selMode && b.nivel === 0 ? () => setSel(s => ({ ...s, [b.id]: !s[b.id] })) : undefined}
                            onInput={e => editar(i, (e.currentTarget as HTMLElement).innerHTML)}
                            onKeyDown={e => {
                              if (selMode && b.nivel === 0) return
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); novoApos(i) }
                              else if (e.key === 'Tab') { e.preventDefault(); indentar(i, e.shiftKey ? -1 : 1) }
                              else if (e.key === 'Backspace' && (e.currentTarget as HTMLElement).innerHTML === '') { e.preventDefault(); apagar(i) }
                              else if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) { e.preventDefault(); document.execCommand(e.key.toLowerCase() === 'b' ? 'bold' : e.key.toLowerCase() === 'i' ? 'italic' : 'underline'); editar(i, (e.currentTarget as HTMLElement).innerHTML) }
                            }}
                            onPaste={e => { const t = e.clipboardData.getData('text/plain'); if (t && t.includes('\n')) { e.preventDefault(); colarInteligente(i, t) } }}
                            style={{ flex: 1, outline: 'none', fontSize: '.9rem', lineHeight: 1.55, color: 'var(--text-primary)', minHeight: 22, padding: '2px 4px', wordBreak: 'break-word', fontWeight: 400, cursor: (selMode && b.nivel === 0) ? 'pointer' : 'text', userSelect: (selMode && b.nivel === 0) ? 'none' : 'auto' }} />
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
                            <button onClick={() => indentar(i, 1)} title="Aninhar (Tab)" style={miniBtn}>⇥</button>
                            <button onClick={() => apagar(i)} title="Excluir" style={miniBtn}>🗑️</button>
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ marginTop: 14, fontSize: '.68rem', color: 'var(--text-muted)', paddingLeft: 6 }}><b>Tab</b> aninha · <b>Enter</b> novo bloco · <b>Ctrl+B/I/U</b> formata · cole texto com quebras para detecção automática de pergunta→resposta</div>
                </div>
              </>
            )}
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
      {vista === 'editar' && selMode && (
        <div style={{ position: 'absolute', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 7, padding: '9px 13px', background: 'var(--card-bg)', border: '1px solid var(--accent)', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,.35)', flexWrap: 'wrap', maxWidth: '94%' }}>
          <b style={{ fontSize: '.82rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{selCount} selecionada(s)</b>
          <button onClick={selecionarTodas} title="Selecionar todas as perguntas" style={{ ...softBtn }}>Tudo</button>
          {selCount > 0 && <button onClick={() => setSel({})} style={{ ...softBtn }}>Nenhuma</button>}
          {selCount > 0 && <>
            <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />
            {/* edição em massa */}
            <button onClick={() => negritoSelecionadas(true)} title="Negrito nas selecionadas" style={{ ...softBtn, fontWeight: 800 }}>N</button>
            <button onClick={() => negritoSelecionadas(false)} title="Tirar negrito das selecionadas" style={{ ...softBtn, fontWeight: 400, textDecoration: 'line-through' }}>N</button>
            <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
              {CORES_BLOCO.map(c => <button key={c || 'none'} onClick={() => corSelecionadas(c)} title={c ? 'Cor de fundo' : 'Sem cor'} style={{ width: 20, height: 20, borderRadius: 5, cursor: 'pointer', border: '1px solid var(--border-md)', background: c ? COR_BLOCO[c] : 'var(--card-bg)', position: 'relative' }}>{!c && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.6rem', color: 'var(--text-muted)' }}>⌀</span>}</button>)}
            </span>
            <button onClick={stripNumSelecionadas} title="Remover numeração do texto das selecionadas" style={{ ...softBtn }}>🔢⌫</button>
            <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />
            {/* agrupar */}
            {listaGrupos().length > 0 && (
              <select value="" onChange={e => { if (e.target.value) moverVariasParaGrupo(e.target.value) }} style={{ height: 30, borderRadius: 8, border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '.78rem', cursor: 'pointer' }}>
                <option value="">🗂️ mover para grupo…</option>
                {listaGrupos().map(g => <option key={g.id} value={g.id}>{g.titulo}</option>)}
              </select>
            )}
            <button onClick={novoGrupoComSelecionadas} style={{ ...softBtn, background: 'var(--accent)', color: '#fff', border: 'none' }}>＋ Grupo</button>
            <button onClick={excluirSelecionadas} title="Excluir as perguntas selecionadas" style={{ ...softBtn, color: '#ef4444', borderColor: '#ef444455' }}>🗑️ Excluir</button>
          </>}
          <button onClick={() => { setSelMode(false); setSel({}) }} title="Sair do modo seleção" style={{ ...softBtn }}>✕ Fechar</button>
        </div>
      )}

      {/* modo flashcard: cartões pergunta/resposta */}
      {flash && (
        <div onMouseDown={() => setFlash(null)} style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onMouseDown={e => e.stopPropagation()} style={{ width: 640, maxWidth: '95vw', height: 'min(82vh, 660px)', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: '0 24px 70px rgba(0,0,0,.5)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '1.2rem' }}>🎴</span>
              <b style={{ fontSize: '1rem', color: 'var(--text-primary)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-display)' }}>{flash.titulo}</b>
              <span style={{ fontSize: '.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>{flash.idx + 1} / {flash.cards.length}</span>
              <button onClick={() => setFlash(null)} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>
            </div>
            {/* progresso do baralho */}
            <div style={{ height: 4, background: 'var(--border)' }}><div style={{ height: '100%', width: `${(flash.idx + 1) / flash.cards.length * 100}%`, background: 'var(--accent)', transition: 'width .3s' }} /></div>
            <div onClick={() => setFlash(f => f && { ...f, virado: !f.virado })} title="Clique no cartão (ou barra de espaço) para virar" style={{ flex: 1, minHeight: 0, margin: 20, borderRadius: 16, border: `2px solid ${flash.virado ? '#10b98155' : 'var(--border-md)'}`, background: flash.virado ? 'rgba(16,185,129,.05)' : 'var(--bg-1)', display: 'flex', flexDirection: 'column', cursor: 'pointer', overflow: 'hidden', transition: 'border-color .2s,background .2s' }}>
              <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)', fontSize: '.66rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', color: flash.virado ? '#10b981' : 'var(--text-accent)' }}>{flash.virado ? 'Resposta' : `Pergunta ${flash.idx + 1}`}</div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', fontSize: '1.02rem', lineHeight: 1.65, color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: flash.virado ? flash.cards[flash.idx].r : flash.cards[flash.idx].p }} />
              {!flash.virado && <div style={{ padding: '10px 18px', textAlign: 'center', fontSize: '.74rem', color: 'var(--text-muted)' }}>Clique para ver a resposta</div>}
            </div>
            {/* controles: se virado, permite auto-avaliar (marca desempenho); senão, navega */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 20px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setFlash(f => f && { ...f, idx: Math.max(0, f.idx - 1), virado: false })} disabled={flash.idx === 0} style={{ ...softBtn, opacity: flash.idx === 0 ? 0.4 : 1 }}>←</button>
              {flash.virado ? (
                <>
                  <button onClick={() => marcarFlash('e')} style={{ ...softBtn, flex: 1, color: '#ef4444', border: '1px solid #ef444455', fontSize: '.82rem' }}>✗ Errei</button>
                  <button onClick={() => marcarFlash('a')} style={{ ...softBtn, flex: 1, background: '#10b981', color: '#fff', border: 'none', fontSize: '.82rem' }}>✓ Acertei</button>
                </>
              ) : (
                <button onClick={() => setFlash(f => f && { ...f, virado: true })} style={{ ...softBtn, flex: 1, background: 'var(--accent)', color: '#fff', border: 'none' }}>Virar cartão (espaço)</button>
              )}
              {flash.idx < flash.cards.length - 1
                ? <button onClick={() => setFlash(f => f && { ...f, idx: f.idx + 1, virado: false })} style={{ ...softBtn }}>→</button>
                : <button onClick={() => setFlash(null)} style={{ ...softBtn, background: flash.virado ? '#10b981' : 'var(--surface)', color: flash.virado ? '#fff' : 'var(--text-secondary)', border: flash.virado ? 'none' : '1px solid var(--border-md)' }}>✓ Fim</button>}
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
