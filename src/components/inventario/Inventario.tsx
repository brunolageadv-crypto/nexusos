import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'
import { formatBRL } from '../../utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}
function newId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4) }

// Datas como meia-noite LOCAL (evita o deslocamento UTC-3)
function parseISO(d?: string): Date | null {
  if (!d) return null
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return null
  return new Date(y, m - 1, day)
}
function todayISO(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}
function addMonths(d: Date, months: number): Date {
  const r = new Date(d.getTime()); r.setMonth(r.getMonth() + months); return r
}
function diffDays(from: Date, to: Date): number {
  const ms = to.setHours(0, 0, 0, 0) - new Date(from).setHours(0, 0, 0, 0)
  return Math.round(ms / 86400000)
}
function isURL(v: string): boolean { return /^https?:\/\/\S+$/i.test((v || '').trim()) }

// Mantém a altura da imagem do card num intervalo equilibrado (contém valores antigos grandes)
function clampAltura(h?: number): number { return Math.min(Math.max(Number(h) || 150, 100), 240) }

// Nota fiscal: guardada como base64 num doc separado (Firestore limita 1 MB/doc)
const MAX_NF_BYTES = 700_000
function fileToDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = () => rej(r.error)
    r.readAsDataURL(file)
  })
}
function dataURLtoBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',')
  const mime = (head.match(/data:(.*?);base64/) || [])[1] || 'application/pdf'
  const bin = atob(b64 || '')
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Status = 'Ativo' | 'Vendido' | 'Doado' | 'Quebrado' | 'Em_Manutenção'
type Recorrencia = '' | 'mensal' | 'anual'

interface Item {
  id: string
  // dados básicos
  nome: string
  descricao: string
  marca: string
  modelo: string
  numero_serie: string
  // dados financeiros
  data_compra: string
  valor_pago: number
  valor_atual_estimado: number
  fornecedor_loja: string
  fornecedor_url: string
  metodo_pagamento: string
  // localização
  comodo: string
  sub_localizacao: string
  // ciclo de vida
  status: Status
  garantia_meses: number
  recorrencia: Recorrencia
  data_validade: string
  // mídia & documentos
  fotos: string[]
  foto_fit: 'cover' | 'contain'
  foto_altura: number
  foto_pos: number
  nota_fiscal_url: string
  tem_nf: boolean
  nota_fiscal_nome: string
  // categorização
  tags: string[]
  criadoEm: number
  updatedAt: number
}

const STATUS_META: Record<Status, { label: string; cor: string; icon: string }> = {
  'Ativo':          { label: 'Ativo',          cor: '#10b981', icon: '✅' },
  'Em_Manutenção':  { label: 'Em Manutenção',  cor: '#f59e0b', icon: '🔧' },
  'Quebrado':       { label: 'Quebrado',       cor: '#ef4444', icon: '💥' },
  'Vendido':        { label: 'Vendido',        cor: '#6366f1', icon: '💰' },
  'Doado':          { label: 'Doado',          cor: '#8b5cf6', icon: '🎁' },
}
const STATUS_LIST: Status[] = ['Ativo', 'Em_Manutenção', 'Quebrado', 'Vendido', 'Doado']

const COMODOS = ['Escritório', 'Sala', 'Quarto', 'Cozinha', 'Banheiro', 'Garagem', 'Lavanderia', 'Área Externa', 'Outro']
const METODOS = ['Cartão de Crédito', 'Cartão de Débito', 'PIX', 'Boleto', 'Dinheiro', 'Transferência', 'Outro']

const TAG_CORES: Record<string, string> = {
  '#eletronicos': '#3b82f6', '#wearables': '#06b6d4', '#servicos_digitais': '#a855f7',
  '#documentos': '#64748b', '#pets': '#f97316', '#moveis': '#b45309',
  '#eletrodomesticos': '#0ea5e9', '#seguro_obrigatorio': '#dc2626', '#ferramentas': '#84cc16',
  '#veiculo': '#475569', '#vestuario': '#ec4899', '#livros': '#9333ea',
}
const TAGS_SUGERIDAS = Object.keys(TAG_CORES).filter(t => t !== '#seguro_obrigatorio')
function tagCor(tag: string): string { return TAG_CORES[tag] || '#7c8499' }

const KEYWORD_TAGS: { kw: string[]; tag: string }[] = [
  { kw: ['iphone', 'smartphone', 'celular', 'notebook', 'laptop', 'tv', 'televisão', 'monitor', 'computador', 'pc', 'tablet', 'ipad', 'console', 'playstation', 'xbox', 'nintendo', 'câmera', 'camera', 'drone', 'roteador'], tag: '#eletronicos' },
  { kw: ['smartwatch', 'watch', 'fone', 'airpods', 'headset', 'pulseira', 'relógio inteligente', 'wearable', 'galaxy watch'], tag: '#wearables' },
  { kw: ['game pass', 'steam', 'netflix', 'spotify', 'assinatura', 'chatgpt', 'claude', 'gemini', 'office 365', 'icloud', 'youtube premium', 'disney', 'prime'], tag: '#servicos_digitais' },
  { kw: ['certidão', 'contrato', 'recibo', 'nota fiscal', 'documento', 'rg', 'cpf', 'escritura', 'apólice'], tag: '#documentos' },
  { kw: ['vacina', 'ração', 'racao', 'vet', 'veterinário', 'pet', 'cachorro', 'gato', 'antipulgas', 'vermífugo'], tag: '#pets' },
  { kw: ['sofá', 'sofa', 'mesa', 'cadeira', 'armário', 'armario', 'cama', 'estante', 'rack', 'guarda-roupa', 'poltrona', 'móvel', 'movel'], tag: '#moveis' },
  { kw: ['geladeira', 'fogão', 'fogao', 'microondas', 'máquina de lavar', 'maquina de lavar', 'lava-louças', 'air fryer', 'cafeteira', 'liquidificador', 'eletrodoméstico'], tag: '#eletrodomesticos' },
  { kw: ['furadeira', 'parafusadeira', 'serra', 'martelo', 'ferramenta', 'chave de fenda', 'esmerilhadeira'], tag: '#ferramentas' },
  { kw: ['carro', 'moto', 'veículo', 'veiculo', 'pneu', 'bateria automotiva'], tag: '#veiculo' },
]
function sugerirTags(item: Pick<Item, 'nome' | 'descricao' | 'marca' | 'modelo' | 'recorrencia'>): string[] {
  const texto = `${item.nome} ${item.descricao} ${item.marca} ${item.modelo}`.toLowerCase()
  const out = new Set<string>()
  for (const { kw, tag } of KEYWORD_TAGS) if (kw.some(k => texto.includes(k))) out.add(tag)
  if (item.recorrencia) out.add('#servicos_digitais')
  return Array.from(out)
}

