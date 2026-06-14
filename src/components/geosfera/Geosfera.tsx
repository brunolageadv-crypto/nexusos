import { useState, useEffect, useRef } from 'react'
import AtlasGlobal from './AtlasGlobal'

// ─── Pure math — no external deps ────────────────────────────────────────────

// ══ MOON CALCULATIONS ════════════════════════════════════════════════════════
function getMoonData(date: Date) {
  const MS_PER_DAY = 86400000
  // Known new moon: Jan 6 2000 18:14 UTC (Julian)
  const knownNewMoon = new Date('2000-01-06T18:14:00Z').getTime()
  const SYNODIC = 29.530588853 * MS_PER_DAY
  const elapsed = date.getTime() - knownNewMoon
  const age = ((elapsed % SYNODIC) + SYNODIC) % SYNODIC / MS_PER_DAY
  const phase = age / 29.530588853 // 0–1
  const illumination = Math.round((1 - Math.cos(phase * 2 * Math.PI)) / 2 * 100)

  let phaseName = '', phaseIcon = '', phaseIndex = 0
  if (phase < 0.025 || phase >= 0.975) { phaseName = 'Lua Nova'; phaseIcon = '🌑'; phaseIndex = 0 }
  else if (phase < 0.25) { phaseName = 'Lua Crescente'; phaseIcon = '🌒'; phaseIndex = 1 }
  else if (phase < 0.275) { phaseName = 'Quarto Crescente'; phaseIcon = '🌓'; phaseIndex = 2 }
  else if (phase < 0.5) { phaseName = 'Gibosa Crescente'; phaseIcon = '🌔'; phaseIndex = 3 }
  else if (phase < 0.525) { phaseName = 'Lua Cheia'; phaseIcon = '🌕'; phaseIndex = 4 }
  else if (phase < 0.75) { phaseName = 'Gibosa Minguante'; phaseIcon = '🌖'; phaseIndex = 5 }
  else if (phase < 0.775) { phaseName = 'Quarto Minguante'; phaseIcon = '🌗'; phaseIndex = 6 }
  else { phaseName = 'Lua Minguante'; phaseIcon = '🌘'; phaseIndex = 7 }

  // Next full moon
  const daysToFull = phase < 0.5 ? (0.5 - phase) * 29.53 : (1.5 - phase) * 29.53
  const daysToNew = phase > 0 ? (1 - phase) * 29.53 : 0
  const nextPhaseLabel = phase < 0.5 ? 'Lua Cheia 🌕' : phase < 1 ? 'Lua Nova 🌑' : 'Lua Cheia 🌕'
  const daysToNext = phase < 0.5 ? daysToFull : daysToNew

  return { age: Math.floor(age), illumination, phaseName, phaseIcon, phaseIndex, phase, daysToNext, nextPhaseLabel }
}

// ══ SEASON CALCULATIONS (Southern Hemisphere — Brazil) ═══════════════════════
function getSeasonData(date: Date) {
  const year = date.getFullYear()
  // Southern hemisphere seasons
  const seasons = [
    { name: 'Verão',     icon: '☀️', color1: '#f97316', color2: '#fbbf24', bg: 'from-orange-900 to-yellow-800',
      emoji: '🏖️', start: new Date(`${year}-12-21`), end: new Date(`${year+1}-03-20`) },
    { name: 'Outono',    icon: '🍂', color1: '#92400e', color2: '#d97706', bg: 'from-orange-950 to-amber-900',
      emoji: '🍁', start: new Date(`${year}-03-21`), end: new Date(`${year}-06-20`) },
    { name: 'Inverno',   icon: '❄️', color1: '#1e3a5f', color2: '#3b82f6', bg: 'from-blue-950 to-blue-900',
      emoji: '🏔️', start: new Date(`${year}-06-21`), end: new Date(`${year}-09-22`) },
    { name: 'Primavera', icon: '🌸', color1: '#14532d', color2: '#16a34a', bg: 'from-green-950 to-green-800',
      emoji: '🌺', start: new Date(`${year}-09-23`), end: new Date(`${year}-12-20`) },
  ]

  const m = date.getMonth() + 1, d = date.getDate()
  let current: typeof seasons[0], next: typeof seasons[0]

  if (m === 12 && d >= 21 || m <= 3 && !(m === 3 && d > 20)) {
    current = seasons[0]; next = seasons[1]
  } else if (m >= 3 && m <= 6 && !(m === 6 && d > 20) && !(m === 3 && d < 21)) {
    current = seasons[1]; next = seasons[2]
  } else if (m >= 6 && m <= 9 && !(m === 9 && d > 22) && !(m === 6 && d < 21)) {
    current = seasons[2]; next = seasons[3]
  } else {
    current = seasons[3]; next = seasons[0]
  }

  // Days into current season
  let seasonStart = new Date(current.start)
  if (m === 12 && d >= 21) seasonStart = new Date(`${year}-12-21`)
  const msInSeason = date.getTime() - seasonStart.getTime()
  const totalMs = 90 * 86400000
  const pct = Math.min(100, Math.round(msInSeason / totalMs * 100))

  // Days to next
  let nextStart = new Date(next.start)
  if (current.name === 'Verão') nextStart = new Date(`${year+1}-03-21`)
  const msToNext = nextStart.getTime() - date.getTime()
  const daysToNext = Math.floor(msToNext / 86400000)
  const hoursToNext = Math.floor((msToNext % 86400000) / 3600000)
  const minsToNext = Math.floor((msToNext % 3600000) / 60000)

  return { current, next, pct, daysToNext, hoursToNext, minsToNext }
}

