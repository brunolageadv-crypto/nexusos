import { useState, useEffect, useCallback, useRef } from 'react'
import type { GameProps } from './Arcade'

// ─── Shared ───────────────────────────────────────────────────────────────────
function Btn({ onClick, disabled, children, color = '#60a5fa', style = {} }: { onClick: () => void; disabled?: boolean; children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: '8px 20px', borderRadius: 10, border: 'none', background: disabled ? 'rgba(255,255,255,0.06)' : `linear-gradient(135deg,${color},${color}99)`, color: disabled ? 'var(--text-muted)' : '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: disabled ? 'not-allowed' : 'pointer', ...style }}>
      {children}
    </button>
  )
}
function StatusBar({ items }: { items: { label: string; value: string | number; color: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 6 }}>
      {items.map(it => (
        <span key={it.label} style={{ padding: '4px 12px', borderRadius: 8, background: `rgba(${it.color},0.1)`, border: `1px solid rgba(${it.color},0.3)`, fontSize: '0.73rem', fontWeight: 700, color: `rgb(${it.color})` }}>
          {it.label}: {it.value}
        </span>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MEMÓRIA 1 — Memória por Sequência
// ══════════════════════════════════════════════════════════════════════════════
export function GameSeqMemory({ onEnd, bestScore }: GameProps) {
  const SHAPES = ['▲', '■', '●', '◆', '★', '⬟', '⬡', '⊕']
  const COLORS_SEQ = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#fb923c', '#67e8f9']

  const [seq, setSeq] = useState<number[]>([])
  const [input, setInput] = useState<number[]>([])
  const [phase, setPhase] = useState<'start' | 'show' | 'input' | 'result'>('start')
  const [active, setActive] = useState<number | null>(null)
  const [level, setLevel] = useState(1)
  const [score, setScore] = useState(0)
  const [wrong, setWrong] = useState(false)

  const showSeq = useCallback(async (s: number[]) => {
    setPhase('show'); setInput([])
    await new Promise(r => setTimeout(r, 500))
    for (const idx of s) {
      setActive(idx)
      await new Promise(r => setTimeout(r, 600))
      setActive(null)
      await new Promise(r => setTimeout(r, 250))
    }
    setPhase('input')
  }, [])

  const startLevel = useCallback((lv: number) => {
    const len = lv + 2
    const ns = Array.from({ length: len }, () => Math.floor(Math.random() * 8))
    setSeq(ns); setWrong(false); showSeq(ns)
  }, [showSeq])

  const press = (idx: number) => {
    if (phase !== 'input') return
    const ni = [...input, idx]
    const pos = ni.length - 1
    if (ni[pos] !== seq[pos]) {
      setWrong(true); setPhase('result')
      onEnd(score > 0 ? 'play' : 'loss', score)
      return
    }
    setInput(ni)
    if (ni.length === seq.length) {
      const ns = score + level * 10
      setScore(ns); setPhase('result')
      setTimeout(() => { setLevel(l => l + 1); startLevel(level + 1) }, 900)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 16 }}>
      <StatusBar items={[
        { label: 'Nível', value: level, color: '167,139,250' },
        { label: 'Score', value: score, color: '96,165,250' },
        { label: 'Seq.', value: seq.length, color: '251,191,36' },
        { label: 'Recorde', value: Math.max(score, bestScore), color: '52,211,153' },
      ]} />

      <div style={{ minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {phase === 'start' && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Pressione Iniciar para começar</span>}
        {phase === 'show' && <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: '0.85rem' }}>👁 Observe a sequência…</span>}
        {phase === 'input' && <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: '0.85rem' }}>🎯 Sua vez! ({input.length}/{seq.length})</span>}
        {phase === 'result' && !wrong && <span style={{ color: '#34d399', fontWeight: 800 }}>✅ Correto! Próximo nível…</span>}
        {phase === 'result' && wrong && <span style={{ color: '#f87171', fontWeight: 800 }}>❌ Errou! Sequência era: {seq.map(i => SHAPES[i]).join(' ')}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {SHAPES.map((sh, i) => (
          <button key={i} onClick={() => press(i)} disabled={phase !== 'input'}
            style={{ width: 80, height: 80, borderRadius: 16, border: `3px solid ${active === i ? COLORS_SEQ[i] : 'rgba(255,255,255,0.1)'}`, background: active === i ? `${COLORS_SEQ[i]}30` : 'var(--card-bg)', fontSize: '1.8rem', cursor: phase === 'input' ? 'pointer' : 'default', transition: 'all 0.15s', transform: active === i ? 'scale(1.1)' : 'scale(1)', boxShadow: active === i ? `0 0 24px ${COLORS_SEQ[i]}60` : 'none', color: COLORS_SEQ[i] }}>
            {sh}
          </button>
        ))}
      </div>

      {phase === 'start' && <Btn onClick={() => startLevel(1)} color="#a78bfa">▶ Iniciar</Btn>}
      {phase === 'result' && wrong && <Btn onClick={() => { setLevel(1); setScore(0); setSeq([]); setInput([]); setPhase('start') }} color="#f87171">↺ Recomeçar</Btn>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MEMÓRIA 2 — Memória Numérica
// ══════════════════════════════════════════════════════════════════════════════
export function GameNumMemory({ onEnd, bestScore }: GameProps) {
  const [phase, setPhase] = useState<'start' | 'show' | 'input' | 'done'>('start')
  const [number, setNumber] = useState('')
  const [input, setInput] = useState('')
  const [level, setLevel] = useState(1)
  const [score, setScore] = useState(0)
  const [result, setResult] = useState<'ok' | 'err' | null>(null)
  const [showTime, setShowTime] = useState(3)
  const timerRef = useRef<ReturnType<typeof setInterval>>()

  function genNumber(digits: number) {
    return Array.from({ length: digits }, (_, i) => i === 0 ? String(1 + Math.floor(Math.random() * 9)) : String(Math.floor(Math.random() * 10))).join('')
  }

  function startLevel(lv: number) {
    const digits = lv + 2
    const num = genNumber(digits)
    const displayTime = Math.max(1, digits * 0.7)
    setNumber(num); setInput(''); setResult(null); setShowTime(displayTime)
    setPhase('show')
    let t = displayTime
    timerRef.current = setInterval(() => { t -= 0.1; setShowTime(Math.max(0, t)); if (t <= 0) { clearInterval(timerRef.current); setPhase('input') } }, 100)
  }

  function submit() {
    if (input === number) {
      const ns = score + level * 15
      setScore(ns); setResult('ok')
      setTimeout(() => { const nl = level + 1; setLevel(nl); startLevel(nl) }, 900)
    } else {
      setResult('err'); setPhase('done')
      onEnd(score > 0 ? 'play' : 'loss', score)
    }
  }

  useEffect(() => () => clearInterval(timerRef.current), [])
  const digits = level + 2

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 20 }}>
      <StatusBar items={[
        { label: 'Nível', value: level, color: '251,191,36' },
        { label: `${digits} dígitos`, value: '', color: '96,165,250' },
        { label: 'Score', value: score, color: '167,139,250' },
        { label: 'Recorde', value: Math.max(score, bestScore), color: '52,211,153' },
      ]} />

      {/* Display area */}
      <div style={{ width: 320, height: 120, borderRadius: 16, border: `2px solid ${result === 'ok' ? 'rgba(52,211,153,0.5)' : result === 'err' ? 'rgba(248,113,113,0.5)' : 'rgba(251,191,36,0.3)'}`, background: result === 'ok' ? 'rgba(52,211,153,0.07)' : result === 'err' ? 'rgba(248,113,113,0.07)' : 'rgba(251,191,36,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s', position: 'relative', overflow: 'hidden' }}>
        {phase === 'show' && (
          <>
            <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: `${Math.max(1.2, 3 - digits * 0.1)}rem`, color: '#fbbf24', letterSpacing: '0.15em', textAlign: 'center', padding: '0 12px' }}>{number}</div>
            <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, height: 4, borderRadius: 2, background: 'rgba(251,191,36,0.2)' }}>
              <div style={{ height: '100%', width: `${(showTime / (digits * 0.7)) * 100}%`, background: '#fbbf24', borderRadius: 2, transition: 'width 0.1s linear' }} />
            </div>
          </>
        )}
        {phase === 'input' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>Digite o número que você viu:</div>
            <input autoFocus value={input} onChange={e => setInput(e.target.value.replace(/\D/g, '').slice(0, digits + 2))}
              onKeyDown={e => e.key === 'Enter' && submit()}
              style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1.6rem', width: 240, textAlign: 'center', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', letterSpacing: '0.15em' }} />
          </div>
        )}
        {phase === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#f87171', fontWeight: 800 }}>❌ Errou!</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Era: <span style={{ color: '#fbbf24', fontWeight: 700 }}>{number}</span> · Você: <span style={{ color: '#f87171', fontWeight: 700 }}>{input || '—'}</span></div>
          </div>
        )}
        {result === 'ok' && <div style={{ fontWeight: 800, color: '#34d399', fontSize: '1.1rem' }}>✅ Correto!</div>}
        {phase === 'start' && <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Memorize o número!</div>}
      </div>

      {/* Numpad */}
      {phase === 'input' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 6 }}>
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button key={n} onClick={() => setInput(p => (p + n).slice(0, digits + 2))}
                style={{ width: 52, height: 52, borderRadius: 10, border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer' }}>{n}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <button onClick={() => setInput(p => p.slice(0, -1))} style={{ width: 52, height: 52, borderRadius: 10, border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: '#f87171', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}>⌫</button>
            <button onClick={() => setInput(p => (p + '0').slice(0, digits + 2))} style={{ width: 52, height: 52, borderRadius: 10, border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer' }}>0</button>
            <button onClick={submit} style={{ width: 52, height: 52, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', color: '#fff', fontWeight: 900, fontSize: '1rem', cursor: 'pointer' }}>✓</button>
          </div>
        </div>
      )}

      {phase === 'start' && <Btn onClick={() => startLevel(1)} color="#fbbf24">▶ Iniciar</Btn>}
      {phase === 'done' && <Btn onClick={() => { setLevel(1); setScore(0); setNumber(''); setInput(''); setResult(null); setPhase('start') }} color="#fbbf24">↺ Recomeçar</Btn>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MEMÓRIA 3 — Memória Visual
// ══════════════════════════════════════════════════════════════════════════════
export function GameVisualMemory({ onEnd, bestScore }: GameProps) {
  const GRID = 5
  const [phase, setPhase] = useState<'start' | 'show' | 'input' | 'result'>('start')
  const [correct, setCorrect] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [level, setLevel] = useState(1)
  const [score, setScore] = useState(0)
  const [wrong, setWrong] = useState(false)
  const [flashWrong, setFlashWrong] = useState<Set<number>>(new Set())

  function startLevel(lv: number) {
    const count = Math.min(3 + lv, 20)
    const all = Array.from({ length: GRID * GRID }, (_, i) => i)
    const chosen = new Set<number>()
    while (chosen.size < count) chosen.add(all[Math.floor(Math.random() * all.length)])
    setCorrect(chosen); setSelected(new Set()); setWrong(false); setFlashWrong(new Set())
    setPhase('show')
    setTimeout(() => setPhase('input'), 1000 + lv * 200)
  }

  function toggle(i: number) {
    if (phase !== 'input') return
    const ns = new Set(selected)
    ns.has(i) ? ns.delete(i) : ns.add(i)
    setSelected(ns)
  }

  function submit() {
    if (phase !== 'input') return
    const fw = new Set<number>()
    selected.forEach(i => { if (!correct.has(i)) fw.add(i) })
    correct.forEach(i => { if (!selected.has(i)) fw.add(i) })
    if (fw.size === 0) {
      const ns = score + level * 20; setScore(ns); setPhase('result')
      setTimeout(() => { const nl = level + 1; setLevel(nl); startLevel(nl) }, 800)
    } else {
      setFlashWrong(fw); setWrong(true); setPhase('result')
      setTimeout(() => onEnd(score > 0 ? 'play' : 'loss', score), 1200)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 16 }}>
      <StatusBar items={[
        { label: 'Nível', value: level, color: '96,165,250' },
        { label: 'Células', value: Math.min(3 + level, 20), color: '167,139,250' },
        { label: 'Score', value: score, color: '251,191,36' },
        { label: 'Recorde', value: Math.max(score, bestScore), color: '52,211,153' },
      ]} />
      <div style={{ minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {phase === 'show' && <span style={{ color: '#60a5fa', fontWeight: 700 }}>👁 Memorize as células destacadas!</span>}
        {phase === 'input' && <span style={{ color: '#a78bfa', fontWeight: 700 }}>🖱 Clique nas células que você viu ({selected.size}/{correct.size})</span>}
        {phase === 'result' && !wrong && <span style={{ color: '#34d399', fontWeight: 800 }}>✅ Perfeito!</span>}
        {phase === 'result' && wrong && <span style={{ color: '#f87171', fontWeight: 800 }}>❌ Errou! As marcadas em vermelho estavam erradas</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID},1fr)`, gap: 5 }}>
        {Array.from({ length: GRID * GRID }, (_, i) => {
          const isCorrect = correct.has(i)
          const isSel = selected.has(i)
          const isFlash = flashWrong.has(i)
          let bg = 'var(--card-bg)'
          let border = 'var(--border-md)'
          if (phase === 'show' && isCorrect) { bg = 'rgba(96,165,250,0.3)'; border = '#60a5fa' }
          if (phase === 'input' && isSel) { bg = 'rgba(167,139,250,0.25)'; border = '#a78bfa' }
          if (phase === 'result') {
            if (isCorrect && isSel) { bg = 'rgba(52,211,153,0.25)'; border = '#34d399' }
            if (isCorrect && !isSel) { bg = 'rgba(96,165,250,0.25)'; border = '#60a5fa' }
            if (isFlash) { bg = 'rgba(248,113,113,0.25)'; border = '#f87171' }
          }
          return (
            <div key={i} onClick={() => toggle(i)}
              style={{ width: 54, height: 54, borderRadius: 10, background: bg, border: `2px solid ${border}`, cursor: phase === 'input' ? 'pointer' : 'default', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
              {phase === 'result' && isCorrect && isSel && '✓'}
              {phase === 'result' && isFlash && '✗'}
            </div>
          )
        })}
      </div>
      {phase === 'input' && <Btn onClick={submit} color="#a78bfa">✓ Confirmar</Btn>}
      {phase === 'start' && <Btn onClick={() => startLevel(1)} color="#60a5fa">▶ Iniciar</Btn>}
      {phase === 'result' && wrong && <Btn onClick={() => { setLevel(1); setScore(0); setPhase('start') }} color="#f87171">↺ Recomeçar</Btn>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MEMÓRIA 4 — Memória de Cores
// ══════════════════════════════════════════════════════════════════════════════
export function GameColorMemory({ onEnd, bestScore }: GameProps) {
  const PALETTE = [
    { name: 'Vermelho', hex: '#ef4444' }, { name: 'Laranja', hex: '#f97316' },
    { name: 'Amarelo', hex: '#eab308' }, { name: 'Verde', hex: '#22c55e' },
    { name: 'Ciano', hex: '#06b6d4' }, { name: 'Azul', hex: '#3b82f6' },
    { name: 'Roxo', hex: '#8b5cf6' }, { name: 'Rosa', hex: '#ec4899' },
    { name: 'Branco', hex: '#f1f5f9' }, { name: 'Cinza', hex: '#64748b' },
  ]
  const [seq, setSeq] = useState<number[]>([])
  const [input, setInput] = useState<number[]>([])
  const [phase, setPhase] = useState<'start' | 'show' | 'input' | 'result'>('start')
  const [showIdx, setShowIdx] = useState(-1)
  const [level, setLevel] = useState(1)
  const [score, setScore] = useState(0)
  const [wrong, setWrong] = useState(false)

  const showSeq = useCallback(async (s: number[]) => {
    setPhase('show'); setInput([])
    await new Promise(r => setTimeout(r, 400))
    for (let i = 0; i < s.length; i++) {
      setShowIdx(s[i])
      await new Promise(r => setTimeout(r, 700))
      setShowIdx(-1)
      await new Promise(r => setTimeout(r, 300))
    }
    setPhase('input')
  }, [])

  function startLevel(lv: number) {
    const len = lv + 2
    const ns = Array.from({ length: len }, () => Math.floor(Math.random() * PALETTE.length))
    setSeq(ns); setWrong(false); showSeq(ns)
  }

  function press(idx: number) {
    if (phase !== 'input') return
    const ni = [...input, idx]
    if (ni[ni.length - 1] !== seq[ni.length - 1]) {
      setWrong(true); setPhase('result')
      onEnd(score > 0 ? 'play' : 'loss', score); return
    }
    setInput(ni)
    if (ni.length === seq.length) {
      const ns = score + level * 12; setScore(ns); setPhase('result')
      setTimeout(() => { const nl = level + 1; setLevel(nl); startLevel(nl) }, 900)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 16 }}>
      <StatusBar items={[
        { label: 'Nível', value: level, color: '167,139,250' },
        { label: 'Score', value: score, color: '96,165,250' },
        { label: 'Seq.', value: seq.length, color: '251,191,36' },
        { label: 'Recorde', value: Math.max(score, bestScore), color: '52,211,153' },
      ]} />

      {/* Display atual */}
      <div style={{ width: 160, height: 80, borderRadius: 16, background: showIdx >= 0 ? PALETTE[showIdx].hex : 'var(--card-bg)', border: `3px solid ${showIdx >= 0 ? PALETTE[showIdx].hex : 'var(--border-md)'}`, transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: showIdx >= 0 ? `0 0 30px ${PALETTE[showIdx].hex}60` : 'none' }}>
        {showIdx >= 0 && <span style={{ fontWeight: 800, color: '#fff', fontSize: '0.85rem', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{PALETTE[showIdx].name}</span>}
        {phase === 'input' && showIdx < 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Repita a sequência</span>}
      </div>

      {/* Progresso */}
      {phase === 'input' && (
        <div style={{ display: 'flex', gap: 4 }}>
          {seq.map((_, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < input.length ? PALETTE[seq[i]].hex : 'var(--border-md)', transition: 'background 0.2s' }} />
          ))}
        </div>
      )}

      {phase === 'show' && <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: '0.82rem' }}>👁 Observe as cores…</span>}
      {phase === 'result' && !wrong && <span style={{ color: '#34d399', fontWeight: 800 }}>✅ Correto!</span>}
      {phase === 'result' && wrong && <span style={{ color: '#f87171', fontWeight: 700, fontSize: '0.8rem' }}>❌ Errou! Eram: {seq.map(i => PALETTE[i].name).join(', ')}</span>}

      {/* Color palette */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
        {PALETTE.map((c, i) => (
          <button key={i} onClick={() => press(i)} disabled={phase !== 'input'}
            style={{ width: 56, height: 56, borderRadius: 12, background: c.hex, border: `3px solid ${phase === 'input' ? 'rgba(255,255,255,0.2)' : 'transparent'}`, cursor: phase === 'input' ? 'pointer' : 'default', transition: 'all 0.15s', boxShadow: phase === 'input' ? `0 4px 12px ${c.hex}50` : 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 4 }}
            onMouseEnter={e => { if (phase === 'input') (e.currentTarget as HTMLElement).style.transform = 'scale(1.12)' }}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}>
            <span style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>{c.name}</span>
          </button>
        ))}
      </div>

      {phase === 'start' && <Btn onClick={() => startLevel(1)} color="#a78bfa">▶ Iniciar</Btn>}
      {phase === 'result' && wrong && <Btn onClick={() => { setLevel(1); setScore(0); setSeq([]); setInput([]); setPhase('start') }} color="#f87171">↺ Recomeçar</Btn>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ESTRATÉGIA 1 — OTHELLO (Reversi)
// ══════════════════════════════════════════════════════════════════════════════
type OCell = null | 'P' | 'AI'
export function GameOthello({ onEnd, bestScore: _bs }: GameProps) {
  const N = 8
  function initBoard(): OCell[][] {
    const b: OCell[][] = Array.from({ length: N }, () => Array(N).fill(null))
    b[3][3] = 'AI'; b[3][4] = 'P'; b[4][3] = 'P'; b[4][4] = 'AI'
    return b
  }
  const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]] as const

  function getFlips(b: OCell[][], r: number, c: number, player: OCell): [number,number][] {
    if (b[r][c]) return []
    const opp: OCell = player === 'P' ? 'AI' : 'P'
    const flips: [number,number][] = []
    for (const [dr,dc] of DIRS) {
      const line: [number,number][] = []
      let nr = r + dr, nc = c + dc
      while (nr >= 0 && nr < N && nc >= 0 && nc < N && b[nr][nc] === opp) { line.push([nr,nc]); nr += dr; nc += dc }
      if (line.length && nr >= 0 && nr < N && nc >= 0 && nc < N && b[nr][nc] === player) flips.push(...line)
    }
    return flips
  }

  function getValid(b: OCell[][], player: OCell): [number,number][] {
    const moves: [number,number][] = []
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (getFlips(b, r, c, player).length) moves.push([r,c])
    return moves
  }

  function applyMove(b: OCell[][], r: number, c: number, player: OCell): OCell[][] {
    const nb = b.map(row => [...row]) as OCell[][]
    const flips = getFlips(nb, r, c, player)
    if (!flips.length) return nb
    nb[r][c] = player; flips.forEach(([fr,fc]) => nb[fr][fc] = player)
    return nb
  }

  const [board, setBoard] = useState<OCell[][]>(initBoard)
  const [turn, setTurn] = useState<OCell>('P')
  const [status, setStatus] = useState<'playing'|'win'|'loss'|'draw'>('playing')
  const [hover, setHover] = useState<[number,number]|null>(null)

  const validMoves = getValid(board, turn)
  const pCount = board.flat().filter(c => c === 'P').length
  const aiCount = board.flat().filter(c => c === 'AI').length

  function aiMove(b: OCell[][]): [number,number] {
    const moves = getValid(b, 'AI')
    // Prefer corners, then edges
    const corners: [number,number][] = [[0,0],[0,7],[7,0],[7,7]]
    for (const [r,c] of corners) if (moves.some(([mr,mc]) => mr===r&&mc===c)) return [r,c]
    // Pick move that flips most
    let best = moves[0]; let bestFlips = 0
    for (const [r,c] of moves) { const f = getFlips(b,r,c,'AI').length; if (f > bestFlips) { bestFlips = f; best = [r,c] } }
    return best
  }

  function checkEnd(b: OCell[][]): boolean {
    const pM = getValid(b,'P').length, aiM = getValid(b,'AI').length
    if (pM === 0 && aiM === 0) {
      const p = b.flat().filter(c=>c==='P').length, ai = b.flat().filter(c=>c==='AI').length
      setStatus(p > ai ? 'win' : p < ai ? 'loss' : 'draw')
      onEnd(p > ai ? 'win' : p < ai ? 'loss' : 'draw', p * 5)
      return true
    }
    return false
  }

  function click(r: number, c: number) {
    if (status !== 'playing' || turn !== 'P') return
    const flips = getFlips(board, r, c, 'P')
    if (!flips.length) return
    const nb = applyMove(board, r, c, 'P')
    setBoard(nb)
    if (checkEnd(nb)) return
    const aiHasMoves = getValid(nb, 'AI').length > 0
    if (!aiHasMoves) { setTurn('P'); return }
    setTurn('AI')
    setTimeout(() => {
      const [ar,ac] = aiMove(nb)
      const nb2 = applyMove(nb, ar, ac, 'AI')
      setBoard(nb2)
      if (!checkEnd(nb2)) {
        const pHas = getValid(nb2,'P').length > 0
        setTurn(pHas ? 'P' : 'AI')
      }
    }, 450)
  }

  const reset = () => { setBoard(initBoard()); setTurn('P'); setStatus('playing') }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 10 }}>
      <StatusBar items={[
        { label: '⚪ Você', value: pCount, color: '248,250,252' },
        { label: '⚫ IA', value: aiCount, color: '148,163,184' },
        { label: status === 'playing' ? (turn === 'P' ? 'Sua vez' : 'IA...') : status === 'win' ? '🎉 Vitória!' : status === 'loss' ? '💀 Derrota' : '🤝 Empate', value: '', color: status === 'win' ? '52,211,153' : status === 'loss' ? '248,113,113' : '251,191,36' },
      ]} />
      <div style={{ background: '#14532d', padding: 6, borderRadius: 12, display: 'grid', gridTemplateColumns: `repeat(${N},1fr)`, gap: 2 }}>
        {board.map((row, r) => row.map((cell, c) => {
          const isValid = turn === 'P' && status === 'playing' && getFlips(board, r, c, 'P').length > 0
          const isHover = hover?.[0] === r && hover?.[1] === c
          return (
            <div key={`${r}-${c}`} onClick={() => click(r, c)}
              onMouseEnter={() => isValid && setHover([r,c])} onMouseLeave={() => setHover(null)}
              style={{ width: 46, height: 46, borderRadius: 6, background: isHover ? 'rgba(255,255,255,0.15)' : '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isValid ? 'pointer' : 'default', position: 'relative', transition: 'background 0.1s' }}>
              {cell && <div style={{ width: 34, height: 34, borderRadius: '50%', background: cell === 'P' ? '#f1f5f9' : '#1f2937', border: `2px solid ${cell === 'P' ? '#cbd5e1' : '#374151'}`, boxShadow: `0 2px 8px rgba(0,0,0,0.4)`, transition: 'all 0.2s' }} />}
              {isValid && !cell && <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', border: '2px solid rgba(255,255,255,0.4)' }} />}
            </div>
          )
        }))}
      </div>
      <button onClick={reset} style={{ padding: '6px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}>↺ Novo Jogo</button>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Clique para jogar · Pontinhos = jogadas válidas</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ESTRATÉGIA 2 — GOMOKU (5 em linha)
// ══════════════════════════════════════════════════════════════════════════════
type GCell = null | 'P' | 'AI'
export function GameGomoku({ onEnd, bestScore: _bs }: GameProps) {
  const N = 15
  const [board, setBoard] = useState<GCell[][]>(() => Array.from({ length: N }, () => Array(N).fill(null)))
  const [turn, setTurn] = useState<'P' | 'AI'>('P')
  const [winner, setWinner] = useState<GCell | null>(null)
  const [winLine, setWinLine] = useState<[number,number][]>([])

  function checkWin(b: GCell[][], r: number, c: number, player: GCell): [number,number][] | null {
    const dirs: [number,number][] = [[0,1],[1,0],[1,1],[1,-1]]
    for (const [dr,dc] of dirs) {
      const cells: [number,number][] = [[r,c]]
      for (let k = 1; k < 5; k++) { const nr=r+dr*k, nc=c+dc*k; if(nr<0||nr>=N||nc<0||nc>=N||b[nr][nc]!==player) break; cells.push([nr,nc]) }
      for (let k = 1; k < 5; k++) { const nr=r-dr*k, nc=c-dc*k; if(nr<0||nr>=N||nc<0||nc>=N||b[nr][nc]!==player) break; cells.push([nr,nc]) }
      if (cells.length >= 5) return cells.slice(0,5)
    }
    return null
  }

  function aiMove(b: GCell[][]): [number,number] {
    // Score-based: check threats
    function score(r: number, c: number, player: GCell): number {
      if (b[r][c]) return -1
      let s = 0
      const dirs: [number,number][] = [[0,1],[1,0],[1,1],[1,-1]]
      for (const [dr,dc] of dirs) {
        for (const p of [player, player === 'AI' ? 'P' : 'AI'] as GCell[]) {
          let cnt = 0
          for (let k = -4; k <= 4; k++) { const nr=r+dr*k, nc=c+dc*k; if(nr<0||nr>=N||nc<0||nc>=N) continue; if(b[nr][nc]===p) cnt++; else if(b[nr][nc]) { cnt=0; break } }
          const bonus = p === player ? cnt * cnt : cnt * cnt * 2
          s += bonus
        }
      }
      return s
    }
    // Look only near existing pieces
    const candidates = new Set<string>()
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (b[r][c]) {
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const nr=r+dr, nc=c+dc; if(nr>=0&&nr<N&&nc>=0&&nc<N&&!b[nr][nc]) candidates.add(`${nr},${nc}`)
      }
    }
    if (!candidates.size) return [Math.floor(N/2), Math.floor(N/2)]
    let best: [number,number] = [7,7]; let bestS = -1
    for (const key of candidates) {
      const [r,c] = key.split(',').map(Number) as [number,number]
      const s = score(r,c,'AI'); if(s > bestS) { bestS=s; best=[r,c] }
    }
    return best
  }

  function click(r: number, c: number) {
    if (board[r][c] || winner || turn !== 'P') return
    const nb = board.map(row => [...row]) as GCell[][]; nb[r][c] = 'P'
    const w = checkWin(nb, r, c, 'P')
    if (w) { setBoard(nb); setWinner('P'); setWinLine(w); onEnd('win', 200); return }
    if (nb.flat().every(c => c)) { setBoard(nb); onEnd('draw', 50); return }
    setBoard(nb); setTurn('AI')
    setTimeout(() => {
      const [ar,ac] = aiMove(nb); const nb2 = nb.map(row=>[...row]) as GCell[][]; nb2[ar][ac]='AI'
      const w2 = checkWin(nb2,ar,ac,'AI')
      if (w2) { setBoard(nb2); setWinner('AI'); setWinLine(w2); onEnd('loss', 0); return }
      setBoard(nb2); setTurn('P')
    }, 300)
  }

  const reset = () => { setBoard(Array.from({length:N},()=>Array(N).fill(null))); setTurn('P'); setWinner(null); setWinLine([]) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 8 }}>
      <StatusBar items={[
        { label: winner === 'P' ? '🎉 Você ganhou!' : winner === 'AI' ? '💀 IA venceu!' : turn === 'P' ? '⚫ Sua vez' : '⚪ IA pensando', value: '', color: winner === 'P' ? '52,211,153' : winner === 'AI' ? '248,113,113' : '96,165,250' },
      ]} />
      <div style={{ background: '#92400e', padding: 4, borderRadius: 10, position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${N},1fr)`, gap: 0 }}>
          {board.map((row,r) => row.map((cell,c) => {
            const isWin = winLine.some(([wr,wc]) => wr===r&&wc===c)
            return (
              <div key={`${r}-${c}`} onClick={() => click(r,c)}
                style={{ width: 32, height: 32, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: !cell && !winner ? 'pointer' : 'default', position: 'relative' }}
                onMouseEnter={e => { if (!cell && !winner && turn==='P') (e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.1)' }}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}>
                {/* Grid lines */}
                <div style={{ position: 'absolute', width: '100%', height: 1, background: '#78350f', top: '50%' }} />
                <div style={{ position: 'absolute', height: '100%', width: 1, background: '#78350f', left: '50%' }} />
                {cell && <div style={{ width: 24, height: 24, borderRadius: '50%', background: cell==='P'?'#1f2937':'#f8fafc', border: `2px solid ${isWin?'#fbbf24':cell==='P'?'#374151':'#e2e8f0'}`, zIndex: 1, boxShadow: isWin?'0 0 10px #fbbf24':`0 2px 4px rgba(0,0,0,0.3)`, transition: 'box-shadow 0.2s' }} />}
              </div>
            )
          }))}
        </div>
      </div>
      <button onClick={reset} style={{ padding: '6px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}>↺ Novo Jogo</button>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Você = preto · IA = branco · Faça 5 em linha</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ESTRATÉGIA 3 — NIM
// ══════════════════════════════════════════════════════════════════════════════
export function GameNim({ onEnd, bestScore: _bs }: GameProps) {
  const INIT = [7, 5, 3, 1]
  const [piles, setPiles] = useState([...INIT])
  const [sel, setSel] = useState<{ row: number; count: number } | null>(null)
  const [turn, setTurn] = useState<'P' | 'AI'>('P')
  const [status, setStatus] = useState<'playing' | 'win' | 'loss'>('playing')
  const [msg, setMsg] = useState('')
  const [round, setRound] = useState(1)
  const [score, setScore] = useState(0)

  function nimValue(p: number[]): number { return p.reduce((a, b) => a ^ b, 0) }

  function aiPlay(p: number[]): [number,number] {
    // Misère Nim optimal: if nim-value != 0, find move to make it 0
    const xor = nimValue(p)
    if (xor !== 0) {
      for (let i = 0; i < p.length; i++) {
        const target = p[i] ^ xor
        if (target < p[i]) return [i, p[i] - target]
      }
    }
    // Random: take 1 from biggest
    const maxIdx = p.indexOf(Math.max(...p))
    return [maxIdx, 1 + Math.floor(Math.random() * Math.min(2, p[maxIdx]))]
  }

  function take(remove: number) {
    if (!sel || status !== 'playing' || turn !== 'P') return
    const np = [...piles]; np[sel.row] -= remove
    const total = np.reduce((a,b) => a+b, 0)
    if (total === 0) { setPiles(np); setStatus('loss'); onEnd('loss', score); setMsg('Você pegou a última pedra — IA vence!'); return }
    setPiles(np); setSel(null); setTurn('AI'); setMsg('IA está pensando…')
    setTimeout(() => {
      const [ar, ac] = aiPlay(np); const np2 = [...np]; np2[ar] -= ac
      const tot2 = np2.reduce((a,b) => a+b, 0)
      if (tot2 === 0) { setPiles(np2); setStatus('win'); onEnd('win', score + 100); setMsg(`IA pegou ${ac} pedra(s) da pilha ${ar+1} — Você vence!`) ; return }
      setPiles(np2); setTurn('P'); setMsg(`IA pegou ${ac} pedra(s) da pilha ${ar+1}`)
    }, 700)
  }

  function nextRound() { const nr = round + 1; setRound(nr); setPiles([...INIT]); setSel(null); setTurn('P'); setStatus('playing'); setMsg(''); setScore(s => s + 100) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 20 }}>
      <StatusBar items={[{ label: 'Rodada', value: round, color: '251,191,36' }, { label: 'Score', value: score, color: '96,165,250' }, { label: status === 'win' ? '🎉 Você vence!' : status === 'loss' ? '💀 IA vence!' : turn === 'P' ? 'Sua vez' : 'IA...', value: '', color: status === 'win' ? '52,211,153' : status === 'loss' ? '248,113,113' : '167,139,250' }]} />
      {msg && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>{msg}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 380 }}>
        {piles.map((count, ri) => (
          <div key={ri} onClick={() => status==='playing'&&turn==='P'&&count>0&&setSel(sel?.row===ri?null:{row:ri,count:0})}
            style={{ padding: '10px 14px', borderRadius: 12, border: `2px solid ${sel?.row===ri?'rgba(251,191,36,0.6)':'var(--border)'}`, background: sel?.row===ri?'rgba(251,191,36,0.06)':'var(--card-bg)', cursor: status==='playing'&&turn==='P'&&count>0?'pointer':'default', transition: 'all 0.15s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: sel?.row===ri?10:0 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>Pilha {ri+1}</span>
              <span style={{ fontWeight: 800, color: count>0?'var(--text-primary)':'var(--text-muted)' }}>{count} pedra{count!==1?'s':''}</span>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {Array.from({length:count},(_,i)=>(
                <div key={i} style={{ width:28, height:28, borderRadius:'50%', background: sel?.row===ri&&sel.count>i?'#fbbf24':'#475569', border:'2px solid rgba(255,255,255,0.1)', transition:'background 0.15s', cursor: sel?.row===ri?'pointer':'default' }}
                  onMouseEnter={()=>sel?.row===ri&&setSel({row:ri,count:i+1})}
                  onClick={e=>{e.stopPropagation();if(sel?.row===ri){setSel({row:ri,count:i+1})}}}/>
              ))}
            </div>
            {sel?.row===ri&&sel.count>0&&<button onClick={e=>{e.stopPropagation();take(sel.count)}} style={{marginTop:8,padding:'6px 16px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#fbbf24,#f59e0b)',color:'#fff',fontWeight:800,cursor:'pointer',fontSize:'0.8rem'}}>Retirar {sel.count} pedra{sel.count!==1?'s':''}</button>}
          </div>
        ))}
      </div>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: 340 }}>Selecione uma pilha e quantas pedras retirar. Quem pegar a última pedra PERDE (Misère Nim).</div>
      {status !== 'playing' && <div style={{ display: 'flex', gap: 10 }}><Btn onClick={nextRound} color="#fbbf24">▶ Próxima Rodada</Btn></div>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ESTRATÉGIA 4 — MANCALA (Kalah)
// ══════════════════════════════════════════════════════════════════════════════
export function GameMancala({ onEnd, bestScore: _bs }: GameProps) {
  // pits[0..5] = P pits (left to right), pits[6] = P store, pits[7..12] = AI pits (right to left), pits[13] = AI store
  function initPits() { return [...Array(6).fill(4), 0, ...Array(6).fill(4), 0] }
  const [pits, setPits] = useState(initPits())
  const [turn, setTurn] = useState<'P' | 'AI'>('P')
  const [status, setStatus] = useState<'playing' | 'win' | 'loss' | 'draw'>('playing')
  const [lastMoved, setLastMoved] = useState<number | null>(null)

  function move(pits: number[], pit: number, player: 'P' | 'AI'): { pits: number[]; bonus: boolean } {
    const np = [...pits]; let stones = np[pit]; np[pit] = 0
    const skip = player === 'P' ? 13 : 6
    let idx = pit
    while (stones > 0) { idx = (idx + 1) % 14; if (idx === skip) continue; np[idx]++; stones-- }
    const store = player === 'P' ? 6 : 13
    const bonus = idx === store
    // Capture
    if (!bonus && np[idx] === 1) {
      const opposite = 12 - idx
      if (player === 'P' && idx < 6 && np[opposite] > 0) { np[6] += np[opposite] + 1; np[opposite] = 0; np[idx] = 0 }
      if (player === 'AI' && idx >= 7 && idx <= 12 && np[opposite] > 0) { np[13] += np[opposite] + 1; np[opposite] = 0; np[idx] = 0 }
    }
    return { pits: np, bonus }
  }

  function checkEnd(np: number[]): boolean {
    const pEmpty = np.slice(0,6).every(v=>v===0), aiEmpty = np.slice(7,13).every(v=>v===0)
    if (pEmpty || aiEmpty) {
      const fp = [...np]
      fp.slice(0,6).forEach((v,i)=>{fp[6]+=v;fp[i]=0}); fp.slice(7,13).forEach((v,i)=>{fp[13]+=v;fp[i+7]=0})
      const st = fp[6]>fp[13]?'win':fp[6]<fp[13]?'loss':'draw'
      setPits(fp); setStatus(st); onEnd(st, fp[6]*5); return true
    }
    return false
  }

  function playerMove(pit: number) {
    if (status!=='playing'||turn!=='P'||pits[pit]===0||pit>5) return
    const {pits:np,bonus} = move(pits,pit,'P'); setLastMoved(pit); setPits(np)
    if (checkEnd(np)) return
    if (bonus) { setTurn('P'); return }
    setTurn('AI')
    setTimeout(()=>{
      // AI picks pit with most stones or that gives bonus
      const aiPits = np.slice(7,13).map((v,i)=>({v,i:i+7})).filter(x=>x.v>0)
      const bonusPit = aiPits.find(x=>{ const end=(x.i+x.v)%14;return end===13 })
      const chosen = bonusPit ? bonusPit.i : aiPits.sort((a,b)=>b.v-a.v)[0]?.i ?? 7
      const {pits:np2,bonus:b2} = move(np,chosen,'AI'); setLastMoved(chosen); setPits(np2)
      if (!checkEnd(np2)) setTurn(b2?'AI':'P')
    },600)
  }

  const reset = ()=>{ setPits(initPits());setTurn('P');setStatus('playing');setLastMoved(null) }

  const pit=(i:number,count:number,isP:boolean)=>(
    <button key={i} onClick={()=>playerMove(i)} disabled={turn!=='P'||status!=='playing'||!isP||count===0}
      style={{width:54,height:54,borderRadius:'50%',border:`2px solid ${lastMoved===i?'rgba(251,191,36,0.7)':isP&&turn==='P'&&count>0&&status==='playing'?'rgba(96,165,250,0.4)':'var(--border)'}`,background:lastMoved===i?'rgba(251,191,36,0.1)':isP&&count>0?'rgba(96,165,250,0.08)':'var(--card-bg)',cursor:isP&&turn==='P'&&count>0&&status==='playing'?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace',fontWeight:800,fontSize:'1rem',color:'var(--text-primary)',transition:'all 0.2s'}}>
      {count}
    </button>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,padding:14}}>
      <StatusBar items={[{label:'Você',value:pits[6],color:'96,165,250'},{label:'IA',value:pits[13],color:'248,113,113'},{label:status==='playing'?(turn==='P'?'Sua vez':'IA...'):(status==='win'?'🎉 Vitória!':status==='loss'?'💀 Derrota':'🤝 Empate'),value:'',color:status==='win'?'52,211,153':status==='loss'?'248,113,113':'251,191,36'}]} />
      <div style={{background:'#7c2d12',padding:12,borderRadius:16,display:'flex',flexDirection:'column',gap:8}}>
        {/* AI pits (reversed) */}
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <div style={{width:54,height:90,borderRadius:10,background:'rgba(248,113,113,0.15)',border:'2px solid rgba(248,113,113,0.4)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace',fontWeight:900,fontSize:'1.2rem',color:'#f87171'}}>{pits[13]}</div>
          <div style={{display:'flex',gap:6}}>{[12,11,10,9,8,7].map(i=>pit(i,pits[i],false))}</div>
          <div style={{width:54,height:90,borderRadius:10,background:'rgba(96,165,250,0.05)',border:'1px solid var(--border)',opacity:0.3,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)',fontSize:'0.65rem'}}>—</div>
        </div>
        {/* P pits */}
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <div style={{width:54,height:90,borderRadius:10,background:'rgba(96,165,250,0.05)',border:'1px solid var(--border)',opacity:0.3,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)',fontSize:'0.65rem'}}>—</div>
          <div style={{display:'flex',gap:6}}>{[0,1,2,3,4,5].map(i=>pit(i,pits[i],true))}</div>
          <div style={{width:54,height:90,borderRadius:10,background:'rgba(96,165,250,0.15)',border:'2px solid rgba(96,165,250,0.4)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace',fontWeight:900,fontSize:'1.2rem',color:'#60a5fa'}}>{pits[6]}</div>
        </div>
      </div>
      <div style={{fontSize:'0.62rem',color:'var(--text-muted)',textAlign:'center',maxWidth:360}}>Clique nos seus buracos (linha de baixo). Semear as pedras no sentido horário. Cair no seu armazém = joga de novo.</div>
      <button onClick={reset} style={{padding:'5px 14px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer',fontSize:'0.72rem'}}>↺ Novo Jogo</button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ESTRATÉGIA 5 — HEX
// ══════════════════════════════════════════════════════════════════════════════
type HCell = null | 'P' | 'AI'
export function GameHex({ onEnd, bestScore: _bs }: GameProps) {
  const N = 9
  const [board, setBoard] = useState<HCell[][]>(() => Array.from({length:N},()=>Array(N).fill(null)))
  const [turn, setTurn] = useState<'P'|'AI'>('P')
  const [winner, setWinner] = useState<HCell>(null)

  // P connects top-bottom, AI connects left-right
  function checkWin(b: HCell[][], player: HCell): boolean {
    const visited = new Set<string>()
    function dfs(r: number, c: number): boolean {
      const key = `${r},${c}`
      if (visited.has(key)) return false; visited.add(key)
      if (player==='P'&&r===N-1) return true
      if (player==='AI'&&c===N-1) return true
      const nbrs: [number,number][] = [[r-1,c],[r+1,c],[r,c-1],[r,c+1],[r-1,c+1],[r+1,c-1]]
      return nbrs.some(([nr,nc])=>nr>=0&&nr<N&&nc>=0&&nc<N&&b[nr][nc]===player&&dfs(nr,nc))
    }
    if (player==='P') { for(let c=0;c<N;c++) if(b[0][c]==='P'&&dfs(0,c)) return true }
    else { for(let r=0;r<N;r++) if(b[r][0]==='AI'&&dfs(r,0)) return true }
    return false
  }

  function aiMove(b: HCell[][]): [number,number] {
    // Prefer center and connecting moves
    const empty: [number,number][] = []
    for(let r=0;r<N;r++) for(let c=0;c<N;c++) if(!b[r][c]) empty.push([r,c])
    // Try to win first
    for (const [r,c] of empty) { const nb=b.map(row=>[...row]) as HCell[][]; nb[r][c]='AI'; if(checkWin(nb,'AI')) return [r,c] }
    // Block player
    for (const [r,c] of empty) { const nb=b.map(row=>[...row]) as HCell[][]; nb[r][c]='P'; if(checkWin(nb,'P')) return [r,c] }
    // Center bias
    return empty.sort((a,b)=>Math.hypot(a[0]-N/2,a[1]-N/2)-Math.hypot(b[0]-N/2,b[1]-N/2))[Math.floor(Math.random()*Math.min(5,empty.length))]
  }

  function click(r: number, c: number) {
    if (board[r][c]||winner||turn!=='P') return
    const nb=board.map(row=>[...row]) as HCell[][]; nb[r][c]='P'
    if (checkWin(nb,'P')) { setBoard(nb); setWinner('P'); onEnd('win',150); return }
    setBoard(nb); setTurn('AI')
    setTimeout(()=>{
      const [ar,ac]=aiMove(nb); const nb2=nb.map(row=>[...row]) as HCell[][]; nb2[ar][ac]='AI'
      if (checkWin(nb2,'AI')) { setBoard(nb2); setWinner('AI'); onEnd('loss',0); return }
      setBoard(nb2); setTurn('P')
    },350)
  }

  const reset=()=>{setBoard(Array.from({length:N},()=>Array(N).fill(null)));setTurn('P');setWinner(null)}

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10,padding:10}}>
      <StatusBar items={[{label:winner?`${winner==='P'?'🎉 Você vence!':'💀 IA vence!'}`:(turn==='P'?'🔵 Sua vez (cima-baixo)':'🔴 IA (esq-dir)'),value:'',color:winner==='P'?'52,211,153':winner==='AI'?'248,113,113':'96,165,250'}]} />
      <div style={{display:'flex',gap:0,position:'relative'}}>
        <div style={{display:'flex',flexDirection:'column',gap:0}}>
          {board.map((row,r)=>(
            <div key={r} style={{display:'flex',marginLeft:r*14}}>
              {row.map((cell,c)=>(
                <div key={c} onClick={()=>click(r,c)}
                  style={{width:36,height:32,clipPath:'polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%)',background:cell==='P'?'#3b82f6':cell==='AI'?'#ef4444':'var(--card-bg)',margin:1,cursor:!cell&&!winner&&turn==='P'?'pointer':'default',transition:'background 0.15s',border:`1px solid ${!cell&&turn==='P'?'rgba(96,165,250,0.3)':'transparent'}`}}
                  onMouseEnter={e=>{if(!cell&&!winner&&turn==='P')(e.currentTarget as HTMLElement).style.background='rgba(96,165,250,0.2)'}}
                  onMouseLeave={e=>{if(!cell)(e.currentTarget as HTMLElement).style.background='var(--card-bg)'}}/>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{display:'flex',gap:14,fontSize:'0.65rem'}}>
        <span style={{color:'#3b82f6',fontWeight:700}}>🔵 Você: conecte topo→base</span>
        <span style={{color:'#ef4444',fontWeight:700}}>🔴 IA: conecte esq→dir</span>
      </div>
      <button onClick={reset} style={{padding:'5px 14px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer',fontSize:'0.72rem'}}>↺ Novo Jogo</button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ESTRATÉGIA 6 — XADREZ SIMPLIFICADO (Gardner Chess 5x5)
// ══════════════════════════════════════════════════════════════════════════════
type Piece = { type: 'K'|'Q'|'R'|'B'|'N'|'P'; color: 'w'|'b' }
type CBoard = (Piece|null)[][]

export function GameChess({ onEnd, bestScore: _bs }: GameProps) {
  const SYMBOLS: Record<string,string> = { wK:'♔',wQ:'♕',wR:'♖',wB:'♗',wN:'♘',wP:'♙', bK:'♚',bQ:'♛',bR:'♜',bB:'♝',bN:'♞',bP:'♟' }

  function initBoard(): CBoard {
    const b: CBoard = Array.from({length:8},()=>Array(8).fill(null))
    const back: Piece['type'][] = ['R','N','B','Q','K','B','N','R']
    back.forEach((t,c)=>{ b[0][c]={type:t,color:'b'}; b[7][c]={type:t,color:'w'} })
    for(let c=0;c<8;c++){b[1][c]={type:'P',color:'b'}; b[6][c]={type:'P',color:'w'}}
    return b
  }

  function getMoves(b: CBoard, r: number, c: number): [number,number][] {
    const p = b[r][c]; if (!p) return []
    const moves: [number,number][] = []
    const add=(nr:number,nc:number)=>{ if(nr>=0&&nr<8&&nc>=0&&nc<8&&b[nr][nc]?.color!==p.color) moves.push([nr,nc]) }
    const slide=(dr:number,dc:number)=>{ let nr=r+dr,nc=c+dc; while(nr>=0&&nr<8&&nc>=0&&nc<8){if(b[nr][nc]){if(b[nr][nc]!.color!==p.color)moves.push([nr,nc]);break}; moves.push([nr,nc]);nr+=dr;nc+=dc } }
    if(p.type==='P'){const dir=p.color==='w'?-1:1; if(!b[r+dir]?.[c])moves.push([r+dir,c]); if(p.color==='w'&&r===6&&!b[5][c]&&!b[4][c])moves.push([4,c]); if(p.color==='b'&&r===1&&!b[2][c]&&!b[3][c])moves.push([3,c]); if(b[r+dir]?.[c-1]?.color!==p.color&&b[r+dir]?.[c-1])moves.push([r+dir,c-1]); if(b[r+dir]?.[c+1]?.color!==p.color&&b[r+dir]?.[c+1])moves.push([r+dir,c+1]) }
    if(p.type==='N'){[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc])=>add(r+dr,c+dc))}
    if(p.type==='K'){[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc])=>add(r+dr,c+dc))}
    if(p.type==='R'||p.type==='Q'){[[0,1],[0,-1],[1,0],[-1,0]].forEach(([dr,dc])=>slide(dr,dc))}
    if(p.type==='B'||p.type==='Q'){[[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dr,dc])=>slide(dr,dc))}
    return moves
  }

  const [board, setBoard] = useState<CBoard>(initBoard)
  const [sel, setSel] = useState<[number,number]|null>(null)
  const [moves, setMoves] = useState<[number,number][]>([])
  const [turn, setTurn] = useState<'w'|'b'>('w')
  const [status, setStatus] = useState<'playing'|'win'|'loss'>('playing')
  const [captured, setCaptured] = useState<{w:Piece[],b:Piece[]}>({w:[],b:[]})

  function applyMove(b:CBoard,fr:number,fc:number,tr:number,tc:number):{board:CBoard;cap:Piece|null}{
    const nb=b.map(row=>row.map(c=>c?{...c}:null))
    const cap=nb[tr][tc]
    nb[tr][tc]=nb[fr][fc]; nb[fr][fc]=null
    // Promotion
    if(nb[tr][tc]?.type==='P'){if(nb[tr][tc]!.color==='w'&&tr===0)nb[tr][tc]={type:'Q',color:'w'}; if(nb[tr][tc]!.color==='b'&&tr===7)nb[tr][tc]={type:'Q',color:'b'}}
    return {board:nb,cap}
  }

  function allMoves(b:CBoard,color:'w'|'b'): [number,number,number,number][] {
    const m:[number,number,number,number][]=[]
    for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(b[r][c]?.color===color) getMoves(b,r,c).forEach(([tr,tc])=>m.push([r,c,tr,tc]))
    return m
  }

  function aiMove(b:CBoard){
    const ms=allMoves(b,'b'); if(!ms.length){setStatus('win');onEnd('win',200);return}
    // Minimax depth 2
    function eval2(b:CBoard,depth:number,maxi:boolean):number{
      if(depth===0){const vals:Record<string,number>={K:1000,Q:9,R:5,B:3,N:3,P:1}; return b.flat().reduce((s,p)=>s+(p?vals[p.type]*(p.color==='b'?1:-1):0),0)}
      const col:('w'|'b')=maxi?'b':'w'; const ms2=allMoves(b,col)
      if(!ms2.length) return maxi?-999:999
      let best=maxi?-9999:9999
      for(const [fr,fc,tr,tc] of ms2){const {board:nb}=applyMove(b,fr,fc,tr,tc);const v=eval2(nb,depth-1,!maxi);if(maxi?v>best:v<best)best=v}
      return best
    }
    let bestM=ms[0]; let bestV=-9999
    for(const [fr,fc,tr,tc] of ms){const {board:nb,cap}=applyMove(b,fr,fc,tr,tc);const v=eval2(nb,1,false)+(cap?{K:1000,Q:9,R:5,B:3,N:3,P:1}[cap.type]:0);if(v>bestV){bestV=v;bestM=[fr,fc,tr,tc]}}
    const [fr,fc,tr,tc]=bestM; const {board:nb,cap}=applyMove(board,fr,fc,tr,tc)
    if(cap?.type==='K'){setBoard(nb);setStatus('loss');onEnd('loss',0);return}
    setCaptured(p=>({...p,b:[...p.b,...(cap?[cap]:[])]}))
    setBoard(nb); setTurn('w')
  }

  function click(r:number,c:number){
    if(status!=='playing'||turn!=='w') return
    if(sel){
      if(moves.some(([mr,mc])=>mr===r&&mc===c)){
        const {board:nb,cap}=applyMove(board,sel[0],sel[1],r,c)
        if(cap?.type==='K'){setBoard(nb);setStatus('win');onEnd('win',200);return}
        setCaptured(p=>({...p,w:[...p.w,...(cap?[cap]:[])]}))
        setBoard(nb); setSel(null); setMoves([]); setTurn('b')
        setTimeout(()=>aiMove(nb),400)
        return
      }
      setSel(null); setMoves([])
    }
    if(board[r]?.[c]?.color==='w'){setSel([r,c]);setMoves(getMoves(board,r,c))}
  }

  const reset=()=>{setBoard(initBoard());setSel(null);setMoves([]);setTurn('w');setStatus('playing');setCaptured({w:[],b:[]})}

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,padding:8}}>
      <StatusBar items={[{label:status==='win'?'🎉 Xeque-mate!':status==='loss'?'💀 Derrota!':turn==='w'?'⬜ Sua vez (brancas)':'⬛ IA pensando',value:'',color:status==='win'?'52,211,153':status==='loss'?'248,113,113':'96,165,250'}]} />
      {/* Captured */}
      <div style={{display:'flex',gap:16,fontSize:'0.8rem'}}>
        <div style={{color:'var(--text-muted)'}}>Cap: {captured.w.map((p,i)=><span key={i}>{SYMBOLS[p.color+p.type]}</span>)}</div>
        <div style={{color:'var(--text-muted)'}}>Cap: {captured.b.map((p,i)=><span key={i}>{SYMBOLS[p.color+p.type]}</span>)}</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(8,1fr)',gap:0,border:'2px solid #334155',borderRadius:6,overflow:'hidden'}}>
        {board.map((row,r)=>row.map((piece,c)=>{
          const isDark=(r+c)%2===1
          const isSel=sel?.[0]===r&&sel?.[1]===c
          const isMove=moves.some(([mr,mc])=>mr===r&&mc===c)
          return(
            <div key={`${r}-${c}`} onClick={()=>click(r,c)}
              style={{width:52,height:52,background:isSel?'rgba(251,191,36,0.4)':isMove?(isDark?'rgba(96,165,250,0.4)':'rgba(96,165,250,0.25)'):isDark?'#b45309':'#fef3c7',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',position:'relative',transition:'background 0.1s'}}>
              {isMove&&!piece&&<div style={{width:16,height:16,borderRadius:'50%',background:'rgba(96,165,250,0.5)',border:'2px solid rgba(96,165,250,0.7)'}}/>}
              {isMove&&piece&&<div style={{position:'absolute',inset:0,border:'3px solid rgba(96,165,250,0.8)',borderRadius:0}}/>}
              {piece&&<span style={{fontSize:'1.8rem',filter:'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',userSelect:'none'}}>{SYMBOLS[piece.color+piece.type]}</span>}
            </div>
          )
        }))}
      </div>
      <button onClick={reset} style={{padding:'5px 14px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer',fontSize:'0.72rem'}}>↺ Novo Jogo</button>
      <div style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>Você = brancas (baixo) · IA = pretas (cima)</div>
    </div>
  )
}
