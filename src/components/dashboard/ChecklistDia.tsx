import { useState, useEffect, useCallback, useMemo } from 'react'
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'

// ─── Types ────────────────────────────────────────────────────────────────────
type CategoriaCheck = 'Saúde' | 'Trabalho' | 'Estudo' | 'Casa' | 'Pessoal' | 'Financeiro' | 'Família' | 'Outros'

interface CheckItem {
  id: string
  titulo: string
  categoria: CategoriaCheck
  recorrente: boolean
  criadoEm: number
  criadoNaData: string   // YYYY-MM-DD — para itens não-recorrentes
}

interface CheckMarca {
  id: string            // `${itemId}_${data}`
  itemId: string
  data: string          // YYYY-MM-DD
  feito: boolean
  feitaEm?: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function todayISO() { return new Date().toISOString().slice(0, 10) }
function fmtDataCurta(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
function fmtDataLonga(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)) as T
}

const CAT_CFG: Record<CategoriaCheck, { icon: string; cor: string }> = {
  'Saúde':      { icon: '✚', cor: '#34d399' },
  'Trabalho':   { icon: '💼', cor: '#60a5fa' },
  'Estudo':     { icon: '📚', cor: '#a78bfa' },
  'Casa':       { icon: '🏠', cor: '#fb923c' },
  'Pessoal':    { icon: '🙋', cor: '#f472b6' },
  'Financeiro': { icon: '◎', cor: '#fbbf24' },
  'Família':    { icon: '👨‍👩‍👧', cor: '#f59e0b' },
  'Outros':     { icon: '◈', cor: '#94a3b8' },
}
const CATEGORIAS = Object.keys(CAT_CFG) as CategoriaCheck[]

const IS: React.CSSProperties = {
  background: 'var(--bg-hover)',
  border: '1px solid var(--border-md)',
  borderRadius: 9, padding: '8px 12px',
  color: 'var(--text-primary)', fontSize: '0.82rem',
  width: '100%', outline: 'none', boxSizing: 'border-box',
}

// ─── Hook de dados ────────────────────────────────────────────────────────────
export function useChecklistDia() {
  const uid = useUid()
  const [items, setItems] = useState<CheckItem[]>([])
  const [marcas, setMarcas] = useState<CheckMarca[]>([])
  const hoje = todayISO()

  useEffect(() => {
    if (!uid || !db) return
    const u1 = onSnapshot(collection(db, `users/${uid}/checklist_items`), s =>
      setItems(s.docs.map(d => ({ id: d.id, ...d.data() } as CheckItem))))
    const u2 = onSnapshot(collection(db, `users/${uid}/checklist_marcas`), s =>
      setMarcas(s.docs.map(d => ({ id: d.id, ...d.data() } as CheckMarca))))
    return () => { u1(); u2() }
  }, [uid])

  // Itens visíveis hoje: recorrentes + não-recorrentes criados hoje
  const itemsHoje = useMemo(() =>
    items.filter(i => i.recorrente || i.criadoNaData === hoje)
      .sort((a, b) => {
        // Recorrentes primeiro, depois por categoria, depois por criação
        if (a.recorrente !== b.recorrente) return a.recorrente ? -1 : 1
        return a.criadoEm - b.criadoEm
      }), [items, hoje])

  const getMarca = useCallback((itemId: string, data = hoje) =>
    marcas.find(m => m.itemId === itemId && m.data === data), [marcas, hoje])

  const feitos = itemsHoje.filter(i => getMarca(i.id)?.feito).length
  const total = itemsHoje.length
  const pct = total > 0 ? Math.round((feitos / total) * 100) : 0

  return { items, itemsHoje, marcas, getMarca, feitos, total, pct, uid }
}

// ─── Modal completo ───────────────────────────────────────────────────────────
interface ModalProps {
  onClose: () => void
  items: CheckItem[]
  itemsHoje: CheckItem[]
  marcas: CheckMarca[]
  getMarca: (itemId: string, data?: string) => CheckMarca | undefined
  uid: string | null
}

