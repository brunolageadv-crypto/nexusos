// useEdital.ts — hook genérico para acompanhamento de qualquer edital
import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../lib/firebase'
import { doc, getDoc, setDoc, collection, onSnapshot } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { getAuth } from 'firebase/auth'

function useUid() {
  const [uid, setUid] = useState<string | null>(null)
  useEffect(() => {
    const auth = getAuth()
    return onAuthStateChanged(auth, user => setUid(user?.uid ?? null))
  }, [])
  return uid
}

export interface SubtopicoState {
  statusMaterial: 'pendente' | 'em_andamento' | 'concluido'
  statusResumo:   'pendente' | 'feito'
  fichado:        boolean
  finalizado:     boolean
  questoes:       number
  acertos:        number
  dataFinalizacao: string
  ultimaRevisao:   string
}

export function defaultSubtopicoState(): SubtopicoState {
  return {
    statusMaterial:  'pendente',
    statusResumo:    'pendente',
    fichado:         false,
    finalizado:      false,
    questoes:        0,
    acertos:         0,
    dataFinalizacao: '',
    ultimaRevisao:   '',
  }
}

export type EditalData = Record<string, SubtopicoState>

const DEBOUNCE = 1500

function localKey(editalId: string) { return `nexusos_edital_${editalId}` }
function loadLocal(editalId: string): EditalData {
  try { const r = localStorage.getItem(localKey(editalId)); return r ? JSON.parse(r) : {} } catch { return {} }
}
function saveLocal(editalId: string, d: EditalData) {
  try { localStorage.setItem(localKey(editalId), JSON.stringify(d)) } catch {}
}

export function useEdital(editalId: string) {
  const uid = useUid()
  const [data, setData] = useState<EditalData>(() => loadLocal(editalId))
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!uid || !editalId) return
    const local = loadLocal(editalId)
    setData(local)
    setSyncing(true)
    getDoc(doc(db, 'users', uid, 'editaisProgress', editalId))
      .then(snap => {
        if (snap.exists()) {
          const remote = snap.data() as EditalData
          setData(remote)
          saveLocal(editalId, remote)
        }
        setLastSync(new Date())
      })
      .catch(console.error)
      .finally(() => setSyncing(false))
  }, [uid, editalId])

  const persist = useCallback((newData: EditalData) => {
    saveLocal(editalId, newData)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (uid) {
        setSyncing(true)
        setDoc(doc(db, 'users', uid, 'editaisProgress', editalId), newData)
          .then(() => setLastSync(new Date()))
          .catch(console.error)
          .finally(() => setSyncing(false))
      }
    }, DEBOUNCE)
  }, [uid, editalId])

  const getState = useCallback(
    (id: string): SubtopicoState => ({ ...defaultSubtopicoState(), ...(data[id] ?? {}) }),
    [data]
  )

  const updateField = useCallback(
    <K extends keyof SubtopicoState>(id: string, field: K, value: SubtopicoState[K]) => {
      setData(prev => {
        const cur = { ...defaultSubtopicoState(), ...(prev[id] ?? {}) }
        const next = { ...prev, [id]: { ...cur, [field]: value } }
        persist(next)
        return next
      })
    },
    [persist]
  )

  const cycleStatus = useCallback((id: string) => {
    setData(prev => {
      const cur = { ...defaultSubtopicoState(), ...(prev[id] ?? {}) }
      const cycle: SubtopicoState['statusMaterial'][] = ['pendente', 'em_andamento', 'concluido']
      const next = cycle[(cycle.indexOf(cur.statusMaterial) + 1) % cycle.length]
      const dataFinalizacao =
        next === 'concluido' ? (cur.dataFinalizacao || new Date().toISOString().slice(0, 10)) :
        next === 'pendente'  ? '' : cur.dataFinalizacao
      const updated = { ...prev, [id]: { ...cur, statusMaterial: next, dataFinalizacao } }
      persist(updated)
      return updated
    })
  }, [persist])

  const getStats = useCallback((ids: string[]) => {
    const states = ids.map(id => ({ ...defaultSubtopicoState(), ...(data[id] ?? {}) }))
    const total       = states.length
    const concluidos  = states.filter(s => s.statusMaterial === 'concluido').length
    const emAndamento = states.filter(s => s.statusMaterial === 'em_andamento').length
    const finalizados = states.filter(s => s.finalizado).length
    const questoes    = states.reduce((a, s) => a + (s.questoes || 0), 0)
    const acertos     = states.reduce((a, s) => a + (s.acertos  || 0), 0)
    const pctConcluido = total    ? Math.round((concluidos / total)   * 100) : 0
    const pctAcerto    = questoes ? Math.round((acertos   / questoes) * 100) : 0
    return { total, concluidos, emAndamento, finalizados, questoes, acertos, pctConcluido, pctAcerto }
  }, [data])

  return { data, getState, updateField, cycleStatus, getStats, syncing, lastSync }
}

// ─── Hook para listar editais cadastrados do usuário ──────────────────────────
export interface EditalCadastrado {
  id: string
  nome: string
  orgao: string
  cargo: string
  ano: string
  dataProva?: string
  cor: string
  descricao?: string
  disciplinas: DisciplinaEdital[]
  criadoEm: number
}

export interface DisciplinaEdital {
  id: string
  nome: string
  cor: string
  topicos: TopicoEdital[]
}

export interface TopicoEdital {
  id: string
  nome: string
  subtopicos: SubtopicoEdital[]
}

export interface SubtopicoEdital {
  id: string
  nome: string
}

export function useEditaisCadastrados() {
  const uid = useUid()
  const [editais, setEditais] = useState<EditalCadastrado[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, 'users', uid, 'editais'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as EditalCadastrado))
        .sort((a, b) => b.criadoEm - a.criadoEm)
      setEditais(list)
      setLoading(false)
    })
  }, [uid])

  return { editais, loading }
}
