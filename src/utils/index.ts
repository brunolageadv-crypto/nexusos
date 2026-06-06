import { Timestamp } from 'firebase/firestore'
import type { MediaItem, TimeEntry, TimeSummary, Transaction, MonthlySummary } from '../types'

// ─── Media Utilities ──────────────────────────────────────────────────────────

/**
 * Returns the completion percentage (0-100) for a media item.
 * Handles shows (episodes), books (pages), and films (binary).
 */
export function calcMediaProgress(item: MediaItem): number {
  if (item.type === 'film') {
    return item.status === 'completed' ? 100 : 0
  }

  if (item.type === 'show') {
    const total = item.totalEpisodes ?? 0
    const watched = item.watchedEpisodes ?? 0
    if (total === 0) return 0
    return Math.min(100, Math.round((watched / total) * 100))
  }

  if (item.type === 'book') {
    const total = item.totalPages ?? 0
    const current = item.currentPage ?? 0
    if (total === 0) return 0
    return Math.min(100, Math.round((current / total) * 100))
  }

  return 0
}

/**
 * Returns a human-readable progress label, e.g. "Ep. 5/12" or "pg. 80/320".
 */
export function mediaProgressLabel(item: MediaItem): string {
  if (item.type === 'film') {
    return item.status === 'completed' ? 'Concluído' : 'Não assistido'
  }
  if (item.type === 'show') {
    return `Ep. ${item.watchedEpisodes ?? 0}/${item.totalEpisodes ?? '?'}`
  }
  if (item.type === 'book') {
    return `pg. ${item.currentPage ?? 0}/${item.totalPages ?? '?'}`
  }
  return ''
}

// ─── Time Tracking Utilities ──────────────────────────────────────────────────

/**
 * Calculates worked minutes for a single time entry.
 * Returns 0 if the entry has no clockOut yet (still active).
 */
export function calcWorkedMinutes(entry: TimeEntry): number {
  if (!entry.clockOut) return 0
  const inMs = entry.clockIn.toMillis()
  const outMs = entry.clockOut.toMillis()
  const totalMs = outMs - inMs
  return Math.max(0, Math.round(totalMs / 60000) - (entry.breakMinutes ?? 0))
}

/**
 * Calculates the balance in minutes for a single entry.
 * Positive = overtime, negative = deficit.
 */
export function calcBalanceMinutes(entry: TimeEntry): number {
  const worked = calcWorkedMinutes(entry)
  const expected = (entry.expectedHours ?? 8) * 60
  return worked - expected
}

/**
 * Formats minutes as a signed hours string, e.g. "+1h30" or "-0h45".
 */
export function formatMinutesAsHours(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-'
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${sign}${h}h${String(m).padStart(2, '0')}`
}

/**
 * Returns the total balance in minutes for a list of entries.
 */
export function calcTotalBalance(entries: TimeEntry[]): number {
  return entries.reduce((acc, e) => acc + calcBalanceMinutes(e), 0)
}

/**
 * Builds a TimeSummary for each entry, suitable for chart rendering.
 */
export function buildTimeSummaries(entries: TimeEntry[]): TimeSummary[] {
  return entries.map((entry) => ({
    date: entry.date,
    workedMinutes: calcWorkedMinutes(entry),
    expectedMinutes: (entry.expectedHours ?? 8) * 60,
    balanceMinutes: calcBalanceMinutes(entry),
  }))
}

/**
 * Returns true if the most recent entry has no clockOut (user is checked in).
 */
export function isCurrentlyCheckedIn(entries: TimeEntry[]): boolean {
  if (entries.length === 0) return false
  const sorted = [...entries].sort(
    (a, b) => b.clockIn.toMillis() - a.clockIn.toMillis()
  )
  return !sorted[0].clockOut
}

// ─── Finance Utilities ────────────────────────────────────────────────────────

/**
 * Aggregates transactions for a given month (YYYY-MM) into a MonthlySummary.
 */
export function calcMonthlySummary(
  transactions: Transaction[],
  month: string
): MonthlySummary {
  const filtered = transactions.filter((t) => {
    const d = t.date.toDate()
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return m === month
  })

  const totalIncome = filtered
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0)

  const totalExpenses = filtered
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0)

  const byCategory: Record<string, number> = {}
  for (const t of filtered) {
    byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount
  }

  return {
    month,
    totalIncome,
    totalExpenses,
    balance: totalIncome - totalExpenses,
    byCategory,
  }
}

/**
 * Formats a number as BRL currency.
 */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

// ─── Date Utilities ───────────────────────────────────────────────────────────

export function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function todayString(): string {
  const now = new Date()
  return now.toISOString().split('T')[0]
}

export function timestampToLocale(ts: Timestamp): string {
  return ts.toDate().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Calculates the consecutive journaling streak in days up to today.
 */
export function calcJournalStreak(dates: string[]): number {
  if (dates.length === 0) return 0
  const sorted = [...new Set(dates)].sort().reverse()
  let streak = 0
  let cursor = new Date()
  cursor.setHours(0, 0, 0, 0)

  for (const dateStr of sorted) {
    const d = new Date(dateStr + 'T00:00:00')
    const diff = Math.round((cursor.getTime() - d.getTime()) / 86400000)
    if (diff === 0 || diff === 1) {
      streak++
      cursor = d
    } else {
      break
    }
  }
  return streak
}
