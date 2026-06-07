import { useEffect, useState, useCallback } from 'react'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'

// ─── Types ────────────────────────────────────────────────────────────────────

// Remove undefined antes de salvar no Firestore
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T
}

interface RegistroSaude {
  id: string
  data: string
  agua: number
  metaAgua: number
  sono: { inicio: string; fim: string; qualidade: number }
  humor: number
  energia: number
  treino: { realizado: boolean; tipo: string; duracao: number }
  peso: number
  sintomas: string[]
  notas: string
  criadoEm: number
}

const TIPOS_TREINO = ['Musculação','Corrida','Ciclismo','Natação','Yoga','Pilates','Caminhada','Funcional','Crossfit','Artes Marciais','Outro']
const SINTOMAS_COMUNS = ['Dor de cabeça','Cansaço','Ansiedade','Dor nas costas','Insônia','Stress','Gripe/Resfriado','Dor muscular']

function today() { return new Date().toISOString().slice(0,10) }
function newId() { return Math.random().toString(36).slice(2,10) }

function defaultRegistro(data: string): RegistroSaude {
  return {
    id: newId(), data, agua: 0, metaAgua: 2000,
    sono: { inicio: '', fim: '', qualidade: 3 },
    humor: 3, energia: 3,
    treino: { realizado: false, tipo: '', duracao: 0 },
    peso: 0, sintomas: [], notas: '', criadoEm: Date.now(),
  }
}

function calcSono(inicio: string, fim: string): number {
  if (!inicio || !fim) return 0
  const [ih, im] = inicio.split(':').map(Number)
  const [fh, fm] = fim.split(':').map(Number)
  let mins = (fh * 60 + fm) - (ih * 60 + im)
  if (mins < 0) mins += 24 * 60
  return Math.round(mins / 60 * 10) / 10
}

function scoreBestar(r: RegistroSaude): number {
  const sonoH = calcSono(r.sono.inicio, r.sono.fim)
  const scoreSono = Math.min(sonoH / 8, 1) * 10
  const scoreHumor = ((r.humor - 1) / 4) * 10
  const scoreEnergia = ((r.energia - 1) / 4) * 10
  const scoreTreino = r.treino.realizado ? 10 : 0
  const scoreAgua = Math.min(r.agua / r.metaAgua, 1) * 10
  return Math.round(scoreHumor * 0.25 + scoreEnergia * 0.20 + scoreSono * 0.25 + scoreTreino * 0.15 + scoreAgua * 0.15)
}

function scoreColor(s: number): string {
  if (s >= 8) return '#6ee7a0'
  if (s >= 6) return '#fbbf24'
  if (s >= 4) return '#f87171'
  return '#a78bfa'
}

// ─── Estilos base ─────────────────────────────────────────────────────────────
const IS: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)',
  fontSize: '0.82rem', width: '100%', outline: 'none', boxSizing: 'border-box',
}
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--card-bg,#1a1b26)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '18px 20px', ...style }}>
      {children}
    </div>
  )
}
function CardTitle({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{title}</div>
        {sub && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>{children}</label>
}

// ─── Ring Gauge ───────────────────────────────────────────────────────────────
function Ring({ pct, color, size = 80, label }: { pct: number; color: string; size?: number; label?: string }) {
  const r = (size - 12) / 2, circ = 2 * Math.PI * r, dash = (pct / 100) * circ
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.8s ease', filter: `drop-shadow(0 0 6px ${color}80)` }} />
      </svg>
      {label && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: size > 70 ? '1.3rem' : '0.9rem', color, lineHeight: 1 }}>{label}</span>
        </div>
      )}
    </div>
  )
}

