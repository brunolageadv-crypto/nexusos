import React from 'react'
import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { AGU_DISCIPLINAS, TOTAL_SUBTOPICOS } from '../editais/aguData'
import { useEditaisCadastrados, useEdital } from '../../hooks/useEdital'
import { useEditaisAGU } from '../../hooks/useEditaisAGU'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'
import { collection, query, orderBy, onSnapshot, doc, setDoc } from 'firebase/firestore'

interface Props { onNavigate: (id: string) => void; dashView?: 'widgets' | 'visual' }

interface Widget {
  id: string; col: number; row: number; w: number; h: number; visible: boolean
}
interface Layout {
  id: string; nome: string; widgets: Widget[]
}

const COLS = 12
const ROW_H = 108
const GAP = 14

// Detecta mobile para layout alternativo
function useIsMobile() {
  const [mobile, setMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}

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
  { id: 'gaming-widget',       col: 0,  row: 10, w: 4,  h: 3, visible: false },
  { id: 'media-widget',        col: 4,  row: 10, w: 4,  h: 3, visible: false },
  { id: 'diario-widget',       col: 8,  row: 10, w: 4,  h: 3, visible: false },
  { id: 'links-widget',        col: 0,  row: 13, w: 4,  h: 3, visible: false },
  { id: 'financeiro-widget',   col: 4,  row: 13, w: 4,  h: 3, visible: false },
  { id: 'concursos-widget',    col: 8,  row: 13, w: 4,  h: 3, visible: false },
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
  'gaming-widget':     '🎮 Gaming Hub',
  'media-widget':      '▶ Media Tracker',
  'diario-widget':     '✦ Diário',
  'links-widget':      '🔗 Links',
  'financeiro-widget': '◎ Financeiro',
  'concursos-widget':  '🎯 Concursos',
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

// ─── WidgetEditalDinamico — widget genérico para qualquer edital ─────────────
function WidgetEditalDinamico({ editalId, nome, cor, orgao, onNavigate }: {
  editalId: string; nome: string; cor: string; orgao: string
  onNavigate: (id: string) => void
}) {
  const hooks = useEdital(editalId)
  // Precisamos do total de subtópicos — buscamos do Firestore via onSnapshot
  const { editais } = useEditaisCadastrados()
  const edital = editais.find(e => e.id === editalId)
  const allIds = edital ? edital.disciplinas.flatMap((d: any) => d.topicos.flatMap((t: any) => t.subtopicos.map((s: any) => s.id))) : []
  const stats = hooks.getStats(allIds)
  const r = (stats.pctConcluido/100) * 2 * Math.PI * 20
  const circ = 2 * Math.PI * 20

  return (
    <div className="card" style={{ padding:0,overflow:'hidden',height:'100%',boxSizing:'border-box',display:'flex',flexDirection:'column' }}>
      <div style={{ height:3,background:`linear-gradient(90deg,${cor},${cor}44)` }}/>
      <div style={{ padding:'10px 14px',borderBottom:'1px solid var(--border-md)',background:`linear-gradient(90deg,${cor}08,transparent)`,flexShrink:0,display:'flex',alignItems:'center',gap:10 }}>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.58rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:1 }}>{orgao}</div>
          <div style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.8rem',color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{nome}</div>
        </div>
        <svg width={50} height={50} style={{ transform:'rotate(-90deg)',flexShrink:0 }}>
          <circle cx={25} cy={25} r={20} fill="none" stroke="var(--bg-4)" strokeWidth={4}/>
          <circle cx={25} cy={25} r={20} fill="none" stroke={cor} strokeWidth={4} strokeLinecap="round"
            strokeDasharray={`${r} ${circ}`} style={{ transition:'stroke-dasharray 1s ease',filter:`drop-shadow(0 0 4px ${cor})` }}/>
        </svg>
      </div>
      <div style={{ flex:1,padding:'10px 14px',display:'flex',flexDirection:'column',gap:8,overflowY:'auto' }}>
        <div style={{ display:'flex',gap:12 }}>
          <div style={{ flex:1,textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1.3rem',color:cor,lineHeight:1 }}>{stats.pctConcluido}%</div>
            <div style={{ fontSize:'0.58rem',color:'var(--text-muted)',marginTop:2 }}>Progresso</div>
          </div>
          <div style={{ flex:1,textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1.3rem',color:'#7c3aed',lineHeight:1 }}>{stats.questoes>0?`${stats.pctAcerto}%`:'—'}</div>
            <div style={{ fontSize:'0.58rem',color:'var(--text-muted)',marginTop:2 }}>Acerto</div>
          </div>
          <div style={{ flex:1,textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1.3rem',color:'#10b981',lineHeight:1 }}>{stats.concluidos}</div>
            <div style={{ fontSize:'0.58rem',color:'var(--text-muted)',marginTop:2 }}>Concluídos</div>
          </div>
        </div>
        {allIds.length > 0 && (
          <div>
            <div style={{ display:'flex',justifyContent:'space-between',fontSize:'0.62rem',color:'var(--text-muted)',marginBottom:4 }}>
              <span>{stats.concluidos}/{allIds.length} subtópicos</span>
            </div>
            <div style={{ height:5,borderRadius:3,background:'var(--bg-4)',overflow:'hidden' }}>
              <div style={{ height:'100%',width:`${stats.pctConcluido}%`,background:`linear-gradient(90deg,${cor},${cor}aa)`,borderRadius:3,transition:'width 0.6s',boxShadow:`0 0 8px ${cor}60` }}/>
            </div>
          </div>
        )}
      </div>
      <div style={{ padding:'6px 14px',borderTop:'1px solid var(--border-md)',flexShrink:0 }}>
        <button onClick={()=>onNavigate('editais')} style={{ width:'100%',padding:'6px',borderRadius:7,border:`1px solid ${cor}35`,background:`${cor}08`,color:cor,fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.7rem',cursor:'pointer' }}>
          Abrir edital →
        </button>
      </div>
    </div>
  )
}

// ─── GamingWidget ─────────────────────────────────────────────────────────────
function GamingWidget({ onNavigate }: { onNavigate:(id:string)=>void }) {
  const uid = useUid()
  const [games, setGames] = useState<any[]>([])
  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, `users/${uid}/games`), snap => {
      setGames(snap.docs.map(d => d.data()))
    })
  }, [uid])
  const jogando = games.filter(g => g.status === 'jogando')
  const concluidos = games.filter(g => g.status === 'concluido').length
  return (
    <div className="card" style={{ padding:0,overflow:'hidden',height:'100%',boxSizing:'border-box',display:'flex',flexDirection:'column' }}>
      <div style={{ padding:'10px 14px',borderBottom:'1px solid var(--border-md)',background:'linear-gradient(90deg,rgba(124,58,237,0.07)0%,transparent 100%)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em' }}>🎮 Gaming Hub</div>
        <div style={{ fontSize:'0.65rem',color:'var(--text-muted)' }}>{games.length} jogos · {concluidos} ✓</div>
      </div>
      <div style={{ flex:1,padding:'10px 14px',display:'flex',flexDirection:'column',gap:7,overflowY:'auto' }}>
        {jogando.length === 0
          ? <div style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8 }}>
              <span style={{ fontSize:'2rem' }}>🎮</span>
              <p style={{ margin:0,fontSize:'0.72rem',color:'var(--text-muted)',textAlign:'center' }}>Nenhum jogo em andamento</p>
            </div>
          : jogando.slice(0,3).map((g:any) => (
              <div key={g.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'7px 10px',borderRadius:9,background:'rgba(124,58,237,0.06)',border:'1px solid rgba(124,58,237,0.2)' }}>
                {g.coverUrl
                  ? <img src={g.coverUrl} style={{ width:32,height:42,objectFit:'cover',borderRadius:5,flexShrink:0 }} />
                  : <div style={{ width:32,height:42,borderRadius:5,background:'rgba(124,58,237,0.15)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:'1rem' }}>🎮</div>
                }
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:'0.78rem',fontWeight:700,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{g.titulo}</div>
                  <div style={{ fontSize:'0.6rem',color:'var(--text-muted)',marginTop:1 }}>{g.plataforma}</div>
                  <div style={{ height:3,borderRadius:2,background:'var(--bg-4)',overflow:'hidden',marginTop:4 }}>
                    <div style={{ height:'100%',width:`${g.progresso||0}%`,background:'#7c3aed',borderRadius:2 }}/>
                  </div>
                </div>
                <div style={{ fontSize:'0.72rem',fontWeight:700,color:'#a78bfa',flexShrink:0 }}>{g.progresso||0}%</div>
              </div>
            ))
        }
      </div>
      <div style={{ padding:'6px 14px',borderTop:'1px solid var(--border-md)',flexShrink:0 }}>
        <button onClick={()=>onNavigate('gaming')} style={{ width:'100%',padding:'6px',borderRadius:7,border:'1px solid rgba(124,58,237,0.3)',background:'rgba(124,58,237,0.06)',color:'#a78bfa',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.7rem',cursor:'pointer' }}>
          Gaming Hub →
        </button>
      </div>
    </div>
  )
}

// ─── MediaWidget ───────────────────────────────────────────────────────────────
function MediaWidget({ onNavigate }: { onNavigate:(id:string)=>void }) {
  const uid = useUid()
  const [itens, setItens] = useState<any[]>([])
  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, `users/${uid}/media`), snap => {
      setItens(snap.docs.map(d => d.data()))
    })
  }, [uid])
  const andamento = itens.filter(i => i.status === 'andamento')
  const TYPE_COLOR: Record<string,string> = { filme:'#60a5fa', serie:'#a78bfa', livro:'#34d399' }
  const TYPE_ICON: Record<string,string> = { filme:'🎬', serie:'📺', livro:'📚' }
  return (
    <div className="card" style={{ padding:0,overflow:'hidden',height:'100%',boxSizing:'border-box',display:'flex',flexDirection:'column' }}>
      <div style={{ padding:'10px 14px',borderBottom:'1px solid var(--border-md)',background:'linear-gradient(90deg,rgba(59,130,246,0.07)0%,transparent 100%)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em' }}>▶ Media Tracker</div>
        <div style={{ fontSize:'0.65rem',color:'var(--text-muted)' }}>{andamento.length} em andamento</div>
      </div>
      <div style={{ flex:1,padding:'10px 14px',display:'flex',flexDirection:'column',gap:7,overflowY:'auto' }}>
        {andamento.length === 0
          ? <div style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8 }}>
              <span style={{ fontSize:'2rem' }}>▶</span>
              <p style={{ margin:0,fontSize:'0.72rem',color:'var(--text-muted)',textAlign:'center' }}>Nada em andamento</p>
            </div>
          : andamento.slice(0,4).map((item:any) => {
              const cor = TYPE_COLOR[item.tipo] || '#60a5fa'
              const pct = item.tipo==='serie'
                ? Math.round(((item.episodiosAssistidos||0)/(item.totalEpisodios||1))*100)
                : item.tipo==='livro'
                  ? Math.round(((item.paginaAtual||0)/(item.totalPaginas||1))*100)
                  : (item.status==='concluido'?100:0)
              return (
                <div key={item.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'7px 10px',borderRadius:9,background:`${cor}08`,border:`1px solid ${cor}25` }}>
                  {item.coverUrl
                    ? <img src={item.coverUrl} style={{ width:28,height:40,objectFit:'cover',borderRadius:5,flexShrink:0 }} />
                    : <div style={{ width:28,height:40,borderRadius:5,background:`${cor}18`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:'0.9rem' }}>{TYPE_ICON[item.tipo]||'▶'}</div>
                  }
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:'0.75rem',fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.titulo}</div>
                    <div style={{ height:3,borderRadius:2,background:'var(--bg-4)',overflow:'hidden',marginTop:4 }}>
                      <div style={{ height:'100%',width:`${pct}%`,background:cor,borderRadius:2 }}/>
                    </div>
                  </div>
                  <span style={{ fontSize:'0.62rem',fontWeight:700,color:cor,flexShrink:0 }}>{pct}%</span>
                </div>
              )
            })
        }
      </div>
      <div style={{ padding:'6px 14px',borderTop:'1px solid var(--border-md)',flexShrink:0 }}>
        <button onClick={()=>onNavigate('media')} style={{ width:'100%',padding:'6px',borderRadius:7,border:'1px solid rgba(59,130,246,0.3)',background:'rgba(59,130,246,0.06)',color:'#60a5fa',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.7rem',cursor:'pointer' }}>
          Media Tracker →
        </button>
      </div>
    </div>
  )
}