export function ModalChecklist({ onClose, items, itemsHoje, marcas, getMarca, uid }: ModalProps) {
  const [aba, setAba] = useState<'hoje' | 'gerenciar' | 'relatorio'>('hoje')
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novaCat, setNovaCat] = useState<CategoriaCheck>('Pessoal')
  const [novoRecorrente, setNovoRecorrente] = useState(true)
  const [dataRelatorio, setDataRelatorio] = useState(() => {
    const hoje = new Date()
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  })
  const hoje = todayISO()

  const saveItem = async () => {
    if (!uid || !novoTitulo.trim()) return
    const item: CheckItem = {
      id: newId(), titulo: novoTitulo.trim(), categoria: novaCat,
      recorrente: novoRecorrente, criadoEm: Date.now(), criadoNaData: hoje,
    }
    await setDoc(doc(db, `users/${uid}/checklist_items`, item.id), clean(item))
    setNovoTitulo('')
  }

  const delItem = async (id: string) => {
    if (!uid || !window.confirm('Excluir esta atividade?')) return
    await deleteDoc(doc(db, `users/${uid}/checklist_items`, id))
    // limpar marcas deste item
    const mToDelete = marcas.filter(m => m.itemId === id)
    await Promise.all(mToDelete.map(m => deleteDoc(doc(db, `users/${uid}/checklist_marcas`, m.id))))
  }

  const toggleMarca = async (item: CheckItem, data = hoje) => {
    if (!uid) return
    const existing = getMarca(item.id, data)
    const marcaId = `${item.id}_${data}`
    if (existing?.feito) {
      await setDoc(doc(db, `users/${uid}/checklist_marcas`, marcaId),
        clean({ id: marcaId, itemId: item.id, data, feito: false }))
    } else {
      await setDoc(doc(db, `users/${uid}/checklist_marcas`, marcaId),
        clean({ id: marcaId, itemId: item.id, data, feito: true, feitaEm: Date.now() }))
    }
  }

  // Relatório mensal
  const diasDoMes = useMemo(() => {
    const [ano, mes] = dataRelatorio.split('-').map(Number)
    const qtd = new Date(ano, mes, 0).getDate()
    return Array.from({ length: qtd }, (_, i) => {
      const d = i + 1
      return `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    })
  }, [dataRelatorio])

  const itemsRecorrentes = items.filter(i => i.recorrente)

  // Taxa de conclusão por dia
  const taxaPorDia = useMemo(() => diasDoMes.map(data => {
    const visiveis = items.filter(i => i.recorrente || i.criadoNaData === data)
    if (visiveis.length === 0) return null
    const feitos = visiveis.filter(i => marcas.find(m => m.itemId === i.id && m.data === data && m.feito)).length
    return { data, feitos, total: visiveis.length, pct: Math.round((feitos / visiveis.length) * 100) }
  }), [diasDoMes, items, marcas])

  // Taxa por item recorrente no mês
  const taxaPorItem = useMemo(() => itemsRecorrentes.map(item => {
    const diasPassados = diasDoMes.filter(d => d <= hoje)
    const feitos = diasPassados.filter(d => marcas.find(m => m.itemId === item.id && m.data === d && m.feito)).length
    return { item, feitos, total: diasPassados.length, pct: diasPassados.length > 0 ? Math.round((feitos / diasPassados.length) * 100) : 0 }
  }), [itemsRecorrentes, diasDoMes, marcas, hoje])

  const mediaGeral = useMemo(() => {
    const dias = taxaPorDia.filter(d => d !== null && d.data <= hoje) as { data: string; feitos: number; total: number; pct: number }[]
    if (dias.length === 0) return 0
    return Math.round(dias.reduce((a, d) => a + d.pct, 0) / dias.length)
  }, [taxaPorDia, hoje])

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-2,#1a1b26)', border: '1px solid var(--border-md)', borderRadius: 22, width: '100%', maxWidth: 620, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.65)' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              ✅ Checklist Diário
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{fmtDataLonga(hoje)}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', gap: 0, padding: '12px 24px 0', borderBottom: '1px solid var(--border)' }}>
          {([['hoje', '☀ Hoje'], ['gerenciar', '⚙ Gerenciar'], ['relatorio', '📊 Relatório']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setAba(id)}
              style={{ padding: '8px 16px', border: 'none', background: 'transparent', color: aba === id ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: aba === id ? 700 : 400, fontSize: '0.78rem', cursor: 'pointer', borderBottom: aba === id ? '2px solid #60a5fa' : '2px solid transparent', marginBottom: -1, whiteSpace: 'nowrap' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px 20px' }}>

          {/* ── ABA HOJE ── */}
          {aba === 'hoje' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {itemsHoje.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>☀️</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Nenhuma atividade para hoje</div>
                  <div style={{ fontSize: '0.72rem', marginTop: 5 }}>Vá em <strong>⚙ Gerenciar</strong> para adicionar</div>
                </div>
              ) : (
                <>
                  {/* Barra de progresso geral */}
                  {itemsHoje.length > 0 && (() => {
                    const feitos = itemsHoje.filter(i => getMarca(i.id)?.feito).length
                    const pct = Math.round((feitos / itemsHoje.length) * 100)
                    return (
                      <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', marginBottom: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Progresso do dia</span>
                          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', color: pct === 100 ? '#34d399' : '#60a5fa' }}>{feitos}/{itemsHoje.length} · {pct}%</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: 'var(--border-md)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'linear-gradient(90deg,#34d399,#10b981)' : 'linear-gradient(90deg,#1A73E8,#60a5fa)', borderRadius: 4, transition: 'width 0.5s', boxShadow: `0 0 10px ${pct === 100 ? '#34d39960' : '#60a5fa60'}` }} />
                        </div>
                        {pct === 100 && <div style={{ fontSize: '0.68rem', color: '#34d399', marginTop: 6, fontWeight: 700, textAlign: 'center' }}>🎉 Dia completo!</div>}
                      </div>
                    )
                  })()}

                  {/* Lista de itens por categoria */}
                  {CATEGORIAS.map(cat => {
                    const catItems = itemsHoje.filter(i => i.categoria === cat)
                    if (catItems.length === 0) return null
                    const cfg = CAT_CFG[cat]
                    return (
                      <div key={cat}>
                        <div style={{ fontSize: '0.58rem', color: cfg.cor, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 5, marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                          {cfg.icon} {cat}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {catItems.map(item => {
                            const marca = getMarca(item.id)
                            const feito = !!marca?.feito
                            return (
                              <button key={item.id} onClick={() => toggleMarca(item)}
                                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 11, border: `1px solid ${feito ? cfg.cor + '40' : 'var(--border-md)'}`, background: feito ? `${cfg.cor}0d` : 'var(--bg-hover)', textAlign: 'left', cursor: 'pointer', transition: 'all 0.18s', width: '100%' }}
                                onMouseEnter={e => { if (!feito) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = feito ? `${cfg.cor}0d` : 'var(--card-bg)' }}>
                                {/* Checkbox */}
                                <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${feito ? cfg.cor : 'var(--border-md)'}`, background: feito ? cfg.cor : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.18s', boxShadow: feito ? `0 0 10px ${cfg.cor}50` : 'none' }}>
                                  {feito && <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 900 }}>✓</span>}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '0.85rem', fontWeight: feito ? 400 : 600, color: feito ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: feito ? 'line-through' : 'none', transition: 'all 0.18s' }}>{item.titulo}</div>
                                  {item.recorrente && <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 1 }}>🔄 Recorrente</div>}
                                </div>
                                {feito && marca?.feitaEm && (
                                  <div style={{ fontSize: '0.58rem', color: cfg.cor, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                                    {new Date(marca.feitaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}

          {/* ── ABA GERENCIAR ── */}
          {aba === 'gerenciar' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Form nova atividade */}
              <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.18)' }}>
                <div style={{ fontSize: '0.65rem', color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 12 }}>+ Nova Atividade</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input style={IS} value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveItem()}
                    placeholder="Ex: Beber 2L de água, Revisar processo, Meditar..." autoFocus />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
                    <select style={IS} value={novaCat} onChange={e => setNovaCat(e.target.value as CategoriaCheck)}>
                      {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_CFG[c].icon} {c}</option>)}
                    </select>
                    <button onClick={() => setNovoRecorrente(v => !v)}
                      style={{ padding: '8px 14px', borderRadius: 9, border: `1px solid ${novoRecorrente ? 'rgba(167,139,250,0.5)' : 'var(--border-md)'}`, background: novoRecorrente ? 'rgba(167,139,250,0.12)' : 'var(--bg-hover)', color: novoRecorrente ? '#a78bfa' : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                      {novoRecorrente ? '🔄 Recorrente' : '1️⃣ Só hoje'}
                    </button>
                  </div>
                  <button onClick={saveItem} disabled={!novoTitulo.trim()}
                    style={{ padding: '9px', borderRadius: 10, border: 'none', background: novoTitulo.trim() ? 'linear-gradient(135deg,#1A73E8,#60a5fa)' : 'var(--bg-hover)', color: novoTitulo.trim() ? '#fff' : 'var(--text-muted)', fontWeight: 800, fontSize: '0.82rem', cursor: novoTitulo.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
                    + Adicionar Atividade
                  </button>
                </div>
              </div>

              {/* Lista de todas as atividades */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 2 }}>
                  {items.length} atividade(s) cadastrada(s)
                </div>
                {items.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.78rem' }}>Nenhuma atividade ainda</div>
                )}
                {CATEGORIAS.map(cat => {
                  const catItems = items.filter(i => i.categoria === cat)
                  if (catItems.length === 0) return null
                  const cfg = CAT_CFG[cat]
                  return (
                    <div key={cat} style={{ marginBottom: 4 }}>
                      <div style={{ fontSize: '0.58rem', color: cfg.cor, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                        {cfg.icon} {cat}
                      </div>
                      {catItems.map(item => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)', marginBottom: 4 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.titulo}</div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
                              <span>{item.recorrente ? '🔄 Recorrente' : `1️⃣ Criado em ${fmtDataCurta(item.criadoNaData)}`}</span>
                            </div>
                          </div>
                          <button onClick={() => delItem(item.id)}
                            style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.07)', color: '#f87171', fontSize: '0.7rem', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── ABA RELATÓRIO ── */}
          {aba === 'relatorio' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Seletor de mês */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="month" value={dataRelatorio} onChange={e => setDataRelatorio(e.target.value)}
                  style={{ ...IS, width: 'auto', flex: 1 }} />
                <div style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: '#60a5fa', whiteSpace: 'nowrap' }}>
                  {mediaGeral}% média
                </div>
              </div>

              {/* Heatmap de dias */}
              <div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 700, marginBottom: 8 }}>Taxa de conclusão por dia</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {taxaPorDia.map(d => {
                    if (!d) return null
                    const isFuture = d.data > hoje
                    const bg = isFuture ? 'var(--bg-hover)'
                      : d.pct === 100 ? '#34d399'
                      : d.pct >= 75 ? '#60a5fa'
                      : d.pct >= 50 ? '#fbbf24'
                      : d.pct > 0 ? '#f87171'
                      : 'var(--border-md)'
                    const dia = parseInt(d.data.split('-')[2])
                    return (
                      <div key={d.data} title={`${fmtDataCurta(d.data)}: ${d.feitos}/${d.total} (${d.pct}%)`}
                        style={{ width: 28, height: 28, borderRadius: 6, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: isFuture ? 'var(--text-muted)' : d.pct > 0 ? '#fff' : 'var(--text-muted)', cursor: 'default', border: d.data === hoje ? '2px solid #60a5fa' : '1px solid transparent', transition: 'transform 0.1s', opacity: isFuture ? 0.4 : 1 }}>
                        {dia}
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                  {[['#34d399', '100%'], ['#60a5fa', '≥75%'], ['#fbbf24', '≥50%'], ['#f87171', '>0%'], ['var(--border-md)', '0%']].map(([c, l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Taxa por atividade recorrente */}
              {taxaPorItem.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 700, marginBottom: 8 }}>Consistência por atividade (recorrentes)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {taxaPorItem.sort((a, b) => b.pct - a.pct).map(({ item, feitos, total: tot, pct }) => {
                      const cfg = CAT_CFG[item.categoria]
                      return (
                        <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--border-md)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: '0.8rem' }}>{cfg.icon}</span>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.titulo}</span>
                            </div>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.88rem', color: pct >= 80 ? '#34d399' : pct >= 50 ? '#fbbf24' : '#f87171' }}>{pct}%</span>
                          </div>
                          <div style={{ height: 5, borderRadius: 3, background: 'var(--border-md)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: pct >= 80 ? '#34d399' : pct >= 50 ? '#fbbf24' : '#f87171', borderRadius: 3, transition: 'width 0.8s' }} />
                          </div>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{feitos} de {tot} dias concluído(s)</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Card do Dashboard ────────────────────────────────────────────────────────
export default function PainelChecklistDia({ dragging, dragOver: _dO, onDragStart, onDragEnd, onDragOver, onDrop }: any) {
  const { itemsHoje, getMarca, feitos, total, pct, uid, items, marcas } = useChecklistDia()
  const [modalAberto, setModalAberto] = useState(false)
  const cor = pct === 100 ? '#34d399' : '#60a5fa'

  const toggleMarca = async (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!uid) return
    const hoje = todayISO()
    const existing = getMarca(itemId, hoje)
    const marcaId = `${itemId}_${hoje}`
    if (existing?.feito) {
      await setDoc(doc(db, `users/${uid}/checklist_marcas`, marcaId),
        clean({ id: marcaId, itemId, data: hoje, feito: false }))
    } else {
      await setDoc(doc(db, `users/${uid}/checklist_marcas`, marcaId),
        clean({ id: marcaId, itemId, data: hoje, feito: true, feitaEm: Date.now() }))
    }
  }

  return (
    <>
      <div draggable
        onDragStart={() => onDragStart?.('checklist-dia')} onDragEnd={() => onDragEnd?.()}
        onDragOver={e => onDragOver?.(e, 'checklist-dia')} onDrop={e => onDrop?.(e, 'checklist-dia')}
        style={{ padding: '16px 18px', borderRadius: 16, border: `1px solid ${cor}25`, background: `linear-gradient(135deg,${cor}07,transparent)`, textAlign: 'left', transition: 'all 0.2s', opacity: dragging === 'checklist-dia' ? 0.45 : 1, cursor: 'default', display: 'flex', flexDirection: 'column', gap: 10 }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 24px ${cor}18` }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>

        {/* Header clicável */}
        <div onClick={() => setModalAberto(true)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', opacity: 0.5 }}>⠿</span>
              ✅ Checklist · Hoje
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.5rem', color: cor, lineHeight: 1 }}>
              {feitos}<span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 400 }}>/{total}</span>
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 3 }}>
              {pct === 100 ? '🎉 Dia completo!' : total === 0 ? 'Clique para configurar' : `${pct}% concluído`}
            </div>
          </div>
          <span style={{ fontSize: '1.5rem', opacity: 0.6 }}>✅</span>
        </div>

        {/* Barra de progresso */}
        {total > 0 && (
          <div onClick={() => setModalAberto(true)} style={{ cursor: 'pointer' }}>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--border-md)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'linear-gradient(90deg,#34d399,#10b981)' : `linear-gradient(90deg,#1A73E8,${cor})`, borderRadius: 3, transition: 'width 0.6s', boxShadow: `0 0 8px ${cor}40` }} />
            </div>
          </div>
        )}

        {/* Lista de checks inline no card */}
        {itemsHoje.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 160, overflowY: 'auto' }}>
            {itemsHoje.map(item => {
              const feito = !!getMarca(item.id)?.feito
              const cfg = CAT_CFG[item.categoria]
              return (
                <div key={item.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8, background: feito ? `${cfg.cor}0d` : 'var(--card-bg)', border: `1px solid ${feito ? cfg.cor + '40' : 'var(--border-md)'}`, transition: 'all 0.15s' }}>
                  {/* Checkbox clicável no card */}
                  <button onClick={e => toggleMarca(item.id, e)}
                    style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${feito ? cfg.cor : 'var(--border-md)'}`, background: feito ? cfg.cor : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', transition: 'all 0.15s', padding: 0, boxShadow: feito ? `0 0 6px ${cfg.cor}50` : 'none' }}>
                    {feito && <span style={{ color: '#fff', fontSize: '0.6rem', fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </button>
                  <span onClick={() => setModalAberto(true)}
                    style={{ fontSize: '0.75rem', fontWeight: feito ? 400 : 600, color: feito ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: feito ? 'line-through' : 'none', flex: 1, cursor: 'pointer', transition: 'all 0.15s', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.titulo}
                  </span>
                  <span style={{ fontSize: '0.65rem', flexShrink: 0 }}>{cfg.icon}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Botão abrir modal se vazio */}
        {total === 0 && (
          <button onClick={() => setModalAberto(true)}
            style={{ padding: '8px', borderRadius: 9, border: '1px dashed rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.05)', color: '#60a5fa', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
            + Criar atividades
          </button>
        )}
      </div>

      {modalAberto && (
        <ModalChecklist
          onClose={() => setModalAberto(false)}
          items={items}
          itemsHoje={itemsHoje}
          marcas={marcas}
          getMarca={getMarca}
          uid={uid}
        />
      )}
    </>
  )
}
