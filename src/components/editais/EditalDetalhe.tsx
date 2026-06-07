// EditalDetalhe.tsx — tela de estudo de qualquer edital (genérico)
import { useState, useMemo } from 'react'
import { useEdital } from '../../hooks/useEdital'
import type { EditalCadastrado } from '../../hooks/useEdital'

interface Props {
  edital: EditalCadastrado
  onVoltar: () => void
}

function SubRow({ subId, nome, hooks }: {
  subId: string
  nome: string
  hooks: ReturnType<typeof useEdital>
}) {
  const { getState, updateField, cycleStatus } = hooks
  const s = getState(subId)
  const finalizado = s.finalizado ?? false

  const statusColors: Record<string, string> = {
    pendente:     'var(--text-muted)',
    em_andamento: '#f59e0b',
    concluido:    '#10b981',
  }
  const statusLabels: Record<string, string> = {
    pendente:     '○ Pendente',
    em_andamento: '◔ Em andamento',
    concluido:    '● Concluído',
  }

  return (
    <tr style={{ opacity: finalizado ? 0.55 : 1, transition: 'opacity 0.2s' }}>
      {/* Nome */}
      <td style={{ padding: '8px 12px', fontSize: '0.8rem', maxWidth: 280 }}>
        <span style={{
          textDecoration: finalizado ? 'line-through' : 'none',
          color: finalizado ? 'var(--text-muted)' : 'var(--text-primary)',
          transition: 'all 0.25s',
        }}>{nome}</span>
      </td>

      {/* Status */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        <button onClick={() => cycleStatus(subId)} style={{
          background: 'none', border: `1px solid ${statusColors[s.statusMaterial]}33`,
          borderRadius: 20, padding: '3px 10px', cursor: 'pointer',
          fontSize: '0.7rem', fontWeight: 700, color: statusColors[s.statusMaterial],
          transition: 'all 0.2s', whiteSpace: 'nowrap',
        }}>{statusLabels[s.statusMaterial]}</button>
      </td>

      {/* Data conclusão */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        <input type="date" value={s.dataFinalizacao}
          onChange={e => updateField(subId, 'dataFinalizacao', e.target.value)}
          style={{ width: 120, fontSize: '0.73rem', padding: '4px 8px',
            background: 'var(--input-bg)', border: '1px solid var(--border-md)',
            borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }} />
      </td>

      {/* Resumo */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        <button onClick={() => updateField(subId, 'statusResumo', s.statusResumo === 'feito' ? 'pendente' : 'feito')}
          style={{
            background: s.statusResumo === 'feito' ? 'rgba(0,212,255,0.1)' : 'none',
            border: `1px solid ${s.statusResumo === 'feito' ? 'rgba(0,212,255,0.4)' : 'var(--border)'}`,
            borderRadius: 20, padding: '3px 10px', cursor: 'pointer',
            fontSize: '0.7rem', fontWeight: 700,
            color: s.statusResumo === 'feito' ? 'var(--text-accent)' : 'var(--text-muted)',
            transition: 'all 0.2s',
          }}>{s.statusResumo === 'feito' ? '✓ Feito' : '— Pendente'}</button>
      </td>

      {/* Fichado */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <input type="checkbox" checked={s.fichado}
            onChange={e => updateField(subId, 'fichado', e.target.checked)}
            style={{ display: 'none' }} />
          <span style={{
            width: 20, height: 20, borderRadius: 5,
            border: `2px solid ${s.fichado ? '#7c3aed' : 'var(--border-md)'}`,
            background: s.fichado ? 'rgba(124,58,237,0.2)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.7rem', color: '#7c3aed', transition: 'all 0.2s',
          }}>{s.fichado ? '✓' : ''}</span>
        </label>
      </td>

      {/* Finalizado */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <input type="checkbox" checked={finalizado}
            onChange={e => {
              updateField(subId, 'finalizado' as any, e.target.checked)
              if (e.target.checked && !s.dataFinalizacao)
                updateField(subId, 'dataFinalizacao', new Date().toISOString().slice(0, 10))
            }}
            style={{ display: 'none' }} />
          <span style={{
            width: 22, height: 22, borderRadius: 6,
            border: `2px solid ${finalizado ? '#10b981' : 'var(--border-md)'}`,
            background: finalizado ? 'rgba(16,185,129,0.15)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', color: '#10b981', fontWeight: 700,
            transition: 'all 0.25s',
            boxShadow: finalizado ? '0 0 8px rgba(16,185,129,0.4)' : 'none',
          }}>{finalizado ? '✓' : ''}</span>
        </label>
      </td>

      {/* Questões */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        <input type="number" min={0} placeholder="0" value={s.questoes || ''}
          onChange={e => updateField(subId, 'questoes', Number(e.target.value) || 0)}
          style={{ width: 58, textAlign: 'center', fontSize: '0.8rem', padding: '4px 6px',
            background: 'var(--input-bg)', border: '1px solid var(--border-md)',
            borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }} />
      </td>

      {/* Acertos */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        <input type="number" min={0} placeholder="0" value={s.acertos || ''}
          onChange={e => updateField(subId, 'acertos', Math.min(Number(e.target.value) || 0, s.questoes))}
          style={{ width: 58, textAlign: 'center', fontSize: '0.8rem', padding: '4px 6px',
            background: 'var(--input-bg)', border: '1px solid var(--border-md)',
            borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }} />
      </td>

      {/* % Acerto */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        {s.questoes > 0 ? (
          <span style={{
            fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
            color: s.acertos/s.questoes >= 0.7 ? '#10b981' : s.acertos/s.questoes >= 0.5 ? '#f59e0b' : '#ef4444',
          }}>{Math.round((s.acertos/s.questoes)*100)}%</span>
        ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>}
      </td>

      {/* Última Revisão */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        <input type="date" value={s.ultimaRevisao}
          onChange={e => updateField(subId, 'ultimaRevisao', e.target.value)}
          style={{ width: 120, fontSize: '0.73rem', padding: '4px 8px',
            background: 'var(--input-bg)', border: '1px solid var(--border-md)',
            borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }} />
      </td>
    </tr>
  )
}

function TopicBlock({ topicoId, nome, subtopicos, cor, hooks }: {
  topicoId: string
  nome: string
  subtopicos: { id: string; nome: string }[]
  cor: string
  hooks: ReturnType<typeof useEdital>
}) {
  const [open, setOpen] = useState(false)
  const ids = subtopicos.map(s => s.id)
  const stats = hooks.getStats(ids)

  return (
    <div style={{ marginBottom: 10 }}>
      <div onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
        background: 'var(--card-bg)', border: '1px solid var(--border-md)',
        borderRadius: open ? '8px 8px 0 0' : 8, cursor: 'pointer',
        borderLeft: `4px solid ${cor}`,
        transition: 'all 0.18s',
      }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>▶</span>
        <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{nome}</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {stats.concluidos}/{stats.total}
        </span>
        <div style={{ width: 80, height: 4, background: 'var(--bg-4)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${stats.pctConcluido}%`, height: 4, background: cor, borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: cor, fontFamily: 'var(--font-mono)', minWidth: 34, textAlign: 'right' }}>
          {stats.pctConcluido}%
        </span>
      </div>

      {open && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderTop: 'none', borderRadius: '0 0 8px 8px', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-2)' }}>
              {['Subtópico','Status','Data Conclusão','Resumo','Fichado','Finalizado','Questões','Acertos','% Acerto','Última Revisão'].map(h => (
                <th key={h} style={{
                  padding: '7px 8px', fontSize: '0.65rem', fontWeight: 700,
                  color: 'var(--text-muted)', textTransform: 'uppercase',
                  letterSpacing: '0.06em', borderBottom: '1px solid var(--border-md)',
                  textAlign: h === 'Subtópico' ? 'left' : 'center', whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subtopicos.map(sub => (
              <SubRow key={sub.id} subId={sub.id} nome={sub.nome} hooks={hooks} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function EditalDetalhe({ edital, onVoltar }: Props) {
  const [activeDisciplinaId, setActiveDisciplinaId] = useState(edital.disciplinas[0]?.id || '')
  const hooks = useEdital(edital.id)

  const allIds = useMemo(
    () => edital.disciplinas.flatMap(d => d.topicos.flatMap(t => t.subtopicos.map(s => s.id))),
    [edital]
  )
  const global = hooks.getStats(allIds)
  const totalSubtopicos = allIds.length

  const disc = edital.disciplinas.find(d => d.id === activeDisciplinaId) || edital.disciplinas[0]

  if (!disc) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
      <p>Este edital não possui disciplinas cadastradas.</p>
      <button onClick={onVoltar} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer' }}>← Voltar</button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-0)' }}>

      {/* Header */}
      <div style={{
        padding: '14px 24px', borderBottom: '1px solid var(--border-md)',
        background: 'var(--bg-1)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onVoltar} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            border: '1px solid var(--border-md)', borderRadius: 8,
            background: 'var(--surface)', color: 'var(--text-secondary)',
            cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = edital.cor}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'}>
            ← Editais
          </button>
          <div style={{ width: 1, height: 28, background: 'var(--border-md)' }} />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.92rem', fontWeight: 800, color: edital.cor, letterSpacing: '0.06em' }}>
              {edital.nome.toUpperCase()}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 1 }}>
              {edital.orgao} · {edital.cargo} · {edital.disciplinas.length} disciplinas · {totalSubtopicos} subtópicos
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { label: 'Concluídos',   v: global.concluidos,                                              color: '#10b981' },
            { label: 'Em andamento', v: global.emAndamento,                                             color: '#f59e0b' },
            { label: 'Progresso',    v: `${global.pctConcluido}%`,                                     color: edital.cor },
            { label: 'Questões',     v: global.questoes,                                                color: '#7c3aed' },
            { label: '% Acerto',     v: global.questoes > 0 ? `${global.pctAcerto}%` : '—',            color: '#7c3aed' },
          ].map(k => (
            <div key={k.label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.v}</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
          {hooks.syncing && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>↻ Sync…</span>}
        </div>
      </div>

      {/* Layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Sidebar disciplinas */}
        <nav style={{ width: 220, minWidth: 200, flexShrink: 0, background: 'var(--bg-1)', borderRight: '1px solid var(--border-md)', overflowY: 'auto', padding: '10px 0' }}>
          {edital.disciplinas.map(d => {
            const ids = d.topicos.flatMap(t => t.subtopicos.map(s => s.id))
            const st = hooks.getStats(ids)
            const isActive = d.id === activeDisciplinaId
            return (
              <button key={d.id} onClick={() => setActiveDisciplinaId(d.id)} style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                width: '100%', padding: '9px 14px',
                background: isActive ? `${d.cor}12` : 'none',
                border: 'none', borderLeft: `3px solid ${isActive ? d.cor : 'transparent'}`,
                cursor: 'pointer', textAlign: 'left',
                color: isActive ? d.cor : 'var(--text-secondary)',
                transition: 'all 0.18s',
              }}
                onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = `${d.cor}0a`; (e.currentTarget as HTMLElement).style.color = d.cor } }}
                onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' } }}>
                <span style={{ fontSize: '0.78rem', fontWeight: isActive ? 700 : 500, lineHeight: 1.3 }}>
                  {d.nome.replace('Direito ', '')}
                </span>
                <div style={{ height: 2, background: 'var(--bg-4)', borderRadius: 1, overflow: 'hidden' }}>
                  <div style={{ width: `${st.pctConcluido}%`, height: 2, background: d.cor, transition: 'width 0.4s' }} />
                </div>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{st.pctConcluido}% · {st.concluidos}/{st.total}</span>
              </button>
            )
          })}
        </nav>

        {/* Conteúdo */}
        <main style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', marginBottom: 16,
            background: 'var(--card-bg)', border: '1px solid var(--border-md)',
            borderLeft: `5px solid ${disc.cor}`, borderRadius: 10, flexWrap: 'wrap', gap: 12,
          }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: disc.cor, letterSpacing: '0.05em', margin: 0 }}>
                {disc.nome.toUpperCase()}
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                {hooks.getStats(disc.topicos.flatMap(t => t.subtopicos.map(s => s.id))).concluidos} de{' '}
                {disc.topicos.reduce((a, t) => a + t.subtopicos.length, 0)} subtópicos concluídos
              </p>
            </div>
            {(() => {
              const ids = disc.topicos.flatMap(t => t.subtopicos.map(s => s.id))
              const st = hooks.getStats(ids)
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 180, height: 6, background: 'var(--bg-4)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${st.pctConcluido}%`, height: 6, background: disc.cor, borderRadius: 3, transition: 'width 0.5s', boxShadow: `0 0 10px ${disc.cor}88` }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: disc.cor, minWidth: 44 }}>
                    {st.pctConcluido}%
                  </span>
                </div>
              )
            })()}
          </div>

          {disc.topicos.map(t => (
            <TopicBlock key={t.id} topicoId={t.id} nome={t.nome} subtopicos={t.subtopicos} cor={disc.cor} hooks={hooks} />
          ))}
        </main>
      </div>
    </div>
  )
}
