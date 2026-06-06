import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useAuth } from '../../hooks/useAuth'
import { useMedia, usePonto, useFinance, useJournal } from '../../hooks/useFirestore'
import { calcMediaProgress, formatMinutesAsHours, formatBRL } from '../../utils'

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs font-medium text-muted uppercase tracking-widest">{label}</span>
      <span className="text-2xl font-bold font-mono" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  )
}

function ModuleCard({ title, icon, accentColor, children }: {
  title: string; icon: string; accentColor: string; children: React.ReactNode
}) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border"
        style={{ borderLeftWidth: 3, borderLeftColor: accentColor }}>
        <span style={{ color: accentColor }}>{icon}</span>
        <h2 className="font-semibold text-sm tracking-wide">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full bg-border-dim rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export default function Dashboard() {
  const { user: _user } = useAuth()
  const { items: mediaItems } = useMedia()
  const { todayBalance, weekBalance, checkedIn, clockIn, activeEntry, clockOut } = usePonto()
  const { transactions, monthlySummary } = useFinance()
  const { entries: journalEntries, streak } = useJournal()

  const inProgressMedia = useMemo(
    () => mediaItems.filter((m) => m.status === 'watching' || m.status === 'paused').slice(0, 4),
    [mediaItems]
  )

  const chartData = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() - (6 - i))
      const label = d.toLocaleDateString('pt-BR', { weekday: 'short' })
      const dayStr = d.toISOString().split('T')[0]
      const dayTxs = transactions.filter((t) => {
        const td = t.date.toDate().toISOString().split('T')[0]
        return td === dayStr
      })
      const income = dayTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
      const expense = dayTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
      return { day: label, Receita: income, Despesa: expense }
    })
  }, [transactions])

  const lastJournalEntry = journalEntries[0]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Saldo hoje" value={formatMinutesAsHours(todayBalance)}
          sub={checkedIn ? '● Trabalhando agora' : 'Ponto encerrado'}
          accent={todayBalance >= 0 ? '#1D9E75' : '#E24B4A'} />
        <StatCard label="Saldo semana" value={formatMinutesAsHours(weekBalance)}
          sub="Últimos 7 dias" accent={weekBalance >= 0 ? '#1D9E75' : '#E24B4A'} />
        <StatCard label="Saldo mensal" value={formatBRL(monthlySummary.balance)}
          sub={`Receitas: ${formatBRL(monthlySummary.totalIncome)}`}
          accent={monthlySummary.balance >= 0 ? '#1D9E75' : '#E24B4A'} />
        <StatCard label="Streak journal" value={`${streak}d`}
          sub={lastJournalEntry ? `Último: ${lastJournalEntry.date}` : 'Sem entradas'}
          accent="#7F77DD" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ModuleCard title="Ponto Eletrônico" icon="⏱" accentColor="#1D9E75">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Status</p>
                <p className={`text-base font-semibold ${checkedIn ? 'text-green' : 'text-muted'}`}>
                  {checkedIn ? '● Trabalhando' : '○ Encerrado'}
                </p>
              </div>
              <button
                onClick={() => checkedIn && activeEntry ? clockOut(activeEntry.id) : clockIn()}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  checkedIn ? 'bg-red-dim text-red border border-red' : 'bg-green-dim text-green border border-green'
                }`}>
                {checkedIn ? 'Bater Saída' : 'Bater Entrada'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-background rounded-lg p-3">
                <p className="text-xs text-muted mb-1">Hoje</p>
                <p className="font-mono font-bold">{formatMinutesAsHours(todayBalance)}</p>
              </div>
              <div className="bg-background rounded-lg p-3">
                <p className="text-xs text-muted mb-1">Semana</p>
                <p className="font-mono font-bold">{formatMinutesAsHours(weekBalance)}</p>
              </div>
            </div>
          </div>
        </ModuleCard>

        <ModuleCard title="Media em Andamento" icon="🎬" accentColor="#7F77DD">
          <div className="space-y-3">
            {inProgressMedia.length === 0 && (
              <p className="text-sm text-muted">Nenhuma mídia em andamento.</p>
            )}
            {inProgressMedia.map((item) => {
              const pct = calcMediaProgress(item)
              return (
                <div key={item.id}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium truncate max-w-[70%]">{item.title}</span>
                    <span className="text-xs text-muted font-mono">{pct}%</span>
                  </div>
                  <ProgressBar pct={pct} color="#7F77DD" />
                </div>
              )
            })}
          </div>
        </ModuleCard>

        <ModuleCard title="Fluxo Financeiro — 7 dias" icon="💰" accentColor="#EF9F27">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="transparent" />
              <YAxis tick={{ fontSize: 11 }} stroke="transparent" />
              <Tooltip
                contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => formatBRL(v)} />
              <Line type="monotone" dataKey="Receita" stroke="#1D9E75" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Despesa" stroke="#E24B4A" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <span className="text-xs text-muted">
              <span className="inline-block w-3 h-0.5 bg-green mr-1 align-middle" />
              Receitas: {formatBRL(monthlySummary.totalIncome)}
            </span>
            <span className="text-xs text-muted">
              <span className="inline-block w-3 h-0.5 bg-red mr-1 align-middle" />
              Despesas: {formatBRL(monthlySummary.totalExpenses)}
            </span>
          </div>
        </ModuleCard>

        <ModuleCard title="Diário" icon="📓" accentColor="#D85A30">
          <div className="space-y-3">
            {lastJournalEntry ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted">{lastJournalEntry.date}</p>
                  {lastJournalEntry.mood && (
                    <span className="text-lg">
                      {(['😞', '😕', '😐', '🙂', '😄'] as const)[lastJournalEntry.mood - 1]}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted line-clamp-3 leading-relaxed">
                  {lastJournalEntry.content.replace(/[#*`]/g, '').slice(0, 200)}…
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">Nenhuma entrada no diário ainda.</p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-muted">Streak:</span>
              <span className="font-mono text-sm font-bold" style={{ color: '#D85A30' }}>
                {streak} dia{streak !== 1 ? 's' : ''}
              </span>
              <span className="text-xs text-muted ml-auto">{journalEntries.length} entradas no total</span>
            </div>
          </div>
        </ModuleCard>
      </div>
    </div>
  )
}
