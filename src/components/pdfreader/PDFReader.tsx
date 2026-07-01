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
import ToggleNotion from './ToggleNotion'
import Revisao from './Revisao'

/* Menu suspenso que abre ao passar o mouse (consolida vários botões em uma linha).
   O dropdown é renderizado em portal com posição fixa para nunca ficar atrás de outro painel. */
function HoverMenu({ trigger, active, children, width = 230, align = 'left', triggerStyle }: any) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<{ top: number; left: number; right: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const tmr = useRef<any>(null)
  const medir = () => { const r = ref.current?.getBoundingClientRect(); if (r) setRect({ top: r.bottom, left: r.left, right: window.innerWidth - r.right }) }
  const entrar = () => { clearTimeout(tmr.current); medir(); setOpen(true) }
  const sair = () => { tmr.current = setTimeout(() => setOpen(false), 180) }
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }} onMouseEnter={entrar} onMouseLeave={sair}>
      <button onClick={() => { medir(); setOpen(o => !o) }} style={{ height: 30, padding: '0 9px', borderRadius: 8, border: active ? 'none' : '1px solid var(--border)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', background: active ? '#5b5bd6' : 'var(--surface)', color: active ? '#fff' : 'var(--text-secondary)', ...(triggerStyle || {}) }}>
        {trigger}<span style={{ fontSize: '0.56rem', opacity: 0.8 }}>▾</span>
      </button>
      {open && rect && createPortal(
        <div onMouseEnter={entrar} onMouseLeave={sair} style={{ position: 'fixed', top: rect.top + 4, ...(align === 'right' ? { right: rect.right } : { left: rect.left }), zIndex: 9999, minWidth: width, maxWidth: 'min(94vw, 440px)', padding: 8, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 16px 44px rgba(0,0,0,.4)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {children}
        </div>, document.body)}
    </div>
  )
}

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

async function callLLMOnce(prompt: string): Promise<string> {
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
/* erros transitórios da IA (cota/instabilidade) → vale tentar de novo */
const erroTransitorio = (msg: string) => /(429|500|502|503|504|timeout|network|failed to fetch|temporar|overload|unavailable|exhaust|quota|rate.?limit|resource_exhausted)/i.test(msg || '')
const espera = (ms: number) => new Promise(res => setTimeout(res, ms))
async function callLLM(prompt: string, tentativas = 3): Promise<string> {
  let ultimo: any
  for (let i = 0; i < tentativas; i++) {
    try { return await callLLMOnce(prompt) }
    catch (e: any) {
      ultimo = e
      if (i < tentativas - 1 && erroTransitorio(e?.message || '')) { await espera(900 * (i + 1)); continue }
      break
    }
  }
  const m = ultimo?.message || 'erro desconhecido'
  if (erroTransitorio(m)) throw new Error('A IA está temporariamente indisponível ou a cota diária foi atingida. Tente novamente em alguns minutos.')
  throw ultimo
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

/* ─────────── RESUMO (feature 5) — resume uma página/seleção em tópicos curtos ─────────── */
function promptResumo(texto: string, foco = '') {
  return [
    'Você é um assistente de estudos jurídicos para concursos públicos brasileiros (foco AGU/CEBRASPE).',
    foco ? `Contexto: ${foco}.` : '',
    'Resuma o trecho abaixo de forma fiel e enxuta, em 3 a 6 tópicos curtos (bullets), preservando termos técnicos, números de artigos e nomes de institutos.',
    'Não invente nada que não esteja no texto. Responda em português, apenas os tópicos, um por linha, iniciando cada linha com "• ".',
    'Trecho:', '"""', (texto || '').slice(0, 8000), '"""',
  ].filter(Boolean).join('\n')
}
async function resumirIA(texto: string, foco = ''): Promise<string> {
  return (await callLLM(promptResumo(texto, foco))).trim()
}

/* ─────────── GERAR PERGUNTAS (comando customizável e reutilizável) ─────────── */
const QCMD_KEY = 'nexus_pr_qcmd'
const QCMD_PADRAO = 'Transforme TODO o conteúdo desta página em perguntas para estudo ativo. Não deixe nada de fora — cubra cada informação. Gere o máximo de perguntas possível, bem escritas e claras. NÃO forneça as respostas: quero apenas as perguntas, numeradas.'
function lerComandoPerguntas(): string { try { return localStorage.getItem(QCMD_KEY) || QCMD_PADRAO } catch { return QCMD_PADRAO } }
function salvarComandoPerguntas(c: string) { try { localStorage.setItem(QCMD_KEY, c) } catch {} }
function promptPerguntasCustom(comando: string, texto: string, foco = '') {
  return [
    'Você é um assistente de estudos para concursos públicos brasileiros (foco AGU/CEBRASPE).',
    foco ? `Documento: ${foco}.` : '',
    'Siga ESTRITAMENTE a instrução do usuário, usando apenas o conteúdo do TRECHO abaixo. Não invente nada fora do trecho. Responda em português.',
    'FORMATO OBRIGATÓRIO: responda começando DIRETAMENTE pela pergunta nº 1, numeradas (1., 2., 3., …). É PROIBIDO escrever qualquer saudação, introdução, cabeçalho, título, observação, conclusão ou comentário — devolva APENAS as perguntas, uma por linha.',
    '',
    'Instrução do usuário:',
    (comando || QCMD_PADRAO).slice(0, 2000),
    '',
    'TRECHO:', '"""', (texto || '').slice(0, 9000), '"""',
  ].filter(Boolean).join('\n')
}
// remove qualquer introdução/saudação antes da 1ª pergunta e comentários ao redor
function limparPerguntas(txt: string): string {
  let s = (txt || '').replace(/\r/g, '').trim()
  s = s.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim()
  const linhas = s.split('\n')
  let ini = linhas.findIndex(l => /^\s*\d+\s*[.)\u2013-]/.test(l))   // 1. / 1) / 1 -
  if (ini < 0) ini = linhas.findIndex(l => /\?\s*$/.test(l))          // fallback: 1ª linha que termina com "?"
  if (ini > 0) s = linhas.slice(ini).join('\n').trim()
  return s
}
async function gerarPerguntasCustomIA(comando: string, texto: string, foco = ''): Promise<string> {
  return limparPerguntas((await callLLM(promptPerguntasCustom(comando, texto, foco))).trim())
}

/* ─────────── APRIMORAR TEXTO (IA) — reescreve melhor, mantendo o sentido ─────────── */
function promptAprimorar(texto: string) {
  return [
    'Você é um revisor e redator especialista em português formal e jurídico para concursos públicos brasileiros (AGU/CEBRASPE).',
    'Aprimore o TEXTO abaixo: melhore a clareza, a coesão, a correção gramatical e a elegância da redação, mantendo FIELMENTE o sentido, os fatos e os termos técnicos.',
    'Não invente conteúdo novo, não acrescente informações que não estejam no texto, não remova dados relevantes. Preserve a numeração de listas/perguntas se houver.',
    'Responda APENAS com o texto aprimorado, sem comentários, sem markdown, sem aspas ao redor.',
    'TEXTO:', '"""', (texto || '').slice(0, 12000), '"""',
  ].join('\n')
}
async function aprimorarTextoIA(texto: string): Promise<string> {
  return (await callLLM(promptAprimorar(texto))).trim()
}

/* ─────────── "NÃO ENTENDI" (explicação detalhada, didática) ─────────── */
function promptExplicar(trecho: string, contexto = '') {
  return [
    'Você é um professor paciente e didático, especialista em Direito e concursos públicos brasileiros.',
    contexto ? `Documento: ${contexto}.` : '',
    'Explique o TRECHO abaixo de forma MUITO didática, como se explicasse para um leigo inteligente (quase uma criança esperta):',
    '• Comece com a ideia central em uma frase simples.',
    '• Detalhe os conceitos, termos técnicos e o "porquê" de cada coisa, em linguagem clara.',
    '• Dê um exemplo concreto (analogia do dia a dia) que ajude a fixar.',
    '• Se houver pegadinhas ou pontos que confundem, alerte.',
    'Use parágrafos curtos. Não invente fatos fora do trecho. Responda em português.',
    'TRECHO:', '"""', (trecho || '').slice(0, 6000), '"""',
  ].filter(Boolean).join('\n')
}
async function explicarTrechoIA(trecho: string, contexto = ''): Promise<string> { return (await callLLM(promptExplicar(trecho, contexto))).trim() }

/* ─────────── DICIONÁRIO CONTEXTUAL ─────────── */
function promptDicionario(termo: string, contexto = '') {
  return [
    'Você é um dicionário e tesauro do português, com atenção ao vocabulário jurídico brasileiro.',
    `Para o termo/expressão: "${(termo || '').slice(0, 300)}"`,
    contexto ? `(considerando o contexto: "${contexto.slice(0, 400)}")` : '',
    'Responda em português, de forma compacta, exatamente neste formato (sem markdown):',
    'DEFINIÇÃO: <1-2 frases, sentido no contexto>',
    'CLASSE: <classe gramatical, se aplicável>',
    'SINÔNIMOS: <lista separada por vírgula, ou "—">',
    'ANTÔNIMOS: <lista, ou "—">',
    'SENTIDO JURÍDICO: <se houver acepção técnica/jurídica relevante, senão "—">',
    'EXEMPLO: <uma frase de uso>',
  ].filter(Boolean).join('\n')
}
async function dicionarioIA(termo: string, contexto = ''): Promise<string> { return (await callLLM(promptDicionario(termo, contexto))).trim() }

/* ─────────── INDICADOR DE DIFICULDADE (relatório por página) ─────────── */
function promptDificuldade(blocos: { page: number; texto: string }[]) {
  const corpo = blocos.map(b => `### PÁGINA ${b.page}\n${(b.texto || '').slice(0, 1600)}`).join('\n\n')
  return [
    'Você avalia a DIFICULDADE de leitura/compreensão de trechos para um concurseiro de Direito (AGU/CEBRASPE).',
    'Para cada página abaixo, classifique como "facil", "medio" ou "complexo" considerando densidade conceitual, tecnicidade, abstração e quantidade de exceções/detalhes,',
    'e dê um MOTIVO curto (uma frase objetiva) explicando o porquê da classificação.',
    'Responda APENAS com JSON no formato {"<numero_da_pagina>":{"nivel":"facil|medio|complexo","motivo":"<frase curta>"}, ...} — sem markdown, sem texto extra.',
    '', corpo,
  ].join('\n')
}
async function analisarDificuldadeIA(blocos: { page: number; texto: string }[]): Promise<Record<string, { nivel: string; motivo: string }>> {
  const raw = await callLLM(promptDificuldade(blocos))
  let t = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const m = t.match(/\{[\s\S]*\}/); if (m) t = m[0]
  const norm = (v: string) => { v = (v || '').toLowerCase(); return /fac/.test(v) ? 'facil' : /comp|dif/.test(v) ? 'complexo' : 'medio' }
  try {
    const obj = JSON.parse(t); const out: Record<string, { nivel: string; motivo: string }> = {}
    Object.keys(obj).forEach(k => {
      const v = obj[k]
      if (v && typeof v === 'object') out[k] = { nivel: norm(v.nivel || v.dificuldade || ''), motivo: String(v.motivo || v.razao || '').trim() }
      else out[k] = { nivel: norm(String(v)), motivo: '' }
    })
    return out
  } catch { return {} }
}
const CORDIF: any = { facil: '#22c55e', medio: '#f59e0b', complexo: '#ef4444' }
const CORDIF2: any = { facil: '#15803d', medio: '#b45309', complexo: '#b91c1c' }
const ROTDIF: any = { facil: 'Fácil', medio: 'Médio', complexo: 'Complexo' }

/* ═══════════════════════════════ MAPA MENTAL (IA) ═══════════════════════════════ */
type NoMapa = { id: string; texto: string; tipo?: string; filhos: NoMapa[]; colapsado?: boolean }
function promptMapa(texto: string, leiSeca: boolean, foco = '') {
  const base = [
    'Você é um especialista em sistematização de conteúdo para concursos públicos jurídicos brasileiros (foco AGU/CEBRASPE).',
    foco ? `Documento: ${foco}.` : '',
    'Construa um MAPA MENTAL hierárquico a partir do material. Identifique automaticamente o tópico central, subtópicos, conceitos e detalhes — agrupando de forma lógica e fiel ao texto.',
    'Rótulos curtos e diretos (uma ideia por nó). Não invente conteúdo fora do material. Aprofunde em até 4 níveis quando fizer sentido.',
  ]
  const lei = [
    'O material é TEXTO DE LEI (lei seca). Estruture seguindo a hierarquia normativa, preservando a numeração nos rótulos:',
    '• Cada ARTIGO ("Art. 5º") é um subtópico principal; o caput resume a ideia central.',
    '• PARÁGRAFOS ("§ 1º", "Parágrafo único"), INCISOS ("I", "II", "III") e ALÍNEAS ("a", "b") viram filhos aninhados na ordem correta.',
    '• Mantenha a referência (Art./§/inciso/alínea) no início do rótulo e resuma o dispositivo em linguagem clara, mas fiel.',
    '• O título do mapa deve identificar a norma e a faixa de artigos.',
  ]
  return [
    ...base,
    ...(leiSeca ? lei : []),
    '',
    'Responda ESTRITAMENTE com um objeto JSON (sem markdown, sem texto antes/depois) no formato:',
    '{"titulo":"...","filhos":[{"texto":"...","tipo":"subtopico","filhos":[{"texto":"...","tipo":"conceito","filhos":[]}]}]}',
    'tipo ∈ "topico" | "subtopico" | "conceito" | "detalhe".',
    '',
    'MATERIAL:', '"""', (texto || '').slice(0, 14000), '"""',
  ].filter(Boolean).join('\n')
}
function normalizarNo(x: any, prof = 0): NoMapa | null {
  if (!x || prof > 6) return null
  const texto = String(x.texto ?? x.text ?? x.titulo ?? x.label ?? x.nome ?? '').trim()
  if (!texto) return null
  const filhosRaw = Array.isArray(x.filhos) ? x.filhos : Array.isArray(x.children) ? x.children : Array.isArray(x.subtopicos) ? x.subtopicos : []
  const filhos = filhosRaw.map((f: any) => normalizarNo(f, prof + 1)).filter(Boolean) as NoMapa[]
  return { id: newId(), texto, tipo: x.tipo || x.type || (prof === 0 ? 'topico' : prof === 1 ? 'subtopico' : 'conceito'), filhos }
}
function parseMapa(raw: string): NoMapa | null {
  if (!raw) return null
  let t = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const m = t.match(/\{[\s\S]*\}/); if (m) t = m[0]
  try {
    const obj = JSON.parse(t)
    const raiz = normalizarNo({ texto: obj.titulo || obj.texto || 'Mapa', tipo: 'topico', filhos: obj.filhos || obj.children || [] }, 0)
    return raiz && raiz.filhos.length ? raiz : raiz
  } catch { return null }
}
async function gerarMapaIA(texto: string, leiSeca: boolean, foco = ''): Promise<NoMapa | null> {
  return parseMapa(await callLLM(promptMapa(texto, leiSeca, foco)))
}
/* utilidades de árvore (imutáveis) */
function mapaWalk(no: NoMapa, fn: (n: NoMapa, pai: NoMapa | null) => void, pai: NoMapa | null = null) { fn(no, pai); no.filhos.forEach(f => mapaWalk(f, fn, no)) }
function mapaUpd(raiz: NoMapa, id: string, patch: (n: NoMapa) => NoMapa): NoMapa {
  const rec = (n: NoMapa): NoMapa => n.id === id ? patch({ ...n, filhos: n.filhos.map(rec) }) : { ...n, filhos: n.filhos.map(rec) }
  return rec(raiz)
}
function mapaDel(raiz: NoMapa, id: string): NoMapa { return { ...raiz, filhos: raiz.filhos.filter(f => f.id !== id).map(f => mapaDel(f, id)) } }
function mapaFind(raiz: NoMapa, id: string): { no: NoMapa; pai: NoMapa | null; idx: number } | null {
  let res: any = null
  mapaWalk(raiz, (n, pai) => { if (n.id === id) res = { no: n, pai, idx: pai ? pai.filhos.indexOf(n) : -1 } })
  return res
}
/* exporta o mapa como lista hierárquica (HTML p/ impressão→PDF) */
function mapaParaHTML(raiz: NoMapa, titulo: string): string {
  const li = (n: NoMapa): string => `<li><span class="t${n.tipo === 'topico' ? '0' : n.tipo === 'subtopico' ? '1' : n.tipo === 'conceito' ? '2' : '3'}">${escapeHtml(n.texto)}</span>${n.filhos.length ? `<ul>${n.filhos.map(li).join('')}</ul>` : ''}</li>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(titulo)}</title><style>
    body{font-family:Calibri,'Segoe UI',Arial,sans-serif;color:#1a1a1a;max-width:760px;margin:24px auto;padding:0 24px;line-height:1.5}
    h1{font-size:18pt;color:#5b21b6;border-bottom:2px solid #7c3aed;padding-bottom:6px}
    ul{list-style:none;margin:0;padding-left:18px;border-left:1px solid #ddd}
    li{margin:3px 0}
    .t0{font-weight:800;font-size:13pt;color:#5b21b6}
    .t1{font-weight:700;color:#1f2937}
    .t2{color:#374151}
    .t3{color:#6b7280;font-size:.95em}
    @media print{ a{display:none} }
  </style></head><body><h1>🗺 ${escapeHtml(titulo)}</h1><ul>${raiz.filhos.map(li).join('')}</ul></body></html>`
}
function escapeHtml(s: string) { return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]) }

/* ─── EXPORTAÇÃO VISUAL DO MAPA (SVG vetorial → PDF/PNG) ─── */
function wrapTexto(texto: string, maxChars: number): string[] {
  const palavras = (texto || '').split(/\s+/); const linhas: string[] = []; let cur = ''
  for (let p of palavras) {
    while (p.length > maxChars) { if (cur) { linhas.push(cur); cur = '' } linhas.push(p.slice(0, maxChars)); p = p.slice(maxChars) }
    if (!cur) cur = p
    else if ((cur + ' ' + p).length <= maxChars) cur += ' ' + p
    else { linhas.push(cur); cur = p }
  }
  if (cur) linhas.push(cur)
  return (linhas.length ? linhas : ['']).slice(0, 12)
}
function mapaParaSVG(raiz: NoMapa, conTipo = 'curva', conCor = '#94a3b8', conTraco = 'solida'): { svg: string; w: number; h: number } {
  const BOX_W = 210, FONT = 12.5, LINE_H = 16, PADX = 11, PADY = 8, COL_W = 250, GAP = 16, MINH = 34
  const charsLinha = Math.max(12, Math.floor((BOX_W - 2 * PADX) / (FONT * 0.54)))
  const info: any = {}
  const calc = (n: NoMapa) => { const lines = wrapTexto(n.texto, charsLinha); info[n.id] = { lines, h: Math.max(MINH, lines.length * LINE_H + 2 * PADY) }; (n.colapsado ? [] : n.filhos).forEach(calc) }
  calc(raiz)
  const pos: any = {}; let cursorY = 0
  const layout = (n: NoMapa, depth: number): number => {
    const x = depth * COL_W; const vis = n.colapsado ? [] : n.filhos; const h = info[n.id].h
    let cy: number
    if (!vis.length) { cy = cursorY + h / 2; cursorY += h + GAP }
    else { const ys = vis.map(c => layout(c, depth + 1)); cy = (ys[0] + ys[ys.length - 1]) / 2 }
    pos[n.id] = { x: x + (n.dx || 0), cy: cy + (n.dy || 0), h, node: n }; return cy + (n.dy || 0)
  }
  layout(raiz, 0)
  // limites (considera offsets manuais)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  Object.values(pos).forEach(({ x, cy, h }: any) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x + BOX_W); minY = Math.min(minY, cy - h / 2); maxY = Math.max(maxY, cy + h / 2) })
  const PAD = 20, ox = -minX + PAD, oy = -minY + PAD
  const W = (maxX - minX) + 2 * PAD, H = (maxY - minY) + 2 * PAD
  const dPath = (x1: number, y1: number, x2: number, y2: number) => conTipo === 'reta' ? `M${x1},${y1} L${x2},${y2}`
    : conTipo === 'cotovelo' ? `M${x1},${y1} L${(x1 + x2) / 2},${y1} L${(x1 + x2) / 2},${y2} L${x2},${y2}`
      : `M${x1},${y1} C${x1 + 60},${y1} ${x2 - 60},${y2} ${x2},${y2}`
  const dash = conTraco === 'tracejada' ? ' stroke-dasharray="9 5"' : conTraco === 'pontilhada' ? ' stroke-dasharray="2 5"' : ''
  let edges = '', boxes = ''
  Object.values(pos).forEach(({ node, x, cy }: any) => { if (node.colapsado) return; node.filhos.forEach((c: NoMapa) => { const cp = pos[c.id]; if (cp) edges += `<path d="${dPath(x + BOX_W + ox, cy + oy, cp.x + ox, cp.cy + oy)}" fill="none" stroke="${conCor}" stroke-width="1.7"${dash}/>` }) })
  Object.values(pos).forEach(({ node, x, cy, h }: any) => {
    const cor = node.cor || CORTIPO[node.tipo || 'conceito'] || '#64748b'; const top = cy - h / 2 + oy; const left = x + ox
    const peso = node.tipo === 'topico' ? 700 : node.tipo === 'subtopico' ? 600 : 400
    const fmt = node.formato || 'arred'
    const semCaixa = fmt === 'nenhum', soLinha = fmt === 'linha'
    const fill = semCaixa || soLinha ? 'none' : (node.cor ? cor + '20' : (node.tipo === 'topico' ? cor + '14' : '#ffffff'))
    const txtFill = semCaixa || soLinha ? cor : '#1a1a1a'
    const txt = info[node.id].lines.map((ln: string, i: number) => `<text x="${left + PADX + 3}" y="${top + PADY + FONT + i * LINE_H}" font-family="Calibri,Segoe UI,Arial,sans-serif" font-size="${FONT}" font-weight="${peso}" fill="${txtFill}">${escapeHtml(ln)}</text>`).join('')
    if (semCaixa) { boxes += `<g>${txt}</g>` }
    else if (soLinha) { boxes += `<g>${txt}<line x1="${left}" y1="${top + h}" x2="${left + BOX_W}" y2="${top + h}" stroke="${cor}" stroke-width="2"/></g>` }
    else if (fmt === 'elipse') { boxes += `<g><ellipse cx="${left + BOX_W / 2}" cy="${top + h / 2}" rx="${BOX_W / 2}" ry="${h / 2 + 3}" fill="${fill}" stroke="${cor}" stroke-width="1.4"/>${txt}</g>` }
    else { const rx = fmt === 'ret' ? 2 : 9; boxes += `<g><rect x="${left}" y="${top}" width="${BOX_W}" height="${h}" rx="${rx}" fill="${fill}" stroke="${cor}" stroke-width="1.2"/><rect x="${left}" y="${top}" width="4" height="${h}" rx="2" fill="${cor}"/>${txt}</g>` }
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>${edges}${boxes}</svg>`
  return { svg, w: W, h: H }
}
function mapaPaginasHTML(maps: any[], orient: 'landscape' | 'portrait'): string {
  const pgs = maps.map(m => `<div class="pg"><div class="ttl">${escapeHtml(m.titulo || 'Mapa')}</div><div class="cv">${mapaParaSVG(m.raiz, m.conectorTipo, m.conectorCor, m.conectorTraco).svg}</div></div>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Mapas Mentais</title><style>
    @page{ size:A4 ${orient}; margin:8mm } *{box-sizing:border-box} html,body{margin:0;padding:0}
    .pg{ page-break-after:always; width:100%; height:100vh; display:flex; flex-direction:column; align-items:center; padding:6px 6px 14px }
    .pg:last-child{ page-break-after:auto }
    .ttl{ font-family:Calibri,Segoe UI,Arial,sans-serif; font-weight:800; font-size:15pt; color:#5b21b6; margin-bottom:8px; text-align:center }
    .cv{ flex:1; min-height:0; width:100%; display:flex; align-items:center; justify-content:center }
    .cv svg{ max-width:100%; max-height:100%; width:auto; height:auto }
  </style></head><body>${pgs}</body></html>`
}
async function svgParaPNG(svg: string, w: number, h: number, escala = 3): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = Math.round(w * escala); c.height = Math.round(h * escala)
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.setTransform(escala, 0, 0, escala, 0, 0); ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url); c.toBlob(b => resolve(b), 'image/png')
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

/* ícone minimalista de "conexões" (nós ligados) — substitui o 🗺 */
function IconMapa({ size = 16, color = 'currentColor' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d="M6.5 6.5 L13.5 11 M6.5 17.5 L13.5 13 M16 12 L6.8 6.6 M16 12 L6.8 17.4" opacity="0.55" />
      <circle cx="5" cy="6" r="2.1" fill={color} stroke="none" />
      <circle cx="5" cy="18" r="2.1" fill={color} stroke="none" />
      <circle cx="17" cy="12" r="2.6" fill={color} stroke="none" />
      <circle cx="20.5" cy="5.5" r="1.4" fill={color} stroke="none" opacity="0.7" />
      <path d="M18.6 10.4 L20.2 6.8" opacity="0.45" />
    </svg>
  )
}

/* ─────────── CHAT COM O DOCUMENTO (feature 1) — pergunta livre usando o texto como contexto ─────────── */
function promptChat(contexto: string, historico: { role: 'user' | 'assistant'; text: string }[], pergunta: string) {
  const hist = historico.slice(-8).map(m => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.text}`).join('\n')
  return [
    'Você é um assistente de leitura e estudo. Responda SOMENTE com base no DOCUMENTO fornecido.',
    'Se a resposta não estiver no documento, diga claramente que o trecho não trata disso (mas pode dar contexto jurídico geral, sinalizando que é conhecimento externo).',
    'Seja objetivo, cite o número da página quando o documento indicar "[p. N]". Responda em português.',
    '',
    '===== DOCUMENTO =====',
    (contexto || '(documento vazio)').slice(0, 24000),
    '===== FIM DO DOCUMENTO =====',
    '',
    hist ? 'Conversa até aqui:\n' + hist : '',
    '',
    'Pergunta do usuário: ' + pergunta,
  ].filter(Boolean).join('\n')
}
async function perguntarAoDocIA(contexto: string, historico: any[], pergunta: string): Promise<string> {
  return (await callLLM(promptChat(contexto, historico, pergunta))).trim()
}

/* ─────────── FLASHCARDS (feature 2) — gera cards frente/verso a partir de um trecho ─────────── */
function promptFlashcards(trecho: string, foco = '') {
  return [
    'Você é um gerador de flashcards de estudo ativo para concursos públicos brasileiros (foco AGU/CEBRASPE).',
    foco ? `Tema: ${foco}.` : '',
    'A partir do trecho abaixo, crie de 2 a 6 flashcards de recordação ativa (pergunta na frente, resposta objetiva no verso).',
    'Priorize definições, requisitos, exceções, prazos e classificações. Verso curto e preciso. Não invente conteúdo fora do trecho.',
    'Responda ESTRITAMENTE com um array JSON de objetos {"frente": "...", "verso": "..."}, sem markdown, sem texto antes ou depois.',
    'Trecho:', '"""', (trecho || '').slice(0, 6000), '"""',
  ].filter(Boolean).join('\n')
}
function parseFlashcards(raw: string): { frente: string; verso: string }[] {
  if (!raw) return []
  let t = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const m = t.match(/\[[\s\S]*\]/); if (m) t = m[0]
  try {
    const arr = JSON.parse(t)
    if (Array.isArray(arr)) return arr.map((x: any) => ({ frente: String(x?.frente ?? x?.q ?? x?.pergunta ?? '').trim(), verso: String(x?.verso ?? x?.a ?? x?.resposta ?? '').trim() })).filter(c => c.frente && c.verso).slice(0, 12)
  } catch {}
  return []
}
async function gerarFlashcardsIA(trecho: string, foco = ''): Promise<{ frente: string; verso: string }[]> {
  return parseFlashcards(await callLLM(promptFlashcards(trecho, foco)))
}

/* agendamento de revisão (SM-2 simplificado) — usado pelo módulo de flashcards (feature 2) */
const hojeISO = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)   // UTC-3 (padrão NexusOS)
function agendarRevisao(card: any, acerto: 'errei' | 'dificil' | 'facil') {
  let ef = card.ef ?? 2.5, rep = card.rep ?? 0, intervalo = card.intervalo ?? 0
  if (acerto === 'errei') { rep = 0; intervalo = 1; ef = Math.max(1.3, ef - 0.2) }
  else {
    rep += 1
    if (rep === 1) intervalo = 1
    else if (rep === 2) intervalo = acerto === 'facil' ? 4 : 3
    else intervalo = Math.round(intervalo * ef)
    ef = Math.max(1.3, ef + (acerto === 'facil' ? 0.15 : -0.02))
  }
  const prox = new Date(Date.now() - 3 * 3600000 + intervalo * 86400000).toISOString().slice(0, 10)
  return { ef: +ef.toFixed(2), rep, intervalo, proxRevisao: prox, ultimaRevisao: hojeISO() }
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

/* ─────────── EXPORTAR NOTAS COMO MARKDOWN (feature 7) — converte o HTML do editor em .md ─────────── */
function htmlToMarkdown(html: string): string {
  if (!html) return ''
  const root = document.createElement('div'); root.innerHTML = html
  const walk = (node: Node, depth = 0): string => {
    let out = ''
    node.childNodes.forEach(ch => {
      if (ch.nodeType === 3) { out += (ch.textContent || '').replace(/\s+/g, ' ') ; return }
      if (ch.nodeType !== 1) return
      const el = ch as HTMLElement; const tag = el.tagName.toLowerCase()
      const inner = () => walk(el, depth)
      switch (tag) {
        case 'h1': out += `\n# ${el.textContent?.trim()}\n\n`; break
        case 'h2': out += `\n## ${el.textContent?.trim()}\n\n`; break
        case 'h3': out += `\n### ${el.textContent?.trim()}\n\n`; break
        case 'b': case 'strong': out += `**${inner().trim()}**`; break
        case 'i': case 'em': out += `*${inner().trim()}*`; break
        case 'u': out += `${inner().trim()}`; break
        case 'br': out += '\n'; break
        case 'hr': out += '\n---\n\n'; break
        case 'li': out += `${'  '.repeat(depth)}- ${inner().trim()}\n`; break
        case 'ul': case 'ol': out += '\n' + walk(el, depth + 1) + '\n'; break
        case 'table': {
          const rows = Array.from(el.querySelectorAll('tr'))
          rows.forEach((tr, ri) => {
            const cells = Array.from(tr.children).map(td => (td.textContent || '').trim().replace(/\|/g, '\\|'))
            out += '| ' + cells.join(' | ') + ' |\n'
            if (ri === 0) out += '| ' + cells.map(() => '---').join(' | ') + ' |\n'
          })
          out += '\n'; break
        }
        case 'p': case 'div': { const c = inner().trim(); out += c ? c + '\n\n' : ''; break }
        default: out += inner()
      }
    })
    return out
  }
  return walk(root).replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/* ─────────── HISTÓRICO DE PDFs RECENTES (feature 11) — só metadados + miniatura (o PDF nunca é salvo) ─────────── */
const RECENTS_KEY = 'nexus_pr_recents'
function lerRecentes(): any[] { try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]') } catch { return [] } }
function salvarRecente(rec: { name: string; numPages: number; thumb?: string; lastPage?: number }) {
  try {
    const list = lerRecentes().filter((r: any) => r.name !== rec.name)
    list.unshift({ ...rec, at: Date.now() })
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 8)))
  } catch {}
}
function atualizarProgressoRecente(name: string, lastPage: number, numPages: number) {
  try {
    const list = lerRecentes(); const r = list.find((x: any) => x.name === name)
    if (r) { r.lastPage = Math.max(r.lastPage || 0, lastPage); r.numPages = numPages; r.at = Date.now(); localStorage.setItem(RECENTS_KEY, JSON.stringify(list)) }
  } catch {}
}
function removerRecente(name: string): any[] {   // feature 11: remove um item do histórico
  try { const list = lerRecentes().filter((r: any) => r.name !== name); localStorage.setItem(RECENTS_KEY, JSON.stringify(list)); return list } catch { return lerRecentes() }
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

/* fontes disponíveis no editor (feature 1) — com fallbacks seguros */
const FONTES: { nome: string; css: string }[] = [
  { nome: 'Calibri', css: "Calibri, 'Segoe UI', system-ui, sans-serif" },
  { nome: 'Aptos', css: "Aptos, Calibri, 'Segoe UI', system-ui, sans-serif" },
  { nome: 'Avenir Next', css: "'Avenir Next', Avenir, 'Segoe UI', system-ui, sans-serif" },
  { nome: 'Marope', css: "Marope, 'Segoe UI', system-ui, sans-serif" },
  { nome: 'Optima', css: "Optima, 'Segoe UI', Candara, sans-serif" },
  { nome: 'Open Sans', css: "'Open Sans', system-ui, sans-serif" },
  { nome: 'Lato', css: "Lato, system-ui, sans-serif" },
  { nome: 'Frutiger', css: "Frutiger, 'Segoe UI', 'Open Sans', system-ui, sans-serif" },
  { nome: 'Source Sans 3', css: "'Source Sans 3', 'Source Sans Pro', system-ui, sans-serif" },
  { nome: 'Segoe UI', css: "'Segoe UI', system-ui, sans-serif" },
  { nome: 'Noto Sans', css: "'Noto Sans', system-ui, sans-serif" },
]

/* aplica família de fonte ao trecho selecionado (feature 1) */
function aplicarFonte(css: string) {
  document.execCommand('fontName', false, css)
}

/* aplica tamanho (px, 7..20) ao trecho selecionado, envolvendo num span (feature 2).
   execCommand('fontSize') só aceita 1..7; por isso usamos um span com font-size em px. */
function aplicarTamanho(ed: HTMLElement, px: number) {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount) { ed.focus(); return }
  const range = sel.getRangeAt(0)
  if (range.collapsed) {
    // sem seleção: ajusta o tamanho do bloco atual (parágrafo)
    let n: Node | null = range.startContainer
    while (n && n !== ed && (n as HTMLElement).nodeType !== 1) n = n.parentElement
    let bloco = n as HTMLElement | null
    while (bloco && bloco !== ed && !/^(P|DIV|LI|H1|H2|H3|BLOCKQUOTE)$/.test(bloco.tagName)) bloco = bloco.parentElement
    if (bloco && bloco !== ed) bloco.style.fontSize = px + 'px'
    ed.focus(); return
  }
  const span = document.createElement('span')
  span.style.fontSize = px + 'px'
  try {
    span.appendChild(range.extractContents())
    range.insertNode(span)
    // reposiciona o cursor após o span
    sel.removeAllRanges()
    const r2 = document.createRange(); r2.selectNodeContents(span); sel.addRange(r2)
  } catch { document.execCommand('fontSize', false, '4') }
  ed.focus()
}

