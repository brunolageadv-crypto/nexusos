import React from 'react'
import { createPortal } from 'react-dom'
import PainelChecklistDia from './ChecklistDia'
import { GAMES, getLevel } from './Arcade'
import PainelGeosfera from './GeosferaCard'
import VisaoGeral, { PaginaInicial } from './VisaoGeral'
import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { AGU_DISCIPLINAS, TOTAL_SUBTOPICOS } from '../editais/aguData'
import { useEditaisCadastrados, useEdital } from '../../hooks/useEdital'
import { useEditaisAGU } from '../../hooks/useEditaisAGU'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore'

interface Props { onNavigate: (id: string) => void; dashView?: 'noticias' | 'visual' | 'home' }

interface Widget {
  id: string; col: number; row: number; w: number; h: number; visible: boolean
}
interface Layout {
  id: string; nome: string; widgets: Widget[]
}

const COLS = 12
const ROW_H = 120
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
  'diario-widget':     '✦ Notas',
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
  const hoje = new Date(Date.now()-3*3600000).toISOString().slice(0,10)
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
  const hoje = new Date(Date.now()-3*3600000).toISOString().slice(0,10)
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
  const hoje = new Date(Date.now()-3*3600000).toISOString().slice(0,10)
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
    const hoje = new Date(Date.now()-3*3600000).toISOString().slice(0,10)
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

function useViagensConfirmadas() {
  const [viagens, setViagens] = useState<any[]>([])
  const uid = useUid()
  useEffect(() => {
    if (!uid || !db) return
    return onSnapshot(collection(db, `users/${uid}/viagens`), snap => setViagens(snap.docs.map(d => d.data())))
  }, [uid])
  return viagens.filter(v => v.status === 'Confirmada').sort((a: any, b: any) => (a.dataInicio || '').localeCompare(b.dataInicio || ''))
}

