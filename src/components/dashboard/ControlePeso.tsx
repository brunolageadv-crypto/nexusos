// ControlePeso.tsx — módulo focado em controle de peso (dashboard)
// 6 seções: Dashboard · Evolução · Meta · IMC · Medidas · Fotos
import { useEffect, useMemo, useState, useRef } from 'react'
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

/* ── helpers ─────────────────────────────────────────────── */
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}
function today() { return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10) }
function newId() { return Math.random().toString(36).slice(2, 10) }
function fmtData(iso?: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`
}
function kg(n?: number | null) { return (n == null || isNaN(n)) ? '—' : `${n.toFixed(1).replace('.', ',')} kg` }
function classificaIMC(imc: number): { label: string; cor: string } {
  if (imc < 18.5) return { label: 'Baixo peso', cor: '#f59e0b' }
  if (imc < 25) return { label: 'Normal', cor: '#10b981' }
  if (imc < 30) return { label: 'Sobrepeso', cor: '#f59e0b' }
  return { label: 'Obesidade', cor: '#ef4444' }
}

const ACCENT = '#10b981'

/* tipos */
interface Pesagem { id: string; data: string; peso: number; criadoEm: number }
interface Medida { id: string; data: string; pescoco: number; peito: number; cintura: number; abdomen: number; quadril: number; braco: number; coxa: number; panturrilha: number; criadoEm: number }
interface FotoReg { id: string; data: string; frente?: string; perfil?: string; costas?: string; criadoEm: number }
interface PesoConfig { pesoInicial: number; pesoDesejado: number; altura: number; sexo: 'M' | 'F' }

const MEDIDA_CAMPOS: { k: keyof Medida; l: string }[] = [
  { k: 'pescoco', l: 'Pescoço' }, { k: 'peito', l: 'Peito' }, { k: 'cintura', l: 'Cintura' },
  { k: 'abdomen', l: 'Abdômen' }, { k: 'quadril', l: 'Quadril' }, { k: 'braco', l: 'Braço' },
  { k: 'coxa', l: 'Coxa' }, { k: 'panturrilha', l: 'Panturrilha' },
]

const SECOES = [
  { id: 'dashboard', ico: '🏠', l: 'Dashboard' },
  { id: 'evolucao', ico: '⚖️', l: 'Evolução' },
  { id: 'meta', ico: '🎯', l: 'Meta' },
  { id: 'imc', ico: '📏', l: 'IMC' },
  { id: 'medidas', ico: '📐', l: 'Medidas' },
  { id: 'fotos', ico: '📸', l: 'Fotos' },
] as const

/* estilos base */
const IS: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--input-bg, var(--surface))', color: 'var(--text-primary)', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }
const lbl: React.CSSProperties = { fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }
const btnPri: React.CSSProperties = { padding: '9px 14px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg,#059669,${ACCENT})`, color: '#fff', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer' }

function Stat({ label, value, sub, cor }: { label: string; value: string; sub?: string; cor?: string }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 0 }}>
      <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.15rem', color: cor || 'var(--text-primary)', lineHeight: 1.15, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
function Empty({ icon, msg }: { icon: string; msg: string }) {
  return <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-subtle)', padding: 24 }}><span style={{ fontSize: '2rem', opacity: .6 }}>{icon}</span><span style={{ fontSize: '0.75rem', textAlign: 'center' }}>{msg}</span></div>
}

