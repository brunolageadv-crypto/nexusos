import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { AGU_DISCIPLINAS, TOTAL_SUBTOPICOS } from '../editais/aguData'
import { useEditaisAGU } from '../../hooks/useEditaisAGU'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'
import { collection, query, orderBy, onSnapshot, doc, setDoc } from 'firebase/firestore'

interface Props { onNavigate: (id: string) => void }

/* ═══════════════════════════════════════════════════════════
   GRID SYSTEM — 12 colunas, altura em unidades de 100px
═══════════════════════════════════════════════════════════ */
interface Widget {
  id: string
  col: number   // 0-11
  row: number   // 0-N
  w: number     // colunas ocupadas (1-12)
  h: number     // unidades de altura
  visible: boolean
}

const COLS = 12
const ROW_H = 108  // px por unidade de altura
const GAP = 14

const DEFAULT_LAYOUT: Widget[] = [
  { id: 'kpi-edital',    col: 0, row: 0, w: 3, h: 1, visible: true },
  { id: 'kpi-questoes',  col: 3, row: 0, w: 3, h: 1, visible: true },
  { id: 'kpi-acerto',    col: 6, row: 0, w: 3, h: 1, visible: true },
  { id: 'kpi-ponto',     col: 9, row: 0, w: 3, h: 1, visible: true },
  { id: 'ponto-rapido',  col: 0, row: 1, w: 2, h: 3, visible: true },
  { id: 'agu-panel',     col: 2, row: 1, w: 5, h: 3, visible: true },
  { id: 'questoes-panel',col: 7, row: 1, w: 5, h: 3, visible: true },
  { id: 'contas-pagar',  col: 0, row: 4, w: 6, h: 3, visible: true },
  { id: 'concursos-dash',col: 6, row: 4, w: 6, h: 3, visible: true },
  { id: 'modulos',       col: 0, row: 7, w: 12, h: 2, visible: true },
]

const WIDGET_LABELS: Record<string, string> = {
  'kpi-edital': '📊 Progresso AGU',
  'kpi-questoes': '📝 Questões',
  'kpi-acerto': '🎯 % Acerto',
  'kpi-ponto': '⊙ Horas Mês',
  'ponto-rapido': '⊙ Ponto Rápido',
  'agu-panel': '⚖ Painel AGU',
  'questoes-panel': '◈ Questões',
  'contas-pagar': '⚠ Contas a Pagar',
  'concursos-dash': '🎯 Concursos',
  'modulos': '▦ Módulos',
}

/* ─────────────────────────────────────────────────────────
   Ring Gauge
───────────────────────────────────────────────────────── */
function RingGauge({ pct, color, size = 64 }: { pct: number; color: string; size?: number }) {
  const r = (size - 10) / 2, circ = 2 * Math.PI * r, dash = (pct / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-4)" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
        style={{ transition: 'stroke-dasharray 1s ease', filter: `drop-shadow(0 0 5px ${color})` }} />
    </svg>
  )
}