// ─── DiarioWidget ──────────────────────────────────────────────────────────────
function DiarioWidget({ onNavigate }: { onNavigate:(id:string)=>void }) {
  const uid = useUid()
  const [hoje, setHoje] = useState<any>(null)
  useEffect(() => {
    if (!uid) return
    const data = new Date().toISOString().slice(0,10)
    return onSnapshot(doc(db, 'users', uid, 'journal', data), snap => {
      setHoje(snap.exists() ? snap.data() : null)
    })
  }, [uid])
  const HUMOR_EMOJI = ['😢','😕','😐','😊','😄']
  const HUMOR_COR = ['#ef4444','#f87171','#fbbf24','#a3e635','#6ee7a0']
  const HUMOR_LABEL = ['Péssimo','Ruim','Neutro','Bom','Ótimo']
  const tasks = hoje?.planejamento || []
  const feitas = tasks.filter((t:any) => t.feito).length
  const dataHoje = new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'})
  return (
    <div className="card" style={{ padding:0,overflow:'hidden',height:'100%',boxSizing:'border-box',display:'flex',flexDirection:'column' }}>
      <div style={{ padding:'10px 14px',borderBottom:'1px solid var(--border-md)',background:'linear-gradient(90deg,rgba(236,72,153,0.07)0%,transparent 100%)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em' }}>✦ Diário</div>
        <div style={{ fontSize:'0.65rem',color:'var(--text-muted)' }}>{dataHoje}</div>
      </div>
      <div style={{ flex:1,padding:'12px 14px',display:'flex',flexDirection:'column',gap:10 }}>
        {!hoje
          ? <div style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8 }}>
              <span style={{ fontSize:'2rem' }}>✦</span>
              <p style={{ margin:0,fontSize:'0.72rem',color:'var(--text-muted)',textAlign:'center' }}>Sem registro hoje</p>
            </div>
          : <>
            <div style={{ display:'flex',alignItems:'center',gap:12 }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:'2rem' }}>{HUMOR_EMOJI[(hoje.humor||3)-1]}</div>
                <div style={{ fontSize:'0.58rem',color:HUMOR_COR[(hoje.humor||3)-1],fontWeight:700 }}>{HUMOR_LABEL[(hoje.humor||3)-1]}</div>
              </div>
              <div style={{ flex:1 }}>
                {tasks.length > 0 && <>
                  <div style={{ display:'flex',justifyContent:'space-between',fontSize:'0.65rem',color:'var(--text-muted)',marginBottom:4 }}>
                    <span>Tasks</span>
                    <span style={{ fontWeight:700,color:feitas===tasks.length?'#6ee7a0':'var(--text-muted)' }}>{feitas}/{tasks.length}</span>
                  </div>
                  <div style={{ height:5,borderRadius:3,background:'var(--bg-4)',overflow:'hidden' }}>
                    <div style={{ height:'100%',width:`${tasks.length?Math.round((feitas/tasks.length)*100):0}%`,background:'linear-gradient(90deg,#ec4899,#f472b6)',borderRadius:3 }}/>
                  </div>
                </>}
                {hoje.fraseDoDia && <p style={{ margin:'8px 0 0',fontSize:'0.7rem',color:'var(--text-secondary)',fontStyle:'italic',lineHeight:1.4,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden' }}>"{hoje.fraseDoDia}"</p>}
              </div>
            </div>
            <div style={{ display:'flex',gap:6 }}>
              {[{v:hoje.ideias?.length||0,l:'Ideias',c:'#a78bfa'},{v:hoje.estudos?.length||0,l:'Notas',c:'#60a5fa'},{v:hoje.timeline?.length||0,l:'Eventos',c:'#f59e0b'}].map(k=>(
                <div key={k.l} style={{ flex:1,padding:'6px',borderRadius:8,background:'var(--surface)',border:'1px solid var(--border)',textAlign:'center' }}>
                  <div style={{ fontSize:'0.9rem',fontWeight:700,color:k.c }}>{k.v}</div>
                  <div style={{ fontSize:'0.58rem',color:'var(--text-muted)',marginTop:1 }}>{k.l}</div>
                </div>
              ))}
            </div>
          </>
        }
      </div>
      <div style={{ padding:'6px 14px',borderTop:'1px solid var(--border-md)',flexShrink:0 }}>
        <button onClick={()=>onNavigate('journal')} style={{ width:'100%',padding:'6px',borderRadius:7,border:'1px solid rgba(236,72,153,0.3)',background:'rgba(236,72,153,0.06)',color:'#f472b6',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.7rem',cursor:'pointer' }}>
          Abrir Diário →
        </button>
      </div>
    </div>
  )
}

// ─── LinksWidget ───────────────────────────────────────────────────────────────
function LinksWidget({ onNavigate }: { onNavigate:(id:string)=>void }) {
  const uid = useUid()
  const [links, setLinks] = useState<any[]>([])
  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, `users/${uid}/links`), snap => {
      setLinks(snap.docs.map(d => d.data()).sort((a:any,b:any) => b.criadoEm - a.criadoEm))
    })
  }, [uid])
  const CAT_COR: Record<string,string> = { profissional:'#60a5fa',pessoal:'#34d399',sistemas:'#a78bfa',interesse:'#fbbf24',educacional:'#f97316',diversos:'#9ca3af' }
  return (
    <div className="card" style={{ padding:0,overflow:'hidden',height:'100%',boxSizing:'border-box',display:'flex',flexDirection:'column' }}>
      <div style={{ padding:'10px 14px',borderBottom:'1px solid var(--border-md)',background:'linear-gradient(90deg,rgba(0,229,255,0.05)0%,transparent 100%)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em' }}>🔗 Links</div>
        <div style={{ fontSize:'0.65rem',color:'var(--text-muted)' }}>{links.length} salvos</div>
      </div>
      <div style={{ flex:1,overflowY:'auto',padding:'4px 0' }}>
        {links.length === 0
          ? <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:8,padding:'16px' }}>
              <span style={{ fontSize:'2rem' }}>🔗</span>
              <p style={{ margin:0,fontSize:'0.72rem',color:'var(--text-muted)',textAlign:'center' }}>Nenhum link salvo</p>
            </div>
          : links.slice(0,6).map((l:any) => {
              const cor = CAT_COR[l.categoria] || '#9ca3af'
              return (
                <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer"
                  style={{ display:'flex',alignItems:'center',gap:10,padding:'7px 14px',borderBottom:'1px solid var(--border)',textDecoration:'none',transition:'background 0.15s' }}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='var(--surface)'}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                  <div style={{ width:3,height:24,borderRadius:2,background:cor,flexShrink:0 }}/>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:'0.75rem',fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{l.titulo}</div>
                    <div style={{ fontSize:'0.6rem',color:'var(--text-muted)',marginTop:1 }}>{l.url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0]}</div>
                  </div>
                </a>
              )
            })
        }
      </div>
      <div style={{ padding:'6px 14px',borderTop:'1px solid var(--border-md)',flexShrink:0 }}>
        <button onClick={()=>onNavigate('links')} style={{ width:'100%',padding:'6px',borderRadius:7,border:'1px solid rgba(0,229,255,0.2)',background:'rgba(0,229,255,0.05)',color:'var(--text-accent)',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.7rem',cursor:'pointer' }}>
          Links de Interesse →
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
    { id:'journal',    label:'Diário',           icon:'✦', desc:'Registros e reflexões',                              color:'#ec4899' },
    { id:'media',      label:'Media Tracker',    icon:'▶', desc:'Filmes, séries e livros',                            color:'#3b82f6' },
    { id:'gaming',     label:'Gaming Hub',       icon:'🎮', desc:'Progresso e backlog',                               color:'#7c3aed' },
    { id:'links',      label:'Links',            icon:'🔗', desc:'Links de interesse',                                color:'#00e5ff' },
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


// ─── VisualDashboard — Modo visual interativo ─────────────────────────────────
function IconEditaisVis({ size=16, color='currentColor' }: { size?:number; color?:string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style={{color}}>
      <rect x="2" y="1" width="11" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M10 1 L13 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M10 1 L10 4 L13 4" fill="none" stroke="currentColor" strokeWidth="1.1"/>
      <line x1="4.5" y1="6.5"  x2="10.5" y2="6.5"  stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <line x1="4.5" y1="8.5"  x2="10.5" y2="8.5"  stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <line x1="4.5" y1="10.5" x2="8.5"  y2="10.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <circle cx="14" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M12.3 13 L13.5 14.2 L15.7 11.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

const VIS_MODULOS = [
  { id: 'visao-geral', icon: '◈',  label: 'Visão Geral', cor: '#6366f1', svgIcon: null },
  { id: 'editais',    icon: null,  label: 'Editais',     cor: '#00e5ff', svgIcon: 'editais' },
  { id: 'concursos',  icon: '🎯', label: 'Concursos',   cor: '#7c3aed', svgIcon: null },
  { id: 'financeiro', icon: '◎',  label: 'Financeiro',  cor: '#10b981', svgIcon: null },
  { id: 'prontuario', icon: '📋', label: 'Prontuário',  cor: '#5b5bd6', svgIcon: null },
  { id: 'ponto',      icon: '⊙',  label: 'Ponto',       cor: '#f59e0b', svgIcon: null },
  { id: 'saude',      icon: '✚',  label: 'Saúde',       cor: '#34d399', svgIcon: null },
  { id: 'wishlist',   icon: '🛒', label: 'Wishlist',    cor: '#f59e0b', svgIcon: null },
  { id: 'journal',    icon: '✦',  label: 'Diário',      cor: '#ec4899', svgIcon: null },
  { id: 'gaming',     icon: '🎮', label: 'Gaming',      cor: '#7c3aed', svgIcon: null },
  { id: 'media',      icon: '▶',  label: 'Media',       cor: '#3b82f6', svgIcon: null },
  { id: 'links',      icon: '🔗', label: 'Links',       cor: '#00e5ff', svgIcon: null },
]

function useLocationInfo() {
  return { cidade: 'Belo Horizonte', uf: 'MG', lat: -19.92, lng: -43.94 }
}

function BarraInferior() {
  const loc = useLocationInfo()
  const [hora, setHora] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setHora(new Date()), 1000); return () => clearInterval(t) }, [])
  const DIAS_PT = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado']
  const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const DIAS_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  const diaSemana = DIAS_PT[hora.getDay()]
  const diaSemanaShort = DIAS_SHORT[hora.getDay()]
  const diaMes = hora.getDate()
  const mes = MESES_PT[hora.getMonth()]
  const mesNum = hora.getMonth() + 1
  const ano = hora.getFullYear()
  const horaStr = hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const semanaISO = (() => { const d = new Date(hora); d.setHours(0,0,0,0); d.setDate(d.getDate()+3-(d.getDay()+6)%7); const w = new Date(d.getFullYear(),0,4); return 1+Math.round(((d.getTime()-w.getTime())/86400000-3+(w.getDay()+6)%7)/7) })()
  const diasNoAno = Math.floor((hora.getTime() - new Date(hora.getFullYear(),0,0).getTime())/86400000)
  const totalDias = (ano%4===0&&(ano%100!==0||ano%400===0))?366:365
  const pctAno = Math.round((diasNoAno/totalDias)*100)
  const pctMes = Math.round((diaMes / new Date(ano, mesNum, 0).getDate()) * 100)
  const diasRestMes = new Date(ano, mesNum, 0).getDate() - diaMes
  const proximaFeira = (() => { const d = new Date(hora); let n = 6 - d.getDay(); if(n <= 0) n += 7; return n })()

  const cardBase: React.CSSProperties = { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'10px 18px', borderRadius:12, border:'1px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.03)', minWidth:90, flexShrink:0, gap:4, transition:'all 0.2s', cursor:'default' }
  const labelSty: React.CSSProperties = { fontFamily:'var(--font-mono)', fontSize:'0.55rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em' }
  const valSty = (cor?:string): React.CSSProperties => ({ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1rem', color:cor||'var(--text-primary)', lineHeight:1 })

  return (
    <div style={{ borderTop:'1px solid rgba(255,255,255,0.1)', background:'linear-gradient(180deg,rgba(99,102,241,0.04) 0%,rgba(0,0,0,0.1) 100%)', flexShrink:0, padding:'14px 20px 14px' }}>
      <div style={{ display:'flex', gap:10, overflowX:'auto', flexWrap:'nowrap', alignItems:'stretch' }}>
        {/* Relógio */}
        <div style={{ ...cardBase, minWidth:120, background:'linear-gradient(135deg,rgba(99,102,241,0.12),rgba(99,102,241,0.04))', border:'1px solid rgba(99,102,241,0.25)' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontWeight:900, fontSize:'1.4rem', color:'#818cf8', letterSpacing:'0.05em', lineHeight:1 }}>{horaStr}</div>
          <div style={{ ...labelSty, color:'rgba(129,140,248,0.6)', marginTop:2 }}>{diaSemanaShort} · UTC-3</div>
        </div>
        {/* Data */}
        <div style={{ ...cardBase, minWidth:130, background:'linear-gradient(135deg,rgba(59,130,246,0.1),rgba(59,130,246,0.03))', border:'1px solid rgba(59,130,246,0.2)' }}>
          <div style={{ display:'flex', alignItems:'baseline', gap:5 }}>
            <span style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.6rem', color:'#60a5fa', lineHeight:1 }}>{diaMes}</span>
            <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.9rem', color:'#93c5fd' }}>{mes.slice(0,3)}</span>
          </div>
          <div style={{ ...labelSty, color:'rgba(96,165,250,0.6)' }}>{diaSemana.slice(0,3)} · {ano}</div>
        </div>
        {/* Localização */}
        <div style={{ ...cardBase, minWidth:140, background:'linear-gradient(135deg,rgba(16,185,129,0.1),rgba(16,185,129,0.03))', border:'1px solid rgba(16,185,129,0.2)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:'1.1rem' }}>📍</span>
            <div>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'0.88rem', color:'#34d399', lineHeight:1 }}>{loc.cidade}</div>
              <div style={{ ...labelSty, color:'rgba(52,211,153,0.6)', marginTop:2 }}>{loc.uf} · Brasil 🇧🇷</div>
            </div>
          </div>
        </div>
        {/* Progresso do Ano */}
        <div style={{ ...cardBase, minWidth:180, background:'linear-gradient(135deg,rgba(245,158,11,0.1),rgba(245,158,11,0.03))', border:'1px solid rgba(245,158,11,0.2)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', width:'100%', marginBottom:5 }}>
            <span style={{ ...labelSty, color:'rgba(251,191,36,0.7)' }}>PROGRESSO {ano}</span>
            <span style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1rem', color:'#fbbf24' }}>{pctAno}%</span>
          </div>
          <div style={{ width:'100%', height:8, borderRadius:4, background:'rgba(255,255,255,0.07)', overflow:'hidden', position:'relative' }}>
            <div style={{ height:'100%', width:`${pctAno}%`, background:'linear-gradient(90deg,#f59e0b,#fbbf24)', borderRadius:4, transition:'width 1s', boxShadow:'0 0 10px rgba(245,158,11,0.5)' }} />
          </div>
          <div style={{ ...labelSty, color:'rgba(251,191,36,0.5)', marginTop:4 }}>Dia {diasNoAno} de {totalDias}</div>
        </div>
        {/* Progresso do Mês */}
        <div style={{ ...cardBase, minWidth:165, background:'linear-gradient(135deg,rgba(239,68,68,0.08),rgba(239,68,68,0.02))', border:'1px solid rgba(239,68,68,0.15)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', width:'100%', marginBottom:5 }}>
            <span style={{ ...labelSty, color:'rgba(252,165,165,0.7)' }}>{mes.toUpperCase()}</span>
            <span style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1rem', color:'#fca5a5' }}>{pctMes}%</span>
          </div>
          <div style={{ width:'100%', height:8, borderRadius:4, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${pctMes}%`, background:'linear-gradient(90deg,#ef4444,#f87171)', borderRadius:4, transition:'width 1s' }} />
          </div>
          <div style={{ ...labelSty, color:'rgba(252,165,165,0.5)', marginTop:4 }}>{diasRestMes} dias restantes</div>
        </div>
        {/* Semana */}
        <div style={{ ...cardBase, minWidth:100 }}>
          <div style={valSty('#c084fc')}>S{semanaISO}</div>
          <div style={labelSty}>Semana ISO</div>
          <div style={{ ...labelSty, color:'rgba(192,132,252,0.5)', marginTop:2 }}>6ª em {proximaFeira}d</div>
        </div>
        {/* Temperatura placeholder */}
        <div style={{ ...cardBase, minWidth:90 }}>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:'1.2rem' }}>🌤</span>
            <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1rem', color:'var(--text-primary)' }}>BH</span>
          </div>
          <div style={labelSty}>Belo Horizonte</div>
        </div>
      </div>
    </div>
  )
}

function PainelEditais({ onNavigate, global, discStats }: any) {
  const { editais } = useEditaisCadastrados()
  const [sel, setSel] = useState(0)
  const allEditais = [
    { id: 'agu', nome: 'Edital AGU', orgao: 'AGU · Advogado da União', cor: '#00e5ff', isBuiltin: true },
    ...editais.map(e => ({ id: e.id, nome: e.nome, orgao: `${e.orgao} · ${e.cargo || ''}`, cor: e.cor, isBuiltin: false }))
  ]
  const cur = allEditais[sel % allEditais.length]
  const hookCur = useEdital(cur.isBuiltin ? 'agu' : cur.id)
  const { editais: allE } = useEditaisCadastrados()
  const curEdital = allE.find(e => e.id === cur.id)
  const curIds = cur.isBuiltin
    ? AGU_DISCIPLINAS.flatMap(d => d.topicos.flatMap(t => t.subtopicos.map(s => s.id)))
    : (curEdital ? curEdital.disciplinas.flatMap((d:any) => d.topicos.flatMap((t:any) => t.subtopicos.map((s:any) => s.id))) : [])
  const curStats = cur.isBuiltin ? global : hookCur.getStats(curIds)
  const curDiscs = cur.isBuiltin ? discStats : (curEdital ? curEdital.disciplinas.map((d:any) => {
    const ids = d.topicos.flatMap((t:any) => t.subtopicos.map((s:any) => s.id))
    return { ...d, ...hookCur.getStats(ids), total: ids.length }
  }) : [])

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, height:'100%' }}>
      {/* Seletor de edital */}
      {allEditais.length > 1 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {allEditais.map((e, i) => (
            <button key={e.id} onClick={() => setSel(i)} style={{ padding:'4px 14px', borderRadius:20, border:`1px solid ${sel===i?`${e.cor}50`:'rgba(255,255,255,0.1)'}`, background: sel===i?`${e.cor}12`:'transparent', color: sel===i?e.cor:'var(--text-muted)', fontSize:'0.72rem', fontWeight:700, cursor:'pointer', fontFamily:'var(--font-display)', transition:'all 0.15s' }}>
              {e.nome}
            </button>
          ))}
        </div>
      )}
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {[
          { l:'Progresso', v:`${curStats.pctConcluido}%`, c:cur.cor },
          { l:'Acerto', v:curStats.questoes>0?`${curStats.pctAcerto}%`:'—', c:'#7c3aed' },
          { l:'Concluídos', v:`${curStats.concluidos}/${curIds.length}`, c:'#10b981' },
        ].map(k => (
          <div key={k.l} style={{ padding:'14px', borderRadius:14, background:'rgba(255,255,255,0.03)', border:`1px solid ${k.c}20`, textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.6rem', color:k.c, lineHeight:1 }}>{k.v}</div>
            <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', marginTop:4 }}>{k.l}</div>
          </div>
        ))}
      </div>
      {/* Ring + barra */}
      <div style={{ display:'flex', alignItems:'center', gap:20 }}>
        <RingGauge pct={curStats.pctConcluido} color={cur.cor} size={90} />
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'0.9rem', color:'var(--text-primary)', marginBottom:2 }}>{cur.nome}</div>
          <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginBottom:10 }}>{cur.orgao}</div>
          <div style={{ height:8, borderRadius:4, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${curStats.pctConcluido}%`, background:`linear-gradient(90deg,${cur.cor},${cur.cor}80)`, borderRadius:4, transition:'width 0.8s', boxShadow:`0 0 10px ${cur.cor}40` }} />
          </div>
        </div>
      </div>
      {/* Disciplinas */}
      <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:5 }}>
        {curDiscs.map((d: any) => (
          <div key={d.id||d.nome} style={{ display:'grid', gridTemplateColumns:'1fr 100px 38px', alignItems:'center', gap:8, padding:'5px 0' }}>
            <div style={{ fontSize:'0.72rem', color:'var(--text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.nome?.replace('Direito ','')}</div>
            <div style={{ height:5, borderRadius:3, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${d.pctConcluido}%`, background:d.cor||cur.cor, borderRadius:3, transition:'width 0.5s' }} />
            </div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', fontWeight:700, color:d.cor||cur.cor, textAlign:'right' }}>{d.pctConcluido}%</div>
          </div>
        ))}
      </div>
      <button onClick={()=>onNavigate('editais')} style={{ padding:'9px', borderRadius:10, border:`1px solid ${cur.cor}30`, background:`${cur.cor}08`, color:cur.cor, fontWeight:700, fontSize:'0.78rem', cursor:'pointer' }}>Abrir Editais →</button>
    </div>
  )
}

function PainelFinanceiro({ onNavigate }: any) {
  const uid = useUid()
  const [trans, setTrans] = useState<any[]>([])
  const [contas, setContas] = useState<any[]>([])
  useEffect(() => {
    if (!uid||!db) return
    const u1 = onSnapshot(query(collection(db,`users/${uid}/transacoes`),orderBy('data','desc')), s => setTrans(s.docs.map(d=>d.data())))
    const u2 = onSnapshot(query(collection(db,`users/${uid}/contasPagar`),orderBy('vencimento','asc')), s => setContas(s.docs.map(d=>d.data())))
    return () => { u1(); u2() }
  }, [uid])
  const mes = new Date().toISOString().slice(0,7)
  const tMes = trans.filter(t => t.data?.startsWith(mes))
  const receita = tMes.filter(t=>t.tipo==='receita').reduce((a,t)=>a+t.valor,0)
  const despesa = tMes.filter(t=>t.tipo==='despesa').reduce((a,t)=>a+t.valor,0)
  const saldo = receita - despesa
  const fmtBRL = (v:number) => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
  const pendentes = contas.filter(c=>!c.pago)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, height:'100%' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
        {[{l:'Receitas',v:fmtBRL(receita),c:'#10b981'},{l:'Despesas',v:fmtBRL(despesa),c:'#ef4444'},{l:'Saldo',v:fmtBRL(saldo),c:saldo>=0?'#10b981':'#ef4444'}].map(k=>(
          <div key={k.l} style={{ padding:'14px', borderRadius:14, background:'rgba(255,255,255,0.03)', border:`1px solid ${k.c}20`, textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.1rem', color:k.c, lineHeight:1 }}>{k.v}</div>
            <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', marginTop:4 }}>{k.l}</div>
          </div>
        ))}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'var(--font-mono)' }}>Últimas transações</div>
        {trans.slice(0,6).map((t:any)=>(
          <div key={t.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
            <div>
              <div style={{ fontSize:'0.78rem', color:'var(--text-primary)', fontWeight:500 }}>{t.descricao}</div>
              <div style={{ fontSize:'0.62rem', color:'var(--text-muted)' }}>{t.data} · {t.categoria}</div>
            </div>
            <div style={{ fontWeight:800, color:t.tipo==='receita'?'#10b981':'#ef4444', fontSize:'0.82rem', fontFamily:'var(--font-display)' }}>{t.tipo==='receita'?'+':'-'}{fmtBRL(t.valor)}</div>
          </div>
        ))}
      </div>
      {pendentes.length > 0 && (
        <div style={{ padding:'10px 14px', borderRadius:10, background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.2)' }}>
          <div style={{ fontSize:'0.65rem', color:'#f59e0b', fontWeight:700, marginBottom:4 }}>⚠ {pendentes.length} conta(s) pendente(s)</div>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:800, color:'#f59e0b' }}>{fmtBRL(pendentes.reduce((a:number,c:any)=>a+c.valor,0))}</div>
        </div>
      )}
      <button onClick={()=>onNavigate('financeiro')} style={{ padding:'9px', borderRadius:10, border:'1px solid rgba(16,185,129,0.3)', background:'rgba(16,185,129,0.07)', color:'#10b981', fontWeight:700, fontSize:'0.78rem', cursor:'pointer' }}>Abrir Financeiro →</button>
    </div>
  )
}

function PainelProntuario({ onNavigate }: any) {
  const uid = useUid()
  const [demandas, setDemandas] = useState<any[]>([])
  useEffect(() => { if (!uid||!db) return; return onSnapshot(collection(db,`users/${uid}/prontuario`), s => setDemandas(s.docs.map(d=>d.data()))) }, [uid])
  const ativas = demandas.filter(d=>d.status!=='concluida'&&d.status!=='cancelada')
  const urgentes = ativas.filter(d=>d.prioridade==='urgente')
  const vencendo = ativas.filter(d=>{ if(!d.prazo) return false; const dias=Math.ceil((new Date(d.prazo+'T00:00:00').getTime()-Date.now())/86400000); return dias>=0&&dias<=7 })
  const ST_COR: Record<string,string> = { aberta:'#60a5fa', em_andamento:'#fbbf24', aguardando:'#c084fc', concluida:'#34d399', cancelada:'#9ca3af' }
  const ST_LBL: Record<string,string> = { aberta:'Aberta', em_andamento:'Em Andamento', aguardando:'Aguardando', concluida:'Concluída', cancelada:'Cancelada' }
  const byStatus: Record<string,number> = {}
  demandas.forEach(d => { byStatus[d.status]=(byStatus[d.status]||0)+1 })

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, height:'100%' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10 }}>
        {[{l:'Ativas',v:ativas.length,c:'#60a5fa'},{l:'Urgentes',v:urgentes.length,c:'#f87171'},{l:'Vencendo',v:vencendo.length,c:'#fbbf24'},{l:'Total',v:demandas.length,c:'#94a3b8'}].map(k=>(
          <div key={k.l} style={{ padding:'12px', borderRadius:12, background:'rgba(255,255,255,0.03)', border:`1px solid ${k.c}20`, textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.5rem', color:k.c, lineHeight:1 }}>{k.v}</div>
            <div style={{ fontSize:'0.6rem', color:'var(--text-muted)', marginTop:3 }}>{k.l}</div>
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'var(--font-mono)' }}>Por status</div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {Object.entries(byStatus).map(([st, n]) => (
            <div key={st} style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:ST_COR[st]||'#94a3b8', flexShrink:0 }} />
              <div style={{ flex:1, fontSize:'0.75rem', color:'var(--text-secondary)' }}>{ST_LBL[st]||st}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', fontWeight:700, color:ST_COR[st]||'#94a3b8' }}>{n}</div>
              <div style={{ width:80, height:4, borderRadius:2, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${(n/Math.max(1,demandas.length))*100}%`, background:ST_COR[st]||'#94a3b8', borderRadius:2 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto' }}>
        <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'var(--font-mono)' }}>Demandas recentes</div>
        {ativas.slice(0,5).map((d:any)=>{
          const dias=d.prazo?Math.ceil((new Date(d.prazo+'T00:00:00').getTime()-Date.now())/86400000):null
          return (
            <div key={d.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'0.78rem', fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.titulo}</div>
                <div style={{ fontSize:'0.62rem', color:'var(--text-muted)' }}>{d.categoria}</div>
              </div>
              {dias !== null && <div style={{ fontSize:'0.65rem', fontWeight:700, color:dias<=0?'#94a3b8':dias<=7?'#f87171':dias<=15?'#fbbf24':'#6ee7a0', marginLeft:8, flexShrink:0 }}>{dias<=0?'Ag. resolução':`${dias}d`}</div>}
            </div>
          )
        })}
      </div>
      <button onClick={()=>onNavigate('prontuario')} style={{ padding:'9px', borderRadius:10, border:'1px solid rgba(91,91,214,0.3)', background:'rgba(91,91,214,0.07)', color:'#a5a3f5', fontWeight:700, fontSize:'0.78rem', cursor:'pointer' }}>Abrir Prontuário →</button>
    </div>
  )
}


// ─── PainelVisaoGeral ─────────────────────────────────────────────────────────
function PainelVisaoGeral({ onNavigate, global }: any) {
  const uid = useUid()
  const [trans, setTrans] = useState<any[]>([])
  const [contas, setContas] = useState<any[]>([])
  const [demandas, setDemandas] = useState<any[]>([])
  const [concursos, setConcursos] = useState<any[]>([])
  const [ponto, setPonto] = useState<any[]>([])
  useEffect(() => {
    if (!uid||!db) return
    const u1 = onSnapshot(query(collection(db,`users/${uid}/transacoes`),orderBy('data','desc')), s=>setTrans(s.docs.map(d=>d.data())))
    const u2 = onSnapshot(query(collection(db,`users/${uid}/contasPagar`),orderBy('vencimento','asc')), s=>setContas(s.docs.map(d=>d.data())))
    const u3 = onSnapshot(collection(db,`users/${uid}/prontuario`), s=>setDemandas(s.docs.map(d=>d.data())))
    const u4 = onSnapshot(collection(db,`users/${uid}/concursos`), s=>setConcursos(s.docs.map(d=>d.data())))
    const u5 = onSnapshot(query(collection(db,`users/${uid}/ponto`),orderBy('data','desc')), s=>setPonto(s.docs.map(d=>d.data())))
    return () => { u1(); u2(); u3(); u4(); u5() }
  }, [uid])
  const mes = new Date().toISOString().slice(0,7)
  const tMes = trans.filter(t=>t.data?.startsWith(mes))
  const receita = tMes.filter(t=>t.tipo==='receita').reduce((a,t)=>a+t.valor,0)
  const despesa = tMes.filter(t=>t.tipo==='despesa').reduce((a,t)=>a+t.valor,0)
  const saldo = receita - despesa
  const fmtBRL = (v:number) => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0})
  const demAndo = demandas.filter(d=>d.status==='em_andamento').length
  const demUrg = demandas.filter(d=>d.prioridade==='urgente'&&d.status!=='concluida').length
  const pontoMes = ponto.filter(p=>p.data?.startsWith(mes)).reduce((a,p)=>a+(p.minutos||0),0)
  const pontoH = Math.floor(pontoMes/60)
  const concAtivos = concursos.filter(c=>c.status!=='encerrado').length

  const modulos = [
    { id:'editais', label:'Editais AGU', cor:'#00e5ff', valor:`${global.pctConcluido}%`, sub:`${global.concluidos}/${337} subtópicos`, pct:global.pctConcluido, icon:'📋' },
    { id:'financeiro', label:'Financeiro', cor:'#10b981', valor:fmtBRL(saldo), sub:`Receita ${fmtBRL(receita)}`, pct:receita>0?Math.min(100,Math.round((saldo/receita)*100)):0, icon:'◎' },
    { id:'prontuario', label:'Prontuário', cor:'#5b5bd6', valor:`${demAndo}`, sub:`${demUrg} urgente(s)`, pct:demandas.length>0?Math.round(((demandas.length-demAndo)/demandas.length)*100):0, icon:'📁' },
    { id:'concursos', label:'Concursos', cor:'#7c3aed', valor:`${concAtivos}`, sub:'em andamento', pct:concAtivos>0?Math.min(100,concAtivos*20):0, icon:'🎯' },
    { id:'ponto', label:'Ponto', cor:'#f59e0b', valor:`${pontoH}h`, sub:'este mês', pct:Math.min(100,Math.round((pontoH/176)*100)), icon:'⊙' },
    { id:'contas', label:'Contas', cor:'#ef4444', valor:`${contas.filter(c=>!c.pago).length}`, sub:'pendentes', pct:contas.length>0?Math.round((contas.filter(c=>c.pago).length/contas.length)*100):100, icon:'⚠' },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:14 }}>
        {modulos.map(m => (
          <button key={m.id} onClick={()=>onNavigate(m.id==='contas'?'financeiro':m.id)}
            style={{ padding:'16px 20px', borderRadius:16, border:`1px solid ${m.cor}25`, background:`linear-gradient(135deg,${m.cor}0a,transparent)`, textAlign:'left', cursor:'pointer', transition:'all 0.2s' }}
            onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-2px)';el.style.boxShadow=`0 8px 24px ${m.cor}20`}}
            onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(0)';el.style.boxShadow='none'}}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
              <div>
                <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', fontFamily:'var(--font-mono)', marginBottom:4 }}>{m.label}</div>
                <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.5rem', color:m.cor, lineHeight:1 }}>{m.valor}</div>
                <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:3 }}>{m.sub}</div>
              </div>
              <span style={{ fontSize:'1.5rem', opacity:0.6 }}>{m.icon}</span>
            </div>
            <div style={{ marginTop:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.6rem', color:'var(--text-muted)', marginBottom:4 }}>
                <span>Progresso</span><span style={{ fontWeight:700, color:m.cor }}>{m.pct}%</span>
              </div>
              <div style={{ height:6, borderRadius:3, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${m.pct}%`, background:`linear-gradient(90deg,${m.cor},${m.cor}99)`, borderRadius:3, transition:'width 0.8s', boxShadow:`0 0 8px ${m.cor}40` }} />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── PainelConcursos ──────────────────────────────────────────────────────────
function PainelConcursos({ onNavigate }: any) {
  const uid = useUid()
  const [concursos, setConcursos] = useState<any[]>([])
  useEffect(() => { if(!uid||!db) return; return onSnapshot(collection(db,`users/${uid}/concursos`), s=>setConcursos(s.docs.map(d=>d.data()))) }, [uid])
  const hoje = new Date().toISOString().slice(0,10)
  const ativos = concursos.filter(c=>c.status!=='encerrado')
  const proximos = [...concursos].filter(c=>c.dataProva&&c.dataProva>=hoje).sort((a,b)=>a.dataProva.localeCompare(b.dataProva)).slice(0,4)
  const ST_COR: Record<string,string> = { inscricao_aberta:'#34d399', inscricao_encerrada:'#fbbf24', aguardando_edital:'#60a5fa', em_preparacao:'#a78bfa', realizado:'#94a3b8', encerrado:'#6b7280' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, height:'100%' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {[{l:'Cadastrados',v:concursos.length,c:'#818cf8'},{l:'Ativos',v:ativos.length,c:'#34d399'},{l:'Provas Próximas',v:proximos.length,c:'#fbbf24'}].map(k=>(
          <div key={k.l} style={{ padding:'14px', borderRadius:14, background:'rgba(255,255,255,0.03)', border:`1px solid ${k.c}20`, textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.6rem', color:k.c, lineHeight:1 }}>{k.v}</div>
            <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', marginTop:4 }}>{k.l}</div>
          </div>
        ))}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'var(--font-mono)' }}>Próximas provas</div>
        {proximos.length === 0 ? <div style={{ textAlign:'center', padding:'24px', color:'var(--text-muted)', fontSize:'0.8rem' }}>Nenhuma prova cadastrada</div>
          : proximos.map((c:any) => {
            const dias = Math.ceil((new Date(c.dataProva+'T00:00:00').getTime()-Date.now())/86400000)
            const cor = dias<=30?'#f87171':dias<=60?'#fbbf24':'#34d399'
            return (
              <div key={c.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', marginBottom:6, borderRadius:12, background:'rgba(255,255,255,0.03)', border:`1px solid ${ST_COR[c.status]||'rgba(255,255,255,0.07)'}25` }}>
                <div>
                  <div style={{ fontSize:'0.82rem', fontWeight:700, color:'var(--text-primary)' }}>{c.orgao} — {c.cargo}</div>
                  <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', marginTop:2 }}>{c.dataProva?.split('-').reverse().join('/')} · {c.banca}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'0.95rem', color:cor }}>{dias}d</div>
                  <div style={{ fontSize:'0.58rem', color:'var(--text-muted)' }}>para a prova</div>
                </div>
              </div>
            )
          })
        }
      </div>
      <button onClick={()=>onNavigate('concursos')} style={{ padding:'9px', borderRadius:10, border:'1px solid rgba(124,58,237,0.3)', background:'rgba(124,58,237,0.07)', color:'#a78bfa', fontWeight:700, fontSize:'0.78rem', cursor:'pointer' }}>Abrir Concursos →</button>
    </div>
  )
}

// ─── PainelPonto ──────────────────────────────────────────────────────────────
function PainelPonto({ onNavigate }: any) {
  const uid = useUid()
  const [registros, setRegistros] = useState<any[]>([])
  useEffect(() => { if(!uid||!db) return; return onSnapshot(query(collection(db,`users/${uid}/ponto`),orderBy('data','desc')), s=>setRegistros(s.docs.map(d=>d.data()))) }, [uid])
  const hoje = new Date().toISOString().slice(0,10)
  const mes = hoje.slice(0,7)
  const regHoje = registros.find(r=>r.data===hoje)
  const minMes = registros.filter(r=>r.data?.startsWith(mes)).reduce((a,r)=>a+(r.minutos||0),0)
  const hMes = Math.floor(minMes/60); const mMes = minMes%60
  const diasTrabMes = registros.filter(r=>r.data?.startsWith(mes)&&(r.minutos||0)>0).length
  const emServico = !!(regHoje?.entrada && !regHoje?.saida)
  const TIPOS_COR: Record<string,string> = { 'Trabalho':'#60a5fa','Home Office':'#34d399','Viagem':'#fb923c','Férias':'#4ade80','Folga':'#c084fc','Atestado':'#f87171' }
  const byTipo: Record<string,number> = {}
  registros.filter(r=>r.data?.startsWith(mes)).forEach(r=>{ byTipo[r.tipo]=(byTipo[r.tipo]||0)+(r.minutos||0) })

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, height:'100%' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {[
          {l:'Este mês',v:`${hMes}h${mMes>0?` ${mMes}m`:''}`,c:'#f59e0b'},
          {l:'Dias trabalhados',v:diasTrabMes,c:'#60a5fa'},
          {l:'Status hoje',v:emServico?'Ativo':'—',c:emServico?'#34d399':'#94a3b8'},
        ].map(k=>(
          <div key={k.l} style={{ padding:'14px', borderRadius:14, background:'rgba(255,255,255,0.03)', border:`1px solid ${k.c}20`, textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.3rem', color:k.c, lineHeight:1 }}>{k.v}</div>
            <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', marginTop:4 }}>{k.l}</div>
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'var(--font-mono)' }}>Por tipo este mês</div>
        {Object.entries(byTipo).map(([tipo,min])=>{
          const h=Math.floor(min/60); const m2=min%60; const maxMin=Math.max(...Object.values(byTipo))
          return (
            <div key={tipo} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:7 }}>
              <div style={{ width:80, fontSize:'0.72rem', color:'var(--text-secondary)', flexShrink:0 }}>{tipo}</div>
              <div style={{ flex:1, height:8, borderRadius:4, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${(min/maxMin)*100}%`, background:TIPOS_COR[tipo]||'#818cf8', borderRadius:4, transition:'width 0.6s' }} />
              </div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:TIPOS_COR[tipo]||'#818cf8', width:48, textAlign:'right' }}>{h}h{m2>0?`${m2}m`:''}</div>
            </div>
          )
        })}
        {Object.keys(byTipo).length===0 && <div style={{ color:'var(--text-muted)', fontSize:'0.8rem', textAlign:'center', padding:'16px' }}>Nenhum registro este mês</div>}
      </div>
      <button onClick={()=>onNavigate('ponto')} style={{ padding:'9px', borderRadius:10, border:'1px solid rgba(245,158,11,0.3)', background:'rgba(245,158,11,0.07)', color:'#fbbf24', fontWeight:700, fontSize:'0.78rem', cursor:'pointer', marginTop:'auto' }}>Abrir Ponto →</button>
    </div>
  )
}