// ══ SUN DATA (approx — Belo Horizonte -19.9°, -43.9°) ════════════════════════
function getSunData(date: Date) {
  const lat = -19.9 * Math.PI / 180
  const doy = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000)
  const declination = -23.45 * Math.cos(2 * Math.PI * (doy + 10) / 365) * Math.PI / 180
  const cosHa = -Math.tan(lat) * Math.tan(declination)
  const ha = Math.acos(Math.max(-1, Math.min(1, cosHa))) * 180 / Math.PI
  const sunrise = 12 - ha / 15
  const sunset = 12 + ha / 15
  const noon = 12

  const fmt = (h: number) => {
    const hr = Math.floor(h); const mn = Math.round((h - hr) * 60)
    return `${String(hr).padStart(2,'0')}:${String(mn).padStart(2,'0')}`
  }
  const duration = sunset - sunrise
  const dh = Math.floor(duration), dm = Math.round((duration - dh) * 60)

  return { sunrise: fmt(sunrise - 3), sunset: fmt(sunset - 3), noon: fmt(noon - 3), duration: `${dh}h ${dm}min` }
}

// ══ WORLD CLOCKS ═════════════════════════════════════════════════════════════
const ZONES = [
  { city: 'Brasília',  tz: 'America/Sao_Paulo', flag: '🇧🇷' },
  { city: 'Londres',   tz: 'Europe/London',      flag: '🇬🇧' },
  { city: 'Nova York', tz: 'America/New_York',   flag: '🇺🇸' },
  { city: 'Tóquio',   tz: 'Asia/Tokyo',          flag: '🇯🇵' },
  { city: 'Sydney',    tz: 'Australia/Sydney',    flag: '🇦🇺' },
]

