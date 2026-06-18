import { useState, useEffect, useRef, useCallback } from 'react'
import type { GameProps } from './Arcade'

// ══════════════════════════════════════════════════════════════════════════════
// LOTE G — 10 novos jogos de Arcade (canvas, divertidos e visuais)
// ══════════════════════════════════════════════════════════════════════════════

// ── helpers compartilhados ─────────────────────────────────────────────────────
function useAnimLoop(cb: (dt: number) => void, running: boolean) {
  const ref = useRef<number>()
  const last = useRef(0)
  const cbRef = useRef(cb); cbRef.current = cb
  useEffect(() => {
    if (!running) { if (ref.current) cancelAnimationFrame(ref.current); return }
    const loop = (ts: number) => {
      const dt = Math.min((ts - (last.current || ts)) / 1000, 0.05)
      last.current = ts; cbRef.current(dt); ref.current = requestAnimationFrame(loop)
    }
    last.current = 0; ref.current = requestAnimationFrame(loop)
    return () => { if (ref.current) cancelAnimationFrame(ref.current) }
  }, [running])
}
function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 10 }}>
      {children}
    </div>
  )
}
function PlayBtn({ onClick, label = '▶ Jogar', color = '#60a5fa' }: { onClick: () => void; label?: string; color?: string }) {
  return (
    <button onClick={onClick} style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: color, color: '#0b1020', fontWeight: 800, fontSize: '0.92rem', cursor: 'pointer', boxShadow: `0 6px 18px ${color}66` }}>{label}</button>
  )
}
const wrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }
const tip: React.CSSProperties = { fontSize: '0.62rem', color: 'var(--text-muted)' }
function frame(color: string): React.CSSProperties { return { position: 'relative', borderRadius: 14, overflow: 'hidden', border: `2px solid ${color}55`, boxShadow: `0 10px 30px ${color}22` } }
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. TETRIS
// ══════════════════════════════════════════════════════════════════════════════
type Cell = string | null
const TET_SHAPES: { cells: [number, number][]; color: string }[] = [
  { cells: [[0, 0], [0, 1], [0, 2], [0, 3]], color: '#22d3ee' }, // I
  { cells: [[0, 0], [0, 1], [1, 0], [1, 1]], color: '#fbbf24' }, // O
  { cells: [[0, 1], [1, 0], [1, 1], [1, 2]], color: '#c084fc' }, // T
  { cells: [[0, 1], [0, 2], [1, 0], [1, 1]], color: '#4ade80' }, // S
  { cells: [[0, 0], [0, 1], [1, 1], [1, 2]], color: '#f87171' }, // Z
  { cells: [[0, 0], [1, 0], [1, 1], [1, 2]], color: '#60a5fa' }, // J
  { cells: [[0, 2], [1, 0], [1, 1], [1, 2]], color: '#fb923c' }, // L
]
export function GameTetris({ onEnd, bestScore }: GameProps) {
  const COLS = 10, ROWS = 18, CELL = 19, W = COLS * CELL, H = ROWS * CELL
  const cv = useRef<HTMLCanvasElement>(null)
  const S = useRef({
    board: Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null)),
    piece: TET_SHAPES[0].cells.map(c => [...c] as [number, number]), color: TET_SHAPES[0].color,
    px: 3, py: 0, drop: 0, lines: 0, score: 0, over: false, started: false,
  })
  const [ui, setUi] = useState({ score: 0, lines: 0, over: false, started: false })

  const collide = (cells: [number, number][], px: number, py: number) => {
    const s = S.current
    return cells.some(([r, c]) => {
      const nr = py + r, nc = px + c
      return nc < 0 || nc >= COLS || nr >= ROWS || (nr >= 0 && s.board[nr][nc])
    })
  }
  const spawn = () => {
    const s = S.current; const sh = TET_SHAPES[Math.floor(Math.random() * TET_SHAPES.length)]
    s.piece = sh.cells.map(c => [...c] as [number, number]); s.color = sh.color; s.px = 3; s.py = 0
    if (collide(s.piece, s.px, s.py)) { s.over = true; setUi(u => ({ ...u, over: true })); onEnd(s.score >= 1000 ? 'win' : 'play', s.score) }
  }
  const lock = () => {
    const s = S.current
    s.piece.forEach(([r, c]) => { const nr = s.py + r; if (nr >= 0) s.board[nr][s.px + c] = s.color })
    let cleared = 0
    for (let r = ROWS - 1; r >= 0; r--) {
      if (s.board[r].every(Boolean)) { s.board.splice(r, 1); s.board.unshift(Array<Cell>(COLS).fill(null)); cleared++; r++ }
    }
    if (cleared) { s.lines += cleared; s.score += [0, 100, 300, 500, 800][cleared] }
    setUi(u => ({ ...u, score: s.score, lines: s.lines }))
    spawn()
  }
  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!; const s = S.current
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0f172a'); bg.addColorStop(1, '#1e1b4b'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H); ctx.stroke() }
    for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W, y * CELL); ctx.stroke() }
    const block = (r: number, cc: number, col: string) => {
      const x = cc * CELL, y = r * CELL; ctx.fillStyle = col; rr(ctx, x + 1, y + 1, CELL - 2, CELL - 2, 4); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; rr(ctx, x + 3, y + 3, CELL - 6, 4, 2); ctx.fill()
    }
    s.board.forEach((row, r) => row.forEach((col, cc) => { if (col) block(r, cc, col) }))
    s.piece.forEach(([r, cc]) => { if (s.py + r >= 0) block(s.py + r, s.px + cc, s.color) })
  }, [H, W])

  const move = (dx: number) => { const s = S.current; if (!collide(s.piece, s.px + dx, s.py)) { s.px += dx; draw() } }
  const rotate = () => {
    const s = S.current; const rot = s.piece.map(([r, c]) => [c, -r] as [number, number])
    const minR = Math.min(...rot.map(p => p[0])), minC = Math.min(...rot.map(p => p[1]))
    const norm = rot.map(([r, c]) => [r - minR, c - minC] as [number, number])
    if (!collide(norm, s.px, s.py)) { s.piece = norm; draw() }
  }
  const step = () => { const s = S.current; if (!collide(s.piece, s.px, s.py + 1)) { s.py++ } else { lock() } draw() }
  const hardDrop = () => { const s = S.current; while (!collide(s.piece, s.px, s.py + 1)) s.py++; lock(); draw() }

  const update = useCallback((dt: number) => {
    const s = S.current; if (s.over || !s.started) return
    s.drop += dt; const interval = Math.max(0.12, 0.6 - s.lines * 0.02)
    if (s.drop >= interval) { s.drop = 0; step() }
  }, [])
  useAnimLoop(update, ui.started && !ui.over)

  useEffect(() => {
    draw()
    const kd = (e: KeyboardEvent) => {
      if (!S.current.started || S.current.over) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); move(1) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); rotate() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); step() }
      else if (e.code === 'Space') { e.preventDefault(); hardDrop() }
    }
    window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd)
  }, [draw])

  const start = () => {
    S.current = { board: Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null)), piece: TET_SHAPES[0].cells.map(c => [...c] as [number, number]), color: TET_SHAPES[0].color, px: 3, py: 0, drop: 0, lines: 0, score: 0, over: false, started: true }
    spawn(); setUi({ score: 0, lines: 0, over: false, started: true }); draw()
  }
  return (
    <div style={wrap}>
      <div style={{ display: 'flex', gap: 10, fontSize: '0.75rem', fontWeight: 700 }}>
        <span style={{ color: '#a5b4fc' }}>Pontos: {ui.score}</span><span style={{ color: '#22d3ee' }}>Linhas: {ui.lines}</span>
      </div>
      <div style={frame('#6366f1')}>
        <canvas ref={cv} width={W} height={H} />
        {!ui.started && <Overlay><div style={{ fontSize: '2.4rem' }}>🟦</div><div style={{ color: '#fff', fontWeight: 800 }}>TETRIS</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.74rem', textAlign: 'center' }}>← → mover · ↑ girar · ↓ descer · Espaço derrubar</div><PlayBtn onClick={start} color="#818cf8" /></Overlay>}
        {ui.over && <Overlay><div style={{ color: '#f87171', fontWeight: 900, fontSize: '1.2rem' }}>GAME OVER</div><div style={{ color: '#fff' }}>Pontos: {ui.score}</div>{ui.score > bestScore && <div style={{ color: '#fbbf24', fontSize: '0.85rem' }}>🎉 Novo recorde!</div>}<PlayBtn onClick={start} label="↺ Jogar de novo" color="#818cf8" /></Overlay>}
      </div>
      <div style={tip}>Encaixe as peças e complete linhas</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. CORREDOR SEM FIM (runner estilo dino)
// ══════════════════════════════════════════════════════════════════════════════
export function GameRunner({ onEnd, bestScore }: GameProps) {
  const W = 540, H = 200, GROUND = H - 34
  const cv = useRef<HTMLCanvasElement>(null)
  const S = useRef({ y: GROUND, vy: 0, obs: [] as { x: number; w: number; h: number }[], t: 0, spawn: 0, spd: 240, score: 0, over: false, started: false, legs: 0 })
  const [ui, setUi] = useState({ score: 0, over: false, started: false })
  const jump = useCallback(() => {
    const s = S.current; if (s.over) return
    if (!s.started) { s.started = true; setUi(u => ({ ...u, started: true })) }
    if (s.y >= GROUND - 0.5) s.vy = -560
  }, [GROUND])
  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!; const s = S.current
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#1e293b'); sky.addColorStop(1, '#0f172a'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)
    for (let i = 0; i < 6; i++) { const x = ((i * 110 - s.t * 18) % (W + 80) + W + 80) % (W + 80) - 40; ctx.fillStyle = 'rgba(148,163,184,0.12)'; ctx.beginPath(); ctx.ellipse(x, 42 + (i % 3) * 14, 30, 12, 0, 0, Math.PI * 2); ctx.fill() }
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, GROUND + 16); ctx.lineTo(W, GROUND + 16); ctx.stroke()
    for (let i = 0; i < 14; i++) { const x = ((i * 50 - s.t * s.spd) % (W + 60) + W + 60) % (W + 60) - 30; ctx.fillStyle = '#475569'; ctx.fillRect(x, GROUND + 22, 18, 3) }
    s.obs.forEach(o => { ctx.fillStyle = '#34d399'; rr(ctx, o.x, GROUND + 16 - o.h, o.w, o.h, 3); ctx.fill(); ctx.fillStyle = '#10b981'; ctx.fillRect(o.x + 2, GROUND + 16 - o.h + 3, o.w - 4, 4) })
    const py = s.y - 26
    ctx.fillStyle = '#fbbf24'; rr(ctx, 60, py, 26, 26, 6); ctx.fill()
    ctx.fillStyle = '#1f2937'; ctx.fillRect(78, py + 6, 5, 5)
    ctx.fillStyle = '#f59e0b'; const lo = Math.floor(s.legs) % 2 === 0 && s.y >= GROUND - 0.5
    ctx.fillRect(63, py + 26, 6, lo ? 6 : 3); ctx.fillRect(77, py + 26, 6, lo ? 3 : 6)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'right'; ctx.fillText(`${s.score}`, W - 14, 30); ctx.textAlign = 'start'
  }, [GROUND])
  const update = useCallback((dt: number) => {
    const s = S.current; if (s.over || !s.started) return
    s.t += dt; s.legs += dt * 12; s.spd += dt * 8
    s.vy += 1500 * dt; s.y += s.vy * dt; if (s.y > GROUND) { s.y = GROUND; s.vy = 0 }
    s.spawn -= dt; if (s.spawn <= 0) { s.obs.push({ x: W + 10, w: 16 + Math.random() * 16, h: 22 + Math.random() * 26 }); s.spawn = 0.7 + Math.random() * 0.7 }
    s.obs.forEach(o => o.x -= s.spd * dt); s.obs = s.obs.filter(o => o.x > -40)
    s.score = Math.floor(s.t * 10)
    for (const o of s.obs) { if (60 + 26 > o.x && 60 < o.x + o.w && s.y > GROUND - o.h) { s.over = true; setUi({ score: s.score, over: true, started: true }); onEnd(s.score >= 200 ? 'win' : 'play', s.score); break } }
    setUi(u => (u.score === s.score ? u : { ...u, score: s.score })); draw()
  }, [GROUND, draw])
  useAnimLoop(update, ui.started && !ui.over)
  useEffect(() => {
    draw()
    const kd = (e: KeyboardEvent) => { if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); jump() } }
    window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd)
  }, [draw, jump])
  const start = () => { S.current = { y: GROUND, vy: 0, obs: [], t: 0, spawn: 0.8, spd: 240, score: 0, over: false, started: true, legs: 0 }; setUi({ score: 0, over: false, started: true }); draw() }
  return (
    <div style={wrap}>
      <div style={frame('#34d399')} onClick={ui.over ? start : jump}>
        <canvas ref={cv} width={W} height={H} style={{ cursor: 'pointer' }} />
        {!ui.started && <Overlay><div style={{ fontSize: '2.4rem' }}>🦖</div><div style={{ color: '#fff', fontWeight: 800 }}>CORREDOR SEM FIM</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.74rem' }}>Espaço / clique para pular</div><PlayBtn onClick={start} color="#34d399" /></Overlay>}
        {ui.over && <Overlay><div style={{ color: '#f87171', fontWeight: 900, fontSize: '1.2rem' }}>💥 BATEU!</div><div style={{ color: '#fff' }}>Distância: {ui.score}</div>{ui.score > bestScore && <div style={{ color: '#fbbf24', fontSize: '0.85rem' }}>🎉 Novo recorde!</div>}<PlayBtn onClick={start} label="↺ Correr de novo" color="#34d399" /></Overlay>}
      </div>
      <div style={tip}>Pule os obstáculos — a velocidade aumenta</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. MOTO DE LUZ (tron)
// ══════════════════════════════════════════════════════════════════════════════
export function GameTron({ onEnd, bestScore }: GameProps) {
  const CELL = 12, COLS = 42, ROWS = 30, W = COLS * CELL, H = ROWS * CELL
  type Pt = { x: number; y: number }
  const cv = useRef<HTMLCanvasElement>(null)
  const dirs: Record<string, Pt> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }
  const S = useRef({ grid: new Set<string>(), p: { x: 8, y: 15 }, pd: dirs.right, a: { x: 33, y: 15 }, ad: dirs.left, acc: 0, score: 0, over: false, started: false })
  const [ui, setUi] = useState({ over: false, started: false, win: false, score: 0 })
  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!; const s = S.current
    ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(56,189,248,0.07)'; for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H); ctx.stroke() } for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W, y * CELL); ctx.stroke() }
    s.grid.forEach(k => { const [t, x, y] = k.split(':'); ctx.fillStyle = t === 'p' ? 'rgba(34,211,238,0.55)' : 'rgba(244,114,182,0.5)'; ctx.fillRect(+x * CELL + 1, +y * CELL + 1, CELL - 2, CELL - 2) })
    ctx.fillStyle = '#22d3ee'; ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 10; ctx.fillRect(s.p.x * CELL, s.p.y * CELL, CELL, CELL)
    ctx.fillStyle = '#f472b6'; ctx.shadowColor = '#f472b6'; ctx.fillRect(s.a.x * CELL, s.a.y * CELL, CELL, CELL); ctx.shadowBlur = 0
  }, [W, H])
  const dead = (x: number, y: number, who: 'p' | 'a') => {
    const s = S.current
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true
    return s.grid.has(`p:${x}:${y}`) || s.grid.has(`a:${x}:${y}`) || (who === 'p' ? (x === s.a.x && y === s.a.y) : (x === s.p.x && y === s.p.y))
  }
  const aiDir = () => {
    const s = S.current; const opts = [s.ad, dirs.up, dirs.down, dirs.left, dirs.right].filter(d => !(d.x === -s.ad.x && d.y === -s.ad.y))
    const safe = opts.filter(d => !dead(s.a.x + d.x, s.a.y + d.y, 'a'))
    if (!safe.length) return s.ad
    if (!dead(s.a.x + s.ad.x, s.a.y + s.ad.y, 'a') && Math.random() > 0.18) return s.ad
    return safe[Math.floor(Math.random() * safe.length)]
  }
  const tick = () => {
    const s = S.current
    s.grid.add(`p:${s.p.x}:${s.p.y}`); s.grid.add(`a:${s.a.x}:${s.a.y}`)
    s.ad = aiDir()
    const np = { x: s.p.x + s.pd.x, y: s.p.y + s.pd.y }, na = { x: s.a.x + s.ad.x, y: s.a.y + s.ad.y }
    const pDead = dead(np.x, np.y, 'p'), aDead = dead(na.x, na.y, 'a') || (na.x === np.x && na.y === np.y)
    if (pDead || aDead) { s.over = true; const win = aDead && !pDead; setUi({ over: true, started: true, win, score: s.score }); onEnd(win ? 'win' : 'loss', s.score); return }
    s.p = np; s.a = na; s.score += 1; setUi(u => ({ ...u, score: s.score }))
  }
  const update = useCallback((dt: number) => { const s = S.current; if (s.over || !s.started) return; s.acc += dt; if (s.acc >= 0.07) { s.acc = 0; tick(); draw() } }, [draw])
  useAnimLoop(update, ui.started && !ui.over)
  useEffect(() => {
    draw()
    const kd = (e: KeyboardEvent) => {
      const s = S.current; if (!s.started || s.over) return; let nd: Pt | null = null
      if (e.key === 'ArrowUp') nd = dirs.up; else if (e.key === 'ArrowDown') nd = dirs.down; else if (e.key === 'ArrowLeft') nd = dirs.left; else if (e.key === 'ArrowRight') nd = dirs.right
      if (nd && !(nd.x === -s.pd.x && nd.y === -s.pd.y)) { e.preventDefault(); s.pd = nd }
    }
    window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd)
  }, [draw])
  const start = () => { S.current = { grid: new Set(), p: { x: 8, y: 15 }, pd: dirs.right, a: { x: 33, y: 15 }, ad: dirs.left, acc: 0, score: 0, over: false, started: true }; setUi({ over: false, started: true, win: false, score: 0 }); draw() }
  return (
    <div style={wrap}>
      <div style={frame('#22d3ee')}>
        <canvas ref={cv} width={W} height={H} />
        {!ui.started && <Overlay><div style={{ fontSize: '2.4rem' }}>🏍️</div><div style={{ color: '#fff', fontWeight: 800 }}>MOTO DE LUZ</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.74rem' }}>Setas para virar · não toque nos rastros</div><PlayBtn onClick={start} color="#22d3ee" /></Overlay>}
        {ui.over && <Overlay><div style={{ color: ui.win ? '#4ade80' : '#f87171', fontWeight: 900, fontSize: '1.2rem' }}>{ui.win ? '🏆 VOCÊ VENCEU!' : '💥 VOCÊ BATEU'}</div><div style={{ color: '#fff' }}>Sobrevivência: {ui.score}</div>{ui.score > bestScore && <div style={{ color: '#fbbf24', fontSize: '0.85rem' }}>🎉 Novo recorde!</div>}<PlayBtn onClick={start} label="↺ De novo" color="#22d3ee" /></Overlay>}
      </div>
      <div style={tip}>Force a IA a bater antes de você</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. PULO NAS NUVENS (doodle jump)
// ══════════════════════════════════════════════════════════════════════════════
export function GameDoodle({ onEnd, bestScore }: GameProps) {
  const W = 320, H = 460
  type Plat = { x: number; y: number }
  const cv = useRef<HTMLCanvasElement>(null)
  const mk = () => { const p: Plat[] = []; for (let i = 0; i < 9; i++) p.push({ x: Math.random() * (W - 60), y: H - 40 - i * 52 }); return p }
  const S = useRef({ x: W / 2, vx: 0, y: H - 80, vy: 0, plats: mk(), score: 0, top: 0, over: false, started: false, keys: { l: false, r: false } })
  const [ui, setUi] = useState({ score: 0, over: false, started: false })
  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!; const s = S.current
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#1e3a8a'); sky.addColorStop(1, '#0c4a6e'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)
    s.plats.forEach(p => { ctx.fillStyle = '#e0f2fe'; rr(ctx, p.x, p.y, 60, 14, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.5)'; rr(ctx, p.x + 6, p.y + 3, 48, 4, 2); ctx.fill() })
    ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(s.x, s.y, 15, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#1f2937'; ctx.fillRect(s.x - 6, s.y - 4, 4, 4); ctx.fillRect(s.x + 2, s.y - 4, 4, 4)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace'; ctx.fillText(`${s.score}`, 12, 26)
  }, [])
  const update = useCallback((dt: number) => {
    const s = S.current; if (s.over || !s.started) return
    s.vx = (s.keys.r ? 1 : 0) * 280 - (s.keys.l ? 1 : 0) * 280
    s.x += s.vx * dt; if (s.x < 0) s.x = W; if (s.x > W) s.x = 0
    s.vy += 1100 * dt; s.y += s.vy * dt
    if (s.vy > 0) s.plats.forEach(p => { if (s.x > p.x - 4 && s.x < p.x + 64 && s.y + 15 > p.y && s.y + 15 < p.y + 22) { s.vy = -640 } })
    if (s.y < H * 0.42) { const dy = H * 0.42 - s.y; s.y = H * 0.42; s.top += dy; s.plats.forEach(p => p.y += dy); s.score = Math.floor(s.top / 10) }
    s.plats = s.plats.filter(p => p.y < H + 20); while (s.plats.length < 9) { const minY = Math.min(...s.plats.map(p => p.y)); s.plats.push({ x: Math.random() * (W - 60), y: minY - 52 }) }
    if (s.y > H + 20) { s.over = true; setUi({ score: s.score, over: true, started: true }); onEnd(s.score >= 300 ? 'win' : 'play', s.score); return }
    setUi(u => (u.score === s.score ? u : { ...u, score: s.score })); draw()
  }, [draw])
  useAnimLoop(update, ui.started && !ui.over)
  useEffect(() => {
    draw()
    const set = (e: KeyboardEvent, v: boolean) => { if (e.key === 'ArrowLeft') S.current.keys.l = v; else if (e.key === 'ArrowRight') S.current.keys.r = v }
    const kd = (e: KeyboardEvent) => set(e, true), ku = (e: KeyboardEvent) => set(e, false)
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [draw])
  const start = () => { S.current = { x: W / 2, vx: 0, y: H - 80, vy: -640, plats: mk(), score: 0, top: 0, over: false, started: true, keys: { l: false, r: false } }; setUi({ score: 0, over: false, started: true }); draw() }
  return (
    <div style={wrap}>
      <div style={frame('#38bdf8')}>
        <canvas ref={cv} width={W} height={H} />
        {!ui.started && <Overlay><div style={{ fontSize: '2.4rem' }}>☁️</div><div style={{ color: '#fff', fontWeight: 800 }}>PULO NAS NUVENS</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.74rem' }}>← → para se mover · suba o mais alto que puder</div><PlayBtn onClick={start} color="#38bdf8" /></Overlay>}
        {ui.over && <Overlay><div style={{ color: '#f87171', fontWeight: 900, fontSize: '1.2rem' }}>CAIU!</div><div style={{ color: '#fff' }}>Altura: {ui.score}</div>{ui.score > bestScore && <div style={{ color: '#fbbf24', fontSize: '0.85rem' }}>🎉 Novo recorde!</div>}<PlayBtn onClick={start} label="↺ Subir de novo" color="#38bdf8" /></Overlay>}
      </div>
      <div style={tip}>Pule de nuvem em nuvem sem cair</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. TRAVESSIA (frogger)
// ══════════════════════════════════════════════════════════════════════════════
export function GameCrossy({ onEnd, bestScore }: GameProps) {
  const CELL = 42, COLS = 10, ROWS = 10, W = COLS * CELL, H = ROWS * CELL
  type Car = { x: number; lane: number; w: number; spd: number; color: string }
  const cv = useRef<HTMLCanvasElement>(null)
  const cols = ['#f87171', '#fbbf24', '#a78bfa', '#34d399', '#60a5fa']
  const mkCars = () => { const cs: Car[] = []; for (let lane = 1; lane <= 8; lane++) { const dir = lane % 2 ? 1 : -1; const spd = (60 + Math.random() * 80) * dir; for (let i = 0; i < 2; i++) cs.push({ x: Math.random() * W, lane, w: 46 + Math.random() * 22, spd, color: cols[lane % cols.length] }) } return cs }
  const S = useRef({ fx: 4, fy: 9, cars: mkCars(), score: 0, over: false, started: false })
  const [ui, setUi] = useState({ score: 0, over: false, started: false })
  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!; const s = S.current
    for (let r = 0; r < ROWS; r++) { ctx.fillStyle = r === 0 ? '#14532d' : r === 9 ? '#166534' : (r % 2 ? '#1f2937' : '#111827'); ctx.fillRect(0, r * CELL, W, CELL); if (r > 0 && r < 9) { ctx.strokeStyle = 'rgba(250,204,21,0.4)'; ctx.setLineDash([10, 12]); ctx.beginPath(); ctx.moveTo(0, r * CELL + CELL / 2); ctx.lineTo(W, r * CELL + CELL / 2); ctx.stroke(); ctx.setLineDash([]) } }
    s.cars.forEach(car => { ctx.fillStyle = car.color; rr(ctx, car.x, car.lane * CELL + 7, car.w, CELL - 14, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(car.x + 6, car.lane * CELL + 11, car.w - 12, 5) })
    ctx.font = `${CELL - 12}px serif`; ctx.textAlign = 'center'; ctx.fillText('🐸', s.fx * CELL + CELL / 2, s.fy * CELL + CELL - 9); ctx.textAlign = 'start'
    ctx.fillStyle = '#fff'; ctx.font = 'bold 17px monospace'; ctx.fillText(`${s.score}`, 10, 22)
  }, [])
  const update = useCallback((dt: number) => {
    const s = S.current; if (s.over || !s.started) return
    s.cars.forEach(car => { car.x += car.spd * dt; if (car.spd > 0 && car.x > W) car.x = -car.w; if (car.spd < 0 && car.x < -car.w) car.x = W })
    const fpx = s.fx * CELL + CELL / 2
    for (const car of s.cars) { if (car.lane === s.fy && fpx > car.x && fpx < car.x + car.w) { s.over = true; setUi({ score: s.score, over: true, started: true }); onEnd(s.score >= 5 ? 'win' : 'play', s.score * 50); return } }
    draw()
  }, [draw])
  useAnimLoop(update, ui.started && !ui.over)
  useEffect(() => {
    draw()
    const kd = (e: KeyboardEvent) => {
      const s = S.current; if (!s.started || s.over) return
      if (e.key === 'ArrowUp') { e.preventDefault(); s.fy-- } else if (e.key === 'ArrowDown') { e.preventDefault(); if (s.fy < 9) s.fy++ } else if (e.key === 'ArrowLeft') { e.preventDefault(); if (s.fx > 0) s.fx-- } else if (e.key === 'ArrowRight') { e.preventDefault(); if (s.fx < COLS - 1) s.fx++ } else return
      if (s.fy < 0) { s.score++; s.fy = 9; setUi(u => ({ ...u, score: s.score })) }
      draw()
    }
    window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd)
  }, [draw])
  const start = () => { S.current = { fx: 4, fy: 9, cars: mkCars(), score: 0, over: false, started: true }; setUi({ score: 0, over: false, started: true }); draw() }
  return (
    <div style={wrap}>
      <div style={frame('#4ade80')}>
        <canvas ref={cv} width={W} height={H} />
        {!ui.started && <Overlay><div style={{ fontSize: '2.4rem' }}>🐸</div><div style={{ color: '#fff', fontWeight: 800 }}>TRAVESSIA</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.74rem' }}>Setas para mover · atravesse sem ser atropelado</div><PlayBtn onClick={start} color="#4ade80" /></Overlay>}
        {ui.over && <Overlay><div style={{ color: '#f87171', fontWeight: 900, fontSize: '1.2rem' }}>💥 ATROPELADO!</div><div style={{ color: '#fff' }}>Travessias: {ui.score}</div>{ui.score * 50 > bestScore && <div style={{ color: '#fbbf24', fontSize: '0.85rem' }}>🎉 Novo recorde!</div>}<PlayBtn onClick={start} label="↺ De novo" color="#4ade80" /></Overlay>}
      </div>
      <div style={tip}>Cada travessia completa vale pontos</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. CORTA FRUTAS (fruit slice)
// ══════════════════════════════════════════════════════════════════════════════
export function GameFruit({ onEnd, bestScore }: GameProps) {
  const W = 500, H = 360
  type Obj = { x: number; y: number; vx: number; vy: number; r: number; bomb: boolean; emoji: string; sliced: boolean }
  const cv = useRef<HTMLCanvasElement>(null)
  const fruits = ['🍉', '🍎', '🍊', '🍓', '🍍', '🥝', '🍇', '🍌']
  const S = useRef({ objs: [] as Obj[], spawn: 0, score: 0, lives: 3, over: false, started: false, trail: [] as { x: number; y: number }[] })
  const [ui, setUi] = useState({ score: 0, lives: 3, over: false, started: false })
  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!; const s = S.current
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1a1033'); bg.addColorStop(1, '#0b1020'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
    s.objs.forEach(o => { if (o.sliced) return; ctx.font = `${o.r * 2}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.bomb ? '💣' : o.emoji, o.x, o.y); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start' })
    if (s.trail.length > 1) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(s.trail[0].x, s.trail[0].y); s.trail.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke() }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace'; ctx.fillText(`${s.score}`, 12, 26); ctx.fillText('❤'.repeat(s.lives), W - 78, 24)
  }, [])
  const update = useCallback((dt: number) => {
    const s = S.current; if (s.over || !s.started) return
    s.spawn -= dt; if (s.spawn <= 0) { const bomb = Math.random() < 0.16; s.objs.push({ x: 60 + Math.random() * (W - 120), y: H + 30, vx: (Math.random() - 0.5) * 160, vy: -(520 + Math.random() * 130), r: 22, bomb, emoji: fruits[Math.floor(Math.random() * fruits.length)], sliced: false }); s.spawn = 0.7 + Math.random() * 0.5 }
    s.objs.forEach(o => { o.vy += 760 * dt; o.x += o.vx * dt; o.y += o.vy * dt })
    s.objs.forEach(o => { if (!o.bomb && !o.sliced && o.y - o.r > H + 10) { o.sliced = true; s.lives-- } })
    s.objs = s.objs.filter(o => o.y - o.r <= H + 60)
    if (s.trail.length) s.trail.shift()
    if (s.lives <= 0) { s.over = true; setUi({ score: s.score, lives: 0, over: true, started: true }); onEnd(s.score >= 400 ? 'win' : 'play', s.score); return }
    setUi(u => (u.score === s.score && u.lives === s.lives ? u : { ...u, score: s.score, lives: s.lives })); draw()
  }, [draw])
  useAnimLoop(update, ui.started && !ui.over)
  const slice = (mx: number, my: number) => {
    const s = S.current; if (s.over || !s.started) return
    s.trail.push({ x: mx, y: my }); if (s.trail.length > 8) s.trail.shift()
    s.objs.forEach(o => { if (o.sliced) return; if (Math.hypot(o.x - mx, o.y - my) < o.r + 6) { o.sliced = true; if (o.bomb) { s.over = true; setUi({ score: s.score, lives: s.lives, over: true, started: true }); onEnd(s.score >= 400 ? 'win' : 'play', s.score) } else { s.score += 10; setUi(u => ({ ...u, score: s.score })) } } })
  }
  useEffect(() => { draw() }, [draw])
  const start = () => { S.current = { objs: [], spawn: 0.5, score: 0, lives: 3, over: false, started: true, trail: [] }; setUi({ score: 0, lives: 3, over: false, started: true }); draw() }
  const pos = (e: React.MouseEvent) => { const r = (e.target as HTMLCanvasElement).getBoundingClientRect(); slice((e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)) }
  return (
    <div style={wrap}>
      <div style={frame('#f472b6')}>
        <canvas ref={cv} width={W} height={H} onMouseMove={e => { if (e.buttons === 1) pos(e) }} onMouseDown={pos} style={{ cursor: 'crosshair' }} />
        {!ui.started && <Overlay><div style={{ fontSize: '2.4rem' }}>🍉</div><div style={{ color: '#fff', fontWeight: 800 }}>CORTA FRUTAS</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.74rem' }}>Arraste o mouse para cortar · evite 💣</div><PlayBtn onClick={start} color="#f472b6" /></Overlay>}
        {ui.over && <Overlay><div style={{ color: '#f87171', fontWeight: 900, fontSize: '1.2rem' }}>FIM!</div><div style={{ color: '#fff' }}>Pontos: {ui.score}</div>{ui.score > bestScore && <div style={{ color: '#fbbf24', fontSize: '0.85rem' }}>🎉 Novo recorde!</div>}<PlayBtn onClick={start} label="↺ De novo" color="#f472b6" /></Overlay>}
      </div>
      <div style={tip}>Corte as frutas, não deixe cair e fuja das bombas</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. ACERTE A TOUPEIRA (whack-a-mole)
// ══════════════════════════════════════════════════════════════════════════════
export function GameMole({ onEnd, bestScore }: GameProps) {
  const W = 420, H = 380, GRID = 3, PAD = 24, GAP = 16
  const SIZE = (W - PAD * 2 - GAP * (GRID - 1)) / GRID
  const cv = useRef<HTMLCanvasElement>(null)
  const S = useRef({ holes: Array.from({ length: 9 }, () => ({ up: 0, bomb: false })), spawn: 0, score: 0, time: 30, over: false, started: false })
  const [ui, setUi] = useState({ score: 0, time: 30, over: false, started: false })
  const holeXY = (i: number) => ({ x: PAD + (i % GRID) * (SIZE + GAP), y: 54 + Math.floor(i / GRID) * (SIZE + GAP) })
  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!; const s = S.current
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1e3a1e'); bg.addColorStop(1, '#0f2010'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace'; ctx.fillText(`Pontos: ${s.score}`, 16, 30); ctx.textAlign = 'right'; ctx.fillStyle = s.time < 6 ? '#f87171' : '#fbbf24'; ctx.fillText(`${Math.ceil(s.time)}s`, W - 16, 30); ctx.textAlign = 'start'
    s.holes.forEach((h, i) => {
      const { x, y } = holeXY(i)
      ctx.fillStyle = '#3f2d1a'; ctx.beginPath(); ctx.ellipse(x + SIZE / 2, y + SIZE - 10, SIZE / 2, 14, 0, 0, Math.PI * 2); ctx.fill()
      if (h.up > 0) { const pop = Math.min(1, h.up) * (SIZE - 24); const cx = x + SIZE / 2, cy = y + SIZE - 10 - pop / 2; ctx.font = `${pop + 8}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(h.bomb ? '💣' : '🐹', cx, cy); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic' }
    })
  }, [SIZE])
  const update = useCallback((dt: number) => {
    const s = S.current; if (s.over || !s.started) return
    s.time -= dt; if (s.time <= 0) { s.time = 0; s.over = true; setUi({ score: s.score, time: 0, over: true, started: true }); onEnd(s.score >= 200 ? 'win' : 'play', s.score); return }
    s.holes.forEach(h => { if (h.up > 0) { h.up += dt * 0.9; if (h.up > 2.2) h.up = 0 } })
    s.spawn -= dt; if (s.spawn <= 0) { const free = s.holes.map((h, i) => h.up === 0 ? i : -1).filter(i => i >= 0); if (free.length) { const i = free[Math.floor(Math.random() * free.length)]; s.holes[i] = { up: 0.01, bomb: Math.random() < 0.18 } } s.spawn = Math.max(0.35, 0.85 - s.score * 0.002) }
    setUi(u => ({ ...u, score: s.score, time: s.time })); draw()
  }, [draw])
  useAnimLoop(update, ui.started && !ui.over)
  const hit = (e: React.MouseEvent) => {
    const s = S.current; if (s.over || !s.started) return
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect(); const mx = (e.clientX - r.left) * (W / r.width), my = (e.clientY - r.top) * (H / r.height)
    s.holes.forEach((h, i) => { if (h.up <= 0.05) return; const { x, y } = holeXY(i); if (mx > x && mx < x + SIZE && my > y && my < y + SIZE) { if (h.bomb) { s.over = true; setUi({ score: s.score, time: s.time, over: true, started: true }); onEnd('loss', s.score) } else { s.score += 10; h.up = 0; setUi(u => ({ ...u, score: s.score })) } } })
  }
  useEffect(() => { draw() }, [draw])
  const start = () => { S.current = { holes: Array.from({ length: 9 }, () => ({ up: 0, bomb: false })), spawn: 0.4, score: 0, time: 30, over: false, started: true }; setUi({ score: 0, time: 30, over: false, started: true }); draw() }
  return (
    <div style={wrap}>
      <div style={frame('#a3e635')}>
        <canvas ref={cv} width={W} height={H} onMouseDown={hit} style={{ cursor: 'pointer' }} />
        {!ui.started && <Overlay><div style={{ fontSize: '2.4rem' }}>🐹</div><div style={{ color: '#fff', fontWeight: 800 }}>ACERTE A TOUPEIRA</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.74rem' }}>Clique nas toupeiras · evite as 💣 · 30s</div><PlayBtn onClick={start} color="#a3e635" /></Overlay>}
        {ui.over && <Overlay><div style={{ color: '#fbbf24', fontWeight: 900, fontSize: '1.2rem' }}>⏱ TEMPO!</div><div style={{ color: '#fff' }}>Pontos: {ui.score}</div>{ui.score > bestScore && <div style={{ color: '#fbbf24', fontSize: '0.85rem' }}>🎉 Novo recorde!</div>}<PlayBtn onClick={start} label="↺ De novo" color="#a3e635" /></Overlay>}
      </div>
      <div style={tip}>Acerte o máximo de toupeiras em 30 segundos</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 8. SALTO GEOMÉTRICO (geometry dash)
// ══════════════════════════════════════════════════════════════════════════════
export function GameGeoJump({ onEnd, bestScore }: GameProps) {
  const W = 560, H = 220, GROUND = H - 40
  const cv = useRef<HTMLCanvasElement>(null)
  const S = useRef({ y: GROUND, vy: 0, rot: 0, sp: [] as { x: number }[], spawn: 0, spd: 280, t: 0, score: 0, over: false, started: false })
  const [ui, setUi] = useState({ score: 0, over: false, started: false })
  const jump = useCallback(() => { const s = S.current; if (s.over) return; if (!s.started) { s.started = true; setUi(u => ({ ...u, started: true })) } if (s.y >= GROUND - 0.5) s.vy = -540 }, [GROUND])
  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!; const s = S.current
    const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#3b0764'); bg.addColorStop(1, '#1e1b4b'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(168,85,247,0.18)'; for (let x = (-(s.t * s.spd) % 40); x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
    ctx.fillStyle = '#0b0620'; ctx.fillRect(0, GROUND + 18, W, H - GROUND); ctx.fillStyle = '#a855f7'; ctx.fillRect(0, GROUND + 18, W, 3)
    s.sp.forEach(o => { ctx.fillStyle = '#f472b6'; ctx.beginPath(); ctx.moveTo(o.x, GROUND + 18); ctx.lineTo(o.x + 16, GROUND + 18); ctx.lineTo(o.x + 8, GROUND - 8); ctx.closePath(); ctx.fill() })
    ctx.save(); ctx.translate(80, s.y - 14); ctx.rotate(s.rot); ctx.fillStyle = '#22d3ee'; ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 12; rr(ctx, -14, -14, 28, 28, 5); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#0e7490'; rr(ctx, -7, -7, 14, 14, 3); ctx.fill(); ctx.restore()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'right'; ctx.fillText(`${s.score}`, W - 14, 30); ctx.textAlign = 'start'
  }, [GROUND])
  const update = useCallback((dt: number) => {
    const s = S.current; if (s.over || !s.started) return
    s.t += dt; s.spd += dt * 6; s.vy += 1500 * dt; s.y += s.vy * dt; if (s.y > GROUND) { s.y = GROUND; s.vy = 0 }
    s.rot = s.y < GROUND - 0.5 ? s.rot + dt * 7 : Math.round(s.rot / (Math.PI / 2)) * (Math.PI / 2)
    s.spawn -= dt; if (s.spawn <= 0) { s.sp.push({ x: W + 20 }); s.spawn = 0.55 + Math.random() * 0.6 }
    s.sp.forEach(o => o.x -= s.spd * dt); s.sp = s.sp.filter(o => o.x > -30)
    s.score = Math.floor(s.t * 12)
    for (const o of s.sp) { if (80 + 12 > o.x && 80 - 12 < o.x + 16 && s.y > GROUND - 18) { s.over = true; setUi({ score: s.score, over: true, started: true }); onEnd(s.score >= 250 ? 'win' : 'play', s.score); break } }
    setUi(u => (u.score === s.score ? u : { ...u, score: s.score })); draw()
  }, [GROUND, draw])
  useAnimLoop(update, ui.started && !ui.over)
  useEffect(() => {
    draw()
    const kd = (e: KeyboardEvent) => { if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); jump() } }
    window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd)
  }, [draw, jump])
  const start = () => { S.current = { y: GROUND, vy: 0, rot: 0, sp: [], spawn: 1, spd: 280, t: 0, score: 0, over: false, started: true }; setUi({ score: 0, over: false, started: true }); draw() }
  return (
    <div style={wrap}>
      <div style={frame('#a855f7')} onClick={ui.over ? start : jump}>
        <canvas ref={cv} width={W} height={H} style={{ cursor: 'pointer' }} />
        {!ui.started && <Overlay><div style={{ fontSize: '2.4rem' }}>🔷</div><div style={{ color: '#fff', fontWeight: 800 }}>SALTO GEOMÉTRICO</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.74rem' }}>Espaço / clique para saltar os espinhos</div><PlayBtn onClick={start} color="#a855f7" /></Overlay>}
        {ui.over && <Overlay><div style={{ color: '#f87171', fontWeight: 900, fontSize: '1.2rem' }}>💥 ESPETOU!</div><div style={{ color: '#fff' }}>Distância: {ui.score}</div>{ui.score > bestScore && <div style={{ color: '#fbbf24', fontSize: '0.85rem' }}>🎉 Novo recorde!</div>}<PlayBtn onClick={start} label="↺ De novo" color="#a855f7" /></Overlay>}
      </div>
      <div style={tip}>Salte no tempo certo — acelera com o tempo</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. DEFESA AÉREA (missile defense)
// ══════════════════════════════════════════════════════════════════════════════
export function GameMissile({ onEnd, bestScore }: GameProps) {
  const W = 500, H = 380
  type Miss = { x: number; y: number; tx: number; vy: number; vx: number }
  type Boom = { x: number; y: number; r: number; max: number }
  const cv = useRef<HTMLCanvasElement>(null)
  const S = useRef({ miss: [] as Miss[], booms: [] as Boom[], cities: [120, 210, 300, 390].map(x => ({ x, alive: true })), spawn: 0, score: 0, t: 0, over: false, started: false })
  const [ui, setUi] = useState({ score: 0, cities: 4, over: false, started: false })
  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!; const s = S.current
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0c1445'); bg.addColorStop(1, '#020617'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
    for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect((i * 67) % W, (i * 113) % (H - 80), 2, 2) }
    ctx.fillStyle = '#1e293b'; ctx.fillRect(0, H - 26, W, 26)
    s.cities.forEach(ci => { if (!ci.alive) return; ctx.fillStyle = '#38bdf8'; for (let b = 0; b < 3; b++) { const bh = 14 + b * 4; rr(ctx, ci.x - 18 + b * 13, H - 26 - bh, 10, bh, 2); ctx.fill() } })
    s.miss.forEach(m => { ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(m.x - m.vx * 0.06, m.y - m.vy * 0.06); ctx.lineTo(m.x, m.y); ctx.stroke(); ctx.fillStyle = '#fca5a5'; ctx.beginPath(); ctx.arc(m.x, m.y, 3, 0, Math.PI * 2); ctx.fill() })
    s.booms.forEach(b => { ctx.fillStyle = `rgba(251,191,36,${0.5 * (1 - b.r / b.max)})`; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2; ctx.stroke() })
    ctx.fillStyle = '#fff'; ctx.font = 'bold 17px monospace'; ctx.fillText(`Pontos: ${s.score}`, 12, 24); ctx.fillText('🏙'.repeat(s.cities.filter(c2 => c2.alive).length), W - 90, 24)
  }, [])
  const update = useCallback((dt: number) => {
    const s = S.current; if (s.over || !s.started) return
    s.t += dt
    s.spawn -= dt; if (s.spawn <= 0) { const alive = s.cities.filter(c2 => c2.alive); if (alive.length) { const tgt = alive[Math.floor(Math.random() * alive.length)].x; const sx = Math.random() * W; const ang = Math.atan2(H - 26, tgt - sx); const sp = 40 + s.t * 1.6; s.miss.push({ x: sx, y: 0, tx: tgt, vy: Math.sin(ang) * sp, vx: Math.cos(ang) * sp }) } s.spawn = Math.max(0.5, 1.7 - s.t * 0.02) }
    s.miss.forEach(m => { m.x += m.vx * dt; m.y += m.vy * dt })
    s.booms.forEach(b => b.r += dt * 90); s.booms = s.booms.filter(b => b.r < b.max)
    s.miss = s.miss.filter(m => {
      for (const b of s.booms) { if (Math.hypot(m.x - b.x, m.y - b.y) < b.r) { s.score += 25; setUi(u => ({ ...u, score: s.score })); return false } }
      if (m.y >= H - 26) { const ci = s.cities.find(c2 => c2.alive && Math.abs(c2.x - m.x) < 26); if (ci) ci.alive = false; s.booms.push({ x: m.x, y: H - 26, r: 4, max: 30 }); setUi(u => ({ ...u, cities: s.cities.filter(c2 => c2.alive).length })); return false }
      return true
    })
    if (!s.cities.some(c2 => c2.alive)) { s.over = true; setUi(u => ({ ...u, over: true, score: s.score })); onEnd(s.score >= 500 ? 'win' : 'play', s.score); return }
    draw()
  }, [draw])
  useAnimLoop(update, ui.started && !ui.over)
  const fire = (e: React.MouseEvent) => { const s = S.current; if (s.over || !s.started) return; const r = (e.target as HTMLCanvasElement).getBoundingClientRect(); s.booms.push({ x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height), r: 4, max: 44 }) }
  useEffect(() => { draw() }, [draw])
  const start = () => { S.current = { miss: [], booms: [], cities: [120, 210, 300, 390].map(x => ({ x, alive: true })), spawn: 0.8, score: 0, t: 0, over: false, started: true }; setUi({ score: 0, cities: 4, over: false, started: true }); draw() }
  return (
    <div style={wrap}>
      <div style={frame('#fbbf24')}>
        <canvas ref={cv} width={W} height={H} onMouseDown={fire} style={{ cursor: 'crosshair' }} />
        {!ui.started && <Overlay><div style={{ fontSize: '2.4rem' }}>🚀</div><div style={{ color: '#fff', fontWeight: 800 }}>DEFESA AÉREA</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.74rem' }}>Clique para explodir os mísseis antes que atinjam as cidades</div><PlayBtn onClick={start} color="#fbbf24" /></Overlay>}
        {ui.over && <Overlay><div style={{ color: '#f87171', fontWeight: 900, fontSize: '1.2rem' }}>🏙 CIDADES DESTRUÍDAS</div><div style={{ color: '#fff' }}>Pontos: {ui.score}</div>{ui.score > bestScore && <div style={{ color: '#fbbf24', fontSize: '0.85rem' }}>🎉 Novo recorde!</div>}<PlayBtn onClick={start} label="↺ Defender de novo" color="#fbbf24" /></Overlay>}
      </div>
      <div style={tip}>Cada explosão certeira destrói os mísseis próximos</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 10. CHUVA DE METEOROS (star dodge)
// ══════════════════════════════════════════════════════════════════════════════
export function GameMeteor({ onEnd, bestScore }: GameProps) {
  const W = 420, H = 460
  type Met = { x: number; y: number; r: number; vy: number; spin: number }
  const cv = useRef<HTMLCanvasElement>(null)
  const S = useRef({ sx: W / 2, mets: [] as Met[], stars: Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.5 + 0.5 })), spawn: 0, t: 0, score: 0, over: false, started: false })
  const [ui, setUi] = useState({ score: 0, over: false, started: false })
  const SHIP_Y = H - 46
  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!; const s = S.current
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0b1026'); bg.addColorStop(1, '#020617'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
    s.stars.forEach(st => { ctx.fillStyle = `rgba(255,255,255,${0.3 + st.s * 0.3})`; ctx.fillRect(st.x, st.y, st.s, st.s) })
    s.mets.forEach(m => { ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.spin); const g = ctx.createRadialGradient(0, 0, 2, 0, 0, m.r); g.addColorStop(0, '#fed7aa'); g.addColorStop(0.6, '#fb923c'); g.addColorStop(1, '#7c2d12'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, m.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(m.r * 0.3, -m.r * 0.2, m.r * 0.25, 0, Math.PI * 2); ctx.fill(); ctx.restore() })
    ctx.save(); ctx.translate(s.sx, SHIP_Y); ctx.fillStyle = '#22d3ee'; ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(13, 14); ctx.lineTo(0, 7); ctx.lineTo(-13, 14); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(-5, 12); ctx.lineTo(0, 22 + Math.random() * 6); ctx.lineTo(5, 12); ctx.closePath(); ctx.fill(); ctx.restore()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace'; ctx.fillText(`${s.score}`, 12, 26)
  }, [SHIP_Y])
  const update = useCallback((dt: number) => {
    const s = S.current; if (s.over || !s.started) return
    s.t += dt; s.score = Math.floor(s.t * 10)
    s.stars.forEach(st => { st.y += (20 + st.s * 20) * dt; if (st.y > H) { st.y = 0; st.x = Math.random() * W } })
    s.spawn -= dt; if (s.spawn <= 0) { const r = 12 + Math.random() * 16; s.mets.push({ x: r + Math.random() * (W - r * 2), y: -r, r, vy: 130 + Math.random() * 90 + s.t * 4, spin: 0 }); s.spawn = Math.max(0.22, 0.7 - s.t * 0.012) }
    s.mets.forEach(m => { m.y += m.vy * dt; m.spin += dt * 2 }); s.mets = s.mets.filter(m => m.y < H + 40)
    for (const m of s.mets) { if (Math.hypot(m.x - s.sx, m.y - SHIP_Y) < m.r + 11) { s.over = true; setUi({ score: s.score, over: true, started: true }); onEnd(s.score >= 300 ? 'win' : 'play', s.score); return } }
    setUi(u => (u.score === s.score ? u : { ...u, score: s.score })); draw()
  }, [draw, SHIP_Y])
  useAnimLoop(update, ui.started && !ui.over)
  const move = (e: React.MouseEvent) => { const s = S.current; const r = (e.target as HTMLCanvasElement).getBoundingClientRect(); s.sx = Math.max(13, Math.min(W - 13, (e.clientX - r.left) * (W / r.width))); if (!s.started && !s.over) draw() }
  useEffect(() => {
    draw()
    const kd = (e: KeyboardEvent) => { const s = S.current; if (!s.started || s.over) return; if (e.key === 'ArrowLeft') s.sx = Math.max(13, s.sx - 26); else if (e.key === 'ArrowRight') s.sx = Math.min(W - 13, s.sx + 26) }
    window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd)
  }, [draw])
  const start = () => { const st = S.current.stars; S.current = { sx: W / 2, mets: [], stars: st, spawn: 0.6, t: 0, score: 0, over: false, started: true }; setUi({ score: 0, over: false, started: true }); draw() }
  return (
    <div style={wrap}>
      <div style={frame('#fb923c')}>
        <canvas ref={cv} width={W} height={H} onMouseMove={move} style={{ cursor: 'none' }} />
        {!ui.started && <Overlay><div style={{ fontSize: '2.4rem' }}>☄️</div><div style={{ color: '#fff', fontWeight: 800 }}>CHUVA DE METEOROS</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.74rem' }}>Mova o mouse (ou ← →) e desvie dos meteoros</div><PlayBtn onClick={start} color="#fb923c" /></Overlay>}
        {ui.over && <Overlay><div style={{ color: '#f87171', fontWeight: 900, fontSize: '1.2rem' }}>💥 ATINGIDO!</div><div style={{ color: '#fff' }}>Sobrevivência: {ui.score}</div>{ui.score > bestScore && <div style={{ color: '#fbbf24', fontSize: '0.85rem' }}>🎉 Novo recorde!</div>}<PlayBtn onClick={start} label="↺ De novo" color="#fb923c" /></Overlay>}
      </div>
      <div style={tip}>Quanto mais tempo sobreviver, mais pontos</div>
    </div>
  )
}
