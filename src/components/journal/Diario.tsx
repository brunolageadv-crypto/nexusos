import { useEffect, useState, useCallback, useRef } from 'react'
import { collection, doc, onSnapshot, setDoc, getDoc, getFirestore } from 'firebase/firestore'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { getApp } from 'firebase/app'
import { AGU_DISCIPLINAS } from '../editais/aguData'

// ─── Firebase helpers ─────────────────────────────────────────────────────────
function getDB() { return getFirestore(getApp() as any) }
function useUid() {
  const [uid, setUid] = useState<string | null>(null)
  useEffect(() => {
    return onAuthStateChanged(getAuth(getApp() as any), u => setUid(u?.uid ?? null))
  }, [])
  return uid
}

// ─── Types ────────────────────────────────────────────────────────────────────
type TipoNota = 'doutrina' | 'jurisprudencia' | 'decisao_adm' | 'insight' | 'pessoal' | 'ideia'
type NaturezaNota = 'academico' | 'profissional' | 'vida'

interface Task { id: string; texto: string; feito: boolean; prioridade: 'alta' | 'media' | 'baixa' }
interface Evento { id: string; hora: string; descricao: string; tipo: 'work' | 'study' | 'personal' | 'health' }
interface NotaEstudo { id: string; disciplina: string; conteudo: string; tipo: 'resumo' | 'duvida' | 'insight' | 'revisao' }
interface LogProfissional { id: string; tipo: 'decisao' | 'reuniao' | 'sei' | 'contrato' | 'outro'; titulo: string; descricao: string; processoSEI?: string }
interface Ideia { id: string; titulo: string; descricao: string; tipo: TipoNota; natureza: NaturezaNota; tags: string[]; disciplinaRef?: string }
interface Habito { id: string; nome: string; icon: string; meta: 'diario' | 'semanal' }
interface GatilhoInfo { disciplina: string; pct: number; subtopicosTotal: number; revisaoAtrasada: number; cor: string }

interface JournalDia {
  humor: number
  fraseDoDia: string
  planejamento: Task[]
  timeline: Evento[]
  diarioLivre: string
  estudos: NotaEstudo[]
  profissional: LogProfissional[]
  ideias: Ideia[]
  gratidao: string[]
  reflexao: string
  meta: string
  updatedAt: number
}

