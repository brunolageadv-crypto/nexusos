import { useState, useEffect, useCallback, useRef } from 'react'
import { db, auth } from '../../lib/firebase'
import { collection, doc, setDoc, onSnapshot, query, orderBy } from 'firebase/firestore'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from 'recharts'

/* ═══ Types ══════════════════════════════════════════════════ */
interface Registro {
  id: string
  data: string        // YYYY-MM-DD
  entrada: string     // HH:MM
  saida: string       // HH:MM ou ''
  minutos: number     // calculado
  observacao: string
}

/* ═══ Helpers ════════════════════════════════════════════════ */
function nowHHMM() {
  const n = new Date()
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`
}
function todayISO() {
  return new Date().toISOString().slice(0,10)
}
function calcMinutos(entrada: string, saida: string): number {
  if (!entrada || !saida) return 0
  const [eh,em] = entrada.split(':').map(Number)
  const [sh,sm] = saida.split(':').map(Number)
  const diff = (sh*60+sm) - (eh*60+em)
  return diff > 0 ? diff : 0
}
function fmtHM(minutos: number) {
  const h = Math.floor(minutos/60)
  const m = minutos % 60
  return `${h}h${m>0?` ${m}min`:''}`
}
function fmtDate(iso: string) {
  if (!iso) return ''
  const [y,m,d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function weekOf(iso: string) {
  const d = new Date(iso)
  const day = d.getDay()
  const diff = d.getDate() - day + (day===0?-6:1)
  const mon = new Date(d.setDate(diff))
  return mon.toISOString().slice(0,10)
}
function monthOf(iso: string) { return iso.slice(0,7) }
const COLORS = ['#00e5ff','#7c3aed','#10b981','#f59e0b','#ef4444','#3b82f6','#ec4899']
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

/* ═══ Hook dados ═════════════════════════════════════════════ */
function usePonto() {
  const [registros, setRegistros] = useState<Registro[]>([])
  const [loading, setLoading] = useState(true)
  const uid = auth?.currentUser?.uid

  useEffect(() => {
    if (!uid || !db) { setLoading(false); return }
    const q = query(collection(db, `users/${uid}/ponto`), orderBy('data','desc'))
    const unsub = onSnapshot(q, snap => {
      setRegistros(snap.docs.map(d => d.data() as Registro))
      setLoading(false)
    })
    return unsub
  }, [uid])

  const save = useCallback(async (r: Registro) => {
    if (uid && db) await setDoc(doc(db, `users/${uid}/ponto`, r.id), r)
    else setRegistros(p => { const n = p.filter(x=>x.id!==r.id); return [r,...n].sort((a,b)=>b.data.localeCompare(a.data)) })
  }, [uid])

  return { registros, loading, save }
}

/* ═══ Componente principal ═══════════════════════════════════ */
export default function PontoEletronico() {
  const { registros, loading, save } = usePonto()
  const [view, setView] = useState<'registro'|'relatorios'>('registro')
  const [chartType, setChartType] = useState<'semana'|'mes'|'ano'>('mes')

  // Estado do registro de hoje
  const hoje = todayISO()
  const regHoje = registros.find(r => r.data === hoje)
  const [entrada, setEntrada] = useState(regHoje?.entrada ?? '')
  const [saida, setSaida]     = useState(regHoje?.saida ?? '')
  const [obs, setObs]         = useState(regHoje?.observacao ?? '')
  const [editId, setEditId]   = useState<string|null>(null)

  // Atualizar fields quando carregar dados
  useEffect(() => {
    if (regHoje) {
      setEntrada(regHoje.entrada)
      setSaida(regHoje.saida)
      setObs(regHoje.observacao)
    }
  }, [regHoje?.id])

  // Bater ponto entrada
  const baterEntrada = () => {
    const h = nowHHMM()
    setEntrada(h)
    const id = regHoje?.id ?? (hoje + '_' + Date.now().toString(36))
    save({ id, data: hoje, entrada: h, saida: regHoje?.saida ?? '', minutos: calcMinutos(h, regHoje?.saida ?? ''), observacao: obs })
  }

  // Bater ponto saída
  const baterSaida = () => {
    const h = nowHHMM()
    setSaida(h)
    const id = regHoje?.id ?? (hoje + '_' + Date.now().toString(36))
    const min = calcMinutos(entrada || regHoje?.entrada || '', h)
    save({ id, data: hoje, entrada: entrada || regHoje?.entrada || '', saida: h, minutos: min, observacao: obs })
  }

  // Salvar manual
  const salvarManual = (data: string, ent: string, sai: string, o: string, id?: string) => {
    const rid = id ?? (data + '_' + Date.now().toString(36))
    const min = calcMinutos(ent, sai)
    save({ id: rid, data, entrada: ent, saida: sai, minutos: min, observacao: o })
    setEditId(null)
  }

  // Stats
  const mesAtual = hoje.slice(0,7)
  const regMes = registros.filter(r => r.data.startsWith(mesAtual))
  const minMes = regMes.reduce((a,r) => a+r.minutos, 0)
  const diasMes = regMes.length
  const semAtual = weekOf(hoje)
  const regSem = registros.filter(r => weekOf(r.data) === semAtual)
  const minSem = regSem.reduce((a,r) => a+r.minutos, 0)

  // Dados para gráficos
  const dadosSemana = (() => {
    const ultSems: Record<string, number> = {}
    registros.forEach(r => {
      const w = weekOf(r.data)
      ultSems[w] = (ultSems[w]||0) + r.minutos
    })
    return Object.entries(ultSems).sort(([a],[b])=>a.localeCompare(b)).slice(-8).map(([w,m]) => ({
      name: fmtDate(w).slice(0,5),
      horas: +(m/60).toFixed(1),
    }))
  })()

  const dadosMes = (() => {
    const meses: Record<string, number> = {}
    registros.forEach(r => {
      const m = r.data.slice(0,7)
      meses[m] = (meses[m]||0) + r.minutos
    })
    return Object.entries(meses).sort(([a],[b])=>a.localeCompare(b)).slice(-6).map(([m,min]) => ({
      name: MESES[parseInt(m.slice(5,7))-1] + '/' + m.slice(2,4),
      horas: +(min/60).toFixed(1),
    }))
  })()

  const dadosAno = (() => {
    const anos: Record<string, number> = {}
    registros.forEach(r => {
      const a = r.data.slice(0,4)
      anos[a] = (anos[a]||0) + r.minutos
    })
    return Object.entries(anos).map(([a,m]) => ({ name: a, horas: +(m/60).toFixed(1) }))
  })()

  const dadosPizza = (() => {
    const dias: Record<string,number> = { 'Seg':0,'Ter':0,'Qua':0,'Qui':0,'Sex':0,'Sáb':0,'Dom':0 }
    const nomes = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
    registros.slice(0,60).forEach(r => {
      const dw = nomes[new Date(r.data+'T12:00').getDay()]
      dias[dw] = (dias[dw]||0) + r.minutos
    })
    return Object.entries(dias).filter(([,v])=>v>0).map(([n,m]) => ({ name: n, value: +(m/60).toFixed(1) }))
  })()

  const dadosFluxo = registros.slice(0,30).reverse().map(r => ({
    name: fmtDate(r.data).slice(0,5),
    horas: +(r.minutos/60).toFixed(1),
  }))

  const inp = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text-primary)', fontFamily:'var(--font-body)', fontSize:'0.88rem', padding:'8px 12px' } as React.CSSProperties

  const tabSt = (t: typeof view): React.CSSProperties => ({
    padding:'10px 24px', border:'none', background:'none',
    fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.88rem',
    cursor:'pointer', letterSpacing:'0.04em',
    color: view===t ? 'var(--text-accent)' : 'var(--text-muted)',
    borderBottom: view===t ? '2px solid var(--text-accent)' : '2px solid transparent',
    transition:'all 0.18s',
  })

  const chartTabSt = (t: typeof chartType): React.CSSProperties => ({
    padding:'6px 16px', border:`1px solid ${chartType===t?'var(--border-md)':'var(--border)'}`,
    borderRadius:20, background: chartType===t?'rgba(0,229,255,0.1)':'none',
    color: chartType===t?'var(--text-accent)':'var(--text-muted)',
    fontFamily:'var(--font-display)', fontWeight:600, fontSize:'0.75rem', cursor:'pointer', transition:'all 0.15s',
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg-0)' }}>

      {/* Header */}
      <div style={{ padding:'18px 24px 0', background:'var(--bg-1)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16, flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'1rem', fontWeight:800, color:'var(--text-accent)', letterSpacing:'0.1em' }}>PONTO ELETRÔNICO</div>
            <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:2 }}>Registro de horas trabalhadas</div>
          </div>
          <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
            {[
              { l:'Hoje', v: regHoje ? fmtHM(regHoje.minutos) : '—', c:'var(--text-accent)' },
              { l:'Esta Semana', v: fmtHM(minSem), c:'#10b981' },
              { l:'Este Mês', v: fmtHM(minMes), c:'#7c3aed' },
              { l:'Dias no Mês', v: diasMes, c:'#f59e0b' },
            ].map(k => (
              <div key={k.l} style={{ textAlign:'center' }}>
                <div style={{ fontFamily:'var(--font-display)', fontSize:'1.3rem', fontWeight:800, color:k.c, lineHeight:1 }}>{k.v}</div>
                <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:2 }}>{k.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display:'flex' }}>
          <button style={tabSt('registro')} onClick={()=>setView('registro')}>⊙ Registro</button>
          <button style={tabSt('relatorios')} onClick={()=>setView('relatorios')}>◈ Relatórios</button>
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:24 }}>

        {view === 'registro' && (
          <div style={{ display:'grid', gridTemplateColumns:'minmax(280px,380px) 1fr', gap:20, alignItems:'start' }}>

            {/* Painel de bater ponto */}
            <div>
              <div className="card" style={{ textAlign:'center', padding:'28px 24px' }}>
                {/* Relógio */}
                <ClockDisplay />
                <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginBottom:24, fontFamily:'var(--font-mono)' }}>
                  {fmtDate(hoje)} · {new Date().toLocaleDateString('pt-BR',{weekday:'long'})}
                </div>

                {/* Status */}
                <div style={{ marginBottom:20 }}>
                  {regHoje?.entrada && !regHoje?.saida && (
                    <div style={{ background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:10, padding:'10px 16px', marginBottom:12 }}>
                      <div style={{ fontSize:'0.7rem', color:'#10b981', fontFamily:'var(--font-mono)', letterSpacing:'0.08em' }}>EM SERVIÇO DESDE</div>
                      <div style={{ fontFamily:'var(--font-display)', fontSize:'1.8rem', fontWeight:800, color:'#10b981' }}>{regHoje.entrada}</div>
                    </div>
                  )}
                  {regHoje?.entrada && regHoje?.saida && (
                    <div style={{ background:'rgba(124,58,237,0.1)', border:'1px solid rgba(124,58,237,0.3)', borderRadius:10, padding:'10px 16px', marginBottom:12 }}>
                      <div style={{ fontSize:'0.7rem', color:'#a78bfa', fontFamily:'var(--font-mono)', letterSpacing:'0.08em' }}>EXPEDIENTE ENCERRADO</div>
                      <div style={{ fontFamily:'var(--font-display)', fontSize:'1.4rem', fontWeight:800, color:'#a78bfa' }}>{fmtHM(regHoje.minutos)}</div>
                    </div>
                  )}
                </div>

                {/* Botões principais */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
                  <button onClick={baterEntrada}
                    disabled={!!regHoje?.entrada}
                    style={{
                      padding:'16px 12px', borderRadius:12, border:'1px solid rgba(16,185,129,0.4)',
                      background: regHoje?.entrada ? 'rgba(16,185,129,0.05)' : 'rgba(16,185,129,0.12)',
                      color: regHoje?.entrada ? 'rgba(16,185,129,0.4)' : '#10b981',
                      fontFamily:'var(--font-display)', fontWeight:800, fontSize:'0.95rem',
                      cursor: regHoje?.entrada ? 'not-allowed' : 'pointer',
                      transition:'all 0.2s',
                    }}>
                    <div style={{ fontSize:'1.6rem', marginBottom:4 }}>→</div>
                    ENTRADA
                    {regHoje?.entrada && <div style={{ fontSize:'0.72rem', marginTop:4, fontWeight:400 }}>{regHoje.entrada}</div>}
                  </button>
                  <button onClick={baterSaida}
                    disabled={!regHoje?.entrada || !!regHoje?.saida}
                    style={{
                      padding:'16px 12px', borderRadius:12, border:'1px solid rgba(239,68,68,0.4)',
                      background: (!regHoje?.entrada || regHoje?.saida) ? 'rgba(239,68,68,0.05)' : 'rgba(239,68,68,0.12)',
                      color: (!regHoje?.entrada || regHoje?.saida) ? 'rgba(239,68,68,0.35)' : '#ef4444',
                      fontFamily:'var(--font-display)', fontWeight:800, fontSize:'0.95rem',
                      cursor: (!regHoje?.entrada || regHoje?.saida) ? 'not-allowed' : 'pointer',
                      transition:'all 0.2s',
                    }}>
                    <div style={{ fontSize:'1.6rem', marginBottom:4 }}>←</div>
                    SAÍDA
                    {regHoje?.saida && <div style={{ fontSize:'0.72rem', marginTop:4, fontWeight:400 }}>{regHoje.saida}</div>}
                  </button>
                </div>

                {/* Observação */}
                <textarea value={obs} onChange={e=>setObs(e.target.value)}
                  placeholder="Observação do dia (opcional)…"
                  style={{ ...inp, width:'100%', minHeight:56, resize:'vertical', fontSize:'0.8rem' }} />
                {obs && (
                  <button onClick={()=>{
                    const id = regHoje?.id ?? (hoje+'_'+Date.now().toString(36))
                    save({id, data:hoje, entrada:entrada||'', saida:saida||'', minutos:calcMinutos(entrada||'',saida||''), observacao:obs})
                  }} style={{ marginTop:8, padding:'7px 16px', borderRadius:8, border:'1px solid var(--border-md)', background:'rgba(0,229,255,0.08)', color:'var(--text-accent)', fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.78rem', cursor:'pointer' }}>
                    Salvar observação
                  </button>
                )}
              </div>

              {/* Registro manual */}
              <div className="card" style={{ marginTop:16, padding:'18px 20px' }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:14 }}>Registro Manual</div>
                <ManualForm onSave={salvarManual} />
              </div>
            </div>

            {/* Histórico */}
            <div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:12 }}>Histórico Recente</div>
              {loading ? (
                <div style={{ color:'var(--text-muted)', textAlign:'center', padding:32 }}>Carregando…</div>
              ) : registros.length === 0 ? (
                <div className="card" style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>⊙</div>
                  <div>Nenhum registro ainda.<br />Bata o ponto para começar.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {registros.slice(0,20).map(r => (
                    <div key={r.id} className="card" style={{ padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:48, textAlign:'center', flexShrink:0 }}>
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'var(--text-muted)' }}>{fmtDate(r.data).slice(0,5)}</div>
                        <div style={{ fontSize:'0.6rem', color:'var(--text-muted)' }}>{new Date(r.data+'T12:00').toLocaleDateString('pt-BR',{weekday:'short'})}</div>
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.82rem', color:'#10b981' }}>→ {r.entrada||'—'}</span>
                          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.82rem', color:'#ef4444' }}>← {r.saida||'—'}</span>
                          <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.82rem', color:r.minutos>0?'var(--text-accent)':'var(--text-muted)' }}>
                            {r.minutos > 0 ? fmtHM(r.minutos) : '—'}
                          </span>
                        </div>
                        {r.observacao && <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:4 }}>{r.observacao}</div>}
                      </div>
                      <button onClick={()=>setEditId(r.id===editId?null:r.id)}
                        style={{ background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'4px 10px', color:'var(--text-muted)', cursor:'pointer', fontSize:'0.72rem', fontFamily:'var(--font-display)', fontWeight:600 }}>
                        {r.id===editId?'✕':'Editar'}
                      </button>
                      {r.id===editId && (
                        <div style={{ position:'absolute', marginTop:48, zIndex:10 }}>
                          <div className="card" style={{ padding:16, minWidth:300 }}>
                            <ManualForm initial={r} onSave={salvarManual} onCancel={()=>setEditId(null)} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'relatorios' && (
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            {/* Filtro período */}
            <div style={{ display:'flex', gap:8 }}>
              <button style={chartTabSt('semana')} onClick={()=>setChartType('semana')}>Por Semana</button>
              <button style={chartTabSt('mes')} onClick={()=>setChartType('mes')}>Por Mês</button>
              <button style={chartTabSt('ano')} onClick={()=>setChartType('ano')}>Por Ano</button>
            </div>

            {/* Gráfico de barras */}
            <div className="card">
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:16 }}>
                Horas Trabalhadas — {chartType==='semana'?'Últimas Semanas':chartType==='mes'?'Últimos Meses':'Por Ano'}
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartType==='semana'?dadosSemana:chartType==='mes'?dadosMes:dadosAno}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fill:'var(--text-muted)', fontSize:11 }} />
                  <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} unit="h" />
                  <Tooltip contentStyle={{ background:'var(--bg-2)', border:'1px solid var(--border-md)', borderRadius:8, fontFamily:'var(--font-body)' }} formatter={(v:number)=>[`${v}h`,'Horas']} />
                  <Bar dataKey="horas" fill="#00e5ff" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              {/* Gráfico de pizza */}
              <div className="card">
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:16 }}>Distribuição por Dia da Semana</div>
                {dadosPizza.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={dadosPizza} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name,value})=>`${name}: ${value}h`} labelLine={false}>
                        {dadosPizza.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v:number)=>[`${v}h`]} contentStyle={{ background:'var(--bg-2)', border:'1px solid var(--border-md)', borderRadius:8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)', fontSize:'0.8rem' }}>Sem dados suficientes</div>}
              </div>

              {/* Linha de fluxo */}
              <div className="card">
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:16 }}>Fluxo Diário — Últimos 30 dias</div>
                {dadosFluxo.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={dadosFluxo}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fill:'var(--text-muted)', fontSize:10 }} interval={4} />
                      <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} unit="h" />
                      <Tooltip contentStyle={{ background:'var(--bg-2)', border:'1px solid var(--border-md)', borderRadius:8 }} formatter={(v:number)=>[`${v}h`,'Horas']} />
                      <Line type="monotone" dataKey="horas" stroke="#7c3aed" strokeWidth={2} dot={{ fill:'#7c3aed', r:3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)', fontSize:'0.8rem' }}>Sem dados suficientes</div>}
              </div>
            </div>

            {/* Tabela mensal */}
            <div className="card">
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:16 }}>Resumo por Mês</div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid var(--border)' }}>
                      {['Mês','Dias Trabalhados','Total de Horas','Média Diária'].map(h=>(
                        <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dadosMes.map((m,i)=>{
                      const mReg = registros.filter(r=>r.data.slice(0,7)===Object.entries({}).length.toString())
                      const totalMin = dadosMes[i] ? dadosMes[i].horas * 60 : 0
                      return (
                        <tr key={m.name} style={{ borderBottom:'1px solid var(--border)', transition:'background 0.15s' }}
                          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='var(--bg-hover)'}
                          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='none'}>
                          <td style={{ padding:'10px 12px', fontFamily:'var(--font-display)', fontWeight:700, color:'var(--text-primary)' }}>{m.name}</td>
                          <td style={{ padding:'10px 12px', color:'var(--text-secondary)', fontFamily:'var(--font-mono)' }}>—</td>
                          <td style={{ padding:'10px 12px', color:'var(--text-accent)', fontFamily:'var(--font-display)', fontWeight:700 }}>{m.horas}h</td>
                          <td style={{ padding:'10px 12px', color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>—</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {dadosMes.length === 0 && <div style={{ textAlign:'center', padding:24, color:'var(--text-muted)' }}>Nenhum dado registrado ainda</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══ Clock ══════════════════════════════════════════════════ */
function ClockDisplay() {
  const [time, setTime] = useState(new Date())
  const ref = useRef<ReturnType<typeof setInterval>|null>(null)
  useEffect(() => {
    ref.current = setInterval(()=>setTime(new Date()), 1000)
    return ()=>{ if(ref.current) clearInterval(ref.current) }
  }, [])
  const h = String(time.getHours()).padStart(2,'0')
  const m = String(time.getMinutes()).padStart(2,'0')
  const s = String(time.getSeconds()).padStart(2,'0')
  return (
    <div style={{ fontFamily:'var(--font-mono)', fontSize:'2.8rem', fontWeight:600, color:'var(--text-accent)', letterSpacing:'0.08em', marginBottom:6, lineHeight:1 }}>
      {h}<span style={{ opacity:0.4, animation:'blink 1s step-end infinite' }}>:</span>{m}<span style={{ fontSize:'1.4rem', opacity:0.5 }}>:{s}</span>
      <style>{`@keyframes blink{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
    </div>
  )
}

