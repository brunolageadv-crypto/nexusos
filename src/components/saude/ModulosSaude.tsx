import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'

// ─── helpers ────────────────────────────────────────────────────────────────
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}
function today() { return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10) }
function newId() { return Math.random().toString(36).slice(2, 10) }

const fieldStyle: React.CSSProperties = {
  background: 'var(--input-bg,var(--surface))', border: '1px solid var(--border-md)',
  borderRadius: 8, padding: '8px 10px', color: 'var(--text-primary)', fontSize: '0.82rem',
  width: '100%', outline: 'none', boxSizing: 'border-box',
}
function Lbl({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>{children}</label>
}

// Card-acordeão (cabeçalho clicável)
function ModuleCard({ id, icon, titulo, desc, open, onToggle, children }: {
  id: string; icon: string; titulo: string; desc: string; open: boolean; onToggle: (id: string) => void; children: React.ReactNode
}) {
  return (
    <div style={{ background: 'var(--card-bg,#1a1b26)', border: '1px solid var(--border-md)', borderRadius: 16, overflow: 'hidden' }}>
      <button onClick={() => onToggle(id)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: '1.5rem' }}>{icon}</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>{titulo}</span>
          <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{desc}</span>
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '1rem', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
      </button>
      {open && <div style={{ padding: '4px 18px 18px', borderTop: '1px solid var(--border-md)' }}>{children}</div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MÓDULO 1 — Mapa de Dor e Intensidade
// ═══════════════════════════════════════════════════════════════════════════
interface PontoDor { id: string; x: number; y: number; intensidade: number; regiao: string; lado: 'frente' | 'costas'; data: string }
function corDor(i: number) {
  // 0 verde → 5 amarelo → 10 vermelho
  if (i <= 5) { const t = i / 5; return `rgb(${Math.round(52 + t * 199)},${Math.round(211 - t * 20)},${Math.round(153 - t * 117)})` }
  const t = (i - 5) / 5; return `rgb(${Math.round(251)},${Math.round(191 - t * 130)},${Math.round(36 - t * 23)})`
}
function regiaoPorY(y: number, x: number): string {
  if (y < 16) return 'Cabeça'
  if (y < 24) return 'Pescoço'
  if (y < 42) return x < 22 || x > 78 ? 'Braço' : 'Tórax'
  if (y < 58) return x < 20 || x > 80 ? 'Antebraço' : 'Abdômen'
  if (y < 70) return x < 22 || x > 78 ? 'Mão' : 'Quadril'
  if (y < 88) return 'Coxa'
  return 'Perna / pé'
}
function MapaDor({ uid }: { uid: string | null }) {
  const [pontos, setPontos] = useState<PontoDor[]>([])
  const [intensidade, setIntensidade] = useState(5)
  const [lado, setLado] = useState<'frente' | 'costas'>('frente')
  useEffect(() => {
    if (!uid) return
    return onSnapshot(doc(db, 'users', uid, 'saudeModulos', 'mapaDor'), snap => {
      setPontos((snap.data()?.pontos as PontoDor[]) || [])
    })
  }, [uid])
  const persist = useCallback(async (lista: PontoDor[]) => {
    setPontos(lista)
    if (uid) await setDoc(doc(db, 'users', uid, 'saudeModulos', 'mapaDor'), { pontos: lista })
  }, [uid])
  const onClickBody = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 200
    persist([...pontos, { id: newId(), x, y, intensidade, regiao: regiaoPorY(y, x), lado, data: today() }])
  }
  const visiveis = pontos.filter(p => p.lado === lado)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,260px) 1fr', gap: 18, alignItems: 'start' }}>
      <div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {(['frente', 'costas'] as const).map(l => (
            <button key={l} onClick={() => setLado(l)}
              style={{ flex: 1, padding: '6px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
                border: `1px solid ${lado === l ? 'var(--accent,#10b981)' : 'var(--border-md)'}`, background: lado === l ? 'var(--accent,#10b981)' : 'transparent', color: lado === l ? '#fff' : 'var(--text-muted)' }}>{l}</button>
          ))}
        </div>
        <svg viewBox="0 0 100 200" onClick={onClickBody}
          style={{ width: '100%', cursor: 'crosshair', background: 'var(--surface,rgba(125,125,125,0.05))', borderRadius: 12, border: '1px solid var(--border-md)' }}>
          <g fill="var(--border-md)" stroke="var(--text-muted)" strokeWidth="0.4" opacity="0.9">
            <circle cx="50" cy="11" r="9" />
            <rect x="45" y="19" width="10" height="5" rx="2" />
            <path d="M35 24 Q50 21 65 24 L70 30 L66 60 Q50 64 34 60 L30 30 Z" />
            <path d="M35 26 L24 30 L18 62 L24 64 L31 36 Z" />
            <path d="M65 26 L76 30 L82 62 L76 64 L69 36 Z" />
            <path d="M36 60 L34 110 L44 112 L49 66 Z" />
            <path d="M64 60 L66 110 L56 112 L51 66 Z" />
            <path d="M44 112 L41 165 L48 166 L50 114 Z" />
            <path d="M56 112 L59 165 L52 166 L50 114 Z" />
          </g>
          {visiveis.map(p => (
            <circle key={p.id} cx={p.x} cy={p.y} r={3 + p.intensidade * 0.45} fill={corDor(p.intensidade)} opacity={0.6}
              stroke={corDor(p.intensidade)} strokeWidth="0.6" />
          ))}
        </svg>
      </div>
      <div>
        <Lbl>Intensidade da dor (0–10)</Lbl>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <input type="range" min={0} max={10} value={intensidade} onChange={e => setIntensidade(Number(e.target.value))} style={{ flex: 1, accentColor: corDor(intensidade) }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.4rem', color: corDor(intensidade), minWidth: 28, textAlign: 'center' }}>{intensidade}</span>
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 14 }}>Ajuste a intensidade e <b>clique no corpo</b> para marcar onde dói.</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Lbl>Pontos registrados ({visiveis.length})</Lbl>
          {pontos.length > 0 && <button onClick={() => persist([])} style={{ fontSize: '0.68rem', color: '#f87171', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700 }}>limpar tudo</button>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
          {visiveis.length === 0 && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Nenhum ponto neste lado.</div>}
          {visiveis.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--surface,rgba(125,125,125,0.05))', border: '1px solid var(--border-md)' }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: corDor(p.intensidade), flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: '0.76rem', color: 'var(--text-primary)' }}>{p.regiao}</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: corDor(p.intensidade) }}>{p.intensidade}/10</span>
              <button onClick={() => persist(pontos.filter(x => x.id !== p.id))} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MÓDULO 2 — Medições Corporais + % de gordura (US Navy)
// ═══════════════════════════════════════════════════════════════════════════
interface Medicao { data: string; sexo: 'M' | 'F'; altura: number; pescoco: number; cintura: number; quadril: number; peito: number; braco: number; coxa: number; criadoEm: number }
function defaultMedicao(): Medicao { return { data: today(), sexo: 'M', altura: 0, pescoco: 0, cintura: 0, quadril: 0, peito: 0, braco: 0, coxa: 0, criadoEm: Date.now() } }
function gorduraCorporal(m: Medicao): number | null {
  const { sexo, altura, pescoco, cintura, quadril } = m
  if (altura <= 0 || pescoco <= 0 || cintura <= 0) return null
  try {
    if (sexo === 'M') {
      const v = 495 / (1.0324 - 0.19077 * Math.log10(cintura - pescoco) + 0.15456 * Math.log10(altura)) - 450
      return isFinite(v) ? Math.round(v * 10) / 10 : null
    } else {
      if (quadril <= 0) return null
      const v = 495 / (1.29579 - 0.35004 * Math.log10(cintura + quadril - pescoco) + 0.22100 * Math.log10(altura)) - 450
      return isFinite(v) ? Math.round(v * 10) / 10 : null
    }
  } catch { return null }
}
function categoriaGordura(bf: number, sexo: 'M' | 'F'): { label: string; cor: string } {
  const faixas = sexo === 'M'
    ? [[6, 'Essencial', '#60a5fa'], [14, 'Atleta', '#34d399'], [18, 'Fitness', '#34d399'], [25, 'Aceitável', '#fbbf24'], [100, 'Acima', '#f87171']]
    : [[14, 'Essencial', '#60a5fa'], [21, 'Atleta', '#34d399'], [25, 'Fitness', '#34d399'], [32, 'Aceitável', '#fbbf24'], [100, 'Acima', '#f87171']]
  for (const [lim, label, cor] of faixas) if (bf <= (lim as number)) return { label: label as string, cor: cor as string }
  return { label: '—', cor: 'var(--text-muted)' }
}
function Medicoes({ uid }: { uid: string | null }) {
  const [hist, setHist] = useState<Medicao[]>([])
  const [m, setM] = useState<Medicao>(defaultMedicao())
  const [salvo, setSalvo] = useState(false)
  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, 'users', uid, 'saudeMedicoes'), snap => {
      const list = snap.docs.map(d => d.data() as Medicao).sort((a, b) => a.data.localeCompare(b.data))
      setHist(list)
      const hoje = list.find(x => x.data === today())
      if (hoje) setM(hoje)
    })
  }, [uid])
  const set = (patch: Partial<Medicao>) => { setM(prev => ({ ...prev, ...patch })); setSalvo(false) }
  const salvar = async () => { if (!uid) return; await setDoc(doc(db, 'users', uid, 'saudeMedicoes', m.data), clean({ ...m })); setSalvo(true) }
  const bf = gorduraCorporal(m)
  const cat = bf != null ? categoriaGordura(bf, m.sexo) : null
  const campos: { k: keyof Medicao; l: string }[] = [
    { k: 'altura', l: 'Altura (cm)' }, { k: 'pescoco', l: 'Pescoço (cm)' }, { k: 'cintura', l: 'Cintura (cm)' },
    { k: 'quadril', l: 'Quadril (cm)' }, { k: 'peito', l: 'Peito (cm)' }, { k: 'braco', l: 'Braço (cm)' }, { k: 'coxa', l: 'Coxa (cm)' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(180px,240px)', gap: 18, alignItems: 'start' }}>
      <div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {(['M', 'F'] as const).map(s => (
            <button key={s} onClick={() => set({ sexo: s })}
              style={{ flex: 1, padding: '7px', borderRadius: 8, fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${m.sexo === s ? 'var(--accent,#10b981)' : 'var(--border-md)'}`, background: m.sexo === s ? 'var(--accent,#10b981)' : 'transparent', color: m.sexo === s ? '#fff' : 'var(--text-muted)' }}>{s === 'M' ? 'Masculino' : 'Feminino'}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10 }}>
          {campos.map(c => (
            <div key={c.k}>
              <Lbl>{c.l}</Lbl>
              <input type="number" inputMode="decimal" value={(m[c.k] as number) || ''} onChange={e => set({ [c.k]: Number(e.target.value) } as Partial<Medicao>)} style={fieldStyle} />
            </div>
          ))}
        </div>
        <button onClick={salvar} style={{ marginTop: 14, padding: '9px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer' }}>
          {salvo ? '✓ Salvo' : '💾 Salvar medições de hoje'}
        </button>
      </div>
      <div style={{ background: 'var(--surface,rgba(125,125,125,0.05))', border: '1px solid var(--border-md)', borderRadius: 14, padding: 16, textAlign: 'center' }}>
        <Lbl>% gordura estimado</Lbl>
        {bf != null && cat ? <>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '2.4rem', color: cat.cor, lineHeight: 1 }}>{bf}%</div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: cat.cor, marginTop: 4 }}>{cat.label}</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.4 }}>Estimativa pelo método US Navy (fita métrica). Não substitui exame clínico.</div>
        </> : <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', padding: '20px 4px' }}>Preencha altura, pescoço, cintura{m.sexo === 'F' ? ' e quadril' : ''} para estimar.</div>}
        {hist.length > 1 && <div style={{ marginTop: 12, fontSize: '0.62rem', color: 'var(--text-muted)' }}>{hist.length} medições registradas</div>}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MÓDULO 3 — Banco de Alimentos local + estimador calórico
// ═══════════════════════════════════════════════════════════════════════════
interface Alimento { nome: string; kcal: number; p: number; c: number; g: number }   // por 100 g
const BANCO_ALIMENTOS: Alimento[] = [
  { nome: 'Arroz branco cozido', kcal: 128, p: 2.5, c: 28, g: 0.2 },
  { nome: 'Arroz integral cozido', kcal: 124, p: 2.6, c: 25.8, g: 1 },
  { nome: 'Feijão carioca cozido', kcal: 76, p: 4.8, c: 13.6, g: 0.5 },
  { nome: 'Feijão preto cozido', kcal: 77, p: 4.5, c: 14, g: 0.5 },
  { nome: 'Peito de frango grelhado', kcal: 165, p: 31, c: 0, g: 3.6 },
  { nome: 'Carne bovina (patinho) grelhada', kcal: 187, p: 32, c: 0, g: 6 },
  { nome: 'Ovo cozido', kcal: 155, p: 13, c: 1.1, g: 11 },
  { nome: 'Ovo frito', kcal: 196, p: 13.6, c: 0.8, g: 15 },
  { nome: 'Pão francês', kcal: 300, p: 8, c: 58, g: 3 },
  { nome: 'Pão de forma integral', kcal: 253, p: 9, c: 43, g: 4 },
  { nome: 'Tapioca (goma)', kcal: 240, p: 0, c: 60, g: 0 },
  { nome: 'Batata cozida', kcal: 86, p: 1.7, c: 20, g: 0.1 },
  { nome: 'Batata-doce cozida', kcal: 77, p: 1.4, c: 18, g: 0.1 },
  { nome: 'Macarrão cozido', kcal: 131, p: 5, c: 25, g: 1.1 },
  { nome: 'Banana', kcal: 89, p: 1.1, c: 23, g: 0.3 },
  { nome: 'Maçã', kcal: 52, p: 0.3, c: 14, g: 0.2 },
  { nome: 'Mamão', kcal: 43, p: 0.5, c: 11, g: 0.3 },
  { nome: 'Aveia em flocos', kcal: 389, p: 17, c: 66, g: 7 },
  { nome: 'Leite integral', kcal: 61, p: 3.2, c: 4.8, g: 3.3 },
  { nome: 'Leite desnatado', kcal: 35, p: 3.4, c: 5, g: 0.1 },
  { nome: 'Iogurte natural', kcal: 61, p: 3.5, c: 4.7, g: 3.3 },
  { nome: 'Queijo minas frescal', kcal: 264, p: 17, c: 3, g: 20 },
  { nome: 'Whey protein (pó)', kcal: 400, p: 80, c: 8, g: 6 },
  { nome: 'Azeite de oliva', kcal: 884, p: 0, c: 0, g: 100 },
  { nome: 'Amendoim', kcal: 567, p: 26, c: 16, g: 49 },
  { nome: 'Pasta de amendoim', kcal: 588, p: 25, c: 20, g: 50 },
  { nome: 'Brócolis cozido', kcal: 35, p: 2.4, c: 7, g: 0.4 },
  { nome: 'Alface', kcal: 15, p: 1.4, c: 2.9, g: 0.2 },
  { nome: 'Tomate', kcal: 18, p: 0.9, c: 3.9, g: 0.2 },
  { nome: 'Salmão grelhado', kcal: 208, p: 20, c: 0, g: 13 },
  { nome: 'Tilápia grelhada', kcal: 129, p: 26, c: 0, g: 2.7 },
  { nome: 'Atum (lata, água)', kcal: 116, p: 26, c: 0, g: 1 },
]
interface ItemRefeicao { id: string; nome: string; gramas: number; kcal: number; p: number; c: number; g: number }
function Alimentos({ uid }: { uid: string | null }) {
  const [busca, setBusca] = useState('')
  const [itens, setItens] = useState<ItemRefeicao[]>([])
  useEffect(() => {
    if (!uid) return
    return onSnapshot(doc(db, 'users', uid, 'saudeAlimentos', today()), snap => {
      setItens((snap.data()?.itens as ItemRefeicao[]) || [])
    })
  }, [uid])
  const persist = useCallback(async (lista: ItemRefeicao[]) => {
    setItens(lista)
    if (uid) await setDoc(doc(db, 'users', uid, 'saudeAlimentos', today()), { itens: lista, data: today() })
  }, [uid])
  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return [] as Alimento[]
    return BANCO_ALIMENTOS.filter(a => a.nome.toLowerCase().includes(q)).slice(0, 8)
  }, [busca])
  const add = (a: Alimento, gramas = 100) => {
    const f = gramas / 100
    persist([...itens, { id: newId(), nome: a.nome, gramas, kcal: Math.round(a.kcal * f), p: +(a.p * f).toFixed(1), c: +(a.c * f).toFixed(1), g: +(a.g * f).toFixed(1) }])
    setBusca('')
  }
  const setGramas = (id: string, gramas: number) => {
    persist(itens.map(it => {
      if (it.id !== id) return it
      const base = BANCO_ALIMENTOS.find(a => a.nome === it.nome); const f = gramas / 100
      return base ? { ...it, gramas, kcal: Math.round(base.kcal * f), p: +(base.p * f).toFixed(1), c: +(base.c * f).toFixed(1), g: +(base.g * f).toFixed(1) } : { ...it, gramas }
    }))
  }
  const tot = itens.reduce((s, it) => ({ kcal: s.kcal + it.kcal, p: s.p + it.p, c: s.c + it.c, g: s.g + it.g }), { kcal: 0, p: 0, c: 0, g: 0 })
  const macroKcal = tot.p * 4 + tot.c * 4 + tot.g * 9 || 1
  const macros = [
    { l: 'Proteína', v: tot.p, kcal: tot.p * 4, cor: '#60a5fa' },
    { l: 'Carbo', v: tot.c, kcal: tot.c * 4, cor: '#fbbf24' },
    { l: 'Gordura', v: tot.g, kcal: tot.g * 9, cor: '#f87171' },
  ]
  return (
    <div>
      <Lbl>Buscar alimento (base local)</Lbl>
      <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="ex.: arroz, frango, banana…" style={fieldStyle} />
      {resultados.length > 0 && (
        <div style={{ marginTop: 6, border: '1px solid var(--border-md)', borderRadius: 10, overflow: 'hidden' }}>
          {resultados.map(a => (
            <button key={a.nome} onClick={() => add(a)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--border-md)', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>{a.nome}</span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{a.kcal} kcal/100g · +</span>
            </button>
          ))}
        </div>
      )}
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {itens.length === 0 && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Nenhum item no log de hoje. Busque acima e clique para adicionar.</div>}
        {itens.map(it => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'var(--surface,rgba(125,125,125,0.05))', border: '1px solid var(--border-md)' }}>
            <span style={{ flex: 1, fontSize: '0.78rem', color: 'var(--text-primary)' }}>{it.nome}</span>
            <input type="number" value={it.gramas} onChange={e => setGramas(it.id, Number(e.target.value))} style={{ ...fieldStyle, width: 64, padding: '4px 6px', fontSize: '0.72rem' }} />
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>g</span>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', minWidth: 60, textAlign: 'right' }}>{it.kcal} kcal</span>
            <button onClick={() => persist(itens.filter(x => x.id !== it.id))} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem' }}>×</button>
          </div>
        ))}
      </div>
      {itens.length > 0 && (
        <div style={{ marginTop: 16, background: 'var(--surface,rgba(125,125,125,0.05))', border: '1px solid var(--border-md)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total do dia</span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.6rem', color: '#10b981' }}>{tot.kcal} kcal</span>
          </div>
          <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
            {macros.map(mc => <div key={mc.l} style={{ width: `${(mc.kcal / macroKcal) * 100}%`, background: mc.cor }} />)}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {macros.map(mc => (
              <div key={mc.l} style={{ fontSize: '0.72rem' }}>
                <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: mc.cor, marginRight: 5 }} />
                <span style={{ color: 'var(--text-muted)' }}>{mc.l}: </span>
                <b style={{ color: 'var(--text-primary)' }}>{Math.round(mc.v)}g</b>
                <span style={{ color: 'var(--text-muted)' }}> ({Math.round((mc.kcal / macroKcal) * 100)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── helpers extras (lotes 1 e 3) ────────────────────────────────────────────
function addMonths(d: string, m: number): string {
  const dt = new Date(d + 'T00:00:00'); dt.setMonth(dt.getMonth() + m)
  return dt.toISOString().slice(0, 10)
}
function diasAte(d: string): number {
  const a = new Date(today() + 'T00:00:00').getTime(), b = new Date(d + 'T00:00:00').getTime()
  return Math.round((b - a) / 86400000)
}
function Spark({ valores, cor, alto, baixo }: { valores: number[]; cor: string; alto?: number; baixo?: number }) {
  if (valores.length < 2) return <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>poucos dados para tendência</div>
  const W = 240, H = 46, P = 4
  const max = Math.max(...valores, alto ?? -Infinity), min = Math.min(...valores, baixo ?? Infinity), r = max - min || 1
  const pts = valores.map((v, i) => `${P + (i / (valores.length - 1)) * (W - P * 2)},${H - P - ((v - min) / r) * (H - P * 2)}`).join(' ')
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {alto != null && <line x1={P} x2={W - P} y1={H - P - ((alto - min) / r) * (H - P * 2)} y2={H - P - ((alto - min) / r) * (H - P * 2)} stroke="#f87171" strokeWidth={1} strokeDasharray="3,3" opacity={0.6} />}
      <polyline points={pts} fill="none" stroke={cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
function addBtn(): React.CSSProperties { return { padding: '9px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer' } }
function badge(texto: string, cor: string): React.ReactNode { return <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#fff', background: cor, borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap' }}>{texto}</span> }

// ═══ MÓDULO — Inventário de Medicamentos ═══════════════════════════════════════
interface Medicamento { id: string; nome: string; dosagem: string; estoque: number; porDia: number; validade: string }
function Medicamentos({ uid }: { uid: string | null }) {
  const [itens, setItens] = useState<Medicamento[]>([])
  const [form, setForm] = useState<Medicamento>({ id: '', nome: '', dosagem: '', estoque: 0, porDia: 0, validade: '' })
  useEffect(() => { if (!uid) return; return onSnapshot(doc(db, 'users', uid, 'saudeModulos', 'medicamentos'), s => setItens((s.data()?.itens as Medicamento[]) || [])) }, [uid])
  const persist = async (lista: Medicamento[]) => { setItens(lista); if (uid) await setDoc(doc(db, 'users', uid, 'saudeModulos', 'medicamentos'), { itens: lista }) }
  const add = () => { if (!form.nome.trim()) return; persist([...itens, { ...form, id: newId() }]); setForm({ id: '', nome: '', dosagem: '', estoque: 0, porDia: 0, validade: '' }) }
  const statusOf = (m: Medicamento): React.ReactNode[] => {
    const out: React.ReactNode[] = []
    if (m.validade) { const d = diasAte(m.validade); if (d < 0) out.push(badge('VENCIDO', '#dc2626')); else if (d <= 30) out.push(badge(`vence em ${d}d`, '#f59e0b')) }
    const dias = m.porDia > 0 ? Math.floor(m.estoque / m.porDia) : (m.estoque <= 3 ? 0 : 99)
    if (dias <= 0) out.push(badge('SEM ESTOQUE', '#dc2626')); else if (dias < 7) out.push(badge(`repor (${dias}d)`, '#f59e0b'))
    return out
  }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.8fr 0.8fr 1fr auto', gap: 8, alignItems: 'end' }}>
        <div><Lbl>Medicamento</Lbl><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} style={fieldStyle} /></div>
        <div><Lbl>Dosagem</Lbl><input value={form.dosagem} onChange={e => setForm({ ...form, dosagem: e.target.value })} placeholder="500mg" style={fieldStyle} /></div>
        <div><Lbl>Estoque</Lbl><input type="number" value={form.estoque || ''} onChange={e => setForm({ ...form, estoque: Number(e.target.value) })} style={fieldStyle} /></div>
        <div><Lbl>/dia</Lbl><input type="number" value={form.porDia || ''} onChange={e => setForm({ ...form, porDia: Number(e.target.value) })} style={fieldStyle} /></div>
        <div><Lbl>Validade</Lbl><input type="date" value={form.validade} onChange={e => setForm({ ...form, validade: e.target.value })} style={fieldStyle} /></div>
        <button onClick={add} style={addBtn()}>＋</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
        {itens.length === 0 && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Nenhum medicamento cadastrado.</div>}
        {itens.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'var(--surface,rgba(125,125,125,0.05))', border: '1px solid var(--border-md)' }}>
            <span style={{ fontSize: '1.1rem' }}>💊</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{m.nome}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 8 }}>{m.dosagem} · {m.estoque} un{m.porDia > 0 ? ` · ${m.porDia}/dia` : ''}{m.validade ? ` · val. ${m.validade.split('-').reverse().join('/')}` : ''}</span>
            </span>
            <span style={{ display: 'flex', gap: 5 }}>{statusOf(m)}</span>
            <button onClick={() => persist(itens.filter(x => x.id !== m.id))} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.95rem' }}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══ MÓDULO — Sinais Vitais (PA + FC) ══════════════════════════════════════════
interface Vital { id: string; data: string; sis: number; dia: number; fc: number }
function corPA(sis: number, dia: number) { if (sis >= 140 || dia >= 90) return '#dc2626'; if (sis >= 130 || dia >= 80) return '#f59e0b'; if (sis >= 120) return '#fbbf24'; return '#10b981' }
function corFC(fc: number) { return fc >= 60 && fc <= 100 ? '#10b981' : '#dc2626' }
function SinaisVitais({ uid }: { uid: string | null }) {
  const [regs, setRegs] = useState<Vital[]>([])
  const [f, setF] = useState({ sis: 0, dia: 0, fc: 0 })
  useEffect(() => { if (!uid) return; return onSnapshot(doc(db, 'users', uid, 'saudeModulos', 'sinaisVitais'), s => setRegs(((s.data()?.registros as Vital[]) || []).sort((a, b) => a.data.localeCompare(b.data)))) }, [uid])
  const persist = async (lista: Vital[]) => { setRegs(lista); if (uid) await setDoc(doc(db, 'users', uid, 'saudeModulos', 'sinaisVitais'), { registros: lista }) }
  const add = () => { if (!f.sis && !f.fc) return; persist([...regs, { id: newId(), data: new Date(Date.now() - 3 * 3600000).toISOString(), sis: f.sis, dia: f.dia, fc: f.fc }]); setF({ sis: 0, dia: 0, fc: 0 }) }
  const ult = regs[regs.length - 1]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <div><Lbl>Sistólica</Lbl><input type="number" value={f.sis || ''} onChange={e => setF({ ...f, sis: Number(e.target.value) })} placeholder="120" style={fieldStyle} /></div>
          <div><Lbl>Diastólica</Lbl><input type="number" value={f.dia || ''} onChange={e => setF({ ...f, dia: Number(e.target.value) })} placeholder="80" style={fieldStyle} /></div>
          <div><Lbl>FC (bpm)</Lbl><input type="number" value={f.fc || ''} onChange={e => setF({ ...f, fc: Number(e.target.value) })} placeholder="72" style={fieldStyle} /></div>
          <button onClick={add} style={addBtn()}>＋</button>
        </div>
        {regs.length > 0 && <div style={{ marginTop: 14 }}>
          <Lbl>Tendência da pressão (sistólica)</Lbl>
          <Spark valores={regs.slice(-14).map(r => r.sis)} cor="#60a5fa" alto={130} />
        </div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 12, maxHeight: 150, overflowY: 'auto' }}>
          {regs.slice().reverse().slice(0, 8).map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 70 }}>{r.data.slice(8, 10)}/{r.data.slice(5, 7)} {r.data.slice(11, 16)}</span>
              <span style={{ color: corPA(r.sis, r.dia), fontWeight: 700 }}>{r.sis}/{r.dia}</span>
              <span style={{ color: corFC(r.fc) }}>♥ {r.fc}</span>
              <button onClick={() => persist(regs.filter(x => x.id !== r.id))} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: 'var(--surface,rgba(125,125,125,0.05))', border: '1px solid var(--border-md)', borderRadius: 14, padding: 16, textAlign: 'center' }}>
        <Lbl>Última aferição</Lbl>
        {ult ? <>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '2rem', color: corPA(ult.sis, ult.dia), lineHeight: 1 }}>{ult.sis}/{ult.dia}</div>
          <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 2 }}>mmHg</div>
          <div style={{ marginTop: 10, fontSize: '1.1rem', fontWeight: 800, color: corFC(ult.fc) }}>♥ {ult.fc} bpm</div>
          <div style={{ marginTop: 10, fontSize: '0.62rem', color: corPA(ult.sis, ult.dia), fontWeight: 700 }}>
            {ult.sis >= 140 || ult.dia >= 90 ? 'Pressão alta — atenção' : ult.sis >= 130 || ult.dia >= 80 ? 'Pressão elevada' : 'Pressão normal'}
          </div>
        </> : <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', padding: '24px 0' }}>Registre sua primeira aferição.</div>}
      </div>
    </div>
  )
}

// ═══ MÓDULO — Vacinação ════════════════════════════════════════════════════════
interface Vacina { id: string; nome: string; data: string; reforcoMeses: number }
function Vacinas({ uid }: { uid: string | null }) {
  const [itens, setItens] = useState<Vacina[]>([])
  const [f, setF] = useState<Vacina>({ id: '', nome: '', data: today(), reforcoMeses: 0 })
  useEffect(() => { if (!uid) return; return onSnapshot(doc(db, 'users', uid, 'saudeModulos', 'vacinas'), s => setItens(((s.data()?.itens as Vacina[]) || []).sort((a, b) => b.data.localeCompare(a.data)))) }, [uid])
  const persist = async (lista: Vacina[]) => { setItens(lista); if (uid) await setDoc(doc(db, 'users', uid, 'saudeModulos', 'vacinas'), { itens: lista }) }
  const add = () => { if (!f.nome.trim()) return; persist([...itens, { ...f, id: newId() }]); setF({ id: '', nome: '', data: today(), reforcoMeses: 0 }) }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr auto', gap: 8, alignItems: 'end' }}>
        <div><Lbl>Vacina</Lbl><input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="ex.: Influenza" style={fieldStyle} /></div>
        <div><Lbl>Data</Lbl><input type="date" value={f.data} onChange={e => setF({ ...f, data: e.target.value })} style={fieldStyle} /></div>
        <div><Lbl>Reforço (meses)</Lbl><input type="number" value={f.reforcoMeses || ''} onChange={e => setF({ ...f, reforcoMeses: Number(e.target.value) })} placeholder="0 = dose única" style={fieldStyle} /></div>
        <button onClick={add} style={addBtn()}>＋</button>
      </div>
      <div style={{ marginTop: 16, position: 'relative', paddingLeft: 18 }}>
        <div style={{ position: 'absolute', left: 5, top: 4, bottom: 4, width: 2, background: 'var(--border-md)' }} />
        {itens.length === 0 && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Nenhuma vacina registrada.</div>}
        {itens.map(v => {
          const prox = v.reforcoMeses > 0 ? addMonths(v.data, v.reforcoMeses) : ''
          const d = prox ? diasAte(prox) : 99
          const cor = !prox ? '#10b981' : d < 0 ? '#dc2626' : d <= 60 ? '#f59e0b' : '#10b981'
          return (
            <div key={v.id} style={{ position: 'relative', marginBottom: 10 }}>
              <span style={{ position: 'absolute', left: -17, top: 6, width: 10, height: 10, borderRadius: '50%', background: cor, border: '2px solid var(--card-bg,#1a1b26)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'var(--surface,rgba(125,125,125,0.05))', border: '1px solid var(--border-md)' }}>
                <span style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{v.nome}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 8 }}>tomada em {v.data.split('-').reverse().join('/')}</span>
                </span>
                {prox ? badge(d < 0 ? `reforço atrasado` : `reforço ${prox.split('-').reverse().join('/')}`, cor) : badge('dose única', cor)}
                <button onClick={() => persist(itens.filter(x => x.id !== v.id))} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.95rem' }}>×</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══ MÓDULO — Hidratação Inteligente ═══════════════════════════════════════════
function Hidratacao({ uid }: { uid: string | null }) {
  const [dias, setDias] = useState<{ data: string; agua: number; meta: number }[]>([])
  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, 'users', uid, 'saude'), snap => {
      const list = snap.docs.map(d => { const x = d.data() as { data: string; agua?: number; metaAgua?: number }; return { data: x.data, agua: x.agua || 0, meta: x.metaAgua || 2000 } })
        .filter(x => x.agua > 0).sort((a, b) => a.data.localeCompare(b.data))
      setDias(list)
    })
  }, [uid])
  const ultimos = dias.slice(-14)
  const media = ultimos.length ? Math.round(ultimos.reduce((s, d) => s + d.agua, 0) / ultimos.length) : 0
  const meta = dias.length ? dias[dias.length - 1].meta : 2000
  const sugestao = media < meta * 0.8 ? Math.max(1500, Math.round(media / 100) * 100)
    : media > meta * 1.15 ? Math.round(media / 100) * 100 : null
  const max = Math.max(meta, ...ultimos.map(d => d.agua), 1)
  return (
    <div>
      {ultimos.length === 0
        ? <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Registre água na Visão Geral por alguns dias para a análise inteligente aparecer.</div>
        : <>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 14 }}>
            <div><Lbl>Média (14 dias)</Lbl><div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.5rem', color: '#60a5fa' }}>{media} ml</div></div>
            <div><Lbl>Meta atual</Lbl><div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.5rem', color: 'var(--text-secondary)' }}>{meta} ml</div></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 70, marginBottom: 6 }}>
            {ultimos.map(d => (
              <div key={d.data} title={`${d.data.split('-').reverse().join('/')}: ${d.agua}ml`} style={{ flex: 1, background: d.agua >= meta ? '#10b981' : '#60a5fa', height: `${(d.agua / max) * 100}%`, borderRadius: '3px 3px 0 0', minHeight: 2, opacity: 0.85 }} />
            ))}
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: 12 }}>consumo dos últimos {ultimos.length} dias (verde = bateu a meta)</div>
          {sugestao ? (
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.4)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              💡 Sua média ({media}ml) está {media < meta ? 'abaixo' : 'acima'} da meta ({meta}ml). Considere {media < meta ? 'reduzir a meta para algo mais realista' : 'aumentar a meta'}: <b style={{ color: '#60a5fa' }}>~{sugestao}ml/dia</b>. Ajuste a meta na Visão Geral (card Água).
            </div>
          ) : (
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              ✅ Seu consumo está alinhado com a meta. Continue assim!
            </div>
          )}
        </>}
    </div>
  )
}

// ═══ MÓDULO — Jornal de Mindfulness & Humor ════════════════════════════════════
interface Entrada { id: string; data: string; texto: string; humor: number; tags: string[] }
const MOODS = ['😞', '😕', '😐', '🙂', '😄']
const TAGS_SUGERIDAS = ['ansioso', 'cansado', 'estressado', 'feliz', 'dor de cabeça', 'insônia', 'motivado', 'irritado', 'calmo', 'produtivo']
function Jornal({ uid }: { uid: string | null }) {
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [texto, setTexto] = useState('')
  const [humor, setHumor] = useState(2)
  const [tags, setTags] = useState<string[]>([])
  const [tagLivre, setTagLivre] = useState('')
  useEffect(() => { if (!uid) return; return onSnapshot(doc(db, 'users', uid, 'saudeModulos', 'jornal'), s => setEntradas(((s.data()?.entradas as Entrada[]) || []).sort((a, b) => b.data.localeCompare(a.data)))) }, [uid])
  const persist = async (lista: Entrada[]) => { setEntradas(lista); if (uid) await setDoc(doc(db, 'users', uid, 'saudeModulos', 'jornal'), { entradas: lista }) }
  const salvar = () => { if (!texto.trim() && tags.length === 0) return; persist([{ id: newId(), data: new Date(Date.now() - 3 * 3600000).toISOString(), texto: texto.trim(), humor, tags }, ...entradas]); setTexto(''); setTags([]); setHumor(2) }
  const toggleTag = (t: string) => setTags(s => s.includes(t) ? s.filter(x => x !== t) : [...s, t])
  // nuvem + correlação humor × tag
  const freq = useMemo(() => { const m = new Map<string, { n: number; soma: number }>(); for (const e of entradas) for (const t of e.tags) { const c = m.get(t) || { n: 0, soma: 0 }; c.n++; c.soma += e.humor; m.set(t, c) } return m }, [entradas])
  const nuvem = [...freq.entries()].sort((a, b) => b[1].n - a[1].n)
  const maxN = Math.max(1, ...nuvem.map(([, c]) => c.n))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(200px,300px)', gap: 18, alignItems: 'start' }}>
      <div>
        <Lbl>Como você está hoje?</Lbl>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {MOODS.map((mo, i) => <button key={i} onClick={() => setHumor(i)} style={{ fontSize: '1.5rem', padding: '4px 8px', borderRadius: 10, cursor: 'pointer', border: `2px solid ${humor === i ? 'var(--accent,#10b981)' : 'transparent'}`, background: humor === i ? 'var(--surface,rgba(125,125,125,0.08))' : 'transparent', opacity: humor === i ? 1 : 0.55 }}>{mo}</button>)}
        </div>
        <textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escreva o que sentiu, pensou, o que aconteceu…" rows={4} style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0' }}>
          {TAGS_SUGERIDAS.map(t => <button key={t} onClick={() => toggleTag(t)} style={{ padding: '4px 10px', borderRadius: 16, fontSize: '0.7rem', cursor: 'pointer', border: `1px solid ${tags.includes(t) ? 'var(--accent,#10b981)' : 'var(--border-md)'}`, background: tags.includes(t) ? 'var(--accent,#10b981)' : 'transparent', color: tags.includes(t) ? '#fff' : 'var(--text-muted)' }}>{t}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={tagLivre} onChange={e => setTagLivre(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && tagLivre.trim()) { toggleTag(tagLivre.trim().toLowerCase()); setTagLivre('') } }} placeholder="+ tag livre (Enter)" style={fieldStyle} />
          <button onClick={salvar} style={addBtn()}>Salvar</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14, maxHeight: 220, overflowY: 'auto' }}>
          {entradas.slice(0, 12).map(e => (
            <div key={e.id} style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--surface,rgba(125,125,125,0.05))', border: '1px solid var(--border-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.7rem', color: 'var(--text-muted)' }}><span style={{ fontSize: '1rem' }}>{MOODS[e.humor]}</span><span>{e.data.slice(8, 10)}/{e.data.slice(5, 7)}</span><span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>{e.tags.map(t => <span key={t} style={{ color: 'var(--accent,#10b981)' }}>#{t}</span>)}</span><button onClick={() => persist(entradas.filter(x => x.id !== e.id))} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button></div>
              {e.texto && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>{e.texto}</div>}
            </div>
          ))}
        </div>
      </div>
      <div>
        <Lbl>Nuvem de sentimento</Lbl>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: 12, borderRadius: 12, background: 'var(--surface,rgba(125,125,125,0.05))', border: '1px solid var(--border-md)', minHeight: 60 }}>
          {nuvem.length === 0 ? <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>As tags aparecem aqui conforme você registra.</span>
            : nuvem.map(([t, c]) => { const m = c.soma / c.n; const cor = m < 1.5 ? '#f87171' : m < 2.5 ? '#fbbf24' : '#34d399'; return <span key={t} title={`humor médio ${m.toFixed(1)}/4`} style={{ fontSize: `${0.72 + (c.n / maxN) * 0.9}rem`, fontWeight: 700, color: cor }}>{t}</span> })}
        </div>
        {nuvem.length > 0 && <>
          <Lbl>Correlação humor × sintoma</Lbl>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {nuvem.slice(0, 6).map(([t, c]) => { const m = c.soma / c.n; const cor = m < 1.5 ? '#f87171' : m < 2.5 ? '#fbbf24' : '#34d399'; return (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.74rem' }}>
                <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{t} <span style={{ color: 'var(--text-muted)' }}>({c.n}×)</span></span>
                <span style={{ color: cor, fontWeight: 700 }}>{MOODS[Math.round(m)]} {m.toFixed(1)}</span>
              </div>
            ) })}
          </div>
        </>}
      </div>
    </div>
  )
}

// ═══ MÓDULO — Alertas Vitais Recorrentes ═══════════════════════════════════════
interface Alerta { id: string; titulo: string; hora: string; dias: number[]; ativo: boolean }
const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
function Alertas({ uid }: { uid: string | null }) {
  const [itens, setItens] = useState<Alerta[]>([])
  const [f, setF] = useState<Alerta>({ id: '', titulo: '', hora: '08:00', dias: [1, 2, 3, 4, 5], ativo: true })
  useEffect(() => { if (!uid) return; return onSnapshot(doc(db, 'users', uid, 'saudeModulos', 'alertas'), s => setItens((s.data()?.itens as Alerta[]) || [])) }, [uid])
  const persist = async (lista: Alerta[]) => { setItens(lista); if (uid) await setDoc(doc(db, 'users', uid, 'saudeModulos', 'alertas'), { itens: lista }) }
  const add = () => { if (!f.titulo.trim()) return; persist([...itens, { ...f, id: newId() }]); setF({ id: '', titulo: '', hora: '08:00', dias: [1, 2, 3, 4, 5], ativo: true }) }
  const itensRef = useRef(itens); useEffect(() => { itensRef.current = itens }, [itens])
  // notificador best-effort (só enquanto o app estiver aberto)
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
    const fired = new Set<string>()
    const tick = () => {
      const now = new Date(Date.now() - 3 * 3600000)
      const hhmm = now.toISOString().slice(11, 16), dow = now.getUTCDay()
      const key = now.toISOString().slice(0, 16)
      for (const a of itensRef.current) {
        if (a.ativo && a.hora === hhmm && a.dias.includes(dow) && !fired.has(a.id + key)) {
          fired.add(a.id + key)
          if ('Notification' in window && Notification.permission === 'granted') new Notification('🔔 NEXUS Saúde', { body: a.titulo })
          else alert('🔔 Lembrete: ' + a.titulo)
        }
      }
    }
    const iv = setInterval(tick, 20000); return () => clearInterval(iv)
  }, [])
  const toggleDia = (d: number) => setF(s => ({ ...s, dias: s.dias.includes(d) ? s.dias.filter(x => x !== d) : [...s.dias, d] }))
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr auto', gap: 8, alignItems: 'end' }}>
        <div><Lbl>Lembrete</Lbl><input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="ex.: Aferir pressão" style={fieldStyle} /></div>
        <div><Lbl>Hora</Lbl><input type="time" value={f.hora} onChange={e => setF({ ...f, hora: e.target.value })} style={fieldStyle} /></div>
        <button onClick={add} style={addBtn()}>＋</button>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        {DIAS_SEMANA.map((d, i) => <button key={i} onClick={() => toggleDia(i)} style={{ width: 30, height: 30, borderRadius: 8, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', border: `1px solid ${f.dias.includes(i) ? 'var(--accent,#10b981)' : 'var(--border-md)'}`, background: f.dias.includes(i) ? 'var(--accent,#10b981)' : 'transparent', color: f.dias.includes(i) ? '#fff' : 'var(--text-muted)' }}>{d}</button>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
        {itens.length === 0 && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Nenhum lembrete configurado.</div>}
        {itens.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'var(--surface,rgba(125,125,125,0.05))', border: '1px solid var(--border-md)', opacity: a.ativo ? 1 : 0.5 }}>
            <span style={{ fontSize: '1.1rem' }}>⏰</span>
            <span style={{ flex: 1 }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{a.titulo}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 8 }}>{a.hora} · {a.dias.map(d => DIAS_SEMANA[d]).join('')}</span>
            </span>
            <button onClick={() => persist(itens.map(x => x.id === a.id ? { ...x, ativo: !x.ativo } : x))} style={{ fontSize: '0.66rem', fontWeight: 700, color: a.ativo ? '#10b981' : 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border-md)', borderRadius: 8, padding: '3px 9px', cursor: 'pointer' }}>{a.ativo ? 'ativo' : 'pausado'}</button>
            <button onClick={() => persist(itens.filter(x => x.id !== a.id))} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.95rem' }}>×</button>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 10 }}>Os lembretes tocam enquanto o NEXUS estiver aberto no navegador (notificação local).</div>
    </div>
  )
}

function SecHead({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 8 }}>{children}</div>
}

// ═══════════════════════════════════════════════════════════════════════════
export default function ModulosSaude() {
  const uid = useUid()
  const [open, setOpen] = useState<Record<string, boolean>>({ dor: true })
  const toggle = (id: string) => setOpen(o => ({ ...o, [id]: !o[id] }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1100 }}>
      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Módulos da Saúde — dados salvos no seu NEXUS (Firestore). Clique para expandir cada um.
      </div>

      <SecHead>🩺 Clínico</SecHead>
      <ModuleCard id="medicamentos" icon="💊" titulo="Inventário de Medicamentos" desc="Estoque, doses por dia e alertas de validade/reposição." open={!!open.medicamentos} onToggle={toggle}><Medicamentos uid={uid} /></ModuleCard>
      <ModuleCard id="vitais" icon="🩸" titulo="Sinais Vitais (Pressão & FC)" desc="Registro de PA e frequência cardíaca com faixas e tendência." open={!!open.vitais} onToggle={toggle}><SinaisVitais uid={uid} /></ModuleCard>
      <ModuleCard id="vacinas" icon="💉" titulo="Vacinação & Reforços" desc="Linha do tempo de vacinas com lembrete de reforço." open={!!open.vacinas} onToggle={toggle}><Vacinas uid={uid} /></ModuleCard>

      <SecHead>🏃 Corpo &amp; métricas</SecHead>
      <ModuleCard id="dor" icon="🧍" titulo="Mapa de Dor e Intensidade" desc="Clique no corpo para registrar onde dói e a intensidade (0–10)." open={!!open.dor} onToggle={toggle}><MapaDor uid={uid} /></ModuleCard>
      <ModuleCard id="medicoes" icon="📏" titulo="Medições Corporais & % de Gordura" desc="Fita métrica + estimativa de gordura corporal (US Navy)." open={!!open.medicoes} onToggle={toggle}><Medicoes uid={uid} /></ModuleCard>
      <ModuleCard id="alimentos" icon="🍽️" titulo="Alimentos & Estimador Calórico" desc="Base local de alimentos, log do dia e resumo de macronutrientes." open={!!open.alimentos} onToggle={toggle}><Alimentos uid={uid} /></ModuleCard>

      <SecHead>🧠 Comportamento &amp; alertas</SecHead>
      <ModuleCard id="hidratacao" icon="💧" titulo="Hidratação Inteligente" desc="Analisa seu histórico de água e sugere ajuste da meta." open={!!open.hidratacao} onToggle={toggle}><Hidratacao uid={uid} /></ModuleCard>
      <ModuleCard id="jornal" icon="📓" titulo="Jornal de Mindfulness & Humor" desc="Journaling com humor, tags e nuvem de sentimento (humor × sintoma)." open={!!open.jornal} onToggle={toggle}><Jornal uid={uid} /></ModuleCard>
      <ModuleCard id="alertas" icon="⏰" titulo="Alertas Vitais Recorrentes" desc="Agende lembretes locais (ex.: aferir pressão às 10h)." open={!!open.alertas} onToggle={toggle}><Alertas uid={uid} /></ModuleCard>
    </div>
  )
}
