import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { AGU_DISCIPLINAS, TOTAL_SUBTOPICOS } from '../editais/aguData'
import { useEditaisAGU } from '../../hooks/useEditaisAGU'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'
import { collection, query, orderBy, onSnapshot, doc, setDoc } from 'firebase/firestore'

interface Props { onNavigate: (id: string) => void }

interface Widget {
  id: string; col: number; row: number; w: number; h: number; visible: boolean
}
interface Layout {
  id: string; nome: string; widgets: Widget[]
}

const COLS = 12
const ROW_H = 108
const GAP = 14

const DEFAULT_WIDGETS: Widget[] = [
  { id: 'kpi-edital',          col: 0,  row: 0, w: 3,  h: 1, visible: true },
  { id: 'kpi-questoes',        col: 3,  row: 0, w: 3,  h: 1, visible: true },
  { id: 'kpi-acerto',          col: 6,  row: 0, w: 3,  h: 1, visible: true },
  { id: 'kpi-ponto',           col: 9,  row: 0, w: 3,  h: 1, visible: true },
  { id: 'agu-panel',           col: 0,  row: 1, w: 5,  h: 3, visible: true },
  { id: 'questoes-panel',      col: 5,  row: 1, w: 4,  h: 3, visible: true },
  { id: 'revisao-alertas',     col: 9,  row: 1, w: 3,  h: 3, visible: true },
  { id: 'contas-pagar',        col: 0,  row: 4, w: 4,  h: 3, visible: true },
  { id: 'concursos-dash',      col: 4,  row: 4, w: 4,  h: 3, visible: true },
  { id: 'prontuario-calendar', col: 8,  row: 4, w: 2,  h: 3, visible: true },
  { id: 'saude-widget',        col: 10, row: 4, w: 2,  h: 3, visible: true },
  { id: 'wishlist-widget',      col: 0,  row: 7, w: 4,  h: 3, visible: true },
  { id: 'modulos',             col: 4,  row: 7, w: 8,  h: 3, visible: true },
]

const WIDGET_LABELS: Record<string, string> = {
  'kpi-edital':          '📊 Progresso AGU',
  'kpi-questoes':        '📝 Questões',
  'kpi-acerto':          '🎯 % Acerto',
  'kpi-ponto':           '⊙ Horas Mês',
  'agu-panel':           '⚖ Painel AGU',
  'questoes-panel':      '◈ Questões',
  'revisao-alertas':     '🔔 Revisões AGU',
  'contas-pagar':        '⚠ Contas a Pagar',
  'concursos-dash':      '🎯 Concursos',
  'prontuario-calendar': '📅 Prazos ADM',
  'saude-widget':        '✚ Saúde',
  'wishlist-widget':     '🛒 Wishlist',
  'modulos':             '▦ Módulos',
}

// ─── Ring ─────────────────────────────────────────────────────────────────────
function RingGauge({ pct, color, size = 64 }: { pct: number; color: string; size?: number }) {
  const r = (size - 10) / 2, circ = 2 * Math.PI * r, dash = (pct / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-4)" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
        style={{ transition: 'stroke-dasharray 1s ease', filter: `drop-shadow(0 0 5px ${color})` }} />
    </svg>
  )
}

// ─── Hooks de dados ───────────────────────────────────────────────────────────
function usePontoStats() {
  const [registros, setRegistros] = useState<any[]>([])
  const uid = useUid()
  useEffect(() => {
    if (!uid || !db) return
    return onSnapshot(query(collection(db, `users/${uid}/ponto`), orderBy('data', 'desc')), snap =>
      setRegistros(snap.docs.map(d => d.data())))
  }, [uid])
  const hoje = new Date().toISOString().slice(0, 10)
  const mesAtual = hoje.slice(0, 7)
  const regHoje = registros.find(r => r.data === hoje)
  const minMes = registros.filter(r => r.data.startsWith(mesAtual)).reduce((a, r) => a + (r.minutos || 0), 0)
  return { emServico: !!(regHoje?.entrada && !regHoje?.saida), hMes: Math.floor(minMes / 60), mMes: minMes % 60 }
}

function useContasPagar() {
  const [contas, setContas] = useState<any[]>([])
  const uid = useUid()
  useEffect(() => {
    if (!uid || !db) return
    return onSnapshot(query(collection(db, `users/${uid}/contasPagar`), orderBy('vencimento', 'asc')), snap =>
      setContas(snap.docs.map(d => d.data())))
  }, [uid])
  const hoje = new Date().toISOString().slice(0, 10)
  const pendentes = contas.filter(c => !c.pago)
  const vencendo = pendentes.filter(c => { const d = Math.ceil((new Date(c.vencimento).getTime() - Date.now()) / 86400000); return d >= 0 && d <= 7 })
  const vencidas = pendentes.filter(c => new Date(c.vencimento).toISOString().slice(0,10) < hoje)
  return { contas: pendentes, vencendo, vencidas, totalPendente: pendentes.reduce((a: number, c: any) => a + (c.valor || 0), 0) }
}

function useConcursosDash() {
  const [concursos, setConcursos] = useState<any[]>([])
  const uid = useUid()
  useEffect(() => {
    if (!uid || !db) return
    return onSnapshot(collection(db, `users/${uid}/concursos`), snap => setConcursos(snap.docs.map(d => d.data())))
  }, [uid])
  const hoje = new Date().toISOString().slice(0, 10)
  const ativos = concursos.filter(c => c.status !== 'encerrado')
  const proximos = [...concursos].filter(c => c.dataProva && c.dataProva >= hoje).sort((a,b) => a.dataProva.localeCompare(b.dataProva)).slice(0, 3)
  return { concursos: ativos, proximos, total: concursos.length }
}

function useRevisaoAlertas() {
  const { data, getState } = useEditaisAGU()
  return useMemo(() => {
    const hoje = new Date(); hoje.setHours(0,0,0,0)
    const alertas: { id: string; nome: string; disciplina: string; dias: number }[] = []
    for (const disc of AGU_DISCIPLINAS) for (const t of disc.topicos) for (const s of t.subtopicos) {
      const st = getState(s.id)
      if (!st.ultimaRevisao) continue
      const dias = Math.floor((hoje.getTime() - new Date(st.ultimaRevisao+'T00:00:00').getTime()) / 86400000)
      if (dias >= 30) alertas.push({ id: s.id, nome: s.nome, disciplina: disc.nome, dias })
    }
    return alertas.sort((a, b) => b.dias - a.dias)
  }, [data, getState])
}

function useProntuarioDemandas() {
  const [demandas, setDemandas] = useState<any[]>([])
  const uid = useUid()
  useEffect(() => {
    if (!uid || !db) return
    return onSnapshot(collection(db, `users/${uid}/prontuario`), snap => setDemandas(snap.docs.map(d => d.data())))
  }, [uid])
  return demandas.filter(d => d.status !== 'concluida' && d.status !== 'cancelada' && d.prazo)
}

function useSaudeHoje() {
  const [reg, setReg] = useState<any>(null)
  const [todos, setTodos] = useState<any[]>([])
  const uid = useUid()
  useEffect(() => {
    if (!uid || !db) return
    const hoje = new Date().toISOString().slice(0, 10)
    return onSnapshot(collection(db, `users/${uid}/saude`), snap => {
      const list = snap.docs.map(d => d.data())
      setTodos(list)
      setReg(list.find((x: any) => x.data === hoje) || null)
    })
  }, [uid])
  const streak = (() => {
    let s = 0, d = new Date(); d.setHours(0,0,0,0)
    while(true) {
      const ds = d.toISOString().slice(0,10)
      if (!todos.find((r:any) => r.data === ds)) break
      s++; d.setDate(d.getDate()-1)
    }
    return s
  })()
  return { reg, streak }
}