// Regras de negócio ----------------------------------------------------------
function dataExpiracaoGarantia(item: Item): Date | null {
  const base = parseISO(item.data_compra)
  if (!base || !item.garantia_meses) return null
  return addMonths(base, item.garantia_meses)
}
function depreciacaoSugerida(item: Item): number | null {
  const base = parseISO(item.data_compra)
  if (!base || !item.valor_pago) return null
  if (diffDays(base, new Date()) / 365 < 2) return null
  return Math.round(item.valor_pago * 0.85 * 100) / 100
}
function proximaRenovacao(item: Item): Date | null {
  if (!item.recorrencia) return null
  const base = parseISO(item.data_compra)
  if (!base) return null
  const passo = item.recorrencia === 'anual' ? 12 : 1
  let d = new Date(base.getTime()); const hoje = new Date(); let g = 0
  while (d.getTime() < hoje.setHours(0, 0, 0, 0) && g < 600) { d = addMonths(d, passo); g++ }
  return d
}
function ehSeguroObrigatorio(item: Item): boolean { return (item.valor_atual_estimado || 0) > 5000 }

// ─── Alertas ──────────────────────────────────────────────────────────────────
type AlertaTipo = 'garantia_vencida' | 'garantia' | 'assinatura' | 'validade'
interface Alerta { tipo: AlertaTipo; item: Item; dias: number; data: Date; msg: string }

function computarAlertas(itens: Item[]): Alerta[] {
  const hoje = new Date(); const out: Alerta[] = []
  for (const item of itens) {
    if (item.status === 'Vendido' || item.status === 'Doado') continue
    const gar = dataExpiracaoGarantia(item)
    if (gar) {
      const d = diffDays(hoje, gar)
      if (d < 0) out.push({ tipo: 'garantia_vencida', item, dias: d, data: gar, msg: `Garantia vencida há ${Math.abs(d)} dia(s)` })
      else if (d <= 30) out.push({ tipo: 'garantia', item, dias: d, data: gar, msg: `Garantia vence em ${d} dia(s)` })
    }
    const ren = proximaRenovacao(item)
    if (ren) { const d = diffDays(hoje, ren); if (d >= 0 && d <= 15) out.push({ tipo: 'assinatura', item, dias: d, data: ren, msg: `Renovação ${item.recorrencia} em ${d} dia(s)` }) }
    const val = parseISO(item.data_validade)
    if (val) {
      const d = diffDays(hoje, val)
      if (d >= 0 && d <= 30) out.push({ tipo: 'validade', item, dias: d, data: val, msg: `Validade/vencimento em ${d} dia(s)` })
      else if (d < 0) out.push({ tipo: 'validade', item, dias: d, data: val, msg: `Validade vencida há ${Math.abs(d)} dia(s)` })
    }
  }
  return out.sort((a, b) => a.dias - b.dias)
}

function itemVazio(): Item {
  return {
    id: newId(), nome: '', descricao: '', marca: '', modelo: '', numero_serie: '',
    data_compra: todayISO(), valor_pago: 0, valor_atual_estimado: 0, fornecedor_loja: '', fornecedor_url: '', metodo_pagamento: '',
    comodo: '', sub_localizacao: '', status: 'Ativo', garantia_meses: 12, recorrencia: '', data_validade: '',
    fotos: [], foto_fit: 'cover', foto_altura: 150, foto_pos: 50, nota_fiscal_url: '', tem_nf: false, nota_fiscal_nome: '',
    tags: [], criadoEm: Date.now(), updatedAt: Date.now(),
  }
}

// ─── UI atômicos ────────────────────────────────────────────────────────────
function Campo({ label, children, span, hint }: { label: string; children: React.ReactNode; span?: number; hint?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: span ? `span ${span}` : undefined }}>
      <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', opacity: 0.85 }}>{hint}</span>}
    </label>
  )
}
const inputStyle: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-md)',
  background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', width: '100%',
}
function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  const c = tagCor(tag)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, color: c, background: `${c}18`, border: `1px solid ${c}40` }}>
      {tag}{onRemove && <button onClick={onRemove} style={{ background: 'none', border: 'none', color: c, cursor: 'pointer', fontSize: '0.8rem', lineHeight: 1, padding: 0 }}>×</button>}
    </span>
  )
}
function SecTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>{children}</div>
}
const linkChip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 8,
  fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none', border: '1px solid var(--border-md)', background: 'var(--bg-1)', color: 'var(--text-secondary)',
}