function today() { return new Date().toISOString().slice(0, 10) }
function newId() { return Math.random().toString(36).slice(2, 10) }
function fmtData(d: string) {
  const dt = new Date(d + 'T12:00:00')
  return dt.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function defaultDia(): JournalDia {
  return { humor: 3, fraseDoDia: '', planejamento: [], timeline: [], diarioLivre: '', estudos: [], profissional: [], ideias: [], gratidao: ['', '', ''], reflexao: '', meta: '', updatedAt: Date.now() }
}

// ─── Estilos base ─────────────────────────────────────────────────────────────
const IS: React.CSSProperties = {
  background: 'var(--input-bg)', border: '1px solid var(--border-md)',
  borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)',
  fontSize: '0.82rem', width: '100%', outline: 'none', boxSizing: 'border-box',
}
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 14, padding: '16px 18px', ...style }}>{children}</div>
}
function SectionTitle({ icon, title, count }: { icon: string; title: string; count?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span style={{ fontSize: '1rem' }}>{icon}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{title}</span>
      {count !== undefined && <span style={{ fontSize: '0.65rem', padding: '1px 7px', borderRadius: 20, background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{count}</span>}
    </div>
  )
}

// ─── Gatilho de Revisão Inteligente ──────────────────────────────────────────
function detectarGatilhos(texto: string): GatilhoInfo[] {
  if (!texto || texto.length < 3) return []
  const tokens = texto.toLowerCase().split(/\s+/).filter(t => t.length >= 4)
  const encontrados = new Map<string, GatilhoInfo>()

  for (const disc of AGU_DISCIPLINAS) {
    const nomeDisc = disc.nome.toLowerCase()
    const palavrasDisc = nomeDisc.split(/\s+/)
    const match = tokens.some(t => palavrasDisc.some(p => p.includes(t) || t.includes(p)))
    if (match && !encontrados.has(disc.id)) {
      const allIds = disc.topicos.flatMap(t => t.subtopicos.map(s => s.id))
      const hoje = new Date(); hoje.setHours(0,0,0,0)
      // Sem acesso ao hook aqui — retornar info básica
      encontrados.set(disc.id, {
        disciplina: disc.nome,
        pct: 0,
        subtopicosTotal: allIds.length,
        revisaoAtrasada: 0,
        cor: disc.cor,
      })
    }
  }
  return Array.from(encontrados.values()).slice(0, 3)
}

function GatilhoCard({ gatilhos, onNavigate }: { gatilhos: GatilhoInfo[]; onNavigate: (id: string) => void }) {
  if (gatilhos.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
        🔗 Conexões detectadas no texto
      </div>
      {gatilhos.map(g => (
        <div key={g.disciplina} style={{ padding: '8px 12px', borderRadius: 10, background: `${g.cor}10`, border: `1px solid ${g.cor}30`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: g.cor, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.disciplina}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1 }}>{g.subtopicosTotal} subtópicos</div>
          </div>
          <button onClick={() => onNavigate('editais')} style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${g.cor}40`, background: `${g.cor}12`, color: g.cor, fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Ver edital →
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Seção 1 — Dashboard do Dia ───────────────────────────────────────────────
function SecaoDashboard({ dia, data }: { dia: JournalDia; data: string }) {
  const tasksConcluidas = dia.planejamento.filter(t => t.feito).length
  const taskTotal = dia.planejamento.length
  const HUMOR_EMOJI = ['😢', '😕', '😐', '😊', '😄']
  const HUMOR_COR = ['#ef4444', '#f87171', '#fbbf24', '#a3e635', '#6ee7a0']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 10 }}>
        {[
          { icon: HUMOR_EMOJI[dia.humor - 1], label: 'Humor', val: ['Péssimo','Ruim','Neutro','Bom','Ótimo'][dia.humor - 1], cor: HUMOR_COR[dia.humor - 1] },
          { icon: '✅', label: 'Tasks', val: `${tasksConcluidas}/${taskTotal}`, cor: taskTotal > 0 && tasksConcluidas === taskTotal ? '#6ee7a0' : '#fbbf24' },
          { icon: '⏱', label: 'Eventos', val: dia.timeline.length, cor: '#60a5fa' },
          { icon: '💡', label: 'Ideias', val: dia.ideias.length, cor: '#f59e0b' },
          { icon: '📚', label: 'Notas Estudo', val: dia.estudos.length, cor: '#a78bfa' },
          { icon: '💼', label: 'Logs Prof.', val: dia.profissional.length, cor: '#34d399' },
        ].map(k => (
          <div key={k.label} style={{ padding: '10px 14px', background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{k.icon}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: k.cor as string, lineHeight: 1 }}>{k.val}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</div>
          </div>
        ))}
      </div>
      {dia.fraseDoDia && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          "{dia.fraseDoDia}"
        </div>
      )}
    </div>
  )
}

// ─── Seção 2 — Planejamento Diário ────────────────────────────────────────────
function SecaoPlanejamento({ tasks, onChange }: { tasks: Task[]; onChange: (t: Task[]) => void }) {
  const [novoTexto, setNovoTexto] = useState('')
  const [novaPrioridade, setNovaPrioridade] = useState<Task['prioridade']>('media')

  const addTask = () => {
    if (!novoTexto.trim()) return
    onChange([...tasks, { id: newId(), texto: novoTexto.trim(), feito: false, prioridade: novaPrioridade }])
    setNovoTexto('')
  }
  const toggleTask = (id: string) => onChange(tasks.map(t => t.id === id ? { ...t, feito: !t.feito } : t))
  const removeTask = (id: string) => onChange(tasks.filter(t => t.id !== id))

  const PR_COR: Record<Task['prioridade'], string> = { alta: '#f87171', media: '#fbbf24', baixa: '#6ee7a0' }

  const sorted = [...tasks].sort((a, b) => {
    const ord = { alta: 0, media: 1, baixa: 2 }
    return ord[a.prioridade] - ord[b.prioridade]
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sorted.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontStyle: 'italic' }}>Nenhuma task. Adicione abaixo.</p>}
      {sorted.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: t.feito ? 'rgba(110,231,160,0.05)' : 'var(--surface)', border: `1px solid ${t.feito ? 'rgba(110,231,160,0.2)' : 'var(--border)'}`, transition: 'all 0.2s' }}>
          <button onClick={() => toggleTask(t.id)} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${t.feito ? '#6ee7a0' : PR_COR[t.prioridade]}`, background: t.feito ? '#6ee7a0' : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#0a0f1a', transition: 'all 0.2s' }}>
            {t.feito ? '✓' : ''}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '0.82rem', color: t.feito ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: t.feito ? 'line-through' : 'none', transition: 'all 0.2s' }}>{t.texto}</span>
          </div>
          <span style={{ fontSize: '0.6rem', padding: '2px 7px', borderRadius: 10, background: `${PR_COR[t.prioridade]}18`, color: PR_COR[t.prioridade], fontWeight: 700, flexShrink: 0 }}>{t.prioridade}</span>
          <button onClick={() => removeTask(t.id)} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.4)', cursor: 'pointer', fontSize: '0.85rem', padding: 2 }}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input style={{ ...IS, flex: 1 }} value={novoTexto} onChange={e => setNovoTexto(e.target.value)} placeholder="Nova task..." onKeyDown={e => e.key === 'Enter' && addTask()} />
        <select style={{ ...IS, width: 'auto' }} value={novaPrioridade} onChange={e => setNovaPrioridade(e.target.value as Task['prioridade'])}>
          <option value="alta">🔴 Alta</option>
          <option value="media">🟡 Média</option>
          <option value="baixa">🟢 Baixa</option>
        </select>
        <button onClick={addTask} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add</button>
      </div>
      {tasks.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            <span>{tasks.filter(t => t.feito).length}/{tasks.length} concluídas</span>
            <span>{Math.round((tasks.filter(t => t.feito).length / tasks.length) * 100)}%</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-4)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round((tasks.filter(t => t.feito).length / tasks.length) * 100)}%`, background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Seção 3 — Timeline ───────────────────────────────────────────────────────
function SecaoTimeline({ eventos, onChange }: { eventos: Evento[]; onChange: (e: Evento[]) => void }) {
  const [novaHora, setNovaHora] = useState('')
  const [novaDesc, setNovaDesc] = useState('')
  const [novoTipo, setNovoTipo] = useState<Evento['tipo']>('work')

  const add = () => {
    if (!novaDesc.trim()) return
    const sorted = [...eventos, { id: newId(), hora: novaHora || new Date().toTimeString().slice(0, 5), descricao: novaDesc.trim(), tipo: novoTipo }]
      .sort((a, b) => a.hora.localeCompare(b.hora))
    onChange(sorted)
    setNovaDesc('')
  }

  const TIPO_COR: Record<Evento['tipo'], string> = { work: '#60a5fa', study: '#a78bfa', personal: '#fbbf24', health: '#34d399' }
  const TIPO_ICON: Record<Evento['tipo'], string> = { work: '💼', study: '📚', personal: '🏠', health: '✚' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {eventos.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontStyle: 'italic' }}>Nenhum evento registrado.</p>}
      {eventos.map((ev, i) => (
        <div key={ev.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: TIPO_COR[ev.tipo], fontWeight: 700, marginBottom: 3 }}>{ev.hora}</div>
            <div style={{ width: 2, flex: 1, background: i < eventos.length - 1 ? `${TIPO_COR[ev.tipo]}40` : 'transparent', minHeight: 20 }} />
          </div>
          <div style={{ flex: 1, padding: '7px 12px', borderRadius: 9, background: `${TIPO_COR[ev.tipo]}08`, border: `1px solid ${TIPO_COR[ev.tipo]}25`, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.85rem' }}>{TIPO_ICON[ev.tipo]}</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', flex: 1 }}>{ev.descricao}</span>
            <button onClick={() => onChange(eventos.filter(e => e.id !== ev.id))} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.35)', cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input type="time" style={{ ...IS, width: 100 }} value={novaHora} onChange={e => setNovaHora(e.target.value)} />
        <input style={{ ...IS, flex: 1 }} value={novaDesc} onChange={e => setNovaDesc(e.target.value)} placeholder="Descreva o evento..." onKeyDown={e => e.key === 'Enter' && add()} />
        <select style={{ ...IS, width: 'auto' }} value={novoTipo} onChange={e => setNovoTipo(e.target.value as Evento['tipo'])}>
          <option value="work">💼 Trabalho</option>
          <option value="study">📚 Estudo</option>
          <option value="personal">🏠 Pessoal</option>
          <option value="health">✚ Saúde</option>
        </select>
        <button onClick={add} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'rgba(96,165,250,0.15)', color: '#60a5fa', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>+</button>
      </div>
    </div>
  )
}

// ─── Seção 4 — Diário Livre ───────────────────────────────────────────────────
function SecaoDiarioLivre({ texto, onChange, onNavigate }: { texto: string; onChange: (t: string) => void; onNavigate: (id: string) => void }) {
  const gatilhos = detectarGatilhos(texto)
  const palavras = texto.trim() ? texto.trim().split(/\s+/).length : 0

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ flex: 1 }}>
        <textarea
          value={texto}
          onChange={e => onChange(e.target.value)}
          placeholder="Como foi seu dia? O que você pensou, sentiu, aprendeu? Escreva livremente..."
          style={{ ...IS, minHeight: 200, resize: 'vertical', lineHeight: 1.8, fontSize: '0.88rem' }}
        />
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>{palavras} palavras</div>
      </div>
      {gatilhos.length > 0 && (
        <div style={{ width: 240, flexShrink: 0 }}>
          <GatilhoCard gatilhos={gatilhos} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  )
}

// ─── Seção 6 — Diário de Estudos ─────────────────────────────────────────────
function SecaoEstudos({ notas, onChange, onNavigate }: { notas: NotaEstudo[]; onChange: (n: NotaEstudo[]) => void; onNavigate: (id: string) => void }) {
  const [disciplina, setDisciplina] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [tipo, setTipo] = useState<NotaEstudo['tipo']>('resumo')
  const gatilhos = detectarGatilhos(conteudo + ' ' + disciplina)

  const add = () => {
    if (!conteudo.trim()) return
    onChange([...notas, { id: newId(), disciplina: disciplina || 'Geral', conteudo: conteudo.trim(), tipo }])
    setConteudo(''); setDisciplina('')
  }

  const TIPO_COR: Record<NotaEstudo['tipo'], string> = { resumo: '#60a5fa', duvida: '#f87171', insight: '#fbbf24', revisao: '#6ee7a0' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {notas.map(n => (
        <div key={n.id} style={{ padding: '10px 14px', borderRadius: 10, background: `${TIPO_COR[n.tipo]}08`, border: `1px solid ${TIPO_COR[n.tipo]}25`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: '0.62rem', padding: '2px 8px', borderRadius: 10, background: `${TIPO_COR[n.tipo]}20`, color: TIPO_COR[n.tipo], fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{n.tipo}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 3 }}>{n.disciplina}</div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{n.conteudo}</p>
          </div>
          <button onClick={() => onChange(notas.filter(x => x.id !== n.id))} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.35)', cursor: 'pointer', fontSize: '0.75rem', flexShrink: 0 }}>✕</button>
        </div>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px', borderRadius: 12, border: '1px dashed var(--border-md)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...IS, flex: 1 }} value={disciplina} onChange={e => setDisciplina(e.target.value)} placeholder="Disciplina / Tema..." />
          <select style={{ ...IS, width: 'auto' }} value={tipo} onChange={e => setTipo(e.target.value as NotaEstudo['tipo'])}>
            <option value="resumo">📝 Resumo</option>
            <option value="duvida">❓ Dúvida</option>
            <option value="insight">💡 Insight</option>
            <option value="revisao">🔁 Revisão</option>
          </select>
        </div>
        <textarea style={{ ...IS, minHeight: 72, resize: 'vertical', lineHeight: 1.6 }} value={conteudo} onChange={e => setConteudo(e.target.value)} placeholder="Conteúdo da nota de estudo... (Active Recall: tente escrever de memória)" />
        {gatilhos.length > 0 && <GatilhoCard gatilhos={gatilhos} onNavigate={onNavigate} />}
        <button onClick={add} style={{ alignSelf: 'flex-end', padding: '7px 18px', borderRadius: 8, border: 'none', background: 'rgba(167,139,250,0.15)', color: '#a78bfa', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
          + Salvar nota
        </button>
      </div>
    </div>
  )
}

// ─── Seção 7 — Diário Profissional ────────────────────────────────────────────
function SecaoProfissional({ logs, onChange }: { logs: LogProfissional[]; onChange: (l: LogProfissional[]) => void }) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState<LogProfissional['tipo']>('decisao')
  const [sei, setSei] = useState('')

  const add = () => {
    if (!titulo.trim()) return
    onChange([...logs, { id: newId(), tipo, titulo: titulo.trim(), descricao: descricao.trim(), processoSEI: sei || undefined }])
    setTitulo(''); setDescricao(''); setSei('')
  }

  const TIPO_COR: Record<LogProfissional['tipo'], string> = { decisao: '#f87171', reuniao: '#60a5fa', sei: '#fbbf24', contrato: '#34d399', outro: '#9ca3af' }
  const TIPO_ICON: Record<LogProfissional['tipo'], string> = { decisao: '⚖️', reuniao: '👥', sei: '📄', contrato: '📝', outro: '📌' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {logs.map(l => (
        <div key={l.id} style={{ padding: '10px 14px', borderRadius: 10, background: `${TIPO_COR[l.tipo]}08`, border: `1px solid ${TIPO_COR[l.tipo]}25` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span>{TIPO_ICON[l.tipo]}</span>
            <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', flex: 1 }}>{l.titulo}</span>
            {l.processoSEI && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', background: 'var(--surface)', padding: '2px 7px', borderRadius: 6 }}>SEI: {l.processoSEI}</span>}
            <span style={{ fontSize: '0.6rem', padding: '2px 7px', borderRadius: 10, background: `${TIPO_COR[l.tipo]}20`, color: TIPO_COR[l.tipo], fontWeight: 700 }}>{l.tipo}</span>
            <button onClick={() => onChange(logs.filter(x => x.id !== l.id))} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.35)', cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
          </div>
          {l.descricao && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{l.descricao}</p>}
        </div>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px', borderRadius: 12, border: '1px dashed var(--border-md)', background: 'var(--surface)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <select style={IS} value={tipo} onChange={e => setTipo(e.target.value as LogProfissional['tipo'])}>
              <option value="decisao">⚖️ Decisão ADM</option>
              <option value="reuniao">👥 Reunião</option>
              <option value="sei">📄 Processo SEI</option>
              <option value="contrato">📝 Contrato</option>
              <option value="outro">📌 Outro</option>
            </select>
          </div>
          <input style={IS} value={sei} onChange={e => setSei(e.target.value)} placeholder="Nº SEI (opcional)" />
        </div>
        <input style={IS} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título do log..." />
        <textarea style={{ ...IS, minHeight: 64, resize: 'vertical' }} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descreva a decisão, reunião ou log..." />
        <button onClick={add} style={{ alignSelf: 'flex-end', padding: '7px 18px', borderRadius: 8, border: 'none', background: 'rgba(52,211,153,0.12)', color: '#34d399', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
          + Registrar log
        </button>
      </div>
    </div>
  )
}

// ─── Seção 8 — Registro de Ideias ────────────────────────────────────────────
function SecaoIdeias({ ideias, onChange }: { ideias: Ideia[]; onChange: (i: Ideia[]) => void }) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState<TipoNota>('ideia')
  const [natureza, setNatureza] = useState<NaturezaNota>('vida')
  const [tags, setTags] = useState('')

  const add = () => {
    if (!titulo.trim()) return
    onChange([...ideias, { id: newId(), titulo: titulo.trim(), descricao: descricao.trim(), tipo, natureza, tags: tags.split(',').map(t => t.trim()).filter(Boolean) }])
    setTitulo(''); setDescricao(''); setTags('')
  }

  const NAT_COR: Record<NaturezaNota, string> = { academico: '#a78bfa', profissional: '#60a5fa', vida: '#fbbf24' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 10 }}>
        {ideias.map(i => (
          <div key={i.id} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--card-bg)', border: '1px solid var(--border-md)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', flex: 1 }}>{i.titulo}</span>
              <button onClick={() => onChange(ideias.filter(x => x.id !== i.id))} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.35)', cursor: 'pointer', fontSize: '0.75rem', flexShrink: 0 }}>✕</button>
            </div>
            {i.descricao && <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{i.descricao}</p>}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
              <span style={{ fontSize: '0.6rem', padding: '2px 7px', borderRadius: 10, background: `${NAT_COR[i.natureza]}18`, color: NAT_COR[i.natureza], fontWeight: 700 }}>{i.natureza}</span>
              {i.tags.map(t => <span key={t} style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: 8, background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>#{t}</span>)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '12px', borderRadius: 12, border: '1px dashed var(--border-md)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input style={IS} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título da ideia..." onKeyDown={e => e.key === 'Enter' && !e.shiftKey && add()} />
        <textarea style={{ ...IS, minHeight: 56, resize: 'vertical' }} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Desenvolva a ideia..." />
        <div style={{ display: 'flex', gap: 8 }}>
          <select style={{ ...IS, flex: 1 }} value={tipo} onChange={e => setTipo(e.target.value as TipoNota)}>
            <option value="ideia">💡 Ideia</option>
            <option value="insight">✨ Insight</option>
            <option value="doutrina">📖 Doutrina</option>
            <option value="jurisprudencia">⚖️ Jurisprudência</option>
            <option value="decisao_adm">🏛 Decisão ADM</option>
            <option value="pessoal">🌱 Pessoal</option>
          </select>
          <select style={{ ...IS, flex: 1 }} value={natureza} onChange={e => setNatureza(e.target.value as NaturezaNota)}>
            <option value="vida">🌿 Vida</option>
            <option value="academico">📚 Acadêmico</option>
            <option value="profissional">💼 Profissional</option>
          </select>
        </div>
        <input style={IS} value={tags} onChange={e => setTags(e.target.value)} placeholder="Tags: direito, agu, fhemig (separadas por vírgula)" />
        <button onClick={add} style={{ alignSelf: 'flex-end', padding: '7px 18px', borderRadius: 8, border: 'none', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
          + Capturar ideia
        </button>
      </div>
    </div>
  )
}

// ─── Seção 9 — Gratidão e Reflexões ─────────────────────────────────────────
function SecaoGratidao({ gratidao, reflexao, meta, onChange }: {
  gratidao: string[]; reflexao: string; meta: string
  onChange: (g: string[], r: string, m: string) => void
}) {
  const g = gratidao.length >= 3 ? gratidao : [...gratidao, ...Array(3 - gratidao.length).fill('')]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>🙏 3 coisas pelas quais sou grato hoje</div>
        {g.slice(0, 3).map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, color: '#818cf8', flexShrink: 0 }}>{i + 1}</div>
            <input style={{ ...IS }} value={item} onChange={e => { const ng = [...g]; ng[i] = e.target.value; onChange(ng, reflexao, meta) }} placeholder={['Uma pessoa especial...', 'Uma conquista de hoje...', 'Uma coisa simples...'][i]} />
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>💭 Reflexão do dia</div>
        <textarea style={{ ...IS, minHeight: 80, resize: 'vertical', lineHeight: 1.6 }} value={reflexao} onChange={e => onChange(g, e.target.value, meta)} placeholder="O que aprendi hoje? O que faria diferente? Qual insight marcou o dia?" />
      </div>
      <div>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>🎯 Intenção para amanhã</div>
        <input style={IS} value={meta} onChange={e => onChange(g, reflexao, e.target.value)} placeholder="Uma coisa que quero focar amanhã..." />
      </div>
    </div>
  )
}

// ─── Seção 10 — Metas & Hábitos ──────────────────────────────────────────────
function SecaoHabitos({ uid, data }: { uid: string | null; data: string }) {
  const [habitos, setHabitos] = useState<Habito[]>([])
  const [registros, setRegistros] = useState<Record<string, Record<string, boolean>>>({})
  const [novoNome, setNovoNome] = useState('')
  const [novoIcon, setNovoIcon] = useState('⭐')

  useEffect(() => {
    if (!uid) return
    const db = getDB()
    const u1 = onSnapshot(collection(db, 'users', uid, 'habitos'), snap => {
      setHabitos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Habito)))
    })
    const u2 = onSnapshot(doc(db, 'users', uid, 'habitosRegistros', data), snap => {
      setRegistros(snap.exists() ? snap.data() as any : {})
    })
    return () => { u1(); u2() }
  }, [uid, data])

  const toggle = async (habitoId: string) => {
    if (!uid) return
    const db = getDB()
    const novo = { ...registros, [habitoId]: !registros[habitoId] }
    setRegistros(novo)
    await setDoc(doc(db, 'users', uid, 'habitosRegistros', data), novo)
  }

  const addHabito = async () => {
    if (!uid || !novoNome.trim()) return
    const db = getDB()
    const id = newId()
    await setDoc(doc(db, 'users', uid, 'habitos', id), { id, nome: novoNome.trim(), icon: novoIcon, meta: 'diario' })
    setNovoNome('')
  }

  const ICONS = ['⭐','🏃','💧','📚','🧘','💪','🥗','😴','🎯','✍️','🎵','🌿']

  // Calcular streak dos últimos 7 dias
  const getStreak = (habitoId: string) => {
    let s = 0
    const d = new Date(data + 'T12:00:00')
    for (let i = 0; i < 7; i++) {
      d.setDate(d.getDate() - (i === 0 ? 0 : 1))
      // streak simplificado — só conta o dia atual por ora
    }
    return registros[habitoId] ? 1 : 0
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {habitos.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontStyle: 'italic' }}>Nenhum hábito cadastrado.</p>}
      {habitos.map(h => (
        <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12, background: registros[h.id] ? 'rgba(110,231,160,0.08)' : 'var(--surface)', border: `1px solid ${registros[h.id] ? 'rgba(110,231,160,0.25)' : 'var(--border)'}`, transition: 'all 0.2s' }}>
          <button onClick={() => toggle(h.id)} style={{ width: 28, height: 28, borderRadius: 8, border: `2px solid ${registros[h.id] ? '#6ee7a0' : 'var(--border-md)'}`, background: registros[h.id] ? '#6ee7a0' : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#0a0f1a', transition: 'all 0.2s' }}>
            {registros[h.id] ? '✓' : ''}
          </button>
          <span style={{ fontSize: '1.1rem' }}>{h.icon}</span>
          <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', textDecoration: registros[h.id] ? 'none' : 'none' }}>{h.nome}</span>
          {registros[h.id] && <span style={{ fontSize: '0.62rem', color: '#6ee7a0', fontWeight: 700 }}>✅ Feito!</span>}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px', borderRadius: 10, border: '1px dashed var(--border-md)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {ICONS.map(ic => (
            <button key={ic} onClick={() => setNovoIcon(ic)}
              style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${novoIcon === ic ? 'var(--border-bright)' : 'transparent'}`, background: novoIcon === ic ? 'var(--surface)' : 'transparent', cursor: 'pointer', fontSize: '0.9rem' }}>
              {ic}
            </button>
          ))}
        </div>
        <input style={{ ...IS, flex: 1 }} value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Novo hábito..." onKeyDown={e => e.key === 'Enter' && addHabito()} />
        <button onClick={addHabito} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add</button>
      </div>
    </div>
  )
}