function useLogsHoje() {
  const [logs, setLogs] = useState<any[]>([])
  const uid = useUid()
  useEffect(() => {
    if (!uid || !db) return
    return onSnapshot(collection(db, `users/${uid}/logs`), snap => setLogs(snap.docs.map(d => d.data())))
  }, [uid])
  const hoje = new Date(Date.now()-3*3600000).toISOString().slice(0,10)
  const logHoje = logs.filter(l => l.data === hoje)
  const total = logs.length
  const minHoje = logHoje.reduce((a: number, l: any) => a + (l.duracao || 0), 0)
  return { logHoje, total, minHoje }
}
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
  const hoje = new Date(Date.now()-3*3600000)
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
  const [notas, setNotas] = useState<any[]>([])
  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, 'users', uid, 'notas'), snap => {
      const list = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a:any,b:any)=>b.criadoEm-a.criadoEm)
      setNotas(list)
    })
  }, [uid])
  const recentes = notas.slice(0,3)
  const COR_MAP: Record<string,string> = { azul:'#1A73E8',verde:'#10b981',roxo:'#8B5CF6',amarelo:'#f59e0b',vermelho:'#ef4444',default:'var(--text-accent)' }
  return (
    <div className="card" style={{ padding:0,overflow:'hidden',height:'100%',boxSizing:'border-box',display:'flex',flexDirection:'column' }}>
      <div style={{ padding:'10px 14px',borderBottom:'1px solid var(--border-md)',background:'linear-gradient(90deg,rgba(138,180,248,0.07)0%,transparent 100%)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em' }}>✦ Notas</div>
        <div style={{ fontSize:'0.65rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)' }}>{notas.length} nota(s)</div>
      </div>
      <div style={{ flex:1,padding:'10px 14px',display:'flex',flexDirection:'column',gap:7,overflowY:'auto' }}>
        {recentes.length===0
          ? <div style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8 }}>
              <span style={{ fontSize:'2rem' }}>✦</span>
              <p style={{ margin:0,fontSize:'0.72rem',color:'var(--text-muted)',textAlign:'center' }}>Nenhuma nota ainda</p>
            </div>
          : recentes.map((n:any) => {
              const c = COR_MAP[n.cor||'default']||'var(--text-accent)'
              return (
                <div key={n.id} style={{ padding:'8px 10px',borderRadius:9,background:`${c}08`,border:`1px solid ${c}20` }}>
                  {n.titulo && <div style={{ fontSize:'0.72rem',fontWeight:700,color:'var(--text-primary)',marginBottom:2 }}>{n.titulo}</div>}
                  <div style={{ fontSize:'0.7rem',color:'var(--text-secondary)',lineHeight:1.45,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden' }}>{n.conteudo}</div>
                  <div style={{ fontSize:'0.58rem',color:'var(--text-muted)',marginTop:3,fontFamily:'var(--font-mono)' }}>{new Date(n.data+'T12:00:00').toLocaleDateString('pt-BR')}</div>
                </div>
              )
            })
        }
      </div>
      <div style={{ padding:'6px 14px',borderTop:'1px solid var(--border-md)',flexShrink:0 }}>
        <button onClick={()=>onNavigate('journal')} style={{ width:'100%',padding:'6px',borderRadius:7,border:'1px solid rgba(138,180,248,0.3)',background:'rgba(138,180,248,0.06)',color:'var(--text-accent)',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.7rem',cursor:'pointer' }}>
          Ver Notas →
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
    { id:'journal',    label:'Notas',             icon:'✦', desc:'Suas notas e apontamentos',                          color:'#8ab4f8' },
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
const VIS_MODULOS = [
  { id: 'visao-geral', icon: '◈',  label: 'Visão Geral', cor: '#6366f1', svgIcon: null },
  { id: 'editais',    icon: '',    label: 'Editais',     cor: '#00e5ff', svgIcon: 'editais' },
  { id: 'concursos',  icon: '🎯', label: 'Concursos',   cor: '#7c3aed', svgIcon: null },
  { id: 'financeiro', icon: '◎',  label: 'Financeiro',  cor: '#10b981', svgIcon: null },
  { id: 'prontuario', icon: '📋', label: 'Prontuário',  cor: '#5b5bd6', svgIcon: null },
  { id: 'ponto',      icon: '⊙',  label: 'Ponto',       cor: '#f59e0b', svgIcon: null },
  { id: 'saude',      icon: '✚',  label: 'Saúde',       cor: '#34d399', svgIcon: null },
  { id: 'wishlist',   icon: '🛒', label: 'Wishlist',    cor: '#f59e0b', svgIcon: null },
  { id: 'journal',    icon: '✦',  label: 'Notas',       cor: '#8ab4f8', svgIcon: null },
  { id: 'gaming',     icon: '🎮', label: 'Gaming',      cor: '#7c3aed', svgIcon: null },
  { id: 'media',      icon: '▶',  label: 'Media',       cor: '#3b82f6', svgIcon: null },
  { id: 'links',      icon: '🔗', label: 'Links',       cor: '#00e5ff', svgIcon: null },
]

/* ── Paleta única da barra inferior (cinza + azul, elegante) ── */
const B_AZUL = '#5b80ad'
const B_AZUL_D = '#3f6390'
const pctSty: React.CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.92rem', color: B_AZUL }
const subSty: React.CSSProperties = { fontSize: '0.55rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
function BarraProg({ pct }: { pct: number }) {
  return (
    <div style={{ height: 7, borderRadius: 4, background: 'var(--bg-4)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg,${B_AZUL_D},${B_AZUL})`, borderRadius: 4, transition: 'width .6s' }} />
    </div>
  )
}

/* ── Controle de água interativo (grava em users/{uid}/saude/{data}, integrado à aba Saúde) ── */
function AguaControle({ cardSty, labelSty }: any) {
  const uid = useUid()
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
  const [reg, setReg] = useState<any>(null)
  useEffect(() => {
    if (!uid || !db) return
    return onSnapshot(doc(db, 'users', uid, 'saude', hoje), s => setReg(s.exists() ? s.data() : null))
  }, [uid, hoje])
  const agua = reg?.agua ?? 0
  const meta = reg?.metaAgua ?? 2000
  const pct = Math.min(Math.round((agua / Math.max(meta, 1)) * 100), 100)
  const add = async (ml: number) => {
    if (!uid) return
    const novo = Math.max(0, Math.min(agua + ml, 6000))
    if (reg) await setDoc(doc(db, 'users', uid, 'saude', hoje), { agua: novo }, { merge: true })
    else await setDoc(doc(db, 'users', uid, 'saude', hoje), {
      id: Math.random().toString(36).slice(2, 10), data: hoje, agua: novo, metaAgua: 2000,
      sono: { inicio: '', fim: '', qualidade: 3 }, humor: 3, energia: 3,
      treino: { realizado: false, tipo: '', duracao: 0 }, peso: 0, sintomas: [], notas: '', criadoEm: Date.now(),
    })
  }
  const setMeta = async (m: number) => {
    if (!uid) return
    const mm = Math.max(500, Math.min(m, 6000))
    if (reg) await setDoc(doc(db, 'users', uid, 'saude', hoje), { metaAgua: mm }, { merge: true })
    else { await add(0); await setDoc(doc(db, 'users', uid, 'saude', hoje), { metaAgua: mm }, { merge: true }) }
  }
  const L = (ml: number) => (ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 1) + 'L'
  const cor = B_AZUL
  return (
    <div style={{ ...cardSty(), flex: '1.5 1 0', minWidth: 0 } as React.CSSProperties}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <div style={labelSty}>💧 Controle de água</div>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.95rem', color: cor }}>{L(agua)}</span>
      </div>
      <BarraProg pct={pct} />
      <div style={{ display: 'flex', gap: 4 }}>
        {[200, 250, 330, 500, 1000].map(ml => (
          <button key={ml} onClick={() => add(ml)} title="Clique para adicionar"
            style={{ flex: 1, minWidth: 0, padding: '4px 2px', borderRadius: 7, border: `1px solid ${cor}40`, background: `${cor}12`, color: cor, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.58rem', cursor: 'pointer' }}>
            {ml >= 1000 ? '1L' : ml + 'ml'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <span style={subSty}>Meta: {L(meta)}</span>
        <div style={{ display: 'flex', gap: 3 }}>
          <button onClick={() => add(-250)} title="Remover 250ml" style={miniBtn(cor)}>−</button>
          <button onClick={() => setMeta(meta - 250)} title="Diminuir meta" style={miniBtn('#94a3b8')}>−</button>
          <button onClick={() => setMeta(meta + 250)} title="Aumentar meta" style={miniBtn('#94a3b8')}>+</button>
        </div>
      </div>
    </div>
  )
}
const miniBtn = (cor: string): React.CSSProperties => ({ padding: '2px 7px', borderRadius: 6, border: `1px solid ${cor}40`, background: 'transparent', color: cor, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.62rem', cursor: 'pointer', lineHeight: 1 })

/* ── Dias Restantes (eventos futuros com contagem regressiva) ── */
interface EventoDR { id: string; titulo: string; data: string; icone: string; progresso: number | null; criadoEm: number }
const DR_ICONES = ['📅','🎯','✈️','🎓','⚖️','🏆','🎂','💼','❤️','🏠','📝','🎉']
const drNav = (cor: string): React.CSSProperties => ({ width: 20, height: 20, borderRadius: 6, border: `1px solid ${cor}33`, background: `${cor}12`, color: cor, fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 })
const drInp: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.72rem', padding: '6px 9px', width: '100%', fontFamily: 'var(--font-body)' }

function DiasRestantesCard({ cardSty, labelSty }: any) {
  const uid = useUid()
  const cardRef = useRef<HTMLDivElement>(null)
  const [eventos, setEventos] = useState<EventoDR[]>([])
  const [idx, setIdx] = useState(0)
  const [form, setForm] = useState<Partial<EventoDR> | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!uid || !db) return
    return onSnapshot(query(collection(db, `users/${uid}/dias_restantes`), orderBy('data', 'asc')), snap =>
      setEventos(snap.docs.map(d => d.data() as EventoDR)))
  }, [uid])
  // recalcula a contagem regressiva sozinho (cobre a virada do dia)
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 60000); return () => clearInterval(t) }, [])
  useEffect(() => { if (idx >= eventos.length) setIdx(Math.max(0, eventos.length - 1)) }, [eventos.length, idx])

  const hojeISO = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
  const diasAte = (data: string) => { if (!data) return 0; return Math.round((new Date(data + 'T12:00').getTime() - new Date(hojeISO + 'T12:00').getTime()) / 86400000) }
  const fmtBR = (d: string) => { if (!d) return ''; const [y, m, dy] = d.split('-'); return `${dy}/${m}/${y}` }
  // progresso automático: 0% no dia do cadastro → 100% no dia do evento (proporcional aos dias)
  const progressoAuto = (ev: EventoDR) => {
    const startISO = new Date((ev.criadoEm ?? Date.now()) - 3 * 3600000).toISOString().slice(0, 10)
    const total = Math.round((new Date(ev.data + 'T12:00').getTime() - new Date(startISO + 'T12:00').getTime()) / 86400000)
    if (total <= 0) return diasAte(ev.data) <= 0 ? 100 : 0
    return Math.max(0, Math.min(100, Math.round(((total - diasAte(ev.data)) / total) * 100)))
  }
  const cor = B_AZUL

  const salvar = async () => {
    if (!uid || !form || !form.titulo || !form.data) return
    const ev: EventoDR = {
      id: form.id ?? Math.random().toString(36).slice(2, 10),
      titulo: form.titulo, data: form.data, icone: form.icone ?? '📅',
      progresso: null,
      criadoEm: form.criadoEm ?? Date.now(),
    }
    await setDoc(doc(db, `users/${uid}/dias_restantes`, ev.id), ev)
    setForm(null)
  }
  const excluir = async (id: string) => { if (uid && db) await deleteDoc(doc(db, `users/${uid}/dias_restantes`, id)) }

  const atual = eventos[idx]
  const dias = atual ? diasAte(atual.data) : 0
  const txtDias = dias > 0 ? `${dias} ${dias === 1 ? 'dia restante' : 'dias restantes'}` : dias === 0 ? 'É hoje!' : 'Evento concluído'
  const corDias = dias < 0 ? 'var(--text-muted)' : cor

  return (
    <div ref={cardRef} style={{ ...cardSty(), flex: '1.9 1 0', minWidth: 0, position: 'relative' } as React.CSSProperties}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <div style={labelSty}>⏳ Dias restantes</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {eventos.length > 1 && (<>
            <button onClick={() => setIdx(i => (i - 1 + eventos.length) % eventos.length)} style={drNav(cor)} title="Evento anterior">‹</button>
            <span style={{ fontSize: '0.52rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', minWidth: 22, textAlign: 'center' }}>{idx + 1}/{eventos.length}</span>
            <button onClick={() => setIdx(i => (i + 1) % eventos.length)} style={drNav(cor)} title="Próximo evento">›</button>
          </>)}
          {atual && <button onClick={() => excluir(atual.id)} style={drNav('#b06a6a')} title="Cancelar este evento">✕</button>}
          <button onClick={() => setForm({ icone: '📅', progresso: null, data: '', titulo: '' })} style={drNav(cor)} title="Cadastrar evento">＋</button>
        </div>
      </div>

      {atual ? (
        <>
          <div onClick={() => setForm({ ...atual })} title="Clique para editar" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, cursor: 'pointer' }}>
            <span style={{ fontSize: '0.9rem' }}>{atual.icone}</span>
            <span style={{ fontWeight: 700, fontSize: '0.74rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{atual.titulo}</span>
            <span style={{ marginLeft: 'auto', ...subSty }}>📅 {fmtBR(atual.data)}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.98rem', color: corDias, lineHeight: 1 }}>{txtDias}</div>
          {(() => { const pct = progressoAuto(atual); return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Progresso do tempo até o evento">
              <div style={{ flex: 1 }}><BarraProg pct={pct} /></div>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.6rem', color: cor }}>{pct}%</span>
            </div>
          ) })()}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Nenhum evento cadastrado</div>
          <button onClick={() => setForm({ icone: '📅', progresso: null, data: '', titulo: '' })} style={{ alignSelf: 'flex-start', padding: '3px 10px', borderRadius: 7, border: `1px solid ${cor}40`, background: `${cor}12`, color: cor, fontWeight: 700, fontSize: '0.6rem', cursor: 'pointer' }}>＋ Cadastrar evento</button>
        </div>
      )}

      {form && createPortal((() => {
        const r = cardRef.current?.getBoundingClientRect()
        const bottom = r ? Math.max(12, window.innerHeight - r.top + 8) : 84
        const right = r ? Math.max(12, window.innerWidth - r.right) : 16
        return (
          <div style={{ position: 'fixed', bottom, right, width: 300, background: 'var(--card-bg)', border: `1px solid ${cor}55`, borderRadius: 14, padding: '13px 15px', boxShadow: '0 16px 40px rgba(0,0,0,0.38)', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.62rem', color: cor, fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{form.id ? 'Editar evento' : 'Novo evento'}</div>
              <button onClick={() => setForm(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.05rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <input autoFocus value={form.titulo ?? ''} onChange={e => setForm(f => ({ ...f!, titulo: e.target.value }))} placeholder="Título (ex.: Concurso PGM Curitiba)" style={drInp} />
            <input type="date" value={form.data ?? ''} onChange={e => setForm(f => ({ ...f!, data: e.target.value }))} style={drInp} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {DR_ICONES.map(ic => (
                <button key={ic} onClick={() => setForm(f => ({ ...f!, icone: ic }))} style={{ width: 27, height: 27, borderRadius: 7, border: `1px solid ${form.icone === ic ? cor : 'var(--border)'}`, background: form.icone === ic ? `${cor}18` : 'transparent', cursor: 'pointer', fontSize: '0.88rem', lineHeight: 1 }}>{ic}</button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button onClick={() => setForm(null)} style={{ padding: '6px 13px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={salvar} disabled={!form.titulo || !form.data} style={{ padding: '6px 15px', borderRadius: 8, border: 'none', background: (!form.titulo || !form.data) ? 'var(--bg-4)' : cor, color: '#fff', fontSize: '0.68rem', fontWeight: 700, cursor: (!form.titulo || !form.data) ? 'default' : 'pointer' }}>Salvar</button>
            </div>
          </div>
        )
      })(), document.body)}
    </div>
  )
}

function BarraInferior() {
  const [hora, setHora] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setHora(new Date()), 1000); return () => clearInterval(t) }, [])

  const DIAS_PT = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado']
  const DIAS_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
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
  const diasNoMes = diaMes
  const totalDiasMes = new Date(ano, mesNum, 0).getDate()
  const pctMes = Math.round((diasNoMes/totalDiasMes)*100)
  const diasRestMes = totalDiasMes - diaMes

  const cardSty = (): React.CSSProperties => ({
    display: 'flex', flexDirection: 'column', gap: 4, padding: '7px 12px',
    borderRadius: 11, border: '1px solid var(--border)', background: 'var(--surface)',
    flex: '1 1 0', minWidth: 0,
  })
  const labelSty: React.CSSProperties = { fontSize: '0.55rem', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

  return (
    <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-1)', flexShrink: 0, padding: '9px 14px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', overflow: 'hidden' }}>

        {/* Relógio */}
        <div style={cardSty()}>
          <div style={labelSty}>⏱ Horário local</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 900, fontSize: '1.2rem', color: B_AZUL, letterSpacing: '0.03em', lineHeight: 1 }}>{horaStr}</div>
          <div style={subSty}>{diaSemanaShort} · UTC-3</div>
        </div>

        {/* Data */}
        <div style={cardSty()}>
          <div style={labelSty}>📅 Data</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.3rem', color: B_AZUL, lineHeight: 1 }}>{diaMes}</span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{mes.slice(0, 3).toUpperCase()} {ano}</span>
          </div>
          <div style={subSty}>{diaSemana}</div>
        </div>

        {/* Progresso do Ano */}
        <div style={{ ...cardSty(), flex: '1.2 1 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
            <div style={labelSty}>📊 Ano {ano}</div>
            <span style={pctSty}>{pctAno}%</span>
          </div>
          <BarraProg pct={pctAno} />
          <div style={subSty}>Dia {diasNoAno}/{totalDias} · S{semanaISO}</div>
        </div>

        {/* Progresso do Mês */}
        <div style={{ ...cardSty(), flex: '1.1 1 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
            <div style={labelSty}>🗓 {mes.slice(0, 3).toUpperCase()}</div>
            <span style={pctSty}>{pctMes}%</span>
          </div>
          <BarraProg pct={pctMes} />
          <div style={subSty}>{diasRestMes} dias restantes</div>
        </div>

        {/* Progresso do Dia */}
        {(() => {
          const totalMinsDia = 24 * 60
          const minsPassados = hora.getHours() * 60 + hora.getMinutes()
          const pctDia = Math.round((minsPassados / totalMinsDia) * 100)
          const hRestantes = Math.floor((totalMinsDia - minsPassados) / 60)
          const mRestantes = (totalMinsDia - minsPassados) % 60
          return (
            <div style={{ ...cardSty(), flex: '1.1 1 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <div style={labelSty}>🌅 Hoje</div>
                <span style={pctSty}>{pctDia}%</span>
              </div>
              <BarraProg pct={pctDia} />
              <div style={subSty}>{hRestantes}h {mRestantes}min restantes</div>
            </div>
          )
        })()}

        {/* Controle de água interativo (integrado à aba Saúde) */}
        <AguaControle cardSty={cardSty} labelSty={labelSty} />
        {/* Dias restantes (eventos com contagem regressiva) */}
        <DiasRestantesCard cardSty={cardSty} labelSty={labelSty} />

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
  const mes = new Date(Date.now()-3*3600000).toISOString().slice(0,7)
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
  const mes = new Date(Date.now()-3*3600000).toISOString().slice(0,7)
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

  // Drag and drop state
  const [ordem, setOrdem] = useState(() => ['editais','financeiro','prontuario','concursos','ponto','financeiro2','saude','wishlist','diario','gaming','media','agua','calendario','contas-pagar-mini','ponto-saldo','agenda-hoje','agenda-semana','viagens-confirmadas','logs-hoje','checklist-dia','arcade','geosfera'])
  const [dragging, setDragging] = useState<string|null>(null)
  const [dragOver, setDragOver] = useState<string|null>(null)

  const handleDragStart = (id: string) => setDragging(id)
  const handleDragOver = (e: React.DragEvent, id: string) => { e.preventDefault(); setDragOver(id) }
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!dragging || dragging === targetId) { setDragging(null); setDragOver(null); return }
    setOrdem(prev => {
      const next = [...prev]
      const fromIdx = next.indexOf(dragging)
      const toIdx = next.indexOf(targetId)
      next.splice(fromIdx, 1)
      next.splice(toIdx, 0, dragging)
      return next
    })
    setDragging(null); setDragOver(null)
  }
  const handleDragEnd = () => { setDragging(null); setDragOver(null) }

  const renderCard = (id: string) => {
    const m = modulos.find(x => x.id === id)
    if (m) return (
      <button key={m.id} onClick={()=>onNavigate(m.id==='financeiro2'?'financeiro':m.id)}
        draggable onDragStart={()=>handleDragStart(m.id)} onDragEnd={handleDragEnd}
        onDragOver={e=>handleDragOver(e,m.id)} onDrop={e=>handleDrop(e,m.id)}
        style={{ padding:'16px 20px', borderRadius:16, border:`1px solid ${dragOver===m.id?m.cor+'80':m.cor+'25'}`, background: dragOver===m.id?`${m.cor}18`:`linear-gradient(135deg,${m.cor}0a,transparent)`, textAlign:'left', cursor:'grab', transition:'all 0.2s', opacity: dragging===m.id?0.45:1, transform: dragging===m.id?'scale(0.97)':'none' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
              <span style={{ fontSize:'0.55rem', color:'var(--text-muted)', opacity:0.5, cursor:'grab' }}>⠿</span>
              <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', fontFamily:'var(--font-mono)' }}>{m.label}</div>
            </div>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.5rem', color:m.cor, lineHeight:1 }}>{m.valor}</div>
            <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:3 }}>{m.sub}</div>
          </div>
          <span style={{ fontSize:'1.5rem', opacity:0.6 }}>{m.icon}</span>
        </div>
        <div style={{ marginTop:8 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.6rem', color:'var(--text-muted)', marginBottom:4 }}>
            <span>Progresso</span><span style={{ fontWeight:700, color:m.cor }}>{m.pct}%</span>
          </div>
          <div style={{ height:6, borderRadius:3, background:'rgba(0,0,0,0.07)', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${m.pct}%`, background:`linear-gradient(90deg,${m.cor},${m.cor}99)`, borderRadius:3, transition:'width 0.8s', boxShadow:`0 0 8px ${m.cor}40` }} />
          </div>
        </div>
      </button>
    )
    // Secondary cards
    const props = { onNavigate, dragging, dragOver, onDragStart: handleDragStart, onDragEnd: handleDragEnd, onDragOver: handleDragOver, onDrop: handleDrop }
    switch(id) {
      case 'saude':    return <PainelVisaoGeralSaude    key="saude"    {...props} />
      case 'wishlist': return <PainelVisaoGeralWishlist key="wishlist" {...props} />
      case 'diario':   return <PainelVisaoGeralDiario   key="diario"   {...props} />
      case 'gaming':   return <PainelVisaoGeralGaming   key="gaming"   {...props} />
      case 'media':    return <PainelVisaoGeralMedia    key="media"    {...props} />
      case 'agua':         return <PainelVisaoGeralAgua       key="agua"         {...props} />
      case 'calendario':   return <PainelVisaoGeralCalendario key="calendario"   {...props} />
      case 'contas-pagar-mini': return <PainelVisaoGeralContasPagar key="contas-pagar-mini" {...props} />
      case 'ponto-saldo':  return <PainelVisaoGeralPontoSaldo key="ponto-saldo"  {...props} />
      case 'agenda-hoje':  return <PainelVisaoGeralAgendaHoje  key="agenda-hoje"  {...props} />
      case 'agenda-semana': return <PainelVisaoGeralAgendaSemana key="agenda-semana" {...props} />
      case 'viagens-confirmadas': return <PainelVisaoGeralViagensConfirmadas key="viagens-confirmadas" {...props} />
      case 'logs-hoje': return <PainelVisaoGeralLogs key="logs-hoje" {...props} />
      case 'checklist-dia': return <PainelChecklistDia key="checklist-dia" {...props} />
      case 'arcade': return <PainelArcadeLauncher key="arcade" onNavigate={onNavigate} dragging={dragging} dragOver={dragOver} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragOver={handleDragOver} onDrop={handleDrop} />
      case 'geosfera': return <PainelGeosfera key="geosfera" {...props} />
      default: return null
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <div style={{ fontSize:'0.6rem', color:'var(--text-muted)', fontFamily:'var(--font-mono)', textAlign:'right', marginBottom:6, opacity:0.6 }}>
        ⠿ Arraste os cards para reorganizar
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(230px,1fr))', gap:14 }}>
        {ordem.map(id => renderCard(id))}
      </div>
    </div>
  )
}


// ─── Mini Cards extras Visão Geral ──────────────────────────────────────────

// ─── Cards de Agenda na Visão Geral ──────────────────────────────────────────
function PainelVisaoGeralAgendaHoje({ onNavigate, dragging, dragOver: _dOah, onDragStart, onDragEnd, onDragOver, onDrop }: any) {
  const uid = useUid()
  const [eventos, setEventos] = useState<any[]>([])
  const hoje = new Date(Date.now()-3*3600000).toISOString().slice(0,10)
  useEffect(() => { if(!uid||!db) return; return onSnapshot(query(collection(db,`users/${uid}/agenda`),orderBy('data','asc')), s=>setEventos(s.docs.map(d=>d.data()))) }, [uid])
  const evHoje = eventos.filter(e=>e.data===hoje)
  const pendentes = evHoje.filter(e=>!e.concluido)
  const concluidos = evHoje.filter(e=>e.concluido)
  const cor = pendentes.length > 0 ? '#1A73E8' : '#0F9D58'
  const TIPO_COR: Record<string,string> = { reuniao:'#1A73E8',prazo:'#D93025',pessoal:'#F29900',juridico:'#7B1FA2',saude:'#0F9D58',financeiro:'#00897B',estudo:'#3949AB',viagem:'#039BE5',aniversario:'#E91E63',outro:'#78909C' }
  const TIPO_ICO: Record<string,string> = { reuniao:'🗣',prazo:'⏰',pessoal:'🏠',juridico:'⚖',saude:'✚',financeiro:'◎',estudo:'📚',viagem:'✈',aniversario:'🎂',outro:'◈' }
  return (
    <button onClick={()=>onNavigate('agenda')} draggable
      onDragStart={()=>onDragStart?.('agenda-hoje')} onDragEnd={()=>onDragEnd?.()}
      onDragOver={e=>onDragOver?.(e,'agenda-hoje')} onDrop={e=>onDrop?.(e,'agenda-hoje')}
      style={{ padding:'16px 20px', borderRadius:16, border:`1px solid ${cor}25`, background:`linear-gradient(135deg,${cor}08,transparent)`, textAlign:'left', cursor:'grab', transition:'all 0.2s', opacity:dragging==='agenda-hoje'?0.45:1 }}
      onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-2px)';el.style.boxShadow=`0 8px 24px ${cor}18`}}
      onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(0)';el.style.boxShadow='none'}}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div>
          <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', fontFamily:'var(--font-mono)', marginBottom:4 }}>📅 Agenda · Hoje</div>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.5rem', color:cor, lineHeight:1 }}>{evHoje.length} evento{evHoje.length!==1?'s':''}</div>
          <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:3 }}>{concluidos.length} concluído{concluidos.length!==1?'s':''} · {pendentes.length} pendente{pendentes.length!==1?'s':''}</div>
        </div>
        <span style={{ fontSize:'1.5rem', opacity:0.6 }}>📅</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:4 }}>
        {evHoje.slice(0,3).map((e:any)=>(
          <div key={e.id} style={{ display:'flex', alignItems:'center', gap:7, padding:'5px 8px', borderRadius:8, background:`${TIPO_COR[e.tipo]||'#1A73E8'}10`, border:`1px solid ${TIPO_COR[e.tipo]||'#1A73E8'}20` }}>
            <span style={{ fontSize:'0.8rem' }}>{TIPO_ICO[e.tipo]||'◈'}</span>
            <span style={{ fontSize:'0.72rem', fontWeight:600, color:'var(--text-primary)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textDecoration:e.concluido?'line-through':'none' }}>{e.horaInicio&&`${e.horaInicio} `}{e.titulo}</span>
          </div>
        ))}
        {evHoje.length===0 && <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontStyle:'italic' }}>Nenhum evento hoje</div>}
      </div>
      <div style={{ marginTop:10, height:4, borderRadius:2, background:'var(--bg-4)', overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${evHoje.length>0?(concluidos.length/evHoje.length)*100:0}%`, background:cor, borderRadius:2, transition:'width 0.6s' }} />
      </div>
    </button>
  )
}

function PainelVisaoGeralAgendaSemana({ onNavigate, dragging, dragOver: _dOas, onDragStart, onDragEnd, onDragOver, onDrop }: any) {
  const uid = useUid()
  const [eventos, setEventos] = useState<any[]>([])
  useEffect(() => { if(!uid||!db) return; return onSnapshot(query(collection(db,`users/${uid}/agenda`),orderBy('data','asc')), s=>setEventos(s.docs.map(d=>d.data()))) }, [uid])
  const hoje = new Date(Date.now()-3*3600000)
  const ini = new Date(hoje); ini.setDate(hoje.getDate()-hoje.getDay())
  const fim = new Date(ini); fim.setDate(ini.getDate()+6)
  const iniStr = ini.toISOString().slice(0,10)
  const fimStr = fim.toISOString().slice(0,10)
  const evSemana = eventos.filter(e=>e.data>=iniStr&&e.data<=fimStr)
  const proxPrazo = eventos.filter(e=>e.tipo==='prazo'&&e.data>=new Date(Date.now()-3*3600000).toISOString().slice(0,10)&&!e.concluido).sort((a:any,b:any)=>a.data.localeCompare(b.data))[0]
  const cor = '#7B1FA2'
  const DIAS_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  const diasSemana = Array.from({length:7},(_,i)=>{ const d=new Date(ini); d.setDate(ini.getDate()+i); return d })
  const evPorDia = diasSemana.map(d=>eventos.filter(e=>e.data===d.toISOString().slice(0,10)).length)
  const maxEv = Math.max(...evPorDia, 1)
  return (
    <button onClick={()=>onNavigate('agenda')} draggable
      onDragStart={()=>onDragStart?.('agenda-semana')} onDragEnd={()=>onDragEnd?.()}
      onDragOver={e=>onDragOver?.(e,'agenda-semana')} onDrop={e=>onDrop?.(e,'agenda-semana')}
      style={{ padding:'16px 20px', borderRadius:16, border:`1px solid ${cor}25`, background:`linear-gradient(135deg,${cor}08,transparent)`, textAlign:'left', cursor:'grab', transition:'all 0.2s', opacity:dragging==='agenda-semana'?0.45:1 }}
      onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-2px)';el.style.boxShadow=`0 8px 24px ${cor}18`}}
      onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(0)';el.style.boxShadow='none'}}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
        <div>
          <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', fontFamily:'var(--font-mono)', marginBottom:4 }}>📆 Agenda · Semana</div>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.5rem', color:cor, lineHeight:1 }}>{evSemana.length} evento{evSemana.length!==1?'s':''}</div>
          {proxPrazo && <div style={{ fontSize:'0.68rem', color:'#D93025', marginTop:3, fontWeight:600 }}>⏰ Prazo: {proxPrazo.titulo}</div>}
        </div>
        <span style={{ fontSize:'1.5rem', opacity:0.6 }}>📆</span>
      </div>
      {/* Mini bar chart da semana */}
      <div style={{ display:'flex', gap:4, alignItems:'flex-end', height:32 }}>
        {diasSemana.map((d,i)=>{
          const isToday = d.toISOString().slice(0,10)===new Date(Date.now()-3*3600000).toISOString().slice(0,10)
          const h = evPorDia[i]>0 ? Math.max(8,(evPorDia[i]/maxEv)*28) : 4
          return (
            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
              <div style={{ width:'100%', height:h, borderRadius:3, background:isToday?cor:`${cor}40`, transition:'height 0.4s' }} />
              <div style={{ fontSize:'0.52rem', color:isToday?cor:'var(--text-muted)', fontWeight:isToday?700:400 }}>{DIAS_SHORT[i]}</div>
            </div>
          )
        })}
      </div>
    </button>
  )
}

function PainelVisaoGeralViagensConfirmadas({ onNavigate, dragging, dragOver: _dOvc, onDragStart, onDragEnd, onDragOver, onDrop }: any) {
  const confirmadas = useViagensConfirmadas()
  const cor = '#34d399'
  return (
    <button onClick={() => onNavigate('viagens')} draggable
      onDragStart={() => onDragStart?.('viagens-confirmadas')} onDragEnd={() => onDragEnd?.()}
      onDragOver={e => onDragOver?.(e, 'viagens-confirmadas')} onDrop={e => onDrop?.(e, 'viagens-confirmadas')}
      style={{ padding: '16px 20px', borderRadius: 16, border: `1px solid ${cor}25`, background: `linear-gradient(135deg,${cor}08,transparent)`, textAlign: 'left', cursor: 'grab', transition: 'all 0.2s', opacity: dragging === 'viagens-confirmadas' ? 0.45 : 1 }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'translateY(-2px)'; el.style.boxShadow = `0 8px 24px ${cor}18` }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'translateY(0)'; el.style.boxShadow = 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>✈️ Viagens · Confirmadas</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: cor, lineHeight: 1 }}>{confirmadas.length}</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 3 }}>viagem(ns) confirmada(s)</div>
        </div>
        <span style={{ fontSize: '1.5rem', opacity: 0.6 }}>✈️</span>
      </div>
      {confirmadas.length === 0 ? (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhuma viagem confirmada</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          {confirmadas.slice(0, 2).map((v: any) => (
            <div key={v.id || v.titulo} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 9px', borderRadius: 9, background: `${cor}10`, border: `1px solid ${cor}20` }}>
              <span style={{ fontSize: '0.85rem' }}>🟢</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.titulo}</div>
                {v.dataInicio && <div style={{ fontSize: '0.6rem', color: cor, fontFamily: 'var(--font-mono)' }}>{new Date(v.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</div>}
              </div>
            </div>
          ))}
          {confirmadas.length > 2 && <div style={{ fontSize: '0.62rem', color: cor, textAlign: 'right', marginTop: 2 }}>+{confirmadas.length - 2} mais →</div>}
        </div>
      )}
    </button>
  )
}

function PainelVisaoGeralLogs({ onNavigate, dragging, dragOver: _dOlogs, onDragStart, onDragEnd, onDragOver, onDrop }: any) {
  const { logHoje, total, minHoje } = useLogsHoje()
  const cor = '#a78bfa'
  const CAT_CORES: Record<string, string> = {
    'Trabalho': '#60a5fa', 'Estudo': '#a78bfa', 'Jurídico': '#818cf8', 'Concurso': '#c084fc',
    'Saude': '#34d399', 'Exercicio': '#10b981', 'Financas': '#fbbf24', 'Reuniao': '#f59e0b',
  }
  return (
    <button onClick={() => onNavigate('logs')} draggable
      onDragStart={() => onDragStart?.('logs-hoje')} onDragEnd={() => onDragEnd?.()}
      onDragOver={e => onDragOver?.(e, 'logs-hoje')} onDrop={e => onDrop?.(e, 'logs-hoje')}
      style={{ padding: '16px 20px', borderRadius: 16, border: `1px solid ${cor}25`, background: `linear-gradient(135deg,${cor}08,transparent)`, textAlign: 'left', cursor: 'grab', transition: 'all 0.2s', opacity: dragging === 'logs-hoje' ? 0.45 : 1 }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'translateY(-2px)'; el.style.boxShadow = `0 8px 24px ${cor}18` }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'translateY(0)'; el.style.boxShadow = 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>📋 Logs · Hoje</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: cor, lineHeight: 1 }}>{logHoje.length}</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 3 }}>
            {minHoje > 0 ? `${Math.floor(minHoje / 60)}h${minHoje % 60 > 0 ? String(minHoje % 60) + 'min' : ''} registrado(s)` : 'registro(s) hoje'}
          </div>
        </div>
        <span style={{ fontSize: '1.5rem', opacity: 0.6 }}>📋</span>
      </div>
      {logHoje.length === 0 ? (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhum registro hoje · Clique para registrar</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
          {logHoje.slice(0, 3).map((l: any, i: number) => (
            <div key={l.id || i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 8, background: `${CAT_CORES[l.categoria] || cor}10`, border: `1px solid ${CAT_CORES[l.categoria] || cor}20` }}>
              <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', flexShrink: 0 }}>{l.hora}</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.titulo}</span>
            </div>
          ))}
          {logHoje.length > 3 && <div style={{ fontSize: '0.62rem', color: cor, textAlign: 'right', marginTop: 2 }}>+{logHoje.length - 3} mais →</div>}
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Total histórico: {total} registros</div>
    </button>
  )
}

function PainelVisaoGeralAgua({ onNavigate, dragging, dragOver: _dOagua, onDragStart, onDragEnd, onDragOver, onDrop }: any) {
  const uid = useUid()
  const [ml, setMl] = useState(0)
  const [adding, setAdding] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const meta = 2000
  const hoje = useMemo(() => new Date(Date.now()-3*3600000).toISOString().slice(0,10), [])

  useEffect(() => {
    if(!uid||!db) return
    // Usa onSnapshot para reagir em tempo real (inclusive ao salvar do SaudeWidget)
    return onSnapshot(doc(db,'users',uid,'agua',hoje), s => {
      if(s.exists()) setMl(s.data().ml||0)
      else setMl(0)
    })
  }, [uid, hoje])

  const addAgua = useCallback(async (delta: number) => {
    if(!uid||!db) return
    setMl(prev => {
      const novoMl = Math.max(0, prev + delta)
      setDoc(doc(db,'users',uid,'agua',hoje), { ml: novoMl, data: hoje, meta })
      return novoMl
    })
  }, [uid, hoje])

  const addCustom = async () => {
    const v = parseInt(inputVal)
    if(!isNaN(v)&&v>0) { addAgua(v); setInputVal(''); setAdding(false) }
  }

  const pct = Math.min(100, Math.round((ml/meta)*100))
  const cor = pct >= 80 ? '#1A73E8' : pct >= 50 ? '#8AB4F8' : '#DADCE0'

  return (
    <div draggable
      onDragStart={()=>onDragStart?.('agua')} onDragEnd={()=>onDragEnd?.()}
      onDragOver={e=>onDragOver?.(e,'agua')} onDrop={e=>onDrop?.(e,'agua')}
      style={{ padding:'16px 20px', borderRadius:16, border:`1px solid ${cor}30`, background:`linear-gradient(135deg,${cor}08,transparent)`, transition:'all 0.2s', opacity:dragging==='agua'?0.45:1, cursor:'grab', display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', fontFamily:'var(--font-mono)', marginBottom:4 }}>💧 Água hoje</div>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.5rem', color:cor, lineHeight:1 }}>{ml}ml</div>
          <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:3 }}>Meta: {meta}ml · {pct}%</div>
        </div>
        <div style={{ width:38, height:38, borderRadius:'50%', border:`3px solid ${cor}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.1rem', background:`${cor}10` }}>
          💧
        </div>
      </div>
      <div style={{ height:6, borderRadius:3, background:'var(--bg-4)', overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,${cor},${cor}bb)`, borderRadius:3, transition:'width 0.8s' }} />
      </div>
      {/* Botões rápidos */}
      <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
        {[150,200,300].map(v=>(
          <button key={v} onClick={e=>{e.stopPropagation();addAgua(v)}}
            style={{ flex:1, padding:'5px 4px', borderRadius:7, border:`1px solid ${cor}30`, background:`${cor}10`, color:cor, fontSize:'0.68rem', fontWeight:700, cursor:'pointer', fontFamily:'var(--font-mono)' }}>
            +{v}ml
          </button>
        ))}
        <button onClick={e=>{e.stopPropagation();setAdding(p=>!p)}}
          style={{ padding:'5px 8px', borderRadius:7, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'var(--text-muted)', fontSize:'0.68rem', cursor:'pointer' }}>
          ✏
        </button>
      </div>
      {/* Input custom */}
      {adding && (
        <div style={{ display:'flex', gap:6 }} onClick={e=>e.stopPropagation()}>
          <input type="number" value={inputVal} onChange={e=>setInputVal(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter')addCustom()}}
            placeholder="ml personalizado"
            style={{ flex:1, padding:'5px 10px', borderRadius:7, border:`1px solid ${cor}30`, background:'rgba(255,255,255,0.05)', color:'var(--text-primary)', fontSize:'0.78rem', outline:'none' }} />
          <button onClick={addCustom}
            style={{ padding:'5px 12px', borderRadius:7, border:`1px solid ${cor}40`, background:`${cor}18`, color:cor, fontWeight:700, fontSize:'0.75rem', cursor:'pointer' }}>OK</button>
        </div>
      )}
      <button onClick={e=>{e.stopPropagation();onNavigate('saude')}}
        style={{ width:'100%', padding:'5px', borderRadius:7, border:`1px solid ${cor}25`, background:'none', color:cor, fontFamily:'var(--font-display)', fontWeight:600, fontSize:'0.68rem', cursor:'pointer', opacity:0.7 }}>
        Saúde & Bem-Estar →
      </button>
    </div>
  )
}

function PainelVisaoGeralCalendario({ dragging, dragOver: _dOcal, onDragStart, onDragEnd, onDragOver, onDrop }: any) {
  const hoje = new Date(Date.now()-3*3600000)
  const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const ano = hoje.getFullYear(), mes = hoje.getMonth()
  const primeiroDia = new Date(ano, mes, 1).getDay()
  const totalDias = new Date(ano, mes+1, 0).getDate()
  const dias = Array.from({length: primeiroDia}, () => 0).concat(Array.from({length: totalDias}, (_, i) => i+1))
  const cor = '#1A73E8'
  return (
    <div draggable onDragStart={()=>onDragStart?.('calendario')} onDragEnd={()=>onDragEnd?.()}
      onDragOver={e=>onDragOver?.(e,'calendario')} onDrop={e=>onDrop?.(e,'calendario')}
      style={{ padding:'16px 18px', borderRadius:16, border:`1px solid ${cor}20`, background:`linear-gradient(135deg,${cor}06,transparent)`, cursor:'grab', opacity:dragging==='calendario'?0.45:1, transition:'all 0.2s' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:'0.82rem', color:'var(--text-primary)' }}>
          {MESES[mes]} {ano}
        </div>
        <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.3rem', color:cor, lineHeight:1 }}>{hoje.getDate()}</div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:6 }}>
        {DIAS.map(d => <div key={d} style={{ textAlign:'center', fontSize:'0.52rem', fontWeight:600, color:'var(--text-muted)', padding:'2px 0' }}>{d}</div>)}
        {dias.map((d, i) => (
          <div key={i} style={{ textAlign:'center', fontSize:'0.62rem', padding:'3px 2px', borderRadius:6,
            background: d===hoje.getDate()?cor:'transparent',
            color: d===0?'transparent': d===hoje.getDate()?'#fff': d===hoje.getDay()?cor:'var(--text-secondary)',
            fontWeight: d===hoje.getDate()?700:400,
          }}>{d||''}</div>
        ))}
      </div>
      <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
        {DIAS[hoje.getDay()]} · Semana {Math.ceil(hoje.getDate()/7)}
      </div>
    </div>
  )
}

function PainelVisaoGeralContasPagar({ onNavigate, dragging, dragOver: _dOcp, onDragStart, onDragEnd, onDragOver, onDrop }: any) {
  const uid = useUid()
  const [contas, setContas] = useState<any[]>([])
  useEffect(() => { if(!uid||!db) return; return onSnapshot(query(collection(db,`users/${uid}/contasPagar`),orderBy('vencimento','asc')), s=>setContas(s.docs.map(d=>d.data()))) }, [uid])
  const pendentes = contas.filter(c=>!c.pago)
  const total = pendentes.reduce((a:number,c:any)=>a+c.valor,0)
  const fmtBRL = (v:number) => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0})
  const hoje = new Date(Date.now()-3*3600000).toISOString().slice(0,10)
  const urgentes = pendentes.filter(c=>{const d=Math.ceil((new Date(c.vencimento+'T00:00:00').getTime()-Date.now())/86400000);return d<=7&&d>=0})
  const vencidas = pendentes.filter(c=>c.vencimento<hoje)
  const cor = vencidas.length>0?'#D93025':urgentes.length>0?'#F29900':'#1A73E8'
  return (
    <button onClick={()=>onNavigate('financeiro')} draggable
      onDragStart={()=>onDragStart?.('contas-pagar-mini')} onDragEnd={()=>onDragEnd?.()}
      onDragOver={e=>onDragOver?.(e,'contas-pagar-mini')} onDrop={e=>onDrop?.(e,'contas-pagar-mini')}
      style={{ padding:'16px 20px', borderRadius:16, border:`1px solid ${cor}25`, background:`linear-gradient(135deg,${cor}07,transparent)`, textAlign:'left', cursor:'grab', transition:'all 0.2s', opacity:dragging==='contas-pagar-mini'?0.45:1 }}
      onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-2px)';el.style.boxShadow=`0 8px 24px ${cor}18`}}
      onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(0)';el.style.boxShadow='none'}}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
        <div>
          <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', fontFamily:'var(--font-mono)', marginBottom:4 }}>⚠ Contas a Pagar</div>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.5rem', color:cor, lineHeight:1 }}>{fmtBRL(total)}</div>
          <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:3 }}>{pendentes.length} pendente{pendentes.length!==1?'s':''}</div>
        </div>
        <span style={{ fontSize:'1.5rem', opacity:0.6 }}>💳</span>
      </div>
      {vencidas.length > 0 && <div style={{ fontSize:'0.65rem', color:'#D93025', fontWeight:600, marginBottom:4 }}>⚠ {vencidas.length} vencida{vencidas.length!==1?'s':''}</div>}
      {urgentes.length > 0 && <div style={{ fontSize:'0.65rem', color:'#F29900', fontWeight:600, marginBottom:4 }}>⏰ {urgentes.length} vence em breve</div>}
      <div style={{ height:4, borderRadius:2, background:'var(--bg-4)', overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${contas.length>0?(contas.filter(c=>c.pago).length/contas.length)*100:0}%`, background:cor, borderRadius:2, transition:'width 0.6s' }} />
      </div>
    </button>
  )
}

function PainelVisaoGeralPontoSaldo({ onNavigate, dragging, dragOver: _dOps, onDragStart, onDragEnd, onDragOver, onDrop }: any) {
  const uid = useUid()
  const [registros, setRegistros] = useState<any[]>([])
  useEffect(() => { if(!uid||!db) return; return onSnapshot(query(collection(db,`users/${uid}/ponto`),orderBy('data','desc')), s=>setRegistros(s.docs.map(d=>d.data()))) }, [uid])
  const mes = new Date(Date.now()-3*3600000).toISOString().slice(0,7)
  const META_DIA = 480
  const regMes = registros.filter(r=>r.data?.startsWith(mes)&&(r.tipo==='trabalho'||r.tipo==='homeoffice')&&r.minutos>0)
  const saldo = regMes.reduce((a,r)=>a+(r.minutos-META_DIA),0)
  const hS = Math.floor(Math.abs(saldo)/60), mS = Math.abs(saldo)%60
  const saldoStr = `${saldo>=0?'+':'-'}${hS}h${mS>0?` ${mS}m`:''}`
  const cor = saldo>=0?'#0F9D58':'#D93025'
  const fmtHM = (m:number)=>`${Math.floor(m/60)}h${m%60>0?` ${m%60}m`:''}`
  const totalMes = regMes.reduce((a,r)=>a+r.minutos,0)
  return (
    <button onClick={()=>onNavigate('ponto')} draggable
      onDragStart={()=>onDragStart?.('ponto-saldo')} onDragEnd={()=>onDragEnd?.()}
      onDragOver={e=>onDragOver?.(e,'ponto-saldo')} onDrop={e=>onDrop?.(e,'ponto-saldo')}
      style={{ padding:'16px 20px', borderRadius:16, border:`1px solid ${cor}25`, background:`linear-gradient(135deg,${cor}07,transparent)`, textAlign:'left', cursor:'grab', transition:'all 0.2s', opacity:dragging==='ponto-saldo'?0.45:1 }}
      onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-2px)';el.style.boxShadow=`0 8px 24px ${cor}18`}}
      onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(0)';el.style.boxShadow='none'}}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
        <div>
          <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', fontFamily:'var(--font-mono)', marginBottom:4 }}>⊙ Saldo Ponto</div>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.5rem', color:cor, lineHeight:1 }}>{saldo===0?'0h':saldoStr}</div>
          <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:3 }}>{fmtHM(totalMes)} trabalhados este mês</div>
        </div>
        <span style={{ fontSize:'1.5rem', opacity:0.6 }}>{saldo>=0?'✅':'⚡'}</span>
      </div>
      <div style={{ height:4, borderRadius:2, background:'var(--bg-4)', overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${Math.min(100,Math.round((totalMes/(regMes.length||1)/META_DIA)*100))}%`, background:cor, borderRadius:2 }} />
      </div>
    </button>
  )
}

function PainelVisaoGeralSaude({ onNavigate, dragging, dragOver: _dOsaude, onDragStart, onDragEnd, onDragOver, onDrop }: any) {
  const uid = useUid()
  const [registros, setRegistros] = useState<any[]>([])
  useEffect(() => { if(!uid||!db) return; return onSnapshot(collection(db,`users/${uid}/saude`), s=>setRegistros(s.docs.map(d=>d.data()))) }, [uid])
  const mes = new Date(Date.now()-3*3600000).toISOString().slice(0,7)
  const regMes = registros.filter(r=>r.data?.startsWith(mes))
  let streak=0; const dCheck=new Date()
  while(true){ const ds=dCheck.toISOString().slice(0,10); if(!registros.find((r:any)=>r.data===ds)) break; streak++; dCheck.setDate(dCheck.getDate()-1) }
  const cor='#34d399'
  return (
    <button onClick={()=>onNavigate('saude')} draggable onDragStart={()=>onDragStart?.('saude')} onDragEnd={()=>onDragEnd?.()} onDragOver={e=>onDragOver?.(e,'saude')} onDrop={e=>onDrop?.(e,'saude')} style={{ padding:'16px 20px', borderRadius:16, border:`1px solid ${cor}25`, background:`linear-gradient(135deg,${cor}0a,transparent)`, textAlign:'left', cursor:'grab', transition:'all 0.2s', opacity: dragging==='saude'?0.45:1 }}
      onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-2px)';el.style.boxShadow=`0 8px 24px ${cor}20`}}
      onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(0)';el.style.boxShadow='none'}}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
        <div>
          <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', fontFamily:'var(--font-mono)', marginBottom:4 }}>Saúde</div>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.5rem', color:cor, lineHeight:1 }}>{streak}d</div>
          <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:3 }}>{regMes.length} registros este mês</div>
        </div>
        <span style={{ fontSize:'1.5rem', opacity:0.6 }}>✚</span>
      </div>
      <div style={{ height:6, borderRadius:3, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${Math.min(100,streak*10)}%`, background:`linear-gradient(90deg,${cor},${cor}99)`, borderRadius:3, boxShadow:`0 0 8px ${cor}40` }} />
      </div>
    </button>
  )
}

function PainelVisaoGeralWishlist({ onNavigate, dragging, dragOver: _dOwishlist, onDragStart, onDragEnd, onDragOver, onDrop }: any) {
  const uid = useUid()
  const [itens, setItens] = useState<any[]>([])
  useEffect(() => { if(!uid||!db) return; return onSnapshot(collection(db,`users/${uid}/wishlist`), s=>setItens(s.docs.map(d=>d.data()))) }, [uid])
  const pendentes = itens.filter(i=>i.status!=='comprado'&&i.status!=='cancelado')
  const total = pendentes.reduce((a:number,i:any)=>a+(i.preco||0),0)
  const fmtBRL=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0})
  const cor='#f59e0b'
  const pct = itens.length>0?Math.round((itens.filter(i=>i.status==='comprado').length/itens.length)*100):0
  return (
    <button onClick={()=>onNavigate('wishlist')} draggable onDragStart={()=>onDragStart?.('wishlist')} onDragEnd={()=>onDragEnd?.()} onDragOver={e=>onDragOver?.(e,'wishlist')} onDrop={e=>onDrop?.(e,'wishlist')} style={{ padding:'16px 20px', borderRadius:16, border:`1px solid ${cor}25`, background:`linear-gradient(135deg,${cor}0a,transparent)`, textAlign:'left', cursor:'grab', transition:'all 0.2s', opacity: dragging==='wishlist'?0.45:1 }}
      onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-2px)';el.style.boxShadow=`0 8px 24px ${cor}20`}}
      onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(0)';el.style.boxShadow='none'}}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
        <div>
          <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', fontFamily:'var(--font-mono)', marginBottom:4 }}>Wishlist</div>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.5rem', color:cor, lineHeight:1 }}>{pendentes.length} itens</div>
          <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:3 }}>{fmtBRL(total)} estimado</div>
        </div>
        <span style={{ fontSize:'1.5rem', opacity:0.6 }}>🛒</span>
      </div>
      <div style={{ marginTop:8 }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.6rem', color:'var(--text-muted)', marginBottom:4 }}>
          <span>Adquiridos</span><span style={{ fontWeight:700, color:cor }}>{pct}%</span>
        </div>
        <div style={{ height:6, borderRadius:3, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,${cor},${cor}99)`, borderRadius:3 }} />
        </div>
      </div>
    </button>
  )
}

