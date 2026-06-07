// GestorEditais.tsx — hub central de editais
import { useState, useEffect } from 'react'
import { collection, doc, setDoc, deleteDoc, onSnapshot, getFirestore } from 'firebase/firestore'
import { getApp } from 'firebase/app'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { useEdital } from '../../hooks/useEdital'
import type { EditalCadastrado, DisciplinaEdital, SubtopicoEdital } from '../../hooks/useEdital'
import { AGU_DISCIPLINAS } from './aguData'
import EditalDetalhe from './EditalDetalhe'

function getDB() { return getFirestore(getApp() as any) }
function useUid() {
  const [uid, setUid] = useState<string | null>(null)
  useEffect(() => {
    return onAuthStateChanged(getAuth(getApp() as any), u => setUid(u?.uid ?? null))
  }, [])
  return uid
}

// ─── Converte dados AGU hardcoded para o formato genérico ─────────────────────
function aguParaEdital(): EditalCadastrado {
  return {
    id: 'agu-advogado-uniao',
    nome: 'Advogado da União',
    orgao: 'AGU',
    cargo: 'Advogado da União',
    ano: '2025',
    cor: '#4f46e5',
    descricao: 'Concurso para o cargo de Advogado da União na Advocacia-Geral da União.',
    disciplinas: AGU_DISCIPLINAS.map(d => ({
      id: d.id,
      nome: d.nome,
      cor: d.cor,
      topicos: d.topicos.map(t => ({
        id: t.id,
        nome: t.nome,
        subtopicos: t.subtopicos.map(s => ({ id: s.id, nome: s.nome })),
      })),
    })),
    criadoEm: 0, // fixo para aparecer primeiro
  }
}

const AGU_EDITAL = aguParaEdital()

// ─── Helpers ──────────────────────────────────────────────────────────────────
function newId() { return Math.random().toString(36).slice(2, 10) }

const CORES_DISPONIVEIS = [
  '#4f46e5','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#ec4899','#14b8a6','#f97316','#6366f1','#84cc16','#06b6d4',
]

const IS: React.CSSProperties = {
  background: 'var(--input-bg)', border: '1px solid var(--border-md)',
  borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)',
  fontSize: '0.82rem', width: '100%', outline: 'none', boxSizing: 'border-box',
}
function Lbl({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>{children}</label>
}
function Sec({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 12px' }}>
      <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-md)' }} />
    </div>
  )
}
function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {children}
    </div>
  )
}

