import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, PieChart, Pie, Cell } from 'recharts'

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
function monthOf(d: string) { return d.slice(0,7) }
function weekOf(iso: string) { const d=new Date(iso+'T12:00'); const day=d.getDay(); const diff=d.getDate()-day+(day===0?-6:1); const mon=new Date(d); mon.setDate(diff); return mon.toISOString().slice(0,10) }
function newId() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6) }

const META_DIA = 480 // 8 horas em minutos
const TIPOS_COMPUTA_HORA: TipoRegistro[] = ['trabalho','homeoffice','viagem']

function saldoDia(minutos: number): { valor: number; tipo: 'credito'|'debito'|'zerado' } {
  const diff = minutos - META_DIA
  if (diff > 0) return { valor: diff, tipo: 'credito' }
  if (diff < 0) return { valor: Math.abs(diff), tipo: 'debito' }
  return { valor: 0, tipo: 'zerado' }
}
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
    <div style={{ textAlign:'center' }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:'3.2rem', fontWeight:600, color:'var(--text-accent)', lineHeight:1, letterSpacing:'0.05em' }}>
        {h}<span style={{ opacity:0.4 }}>:</span>{m}
        <span style={{ fontSize:'1.4rem', opacity:0.4 }}>:{s}</span>
      </div>
      <div style={{ fontFamily:'var(--font-body)', fontSize:'0.78rem', color:'var(--text-muted)', marginTop:6, textTransform:'capitalize' }}>{dia}</div>
      <style>{`@keyframes blink{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
    </div>
  )
}

/* ═══ Main ═══════════════════════════════════════════════════ */
type Tab = 'registros' | 'relatorios'

export default function PontoEletronico() {
  const { registros, loading, save, remove } = usePonto()
  const [tab, setTab] = useState<Tab>('registros')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Registro|null>(null)
  const [mesAtual] = useState(todayISO().slice(0,7))
  const [filtroMes, setFiltroMes] = useState(mesAtual)
  const [chartType, setChartType] = useState<'mes'|'semana'|'tipo'>('mes')

  const hoje = todayISO()
  const regHoje = registros.find(r=>r.data===hoje)

  // Stats
  const regMesFiltro = registros.filter(r=>r.data.startsWith(filtroMes))
  const regMesAtual  = registros.filter(r=>r.data.startsWith(mesAtual))
  const minMes = regMesAtual.filter(r=>['trabalho','homeoffice','viagem'].includes(r.tipo)).reduce((a,r)=>a+r.minutos,0)
  const diasMes = regMesAtual.length
  const faltasMes = regMesAtual.filter(r=>r.tipo==='falta').length
  const feriasMes = regMesAtual.filter(r=>r.tipo==='ferias').length

  // Gráfico por mês
  const dadosMes = (() => {
    const acc: Record<string,number> = {}
    registros.filter(r=>['trabalho','homeoffice','viagem'].includes(r.tipo)).forEach(r=>{
      const m = monthOf(r.data)
      acc[m] = (acc[m]||0) + r.minutos
    })
    return Object.entries(acc).sort(([a],[b])=>a.localeCompare(b)).slice(-6).map(([m,min])=>({
      name: MESES[parseInt(m.slice(5,7))-1]+'/'+m.slice(2,4),
      horas: +(min/60).toFixed(1),
    }))
  })()

  // Gráfico por semana
  const dadosSemana = (() => {
    const acc: Record<string,number> = {}
    registros.filter(r=>['trabalho','homeoffice','viagem'].includes(r.tipo)).forEach(r=>{
      const w = weekOf(r.data)
      acc[w] = (acc[w]||0) + r.minutos
    })
    return Object.entries(acc).sort(([a],[b])=>a.localeCompare(b)).slice(-8).map(([w,min])=>({
      name: fmtDate(w).slice(0,5),
      horas: +(min/60).toFixed(1),
    }))
  })()

  // Gráfico por tipo
  const dadosTipo = (Object.keys(TIPOS) as TipoRegistro[]).map(t=>({
    name: TIPOS[t].label,
    value: registros.filter(r=>r.data.startsWith(filtroMes)&&r.tipo===t).length,
    color: TIPOS[t].color,
  })).filter(d=>d.value>0)

  const tabSt = (t: Tab): React.CSSProperties => ({
    padding:'10px 22px', border:'none', background:'none',
    fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.88rem', cursor:'pointer',
    color: tab===t?'var(--text-accent)':'var(--text-muted)',
    borderBottom: tab===t?'2px solid var(--text-accent)':'2px solid transparent',
    transition:'all 0.18s', letterSpacing:'0.04em',
  })

  const chartTabSt = (t: typeof chartType): React.CSSProperties => ({
    padding:'5px 14px', borderRadius:20, cursor:'pointer', transition:'all 0.15s',
    border:`1px solid ${chartType===t?'var(--border-md)':'var(--border)'}`,
    background: chartType===t?'rgba(0,229,255,0.1)':'none',
    color: chartType===t?'var(--text-accent)':'var(--text-muted)',
    fontFamily:'var(--font-display)', fontWeight:600, fontSize:'0.75rem',
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg-0)' }}>

      {/* Header */}
      <div style={{ padding:'18px 24px 0', background:'var(--bg-1)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'1rem', fontWeight:800, color:'var(--text-accent)', letterSpacing:'0.1em' }}>PONTO ELETRÔNICO</div>
            <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:2 }}>Registro de horas e ocorrências</div>
          </div>
          <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
            {(() => {
              const diasComHora = regMesAtual.filter(r=>TIPOS_COMPUTA_HORA.includes(r.tipo)&&r.minutos>0)
              const saldoTotal = diasComHora.reduce((a,r)=>a+(r.minutos-META_DIA),0)
              const saldoCor = saldoTotal>=0?'#10b981':'#ef4444'
              const saldoLabel = saldoTotal>=0?`+${fmtHM(saldoTotal)}`:`-${fmtHM(Math.abs(saldoTotal))}`
              return [
                { l:'Horas no Mês', v:fmtHM(minMes), c:'var(--text-accent)' },
                { l:'Saldo (±8h/dia)', v:saldoLabel, c:saldoCor },
                { l:'Dias Registrados', v:diasMes, c:'#60a5fa' },
                { l:'Faltas', v:faltasMes, c:'#ef4444' },
                { l:'Férias', v:feriasMes, c:'#f59e0b' },
              ]
            })().map(k=>(
              <div key={k.l} style={{ textAlign:'center' }}>
                <div style={{ fontFamily:'var(--font-display)', fontSize:'1.3rem', fontWeight:800, color:k.c, lineHeight:1 }}>{k.v}</div>
                <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:2 }}>{k.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display:'flex' }}>
          <button style={tabSt('registros')} onClick={()=>setTab('registros')}>⊙ Registros</button>
          <button style={tabSt('relatorios')} onClick={()=>setTab('relatorios')}>◈ Relatórios</button>
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:24 }}>

        {/* ── REGISTROS ── */}
        {tab==='registros' && (
          <div style={{ display:'grid', gridTemplateColumns:'minmax(300px,360px) 1fr', gap:20, alignItems:'start' }}>

            {/* Relógio + botão novo */}
            <div>
              <div className="card" style={{ padding:'24px 20px', textAlign:'center', marginBottom:16 }}>
                <ClockDisplay />
                <button
                  onClick={()=>{ setEditing(null); setModal(true) }}
                  style={{ marginTop:20, width:'100%', padding:'12px', borderRadius:10, border:'1px solid rgba(0,229,255,0.4)', background:'rgba(0,229,255,0.1)', color:'var(--text-accent)', fontFamily:'var(--font-display)', fontWeight:800, fontSize:'0.9rem', cursor:'pointer', letterSpacing:'0.05em', transition:'all 0.2s' }}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(0,229,255,0.18)'}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='rgba(0,229,255,0.1)'}
                >
                  + Lançar Registro
                </button>
              </div>

              {/* Status hoje */}
              {regHoje && (
                <div className="card" style={{ padding:'14px 16px' }}>
                  <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8 }}>HOJE</div>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{
                      width:36, height:36, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                      background: getTipo(regHoje.tipo).bg, fontSize:'1.1rem', border:`1px solid ${getTipo(regHoje.tipo).color}44`, flexShrink:0,
                    }}>{getTipo(regHoje.tipo).icon}</div>
                    <div>
                      <div style={{ fontFamily:'var(--font-display)', fontWeight:700, color:getTipo(regHoje.tipo).color, fontSize:'0.88rem' }}>{getTipo(regHoje.tipo).label}</div>
                      {regHoje.minutos>0 && <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>{regHoje.entrada} → {regHoje.saida} · {fmtHM(regHoje.minutos)}</div>}
                    </div>
                    <button onClick={()=>{ setEditing(regHoje); setModal(true) }} style={{ marginLeft:'auto', background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px', color:'var(--text-muted)', cursor:'pointer', fontSize:'0.72rem' }}>✎</button>
                  </div>
                </div>
              )}
            </div>

            {/* Histórico */}
            <div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:12 }}>
                Histórico Recente
              </div>
              {loading ? (
                <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>Carregando…</div>
              ) : registros.length===0 ? (
                <div className="card" style={{ textAlign:'center', padding:48, color:'var(--text-muted)' }}>
                  <div style={{ fontSize:36, marginBottom:8 }}>⊙</div>
                  <div style={{ fontFamily:'var(--font-display)', letterSpacing:'0.1em', textTransform:'uppercase', fontSize:'0.82rem' }}>Nenhum registro ainda</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                  {registros.slice(0,25).map(r => {
                    const tp = getTipo(r.tipo)
                    return (
                      <div key={r.id} className="card" style={{ padding:'12px 14px', display:'flex', alignItems:'center', gap:12, transition:'all 0.15s' }}
                        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.borderColor='var(--border-md)'}
                        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.borderColor=''}>
                        {/* Tipo badge */}
                        <div style={{ width:38, height:38, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', background:tp.bg, border:`1px solid ${tp.color}33`, flexShrink:0, fontSize:'1rem' }}>
                          {tp.icon}
                        </div>

                        {/* Info */}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                            <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.82rem', color:'var(--text-primary)' }}>{fmtDate(r.data)}</span>
                            <span style={{ fontSize:'0.62rem', color:'var(--text-muted)' }}>{fmtWeekDay(r.data)}</span>
                            <span style={{ fontSize:'0.65rem', fontWeight:700, padding:'1px 7px', borderRadius:12, background:tp.bg, color:tp.color, border:`1px solid ${tp.color}33` }}>{tp.label}</span>
                          </div>
                          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                            {r.entrada && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.78rem', color:'#10b981' }}>→ {r.entrada}</span>}
                            {r.saida   && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.78rem', color:'#ef4444' }}>← {r.saida}</span>}
                            {r.minutos>0 && <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.78rem', color:'var(--text-accent)' }}>{fmtHM(r.minutos)}</span>}
                            {r.observacao && <span style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:160 }}>{r.observacao}</span>}
                            {TIPOS_COMPUTA_HORA.includes(r.tipo) && r.minutos > 0 && (() => {
                              const s = saldoDia(r.minutos)
                              if (s.tipo === 'zerado') return null
                              return (
                                <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', fontWeight:700, padding:'1px 7px', borderRadius:10, background: s.tipo==='credito'?'rgba(16,185,129,0.12)':'rgba(239,68,68,0.12)', color: s.tipo==='credito'?'#10b981':'#ef4444', border:`1px solid ${s.tipo==='credito'?'rgba(16,185,129,0.25)':'rgba(239,68,68,0.25)'}` }}>
                                  {s.tipo==='credito'?'+':'-'}{fmtSaldo(s.valor)}
                                </span>
                              )
                            })()}
                          </div>
                        </div>

                        {/* Ações */}
                        <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                          <button onClick={()=>{ setEditing(r); setModal(true) }}
                            style={{ background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'5px 9px', color:'var(--text-muted)', cursor:'pointer', fontSize:'0.75rem', transition:'all 0.15s' }}
                            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='var(--text-accent)'}
                            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='var(--text-muted)'}>
                            ✎
                          </button>
                          <button onClick={async()=>{ if(confirm(`Apagar registro de ${fmtDate(r.data)}?`)) await remove(r.id) }}
                            style={{ background:'none', border:'1px solid rgba(239,68,68,0.2)', borderRadius:6, padding:'5px 9px', color:'#f87171', cursor:'pointer', fontSize:'0.75rem', transition:'all 0.15s' }}
                            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(239,68,68,0.08)'}
                            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='none'}>
                            ✕
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── RELATÓRIOS ── */}
        {tab==='relatorios' && (
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

            {/* Filtro mês + tabs gráfico */}
            <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:'0.7rem', color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>MÊS:</span>
                <input type="month" value={filtroMes} onChange={e=>setFiltroMes(e.target.value)}
                  style={{ background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text-primary)', fontFamily:'var(--font-body)', fontSize:'0.82rem', padding:'6px 10px' }}/>
              </div>
              <div style={{ display:'flex', gap:6, marginLeft:'auto' }}>
                <button style={chartTabSt('mes')} onClick={()=>setChartType('mes')}>Por Mês</button>
                <button style={chartTabSt('semana')} onClick={()=>setChartType('semana')}>Por Semana</button>
                <button style={chartTabSt('tipo')} onClick={()=>setChartType('tipo')}>Por Tipo</button>
              </div>
            </div>

            {/* Saldo de horas do mês */}
            {(() => {
              const diasHora = regMesFiltro.filter(r=>TIPOS_COMPUTA_HORA.includes(r.tipo)&&r.minutos>0)
              const saldoTot = diasHora.reduce((a,r)=>a+(r.minutos-META_DIA),0)
              const creditos = diasHora.filter(r=>r.minutos>META_DIA).reduce((a,r)=>a+(r.minutos-META_DIA),0)
              const debitos = diasHora.filter(r=>r.minutos<META_DIA).reduce((a,r)=>a+(META_DIA-r.minutos),0)
              const metaMes = diasHora.length * META_DIA
              const pctMeta = metaMes>0?Math.round((diasHora.reduce((a,r)=>a+r.minutos,0)/metaMes)*100):0
              return (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:8 }}>
                  <div style={{ padding:'14px 18px', borderRadius:14, background:'rgba(0,229,255,0.06)', border:'1px solid rgba(0,229,255,0.2)' }}>
                    <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Saldo do mês</div>
                    <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.4rem', color:saldoTot>=0?'#10b981':'#ef4444', lineHeight:1 }}>{saldoTot>=0?'+':'-'}{fmtSaldo(Math.abs(saldoTot))}</div>
                    <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', marginTop:4 }}>Meta: 8h/dia · {diasHora.length} dias</div>
                  </div>
                  <div style={{ padding:'14px 18px', borderRadius:14, background:'rgba(16,185,129,0.06)', border:'1px solid rgba(16,185,129,0.2)' }}>
                    <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Créditos</div>
                    <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.4rem', color:'#10b981', lineHeight:1 }}>+{fmtSaldo(creditos)}</div>
                    <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', marginTop:4 }}>{diasHora.filter(r=>r.minutos>META_DIA).length} dias acima de 8h</div>
                  </div>
                  <div style={{ padding:'14px 18px', borderRadius:14, background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)' }}>
                    <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Débitos</div>
                    <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.4rem', color:'#ef4444', lineHeight:1 }}>-{fmtSaldo(debitos)}</div>
                    <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', marginTop:4 }}>{diasHora.filter(r=>r.minutos<META_DIA).length} dias abaixo de 8h</div>
                  </div>
                  <div style={{ padding:'14px 18px', borderRadius:14, background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)' }}>
                    <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>% da meta mensal</div>
                    <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.4rem', color:'#f59e0b', lineHeight:1 }}>{pctMeta}%</div>
                    <div style={{ height:4, borderRadius:2, background:'rgba(255,255,255,0.07)', marginTop:8, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${Math.min(100,pctMeta)}%`, background:'linear-gradient(90deg,#d97706,#fbbf24)', borderRadius:2 }} />
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Resumo do mês filtrado */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12 }}>
              {(Object.keys(TIPOS) as TipoRegistro[]).map(t => {
                const count = regMesFiltro.filter(r=>r.tipo===t).length
                if(count===0) return null
                const tp = TIPOS[t]
                const totalMin = regMesFiltro.filter(r=>r.tipo===t).reduce((a,r)=>a+r.minutos,0)
                return (
                  <div key={t} className="kpi-card" style={{'--kpi-color':tp.color, borderLeft:`3px solid ${tp.color}`} as React.CSSProperties}>
                    <div className="kpi-label">{tp.icon} {tp.label}</div>
                    <div className="kpi-value" style={{ color:tp.color, fontSize:'1.6rem' }}>{count}×</div>
                    {totalMin>0 && <div className="kpi-sub">{fmtHM(totalMin)}</div>}
                  </div>
                )
              })}
            </div>

            {/* Gráfico principal */}
            <div className="card">
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:16 }}>
                {chartType==='mes'?'Horas Trabalhadas por Mês':chartType==='semana'?'Horas por Semana':'Distribuição por Tipo'}
              </div>
              {chartType!=='tipo' ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartType==='mes'?dadosMes:dadosSemana}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                    <XAxis dataKey="name" tick={{fill:'var(--text-muted)',fontSize:11}}/>
                    <YAxis tick={{fill:'var(--text-muted)',fontSize:11}} unit="h"/>
                    <Tooltip contentStyle={{background:'var(--bg-2)',border:'1px solid var(--border-md)',borderRadius:8}} formatter={(v:number)=>[`${v}h`,'Horas']}/>
                    <Bar dataKey="horas" fill="#00e5ff" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              ) : dadosTipo.length>0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={dadosTipo} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({name,value})=>`${name}: ${value}`}>
                      {dadosTipo.map((d,i)=><Cell key={i} fill={d.color}/>)}
                    </Pie>
                    <Tooltip contentStyle={{background:'var(--bg-2)',border:'1px solid var(--border-md)',borderRadius:8}}/>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Sem registros no período</div>
              )}
            </div>

            {/* Linha de fluxo */}
            <div className="card">
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:16 }}>Fluxo Diário — Últimos 30 dias</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={registros.filter(r=>['trabalho','homeoffice','viagem'].includes(r.tipo)).slice(0,30).reverse().map(r=>({name:fmtDate(r.data).slice(0,5),horas:+(r.minutos/60).toFixed(1)}))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                  <XAxis dataKey="name" tick={{fill:'var(--text-muted)',fontSize:10}} interval={4}/>
                  <YAxis tick={{fill:'var(--text-muted)',fontSize:11}} unit="h"/>
                  <Tooltip contentStyle={{background:'var(--bg-2)',border:'1px solid var(--border-md)',borderRadius:8}} formatter={(v:number)=>[`${v}h`,'Horas']}/>
                  <Line type="monotone" dataKey="horas" stroke="#7c3aed" strokeWidth={2} dot={{fill:'#7c3aed',r:3}}/>
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Tabela detalhada */}
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:'0.65rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.12em' }}>
                Registros de {MESES[parseInt(filtroMes.slice(5,7))-1]}/{filtroMes.slice(0,4)}
              </div>
              {regMesFiltro.length===0 ? (
                <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)', fontSize:'0.82rem' }}>Nenhum registro neste mês</div>
              ) : regMesFiltro.map((r,i) => {
                const tp = getTipo(r.tipo)
                return (
                  <div key={r.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 18px', borderBottom: i<regMesFiltro.length-1?'1px solid var(--border)':'none' }}>
                    <span style={{ fontSize:'1rem', width:24, textAlign:'center' }}>{tp.icon}</span>
                    <div style={{ flex:1 }}>
                      <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.82rem', color:'var(--text-primary)' }}>{fmtDate(r.data)}</span>
                      <span style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginLeft:8 }}>{fmtWeekDay(r.data)}</span>
                    </div>
                    <span style={{ fontSize:'0.72rem', padding:'2px 8px', borderRadius:12, background:tp.bg, color:tp.color, fontWeight:700 }}>{tp.label}</span>
                    {r.minutos>0 && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.78rem', color:'var(--text-accent)', minWidth:50, textAlign:'right' }}>{fmtHM(r.minutos)}</span>}
                    {r.entrada && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-muted)' }}>{r.entrada}–{r.saida}</span>}
                    {TIPOS_COMPUTA_HORA.includes(r.tipo) && r.minutos>0 && (() => {
                      const s=saldoDia(r.minutos)
                      if(s.tipo==='zerado') return null
                      return <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', fontWeight:700, color:s.tipo==='credito'?'#10b981':'#ef4444' }}>{s.tipo==='credito'?'+':'-'}{fmtSaldo(s.valor)}</span>
                    })()}
                    <button onClick={async()=>{ if(confirm(`Apagar?`)) await remove(r.id) }}
                      style={{ background:'none', border:'1px solid rgba(239,68,68,0.2)', borderRadius:6, padding:'3px 7px', color:'#f87171', cursor:'pointer', fontSize:'0.7rem' }}>✕</button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {modal && (
        <FormRegistro
          initial={editing ?? undefined}
          onSave={async r => { await save(r); setModal(false); setEditing(null) }}
          onClose={() => { setModal(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
