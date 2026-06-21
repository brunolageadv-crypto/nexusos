// similaridade.ts — motor de similaridade entre editais + sincronização cruzada
// DESTINO: src/components/editais/similaridade.ts
import { useEffect, useMemo, useState, useCallback } from 'react'
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'
import { useEditaisCadastrados, defaultSubtopicoState } from '../../hooks/useEdital'
import type { SubtopicoState } from '../../hooks/useEdital'
import { AGU_DISCIPLINAS } from './aguData'
import { PGM_BH_DISCIPLINAS } from './pgmBhData'
import { PGM_CWB_DISCIPLINAS } from './pgmCuritibaData'

export interface EditalLite { id: string; nome: string; cor: string; disciplinas: { id: string; nome: string; topicos: { id: string; nome: string; subtopicos: { id: string; nome: string }[] }[] }[] }

export const EDITAIS_FIXOS: EditalLite[] = [
  { id: 'agu-advogado-uniao', nome: 'AGU — Advogado da União', cor: '#4f46e5', disciplinas: AGU_DISCIPLINAS as any },
  { id: 'pgm-bh-procurador', nome: 'PGM-BH — Procurador', cor: '#0ea5e9', disciplinas: PGM_BH_DISCIPLINAS as any },
  { id: 'pgm-curitiba-procurador', nome: 'PGM-Curitiba — Procurador', cor: '#16a34a', disciplinas: PGM_CWB_DISCIPLINAS as any },
]

// ─── normalização e similaridade ─────────────────────────────────────────────
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'um', 'uma', 'para', 'por', 'com', 'sua', 'seu', 'art', 'arts', 'cf'])
export function normalizar(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}
function tokens(norm: string): Set<string> {
  return new Set(norm.split(' ').filter(w => w.length > 2 && !STOP.has(w)))
}
// coeficiente de Dice sobre tokens (0..1)
export function similaridade(normA: string, normB: string): number {
  if (normA === normB) return 1
  const A = tokens(normA), B = tokens(normB)
  if (!A.size || !B.size) return 0
  let inter = 0; A.forEach(x => { if (B.has(x)) inter++ })
  return (2 * inter) / (A.size + B.size)
}

export interface SubRef { editalId: string; editalNome: string; cor: string; disciplina: string; topico: string; subId: string; nome: string; norm: string }

export function coletarSubtopicos(editais: EditalLite[]): SubRef[] {
  const out: SubRef[] = []
  for (const e of editais) for (const d of e.disciplinas) for (const t of d.topicos) for (const s of t.subtopicos)
    out.push({ editalId: e.id, editalNome: e.nome, cor: e.cor, disciplina: d.nome, topico: t.nome, subId: s.id, nome: s.nome, norm: normalizar(s.nome) })
  return out
}

export interface Candidato { a: string; b: string; score: number; exA: string; exB: string; editaisA: string[]; editaisB: string[] }

// constrói grupos de equivalência (norm idêntico = automático; aproximado = só se confirmado)
export function construirGrupos(subs: SubRef[], confirmados: string[], rejeitados: string[], limiar = 0.72) {
  const normInfo = new Map<string, { exemplo: string; editais: Set<string> }>()
  for (const s of subs) {
    const inf = normInfo.get(s.norm) || { exemplo: s.nome, editais: new Set<string>() }
    inf.editais.add(s.editalId); normInfo.set(s.norm, inf)
  }
  const norms = [...normInfo.keys()]
  // union-find sobre norms
  const parent: Record<string, string> = {}; norms.forEach(n => parent[n] = n)
  const find = (x: string): string => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }
  const confSet = new Set(confirmados)
  for (const key of confSet) { const [a, b] = key.split('|||'); if (parent[a] !== undefined && parent[b] !== undefined) union(a, b) }
  // candidatos aproximados ainda não decididos
  const rejSet = new Set(rejeitados)
  const candidatos: Candidato[] = []
  for (let i = 0; i < norms.length; i++) for (let j = i + 1; j < norms.length; j++) {
    const a = norms[i], b = norms[j]
    const key = [a, b].sort().join('|||')
    if (confSet.has(key) || rejSet.has(key)) continue
    const sc = similaridade(a, b)
    if (sc >= limiar && sc < 1) {
      const ia = normInfo.get(a)!, ib = normInfo.get(b)!
      candidatos.push({ a, b, score: sc, exA: ia.exemplo, exB: ib.exemplo, editaisA: [...ia.editais], editaisB: [...ib.editais] })
    }
  }
  candidatos.sort((x, y) => y.score - x.score)
  // groupId por norm + membros por grupo
  const groupOfNorm = new Map<string, string>(); norms.forEach(n => groupOfNorm.set(n, find(n)))
  const subToGroup = new Map<string, string>()
  const groupMembers = new Map<string, SubRef[]>()
  for (const s of subs) {
    const g = groupOfNorm.get(s.norm) || s.norm
    subToGroup.set(s.editalId + '::' + s.subId, g)
    const arr = groupMembers.get(g) || []; arr.push(s); groupMembers.set(g, arr)
  }
  return { candidatos, subToGroup, groupMembers, groupOfNorm }
}

export interface ParStats { aId: string; aNome: string; bId: string; bNome: string; comuns: number; totalA: number; pct: number }
export interface EditalStats { id: string; nome: string; cor: string; total: number; compartilhados: number; exclusivos: number }