function getWorldClocks(date: Date) {
  return ZONES.map(z => ({
    ...z,
    time: date.toLocaleTimeString('pt-BR', { timeZone: z.tz, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    date: date.toLocaleDateString('pt-BR', { timeZone: z.tz, weekday: 'short', day: '2-digit', month: 'short' }),
    isDay: (() => { const h = parseInt(date.toLocaleTimeString('en-US', { timeZone: z.tz, hour: 'numeric', hour12: false })); return h >= 6 && h < 20 })()
  }))
}

// ══ CURIOSITIES ══════════════════════════════════════════════════════════════
const CURIOSITIES = [
  { icon: '🌍', text: 'A Terra gira a aproximadamente 1.670 km/h no equador — você está sempre em movimento!' },
  { icon: '🌙', text: 'A Lua se afasta da Terra cerca de 3,8 cm por ano devido à força de maré.' },
  { icon: '☀️', text: 'A luz solar leva exatamente 8 minutos e 20 segundos para chegar até nós.' },
  { icon: '🌊', text: 'Os oceanos cobrem 71% da superfície terrestre e contêm 97% de toda a água do planeta.' },
  { icon: '⚡', text: 'A Terra é atingida por cerca de 100 raios por segundo — 8,6 milhões por dia.' },
  { icon: '🏔️', text: 'O Monte Everest cresce cerca de 5 mm por ano devido ao movimento das placas tectônicas.' },
  { icon: '🌪️', text: 'O ponto mais profundo dos oceanos, Fossa das Marianas, tem 11.034 metros de profundidade.' },
  { icon: '💨', text: 'A atmosfera terrestre tem cerca de 10.000 km de espessura, mas 99% está nos primeiros 100 km.' },
  { icon: '🌡️', text: 'O núcleo interno da Terra tem temperatura de até 5.700°C — quase tão quente quanto o Sol.' },
  { icon: '🪐', text: 'Um dia em Vênus é mais longo que um ano em Vênus — leva 243 dias terrestres para girar uma vez.' },
  { icon: '🌌', text: 'Nossa galáxia, a Via Láctea, tem entre 100 e 400 bilhões de estrelas.' },
  { icon: '🐋', text: 'A bacia hidrográfica Amazônica descarga 20% de toda a água doce que chega aos oceanos do mundo.' },
  { icon: '🧲', text: 'O campo magnético terrestre nos protege do vento solar — sem ele, a vida seria impossível.' },
  { icon: '🌐', text: 'O Brasil é o 5º maior país do mundo em área, cobrindo quase metade da América do Sul.' },
  { icon: '❄️', text: 'A Antártida contém 70% de toda a água doce do planeta, congelada em sua calota polar.' },
]

// ══ MOON CANVAS ══════════════════════════════════════════════════════════════
function MoonCanvas({ phase, size = 160 }: { phase: number; size?: number }) {
  const cv = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = cv.current; if (!c) return
    const ctx = c.getContext('2d')!
    const r = size / 2, cx = r, cy = r
    ctx.clearRect(0, 0, size, size)

    // Dark space bg
    ctx.fillStyle = '#0a0a1a'
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()

    // Moon disc
    const moonGrad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.1, cx, cy, r)
    moonGrad.addColorStop(0, '#f5f0dc')
    moonGrad.addColorStop(0.6, '#d4cba0')
    moonGrad.addColorStop(1, '#a09060')
    ctx.fillStyle = moonGrad
    ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.fill()

    // Craters
    const craters = [[0.3, 0.35, 0.07], [-0.2, 0.4, 0.05], [0.5, -0.1, 0.06], [-0.4, -0.3, 0.04], [0.1, -0.5, 0.035], [-0.5, 0.15, 0.045]]
    craters.forEach(([dx, dy, cr]) => {
      const cg = ctx.createRadialGradient(cx + dx*r + cr*r*0.3, cy + dy*r + cr*r*0.3, 0, cx + dx*r, cy + dy*r, cr*r)
      cg.addColorStop(0, 'rgba(100,90,60,0.6)'); cg.addColorStop(1, 'rgba(160,145,90,0.2)')
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx + dx*r, cy + dy*r, cr*r, 0, Math.PI*2); ctx.fill()
    })

    // Shadow mask based on phase
    ctx.globalCompositeOperation = 'source-atop'
    const phaseAngle = phase * Math.PI * 2
    const illuminated = (1 - Math.cos(phaseAngle)) / 2

    if (phase < 0.5) {
      // Waxing: right side illuminated
      ctx.fillStyle = '#0a0a1a'
      ctx.beginPath(); ctx.arc(cx, cy, r - 2, Math.PI / 2, -Math.PI / 2); ctx.closePath()
      // Ellipse for terminator
      const ellW = Math.abs(Math.cos(phaseAngle)) * (r - 2)
      ctx.save()
      ctx.beginPath()
      if (illuminated < 0.5) {
        ctx.ellipse(cx, cy, ellW, r - 2, 0, Math.PI / 2, -Math.PI / 2, false)
        ctx.lineTo(cx - r, cy); ctx.arc(cx, cy, r - 2, -Math.PI / 2, Math.PI / 2, true); ctx.fill()
      } else {
        ctx.arc(cx, cy, r - 2, Math.PI / 2, -Math.PI / 2); ctx.fill()
        ctx.fillStyle = moonGrad
        ctx.beginPath(); ctx.ellipse(cx, cy, ellW, r - 2, 0, Math.PI / 2, -Math.PI / 2, false)
        ctx.lineTo(cx, cy); ctx.fill()
      }
      ctx.restore()
    } else {
      // Waning: left side illuminated
      ctx.fillStyle = '#0a0a1a'
      ctx.beginPath(); ctx.arc(cx, cy, r - 2, -Math.PI / 2, Math.PI / 2); ctx.closePath()
      ctx.save()
      ctx.restore()
    }

    ctx.globalCompositeOperation = 'source-over'

    // Glow
    const glow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.4)
    glow.addColorStop(0, 'rgba(240,230,180,0.15)')
    glow.addColorStop(1, 'rgba(240,230,180,0)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2); ctx.fill()
  }, [phase, size])

  return <canvas ref={cv} width={size} height={size} style={{ borderRadius: '50%', filter: 'drop-shadow(0 0 20px rgba(240,230,180,0.3))' }} />
}