// ─── Emoji Selector (humor / energia / qualidade sono) ────────────────────────
function EmojiScale({ value, onChange, emojis, colors }: {
  value: number; onChange: (v: number) => void
  emojis: string[]; colors: string[]
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {emojis.map((e, i) => (
        <button key={i} onClick={() => onChange(i + 1)}
          style={{ width: 40, height: 40, borderRadius: 10, border: `2px solid ${value === i+1 ? colors[i] : 'rgba(255,255,255,0.1)'}`, background: value === i+1 ? `${colors[i]}22` : 'rgba(255,255,255,0.03)', fontSize: '1.2rem', cursor: 'pointer', transition: 'all 0.15s', transform: value === i+1 ? 'scale(1.15)' : 'scale(1)' }}>
          {e}
        </button>
      ))}
    </div>
  )
}

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ values, color, height = 36 }: { values: number[]; color: string; height?: number }) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1), min = Math.min(...values, 0)
  const w = 120, h = height
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / (max - min || 1)) * h
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={`${color}18`} stroke="none" />
    </svg>
  )
}

// ─── Barra de progresso ───────────────────────────────────────────────────────
function ProgressBar({ value, max, color, height = 8 }: { value: number; max: number; color: string; height?: number }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div style={{ height, borderRadius: height, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: height, transition: 'width 0.5s ease', boxShadow: `0 0 8px ${color}60` }} />
    </div>
  )
}

