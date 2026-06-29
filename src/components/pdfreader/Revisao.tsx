import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'

/* ═══════════════════════════════ REVISÃO ESPAÇADA ═══════════════════════════════
   Cadastra o que foi estudado (com data) e acompanha as revisões em 48h, 7, 17 e 30 dias.
   Cada marco tem data prevista e status (atrasado / hoje / agendado / feito).
   Filtros por pendência e estatísticas. Persistência em users/{uid}/revisoes. */

// ─── Helpers ──
function clean<T extends object>(o: T): T { return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T }
function nid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4) }
function hojeISO() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}` }
function addDias(iso: string, d: number) { const [y, m, dd] = iso.split('-').map(Number); const dt = new Date(y, m - 1, dd); dt.setDate(dt.getDate() + d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` }
function diffDias(aISO: string, bISO: string) { const [ay, am, ad] = aISO.split('-').map(Number); const [by, bm, bd] = bISO.split('-').map(Number); return Math.round((new Date(ay, am - 1, ad).getTime() - new Date(by, bm - 1, bd).getTime()) / 86400000) }
function brData(iso?: string) { return iso ? iso.split('-').reverse().join('/') : '' }

const MARCOS = [
  { key: 'h48', label: '48h', dias: 2 },
  { key: 'd7', label: '7 dias', dias: 7 },
  { key: 'd17', label: '17 dias', dias: 17 },
  { key: 'd30', label: '30 dias', dias: 30 },
] as const
type MarcoKey = typeof MARCOS[number]['key']

interface Rev { id: string; titulo: string; materia?: string; dataEstudo: string; notas?: string; marcos: Partial<Record<MarcoKey, { feitoEm: string }>>; criadoEm: number }

type StatusTipo = 'feito' | 'atrasado' | 'hoje' | 'futuro'
interface StatusMarco { tipo: StatusTipo; venc: string; dias: number; feitoEm?: string }

function statusDoMarco(r: Rev, m: typeof MARCOS[number], hoje: string): StatusMarco {
  const venc = addDias(r.dataEstudo, m.dias)
  const feitoEm = r.marcos?.[m.key]?.feitoEm
  if (feitoEm) return { tipo: 'feito', venc, dias: 0, feitoEm }
  const d = diffDias(venc, hoje) // dias até vencer (negativo = atrasado)
  if (d < 0) return { tipo: 'atrasado', venc, dias: -d }
  if (d === 0) return { tipo: 'hoje', venc, dias: 0 }
  return { tipo: 'futuro', venc, dias: d }
}

const COR: Record<StatusTipo, { bg: string; fg: string; bd: string }> = {
  feito: { bg: 'rgba(16,185,129,.14)', fg: '#10b981', bd: '#10b98155' },
  atrasado: { bg: 'rgba(239,68,68,.14)', fg: '#ef4444', bd: '#ef444455' },
  hoje: { bg: 'rgba(245,158,11,.16)', fg: '#f59e0b', bd: '#f59e0b66' },
  futuro: { bg: 'var(--surface)', fg: 'var(--text-secondary)', bd: 'var(--border-md)' },
}

type Filtro = 'pendentes' | 'hoje' | 'atrasadas' | 'agendadas' | 'concluidas' | 'todas'