export function estatisticas(editais: EditalLite[], subs: SubRef[], groupMembers: Map<string, SubRef[]>, subToGroup: Map<string, string>) {
  const porEdital = new Map<string, SubRef[]>()
  for (const s of subs) { const a = porEdital.get(s.editalId) || []; a.push(s); porEdital.set(s.editalId, a) }
  const editaisDoGrupo = (g: string) => new Set((groupMembers.get(g) || []).map(m => m.editalId))
  // pares
  const pares: ParStats[] = []
  for (let i = 0; i < editais.length; i++) for (let j = 0; j < editais.length; j++) {
    if (i === j) continue
    const A = editais[i], B = editais[j]
    const subsA = porEdital.get(A.id) || []
    let comuns = 0
    for (const s of subsA) { const g = subToGroup.get(s.editalId + '::' + s.subId)!; if (editaisDoGrupo(g).has(B.id)) comuns++ }
    pares.push({ aId: A.id, aNome: A.nome, bId: B.id, bNome: B.nome, comuns, totalA: subsA.length, pct: subsA.length ? Math.round((comuns / subsA.length) * 100) : 0 })
  }
  // por edital
  const porEditalStats: EditalStats[] = editais.map(e => {
    const subsE = porEdital.get(e.id) || []
    let comp = 0
    for (const s of subsE) { const g = subToGroup.get(s.editalId + '::' + s.subId)!; if (editaisDoGrupo(g).size > 1) comp++ }
    return { id: e.id, nome: e.nome, cor: e.cor, total: subsE.length, compartilhados: comp, exclusivos: subsE.length - comp }
  })
  const totalSub = subs.length
  const gruposCompartilhados = [...groupMembers.values()].filter(m => new Set(m.map(x => x.editalId)).size > 1).length
  return { pares, porEdital: porEditalStats, totalSub, totalGrupos: groupMembers.size, gruposCompartilhados }
}

// ─── persistência de config ───────────────────────────────────────────────────
export interface SimConfig { syncOn: boolean; confirmados: string[]; rejeitados: string[] }
const localKeyEdital = (id: string) => `nexusos_edital_${id}`

// ─── hook principal ─────────────────────────────────────────────────────────
export function useSimilaridade() {
  const uid = useUid()
  const { editais: custom } = useEditaisCadastrados()
  const [config, setConfig] = useState<SimConfig>({ syncOn: true, confirmados: [], rejeitados: [] })

  const editais: EditalLite[] = useMemo(() => {
    const fixosIds = new Set(EDITAIS_FIXOS.map(e => e.id))
    const extras = (custom || []).filter(e => !fixosIds.has(e.id)).map(e => ({ id: e.id, nome: e.nome, cor: e.cor, disciplinas: e.disciplinas as any }))
    return [...EDITAIS_FIXOS, ...extras]
  }, [custom])

  useEffect(() => {
    if (!uid) return
    return onSnapshot(doc(db, 'users', uid, 'editaisSimilaridade', 'config'), snap => {
      if (snap.exists()) setConfig({ syncOn: true, confirmados: [], rejeitados: [], ...(snap.data() as Partial<SimConfig>) })
    })
  }, [uid])

  const subs = useMemo(() => coletarSubtopicos(editais), [editais])
  const grupos = useMemo(() => construirGrupos(subs, config.confirmados, config.rejeitados), [subs, config.confirmados, config.rejeitados])
  const stats = useMemo(() => estatisticas(editais, subs, grupos.groupMembers, grupos.subToGroup), [editais, subs, grupos])

  const salvarConfig = useCallback(async (c: SimConfig) => {
    setConfig(c)
    if (uid) await setDoc(doc(db, 'users', uid, 'editaisSimilaridade', 'config'), c)
  }, [uid])
  const confirmar = useCallback((a: string, b: string) => {
    const key = [a, b].sort().join('|||')
    salvarConfig({ ...config, confirmados: [...new Set([...config.confirmados, key])], rejeitados: config.rejeitados.filter(k => k !== key) })
  }, [config, salvarConfig])
  const rejeitar = useCallback((a: string, b: string) => {
    const key = [a, b].sort().join('|||')
    salvarConfig({ ...config, rejeitados: [...new Set([...config.rejeitados, key])], confirmados: config.confirmados.filter(k => k !== key) })
  }, [config, salvarConfig])
  const setSyncOn = useCallback((v: boolean) => salvarConfig({ ...config, syncOn: v }), [config, salvarConfig])

  // propaga uma alteração para os subtópicos equivalentes nos OUTROS editais
  const propagate = useCallback(async (sourceEditalId: string, subId: string, partial: Partial<SubtopicoState>) => {
    if (!uid || !config.syncOn) return
    const g = grupos.subToGroup.get(sourceEditalId + '::' + subId)
    if (!g) return
    const membros = (grupos.groupMembers.get(g) || []).filter(m => m.editalId !== sourceEditalId)
    for (const m of membros) {
      try {
        const ref = doc(db, 'users', uid, 'editaisProgress', m.editalId)
        const snap = await getDoc(ref)
        const docData = (snap.exists() ? snap.data() : {}) as Record<string, SubtopicoState>
        const cur = { ...defaultSubtopicoState(), ...(docData[m.subId] || {}) }
        const next = { ...cur, ...partial }
        await setDoc(ref, { [m.subId]: next }, { merge: true })
        try { const lk = localKeyEdital(m.editalId); const raw = localStorage.getItem(lk); const cache = raw ? JSON.parse(raw) : {}; cache[m.subId] = next; localStorage.setItem(lk, JSON.stringify(cache)) } catch { /* ignore */ }
      } catch (e) { console.error('propagate', e) }
    }
  }, [uid, config.syncOn, grupos])

  return { uid, editais, subs, grupos, stats, config, syncOn: config.syncOn, setSyncOn, confirmar, rejeitar, propagate }
}