// ─── Seção 11 — Anexos & Links ────────────────────────────────────────────────
function SecaoAnexos({ uid, data }: { uid: string | null; data: string }) {
  const [links, setLinks] = useState<{ id: string; titulo: string; url: string; tipo: string }[]>([])
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novoUrl, setNovoUrl] = useState('')
  const [novoTipo, setNovoTipo] = useState('link')
  const [saved, setSaved] = useState(true)

  useEffect(() => {
    if (!uid) return
    const db = getDB()
    return onSnapshot(doc(db, 'users', uid, 'journalAnexos', data), snap => {
      setLinks(snap.exists() ? (snap.data().links || []) : [])
    })
  }, [uid, data])

  const save = async (novos: typeof links) => {
    if (!uid) return
    const db = getDB()
    await setDoc(doc(db, 'users', uid, 'journalAnexos', data), { links: novos })
    setSaved(true)
  }

  const add = () => {
    if (!novoUrl.trim()) return
    const novo = [...links, { id: newId(), titulo: novoTitulo || novoUrl, url: novoUrl, tipo: novoTipo }]
    setLinks(novo); save(novo)
    setNovoTitulo(''); setNovoUrl('')
  }

  const TIPO_ICON: Record<string, string> = { link: '🔗', pdf: '📄', video: '▶️', imagem: '🖼️', sei: '📋', referencia: '📎' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {links.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontStyle: 'italic' }}>Nenhum link ou referência adicionado.</p>}
      {links.map(l => (
        <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>{TIPO_ICON[l.tipo] || '🔗'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.titulo}</div>
            <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.65rem', color: 'var(--text-accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{l.url}</a>
          </div>
          <button onClick={() => { const novo = links.filter(x => x.id !== l.id); setLinks(novo); save(novo) }} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.4)', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <select style={{ ...IS, width: 'auto' }} value={novoTipo} onChange={e => setNovoTipo(e.target.value)}>
          {Object.entries(TIPO_ICON).map(([k, v]) => <option key={k} value={k}>{v} {k}</option>)}
        </select>
        <input style={{ ...IS, flex: 1 }} value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)} placeholder="Título (opcional)..." />
        <input style={{ ...IS, flex: 2 }} value={novoUrl} onChange={e => setNovoUrl(e.target.value)} placeholder="URL ou referência..." onKeyDown={e => e.key === 'Enter' && add()} />
        <button onClick={add} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add</button>
      </div>
    </div>
  )
}