// ─── useWishlistStats ─────────────────────────────────────────────────────────
function useWishlistStats() {
  const [itens, setItens] = useState<any[]>([])
  const [listas, setListas] = useState<any[]>([])
  const uid = useUid()
  useEffect(() => {
    if (!uid || !db) return
    const u1 = onSnapshot(collection(db, `users/${uid}/wishlist`), snap => setItens(snap.docs.map(d => d.data())))
    const u2 = onSnapshot(collection(db, `users/${uid}/listasCompras`), snap => setListas(snap.docs.map(d => d.data())))
    return () => { u1(); u2() }
  }, [uid])
  const pendentes = itens.filter(i => i.status !== 'comprado' && i.status !== 'cancelado')
  const prioritarios = pendentes.filter(i => i.prioridade === 'urgente' || i.prioridade === 'alta')
  const totalPendente = pendentes.reduce((a: number, i: any) => a + (i.preco || 0), 0)
  const listasAtivas = listas.filter(l => !l.concluida)
  return { pendentes, prioritarios, totalPendente, listasAtivas, totalItens: itens.length }
}

// ─── Layout multi ─────────────────────────────────────────────────────────────
function useLayouts() {
  const uid = useUid()
  const [layouts, setLayouts] = useState<Layout[]>([{ id: 'default', nome: 'Principal', widgets: DEFAULT_WIDGETS }])
  const [ativoId, setAtivoId] = useState('default')

  useEffect(() => {
    try {
      const s = localStorage.getItem('nexusos-dash-layouts')
      const a = localStorage.getItem('nexusos-dash-ativo')
      if (s) setLayouts(JSON.parse(s))
      if (a) setAtivoId(a)
    } catch {}
  }, [])

  useEffect(() => {
    if (!uid || !db) return
    return onSnapshot(doc(db, `users/${uid}/config/dashLayouts`), snap => {
      if (snap.exists()) {
        const d = snap.data()
        if (d.layouts) { setLayouts(d.layouts); localStorage.setItem('nexusos-dash-layouts', JSON.stringify(d.layouts)) }
        if (d.ativoId) { setAtivoId(d.ativoId); localStorage.setItem('nexusos-dash-ativo', d.ativoId) }
      }
    })
  }, [uid])

  const persist = useCallback(async (ls: Layout[], aid: string) => {
    localStorage.setItem('nexusos-dash-layouts', JSON.stringify(ls))
    localStorage.setItem('nexusos-dash-ativo', aid)
    if (uid && db) await setDoc(doc(db, `users/${uid}/config/dashLayouts`), { layouts: ls, ativoId: aid })
  }, [uid])

  const ativo = layouts.find(l => l.id === ativoId) || layouts[0]

  const saveWidgets = useCallback((widgets: Widget[]) => {
    const updated = layouts.map(l => l.id === ativoId ? { ...l, widgets } : l)
    setLayouts(updated)
    persist(updated, ativoId)
  }, [layouts, ativoId, persist])

  const novoLayout = useCallback((nome: string) => {
    const id = Math.random().toString(36).slice(2, 8)
    const nl: Layout = { id, nome, widgets: JSON.parse(JSON.stringify(DEFAULT_WIDGETS)) }
    const updated = [...layouts, nl]
    setLayouts(updated)
    setAtivoId(id)
    persist(updated, id)
  }, [layouts, persist])

  const deletarLayout = useCallback((id: string) => {
    if (layouts.length <= 1) return
    const updated = layouts.filter(l => l.id !== id)
    const newAtivo = updated[0].id
    setLayouts(updated)
    setAtivoId(newAtivo)
    persist(updated, newAtivo)
  }, [layouts, persist])

  const trocarLayout = useCallback((id: string) => {
    setAtivoId(id)
    localStorage.setItem('nexusos-dash-ativo', id)
    if (uid && db) setDoc(doc(db, `users/${uid}/config/dashLayouts`), { layouts, ativoId: id })
  }, [layouts, uid])

  const resetar = useCallback(() => {
    const updated = layouts.map(l => l.id === ativoId ? { ...l, widgets: DEFAULT_WIDGETS } : l)
    setLayouts(updated)
    persist(updated, ativoId)
  }, [layouts, ativoId, persist])

  const duplicarWidget = useCallback((wid: string) => {
    const w = ativo.widgets.find(x => x.id === wid)
    if (!w) return
    const newW: Widget = { ...w, id: `${wid}-${Math.random().toString(36).slice(2,6)}`, row: w.row + w.h }
    saveWidgets([...ativo.widgets, newW])
  }, [ativo, saveWidgets])

  return { layouts, ativo, ativoId, saveWidgets, novoLayout, deletarLayout, trocarLayout, resetar, duplicarWidget }
}

