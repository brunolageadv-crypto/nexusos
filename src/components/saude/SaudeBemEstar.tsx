import { useEffect, useState, useCallback, useMemo } from 'react'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'

// ─── Types ────────────────────────────────────────────────────────────────────
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}
interface RegistroAlergia {
  intensidade: 0|1|2|3          // 0=nenhuma,1=leve,2=moderada,3=intensa
  // Sintomas nasais
  espirros: boolean; coriza: boolean; obstrucao: boolean; coceiraNasal: boolean
  // Sintomas oculares
  coceiraOlhos: boolean; olhosVermelhos: boolean; lacrimejamento: boolean
  // Pele
  coceiraPele: boolean; urticaria: boolean; erupcao: boolean
  // Respiratório
  tosse: boolean; faltaAr: boolean; chiado: boolean
  // Antialérgico
  tomouRemedio: boolean; remedio: string; horarioRemedio: string
  // Gatilhos
  gatilhos: string[]   // poeira, polem, pelo, mofo, alimento, ar-condicionado, perfume, outro
  // Exposição ambiental
  ambienteExterno: boolean; chuva: boolean; ventoso: boolean
  // Qualidade do sono afetada
  afetouSono: boolean
  observacoes: string
}

interface RegistroSaude {
  id: string; data: string; agua: number; metaAgua: number
  sono: { inicio: string; fim: string; qualidade: number }
  humor: number; energia: number
  treino: { realizado: boolean; tipo: string; duracao: number }
  peso: number; sintomas: string[]; notas: string; criadoEm: number
  alergia?: RegistroAlergia
}
const TIPOS_TREINO = ['Musculação','Corrida','Ciclismo','Natação','Yoga','Pilates','Caminhada','Funcional','Crossfit','Artes Marciais','Outro']
const SINTOMAS_COMUNS = ['Dor de cabeça','Cansaço','Ansiedade','Dor nas costas','Insônia','Stress','Gripe/Resfriado','Dor muscular','Azia','Tontura','Náusea','Palpitação']
function today() { return new Date(Date.now()-3*3600000).toISOString().slice(0,10) }
function newId() { return Math.random().toString(36).slice(2,10) }
function defaultAlergia(): RegistroAlergia {
  return {
    intensidade: 0, espirros:false, coriza:false, obstrucao:false, coceiraNasal:false,
    coceiraOlhos:false, olhosVermelhos:false, lacrimejamento:false,
    coceiraPele:false, urticaria:false, erupcao:false,
    tosse:false, faltaAr:false, chiado:false,
    tomouRemedio:false, remedio:'', horarioRemedio:'',
    gatilhos:[], ambienteExterno:false, chuva:false, ventoso:false,
    afetouSono:false, observacoes:''
  }
}
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

          {/* Alergia */}
          <section>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:'1.1rem' }}>🤧</span>
              <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.9rem', color:'var(--text-primary)' }}>Controle de Alergia</span>
            </div>
            {/* Intensidade */}
            <Lbl>Intensidade hoje</Lbl>
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              {([{v:0,l:'Nenhuma',c:'#94a3b8',e:'✅'},{v:1,l:'Leve',c:'#34d399',e:'😌'},{v:2,l:'Moderada',c:'#fbbf24',e:'😤'},{v:3,l:'Intensa',c:'#f87171',e:'😫'}] as const).map(opt=>{
                const al = r.alergia || defaultAlergia()
                const sel = al.intensidade === opt.v
                return (
                  <button key={opt.v} onClick={()=>upd({alergia:{...(r.alergia||defaultAlergia()),intensidade:opt.v as 0|1|2|3}})}
                    style={{ flex:1,padding:'8px 4px',borderRadius:10,border:`2px solid ${sel?opt.c+'80':'rgba(255,255,255,0.1)'}`,background:sel?`${opt.c}18`:'rgba(255,255,255,0.03)',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,transition:'all 0.15s' }}>
                    <span style={{ fontSize:'1.2rem' }}>{opt.e}</span>
                    <span style={{ fontSize:'0.62rem',fontWeight:sel?700:400,color:sel?opt.c:'var(--text-muted)' }}>{opt.l}</span>
                  </button>
                )
              })}
            </div>
            {/* Sintomas por categoria */}
            {(r.alergia?.intensidade||0) > 0 && (
              <>
                {/* Nasal */}
                <Lbl>🫁 Sintomas nasais</Lbl>
                <div style={{ display:'flex',flexWrap:'wrap',gap:6,marginBottom:12 }}>
                  {([['espirros','Espirros'],['coriza','Coriza'],['obstrucao','Obstrução'],['coceiraNasal','Coceira nasal']] as const).map(([k,l])=>{
                    const al = r.alergia||defaultAlergia(); const ativo = al[k]
                    return <button key={k} onClick={()=>upd({alergia:{...(r.alergia||defaultAlergia()),[k]:!(r.alergia as any)?.[k]}})}
                      style={{ padding:'5px 12px',borderRadius:20,border:`1px solid ${ativo?'rgba(96,165,250,0.6)':'rgba(255,255,255,0.1)'}`,background:ativo?'rgba(96,165,250,0.15)':'rgba(255,255,255,0.03)',color:ativo?'#93c5fd':'var(--text-muted)',fontSize:'0.72rem',fontWeight:ativo?700:400,cursor:'pointer' }}>{l}</button>
                  })}
                </div>
                {/* Ocular */}
                <Lbl>👁 Sintomas oculares</Lbl>
                <div style={{ display:'flex',flexWrap:'wrap',gap:6,marginBottom:12 }}>
                  {([['coceiraOlhos','Coceira nos olhos'],['olhosVermelhos','Olhos vermelhos'],['lacrimejamento','Lacrimejamento']] as const).map(([k,l])=>{
                    const al = r.alergia||defaultAlergia(); const ativo = al[k]
                    return <button key={k} onClick={()=>upd({alergia:{...(r.alergia||defaultAlergia()),[k]:!(r.alergia as any)?.[k]}})}
                      style={{ padding:'5px 12px',borderRadius:20,border:`1px solid ${ativo?'rgba(167,139,250,0.6)':'rgba(255,255,255,0.1)'}`,background:ativo?'rgba(167,139,250,0.15)':'rgba(255,255,255,0.03)',color:ativo?'#c4b5fd':'var(--text-muted)',fontSize:'0.72rem',fontWeight:ativo?700:400,cursor:'pointer' }}>{l}</button>
                  })}
                </div>
                {/* Pele */}
                <Lbl>🖐 Pele</Lbl>
                <div style={{ display:'flex',flexWrap:'wrap',gap:6,marginBottom:12 }}>
                  {([['coceiraPele','Coceira na pele'],['urticaria','Urticária'],['erupcao','Erupção/Manchas']] as const).map(([k,l])=>{
                    const al = r.alergia||defaultAlergia(); const ativo = al[k]
                    return <button key={k} onClick={()=>upd({alergia:{...(r.alergia||defaultAlergia()),[k]:!(r.alergia as any)?.[k]}})}
                      style={{ padding:'5px 12px',borderRadius:20,border:`1px solid ${ativo?'rgba(251,191,36,0.6)':'rgba(255,255,255,0.1)'}`,background:ativo?'rgba(251,191,36,0.12)':'rgba(255,255,255,0.03)',color:ativo?'#fcd34d':'var(--text-muted)',fontSize:'0.72rem',fontWeight:ativo?700:400,cursor:'pointer' }}>{l}</button>
                  })}
                </div>
                {/* Respiratório */}
                <Lbl>💨 Respiratório</Lbl>
                <div style={{ display:'flex',flexWrap:'wrap',gap:6,marginBottom:14 }}>
                  {([['tosse','Tosse'],['faltaAr','Falta de ar'],['chiado','Chiado no peito']] as const).map(([k,l])=>{
                    const al = r.alergia||defaultAlergia(); const ativo = al[k]
                    return <button key={k} onClick={()=>upd({alergia:{...(r.alergia||defaultAlergia()),[k]:!(r.alergia as any)?.[k]}})}
                      style={{ padding:'5px 12px',borderRadius:20,border:`1px solid ${ativo?'rgba(248,113,113,0.6)':'rgba(255,255,255,0.1)'}`,background:ativo?'rgba(248,113,113,0.12)':'rgba(255,255,255,0.03)',color:ativo?'#fca5a5':'var(--text-muted)',fontSize:'0.72rem',fontWeight:ativo?700:400,cursor:'pointer' }}>{l}</button>
                  })}
                </div>
                {/* Gatilhos */}
                <Lbl>🌪 Possíveis gatilhos</Lbl>
                <div style={{ display:'flex',flexWrap:'wrap',gap:6,marginBottom:14 }}>
                  {(['Poeira','Pólen','Pelo de animal','Mofo/Fungo','Alimento','Ar-condicionado','Perfume/Spray','Fumaça','Mudança de temperatura','Outro']).map(g=>{
                    const al = r.alergia||defaultAlergia(); const ativo = al.gatilhos.includes(g)
                    return <button key={g} onClick={()=>upd({alergia:{...al,gatilhos:ativo?al.gatilhos.filter(x=>x!==g):[...al.gatilhos,g]}})}
                      style={{ padding:'5px 12px',borderRadius:20,border:`1px solid ${ativo?'rgba(52,211,153,0.5)':'rgba(255,255,255,0.1)'}`,background:ativo?'rgba(52,211,153,0.1)':'rgba(255,255,255,0.03)',color:ativo?'#6ee7b7':'var(--text-muted)',fontSize:'0.72rem',fontWeight:ativo?700:400,cursor:'pointer' }}>{g}</button>
                  })}
                </div>
                {/* Ambiente */}
                <Lbl>🌤 Condições ambientais</Lbl>
                <div style={{ display:'flex',gap:8,marginBottom:14 }}>
                  {([['ambienteExterno','🌳 Fui ao exterior'],['chuva','🌧 Chuva/Umidade'],['ventoso','💨 Dia ventoso']] as const).map(([k,l])=>{
                    const al = r.alergia||defaultAlergia(); const ativo = al[k]
                    return <button key={k} onClick={()=>upd({alergia:{...(r.alergia||defaultAlergia()),[k]:!(r.alergia as any)?.[k]}})}
                      style={{ flex:1,padding:'7px 4px',borderRadius:9,border:`1px solid ${ativo?'rgba(45,212,191,0.5)':'rgba(255,255,255,0.1)'}`,background:ativo?'rgba(45,212,191,0.1)':'rgba(255,255,255,0.03)',color:ativo?'#5eead4':'var(--text-muted)',fontSize:'0.68rem',fontWeight:ativo?700:400,cursor:'pointer',textAlign:'center' }}>{l}</button>
                  })}
                </div>
                {/* Antihistamínico */}
                <div style={{ padding:'10px 14px',borderRadius:10,background:'rgba(248,113,113,0.06)',border:'1px solid rgba(248,113,113,0.2)',marginBottom:14 }}>
                  <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10 }}>
                    <span style={{ fontSize:'0.78rem',fontWeight:700,color:'var(--text-primary)' }}>💊 Antialérgico</span>
                    <button onClick={()=>upd({alergia:{...(r.alergia||defaultAlergia()),tomouRemedio:!(r.alergia?.tomouRemedio)}})}
                      style={{ padding:'4px 14px',borderRadius:8,border:`1px solid ${r.alergia?.tomouRemedio?'rgba(248,113,113,0.5)':'rgba(255,255,255,0.15)'}`,background:r.alergia?.tomouRemedio?'rgba(248,113,113,0.15)':'rgba(255,255,255,0.04)',color:r.alergia?.tomouRemedio?'#fca5a5':'var(--text-muted)',fontSize:'0.72rem',fontWeight:700,cursor:'pointer' }}>
                      {r.alergia?.tomouRemedio?'✅ Tomou':'○ Não tomou'}
                    </button>
                  </div>
                  {r.alergia?.tomouRemedio && (
                    <div style={{ display:'grid',gridTemplateColumns:'1fr auto',gap:8 }}>
                      <div>
                        <Lbl>Medicamento</Lbl>
                        <input style={IS} value={r.alergia.remedio} onChange={e=>upd({alergia:{...r.alergia!,remedio:e.target.value}})} placeholder="Ex: Loratadina 10mg…" />
                      </div>
                      <div>
                        <Lbl>Horário</Lbl>
                        <input type="time" style={{...IS,width:90}} value={r.alergia.horarioRemedio} onChange={e=>upd({alergia:{...r.alergia!,horarioRemedio:e.target.value}})} />
                      </div>
                    </div>
                  )}
                </div>
                {/* Afetou sono / Observações */}
                <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:12 }}>
                  <button onClick={()=>upd({alergia:{...(r.alergia||defaultAlergia()),afetouSono:!(r.alergia?.afetouSono)}})}
                    style={{ padding:'6px 14px',borderRadius:8,border:`1px solid ${r.alergia?.afetouSono?'rgba(167,139,250,0.5)':'rgba(255,255,255,0.12)'}`,background:r.alergia?.afetouSono?'rgba(167,139,250,0.12)':'rgba(255,255,255,0.04)',color:r.alergia?.afetouSono?'#c4b5fd':'var(--text-muted)',fontSize:'0.72rem',fontWeight:700,cursor:'pointer' }}>
                    😴 Afetou meu sono
                  </button>
                </div>
                <Lbl>📝 Observações da alergia</Lbl>
                <textarea style={{...IS,minHeight:60,resize:'vertical',lineHeight:1.5}} value={r.alergia?.observacoes||''} onChange={e=>upd({alergia:{...(r.alergia||defaultAlergia()),observacoes:e.target.value}})} placeholder="Como você se sentiu? Algo incomum hoje?…" />
              </>
            )}
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