export default function Revisao({ open, onClose }: { open: boolean; onClose: () => void }) {
  const uid = useUid()
  const [itens, setItens] = useState<Rev[]>([])
  const [filtro, setFiltro] = useState<Filtro>('pendentes')
  const [busca, setBusca] = useState('')
  // formulário de novo cadastro
  const [novoTit, setNovoTit] = useState('')
  const [novaMat, setNovaMat] = useState('')
  const [novaData, setNovaData] = useState(hojeISO())
  const [novaNota, setNovaNota] = useState('')
  const [formAberto, setFormAberto] = useState(true)

  const hoje = hojeISO()

  useEffect(() => {
    if (!open || !uid || !db) return
    const un = onSnapshot(collection(db, 'users', uid, 'revisoes'), s => setItens(s.docs.map(d => {
      const x = d.data() as Rev
      return { id: d.id, titulo: x.titulo || '', materia: x.materia || '', dataEstudo: x.dataEstudo || hojeISO(), notas: x.notas || '', marcos: x.marcos || {}, criadoEm: x.criadoEm || 0 }
    })))
    return () => un()
  }, [open, uid])

  async function salvar(r: Rev) { if (!uid || !db) return; await setDoc(doc(db, 'users', uid, 'revisoes', r.id), clean(r)) }
  async function adicionar() {
    if (!novoTit.trim() || !uid || !db) return
    const r: Rev = { id: nid(), titulo: novoTit.trim(), materia: novaMat.trim() || undefined, dataEstudo: novaData || hojeISO(), notas: novaNota.trim() || undefined, marcos: {}, criadoEm: Date.now() }
    await salvar(r)
    setNovoTit(''); setNovaMat(''); setNovaNota(''); setNovaData(hojeISO())
  }
  async function excluir(r: Rev) { if (!uid || !db) return; if (!window.confirm(`Excluir a revisão "${r.titulo}"?`)) return; await deleteDoc(doc(db, 'users', uid, 'revisoes', r.id)) }
  function toggleMarco(r: Rev, key: MarcoKey) {
    const ja = r.marcos?.[key]?.feitoEm
    const marcos = { ...(r.marcos || {}) }
    if (ja) delete marcos[key]; else marcos[key] = { feitoEm: hoje }
    salvar({ ...r, marcos })
  }
  function marcarProxima(r: Rev) {
    // marca como feita a primeira revisão pendente (atrasada/hoje, ou a próxima futura se não houver)
    const pend = MARCOS.map(m => ({ m, st: statusDoMarco(r, m, hoje) })).filter(x => x.st.tipo !== 'feito')
    if (!pend.length) return
    pend.sort((a, b) => a.st.venc.localeCompare(b.st.venc))
    toggleMarco(r, pend[0].m.key)
  }
  function mudarData(r: Rev, data: string) { if (data) salvar({ ...r, dataEstudo: data }) }
  function editarTitulo(r: Rev) { const t = window.prompt('Editar título:', r.titulo); if (t && t.trim()) salvar({ ...r, titulo: t.trim() }) }

  // derivados por item
  const comStatus = useMemo(() => itens.map(r => {
    const sts = MARCOS.map(m => ({ m, st: statusDoMarco(r, m, hoje) }))
    const feitos = sts.filter(x => x.st.tipo === 'feito').length
    const atrasado = sts.some(x => x.st.tipo === 'atrasado')
    const eHoje = sts.some(x => x.st.tipo === 'hoje')
    const concluido = feitos === MARCOS.length
    const pendente = atrasado || eHoje
    const proxPend = sts.filter(x => x.st.tipo !== 'feito').sort((a, b) => a.st.venc.localeCompare(b.st.venc))[0]
    return { r, sts, feitos, atrasado, eHoje, concluido, pendente, proxVenc: proxPend?.st.venc || '9999' }
  }), [itens, hoje])

  const filtrados = useMemo(() => {
    let lista = comStatus
    if (busca.trim()) { const q = busca.toLowerCase(); lista = lista.filter(x => x.r.titulo.toLowerCase().includes(q) || (x.r.materia || '').toLowerCase().includes(q)) }
    lista = lista.filter(x => {
      switch (filtro) {
        case 'pendentes': return x.pendente
        case 'hoje': return x.eHoje
        case 'atrasadas': return x.atrasado
        case 'agendadas': return !x.concluido && !x.pendente
        case 'concluidas': return x.concluido
        default: return true
      }
    })
    // ordena: concluídas por último; demais por urgência (próximo vencimento)
    return lista.sort((a, b) => (a.concluido ? 1 : 0) - (b.concluido ? 1 : 0) || a.proxVenc.localeCompare(b.proxVenc))
  }, [comStatus, filtro, busca])

  const stats = useMemo(() => ({
    total: comStatus.length,
    atrasadas: comStatus.filter(x => x.atrasado).length,
    hoje: comStatus.filter(x => x.eHoje && !x.atrasado).length,
    pendentes: comStatus.filter(x => x.pendente).length,
    concluidas: comStatus.filter(x => x.concluido).length,
  }), [comStatus])

  if (!open) return null

  const FILTROS: { id: Filtro; label: string; n?: number }[] = [
    { id: 'pendentes', label: 'Pendentes', n: stats.pendentes },
    { id: 'atrasadas', label: 'Atrasadas', n: stats.atrasadas },
    { id: 'hoje', label: 'Hoje', n: stats.hoje },
    { id: 'agendadas', label: 'Agendadas' },
    { id: 'concluidas', label: 'Concluídas', n: stats.concluidas },
    { id: 'todas', label: 'Todas', n: stats.total },
  ]

  return createPortal(
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: 720, maxWidth: '96vw', height: 'min(86vh, 820px)', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,.45)', overflow: 'hidden' }}>

        {/* cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,rgba(26,115,232,.12),transparent)' }}>
          <span style={{ fontSize: '1.2rem' }}>🔁</span>
          <b style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Revisão Espaçada</b>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '.85rem' }}>✕</button>
        </div>

        {/* estatísticas */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 18px 0', flexWrap: 'wrap' }}>
          {[
            { lbl: 'Atrasadas', v: stats.atrasadas, c: '#ef4444' },
            { lbl: 'Hoje', v: stats.hoje, c: '#f59e0b' },
            { lbl: 'Pendentes', v: stats.pendentes, c: 'var(--accent)' },
            { lbl: 'Concluídas', v: stats.concluidas, c: '#10b981' },
            { lbl: 'Total', v: stats.total, c: 'var(--text-secondary)' },
          ].map(s => (
            <div key={s.lbl} style={{ flex: '1 1 90px', minWidth: 84, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: s.c as string, fontFamily: 'var(--font-display)' }}>{s.v}</div>
              <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.lbl}</div>
            </div>
          ))}
        </div>

        {/* formulário de cadastro (colapsável) */}
        <div style={{ margin: '12px 18px 0', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-1)', overflow: 'hidden' }}>
          <button onClick={() => setFormAberto(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '.85rem', fontWeight: 700 }}>
            <span>{formAberto ? '▾' : '▸'}</span> ＋ Cadastrar o que foi estudado
          </button>
          {formAberto && (
            <div style={{ padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={novoTit} onChange={e => setNovoTit(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') adicionar() }} placeholder="O que estudei (ex.: Licitações — modalidades)" style={inp} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={novaMat} onChange={e => setNovaMat(e.target.value)} placeholder="Matéria (ex.: Direito Administrativo)" style={{ ...inp, flex: 2, minWidth: 180 }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 150 }}>
                  <span style={{ fontSize: '.74rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Estudado em</span>
                  <input type="date" value={novaData} max={hojeISO()} onChange={e => setNovaData(e.target.value)} style={{ ...inp, flex: 1 }} />
                </label>
              </div>
              <textarea value={novaNota} onChange={e => setNovaNota(e.target.value)} placeholder="Notas (opcional)" rows={2} style={{ ...inp, resize: 'vertical' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={adicionar} disabled={!novoTit.trim()} style={{ height: 36, padding: '0 18px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '.85rem', cursor: novoTit.trim() ? 'pointer' : 'default', opacity: novoTit.trim() ? 1 : .5 }}>＋ Adicionar revisão</button>
                <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Agenda automática: 48h · 7 · 17 · 30 dias</span>
              </div>
            </div>
          )}
        </div>

        {/* filtros + busca */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 18px 8px', flexWrap: 'wrap' }}>
          {FILTROS.map(f => (
            <button key={f.id} onClick={() => setFiltro(f.id)} style={{
              height: 30, padding: '0 11px', borderRadius: 999, cursor: 'pointer', fontSize: '.76rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5,
              border: filtro === f.id ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: filtro === f.id ? 'var(--accent)' : 'var(--surface)', color: filtro === f.id ? '#fff' : 'var(--text-secondary)',
            }}>{f.label}{typeof f.n === 'number' && <span style={{ fontSize: '.66rem', opacity: .85 }}>{f.n}</span>}</button>
          ))}
          <span style={{ flex: 1 }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔍 Buscar…" style={{ ...inp, width: 170, height: 30 }} />
        </div>

        {/* lista */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 18px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtrados.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.85rem', padding: '36px 12px' }}>
              {itens.length === 0 ? 'Nenhuma revisão cadastrada ainda. Cadastre o que você estudou acima.' : 'Nada neste filtro. 🎉'}
            </div>
          )}
          {filtrados.map(({ r, sts, feitos, concluido, atrasado, eHoje, proxVenc }) => {
            const corBorda = concluido ? '#10b98155' : atrasado ? '#ef444455' : eHoje ? '#f59e0b66' : 'var(--border)'
            const proxLabel = concluido ? 'Ciclo completo ✓'
              : proxVenc === '9999' ? ''
                : diffDias(proxVenc, hoje) < 0 ? `Atrasada há ${-diffDias(proxVenc, hoje)} dia(s)`
                  : diffDias(proxVenc, hoje) === 0 ? 'Revisar hoje'
                    : `Próxima em ${diffDias(proxVenc, hoje)} dia(s) (${brData(proxVenc)})`
            return (
              <div key={r.id} style={{ border: `1px solid ${corBorda}`, borderRadius: 12, background: 'var(--surface)', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span onDoubleClick={() => editarTitulo(r)} title="Duplo-clique para editar" style={{ fontSize: '.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>{r.titulo}</span>
                      {r.materia && <span style={{ fontSize: '.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--accent-bg)', color: 'var(--accent)' }}>{r.materia}</span>}
                      {concluido && <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#10b981' }}>✓ concluída</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.72rem', color: 'var(--text-muted)' }}>
                        Estudado:
                        <input type="date" value={r.dataEstudo} max={hojeISO()} onChange={e => mudarData(r, e.target.value)} style={{ border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', borderRadius: 6, padding: '2px 6px', fontSize: '.72rem' }} />
                      </label>
                      <span style={{ fontSize: '.72rem', fontWeight: 700, color: concluido ? '#10b981' : atrasado ? '#ef4444' : eHoje ? '#f59e0b' : 'var(--text-secondary)' }}>{proxLabel}</span>
                      <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{feitos}/{MARCOS.length} revisões</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {!concluido && <button onClick={() => marcarProxima(r)} title="Marcar a próxima revisão como feita hoje" style={miniAcao}>✓ Revisei</button>}
                    <button onClick={() => excluir(r)} title="Excluir" style={{ ...miniAcao, color: '#ef4444' }}>🗑️</button>
                  </div>
                </div>

                {/* marcos */}
                <div style={{ display: 'flex', gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
                  {sts.map(({ m, st }) => {
                    const c = COR[st.tipo]
                    const sub = st.tipo === 'feito' ? `feita ${brData(st.feitoEm)}`
                      : st.tipo === 'atrasado' ? `atrasada ${st.dias}d`
                        : st.tipo === 'hoje' ? 'hoje'
                          : `em ${st.dias}d`
                    return (
                      <button key={m.key} onClick={() => toggleMarco(r, m.key)}
                        title={st.tipo === 'feito' ? 'Clique para desmarcar' : `Revisão de ${m.label} — prevista ${brData(st.venc)} — clique para marcar como feita`}
                        style={{ flex: '1 1 110px', minWidth: 100, textAlign: 'left', padding: '7px 9px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${c.bd}`, background: c.bg, color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: '.78rem' }}>{st.tipo === 'feito' ? '✅' : st.tipo === 'atrasado' ? '⚠️' : st.tipo === 'hoje' ? '🔔' : '🕒'}</span>
                          <b style={{ fontSize: '.78rem', color: c.fg as string }}>{m.label}</b>
                        </div>
                        <div style={{ fontSize: '.64rem', color: 'var(--text-muted)', marginTop: 2 }}>{brData(st.venc)} · {sub}</div>
                      </button>
                    )
                  })}
                </div>

                {r.notas && <div style={{ marginTop: 8, fontSize: '.78rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.45, paddingTop: 8, borderTop: '1px solid var(--border)' }}>{r.notas}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}

const inp: React.CSSProperties = { border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-primary)', borderRadius: 8, padding: '8px 10px', fontSize: '.84rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }
const miniAcao: React.CSSProperties = { height: 28, padding: '0 9px', borderRadius: 7, border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '.72rem', fontWeight: 700, whiteSpace: 'nowrap' }
