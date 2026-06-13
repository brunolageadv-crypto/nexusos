import { useEffect, useState, useCallback, useMemo } from 'react'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'

// ─── Types ────────────────────────────────────────────────────────────────────
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}
interface RegistroSaude {
  id: string; data: string; agua: number; metaAgua: number
  sono: { inicio: string; fim: string; qualidade: number }
  humor: number; energia: number
  treino: { realizado: boolean; tipo: string; duracao: number }
  peso: number; sintomas: string[]; notas: string; criadoEm: number
}
const TIPOS_TREINO = ['Musculação','Corrida','Ciclismo','Natação','Yoga','Pilates','Caminhada','Funcional','Crossfit','Artes Marciais','Outro']
const SINTOMAS_COMUNS = ['Dor de cabeça','Cansaço','Ansiedade','Dor nas costas','Insônia','Stress','Gripe/Resfriado','Dor muscular','Azia','Tontura','Náusea','Palpitação']
function today() { return new Date().toISOString().slice(0,10) }
function newId() { return Math.random().toString(36).slice(2,10) }
function defaultRegistro(data: string): RegistroSaude {
  return { id: newId(), data, agua: 0, metaAgua: 2000, sono: { inicio:'', fim:'', qualidade:3 }, humor:3, energia:3, treino:{ realizado:false, tipo:'', duracao:0 }, peso:0, sintomas:[], notas:'', criadoEm: Date.now() }
}
function calcSono(inicio: string, fim: string): number {
  if (!inicio || !fim) return 0
  const [ih,im] = inicio.split(':').map(Number)
  const [fh,fm] = fim.split(':').map(Number)
  let mins = (fh*60+fm)-(ih*60+im)
  if (mins < 0) mins += 1440
  return Math.round(mins/60*10)/10
}
function scoreBestar(r: RegistroSaude): number {
  const sonoH = calcSono(r.sono.inicio, r.sono.fim)
  return Math.round(
    ((r.humor-1)/4)*25 +
    Math.min(r.agua/r.metaAgua,1)*25 +
    (r.treino.realizado?25:0) +
    Math.min(sonoH/8,1)*25
  )
}
function scoreColor(s: number) {
  if (s >= 80) return '#34d399'
  if (s >= 60) return '#fbbf24'
  if (s >= 40) return '#f87171'
  return '#a78bfa'
}
function scoreMsg(s: number) {
  if (s >= 80) return '🌟 Excelente! Continue assim.'
  if (s >= 60) return '👍 Bom dia — pequenos ajustes.'
  if (s >= 40) return '⚠️ Atenção aos seus hábitos.'
  return '💜 Cuide bem de você hoje.'
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const IS: React.CSSProperties = {
  background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
  borderRadius:8, padding:'9px 12px', color:'var(--text-primary)',
  fontSize:'0.82rem', width:'100%', outline:'none', boxSizing:'border-box',
}
const PASTEL: Record<string,{bg:string;border:string;text:string}> = {
  blue:  { bg:'rgba(96,165,250,0.07)',  border:'rgba(96,165,250,0.22)',  text:'#93c5fd' },
  green: { bg:'rgba(52,211,153,0.07)',  border:'rgba(52,211,153,0.22)',  text:'#6ee7b7' },
  amber: { bg:'rgba(251,191,36,0.07)',  border:'rgba(251,191,36,0.22)',  text:'#fcd34d' },
  purple:{ bg:'rgba(167,139,250,0.07)', border:'rgba(167,139,250,0.22)', text:'#c4b5fd' },
  red:   { bg:'rgba(248,113,113,0.07)', border:'rgba(248,113,113,0.22)', text:'#fca5a5' },
  teal:  { bg:'rgba(45,212,191,0.07)',  border:'rgba(45,212,191,0.22)',  text:'#5eead4' },
}

// ─── Primitives ───────────────────────────────────────────────────────────────
function Card({ children, style, pastel }: { children: React.ReactNode; style?: React.CSSProperties; pastel?: keyof typeof PASTEL }) {
  const p = pastel ? PASTEL[pastel] : null
  return (
    <div style={{ background: p ? p.bg : 'var(--card-bg,#1a1b26)', border: `1px solid ${p ? p.border : 'rgba(255,255,255,0.08)'}`, borderRadius:16, padding:'18px 20px', ...style }}>
      {children}
    </div>
  )
}
function Lbl({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize:'0.62rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.09em', display:'block', marginBottom:6 }}>{children}</label>
}
function ProgressBar({ value, max, color, height=8 }: { value:number; max:number; color:string; height?:number }) {
  const pct = Math.min((value/max)*100, 100)
  return (
    <div style={{ height, borderRadius:height, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
      <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:height, transition:'width 0.6s ease', boxShadow:`0 0 8px ${color}50` }} />
    </div>
  )
}
function EmojiScale({ value, onChange, emojis, colors }: { value:number; onChange:(v:number)=>void; emojis:string[]; colors:string[] }) {
  return (
    <div style={{ display:'flex', gap:8 }}>
      {emojis.map((e,i) => (
        <button key={i} onClick={()=>onChange(i+1)}
          style={{ width:42, height:42, borderRadius:12, border:`2px solid ${value===i+1?colors[i]:'rgba(255,255,255,0.1)'}`, background:value===i+1?`${colors[i]}20`:'rgba(255,255,255,0.03)', fontSize:'1.25rem', cursor:'pointer', transition:'all 0.15s', transform:value===i+1?'scale(1.18)':'scale(1)' }}>
          {e}
        </button>
      ))}
    </div>
  )
}
// Score arc (SVG semicircle)
function ScoreArc({ score }: { score:number }) {
  const color = scoreColor(score)
  const size = 160, stroke = 14, r = (size-stroke)/2
  const circ = Math.PI * r // semicircle
  const dash = (score/100)*circ
  return (
    <div style={{ position:'relative', width:size, height:size/2+20, flexShrink:0 }}>
      <svg width={size} height={size/2+stroke} viewBox={`0 0 ${size} ${size/2+stroke}`}>
        <path d={`M ${stroke/2} ${size/2} A ${r} ${r} 0 0 1 ${size-stroke/2} ${size/2}`}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} strokeLinecap="round" />
        <path d={`M ${stroke/2} ${size/2} A ${r} ${r} 0 0 1 ${size-stroke/2} ${size/2}`}
          fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition:'stroke-dasharray 0.9s ease', filter:`drop-shadow(0 0 8px ${color}80)` }} />
      </svg>
      <div style={{ position:'absolute', bottom:0, left:0, right:0, textAlign:'center' }}>
        <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'2.4rem', color, lineHeight:1 }}>{score}</div>
        <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', letterSpacing:'0.1em', textTransform:'uppercase', marginTop:2 }}>bem-estar</div>
      </div>
    </div>
  )
}
function Sparkline({ values, color, height=40, width=100 }: { values:number[]; color:string; height?:number; width?:number }) {
  if (values.length < 2) return null
  const max = Math.max(...values,1), min = Math.min(...values,0)
  const pts = values.map((v,i) => `${(i/(values.length-1))*width},${height-((v-min)/(max-min||1))*height}`).join(' ')
  return (
    <svg width={width} height={height} style={{ overflow:'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={`0,${height} ${pts} ${width},${height}`} fill={`${color}15`} stroke="none" />
      {/* last dot */}
      {values.length > 0 && (
        <circle cx={(values.length-1)/(values.length-1)*width} cy={height-((values[values.length-1]-min)/(max-min||1))*height} r={3} fill={color} />
      )}
    </svg>
  )
}

// ─── Gaveta lateral (Quick Log Drawer) ────────────────────────────────────────
function Drawer({ open, onClose, uid, registro, onSave }: {
  open:boolean; onClose:()=>void; uid:string|null; registro:RegistroSaude; onSave:(r:RegistroSaude)=>void
}) {
  const [r, setR] = useState<RegistroSaude>(registro)
  const [saving, setSaving] = useState(false)
  const [novoSintoma, setNovoSintoma] = useState('')

  useEffect(() => { setR(registro) }, [registro.id, registro.data])

  const upd = useCallback((p: Partial<RegistroSaude>) => setR(prev=>({...prev,...p})), [])
  const addAgua = (ml:number) => upd({ agua: Math.min(r.agua+ml,5000) })

  const save = async () => {
    if (!uid) return
    setSaving(true)
    await setDoc(doc(db,'users',uid,'saude',r.data), clean(r))
    onSave(r)
    setSaving(false)
    onClose()
  }

  const HUMOR_EMOJIS  = ['😢','😕','😐','😊','😄']
  const HUMOR_COLORS  = ['#ef4444','#f87171','#fbbf24','#a3e635','#6ee7a0']
  const ENERGIA_EMOJIS= ['🪫','😴','⚡','🔋','🚀']
  const ENERGIA_COLORS= ['#ef4444','#f87171','#fbbf24','#a3e635','#6ee7a0']
  const SONO_EMOJIS   = ['😫','😪','😐','😊','🌟']
  const SONO_COLORS   = ['#ef4444','#f87171','#fbbf24','#a3e635','#6ee7a0']
  const sonoH = calcSono(r.sono.inicio, r.sono.fim)

  return (
    <>
      {/* Overlay */}
      {open && <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:998,background:'rgba(0,0,0,0.55)',backdropFilter:'blur(4px)' }} />}
      {/* Drawer */}
      <div style={{
        position:'fixed', top:0, right:0, bottom:0, zIndex:999,
        width: Math.min(460, window.innerWidth),
        background:'var(--bg-2,#16171f)', borderLeft:'1px solid rgba(255,255,255,0.09)',
        boxShadow:'-20px 0 60px rgba(0,0,0,0.5)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition:'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        display:'flex', flexDirection:'column', overflow:'hidden',
      }}>
        {/* Header */}
        <div style={{ padding:'18px 22px', borderBottom:'1px solid rgba(255,255,255,0.08)', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1rem', color:'var(--text-primary)' }}>📋 Registrar Rotina</div>
            <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', marginTop:2, fontFamily:'var(--font-mono)' }}>{new Date(r.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'})}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:'1.4rem', cursor:'pointer', lineHeight:1 }}>✕</button>
        </div>
        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'18px 22px', display:'flex', flexDirection:'column', gap:20 }}>

          {/* Hidratação */}
          <section>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:'1.1rem' }}>💧</span>
              <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.9rem', color:'var(--text-primary)' }}>Hidratação</span>
              <span style={{ marginLeft:'auto', fontFamily:'var(--font-mono)', fontWeight:800, fontSize:'0.9rem', color:'#60a5fa' }}>{r.agua}ml</span>
            </div>
            <ProgressBar value={r.agua} max={r.metaAgua} color="#60a5fa" height={8} />
            <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
              {[150,200,300,500].map(ml=>(
                <button key={ml} onClick={()=>addAgua(ml)}
                  style={{ flex:1, minWidth:60, padding:'8px 4px', borderRadius:9, border:'1px solid rgba(96,165,250,0.3)', background:'rgba(96,165,250,0.08)', color:'#60a5fa', fontWeight:700, fontSize:'0.78rem', cursor:'pointer' }}>
                  +{ml}ml
                </button>
              ))}
              <button onClick={()=>upd({agua:Math.max(0,r.agua-200)})}
                style={{ padding:'8px 12px', borderRadius:9, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--text-muted)', fontSize:'0.82rem', cursor:'pointer' }}>−</button>
            </div>
            <div style={{ marginTop:10 }}>
              <Lbl>Meta (ml)</Lbl>
              <input type="number" style={IS} value={r.metaAgua} onChange={e=>upd({metaAgua:Number(e.target.value)})} step={100} min={500} max={5000} />
            </div>
          </section>

          <div style={{ height:1, background:'rgba(255,255,255,0.07)' }} />

          {/* Sono */}
          <section>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:'1.1rem' }}>😴</span>
              <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.9rem', color:'var(--text-primary)' }}>Sono</span>
              {sonoH > 0 && <span style={{ marginLeft:'auto', fontFamily:'var(--font-mono)', fontWeight:700, fontSize:'0.82rem', color: sonoH>=7?'#6ee7a0':sonoH>=6?'#fbbf24':'#f87171' }}>{sonoH}h</span>}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              <div><Lbl>Dormir</Lbl><input type="time" style={IS} value={r.sono.inicio} onChange={e=>upd({sono:{...r.sono,inicio:e.target.value}})} /></div>
              <div><Lbl>Acordar</Lbl><input type="time" style={IS} value={r.sono.fim} onChange={e=>upd({sono:{...r.sono,fim:e.target.value}})} /></div>
            </div>
            <Lbl>Qualidade</Lbl>
            <EmojiScale value={r.sono.qualidade} onChange={v=>upd({sono:{...r.sono,qualidade:v}})} emojis={SONO_EMOJIS} colors={SONO_COLORS} />
          </section>

          <div style={{ height:1, background:'rgba(255,255,255,0.07)' }} />

          {/* Humor & Energia */}
          <section>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
                  <span style={{ fontSize:'1rem' }}>😊</span>
                  <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.85rem', color:'var(--text-primary)' }}>Humor</span>
                </div>
                <EmojiScale value={r.humor} onChange={v=>upd({humor:v})} emojis={HUMOR_EMOJIS} colors={HUMOR_COLORS} />
                <div style={{ marginTop:6, fontSize:'0.7rem', color:HUMOR_COLORS[r.humor-1], fontWeight:600 }}>
                  {['Muito mal','Mal','Neutro','Bem','Ótimo'][r.humor-1]}
                </div>
              </div>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
                  <span style={{ fontSize:'1rem' }}>⚡</span>
                  <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.85rem', color:'var(--text-primary)' }}>Energia</span>
                </div>
                <EmojiScale value={r.energia} onChange={v=>upd({energia:v})} emojis={ENERGIA_EMOJIS} colors={ENERGIA_COLORS} />
                <div style={{ marginTop:6, fontSize:'0.7rem', color:ENERGIA_COLORS[r.energia-1], fontWeight:600 }}>
                  {['Sem energia','Com sono','OK','Disposto','Pleno'][r.energia-1]}
                </div>
              </div>
            </div>
          </section>

          <div style={{ height:1, background:'rgba(255,255,255,0.07)' }} />

          {/* Treino */}
          <section>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:'1.1rem' }}>🏋️</span>
              <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.9rem', color:'var(--text-primary)' }}>Treino</span>
            </div>
            <button onClick={()=>upd({treino:{...r.treino,realizado:!r.treino.realizado}})}
              style={{ width:'100%', padding:'12px', borderRadius:12, border:`2px solid ${r.treino.realizado?'rgba(110,231,160,0.5)':'rgba(255,255,255,0.12)'}`, background:r.treino.realizado?'rgba(110,231,160,0.1)':'rgba(255,255,255,0.03)', color:r.treino.realizado?'#6ee7a0':'var(--text-muted)', fontWeight:700, fontSize:'0.85rem', cursor:'pointer', marginBottom:12, transition:'all 0.18s' }}>
              {r.treino.realizado?'✅ Treino realizado':'○ Marcar treino do dia'}
            </button>
            {r.treino.realizado && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10 }}>
                <div>
                  <Lbl>Tipo</Lbl>
                  <select style={IS} value={r.treino.tipo} onChange={e=>upd({treino:{...r.treino,tipo:e.target.value}})}>
                    <option value="">Selecionar…</option>
                    {TIPOS_TREINO.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <Lbl>Duração (min)</Lbl>
                  <input type="number" style={{...IS,width:90}} value={r.treino.duracao||''} onChange={e=>upd({treino:{...r.treino,duracao:Number(e.target.value)}})} min={0} max={360} />
                </div>
              </div>
            )}
          </section>

          <div style={{ height:1, background:'rgba(255,255,255,0.07)' }} />

          {/* Peso */}
          <section>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:'1.1rem' }}>⚖️</span>
              <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.9rem', color:'var(--text-primary)' }}>Peso Corporal</span>
            </div>
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              <input type="number" style={{...IS,flex:1}} value={r.peso||''} onChange={e=>upd({peso:Number(e.target.value)})} placeholder="Ex: 75.5" step={0.1} min={30} max={300} />
              <span style={{ color:'var(--text-muted)', flexShrink:0 }}>kg</span>
            </div>
          </section>

          <div style={{ height:1, background:'rgba(255,255,255,0.07)' }} />

          {/* Sintomas */}
          <section>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:'1.1rem' }}>🩺</span>
              <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.9rem', color:'var(--text-primary)' }}>Sintomas</span>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
              {SINTOMAS_COMUNS.map(s=>{
                const ativo = r.sintomas.includes(s)
                return (
                  <button key={s} onClick={()=>upd({sintomas:ativo?r.sintomas.filter(x=>x!==s):[...r.sintomas,s]})}
                    style={{ padding:'5px 12px', borderRadius:20, border:`1px solid ${ativo?'rgba(248,113,113,0.5)':'rgba(255,255,255,0.1)'}`, background:ativo?'rgba(248,113,113,0.12)':'rgba(255,255,255,0.03)', color:ativo?'#f87171':'var(--text-muted)', fontSize:'0.72rem', fontWeight:ativo?700:400, cursor:'pointer' }}>
                    {s}
                  </button>
                )
              })}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <input style={IS} value={novoSintoma} onChange={e=>setNovoSintoma(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&novoSintoma.trim()){upd({sintomas:[...r.sintomas,novoSintoma.trim()]});setNovoSintoma('')}}}
                placeholder="Sintoma personalizado…" />
              <button onClick={()=>{if(novoSintoma.trim()){upd({sintomas:[...r.sintomas,novoSintoma.trim()]});setNovoSintoma('')}}}
                style={{ padding:'8px 14px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'var(--text-secondary)', fontSize:'0.78rem', cursor:'pointer', whiteSpace:'nowrap' }}>+ Add</button>
            </div>
          </section>

          <div style={{ height:1, background:'rgba(255,255,255,0.07)' }} />

          {/* Notas */}
          <section>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <span style={{ fontSize:'1.1rem' }}>📝</span>
              <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.9rem', color:'var(--text-primary)' }}>Notas Livres</span>
            </div>
            <textarea style={{...IS,minHeight:80,resize:'vertical',lineHeight:1.6}} value={r.notas} onChange={e=>upd({notas:e.target.value})} placeholder="Observações sobre seu dia…" />
          </section>
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 22px', borderTop:'1px solid rgba(255,255,255,0.08)', flexShrink:0 }}>
          <button onClick={save} disabled={saving}
            style={{ width:'100%', padding:'13px', borderRadius:12, border:'none', background:saving?'rgba(16,185,129,0.3)':'linear-gradient(135deg,#059669,#10b981)', color:'#fff', fontFamily:'var(--font-display)', fontWeight:800, fontSize:'0.9rem', cursor:saving?'not-allowed':'pointer' }}>
            {saving?'Salvando…':'💾 Salvar Registro'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Bento Cards do dia ────────────────────────────────────────────────────────
function BentoAgua({ r, onUpdate }: { r:RegistroSaude; onUpdate:(p:Partial<RegistroSaude>)=>void }) {
  const pct = Math.min((r.agua/r.metaAgua)*100,100)
  const cor = pct>=80?'#34d399':pct>=50?'#60a5fa':'#94a3b8'
  return (
    <Card pastel="blue" style={{ display:'flex',flexDirection:'column',gap:12 }}>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          <span style={{ fontSize:'1.2rem' }}>💧</span>
          <span style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.88rem',color:'var(--text-primary)' }}>Hidratação</span>
        </div>
        <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.7rem',color:PASTEL.blue.text }}>meta {r.metaAgua}ml</div>
      </div>
      <div>
        <div style={{ display:'flex',justifyContent:'space-between',marginBottom:6 }}>
          <span style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1.6rem',color:cor,lineHeight:1 }}>{r.agua}<span style={{ fontSize:'0.75rem',fontWeight:500,marginLeft:2 }}>ml</span></span>
          <span style={{ fontFamily:'var(--font-mono)',fontSize:'0.82rem',color:cor,alignSelf:'flex-end' }}>{Math.round(pct)}%</span>
        </div>
        <ProgressBar value={r.agua} max={r.metaAgua} color={cor} height={10} />
      </div>
      <div style={{ display:'flex',gap:6 }}>
        {[150,200,300,500].map(ml=>(
          <button key={ml} onClick={()=>onUpdate({agua:Math.min(r.agua+ml,5000)})}
            style={{ flex:1,padding:'7px 2px',borderRadius:8,border:`1px solid ${PASTEL.blue.border}`,background:PASTEL.blue.bg,color:PASTEL.blue.text,fontWeight:700,fontSize:'0.72rem',cursor:'pointer' }}>
            +{ml}
          </button>
        ))}
        <button onClick={()=>onUpdate({agua:Math.max(0,r.agua-200)})}
          style={{ padding:'7px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontSize:'0.82rem',cursor:'pointer' }}>−</button>
      </div>
    </Card>
  )
}

function BentoHumorEnergia({ r, historico }: { r:RegistroSaude; historico:RegistroSaude[] }) {
  const ultimos7 = historico.slice(-7)
  const mediaHumor = ultimos7.length ? Math.round(ultimos7.reduce((a,x)=>a+x.humor,0)/ultimos7.length*10)/10 : 0
  const mediaEnergia = ultimos7.length ? Math.round(ultimos7.reduce((a,x)=>a+x.energia,0)/ultimos7.length*10)/10 : 0
  const HUMOR_EMOJIS  = ['😢','😕','😐','😊','😄']
  const ENERGIA_EMOJIS= ['🪫','😴','⚡','🔋','🚀']
  const COLORS = ['#ef4444','#f87171','#fbbf24','#a3e635','#6ee7a0']
  return (
    <Card pastel="amber" style={{ display:'flex',flexDirection:'column',gap:12 }}>
      <div style={{ display:'flex',alignItems:'center',gap:8 }}>
        <span style={{ fontSize:'1.2rem' }}>😊</span>
        <span style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.88rem',color:'var(--text-primary)' }}>Humor & Energia</span>
      </div>
      <div style={{ display:'flex',gap:20 }}>
        <div style={{ textAlign:'center',flex:1 }}>
          <div style={{ fontSize:'2.2rem',lineHeight:1 }}>{HUMOR_EMOJIS[r.humor-1]}</div>
          <div style={{ fontSize:'0.65rem',fontWeight:700,color:COLORS[r.humor-1],marginTop:4 }}>{['Muito mal','Mal','Neutro','Bem','Ótimo'][r.humor-1]}</div>
          <div style={{ fontSize:'0.58rem',color:'var(--text-muted)',marginTop:2 }}>hoje</div>
        </div>
        <div style={{ width:1,background:'rgba(255,255,255,0.08)' }} />
        <div style={{ textAlign:'center',flex:1 }}>
          <div style={{ fontSize:'2.2rem',lineHeight:1 }}>{ENERGIA_EMOJIS[r.energia-1]}</div>
          <div style={{ fontSize:'0.65rem',fontWeight:700,color:COLORS[r.energia-1],marginTop:4 }}>{['Sem energia','Com sono','OK','Disposto','Pleno'][r.energia-1]}</div>
          <div style={{ fontSize:'0.58rem',color:'var(--text-muted)',marginTop:2 }}>hoje</div>
        </div>
      </div>
      {ultimos7.length > 0 && (
        <div style={{ padding:'8px 12px',borderRadius:10,background:'rgba(0,0,0,0.15)',display:'flex',justifyContent:'space-around' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.9rem',color:PASTEL.amber.text }}>{mediaHumor}</div>
            <div style={{ fontSize:'0.58rem',color:'var(--text-muted)' }}>humor 7d</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.9rem',color:PASTEL.amber.text }}>{mediaEnergia}</div>
            <div style={{ fontSize:'0.58rem',color:'var(--text-muted)' }}>energia 7d</div>
          </div>
        </div>
      )}
    </Card>
  )
}

function BentoPeso({ r, historico }: { r:RegistroSaude; historico:RegistroSaude[] }) {
  const comPeso = historico.filter(x=>x.peso>0).sort((a,b)=>a.data.localeCompare(b.data))
  const anterior = comPeso.length>1 ? comPeso[comPeso.length-2] : null
  const diff = r.peso>0 && anterior ? Math.round((r.peso-anterior.peso)*10)/10 : null
  const valores = comPeso.slice(-10).map(x=>x.peso)
  return (
    <Card pastel="teal" style={{ display:'flex',flexDirection:'column',gap:12 }}>
      <div style={{ display:'flex',alignItems:'center',gap:8 }}>
        <span style={{ fontSize:'1.2rem' }}>⚖️</span>
        <span style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.88rem',color:'var(--text-primary)' }}>Peso Corporal</span>
      </div>
      <div style={{ display:'flex',alignItems:'flex-end',gap:14 }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)',fontWeight:900,fontSize:'1.9rem',color:PASTEL.teal.text,lineHeight:1 }}>
            {r.peso>0?r.peso:'—'}<span style={{ fontSize:'0.8rem',fontWeight:500,marginLeft:3 }}>{r.peso>0?'kg':''}</span>
          </div>
          {diff!==null && (
            <div style={{ fontSize:'0.72rem',fontWeight:700,color:diff<=0?'#34d399':'#f87171',marginTop:4 }}>
              {diff<=0?'▼':'▲'} {Math.abs(diff)}kg vs anterior
            </div>
          )}
        </div>
        {valores.length >= 2 && <Sparkline values={valores} color={PASTEL.teal.text} height={36} width={80} />}
      </div>
      {comPeso.length === 0 && <div style={{ fontSize:'0.72rem',color:'var(--text-muted)' }}>Registre seu peso na gaveta →</div>}
    </Card>
  )
}

function BentoTreino({ r, historico }: { r:RegistroSaude; historico:RegistroSaude[] }) {
  const ultimos7 = historico.slice(-7)
  const treinos = ultimos7.filter(x=>x.treino.realizado).length
  const cor = r.treino.realizado?'#6ee7a0':'#94a3b8'
  return (
    <Card pastel="green" style={{ display:'flex',flexDirection:'column',gap:12 }}>
      <div style={{ display:'flex',alignItems:'center',gap:8 }}>
        <span style={{ fontSize:'1.2rem' }}>🏋️</span>
        <span style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.88rem',color:'var(--text-primary)' }}>Atividade Física</span>
      </div>
      <div style={{ display:'flex',alignItems:'center',gap:14 }}>
        <div style={{ width:52,height:52,borderRadius:14,border:`2px solid ${cor}40`,background:`${cor}10`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.5rem',flexShrink:0 }}>
          {r.treino.realizado?'✅':'○'}
        </div>
        <div>
          <div style={{ fontWeight:700,fontSize:'0.88rem',color:cor }}>{r.treino.realizado?(r.treino.tipo||'Treino realizado'):'Sem treino hoje'}</div>
          {r.treino.realizado && r.treino.duracao>0 && <div style={{ fontSize:'0.68rem',color:'var(--text-muted)',marginTop:2 }}>{r.treino.duracao} min</div>}
        </div>
      </div>
      {/* Mini calendário semanal */}
      <div style={{ display:'flex',gap:4 }}>
        {ultimos7.map((reg,i)=>(
          <div key={i} style={{ flex:1,height:6,borderRadius:3,background:reg.treino.realizado?PASTEL.green.text:'rgba(255,255,255,0.08)' }} />
        ))}
      </div>
      <div style={{ fontSize:'0.68rem',color:'var(--text-muted)' }}>{treinos} de {ultimos7.length} dias com treino (7d)</div>
    </Card>
  )
}

function BentoSono({ r, historico }: { r:RegistroSaude; historico:RegistroSaude[] }) {
  const sonoH = calcSono(r.sono.inicio, r.sono.fim)
  const ultimos7 = historico.slice(-7).filter(x=>calcSono(x.sono.inicio,x.sono.fim)>0)
  const mediaSono = ultimos7.length ? Math.round(ultimos7.reduce((a,x)=>a+calcSono(x.sono.inicio,x.sono.fim),0)/ultimos7.length*10)/10 : 0
  const cor = sonoH>=7?'#a5a3f5':sonoH>=6?'#fbbf24':'#f87171'
  const SONO_EMOJIS = ['😫','😪','😐','😊','🌟']
  return (
    <Card pastel="purple" style={{ display:'flex',flexDirection:'column',gap:12 }}>
      <div style={{ display:'flex',alignItems:'center',gap:8 }}>
        <span style={{ fontSize:'1.2rem' }}>😴</span>
        <span style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.88rem',color:'var(--text-primary)' }}>Sono</span>
      </div>
      <div style={{ display:'flex',alignItems:'center',gap:16 }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)',fontWeight:900,fontSize:'1.9rem',color:cor,lineHeight:1 }}>
            {sonoH>0?sonoH:'—'}<span style={{ fontSize:'0.8rem',fontWeight:500,marginLeft:3 }}>{sonoH>0?'h':''}</span>
          </div>
          {r.sono.inicio && r.sono.fim && (
            <div style={{ fontSize:'0.65rem',color:'var(--text-muted)',marginTop:3 }}>{r.sono.inicio} → {r.sono.fim}</div>
          )}
        </div>
        {sonoH>0 && (
          <div style={{ fontSize:'1.8rem' }}>{SONO_EMOJIS[r.sono.qualidade-1]}</div>
        )}
      </div>
      {mediaSono>0 && (
        <div style={{ padding:'6px 10px',borderRadius:8,background:'rgba(0,0,0,0.15)',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <span style={{ fontSize:'0.65rem',color:'var(--text-muted)' }}>Média 7d</span>
          <span style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.82rem',color:PASTEL.purple.text }}>{mediaSono}h</span>
        </div>
      )}
    </Card>
  )
}

function BentoSintomas({ r, historico }: { r:RegistroSaude; historico:RegistroSaude[] }) {
  // Contagem do mês
  const mes = today().slice(0,7)
  const doMes = historico.filter(x=>x.data.startsWith(mes))
  const contagem: Record<string,number> = {}
  doMes.forEach(reg=>reg.sintomas.forEach(s=>{contagem[s]=(contagem[s]||0)+1}))
  const top = Object.entries(contagem).sort((a,b)=>b[1]-a[1]).slice(0,5)
  return (
    <Card pastel="red" style={{ display:'flex',flexDirection:'column',gap:10 }}>
      <div style={{ display:'flex',alignItems:'center',gap:8 }}>
        <span style={{ fontSize:'1.2rem' }}>🩺</span>
        <span style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.88rem',color:'var(--text-primary)' }}>Sintomas</span>
        <span style={{ marginLeft:'auto',fontSize:'0.62rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)' }}>este mês</span>
      </div>
      {/* Hoje */}
      {r.sintomas.length>0 && (
        <div style={{ display:'flex',flexWrap:'wrap',gap:5 }}>
          {r.sintomas.map(s=>(
            <span key={s} style={{ padding:'3px 10px',borderRadius:20,background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.3)',color:'#fca5a5',fontSize:'0.68rem',fontWeight:600 }}>{s}</span>
          ))}
        </div>
      )}
      {r.sintomas.length===0 && <div style={{ fontSize:'0.72rem',color:'var(--text-muted)' }}>✅ Nenhum sintoma hoje</div>}
      {/* Top do mês */}
      {top.length>0 && (
        <div style={{ marginTop:4 }}>
          <div style={{ fontSize:'0.58rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6 }}>Recorrência mensal</div>
          <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
            {top.map(([s,n])=>(
              <div key={s} style={{ display:'flex',alignItems:'center',gap:8 }}>
                <div style={{ fontSize:'0.68rem',color:'var(--text-secondary)',flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{s}</div>
                <div style={{ height:4,flex:2,borderRadius:4,background:'rgba(248,113,113,0.08)',overflow:'hidden' }}>
                  <div style={{ height:'100%',width:`${(n/doMes.length)*100}%`,background:PASTEL.red.text,borderRadius:4 }} />
                </div>
                <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.65rem',color:PASTEL.red.text,flexShrink:0 }}>{n}x</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Relatórios ───────────────────────────────────────────────────────────────
type Periodo = 'semana'|'mes'|'ano'
function Relatorios({ registros }: { registros:RegistroSaude[] }) {
  const [periodo, setPeriodo] = useState<Periodo>('semana')

  const dados = useMemo(()=>{
    const hoje = new Date(); hoje.setHours(0,0,0,0)
    const n = periodo==='semana'?7:periodo==='mes'?30:365
    const limite = new Date(hoje); limite.setDate(hoje.getDate()-n)
    return [...registros].filter(r=>new Date(r.data+'T12:00:00')>=limite).sort((a,b)=>a.data.localeCompare(b.data))
  },[registros,periodo])

  const labels = dados.map(r=>{ const [,m,d]=r.data.split('-'); return `${d}/${m}` })
  const scores = dados.map(scoreBestar)
  const sonos = dados.map(r=>calcSono(r.sono.inicio,r.sono.fim))
  const humores = dados.map(r=>r.humor)
  const energias = dados.map(r=>r.energia)
  const aguas = dados.map(r=>Math.round((r.agua/r.metaAgua)*100))
  const comPeso = dados.filter(r=>r.peso>0)
  const treinos = dados.filter(r=>r.treino.realizado)

  // Sintomas — contagem
  const contSintomas: Record<string,number> = {}
  dados.forEach(r=>r.sintomas.forEach(s=>{contSintomas[s]=(contSintomas[s]||0)+1}))
  const topSintomas = Object.entries(contSintomas).sort((a,b)=>b[1]-a[1]).slice(0,6)

  const MiniBar = ({ values, color, max, labels: lbls }: { values:number[]; color:string; max:number; labels:string[] }) => (
    <div>
      <div style={{ display:'flex',gap:3,alignItems:'flex-end',height:70 }}>
        {values.map((v,i)=>(
          <div key={i} style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2 }}>
            <div style={{ width:'100%',borderRadius:'3px 3px 0 0',background:`${color}bb`,height:Math.max((v/max)*62,3),transition:'height 0.5s ease' }} title={`${v}`} />
            {values.length <= 14 && <div style={{ fontSize:'0.48rem',color:'var(--text-muted)',transform:'rotate(-45deg)',transformOrigin:'top left',whiteSpace:'nowrap',marginTop:2 }}>{lbls[i]}</div>}
          </div>
        ))}
      </div>
    </div>
  )

  if (dados.length===0) return (
    <Card><div style={{ textAlign:'center',padding:'40px 0',color:'var(--text-muted)',fontSize:'0.82rem' }}>Nenhum dado para o período selecionado</div></Card>
  )

  return (
    <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
      {/* Seletor período */}
      <div style={{ display:'flex',gap:6 }}>
        {(['semana','mes','ano'] as Periodo[]).map(p=>(
          <button key={p} onClick={()=>setPeriodo(p)}
            style={{ padding:'7px 18px',borderRadius:9,border:`1px solid ${periodo===p?'rgba(52,211,153,0.5)':'rgba(255,255,255,0.1)'}`,background:periodo===p?'rgba(52,211,153,0.1)':'none',color:periodo===p?'#34d399':'var(--text-muted)',fontWeight:700,fontSize:'0.78rem',cursor:'pointer',textTransform:'capitalize' }}>
            {p==='semana'?'Semana':p==='mes'?'Mês':'Ano'}
          </button>
        ))}
        <span style={{ marginLeft:'auto',fontSize:'0.68rem',color:'var(--text-muted)',alignSelf:'center',fontFamily:'var(--font-mono)' }}>{dados.length} registros</span>
      </div>

      {/* Score + sparkline */}
      <Card>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12 }}>
          <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.62rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em' }}>📈 Score Bem-Estar</div>
          <div style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1.4rem',color:scoreColor(scores[scores.length-1]||0) }}>{scores[scores.length-1]||'—'}</div>
        </div>
        <Sparkline values={scores} color="#34d399" height={56} width={400} />
        <MiniBar values={scores} color="#34d399" max={100} labels={labels} />
      </Card>

      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14 }}>
        <Card>
          <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10 }}>💧 Hidratação %</div>
          <MiniBar values={aguas} color="#60a5fa" max={100} labels={labels} />
        </Card>
        <Card>
          <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10 }}>😴 Sono (h)</div>
          <MiniBar values={sonos} color="#a5a3f5" max={10} labels={labels} />
        </Card>
        <Card>
          <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10 }}>😊 Humor</div>
          <MiniBar values={humores} color="#fbbf24" max={5} labels={labels} />
        </Card>
        <Card>
          <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10 }}>⚡ Energia</div>
          <MiniBar values={energias} color="#f59e0b" max={5} labels={labels} />
        </Card>
      </div>

      {/* Peso */}
      {comPeso.length >= 2 && (
        <Card>
          <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12 }}>⚖️ Evolução do Peso (kg)</div>
          <Sparkline values={comPeso.map(r=>r.peso)} color="#5eead4" height={60} width={400} />
          <div style={{ display:'flex',justifyContent:'space-between',marginTop:8,fontSize:'0.7rem',color:'var(--text-muted)' }}>
            <span>Início: <strong style={{ color:'#5eead4' }}>{comPeso[0].peso}kg</strong></span>
            <span>Atual: <strong style={{ color:'#5eead4' }}>{comPeso[comPeso.length-1].peso}kg</strong></span>
            <span>Δ: <strong style={{ color:comPeso[comPeso.length-1].peso<=comPeso[0].peso?'#34d399':'#f87171' }}>{Math.round((comPeso[comPeso.length-1].peso-comPeso[0].peso)*10)/10}kg</strong></span>
          </div>
        </Card>
      )}

      {/* Treinos */}
      <Card>
        <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12 }}>🏋️ Consistência de Treino</div>
        <div style={{ display:'flex',gap:3,flexWrap:'wrap' }}>
          {dados.map((reg,i)=>(
            <div key={i} title={`${labels[i]}: ${reg.treino.realizado?reg.treino.tipo||'Treino':'Descanso'}`}
              style={{ width:20,height:20,borderRadius:4,background:reg.treino.realizado?'rgba(110,231,160,0.6)':'rgba(255,255,255,0.06)',border:`1px solid ${reg.treino.realizado?'rgba(110,231,160,0.4)':'rgba(255,255,255,0.05)'}`,flexShrink:0 }} />
          ))}
        </div>
        <div style={{ marginTop:10,fontSize:'0.72rem',color:'var(--text-secondary)' }}>{treinos.length} treinos em {dados.length} dias ({Math.round((treinos.length/dados.length)*100)}%)</div>
      </Card>

      {/* Sintomas */}
      {topSintomas.length > 0 && (
        <Card>
          <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12 }}>🩺 Sintomas mais frequentes</div>
          <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
            {topSintomas.map(([s,n])=>(
              <div key={s} style={{ display:'flex',alignItems:'center',gap:10 }}>
                <div style={{ fontSize:'0.78rem',color:'var(--text-secondary)',width:140,flexShrink:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{s}</div>
                <div style={{ flex:1,height:8,borderRadius:4,background:'rgba(248,113,113,0.08)',overflow:'hidden' }}>
                  <div style={{ height:'100%',width:`${(n/dados.length)*100}%`,background:'rgba(248,113,113,0.5)',borderRadius:4 }} />
                </div>
                <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.7rem',color:'#fca5a5',flexShrink:0,width:30,textAlign:'right' }}>{n}x</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Histórico ─────────────────────────────────────────────────────────────────
function Historico({ registros, onSelect }: { registros:RegistroSaude[]; onSelect:(r:RegistroSaude)=>void }) {
  const lista = [...registros].sort((a,b)=>b.data.localeCompare(a.data)).slice(0,30)
  const fmtD = (d:string) => { const [y,m,dd]=d.split('-'); return `${dd}/${m}/${y}` }
  const HUMOR_EMOJIS = ['😢','😕','😐','😊','😄']
  return (
    <Card>
      <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.62rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:14 }}>📅 Últimos 30 registros</div>
      <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
        {lista.length===0 && <div style={{ textAlign:'center',padding:'30px 0',color:'var(--text-muted)',fontSize:'0.8rem' }}>Nenhum registro ainda</div>}
        {lista.map(r=>{
          const score=scoreBestar(r); const cor=scoreColor(score); const sono=calcSono(r.sono.inicio,r.sono.fim)
          return (
            <button key={r.id} onClick={()=>onSelect(r)}
              style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,cursor:'pointer',textAlign:'left',width:'100%',transition:'background 0.15s' }}
              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.06)'}
              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.03)'}>
              <div style={{ width:36,height:36,borderRadius:10,background:`${cor}18`,border:`1px solid ${cor}40`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-display)',fontWeight:800,fontSize:'0.88rem',color:cor,flexShrink:0 }}>{score}</div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontWeight:600,fontSize:'0.82rem',color:'var(--text-primary)' }}>{fmtD(r.data)}</div>
                <div style={{ fontSize:'0.62rem',color:'var(--text-muted)',display:'flex',gap:10,marginTop:2,flexWrap:'wrap' }}>
                  {sono>0&&<span>😴 {sono}h</span>}
                  <span>💧 {r.agua}ml</span>
                  {r.treino.realizado&&<span>🏋️ {r.treino.tipo||'Treino'}</span>}
                  {r.peso>0&&<span>⚖️ {r.peso}kg</span>}
                </div>
              </div>
              <span style={{ fontSize:'1.2rem' }}>{HUMOR_EMOJIS[r.humor-1]}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function SaudeBemEstar() {
  const uid = useUid()
  const [registros, setRegistros] = useState<RegistroSaude[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'hoje'|'relatorios'|'historico'>('hoje')
  const [dataSelecionada, setDataSelecionada] = useState(today())
  const [registroAtual, setRegistroAtual] = useState<RegistroSaude>(defaultRegistro(today()))
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isHoje = dataSelecionada === today()

  useEffect(()=>{
    if(!uid) return
    return onSnapshot(collection(db,'users',uid,'saude'), snap=>{
      const list = snap.docs.map(d=>({id:d.id,...d.data()} as RegistroSaude))
      setRegistros(list)
      const r = list.find(x=>x.data===dataSelecionada)
      setRegistroAtual(r||defaultRegistro(dataSelecionada))
      setLoading(false)
    })
  },[uid,dataSelecionada])

  const historico = useMemo(()=>[...registros].sort((a,b)=>a.data.localeCompare(b.data)),[registros])
  const score = scoreBestar(registroAtual)
  const scoreCor = scoreColor(score)

  // Update inline (water buttons on bento card)
  const inlineUpdate = useCallback(async (partial: Partial<RegistroSaude>) => {
    if (!uid) return
    const upd = { ...registroAtual, ...partial }
    setRegistroAtual(upd)
    await setDoc(doc(db,'users',uid,'saude',upd.data), clean(upd))
  },[uid,registroAtual])

  const mudaData = (d:string) => {
    setDataSelecionada(d)
    const r = registros.find(x=>x.data===d)
    setRegistroAtual(r||defaultRegistro(d))
  }

  const irOntem = () => { const d=new Date(dataSelecionada+'T12:00:00'); d.setDate(d.getDate()-1); mudaData(d.toISOString().slice(0,10)) }
  const irProx = () => { const d=new Date(dataSelecionada+'T12:00:00'); d.setDate(d.getDate()+1); const n=d.toISOString().slice(0,10); if(n<=today()) mudaData(n) }
  const streak = useMemo(()=>{
    let s=0; const d=new Date(); d.setHours(0,0,0,0)
    while(registros.find(r=>r.data===d.toISOString().slice(0,10))){s++;d.setDate(d.getDate()-1)}
    return s
  },[registros])

  if(loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'60vh' }}>
      <div style={{ width:36,height:36,borderRadius:'50%',border:'2px solid transparent',borderTopColor:'#10b981',animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ display:'flex',flexDirection:'column',minHeight:'100%',boxSizing:'border-box' }}>

      {/* ── HERO HEADER ─────────────────────────────────────────────── */}
      <div style={{ padding:'22px 28px 20px', background:`linear-gradient(135deg,${scoreCor}10 0%,transparent 70%)`, borderBottom:`1px solid ${scoreCor}20`, position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute',top:-60,right:-60,width:200,height:200,borderRadius:'50%',background:`radial-gradient(circle,${scoreCor}12,transparent 70%)`,pointerEvents:'none' }} />
        <div style={{ display:'flex',alignItems:'flex-end',gap:28,flexWrap:'wrap' }}>
          {/* Score arc */}
          <ScoreArc score={score} />
          {/* Info */}
          <div style={{ flex:1,minWidth:200 }}>
            <div style={{ fontFamily:'var(--font-display)',fontWeight:900,fontSize:'1.3rem',color:'var(--text-primary)',marginBottom:4 }}>
              {isHoje?'Saúde & Bem-Estar':`Registro — ${new Date(dataSelecionada+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'})}`}
            </div>
            <div style={{ fontSize:'0.78rem',color:scoreCor,fontWeight:600,marginBottom:12 }}>{scoreMsg(score)}</div>
            {/* KPI pills */}
            <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
              {[
                {icon:'💧',v:`${registroAtual.agua}ml`,c:'#60a5fa'},
                {icon:'😴',v:calcSono(registroAtual.sono.inicio,registroAtual.sono.fim)>0?`${calcSono(registroAtual.sono.inicio,registroAtual.sono.fim)}h`:'—',c:'#a5a3f5'},
                {icon:'🏋️',v:registroAtual.treino.realizado?'✅':'—',c:'#6ee7a0'},
                {icon:'😊',v:['😢','😕','😐','😊','😄'][registroAtual.humor-1],c:'#fbbf24'},
                {icon:'⚖️',v:registroAtual.peso>0?`${registroAtual.peso}kg`:'—',c:'#5eead4'},
              ].map((k,i)=>(
                <div key={i} style={{ display:'flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:20,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.09)' }}>
                  <span style={{ fontSize:'0.85rem' }}>{k.icon}</span>
                  <span style={{ fontWeight:700,fontSize:'0.78rem',color:k.v!=='—'?k.c:'var(--text-muted)' }}>{k.v}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Ações */}
          <div style={{ display:'flex',flexDirection:'column',gap:8,flexShrink:0 }}>
            <button onClick={()=>setDrawerOpen(true)}
              style={{ padding:'10px 20px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#059669,#10b981)',color:'#fff',fontFamily:'var(--font-display)',fontWeight:800,fontSize:'0.85rem',cursor:'pointer',boxShadow:'0 4px 14px rgba(16,185,129,0.3)',whiteSpace:'nowrap' }}>
              📋 Registrar Rotina
            </button>
            {streak > 0 && (
              <div style={{ textAlign:'center',fontSize:'0.7rem',color:'#fbbf24',fontWeight:700 }}>🔥 {streak} dias consecutivos</div>
            )}
          </div>
        </div>
        {/* Nav datas */}
        <div style={{ display:'flex',alignItems:'center',gap:6,marginTop:16 }}>
          <button onClick={irOntem} style={{ width:30,height:30,borderRadius:8,border:'1px solid var(--border-md)',background:'var(--surface)',color:'var(--text-secondary)',cursor:'pointer',fontSize:'0.9rem' }}>‹</button>
          <input type="date" value={dataSelecionada} max={today()} onChange={e=>mudaData(e.target.value)}
            style={{ padding:'5px 10px',borderRadius:8,border:'1px solid var(--border-md)',background:'var(--input-bg)',color:'var(--text-primary)',fontSize:'0.78rem',outline:'none',fontFamily:'var(--font-mono)' }} />
          <button onClick={irProx} disabled={dataSelecionada>=today()} style={{ width:30,height:30,borderRadius:8,border:'1px solid var(--border-md)',background:'var(--surface)',color:'var(--text-secondary)',cursor:dataSelecionada>=today()?'not-allowed':'pointer',fontSize:'0.9rem',opacity:dataSelecionada>=today()?0.4:1 }}>›</button>
          {!isHoje && <button onClick={()=>mudaData(today())} style={{ padding:'5px 12px',borderRadius:8,border:'1px solid rgba(52,211,153,0.3)',background:'rgba(52,211,153,0.08)',color:'#34d399',fontSize:'0.72rem',fontWeight:700,cursor:'pointer' }}>Hoje</button>}
        </div>
      </div>

      {/* ── ABAS ─────────────────────────────────────────────────────── */}
      <div style={{ padding:'0 28px',borderBottom:'1px solid var(--border-md)',display:'flex',gap:0 }}>
        {[{id:'hoje',label:'🏠 Visão Geral'},{id:'relatorios',label:'📈 Relatórios'},{id:'historico',label:'📅 Histórico'}].map(a=>(
          <button key={a.id} onClick={()=>setAba(a.id as any)}
            style={{ padding:'12px 18px',border:'none',background:'transparent',color:aba===a.id?'var(--text-primary)':'var(--text-muted)',fontFamily:'var(--font-display)',fontWeight:aba===a.id?700:500,fontSize:'0.82rem',cursor:'pointer',borderBottom:aba===a.id?`2px solid ${scoreCor}`:'2px solid transparent',marginBottom:-1,transition:'all 0.15s',whiteSpace:'nowrap' }}>
            {a.label}
          </button>
        ))}
      </div>

      {/* ── BENTO GRID ───────────────────────────────────────────────── */}
      <div style={{ flex:1,padding:'20px 28px',overflowY:'auto' }}>
        {aba==='hoje' && (
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14 }}>
            <BentoAgua r={registroAtual} onUpdate={inlineUpdate} />
            <BentoHumorEnergia r={registroAtual} historico={historico} />
            <BentoPeso r={registroAtual} historico={historico} />
            <BentoTreino r={registroAtual} historico={historico} />
            <BentoSono r={registroAtual} historico={historico} />
            <BentoSintomas r={registroAtual} historico={historico} />
          </div>
        )}
        {aba==='relatorios' && <Relatorios registros={registros} />}
        {aba==='historico' && <Historico registros={registros} onSelect={r=>{mudaData(r.data);setAba('hoje')}} />}
      </div>

      {/* Gaveta */}
      <Drawer open={drawerOpen} onClose={()=>setDrawerOpen(false)} uid={uid} registro={registroAtual} onSave={r=>{setRegistroAtual(r)}} />
    </div>
  )
}
