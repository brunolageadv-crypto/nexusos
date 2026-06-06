import { useState, useEffect, useCallback } from 'react'
import { db, auth } from '../../lib/firebase'
import { collection, doc, setDoc, deleteDoc, onSnapshot, query } from 'firebase/firestore'

/* ═══ Types ══════════════════════════════════════════════════ */
type StatusPrevisto = 'previsto' | 'edital' | 'inscricoes' | 'provas' | 'resultado' | 'encerrado'
type StatusRealizado = 'aprovado' | 'classificado' | 'aguardando' | 'reprovado' | 'desistiu'

interface Concurso {
  id: string
  orgao: string
  cargo: string
  banca: string
  vagas: number
  remuneracao: string
  status: StatusPrevisto
  dataEdital: string
  dataInscricaoFim: string
  dataProva: string
  dataResultado: string
  linkEdital: string
  linkSite: string
  disciplinas: string[]
  observacoes: string
  criadoEm: string
}

interface Realizado {
  id: string
  orgao: string
  cargo: string
  banca: string
  ano: number
  notaObj: number | null
  notaDiss: number | null
  notaTotal: number | null
  classificacao: number | null
  totalCandidatos: number | null
  status: StatusRealizado
  observacoes: string
  criadoEm: string
}

/* ═══ Constants ══════════════════════════════════════════════ */
const BANCAS = ['CESPE/CEBRASPE','FCC','FGV','VUNESP','AOCP','IBFC','QUADRIX','IDECAN','IADES','FAURGS','PGE','Banca Própria','Outra']
const ORGAOS = ['AGU','TCU','TCE','MPU','MPF','STF','STJ','TRF','TST','TRT','PF','PRF','Receita Federal','INSS','ANATEL','ANEEL','ANVISA','CGU','DPU','INPI','Outro']
const DISCIPLINAS_COMUNS = ['Direito Constitucional','Direito Administrativo','Direito Civil','Direito Processual Civil','Direito Tributário','Direito Financeiro','Direito Internacional','Direito Ambiental','Direito Previdenciário','Direito Penal','Direito Processual Penal','Direito Empresarial','Direito do Trabalho','Advocacia Pública','Língua Portuguesa','Raciocínio Lógico','Informática','Administração Pública']

const STATUS_PREV_LABEL: Record<StatusPrevisto, string> = {
  previsto: 'Previsto', edital: 'Com Edital', inscricoes: 'Inscrições Abertas',
  provas: 'Em Provas', resultado: 'Resultado', encerrado: 'Encerrado',
}
const STATUS_PREV_COLOR: Record<StatusPrevisto, string> = {
  previsto: '#64748b', edital: '#3b82f6', inscricoes: '#10b981',
  provas: '#f59e0b', resultado: '#8b5cf6', encerrado: '#6b7280',
}
const STATUS_REAL_LABEL: Record<StatusRealizado, string> = {
  aprovado: 'Aprovado', classificado: 'Classificado', aguardando: 'Aguardando',
  reprovado: 'Reprovado', desistiu: 'Desistiu',
}
const STATUS_REAL_COLOR: Record<StatusRealizado, string> = {
  aprovado: '#10b981', classificado: '#3b82f6', aguardando: '#f59e0b',
  reprovado: '#ef4444', desistiu: '#6b7280',
}

/* ═══ Helpers ════════════════════════════════════════════════ */
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function fmtDate(d: string) { if (!d) return '—'; const [y,m,dy] = d.split('-'); return `${dy}/${m}/${y}` }
function daysUntil(d: string) {
  if (!d) return null
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
  return diff
}

/* ═══ Modal base ═════════════════════════════════════════════ */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--bg-2)', border:'1px solid var(--border-md)', borderRadius:16, width:'100%', maxWidth:680, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 32px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'var(--bg-2)', zIndex:1 }}>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1rem', color:'var(--text-accent)' }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:'1.3rem', cursor:'pointer', lineHeight:1 }}>×</button>
        </div>
        <div style={{ padding:'20px 24px' }}>{children}</div>
      </div>
    </div>
  )
}

/* ═══ Form fields helpers ════════════════════════════════════ */
const FL = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ marginBottom:14 }}>
    <label style={{ display:'block', fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:5, fontFamily:'var(--font-mono)' }}>{label}</label>
    {children}
  </div>
)
const inp = { width:'100%', padding:'9px 12px', background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text-primary)', fontFamily:'var(--font-body)', fontSize:'0.88rem' } as React.CSSProperties
const sel = { ...inp, cursor:'pointer' } as React.CSSProperties

