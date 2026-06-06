import { useMemo } from 'react'
import { AGU_DISCIPLINAS, TOTAL_SUBTOPICOS } from '../editais/aguData'
import { useEditaisAGU } from '../../hooks/useEditaisAGU'

interface Props { onNavigate: (id: string) => void }

function RingGauge({ pct, color, size = 80 }: { pct: number; color: string; size?: number }) {
  const r = (size - 12) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-4)" strokeWidth={6} />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        style={{ transition: 'stroke-dasharray 1s ease', filter: `drop-shadow(0 0 6px ${color})` }}
      />
    </svg>
  )
}

export default function NexusDashboard({ onNavigate }: Props) {
  const hooks = useEditaisAGU()

  const allIds = useMemo(
    () => AGU_DISCIPLINAS.flatMap(d => d.topicos.flatMap(t => t.subtopicos.map(s => s.id))),
    []
  )
  const global = hooks.getStats(allIds)

  // Last finalized subtopic
  const lastFinalized = useMemo(() => {
    let best: { nome: string; disc: string; data: string } | null = null
    for (const d of AGU_DISCIPLINAS) {
      for (const t of d.topicos) {
        for (const s of t.subtopicos) {
          const st = hooks.getState(s.id)
          if (st.dataFinalizacao && st.statusMaterial === 'concluido') {
            if (!best || st.dataFinalizacao > best.data) {
              best = { nome: s.nome, disc: d.nome, data: st.dataFinalizacao }
            }
          }
        }
      }
    }
    return best
  }, [hooks])

  // Per-discipline stats
  const discStats = useMemo(() =>
    AGU_DISCIPLINAS.map(d => {
      const ids = d.topicos.flatMap(t => t.subtopicos.map(s => s.id))
      const st = hooks.getStats(ids)
      return { ...d, ...st, total: ids.length }
    }),
    [hooks]
  )

  const totalQuestoes = global.questoes
  const pctEdital = global.pctConcluido

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Hero row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
        {[
          { label: 'Progresso Edital', value: `${pctEdital}%`, sub: `${global.concluidos} / ${TOTAL_SUBTOPICOS} subtópicos`, color: '#00d4ff' },
          { label: 'Em Andamento', value: global.emAndamento, sub: 'subtópicos iniciados', color: '#f59e0b' },
          { label: 'Questões Feitas', value: totalQuestoes, sub: `${global.acertos} acertos`, color: '#7c3aed' },
          { label: '% Acerto Geral', value: totalQuestoes > 0 ? `${global.pctAcerto}%` : '—', sub: 'performance global', color: '#10b981' },
        ].map(k => (
          <div key={k.label} className="kpi-card" style={{ '--kpi-color': k.color } as React.CSSProperties}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── AGU Panel + Questões Panel ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>

        {/* AGU Progress */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'linear-gradient(90deg, rgba(0,212,255,0.05) 0%, transparent 100%)'
          }}>
            <div>
              <div className="section-heading" style={{ marginBottom: 2 }}>⚖ Edital AGU — Progresso</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>14 disciplinas · {TOTAL_SUBTOPICOS} subtópicos</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <RingGauge pct={pctEdital} color="#00d4ff" size={64} />
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, color: '#00d4ff', lineHeight: 1 }}>{pctEdital}%</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>concluído</div>
              </div>
            </div>
          </div>

          {/* Last finalized */}
          {lastFinalized && (
            <div style={{
              padding: '10px 20px',
              borderBottom: '1px solid var(--border)',
              background: 'rgba(16,185,129,0.04)',
              display: 'flex', alignItems: 'center', gap: 10
            }}>
              <span style={{ color: '#10b981', fontSize: '1rem' }}>✓</span>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Último concluído</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600 }}>{lastFinalized.nome}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{lastFinalized.disc} · {lastFinalized.data}</div>
              </div>
            </div>
          )}

          {/* Per-discipline bars */}
          <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
            {discStats.map(d => (
              <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 40px', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.nome.replace('Direito ', '')}
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${d.pctConcluido}%`, background: d.cor, color: d.cor }} />
                </div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: d.cor, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {d.pctConcluido}%
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-accent" onClick={() => onNavigate('editais')} style={{ width: '100%', justifyContent: 'center' }}>
              ⚖ Abrir Editais AGU
            </button>
          </div>
        </div>

        {/* Questões Panel */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'linear-gradient(90deg, rgba(124,58,237,0.05) 0%, transparent 100%)'
          }}>
            <div className="section-heading" style={{ marginBottom: 2 }}>◈ Performance — Questões</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Por disciplina · acerto médio</div>
          </div>

          {/* Global acerto ring */}
          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid var(--border)' }}>
            <RingGauge pct={totalQuestoes > 0 ? global.pctAcerto : 0} color="#7c3aed" size={72} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, color: '#7c3aed', lineHeight: 1 }}>
                {totalQuestoes > 0 ? `${global.pctAcerto}%` : '—'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{totalQuestoes} questões · {global.acertos} acertos</div>
            </div>
          </div>

          {/* Per-disc questões */}
          <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 280, overflowY: 'auto' }}>
            {discStats.filter(d => d.questoes > 0).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                Nenhuma questão registrada ainda.<br/>
                <span style={{ color: 'var(--text-accent)', cursor: 'pointer' }} onClick={() => onNavigate('editais')}>→ Ir para Editais AGU</span>
              </div>
            ) : discStats.filter(d => d.questoes > 0).map(d => (
              <div key={d.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>{d.nome.replace('Direito ', '')}</span>
                  <span style={{ fontSize: '0.73rem', fontFamily: 'var(--font-mono)', color: d.cor, fontWeight: 700 }}>
                    {d.pctAcerto}% <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({d.questoes}q)</span>
                  </span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${d.pctAcerto}%`, background: d.cor, color: d.cor }} />
                </div>
              </div>
            ))}
          </div>

          {/* Top 3 worst */}
          {discStats.filter(d => d.questoes > 0).length > 0 && (() => {
            const worst = [...discStats]
              .filter(d => d.questoes > 0)
              .sort((a, b) => a.pctAcerto - b.pctAcerto)
              .slice(0, 3)
            return (
              <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', background: 'rgba(239,68,68,0.03)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  ⚠ Atenção prioritária
                </div>
                {worst.map(d => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', padding: '2px 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{d.nome.replace('Direito ', '')}</span>
                    <span className="badge badge-red">{d.pctAcerto}%</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── Quick access ── */}
      <div>
        <div className="section-heading">MÓDULOS</div>
        <div className="grid-4">
          {[
            { id: 'editais', label: 'Editais AGU', icon: '⚖', desc: `${global.concluidos}/${TOTAL_SUBTOPICOS} subtópicos`, color: '#00d4ff' },
            { id: 'concursos', label: 'Concursos', icon: '🎯', desc: 'Agenda e resultados', color: '#7c3aed' },
            { id: 'financeiro', label: 'Financeiro', icon: '◎', desc: 'Controle financeiro', color: '#10b981' },
            { id: 'ponto', label: 'Ponto Eletrônico', icon: '⊙', desc: 'Controle de horas', color: '#f59e0b' },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => onNavigate(m.id)}
              className="card"
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                cursor: 'pointer', background: 'var(--card-bg)',
                border: `1px solid var(--border)`, textAlign: 'left',
                width: '100%', transition: 'all var(--transition)',
              }}
              onMouseEnter={e => {
                ;(e.currentTarget as HTMLElement).style.borderColor = m.color
                ;(e.currentTarget as HTMLElement).style.boxShadow = `0 0 20px ${m.color}25`
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLElement).style.borderColor = ''
                ;(e.currentTarget as HTMLElement).style.boxShadow = ''
              }}
            >
              <span style={{ fontSize: '1.8rem', width: 40, textAlign: 'center', flexShrink: 0 }}>{m.icon}</span>
              <div>
                <div style={{ fontWeight: 600, color: m.color, fontSize: '0.88rem' }}>{m.label}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{m.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
