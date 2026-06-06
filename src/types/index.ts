import { Timestamp } from 'firebase/firestore'

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface NexusUser {
  uid: string
  displayName: string
  email: string
  photoURL: string
  createdAt: Timestamp
  settings: UserSettings
}

export interface UserSettings {
  expectedDailyHours: number
  currency: string
  theme: 'dark' | 'light' | 'system'
  timezone: string
}

// ─── Media Tracker ───────────────────────────────────────────────────────────

export type MediaType = 'film' | 'show' | 'book'
export type MediaStatus = 'watching' | 'paused' | 'completed' | 'dropped' | 'planned'

export interface MediaItem {
  id: string
  userId: string
  type: MediaType
  title: string
  coverUrl?: string
  totalEpisodes?: number    // shows
  watchedEpisodes?: number  // shows
  totalPages?: number       // books
  currentPage?: number      // books
  status: MediaStatus
  rating?: number           // 0-10
  notes?: string
  startedAt?: Timestamp
  finishedAt?: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Ponto Eletrônico ─────────────────────────────────────────────────────────

export interface TimeEntry {
  id: string
  userId: string
  date: string              // YYYY-MM-DD
  clockIn: Timestamp
  clockOut?: Timestamp
  breakMinutes: number
  expectedHours: number     // e.g. 8
  notes?: string
  createdAt: Timestamp
}

export interface TimeSummary {
  date: string
  workedMinutes: number
  expectedMinutes: number
  balanceMinutes: number    // positive = overtime, negative = deficit
}

// ─── Financeiro ──────────────────────────────────────────────────────────────

export type TransactionType = 'income' | 'expense'

export interface Transaction {
  id: string
  userId: string
  type: TransactionType
  amount: number
  category: string
  tags: string[]
  description: string
  date: Timestamp
  createdAt: Timestamp
}

export interface MonthlySummary {
  month: string             // YYYY-MM
  totalIncome: number
  totalExpenses: number
  balance: number
  byCategory: Record<string, number>
}

// ─── Journal ─────────────────────────────────────────────────────────────────

export type MoodLevel = 1 | 2 | 3 | 4 | 5

export interface JournalEntry {
  id: string
  userId: string
  date: string              // YYYY-MM-DD
  content: string           // Markdown
  mood?: MoodLevel
  tags: string[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Dashboard Aggregates ─────────────────────────────────────────────────────

export interface DashboardData {
  media: {
    totalItems: number
    inProgress: number
    completedThisMonth: number
    recentItems: MediaItem[]
  }
  timeTracking: {
    todayBalance: number
    weekBalance: number
    isCheckedIn: boolean
    activeEntry?: TimeEntry
  }
  finance: {
    monthIncome: number
    monthExpenses: number
    monthBalance: number
    lastTransactions: Transaction[]
  }
  journal: {
    totalEntries: number
    lastEntry?: JournalEntry
    streakDays: number
  }
}