function PainelVisaoGeralDiario({ onNavigate, dragging, dragOver: _dOdiario, onDragStart, onDragEnd, onDragOver, onDrop }: any) {
  const uid = useUid()
  const [notas, setNotas] = useState<any[]>([])
  useEffect(() => {
    if(!uid||!db) return
    return onSnapshot(collection(db, `users/${uid}/notas`), s => {
      const list = s.docs.map(d=>({id:d.id,...d.data()})).sort((a:any,b:any)=>b.criadoEm-a.criadoEm)
      setNotas(list)
    })
  }, [uid])
  const recente = notas[0]
  const cor = '#8ab4f8'
  return (
    <button onClick={()=>onNavigate('journal')} draggable onDragStart={()=>onDragStart?.('diario')} onDragEnd={()=>onDragEnd?.()} onDragOver={e=>onDragOver?.(e,'diario')} onDrop={e=>onDrop?.(e,'diario')} style={{ padding:'16px 20px', borderRadius:16, border:`1px solid ${cor}25`, background:`linear-gradient(135deg,${cor}0a,transparent)`, textAlign:'left', cursor:'grab', transition:'all 0.2s', opacity: dragging==='diario'?0.45:1 }}
      onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-2px)';el.style.boxShadow=`0 8px 24px ${cor}20`}}
      onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(0)';el.style.boxShadow='none'}}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div>
          <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', fontFamily:'var(--font-mono)', marginBottom:4 }}>✦ Notas</div>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.5rem', color:cor, lineHeight:1 }}>{notas.length}</div>
          <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:3 }}>{notas.filter((n:any)=>n.fixada).length} fixadas</div>
        </div>
        <span style={{ fontSize:'1.5rem', opacity:0.6 }}>✦</span>
      </div>
      {recente && (
        <div style={{ padding:'7px 10px', borderRadius:9, background:`${cor}08`, border:`1px solid ${cor}18` }}>
          {recente.titulo && <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--text-primary)', marginBottom:2 }}>{recente.titulo}</div>}
          <div style={{ fontSize:'0.68rem', color:'var(--text-secondary)', lineHeight:1.4, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{recente.conteudo}</div>
        </div>
      )}
    </button>
  )
}

