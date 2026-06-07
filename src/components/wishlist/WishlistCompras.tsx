import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'

// ─── Types ────────────────────────────────────────────────────────────────────

// Remove undefined antes de salvar no Firestore
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T
}

type Prioridade = 'baixa' | 'media' | 'alta' | 'urgente'
type Status = 'desejado' | 'planejado' | 'comprado' | 'cancelado'
type Categoria =
  | 'Tecnologia' | 'Vestuário' | 'Casa & Decoração' | 'Livros & Educação'
  | 'Saúde & Beleza' | 'Esportes' | 'Alimentação' | 'Viagem' | 'Lazer' | 'Outro'

interface ItemWishlist {
  id: string
  nome: string
  descricao: string
  categoria: Categoria
  prioridade: Prioridade
  status: Status
  preco: number
  precoAtual?: number
  loja?: string
  link?: string
  dataDesejo: string
  dataPlanejada?: string
  dataCompra?: string
  notas?: string
  criadoEm: number
}

interface ListaCompras {
  id: string
  nome: string
  itens: ItemListaCompras[]
  concluida: boolean
  criadoEm: number
}

interface ItemListaCompras {
  id: string
  nome: string
  quantidade: number
  unidade: string
  categoria: string
  preco?: number
  comprado: boolean
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const CATEGORIAS: Categoria[] = [
  'Tecnologia', 'Vestuário', 'Casa & Decoração', 'Livros & Educação',
  'Saúde & Beleza', 'Esportes', 'Alimentação', 'Viagem', 'Lazer', 'Outro',
]

const CAT_ICONS: Record<Categoria, string> = {
  'Tecnologia': '💻', 'Vestuário': '👕', 'Casa & Decoração': '🏠',
  'Livros & Educação': '📚', 'Saúde & Beleza': '💊', 'Esportes': '⚽',
  'Alimentação': '🍎', 'Viagem': '✈️', 'Lazer': '🎮', 'Outro': '📦',
}

const PR_CONFIG: Record<Prioridade, { label: string; color: string; bg: string }> = {
  baixa:   { label: 'Baixa',   color: '#6b9e7a', bg: 'rgba(107,158,122,0.15)' },
  media:   { label: 'Média',   color: '#b8a96a', bg: 'rgba(184,169,106,0.15)' },
  alta:    { label: 'Alta',    color: '#c47c2e', bg: 'rgba(196,124,46,0.15)'  },
  urgente: { label: 'Urgente', color: '#c45a5a', bg: 'rgba(196,90,90,0.15)'  },
}

const ST_CONFIG: Record<Status, { label: string; color: string; icon: string }> = {
  desejado:  { label: 'Desejado',  color: '#6b9fd4', icon: '💭' },
  planejado: { label: 'Planejado', color: '#c4a84a', icon: '📋' },
  comprado:  { label: 'Comprado',  color: '#6b9e7a', icon: '✅' },
  cancelado: { label: 'Cancelado', color: '#6a6a7a', icon: '❌' },
}

function newId() { return Math.random().toString(36).slice(2, 10) }
function fmtMoeda(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

// ─── Estilos base ─────────────────────────────────────────────────────────────
const IS: React.CSSProperties = {
  background: 'var(--input-bg)',
  border: '1px solid var(--border-md)',
  borderRadius: 8, padding: '8px 12px',
  color: 'var(--text-primary)', fontSize: '0.82rem',
  width: '100%', outline: 'none', boxSizing: 'border-box',
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>{children}</label>
}
function Sec({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 12px' }}>
      <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-md)' }} />
    </div>
  )
}

// ─── Modal overlay ────────────────────────────────────────────────────────────
function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {children}
    </div>
  )
}

