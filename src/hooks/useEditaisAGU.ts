import { useEffect, useState, useCallback } from 'react'
import { doc, setDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from './useAuth'

export type StatusMaterial = 'nao_iniciado' | 'iniciado' | 'concluido'

export interface SubtopicoProgress {
  subtId: string
  statusMaterial: StatusMaterial
  statusResumo: StatusMaterial
  fichado: boolean
  dataRevisao?: string
  questoes: number
  acertos: number
  driveLink?: string
  obs?: string
}

export interface SimuladoEntry {
  id: string
  data: string
  banca: string
  totalQuestoes: number
  acertos: number
  erros: number
  branco: number
  tempoMinutos: number
  pioresDisciplinas: string
  observacoes: string
}

type ProgressMap = Record<string, SubtopicoProgress>

export function useEditaisAGU() {
  const { user } = useAuth()
  const [progress, setProgress] = useState<ProgressMap>({})
  const [simulados, setSimulados] = useState<SimuladoEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const ref = doc(db, 'editaisAGU', user.uid)
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        const data = snap.data()
        setProgress(data.progress ?? {})
        setSimulados(data.simulados ?? [])
      }
      setLoading(false)
    })
    return unsub
  }, [user])

  const saveProgress = useCallback(async (subtId: string, updates: Partial<SubtopicoProgress>) => {
    if (!user) return
    const current = progress[subtId] ?? {
      subtId,
      statusMaterial: 'nao_iniciado' as StatusMaterial,
      statusResumo: 'nao_iniciado' as StatusMaterial,
      fichado: false,
      questoes: 0,
      acertos: 0,
    }
    const updated = { ...current, ...updates, subtId }
    const newProgress = { ...progress, [subtId]: updated }
    setProgress(newProgress)
    await setDoc(doc(db, 'editaisAGU', user.uid), { progress: newProgress, simulados }, { merge: true })
  }, [user, progress, simulados])

  const saveSimulado = useCallback(async (simulado: SimuladoEntry) => {
    if (!user) return
    const existing = simulados.findIndex(s => s.id === simulado.id)
    const updated = existing >= 0
      ? simulados.map(s => s.id === simulado.id ? simulado : s)
      : [...simulados, simulado]
    setSimulados(updated)
    await setDoc(doc(db, 'editaisAGU', user.uid), { progress, simulados: updated }, { merge: true })
  }, [user, progress, simulados])

  const deleteSimulado = useCallback(async (id: string) => {
    if (!user) return
    const updated = simulados.filter(s => s.id !== id)
    setSimulados(updated)
    await setDoc(doc(db, 'editaisAGU', user.uid), { progress, simulados: updated }, { merge: true })
  }, [user, progress, simulados])

  const concluidos = Object.values(progress).filter(p => p.statusMaterial === 'concluido').length
  const iniciados = Object.values(progress).filter(p => p.statusMaterial === 'iniciado').length
  const totalQuestoes = Object.values(progress).reduce((s, p) => s + (p.questoes || 0), 0)
  const totalAcertos = Object.values(progress).reduce((s, p) => s + (p.acertos || 0), 0)
  const pctAcerto = totalQuestoes > 0 ? Math.round((totalAcertos / totalQuestoes) * 100) : 0

  return {
    progress, simulados, loading,
    saveProgress, saveSimulado, deleteSimulado,
    stats: { concluidos, iniciados, totalQuestoes, totalAcertos, pctAcerto },
  }
}