/* ─────────────────────────────────────────────────────────
   usePontoStats
───────────────────────────────────────────────────────── */
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
  const hMes = Math.floor(minMes / 60), mMes = minMes % 60
  const emServico = !!(regHoje?.entrada && !regHoje?.saida)
  const fmtHoje = regHoje?.minutos ? `${Math.floor(regHoje.minutos / 60)}h${regHoje.minutos % 60 > 0 ? ` ${regHoje.minutos % 60}m` : ''}` : null
  const nowHHMM = () => { const n = new Date(); return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}` }
  const calcMin = (e: string, s: string) => { if (!e || !s) return 0; const [eh, em] = e.split(':').map(Number); const [sh, sm] = s.split(':').map(Number); return Math.max(0, (sh * 60 + sm) - (eh * 60 + em)) }
  const baterEntrada = async () => {
    if (!uid || !db || regHoje?.entrada) return
    const h = nowHHMM(), id = regHoje?.id ?? (hoje + '_' + Date.now().toString(36))
    await setDoc(doc(db, `users/${uid}/ponto`, id), { id, data: hoje, entrada: h, saida: '', minutos: 0, observacao: '' })
  }
  const baterSaida = async () => {
    if (!uid || !db || !regHoje?.entrada || regHoje?.saida) return
    const h = nowHHMM(), min = calcMin(regHoje.entrada, h)
    await setDoc(doc(db, `users/${uid}/ponto`, regHoje.id), { ...regHoje, saida: h, minutos: min })
  }
  return { emServico, fmtHoje, hMes, mMes, baterEntrada, baterSaida, regHoje }
}

/* ─────────────────────────────────────────────────────────
   useContasPagar — para widget dashboard
───────────────────────────────────────────────────────── */
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
  const vencendo = pendentes.filter(c => {
    const d = Math.ceil((new Date(c.vencimento).getTime() - Date.now()) / 86400000)
    return d >= 0 && d <= 7
  })
  const vencidas = pendentes.filter(c => new Date(c.vencimento).toISOString().slice(0,10) < hoje)
  const totalPendente = pendentes.reduce((a: number, c: any) => a + (c.valor || 0), 0)
  return { contas: pendentes, vencendo, vencidas, totalPendente }
}

/* ─────────────────────────────────────────────────────────
   useConcursosDash — para widget dashboard
───────────────────────────────────────────────────────── */
function useConcursosDash() {
  const [concursos, setConcursos] = useState<any[]>([])
  const uid = useUid()
  useEffect(() => {
    if (!uid || !db) return
    return onSnapshot(collection(db, `users/${uid}/concursos`), snap =>
      setConcursos(snap.docs.map(d => d.data())))
  }, [uid])
  const hoje = new Date().toISOString().slice(0, 10)
  const ativos = concursos.filter(c => c.status !== 'encerrado')
  const proximos = [...concursos].filter(c => c.dataProva && c.dataProva >= hoje).sort((a,b) => a.dataProva.localeCompare(b.dataProva)).slice(0, 3)
  return { concursos: ativos, proximos, total: concursos.length }
}

/* ─────────────────────────────────────────────────────────
   useLayout — carrega/salva layout no Firestore
───────────────────────────────────────────────────────── */
function useLayout() {
  const uid = useUid()
  const [layout, setLayout] = useState<Widget[]>(() => {
    try { const s = localStorage.getItem('nexusos-dash-layout'); return s ? JSON.parse(s) : DEFAULT_LAYOUT } catch { return DEFAULT_LAYOUT }
  })

  useEffect(() => {
    if (!uid || !db) return
    const unsub = onSnapshot(doc(db, `users/${uid}/config/dashLayout`), snap => {
      if (snap.exists()) {
        const data = snap.data().layout as Widget[]
        setLayout(data)
        localStorage.setItem('nexusos-dash-layout', JSON.stringify(data))
      }
    })
    return unsub
  }, [uid])

  const saveLayout = useCallback(async (l: Widget[]) => {
    setLayout(l)
    localStorage.setItem('nexusos-dash-layout', JSON.stringify(l))
    if (uid && db) await setDoc(doc(db, `users/${uid}/config/dashLayout`), { layout: l })
  }, [uid])

  const resetLayout = useCallback(() => saveLayout(DEFAULT_LAYOUT), [saveLayout])

  return { layout, saveLayout, resetLayout }
}

/* ─────────────────────────────────────────────────────────
   DraggableWidget — pointer events para drag fluido
───────────────────────────────────────────────────────── */
interface DWProps {
  widget: Widget
  editing: boolean
  gridW: number
  onMove: (id: string, col: number, row: number) => void
  onResize: (id: string, w: number, h: number) => void
  children: React.ReactNode
}

function DraggableWidget({ widget, editing, gridW, onMove, onResize, children }: DWProps) {
  const colW = gridW / COLS
  const left   = widget.col * colW + widget.col * (GAP / COLS)
  const top    = widget.row * (ROW_H + GAP)
  const width  = widget.w * colW + (widget.w - 1) * (GAP / COLS)
  const height = widget.h * ROW_H + (widget.h - 1) * GAP

  const dragRef = useRef<{ startX:number; startY:number; col:number; row:number }|null>(null)
  const resRef  = useRef<{ startX:number; startY:number; w:number; h:number }|null>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const resHandleRef = useRef<HTMLDivElement>(null)

  // Drag com pointer events — mais fluido que mouse events
  const startDrag = useCallback((e: React.PointerEvent) => {
    if (!editing) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, col: widget.col, row: widget.row }
  }, [editing, widget.col, widget.row])

  const moveDrag = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const dc = Math.round(dx / (colW + GAP / COLS))
    const dr = Math.round(dy / (ROW_H + GAP))
    const newCol = Math.max(0, Math.min(COLS - widget.w, dragRef.current.col + dc))
    const newRow = Math.max(0, dragRef.current.row + dr)
    onMove(widget.id, newCol, newRow)
  }, [colW, widget.w, widget.id, onMove])

  const endDrag = useCallback(() => { dragRef.current = null }, [])

  // Resize com pointer events
  const startRes = useCallback((e: React.PointerEvent) => {
    if (!editing) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resRef.current = { startX: e.clientX, startY: e.clientY, w: widget.w, h: widget.h }
  }, [editing, widget.w, widget.h])

  const moveRes = useCallback((e: React.PointerEvent) => {
    if (!resRef.current) return
    const dx = e.clientX - resRef.current.startX
    const dy = e.clientY - resRef.current.startY
    const newW = Math.max(2, Math.min(COLS - widget.col, resRef.current.w + Math.round(dx / (colW + GAP/COLS))))
    const newH = Math.max(1, resRef.current.h + Math.round(dy / (ROW_H + GAP)))
    onResize(widget.id, newW, newH)
  }, [colW, widget.col, widget.id, onResize])

  const endRes = useCallback(() => { resRef.current = null }, [])

  return (
    <div style={{
      position: 'absolute', left, top, width, height,
      transition: editing ? 'none' : 'left 0.25s ease, top 0.25s ease, width 0.25s ease, height 0.25s ease',
      zIndex: dragRef.current ? 20 : editing ? 5 : 1,
      boxSizing: 'border-box',
    }}>

      {/* Handle de drag */}
      {editing && (
        <div
          ref={handleRef}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 30,
            cursor: 'grab', zIndex: 10, touchAction: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(180deg,rgba(0,229,255,0.12) 0%,transparent 100%)',
            borderRadius: '12px 12px 0 0', userSelect: 'none',
          }}
        >
          <div style={{ display:'flex', gap:3 }}>
            {[0,1,2,3,4,5].map(i=><div key={i} style={{ width:3,height:3,borderRadius:'50%',background:'rgba(0,229,255,0.55)' }}/>)}
          </div>
          <span style={{ fontSize:'0.55rem', color:'rgba(0,229,255,0.4)', fontFamily:'var(--font-mono)', marginLeft:8 }}>{widget.w}×{widget.h}</span>
        </div>
      )}

      {/* Conteúdo */}
      <div style={{ width:'100%', height:'100%', overflow:'hidden', borderRadius:12, border: editing?'1px solid rgba(0,229,255,0.25)':'none', boxShadow: editing?'0 0 0 2px rgba(0,229,255,0.08)':'' }}>
        {children}
      </div>

      {/* Handle de resize */}
      {editing && (
        <div
          ref={resHandleRef}
          onPointerDown={startRes}
          onPointerMove={moveRes}
          onPointerUp={endRes}
          onPointerCancel={endRes}
          style={{
            position:'absolute', bottom:0, right:0, width:22, height:22,
            cursor:'nwse-resize', zIndex:10, touchAction:'none',
            display:'flex', alignItems:'flex-end', justifyContent:'flex-end', padding:5,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 10L10 2M5 10L10 5M8 10L10 8" stroke="rgba(0,229,255,0.65)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   Widget contents
───────────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  return (
    <div className="kpi-card" style={{ '--kpi-color': color, height: '100%', boxSizing: 'border-box' } as React.CSSProperties}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color, fontSize: 'clamp(1.2rem, 2.5vw, 2rem)' }}>{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}

function PontoRapidoCard({ ponto, onNavigate }: { ponto: ReturnType<typeof usePontoStats>; onNavigate: (id: string) => void }) {
  return (
    <div className="card" style={{ height: '100%', padding: '14px 12px', textAlign: 'center', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Ponto Rápido</div>
      {ponto.emServico && <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 7, padding: '5px 8px', fontSize: '0.65rem', color: '#10b981', fontFamily: 'var(--font-mono)' }}>🟢 EM SERVIÇO</div>}
      {ponto.fmtHoje && <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-accent)' }}>{ponto.fmtHoje}</div>}
      <button onClick={ponto.baterEntrada} disabled={!!ponto.regHoje?.entrada}
        style={{ flex: 1, borderRadius: 9, border: '1px solid rgba(16,185,129,0.4)', background: ponto.regHoje?.entrada ? 'rgba(16,185,129,0.05)' : 'rgba(16,185,129,0.12)', color: ponto.regHoje?.entrada ? 'rgba(16,185,129,0.3)' : '#10b981', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.82rem', cursor: ponto.regHoje?.entrada ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
        → ENTRADA
      </button>
      <button onClick={ponto.baterSaida} disabled={!ponto.regHoje?.entrada || !!ponto.regHoje?.saida}
        style={{ flex: 1, borderRadius: 9, border: '1px solid rgba(239,68,68,0.4)', background: (!ponto.regHoje?.entrada || ponto.regHoje?.saida) ? 'rgba(239,68,68,0.05)' : 'rgba(239,68,68,0.12)', color: (!ponto.regHoje?.entrada || ponto.regHoje?.saida) ? 'rgba(239,68,68,0.3)' : '#ef4444', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.82rem', cursor: (!ponto.regHoje?.entrada || ponto.regHoje?.saida) ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
        ← SAÍDA
      </button>
      <button onClick={() => onNavigate('ponto')} style={{ padding: '5px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.68rem', cursor: 'pointer' }}>Ver relatórios →</button>
    </div>
  )
}

function AguPanel({ global, lastFinalized, discStats, onNavigate }: any) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg,rgba(0,229,255,0.04)0%,transparent 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 1 }}>⚖ Edital AGU</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>14 disciplinas · {TOTAL_SUBTOPICOS} subtópicos</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RingGauge pct={global.pctConcluido} color="#00e5ff" size={52} />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 800, color: '#00e5ff', lineHeight: 1 }}>{global.pctConcluido}%</div>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>concluído</div>
          </div>
        </div>
      </div>
      {lastFinalized && (
        <div style={{ padding: '7px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(16,185,129,0.03)', display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <span style={{ color: '#10b981', fontSize: '0.8rem' }}>✓</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Último concluído · {lastFinalized.data}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lastFinalized.nome}</div>
          </div>
        </div>
      )}
      <div style={{ padding: '8px 16px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {discStats.map((d: any) => (
          <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 32px', alignItems: 'center', gap: 7 }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.nome.replace('Direito ', '')}</div>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${d.pctConcluido}%`, background: d.cor, color: d.cor }} /></div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: d.cor, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{d.pctConcluido}%</div>
          </div>
        ))}
      </div>
      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button className="btn btn-accent" onClick={() => onNavigate('editais')} style={{ width: '100%', justifyContent: 'center', fontSize: '0.78rem' }}>⚖ Abrir Editais AGU</button>
      </div>
    </div>
  )
}