/* ═══ ManualForm ═════════════════════════════════════════════ */
function ManualForm({ initial, onSave, onCancel }: {
  initial?: Registro
  onSave: (data: string, ent: string, sai: string, obs: string, id?: string) => void
  onCancel?: () => void
}) {
  const [data, setData]   = useState(initial?.data ?? todayISO())
  const [ent, setEnt]     = useState(initial?.entrada ?? '')
  const [sai, setSai]     = useState(initial?.saida ?? '')
  const [obs, setObs]     = useState(initial?.observacao ?? '')
  const inp2 = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:7, color:'var(--text-primary)', fontFamily:'var(--font-body)', fontSize:'0.82rem', padding:'7px 10px' } as React.CSSProperties
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
        <div><label style={{ fontSize:'0.65rem', color:'var(--text-muted)', display:'block', marginBottom:4, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Data</label>
          <input type="date" style={{ ...inp2, width:'100%' }} value={data} onChange={e=>setData(e.target.value)} /></div>
        <div><label style={{ fontSize:'0.65rem', color:'var(--text-muted)', display:'block', marginBottom:4, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Entrada</label>
          <input type="time" style={{ ...inp2, width:'100%' }} value={ent} onChange={e=>setEnt(e.target.value)} /></div>
        <div><label style={{ fontSize:'0.65rem', color:'var(--text-muted)', display:'block', marginBottom:4, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Saída</label>
          <input type="time" style={{ ...inp2, width:'100%' }} value={sai} onChange={e=>setSai(e.target.value)} /></div>
      </div>
      <input type="text" style={{ ...inp2 }} placeholder="Observação (opcional)" value={obs} onChange={e=>setObs(e.target.value)} />
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        {onCancel && <button onClick={onCancel} style={{ padding:'6px 14px', borderRadius:7, border:'1px solid var(--border)', background:'none', color:'var(--text-muted)', fontFamily:'var(--font-display)', fontWeight:600, fontSize:'0.78rem', cursor:'pointer' }}>Cancelar</button>}
        <button onClick={()=>onSave(data,ent,sai,obs,initial?.id)} style={{ padding:'6px 14px', borderRadius:7, border:'1px solid rgba(0,229,255,0.3)', background:'rgba(0,229,255,0.08)', color:'var(--text-accent)', fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.78rem', cursor:'pointer' }}>Salvar</button>
      </div>
    </div>
  )
}
