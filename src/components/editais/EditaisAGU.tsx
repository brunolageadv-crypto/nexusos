import { useState, useMemo } from 'react'
import { AGU_DISCIPLINAS, TOTAL_SUBTOPICOS } from './aguData'
import { useEditaisAGU } from '../../hooks/useEditaisAGU'
import type { StatusMaterial, SimuladoEntry } from '../../hooks/useEditaisAGU'

// ── helpers ──────────────────────────────────────────────────────────────────

const STATUS_MATERIAL: { value: StatusMaterial; label: string; color: string }[] = [
  { value: 'nao_iniciado', label: 'Não iniciado', color: '#888899' },
  { value: 'iniciado',     label: 'Iniciado',     color: '#EF9F27' },
  { value: 'concluido',    label: 'Concluído',     color: '#1D9E75' },
]

function nextStatus(s: StatusMaterial): StatusMaterial {
  if (s === 'nao_iniciado') return 'iniciado'
  if (s === 'iniciado') return 'concluido'
  return 'nao_iniciado'
}

function StatusBadge({ status, onClick }: { status: StatusMaterial; onClick?: () => void }) {
  const s = STATUS_MATERIAL.find(x => x.value === status)!
  return (
    <button onClick={onClick} style={{
      padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: s.color + '22', color: s.color, border: `1px solid ${s.color}55`,
      cursor: onClick ? 'pointer' : 'default', whiteSpace: 'nowrap',
      transition: 'all 0.15s',
    }}>
      {s.label}
    </button>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 5, background: 'var(--border-dim)', borderRadius: 99, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.4s' }} />
    </div>
  )
}

function uid() { return Math.random().toString(36).slice(2) }

// ── Simulados Modal ───────────────────────────────────────────────────────────

