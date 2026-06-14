import { useState, useEffect } from 'react'

function getMoonPhase(date: Date): { icon: string; name: string; illumination: number } {
  const MS_PER_DAY = 86400000
  const knownNewMoon = new Date('2000-01-06T18:14:00Z').getTime()
  const SYNODIC = 29.530588853 * MS_PER_DAY
  const elapsed = date.getTime() - knownNewMoon
  const age = ((elapsed % SYNODIC) + SYNODIC) % SYNODIC / MS_PER_DAY
  const phase = age / 29.530588853
  const illumination = Math.round((1 - Math.cos(phase * 2 * Math.PI)) / 2 * 100)
  let icon = '🌑', name = 'Lua Nova'
  if (phase < 0.025 || phase >= 0.975) { icon = '🌑'; name = 'Lua Nova' }
  else if (phase < 0.25) { icon = '🌒'; name = 'Crescente' }
  else if (phase < 0.275) { icon = '🌓'; name = 'Quarto Crescente' }
  else if (phase < 0.5) { icon = '🌔'; name = 'Gibosa Crescente' }
  else if (phase < 0.525) { icon = '🌕'; name = 'Lua Cheia' }
  else if (phase < 0.75) { icon = '🌖'; name = 'Gibosa Minguante' }
  else if (phase < 0.775) { icon = '🌗'; name = 'Quarto Minguante' }
  else { icon = '🌘'; name = 'Minguante' }
  return { icon, name, illumination }
}

function getSeason(date: Date): { icon: string; name: string; color: string } {
  const m = date.getMonth() + 1, d = date.getDate()
  if (m === 12 && d >= 21 || m <= 3 && !(m === 3 && d > 20)) return { icon: '☀️', name: 'Verão', color: '#f97316' }
  if (m >= 3 && m <= 6 && !(m === 6 && d > 20) && !(m === 3 && d < 21)) return { icon: '🍂', name: 'Outono', color: '#d97706' }
  if (m >= 6 && m <= 9 && !(m === 9 && d > 22) && !(m === 6 && d < 21)) return { icon: '❄️', name: 'Inverno', color: '#3b82f6' }
  return { icon: '🌸', name: 'Primavera', color: '#22c55e' }
}

export default function PainelGeosfera({ onNavigate, dragging, dragOver: _dO, onDragStart, onDragEnd, onDragOver, onDrop }: any) {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(i) }, [])

  const moon = getMoonPhase(now)
  const season = getSeason(now)

  return (
    <button onClick={() => onNavigate('geosfera')} draggable
      onDragStart={() => onDragStart?.('geosfera')} onDragEnd={() => onDragEnd?.()}
      onDragOver={e => onDragOver?.(e, 'geosfera')} onDrop={e => onDrop?.(e, 'geosfera')}
      style={{ gridColumn: 'span 1', padding: '16px 20px', borderRadius: 16, border: '1px solid rgba(52,211,153,0.2)', background: 'linear-gradient(135deg,rgba(14,116,144,0.08),rgba(30,58,138,0.06),transparent)', textAlign: 'left', cursor: 'grab', transition: 'all 0.2s', opacity: dragging === 'geosfera' ? 0.45 : 1 }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'translateY(-2px)'; el.style.boxShadow = '0 8px 24px rgba(52,211,153,0.15)' }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = ''; el.style.boxShadow = '' }}>

      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ opacity: 0.5, fontSize: '0.45rem' }}>⠿</span> 🌍 Geosfera
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {/* Moon */}
        <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(254,249,231,0.06)', border: '1px solid rgba(254,249,231,0.12)' }}>
          <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{moon.icon}</div>
          <div style={{ fontWeight: 800, fontSize: '0.78rem', color: '#fef9e7', lineHeight: 1.2 }}>{moon.name}</div>
          <div style={{ fontSize: '0.62rem', color: 'rgba(254,249,231,0.55)', marginTop: 3 }}>{moon.illumination}% ilum.</div>
        </div>
        {/* Season */}
        <div style={{ padding: '10px 12px', borderRadius: 12, background: `rgba(${season.color === '#f97316' ? '249,115,22' : season.color === '#d97706' ? '217,119,6' : season.color === '#3b82f6' ? '59,130,246' : '34,197,94'},0.08)`, border: `1px solid rgba(${season.color === '#f97316' ? '249,115,22' : season.color === '#d97706' ? '217,119,6' : season.color === '#3b82f6' ? '59,130,246' : '34,197,94'},0.2)` }}>
          <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{season.icon}</div>
          <div style={{ fontWeight: 800, fontSize: '0.78rem', color: season.color, lineHeight: 1.2 }}>{season.name}</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 3 }}>Sul · Brasil</div>
        </div>
      </div>

      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ color: '#34d399' }}>🌐</span> Observatório Digital
      </div>
    </button>
  )
}