function PainelArcadeLauncher({ onNavigate, dragging, dragOver: _dOarcade, onDragStart, onDragEnd, onDragOver, onDrop }: any) {
  const [xp, setXp] = useState(0)
  useEffect(() => {
    try { const v = localStorage.getItem('arcade_xp'); setXp(v ? JSON.parse(v) : 0) } catch { setXp(0) }
  }, [])
  let stats = { played: 0, wins: 0 }
  try { const s = localStorage.getItem('arcade_stats'); if (s) { const p = JSON.parse(s); stats = { played: p.played || 0, wins: p.wins || 0 } } } catch { /* noop */ }
  const lv = getLevel(xp)
  const cor = '#7c3aed'
  return (
    <button onClick={()=>onNavigate('arcade')} draggable onDragStart={()=>onDragStart?.('arcade')} onDragEnd={()=>onDragEnd?.()} onDragOver={e=>onDragOver?.(e,'arcade')} onDrop={e=>onDrop?.(e,'arcade')} style={{ padding:'16px 20px', borderRadius:16, border:`1px solid ${cor}25`, background:`linear-gradient(135deg,${cor}0a,transparent)`, textAlign:'left', cursor:'grab', transition:'all 0.2s', opacity: dragging==='arcade'?0.45:1 }}
      onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-2px)';el.style.boxShadow=`0 8px 24px ${cor}20`}}
      onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(0)';el.style.boxShadow='none'}}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
        <div>
          <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', fontFamily:'var(--font-mono)', marginBottom:4 }}>Arcade</div>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.5rem', color:cor, lineHeight:1 }}>{GAMES.length} jogos</div>
          <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:3 }}>Nível {lv} · {xp.toLocaleString('pt-BR')} XP · {stats.wins} vitórias</div>
        </div>
        <span style={{ fontSize:'1.5rem', opacity:0.6 }}>🕹️</span>
      </div>
      <div style={{ marginTop:8, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'9px 14px', borderRadius:12, background:`linear-gradient(135deg,${cor},#a855f7)`, color:'#fff', fontWeight:800, fontSize:'0.82rem' }}>
        ▶ Abrir Arcade
      </div>
    </button>
  )
}