function QuestoesPanel({ global, discStats, onNavigate }: any) {
  const worst = [...discStats].filter((d: any) => d.questoes > 0).sort((a: any, b: any) => a.pctAcerto - b.pctAcerto).slice(0, 3)
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg,rgba(124,58,237,0.04)0%,transparent 100%)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <RingGauge pct={global.questoes > 0 ? global.pctAcerto : 0} color="#7c3aed" size={48} />
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800, color: '#7c3aed', lineHeight: 1 }}>{global.questoes > 0 ? `${global.pctAcerto}%` : '—'}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>{global.questoes}q · {global.acertos} acertos</div>
        </div>
      </div>
      <div style={{ padding: '8px 16px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {discStats.filter((d: any) => d.questoes > 0).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            Nenhuma questão registrada.<br />
            <span style={{ color: 'var(--text-accent)', cursor: 'pointer' }} onClick={() => onNavigate('editais')}>→ Registrar no Editais AGU</span>
          </div>
        ) : discStats.filter((d: any) => d.questoes > 0).map((d: any) => (
          <div key={d.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{d.nome.replace('Direito ', '')}</span>
              <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: d.cor, fontWeight: 700 }}>{d.pctAcerto}%</span>
            </div>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${d.pctAcerto}%`, background: d.cor, color: d.cor }} /></div>
          </div>
        ))}
      </div>
      {worst.length > 0 && (
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', background: 'rgba(239,68,68,0.02)', flexShrink: 0 }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>⚠ Atenção prioritária</div>
          {worst.map((d: any) => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', padding: '1px 0' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{d.nome.replace('Direito ', '')}</span>
              <span className="badge badge-red">{d.pctAcerto}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ModulosCard({ global, ponto, onNavigate }: any) {
  const modulos = [
    { id: 'editais', label: 'Editais AGU', icon: '⚖', desc: `${global.concluidos}/${TOTAL_SUBTOPICOS} subtópicos`, color: '#00e5ff' },
    { id: 'concursos', label: 'Concursos', icon: '🎯', desc: 'Cadastro e acompanhamento', color: '#7c3aed' },
    { id: 'ponto', label: 'Ponto Eletrônico', icon: '⊙', desc: ponto.emServico ? '🟢 Em serviço' : `${ponto.hMes}h no mês`, color: '#f59e0b' },
    { id: 'financeiro', label: 'Financeiro', icon: '◎', desc: 'Receitas e despesas', color: '#10b981' },
    { id: 'journal', label: 'Diário', icon: '✦', desc: 'Em breve', color: '#ec4899' },
    { id: 'media', label: 'Media Tracker', icon: '▶', desc: 'Em breve', color: '#3b82f6' },
  ]
  return (
    <div className="card" style={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 12 }}>MÓDULOS</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10, flex: 1 }}>
        {modulos.map(m => (
          <button key={m.id} onClick={() => onNavigate(m.id)} className="card"
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: 'var(--card-bg)', border: '1px solid var(--border)', textAlign: 'left', width: '100%', transition: 'all 0.18s', padding: '10px 12px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = m.color; (e.currentTarget as HTMLElement).style.boxShadow = `0 0 14px ${m.color}22` }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}>
            <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{m.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: m.color, fontSize: '0.78rem', fontFamily: 'var(--font-display)' }}>{m.label}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   MAIN DASHBOARD
───────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────
   ContasPagarCard
───────────────────────────────────────────────────────── */
function ContasPagarCard({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { contas, vencendo, vencidas, totalPendente } = useContasPagar()
  const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtDate  = (d: string) => { if (!d) return '—'; const [,m,dy] = d.split('-'); return `${dy}/${m}` }
  const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg,rgba(245,158,11,0.05)0%,transparent 100%)', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>⚠ Contas a Pagar</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.3rem', color: '#f59e0b', lineHeight: 1 }}>{fmtMoeda(totalPendente)}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>{contas.length} conta{contas.length !== 1 ? 's' : ''} pendente{contas.length !== 1 ? 's' : ''}</div>
          </div>
          {vencidas.length > 0 && (
            <div style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', fontSize: '0.7rem', fontWeight: 700, color: '#ef4444' }}>
              {vencidas.length} vencida{vencidas.length > 1 ? 's' : ''}
            </div>
          )}
          {vencendo.length > 0 && (
            <div style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b' }}>
              {vencendo.length} vencendo
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {contas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Nenhuma conta pendente
          </div>
        ) : contas.slice(0, 8).map((c: any, i: number) => {
          const d = daysUntil(c.vencimento)
          const vencida = d < 0
          const urgente = d >= 0 && d <= 3
          const cor = vencida ? '#ef4444' : urgente ? '#f59e0b' : 'var(--text-secondary)'
          return (
            <div key={c.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.descricao}</div>
                <div style={{ fontSize: '0.68rem', color: cor, marginTop: 1 }}>
                  {vencida ? '⚠ VENCIDA' : urgente ? `⏰ ${d}d` : fmtDate(c.vencimento)}
                  {c.categoria ? ` · ${c.categoria}` : ''}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.85rem', color: cor, flexShrink: 0 }}>
                {fmtMoeda(c.valor)}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button onClick={() => onNavigate('financeiro')} style={{ width: '100%', padding: '7px', borderRadius: 7, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.06)', color: '#f59e0b', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
          Ver Financeiro →
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   ConcursosDashCard
───────────────────────────────────────────────────────── */
function ConcursosDashCard({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { concursos, proximos, total } = useConcursosDash()
  const fmtDate = (d: string) => { if (!d) return '—'; const [y,m,dy] = d.split('-'); return `${dy}/${m}/${y}` }
  const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)

  const STATUS_COLOR: Record<string, string> = {
    previsto: '#64748b', edital: '#3b82f6', inscricoes: '#10b981',
    provas: '#f59e0b', resultado: '#8b5cf6', encerrado: '#6b7280',
  }
  const STATUS_LABEL: Record<string, string> = {
    previsto: 'Previsto', edital: 'Com Edital', inscricoes: 'Inscrições',
    provas: 'Em Provas', resultado: 'Resultado', encerrado: 'Encerrado',
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg,rgba(124,58,237,0.05)0%,transparent 100%)', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>🎯 Concursos</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.3rem', color: '#7c3aed', lineHeight: 1 }}>{total}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>cadastrados</div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.3rem', color: '#10b981', lineHeight: 1 }}>{concursos.filter((c: any) => c.status === 'inscricoes').length}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>inscrições abertas</div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.3rem', color: '#f59e0b', lineHeight: 1 }}>{proximos.length}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>provas próximas</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {concursos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Nenhum concurso cadastrado
          </div>
        ) : concursos.slice(0, 6).map((c: any, i: number) => {
          const cor = STATUS_COLOR[c.status] ?? '#64748b'
          const dProva = c.dataProva ? daysUntil(c.dataProva) : null
          return (
            <div key={c.id ?? i} style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ width: 3, borderRadius: 2, alignSelf: 'stretch', background: cor, flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{c.orgao || c.nome || '—'}</span>
                  <span style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: 10, background: `${cor}22`, color: cor, border: `1px solid ${cor}44`, fontWeight: 700, flexShrink: 0 }}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {c.dataProva && (
                    <span style={{ fontSize: '0.68rem', color: dProva !== null && dProva <= 30 ? '#f59e0b' : 'var(--text-muted)' }}>
                      📅 {fmtDate(c.dataProva)}{dProva !== null && dProva >= 0 ? ` (${dProva}d)` : ''}
                    </span>
                  )}
                  {c.dataInscricaoFim && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      📝 até {fmtDate(c.dataInscricaoFim)}
                    </span>
                  )}
                  {c.remuneracao && (
                    <span style={{ fontSize: '0.68rem', color: '#10b981' }}>💰 {c.remuneracao}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button onClick={() => onNavigate('concursos')} style={{ width: '100%', padding: '7px', borderRadius: 7, border: '1px solid rgba(124,58,237,0.3)', background: 'rgba(124,58,237,0.06)', color: '#a78bfa', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
          Ver Concursos →
        </button>
      </div>
    </div>
  )
}

export default function NexusDashboard({ onNavigate }: Props) {
  const hooks = useEditaisAGU()
  const ponto = usePontoStats()
  useContasPagar()  // usado nos widgets
  useConcursosDash() // usado nos widgets
  const { layout, saveLayout, resetLayout } = useLayout()
  const [editing, setEditing] = useState(false)
  const [showPanel, setShowPanel] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const [gridW, setGridW] = useState(900)

  useEffect(() => {
    const obs = new ResizeObserver(entries => setGridW(entries[0].contentRect.width))
    if (gridRef.current) obs.observe(gridRef.current)
    return () => obs.disconnect()
  }, [])

  const allIds = useMemo(() => AGU_DISCIPLINAS.flatMap(d => d.topicos.flatMap(t => t.subtopicos.map(s => s.id))), [])
  const global = hooks.getStats(allIds)

  const lastFinalized = useMemo(() => {
    let best: { nome: string; disc: string; data: string } | null = null
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
    const st = hooks.getStats(ids)
    return { ...d, ...st, total: ids.length }
  }), [hooks])

  const handleMove = useCallback((id: string, col: number, row: number) => {
    saveLayout(layout.map(w => w.id === id ? { ...w, col, row } : w))
  }, [layout, saveLayout])

  const handleResize = useCallback((id: string, nw: number, nh: number) => {
    saveLayout(layout.map(w => w.id === id ? { ...w, w: nw, h: nh } : w))
  }, [layout, saveLayout])

  const toggleVisible = (id: string) => saveLayout(layout.map(w => w.id === id ? { ...w, visible: !w.visible } : w))

  // Altura total da grade
  const maxRow = layout.filter(w => w.visible).reduce((a, w) => Math.max(a, w.row + w.h), 0)
  const gridH = maxRow * ROW_H + (maxRow - 1) * GAP + 20

  const colW = gridW / COLS

  function renderWidget(w: Widget) {
    switch (w.id) {
      case 'kpi-edital': return <KpiCard label="Progresso Edital" value={`${global.pctConcluido}%`} sub={`${global.concluidos}/${TOTAL_SUBTOPICOS} subtópicos`} color="#00e5ff" />
      case 'kpi-questoes': return <KpiCard label="Questões Feitas" value={global.questoes || '—'} sub={`${global.acertos} acertos`} color="#7c3aed" />
      case 'kpi-acerto': return <KpiCard label="% Acerto Geral" value={global.questoes > 0 ? `${global.pctAcerto}%` : '—'} sub="performance geral" color="#10b981" />
      case 'kpi-ponto': return <KpiCard label="Horas no Mês" value={`${ponto.hMes}h${ponto.mMes > 0 ? ` ${ponto.mMes}m` : ''}`} sub={ponto.emServico ? '🟢 Em serviço' : 'Ponto eletrônico'} color="#f59e0b" />
      case 'ponto-rapido': return <PontoRapidoCard ponto={ponto} onNavigate={onNavigate} />
      case 'agu-panel': return <AguPanel global={global} lastFinalized={lastFinalized} discStats={discStats} onNavigate={onNavigate} />
      case 'questoes-panel': return <QuestoesPanel global={global} discStats={discStats} onNavigate={onNavigate} />
      case 'contas-pagar':   return <ContasPagarCard onNavigate={onNavigate} />
      case 'concursos-dash': return <ConcursosDashCard onNavigate={onNavigate} />
      case 'modulos': return <ModulosCard global={global} ponto={ponto} onNavigate={onNavigate} />
      default: return null
    }
  }

  return (
    <div style={{ padding: '16px 20px', minHeight: '100%' }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1 }}>
          Dashboard {editing && <span style={{ color: '#f59e0b' }}>· Modo Edição</span>}
        </div>
        <button onClick={() => setShowPanel(p => !p)} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)', background: showPanel ? 'rgba(0,229,255,0.08)' : 'none', color: showPanel ? 'var(--text-accent)' : 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.15s' }}>
          ▦ Widgets
        </button>
        <button onClick={() => setEditing(e => !e)} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${editing ? 'rgba(245,158,11,0.5)' : 'var(--border)'}`, background: editing ? 'rgba(245,158,11,0.12)' : 'none', color: editing ? '#f59e0b' : 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.15s' }}>
          {editing ? '✓ Salvar Layout' : '✎ Editar Layout'}
        </button>
        {editing && (
          <button onClick={resetLayout} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>
            ↺ Resetar
          </button>
        )}
      </div>

      {/* ── Painel de widgets ── */}
      {showPanel && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Mostrar / Ocultar Widgets</div>
          {layout.map(w => (
            <button key={w.id} onClick={() => toggleVisible(w.id)} style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${w.visible ? 'rgba(0,229,255,0.3)' : 'var(--border)'}`, background: w.visible ? 'rgba(0,229,255,0.08)' : 'none', color: w.visible ? 'var(--text-accent)' : 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.72rem', cursor: 'pointer', transition: 'all 0.15s' }}>
              {w.visible ? '◉' : '○'} {WIDGET_LABELS[w.id] ?? w.id}
            </button>
          ))}
        </div>
      )}

      {/* ── Grid ── */}
      {editing && (
        <div style={{ background: 'repeating-linear-gradient(90deg, rgba(0,229,255,0.03) 0px, rgba(0,229,255,0.03) 1px, transparent 1px, transparent calc(100%/' + COLS + '))', position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }} />
      )}

      <div ref={gridRef} style={{ position: 'relative', width: '100%', height: gridH, minHeight: 400 }}>
        {layout.filter(w => w.visible).map(w => {
          const wPx = w.w * colW + Math.max(0, w.w - 1) * GAP / COLS
          const hPx = w.h * ROW_H + Math.max(0, w.h - 1) * GAP
          const leftPx = w.col * colW + Math.max(0, w.col) * GAP / COLS
          const topPx = w.row * (ROW_H + GAP)

          return (
            <DraggableWidget
              key={w.id}
              widget={{ ...w, col: w.col, row: w.row }}
              editing={editing}
              gridW={gridW}
              onMove={handleMove}
              onResize={handleResize}
            >
              <div style={{ width: wPx, height: hPx, left: leftPx, top: topPx }}>
                {renderWidget(w)}
              </div>
            </DraggableWidget>
          )
        })}
      </div>

      {editing && (
        <div style={{ textAlign: 'center', padding: '12px 0', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          🖱 Arraste pelo topo do card para mover · Puxe o canto inferior direito para redimensionar
        </div>
      )}
    </div>
  )
}