/* ── componente principal ────────────────────────────────── */
export default function ControlePeso(props: any) {
  const uid = useUid()
  const [secao, setSecao] = useState<string>('dashboard')
  const [pesagens, setPesagens] = useState<Pesagem[]>([])
  const [medidas, setMedidas] = useState<Medida[]>([])
  const [fotos, setFotos] = useState<FotoReg[]>([])
  const [config, setConfig] = useState<PesoConfig>({ pesoInicial: 0, pesoDesejado: 0, altura: 0, sexo: 'M' })

  // peso registrado hoje na Saúde (integração)
  const pesoSaudeHoje = props?.saude?.reg?.peso || 0

  useEffect(() => {
    if (!uid || !db) return
    const u1 = onSnapshot(collection(db, 'users', uid, 'pesagens'), s => {
      setPesagens(s.docs.map(d => ({ id: d.id, ...d.data() } as Pesagem)).sort((a, b) => (a.data || '').localeCompare(b.data || '')))
    })
    const u2 = onSnapshot(collection(db, 'users', uid, 'medidas'), s => {
      setMedidas(s.docs.map(d => ({ id: d.id, ...d.data() } as Medida)).sort((a, b) => (a.data || '').localeCompare(b.data || '')))
    })
    const u3 = onSnapshot(collection(db, 'users', uid, 'fotosPeso'), s => {
      setFotos(s.docs.map(d => ({ id: d.id, ...d.data() } as FotoReg)).sort((a, b) => (a.data || '').localeCompare(b.data || '')))
    })
    const u4 = onSnapshot(doc(db, 'users', uid, 'config', 'peso'), s => {
      const d = s.data() as PesoConfig | undefined
      if (d) setConfig({ pesoInicial: d.pesoInicial || 0, pesoDesejado: d.pesoDesejado || 0, altura: d.altura || 0, sexo: d.sexo === 'F' ? 'F' : 'M' })
    })
    return () => { u1(); u2(); u3(); u4() }
  }, [uid])

  /* derivados */
  const der = useMemo(() => {
    const ordenadas = pesagens
    const ultima = ordenadas[ordenadas.length - 1]
    const pesoAtual = ultima?.peso || 0
    const pesoInicial = config.pesoInicial || ordenadas[0]?.peso || 0
    const pesoDesejado = config.pesoDesejado || 0
    const perdido = pesoInicial && pesoAtual ? pesoInicial - pesoAtual : 0
    const restante = pesoDesejado && pesoAtual ? pesoAtual - pesoDesejado : 0
    const imc = config.altura && pesoAtual ? pesoAtual / Math.pow(config.altura / 100, 2) : 0
    let progresso = 0
    if (pesoInicial && pesoDesejado && pesoInicial !== pesoDesejado) {
      progresso = ((pesoInicial - pesoAtual) / (pesoInicial - pesoDesejado)) * 100
      progresso = Math.max(0, Math.min(100, progresso))
    }
    return { ultima, pesoAtual, pesoInicial, pesoDesejado, perdido, restante, imc, progresso }
  }, [pesagens, config])

  if (!uid) return <Shell secao={secao} setSecao={setSecao}><Empty icon="⚖️" msg="Faça login para usar o controle de peso" /></Shell>

  return (
    <Shell secao={secao} setSecao={setSecao}>
      {secao === 'dashboard' && <SecDashboard uid={uid} der={der} pesagens={pesagens} medidas={medidas} config={config} />}
      {secao === 'evolucao' && <SecEvolucao uid={uid} pesagens={pesagens} pesoSaudeHoje={pesoSaudeHoje} />}
      {secao === 'meta' && <SecMeta uid={uid} config={config} der={der} />}
      {secao === 'imc' && <SecIMC uid={uid} config={config} der={der} />}
      {secao === 'medidas' && <SecMedidas uid={uid} medidas={medidas} />}
      {secao === 'fotos' && <SecFotos uid={uid} fotos={fotos} />}
    </Shell>
  )
}

