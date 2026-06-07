import { useState, useEffect, useCallback } from 'react'
import { db, auth } from '../../lib/firebase'
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore'

/* ═══ Types ══════════════════════════════════════════════════ */
type Nivel = 'Superior' | 'Médio' | 'Técnico' | 'Fundamental'
type Prioridade = 'alta' | 'media' | 'baixa'
type StatusPrev = 'previsto' | 'edital' | 'inscricoes' | 'provas' | 'resultado' | 'encerrado'
type StatusReal = 'aprovado' | 'classificado' | 'aguardando' | 'reprovado' | 'desistiu'

interface ProvaBloco {
  ativo: boolean
  disciplinas: string[]
  peso: number
  questoes: number
  duracao: number
  notaCorte: number
  obs: string
}

interface Concurso {
  id: string; nome: string; orgao: string; area: string; nivel: Nivel
  banca: string; status: StatusPrev; prioridade: Prioridade
  vagas: number; remuneracao: string; taxa: string; local: string
  dataEdital: string; dataInscricaoFim: string; dataProva: string; dataResultado: string
  linkEdital: string; linkSite: string; observacoes: string
  provaObj: ProvaBloco; provaDiss: ProvaBloco; provaOral: ProvaBloco
  criadoEm: string
}

interface Realizado {
  id: string; orgao: string; cargo: string; banca: string; ano: number
  notaObj: number|null; notaDiss: number|null; notaTotal: number|null
  classificacao: number|null; totalCandidatos: number|null
  status: StatusReal; observacoes: string; criadoEm: string
}

/* ═══ Constants ══════════════════════════════════════════════ */
const BANCAS = ['CESPE/CEBRASPE','FCC','FGV','VUNESP','AOCP','IBFC','QUADRIX','IDECAN','IADES','FAURGS','MOVIMENTAR','CEFET','PGE','Banca Própria','Outra']
const ORGAOS = ['AGU','TCU','TCE-MG','TCE-RS','MPU','MPF','STF','STJ','TRF 1ª Região','TRF 2ª Região','TRF 3ª Região','TST','TRT','PF','PRF','Receita Federal','INSS','ANATEL','ANEEL','ANVISA','CGU','DPU','INPI','Banco do Brasil','CEF','BNDES','Outro']
const AREAS = ['Jurídica','Administrativa','Fiscal','Policial','Saúde','TI','Engenharia','Educação','Outra']
const DISC_JURIDICAS = [
  'Direito Constitucional','Direito Administrativo','Direito Civil','Direito Processual Civil',
  'Direito Tributário','Direito Financeiro','Direito Internacional','Direito Ambiental',
  'Direito Previdenciário','Direito Penal','Direito Processual Penal','Direito Empresarial',
  'Direito do Trabalho','Advocacia Pública','Direito Eleitoral','Direito Digital',
]
const DISC_GERAIS = [
  'Língua Portuguesa','Redação','Raciocínio Lógico','Informática','Matemática Financeira',
  'Administração Pública','Gestão de Pessoas','Atualidades','Ética no Serviço Público',
  'Legislação Específica','Contabilidade','Economia','Estatística',
]
const ALL_DISC = [...DISC_JURIDICAS, ...DISC_GERAIS]

const SL: Record<StatusPrev,string> = {previsto:'Previsto',edital:'Com Edital',inscricoes:'Inscrições Abertas',provas:'Em Provas',resultado:'Resultado',encerrado:'Encerrado'}
const SC: Record<StatusPrev,string> = {previsto:'#64748b',edital:'#3b82f6',inscricoes:'#10b981',provas:'#f59e0b',resultado:'#8b5cf6',encerrado:'#6b7280'}
const RL: Record<StatusReal,string> = {aprovado:'Aprovado',classificado:'Classificado',aguardando:'Aguardando',reprovado:'Reprovado',desistiu:'Desistiu'}
const RC: Record<StatusReal,string> = {aprovado:'#10b981',classificado:'#3b82f6',aguardando:'#f59e0b',reprovado:'#ef4444',desistiu:'#6b7280'}
const PL: Record<Prioridade,string> = {alta:'🔴 Alta',media:'🟡 Média',baixa:'🟢 Baixa'}

function newId() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6) }
function fmtDate(d:string) { if(!d)return'—'; const[y,m,dy]=d.split('-'); return `${dy}/${m}/${y}` }
function daysUntil(d:string) { if(!d)return null; return Math.ceil((new Date(d).getTime()-Date.now())/86400000) }
function emptyProva(): ProvaBloco { return{ativo:false,disciplinas:[],peso:1,questoes:0,duracao:0,notaCorte:0,obs:''} }
function emptyConcurso(): Omit<Concurso,'id'|'criadoEm'> {
  return{nome:'',orgao:'',area:'Jurídica',nivel:'Superior',banca:'',status:'previsto',prioridade:'media',
    vagas:0,remuneracao:'',taxa:'',local:'',dataEdital:'',dataInscricaoFim:'',dataProva:'',dataResultado:'',
    linkEdital:'',linkSite:'',observacoes:'',provaObj:emptyProva(),provaDiss:emptyProva(),provaOral:emptyProva()}
}

