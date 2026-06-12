import { useEffect, useState, useMemo } from 'react'
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Nota {
  id: string
  titulo: string
  conteudo: string
  tags: string[]
  cor: string
  fixada: boolean
  criadoEm: number
  data: string // YYYY-MM-DD
}

function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6) }
function todayISO() { return new Date().toISOString().slice(0,10) }
function fmtDataCurta(d: string) {
  const dt = new Date(d + 'T12:00:00')
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const CORES = [
  { id: 'default', bg: 'var(--card-bg, #2C2C2E)', border: 'rgba(255,255,255,0.08)', label: 'Padrão' },
  { id: 'azul',    bg: 'rgba(26,115,232,0.08)',   border: 'rgba(26,115,232,0.28)',  label: 'Azul' },
  { id: 'verde',   bg: 'rgba(16,185,129,0.08)',   border: 'rgba(16,185,129,0.28)',  label: 'Verde' },
  { id: 'roxo',    bg: 'rgba(139,92,246,0.08)',   border: 'rgba(139,92,246,0.28)',  label: 'Roxo' },
  { id: 'amarelo', bg: 'rgba(245,158,11,0.08)',   border: 'rgba(245,158,11,0.28)',  label: 'Âmbar' },
  { id: 'vermelho',bg: 'rgba(239,68,68,0.08)',    border: 'rgba(239,68,68,0.28)',   label: 'Rosa' },
]
function getCor(id: string) { return CORES.find(c=>c.id===id)||CORES[0] }

// ─── Modal de criação/edição ───────────────────────────────────────────────────
function ModalNota({ nota, onClose, onSave }: { nota: Nota|null; onClose:()=>void; onSave:(n:Nota)=>void }) {
  const isEdit = !!nota
  const [titulo, setTitulo] = useState(nota?.titulo||'')
  const [conteudo, setConteudo] = useState(nota?.conteudo||'')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(nota?.tags||[])
  const [cor, setCor] = useState(nota?.cor||'default')
  const [fixada, setFixada] = useState(nota?.fixada||false)
  const [data, setData] = useState(nota?.data||todayISO())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const h = (e:KeyboardEvent) => { if(e.key==='Escape') onClose() }
    document.addEventListener('keydown',h)
    return ()=>document.removeEventListener('keydown',h)
  },[onClose])

  const addTag = () => {
    const t = tagInput.trim().toLowerCase()
    if(t && !tags.includes(t)) setTags(p=>[...p,t])
    setTagInput('')
  }

  const save = async () => {
    if(!conteudo.trim()) return
    setSaving(true)
    const n: Nota = {
      id: nota?.id || newId(),
      titulo: titulo.trim(),
      conteudo: conteudo.trim(),
      tags, cor, fixada, data,
      criadoEm: nota?.criadoEm || Date.now(),
    }
    await onSave(n)
    setSaving(false)
    onClose()
  }

  const IS: React.CSSProperties = {
    background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',
    borderRadius:8,padding:'9px 12px',color:'var(--text-primary)',
    fontSize:'0.85rem',width:'100%',outline:'none',boxSizing:'border-box',
    fontFamily:'var(--font-body)',
  }

  return (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose()}}
      style={{ position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,0.78)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
      <div style={{ background:'var(--bg-2)',border:`1px solid ${getCor(cor).border}`,borderRadius:20,width:'100%',maxWidth:620,maxHeight:'94vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 32px 80px rgba(0,0,0,0.65)' }}>
        {/* Header */}
        <div style={{ padding:'18px 22px',borderBottom:'1px solid rgba(255,255,255,0.08)',flexShrink:0,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <div style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1rem',color:'var(--text-primary)' }}>
            {isEdit?'✏ Editar Nota':'✦ Nova Nota'}
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--text-muted)',fontSize:'1.3rem',cursor:'pointer',lineHeight:1 }}>✕</button>
        </div>
        {/* Body */}
        <div style={{ flex:1,overflowY:'auto',padding:'18px 22px',display:'flex',flexDirection:'column',gap:14 }}>
          {/* Título */}
          <div>
            <label style={{ fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',display:'block',marginBottom:5 }}>Título (opcional)</label>
            <input style={IS} value={titulo} onChange={e=>setTitulo(e.target.value)} placeholder="Título da nota…" />
          </div>
          {/* Conteúdo */}
          <div>
            <label style={{ fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',display:'block',marginBottom:5 }}>Nota *</label>
            <textarea style={{ ...IS, minHeight:180, resize:'vertical', lineHeight:1.65 }}
              value={conteudo} onChange={e=>setConteudo(e.target.value)} placeholder="Escreva aqui sua nota…" autoFocus />
          </div>
          {/* Data + Pin */}
          <div style={{ display:'grid',gridTemplateColumns:'1fr auto',gap:10,alignItems:'end' }}>
            <div>
              <label style={{ fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',display:'block',marginBottom:5 }}>Data</label>
              <input type="date" style={IS} value={data} onChange={e=>setData(e.target.value)} />
            </div>
            <button onClick={()=>setFixada(p=>!p)}
              style={{ padding:'9px 16px',borderRadius:8,border:`1px solid ${fixada?'rgba(245,158,11,0.4)':'rgba(255,255,255,0.1)'}`,background:fixada?'rgba(245,158,11,0.12)':'rgba(255,255,255,0.04)',color:fixada?'#f59e0b':'var(--text-muted)',fontWeight:700,fontSize:'0.78rem',cursor:'pointer',whiteSpace:'nowrap' }}>
              {fixada?'📌 Fixada':'📌 Fixar'}
            </button>
          </div>
          {/* Cor */}
          <div>
            <label style={{ fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',display:'block',marginBottom:8 }}>Cor do Card</label>
            <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
              {CORES.map(c=>(
                <button key={c.id} onClick={()=>setCor(c.id)}
                  style={{ width:28,height:28,borderRadius:'50%',background:c.bg,border:`2px solid ${cor===c.id?c.border.replace('0.28','0.9'):'transparent'}`,cursor:'pointer',transition:'all 0.15s' }}
                  title={c.label} />
              ))}
            </div>
          </div>
          {/* Tags */}
          <div>
            <label style={{ fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',display:'block',marginBottom:8 }}>Tags</label>
            <div style={{ display:'flex',gap:8,flexWrap:'wrap',marginBottom:8 }}>
              {tags.map(t=>(
                <span key={t} style={{ padding:'3px 10px',borderRadius:20,background:'rgba(138,180,248,0.12)',border:'1px solid rgba(138,180,248,0.3)',color:'#8ab4f8',fontSize:'0.72rem',display:'inline-flex',alignItems:'center',gap:5 }}>
                  #{t}
                  <button onClick={()=>setTags(p=>p.filter(x=>x!==t))} style={{ background:'none',border:'none',color:'rgba(138,180,248,0.5)',cursor:'pointer',fontSize:'0.75rem',padding:0,lineHeight:1 }}>✕</button>
                </span>
              ))}
            </div>
            <div style={{ display:'flex',gap:8 }}>
              <input style={{ ...IS, flex:1 }} value={tagInput} onChange={e=>setTagInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTag()}}}
                placeholder="Adicionar tag (Enter)" />
              <button onClick={addTag} style={{ padding:'8px 14px',borderRadius:8,border:'1px solid rgba(138,180,248,0.3)',background:'rgba(138,180,248,0.08)',color:'#8ab4f8',fontWeight:700,fontSize:'0.78rem',cursor:'pointer',whiteSpace:'nowrap' }}>+ Tag</button>
            </div>
          </div>
        </div>
        {/* Footer */}
        <div style={{ padding:'14px 22px',borderTop:'1px solid rgba(255,255,255,0.08)',display:'flex',justifyContent:'flex-end',gap:10,flexShrink:0 }}>
          <button onClick={onClose} style={{ padding:'8px 18px',borderRadius:9,border:'1px solid rgba(255,255,255,0.12)',background:'none',color:'var(--text-secondary)',fontSize:'0.82rem',cursor:'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={saving||!conteudo.trim()}
            style={{ padding:'8px 24px',borderRadius:9,background:saving||!conteudo.trim()?'rgba(138,180,248,0.2)':'linear-gradient(135deg,#1A73E8,#8B5CF6)',border:'none',color:'#fff',fontWeight:700,fontSize:'0.82rem',cursor:saving||!conteudo.trim()?'not-allowed':'pointer' }}>
            {saving?'Salvando…':isEdit?'Salvar':'Criar Nota'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Card de nota ──────────────────────────────────────────────────────────────
function CardNota({ nota, onEdit, onDelete, onTogglePin }: { nota:Nota; onEdit:()=>void; onDelete:()=>void; onTogglePin:()=>void }) {
  const cor = getCor(nota.cor)
  const [expanded, setExpanded] = useState(false)
  const linhas = nota.conteudo.split('\n')
  const preview = linhas.slice(0,4).join('\n')
  const hasMore = linhas.length > 4 || nota.conteudo.length > 280

  return (
    <div style={{ background:cor.bg,border:`1px solid ${cor.border}`,borderRadius:16,padding:'18px',display:'flex',flexDirection:'column',gap:10,transition:'box-shadow 0.18s',position:'relative' }}
      onMouseEnter={e=>(e.currentTarget as HTMLElement).style.boxShadow='0 4px 20px rgba(0,0,0,0.2)'}
      onMouseLeave={e=>(e.currentTarget as HTMLElement).style.boxShadow='none'}>
      {/* Pin badge */}
      {nota.fixada && (
        <div style={{ position:'absolute',top:12,right:14,fontSize:'0.7rem' }}>📌</div>
      )}
      {/* Data em destaque */}
      <div style={{ display:'flex',alignItems:'center',gap:6 }}>
        <span style={{ fontSize:'0.62rem',fontWeight:800,color:'var(--text-accent)',fontFamily:'var(--font-mono)',letterSpacing:'0.08em',background:'var(--accent-bg)',padding:'2px 8px',borderRadius:20 }}>
          {fmtDataCurta(nota.data)}
        </span>
        <span style={{ fontSize:'0.6rem',color:'var(--text-subtle)',fontFamily:'var(--font-mono)' }}>
          {new Date(nota.criadoEm).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
        </span>
      </div>
      {/* Título */}
      {nota.titulo && (
        <div style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1rem',color:'var(--text-primary)',lineHeight:1.3,paddingRight:20 }}>
          {nota.titulo}
        </div>
      )}
      {/* Conteúdo */}
      <div style={{ fontSize:'0.85rem',color:'var(--text-secondary)',lineHeight:1.7,whiteSpace:'pre-wrap',wordBreak:'break-word' }}>
        {expanded ? nota.conteudo : preview}
        {hasMore && !expanded && <span style={{ color:'var(--text-muted)' }}>…</span>}
      </div>
      {hasMore && (
        <button onClick={()=>setExpanded(p=>!p)}
          style={{ background:'none',border:'none',color:'var(--text-accent)',fontSize:'0.72rem',fontWeight:700,cursor:'pointer',padding:0,textAlign:'left' }}>
          {expanded?'▲ Recolher':'▼ Ver mais'}
        </button>
      )}
      {/* Tags */}
      {nota.tags.length > 0 && (
        <div style={{ display:'flex',flexWrap:'wrap',gap:5 }}>
          {nota.tags.map(t=>(
            <span key={t} style={{ fontSize:'0.65rem',padding:'2px 8px',borderRadius:20,background:'rgba(138,180,248,0.1)',border:'1px solid rgba(138,180,248,0.2)',color:'#8ab4f8' }}>#{t}</span>
          ))}
        </div>
      )}
      {/* Ações */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6,paddingTop:6,borderTop:'1px solid rgba(255,255,255,0.06)',marginTop:'auto' }}>
        <button onClick={onTogglePin}
          title={nota.fixada?'Desafixar':'Fixar'}
          style={{ padding:'4px 8px',borderRadius:6,border:'1px solid rgba(255,255,255,0.08)',background:'none',color:nota.fixada?'#f59e0b':'var(--text-muted)',fontSize:'0.7rem',cursor:'pointer' }}>
          📌
        </button>
        <button onClick={onEdit}
          style={{ padding:'4px 12px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontSize:'0.72rem',fontWeight:600,cursor:'pointer' }}>
          ✏ Editar
        </button>
        <button onClick={onDelete}
          style={{ padding:'4px 10px',borderRadius:6,border:'1px solid rgba(239,68,68,0.2)',background:'rgba(239,68,68,0.05)',color:'#f87171',fontSize:'0.72rem',cursor:'pointer' }}>
          ✕
        </button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Diario({ onNavigate: _onNavigate }: { onNavigate?: (id:string)=>void }) {
  const uid = useUid()
  const [notas, setNotas] = useState<Nota[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Nota|null>(null)
  const [busca, setBusca] = useState('')

  // Filtros de data
  const [filtroTipo, setFiltroTipo] = useState<'todas'|'dia'|'mes'|'ano'>('todas')
  const [filtroDia, setFiltroDia] = useState('')
  const [filtroMes, setFiltroMes] = useState('')
  const [filtroAno, setFiltroAno] = useState('')

  useEffect(()=>{
    if(!uid) return
    return onSnapshot(collection(db,'users',uid,'notas'), snap=>{
      const list = snap.docs.map(d=>({id:d.id,...d.data()} as Nota)).sort((a,b)=>{
        if(a.fixada!==b.fixada) return a.fixada?-1:1
        return b.criadoEm-a.criadoEm
      })
      setNotas(list); setLoading(false)
    })
  },[uid])

  const save = async (n: Nota) => {
    if(!uid) return
    await setDoc(doc(db,'users',uid,'notas',n.id), n)
  }

  const del = async (id: string) => {
    if(!uid||!window.confirm('Excluir esta nota?')) return
    await deleteDoc(doc(db,'users',uid,'notas',id))
  }

  const togglePin = async (nota: Nota) => {
    const upd = { ...nota, fixada: !nota.fixada }
    await save(upd)
  }

  const filtradas = useMemo(()=>{
    return notas.filter(n=>{
      if(busca) {
        const q = busca.toLowerCase()
        const hit = n.titulo.toLowerCase().includes(q)
          || n.conteudo.toLowerCase().includes(q)
          || n.tags.some(t=>t.includes(q))
        if(!hit) return false
      }
      if(filtroTipo==='dia'&&filtroDia&&n.data!==filtroDia) return false
      if(filtroTipo==='mes'&&filtroMes&&!n.data.startsWith(filtroMes)) return false
      if(filtroTipo==='ano'&&filtroAno&&!n.data.startsWith(filtroAno)) return false
      return true
    })
  },[notas,busca,filtroTipo,filtroDia,filtroMes,filtroAno])

  const IS: React.CSSProperties = {
    background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.09)',
    borderRadius:9,padding:'9px 14px',color:'var(--text-primary)',
    fontSize:'0.85rem',outline:'none',boxSizing:'border-box' as const,
    fontFamily:'var(--font-body)',
  }

  if(loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'60vh' }}>
      <div style={{ width:36,height:36,borderRadius:'50%',border:'2px solid transparent',borderTopColor:'var(--accent)',animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ padding:'20px 24px',display:'flex',flexDirection:'column',gap:18,minHeight:'100%',boxSizing:'border-box' }}>
      {/* Header */}
      <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:10 }}>
        <div>
          <h1 style={{ margin:0,fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1.4rem',color:'var(--text-primary)',letterSpacing:'-0.01em' }}>✦ Notas</h1>
          <p style={{ margin:'3px 0 0',fontSize:'0.75rem',color:'var(--text-muted)' }}>{notas.length} nota(s) · {notas.filter(n=>n.fixada).length} fixada(s)</p>
        </div>
        <button onClick={()=>{setEditando(null);setModal(true)}}
          style={{ padding:'9px 20px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#1A73E8,#8B5CF6)',color:'#fff',fontWeight:700,fontSize:'0.84rem',cursor:'pointer',boxShadow:'0 4px 14px rgba(26,115,232,0.3)' }}>
          + Nova Nota
        </button>
      </div>

      {/* Barra de pesquisa */}
      <div style={{ position:'relative' }}>
        <span style={{ position:'absolute',left:13,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)',fontSize:'0.9rem',pointerEvents:'none' }}>🔍</span>
        <input value={busca} onChange={e=>setBusca(e.target.value)}
          placeholder="Pesquisar em títulos, conteúdo e tags…"
          style={{ ...IS, width:'100%', paddingLeft:38, fontSize:'0.88rem' }} />
        {busca && (
          <button onClick={()=>setBusca('')}
            style={{ position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--text-muted)',fontSize:'1rem',cursor:'pointer' }}>✕</button>
        )}
      </div>

      {/* Filtro por data */}
      <div style={{ display:'flex',flexWrap:'wrap',gap:8,alignItems:'center',padding:'10px 14px',background:'rgba(138,180,248,0.05)',border:'1px solid rgba(138,180,248,0.15)',borderRadius:10 }}>
        <span style={{ fontSize:'0.62rem',fontWeight:800,color:'var(--text-accent)',textTransform:'uppercase',letterSpacing:'0.1em',fontFamily:'var(--font-mono)',whiteSpace:'nowrap' }}>📅 Por data:</span>
        {(['todas','dia','mes','ano'] as const).map(t=>(
          <button key={t} onClick={()=>setFiltroTipo(t)}
            style={{ padding:'4px 12px',borderRadius:7,border:`1px solid ${filtroTipo===t?'rgba(138,180,248,0.5)':'rgba(255,255,255,0.08)'}`,background:filtroTipo===t?'rgba(138,180,248,0.15)':'rgba(255,255,255,0.03)',color:filtroTipo===t?'var(--text-accent)':'var(--text-muted)',fontSize:'0.72rem',fontWeight:700,cursor:'pointer' }}>
            {t==='todas'?'Todas':t==='dia'?'Dia':t==='mes'?'Mês':'Ano'}
          </button>
        ))}
        {filtroTipo==='dia' && <input type="date" value={filtroDia} onChange={e=>setFiltroDia(e.target.value)} style={{ ...IS, width:'auto', padding:'4px 10px', fontSize:'0.8rem' }} />}
        {filtroTipo==='mes' && <input type="month" value={filtroMes} onChange={e=>setFiltroMes(e.target.value)} style={{ ...IS, width:'auto', padding:'4px 10px', fontSize:'0.8rem' }} />}
        {filtroTipo==='ano' && <input type="number" min="2020" max="2040" placeholder="2025" value={filtroAno} onChange={e=>setFiltroAno(e.target.value)} style={{ ...IS, width:90, padding:'4px 10px', fontSize:'0.8rem' }} />}
        {filtroTipo!=='todas' && (
          <button onClick={()=>{setFiltroTipo('todas');setFiltroDia('');setFiltroMes('');setFiltroAno('')}}
            style={{ padding:'4px 8px',borderRadius:6,border:'1px solid rgba(239,68,68,0.3)',background:'rgba(239,68,68,0.07)',color:'#f87171',fontSize:'0.68rem',cursor:'pointer',fontWeight:700 }}>✕ Limpar</button>
        )}
        <span style={{ marginLeft:'auto',fontSize:'0.68rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)' }}>{filtradas.length} de {notas.length}</span>
      </div>

      {/* Grid de notas */}
      {filtradas.length === 0 ? (
        <div style={{ textAlign:'center',padding:'80px 0',color:'var(--text-muted)' }}>
          <div style={{ fontSize:'2.8rem',marginBottom:12 }}>✦</div>
          <p style={{ margin:0,fontSize:'0.9rem',fontWeight:600,color:'var(--text-secondary)' }}>
            {busca||filtroTipo!=='todas'?'Nenhuma nota encontrada':'Nenhuma nota ainda'}
          </p>
          {!busca && filtroTipo==='todas' && (
            <p style={{ margin:'8px 0 0',fontSize:'0.78rem' }}>Clique em <strong>+ Nova Nota</strong> para começar</p>
          )}
        </div>
      ) : (
        <div style={{ columns:'320px',columnGap:14 }}>
          {filtradas.map(n=>(
            <div key={n.id} style={{ breakInside:'avoid',marginBottom:14,display:'inline-block',width:'100%' }}>
              <CardNota nota={n}
                onEdit={()=>{setEditando(n);setModal(true)}}
                onDelete={()=>del(n.id)}
                onTogglePin={()=>togglePin(n)} />
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && <ModalNota nota={editando} onClose={()=>{setModal(false);setEditando(null)}} onSave={save} />}
    </div>
  )
}

// ─── Export do widget para o Dashboard ────────────────────────────────────────
export function NotasWidget({ onNavigate }: { onNavigate:(id:string)=>void }) {
  const uid = useUid()
  const [notas, setNotas] = useState<Nota[]>([])

  useEffect(()=>{
    if(!uid) return
    return onSnapshot(collection(db,'users',uid,'notas'), snap=>{
      const list = snap.docs.map(d=>({id:d.id,...d.data()} as Nota)).sort((a,b)=>b.criadoEm-a.criadoEm)
      setNotas(list)
    })
  },[uid])

  const recentes = notas.slice(0,3)

  return (
    <div style={{ height:'100%',display:'flex',flexDirection:'column',gap:10 }}>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
        <div style={{ fontSize:'0.68rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',fontFamily:'var(--font-mono)' }}>✦ Notas</div>
        <span style={{ fontSize:'0.65rem',color:'var(--text-muted)' }}>{notas.length} nota(s)</span>
      </div>
      {recentes.length===0 ? (
        <div style={{ flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)',fontSize:'0.78rem' }}>Sem notas ainda</div>
      ) : (
        <div style={{ flex:1,display:'flex',flexDirection:'column',gap:7,overflowY:'auto' }}>
          {recentes.map(n=>{
            const cor = getCor(n.cor)
            return (
              <div key={n.id} style={{ padding:'8px 10px',borderRadius:10,background:cor.bg,border:`1px solid ${cor.border}` }}>
                {n.titulo && <div style={{ fontSize:'0.72rem',fontWeight:700,color:'var(--text-primary)',marginBottom:2 }}>{n.titulo}</div>}
                <div style={{ fontSize:'0.7rem',color:'var(--text-secondary)',lineHeight:1.5,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden' }}>{n.conteudo}</div>
                <div style={{ fontSize:'0.6rem',color:'var(--text-muted)',marginTop:4,fontFamily:'var(--font-mono)' }}>{fmtDataCurta(n.data)}</div>
              </div>
            )
          })}
        </div>
      )}
      <button onClick={()=>onNavigate('journal')}
        style={{ width:'100%',padding:'7px',borderRadius:8,border:'1px solid rgba(138,180,248,0.3)',background:'rgba(138,180,248,0.07)',color:'var(--text-accent)',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.72rem',cursor:'pointer' }}>
        Ver Notas →
      </button>
    </div>
  )
}
