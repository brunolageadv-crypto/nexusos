import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'

// ─── Types ────────────────────────────────────────────────────────────────────

// Remove undefined antes de salvar no Firestore

type Prioridade = 'baixa' | 'media' | 'alta' | 'urgente'
type Status = 'aberta' | 'em_andamento' | 'aguardando' | 'concluida' | 'cancelada'

interface Encaminhamento {
  id: string; de: string; para: string; data: string; observacao?: string
}
interface Movimentacao {
  id: string; data: string; descricao: string
}
interface Demanda {
  id: string; numeroDemanda?: string; processoSEI?: string; titulo: string
  descricao: string; dataAbertura: string; prazo: string; solicitante: string
  unidadeDemandante: string; categoria: string; prioridade: Prioridade
  status: Status; encaminhamentos: Encaminhamento[]; movimentacoes: Movimentacao[]
  criadoEm: number
}

const CATEGORIAS = ['Contratação','Licitação','Assessoria Jurídica','Parecer','Recurso Administrativo','Auditoria','Pessoal / RH','Convênio / Parceria','Legislação / Regulamentação','Outro']

const PR: Record<Prioridade, { label: string; color: string; bg: string }> = {
  baixa:   { label: 'Baixa',   color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  media:   { label: 'Média',   color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
  alta:    { label: 'Alta',    color: '#fb923c', bg: 'rgba(251,146,60,0.12)'  },
  urgente: { label: 'Urgente', color: '#f87171', bg: 'rgba(248,113,113,0.14)' },
}
const ST: Record<Status, { label: string; color: string }> = {
  aberta:       { label: 'Aberta',       color: '#60a5fa' },
  em_andamento: { label: 'Em Andamento', color: '#fbbf24' },
  aguardando:   { label: 'Aguardando',   color: '#c084fc' },
  concluida:    { label: 'Concluída',    color: '#34d399' },
  cancelada:    { label: 'Cancelada',    color: '#9ca3af' },
}

function newId() { return Math.random().toString(36).slice(2, 10) }

function diasRestantes(prazo: string) {
  if (!prazo) return 999
  const h = new Date(); h.setHours(0,0,0,0)
  return Math.ceil((new Date(prazo+'T00:00:00').getTime() - h.getTime()) / 86400000)
}

function cardStyle(dias: number, status: Status): React.CSSProperties {
  if (status === 'concluida')
    return { background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }
  if (status === 'cancelada')
    return { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }
  if (dias <= 0)  return { background: 'rgba(239,68,68,0.06)',  border: '1px solid rgba(239,68,68,0.2)'  }
  if (dias <= 10) return { background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.18)' }
  if (dias <= 15) return { background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.18)' }
  return              { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }
}

function prazoInfo(dias: number, status?: Status): { text: string; color: string } {
  if (status === 'concluida') return { text: 'Concluída', color: '#10b981' }
  if (dias <= 0)  return { text: 'Aguardando resolução', color: '#94a3b8' }
  if (dias <= 10) return { text: `${dias}d restantes`, color: '#f87171' }
  if (dias <= 15) return { text: `${dias}d restantes`, color: '#fbbf24' }
  return              { text: `${dias}d restantes`, color: '#6ee7a0' }
}

// ─── Overlay Modal ─────────────────────────────────────────────────────────────
function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      {children}
    </div>
  )
}

// ─── Input helpers ─────────────────────────────────────────────────────────────
const IS: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)',
  fontSize: '0.82rem', width: '100%', outline: 'none', boxSizing: 'border-box',
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</label>
      {children}
    </div>
  )
}
function Sec({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
      <span style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
    </div>
  )
}