function SimuladosModal({ simulados, onSave, onDelete, onClose }: {
  simulados: SimuladoEntry[]
  onSave: (s: SimuladoEntry) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const empty: SimuladoEntry = { id: '', data: '', banca: '', totalQuestoes: 0, acertos: 0, erros: 0, branco: 0, tempoMinutos: 0, pioresDisciplinas: '', observacoes: '' }
  const [form, setForm] = useState<SimuladoEntry>(empty)
  const [editing, setEditing] = useState(false)

  const pct = form.totalQuestoes > 0 ? Math.round((form.acertos / form.totalQuestoes) * 100) : 0

  function submit() {
    if (!form.data || !form.banca) return
    onSave({ ...form, id: form.id || uid() })
    setForm(empty); setEditing(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 700, maxHeight: '90vh', overflow: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Controle de Simulados</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>

        {/* Form */}
        {editing && (
          <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              ['data', 'Data', 'date'],
              ['banca', 'Banca/Instituição', 'text'],
              ['totalQuestoes', 'Total Questões', 'number'],
              ['acertos', 'Acertos', 'number'],
              ['erros', 'Erros', 'number'],
              ['branco', 'Em Branco', 'number'],
              ['tempoMinutos', 'Tempo (min)', 'number'],
            ].map(([k, l, t]) => (
              <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l}</span>
                <input type={t as string} value={(form (form as unknown as Record<string, string | number>)[k as string]}
                  onChange={e => setForm(f => ({ ...f, [k as string]: t === 'number' ? Number(e.target.value) : e.target.value }))}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13 }} />
              </label>
            ))}
            <label style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Top 3 Piores Disciplinas</span>
              <input value={form.pioresDisciplinas} onChange={e => setForm(f => ({ ...f, pioresDisciplinas: e.target.value }))}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13 }} />
            </label>
            <label style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Observações / Plano de Ação</span>
              <textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical' }} />
            </label>
            {pct > 0 && <div style={{ gridColumn: '1/-1', fontSize: 12, color: 'var(--text-muted)' }}>% Acerto: <strong style={{ color: pct >= 70 ? 'var(--green)' : 'var(--red)' }}>{pct}%</strong></div>}
            <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8 }}>
              <button onClick={submit} style={{ padding: '7px 18px', borderRadius: 8, background: 'var(--purple)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Salvar</button>
              <button onClick={() => { setForm(empty); setEditing(false) }} style={{ padding: '7px 18px', borderRadius: 8, background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            </div>
          </div>
        )}

        {!editing && (
          <button onClick={() => setEditing(true)} style={{ marginBottom: 16, padding: '7px 16px', borderRadius: 8, background: 'var(--purple-dim)', color: 'var(--purple)', border: '1px solid var(--purple)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            + Novo Simulado
          </button>
        )}

        {/* List */}
        {simulados.length === 0
          ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum simulado registrado ainda.</p>
          : simulados.map(s => {
              const p = s.totalQuestoes > 0 ? Math.round((s.acertos / s.totalQuestoes) * 100) : 0
              return (
                <div key={s.id} style={{ border: '0.5px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{s.banca}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.data}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: p >= 70 ? 'var(--green)' : p >= 50 ? 'var(--amber)' : 'var(--red)' }}>{p}%</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {s.acertos}/{s.totalQuestoes} acertos · {s.tempoMinutos}min
                      {s.pioresDisciplinas && ` · ⚠ ${s.pioresDisciplinas}`}
                    </div>
                  </div>
                  <button onClick={() => { setForm(s); setEditing(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14 }}>✏️</button>
                  <button onClick={() => onDelete(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 14 }}>🗑</button>
                </div>
              )
            })
        }
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function EditaisAGU() {
  const { progress, simulados, loading, saveProgress, saveSimulado, deleteSimulado, stats } = useEditaisAGU()
  const [activeDisciplina, setActiveDisciplina] = useState(AGU_DISCIPLINAS[0].id)
  const [expandedTopicos, setExpandedTopicos] = useState<Set<string>>(new Set())
  const [showSimulados, setShowSimulados] = useState(false)
  const [activeTab, setActiveTab] = useState<'estudos' | 'dashboard'>('estudos')

  const disciplina = AGU_DISCIPLINAS.find(d => d.id === activeDisciplina)!

  function toggleTopico(id: string) {
    setExpandedTopicos(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  // Per-disciplina progress
  const discStats = useMemo(() => {
    return AGU_DISCIPLINAS.map(d => {
      const subts = d.topicos.flatMap(t => t.subtopicos)
      const total = subts.length
      const conc = subts.filter(s => progress[s.id]?.statusMaterial === 'concluido').length
      const inic = subts.filter(s => progress[s.id]?.statusMaterial === 'iniciado').length
      return { id: d.id, nome: d.nome, cor: d.cor, total, conc, inic, pct: total > 0 ? Math.round((conc / total) * 100) : 0 }
    })
  }, [progress])

  const globalPct = Math.round((stats.concluidos / TOTAL_SUBTOPICOS) * 100)

  if (loading) return <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Carregando...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>AGU — Advogado da União</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Conteúdo programático completo · 14 disciplinas · {TOTAL_SUBTOPICOS} subtópicos</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowSimulados(true)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              📊 Simulados ({simulados.length})
            </button>
          </div>
        </div>

        {/* Global progress */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Progresso geral — subtópicos concluídos</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{stats.concluidos}/{TOTAL_SUBTOPICOS} ({globalPct}%)</span>
          </div>
          <ProgressBar pct={globalPct} color="var(--purple)" />
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginTop: 12 }}>
          {[
            ['Concluídos', stats.concluidos, 'var(--green)'],
            ['Em andamento', stats.iniciados, 'var(--amber)'],
            ['Questões feitas', stats.totalQuestoes, 'var(--purple)'],
            ['% Acerto', `${stats.pctAcerto}%`, stats.pctAcerto >= 70 ? 'var(--green)' : stats.pctAcerto >= 50 ? 'var(--amber)' : 'var(--red)'],
          ].map(([l, v, c]) => (
            <div key={l as string} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px' }}>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{l}</p>
              <p style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: c as string }}>{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {[['estudos', '📚 Estudos'], ['dashboard', '📈 Por Disciplina']].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id as typeof activeTab)}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: activeTab === id ? 'var(--purple-dim)' : 'var(--surface)',
              color: activeTab === id ? 'var(--purple)' : 'var(--text-muted)' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
          {discStats.map(d => (
            <div key={d.id} onClick={() => { setActiveDisciplina(d.id); setActiveTab('estudos') }}
              style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = d.cor)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{d.nome}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: d.cor }}>{d.pct}%</span>
              </div>
              <ProgressBar pct={d.pct} color={d.cor} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {d.conc} concluídos · {d.inic} em andamento · {d.total} total
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Estudos Tab */}
      {activeTab === 'estudos' && (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12 }}>
          {/* Sidebar disciplinas */}
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 10, padding: 8, height: 'fit-content', position: 'sticky', top: 0 }}>
            {AGU_DISCIPLINAS.map(d => {
              const ds = discStats.find(x => x.id === d.id)!
              return (
                <button key={d.id} onClick={() => setActiveDisciplina(d.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 7, border: 'none',
                    background: activeDisciplina === d.id ? d.cor + '20' : 'transparent',
                    color: activeDisciplina === d.id ? d.cor : 'var(--text-muted)',
                    cursor: 'pointer', fontSize: 12, fontWeight: activeDisciplina === d.id ? 700 : 400, textAlign: 'left', marginBottom: 1,
                    transition: 'all 0.15s' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.cor, flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nome.split(' ').slice(-1)[0]}</span>
                  <span style={{ fontSize: 10, fontWeight: 700 }}>{ds.pct}%</span>
                </button>
              )
            })}
          </div>

          {/* Topicos */}
          <div>
            <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderLeft: `4px solid ${disciplina.cor}`, borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: disciplina.cor }}>{disciplina.nome}</h3>
              {(() => {
                const ds = discStats.find(x => x.id === disciplina.id)!
                return <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{ds.conc}/{ds.total} subtópicos concluídos ({ds.pct}%)</p>
              })()}
            </div>

            {disciplina.topicos.map(topico => {
              const expanded = expandedTopicos.has(topico.id)
              const concTopico = topico.subtopicos.filter(s => progress[s.id]?.statusMaterial === 'concluido').length
              const pctTopico = Math.round((concTopico / topico.subtopicos.length) * 100)

              return (
                <div key={topico.id} style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
                  <button onClick={() => toggleTopico(topico.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12, transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{topico.nome}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{concTopico}/{topico.subtopicos.length}</span>
                    <div style={{ width: 80 }}><ProgressBar pct={pctTopico} color={disciplina.cor} /></div>
                  </button>

                  {expanded && (
                    <div style={{ borderTop: '0.5px solid var(--border)' }}>
                      {/* Header */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 60px 80px 80px 60px', gap: 8, padding: '6px 14px', background: 'var(--surface2)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                        <span>Subtópico</span>
                        <span>Material</span>
                        <span>Resumo</span>
                        <span>Fichado</span>
                        <span>Questões</span>
                        <span>Acertos</span>
                        <span>% Acerto</span>
                      </div>

                      {topico.subtopicos.map((subt, idx) => {
                        const p = progress[subt.id]
                        const pct = p?.questoes > 0 ? Math.round((p.acertos / p.questoes) * 100) : null

                        return (
                          <div key={subt.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 60px 80px 80px 60px', gap: 8, padding: '8px 14px', alignItems: 'center', background: idx % 2 === 0 ? 'transparent' : 'var(--surface2)', borderTop: '0.5px solid var(--border-dim)' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{subt.nome}</span>

                            <StatusBadge status={p?.statusMaterial ?? 'nao_iniciado'}
                              onClick={() => saveProgress(subt.id, { statusMaterial: nextStatus(p?.statusMaterial ?? 'nao_iniciado') })} />

                            <StatusBadge status={p?.statusResumo ?? 'nao_iniciado'}
                              onClick={() => saveProgress(subt.id, { statusResumo: nextStatus(p?.statusResumo ?? 'nao_iniciado') })} />

                            <button onClick={() => saveProgress(subt.id, { fichado: !p?.fichado })}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, textAlign: 'center' }}>
                              {p?.fichado ? '✅' : '⬜'}
                            </button>

                            <input type="number" min="0" value={p?.questoes ?? ''} placeholder="0"
                              onChange={e => saveProgress(subt.id, { questoes: Number(e.target.value) })}
                              style={{ width: 70, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 12, textAlign: 'center' }} />

                            <input type="number" min="0" value={p?.acertos ?? ''} placeholder="0"
                              onChange={e => saveProgress(subt.id, { acertos: Number(e.target.value) })}
                              style={{ width: 70, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 12, textAlign: 'center' }} />

                            <span style={{ fontSize: 12, fontWeight: 700, color: pct === null ? 'var(--text-muted)' : pct >= 70 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)' }}>
                              {pct !== null ? `${pct}%` : '—'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Simulados Modal */}
      {showSimulados && (
        <SimuladosModal
          simulados={simulados}
          onSave={saveSimulado}
          onDelete={deleteSimulado}
          onClose={() => setShowSimulados(false)}
        />
      )}
    </div>
  )
}