// ─── Modal formulário item wishlist ──────────────────────────────────────────
function ModalItem({ uid, item, onClose }: { uid: string | null; item: ItemWishlist | null; onClose: () => void }) {
  const isEdit = !!item
  const [nome, setNome] = useState(item?.nome || '')
  const [descricao, setDescricao] = useState(item?.descricao || '')
  const [categoria, setCategoria] = useState<Categoria>(item?.categoria || 'Outro')
  const [prioridade, setPrioridade] = useState<Prioridade>(item?.prioridade || 'media')
  const [status, setStatus] = useState<Status>(item?.status || 'desejado')
  const [preco, setPreco] = useState(item?.preco?.toString() || '')
  const [precoAtual, setPrecoAtual] = useState(item?.precoAtual?.toString() || '')
  const [loja, setLoja] = useState(item?.loja || '')
  const [link, setLink] = useState(item?.link || '')
  const [dataPlanejada, setDataPlanejada] = useState(item?.dataPlanejada || '')
  const [dataCompra, setDataCompra] = useState(item?.dataCompra || '')
  const [notas, setNotas] = useState(item?.notas || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!uid || !nome.trim()) return
    setSaving(true)
    const id = isEdit ? item!.id : newId()
    const payload: ItemWishlist = {
      id, nome, descricao, categoria, prioridade, status,
      preco: parseFloat(preco) || 0,
      precoAtual: parseFloat(precoAtual) || undefined,
      loja: loja || undefined, link: link || undefined,
      dataDesejo: item?.dataDesejo || new Date().toISOString().slice(0, 10),
      dataPlanejada: dataPlanejada || undefined,
      dataCompra: dataCompra || undefined,
      notas: notas || undefined,
      criadoEm: item?.criadoEm || Date.now(),
    }
    await setDoc(doc(db, 'users', uid, 'wishlist', id), clean(payload))
    setSaving(false)
    onClose()
  }

  const del = async () => {
    if (!uid || !item) return
    await deleteDoc(doc(db, 'users', uid, 'wishlist', item.id))
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 18, width: '100%', maxWidth: 620, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
            {isEdit ? 'Editar Item' : 'Adicionar à Wishlist'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Sec title="Identificação" />
          <div><Lbl>Nome do item *</Lbl><input style={IS} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: iPhone 16 Pro" /></div>
          <div><Lbl>Descrição</Lbl><textarea style={{ ...IS, minHeight: 64, resize: 'vertical' }} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Detalhes, modelo, cor, especificações..." /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><Lbl>Categoria</Lbl>
              <select style={IS} value={categoria} onChange={e => setCategoria(e.target.value as Categoria)}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
              </select>
            </div>
            <div><Lbl>Prioridade</Lbl>
              <select style={IS} value={prioridade} onChange={e => setPrioridade(e.target.value as Prioridade)}>
                {Object.entries(PR_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div><Lbl>Status</Lbl>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(ST_CONFIG).map(([k, v]) => (
                <button key={k} onClick={() => setStatus(k as Status)}
                  style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${status === k ? v.color : 'var(--border-md)'}`, background: status === k ? `${v.color}18` : 'transparent', color: status === k ? v.color : 'var(--text-muted)', fontSize: '0.75rem', fontWeight: status === k ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s' }}>
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
          </div>

          <Sec title="Preço & Loja" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><Lbl>Preço estimado (R$)</Lbl><input type="number" style={IS} value={preco} onChange={e => setPreco(e.target.value)} placeholder="0,00" step="0.01" min="0" /></div>
            <div><Lbl>Preço atual / pesquisado</Lbl><input type="number" style={IS} value={precoAtual} onChange={e => setPrecoAtual(e.target.value)} placeholder="0,00" step="0.01" min="0" /></div>
            <div><Lbl>Loja / Plataforma</Lbl><input style={IS} value={loja} onChange={e => setLoja(e.target.value)} placeholder="Ex: Amazon, Shopee, Loja física..." /></div>
            <div><Lbl>Link do produto</Lbl><input style={IS} value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." /></div>
          </div>

          <Sec title="Datas" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><Lbl>Compra planejada para</Lbl><input type="date" style={IS} value={dataPlanejada} onChange={e => setDataPlanejada(e.target.value)} /></div>
            {status === 'comprado' && <div><Lbl>Data da compra</Lbl><input type="date" style={IS} value={dataCompra} onChange={e => setDataCompra(e.target.value)} /></div>}
          </div>

          <Sec title="Notas" />
          <div><textarea style={{ ...IS, minHeight: 72, resize: 'vertical' }} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observações, justificativas, comparações de preço..." /></div>
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-md)', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>{isEdit && <button onClick={del} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', color: '#f87171', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}>Excluir</button>}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={save} disabled={saving || !nome.trim()} style={{ padding: '8px 22px', borderRadius: 8, background: saving ? 'rgba(245,158,11,0.2)' : 'linear-gradient(135deg,#c47c2e,#f59e0b)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: saving || !nome.trim() ? 'not-allowed' : 'pointer', opacity: !nome.trim() ? 0.5 : 1 }}>
              {saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Adicionar'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Modal Lista de Compras ───────────────────────────────────────────────────
function ModalLista({ uid, lista, onClose }: { uid: string | null; lista: ListaCompras | null; onClose: () => void }) {
  const isEdit = !!lista
  const [nome, setNome] = useState(lista?.nome || '')
  const [itens, setItens] = useState<ItemListaCompras[]>(lista?.itens || [])
  const [novoNome, setNovoNome] = useState('')
  const [novaQtd, setNovaQtd] = useState('1')
  const [novaUnid, setNovaUnid] = useState('un')
  const [novoCat, setNovoCat] = useState('')
  const [novoPreco, setNovoPreco] = useState('')
  const [saving, setSaving] = useState(false)

  const addItem = () => {
    if (!novoNome.trim()) return
    setItens(prev => [...prev, { id: newId(), nome: novoNome.trim(), quantidade: parseFloat(novaQtd) || 1, unidade: novaUnid, categoria: novoCat, preco: parseFloat(novoPreco) || undefined, comprado: false }])
    setNovoNome(''); setNovaQtd('1'); setNovoPreco('')
  }

  const toggleItem = (id: string) => setItens(prev => prev.map(i => i.id === id ? { ...i, comprado: !i.comprado } : i))
  const removeItem = (id: string) => setItens(prev => prev.filter(i => i.id !== id))

  const save = async () => {
    if (!uid || !nome.trim()) return
    setSaving(true)
    const id = isEdit ? lista!.id : newId()
    await setDoc(doc(db, 'users', uid, 'listasCompras', id), clean({ id, nome, itens, concluida: lista?.concluida || false, criadoEm: lista?.criadoEm || Date.now() }))
    setSaving(false)
    onClose()
  }

  const total = itens.reduce((a, i) => a + (i.preco ? i.preco * i.quantidade : 0), 0)
  const comprados = itens.filter(i => i.comprado).length

  return (
    <Modal onClose={onClose}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 18, width: '100%', maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>{isEdit ? 'Editar Lista' : 'Nova Lista de Compras'}</div>
            {itens.length > 0 && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>{comprados}/{itens.length} itens · {total > 0 ? fmtMoeda(total) : 'sem preço'}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><Lbl>Nome da lista</Lbl><input style={IS} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Compras da semana, Mercado..." /></div>

          {/* Itens existentes */}
          {itens.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {itens.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: item.comprado ? 'rgba(110,231,160,0.06)' : 'var(--surface)', border: `1px solid ${item.comprado ? 'rgba(110,231,160,0.2)' : 'var(--border)'}`, transition: 'all 0.2s' }}>
                  <button onClick={() => toggleItem(item.id)} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${item.comprado ? '#6ee7a0' : 'var(--border-md)'}`, background: item.comprado ? '#6ee7a0' : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#1a1b26' }}>
                    {item.comprado ? '✓' : ''}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '0.82rem', color: item.comprado ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: item.comprado ? 'line-through' : 'none', fontWeight: 600 }}>{item.nome}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 8 }}>{item.quantidade} {item.unidade}</span>
                  </div>
                  {item.preco && <span style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 700, flexShrink: 0 }}>{fmtMoeda(item.preco * item.quantidade)}</span>}
                  <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.4)', cursor: 'pointer', fontSize: '0.85rem', padding: 2 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Adicionar novo item */}
          <div style={{ padding: '12px', borderRadius: 12, border: '1px dashed var(--border-md)', background: 'var(--surface)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>+ Novo item</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input style={IS} value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome do item" onKeyDown={e => e.key === 'Enter' && addItem()} />
              <input type="number" style={IS} value={novaQtd} onChange={e => setNovaQtd(e.target.value)} placeholder="Qtd" min="0.1" step="0.1" />
              <select style={IS} value={novaUnid} onChange={e => setNovaUnid(e.target.value)}>
                {['un','kg','g','L','ml','cx','pc','par'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
              <input style={IS} value={novoCat} onChange={e => setNovoCat(e.target.value)} placeholder="Categoria (opcional)" />
              <input type="number" style={IS} value={novoPreco} onChange={e => setNovoPreco(e.target.value)} placeholder="Preço unit. (R$)" step="0.01" min="0" />
              <button onClick={addItem} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add</button>
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-md)', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{total > 0 && `Total: ${fmtMoeda(total)}`}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={save} disabled={saving || !nome.trim()} style={{ padding: '8px 22px', borderRadius: 8, background: 'linear-gradient(135deg,#c47c2e,#f59e0b)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', opacity: !nome.trim() ? 0.5 : 1 }}>
              {saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar Lista'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Aba Wishlist ─────────────────────────────────────────────────────────────
function AbaWishlist({ uid, itens, onEdit }: {
  uid: string | null
  itens: ItemWishlist[]
  onEdit: (i: ItemWishlist) => void
}) {
  const [filtroStatus, setFiltroStatus] = useState<Status | 'todos'>('todos')
  const [filtroCategoria, setFiltroCategoria] = useState<Categoria | 'todas'>('todas')
  const [busca, setBusca] = useState('')
  const [ordenar, setOrdenar] = useState<'prioridade' | 'preco' | 'data'>('prioridade')

  const filtrados = itens
    .filter(i => filtroStatus === 'todos' || i.status === filtroStatus)
    .filter(i => filtroCategoria === 'todas' || i.categoria === filtroCategoria)
    .filter(i => !busca || i.nome.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => {
      if (ordenar === 'prioridade') {
        const ord = { urgente: 0, alta: 1, media: 2, baixa: 3 }
        return ord[a.prioridade] - ord[b.prioridade]
      }
      if (ordenar === 'preco') return (b.preco || 0) - (a.preco || 0)
      return b.criadoEm - a.criadoEm
    })

  const totalDesejado = itens.filter(i => i.status !== 'comprado' && i.status !== 'cancelado').reduce((a, i) => a + (i.preco || 0), 0)

  const toggleStatus = async (item: ItemWishlist, novoStatus: Status) => {
    if (!uid) return
    const updateData: Record<string, unknown> = { status: novoStatus }
    if (novoStatus === 'comprado') updateData.dataCompra = new Date().toISOString().slice(0, 10)
    await updateDoc(doc(db, 'users', uid, 'wishlist', item.id), updateData)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {[
          { label: 'Total desejados', val: itens.filter(i => i.status === 'desejado').length, color: '#6b9fd4' },
          { label: 'Planejados', val: itens.filter(i => i.status === 'planejado').length, color: '#fbbf24' },
          { label: 'Comprados', val: itens.filter(i => i.status === 'comprado').length, color: '#6ee7a0' },
          { label: 'Valor pendente', val: fmtMoeda(totalDesejado), color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} style={{ padding: '12px 16px', background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: typeof s.val === 'number' ? '1.5rem' : '1rem', color: s.color, lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item..." style={{ ...IS, flex: 1, minWidth: 180 }} />
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as any)} style={{ ...IS, width: 'auto' }}>
          <option value="todos">Todos os status</option>
          {Object.entries(ST_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value as any)} style={{ ...IS, width: 'auto' }}>
          <option value="todas">Todas categorias</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
        </select>
        <select value={ordenar} onChange={e => setOrdenar(e.target.value as any)} style={{ ...IS, width: 'auto' }}>
          <option value="prioridade">↑ Prioridade</option>
          <option value="preco">↑ Preço</option>
          <option value="data">↑ Mais recente</option>
        </select>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
        {filtrados.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🛒</div>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>Nenhum item encontrado</p>
          </div>
        )}
        {filtrados.map(item => {
          const pr = PR_CONFIG[item.prioridade]
          const st = ST_CONFIG[item.status]
          return (
            <div key={item.id}
              style={{ background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, transition: 'all 0.15s', cursor: 'pointer', opacity: item.status === 'cancelado' ? 0.55 : 1 }}
              onClick={() => onEdit(item)}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; (e.currentTarget as HTMLElement).style.transform = 'none' }}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '1.4rem', flexShrink: 0 }}>{CAT_ICONS[item.categoria]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.88rem', color: item.status === 'comprado' ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: item.status === 'cancelado' ? 'line-through' : 'none', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>{item.categoria}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '0.62rem', padding: '2px 8px', borderRadius: 12, background: pr.bg, color: pr.color, fontWeight: 700 }}>{pr.label}</span>
                  <span style={{ fontSize: '0.62rem', padding: '2px 8px', borderRadius: 12, background: `${st.color}18`, color: st.color, fontWeight: 700 }}>{st.icon} {st.label}</span>
                </div>
              </div>

              {/* Descrição */}
              {item.descricao && <p style={{ margin: 0, fontSize: '0.73rem', color: 'var(--text-secondary)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.descricao}</p>}

              {/* Preço */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {item.preco > 0 && (
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: '#fbbf24' }}>{fmtMoeda(item.preco)}</div>
                )}
                {item.precoAtual && item.precoAtual !== item.preco && (
                  <div style={{ fontSize: '0.7rem', color: item.precoAtual < item.preco ? '#6ee7a0' : '#f87171', fontWeight: 700 }}>
                    {item.precoAtual < item.preco ? '▼' : '▲'} {fmtMoeda(item.precoAtual)} atual
                  </div>
                )}
                {item.loja && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>📍 {item.loja}</span>}
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
                {item.dataPlanejada && item.status !== 'comprado' && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>📅 Planejado: {item.dataPlanejada.split('-').reverse().join('/')}</span>
                )}
                {item.status === 'comprado' && item.dataCompra && (
                  <span style={{ fontSize: '0.65rem', color: '#6ee7a0' }}>✅ {item.dataCompra.split('-').reverse().join('/')}</span>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {item.link && (
                    <a href={item.link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: '0.65rem', textDecoration: 'none' }}>🔗 Link</a>
                  )}
                  {item.status === 'desejado' && (
                    <button onClick={e => { e.stopPropagation(); toggleStatus(item, 'planejado') }}
                      style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(196,168,74,0.3)', background: 'rgba(196,168,74,0.08)', color: '#c4a84a', fontSize: '0.65rem', cursor: 'pointer', fontWeight: 600 }}>Planejar</button>
                  )}
                  {item.status === 'planejado' && (
                    <button onClick={e => { e.stopPropagation(); toggleStatus(item, 'comprado') }}
                      style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(110,231,160,0.3)', background: 'rgba(110,231,160,0.08)', color: '#6ee7a0', fontSize: '0.65rem', cursor: 'pointer', fontWeight: 600 }}>Comprado</button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Aba Listas de Compras ────────────────────────────────────────────────────
function AbaListas({ uid, listas, onEdit }: {
  uid: string | null
  listas: ListaCompras[]
  onEdit: (l: ListaCompras) => void
}) {
  const marcarConcluida = async (lista: ListaCompras) => {
    if (!uid) return
    await updateDoc(doc(db, 'users', uid, 'listasCompras', lista.id), { concluida: !lista.concluida })
  }
  const excluir = async (id: string) => {
    if (!uid) return
    await deleteDoc(doc(db, 'users', uid, 'listasCompras', id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 12 }}>
        {listas.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📝</div>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>Nenhuma lista criada</p>
          </div>
        )}
        {listas.map(lista => {
          const total = lista.itens.reduce((a, i) => a + (i.preco ? i.preco * i.quantidade : 0), 0)
          const comprados = lista.itens.filter(i => i.comprado).length
          const pct = lista.itens.length > 0 ? Math.round((comprados / lista.itens.length) * 100) : 0
          return (
            <div key={lista.id}
              style={{ background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 16, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10, opacity: lista.concluida ? 0.6 : 1, transition: 'all 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', textDecoration: lista.concluida ? 'line-through' : 'none' }}>{lista.nome}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => onEdit(lista)} style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: '0.68rem', cursor: 'pointer' }}>✏ Editar</button>
                  <button onClick={() => excluir(lista.id)} style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.2)', background: 'transparent', color: 'rgba(239,68,68,0.5)', fontSize: '0.68rem', cursor: 'pointer' }}>✕</button>
                </div>
              </div>
              {/* Barra de progresso */}
              {lista.itens.length > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 3 }}>
                    <span>{comprados}/{lista.itens.length} itens</span>
                    <span style={{ color: pct === 100 ? '#6ee7a0' : 'var(--text-muted)', fontWeight: pct === 100 ? 700 : 400 }}>{pct}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-4)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#6ee7a0' : 'linear-gradient(90deg,#f59e0b,#fbbf24)', borderRadius: 3, transition: 'width 0.4s' }} />
                  </div>
                </>
              )}
              {/* Preview itens */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                {lista.itens.slice(0, 6).map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem' }}>
                    <div style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${item.comprado ? '#6ee7a0' : 'var(--border-md)'}`, background: item.comprado ? '#6ee7a0' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', color: '#1a1b26' }}>
                      {item.comprado ? '✓' : ''}
                    </div>
                    <span style={{ flex: 1, color: item.comprado ? 'var(--text-muted)' : 'var(--text-secondary)', textDecoration: item.comprado ? 'line-through' : 'none' }}>{item.nome}</span>
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{item.quantidade}{item.unidade}</span>
                    {item.preco && <span style={{ color: '#fbbf24', fontWeight: 600, flexShrink: 0 }}>{fmtMoeda(item.preco * item.quantidade)}</span>}
                  </div>
                ))}
                {lista.itens.length > 6 && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center' }}>+{lista.itens.length - 6} itens</div>}
              </div>
              {/* Footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                {total > 0 && <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fbbf24' }}>{fmtMoeda(total)}</span>}
                <button onClick={() => marcarConcluida(lista)}
                  style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 7, border: `1px solid ${lista.concluida ? 'rgba(110,231,160,0.3)' : 'var(--border-md)'}`, background: lista.concluida ? 'rgba(110,231,160,0.08)' : 'var(--surface)', color: lista.concluida ? '#6ee7a0' : 'var(--text-muted)', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 600 }}>
                  {lista.concluida ? '✅ Concluída' : 'Marcar concluída'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function WishlistCompras() {
  const uid = useUid()
  const [itens, setItens] = useState<ItemWishlist[]>([])
  const [listas, setListas] = useState<ListaCompras[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'wishlist' | 'listas'>('wishlist')
  const [modalItem, setModalItem] = useState(false)
  const [editandoItem, setEditandoItem] = useState<ItemWishlist | null>(null)
  const [modalLista, setModalLista] = useState(false)
  const [editandoLista, setEditandoLista] = useState<ListaCompras | null>(null)

  useEffect(() => {
    if (!uid) return
    const u1 = onSnapshot(collection(db, 'users', uid, 'wishlist'), snap => {
      setItens(snap.docs.map(d => ({ id: d.id, ...d.data() } as ItemWishlist)).sort((a, b) => b.criadoEm - a.criadoEm))
      setLoading(false)
    })
    const u2 = onSnapshot(collection(db, 'users', uid, 'listasCompras'), snap => {
      setListas(snap.docs.map(d => ({ id: d.id, ...d.data() } as ListaCompras)).sort((a, b) => b.criadoEm - a.criadoEm))
    })
    return () => { u1(); u2() }
  }, [uid])

  const totalPendente = itens.filter(i => i.status !== 'comprado' && i.status !== 'cancelado').reduce((a, i) => a + (i.preco || 0), 0)
  const totalGasto = itens.filter(i => i.status === 'comprado').reduce((a, i) => a + (i.preco || 0), 0)
  const itensPrioritarios = itens.filter(i => (i.prioridade === 'urgente' || i.prioridade === 'alta') && i.status !== 'comprado' && i.status !== 'cancelado').length

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#f59e0b', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* ── BANNER ── */}
      <div style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(251,191,36,0.06) 50%, transparent 100%)', borderBottom: '1px solid rgba(245,158,11,0.2)', padding: '20px 28px 18px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', color: 'var(--text-primary)' }}>Wishlist & Compras</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {itens.length} itens · {fmtMoeda(totalPendente)} pendente · {fmtMoeda(totalGasto)} gasto
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setEditandoLista(null); setModalLista(true) }}
              style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}>
              📝 Nova Lista
            </button>
            <button onClick={() => { setEditandoItem(null); setModalItem(true) }}
              style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#c47c2e,#f59e0b)', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
              + Adicionar Item
            </button>
          </div>
        </div>

        {/* KPIs rápidos */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          {[
            { icon: '💭', label: 'Desejados', val: itens.filter(i => i.status === 'desejado').length, color: '#6b9fd4' },
            { icon: '📋', label: 'Planejados', val: itens.filter(i => i.status === 'planejado').length, color: '#fbbf24' },
            { icon: '✅', label: 'Comprados', val: itens.filter(i => i.status === 'comprado').length, color: '#6ee7a0' },
            { icon: '🔥', label: 'Prioritários', val: itensPrioritarios, color: '#f87171' },
            { icon: '💰', label: 'Já gastei', val: fmtMoeda(totalGasto), color: '#a78bfa' },
          ].map(k => (
            <div key={k.label} style={{ padding: '7px 14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.9rem' }}>{k.icon}</span>
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.val}</div>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 1 }}>{k.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── ABAS ── */}
      <div style={{ padding: '12px 28px 0', borderBottom: '1px solid var(--border-md)' }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {[{ id: 'wishlist', label: '🛒 Wishlist' }, { id: 'listas', label: '📝 Listas de Compras' }].map(a => (
            <button key={a.id} onClick={() => setAba(a.id as any)}
              style={{ padding: '10px 20px', border: 'none', background: 'transparent', color: aba === a.id ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: aba === a.id ? 700 : 500, fontSize: '0.82rem', cursor: 'pointer', borderBottom: aba === a.id ? '2px solid #f59e0b' : '2px solid transparent', marginBottom: -1, transition: 'all 0.15s' }}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTEÚDO ── */}
      <div style={{ flex: 1, padding: '20px 28px', overflowY: 'auto' }}>
        {aba === 'wishlist' && (
          <AbaWishlist uid={uid} itens={itens} onEdit={i => { setEditandoItem(i); setModalItem(true) }} />
        )}
        {aba === 'listas' && (
          <AbaListas uid={uid} listas={listas} onEdit={l => { setEditandoLista(l); setModalLista(true) }} />
        )}
      </div>

      {/* ── MODAIS ── */}
      {modalItem && <ModalItem uid={uid} item={editandoItem} onClose={() => { setModalItem(false); setEditandoItem(null) }} />}
      {modalLista && <ModalLista uid={uid} lista={editandoLista} onClose={() => { setModalLista(false); setEditandoLista(null) }} />}
    </div>
  )
}