// ══ EARTH CANVAS (Day/Night) ══════════════════════════════════════════════════
function EarthCanvas({ date, size = 200 }: { date: Date; size: number }) {
  const cv = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = cv.current; if (!c) return
    const ctx = c.getContext('2d')!
    const r = size / 2

    ctx.clearRect(0, 0, size, size)

    // Ocean
    const oceanGrad = ctx.createRadialGradient(r * 0.7, r * 0.3, 0, r, r, r)
    oceanGrad.addColorStop(0, '#1a6b9a'); oceanGrad.addColorStop(1, '#0a3555')
    ctx.fillStyle = oceanGrad; ctx.beginPath(); ctx.arc(r, r, r - 2, 0, Math.PI * 2); ctx.fill()

    // Continents (simplified blobs)
    ctx.fillStyle = '#2d6a2d'
    const continents = [
      // Americas
      {x: 0.25, y: 0.3, rx: 0.10, ry: 0.22},
      {x: 0.28, y: 0.60, rx: 0.09, ry: 0.20},
      // Europe/Africa
      {x: 0.52, y: 0.28, rx: 0.07, ry: 0.12},
      {x: 0.54, y: 0.50, rx: 0.09, ry: 0.22},
      // Asia
      {x: 0.68, y: 0.25, rx: 0.18, ry: 0.18},
      // Australia
      {x: 0.75, y: 0.65, rx: 0.08, ry: 0.07},
    ]
    continents.forEach(cont => {
      ctx.beginPath()
      ctx.ellipse(r * 2 * cont.x, r * 2 * cont.y, cont.rx * r * 2, cont.ry * r * 2, 0, 0, Math.PI * 2)
      ctx.fill()
    })

    // Terminator — sun angle based on UTC hour
    const utcH = date.getUTCHours() + date.getUTCMinutes() / 60
    const sunLon = 180 - utcH * 15 // Sun longitude
    const sunLonRad = sunLon * Math.PI / 180

    // Night side gradient overlay
    ctx.save()
    ctx.beginPath(); ctx.arc(r, r, r - 2, 0, Math.PI * 2); ctx.clip()
    const angle = sunLonRad
    const gx1 = r + Math.cos(angle + Math.PI * 0.5) * r * 1.2
    const gy1 = r + Math.sin(angle + Math.PI * 0.5) * r * 1.2
    const gx2 = r + Math.cos(angle - Math.PI * 0.5) * r * 1.2
    const gy2 = r + Math.sin(angle - Math.PI * 0.5) * r * 1.2
    const termGrad = ctx.createLinearGradient(gx1, gy1, gx2, gy2)
    termGrad.addColorStop(0, 'rgba(0,0,20,0.75)')
    termGrad.addColorStop(0.45, 'rgba(0,0,20,0.70)')
    termGrad.addColorStop(0.5, 'rgba(0,0,10,0.15)')
    termGrad.addColorStop(0.55, 'rgba(0,0,0,0)')
    termGrad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = termGrad; ctx.fillRect(0, 0, size, size)
    ctx.restore()

    // Atmosphere glow
    const atmoGrad = ctx.createRadialGradient(r, r, r * 0.85, r, r, r * 1.1)
    atmoGrad.addColorStop(0, 'rgba(100,160,255,0)')
    atmoGrad.addColorStop(0.7, 'rgba(100,160,255,0.12)')
    atmoGrad.addColorStop(1, 'rgba(100,160,255,0.25)')
    ctx.fillStyle = atmoGrad; ctx.beginPath(); ctx.arc(r, r, r * 1.1, 0, Math.PI * 2); ctx.fill()

    // Border
    ctx.strokeStyle = 'rgba(100,160,255,0.3)'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(r, r, r - 2, 0, Math.PI * 2); ctx.stroke()
  }, [date, size])

  return <canvas ref={cv} width={size} height={size} style={{ borderRadius: '50%', filter: 'drop-shadow(0 0 16px rgba(100,160,255,0.3))' }} />
}

// ══ ANALOG CLOCK ═════════════════════════════════════════════════════════════
function AnalogClock({ time, isDay, size = 56 }: { time: string; isDay: boolean; size?: number }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const parts = time.split(':').map(Number)
  const h = parts[0] % 12, m = parts[1], s = parts[2] || 0

  useEffect(() => {
    const c = cv.current; if (!c) return
    const ctx = c.getContext('2d')!
    const r = size / 2; ctx.clearRect(0, 0, size, size)

    // Face
    const face = ctx.createRadialGradient(r, r, 0, r, r, r)
    face.addColorStop(0, isDay ? '#1e3a5f' : '#0a0a2a')
    face.addColorStop(1, isDay ? '#0f2040' : '#050515')
    ctx.fillStyle = face; ctx.beginPath(); ctx.arc(r, r, r - 1, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = isDay ? 'rgba(96,165,250,0.4)' : 'rgba(167,139,250,0.4)'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(r, r, r - 1, 0, Math.PI * 2); ctx.stroke()

    // Hour marks
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2
      const len = i % 3 === 0 ? 5 : 3
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = i % 3 === 0 ? 1.5 : 1
      ctx.beginPath()
      ctx.moveTo(r + Math.cos(a) * (r - 7), r + Math.sin(a) * (r - 7))
      ctx.lineTo(r + Math.cos(a) * (r - 7 - len), r + Math.sin(a) * (r - 7 - len))
      ctx.stroke()
    }

    const drawHand = (angle: number, length: number, width: number, color: string) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(r, r)
      ctx.lineTo(r + Math.cos(angle) * length, r + Math.sin(angle) * length)
      ctx.stroke()
    }

    drawHand((h / 12 + m / 720) * Math.PI * 2 - Math.PI / 2, r * 0.5, 2, '#f1f5f9')
    drawHand((m / 60 + s / 3600) * Math.PI * 2 - Math.PI / 2, r * 0.7, 1.5, '#93c5fd')
    drawHand(s / 60 * Math.PI * 2 - Math.PI / 2, r * 0.75, 1, '#f87171')

    // Center
    ctx.fillStyle = '#f1f5f9'; ctx.beginPath(); ctx.arc(r, r, 2.5, 0, Math.PI * 2); ctx.fill()
  }, [time, isDay, h, m, s, size])

  return <canvas ref={cv} width={size} height={size} />
}