// ─── Formulário de demanda ────────────────────────────────────────────────────
function FormModal({ uid, demanda, onClose }: { uid: string | null; demanda: Demanda | null; onClose: () => void }) {
  const isEdit = !!demanda
  const [titulo, setTitulo] = useState(demanda?.titulo || '')
  const [descricao, setDescricao] = useState(demanda?.descricao || '')
  const [numeroDemanda, setNumeroDemanda] = useState(demanda?.numeroDemanda || '')
  const [processoSEI, setProcessoSEI] = useState(demanda?.processoSEI || '')
  const [dataAbertura, setDataAbertura] = useState(demanda?.dataAbertura || new Date().toISOString().slice(0,10))
  const [prazo, setPrazo] = useState(demanda?.prazo || '')
  const [solicitante, setSolicitante] = useState(demanda?.solicitante || '')
  const [unidade, setUnidade] = useState(demanda?.unidadeDemandante || '')
  const [categoria, setCategoria] = useState(demanda?.categoria || '')
  const [prioridade, setPrioridade] = useState<Prioridade>(demanda?.prioridade || 'media')
  const [status, setStatus] = useState<Status>(demanda?.status || 'aberta')
  const [encaminhamentos, setEncaminhamentos] = useState<Encaminhamento[]>(demanda?.encaminhamentos || [])
  const [encDe, setEncDe] = useState(''); const [encPara, setEncPara] = useState(''); const [encData, setEncData] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!uid || !titulo.trim()) return
    setSaving(true)
    const id = isEdit ? demanda!.id : newId()
    await setDoc(doc(db, 'users', uid, 'prontuario', id), {
      id, titulo, descricao, numeroDemanda, processoSEI, dataAbertura, prazo,
      solicitante, unidadeDemandante: unidade, categoria, prioridade, status,
      encaminhamentos, movimentacoes: demanda?.movimentacoes || [],
      criadoEm: demanda?.criadoEm || Date.now(),
    })
    setSaving(false); onClose()
  }

  const del = async () => {
    if (!uid || !demanda) return
    await deleteDoc(doc(db, 'users', uid, 'prontuario', demanda.id))
    onClose()
  }

  const addEnc = () => {
    if (!encDe || !encPara) return
    setEncaminhamentos(e => [...e, { id: newId(), de: encDe, para: encPara, data: encData }])
    setEncDe(''); setEncPara(''); setEncData('')
  }

  return (
    <Modal onClose={onClose}>
      <div style={{
        background: 'var(--card-bg, #1a1b26)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 18, width: '100%', maxWidth: 680, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
            {isEdit ? 'Editar Demanda' : 'Nova Demanda'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', padding: 4, lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Sec title="Identificação" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Nº da Demanda"><input style={IS} value={numeroDemanda} onChange={e=>setNumeroDemanda(e.target.value)} placeholder="Ex: 2025/0123" /></Field>
            <Field label="Processo SEI"><input style={IS} value={processoSEI} onChange={e=>setProcessoSEI(e.target.value)} placeholder="Ex: 1234.000123/2025-99" /></Field>
          </div>
          <Field label="Título *"><input style={IS} value={titulo} onChange={e=>setTitulo(e.target.value)} placeholder="Título descritivo da demanda" /></Field>
          <Field label="Descrição Detalhada">
            <textarea style={{ ...IS, resize: 'vertical', minHeight: 80, lineHeight: 1.5 }} value={descricao} onChange={e=>setDescricao(e.target.value)} placeholder="Descreva em detalhes o objeto da demanda..." />
          </Field>

          <Sec title="Solicitação" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Solicitante"><input style={IS} value={solicitante} onChange={e=>setSolicitante(e.target.value)} placeholder="Nome do solicitante" /></Field>
            <Field label="Unidade Demandante"><input style={IS} value={unidade} onChange={e=>setUnidade(e.target.value)} placeholder="Ex: Diretoria de Contratos" /></Field>
          </div>

          <Sec title="Classificação & Prazos" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Categoria">
              <select style={IS} value={categoria} onChange={e=>setCategoria(e.target.value)}>
                <option value="">Selecionar...</option>
                {CATEGORIAS.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Prioridade">
              <select style={IS} value={prioridade} onChange={e=>setPrioridade(e.target.value as Prioridade)}>
                {Object.entries(PR).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Data de Abertura"><input type="date" style={IS} value={dataAbertura} onChange={e=>setDataAbertura(e.target.value)} /></Field>
            <Field label="Prazo de Conclusão"><input type="date" style={IS} value={prazo} onChange={e=>setPrazo(e.target.value)} /></Field>
            <Field label="Status" >
              <select style={IS} value={status} onChange={e=>setStatus(e.target.value as Status)}>
                {Object.entries(ST).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
          </div>

          <Sec title="Fluxo entre Setores" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {encaminhamentos.map((enc, i) => (
              <div key={enc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{String(i+1).padStart(2,'0')}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{enc.de}</span>
                <span style={{ color: '#fbbf24', fontSize: '0.7rem' }}>→</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{enc.para}</span>
                {enc.data && <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{enc.data}</span>}
                <button onClick={()=>setEncaminhamentos(e=>e.filter((_,j)=>j!==i))} style={{ background:'none', border:'none', color:'rgba(239,68,68,0.5)', cursor:'pointer', fontSize:'0.85rem', padding:2, marginLeft: enc.data ? 0 : 'auto' }}>✕</button>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'end' }}>
              <Field label="De"><input style={IS} value={encDe} onChange={e=>setEncDe(e.target.value)} placeholder="Setor de origem" /></Field>
              <Field label="Para"><input style={IS} value={encPara} onChange={e=>setEncPara(e.target.value)} placeholder="Setor de destino" /></Field>
              <Field label="Data"><input type="date" style={{ ...IS, width: 'auto' }} value={encData} onChange={e=>setEncData(e.target.value)} /></Field>
              <button onClick={addEnc} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(91,91,214,0.4)', background: 'rgba(91,91,214,0.12)', color: '#a5a3f5', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap', alignSelf: 'flex-end' }}>+ Add</button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            {isEdit && (
              <button onClick={del} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', color: '#f87171', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}>
                Excluir
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'none', color: 'var(--text-secondary)', fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={save} disabled={saving || !titulo.trim()} style={{ padding: '8px 22px', borderRadius: 8, background: saving || !titulo.trim() ? 'rgba(59,124,201,0.3)' : 'linear-gradient(135deg,#3b7cc9,#5b5bd6)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: saving||!titulo.trim()?'not-allowed':'pointer' }}>
              {saving ? 'Salvando…' : isEdit ? 'Salvar Alterações' : 'Criar Demanda'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Modal Detalhe ─────────────────────────────────────────────────────────────
function DetalheModal({ uid, demanda, onClose, onEdit }: { uid: string|null; demanda: Demanda; onClose: ()=>void; onEdit: ()=>void }) {
  const [relato, setRelato] = useState('')
  const [saving, setSaving] = useState(false)
  const [movs, setMovs] = useState<Movimentacao[]>(demanda.movimentacoes || [])
  const dias = diasRestantes(demanda.prazo)
  const pz = prazoInfo(dias, demanda.status)
  const pr = PR[demanda.prioridade]
  const st = ST[demanda.status]

  const salvar = async () => {
    if (!uid || !relato.trim()) return
    setSaving(true)
    const now = new Date()
    const ts = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`
    const nova: Movimentacao = { id: newId(), data: ts, descricao: relato.trim() }
    const updated = [...movs, nova]
    setMovs(updated)
    await updateDoc(doc(db,'users',uid,'prontuario',demanda.id), { movimentacoes: updated })
    setRelato(''); setSaving(false)
  }

  const badge = (text: string, color: string, bg: string) => (
    <span style={{ padding:'2px 10px', borderRadius:20, background:bg, color, border:`1px solid ${color}44`, fontSize:'0.68rem', fontWeight:700 }}>{text}</span>
  )

  return (
    <Modal onClose={onClose}>
      <div style={{
        background:'var(--card-bg,#1a1b26)', border:`1px solid ${cardStyle(dias,demanda.status).border}`,
        borderRadius:18, width:'100%', maxWidth:680, maxHeight:'92vh',
        display:'flex', flexDirection:'column', overflow:'hidden',
        boxShadow:'0 32px 80px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{ padding:'18px 24px', borderBottom:'1px solid rgba(255,255,255,0.08)', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                {demanda.numeroDemanda && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', padding:'2px 8px', borderRadius:6, background:'rgba(255,255,255,0.06)', color:'var(--text-muted)' }}>#{demanda.numeroDemanda}</span>}
                {badge(pr.label, pr.color, pr.bg)}
                {badge(st.label, st.color, `${st.color}22`)}
                {demanda.prazo && <span style={{ fontSize:'0.68rem', fontWeight:700, color:pz.color }}>⏱ {pz.text}</span>}
              </div>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.05rem', color:'var(--text-primary)', lineHeight:1.3 }}>{demanda.titulo}</div>
            </div>
            <div style={{ display:'flex', gap:8, flexShrink:0 }}>
              <button onClick={onEdit} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.04)', color:'var(--text-secondary)', fontSize:'0.75rem', cursor:'pointer', fontWeight:600 }}>✏ Editar</button>
              <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:'1.2rem', cursor:'pointer', padding:4, lineHeight:1 }}>✕</button>
            </div>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
          {/* Info grid */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 24px' }}>
            {[['Solicitante',demanda.solicitante],['Unidade',demanda.unidadeDemandante],['Categoria',demanda.categoria],['Processo SEI',demanda.processoSEI],['Data Abertura',demanda.dataAbertura],['Prazo',demanda.prazo]].filter(([,v])=>v).map(([k,v])=>(
              <div key={k}>
                <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:2 }}>{k}</div>
                <div style={{ fontSize:'0.82rem', color:'var(--text-secondary)', fontWeight:600 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Descrição */}
          {demanda.descricao && (
            <div>
              <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Descrição</div>
              <p style={{ margin:0, fontSize:'0.82rem', color:'var(--text-secondary)', lineHeight:1.6, padding:'10px 14px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10 }}>{demanda.descricao}</p>
            </div>
          )}

          {/* Fluxo */}
          {demanda.encaminhamentos?.length > 0 && (
            <div>
              <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Fluxo entre Setores</div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                {demanda.encaminhamentos.map((enc,i)=>(
                  <div key={enc.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 12px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:8, fontSize:'0.78rem' }}>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'rgba(91,91,214,0.7)' }}>{String(i+1).padStart(2,'0')}</span>
                    <span style={{ color:'var(--text-muted)' }}>{enc.de}</span>
                    <span style={{ color:'#fbbf24' }}>→</span>
                    <span style={{ color:'var(--text-primary)', fontWeight:600 }}>{enc.para}</span>
                    {enc.data && <span style={{ marginLeft:'auto', color:'var(--text-muted)', fontSize:'0.7rem' }}>{enc.data}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Histórico */}
          <div>
            <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Histórico de Movimentações</div>
            {movs.length === 0
              ? <p style={{ margin:0, fontSize:'0.78rem', color:'var(--text-muted)', fontStyle:'italic' }}>Nenhuma movimentação registrada.</p>
              : <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:180, overflowY:'auto' }}>
                  {[...movs].reverse().map(m=>(
                    <div key={m.id} style={{ display:'flex', gap:10, padding:'8px 12px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:10 }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background:'#6b9fd4', marginTop:5, flexShrink:0 }} />
                      <div>
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'var(--text-muted)', marginBottom:3 }}>{m.data}</div>
                        <p style={{ margin:0, fontSize:'0.8rem', color:'var(--text-secondary)', lineHeight:1.5 }}>{m.descricao}</p>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>

          {/* Novo relato */}
          <div style={{ padding:'14px', background:'rgba(91,91,214,0.06)', border:'1px solid rgba(91,91,214,0.2)', borderRadius:12 }}>
            <div style={{ fontSize:'0.65rem', fontWeight:700, color:'#a5a3f5', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>📝 Registrar Movimentação</div>
            <textarea
              value={relato} onChange={e=>setRelato(e.target.value)}
              placeholder="Descreva o que aconteceu com esta demanda..."
              style={{ ...IS, minHeight:72, resize:'vertical', lineHeight:1.5, marginBottom:10 }}
            />
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <button onClick={salvar} disabled={saving||!relato.trim()} style={{ padding:'7px 20px', borderRadius:8, background:saving||!relato.trim()?'rgba(91,91,214,0.2)':'linear-gradient(135deg,#3b7cc9,#5b5bd6)', border:'none', color:'#fff', fontWeight:700, fontSize:'0.78rem', cursor:saving||!relato.trim()?'not-allowed':'pointer' }}>
                {saving?'Salvando…':'+ Registrar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Calendário ───────────────────────────────────────────────────────────────
function Calendario({ demandas, onClickDemanda }: { demandas: Demanda[]; onClickDemanda: (d:Demanda)=>void }) {
  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth())
  const [ano, setAno] = useState(hoje.getFullYear())
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const DS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  const primeiro = new Date(ano,mes,1).getDay()
  const total = new Date(ano,mes+1,0).getDate()
  const prazoColor = (dias:number, status?:Status) => status==='concluida'?'#10b981':dias<=0?'#94a3b8':dias<=10?'#f87171':dias<=15?'#fbbf24':'#6ee7a0'

  const evPorDia: Record<number,Demanda[]> = {}
  demandas.forEach(d=>{
    if(!d.prazo) return
    const dp = new Date(d.prazo+'T00:00:00')
    if(dp.getMonth()===mes&&dp.getFullYear()===ano){
      const dia=dp.getDate(); if(!evPorDia[dia]) evPorDia[dia]=[]
      evPorDia[dia].push(d)
    }
  })

  const cells=[...Array(primeiro).fill(null),...Array.from({length:total},(_,i)=>i+1)]
  const prev=()=>{ if(mes===0){setMes(11);setAno(a=>a-1)}else setMes(m=>m-1) }
  const next=()=>{ if(mes===11){setMes(0);setAno(a=>a+1)}else setMes(m=>m+1) }

  return (
    <div style={{ background:'var(--card-bg,#1a1b26)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:18, padding:'20px' }}>
      {/* Nav */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <button onClick={prev} style={{ width:32,height:32,borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontSize:'1rem',cursor:'pointer' }}>‹</button>
        <div style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.9rem',color:'var(--text-primary)' }}>{MESES[mes]} {ano}</div>
        <button onClick={next} style={{ width:32,height:32,borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontSize:'1rem',cursor:'pointer' }}>›</button>
      </div>
      {/* Grid */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4 }}>
        {DS.map(d=><div key={d} style={{ textAlign:'center',fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',padding:'4px 0' }}>{d}</div>)}
        {cells.map((dia,i)=>{
          if(!dia) return <div key={i} />
          const evs = evPorDia[dia]||[]
          const isHoje = dia===hoje.getDate()&&mes===hoje.getMonth()&&ano===hoje.getFullYear()
          const cor = evs.length>0?prazoColor(diasRestantes(evs[0].prazo),evs[0].status):undefined
          return (
            <div key={i} style={{ minHeight:56,borderRadius:10,padding:4,background:isHoje?'rgba(91,91,214,0.2)':evs.length?`${cor}12`:'rgba(255,255,255,0.02)',border:`1px solid ${isHoje?'rgba(91,91,214,0.5)':evs.length?`${cor}30`:'rgba(255,255,255,0.05)'}` }}>
              <div style={{ fontSize:'0.72rem',fontWeight:isHoje||evs.length?700:400,color:isHoje?'#a5a3f5':cor??'var(--text-muted)',textAlign:'center',marginBottom:2 }}>{dia}</div>
              {evs.slice(0,2).map(ev=>(
                <button key={ev.id} onClick={()=>onClickDemanda(ev)} style={{ display:'block',width:'100%',textAlign:'left',fontSize:'0.58rem',padding:'2px 4px',borderRadius:4,background:`${prazoColor(diasRestantes(ev.prazo),ev.status)}20`,border:`1px solid ${prazoColor(diasRestantes(ev.prazo),ev.status)}30`,color:prazoColor(diasRestantes(ev.prazo),ev.status),marginBottom:1,cursor:'pointer',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{ev.titulo}</button>
              ))}
              {evs.length>2&&<div style={{ fontSize:'0.55rem',textAlign:'center',color:'var(--text-muted)' }}>+{evs.length-2}</div>}
            </div>
          )
        })}
      </div>
      {/* Legenda */}
      <div style={{ display:'flex',gap:16,justifyContent:'center',marginTop:14,fontSize:'0.65rem',color:'var(--text-muted)' }}>
        {[['#f87171','≤ 10 dias'],['#fbbf24','11–15 dias'],['#6ee7a0','≥ 16 dias'],['#10b981','Concluída'],['#94a3b8','Ag. resolução']].map(([c,l])=>(
          <span key={l} style={{ display:'flex',alignItems:'center',gap:5 }}><span style={{ width:8,height:8,borderRadius:'50%',background:c,display:'inline-block' }}/>{l}</span>
        ))}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ProntuarioADM() {
  const uid = useUid()
  const [demandas, setDemandas] = useState<Demanda[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'cards'|'calendario'>('cards')
  const [filtroStatus, setFiltroStatus] = useState<Status|'todas'>('todas')
  const [filtroPrioridade, setFiltroPrioridade] = useState<Prioridade|'todas'>('todas')
  const [busca, setBusca] = useState('')
  const [formModal, setFormModal] = useState(false)
  const [editando, setEditando] = useState<Demanda|null>(null)
  const [detalhe, setDetalhe] = useState<Demanda|null>(null)

  // ── Filtros de data por abertura ──────────────────────────────────────────
  const [filtroDataTipo, setFiltroDataTipo] = useState<'dia'|'mes'|'ano'|'todas'>('todas')
  const [filtroDataDia, setFiltroDataDia] = useState('')
  const [filtroDataMes, setFiltroDataMes] = useState('')
  const [filtroDataAno, setFiltroDataAno] = useState('')

  useEffect(()=>{
    if(!uid) return
    return onSnapshot(collection(db,'users',uid,'prontuario'), snap=>{
      const list = snap.docs.map(d=>({id:d.id,...d.data()} as Demanda)).sort((a,b)=>b.criadoEm-a.criadoEm)
      setDemandas(list); setLoading(false)
    })
  },[uid])

  const filtradas = demandas.filter(d=>{
    if(filtroStatus!=='todas'&&d.status!==filtroStatus) return false
    if(filtroPrioridade!=='todas'&&d.prioridade!==filtroPrioridade) return false
    if(busca&&!d.titulo.toLowerCase().includes(busca.toLowerCase())&&!(d.numeroDemanda||'').includes(busca)) return false
    // Filtro por data de abertura
    if(filtroDataTipo==='dia'&&filtroDataDia) {
      if(!d.dataAbertura||d.dataAbertura!==filtroDataDia) return false
    }
    if(filtroDataTipo==='mes'&&filtroDataMes) {
      if(!d.dataAbertura||!d.dataAbertura.startsWith(filtroDataMes)) return false
    }
    if(filtroDataTipo==='ano'&&filtroDataAno) {
      if(!d.dataAbertura||!d.dataAbertura.startsWith(filtroDataAno)) return false
    }
    return true
  })

  const stats = [
    { label:'Abertas',      val:demandas.filter(d=>d.status==='aberta').length,       color:'#6b9fd4' },
    { label:'Em Andamento', val:demandas.filter(d=>d.status==='em_andamento').length, color:'#fbbf24' },
    { label:'Urgentes',     val:demandas.filter(d=>d.prioridade==='urgente'&&d.status!=='concluida'&&d.status!=='cancelada').length, color:'#f87171' },
    { label:'Concluídas',   val:demandas.filter(d=>d.status==='concluida').length,    color:'#6ee7a0' },
  ]

  if(loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'60vh' }}>
      <div style={{ width:36,height:36,borderRadius:'50%',border:'2px solid transparent',borderTopColor:'#6b9fd4',animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16, minHeight:'100%', boxSizing:'border-box' }}>
      {/* Título */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10 }}>
        <div>
          <h1 style={{ margin:0,fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1.4rem',color:'var(--text-primary)',letterSpacing:'-0.01em' }}>Prontuário ADM</h1>
          <p style={{ margin:'3px 0 0',fontSize:'0.75rem',color:'var(--text-muted)' }}>{demandas.filter(d=>d.status!=='concluida'&&d.status!=='cancelada').length} demandas ativas</p>
        </div>
        <div style={{ display:'flex',gap:8 }}>
          <button onClick={()=>setView(v=>v==='cards'?'calendario':'cards')} style={{ padding:'8px 14px',borderRadius:9,border:'1px solid rgba(255,255,255,0.12)',background:'rgba(255,255,255,0.05)',color:'var(--text-secondary)',fontSize:'0.78rem',cursor:'pointer',fontWeight:600 }}>
            {view==='cards'?'📅 Calendário':'🗂 Cards'}
          </button>
          <button onClick={()=>{setEditando(null);setFormModal(true)}} style={{ padding:'8px 18px',borderRadius:9,border:'none',background:'linear-gradient(135deg,#3b7cc9,#5b5bd6)',color:'#fff',fontWeight:700,fontSize:'0.82rem',cursor:'pointer' }}>
            + Nova Demanda
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10 }}>
        {stats.map(s=>(
          <div key={s.label} style={{ padding:'12px 16px',background:'var(--card-bg,#1a1b26)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:'1.5rem',color:s.color,lineHeight:1 }}>{s.val}</div>
            <div style={{ fontSize:'0.68rem',color:'var(--text-muted)',marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
        <div style={{ display:'flex',flexWrap:'wrap',gap:8,alignItems:'center' }}>
          <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar por título ou nº demanda..." style={{ ...IS, flex:1, minWidth:200 }} />
          <select value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value as any)} style={{ ...IS, width:'auto' }}>
            <option value="todas">Todos os status</option>
            {Object.entries(ST).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filtroPrioridade} onChange={e=>setFiltroPrioridade(e.target.value as any)} style={{ ...IS, width:'auto' }}>
            <option value="todas">Todas prioridades</option>
            {Object.entries(PR).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div style={{ display:'flex',flexWrap:'wrap',gap:8,alignItems:'center',padding:'10px 14px',background:'rgba(248,250,252,0.05)',border:'1px solid rgba(226,232,240,0.15)',borderRadius:10 }}>
          <span style={{ fontSize:'0.62rem',fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.1em',fontFamily:'var(--font-mono)',whiteSpace:'nowrap' }}>📅 Filtrar por abertura:</span>
          {(['todas','dia','mes','ano'] as const).map(t=>(
            <button key={t} onClick={()=>setFiltroDataTipo(t)}
              style={{ padding:'5px 12px',borderRadius:7,border:`1px solid ${filtroDataTipo===t?'rgba(148,163,184,0.45)':'rgba(148,163,184,0.12)'}`,background:filtroDataTipo===t?'rgba(148,163,184,0.12)':'rgba(255,255,255,0.02)',color:filtroDataTipo===t?'#e2e8f0':'var(--text-muted)',fontSize:'0.72rem',fontWeight:filtroDataTipo===t?700:400,cursor:'pointer' }}>
              {t==='todas'?'Todas':t==='dia'?'Dia':t==='mes'?'Mês':'Ano'}
            </button>
          ))}
          {filtroDataTipo==='dia' && (
            <input type="date" value={filtroDataDia} onChange={e=>setFiltroDataDia(e.target.value)} style={{ ...IS, width:'auto', padding:'5px 10px' }} />
          )}
          {filtroDataTipo==='mes' && (
            <input type="month" value={filtroDataMes} onChange={e=>setFiltroDataMes(e.target.value)} style={{ ...IS, width:'auto', padding:'5px 10px' }} />
          )}
          {filtroDataTipo==='ano' && (
            <input type="number" min="2020" max="2040" placeholder="Ex: 2025" value={filtroDataAno} onChange={e=>setFiltroDataAno(e.target.value)} style={{ ...IS, width:100, padding:'5px 10px' }} />
          )}
          {filtroDataTipo!=='todas' && (
            <button onClick={()=>{setFiltroDataTipo('todas');setFiltroDataDia('');setFiltroDataMes('');setFiltroDataAno('')}}
              style={{ padding:'4px 8px',borderRadius:6,border:'1px solid rgba(239,68,68,0.3)',background:'rgba(239,68,68,0.07)',color:'#f87171',fontSize:'0.68rem',cursor:'pointer',fontWeight:700 }}>✕ Limpar</button>
          )}
          <span style={{ marginLeft:'auto',fontSize:'0.68rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)' }}>{filtradas.length} resultado(s)</span>
        </div>
      </div>

      {/* Cards */}
      {view==='cards' && (
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14 }}>
          {filtradas.length===0 && (
            <div style={{ gridColumn:'1/-1',textAlign:'center',padding:'60px 0',color:'var(--text-muted)' }}>
              <div style={{ fontSize:'2.5rem',marginBottom:10 }}>📂</div>
              <p style={{ margin:0,fontSize:'0.85rem' }}>Nenhuma demanda encontrada</p>
            </div>
          )}
          {filtradas.map(d=>{
            const dias=diasRestantes(d.prazo); const pz=prazoInfo(dias, d.status)
            const pr=PR[d.prioridade]; const st=ST[d.status]
            const cs=cardStyle(dias,d.status)
            return (
              <div key={d.id} onClick={()=>setDetalhe(d)}
                style={{ ...cs, borderRadius:16, padding:'16px', cursor:'pointer', transition:'transform 0.15s', display:'flex', flexDirection:'column', gap:10 }}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform='scale(1.01)'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform='scale(1)'}>
                {/* Badges */}
                <div style={{ display:'flex',flexWrap:'wrap',gap:5,alignItems:'center' }}>
                  {d.numeroDemanda&&<span style={{ fontFamily:'var(--font-mono)',fontSize:'0.62rem',padding:'2px 7px',borderRadius:5,background:'rgba(255,255,255,0.07)',color:'var(--text-muted)' }}>#{d.numeroDemanda}</span>}
                  <span style={{ fontSize:'0.65rem',padding:'2px 9px',borderRadius:12,background:pr.bg,color:pr.color,fontWeight:700 }}>{pr.label}</span>
                  <span style={{ fontSize:'0.65rem',padding:'2px 9px',borderRadius:12,background:`${st.color}20`,color:st.color,fontWeight:700 }}>{st.label}</span>
                </div>
                {/* Data de Abertura em destaque */}
                {d.dataAbertura&&(
                  <div style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'4px 12px',borderRadius:20,background:'rgba(241,245,249,0.12)',border:'1px solid rgba(226,232,240,0.22)',width:'fit-content' }}>
                    <span style={{ fontSize:'0.58rem',fontWeight:600,color:'#94a3b8',fontFamily:'var(--font-mono)',letterSpacing:'0.05em',textTransform:'uppercase' }}>📅</span>
                    <span style={{ fontSize:'0.72rem',fontWeight:800,color:'#f1f5f9',fontFamily:'var(--font-mono)',letterSpacing:'0.04em' }}>{new Date(d.dataAbertura+'T12:00:00').toLocaleDateString('pt-BR')}</span>
                  </div>
                )}
                {/* Título */}
                <div style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'0.92rem',color:'var(--text-primary)',lineHeight:1.3 }}>{d.titulo}</div>
                {/* Descrição */}
                {d.descricao&&<p style={{ margin:0,fontSize:'0.75rem',color:'var(--text-secondary)',lineHeight:1.5,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden' }}>{d.descricao}</p>}
                {/* Meta */}
                <div style={{ display:'flex',flexWrap:'wrap',gap:'4px 12px',fontSize:'0.7rem',color:'var(--text-muted)' }}>
                  {d.solicitante&&<span>👤 {d.solicitante}</span>}
                  {d.unidadeDemandante&&<span>🏛 {d.unidadeDemandante}</span>}
                  {d.categoria&&<span>🏷 {d.categoria}</span>}
                </div>
                {/* Footer */}
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:8,borderTop:'1px solid rgba(255,255,255,0.07)',marginTop:'auto' }}>
                  <span style={{ fontSize:'0.72rem',fontWeight:700,color:pz.color }}>⏱ {d.prazo?pz.text:'Sem prazo'}</span>
                  <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                    {(d.movimentacoes?.length||0)>0&&<span style={{ fontSize:'0.65rem',color:'var(--text-muted)' }}>💬 {d.movimentacoes.length}</span>}
                    <button onClick={e=>{e.stopPropagation();setEditando(d);setFormModal(true)}} style={{ padding:'3px 10px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontSize:'0.65rem',cursor:'pointer' }}>Editar</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Calendário */}
      {view==='calendario'&&<Calendario demandas={demandas} onClickDemanda={setDetalhe} />}

      {/* Modais */}
      {formModal&&<FormModal uid={uid} demanda={editando} onClose={()=>{setFormModal(false);setEditando(null)}} />}
      {detalhe&&<DetalheModal uid={uid} demanda={detalhe} onClose={()=>setDetalhe(null)} onEdit={()=>{setEditando(detalhe);setDetalhe(null);setFormModal(true)}} />}
    </div>
  )
}