// ─── Seção 12 — Relatórios ────────────────────────────────────────────────────
function SecaoRelatorios({ uid }: { uid: string | null }) {
  const [entradas, setEntradas] = useState<Array<{ data: string } & JournalDia>>([])

  useEffect(() => {
    if (!uid) return
    const db = getDB()
    return onSnapshot(collection(db, 'users', uid, 'journal'), snap => {
      const list = snap.docs.map(d => ({ data: d.id, ...d.data() } as any))
        .sort((a: any, b: any) => b.data.localeCompare(a.data))
        .slice(0, 30)
      setEntradas(list)
    })
  }, [uid])

  const totalTasks = entradas.reduce((a, e) => a + (e.planejamento?.length || 0), 0)
  const tasksConcluidas = entradas.reduce((a, e) => a + (e.planejamento?.filter((t: Task) => t.feito).length || 0), 0)
  const totalEstudos = entradas.reduce((a, e) => a + (e.estudos?.length || 0), 0)
  const totalIdeias = entradas.reduce((a, e) => a + (e.ideias?.length || 0), 0)
  const humorMedio = entradas.length > 0 ? (entradas.reduce((a, e) => a + (e.humor || 3), 0) / entradas.length).toFixed(1) : '—'
  const HUMOR_EMOJI = ['', '😢', '😕', '😐', '😊', '😄']

  const diasComRegistro = entradas.filter(e => e.diarioLivre?.trim() || e.planejamento?.length > 0).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 10 }}>
        {[
          { label: 'Dias registrados', val: diasComRegistro, sub: 'últimos 30 dias', color: '#6366f1' },
          { label: 'Taxa tasks', val: totalTasks > 0 ? `${Math.round((tasksConcluidas/totalTasks)*100)}%` : '—', sub: `${tasksConcluidas}/${totalTasks}`, color: '#6ee7a0' },
          { label: 'Notas de estudo', val: totalEstudos, sub: 'total no período', color: '#a78bfa' },
          { label: 'Ideias capturadas', val: totalIdeias, sub: 'total no período', color: '#f59e0b' },
          { label: 'Humor médio', val: humorMedio, sub: HUMOR_EMOJI[Math.round(Number(humorMedio))] || '', color: '#fbbf24' },
        ].map(k => (
          <div key={k.label} style={{ padding: '12px 14px', background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', color: k.color, lineHeight: 1 }}>{k.val}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{k.label}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', opacity: 0.7 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div>
        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Últimas entradas</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {entradas.slice(0, 7).map(e => (
            <div key={e.data} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 9, background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>{e.data}</span>
              <span style={{ fontSize: '1rem' }}>{HUMOR_EMOJI[e.humor] || '😐'}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flex: 1 }}>
                {e.planejamento?.length || 0} tasks · {e.estudos?.length || 0} notas · {e.ideias?.length || 0} ideias
              </span>
              {e.diarioLivre && <span style={{ fontSize: '0.62rem', color: 'var(--text-accent)' }}>✍️</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Hook principal do Journal ────────────────────────────────────────────────
function useJournalDia(uid: string | null, data: string) {
  const [dia, setDia] = useState<JournalDia>(defaultDia())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!uid) return
    const db = getDB()
    getDoc(doc(db, 'users', uid, 'journal', data)).then(snap => {
      if (snap.exists()) setDia({ ...defaultDia(), ...snap.data() as JournalDia })
      else setDia(defaultDia())
    })
  }, [uid, data])

  const update = useCallback((partial: Partial<JournalDia>) => {
    setDia(prev => {
      const next = { ...prev, ...partial, updatedAt: Date.now() }
      setSaved(false)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(async () => {
        if (!uid) return
        const db = getDB()
        setSaving(true)
        await setDoc(doc(db, 'users', uid, 'journal', data), next)
        setSaving(false)
        setSaved(true)
      }, 1200)
      return next
    })
  }, [uid, data])

  return { dia, update, saving, saved }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
interface Props { onNavigate: (id: string) => void }

export default function Diario({ onNavigate }: Props) {
  const uid = useUid()
  const [dataSelecionada, setDataSelecionada] = useState(today())
  const [secaoAtiva, setSecaoAtiva] = useState<string>('dashboard')
  const { dia, update, saving, saved } = useJournalDia(uid, dataSelecionada)
  const isHoje = dataSelecionada === today()

  const irParaOntem = () => {
    const d = new Date(dataSelecionada + 'T12:00:00'); d.setDate(d.getDate() - 1)
    setDataSelecionada(d.toISOString().slice(0, 10))
  }
  const irParaProximo = () => {
    const d = new Date(dataSelecionada + 'T12:00:00'); d.setDate(d.getDate() + 1)
    const nova = d.toISOString().slice(0, 10)
    if (nova <= today()) setDataSelecionada(nova)
  }

  const SECOES = [
    { id: 'dashboard',    icon: '◈', label: 'Visão Geral' },
    { id: 'planejamento', icon: '✅', label: 'Planejamento' },
    { id: 'timeline',     icon: '⏱', label: 'Timeline' },
    { id: 'livre',        icon: '✍️', label: 'Diário Livre' },
    { id: 'estudos',      icon: '📚', label: 'Estudos' },
    { id: 'profissional', icon: '💼', label: 'Profissional' },
    { id: 'ideias',       icon: '💡', label: 'Ideias' },
    { id: 'gratidao',     icon: '🙏', label: 'Gratidão' },
    { id: 'habitos',      icon: '🎯', label: 'Hábitos' },
    { id: 'saude',        icon: '✚', label: 'Saúde' },
    { id: 'anexos',       icon: '📎', label: 'Anexos' },
    { id: 'relatorios',   icon: '📊', label: 'Relatórios' },
  ]

  const HUMOR_EMOJI = ['😢', '😕', '😐', '😊', '😄']
  const HUMOR_COR = ['#ef4444', '#f87171', '#fbbf24', '#a3e635', '#6ee7a0']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* ── BANNER ── */}
      <div style={{ background: `linear-gradient(135deg, ${isHoje ? 'rgba(99,102,241,0.12)' : 'rgba(91,91,214,0.08)'} 0%, transparent 100%)`, borderBottom: '1px solid var(--border-md)', padding: '18px 28px 16px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          {/* Data */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: isHoje ? 'rgba(99,102,241,0.15)' : 'rgba(91,91,214,0.1)', border: `2px solid ${isHoje ? 'rgba(99,102,241,0.4)' : 'rgba(91,91,214,0.3)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.3rem', color: isHoje ? '#818cf8' : '#a5a3f5', lineHeight: 1 }}>{new Date(dataSelecionada + 'T12:00:00').getDate()}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: isHoje ? '#818cf8' : '#a5a3f5', textTransform: 'uppercase' }}>{new Date(dataSelecionada + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}</div>
            </div>
            <div>
              {isHoje && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', marginBottom: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#818cf8' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700, color: '#818cf8', letterSpacing: '0.1em' }}>HOJE</span>
                </div>
              )}
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>{fmtData(dataSelecionada)}</div>
            </div>
          </div>

          {/* Humor rápido + Nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Seletor de humor */}
            <div style={{ display: 'flex', gap: 6, padding: '6px 10px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {HUMOR_EMOJI.map((em, i) => (
                <button key={i} onClick={() => update({ humor: i + 1 })}
                  style={{ width: 32, height: 32, borderRadius: 8, border: `2px solid ${dia.humor === i+1 ? HUMOR_COR[i] : 'transparent'}`, background: dia.humor === i+1 ? `${HUMOR_COR[i]}20` : 'transparent', cursor: 'pointer', fontSize: '1rem', transition: 'all 0.15s', transform: dia.humor === i+1 ? 'scale(1.2)' : 'scale(1)' }}>
                  {em}
                </button>
              ))}
            </div>

            {/* Nav dias */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={irParaOntem} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem' }}>‹</button>
              <input type="date" value={dataSelecionada} max={today()} onChange={e => setDataSelecionada(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.75rem', outline: 'none' }} />
              <button onClick={irParaProximo} disabled={dataSelecionada >= today()} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-md)', background: 'var(--surface)', color: dataSelecionada >= today() ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: dataSelecionada >= today() ? 'not-allowed' : 'pointer', fontSize: '1rem', opacity: dataSelecionada >= today() ? 0.4 : 1 }}>›</button>
            </div>

            {/* Status sync */}
            <div style={{ fontSize: '0.62rem', color: saving ? '#fbbf24' : saved ? '#6ee7a0' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {saving ? '↻ Salvando…' : saved ? '✓ Salvo' : '○ Editando'}
            </div>
          </div>
        </div>

        {/* Frase do dia */}
        <div style={{ marginTop: 14 }}>
          <input style={{ ...IS, background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', borderRadius: 0, padding: '6px 0', fontStyle: 'italic', fontSize: '0.88rem', color: 'var(--text-secondary)' }}
            value={dia.fraseDoDia} onChange={e => update({ fraseDoDia: e.target.value })} placeholder="✨ Qual é a sua intenção para hoje?" />
        </div>
      </div>

      {/* ── NAVEGAÇÃO DAS SEÇÕES ── */}
      <div style={{ borderBottom: '1px solid var(--border-md)', overflowX: 'auto', flexShrink: 0 }}>
        <div style={{ display: 'flex', padding: '0 20px', gap: 0, minWidth: 'max-content' }}>
          {SECOES.map(s => (
            <button key={s.id} onClick={() => setSecaoAtiva(s.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '10px 14px', border: 'none', background: 'transparent', color: secaoAtiva === s.id ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: secaoAtiva === s.id ? 700 : 500, fontSize: '0.78rem', cursor: 'pointer', borderBottom: secaoAtiva === s.id ? '2px solid #6366f1' : '2px solid transparent', marginBottom: -1, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: '0.85rem' }}>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTEÚDO DAS SEÇÕES ── */}
      <div style={{ flex: 1, padding: '20px 28px', overflowY: 'auto' }}>
        {secaoAtiva === 'dashboard' && (
          <Card>
            <SectionTitle icon="◈" title="Visão Geral do Dia" />
            <SecaoDashboard dia={dia} data={dataSelecionada} />
          </Card>
        )}

        {secaoAtiva === 'planejamento' && (
          <Card>
            <SectionTitle icon="✅" title="Planejamento Diário" count={dia.planejamento.length} />
            <SecaoPlanejamento tasks={dia.planejamento} onChange={t => update({ planejamento: t })} />
          </Card>
        )}

        {secaoAtiva === 'timeline' && (
          <Card>
            <SectionTitle icon="⏱" title="Timeline de Atividades" count={dia.timeline.length} />
            <SecaoTimeline eventos={dia.timeline} onChange={e => update({ timeline: e })} />
          </Card>
        )}

        {secaoAtiva === 'livre' && (
          <Card>
            <SectionTitle icon="✍️" title="Diário Livre" />
            <SecaoDiarioLivre texto={dia.diarioLivre} onChange={t => update({ diarioLivre: t })} onNavigate={onNavigate} />
          </Card>
        )}

        {secaoAtiva === 'estudos' && (
          <Card>
            <SectionTitle icon="📚" title="Diário de Estudos" count={dia.estudos.length} />
            <SecaoEstudos notas={dia.estudos} onChange={n => update({ estudos: n })} onNavigate={onNavigate} />
          </Card>
        )}

        {secaoAtiva === 'profissional' && (
          <Card>
            <SectionTitle icon="💼" title="Diário Profissional" count={dia.profissional.length} />
            <SecaoProfissional logs={dia.profissional} onChange={l => update({ profissional: l })} />
          </Card>
        )}

        {secaoAtiva === 'ideias' && (
          <Card>
            <SectionTitle icon="💡" title="Registro de Ideias" count={dia.ideias.length} />
            <SecaoIdeias ideias={dia.ideias} onChange={i => update({ ideias: i })} />
          </Card>
        )}

        {secaoAtiva === 'gratidao' && (
          <Card>
            <SectionTitle icon="🙏" title="Gratidão & Reflexões" />
            <SecaoGratidao gratidao={dia.gratidao} reflexao={dia.reflexao} meta={dia.meta} onChange={(g, r, m) => update({ gratidao: g, reflexao: r, meta: m })} />
          </Card>
        )}

        {secaoAtiva === 'habitos' && (
          <Card>
            <SectionTitle icon="🎯" title="Metas & Hábitos" />
            <SecaoHabitos uid={uid} data={dataSelecionada} />
          </Card>
        )}

        {secaoAtiva === 'saude' && (
          <Card>
            <SectionTitle icon="✚" title="Saúde & Bem-Estar" />
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '0.85rem', marginBottom: 16 }}>Os dados de saúde são registrados no módulo dedicado.</p>
              <button onClick={() => onNavigate('saude')} style={{ padding: '10px 24px', borderRadius: 10, border: '1px solid rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.08)', color: '#34d399', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                → Abrir Saúde & Bem-Estar
              </button>
            </div>
          </Card>
        )}

        {secaoAtiva === 'anexos' && (
          <Card>
            <SectionTitle icon="📎" title="Anexos & Referências" />
            <SecaoAnexos uid={uid} data={dataSelecionada} />
          </Card>
        )}

        {secaoAtiva === 'relatorios' && (
          <Card>
            <SectionTitle icon="📊" title="Relatórios & Insights" />
            <SecaoRelatorios uid={uid} />
          </Card>
        )}
      </div>
    </div>
  )
}