// ─── PainelSaude ──────────────────────────────────────────────────────────────
function PainelSaude({ onNavigate }: any) {
  const uid = useUid()
  const [registros, setRegistros] = useState<any[]>([])
  useEffect(() => { if(!uid||!db) return; return onSnapshot(collection(db,`users/${uid}/saude`), s=>setRegistros(s.docs.map(d=>d.data()))) }, [uid])
  const hoje = new Date().toISOString().slice(0,10)
  const mes = hoje.slice(0,7)
  const regHoje = registros.find(r=>r.data===hoje)
  const regMes = registros.filter(r=>r.data?.startsWith(mes))
  let streak=0; const dCheck=new Date()
  while(true){ const ds=dCheck.toISOString().slice(0,10); if(!registros.find(r=>r.data===ds)) break; streak++; dCheck.setDate(dCheck.getDate()-1) }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, height:'100%' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {[
          {l:'Registros no mês',v:regMes.length,c:'#34d399'},
          {l:'Streak atual',v:`${streak}d`,c:'#f59e0b'},
          {l:'Hoje',v:regHoje?'✓ Registrado':'— Pendente',c:regHoje?'#34d399':'#94a3b8'},
        ].map(k=>(
          <div key={k.l} style={{ padding:'14px', borderRadius:14, background:'rgba(255,255,255,0.03)', border:`1px solid ${k.c}20`, textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.1rem', color:k.c, lineHeight:1 }}>{k.v}</div>
            <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', marginTop:4 }}>{k.l}</div>
          </div>
        ))}
      </div>
      <div style={{ flex:1, textAlign:'center', padding:'20px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 }}>
        <div style={{ fontSize:'4rem' }}>✚</div>
        <div style={{ color:'var(--text-muted)', fontSize:'0.82rem' }}>
          {streak > 0 ? `🔥 ${streak} dias consecutivos de registro!` : 'Nenhum registro ainda hoje'}
        </div>
      </div>
      <button onClick={()=>onNavigate('saude')} style={{ padding:'9px', borderRadius:10, border:'1px solid rgba(52,211,153,0.3)', background:'rgba(52,211,153,0.07)', color:'#34d399', fontWeight:700, fontSize:'0.78rem', cursor:'pointer' }}>Abrir Saúde →</button>
    </div>
  )
}

// ─── PainelWishlist ───────────────────────────────────────────────────────────
function PainelWishlist({ onNavigate }: any) {
  const uid = useUid()
  const [itens, setItens] = useState<any[]>([])
  useEffect(() => { if(!uid||!db) return; return onSnapshot(collection(db,`users/${uid}/wishlist`), s=>setItens(s.docs.map(d=>d.data()))) }, [uid])
  const pendentes = itens.filter(i=>i.status!=='comprado'&&i.status!=='cancelado')
  const total = pendentes.reduce((a:number,i:any)=>a+(i.preco||0),0)
  const fmtBRL = (v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0})
  const PRIO_COR: Record<string,string> = { urgente:'#f87171', alta:'#fb923c', media:'#fbbf24', baixa:'#34d399' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, height:'100%' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {[{l:'Itens',v:pendentes.length,c:'#f59e0b'},{l:'Total estimado',v:fmtBRL(total),c:'#fbbf24'},{l:'Alta prioridade',v:pendentes.filter((i:any)=>i.prioridade==='urgente'||i.prioridade==='alta').length,c:'#f87171'}].map(k=>(
          <div key={k.l} style={{ padding:'12px', borderRadius:14, background:'rgba(255,255,255,0.03)', border:`1px solid ${k.c}20`, textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.1rem', color:k.c, lineHeight:1 }}>{k.v}</div>
            <div style={{ fontSize:'0.58rem', color:'var(--text-muted)', marginTop:3 }}>{k.l}</div>
          </div>
        ))}
      </div>
      <div style={{ flex:1, overflowY:'auto' }}>
        {pendentes.slice(0,5).map((it:any)=>(
          <div key={it.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'0.8rem', fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.nome||it.titulo}</div>
              <div style={{ fontSize:'0.62rem', color:'var(--text-muted)' }}>{it.categoria}</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {it.preco>0 && <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.8rem', color:'#fbbf24' }}>{fmtBRL(it.preco)}</span>}
              <span style={{ fontSize:'0.6rem', padding:'2px 8px', borderRadius:10, background:`${PRIO_COR[it.prioridade]||'#94a3b8'}15`, color:PRIO_COR[it.prioridade]||'#94a3b8', border:`1px solid ${PRIO_COR[it.prioridade]||'#94a3b8'}25`, fontWeight:700 }}>{it.prioridade}</span>
            </div>
          </div>
        ))}
      </div>
      <button onClick={()=>onNavigate('wishlist')} style={{ padding:'9px', borderRadius:10, border:'1px solid rgba(245,158,11,0.3)', background:'rgba(245,158,11,0.07)', color:'#f59e0b', fontWeight:700, fontSize:'0.78rem', cursor:'pointer' }}>Abrir Wishlist →</button>
    </div>
  )
}

// ─── PainelDiario ─────────────────────────────────────────────────────────────
function PainelDiario({ onNavigate }: any) {
  const uid = useUid()
  const [dados, setDados] = useState<any>(null)
  const hoje = new Date().toISOString().slice(0,10)
  useEffect(() => {
    if(!uid||!db) return
    import('firebase/firestore').then(({getDoc})=>{
      getDoc(doc(db,'users',uid,'journal',hoje)).then(s=>{ if(s.exists()) setDados(s.data()) })
    })
  }, [uid])
  const tasks = dados?.planejamento||[]
  const feitas = tasks.filter((t:any)=>t.feito).length
  const eventos = dados?.timeline||[]
  const pensamento = dados?.pensamento||''

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, height:'100%' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {[{l:'Tasks hoje',v:tasks.length,c:'#818cf8'},{l:'Concluídas',v:feitas,c:'#34d399'},{l:'Eventos',v:eventos.length,c:'#60a5fa'}].map(k=>(
          <div key={k.l} style={{ padding:'14px', borderRadius:14, background:'rgba(255,255,255,0.03)', border:`1px solid ${k.c}20`, textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.5rem', color:k.c }}>{k.v}</div>
            <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', marginTop:3 }}>{k.l}</div>
          </div>
        ))}
      </div>
      {tasks.length > 0 && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.62rem', color:'var(--text-muted)', marginBottom:6, fontFamily:'var(--font-mono)' }}>
            <span>PROGRESSO TASKS</span><span style={{ color:'#818cf8', fontWeight:700 }}>{tasks.length>0?Math.round((feitas/tasks.length)*100):0}%</span>
          </div>
          <div style={{ height:8, borderRadius:4, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${tasks.length>0?(feitas/tasks.length)*100:0}%`, background:'linear-gradient(90deg,#6366f1,#818cf8)', borderRadius:4, transition:'width 0.6s' }} />
          </div>
        </div>
      )}
      {pensamento && (
        <div style={{ padding:'12px 16px', borderRadius:12, background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.15)', fontSize:'0.8rem', color:'var(--text-secondary)', lineHeight:1.6, fontStyle:'italic' }}>
          💭 {pensamento.slice(0,200)}{pensamento.length>200?'...':''}
        </div>
      )}
      <button onClick={()=>onNavigate('journal')} style={{ padding:'9px', borderRadius:10, border:'1px solid rgba(236,72,153,0.3)', background:'rgba(236,72,153,0.07)', color:'#f472b6', fontWeight:700, fontSize:'0.78rem', cursor:'pointer', marginTop:'auto' }}>Abrir Diário →</button>
    </div>
  )
}

// ─── PainelGaming ─────────────────────────────────────────────────────────────
function PainelGaming({ onNavigate }: any) {
  const uid = useUid()
  const [games, setGames] = useState<any[]>([])
  useEffect(() => { if(!uid||!db) return; return onSnapshot(collection(db,`users/${uid}/games`), s=>setGames(s.docs.map(d=>d.data()))) }, [uid])
  const jogando = games.filter(g=>g.status==='jogando')
  const zerados = games.filter(g=>g.status==='zerado'||g.status==='concluido')
  const backlog = games.filter(g=>g.status==='backlog'||g.status==='quero_jogar')

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, height:'100%' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {[{l:'Jogando',v:jogando.length,c:'#a78bfa'},{l:'Zerados',v:zerados.length,c:'#34d399'},{l:'Backlog',v:backlog.length,c:'#60a5fa'}].map(k=>(
          <div key={k.l} style={{ padding:'14px', borderRadius:14, background:'rgba(255,255,255,0.03)', border:`1px solid ${k.c}20`, textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.5rem', color:k.c }}>{k.v}</div>
            <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', marginTop:3 }}>{k.l}</div>
          </div>
        ))}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'var(--font-mono)' }}>Jogando agora</div>
        {jogando.length===0 ? <div style={{ textAlign:'center', padding:'20px', color:'var(--text-muted)', fontSize:'0.8rem' }}>Nenhum jogo em andamento</div>
          : jogando.map((g:any) => (
            <div key={g.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', marginBottom:6, borderRadius:10, background:'rgba(167,139,250,0.06)', border:'1px solid rgba(167,139,250,0.15)' }}>
              <div style={{ fontSize:'0.8rem', fontWeight:600, color:'var(--text-primary)' }}>{g.titulo||g.nome}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'#a78bfa', fontWeight:700 }}>{g.progresso||0}%</div>
            </div>
          ))
        }
      </div>
      <button onClick={()=>onNavigate('gaming')} style={{ padding:'9px', borderRadius:10, border:'1px solid rgba(124,58,237,0.3)', background:'rgba(124,58,237,0.07)', color:'#a78bfa', fontWeight:700, fontSize:'0.78rem', cursor:'pointer' }}>Abrir Gaming →</button>
    </div>
  )
}

// ─── PainelMedia ──────────────────────────────────────────────────────────────
function PainelMedia({ onNavigate }: any) {
  const uid = useUid()
  const [itens, setItens] = useState<any[]>([])
  useEffect(() => { if(!uid||!db) return; return onSnapshot(collection(db,`users/${uid}/media`), s=>setItens(s.docs.map(d=>d.data()))) }, [uid])
  const assistindo = itens.filter(i=>i.status==='assistindo'||i.status==='lendo'||i.status==='em_andamento')
  const concluidos = itens.filter(i=>i.status==='concluido'||i.status==='assistido'||i.status==='lido')
  const TIPOS_COR: Record<string,string> = { filme:'#60a5fa', serie:'#a78bfa', livro:'#34d399', anime:'#fb923c', podcast:'#f472b6' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, height:'100%' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {[{l:'Em andamento',v:assistindo.length,c:'#60a5fa'},{l:'Concluídos',v:concluidos.length,c:'#34d399'},{l:'Total',v:itens.length,c:'#94a3b8'}].map(k=>(
          <div key={k.l} style={{ padding:'14px', borderRadius:14, background:'rgba(255,255,255,0.03)', border:`1px solid ${k.c}20`, textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.5rem', color:k.c }}>{k.v}</div>
            <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', marginTop:3 }}>{k.l}</div>
          </div>
        ))}
      </div>
      <div style={{ flex:1 }}>
        {assistindo.slice(0,4).map((it:any)=>(
          <div key={it.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
            <div>
              <div style={{ fontSize:'0.8rem', fontWeight:600, color:'var(--text-primary)' }}>{it.titulo||it.nome}</div>
              <div style={{ fontSize:'0.62rem', color:'var(--text-muted)' }}>{it.tipo}</div>
            </div>
            <span style={{ fontSize:'0.6rem', padding:'2px 8px', borderRadius:10, background:`${TIPOS_COR[it.tipo]||'#818cf8'}15`, color:TIPOS_COR[it.tipo]||'#818cf8', fontWeight:700 }}>{it.tipo}</span>
          </div>
        ))}
        {assistindo.length===0 && <div style={{ textAlign:'center', padding:'20px', color:'var(--text-muted)', fontSize:'0.8rem' }}>Nenhuma mídia em andamento</div>}
      </div>
      <button onClick={()=>onNavigate('media')} style={{ padding:'9px', borderRadius:10, border:'1px solid rgba(59,130,246,0.3)', background:'rgba(59,130,246,0.07)', color:'#60a5fa', fontWeight:700, fontSize:'0.78rem', cursor:'pointer' }}>Abrir Media →</button>
    </div>
  )
}

// ─── PainelLinks ──────────────────────────────────────────────────────────────
function PainelLinks({ onNavigate }: any) {
  const uid = useUid()
  const [links, setLinks] = useState<any[]>([])
  useEffect(() => { if(!uid||!db) return; return onSnapshot(collection(db,`users/${uid}/links`), s=>setLinks(s.docs.map(d=>d.data()))) }, [uid])
  const CATS_COR: Record<string,string> = { profissional:'#60a5fa', pessoal:'#f472b6', sistemas:'#34d399', interesse:'#fbbf24', educacional:'#a78bfa', diversos:'#94a3b8' }
  const byCat: Record<string,number> = {}
  links.forEach(l=>{ byCat[l.categoria]=(byCat[l.categoria]||0)+1 })

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, height:'100%' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {[{l:'Total',v:links.length,c:'#00e5ff'},{l:'Categorias',v:Object.keys(byCat).length,c:'#60a5fa'},{l:'Recentes',v:links.slice(0,7).length,c:'#818cf8'}].map(k=>(
          <div key={k.l} style={{ padding:'14px', borderRadius:14, background:'rgba(255,255,255,0.03)', border:`1px solid ${k.c}20`, textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.5rem', color:k.c }}>{k.v}</div>
            <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', marginTop:3 }}>{k.l}</div>
          </div>
        ))}
      </div>
      <div>
        {Object.entries(byCat).map(([cat,n])=>(
          <div key={cat} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:7 }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background:CATS_COR[cat]||'#818cf8', flexShrink:0 }} />
            <div style={{ flex:1, fontSize:'0.75rem', color:'var(--text-secondary)', textTransform:'capitalize' }}>{cat}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:CATS_COR[cat]||'#818cf8', fontWeight:700 }}>{n}</div>
            <div style={{ width:80, height:5, borderRadius:3, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(n/Math.max(1,links.length))*100}%`, background:CATS_COR[cat]||'#818cf8', borderRadius:3 }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ flex:1, overflowY:'auto' }}>
        {links.slice(0,5).map((l:any)=>(
          <div key={l.id} style={{ display:'flex', gap:8, alignItems:'center', padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ width:3, height:24, borderRadius:2, background:CATS_COR[l.categoria]||'#818cf8', flexShrink:0 }} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'0.78rem', fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.titulo}</div>
              <div style={{ fontSize:'0.6rem', color:'var(--text-muted)' }}>{(l.url||'').replace(/^https?:\/\/(www\.)?/,'').split('/')[0]}</div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={()=>onNavigate('links')} style={{ padding:'9px', borderRadius:10, border:'1px solid rgba(0,229,255,0.2)', background:'rgba(0,229,255,0.05)', color:'var(--text-accent)', fontWeight:700, fontSize:'0.78rem', cursor:'pointer' }}>Abrir Links →</button>
    </div>
  )
}

function PainelGenerico({ modulo, onNavigate }: { modulo: typeof VIS_MODULOS[0]; onNavigate:(id:string)=>void }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:16 }}>
      <div style={{ fontSize:'4rem' }}>{modulo.icon}</div>
      <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.3rem', color:modulo.cor }}>{modulo.label}</div>
      <div style={{ fontSize:'0.8rem', color:'var(--text-muted)', textAlign:'center', maxWidth:300 }}>Clique abaixo para acessar o módulo completo</div>
      <button onClick={()=>onNavigate(modulo.id)} style={{ padding:'11px 28px', borderRadius:12, border:`1px solid ${modulo.cor}40`, background:`${modulo.cor}12`, color:modulo.cor, fontWeight:800, fontSize:'0.88rem', cursor:'pointer', fontFamily:'var(--font-display)' }}>Abrir {modulo.label} →</button>
    </div>
  )
}

function VisualDashboard({ onNavigate, global, discStats }: { onNavigate:(id:string)=>void; global:any; discStats:any[] }) {
  const [moduloAtivo, setModuloAtivo] = useState('editais')
  const mod = VIS_MODULOS.find(m => m.id === moduloAtivo) || VIS_MODULOS[0]

  function renderPainel() {
    switch(moduloAtivo) {
      case 'visao-geral': return <PainelVisaoGeral onNavigate={onNavigate} global={global} discStats={discStats} />
      case 'editais':    return <PainelEditais onNavigate={onNavigate} global={global} discStats={discStats} />
      case 'financeiro': return <PainelFinanceiro onNavigate={onNavigate} />
      case 'prontuario': return <PainelProntuario onNavigate={onNavigate} />
      case 'concursos':  return <PainelConcursos onNavigate={onNavigate} />
      case 'ponto':      return <PainelPonto onNavigate={onNavigate} />
      case 'saude':      return <PainelSaude onNavigate={onNavigate} />
      case 'wishlist':   return <PainelWishlist onNavigate={onNavigate} />
      case 'journal':    return <PainelDiario onNavigate={onNavigate} />
      case 'gaming':     return <PainelGaming onNavigate={onNavigate} />
      case 'media':      return <PainelMedia onNavigate={onNavigate} />
      case 'links':      return <PainelLinks onNavigate={onNavigate} />
      default:           return <PainelGenerico modulo={mod} onNavigate={onNavigate} />
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg-0)' }}>
      {/* ── BARRA SUPERIOR DE MÓDULOS ── */}
      <div style={{ display:'flex', alignItems:'center', gap:2, padding:'8px 16px', background:'var(--bg-1)', borderBottom:'1px solid var(--border)', flexShrink:0, overflowX:'auto', flexWrap:'nowrap' }}>
        {VIS_MODULOS.map(m => {
          const ativo = m.id === moduloAtivo
          return (
            <button key={m.id} onClick={() => setModuloAtivo(m.id)}
              style={{ position:'relative', display:'flex', alignItems:'center', gap:7, padding:'8px 16px', borderRadius:10, border:`1px solid ${ativo?`${m.cor}50`:'transparent'}`, background:ativo?`${m.cor}14`:'transparent', color:ativo?m.cor:'var(--text-muted)', fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.78rem', cursor:'pointer', transition:'all 0.18s cubic-bezier(0.4,0,0.2,1)', whiteSpace:'nowrap', flexShrink:0, boxShadow:ativo?`0 2px 12px ${m.cor}20`:'none' }}
              onMouseEnter={e=>{ if(!ativo){ const el=e.currentTarget as HTMLElement; el.style.background=`${m.cor}0a`; el.style.color=m.cor; el.style.border=`1px solid ${m.cor}30`; el.style.transform='translateY(-1px)' }}}
              onMouseLeave={e=>{ if(!ativo){ const el=e.currentTarget as HTMLElement; el.style.background='transparent'; el.style.color='var(--text-muted)'; el.style.border='1px solid transparent'; el.style.transform='translateY(0)' }}}>
              <span style={{ display:'flex', alignItems:'center', fontSize: m.svgIcon?'inherit':'1rem', color:ativo?m.cor:'inherit' }}>
                {m.svgIcon === 'editais' ? <IconEditaisVis size={15} color={ativo?m.cor:'currentColor'} /> : m.icon}
              </span>
              {m.label}
              {ativo && (
                <>
                  <div style={{ width:5, height:5, borderRadius:'50%', background:m.cor, boxShadow:`0 0 8px ${m.cor}` }} />
                  <div style={{ position:'absolute', bottom:-1, left:'10%', right:'10%', height:2, borderRadius:2, background:`linear-gradient(90deg,transparent,${m.cor},transparent)` }} />
                </>
              )}
            </button>
          )
        })}
      </div>

      {/* ── PAINEL DE CONTEÚDO ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'24px 28px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <div style={{ width:42, height:42, borderRadius:12, background:`${mod.cor}15`, border:`1px solid ${mod.cor}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.3rem' }}>{mod.icon}</div>
          <div>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.1rem', color:mod.cor }}>{mod.label}</div>
            <div style={{ fontSize:'0.68rem', color:'var(--text-muted)' }}>Visão geral do módulo</div>
          </div>
          <button onClick={()=>onNavigate(moduloAtivo)} style={{ marginLeft:'auto', padding:'7px 16px', borderRadius:9, border:`1px solid ${mod.cor}35`, background:`${mod.cor}08`, color:mod.cor, fontWeight:700, fontSize:'0.75rem', cursor:'pointer' }}>Abrir módulo ↗</button>
        </div>
        <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:18, padding:'22px', minHeight:320 }}>
          {renderPainel()}
        </div>
      </div>

      {/* ── BARRA INFERIOR COM INFO DO DIA ── */}
      <BarraInferior />
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function NexusDashboard({ onNavigate, dashView = 'widgets' }: Props) {
  const hooks = useEditaisAGU()
  const ponto = usePontoStats()
  const { layouts, ativo, ativoId, saveWidgets, novoLayout, deletarLayout, trocarLayout, resetar, duplicarWidget } = useLayouts()
  const [editing, setEditing] = useState(false)
  const [showPanel, setShowPanel] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [showLayouts, setShowLayouts] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const [gridW, setGridW] = useState(900)
  const isMobile = useIsMobile()
  const { editais: editaisCadastrados } = useEditaisCadastrados()
  const [editalCarouselIdx, setEditalCarouselIdx] = useState(0)

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
      case 'kpi-edital': {
        // Carousel: show AGU built-in + any cadastrado editais
        const allEditaisForCarousel = [
          { id: 'agu-builtin', nome: 'Edital AGU', orgao: 'AGU', cor: '#00e5ff', isBuiltin: true },
          ...editaisCadastrados.map(e => ({ id: e.id, nome: e.nome, orgao: e.orgao, cor: e.cor, isBuiltin: false }))
        ]
        const totalEditais = allEditaisForCarousel.length
        const safeidx = editalCarouselIdx % totalEditais
        const current = allEditaisForCarousel[safeidx]
        if (current.isBuiltin) {
          return (
            <div style={{ position:'relative', height:'100%' }}>
              <KpiCard label="Progresso AGU" value={`${global.pctConcluido}%`} sub={`${global.concluidos}/${TOTAL_SUBTOPICOS} subtópicos`} color="#00e5ff" />
              {totalEditais > 1 && (
                <div style={{ position:'absolute', bottom:6, right:8, display:'flex', gap:4, alignItems:'center' }}>
                  <span style={{ fontSize:'0.6rem', color:'rgba(255,255,255,0.3)', fontFamily:'var(--font-mono)' }}>{safeidx+1}/{totalEditais}</span>
                  <button onClick={e=>{e.stopPropagation();setEditalCarouselIdx(i=>(i+1)%totalEditais)}} style={{ width:22,height:22,borderRadius:6,border:'1px solid rgba(0,229,255,0.3)',background:'rgba(0,229,255,0.08)',color:'#00e5ff',fontSize:'0.8rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0 }}>›</button>
                </div>
              )}
            </div>
          )
        }
        return (
          <div style={{ position:'relative', height:'100%' }}>
            <WidgetEditalDinamico editalId={current.id} nome={current.nome} cor={current.cor} orgao={current.orgao} onNavigate={onNavigate} />
            <div style={{ position:'absolute', bottom:6, right:8, display:'flex', gap:4, alignItems:'center' }}>
              <span style={{ fontSize:'0.6rem', color:'rgba(255,255,255,0.3)', fontFamily:'var(--font-mono)' }}>{safeidx+1}/{totalEditais}</span>
              <button onClick={e=>{e.stopPropagation();setEditalCarouselIdx(i=>(i+1)%totalEditais)}} style={{ width:22,height:22,borderRadius:6,border:`1px solid ${current.cor}40`,background:`${current.cor}12`,color:current.cor,fontSize:'0.8rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0 }}>›</button>
            </div>
          </div>
        )
      }
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
      case 'gaming-widget':      return <GamingWidget onNavigate={onNavigate} />
      case 'media-widget':       return <MediaWidget onNavigate={onNavigate} />
      case 'diario-widget':      return <DiarioWidget onNavigate={onNavigate} />
      case 'links-widget':       return <LinksWidget onNavigate={onNavigate} />
      case 'financeiro-widget':  return <ContasPagarCard onNavigate={onNavigate} />
      case 'concursos-widget':   return <ConcursosDashCard onNavigate={onNavigate} />
      case 'modulos':             return <ModulosCard global={global} ponto={ponto} onNavigate={onNavigate} />
      default: {
        // Widget dinâmico de edital customizado
        if (w.id.startsWith('edital-') || w.id.startsWith('agu-')) {
          const parts = WIDGET_LABELS[w.id]?.split(' · ') || []
          const nome = parts[0]?.replace('⚖ ', '') || w.id
          const orgao = parts[1] || ''
          const cor = parts[2] || '#4f46e5'
          return <WidgetEditalDinamico editalId={w.id} nome={nome} cor={cor} orgao={orgao} onNavigate={onNavigate} />
        }
        return null
      }
    }
  }

  if (dashView === 'visual') {
    return <VisualDashboard onNavigate={onNavigate} global={global} discStats={discStats} />
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
          {editaisCadastrados.length > 0 && (
            <div style={{ marginBottom:10, padding:'8px 12px', borderRadius:8, background:'rgba(0,229,255,0.06)', border:'1px solid rgba(0,229,255,0.15)' }}>
              <div style={{ fontSize:'0.6rem', color:'var(--text-accent)', fontFamily:'var(--font-mono)', letterSpacing:'0.08em', marginBottom:6 }}>⚖ EDITAIS CADASTRADOS — use as setas no widget "Progresso Edital" para navegar</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                {editaisCadastrados.map((e:any) => (
                  <span key={e.id} style={{ fontSize:'0.68rem', padding:'2px 10px', borderRadius:20, background:`${e.cor}18`, color:e.cor, border:`1px solid ${e.cor}35`, fontWeight:600 }}>
                    {e.nome} · {e.orgao}
                  </span>
                ))}
              </div>
            </div>
          )}
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

      {/* Grid — desktop: drag&drop | mobile: stack linear */}
      {isMobile ? (
        <div style={{ display:'flex',flexDirection:'column',gap:12,padding:'0 4px 20px' }}>
          {ativo.widgets.filter(w=>w.visible).map(w=>(
            <div key={w.id} style={{ width:'100%',minHeight:w.h===1?120:w.h===2?200:260,borderRadius:14,overflow:'hidden' }}>
              {renderWidget(w)}
            </div>
          ))}
        </div>
      ) : (
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
      )}

      {editing&&<div style={{ textAlign:'center',padding:'12px 0',fontSize:'0.72rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)' }}>🖱 Arraste pelo topo · Redimensione no canto inferior direito · ⧉ Duplica o widget</div>}
    </div>
  )
}