function PainelVisaoGeralGaming({ onNavigate, dragging, dragOver: _dOgaming, onDragStart, onDragEnd, onDragOver, onDrop }: any) {
  const uid = useUid()
  const [games, setGames] = useState<any[]>([])
  useEffect(() => { if(!uid||!db) return; return onSnapshot(collection(db,`users/${uid}/games`), s=>setGames(s.docs.map(d=>d.data()))) }, [uid])
  const jogando=games.filter(g=>g.status==='jogando')
  const zerados=games.filter(g=>g.status==='zerado'||g.status==='concluido')
  const cor='#7c3aed'
  const pct=games.length>0?Math.round((zerados.length/games.length)*100):0
  return (
    <button onClick={()=>onNavigate('gaming')} draggable onDragStart={()=>onDragStart?.('gaming')} onDragEnd={()=>onDragEnd?.()} onDragOver={e=>onDragOver?.(e,'gaming')} onDrop={e=>onDrop?.(e,'gaming')} style={{ padding:'16px 20px', borderRadius:16, border:`1px solid ${cor}25`, background:`linear-gradient(135deg,${cor}0a,transparent)`, textAlign:'left', cursor:'grab', transition:'all 0.2s', opacity: dragging==='gaming'?0.45:1 }}
      onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-2px)';el.style.boxShadow=`0 8px 24px ${cor}20`}}
      onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(0)';el.style.boxShadow='none'}}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
        <div>
          <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', fontFamily:'var(--font-mono)', marginBottom:4 }}>Gaming</div>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.5rem', color:cor, lineHeight:1 }}>{jogando.length} jogando</div>
          <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:3 }}>{zerados.length} zerados · {games.length} total</div>
        </div>
        <span style={{ fontSize:'1.5rem', opacity:0.6 }}>🎮</span>
      </div>
      <div style={{ marginTop:8 }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.6rem', color:'var(--text-muted)', marginBottom:4 }}>
          <span>Zerados</span><span style={{ fontWeight:700, color:cor }}>{pct}%</span>
        </div>
        <div style={{ height:6, borderRadius:3, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,${cor},${cor}99)`, borderRadius:3 }} />
        </div>
      </div>
    </button>
  )
}

function PainelVisaoGeralMedia({ onNavigate, dragging, dragOver: _dOmedia, onDragStart, onDragEnd, onDragOver, onDrop }: any) {
  const uid = useUid()
  const [itens, setItens] = useState<any[]>([])
  useEffect(() => { if(!uid||!db) return; return onSnapshot(collection(db,`users/${uid}/media`), s=>setItens(s.docs.map(d=>d.data()))) }, [uid])
  const assistindo=itens.filter(i=>i.status==='assistindo'||i.status==='em_andamento'||i.status==='lendo')
  const concluidos=itens.filter(i=>i.status==='concluido'||i.status==='assistido'||i.status==='lido')
  const cor='#3b82f6'
  const pct=itens.length>0?Math.round((concluidos.length/itens.length)*100):0
  return (
    <button onClick={()=>onNavigate('media')} draggable onDragStart={()=>onDragStart?.('media')} onDragEnd={()=>onDragEnd?.()} onDragOver={e=>onDragOver?.(e,'media')} onDrop={e=>onDrop?.(e,'media')} style={{ padding:'16px 20px', borderRadius:16, border:`1px solid ${cor}25`, background:`linear-gradient(135deg,${cor}0a,transparent)`, textAlign:'left', cursor:'grab', transition:'all 0.2s', opacity: dragging==='media'?0.45:1 }}
      onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-2px)';el.style.boxShadow=`0 8px 24px ${cor}20`}}
      onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(0)';el.style.boxShadow='none'}}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
        <div>
          <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', fontFamily:'var(--font-mono)', marginBottom:4 }}>Media Tracker</div>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.5rem', color:cor, lineHeight:1 }}>{assistindo.length} em andamento</div>
          <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:3 }}>{concluidos.length} concluídos · {itens.length} total</div>
        </div>
        <span style={{ fontSize:'1.5rem', opacity:0.6 }}>▶</span>
      </div>
      <div style={{ marginTop:8 }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.6rem', color:'var(--text-muted)', marginBottom:4 }}>
          <span>Concluídos</span><span style={{ fontWeight:700, color:cor }}>{pct}%</span>
        </div>
        <div style={{ height:6, borderRadius:3, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,${cor},${cor}99)`, borderRadius:3 }} />
        </div>
      </div>
    </button>
  )
}

