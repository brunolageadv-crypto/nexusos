import { useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from './useAuth'
import type { MediaItem, TimeEntry, Transaction, JournalEntry } from '../types'
import {
  calcWorkedMinutes,
  calcBalanceMinutes,
  calcTotalBalance,
  isCurrentlyCheckedIn,
  calcMonthlySummary,
  calcJournalStreak,
  currentMonth,
  todayString,
} from '../utils'

// ─── Media Hook ───────────────────────────────────────────────────────────────

export function useMedia() {
  const { user } = useAuth()
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'media'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MediaItem)))
      setLoading(false)
    })
    return unsub
  }, [user])

  async function addItem(data: Omit<MediaItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) {
    if (!user) return
    await addDoc(collection(db, 'media'), {
      ...data,
      userId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  async function updateItem(id: string, data: Partial<MediaItem>) {
    await updateDoc(doc(db, 'media', id), { ...data, updatedAt: serverTimestamp() })
  }

  async function deleteItem(id: string) {
    await deleteDoc(doc(db, 'media', id))
  }

  return { items, loading, addItem, updateItem, deleteItem }
}

// ─── Ponto Eletrônico Hook ────────────────────────────────────────────────────

export function usePonto() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'timeEntries'),
      where('userId', '==', user.uid),
      orderBy('clockIn', 'desc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimeEntry)))
      setLoading(false)
    })
    return unsub
  }, [user])

  async function clockIn(expectedHours = 8, notes?: string) {
    if (!user) return
    await addDoc(collection(db, 'timeEntries'), {
      userId: user.uid,
      date: todayString(),
      clockIn: serverTimestamp(),
      clockOut: null,
      breakMinutes: 0,
      expectedHours,
      notes: notes ?? '',
      createdAt: serverTimestamp(),
    })
  }

  async function clockOut(id: string, breakMinutes = 0) {
    await updateDoc(doc(db, 'timeEntries', id), {
      clockOut: serverTimestamp(),
      breakMinutes,
    })
  }

  const checkedIn = isCurrentlyCheckedIn(entries)
  const activeEntry = checkedIn
    ? entries.find((e) => !e.clockOut)
    : undefined

  const todayEntries = entries.filter((e) => e.date === todayString())
  const todayBalance = calcTotalBalance(todayEntries)

  const thisWeek = entries.filter((e) => {
    const d = new Date(e.date)
    const now = new Date()
    const diff = Math.round((now.getTime() - d.getTime()) / 86400000)
    return diff < 7
  })
  const weekBalance = calcTotalBalance(thisWeek)

  return {
    entries,
    loading,
    checkedIn,
    activeEntry,
    todayBalance,
    weekBalance,
    clockIn,
    clockOut,
  }
}

// ─── Finance Hook ─────────────────────────────────────────────────────────────

export function useFinance() {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction)))
      setLoading(false)
    })
    return unsub
  }, [user])

  async function addTransaction(
    data: Omit<Transaction, 'id' | 'userId' | 'createdAt'>
  ) {
    if (!user) return
    await addDoc(collection(db, 'transactions'), {
      ...data,
      userId: user.uid,
      createdAt: serverTimestamp(),
    })
  }

  async function deleteTransaction(id: string) {
    await deleteDoc(doc(db, 'transactions', id))
  }

  const monthlySummary = calcMonthlySummary(transactions, currentMonth())

  return {
    transactions,
    loading,
    monthlySummary,
    addTransaction,
    deleteTransaction,
  }
}

// ─── Journal Hook ─────────────────────────────────────────────────────────────

export function useJournal() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'journalEntries'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as JournalEntry)))
      setLoading(false)
    })
    return unsub
  }, [user])

  async function saveEntry(data: Omit<JournalEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) {
    if (!user) return
    const existing = entries.find((e) => e.date === data.date)
    if (existing) {
      await updateDoc(doc(db, 'journalEntries', existing.id), {
        ...data,
        updatedAt: serverTimestamp(),
      })
    } else {
      await addDoc(collection(db, 'journalEntries'), {
        ...data,
        userId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }
  }

  async function deleteEntry(id: string) {
    await deleteDoc(doc(db, 'journalEntries', id))
  }

  const streak = calcJournalStreak(entries.map((e) => e.date))

  return { entries, loading, streak, saveEntry, deleteEntry }
}