// ═══════════════════════════════════════════════════════════════════════════
export default function Inventario() {
  const uid = useUid()
  const [itens, setItens] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'itens' | 'alertas' | 'relatorio'>('itens')

  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'Todos' | Status>('Todos')
  const [filtroTag, setFiltroTag] = useState('Todas')
  const [filtroComodo, setFiltroComodo] = useState('Todos')
  const [ordenacao, setOrdenacao] = useState<'recentes' | 'valor_desc' | 'valor_asc' | 'nome' | 'compra'>('recentes')

  const [editando, setEditando] = useState<Item | null>(null)
  const [novaTag, setNovaTag] = useState('')

  useEffect(() => {
    if (!uid || !db) return
    return onSnapshot(collection(db, 'users', uid, 'inventario'), snap => {
      setItens(snap.docs.map(d => ({ ...itemVazio(), ...(d.data() as Item), id: d.id })))
      setLoading(false)
    })
  }, [uid])

  async function salvar(item: Item) {
    if (!uid || !db) return
    const tags = new Set(item.tags)
    if (ehSeguroObrigatorio(item)) tags.add('#seguro_obrigatorio'); else tags.delete('#seguro_obrigatorio')
    const final: Item = { ...item, tags: Array.from(tags), updatedAt: Date.now() }
    await setDoc(doc(db, 'users', uid, 'inventario', final.id), clean(final))
    setEditando(null)
  }
  async function remover(item: Item) {
    if (!uid || !db) return
    if (!window.confirm(`Remover "${item.nome || 'item'}" do inventário?`)) return
    if (item.tem_nf) { try { await deleteDoc(doc(db, 'users', uid, 'inventario_anexos', item.id)) } catch { /* anexo já removido */ } }
    await deleteDoc(doc(db, 'users', uid, 'inventario', item.id))
  }

  async function abrirNF(item: Item) {
    if (!uid || !db) return
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'inventario_anexos', item.id))
      const dataUrl = snap.exists() ? (snap.data().nf_base64 as string) : ''
      if (!dataUrl) { window.alert('Nota fiscal não encontrada.'); return }
      const url = URL.createObjectURL(dataURLtoBlob(dataUrl))
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch { window.alert('Não foi possível abrir a nota fiscal.') }
  }

  const alertas = useMemo(() => computarAlertas(itens), [itens])
  const todasTags = useMemo(() => { const s = new Set<string>(); itens.forEach(i => i.tags.forEach(t => s.add(t))); return Array.from(s).sort() }, [itens])
  const comodosUsados = useMemo(() => { const s = new Set<string>(); itens.forEach(i => { if (i.comodo) s.add(i.comodo) }); return Array.from(s).sort() }, [itens])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const arr = itens.filter(i => {
      if (filtroStatus !== 'Todos' && i.status !== filtroStatus) return false
      if (filtroTag !== 'Todas' && !i.tags.includes(filtroTag)) return false
      if (filtroComodo !== 'Todos' && i.comodo !== filtroComodo) return false
      if (!q) return true
      return [i.nome, i.descricao, i.numero_serie, i.marca, i.modelo, i.fornecedor_loja, ...i.tags].some(v => (v || '').toLowerCase().includes(q))
    })
    const sorters: Record<typeof ordenacao, (a: Item, b: Item) => number> = {
      recentes: (a, b) => b.updatedAt - a.updatedAt,
      valor_desc: (a, b) => (b.valor_atual_estimado || 0) - (a.valor_atual_estimado || 0),
      valor_asc: (a, b) => (a.valor_atual_estimado || 0) - (b.valor_atual_estimado || 0),
      nome: (a, b) => (a.nome || '').localeCompare(b.nome || ''),
      compra: (a, b) => (b.data_compra || '').localeCompare(a.data_compra || ''),
    }
    return [...arr].sort(sorters[ordenacao])
  }, [itens, busca, filtroStatus, filtroTag, filtroComodo, ordenacao])

  const ativos = useMemo(() => itens.filter(i => i.status !== 'Vendido' && i.status !== 'Doado'), [itens])
  const patrimonio = useMemo(() => ativos.reduce((s, i) => s + (i.valor_atual_estimado || 0), 0), [ativos])
  const totalPago = useMemo(() => itens.reduce((s, i) => s + (i.valor_pago || 0), 0), [itens])
  const investidoAtivos = useMemo(() => ativos.reduce((s, i) => s + (i.valor_pago || 0), 0), [ativos])
  const variacao = investidoAtivos > 0 ? Math.round(((patrimonio - investidoAtivos) / investidoAtivos) * 100) : 0

  const distribuicao = useMemo(() => {
    const map: Record<string, { valor: number; qtd: number }> = {}
    ativos.forEach(i => {
      const cats = i.tags.filter(t => t !== '#seguro_obrigatorio')
      const usadas = cats.length ? cats : ['#sem_categoria']
      usadas.forEach(t => { if (!map[t]) map[t] = { valor: 0, qtd: 0 }; map[t].valor += (i.valor_atual_estimado || 0) / usadas.length; map[t].qtd += 1 })
    })
    return Object.entries(map).map(([tag, v]) => ({ tag, ...v })).sort((a, b) => b.valor - a.valor)
  }, [ativos])

  const distribuicaoComodo = useMemo(() => {
    const map: Record<string, { valor: number; qtd: number }> = {}
    ativos.forEach(i => { const k = i.comodo || 'Sem local'; if (!map[k]) map[k] = { valor: 0, qtd: 0 }; map[k].valor += (i.valor_atual_estimado || 0); map[k].qtd += 1 })
    return Object.entries(map).map(([comodo, v]) => ({ comodo, ...v })).sort((a, b) => b.valor - a.valor)
  }, [ativos])

  const resumoStatus = useMemo(() => STATUS_LIST.map(s => {
    const list = itens.filter(i => i.status === s)
    return { status: s, qtd: list.length, valor: list.reduce((a, i) => a + (i.valor_atual_estimado || 0), 0) }
  }).filter(r => r.qtd > 0), [itens])

  const topItens = useMemo(() => [...ativos].sort((a, b) => (b.valor_atual_estimado || 0) - (a.valor_atual_estimado || 0)).slice(0, 5), [ativos])
  const criticos = useMemo(() => itens.filter(i => i.status === 'Quebrado' || i.status === 'Em_Manutenção'), [itens])

  function exportarCSV() {
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`
    const linhas = [['Nome', 'Marca/Modelo', 'Valor Atual', 'Valor Pago', 'Status', 'Localização', 'Tags'].join(';')]
    filtrados.forEach(i => {
      const loc = [i.comodo, i.sub_localizacao].filter(Boolean).join(' / ')
      linhas.push([esc(i.nome), esc([i.marca, i.modelo].filter(Boolean).join(' ')), esc(formatBRL(i.valor_atual_estimado || 0)), esc(formatBRL(i.valor_pago || 0)), esc(STATUS_META[i.status].label), esc(loc), esc(i.tags.join(' '))].join(';'))
    })
    const blob = new Blob(['\uFEFF' + linhas.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `inventario_${todayISO()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>Carregando inventário…</div>

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1320, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.6rem' }}>📦</span>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.5rem', color: 'var(--text-primary)' }}>Inventário</h1>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>Gestão de patrimônio · {itens.length} item(ns) · {alertas.length} alerta(s)</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportarCSV} style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>⬇ CSV</button>
          <button onClick={() => { setEditando(itemVazio()); setNovaTag('') }} style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: '#fff', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(14,165,233,0.3)' }}>+ Adicionar</button>
        </div>
      </div>

      {/* Cards-resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 18 }}>
        {([
          ['Patrimônio (atual)', formatBRL(patrimonio), '#10b981', '💎'],
          ['Total investido', formatBRL(totalPago), '#6366f1', '🧾'],
          ['Variação (ativos)', `${variacao > 0 ? '+' : ''}${variacao}%`, variacao >= 0 ? '#10b981' : '#ef4444', '📈'],
          ['Itens ativos', String(ativos.length), '#0ea5e9', '✅'],
          ['Alertas', String(alertas.length), alertas.length ? '#f59e0b' : '#94a3b8', '🔔'],
        ] as const).map(([l, v, c, ic]) => (
          <div key={l} style={{ padding: '14px 16px', borderRadius: 14, border: `1px solid ${c}25`, background: `linear-gradient(135deg,${c}0d,transparent)` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'var(--font-mono)' }}>{l}</span>
              <span style={{ fontSize: '1.05rem' }}>{ic}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.3rem', color: c, lineHeight: 1 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 2 }}>
        {([['itens', '📋 Itens'], ['alertas', `🔔 Alertas${alertas.length ? ` (${alertas.length})` : ''}`], ['relatorio', '📊 Relatório']] as const).map(([id, lb]) => (
          <button key={id} onClick={() => setAba(id)} style={{ padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: aba === id ? 800 : 500, color: aba === id ? 'var(--text-accent)' : 'var(--text-muted)', borderBottom: `2px solid ${aba === id ? 'var(--accent)' : 'transparent'}`, marginBottom: -3 }}>{lb}</button>
        ))}
      </div>

      {/* ════════ ABA: ITENS ════════ */}
      {aba === 'itens' && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔍 Buscar (nome, série, loja, tag…)" style={{ ...inputStyle, width: 240 }} />
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as any)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="Todos">Status: Todos</option>
              {STATUS_LIST.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
            <select value={filtroComodo} onChange={e => setFiltroComodo(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="Todos">Cômodo: Todos</option>
              {comodosUsados.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filtroTag} onChange={e => setFiltroTag(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="Todas">Tag: Todas</option>
              {todasTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={ordenacao} onChange={e => setOrdenacao(e.target.value as any)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="recentes">↕ Recentes</option>
              <option value="valor_desc">↓ Maior valor</option>
              <option value="valor_asc">↑ Menor valor</option>
              <option value="nome">A–Z</option>
              <option value="compra">Compra recente</option>
            </select>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{filtrados.length} resultado(s)</span>
            {(busca || filtroStatus !== 'Todos' || filtroTag !== 'Todas' || filtroComodo !== 'Todos') && (
              <button onClick={() => { setBusca(''); setFiltroStatus('Todos'); setFiltroTag('Todas'); setFiltroComodo('Todos') }} style={{ fontSize: '0.7rem', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-muted)', cursor: 'pointer' }}>Limpar filtros</button>
            )}
          </div>

          {filtrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📦</div>
              {itens.length === 0 ? 'Nenhum item ainda. Clique em “+ Adicionar”.' : 'Nenhum item corresponde aos filtros.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 290px), 290px))', gap: 14, justifyContent: 'start' }}>
              {filtrados.map(item => {
                const sm = STATUS_META[item.status]
                const gar = dataExpiracaoGarantia(item)
                const dep = depreciacaoSugerida(item)
                const ren = proximaRenovacao(item)
                const loc = [item.comodo, item.sub_localizacao].filter(Boolean).join(' / ')
                const foto = item.fotos.find(isURL)
                return (
                  <div key={item.id} style={{ borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-xs)', overflow: 'hidden' }}>
                    {foto && (
                      <div style={{ width: '100%', height: clampAltura(item.foto_altura), background: 'var(--bg-3)', borderBottom: '1px solid var(--border)', overflow: 'hidden' }}>
                        <img src={foto} alt={item.nome} loading="lazy" onError={e => { const el = e.currentTarget.parentElement as HTMLElement | null; if (el) el.style.display = 'none' }}
                          style={{ width: '100%', height: '100%', objectFit: item.foto_fit || 'cover', objectPosition: `50% ${item.foto_pos ?? 50}%`, display: 'block' }} />
                      </div>
                    )}
                    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome || 'Sem nome'}</div>
                          {(item.marca || item.modelo) && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{[item.marca, item.modelo].filter(Boolean).join(' · ')}</div>}
                        </div>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: '0.64rem', fontWeight: 700, color: sm.cor, background: `${sm.cor}18`, whiteSpace: 'nowrap' }}>{sm.icon} {sm.label}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.2rem', color: '#10b981' }}>{formatBRL(item.valor_atual_estimado || 0)}</span>
                        {item.valor_pago > 0 && (
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>pago {formatBRL(item.valor_pago)}</span>
                        )}
                      </div>

                      {loc && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>📍 {loc}</div>}

                      {item.tags.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{item.tags.map(t => <TagChip key={t} tag={t} />)}</div>}

                      {(item.fornecedor_loja || item.nota_fiscal_url || item.tem_nf) && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          {item.fornecedor_loja && (isURL(item.fornecedor_url)
                            ? <a href={item.fornecedor_url} target="_blank" rel="noopener noreferrer" style={linkChip}>🛍️ {item.fornecedor_loja}</a>
                            : <span style={{ ...linkChip, cursor: 'default' }}>🛍️ {item.fornecedor_loja}</span>)}
                          {isURL(item.nota_fiscal_url)
                            ? <a href={item.nota_fiscal_url} target="_blank" rel="noopener noreferrer" style={linkChip}>📄 Nota fiscal</a>
                            : item.tem_nf ? <button onClick={() => abrirNF(item)} style={{ ...linkChip, cursor: 'pointer' }}>📄 Nota fiscal</button> : null}
                        </div>
                      )}

                      {(gar || ren) && (
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {gar && <span>🛡️ Garantia até {gar.toLocaleDateString('pt-BR')}</span>}
                          {ren && <span>🔁 Renova em {ren.toLocaleDateString('pt-BR')} ({item.recorrencia})</span>}
                        </div>
                      )}

                      {dep && Math.abs((item.valor_atual_estimado || 0) - dep) > 0.5 && (
                        <button onClick={() => salvar({ ...item, valor_atual_estimado: dep })} style={{ alignSelf: 'flex-start', fontSize: '0.66rem', padding: '4px 9px', borderRadius: 8, border: '1px dashed #f59e0b66', background: '#f59e0b12', color: '#b45309', cursor: 'pointer', fontWeight: 600 }}>📉 Depreciar -15% → {formatBRL(dep)}</button>
                      )}

                      <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 6 }}>
                        <button onClick={() => { setEditando({ ...item }); setNovaTag('') }} style={{ flex: 1, padding: '6px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>✏️ Editar</button>
                        <button onClick={() => remover(item)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ef444433', background: '#ef444412', color: '#ef4444', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>🗑️</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ════════ ABA: ALERTAS ════════ */}
      {aba === 'alertas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {alertas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✅</div>Nenhum alerta pendente. Tudo em dia!
            </div>
          ) : alertas.map((a, i) => {
            const critico = a.dias < 0
            const cor = critico ? '#ef4444' : a.tipo === 'assinatura' ? '#a855f7' : '#f59e0b'
            const icon = a.tipo.startsWith('garantia') ? '🛡️' : a.tipo === 'assinatura' ? '🔁' : '📅'
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, border: `1px solid ${cor}33`, background: `${cor}0d` }}>
                <span style={{ fontSize: '1.3rem' }}>{icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{a.item.nome || 'Sem nome'}</div>
                  <div style={{ fontSize: '0.72rem', color: cor, fontWeight: 600 }}>{a.msg} · {a.data.toLocaleDateString('pt-BR')}</div>
                </div>
                <button onClick={() => { setEditando({ ...a.item }); setNovaTag('') }} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>Ver item</button>
              </div>
            )
          })}
        </div>
      )}

      {/* ════════ ABA: RELATÓRIO ════════ */}
      {aba === 'relatorio' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: 16 }}>
          {/* Patrimônio investido vs atual */}
          <ReportBox title="Investido × Patrimônio atual">
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <Metric label="Investido (ativos)" valor={formatBRL(investidoAtivos)} cor="#6366f1" />
              <Metric label="Valor atual" valor={formatBRL(patrimonio)} cor="#10b981" />
              <Metric label="Variação" valor={`${variacao > 0 ? '+' : ''}${variacao}%`} cor={variacao >= 0 ? '#10b981' : '#ef4444'} />
            </div>
          </ReportBox>

          {/* Resumo por status */}
          <ReportBox title="Resumo por status">
            {resumoStatus.length === 0 ? <Vazio /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {resumoStatus.map(r => (
                  <div key={r.status} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 11px', borderRadius: 10, background: 'var(--bg-1)' }}>
                    <span>{STATUS_META[r.status].icon}</span>
                    <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>{STATUS_META[r.status].label}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.qtd}×</span>
                    <span style={{ fontSize: '0.78rem', color: STATUS_META[r.status].cor, fontWeight: 700, minWidth: 90, textAlign: 'right' }}>{formatBRL(r.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </ReportBox>

          {/* Distribuição por categoria */}
          <ReportBox title="Distribuição por categoria">
            {distribuicao.length === 0 ? <Vazio /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {distribuicao.map(({ tag, valor, qtd }) => {
                  const pct = patrimonio > 0 ? Math.round((valor / patrimonio) * 100) : 0
                  const c = tagCor(tag)
                  return (
                    <Barra key={tag} label={tag} sub={`${qtd} item(ns)`} valor={formatBRL(valor)} pct={pct} cor={c} />
                  )
                })}
              </div>
            )}
          </ReportBox>

          {/* Distribuição por cômodo */}
          <ReportBox title="Distribuição por cômodo">
            {distribuicaoComodo.length === 0 ? <Vazio /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {distribuicaoComodo.map(({ comodo, valor, qtd }) => {
                  const pct = patrimonio > 0 ? Math.round((valor / patrimonio) * 100) : 0
                  return <Barra key={comodo} label={comodo} sub={`${qtd} item(ns)`} valor={formatBRL(valor)} pct={pct} cor="#0ea5e9" />
                })}
              </div>
            )}
          </ReportBox>

          {/* Top 5 mais valiosos */}
          <ReportBox title="🏆 Mais valiosos">
            {topItens.length === 0 ? <Vazio /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {topItens.map((i, idx) => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 11px', borderRadius: 10, background: 'var(--bg-1)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--text-muted)', fontSize: '0.78rem' }}>{idx + 1}</span>
                    <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.nome}</span>
                    <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 700 }}>{formatBRL(i.valor_atual_estimado || 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </ReportBox>

          {/* Itens críticos */}
          <ReportBox title="⚠️ Itens críticos">
            {criticos.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Nenhum item crítico. 👍</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {criticos.map(i => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'var(--bg-1)' }}>
                    <span>{STATUS_META[i.status].icon}</span>
                    <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{i.nome}</span>
                    <span style={{ fontSize: '0.7rem', color: STATUS_META[i.status].cor, fontWeight: 700 }}>{STATUS_META[i.status].label}</span>
                  </div>
                ))}
              </div>
            )}
          </ReportBox>
        </div>
      )}

      {editando && <ModalItem item={editando} uid={uid} onChange={setEditando} onClose={() => setEditando(null)} onSave={() => salvar(editando)} onAbrirNF={abrirNF} novaTag={novaTag} setNovaTag={setNovaTag} />}
    </div>
  )
}