function PesoLineChart({ dados, color, height=80 }: { dados:{data:string;peso:number}[]; color:string; height?:number }) {
  if (dados.length < 2) return null
  const W = 280, H = height, PAD = 4
  const pesos = dados.map(d=>d.peso)
  const minP = Math.min(...pesos), maxP = Math.max(...pesos)
  const range = maxP - minP || 1
  const pts = dados.map((d,i) => {
    const x = PAD + (i/(dados.length-1))*(W-PAD*2)
    const y = H - PAD - ((d.peso-minP)/range)*(H-PAD*2)
    return { x, y, ...d }
  })
  const polyline = pts.map(p=>`${p.x},${p.y}`).join(' ')
  const area = `${PAD},${H} ${polyline} ${W-PAD},${H}`
  const last = pts[pts.length-1]
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow:'visible', display:'block' }}>
      {/* Grid lines */}
      {[0,0.25,0.5,0.75,1].map(f=>{
        const y = PAD + (1-f)*(H-PAD*2)
        const val = minP + f*range
        return (
          <g key={f}>
            <line x1={PAD} y1={y} x2={W-PAD} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeDasharray="3,4" />
            <text x={PAD} y={y-2} fontSize={7} fill="rgba(255,255,255,0.25)" fontFamily="monospace">{val.toFixed(1)}</text>
          </g>
        )
      })}
      {/* Area fill */}
      <polygon points={area} fill={`${color}12`} />
      {/* Line */}
      <polyline points={polyline} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {/* Dots for fewer data points */}
      {dados.length <= 30 && pts.map((p,i)=>(
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} opacity={0.8} />
      ))}
      {/* Last point highlighted */}
      <circle cx={last.x} cy={last.y} r={4} fill={color} filter={`drop-shadow(0 0 4px ${color})`} />
      <text x={last.x+6} y={last.y+4} fontSize={9} fill={color} fontWeight="bold" fontFamily="monospace">{last.peso}kg</text>
      {/* First point label */}
      {dados.length > 1 && (
        <text x={pts[0].x-2} y={pts[0].y+4} fontSize={8} fill="rgba(255,255,255,0.35)" fontFamily="monospace">{pts[0].peso}kg</text>
      )}
    </svg>
  )
}