// ─── DraggableWidget ──────────────────────────────────────────────────────────
function DraggableWidget({ widget, editing, gridW, onMove, onResize, children }: {
  widget: Widget; editing: boolean; gridW: number
  onMove: (id: string, col: number, row: number) => void
  onResize: (id: string, w: number, h: number) => void
  children: React.ReactNode
}) {
  const colW = gridW / COLS
  const left = widget.col * colW + widget.col * (GAP / COLS)
  const top = widget.row * (ROW_H + GAP)
  const width = widget.w * colW + (widget.w - 1) * (GAP / COLS)
  const height = widget.h * ROW_H + (widget.h - 1) * GAP
  const dragRef = useRef<{ startX:number; startY:number; col:number; row:number }|null>(null)
  const resRef  = useRef<{ startX:number; startY:number; w:number; h:number }|null>(null)

  const startDrag = useCallback((e: React.PointerEvent) => {
    if (!editing) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, col: widget.col, row: widget.row }
  }, [editing, widget.col, widget.row])
  const moveDrag = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dc = Math.round((e.clientX - dragRef.current.startX) / (colW + GAP/COLS))
    const dr = Math.round((e.clientY - dragRef.current.startY) / (ROW_H + GAP))
    onMove(widget.id, Math.max(0, Math.min(COLS-widget.w, dragRef.current.col+dc)), Math.max(0, dragRef.current.row+dr))
  }, [colW, widget.w, widget.id, onMove])
  const endDrag = useCallback(() => { dragRef.current = null }, [])

  const startRes = useCallback((e: React.PointerEvent) => {
    if (!editing) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId)
    resRef.current = { startX: e.clientX, startY: e.clientY, w: widget.w, h: widget.h }
  }, [editing, widget.w, widget.h])
  const moveRes = useCallback((e: React.PointerEvent) => {
    if (!resRef.current) return
    const nw = Math.max(2, Math.min(COLS-widget.col, resRef.current.w + Math.round((e.clientX-resRef.current.startX)/(colW+GAP/COLS))))
    const nh = Math.max(1, resRef.current.h + Math.round((e.clientY-resRef.current.startY)/(ROW_H+GAP)))
    onResize(widget.id, nw, nh)
  }, [colW, widget.col, widget.id, onResize])
  const endRes = useCallback(() => { resRef.current = null }, [])

  return (
    <div style={{ position:'absolute', left, top, width, height, transition: editing?'none':'left 0.25s ease,top 0.25s ease,width 0.25s ease,height 0.25s ease', zIndex: editing?5:1, boxSizing:'border-box' }}>
      {editing && (
        <div onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
          style={{ position:'absolute',top:0,left:0,right:0,height:30,cursor:'grab',zIndex:10,touchAction:'none',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(180deg,rgba(0,229,255,0.12) 0%,transparent 100%)',borderRadius:'12px 12px 0 0',userSelect:'none' }}>
          <div style={{ display:'flex',gap:3 }}>{[0,1,2,3,4,5].map(i=><div key={i} style={{ width:3,height:3,borderRadius:'50%',background:'rgba(0,229,255,0.55)' }}/>)}</div>
          <span style={{ fontSize:'0.55rem',color:'rgba(0,229,255,0.4)',fontFamily:'var(--font-mono)',marginLeft:8 }}>{widget.w}×{widget.h}</span>
        </div>
      )}
      <div style={{ width:'100%',height:'100%',overflow:'hidden',borderRadius:12,border:editing?'1px solid rgba(0,229,255,0.25)':'none',boxShadow:editing?'0 0 0 2px rgba(0,229,255,0.08)':'' }}>{children}</div>
      {editing && (
        <div onPointerDown={startRes} onPointerMove={moveRes} onPointerUp={endRes} onPointerCancel={endRes}
          style={{ position:'absolute',bottom:0,right:0,width:22,height:22,cursor:'nwse-resize',zIndex:10,touchAction:'none',display:'flex',alignItems:'flex-end',justifyContent:'flex-end',padding:5 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 10L10 2M5 10L10 5M8 10L10 8" stroke="rgba(0,229,255,0.65)" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
      )}
    </div>
  )
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: { label:string; value:string|number; sub:string; color:string }) {
  return (
    <div className="kpi-card" style={{ '--kpi-color':color, height:'100%', boxSizing:'border-box' } as React.CSSProperties}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color, fontSize:'clamp(1.2rem,2.5vw,2rem)' }}>{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}

// ─── AguPanel ─────────────────────────────────────────────────────────────────
function AguPanel({ global, lastFinalized, discStats, onNavigate }: any) {
  return (
    <div className="card" style={{ padding:0,overflow:'hidden',height:'100%',boxSizing:'border-box',display:'flex',flexDirection:'column' }}>
      <div style={{ padding:'12px 16px',borderBottom:'1px solid var(--border)',background:'linear-gradient(90deg,rgba(0,229,255,0.04)0%,transparent 100%)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexShrink:0 }}>
        <div>
          <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:1 }}>⚖ Edital AGU</div>
          <div style={{ fontSize:'0.68rem',color:'var(--text-muted)' }}>14 disciplinas · {TOTAL_SUBTOPICOS} subtópicos</div>
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:8,flexShrink:0 }}>
          <RingGauge pct={global.pctConcluido} color="#00e5ff" size={52} />
          <div>
            <div style={{ fontFamily:'var(--font-display)',fontSize:'1.3rem',fontWeight:800,color:'#00e5ff',lineHeight:1 }}>{global.pctConcluido}%</div>
            <div style={{ fontSize:'0.58rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em' }}>concluído</div>
          </div>
        </div>
      </div>
      {lastFinalized && (
        <div style={{ padding:'7px 16px',borderBottom:'1px solid var(--border)',background:'rgba(16,185,129,0.03)',display:'flex',alignItems:'center',gap:7,flexShrink:0 }}>
          <span style={{ color:'#10b981',fontSize:'0.8rem' }}>✓</span>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:'0.62rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em' }}>Último concluído · {lastFinalized.data}</div>
            <div style={{ fontSize:'0.75rem',color:'var(--text-primary)',fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{lastFinalized.nome}</div>
          </div>
        </div>
      )}
      <div style={{ padding:'8px 16px',flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:5 }}>
        {discStats.map((d: any) => (
          <div key={d.id} style={{ display:'grid',gridTemplateColumns:'1fr 90px 32px',alignItems:'center',gap:7 }}>
            <div style={{ fontSize:'0.7rem',color:'var(--text-secondary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{d.nome.replace('Direito ','')}</div>
            <div className="progress-track"><div className="progress-fill" style={{ width:`${d.pctConcluido}%`,background:d.cor,color:d.cor }}/></div>
            <div style={{ fontSize:'0.65rem',fontWeight:700,color:d.cor,textAlign:'right',fontFamily:'var(--font-mono)' }}>{d.pctConcluido}%</div>
          </div>
        ))}
      </div>
      <div style={{ padding:'8px 16px',borderTop:'1px solid var(--border)',flexShrink:0 }}>
        <button className="btn btn-accent" onClick={() => onNavigate('editais')} style={{ width:'100%',justifyContent:'center',fontSize:'0.78rem' }}>⚖ Abrir Editais AGU</button>
      </div>
    </div>
  )
}

// ─── QuestoesPanel ────────────────────────────────────────────────────────────
function QuestoesPanel({ global, discStats, onNavigate }: any) {
  const worst = [...discStats].filter((d:any)=>d.questoes>0).sort((a:any,b:any)=>a.pctAcerto-b.pctAcerto).slice(0,3)
  return (
    <div className="card" style={{ padding:0,overflow:'hidden',height:'100%',boxSizing:'border-box',display:'flex',flexDirection:'column' }}>
      <div style={{ padding:'12px 16px',borderBottom:'1px solid var(--border)',background:'linear-gradient(90deg,rgba(124,58,237,0.04)0%,transparent 100%)',display:'flex',alignItems:'center',gap:12,flexShrink:0 }}>
        <RingGauge pct={global.questoes>0?global.pctAcerto:0} color="#7c3aed" size={48} />
        <div>
          <div style={{ fontFamily:'var(--font-display)',fontSize:'1.4rem',fontWeight:800,color:'#7c3aed',lineHeight:1 }}>{global.questoes>0?`${global.pctAcerto}%`:'—'}</div>
          <div style={{ fontSize:'0.65rem',color:'var(--text-muted)',marginTop:2 }}>{global.questoes}q · {global.acertos} acertos</div>
        </div>
      </div>
      <div style={{ padding:'8px 16px',flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:6 }}>
        {discStats.filter((d:any)=>d.questoes>0).length===0
          ? <div style={{ textAlign:'center',padding:'20px 0',color:'var(--text-muted)',fontSize:'0.75rem' }}>Nenhuma questão registrada.<br/><span style={{ color:'var(--text-accent)',cursor:'pointer' }} onClick={()=>onNavigate('editais')}>→ Registrar</span></div>
          : discStats.filter((d:any)=>d.questoes>0).map((d:any)=>(
            <div key={d.id}>
              <div style={{ display:'flex',justifyContent:'space-between',marginBottom:2 }}>
                <span style={{ fontSize:'0.7rem',color:'var(--text-secondary)' }}>{d.nome.replace('Direito ','')}</span>
                <span style={{ fontSize:'0.7rem',fontFamily:'var(--font-mono)',color:d.cor,fontWeight:700 }}>{d.pctAcerto}%</span>
              </div>
              <div className="progress-track"><div className="progress-fill" style={{ width:`${d.pctAcerto}%`,background:d.cor,color:d.cor }}/></div>
            </div>
          ))
        }
      </div>
      {worst.length>0&&(
        <div style={{ padding:'8px 16px',borderTop:'1px solid var(--border)',background:'rgba(239,68,68,0.02)',flexShrink:0 }}>
          <div style={{ fontSize:'0.6rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4,fontFamily:'var(--font-mono)' }}>⚠ Atenção prioritária</div>
          {worst.map((d:any)=>(
            <div key={d.id} style={{ display:'flex',justifyContent:'space-between',fontSize:'0.7rem',padding:'1px 0' }}>
              <span style={{ color:'var(--text-secondary)' }}>{d.nome.replace('Direito ','')}</span>
              <span className="badge badge-red">{d.pctAcerto}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── RevisaoAlertasCard ───────────────────────────────────────────────────────
function RevisaoAlertasCard({ onNavigate }: { onNavigate:(id:string)=>void }) {
  const alertas = useRevisaoAlertas()
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? alertas : alertas.slice(0, 4)
  const urgColor = (dias:number) => {
    if (dias>=60) return { bg:'rgba(120,20,20,0.25)',border:'rgba(185,74,74,0.4)',badge:'#b94a4a' }
    if (dias>=45) return { bg:'rgba(120,80,10,0.2)', border:'rgba(196,124,46,0.4)',badge:'#c47c2e' }
    return             { bg:'rgba(90,70,10,0.18)',  border:'rgba(160,140,50,0.3)',badge:'#a09550' }
  }
  return (
    <div className="card" style={{ padding:0,overflow:'hidden',height:'100%',boxSizing:'border-box',display:'flex',flexDirection:'column' }}>
      <div style={{ padding:'12px 16px',borderBottom:'1px solid var(--border)',background:'linear-gradient(90deg,rgba(251,191,36,0.05)0%,transparent 100%)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0 }}>
        <div>
          <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:1 }}>🔔 Revisões AGU</div>
          <div style={{ fontSize:'0.65rem',color:'var(--text-muted)' }}>+30 dias sem revisar</div>
        </div>
        {alertas.length>0&&<div style={{ padding:'2px 9px',borderRadius:20,background:'rgba(251,191,36,0.15)',border:'1px solid rgba(251,191,36,0.3)',fontSize:'0.72rem',fontWeight:800,color:'#fbbf24' }}>{alertas.length}</div>}
      </div>
      <div style={{ flex:1,overflowY:'auto',padding:'8px 0' }}>
        {alertas.length===0
          ? <div style={{ textAlign:'center',padding:'24px 16px',color:'var(--text-muted)',fontSize:'0.78rem' }}><div style={{ fontSize:'1.4rem',marginBottom:8 }}>✅</div>Tudo em dia!</div>
          : <>
            {visible.map(a=>{
              const c=urgColor(a.dias)
              return (
                <div key={a.id} style={{ margin:'0 10px 6px',padding:'7px 10px',borderRadius:8,background:c.bg,border:`1px solid ${c.border}`,display:'flex',alignItems:'center',gap:8 }}>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:'0.72rem',fontWeight:600,color:'var(--text-primary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{a.nome}</div>
                    <div style={{ fontSize:'0.62rem',color:'var(--text-muted)',marginTop:1 }}>{a.disciplina.replace('Direito ','')}</div>
                  </div>
                  <div style={{ flexShrink:0,padding:'2px 7px',borderRadius:12,background:`${c.badge}25`,border:`1px solid ${c.badge}50`,fontSize:'0.65rem',fontWeight:800,color:c.badge }}>{a.dias}d</div>
                </div>
              )
            })}
            {alertas.length>4&&<button onClick={()=>setExpanded(e=>!e)} style={{ display:'block',width:'calc(100% - 20px)',margin:'0 10px',padding:'5px',borderRadius:7,border:'1px solid var(--border)',background:'none',color:'var(--text-muted)',fontSize:'0.68rem',cursor:'pointer',fontFamily:'var(--font-display)',fontWeight:600 }}>{expanded?'▲ Recolher':`▼ +${alertas.length-4} alertas`}</button>}
          </>
        }
      </div>
      <div style={{ padding:'8px 16px',borderTop:'1px solid var(--border)',flexShrink:0 }}>
        <button onClick={()=>onNavigate('editais')} style={{ width:'100%',padding:'7px',borderRadius:7,border:'1px solid rgba(251,191,36,0.25)',background:'rgba(251,191,36,0.05)',color:'#d4a820',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.75rem',cursor:'pointer' }}>Abrir Editais →</button>
      </div>
    </div>
  )
}

// ─── ContasPagarCard ──────────────────────────────────────────────────────────
function ContasPagarCard({ onNavigate }: { onNavigate:(id:string)=>void }) {
  const { contas, vencendo, vencidas, totalPendente } = useContasPagar()
  const fmt = (v:number) => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
  const fmtD = (d:string) => { const[,m,dd]=d.split('-'); return `${dd}/${m}` }
  const days = (d:string) => Math.ceil((new Date(d).getTime()-Date.now())/86400000)
  return (
    <div className="card" style={{ padding:0,overflow:'hidden',height:'100%',boxSizing:'border-box',display:'flex',flexDirection:'column' }}>
      <div style={{ padding:'12px 16px',borderBottom:'1px solid var(--border)',background:'linear-gradient(90deg,rgba(245,158,11,0.05)0%,transparent 100%)',flexShrink:0 }}>
        <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6 }}>⚠ Contas a Pagar</div>
        <div style={{ display:'flex',gap:12,alignItems:'baseline',flexWrap:'wrap' }}>
          <div>
            <div style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1.3rem',color:'#f59e0b',lineHeight:1 }}>{fmt(totalPendente)}</div>
            <div style={{ fontSize:'0.65rem',color:'var(--text-muted)',marginTop:2 }}>{contas.length} pendente{contas.length!==1?'s':''}</div>
          </div>
          {vencidas.length>0&&<div style={{ padding:'3px 10px',borderRadius:20,background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',fontSize:'0.7rem',fontWeight:700,color:'#ef4444' }}>{vencidas.length} vencida{vencidas.length>1?'s':''}</div>}
          {vencendo.length>0&&<div style={{ padding:'3px 10px',borderRadius:20,background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.3)',fontSize:'0.7rem',fontWeight:700,color:'#f59e0b' }}>{vencendo.length} vencendo</div>}
        </div>
      </div>
      <div style={{ flex:1,overflowY:'auto',padding:'8px 0' }}>
        {contas.length===0
          ? <div style={{ textAlign:'center',padding:'24px 0',color:'var(--text-muted)',fontSize:'0.78rem' }}>Nenhuma conta pendente</div>
          : contas.slice(0,8).map((c:any,i:number)=>{
            const d=days(c.vencimento); const venc=d<0; const urg=d>=0&&d<=3
            const cor=venc?'#ef4444':urg?'#f59e0b':'var(--text-secondary)'
            return (
              <div key={c.id??i} style={{ display:'flex',alignItems:'center',gap:10,padding:'7px 16px',borderBottom:'1px solid var(--border)' }}>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:'0.8rem',fontWeight:600,color:'var(--text-primary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{c.descricao}</div>
                  <div style={{ fontSize:'0.68rem',color:cor,marginTop:1 }}>{venc?'⚠ VENCIDA':urg?`⏰ ${d}d`:fmtD(c.vencimento)}{c.categoria?` · ${c.categoria}`:''}</div>
                </div>
                <div style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:'0.85rem',color:cor,flexShrink:0 }}>{fmt(c.valor)}</div>
              </div>
            )
          })
        }
      </div>
      <div style={{ padding:'8px 16px',borderTop:'1px solid var(--border)',flexShrink:0 }}>
        <button onClick={()=>onNavigate('financeiro')} style={{ width:'100%',padding:'7px',borderRadius:7,border:'1px solid rgba(245,158,11,0.3)',background:'rgba(245,158,11,0.06)',color:'#f59e0b',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.75rem',cursor:'pointer' }}>Ver Financeiro →</button>
      </div>
    </div>
  )
}

// ─── ConcursosDashCard ────────────────────────────────────────────────────────
function ConcursosDashCard({ onNavigate }: { onNavigate:(id:string)=>void }) {
  const { concursos, proximos, total } = useConcursosDash()
  const fmtD = (d:string) => { const[y,m,dd]=d.split('-'); return `${dd}/${m}/${y}` }
  const days = (d:string) => Math.ceil((new Date(d).getTime()-Date.now())/86400000)
  const SC: Record<string,string> = { previsto:'#64748b',edital:'#3b82f6',inscricoes:'#10b981',provas:'#f59e0b',resultado:'#8b5cf6',encerrado:'#6b7280' }
  const SL: Record<string,string> = { previsto:'Previsto',edital:'Com Edital',inscricoes:'Inscrições',provas:'Em Provas',resultado:'Resultado',encerrado:'Encerrado' }
  return (
    <div className="card" style={{ padding:0,overflow:'hidden',height:'100%',boxSizing:'border-box',display:'flex',flexDirection:'column' }}>
      <div style={{ padding:'12px 16px',borderBottom:'1px solid var(--border)',background:'linear-gradient(90deg,rgba(124,58,237,0.05)0%,transparent 100%)',flexShrink:0 }}>
        <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6 }}>🎯 Concursos</div>
        <div style={{ display:'flex',gap:16 }}>
          {[{v:total,l:'cadastrados',c:'#7c3aed'},{v:concursos.filter((c:any)=>c.status==='inscricoes').length,l:'inscrições abertas',c:'#10b981'},{v:proximos.length,l:'provas próximas',c:'#f59e0b'}].map(s=>(
            <div key={s.l}><div style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1.3rem',color:s.c,lineHeight:1 }}>{s.v}</div><div style={{ fontSize:'0.65rem',color:'var(--text-muted)',marginTop:2 }}>{s.l}</div></div>
          ))}
        </div>
      </div>
      <div style={{ flex:1,overflowY:'auto',padding:'8px 0' }}>
        {concursos.length===0
          ? <div style={{ textAlign:'center',padding:'24px 0',color:'var(--text-muted)',fontSize:'0.78rem' }}>Nenhum concurso cadastrado</div>
          : concursos.slice(0,5).map((c:any,i:number)=>{
            const cor=SC[c.status]??'#64748b'; const dp=c.dataProva?days(c.dataProva):null
            return (
              <div key={c.id??i} style={{ padding:'8px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'flex-start',gap:10 }}>
                <div style={{ width:3,borderRadius:2,alignSelf:'stretch',background:cor,flexShrink:0,marginTop:2 }}/>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:3 }}>
                    <span style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.82rem',color:'var(--text-primary)' }}>{c.orgao||c.nome||'—'}</span>
                    <span style={{ fontSize:'0.62rem',padding:'1px 6px',borderRadius:10,background:`${cor}22`,color:cor,border:`1px solid ${cor}44`,fontWeight:700,flexShrink:0 }}>{SL[c.status]??c.status}</span>
                  </div>
                  <div style={{ display:'flex',gap:10,flexWrap:'wrap' }}>
                    {c.dataProva&&<span style={{ fontSize:'0.68rem',color:dp!==null&&dp<=30?'#f59e0b':'var(--text-muted)' }}>📅 {fmtD(c.dataProva)}{dp!==null&&dp>=0?` (${dp}d)`:''}</span>}
                    {c.remuneracao&&<span style={{ fontSize:'0.68rem',color:'#10b981' }}>💰 {c.remuneracao}</span>}
                  </div>
                </div>
              </div>
            )
          })
        }
      </div>
      <div style={{ padding:'8px 16px',borderTop:'1px solid var(--border)',flexShrink:0 }}>
        <button onClick={()=>onNavigate('concursos')} style={{ width:'100%',padding:'7px',borderRadius:7,border:'1px solid rgba(124,58,237,0.3)',background:'rgba(124,58,237,0.06)',color:'#a78bfa',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.75rem',cursor:'pointer' }}>Ver Concursos →</button>
      </div>
    </div>
  )
}

// ─── ProntuarioCalendarCard ───────────────────────────────────────────────────
function ProntuarioCalendarCard({ onNavigate }: { onNavigate:(id:string)=>void }) {
  const demandas = useProntuarioDemandas()
  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth())
  const [ano, setAno] = useState(hoje.getFullYear())
  const MESES=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const DIAS=['D','S','T','Q','Q','S','S']
  const pColor=(dias:number)=>dias<=0?'#ef4444':dias<=10?'#f87171':dias<=15?'#fbbf24':'#6ee7a0'
  const dR=(p:string)=>{ const h=new Date();h.setHours(0,0,0,0);return Math.ceil((new Date(p+'T00:00:00').getTime()-h.getTime())/86400000) }
  const evs:Record<number,any[]>={}
  demandas.forEach(d=>{ if(!d.prazo)return;const dp=new Date(d.prazo+'T00:00:00');if(dp.getMonth()===mes&&dp.getFullYear()===ano){const dia=dp.getDate();if(!evs[dia])evs[dia]=[];evs[dia].push(d)} })
  const cells=[...Array(new Date(ano,mes,1).getDay()).fill(null),...Array.from({length:new Date(ano,mes+1,0).getDate()},(_,i)=>i+1)]
  const proximos=[...demandas].map(d=>({...d,dias:dR(d.prazo)})).sort((a,b)=>a.dias-b.dias).slice(0,3)
  return (
    <div className="card" style={{ padding:0,overflow:'hidden',height:'100%',boxSizing:'border-box',display:'flex',flexDirection:'column' }}>
      <div style={{ padding:'10px 12px',borderBottom:'1px solid var(--border)',background:'linear-gradient(90deg,rgba(91,91,214,0.05)0%,transparent 100%)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0 }}>
        <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em' }}>📅 Prazos ADM</div>
        <div style={{ display:'flex',alignItems:'center',gap:4 }}>
          <button onClick={()=>mes===0?(setMes(11),setAno(a=>a-1)):setMes(m=>m-1)} style={{ width:20,height:20,borderRadius:4,border:'1px solid var(--border)',background:'none',color:'var(--text-muted)',fontSize:'0.75rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>‹</button>
          <span style={{ fontSize:'0.6rem',fontFamily:'var(--font-mono)',color:'var(--text-secondary)',minWidth:40,textAlign:'center' }}>{MESES[mes]}/{ano.toString().slice(2)}</span>
          <button onClick={()=>mes===11?(setMes(0),setAno(a=>a+1)):setMes(m=>m+1)} style={{ width:20,height:20,borderRadius:4,border:'1px solid var(--border)',background:'none',color:'var(--text-muted)',fontSize:'0.75rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>›</button>
        </div>
      </div>
      <div style={{ padding:'8px 10px',flexShrink:0 }}>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:1,marginBottom:3 }}>
          {DIAS.map((d,i)=><div key={i} style={{ textAlign:'center',fontSize:'0.55rem',fontWeight:700,color:'var(--text-muted)' }}>{d}</div>)}
        </div>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:1 }}>
          {cells.map((dia,i)=>{
            if(!dia)return <div key={i}/>
            const ev=evs[dia]||[]; const isH=dia===hoje.getDate()&&mes===hoje.getMonth()&&ano===hoje.getFullYear()
            const cor=ev.length>0?pColor(dR(ev[0].prazo)):undefined
            return (
              <div key={i} style={{ minHeight:20,borderRadius:3,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:isH?'rgba(91,91,214,0.25)':ev.length?`${cor}18`:'transparent',border:`1px solid ${isH?'rgba(91,91,214,0.5)':ev.length?`${cor}35`:'transparent'}` }}>
                <span style={{ fontSize:'0.58rem',color:isH?'#a5a3f5':cor??'var(--text-muted)',fontWeight:isH||ev.length?700:400 }}>{dia}</span>
                {ev.length>0&&<div style={{ width:3,height:3,borderRadius:'50%',background:cor,marginTop:1 }}/>}
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ flex:1,overflowY:'auto',padding:'0 10px 6px' }}>
        {proximos.length===0
          ? <div style={{ textAlign:'center',padding:'10px 0',fontSize:'0.68rem',color:'var(--text-muted)' }}>Sem prazos</div>
          : proximos.map((d:any)=>{ const cor=pColor(d.dias); return (
            <div key={d.id} style={{ display:'flex',alignItems:'center',gap:6,padding:'4px 6px',marginBottom:3,borderRadius:6,background:`${cor}10`,border:`1px solid ${cor}20` }}>
              <div style={{ width:5,height:5,borderRadius:'50%',background:cor,flexShrink:0 }}/>
              <span style={{ flex:1,fontSize:'0.65rem',color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{d.titulo}</span>
              <span style={{ fontSize:'0.6rem',fontWeight:800,color:cor,flexShrink:0 }}>{d.dias<=0?'Venc.':`${d.dias}d`}</span>
            </div>
          )})
        }
      </div>
      <div style={{ padding:'6px 10px',borderTop:'1px solid var(--border)',flexShrink:0 }}>
        <button onClick={()=>onNavigate('prontuario')} style={{ width:'100%',padding:'5px',borderRadius:6,border:'1px solid rgba(91,91,214,0.3)',background:'rgba(91,91,214,0.06)',color:'#a5a3f5',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.68rem',cursor:'pointer' }}>Prontuário →</button>
      </div>
    </div>
  )
}

// ─── SaudeWidget ──────────────────────────────────────────────────────────────
function SaudeWidget({ onNavigate }: { onNavigate:(id:string)=>void }) {
  const { reg, streak } = useSaudeHoje()
  const cS=(i:string,f:string)=>{ if(!i||!f)return 0;const[ih,im]=i.split(':').map(Number);const[fh,fm]=f.split(':').map(Number);let m=(fh*60+fm)-(ih*60+im);if(m<0)m+=1440;return Math.round(m/60*10)/10 }
  const score=reg?Math.round((((reg.humor-1)/4)*10*0.25)+(((reg.energia-1)/4)*10*0.2)+(Math.min(cS(reg.sono?.inicio,reg.sono?.fim)/8,1)*10*0.25)+(reg.treino?.realizado?10:0)*0.15+(Math.min(reg.agua/(reg.metaAgua||2000),1)*10*0.15)):0
  const cor=score>=8?'#6ee7a0':score>=6?'#fbbf24':score>=4?'#f87171':'#a78bfa'
  const pctAgua=reg?Math.min((reg.agua/(reg.metaAgua||2000))*100,100):0
  const sonoH=reg?cS(reg.sono?.inicio,reg.sono?.fim):0
  return (
    <div className="card" style={{ padding:0,overflow:'hidden',height:'100%',boxSizing:'border-box',display:'flex',flexDirection:'column' }}>
      <div style={{ padding:'10px 12px',borderBottom:'1px solid var(--border-md)',background:'linear-gradient(90deg,rgba(16,185,129,0.06)0%,transparent 100%)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em' }}>✚ Saúde Hoje</div>
        {streak>0&&<div style={{ fontSize:'0.6rem',color:'#f97316',fontWeight:700 }}>🔥{streak}d</div>}
      </div>
      <div style={{ flex:1,padding:'12px',display:'flex',flexDirection:'column',gap:8,overflowY:'auto' }}>
        {!reg
          ? <div style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8 }}>
              <div style={{ fontSize:'2rem' }}>✚</div>
              <p style={{ margin:0,fontSize:'0.7rem',color:'var(--text-muted)',textAlign:'center',lineHeight:1.4 }}>Sem registro hoje.<br/>Clique para registrar.</p>
            </div>
          : <>
            {/* Score ring */}
            <div style={{ display:'flex',alignItems:'center',gap:10 }}>
              <div style={{ width:52,height:52,borderRadius:14,background:`${cor}14`,border:`2px solid ${cor}40`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,flexDirection:'column' }}>
                <div style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1.3rem',color:cor,lineHeight:1 }}>{score}</div>
                <div style={{ fontSize:'0.48rem',color:cor,opacity:0.7,textTransform:'uppercase',letterSpacing:'0.06em' }}>score</div>
              </div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:'0.8rem',fontWeight:700,color:'var(--text-primary)',marginBottom:2 }}>{score>=8?'Excelente 🌟':score>=6?'Bom dia 👍':score>=4?'Atenção ⚠️':'Cuide-se 💜'}</div>
                <div style={{ display:'flex',gap:8,fontSize:'0.65rem',color:'var(--text-muted)' }}>
                  <span>{['😢','😕','😐','😊','😄'][reg.humor-1]} humor</span>
                  {sonoH>0&&<span>😴 {sonoH}h</span>}
                </div>
              </div>
            </div>
            {/* Água */}
            <div>
              <div style={{ display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:'0.62rem' }}>
                <span style={{ color:'var(--text-muted)' }}>💧 Água</span>
                <span style={{ color:'#60a5fa',fontWeight:700 }}>{reg.agua}ml / {reg.metaAgua||2000}ml</span>
              </div>
              <div style={{ height:5,borderRadius:3,background:'var(--bg-4)',overflow:'hidden' }}>
                <div style={{ height:'100%',width:`${pctAgua}%`,background:'linear-gradient(90deg,#3b82f6,#60a5fa)',borderRadius:3,transition:'width 0.5s',boxShadow:'0 0 6px #60a5fa80' }}/>
              </div>
            </div>
            {/* Grid métricas */}
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5 }}>
              {[
                { label:'Energia', val:['🪫','😴','⚡','🔋','🚀'][reg.energia-1] },
                { label:'Sono',    val:sonoH>0?`${sonoH}h`:'—' },
                { label:'Treino',  val:reg.treino?.realizado?'✅':'○' },
              ].map(m=>(
                <div key={m.label} style={{ padding:'5px 4px',borderRadius:7,background:'var(--surface)',border:'1px solid var(--border)',textAlign:'center' }}>
                  <div style={{ fontSize:'0.85rem',lineHeight:1 }}>{m.val}</div>
                  <div style={{ fontSize:'0.52rem',color:'var(--text-muted)',marginTop:2,textTransform:'uppercase',letterSpacing:'0.06em' }}>{m.label}</div>
                </div>
              ))}
            </div>
          </>
        }
      </div>
      <div style={{ padding:'6px 10px',borderTop:'1px solid var(--border-md)',flexShrink:0 }}>
        <button onClick={()=>onNavigate('saude')} style={{ width:'100%',padding:'6px',borderRadius:7,border:'1px solid rgba(16,185,129,0.35)',background:'rgba(16,185,129,0.07)',color:'#34d399',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.7rem',cursor:'pointer',transition:'all 0.15s' }}>Saúde & Bem-Estar →</button>
      </div>
    </div>
  )
}

// ─── WishlistWidget ───────────────────────────────────────────────────────────
function WishlistWidget({ onNavigate }: { onNavigate:(id:string)=>void }) {
  const { pendentes, prioritarios, totalPendente, listasAtivas } = useWishlistStats()
  const fmtM = (v:number) => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

  const PR_COLORS: Record<string,string> = { urgente:'#c45a5a', alta:'#c47c2e', media:'#b8a96a', baixa:'#6b9e7a' }
  const CAT_ICONS: Record<string,string> = {
    'Tecnologia':'💻','Vestuário':'👕','Casa & Decoração':'🏠','Livros & Educação':'📚',
    'Saúde & Beleza':'💊','Esportes':'⚽','Alimentação':'🍎','Viagem':'✈️','Lazer':'🎮','Outro':'📦',
  }

  return (
    <div className="card" style={{ padding:0,overflow:'hidden',height:'100%',boxSizing:'border-box',display:'flex',flexDirection:'column' }}>
      {/* Header */}
      <div style={{ padding:'12px 16px',borderBottom:'1px solid var(--border-md)',background:'linear-gradient(90deg,rgba(245,158,11,0.07)0%,transparent 100%)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0 }}>
        <div>
          <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:1 }}>🛒 Wishlist</div>
          <div style={{ fontSize:'0.65rem',color:'var(--text-muted)' }}>{pendentes.length} itens pendentes</div>
        </div>
        {totalPendente>0&&<div style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1rem',color:'#f59e0b' }}>{fmtM(totalPendente)}</div>}
      </div>

      {/* Corpo */}
      <div style={{ flex:1,overflowY:'auto',padding:'8px 0' }}>
        {pendentes.length===0
          ? <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:8,padding:'20px 16px' }}>
              <div style={{ fontSize:'2rem' }}>🛒</div>
              <p style={{ margin:0,fontSize:'0.72rem',color:'var(--text-muted)',textAlign:'center' }}>Wishlist vazia</p>
            </div>
          : <>
            {/* Prioritários */}
            {prioritarios.length>0&&(
              <div style={{ padding:'4px 14px 6px',marginBottom:2 }}>
                <div style={{ fontSize:'0.58rem',fontFamily:'var(--font-mono)',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:5 }}>🔥 Prioritários</div>
                {prioritarios.slice(0,3).map((item:any)=>{
                  const cor = PR_COLORS[item.prioridade]||'#f59e0b'
                  const icon = CAT_ICONS[item.categoria]||'📦'
                  return (
                    <div key={item.id} style={{ display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:9,background:`${cor}0e`,border:`1px solid ${cor}28`,marginBottom:5 }}>
                      <span style={{ fontSize:'0.9rem',flexShrink:0 }}>{icon}</span>
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ fontSize:'0.75rem',fontWeight:700,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.nome}</div>
                        <div style={{ fontSize:'0.6rem',color:'var(--text-muted)',marginTop:1 }}>{item.categoria}</div>
                      </div>
                      {item.preco>0&&<div style={{ fontSize:'0.72rem',fontWeight:800,color:cor,flexShrink:0 }}>{fmtM(item.preco)}</div>}
                    </div>
                  )
                })}
              </div>
            )}
            {/* Demais itens */}
            {pendentes.filter((i:any)=>i.prioridade!=='urgente'&&i.prioridade!=='alta').slice(0,4).map((item:any)=>{
              const icon = CAT_ICONS[item.categoria]||'📦'
              const stColors:Record<string,string>={desejado:'#6b9fd4',planejado:'#c4a84a',comprado:'#6b9e7a',cancelado:'#6a6a7a'}
              return (
                <div key={item.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'7px 16px',borderBottom:'1px solid var(--border)' }}>
                  <span style={{ fontSize:'1rem',flexShrink:0 }}>{icon}</span>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:'0.78rem',fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.nome}</div>
                    <div style={{ fontSize:'0.6rem',color:stColors[item.status]||'var(--text-muted)',marginTop:1,fontWeight:600 }}>{item.status==='desejado'?'💭 Desejado':item.status==='planejado'?'📋 Planejado':'💭'}</div>
                  </div>
                  {item.preco>0&&<div style={{ fontSize:'0.75rem',fontWeight:700,color:'#fbbf24',flexShrink:0 }}>{fmtM(item.preco)}</div>}
                </div>
              )
            })}
            {/* Listas ativas */}
            {listasAtivas.length>0&&(
              <div style={{ padding:'8px 16px 4px',borderTop:'1px solid var(--border)',marginTop:4 }}>
                <div style={{ fontSize:'0.58rem',fontFamily:'var(--font-mono)',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:5 }}>📝 Listas ativas</div>
                {listasAtivas.slice(0,2).map((lista:any)=>{
                  const pct = lista.itens?.length>0?Math.round((lista.itens.filter((i:any)=>i.comprado).length/lista.itens.length)*100):0
                  return (
                    <div key={lista.id} style={{ marginBottom:6 }}>
                      <div style={{ display:'flex',justifyContent:'space-between',fontSize:'0.72rem',marginBottom:3 }}>
                        <span style={{ color:'var(--text-secondary)',fontWeight:600 }}>{lista.nome}</span>
                        <span style={{ color:'var(--text-muted)' }}>{pct}%</span>
                      </div>
                      <div style={{ height:4,borderRadius:2,background:'var(--bg-4)',overflow:'hidden' }}>
                        <div style={{ height:'100%',width:`${pct}%`,background:'linear-gradient(90deg,#c47c2e,#f59e0b)',borderRadius:2,transition:'width 0.4s' }}/>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        }
      </div>

      {/* Footer */}
      <div style={{ padding:'8px 16px',borderTop:'1px solid var(--border-md)',flexShrink:0 }}>
        <button onClick={()=>onNavigate('wishlist')} style={{ width:'100%',padding:'7px',borderRadius:7,border:'1px solid rgba(245,158,11,0.3)',background:'rgba(245,158,11,0.06)',color:'#f59e0b',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.75rem',cursor:'pointer' }}>
          Wishlist & Compras →
        </button>
      </div>
    </div>
  )
}

// ─── ModulosCard ──────────────────────────────────────────────────────────────
function ModulosCard({ global, ponto, onNavigate }: any) {
  const modulos = [
    { id:'editais',    label:'Editais AGU',     icon:'⚖', desc:`${global.concluidos}/${TOTAL_SUBTOPICOS} subtópicos`, color:'#00e5ff' },
    { id:'concursos',  label:'Concursos',        icon:'🎯', desc:'Cadastro e acompanhamento',                          color:'#7c3aed' },
    { id:'prontuario', label:'Prontuário ADM',   icon:'📋', desc:'Demandas e prazos',                                  color:'#5b5bd6' },
    { id:'ponto',      label:'Ponto Eletrônico', icon:'⊙', desc:ponto.emServico?'🟢 Em serviço':`${ponto.hMes}h no mês`, color:'#f59e0b' },
    { id:'financeiro', label:'Financeiro',       icon:'◎', desc:'Receitas e despesas',                                 color:'#10b981' },
    { id:'saude',      label:'Saúde',            icon:'✚', desc:'Bem-estar diário',                                    color:'#34d399' },
    { id:'wishlist',   label:'Wishlist',         icon:'🛒', desc:'Lista de desejos & compras',                         color:'#f59e0b' },
    { id:'journal',    label:'Diário',           icon:'✦', desc:'Em breve',                                            color:'#ec4899' },
    { id:'media',      label:'Media Tracker',    icon:'▶', desc:'Em breve',                                            color:'#3b82f6' },
    { id:'gaming',     label:'Gaming Hub',       icon:'🎮', desc:'Em breve',                                           color:'#7c3aed' },
    { id:'links',      label:'Links',            icon:'🔗', desc:'Em breve',                                           color:'#00e5ff' },
  ]
  return (
    <div className="card" style={{ height:'100%',boxSizing:'border-box',display:'flex',flexDirection:'column' }}>
      <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.14em',marginBottom:12 }}>MÓDULOS</div>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))',gap:8,flex:1 }}>
        {modulos.map(m=>(
          <button key={m.id} onClick={()=>onNavigate(m.id)} className="card"
            style={{ display:'flex',alignItems:'center',gap:8,cursor:'pointer',background:'var(--card-bg)',border:'1px solid var(--border)',textAlign:'left',width:'100%',transition:'all 0.18s',padding:'8px 10px' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=m.color;(e.currentTarget as HTMLElement).style.boxShadow=`0 0 14px ${m.color}22`}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='';(e.currentTarget as HTMLElement).style.boxShadow=''}}>
            <span style={{ fontSize:'1.2rem',flexShrink:0 }}>{m.icon}</span>
            <div style={{ minWidth:0 }}>
              <div style={{ fontWeight:700,color:m.color,fontSize:'0.72rem',fontFamily:'var(--font-display)' }}>{m.label}</div>
              <div style={{ fontSize:'0.58rem',color:'var(--text-muted)',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{m.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function NexusDashboard({ onNavigate }: Props) {
  const hooks = useEditaisAGU()
  const ponto = usePontoStats()
  const { layouts, ativo, ativoId, saveWidgets, novoLayout, deletarLayout, trocarLayout, resetar, duplicarWidget } = useLayouts()
  const [editing, setEditing] = useState(false)
  const [showPanel, setShowPanel] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [showLayouts, setShowLayouts] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const [gridW, setGridW] = useState(900)

  useEffect(() => {
    const obs = new ResizeObserver(e => setGridW(e[0].contentRect.width))
    if (gridRef.current) obs.observe(gridRef.current)
    return () => obs.disconnect()
  }, [])

  const allIds = useMemo(() => AGU_DISCIPLINAS.flatMap(d => d.topicos.flatMap(t => t.subtopicos.map(s => s.id))), [])
  const global = hooks.getStats(allIds)
  const lastFinalized = useMemo(() => {
    let best: { nome:string;disc:string;data:string }|null = null
    for (const d of AGU_DISCIPLINAS) for (const t of d.topicos) for (const s of t.subtopicos) {
      const st = hooks.getState(s.id)
      if (st.dataFinalizacao && st.statusMaterial === 'concluido') {
        if (!best || st.dataFinalizacao > best.data) best = { nome: s.nome, disc: d.nome, data: st.dataFinalizacao }
      }
    }
    return best
  }, [hooks])
  const discStats = useMemo(() => AGU_DISCIPLINAS.map(d => {
    const ids = d.topicos.flatMap(t => t.subtopicos.map(s => s.id))
    return { ...d, ...hooks.getStats(ids), total: ids.length }
  }), [hooks])

  const handleMove = useCallback((id:string, col:number, row:number) => {
    saveWidgets(ativo.widgets.map(w => w.id===id ? {...w,col,row} : w))
  }, [ativo, saveWidgets])
  const handleResize = useCallback((id:string, nw:number, nh:number) => {
    saveWidgets(ativo.widgets.map(w => w.id===id ? {...w,w:nw,h:nh} : w))
  }, [ativo, saveWidgets])
  const toggleVisible = (id:string) => saveWidgets(ativo.widgets.map(w => w.id===id ? {...w,visible:!w.visible} : w))

  const maxRow = ativo.widgets.filter(w=>w.visible).reduce((a,w)=>Math.max(a,w.row+w.h),0)
  const gridH = maxRow * ROW_H + (maxRow-1) * GAP + 20
  const colW = gridW / COLS

  function renderWidget(w: Widget) {
    switch (w.id) {
      case 'kpi-edital':          return <KpiCard label="Progresso Edital"  value={`${global.pctConcluido}%`} sub={`${global.concluidos}/${TOTAL_SUBTOPICOS} subtópicos`} color="#00e5ff" />
      case 'kpi-questoes':        return <KpiCard label="Questões Feitas"   value={global.questoes||'—'} sub={`${global.acertos} acertos`} color="#7c3aed" />
      case 'kpi-acerto':          return <KpiCard label="% Acerto Geral"    value={global.questoes>0?`${global.pctAcerto}%`:'—'} sub="performance geral" color="#10b981" />
      case 'kpi-ponto':           return <KpiCard label="Horas no Mês"      value={`${ponto.hMes}h${ponto.mMes>0?` ${ponto.mMes}m`:''}`} sub={ponto.emServico?'🟢 Em serviço':'Ponto eletrônico'} color="#f59e0b" />
      case 'agu-panel':           return <AguPanel global={global} lastFinalized={lastFinalized} discStats={discStats} onNavigate={onNavigate} />
      case 'questoes-panel':      return <QuestoesPanel global={global} discStats={discStats} onNavigate={onNavigate} />
      case 'revisao-alertas':     return <RevisaoAlertasCard onNavigate={onNavigate} />
      case 'contas-pagar':        return <ContasPagarCard onNavigate={onNavigate} />
      case 'concursos-dash':      return <ConcursosDashCard onNavigate={onNavigate} />
      case 'prontuario-calendar': return <ProntuarioCalendarCard onNavigate={onNavigate} />
      case 'saude-widget':        return <SaudeWidget onNavigate={onNavigate} />
      case 'wishlist-widget':     return <WishlistWidget onNavigate={onNavigate} />
      case 'modulos':             return <ModulosCard global={global} ponto={ponto} onNavigate={onNavigate} />
      default: return null
    }
  }

  return (
    <div style={{ padding:'16px 20px',minHeight:'100%' }}>
      {/* Toolbar */}
      <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:16,flexWrap:'wrap' }}>
        <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.62rem',color:'var(--text-muted)',letterSpacing:'0.1em',textTransform:'uppercase',flex:1,minWidth:120 }}>
          Dashboard {editing&&<span style={{ color:'#f59e0b' }}>· Modo Edição</span>}
        </div>

        {/* Seletor de layouts */}
        <div style={{ position:'relative' }}>
          <button onClick={()=>setShowLayouts(s=>!s)} style={{ padding:'6px 12px',borderRadius:7,border:`1px solid ${showLayouts?'rgba(0,229,255,0.3)':'var(--border)'}`,background:showLayouts?'rgba(0,229,255,0.08)':'none',color:showLayouts?'var(--text-accent)':'var(--text-muted)',fontFamily:'var(--font-display)',fontWeight:600,fontSize:'0.75rem',cursor:'pointer',transition:'all 0.15s',display:'flex',alignItems:'center',gap:6 }}>
            ⊞ {ativo.nome} ▾
          </button>
          {showLayouts&&(
            <div style={{ position:'absolute',top:'calc(100% + 6px)',right:0,background:'var(--card-bg)',border:'1px solid var(--border)',borderRadius:12,padding:'8px',minWidth:200,zIndex:100,boxShadow:'0 12px 40px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize:'0.6rem',fontFamily:'var(--font-mono)',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6,paddingLeft:4 }}>Layouts salvos</div>
              {layouts.map(l=>(
                <div key={l.id} style={{ display:'flex',alignItems:'center',gap:4,marginBottom:2 }}>
                  <button onClick={()=>{trocarLayout(l.id);setShowLayouts(false)}} style={{ flex:1,textAlign:'left',padding:'6px 10px',borderRadius:7,border:`1px solid ${l.id===ativoId?'rgba(0,229,255,0.3)':'transparent'}`,background:l.id===ativoId?'rgba(0,229,255,0.08)':'transparent',color:l.id===ativoId?'var(--text-accent)':'var(--text-secondary)',fontSize:'0.8rem',cursor:'pointer',fontFamily:'var(--font-display)',fontWeight:l.id===ativoId?700:400 }}>
                    {l.id===ativoId?'◉ ':'○ '}{l.nome}
                  </button>
                  {layouts.length>1&&l.id!=='default'&&<button onClick={()=>deletarLayout(l.id)} style={{ width:22,height:22,borderRadius:5,border:'none',background:'rgba(239,68,68,0.08)',color:'rgba(239,68,68,0.5)',cursor:'pointer',fontSize:'0.7rem',display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>}
                </div>
              ))}
              <div style={{ borderTop:'1px solid var(--border)',marginTop:6,paddingTop:6,display:'flex',gap:6 }}>
                <input value={novoNome} onChange={e=>setNovoNome(e.target.value)} placeholder="Nome do layout..." style={{ flex:1,padding:'5px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text-primary)',fontSize:'0.75rem',outline:'none' }} onKeyDown={e=>{if(e.key==='Enter'&&novoNome.trim()){novoLayout(novoNome.trim());setNovoNome('');setShowLayouts(false)}}} />
                <button onClick={()=>{if(novoNome.trim()){novoLayout(novoNome.trim());setNovoNome('');setShowLayouts(false)}}} style={{ padding:'5px 10px',borderRadius:6,border:'none',background:'rgba(0,229,255,0.1)',color:'var(--text-accent)',fontSize:'0.75rem',cursor:'pointer',fontWeight:700 }}>+</button>
              </div>
            </div>
          )}
        </div>

        <button onClick={()=>setShowPanel(p=>!p)} style={{ padding:'6px 12px',borderRadius:7,border:`1px solid ${showPanel?'rgba(0,229,255,0.3)':'var(--border)'}`,background:showPanel?'rgba(0,229,255,0.08)':'none',color:showPanel?'var(--text-accent)':'var(--text-muted)',fontFamily:'var(--font-display)',fontWeight:600,fontSize:'0.75rem',cursor:'pointer',transition:'all 0.15s' }}>▦ Widgets</button>
        <button onClick={()=>setEditing(e=>!e)} style={{ padding:'6px 14px',borderRadius:7,border:`1px solid ${editing?'rgba(245,158,11,0.5)':'var(--border)'}`,background:editing?'rgba(245,158,11,0.12)':'none',color:editing?'#f59e0b':'var(--text-muted)',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.75rem',cursor:'pointer',transition:'all 0.15s' }}>{editing?'✓ Salvar Layout':'✎ Editar Layout'}</button>
        {editing&&<button onClick={resetar} style={{ padding:'6px 12px',borderRadius:7,border:'1px solid rgba(239,68,68,0.3)',background:'rgba(239,68,68,0.08)',color:'#f87171',fontFamily:'var(--font-display)',fontWeight:600,fontSize:'0.75rem',cursor:'pointer' }}>↺ Resetar</button>}
      </div>

      {/* Painel widgets */}
      {showPanel&&(
        <div style={{ background:'var(--card-bg)',border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',marginBottom:14 }}>
          <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.62rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8 }}>Mostrar / Ocultar / Duplicar Widgets</div>
          <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
            {ativo.widgets.map(w=>(
              <div key={w.id} style={{ display:'flex',alignItems:'center',gap:0,borderRadius:20,overflow:'hidden',border:`1px solid ${w.visible?'rgba(0,229,255,0.3)':'var(--border)'}` }}>
                <button onClick={()=>toggleVisible(w.id)} style={{ padding:'5px 12px',background:w.visible?'rgba(0,229,255,0.08)':'none',color:w.visible?'var(--text-accent)':'var(--text-muted)',fontFamily:'var(--font-display)',fontWeight:600,fontSize:'0.72rem',cursor:'pointer',border:'none',borderRight:'1px solid rgba(255,255,255,0.06)' }}>
                  {w.visible?'◉':'○'} {WIDGET_LABELS[w.id]??w.id}
                </button>
                <button onClick={()=>duplicarWidget(w.id)} title="Duplicar" style={{ padding:'5px 8px',background:'none',color:'var(--text-muted)',fontSize:'0.65rem',cursor:'pointer',border:'none' }}>⧉</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid */}
      <div ref={gridRef} style={{ position:'relative',width:'100%',height:gridH,minHeight:400 }}>
        {ativo.widgets.filter(w=>w.visible).map(w=>{
          const wPx=w.w*colW+Math.max(0,w.w-1)*GAP/COLS
          const hPx=w.h*ROW_H+Math.max(0,w.h-1)*GAP
          const leftPx=w.col*colW+Math.max(0,w.col)*GAP/COLS
          const topPx=w.row*(ROW_H+GAP)
          return (
            <DraggableWidget key={w.id} widget={{...w}} editing={editing} gridW={gridW} onMove={handleMove} onResize={handleResize}>
              <div style={{ width:wPx,height:hPx,left:leftPx,top:topPx }}>{renderWidget(w)}</div>
            </DraggableWidget>
          )
        })}
      </div>

      {editing&&<div style={{ textAlign:'center',padding:'12px 0',fontSize:'0.72rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)' }}>🖱 Arraste pelo topo · Redimensione no canto inferior direito · ⧉ Duplica o widget</div>}
    </div>
  )
}
