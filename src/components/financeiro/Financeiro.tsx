import { useState, useEffect, useCallback, useMemo } from 'react'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts'

/* ═══ Types ══════════════════════════════════════════════════ */
type Tipo = 'receita' | 'despesa'
interface Transacao {
  id: string; data: string; descricao: string; valor: number
  tipo: Tipo; categoria: string; subcategoria: string
  positivo: boolean; observacao: string; criadoEm: string
}
interface ContaPagar {
  id: string; descricao: string; valor: number; vencimento: string
  categoria: string; pago: boolean; recorrente: boolean; criadoEm: string
}
interface Categoria { nome: string; subs: string[] }

/* ═══ Categorias de RECEITA ══════════════════════════════════ */
const CATS_RECEITA: Categoria[] = [
  { nome: 'Remuneração', subs: ['Salário', 'Adiantamento Salarial', '13º Salário', 'Férias', 'PLR / Bônus', 'Gratificação', 'Insalubridade / Periculosidade', 'Horas Extras', 'Abono Pecuniário'] },
  { nome: 'Rendimentos', subs: ['Dividendos', 'Juros sobre Capital Próprio', 'Rendimento CDB/LCI/LCA', 'Renda Fixa', 'Renda Variável', 'FIIs', 'Poupança', 'Tesouro Direto'] },
  { nome: 'Trabalho Autônomo', subs: ['Freelance', 'Consultoria', 'Honorários Advocatícios', 'Prestação de Serviços', 'Comissões'] },
  { nome: 'Renda Passiva', subs: ['Aluguel Recebido', 'Royalties', 'Licenciamento', 'Participação Societária'] },
  { nome: 'Benefícios', subs: ['Vale Alimentação', 'Vale Refeição', 'Vale Transporte', 'Auxílio Saúde', 'Auxílio Creche', 'Seguro de Vida', 'Benefícios em Geral'] },
  { nome: 'Transferências e Outros', subs: ['Venda de Bens', 'Herança / Doação Recebida', 'Reembolso', 'Restituição IR', 'Prêmio / Concurso', 'Estorno / Cashback', 'Outros'] },
]

/* ═══ Categorias de DESPESA ══════════════════════════════════ */
const CATS_DESPESA: Categoria[] = [
  { nome: 'Moradia', subs: ['Aluguel', 'Financiamento Imóvel', 'Condomínio', 'IPTU', 'Água', 'Luz', 'Gás', 'Internet', 'TV a Cabo', 'Telefone Fixo', 'Seguro Residencial', 'Reforma/Manutenção'] },
  { nome: 'Alimentação', subs: ['Supermercado', 'Feira/Hortifruti', 'Açougue', 'Padaria/Confeitaria', 'Almoço no Trabalho', 'Lanche da Tarde', 'Café da Manhã', 'Restaurante', 'Delivery/iFood', 'Lanches Rápidos', 'Bebidas', 'Doces/Guloseimas'] },
  { nome: 'Transporte', subs: ['Combustível', 'Estacionamento', 'Pedágio', 'Manutenção Veículo', 'IPVA', 'Licenciamento', 'Seguro Auto', 'Uber/99', 'Taxi', 'Ônibus/Metrô', 'VLT/Trem', 'Aplicativo de Bicicleta'] },
  { nome: 'Saúde', subs: ['Plano de Saúde', 'Consulta Médica', 'Consulta Dentista', 'Consulta Psicólogo', 'Exames/Laboratório', 'Medicamentos', 'Farmácia', 'Óculos/Lentes', 'Academia/Musculação', 'Personal Trainer', 'Yoga/Pilates'] },
  { nome: 'Educação', subs: ['Faculdade/Pós-Graduação', 'Cursos Online', 'Cursinhos/Preparatórios', 'Concurso Público (Taxa)', 'Livros Técnicos', 'Material Escolar', 'Idiomas', 'Certificações/Provas'] },
  { nome: 'Vestuário', subs: ['Roupas Cotidianas', 'Roupas Formais', 'Calçados', 'Acessórios', 'Roupas Esportivas', 'Alfaiataria/Ajuste'] },
  { nome: 'Lazer e Entretenimento', subs: ['Netflix/Streaming', 'Spotify/Música', 'Games', 'Cinema/Teatro', 'Shows/Eventos', 'Viagens', 'Hotéis/Airbnb', 'Parques/Atrações', 'Livros/Revistas', 'Hobbies'] },
  { nome: 'Supérfluos', subs: ['Compras por Impulso', 'Presentes Não Planejados', 'Apostas/Loterias', 'Itens Desnecessários', 'Luxos Ocasionais'] },
  { nome: 'Pessoal e Bem-Estar', subs: ['Cabeleireiro/Barbearia', 'Salão de Beleza', 'Manicure/Pedicure', 'Produtos de Higiene', 'Cosméticos/Perfumes', 'Spa/Massagem'] },
  { nome: 'Casa e Equipamentos', subs: ['Móveis', 'Eletrodomésticos', 'Eletrônicos', 'Utensílios Domésticos', 'Decoração', 'Jardinagem'] },
  { nome: 'Pets', subs: ['Ração', 'Veterinário', 'Banho e Tosa', 'Remédios Pet', 'Acessórios Pet'] },
  { nome: 'Finanças', subs: ['Parcelas/Prestações', 'Cartão de Crédito', 'Empréstimo', 'Juros Bancários', 'Tarifas Bancárias', 'Seguros (Geral)', 'Previdência Privada', 'Investimentos'] },
  { nome: 'Impostos e Taxas', subs: ['Imposto de Renda', 'IPTU', 'IPVA', 'Taxas Governamentais', 'Cartório'] },
  { nome: 'Profissional', subs: ['Material de Trabalho', 'Assinaturas Profissionais', 'Equipamentos', 'Transporte a Trabalho', 'Alimentação no Trabalho'] },
  { nome: 'Doações e Presentes', subs: ['Presentes Aniversário', 'Presentes Natal', 'Doações Sociais', 'Dízimo/Oferta'] },
  { nome: 'Outros', subs: ['Não Classificado', 'Miscellaneous'] },
]

