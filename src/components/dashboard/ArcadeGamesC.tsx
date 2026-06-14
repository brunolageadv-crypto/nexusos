import { useState, useEffect, useRef, useCallback } from 'react'
import type { GameProps } from './Arcade'

// ══════════════════════════════════════════════════════════════════════════════
// LOTE C — Arcade Canvas + Reflexo
// ══════════════════════════════════════════════════════════════════════════════

// ── Shared helpers ────────────────────────────────────────────────────────────
function useAnimLoop(cb: (dt: number) => void, running: boolean) {
  const ref = useRef<number>()
  const last = useRef(0)
  const cbRef = useRef(cb)
  cbRef.current = cb
  useEffect(() => {
    if (!running) { if (ref.current) cancelAnimationFrame(ref.current); return }
    const loop = (ts: number) => {
      const dt = Math.min((ts - (last.current || ts)) / 1000, 0.05)
      last.current = ts
      cbRef.current(dt)
      ref.current = requestAnimationFrame(loop)
    }
    ref.current = requestAnimationFrame(loop)
    return () => { if (ref.current) cancelAnimationFrame(ref.current) }
  }, [running])
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, zIndex: 10 }}>
      {children}
    </div>
  )
}
function ScoreBar({ items }: { items: { label: string; value: string | number; color: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 4 }}>
      {items.map(it => (
        <span key={it.label} style={{ padding: '4px 12px', borderRadius: 8, background: `rgba(${it.color},0.12)`, border: `1px solid rgba(${it.color},0.3)`, fontSize: '0.75rem', fontWeight: 700, color: `rgb(${it.color})` }}>
          {it.label}: {it.value}
        </span>
      ))}
    </div>
  )
}
function PlayBtn({ onClick, label = '▶ Jogar', color = '#60a5fa' }: { onClick: () => void; label?: string; color?: string }) {
  return (
    <button onClick={onClick} style={{ padding: '11px 30px', borderRadius: 13, border: 'none', background: `linear-gradient(135deg,${color},${color}99)`, color: '#fff', fontWeight: 900, fontSize: '1rem', cursor: 'pointer', boxShadow: `0 4px 20px ${color}50` }}>
      {label}
    </button>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. ASTEROIDS
// ══════════════════════════════════════════════════════════════════════════════
interface Asteroid { x: number; y: number; vx: number; vy: number; r: number; ang: number; dang: number; pts: [number, number][] }
interface Bullet   { x: number; y: number; vx: number; vy: number; life: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number }

function mkAsteroid(x: number, y: number, r: number): Asteroid {
  const n = 8 + Math.floor(Math.random() * 5)
  const pts: [number, number][] = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    const d = r * (0.7 + Math.random() * 0.3)
    return [Math.cos(a) * d, Math.sin(a) * d]
  })
  const spd = (60 + Math.random() * 60) / r
  const ang = Math.random() * Math.PI * 2
  return { x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r, ang: 0, dang: (Math.random() - 0.5) * 1.5, pts }
}

function spawnAsteroids(count: number, W: number, H: number): Asteroid[] {
  return Array.from({ length: count }, () => {
    const edge = Math.floor(Math.random() * 4)
    const x = edge === 0 ? 0 : edge === 1 ? W : Math.random() * W
    const y = edge === 2 ? 0 : edge === 3 ? H : Math.random() * H
    return mkAsteroid(x, y, 28 + Math.floor(Math.random() * 2) * 14)
  })
}

