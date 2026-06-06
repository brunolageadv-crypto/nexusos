import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'

export interface SubtopicoState {
  statusMaterial: 'pendente' | 'em_andamento' | 'concluido'
  statusResumo:   'pendente' | 'feito'
  fichado:        boolean
  finalizado:     boolean   // ✅ novo campo — checkbox com tachado
  questoes:       number
  acertos:        number
  dataFinalizacao: string   // 'YYYY-MM-DD' ou ''
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

export type EditaisData = Record<string, SubtopicoState>

const DOC_PATH   = 'nexusos/editaisAGU'
const LOCAL_KEY  = 'nexusos_editaisAGU'
const DEBOUNCE   = 1500

function loadLocal(): EditaisData {
  try { const r = localStorage.getItem(LOCAL_KEY); return r ? JSON.parse(r) : {} }
  catch { return {} }
}
function saveLocal(d: EditaisData) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(d)) } catch {}
}

export function useEditaisAGU() {
  const [data, setData] = useState<EditaisData>({})
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const local = loadLocal()
    setData(local)
    if (db) {
      setSyncing(true)
      getDoc(doc(db, DOC_PATH))
        .then(snap => {
          if (snap.exists()) {
            const remote = snap.data() as EditaisData
            setData(remote)
            saveLocal(remote)
          }
          setLastSync(new Date())
        })
        .catch(console.error)
        .finally(() => setSyncing(false))
    }
  }, [])

  const persist = useCallback((newData: EditaisData) => {
    saveLocal(newData)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (db) {
        setSyncing(true)
        setDoc(doc(db, DOC_PATH), newData)
          .then(() => setLastSync(new Date()))
          .catch(console.error)
          .finally(() => setSyncing(false))
      }
    }, DEBOUNCE)
  }, [])

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
        next === 'pendente'  ? '' :
        cur.dataFinalizacao
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