function BentoPeso({ r, historico }: { r:RegistroSaude; historico:RegistroSaude[] }) {
  const [periodo, setPeriodo] = useState<30|60|90>(90)
  // Últimos N dias com peso registrado
  const corte = new Date(); corte.setDate(corte.getDate() - periodo)
  const cutoff = corte.toISOString().slice(0,10)
  const comPeso = historico.filter(x=>x.peso>0&&x.data>=cutoff).sort((a,b)=>a.data.localeCompare(b.data))
  const todosComPeso = historico.filter(x=>x.peso>0).sort((a,b)=>a.data.localeCompare(b.data))
  const anterior = todosComPeso.length>1 ? todosComPeso[todosComPeso.length-2] : null
  const diff = r.peso>0 && anterior ? Math.round((r.peso-anterior.peso)*10)/10 : null
  const pesoInicio = comPeso.length>0 ? comPeso[0].peso : null
  const deltaTotal = r.peso>0 && pesoInicio ? Math.round((r.peso-pesoInicio)*10)/10 : null
  const pesoMin = comPeso.length>0 ? Math.min(...comPeso.map(x=>x.peso)) : null
  const pesoMax = comPeso.length>0 ? Math.max(...comPeso.map(x=>x.peso)) : null
  const tendencia = comPeso.length>=3 ? (() => {
    const ultimo3 = comPeso.slice(-3).map(x=>x.peso)
    const media3 = ultimo3.reduce((a,b)=>a+b,0)/3
    const pesoAtual = r.peso || ultimo3[ultimo3.length-1]
    return pesoAtual < media3 ? 'descendo' : pesoAtual > media3 ? 'subindo' : 'estável'
  })() : null

  return (
    <Card pastel="teal" style={{ display:'flex',flexDirection:'column',gap:14, gridColumn:'span 2' }}>
      {/* Header */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8 }}>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          <span style={{ fontSize:'1.2rem' }}>⚖️</span>
          <span style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.88rem',color:'var(--text-primary)' }}>Controle de Peso</span>
        </div>
        {/* Seletor período */}
        <div style={{ display:'flex',gap:4 }}>
          {([30,60,90] as const).map(p=>(
            <button key={p} onClick={()=>setPeriodo(p)}
              style={{ padding:'3px 10px',borderRadius:6,border:`1px solid ${periodo===p?PASTEL.teal.border:'rgba(255,255,255,0.1)'}`,background:periodo===p?PASTEL.teal.bg:'transparent',color:periodo===p?PASTEL.teal.text:'var(--text-muted)',fontSize:'0.68rem',fontWeight:700,cursor:'pointer' }}>
              {p}d
            </button>
          ))}
        </div>
      </div>

      {/* KPIs linha */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8 }}>
        {[
          { l:'Atual', v:r.peso>0?`${r.peso}kg`:'—', c:PASTEL.teal.text },
          { l:'Vs anterior', v:diff!==null?`${diff>0?'+':''} ${diff}kg`:'—', c:diff===null?'var(--text-muted)':diff<=0?'#34d399':'#f87171' },
          { l:`Δ ${periodo}d`, v:deltaTotal!==null?`${deltaTotal>0?'+':''} ${deltaTotal}kg`:'—', c:deltaTotal===null?'var(--text-muted)':deltaTotal<=0?'#34d399':'#f87171' },
          { l:'Tendência', v:tendencia==='descendo'?'↘ Descendo':tendencia==='subindo'?'↗ Subindo':tendencia==='estável'?'→ Estável':'—', c:tendencia==='descendo'?'#34d399':tendencia==='subindo'?'#f87171':'#fbbf24' },
        ].map(k=>(
          <div key={k.l} style={{ padding:'8px 10px',borderRadius:10,background:'rgba(0,0,0,0.1)',textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:'0.88rem',color:k.c,lineHeight:1,marginBottom:3 }}>{k.v}</div>
            <div style={{ fontSize:'0.55rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em' }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Gráfico */}
      {comPeso.length >= 2 ? (
        <div style={{ padding:'8px 4px 0' }}>
          <div style={{ fontSize:'0.58rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8,display:'flex',justifyContent:'space-between' }}>
            <span>Evolução do peso — últimos {periodo} dias</span>
            <span>{comPeso.length} medições · Mín {pesoMin}kg · Máx {pesoMax}kg</span>
          </div>
          <PesoLineChart dados={comPeso.map(x=>({data:x.data,peso:x.peso}))} color={PASTEL.teal.text} height={90} />
          {/* Eixo X — datas */}
          <div style={{ display:'flex',justifyContent:'space-between',marginTop:4 }}>
            <span style={{ fontSize:'0.55rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)' }}>
              {new Date(comPeso[0].data+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}
            </span>
            <span style={{ fontSize:'0.55rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)' }}>
              {new Date(comPeso[comPeso.length-1].data+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}
            </span>
          </div>
        </div>
      ) : (
        <div style={{ textAlign:'center',padding:'20px 0',color:'var(--text-muted)',fontSize:'0.78rem' }}>
          {comPeso.length===0?'Registre seu peso na gaveta para ver o gráfico':'Precisamos de ao menos 2 medições para exibir o gráfico'}
        </div>
      )}
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

function BentoAlergia({ r, historico }: { r:RegistroSaude; historico:RegistroSaude[] }) {
  const al = r.alergia
  const INTENS = [{v:0,l:'Sem alergia',c:'#94a3b8',e:'✅'},{v:1,l:'Leve',c:'#34d399',e:'😌'},{v:2,l:'Moderada',c:'#fbbf24',e:'😤'},{v:3,l:'Intensa',c:'#f87171',e:'😫'}]
  const conf = INTENS[al?.intensidade||0]
  // histórico: últimos 30 dias com alergia
  const mes = r.data.slice(0,7)
  const doMes = historico.filter(x=>x.data.startsWith(mes)&&x.alergia&&(x.alergia.intensidade||0)>0)
  const diasComAlergia = doMes.length
  const diasIntensa = doMes.filter(x=>(x.alergia?.intensidade||0)===3).length
  const diasComRemedio = historico.filter(x=>x.alergia?.tomouRemedio).length
  // sintomas mais frequentes do mês
  const contSintomas: Record<string,number> = {}
  const CAMPOS_SINTOMA = ['espirros','coriza','obstrucao','coceiraNasal','coceiraOlhos','olhosVermelhos','lacrimejamento','coceiraPele','urticaria','tosse','faltaAr'] as const
  const LABELS_SINTOMA: Record<string,string> = { espirros:'Espirros',coriza:'Coriza',obstrucao:'Obstrução nasal',coceiraNasal:'Coceira nasal',coceiraOlhos:'Coceira olhos',olhosVermelhos:'Olhos vermelhos',lacrimejamento:'Lacrimejamento',coceiraPele:'Coceira pele',urticaria:'Urticária',tosse:'Tosse',faltaAr:'Falta de ar' }
  doMes.forEach(reg=>{
    if(!reg.alergia) return
    CAMPOS_SINTOMA.forEach(c=>{ if((reg.alergia as any)?.[c]) contSintomas[c]=(contSintomas[c]||0)+1 })
  })
  const topSintomas = Object.entries(contSintomas).sort((a,b)=>b[1]-a[1]).slice(0,4)
  // gatilhos do mês
  const contGatilhos: Record<string,number> = {}
  doMes.forEach(reg=>reg.alergia?.gatilhos.forEach(g=>{contGatilhos[g]=(contGatilhos[g]||0)+1}))
  const topGatilho = Object.entries(contGatilhos).sort((a,b)=>b[1]-a[1])[0]
  // Últimos 7 dias — mini sparkline de intensidade
  const ultimos7 = historico.slice(-7).map(x=>x.alergia?.intensidade||0)

  return (
    <Card pastel="red" style={{ display:'flex',flexDirection:'column',gap:12 }}>
      {/* Header */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          <span style={{ fontSize:'1.2rem' }}>🤧</span>
          <span style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.88rem',color:'var(--text-primary)' }}>Alergias</span>
        </div>
        <span style={{ fontFamily:'var(--font-mono)',fontSize:'0.62rem',color:'var(--text-muted)' }}>este mês</span>
      </div>

      {/* Status de hoje */}
      <div style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 14px',borderRadius:12,background:`${conf.c}10`,border:`1px solid ${conf.c}30` }}>
        <span style={{ fontSize:'1.8rem' }}>{conf.e}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700,fontSize:'0.88rem',color:conf.c }}>{conf.l}</div>
          <div style={{ fontSize:'0.65rem',color:'var(--text-muted)',marginTop:2 }}>
            {!al||al.intensidade===0?'Sem sintomas hoje':''}
            {al&&al.intensidade>0&&[al.espirros&&'espirros',al.coriza&&'coriza',al.coceiraNasal&&'coceira nasal',al.coceiraOlhos&&'coceira olhos',al.coceiraPele&&'coceira pele',al.tosse&&'tosse'].filter(Boolean).slice(0,3).join(' · ')}
          </div>
        </div>
        {al?.tomouRemedio && (
          <div style={{ fontSize:'0.7rem',color:'#fca5a5',fontWeight:700,display:'flex',flexDirection:'column',alignItems:'center',gap:1 }}>
            <span style={{ fontSize:'1rem' }}>💊</span>
            <span>remédio</span>
          </div>
        )}
      </div>

      {/* Mini sparkline 7d */}
      {ultimos7.some(v=>v>0) && (
        <div>
          <div style={{ fontSize:'0.58rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:5 }}>Intensidade últimos 7 dias</div>
          <div style={{ display:'flex',gap:3,alignItems:'flex-end',height:28 }}>
            {ultimos7.map((v,i)=>{
              const c = v===0?'rgba(255,255,255,0.07)':v===1?'#34d399':v===2?'#fbbf24':'#f87171'
              return <div key={i} style={{ flex:1,height:Math.max((v/3)*24,3),borderRadius:'3px 3px 0 0',background:c,transition:'height 0.4s' }} title={['Nenhuma','Leve','Moderada','Intensa'][v]} />
            })}
          </div>
        </div>
      )}

      {/* Stats do mês */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8 }}>
        {[
          {l:'Dias c/ alergia',v:diasComAlergia,c:'#fbbf24'},
          {l:'Dias intensos',v:diasIntensa,c:'#f87171'},
          {l:'Remédio',v:diasComRemedio,c:'#c4b5fd'},
        ].map(k=>(
          <div key={k.l} style={{ padding:'8px',borderRadius:8,background:'rgba(0,0,0,0.1)',textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1.1rem',color:k.c,lineHeight:1 }}>{k.v}</div>
            <div style={{ fontSize:'0.55rem',color:'var(--text-muted)',marginTop:3,lineHeight:1.3 }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Top sintomas */}
      {topSintomas.length > 0 && (
        <div>
          <div style={{ fontSize:'0.58rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6 }}>Sintomas mais frequentes</div>
          <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
            {topSintomas.map(([k,n])=>(
              <div key={k} style={{ display:'flex',alignItems:'center',gap:8 }}>
                <div style={{ fontSize:'0.7rem',color:'var(--text-secondary)',flex:1 }}>{LABELS_SINTOMA[k]||k}</div>
                <div style={{ width:60,height:4,borderRadius:2,background:'rgba(248,113,113,0.12)',overflow:'hidden' }}>
                  <div style={{ height:'100%',width:`${(n/doMes.length)*100}%`,background:PASTEL.red.text,borderRadius:2 }} />
                </div>
                <div style={{ fontFamily:'var(--font-mono)',fontSize:'0.65rem',color:PASTEL.red.text,width:22,textAlign:'right' }}>{n}x</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gatilho principal */}
      {topGatilho && (
        <div style={{ padding:'6px 12px',borderRadius:8,background:'rgba(0,0,0,0.1)',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <span style={{ fontSize:'0.65rem',color:'var(--text-muted)' }}>🌪 Gatilho principal</span>
          <span style={{ fontWeight:700,fontSize:'0.72rem',color:'#6ee7b7' }}>{topGatilho[0]} ({topGatilho[1]}x)</span>
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
// ─── Estágio 1: Visão Geral (layout da imagem) ─────────────────────────────────
const navBtn: React.CSSProperties = { width:26, height:26, borderRadius:8, border:'1px solid var(--border-md)', background:'transparent', color:'var(--text-secondary)', cursor:'pointer', fontSize:'0.85rem', lineHeight:1 }

// Medidor circular completo (Wellness Hub)
function RingGauge({ score, size=120 }: { score:number; size?:number }) {
  const color = scoreColor(score)
  const stroke = 12, r = (size-stroke)/2, c = 2*Math.PI*r
  const dash = (score/100)*c
  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border-md)" strokeWidth={stroke} opacity={0.4} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`} style={{ transition:'stroke-dasharray 0.9s ease', filter:`drop-shadow(0 0 6px ${color}70)` }} />
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
        <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:size*0.3, color, lineHeight:1 }}>{score}</div>
        <div style={{ fontSize:'0.55rem', color:'var(--text-muted)', letterSpacing:'0.08em', textTransform:'uppercase', marginTop:2 }}>bem-estar</div>
      </div>
    </div>
  )
}

// Gamificação: badges + progresso das rotinas + streak
function Conquistas({ registros, streak }: { registros:RegistroSaude[]; streak:number }) {
  const total = registros.length
  const mes = today().slice(0,7)
  const doMes = registros.filter(r=>r.data.startsWith(mes))
  const diasMes = new Date(Number(mes.slice(0,4)), Number(mes.slice(5,7)), 0).getDate()
  const pAgua = doMes.filter(r=>r.metaAgua>0 && r.agua>=r.metaAgua).length
  const pSono = doMes.filter(r=>!!r.sono.inicio && !!r.sono.fim).length
  const pTreino = doMes.filter(r=>r.treino.realizado).length
  const badges = [
    { nome:'Iniciante', icon:'🥉', ok: total>=1,   cor:'#cd7f32' },
    { nome:'Constante', icon:'🥈', ok: streak>=7,  cor:'#9ca3af' },
    { nome:'Mestre',    icon:'🥇', ok: streak>=30, cor:'#fbbf24' },
  ]
  const rotinas = [
    { nome:'Hidratação', val:pAgua,   max:diasMes, cor:'#60a5fa' },
    { nome:'Sono',       val:pSono,   max:diasMes, cor:'#a78bfa' },
    { nome:'Treino',     val:pTreino, max:diasMes, cor:'#34d399' },
  ]
  return (
    <Card style={{ display:'flex', flexDirection:'column', gap:16, height:'100%', boxSizing:'border-box' }}>
      <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'0.95rem', color:'var(--text-primary)' }}>🏆 Conquistas da Rotina</div>
      <div style={{ display:'flex', justifyContent:'space-around' }}>
        {badges.map(b=>(
          <div key={b.nome} style={{ textAlign:'center', opacity:b.ok?1:0.32 }}>
            <div style={{ fontSize:'1.9rem', filter:b.ok?`drop-shadow(0 0 6px ${b.cor}80)`:'grayscale(1)' }}>{b.icon}</div>
            <div style={{ fontSize:'0.62rem', fontWeight:700, color:b.ok?b.cor:'var(--text-muted)', marginTop:2 }}>{b.nome}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
        {rotinas.map(rt=>(
          <div key={rt.nome}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.68rem', color:'var(--text-muted)', marginBottom:4 }}>
              <span style={{ fontWeight:600 }}>{rt.nome}</span><span>{rt.val}/{rt.max} dias</span>
            </div>
            <ProgressBar value={rt.val} max={rt.max} color={rt.cor} />
          </div>
        ))}
      </div>
      <div style={{ marginTop:'auto', textAlign:'center', padding:'12px', borderRadius:12, background:PASTEL.amber.bg, border:`1px solid ${PASTEL.amber.border}` }}>
        <div style={{ fontSize:'1.7rem' }}>🔥</div>
        <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.7rem', color:'#f59e0b', lineHeight:1 }}>{streak}</div>
        <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', marginTop:2 }}>dias consecutivos</div>
      </div>
    </Card>
  )
}

// Calendário de Consistência: ícones por hábito + destaque de metas batidas
function CalendarioConsistencia({ registros, refMes, onPrev, onNext }: { registros:RegistroSaude[]; refMes:string; onPrev:()=>void; onNext:()=>void }) {
  const y = Number(refMes.slice(0,4)), m = Number(refMes.slice(5,7))
  const diasNoMes = new Date(y, m, 0).getDate()
  const offset = new Date(y, m-1, 1).getDay()
  const byData = new Map(registros.map(r=>[r.data, r]))
  const cells: ({ dia:number; reg?:RegistroSaude } | null)[] = []
  for (let i=0;i<offset;i++) cells.push(null)
  for (let d=1; d<=diasNoMes; d++){
    const ds = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    cells.push({ dia:d, reg: byData.get(ds) })
  }
  const nomeMes = new Date(y, m-1, 1).toLocaleDateString('pt-BR',{ month:'long', year:'numeric' })
  const semana = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  return (
    <Card style={{ display:'flex', flexDirection:'column', gap:12, height:'100%', boxSizing:'border-box' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
        <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'0.95rem', color:'var(--text-primary)' }}>📅 Calendário de Consistência</div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <button onClick={onPrev} style={navBtn}>‹</button>
          <span style={{ fontSize:'0.74rem', fontWeight:700, color:'var(--text-secondary)', textTransform:'capitalize', minWidth:120, textAlign:'center' }}>{nomeMes}</span>
          <button onClick={onNext} style={navBtn}>›</button>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6 }}>
        {semana.map(d=><div key={d} style={{ fontSize:'0.6rem', textAlign:'center', color:'var(--text-muted)', fontWeight:700 }}>{d}</div>)}
        {cells.map((c,i)=>{
          if(!c) return <div key={i} />
          const r = c.reg
          const sc = r ? scoreBestar(r) : -1
          const meta = sc>=60
          const icons:string[] = []
          if(r){ if(r.agua>0)icons.push('💧'); if(r.sono.inicio)icons.push('😴'); if(r.treino.realizado)icons.push('🏋️'); if(r.peso>0)icons.push('⚖️') }
          return (
            <div key={i} title={r?`${c.dia} — bem-estar ${sc}`:`${c.dia} — sem registro`}
              style={{ minHeight:48, borderRadius:10, padding:'4px 2px', display:'flex', flexDirection:'column', alignItems:'center', gap:2,
                background: meta ? `${scoreColor(sc)}1f` : (r ? 'var(--surface,rgba(125,125,125,0.06))' : 'transparent'),
                border:`1px solid ${meta ? scoreColor(sc)+'66' : 'var(--border-md)'}` }}>
              <span style={{ fontSize:'0.6rem', fontWeight:700, color: meta?scoreColor(sc):'var(--text-muted)' }}>{c.dia}</span>
              <div style={{ fontSize:'0.6rem', lineHeight:1.05, textAlign:'center' }}>{icons.slice(0,4).join('')}</div>
            </div>
          )
        })}
      </div>
      <div style={{ display:'flex', gap:10, fontSize:'0.58rem', color:'var(--text-muted)', flexWrap:'wrap', alignItems:'center' }}>
        <span>💧 Água</span><span>😴 Sono</span><span>🏋️ Treino</span><span>⚖️ Peso</span>
        <span style={{ marginLeft:'auto' }}>Borda colorida = meta do dia (bem-estar ≥ 60)</span>
      </div>
    </Card>
  )
}

// Gráficos comparativos (mês atual vs anterior) com filtros
function metricaValor(r:RegistroSaude, met:string): number|undefined {
  if(met==='peso')  return r.peso>0 ? r.peso : undefined
  if(met==='agua')  return r.agua>0 ? r.agua : undefined
  if(met==='sono')  { const h=calcSono(r.sono.inicio,r.sono.fim); return h>0?h:undefined }
  if(met==='bestar')return scoreBestar(r)
  return undefined
}
function serieMes(registros:RegistroSaude[], met:string, ym:string): {dia:number;val:number}[] {
  return registros.filter(r=>r.data.startsWith(ym))
    .map(r=>({ dia:Number(r.data.slice(8,10)), val:metricaValor(r,met) }))
    .filter((p): p is {dia:number;val:number} => p.val!==undefined)
    .sort((a,b)=>a.dia-b.dia)
}
function OverlayChart({ atual, anterior, color }: { atual:{dia:number;val:number}[]; anterior:{dia:number;val:number}[]; color:string }) {
  const W=300, H=120, PAD=8
  const all=[...atual,...anterior]
  if(all.length<1) return <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', padding:'22px 0', textAlign:'center' }}>Sem dados ainda neste período.</div>
  const maxV=Math.max(...all.map(p=>p.val)), minV=Math.min(...all.map(p=>p.val)), range=maxV-minV||1
  const xOf=(dia:number)=>PAD+((dia-1)/30)*(W-PAD*2)
  const yOf=(v:number)=>H-PAD-((v-minV)/range)*(H-PAD*2)
  const ln=(arr:{dia:number;val:number}[])=>arr.map(p=>`${xOf(p.dia)},${yOf(p.val)}`).join(' ')
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:'block' }}>
      {[0,0.5,1].map(f=>{ const yy=PAD+(1-f)*(H-PAD*2); return <line key={f} x1={PAD} y1={yy} x2={W-PAD} y2={yy} stroke="var(--border-md)" strokeWidth={1} strokeDasharray="3,4" opacity={0.5} /> })}
      {anterior.length>1 && <polyline points={ln(anterior)} fill="none" stroke="var(--text-muted)" strokeWidth={1.6} strokeDasharray="4,4" opacity={0.7} />}
      {atual.length>1 && <>
        <polygon points={`${xOf(atual[0].dia)},${H-PAD} ${ln(atual)} ${xOf(atual[atual.length-1].dia)},${H-PAD}`} fill={`${color}22`} />
        <polyline points={ln(atual)} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      </>}
    </svg>
  )
}
function PainelComparativo({ registros, refMes }: { registros:RegistroSaude[]; refMes:string }) {
  const opts = [
    { k:'peso',  l:'Peso',      c:'#5eead4' },
    { k:'agua',  l:'Água',      c:'#60a5fa' },
    { k:'sono',  l:'Sono',      c:'#a78bfa' },
    { k:'bestar',l:'Bem-Estar', c:'#fbbf24' },
  ]
  const [filtros, setFiltros] = useState<string[]>(['peso','agua'])  // padrão exigido: Peso + Água
  const y = Number(refMes.slice(0,4)), m = Number(refMes.slice(5,7))
  const ant = new Date(y, m-2, 1)
  const ymAnt = `${ant.getFullYear()}-${String(ant.getMonth()+1).padStart(2,'0')}`
  const toggle = (k:string) => setFiltros(f => f.includes(k) ? (f.length>1 ? f.filter(x=>x!==k) : f) : [...f.slice(-1), k])
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {opts.map(o=>(
          <button key={o.k} onClick={()=>toggle(o.k)}
            style={{ padding:'5px 12px', borderRadius:20, fontSize:'0.72rem', fontWeight:700, cursor:'pointer',
              border:`1px solid ${filtros.includes(o.k)?o.c:'var(--border-md)'}`, background:filtros.includes(o.k)?`${o.c}1f`:'transparent', color:filtros.includes(o.k)?o.c:'var(--text-muted)' }}>{o.l}</button>
        ))}
      </div>
      {filtros.map(k=>{
        const o = opts.find(x=>x.k===k)!
        return (
          <Card key={k} style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <div style={{ fontSize:'0.82rem', fontWeight:800, color:'var(--text-primary)' }}>{o.l} <span style={{ fontSize:'0.62rem', color:'var(--text-muted)', fontWeight:500 }}>· mês atual vs anterior</span></div>
            <OverlayChart atual={serieMes(registros,k,refMes)} anterior={serieMes(registros,k,ymAnt)} color={o.c} />
            <div style={{ display:'flex', gap:14, fontSize:'0.6rem', color:'var(--text-muted)' }}>
              <span style={{ color:o.c }}>━ Atual</span><span>┄ Anterior</span>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

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
  const [mesRef, setMesRef] = useState(today().slice(0,7))
  const mudaMes = (delta:number) => {
    const y=Number(mesRef.slice(0,4)), m=Number(mesRef.slice(5,7))
    const d=new Date(y, m-1+delta, 1)
    setMesRef(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
  }

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
          {/* Wellness Hub (medidor em anel) */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, flexShrink:0 }}>
            <div style={{ fontSize:'0.62rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Wellness Hub</div>
            <RingGauge score={score} size={110} />
          </div>
          {/* Ações */}
          <div style={{ display:'flex',flexDirection:'column',gap:8,flexShrink:0 }}>
            <button onClick={()=>setDrawerOpen(true)}
              style={{ padding:'10px 20px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#059669,#10b981)',color:'#fff',fontFamily:'var(--font-display)',fontWeight:800,fontSize:'0.85rem',cursor:'pointer',boxShadow:'0 4px 14px rgba(16,185,129,0.3)',whiteSpace:'nowrap' }}>
              📋 Registro Rápido
            </button>
            {streak > 0 && (
              <div style={{ textAlign:'center',fontSize:'0.7rem',color:'#f59e0b',fontWeight:700 }}>🔥 {streak} dias consecutivos</div>
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
          <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
            <div style={{ display:'grid', gridTemplateColumns:'minmax(210px,1fr) minmax(300px,2fr) minmax(230px,1fr)', gap:16, alignItems:'stretch' }}>
              <Conquistas registros={registros} streak={streak} />
              <CalendarioConsistencia registros={registros} refMes={mesRef} onPrev={()=>mudaMes(-1)} onNext={()=>mudaMes(1)} />
              <PainelComparativo registros={registros} refMes={mesRef} />
            </div>
            <details>
              <summary style={{ cursor:'pointer', fontFamily:'var(--font-display)', fontWeight:800, fontSize:'0.9rem', color:'var(--text-primary)', padding:'6px 0' }}>
                📝 Registro de hoje — água, humor, peso, treino, sono, alergia, sintomas
              </summary>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14, marginTop:12 }}>
                <BentoAgua r={registroAtual} onUpdate={inlineUpdate} />
                <BentoHumorEnergia r={registroAtual} historico={historico} />
                <BentoPeso r={registroAtual} historico={historico} />
                <BentoTreino r={registroAtual} historico={historico} />
                <BentoSono r={registroAtual} historico={historico} />
                <BentoAlergia r={registroAtual} historico={historico} />
                <BentoSintomas r={registroAtual} historico={historico} />
              </div>
            </details>
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
