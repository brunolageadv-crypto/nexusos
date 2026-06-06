import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useMedia, usePonto, useFinance, useJournal } from '../../hooks/useFirestore'
import { calcMediaProgress, formatMinutesAsHours, formatBRL } from '../../utils'

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: accent ?? 'var(--text-primary)' }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  )
}

function ModuleCard({ title, icon, accent, children }: { title: string; icon: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '0.5px solid var(--border)', borderLeft: `3px solid ${accent}` }}>
        <span>{icon}</span>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: 0.3 }}>{title}</h2>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 6, width: '100%', background: 'var(--border-dim)', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 999, transition: 'width 0.4s' }} />
    </div>
  )
}

export default function Dashboard() {
  const { items: mediaItems } = useMedia()
  const { todayBalance, weekBalance, checkedIn, clockIn, activeEntry, clockOut } = usePonto()
  const { transactions, monthlySummary } = useFinance()
  const { entries: journalEntries, streak } = useJournal()

  const inProgressMedia = useMemo(
    () => mediaItems.filter(m => m.status === 'watching' || m.status === 'paused').slice(0, 4),
    [mediaItems]
  )

  const chartData = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() - (6 - i))
      const label = d.toLocaleDateString('pt-BR', { weekday: 'short' })
      const dayStr = d.toISOString().split('T')[0]
      const dayTxs = transactions.filter(t => t.date.toDate().toISOString().split('T')[0] === dayStr)
      return {
        day: label,
        Receita: dayTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
        Despesa: dayTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      }
    })
  }, [transactions])

  const lastJournal = journalEntries[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <StatCard label="Saldo hoje" value={formatMinutesAsHours(todayBalance)}
          sub={checkedIn ? '● Trabalhando agora' : 'Ponto encerrado'}
          accent={todayBalance >= 0 ? 'var(--green)' : 'var(--red)'} />
        <StatCard label="Saldo semana" value={formatMinutesAsHours(weekBalance)}
          sub="Últimos 7 dias" accent={weekBalance >= 0 ? 'var(--green)' : 'var(--red)'} />
        <StatCard label="Saldo mensal" value={formatBRL(monthlySummary.balance)}
          sub={`Receitas: ${formatBRL(monthlySummary.totalIncome)}`}
          accent={monthlySummary.balance >= 0 ? 'var(--green)' : 'var(--red)'} />
        <StatCard label="Streak journal" value={`${streak}d`}
          sub={lastJournal ? `Último: ${lastJournal.date}` : 'Sem entradas'}
          accent="var(--purple)" />
      </div>

      {/* Modules */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* Ponto */}
        <ModuleCard title="Ponto Eletrônico" icon="⏱" accent="var(--green)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Status</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: checkedIn ? 'var(--green)' : 'var(--text-muted)' }}>
                  {checkedIn ? '● Trabalhando' : '○ Encerrado'}
                </p>
              </div>
              <button onClick={() => checkedIn && activeEntry ? clockOut(activeEntry.id) : clockIn()}
                style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${checkedIn ? 'var(--red)' : 'var(--green)'}`, background: checkedIn ? 'var(--red-dim)' : 'var(--green-dim)', color: checkedIn ? 'var(--red)' : 'var(--green)', transition: 'all 0.15s' }}>
                {checkedIn ? 'Bater Saída' : 'Bater Entrada'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[['Hoje', todayBalance], ['Semana', weekBalance]].map(([l, v]) => (
                <div key={l as string} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{l as string}</p>
                  <p style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{formatMinutesAsHours(v as number)}</p>
                </div>
              ))}
            </div>
          </div>
        </ModuleCard>

        {/* Media */}
        <ModuleCard title="Mídia em Andamento" icon="🎬" accent="var(--purple)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {inProgressMedia.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhuma mídia em andamento.</p>
              : inProgressMedia.map(item => {
                  const pct = calcMediaProgress(item)
                  return (
                    <div key={item.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{item.title}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Space Mono', monospace" }}>{pct}%</span>
                      </div>
                      <ProgressBar pct={pct} color="var(--purple)" />
                    </div>
                  )
                })
            }
          </div>
        </ModuleCard>

        {/* Finance */}
        <ModuleCard title="Fluxo Financeiro — 7 dias" icon="💰" accent="var(--amber)">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} stroke="transparent" />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} stroke="transparent" />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)' }} formatter={(v: number) => formatBRL(v)} />
              <Line type="monotone" dataKey="Receita" stroke="var(--green)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Despesa" stroke="var(--red)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>● Receitas: {formatBRL(monthlySummary.totalIncome)}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>● Despesas: {formatBRL(monthlySummary.totalExpenses)}</span>
          </div>
        </ModuleCard>

        {/* Journal */}
        <ModuleCard title="Diário" icon="📓" accent="#D85A30">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lastJournal ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lastJournal.date}</p>
                  {lastJournal.mood && <span style={{ fontSize: 18 }}>{(['😞','😕','😐','🙂','😄'] as const)[lastJournal.mood - 1]}</span>}
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {lastJournal.content.replace(/[#*`]/g, '').slice(0, 200)}…
                </p>
              </>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhuma entrada no diário ainda.</p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Streak:</span>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: '#D85A30' }}>{streak} dia{streak !== 1 ? 's' : ''}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{journalEntries.length} entradas</span>
            </div>
          </div>
        </ModuleCard>
      </div>
    </div>
  )
}