function RichEditor({ editorRef, onChange }: any) {
  const [bulletSet, setBulletSet] = useState(DEFAULT_SET)
  const [pageStyle, setPageStyle] = useState<'blank' | 'lined' | 'grid'>('blank')   // feature 1
  const [baseFont, setBaseFont] = useState(15)   // tamanho-base da página (px) — comanda texto, altura de linha e passo da pauta
  const pitch = Math.max(16, Math.round(baseFont * 1.85))   // espaçamento da pauta acompanha a fonte
  const [autoQ, setAutoQ] = useState(false)                                          // feature 2
  const [aprimora, setAprimora] = useState<{ open: boolean; carregando: boolean; sugestao: string; modo: 'all' | 'sel'; range: Range | null } | null>(null)  // aprimorar texto (IA)
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
    <div className="pr-pop" style={{ position: 'fixed', left: Math.min(menu.x, window.innerWidth - (width + 16)), top: menu.y, zIndex: 7901, width, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 11, boxShadow: '0 14px 40px rgba(0,0,0,.32)', padding: 10 }}>{children}</div>
  </>, document.body) : null

  const run = (fn: () => void) => { fn(); onChange?.() }

  // aprimorar texto com IA (sugere reescrita; só substitui após confirmação)
  const aprimorarTexto = async () => {
    const ed = editorRef.current; if (!ed) return
    const sel = window.getSelection()
    const temSel = !!(sel && sel.rangeCount && !sel.isCollapsed && ed.contains(sel.anchorNode) && ed.contains(sel.focusNode))
    const texto = temSel ? sel!.toString() : (ed.innerText || '')
    if (!texto.trim()) { alert('Não há texto para aprimorar.'); return }
    const range = temSel ? sel!.getRangeAt(0).cloneRange() : null
    setAprimora({ open: true, carregando: true, sugestao: '', modo: temSel ? 'sel' : 'all', range })
    try { const s = await aprimorarTextoIA(texto); setAprimora(a => a && { ...a, carregando: false, sugestao: s }) }
    catch (e: any) { setAprimora(null); alert('Falha ao aprimorar: ' + (e?.message || e)) }
  }
  const aplicarAprimoramento = () => {
    const ed = editorRef.current; if (!ed || !aprimora) return
    const texto = aprimora.sugestao
    if (aprimora.modo === 'sel' && aprimora.range) {
      const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(aprimora.range)
      document.execCommand('insertText', false, texto)
    } else {
      ed.innerHTML = ''
      texto.split('\n').forEach(linha => { const p = document.createElement('p'); p.textContent = linha || '\u00A0'; ed.appendChild(p) })
    }
    setAprimora(null); onChange?.()
  }

  // renumera perguntas/itens numerados em sequência contínua (controle de cadeia de numeração)
  const renumerarPerguntas = () => {
    const ed = editorRef.current; if (!ed) return
    const selObj = window.getSelection()
    const temSel = !!(selObj && selObj.rangeCount && !selObj.isCollapsed && ed.contains(selObj.anchorNode) && ed.contains(selObj.focusNode))
    const range = temSel ? selObj!.getRangeAt(0) : null
    const resp = prompt(temSel ? 'Renumerar as perguntas SELECIONADAS começando em qual número?\n(use 1 para recomeçar um capítulo)' : 'Renumerar TODAS as perguntas do editor começando em qual número?\n(use 1 para uma cadeia única; ou continue de onde parou)', '1')
    if (resp == null) return
    let n = parseInt(resp, 10); if (isNaN(n) || n < 0) n = 1
    // blocos candidatos: parágrafos e itens de lista (evita contar <p> dentro de <li>)
    const blocos = Array.from(ed.querySelectorAll('p, li')).filter((b: any) => !(b.tagName === 'P' && b.closest('li')))
    let alterados = 0
    blocos.forEach((b: any) => {
      if (range && !range.intersectsNode(b)) return
      const txt = b.textContent || ''
      if (!/^\s*\d+\s*[.)\-–º°]\s+\S/.test(txt)) return        // só linhas que começam com "N. " / "N) " / "N - " etc
      // localiza o primeiro nó de texto e reescreve apenas o número líder, preservando o resto
      let node: any = b
      while (node && node.nodeType === 1) node = node.firstChild
      if (node && node.nodeType === 3 && /^(\s*)\d+(\s*[.)\-–º°])/.test(node.nodeValue)) {
        node.nodeValue = node.nodeValue.replace(/^(\s*)\d+(\s*[.)\-–º°])/, `$1${n}$2`)
        n++; alterados++
      }
    })
    if (!alterados) { alert('Nenhuma pergunta numerada encontrada' + (temSel ? ' na seleção.' : '. Gere perguntas primeiro.')); return }
    onChange?.()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* ── TOOLBAR (uma linha) ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: '7px 10px', borderBottom: '1px solid var(--border)' }}>
        <MenuBtn id="estilo" label="Estilo" title="Título / parágrafo" />
        <MenuBtn id="fonte" label="Fonte" title="Família da fonte" />
        <MenuBtn id="tamanho" label="A↕" title="Tamanho da letra (7 a 20)" />
        <Sep />
        <Btn cmd="bold" title="Negrito (Ctrl+B)">B</Btn>
        <Btn cmd="italic" title="Itálico (Ctrl+I)"><i>I</i></Btn>
        <Btn cmd="underline" title="Sublinhado (Ctrl+U)"><u>U</u></Btn>
        <Btn cmd="strikeThrough" title="Tachado">S̶</Btn>
        <Sep />
        <MenuBtn id="alinhar" label="Alinhar" title="Alinhamento" />
        <MenuBtn id="cor" label="🎨" title="Cores" />
        <MenuBtn id="marcadores" label="≔" title="Marcadores e listas" />
        <MenuBtn id="inserir" label="＋" title="Linha divisória e tabela" />
        <MenuBtn id="simbolos" label="✶" title="Inserir símbolo (seta, estrela, joinha, perigo…)" />
        <Sep />
        {/* Mais: recuo, fundo da página, modo pergunta, renumerar, post-it (menu suspenso) */}
        <HoverMenu align="right" width={220} active={pageStyle !== 'blank' || autoQ} trigger={<span>⋯ Mais</span>}>
          <IBtn title="Diminuir recuo (trazer parágrafo para a esquerda)" onClick={() => { const ed = editorRef.current; if (ed) run(() => ajustarRecuo(ed, -24)) }}>⇤</IBtn>
          <IBtn title="Aumentar recuo (empurrar parágrafo para a direita)" onClick={() => { const ed = editorRef.current; if (ed) run(() => ajustarRecuo(ed, 24)) }}>⇥</IBtn>
          <IBtn title={`Fundo da página: ${ { blank: 'branca', lined: 'pautada', grid: 'quadriculada' }[pageStyle] } (clique para alternar)`} active={pageStyle !== 'blank'} onClick={() => setPageStyle(p => p === 'blank' ? 'lined' : p === 'lined' ? 'grid' : 'blank')}>{{ blank: '▢', lined: '▤', grid: '▦' }[pageStyle]}</IBtn>
          <IBtn title={autoQ ? 'Modo pergunta ATIVO — Enter adiciona "?" no fim da linha (clique para desativar)' : 'Modo pergunta — ao dar Enter adiciona "?" no fim da linha'} active={autoQ} onClick={() => setAutoQ(v => !v)}>?</IBtn>
          <IBtn title="Renumerar perguntas em sequência — selecione o trecho para formar uma cadeia (ou deixe sem seleção para renumerar tudo); pergunta o número inicial" onClick={renumerarPerguntas}>№</IBtn>
          <IBtn title="Inserir nota adesiva (post-it) — arraste, redimensione, feche no ×" onClick={() => { const ed = editorRef.current; if (ed) run(() => insertPostit(ed)) }}>📌</IBtn>
        </HoverMenu>
        <Sep />
        {/* aprimorar texto com IA */}
        <button onClick={aprimorarTexto} disabled={!!aprimora?.carregando} title="Aprimorar o texto com IA (seleção, ou tudo) — pede confirmação antes de substituir"
          style={{ height: 30, padding: '0 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{aprimora?.carregando ? <><span className="nx-spin">⏳</span> Aprimorando…</> : '✨ Aprimorar'}</button>
        <Sep />
        <Btn cmd="undo" title="Desfazer (Ctrl+Z)">↩</Btn>
        <Btn cmd="redo" title="Refazer (Ctrl+Y)">↪</Btn>
      </div>
      {/* modal: aprimoramento de texto (confirmação antes de substituir) */}
      {aprimora?.open && createPortal(<>
        <div onMouseDown={() => setAprimora(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9500 }} />
        <div className="pr-pop" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 9501, width: 'min(640px,95vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.45)', padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
            <span style={{ fontSize: '1.1rem' }}>✨</span><b style={{ color: 'var(--text-primary)' }}>Texto aprimorado (IA)</b>
            <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{aprimora.modo === 'sel' ? 'seleção' : 'documento inteiro'}</span>
            <span style={{ flex: 1 }} /><button onMouseDown={e => { e.preventDefault(); setAprimora(null) }} style={btn}>✕</button>
          </div>
          {aprimora.carregando ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Aprimorando o texto com a IA…</div>
          ) : (<>
            <div style={{ fontSize: '.74rem', color: 'var(--text-muted)', marginBottom: 8 }}>Revise (e ajuste se quiser) a sugestão abaixo. Ela só substitui o seu texto se você confirmar.</div>
            <textarea value={aprimora.sugestao} onChange={e => setAprimora(a => a && { ...a, sugestao: e.target.value })} rows={12}
              style={{ flex: 1, minHeight: 200, resize: 'vertical', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.6, outline: 'none', fontFamily: 'inherit', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onMouseDown={e => { e.preventDefault(); setAprimora(null) }} style={{ ...btn, width: 'auto', padding: '0 14px' }}>Cancelar</button>
              <button onMouseDown={e => { e.preventDefault(); aplicarAprimoramento() }} style={{ height: 34, padding: '0 18px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 700, fontSize: '.86rem', cursor: 'pointer' }}>✓ Substituir meu texto</button>
            </div>
          </>)}
        </div>
      </>, document.body)}

      {/* ── PAINÉIS DOS MENUS ── */}
      <Painel id="estilo" width={150}>
        {[['h1', 'Título 1'], ['h2', 'Título 2'], ['h3', 'Título 3'], ['p', 'Parágrafo']].map(([v, l]) => (
          <button key={v} onMouseDown={e => { e.preventDefault(); exec('formatBlock', v); setMenu(null) }} style={menuItem}>{l}</button>
        ))}
      </Painel>

      <Painel id="fonte" width={196}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Família da fonte</div>
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {FONTES.map(f => (
            <button key={f.nome} onMouseDown={e => { e.preventDefault(); const ed = editorRef.current; if (ed) run(() => aplicarFonte(f.css)); setMenu(null) }}
              style={{ ...menuItem, fontFamily: f.css, fontSize: '0.9rem' }}>{f.nome}</button>
          ))}
        </div>
      </Painel>

      <Painel id="tamanho" width={172}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Tamanho base da página</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <button onMouseDown={e => { e.preventDefault(); setBaseFont(v => Math.max(9, v - 1)) }} style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 800, fontSize: '1rem' }}>−</button>
          <div style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{baseFont}px</div>
          <button onMouseDown={e => { e.preventDefault(); setBaseFont(v => Math.min(40, v + 1)) }} style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 800, fontSize: '1rem' }}>+</button>
        </div>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: 8 }}>A pauta acompanha este tamanho.</div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Tamanho do trecho (7–20)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {Array.from({ length: 14 }, (_, i) => i + 7).map(px => (
            <button key={px} onMouseDown={e => { e.preventDefault(); const ed = editorRef.current; if (ed) run(() => aplicarTamanho(ed, px)) }}
              style={{ height: 30, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem' }}>{px}</button>
          ))}
        </div>
        <div style={{ marginTop: 6, fontSize: '0.6rem', color: 'var(--text-muted)' }}>Selecione o texto e escolha o tamanho.</div>
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
      <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={onChange} onKeyDown={onKeyDown}
        className={pageStyle !== 'blank' ? 'pr-ruled' : undefined}
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px', outline: 'none', color: 'var(--text-primary)',
          lineHeight: pageStyle !== 'blank' ? 'var(--pr-pitch)' : 1.7, fontSize: baseFont + 'px',
          ['--pr-pitch' as any]: pitch + 'px',
          position: 'relative',
          backgroundImage: pageStyle === 'lined'
            ? 'repeating-linear-gradient(transparent 0 calc(var(--pr-pitch) - 1px), var(--border) calc(var(--pr-pitch) - 1px) var(--pr-pitch))'
            : pageStyle === 'grid'
              ? 'repeating-linear-gradient(transparent 0 calc(var(--pr-pitch) - 1px), var(--border) calc(var(--pr-pitch) - 1px) var(--pr-pitch)), repeating-linear-gradient(90deg, transparent 0 calc(var(--pr-pitch) - 1px), var(--border) calc(var(--pr-pitch) - 1px) var(--pr-pitch))'
              : 'none',
          backgroundOrigin: 'content-box', backgroundClip: 'border-box',
          backgroundAttachment: 'local',
        }}>
        <p><br /></p>
      </div>

    </div>
  )
}

/* ═══════════════════════════════ VISUALIZADOR PDF ═══════════════════════════════ */
const PALETA_REALCE = ['#fff3a3', '#ffd28a', '#ffb3c1', '#c3f0c8', '#bfe3ff', '#e3c8ff', '#ffe0b0', '#d9d9d9']
// paleta do cursor de texto: linha 1 = tons claros, linha 2 = tons vivos/escuros
const PALETA_GRIFO = ['#fff3a3', '#c3f0c8', '#bfe3ff', '#ffb3c1', '#e3c8ff', '#ffe0b0', '#facc15', '#22c55e', '#3b82f6', '#ef4444', '#a855f7', '#f97316']
/* tonalizações (filtro CSS — puramente visual, não afeta OCR nem seleção) */
const TONS: { id: string; label: string; icon: string; filter: string }[] = [
  { id: 'cor', label: 'Cor (original)', icon: '🎨', filter: 'none' },
  { id: 'cinza', label: 'Cinza', icon: '◐', filter: 'grayscale(1)' },
  { id: 'pb', label: 'P&B alto contraste', icon: '◑', filter: 'grayscale(1) contrast(1.45) brightness(1.05)' },
  { id: 'sepia', label: 'Sépia (tom quente)', icon: '🟤', filter: 'sepia(0.6) contrast(1.05) brightness(1.02)' },
  { id: 'escuro', label: 'Modo escuro', icon: '🌙', filter: 'invert(0.92) hue-rotate(180deg) contrast(0.95) brightness(1.05)' },
]
const tomFilter = (id: string) => (TONS.find(t => t.id === id) || TONS[0]).filter

/* ─────────── MINIATURAS DAS PÁGINAS (feature 9) — tira lateral colapsável ─────────── */
function ThumbStrip({ pdf, numPages, curPage, onGo }: any) {
  const hostRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef<Set<number>>(new Set())
  useEffect(() => {
    const host = hostRef.current; if (!host || !pdf) return
    const io = new IntersectionObserver(ents => {
      ents.forEach(async e => {
        if (!e.isIntersecting) return
        const n = Number((e.target as HTMLElement).dataset.n); if (doneRef.current.has(n)) return
        doneRef.current.add(n)
        try {
          const pg = await pdf.getPage(n); const vp0 = pg.getViewport({ scale: 1 })
          const sc = 104 / vp0.width; const vp = pg.getViewport({ scale: sc })
          const cv = document.createElement('canvas'); cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height)
          await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise
          const holder = e.target.querySelector('.pr-thumb-canvas') as HTMLElement
          if (holder) { holder.innerHTML = ''; cv.style.cssText = 'width:100%;height:auto;display:block;border-radius:3px'; holder.appendChild(cv) }
        } catch {}
      })
    }, { root: host, rootMargin: '300px 0px' })
    host.querySelectorAll('.pr-thumb').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [pdf, numPages])
  // mantém a página atual visível na tira
  useEffect(() => { const el = hostRef.current?.querySelector(`[data-n="${curPage}"]`) as HTMLElement; if (el) el.scrollIntoView({ block: 'nearest' }) }, [curPage])
  return (
    <div ref={hostRef} style={{ position: 'absolute', top: 4, bottom: 0, left: 0, width: 120, zIndex: 44, overflowY: 'auto', background: 'var(--card-bg)', borderRight: '1px solid var(--border)', padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: numPages }, (_, i) => i + 1).map(n => (
        <div key={n} className="pr-thumb" data-n={n} onClick={() => onGo(n)} title={`Página ${n}`}
          style={{ cursor: 'pointer', borderRadius: 5, border: n === curPage ? '2px solid #5b5bd6' : '1px solid var(--border)', padding: 2, background: n === curPage ? 'rgba(91,91,214,.1)' : 'transparent' }}>
          <div className="pr-thumb-canvas" style={{ width: '100%', aspectRatio: '0.72', background: 'var(--surface)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{n}</div>
          <div style={{ textAlign: 'center', fontSize: '0.62rem', color: n === curPage ? '#5b5bd6' : 'var(--text-muted)', fontWeight: 700, marginTop: 2 }}>{n}</div>
        </div>
      ))}
    </div>
  )
}

/* ─────────── CHAT COM O DOCUMENTO (feature 1) — drawer lateral ─────────── */
function ChatDocumento({ chat, onEnviar, onClose, onLimpar, onInserir }: any) {
  const [txt, setTxt] = useState('')
  const fimRef = useRef<HTMLDivElement>(null)
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat.msgs, chat.carregando])
  const enviar = () => { const t = txt.trim(); if (!t) return; setTxt(''); onEnviar(t) }
  return (
    <div style={{ position: 'absolute', top: 4, bottom: 0, right: 0, width: 332, zIndex: 44, display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', borderLeft: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 11px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ color: '#5b5bd6' }}>💬</span><b style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>Conversar com o PDF</b>
        <span style={{ flex: 1 }} />
        <button onClick={onLimpar} title="Limpar conversa" style={{ ...btn, width: 28 }}>🧹</button>
        <button onClick={onClose} title="Fechar" style={{ ...btn, width: 28 }}>✕</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {chat.msgs.length === 0 && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>Pergunte qualquer coisa sobre o documento aberto. A IA responde usando o texto extraído como contexto. Ex.: <i>"Quais os prazos previstos no edital?"</i> ou <i>"Resuma a cláusula de rescisão."</i></div>}
        {chat.msgs.map((m: any, i: number) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
            <div style={{ padding: '8px 11px', borderRadius: 12, fontSize: '0.82rem', lineHeight: 1.45, whiteSpace: 'pre-wrap', background: m.role === 'user' ? '#5b5bd6' : 'var(--surface)', color: m.role === 'user' ? '#fff' : 'var(--text-primary)', border: m.role === 'user' ? 'none' : '1px solid var(--border)' }}>{m.text}</div>
            {m.role === 'assistant' && <button onClick={() => onInserir(m.text)} title="Inserir resposta no editor" style={{ marginTop: 3, fontSize: '0.66rem', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>↳ inserir no editor</button>}
          </div>
        ))}
        {chat.carregando && <div style={{ alignSelf: 'flex-start', fontSize: '0.78rem', color: 'var(--text-muted)', padding: '6px 10px' }}>pensando…</div>}
        <div ref={fimRef} />
      </div>
      <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--border)' }}>
        <textarea value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }} placeholder="Pergunte sobre o documento…" rows={2}
          style={{ flex: 1, resize: 'none', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.82rem', padding: '7px 9px', borderRadius: 9, outline: 'none', fontFamily: 'inherit' }} />
        <button onClick={enviar} disabled={chat.carregando} style={{ alignSelf: 'stretch', padding: '0 14px', borderRadius: 9, border: 'none', background: '#5b5bd6', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>➤</button>
      </div>
    </div>
  )
}

/* ═══════════════ MODO READER (texto limpo, reflowável — efeito "Kindle") ═══════════════ */
function reflowParagrafos(texto: string): string[] {
  const sentencas = (texto || '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(?:["')\]]+)?|\S.*$/g) || [texto]
  const paras: string[] = []; let cur = ''
  for (const s of sentencas) { cur += (cur ? ' ' : '') + s.trim(); if (cur.length > 320) { paras.push(cur); cur = '' } }
  if (cur.trim()) paras.push(cur.trim())
  return paras
}
function limparReader(paginas: { page: number; texto: string }[]) {
  if (!paginas.length) return []
  const cont: Record<string, number> = {}
  paginas.forEach(({ texto }) => { const ls = (texto || '').split('\n').map(s => s.trim()).filter(Boolean); [...ls.slice(0, 2), ...ls.slice(-2)].forEach(l => { if (l.length < 70) cont[l] = (cont[l] || 0) + 1 }) })
  const limiar = Math.max(2, Math.floor(paginas.length * 0.4))
  const boiler = new Set(Object.keys(cont).filter(l => cont[l] >= limiar))
  return paginas.map(({ page, texto }) => {
    let ls = (texto || '').split('\n').map(s => s.trim())
    ls = ls.filter(l => l && !boiler.has(l) && !/^\d{1,4}$/.test(l) && !/^\d+\s*\/\s*\d+$/.test(l) && !/^p[áa]g(ina)?\.?\s*\d+/i.test(l) && l.length > 2)
    const merged: string[] = []
    for (let i = 0; i < ls.length; i++) { let l = ls[i]; while (/[A-Za-zÀ-ÿ]-$/.test(l) && i + 1 < ls.length) { l = l.slice(0, -1) + ls[i + 1]; i++ } merged.push(l) }
    return { page, paragrafos: reflowParagrafos(merged.join(' ')) }
  })
}
function ReaderMode({ numPages, startPage, getPageText, nome, onClose }: any) {
  const [paginas, setPaginas] = useState<any[]>([])
  const [carregando, setCarregando] = useState(false)
  const [fonte, setFonte] = useState(19)
  const [largura, setLargura] = useState(680)
  const [lh, setLh] = useState(1.75)
  const [tema, setTema] = useState<'claro' | 'sepia' | 'escuro'>('sepia')
  const prox = useRef(startPage)
  const scRef = useRef<HTMLDivElement>(null)
  const carregar = async (n: number) => {
    if (carregando) return; setCarregando(true)
    const novas: any[] = []
    for (let i = 0; i < n; i++) { const p = prox.current; if (p > numPages) break; try { const t = await getPageText(p); novas.push({ page: p, texto: t || '' }) } catch { novas.push({ page: p, texto: '' }) } prox.current = p + 1 }
    setPaginas(prev => [...prev, ...novas]); setCarregando(false)
  }
  useEffect(() => { prox.current = startPage; setPaginas([]); setTimeout(() => carregar(2), 0) }, [startPage])
  const limpo = useMemo(() => limparReader(paginas), [paginas])
  const TEMAS: any = { claro: { bg: '#ffffff', fg: '#1f2430' }, sepia: { bg: '#f4ecd8', fg: '#4a3f2c' }, escuro: { bg: '#191a1f', fg: '#cdd0d6' } }
  const T = TEMAS[tema]
  const restam = numPages - (prox.current - 1)
  const ctrl: any = { width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(128,128,128,.3)', background: 'transparent', color: T.fg, cursor: 'pointer', fontWeight: 800, fontSize: '.9rem' }
  const onScroll = () => { const el = scRef.current; if (!el || carregando) return; if (el.scrollTop + el.clientHeight > el.scrollHeight - 600 && restam > 0) carregar(2) }
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: T.bg, display: 'flex', flexDirection: 'column' }}>
      {/* barra de controles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${tema === 'escuro' ? '#2a2c33' : 'rgba(0,0,0,.08)'}`, color: T.fg, flexWrap: 'wrap' }}>
        <b style={{ fontSize: '.9rem' }}>📖 Modo Reader</b>
        <span style={{ fontSize: '.72rem', opacity: .7, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setFonte(f => Math.max(13, f - 1))} style={ctrl} title="Fonte menor">A−</button>
        <span style={{ fontSize: '.72rem', minWidth: 26, textAlign: 'center' }}>{fonte}</span>
        <button onClick={() => setFonte(f => Math.min(30, f + 1))} style={ctrl} title="Fonte maior">A+</button>
        <button onClick={() => setLh(v => Math.max(1.3, +(v - 0.1).toFixed(2)))} style={ctrl} title="Menos espaçamento">↕−</button>
        <button onClick={() => setLh(v => Math.min(2.4, +(v + 0.1).toFixed(2)))} style={ctrl} title="Mais espaçamento">↕+</button>
        <button onClick={() => setLargura(w => Math.max(480, w - 60))} style={ctrl} title="Coluna mais estreita">⇤</button>
        <button onClick={() => setLargura(w => Math.min(960, w + 60))} style={ctrl} title="Coluna mais larga">⇥</button>
        {(['claro', 'sepia', 'escuro'] as const).map(t => (
          <button key={t} onClick={() => setTema(t)} title={t} style={{ width: 22, height: 22, borderRadius: '50%', border: tema === t ? '2px solid #5b5bd6' : '2px solid transparent', background: TEMAS[t].bg, cursor: 'pointer' }} />
        ))}
        <button onClick={onClose} style={{ ...ctrl, width: 'auto', padding: '0 10px' }} title="Sair do modo Reader">✕ Sair</button>
      </div>
      {/* conteúdo */}
      <div ref={scRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: '32px 20px 80px' }}>
        <div style={{ maxWidth: largura, margin: '0 auto', color: T.fg, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: fonte, lineHeight: lh }}>
          <div style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.08em', opacity: .55, marginBottom: 24, fontFamily: 'system-ui,sans-serif' }}>{nome}</div>
          {limpo.map((pg: any) => (
            <div key={pg.page} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: '.64rem', opacity: .35, fontFamily: 'system-ui,sans-serif', margin: '18px 0 6px' }}>— p. {pg.page} —</div>
              {pg.paragrafos.map((p: string, i: number) => <p key={i} style={{ margin: '0 0 1em', textAlign: 'justify', textIndent: '1.4em' }}>{p}</p>)}
            </div>
          ))}
          {carregando && <div style={{ textAlign: 'center', opacity: .6, padding: 20, fontFamily: 'system-ui,sans-serif', fontSize: '.8rem' }}>Carregando texto…</div>}
          {!carregando && restam > 0 && <button onClick={() => carregar(3)} style={{ display: 'block', margin: '20px auto', padding: '10px 18px', borderRadius: 10, border: '1px solid rgba(128,128,128,.3)', background: 'transparent', color: T.fg, cursor: 'pointer', fontFamily: 'system-ui,sans-serif', fontSize: '.82rem' }}>▼ Carregar mais ({restam} páginas restantes)</button>}
          {!carregando && restam <= 0 && paginas.length > 0 && <div style={{ textAlign: 'center', opacity: .4, padding: 24, fontFamily: 'system-ui,sans-serif', fontSize: '.78rem' }}>✦ Fim do documento</div>}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════ LINHA DO TEMPO DE LEITURA + DIFICULDADE ═══════════════ */