// ─── PainelConcursos ──────────────────────────────────────────────────────────
function PainelConcursos({ onNavigate }: any) {
  const uid = useUid()
  const [concursos, setConcursos] = useState<any[]>([])
  useEffect(() => { if(!uid||!db) return; return onSnapshot(collection(db,`users/${uid}/concursos`), s=>setConcursos(s.docs.map(d=>d.data()))) }, [uid])
  const hoje = new Date(Date.now()-3*3600000).toISOString().slice(0,10)
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
  const hoje = new Date(Date.now()-3*3600000).toISOString().slice(0,10)
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
  const hoje = new Date(Date.now()-3*3600000).toISOString().slice(0,10)
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
  const hoje = new Date(Date.now()-3*3600000).toISOString().slice(0,10)
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


// ─── BarraSaudacaoBusca ───────────────────────────────────────────────────────
function BarraSaudacaoBusca({ uid, onNavigate }: { uid: string|null; onNavigate:(id:string)=>void }) {
  const [hora, setHora] = useState(new Date())
  const [busca, setBusca] = useState('')
  const [demandas, setDemandas] = useState<any[]>([])
  const [showHoje, setShowHoje] = useState(false)
  const [contas, setContas] = useState<any[]>([])

  useEffect(() => { const t = setInterval(() => setHora(new Date()), 60000); return () => clearInterval(t) }, [])

  useEffect(() => {
    if (!uid || !db) return
    const u1 = onSnapshot(collection(db, `users/${uid}/prontuario`), s => setDemandas(s.docs.map(d => d.data())))
    const u2 = onSnapshot(collection(db, `users/${uid}/contasPagar`), s => setContas(s.docs.map(d => d.data())))
    return () => { u1(); u2() }
  }, [uid])

  const h = hora.getHours()
  const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  const nome = 'Bruno'

  // Build smart subtitle
  const hoje = new Date(Date.now()-3*3600000).toISOString().slice(0,10)
  const prazosHoje = demandas.filter(d => d.prazo === hoje && d.status !== 'concluida' && d.status !== 'cancelada').length
  const contasVencendo = contas.filter(c => {
    if (c.pago) return false
    const dias = Math.ceil((new Date(c.vencimento + 'T00:00:00').getTime() - Date.now()) / 86400000)
    return dias >= 0 && dias <= 3
  }).length

  let subtitulo = 'Tudo tranquilo por aqui.'
  if (prazosHoje > 0 && contasVencendo > 0)
    subtitulo = `${prazosHoje} prazo${prazosHoje > 1 ? 's' : ''} e ${contasVencendo} conta${contasVencendo > 1 ? 's' : ''} vencem hoje.`
  else if (prazosHoje > 0)
    subtitulo = `Você tem ${prazosHoje} prazo${prazosHoje > 1 ? 's' : ''} para hoje.`
  else if (contasVencendo > 0)
    subtitulo = `${contasVencendo} conta${contasVencendo > 1 ? 's vencem' : ' vence'} nos próximos 3 dias.`

  const handleBusca = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !busca.trim()) return
    const q = busca.toLowerCase()
    if (q.includes('edital') || q.includes('agu') || q.includes('concurso')) onNavigate('editais')
    else if (q.includes('financ') || q.includes('receita') || q.includes('despesa')) onNavigate('financeiro')
    else if (q.includes('pront') || q.includes('demanda') || q.includes('prazo')) onNavigate('prontuario')
    else if (q.includes('ponto') || q.includes('hora')) onNavigate('ponto')
    else if (q.includes('saúde') || q.includes('saude') || q.includes('água')) onNavigate('saude')
    else if (q.includes('diário') || q.includes('diario') || q.includes('task')) onNavigate('journal')
    else if (q.includes('gaming') || q.includes('jogo')) onNavigate('gaming')
    else if (q.includes('link')) onNavigate('links')
    setBusca('')
  }

  // Ctrl+K / Cmd+K focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        document.getElementById('nexus-search')?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      padding: '14px 24px',
      background: 'var(--card-bg)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
      flexWrap: 'wrap',
    }}>
      {/* Saudação */}
      <div style={{ flexShrink: 0 }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: '1rem',
          color: 'var(--text-primary)',
          lineHeight: 1.2,
          letterSpacing: '-0.01em',
        }}>
          {saudacao}, {nome}.
        </div>
        <div style={{
          fontSize: '0.72rem',
          color: prazosHoje > 0 || contasVencendo > 0 ? 'var(--warn)' : 'var(--text-muted)',
          marginTop: 3,
          fontWeight: prazosHoje > 0 || contasVencendo > 0 ? 500 : 400,
        }}>
          {prazosHoje > 0 || contasVencendo > 0 ? '⚠ ' : '✓ '}{subtitulo}
        </div>
      </div>

      {/* Barra de busca */}
      <div style={{ flex: 1, maxWidth: 480, minWidth: 220, position: 'relative' }}>
        {/* Lupa */}
        <span style={{
          position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          fontSize: '0.85rem', color: 'var(--text-muted)', pointerEvents: 'none',
          lineHeight: 1,
        }}>
          🔍
        </span>
        <input
          id="nexus-search"
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          onKeyDown={handleBusca}
          placeholder="Buscar em editais, finanças ou tarefas..."
          style={{
            width: '100%',
            padding: '9px 80px 9px 36px',
            borderRadius: 24,
            border: '1.5px solid var(--border-md)',
            background: 'var(--bg-1)',
            color: 'var(--text-primary)',
            fontSize: '0.84rem',
            fontFamily: 'var(--font-body)',
            outline: 'none',
            transition: 'all 0.18s',
            boxShadow: 'none',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.boxShadow = 'var(--shadow-focus)'
            e.currentTarget.style.background = 'var(--card-bg)'
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'var(--border-md)'
            e.currentTarget.style.boxShadow = 'none'
            e.currentTarget.style.background = 'var(--bg-1)'
          }}
        />
        {/* Atalho teclado */}
        <span style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          fontSize: '0.62rem', fontFamily: 'var(--font-mono)',
          color: 'var(--text-subtle)',
          background: 'var(--bg-3)',
          border: '1px solid var(--border-md)',
          borderRadius: 5,
          padding: '2px 6px',
          letterSpacing: '0.02em',
          pointerEvents: 'none',
        }}>
          Ctrl K
        </span>
      </div>

      {/* Botão Hoje no Mundo */}
      <button
        onClick={() => setShowHoje(true)}
        title="Ver curiosidades históricas, datas comemorativas e muito mais sobre hoje"
        style={{
          display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
          padding: '8px 16px', borderRadius: 22,
          border: '1.5px solid rgba(139,92,246,0.45)',
          background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(59,130,246,0.06))',
          color: '#a78bfa', fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.18s',
          boxShadow: '0 0 12px rgba(139,92,246,0.1)',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { const el = e.currentTarget; el.style.background = 'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(59,130,246,0.12))'; el.style.boxShadow = '0 0 20px rgba(139,92,246,0.25)'; el.style.transform = 'translateY(-1px)' }}
        onMouseLeave={e => { const el = e.currentTarget; el.style.background = 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(59,130,246,0.06))'; el.style.boxShadow = '0 0 12px rgba(139,92,246,0.1)'; el.style.transform = 'translateY(0)' }}
      >
        <span style={{ fontSize: '1rem' }}>🌍</span>
        Hoje no Mundo
      </button>

      {/* Modal */}
      {showHoje && <HojeNoMundoModal onClose={() => setShowHoje(false)} />}
    </div>
  )
}