// Componentes do relatório -----------------------------------------------------
function ReportBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 18, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)' }}>
      <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}
function Vazio() { return <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sem dados ainda.</div> }
function Metric({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.25rem', color: cor }}>{valor}</div>
    </div>
  )
}
function Barra({ label, sub, valor, pct, cor }: { label: string; sub: string; valor: string; pct: number; cor: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: 4 }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{label} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {sub}</span></span>
        <span style={{ color: cor, fontWeight: 700 }}>{valor} ({pct}%)</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 4, transition: 'width 0.6s' }} />
      </div>
    </div>
  )
}

// ─── Modal de edição/criação ─────────────────────────────────────────────────
function ModalItem({ item, uid, onChange, onClose, onSave, onAbrirNF, novaTag, setNovaTag }: {
  item: Item; uid: string | null; onChange: (i: Item) => void; onClose: () => void; onSave: () => void; onAbrirNF: (i: Item) => void; novaTag: string; setNovaTag: (s: string) => void
}) {
  const set = <K extends keyof Item>(k: K, v: Item[K]) => onChange({ ...item, [k]: v })
  const sugeridas = sugerirTags(item).filter(t => !item.tags.includes(t))
  const seguro = ehSeguroObrigatorio(item)
  const garExp = dataExpiracaoGarantia(item)
  const foto = item.fotos.find(isURL)
  const fornecedorUrlInvalido = item.fornecedor_url.trim() !== '' && !isURL(item.fornecedor_url)
  const fotoUrlInvalido = (item.fotos[0] || '').trim() !== '' && !isURL(item.fotos[0] || '')

  const [uploading, setUploading] = useState(false)
  const [uploadErro, setUploadErro] = useState('')

  async function enviarNF(file: File | undefined) {
    if (!file) return
    setUploadErro('')
    if (file.type !== 'application/pdf') { setUploadErro('Selecione um arquivo PDF.'); return }
    if (file.size > MAX_NF_BYTES) { setUploadErro(`PDF muito grande (${(file.size / 1024).toFixed(0)} KB). Máximo ~${Math.round(MAX_NF_BYTES / 1024)} KB — comprima o PDF e tente novamente.`); return }
    if (!uid || !db) { setUploadErro('Sem conexão com o banco de dados.'); return }
    setUploading(true)
    try {
      const dataUrl = await fileToDataURL(file)
      await setDoc(doc(db, 'users', uid, 'inventario_anexos', item.id), { nf_base64: dataUrl, nome: file.name, updatedAt: Date.now() })
      onChange({ ...item, tem_nf: true, nota_fiscal_nome: file.name, nota_fiscal_url: '' })
    } catch {
      setUploadErro('Falha ao salvar o PDF. Tente um arquivo menor.')
    } finally { setUploading(false) }
  }

  async function removerNF() {
    if (uid && db && item.tem_nf) { try { await deleteDoc(doc(db, 'users', uid, 'inventario_anexos', item.id)) } catch { /* noop */ } }
    onChange({ ...item, tem_nf: false, nota_fiscal_url: '', nota_fiscal_nome: '' })
    setUploadErro('')
  }

  function addTag(t: string) {
    const tag = t.startsWith('#') ? t.trim() : `#${t.trim()}`
    if (tag === '#' || item.tags.includes(tag)) return
    onChange({ ...item, tags: [...item.tags, tag] }); setNovaTag('')
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 740, background: 'var(--bg-2)', borderRadius: 18, border: '1px solid var(--border-md)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'linear-gradient(135deg,rgba(14,165,233,0.12),rgba(99,102,241,0.06))', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{item.nome ? 'Editar item' : 'Novo item'}</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'var(--bg-3)', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '72vh', overflowY: 'auto' }}>
          {/* Dados básicos */}
          <section>
            <SecTitle>Dados básicos</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
              <Campo label="Nome *" span={2}><input style={inputStyle} value={item.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: iPhone 15 Pro Max" /></Campo>
              <Campo label="Descrição" span={2}><input style={inputStyle} value={item.descricao} onChange={e => set('descricao', e.target.value)} /></Campo>
              <Campo label="Marca"><input style={inputStyle} value={item.marca} onChange={e => set('marca', e.target.value)} /></Campo>
              <Campo label="Modelo"><input style={inputStyle} value={item.modelo} onChange={e => set('modelo', e.target.value)} /></Campo>
              <Campo label="Nº de série" span={2}><input style={inputStyle} value={item.numero_serie} onChange={e => set('numero_serie', e.target.value)} /></Campo>
            </div>
          </section>

          {/* Financeiro */}
          <section>
            <SecTitle>Dados financeiros</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
              <Campo label="Data da compra"><input type="date" style={inputStyle} value={item.data_compra} onChange={e => set('data_compra', e.target.value)} /></Campo>
              <Campo label="Valor pago (R$)"><input type="number" min="0" step="0.01" style={inputStyle} value={item.valor_pago || ''} onChange={e => set('valor_pago', Math.max(0, Number(e.target.value) || 0))} /></Campo>
              <Campo label="Valor atual estimado (R$)" hint="Independente do valor pago — pode ser maior ou menor.">
                <input type="number" min="0" step="0.01" style={inputStyle} value={item.valor_atual_estimado || ''} onChange={e => set('valor_atual_estimado', Math.max(0, Number(e.target.value) || 0))} />
                {item.valor_pago > 0 && item.valor_atual_estimado !== item.valor_pago && (
                  <button onClick={() => set('valor_atual_estimado', item.valor_pago)} style={{ alignSelf: 'flex-start', marginTop: 4, fontSize: '0.64rem', padding: '3px 8px', borderRadius: 7, border: '1px solid var(--border-md)', background: 'var(--bg-1)', color: 'var(--text-muted)', cursor: 'pointer' }}>↻ igualar ao valor pago</button>
                )}
              </Campo>
              <Campo label="Fornecedor / loja"><input style={inputStyle} value={item.fornecedor_loja} onChange={e => set('fornecedor_loja', e.target.value)} placeholder="Ex: Amazon, Magalu…" /></Campo>
              <Campo label="Link da loja" hint={fornecedorUrlInvalido ? '⚠ URL inválida (use https://…)' : 'Opcional — abre a loja em nova aba.'}>
                <input style={{ ...inputStyle, borderColor: fornecedorUrlInvalido ? '#ef4444' : undefined }} value={item.fornecedor_url} onChange={e => set('fornecedor_url', e.target.value)} placeholder="https://loja.com/produto" />
              </Campo>
              <Campo label="Método de pagamento" span={2}>
                <select style={inputStyle} value={item.metodo_pagamento} onChange={e => set('metodo_pagamento', e.target.value)}>
                  <option value="">—</option>
                  {METODOS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Campo>
            </div>
            {(() => { const dep = depreciacaoSugerida(item); return dep && Math.abs((item.valor_atual_estimado || 0) - dep) > 0.5 ? (
              <button onClick={() => set('valor_atual_estimado', dep)} style={{ marginTop: 8, fontSize: '0.7rem', padding: '6px 12px', borderRadius: 8, border: '1px dashed #f59e0b66', background: '#f59e0b12', color: '#b45309', cursor: 'pointer', fontWeight: 600 }}>📉 Compra há +2 anos — sugerir -15% (→ {formatBRL(dep)})</button>
            ) : null })()}
          </section>

          {/* Mídia & Documentos */}
          <section>
            <SecTitle>Mídia & documentos</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <Campo label="Foto (URL da imagem)" hint={fotoUrlInvalido ? '⚠ URL inválida (use https://…)' : 'A imagem aparece no card do item.'}>
                <input style={{ ...inputStyle, borderColor: fotoUrlInvalido ? '#ef4444' : undefined }} value={item.fotos[0] || ''} onChange={e => set('fotos', e.target.value.trim() ? [e.target.value.trim()] : [])} placeholder="https://…/foto.jpg" />
              </Campo>

              {foto && (
                <div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Prévia — exatamente como aparece no card</div>
                  <div style={{ width: '100%', maxWidth: 290, height: clampAltura(item.foto_altura), background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    <img src={foto} alt="prévia" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                      style={{ width: '100%', height: '100%', objectFit: item.foto_fit || 'cover', objectPosition: `50% ${item.foto_pos ?? 50}%`, display: 'block' }} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12, alignItems: 'flex-end' }}>
                    <div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Ajuste</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {([['cover', 'Preencher'], ['contain', 'Imagem inteira']] as const).map(([f, lb]) => (
                          <button key={f} onClick={() => set('foto_fit', f)} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${item.foto_fit === f ? 'var(--accent)' : 'var(--border-md)'}`, background: item.foto_fit === f ? 'var(--accent)' : 'var(--card-bg)', color: item.foto_fit === f ? '#fff' : 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>{lb}</button>
                        ))}
                      </div>
                    </div>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.66rem', color: 'var(--text-muted)', minWidth: 150 }}>
                      Altura: <strong style={{ color: 'var(--text-secondary)' }}>{clampAltura(item.foto_altura)}px</strong>
                      <input type="range" min={100} max={240} value={clampAltura(item.foto_altura)} onChange={e => set('foto_altura', Number(e.target.value))} style={{ accentColor: 'var(--accent)' }} />
                    </label>
                    {(item.foto_fit || 'cover') === 'cover' && (
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.66rem', color: 'var(--text-muted)', minWidth: 150 }}>
                        Enquadramento vertical: <strong style={{ color: 'var(--text-secondary)' }}>{item.foto_pos ?? 50}%</strong>
                        <input type="range" min={0} max={100} value={item.foto_pos ?? 50} onChange={e => set('foto_pos', Number(e.target.value))} style={{ accentColor: 'var(--accent)' }} />
                      </label>
                    )}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 6, opacity: 0.85 }}>
                    "Preencher" recorta para encher o espaço (use o enquadramento para posicionar). "Imagem inteira" mostra a foto completa sem cortes.
                  </div>
                </div>
              )}

              {/* Nota fiscal — upload de PDF */}
              <div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>Nota fiscal (PDF)</div>
                {(item.tem_nf || isURL(item.nota_fiscal_url)) ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-md)', background: 'var(--bg-1)' }}>
                    <span style={{ fontSize: '1.1rem' }}>📄</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: '0.78rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nota_fiscal_nome || (isURL(item.nota_fiscal_url) ? 'Link externo' : 'Nota fiscal')}</span>
                    {isURL(item.nota_fiscal_url)
                      ? <a href={item.nota_fiscal_url} target="_blank" rel="noopener noreferrer" style={linkChip}>Abrir</a>
                      : <button onClick={() => onAbrirNF(item)} style={{ ...linkChip, cursor: 'pointer' }}>Abrir</button>}
                    <button onClick={removerNF} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #ef444433', background: '#ef444412', color: '#ef4444', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>Remover</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start', padding: '9px 16px', borderRadius: 10, border: '1px dashed var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700, cursor: uploading ? 'wait' : 'pointer' }}>
                      {uploading ? '⏳ Salvando…' : '⬆ Enviar PDF do PC'}
                      <input type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={e => { enviarNF(e.target.files?.[0]); e.currentTarget.value = '' }} style={{ display: 'none' }} />
                    </label>
                    <input style={inputStyle} value={item.nota_fiscal_url} onChange={e => set('nota_fiscal_url', e.target.value)} placeholder="…ou cole um link para o PDF (https://…)" />
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', opacity: 0.85 }}>O PDF é guardado no seu banco (máx. ~{Math.round(MAX_NF_BYTES / 1024)} KB). Para arquivos maiores, comprima antes.</span>
                  </div>
                )}
                {uploadErro && <div style={{ marginTop: 6, fontSize: '0.7rem', color: '#ef4444' }}>{uploadErro}</div>}
              </div>
            </div>
          </section>

          {/* Localização */}
          <section>
            <SecTitle>Localização</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
              <Campo label="Cômodo">
                <select style={inputStyle} value={item.comodo} onChange={e => set('comodo', e.target.value)}>
                  <option value="">—</option>
                  {COMODOS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Campo>
              <Campo label="Sub-localização"><input style={inputStyle} value={item.sub_localizacao} onChange={e => set('sub_localizacao', e.target.value)} placeholder="Ex: Gaveta 3, Prateleira A" /></Campo>
            </div>
          </section>

          {/* Ciclo de vida */}
          <section>
            <SecTitle>Ciclo de vida</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
              <Campo label="Status">
                <select style={inputStyle} value={item.status} onChange={e => set('status', e.target.value as Status)}>
                  {STATUS_LIST.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
              </Campo>
              <Campo label="Garantia (meses)"><input type="number" min="0" style={inputStyle} value={item.garantia_meses || ''} onChange={e => set('garantia_meses', Math.max(0, Number(e.target.value) || 0))} /></Campo>
              <Campo label="Recorrência (assinatura)">
                <select style={inputStyle} value={item.recorrencia} onChange={e => set('recorrencia', e.target.value as Recorrencia)}>
                  <option value="">Não é assinatura</option>
                  <option value="mensal">Mensal</option>
                  <option value="anual">Anual</option>
                </select>
              </Campo>
              <Campo label="Validade / vencimento" hint="Vacinas de pet, medicamentos, documentos…"><input type="date" style={inputStyle} value={item.data_validade} onChange={e => set('data_validade', e.target.value)} /></Campo>
            </div>
            {garExp && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 6 }}>🛡️ Garantia expira em <strong>{garExp.toLocaleDateString('pt-BR')}</strong></div>}
          </section>

          {/* Tags */}
          <section>
            <SecTitle>Categorização (tags)</SecTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {item.tags.length === 0 && <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Nenhuma tag.</span>}
              {item.tags.map(t => <TagChip key={t} tag={t} onRemove={() => set('tags', item.tags.filter(x => x !== t))} />)}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} value={novaTag} onChange={e => setNovaTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(novaTag) } }} placeholder="Adicionar tag e Enter…" list="tags-sugeridas" />
              <datalist id="tags-sugeridas">{TAGS_SUGERIDAS.map(t => <option key={t} value={t} />)}</datalist>
              <button onClick={() => addTag(novaTag)} style={{ padding: '0 14px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>+</button>
            </div>
            {sugeridas.length > 0 && (
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Sugeridas:{' '}
                {sugeridas.map(t => <button key={t} onClick={() => addTag(t)} style={{ marginRight: 5, padding: '2px 8px', borderRadius: 14, border: `1px dashed ${tagCor(t)}66`, background: 'transparent', color: tagCor(t), cursor: 'pointer', fontSize: '0.68rem', fontWeight: 600 }}>+ {t}</button>)}
              </div>
            )}
            {seguro && <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, background: '#dc26260d', border: '1px solid #dc262633', fontSize: '0.72rem', color: '#dc2626' }}>🛡️ Valor acima de R$ 5.000 — a tag <strong>#seguro_obrigatorio</strong> será aplicada. Considere acionar seu seguro residencial em caso de sinistro.</div>}
          </section>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-1)' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}>Cancelar</button>
          <button onClick={onSave} disabled={!item.nome.trim()} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: item.nome.trim() ? 'linear-gradient(135deg,#0ea5e9,#6366f1)' : 'var(--bg-3)', color: '#fff', fontWeight: 800, cursor: item.nome.trim() ? 'pointer' : 'not-allowed', fontSize: '0.82rem' }}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