function BarraLeitura({ numPages, curPage, fileKey, gotoPage, getPageText, onHeight }: any) {
  const keyL = 'nexus_pr_lidas_' + fileKey, keyD = 'nexus_pr_dific_' + fileKey, keyM = 'nexus_pr_dificmot_' + fileKey
  const [lidas, setLidas] = useState<Set<number>>(new Set())
  const [dific, setDific] = useState<Record<string, string>>({})
  const [motivos, setMotivos] = useState<Record<string, string>>({})
  const [painel, setPainel] = useState(false)
  const [relatorio, setRelatorio] = useState(false)
  const [colapsada, setColapsada] = useState<boolean>(() => { try { return localStorage.getItem('nexus_pr_barra_oculta') === '1' } catch { return false } })
  const [analise, setAnalise] = useState<{ pct: number } | null>(null)
  const [de, setDe] = useState(1)
  const [ate, setAte] = useState(1)
  useEffect(() => {
    try { setLidas(new Set(JSON.parse(localStorage.getItem(keyL) || '[]'))) } catch { setLidas(new Set()) }
    try { setDific(JSON.parse(localStorage.getItem(keyD) || '{}')) } catch { setDific({}) }
    try { setMotivos(JSON.parse(localStorage.getItem(keyM) || '{}')) } catch { setMotivos({}) }
    setAte(Math.min(numPages || 1, 20))
  }, [fileKey])
  useEffect(() => {
    if (!fileKey || !curPage) return
    setLidas(prev => { if (prev.has(curPage)) return prev; const n = new Set(prev); n.add(curPage); try { localStorage.setItem(keyL, JSON.stringify([...n])) } catch {} ; return n })
  }, [curPage, fileKey])
  const temDific = Object.keys(dific).length > 0
  useEffect(() => { onHeight?.(colapsada ? 16 : (temDific ? 50 : 36)) }, [temDific, colapsada])
  const toggleColapsar = () => setColapsada(c => { const v = !c; try { localStorage.setItem('nexus_pr_barra_oculta', v ? '1' : '0') } catch {} ; return v })
  const toggleLida = (p: number) => setLidas(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); try { localStorage.setItem(keyL, JSON.stringify([...n])) } catch {} ; return n })
  const resetar = () => { if (confirm('Resetar todo o progresso de leitura deste PDF?')) { setLidas(new Set()); try { localStorage.removeItem(keyL) } catch {} } }
  const pct = numPages ? Math.round((lidas.size / numPages) * 100) : 0
  const analisar = async () => {
    const ini = Math.max(1, Math.min(de, ate)), fim = Math.min(numPages, Math.max(de, ate))
    if (fim - ini + 1 > 50 && !confirm(`Vai analisar ${fim - ini + 1} páginas com a IA (consome cota). Continuar?`)) return
    setAnalise({ pct: 0 }); const novoD = { ...dific }, novoM = { ...motivos }; const BATCH = 8
    for (let s = ini; s <= fim; s += BATCH) {
      const blocos: any[] = []
      for (let p = s; p < s + BATCH && p <= fim; p++) { try { const t = await getPageText(p); if (t) blocos.push({ page: p, texto: t }) } catch {} }
      if (blocos.length) { try { const r = await analisarDificuldadeIA(blocos); Object.keys(r).forEach(k => { novoD[k] = r[k].nivel; if (r[k].motivo) novoM[k] = r[k].motivo }) } catch {} }
      setDific({ ...novoD }); setMotivos({ ...novoM })
      try { localStorage.setItem(keyD, JSON.stringify(novoD)); localStorage.setItem(keyM, JSON.stringify(novoM)) } catch {}
      setAnalise({ pct: Math.round((Math.min(s + BATCH - 1, fim) - ini + 1) / (fim - ini + 1) * 100) })
    }
    setAnalise(null)
  }
  const grupos = useMemo(() => {
    const g: any = { complexo: [], medio: [], facil: [] }
    Object.keys(dific).forEach(k => { const n = dific[k]; if (g[n]) g[n].push(+k) })
    Object.values(g).forEach((a: any) => a.sort((x: number, y: number) => x - y))
    return g
  }, [dific])
  if (!numPages) return null
  // barra recolhida: apenas uma aba com a seta para reexibir
  if (colapsada) return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 35, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card-bg)', borderBottom: '1px solid var(--border)' }}>
      <button onClick={toggleColapsar} title="Mostrar linha do tempo de leitura/dificuldade" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 14, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '.6rem', fontWeight: 700 }}>▾ Linha do tempo</button>
    </div>
  )
  const cells: number[] = []; for (let p = 1; p <= numPages; p++) cells.push(p)
  const posPct = (p: number) => numPages > 1 ? ((p - 0.5) / numPages) * 100 : 50
  const marks = (() => { if (numPages <= 1) return [1]; const set = new Set([1, numPages]); [.25, .5, .75].forEach(f => set.add(Math.max(1, Math.round(numPages * f)))); return [...set].sort((a, b) => a - b) })()
  const READ_GRAD = 'linear-gradient(180deg,#4ade80,#16a34a)'
  const cellTitle = (p: number) => `Página ${p}${lidas.has(p) ? ' · lida' : ''}${dific[p] ? ' · ' + ROTDIF[dific[p]] : ''}${motivos[p] ? '\n' + motivos[p] : ''}\n(clique p/ ir · ⇧clique p/ marcar)`

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 35, background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,.06)', padding: '4px 12px 3px' }}>
      {/* cabeçalho minimalista */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <button onClick={toggleColapsar} title="Ocultar a linha do tempo (fica fixo)" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 16, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '.62rem', fontWeight: 700 }}>▴</button>
        <button onClick={() => setPainel(p => !p)} title="Opções da linha do tempo" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 16, padding: '0 6px', border: '1px solid var(--border)', borderRadius: 6, background: painel ? '#5b5bd6' : 'transparent', color: painel ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontSize: '.62rem', fontWeight: 700 }}>≡ Leitura</button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '.64rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
          <span style={{ color: '#5b5bd6' }}>p. {curPage}</span>
          <span style={{ opacity: .5 }}>/{numPages}</span>
          <span style={{ margin: '0 5px', opacity: .35 }}>·</span>
          <span style={{ color: '#16a34a' }}>{pct}% lido</span>
        </span>
        {temDific && <button onClick={() => setRelatorio(true)} title="Ver relatório de dificuldade da IA" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height: 16, padding: '0 6px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '.62rem', fontWeight: 700 }}>📋 Relatório</button>}
      </div>
      {/* trilha de progresso */}
      <div style={{ position: 'relative', height: 12 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 7, overflow: 'hidden', background: '#e6e8ec', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.12)', display: 'flex' }}>
          {cells.map(p => (
            <div key={p} onClick={e => e.shiftKey ? toggleLida(p) : gotoPage(p)} title={cellTitle(p)}
              style={{ flex: 1, minWidth: 0, cursor: 'pointer', background: lidas.has(p) ? READ_GRAD : 'transparent', transition: 'background .35s ease' }} />
          ))}
        </div>
        {/* marcador de página atual */}
        <div style={{ position: 'absolute', left: posPct(curPage) + '%', top: -3, bottom: -3, width: 2, marginLeft: -1, background: '#5b5bd6', borderRadius: 2, boxShadow: '0 0 6px rgba(91,91,214,.7)', transition: 'left .35s cubic-bezier(.4,0,.2,1)', pointerEvents: 'none' }}>
          <span style={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, borderRadius: '50%', background: '#5b5bd6', boxShadow: '0 0 0 3px rgba(91,91,214,.22)' }} />
        </div>
      </div>
      {/* faixa de dificuldade */}
      {temDific && (
        <div style={{ position: 'relative', height: 7, marginTop: 3 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 5, overflow: 'hidden', background: '#eceef2', display: 'flex' }}>
            {cells.map(p => (
              <div key={p} onClick={() => gotoPage(p)} title={dific[p] ? `Página ${p} — ${ROTDIF[dific[p]]}${motivos[p] ? '\n' + motivos[p] : ''}` : `Página ${p} — (não analisada)`}
                style={{ flex: 1, minWidth: 0, cursor: 'pointer', background: dific[p] ? `linear-gradient(180deg,${CORDIF[dific[p]]},${CORDIF2[dific[p]]})` : 'transparent' }} />
            ))}
          </div>
          <div style={{ position: 'absolute', left: posPct(curPage) + '%', top: -2, bottom: -2, width: 2, marginLeft: -1, background: '#1f2430', borderRadius: 2, opacity: .55, transition: 'left .35s cubic-bezier(.4,0,.2,1)', pointerEvents: 'none' }} />
        </div>
      )}
      {/* ticks de páginas (eixo) */}
      <div style={{ position: 'relative', height: 11, marginTop: 1 }}>
        {marks.map(p => (
          <span key={p} style={{ position: 'absolute', left: (numPages > 1 ? ((p - 1) / (numPages - 1)) * 100 : 50) + '%', transform: p === 1 ? 'none' : p === numPages ? 'translateX(-100%)' : 'translateX(-50%)', fontSize: '.56rem', color: 'var(--text-muted)', fontWeight: 600, lineHeight: '11px' }}>{p}</span>
        ))}
      </div>
      {/* painel de opções */}
      {painel && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '9px 4px 5px', marginTop: 3, borderTop: '1px solid var(--border)', fontSize: '.74rem', color: 'var(--text-secondary)' }}>
          <button onClick={() => toggleLida(curPage)} style={{ ...btn, width: 'auto', padding: '0 9px', fontSize: '.72rem' }}>{lidas.has(curPage) ? '✓ Desmarcar atual' : '✓ Marcar atual como lida'}</button>
          <button onClick={resetar} style={{ ...btn, width: 'auto', padding: '0 9px', fontSize: '.72rem', color: '#dc2626' }}>↺ Resetar progresso</button>
          <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
          <span style={{ fontWeight: 700 }}>Dificuldade (IA):</span>
          <span>pág.</span>
          <input type="number" min={1} value={de} onChange={e => setDe(+e.target.value)} style={{ width: 54, border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', background: 'var(--surface)', color: 'var(--text-primary)', outline: 'none' }} />
          <span>a</span>
          <input type="number" min={1} value={ate} onChange={e => setAte(+e.target.value)} style={{ width: 54, border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', background: 'var(--surface)', color: 'var(--text-primary)', outline: 'none' }} />
          <button onClick={analisar} disabled={!!analise} style={{ height: 26, padding: '0 11px', borderRadius: 7, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 700, fontSize: '.72rem', cursor: analise ? 'default' : 'pointer', opacity: analise ? .8 : 1 }}>{analise ? `Analisando… ${analise.pct}%` : '🧠 Analisar dificuldade'}</button>
          {temDific && <button onClick={() => setRelatorio(true)} style={{ ...btn, width: 'auto', padding: '0 9px', fontSize: '.72rem' }}>📋 Ver relatório</button>}
          <span style={{ display: 'inline-flex', gap: 9, alignItems: 'center', fontSize: '.66rem', marginLeft: 'auto' }}>
            {(['facil', 'medio', 'complexo'] as const).map(k => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: CORDIF[k] }} />{ROTDIF[k]}</span>)}
          </span>
        </div>
      )}
      {/* RELATÓRIO DE DIFICULDADE */}
      {relatorio && createPortal(<>
        <div onClick={() => setRelatorio(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9600 }} />
        <div className="pr-pop" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 9601, width: 'min(620px,95vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.45)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,rgba(124,58,237,.12),transparent)' }}>
            <b style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>📋 Relatório de dificuldade</b>
            <span style={{ flex: 1 }} />
            {(['facil', 'medio', 'complexo'] as const).map(k => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.74rem', fontWeight: 700, color: CORDIF[k] }}><span style={{ width: 11, height: 11, borderRadius: 3, background: CORDIF[k] }} />{grupos[k].length}</span>)}
            <button onClick={() => setRelatorio(false)} style={{ ...btn, marginLeft: 6 }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {(['complexo', 'medio', 'facil'] as const).filter(k => grupos[k].length).map(k => (
              <div key={k} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 5, borderBottom: `2px solid ${CORDIF[k]}` }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: CORDIF[k] }} />
                  <b style={{ color: 'var(--text-primary)', fontSize: '.9rem' }}>{ROTDIF[k]}</b>
                  <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>({grupos[k].length} página{grupos[k].length > 1 ? 's' : ''})</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {grupos[k].map((p: number) => (
                    <div key={p} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                      <button onClick={() => { gotoPage(p); setRelatorio(false) }} title="Ir para a página" style={{ flexShrink: 0, minWidth: 38, height: 22, padding: '0 7px', borderRadius: 6, border: `1px solid ${CORDIF[k]}55`, background: `${CORDIF[k]}18`, color: 'var(--text-primary)', fontWeight: 700, fontSize: '.72rem', cursor: 'pointer' }}>p.{p}</button>
                      <span style={{ fontSize: '.8rem', color: 'var(--text-secondary)', lineHeight: 1.45, paddingTop: 2 }}>{motivos[p] || <span style={{ opacity: .5 }}>— sem justificativa registrada —</span>}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!Object.keys(dific).length && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>Nenhuma página analisada ainda.</div>}
          </div>
        </div>
      </>, document.body)}
    </div>
  )
}

/* ═══════════════════════════════ TIMER / POMODORO / CRONÔMETRO ═══════════════════════════════ */
const TIMER_KEY = 'nexus_pr_timer'
const TIMER_DEFAULT = {
  presets: [
    { id: 'pomo', nome: 'Pomodoro 25/5', tipo: 'pomodoro', foco: 25, pausa: 5, ciclos: 4 },
    { id: 'foco50', nome: 'Foco 50 min', tipo: 'timer', min: 50, seg: 0 },
    { id: 'crono', nome: 'Cronômetro', tipo: 'crono' },
  ] as any[], ativo: 'pomo', som: true,
}
const fmtT = (s: number) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; const p = (n: number) => String(n).padStart(2, '0'); return h > 0 ? `${p(h)}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}` }
function beepTimer() { try { const AC = (window as any).AudioContext || (window as any).webkitAudioContext; const ac = new AC(); const o = ac.createOscillator(); const g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.frequency.value = 880; g.gain.value = 0.07; o.start(); setTimeout(() => { o.stop(); ac.close() }, 360) } catch {} }

function TimerWidget() {
  const [cfg, setCfg] = useState<any>(() => { try { const s = JSON.parse(localStorage.getItem(TIMER_KEY) || ''); if (s?.presets?.length) return s } catch {} return TIMER_DEFAULT })
  useEffect(() => { try { localStorage.setItem(TIMER_KEY, JSON.stringify(cfg)) } catch {} }, [cfg])
  const preset = cfg.presets.find((p: any) => p.id === cfg.ativo) || cfg.presets[0]
  const initSec = (p: any) => !p ? 0 : p.tipo === 'crono' ? 0 : p.tipo === 'timer' ? ((p.min || 0) * 60 + (p.seg || 0)) : (p.foco || 25) * 60
  const [run, setRun] = useState<any>(() => ({ running: false, sec: initSec(preset), fase: 'foco', ciclo: 1, fim: false }))
  const [open, setOpen] = useState(false)
  // troca de preset ou edição reinicia o relógio
  useEffect(() => { setRun({ running: false, sec: initSec(preset), fase: 'foco', ciclo: 1, fim: false }) }, [cfg.ativo, preset?.tipo, preset?.min, preset?.seg, preset?.foco, preset?.pausa, preset?.ciclos])
  // tique de 1s
  useEffect(() => {
    if (!run.running) return
    const t = setInterval(() => setRun((r: any) => {
      if (!r.running) return r
      if (preset.tipo === 'crono') return { ...r, sec: r.sec + 1 }
      const ns = r.sec - 1
      if (ns > 0) return { ...r, sec: ns }
      if (cfg.som) beepTimer()
      if (preset.tipo === 'timer') return { ...r, sec: 0, running: false, fim: true }
      // pomodoro: avança de fase
      if (r.fase === 'foco') return { ...r, fase: 'pausa', sec: (preset.pausa || 5) * 60, fim: false }
      const novo = r.ciclo + 1
      if (novo > (preset.ciclos || 4)) return { ...r, sec: 0, running: false, fim: true, fase: 'foco', ciclo: 1 }
      return { ...r, fase: 'foco', sec: (preset.foco || 25) * 60, ciclo: novo, fim: false }
    }), 1000)
    return () => clearInterval(t)
  }, [run.running, preset, cfg.som])

  const toggle = () => setRun((r: any) => ({ ...r, running: !r.running, fim: false }))
  const zerar = () => setRun({ running: false, sec: initSec(preset), fase: 'foco', ciclo: 1, fim: false })
  const upd = (id: string, patch: any) => setCfg((c: any) => ({ ...c, presets: c.presets.map((p: any) => p.id === id ? { ...p, ...patch } : p) }))
  const addPreset = () => { const id = 't' + Date.now(); setCfg((c: any) => ({ ...c, presets: [...c.presets, { id, nome: 'Novo timer', tipo: 'timer', min: 10, seg: 0 }], ativo: id })) }
  const delPreset = (id: string) => setCfg((c: any) => { const ps = c.presets.filter((p: any) => p.id !== id); return { ...c, presets: ps.length ? ps : TIMER_DEFAULT.presets, ativo: ps[0]?.id || 'pomo' } })

  const numIn: any = { width: 52, border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '.8rem', outline: 'none' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      <button onClick={toggle} disabled={!preset} title={run.running ? 'Pausar' : 'Iniciar'} style={{ ...btn, width: 26 }}>{run.running ? '⏸' : '▶'}</button>
      <button onClick={() => setOpen(o => !o)} title="Configurar timer / pomodoro" className={run.fim ? 'pr-blink' : ''}
        style={{ height: 30, padding: '0 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: run.fim ? '#dc2626' : 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer', minWidth: 54, letterSpacing: '.5px' }}>{fmtT(run.sec)}</button>
      {preset?.tipo === 'pomodoro' && <span style={{ fontSize: '.58rem', fontWeight: 800, color: run.fase === 'foco' ? '#16a34a' : '#ea580c', whiteSpace: 'nowrap' }}>{run.fase === 'foco' ? 'FOCO' : 'PAUSA'} {run.ciclo}/{preset.ciclos}</span>}
      {open && createPortal(<>
        <div onMouseDown={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9600 }} />
        <div className="pr-pop" style={{ position: 'fixed', left: '50%', top: 70, transform: 'translateX(-50%)', zIndex: 9601, width: 'min(380px,94vw)', maxHeight: '80vh', overflowY: 'auto', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,.4)', padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: '1rem' }}>⏱</span><b style={{ color: 'var(--text-primary)' }}>Timers</b><span style={{ flex: 1 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.7rem', color: 'var(--text-muted)', cursor: 'pointer' }}><input type="checkbox" checked={cfg.som} onChange={e => setCfg((c: any) => ({ ...c, som: e.target.checked }))} style={{ accentColor: '#7c3aed' }} />som</label>
            <button onMouseDown={e => { e.preventDefault(); setOpen(false) }} style={btn}>✕</button>
          </div>
          {cfg.presets.map((p: any) => (
            <div key={p.id} style={{ border: `1px solid ${cfg.ativo === p.id ? '#7c3aed' : 'var(--border)'}`, borderRadius: 10, padding: 9, marginBottom: 8, background: cfg.ativo === p.id ? 'rgba(124,58,237,.06)' : 'var(--surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <input type="radio" checked={cfg.ativo === p.id} onChange={() => setCfg((c: any) => ({ ...c, ativo: p.id }))} style={{ accentColor: '#7c3aed' }} />
                <input value={p.nome} onChange={e => upd(p.id, { nome: e.target.value })} style={{ flex: 1, border: 'none', background: 'transparent', color: 'var(--text-primary)', fontWeight: 700, fontSize: '.84rem', outline: 'none' }} />
                <select value={p.tipo} onChange={e => upd(p.id, { tipo: e.target.value })} style={{ ...numIn, width: 'auto', cursor: 'pointer' }}>
                  <option value="pomodoro">Pomodoro</option><option value="timer">Timer</option><option value="crono">Cronômetro</option>
                </select>
                <button onClick={() => delPreset(p.id)} title="Excluir" style={{ ...btn, width: 24, color: '#dc2626' }}>🗑</button>
              </div>
              {cfg.ativo === p.id && p.tipo === 'timer' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: '.74rem', color: 'var(--text-muted)' }}>
                  <input type="number" min={0} value={p.min || 0} onChange={e => upd(p.id, { min: Math.max(0, +e.target.value) })} style={numIn} /> min
                  <input type="number" min={0} max={59} value={p.seg || 0} onChange={e => upd(p.id, { seg: Math.min(59, Math.max(0, +e.target.value)) })} style={numIn} /> seg
                </div>
              )}
              {cfg.ativo === p.id && p.tipo === 'pomodoro' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: '.74rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                  <input type="number" min={1} value={p.foco || 25} onChange={e => upd(p.id, { foco: Math.max(1, +e.target.value) })} style={numIn} /> foco
                  <input type="number" min={1} value={p.pausa || 5} onChange={e => upd(p.id, { pausa: Math.max(1, +e.target.value) })} style={numIn} /> pausa
                  <input type="number" min={1} value={p.ciclos || 4} onChange={e => upd(p.id, { ciclos: Math.max(1, +e.target.value) })} style={numIn} /> ciclos
                </div>
              )}
            </div>
          ))}
          <button onClick={addPreset} style={{ ...btn, width: '100%', marginBottom: 10 }}>＋ Novo timer</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={toggle} style={{ flex: 1, height: 34, borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{run.running ? '⏸ Pausar' : '▶ Iniciar'}</button>
            <button onClick={zerar} style={{ ...btn, width: 'auto', padding: '0 14px', height: 34 }}>⟲ Zerar</button>
          </div>
        </div>
      </>, document.body)}
    </span>
  )
}