// ══ SEASON VISUAL ════════════════════════════════════════════════════════════
const SEASON_VISUALS: Record<string, { particles: string[]; gradient: string[]; ambiance: string }> = {
  'Verão': {
    particles: ['☀️', '🌊', '🌴', '⛱️', '🏄'],
    gradient: ['#7c2d12', '#b45309'],
    ambiance: 'radial-gradient(ellipse at 30% 40%, rgba(251,191,36,0.15) 0%, rgba(249,115,22,0.08) 50%, transparent 70%)',
  },
  'Outono': {
    particles: ['🍂', '🍁', '🌰', '🦉', '🍄'],
    gradient: ['#3b1a04', '#7c3d12'],
    ambiance: 'radial-gradient(ellipse at 70% 30%, rgba(180,83,9,0.15) 0%, rgba(146,64,14,0.08) 50%, transparent 70%)',
  },
  'Inverno': {
    particles: ['❄️', '⛄', '🌨️', '🏔️', '🧊'],
    gradient: ['#0c1445', '#1e3a8a'],
    ambiance: 'radial-gradient(ellipse at 50% 20%, rgba(147,197,253,0.12) 0%, rgba(59,130,246,0.06) 50%, transparent 70%)',
  },
  'Primavera': {
    particles: ['🌸', '🌺', '🦋', '🌼', '🐝'],
    gradient: ['#052e16', '#14532d'],
    ambiance: 'radial-gradient(ellipse at 40% 60%, rgba(134,239,172,0.12) 0%, rgba(34,197,94,0.06) 50%, transparent 70%)',
  },
}

// ══ FLOATING PARTICLE ════════════════════════════════════════════════════════
function FloatingParticle({ emoji, delay, duration, x }: { emoji: string; delay: number; duration: number; x: number }) {
  return (
    <div style={{
      position: 'absolute', left: `${x}%`, bottom: '-20px', fontSize: '1.2rem',
      animation: `floatUp ${duration}s ${delay}s infinite ease-in-out`,
      opacity: 0, pointerEvents: 'none', userSelect: 'none',
    }}>
      {emoji}
      <style>{`@keyframes floatUp { 0%{transform:translateY(0) rotate(0deg);opacity:0} 10%{opacity:0.6} 90%{opacity:0.3} 100%{transform:translateY(-280px) rotate(${Math.random()>0.5?15:-15}deg);opacity:0} }`}</style>
    </div>
  )
}