/* manter compatibilidade: CATS_DEFAULT usado apenas para contas a pagar */
const CATS_DEFAULT: Categoria[] = [...CATS_DESPESA]

const COLORS = ['#00e5ff', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16']
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function fmtDate(d: string) { if (!d) return ''; const [y, m, dy] = d.split('-'); return `${dy}/${m}/${y}` }
function fmtMoeda(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function todayISO() { return new Date().toISOString().slice(0, 10) }
function daysUntil(d: string) { return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) }

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: '0.88rem' }
const sel: React.CSSProperties = { ...inp, cursor: 'pointer' }
function FL({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 12 }}><label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5, fontFamily: 'var(--font-mono)' }}>{label}</label>{children}</div>
}

/* ═══ Hook ═══════════════════════════════════════════════════ */
function useFinanceiro() {
  const [transacoes, setTransacoes] = useState<Transacao[]>([])
  const [contas, setContas] = useState<ContaPagar[]>([])
  const [cats, setCats] = useState<Categoria[]>(CATS_DEFAULT)
  const [loading, setLoading] = useState(true)
  const uid = useUid()

  useEffect(() => {
    if (!uid || !db) { setLoading(false); return }
    const u1 = onSnapshot(query(collection(db, `users/${uid}/transacoes`), orderBy('data', 'desc')), s => { setTransacoes(s.docs.map(d => d.data() as Transacao)); setLoading(false) })
    const u2 = onSnapshot(query(collection(db, `users/${uid}/contasPagar`), orderBy('vencimento', 'asc')), s => setContas(s.docs.map(d => d.data() as ContaPagar)))
    const u3 = onSnapshot(doc(db, `users/${uid}/config/categorias`), s => { if (s.exists()) setCats(s.data().lista ?? CATS_DEFAULT) })
    return () => { u1(); u2(); u3() }
  }, [uid])

  const saveT = useCallback(async (t: Transacao) => {
    if (uid && db) await setDoc(doc(db, `users/${uid}/transacoes`, t.id), t)
    else setTransacoes(p => [t, ...p.filter(x => x.id !== t.id)].sort((a, b) => b.data.localeCompare(a.data)))
  }, [uid])

  const delT = useCallback(async (id: string) => {
    if (uid && db) await deleteDoc(doc(db, `users/${uid}/transacoes`, id))
    else setTransacoes(p => p.filter(x => x.id !== id))
  }, [uid])

  const saveC = useCallback(async (c: ContaPagar) => {
    if (uid && db) await setDoc(doc(db, `users/${uid}/contasPagar`, c.id), c)
    else setContas(p => [...p.filter(x => x.id !== c.id), c].sort((a, b) => a.vencimento.localeCompare(b.vencimento)))
  }, [uid])

  const delC = useCallback(async (id: string) => {
    if (uid && db) await deleteDoc(doc(db, `users/${uid}/contasPagar`, id))
    else setContas(p => p.filter(x => x.id !== id))
  }, [uid])

  const saveCats = useCallback(async (lista: Categoria[]) => {
    setCats(lista)
    if (uid && db) await setDoc(doc(db, `users/${uid}/config/categorias`), { lista })
  }, [uid])

  return { transacoes, contas, cats, loading, saveT, delT, saveC, delC, saveCats }
}