/* casca com header + abas */
function Shell({ secao, setSecao, children }: { secao: string; setSecao: (s: string) => void; children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: `linear-gradient(90deg, ${ACCENT}12 0%, transparent 70%)`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.09em', display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ color: ACCENT }}>⚖️</span> Controle de Peso
        </span>
      </div>
      <div style={{ display: 'flex', gap: 4, padding: '7px 8px', borderBottom: '1px solid var(--border)', overflowX: 'auto', flexShrink: 0 }}>
        {SECOES.map(s => (
          <button key={s.id} onClick={() => setSecao(s.id)}
            title={s.l}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 8, border: `1px solid ${secao === s.id ? ACCENT : 'var(--border)'}`, background: secao === s.id ? `${ACCENT}18` : 'transparent', color: secao === s.id ? ACCENT : 'var(--text-muted)', fontSize: '0.66rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <span>{s.ico}</span><span>{s.l}</span>
          </button>
        ))}
      </div>
      <div style={{ flex: 1, padding: '12px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
        {children}
      </div>
    </div>
  )
}

/* ── 1. DASHBOARD ────────────────────────────────────────── */
function dateDiffDias(a: string, b: string) { return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000) }
function faixaSaudavel(alturaCm: number) { if (!alturaCm) return null; const h = alturaCm / 100; return { min: 18.5 * h * h, max: 24.9 * h * h } }
function navyGordura(sexo: 'M' | 'F', altura: number, cintura: number, pescoco: number, quadril: number): number | null {
  if (!altura || !cintura || !pescoco) return null
  if (sexo === 'F' && !quadril) return null
  let v: number
  if (sexo === 'M') { if (cintura - pescoco <= 0) return null; v = 495 / (1.0324 - 0.19077 * Math.log10(cintura - pescoco) + 0.15456 * Math.log10(altura)) - 450 }
  else { if (cintura + quadril - pescoco <= 0) return null; v = 495 / (1.29579 - 0.35004 * Math.log10(cintura + quadril - pescoco) + 0.22100 * Math.log10(altura)) - 450 }
  return v > 0 && v < 70 ? v : null
}

function SecDashboard({ uid, der, pesagens, medidas, config }: any) {
  const imcCls = der.imc ? classificaIMC(der.imc) : null
  const [novoPeso, setNovoPeso] = useState('')
  async function registrarRapido() {
    const p = Number(String(novoPeso).replace(',', '.'))
    if (!p || p <= 0) return
    const id = newId()
    await setDoc(doc(db, 'users', uid, 'pesagens', id), clean({ id, data: today(), peso: p, criadoEm: Date.now() }))
    setNovoPeso('')
  }
  const resumo = (dias: number) => {
    if (!pesagens.length) return null
    const limite = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10)
    const jan = pesagens.filter((p: any) => p.data >= limite)
    if (jan.length < 1) return null
    return { varic: jan[jan.length - 1].peso - jan[0].peso, media: jan.reduce((a: number, p: any) => a + p.peso, 0) / jan.length, n: jan.length }
  }
  const semana = resumo(7), mes = resumo(30)
  const proj = (() => {
    if (pesagens.length < 2 || !der.pesoDesejado) return null
    const ult = pesagens[pesagens.length - 1]
    const base = [...pesagens].reverse().find((p: any) => dateDiffDias(ult.data, p.data) >= 10) || pesagens[0]
    const dias = dateDiffDias(ult.data, base.data)
    if (dias <= 0) return null
    const ratedia = (base.peso - ult.peso) / dias
    const restante = ult.peso - der.pesoDesejado
    if (ratedia <= 0.001 || restante <= 0) return { sem: null as number | null, semana: ratedia * 7, alvo: '' }
    const diasFalta = restante / ratedia
    const alvo = new Date(new Date(ult.data).getTime() + diasFalta * 86400000).toISOString().slice(0, 10)
    return { sem: diasFalta / 7, alvo, semana: ratedia * 7 }
  })()
  const faixa = faixaSaudavel(config.altura)
  const um = medidas[medidas.length - 1]
  const gordura = um ? navyGordura(config.sexo || 'M', config.altura, um.cintura, um.pescoco, um.quadril) : null
  const rcq = um && um.cintura && um.quadril ? um.cintura / um.quadril : null
  const rcqLim = (config.sexo || 'M') === 'M' ? 0.90 : 0.85
  async function mudaSexo(sx: 'M' | 'F') { await setDoc(doc(db, 'users', uid, 'config', 'peso'), { sexo: sx }, { merge: true }) }

  return (
    <>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="number" step={0.1} style={{ ...IS, flex: 1 }} value={novoPeso} onChange={e => setNovoPeso(e.target.value)} placeholder="Pesar hoje (kg)" />
        <button onClick={registrarRapido} style={btnPri}>+ Registrar</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
        <Stat label="Peso atual" value={kg(der.pesoAtual || null)} cor={ACCENT} />
        <Stat label="Meta de peso" value={kg(der.pesoDesejado || null)} />
        <Stat label="Peso perdido" value={der.perdido ? `${der.perdido > 0 ? '-' : '+'}${Math.abs(der.perdido).toFixed(1).replace('.', ',')} kg` : '—'} cor={der.perdido > 0 ? '#10b981' : der.perdido < 0 ? '#ef4444' : undefined} sub="desde o início" />
        <Stat label="Falta p/ meta" value={der.restante > 0 ? kg(der.restante) : (der.pesoDesejado ? '✓ atingida' : '—')} cor={der.restante > 0 ? '#f59e0b' : '#10b981'} />
        <Stat label="IMC atual" value={der.imc ? der.imc.toFixed(1).replace('.', ',') : '—'} cor={imcCls?.cor} sub={imcCls?.label} />
        <Stat label="Última pesagem" value={fmtData(der.ultima?.data)} />
      </div>

      {(semana || mes) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[{ t: '7 dias', r: semana }, { t: '30 dias', r: mes }].map(({ t, r }) => (
            <div key={t} style={{ padding: '9px 11px', borderRadius: 11, background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.56rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Últimos {t}</div>
              {r ? (<>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: r.varic < 0 ? '#10b981' : r.varic > 0 ? '#ef4444' : 'var(--text-primary)' }}>{r.varic > 0 ? '+' : ''}{r.varic.toFixed(1).replace('.', ',')} kg</div>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>média {r.media.toFixed(1).replace('.', ',')} · {r.n} reg</div>
              </>) : <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>sem dados</div>}
            </div>
          ))}
        </div>
      )}

      {proj && (
        <div style={{ padding: '10px 12px', borderRadius: 11, background: `${ACCENT}0c`, border: `1px solid ${ACCENT}30` }}>
          <div style={{ fontSize: '0.56rem', fontWeight: 700, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🎯 Projeção da meta</div>
          {proj.sem ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', marginTop: 3 }}>No ritmo atual (<b>{proj.semana.toFixed(1).replace('.', ',')} kg/sem</b>), meta em <b>~{Math.ceil(proj.sem)} semana{Math.ceil(proj.sem) !== 1 ? 's' : ''}</b> ({fmtData(proj.alvo)}).</div>
          ) : (
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 3 }}>{der.restante <= 0 ? 'Meta atingida! 🎉' : 'Sem tendência de perda no período — registre mais pesagens.'}</div>
          )}
        </div>
      )}

      {faixa && (
        <div style={{ padding: '10px 12px', borderRadius: 11, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.56rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Peso saudável · {config.altura}cm</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.82rem', color: '#10b981' }}>{faixa.min.toFixed(0)}–{faixa.max.toFixed(0)} kg</span>
          </div>
          {der.pesoAtual > 0 && (
            <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 3 }}>{der.pesoAtual < faixa.min ? `${(faixa.min - der.pesoAtual).toFixed(1).replace('.', ',')} kg abaixo da faixa.` : der.pesoAtual > faixa.max ? `Faltam ${(der.pesoAtual - faixa.max).toFixed(1).replace('.', ',')} kg para entrar na faixa.` : 'Dentro da faixa saudável. ✓'}</div>
          )}
        </div>
      )}

      <div style={{ padding: '10px 12px', borderRadius: 11, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: '0.56rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Composição corporal</span>
          <span style={{ display: 'flex', gap: 4 }}>
            {(['M', 'F'] as const).map(sx => (
              <button key={sx} onClick={() => mudaSexo(sx)} style={{ padding: '2px 8px', borderRadius: 6, border: `1px solid ${(config.sexo || 'M') === sx ? ACCENT : 'var(--border)'}`, background: (config.sexo || 'M') === sx ? `${ACCENT}18` : 'transparent', color: (config.sexo || 'M') === sx ? ACCENT : 'var(--text-muted)', fontSize: '0.6rem', fontWeight: 700, cursor: 'pointer' }}>{sx === 'M' ? 'Masc' : 'Fem'}</button>
            ))}
          </span>
        </div>
        {(gordura != null || rcq != null) ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><div style={{ fontSize: '0.56rem', color: 'var(--text-muted)' }}>% Gordura (Navy)</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-primary)' }}>{gordura != null ? `${gordura.toFixed(1).replace('.', ',')}%` : '—'}</div></div>
            <div><div style={{ fontSize: '0.56rem', color: 'var(--text-muted)' }}>Cintura/Quadril</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: rcq == null ? 'var(--text-primary)' : rcq > rcqLim ? '#ef4444' : '#10b981' }}>{rcq != null ? rcq.toFixed(2).replace('.', ',') : '—'}{rcq != null && <span style={{ fontSize: '0.58rem', fontWeight: 600, marginLeft: 4, color: 'var(--text-muted)' }}>{rcq > rcqLim ? 'risco' : 'ok'}</span>}</div></div>
          </div>
        ) : <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Registre altura (aba Meta) e medidas (cintura, pescoço{(config.sexo || 'M') === 'F' ? ', quadril' : ''}) para calcular.</div>}
      </div>
    </>
  )
}