/* ═══ Form Concurso ══════════════════════════════════════════ */
function FormConcurso({ initial, onSave, onClose }: {
  initial?: Partial<Concurso>
  onSave: (c: Concurso) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<Omit<Concurso,'id'|'criadoEm'>>({
    orgao: initial?.orgao ?? '',
    cargo: initial?.cargo ?? '',
    banca: initial?.banca ?? '',
    vagas: initial?.vagas ?? 0,
    remuneracao: initial?.remuneracao ?? '',
    status: initial?.status ?? 'previsto',
    dataEdital: initial?.dataEdital ?? '',
    dataInscricaoFim: initial?.dataInscricaoFim ?? '',
    dataProva: initial?.dataProva ?? '',
    dataResultado: initial?.dataResultado ?? '',
    linkEdital: initial?.linkEdital ?? '',
    linkSite: initial?.linkSite ?? '',
    disciplinas: initial?.disciplinas ?? [],
    observacoes: initial?.observacoes ?? '',
  })

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const toggleDisc = (d: string) => setForm(p => ({
    ...p, disciplinas: p.disciplinas.includes(d) ? p.disciplinas.filter(x=>x!==d) : [...p.disciplinas, d]
  }))

  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <FL label="Órgão"><select style={sel} value={form.orgao} onChange={f('orgao')}>
          <option value="">Selecione…</option>
          {ORGAOS.map(o => <option key={o}>{o}</option>)}
        </select></FL>
        <FL label="Banca"><select style={sel} value={form.banca} onChange={f('banca')}>
          <option value="">Selecione…</option>
          {BANCAS.map(b => <option key={b}>{b}</option>)}
        </select></FL>
      </div>
      <FL label="Cargo / Especialidade"><input style={inp} value={form.cargo} onChange={f('cargo')} placeholder="Ex: Advogado da União" /></FL>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <FL label="Vagas"><input style={inp} type="number" min={0} value={form.vagas || ''} onChange={f('vagas')} /></FL>
        <FL label="Remuneração"><input style={inp} value={form.remuneracao} onChange={f('remuneracao')} placeholder="Ex: R$ 21.029,00" /></FL>
      </div>
      <FL label="Status"><select style={sel} value={form.status} onChange={f('status')}>
        {(Object.keys(STATUS_PREV_LABEL) as StatusPrevisto[]).map(s => <option key={s} value={s}>{STATUS_PREV_LABEL[s]}</option>)}
      </select></FL>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
        <FL label="Data do Edital"><input style={inp} type="date" value={form.dataEdital} onChange={f('dataEdital')} /></FL>
        <FL label="Fim das Inscrições"><input style={inp} type="date" value={form.dataInscricaoFim} onChange={f('dataInscricaoFim')} /></FL>
        <FL label="Data da Prova"><input style={inp} type="date" value={form.dataProva} onChange={f('dataProva')} /></FL>
        <FL label="Data do Resultado"><input style={inp} type="date" value={form.dataResultado} onChange={f('dataResultado')} /></FL>
      </div>
      <FL label="Link do Edital"><input style={inp} value={form.linkEdital} onChange={f('linkEdital')} placeholder="https://…" /></FL>
      <FL label="Link do Site"><input style={inp} value={form.linkSite} onChange={f('linkSite')} placeholder="https://…" /></FL>
      <FL label="Disciplinas cobradas">
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:4 }}>
          {DISCIPLINAS_COMUNS.map(d => (
            <button key={d} type="button" onClick={() => toggleDisc(d)} style={{
              padding:'4px 10px', borderRadius:20, fontSize:'0.72rem', fontWeight:600, cursor:'pointer', transition:'all 0.15s',
              background: form.disciplinas.includes(d) ? 'rgba(0,229,255,0.15)' : 'var(--bg-4)',
              border: form.disciplinas.includes(d) ? '1px solid rgba(0,229,255,0.4)' : '1px solid var(--border)',
              color: form.disciplinas.includes(d) ? 'var(--text-accent)' : 'var(--text-secondary)',
            }}>{d}</button>
          ))}
        </div>
      </FL>
      <FL label="Observações">
        <textarea style={{ ...inp, minHeight:72, resize:'vertical' } as React.CSSProperties} value={form.observacoes} onChange={f('observacoes')} />
      </FL>
      <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
        <button onClick={onClose} style={{ padding:'9px 20px', borderRadius:8, border:'1px solid var(--border)', background:'none', color:'var(--text-secondary)', fontFamily:'var(--font-display)', fontWeight:600, cursor:'pointer' }}>Cancelar</button>
        <button onClick={() => onSave({ id: (initial as any)?.id ?? newId(), criadoEm: (initial as any)?.criadoEm ?? new Date().toISOString(), ...form })}
          style={{ padding:'9px 20px', borderRadius:8, border:'1px solid rgba(0,229,255,0.4)', background:'rgba(0,229,255,0.1)', color:'var(--text-accent)', fontFamily:'var(--font-display)', fontWeight:700, cursor:'pointer' }}>
          Salvar
        </button>
      </div>
    </>
  )
}

