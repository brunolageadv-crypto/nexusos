import { useState, useEffect, useCallback, useRef } from 'react'
import type { GameProps } from './Arcade'

function SBar({ items }: { items: { l: string; v: string | number; c: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 6 }}>
      {items.map(it => (
        <span key={it.l} style={{ padding: '4px 11px', borderRadius: 8, background: `rgba(${it.c},0.1)`, border: `1px solid rgba(${it.c},0.3)`, fontSize: '0.72rem', fontWeight: 700, color: `rgb(${it.c})` }}>
          {it.l}{it.v !== '' ? ': ' + it.v : ''}
        </span>
      ))}
    </div>
  )
}
function RBtn({ onClick, label = '↺ Novo', color = '#60a5fa' }: { onClick: () => void; label?: string; color?: string }) {
  return <button onClick={onClick} style={{ padding: '7px 18px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg,${color},${color}88)`, color: '#fff', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' }}>{label}</button>
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. REFLEXO VISUAL
// ══════════════════════════════════════════════════════════════════════════════
export function GameVisualReflex({ onEnd, bestScore }: GameProps) {
  type Phase = 'wait' | 'ready' | 'show' | 'input' | 'result' | 'done'
  const COLORS = ['#f87171', '#34d399', '#60a5fa', '#fbbf24', '#a78bfa', '#f472b6']
  const SHAPES = ['●', '■', '▲', '◆']
  const [phase, setPhase] = useState<Phase>('wait')
  const [stimulus, setStimulus] = useState<{ color: string; shape: string } | null>(null)
  const [target, setTarget] = useState<{ color: string; shape: string } | null>(null)
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [rt, setRt] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [wrong, setWrong] = useState(0)
  const showTime = useRef(0)
  const ROUNDS = 12

  function nextRound(r: number) {
    const tColor = COLORS[Math.floor(Math.random() * COLORS.length)]
    const tShape = SHAPES[Math.floor(Math.random() * SHAPES.length)]
    setTarget({ color: tColor, shape: tShape })
    setStimulus(null); setPhase('ready')
    setTimeout(() => {
      // 60% match, 40% different
      const isMatch = Math.random() < 0.6
      const sColor = isMatch ? tColor : COLORS.filter(c => c !== tColor)[Math.floor(Math.random() * (COLORS.length - 1))]
      const sShape = isMatch ? tShape : SHAPES.filter(s => s !== tShape)[Math.floor(Math.random() * (SHAPES.length - 1))]
      setStimulus({ color: sColor, shape: sShape })
      showTime.current = Date.now()
      setPhase('show')
    }, 600 + Math.random() * 900)
  }

  function answer(match: boolean) {
    if (phase !== 'show' || !stimulus || !target) return
    const elapsed = Date.now() - showTime.current
    const isMatch = stimulus.color === target.color && stimulus.shape === target.shape
    const ok = match === isMatch
    const pts = ok ? Math.max(0, Math.round(500 - elapsed * 0.4)) : 0
    setRt(elapsed); setPhase('result')
    if (ok) setCorrect(c => c + 1); else setWrong(w => w + 1)
    setScore(s => s + pts)
    const nr = round + 1; setRound(nr)
    if (nr >= ROUNDS) { setTimeout(() => { setPhase('done'); onEnd(pts > 0 ? 'win' : 'play', score + pts) }, 700) }
    else setTimeout(() => nextRound(nr), 700)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 16 }}>
      <SBar items={[
        { l: 'Score', v: score, c: '96,165,250' },
        { l: '✓', v: correct, c: '52,211,153' },
        { l: '✗', v: wrong, c: '248,113,113' },
        { l: `${round}/${ROUNDS}`, v: '', c: '251,191,36' },
        { l: 'Recorde', v: Math.max(score, bestScore), c: '167,139,250' },
      ]} />

      {/* Target */}
      <div style={{ padding: '12px 24px', borderRadius: 14, background: 'var(--card-bg)', border: '1px solid var(--border-md)', textAlign: 'center' }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Alvo</div>
        {target ? (
          <span style={{ fontSize: '2.5rem', color: target.color }}>{target.shape}</span>
        ) : (
          <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>—</span>
        )}
      </div>

      {/* Stimulus */}
      <div style={{ width: 160, height: 130, borderRadius: 18, border: `3px solid ${phase === 'show' ? stimulus?.color || 'var(--border)' : 'var(--border-md)'}`, background: phase === 'show' ? `${stimulus?.color}18` : 'var(--card-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', boxShadow: phase === 'show' ? `0 0 28px ${stimulus?.color}40` : 'none' }}>
        {phase === 'ready' && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Prepare-se…</span>}
        {phase === 'show' && stimulus && <span style={{ fontSize: '5rem', color: stimulus.color, lineHeight: 1 }}>{stimulus.shape}</span>}
        {phase === 'result' && <span style={{ fontSize: '1.2rem' }}>{rt < 300 ? '⚡' : rt < 500 ? '✅' : '🐢'} {rt}ms</span>}
        {phase === 'wait' && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Clique em Iniciar</span>}
        {phase === 'done' && <div style={{ textAlign: 'center' }}><div style={{ fontWeight: 800, color: '#34d399' }}>Fim!</div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Precisão: {Math.round((correct / ROUNDS) * 100)}%</div></div>}
      </div>

      {phase === 'show' && (
        <div style={{ display: 'flex', gap: 14 }}>
          <button onClick={() => answer(true)} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#34d399,#10b981)', color: '#fff', fontWeight: 900, fontSize: '0.95rem', cursor: 'pointer' }}>✓ Igual</button>
          <button onClick={() => answer(false)} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#f87171,#ef4444)', color: '#fff', fontWeight: 900, fontSize: '0.95rem', cursor: 'pointer' }}>✗ Diferente</button>
        </div>
      )}
      {phase === 'wait' && <RBtn onClick={() => { setRound(0); setScore(0); setCorrect(0); setWrong(0); nextRound(0) }} label="▶ Iniciar" color="#a78bfa" />}
      {phase === 'done' && <RBtn onClick={() => { setPhase('wait'); setRound(0); setScore(0); setCorrect(0); setWrong(0); setTarget(null); setStimulus(null) }} color="#60a5fa" />}
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textAlign: 'center' }}>Cor E forma iguais ao alvo? · Reaja rápido para mais pontos</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. ANAGRAMA
// ══════════════════════════════════════════════════════════════════════════════
const ANAGRAM_WORDS = ['CONSTITUIÇÃO','ADVOCACIA','PROCESSO','RECURSO','SENTENÇA','DECRETO','PORTARIA','TRIBUNAL','SUPREMO','LIMINAR','TUTELA','AGRAVO','EMBARGOS','PRECATÓRIO','MANDATO','PARECER','HABEAS','LICITAÇÃO','IMPROBIDADE','SERVIDOR','MINISTÉRIO','REGULAMENTO','ACÓRDÃO','CONCURSO']

export function GameAnagram({ onEnd, bestScore }: GameProps) {
  function cleanWord(w: string) { return w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() }
  function shuffle(s: string) { const a = s.split(''); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a.join('') }

  const [idx, setIdx] = useState(0)
  const [word] = useState(() => ANAGRAM_WORDS.map(w => ({ original: w, clean: cleanWord(w) })))
  const [scrambled, setScrambled] = useState(() => { const w = cleanWord(ANAGRAM_WORDS[0]); let s = w; while (s === w) s = shuffle(w); return s })
  const [input, setInput] = useState('')
  const [score, setScore] = useState(0)
  const [feedback, setFeedback] = useState<'ok' | 'err' | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [timer, setTimer] = useState(60)
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!started || done) return
    const i = setInterval(() => setTimer(t => { if (t <= 1) { clearInterval(i); setDone(true); onEnd('play', score); return 0 } return t - 1 }), 1000)
    return () => clearInterval(i)
  }, [started, done, score, onEnd])

  function advance() {
    const ni = (idx + 1) % word.length
    setIdx(ni); setInput(''); setFeedback(null)
    const w = word[ni].clean; let s = w; while (s === w) s = shuffle(w); setScrambled(s)
  }

  function submit() {
    if (!input.trim() || done) return
    const ok = cleanWord(input) === word[idx].clean
    setFeedback(ok ? 'ok' : 'err')
    if (ok) { const ns = score + Math.max(10, Math.ceil(timer / 3)); setScore(ns); setTimeout(advance, 500) }
    else setTimeout(() => setFeedback(null), 600)
  }

  function skip() { setSkipped(s => s + 1); advance() }

  const cur = word[idx]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 16 }}>
      <SBar items={[
        { l: 'Score', v: score, c: '96,165,250' },
        { l: '⏱', v: timer + 's', c: timer < 15 ? '248,113,113' : '251,191,36' },
        { l: 'Pulou', v: skipped, c: '148,163,184' },
        { l: 'Recorde', v: Math.max(score, bestScore), c: '52,211,153' },
      ]} />

      {!started ? (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: '2rem', marginBottom: 10 }}>🔀</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>Reorganize as letras para formar a palavra jurídica original</div>
          <RBtn onClick={() => setStarted(true)} label="▶ Iniciar (60s)" color="#f472b6" />
        </div>
      ) : done ? (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#34d399', marginBottom: 8 }}>⏱ Fim do tempo!</div>
          <div style={{ color: 'var(--text-secondary)' }}>Score: {score}</div>
          <div style={{ marginTop: 14 }}><RBtn onClick={() => { setIdx(0); setScore(0); setSkipped(0); setTimer(60); setDone(false); setInput(''); setFeedback(null); const w = word[0].clean; let s = w; while (s === w) s = shuffle(w); setScrambled(s) }} /></div>
        </div>
      ) : (
        <>
          {/* Hint: original word (blurred) */}
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {cur.original.length} letras — Tema: Direito Público
          </div>

          {/* Scrambled */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', padding: '14px 18px', borderRadius: 14, background: 'rgba(244,114,182,0.07)', border: '1px solid rgba(244,114,182,0.25)' }}>
            {scrambled.split('').map((l, i) => (
              <div key={i} style={{ width: 36, height: 42, borderRadius: 8, background: 'var(--card-bg)', border: '2px solid rgba(244,114,182,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontWeight: 900, fontSize: '1.1rem', color: '#f472b6' }}>{l}</div>
            ))}
          </div>

          <input value={input} onChange={e => setInput(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && submit()}
            autoFocus placeholder="Digite a palavra..."
            style={{ padding: '10px 16px', borderRadius: 10, border: `2px solid ${feedback === 'ok' ? 'rgba(52,211,153,0.5)' : feedback === 'err' ? 'rgba(248,113,113,0.5)' : 'var(--border-md)'}`, background: feedback === 'ok' ? 'rgba(52,211,153,0.07)' : feedback === 'err' ? 'rgba(248,113,113,0.07)' : 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 700, textAlign: 'center', outline: 'none', width: 260, letterSpacing: '0.08em', transition: 'all 0.2s' }} />

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={submit} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#f472b6,#ec4899)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>✓ Confirmar</button>
            <button onClick={skip} style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>Pular →</button>
          </div>
          {feedback === 'err' && <div style={{ fontSize: '0.75rem', color: '#f87171' }}>❌ Tente de novo!</div>}
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. PALAVRA OCULTA (Wordle-style)
// ══════════════════════════════════════════════════════════════════════════════
const WORDLE_WORDS = ['PRAZO','NORMA','CARGO','JUIZO','TEXTO','MULTA','CRIME','PROVA','PARTE','CAUSA','PENAS','BANCA','EDITA','FORUM','GREVE','HONRA','JURAR','LICAO','MEDIA','NURFA','OUSAS','POSSE','QUOTA','RECURSO'.slice(0,5),'SAFER','TUTEA','ULTRA','VALOR','XEROX','ZELAR'].filter(w=>w.length===5)

export function GameHiddenWord({ onEnd, bestScore }: GameProps) {
  const [secret] = useState(() => WORDLE_WORDS[Math.floor(Math.random() * WORDLE_WORDS.length)])
  const [guesses, setGuesses] = useState<string[]>([])
  const [current, setCurrent] = useState('')
  const [won, setWon] = useState(false)
  const [lost, setLost] = useState(false)
  const MAX = 6

  function evaluate(guess: string): ('correct' | 'present' | 'absent')[] {
    const res: ('correct' | 'present' | 'absent')[] = Array(5).fill('absent')
    const remaining = secret.split('')
    for (let i = 0; i < 5; i++) if (guess[i] === secret[i]) { res[i] = 'correct'; remaining[i] = '' }
    for (let i = 0; i < 5; i++) if (res[i] !== 'correct') { const j = remaining.indexOf(guess[i]); if (j >= 0) { res[i] = 'present'; remaining[j] = '' } }
    return res
  }

  function submit() {
    if (current.length !== 5 || won || lost) return
    const ng = [...guesses, current]; setGuesses(ng); setCurrent('')
    if (current === secret) { setWon(true); onEnd('win', Math.max(0, (MAX - ng.length + 1) * 80)); return }
    if (ng.length >= MAX) { setLost(true); onEnd('loss', 0) }
  }

  const COLORS = { correct: '#34d399', present: '#fbbf24', absent: 'var(--border-md)' }
  const TEXT = { correct: '#fff', present: '#fff', absent: 'var(--text-muted)' }
  const letters = 'QWERTYUIOP ASDFGHJKL ZXCVBNM'.split(' ')
  const usedLetters = new Map<string, 'correct' | 'present' | 'absent'>()
  guesses.forEach(g => evaluate(g).forEach((r, i) => {
    const l = g[i]; const cur = usedLetters.get(l)
    if (cur !== 'correct') usedLetters.set(l, cur === 'present' ? 'present' : r)
  }))

  function restart() {
    window.location.reload() // simple restart since word is in useState init
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 12 }}>
      <SBar items={[
        { l: `Tentativas`, v: `${guesses.length}/${MAX}`, c: '96,165,250' },
        { l: won ? '🎉 Acertou!' : lost ? `💀 Era: ${secret}` : '🎯 Adivinhe', v: '', c: won ? '52,211,153' : lost ? '248,113,113' : '167,139,250' },
        { l: 'Recorde', v: Math.max(0, bestScore), c: '251,191,36' },
      ]} />

      {/* Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {Array.from({ length: MAX }, (_, row) => {
          const guess = guesses[row] || ''
          const isActive = row === guesses.length && !won && !lost
          const results = guess ? evaluate(guess) : null
          return (
            <div key={row} style={{ display: 'flex', gap: 5 }}>
              {Array.from({ length: 5 }, (_, col) => {
                const letter = isActive ? current[col] || '' : guess[col] || ''
                const res = results?.[col]
                return (
                  <div key={col} style={{ width: 52, height: 52, borderRadius: 10, border: `2px solid ${res ? COLORS[res] : isActive && current[col] ? 'rgba(96,165,250,0.6)' : 'var(--border-md)'}`, background: res ? COLORS[res] : 'var(--card-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontWeight: 900, fontSize: '1.3rem', color: res ? TEXT[res] : 'var(--text-primary)', transition: 'all 0.2s' }}>
                    {letter}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Keyboard */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {letters.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {ri === 2 && <button onClick={submit} style={{ padding: '8px 10px', borderRadius: 7, border: 'none', background: 'rgba(52,211,153,0.2)', color: '#34d399', fontWeight: 800, fontSize: '0.65rem', cursor: 'pointer' }}>↵</button>}
            {row.split('').map(l => {
              const state = usedLetters.get(l)
              return (
                <button key={l} onClick={() => { if (!won && !lost && current.length < 5) setCurrent(c => c + l) }}
                  style={{ width: 30, height: 36, borderRadius: 6, border: 'none', background: state ? COLORS[state] : 'var(--card-bg)', color: state ? TEXT[state] : 'var(--text-primary)', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>
                  {l}
                </button>
              )
            })}
            {ri === 2 && <button onClick={() => setCurrent(c => c.slice(0, -1))} style={{ padding: '8px 10px', borderRadius: 7, border: 'none', background: 'rgba(248,113,113,0.15)', color: '#f87171', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>⌫</button>}
          </div>
        ))}
      </div>
      {(won || lost) && <RBtn onClick={restart} color={won ? '#34d399' : '#f87171'} />}
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>🟩 Letra certa no lugar · 🟨 Letra certa fora do lugar · ⬜ Ausente</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. EQUAÇÕES
// ══════════════════════════════════════════════════════════════════════════════
export function GameEquations({ onEnd, bestScore }: GameProps) {
  type EqType = 'linear' | 'quadratic' | 'system'
  function genEq(): { display: string; answer: number; hint: string } {
    const type: EqType = ['linear', 'linear', 'quadratic', 'system'][Math.floor(Math.random() * 4)] as EqType
    if (type === 'linear') {
      const a = Math.floor(Math.random() * 8) + 2, x = Math.floor(Math.random() * 20) - 10, b = Math.floor(Math.random() * 15) - 7, c = a * x + b
      return { display: `${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)} = ${c}`, answer: x, hint: `x = (${c} - (${b})) / ${a}` }
    }
    if (type === 'quadratic') {
      const r1 = Math.floor(Math.random() * 7) - 3, r2 = Math.floor(Math.random() * 7) - 3
      const b = -(r1 + r2), c2 = r1 * r2
      return { display: `x² ${b >= 0 ? '+' : '-'} ${Math.abs(b)}x ${c2 >= 0 ? '+' : '-'} ${Math.abs(c2)} = 0`, answer: Math.max(r1, r2), hint: `Raízes: ${r1} e ${r2} (maior)` }
    }
    // system: ax+by=c, dx+ey=f
    const x = Math.floor(Math.random() * 6) - 3, y = Math.floor(Math.random() * 6) - 3
    const a = Math.floor(Math.random() * 3) + 1, b2 = Math.floor(Math.random() * 3) + 1
    return { display: `${a}x + ${b2}y = ${a * x + b2 * y}\n2x - y = ${2 * x - y}`, answer: x, hint: `x = ${x}, y = ${y} (responda x)` }
  }

  const [q, setQ] = useState(genEq)
  const [input, setInput] = useState('')
  const [score, setScore] = useState(0)
  const [round, setRound] = useState(1)
  const [feedback, setFeedback] = useState<'ok' | 'err' | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [done, setDone] = useState(false)
  const TOTAL = 8

  function submit() {
    if (!input.trim() || done) return
    const ok = parseInt(input) === q.answer
    setFeedback(ok ? 'ok' : 'err')
    setTimeout(() => {
      setFeedback(null); setInput(''); setShowHint(false)
      const nr = round + 1; setScore(s => s + (ok ? 15 : 0))
      if (nr > TOTAL) { setDone(true); onEnd(score >= 80 ? 'win' : 'play', score); return }
      setRound(nr); setQ(genEq())
    }, 800)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 20 }}>
      <SBar items={[
        { l: 'Score', v: score, c: '96,165,250' },
        { l: `${round}/${TOTAL}`, v: '', c: '251,191,36' },
        { l: 'Recorde', v: Math.max(score, bestScore), c: '52,211,153' },
      ]} />

      <div style={{ padding: '24px 32px', borderRadius: 16, background: `rgba(${feedback === 'ok' ? '52,211,153' : feedback === 'err' ? '248,113,113' : '96,165,250'},0.06)`, border: `2px solid rgba(${feedback === 'ok' ? '52,211,153' : feedback === 'err' ? '248,113,113' : '96,165,250'},0.2)`, width: '100%', maxWidth: 340, textAlign: 'center', transition: 'all 0.2s' }}>
        <pre style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1.3rem', color: 'var(--text-primary)', margin: 0, whiteSpace: 'pre-wrap' }}>{q.display}</pre>
        {showHint && <div style={{ marginTop: 10, fontSize: '0.72rem', color: '#fbbf24', fontFamily: 'monospace' }}>💡 {q.hint}</div>}
      </div>

      <input type="number" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
        autoFocus placeholder="Resposta..."
        style={{ padding: '10px 16px', borderRadius: 10, border: '2px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 800, textAlign: 'center', outline: 'none', width: 160 }} />

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={submit} disabled={!input.trim() || done} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: input.trim() ? 'linear-gradient(135deg,#60a5fa,#1A73E8)' : 'rgba(255,255,255,0.06)', color: '#fff', fontWeight: 800, cursor: input.trim() ? 'pointer' : 'not-allowed' }}>✓ Confirmar</button>
        <button onClick={() => setShowHint(h => !h)} style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.06)', color: '#fbbf24', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>💡</button>
      </div>
      {done && <div style={{ color: '#34d399', fontWeight: 800 }}>🎉 Resultado: {score}/{TOTAL * 15}</div>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. SEQUÊNCIAS NUMÉRICAS (diferente do logic_seq — foco em velocidade)
// ══════════════════════════════════════════════════════════════════════════════
export function GameNumSeq({ onEnd, bestScore }: GameProps) {
  function gen() {
    const start = Math.floor(Math.random() * 20) + 1
    const diff = Math.floor(Math.random() * 10) + 2
    const len = 5 + Math.floor(Math.random() * 3)
    const seq = Array.from({ length: len }, (_, i) => start + diff * i)
    return { seq, answer: seq[len - 1] + diff, diff, display: [...seq.slice(0, -1), '?'] }
  }
  const [q, setQ] = useState(gen)
  const [input, setInput] = useState('')
  const [score, setScore] = useState(0)
  const [round, setRound] = useState(1)
  const [streak, setStreak] = useState(0)
  const [feedback, setFeedback] = useState<'ok' | 'err' | null>(null)
  const [done, setDone] = useState(false)
  const TOTAL = 10

  function submit() {
    if (!input.trim() || done) return
    const ok = parseInt(input) === q.answer
    const ns = score + (ok ? 10 + streak * 2 : 0)
    setFeedback(ok ? 'ok' : 'err'); setScore(ns); if (ok) setStreak(s => s + 1); else setStreak(0)
    setTimeout(() => {
      setFeedback(null); setInput('')
      const nr = round + 1
      if (nr > TOTAL) { setDone(true); onEnd(ns >= 70 ? 'win' : 'play', ns); return }
      setRound(nr); setQ(gen())
    }, 600)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 20 }}>
      <SBar items={[
        { l: 'Score', v: score, c: '96,165,250' },
        { l: `${round}/${TOTAL}`, v: '', c: '251,191,36' },
        { l: streak > 1 ? `🔥 x${streak}` : 'Combo', v: streak > 1 ? '' : 0, c: '251,146,60' },
        { l: 'Recorde', v: Math.max(score, bestScore), c: '52,211,153' },
      ]} />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', padding: '20px 24px', borderRadius: 16, background: `rgba(${feedback === 'ok' ? '52,211,153' : feedback === 'err' ? '248,113,113' : '96,165,250'},0.06)`, border: `2px solid rgba(${feedback === 'ok' ? '52,211,153' : feedback === 'err' ? '248,113,113' : '96,165,250'},0.2)`, transition: 'all 0.2s' }}>
        {q.display.map((v, i) => (
          <div key={i} style={{ padding: '10px 14px', borderRadius: 10, background: v === '?' ? 'rgba(96,165,250,0.15)' : 'var(--card-bg)', border: `2px solid ${v === '?' ? '#60a5fa' : 'var(--border)'}`, fontFamily: 'monospace', fontWeight: 900, fontSize: '1.1rem', color: v === '?' ? '#60a5fa' : 'var(--text-primary)', minWidth: 44, textAlign: 'center' }}>
            {v}
          </div>
        ))}
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: 4 }}>= ?</span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input type="number" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} autoFocus
          style={{ padding: '10px 16px', borderRadius: 10, border: '2px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 800, textAlign: 'center', outline: 'none', width: 130 }} />
        <button onClick={submit} disabled={!input.trim() || done} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#60a5fa,#1A73E8)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>✓</button>
      </div>
      {feedback === 'err' && <div style={{ color: '#f87171', fontSize: '0.8rem' }}>❌ Era: {q.answer} (diferença: +{q.diff})</div>}
      {done && <div style={{ color: '#34d399', fontWeight: 800 }}>🎉 {score}/{TOTAL * 10} pontos</div>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. OPERAÇÕES RÁPIDAS
// ══════════════════════════════════════════════════════════════════════════════
export function GameFastOps({ onEnd, bestScore }: GameProps) {
  function gen() {
    const ops = ['+', '-', '×', '÷'] as const
    const op = ops[Math.floor(Math.random() * 4)]
    let a = Math.floor(Math.random() * 25) + 1, b = Math.floor(Math.random() * 15) + 1, ans: number
    if (op === '÷') { b = Math.floor(Math.random() * 9) + 1; a = b * (Math.floor(Math.random() * 10) + 1); ans = a / b }
    else if (op === '×') { a = Math.floor(Math.random() * 12) + 1; b = Math.floor(Math.random() * 12) + 1; ans = a * b }
    else if (op === '+') ans = a + b
    else { if (a < b) [a, b] = [b, a]; ans = a - b }
    return { a, b, op, ans }
  }

  const [q, setQ] = useState(gen)
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(45)
  const [answers, setAnswers] = useState(0)
  const [correct2, setCorrect2] = useState(0)
  const [input, setInput] = useState('')
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)
  const [flash, setFlash] = useState<'ok' | 'err' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!started || done) return
    const i = setInterval(() => setTimeLeft(t => {
      if (t <= 1) { clearInterval(i); setDone(true); onEnd('play', score); return 0 }
      return t - 1
    }), 1000)
    return () => clearInterval(i)
  }, [started, done, score, onEnd])

  function submit(val?: string) {
    const v = val ?? input
    if (!v.trim() || done) return
    const ok = parseInt(v) === q.ans
    setFlash(ok ? 'ok' : 'err'); setAnswers(a => a + 1)
    if (ok) { setCorrect2(c => c + 1); setScore(s => s + 5) }
    setTimeout(() => { setFlash(null); setInput(''); setQ(gen()); inputRef.current?.focus() }, 250)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 20 }}>
      <SBar items={[
        { l: 'Score', v: score, c: '96,165,250' },
        { l: '⏱', v: timeLeft + 's', c: timeLeft < 10 ? '248,113,113' : '251,191,36' },
        { l: `${correct2}/${answers}`, v: '', c: '52,211,153' },
        { l: 'Recorde', v: Math.max(score, bestScore), c: '167,139,250' },
      ]} />

      {!started ? (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: '2rem', marginBottom: 10 }}>⚡</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 16 }}>Resolva o máximo de contas em 45 segundos</div>
          <RBtn onClick={() => { setStarted(true); setTimeout(() => inputRef.current?.focus(), 100) }} label="▶ Iniciar" color="#fbbf24" />
        </div>
      ) : done ? (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontWeight: 800, color: '#34d399', fontSize: '1.1rem' }}>⏱ Fim!</div>
          <div style={{ color: 'var(--text-secondary)' }}>{correct2} corretas · Score: {score}</div>
          <div style={{ marginTop: 14 }}><RBtn onClick={() => { setScore(0); setTimeLeft(45); setAnswers(0); setCorrect2(0); setInput(''); setDone(false); setStarted(false); setQ(gen()) }} /></div>
        </div>
      ) : (
        <>
          <div style={{ padding: '28px 40px', borderRadius: 18, background: `rgba(${flash === 'ok' ? '52,211,153' : flash === 'err' ? '248,113,113' : '251,191,36'},0.07)`, border: `3px solid rgba(${flash === 'ok' ? '52,211,153' : flash === 'err' ? '248,113,113' : '251,191,36'},0.25)`, textAlign: 'center', transition: 'all 0.15s' }}>
            <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '2rem', color: 'var(--text-primary)' }}>{q.a} {q.op} {q.b} = ?</div>
          </div>
          <input ref={inputRef} type="number" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }}
            style={{ padding: '12px 20px', borderRadius: 12, border: '2px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '1.4rem', fontWeight: 900, textAlign: 'center', outline: 'none', width: 180 }} />
          <div style={{ height: 6, width: 280, borderRadius: 3, background: 'var(--border-md)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(timeLeft / 45) * 100}%`, background: timeLeft < 10 ? '#f87171' : '#fbbf24', borderRadius: 3, transition: 'width 1s linear' }} />
          </div>
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. CÓDIGO SECRETO (Binary / logical guessing game)
// ══════════════════════════════════════════════════════════════════════════════
export function GameSecretCode({ onEnd, bestScore }: GameProps) {
  const LEN = 4
  function genCode() { return Array.from({ length: LEN }, () => Math.floor(Math.random() * 10)) }
  function evaluate(guess: number[], secret: number[]): { exact: number; partial: number } {
    let exact = 0, partial = 0
    const sg = [...secret], gg = [...guess]
    for (let i = 0; i < LEN; i++) if (gg[i] === sg[i]) { exact++; sg[i] = -1; gg[i] = -2 }
    for (let i = 0; i < LEN; i++) if (gg[i] !== -2) { const j = sg.indexOf(gg[i]); if (j >= 0) { partial++; sg[j] = -1 } }
    return { exact, partial }
  }

  const [secret] = useState(genCode)
  const [guesses, setGuesses] = useState<{ guess: number[]; exact: number; partial: number }[]>([])
  const [current, setCurrent] = useState<number[]>([])
  const [won, setWon] = useState(false)
  const [lost, setLost] = useState(false)
  const MAX = 8

  function submit() {
    if (current.length !== LEN || won || lost) return
    const { exact, partial } = evaluate(current, secret)
    const ng = [...guesses, { guess: current, exact, partial }]
    setGuesses(ng); setCurrent([])
    if (exact === LEN) { setWon(true); onEnd('win', Math.max(0, 500 - ng.length * 50)); return }
    if (ng.length >= MAX) { setLost(true); onEnd('loss', 0) }
  }

  function reset() { window.location.reload() }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 12 }}>
      <SBar items={[
        { l: `${guesses.length}/${MAX} tentativas`, v: '', c: '96,165,250' },
        { l: won ? '🎉 Descobriu!' : lost ? `💀 Era ${secret.join('')}` : '🔐 Adivinhe', v: '', c: won ? '52,211,153' : lost ? '248,113,113' : '167,139,250' },
        { l: 'Recorde', v: Math.max(0, bestScore), c: '251,191,36' },
      ]} />

      {/* History */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%', maxWidth: 360 }}>
        {guesses.map((g, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', width: 18, fontFamily: 'monospace' }}>{i + 1}.</span>
            <div style={{ display: 'flex', gap: 6, flex: 1 }}>
              {g.guess.map((n, j) => (
                <div key={j} style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--bg-hover)', border: '1px solid var(--border-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>{n}</div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, fontSize: '0.72rem', fontWeight: 700 }}>
              <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>⬛{g.exact}</span>
              <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>⬜{g.partial}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Current guess */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderRadius: 12, background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)' }}>
        {Array.from({ length: LEN }, (_, i) => (
          <div key={i} style={{ width: 44, height: 44, borderRadius: 10, border: `2px solid ${current[i] !== undefined ? 'rgba(96,165,250,0.5)' : 'var(--border-md)'}`, background: 'var(--card-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontWeight: 900, fontSize: '1.3rem', color: '#60a5fa' }}>
            {current[i] ?? ''}
          </div>
        ))}
      </div>

      {/* Numpad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
          <button key={n} onClick={() => { if (current.length < LEN && !won && !lost) setCurrent(c => [...c, n]) }}
            style={{ width: 42, height: 42, borderRadius: 9, border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontWeight: 800, fontSize: '1rem', cursor: 'pointer' }}>{n}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setCurrent(c => c.slice(0, -1))} style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: '#f87171', cursor: 'pointer', fontSize: '0.8rem' }}>⌫</button>
        <button onClick={submit} disabled={current.length !== LEN || won || lost} style={{ padding: '7px 20px', borderRadius: 9, border: 'none', background: current.length === LEN && !won && !lost ? 'linear-gradient(135deg,#60a5fa,#1A73E8)' : 'rgba(255,255,255,0.06)', color: '#fff', fontWeight: 800, cursor: current.length === LEN ? 'pointer' : 'not-allowed' }}>✓ Confirmar</button>
        {(won || lost) && <RBtn onClick={reset} color={won ? '#34d399' : '#f87171'} />}
      </div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>⬛ = dígito correto no lugar · ⬜ = dígito certo fora do lugar</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 8. COLOR MATCH
// ══════════════════════════════════════════════════════════════════════════════
export function GameColorMatch({ onEnd, bestScore }: GameProps) {
  const COLORS_CM = [
    { name: 'VERMELHO', hex: '#ef4444' }, { name: 'AZUL', hex: '#3b82f6' },
    { name: 'VERDE', hex: '#22c55e' }, { name: 'AMARELO', hex: '#eab308' },
    { name: 'ROXO', hex: '#8b5cf6' }, { name: 'LARANJA', hex: '#f97316' },
  ]
  function gen() {
    const word = COLORS_CM[Math.floor(Math.random() * COLORS_CM.length)]
    const ink = COLORS_CM[Math.floor(Math.random() * COLORS_CM.length)]
    const match = Math.random() < 0.5
    const displayInk = match ? word : ink
    return { word, displayInk, match }
  }
  const [q, setQ] = useState(gen)
  const [score, setScore] = useState(0)
  const [round, setRound] = useState(1)
  const [rt, setRt] = useState(0)
  const [feedback, setFeedback] = useState<'ok' | 'err' | null>(null)
  const [done, setDone] = useState(false)
  const showTime = useRef(Date.now())
  const TOTAL = 15

  useEffect(() => { showTime.current = Date.now() }, [q])

  function answer(match: boolean) {
    if (done || feedback) return
    const elapsed = Date.now() - showTime.current
    const ok = match === q.match
    const pts = ok ? Math.max(5, Math.round(200 - elapsed * 0.3)) : 0
    setRt(elapsed); setFeedback(ok ? 'ok' : 'err'); setScore(s => s + pts)
    const nr = round + 1
    setTimeout(() => {
      setFeedback(null)
      if (nr > TOTAL) { setDone(true); onEnd(score + pts >= 1500 ? 'win' : 'play', score + pts); return }
      setRound(nr); setQ(gen())
    }, 450)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 20 }}>
      <SBar items={[
        { l: 'Score', v: score, c: '96,165,250' },
        { l: `${round}/${TOTAL}`, v: '', c: '251,191,36' },
        { l: rt > 0 ? rt + 'ms' : '—', v: '', c: '52,211,153' },
        { l: 'Recorde', v: Math.max(score, bestScore), c: '167,139,250' },
      ]} />

      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: 280 }}>
        A cor da <strong>tinta</strong> da palavra bate com o <strong>significado</strong>?
      </div>

      <div style={{ padding: '30px 50px', borderRadius: 20, background: `rgba(${feedback === 'ok' ? '52,211,153' : feedback === 'err' ? '248,113,113' : '255,255,255'},0.05)`, border: `3px solid rgba(${feedback === 'ok' ? '52,211,153' : feedback === 'err' ? '248,113,113' : '255,255,255'},0.1)`, transition: 'all 0.15s' }}>
        <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '2.2rem', color: q.displayInk.hex, textShadow: `0 0 20px ${q.displayInk.hex}40`, userSelect: 'none' }}>
          {q.word.name}
        </div>
      </div>

      {!done ? (
        <div style={{ display: 'flex', gap: 14 }}>
          <button onClick={() => answer(true)} style={{ padding: '12px 30px', borderRadius: 13, border: 'none', background: 'linear-gradient(135deg,#34d399,#10b981)', color: '#fff', fontWeight: 900, fontSize: '1rem', cursor: 'pointer' }}>✓ Sim</button>
          <button onClick={() => answer(false)} style={{ padding: '12px 30px', borderRadius: 13, border: 'none', background: 'linear-gradient(135deg,#f87171,#ef4444)', color: '#fff', fontWeight: 900, fontSize: '1rem', cursor: 'pointer' }}>✗ Não</button>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 800, color: '#34d399', marginBottom: 10 }}>🎉 Score: {score}</div>
          <RBtn onClick={() => { setScore(0); setRound(1); setRt(0); setFeedback(null); setDone(false); setQ(gen()) }} />
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. BUBBLE POP (canvas)
// ══════════════════════════════════════════════════════════════════════════════
interface Bubble { x: number; y: number; r: number; vx: number; vy: number; color: string; popped: boolean; scale: number }

export function GameBubblePop({ onEnd, bestScore }: GameProps) {
  const W = 480, H = 420
  const cv = useRef<HTMLCanvasElement>(null)
  const S = useRef({ bubbles: [] as Bubble[], score: 0, missed: 0, timeLeft: 40, over: false, started: false, spawnTimer: 0, frame: 0 })
  const [ui, setUi] = useState({ score: 0, missed: 0, timeLeft: 40, over: false, started: false })
  const COLORS_B = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#fb923c', '#67e8f9']
  const MAX_MISSED = 10

  function spawn() {
    const r = 18 + Math.random() * 22
    S.current.bubbles.push({ x: r + Math.random() * (W - r * 2), y: H + r, vx: (Math.random() - 0.5) * 40, vy: -(50 + Math.random() * 60), r, color: COLORS_B[Math.floor(Math.random() * COLORS_B.length)], popped: false, scale: 1 })
  }

  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!
    const s = S.current
    ctx.fillStyle = '#0a0f1e'; ctx.fillRect(0, 0, W, H)
    // bg bubbles decoration
    for (let i = 0; i < 15; i++) { const bx = (i * 89) % W, by = (i * 67 + s.frame) % H; ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill() }

    s.bubbles.forEach(b => {
      if (b.popped && b.scale <= 0) return
      ctx.save(); ctx.translate(b.x, b.y); ctx.scale(b.scale, b.scale)
      // Bubble
      const grad = ctx.createRadialGradient(-b.r * 0.3, -b.r * 0.3, 0, 0, 0, b.r)
      grad.addColorStop(0, `${b.color}dd`); grad.addColorStop(0.6, `${b.color}88`); grad.addColorStop(1, `${b.color}22`)
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill()
      ctx.strokeStyle = b.color + 'cc'; ctx.lineWidth = 2; ctx.stroke()
      // Shine
      ctx.beginPath(); ctx.arc(-b.r * 0.3, -b.r * 0.3, b.r * 0.25, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill()
      ctx.restore()
    })

    // HUD
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace'
    ctx.fillText(`${s.score}pts`, 10, 22)
    ctx.fillText(`⏱ ${Math.ceil(s.timeLeft)}s`, W / 2 - 22, 22)
    ctx.fillStyle = '#f87171'; ctx.fillText(`✗ ${s.missed}/${MAX_MISSED}`, W - 82, 22)
    const pct = s.timeLeft / 40
    ctx.fillStyle = pct > 0.5 ? '#34d399' : pct > 0.25 ? '#fbbf24' : '#f87171'
    ctx.fillRect(0, H - 4, W * pct, 4)
  }, [])

  const update = useCallback((dt: number) => {
    const s = S.current; if (s.over || !s.started) return
    s.frame++; s.timeLeft -= dt; s.spawnTimer -= dt
    if (s.spawnTimer <= 0 && s.bubbles.filter(b => !b.popped).length < 12) { spawn(); s.spawnTimer = 0.4 }
    s.bubbles.forEach(b => {
      if (b.popped) { b.scale = Math.max(0, b.scale - dt * 4); return }
      b.x += b.vx * dt; b.y += b.vy * dt; b.vx += (Math.random() - 0.5) * 5 * dt
      if (b.x < b.r || b.x > W - b.r) b.vx *= -1
    })
    // Bubbles that escaped
    const escaped = s.bubbles.filter(b => !b.popped && b.y < -b.r * 2).length
    if (escaped) { s.missed += escaped; s.bubbles = s.bubbles.filter(b => b.popped || b.y >= -b.r * 2) }
    s.bubbles = s.bubbles.filter(b => !b.popped || b.scale > 0)
    if (s.missed >= MAX_MISSED || s.timeLeft <= 0) { s.over = true; setUi(u => ({ ...u, over: true, score: s.score })); onEnd(s.score >= 200 ? 'win' : 'play', s.score); return }
    setUi({ score: s.score, missed: s.missed, timeLeft: s.timeLeft, over: false, started: true })
    draw()
  }, [draw, onEnd])

  const animRef = useRef<number>(); const last = useRef(0)
  useEffect(() => {
    if (!ui.started || ui.over) { if (animRef.current) cancelAnimationFrame(animRef.current); return }
    const loop = (ts: number) => { const dt = Math.min((ts - (last.current || ts)) / 1000, 0.05); last.current = ts; update(dt); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [ui.started, ui.over, update])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const s = S.current; if (s.over) return
    if (!s.started) { s.started = true; setUi(u => ({ ...u, started: true })); return }
    const rect = cv.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    let hit = false
    s.bubbles.forEach(b => { if (!b.popped && Math.hypot(mx - b.x, my - b.y) < b.r) { b.popped = true; s.score += Math.round(b.r * 2); hit = true } })
    if (!hit) { s.missed++; if (s.missed >= MAX_MISSED) { s.over = true; setUi(u => ({ ...u, over: true, score: s.score })); onEnd('play', s.score) } }
  }, [onEnd])

  useEffect(() => { draw() }, [draw])

  function restart() { S.current = { bubbles: [], score: 0, missed: 0, timeLeft: 40, over: false, started: false, spawnTimer: 0, frame: 0 }; setUi({ score: 0, missed: 0, timeLeft: 40, over: false, started: false }); draw() }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <SBar items={[{ l: 'Score', v: ui.score, c: '96,165,250' }, { l: 'Erros', v: `${ui.missed}/${MAX_MISSED}`, c: '248,113,113' }, { l: 'Recorde', v: Math.max(ui.score, bestScore), c: '167,139,250' }]} />
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '2px solid rgba(96,165,250,0.25)', cursor: 'crosshair' }}>
        <canvas ref={cv} width={W} height={H} onClick={handleClick} />
        {!ui.started && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}><div style={{ fontSize: '2.5rem' }}>🫧</div><div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>BUBBLE POP</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem' }}>Estoure as bolhas · Não deixe escapar!</div><RBtn onClick={() => { S.current.started = true; setUi(u => ({ ...u, started: true })) }} label="▶ Iniciar" color="#60a5fa" /></div>}
        {ui.over && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}><div style={{ color: '#fbbf24', fontWeight: 900, fontSize: '1.2rem' }}>🫧 Fim!</div><div style={{ color: '#fff' }}>Score: {ui.score}</div><RBtn onClick={restart} color="#60a5fa" /></div>}
      </div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Clique nas bolhas · Bolhas pequenas valem mais · 40 segundos</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 10. CONNECT DOTS
// ══════════════════════════════════════════════════════════════════════════════
export function GameConnectDots({ onEnd, bestScore }: GameProps) {
  const N = 5
  type Line = { r1: number; c1: number; r2: number; c2: number; player: 'P' | 'AI' }
  type Box = { owner: 'P' | 'AI' | null }
  const [lines, setLines] = useState<Line[]>([])
  const [boxes, setBoxes] = useState<Box[][]>(() => Array.from({ length: N - 1 }, () => Array(N - 1).fill({ owner: null })))
  const [turn, setTurn] = useState<'P' | 'AI'>('P')
  const [scores2, setScores2] = useState({ P: 0, AI: 0 })
  const [done, setDone] = useState(false)

  function hasLine(ls: Line[], r1: number, c1: number, r2: number, c2: number) {
    return ls.some(l => (l.r1 === r1 && l.c1 === c1 && l.r2 === r2 && l.c2 === c2) || (l.r1 === r2 && l.c1 === c2 && l.r2 === r1 && l.c2 === c1))
  }

  function checkBoxes(ls: Line[], player: 'P' | 'AI'): { boxes: Box[][]; newBoxes: number } {
    const nb = boxes.map(row => row.map(b => ({ ...b })))
    let count = 0
    for (let r = 0; r < N - 1; r++) for (let c = 0; c < N - 1; c++) {
      if (nb[r][c].owner) continue
      const top = hasLine(ls, r, c, r, c + 1), bot = hasLine(ls, r + 1, c, r + 1, c + 1)
      const left = hasLine(ls, r, c, r + 1, c), right = hasLine(ls, r, c + 1, r + 1, c + 1)
      if (top && bot && left && right) { nb[r][c] = { owner: player }; count++ }
    }
    return { boxes: nb, newBoxes: count }
  }

  function addLine(r1: number, c1: number, r2: number, c2: number, player: 'P' | 'AI') {
    const nl = [...lines, { r1, c1, r2, c2, player }]
    const { boxes: nb, newBoxes } = checkBoxes(nl, player)
    const ns = { ...scores2, [player]: scores2[player] + newBoxes }
    setLines(nl); setBoxes(nb); setScores2(ns)
    const total = (N - 1) * (N - 1)
    if (ns.P + ns.AI === total) { setDone(true); onEnd(ns.P > ns.AI ? 'win' : 'loss', ns.P * 20); return }
    if (newBoxes === 0) setTurn(player === 'P' ? 'AI' : 'P')
    // AI plays after
    if (player === 'P' && newBoxes === 0) {
      setTimeout(() => doAI(nl, nb, ns), 400)
    } else if (player === 'P' && newBoxes > 0) {
      // P gets another turn (box scored)
    }
  }

  function doAI(ls: Line[], bx: Box[][], sc: { P: number; AI: number }) {
    // Find all valid lines
    const allLines: [number, number, number, number][] = []
    for (let r = 0; r < N; r++) for (let c = 0; c < N - 1; c++) if (!hasLine(ls, r, c, r, c + 1)) allLines.push([r, c, r, c + 1])
    for (let r = 0; r < N - 1; r++) for (let c = 0; c < N; c++) if (!hasLine(ls, r, c, r + 1, c)) allLines.push([r, c, r + 1, c])
    if (!allLines.length) return
    // Try to complete a box
    const complete = allLines.find(([r1, c1, r2, c2]) => { const tl = [...ls, { r1, c1, r2, c2, player: 'AI' as const }]; const { newBoxes } = checkBoxes(tl, 'AI'); return newBoxes > 0 })
    const chosen = complete ?? allLines[Math.floor(Math.random() * allLines.length)]
    const nl = [...ls, { r1: chosen[0], c1: chosen[1], r2: chosen[2], c2: chosen[3], player: 'AI' as const }]
    const { boxes: nb, newBoxes } = checkBoxes(nl, 'AI')
    const ns = { ...sc, AI: sc.AI + newBoxes }
    setLines(nl); setBoxes(nb); setScores2(ns)
    const total = (N - 1) * (N - 1)
    if (ns.P + ns.AI === total) { setDone(true); onEnd(ns.P > ns.AI ? 'win' : 'loss', ns.P * 20); return }
    if (newBoxes > 0) setTimeout(() => doAI(nl, nb, ns), 300)
    else setTurn('P')
  }

  const CELL = 56
  function HLine({ r, c }: { r: number; c: number }) {
    const exists = hasLine(lines, r, c, r, c + 1)
    const l = lines.find(ln => (ln.r1 === r && ln.c1 === c && ln.r2 === r && ln.c2 === c + 1) || (ln.r1 === r && ln.c1 === c + 1 && ln.r2 === r && ln.c2 === c))
    return <div onClick={() => !exists && turn === 'P' && !done && addLine(r, c, r, c + 1, 'P')}
      style={{ position: 'absolute', left: c * CELL + 10, top: r * CELL - 4, width: CELL - 6, height: 10, cursor: exists || done || turn !== 'P' ? 'default' : 'pointer', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', height: 5, borderRadius: 3, background: exists ? (l?.player === 'P' ? '#60a5fa' : '#f87171') : 'var(--border)', transition: 'background 0.2s' }}
        onMouseEnter={e => { if (!exists && turn === 'P' && !done) (e.currentTarget as HTMLElement).style.background = 'rgba(96,165,250,0.5)' }}
        onMouseLeave={e => { if (!exists) (e.currentTarget as HTMLElement).style.background = 'var(--border)' }} />
    </div>
  }
  function VLine({ r, c }: { r: number; c: number }) {
    const exists = hasLine(lines, r, c, r + 1, c)
    const l = lines.find(ln => (ln.r1 === r && ln.c1 === c && ln.r2 === r + 1 && ln.c2 === c) || (ln.r1 === r + 1 && ln.c1 === c && ln.r2 === r && ln.c2 === c))
    return <div onClick={() => !exists && turn === 'P' && !done && addLine(r, c, r + 1, c, 'P')}
      style={{ position: 'absolute', left: c * CELL - 4, top: r * CELL + 10, width: 10, height: CELL - 6, cursor: exists || done || turn !== 'P' ? 'default' : 'pointer', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ height: '100%', width: 5, borderRadius: 3, background: exists ? (l?.player === 'P' ? '#60a5fa' : '#f87171') : 'var(--border)', transition: 'background 0.2s' }}
        onMouseEnter={e => { if (!exists && turn === 'P' && !done) (e.currentTarget as HTMLElement).style.background = 'rgba(96,165,250,0.5)' }}
        onMouseLeave={e => { if (!exists) (e.currentTarget as HTMLElement).style.background = 'var(--border)' }} />
    </div>
  }

  const gridW = (N - 1) * CELL + 20, gridH = (N - 1) * CELL + 20

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 16 }}>
      <SBar items={[
        { l: '🔵 Você', v: scores2.P, c: '96,165,250' },
        { l: '🔴 IA', v: scores2.AI, c: '248,113,113' },
        { l: done ? (scores2.P > scores2.AI ? '🎉 Vitória!' : '💀 Derrota!') : (turn === 'P' ? 'Sua vez' : 'IA...'), v: '', c: done ? (scores2.P > scores2.AI ? '52,211,153' : '248,113,113') : '251,191,36' },
      ]} />

      <div style={{ position: 'relative', width: gridW, height: gridH }}>
        {/* Boxes */}
        {boxes.map((row, r) => row.map((box, c) => box.owner && (
          <div key={`${r}-${c}`} style={{ position: 'absolute', left: c * CELL + 12, top: r * CELL + 12, width: CELL - 10, height: CELL - 10, background: box.owner === 'P' ? 'rgba(96,165,250,0.2)' : 'rgba(248,113,113,0.2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
            {box.owner === 'P' ? '🔵' : '🔴'}
          </div>
        )))}
        {/* Lines */}
        {Array.from({ length: N }, (_, r) => Array.from({ length: N - 1 }, (_, c) => <HLine key={`h${r}${c}`} r={r} c={c} />))}
        {Array.from({ length: N - 1 }, (_, r) => Array.from({ length: N }, (_, c) => <VLine key={`v${r}${c}`} r={r} c={c} />))}
        {/* Dots */}
        {Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => (
          <div key={`d${r}${c}`} style={{ position: 'absolute', left: c * CELL + 6, top: r * CELL + 6, width: 8, height: 8, borderRadius: '50%', background: 'var(--text-primary)', zIndex: 3 }} />
        )))}
      </div>

      <button onClick={() => { setLines([]); setBoxes(Array.from({ length: N - 1 }, () => Array(N - 1).fill({ owner: null }))); setTurn('P'); setScores2({ P: 0, AI: 0 }); setDone(false) }}
        style={{ padding: '6px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}>↺ Novo Jogo</button>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Clique nas linhas entre os pontos · Complete quadrados para ganhar pontos</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 11. STACK BLOCKS (canvas)
// ══════════════════════════════════════════════════════════════════════════════
export function GameStackBlocks({ onEnd, bestScore }: GameProps) {
  const W = 360, H = 480
  const cv = useRef<HTMLCanvasElement>(null)
  const S = useRef({ blocks: [] as { x: number; w: number; y: number }[], moving: { x: number; w: number; dir: 1 | -1; spd: number }, score: 0, over: false, started: false })
  const animRef = useRef<number>()
  const [ui, setUi] = useState({ score: 0, over: false, started: false })
  const BLOCK_H = 24, COLORS_S = ['#f87171', '#fb923c', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6']

  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!
    const s = S.current
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, H)
    // Placed blocks
    s.blocks.forEach((b, i) => {
      const col = COLORS_S[i % COLORS_S.length]
      ctx.fillStyle = col + 'cc'
      ctx.fillRect(b.x, b.y, b.w, BLOCK_H - 2)
      ctx.fillStyle = col; ctx.fillRect(b.x, b.y, b.w, 4)
      ctx.fillStyle = col + '66'; ctx.fillRect(b.x, b.y + BLOCK_H - 6, b.w, 4)
    })
    // Moving block
    if (!s.over) {
      const m = s.moving; const col = COLORS_S[s.blocks.length % COLORS_S.length]
      const my = H - (s.blocks.length + 1) * BLOCK_H - 10
      ctx.fillStyle = col + 'cc'; ctx.fillRect(m.x, my, m.w, BLOCK_H - 2)
      ctx.fillStyle = col; ctx.fillRect(m.x, my, m.w, 4)
    }
    // Score
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center'
    ctx.fillText(`${s.score}`, W / 2, 30); ctx.textAlign = 'start'
    if (bestScore > 0) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '12px monospace'; ctx.textAlign = 'center'; ctx.fillText(`Rec: ${bestScore}`, W / 2, 50); ctx.textAlign = 'start' }
  }, [bestScore])

  const update = useCallback(() => {
    const s = S.current; if (s.over || !s.started) return
    const m = s.moving; const spd = Math.min(4 + s.score * 0.15, 8)
    m.x += m.dir * spd
    if (m.x + m.w > W) { m.x = W - m.w; m.dir = -1 }
    if (m.x < 0) { m.x = 0; m.dir = 1 }
    draw(); animRef.current = requestAnimationFrame(update)
  }, [draw])

  function drop() {
    const s = S.current; if (s.over) return
    if (!s.started) { s.started = true; setUi(u => ({ ...u, started: true })); animRef.current = requestAnimationFrame(update); return }
    const m = s.moving
    const by = H - s.blocks.length * BLOCK_H - 10
    if (s.blocks.length === 0) {
      s.blocks.push({ x: m.x, w: m.w, y: by - BLOCK_H })
    } else {
      const prev = s.blocks[s.blocks.length - 1]
      const overlap = Math.min(m.x + m.w, prev.x + prev.w) - Math.max(m.x, prev.x)
      if (overlap <= 0) { s.over = true; setUi(u => ({ ...u, over: true, score: s.score })); onEnd(s.score >= 10 ? 'win' : 'play', s.score * 10); draw(); return }
      const nx = Math.max(m.x, prev.x)
      s.blocks.push({ x: nx, w: overlap, y: by - BLOCK_H })
      s.score++
    }
    setUi(u => ({ ...u, score: s.score }))
    // New moving block (same width as last dropped or narrowed)
    const lastW = s.blocks[s.blocks.length - 1].w
    s.moving = { x: 0, w: Math.min(lastW, lastW), dir: 1, spd: 3 } as typeof s.moving
  }

  function restart() {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    S.current = { blocks: [], moving: { x: 0, w: W * 0.6, dir: 1, spd: 3 }, score: 0, over: false, started: false }
    setUi({ score: 0, over: false, started: false }); draw()
  }

  useEffect(() => {
    S.current.moving = { x: 0, w: W * 0.6, dir: 1, spd: 3 }; draw()
    const kd = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); drop() } }
    window.addEventListener('keydown', kd)
    return () => { window.removeEventListener('keydown', kd); if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])


  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <SBar items={[{ l: 'Blocos', v: ui.score, c: '96,165,250' }, { l: 'Recorde', v: Math.max(ui.score, bestScore), c: '251,191,36' }]} />
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '2px solid rgba(96,165,250,0.3)', cursor: 'pointer' }} onClick={drop}>
        <canvas ref={cv} width={W} height={H} />
        {!ui.started && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}><div style={{ fontSize: '2rem' }}>📦</div><div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>STACK BLOCKS</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>Clique para empilhar · Encaixe perfeitamente</div><RBtn onClick={drop} label="▶ Iniciar" color="#60a5fa" /></div>}
        {ui.over && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}><div style={{ color: '#f87171', fontWeight: 900, fontSize: '1.2rem' }}>📦 Caiu!</div><div style={{ color: '#fff' }}>{ui.score} blocos</div><RBtn onClick={restart} color="#60a5fa" /></div>}
      </div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Clique ou Espaço para soltar o bloco · Alinhe com o anterior</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 12. MERGE GAME (2048-style but merge same numbers anywhere)
// ══════════════════════════════════════════════════════════════════════════════
export function GameMerge({ onEnd, bestScore }: GameProps) {
  type Cell = { id: number; value: number } | null
  const N = 5; let idCtr = 0
  function mkCell(v: number): { id: number; value: number } { return { id: idCtr++, value: v } }
  function initGrid(): Cell[][] {
    const g: Cell[][] = Array.from({ length: N }, () => Array(N).fill(null))
    for (let i = 0; i < 4; i++) {
      let r: number, c: number
      do { r = Math.floor(Math.random() * N); c = Math.floor(Math.random() * N) } while (g[r][c])
      g[r][c] = mkCell(Math.random() < 0.8 ? 2 : 4)
    }
    return g
  }

  const [grid, setGrid] = useState<Cell[][]>(initGrid)
  const [score, setScore] = useState(0)
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [won, setWon] = useState(false)

  function addRandom(g: Cell[][]): Cell[][] {
    const empty: [number, number][] = []
    g.forEach((row, r) => row.forEach((c, ci) => { if (!c) empty.push([r, ci]) }))
    if (!empty.length) return g
    const [r, c] = empty[Math.floor(Math.random() * empty.length)]
    g[r][c] = mkCell(Math.random() < 0.8 ? 2 : 4); return g
  }

  function click(r: number, c: number) {
    if (won) return
    const cell = grid[r][c]
    if (!selected) {
      if (cell) setSelected([r, c])
      return
    }
    const [sr, sc] = selected
    if (sr === r && sc === c) { setSelected(null); return }
    if (cell && cell.value === grid[sr][sc]!.value) {
      // Merge
      const ng = grid.map(row => row.map(c => c ? { ...c } : null))
      const merged = mkCell(cell.value * 2); ng[r][c] = merged; ng[sr][sc] = null
      const ns = score + merged.value
      addRandom(ng); setGrid(ng); setScore(ns); setSelected(null)
      if (merged.value >= 512) { setWon(true); onEnd('win', ns) }
    } else if (!cell) {
      // Move
      const ng = grid.map(row => row.map(c => c ? { ...c } : null))
      ng[r][c] = ng[sr][sc]; ng[sr][sc] = null
      setGrid(ng); setSelected([r, c])
    } else {
      setSelected([r, c])
    }
  }

  const TILE_COLORS: Record<number, string> = { 2: '#f1f5f9', 4: '#fef3c7', 8: '#fed7aa', 16: '#fca5a5', 32: '#f87171', 64: '#fb923c', 128: '#fbbf24', 256: '#a3e635', 512: '#34d399' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 16 }}>
      <SBar items={[
        { l: 'Score', v: score, c: '96,165,250' },
        { l: won ? '🎉 512 Alcançado!' : 'Meta: 512', v: '', c: won ? '52,211,153' : '251,191,36' },
        { l: 'Recorde', v: Math.max(score, bestScore), c: '167,139,250' },
      ]} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${N},1fr)`, gap: 6, background: '#1e293b', padding: 8, borderRadius: 14 }}>
        {grid.map((row, r) => row.map((cell, c) => {
          const isSel = selected?.[0] === r && selected?.[1] === c
          const col = cell ? (TILE_COLORS[cell.value] || '#34d399') : 'transparent'
          return (
            <div key={`${r}-${c}`} onClick={() => click(r, c)}
              style={{ width: 62, height: 62, borderRadius: 12, background: cell ? col : 'rgba(255,255,255,0.04)', border: `2px solid ${isSel ? '#fbbf24' : cell ? col + '88' : 'rgba(255,255,255,0.06)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 900, fontSize: cell?.value && cell.value >= 100 ? '0.9rem' : '1.2rem', color: cell?.value && cell.value >= 8 ? '#fff' : '#1f2937', transition: 'all 0.15s', boxShadow: isSel ? `0 0 16px #fbbf2480` : 'none' }}>
              {cell?.value || ''}
            </div>
          )
        }))}
      </div>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: 300 }}>
        Selecione uma peça, depois clique em outra igual para mesclar · Alcance 512!
        {selected && <span style={{ color: '#fbbf24' }}> ✦ Selecionado: {grid[selected[0]][selected[1]]?.value}</span>}
      </div>
      <button onClick={() => { setGrid(initGrid()); setScore(0); setSelected(null); setWon(false) }} style={{ padding: '6px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}>↺ Novo Jogo</button>
    </div>
  )
}
