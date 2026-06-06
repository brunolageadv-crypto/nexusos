import { useState, useMemo } from 'react'
import { AGU_DISCIPLINAS, TOTAL_SUBTOPICOS, Topico } from './aguData'
import { useEditaisAGU } from '../../hooks/useEditaisAGU'

/* ── helpers ──────────────────────────────────────────────────── */
function pctColor(p: number) {
  if (p >= 70) return '#10b981'
  if (p >= 50) return '#f59e0b'
  return '#ef4444'
}

/* ── SubRow ─────────────────────────────────────────────────────── */
function SubRow({ subId, nome, hooks }: {
  subId: string
  nome: string
  hooks: ReturnType<typeof useEditaisAGU>
}) {
  const { getState, updateField, cycleStatus } = hooks
  const s = getState(subId)
  const pctAcerto = s.questoes > 0 ? Math.round((s.acertos / s.questoes) * 100) : null
  const finalizado = s.finalizado ?? false

  const statusColors: Record<string, string> = {
    pendente:    'var(--text-muted)',
    em_andamento:'#f59e0b',
    concluido:   '#10b981',
  }
  const statusLabels: Record<string, string> = {
    pendente: '○ Pendente',
    em_andamento: '◔ Em andamento',
    concluido: '● Concluído',
  }

  return (
    <tr
      className="sub-row"
      style={{
        opacity: finalizado ? 0.55 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {/* Nome */}
      <td style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-primary)', maxWidth: 280 }}>
        <span style={{
          textDecoration: finalizado ? 'line-through' : 'none',
          color: finalizado ? 'var(--text-muted)' : 'var(--text-primary)',
          transition: 'all 0.25s',
        }}>
          {nome}
        </span>
      </td>

      {/* Status */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        <button
          onClick={() => cycleStatus(subId)}
          style={{
            background: 'none', border: `1px solid ${statusColors[s.statusMaterial]}33`,
            borderRadius: 20, padding: '3px 10px', cursor: 'pointer',
            fontSize: '0.7rem', fontWeight: 700,
            color: statusColors[s.statusMaterial],
            transition: 'all 0.2s', whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${statusColors[s.statusMaterial]}18` }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
        >
          {statusLabels[s.statusMaterial]}
        </button>
      </td>

      {/* Data conclusão */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        <input
          type="date"
          value={s.dataFinalizacao}
          onChange={e => updateField(subId, 'dataFinalizacao', e.target.value)}
          style={{ width: 120, fontSize: '0.73rem', padding: '4px 8px',
            background: 'var(--input-bg)', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
        />
      </td>

      {/* Resumo */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        <button
          onClick={() => updateField(subId, 'statusResumo', s.statusResumo === 'feito' ? 'pendente' : 'feito')}
          style={{
            background: s.statusResumo === 'feito' ? 'rgba(0,212,255,0.1)' : 'none',
            border: `1px solid ${s.statusResumo === 'feito' ? 'rgba(0,212,255,0.4)' : 'var(--border)'}`,
            borderRadius: 20, padding: '3px 10px', cursor: 'pointer',
            fontSize: '0.7rem', fontWeight: 700,
            color: s.statusResumo === 'feito' ? 'var(--text-accent)' : 'var(--text-muted)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
        >
          {s.statusResumo === 'feito' ? '✓ Feito' : '— Pendente'}
        </button>
      </td>

      {/* Fichado */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <input
            type="checkbox"
            checked={s.fichado}
            onChange={e => updateField(subId, 'fichado', e.target.checked)}
            style={{ display: 'none' }}
          />
          <span
            style={{
              width: 20, height: 20, borderRadius: 5,
              border: `2px solid ${s.fichado ? '#7c3aed' : 'var(--border-md)'}`,
              background: s.fichado ? 'rgba(124,58,237,0.2)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.7rem', color: '#7c3aed',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#7c3aed' }}
            onMouseLeave={e => { if (!s.fichado) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)' }}
          >
            {s.fichado ? '✓' : ''}
          </span>
        </label>
      </td>

      {/* ✅ FINALIZADO — checkbox com tachado */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        <label
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          title="Marcar como finalizado"
        >
          <input
            type="checkbox"
            checked={finalizado}
            onChange={e => {
              updateField(subId, 'finalizado' as any, e.target.checked)
              // Auto-data se não tiver
              if (e.target.checked && !s.dataFinalizacao) {
                updateField(subId, 'dataFinalizacao', new Date().toISOString().slice(0, 10))
              }
            }}
            style={{ display: 'none' }}
          />
          <span
            style={{
              width: 22, height: 22, borderRadius: 6,
              border: `2px solid ${finalizado ? '#10b981' : 'var(--border-md)'}`,
              background: finalizado ? 'rgba(16,185,129,0.15)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem', color: '#10b981', fontWeight: 700,
              transition: 'all 0.25s',
              boxShadow: finalizado ? '0 0 8px rgba(16,185,129,0.4)' : 'none',
            }}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLElement).style.borderColor = '#10b981'
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.08)'
            }}
            onMouseLeave={e => {
              if (!finalizado) {
                ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'
                ;(e.currentTarget as HTMLElement).style.background = 'transparent'
              }
            }}
          >
            {finalizado ? '✓' : ''}
          </span>
        </label>
      </td>

      {/* Questões */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        <input
          type="number" min={0} placeholder="0"
          value={s.questoes || ''}
          onChange={e => updateField(subId, 'questoes', Number(e.target.value) || 0)}
          style={{ width: 58, textAlign: 'center', fontSize: '0.8rem', padding: '4px 6px',
            background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
        />
      </td>

      {/* Acertos */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        <input
          type="number" min={0} max={s.questoes} placeholder="0"
          value={s.acertos || ''}
          onChange={e => updateField(subId, 'acertos', Number(e.target.value) || 0)}
          style={{ width: 58, textAlign: 'center', fontSize: '0.8rem', padding: '4px 6px',
            background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
        />
      </td>

      {/* % Acerto */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        {pctAcerto !== null ? (
          <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 12,
            fontSize: '0.72rem', fontWeight: 700,
            background: `${pctColor(pctAcerto)}22`,
            color: pctColor(pctAcerto),
            border: `1px solid ${pctColor(pctAcerto)}44`,
            fontFamily: 'var(--font-mono)',
          }}>
            {pctAcerto}%
          </span>
        ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>}
      </td>

      {/* Revisão */}
      <td style={{ textAlign: 'center', padding: '6px 8px' }}>
        <input
          type="date"
          value={s.ultimaRevisao}
          onChange={e => updateField(subId, 'ultimaRevisao', e.target.value)}
          style={{ width: 120, fontSize: '0.73rem', padding: '4px 8px',
            background: 'var(--input-bg)', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
        />
      </td>
    </tr>
  )
}

/* ── TopicBlock ──────────────────────────────────────────────── */
function TopicBlock({ topico, hooks }: { topico: Topico; hooks: ReturnType<typeof useEditaisAGU> }) {
  const [open, setOpen] = useState(true)
  const ids = topico.subtopicos.map(s => s.id)
  const stats = hooks.getStats(ids)

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 14px', cursor: 'pointer',
          background: 'var(--bg-3)', border: '1px solid var(--border)',
          borderRadius: open ? '8px 8px 0 0' : 8,
          userSelect: 'none', transition: 'all 0.2s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-3)' }}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', width: 14 }}>{open ? '▾' : '▸'}</span>
        <span style={{ fontWeight: 600, fontSize: '0.83rem', flex: 1, color: 'var(--text-primary)' }}>{topico.nome}</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {stats.concluidos}/{stats.total}
          {stats.questoes > 0 && ` · ${stats.pctAcerto}% acerto`}
        </span>
        <div style={{ width: 80, height: 3, background: 'var(--bg-4)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${stats.pctConcluido}%`, height: 3, background: 'var(--text-accent)', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-accent)', fontFamily: 'var(--font-mono)', minWidth: 34, textAlign: 'right' }}>
          {stats.pctConcluido}%
        </span>
      </div>

      {open && (
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          background: 'var(--card-bg)', border: '1px solid var(--border)',
          borderTop: 'none', borderRadius: '0 0 8px 8px', fontSize: '0.78rem'
        }}>
          <thead>
            <tr style={{ background: 'var(--bg-2)' }}>
              {['Subtópico','Status','Data Conclusão','Resumo','Fichado','Finalizado','Questões','Acertos','% Acerto','Última Revisão'].map(h => (
                <th key={h} style={{
                  padding: '7px 8px', fontSize: '0.65rem', fontWeight: 700,
                  color: 'var(--text-muted)', textTransform: 'uppercase',
                  letterSpacing: '0.06em', borderBottom: '1px solid var(--border)',
                  textAlign: h === 'Subtópico' ? 'left' : 'center', whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topico.subtopicos.map(sub => (
              <SubRow key={sub.id} subId={sub.id} nome={sub.nome} hooks={hooks} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/* ── Main ───────────────────────────────────────────────────────── */
export default function EditaisAGU() {
  const [activeDisciplina, setActiveDisciplina] = useState(AGU_DISCIPLINAS[0].id)
  const hooks = useEditaisAGU()

  const allIds = useMemo(
    () => AGU_DISCIPLINAS.flatMap(d => d.topicos.flatMap(t => t.subtopicos.map(s => s.id))),
    []
  )
  const global = hooks.getStats(allIds)

  const disc = AGU_DISCIPLINAS.find(d => d.id === activeDisciplina)!

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-0)' }}>

      {/* Topbar global */}
      <div style={{
        padding: '16px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-1)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, flexShrink: 0,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-accent)', letterSpacing: '0.1em' }}>
            EDITAIS AGU — ADVOGADO DA UNIÃO
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
            14 disciplinas · {TOTAL_SUBTOPICOS} subtópicos
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Concluídos', v: global.concluidos, color: '#10b981' },
            { label: 'Em andamento', v: global.emAndamento, color: '#f59e0b' },
            { label: 'Progresso', v: `${global.pctConcluido}%`, color: 'var(--text-accent)' },
            { label: 'Questões', v: global.questoes, color: '#7c3aed' },
            { label: '% Acerto', v: global.questoes > 0 ? `${global.pctAcerto}%` : '—', color: '#7c3aed' },
          ].map(k => (
            <div key={k.label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.v}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
          {hooks.syncing && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', alignSelf: 'center' }}>↻ Sync…</span>}
        </div>
      </div>

      {/* Layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Sidebar disciplinas */}
        <nav style={{
          width: 220, minWidth: 200, flexShrink: 0,
          background: 'var(--bg-1)', borderRight: '1px solid var(--border)',
          overflowY: 'auto', padding: '10px 0',
        }}>
          {AGU_DISCIPLINAS.map(d => {
            const ids = d.topicos.flatMap(t => t.subtopicos.map(s => s.id))
            const st = hooks.getStats(ids)
            const isActive = d.id === activeDisciplina
            return (
              <button
                key={d.id}
                onClick={() => setActiveDisciplina(d.id)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  width: '100%', padding: '9px 14px',
                  background: isActive ? `${d.cor}12` : 'none',
                  border: 'none', borderLeft: `3px solid ${isActive ? d.cor : 'transparent'}`,
                  cursor: 'pointer', textAlign: 'left',
                  color: isActive ? d.cor : 'var(--text-secondary)',
                  fontFamily: 'var(--font-body)',
                  transition: 'all 0.18s',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    ;(e.currentTarget as HTMLElement).style.background = `${d.cor}0a`
                    ;(e.currentTarget as HTMLElement).style.borderLeftColor = `${d.cor}88`
                    ;(e.currentTarget as HTMLElement).style.color = d.cor
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    ;(e.currentTarget as HTMLElement).style.background = 'none'
                    ;(e.currentTarget as HTMLElement).style.borderLeftColor = 'transparent'
                    ;(e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'
                  }
                }}
              >
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

        {/* Conteúdo disciplina */}
        <main style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {/* Header disciplina */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', marginBottom: 16,
            background: 'var(--card-bg)', border: '1px solid var(--border)',
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
            <TopicBlock key={t.id} topico={t} hooks={hooks} />
          ))}
        </main>
      </div>
    </div>
  )
}
