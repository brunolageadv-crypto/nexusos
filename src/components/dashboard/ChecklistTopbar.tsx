// @ts-nocheck
/* ════════════════════════════════════════════════════════════════════
   CHECK LIST DO DIA — botão no topo + popup ao passar o mouse
   --------------------------------------------------------------------
   • Atividades rápidas com 4 tipos de recorrência:
       diária  → renova todo dia
       dia     → só naquele dia
       semana  → durante aquela semana
       mês     → durante aquele mês
   • Marcação por check; o botão mostra pendências do dia.
   • Compartilha as coleções do app: checklist_items / checklist_marcas
   ════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const hojeISO = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
function clean<T extends object>(o: T): T { return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T }
function weekKey(iso: string) {
  const d = new Date(iso + 'T00:00:00'); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const w = new Date(d.getFullYear(), 0, 4)
  const n = 1 + Math.round(((d.getTime() - w.getTime()) / 86400000 - 3 + ((w.getDay() + 6) % 7)) / 7)
  return d.getFullYear() + '-W' + n
}

type Tipo = 'diaria' | 'dia' | 'semana' | 'mes'
const TIPO_CFG: Record<Tipo, { label: string; curto: string; cor: string }> = {
  diaria: { label: 'Todo dia', curto: 'diária', cor: '#0F9D58' },
  dia: { label: 'Só hoje', curto: 'dia', cor: '#1A73E8' },
  semana: { label: 'Esta semana', curto: 'semana', cor: '#8B5CF6' },
  mes: { label: 'Este mês', curto: 'mês', cor: '#F29900' },
}

function tipoDe(it: any): Tipo { return (it.tipo as Tipo) || (it.recorrente ? 'diaria' : 'dia') }

export default function ChecklistTopbar() {
  const uid = useUid()
  const [items, setItems] = useState<any[]>([])
  const [marcas, setMarcas] = useState<Record<string, any>>({})
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [novo, setNovo] = useState('')
  const [tipo, setTipo] = useState<Tipo>('diaria')
  const closeT = useRef<any>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 56, right: 16 })
  const hoje = hojeISO()

  useEffect(() => {
    if (!uid || !db) return
    const u1 = onSnapshot(collection(db, `users/${uid}/checklist_items`), s => setItems(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    const u2 = onSnapshot(collection(db, `users/${uid}/checklist_marcas`), s => {
      const m: Record<string, any> = {}; s.docs.forEach(d => { m[d.id] = d.data() }); setMarcas(m)
    })
    return () => { u1(); u2() }
  }, [uid])

  /* visível hoje? */
  const visivel = useCallback((it: any) => {
    const t = tipoDe(it)
    if (t === 'diaria') return true
    if (t === 'dia') return it.criadoNaData === hoje
    if (t === 'semana') return weekKey(it.criadoNaData || hoje) === weekKey(hoje)
    if (t === 'mes') return (it.criadoNaData || hoje).slice(0, 7) === hoje.slice(0, 7)
    return false
  }, [hoje])

  const marcaId = (it: any) => {
    const t = tipoDe(it)
    if (t === 'diaria') return `${it.id}_${hoje}`
    if (t === 'dia') return `${it.id}_${it.criadoNaData || hoje}`
    return it.id   // semana / mês: conclusão única
  }
  const feito = (it: any) => !!marcas[marcaId(it)]?.feito

  const visiveis = useMemo(() => items.filter(visivel).sort((a, b) => {
    const f = Number(feito(a)) - Number(feito(b)); if (f) return f
    return (a.criadoEm || 0) - (b.criadoEm || 0)
  }), [items, marcas, hoje])

  const pendentes = visiveis.filter(it => !feito(it)).length
  const total = visiveis.length

  const toggle = async (it: any) => {
    if (!uid) return
    const id = marcaId(it)
    const t = tipoDe(it)
    const data = t === 'diaria' ? hoje : (it.criadoNaData || hoje)
    await setDoc(doc(db, `users/${uid}/checklist_marcas`, id), clean({ id, itemId: it.id, data, feito: !feito(it), feitaEm: Date.now() }), { merge: true })
  }

  const add = async () => {
    if (!uid || !novo.trim()) return
    const id = newId()
    await setDoc(doc(db, `users/${uid}/checklist_items`, id), clean({
      id, titulo: novo.trim(), tipo, recorrente: tipo === 'diaria',
      criadoEm: Date.now(), criadoNaData: hoje,
    }))
    setNovo('')
  }
  const remover = async (it: any) => { if (uid) await deleteDoc(doc(db, `users/${uid}/checklist_items`, it.id)) }

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
  }, [])
  const enter = () => { clearTimeout(closeT.current); place(); setOpen(true) }
  const leave = () => { if (!pinned) closeT.current = setTimeout(() => setOpen(false), 220) }
  useEffect(() => {
    if (!open) return
    const h = () => place()
    window.addEventListener('resize', h); window.addEventListener('scroll', h, true)
    return () => { window.removeEventListener('resize', h); window.removeEventListener('scroll', h, true) }
  }, [open, place])

  const statusCor = total === 0 ? 'var(--text-muted)' : pendentes === 0 ? '#0F9D58' : '#F29900'

  return (
    <div style={{ position: 'relative' }} onMouseEnter={enter} onMouseLeave={leave}>
      <button ref={btnRef} onClick={() => { place(); setPinned(p => !p); setOpen(true) }}
        className="desktop-only topbar-btn"
        title="Check list do dia"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span>✓ Check list</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.66rem', padding: '1px 7px', borderRadius: 20, background: `${statusCor}22`, color: statusCor }}>
          {total === 0 ? '—' : pendentes === 0 ? 'tudo ✓' : `${pendentes} pend.`}
        </span>
      </button>

      {open && createPortal(
        <div onMouseEnter={enter} onMouseLeave={leave}
          style={{ position: 'fixed', top: pos.top, right: pos.right, width: 320, maxHeight: '72vh', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 18px 48px rgba(0,0,0,0.34)', zIndex: 4000, overflow: 'hidden' }}>
          {/* cabeçalho */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-primary)' }}>Check list do dia</div>
              <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {total === 0 ? 'nenhuma atividade hoje' : pendentes === 0 ? '✓ tudo concluído hoje' : `${pendentes} de ${total} pendente(s)`}
              </div>
            </div>
            <button onClick={() => { setPinned(false); setOpen(false) }} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }} title="Fechar">✕</button>
          </div>

          {/* lista */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 4px' }}>
            {visiveis.length === 0
              ? <div style={{ padding: '22px 12px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '0.78rem' }}>Nada por aqui ainda.<br />Cadastre uma atividade abaixo 👇</div>
              : visiveis.map(it => {
                const t = tipoDe(it); const cfg = TIPO_CFG[t]; const done = feito(it)
                return (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 8px', borderRadius: 9, transition: 'background .12s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <button onClick={() => toggle(it)} title={done ? 'Desmarcar' : 'Marcar como feito'}
                      style={{ width: 20, height: 20, flexShrink: 0, borderRadius: 6, border: `2px solid ${done ? '#0F9D58' : 'var(--border-md)'}`, background: done ? '#0F9D58' : 'transparent', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>
                      {done ? '✓' : ''}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.55 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.titulo}</div>
                      <span style={{ fontSize: '0.56rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: cfg.cor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cfg.curto}</span>
                    </div>
                    <button onClick={() => remover(it)} title="Excluir" style={{ border: 'none', background: 'transparent', color: 'var(--text-subtle)', cursor: 'pointer', fontSize: '0.78rem', opacity: 0.7 }}>🗑</button>
                  </div>
                )
              })}
          </div>

          {/* novo */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input value={novo} onChange={e => setNovo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }}
              placeholder="Nova atividade…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border-md)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }} />
            <div style={{ display: 'flex', gap: 5 }}>
              {(Object.keys(TIPO_CFG) as Tipo[]).map(t => (
                <button key={t} onClick={() => setTipo(t)}
                  style={{ flex: 1, padding: '5px 4px', borderRadius: 8, border: `1px solid ${tipo === t ? TIPO_CFG[t].cor : 'var(--border)'}`, background: tipo === t ? `${TIPO_CFG[t].cor}18` : 'transparent', color: tipo === t ? TIPO_CFG[t].cor : 'var(--text-muted)', fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-display)' }}
                  title={TIPO_CFG[t].label}>
                  {TIPO_CFG[t].curto}
                </button>
              ))}
            </div>
            <button onClick={add} disabled={!novo.trim()}
              style={{ padding: '8px', borderRadius: 9, border: 'none', background: novo.trim() ? 'var(--accent)' : 'var(--border)', color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: novo.trim() ? 'pointer' : 'default', fontFamily: 'var(--font-display)' }}>
              ＋ Adicionar
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