/* ═══ FormTransacao ══════════════════════════════════════════ */
function FormTransacao({ initial, onSave, onClose }: { initial?: Partial<Transacao>; onSave: (t: Transacao) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    data: initial?.data ?? todayISO(),
    descricao: initial?.descricao ?? '',
    valorStr: initial?.valor != null && initial.valor > 0 ? String(initial.valor) : '',
    tipo: (initial?.tipo ?? 'despesa') as Tipo,
    categoria: initial?.categoria ?? '',
    subcategoria: initial?.subcategoria ?? '',
    positivo: initial?.positivo ?? false,
    observacao: initial?.observacao ?? '',
  })

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value }))

  const catsAtivas = form.tipo === 'receita' ? CATS_RECEITA : CATS_DESPESA
  const cat = catsAtivas.find(c => c.nome === form.categoria)

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Permitir qualquer string que pareça número (incluindo vírgula como decimal)
    const v = e.target.value.replace(/[^\d,\.]/g, '')
    setForm(p => ({ ...p, valorStr: v }))
  }

  const parseValor = () => {
    const s = form.valorStr.replace(',', '.')
    const n = parseFloat(s)
    return isNaN(n) ? 0 : n
  }

  const handleTipoChange = (t: Tipo) => {
    setForm(p => ({ ...p, tipo: t, categoria: '', subcategoria: '' }))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-md)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--bg-2)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-accent)' }}>{initial?.id ? 'Editar' : 'Nova'} Transação</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '18px 22px' }}>
          {/* Tipo */}
          <FL label="Tipo">
            <div style={{ display: 'flex', gap: 8 }}>
              {(['receita', 'despesa'] as Tipo[]).map(t => (
                <button key={t} type="button" onClick={() => handleTipoChange(t)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${form.tipo === t ? (t === 'receita' ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)') : 'var(--border)'}`, background: form.tipo === t ? (t === 'receita' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)') : 'none', color: form.tipo === t ? (t === 'receita' ? '#10b981' : '#ef4444') : 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', fontSize: '0.88rem' }}>
                  {t === 'receita' ? '↑ Receita' : '↓ Despesa'}
                </button>
              ))}
            </div>
          </FL>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FL label="Data"><input type="date" style={inp} value={form.data} onChange={f('data')} /></FL>
            <FL label="Valor (R$)">
              <input
                type="text"
                inputMode="decimal"
                style={inp}
                value={form.valorStr}
                onChange={handleValorChange}
                placeholder="Ex: 12500,00"
              />
            </FL>
          </div>
          <FL label="Descrição"><input style={inp} value={form.descricao} onChange={f('descricao')} placeholder="Ex: Conta de luz, Salário…" /></FL>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FL label="Categoria">
              <select style={sel} value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value, subcategoria: '' }))}>
                <option value="">Selecione…</option>
                {catsAtivas.map(c => <option key={c.nome}>{c.nome}</option>)}
              </select>
            </FL>
            <FL label="Subcategoria">
              <select style={sel} value={form.subcategoria} onChange={f('subcategoria')}>
                <option value="">Selecione…</option>
                {cat?.subs.map(s => <option key={s}>{s}</option>)}
              </select>
            </FL>
          </div>
          {/* Positivo/Negativo */}
          <FL label="Classificação">
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setForm(p => ({ ...p, positivo: true }))} style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${form.positivo ? 'rgba(59,130,246,0.5)' : 'var(--border)'}`, background: form.positivo ? 'rgba(59,130,246,0.1)' : 'none', color: form.positivo ? '#3b82f6' : 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}>🔵 Positivo</button>
              <button type="button" onClick={() => setForm(p => ({ ...p, positivo: false }))} style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${!form.positivo ? 'rgba(239,68,68,0.5)' : 'var(--border)'}`, background: !form.positivo ? 'rgba(239,68,68,0.1)' : 'none', color: !form.positivo ? '#ef4444' : 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}>🔴 Negativo</button>
            </div>
          </FL>
          <FL label="Observação"><textarea style={{ ...inp, minHeight: 56, resize: 'vertical' } as React.CSSProperties} value={form.observacao} onChange={f('observacao')} /></FL>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={() => onSave({ id: (initial as any)?.id ?? newId(), criadoEm: (initial as any)?.criadoEm ?? new Date().toISOString(), ...form, valor: parseValor() })} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(0,229,255,0.4)', background: 'rgba(0,229,255,0.1)', color: 'var(--text-accent)', fontFamily: 'var(--font-display)', fontWeight: 700, cursor: 'pointer' }}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══ FormContaPagar ══════════════════════════════════════════ */