// ══ MAIN COMPONENT ════════════════════════════════════════════════════════════
export default function Geosfera() {
  const [now, setNow] = useState(new Date())
  const [curiosity] = useState(() => CURIOSITIES[Math.floor(Math.random() * CURIOSITIES.length)])
  const [activeTab, setActiveTab] = useState<'overview' | 'clocks' | 'earth' | 'calendar' | 'atlas'>('overview')

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(i)
  }, [])

  const moon = getMoonData(now)
  const season = getSeasonData(now)
  const sun = getSunData(now)
  const clocks = getWorldClocks(now)

  const seasonName = season.current.name
  const vis = SEASON_VISUALS[seasonName] || SEASON_VISUALS['Verão']

  // Calendar data
  const doy = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
  const weekNum = Math.ceil(doy / 7)
  const daysLeft = 365 - doy + (isLeapYear(now.getFullYear()) ? 1 : 0)
  const quarter = Math.ceil((now.getMonth() + 1) / 3)

  function isLeapYear(y: number) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 }

  // Next events
  const msToNewYear = new Date(now.getFullYear() + 1, 0, 1).getTime() - now.getTime()
  const daysToNewYear = Math.floor(msToNewYear / 86400000)
  const daysToFullMoon = moon.daysToNext

  // Equinoxes/solstices approx
  const solstices = [
    { name: 'Solstício de Verão', date: new Date(`${now.getFullYear()}-12-21`) },
    { name: 'Equinócio de Outono', date: new Date(`${now.getFullYear()}-03-21`) },
    { name: 'Solstício de Inverno', date: new Date(`${now.getFullYear()}-06-21`) },
    { name: 'Equinócio de Primavera', date: new Date(`${now.getFullYear()}-09-23`) },
  ]
  const nextSolstice = solstices.filter(s => s.date > now).sort((a,b) => a.date.getTime() - b.date.getTime())[0] || solstices[0]
  const daysToSolstice = Math.ceil((nextSolstice.date.getTime() - now.getTime()) / 86400000)

  const TABS = [
    { id: 'overview', label: 'Visão Geral', icon: '🌍' },
    { id: 'clocks',   label: 'Relógios',    icon: '🕐' },
    { id: 'earth',    label: 'Terra & Sol',  icon: '☀️' },
    { id: 'calendar', label: 'Calendário',   icon: '📅' },
    { id: 'atlas',    label: 'Atlas Global', icon: '🗺️' },
  ] as const

  // CSS vars
  const card: React.CSSProperties = {
    borderRadius: 20, border: '1px solid var(--border)',
    background: 'var(--card-bg)', backdropFilter: 'blur(12px)',
    overflow: 'hidden', position: 'relative',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: 'var(--bg-0)' }}>
      {/* Header */}
      <div style={{ padding: '22px 28px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,rgba(30,58,138,0.08),rgba(14,116,144,0.05),transparent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.6rem', background: 'linear-gradient(135deg,#60a5fa,#34d399,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em' }}>
              🌍 Geosfera
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Observatório Digital · {now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} · {now.toLocaleTimeString('pt-BR')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{ padding: '7px 14px', borderRadius: 10, border: `1px solid ${activeTab === tab.id ? 'rgba(96,165,250,0.5)' : 'var(--border)'}`, background: activeTab === tab.id ? 'rgba(96,165,250,0.12)' : 'transparent', color: activeTab === tab.id ? '#60a5fa' : 'var(--text-muted)', fontWeight: activeTab === tab.id ? 700 : 400, fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.2s' }}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '20px 28px 40px', overflowY: 'auto' }}>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* HERO ROW — Moon + Season */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

              {/* ── CARD LUNAR ── */}
              <div style={{ ...card, padding: 28 }}>
                {/* Starfield bg */}
                <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                  {Array.from({length:30},(_,i)=>(
                    <div key={i} style={{ position:'absolute', width: i%5===0?2:1, height: i%5===0?2:1, background:'var(--text-muted)', borderRadius:'50%', left:`${(i*37+13)%100}%`, top:`${(i*53+7)%100}%`, opacity: 0.3 + (i%4)*0.15 }}/>
                  ))}
                </div>

                <div style={{ position: 'relative', display: 'flex', gap: 22, alignItems: 'center' }}>
                  <MoonCanvas phase={moon.phase} size={140} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>Fase Lunar</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.3rem', color: 'var(--text-primary)', marginBottom: 3 }}>{moon.phaseIcon} {moon.phaseName}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>{moon.illumination}% iluminada · {moon.age} dias</div>

                    <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--bg-hover)', border: '1px solid var(--border-md)', marginBottom: 14 }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Próxima fase</div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.85rem' }}>{moon.nextPhaseLabel}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>em {Math.floor(moon.daysToNext)} dias e {Math.round((moon.daysToNext % 1) * 24)}h</div>
                    </div>

                    {/* Cycle progress */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.58rem', color: 'var(--text-muted)', marginBottom: 5 }}>
                        <span>🌑 Nova</span><span>🌓 Cresc.</span><span>🌕 Cheia</span><span>🌗 Ming.</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--border-md)', overflow: 'hidden', position: 'relative' }}>
                        <div style={{ height: '100%', width: `${moon.phase * 100}%`, background: 'linear-gradient(90deg,#6b6030,#fef08a,#fef9e7)', borderRadius: 3, transition: 'width 0.5s' }} />
                        <div style={{ position: 'absolute', top: '50%', left: `${moon.phase * 100}%`, transform: 'translate(-50%,-50%)', width: 10, height: 10, borderRadius: '50%', background: '#fef9e7', boxShadow: '0 0 8px rgba(255,250,180,0.8)' }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Phase icons timeline */}
                <div style={{ position: 'relative', marginTop: 18, display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
                  {['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'].map((ic, i) => (
                    <div key={i} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: i === moon.phaseIndex ? '1.4rem' : '0.85rem', transition: 'all 0.3s', filter: i === moon.phaseIndex ? 'drop-shadow(0 0 8px rgba(255,250,180,0.8))' : 'none', transform: i === moon.phaseIndex ? 'scale(1.3)' : 'scale(1)' }}>{ic}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── CARD ESTAÇÃO ── */}
              <div style={{ ...card, overflow: 'hidden', minHeight: 280 }}>
                <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(145deg,${vis.gradient[0]},${vis.gradient[1]})`, opacity: 0.9 }} />
                <div style={{ position: 'absolute', inset: 0, background: vis.ambiance }} />

                {/* Floating particles */}
                {vis.particles.map((em, i) => (
                  <FloatingParticle key={i} emoji={em} delay={i * 1.4} duration={5 + i * 0.8} x={10 + i * 18} />
                ))}

                <div style={{ position: 'relative', padding: 28, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>Estação Atual</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '2rem', color: '#fff', letterSpacing: '-0.02em', textShadow: '0 2px 20px rgba(0,0,0,0.4)', marginBottom: 4 }}>
                      {season.current.icon} {seasonName}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)' }}>Hemisfério Sul · Brasil</div>
                  </div>

                  {/* Countdown */}
                  <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(0,0,0,0.30)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)', marginTop: 12 }}>
                    <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                      Para {season.next.icon} {season.next.name}
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {[
                        { v: season.daysToNext, l: 'dias' },
                        { v: season.hoursToNext, l: 'horas' },
                        { v: season.minsToNext, l: 'min' },
                      ].map(item => (
                        <div key={item.l} style={{ textAlign: 'center', flex: 1 }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.6rem', color: '#fff', lineHeight: 1, textShadow: '0 0 20px rgba(255,255,255,0.3)' }}>{item.v}</div>
                          <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>{item.l}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'rgba(255,255,255,0.5)', marginBottom: 5 }}>
                      <span>Início</span><span>{season.pct}% da estação</span><span>Fim</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${season.pct}%`, background: 'rgba(255,255,255,0.7)', borderRadius: 4, transition: 'width 0.5s', boxShadow: '0 0 12px rgba(255,255,255,0.3)' }} />
                    </div>
                  </div>

                  {/* Seasons timeline */}
                  <div style={{ display: 'flex', gap: 0, marginTop: 14, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {[{n:'Verão',ic:'☀️'},{n:'Outono',ic:'🍂'},{n:'Inverno',ic:'❄️'},{n:'Primavera',ic:'🌸'}].map(s => (
                      <div key={s.n} style={{ flex: 1, padding: '8px 0', textAlign: 'center', background: s.n === seasonName ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.20)', transition: 'background 0.3s' }}>
                        <div style={{ fontSize: '0.9rem' }}>{s.ic}</div>
                        <div style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{s.n}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* SECONDARY CARDS GRID */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>

              {/* World Clocks mini */}
              <div style={{ ...card, padding: 20 }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  🕐 Relógios do Mundo
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {clocks.slice(0,3).map(z => (
                    <div key={z.city} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontSize: '1rem' }}>{z.flag}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)' }}>{z.city}</div>
                        <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>{z.date}</div>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.85rem', color: z.isDay ? '#fbbf24' : '#60a5fa' }}>{z.time}</div>
                      <div style={{ fontSize: '0.8rem' }}>{z.isDay ? '☀️' : '🌙'}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setActiveTab('clocks')} style={{ marginTop: 12, width: '100%', padding: '6px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.68rem', cursor: 'pointer' }}>Ver todos →</button>
              </div>

              {/* Sun */}
              <div style={{ ...card, padding: 20 }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)', marginBottom: 14 }}>☀️ Sol · Belo Horizonte</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { l: '🌅 Nascer', v: sun.sunrise },
                    { l: '🌇 Pôr', v: sun.sunset },
                    { l: '🌞 Meio-dia', v: sun.noon },
                    { l: '⏳ Duração', v: sun.duration },
                  ].map(item => (
                    <div key={item.l} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{item.l}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.95rem', color: '#fbbf24', marginTop: 3 }}>{item.v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contagens regressivas */}
              <div style={{ ...card, padding: 20 }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)', marginBottom: 14 }}>⏳ Próximos Eventos</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {[
                    { l: moon.nextPhaseLabel, v: `${Math.floor(daysToFullMoon)}d ${Math.round((daysToFullMoon%1)*24)}h`, c: '#fef9e7' },
                    { l: `${season.next.icon} ${season.next.name}`, v: `${season.daysToNext}d ${season.hoursToNext}h`, c: season.current.color1 },
                    { l: '🎆 Ano Novo', v: `${daysToNewYear} dias`, c: '#f472b6' },
                    { l: `🌐 ${nextSolstice.name}`, v: `${daysToSolstice} dias`, c: '#34d399' },
                  ].map(item => (
                    <div key={item.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderRadius: 9, background: 'var(--bg-hover)', border: '1px solid var(--border-md)' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{item.l}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.78rem', color: item.c }}>{item.v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Curiosidade */}
              <div style={{ ...card, padding: 20, background: 'linear-gradient(135deg,rgba(96,165,250,0.05),rgba(167,139,250,0.05))' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>✨ Curiosidade Geosférica</div>
                <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>{curiosity.icon}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7, fontStyle: 'italic' }}>"{curiosity.text}"</div>
              </div>
            </div>
          </div>
        )}

        {/* ── CLOCKS TAB ── */}
        {activeTab === 'clocks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Horário em tempo real · {now.toLocaleTimeString('pt-BR')} BRT</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14 }}>
              {clocks.map(z => (
                <div key={z.city} style={{ ...card, padding: 22, background: 'var(--card-bg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{z.flag}</div>
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>{z.city}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>{z.date}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <AnalogClock time={z.time} isDay={z.isDay} size={64} />
                      <div style={{ fontSize: '0.65rem', color: z.isDay ? '#fbbf24' : '#60a5fa' }}>{z.isDay ? '☀️ Dia' : '🌙 Noite'}</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 900, fontSize: '1.8rem', color: z.isDay ? '#fbbf24' : '#93c5fd', letterSpacing: '0.05em', textAlign: 'center' }}>
                    {z.time}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── EARTH TAB ── */}
        {activeTab === 'earth' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            {/* Globe */}
            <div style={{ ...card, padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)' }}>🌍 Dia e Noite na Terra</div>
              <EarthCanvas date={now} size={260} />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: 240 }}>
                A linha terminadora separa as regiões iluminadas das noturnas. Atual: {now.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })} UTC
              </div>
            </div>
            {/* Sun full data */}
            <div style={{ ...card, padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)' }}>☀️ Dados Solares · Belo Horizonte</div>
              {[
                { l: '🌅 Nascer do Sol', v: sun.sunrise, sub: 'horário local', c: '#fb923c' },
                { l: '🌞 Meio-dia Solar', v: sun.noon, sub: 'ponto mais alto', c: '#fbbf24' },
                { l: '🌇 Pôr do Sol', v: sun.sunset, sub: 'horário local', c: '#f97316' },
                { l: '⏳ Duração do Dia', v: sun.duration, sub: 'horas de luz', c: '#34d399' },
              ].map(item => (
                <div key={item.l} style={{ padding: '14px 16px', borderRadius: 12, background: `rgba(${item.c === '#fbbf24' ? '251,191,36' : item.c === '#34d399' ? '52,211,153' : '249,115,22'},0.07)`, border: `1px solid rgba(${item.c === '#fbbf24' ? '251,191,36' : item.c === '#34d399' ? '52,211,153' : '249,115,22'},0.2)` }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{item.l}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 900, fontSize: '1.4rem', color: item.c, marginTop: 4 }}>{item.v}</div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>{item.sub}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CALENDAR TAB ── */}
        {activeTab === 'atlas' && (
          <AtlasGlobal />
        )}

        {activeTab === 'calendar' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 16 }}>
            {[
              { l: '📅 Dia do Ano', v: doy, sub: `de ${isLeapYear(now.getFullYear()) ? 366 : 365}`, c: '96,165,250' },
              { l: '📆 Semana do Ano', v: weekNum, sub: `de 52`, c: '167,139,250' },
              { l: '📊 Trimestre', v: `Q${quarter}`, sub: now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }), c: '52,211,153' },
              { l: '⏳ Dias Restantes', v: daysLeft, sub: `para ${now.getFullYear() + 1}`, c: '251,191,36' },
              { l: '🌙 Próxima Lua', v: `${Math.floor(moon.daysToNext)}d`, sub: moon.nextPhaseLabel, c: '254,249,231' },
              { l: `${season.next.icon} ${season.next.name}`, v: `${season.daysToNext}d`, sub: 'próxima estação', c: '244,114,182' },
              { l: '🎆 Ano Novo', v: `${daysToNewYear}d`, sub: `${now.getFullYear() + 1}`, c: '248,113,113' },
              { l: '🌐 ' + nextSolstice.name, v: `${daysToSolstice}d`, sub: 'fenômeno astronômico', c: '34,211,153' },
            ].map(item => (
              <div key={item.l} style={{ ...card, padding: 22 }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 8 }}>{item.l}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '2rem', color: `rgb(${item.c})`, lineHeight: 1 }}>{item.v}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 6 }}>{item.sub}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
