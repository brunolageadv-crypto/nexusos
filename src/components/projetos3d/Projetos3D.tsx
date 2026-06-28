import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, getDoc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'
import { formatBRL } from '../../utils'
import STLViewer, { STLAnalise } from './STLViewer'
import { callLLM3D, iaConfigurada, promptPlanejador, promptTroubleshooting } from './ai3d'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clean<T extends object>(obj: T): T { return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T }
function newId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4) }
function parseISO(d?: string): Date | null { if (!d) return null; const [y, m, dd] = d.split('-').map(Number); if (!y || !m || !dd) return null; return new Date(y, m - 1, dd) }
function todayISO(): string { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}` }
function addDays(d: Date, days: number): Date { const r = new Date(d.getTime()); r.setDate(r.getDate() + days); return r }
function diffDays(from: Date, to: Date): number { return Math.round((new Date(to).setHours(0, 0, 0, 0) - new Date(from).setHours(0, 0, 0, 0)) / 86400000) }
const MAX_STL_BYTES = 700_000

// ─── Tipos ────────────────────────────────────────────────────────────────────
type StatusProj = 'ideia' | 'modelagem' | 'fatiamento' | 'fila' | 'imprimindo' | 'concluido' | 'falhou'

interface Impressora { id: string; nome: string; bx: number; by: number; bz: number; bico: number; materiais: string[]; potencia_w: number; ativa: boolean; criadoEm: number }
interface Filamento { id: string; marca: string; material: string; cor: string; hex: string; peso_total_g: number; peso_restante_g: number; preco: number; temp_bico: number; temp_mesa: number; secagem: boolean; updatedAt: number }
interface Projeto {
  id: string; nome: string; descricao: string; status: StatusProj
  modelo_url: string; foto_url: string
  impressora_id: string; material: string; filamento_id: string
  // análise do STL
  tem_stl: boolean; stl_nome: string; dims_x: number; dims_y: number; dims_z: number; volume_cm3: number; triangulos: number
  // fatiamento (dados que o Creality Print fornece)
  peso_g: number; tempo_min: number; altura_camada: number; infill: number; suportes: boolean
  ai_plano: string
  criadoEm: number; updatedAt: number
}
interface Manutencao { id: string; nome: string; intervalo_dias: number; ultima: string; updatedAt: number }
interface Config3D { tarifa_kwh: number; taxa_falha: number; margem: number; preco_kg_padrao: number }

const STATUS_META: Record<StatusProj, { label: string; cor: string; ordem: number }> = {
  ideia: { label: 'Ideia', cor: '#94a3b8', ordem: 0 },
  modelagem: { label: 'Modelagem', cor: '#6366f1', ordem: 1 },
  fatiamento: { label: 'Fatiamento', cor: '#0ea5e9', ordem: 2 },
  fila: { label: 'Na fila', cor: '#a855f7', ordem: 3 },
  imprimindo: { label: 'Imprimindo', cor: '#f59e0b', ordem: 4 },
  concluido: { label: 'Concluído', cor: '#10b981', ordem: 5 },
  falhou: { label: 'Falhou', cor: '#ef4444', ordem: 6 },
}
const STATUS_LIST: StatusProj[] = ['ideia', 'modelagem', 'fatiamento', 'fila', 'imprimindo', 'concluido', 'falhou']
const MATERIAIS = ['PLA', 'PETG', 'TPU', 'ABS', 'ASA', 'PLA-CF', 'Outro']
const TEMP_PRESET: Record<string, { bico: number; mesa: number }> = { PLA: { bico: 200, mesa: 60 }, PETG: { bico: 235, mesa: 80 }, TPU: { bico: 220, mesa: 45 }, ABS: { bico: 240, mesa: 100 }, ASA: { bico: 245, mesa: 100 }, 'PLA-CF': { bico: 215, mesa: 60 } }

function impressoraPadrao(): Impressora { return { id: newId(), nome: 'Ender 3 V3 SE', bx: 220, by: 220, bz: 250, bico: 0.4, materiais: ['PLA', 'PETG', 'TPU'], potencia_w: 120, ativa: true, criadoEm: Date.now() } }
const MANUT_PADRAO = [
  { nome: 'Nivelar a mesa', intervalo_dias: 14 },
  { nome: 'Limpar o bico', intervalo_dias: 30 },
  { nome: 'Lubrificar eixos e guias', intervalo_dias: 60 },
  { nome: 'Checar tensão das correias', intervalo_dias: 90 },
  { nome: 'Limpar a plataforma de impressão', intervalo_dias: 7 },
]

// ─── Regras de negócio ──────────────────────────────────────────────────────
function cabeNaMesa(p: Projeto, imp: Impressora): { cabe: boolean; motivo: string } {
  if (!p.tem_stl || !p.dims_x) return { cabe: true, motivo: '' }
  const fitFoot = (p.dims_x <= imp.bx && p.dims_y <= imp.by) || (p.dims_y <= imp.bx && p.dims_x <= imp.by)
  const fitZ = p.dims_z <= imp.bz
  if (!fitFoot && !fitZ) return { cabe: false, motivo: 'A peça é maior que a mesa e mais alta que o eixo Z.' }
  if (!fitFoot) return { cabe: false, motivo: 'A base da peça é maior que a área de impressão.' }
  if (!fitZ) return { cabe: false, motivo: 'A peça é mais alta que o eixo Z.' }
  return { cabe: true, motivo: '' }
}

function custoProjeto(p: Projeto, filamentos: Filamento[], cfg: Config3D, imp?: Impressora) {
  const spool = filamentos.find(f => f.id === p.filamento_id)
  const precoPorGrama = spool && spool.peso_total_g > 0 ? spool.preco / spool.peso_total_g : (cfg.preco_kg_padrao || 0) / 1000
  const material = (p.peso_g || 0) * precoPorGrama
  const energia = ((imp?.potencia_w || 120) / 1000) * ((p.tempo_min || 0) / 60) * (cfg.tarifa_kwh || 0)
  const buffer = (material + energia) * ((cfg.taxa_falha || 0) / 100)
  const total = material + energia + buffer
  const comMargem = total * (1 + (cfg.margem || 0) / 100)
  return { material, energia, buffer, total, comMargem }
}

interface Aviso { nivel: 'acao' | 'aviso' | 'info'; msg: string; projeto?: Projeto }
function analisarProjeto(p: Projeto, imp: Impressora | undefined, filamentos: Filamento[]): Aviso[] {
  const out: Aviso[] = []
  if (p.status === 'concluido') return out
  if (p.status === 'falhou') { out.push({ nivel: 'aviso', msg: 'Impressão falhou — revise o que deu errado e tente de novo.', projeto: p }); return out }
  if (p.status === 'ideia') out.push({ nivel: 'acao', msg: 'Defina o modelo: crie no CAD (Tinkercad/Fusion) ou baixe (Printables/MakerWorld).', projeto: p })
  if (!p.tem_stl) out.push({ nivel: 'acao', msg: 'Suba o arquivo STL para análise 3D e checagem na sua impressora.', projeto: p })
  if (p.tem_stl && imp) {
    const fit = cabeNaMesa(p, imp)
    if (!fit.cabe) out.push({ nivel: 'aviso', msg: `${fit.motivo} Precisa redimensionar, reorientar ou dividir o modelo (mais modelagem).`, projeto: p })
    else if (!p.peso_g || !p.tempo_min) out.push({ nivel: 'acao', msg: `Modelo cabe na ${imp.nome}. Falta fatiar no Creality Print e informar o peso (g) e o tempo.`, projeto: p })
  }
  if (p.peso_g && !p.filamento_id) out.push({ nivel: 'acao', msg: 'Selecione o filamento que vai usar.', projeto: p })
  if (p.filamento_id) {
    const f = filamentos.find(x => x.id === p.filamento_id)
    if (f && p.peso_g && f.peso_restante_g < p.peso_g) out.push({ nivel: 'aviso', msg: `Filamento "${f.material} ${f.cor}" insuficiente: faltam ${Math.ceil(p.peso_g - f.peso_restante_g)} g.`, projeto: p })
  }
  const fit = imp ? cabeNaMesa(p, imp) : { cabe: true }
  if (p.tem_stl && fit.cabe && p.peso_g && p.tempo_min && p.filamento_id && (p.status === 'fatiamento' || p.status === 'fila')) {
    out.push({ nivel: 'info', msg: 'Tudo pronto: dá pra enviar pra impressão. 🚀', projeto: p })
  }
  if (p.status === 'imprimindo') out.push({ nivel: 'info', msg: 'Em impressão — registre o resultado quando terminar.', projeto: p })
  return out
}

// ─── UI atoms ─────────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = { padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-md)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', width: '100%' }
function Campo({ label, children, span, hint }: { label: string; children: React.ReactNode; span?: number; hint?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: span ? `span ${span}` : undefined }}>
      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', opacity: 0.85 }}>{hint}</span>}
    </label>
  )
}
function SecTitle({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-accent)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '4px 0 10px' }}>{children}</div> }

const AVISO_COR: Record<Aviso['nivel'], string> = { acao: '#0ea5e9', aviso: '#f59e0b', info: '#10b981' }
const AVISO_IC: Record<Aviso['nivel'], string> = { acao: '👉', aviso: '⚠️', info: '✅' }

// ═══════════════════════════════════════════════════════════════════════════
export default function Projetos3D() {
  const uid = useUid()
  const [aba, setAba] = useState<'projetos' | 'filamentos' | 'manutencao' | 'config'>('projetos')
  const [loading, setLoading] = useState(true)

  const [impressoras, setImpressoras] = useState<Impressora[]>([])
  const [filamentos, setFilamentos] = useState<Filamento[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([])
  const [cfg, setCfg] = useState<Config3D>({ tarifa_kwh: 0.95, taxa_falha: 10, margem: 0, preco_kg_padrao: 120 })

  const [editProj, setEditProj] = useState<Projeto | null>(null)
  const [editFil, setEditFil] = useState<Filamento | null>(null)
  const [editImp, setEditImp] = useState<Impressora | null>(null)
  const seedRef = useRef({ imp: false, manut: false })

  // ── Firestore ──
  useEffect(() => {
    if (!uid || !db) return
    const un1 = onSnapshot(collection(db, 'users', uid, 'impressoras3d'), s => {
      const arr = s.docs.map(d => ({ ...impressoraPadrao(), ...(d.data() as Impressora), id: d.id }))
      setImpressoras(arr.sort((a, b) => a.criadoEm - b.criadoEm))
      if (arr.length === 0 && !seedRef.current.imp) { seedRef.current.imp = true; const p = impressoraPadrao(); setDoc(doc(db, 'users', uid, 'impressoras3d', p.id), clean(p)) }
      setLoading(false)
    })
    const un2 = onSnapshot(collection(db, 'users', uid, 'filamentos3d'), s => setFilamentos(s.docs.map(d => ({ ...(d.data() as Filamento), id: d.id })).sort((a, b) => b.updatedAt - a.updatedAt)))
    const un3 = onSnapshot(collection(db, 'users', uid, 'projetos3d'), s => setProjetos(s.docs.map(d => ({ ...(d.data() as Projeto), id: d.id })).sort((a, b) => b.updatedAt - a.updatedAt)))
    const un4 = onSnapshot(collection(db, 'users', uid, 'manutencao3d'), s => {
      const arr = s.docs.map(d => ({ ...(d.data() as Manutencao), id: d.id }))
      setManutencoes(arr.sort((a, b) => (parseISO(a.ultima)?.getTime() || 0) - (parseISO(b.ultima)?.getTime() || 0)))
      if (arr.length === 0 && !seedRef.current.manut) { seedRef.current.manut = true; MANUT_PADRAO.forEach(m => { const id = newId(); setDoc(doc(db, 'users', uid, 'manutencao3d', id), clean({ id, nome: m.nome, intervalo_dias: m.intervalo_dias, ultima: todayISO(), updatedAt: Date.now() })) }) }
    })
    const un5 = onSnapshot(doc(db, 'users', uid, 'config3d', 'geral'), s => { if (s.exists()) { const base = { tarifa_kwh: 0.95, taxa_falha: 10, margem: 0, preco_kg_padrao: 120 }; setCfg({ ...base, ...(s.data() as Partial<Config3D>) }) } })
    return () => { un1(); un2(); un3(); un4(); un5() }
  }, [uid])

  const impAtiva = useMemo(() => impressoras.find(i => i.ativa) || impressoras[0], [impressoras])

  async function salvarProjeto(p: Projeto) { if (!uid || !db) return; await setDoc(doc(db, 'users', uid, 'projetos3d', p.id), clean({ ...p, updatedAt: Date.now() })); setEditProj(null) }
  async function removerProjeto(p: Projeto) { if (!uid || !db || !window.confirm(`Remover o projeto "${p.nome}"?`)) return; if (p.tem_stl) { try { await deleteDoc(doc(db, 'users', uid, 'projetos3d_stl', p.id)) } catch { /* */ } } await deleteDoc(doc(db, 'users', uid, 'projetos3d', p.id)) }
  async function salvarFilamento(f: Filamento) { if (!uid || !db) return; await setDoc(doc(db, 'users', uid, 'filamentos3d', f.id), clean({ ...f, updatedAt: Date.now() })); setEditFil(null) }
  async function removerFilamento(f: Filamento) { if (!uid || !db || !window.confirm(`Remover o filamento "${f.material} ${f.cor}"?`)) return; await deleteDoc(doc(db, 'users', uid, 'filamentos3d', f.id)) }
  async function salvarImpressora(i: Impressora) {
    if (!uid || !db) return
    if (i.ativa) { for (const o of impressoras) if (o.id !== i.id && o.ativa) await setDoc(doc(db, 'users', uid, 'impressoras3d', o.id), clean({ ...o, ativa: false })) }
    await setDoc(doc(db, 'users', uid, 'impressoras3d', i.id), clean(i)); setEditImp(null)
  }
  async function salvarConfig(c: Config3D) { if (!uid || !db) return; await setDoc(doc(db, 'users', uid, 'config3d', 'geral'), clean(c)) }
  async function marcarManutencao(m: Manutencao) { if (!uid || !db) return; await setDoc(doc(db, 'users', uid, 'manutencao3d', m.id), clean({ ...m, ultima: todayISO(), updatedAt: Date.now() })) }

  // Registrar impressão: baixa filamento e fecha o status
  async function registrarImpressao(p: Projeto, resultado: 'sucesso' | 'falha') {
    if (!uid || !db) return
    const f = filamentos.find(x => x.id === p.filamento_id)
    if (f && p.peso_g) await setDoc(doc(db, 'users', uid, 'filamentos3d', f.id), clean({ ...f, peso_restante_g: Math.max(0, (f.peso_restante_g || 0) - p.peso_g), updatedAt: Date.now() }))
    await setDoc(doc(db, 'users', uid, 'projetos3d', p.id), clean({ ...p, status: resultado === 'sucesso' ? 'concluido' : 'falhou', updatedAt: Date.now() }))
  }

  // ── Avisos globais (orientação) ──
  const avisos = useMemo(() => {
    const out: Aviso[] = []
    projetos.forEach(p => analisarProjeto(p, impAtiva, filamentos).filter(a => a.nivel !== 'info').forEach(a => out.push(a)))
    filamentos.forEach(f => { if (f.peso_restante_g > 0 && f.peso_restante_g < 60) out.push({ nivel: 'aviso', msg: `Filamento "${f.material} ${f.cor}" acabando (${Math.round(f.peso_restante_g)} g restantes).` }) })
    manutencoes.forEach(m => { const prox = parseISO(m.ultima) ? addDays(parseISO(m.ultima)!, m.intervalo_dias) : null; if (prox) { const d = diffDays(new Date(), prox); if (d < 0) out.push({ nivel: 'aviso', msg: `Manutenção atrasada: ${m.nome} (há ${Math.abs(d)} dia(s)).` }); else if (d <= 7) out.push({ nivel: 'acao', msg: `Manutenção em ${d} dia(s): ${m.nome}.` }) } })
    return out.sort((a, b) => (a.nivel === 'aviso' ? -1 : 1) - (b.nivel === 'aviso' ? -1 : 1))
  }, [projetos, filamentos, manutencoes, impAtiva])

  const patrimonioFilamento = useMemo(() => filamentos.reduce((s, f) => s + (f.preco || 0) * ((f.peso_restante_g || 0) / Math.max(1, f.peso_total_g || 1)), 0), [filamentos])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>Carregando Projetos 3D…</div>

  return (
    <div className="p3d-root" style={{ padding: '20px 24px', maxWidth: 1320, margin: '0 auto' }}>
      <style>{`
        .p3d-root button { transition: transform .15s ease, box-shadow .18s ease, filter .15s ease, background .2s ease, border-color .2s ease; }
        .p3d-root button:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.06); }
        .p3d-root button:active:not(:disabled) { transform: translateY(0); filter: brightness(.98); }
        .p3d-root .p3d-prim:hover:not(:disabled) { box-shadow: 0 10px 26px rgba(124,58,237,0.42) !important; }
        .p3d-root .p3d-card { transition: transform .22s cubic-bezier(.34,1.3,.5,1), box-shadow .22s ease, border-color .22s ease; }
        .p3d-root .p3d-card:hover { transform: translateY(-4px); box-shadow: 0 16px 38px rgba(0,0,0,0.22); border-color: var(--accent); }
        .p3d-root .p3d-tab { position: relative; }
        .p3d-root .p3d-tab::after { content:''; position:absolute; left:14px; right:14px; bottom:-3px; height:2px; border-radius:2px; background:var(--accent); transform:scaleX(0); transform-origin:center; transition:transform .22s ease; }
        .p3d-root .p3d-tab:hover::after { transform:scaleX(.6); }
        .p3d-root .p3d-tab-on::after { transform:scaleX(1) !important; }
        .p3d-root input[type=range] { accent-color: var(--accent); }
        .p3d-mb-card { transition: transform .2s ease, box-shadow .2s ease; }
      `}</style>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.6rem' }}>🧩</span>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.5rem', color: 'var(--text-primary)' }}>Projetos 3D</h1>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
            {impAtiva ? `${impAtiva.nome} · ${impAtiva.bx}×${impAtiva.by}×${impAtiva.bz} mm` : 'sem impressora'} · {projetos.length} projeto(s) · {filamentos.length} filamento(s)
          </div>
        </div>
        {aba === 'projetos' && <button onClick={() => setEditProj(novoProjeto(impAtiva?.id || ''))} className="p3d-prim" style={btnPrim}>+ Novo projeto</button>}
        {aba === 'filamentos' && <button onClick={() => setEditFil(novoFilamento())} className="p3d-prim" style={btnPrim}>+ Filamento</button>}
        {aba === 'config' && <button onClick={() => setEditImp(novaImpressora())} className="p3d-prim" style={btnPrim}>+ Impressora</button>}
      </div>

      {/* Painel de avisos (orientação do dia) */}
      {avisos.length > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>🔔 Orientação ({avisos.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {avisos.slice(0, 8).map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span>{AVISO_IC[a.nivel]}</span>
                <span style={{ flex: 1 }}>{a.projeto ? <strong style={{ color: AVISO_COR[a.nivel] }}>{a.projeto.nome}: </strong> : null}{a.msg}</span>
                {a.projeto && <button onClick={() => setEditProj({ ...a.projeto! })} style={{ ...linkBtn }}>abrir</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Abas internas */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 2, flexWrap: 'wrap' }}>
        {([['projetos', '🧩 Projetos'], ['filamentos', '🧵 Filamentos'], ['manutencao', '🔧 Manutenção'], ['config', '⚙️ Impressora & Custos']] as const).map(([id, lb]) => (
          <button key={id} onClick={() => setAba(id)} className={aba === id ? 'p3d-tab p3d-tab-on' : 'p3d-tab'} style={{ padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: aba === id ? 800 : 500, color: aba === id ? 'var(--text-accent)' : 'var(--text-muted)', marginBottom: -3 }}>{lb}</button>
        ))}
      </div>

      {/* ════ PROJETOS ════ */}
      {aba === 'projetos' && (
        projetos.length === 0 ? (
          <Vazio icon="🧩" txt="Nenhum projeto ainda. Clique em “+ Novo projeto”." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 290px), 290px))', gap: 14, justifyContent: 'start' }}>
            {projetos.map(p => {
              const sm = STATUS_META[p.status]
              const fit = impAtiva ? cabeNaMesa(p, impAtiva) : { cabe: true, motivo: '' }
              const custo = custoProjeto(p, filamentos, cfg, impAtiva)
              const acoes = analisarProjeto(p, impAtiva, filamentos).filter(a => a.nivel !== 'info')
              return (
                <div key={p.id} className="p3d-card" style={{ borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  {p.foto_url && <div style={{ height: 140, background: 'var(--bg-3)' }}><img src={p.foto_url} alt={p.nome} loading="lazy" onError={e => { const el = e.currentTarget.parentElement as HTMLElement | null; if (el) el.style.display = 'none' }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>}
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome || 'Sem nome'}</div>
                      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.64rem', fontWeight: 700, color: sm.cor, background: `${sm.cor}18`, whiteSpace: 'nowrap' }}>{sm.label}</span>
                    </div>
                    {p.tem_stl && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>📐 {p.dims_x?.toFixed(0)}×{p.dims_y?.toFixed(0)}×{p.dims_z?.toFixed(0)} mm · {p.volume_cm3?.toFixed(1)} cm³</div>}
                    {p.tem_stl && impAtiva && (
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: fit.cabe ? '#10b981' : '#f59e0b' }}>{fit.cabe ? '✅ Cabe na mesa' : `⚠ ${fit.motivo}`}</div>
                    )}
                    {p.peso_g > 0 && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{p.peso_g} g · {Math.floor(p.tempo_min / 60)}h{p.tempo_min % 60}m · <strong style={{ color: '#10b981' }}>{formatBRL(custo.total)}</strong></div>}
                    {acoes[0] && <div style={{ fontSize: '0.68rem', color: AVISO_COR[acoes[0].nivel], background: `${AVISO_COR[acoes[0].nivel]}12`, padding: '5px 8px', borderRadius: 8 }}>{AVISO_IC[acoes[0].nivel]} {acoes[0].msg}</div>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 6 }}>
                      <button onClick={() => setEditProj({ ...p })} style={{ flex: 1, ...btnSec }}>✏️ Abrir</button>
                      <button onClick={() => removerProjeto(p)} style={btnDel}>🗑️</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ════ FILAMENTOS ════ */}
      {aba === 'filamentos' && (
        <>
          <div style={{ marginBottom: 14, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Valor estimado em estoque: <strong style={{ color: '#10b981' }}>{formatBRL(patrimonioFilamento)}</strong></div>
          {filamentos.length === 0 ? <Vazio icon="🧵" txt="Nenhum filamento cadastrado." /> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 260px))', gap: 14, justifyContent: 'start' }}>
              {filamentos.map(f => {
                const pct = f.peso_total_g > 0 ? Math.round((f.peso_restante_g / f.peso_total_g) * 100) : 0
                const cor = pct < 20 ? '#ef4444' : pct < 40 ? '#f59e0b' : '#10b981'
                return (
                  <div key={f.id} className="p3d-card" style={{ borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 18, height: 18, borderRadius: '50%', background: f.hex || '#888', border: '1px solid var(--border-md)', flexShrink: 0 }} />
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{f.material} {f.cor}</div>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{f.marca} · {formatBRL(f.preco)}/rolo</div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: 3 }}><span style={{ color: 'var(--text-muted)' }}>{Math.round(f.peso_restante_g)}g / {f.peso_total_g}g</span><span style={{ color: cor, fontWeight: 700 }}>{pct}%</span></div>
                      <div style={{ height: 7, borderRadius: 4, background: 'var(--bg-3)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: cor }} /></div>
                    </div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>🌡️ {f.temp_bico}°/{f.temp_mesa}° {f.secagem ? '· precisa secar' : ''}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <button onClick={() => setEditFil({ ...f })} style={{ flex: 1, ...btnSec }}>Editar</button>
                      <button onClick={() => removerFilamento(f)} style={btnDel}>🗑️</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ════ MANUTENÇÃO ════ */}
      {aba === 'manutencao' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 720 }}>
          {manutencoes.map(m => {
            const prox = parseISO(m.ultima) ? addDays(parseISO(m.ultima)!, m.intervalo_dias) : null
            const d = prox ? diffDays(new Date(), prox) : 999
            const cor = d < 0 ? '#ef4444' : d <= 7 ? '#f59e0b' : '#10b981'
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, border: `1px solid ${cor}30`, background: `${cor}0c` }}>
                <span style={{ fontSize: '1.2rem' }}>🔧</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{m.nome}</div>
                  <div style={{ fontSize: '0.7rem', color: cor, fontWeight: 600 }}>{d < 0 ? `Atrasada há ${Math.abs(d)} dia(s)` : d === 0 ? 'Vence hoje' : `Em ${d} dia(s)`} · a cada {m.intervalo_dias}d</div>
                </div>
                <button onClick={() => marcarManutencao(m)} style={btnSec}>✓ Feito hoje</button>
              </div>
            )
          })}
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>As tarefas padrão foram criadas automaticamente. "Feito hoje" reinicia o contador.</div>
        </div>
      )}

      {/* ════ CONFIG ════ */}
      {aba === 'config' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, maxWidth: 900 }}>
          <div style={{ padding: 18, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)' }}>
            <SecTitle>Minhas impressoras</SecTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {impressoras.map(i => (
                <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'var(--bg-1)', border: i.ativa ? '1px solid var(--accent)' : '1px solid transparent' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{i.nome} {i.ativa && <span style={{ fontSize: '0.6rem', color: 'var(--accent)' }}>● ativa</span>}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{i.bx}×{i.by}×{i.bz} mm · bico {i.bico} · {i.potencia_w}W</div>
                  </div>
                  <button onClick={() => setEditImp({ ...i })} style={btnSec}>Editar</button>
                </div>
              ))}
            </div>
          </div>
          <CardCustos cfg={cfg} onSave={salvarConfig} />
        </div>
      )}

      {editProj && <ModalProjeto projeto={editProj} uid={uid} impAtiva={impAtiva} impressoras={impressoras} filamentos={filamentos} cfg={cfg} onChange={setEditProj} onClose={() => setEditProj(null)} onSave={() => salvarProjeto(editProj)} onRegistrar={registrarImpressao} />}
      {editFil && <ModalFilamento fil={editFil} onChange={setEditFil} onClose={() => setEditFil(null)} onSave={() => salvarFilamento(editFil)} />}
      {editImp && <ModalImpressora imp={editImp} onChange={setEditImp} onClose={() => setEditImp(null)} onSave={() => salvarImpressora(editImp)} />}
    </div>
  )
}

// ─── Factories ────────────────────────────────────────────────────────────────
function novoProjeto(impId: string): Projeto { return { id: newId(), nome: '', descricao: '', status: 'ideia', modelo_url: '', foto_url: '', impressora_id: impId, material: 'PLA', filamento_id: '', tem_stl: false, stl_nome: '', dims_x: 0, dims_y: 0, dims_z: 0, volume_cm3: 0, triangulos: 0, peso_g: 0, tempo_min: 0, altura_camada: 0.2, infill: 15, suportes: false, ai_plano: '', criadoEm: Date.now(), updatedAt: Date.now() } }
function novoFilamento(): Filamento { return { id: newId(), marca: '', material: 'PLA', cor: '', hex: '#22aa66', peso_total_g: 1000, peso_restante_g: 1000, preco: 0, temp_bico: 200, temp_mesa: 60, secagem: false, updatedAt: Date.now() } }
function novaImpressora(): Impressora { return { ...impressoraPadrao(), id: newId(), nome: '', ativa: false } }

// ─── Estilos compartilhados ─────────────────────────────────────────────────
const btnPrim: React.CSSProperties = { padding: '9px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#0ea5e9)', color: '#fff', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(124,58,237,0.3)' }
const btnSec: React.CSSProperties = { padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }
const btnDel: React.CSSProperties = { padding: '6px 10px', borderRadius: 8, border: '1px solid #ef444433', background: '#ef444412', color: '#ef4444', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }
const linkBtn: React.CSSProperties = { padding: '3px 9px', borderRadius: 7, border: '1px solid var(--border-md)', background: 'var(--bg-1)', color: 'var(--text-secondary)', fontSize: '0.66rem', fontWeight: 700, cursor: 'pointer' }

function Vazio({ icon, txt }: { icon: string; txt: string }) { return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}><div style={{ fontSize: '2.5rem', marginBottom: 8 }}>{icon}</div>{txt}</div> }

function CardCustos({ cfg, onSave }: { cfg: Config3D; onSave: (c: Config3D) => void }) {
  const [local, setLocal] = useState(cfg)
  useEffect(() => setLocal(cfg), [cfg])
  const set = (k: keyof Config3D, v: number) => setLocal({ ...local, [k]: v })
  return (
    <div style={{ padding: 18, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)' }}>
      <SecTitle>Parâmetros de custo</SecTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
        <Campo label="Tarifa de energia (R$/kWh)"><input type="number" step="0.01" style={inputStyle} value={local.tarifa_kwh || ''} onChange={e => set('tarifa_kwh', Number(e.target.value) || 0)} /></Campo>
        <Campo label="Taxa de falha (%)" hint="Reserva p/ reimpressão"><input type="number" style={inputStyle} value={local.taxa_falha || ''} onChange={e => set('taxa_falha', Number(e.target.value) || 0)} /></Campo>
        <Campo label="Margem p/ venda (%)" hint="0 = só custo"><input type="number" style={inputStyle} value={local.margem || ''} onChange={e => set('margem', Number(e.target.value) || 0)} /></Campo>
        <Campo label="Preço padrão (R$/kg)" hint="Se o projeto não tiver rolo escolhido"><input type="number" style={inputStyle} value={local.preco_kg_padrao || ''} onChange={e => set('preco_kg_padrao', Number(e.target.value) || 0)} /></Campo>
      </div>
      <button onClick={() => onSave(local)} style={{ ...btnPrim, marginTop: 12, width: '100%' }}>Salvar parâmetros</button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL PROJETO
// ═══════════════════════════════════════════════════════════════════════════
function ModalProjeto({ projeto, uid, impAtiva, impressoras, filamentos, cfg, onChange, onClose, onSave, onRegistrar }: {
  projeto: Projeto; uid: string | null; impAtiva?: Impressora; impressoras: Impressora[]; filamentos: Filamento[]; cfg: Config3D
  onChange: (p: Projeto) => void; onClose: () => void; onSave: () => void; onRegistrar: (p: Projeto, r: 'sucesso' | 'falha') => void
}) {
  const set = <K extends keyof Projeto>(k: K, v: Projeto[K]) => onChange({ ...projeto, [k]: v })
  const imp = impressoras.find(i => i.id === projeto.impressora_id) || impAtiva
  const [stlSource, setStlSource] = useState<ArrayBuffer | string | null>(null)
  const [carregandoStl, setCarregandoStl] = useState(false)
  const [viewerFull, setViewerFull] = useState(false)
  const [iaTxt, setIaTxt] = useState(projeto.ai_plano || '')
  const [iaBusy, setIaBusy] = useState(false)
  const [iaErro, setIaErro] = useState('')
  const [problema, setProblema] = useState('')

  // Esc fecha a visualização ampliada
  useEffect(() => {
    if (!viewerFull) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewerFull(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [viewerFull])

  // Carrega STL salvo (base64) ao abrir
  useEffect(() => {
    let vivo = true
    if (projeto.tem_stl && uid && db) {
      getDoc(doc(db, 'users', uid, 'projetos3d_stl', projeto.id)).then(s => { if (vivo && s.exists()) setStlSource(s.data().stl_base64 as string) }).catch(() => { })
    }
    return () => { vivo = false }
  }, [projeto.id])

  async function carregarStl(file: File | undefined) {
    if (!file) return
    setCarregandoStl(true)
    try {
      const buf = await file.arrayBuffer()
      setStlSource(buf)
      onChange({ ...projeto, tem_stl: true, stl_nome: file.name, status: projeto.status === 'ideia' ? 'modelagem' : projeto.status })
      // salva base64 se couber
      if (file.size <= MAX_STL_BYTES && uid && db) {
        const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(file) })
        await setDoc(doc(db, 'users', uid, 'projetos3d_stl', projeto.id), { stl_base64: dataUrl, nome: file.name, updatedAt: Date.now() })
      }
    } finally { setCarregandoStl(false) }
  }

  function onAnalyze(a: STLAnalise) {
    if (Math.abs((projeto.dims_x || 0) - a.x) < 0.01 && Math.abs((projeto.volume_cm3 || 0) - a.volume_cm3) < 0.01) return
    onChange({ ...projeto, tem_stl: true, dims_x: a.x, dims_y: a.y, dims_z: a.z, volume_cm3: a.volume_cm3, triangulos: a.triangulos })
  }

  const fit = imp ? cabeNaMesa(projeto, imp) : { cabe: true, motivo: '' }
  const custo = custoProjeto(projeto, filamentos, cfg, imp)
  const avisos = analisarProjeto(projeto, imp, filamentos)
  const filMaterial = filamentos.filter(f => !projeto.material || f.material === projeto.material)

  async function gerarPlano() {
    setIaErro(''); setIaBusy(true)
    try {
      if (!iaConfigurada()) throw new Error('Configure a IA (Gemini) — a mesma do PDF Reader.')
      const ctxImp = { nome: imp?.nome || 'impressora', bx: imp?.bx || 220, by: imp?.by || 220, bz: imp?.bz || 250, bico: imp?.bico || 0.4, materiais: imp?.materiais || ['PLA'] }
      const txt = await callLLM3D(promptPlanejador({ nome: projeto.nome, descricao: projeto.descricao, material: projeto.material, dimsX: projeto.dims_x || undefined, dimsY: projeto.dims_y, dimsZ: projeto.dims_z, volume: projeto.volume_cm3, altura_camada: projeto.altura_camada, infill: projeto.infill }, ctxImp))
      setIaTxt(txt); onChange({ ...projeto, ai_plano: txt })
    } catch (e: any) { setIaErro(e?.message || 'Falha na IA.') } finally { setIaBusy(false) }
  }
  async function resolverProblema() {
    if (!problema.trim()) return
    setIaErro(''); setIaBusy(true)
    try {
      if (!iaConfigurada()) throw new Error('Configure a IA (Gemini) — a mesma do PDF Reader.')
      const ctxImp = { nome: imp?.nome || 'impressora', bx: imp?.bx || 220, by: imp?.by || 220, bz: imp?.bz || 250, bico: imp?.bico || 0.4, materiais: imp?.materiais || ['PLA'] }
      const txt = await callLLM3D(promptTroubleshooting(problema, { nome: projeto.nome, descricao: projeto.descricao, material: projeto.material }, ctxImp))
      setIaTxt(txt)
    } catch (e: any) { setIaErro(e?.message || 'Falha na IA.') } finally { setIaBusy(false) }
  }

  function aplicarTemp() { const t = TEMP_PRESET[projeto.material]; if (!t) return; const f = filamentos.find(x => x.id === projeto.filamento_id); if (f) { /* mantém o do rolo */ } /* só informativo */ }

  return (
    <>
    <div onClick={onClose} style={modalBg}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 980 }}>
        <div style={modalHead}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{projeto.nome || 'Novo projeto'}</div>
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18, maxHeight: '74vh', overflowY: 'auto' }}>

          {/* Avisos do projeto */}
          {avisos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {avisos.map((a, i) => <div key={i} style={{ fontSize: '0.76rem', color: AVISO_COR[a.nivel], background: `${AVISO_COR[a.nivel]}10`, padding: '7px 10px', borderRadius: 9 }}>{AVISO_IC[a.nivel]} {a.msg}</div>)}
            </div>
          )}

          {/* Dados */}
          <section>
            <SecTitle>Projeto</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
              <Campo label="Nome *" span={2}><input style={inputStyle} value={projeto.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Suporte de fone" /></Campo>
              <Campo label="Descrição" span={2}><input style={inputStyle} value={projeto.descricao} onChange={e => set('descricao', e.target.value)} /></Campo>
              <Campo label="Status">
                <select style={inputStyle} value={projeto.status} onChange={e => set('status', e.target.value as StatusProj)}>{STATUS_LIST.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</select>
              </Campo>
              <Campo label="Impressora">
                <select style={inputStyle} value={projeto.impressora_id} onChange={e => set('impressora_id', e.target.value)}>{impressoras.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}</select>
              </Campo>
              <Campo label="Link do modelo" span={2} hint="Printables / MakerWorld / Thingiverse"><input style={inputStyle} value={projeto.modelo_url} onChange={e => set('modelo_url', e.target.value)} placeholder="https://…" /></Campo>
              <Campo label="Foto (URL)" span={2}><input style={inputStyle} value={projeto.foto_url} onChange={e => set('foto_url', e.target.value)} placeholder="https://…/foto.jpg" /></Campo>
            </div>
          </section>

          {/* Visualizador 3D */}
          <section>
            <SecTitle>Visualizador 3D (STL)</SecTitle>
            {!stlSource && !projeto.tem_stl && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, border: '1px dashed var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700, cursor: carregandoStl ? 'wait' : 'pointer' }}>
                {carregandoStl ? '⏳ Lendo…' : '⬆ Carregar STL'}
                <input type="file" accept=".stl" disabled={carregandoStl} onChange={e => { carregarStl(e.target.files?.[0]); e.currentTarget.value = '' }} style={{ display: 'none' }} />
              </label>
            )}
            {(stlSource || projeto.tem_stl) && (
              <>
                {stlSource
                  ? (!viewerFull && <STLViewer source={stlSource} bed={imp ? { x: imp.bx, y: imp.by, z: imp.bz } : undefined} height={400} onAnalyze={onAnalyze} />)
                  : <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg-1)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>STL muito grande pra salvar — recarregue o arquivo pra visualizar em 3D.</div>}
                {stlSource && viewerFull && <div style={{ padding: 20, borderRadius: 12, background: 'var(--bg-1)', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>🔍 Visualização aberta em tela cheia — feche para voltar.</div>}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, fontSize: '0.75rem' }}>
                  {projeto.dims_x > 0 && <span style={{ color: 'var(--text-secondary)' }}>📐 {projeto.dims_x.toFixed(1)} × {projeto.dims_y.toFixed(1)} × {projeto.dims_z.toFixed(1)} mm · {projeto.volume_cm3.toFixed(1)} cm³ · {Math.round(projeto.triangulos).toLocaleString('pt-BR')} triângulos</span>}
                  {imp && projeto.dims_x > 0 && <span style={{ fontWeight: 700, color: fit.cabe ? '#10b981' : '#f59e0b' }}>{fit.cabe ? '✅ Cabe na mesa' : `⚠ ${fit.motivo}`}</span>}
                  {stlSource && <button onClick={() => setViewerFull(true)} style={btnSec}>⛶ Ampliar</button>}
                  <label style={{ ...btnSec, cursor: 'pointer' }}>Trocar STL<input type="file" accept=".stl" onChange={e => { carregarStl(e.target.files?.[0]); e.currentTarget.value = '' }} style={{ display: 'none' }} /></label>
                </div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 4 }}>Arraste para girar · scroll para zoom. Verde = cabe na impressora; laranja = precisa redimensionar/dividir.</div>
              </>
            )}
          </section>

          {/* Material & Fatiamento */}
          <section>
            <SecTitle>Material & fatiamento</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
              <Campo label="Material"><select style={inputStyle} value={projeto.material} onChange={e => { set('material', e.target.value); aplicarTemp() }}>{MATERIAIS.map(m => <option key={m} value={m}>{m}</option>)}</select></Campo>
              <Campo label="Filamento (rolo)">
                <select style={inputStyle} value={projeto.filamento_id} onChange={e => set('filamento_id', e.target.value)}>
                  <option value="">—</option>
                  {filMaterial.map(f => <option key={f.id} value={f.id}>{f.material} {f.cor} · {Math.round(f.peso_restante_g)}g</option>)}
                </select>
              </Campo>
              <Campo label="Peso (g)" hint="Do Creality Print"><input type="number" style={inputStyle} value={projeto.peso_g || ''} onChange={e => set('peso_g', Math.max(0, Number(e.target.value) || 0))} /></Campo>
              <Campo label="Tempo (min)" hint="Do Creality Print"><input type="number" style={inputStyle} value={projeto.tempo_min || ''} onChange={e => set('tempo_min', Math.max(0, Number(e.target.value) || 0))} /></Campo>
              <Campo label="Altura de camada (mm)"><input type="number" step="0.04" style={inputStyle} value={projeto.altura_camada || ''} onChange={e => set('altura_camada', Number(e.target.value) || 0)} /></Campo>
              <Campo label="Infill (%)"><input type="number" style={inputStyle} value={projeto.infill || ''} onChange={e => set('infill', Number(e.target.value) || 0)} /></Campo>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-secondary)', gridColumn: 'span 2' }}>
                <input type="checkbox" checked={projeto.suportes} onChange={e => set('suportes', e.target.checked)} /> Usa suportes
              </label>
            </div>
          </section>

          {/* Custo */}
          <section>
            <SecTitle>Custo real</SecTitle>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: 14, borderRadius: 12, background: 'var(--bg-1)' }}>
              <Mini l="Material" v={formatBRL(custo.material)} />
              <Mini l="Energia" v={formatBRL(custo.energia)} />
              <Mini l={`Reserva ${cfg.taxa_falha}%`} v={formatBRL(custo.buffer)} />
              <Mini l="Total" v={formatBRL(custo.total)} cor="#10b981" />
              {cfg.margem > 0 && <Mini l={`Com margem ${cfg.margem}%`} v={formatBRL(custo.comMargem)} cor="#6366f1" />}
            </div>
          </section>

          {/* IA */}
          <section>
            <SecTitle>Planejador & troubleshooting (IA)</SecTitle>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <button onClick={gerarPlano} disabled={iaBusy} style={{ ...btnPrim, opacity: iaBusy ? 0.6 : 1 }}>{iaBusy ? '⏳ Pensando…' : '✨ Gerar plano de impressão'}</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} value={problema} onChange={e => setProblema(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); resolverProblema() } }} placeholder="Descreva um problema (ex: primeira camada não cola)…" />
              <button onClick={resolverProblema} disabled={iaBusy} style={btnSec}>Resolver</button>
            </div>
            {iaErro && <div style={{ fontSize: '0.72rem', color: '#ef4444', marginBottom: 6 }}>{iaErro}</div>}
            {iaTxt && <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--text-secondary)', background: 'var(--bg-1)', padding: 14, borderRadius: 12, maxHeight: 320, overflowY: 'auto' }}>{iaTxt}</div>}
          </section>

          {/* Registrar impressão */}
          {(projeto.status === 'imprimindo' || projeto.status === 'fila') && (
            <section>
              <SecTitle>Registrar resultado</SecTitle>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => onRegistrar(projeto, 'sucesso')} style={{ ...btnPrim, background: 'linear-gradient(135deg,#10b981,#059669)' }}>✅ Concluí com sucesso</button>
                <button onClick={() => onRegistrar(projeto, 'falha')} style={btnDel}>❌ Falhou</button>
              </div>
              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 6 }}>Isso baixa {projeto.peso_g || 0}g do filamento selecionado e fecha o projeto.</div>
            </section>
          )}
        </div>
        <div style={modalFoot}>
          <button onClick={onClose} style={btnSec}>Cancelar</button>
          <button onClick={onSave} disabled={!projeto.nome.trim()} className="p3d-prim" style={{ ...btnPrim, opacity: projeto.nome.trim() ? 1 : 0.5 }}>Salvar</button>
        </div>
      </div>
    </div>

    {viewerFull && stlSource && (
      <div onClick={() => setViewerFull(false)} style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(8,10,14,0.92)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ color: '#e8eef5', fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: '1rem' }}>{projeto.nome || 'Modelo'} — visualização ampliada</div>
          <button onClick={e => { e.stopPropagation(); setViewerFull(false) }} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>✕ Fechar (Esc)</button>
        </div>
        <div onClick={e => e.stopPropagation()} style={{ flex: 1, minHeight: 0, borderRadius: 14, overflow: 'hidden' }}>
          <STLViewer source={stlSource} bed={imp ? { x: imp.bx, y: imp.by, z: imp.bz } : undefined} height={Math.round(window.innerHeight * 0.82)} onAnalyze={onAnalyze} />
        </div>
        <div style={{ color: 'rgba(232,238,245,0.7)', fontSize: '0.72rem', textAlign: 'center', marginTop: 8 }}>Arraste para girar · scroll para zoom · clique fora para fechar</div>
      </div>
    )}
    </>
  )
}
function Mini({ l, v, cor }: { l: string; v: string; cor?: string }) { return <div><div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>{l}</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.05rem', color: cor || 'var(--text-primary)' }}>{v}</div></div> }

// ─── Modal Filamento ──────────────────────────────────────────────────────────
function ModalFilamento({ fil, onChange, onClose, onSave }: { fil: Filamento; onChange: (f: Filamento) => void; onClose: () => void; onSave: () => void }) {
  const set = <K extends keyof Filamento>(k: K, v: Filamento[K]) => onChange({ ...fil, [k]: v })
  return (
    <div onClick={onClose} style={modalBg}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 540 }}>
        <div style={modalHead}><div style={{ fontWeight: 900, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{fil.cor ? 'Editar filamento' : 'Novo filamento'}</div><button onClick={onClose} style={closeBtn}>×</button></div>
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
          <Campo label="Material"><select style={inputStyle} value={fil.material} onChange={e => { set('material', e.target.value); const t = TEMP_PRESET[e.target.value]; if (t) onChange({ ...fil, material: e.target.value, temp_bico: t.bico, temp_mesa: t.mesa }) }}>{MATERIAIS.map(m => <option key={m} value={m}>{m}</option>)}</select></Campo>
          <Campo label="Cor"><input style={inputStyle} value={fil.cor} onChange={e => set('cor', e.target.value)} placeholder="Ex: Preto" /></Campo>
          <Campo label="Marca"><input style={inputStyle} value={fil.marca} onChange={e => set('marca', e.target.value)} /></Campo>
          <Campo label="Cor (swatch)"><input type="color" style={{ ...inputStyle, padding: 4, height: 38 }} value={fil.hex} onChange={e => set('hex', e.target.value)} /></Campo>
          <Campo label="Peso total (g)"><input type="number" style={inputStyle} value={fil.peso_total_g || ''} onChange={e => { const v = Number(e.target.value) || 0; onChange({ ...fil, peso_total_g: v, peso_restante_g: fil.peso_restante_g || v }) }} /></Campo>
          <Campo label="Restante (g)"><input type="number" style={inputStyle} value={fil.peso_restante_g || ''} onChange={e => set('peso_restante_g', Number(e.target.value) || 0)} /></Campo>
          <Campo label="Preço do rolo (R$)"><input type="number" step="0.01" style={inputStyle} value={fil.preco || ''} onChange={e => set('preco', Number(e.target.value) || 0)} /></Campo>
          <Campo label="Temp. bico (°C)"><input type="number" style={inputStyle} value={fil.temp_bico || ''} onChange={e => set('temp_bico', Number(e.target.value) || 0)} /></Campo>
          <Campo label="Temp. mesa (°C)"><input type="number" style={inputStyle} value={fil.temp_mesa || ''} onChange={e => set('temp_mesa', Number(e.target.value) || 0)} /></Campo>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}><input type="checkbox" checked={fil.secagem} onChange={e => set('secagem', e.target.checked)} /> Precisa secar</label>
        </div>
        <div style={modalFoot}><button onClick={onClose} style={btnSec}>Cancelar</button><button onClick={onSave} disabled={!fil.cor.trim()} style={{ ...btnPrim, opacity: fil.cor.trim() ? 1 : 0.5 }}>Salvar</button></div>
      </div>
    </div>
  )
}

// ─── Modal Impressora ─────────────────────────────────────────────────────────
function ModalImpressora({ imp, onChange, onClose, onSave }: { imp: Impressora; onChange: (i: Impressora) => void; onClose: () => void; onSave: () => void }) {
  const set = <K extends keyof Impressora>(k: K, v: Impressora[K]) => onChange({ ...imp, [k]: v })
  return (
    <div onClick={onClose} style={modalBg}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 520 }}>
        <div style={modalHead}><div style={{ fontWeight: 900, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{imp.nome ? 'Editar impressora' : 'Nova impressora'}</div><button onClick={onClose} style={closeBtn}>×</button></div>
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          <Campo label="Nome" span={3}><input style={inputStyle} value={imp.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Ender 3 V3 SE" /></Campo>
          <Campo label="X (mm)"><input type="number" style={inputStyle} value={imp.bx || ''} onChange={e => set('bx', Number(e.target.value) || 0)} /></Campo>
          <Campo label="Y (mm)"><input type="number" style={inputStyle} value={imp.by || ''} onChange={e => set('by', Number(e.target.value) || 0)} /></Campo>
          <Campo label="Z (mm)"><input type="number" style={inputStyle} value={imp.bz || ''} onChange={e => set('bz', Number(e.target.value) || 0)} /></Campo>
          <Campo label="Bico (mm)"><input type="number" step="0.1" style={inputStyle} value={imp.bico || ''} onChange={e => set('bico', Number(e.target.value) || 0)} /></Campo>
          <Campo label="Potência (W)" hint="p/ custo de energia"><input type="number" style={inputStyle} value={imp.potencia_w || ''} onChange={e => set('potencia_w', Number(e.target.value) || 0)} /></Campo>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-secondary)', alignSelf: 'end' }}><input type="checkbox" checked={imp.ativa} onChange={e => set('ativa', e.target.checked)} /> Ativa</label>
          <Campo label="Materiais (separados por vírgula)" span={3}><input style={inputStyle} value={imp.materiais.join(', ')} onChange={e => set('materiais', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} /></Campo>
        </div>
        <div style={modalFoot}><button onClick={onClose} style={btnSec}>Cancelar</button><button onClick={onSave} disabled={!imp.nome.trim()} style={{ ...btnPrim, opacity: imp.nome.trim() ? 1 : 0.5 }}>Salvar</button></div>
      </div>
    </div>
  )
}

// ─── Estilos de modal ─────────────────────────────────────────────────────────
const modalBg: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 16px', overflowY: 'auto' }
const modalCard: React.CSSProperties = { width: '100%', background: 'var(--bg-2)', borderRadius: 18, border: '1px solid var(--border-md)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden' }
const modalHead: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'linear-gradient(135deg,rgba(124,58,237,0.12),rgba(14,165,233,0.06))', borderBottom: '1px solid var(--border)' }
const modalFoot: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-1)' }
const closeBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: 'none', background: 'var(--bg-3)', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer' }