function FormContaPagar({ cats, initial, onSave, onClose }: { cats: Categoria[]; initial?: Partial<ContaPagar>; onSave: (c: ContaPagar) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    descricao: initial?.descricao ?? '',
    valorStr: initial?.valor != null && initial.valor > 0 ? String(initial.valor) : '',
    vencimento: initial?.vencimento ?? '',
    categoria: initial?.categoria ?? '',
    recorrente: initial?.recorrente ?? false,
    pago: initial?.pago ?? false,
  })

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/[^\d,\.]/g, '')
    setForm(p => ({ ...p, valorStr: v }))
  }

  const parseValor = () => {
    const s = form.valorStr.replace(',', '.')
    const n = parseFloat(s)
    return isNaN(n) ? 0 : n
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-md)', borderRadius: 16, width: '100%', maxWidth: 460, boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', color: '#f59e0b' }}>{initial?.id ? 'Editar' : 'Nova'} Conta a Pagar</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '18px 22px' }}>
          <FL label="Descrição"><input style={inp} value={form.descricao} onChange={f('descricao')} placeholder="Ex: Conta de luz, Cartão de crédito…" /></FL>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FL label="Valor (R$)">
              <input
                type="text"
                inputMode="decimal"
                style={inp}
                value={form.valorStr}
                onChange={handleValorChange}
                placeholder="Ex: 1500,00"
              />
            </FL>
            <FL label="Vencimento"><input type="date" style={inp} value={form.vencimento} onChange={f('vencimento')} /></FL>
          </div>
          <FL label="Categoria"><select style={sel} value={form.categoria} onChange={f('categoria')}><option value="">Selecione…</option>{cats.map(c => <option key={c.nome}>{c.nome}</option>)}</select></FL>
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={form.recorrente} onChange={e => setForm(p => ({ ...p, recorrente: e.target.checked }))} />
              Recorrente mensal
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={form.pago} onChange={e => setForm(p => ({ ...p, pago: e.target.checked }))} />
              Já pago
            </label>
          </div>
          {form.recorrente && (
            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', fontSize: '0.75rem', color: '#f59e0b' }}>
              🔄 Esta despesa será projetada automaticamente nos próximos 12 meses na aba <strong>Projeção Anual</strong>.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={() => onSave({ id: (initial as any)?.id ?? newId(), criadoEm: (initial as any)?.criadoEm ?? new Date().toISOString(), ...form, valor: parseValor() })} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontFamily: 'var(--font-display)', fontWeight: 700, cursor: 'pointer' }}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══ Projeção 12 meses (tipo fatura) ════════════════════════ */