// ─── Modal de cadastro de edital ──────────────────────────────────────────────
function ModalEdital({ uid, edital, onClose }: {
  uid: string | null
  edital: EditalCadastrado | null
  onClose: () => void
}) {
  const isEdit = !!edital
  const [nome, setNome] = useState(edital?.nome || '')
  const [orgao, setOrgao] = useState(edital?.orgao || '')
  const [cargo, setCargo] = useState(edital?.cargo || '')
  const [ano, setAno] = useState(edital?.ano || new Date().getFullYear().toString())
  const [dataProva, setDataProva] = useState(edital?.dataProva || '')
  const [cor, setCor] = useState(edital?.cor || CORES_DISPONIVEIS[0])
  const [descricao, setDescricao] = useState(edital?.descricao || '')
  const [disciplinas, setDisciplinas] = useState<DisciplinaEdital[]>(edital?.disciplinas || [])
  const [saving, setSaving] = useState(false)

  // Estado para adicionar disciplina/tópico/subtópico
  const [novaDisc, setNovaDisc] = useState('')
  const [novaDiscCor, setNovaDiscCor] = useState(CORES_DISPONIVEIS[1])
  const [expandedDisc, setExpandedDisc] = useState<string | null>(null)
  const [novoTopico, setNovoTopico] = useState<Record<string, string>>({})
  const [expandedTopico, setExpandedTopico] = useState<string | null>(null)
  const [novoSub, setNovoSub] = useState<Record<string, string>>({})

  // Parser de texto em massa (subtópicos)
  const [modoParse, setModoParse] = useState<string | null>(null)
  const [textoParseado, setTextoParseado] = useState('')

  const addDisciplina = () => {
    if (!novaDisc.trim()) return
    const id = `disc-${newId()}`
    setDisciplinas(prev => [...prev, { id, nome: novaDisc.trim(), cor: novaDiscCor, topicos: [] }])
    setNovaDisc('')
    setExpandedDisc(id)
  }

  const removeDisciplina = (discId: string) => setDisciplinas(prev => prev.filter(d => d.id !== discId))

  const addTopico = (discId: string) => {
    const nome = novoTopico[discId]
    if (!nome?.trim()) return
    setDisciplinas(prev => prev.map(d => d.id !== discId ? d : {
      ...d, topicos: [...d.topicos, { id: `top-${newId()}`, nome: nome.trim(), subtopicos: [] }]
    }))
    setNovoTopico(prev => ({ ...prev, [discId]: '' }))
  }

  const removeTopico = (discId: string, topId: string) => setDisciplinas(prev => prev.map(d =>
    d.id !== discId ? d : { ...d, topicos: d.topicos.filter(t => t.id !== topId) }
  ))

  const addSubtopico = (discId: string, topId: string) => {
    const nome = novoSub[topId]
    if (!nome?.trim()) return
    setDisciplinas(prev => prev.map(d => d.id !== discId ? d : {
      ...d, topicos: d.topicos.map(t => t.id !== topId ? t : {
        ...t, subtopicos: [...t.subtopicos, { id: `sub-${newId()}`, nome: nome.trim() }]
      })
    }))
    setNovoSub(prev => ({ ...prev, [topId]: '' }))
  }

  const removeSubtopico = (discId: string, topId: string, subId: string) => setDisciplinas(prev => prev.map(d =>
    d.id !== discId ? d : {
      ...d, topicos: d.topicos.map(t => t.id !== topId ? t : {
        ...t, subtopicos: t.subtopicos.filter(s => s.id !== subId)
      })
    }
  ))

  // Parser em massa: cada linha = 1 subtópico
  const aplicarParse = (topId: string, discId: string) => {
    const linhas = textoParseado.split('\n').map(l => l.trim()).filter(Boolean)
    const novos: SubtopicoEdital[] = linhas.map(nome => ({ id: `sub-${newId()}`, nome }))
    setDisciplinas(prev => prev.map(d => d.id !== discId ? d : {
      ...d, topicos: d.topicos.map(t => t.id !== topId ? t : {
        ...t, subtopicos: [...t.subtopicos, ...novos]
      })
    }))
    setModoParse(null)
    setTextoParseado('')
  }

  const totalSubtopicos = disciplinas.reduce((a, d) => a + d.topicos.reduce((b, t) => b + t.subtopicos.length, 0), 0)

  const save = async () => {
    if (!uid || !nome.trim()) return
    setSaving(true)
    const id = isEdit ? edital!.id : `edital-${newId()}`
    const payload: EditalCadastrado = {
      id, nome, orgao, cargo, ano, dataProva: dataProva || undefined,
      cor, descricao: descricao || undefined, disciplinas,
      criadoEm: edital?.criadoEm || Date.now(),
    }
    await setDoc(doc(getDB(), 'users', uid, 'editais', id), payload)
    setSaving(false)
    onClose()
  }

  const del = async () => {
    if (!uid || !edital) return
    await deleteDoc(doc(getDB(), 'users', uid, 'editais', edital.id))
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 18, width: '100%', maxWidth: 780, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: `linear-gradient(135deg, ${cor}10, transparent)` }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
              {isEdit ? 'Editar Edital' : 'Novo Edital'}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {disciplinas.length} disciplinas · {totalSubtopicos} subtópicos
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Sec title="Identificação" />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div><Lbl>Nome do concurso *</Lbl><input style={IS} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Advogado da União" /></div>
            <div><Lbl>Ano</Lbl><input style={IS} value={ano} onChange={e => setAno(e.target.value)} placeholder="2025" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><Lbl>Órgão</Lbl><input style={IS} value={orgao} onChange={e => setOrgao(e.target.value)} placeholder="Ex: AGU, TRF, STJ..." /></div>
            <div><Lbl>Cargo</Lbl><input style={IS} value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Ex: Advogado, Analista..." /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><Lbl>Data da prova</Lbl><input type="date" style={IS} value={dataProva} onChange={e => setDataProva(e.target.value)} /></div>
            <div>
              <Lbl>Cor do edital</Lbl>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CORES_DISPONIVEIS.map(c => (
                  <button key={c} onClick={() => setCor(c)}
                    style={{ width: 28, height: 28, borderRadius: 8, background: c, border: `2px solid ${cor === c ? '#fff' : 'transparent'}`, cursor: 'pointer', boxShadow: cor === c ? `0 0 10px ${c}` : 'none', transition: 'all 0.15s' }} />
                ))}
              </div>
            </div>
          </div>
          <div><Lbl>Descrição</Lbl><textarea style={{ ...IS, minHeight: 56, resize: 'vertical' }} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Observações sobre o edital..." /></div>

          {/* Disciplinas */}
          <Sec title={`Disciplinas & Conteúdo (${totalSubtopicos} subtópicos)`} />
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '8px 12px' }}>
            💡 Dica: dentro de cada tópico você pode colar uma lista de subtópicos em massa (um por linha) usando o botão <strong>📋 Colar em massa</strong>.
          </div>

          {/* Lista de disciplinas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {disciplinas.map(disc => (
              <div key={disc.id} style={{ border: `1px solid ${disc.cor}40`, borderRadius: 12, overflow: 'hidden' }}>
                {/* Header disciplina */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: `${disc.cor}10`, cursor: 'pointer' }}
                  onClick={() => setExpandedDisc(expandedDisc === disc.id ? null : disc.id)}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: disc.cor, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{disc.nome}</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{disc.topicos.length} tópicos · {disc.topicos.reduce((a, t) => a + t.subtopicos.length, 0)} subtópicos</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: expandedDisc === disc.id ? 'rotate(90deg)' : 'none' }}>▶</span>
                  <button onClick={e => { e.stopPropagation(); removeDisciplina(disc.id) }} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.4)', cursor: 'pointer', fontSize: '0.9rem', padding: '0 4px' }}>✕</button>
                </div>

                {expandedDisc === disc.id && (
                  <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {disc.topicos.map(top => (
                      <div key={top.id} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'var(--surface)', cursor: 'pointer' }}
                          onClick={() => setExpandedTopico(expandedTopico === top.id ? null : top.id)}>
                          <span style={{ flex: 1, fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{top.nome}</span>
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{top.subtopicos.length} sub</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: expandedTopico === top.id ? 'rotate(90deg)' : 'none' }}>▶</span>
                          <button onClick={e => { e.stopPropagation(); removeTopico(disc.id, top.id) }} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.4)', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
                        </div>

                        {expandedTopico === top.id && (
                          <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {top.subtopicos.map(sub => (
                              <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', padding: '4px 8px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                                <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{sub.nome}</span>
                                <button onClick={() => removeSubtopico(disc.id, top.id, sub.id)} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.4)', cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                              </div>
                            ))}

                            {modoParse === top.id ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <textarea
                                  value={textoParseado}
                                  onChange={e => setTextoParseado(e.target.value)}
                                  placeholder="Cole aqui os subtópicos, um por linha:&#10;Conceito e classificações&#10;Princípios fundamentais&#10;Regime jurídico..."
                                  style={{ ...IS, minHeight: 120, resize: 'vertical', fontSize: '0.75rem', lineHeight: 1.6 }}
                                />
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button onClick={() => aplicarParse(top.id, disc.id)}
                                    style={{ flex: 1, padding: '6px', borderRadius: 7, border: 'none', background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                                    ✓ Aplicar ({textoParseado.split('\n').filter(l => l.trim()).length} itens)
                                  </button>
                                  <button onClick={() => { setModoParse(null); setTextoParseado('') }}
                                    style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border-md)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer' }}>
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input
                                  style={{ ...IS, fontSize: '0.75rem', flex: 1 }}
                                  value={novoSub[top.id] || ''}
                                  onChange={e => setNovoSub(prev => ({ ...prev, [top.id]: e.target.value }))}
                                  placeholder="Nome do subtópico..."
                                  onKeyDown={e => e.key === 'Enter' && addSubtopico(disc.id, top.id)}
                                />
                                <button onClick={() => addSubtopico(disc.id, top.id)}
                                  style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: `${disc.cor}20`, color: disc.cor, fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  + Add
                                </button>
                                <button onClick={() => { setModoParse(top.id); setTextoParseado('') }}
                                  title="Colar vários subtópicos de uma vez"
                                  style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)', color: '#818cf8', fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  📋 Em massa
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Adicionar tópico */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        style={{ ...IS, fontSize: '0.75rem', flex: 1 }}
                        value={novoTopico[disc.id] || ''}
                        onChange={e => setNovoTopico(prev => ({ ...prev, [disc.id]: e.target.value }))}
                        placeholder="+ Novo tópico..."
                        onKeyDown={e => e.key === 'Enter' && addTopico(disc.id)}
                      />
                      <button onClick={() => addTopico(disc.id)}
                        style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${disc.cor}40`, background: `${disc.cor}10`, color: disc.cor, fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        + Tópico
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Adicionar disciplina */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 12, border: '1px dashed var(--border-md)', background: 'var(--surface)' }}>
            <input style={{ ...IS, flex: 1 }} value={novaDisc} onChange={e => setNovaDisc(e.target.value)} placeholder="+ Nova disciplina..." onKeyDown={e => e.key === 'Enter' && addDisciplina()} />
            <div style={{ display: 'flex', gap: 4 }}>
              {CORES_DISPONIVEIS.slice(0, 6).map(c => (
                <button key={c} onClick={() => setNovaDiscCor(c)}
                  style={{ width: 20, height: 20, borderRadius: 5, background: c, border: `2px solid ${novaDiscCor === c ? '#fff' : 'transparent'}`, cursor: 'pointer', transition: 'all 0.1s' }} />
              ))}
            </div>
            <button onClick={addDisciplina}
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              + Disciplina
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-md)', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>{isEdit && edital.id !== 'agu-advogado-uniao' && (
            <button onClick={del} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', color: '#f87171', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}>Excluir Edital</button>
          )}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={save} disabled={saving || !nome.trim()}
              style={{ padding: '8px 22px', borderRadius: 8, background: `linear-gradient(135deg,${cor},${cor}cc)`, border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', opacity: !nome.trim() ? 0.5 : 1 }}>
              {saving ? 'Salvando…' : isEdit ? 'Salvar Alterações' : 'Criar Edital'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Card de edital ───────────────────────────────────────────────────────────
function EditalCard({ edital, onAbrir, onEditar, hooks }: {
  edital: EditalCadastrado
  onAbrir: () => void
  onEditar: () => void
  hooks: ReturnType<typeof useEdital>
}) {
  const allIds = edital.disciplinas.flatMap(d => d.topicos.flatMap(t => t.subtopicos.map(s => s.id)))
  const stats = hooks.getStats(allIds)
  const isAGU = edital.id === 'agu-advogado-uniao'
  const diasProva = edital.dataProva
    ? Math.ceil((new Date(edital.dataProva).getTime() - Date.now()) / 86400000)
    : null

  return (
    <div
      onClick={onAbrir}
      style={{
        background: 'var(--card-bg)', border: `1px solid ${edital.cor}35`,
        borderRadius: 18, padding: 0, overflow: 'hidden',
        cursor: 'pointer', transition: 'all 0.2s',
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = `0 12px 40px ${edital.cor}25, 0 0 0 1px ${edital.cor}40`
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = 'none'
        ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
      }}
    >
      {/* Banner colorido */}
      <div style={{
        height: 6,
        background: `linear-gradient(90deg, ${edital.cor}, ${edital.cor}66)`,
      }} />

      <div style={{ padding: '20px 22px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              {isAGU && (
                <span style={{ fontSize: '0.6rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(79,70,229,0.15)', color: '#818cf8', border: '1px solid rgba(79,70,229,0.3)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  AGU
                </span>
              )}
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{edital.orgao} · {edital.ano}</span>
              {diasProva !== null && diasProva > 0 && (
                <span style={{
                  fontSize: '0.62rem', padding: '2px 8px', borderRadius: 20,
                  background: diasProva <= 30 ? 'rgba(239,68,68,0.12)' : diasProva <= 60 ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.1)',
                  color: diasProva <= 30 ? '#f87171' : diasProva <= 60 ? '#fbbf24' : '#6ee7a0',
                  border: `1px solid ${diasProva <= 30 ? 'rgba(239,68,68,0.3)' : diasProva <= 60 ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.25)'}`,
                  fontWeight: 700,
                }}>
                  📅 {diasProva}d para prova
                </span>
              )}
              {diasProva !== null && diasProva <= 0 && (
                <span style={{ fontSize: '0.62rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(107,114,128,0.12)', color: '#9ca3af', border: '1px solid rgba(107,114,128,0.25)', fontWeight: 700 }}>
                  Prova realizada
                </span>
              )}
            </div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>
              {edital.nome}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{edital.cargo}</p>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onEditar() }}
            style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = edital.cor; (e.currentTarget as HTMLElement).style.color = edital.cor }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}>
            ✏ Editar
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {[
            { label: 'Disciplinas', v: edital.disciplinas.length, color: edital.cor },
            { label: 'Subtópicos', v: allIds.length, color: 'var(--text-secondary)' },
            { label: 'Concluídos', v: stats.concluidos, color: '#10b981' },
            { label: 'Questões', v: stats.questoes, color: '#7c3aed' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: s.color as string, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Progresso */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Progresso geral</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: edital.cor, fontFamily: 'var(--font-mono)' }}>{stats.pctConcluido}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-4)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${stats.pctConcluido}%`, background: `linear-gradient(90deg, ${edital.cor}, ${edital.cor}aa)`, borderRadius: 4, transition: 'width 0.6s ease', boxShadow: `0 0 12px ${edital.cor}60` }} />
          </div>
        </div>

        {/* Acerto */}
        {stats.questoes > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            <span>📝 {stats.questoes} questões</span>
            <span style={{ color: stats.pctAcerto >= 70 ? '#10b981' : stats.pctAcerto >= 50 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>
              {stats.pctAcerto}% acerto
            </span>
          </div>
        )}

        {/* Descrição */}
        {edital.descricao && (
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {edital.descricao}
          </p>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 22px', borderTop: `1px solid ${edital.cor}20`, background: `${edital.cor}06`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          {edital.disciplinas.length} disciplinas · {allIds.length} subtópicos
        </span>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: edital.cor }}>
          Abrir edital →
        </span>
      </div>
    </div>
  )
}

// Wrapper para carregar o hook por edital individualmente
function EditalCardWrapper({ edital, onAbrir, onEditar }: {
  edital: EditalCadastrado
  onAbrir: () => void
  onEditar: () => void
}) {
  const hooks = useEdital(edital.id)
  return <EditalCard edital={edital} onAbrir={onAbrir} onEditar={onEditar} hooks={hooks} />
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function GestorEditais() {
  const uid = useUid()
  const [editaisCustom, setEditaisCustom] = useState<EditalCadastrado[]>([])
  const [loading, setLoading] = useState(true)
  const [editalAberto, setEditalAberto] = useState<EditalCadastrado | null>(null)
  const [modalEdital, setModalEdital] = useState(false)
  const [editandoEdital, setEditandoEdital] = useState<EditalCadastrado | null>(null)

  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(getDB(), 'users', uid, 'editais'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as EditalCadastrado))
        .filter(e => e.id !== 'agu-advogado-uniao') // AGU já vem hardcoded
        .sort((a, b) => b.criadoEm - a.criadoEm)
      setEditaisCustom(list)
      setLoading(false)
    })
  }, [uid])

  // AGU sempre primeiro, depois os customizados
  const todosEditais = [AGU_EDITAL, ...editaisCustom]

  // Se há um edital aberto, mostrar o detalhe
  if (editalAberto) {
    return <EditalDetalhe edital={editalAberto} onVoltar={() => setEditalAberto(null)} />
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#4f46e5', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Banner */}
      <div style={{ background: 'linear-gradient(135deg, rgba(79,70,229,0.12) 0%, rgba(99,102,241,0.06) 50%, transparent 100%)', borderBottom: '1px solid rgba(79,70,229,0.2)', padding: '20px 28px 18px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,70,229,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', color: 'var(--text-primary)' }}>Editais</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {todosEditais.length} edital{todosEditais.length !== 1 ? 'is' : ''} cadastrado{todosEditais.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={() => { setEditandoEdital(null); setModalEdital(true) }}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(79,70,229,0.35)' }}>
            + Novo Edital
          </button>
        </div>

        {/* KPIs globais */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          {[
            { icon: '📋', label: 'Editais', val: todosEditais.length, color: '#818cf8' },
            { icon: '📚', label: 'Disciplinas', val: todosEditais.reduce((a, e) => a + e.disciplinas.length, 0), color: '#60a5fa' },
            { icon: '📝', label: 'Subtópicos', val: todosEditais.reduce((a, e) => a + e.disciplinas.flatMap(d => d.topicos.flatMap(t => t.subtopicos)).length, 0), color: '#34d399' },
          ].map(k => (
            <div key={k.label} style={{ padding: '7px 14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{k.icon}</span>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.val}</div>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 1 }}>{k.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grid de editais */}
      <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto' }}>
        {todosEditais.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>⚖️</div>
            <p style={{ fontSize: '0.88rem', marginBottom: 20 }}>Nenhum edital cadastrado ainda</p>
            <button onClick={() => { setEditandoEdital(null); setModalEdital(true) }}
              style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
              + Criar primeiro edital
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 18 }}>
            {todosEditais.map(e => (
              <EditalCardWrapper
                key={e.id}
                edital={e}
                onAbrir={() => setEditalAberto(e)}
                onEditar={() => { setEditandoEdital(e); setModalEdital(true) }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalEdital && (
        <ModalEdital uid={uid} edital={editandoEdital} onClose={() => { setModalEdital(false); setEditandoEdital(null) }} />
      )}
    </div>
  )
}