function PdfViewer({ onExtract, viewMode, setViewMode, secondary = false, viewerApi, onFileLoaded, onAddBookmark, onGerarFlashcard, onColetarMapa, foco = false, onToggleFoco }: any) {
  const uid = useUid()
  const wrapRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<any>(null); const libRef = useRef<any>(null)
  const [numPages, setNumPages] = useState(0)
  const [curPage, setCurPage] = useState(1)
  const [maxPage, setMaxPage] = useState(1)                 // feature 12: página mais avançada já alcançada
  const [pageBox, setPageBox] = useState(1)
  useEffect(() => { setPageBox(curPage) }, [curPage])
  useEffect(() => { setPaginaImagem(!!semTextoRef.current[curPage]); setMaxPage(m => Math.max(m, curPage)) }, [curPage])
  // feature 8: sessão de leitura (início, página máx) → alimenta o Diário ao trocar/fechar o arquivo
  const sessaoRef = useRef<{ arquivo: string; inicio: number; pagInicial: number; pagMax: number } | null>(null)
  // feature 1: cache do texto completo extraído (lazy)
  const fullTextRef = useRef<string>('')
  const [busca, setBusca] = useState<{ open: boolean; termo: string; hits: any[]; idx: number; buscando: boolean }>({ open: false, termo: '', hits: [], idx: 0, buscando: false })  // feature 3
  const [thumbsOpen, setThumbsOpen] = useState(false)        // feature 9
  const [recentes, setRecentes] = useState<any[]>(() => lerRecentes())  // feature 11
  const [chat, setChat] = useState<{ open: boolean; msgs: { role: 'user' | 'assistant'; text: string }[]; carregando: boolean }>({ open: false, msgs: [], carregando: false })  // feature 1
  const [resumindo, setResumindo] = useState(false)          // feature 5
  // gerar perguntas (comando customizável e reutilizável)
  const [gerandoQ, setGerandoQ] = useState(false)
  const [toggleOpen, setToggleOpen] = useState(false)
  const [qCmd, setQCmd] = useState<string>(() => lerComandoPerguntas())
  const [qEdit, setQEdit] = useState(false)
  const qCmdRef = useRef(qCmd); qCmdRef.current = qCmd
  const [zoom, setZoom] = useState(1.25)
  const [fitWidth, setFitWidth] = useState(true)
  const fitRef = useRef(true); fitRef.current = fitWidth
  const [tom, setTom] = useState<string>(() => { try { return localStorage.getItem('nexus_pr_tom') || 'cor' } catch { return 'cor' } })
  const [tomOpen, setTomOpen] = useState(false)
  useEffect(() => { try { localStorage.setItem('nexus_pr_tom', tom) } catch {} }, [tom])
  const [nome, setNome] = useState('')
  const nomeRef = useRef(''); nomeRef.current = nome
  const [ferramenta, setFerramenta] = useState<'none' | 'lupa' | 'mascara' | 'regua' | 'foco' | 'linha' | 'forma'>('none')
  const [linhaH, setLinhaH] = useState<number>(() => { try { return Number(localStorage.getItem('pr_linha_h')) || 30 } catch { return 30 } })
  useEffect(() => { try { localStorage.setItem('pr_linha_h', String(linhaH)) } catch {} }, [linhaH])
  // cursor-forma preto que segue o mouse (ajustável em largura/altura + vários formatos)
  const FORMAS = [
    { id: 'barra', nome: 'Barra', icone: '▬' },
    { id: 'circulo', nome: 'Círculo', icone: '●' },
    { id: 'quadrado', nome: 'Quadrado', icone: '■' },
    { id: 'moldura', nome: 'Retângulo vazado (lê por dentro)', icone: '▭' },
    { id: 'triangulo', nome: 'Triângulo', icone: '▲' },
    { id: 'triangulo-dir', nome: 'Triângulo p/ direita', icone: '▶' },
    { id: 'seta-dir', nome: 'Seta p/ o lado', icone: '➜' },
    { id: 'seta-cima', nome: 'Seta p/ cima', icone: '⬆' },
    { id: 'mao', nome: 'Mão', icone: '👆' },
    { id: 'lapis', nome: 'Lápis', icone: '✏️' },
  ] as const
  const [formaTipo, setFormaTipo] = useState<string>(() => { try { return localStorage.getItem('pr_forma_tipo') || 'barra' } catch { return 'barra' } })
  const [formaW, setFormaW] = useState<number>(() => { try { return Number(localStorage.getItem('pr_forma_w')) || 90 } catch { return 90 } })
  const [formaH, setFormaH] = useState<number>(() => { try { return Number(localStorage.getItem('pr_forma_h')) || 22 } catch { return 22 } })
  useEffect(() => { try { localStorage.setItem('pr_forma_tipo', formaTipo); localStorage.setItem('pr_forma_w', String(formaW)); localStorage.setItem('pr_forma_h', String(formaH)) } catch {} }, [formaTipo, formaW, formaH])
  const [modo, setModo] = useState<'selecionar' | 'realcar' | 'texto'>('selecionar')  // marquee → editor / marquee → realce / cursor de texto (grifar por teclado)
  // configuração do cursor de texto (grifo por teclado): tipo, cor e transparência
  const [grifoCfg, setGrifoCfg] = useState<{ tipo: 'realce' | 'sublinhado'; cor: string; opac: number }>(() => {
    try { const s = JSON.parse(localStorage.getItem('pr_grifo_cfg') || ''); if (s && s.cor) return s } catch {}
    return { tipo: 'realce', cor: '#fff3a3', opac: 0.42 }
  })
  useEffect(() => { try { localStorage.setItem('pr_grifo_cfg', JSON.stringify(grifoCfg)) } catch {} }, [grifoCfg])
  const [tipoMarca, setTipoMarca] = useState<'realce' | 'sublinhado'>('realce')
  const modoRef = useRef(modo); modoRef.current = modo
  // liga/desliga o cursor de texto: camada de texto vira editável (com edição bloqueada) → cursor nativo + setas
  const aplicarEditavelTL = (tl: HTMLElement) => {
    const on = modoRef.current === 'texto'
    tl.contentEditable = on ? 'true' : 'false'
    tl.setAttribute('spellcheck', 'false')
    tl.style.caretColor = on ? '#5b5bd6' : ''
    tl.style.outline = 'none'
  }
  const aplicarEditavelTodas = () => { wrapRef.current?.querySelectorAll('.pr-textlayer').forEach(tl => aplicarEditavelTL(tl as HTMLElement)) }
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
  const [aiPop, setAiPop] = useState<{ open: boolean; carregando: boolean; titulo: string; texto: string; origem: string } | null>(null)  // resultado de "Não entendi"/Dicionário
  const [reader, setReader] = useState(false)   // Modo Reader (texto limpo reflowável)
  const [barraH, setBarraH] = useState(36)   // altura dinâmica da linha do tempo
  const [copiado, setCopiado] = useState(false)   // feedback do botão copiar no popup
  const [ocrStatus, setOcrStatus] = useState<{ running: boolean; pct: number; page: number } | null>(null)

  // importa o PDF (apenas em memória — nunca persistido)
  const importar = async (file: File) => {
    flushSessao()                                   // feature 8: fecha a sessão do arquivo anterior
    const buf = await file.arrayBuffer()
    const lib = await ensurePdfjs(); libRef.current = lib
    const pdf = await lib.getDocument({ data: buf }).promise
    pdfRef.current = pdf; setNumPages(pdf.numPages); setNome(file.name.replace(/\.pdf$/i, '')); setCurPage(1); setMaxPage(1)
    pageElsRef.current = {}; rsRef.current = {}; tcRef.current = {}; visRef.current = new Set()
    ocrRef.current = {}; semTextoRef.current = {}; setPaginaImagem(false); setOcrStatus(null)
    fullTextRef.current = ''                          // feature 1: invalida cache de texto completo
    setBusca({ open: false, termo: '', hits: [], idx: 0, buscando: false })  // feature 3
    setChat(c => ({ ...c, msgs: [] }))                // feature 1: novo documento, nova conversa
    sessaoRef.current = { arquivo: file.name, inicio: Date.now(), pagInicial: 1, pagMax: 1 }  // feature 8
    try { anotKeyRef.current = 'nexus_pr_annot_' + file.name; anotRef.current = JSON.parse(localStorage.getItem(anotKeyRef.current) || '{}') } catch { anotRef.current = {} }
    // metadados (tamanho em escala 1) p/ placeholders — não renderiza nada ainda
    const metas: any[] = []
    for (let i = 1; i <= pdf.numPages; i++) { const pg = await pdf.getPage(i); const vp = pg.getViewport({ scale: 1 }); metas.push({ n: i, w: vp.width, h: vp.height }) }
    metaRef.current = metas
    if (fitRef.current) { const z = calcFit(metas); if (z) { setZoom(z); scaleRef.current = z } }
    requestAnimationFrame(montarPlaceholders)
    onFileLoaded?.(file.name, pdf.numPages)           // feature 4/11: avisa o pai (bookmarks por arquivo)
    salvarRecente({ name: file.name, numPages: pdf.numPages, lastPage: 1 })  // feature 11
    setRecentes(lerRecentes())
    gerarThumbRecente(pdf, file.name)                 // feature 11: miniatura da capa (assíncrona)
  }
  // feature 11: gera uma miniatura pequena da 1ª página e guarda no recente
  const gerarThumbRecente = async (pdf: any, name: string) => {
    try {
      const pg = await pdf.getPage(1); const vp0 = pg.getViewport({ scale: 1 })
      const sc = Math.min(0.5, 150 / vp0.width); const vp = pg.getViewport({ scale: sc })
      const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height)
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise
      const thumb = c.toDataURL('image/jpeg', 0.6)
      const list = lerRecentes(); const r = list.find((x: any) => x.name === name); if (r) { r.thumb = thumb; localStorage.setItem(RECENTS_KEY, JSON.stringify(list)); setRecentes(lerRecentes()) }
    } catch {}
  }
  // feature 8: grava a sessão de leitura corrente no Diário (coleção leituraSessoes), se relevante
  const flushSessao = () => {
    const s = sessaoRef.current; sessaoRef.current = null
    if (!s || !uid) return
    const minutos = Math.round((Date.now() - s.inicio) / 60000)
    const pagMax = Math.max(s.pagMax, maxPageRef.current)
    if (minutos < 1 && pagMax - s.pagInicial < 1) return   // sessão insignificante
    const id = newId()
    try { setDoc(doc(db, 'users', uid, 'leituraSessoes', id), clean({ id, arquivo: s.arquivo.replace(/\.pdf$/i, ''), pagInicio: s.pagInicial, pagFim: pagMax, minutos, data: hojeISO(), criadoEm: Date.now() }), { merge: true }) } catch {}
  }
  const maxPageRef = useRef(1); maxPageRef.current = maxPage
  useEffect(() => { const s = sessaoRef.current; if (s && maxPage > s.pagMax) s.pagMax = maxPage; if (nomeRef.current) atualizarProgressoRecente(nomeRef.current + '.pdf', maxPage, numPages) }, [maxPage, numPages])
  // calcula a escala que faz a página caber na largura da coluna
  const calcFit = (metas = metaRef.current) => {
    const host = wrapRef.current; if (!host || !metas.length) return 0
    const avail = host.clientWidth - 36; const w = Math.max(...metas.map((m: any) => m.w))
    return (w > 0 && avail > 60) ? +Math.max(0.4, Math.min(3, avail / w)).toFixed(3) : 0
  }
  const ajustarLargura = () => { setFitWidth(true); const z = calcFit(); if (z) setZoom(z) }
  const mudarZoom = (delta: number) => { setFitWidth(false); setZoom(z => +Math.max(0.4, Math.min(3, z + delta)).toFixed(2)) }
  const irParaPagina = (n: number) => { const p = Math.max(1, Math.min(numPages || 1, n || 1)); const el = pageElsRef.current[p]; const host = wrapRef.current; if (el && host) { host.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' }); setCurPage(p) } }

  /* ─────────── TEXTO POR PÁGINA / TEXTO COMPLETO (features 1, 3, 5) ─────────── */
  const textoDaPagina = async (n: number): Promise<string> => {
    const pdf = pdfRef.current; if (!pdf) return ''
    if (ocrRef.current[n]?.length) return prNormalize(ocrRef.current[n].map((w: any) => w.text).join(' '))
    try {
      const tc = tcRef.current[n] || await (await pdf.getPage(n)).getTextContent(); tcRef.current[n] = tc
      return prNormalize((tc.items || []).map((it: any) => it.str).join(' '))
    } catch { return '' }
  }
  // texto completo do documento (com marcadores [p. N]) — cacheado p/ o chat
  const obterTextoCompleto = async (): Promise<string> => {
    if (fullTextRef.current) return fullTextRef.current
    const pdf = pdfRef.current; if (!pdf) return ''
    const partes: string[] = []
    for (let n = 1; n <= (pdf.numPages || 0); n++) { const t = await textoDaPagina(n); if (t) partes.push(`[p. ${n}] ${t}`) }
    fullTextRef.current = partes.join('\n\n')
    return fullTextRef.current
  }

  /* ─────────── BUSCA NO DOCUMENTO (feature 3) ─────────── */
  const buscaRef = useRef(busca); buscaRef.current = busca
  const rodarBusca = async (termo: string) => {
    const t = termo.trim()
    if (!t) { setBusca(b => ({ ...b, termo, hits: [], idx: 0 })); pintarBusca([], -1); return }
    setBusca(b => ({ ...b, termo, buscando: true }))
    const pdf = pdfRef.current; if (!pdf) return
    const alvo = t.toLowerCase(); const hits: any[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const txt = (await textoDaPagina(n)).toLowerCase()
      let i = txt.indexOf(alvo)
      while (i !== -1) { hits.push({ page: n }); i = txt.indexOf(alvo, i + alvo.length); if (hits.length > 4000) break }
    }
    setBusca(b => ({ ...b, hits, idx: hits.length ? 0 : -1, buscando: false }))
    if (hits.length) { irParaPagina(hits[0].page); requestAnimationFrame(() => pintarBusca(hits, 0)) }
    else pintarBusca([], -1)
  }
  const navegarBusca = (delta: number) => {
    setBusca(b => {
      if (!b.hits.length) return b
      const idx = (b.idx + delta + b.hits.length) % b.hits.length
      irParaPagina(b.hits[idx].page); requestAnimationFrame(() => pintarBusca(b.hits, idx))
      return { ...b, idx }
    })
  }
  // realça as ocorrências do termo nas camadas de texto renderizadas (overlay por página)
  const pintarBusca = (hits: any[], idxAtivo: number) => {
    const host = wrapRef.current; if (!host) return
    host.querySelectorAll('.pr-search').forEach(e => e.remove())
    const termo = buscaRef.current.termo.trim().toLowerCase(); if (!termo) return
    const ativoPage = idxAtivo >= 0 && hits[idxAtivo] ? hits[idxAtivo].page : -1
    const paginasComHit = new Set(hits.map(h => h.page))
    paginasComHit.forEach(pn => {
      const pageEl = pageElsRef.current[pn]; if (!pageEl) return
      const tl = pageEl.querySelector('.pr-textlayer') as HTMLElement; if (!tl) return
      const layer = document.createElement('div'); layer.className = 'pr-search'; layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2'
      const W = pageEl.clientWidth, H = pageEl.clientHeight; const pr = pageEl.getBoundingClientRect()
      tl.querySelectorAll('span').forEach((span: any) => {
        const node = span.firstChild; const text = (node?.textContent || '').toLowerCase(); if (!text.includes(termo)) return
        let from = 0, i: number
        while ((i = text.indexOf(termo, from)) !== -1) {
          try {
            const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + termo.length)
            const rect = r.getBoundingClientRect()
            const d = document.createElement('div')
            d.style.cssText = `position:absolute;left:${(rect.left - pr.left) / W * 100}%;top:${(rect.top - pr.top) / H * 100}%;width:${rect.width / W * 100}%;height:${rect.height / H * 100}%;background:${pn === ativoPage ? '#ff9632' : '#ffe14d'};opacity:.5;border-radius:2px`
            layer.appendChild(d)
          } catch {}
          from = i + termo.length
        }
      })
      pageEl.appendChild(layer)
    })
  }
  // repinta a busca quando novas páginas entram em tela
  useEffect(() => { if (busca.termo && busca.hits.length) requestAnimationFrame(() => pintarBusca(busca.hits, busca.idx)) }, [curPage, zoom])

  /* ─────────── RESUMO DA PÁGINA (feature 5) ─────────── */
  const resumirPagina = async () => {
    if (resumindo) return
    setResumindo(true)
    try {
      const t = await textoDaPagina(curPageRef.current)
      if (!t) { alert('Esta página não tem texto selecionável. Rode o OCR antes de resumir.'); setResumindo(false); return }
      const r = await resumirIA(t, nomeRef.current)
      onExtract?.(`📝 Resumo — ${nomeRef.current || 'documento'} (p. ${curPageRef.current})\n${r}`, curPageRef.current)
    } catch (e: any) { alert('Falha ao resumir: ' + (e?.message || e)) }
    setResumindo(false)
  }
  // resumir o trecho atualmente selecionado (a partir do pop-up)
  const resumirSelecao = async () => {
    const trecho = popup?.shown; if (!trecho) return
    setPopup(null); acumRef.current = ''; setAcumLen(0)
    try { const r = await resumirIA(trecho, nomeRef.current); onExtract?.(`📝 Resumo da seleção${curPageRef.current ? ` (p. ${curPageRef.current})` : ''}\n${r}`, curPageRef.current) }
    catch (e: any) { alert('Falha ao resumir: ' + (e?.message || e)) }
  }

  // gerar PERGUNTAS do trecho selecionado (reusa o MESMO comando salvo do botão da página)
  const gerarPerguntasSelecao = async () => {
    const trecho = popup?.shown; if (!trecho) return
    if (!qCmdRef.current?.trim()) { setPopup(null); setQEdit(true); return }
    setPopup(null); acumRef.current = ''; setAcumLen(0); setGerandoQ(true)
    try {
      const r = await gerarPerguntasCustomIA(qCmdRef.current, trecho, nomeRef.current)
      onExtract?.(r, curPageRef.current)
    } catch (e: any) { alert('Falha ao gerar perguntas: ' + (e?.message || e)) }
    setGerandoQ(false)
  }

  /* "Não entendi" e Dicionário contextual — abrem um painel de resultado */
  const explicarSelecao = async () => {
    const trecho = popup?.shown; if (!trecho) return
    setPopup(null); acumRef.current = ''; setAcumLen(0)
    setAiPop({ open: true, carregando: true, titulo: '🤔 Explicação detalhada', texto: '', origem: trecho })
    try { const r = await explicarTrechoIA(trecho, nomeRef.current); setAiPop(p => p && { ...p, carregando: false, texto: r }) }
    catch (e: any) { setAiPop(null); alert('Falha: ' + (e?.message || e)) }
  }
  const dicionarioSelecao = async () => {
    const trecho = popup?.shown; if (!trecho) return
    const ctx = nomeRef.current
    setPopup(null); acumRef.current = ''; setAcumLen(0)
    setAiPop({ open: true, carregando: true, titulo: '📖 Dicionário', texto: '', origem: trecho })
    try { const r = await dicionarioIA(trecho, ctx); setAiPop(p => p && { ...p, carregando: false, texto: r }) }
    catch (e: any) { setAiPop(null); alert('Falha: ' + (e?.message || e)) }
  }

  /* ─────────── GERAR PERGUNTAS DA PÁGINA (comando reutilizável) ─────────── */
  const gerarPerguntasPagina = async () => {
    if (gerandoQ) return
    // sem comando salvo ainda → abre o editor antes de gerar
    if (!qCmdRef.current?.trim()) { setQEdit(true); return }
    setGerandoQ(true)
    try {
      const t = await textoDaPagina(curPageRef.current)
      if (!t) { alert('Esta página não tem texto selecionável. Rode o OCR antes de gerar perguntas.'); setGerandoQ(false); return }
      const r = await gerarPerguntasCustomIA(qCmdRef.current, t, nomeRef.current)
      onExtract?.(`❓ Perguntas — ${nomeRef.current || 'documento'} (p. ${curPageRef.current})\n${r}`, curPageRef.current)
    } catch (e: any) { alert('Falha ao gerar perguntas: ' + (e?.message || e)) }
    setGerandoQ(false)
  }

  /* ─────────── CHAT COM O DOCUMENTO (feature 1) ─────────── */
  const enviarChat = async (texto: string) => {
    const q = texto.trim(); if (!q || chat.carregando) return
    setChat(c => ({ ...c, msgs: [...c.msgs, { role: 'user', text: q }], carregando: true }))
    try {
      const ctx = await obterTextoCompleto()
      const resp = await perguntarAoDocIA(ctx, chat.msgs, q)
      setChat(c => ({ ...c, msgs: [...c.msgs, { role: 'assistant', text: resp || '(resposta vazia)' }], carregando: false }))
    } catch (e: any) {
      setChat(c => ({ ...c, msgs: [...c.msgs, { role: 'assistant', text: '⚠ ' + (e?.message || 'falha na IA') }], carregando: false }))
    }
  }

  // expõe ações imperativas ao componente pai (feature 4: ir p/ marcador; feature 6: importar no painel de comparação)
  useEffect(() => { if (viewerApi) viewerApi.current = { gotoPage: irParaPagina, importarArquivo: importar, getNumPages: () => numPages, getCurPage: () => curPageRef.current, getNome: () => nomeRef.current, getPageText: textoDaPagina, getRangeText: async (a: number, b: number) => { const ini = Math.max(1, Math.min(a, b)), fim = Math.min(numPages, Math.max(a, b)); const partes: string[] = []; for (let n = ini; n <= fim; n++) { const t = await textoDaPagina(n); if (t) partes.push(`[p. ${n}] ${t}`) } return partes.join('\n\n') } } })
  // flush da sessão ao desmontar (feature 8)
  useEffect(() => () => flushSessao(), [])
  // feature 3: Ctrl+F abre a busca (só no visualizador principal com PDF carregado)
  useEffect(() => {
    if (secondary) return
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F') && pdfRef.current) { e.preventDefault(); setBusca(b => ({ ...b, open: true })) }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [secondary])
  // feature 8: grava a sessão quando a aba perde visibilidade (sem perder tempo de leitura)
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'hidden') { flushSessao(); if (nomeRef.current) sessaoRef.current = { arquivo: nomeRef.current + '.pdf', inicio: Date.now(), pagInicial: curPageRef.current, pagMax: maxPageRef.current } } }
    document.addEventListener('visibilitychange', onVis); return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

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
      aplicarEditavelTL(tl)
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
    if (modo === 'texto') return   // cursor de texto: deixa a seleção nativa (mouse/teclado) agir
    if (!(e.target as HTMLElement).closest('.pr-page')) return   // só inicia sobre uma página
    // os auxílios de leitura (lupa/máscara/régua/foco) têm pointer-events:none, então
    // a seleção de palavras/trechos continua ativa mesmo com eles ligados.
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
  const aplicarAnotacao = (kind: 'realce' | 'sublinhado' | 'lido', cor?: string) => {
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
  // remove UMA anotação específica (ex.: clicar no selo "OK" para desmarcar a leitura)
  const removerAnot = (page: number, id: string) => {
    const list = anotRef.current[page]; if (!list) return
    anotRef.current[page] = list.filter((a: any) => a.id !== id)
    if (!anotRef.current[page].length) delete anotRef.current[page]
    pintarAnotacoes(); salvarAnot(); forceAnot(x => x + 1)
  }
  // ── CURSOR DE TEXTO: grifa a seleção nativa (ou a palavra sob o cursor) com um toque no Ctrl ──
  const grifoCfgRef = useRef(grifoCfg); useEffect(() => { grifoCfgRef.current = grifoCfg }, [grifoCfg])
  const grifarSelecao = () => {
    const sel = window.getSelection(); if (!sel || sel.rangeCount === 0) return
    // a seleção precisa estar dentro da camada de texto do PDF
    const dentro = (n: Node | null) => !!(n && (n.nodeType === 1 ? (n as HTMLElement) : n.parentElement)?.closest?.('.pr-textlayer'))
    if (!dentro(sel.anchorNode)) return
    let range = sel.getRangeAt(0)
    if (sel.isCollapsed) {
      // caret sem seleção → expande para a palavra inteira sob o cursor
      const node = range.startContainer
      if (node.nodeType === 3) {
        const txt = node.nodeValue || ''; const eW = (c: string) => /[\p{L}\p{N}]/u.test(c || '')
        let i = range.startOffset, j = range.startOffset
        while (i > 0 && eW(txt[i - 1])) i--
        while (j < txt.length && eW(txt[j])) j++
        if (i === j) return
        const r = document.createRange(); r.setStart(node, i); r.setEnd(node, j); range = r
      }
    }
    const rects = Array.from(range.getClientRects()).filter(rc => rc.width > 1 && rc.height > 1)
    if (!rects.length) { sel.removeAllRanges(); return }
    // toggle: se já houver grifo sob o início da seleção, remove
    const rc0 = rects[0]; const cx0 = rc0.left + rc0.width / 2, cy0 = rc0.top + rc0.height / 2
    const pg0 = (document.elementFromPoint(cx0, cy0) as HTMLElement)?.closest('.pr-page') as HTMLElement
    if (pg0) {
      const n = Number(pg0.dataset.page); const pr = pg0.getBoundingClientRect()
      const fxp = (cx0 - pr.left) / pr.width, fyp = (cy0 - pr.top) / pr.height
      const hit = (anotRef.current[n] || []).find((a: any) => a.kind !== 'lido' && a.rects.some((r: any) => fxp >= r.fx && fxp <= r.fx + r.fw && fyp >= r.fy && fyp <= r.fy + r.fh))
      if (hit) { removerAnot(n, hit.id); sel.removeAllRanges(); setPopup(null); return }
    }
    // agrupa os retângulos (um por linha) por página e grava a anotação
    const porPagina: Record<number, any[]> = {}
    for (const rc of rects) {
      const cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2
      const pg = (document.elementFromPoint(cx, cy) as HTMLElement)?.closest('.pr-page') as HTMLElement
      if (!pg) continue
      const n = Number(pg.dataset.page); const pr = pg.getBoundingClientRect()
      ;(porPagina[n] ||= []).push({ fx: (rc.left - pr.left) / pr.width, fy: (rc.top - pr.top) / pr.height, fw: rc.width / pr.width, fh: rc.height / pr.height })
    }
    const cfg = grifoCfgRef.current
    const id = Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    let added = false
    for (const [n, fracs] of Object.entries(porPagina)) {
      if (!pageElsRef.current[Number(n)]) continue
      ;(anotRef.current[Number(n)] ||= []).push({ id, kind: cfg.tipo, cor: cfg.cor, opac: cfg.opac, rects: fracs })
      added = true
    }
    sel.removeAllRanges()
    setPopup(null)
    if (added) { pintarAnotacoes(); salvarAnot(); forceAnot(x => x + 1) }
  }
  // ── modo Texto: seleção nativa (mouse OU teclado) reaproveita o popup de ações do "Selecionar" ──
  const wordsFromSelection = () => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
    const an = sel.anchorNode
    const host = an && (an.nodeType === 1 ? (an as HTMLElement) : an.parentElement)
    if (!host?.closest?.('.pr-textlayer')) return null
    const range = sel.getRangeAt(0)
    const linhas = Array.from(range.getClientRects()).filter(r => r.width > 1 && r.height > 1)
    if (!linhas.length) return null
    const words: any[] = []; const seen = new Set<string>()
    for (const lr of linhas) {
      for (const w of collectInRect({ left: lr.left, top: lr.top, right: lr.right, bottom: lr.bottom }, 'center')) {
        const k = w.page + ':' + Math.round(w.frac.fx * 1000) + ':' + Math.round(w.frac.fy * 1000)
        if (!seen.has(k)) { seen.add(k); words.push(w) }
      }
    }
    if (!words.length) return null
    return { words, texto: prNormalize(sel.toString()), rect: linhas[0] }
  }
  const mostrarPopupSelecao = () => {
    const info = wordsFromSelection()
    if (!info) { setPopup(null); return }
    lastCapRef.current = { words: info.words }
    const acc = acumRef.current; const r = info.rect
    setPopup({ x: (r.left + r.right) / 2, y: Math.max(8, r.top - 8), text: info.texto, shown: acc ? prNormalize(acc + ' ' + info.texto) : info.texto })
  }
  // ── modo Texto: cursor de texto navegável (setas/Enter), grifo por Ctrl e popup só na seleção com mouse ──
  useEffect(() => {
    aplicarEditavelTodas()                         // liga/desliga o cursor de texto nas camadas já renderizadas
    if (modo !== 'texto') { setPopup(null); return }
    const wrap = wrapRef.current

    // torna a camada de texto "somente leitura": permite navegar/selecionar, bloqueia digitar/apagar/colar
    const bloquear = (e: Event) => { e.preventDefault() }
    wrap?.addEventListener('beforeinput', bloquear, true)
    wrap?.addEventListener('paste', bloquear, true)
    wrap?.addEventListener('cut', bloquear, true)
    wrap?.addEventListener('drop', bloquear, true)
    wrap?.addEventListener('dragstart', bloquear, true)

    // Ctrl (toque, sem combinar com outra tecla) grifa a seleção/palavra; Enter move o cursor uma linha abaixo
    let ctrlDown = false, combinou = false
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'Control') { if (!ctrlDown) { ctrlDown = true; combinou = false } return }
      if (ctrlDown) combinou = true
      if (e.key === 'Enter') { e.preventDefault(); const sel = window.getSelection(); if (sel && sel.rangeCount) { try { (sel as any).modify('move', 'forward', 'line') } catch {} } }
    }
    const ku = (e: KeyboardEvent) => { if (e.key === 'Control') { if (ctrlDown && !combinou) grifarSelecao(); ctrlDown = false } }
    document.addEventListener('keydown', kd, true)
    document.addEventListener('keyup', ku, true)

    // popup de ações SOMENTE quando a seleção é feita com o mouse (arraste ou duplo-clique)
    let md: { x: number; y: number; moved: boolean } | null = null
    const onMd = (e: MouseEvent) => { const t = e.target as HTMLElement; if (t?.closest?.('.pr-pop')) return; md = t?.closest?.('.pr-textmode') ? { x: e.clientX, y: e.clientY, moved: false } : null }
    const onMm = (e: MouseEvent) => { if (md && (Math.abs(e.clientX - md.x) > 4 || Math.abs(e.clientY - md.y) > 4)) md.moved = true }
    const onMu = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t?.closest?.('.pr-pop')) { md = null; return }
      const info = md; md = null
      const selecaoMouse = (!!info && info.moved) || e.detail >= 2   // arraste ou duplo-clique
      if (selecaoMouse && t?.closest?.('.pr-textmode')) setTimeout(mostrarPopupSelecao, 0)
      else setTimeout(() => { if (window.getSelection()?.isCollapsed) setPopup(null) }, 0)
    }
    document.addEventListener('mousedown', onMd, true)
    document.addEventListener('mousemove', onMm, true)
    document.addEventListener('mouseup', onMu, true)

    return () => {
      wrap?.removeEventListener('beforeinput', bloquear, true)
      wrap?.removeEventListener('paste', bloquear, true)
      wrap?.removeEventListener('cut', bloquear, true)
      wrap?.removeEventListener('drop', bloquear, true)
      wrap?.removeEventListener('dragstart', bloquear, true)
      document.removeEventListener('keydown', kd, true)
      document.removeEventListener('keyup', ku, true)
      document.removeEventListener('mousedown', onMd, true)
      document.removeEventListener('mousemove', onMm, true)
      document.removeEventListener('mouseup', onMu, true)
    }
  }, [modo])
  // (re)desenha os overlays a partir das frações (independe do zoom)
  const pintarPagina = (el: HTMLElement, n: number) => {
    el.querySelector('.pr-annot')?.remove()
    const list = anotRef.current[n]; if (!list || !list.length) return
    const layer = document.createElement('div'); layer.className = 'pr-annot'
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5'
    const W = el.clientWidth, H = el.clientHeight
    for (const a of list) {
      if (a.kind === 'lido') {
        // marcador "lido": leve faixa verde sobre o trecho + selo OK na margem direita da 1ª linha
        let minY = Infinity
        for (const r of a.rects) {
          const x = r.fx * W, y = r.fy * H, w = r.fw * W, h = r.fh * H
          if (y < minY) minY = y
          const d = document.createElement('div')
          d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#22c55e;opacity:.14;border-radius:2px;`
          layer.appendChild(d)
        }
        const badge = document.createElement('div')
        badge.textContent = 'OK ✕'
        badge.title = 'Lido — clique para remover'
        badge.style.cssText = `position:absolute;right:6px;top:${Math.max(2, minY - 1)}px;background:#16a34a;color:#fff;font:800 10px/1 system-ui,sans-serif;letter-spacing:.04em;padding:4px 7px;border-radius:6px;box-shadow:0 1px 5px rgba(0,0,0,.3);pointer-events:auto;cursor:pointer;`
        badge.onmousedown = (ev) => { ev.stopPropagation(); ev.preventDefault() }
        badge.onclick = (ev) => { ev.stopPropagation(); ev.preventDefault(); removerAnot(n, a.id) }
        layer.appendChild(badge)
        continue
      }
      for (const r of a.rects) {
        const d = document.createElement('div')
        const x = r.fx * W, y = r.fy * H, w = r.fw * W, h = r.fh * H
        if (a.kind === 'sublinhado') d.style.cssText = `position:absolute;left:${x}px;top:${y + h - 2}px;width:${w}px;height:2.5px;background:${a.cor};opacity:${a.opac ?? 1};border-radius:2px;`
        else d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${a.cor};opacity:${a.opac ?? 0.42};mix-blend-mode:multiply;border-radius:2px;`
        layer.appendChild(d)
      }
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
        <label style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
          ↥ Importar PDF<input ref={fileInputRef} type="file" accept="application/pdf" hidden onChange={e => e.target.files?.[0] && importar(e.target.files[0])} />
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
            <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 60, width: 190, padding: 6, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.25)' }}>
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

        {/* ── grupos consolidados em menus suspensos (passe o mouse para abrir) ── */}
        {/* Marcar (selecionar / realçar) */}
        <HoverMenu align="left" width={300} active={modo !== 'selecionar'} trigger={<><span>🖊</span> Marcar</>}>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <button onClick={() => setModo('selecionar')} title="Selecionar palavra(s) → enviar ao editor" style={{ height: 30, padding: '0 9px', border: 'none', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 700, background: modo === 'selecionar' ? '#5b5bd6' : 'var(--surface)', color: modo === 'selecionar' ? '#fff' : 'var(--text-secondary)' }}>✛ Selecionar</button>
            <button onClick={() => setModo('realcar')} title="Realçar / sublinhar com o retângulo (arraste)" style={{ height: 30, padding: '0 9px', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 700, background: modo === 'realcar' ? '#5b5bd6' : 'var(--surface)', color: modo === 'realcar' ? '#fff' : 'var(--text-secondary)' }}>🖊 Realçar</button>
            <button onClick={() => setModo('texto')} title="Cursor de texto — seleção com mouse/teclado abre o menu de ações (enviar ao editor, etc.) e o toque no Ctrl grifa" style={{ height: 30, padding: '0 9px', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 700, background: modo === 'texto' ? '#5b5bd6' : 'var(--surface)', color: modo === 'texto' ? '#fff' : 'var(--text-secondary)' }}>✏️ Texto</button>
          </div>
          {modo === 'realcar' && <>
            <button onClick={() => setTipoMarca('realce')} title="Realce" style={{ ...btn, width: 'auto', padding: '0 7px', background: tipoMarca === 'realce' ? '#5b5bd6' : 'var(--surface)', color: tipoMarca === 'realce' ? '#fff' : 'var(--text-secondary)' }}>✎</button>
            <button onClick={() => setTipoMarca('sublinhado')} title="Sublinhado" style={{ ...btn, width: 'auto', padding: '0 7px', background: tipoMarca === 'sublinhado' ? '#5b5bd6' : 'var(--surface)', color: tipoMarca === 'sublinhado' ? '#fff' : 'var(--text-secondary)' }}><u>S</u></button>
            {PALETA_REALCE.map(c => <button key={c} onClick={() => setCorRealce(c)} title="Cor do realce" style={{ width: 22, height: 22, borderRadius: 5, border: corRealce === c ? '2px solid var(--text-primary)' : '1px solid var(--border)', background: c, cursor: 'pointer' }} />)}
          </>}
          {modo === 'texto' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 2 }}>
              <div style={{ fontSize: '.72rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                <b>Clique</b> no texto para posicionar o cursor; use as <b>setas</b> e <b>Enter</b> para mover e <b>Shift + setas</b> para selecionar (ou selecione com o <b>mouse</b>). Dê um <b>toque no Ctrl</b> para <b>grifar</b> a seleção (sem seleção, grifa a palavra do cursor). Tocar o Ctrl sobre um grifo o <b>remove</b>. A seleção com o mouse abre o menu de ações.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', width: 46 }}>Estilo</span>
                <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <button onClick={() => setGrifoCfg(c => ({ ...c, tipo: 'realce' }))} style={{ height: 28, padding: '0 10px', border: 'none', cursor: 'pointer', fontSize: '.72rem', fontWeight: 700, background: grifoCfg.tipo === 'realce' ? '#5b5bd6' : 'var(--surface)', color: grifoCfg.tipo === 'realce' ? '#fff' : 'var(--text-secondary)' }}>Marca-texto</button>
                  <button onClick={() => setGrifoCfg(c => ({ ...c, tipo: 'sublinhado' }))} style={{ height: 28, padding: '0 10px', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer', fontSize: '.72rem', fontWeight: 700, background: grifoCfg.tipo === 'sublinhado' ? '#5b5bd6' : 'var(--surface)', color: grifoCfg.tipo === 'sublinhado' ? '#fff' : 'var(--text-secondary)' }}>Linha</button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', width: 46, paddingTop: 4 }}>Cor</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 5, flex: 1 }}>
                  {PALETA_GRIFO.map(c => <button key={c} onClick={() => setGrifoCfg(cfg => ({ ...cfg, cor: c }))} title={c} style={{ width: 24, height: 24, borderRadius: 5, border: grifoCfg.cor === c ? '2px solid var(--text-primary)' : '1px solid var(--border)', background: c, cursor: 'pointer' }} />)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', width: 46 }}>Opacidade</span>
                <input type="range" min={0.12} max={1} step={0.02} value={grifoCfg.opac} onChange={e => setGrifoCfg(c => ({ ...c, opac: Number(e.target.value) }))} style={{ flex: 1 }} />
                <span style={{ fontSize: '.66rem', color: 'var(--text-muted)', width: 34, textAlign: 'right' }}>{Math.round(grifoCfg.opac * 100)}%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', width: 46 }}>Amostra</span>
                <span style={{ position: 'relative', fontSize: '.82rem', color: 'var(--text-primary)', padding: '1px 3px' }}>
                  <span style={{ position: 'absolute', inset: 0, borderRadius: 2, ...(grifoCfg.tipo === 'sublinhado' ? { top: 'auto', height: 2.5, background: grifoCfg.cor, opacity: grifoCfg.opac } : { background: grifoCfg.cor, opacity: grifoCfg.opac, mixBlendMode: 'multiply' as any }) }} />
                  <span style={{ position: 'relative' }}>texto de exemplo</span>
                </span>
              </div>
            </div>
          )}
          <button onClick={limparAnotacoes} title="Limpar realces deste PDF" style={{ ...btn, width: 'auto', padding: '0 8px' }}>🧽 Limpar</button>
        </HoverMenu>

        {/* Leitura (auxílios) */}
        <HoverMenu align="left" width={280} active={ferramenta !== 'none'} trigger={<><span>👁</span> Leitura</>}>
          <Tool id="lupa" title="Lupa"><Icon e="🔍" size={15} /></Tool>
          <Tool id="mascara" title="Máscara de leitura">▭</Tool>
          <Tool id="regua" title="Régua de acompanhamento">▬</Tool>
          <Tool id="foco" title="Foco dinâmico">◎</Tool>
          <Tool id="linha" title="Barra de leitura azul (ajuste a altura com os botões ou Shift+rolagem)"><span style={{ display: 'inline-block', width: 15, height: 6, borderRadius: 2, background: 'linear-gradient(90deg,#60a5fa,#93c5fd)' }} /></Tool>
          <Tool id="forma" title="Cursor-forma preto que segue o mouse (vários formatos, ajustável)"><span style={{ display: 'inline-block', width: 12, height: 12, background: '#111', borderRadius: 2 }} /></Tool>
          {ferramenta === 'linha' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <button onClick={() => setLinhaH(h => Math.max(12, h - 4))} title="Diminuir a faixa" style={{ width: 24, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 800 }}>−</button>
              <span style={{ fontSize: '.68rem', color: 'var(--text-muted)', minWidth: 30, textAlign: 'center' }}>{linhaH}px</span>
              <button onClick={() => setLinhaH(h => Math.min(120, h + 4))} title="Aumentar a faixa" style={{ width: 24, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 800 }}>＋</button>
            </span>
          )}
          {ferramenta === 'forma' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 2 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {FORMAS.map(fo => (
                  <button key={fo.id} onClick={() => setFormaTipo(fo.id)} title={fo.nome} style={{ width: 30, height: 30, borderRadius: 7, cursor: 'pointer', fontSize: '0.95rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: formaTipo === fo.id ? 'none' : '1px solid var(--border)', background: formaTipo === fo.id ? '#5b5bd6' : 'var(--surface)', color: formaTipo === fo.id ? '#fff' : 'var(--text-secondary)' }}>{fo.icone}</button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '.68rem', color: 'var(--text-muted)', width: 46 }}>Largura</span>
                <input type="range" min={8} max={400} value={formaW} onChange={e => setFormaW(Number(e.target.value))} style={{ flex: 1 }} />
                <span style={{ fontSize: '.66rem', color: 'var(--text-muted)', width: 40, textAlign: 'right' }}>{formaW}px</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '.68rem', color: 'var(--text-muted)', width: 46 }}>Altura</span>
                <input type="range" min={8} max={400} value={formaH} onChange={e => setFormaH(Number(e.target.value))} style={{ flex: 1 }} />
                <span style={{ fontSize: '.66rem', color: 'var(--text-muted)', width: 40, textAlign: 'right' }}>{formaH}px</span>
              </div>
            </div>
          )}
        </HoverMenu>

        {!secondary && (
          <HoverMenu align="left" width={250} trigger={<><span>🧠</span> IA</>}>
            <button onClick={resumirPagina} disabled={!numPages || resumindo} title="Resumir esta página (IA) → painel de notas" style={{ ...btn, width: 'auto', padding: '0 8px' }}>{resumindo ? <><span className="nx-spin">⏳</span> Resumindo…</> : '🧠 Resumir'}</button>
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              <button onClick={gerarPerguntasPagina} disabled={!numPages || gerandoQ} title="Gerar perguntas desta página (IA) com seu comando salvo → painel de notas" style={{ ...btn, width: 'auto', padding: '0 8px', borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>{gerandoQ ? <><span className="nx-spin">⏳</span> Gerando…</> : '❓ Perguntas'}</button>
              <button onClick={() => setQEdit(true)} disabled={!numPages} title="Editar o comando das perguntas (define o estilo/estrutura)" style={{ ...btn, width: 26, padding: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: 'none' }}>✎</button>
            </span>
            <button onClick={() => setChat(c => ({ ...c, open: !c.open }))} disabled={!numPages} title="Conversar com o documento (IA)" style={{ ...btn, width: 'auto', padding: '0 8px', background: chat.open ? '#5b5bd6' : 'var(--surface)', color: chat.open ? '#fff' : 'var(--text-secondary)', border: chat.open ? 'none' : '1px solid var(--border)' }}>💬 Chat</button>
            <button onClick={() => setToggleOpen(true)} title="Toggle — blocos aninhados estilo Notion (janela redimensionável)" style={{ ...btn, width: 'auto', padding: '0 10px', fontWeight: 800 }}>🔀 Toggle</button>
          </HoverMenu>
        )}

        {/* Mais (ferramentas) */}
        <HoverMenu align="left" width={250} trigger={<><span>⋯</span> Mais</>}>
          <button onClick={() => ocrPagina(curPage)} disabled={!numPages || ocrStatus?.running} title="Reconhecer texto desta página (OCR) — para PDFs digitalizados/imagem" style={{ ...btn, width: 'auto', padding: '0 10px', background: paginaImagem && !ocrStatus?.running ? '#EA580C' : 'var(--surface)', color: paginaImagem && !ocrStatus?.running ? '#fff' : 'var(--text-secondary)', border: paginaImagem && !ocrStatus?.running ? 'none' : '1px solid var(--border)', whiteSpace: 'nowrap' }}>{ocrStatus?.running ? `OCR… ${ocrStatus.pct}%` : '🔎 OCR'}</button>
          <button onClick={() => setBusca(b => ({ ...b, open: !b.open }))} disabled={!numPages} title="Buscar no documento (Ctrl+F)" style={{ ...btn, width: 'auto', padding: '0 8px', background: busca.open ? '#5b5bd6' : 'var(--surface)', color: busca.open ? '#fff' : 'var(--text-secondary)', border: busca.open ? 'none' : '1px solid var(--border)' }}>🔎 Buscar</button>
          <button onClick={() => setThumbsOpen(o => !o)} disabled={!numPages} title="Miniaturas das páginas" style={{ ...btn, width: 'auto', padding: '0 8px', background: thumbsOpen ? '#5b5bd6' : 'var(--surface)', color: thumbsOpen ? '#fff' : 'var(--text-secondary)', border: thumbsOpen ? 'none' : '1px solid var(--border)' }}>▦ Miniaturas</button>
          {!secondary && <>
            <button onClick={() => onAddBookmark?.(curPageRef.current)} disabled={!numPages} title="Marcar esta página (bookmark)" style={{ ...btn, width: 'auto', padding: '0 8px' }}>🔖 Marcar pág.</button>
            <button onClick={onToggleFoco} disabled={!numPages} title="Modo foco / leitura imersiva (oculta painéis)" style={{ ...btn, width: 'auto', padding: '0 8px', background: foco ? '#5b5bd6' : 'var(--surface)', color: foco ? '#fff' : 'var(--text-secondary)', border: foco ? 'none' : '1px solid var(--border)' }}>⛶ Foco</button>
            <button onClick={() => setReader(true)} disabled={!numPages} title="Modo Reader — texto limpo e reflowável (efeito Kindle)" style={{ ...btn, width: 'auto', padding: '0 8px' }}>📖 Reader</button>
          </>}
        </HoverMenu>

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

        {/* timer / pomodoro / cronômetro (sempre visível na toolbar) */}
        <span style={{ width: 1, height: 22, background: 'var(--border)' }} />
        <TimerWidget />

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
      <div ref={viewBoxRef} onWheel={e => { if (ferramenta === 'linha' && e.shiftKey) { e.preventDefault(); setLinhaH(h => Math.min(120, Math.max(12, h - Math.sign(e.deltaY) * 4))) } }} style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {/* indicador global: IA trabalhando (resumo/perguntas) */}
        {(resumindo || gerandoQ) && (
          <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 70, pointerEvents: 'none' }}>
            <span className="nx-ia-badge"><span className="nx-spin" style={{ fontSize: '1rem' }}>⏳</span> {resumindo ? 'Resumindo a página…' : 'Gerando perguntas…'}</span>
          </div>
        )}
        {/* feature 12: indicador de progresso de leitura */}
        {numPages > 0 && (
          <div title={`Página ${curPage} de ${numPages} — ${Math.round((maxPage / numPages) * 100)}% lido`}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, zIndex: 47, background: 'var(--surface)' }}>
            <div style={{ height: '100%', width: `${(maxPage / numPages) * 100}%`, background: 'linear-gradient(90deg,#5b5bd6,#8b5cf6)', transition: 'width .25s' }} />
            <div style={{ position: 'absolute', left: `calc(${(curPage / numPages) * 100}% - 1px)`, top: 0, width: 2, height: '100%', background: '#ff9632' }} />
          </div>
        )}
        {/* feature 3: barra de busca */}
        {busca.open && numPages > 0 && (
          <div style={{ position: 'absolute', top: 12, right: 14, zIndex: 60, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.28)' }}>
            <input autoFocus value={busca.termo} placeholder="Buscar no PDF…"
              onChange={e => setBusca(b => ({ ...b, termo: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') { if (busca.hits.length && busca.termo === buscaRef.current.termo) navegarBusca(e.shiftKey ? -1 : 1); else rodarBusca(busca.termo) } if (e.key === 'Escape') { setBusca(b => ({ ...b, open: false })); pintarBusca([], -1) } }}
              style={{ width: 180, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.82rem', padding: '5px 8px', borderRadius: 7, outline: 'none' }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: 56, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{busca.buscando ? '…' : busca.hits.length ? `${busca.idx + 1}/${busca.hits.length}` : (busca.termo ? '0' : '')}</span>
            <button onClick={() => navegarBusca(-1)} disabled={!busca.hits.length} style={{ ...btn, width: 26 }}>▲</button>
            <button onClick={() => navegarBusca(1)} disabled={!busca.hits.length} style={{ ...btn, width: 26 }}>▼</button>
            <button onClick={() => { setBusca(b => ({ ...b, open: false })); pintarBusca([], -1) }} style={{ ...btn, width: 26 }}>✕</button>
          </div>
        )}
        {/* feature 9: tira de miniaturas (colapsável) */}
        {thumbsOpen && numPages > 0 && (
          <ThumbStrip pdf={pdfRef.current} numPages={numPages} curPage={curPage} onGo={irParaPagina} />
        )}
        {/* linha do tempo de leitura + dificuldade */}
        {numPages > 0 && !foco && !secondary && (
          <BarraLeitura numPages={numPages} curPage={curPage} fileKey={nome || 'doc'} gotoPage={irParaPagina} getPageText={textoDaPagina} onHeight={setBarraH} />
        )}
        {/* Modo Reader (overlay com texto limpo) */}
        {reader && numPages > 0 && (
          <ReaderMode numPages={numPages} startPage={curPageRef.current} getPageText={textoDaPagina} nome={nome} onClose={() => setReader(false)} />
        )}
        <div ref={wrapRef} onMouseDown={onDown} onScroll={onScroll} className={modo === 'texto' ? 'pr-textmode' : undefined}
          style={{ position: 'absolute', top: numPages && !foco && !secondary ? barraH : 0, bottom: 0, left: thumbsOpen && numPages ? 120 : 0, right: chat.open && numPages ? 332 : 0, overflow: 'auto', padding: foco ? '40px 8%' : 18, background: foco ? 'var(--card-bg)' : 'var(--bg-subtle, #1112)', transition: 'padding .25s', ['--pr-filter' as any]: tomFilter(tom) }}>
          {!numPages && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, color: 'var(--text-muted)', fontSize: '0.9rem', padding: 20 }}>
              <div>Importe um PDF para começar a leitura.</div>
              {/* feature 11: documentos recentes */}
              {recentes.length > 0 && (
                <div style={{ width: '100%', maxWidth: 560 }}>
                  <div style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 10, textAlign: 'center' }}>Abertos recentemente</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 12 }}>
                    {recentes.slice(0, 5).map((r: any) => {
                      const pct = r.numPages ? Math.round(((r.lastPage || 0) / r.numPages) * 100) : 0
                      return (
                        <div key={r.name} onClick={() => fileInputRef.current?.click()} title={`${r.name}\nClique para reimportar (o PDF não fica salvo por privacidade)`}
                          style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 5, padding: 6, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', textAlign: 'left' }}>
                          <span onClick={e => { e.stopPropagation(); setRecentes(removerRecente(r.name)) }} title="Remover do histórico"
                            style={{ position: 'absolute', top: 3, right: 3, zIndex: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 12, fontWeight: 800, lineHeight: '18px', textAlign: 'center', cursor: 'pointer' }}>×</span>
                          <div style={{ width: '100%', aspectRatio: '0.72', borderRadius: 5, overflow: 'hidden', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {r.thumb ? <img src={r.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 22 }}>📄</span>}
                          </div>
                          <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name.replace(/\.pdf$/i, '')}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ flex: 1, height: 4, borderRadius: 3, background: 'var(--surface)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: '#5b5bd6' }} /></div>
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{pct}%</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>Por privacidade, o NexusOS não guarda o arquivo — só o histórico. Clique para reimportar.</div>
                </div>
              )}
            </div>
          )}
        </div>
        {/* feature 1: chat com o documento (drawer lateral direito) */}
        {chat.open && numPages > 0 && (
          <ChatDocumento chat={chat} onEnviar={enviarChat} onClose={() => setChat(c => ({ ...c, open: false }))} onLimpar={() => setChat(c => ({ ...c, msgs: [] }))} onInserir={(t: string) => onExtract?.(t, curPageRef.current)} />
        )}
        {/* editor do comando de perguntas (salvo e reutilizado em todas as páginas) */}
        {qEdit && createPortal(<>
          <div onMouseDown={() => setQEdit(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9200 }} />
          <div className="pr-pop" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 9201, width: 'min(560px,95vw)', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.45)', padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
              <span style={{ fontSize: '1.1rem' }}>❓</span><b style={{ color: 'var(--text-primary)' }}>Comando das perguntas</b>
              <span style={{ flex: 1 }} /><button onMouseDown={e => { e.preventDefault(); setQEdit(false) }} style={btn}>✕</button>
            </div>
            <div style={{ fontSize: '.74rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
              Descreva como a IA deve montar as perguntas. Fica salvo e é reaplicado em <b>cada página</b> com um clique em <b>❓ Perguntas</b> — você só troca de página e clica, sem redigitar.
            </div>
            <textarea value={qCmd} onChange={e => setQCmd(e.target.value)} rows={6} placeholder="Ex.: Transforme todo o conteúdo da página em perguntas para estudo ativo, sem deixar nada de fora, o máximo possível, apenas as perguntas (sem respostas), numeradas."
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.85rem', padding: '10px 12px', borderRadius: 10, outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <button onMouseDown={e => { e.preventDefault(); setQCmd(QCMD_PADRAO) }} style={{ ...btn, width: 'auto', padding: '0 10px', fontSize: '.74rem' }}>↺ Padrão</button>
              <span style={{ flex: 1 }} />
              <button onMouseDown={e => { e.preventDefault(); salvarComandoPerguntas(qCmd); setQEdit(false) }} style={{ ...btn, width: 'auto', padding: '0 12px' }}>Salvar</button>
              <button onMouseDown={e => { e.preventDefault(); salvarComandoPerguntas(qCmd); setQEdit(false); setTimeout(gerarPerguntasPagina, 0) }} disabled={!numPages} style={{ height: 32, padding: '0 14px', borderRadius: 8, border: 'none', background: '#5b5bd6', color: '#fff', fontWeight: 700, fontSize: '.84rem', cursor: 'pointer' }}>Salvar e gerar agora</button>
            </div>
          </div>
        </>, document.body)}
        {/* régua (confinada à coluna do PDF) */}
        {ferramenta === 'regua' && <div style={{ position: 'absolute', left: 0, right: 0, top: pos.y, height: 2, background: '#5b5bd6cc', pointerEvents: 'none', zIndex: 40 }} />}
        {/* barra de leitura: faixa azul suave de uma linha, seguindo o cursor (altura ajustável) */}
        {ferramenta === 'linha' && <div style={{ position: 'absolute', left: 0, right: 0, top: pos.y - linhaH / 2, height: linhaH, background: 'linear-gradient(90deg, rgba(96,165,250,.16), rgba(147,197,253,.26), rgba(96,165,250,.16))', borderTop: '1px solid rgba(59,130,246,.35)', borderBottom: '1px solid rgba(59,130,246,.35)', pointerEvents: 'none', zIndex: 40 }} />}
        {/* cursor-forma preto: segue o mouse, ajustável em largura/altura, vários formatos */}
        {ferramenta === 'forma' && (() => {
          const base: React.CSSProperties = { position: 'absolute', left: pos.x - formaW / 2, top: pos.y - formaH / 2, width: formaW, height: formaH, pointerEvents: 'none', zIndex: 41, opacity: 0.82 }
          if (formaTipo === 'lapis') return (
            <svg style={base} viewBox="0 0 24 24" fill="#111" xmlns="http://www.w3.org/2000/svg"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
          )
          if (formaTipo === 'mao') return (
            <svg style={base} viewBox="0 0 24 24" fill="#111" xmlns="http://www.w3.org/2000/svg"><path d="M23 5.5V20c0 2.2-1.8 4-4 4h-7.3c-1.08 0-2.1-.43-2.85-1.19L1 14.83s1.26-1.23 1.3-1.25c.22-.19.49-.29.79-.29.22 0 .42.06.6.16.04.01 4.31 2.46 4.31 2.46V4c0-.83.67-1.5 1.5-1.5S12 3.17 12 4v7h1V1.5c0-.83.67-1.5 1.5-1.5S16 .67 16 1.5V11h1V2.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5V11h1V5.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5z" /></svg>
          )
          if (formaTipo === 'moldura') return <div style={{ ...base, opacity: 0.92, background: 'transparent', border: '2.5px solid #111', borderRadius: 4 }} />
          const clip: Record<string, string> = {
            triangulo: 'polygon(50% 0,0% 100%,100% 100%)',
            'triangulo-dir': 'polygon(0 0,100% 50%,0 100%)',
            'seta-dir': 'polygon(0 32%,62% 32%,62% 8%,100% 50%,62% 92%,62% 68%,0 68%)',
            'seta-cima': 'polygon(50% 0,100% 42%,68% 42%,68% 100%,32% 100%,32% 42%,0 42%)',
          }
          const cp = clip[formaTipo]
          const radius = formaTipo === 'circulo' ? '50%' : formaTipo === 'quadrado' ? 4 : 3
          return <div style={{ ...base, background: '#111', borderRadius: cp ? 0 : radius, clipPath: cp || 'none' }} />
        })()}
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
        <div className="pr-pop" style={{ position: 'fixed', left: popupPos.x, top: popupPos.y, zIndex: 6501, display: 'flex', flexDirection: 'column', gap: 10, padding: 14, background: 'color-mix(in srgb, var(--card-bg) 80%, transparent)', backdropFilter: 'blur(16px) saturate(1.3)', WebkitBackdropFilter: 'blur(16px) saturate(1.3)', border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)', borderRadius: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.4)', width: 344 }}>
          {/* cabeçalho */}
          <div onMouseDown={arrastarPopup} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'move', userSelect: 'none' }}>
            <b style={{ fontSize: '.96rem', fontWeight: 600, letterSpacing: '.03em', fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', background: 'linear-gradient(120deg,#7c3aed,#5b5bd6 55%,#0891b2)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>Captura e Inteligência</b>
            {acumLen > 0 && <span style={{ fontSize: '.58rem', fontWeight: 800, color: '#7c3aed', background: 'rgba(124,58,237,.12)', padding: '2px 6px', borderRadius: 8 }}>compondo</span>}
            <span style={{ flex: 1 }} />
            <button onMouseDown={e => { e.preventDefault(); acumRef.current = ''; setAcumLen(0); setPopup(null); lastCapRef.current = null }} title="Fechar" style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: 2 }}>✕</button>
          </div>
          {/* área de texto capturado */}
          <div style={{ position: 'relative', background: 'color-mix(in srgb, var(--surface) 70%, transparent)', border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)', borderRadius: 12, padding: '9px 11px' }}>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', lineHeight: 1.45, maxHeight: 88, overflowY: 'auto', paddingRight: 22 }}>{popup.shown}</div>
            <button onMouseDown={e => { e.preventDefault(); try { navigator.clipboard?.writeText(popup.shown); setCopiado(true); setTimeout(() => setCopiado(false), 1200) } catch {} }} title="Copiar texto" style={{ position: 'absolute', top: 7, right: 7, border: 'none', background: 'transparent', color: copiado ? '#16a34a' : 'var(--text-muted)', cursor: 'pointer', fontSize: '.82rem' }}>{copiado ? '✓' : '⧉'}</button>
            <div style={{ textAlign: 'right', fontSize: '.6rem', color: 'var(--text-muted)', marginTop: 4 }}>{(popup.shown || '').length} caracteres</div>
          </div>
          {/* 4 ações de IA (cards) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {[
              { lbl: ['Palavras-', 'Chave'], ic: '🏷️', grad: 'linear-gradient(155deg,#d8f6ef,#a9e6db)', fg: '#0f766e', on: () => pedirPalavrasChave() },
              { lbl: ['Resumo', ''], ic: '📖', grad: 'linear-gradient(155deg,#e4e9ff,#c5cffb)', fg: '#4338ca', on: () => resumirSelecao() },
              { lbl: ['Flashcards', ''], ic: '🗂️', grad: 'linear-gradient(155deg,#ffeede,#fdd6ad)', fg: '#c2410c', on: () => { const t = popup?.shown; setPopup(null); acumRef.current = ''; setAcumLen(0); if (t) onGerarFlashcard?.(t, nomeRef.current) } },
              { lbl: ['Mapa', 'Mental'], ic: null, grad: 'linear-gradient(155deg,#efeafe,#dccffb)', fg: '#6d28d9', on: () => { const t = popup?.shown; setPopup(null); acumRef.current = ''; setAcumLen(0); if (t) onColetarMapa?.(t, curPageRef.current) } },
            ].map((c, i) => (
              <button key={i} className="pr-card" onMouseDown={e => { e.preventDefault(); c.on() }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '13px 4px', border: 'none', borderRadius: 14, background: c.grad, color: c.fg, cursor: 'pointer', boxShadow: '0 3px 9px rgba(0,0,0,.08)' }}>
                <span style={{ fontSize: '1.25rem', lineHeight: 1, filter: 'saturate(.9)' }}>{c.ic || <IconMapa size={22} color={c.fg} />}</span>
                <span style={{ fontSize: '.64rem', fontWeight: 800, lineHeight: 1.12, textAlign: 'center' }}>{c.lbl[0]}{c.lbl[1] ? <><br />{c.lbl[1]}</> : null}</span>
              </button>
            ))}
          </div>
          {/* perguntas da seleção (mesmo comando do botão da página) */}
          <button onMouseDown={e => { e.preventDefault(); gerarPerguntasSelecao() }} disabled={gerandoQ} style={{ ...popBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'linear-gradient(135deg,#7c3aed,#5b5bd6)', color: '#fff', fontWeight: 800, opacity: gerandoQ ? 0.6 : 1 }}>{gerandoQ ? '⏳ Gerando…' : '❓ Gerar Perguntas (da seleção)'}</button>
          {/* enviar + dicionário */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onMouseDown={e => { e.preventDefault(); enviar() }} style={{ ...popBtn, flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700 }}>✉️ Enviar p/ Palavras Destacadas</button>
            <button onMouseDown={e => { e.preventDefault(); dicionarioSelecao() }} style={{ ...popBtn, flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700 }}>📖 Dicionário</button>
          </div>
          {/* marcar como lido (selo OK) */}
          <button onMouseDown={e => { e.preventDefault(); aplicarAnotacao('lido'); setPopup(null) }} title="Marca este trecho como já lido/transformado em leitura (selo OK na margem)" style={{ ...popBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'rgba(34,197,94,.12)', border: '1px solid #16a34a55', color: '#16a34a', fontWeight: 700 }}>✓ Marcar como lido (OK)</button>
          {/* não entendi */}
          <button onMouseDown={e => { e.preventDefault(); explicarSelecao() }} style={{ ...popBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'var(--surface)', fontWeight: 700, color: 'var(--text-secondary)' }}><span style={{ display: 'inline-flex', width: 18, height: 18, borderRadius: '50%', background: '#0e7490', color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem' }}>?</span> Não Entendi?</button>
          {/* continuar composição */}
          <button onMouseDown={e => { e.preventDefault(); compor() }} style={{ ...popBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'transparent', color: 'var(--text-muted)', fontWeight: 600 }}>✎ Continuar Composição de Texto</button>
        </div>
      </>, document.body)}

      {!secondary && <ToggleNotion open={toggleOpen} onClose={() => setToggleOpen(false)} />}

      {/* painel de resultado: "Não entendi" / Dicionário */}
      {aiPop?.open && createPortal(<>
        <div onMouseDown={() => setAiPop(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9550 }} />
        <div className="pr-pop" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 9551, width: 'min(560px,95vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.45)', padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
            <b style={{ color: 'var(--text-primary)', fontSize: '.98rem' }}>{aiPop.titulo}</b>
            <span style={{ flex: 1 }} /><button onMouseDown={e => { e.preventDefault(); setAiPop(null) }} style={btn}>✕</button>
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 10, maxHeight: 54, overflow: 'auto', borderLeft: '3px solid var(--border)', paddingLeft: 8 }}>"{aiPop.origem.slice(0, 220)}{aiPop.origem.length > 220 ? '…' : ''}"</div>
          {aiPop.carregando ? (
            <div style={{ padding: '34px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Consultando a IA…</div>
          ) : (<>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', marginBottom: 12 }}>{aiPop.texto}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onMouseDown={e => { e.preventDefault(); onExtract?.(`${aiPop.titulo} (p. ${curPageRef.current})\n${aiPop.texto}`, curPageRef.current); setAiPop(null) }} style={{ ...btn, width: 'auto', padding: '0 12px' }}>➜ Inserir nas notas</button>
              <button onMouseDown={e => { e.preventDefault(); setAiPop(null) }} style={{ height: 32, padding: '0 16px', borderRadius: 8, border: 'none', background: '#5b5bd6', color: '#fff', fontWeight: 700, fontSize: '.84rem', cursor: 'pointer' }}>Fechar</button>
            </div>
          </>)}
        </div>
      </>, document.body)}

      {/* REVISÃO DAS PALAVRAS-CHAVE (IA) — confirme antes de enviar ao editor */}
      {kw && createPortal(<>
        <div onMouseDown={() => setKw(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 8200 }} />
        <div className="pr-pop" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 8201, width: 'min(440px,94vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,.42)', padding: 16 }}>
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
function PastasSidebar({ open, onToggle, store, docId, onOpenDoc, onNewDoc, bookmarks = [], pdfNome, onGotoBookmark, onRemoveBookmark }: any) {
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
      {/* feature 4: marcadores de página do PDF aberto */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', maxHeight: '40%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px' }}>
          <b style={{ fontSize: '0.74rem', color: 'var(--text-primary)' }}>🔖 Marcadores</b>
          <span style={{ flex: 1 }} />
          {pdfNome && <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>{pdfNome.replace(/\.pdf$/i, '')}</span>}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 6px 8px' }}>
          {!pdfNome && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '4px 8px' }}>Abra um PDF para usar marcadores.</div>}
          {pdfNome && bookmarks.length === 0 && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '4px 8px' }}>Use 🔖 na barra do PDF para marcar a página atual.</div>}
          {bookmarks.map((b: any) => (
            <div key={b.id} className="pr-row" style={{ paddingLeft: 8 }}>
              <span onClick={() => onGotoBookmark?.(b.page)} style={{ flex: 1, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`Ir para a página ${b.page}`}>
                <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#5b5bd6', background: 'rgba(91,91,214,.12)', borderRadius: 5, padding: '1px 5px', flexShrink: 0 }}>p.{b.page}</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.rotulo}</span>
              </span>
              <span className="pr-acts"><button title="Remover marcador" onClick={() => onRemoveBookmark?.(b.id)} style={miniBtn}>🗑</button></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════ MODAL PRÉ-VISUALIZAÇÃO DE IMPRESSÃO ═══════════════════════════════ */
function PreviaImpressao({ html, titulo, onClose }: any) {
  const slug = (titulo || 'palavras_destacadas').replace(/[^\w\-]+/g, '_')
  const exportarWord = () => download(`${slug}.doc`, wordDoc(html, titulo), 'application/msword;charset=utf-8')
  const exportarMd = () => download(`${slug}.md`, `# ${(titulo || 'Palavras Destacadas')}\n\n${htmlToMarkdown(html)}`, 'text/markdown;charset=utf-8')   // feature 7
  const imprimirPDF = () => {
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(wordDoc(html, titulo)); w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
  }
  return createPortal(<>
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 8000 }} />
    <div className="pr-pop" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 8001, width: 'min(840px,94vw)', height: 'min(640px,90vh)', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <b style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>🖨️ Pré-visualização / Exportar</b>
        <span style={{ flex: 1 }} />
        <button onClick={imprimirPDF} style={{ ...btn, width: 'auto', padding: '0 12px', background: '#5b5bd6', color: '#fff', border: 'none' }}>⬇ PDF / Imprimir</button>
        <button onClick={exportarWord} style={{ ...btn, width: 'auto', padding: '0 12px' }}>⬇ Word (.docx)</button>
        <button onClick={exportarMd} style={{ ...btn, width: 'auto', padding: '0 12px' }}>⬇ Markdown (.md)</button>
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
    <div className="pr-pop" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 8001, width: 'min(460px,94vw)', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,.4)', padding: 18 }}>
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

/* ─────────── LINHA DO TEMPO DE LEITURA (feature 8) ─────────── */
function TimelineLeitura({ sess }: any) {
  const fmtData = (iso: string) => { try { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` } catch { return iso } }
  // agrupa sessões por dia (desc) e ordena por horário de criação
  const porDia = useMemo(() => {
    const map: Record<string, any[]> = {}
    ;[...sess.sessoes].sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0)).forEach(s => { (map[s.data || '—'] ||= []).push(s) })
    return Object.entries(map).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [sess.sessoes])
  const totalMin = sess.sessoes.reduce((s: number, x: any) => s + (x.minutos || 0), 0)
  const [abertos, setAbertos] = useState<Set<string>>(new Set())   // dias expandidos (padrão: todos fechados)
  const toggleDia = (dia: string) => setAbertos(prev => { const n = new Set(prev); n.has(dia) ? n.delete(dia) : n.add(dia); return n })
  const excluir = (s: any) => { if (confirm(`Excluir esta sessão de leitura?\n${s.arquivo || 'documento'} · ${s.minutos || 0} min`)) sess.removerSessao?.(s.id) }
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 22px' }}>
      {!sess.uid && <div style={{ color: '#EA580C', fontSize: '.86rem' }}>Faça login para registrar sua leitura.</div>}
      {sess.uid && sess.sessoes.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.9rem', lineHeight: 1.7, padding: '40px 0' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🕒</div>
          Ainda não há sessões registradas.<br />
          <span style={{ fontSize: '.8rem' }}>Abra um PDF e leia — o NexusOS registra automaticamente as páginas lidas e o tempo de cada sessão.</span>
        </div>
      )}
      {sess.sessoes.length > 0 && (
        <div style={{ display: 'flex', gap: 18, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 130, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div style={{ fontSize: '.62rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Sessões</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#5b5bd6' }}>{sess.sessoes.length}</div>
          </div>
          <div style={{ flex: 1, minWidth: 130, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div style={{ fontSize: '.62rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Tempo total</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#16A34A' }}>{Math.floor(totalMin / 60)}h{String(totalMin % 60).padStart(2, '0')}</div>
          </div>
        </div>
      )}
      {porDia.map(([dia, lista]) => {
        const arr = lista as any[]
        const minDia = arr.reduce((s, x) => s + (x.minutos || 0), 0)
        const aberto = abertos.has(dia)
        return (
          <div key={dia} style={{ marginBottom: 10, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card-bg)' }}>
            {/* cabeçalho do dia (clicável) — fechado por padrão */}
            <button onClick={() => toggleDia(dia)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', border: 'none', background: aberto ? 'rgba(91,91,214,.07)' : 'var(--surface)', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ color: '#5b5bd6', fontSize: '.8rem', transition: 'transform .15s', transform: aberto ? 'rotate(90deg)' : 'none' }}>▶</span>
              <span style={{ fontWeight: 800, fontSize: '.82rem', color: 'var(--text-primary)' }}>{fmtData(dia)}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>{arr.length} {arr.length === 1 ? 'sessão' : 'sessões'}</span>
              <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#16A34A' }}>⏱ {minDia} min</span>
            </button>
            {/* corpo (sessões) — só quando aberto */}
            {aberto && (
              <div style={{ padding: '12px 14px 14px', borderTop: '1px solid var(--border)' }}>
                <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {arr.map(s => (
                    <div key={s.id} style={{ position: 'relative', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                      <div style={{ position: 'absolute', left: -21, top: 14, width: 10, height: 10, borderRadius: '50%', background: '#5b5bd6', border: '2px solid var(--card-bg)' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>📄 {s.arquivo || 'documento'}</span>
                        <span style={{ flex: 1 }} />
                        <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>⏱ {s.minutos || 0} min</span>
                        <button onClick={() => excluir(s)} title="Excluir esta sessão" style={{ ...btn, width: 26, height: 24, color: '#DC2626' }}>🗑</button>
                      </div>
                      <div style={{ fontSize: '.78rem', color: 'var(--text-secondary)', marginTop: 3 }}>Leu páginas {s.pagInicio}–{s.pagFim} <span style={{ color: 'var(--text-muted)' }}>({Math.max(0, (s.pagFim || 0) - (s.pagInicio || 0) + 1)} pág.)</span></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DiarioLeitura({ onClose }: any) {
  const st = useDiarioStore()
  const sess = useSessoesStore()                            // feature 8
  const [aba, setAba] = useState<'diario' | 'timeline'>('diario')  // feature 8
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
    <div className="pr-pop" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 9001, width: '94vw', height: '92vh', maxWidth: 1180, display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 30px 90px rgba(0,0,0,.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,rgba(91,91,214,.12),transparent)' }}>
        <span style={{ display: 'inline-flex', color: '#5b5bd6' }}><Icon e="📖" size={22} /></span>
        <b style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>Diário de Leitura</b>
        <div style={{ display: 'flex', gap: 2, marginLeft: 8, background: 'var(--surface)', borderRadius: 8, padding: 2 }}>
          {([['diario', '📋 Acompanhamento'], ['timeline', '🕒 Linha do tempo']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setAba(k)} style={{ ...btn, width: 'auto', padding: '0 11px', fontSize: '0.74rem', background: aba === k ? '#5b5bd6' : 'transparent', color: aba === k ? '#fff' : 'var(--text-secondary)', border: 'none' }}>{l}</button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        {!st.uid && <span style={{ fontSize: '0.72rem', color: '#EA580C' }}>Faça login para salvar</span>}
        <button onClick={onClose} style={btn}>✕</button>
      </div>

      {aba === 'timeline' ? <TimelineLeitura sess={sess} /> : (
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
      )}
    </div>

    {/* modal "o que foi estudado" */}
    {estudoDe && createPortal(<>
      <div onMouseDown={() => setEstudoDe(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9100 }} />
      <div className="pr-pop" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 9101, width: 'min(560px,94vw)', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,.45)', padding: 18 }}>
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

/* ── Água rápida (feature 4): registra água sem sair do PDF Reader.
   Grava no MESMO lugar da aba Saúde (users/{uid}/saude/{data}), então sincroniza tudo. ── */
function AguaRapida() {
  const uid = useUid()
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
  const [reg, setReg] = useState<any>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!uid || !db) return
    return onSnapshot(doc(db, 'users', uid, 'saude', hoje), s => setReg(s.exists() ? s.data() : null))
  }, [uid, hoje])
  const agua = reg?.agua ?? 0
  const meta = reg?.metaAgua ?? 2000
  const pct = Math.min(Math.round((agua / Math.max(meta, 1)) * 100), 100)
  const add = async (ml: number) => {
    if (!uid) return
    const novo = Math.max(0, Math.min(agua + ml, 6000))
    if (reg) await setDoc(doc(db, 'users', uid, 'saude', hoje), { agua: novo }, { merge: true })
    else await setDoc(doc(db, 'users', uid, 'saude', hoje), {
      id: Math.random().toString(36).slice(2, 10), data: hoje, agua: novo, metaAgua: 2000,
      sono: { inicio: '', fim: '', qualidade: 3 }, humor: 3, energia: 3,
      treino: { realizado: false, tipo: '', duracao: 0 }, peso: 0, sintomas: [], notas: '', criadoEm: Date.now(),
    })
  }
  const L = (ml: number) => (ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 1) + 'L'
  const cor = '#3B82F6'
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={() => setOpen(o => !o)} disabled={!uid}
        title={uid ? `Água hoje: ${L(agua)} de ${L(meta)} (${pct}%) — clique para registrar` : 'Faça login para registrar água'}
        style={{ ...btn, width: 'auto', padding: '0 9px', display: 'inline-flex', alignItems: 'center', gap: 6, background: open ? `${cor}1a` : 'var(--surface)', border: `1px solid ${open ? cor + '66' : 'var(--border)'}`, color: cor, fontWeight: 700, fontSize: '0.74rem' }}>
        <Icon e="💧" size={14} /> {L(agua)}
        <span style={{ width: 26, height: 4, borderRadius: 3, background: `${cor}22`, overflow: 'hidden', display: 'inline-block' }}>
          <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: cor }} />
        </span>
      </button>
      {open && createPortal(<>
        <div onMouseDown={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 7800 }} />
        <AguaPop cor={cor} agua={agua} meta={meta} pct={pct} L={L} add={add} />
      </>, document.body)}
    </div>
  )
}
// painel flutuante posicionado abaixo do botão (ancora simples no canto sup. direito da área)
function AguaPop({ cor, agua, meta, pct, L, add }: any) {
  return (
    <div className="pr-pop" style={{ position: 'fixed', top: 96, right: 18, zIndex: 7801, width: 232, padding: 14, background: 'var(--card-bg)', border: `1px solid ${cor}44`, borderRadius: 14, boxShadow: '0 16px 44px rgba(0,0,0,.34)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ display: 'inline-flex', color: cor }}><Icon e="💧" size={18} /></span>
        <div>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: cor, lineHeight: 1 }}>{L(agua)} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>/ {L(meta)}</span></div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{pct}% da meta de hoje</div>
        </div>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: `${cor}1f`, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: cor, transition: 'width .25s' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {[200, 250, 330, 500, 1000].map(ml => (
          <button key={ml} onClick={() => add(ml)}
            style={{ padding: '7px 0', borderRadius: 9, border: `1px solid ${cor}40`, background: `${cor}12`, color: cor, fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer' }}>
            +{ml >= 1000 ? '1L' : ml + 'ml'}
          </button>
        ))}
        <button onClick={() => add(-200)} title="Remover 200ml (corrigir)"
          style={{ padding: '7px 0', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer' }}>−200</button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════ FLASHCARDS · ESTUDO ATIVO (feature 2) ═══════════════════════════════
   users/{uid}/flashcards/{id} -> { id, frente, verso, fonte, tema, ef, rep, intervalo, proxRevisao, ultimaRevisao, criadoEm } */
function useFlashcardsStore() {
  const uid = useUid()
  const [cards, setCards] = useState<any[]>([])
  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, 'users', uid, 'flashcards'), s => setCards(s.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [uid])
  const salvarCard = useCallback(async (c: any) => { if (uid) await setDoc(doc(db, 'users', uid, 'flashcards', c.id), clean(c), { merge: true }) }, [uid])
  const removerCard = useCallback(async (id: string) => { if (uid) await deleteDoc(doc(db, 'users', uid, 'flashcards', id)) }, [uid])
  return { uid, cards, salvarCard, removerCard }
}

/* sessões de leitura (feature 8) — leitura da timeline alimentada pelo PdfViewer */
function useSessoesStore() {
  const uid = useUid()
  const [sessoes, setSessoes] = useState<any[]>([])
  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, 'users', uid, 'leituraSessoes'), s => setSessoes(s.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [uid])
  const removerSessao = useCallback(async (id: string) => { if (uid) await deleteDoc(doc(db, 'users', uid, 'leituraSessoes', id)) }, [uid])
  return { uid, sessoes, removerSessao }
}

/* ═══ MAPAS MENTAIS · store (Firestore) ═══
   users/{uid}/mapas/{id}        -> { id, titulo, pastaId, raiz(JSON), fonte, criadoEm, atualizadoEm }
   users/{uid}/mapasPastas/{id}  -> { id, nome, cor, parentId, criadoEm } */
function useMapasStore() {
  const uid = useUid()
  const [mapas, setMapas] = useState<any[]>([])
  const [pastas, setPastas] = useState<any[]>([])
  useEffect(() => { if (!uid) return; return onSnapshot(collection(db, 'users', uid, 'mapas'), s => setMapas(s.docs.map(d => ({ id: d.id, ...d.data() })))) }, [uid])
  useEffect(() => { if (!uid) return; return onSnapshot(collection(db, 'users', uid, 'mapasPastas'), s => setPastas(s.docs.map(d => ({ id: d.id, ...d.data() })))) }, [uid])
  const salvarMapa = useCallback(async (m: any) => { if (uid) await setDoc(doc(db, 'users', uid, 'mapas', m.id), clean({ ...m, raiz: JSON.stringify(m.raiz), atualizadoEm: Date.now() }), { merge: true }) }, [uid])
  const removerMapa = useCallback(async (id: string) => { if (uid) await deleteDoc(doc(db, 'users', uid, 'mapas', id)) }, [uid])
  const salvarPasta = useCallback(async (p: any) => { if (uid) await setDoc(doc(db, 'users', uid, 'mapasPastas', p.id), clean(p), { merge: true }) }, [uid])
  const removerPasta = useCallback(async (id: string) => { if (uid) await deleteDoc(doc(db, 'users', uid, 'mapasPastas', id)) }, [uid])
  // hidrata raiz (string JSON → objeto)
  const mapasHidratados = useMemo(() => mapas.map(m => { let raiz = m.raiz; if (typeof raiz === 'string') { try { raiz = JSON.parse(raiz) } catch { raiz = null } } return { ...m, raiz } }), [mapas])
  return { uid, mapas: mapasHidratados, pastas, salvarMapa, removerMapa, salvarPasta, removerPasta }
}

/* MODAL: gerar flashcards a partir de um trecho (revisão antes de salvar) */
function FlashcardGerarModal({ trecho, fonte, store, onClose }: any) {
  const [estado, setEstado] = useState<'gerando' | 'pronto' | 'erro'>('gerando')
  const [erro, setErro] = useState('')
  const [cards, setCards] = useState<{ frente: string; verso: string; on: boolean }[]>([])
  const [tema, setTema] = useState(fonte || '')
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try { const r = await gerarFlashcardsIA(trecho, fonte); if (!vivo) return; setCards(r.map(c => ({ ...c, on: true }))); setEstado(r.length ? 'pronto' : 'erro'); if (!r.length) setErro('A IA não retornou flashcards. Tente um trecho com definições mais claras.') }
      catch (e: any) { if (vivo) { setErro(e?.message || 'Falha na IA'); setEstado('erro') } }
    })()
    return () => { vivo = false }
  }, [])
  const salvar = async () => {
    const sel = cards.filter(c => c.on && c.frente.trim() && c.verso.trim())
    for (const c of sel) {
      const id = newId()
      await store.salvarCard({ id, frente: c.frente.trim(), verso: c.verso.trim(), fonte: fonte || '', tema: tema.trim(), ef: 2.5, rep: 0, intervalo: 0, proxRevisao: hojeISO(), ultimaRevisao: '', criadoEm: Date.now() })
    }
    onClose(sel.length)
  }
  const upd = (i: number, campo: 'frente' | 'verso', v: string) => setCards(cs => cs.map((c, j) => j === i ? { ...c, [campo]: v } : c))
  return createPortal(<>
    <div onMouseDown={() => onClose(0)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9200 }} />
    <div className="pr-pop" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 9201, width: 'min(560px,95vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.45)', padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <span style={{ fontSize: '1.15rem' }}>🃏</span><b style={{ color: 'var(--text-primary)' }}>Gerar flashcards</b>
        <span style={{ flex: 1 }} /><button onMouseDown={e => { e.preventDefault(); onClose(0) }} style={btn}>✕</button>
      </div>
      {!store.uid && <div style={{ fontSize: '.72rem', color: '#EA580C', marginBottom: 8 }}>Faça login para salvar os flashcards no Firestore.</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>Tema/baralho</span>
        <input value={tema} onChange={e => setTema(e.target.value)} placeholder="Ex.: Poder Constituinte" style={{ flex: 1, ...inpCfg }} />
      </div>
      {estado === 'gerando' && <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Gerando flashcards com a IA…</div>}
      {estado === 'erro' && <div style={{ padding: '14px', color: '#DC2626', fontSize: '.84rem' }}>⚠ {erro}</div>}
      {estado === 'pronto' && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          {cards.map((c, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 11, padding: 10, background: c.on ? 'var(--surface)' : 'transparent', opacity: c.on ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <input type="checkbox" checked={c.on} onChange={() => setCards(cs => cs.map((x, j) => j === i ? { ...x, on: !x.on } : x))} style={{ width: 16, height: 16, accentColor: '#5b5bd6' }} />
                <span style={{ fontSize: '.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>Card {i + 1}</span>
              </div>
              <textarea value={c.frente} onChange={e => upd(i, 'frente', e.target.value)} rows={2} placeholder="Frente (pergunta)" style={{ width: '100%', boxSizing: 'border-box', marginBottom: 6, resize: 'vertical', ...inpCfg, fontWeight: 600 }} />
              <textarea value={c.verso} onChange={e => upd(i, 'verso', e.target.value)} rows={2} placeholder="Verso (resposta)" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', ...inpCfg }} />
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <span style={{ flex: 1, fontSize: '.7rem', color: 'var(--text-muted)', alignSelf: 'center' }}>{fonte ? `Fonte: ${fonte}` : ''}</span>
        <button onMouseDown={e => { e.preventDefault(); onClose(0) }} style={{ ...btn, width: 'auto', padding: '0 12px' }}>Cancelar</button>
        <button onMouseDown={e => { e.preventDefault(); salvar() }} disabled={estado !== 'pronto' || !store.uid || !cards.some(c => c.on)} style={{ height: 32, padding: '0 16px', borderRadius: 8, border: 'none', background: '#5b5bd6', color: '#fff', fontWeight: 700, fontSize: '.84rem', cursor: 'pointer', opacity: (estado !== 'pronto' || !store.uid) ? 0.5 : 1 }}>💾 Salvar {cards.filter(c => c.on).length}</button>
      </div>
    </div>
  </>, document.body)
}

/* MODAL: revisar flashcards (sessão de recordação ativa com agendamento) */
function FlashcardRevisarModal({ store, onClose }: any) {
  const hoje = hojeISO()
  const [tema, setTema] = useState<string>('__todos__')
  const [modo, setModo] = useState<'revisar' | 'gerenciar'>('revisar')   // gerenciar = listar/apagar
  const temas = useMemo(() => Array.from(new Set(store.cards.map((c: any) => c.tema).filter(Boolean))).sort(), [store.cards])
  const devidos = useMemo(() => store.cards.filter((c: any) => (!c.proxRevisao || c.proxRevisao <= hoje) && (tema === '__todos__' || c.tema === tema)), [store.cards, tema, hoje])
  const doTema = useMemo(() => store.cards.filter((c: any) => tema === '__todos__' || c.tema === tema).sort((a: any, b: any) => (b.criadoEm || 0) - (a.criadoEm || 0)), [store.cards, tema])
  const [i, setI] = useState(0)
  const [virado, setVirado] = useState(false)
  const [fila, setFila] = useState<any[]>([])
  useEffect(() => { setFila(devidos); setI(0); setVirado(false) }, [tema, modo])
  const atual = fila[i]
  const responder = async (q: 'errei' | 'dificil' | 'facil') => {
    if (!atual) return
    await store.salvarCard({ id: atual.id, ...agendarRevisao(atual, q) })
    if (i + 1 < fila.length) { setI(i + 1); setVirado(false) } else { setFila([]); setI(0) }
  }
  // exclui o card atualmente em revisão e avança a fila
  const excluirAtual = async () => {
    if (!atual || !confirm('Excluir este flashcard?')) return
    await store.removerCard(atual.id)
    setFila(f => { const nf = f.filter((_, j) => j !== i); if (i >= nf.length) setI(Math.max(0, nf.length - 1)); setVirado(false); return nf })
  }
  const totalDeck = store.cards.filter((c: any) => tema === '__todos__' || c.tema === tema).length
  return createPortal(<>
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 9200 }} />
    <div className="pr-pop" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 9201, width: 'min(620px,95vw)', minHeight: 420, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.5)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 18px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,rgba(91,91,214,.12),transparent)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '1.2rem' }}>🃏</span><b style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Flashcards</b>
        <div style={{ display: 'flex', gap: 2, marginLeft: 4, background: 'var(--surface)', borderRadius: 8, padding: 2 }}>
          {([['revisar', 'Revisar'], ['gerenciar', 'Gerenciar']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setModo(k)} style={{ ...btn, width: 'auto', padding: '0 11px', fontSize: '0.74rem', background: modo === k ? '#5b5bd6' : 'transparent', color: modo === k ? '#fff' : 'var(--text-secondary)', border: 'none' }}>{l}</button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <select value={tema} onChange={e => setTema(e.target.value)} style={{ ...inpD, cursor: 'pointer', maxWidth: 170 }}>
          <option value="__todos__">Todos os temas</option>
          {temas.map((t: any) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={onClose} style={btn}>✕</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 18 }}>
        {!store.uid ? <div style={{ margin: 'auto', color: '#EA580C', fontSize: '.86rem' }}>Faça login para usar os flashcards.</div>
          : store.cards.length === 0 ? <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.88rem', lineHeight: 1.6 }}>Nenhum flashcard ainda.<br />Selecione um trecho no PDF e use <b>🃏 Flashcard (IA)</b> para criar.</div>
          : modo === 'gerenciar' ? (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>{doTema.length} card(s){tema !== '__todos__' ? ` em "${tema}"` : ''}. Clique no 🗑 para excluir.</div>
              {doTema.map((c: any) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>{c.frente}</div>
                    <div style={{ fontSize: '.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>{c.verso}</div>
                    <div style={{ fontSize: '.64rem', color: 'var(--text-muted)', marginTop: 4 }}>{c.tema ? `${c.tema} · ` : ''}{c.fonte ? `${c.fonte} · ` : ''}próx. revisão: {c.proxRevisao || '—'}</div>
                  </div>
                  <button onClick={() => { if (confirm('Excluir este flashcard?')) store.removerCard(c.id) }} title="Excluir flashcard" style={{ ...btn, width: 30, flexShrink: 0, color: '#DC2626' }}>🗑</button>
                </div>
              ))}
            </div>
          )
          : !atual ? <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '.9rem', lineHeight: 1.6 }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
              Revisões em dia neste tema!<br />
              <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{totalDeck} card(s) no baralho · próximas revisões agendadas.</span>
            </div>
          : <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ flex: 1, fontSize: '.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>{i + 1} de {fila.length} devido(s){atual.fonte ? ` · ${atual.fonte}` : ''}{atual.tema ? ` · ${atual.tema}` : ''}</span>
              <button onClick={excluirAtual} title="Excluir este flashcard" style={{ ...btn, width: 28, position: 'absolute', right: 18, color: '#DC2626' }}>🗑</button>
            </div>
            <div onClick={() => setVirado(v => !v)} style={{ flex: 1, minHeight: 180, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, borderRadius: 14, border: '1px solid var(--border)', background: virado ? 'rgba(91,91,214,.08)' : 'var(--surface)', position: 'relative' }}>
              <span style={{ position: 'absolute', top: 10, left: 14, fontSize: '.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{virado ? 'Verso' : 'Frente'}</span>
              <div style={{ fontSize: '1.02rem', color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', fontWeight: virado ? 500 : 600 }}>{virado ? atual.verso : atual.frente}</div>
              {!virado && <div style={{ marginTop: 16, fontSize: '.74rem', color: 'var(--text-muted)' }}>clique para revelar</div>}
            </div>
            {virado ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button onClick={() => responder('errei')} style={{ flex: 1, height: 42, borderRadius: 10, border: 'none', background: '#DC2626', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Errei</button>
                <button onClick={() => responder('dificil')} style={{ flex: 1, height: 42, borderRadius: 10, border: 'none', background: '#EA580C', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Difícil</button>
                <button onClick={() => responder('facil')} style={{ flex: 1, height: 42, borderRadius: 10, border: 'none', background: '#16A34A', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Fácil</button>
              </div>
            ) : (
              <button onClick={() => setVirado(true)} style={{ marginTop: 14, height: 42, borderRadius: 10, border: 'none', background: '#5b5bd6', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Revelar resposta</button>
            )}
          </>}
      </div>
    </div>
  </>, document.body)
}

/* ═══════════════════════════════ MAPA MENTAL · UI ═══════════════════════════════ */
/* operações de árvore p/ mover/aninhar nós */
function mapaMover(raiz: NoMapa, id: string, dir: -1 | 1): NoMapa {
  const rec = (n: NoMapa): NoMapa => {
    const i = n.filhos.findIndex(f => f.id === id)
    if (i !== -1) { const j = i + dir; if (j >= 0 && j < n.filhos.length) { const arr = [...n.filhos];[arr[i], arr[j]] = [arr[j], arr[i]]; return { ...n, filhos: arr } } }
    return { ...n, filhos: n.filhos.map(rec) }
  }
  return rec(raiz)
}
function mapaIndent(raiz: NoMapa, id: string): NoMapa {  // vira filho do irmão anterior
  const rec = (n: NoMapa): NoMapa => {
    const i = n.filhos.findIndex(f => f.id === id)
    if (i > 0) { const arr = [...n.filhos]; const [no] = arr.splice(i, 1); const ant = { ...arr[i - 1], filhos: [...arr[i - 1].filhos, no] }; arr[i - 1] = ant; return { ...n, filhos: arr } }
    return { ...n, filhos: n.filhos.map(rec) }
  }
  return rec(raiz)
}
function mapaOutdent(raiz: NoMapa, id: string): NoMapa {  // sobe um nível (vira irmão do pai)
  const rec = (n: NoMapa, avo: NoMapa | null): NoMapa => {
    // n é o "pai" candidato; procura id entre filhos de n
    const i = n.filhos.findIndex(f => f.id === id)
    if (i !== -1 && avo) {
      const arr = [...n.filhos]; const [no] = arr.splice(i, 1)
      const novoN = { ...n, filhos: arr }
      const pi = avo.filhos.findIndex(f => f.id === n.id)
      const avoArr = [...avo.filhos]; avoArr[pi] = novoN; avoArr.splice(pi + 1, 0, no)
      return { ...avo, filhos: avoArr }  // retorna o avô já modificado (tratado abaixo)
    }
    return { ...n, filhos: n.filhos.map(f => rec(f, n)) }
  }
  // como o outdent precisa do avô, fazemos uma passada que substitui a subárvore do avô
  let resultado = raiz
  mapaWalk(raiz, (cand, pai) => {
    if (!pai) return
    const i = cand.filhos.findIndex(f => f.id === id)
    if (i !== -1) {
      const arr = [...cand.filhos]; const [no] = arr.splice(i, 1)
      const novoPaiFilho = { ...cand, filhos: arr }
      resultado = mapaUpd(raiz, pai.id, p => {
        const pi = p.filhos.findIndex(f => f.id === cand.id)
        const novo = [...p.filhos]; novo[pi] = novoPaiFilho; novo.splice(pi + 1, 0, no)
        return { ...p, filhos: novo }
      })
    }
  })
  return resultado
}
const CORTIPO: any = { topico: '#7c3aed', subtopico: '#5b5bd6', conceito: '#0891b2', detalhe: '#64748b' }
/* aplica uma cor a um nó e todos os descendentes (o "grupo") */
function mapaSetCorSubarvore(no: NoMapa, cor: string): NoMapa { return { ...no, cor, filhos: no.filhos.map(f => mapaSetCorSubarvore(f, cor)) } }
/* dá a cada ramo (núcleo) uma cor diferente — desce por nós de filho único até o 1º ponto de ramificação,
   e cada ramo (e todos os seus descendentes) recebe a mesma cor (facilita o estudo) */
function colorizarMapa(raiz: NoMapa): NoMapa {
  const rec = (node: NoMapa): NoMapa => {
    if (node.filhos.length === 1) return { ...node, cor: undefined, filhos: [rec(node.filhos[0])] }
    if (node.filhos.length > 1) return { ...node, cor: undefined, filhos: node.filhos.map((f, i) => mapaSetCorSubarvore(f, PALETA_MAPA[i % PALETA_MAPA.length])) }
    return { ...node, cor: undefined }
  }
  return rec(raiz)
}

function NoMapaView({ no, depth, editId, setEditId, ops }: any) {
  const temFilhos = no.filhos.length > 0
  const cor = CORTIPO[no.tipo || 'conceito'] || '#64748b'
  return (
    <div style={{ marginLeft: depth ? 16 : 0 }}>
      <div className="pr-nomapa" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', borderRadius: 7, borderLeft: `3px solid ${cor}`, paddingLeft: 8, marginBottom: 2, background: 'var(--surface)' }}>
        <button onClick={() => temFilhos && ops.toggle(no.id)} title={temFilhos ? (no.colapsado ? 'Expandir' : 'Recolher') : ''} style={{ width: 18, height: 18, flexShrink: 0, border: 'none', background: 'transparent', cursor: temFilhos ? 'pointer' : 'default', color: 'var(--text-muted)', fontWeight: 800, fontSize: '0.8rem' }}>{temFilhos ? (no.colapsado ? '＋' : '−') : '•'}</button>
        {editId === no.id ? (
          <input autoFocus defaultValue={no.texto}
            onBlur={e => { ops.edit(no.id, e.target.value); setEditId(null) }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditId(null) }}
            style={{ flex: 1, border: '1px solid #7c3aed', borderRadius: 5, padding: '3px 6px', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.84rem', outline: 'none' }} />
        ) : (
          <span onDoubleClick={() => setEditId(no.id)} style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: no.tipo === 'topico' ? 700 : no.tipo === 'subtopico' ? 600 : 400, cursor: 'text' }}>{no.texto}</span>
        )}
        <span className="pr-nomapa-acts" style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
          <button onClick={() => setEditId(no.id)} title="Renomear" style={miniBtn}>✎</button>
          <button onClick={() => ops.addChild(no.id)} title="Adicionar filho" style={miniBtn}>＋</button>
          <button onClick={() => ops.move(no.id, -1)} title="Mover para cima" style={miniBtn}>↑</button>
          <button onClick={() => ops.move(no.id, 1)} title="Mover para baixo" style={miniBtn}>↓</button>
          <button onClick={() => ops.indent(no.id)} title="Recuar (virar filho do anterior)" style={miniBtn}>→</button>
          <button onClick={() => ops.outdent(no.id)} title="Avançar (subir um nível)" style={miniBtn}>←</button>
          <button onClick={() => { if (confirm('Excluir este nó e seus filhos?')) ops.del(no.id) }} title="Excluir" style={{ ...miniBtn, color: '#DC2626' }}>🗑</button>
        </span>
      </div>
      {temFilhos && !no.colapsado && no.filhos.map((f: NoMapa) => (
        <NoMapaView key={f.id} no={f} depth={depth + 1} editId={editId} setEditId={setEditId} ops={ops} />
      ))}
    </div>
  )
}

/* visualização clássica editável: caixas + conectores, pan/zoom, arrastar nós, estilizar */
const PALETA_MAPA = ['#7c3aed', '#5b5bd6', '#0891b2', '#16a34a', '#ea580c', '#dc2626', '#db2777', '#0d9488', '#ca8a04', '#475569']
function MapaVisual({ mapa, ops, onConector }: any) {
  const raiz: NoMapa = mapa.raiz
  const conTipo = mapa.conectorTipo || 'curva'
  const conCor = mapa.conectorCor || '#94a3b8'
  const conTraco = mapa.conectorTraco || 'solida'
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 30, y: 60 })
  const [selIds, setSelIds] = useState<Set<string>>(new Set())   // multi-seleção
  const [drag, setDrag] = useState<any>(null)   // { ids[], base{}, sx, sy, ddx, ddy }
  const [marquee, setMarquee] = useState<any>(null)   // retângulo de seleção (coords relativas ao container)
  const [ferramenta, setFerramenta] = useState<'sel' | 'pan'>('sel')
  const panRef = useRef<any>(null)
  const marqRef = useRef<any>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const COL_W = 215, BOX_W = 172
  const LINE_H = 16, PADY = 8, MINH = 38, GAP = 14
  const charsLinha = Math.max(14, Math.floor((BOX_W - 22) / 6.6))
  const base = useMemo(() => {
    const info: any = {}
    const calc = (n: NoMapa) => { const lines = wrapTexto(n.texto, charsLinha); info[n.id] = { lines, h: Math.max(MINH, lines.length * LINE_H + 2 * PADY) }; (n.colapsado ? [] : n.filhos).forEach(calc) }
    calc(raiz)
    const pos: any = {}; let cursorY = 0, maxDepth = 0
    const layout = (n: NoMapa, depth: number): number => {
      maxDepth = Math.max(maxDepth, depth)
      const x = depth * COL_W; const vis = n.colapsado ? [] : n.filhos; const h = info[n.id].h
      let y: number
      if (!vis.length) { y = cursorY + h / 2; cursorY += h + GAP }
      else { const ys = vis.map(c => layout(c, depth + 1)); y = (ys[0] + ys[ys.length - 1]) / 2 }
      pos[n.id] = { x, y, node: n, h: info[n.id].h }; return y
    }
    layout(raiz, 0)
    return { pos, w: (maxDepth + 1) * COL_W + BOX_W, h: Math.max(cursorY, MINH) + 24 }
  }, [raiz])
  // posição final = base + offset manual (arrasta todos os nós em drag.ids)
  const finalPos = (id: string) => {
    const p = base.pos[id]; if (!p) return null
    let ox = p.node.dx || 0, oy = p.node.dy || 0
    if (drag && drag.ids.includes(id)) { ox = (drag.base[id]?.dx || 0) + drag.ddx; oy = (drag.base[id]?.dy || 0) + drag.ddy }
    return { x: p.x + ox, y: p.y + oy, node: p.node, h: p.h }
  }
  const lista = Object.keys(base.pos).map(finalPos).filter(Boolean) as any[]
  const edges: any[] = []
  lista.forEach(({ node, x, y }: any) => { if (node.colapsado) return; node.filhos.forEach((c: NoMapa) => { const cp = finalPos(c.id); if (cp) edges.push({ x1: x + BOX_W, y1: y, x2: cp.x, y2: cp.y, key: node.id + '>' + c.id }) }) })
  const dashArr = conTraco === 'tracejada' ? '9 5' : conTraco === 'pontilhada' ? '2 5' : undefined
  const pathD = (e: any) => conTipo === 'reta' ? `M${e.x1},${e.y1} L${e.x2},${e.y2}`
    : conTipo === 'cotovelo' ? `M${e.x1},${e.y1} L${(e.x1 + e.x2) / 2},${e.y1} L${(e.x1 + e.x2) / 2},${e.y2} L${e.x2},${e.y2}`
      : `M${e.x1},${e.y1} C${e.x1 + 55},${e.y1} ${e.x2 - 55},${e.y2} ${e.x2},${e.y2}`

  const relXY = (e: any) => { const r = boxRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const onContainerDown = (e: any) => {
    if (e.target.closest('.pr-mapbox')) return
    if (ferramenta === 'pan' || e.button === 1) { panRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }; return }
    // ferramenta de seleção: inicia retângulo
    const { x, y } = relXY(e)
    const add = e.shiftKey || e.ctrlKey || e.metaKey
    if (!add) setSelIds(new Set())
    marqRef.current = { x0: x, y0: y, add, prev: new Set(selIds) }
    setMarquee({ x0: x, y0: y, x1: x, y1: y })
  }
  const onMove = (e: any) => {
    if (drag) { setDrag((d: any) => ({ ...d, ddx: (e.clientX - d.sx) / zoom, ddy: (e.clientY - d.sy) / zoom })); return }
    if (marqRef.current) { const { x, y } = relXY(e); setMarquee({ x0: marqRef.current.x0, y0: marqRef.current.y0, x1: x, y1: y }); return }
    if (panRef.current) setPan({ x: panRef.current.px + (e.clientX - panRef.current.sx), y: panRef.current.py + (e.clientY - panRef.current.sy) })
  }
  const onUp = () => {
    if (drag) { drag.ids.forEach((id: string) => ops.mover(id, (drag.base[id]?.dx || 0) + drag.ddx, (drag.base[id]?.dy || 0) + drag.ddy)); setDrag(null) }
    if (marqRef.current && marquee) {
      const L = Math.min(marquee.x0, marquee.x1), T = Math.min(marquee.y0, marquee.y1), R = Math.max(marquee.x0, marquee.x1), B = Math.max(marquee.y0, marquee.y1)
      const hit = new Set<string>(marqRef.current.add ? marqRef.current.prev : [])
      if (R - L > 3 || B - T > 3) lista.forEach(({ node, x, y, h }: any) => {
        const sl = pan.x + x * zoom, st = pan.y + (y - h / 2) * zoom, sr = sl + BOX_W * zoom, sb = st + h * zoom
        if (sl < R && sr > L && st < B && sb > T) hit.add(node.id)
      })
      setSelIds(hit); marqRef.current = null; setMarquee(null)
    }
    panRef.current = null
  }
  const onBoxDown = (e: any, node: NoMapa) => {
    e.stopPropagation()
    const multi = e.ctrlKey || e.metaKey || e.shiftKey
    if (multi) { setSelIds(prev => { const n = new Set(prev); n.has(node.id) ? n.delete(node.id) : n.add(node.id); return n }); return }
    // arrasta o grupo se o nó já faz parte de uma seleção múltipla; senão seleciona só ele
    const grupo = selIds.has(node.id) && selIds.size > 1
    const ids = grupo ? [...selIds] : [node.id]
    if (!grupo) setSelIds(new Set([node.id]))
    const baseMap: any = {}; ids.forEach(id => { const nd = base.pos[id]?.node; baseMap[id] = { dx: nd?.dx || 0, dy: nd?.dy || 0 } })
    setDrag({ ids, base: baseMap, sx: e.clientX, sy: e.clientY, ddx: 0, ddy: 0 })
  }
  // aplica estilo a TODOS os nós selecionados
  const aplicarTodos = (patch: any) => selIds.forEach(id => ops.estilo(id, patch))

  const ctrlBtn: any = { width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 800, fontSize: '0.9rem' }
  const selArr = [...selIds].map(id => base.pos[id]?.node).filter(Boolean) as NoMapa[]
  const sel = selArr[0] || null
  const swatch = (cor: string, on: boolean, onClick: any) => <button key={cor} onClick={onClick} style={{ width: 18, height: 18, borderRadius: '50%', background: cor, border: on ? '2px solid var(--text-primary)' : '2px solid transparent', cursor: 'pointer', flexShrink: 0 }} />

  return (
    <div ref={boxRef} onMouseDown={onContainerDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
      style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', background: '#ffffff', backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '22px 22px', cursor: drag ? 'grabbing' : panRef.current ? 'grabbing' : ferramenta === 'pan' ? 'grab' : 'crosshair' }}>
      {/* barra de estilo (conectores + nó selecionado) — stopPropagation evita desselecionar/pan ao clicar */}
      <div onMouseDown={e => e.stopPropagation()} style={{ position: 'absolute', top: 8, left: 8, right: 56, zIndex: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, padding: '6px 10px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 14px rgba(0,0,0,.18)' }}>
        <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>Conectores:</span>
        {([['curva', '⌒'], ['reta', '╱'], ['cotovelo', '⌐']] as const).map(([k, l]) => (
          <button key={k} onClick={() => onConector({ conectorTipo: k })} title={k} style={{ width: 26, height: 24, borderRadius: 6, border: 'none', background: conTipo === k ? '#7c3aed' : 'var(--surface)', color: conTipo === k ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700 }}>{l}</button>
        ))}
        <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {['#94a3b8', '#7c3aed', '#16a34a', '#dc2626', '#0891b2'].map(c => swatch(c, conCor === c, () => onConector({ conectorCor: c })))}
          <input type="color" value={conCor} onChange={e => onConector({ conectorCor: e.target.value })} title="Cor personalizada do conector" style={{ width: 20, height: 20, padding: 0, border: '1px solid var(--border)', borderRadius: '50%', background: 'none', cursor: 'pointer' }} />
        </span>
        {([['solida', '──'], ['tracejada', '╌╌'], ['pontilhada', '··']] as const).map(([k, l]) => (
          <button key={k} onClick={() => onConector({ conectorTraco: k })} title={`Traço ${k}`} style={{ width: 28, height: 24, borderRadius: 6, border: 'none', background: conTraco === k ? '#7c3aed' : 'var(--surface)', color: conTraco === k ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700, fontSize: '.7rem' }}>{l}</button>
        ))}
        <button onClick={ops.recolorir} title="Colorir cada grupo com uma cor diferente" style={{ ...ctrlBtn, width: 'auto', height: 22, padding: '0 8px', fontSize: '.66rem', fontWeight: 700 }}>🎨 Grupos</button>
        {sel && <>
          <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
          <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>Caixa{selArr.length > 1 ? ` (${selArr.length})` : ''}:</span>
          <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            {PALETA_MAPA.slice(0, 8).map(c => swatch(c, selArr.length === 1 && sel.cor === c, () => aplicarTodos({ cor: c })))}
            <input type="color" value={sel.cor || '#7c3aed'} onChange={e => aplicarTodos({ cor: e.target.value })} title="Cor personalizada da caixa" style={{ width: 20, height: 20, padding: 0, border: '1px solid var(--border)', borderRadius: '50%', background: 'none', cursor: 'pointer' }} />
          </span>
          <button onClick={() => aplicarTodos({ cor: null })} title="Cor padrão (por tipo)" style={{ ...ctrlBtn, width: 'auto', height: 22, padding: '0 6px', fontSize: '.66rem', fontWeight: 700 }}>auto</button>
          {([['arred', '▭', 'Arredondada'], ['ret', '⬛', 'Retângulo'], ['elipse', '⬭', 'Elipse'], ['linha', '▁', 'Só linha embaixo'], ['nenhum', '✕', 'Sem caixa']] as const).map(([k, l, t]) => (
            <button key={k} onClick={() => aplicarTodos({ formato: k })} title={t} style={{ width: 24, height: 22, borderRadius: 6, border: 'none', background: (selArr.length === 1 ? (sel.formato || 'arred') : '') === k ? '#7c3aed' : 'var(--surface)', color: (selArr.length === 1 ? (sel.formato || 'arred') : '') === k ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}>{l}</button>
          ))}
          <button onClick={() => selIds.forEach(id => ops.corGrupo(id))} title="Aplicar a cor desta caixa a todos os descendentes (o grupo)" style={{ ...ctrlBtn, width: 'auto', height: 22, padding: '0 6px', fontSize: '.64rem', fontWeight: 700 }}>↧ grupo</button>
        </>}
      </div>
      {/* zoom */}
      <div onMouseDown={e => e.stopPropagation()} style={{ position: 'absolute', top: 8, right: 10, zIndex: 7, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <button onClick={() => setFerramenta(f => f === 'sel' ? 'pan' : 'sel')} title={ferramenta === 'sel' ? 'Ferramenta: Selecionar (arraste no fundo p/ selecionar vários) — clique p/ Mover' : 'Ferramenta: Mover (arraste o fundo p/ navegar) — clique p/ Selecionar'} style={{ ...ctrlBtn, background: '#7c3aed', color: '#fff', border: 'none' }}>{ferramenta === 'sel' ? '⬚' : '✋'}</button>
        <button onClick={() => setZoom(z => Math.min(2.2, +(z + 0.1).toFixed(2)))} title="Aproximar" style={ctrlBtn}>＋</button>
        <button onClick={() => setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(2)))} title="Afastar" style={ctrlBtn}>−</button>
        <button onClick={() => { setZoom(1); setPan({ x: 30, y: 60 }) }} title="Reposicionar" style={ctrlBtn}>⟲</button>
      </div>
      {/* retângulo de seleção */}
      {marquee && <div style={{ position: 'absolute', zIndex: 8, left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0), background: 'rgba(124,58,237,.12)', border: '1.5px dashed #7c3aed', borderRadius: 4, pointerEvents: 'none' }} />}
      <div onWheel={e => { const d = e.deltaY < 0 ? 0.1 : -0.1; setZoom(z => Math.min(2.2, Math.max(0.3, +(z + d).toFixed(2)))) }} style={{ position: 'absolute', inset: 0 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>
          <svg width={base.w + 400} height={base.h + 400} style={{ position: 'absolute', left: -200, top: -200, overflow: 'visible', pointerEvents: 'none' }}>
            <g transform="translate(200,200)">
              {edges.map((e: any) => <path key={e.key} d={pathD(e)} fill="none" stroke={conCor} strokeWidth={1.8} strokeDasharray={dashArr} />)}
            </g>
          </svg>
          {lista.map(({ node, x, y, h }: any) => {
            const cor = node.cor || CORTIPO[node.tipo || 'conceito'] || '#64748b'
            const temFilhos = node.filhos.length > 0
            const fmt = node.formato || 'arred'
            const ativo = selIds.has(node.id)
            const semCaixa = fmt === 'nenhum', soLinha = fmt === 'linha'
            const radius = fmt === 'elipse' ? '50% / 60%' : fmt === 'ret' ? '2px' : '10px'
            const fundo = semCaixa || soLinha ? 'transparent' : (node.cor ? cor + '20' : '#ffffff')
            const borda = semCaixa ? 'none' : soLinha ? 'none' : `${ativo ? 2 : 1}px solid ${cor}${ativo ? '' : 'aa'}`
            return (
              <div key={node.id} className="pr-mapbox" onMouseDown={e => onBoxDown(e, node)} onDoubleClick={() => { const t = prompt('Renomear nó:', node.texto); if (t != null) ops.edit(node.id, t) }}
                style={{
                  position: 'absolute', left: x, top: y - h / 2, width: BOX_W, height: h, boxSizing: 'border-box',
                  padding: fmt === 'elipse' ? '6px 14px' : '6px 10px', borderRadius: radius,
                  background: fundo, border: borda,
                  borderLeft: semCaixa ? 'none' : soLinha ? 'none' : (fmt === 'elipse' ? `${ativo ? 2 : 1}px solid ${cor}` : `4px solid ${cor}`),
                  borderBottom: soLinha ? `2px solid ${cor}` : undefined,
                  boxShadow: ativo ? `0 0 0 3px ${cor}44, 0 3px 12px rgba(0,0,0,.2)` : (semCaixa || soLinha ? 'none' : '0 2px 10px rgba(0,0,0,.12)'),
                  fontSize: '.78rem', color: semCaixa || soLinha ? cor : '#1a1a1a', fontWeight: node.tipo === 'topico' ? 700 : node.tipo === 'subtopico' ? 600 : 500,
                  display: 'flex', alignItems: 'center', gap: 6, cursor: drag && drag.id === node.id ? 'grabbing' : 'grab', userSelect: 'none', overflow: 'hidden',
                }}>
                <span style={{ flex: 1, overflow: 'hidden', lineHeight: `${LINE_H}px`, textAlign: fmt === 'elipse' ? 'center' : 'left' }} title={node.texto}>{node.texto}</span>
                {temFilhos && <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); ops.toggle(node.id) }} title={node.colapsado ? 'Expandir' : 'Recolher'} style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 9, border: 'none', background: cor, color: '#fff', fontWeight: 800, fontSize: '.74rem', cursor: 'pointer', lineHeight: 1 }}>{node.colapsado ? '+' : '−'}</button>}
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 8, left: 12, fontSize: '.66rem', color: '#64748b' }}>Arraste no fundo p/ selecionar vários (⬚) · arraste um nó selecionado p/ mover o grupo · Ctrl/Shift+clique soma · ✋ alterna p/ navegar · duplo-clique renomeia</div>
    </div>
  )
}

/* HUB grande: pastas coloridas + lista de mapas + geração + editor + exportação */
function MapaMentalHub({ store, insumos, onLimparInsumos, api, onClose }: any) {
  const [pastaSel, setPastaSel] = useState<string | null>(null)   // null = "Todos"
  const [pastasAbertas, setPastasAbertas] = useState<Set<string>>(new Set())   // sanfona: subpastas só aparecem ao abrir a principal
  const [buscaMapa, setBuscaMapa] = useState('')   // pesquisa de mapas pelo nome
  const [winPos, setWinPos] = useState<{ x: number; y: number } | null>(null)   // arrastar janela
  const [full, setFull] = useState(false)   // tela cheia
  const winDrag = useRef<any>(null)
  const onWinDown = (e: any) => { if (full) return; if (e.target.closest('button,input,select,textarea')) return; const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect(); winDrag.current = { sx: e.clientX, sy: e.clientY, ox: winPos?.x ?? r.left, oy: winPos?.y ?? r.top }; setWinPos({ x: winDrag.current.ox, y: winDrag.current.oy }) }
  const onWinMove = (e: any) => { if (!winDrag.current) return; setWinPos({ x: winDrag.current.ox + (e.clientX - winDrag.current.sx), y: winDrag.current.oy + (e.clientY - winDrag.current.sy) }) }
  const onWinUp = () => { winDrag.current = null }
  const [mapaAtual, setMapaAtual] = useState<any>(null)           // { id, titulo, pastaId, raiz, fonte } (em edição)
  const [editId, setEditId] = useState<string | null>(null)
  const [vista, setVista] = useState<'lista' | 'mapa'>('lista')   // visualização: lista hierárquica ou mapa clássico
  const [expOpen, setExpOpen] = useState(false)                   // painel de exportação visual (múltiplos mapas)
  const [expSel, setExpSel] = useState<Set<string>>(new Set())
  const [expOrient, setExpOrient] = useState<'landscape' | 'portrait'>('landscape')
  const [expBusy, setExpBusy] = useState(false)
  const [gerar, setGerar] = useState(false)
  const [fonte, setFonte] = useState<'insumos' | 'pagina' | 'intervalo'>('insumos')
  const [leiSeca, setLeiSeca] = useState(false)
  const [de, setDe] = useState(1); const [ate, setAte] = useState(1)
  const [carregando, setCarregando] = useState(false)
  const [dirty, setDirty] = useState(false)

  const filhosPasta = (pid: string | null) => store.pastas.filter((p: any) => (p.parentId ?? null) === pid)
  const mapasNaPasta = useMemo(() => {
    const q = buscaMapa.trim().toLowerCase()
    return store.mapas
      .filter((m: any) => q ? (m.titulo || '').toLowerCase().includes(q) : (pastaSel === null ? true : (m.pastaId ?? null) === pastaSel))
      .sort((a: any, b: any) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0))
  }, [store.mapas, pastaSel, buscaMapa])

  // operações na árvore em edição
  const apply = (fn: (r: NoMapa) => NoMapa) => { setMapaAtual((m: any) => m && { ...m, raiz: fn(m.raiz) }); setDirty(true) }
  const ops = {
    toggle: (id: string) => apply(r => mapaUpd(r, id, n => ({ ...n, colapsado: !n.colapsado }))),
    edit: (id: string, texto: string) => apply(r => mapaUpd(r, id, n => ({ ...n, texto: texto.trim() || n.texto }))),
    addChild: (id: string) => { const nid = newId(); apply(r => mapaUpd(r, id, n => ({ ...n, colapsado: false, filhos: [...n.filhos, { id: nid, texto: 'Novo nó', tipo: 'conceito', filhos: [] }] }))); setEditId(nid) },
    del: (id: string) => apply(r => mapaDel(r, id)),
    move: (id: string, d: -1 | 1) => apply(r => mapaMover(r, id, d)),
    indent: (id: string) => apply(r => mapaIndent(r, id)),
    outdent: (id: string) => apply(r => mapaOutdent(r, id)),
    estilo: (id: string, patch: any) => apply(r => mapaUpd(r, id, n => ({ ...n, ...patch }))),
    mover: (id: string, dx: number, dy: number) => apply(r => mapaUpd(r, id, n => ({ ...n, dx, dy }))),
    recolorir: () => apply(r => colorizarMapa(r)),
    corGrupo: (id: string) => apply(r => mapaUpd(r, id, n => mapaSetCorSubarvore(n, n.cor || CORTIPO[n.tipo || 'conceito'] || '#64748b'))),
  }
  const setConector = (patch: any) => { setMapaAtual((m: any) => m && { ...m, ...patch }); setDirty(true) }

  const abrirMapa = (m: any) => {
    let raiz = m.raiz
    const semCor = (() => { let achou = false; if (raiz) mapaWalk(raiz, n => { if (n.cor) achou = true }); return !achou })()
    const jaColorido = !semCor
    if (raiz && semCor) raiz = colorizarMapa(raiz)
    setMapaAtual({ id: m.id, titulo: m.titulo, pastaId: m.pastaId ?? null, raiz, fonte: m.fonte || '', conectorTipo: m.conectorTipo, conectorCor: m.conectorCor, conectorTraco: m.conectorTraco })
    setDirty(!jaColorido)
  }
  const salvar = async () => { if (!mapaAtual) return; await store.salvarMapa({ ...mapaAtual, pastaId: mapaAtual.pastaId ?? pastaSel ?? null, criadoEm: mapaAtual.criadoEm || Date.now() }); setDirty(false) }
  const exportarPDF = (m: any) => { const w = window.open('', '_blank'); if (!w) return; w.document.write(mapaParaHTML(m.raiz, m.titulo || 'Mapa Mental')); w.document.close(); w.focus(); setTimeout(() => w.print(), 350) }
  // exportação visual (vários mapas, 1 por página)
  const abrirExport = () => { setExpSel(new Set(mapasNaPasta.map((m: any) => m.id))); setExpOpen(true) }
  const toggleExp = (id: string) => setExpSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const mapasSelecionados = () => mapasNaPasta.filter((m: any) => expSel.has(m.id) && m.raiz)
  const exportarPDFVisual = () => {
    const sel = mapasSelecionados(); if (!sel.length) return
    const w = window.open('', '_blank'); if (!w) { alert('Permita pop-ups para exportar.'); return }
    w.document.write(mapaPaginasHTML(sel, expOrient)); w.document.close(); w.focus(); setTimeout(() => w.print(), 400)
    setExpOpen(false)
  }
  const exportarPNGs = async () => {
    const sel = mapasSelecionados(); if (!sel.length) return
    setExpBusy(true)
    for (const m of sel) {
      const { svg, w, h } = mapaParaSVG(m.raiz, m.conectorTipo, m.conectorCor, m.conectorTraco)
      const blob = await svgParaPNG(svg, w, h, 3)
      if (blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (m.titulo || 'mapa').replace(/[^\w\-]+/g, '_') + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); await new Promise(r => setTimeout(r, 300)) }
    }
    setExpBusy(false); setExpOpen(false)
  }

  const executarGeracao = async () => {
    setCarregando(true)
    try {
      let texto = ''
      const nome = api?.current?.getNome?.() || ''
      if (fonte === 'insumos') texto = (insumos || []).map((i: any) => `[p. ${i.page}] ${i.texto}`).join('\n\n')
      else if (fonte === 'pagina') texto = await api?.current?.getPageText?.(api?.current?.getCurPage?.() || 1)
      else texto = await api?.current?.getRangeText?.(de, ate)
      if (!texto || !texto.trim()) { alert(fonte === 'insumos' ? 'Nenhum destaque coletado. Selecione trechos no PDF e use "🗺 Coletar p/ mapa mental".' : 'Não há texto extraível nessas páginas (rode o OCR se for digitalizado).'); setCarregando(false); return }
      const raiz = await gerarMapaIA(texto, leiSeca, nome)
      if (!raiz) { alert('A IA não retornou um mapa válido. Tente novamente ou ajuste a seleção.'); setCarregando(false); return }
      const raizCor = colorizarMapa(raiz)
      setMapaAtual({ id: newId(), titulo: raizCor.texto || 'Novo mapa', pastaId: pastaSel ?? null, raiz: raizCor, fonte: nome, criadoEm: Date.now() })
      setDirty(true); setGerar(false)
    } catch (e: any) { alert('Falha ao gerar o mapa: ' + (e?.message || e)) }
    setCarregando(false)
  }

  // árvore de pastas (recursiva, coloridas)
  const PastaTree = ({ pid, depth }: any) => (<>
    {filhosPasta(pid).map((p: any) => {
      const temSub = filhosPasta(p.id).length > 0
      const aberta = pastasAbertas.has(p.id)
      const abrir = () => { setPastaSel(p.id); if (temSub) setPastasAbertas(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n }) }
      return (
        <div key={p.id}>
          <div className="pr-mappasta" onClick={abrir} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 6px', paddingLeft: 6 + depth * 14, borderRadius: 7, cursor: 'pointer', background: pastaSel === p.id ? (p.cor || '#7c3aed') + '22' : 'transparent', borderLeft: `3px solid ${p.cor || '#7c3aed'}` }}>
            <span style={{ width: 14, flexShrink: 0, textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 800, transition: 'transform .15s', transform: aberta ? 'rotate(90deg)' : 'none', visibility: temSub ? 'visible' : 'hidden' }}>▶</span>
            <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: pastaSel === p.id ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{temSub ? (aberta ? '📂' : '📁') : '📁'} {p.nome}</span>
            <span className="pr-mappasta-acts" style={{ display: 'flex', gap: 1 }}>
              <button onClick={e => { e.stopPropagation(); const n = prompt('Subpasta dentro de "' + p.nome + '":'); if (n?.trim()) { store.salvarPasta({ id: newId(), nome: n.trim(), cor: p.cor || '#7c3aed', parentId: p.id, criadoEm: Date.now() }); setPastasAbertas(prev => new Set(prev).add(p.id)) } }} title="Nova subpasta" style={miniBtn}>＋</button>
              <button onClick={e => { e.stopPropagation(); const cores = ['#7c3aed', '#5b5bd6', '#0891b2', '#16a34a', '#ea580c', '#dc2626', '#db2777', '#64748b']; const atual = cores.indexOf(p.cor); store.salvarPasta({ ...p, cor: cores[(atual + 1) % cores.length] }) }} title="Mudar cor" style={miniBtn}>🎨</button>
              <button onClick={e => { e.stopPropagation(); const n = prompt('Renomear pasta:', p.nome); if (n?.trim()) store.salvarPasta({ ...p, nome: n.trim() }) }} title="Renomear" style={miniBtn}>✎</button>
              <button onClick={e => { e.stopPropagation(); if (confirm('Excluir a pasta "' + p.nome + '"? Os mapas dentro dela NÃO são apagados (ficam em "Todos").')) { store.removerPasta(p.id); if (pastaSel === p.id) setPastaSel(null) } }} title="Excluir pasta" style={{ ...miniBtn, color: '#DC2626' }}>🗑</button>
            </span>
          </div>
          {temSub && aberta && <PastaTree pid={p.id} depth={depth + 1} />}
        </div>
      )
    })}
  </>)

  return createPortal(<>
    <div onMouseDown={() => { if (!dirty || confirm('Há alterações não salvas. Fechar mesmo assim?')) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 9300 }} />
    <div className="pr-pop" onMouseMove={onWinMove} onMouseUp={onWinUp} onMouseLeave={onWinUp}
      style={full
        ? { position: 'fixed', inset: 0, zIndex: 9301, width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', overflow: 'hidden' }
        : winPos
          ? { position: 'fixed', left: winPos.x, top: winPos.y, zIndex: 9301, width: '94vw', height: '92vh', maxWidth: 1200, display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 30px 90px rgba(0,0,0,.5)' }
          : { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 9301, width: '94vw', height: '92vh', maxWidth: 1200, display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 30px 90px rgba(0,0,0,.5)' }}>
      {/* header (arraste para mover) */}
      <div onMouseDown={onWinDown} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,rgba(124,58,237,.14),transparent)', cursor: full ? 'default' : 'move', userSelect: 'none' }}>
        <span style={{ display: 'inline-flex', color: '#7c3aed' }}><IconMapa size={22} /></span><b style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>Mapas Mentais</b>
        <span style={{ fontSize: '.72rem', color: '#7c3aed', fontWeight: 700, background: 'rgba(124,58,237,.12)', padding: '2px 8px', borderRadius: 10 }}>{insumos?.length || 0} destaque(s) coletado(s)</span>
        {(insumos?.length || 0) > 0 && <button onClick={onLimparInsumos} style={{ ...btn, width: 'auto', padding: '0 8px', fontSize: '.7rem' }}>limpar</button>}
        <span style={{ flex: 1 }} />
        {!store.uid && <span style={{ fontSize: '.72rem', color: '#EA580C' }}>Faça login para salvar</span>}
        <button onClick={() => { setFull(f => !f); if (!full) setWinPos(null) }} title={full ? 'Restaurar janela' : 'Tela cheia'} style={btn}>{full ? '🗗' : '🗖'}</button>
        <button onClick={() => { if (!dirty || confirm('Há alterações não salvas. Fechar mesmo assim?')) onClose() }} style={btn}>✕</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* sidebar de pastas */}
        <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px' }}>
            <b style={{ fontSize: '.74rem', color: 'var(--text-primary)' }}>Pastas</b><span style={{ flex: 1 }} />
            <button onClick={() => { const n = prompt('Nome da pasta (ex.: Direito Administrativo):'); if (n?.trim()) store.salvarPasta({ id: newId(), nome: n.trim(), cor: '#7c3aed', parentId: null, criadoEm: Date.now() }) }} style={{ ...btn, width: 'auto', padding: '0 8px', fontSize: '.72rem' }}>＋ Pasta</button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 10px' }}>
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <input value={buscaMapa} onChange={e => { setBuscaMapa(e.target.value); if (e.target.value) setPastaSel(null) }} placeholder="🔍 Pesquisar mapas…"
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 26px 6px 10px', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }} />
              {buscaMapa && <button onClick={() => setBuscaMapa('')} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 800 }}>✕</button>}
            </div>
            {!buscaMapa && <div onClick={() => setPastaSel(null)} style={{ padding: '5px 8px', borderRadius: 7, cursor: 'pointer', fontSize: '.82rem', fontWeight: pastaSel === null ? 700 : 500, color: 'var(--text-primary)', background: pastaSel === null ? 'var(--surface)' : 'transparent', marginBottom: 4 }}>📚 Todos os mapas ({store.mapas.length})</div>}
            <PastaTree pid={null} depth={0} />
            {store.pastas.length === 0 && <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', padding: '6px 8px' }}>Crie pastas por disciplina e aninhe subtópicos. Cada pasta tem cor própria (🎨).</div>}
          </div>
        </div>
        {/* área principal */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {mapaAtual ? (
            // ─── EDITOR DO MAPA ───
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <button onClick={() => { if (!dirty || confirm('Descartar alterações não salvas?')) { setMapaAtual(null); setDirty(false) } }} style={{ ...btn, width: 'auto', padding: '0 10px' }}>← Voltar</button>
                <input value={mapaAtual.titulo} onChange={e => { setMapaAtual((m: any) => ({ ...m, titulo: e.target.value })); setDirty(true) }} placeholder="Título do mapa"
                  style={{ flex: 1, minWidth: 160, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 700, outline: 'none' }} />
                <select value={mapaAtual.pastaId ?? ''} onChange={e => { setMapaAtual((m: any) => ({ ...m, pastaId: e.target.value || null })); setDirty(true) }} style={{ ...inpD, cursor: 'pointer', maxWidth: 180 }}>
                  <option value="">(sem pasta)</option>
                  {store.pastas.map((p: any) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', borderRadius: 8, padding: 2 }}>
                  {([['lista', '☰ Lista'], ['mapa', '🗺 Mapa']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setVista(k)} style={{ ...btn, width: 'auto', padding: '0 10px', fontSize: '.74rem', background: vista === k ? '#7c3aed' : 'transparent', color: vista === k ? '#fff' : 'var(--text-secondary)', border: 'none' }}>{l}</button>
                  ))}
                </div>
                <button onClick={() => exportarPDF(mapaAtual)} title="Exportar em PDF (lista hierárquica)" style={{ ...btn, width: 'auto', padding: '0 10px' }}>⬇ PDF</button>
                <button onClick={salvar} disabled={!store.uid} style={{ height: 32, padding: '0 16px', borderRadius: 8, border: 'none', background: dirty ? '#7c3aed' : '#16a34a', color: '#fff', fontWeight: 700, fontSize: '.84rem', cursor: 'pointer' }}>{dirty ? '💾 Salvar' : '✓ Salvo'}</button>
              </div>
              {vista === 'lista' ? (
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
                  <NoMapaView no={mapaAtual.raiz} depth={0} editId={editId} setEditId={setEditId} ops={ops} />
                  <div style={{ marginTop: 12, fontSize: '.68rem', color: 'var(--text-muted)' }}>Duplo-clique no texto para renomear · use ↑↓ para reordenar, → para aninhar, ← para subir nível · ＋ adiciona filho.</div>
                </div>
              ) : (
                <MapaVisual mapa={mapaAtual} ops={ops} onConector={setConector} />
              )}
            </>
          ) : gerar ? (
            // ─── PAINEL DE GERAÇÃO ───
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, maxWidth: 560 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <button onClick={() => setGerar(false)} style={{ ...btn, width: 'auto', padding: '0 10px' }}>← Voltar</button>
                <b style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Gerar novo mapa</b>
              </div>
              <div style={{ fontSize: '.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>De onde gerar</div>
              {[['insumos', `🗺 Destaques coletados (${insumos?.length || 0})`], ['pagina', '📄 Página atual'], ['intervalo', '📑 Intervalo de páginas']].map(([k, l]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 10, border: `1px solid ${fonte === k ? '#7c3aed' : 'var(--border)'}`, background: fonte === k ? 'rgba(124,58,237,.08)' : 'var(--surface)', marginBottom: 8, cursor: 'pointer' }}>
                  <input type="radio" checked={fonte === k} onChange={() => setFonte(k as any)} style={{ accentColor: '#7c3aed' }} />
                  <span style={{ fontSize: '.86rem', color: 'var(--text-primary)' }}>{l}</span>
                </label>
              ))}
              {fonte === 'intervalo' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px', paddingLeft: 11 }}>
                  <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Da página</span>
                  <input type="number" min={1} value={de} onChange={e => setDe(+e.target.value)} style={{ ...inpD, width: 70 }} />
                  <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>até</span>
                  <input type="number" min={1} value={ate} onChange={e => setAte(+e.target.value)} style={{ ...inpD, width: 70 }} />
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 11px', borderRadius: 10, border: `1px solid ${leiSeca ? '#7c3aed' : 'var(--border)'}`, background: leiSeca ? 'rgba(124,58,237,.08)' : 'var(--surface)', margin: '6px 0 16px', cursor: 'pointer' }}>
                <input type="checkbox" checked={leiSeca} onChange={e => setLeiSeca(e.target.checked)} style={{ accentColor: '#7c3aed', width: 16, height: 16 }} />
                <span style={{ fontSize: '.86rem', color: 'var(--text-primary)' }}>⚖️ Modo lei seca <span style={{ color: 'var(--text-muted)', fontSize: '.74rem' }}>(estrutura por Artigo → § → inciso → alínea)</span></span>
              </label>
              <button onClick={executarGeracao} disabled={carregando} style={{ width: '100%', height: 44, borderRadius: 11, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 800, fontSize: '.92rem', cursor: 'pointer', opacity: carregando ? .7 : 1 }}>{carregando ? 'Gerando mapa com a IA…' : '✦ Gerar mapa mental'}</button>
            </div>
          ) : (
            // ─── LISTA DE MAPAS DA PASTA ───
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <b style={{ fontSize: '.92rem', color: 'var(--text-primary)' }}>{buscaMapa ? `Resultados para "${buscaMapa}"` : pastaSel === null ? 'Todos os mapas' : (store.pastas.find((p: any) => p.id === pastaSel)?.nome || 'Pasta')}</b>
                <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>({mapasNaPasta.length})</span>
                <span style={{ flex: 1 }} />
                {mapasNaPasta.length > 0 && <button onClick={abrirExport} title="Exportar mapas como PDF/PNG (um por página, visual)" style={{ ...btn, width: 'auto', padding: '0 12px' }}>⬇ Exportar visual</button>}
                <button onClick={() => setGerar(true)} style={{ height: 34, padding: '0 14px', borderRadius: 9, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 700, fontSize: '.84rem', cursor: 'pointer' }}>✦ Novo mapa (gerar)</button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
                {!store.uid ? <div style={{ color: '#EA580C', fontSize: '.86rem', textAlign: 'center', padding: 30 }}>Faça login para criar e salvar mapas.</div>
                  : mapasNaPasta.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.88rem', lineHeight: 1.6, padding: '40px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, color: '#7c3aed' }}><IconMapa size={34} /></div>Nenhum mapa aqui ainda.<br /><span style={{ fontSize: '.78rem' }}>Colete destaques no PDF e clique em <b>Novo mapa</b>.</span>
                    </div>
                  : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
                      {mapasNaPasta.map((m: any) => (
                        <div key={m.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div onClick={() => abrirMapa(m)} style={{ cursor: 'pointer', flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--text-primary)', display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ color: '#7c3aed', display: 'inline-flex' }}><IconMapa size={15} /></span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.titulo}</span></div>
                            <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: 4, overflowWrap: 'anywhere', wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.raiz?.filhos?.length || 0} tópico(s){m.fonte ? ` · ${m.fonte}` : ''}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => abrirMapa(m)} style={{ ...btn, flex: 1, width: 'auto', fontSize: '.76rem' }}>Abrir</button>
                            <button onClick={() => exportarPDF(m)} title="Exportar PDF" style={{ ...btn, width: 30 }}>⬇</button>
                            <button onClick={() => { if (confirm('Excluir o mapa "' + m.titulo + '"?')) store.removerMapa(m.id) }} title="Excluir" style={{ ...btn, width: 30, color: '#DC2626' }}>🗑</button>
                          </div>
                        </div>
                      ))}
                    </div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    {/* sub-modal: exportar vários mapas (visual) */}
    {expOpen && (<>
      <div onMouseDown={() => !expBusy && setExpOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9400 }} />
      <div className="pr-pop" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 9401, width: 'min(520px,94vw)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.45)', padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
          <span style={{ fontSize: '1.05rem' }}>⬇</span><b style={{ color: 'var(--text-primary)' }}>Exportar mapas (visual)</b>
          <span style={{ flex: 1 }} /><button onClick={() => !expBusy && setExpOpen(false)} style={btn}>✕</button>
        </div>
        <div style={{ fontSize: '.74rem', color: 'var(--text-muted)', marginBottom: 12 }}>Cada mapa marcado vira <b>uma página</b>. O PDF é vetorial (zoom sem perder qualidade); o PNG sai em alta resolução.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: '.74rem', fontWeight: 700, color: 'var(--text-muted)' }}>Orientação:</span>
          {([['landscape', 'Paisagem'], ['portrait', 'Retrato']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setExpOrient(k)} style={{ ...btn, width: 'auto', padding: '0 10px', fontSize: '.76rem', background: expOrient === k ? '#7c3aed' : 'var(--surface)', color: expOrient === k ? '#fff' : 'var(--text-secondary)', border: expOrient === k ? 'none' : '1px solid var(--border)' }}>{l}</button>
          ))}
          <span style={{ flex: 1 }} />
          <button onClick={() => setExpSel(expSel.size === mapasNaPasta.length ? new Set() : new Set(mapasNaPasta.map((m: any) => m.id)))} style={{ ...btn, width: 'auto', padding: '0 8px', fontSize: '.72rem' }}>{expSel.size === mapasNaPasta.length ? 'Limpar' : 'Todos'}</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
          {mapasNaPasta.map((m: any) => (
            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)', background: expSel.has(m.id) ? 'rgba(124,58,237,.08)' : 'var(--surface)', cursor: 'pointer' }}>
              <input type="checkbox" checked={expSel.has(m.id)} onChange={() => toggleExp(m.id)} style={{ width: 16, height: 16, accentColor: '#7c3aed' }} />
              <span style={{ flex: 1, fontSize: '.84rem', color: 'var(--text-primary)', fontWeight: 600 }}>{m.titulo}</span>
              <span style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>{m.raiz?.filhos?.length || 0} tópico(s)</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ flex: 1, fontSize: '.72rem', color: 'var(--text-muted)' }}>{expSel.size} mapa(s) selecionado(s)</span>
          <button onClick={exportarPDFVisual} disabled={!expSel.size || expBusy} style={{ height: 34, padding: '0 14px', borderRadius: 9, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 700, fontSize: '.82rem', cursor: 'pointer', opacity: (!expSel.size || expBusy) ? .5 : 1 }}>⬇ PDF ({expSel.size})</button>
          <button onClick={exportarPNGs} disabled={!expSel.size || expBusy} style={{ ...btn, width: 'auto', padding: '0 14px', height: 34 }}>{expBusy ? 'Gerando…' : `⬇ PNG (${expSel.size})`}</button>
        </div>
      </div>
    </>)}
  </>, document.body)
}

export default function PDFReader() {
  const editorRef = useRef<HTMLDivElement>(null)
  const store = usePdfReaderStore()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [previa, setPrevia] = useState<string | null>(null)
  const [cfgIA, setCfgIA] = useState(false)
  const [diario, setDiario] = useState(false)
  const [revisaoOpen, setRevisaoOpen] = useState(false)   // revisão espaçada
  const [split, setSplit] = useState(0.56)
  const [viewMode, setViewMode] = useState<'split' | 'pdf' | 'editor'>('split')               // fração de largura da coluna do PDF
  const [autoEditor, setAutoEditor] = useState(false)   // editor oculto, surge ao passar o mouse na lateral direita
  const [autoHover, setAutoHover] = useState(false)
  const editorAberto = !autoEditor || autoHover
  // ── novos recursos ──
  const fcStore = useFlashcardsStore()                 // feature 2
  const mapStore = useMapasStore()                     // mapas mentais
  const [insumos, setInsumos] = useState<any[]>([])    // destaques coletados p/ mapa
  const [hubMapas, setHubMapas] = useState(false)      // abre o Hub de mapas
  const coletarMapa = useCallback((texto: string, page: number) => { setInsumos(prev => [...prev, { id: newId(), texto, page }]) }, [])
  const [fcGerar, setFcGerar] = useState<{ trecho: string; fonte: string } | null>(null)  // feature 2
  const [fcRevisar, setFcRevisar] = useState(false)    // feature 2
  const viewerApi = useRef<any>({})                    // feature 4/6: ações imperativas do visualizador principal
  const viewerApiB = useRef<any>({})                   // feature 6: visualizador de comparação
  const [pdfAtual, setPdfAtual] = useState<{ name: string; numPages: number } | null>(null)  // feature 4/11
  const [bookmarks, setBookmarks] = useState<any[]>([])  // feature 4 (por arquivo, em localStorage)
  const [foco, setFoco] = useState(false)              // feature 10
  const [comparar, setComparar] = useState(false)      // feature 6
  const focoPrev = useRef<{ sidebar: boolean; view: any } | null>(null)
  // chave de bookmarks por arquivo
  const bmKey = (name: string) => 'nexus_pr_bookmarks_' + name
  const carregarBookmarks = (name: string) => { try { setBookmarks(JSON.parse(localStorage.getItem(bmKey(name)) || '[]')) } catch { setBookmarks([]) } }
  const persistBookmarks = (name: string, list: any[]) => { try { localStorage.setItem(bmKey(name), JSON.stringify(list)) } catch {} }
  const onFileLoaded = useCallback((name: string, numPages: number) => { setPdfAtual({ name, numPages }); carregarBookmarks(name) }, [])
  const addBookmark = useCallback((page: number) => {
    if (!pdfAtual) return
    const rotulo = prompt(`Marcador para a página ${page}:`, `Página ${page}`)
    if (rotulo == null) return
    setBookmarks(prev => { const list = [...prev.filter(b => b.page !== page), { id: newId(), page, rotulo: rotulo.trim() || `Página ${page}` }].sort((a, b) => a.page - b.page); persistBookmarks(pdfAtual.name, list); return list })
  }, [pdfAtual])
  const removeBookmark = useCallback((id: string) => { setBookmarks(prev => { const list = prev.filter(b => b.id !== id); if (pdfAtual) persistBookmarks(pdfAtual.name, list); return list }) }, [pdfAtual])
  const irBookmark = useCallback((page: number) => { viewerApi.current?.gotoPage?.(page) }, [])
  // feature 10: modo foco — oculta sidebar e editor, PDF imersivo
  const toggleFoco = useCallback(() => {
    setFoco(f => {
      if (!f) { focoPrev.current = { sidebar: sidebarOpen, view: viewMode }; setSidebarOpen(false); setViewMode('pdf'); setComparar(false) }
      else { setSidebarOpen(focoPrev.current?.sidebar ?? true); setViewMode(focoPrev.current?.view ?? 'split') }
      return !f
    })
  }, [sidebarOpen, viewMode])
  // feature 2: gerar flashcard a partir de um trecho do PDF
  const gerarFlashcard = useCallback((trecho: string, fonte: string) => { setFcGerar({ trecho, fonte: fonte || '' }) }, [])
  const fcDevidos = useMemo(() => { const h = hojeISO(); return fcStore.cards.filter((c: any) => !c.proxRevisao || c.proxRevisao <= h).length }, [fcStore.cards])
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

  // trecho extraído do PDF → insere no editor (com referência de página — feature 7)
  const onExtract = useCallback((texto: string, page?: number) => {
    const ed = editorRef.current; if (!ed) return
    if (!ed.textContent?.trim()) ed.innerHTML = ''
    const ehResumoOuMulti = /\n/.test(texto)
    if (ehResumoOuMulti) {
      // resumo/multi-linha: cada linha vira um parágrafo. Negrita a 1ª só se for um título (não uma pergunta numerada)
      const primeiraEhPergunta = /^\s*\d+\s*[.)]/.test(texto.split('\n')[0] || '')
      texto.split('\n').forEach((linha, idx) => { const p = document.createElement('p'); p.textContent = linha; if (idx === 0 && !primeiraEhPergunta) p.style.fontWeight = '600'; ed.appendChild(p) })
    } else {
      const p = document.createElement('p')
      p.textContent = texto
      if (page) { const ref = document.createElement('span'); ref.textContent = `  (p. ${page})`; ref.style.cssText = 'color:var(--text-muted);font-size:.8em'; ref.contentEditable = 'false'; p.appendChild(ref) }
      ed.appendChild(p)
    }
    ed.scrollTop = ed.scrollHeight
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
    <div className="pr-app" style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--card-bg)' }}>
      <style>{`
        .pr-app button, .pr-pop button { transition: filter .13s ease, transform .12s ease, box-shadow .13s ease, border-color .13s ease; }
        .pr-app button:not(:disabled):hover, .pr-pop button:not(:disabled):hover { filter: brightness(1.16) saturate(1.1); transform: translateY(-2px) scale(1.06); box-shadow: 0 0 0 2px var(--accent), 0 6px 16px rgba(0,0,0,.28); border-color: var(--accent) !important; z-index: 3; }
        .pr-app button:not(:disabled):active, .pr-pop button:not(:disabled):active { transform: translateY(0) scale(.95); filter: brightness(1.04); }
        .pr-app button:disabled, .pr-pop button:disabled { cursor: default; }
        .pr-card { transition: transform .16s cubic-bezier(.34,1.56,.64,1), box-shadow .16s ease, filter .16s ease !important; }
        .pr-card:hover { transform: translateY(-4px) scale(1.04) !important; box-shadow: 0 12px 24px rgba(0,0,0,.22) !important; filter: saturate(1.12) brightness(1.03) !important; }
        .pr-card:active { transform: translateY(-1px) scale(.99) !important; }
        /* botão "Importar PDF" (é um label com input de arquivo) */
        .pr-app label:has(> input[type="file"]) { transition: filter .13s ease, transform .12s ease, box-shadow .13s ease, border-color .13s ease; }
        .pr-app label:has(> input[type="file"]):hover { filter: brightness(1.16) saturate(1.1); transform: translateY(-2px) scale(1.04); box-shadow: 0 0 0 2px var(--accent), 0 6px 16px rgba(0,0,0,.28); border-color: var(--accent) !important; }
        /* modo pautado/quadriculado: texto (digitado ou colado) casa com as pautas (passo segue a fonte) */
        .pr-ruled, .pr-ruled * { line-height: var(--pr-pitch, 28px) !important; }
        .pr-ruled p, .pr-ruled div, .pr-ruled li, .pr-ruled h1, .pr-ruled h2, .pr-ruled h3, .pr-ruled ul, .pr-ruled ol, .pr-ruled blockquote { margin-top: 0 !important; margin-bottom: 0 !important; }
        /* não força altura de linha dentro de embutidos (post-it, símbolos) */
        .pr-ruled [contenteditable="false"], .pr-ruled [contenteditable="false"] * { line-height: normal !important; }
        /* timer: piscar em vermelho ao terminar */
        @keyframes pr-blink { 0%, 100% { opacity: 1 } 50% { opacity: .2 } }
        .pr-blink { animation: pr-blink .7s steps(1,end) infinite; color: #dc2626 !important; border-color: #dc2626 !important; }
      `}</style>
      <PastasSidebar open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} store={store} docId={docId} onOpenDoc={abrirDoc} onNewDoc={novoDoc}
        bookmarks={bookmarks} pdfNome={pdfAtual?.name} onGotoBookmark={irBookmark} onRemoveBookmark={removeBookmark} />
      {/* linha redimensionável: PDF | divisória | editor */}
      <div ref={rowRef} style={{ flex: 1, minWidth: 0, display: 'flex', position: 'relative' }}>
        {/* coluna PDF */}
        <div style={{ flexBasis: comparar ? '50%' : autoEditor ? '100%' : viewMode === 'editor' ? '0%' : viewMode === 'pdf' ? '100%' : `${split * 100}%`, flexGrow: 0, flexShrink: 0, minWidth: 0, overflow: 'hidden', display: (!autoEditor && !comparar && viewMode === 'editor') ? 'none' : 'block' }}>
          <PdfViewer onExtract={onExtract} viewMode={viewMode} setViewMode={setViewMode}
            viewerApi={viewerApi} onFileLoaded={onFileLoaded} onAddBookmark={addBookmark} onGerarFlashcard={gerarFlashcard} onColetarMapa={coletarMapa} foco={foco} onToggleFoco={toggleFoco} />
        </div>
        {/* feature 6: painel de comparação (segundo PDF) — ocupa o lugar do editor */}
        {comparar && (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderLeft: '2px solid #5b5bd6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--border)', background: 'rgba(91,91,214,.06)' }}>
              <span style={{ fontSize: '.74rem', fontWeight: 700, color: '#5b5bd6' }}>⇆ Comparação (Documento B)</span>
              <span style={{ flex: 1 }} />
              <button onClick={() => setComparar(false)} title="Fechar comparação" style={{ ...btn, width: 'auto', padding: '0 9px', fontSize: '.74rem' }}>✕ Fechar</button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <PdfViewer onExtract={onExtract} viewMode={'pdf'} setViewMode={() => {}} secondary viewerApi={viewerApiB} />
            </div>
          </div>
        )}
        {/* divisória arrastável — só no modo dividido e quando o editor não está em auto-ocultar */}
        {viewMode === 'split' && !autoEditor && !comparar && (
          <div onMouseDown={startSplit} title="Arraste para ajustar" style={{ width: 6, flexShrink: 0, cursor: 'col-resize', background: 'var(--border)' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#5b5bd6')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--border)')} />
        )}
        {/* faixa de detecção na lateral direita — revela o editor no modo auto-ocultar */}
        {autoEditor && !autoHover && !comparar && (
          <div onMouseEnter={() => setAutoHover(true)}
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 18, zIndex: 45, cursor: 'pointer', background: 'linear-gradient(to left, rgba(91,91,214,0.16), transparent)' }}
            title="Passe o mouse para abrir o editor" />
        )}
        {/* coluna editor (drawer quando auto-ocultar) — oculta durante a comparação */}
        <div
          onMouseLeave={() => autoEditor && setAutoHover(false)}
          style={comparar ? { display: 'none' } : autoEditor ? {
            position: 'absolute', top: 0, bottom: 0, right: 0, width: 'min(620px, 52%)', zIndex: 46,
            display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--card-bg)',
            borderLeft: '1px solid var(--border)', boxShadow: editorAberto ? '-12px 0 40px rgba(0,0,0,0.32)' : 'none',
            transform: editorAberto ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
          } : {
            flex: 1, minWidth: 0, display: viewMode === 'pdf' ? 'none' : 'flex', flexDirection: 'column', minHeight: 0,
          }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5, padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>✦</span>
          <input value={titulo} onChange={e => onTitulo(e.target.value)} placeholder="Título do documento" disabled={!store.uid}
            style={{ flex: '1 1 160px', minWidth: 60, maxWidth: 360, border: '1px solid transparent', background: 'transparent', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.88rem', padding: '4px 6px', borderRadius: 7, outline: 'none' }}
            onFocus={e => (e.target.style.border = '1px solid var(--border)')} onBlur={e => (e.target.style.border = '1px solid transparent')} />
          <span title={salvo ? 'Salvo' : 'Não salvo'} style={{ fontSize: '0.8rem', color: salvo ? '#22c55e' : '#EA580C', flexShrink: 0, marginRight: 2 }}>{salvo ? '✓' : '●'}</span>
          {/* Exibir (água, visualização, comparar, IA) — menu suspenso */}
          <HoverMenu align="right" width={270} active={comparar || autoEditor} trigger={<><Icon e="⚙" size={15} /> Exibir</>}>
            <AguaRapida />
            <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', borderRadius: 8, padding: 2 }}>
              {(['pdf', 'split', 'editor'] as const).map(m => (
                <button key={m} onClick={() => { setAutoEditor(false); setViewMode(m) }} title={{ pdf: 'Tela cheia: PDF', split: 'Dividido', editor: 'Tela cheia: Editor' }[m]} style={{ ...btn, width: 30, padding: 0, background: (!autoEditor && viewMode === m) ? '#5b5bd6' : 'transparent', color: (!autoEditor && viewMode === m) ? '#fff' : 'var(--text-secondary)', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon e={{ pdf: '📄', split: '⬜', editor: '✦' }[m]} size={16} /></button>
              ))}
              <button onClick={() => { setAutoEditor(v => !v); setAutoHover(false) }} title={autoEditor ? 'Editor auto-ocultável ATIVO (clique para desativar)' : 'Editor auto-ocultável — PDF em tela cheia; editor surge ao encostar o mouse na direita'} style={{ ...btn, width: 30, padding: 0, background: autoEditor ? '#5b5bd6' : 'transparent', color: autoEditor ? '#fff' : 'var(--text-secondary)', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon e="⇥" size={16} /></button>
            </div>
            <button onClick={() => setComparar(c => !c)} title="Comparar dois PDFs lado a lado" style={{ ...btn, width: 'auto', padding: '0 8px', background: comparar ? '#5b5bd6' : 'var(--surface)', color: comparar ? '#fff' : 'var(--text-secondary)', border: comparar ? 'none' : '1px solid var(--border)' }}>⇆ Comparar</button>
            <button onClick={() => setCfgIA(true)} title="Configurar IA" style={{ ...btn, width: 'auto', padding: '0 8px' }}>⚙ IA</button>
          </HoverMenu>
          {/* Estudo (mapas, flashcards, revisão, diário) — menu suspenso */}
          <HoverMenu align="right" width={250} trigger={<><span>📚</span> Estudo</>}>
            <button onClick={() => setHubMapas(true)} title="Mapas mentais (gerar, organizar e exportar)" style={{ ...btn, width: 'auto', padding: '0 8px', position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5 }}><IconMapa size={16} color="currentColor" /> Mapas{insumos.length > 0 && <span style={{ minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: '0.62rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{insumos.length}</span>}</button>
            <button onClick={() => setFcRevisar(true)} title="Estudo ativo — Flashcards" style={{ ...btn, width: 'auto', padding: '0 8px', position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>🃏 Flashcards{fcDevidos > 0 && <span style={{ minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#EA580C', color: '#fff', fontSize: '0.62rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{fcDevidos}</span>}</button>
            <button onClick={() => setRevisaoOpen(true)} title="Revisão espaçada — acompanhe 48h, 7, 17 e 30 dias" style={{ ...btn, width: 'auto', padding: '0 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>🔁 Revisão</button>
            <button onClick={() => setDiario(true)} title="Diário de Leitura" style={{ ...btn, width: 'auto', padding: '0 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>📖 Diário</button>
          </HoverMenu>
          <button onClick={onSalvar} disabled={!store.uid} title="Salvar (Firestore)" style={{ ...btn, width: 32, padding: 0, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon e="💾" size={16} /></button>
          <button onClick={abrirPrevia} title="Exportar / Imprimir" style={{ ...btn, width: 'auto', padding: '0 11px', fontSize: '0.78rem', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon e="🖨️" size={14} /> Exportar</button>
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
      <Revisao open={revisaoOpen} onClose={() => setRevisaoOpen(false)} />
      {fcGerar && <FlashcardGerarModal trecho={fcGerar.trecho} fonte={fcGerar.fonte} store={fcStore} onClose={(n: number) => { setFcGerar(null); if (n) { /* salvo */ } }} />}
      {fcRevisar && <FlashcardRevisarModal store={fcStore} onClose={() => setFcRevisar(false)} />}
      {hubMapas && <MapaMentalHub store={mapStore} insumos={insumos} onLimparInsumos={() => setInsumos([])} api={viewerApi} onClose={() => setHubMapas(false)} />}
      <style>{`
        .pr-page{position:relative;margin:0 auto 16px;background:#fff;border-radius:4px;box-shadow:0 2px 14px rgba(0,0,0,.18);overflow:hidden;cursor:crosshair}
        .pr-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#c4c4c4;font:600 22px/1 system-ui;z-index:0}
        .pr-page canvas{position:relative;z-index:1;display:block;filter:var(--pr-filter,none)}
        .pr-textlayer{position:absolute;top:0;left:0;overflow:hidden;line-height:1;z-index:3;transform-origin:0 0;opacity:1;user-select:none}
        .pr-textlayer span,.pr-textlayer br{color:transparent;position:absolute;white-space:pre;cursor:crosshair;transform-origin:0 0;user-select:none}
        /* cursor de texto: camada editável (edição bloqueada por JS) → cursor nativo navegável + seleção */
        .pr-textmode .pr-page{cursor:text}
        .pr-textmode .pr-textlayer{caret-color:#5b5bd6;outline:none}
        .pr-textmode .pr-textlayer span{user-select:text !important;cursor:text}
        .pr-textmode .pr-textlayer ::selection{background:rgba(91,91,214,.35)}
        .pr-row{display:flex;align-items:center;gap:4px;padding:5px 6px;border-radius:7px;font-size:.82rem;color:var(--text-secondary)}
        .pr-row:hover{background:var(--surface)}
        .pr-acts{display:none;gap:1px;flex-shrink:0}
        .pr-row:hover .pr-acts{display:flex}
      `}</style>
    </div>
  )
}