function ProjecaoAnual({ contas }: { contas: ContaPagar[] }) {
  const recorrentes = contas.filter(c => c.recorrente)
  const hoje = new Date()

  const meses = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1)
      const ano = d.getFullYear()
      const mes = d.getMonth()
      const total = recorrentes.reduce((a, c) => a + c.valor, 0)
      const label = MESES[mes] + '/' + String(ano).slice(2)
      const isMesAtual = ano === hoje.getFullYear() && mes === hoje.getMonth()
      return { label, total, isMesAtual, ano, mes }
    })
  }, [contas])

  if (recorrentes.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🔄</div>
        <div style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.82rem' }}>Nenhuma despesa recorrente cadastrada</div>
        <div style={{ fontSize: '0.72rem', marginTop: 8, opacity: 0.6 }}>Marque uma conta como "Recorrente mensal" para projetá-la aqui</div>
      </div>
    )
  }

  const maxTotal = Math.max(...meses.map(m => m.total))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Resumo recorrentes */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>
          Despesas Recorrentes Mensais ({recorrentes.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {recorrentes.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.75rem' }}>🔄</span>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{c.descricao}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{c.categoria}</div>
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: '#ef4444' }}>{fmtMoeda(c.valor)}/mês</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Total mensal recorrente</span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: '#ef4444' }}>{fmtMoeda(recorrentes.reduce((a, c) => a + c.valor, 0))}</span>
        </div>
      </div>

      {/* Fatura visual 12 meses */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 16 }}>
          Projeção — Próximos 12 Meses
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
          {meses.map(m => (
            <div key={m.label} style={{ padding: '14px 12px', borderRadius: 12, border: `1px solid ${m.isMesAtual ? 'rgba(0,229,255,0.4)' : 'var(--border)'}`, background: m.isMesAtual ? 'rgba(0,229,255,0.07)' : 'var(--bg-2)', position: 'relative', overflow: 'hidden' }}>
              {m.isMesAtual && (
                <div style={{ position: 'absolute', top: 6, right: 8, fontSize: '0.52rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-accent)', letterSpacing: '0.08em' }}>ATUAL</div>
              )}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: m.isMesAtual ? 'var(--text-accent)' : 'var(--text-muted)', marginBottom: 8 }}>{m.label}</div>
              {/* barra proporcional */}
              <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', marginBottom: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${maxTotal > 0 ? (m.total / maxTotal) * 100 : 0}%`, background: m.isMesAtual ? 'var(--text-accent)' : '#ef4444', borderRadius: 2 }} />
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.88rem', color: m.isMesAtual ? 'var(--text-accent)' : '#ef4444' }}>{fmtMoeda(m.total)}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 3 }}>{recorrentes.length} item{recorrentes.length !== 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Total projetado (12 meses)</span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: '#ef4444' }}>{fmtMoeda(recorrentes.reduce((a, c) => a + c.valor, 0) * 12)}</span>
        </div>
      </div>
    </div>
  )
}

/* ═══ Main ═══════════════════════════════════════════════════ */
type FinTab = 'visao' | 'transacoes' | 'contas' | 'projecao' | 'relatorios'