/* ═══ Form Realizado ═════════════════════════════════════════ */
function FormRealizado({ initial, onSave, onClose }: {
  initial?: Partial<Realizado>
  onSave: (r: Realizado) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    orgao: initial?.orgao ?? '',
    cargo: initial?.cargo ?? '',
    banca: initial?.banca ?? '',
    ano: initial?.ano ?? new Date().getFullYear(),
    notaObj: initial?.notaObj ?? null as number|null,
    notaDiss: initial?.notaDiss ?? null as number|null,
    notaTotal: initial?.notaTotal ?? null as number|null,
    classificacao: initial?.classificacao ?? null as number|null,
    totalCandidatos: initial?.totalCandidatos ?? null as number|null,
    status: initial?.status ?? 'aguardando' as StatusRealizado,
    observacoes: initial?.observacoes ?? '',
  })

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))
  const fn = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value === '' ? null : Number(e.target.value) }))

  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <FL label="Órgão"><select style={sel} value={form.orgao} onChange={f('orgao')}>
          <option value="">Selecione…</option>
          {ORGAOS.map(o => <option key={o}>{o}</option>)}
        </select></FL>
        <FL label="Banca"><select style={sel} value={form.banca} onChange={f('banca')}>
          <option value="">Selecione…</option>
          {BANCAS.map(b => <option key={b}>{b}</option>)}
        </select></FL>
      </div>
      <FL label="Cargo"><input style={inp} value={form.cargo} onChange={f('cargo')} /></FL>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <FL label="Ano"><input style={inp} type="number" value={form.ano} onChange={f('ano')} /></FL>
        <FL label="Status"><select style={sel} value={form.status} onChange={f('status')}>
          {(Object.keys(STATUS_REAL_LABEL) as StatusRealizado[]).map(s => <option key={s} value={s}>{STATUS_REAL_LABEL[s]}</option>)}
        </select></FL>
        <FL label="Nota Objetiva"><input style={inp} type="number" step="0.01" value={form.notaObj ?? ''} onChange={fn('notaObj')} /></FL>
        <FL label="Nota Dissertativa"><input style={inp} type="number" step="0.01" value={form.notaDiss ?? ''} onChange={fn('notaDiss')} /></FL>
        <FL label="Nota Total"><input style={inp} type="number" step="0.01" value={form.notaTotal ?? ''} onChange={fn('notaTotal')} /></FL>
        <FL label="Classificação (posição)"><input style={inp} type="number" value={form.classificacao ?? ''} onChange={fn('classificacao')} /></FL>
        <FL label="Total de Candidatos"><input style={inp} type="number" value={form.totalCandidatos ?? ''} onChange={fn('totalCandidatos')} /></FL>
      </div>
      <FL label="Observações">
        <textarea style={{ ...inp, minHeight:72, resize:'vertical' } as React.CSSProperties} value={form.observacoes} onChange={f('observacoes')} />
      </FL>
      <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
        <button onClick={onClose} style={{ padding:'9px 20px', borderRadius:8, border:'1px solid var(--border)', background:'none', color:'var(--text-secondary)', fontFamily:'var(--font-display)', fontWeight:600, cursor:'pointer' }}>Cancelar</button>
        <button onClick={() => onSave({ id: (initial as any)?.id ?? newId(), criadoEm: (initial as any)?.criadoEm ?? new Date().toISOString(), ...form })}
          style={{ padding:'9px 20px', borderRadius:8, border:'1px solid rgba(0,229,255,0.4)', background:'rgba(0,229,255,0.1)', color:'var(--text-accent)', fontFamily:'var(--font-display)', fontWeight:700, cursor:'pointer' }}>
          Salvar
        </button>
      </div>
    </>
  )
}

