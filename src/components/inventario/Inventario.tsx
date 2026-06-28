import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'
import { formatBRL } from '../../utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Remove undefined antes de salvar no Firestore (mesmo helper dos demais módulos)
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T
}

function newId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4) }

// Datas como meia-noite LOCAL (evita o deslocamento UTC-3 ao usar new Date('YYYY-MM-DD'))
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
  const r = new Date(d.getTime())
  r.setMonth(r.getMonth() + months)
  return r
}
function diffDays(from: Date, to: Date): number {
  const ms = to.setHours(0, 0, 0, 0) - new Date(from).setHours(0, 0, 0, 0)
  return Math.round(ms / 86400000)
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Status = 'Ativo' | 'Vendido' | 'Doado' | 'Quebrado' | 'Em_Manutenção'
type Recorrencia = '' | 'mensal' | 'anual'

interface Anexo { nome: string; tipo: string; url: string }

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
  metodo_pagamento: string
  // localização
  comodo: string
  sub_localizacao: string
  // ciclo de vida
  status: Status
  garantia_meses: number
  // recorrência (assinaturas / #servicos_digitais)
  recorrencia: Recorrencia
  // validade genérica (vacinas de pet, medicamentos, documentos)
  data_validade: string
  // mídia
  fotos: string[]
  anexos: Anexo[]
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

// Tags sugeridas + paleta
const TAG_CORES: Record<string, string> = {
  '#eletronicos': '#3b82f6', '#wearables': '#06b6d4', '#servicos_digitais': '#a855f7',
  '#documentos': '#64748b', '#pets': '#f97316', '#moveis': '#b45309',
  '#eletrodomesticos': '#0ea5e9', '#seguro_obrigatorio': '#dc2626', '#ferramentas': '#84cc16',
  '#veiculo': '#475569', '#vestuario': '#ec4899', '#livros': '#9333ea',
}
const TAGS_SUGERIDAS = Object.keys(TAG_CORES).filter(t => t !== '#seguro_obrigatorio')

function tagCor(tag: string): string { return TAG_CORES[tag] || '#7c8499' }

// Auto-sugestão de tags por palavras-chave
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

function sugerirTags(item: Pick<Item, 'nome' | 'descricao' | 'marca' | 'modelo' | 'recorrencia' | 'valor_atual_estimado'>): string[] {
  const texto = `${item.nome} ${item.descricao} ${item.marca} ${item.modelo}`.toLowerCase()
  const out = new Set<string>()
  for (const { kw, tag } of KEYWORD_TAGS) {
    if (kw.some(k => texto.includes(k))) out.add(tag)
  }
  if (item.recorrencia) out.add('#servicos_digitais')
  return Array.from(out)
}

// Regras de negócio ----------------------------------------------------------

// Garantia: data_compra + garantia_meses
function dataExpiracaoGarantia(item: Item): Date | null {
  const base = parseISO(item.data_compra)
  if (!base || !item.garantia_meses) return null
  return addMonths(base, item.garantia_meses)
}

// Depreciação sugerida: compra há mais de 2 anos → -15% sobre o valor pago
function depreciacaoSugerida(item: Item): number | null {
  const base = parseISO(item.data_compra)
  if (!base || !item.valor_pago) return null
  const anos = diffDays(base, new Date()) / 365
  if (anos < 2) return null
  return Math.round(item.valor_pago * 0.85 * 100) / 100
}

// Próxima renovação de assinatura: data_compra + N meses (rola até a próxima futura)
function proximaRenovacao(item: Item): Date | null {
  if (!item.recorrencia) return null
  const base = parseISO(item.data_compra)
  if (!base) return null
  const passo = item.recorrencia === 'anual' ? 12 : 1
  let d = new Date(base.getTime())
  const hoje = new Date()
  let guard = 0
  while (d.getTime() < hoje.setHours(0, 0, 0, 0) && guard < 600) { d = addMonths(d, passo); guard++ }
  return d
}

function ehSeguroObrigatorio(item: Item): boolean {
  return (item.valor_atual_estimado || 0) > 5000
}

// ─── Alertas ──────────────────────────────────────────────────────────────────

type AlertaTipo = 'garantia_vencida' | 'garantia' | 'assinatura' | 'validade'
interface Alerta { tipo: AlertaTipo; item: Item; dias: number; data: Date; msg: string }

function computarAlertas(itens: Item[]): Alerta[] {
  const hoje = new Date()
  const out: Alerta[] = []
  for (const item of itens) {
    if (item.status === 'Vendido' || item.status === 'Doado') continue
    // Garantia
    const gar = dataExpiracaoGarantia(item)
    if (gar) {
      const d = diffDays(hoje, gar)
      if (d < 0) out.push({ tipo: 'garantia_vencida', item, dias: d, data: gar, msg: `Garantia vencida há ${Math.abs(d)} dia(s)` })
      else if (d <= 30) out.push({ tipo: 'garantia', item, dias: d, data: gar, msg: `Garantia vence em ${d} dia(s)` })
    }
    // Assinaturas
    const ren = proximaRenovacao(item)
    if (ren) {
      const d = diffDays(hoje, ren)
      if (d >= 0 && d <= 15) out.push({ tipo: 'assinatura', item, dias: d, data: ren, msg: `Renovação ${item.recorrencia} em ${d} dia(s)` })
    }
    // Validade (vacinas pet, medicamentos, documentos)
    const val = parseISO(item.data_validade)
    if (val) {
      const d = diffDays(hoje, val)
      if (d >= 0 && d <= 30) out.push({ tipo: 'validade', item, dias: d, data: val, msg: `Validade/vencimento em ${d} dia(s)` })
      else if (d < 0) out.push({ tipo: 'validade', item, dias: d, data: val, msg: `Validade vencida há ${Math.abs(d)} dia(s)` })
    }
  }
  return out.sort((a, b) => a.dias - b.dias)
}

// ─── Item vazio (formulário) ────────────────────────────────────────────────

function itemVazio(): Item {
  return {
    id: newId(), nome: '', descricao: '', marca: '', modelo: '', numero_serie: '',
    data_compra: todayISO(), valor_pago: 0, valor_atual_estimado: 0, fornecedor_loja: '', metodo_pagamento: '',
    comodo: '', sub_localizacao: '', status: 'Ativo', garantia_meses: 12, recorrencia: '', data_validade: '',
    fotos: [], anexos: [], tags: [], criadoEm: Date.now(), updatedAt: Date.now(),
  }
}

// ─── UI atômicos ────────────────────────────────────────────────────────────

function Campo({ label, children, span }: { label: string; children: React.ReactNode; span?: number }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: span ? `span ${span}` : undefined }}>
      <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>{label}</span>
      {children}
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
      {tag}
      {onRemove && <button onClick={onRemove} style={{ background: 'none', border: 'none', color: c, cursor: 'pointer', fontSize: '0.8rem', lineHeight: 1, padding: 0 }}>×</button>}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export default function Inventario() {
  const uid = useUid()
  const [itens, setItens] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'itens' | 'alertas' | 'relatorio'>('itens')

  // filtros
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'Todos' | Status>('Todos')
  const [filtroTag, setFiltroTag] = useState<string>('Todas')

  // modal
  const [editando, setEditando] = useState<Item | null>(null)
  const [novaTag, setNovaTag] = useState('')

  // ── Firestore ──
  useEffect(() => {
    if (!uid || !db) return
    return onSnapshot(collection(db, 'users', uid, 'inventario'), snap => {
      setItens(snap.docs.map(d => ({ ...itemVazio(), ...(d.data() as Item), id: d.id })).sort((a, b) => b.updatedAt - a.updatedAt))
      setLoading(false)
    })
  }, [uid])

  async function salvar(item: Item) {
    if (!uid || !db) return
    const tags = new Set(item.tags)
    if (ehSeguroObrigatorio(item)) tags.add('#seguro_obrigatorio')
    else tags.delete('#seguro_obrigatorio')
    const final: Item = { ...item, tags: Array.from(tags), updatedAt: Date.now() }
    await setDoc(doc(db, 'users', uid, 'inventario', final.id), clean(final))
    setEditando(null)
  }

  async function remover(item: Item) {
    if (!uid || !db) return
    if (!window.confirm(`Remover "${item.nome || 'item'}" do inventário?`)) return
    await deleteDoc(doc(db, 'users', uid, 'inventario', item.id))
  }

  // ── Derivados ──
  const alertas = useMemo(() => computarAlertas(itens), [itens])

  const todasTags = useMemo(() => {
    const s = new Set<string>()
    itens.forEach(i => i.tags.forEach(t => s.add(t)))
    return Array.from(s).sort()
  }, [itens])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return itens.filter(i => {
      if (filtroStatus !== 'Todos' && i.status !== filtroStatus) return false
      if (filtroTag !== 'Todas' && !i.tags.includes(filtroTag)) return false
      if (!q) return true
      return [i.nome, i.descricao, i.numero_serie, i.marca, i.modelo, ...i.tags].some(v => (v || '').toLowerCase().includes(q))
    })
  }, [itens, busca, filtroStatus, filtroTag])

  // patrimônio = soma do valor atual estimado dos itens não vendidos/doados
  const ativos = useMemo(() => itens.filter(i => i.status !== 'Vendido' && i.status !== 'Doado'), [itens])
  const patrimonio = useMemo(() => ativos.reduce((s, i) => s + (i.valor_atual_estimado || 0), 0), [ativos])
  const totalPago = useMemo(() => itens.reduce((s, i) => s + (i.valor_pago || 0), 0), [itens])

  // distribuição por tag (categoria)
  const distribuicao = useMemo(() => {
    const map: Record<string, { valor: number; qtd: number }> = {}
    ativos.forEach(i => {
      const cats = i.tags.filter(t => t !== '#seguro_obrigatorio')
      const usadas = cats.length ? cats : ['#sem_categoria']
      usadas.forEach(t => {
        if (!map[t]) map[t] = { valor: 0, qtd: 0 }
        map[t].valor += (i.valor_atual_estimado || 0) / usadas.length
        map[t].qtd += 1
      })
    })
    return Object.entries(map).map(([tag, v]) => ({ tag, ...v })).sort((a, b) => b.valor - a.valor)
  }, [ativos])

  const criticos = useMemo(() => itens.filter(i => i.status === 'Quebrado' || i.status === 'Em_Manutenção'), [itens])

  function exportarCSV() {
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`
    const linhas = [['Nome', 'Valor', 'Status', 'Localização'].join(';')]
    filtrados.forEach(i => {
      const loc = [i.comodo, i.sub_localizacao].filter(Boolean).join(' / ')
      linhas.push([esc(i.nome), esc(formatBRL(i.valor_atual_estimado || 0)), esc(STATUS_META[i.status].label), esc(loc)].join(';'))
    })
    const blob = new Blob(['\uFEFF' + linhas.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `inventario_${todayISO()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
      Carregando inventário…
    </div>
  )

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, margin: '0 auto' }}>

      {/* ── Cabeçalho ── */}
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

      {/* ── Cards-resumo ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 18 }}>
        {([
          ['Patrimônio (atual)', formatBRL(patrimonio), '#10b981', '💎'],
          ['Total investido', formatBRL(totalPago), '#6366f1', '🧾'],
          ['Itens ativos', String(ativos.length), '#0ea5e9', '✅'],
          ['Alertas', String(alertas.length), alertas.length ? '#f59e0b' : '#94a3b8', '🔔'],
        ] as const).map(([l, v, c, ic]) => (
          <div key={l} style={{ padding: '14px 16px', borderRadius: 14, border: `1px solid ${c}25`, background: `linear-gradient(135deg,${c}0d,transparent)` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>{l}</span>
              <span style={{ fontSize: '1.05rem' }}>{ic}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.35rem', color: c, lineHeight: 1 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* ── Abas ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 2 }}>
        {([['itens', '📋 Itens'], ['alertas', `🔔 Alertas${alertas.length ? ` (${alertas.length})` : ''}`], ['relatorio', '📊 Relatório']] as const).map(([id, lb]) => (
          <button key={id} onClick={() => setAba(id)}
            style={{ padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: aba === id ? 800 : 500, color: aba === id ? 'var(--text-accent)' : 'var(--text-muted)', borderBottom: `2px solid ${aba === id ? 'var(--accent)' : 'transparent'}`, marginBottom: -3 }}>
            {lb}
          </button>
        ))}
      </div>

      {/* ════════ ABA: ITENS ════════ */}
      {aba === 'itens' && (
        <>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔍 Buscar (nome, série, tag…)"
              style={{ ...inputStyle, width: 240 }} />
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as any)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="Todos">Status: Todos</option>
              {STATUS_LIST.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
            <select value={filtroTag} onChange={e => setFiltroTag(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="Todas">Tag: Todas</option>
              {todasTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{filtrados.length} resultado(s)</span>
          </div>

          {filtrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📦</div>
              {itens.length === 0 ? 'Nenhum item ainda. Clique em “+ Adicionar”.' : 'Nenhum item corresponde aos filtros.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 12 }}>
              {filtrados.map(item => {
                const sm = STATUS_META[item.status]
                const gar = dataExpiracaoGarantia(item)
                const dep = depreciacaoSugerida(item)
                const ren = proximaRenovacao(item)
                const loc = [item.comodo, item.sub_localizacao].filter(Boolean).join(' / ')
                return (
                  <div key={item.id} style={{ borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'var(--shadow-xs)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome || 'Sem nome'}</div>
                        {(item.marca || item.modelo) && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{[item.marca, item.modelo].filter(Boolean).join(' · ')}</div>}
                      </div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: '0.64rem', fontWeight: 700, color: sm.cor, background: `${sm.cor}18`, whiteSpace: 'nowrap' }}>{sm.icon} {sm.label}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.2rem', color: '#10b981' }}>{formatBRL(item.valor_atual_estimado || 0)}</span>
                      {item.valor_pago > 0 && item.valor_pago !== item.valor_atual_estimado && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>{formatBRL(item.valor_pago)}</span>
                      )}
                    </div>

                    {loc && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>📍 {loc}</div>}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {item.tags.map(t => <TagChip key={t} tag={t} />)}
                    </div>

                    {(gar || ren) && (
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {gar && <span>🛡️ Garantia até {toISOBr(gar)}</span>}
                        {ren && <span>🔁 Renova em {toISOBr(ren)} ({item.recorrencia})</span>}
                      </div>
                    )}

                    {dep && Math.abs((item.valor_atual_estimado || 0) - dep) > 0.5 && (
                      <button onClick={() => salvar({ ...item, valor_atual_estimado: dep })}
                        style={{ alignSelf: 'flex-start', fontSize: '0.66rem', padding: '4px 9px', borderRadius: 8, border: '1px dashed #f59e0b66', background: '#f59e0b12', color: '#b45309', cursor: 'pointer', fontWeight: 600 }}>
                        📉 Aplicar depreciação sugerida → {formatBRL(dep)}
                      </button>
                    )}

                    <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 6 }}>
                      <button onClick={() => { setEditando({ ...item }); setNovaTag('') }} style={{ flex: 1, padding: '6px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>✏️ Editar</button>
                      <button onClick={() => remover(item)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ef444433', background: '#ef444412', color: '#ef4444', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>🗑️</button>
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
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✅</div>
              Nenhum alerta pendente. Tudo em dia!
            </div>
          ) : alertas.map((a, i) => {
            const critico = a.dias < 0
            const cor = critico ? '#ef4444' : a.tipo === 'assinatura' ? '#a855f7' : '#f59e0b'
            const icon = a.tipo === 'garantia' || a.tipo === 'garantia_vencida' ? '🛡️' : a.tipo === 'assinatura' ? '🔁' : '📅'
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ padding: 18, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)' }}>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: 12 }}>Distribuição por categoria</div>
            {distribuicao.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sem dados ainda.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {distribuicao.map(({ tag, valor, qtd }) => {
                  const pct = patrimonio > 0 ? Math.round((valor / patrimonio) * 100) : 0
                  const c = tagCor(tag)
                  return (
                    <div key={tag}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{tag} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {qtd} item(ns)</span></span>
                        <span style={{ color: c, fontWeight: 700 }}>{formatBRL(valor)} ({pct}%)</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-3)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: c, borderRadius: 4, transition: 'width 0.6s' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ padding: 18, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)' }}>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: 12 }}>⚠️ Itens críticos <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.78rem' }}>(quebrados / em manutenção)</span></div>
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
          </div>
        </div>
      )}

      {/* ════════ MODAL EDIÇÃO ════════ */}
      {editando && (
        <ModalItem
          item={editando}
          onChange={setEditando}
          onClose={() => setEditando(null)}
          onSave={() => salvar(editando)}
          novaTag={novaTag}
          setNovaTag={setNovaTag}
        />
      )}
    </div>
  )
}

function toISOBr(d: Date): string { return d.toLocaleDateString('pt-BR') }

// ─── Modal de edição/criação ─────────────────────────────────────────────────

function ModalItem({ item, onChange, onClose, onSave, novaTag, setNovaTag }: {
  item: Item
  onChange: (i: Item) => void
  onClose: () => void
  onSave: () => void
  novaTag: string
  setNovaTag: (s: string) => void
}) {
  const set = <K extends keyof Item>(k: K, v: Item[K]) => onChange({ ...item, [k]: v })
  const sugeridas = sugerirTags(item).filter(t => !item.tags.includes(t))
  const seguro = ehSeguroObrigatorio(item)
  const garExp = dataExpiracaoGarantia(item)

  function addTag(t: string) {
    const tag = t.startsWith('#') ? t.trim() : `#${t.trim()}`
    if (tag === '#' || item.tags.includes(tag)) return
    onChange({ ...item, tags: [...item.tags, tag] })
    setNovaTag('')
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 720, background: 'var(--bg-2)', borderRadius: 18, border: '1px solid var(--border-md)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'linear-gradient(135deg,rgba(14,165,233,0.12),rgba(99,102,241,0.06))', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{item.nome ? `Editar item` : 'Novo item'}</div>
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
              <Campo label="Valor pago (R$)"><input type="number" step="0.01" style={inputStyle} value={item.valor_pago || ''} onChange={e => {
                const vp = Number(e.target.value) || 0
                // se o valor atual ainda estiver vazio, espelha o pago
                onChange({ ...item, valor_pago: vp, valor_atual_estimado: item.valor_atual_estimado || vp })
              }} /></Campo>
              <Campo label="Valor atual estimado (R$)"><input type="number" step="0.01" style={inputStyle} value={item.valor_atual_estimado || ''} onChange={e => set('valor_atual_estimado', Number(e.target.value) || 0)} /></Campo>
              <Campo label="Fornecedor / loja"><input style={inputStyle} value={item.fornecedor_loja} onChange={e => set('fornecedor_loja', e.target.value)} /></Campo>
              <Campo label="Método de pagamento" span={2}>
                <select style={inputStyle} value={item.metodo_pagamento} onChange={e => set('metodo_pagamento', e.target.value)}>
                  <option value="">—</option>
                  {METODOS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Campo>
            </div>
            {(() => { const dep = depreciacaoSugerida(item); return dep && Math.abs((item.valor_atual_estimado || 0) - dep) > 0.5 ? (
              <button onClick={() => set('valor_atual_estimado', dep)} style={{ marginTop: 8, fontSize: '0.7rem', padding: '6px 12px', borderRadius: 8, border: '1px dashed #f59e0b66', background: '#f59e0b12', color: '#b45309', cursor: 'pointer', fontWeight: 600 }}>
                📉 Compra há +2 anos — aplicar -15% (→ {formatBRL(dep)})
              </button>
            ) : null })()}
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
              <Campo label="Garantia (meses)"><input type="number" style={inputStyle} value={item.garantia_meses || ''} onChange={e => set('garantia_meses', Number(e.target.value) || 0)} /></Campo>
              <Campo label="Recorrência (assinatura)">
                <select style={inputStyle} value={item.recorrencia} onChange={e => set('recorrencia', e.target.value as Recorrencia)}>
                  <option value="">Não é assinatura</option>
                  <option value="mensal">Mensal</option>
                  <option value="anual">Anual</option>
                </select>
              </Campo>
              <Campo label="Validade / vencimento"><input type="date" style={inputStyle} value={item.data_validade} onChange={e => set('data_validade', e.target.value)} /></Campo>
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
                {sugeridas.map(t => (
                  <button key={t} onClick={() => addTag(t)} style={{ marginRight: 5, padding: '2px 8px', borderRadius: 14, border: `1px dashed ${tagCor(t)}66`, background: 'transparent', color: tagCor(t), cursor: 'pointer', fontSize: '0.68rem', fontWeight: 600 }}>+ {t}</button>
                ))}
              </div>
            )}
            {seguro && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, background: '#dc26260d', border: '1px solid #dc262633', fontSize: '0.72rem', color: '#dc2626' }}>
                🛡️ Valor acima de R$ 5.000 — a tag <strong>#seguro_obrigatorio</strong> será aplicada. Considere acionar seu seguro residencial em caso de sinistro.
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-1)' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}>Cancelar</button>
          <button onClick={onSave} disabled={!item.nome.trim()} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: item.nome.trim() ? 'linear-gradient(135deg,#0ea5e9,#6366f1)' : 'var(--bg-3)', color: '#fff', fontWeight: 800, cursor: item.nome.trim() ? 'pointer' : 'not-allowed', fontSize: '0.82rem' }}>Salvar</button>
        </div>
      </div>
    </div>
  )
}

function SecTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>{children}</div>
}