export default function Financeiro() {
  const { transacoes, contas, cats, loading, saveT, delT, saveC, delC } = useFinanceiro()
  const [tab, setTab] = useState<FinTab>('visao')
  const [modalT, setModalT] = useState(false)
  const [modalC, setModalC] = useState(false)
  const [editT, setEditT] = useState<Transacao | null>(null)
  const [editC, setEditC] = useState<ContaPagar | null>(null)
  const [filtroMes, setFiltroMes] = useState(todayISO().slice(0, 7))

  const inicioSemana = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10) }

  const tMes = useMemo(() => transacoes.filter(t => t.data.startsWith(filtroMes)), [transacoes, filtroMes])
  const tSemana = useMemo(() => transacoes.filter(t => t.data >= inicioSemana()), [transacoes])

  const receitaMes = tMes.filter(t => t.tipo === 'receita').reduce((a, t) => a + t.valor, 0)
  const despesaMes = tMes.filter(t => t.tipo === 'despesa').reduce((a, t) => a + t.valor, 0)
  const saldoMes = receitaMes - despesaMes
  const despesaSemana = tSemana.filter(t => t.tipo === 'despesa').reduce((a, t) => a + t.valor, 0)

  const contasVencendo = contas.filter(c => !c.pago && daysUntil(c.vencimento) <= 7 && daysUntil(c.vencimento) >= 0)
  const contasVencidas = contas.filter(c => !c.pago && daysUntil(c.vencimento) < 0)

  const dadosPizza = useMemo(() => {
    const byCat: Record<string, number> = {}
    tMes.filter(t => t.tipo === 'despesa').forEach(t => { byCat[t.categoria || 'Outros'] = (byCat[t.categoria || 'Outros'] || 0) + t.valor })
    return Object.entries(byCat).map(([name, value]) => ({ name, value: +value.toFixed(2) })).sort((a, b) => b.value - a.value)
  }, [tMes])

  const dadosBarra = useMemo(() => {
    const byMes: Record<string, { receita: number; despesa: number }> = {}
    transacoes.forEach(t => { const m = t.data.slice(0, 7); if (!byMes[m]) byMes[m] = { receita: 0, despesa: 0 }; byMes[m][t.tipo] += t.valor })
    return Object.entries(byMes).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([m, v]) => ({
      name: MESES[parseInt(m.slice(5, 7)) - 1] + '/' + m.slice(2, 4),
      Receitas: +v.receita.toFixed(2), Despesas: +v.despesa.toFixed(2)
    }))
  }, [transacoes])

  const tabS = (t: FinTab): React.CSSProperties => ({ padding: '10px 20px', border: 'none', background: 'none', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', letterSpacing: '0.04em', color: tab === t ? 'var(--text-accent)' : 'var(--text-muted)', borderBottom: tab === t ? '2px solid var(--text-accent)' : '2px solid transparent', transition: 'all 0.18s' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-0)' }}>
      {/* Header */}
      <div style={{ padding: '18px 24px 0', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 800, color: 'var(--text-accent)', letterSpacing: '0.1em' }}>CONTROLE FINANCEIRO</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>Receitas, despesas e contas a pagar</div>
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>MÊS:</span>
              <input type="month" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} style={{ ...inp, width: 140, padding: '5px 10px', fontSize: '0.8rem' }} />
            </div>
            {[{ l: 'Receitas', v: fmtMoeda(receitaMes), c: '#10b981' }, { l: 'Despesas', v: fmtMoeda(despesaMes), c: '#ef4444' }, { l: 'Saldo', v: fmtMoeda(saldoMes), c: saldoMes >= 0 ? '#10b981' : '#ef4444' }].map(k => (
              <div key={k.l} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, color: k.c, lineHeight: 1 }}>{k.v}</div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{k.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          <button style={tabS('visao')} onClick={() => setTab('visao')}>◈ Visão Geral</button>
          <button style={tabS('transacoes')} onClick={() => setTab('transacoes')}>≡ Transações</button>
          <button style={tabS('contas')} onClick={() => setTab('contas')}>⚠ Contas a Pagar</button>
          <button style={tabS('projecao')} onClick={() => setTab('projecao')}>🔄 Projeção Anual</button>
          <button style={tabS('relatorios')} onClick={() => setTab('relatorios')}>◉ Relatórios</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

        {/* VISÃO GERAL */}
        {tab === 'visao' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {(contasVencendo.length > 0 || contasVencidas.length > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {contasVencidas.length > 0 && <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ef4444', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 6 }}>⚠ {contasVencidas.length} CONTA(S) VENCIDA(S)</div>
                  {contasVencidas.map(c => <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '3px 0' }}><span style={{ color: 'var(--text-secondary)' }}>{c.descricao}</span><span style={{ color: '#ef4444', fontWeight: 700 }}>{fmtMoeda(c.valor)}</span></div>)}
                </div>}
                {contasVencendo.length > 0 && <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 6 }}>⏰ {contasVencendo.length} CONTA(S) VENCENDO EM BREVE</div>
                  {contasVencendo.map(c => <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '3px 0' }}><span style={{ color: 'var(--text-secondary)' }}>{c.descricao} <span style={{ color: '#f59e0b' }}>({daysUntil(c.vencimento)}d)</span></span><span style={{ color: '#f59e0b', fontWeight: 700 }}>{fmtMoeda(c.valor)}</span></div>)}
                </div>}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
              {[
                { l: 'Gasto esta semana', v: fmtMoeda(despesaSemana), c: '#ef4444' },
                { l: 'Gasto este mês', v: fmtMoeda(despesaMes), c: '#f59e0b' },
                { l: 'Receita este mês', v: fmtMoeda(receitaMes), c: '#10b981' },
                { l: 'Saldo do mês', v: fmtMoeda(saldoMes), c: saldoMes >= 0 ? '#10b981' : '#ef4444' },
                { l: 'Contas pendentes', v: contas.filter(c => !c.pago).length.toString(), c: '#f59e0b' },
              ].map(k => (
                <div key={k.l} className="kpi-card" style={{ '--kpi-color': k.c } as React.CSSProperties}>
                  <div className="kpi-label">{k.l}</div>
                  <div className="kpi-value" style={{ color: k.c, fontSize: '1.3rem' }}>{k.v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="card">
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>Despesas por Categoria — {MESES[parseInt(filtroMes.slice(5, 7)) - 1]}</div>
                {dadosPizza.length > 0 ? <ResponsiveContainer width="100%" height={200}>
                  <PieChart><Pie data={dadosPizza} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {dadosPizza.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie><Tooltip formatter={(v: number) => [fmtMoeda(v)]} contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--border-md)', borderRadius: 8 }} /></PieChart>
                </ResponsiveContainer> : <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sem despesas no mês</div>}
              </div>
              <div className="card">
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>Receitas vs Despesas — Últimos 6 meses</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dadosBarra}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                    <Tooltip formatter={(v: number) => [fmtMoeda(v)]} contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--border-md)', borderRadius: 8 }} />
                    <Bar dataKey="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} /><Bar dataKey="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Últimas Transações</div>
                <button onClick={() => setTab('transacoes')} style={{ fontSize: '0.72rem', color: 'var(--text-accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600 }}>Ver todas →</button>
              </div>
              {transacoes.slice(0, 6).map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid var(--border-light,var(--border))' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.tipo === 'receita' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', fontSize: '0.9rem', flexShrink: 0 }}>{t.tipo === 'receita' ? '↑' : '↓'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.descricao}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{fmtDate(t.data)} · {t.categoria}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.92rem', color: t.positivo ? '#3b82f6' : '#ef4444', flexShrink: 0 }}>{t.tipo === 'receita' ? '+' : '-'}{fmtMoeda(t.valor)}</div>
                </div>
              ))}
              <div style={{ padding: '10px 18px' }}>
                <button onClick={() => { setEditT(null); setModalT(true) }} style={{ width: '100%', padding: '9px', borderRadius: 8, border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.06)', color: 'var(--text-accent)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>+ Nova Transação</button>
              </div>
            </div>
          </div>
        )}

        {/* TRANSAÇÕES */}
        {tab === 'transacoes' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <button onClick={() => { setEditT(null); setModalT(true) }} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(0,229,255,0.4)', background: 'rgba(0,229,255,0.1)', color: 'var(--text-accent)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>+ Nova Transação</button>
            </div>
            {loading ? <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Carregando…</div>
              : transacoes.length === 0 ? <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>◎</div>
                <div style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.82rem' }}>Nenhuma transação registrada</div>
              </div> : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  {transacoes.map((t, i) => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < transacoes.length - 1 ? '1px solid var(--border)' : 'none', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.tipo === 'receita' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', fontSize: '1rem', flexShrink: 0 }}>{t.tipo === 'receita' ? '↑' : '↓'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t.descricao}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{fmtDate(t.data)} · {t.categoria}{t.subcategoria ? ' / ' + t.subcategoria : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', color: t.positivo ? '#3b82f6' : '#ef4444' }}>{t.tipo === 'receita' ? '+' : '-'}{fmtMoeda(t.valor)}</div>
                        <div style={{ fontSize: '0.6rem', color: t.positivo ? '#3b82f6' : '#ef4444', fontFamily: 'var(--font-mono)' }}>{t.positivo ? 'POSITIVO' : 'NEGATIVO'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        <button onClick={() => { setEditT(t); setModalT(true) }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.72rem' }}>✎</button>
                        <button onClick={() => { if (confirm('Remover?')) delT(t.id) }} style={{ background: 'none', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '4px 8px', color: '#f87171', cursor: 'pointer', fontSize: '0.72rem' }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}

        {/* CONTAS A PAGAR */}
        {tab === 'contas' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <button onClick={() => { setEditC(null); setModalC(true) }} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>+ Nova Conta a Pagar</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {contas.length === 0 ? <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>⚠</div>
                <div style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.82rem' }}>Nenhuma conta cadastrada</div>
              </div> : contas.map(c => {
                const d = daysUntil(c.vencimento)
                const urgente = !c.pago && d <= 7
                const vencida = !c.pago && d < 0
                return (
                  <div key={c.id} className="card" style={{ padding: '14px 18px', borderLeft: `4px solid ${c.pago ? '#10b981' : vencida ? '#ef4444' : urgente ? '#f59e0b' : 'var(--border)'}`, opacity: c.pago ? .7 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input type="checkbox" checked={c.pago} onChange={e => saveC({ ...c, pago: e.target.checked })} style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: c.pago ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: c.pago ? 'line-through' : 'none' }}>{c.descricao}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{c.categoria} · Vence: {fmtDate(c.vencimento)} {!c.pago && d >= 0 ? `(${d}d)` : !c.pago && d < 0 ? '(VENCIDA)' : ''}{c.recorrente ? ' · 🔄 Recorrente' : ''}</div>
                      </div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', color: c.pago ? '#10b981' : vencida ? '#ef4444' : urgente ? '#f59e0b' : 'var(--text-primary)', flexShrink: 0 }}>{fmtMoeda(c.valor)}</div>
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        <button onClick={() => { setEditC(c); setModalC(true) }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.72rem' }}>✎</button>
                        <button onClick={() => { if (confirm('Remover?')) delC(c.id) }} style={{ background: 'none', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '4px 8px', color: '#f87171', cursor: 'pointer', fontSize: '0.72rem' }}>✕</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* PROJEÇÃO ANUAL */}
        {tab === 'projecao' && <ProjecaoAnual contas={contas} />}

        {/* RELATÓRIOS */}
        {tab === 'relatorios' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="card">
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>Receitas vs Despesas — Histórico</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dadosBarra}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`} />
                  <Tooltip formatter={(v: number) => [fmtMoeda(v)]} contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--border-md)', borderRadius: 8 }} />
                  <Bar dataKey="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} /><Bar dataKey="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="card">
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>Despesas por Categoria</div>
                {dadosPizza.length > 0 ? <><ResponsiveContainer width="100%" height={200}>
                  <PieChart><Pie data={dadosPizza} dataKey="value" cx="50%" cy="50%" outerRadius={80}>{dadosPizza.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie>
                    <Tooltip formatter={(v: number) => [fmtMoeda(v)]} contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--border-md)', borderRadius: 8 }} /></PieChart>
                </ResponsiveContainer>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                    {dadosPizza.map((d, i) => (
                      <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} /><span style={{ color: 'var(--text-secondary)' }}>{d.name}</span></div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{fmtMoeda(d.value)}</span>
                      </div>
                    ))}
                  </div></> : <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sem dados</div>}
              </div>
              <div className="card">
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>Resumo do Mês — {MESES[parseInt(filtroMes.slice(5, 7)) - 1]}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[{ l: 'Total Receitas', v: receitaMes, c: '#10b981' }, { l: 'Total Despesas', v: despesaMes, c: '#ef4444' }, { l: 'Saldo', v: saldoMes, c: saldoMes >= 0 ? '#10b981' : '#ef4444' }, { l: 'Gasto na Semana', v: despesaSemana, c: '#f59e0b' }, { l: 'Contas Pendentes', v: contas.filter(c => !c.pago).reduce((a, c) => a + c.valor, 0), c: '#f59e0b' }].map(k => (
                    <div key={k.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{k.l}</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: k.c }}>{fmtMoeda(k.v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {modalT && <FormTransacao initial={editT ?? undefined} onSave={async t => { await saveT(t); setModalT(false); setEditT(null) }} onClose={() => { setModalT(false); setEditT(null) }} />}
      {modalC && <FormContaPagar cats={cats} initial={editC ?? undefined} onSave={async c => { await saveC(c); setModalC(false); setEditC(null) }} onClose={() => { setModalC(false); setEditC(null) }} />}
    </div>
  )
}