/* ═══ Styles ═════════════════════════════════════════════════ */
const inp: React.CSSProperties = {width:'100%',padding:'9px 12px',background:'var(--input-bg)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text-primary)',fontFamily:'var(--font-body)',fontSize:'0.88rem'}
const sel: React.CSSProperties = {...inp,cursor:'pointer'}
function FL({label,children}:{label:string;children:React.ReactNode}) {
  return <div style={{marginBottom:12}}><label style={{display:'block',fontSize:'0.68rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:5,fontFamily:'var(--font-mono)'}}>{label}</label>{children}</div>
}
function BtnGroup({options,value,onChange,colors}:{options:{v:string;l:string}[];value:string;onChange:(v:string)=>void;colors?:Record<string,string>}) {
  return <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{options.map(o=>{
    const active=value===o.v
    const col=colors?.[o.v]||'var(--text-accent)'
    return<button key={o.v} type="button" onClick={()=>onChange(o.v)} style={{padding:'6px 14px',borderRadius:20,border:`1px solid ${active?col:'var(--border)'}`,background:active?`${col}18`:'none',color:active?col:'var(--text-muted)',fontFamily:'var(--font-display)',fontWeight:600,fontSize:'0.78rem',cursor:'pointer',transition:'all 0.15s'}}>{o.l}</button>
  })}</div>
}

/* ═══ Disc Picker ════════════════════════════════════════════ */
function DiscPicker({value,onChange,label}:{value:string[];onChange:(v:string[])=>void;label:string}) {
  const [busca,setBusca]=useState('')
  const [custom,setCustom]=useState('')
  const toggle=(d:string)=>onChange(value.includes(d)?value.filter(x=>x!==d):[...value,d])
  const addCustom=()=>{if(custom.trim()&&!value.includes(custom.trim())){onChange([...value,custom.trim()]);setCustom('')}}
  const filtered=ALL_DISC.filter(d=>!busca||d.toLowerCase().includes(busca.toLowerCase()))
  return(
    <div>
      <div style={{fontSize:'0.68rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8,fontFamily:'var(--font-mono)'}}>{label}</div>
      {value.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:10}}>{value.map(d=><span key={d} style={{padding:'3px 10px',borderRadius:20,background:'rgba(0,229,255,0.12)',border:'1px solid rgba(0,229,255,0.3)',color:'var(--text-accent)',fontSize:'0.72rem',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:5}} onClick={()=>toggle(d)}>{d} <span style={{opacity:.6}}>×</span></span>)}</div>}
      <input placeholder="🔍 Buscar disciplina…" value={busca} onChange={e=>setBusca(e.target.value)} style={{...inp,marginBottom:8,fontSize:'0.82rem'}}/>
      <div style={{display:'flex',flexWrap:'wrap',gap:5,maxHeight:140,overflowY:'auto',padding:'4px 0'}}>
        {filtered.map(d=><button key={d} type="button" onClick={()=>toggle(d)} style={{padding:'4px 10px',borderRadius:20,border:`1px solid ${value.includes(d)?'rgba(0,229,255,0.4)':'var(--border)'}`,background:value.includes(d)?'rgba(0,229,255,0.1)':'none',color:value.includes(d)?'var(--text-accent)':'var(--text-secondary)',fontSize:'0.72rem',fontWeight:600,cursor:'pointer',transition:'all 0.15s'}}>{d}</button>)}
      </div>
      <div style={{display:'flex',gap:6,marginTop:8}}>
        <input placeholder="Adicionar personalizada…" value={custom} onChange={e=>setCustom(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addCustom()} style={{...inp,fontSize:'0.8rem',flex:1}}/>
        <button type="button" onClick={addCustom} style={{padding:'8px 14px',borderRadius:8,border:'1px solid var(--border-md)',background:'rgba(0,229,255,0.08)',color:'var(--text-accent)',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.78rem',cursor:'pointer',whiteSpace:'nowrap'}}>+ Adicionar</button>
      </div>
    </div>
  )
}

/* ═══ ProvaSection ════════════════════════════════════════════ */
function ProvaSection({title,icon,value,onChange}:{title:string;icon:string;value:ProvaBloco;onChange:(v:ProvaBloco)=>void}) {
  const [open,setOpen]=useState(value.ativo)
  const set=(k:keyof ProvaBloco,v:any)=>onChange({...value,[k]:v})
  return(
    <div style={{border:'1px solid var(--border)',borderRadius:10,overflow:'hidden',marginBottom:10}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',cursor:'pointer',background:value.ativo?'rgba(0,229,255,0.04)':'var(--bg-3)'}} onClick={()=>{if(!value.ativo){set('ativo',true);setOpen(true)}else{setOpen(o=>!o)}}}>
        <span style={{fontSize:'1.1rem'}}>{icon}</span>
        <span style={{fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.88rem',flex:1,color:value.ativo?'var(--text-accent)':'var(--text-secondary)'}}>{title}</span>
        <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer'}} onClick={e=>e.stopPropagation()}>
          <input type="checkbox" checked={value.ativo} onChange={e=>{set('ativo',e.target.checked);if(e.target.checked)setOpen(true)}}/>
          <span style={{fontSize:'0.72rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{value.ativo?'Incluída':'Não incluída'}</span>
        </label>
        <span style={{color:'var(--text-muted)',fontSize:'0.8rem'}}>{open?'▾':'▸'}</span>
      </div>
      {open&&value.ativo&&(
        <div style={{padding:'16px',borderTop:'1px solid var(--border)'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:12}}>
            <FL label="Questões"><input type="number" style={inp} value={value.questoes||''} onChange={e=>set('questoes',+e.target.value||0)} placeholder="0"/></FL>
            <FL label="Duração (min)"><input type="number" style={inp} value={value.duracao||''} onChange={e=>set('duracao',+e.target.value||0)} placeholder="0"/></FL>
            <FL label="Nota de Corte"><input type="number" step="0.1" style={inp} value={value.notaCorte||''} onChange={e=>set('notaCorte',+e.target.value||0)} placeholder="0"/></FL>
          </div>
          <DiscPicker value={value.disciplinas} onChange={v=>set('disciplinas',v)} label="Disciplinas cobradas"/>
          <div style={{marginTop:10}}>
            <FL label="Observações"><textarea style={{...inp,minHeight:56,resize:'vertical'} as React.CSSProperties} value={value.obs} onChange={e=>set('obs',e.target.value)} placeholder="Formato, critérios, temas específicos…"/></FL>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══ Wizard ════════════════════════════════════════════════ */
function WizardConcurso({initial,onSave,onClose}:{initial?:Partial<Concurso>;onSave:(c:Concurso)=>void;onClose:()=>void}) {
  const [step,setStep]=useState(0)
  const [form,setForm]=useState<Omit<Concurso,'id'|'criadoEm'>>({...emptyConcurso(),...(initial??{})})
  const f=(k:keyof typeof form)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setForm(p=>({...p,[k]:e.target.value}))
  const setF=(k:keyof typeof form,v:any)=>setForm(p=>({...p,[k]:v}))

  const steps=['Identificação','Vagas & Datas','Provas','Revisão']

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bg-2)',border:'1px solid var(--border-md)',borderRadius:18,width:'100%',maxWidth:700,maxHeight:'92vh',overflowY:'auto',boxShadow:'0 32px 80px rgba(0,0,0,0.6)'}}>
        {/* Header */}
        <div style={{padding:'20px 24px',borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--bg-2)',zIndex:1}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
            <div style={{fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1rem',color:'var(--text-accent)'}}>{initial?.id?'Editar Concurso':'Novo Concurso'}</div>
            <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text-muted)',fontSize:'1.4rem',cursor:'pointer',lineHeight:1}}>×</button>
          </div>
          {/* Steps indicator */}
          <div style={{display:'flex',gap:0}}>
            {steps.map((s,i)=>(
              <div key={s} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',cursor:i<step?'pointer':'default'}} onClick={()=>i<step&&setStep(i)}>
                <div style={{width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-display)',fontWeight:800,fontSize:'0.78rem',background:i===step?'var(--text-accent)':i<step?'rgba(0,229,255,0.2)':'var(--bg-4)',color:i===step?'var(--bg-0)':i<step?'var(--text-accent)':'var(--text-muted)',border:i===step?'none':`1px solid ${i<step?'rgba(0,229,255,0.3)':'var(--border)'}`,transition:'all 0.2s'}}>{i<step?'✓':i+1}</div>
                <div style={{fontSize:'0.62rem',marginTop:4,color:i===step?'var(--text-accent)':i<step?'var(--text-secondary)':'var(--text-muted)',fontFamily:'var(--font-display)',fontWeight:600,letterSpacing:'0.04em',textAlign:'center'}}>{s}</div>
                {i<steps.length-1&&<div style={{position:'absolute',height:2,width:'calc(25% - 28px)',background:i<step?'rgba(0,229,255,0.3)':'var(--border)',top:14,left:`calc(${(i+0.5)*25}% + 14px)`}}/>}
              </div>
            ))}
          </div>
        </div>

        <div style={{padding:'20px 24px'}}>
          {/* Step 0: Identificação */}
          {step===0&&<>
            <FL label="Nome do Concurso"><input style={inp} value={form.nome} onChange={f('nome')} placeholder="Ex: Advogado da União – AGU 2025"/></FL>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <FL label="Órgão"><select style={sel} value={form.orgao} onChange={f('orgao')}><option value="">Selecione…</option>{ORGAOS.map(o=><option key={o}>{o}</option>)}</select></FL>
              <FL label="Área"><select style={sel} value={form.area} onChange={f('area')}>{AREAS.map(a=><option key={a}>{a}</option>)}</select></FL>
            </div>
            <FL label="Nível"><BtnGroup value={form.nivel} onChange={v=>setF('nivel',v)} options={(['Superior','Médio','Técnico','Fundamental'] as Nivel[]).map(v=>({v,l:v}))}/></FL>
            <FL label="Banca"><select style={sel} value={form.banca} onChange={f('banca')}><option value="">Selecione…</option>{BANCAS.map(b=><option key={b}>{b}</option>)}</select></FL>
            <FL label="Status"><BtnGroup value={form.status} onChange={v=>setF('status',v)} options={(Object.keys(SL) as StatusPrev[]).map(v=>({v,l:SL[v]}))}/></FL>
            <FL label="Prioridade"><BtnGroup value={form.prioridade} onChange={v=>setF('prioridade',v)} options={(Object.keys(PL) as Prioridade[]).map(v=>({v,l:PL[v]}))}/></FL>
          </>}

          {/* Step 1: Vagas & Datas */}
          {step===1&&<>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12}}>
              <FL label="Vagas"><input type="number" style={inp} value={form.vagas||''} onChange={f('vagas')} placeholder="0"/></FL>
              <FL label="Remuneração"><input style={inp} value={form.remuneracao} onChange={f('remuneracao')} placeholder="R$ 21.029,00"/></FL>
              <FL label="Taxa de inscrição"><input style={inp} value={form.taxa} onChange={f('taxa')} placeholder="R$ 115,00"/></FL>
              <FL label="Local da prova"><input style={inp} value={form.local} onChange={f('local')} placeholder="Brasília/DF e capitais"/></FL>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12}}>
              <FL label="Data do Edital"><input type="date" style={inp} value={form.dataEdital} onChange={f('dataEdital')}/></FL>
              <FL label="Fim das Inscrições"><input type="date" style={inp} value={form.dataInscricaoFim} onChange={f('dataInscricaoFim')}/></FL>
              <FL label="Data da Prova"><input type="date" style={inp} value={form.dataProva} onChange={f('dataProva')}/></FL>
              <FL label="Data do Resultado"><input type="date" style={inp} value={form.dataResultado} onChange={f('dataResultado')}/></FL>
            </div>
            <FL label="Link do Edital"><input style={inp} value={form.linkEdital} onChange={f('linkEdital')} placeholder="https://…"/></FL>
            <FL label="Link do Site"><input style={inp} value={form.linkSite} onChange={f('linkSite')} placeholder="https://…"/></FL>
          </>}

          {/* Step 2: Provas */}
          {step===2&&<>
            <p style={{fontSize:'0.8rem',color:'var(--text-muted)',marginBottom:16}}>Ative e configure cada fase do concurso. Clique para expandir e selecionar as disciplinas cobradas.</p>
            <ProvaSection title="Prova Objetiva" icon="📝" value={form.provaObj} onChange={v=>setF('provaObj',v)}/>
            <ProvaSection title="Prova Dissertativa / Discursiva" icon="✍️" value={form.provaDiss} onChange={v=>setF('provaDiss',v)}/>
            <ProvaSection title="Prova Oral" icon="🎤" value={form.provaOral} onChange={v=>setF('provaOral',v)}/>
            <FL label="Observações Gerais"><textarea style={{...inp,minHeight:72,resize:'vertical'} as React.CSSProperties} value={form.observacoes} onChange={f('observacoes')} placeholder="Informações adicionais…"/></FL>
          </>}

          {/* Step 3: Revisão */}
          {step===3&&<>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
              {[
                {l:'Órgão',v:form.orgao||'—'},{l:'Banca',v:form.banca||'—'},
                {l:'Nível',v:form.nivel},{l:'Status',v:SL[form.status]},
                {l:'Vagas',v:form.vagas||'—'},{l:'Remuneração',v:form.remuneracao||'—'},
                {l:'Taxa',v:form.taxa||'—'},{l:'Local',v:form.local||'—'},
                {l:'Prova',v:form.dataProva?fmtDate(form.dataProva):'—'},{l:'Prioridade',v:PL[form.prioridade]},
              ].map(({l,v})=>(
                <div key={l} style={{background:'var(--bg-3)',borderRadius:8,padding:'10px 14px',border:'1px solid var(--border)'}}>
                  <div style={{fontSize:'0.62rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:'var(--font-mono)',marginBottom:3}}>{l}</div>
                  <div style={{fontSize:'0.88rem',fontWeight:600,color:'var(--text-primary)',fontFamily:'var(--font-display)'}}>{v}</div>
                </div>
              ))}
            </div>
            {form.nome&&<div style={{background:'rgba(0,229,255,0.04)',border:'1px solid rgba(0,229,255,0.15)',borderRadius:8,padding:'10px 14px',marginBottom:12}}>
              <div style={{fontSize:'0.68rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginBottom:2}}>NOME</div>
              <div style={{fontFamily:'var(--font-display)',fontWeight:700,color:'var(--text-accent)'}}>{form.nome}</div>
            </div>}
            {/* Provas resumo */}
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
              {[{t:'Objetiva',p:form.provaObj},{t:'Dissertativa',p:form.provaDiss},{t:'Oral',p:form.provaOral}].filter(x=>x.p.ativo).map(({t,p})=>(
                <div key={t} style={{flex:1,minWidth:140,background:'var(--bg-3)',borderRadius:8,padding:'10px 14px',border:'1px solid var(--border)'}}>
                  <div style={{fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.82rem',color:'var(--text-accent)',marginBottom:6}}>{t}</div>
                  {p.questoes>0&&<div style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{p.questoes} questões</div>}
                  {p.disciplinas.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:3,marginTop:6}}>{p.disciplinas.slice(0,3).map(d=><span key={d} style={{fontSize:'0.62rem',padding:'1px 6px',borderRadius:10,background:'rgba(0,229,255,0.08)',color:'var(--text-accent)',border:'1px solid rgba(0,229,255,0.15)'}}>{d}</span>)}{p.disciplinas.length>3&&<span style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>+{p.disciplinas.length-3}</span>}</div>}
                </div>
              ))}
            </div>
            {form.observacoes&&<div style={{fontSize:'0.8rem',color:'var(--text-secondary)',fontStyle:'italic',padding:'8px 12px',background:'var(--bg-3)',borderRadius:8}}>{form.observacoes}</div>}
          </>}
        </div>

        {/* Footer nav */}
        <div style={{padding:'16px 24px',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'space-between',position:'sticky',bottom:0,background:'var(--bg-2)'}}>
          <button onClick={step===0?onClose:()=>setStep(s=>s-1)} style={{padding:'9px 20px',borderRadius:8,border:'1px solid var(--border)',background:'none',color:'var(--text-secondary)',fontFamily:'var(--font-display)',fontWeight:600,cursor:'pointer'}}>
            {step===0?'Cancelar':'← Voltar'}
          </button>
          {step<3
            ?<button onClick={()=>setStep(s=>s+1)} style={{padding:'9px 22px',borderRadius:8,border:'1px solid rgba(0,229,255,0.4)',background:'rgba(0,229,255,0.1)',color:'var(--text-accent)',fontFamily:'var(--font-display)',fontWeight:700,cursor:'pointer'}}>Próximo →</button>
            :<button onClick={()=>onSave({id:(initial as any)?.id??newId(),criadoEm:(initial as any)?.criadoEm??new Date().toISOString(),...form})} style={{padding:'9px 22px',borderRadius:8,border:'1px solid rgba(16,185,129,0.4)',background:'rgba(16,185,129,0.12)',color:'#10b981',fontFamily:'var(--font-display)',fontWeight:800,cursor:'pointer'}}>✓ Salvar Concurso</button>
          }
        </div>
      </div>
    </div>
  )
}

/* ═══ Similaridade ═══════════════════════════════════════════ */
function Similaridade({concursos}:{concursos:Concurso[]}) {
  const [baseId,setBaseId]=useState('')
  const base=concursos.find(c=>c.id===baseId)

  function calcSim(a:Concurso,b:Concurso):number {
    let score=0,total=0
    const discA=new Set([...a.provaObj.disciplinas,...a.provaDiss.disciplinas,...a.provaOral.disciplinas])
    const discB=new Set([...b.provaObj.disciplinas,...b.provaDiss.disciplinas,...b.provaOral.disciplinas])
    if(discA.size>0&&discB.size>0){
      const inter=[...discA].filter(d=>discB.has(d)).length
      const union=new Set([...discA,...discB]).size
      score+=Math.round((inter/union)*40); total+=40
    }
    if(a.banca&&b.banca){score+=a.banca===b.banca?15:0;total+=15}
    if(a.area&&b.area){score+=a.area===b.area?15:0;total+=15}
    if(a.nivel&&b.nivel){score+=a.nivel===b.nivel?10:0;total+=10}
    if(a.orgao&&b.orgao){score+=a.orgao===b.orgao?20:0;total+=20}
    return total>0?Math.round((score/total)*100):0
  }

  const resultados=!base?[]:concursos.filter(c=>c.id!==baseId).map(c=>({
    c,sim:calcSim(base,c),
    discComuns:[...new Set([...base.provaObj.disciplinas,...base.provaDiss.disciplinas,...base.provaOral.disciplinas])].filter(d=>[...c.provaObj.disciplinas,...c.provaDiss.disciplinas,...c.provaOral.disciplinas].includes(d))
  })).sort((a,b)=>b.sim-a.sim)

  const simColor=(s:number)=>s>=70?'#10b981':s>=40?'#f59e0b':'#ef4444'

  return(
    <div>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:'0.68rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8,fontFamily:'var(--font-mono)'}}>Concurso base para análise</div>
        <select style={{...sel,maxWidth:400}} value={baseId} onChange={e=>setBaseId(e.target.value)}>
          <option value="">Selecione um concurso…</option>
          {concursos.map(c=><option key={c.id} value={c.id}>{c.orgao} — {c.nome||'s/n'}</option>)}
        </select>
      </div>
      {!base?(
        <div style={{textAlign:'center',padding:'60px 0',color:'var(--text-muted)'}}>
          <div style={{fontSize:40,marginBottom:12,opacity:.4}}>🔀</div>
          <div style={{fontFamily:'var(--font-display)',fontSize:'0.85rem',letterSpacing:'0.1em',textTransform:'uppercase'}}>Selecione um concurso base para ver a análise comparativa</div>
        </div>
      ):resultados.length===0?(
        <div style={{textAlign:'center',padding:'40px 0',color:'var(--text-muted)',fontSize:'0.82rem'}}>Nenhum outro concurso cadastrado para comparar.</div>
      ):(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:14}}>
          {resultados.map(({c,sim,discComuns})=>(
            <div key={c.id} className="card" style={{padding:'16px 18px',borderLeft:`4px solid ${simColor(sim)}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10,marginBottom:10}}>
                <div>
                  <div style={{fontFamily:'var(--font-display)',fontWeight:800,fontSize:'0.92rem',color:'var(--text-primary)'}}>{c.orgao}</div>
                  <div style={{fontSize:'0.78rem',color:'var(--text-secondary)',marginTop:2}}>{c.nome}</div>
                </div>
                <div style={{textAlign:'center',flexShrink:0}}>
                  <div style={{fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1.6rem',color:simColor(sim),lineHeight:1}}>{sim}%</div>
                  <div style={{fontSize:'0.62rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em'}}>similar</div>
                </div>
              </div>
              <div style={{height:4,background:'var(--bg-4)',borderRadius:2,marginBottom:10,overflow:'hidden'}}>
                <div style={{width:`${sim}%`,height:4,background:simColor(sim),borderRadius:2,transition:'width 0.5s'}}/>
              </div>
              <div style={{display:'flex',gap:10,fontSize:'0.72rem',marginBottom:8,flexWrap:'wrap'}}>
                {c.banca===base.banca&&<span style={{padding:'2px 8px',borderRadius:12,background:'rgba(0,229,255,0.08)',color:'var(--text-accent)',border:'1px solid rgba(0,229,255,0.2)'}}>✓ Mesma banca</span>}
                {c.area===base.area&&<span style={{padding:'2px 8px',borderRadius:12,background:'rgba(124,58,237,0.08)',color:'#a78bfa',border:'1px solid rgba(124,58,237,0.2)'}}>✓ Mesma área</span>}
                {c.nivel===base.nivel&&<span style={{padding:'2px 8px',borderRadius:12,background:'rgba(16,185,129,0.08)',color:'#10b981',border:'1px solid rgba(16,185,129,0.2)'}}>✓ Mesmo nível</span>}
              </div>
              {discComuns.length>0&&<div>
                <div style={{fontSize:'0.65rem',color:'var(--text-muted)',marginBottom:4,fontFamily:'var(--font-mono)'}}>DISCIPLINAS EM COMUM ({discComuns.length})</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:4}}>{discComuns.slice(0,5).map(d=><span key={d} style={{fontSize:'0.65rem',padding:'2px 7px',borderRadius:10,background:'var(--bg-4)',color:'var(--text-muted)',border:'1px solid var(--border)'}}>{d}</span>)}{discComuns.length>5&&<span style={{fontSize:'0.65rem',color:'var(--text-muted)'}}>+{discComuns.length-5}</span>}</div>
              </div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══ Card Concurso ══════════════════════════════════════════ */
function CardConcurso({c,onEdit,onDelete}:{c:Concurso;onEdit:()=>void;onDelete:()=>void}) {
  const cor=SC[c.status]; const d=daysUntil(c.dataProva)
  const allDiscs=[...c.provaObj.disciplinas,...c.provaDiss.disciplinas,...c.provaOral.disciplinas].filter((v,i,a)=>a.indexOf(v)===i)
  return(
    <div className="card" style={{borderLeft:`4px solid ${cor}`,padding:'16px 18px',transition:'all 0.18s'}}
      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';(e.currentTarget as HTMLElement).style.boxShadow='0 8px 24px rgba(0,0,0,0.2)'}}
      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='none';(e.currentTarget as HTMLElement).style.boxShadow=''}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10,marginBottom:8}}>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3,flexWrap:'wrap'}}>
            <span style={{fontFamily:'var(--font-display)',fontWeight:800,fontSize:'0.95rem',color:'var(--text-primary)'}}>{c.orgao}</span>
            <span style={{fontSize:'0.65rem',fontWeight:700,padding:'2px 8px',borderRadius:20,background:`${cor}22`,color:cor,border:`1px solid ${cor}44`}}>{SL[c.status]}</span>
            <span style={{fontSize:'0.65rem',color:'var(--text-muted)'}}>{PL[c.prioridade]}</span>
          </div>
          {c.nome&&<div style={{fontSize:'0.78rem',color:'var(--text-secondary)',marginBottom:4}}>{c.nome}</div>}
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            {c.banca&&<span style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>🏛 {c.banca}</span>}
            {c.vagas>0&&<span style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>👤 {c.vagas} vagas</span>}
            {c.remuneracao&&<span style={{fontSize:'0.72rem',color:'#10b981'}}>💰 {c.remuneracao}</span>}
          </div>
        </div>
        <div style={{display:'flex',gap:5,flexShrink:0}}>
          <button onClick={e=>{e.stopPropagation();onEdit()}} style={{background:'rgba(0,229,255,0.07)',border:'1px solid var(--border)',borderRadius:7,padding:'5px 10px',color:'var(--text-accent)',cursor:'pointer',fontSize:'0.75rem',fontFamily:'var(--font-display)',fontWeight:600}}>Editar</button>
          <button onClick={e=>{e.stopPropagation();onDelete()}} style={{background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:7,padding:'5px 10px',color:'#f87171',cursor:'pointer',fontSize:'0.75rem'}}>✕</button>
        </div>
      </div>
      <div style={{display:'flex',gap:12,marginTop:8,flexWrap:'wrap'}}>
        {c.dataProva&&<div style={{fontSize:'0.72rem'}}><span style={{color:'var(--text-muted)'}}>📅 Prova: </span><span style={{color:d!==null&&d<=30?'#f59e0b':'var(--text-secondary)'}}>{fmtDate(c.dataProva)}{d!==null&&d>=0?` (${d}d)`:d!==null?' (passou)':''}</span></div>}
        {c.dataInscricaoFim&&<div style={{fontSize:'0.72rem'}}><span style={{color:'var(--text-muted)'}}>📝 Inscrições até: </span><span style={{color:(daysUntil(c.dataInscricaoFim)??99)<=7?'#ef4444':'var(--text-secondary)'}}>{fmtDate(c.dataInscricaoFim)}</span></div>}
        {c.linkEdital&&<a href={c.linkEdital} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{fontSize:'0.72rem',color:'var(--text-accent)'}}>↗ Edital</a>}
      </div>
      {allDiscs.length>0&&<div style={{marginTop:8,display:'flex',flexWrap:'wrap',gap:4}}>{allDiscs.slice(0,5).map(d=><span key={d} style={{fontSize:'0.62rem',padding:'2px 6px',borderRadius:10,background:'var(--bg-4)',color:'var(--text-muted)',border:'1px solid var(--border)'}}>{d}</span>)}{allDiscs.length>5&&<span style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>+{allDiscs.length-5}</span>}</div>}
    </div>
  )
}

/* ═══ Main ═══════════════════════════════════════════════════ */
type Tab='previstos'|'realizados'|'similaridade'

export default function Concursos() {
  const [tab,setTab]=useState<Tab>('previstos')
  const [concursos,setConcursos]=useState<Concurso[]>([])
  const [realizados,setRealizados]=useState<Realizado[]>([])
  const [filtro,setFiltro]=useState('todos')
  const [busca,setBusca]=useState('')
  const [wizard,setWizard]=useState(false)
  const [editing,setEditing]=useState<Concurso|null>(null)
  const [loading,setLoading]=useState(true)
  const uid=auth?.currentUser?.uid

  useEffect(()=>{
    if(!uid||!db){setLoading(false);return}
    const u1=onSnapshot(query(collection(db,`users/${uid}/concursos`),orderBy('criadoEm','desc')),snap=>{setConcursos(snap.docs.map(d=>d.data() as Concurso));setLoading(false)})
    const u2=onSnapshot(query(collection(db,`users/${uid}/realizados`),orderBy('criadoEm','desc')),snap=>setRealizados(snap.docs.map(d=>d.data() as Realizado)))
    return()=>{u1();u2()}
  },[uid])

  const saveConcurso=useCallback(async(c:Concurso)=>{
    if(uid&&db)await setDoc(doc(db,`users/${uid}/concursos`,c.id),c)
    else setConcursos(p=>[c,...p.filter(x=>x.id!==c.id)])
    setWizard(false);setEditing(null)
  },[uid])

  const delConcurso=useCallback(async(id:string)=>{
    if(!confirm('Remover este concurso?'))return
    if(uid&&db)await deleteDoc(doc(db,`users/${uid}/concursos`,id))
    else setConcursos(p=>p.filter(x=>x.id!==id))
  },[uid])

  const concs=concursos.filter(c=>{
    const mf=filtro==='todos'||c.status===filtro
    const mb=!busca||[c.orgao,c.nome,c.banca].some(s=>s?.toLowerCase().includes(busca.toLowerCase()))
    return mf&&mb
  })

  const tabS=(t:Tab):React.CSSProperties=>({padding:'10px 22px',border:'none',background:'none',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.88rem',cursor:'pointer',letterSpacing:'0.04em',color:tab===t?'var(--text-accent)':'var(--text-muted)',borderBottom:tab===t?'2px solid var(--text-accent)':'2px solid transparent',transition:'all 0.18s'})

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'var(--bg-0)'}}>
      {/* Header */}
      <div style={{padding:'18px 24px 0',background:'var(--bg-1)',borderBottom:'1px solid var(--border)',flexShrink:0}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14,flexWrap:'wrap',gap:12}}>
          <div>
            <div style={{fontFamily:'var(--font-display)',fontSize:'1rem',fontWeight:800,color:'var(--text-accent)',letterSpacing:'0.1em'}}>CONCURSOS PÚBLICOS</div>
            <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:2}}>Acompanhamento, cadastro e análise comparativa</div>
          </div>
          <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
            {[{l:'Cadastrados',v:concursos.length,c:'var(--text-accent)'},{l:'Inscrições Abertas',v:concursos.filter(c=>c.status==='inscricoes').length,c:'#10b981'},{l:'Provas em 60d',v:concursos.filter(c=>{const d=daysUntil(c.dataProva);return d!==null&&d>=0&&d<=60}).length,c:'#f59e0b'},{l:'Realizados',v:realizados.length,c:'#7c3aed'}].map(k=>(
              <div key={k.l} style={{textAlign:'center'}}>
                <div style={{fontFamily:'var(--font-display)',fontSize:'1.4rem',fontWeight:800,color:k.c,lineHeight:1}}>{k.v}</div>
                <div style={{fontSize:'0.62rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginTop:2}}>{k.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{display:'flex'}}>
          <button style={tabS('previstos')} onClick={()=>{setTab('previstos');setFiltro('todos')}}>📋 Previstos</button>
          <button style={tabS('realizados')} onClick={()=>{setTab('realizados');setFiltro('todos')}}>✅ Realizados</button>
          <button style={tabS('similaridade')} onClick={()=>setTab('similaridade')}>🔀 Similaridade</button>
        </div>
      </div>

      {/* Toolbar */}
      {tab!=='similaridade'&&(
        <div style={{padding:'10px 24px',background:'var(--bg-1)',borderBottom:'1px solid var(--border)',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',flexShrink:0}}>
          <input placeholder="🔍 Pesquisar…" value={busca} onChange={e=>setBusca(e.target.value)} style={{...inp,width:200,padding:'7px 12px'}}/>
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {(tab==='previstos'?['todos','previsto','edital','inscricoes','provas','resultado','encerrado']:['todos','aprovado','classificado','aguardando','reprovado','desistiu']).map(f=>(
              <button key={f} onClick={()=>setFiltro(f)} style={{padding:'5px 12px',borderRadius:20,border:`1px solid ${filtro===f?'var(--border-md)':'var(--border)'}`,background:filtro===f?'rgba(0,229,255,0.1)':'none',color:filtro===f?'var(--text-accent)':'var(--text-muted)',fontFamily:'var(--font-display)',fontWeight:600,fontSize:'0.72rem',cursor:'pointer',transition:'all 0.15s'}}>
                {f==='todos'?'Todos':tab==='previstos'?SL[f as StatusPrev]:RL[f as StatusReal]}
              </button>
            ))}
          </div>
          <div style={{marginLeft:'auto'}}>
            <button onClick={()=>{setEditing(null);setWizard(true)}} style={{padding:'8px 18px',borderRadius:8,border:'1px solid rgba(0,229,255,0.4)',background:'rgba(0,229,255,0.1)',color:'var(--text-accent)',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.85rem',cursor:'pointer'}}>+ Novo Concurso</button>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{flex:1,overflowY:'auto',padding:24}}>
        {loading?<div style={{textAlign:'center',padding:48,color:'var(--text-muted)'}}>Carregando…</div>
        :tab==='similaridade'?<Similaridade concursos={concursos}/>
        :tab==='previstos'?(
          concs.length===0?<div style={{textAlign:'center',padding:'60px 0',color:'var(--text-muted)'}}>
            <div style={{fontSize:40,marginBottom:12}}>📋</div>
            <div style={{fontFamily:'var(--font-display)',fontSize:'0.85rem',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:8}}>Nenhum concurso encontrado</div>
            <button onClick={()=>{setEditing(null);setWizard(true)}} style={{padding:'9px 20px',borderRadius:8,border:'1px solid rgba(0,229,255,0.4)',background:'rgba(0,229,255,0.1)',color:'var(--text-accent)',fontFamily:'var(--font-display)',fontWeight:700,cursor:'pointer'}}>+ Cadastrar primeiro concurso</button>
          </div>:
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(460px,1fr))',gap:14}}>
            {concs.map(c=><CardConcurso key={c.id} c={c} onEdit={()=>{setEditing(c);setWizard(true)}} onDelete={()=>delConcurso(c.id)}/>)}
          </div>
        ):(
          realizados.length===0?<div style={{textAlign:'center',padding:'60px 0',color:'var(--text-muted)'}}>
            <div style={{fontSize:40,marginBottom:12}}>🎓</div>
            <div style={{fontFamily:'var(--font-display)',fontSize:'0.85rem',letterSpacing:'0.1em',textTransform:'uppercase'}}>Nenhum concurso realizado registrado</div>
          </div>:
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(400px,1fr))',gap:14}}>
            {realizados.map(r=>(
              <div key={r.id} className="card" style={{borderLeft:`4px solid ${RC[r.status]}`,padding:'16px 18px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10}}>
                  <div>
                    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:4}}>
                      <span style={{fontFamily:'var(--font-display)',fontWeight:800,fontSize:'0.92rem',color:'var(--text-primary)'}}>{r.orgao}</span>
                      <span style={{fontSize:'0.65rem',padding:'2px 8px',borderRadius:20,background:`${RC[r.status]}22`,color:RC[r.status],border:`1px solid ${RC[r.status]}44`,fontWeight:700}}>{RL[r.status]}</span>
                    </div>
                    <div style={{fontSize:'0.8rem',color:'var(--text-secondary)',marginBottom:6}}>{r.cargo} · {r.ano}</div>
                    <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
                      {r.notaObj!==null&&<span style={{fontSize:'0.75rem',color:'var(--text-secondary)'}}>Obj: <strong>{r.notaObj}</strong></span>}
                      {r.notaDiss!==null&&<span style={{fontSize:'0.75rem',color:'var(--text-secondary)'}}>Diss: <strong>{r.notaDiss}</strong></span>}
                      {r.notaTotal!==null&&<span style={{fontSize:'0.75rem',color:'var(--text-accent)'}}>Total: <strong>{r.notaTotal}</strong></span>}
                      {r.classificacao!==null&&<span style={{fontSize:'0.75rem',color:'var(--text-secondary)'}}>🏆 {r.classificacao}º{r.totalCandidatos?` / ${r.totalCandidatos}`:''}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {wizard&&<WizardConcurso initial={editing??undefined} onSave={saveConcurso} onClose={()=>{setWizard(false);setEditing(null)}}/>}
    </div>
  )
}