/* ── 2. EVOLUCAO ── */
function SecEvolucao({ uid, pesagens, pesoSaudeHoje }: { uid: string; pesagens: Pesagem[]; pesoSaudeHoje: number }) {
  const [data, setData] = useState(today())
  const [peso, setPeso] = useState('')
  const [saving, setSaving] = useState(false)

  async function add() {
    const p = Number(String(peso).replace(',', '.'))
    if (!p || p <= 0) return
    setSaving(true)
    const id = newId()
    await setDoc(doc(db, 'users', uid, 'pesagens', id), clean({ id, data, peso: p, criadoEm: Date.now() }))
    setPeso(''); setSaving(false)
  }
  async function del(id: string) {
    if (confirm('Excluir esta pesagem?')) await deleteDoc(doc(db, 'users', uid, 'pesagens', id))
  }

  const chart = pesagens.map(p => ({ data: fmtData(p.data).slice(0, 5), peso: p.peso }))
  const linhas = [...pesagens].reverse()

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 120px' }}>
          <label style={lbl}>Data</label>
          <input type="date" style={IS} value={data} onChange={e => setData(e.target.value)} />
        </div>
        <div style={{ flex: '1 1 100px' }}>
          <label style={lbl}>Peso (kg)</label>
          <input type="number" step={0.1} style={IS} value={peso} onChange={e => setPeso(e.target.value)} placeholder={pesoSaudeHoje ? String(pesoSaudeHoje) : 'Ex: 75,0'} />
        </div>
        <button onClick={add} disabled={saving} style={{ ...btnPri, opacity: saving ? .6 : 1 }}>+ Registrar</button>
        {pesoSaudeHoje > 0 && (
          <button onClick={() => setPeso(String(pesoSaudeHoje))} title="Usar o peso registrado hoje na Saúde"
            style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-md)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>
            ↺ Saúde: {pesoSaudeHoje}kg
          </button>
        )}
      </div>

      {chart.length >= 2 && (
        <div style={{ height: 150, marginTop: 4 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="data" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
              <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
              <Tooltip contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="peso" stroke={ACCENT} strokeWidth={2.5} dot={{ r: 3, fill: ACCENT }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {linhas.length === 0 ? <Empty icon="⚖️" msg="Nenhuma pesagem registrada ainda" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 28px', gap: 6, fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 6px' }}>
            <span>Data</span><span>Peso</span><span>Variação</span><span></span>
          </div>
          {linhas.map((p, i) => {
            const anterior = linhas[i + 1]
            const varia = anterior ? p.peso - anterior.peso : null
            return (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 28px', gap: 6, alignItems: 'center', padding: '7px 6px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{fmtData(p.data)}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{kg(p.peso)}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: varia == null ? 'var(--text-muted)' : varia < 0 ? '#10b981' : varia > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                  {varia == null ? '—' : `${varia > 0 ? '+' : ''}${varia.toFixed(1).replace('.', ',')} kg`}
                </span>
                <button onClick={() => del(p.id)} title="Excluir" style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem' }}>✕</button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/* ── 3. META ─────────────────────────────────────────────── */
function SecMeta({ uid, config, der }: { uid: string; config: PesoConfig; der: any }) {
  const [ini, setIni] = useState(String(config.pesoInicial || ''))
  const [des, setDes] = useState(String(config.pesoDesejado || ''))
  const [alt, setAlt] = useState(String(config.altura || ''))
  const [saving, setSaving] = useState(false)
  useEffect(() => { setIni(String(config.pesoInicial || '')); setDes(String(config.pesoDesejado || '')); setAlt(String(config.altura || '')) }, [config])

  async function salvar() {
    setSaving(true)
    await setDoc(doc(db, 'users', uid, 'config', 'peso'), clean({
      pesoInicial: Number(String(ini).replace(',', '.')) || 0,
      pesoDesejado: Number(String(des).replace(',', '.')) || 0,
      altura: Number(String(alt).replace(',', '.')) || 0,
    }), { merge: true })
    setSaving(false)
  }

  const pIni = der.pesoInicial, pAtual = der.pesoAtual, pDes = der.pesoDesejado
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><label style={lbl}>Peso inicial (kg)</label><input type="number" step={0.1} style={IS} value={ini} onChange={e => setIni(e.target.value)} /></div>
        <div><label style={lbl}>Peso desejado (kg)</label><input type="number" step={0.1} style={IS} value={des} onChange={e => setDes(e.target.value)} /></div>
        <div><label style={lbl}>Altura (cm)</label><input type="number" step={1} style={IS} value={alt} onChange={e => setAlt(e.target.value)} placeholder="Ex: 175" /></div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', padding: '8px 10px', borderRadius: 9, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Peso atual</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: ACCENT }}>{kg(pAtual || null)}</div>
          </div>
        </div>
      </div>
      <button onClick={salvar} disabled={saving} style={{ ...btnPri, opacity: saving ? .6 : 1 }}>{saving ? 'Salvando…' : 'Salvar meta'}</button>

      {pIni && pDes ? (
        <div style={{ marginTop: 6, padding: '14px 12px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
            <span>{kg(pIni)}</span><span style={{ color: ACCENT }}>Meta: {kg(pDes)}</span>
          </div>
          <div style={{ position: 'relative', height: 10, borderRadius: 6, background: 'var(--border)', overflow: 'visible' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${der.progresso}%`, borderRadius: 6, background: `linear-gradient(90deg,#059669,${ACCENT})`, transition: 'width .3s' }} />
            <div style={{ position: 'absolute', top: -4, left: `calc(${der.progresso}% - 9px)`, width: 18, height: 18, borderRadius: '50%', background: '#fff', border: `3px solid ${ACCENT}`, boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} title={kg(pAtual)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Atual: <b style={{ color: 'var(--text-primary)' }}>{kg(pAtual)}</b></span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.1rem', color: ACCENT }}>{der.progresso.toFixed(0)}%</span>
          </div>
        </div>
      ) : <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', padding: 10 }}>Cadastre peso inicial e desejado para ver o progresso.</div>}
    </>
  )
}

/* ── 4. IMC ──────────────────────────────────────────────── */
function SecIMC({ uid, config, der }: { uid: string; config: PesoConfig; der: any }) {
  const [alt, setAlt] = useState(String(config.altura || ''))
  useEffect(() => { setAlt(String(config.altura || '')) }, [config])
  async function salvarAltura() {
    await setDoc(doc(db, 'users', uid, 'config', 'peso'), { altura: Number(String(alt).replace(',', '.')) || 0 }, { merge: true })
  }
  const faixas = [
    { l: 'Baixo peso', r: '< 18,5', c: '#f59e0b' },
    { l: 'Normal', r: '18,5 – 24,9', c: '#10b981' },
    { l: 'Sobrepeso', r: '25 – 29,9', c: '#f59e0b' },
    { l: 'Obesidade', r: '≥ 30', c: '#ef4444' },
  ]
  const cls = der.imc ? classificaIMC(der.imc) : null
  return (
    <>
      {!config.altura && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}><label style={lbl}>Altura (cm)</label><input type="number" style={IS} value={alt} onChange={e => setAlt(e.target.value)} placeholder="Ex: 175" /></div>
          <button onClick={salvarAltura} style={btnPri}>Salvar</button>
        </div>
      )}
      <div style={{ textAlign: 'center', padding: '10px 0' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '2.6rem', color: cls?.cor || 'var(--text-muted)', lineHeight: 1 }}>
          {der.imc ? der.imc.toFixed(1).replace('.', ',') : '—'}
        </div>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: cls?.cor || 'var(--text-muted)', marginTop: 4 }}>{cls?.label || 'Cadastre altura e pese-se'}</div>
        {der.pesoAtual && config.altura ? <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 2 }}>{kg(der.pesoAtual)} · {config.altura} cm</div> : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {faixas.map(f => {
          const ativo = cls?.label === f.l
          return (
            <div key={f.l} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 9, background: ativo ? `${f.c}18` : 'var(--surface)', border: `1px solid ${ativo ? f.c : 'var(--border)'}` }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: f.c }} />
              <span style={{ flex: 1, fontSize: '0.76rem', fontWeight: ativo ? 800 : 600, color: ativo ? f.c : 'var(--text-secondary)' }}>{f.l}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{f.r}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ── 5. MEDIDAS ──────────────────────────────────────────── */
function SecMedidas({ uid, medidas }: { uid: string; medidas: Medida[] }) {
  const vazio: any = { data: today(), pescoco: '', peito: '', cintura: '', abdomen: '', quadril: '', braco: '', coxa: '', panturrilha: '' }
  const [form, setForm] = useState<any>(vazio)
  const [saving, setSaving] = useState(false)
  const upd = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }))

  async function salvar() {
    setSaving(true)
    const id = newId()
    const reg: any = { id, data: form.data, criadoEm: Date.now() }
    MEDIDA_CAMPOS.forEach(c => { reg[c.k] = Number(String(form[c.k]).replace(',', '.')) || 0 })
    await setDoc(doc(db, 'users', uid, 'medidas', id), clean(reg))
    setForm(vazio); setSaving(false)
  }
  async function del(id: string) { if (confirm('Excluir este registro de medidas?')) await deleteDoc(doc(db, 'users', uid, 'medidas', id)) }

  const primeiro = medidas[0]
  const ultimo = medidas[medidas.length - 1]

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 7 }}>
        <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Data</label><input type="date" style={IS} value={form.data} onChange={e => upd('data', e.target.value)} /></div>
        {MEDIDA_CAMPOS.map(c => (
          <div key={c.k}><label style={lbl}>{c.l} (cm)</label><input type="number" step={0.1} style={IS} value={form[c.k]} onChange={e => upd(c.k, e.target.value)} /></div>
        ))}
      </div>
      <button onClick={salvar} disabled={saving} style={{ ...btnPri, opacity: saving ? .6 : 1 }}>{saving ? 'Salvando…' : '+ Registrar medidas'}</button>

      {ultimo && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            Último registro · {fmtData(ultimo.data)} {primeiro && primeiro.id !== ultimo.id ? `(vs 1º: ${fmtData(primeiro.data)})` : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 7 }}>
            {MEDIDA_CAMPOS.map(c => {
              const atual = (ultimo as any)[c.k] || 0
              const base = primeiro ? (primeiro as any)[c.k] || 0 : 0
              const diff = primeiro && primeiro.id !== ultimo.id && base ? atual - base : null
              if (!atual) return null
              return (
                <div key={c.k} style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{c.l}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--text-primary)' }}>{atual} cm</div>
                  {diff != null && <div style={{ fontSize: '0.64rem', fontWeight: 700, color: diff < 0 ? '#10b981' : diff > 0 ? '#ef4444' : 'var(--text-muted)' }}>{diff > 0 ? '+' : ''}{diff.toFixed(1).replace('.', ',')} cm</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {medidas.length > 0 && (
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Histórico</div>
          {[...medidas].reverse().map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.72rem' }}>
              <span style={{ color: 'var(--text-secondary)', minWidth: 70 }}>{fmtData(m.data)}</span>
              <span style={{ flex: 1, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Cint {m.cintura || '—'} · Abd {m.abdomen || '—'} · Quad {m.quadril || '—'}
              </span>
              <button onClick={() => del(m.id)} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
      )}
      {medidas.length === 0 && <Empty icon="📐" msg="Nenhuma medida registrada ainda" />}
    </>
  )
}

/* ── 6. FOTOS ────────────────────────────────────────────── */
function SecFotos({ uid, fotos }: { uid: string; fotos: FotoReg[] }) {
  const [data, setData] = useState(today())
  const [busy, setBusy] = useState<string>('')

  async function upload(regId: string, tipo: 'frente' | 'perfil' | 'costas', file: File, dataReg: string) {
    setBusy(`${regId}-${tipo}`)
    try {
      const path = `users/${uid}/fotosPeso/${regId}/${tipo}.jpg`
      const r = ref(storage, path)
      await uploadBytes(r, file)
      const url = await getDownloadURL(r)
      await setDoc(doc(db, 'users', uid, 'fotosPeso', regId), clean({ id: regId, data: dataReg, [tipo]: url, criadoEm: Date.now() }), { merge: true })
    } catch (e) { alert('Falha no upload da foto. Verifique as regras do Storage.') }
    setBusy('')
  }
  async function novoRegistro() {
    const id = newId()
    await setDoc(doc(db, 'users', uid, 'fotosPeso', id), clean({ id, data, criadoEm: Date.now() }), { merge: true })
  }
  async function delReg(reg: FotoReg) {
    if (!confirm('Excluir este registro de fotos?')) return
    for (const t of ['frente', 'perfil', 'costas'] as const) {
      if ((reg as any)[t]) { try { await deleteObject(ref(storage, `users/${uid}/fotosPeso/${reg.id}/${t}.jpg`)) } catch {} }
    }
    await deleteDoc(doc(db, 'users', uid, 'fotosPeso', reg.id))
  }

  const linha = [...fotos].reverse()
  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 120px' }}><label style={lbl}>Data do registro</label><input type="date" style={IS} value={data} onChange={e => setData(e.target.value)} /></div>
        <button onClick={novoRegistro} style={btnPri}>+ Novo registro</button>
      </div>

      {linha.length === 0 ? <Empty icon="📸" msg="Nenhuma foto de evolução ainda" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {linha.map(reg => (
            <div key={reg.id} style={{ padding: '10px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-primary)' }}>{fmtData(reg.data)}</span>
                <button onClick={() => delReg(reg)} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>✕ excluir</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {(['frente', 'perfil', 'costas'] as const).map(tipo => (
                  <SlotFoto key={tipo} tipo={tipo} url={(reg as any)[tipo]} busy={busy === `${reg.id}-${tipo}`}
                    onPick={file => upload(reg.id, tipo, file, reg.data)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function SlotFoto({ tipo, url, busy, onPick }: { tipo: string; url?: string; busy: boolean; onPick: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const rot: Record<string, string> = { frente: 'Frente', perfil: 'Perfil', costas: 'Costas' }
  return (
    <div>
      <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'center', marginBottom: 4 }}>{rot[tipo]}</div>
      <button onClick={() => inputRef.current?.click()}
        style={{ width: '100%', aspectRatio: '3/4', borderRadius: 10, border: `1px solid ${url ? ACCENT : 'var(--border)'}`, background: url ? `center/cover no-repeat url(${url})` : 'var(--card-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', overflow: 'hidden' }}>
        {busy ? '⏳' : url ? '' : '+ foto'}
      </button>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f) }} />
    </div>
  )
}