export function GameAsteroids({ onEnd, bestScore }: GameProps) {
  const W = 520, H = 420
  const cv = useRef<HTMLCanvasElement>(null)
  const S = useRef({
    ship: { x: W / 2, y: H / 2, ang: -Math.PI / 2, vx: 0, vy: 0, inv: 180 },
    asteroids: [] as Asteroid[],
    bullets: [] as Bullet[],
    particles: [] as Particle[],
    score: 0, lives: 3, wave: 1, over: false, started: false,
    keys: {} as Record<string, boolean>,
  })
  const [ui, setUi] = useState({ score: 0, lives: 3, wave: 1, over: false, started: false })

  function explode(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, spd = 40 + Math.random() * 120
      S.current.particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.6 + Math.random() * 0.6, maxLife: 1.2 })
    }
  }

  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!
    const s = S.current
    ctx.fillStyle = '#050510'; ctx.fillRect(0, 0, W, H)
    // Stars bg
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    for (let i = 0; i < 60; i++) { const sx = (i * 137 + 17) % W, sy = (i * 97 + 53) % H; ctx.fillRect(sx, sy, 1, 1) }

    // Particles
    s.particles.forEach(p => {
      const a = p.life / p.maxLife
      ctx.fillStyle = `rgba(255,${Math.floor(150 + a * 100)},50,${a})`
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3)
    })

    // Asteroids
    s.asteroids.forEach(a => {
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.ang)
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5; ctx.beginPath()
      a.pts.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py))
      ctx.closePath(); ctx.stroke(); ctx.restore()
    })

    // Bullets
    s.bullets.forEach(b => { ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2); ctx.fill() })

    // Ship
    if (!s.over && (s.ship.inv <= 0 || Math.floor(s.ship.inv / 8) % 2 === 0)) {
      ctx.save(); ctx.translate(s.ship.x, s.ship.y); ctx.rotate(s.ship.ang)
      ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2; ctx.beginPath()
      ctx.moveTo(18, 0); ctx.lineTo(-12, -10); ctx.lineTo(-7, 0); ctx.lineTo(-12, 10); ctx.closePath(); ctx.stroke()
      if (s.keys['ArrowUp'] || s.keys['w']) {
        ctx.strokeStyle = '#f97316'; ctx.lineWidth = 1.5; ctx.beginPath()
        ctx.moveTo(-7, -5); ctx.lineTo(-18, 0); ctx.lineTo(-7, 5); ctx.stroke()
      }
      ctx.restore()
    }

    // HUD
    ctx.fillStyle = 'rgba(96,165,250,0.9)'; ctx.font = 'bold 14px monospace'
    ctx.fillText(`${s.score}`, 12, 22)
    ctx.fillText(`❤ ${s.lives}`, W - 60, 22)
    ctx.fillText(`W${s.wave}`, W / 2 - 10, 22)
  }, [])

  const update = useCallback((dt: number) => {
    const s = S.current; if (s.over || !s.started) return
    const sh = s.ship

    // Ship controls
    if (s.keys['ArrowLeft'] || s.keys['a']) sh.ang -= 3 * dt
    if (s.keys['ArrowRight'] || s.keys['d']) sh.ang += 3 * dt
    if (s.keys['ArrowUp'] || s.keys['w']) { sh.vx += Math.cos(sh.ang) * 200 * dt; sh.vy += Math.sin(sh.ang) * 200 * dt }
    sh.vx *= 0.99; sh.vy *= 0.99
    const maxSpd = 250; const spd = Math.hypot(sh.vx, sh.vy); if (spd > maxSpd) { sh.vx = sh.vx / spd * maxSpd; sh.vy = sh.vy / spd * maxSpd }
    sh.x = ((sh.x + sh.vx * dt) + W) % W; sh.y = ((sh.y + sh.vy * dt) + H) % H
    if (sh.inv > 0) sh.inv--

    // Bullets
    s.bullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt })
    s.bullets = s.bullets.filter(b => b.life > 0 && b.x >= 0 && b.x <= W && b.y >= 0 && b.y <= H)

    // Asteroids move & wrap
    s.asteroids.forEach(a => {
      a.x = ((a.x + a.vx * dt) + W) % W; a.y = ((a.y + a.vy * dt) + H) % H; a.ang += a.dang * dt
    })

    // Particles
    s.particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt })
    s.particles = s.particles.filter(p => p.life > 0)

    // Bullet-asteroid collisions
    const toRemove = new Set<number>()
    s.bullets = s.bullets.filter(b => {
      let hit = false
      s.asteroids.forEach((a, ai) => {
        if (Math.hypot(b.x - a.x, b.y - a.y) < a.r) { toRemove.add(ai); hit = true }
      })
      return !hit
    })
    const newAsts: Asteroid[] = []
    s.asteroids.forEach((a, ai) => {
      if (toRemove.has(ai)) {
        explode(a.x, a.y, 8)
        s.score += a.r > 20 ? 20 : a.r > 13 ? 50 : 100
        if (a.r > 13) { newAsts.push(mkAsteroid(a.x, a.y, Math.floor(a.r * 0.55))); newAsts.push(mkAsteroid(a.x, a.y, Math.floor(a.r * 0.55))) }
      } else newAsts.push(a)
    })
    s.asteroids = newAsts

    // Ship-asteroid collision
    if (sh.inv <= 0) {
      const hit = s.asteroids.some(a => Math.hypot(sh.x - a.x, sh.y - a.y) < a.r - 4)
      if (hit) {
        explode(sh.x, sh.y, 20); s.lives--
        sh.x = W / 2; sh.y = H / 2; sh.vx = 0; sh.vy = 0; sh.inv = 180
        if (s.lives <= 0) { s.over = true; setUi(u => ({ ...u, over: true, score: s.score })); onEnd('loss', s.score); return }
      }
    }

    // Next wave
    if (s.asteroids.length === 0) {
      s.wave++; s.asteroids = spawnAsteroids(3 + s.wave, W, H); sh.inv = 120
    }

    setUi({ score: s.score, lives: s.lives, wave: s.wave, over: s.over, started: true })
    draw()
  }, [draw, onEnd])

  useAnimLoop(update, ui.started && !ui.over)

  useEffect(() => {
    S.current.asteroids = spawnAsteroids(4, W, H); draw()
    const kd = (e: KeyboardEvent) => {
      S.current.keys[e.key] = true
      if (!S.current.started && ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'w', 'a', 'd'].includes(e.key)) { S.current.started = true; setUi(u => ({ ...u, started: true })) }
      if ((e.key === ' ' || e.key === 'ArrowUp') && S.current.started) {
        if (e.key === ' ') {
          e.preventDefault()
          const sh = S.current.ship
          S.current.bullets.push({ x: sh.x + Math.cos(sh.ang) * 20, y: sh.y + Math.sin(sh.ang) * 20, vx: Math.cos(sh.ang) * 500, vy: Math.sin(sh.ang) * 500, life: 1.2 })
        }
      }
    }
    const ku = (e: KeyboardEvent) => { S.current.keys[e.key] = false }
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [draw])

  function restart() {
    S.current = { ship: { x: W / 2, y: H / 2, ang: -Math.PI / 2, vx: 0, vy: 0, inv: 180 }, asteroids: spawnAsteroids(4, W, H), bullets: [], particles: [], score: 0, lives: 3, wave: 1, over: false, started: false, keys: {} }
    setUi({ score: 0, lives: 3, wave: 1, over: false, started: false }); draw()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <ScoreBar items={[{ label: 'Score', value: ui.score, color: '96,165,250' }, { label: '❤', value: ui.lives, color: '248,113,113' }, { label: 'Wave', value: ui.wave, color: '251,191,36' }, { label: 'Recorde', value: Math.max(ui.score, bestScore), color: '167,139,250' }]} />
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '2px solid rgba(96,165,250,0.3)' }}>
        <canvas ref={cv} width={W} height={H} />
        {!ui.started && !ui.over && <Overlay><div style={{ fontSize: '2.5rem' }}>☄️</div><div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>ASTEROIDS</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', textAlign: 'center' }}>Setas para mover · Espaço para atirar</div><PlayBtn onClick={() => { S.current.started = true; setUi(u => ({ ...u, started: true })) }} color="#60a5fa" /></Overlay>}
        {ui.over && <Overlay><div style={{ color: '#f87171', fontWeight: 900, fontSize: '1.3rem' }}>💥 GAME OVER</div><div style={{ color: '#fff' }}>Score: {ui.score}</div><PlayBtn onClick={restart} label="↺ Jogar Novamente" color="#f87171" /></Overlay>}
      </div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>WASD/Setas para mover · Espaço para atirar</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. SPACE SHOOTER
// ══════════════════════════════════════════════════════════════════════════════
interface Enemy { x: number; y: number; vy: number; hp: number; type: number; w: number; h: number; shootTimer: number }
interface SBullet { x: number; y: number; vy: number; fromEnemy: boolean }
interface Explosion { x: number; y: number; r: number; life: number }

export function GameSpaceShooter({ onEnd, bestScore }: GameProps) {
  const W = 420, H = 520
  const cv = useRef<HTMLCanvasElement>(null)
  const S = useRef({
    ship: { x: W / 2, y: H - 60, w: 32, h: 28 },
    enemies: [] as Enemy[],
    bullets: [] as SBullet[],
    explosions: [] as Explosion[],
    score: 0, lives: 3, wave: 1, over: false, won: false, started: false,
    mouseX: W / 2, shootCooldown: 0, spawnTimer: 0, waveKills: 0, waveGoal: 10,
  })
  const [ui, setUi] = useState({ score: 0, lives: 3, over: false, won: false, started: false })

  function spawnEnemy() {
    const type = Math.floor(Math.random() * 3)
    S.current.enemies.push({ x: 30 + Math.random() * (W - 60), y: -30, vy: 60 + type * 20 + S.current.wave * 8, hp: type + 1, type, w: 28 + type * 6, h: 20 + type * 4, shootTimer: 1 + Math.random() * 2 })
  }

  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!
    const s = S.current
    // BG gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#020215'); bg.addColorStop(1, '#050530')
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
    // Stars
    for (let i = 0; i < 80; i++) { const sx = (i * 173 + 7) % W, sy = (i * 113 + 31) % H; ctx.fillStyle = `rgba(255,255,255,${0.2 + (i % 3) * 0.2})`; ctx.fillRect(sx, sy, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1) }

    // Explosions
    s.explosions.forEach(e => { const a = e.life; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1 - a), 0, Math.PI * 2); ctx.fillStyle = `rgba(255,${Math.floor(150 + a * 100)},0,${a})`; ctx.fill() })

    // Enemy bullets
    s.bullets.filter(b => b.fromEnemy).forEach(b => { ctx.fillStyle = '#f87171'; ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill() })

    // Enemies
    s.enemies.forEach(e => {
      const colors = ['#a78bfa', '#f472b6', '#fb923c']
      ctx.save(); ctx.translate(e.x, e.y)
      ctx.fillStyle = colors[e.type]
      if (e.type === 0) { ctx.beginPath(); ctx.moveTo(0, -e.h / 2); ctx.lineTo(-e.w / 2, e.h / 2); ctx.lineTo(e.w / 2, e.h / 2); ctx.closePath(); ctx.fill() }
      else if (e.type === 1) { ctx.beginPath(); ctx.ellipse(0, 0, e.w / 2, e.h / 2, 0, 0, Math.PI * 2); ctx.fill() }
      else { ctx.fillRect(-e.w / 2, -e.h / 2, e.w, e.h) }
      // HP bar
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-e.w / 2, e.h / 2 + 2, e.w, 4)
      ctx.fillStyle = '#34d399'; ctx.fillRect(-e.w / 2, e.h / 2 + 2, e.w * (e.hp / (e.type + 1)), 4)
      ctx.restore()
    })

    // Player bullets
    s.bullets.filter(b => !b.fromEnemy).forEach(b => { ctx.fillStyle = '#60a5fa'; ctx.shadowColor = '#60a5fa'; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0 })

    // Ship
    const sh = s.ship; ctx.save(); ctx.translate(sh.x, sh.y)
    ctx.fillStyle = '#60a5fa'; ctx.beginPath(); ctx.moveTo(0, -sh.h / 2); ctx.lineTo(-sh.w / 2, sh.h / 2); ctx.lineTo(-4, sh.h / 4); ctx.lineTo(4, sh.h / 4); ctx.lineTo(sh.w / 2, sh.h / 2); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(0, 4, 6, 0, Math.PI * 2); ctx.fill()
    // Engine flame
    ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(-8, sh.h / 2); ctx.lineTo(0, sh.h / 2 + 14 + Math.random() * 8); ctx.lineTo(8, sh.h / 2); ctx.closePath(); ctx.fill()
    ctx.restore()

    // HUD
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 13px monospace'
    ctx.fillText(`${s.score}`, 10, 20)
    ctx.fillText(`❤ ${s.lives}`, W - 55, 20)
    ctx.fillStyle = '#a78bfa'; ctx.fillText(`W${s.wave} ${s.waveKills}/${s.waveGoal}`, W / 2 - 28, 20)
  }, [])

  const update = useCallback((dt: number) => {
    const s = S.current; if (s.over || s.won || !s.started) return

    // Move ship toward mouse
    s.ship.x += (s.mouseX - s.ship.x) * 8 * dt
    s.ship.x = Math.max(20, Math.min(W - 20, s.ship.x))

    // Auto-shoot
    s.shootCooldown -= dt
    if (s.shootCooldown <= 0) {
      s.bullets.push({ x: s.ship.x, y: s.ship.y - 20, vy: -480, fromEnemy: false })
      s.shootCooldown = 0.2
    }

    // Spawn enemies
    s.spawnTimer -= dt
    if (s.spawnTimer <= 0 && s.enemies.length < 8) { spawnEnemy(); s.spawnTimer = 0.8 - s.wave * 0.06 }

    // Move bullets
    s.bullets.forEach(b => b.y += b.vy * dt)
    s.bullets = s.bullets.filter(b => b.y > -10 && b.y < H + 10)

    // Move & shoot enemies
    s.enemies.forEach(e => {
      e.y += e.vy * dt
      e.shootTimer -= dt
      if (e.shootTimer <= 0 && e.type > 0) {
        s.bullets.push({ x: e.x, y: e.y + e.h / 2, vy: 200 + s.wave * 15, fromEnemy: true })
        e.shootTimer = 1.5 + Math.random() * 1.5
      }
    })
    s.enemies = s.enemies.filter(e => e.y < H + 40)

    // Explosions decay
    s.explosions.forEach(e => e.life -= dt * 2)
    s.explosions = s.explosions.filter(e => e.life > 0)

    // Bullet-enemy collisions
    s.bullets = s.bullets.filter(b => {
      if (b.fromEnemy) return true
      let hit = false
      s.enemies.forEach((e, ei) => { if (Math.abs(b.x - e.x) < e.w / 2 && Math.abs(b.y - e.y) < e.h / 2) { e.hp--; hit = true; if (e.hp <= 0) { s.explosions.push({ x: e.x, y: e.y, r: 30 + e.type * 10, life: 1 }); s.score += (e.type + 1) * 10; s.waveKills++; s.enemies.splice(ei, 1) } } })
      return !hit
    })

    // Enemy bullets hit ship
    s.bullets = s.bullets.filter(b => {
      if (!b.fromEnemy) return true
      const sh = s.ship
      if (Math.abs(b.x - sh.x) < sh.w / 2 && Math.abs(b.y - sh.y) < sh.h / 2) { s.lives--; s.explosions.push({ x: sh.x, y: sh.y, r: 20, life: 1 }); if (s.lives <= 0) { s.over = true; setUi(u => ({ ...u, over: true })); onEnd('loss', s.score) }; return false }
      return true
    })

    // Enemy reaches bottom
    s.enemies.forEach(e => { if (e.y > H) { s.lives--; if (s.lives <= 0) { s.over = true; setUi(u => ({ ...u, over: true })); onEnd('loss', s.score) } } })
    s.enemies = s.enemies.filter(e => e.y <= H)

    // Wave complete
    if (s.waveKills >= s.waveGoal) { s.wave++; s.waveKills = 0; s.waveGoal = 10 + s.wave * 3; if (s.wave > 5) { s.won = true; setUi(u => ({ ...u, won: true })); onEnd('win', s.score); return } }

    setUi({ score: s.score, lives: s.lives, over: s.over, won: s.won, started: true })
    draw()
  }, [draw, onEnd])

  useAnimLoop(update, ui.started && !ui.over && !ui.won)

  useEffect(() => {
    draw()
    const mm = (e: MouseEvent) => { const r = cv.current?.getBoundingClientRect(); if (r) { S.current.mouseX = e.clientX - r.left; if (!S.current.started) { S.current.started = true; setUi(u => ({ ...u, started: true })) } } }
    const tm = (e: TouchEvent) => { e.preventDefault(); const r = cv.current?.getBoundingClientRect(); if (r && e.touches[0]) { S.current.mouseX = e.touches[0].clientX - r.left; if (!S.current.started) { S.current.started = true; setUi(u => ({ ...u, started: true })) } } }
    cv.current?.addEventListener('mousemove', mm)
    cv.current?.addEventListener('touchmove', tm, { passive: false })
    return () => { cv.current?.removeEventListener('mousemove', mm); cv.current?.removeEventListener('touchmove', tm) }
  }, [draw])

  function restart() {
    S.current = { ship: { x: W / 2, y: H - 60, w: 32, h: 28 }, enemies: [], bullets: [], explosions: [], score: 0, lives: 3, wave: 1, over: false, won: false, started: false, mouseX: W / 2, shootCooldown: 0, spawnTimer: 0, waveKills: 0, waveGoal: 10 }
    setUi({ score: 0, lives: 3, over: false, won: false, started: false }); draw()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <ScoreBar items={[{ label: 'Score', value: ui.score, color: '96,165,250' }, { label: '❤', value: ui.lives, color: '248,113,113' }, { label: 'Recorde', value: Math.max(ui.score, bestScore), color: '167,139,250' }]} />
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '2px solid rgba(167,139,250,0.3)' }}>
        <canvas ref={cv} width={W} height={H} />
        {!ui.started && <Overlay><div style={{ fontSize: '2.5rem' }}>🚀</div><div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>SPACE SHOOTER</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem' }}>Mova o mouse para mover a nave · Tiro automático</div><PlayBtn onClick={() => { S.current.started = true; setUi(u => ({ ...u, started: true })) }} color="#a78bfa" /></Overlay>}
        {ui.won && <Overlay><div style={{ color: '#34d399', fontWeight: 900, fontSize: '1.3rem' }}>🎉 VITÓRIA!</div><div style={{ color: '#fff' }}>Score: {ui.score}</div><PlayBtn onClick={restart} label="↺ Jogar Novamente" color="#34d399" /></Overlay>}
        {ui.over && <Overlay><div style={{ color: '#f87171', fontWeight: 900, fontSize: '1.3rem' }}>💀 GAME OVER</div><div style={{ color: '#fff' }}>Score: {ui.score}</div><PlayBtn onClick={restart} label="↺ Jogar Novamente" color="#f87171" /></Overlay>}
      </div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Mova o mouse para dirigir · Tiro automático · 5 waves para vencer</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. FLAPPY BIRD
// ══════════════════════════════════════════════════════════════════════════════
interface Pipe { x: number; gap: number; h: number; passed: boolean }

export function GameFlappy({ onEnd, bestScore }: GameProps) {
  const W = 380, H = 500
  const cv = useRef<HTMLCanvasElement>(null)
  const S = useRef({
    bird: { y: H / 2, vy: 0, ang: 0 },
    pipes: [] as Pipe[],
    score: 0, over: false, started: false, pipeTimer: 0, frame: 0,
  })
  const [ui, setUi] = useState({ score: 0, over: false, started: false })

  const BIRD_X = 80, BIRD_R = 16, GRAVITY = 1200, JUMP = -360, PIPE_SPD = 160, GAP = 145, PIPE_W = 52

  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!
    const s = S.current
    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#1e3a5f'); sky.addColorStop(1, '#0f1f3d')
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)

    // Ground
    ctx.fillStyle = '#14532d'; ctx.fillRect(0, H - 28, W, 28)
    ctx.fillStyle = '#16a34a'; ctx.fillRect(0, H - 28, W, 6)

    // Clouds (parallax)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    for (let i = 0; i < 4; i++) { const cx = ((i * 120 - s.frame * 0.3) % (W + 100) + W + 100) % (W + 100) - 50; ctx.beginPath(); ctx.ellipse(cx, 80 + i * 30, 50, 20, 0, 0, Math.PI * 2); ctx.fill() }

    // Pipes
    s.pipes.forEach(p => {
      const topH = p.h, botY = p.h + GAP
      // Top pipe
      const tg = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0)
      tg.addColorStop(0, '#15803d'); tg.addColorStop(0.5, '#22c55e'); tg.addColorStop(1, '#15803d')
      ctx.fillStyle = tg; ctx.fillRect(p.x, 0, PIPE_W, topH)
      ctx.fillStyle = '#16a34a'; ctx.fillRect(p.x - 4, topH - 18, PIPE_W + 8, 18)
      // Bottom pipe
      ctx.fillStyle = tg; ctx.fillRect(p.x, botY, PIPE_W, H - botY - 28)
      ctx.fillStyle = '#16a34a'; ctx.fillRect(p.x - 4, botY, PIPE_W + 8, 18)
    })

    // Bird
    const b = s.bird; const ang = Math.max(-0.5, Math.min(1.2, b.vy / 400))
    ctx.save(); ctx.translate(BIRD_X, b.y); ctx.rotate(ang)
    // Body
    ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.ellipse(0, 0, BIRD_R, BIRD_R - 2, 0, 0, Math.PI * 2); ctx.fill()
    // Wing flap
    const wingY = Math.sin(s.frame * 0.3) * 4
    ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.ellipse(-4, wingY, 10, 6, -0.4, 0, Math.PI * 2); ctx.fill()
    // Eye
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(8, -4, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(9, -4, 3, 0, Math.PI * 2); ctx.fill()
    // Beak
    ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(14, -1); ctx.lineTo(20, 2); ctx.lineTo(14, 5); ctx.closePath(); ctx.fill()
    ctx.restore()

    // Score
    ctx.fillStyle = '#fff'; ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center'; ctx.fillText(`${s.score}`, W / 2, 50); ctx.textAlign = 'start'
    if (bestScore > 0 && s.score === 0) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '13px monospace'; ctx.textAlign = 'center'; ctx.fillText(`Recorde: ${bestScore}`, W / 2, 75); ctx.textAlign = 'start' }
  }, [bestScore])

  const update = useCallback((dt: number) => {
    const s = S.current; if (s.over || !s.started) return
    s.frame++
    // Bird physics
    s.bird.vy += GRAVITY * dt; s.bird.y += s.bird.vy * dt
    // Ground collision
    if (s.bird.y + BIRD_R > H - 28 || s.bird.y - BIRD_R < 0) { s.over = true; setUi(u => ({ ...u, over: true })); onEnd(s.score > 0 ? 'play' : 'loss', s.score * 10); return }
    // Pipes
    s.pipeTimer -= dt
    if (s.pipeTimer <= 0) { s.pipes.push({ x: W + 10, gap: 0, h: 80 + Math.random() * (H - 28 - GAP - 80 - 80), passed: false }); s.pipeTimer = 1.8 }
    s.pipes.forEach(p => { p.x -= PIPE_SPD * dt })
    s.pipes = s.pipes.filter(p => p.x > -PIPE_W - 10)
    // Score & collision
    s.pipes.forEach(p => {
      if (!p.passed && p.x + PIPE_W < BIRD_X) { p.passed = true; s.score++ }
      const inX = BIRD_X + BIRD_R > p.x + 4 && BIRD_X - BIRD_R < p.x + PIPE_W - 4
      const inY = s.bird.y - BIRD_R < p.h || s.bird.y + BIRD_R > p.h + GAP
      if (inX && inY) { s.over = true; setUi(u => ({ ...u, over: true, score: s.score })); onEnd(s.score >= 5 ? 'win' : 'play', s.score * 10) }
    })
    setUi(u => ({ ...u, score: s.score }))
    draw()
  }, [draw, onEnd])

  useAnimLoop(update, ui.started && !ui.over)

  const jump = useCallback(() => {
    if (S.current.over) return
    if (!S.current.started) { S.current.started = true; setUi(u => ({ ...u, started: true })) }
    S.current.bird.vy = JUMP
  }, [])

  useEffect(() => {
    draw()
    const kd = (e: KeyboardEvent) => { if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); jump() } }
    window.addEventListener('keydown', kd)
    return () => window.removeEventListener('keydown', kd)
  }, [draw, jump])

  function restart() {
    S.current = { bird: { y: H / 2, vy: 0, ang: 0 }, pipes: [], score: 0, over: false, started: false, pipeTimer: 1.5, frame: 0 }
    setUi({ score: 0, over: false, started: false }); draw()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '2px solid rgba(251,191,36,0.3)', cursor: 'pointer' }} onClick={jump}>
        <canvas ref={cv} width={W} height={H} />
        {!ui.started && <Overlay><div style={{ fontSize: '2.5rem' }}>🐦</div><div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>FLAPPY BIRD</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem' }}>Clique ou Espaço para pular</div><PlayBtn onClick={jump} color="#fbbf24" /></Overlay>}
        {ui.over && <Overlay><div style={{ color: '#f87171', fontWeight: 900, fontSize: '1.3rem' }}>💀 GAME OVER</div><div style={{ color: '#fff', fontSize: '1.1rem' }}>Score: {ui.score}</div>{ui.score > bestScore && <div style={{ color: '#fbbf24', fontSize: '0.85rem' }}>🎉 Novo Recorde!</div>}<PlayBtn onClick={restart} label="↺ Jogar Novamente" color="#fbbf24" /></Overlay>}
      </div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Clique na tela ou pressione Espaço para voar</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. HELICOPTER GAME
// ══════════════════════════════════════════════════════════════════════════════
interface Block { x: number; topH: number; botH: number }

export function GameHelicopter({ onEnd, bestScore }: GameProps) {
  const W = 520, H = 360
  const cv = useRef<HTMLCanvasElement>(null)
  const S = useRef({
    heli: { y: H / 2, vy: 0 }, blocks: [] as Block[], score: 0,
    over: false, started: false, holding: false, blockTimer: 0, frame: 0, speed: 180,
  })
  const [ui, setUi] = useState({ score: 0, over: false, started: false })

  const HELI_X = 100, HELI_W = 52, HELI_H = 22, GRAVITY = 520, LIFT = -680, GAP = 180

  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!
    const s = S.current
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, H)
    // Grid lines
    ctx.strokeStyle = 'rgba(30,58,138,0.4)'; ctx.lineWidth = 1
    for (let x = (s.frame * s.speed / 30) % 60; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
    for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

    // Blocks
    s.blocks.forEach(b => {
      const tg = ctx.createLinearGradient(0, 0, 0, b.topH)
      tg.addColorStop(0, '#1e3a8a'); tg.addColorStop(1, '#3b82f6')
      ctx.fillStyle = tg; ctx.fillRect(b.x, 0, 50, b.topH)
      const bg = ctx.createLinearGradient(0, H - b.botH, 0, H)
      bg.addColorStop(0, '#3b82f6'); bg.addColorStop(1, '#1e3a8a')
      ctx.fillStyle = bg; ctx.fillRect(b.x, H - b.botH, 50, b.botH)
      // Edge highlight
      ctx.fillStyle = 'rgba(147,197,253,0.3)'; ctx.fillRect(b.x + 46, 0, 4, b.topH); ctx.fillRect(b.x + 46, H - b.botH, 4, b.botH)
    })

    // Helicopter
    const hy = s.heli.y; const rotor = Math.sin(s.frame * 0.5) * 2
    ctx.save(); ctx.translate(HELI_X, hy)
    // Body
    ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.ellipse(0, 0, HELI_W / 2, HELI_H / 2, 0, 0, Math.PI * 2); ctx.fill()
    // Cockpit
    ctx.fillStyle = '#86efac'; ctx.beginPath(); ctx.ellipse(12, -2, 14, 10, -0.2, 0, Math.PI * 2); ctx.fill()
    // Tail
    ctx.fillStyle = '#16a34a'; ctx.fillRect(-HELI_W / 2 - 20, -4, 22, 8); ctx.fillRect(-HELI_W / 2 - 20, -10, 5, 6)
    // Main rotor
    ctx.fillStyle = '#4ade80'; ctx.fillRect(-28, -HELI_H / 2 - 5 + rotor, 56, 4)
    // Landing skids
    ctx.strokeStyle = '#15803d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-16, HELI_H / 2); ctx.lineTo(-16, HELI_H / 2 + 8); ctx.lineTo(20, HELI_H / 2 + 8); ctx.lineTo(20, HELI_H / 2); ctx.stroke()
    ctx.restore()

    // Score
    ctx.fillStyle = '#34d399'; ctx.font = 'bold 16px monospace'; ctx.fillText(`${s.score}m`, 12, 24)
    if (bestScore > 0) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '12px monospace'; ctx.fillText(`Rec: ${bestScore}m`, W - 80, 24) }
    // Lift indicator
    if (s.holding) { ctx.fillStyle = 'rgba(74,222,128,0.4)'; ctx.beginPath(); ctx.arc(HELI_X, hy - 28, 8, 0, Math.PI * 2); ctx.fill() }
  }, [bestScore])

  const update = useCallback((dt: number) => {
    const s = S.current; if (s.over || !s.started) return
    s.frame++; s.speed = Math.min(320, 180 + s.score * 0.8)

    // Physics
    const accel = s.holding ? LIFT : GRAVITY
    s.heli.vy += accel * dt; s.heli.vy = Math.max(-280, Math.min(280, s.heli.vy))
    s.heli.y += s.heli.vy * dt

    // Wall collision
    if (s.heli.y < HELI_H / 2 || s.heli.y > H - HELI_H / 2) { s.over = true; setUi(u => ({ ...u, over: true })); onEnd(s.score > 50 ? 'win' : 'play', s.score); return }

    // Blocks
    s.blockTimer -= dt
    if (s.blockTimer <= 0 && (s.blocks.length === 0 || s.blocks[s.blocks.length - 1].x < W - 140)) {
      const topH = 40 + Math.random() * (H - GAP - 80)
      s.blocks.push({ x: W + 10, topH, botH: H - topH - GAP }); s.blockTimer = 0.15
    }
    s.blocks.forEach(b => b.x -= s.speed * dt)
    s.blocks = s.blocks.filter(b => b.x > -60)
    s.score = Math.floor(s.frame / 6)

    // Block collision
    const hit = s.blocks.some(b => {
      const inX = HELI_X + HELI_W / 2 > b.x + 2 && HELI_X - HELI_W / 2 < b.x + 48
      const inY = s.heli.y - HELI_H / 2 < b.topH || s.heli.y + HELI_H / 2 > H - b.botH
      return inX && inY
    })
    if (hit) { s.over = true; setUi(u => ({ ...u, over: true, score: s.score })); onEnd(s.score > 50 ? 'play' : 'loss', s.score); return }

    setUi(u => ({ ...u, score: s.score }))
    draw()
  }, [draw, onEnd])

  useAnimLoop(update, ui.started && !ui.over)

  const press = useCallback(() => {
    if (!S.current.started) { S.current.started = true; setUi(u => ({ ...u, started: true })) }
    S.current.holding = true
  }, [])
  const release = useCallback(() => { S.current.holding = false }, [])

  useEffect(() => {
    draw()
    const kd = (e: KeyboardEvent) => { if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); press() } }
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space' || e.key === 'ArrowUp') release() }
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [draw, press, release])

  function restart() {
    S.current = { heli: { y: H / 2, vy: 0 }, blocks: [], score: 0, over: false, started: false, holding: false, blockTimer: 0, frame: 0, speed: 180 }
    setUi({ score: 0, over: false, started: false }); draw()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <ScoreBar items={[{ label: '📏 Distância', value: ui.score + 'm', color: '52,211,153' }, { label: 'Recorde', value: Math.max(ui.score, bestScore) + 'm', color: '251,191,36' }]} />
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '2px solid rgba(52,211,153,0.3)', cursor: 'pointer', userSelect: 'none' }}
        onMouseDown={press} onMouseUp={release} onMouseLeave={release}
        onTouchStart={e => { e.preventDefault(); press() }} onTouchEnd={release}>
        <canvas ref={cv} width={W} height={H} />
        {!ui.started && <Overlay><div style={{ fontSize: '2.5rem' }}>🚁</div><div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>HELICOPTER GAME</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem' }}>Segure para subir · Solte para descer</div><PlayBtn onClick={press} color="#22c55e" /></Overlay>}
        {ui.over && <Overlay><div style={{ color: '#f87171', fontWeight: 900, fontSize: '1.3rem' }}>💥 CRASH!</div><div style={{ color: '#fff' }}>Distância: {ui.score}m</div>{ui.score > bestScore && <div style={{ color: '#fbbf24' }}>🏆 Novo Recorde!</div>}<PlayBtn onClick={restart} label="↺ Jogar Novamente" color="#22c55e" /></Overlay>}
      </div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Segure Espaço/Clique para subir · Solte para descer</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. CLIQUE RÁPIDO (Target Click)
// ══════════════════════════════════════════════════════════════════════════════
interface Target { x: number; y: number; r: number; life: number; maxLife: number; points: number }

export function GameQuickClick({ onEnd, bestScore }: GameProps) {
  const W = 480, H = 380
  const cv = useRef<HTMLCanvasElement>(null)
  const S = useRef({
    targets: [] as Target[], score: 0, missed: 0, timeLeft: 30,
    over: false, started: false, spawnTimer: 0, frame: 0, combo: 0, maxCombo: 0,
  })
  const [ui, setUi] = useState({ score: 0, missed: 0, timeLeft: 30, over: false, started: false, combo: 0 })

  const MAX_MISSED = 8

  function spawnTarget() {
    const r = 18 + Math.random() * 20
    S.current.targets.push({ x: r + Math.random() * (W - r * 2), y: r + Math.random() * (H - r * 2), r, life: 0.8 + Math.random() * 1.2, maxLife: 0.8 + Math.random() * 1.2, points: Math.round((40 - r) * 2) })
  }

  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!
    const s = S.current
    ctx.fillStyle = '#0f1117'; ctx.fillRect(0, 0, W, H)
    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

    s.targets.forEach(t => {
      const pct = t.life / t.maxLife
      const hue = pct > 0.5 ? 142 : pct > 0.25 ? 45 : 0
      // Outer ring countdown
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 4, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2)
      ctx.strokeStyle = `hsl(${hue},85%,60%)`; ctx.lineWidth = 3; ctx.stroke()
      // Target rings
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${hue},70%,25%,0.9)`; ctx.fill()
      ctx.strokeStyle = `hsl(${hue},80%,55%)`; ctx.lineWidth = 2; ctx.stroke()
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 0.55, 0, Math.PI * 2)
      ctx.strokeStyle = `hsl(${hue},80%,65%)`; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.beginPath(); ctx.arc(t.x, t.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = `hsl(${hue},90%,70%)`; ctx.fill()
      // Points label
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'
      ctx.fillText(`+${t.points}`, t.x, t.y + t.r + 14); ctx.textAlign = 'start'
    })

    // HUD
    const timerPct = s.timeLeft / 30
    ctx.fillStyle = '#0f1117'; ctx.fillRect(0, 0, W, 36)
    ctx.fillStyle = timerPct > 0.5 ? '#34d399' : timerPct > 0.25 ? '#fbbf24' : '#f87171'
    ctx.fillRect(0, 32, W * timerPct, 4)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace'
    ctx.fillText(`${s.score}pts`, 10, 22)
    ctx.fillText(`⏱ ${Math.ceil(s.timeLeft)}s`, W / 2 - 22, 22)
    ctx.fillStyle = '#f87171'; ctx.fillText(`✗ ${s.missed}/${MAX_MISSED}`, W - 72, 22)
    if (s.combo > 1) { ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 13px monospace'; ctx.fillText(`x${s.combo} COMBO!`, W - 90, H - 10) }
  }, [])

  const update = useCallback((dt: number) => {
    const s = S.current; if (s.over || !s.started) return
    s.frame++; s.timeLeft -= dt
    s.spawnTimer -= dt
    if (s.spawnTimer <= 0 && s.targets.length < 6) { spawnTarget(); s.spawnTimer = 0.35 }

    // Decay targets
    const expired: Target[] = []
    s.targets = s.targets.filter(t => { t.life -= dt; if (t.life <= 0) { expired.push(t); return false } return true })
    if (expired.length) { s.missed += expired.length; s.combo = 0; if (s.missed >= MAX_MISSED || s.timeLeft <= 0) { s.over = true; setUi(u => ({ ...u, over: true, score: s.score })); onEnd(s.score >= 200 ? 'win' : 'play', s.score); return } }
    if (s.timeLeft <= 0) { s.over = true; setUi(u => ({ ...u, over: true, score: s.score })); onEnd(s.score >= 200 ? 'win' : 'play', s.score); return }

    setUi({ score: s.score, missed: s.missed, timeLeft: s.timeLeft, over: false, started: true, combo: s.combo })
    draw()
  }, [draw, onEnd])

  useAnimLoop(update, ui.started && !ui.over)

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const s = S.current; if (s.over) return
    if (!s.started) { s.started = true; setUi(u => ({ ...u, started: true })); return }
    const rect = cv.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    let hit = false
    s.targets = s.targets.filter(t => {
      if (Math.hypot(mx - t.x, my - t.y) < t.r) { s.combo++; s.maxCombo = Math.max(s.maxCombo, s.combo); s.score += t.points * (s.combo > 2 ? 2 : 1); hit = true; return false }
      return true
    })
    if (!hit) { s.combo = 0; s.missed++; if (s.missed >= MAX_MISSED) { s.over = true; setUi(u => ({ ...u, over: true, score: s.score })); onEnd('play', s.score) } }
  }, [onEnd])

  useEffect(() => { draw() }, [draw])

  function restart() {
    S.current = { targets: [], score: 0, missed: 0, timeLeft: 30, over: false, started: false, spawnTimer: 0, frame: 0, combo: 0, maxCombo: 0 }
    setUi({ score: 0, missed: 0, timeLeft: 30, over: false, started: false, combo: 0 }); draw()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <ScoreBar items={[{ label: 'Score', value: ui.score, color: '96,165,250' }, { label: 'Erros', value: `${ui.missed}/${MAX_MISSED}`, color: '248,113,113' }, { label: 'Recorde', value: Math.max(ui.score, bestScore), color: '167,139,250' }]} />
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '2px solid rgba(96,165,250,0.3)', cursor: 'crosshair' }}>
        <canvas ref={cv} width={W} height={H} onClick={handleClick} />
        {!ui.started && <Overlay><div style={{ fontSize: '2.5rem' }}>🖱️</div><div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>CLIQUE RÁPIDO</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', textAlign: 'center' }}>Clique nos alvos antes que desapareçam<br />Combo multiplica pontos!</div><PlayBtn onClick={() => { S.current.started = true; setUi(u => ({ ...u, started: true })) }} color="#60a5fa" /></Overlay>}
        {ui.over && <Overlay><div style={{ color: '#fbbf24', fontWeight: 900, fontSize: '1.3rem' }}>⏱ TEMPO ESGOTADO</div><div style={{ color: '#fff', fontSize: '1rem' }}>Score: {ui.score}</div>{ui.score > bestScore && <div style={{ color: '#fbbf24' }}>🏆 Novo Recorde!</div>}<PlayBtn onClick={restart} label="↺ Jogar Novamente" color="#60a5fa" /></Overlay>}
      </div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>30 segundos · Combo x2 com 3+ seguidos · Evite errar 8 alvos</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. MIRA ALVO (Moving Targets)
// ══════════════════════════════════════════════════════════════════════════════
interface MovingTarget { x: number; y: number; vx: number; vy: number; r: number; points: number; color: string; life: number }
interface Shot { x: number; y: number; hit: boolean; points: number; life: number }

export function GameAim({ onEnd, bestScore }: GameProps) {
  const W = 520, H = 400
  const cv = useRef<HTMLCanvasElement>(null)
  const S = useRef({
    targets: [] as MovingTarget[], shots: [] as Shot[],
    score: 0, hits: 0, total: 0, timeLeft: 45, over: false, started: false,
    spawnTimer: 0, frame: 0, accuracy: 100,
  })
  const [ui, setUi] = useState({ score: 0, hits: 0, total: 0, timeLeft: 45, over: false, started: false, accuracy: 0 })
  const [cursor, setCursor] = useState({ x: 0, y: 0 })

  const COLORS = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6']

  function spawnTarget() {
    const r = 14 + Math.random() * 18
    const spd = 60 + Math.random() * 100
    const ang = Math.random() * Math.PI * 2
    S.current.targets.push({
      x: r + Math.random() * (W - r * 2), y: r + Math.random() * (H - r * 2),
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r,
      points: Math.round((32 - r) * 3), color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 2 + Math.random() * 3,
    })
  }

  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!
    ctx.fillStyle = '#0a0a14'; ctx.fillRect(0, 0, W, H)
    // Range grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1
    for (let x = 0; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
    for (let y = 0; y < H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

    // Targets
    S.current.targets.forEach(t => {
      const a = Math.min(1, t.life * 1.5)
      // Shadow
      ctx.beginPath(); ctx.arc(t.x + 2, t.y + 2, t.r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill()
      // Outer ring
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fillStyle = `${t.color}22`; ctx.fill()
      ctx.strokeStyle = t.color; ctx.lineWidth = 2; ctx.globalAlpha = a; ctx.stroke()
      // Middle ring
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 0.6, 0, Math.PI * 2); ctx.strokeStyle = `${t.color}cc`; ctx.lineWidth = 1.5; ctx.stroke()
      // Center
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 0.2, 0, Math.PI * 2); ctx.fillStyle = t.color; ctx.fill()
      ctx.globalAlpha = 1
    })

    // Shot feedback
    S.current.shots.forEach(s => {
      const a = s.life
      if (s.hit) {
        ctx.strokeStyle = `rgba(52,211,153,${a})`; ctx.lineWidth = 2
        for (let i = 0; i < 8; i++) { const ang = (i / 8) * Math.PI * 2; const r1 = 8, r2 = 16 + (1 - a) * 10; ctx.beginPath(); ctx.moveTo(s.x + Math.cos(ang) * r1, s.y + Math.sin(ang) * r1); ctx.lineTo(s.x + Math.cos(ang) * r2, s.y + Math.sin(ang) * r2); ctx.stroke() }
        ctx.fillStyle = `rgba(52,211,153,${a})`; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'; ctx.fillText(`+${s.points}`, s.x, s.y - 20 + (1 - a) * 15); ctx.textAlign = 'start'
      } else {
        ctx.strokeStyle = `rgba(248,113,113,${a})`; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(s.x - 8, s.y - 8); ctx.lineTo(s.x + 8, s.y + 8); ctx.moveTo(s.x + 8, s.y - 8); ctx.lineTo(s.x - 8, s.y + 8); ctx.stroke()
      }
    })

    // Crosshair at cursor
    const { x: cx, y: cy } = cursor
    if (cx > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(cx - 16, cy); ctx.lineTo(cx - 5, cy); ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + 16, cy); ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy - 5); ctx.moveTo(cx, cy + 5); ctx.lineTo(cx, cy + 16); ctx.stroke()
      ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,100,100,0.8)'; ctx.stroke()
    }

    // HUD
    const s = S.current
    const timerPct = s.timeLeft / 45
    ctx.fillStyle = timerPct > 0.5 ? '#34d399' : timerPct > 0.25 ? '#fbbf24' : '#f87171'
    ctx.fillRect(0, H - 5, W * timerPct, 5)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'
    ctx.fillText(`${s.score}pts`, 10, 22)
    ctx.fillText(`⏱ ${Math.ceil(s.timeLeft)}s`, W / 2 - 20, 22)
    const acc = s.total > 0 ? Math.round((s.hits / s.total) * 100) : 100
    ctx.fillStyle = acc > 70 ? '#34d399' : acc > 40 ? '#fbbf24' : '#f87171'
    ctx.fillText(`${acc}% ACC`, W - 72, 22)
  }, [cursor])

  const update = useCallback((dt: number) => {
    const s = S.current; if (s.over || !s.started) return
    s.frame++; s.timeLeft -= dt
    s.spawnTimer -= dt
    if (s.spawnTimer <= 0 && s.targets.length < 5) { spawnTarget(); s.spawnTimer = 0.5 }

    s.targets.forEach(t => {
      t.x += t.vx * dt; t.y += t.vy * dt; t.life -= dt
      if (t.x < t.r || t.x > W - t.r) t.vx *= -1
      if (t.y < t.r || t.y > H - t.r) t.vy *= -1
    })
    s.targets = s.targets.filter(t => t.life > 0)
    s.shots.forEach(sh => sh.life -= dt * 1.5)
    s.shots = s.shots.filter(sh => sh.life > 0)

    if (s.timeLeft <= 0) {
      s.over = true
      const acc = s.total > 0 ? Math.round((s.hits / s.total) * 100) : 0
      setUi(u => ({ ...u, over: true, accuracy: acc, score: s.score }))
      onEnd(s.score >= 300 ? 'win' : 'play', s.score)
      return
    }
    const acc = s.total > 0 ? Math.round((s.hits / s.total) * 100) : 100
    setUi({ score: s.score, hits: s.hits, total: s.total, timeLeft: s.timeLeft, over: false, started: true, accuracy: acc })
    draw()
  }, [draw, onEnd])

  useAnimLoop(update, ui.started && !ui.over)

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const s = S.current; if (s.over) return
    if (!s.started) { s.started = true; setUi(u => ({ ...u, started: true })); return }
    const rect = cv.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    s.total++
    let hit = false; let pts = 0
    s.targets = s.targets.filter(t => {
      if (!hit && Math.hypot(mx - t.x, my - t.y) < t.r) { hit = true; pts = t.points; s.score += pts; s.hits++; return false }
      return true
    })
    s.shots.push({ x: mx, y: my, hit, points: pts, life: 1 })
  }, [])

  const handleMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = cv.current?.getBoundingClientRect()
    if (rect) setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  useEffect(() => { draw() }, [draw])

  function restart() {
    S.current = { targets: [], shots: [], score: 0, hits: 0, total: 0, timeLeft: 45, over: false, started: false, spawnTimer: 0, frame: 0, accuracy: 100 }
    setUi({ score: 0, hits: 0, total: 0, timeLeft: 45, over: false, started: false, accuracy: 0 }); draw()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <ScoreBar items={[{ label: 'Score', value: ui.score, color: '248,113,113' }, { label: 'Acertos', value: `${ui.hits}/${ui.total}`, color: '52,211,153' }, { label: 'Precisão', value: ui.total > 0 ? ui.accuracy + '%' : '—', color: '251,191,36' }, { label: 'Recorde', value: Math.max(ui.score, bestScore), color: '167,139,250' }]} />
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '2px solid rgba(248,113,113,0.3)', cursor: 'none' }}>
        <canvas ref={cv} width={W} height={H} onClick={handleClick} onMouseMove={handleMove} />
        {!ui.started && <Overlay><div style={{ fontSize: '2.5rem' }}>🎯</div><div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>MIRA ALVO</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', textAlign: 'center' }}>Alvos em movimento · 45 segundos<br />Alvos menores valem mais pontos</div><PlayBtn onClick={() => { S.current.started = true; setUi(u => ({ ...u, started: true })) }} color="#f87171" /></Overlay>}
        {ui.over && <Overlay><div style={{ color: '#fbbf24', fontWeight: 900, fontSize: '1.3rem' }}>⏱ FIM!</div><div style={{ color: '#fff' }}>Score: {ui.score} · Precisão: {ui.accuracy}%</div>{ui.score > bestScore && <div style={{ color: '#fbbf24' }}>🏆 Novo Recorde!</div>}<PlayBtn onClick={restart} label="↺ Jogar Novamente" color="#f87171" /></Overlay>}
      </div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Clique nos alvos em movimento · Alvos menores = mais pontos</div>
    </div>
  )
}