/* ═══ Card Concurso ══════════════════════════════════════════ */
function CardConcurso({ c, onEdit, onDelete }: { c: Concurso; onEdit: () => void; onDelete: () => void }) {
  const provaInDays = daysUntil(c.dataProva)
  const inscInDays  = daysUntil(c.dataInscricaoFim)
  const cor = STATUS_PREV_COLOR[c.status]

  return (
    <div className="card" style={{ borderLeft:`4px solid ${cor}`, padding:'16px 18px', cursor:'pointer', transition:'all 0.18s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = cor; (e.currentTarget as HTMLElement).style.transform = 'none' }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'0.95rem', color:'var(--text-primary)' }}>{c.orgao}</span>
            <span style={{ fontSize:'0.68rem', fontWeight:700, padding:'2px 8px', borderRadius:20, background:`${cor}22`, color:cor, border:`1px solid ${cor}44` }}>
              {STATUS_PREV_LABEL[c.status]}
            </span>
          </div>
          <div style={{ fontSize:'0.82rem', color:'var(--text-secondary)', marginBottom:8 }}>{c.cargo}</div>
          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            {c.banca && <span style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>🏛 {c.banca}</span>}
            {c.vagas > 0 && <span style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>👤 {c.vagas} vagas</span>}
            {c.remuneracao && <span style={{ fontSize:'0.72rem', color:'#10b981' }}>💰 {c.remuneracao}</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          <button onClick={e=>{e.stopPropagation();onEdit()}} style={{ background:'rgba(0,229,255,0.07)', border:'1px solid var(--border)', borderRadius:7, padding:'5px 10px', color:'var(--text-accent)', cursor:'pointer', fontSize:'0.78rem', fontFamily:'var(--font-display)', fontWeight:600 }}>Editar</button>
          <button onClick={e=>{e.stopPropagation();onDelete()}} style={{ background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:7, padding:'5px 10px', color:'#f87171', cursor:'pointer', fontSize:'0.78rem' }}>✕</button>
        </div>
      </div>
      <div style={{ display:'flex', gap:14, marginTop:12, flexWrap:'wrap' }}>
        {c.dataProva && (
          <div style={{ fontSize:'0.72rem' }}>
            <span style={{ color:'var(--text-muted)' }}>📅 Prova: </span>
            <span style={{ color: provaInDays !== null && provaInDays <= 30 ? '#f59e0b' : 'var(--text-secondary)' }}>
              {fmtDate(c.dataProva)} {provaInDays !== null && provaInDays >= 0 ? `(${provaInDays}d)` : provaInDays !== null ? '(passou)' : ''}
            </span>
          </div>
        )}
        {c.dataInscricaoFim && (
          <div style={{ fontSize:'0.72rem' }}>
            <span style={{ color:'var(--text-muted)' }}>📝 Inscrições até: </span>
            <span style={{ color: inscInDays !== null && inscInDays <= 7 ? '#ef4444' : 'var(--text-secondary)' }}>
              {fmtDate(c.dataInscricaoFim)} {inscInDays !== null && inscInDays >= 0 ? `(${inscInDays}d)` : ''}
            </span>
          </div>
        )}
        {c.linkEdital && <a href={c.linkEdital} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{ fontSize:'0.72rem', color:'var(--text-accent)' }}>↗ Edital</a>}
      </div>
      {c.disciplinas.length > 0 && (
        <div style={{ marginTop:10, display:'flex', flexWrap:'wrap', gap:4 }}>
          {c.disciplinas.slice(0, 5).map(d => <span key={d} style={{ fontSize:'0.65rem', padding:'2px 7px', borderRadius:12, background:'var(--bg-4)', color:'var(--text-muted)', border:'1px solid var(--border)' }}>{d}</span>)}
          {c.disciplinas.length > 5 && <span style={{ fontSize:'0.65rem', color:'var(--text-muted)' }}>+{c.disciplinas.length - 5}</span>}
        </div>
      )}
    </div>
  )
}

/* ═══ Card Realizado ═════════════════════════════════════════ */
function CardRealizado({ r, onEdit, onDelete }: { r: Realizado; onEdit: () => void; onDelete: () => void }) {
  const cor = STATUS_REAL_COLOR[r.status]
  return (
    <div className="card" style={{ borderLeft:`4px solid ${cor}`, padding:'16px 18px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'0.95rem', color:'var(--text-primary)' }}>{r.orgao}</span>
            <span style={{ fontSize:'0.68rem', fontWeight:700, padding:'2px 8px', borderRadius:20, background:`${cor}22`, color:cor, border:`1px solid ${cor}44` }}>{STATUS_REAL_LABEL[r.status]}</span>
            <span style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>{r.ano}</span>
          </div>
          <div style={{ fontSize:'0.82rem', color:'var(--text-secondary)', marginBottom:8 }}>{r.cargo}</div>
          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            {r.notaObj !== null && <span style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>Obj: <strong>{r.notaObj}</strong></span>}
            {r.notaDiss !== null && <span style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>Diss: <strong>{r.notaDiss}</strong></span>}
            {r.notaTotal !== null && <span style={{ fontSize:'0.75rem', color:'var(--text-accent)' }}>Total: <strong>{r.notaTotal}</strong></span>}
            {r.classificacao !== null && <span style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>🏆 {r.classificacao}º {r.totalCandidatos ? `/ ${r.totalCandidatos}` : ''}</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={onEdit} style={{ background:'rgba(0,229,255,0.07)', border:'1px solid var(--border)', borderRadius:7, padding:'5px 10px', color:'var(--text-accent)', cursor:'pointer', fontSize:'0.78rem', fontFamily:'var(--font-display)', fontWeight:600 }}>Editar</button>
          <button onClick={onDelete} style={{ background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:7, padding:'5px 10px', color:'#f87171', cursor:'pointer', fontSize:'0.78rem' }}>✕</button>
        </div>
      </div>
      {r.observacoes && <div style={{ marginTop:10, fontSize:'0.75rem', color:'var(--text-muted)', fontStyle:'italic' }}>{r.observacoes}</div>}
    </div>
  )
}

/* ═══ Main ═══════════════════════════════════════════════════ */
type Tab = 'previstos' | 'realizados'

export default function Concursos() {
  const [tab, setTab] = useState<Tab>('previstos')
  const [concursos, setConcursos] = useState<Concurso[]>([])
  const [realizados, setRealizados] = useState<Realizado[]>([])
  const [filtro, setFiltro] = useState<string>('todos')
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState<'novoConcurso'|'editConcurso'|'novoRealizado'|'editRealizado'|null>(null)
  const [editing, setEditing] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const uid = auth?.currentUser?.uid

  // Firestore sync
  useEffect(() => {
    if (!uid || !db) { setLoading(false); return }
    const qC = query(collection(db, `users/${uid}/concursos`))
    const qR = query(collection(db, `users/${uid}/realizados`))
    const u1 = onSnapshot(qC, snap => {
      setConcursos(snap.docs.map(d => d.data() as Concurso))
      setLoading(false)
    })
    const u2 = onSnapshot(qR, snap => setRealizados(snap.docs.map(d => d.data() as Realizado)))
    return () => { u1(); u2() }
  }, [uid])

  const saveConcurso = useCallback(async (c: Concurso) => {
    if (uid && db) await setDoc(doc(db, `users/${uid}/concursos`, c.id), c)
    else setConcursos(p => { const n = p.filter(x=>x.id!==c.id); return [...n,c] })
    setModal(null)
  }, [uid])

  const deleteConcurso = useCallback(async (id: string) => {
    if (!confirm('Remover este concurso?')) return
    if (uid && db) await deleteDoc(doc(db, `users/${uid}/concursos`, id))
    else setConcursos(p => p.filter(x=>x.id!==id))
  }, [uid])

  const saveRealizado = useCallback(async (r: Realizado) => {
    if (uid && db) await setDoc(doc(db, `users/${uid}/realizados`, r.id), r)
    else setRealizados(p => { const n = p.filter(x=>x.id!==r.id); return [...n,r] })
    setModal(null)
  }, [uid])

  const deleteRealizado = useCallback(async (id: string) => {
    if (!confirm('Remover este registro?')) return
    if (uid && db) await deleteDoc(doc(db, `users/${uid}/realizados`, id))
    else setRealizados(p => p.filter(x=>x.id!==id))
  }, [uid])

  // Filtered lists
  const concursosFiltrados = concursos.filter(c => {
    const matchFiltro = filtro === 'todos' || c.status === filtro
    const matchBusca = !busca || [c.orgao,c.cargo,c.banca].some(s => s.toLowerCase().includes(busca.toLowerCase()))
    return matchFiltro && matchBusca
  }).sort((a,b) => (a.dataProva || '9').localeCompare(b.dataProva || '9'))

  const realizadosFiltrados = realizados.filter(r => {
    const matchFiltro = filtro === 'todos' || r.status === filtro
    const matchBusca = !busca || [r.orgao,r.cargo].some(s => s.toLowerCase().includes(busca.toLowerCase()))
    return matchFiltro && matchBusca
  }).sort((a,b) => b.ano - a.ano)

  // Stats
  const inscricoesAbertas = concursos.filter(c=>c.status==='inscricoes').length
  const provasProximas = concursos.filter(c=>{ const d=daysUntil(c.dataProva); return d!==null && d>=0 && d<=60 }).length
  const aprovacoes = realizados.filter(r=>r.status==='aprovado').length

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding:'10px 24px', border:'none', background:'none',
    fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.9rem',
    cursor:'pointer', letterSpacing:'0.04em',
    color: tab===t ? 'var(--text-accent)' : 'var(--text-muted)',
    borderBottom: tab===t ? '2px solid var(--text-accent)' : '2px solid transparent',
    transition:'all 0.18s',
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg-0)' }}>

      {/* Header */}
      <div style={{ padding:'18px 24px 0', background:'var(--bg-1)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16, flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'1rem', fontWeight:800, color:'var(--text-accent)', letterSpacing:'0.1em' }}>CONCURSOS PÚBLICOS</div>
            <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:2 }}>Acompanhamento e registro de certames</div>
          </div>
          {/* KPIs */}
          <div style={{ display:'flex', gap:20 }}>
            {[
              { l:'Previstos', v:concursos.length, c:'var(--text-accent)' },
              { l:'Inscrições Abertas', v:inscricoesAbertas, c:'#10b981' },
              { l:'Provas em 60d', v:provasProximas, c:'#f59e0b' },
              { l:'Aprovações', v:aprovacoes, c:'#10b981' },
              { l:'Realizados', v:realizados.length, c:'#7c3aed' },
            ].map(k=>(
              <div key={k.l} style={{ textAlign:'center' }}>
                <div style={{ fontFamily:'var(--font-display)', fontSize:'1.4rem', fontWeight:800, color:k.c, lineHeight:1 }}>{k.v}</div>
                <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:2 }}>{k.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:0 }}>
          <button style={tabStyle('previstos')} onClick={()=>{setTab('previstos');setFiltro('todos')}}>📋 Previstos / Em andamento</button>
          <button style={tabStyle('realizados')} onClick={()=>{setTab('realizados');setFiltro('todos')}}>✅ Realizados</button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ padding:'12px 24px', background:'var(--bg-1)', borderBottom:'1px solid var(--border)', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', flexShrink:0 }}>
        <input placeholder="🔍 Pesquisar…" value={busca} onChange={e=>setBusca(e.target.value)}
          style={{ ...inp, width:220, padding:'7px 12px' }} />

        {/* Filtros */}
        {tab === 'previstos' ? (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {['todos','previsto','edital','inscricoes','provas','resultado','encerrado'].map(f=>(
              <button key={f} onClick={()=>setFiltro(f)} style={{
                padding:'5px 12px', borderRadius:20, border:`1px solid ${filtro===f?'var(--border-md)':'var(--border)'}`,
                background: filtro===f ? 'rgba(0,229,255,0.1)' : 'none',
                color: filtro===f ? 'var(--text-accent)' : 'var(--text-muted)',
                fontFamily:'var(--font-display)', fontWeight:600, fontSize:'0.75rem', cursor:'pointer', transition:'all 0.15s',
              }}>
                {f==='todos'?'Todos':STATUS_PREV_LABEL[f as StatusPrevisto]}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {['todos','aprovado','classificado','aguardando','reprovado','desistiu'].map(f=>(
              <button key={f} onClick={()=>setFiltro(f)} style={{
                padding:'5px 12px', borderRadius:20, border:`1px solid ${filtro===f?'var(--border-md)':'var(--border)'}`,
                background: filtro===f ? 'rgba(0,229,255,0.1)' : 'none',
                color: filtro===f ? 'var(--text-accent)' : 'var(--text-muted)',
                fontFamily:'var(--font-display)', fontWeight:600, fontSize:'0.75rem', cursor:'pointer', transition:'all 0.15s',
              }}>
                {f==='todos'?'Todos':STATUS_REAL_LABEL[f as StatusRealizado]}
              </button>
            ))}
          </div>
        )}

        <div style={{ marginLeft:'auto' }}>
          {tab==='previstos'
            ? <button onClick={()=>{setEditing(null);setModal('novoConcurso')}} style={{ padding:'8px 18px', borderRadius:8, border:'1px solid rgba(0,229,255,0.4)', background:'rgba(0,229,255,0.1)', color:'var(--text-accent)', fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.85rem', cursor:'pointer' }}>+ Novo Concurso</button>
            : <button onClick={()=>{setEditing(null);setModal('novoRealizado')}} style={{ padding:'8px 18px', borderRadius:8, border:'1px solid rgba(124,58,237,0.4)', background:'rgba(124,58,237,0.1)', color:'#a78bfa', fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.85rem', cursor:'pointer' }}>+ Registrar Prova</button>
          }
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', padding:24 }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:'48px 0', color:'var(--text-muted)' }}>Carregando…</div>
        ) : tab === 'previstos' ? (
          concursosFiltrados.length === 0 ? (
            <div style={{ textAlign:'center', padding:'64px 0', color:'var(--text-muted)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:'0.85rem', letterSpacing:'0.1em', textTransform:'uppercase' }}>Nenhum concurso encontrado</div>
              <div style={{ fontSize:'0.8rem', marginTop:8, marginBottom:20 }}>Adicione concursos para acompanhar editais e cronogramas.</div>
              <button onClick={()=>{setEditing(null);setModal('novoConcurso')}} style={{ padding:'9px 20px', borderRadius:8, border:'1px solid rgba(0,229,255,0.4)', background:'rgba(0,229,255,0.1)', color:'var(--text-accent)', fontFamily:'var(--font-display)', fontWeight:700, cursor:'pointer' }}>+ Adicionar Concurso</button>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(480px,1fr))', gap:14 }}>
              {concursosFiltrados.map(c=>(
                <CardConcurso key={c.id} c={c}
                  onEdit={()=>{setEditing(c);setModal('editConcurso')}}
                  onDelete={()=>deleteConcurso(c.id)} />
              ))}
            </div>
          )
        ) : (
          realizadosFiltrados.length === 0 ? (
            <div style={{ textAlign:'center', padding:'64px 0', color:'var(--text-muted)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🎓</div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:'0.85rem', letterSpacing:'0.1em', textTransform:'uppercase' }}>Nenhum concurso realizado</div>
              <div style={{ fontSize:'0.8rem', marginTop:8, marginBottom:20 }}>Registre provas realizadas para acompanhar seu histórico.</div>
              <button onClick={()=>{setEditing(null);setModal('novoRealizado')}} style={{ padding:'9px 20px', borderRadius:8, border:'1px solid rgba(124,58,237,0.4)', background:'rgba(124,58,237,0.1)', color:'#a78bfa', fontFamily:'var(--font-display)', fontWeight:700, cursor:'pointer' }}>+ Registrar Prova</button>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(440px,1fr))', gap:14 }}>
              {realizadosFiltrados.map(r=>(
                <CardRealizado key={r.id} r={r}
                  onEdit={()=>{setEditing(r);setModal('editRealizado')}}
                  onDelete={()=>deleteRealizado(r.id)} />
              ))}
            </div>
          )
        )}
      </div>

      {/* Modals */}
      {(modal==='novoConcurso'||modal==='editConcurso') && (
        <Modal title={modal==='novoConcurso'?'Novo Concurso':'Editar Concurso'} onClose={()=>setModal(null)}>
          <FormConcurso initial={editing} onSave={saveConcurso} onClose={()=>setModal(null)} />
        </Modal>
      )}
      {(modal==='novoRealizado'||modal==='editRealizado') && (
        <Modal title={modal==='novoRealizado'?'Registrar Prova Realizada':'Editar Prova Realizada'} onClose={()=>setModal(null)}>
          <FormRealizado initial={editing} onSave={saveRealizado} onClose={()=>setModal(null)} />
        </Modal>
      )}
    </div>
  )
}