// ─── Histórico ────────────────────────────────────────────────────────────────
function HistoricoView({ registros, onSelect }: { registros: RegistroSaude[]; onSelect: (r: RegistroSaude) => void }) {
  const ultimos = [...registros].sort((a,b) => b.data.localeCompare(a.data)).slice(0, 30)
  const fmtData = (d: string) => { const [y,m,dd] = d.split('-'); return `${dd}/${m}/${y}` }

  return (
    <Card>
      <CardTitle icon="📅" title="Histórico" sub="Últimos 30 dias" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ultimos.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center', padding: '20px 0' }}>Nenhum registro ainda</p>}
        {ultimos.map(r => {
          const score = scoreBestar(r)
          const cor = scoreColor(score)
          const sono = calcSono(r.sono.inicio, r.sono.fim)
          return (
            <button key={r.id} onClick={() => onSelect(r)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${cor}18`, border: `1px solid ${cor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: cor, flexShrink: 0 }}>{score}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{fmtData(r.data)}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
                  {sono > 0 && <span>😴 {sono}h</span>}
                  <span>💧 {r.agua}ml</span>
                  {r.treino.realizado && <span>🏋️ {r.treino.tipo}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {['😢','😕','😐','😊','😄'][r.humor-1] && <span style={{ fontSize: '1.1rem' }}>{['😢','😕','😐','😊','😄'][r.humor-1]}</span>}
              </div>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

// ─── Formulário do dia ────────────────────────────────────────────────────────
function FormDia({ uid, registro, onSave }: { uid: string | null; registro: RegistroSaude; onSave: (r: RegistroSaude) => void }) {
  const [r, setR] = useState<RegistroSaude>(registro)
  const [saving, setSaving] = useState(false)
  const [novoSintoma, setNovoSintoma] = useState('')

  useEffect(() => { setR(registro) }, [registro.data])

  const upd = useCallback((partial: Partial<RegistroSaude>) => setR(prev => ({ ...prev, ...partial })), [])

  const save = async () => {
    if (!uid) return
    setSaving(true)
    await setDoc(doc(db, 'users', uid, 'saude', r.data), clean(r))
    onSave(r)
    setSaving(false)
  }

  const addAgua = (ml: number) => upd({ agua: Math.min(r.agua + ml, 5000) })
  const sonoH = calcSono(r.sono.inicio, r.sono.fim)
  const score = scoreBestar(r)
  const scoreCor = scoreColor(score)

  const HUMOR_EMOJIS = ['😢','😕','😐','😊','😄']
  const HUMOR_COLORS = ['#ef4444','#f87171','#fbbf24','#a3e635','#6ee7a0']
  const ENERGIA_EMOJIS = ['🪫','😴','⚡','🔋','🚀']
  const ENERGIA_COLORS = ['#ef4444','#f87171','#fbbf24','#a3e635','#6ee7a0']
  const SONO_EMOJIS = ['😫','😪','😐','😊','🌟']
  const SONO_COLORS = ['#ef4444','#f87171','#fbbf24','#a3e635','#6ee7a0']

  const pctAgua = Math.min((r.agua / r.metaAgua) * 100, 100)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Score do dia */}
      <Card style={{ background: `linear-gradient(135deg, ${scoreCor}12, rgba(255,255,255,0.02))`, border: `1px solid ${scoreCor}30` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Ring pct={score * 10} color={scoreCor} size={80} label={`${score}`} />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Score de Bem-Estar</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 }}>
              {score >= 8 ? '🌟 Excelente! Continue assim.' : score >= 6 ? '👍 Bom dia, pequenos ajustes.' : score >= 4 ? '⚠️ Atenção aos seus hábitos.' : '💜 Cuide de você hoje.'}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'Sono', val: sonoH > 0 ? `${sonoH}h` : '—', color: '#a5a3f5' },
                { label: 'Água', val: `${r.agua}ml`, color: '#60a5fa' },
                { label: 'Humor', val: HUMOR_EMOJIS[r.humor-1], color: HUMOR_COLORS[r.humor-1] },
                { label: 'Treino', val: r.treino.realizado ? '✅' : '—', color: '#6ee7a0' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Hidratação */}
      <Card>
        <CardTitle icon="💧" title="Hidratação" sub={`Meta: ${r.metaAgua}ml`} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', color: '#60a5fa' }}>{r.agua}ml</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'flex-end' }}>{Math.round(pctAgua)}%</span>
            </div>
            <ProgressBar value={r.agua} max={r.metaAgua} color="#60a5fa" height={10} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[200, 300, 500].map(ml => (
            <button key={ml} onClick={() => addAgua(ml)}
              style={{ flex: 1, padding: '8px 4px', borderRadius: 9, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', color: '#60a5fa', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(96,165,250,0.18)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(96,165,250,0.08)'}>
              +{ml}ml
            </button>
          ))}
          <button onClick={() => upd({ agua: Math.max(0, r.agua - 200) })}
            style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer' }}>
            −
          </button>
        </div>
        <div style={{ marginTop: 10 }}>
          <Lbl>Meta personalizada (ml)</Lbl>
          <input type="number" style={IS} value={r.metaAgua} onChange={e => upd({ metaAgua: Number(e.target.value) })} step={100} min={500} max={5000} />
        </div>
      </Card>

      {/* Sono */}
      <Card>
        <CardTitle icon="😴" title="Sono" sub={sonoH > 0 ? `${sonoH}h dormidas` : 'Registre seu sono'} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <Lbl>Hora de dormir</Lbl>
            <input type="time" style={IS} value={r.sono.inicio} onChange={e => upd({ sono: { ...r.sono, inicio: e.target.value } })} />
          </div>
          <div>
            <Lbl>Hora de acordar</Lbl>
            <input type="time" style={IS} value={r.sono.fim} onChange={e => upd({ sono: { ...r.sono, fim: e.target.value } })} />
          </div>
        </div>
        {sonoH > 0 && (
          <div style={{ padding: '8px 14px', borderRadius: 10, background: sonoH >= 7 ? 'rgba(110,231,160,0.08)' : sonoH >= 6 ? 'rgba(251,191,36,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${sonoH >= 7 ? 'rgba(110,231,160,0.2)' : sonoH >= 6 ? 'rgba(251,191,36,0.2)' : 'rgba(248,113,113,0.2)'}`, marginBottom: 12, fontSize: '0.75rem', color: sonoH >= 7 ? '#6ee7a0' : sonoH >= 6 ? '#fbbf24' : '#f87171' }}>
            {sonoH >= 8 ? '🌟 Sono excelente!' : sonoH >= 7 ? '👍 Sono adequado' : sonoH >= 6 ? '⚠️ Sono razoável — tente dormir mais' : '😴 Sono insuficiente — priorize o descanso'}
          </div>
        )}
        <Lbl>Qualidade do sono</Lbl>
        <EmojiScale value={r.sono.qualidade} onChange={v => upd({ sono: { ...r.sono, qualidade: v } })} emojis={SONO_EMOJIS} colors={SONO_COLORS} />
      </Card>

      {/* Humor & Energia */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card>
          <CardTitle icon="😊" title="Humor" />
          <EmojiScale value={r.humor} onChange={v => upd({ humor: v })} emojis={HUMOR_EMOJIS} colors={HUMOR_COLORS} />
          <div style={{ marginTop: 8, fontSize: '0.72rem', color: HUMOR_COLORS[r.humor-1], fontWeight: 600 }}>
            {['Muito mal','Mal','Neutro','Bem','Ótimo'][r.humor-1]}
          </div>
        </Card>
        <Card>
          <CardTitle icon="⚡" title="Energia" />
          <EmojiScale value={r.energia} onChange={v => upd({ energia: v })} emojis={ENERGIA_EMOJIS} colors={ENERGIA_COLORS} />
          <div style={{ marginTop: 8, fontSize: '0.72rem', color: ENERGIA_COLORS[r.energia-1], fontWeight: 600 }}>
            {['Sem energia','Com sono','OK','Disposto','Cheio de energia'][r.energia-1]}
          </div>
        </Card>
      </div>

      {/* Treino */}
      <Card>
        <CardTitle icon="🏋️" title="Atividade Física" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <button onClick={() => upd({ treino: { ...r.treino, realizado: !r.treino.realizado } })}
            style={{ width: 44, height: 44, borderRadius: 12, border: `2px solid ${r.treino.realizado ? '#6ee7a0' : 'rgba(255,255,255,0.15)'}`, background: r.treino.realizado ? 'rgba(110,231,160,0.15)' : 'rgba(255,255,255,0.04)', fontSize: '1.4rem', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }}>
            {r.treino.realizado ? '✅' : '○'}
          </button>
          <div>
            <div style={{ fontWeight: 700, color: r.treino.realizado ? '#6ee7a0' : 'var(--text-muted)', fontSize: '0.88rem' }}>
              {r.treino.realizado ? 'Treino realizado hoje!' : 'Nenhum treino registrado'}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>Clique para marcar</div>
          </div>
        </div>
        {r.treino.realizado && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
            <div>
              <Lbl>Tipo de atividade</Lbl>
              <select style={IS} value={r.treino.tipo} onChange={e => upd({ treino: { ...r.treino, tipo: e.target.value } })}>
                <option value="">Selecionar...</option>
                {TIPOS_TREINO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Lbl>Duração (min)</Lbl>
              <input type="number" style={{ ...IS, width: 90 }} value={r.treino.duracao || ''} onChange={e => upd({ treino: { ...r.treino, duracao: Number(e.target.value) } })} min={0} max={360} />
            </div>
          </div>
        )}
      </Card>

      {/* Peso */}
      <Card>
        <CardTitle icon="⚖️" title="Peso Corporal" sub="Opcional" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input type="number" style={{ ...IS, flex: 1 }} value={r.peso || ''} onChange={e => upd({ peso: Number(e.target.value) })} placeholder="Ex: 75.5" step={0.1} min={30} max={300} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', flexShrink: 0 }}>kg</span>
        </div>
      </Card>

      {/* Sintomas */}
      <Card>
        <CardTitle icon="🩺" title="Sintomas" sub="Marque o que sentiu hoje" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
          {SINTOMAS_COMUNS.map(s => {
            const ativo = r.sintomas.includes(s)
            return (
              <button key={s} onClick={() => upd({ sintomas: ativo ? r.sintomas.filter(x => x !== s) : [...r.sintomas, s] })}
                style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${ativo ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.1)'}`, background: ativo ? 'rgba(248,113,113,0.12)' : 'rgba(255,255,255,0.03)', color: ativo ? '#f87171' : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: ativo ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s' }}>
                {s}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={IS} value={novoSintoma} onChange={e => setNovoSintoma(e.target.value)} placeholder="Adicionar sintoma personalizado..." onKeyDown={e => { if (e.key === 'Enter' && novoSintoma.trim()) { upd({ sintomas: [...r.sintomas, novoSintoma.trim()] }); setNovoSintoma('') } }} />
          <button onClick={() => { if (novoSintoma.trim()) { upd({ sintomas: [...r.sintomas, novoSintoma.trim()] }); setNovoSintoma('') } }}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Add
          </button>
        </div>
      </Card>

      {/* Notas */}
      <Card>
        <CardTitle icon="📝" title="Notas do Dia" sub="Observações livres" />
        <textarea style={{ ...IS, minHeight: 80, resize: 'vertical', lineHeight: 1.6 }} value={r.notas} onChange={e => upd({ notas: e.target.value })} placeholder="Como foi seu dia? Alguma observação importante sobre sua saúde ou bem-estar..." />
      </Card>

      {/* Salvar */}
      <button onClick={save} disabled={saving}
        style={{ padding: '14px', borderRadius: 12, border: 'none', background: saving ? 'rgba(110,231,160,0.2)' : 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.92rem', cursor: saving ? 'not-allowed' : 'pointer', transition: 'opacity 0.2s', letterSpacing: '0.02em' }}>
        {saving ? 'Salvando…' : '💾 Salvar Registro do Dia'}
      </button>
    </div>
  )
}

// ─── Gráficos semanais ────────────────────────────────────────────────────────
function GraficosView({ registros }: { registros: RegistroSaude[] }) {
  const ultimos7 = [...registros].sort((a,b) => a.data.localeCompare(b.data)).slice(-7)
  const labels = ultimos7.map(r => { const [,m,d] = r.data.split('-'); return `${d}/${m}` })
  const scores = ultimos7.map(scoreBestar)
  const humores = ultimos7.map(r => r.humor)
  const energias = ultimos7.map(r => r.energia)
  const sonos = ultimos7.map(r => calcSono(r.sono.inicio, r.sono.fim))
  const aguas = ultimos7.map(r => Math.round((r.agua / r.metaAgua) * 100))

  const BarChart = ({ values, color, max, label }: { values: number[]; color: string; max: number; label: string }) => (
    <div>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 60 }}>
        {values.map((v, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{ width: '100%', height: Math.max((v / max) * 52, 3), background: color, borderRadius: 4, opacity: 0.75 + (v/max)*0.25, transition: 'height 0.5s ease', boxShadow: `0 0 6px ${color}40` }} />
            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{labels[i] || ''}</div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card>
        <CardTitle icon="📈" title="Score de Bem-Estar" sub="Últimos 7 dias" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Sparkline values={scores} color="#6ee7a0" height={50} />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.8rem', color: scoreColor(scores[scores.length-1] || 0) }}>{scores[scores.length-1] || '—'}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Score hoje</div>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card><BarChart values={humores} color="#fbbf24" max={5} label="Humor" /></Card>
        <Card><BarChart values={energias} color="#a5a3f5" max={5} label="Energia" /></Card>
        <Card><BarChart values={sonos} color="#60a5fa" max={10} label="Sono (h)" /></Card>
        <Card><BarChart values={aguas} color="#34d399" max={100} label="Hidratação %" /></Card>
      </div>

      <Card>
        <CardTitle icon="🏋️" title="Treinos na Semana" />
        <div style={{ display: 'flex', gap: 8 }}>
          {ultimos7.map((r, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ width: '100%', aspectRatio: '1', borderRadius: 8, background: r.treino.realizado ? 'rgba(110,231,160,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${r.treino.realizado ? 'rgba(110,231,160,0.4)' : 'rgba(255,255,255,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', marginBottom: 4 }}>
                {r.treino.realizado ? '✅' : '○'}
              </div>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{labels[i]}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {ultimos7.filter(r => r.treino.realizado).length} de {ultimos7.length} dias com treino
        </div>
      </Card>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SaudeBemEstar() {
  const uid = useUid()
  const [registros, setRegistros] = useState<RegistroSaude[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'hoje'|'graficos'|'historico'>('hoje')
  const [dataSelecionada, setDataSelecionada] = useState(today())
  const [registroAtual, setRegistroAtual] = useState<RegistroSaude>(defaultRegistro(today()))
  const isHoje = dataSelecionada === today()

  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, 'users', uid, 'saude'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as RegistroSaude))
      setRegistros(list)
      const r = list.find(x => x.data === dataSelecionada)
      setRegistroAtual(r || defaultRegistro(dataSelecionada))
      setLoading(false)
    })
  }, [uid, dataSelecionada])

  const scoreAtual = scoreBestar(registroAtual)
  const scoreCor = scoreColor(scoreAtual)
  const sonoAtual = calcSono(registroAtual.sono.inicio, registroAtual.sono.fim)

  const streak = (() => {
    let s = 0, d = new Date(); d.setHours(0,0,0,0)
    while (true) {
      const ds = d.toISOString().slice(0,10)
      if (!registros.find(r => r.data === ds)) break
      s++; d.setDate(d.getDate()-1)
    }
    return s
  })()

  // Formatar data por extenso
  const fmtDataExtenso = (ds: string) => {
    const d = new Date(ds + 'T12:00:00')
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  const mudaData = (novaData: string) => {
    setDataSelecionada(novaData)
    const r = registros.find(x => x.data === novaData)
    setRegistroAtual(r || defaultRegistro(novaData))
  }

  const irParaOntem = () => {
    const d = new Date(dataSelecionada + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    mudaData(d.toISOString().slice(0, 10))
  }
  const irParaProximo = () => {
    const d = new Date(dataSelecionada + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    const nova = d.toISOString().slice(0, 10)
    if (nova <= today()) mudaData(nova)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#10b981', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ padding: '0', display: 'flex', flexDirection: 'column', minHeight: '100%', boxSizing: 'border-box' }}>

      {/* ── BANNER DE DATA EM DESTAQUE ─────────────────────────────── */}
      <div style={{
        background: isHoje
          ? 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(52,211,153,0.08) 50%, rgba(6,12,20,0.0) 100%)'
          : 'linear-gradient(135deg, rgba(91,91,214,0.12) 0%, rgba(6,12,20,0.0) 100%)',
        borderBottom: `1px solid ${isHoje ? 'rgba(16,185,129,0.25)' : 'rgba(91,91,214,0.2)'}`,
        padding: '20px 28px 18px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Orbe decorativo */}
        <div style={{
          position: 'absolute', top: -40, right: -40, width: 160, height: 160,
          borderRadius: '50%',
          background: isHoje ? 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(91,91,214,0.1) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          {/* Data em destaque */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Bloco de data */}
            <div style={{
              width: 60, height: 60, borderRadius: 14, flexShrink: 0,
              background: isHoje ? 'rgba(16,185,129,0.15)' : 'rgba(91,91,214,0.12)',
              border: `2px solid ${isHoje ? 'rgba(16,185,129,0.4)' : 'rgba(91,91,214,0.35)'}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              boxShadow: isHoje ? '0 0 20px rgba(16,185,129,0.15)' : '0 0 20px rgba(91,91,214,0.12)',
            }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', lineHeight: 1, color: isHoje ? '#34d399' : '#a5a3f5' }}>
                {new Date(dataSelecionada + 'T12:00:00').getDate()}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 600, color: isHoje ? '#6ee7a0' : '#a5a3f5', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 1 }}>
                {new Date(dataSelecionada + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}
              </div>
            </div>

            <div>
              {isHoje && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 20, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', marginBottom: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', animation: 'pulse-dot 2s infinite' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700, color: '#34d399', letterSpacing: '0.1em' }}>HOJE</span>
                </div>
              )}
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {fmtDataExtenso(dataSelecionada)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
                {streak > 0 && isHoje ? `🔥 ${streak} dia${streak > 1 ? 's' : ''} consecutivo${streak > 1 ? 's' : ''} com registro` : !isHoje ? '📂 Visualizando registro passado' : 'Faça seu registro diário'}
              </div>
            </div>
          </div>

          {/* Navegação de data + score resumo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Score badge */}
            {scoreAtual > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                borderRadius: 12, background: `${scoreCor}15`, border: `1px solid ${scoreCor}35`,
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.6rem', color: scoreCor, lineHeight: 1 }}>{scoreAtual}</div>
                <div>
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, color: scoreCor }}>Score</div>
                  <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>bem-estar</div>
                </div>
              </div>
            )}

            {/* Nav dias */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={irParaOntem}
                style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
              <input type="date" value={dataSelecionada} max={today()}
                onChange={e => mudaData(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 9, border: '1px solid var(--border-md)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.78rem', outline: 'none', fontFamily: 'var(--font-mono)' }} />
              <button onClick={irParaProximo} disabled={dataSelecionada >= today()}
                style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border-md)', background: 'var(--surface)', color: dataSelecionada >= today() ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: dataSelecionada >= today() ? 'not-allowed' : 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: dataSelecionada >= today() ? 0.4 : 1 }}>›</button>
            </div>
          </div>
        </div>

        {/* KPIs rápidos */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          {[
            { icon: '😊', label: 'Humor', val: ['Muito mal','Mal','Neutro','Bem','Ótimo'][registroAtual.humor-1], color: '#fbbf24' },
            { icon: '⚡', label: 'Energia', val: ['Sem energia','Com sono','OK','Disposto','Pleno'][registroAtual.energia-1], color: '#a5a3f5' },
            { icon: '😴', label: 'Sono', val: sonoAtual > 0 ? `${sonoAtual}h` : '—', color: '#60a5fa' },
            { icon: '💧', label: 'Hidratação', val: `${registroAtual.agua}ml`, color: '#34d399' },
            { icon: '🏋️', label: 'Treino', val: registroAtual.treino.realizado ? (registroAtual.treino.tipo || 'Sim') : '—', color: '#6ee7a0' },
            { icon: '⚖️', label: 'Peso', val: registroAtual.peso > 0 ? `${registroAtual.peso}kg` : '—', color: '#f87171' },
          ].map(k => (
            <div key={k.label} style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.9rem' }}>{k.icon}</span>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: k.val !== '—' ? k.color : 'var(--text-muted)', lineHeight: 1 }}>{k.val}</div>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 1 }}>{k.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── ABAS ──────────────────────────────────────────────────── */}
      <div style={{ padding: '12px 28px 0', borderBottom: '1px solid var(--border-md)' }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {[
            { id: 'hoje', label: '📋 Registrar' },
            { id: 'graficos', label: '📈 Gráficos' },
            { id: 'historico', label: '📅 Histórico' },
          ].map(a => (
            <button key={a.id} onClick={() => setAba(a.id as any)}
              style={{
                padding: '10px 20px', border: 'none', background: 'transparent',
                color: aba === a.id ? 'var(--text-primary)' : 'var(--text-muted)',
                fontFamily: 'var(--font-display)', fontWeight: aba === a.id ? 700 : 500,
                fontSize: '0.82rem', cursor: 'pointer',
                borderBottom: aba === a.id ? '2px solid #10b981' : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.15s',
              }}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTEÚDO ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
        {aba === 'hoje' && <FormDia uid={uid} registro={registroAtual} onSave={r => setRegistroAtual(r)} />}
        {aba === 'graficos' && <GraficosView registros={registros} />}
        {aba === 'historico' && <HistoricoView registros={registros} onSelect={r => { mudaData(r.data); setAba('hoje') }} />}
      </div>
    </div>
  )
}