// ─── HojeNoMundo — IA Gemini ──────────────────────────────────────────────────
async function callGeminiHoje(prompt: string): Promise<string> {
  const cfg = (() => { try { return JSON.parse(localStorage.getItem('nexus_ai_cfg') || '{}') } catch { return {} } })()
  if (!cfg.key) throw new Error('Chave Gemini não configurada. Configure em nexus_ai_cfg no localStorage.')
  const url = cfg.url || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
  const model = cfg.model || 'gemini-2.5-flash'
  const corpo = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  try {
    const r = await fetch(`${url}?key=${cfg.key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo })
    if (!r.ok && cfg.workerUrl) throw new Error(`HTTP ${r.status}`)
    const d = await r.json()
    return d?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  } catch (err) {
    if (cfg.workerUrl) {
      const r = await fetch(`${cfg.workerUrl}?model=${model}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo })
      const d = await r.json()
      return d?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    }
    throw err
  }
}

const CACHE_KEY = 'nexus_hoje_mundo_cache'

function buildPromptHoje(dateStr: string, dayOfWeek: string): string {
  return `Você é um assistente cultural e informativo. Hoje é ${dayOfWeek}, ${dateStr}.

Gere um relatório do dia em formato JSON com a seguinte estrutura EXATA (responda APENAS com o JSON, sem markdown, sem texto antes ou depois):
{
  "dataFormatada": "dia de mês de ano",
  "diaSemana": "${dayOfWeek}",
  "manchete": "uma frase impactante que resume o espírito deste dia",
  "efemerides": [
    {"ano": 1969, "emoji": "🚀", "evento": "Descrição do evento histórico"},
    {"ano": 1789, "emoji": "🏛", "evento": "Outro evento histórico"},
    {"ano": 1954, "emoji": "🎬", "evento": "Evento cultural"},
    {"ano": 2001, "emoji": "💡", "evento": "Evento mais recente"},
    {"ano": 1453, "emoji": "⚔", "evento": "Evento medieval"}
  ],
  "datasComemoretivas": [
    {"emoji": "🌍", "nome": "Nome da data comemorativa", "descricao": "Breve explicação"},
    {"emoji": "🏆", "nome": "Outra data ou celebração", "descricao": "Breve descrição"}
  ],
  "nascidos": [
    {"nome": "Nome Famoso", "ano": 1900, "profissao": "Área de atuação", "emoji": "🎭"},
    {"nome": "Outra pessoa famosa", "ano": 1945, "profissao": "Cientista/Artista/etc", "emoji": "🔬"}
  ],
  "falecidos": [
    {"nome": "Pessoa histórica", "ano": 1950, "legado": "O que deixou para o mundo", "emoji": "🕊"}
  ],
  "curiosidades": [
    {"emoji": "🧩", "titulo": "Curiosidade fascinante", "detalhe": "Explicação mais detalhada em 1-2 frases"},
    {"emoji": "🌟", "titulo": "Fato surpreendente", "detalhe": "Mais detalhes sobre este fato"}
  ],
  "pensamentoDoDia": "Uma citação ou reflexão inspiradora relacionada ao dia ou à época do ano",
  "autorPensamento": "Autor da citação ou 'Sabedoria popular'"
}

Regras:
- Sejam precisos nas datas históricas — só inclua eventos que REALMENTE ocorreram neste dia
- Variedade: inclua eventos históricos mundiais e brasileiros
- Efemérides: mínimo 5 eventos históricos variados  
- Nascidos/Falecidos: pessoas reais que nasceram/morreram neste dia
- Curiosidades: fatos interessantes sobre o dia ou período do ano
- Datas comemorativas: nacionais e internacionais que caem nesta data
- Responda em português brasileiro`
}

interface HojeData {
  dataFormatada: string
  diaSemana: string
  manchete: string
  efemerides: { ano: number; emoji: string; evento: string }[]
  datasComemoretivas: { emoji: string; nome: string; descricao: string }[]
  nascidos: { nome: string; ano: number; profissao: string; emoji: string }[]
  falecidos: { nome: string; ano: number; legado: string; emoji: string }[]
  curiosidades: { emoji: string; titulo: string; detalhe: string }[]
  pensamentoDoDia: string
  autorPensamento: string
}

function HojeNoMundoModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<HojeData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'historia'|'celebracoes'|'pessoas'|'curiosidades'>('historia')

  const hoje = new Date(Date.now() - 3 * 3600000)
  const MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
  const DIAS_PT = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado']
  const dateStr = `${hoje.getDate()} de ${MESES_PT[hoje.getMonth()]} de ${hoje.getFullYear()}`
  const cacheKey = `${CACHE_KEY}_${hoje.toISOString().slice(0,10)}`

  useEffect(() => {
    // Check cache first
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) { setData(JSON.parse(cached)); return }
    } catch {}
    // Fetch from Gemini
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true); setError(null)
    try {
      const raw = await callGeminiHoje(buildPromptHoje(dateStr, DIAS_PT[hoje.getDay()]))
      const clean = raw.replace(/```json\n?|```\n?/g, '').trim()
      const parsed: HojeData = JSON.parse(clean)
      setData(parsed)
      localStorage.setItem(cacheKey, JSON.stringify(parsed))
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar dados. Verifique sua chave Gemini.')
    }
    setLoading(false)
  }

  const TABS = [
    { id: 'historia', label: 'História', icon: '📜' },
    { id: 'celebracoes', label: 'Datas', icon: '🎉' },
    { id: 'pessoas', label: 'Pessoas', icon: '👤' },
    { id: 'curiosidades', label: 'Curiosidades', icon: '🧩' },
  ] as const

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 720, maxHeight: '90vh', background: 'var(--card-bg)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.2)' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(59,130,246,0.1) 50%, rgba(16,185,129,0.08) 100%)', padding: '20px 24px 16px', borderBottom: '1px solid rgba(139,92,246,0.2)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: '1.5rem' }}>🌍</span>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.35rem', color: '#a78bfa', letterSpacing: '-0.01em', lineHeight: 1 }}>Hoje no Mundo</div>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
                {dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} · {DIAS_PT[hoje.getDay()].charAt(0).toUpperCase() + DIAS_PT[hoje.getDay()].slice(1)}
              </div>
              {data?.manchete && (
                <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.5, maxWidth: 500 }}>
                  "{data.manchete}"
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              {!loading && (
                <button onClick={fetchData} title="Atualizar" style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.1)', color: '#a78bfa', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↻</button>
              )}
              <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button>
            </div>
          </div>

          {/* Tabs */}
          {data && (
            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id as any)}
                  style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${tab === t.id ? 'rgba(139,92,246,0.5)' : 'var(--border)'}`, background: tab === t.id ? 'rgba(139,92,246,0.15)' : 'none', color: tab === t.id ? '#a78bfa' : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: tab === t.id ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--font-display)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid rgba(139,92,246,0.2)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                Consultando a IA sobre o dia de hoje…<br/>
                <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>Isso pode levar alguns segundos</span>
              </div>
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 250, gap: 14 }}>
              <div style={{ fontSize: '2.5rem' }}>⚠️</div>
              <div style={{ color: '#f87171', fontSize: '0.85rem', textAlign: 'center', maxWidth: 400, lineHeight: 1.6 }}>{error}</div>
              <button onClick={fetchData} style={{ padding: '8px 20px', borderRadius: 10, border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.1)', color: '#a78bfa', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>Tentar novamente</button>
            </div>
          )}

          {data && !loading && (
            <>
              {/* História */}
              {tab === 'historia' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>📜 Efemérides — O que aconteceu neste dia</div>
                  {data.efemerides.map((e, i) => (
                    <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', alignItems: 'flex-start' }}>
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 44 }}>
                        <span style={{ fontSize: '1.4rem' }}>{e.emoji}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.68rem', color: '#a78bfa' }}>{e.ano}</span>
                      </div>
                      <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.55, paddingTop: 2 }}>{e.evento}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Datas comemorativas */}
              {tab === 'celebracoes' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>🎉 Datas & Celebrações de Hoje</div>
                  {data.datasComemoretivas.map((d, i) => (
                    <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04))', border: '1px solid rgba(139,92,246,0.15)', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '1.8rem', flexShrink: 0 }}>{d.emoji}</span>
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: 4 }}>{d.nome}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{d.descricao}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pessoas */}
              {tab === 'pessoas' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {data.nascidos.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>🎂 Nascidos neste dia</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {data.nascidos.map((p, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                            <span style={{ fontSize: '1.3rem' }}>{p.emoji}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: '0.87rem', color: 'var(--text-primary)' }}>{p.nome}</div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{p.profissao}</div>
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: '#34d399' }}>{p.ano}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {data.falecidos.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>🕊 Falecidos neste dia</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {data.falecidos.map((p, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(148,163,184,0.05)', border: '1px solid rgba(148,163,184,0.12)' }}>
                            <span style={{ fontSize: '1.3rem', marginTop: 2 }}>{p.emoji}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: '0.87rem', color: 'var(--text-primary)', marginBottom: 2 }}>{p.nome} <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 400 }}>({p.ano})</span></div>
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{p.legado}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Curiosidades */}
              {tab === 'curiosidades' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>🧩 Curiosidades do Dia</div>
                  {data.curiosidades.map((c, i) => (
                    <div key={i} style={{ padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(245,158,11,0.06), transparent)', border: '1px solid rgba(245,158,11,0.15)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                        <span style={{ fontSize: '1.4rem' }}>{c.emoji}</span>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: '#fbbf24' }}>{c.titulo}</div>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.55, paddingLeft: 1 }}>{c.detalhe}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer com pensamento */}
        {data && !loading && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(139,92,246,0.15)', background: 'rgba(139,92,246,0.04)', flexShrink: 0 }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.5 }}>
              💭 "{data.pensamentoDoDia}"
            </div>
            <div style={{ fontSize: '0.65rem', color: '#a78bfa', fontWeight: 600, marginTop: 5, fontFamily: 'var(--font-mono)' }}>— {data.autorPensamento}</div>
          </div>
        )}
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  )
}

// ─── Modo Notícias ────────────────────────────────────────────────────────────
const NEWS_SOURCES = [
  {
    id: 'agencia-brasil',
    label: 'Agência Brasil',
    icon: '🇧🇷',
    url: 'https://agenciabrasil.ebc.com.br/',
    color: '#1565C0',
    desc: 'Jornalismo público de qualidade',
  },
  {
    id: 'stf',
    label: 'STF Notícias',
    icon: '⚖',
    url: 'https://noticias.stf.jus.br/',
    color: '#1B5E20',
    desc: 'Notícias do Supremo Tribunal Federal',
  },
  {
    id: 'pci-concursos',
    label: 'PCI Concursos',
    icon: '📋',
    url: 'https://www.pciconcursos.com.br/noticias/',
    color: '#1976D2',
    desc: 'Concursos públicos em destaque',
  },
  {
    id: 'migalhas',
    label: 'Migalhas',
    icon: '⚖',
    url: 'https://www.migalhas.com.br/',
    color: '#6A1B9A',
    desc: 'Notícias jurídicas',
  },
  {
    id: 'icl-noticias',
    label: 'ICL Notícias',
    icon: '📡',
    url: 'https://iclnoticias.com.br/',
    color: '#00838F',
    desc: 'Notícias e informação',
  },
  {
    id: 'g1-concursos',
    label: 'G1 Concursos',
    icon: '🎯',
    url: 'https://g1.globo.com/trabalho-e-carreira/concursos/',
    color: '#E65100',
    desc: 'Concursos — G1 Globo',
  },
]

function NoticiaFrame({ source, expanded }: { source: typeof NEWS_SOURCES[0]; expanded: boolean }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  return (
    <div style={{
      background: 'var(--card-bg, #2C2C2E)',
      border: `1px solid ${source.color}30`,
      borderRadius: 16,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: expanded ? 640 : 420,
      transition: 'height 0.3s ease',
    }}>
      {/* Header do frame */}
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${source.color}20`,
        background: `linear-gradient(90deg,${source.color}12,transparent)`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '1.1rem' }}>{source.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{source.label}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{source.desc}</div>
        </div>
        <a href={source.url} target="_blank" rel="noopener noreferrer"
          style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${source.color}40`, background: `${source.color}10`, color: source.color, fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          Abrir ↗
        </a>
      </div>
      {/* iFrame */}
      <div style={{ flex: 1, position: 'relative', background: 'var(--bg-1)' }}>
        {!loaded && !error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-muted)' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid transparent', borderTopColor: source.color, animation: 'spin 0.8s linear infinite' }} />
            <div style={{ fontSize: '0.72rem' }}>Carregando {source.label}…</div>
          </div>
        )}
        {error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
            <div style={{ fontSize: '2.5rem' }}>{source.icon}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', textAlign: 'center' }}>{source.label}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
              Este site não permite incorporação direta (X-Frame-Options).<br/>
              Clique em <strong style={{ color: source.color }}>Abrir ↗</strong> para acessar.
            </div>
            <a href={source.url} target="_blank" rel="noopener noreferrer"
              style={{ padding: '8px 22px', borderRadius: 9, border: 'none', background: source.color, color: '#fff', fontWeight: 700, fontSize: '0.82rem', textDecoration: 'none', marginTop: 4 }}>
              Acessar {source.label}
            </a>
          </div>
        )}
        {!error && (
          <iframe
            src={source.url}
            title={source.label}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
            onLoad={() => setLoaded(true)}
            onError={() => { setLoaded(true); setError(true) }}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: loaded ? 'block' : 'none',
              background: 'white',
            }}
          />
        )}
      </div>
    </div>
  )
}

function NoticiasMode() {
  const [expandido, setExpandido] = useState<string|null>(null)
  const [layout, setLayout] = useState<'grid'|'lista'>('grid')

  return (
    <div style={{ padding: '16px 20px', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1 }}>
          📰 Modo Notícias — {NEWS_SOURCES.length} fontes
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['grid','lista'] as const).map(l => (
            <button key={l} onClick={() => setLayout(l)}
              style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${layout===l?'var(--border-bright)':'var(--border)'}`, background: layout===l?'var(--accent-bg)':'none', color: layout===l?'var(--text-accent)':'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
              {l === 'grid' ? '⊞ Grade' : '≡ Lista'}
            </button>
          ))}
        </div>
      </div>
      {/* Sources */}
      <div style={{
        display: layout === 'grid' ? 'grid' : 'flex',
        gridTemplateColumns: layout === 'grid' ? 'repeat(auto-fill, minmax(480px, 1fr))' : undefined,
        flexDirection: layout === 'lista' ? 'column' : undefined,
        gap: 16,
      }}>
        {NEWS_SOURCES.map(src => (
          <div key={src.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <NoticiaFrame source={src} expanded={expandido===src.id} />
            <button onClick={() => setExpandido(p => p===src.id ? null : src.id)}
              style={{ padding: '5px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: '0.68rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
              {expandido===src.id ? '▲ Recolher' : '▼ Expandir'}
            </button>
          </div>
        ))}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

export function VisualDashboard({ onNavigate, global, discStats }: { onNavigate:(id:string)=>void; global:any; discStats:any[] }) {
  const uid = useUid()
  const [moduloAtivo] = useState('visao-geral')
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
      {/* ── BARRA DE SAUDAÇÃO + BUSCA ── */}
      <BarraSaudacaoBusca uid={uid} onNavigate={onNavigate} />

      {/* ── PAINEL DE CONTEÚDO ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 24px' }}>
        <div style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:16, padding:'20px', boxShadow:'var(--shadow-card)', minHeight:280 }}>
          {renderPainel()}
        </div>
      </div>

      {/* ── BARRA INFERIOR COM INFO DO DIA ── */}
      <BarraInferior />
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function NexusDashboard({ onNavigate, dashView = 'visual' }: Props) {
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

  if (dashView === 'home') {
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
        <div style={{ flex:1, minHeight:0 }}>
          <PaginaInicial onNavigate={onNavigate} />
        </div>
        <BarraInferior />
      </div>
    )
  }
  if (dashView === 'visual') {
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
        <div style={{ flex:1, minHeight:0, overflowY:'auto' }}>
          <VisaoGeral onNavigate={onNavigate} />
        </div>
        <BarraInferior />
      </div>
    )
  }
  if (dashView === 'noticias') {
    return <NoticiasMode />
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
