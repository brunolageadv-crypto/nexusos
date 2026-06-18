import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, PieChart, Pie, Cell, ReferenceLine } from 'recharts'

/* ═══ Types ══════════════════════════════════════════════════ */
type TipoRegistro = 'trabalho' | 'falta' | 'ferias' | 'atestado' | 'folga' | 'homeoffice' | 'viagem'

interface Registro {
  id: string
  data: string
  tipo: TipoRegistro
  entrada: string
  saida: string
  minutos: number
  observacao: string
}

/* ═══ Constants ══════════════════════════════════════════════ */
// Getter seguro para tipo desconhecido
const TIPO_FALLBACK = { label: 'Trabalho', icon: '⊙', color: '#00e5ff', bg: 'rgba(0,229,255,0.1)' }
function getTipo(tipo: string) { return TIPOS[tipo as TipoRegistro] ?? TIPO_FALLBACK }

const TIPOS: Record<TipoRegistro, { label: string; icon: string; color: string; bg: string }> = {
  trabalho:   { label: 'Trabalho',    icon: '⊙',  color: '#00e5ff', bg: 'rgba(0,229,255,0.1)' },
  homeoffice: { label: 'Home Office', icon: '⌂',  color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  viagem:     { label: 'Viagem',      icon: '✈',  color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  ferias:     { label: 'Férias',      icon: '☀',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  folga:      { label: 'Folga',       icon: '◎',  color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  atestado:   { label: 'Atestado',    icon: '✚',  color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  falta:      { label: 'Falta',       icon: '✗',  color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
}
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
// COLORS_PIE removido

/* ═══ Helpers ════════════════════════════════════════════════ */
function todayISO() { return new Date(Date.now()-3*3600000).toISOString().slice(0,10) }
function fmtDate(d: string) { if(!d)return''; const[y,m,dy]=d.split('-'); return `${dy}/${m}/${y}` }
function fmtWeekDay(d: string) { return new Date(d+'T12:00').toLocaleDateString('pt-BR',{weekday:'short'}) }
function fmtHM(min: number) { if(!min)return'—'; const h=Math.floor(min/60),m=min%60; return `${h}h${m>0?` ${m}m`:''}` }
function calcMin(e: string, s: string) { if(!e||!s)return 0; const[eh,em]=e.split(':').map(Number); const[sh,sm]=s.split(':').map(Number); return Math.max(0,(sh*60+sm)-(eh*60+em)) }
function weekOf(iso: string) { const d=new Date(iso+'T12:00'); const day=d.getDay(); const diff=d.getDate()-day+(day===0?-6:1); const mon=new Date(d); mon.setDate(diff); return mon.toISOString().slice(0,10) }
function newId() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6) }

const META_DIA = 480 // 8 horas em minutos
const META_SEMANA = 2400 // 40 horas em minutos
const TIPOS_COMPUTA_HORA: TipoRegistro[] = ['trabalho','homeoffice','viagem']

function fmtSaldo(min: number): string { const h=Math.floor(min/60),m=min%60; return `${h}h${m>0?` ${m}m`:''}` }

const inp: React.CSSProperties = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text-primary)', fontFamily:'var(--font-body)', fontSize:'0.88rem', padding:'8px 12px', width:'100%' }

/* ═══ Hook ═══════════════════════════════════════════════════ */
function usePonto() {
  const [registros, setRegistros] = useState<Registro[]>([])
  const [loading, setLoading] = useState(true)
  const uid = useUid()

  useEffect(() => {
    if(!uid||!db){ setLoading(false); return }
    const q = query(collection(db,`users/${uid}/ponto`), orderBy('data','desc'))
    return onSnapshot(q, snap => { setRegistros(snap.docs.map(d=>d.data() as Registro)); setLoading(false) })
  },[uid])

  const save = useCallback(async(r: Registro) => {
    if(uid&&db) await setDoc(doc(db,`users/${uid}/ponto`,r.id),r)
    else setRegistros(p=>[r,...p.filter(x=>x.id!==r.id)].sort((a,b)=>b.data.localeCompare(a.data)))
  },[uid])

  const remove = useCallback(async(id: string) => {
    if(uid&&db) await deleteDoc(doc(db,`users/${uid}/ponto`,id))
    else setRegistros(p=>p.filter(x=>x.id!==id))
  },[uid])

  return { registros, loading, save, remove }
}

/* ═══ FormRegistro ═══════════════════════════════════════════ */
function FormRegistro({ initial, onSave, onClose }: { initial?: Partial<Registro>; onSave:(r:Registro)=>void; onClose:()=>void }) {
  const [form, setForm] = useState({
    data: initial?.data ?? todayISO(),
    tipo: (initial?.tipo ?? 'trabalho') as TipoRegistro,
    entrada: initial?.entrada ?? '',
    saida: initial?.saida ?? '',
    observacao: initial?.observacao ?? '',
  })
  const precisaHoras = ['trabalho','homeoffice','viagem'].includes(form.tipo)

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--bg-2)', border:'1px solid var(--border-md)', borderRadius:16, width:'100%', maxWidth:480, boxShadow:'0 32px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'0.95rem', color:'var(--text-accent)' }}>
            {initial?.id ? 'Editar Registro' : 'Novo Registro'}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:'1.3rem', cursor:'pointer' }}>×</button>
        </div>
        <div style={{ padding:'18px 22px' }}>
          {/* Data */}
          <div style={{ marginBottom:12 }}>
            <label style={{ display:'block', fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:5, fontFamily:'var(--font-mono)' }}>Data</label>
            <input type="date" style={inp} value={form.data} onChange={e=>setForm(p=>({...p,data:e.target.value}))}/>
          </div>

          {/* Tipo */}
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8, fontFamily:'var(--font-mono)' }}>Tipo</label>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:7 }}>
              {(Object.keys(TIPOS) as TipoRegistro[]).map(t => {
                const tp = TIPOS[t]
                const active = form.tipo === t
                return (
                  <button key={t} type="button" onClick={()=>setForm(p=>({...p,tipo:t}))} style={{
                    padding:'10px 6px', borderRadius:9, border:`1px solid ${active?tp.color:'var(--border)'}`,
                    background: active ? tp.bg : 'none',
                    color: active ? tp.color : 'var(--text-muted)',
                    cursor:'pointer', transition:'all 0.15s',
                    display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                  }}>
                    <span style={{ fontSize:'1.1rem' }}>{tp.icon}</span>
                    <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.65rem' }}>{tp.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Horários */}
          {precisaHoras && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              <div>
                <label style={{ display:'block', fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:5, fontFamily:'var(--font-mono)' }}>Entrada</label>
                <input type="time" style={inp} value={form.entrada} onChange={e=>setForm(p=>({...p,entrada:e.target.value}))}/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:5, fontFamily:'var(--font-mono)' }}>Saída</label>
                <input type="time" style={inp} value={form.saida} onChange={e=>setForm(p=>({...p,saida:e.target.value}))}/>
              </div>
            </div>
          )}

          {/* Observação */}
          <div style={{ marginBottom:16 }}>
            <label style={{ display:'block', fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:5, fontFamily:'var(--font-mono)' }}>Observação</label>
            <textarea style={{...inp, minHeight:56, resize:'vertical'} as React.CSSProperties} value={form.observacao} onChange={e=>setForm(p=>({...p,observacao:e.target.value}))} placeholder="Ex: Reunião de equipe, plantão, CID..."/>
          </div>

          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={onClose} style={{ padding:'9px 18px', borderRadius:8, border:'1px solid var(--border)', background:'none', color:'var(--text-secondary)', fontFamily:'var(--font-display)', fontWeight:600, cursor:'pointer' }}>Cancelar</button>
            <button onClick={() => {
              const min = precisaHoras ? calcMin(form.entrada, form.saida) : 0
              onSave({ id:(initial as any)?.id ?? newId(), ...form, minutos: min })
            }} style={{ padding:'9px 18px', borderRadius:8, border:'1px solid rgba(0,229,255,0.4)', background:'rgba(0,229,255,0.1)', color:'var(--text-accent)', fontFamily:'var(--font-display)', fontWeight:700, cursor:'pointer' }}>
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══ Clock ══════════════════════════════════════════════════ */
function ClockDisplay() {
  const [time, setTime] = useState(new Date())
  const ref = useRef<ReturnType<typeof setInterval>|null>(null)
  useEffect(() => { ref.current = setInterval(()=>setTime(new Date()),1000); return()=>{if(ref.current)clearInterval(ref.current)} },[])
  const h=String(time.getHours()).padStart(2,'0'), m=String(time.getMinutes()).padStart(2,'0'), s=String(time.getSeconds()).padStart(2,'0')
  const dia = time.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 16px', borderRadius:12, background:'var(--surface)', border:'1px solid var(--border)' }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.35rem', fontWeight:700, color:'var(--text-primary)', lineHeight:1, letterSpacing:'0.04em' }}>
        {h}<span style={{ opacity:0.35 }}>:</span>{m}<span style={{ fontSize:'0.85rem', opacity:0.4 }}>:{s}</span>
      </div>
      <div style={{ fontSize:'0.66rem', color:'var(--text-muted)', textTransform:'capitalize', maxWidth:130, lineHeight:1.2 }}>{dia}</div>
    </div>
  )
}

