import { useMemo } from 'react'
import { AGU_DISCIPLINAS, TOTAL_SUBTOPICOS } from '../editais/aguData'
import { useEditaisAGU } from '../../hooks/useEditaisAGU'
import { auth, db } from '../../lib/firebase'
import { useState, useEffect } from 'react'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'

interface Props { onNavigate: (id: string) => void }

/* ── Ring gauge ── */
function RingGauge({ pct, color, size=72 }: { pct:number; color:string; size?:number }) {
  const r=(size-10)/2, circ=2*Math.PI*r, dash=(pct/100)*circ
  return (
    <svg width={size} height={size} style={{transform:'rotate(-90deg)',flexShrink:0}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-4)" strokeWidth={5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
        style={{transition:'stroke-dasharray 1s ease',filter:`drop-shadow(0 0 5px ${color})`}}/>
    </svg>
  )
}

/* ── usePontoStats ── */
function usePontoStats() {
  const [registros, setRegistros] = useState<any[]>([])
  const uid = auth?.currentUser?.uid
  useEffect(()=>{
    if(!uid||!db) return
    const q = query(collection(db,`users/${uid}/ponto`),orderBy('data','desc'))
    return onSnapshot(q, snap=>setRegistros(snap.docs.map(d=>d.data())))
  },[uid])
  const hoje = new Date().toISOString().slice(0,10)
  const mesAtual = hoje.slice(0,7)
  const regHoje = registros.find(r=>r.data===hoje)
  const minMes = registros.filter(r=>r.data.startsWith(mesAtual)).reduce((a,r)=>a+(r.minutos||0),0)
  const hMes = Math.floor(minMes/60)
  const mMes = minMes%60
  const emServico = !!(regHoje?.entrada && !regHoje?.saida)
  const fmtHoje = regHoje?.minutos ? `${Math.floor(regHoje.minutos/60)}h${regHoje.minutos%60>0?` ${regHoje.minutos%60}min`:''}` : null

  // Bater ponto rápido
  const nowHHMM=()=>{const n=new Date();return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`}
  const calcMin=(e:string,s:string)=>{if(!e||!s)return 0;const[eh,em]=e.split(':').map(Number);const[sh,sm]=s.split(':').map(Number);const d=(sh*60+sm)-(eh*60+em);return d>0?d:0}

  const baterEntrada = async () => {
    if(!uid||!db||regHoje?.entrada) return
    const{setDoc,doc}=await import('firebase/firestore')
    const h=nowHHMM(),id=regHoje?.id??(hoje+'_'+Date.now().toString(36))
    await setDoc(doc(db,`users/${uid}/ponto`,id),{id,data:hoje,entrada:h,saida:'',minutos:0,observacao:''})
  }
  const baterSaida = async () => {
    if(!uid||!db||!regHoje?.entrada||regHoje?.saida) return
    const{setDoc,doc}=await import('firebase/firestore')
    const h=nowHHMM(),min=calcMin(regHoje.entrada,h)
    await setDoc(doc(db,`users/${uid}/ponto`,regHoje.id),{...regHoje,saida:h,minutos:min})
  }
  return { emServico, fmtHoje, hMes, mMes, baterEntrada, baterSaida, regHoje }
}

export default function NexusDashboard({ onNavigate }: Props) {
  const hooks = useEditaisAGU()
  const ponto = usePontoStats()

  const allIds = useMemo(()=>AGU_DISCIPLINAS.flatMap(d=>d.topicos.flatMap(t=>t.subtopicos.map(s=>s.id))),[])
  const global = hooks.getStats(allIds)

  const lastFinalized = useMemo(()=>{
    let best:{ nome:string; disc:string; data:string }|null=null
    for(const d of AGU_DISCIPLINAS) for(const t of d.topicos) for(const s of t.subtopicos){
      const st=hooks.getState(s.id)
      if(st.dataFinalizacao&&st.statusMaterial==='concluido'){
        if(!best||st.dataFinalizacao>best.data) best={nome:s.nome,disc:d.nome,data:st.dataFinalizacao}
      }
    }
    return best
  },[hooks])

  const discStats = useMemo(()=>AGU_DISCIPLINAS.map(d=>{
    const ids=d.topicos.flatMap(t=>t.subtopicos.map(s=>s.id))
    const st=hooks.getStats(ids)
    return{...d,...st,total:ids.length}
  }),[hooks])

  return (
    <div style={{padding:'20px',display:'flex',flexDirection:'column',gap:18}}>

      {/* ── KPIs row ── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:14}}>
        {[
          {label:'Progresso Edital',value:`${global.pctConcluido}%`,sub:`${global.concluidos}/${TOTAL_SUBTOPICOS} subtópicos`,color:'#00e5ff'},
          {label:'Questões Feitas',value:global.questoes||'—',sub:`${global.acertos} acertos`,color:'#7c3aed'},
          {label:'% Acerto Geral',value:global.questoes>0?`${global.pctAcerto}%`:'—',sub:'performance geral',color:'#10b981'},
          {label:'Horas no Mês',value:`${ponto.hMes}h${ponto.mMes>0?` ${ponto.mMes}m`:''}`,sub:ponto.emServico?'🟢 Em serviço':'Ponto eletrônico',color:'#f59e0b'},
        ].map(k=>(
          <div key={k.label} className="kpi-card" style={{'--kpi-color':k.color} as React.CSSProperties}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{color:k.color,fontSize:'clamp(1.4rem,3vw,2.2rem)'}}>{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Ponto rápido + AGU + Questões ── */}
      <div style={{display:'grid',gridTemplateColumns:'auto 1fr 1fr',gap:14,alignItems:'start'}}>

        {/* Ponto rápido */}
        <div className="card" style={{minWidth:180,padding:'18px 16px',textAlign:'center'}}>
          <div style={{fontFamily:'var(--font-mono)',fontSize:'0.62rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:12}}>Ponto Rápido</div>
          {ponto.emServico && (
            <div style={{background:'rgba(16,185,129,0.1)',border:'1px solid rgba(16,185,129,0.25)',borderRadius:8,padding:'6px 10px',marginBottom:10,fontSize:'0.7rem',color:'#10b981',fontFamily:'var(--font-mono)'}}>
              🟢 EM SERVIÇO
            </div>
          )}
          {ponto.fmtHoje && (
            <div style={{fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1.2rem',color:'var(--text-accent)',marginBottom:10}}>{ponto.fmtHoje}</div>
          )}
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <button onClick={ponto.baterEntrada} disabled={!!ponto.regHoje?.entrada}
              style={{padding:'10px 8px',borderRadius:10,border:'1px solid rgba(16,185,129,0.4)',background:ponto.regHoje?.entrada?'rgba(16,185,129,0.05)':'rgba(16,185,129,0.12)',color:ponto.regHoje?.entrada?'rgba(16,185,129,0.3)':'#10b981',fontFamily:'var(--font-display)',fontWeight:800,fontSize:'0.85rem',cursor:ponto.regHoje?.entrada?'not-allowed':'pointer',transition:'all 0.2s'}}>
              → ENTRADA
            </button>
            <button onClick={ponto.baterSaida} disabled={!ponto.regHoje?.entrada||!!ponto.regHoje?.saida}
              style={{padding:'10px 8px',borderRadius:10,border:'1px solid rgba(239,68,68,0.4)',background:(!ponto.regHoje?.entrada||ponto.regHoje?.saida)?'rgba(239,68,68,0.05)':'rgba(239,68,68,0.12)',color:(!ponto.regHoje?.entrada||ponto.regHoje?.saida)?'rgba(239,68,68,0.3)':'#ef4444',fontFamily:'var(--font-display)',fontWeight:800,fontSize:'0.85rem',cursor:(!ponto.regHoje?.entrada||ponto.regHoje?.saida)?'not-allowed':'pointer',transition:'all 0.2s'}}>
              ← SAÍDA
            </button>
          </div>
          <button onClick={()=>onNavigate('ponto')} style={{marginTop:12,width:'100%',padding:'6px',borderRadius:7,border:'1px solid var(--border)',background:'none',color:'var(--text-muted)',fontFamily:'var(--font-display)',fontWeight:600,fontSize:'0.72rem',cursor:'pointer'}}>Ver relatórios →</button>
        </div>

        {/* AGU panel */}
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',background:'linear-gradient(90deg,rgba(0,229,255,0.04)0%,transparent 100%)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
            <div>
              <div style={{fontFamily:'var(--font-mono)',fontSize:'0.62rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:2}}>⚖ Edital AGU</div>
              <div style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>14 disciplinas · {TOTAL_SUBTOPICOS} subtópicos</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
              <RingGauge pct={global.pctConcluido} color="#00e5ff" size={60}/>
              <div>
                <div style={{fontFamily:'var(--font-display)',fontSize:'1.5rem',fontWeight:800,color:'#00e5ff',lineHeight:1}}>{global.pctConcluido}%</div>
                <div style={{fontSize:'0.6rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em'}}>concluído</div>
              </div>
            </div>
          </div>
          {lastFinalized&&(
            <div style={{padding:'8px 18px',borderBottom:'1px solid var(--border)',background:'rgba(16,185,129,0.03)',display:'flex',alignItems:'center',gap:8}}>
              <span style={{color:'#10b981'}}>✓</span>
              <div>
                <div style={{fontSize:'0.65rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Último concluído · {lastFinalized.data}</div>
                <div style={{fontSize:'0.78rem',color:'var(--text-primary)',fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:260}}>{lastFinalized.nome}</div>
              </div>
            </div>
          )}
          <div style={{padding:'10px 18px',display:'flex',flexDirection:'column',gap:6,maxHeight:220,overflowY:'auto'}}>
            {discStats.map(d=>(
              <div key={d.id} style={{display:'grid',gridTemplateColumns:'1fr 100px 36px',alignItems:'center',gap:8}}>
                <div style={{fontSize:'0.72rem',color:'var(--text-secondary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{d.nome.replace('Direito ','')}</div>
                <div className="progress-track"><div className="progress-fill" style={{width:`${d.pctConcluido}%`,background:d.cor,color:d.cor}}/></div>
                <div style={{fontSize:'0.68rem',fontWeight:700,color:d.cor,textAlign:'right',fontFamily:'var(--font-mono)'}}>{d.pctConcluido}%</div>
              </div>
            ))}
          </div>
          <div style={{padding:'10px 18px',borderTop:'1px solid var(--border)'}}>
            <button className="btn btn-accent" onClick={()=>onNavigate('editais')} style={{width:'100%',justifyContent:'center',fontSize:'0.82rem'}}>⚖ Abrir Editais AGU</button>
          </div>
        </div>

        {/* Questões panel */}
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',background:'linear-gradient(90deg,rgba(124,58,237,0.04)0%,transparent 100%)'}}>
            <div style={{fontFamily:'var(--font-mono)',fontSize:'0.62rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:2}}>◈ Questões</div>
            <div style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>Performance por disciplina</div>
          </div>
          <div style={{padding:'14px 18px',display:'flex',alignItems:'center',gap:14,borderBottom:'1px solid var(--border)'}}>
            <RingGauge pct={global.questoes>0?global.pctAcerto:0} color="#7c3aed" size={60}/>
            <div>
              <div style={{fontFamily:'var(--font-display)',fontSize:'1.8rem',fontWeight:800,color:'#7c3aed',lineHeight:1}}>{global.questoes>0?`${global.pctAcerto}%`:'—'}</div>
              <div style={{fontSize:'0.7rem',color:'var(--text-muted)',marginTop:3}}>{global.questoes} questões · {global.acertos} acertos</div>
            </div>
          </div>
          <div style={{padding:'10px 18px',display:'flex',flexDirection:'column',gap:6,maxHeight:220,overflowY:'auto'}}>
            {discStats.filter(d=>d.questoes>0).length===0?(
              <div style={{textAlign:'center',padding:'24px 0',color:'var(--text-muted)',fontSize:'0.78rem'}}>
                Nenhuma questão registrada ainda.<br/>
                <span style={{color:'var(--text-accent)',cursor:'pointer'}} onClick={()=>onNavigate('editais')}>→ Registrar no Editais AGU</span>
              </div>
            ):discStats.filter(d=>d.questoes>0).map(d=>(
              <div key={d.id}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                  <span style={{fontSize:'0.72rem',color:'var(--text-secondary)'}}>{d.nome.replace('Direito ','')}</span>
                  <span style={{fontSize:'0.72rem',fontFamily:'var(--font-mono)',color:d.cor,fontWeight:700}}>{d.pctAcerto}% <span style={{color:'var(--text-muted)',fontWeight:400}}>({d.questoes}q)</span></span>
                </div>
                <div className="progress-track"><div className="progress-fill" style={{width:`${d.pctAcerto}%`,background:d.cor,color:d.cor}}/></div>
              </div>
            ))}
          </div>
          {discStats.filter(d=>d.questoes>0).length>0&&(()=>{
            const worst=[...discStats].filter(d=>d.questoes>0).sort((a,b)=>a.pctAcerto-b.pctAcerto).slice(0,3)
            return(
              <div style={{padding:'10px 18px',borderTop:'1px solid var(--border)',background:'rgba(239,68,68,0.02)'}}>
                <div style={{fontSize:'0.62rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:5,fontFamily:'var(--font-mono)'}}>⚠ Atenção prioritária</div>
                {worst.map(d=>(
                  <div key={d.id} style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem',padding:'2px 0'}}>
                    <span style={{color:'var(--text-secondary)'}}>{d.nome.replace('Direito ','')}</span>
                    <span className="badge badge-red">{d.pctAcerto}%</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── Módulos ── */}
      <div>
        <div className="section-heading">MÓDULOS</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:12}}>
          {[
            {id:'editais',  label:'Editais AGU',      icon:'⚖', desc:`${global.concluidos}/${TOTAL_SUBTOPICOS} subtópicos`,color:'#00e5ff'},
            {id:'concursos',label:'Concursos',         icon:'🎯',desc:'Cadastro e acompanhamento',          color:'#7c3aed'},
            {id:'ponto',    label:'Ponto Eletrônico',  icon:'⊙', desc:ponto.emServico?'🟢 Em serviço':`${ponto.hMes}h no mês`,color:'#f59e0b'},
            {id:'financeiro',label:'Financeiro',       icon:'◎', desc:'Em breve',                           color:'#10b981'},
            {id:'journal',  label:'Diário',            icon:'✦', desc:'Em breve',                           color:'#ec4899'},
            {id:'media',    label:'Media Tracker',     icon:'▶', desc:'Em breve',                           color:'#3b82f6'},
          ].map(m=>(
            <button key={m.id} onClick={()=>onNavigate(m.id)} className="card"
              style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer',background:'var(--card-bg)',border:'1px solid var(--border)',textAlign:'left',width:'100%',transition:'all 0.18s',padding:'14px 16px'}}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=m.color;(e.currentTarget as HTMLElement).style.boxShadow=`0 0 16px ${m.color}25`}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='';(e.currentTarget as HTMLElement).style.boxShadow=''}}>
              <span style={{fontSize:'1.6rem',flexShrink:0}}>{m.icon}</span>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:700,color:m.color,fontSize:'0.85rem',fontFamily:'var(--font-display)'}}>{m.label}</div>
                <div style={{fontSize:'0.68rem',color:'var(--text-muted)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{m.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