/* ═══ UI helpers (visual SaaS) ═══════════════════════════════ */
const card: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }
const COR_META = '#16a34a', COR_BAIXO = '#f59e0b', COR_EXTRA = '#6366f1', COR_FALTA = '#ef4444'

function diasUteisMes(ym: string): number {
  const [y, m] = ym.split('-').map(Number); const last = new Date(y, m, 0).getDate(); let n = 0
  for (let d = 1; d <= last; d++) { const wd = new Date(y, m - 1, d).getDay(); if (wd !== 0 && wd !== 6) n++ }
  return n
}
function corDia(min: number): string { return min >= META_DIA ? COR_META : min > 0 ? COR_BAIXO : 'var(--text-muted)' }

// anel de progresso (SVG)
function Ring({ pct, size = 150, stroke = 13, color, children }: { pct: number; size?: number; stroke?: number; color: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.min(1, Math.max(0, pct / 100)))
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-4)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.4,0,.2,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
    </div>
  )
}

// barra de um dia em relação às 8h (preenche até 8h + hora extra; marca de referência a 8h)
function BarraDia({ min, height = 10 }: { min: number; height?: number }) {
  const total = 10 * 60
  const base = Math.min(min, META_DIA), extra = Math.max(0, min - META_DIA)
  const basePct = base / total * 100, extraPct = Math.min(extra, total - META_DIA) / total * 100, refPct = META_DIA / total * 100
  const full = min >= META_DIA
  return (
    <div style={{ position: 'relative', height }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: height / 2, background: 'var(--bg-4)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${basePct}%`, background: full ? COR_META : COR_BAIXO, transition: 'width .6s' }} />
        {extra > 0 && <div style={{ position: 'absolute', left: `${basePct}%`, top: 0, bottom: 0, width: `${extraPct}%`, background: COR_EXTRA, transition: 'width .6s' }} />}
      </div>
      <div style={{ position: 'absolute', left: `${refPct}%`, top: -2, bottom: -2, width: 2, background: 'var(--text-secondary)', opacity: .4, borderRadius: 1 }} title="Referência 8h" />
    </div>
  )
}

interface DiaSemana { iso: string; dow: string; dnum: string; min: number; tipo: TipoRegistro | null; isToday: boolean; isFuture: boolean; reg: Registro | null }

// coluna vertical interativa da semana
function ColunaSemana({ d, onPick }: { d: DiaSemana; onPick: () => void }) {
  const H = 96
  const fill = Math.min(d.min, 10 * 60) / (10 * 60) * H
  const refY = H - (META_DIA / (10 * 60)) * H
  const cor = d.tipo === 'falta' ? COR_FALTA : d.tipo && !TIPOS_COMPUTA_HORA.includes(d.tipo) ? getTipo(d.tipo).color : corDia(d.min)
  return (
    <button onClick={onPick} title={d.reg ? `${fmtHM(d.min)}` : 'Sem registro'} style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer',
      borderRadius: 12, padding: '8px 2px', transition: 'background .15s', opacity: d.isFuture ? 0.45 : 1,
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
      <span style={{ fontSize: '0.62rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: d.min > 0 ? cor : 'var(--text-muted)' }}>{d.min > 0 ? fmtHM(d.min) : '—'}</span>
      <div style={{ position: 'relative', width: 26, height: H, borderRadius: 8, background: 'var(--bg-4)', overflow: 'visible' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: fill, borderRadius: 8, background: cor, transition: 'height .7s cubic-bezier(.4,0,.2,1)' }} />
        <div style={{ position: 'absolute', left: -3, right: -3, top: refY, height: 2, background: 'var(--text-secondary)', opacity: .4 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.15 }}>
        <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>{d.dow}</span>
        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: d.isToday ? 'var(--accent)' : 'var(--text-secondary)' }}>{d.dnum}</span>
      </div>
    </button>
  )
}

/* ═══ Main ═══════════════════════════════════════════════════ */
type Tab = 'geral' | 'relatorios'

export default function PontoEletronico() {
  const { registros, loading, save, remove } = usePonto()
  const [tab, setTab] = useState<Tab>('geral')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Registro | null>(null)
  const mesAtual = todayISO().slice(0, 7)
  const [filtroMes, setFiltroMes] = useState(mesAtual)
  const hoje = todayISO()
  const regHoje = registros.find(r => r.data === hoje) || null
  const minHoje = regHoje && TIPOS_COMPUTA_HORA.includes(regHoje.tipo) ? regHoje.minutos : 0

  const openNew = (data?: string) => { setEditing(data ? ({ data } as Registro) : null); setModal(true) }
  const openEdit = (r: Registro) => { setEditing(r); setModal(true) }

  // semana atual (segunda → domingo)
  const semana: DiaSemana[] = (() => {
    const monIso = weekOf(hoje); const mon = new Date(monIso + 'T12:00')
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(mon); dt.setDate(mon.getDate() + i); const iso = dt.toISOString().slice(0, 10)
      const reg = registros.find(r => r.data === iso) || null
      const min = reg && TIPOS_COMPUTA_HORA.includes(reg.tipo) ? reg.minutos : 0
      return { iso, dow: dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').slice(0, 3), dnum: String(dt.getDate()).padStart(2, '0'), min, tipo: reg?.tipo ?? null, isToday: iso === hoje, isFuture: iso > hoje, reg }
    })
  })()
  const minSemana = semana.reduce((a, d) => a + d.min, 0)

  // mês atual (KPIs)
  const regMesAtual = registros.filter(r => r.data.startsWith(mesAtual))
  const diasComHoraMes = regMesAtual.filter(r => TIPOS_COMPUTA_HORA.includes(r.tipo) && r.minutos > 0)
  const minMes = diasComHoraMes.reduce((a, r) => a + r.minutos, 0)
  const saldoMes = diasComHoraMes.reduce((a, r) => a + (r.minutos - META_DIA), 0)
  const mediaDia = diasComHoraMes.length ? Math.round(minMes / diasComHoraMes.length) : 0

  // mês filtrado (lista + relatórios)
  const regMesFiltro = registros.filter(r => r.data.startsWith(filtroMes)).sort((a, b) => b.data.localeCompare(a.data))
  const diasComHoraF = regMesFiltro.filter(r => TIPOS_COMPUTA_HORA.includes(r.tipo) && r.minutos > 0)
  const minMesF = diasComHoraF.reduce((a, r) => a + r.minutos, 0)
  const saldoF = diasComHoraF.reduce((a, r) => a + (r.minutos - META_DIA), 0)
  const metaUtil = diasUteisMes(filtroMes) * META_DIA

  const tabSt = (t: Tab): React.CSSProperties => ({
    padding: '9px 4px', border: 'none', background: 'none', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer',
    color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent', marginRight: 22, transition: 'all .18s',
  })
  const saldoChip = (saldo: number) => {
    const pos = saldo >= 0, cor = pos ? COR_META : COR_FALTA
    return <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.72rem', color: cor, background: `${cor}1a`, padding: '2px 8px', borderRadius: 20 }}>{pos ? '+' : '−'}{fmtSaldo(Math.abs(saldo))}</span>
  }

  // dados relatórios
  const dadosDia = (() => {
    const [y, m] = filtroMes.split('-').map(Number); const last = new Date(y, m, 0).getDate()
    return Array.from({ length: last }, (_, i) => {
      const iso = `${filtroMes}-${String(i + 1).padStart(2, '0')}`
      const reg = regMesFiltro.find(r => r.data === iso)
      const min = reg && TIPOS_COMPUTA_HORA.includes(reg.tipo) ? reg.minutos : 0
      return { dia: String(i + 1), horas: +(min / 60).toFixed(2) }
    })
  })()
  const dadosSemanaRel = (() => {
    const acc: Record<string, number> = {}
    registros.filter(r => TIPOS_COMPUTA_HORA.includes(r.tipo)).forEach(r => { const w = weekOf(r.data); acc[w] = (acc[w] || 0) + r.minutos })
    return Object.entries(acc).sort(([a], [b]) => a.localeCompare(b)).slice(-8).map(([w, min]) => ({ name: fmtDate(w).slice(0, 5), horas: +(min / 60).toFixed(1) }))
  })()
  const dadosTipo = (Object.keys(TIPOS) as TipoRegistro[]).map(t => ({ name: TIPOS[t].label, value: regMesFiltro.filter(r => r.tipo === t).length, color: TIPOS[t].color })).filter(d => d.value > 0)
  // tabela por semana (mês filtrado)
  const semanasMes = (() => {
    const acc: Record<string, number> = {}
    diasComHoraF.forEach(r => { const w = weekOf(r.data); acc[w] = (acc[w] || 0) + r.minutos })
    return Object.entries(acc).sort(([a], [b]) => a.localeCompare(b)).map(([w, min]) => ({ ini: w, min }))
  })()

  const tipChart = { background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 8, fontSize: '0.74rem', color: 'var(--text-primary)' }
  const monthLabel = (() => { const [y, m] = filtroMes.split('-'); return `${MESES[+m - 1]} ${y}` })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-0)' }}>
      {/* Header */}
      <div style={{ padding: '18px 26px 0', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>Ponto</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>Jornada de referência · 8h por dia · 40h por semana</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <ClockDisplay />
            <button onClick={() => openNew()} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>＋ Registrar ponto</button>
          </div>
        </div>
        <div style={{ display: 'flex' }}>
          <button style={tabSt('geral')} onClick={() => setTab('geral')}>Visão geral</button>
          <button style={tabSt('relatorios')} onClick={() => setTab('relatorios')}>Relatórios</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {loading ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 50 }}>Carregando…</div> : tab === 'geral' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1100, margin: '0 auto' }}>

            {/* Linha 1: Hoje + Semana */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 18 }}>
              {/* Hoje */}
              <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ alignSelf: 'flex-start', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Hoje</div>
                <Ring pct={(minHoje / META_DIA) * 100} color={corDia(minHoje)}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{fmtHM(minHoje)}</span>
                  <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>de 8h</span>
                </Ring>
                {regHoje ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{getTipo(regHoje.tipo).icon} {getTipo(regHoje.tipo).label}{regHoje.entrada ? ` · ${regHoje.entrada}–${regHoje.saida}` : ''}</span>
                    {TIPOS_COMPUTA_HORA.includes(regHoje.tipo) && saldoChip(minHoje - META_DIA)}
                    <button onClick={() => openEdit(regHoje)} style={{ fontSize: '0.7rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>editar registro de hoje</button>
                  </div>
                ) : <button onClick={() => openNew(hoje)} style={{ padding: '7px 16px', borderRadius: 9, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>Registrar hoje</button>}
              </div>

              {/* Semana */}
              <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Esta semana</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}><b style={{ color: minSemana >= META_SEMANA ? COR_META : 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{fmtHM(minSemana)}</b> / 40h</div>
                </div>
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                  {semana.map(d => <ColunaSemana key={d.iso} d={d} onPick={() => d.reg ? openEdit(d.reg) : openNew(d.iso)} />)}
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-4)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (minSemana / META_SEMANA) * 100)}%`, background: `linear-gradient(90deg,#0ea5e9,${minSemana >= META_SEMANA ? COR_META : 'var(--accent)'})`, borderRadius: 4, transition: 'width .7s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                    <span>{Math.round((minSemana / META_SEMANA) * 100)}% da meta semanal</span>
                    <span>{minSemana >= META_SEMANA ? `+${fmtSaldo(minSemana - META_SEMANA)} de excedente` : `faltam ${fmtSaldo(META_SEMANA - minSemana)}`}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: COR_META, display: 'inline-block' }} /> ≥ 8h</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: COR_BAIXO, display: 'inline-block' }} /> abaixo de 8h</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: COR_EXTRA, display: 'inline-block' }} /> hora extra</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 14, height: 2, background: 'var(--text-secondary)', display: 'inline-block' }} /> referência 8h</span>
                </div>
              </div>
            </div>

            {/* Linha 2: KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
              {[
                { l: 'Banco de horas (mês)', v: `${saldoMes >= 0 ? '+' : '−'}${fmtSaldo(Math.abs(saldoMes))}`, c: saldoMes >= 0 ? COR_META : COR_FALTA },
                { l: 'Horas no mês', v: fmtHM(minMes), c: 'var(--text-primary)' },
                { l: 'Média por dia', v: fmtHM(mediaDia), c: '#0ea5e9' },
                { l: 'Dias trabalhados', v: String(diasComHoraMes.length), c: '#6366f1' },
              ].map(k => (
                <div key={k.l} style={{ ...card, padding: 16 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, color: k.c, lineHeight: 1 }}>{k.v}</div>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 5 }}>{k.l}</div>
                </div>
              ))}
            </div>

            {/* Linha 3: Dias do mês (lista) */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Dias — {monthLabel}</div>
                <input type="month" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} style={{ ...inp, width: 'auto', padding: '6px 10px', fontSize: '0.8rem' }} />
              </div>
              {regMesFiltro.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 30, fontSize: '0.85rem' }}>Nenhum registro neste mês. Clique em “Registrar ponto”.</div> : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {regMesFiltro.map(r => {
                    const computa = TIPOS_COMPUTA_HORA.includes(r.tipo), tp = getTipo(r.tipo)
                    return (
                      <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '54px 120px 1fr 96px 64px', alignItems: 'center', gap: 12, padding: '11px 6px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)', lineHeight: 1 }}>{r.data.slice(8, 10)}</div>
                          <div style={{ fontSize: '0.56rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{fmtWeekDay(r.data)}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, background: tp.bg, color: tp.color, fontSize: '0.68rem', fontWeight: 700 }}>{tp.icon} {tp.label}</span>
                        </div>
                        <div>
                          {computa ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                <span>{r.entrada && r.saida ? `${r.entrada} – ${r.saida}` : 'sem horário'}</span>
                                <b style={{ color: corDia(r.minutos), fontFamily: 'var(--font-mono)' }}>{fmtHM(r.minutos)}</b>
                              </div>
                              <BarraDia min={r.minutos} />
                            </div>
                          ) : <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{r.observacao || '—'}</span>}
                        </div>
                        <div style={{ textAlign: 'right' }}>{computa && saldoChip(r.minutos - META_DIA)}</div>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button onClick={() => openEdit(r)} title="Editar" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✎</button>
                          <button onClick={() => remove(r.id)} title="Excluir" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: COR_FALTA, cursor: 'pointer' }}>🗑</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── RELATÓRIOS ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Relatório · {monthLabel}</div>
              <input type="month" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} style={{ ...inp, width: 'auto', padding: '7px 12px', fontSize: '0.82rem' }} />
            </div>

            {/* resumo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
              {[
                { l: 'Horas trabalhadas', v: fmtHM(minMesF), c: 'var(--text-primary)' },
                { l: `Meta do mês (${diasUteisMes(filtroMes)} dias úteis)`, v: fmtHM(metaUtil), c: 'var(--text-muted)' },
                { l: 'Saldo (banco de horas)', v: `${saldoF >= 0 ? '+' : '−'}${fmtSaldo(Math.abs(saldoF))}`, c: saldoF >= 0 ? COR_META : COR_FALTA },
                { l: 'Dias trabalhados', v: String(diasComHoraF.length), c: '#6366f1' },
              ].map(k => (
                <div key={k.l} style={{ ...card, padding: 16 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800, color: k.c, lineHeight: 1 }}>{k.v}</div>
                  <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: 5 }}>{k.l}</div>
                </div>
              ))}
            </div>

            {/* horas por dia */}
            <div style={card}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10 }}>Horas por dia · referência 8h</div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosDia} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} interval={1} />
                    <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                    <Tooltip contentStyle={tipChart} formatter={(v: any) => [`${v}h`, 'horas']} labelFormatter={(l: any) => `Dia ${l}`} cursor={{ fill: 'var(--bg-hover)' }} />
                    <ReferenceLine y={8} stroke={COR_META} strokeDasharray="4 4" />
                    <Bar dataKey="horas" radius={[3, 3, 0, 0]}>
                      {dadosDia.map((d, i) => <Cell key={i} fill={d.horas === 0 ? 'var(--bg-4)' : d.horas >= 8 ? COR_META : COR_BAIXO} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              {/* horas por semana */}
              <div style={card}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10 }}>Horas por semana · referência 40h</div>
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dadosSemanaRel} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
                      <defs><linearGradient id="pontoArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.45} /><stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.04} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                      <Tooltip contentStyle={tipChart} formatter={(v: any) => [`${v}h`, 'semana']} cursor={{ stroke: 'var(--border-md)' }} />
                      <ReferenceLine y={40} stroke={COR_META} strokeDasharray="4 4" />
                      <Area type="monotone" dataKey="horas" stroke="#0ea5e9" strokeWidth={2.5} fill="url(#pontoArea)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {/* distribuição por tipo */}
              <div style={card}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10 }}>Distribuição por tipo</div>
                <div style={{ height: 200 }}>
                  {dadosTipo.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 70, fontSize: '0.82rem' }}>Sem dados no mês</div> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={dadosTipo} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={2} stroke="var(--card-bg)" strokeWidth={2}>
                          {dadosTipo.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Tooltip contentStyle={tipChart} formatter={(v: any, n: any) => [`${v} dia(s)`, n]} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* tabela por semana */}
            <div style={card}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>Resumo semanal</div>
              {semanasMes.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Sem horas registradas no mês.</div> : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 8, fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                    <span>Semana de</span><span style={{ textAlign: 'right' }}>Trabalhado</span><span style={{ textAlign: 'right' }}>Meta</span><span style={{ textAlign: 'right' }}>Saldo</span>
                  </div>
                  {semanasMes.map(s => (
                    <div key={s.ini} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 8, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{fmtDate(s.ini)}</span>
                      <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{fmtHM(s.min)}</span>
                      <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>40h</span>
                      <span style={{ textAlign: 'right' }}>{saldoChip(s.min - META_SEMANA)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {modal && <FormRegistro initial={editing ?? undefined} onClose={() => { setModal(false); setEditing(null) }} onSave={r => { save(r); setModal(false); setEditing(null) }} />}
    </div>
  )
}
