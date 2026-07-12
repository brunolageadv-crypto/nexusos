// @ts-nocheck
/* ════════════════════════════════════════════════════════════════════
   NEXUS · DASHBOARD "VISÃO GERAL" 2.0  — board de cards customizável
   --------------------------------------------------------------------
   • Substitui a antiga Visão Geral (modo "visual").
   • Cards livremente: ADICIONAR (galeria) · EXCLUIR (×) · MOVER (arraste)
     · REDIMENSIONAR (largura/altura). Layout salvo no Firestore
     (users/{uid}/config/visaoGeral) com fallback em localStorage.
   • SEM card financeiro (removido a pedido).
   • Cards novos para as abas recentes (Análise de PDF, Mapa Mental,
     Viagens, Agenda, Logs, Geosfera/atalhos) + detalhamentos das antigas.
   • Reaproveita as MESMAS coleções/campos do Firestore já usados no app,
     então os dados são reais.
   ════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../Icon'
import { collection, query, orderBy, onSnapshot, doc, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'
import { useEditaisAGU } from '../../hooks/useEditaisAGU'
import { AGU_DISCIPLINAS, TOTAL_SUBTOPICOS } from '../editais/aguData'
import { useEdital, useEditaisCadastrados } from '../../hooks/useEdital'
import { EDITAIS_BUILTIN, EDITAIS_FIXOS_IDS } from '../editais/GestorEditais'
import { PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, ComposedChart, BarChart, Bar, ReferenceLine, LabelList, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import PainelArcade from './Arcade'
import ControlePeso from './ControlePeso'

/* ───────────────────────── helpers de data ───────────────────────── */
const hojeISO = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
const fmtData = (iso: string) => { try { return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) } catch { return iso } }

/* ───────────────────────── hooks de dados (coleções reais) ───────────────────────── */
function useCol(path: string, order?: string) {
  const [rows, setRows] = useState<any[]>([])
  const uid = useUid()
  useEffect(() => {
    if (!uid || !db) return
    const ref = order ? query(collection(db, `users/${uid}/${path}`), orderBy(order, 'asc')) : collection(db, `users/${uid}/${path}`)
    return onSnapshot(ref, s => setRows(s.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [uid, path, order])
  return rows
}

/* mapa mental vive em localStorage (não no Firestore) */
function useMapaMentalLocal() {
  const read = () => { try { const r = localStorage.getItem('nexus_mapamental_v1'); if (!r) return { maps: 0, folders: 0 }; const s = JSON.parse(r); return { maps: Object.keys(s.maps || {}).length, folders: Object.keys(s.folders || {}).length } } catch { return { maps: 0, folders: 0 } } }
  const [v, setV] = useState(read)
  useEffect(() => {
    const fn = () => setV(read())
    window.addEventListener('storage', fn); window.addEventListener('focus', fn)
    return () => { window.removeEventListener('storage', fn); window.removeEventListener('focus', fn) }
  }, [])
  return v
}

/* ───────────────────────── primitivos visuais ───────────────────────── */
function Ring({ pct, color, size = 58 }: any) {
  const r = (size - 9) / 2, circ = 2 * Math.PI * r, dash = (Math.min(100, pct) / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-4)" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} style={{ transition: 'stroke-dasharray 0.9s ease' }} />
    </svg>
  )
}
function CardShell({ icon, title, color, badge, footer, onNavigate, navTo, children }: any) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: `linear-gradient(90deg, ${color}10 0%, transparent 70%)`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.09em', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span style={{ color, display: 'inline-flex' }}><Icon e={icon} size={14} /></span>{title}
        </div>
        {badge != null && <span style={{ fontSize: '0.62rem', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{badge}</span>}
      </div>
      <div style={{ flex: 1, padding: '11px 14px', display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto', minHeight: 0 }}>{children}</div>
      {footer && navTo && (
        <div style={{ padding: '7px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={() => onNavigate(navTo)} style={{ width: '100%', padding: '6px', borderRadius: 8, border: `1px solid ${color}30`, background: `${color}0c`, color, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer' }}>{footer} →</button>
        </div>
      )}
    </div>
  )
}
function Kpi({ icon, label, value, sub, color, pct, onNavigate, navTo }: any) {
  return (
    <button onClick={() => navTo && onNavigate(navTo)} style={{ height: '100%', width: '100%', textAlign: 'left', cursor: navTo ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 13, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px', boxShadow: 'var(--shadow-sm)', transition: 'transform .15s, box-shadow .15s' }}
      onMouseEnter={e => { const el = e.currentTarget; el.style.transform = 'translateY(-2px)'; el.style.boxShadow = `0 8px 22px ${color}20` }}
      onMouseLeave={e => { const el = e.currentTarget; el.style.transform = 'none'; el.style.boxShadow = 'var(--shadow-sm)' }}>
      {pct != null
        ? <div style={{ position: 'relative', flexShrink: 0 }}><Ring pct={pct} color={color} /><span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 800, color }}>{pct}%</span></div>
        : <div style={{ width: 46, height: 46, borderRadius: 13, background: `${color}15`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon e={icon} size={22} /></div>}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.45rem', color: 'var(--text-primary)', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
        <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
      </div>
    </button>
  )
}
function Empty({ icon, msg }: any) {
  return <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7, color: 'var(--text-subtle)' }}><span style={{ fontSize: '1.8rem', opacity: .6 }}>{icon}</span><span style={{ fontSize: '0.72rem', textAlign: 'center' }}>{msg}</span></div>
}
function Linha({ cor, titulo, meta, right }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 9, background: `${cor}0a`, border: `1px solid ${cor}22` }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: cor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</div>
        {meta && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</div>}
      </div>
      {right != null && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: cor, flexShrink: 0 }}>{right}</span>}
    </div>
  )
}

/* ═══════════════════ CARD COMPONENTS (cada um puxa seus dados) ═══════════════════ */

// — AGU (estudos) —
function AguProgresso({ agu, onNavigate }: any) { return <Kpi icon="📊" label="Progresso AGU" value={`${agu.global.pctConcluido}%`} sub={`${agu.global.concluidos}/${TOTAL_SUBTOPICOS} subtópicos`} color="#1A73E8" pct={agu.global.pctConcluido} navTo="editais" onNavigate={onNavigate} /> }
function AguQuestoes({ agu, onNavigate }: any) { return <Kpi icon="📝" label="Questões" value={agu.global.questoes || '—'} sub={`${agu.global.acertos} acertos`} color="#8B5CF6" navTo="editais" onNavigate={onNavigate} /> }
function AguAcerto({ agu, onNavigate }: any) { return <Kpi icon="🎯" label="% Acerto" value={agu.global.questoes > 0 ? `${agu.global.pctAcerto}%` : '—'} sub="desempenho geral" color="#0F9D58" pct={agu.global.questoes > 0 ? agu.global.pctAcerto : 0} navTo="editais" onNavigate={onNavigate} /> }
function EditaisCard({ onNavigate }: any) {
  const { editais } = useEditaisCadastrados()
  const [sel, setSel] = useState(0)
  const [chart, setChart] = useState<'pizza' | 'linhas' | 'area' | 'combo'>('linhas')
  // todos os editais: 3 builtin (AGU, PGM-BH, PGM-Curitiba) + cadastrados no Firestore
  const customs = editais.filter((e: any) => !EDITAIS_FIXOS_IDS.includes(e.id))
  const all = [...EDITAIS_BUILTIN, ...customs]
  const idx = all.length ? sel % all.length : 0
  const cur: any = all[idx] || EDITAIS_BUILTIN[0]
  const hookCur = useEdital(cur.id)
  const discData = (cur.disciplinas || []).map((d: any) => {
    const ids = d.topicos.flatMap((t: any) => t.subtopicos.map((s: any) => s.id))
    const st = hookCur.getStats(ids)
    return {
      nome: (d.nome || '').replace('Direito ', ''),
      curto: (d.nome || '').replace('Direito ', '').slice(0, 9),
      cor: d.cor || cur.cor || '#1A73E8',
      pct: st.pctConcluido, concluidos: st.concluidos, emAndamento: st.emAndamento,
      pendentes: Math.max(0, st.total - st.concluidos - st.emAndamento), total: st.total,
    }
  })
  const allIds = (cur.disciplinas || []).flatMap((d: any) => d.topicos.flatMap((t: any) => t.subtopicos.map((s: any) => s.id)))
  const stats = hookCur.getStats(allIds)
  const arrow: React.CSSProperties = { width: 26, height: 26, flexShrink: 0, borderRadius: 8, border: '1px solid var(--border-md)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }
  const chartBtn = (id: string, lbl: string): React.CSSProperties => ({ flex: 1, padding: '4px 2px', borderRadius: 7, border: `1px solid ${chart === id ? cur.cor : 'var(--border)'}`, background: chart === id ? `${cur.cor}16` : 'transparent', color: chart === id ? cur.cor : 'var(--text-muted)', fontSize: '0.6rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-display)' })
  const tipStyle = { background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 8, fontSize: '0.72rem', color: 'var(--text-primary)' }
  const totConcl = discData.reduce((a, d) => a + d.concluidos, 0)
  const pieData = totConcl > 0
    ? discData.filter(d => d.concluidos > 0).map(d => ({ name: d.nome, value: d.concluidos, fill: d.cor }))
    : [{ name: 'Sem progresso ainda', value: 1, fill: 'var(--bg-4)' }]

  return (
    <CardShell icon="⚖" title="Editais" color={cur.cor} badge={`${idx + 1}/${all.length}`} footer="Abrir Editais" navTo="editais" onNavigate={onNavigate}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button style={arrow} onClick={() => setSel(s => (s - 1 + all.length) % all.length)} title="Edital anterior" disabled={all.length < 2}>‹</button>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.84rem', color: cur.cor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cur.nome}</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{cur.orgao} · {stats.pctConcluido}% · {stats.concluidos}/{allIds.length} subtópicos</div>
        </div>
        <button style={arrow} onClick={() => setSel(s => (s + 1) % all.length)} title="Próximo edital" disabled={all.length < 2}>›</button>
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        <button style={chartBtn('pizza', 'Pizza')} onClick={() => setChart('pizza')}>◔ Pizza</button>
        <button style={chartBtn('linhas', 'Linhas')} onClick={() => setChart('linhas')}>📈 Linhas</button>
        <button style={chartBtn('area', 'Área')} onClick={() => setChart('area')}>▰ Área</button>
        <button style={chartBtn('combo', 'Combo')} onClick={() => setChart('combo')}>⊞ Combo</button>
      </div>

      {discData.length === 0 ? <Empty icon="⚖" msg="Sem disciplinas neste edital" /> : (
        <div style={{ height: 178, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            {chart === 'pizza' ? (
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={72} paddingAngle={2} stroke="var(--card-bg)" strokeWidth={2}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={tipStyle} formatter={(v: any, n: any) => [`${v} concluído(s)`, n]} />
              </PieChart>
            ) : chart === 'linhas' ? (
              <LineChart data={discData} margin={{ top: 8, right: 10, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="curto" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} interval={0} angle={-30} textAnchor="end" height={42} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                <Tooltip contentStyle={tipStyle} formatter={(v: any) => [`${v}%`, '% concluído']} labelFormatter={(_: any, p: any) => p?.[0]?.payload?.nome || ''} />
                <Line type="monotone" dataKey="pct" name="% concluído" stroke={cur.cor} strokeWidth={2.5} dot={{ r: 3, fill: cur.cor }} />
              </LineChart>
            ) : chart === 'area' ? (
              <AreaChart data={discData} margin={{ top: 8, right: 10, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="edAreaG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={cur.cor} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={cur.cor} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="curto" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} interval={0} angle={-30} textAnchor="end" height={42} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                <Tooltip contentStyle={tipStyle} formatter={(v: any) => [`${v}%`, '% concluído']} labelFormatter={(_: any, p: any) => p?.[0]?.payload?.nome || ''} />
                <Area type="monotone" dataKey="pct" name="% concluído" stroke={cur.cor} strokeWidth={2} fill="url(#edAreaG)" />
              </AreaChart>
            ) : (
              <ComposedChart data={discData} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="curto" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} interval={0} angle={-30} textAnchor="end" height={42} />
                <YAxis yAxisId="l" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                <Tooltip contentStyle={tipStyle} labelFormatter={(_: any, p: any) => p?.[0]?.payload?.nome || ''} />
                <Bar yAxisId="l" dataKey="concluidos" name="Concluídos" fill={cur.cor} radius={[3, 3, 0, 0]} barSize={14} />
                <Line yAxisId="r" type="monotone" dataKey="pct" name="% concluído" stroke="#F29900" strokeWidth={2.2} dot={{ r: 2.5 }} />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </CardShell>
  )
}
function AguRevisoes({ agu, onNavigate }: any) {
  const al = agu.revisoes
  return (
    <CardShell icon="🔔" title="Revisões AGU" color="#F29900" badge={`${al.length} pendente${al.length !== 1 ? 's' : ''}`} footer="Revisar" navTo="editais" onNavigate={onNavigate}>
      {al.length === 0 ? <Empty icon="✓" msg="Nenhuma revisão atrasada" /> : al.slice(0, 6).map((a: any) => <Linha key={a.id} cor="#F29900" titulo={a.nome} meta={a.disciplina} right={`${a.dias}d`} />)}
    </CardShell>
  )
}

// — Ponto —
function PontoMes({ ponto, onNavigate }: any) { return <Kpi icon="⊙" label="Horas no Mês" value={`${ponto.hMes}h${ponto.mMes > 0 ? ` ${ponto.mMes}m` : ''}`} sub={ponto.emServico ? '🟢 Em serviço' : 'Ponto eletrônico'} color="#F29900" navTo="ponto" onNavigate={onNavigate} /> }

// — Prontuário —
function PrazosAdmKpi({ prontuario, onNavigate }: any) {
  const prox = prontuario.proximo
  return <Kpi icon="📋" label="Prazos ADM" value={prontuario.lista.length} sub={prox ? `próx: ${prox.titulo?.slice(0, 22) || '—'} (${prox.dias}d)` : 'sem prazos abertos'} color="#5b5bd6" navTo="prontuario" onNavigate={onNavigate} />
}
function ProntuarioPrazos({ prontuario, onNavigate }: any) {
  return (
    <CardShell icon="📋" title="Prontuário · Prazos" color="#5b5bd6" badge={`${prontuario.lista.length} aberta(s)`} footer="Abrir Prontuário" navTo="prontuario" onNavigate={onNavigate}>
      {prontuario.lista.length === 0 ? <Empty icon="📋" msg="Nenhuma demanda com prazo" /> : prontuario.lista.slice(0, 6).map((d: any) => {
        const cor = d.dias < 0 ? '#D93025' : d.dias <= 3 ? '#F29900' : '#5b5bd6'
        return <Linha key={d.id} cor={cor} titulo={d.titulo || d.numeroDemanda || 'Demanda'} meta={d.processoSEI || d.solicitante || ''} right={d.dias < 0 ? `${-d.dias}d atraso` : `${d.dias}d`} />
      })}
    </CardShell>
  )
}

// — Concursos —
function ConcursosKpi({ concursos, onNavigate }: any) {
  const p = concursos.proximos[0]
  return <Kpi icon="🎯" label="Concursos" value={concursos.ativos.length} sub={p ? `próx: ${fmtData(p.dataProva)}` : `${concursos.total} no total`} color="#8B5CF6" navTo="concursos" onNavigate={onNavigate} />
}
function ConcursosLista({ concursos, onNavigate }: any) {
  return (
    <CardShell icon="🎯" title="Próximos Concursos" color="#8B5CF6" badge={`${concursos.ativos.length} ativo(s)`} footer="Abrir Concursos" navTo="concursos" onNavigate={onNavigate}>
      {concursos.proximos.length === 0 ? <Empty icon="🎯" msg="Nenhuma prova agendada" /> : concursos.proximos.map((c: any) => <Linha key={c.id} cor="#8B5CF6" titulo={c.nome || c.cargo || 'Concurso'} meta={c.banca || c.orgao || ''} right={fmtData(c.dataProva)} />)}
    </CardShell>
  )
}

// — Agenda —
function AgendaHojeKpi({ agenda, onNavigate }: any) {
  const ev = agenda.hoje
  return <Kpi icon="📅" label="Agenda · Hoje" value={`${ev.length} evento${ev.length !== 1 ? 's' : ''}`} sub={`${agenda.concluidosHoje} concluído(s) · ${ev.length - agenda.concluidosHoje} pendente(s)`} color="#1A73E8" navTo="agenda" onNavigate={onNavigate} />
}
const AG_COR: Record<string, string> = { reuniao: '#1A73E8', prazo: '#D93025', pessoal: '#F29900', juridico: '#7B1FA2', saude: '#0F9D58', financeiro: '#00897B', estudo: '#3949AB', viagem: '#039BE5', aniversario: '#E91E63', outro: '#78909C' }
function AgendaHojeLista({ agenda, onNavigate }: any) {
  return (
    <CardShell icon="📅" title="Agenda · Hoje" color="#1A73E8" badge={fmtData(hojeISO())} footer="Abrir Agenda" navTo="agenda" onNavigate={onNavigate}>
      {agenda.hoje.length === 0 ? <Empty icon="📅" msg="Nenhum evento hoje" /> : agenda.hoje.slice(0, 7).map((e: any) => <Linha key={e.id} cor={AG_COR[e.tipo] || '#1A73E8'} titulo={`${e.horaInicio ? e.horaInicio + ' · ' : ''}${e.titulo}`} meta={e.tipo} right={e.concluido ? '✓' : ''} />)}
    </CardShell>
  )
}
function AgendaSemana({ agenda, onNavigate }: any) {
  return (
    <CardShell icon="🗓" title="Próximos 7 dias" color="#039BE5" badge={`${agenda.semana.length} evento(s)`} footer="Abrir Agenda" navTo="agenda" onNavigate={onNavigate}>
      {agenda.semana.length === 0 ? <Empty icon="🗓" msg="Semana livre" /> : agenda.semana.slice(0, 8).map((e: any) => <Linha key={e.id} cor={AG_COR[e.tipo] || '#039BE5'} titulo={e.titulo} meta={e.tipo} right={fmtData(e.data)} />)}
    </CardShell>
  )
}

// — Saúde —
function calcSonoH(sono: any): number {
  if (!sono || !sono.inicio || !sono.fim) return 0
  const [ih, im] = sono.inicio.split(':').map(Number)
  const [fh, fm] = sono.fim.split(':').map(Number)
  let mins = (fh * 60 + fm) - (ih * 60 + im); if (mins < 0) mins += 1440
  return Math.round(mins / 60 * 10) / 10
}
function SaudeStreak({ saude, onNavigate }: any) {
  const a = saude.reg?.agua ?? 0, m = saude.reg?.metaAgua ?? 2000
  return <Kpi icon="✚" label="Saúde · Streak" value={`${saude.streak}d`} sub={saude.reg ? `água ${(a / 1000).toFixed(1)}/${(m / 1000).toFixed(1)}L hoje` : 'sem registro hoje'} color="#0F9D58" navTo="saude" onNavigate={onNavigate} />
}
function SaudeHoje({ saude, onNavigate }: any) {
  const r = saude.reg || {}
  const sonoH = calcSonoH(r.sono)
  const items = [
    { l: 'Água', v: r.agua != null ? `${((r.agua || 0) / 1000).toFixed(1)}L` : '—', sub: r.metaAgua ? `meta ${(r.metaAgua / 1000).toFixed(1)}L` : '', c: '#039BE5' },
    { l: 'Peso', v: r.peso ? `${r.peso} kg` : '—', sub: '', c: '#0F9D58' },
    { l: 'Sono', v: sonoH ? `${sonoH} h` : '—', sub: '', c: '#7B1FA2' },
    { l: 'Humor', v: r.humor != null ? `${r.humor}/5` : '—', sub: r.energia != null ? `energia ${r.energia}/5` : '', c: '#F29900' },
  ]
  return (
    <CardShell icon="✚" title="Saúde · Hoje" color="#0F9D58" badge={`streak ${saude.streak}d`} footer="Abrir Saúde" navTo="saude" onNavigate={onNavigate}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
        {items.map(it => <div key={it.l} style={{ padding: '9px 11px', borderRadius: 10, background: `${it.c}0c`, border: `1px solid ${it.c}22` }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{it.l}{it.sub ? ` · ${it.sub}` : ''}</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{it.v}</div>
        </div>)}
      </div>
    </CardShell>
  )
}

// — Wishlist —
function WishlistKpi({ wishlist, onNavigate }: any) { return <Kpi icon="🛒" label="Wishlist" value={wishlist.prioritarios.length} sub={`${wishlist.pendentes.length} pendentes`} color="#F29900" navTo="wishlist" onNavigate={onNavigate} /> }
function WishlistLista({ wishlist, onNavigate }: any) {
  const lista = wishlist.prioritarios.length ? wishlist.prioritarios : wishlist.pendentes
  return (
    <CardShell icon="🛒" title="Wishlist · Prioritários" color="#F29900" badge={`${wishlist.pendentes.length} item(ns)`} footer="Abrir Wishlist" navTo="wishlist" onNavigate={onNavigate}>
      {lista.length === 0 ? <Empty icon="🛒" msg="Lista vazia" /> : lista.slice(0, 6).map((i: any) => <Linha key={i.id} cor={i.prioridade === 'urgente' ? '#D93025' : '#F29900'} titulo={i.nome || i.titulo} meta={i.prioridade} right={i.preco ? `R$ ${Number(i.preco).toLocaleString('pt-BR')}` : ''} />)}
    </CardShell>
  )
}

// — Gaming —
function GamingKpi({ gaming, onNavigate }: any) { return <Kpi icon="🎮" label="Gaming" value={gaming.jogando.length} sub={`${gaming.concluidos} concluídos · ${gaming.total} jogos`} color="#8B5CF6" navTo="gaming" onNavigate={onNavigate} /> }
function GamingLista({ gaming, onNavigate }: any) {
  return (
    <CardShell icon="🎮" title="Jogando agora" color="#8B5CF6" badge={`${gaming.total} jogos`} footer="Gaming Hub" navTo="gaming" onNavigate={onNavigate}>
      {gaming.jogando.length === 0 ? <Empty icon="🎮" msg="Nenhum jogo em andamento" /> : gaming.jogando.slice(0, 5).map((g: any) => <Linha key={g.id} cor="#8B5CF6" titulo={g.titulo} meta={g.plataforma} right={`${g.progresso || 0}%`} />)}
    </CardShell>
  )
}

// — Media —
function MediaKpi({ media, onNavigate }: any) { return <Kpi icon="▶" label="Media" value={media.andamento.length} sub="em andamento" color="#3b82f6" navTo="media" onNavigate={onNavigate} /> }
const MEDIA_ICO: Record<string, string> = { filme: '🎬', serie: '📺', livro: '📚' }
function MediaLista({ media, onNavigate }: any) {
  return (
    <CardShell icon="▶" title="Assistindo / Lendo" color="#3b82f6" badge={`${media.andamento.length} ativo(s)`} footer="Media Tracker" navTo="media" onNavigate={onNavigate}>
      {media.andamento.length === 0 ? <Empty icon="▶" msg="Nada em andamento" /> : media.andamento.slice(0, 5).map((m: any) => {
        const pct = m.tipo === 'serie' ? Math.round(((m.episodiosAssistidos || 0) / (m.totalEpisodios || 1)) * 100) : m.tipo === 'livro' ? Math.round(((m.paginaAtual || 0) / (m.totalPaginas || 1)) * 100) : 0
        return <Linha key={m.id} cor="#3b82f6" titulo={`${MEDIA_ICO[m.tipo] || '▶'} ${m.titulo}`} meta={m.tipo} right={`${pct}%`} />
      })}
    </CardShell>
  )
}

// — Notas —
function NotasKpi({ notas, onNavigate }: any) { return <Kpi icon="✦" label="Notas" value={notas.length} sub="anotações no diário" color="#8ab4f8" navTo="journal" onNavigate={onNavigate} /> }
function NotasRecentes({ notas, onNavigate }: any) {
  return (
    <CardShell icon="✦" title="Notas Recentes" color="#8ab4f8" badge={`${notas.length} nota(s)`} footer="Ver Notas" navTo="journal" onNavigate={onNavigate}>
      {notas.length === 0 ? <Empty icon="✦" msg="Nenhuma nota ainda" /> : notas.slice(0, 5).map((n: any) => <Linha key={n.id} cor="#8ab4f8" titulo={n.titulo || (n.conteudo || '').slice(0, 40) || 'Sem título'} meta={n.data ? fmtData(n.data) : ''} />)}
    </CardShell>
  )
}

// — Links —
const LINK_COR: Record<string, string> = { profissional: '#1A73E8', pessoal: '#0F9D58', sistemas: '#8B5CF6', interesse: '#F29900', educacional: '#f97316', diversos: '#78909C' }
function LinksLista({ links, onNavigate }: any) {
  return (
    <CardShell icon="🔗" title="Links Recentes" color="#1A73E8" badge={`${links.length} link(s)`} footer="Abrir Links" navTo="links" onNavigate={onNavigate}>
      {links.length === 0 ? <Empty icon="🔗" msg="Nenhum link salvo" /> : links.slice(0, 6).map((l: any) => <Linha key={l.id} cor={LINK_COR[l.categoria] || '#1A73E8'} titulo={l.titulo || l.url} meta={l.categoria} />)}
    </CardShell>
  )
}

// — Logs —
function LogsHoje({ logs, onNavigate }: any) {
  const h = Math.floor(logs.minHoje / 60), m = logs.minHoje % 60
  return <Kpi icon="📋" label="Logs · Hoje" value={logs.minHoje > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : '—'} sub={`${logs.logHoje.length} registro(s) hoje`} color="#00897B" navTo="logs" onNavigate={onNavigate} />
}

// — Viagens —
function ViagensKpi({ viagens, onNavigate }: any) {
  const p = viagens[0]
  return <Kpi icon="✈️" label="Viagens" value={viagens.length} sub={p ? `próx: ${p.destino || p.titulo || ''} ${p.dataInicio ? fmtData(p.dataInicio) : ''}`.trim() : 'nenhuma confirmada'} color="#039BE5" navTo="viagens" onNavigate={onNavigate} />
}
function ViagensLista({ viagens, onNavigate }: any) {
  return (
    <CardShell icon="✈️" title="Viagens Confirmadas" color="#039BE5" badge={`${viagens.length}`} footer="Abrir Viagens" navTo="viagens" onNavigate={onNavigate}>
      {viagens.length === 0 ? <Empty icon="✈️" msg="Nenhuma viagem confirmada" /> : viagens.slice(0, 5).map((v: any) => <Linha key={v.id} cor="#039BE5" titulo={v.destino || v.titulo || 'Viagem'} meta={v.dataInicio ? `${fmtData(v.dataInicio)}${v.dataFim ? ' – ' + fmtData(v.dataFim) : ''}` : ''} />)}
    </CardShell>
  )
}

// — Análise de PDF (NOVO) —
function PdfKpi({ pdfNotes, pdfFolders, onNavigate }: any) { return <Kpi icon="📄" label="Análise de PDF" value={pdfNotes.length} sub={`${pdfFolders.length} pasta(s)`} color="#D93025" navTo="pdfreader" onNavigate={onNavigate} /> }
function PdfRecentes({ pdfNotes, onNavigate }: any) {
  const ord = [...pdfNotes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  return (
    <CardShell icon="📄" title="Anotações de PDF" color="#D93025" badge={`${pdfNotes.length} nota(s)`} footer="Abrir PDF Reader" navTo="pdfreader" onNavigate={onNavigate}>
      {ord.length === 0 ? <Empty icon="📄" msg="Nenhuma anotação ainda" /> : ord.slice(0, 6).map((n: any) => <Linha key={n.id} cor="#D93025" titulo={n.title || 'Sem título'} meta={n.updatedAt ? new Date(n.updatedAt).toLocaleDateString('pt-BR') : ''} />)}
    </CardShell>
  )
}

// — Mapa Mental (NOVO) —
function MapasKpi({ mm, onNavigate }: any) { return <Kpi icon="🧠" label="Mapas Mentais" value={mm.maps} sub={`${mm.folders} pasta(s)`} color="#7c6cff" navTo="pdfreader" onNavigate={onNavigate} /> }

// — Saudação / relógio (fundo temático por horário) —
function skyTheme(h: number) {
  // 7 períodos · paletas e cena (per = índice usado pelo motor de partículas)
  if (h < 6)  return { key: 'madrugada',   per: 0, icon: '🌙', accent: '#cdd6ff', gradient: 'linear-gradient(165deg,#070b24 0%,#141a45 48%,#2a1a52 100%)' }
  if (h < 9)  return { key: 'amanhecer',   per: 1, icon: '🌅', accent: '#ffe2b3', gradient: 'linear-gradient(165deg,#3a3e7a 0%,#c98aa8 38%,#ffb98a 70%,#ffe0b0 100%)' }
  if (h < 12) return { key: 'manhã',       per: 2, icon: '☀️', accent: '#fff2c0', gradient: 'linear-gradient(165deg,#1c7fe0 0%,#48b4f4 52%,#bfe7ff 100%)' }
  if (h < 16) return { key: 'tarde',       per: 3, icon: '🌤️', accent: '#fff6da', gradient: 'linear-gradient(165deg,#0b8fd6 0%,#19b3e6 48%,#9fe4f7 100%)' }
  if (h < 18) return { key: 'golden hour', per: 4, icon: '🌇', accent: '#ffd189', gradient: 'linear-gradient(165deg,#7a2a6a 0%,#e0623f 42%,#f59331 72%,#ffcf6a 100%)' }
  if (h < 20) return { key: 'crepúsculo',  per: 5, icon: '🌆', accent: '#ffd27a', gradient: 'linear-gradient(165deg,#0e1338 0%,#33285f 45%,#6b3a63 100%)' }
  return { key: 'noite', per: 6, icon: '✨', accent: '#ffd27a', gradient: 'linear-gradient(165deg,#04060f 0%,#0a1330 52%,#161a40 100%)' }
}
/* relógio analógico — ponteiros giram via CSS (delay negativo sincroniza com o horário real) */
function RelogioAnalogico({ accent = '#ffd27a' }: any) {
  const { sDelay, mDelay, hDelay } = useMemo(() => {
    const d = new Date()
    const s = d.getSeconds() + d.getMilliseconds() / 1000
    const m = d.getMinutes() * 60 + s
    const hr = (d.getHours() % 12) * 3600 + m
    return { sDelay: s, mDelay: m, hDelay: hr }
  }, [])
  const hands = { transformBox: 'view-box', transformOrigin: '100px 100px' } as any
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ display: 'block' }}>
      <circle cx="100" cy="100" r="93" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.16)" strokeWidth="7" />
      <circle cx="100" cy="100" r="93" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = i * 30 * Math.PI / 180, big = i % 3 === 0
        const r1 = big ? 73 : 80, r2 = 87
        return <line key={i} x1={100 + r1 * Math.sin(a)} y1={100 - r1 * Math.cos(a)} x2={100 + r2 * Math.sin(a)} y2={100 - r2 * Math.cos(a)} stroke="rgba(255,255,255,0.8)" strokeWidth={big ? 3 : 1.4} strokeLinecap="round" />
      })}
      <g style={{ ...hands, animation: 'nx-rot 43200s linear infinite', animationDelay: `-${hDelay}s` }}>
        <line x1="100" y1="108" x2="100" y2="54" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
      </g>
      <g style={{ ...hands, animation: 'nx-rot 3600s linear infinite', animationDelay: `-${mDelay}s` }}>
        <line x1="100" y1="110" x2="100" y2="32" stroke="rgba(255,255,255,0.94)" strokeWidth="4" strokeLinecap="round" />
      </g>
      <g style={{ ...hands, animation: 'nx-rot 60s linear infinite', animationDelay: `-${sDelay}s` }}>
        <line x1="100" y1="118" x2="100" y2="26" stroke={accent} strokeWidth="2" strokeLinecap="round" />
        <circle cx="100" cy="26" r="3" fill={accent} />
      </g>
      <circle cx="100" cy="100" r="6.5" fill="#fff" />
      <circle cx="100" cy="100" r="3" fill={accent} />
    </svg>
  )
}
/* ───────── Card de Saudação: fundo dinâmico por período (Canvas, escala 0–5) ─────────
   7 períodos (madrugada · amanhecer · manhã · tarde · golden hour · crepúsculo · noite).
   Cada efeito tem um peso-alvo por período (tabela W7); os pesos são interpolados a cada
   quadro → transição suave ao virar o relógio. O slider (0–5) é multiplicador global. */
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t
const gate01 = (k: number, lo: number) => clampN((k - lo) / (1 - lo + 1e-6), 0, 1)
const SAUD_NIVEIS = [
  { n: 'Estático', d: 'Sem movimento · apenas o gradiente do horário. Consumo zero de CPU/GPU.' },
  { n: 'Minimalista', d: 'Poucos elementos, ultralento. O gradiente pulsa quase imperceptivelmente.' },
  { n: 'Sutil', d: 'Movimentos suaves e previsíveis.' },
  { n: 'Moderado', d: 'Experiência equilibrada, sem distração (padrão).' },
  { n: 'Imersivo', d: 'Parallax em camadas e efeitos pesados ativados.' },
  { n: 'Ultra', d: 'Capacidade visual máxima — experiência cinematográfica.' },
]
/* peso-alvo de cada efeito por período  [madrugada,amanhecer,manhã,tarde,golden,crepúsculo,noite] */
const W7: any = {
  stars:  [1, 0, 0, 0, 0, 0.55, 1],
  fog:    [1, 0.25, 0, 0, 0, 0, 0],
  moon:   [1, 0, 0, 0, 0, 0, 0.35],
  sunrise:[0, 1, 0, 0, 0, 0, 0],
  clouds: [0, 0.5, 1, 0.45, 0.25, 0, 0],
  rays:   [0, 0.35, 1, 0.55, 0.4, 0, 0],
  lens:   [0, 0, 0, 1, 0.35, 0, 0],
  breeze: [0, 0, 0.4, 1, 0.6, 0, 0],
  dust:   [0, 0, 0.35, 0.65, 0.85, 0.2, 0],
  gold:   [0, 0, 0, 0, 1, 0.35, 0],
  bokeh:  [0, 0, 0, 0, 0, 1, 0.25],
  shoot:  [0, 0, 0, 0, 0, 0, 1],
  aurora: [0, 0, 0, 0, 0, 0.2, 0.6],
  space:  [0, 0, 0, 0, 0, 0, 1],
}

function SaudacaoFX({ level, period }: any) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const levelRef = useRef(level); const perRef = useRef(period)
  const ctrlRef = useRef<any>({ running: false, start: () => {} })
  useEffect(() => { levelRef.current = level; if (level > 0) ctrlRef.current.start() }, [level])
  useEffect(() => { perRef.current = period }, [period])

  useEffect(() => {
    const canvas = cvRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const host = canvas.parentElement as HTMLElement
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let W = 1, H = 1, T = 0
    const resize = () => { const r = host.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0) }
    const ro = new ResizeObserver(resize); ro.observe(host); resize()

    const mouse = { x: -9, y: -9, on: false }
    const onMove = (e: any) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.on = true }
    const onLeave = () => { mouse.on = false }
    host.addEventListener('pointermove', onMove); host.addEventListener('pointerleave', onLeave)

    const rnd = (a: number, b: number) => a + Math.random() * (b - a)
    const MAX = { star: 120, breeze: 22, dust: 64, mw: 70, bokeh: 14 }
    const stars = Array.from({ length: MAX.star }, () => ({ x: rnd(0, 1), y: rnd(0, 1), r: rnd(.4, 1.5), ph: rnd(0, 6.28), sp: rnd(.5, 2.3) }))
    const mwStars = Array.from({ length: MAX.mw }, () => ({ t: rnd(0, 1), off: rnd(-.06, .06), r: rnd(.4, 1.3), ph: rnd(0, 6.28) }))
    const breeze = Array.from({ length: MAX.breeze }, () => ({ x: rnd(0, 1), y: rnd(0, 1), vx: rnd(.05, .12), ph: rnd(0, 6.28), sway: rnd(.5, 1.3), sz: rnd(4, 8), rot: rnd(0, 6.28), vr: rnd(-.03, .03), depth: rnd(.5, 1), petal: Math.random() < 0.4 }))
    const dust = Array.from({ length: MAX.dust }, () => ({ x: rnd(0, 1), y: rnd(0, 1), vx: rnd(-.02, .02), vy: rnd(-.04, -.005), r: rnd(.5, 1.8), ph: rnd(0, 6.28), hue: rnd(38, 52) }))
    const bokeh = Array.from({ length: MAX.bokeh }, () => ({ x: rnd(0, 1), y: rnd(.62, .98), r: rnd(8, 22), ph: rnd(0, 6.28), sp: rnd(.4, 1.4), hue: [40, 200, 320, 50, 170][Math.floor(rnd(0, 5))] }))
    const planets = [
      { x: rnd(.1, .9), y: rnd(.18, .5), r: rnd(7, 11), sp: rnd(.004, .01), col: '#c9a36b', ring: true },
      { x: rnd(.1, .9), y: rnd(.2, .6), r: rnd(5, 8), sp: rnd(.004, .012), col: '#7fa6d8', ring: false },
      { x: rnd(.1, .9), y: rnd(.15, .45), r: rnd(4, 6), sp: rnd(.005, .013), col: '#d88f7f', ring: false },
    ]
    const nebs = [280, 200, 330].map(hue => ({ x: rnd(.15, .85), y: rnd(.2, .7), r: rnd(60, 120), ph: rnd(0, 6.28), hue }))
    let shoot: any = null

    const w: any = {}; for (const k in W7) w[k] = W7[k][period] || 0
    let kEff = 0, last = performance.now(), raf = 0, alive = true, shootAcc = 0

    function frame(now: number) {
      if (!alive) return
      const ms = Math.min(60, now - last); const dt = ms / 16.67; last = now; T = now / 1000
      const L = levelRef.current, per = perRef.current
      kEff = lerpN(kEff, L / 5, clampN(0.05 * dt, 0, 1))
      for (const k in W7) w[k] = lerpN(w[k], W7[k][per] || 0, clampN(0.03 * dt, 0, 1))
      ctx.clearRect(0, 0, W, H)
      const k = kEff
      if (k > 0.012) {
        const A = (key: string) => w[key] * k
        // ── camadas de fundo ──
        if (A('gold') > 0.01) goldWaves(A('gold'))
        if (A('space') > 0.01 && k > 0.55) deepSpace(gate01(k, 0.55) * w['space'])
        if (A('aurora') > 0.01) aurora(A('aurora'))
        if (A('sunrise') > 0.01) sunrise(A('sunrise'))
        if (A('fog') > 0.01) fog(A('fog'))
        if (A('moon') > 0.01) moon(A('moon'))
        // ── meio ──
        if (A('clouds') > 0.01) clouds(A('clouds'))
        if (A('rays') > 0.01) rays(A('rays'))
        // ── partículas / luzes ──
        if (A('stars') > 0.01) drawStars(A('stars'))
        if (A('dust') > 0.01) drawDust(w['dust'] * k)
        if (A('breeze') > 0.01) drawBreeze(w['breeze'] * k, dt)
        if (A('bokeh') > 0.01) drawBokeh(A('bokeh'))
        if (A('lens') > 0.01) lensFlare(A('lens'))
        if (A('shoot') > 0.01 && k > 0.35) shootingStar(w['shoot'] * k, dt, ms)
      } else { shoot = null }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
      if (L === 0 && kEff < 0.012) { ctx.clearRect(0, 0, W, H); ctrlRef.current.running = false; return }
      raf = requestAnimationFrame(frame)
    }

    /* 1 · MADRUGADA / NOITE — estrelas cintilando assincronamente */
    function drawStars(a: number) {
      const n = Math.floor(MAX.star * kEff); ctx.fillStyle = '#fff'
      for (let i = 0; i < n; i++) { const s = stars[i]; const tw = 0.3 + 0.7 * 0.5 * (1 + Math.sin(T * s.sp * (0.4 + 0.6 * kEff) + s.ph)); ctx.globalAlpha = tw * a; ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283); ctx.fill() }
      ctx.globalAlpha = 1
    }
    /* névoa sutil na base */
    function fog(a: number) {
      ctx.save(); ctx.globalCompositeOperation = 'screen'
      for (let i = 0; i < 3; i++) { const cx = (((0.2 + i * 0.4 + T * 0.012 * (1 + i)) % 1.4) - 0.2) * W; const cy = H * (0.86 + i * 0.04); const r = W * (0.28 + i * 0.05); const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(180,195,230,${0.07 * a})`); g.addColorStop(1, 'rgba(180,195,230,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill() }
      ctx.restore()
    }
    /* brilho lunar */
    function moon(a: number) {
      const mx = W * 0.12, my = H * 0.26
      const g = ctx.createRadialGradient(mx, my, 0, mx, my, 46); g.addColorStop(0, `rgba(253,246,227,${0.9 * a})`); g.addColorStop(.45, `rgba(253,246,227,${0.4 * a})`); g.addColorStop(1, 'rgba(253,246,227,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, 46, 0, 6.283); ctx.fill()
      ctx.fillStyle = `rgba(255,252,240,${a})`; ctx.beginPath(); ctx.arc(mx, my, 9 + 1.2 * Math.sin(T * 0.6), 0, 6.283); ctx.fill()
    }
    /* 2 · AMANHECER — sol surgindo de baixo + nuvens finas dissipando */
    function sunrise(a: number) {
      const sx = W * 0.5, sy = H * (1.06 - 0.06 * Math.sin(T * 0.25))
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 1.5); g.addColorStop(0, `rgba(255,224,170,${0.55 * a})`); g.addColorStop(.3, `rgba(255,180,140,${0.22 * a})`); g.addColorStop(.7, 'rgba(255,180,140,0)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
      ctx.save(); ctx.globalCompositeOperation = 'screen'
      for (let i = 0; i < 3; i++) { const drift = (T * 0.02 * (1 + i)) % 1; const cx = ((0.15 + i * 0.32 + drift) % 1.3 - 0.15) * W; const cy = H * (0.32 + i * 0.14); const fade = 0.5 + 0.5 * Math.sin(T * 0.3 + i); const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 0.6); g2.addColorStop(0, `rgba(255,255,255,${0.10 * a * fade})`); g2.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g2; ctx.beginPath(); ctx.ellipse(cx, cy, H * 0.7, H * 0.3, 0, 0, 6.283); ctx.fill() }
      ctx.restore()
    }
    /* 3 · MANHÃ — nuvens volumosas no eixo X */
    function clouds(a: number) {
      ctx.save(); ctx.globalCompositeOperation = 'screen'
      for (let i = 0; i < 3; i++) { const cx = (((0.1 + i * 0.36 + T * 0.012 * (1 + i * 0.4)) % 1.35) - 0.18) * W; const cy = H * (0.24 + i * 0.13); const r = H * (0.55 + i * 0.12); const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(255,255,255,${0.13 * a})`); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill() }
      ctx.restore()
    }
    /* 3 · raios diagonais com shimmer (intensifica no hover) */
    function rays(a: number) {
      const hov = mouse.on ? 1 : 0
      ctx.save(); ctx.globalCompositeOperation = 'screen'
      const sx = W * 0.85, sy = -H * 0.2
      for (let i = 0; i < 5; i++) { const off = i * 0.22; const sh = 0.5 + 0.5 * Math.sin(T * (1.2 + hov * 1.5) + i); const al = (0.05 + 0.06 * sh) * a * (0.6 + 0.4 * hov); const g = ctx.createLinearGradient(sx, sy, sx - W * 0.9, sy + H * 1.6); g.addColorStop(0, `rgba(255,245,200,${al})`); g.addColorStop(1, 'rgba(255,245,200,0)'); ctx.fillStyle = g; ctx.save(); ctx.translate(sx, sy); ctx.rotate(0.6 + off * 0.06); ctx.fillRect(-6, 0, 12 + 6 * sh, H * 1.8); ctx.restore() }
      ctx.restore()
    }
    /* 4 · TARDE — lens flare interativo + brisa (drawBreeze) */
    function lensFlare(a: number) {
      const lx = W * 0.8, ly = H * 0.2
      const mx = mouse.on ? mouse.x : W * 0.5, my = mouse.on ? mouse.y : H * 0.6
      ctx.save(); ctx.globalCompositeOperation = 'lighter'
      const g0 = ctx.createRadialGradient(lx, ly, 0, lx, ly, 70); g0.addColorStop(0, `rgba(255,250,220,${0.5 * a})`); g0.addColorStop(1, 'rgba(255,250,220,0)'); ctx.fillStyle = g0; ctx.beginPath(); ctx.arc(lx, ly, 70, 0, 6.283); ctx.fill()
      const dx = mx - lx, dy = my - ly
      const cols = ['#ffd9a0', '#a0d8ff', '#ffb0c0', '#c0ffd0']
      for (let i = 1; i <= 4; i++) { const t = i / 5 + (mouse.on ? 0.1 : 0); const px = lx + dx * t * 2, py = ly + dy * t * 2; const r = (6 + i * 4) * (mouse.on ? 1 : 0.6); const g = ctx.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, cols[i - 1] + 'cc'); g.addColorStop(1, cols[i - 1] + '00'); ctx.globalAlpha = a * (mouse.on ? 0.7 : 0.4); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, 6.283); ctx.fill() }
      ctx.restore(); ctx.globalAlpha = 1
    }
    /* brisa — folhas/partículas translúcidas passando (eixo X) */
    function drawBreeze(a: number, dt: number) {
      const n = Math.floor(MAX.breeze * kEff)
      for (let i = 0; i < n; i++) { const o = breeze[i]; o.x += o.vx * 0.006 * dt * (0.6 + o.depth); o.y += Math.sin(T * o.sway + o.ph) * 0.0006; o.rot += o.vr * dt; if (o.x > 1.1) { o.x = -0.1; o.y = Math.random() }
        ctx.save(); ctx.translate(o.x * W, o.y * H); ctx.rotate(o.rot); ctx.globalAlpha = a * (0.4 + 0.5 * o.depth)
        ctx.fillStyle = o.petal ? 'rgba(255,200,210,0.8)' : 'rgba(150,205,150,0.78)'
        ctx.beginPath(); ctx.ellipse(0, 0, o.sz * o.depth, o.sz * 0.5 * o.depth, 0, 0, 6.283); ctx.fill(); ctx.restore() }
      ctx.globalAlpha = 1
    }
    /* poeira dourada (reage ao mouse) */
    function drawDust(a: number) {
      const n = Math.floor(MAX.dust * kEff)
      const mnx = mouse.on ? mouse.x / W : -9, mny = mouse.on ? mouse.y / H : -9
      for (let i = 0; i < n; i++) { const d = dust[i]; d.x += d.vx; d.y += d.vy
        if (kEff >= 0.4 && mouse.on) { const ddx = d.x - mnx, ddy = d.y - mny, dd = Math.sqrt(ddx * ddx + ddy * ddy) + 1e-4; if (dd < 0.2) { const f = (1 - dd / 0.2) * 0.0016; d.vx += ddx / dd * f; d.vy += ddy / dd * f } }
        d.vx *= 0.985; d.vy = d.vy * 0.985 - 0.00002
        if (d.x < -0.02) d.x = 1.02; if (d.x > 1.02) d.x = -0.02; if (d.y < -0.05) { d.y = 1.05; d.x = Math.random() }
        const tw = 0.5 + 0.5 * Math.sin(T * 1.4 + d.ph); ctx.globalAlpha = a * (0.4 + 0.5 * tw); ctx.fillStyle = `hsl(${d.hue},90%,66%)`; ctx.beginPath(); ctx.arc(d.x * W, d.y * H, d.r * (0.8 + 0.4 * tw), 0, 6.283); ctx.fill() }
      ctx.globalAlpha = 1
    }
    /* 5 · GOLDEN HOUR — ondas de luz dourada pulsando */
    function goldWaves(a: number) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 3; i++) { const ph = T * 0.5 + i * 2.1; const prog = (Math.sin(ph) * 0.5 + 0.5); const cy = H * (0.5 + 0.3 * Math.sin(T * 0.3 + i)); const r = H * (0.4 + prog * 1.2); const al = (1 - prog) * 0.16 * a; const g = ctx.createRadialGradient(W * 0.5, cy, r * 0.3, W * 0.5, cy, r); g.addColorStop(0, `rgba(255,190,90,${al})`); g.addColorStop(.6, `rgba(255,140,80,${al * 0.5})`); g.addColorStop(1, 'rgba(255,120,90,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(W * 0.5, cy, r, 0, 6.283); ctx.fill() }
      ctx.restore()
    }
    /* 6 · CREPÚSCULO — bokeh (luzes de cidade desfocadas) no rodapé */
    function drawBokeh(a: number) {
      const n = Math.floor(MAX.bokeh * kEff)
      ctx.save(); ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < n; i++) { const b = bokeh[i]; const blink = 0.35 + 0.65 * 0.5 * (1 + Math.sin(T * b.sp + b.ph)); const cx = b.x * W, cy = b.y * H; const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.r); g.addColorStop(0, `hsla(${b.hue},85%,65%,${0.5 * a * blink})`); g.addColorStop(.5, `hsla(${b.hue},85%,60%,${0.18 * a * blink})`); g.addColorStop(1, `hsla(${b.hue},85%,60%,0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, b.r, 0, 6.283); ctx.fill() }
      ctx.restore()
    }
    /* 7 · NOITE — estrela cadente a cada ~15 s */
    function shootingStar(a: number, dt: number, ms: number) {
      shootAcc += ms
      if (!shoot && shootAcc >= 15000) { shootAcc = 0; shoot = { x: rnd(0.25, 1) * W, y: rnd(0, 0.35) * H, vx: rnd(-3.4, -2), vy: rnd(1.3, 2.4), life: 1 } }
      if (shoot) { shoot.x += shoot.vx * dt * 3.2; shoot.y += shoot.vy * dt * 3.2; shoot.life -= 0.01 * dt; if (shoot.life <= 0 || shoot.x < -50 || shoot.y > H + 50) { shoot = null; return } const tx = shoot.x - shoot.vx * 9, ty = shoot.y - shoot.vy * 9; const g = ctx.createLinearGradient(shoot.x, shoot.y, tx, ty); g.addColorStop(0, `rgba(255,255,255,${0.95 * shoot.life * a})`); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.strokeStyle = g; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(tx, ty); ctx.stroke() }
    }
    /* aurora boreal levíssima (crepúsculo/noite) */
    function aurora(a: number) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'
      for (let b = 0; b < 2; b++) { const baseY = H * (0.1 + b * 0.1); const hue = 140 + 50 * Math.sin(T * 0.18 + b); const g = ctx.createLinearGradient(0, baseY - 18, 0, baseY + 42); g.addColorStop(0, `hsla(${hue},80%,60%,0)`); g.addColorStop(.5, `hsla(${hue},80%,62%,${0.09 * a})`); g.addColorStop(1, `hsla(${hue + 40},80%,60%,0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, baseY); for (let x = 0; x <= W; x += 14) ctx.lineTo(x, baseY + Math.sin(x * 0.012 + T * 0.7 + b) * 10); ctx.lineTo(W, baseY + 44); ctx.lineTo(0, baseY + 44); ctx.closePath(); ctx.fill() }
      ctx.restore()
    }
    /* observatório espacial (planetas/nebulosa/Via Láctea) — só níveis altos */
    function deepSpace(a: number) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'
      for (const n of nebs) { const cx = (n.x + 0.03 * Math.sin(T * 0.08 + n.ph)) * W, cy = (n.y + 0.03 * Math.cos(T * 0.06 + n.ph)) * H; const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, n.r); rg.addColorStop(0, `hsla(${n.hue},70%,62%,${0.06 * a})`); rg.addColorStop(1, `hsla(${n.hue},70%,62%,0)`); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, n.r, 0, 6.283); ctx.fill() }
      const g = ctx.createLinearGradient(0, H, W, 0); g.addColorStop(0, 'rgba(150,170,230,0)'); g.addColorStop(.5, `rgba(160,180,235,${0.045 * a})`); g.addColorStop(1, 'rgba(150,170,230,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#dfe6ff'; for (const m of mwStars) { const x = m.t * W, y = H * (0.78 - 0.55 * m.t) + m.off * H; const tw = 0.4 + 0.6 * 0.5 * (1 + Math.sin(T * 1.5 + m.ph)); ctx.globalAlpha = tw * a * 0.8; ctx.beginPath(); ctx.arc(x, y, m.r, 0, 6.283); ctx.fill() }
      ctx.restore(); ctx.globalAlpha = 1
      for (const p of planets) { const px = (((p.x + T * p.sp) % 1.2) - 0.1) * W, py = p.y * H; ctx.globalAlpha = a; const rg = ctx.createRadialGradient(px - p.r * 0.3, py - p.r * 0.3, p.r * 0.2, px, py, p.r); rg.addColorStop(0, p.col); rg.addColorStop(1, 'rgba(18,18,38,0.92)'); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(px, py, p.r, 0, 6.283); ctx.fill(); if (p.ring) { ctx.strokeStyle = `rgba(220,210,180,${0.5 * a})`; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(px, py, p.r * 1.9, p.r * 0.7, 0.5, 0, 6.283); ctx.stroke() } }
      ctx.globalAlpha = 1
    }

    ctrlRef.current.start = () => { if (!ctrlRef.current.running) { ctrlRef.current.running = true; last = performance.now(); raf = requestAnimationFrame(frame) } }
    if (levelRef.current > 0) ctrlRef.current.start()
    return () => { alive = false; cancelAnimationFrame(raf); ctrlRef.current.running = false; ro.disconnect(); host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave) }
  }, [])

  return <canvas ref={cvRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }} />
}

// ─── HojeNoMundo — IA Gemini ──────────────────────────────────────────────────
async function callGeminiHoje(prompt: string): Promise<string> {
  const cfg = (() => { try { return JSON.parse(localStorage.getItem('nexus_ai_cfg') || '{}') } catch { return {} } })()
  if (!cfg.key) throw new Error('Chave Gemini não configurada. Configure em nexus_ai_cfg no localStorage.')
  const url = cfg.url || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
  const model = cfg.model || 'gemini-2.5-flash'
  const corpo = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 8192, temperature: 0.7 }
  })

  const extrair = (d: any): string => {
    if (d?.error) throw new Error(`Gemini: ${d.error.message}`)
    const text = d?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    if (!text) throw new Error('Gemini não retornou conteúdo. Tente novamente.')
    return text
  }

  // 1º tenta direto; se falhar (firewall, 503, CORS) e houver Worker, usa fallback
  try {
    const r = await fetch(`${url}?key=${cfg.key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo })
    if (!r.ok && cfg.workerUrl) throw new Error(`HTTP ${r.status}`)
    return extrair(await r.json())
  } catch (err) {
    if (cfg.workerUrl) {
      const r = await fetch(`${cfg.workerUrl}?model=${model}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo })
      return extrair(await r.json())
    }
    throw err
  }
}

const CACHE_KEY_HOJE = 'nexus_hoje_mundo_cache'

function buildPromptHoje(dateStr: string, dayOfWeek: string): string {
  return `Hoje é ${dayOfWeek}, ${dateStr}. Responda APENAS com JSON válido e completo, sem markdown, sem texto extra.

{"dataFormatada":"string","diaSemana":"string","manchete":"frase impactante sobre este dia","efemerides":[{"ano":0,"emoji":"string","evento":"string"}],"datasComemoretivas":[{"emoji":"string","nome":"string","descricao":"string"}],"nascidos":[{"nome":"string","ano":0,"profissao":"string","emoji":"string"}],"falecidos":[{"nome":"string","ano":0,"legado":"string","emoji":"string"}],"curiosidades":[{"emoji":"string","titulo":"string","detalhe":"string"}],"pensamentoDoDia":"string","autorPensamento":"string"}

Preencha com dados REAIS sobre ${dateStr}:
- efemerides: 5 eventos históricos mundiais/brasileiros que ocorreram NESTE DIA
- datasComemoretivas: datas comemorativas nacionais/internacionais de hoje
- nascidos: 3 personalidades famosas que nasceram neste dia
- falecidos: 2 personalidades históricas que morreram neste dia  
- curiosidades: 3 fatos interessantes sobre o dia ou a época do ano
- Textos curtos e objetivos. Português brasileiro.`
}

interface HojeData {
  dataFormatada: string
  diaSemana: string
  manchete: string
  efemerides: { ano: number; emoji: string; evento: string }[]
  datasComemoretivas: { emoji: string; nome: string; descricao: string }[]
  nascidos: { nome: string; ano: number; profissao: string; emoji: string }[]
  falecidos: { nome: string; ano: number; legado: string; emoji: string }[]
  curiosidades: { emoji: string; titulo: string; detalhe: string }[]
  pensamentoDoDia: string
  autorPensamento: string
}

function HojeNoMundoModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<HojeData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'historia'|'celebracoes'|'pessoas'|'curiosidades'>('historia')

  const hoje = new Date(Date.now() - 3 * 3600000)
  const MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
  const DIAS_PT = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado']
  const dateStr = `${hoje.getDate()} de ${MESES_PT[hoje.getMonth()]} de ${hoje.getFullYear()}`
  const cacheKey = `${CACHE_KEY_HOJE}_${hoje.toISOString().slice(0,10)}`

  useEffect(() => {
    try { const cached = localStorage.getItem(cacheKey); if (cached) { setData(JSON.parse(cached)); return } } catch {}
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true); setError(null)
    try {
      const raw = await callGeminiHoje(buildPromptHoje(dateStr, DIAS_PT[hoje.getDay()]))
      const stripped = raw.replace(/```json\n?|```\n?/g, '').trim()
      const start = stripped.indexOf('{')
      const end = stripped.lastIndexOf('}')
      if (start === -1 || end === -1) throw new Error('Resposta da IA fora do formato esperado. Tente novamente.')
      const clean = stripped.slice(start, end + 1)
      const parsed: HojeData = JSON.parse(clean)
      setData(parsed)
      localStorage.setItem(cacheKey, JSON.stringify(parsed))
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar dados. Verifique sua chave Gemini.')
    }
    setLoading(false)
  }

  const TABS = [
    { id: 'historia', label: 'História', icon: '📜' },
    { id: 'celebracoes', label: 'Datas', icon: '🎉' },
    { id: 'pessoas', label: 'Pessoas', icon: '👤' },
    { id: 'curiosidades', label: 'Curiosidades', icon: '🧩' },
  ] as const

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 720, maxHeight: '90vh', background: 'var(--card-bg)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(59,130,246,0.1) 50%, rgba(16,185,129,0.08) 100%)', padding: '20px 24px 16px', borderBottom: '1px solid rgba(139,92,246,0.2)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ display: 'inline-flex', color: '#a78bfa' }}><Icon e="🌍" size={24} /></span>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.35rem', color: '#a78bfa', letterSpacing: '-0.01em', lineHeight: 1 }}>Hoje no Mundo</div>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
                {dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} · {DIAS_PT[hoje.getDay()].charAt(0).toUpperCase() + DIAS_PT[hoje.getDay()].slice(1)}
              </div>
              {data?.manchete && <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.5, maxWidth: 500 }}>"{data.manchete}"</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              {!loading && <button onClick={fetchData} title="Atualizar" style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.1)', color: '#a78bfa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon e="↻" size={15} /></button>}
              <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button>
            </div>
          </div>
          {data && (
            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id as any)}
                  style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${tab === t.id ? 'rgba(139,92,246,0.5)' : 'var(--border)'}`, background: tab === t.id ? 'rgba(139,92,246,0.15)' : 'none', color: tab === t.id ? '#a78bfa' : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: tab === t.id ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--font-display)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon e={t.icon} size={14} /> {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid rgba(139,92,246,0.2)', borderTopColor: '#a78bfa', animation: 'hmSpin 0.8s linear infinite' }} />
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>Consultando a IA sobre o dia de hoje…<br/><span style={{ fontSize: '0.72rem', opacity: 0.7 }}>Isso pode levar alguns segundos</span></div>
            </div>
          )}
          {error && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 250, gap: 14 }}>
              <div style={{ fontSize: '2.5rem' }}>⚠️</div>
              <div style={{ color: '#f87171', fontSize: '0.85rem', textAlign: 'center', maxWidth: 400, lineHeight: 1.6 }}>{error}</div>
              <button onClick={fetchData} style={{ padding: '8px 20px', borderRadius: 10, border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.1)', color: '#a78bfa', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>Tentar novamente</button>
            </div>
          )}
          {data && !loading && (
            <>
              {tab === 'historia' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>📜 Efemérides — O que aconteceu neste dia</div>
                  {data.efemerides.map((e, i) => (
                    <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', alignItems: 'flex-start' }}>
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 44 }}>
                        <span style={{ fontSize: '1.4rem' }}>{e.emoji}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.68rem', color: '#a78bfa' }}>{e.ano}</span>
                      </div>
                      <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.55, paddingTop: 2 }}>{e.evento}</div>
                    </div>
                  ))}
                </div>
              )}
              {tab === 'celebracoes' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>🎉 Datas & Celebrações de Hoje</div>
                  {data.datasComemoretivas.map((d, i) => (
                    <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04))', border: '1px solid rgba(139,92,246,0.15)', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '1.8rem', flexShrink: 0 }}>{d.emoji}</span>
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: 4 }}>{d.nome}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{d.descricao}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {tab === 'pessoas' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {data.nascidos.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>🎂 Nascidos neste dia</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {data.nascidos.map((p, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                            <span style={{ fontSize: '1.3rem' }}>{p.emoji}</span>
                            <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: '0.87rem', color: 'var(--text-primary)' }}>{p.nome}</div><div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{p.profissao}</div></div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: '#34d399' }}>{p.ano}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {data.falecidos.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>🕊 Falecidos neste dia</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {data.falecidos.map((p, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(148,163,184,0.05)', border: '1px solid rgba(148,163,184,0.12)' }}>
                            <span style={{ fontSize: '1.3rem', marginTop: 2 }}>{p.emoji}</span>
                            <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: '0.87rem', color: 'var(--text-primary)', marginBottom: 2 }}>{p.nome} <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 400 }}>({p.ano})</span></div><div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{p.legado}</div></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {tab === 'curiosidades' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>🧩 Curiosidades do Dia</div>
                  {data.curiosidades.map((c, i) => (
                    <div key={i} style={{ padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(245,158,11,0.06), transparent)', border: '1px solid rgba(245,158,11,0.15)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}><span style={{ fontSize: '1.4rem' }}>{c.emoji}</span><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: '#fbbf24' }}>{c.titulo}</div></div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{c.detalhe}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        {data && !loading && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(139,92,246,0.15)', background: 'rgba(139,92,246,0.04)', flexShrink: 0 }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.5 }}>💭 "{data.pensamentoDoDia}"</div>
            <div style={{ fontSize: '0.65rem', color: '#a78bfa', fontWeight: 600, marginTop: 5, fontFamily: 'var(--font-mono)' }}>— {data.autorPensamento}</div>
          </div>
        )}
        <style>{`@keyframes hmSpin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  )
}


function Saudacao() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  const h = now.getHours()
  const theme = useMemo(() => skyTheme(h), [h])
  const accent = theme.accent
  const saud = h < 6 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'

  const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [level, setLevel] = useState(() => { try { const r = localStorage.getItem('nexus_saudacao_fx'); if (r != null) { const n = parseInt(r, 10); if (!isNaN(n)) return clampN(n, 0, 5) } } catch {} return reduce ? 1 : 3 })
  useEffect(() => { try { localStorage.setItem('nexus_saudacao_fx', String(level)) } catch {} }, [level])

  // crossfade do gradiente ao trocar de período
  const [layers, setLayers] = useState<any[]>(() => [{ k: 0, g: theme.gradient }])
  const lc = useRef(0)
  useEffect(() => { setLayers(p => [...p, { k: ++lc.current, g: theme.gradient }].slice(-2)); const t = setTimeout(() => setLayers(p => p.slice(-1)), 1700); return () => clearTimeout(t) }, [theme.gradient])

  const [cfgOpen, setCfgOpen] = useState(false)
  const gearRef = useRef<HTMLButtonElement>(null)
  const [pop, setPop] = useState({ top: 0, right: 0 })
  const toggleCfg = () => { const r = gearRef.current?.getBoundingClientRect(); if (r) setPop({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) }); setCfgOpen(o => !o) }
  const pulseDur = 16 - level * 2
  const [showHoje, setShowHoje] = useState(false)

  return (
    <div style={{ position: 'relative', overflow: 'hidden', height: '100%', borderRadius: 16, boxShadow: 'var(--shadow-card)', background: layers[0]?.g }}>
      {/* gradiente com crossfade entre períodos */}
      {layers.map((l, i) => <div key={l.k} style={{ position: 'absolute', inset: 0, background: l.g, animation: i > 0 ? 'nx-gradin 1.6s ease forwards' : undefined, zIndex: 0, pointerEvents: 'none' }} />)}
      {/* pulso suave do gradiente (nível ≥ 1) */}
      {level >= 1 && <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 120% at 30% 18%, rgba(255,255,255,0.10), transparent 60%)', animation: `nx-saudpulse ${pulseDur}s ease-in-out infinite`, pointerEvents: 'none', zIndex: 0 }} />}
      {/* motor de partículas (Canvas) */}
      <SaudacaoFX level={level} period={theme.per} />
      {/* scrim p/ legibilidade */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, rgba(0,0,0,0.36) 0%, rgba(0,0,0,0.14) 42%, transparent 70%)', pointerEvents: 'none', zIndex: 2 }} />
      {/* engrenagem · Configurações de Foco */}
      <button ref={gearRef} onClick={toggleCfg} title="Configurações de Foco"
        style={{ position: 'absolute', top: 7, right: 8, zIndex: 5, width: 24, height: 24, borderRadius: 7, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(0,0,0,0.22)', backdropFilter: 'blur(4px)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', opacity: 0.85 }}>⚙</button>
      {/* conteúdo + relógio */}
      <div style={{ position: 'relative', zIndex: 3, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 18px', color: '#fff', textShadow: '0 1px 10px rgba(0,0,0,0.44)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', opacity: .92, letterSpacing: '0.05em', textTransform: 'capitalize' }}>{now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span>
            <span style={{ fontSize: '0.55rem', fontWeight: 700, background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(4px)', borderRadius: 20, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon e={theme.icon} size={11} /> {theme.key}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.45rem', lineHeight: 1.05 }}>{saud}, Bruno</div>
          <div style={{ fontSize: '0.72rem', opacity: .95, marginTop: 2, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · Central de Gestão NEXUS</span>
            <button onClick={() => setShowHoje(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 11px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(139,92,246,0.35)', backdropFilter: 'blur(6px)', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.68rem', cursor: 'pointer', textShadow: 'none', transition: 'all 0.18s', letterSpacing: '0.02em' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.35)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)' }}
            ><Icon e="🌍" size={14} /> Hoje no Mundo</button>
          </div>
        </div>
        <div style={{ width: 82, height: 82, flexShrink: 0, marginRight: 24, filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.35))' }}>
          <RelogioAnalogico accent={accent} />
        </div>
      </div>
      {/* popover Configurações de Foco */}
      {cfgOpen && createPortal(<>
        <div onClick={() => setCfgOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 6000 }} />
        <div style={{ position: 'fixed', top: pop.top, right: pop.right, zIndex: 6001, width: 272, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,0.35)', padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: '1rem' }}>🎚️</span>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>Configurações de Foco</div>
          </div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 7 }}>Intensidade · Nível {level} <span style={{ color: '#5b5bd6' }}>{SAUD_NIVEIS[level].n}</span></div>
          <input type="range" min={0} max={5} step={1} value={level} onChange={e => setLevel(parseInt(e.target.value, 10))} style={{ width: '100%', accentColor: '#5b5bd6', cursor: 'pointer', height: 22 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <button key={i} onClick={() => setLevel(i)} style={{ width: 20, height: 20, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.62rem', fontWeight: 800, background: i === level ? '#5b5bd6' : 'var(--surface)', color: i === level ? '#fff' : 'var(--text-muted)' }}>{i}</button>
            ))}
          </div>
          <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 9, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{SAUD_NIVEIS[level].d}</div>
          <div style={{ marginTop: 8, fontSize: '0.58rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>0 = estático (CPU zero) · 5 = cinematográfico · cena: {theme.icon} {theme.key}</div>
        </div>
      </>, document.body)}
      <style>{`
        @keyframes nx-rot{to{transform:rotate(360deg)}}
        @keyframes nx-saudpulse{0%,100%{opacity:0}50%{opacity:0.16}}
        @keyframes nx-gradin{from{opacity:0}to{opacity:1}}
      `}</style>
      {showHoje && <HojeNoMundoModal onClose={() => setShowHoje(false)} />}
    </div>
  )
}

// — Atalhos —  (cor base neutra; ao passar o mouse, cada um ganha sua cor vibrante)
const ATALHOS = [
  { id: 'editais', l: 'Editais', i: '⚖', c: '#2563EB' }, { id: 'concursos', l: 'Concursos', i: '🎯', c: '#7C3AED' },
  { id: 'prontuario', l: 'Prontuário', i: '📋', c: '#4F46E5' }, { id: 'pdfreader', l: 'PDF Reader', i: '📖', c: '#0EA5E9' },
  { id: 'ponto', l: 'Ponto', i: '⊙', c: '#EA580C' },
  { id: 'saude', l: 'Saúde', i: '✚', c: '#059669' }, { id: 'wishlist', l: 'Wishlist', i: '🛒', c: '#D97706' },
  { id: 'viagens', l: 'Viagens', i: '✈️', c: '#0284C7' }, { id: 'journal', l: 'Notas', i: '✦', c: '#2563EB' },
  { id: 'media', l: 'Media', i: '▶', c: '#3B82F6' }, { id: 'gaming', l: 'Gaming', i: '🎮', c: '#9333EA' },
  { id: 'arcade', l: 'Arcade', i: '🕹️', c: '#7C3AED' }, { id: 'inventario', l: 'Inventário', i: '📦', c: '#0891B2' },
  { id: 'projetos3d', l: 'Projetos 3D', i: '🧩', c: '#8B5CF6' },
  { id: 'agenda', l: 'Agenda', i: '📅', c: '#0891B2' }, { id: 'links', l: 'Links', i: '🔗', c: '#0D9488' },
  { id: 'logs', l: 'Logs', i: '📊', c: '#0F766E' }, { id: 'geosfera', l: 'Geosfera', i: '🌍', c: '#16A34A' },
  { id: 'financeiro', l: 'Financeiro', i: '◎', c: '#15803D' },
]
function AtalhosCard({ onNavigate }: any) {
  return (
    <CardShell icon="▦" title="Acesso Rápido" color="#5b5bd6">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))', gap: 8 }}>
        {ATALHOS.map(a => (
          <button key={a.id} onClick={() => onNavigate(a.id)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '12px 6px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all .16s' }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.background = `${a.c}1f`; el.style.borderColor = a.c; el.style.color = a.c; el.style.transform = 'translateY(-2px)'; el.style.boxShadow = `0 6px 16px ${a.c}33` }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.background = 'var(--surface)'; el.style.borderColor = 'var(--border)'; el.style.color = 'var(--text-muted)'; el.style.transform = 'none'; el.style.boxShadow = 'none' }}>
            <span style={{ display: 'inline-flex', color: a.c }}><Icon e={a.i} size={22} /></span>
            <span style={{ fontSize: '0.64rem', fontWeight: 600, textAlign: 'center' }}>{a.l}</span>
          </button>
        ))}
      </div>
    </CardShell>
  )
}

/* ═══════════════════ REGISTRO DE CARDS ═══════════════════ */
/* w/h em unidades de grid (12 colunas, linhas de ~120px). kind: 'kpi' | 'detail' */
const REGISTRY: Record<string, any> = {
  'saudacao':          { label: 'Saudação / Relógio', icon: '👋', kind: 'detail', w: 6, h: 1, render: (p: any) => <Saudacao /> },
  'atalhos':           { label: 'Acesso Rápido',       icon: '▦', kind: 'detail', w: 6, h: 2, render: (p: any) => <AtalhosCard {...p} /> },
  'agu-progresso':     { label: 'Progresso AGU',       icon: '📊', kind: 'kpi', w: 3, h: 1, render: (p: any) => <AguProgresso {...p} /> },
  'agu-questoes':      { label: 'Questões AGU',        icon: '📝', kind: 'kpi', w: 3, h: 1, render: (p: any) => <AguQuestoes {...p} /> },
  'agu-acerto':        { label: '% Acerto',            icon: '🎯', kind: 'kpi', w: 3, h: 1, render: (p: any) => <AguAcerto {...p} /> },
  'ponto-mes':         { label: 'Horas no Mês',        icon: '⊙', kind: 'kpi', w: 3, h: 1, render: (p: any) => <PontoMes {...p} /> },
  'prazos-adm-kpi':    { label: 'Prazos ADM (KPI)',    icon: '📋', kind: 'kpi', w: 3, h: 1, render: (p: any) => <PrazosAdmKpi {...p} /> },
  'concursos-kpi':     { label: 'Concursos (KPI)',     icon: '🎯', kind: 'kpi', w: 3, h: 1, render: (p: any) => <ConcursosKpi {...p} /> },
  'agenda-hoje-kpi':   { label: 'Agenda Hoje (KPI)',   icon: '📅', kind: 'kpi', w: 3, h: 1, render: (p: any) => <AgendaHojeKpi {...p} /> },
  'saude-streak':      { label: 'Saúde · Streak',      icon: '✚', kind: 'kpi', w: 3, h: 1, render: (p: any) => <SaudeStreak {...p} /> },
  'wishlist-kpi':      { label: 'Wishlist (KPI)',      icon: '🛒', kind: 'kpi', w: 3, h: 1, render: (p: any) => <WishlistKpi {...p} /> },
  'gaming-kpi':        { label: 'Gaming (KPI)',        icon: '🎮', kind: 'kpi', w: 3, h: 1, render: (p: any) => <GamingKpi {...p} /> },
  'media-kpi':         { label: 'Media (KPI)',         icon: '▶', kind: 'kpi', w: 3, h: 1, render: (p: any) => <MediaKpi {...p} /> },
  'notas-kpi':         { label: 'Notas (KPI)',         icon: '✦', kind: 'kpi', w: 3, h: 1, render: (p: any) => <NotasKpi {...p} /> },
  'logs-hoje':         { label: 'Logs Hoje',           icon: '📊', kind: 'kpi', w: 3, h: 1, render: (p: any) => <LogsHoje {...p} /> },
  'viagens-kpi':       { label: 'Viagens (KPI)',       icon: '✈️', kind: 'kpi', w: 3, h: 1, render: (p: any) => <ViagensKpi {...p} /> },
  'pdf-kpi':           { label: 'Análise PDF (KPI)',   icon: '📄', kind: 'kpi', w: 3, h: 1, render: (p: any) => <PdfKpi {...p} /> },
  'mapas-kpi':         { label: 'Mapas Mentais (KPI)', icon: '🧠', kind: 'kpi', w: 3, h: 1, render: (p: any) => <MapasKpi {...p} /> },
  'agu-disciplinas':   { label: 'Editais (disciplinas)', icon: '⚖', kind: 'detail', w: 4, h: 3, render: (p: any) => <EditaisCard {...p} /> },
  'agu-revisoes':      { label: 'Revisões AGU',        icon: '🔔', kind: 'detail', w: 4, h: 3, render: (p: any) => <AguRevisoes {...p} /> },
  'prontuario-prazos': { label: 'Prontuário · Prazos', icon: '📋', kind: 'detail', w: 4, h: 3, render: (p: any) => <ProntuarioPrazos {...p} /> },
  'concursos-lista':   { label: 'Próximos Concursos',  icon: '🎯', kind: 'detail', w: 4, h: 2, render: (p: any) => <ConcursosLista {...p} /> },
  'agenda-hoje-lista': { label: 'Agenda · Hoje',       icon: '📅', kind: 'detail', w: 4, h: 3, render: (p: any) => <AgendaHojeLista {...p} /> },
  'agenda-semana':     { label: 'Próximos 7 dias',     icon: '🗓', kind: 'detail', w: 4, h: 3, render: (p: any) => <AgendaSemana {...p} /> },
  'saude-hoje':        { label: 'Saúde · Hoje',        icon: '✚', kind: 'detail', w: 4, h: 2, render: (p: any) => <SaudeHoje {...p} /> },
  'peso':              { label: 'Controle de Peso',    icon: '⚖', kind: 'detail', w: 4, h: 4, render: (p: any) => <ControlePeso {...p} /> },
  'wishlist-lista':    { label: 'Wishlist · Lista',    icon: '🛒', kind: 'detail', w: 4, h: 3, render: (p: any) => <WishlistLista {...p} /> },
  'gaming-lista':      { label: 'Jogando agora',       icon: '🎮', kind: 'detail', w: 4, h: 2, render: (p: any) => <GamingLista {...p} /> },
  'media-lista':       { label: 'Assistindo / Lendo',  icon: '▶', kind: 'detail', w: 4, h: 2, render: (p: any) => <MediaLista {...p} /> },
  'notas-recentes':    { label: 'Notas Recentes',      icon: '✦', kind: 'detail', w: 4, h: 2, render: (p: any) => <NotasRecentes {...p} /> },
  'links-lista':       { label: 'Links Recentes',      icon: '🔗', kind: 'detail', w: 4, h: 2, render: (p: any) => <LinksLista {...p} /> },
  'viagens-lista':     { label: 'Viagens Confirmadas', icon: '✈️', kind: 'detail', w: 4, h: 2, render: (p: any) => <ViagensLista {...p} /> },
  'pdf-recentes':      { label: 'Anotações de PDF',    icon: '📄', kind: 'detail', w: 4, h: 3, render: (p: any) => <PdfRecentes {...p} /> },
  'arcade':            { label: 'Arcade',              icon: '🕹', kind: 'detail', w: 6, h: 4, render: (_p: any) => (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden', borderRadius: 16, border: '1px solid rgba(124,58,237,0.4)', background: 'radial-gradient(circle at 82% 16%, rgba(168,85,247,0.30), transparent 46%), radial-gradient(circle at 14% 88%, rgba(34,211,238,0.20), transparent 42%), repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 28px), linear-gradient(135deg,#1b1038 0%,#2d1b4e 52%,#0e0a22 100%)' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', top: -16, right: 8, fontSize: 124, opacity: 0.07, transform: 'rotate(12deg)' }}>🕹️</span>
        <span style={{ position: 'absolute', bottom: -22, left: -8, fontSize: 112, opacity: 0.07, transform: 'rotate(-10deg)' }}>👾</span>
        <span style={{ position: 'absolute', top: '40%', left: '42%', fontSize: 92, opacity: 0.05 }}>🎮</span>
      </div>
      <div style={{ position: 'relative', zIndex: 1, height: '100%', overflow: 'auto', padding: 4 }}><PainelArcade /></div>
    </div>
  ) },
}

const W_TIERS = [3, 4, 6, 12]
const H_TIERS = [1, 2, 3, 4]
const cycle = (arr: number[], v: number, dir: number) => { const i = arr.indexOf(v); const n = i < 0 ? 0 : Math.min(arr.length - 1, Math.max(0, i + dir)); return arr[n] }

const DEFAULT_LAYOUT = [
  { id: 'saudacao', w: 6, h: 1 }, { id: 'atalhos', w: 6, h: 2 },
  { id: 'agu-progresso', w: 3, h: 1 }, { id: 'agu-questoes', w: 3, h: 1 }, { id: 'agu-acerto', w: 3, h: 1 }, { id: 'ponto-mes', w: 3, h: 1 },
  { id: 'prazos-adm-kpi', w: 3, h: 1 }, { id: 'concursos-kpi', w: 3, h: 1 }, { id: 'agenda-hoje-kpi', w: 3, h: 1 }, { id: 'pdf-kpi', w: 3, h: 1 },
  { id: 'agu-disciplinas', w: 4, h: 3 }, { id: 'prontuario-prazos', w: 4, h: 3 }, { id: 'agenda-hoje-lista', w: 4, h: 3 },
  { id: 'agu-revisoes', w: 4, h: 3 }, { id: 'concursos-lista', w: 4, h: 2 }, { id: 'agenda-semana', w: 4, h: 2 },
  { id: 'pdf-recentes', w: 4, h: 2 }, { id: 'notas-recentes', w: 4, h: 2 }, { id: 'saude-hoje', w: 4, h: 2 },
  { id: 'arcade', w: 6, h: 4 },
]

/* ═══════════════════ BOARD ═══════════════════ */
export default function VisaoGeral({ onNavigate }: { onNavigate: (id: string) => void }) {
  const uid = useUid()
  const [cards, setCards] = useState<any[]>(() => {
    try { const r = localStorage.getItem('nexusos-visaogeral'); if (r) return JSON.parse(r) } catch {}
    return DEFAULT_LAYOUT
  })
  const [editing, setEditing] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 820)
  const drag = useRef<{ from: number } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  useEffect(() => { const fn = () => setIsMobile(window.innerWidth < 820); window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn) }, [])

  /* carrega layout do Firestore (mescla com defaults se vazio) */
  useEffect(() => {
    if (!uid || !db) return
    return onSnapshot(doc(db, `users/${uid}/config/visaoGeral`), snap => {
      const d: any = snap.data()
      if (d?.cards && Array.isArray(d.cards) && d.cards.length) {
        setCards(d.cards); localStorage.setItem('nexusos-visaogeral', JSON.stringify(d.cards))
      }
    })
  }, [uid])

  const persist = useCallback((next: any[]) => {
    setCards(next)
    localStorage.setItem('nexusos-visaogeral', JSON.stringify(next))
    if (uid && db) setDoc(doc(db, `users/${uid}/config/visaoGeral`), { cards: next, updatedAt: Date.now() }, { merge: true }).catch(() => {})
  }, [uid])

  /* ── dados (uma vez, partilhados entre cards) ── */
  const agu = useAguData()
  const ponto = usePontoData()
  const prontuario = useProntuarioData()
  const concursos = useConcursosData()
  const agenda = useAgendaData()
  const saude = useSaudeData()
  const wishlist = useWishlistData()
  const gaming = useGamingData()
  const media = useMediaData()
  const notas = useCol('notas')
  const links = useCol('links')
  const logs = useLogsData()
  const viagens = useViagensData()
  const pdfNotes = useCol('pdfNotes')
  const pdfFolders = useCol('pdfFolders')
  const mm = useMapaMentalLocal()

  const ctx = { onNavigate, agu, ponto, prontuario, concursos, agenda, saude, wishlist, gaming, media, notas, links, logs, viagens, pdfNotes, pdfFolders, mm }

  /* ── ações ── */
  const removeCard = (id: string) => persist(cards.filter(c => c.id !== id))
  const addCard = (id: string) => { const def = REGISTRY[id]; persist([...cards, { id, w: def.w, h: def.h }]); setShowGallery(false) }
  const resize = (id: string, dim: 'w' | 'h', dir: number) => persist(cards.map(c => c.id === id ? { ...c, [dim]: cycle(dim === 'w' ? W_TIERS : H_TIERS, c[dim], dir) } : c))
  const reset = () => { if (confirm('Restaurar o layout padrão da Visão Geral?')) persist(DEFAULT_LAYOUT) }

  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return
    const from = cards.findIndex(c => c.id === fromId), to = cards.findIndex(c => c.id === toId)
    if (from < 0 || to < 0) return
    const next = [...cards]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); persist(next)
  }

  const available = Object.keys(REGISTRY).filter(id => !cards.some(c => c.id === id))

  return (
    <div style={{ padding: '16px 20px 40px', minHeight: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.3rem', color: 'var(--text-primary)', flex: 1, minWidth: 120, letterSpacing: '-0.01em' }}>
          Visão Geral {editing && <span style={{ fontSize: '0.7rem', color: '#F29900', fontWeight: 600 }}>· editando</span>}
        </div>
        {editing && <button onClick={() => setShowGallery(s => !s)} style={btn(showGallery, '#1A73E8')}>＋ Adicionar card</button>}
        {editing && <button onClick={reset} style={btn(false, '#D93025')}>↺ Restaurar padrão</button>}
        <button onClick={() => { setEditing(e => !e); setShowGallery(false) }} style={btn(editing, '#F29900', true)}>{editing ? '✓ Concluir' : '✎ Personalizar'}</button>
      </div>

      {/* Galeria de cards disponíveis */}
      {editing && showGallery && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Cards disponíveis ({available.length})</div>
          {available.length === 0 ? <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>Todos os cards já estão no painel.</div> : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {available.map(id => (
                <button key={id} onClick={() => addCard(id)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 20, border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
                  <Icon e={REGISTRY[id].icon} size={14} />{REGISTRY[id].label} <span style={{ color: 'var(--text-accent)', fontWeight: 800 }}>＋</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(12, 1fr)', gap: 14, gridAutoRows: '120px', gridAutoFlow: 'row dense' }}>
        {cards.filter(c => REGISTRY[c.id]).map(c => {
          const def = REGISTRY[c.id]
          const span = isMobile ? 1 : Math.min(12, c.w)
          return (
            <div key={c.id}
              draggable={editing}
              onDragStart={() => { drag.current = { from: 0 }; setDragId(c.id) }}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
              onDragOver={e => { if (editing && dragId) { e.preventDefault(); setOverId(c.id) } }}
              onDrop={e => { e.preventDefault(); if (dragId) reorder(dragId, c.id); setDragId(null); setOverId(null) }}
              style={{
                gridColumn: isMobile ? '1' : `span ${span}`,
                gridRow: `span ${Math.max(1, c.h)}`,
                minHeight: isMobile ? (c.h > 1 ? 220 : 120) : undefined,
                position: 'relative',
                borderRadius: 16,
                outline: overId === c.id && dragId !== c.id ? '2px dashed var(--accent)' : 'none',
                outlineOffset: 2,
                opacity: dragId === c.id ? 0.4 : 1,
                transition: 'opacity .15s',
              }}>
              {/* controles de edição */}
              {editing && (
                <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 10, display: 'flex', gap: 3, background: 'var(--card-bg)', border: '1px solid var(--border-md)', borderRadius: 9, padding: 3, boxShadow: 'var(--shadow-sm)' }}>
                  {!isMobile && <>
                    <Ctrl title="Menos largura" onClick={() => resize(c.id, 'w', -1)}>◄</Ctrl>
                    <Ctrl title="Mais largura" onClick={() => resize(c.id, 'w', +1)}>►</Ctrl>
                    <Ctrl title="Menos altura" onClick={() => resize(c.id, 'h', -1)}>▲</Ctrl>
                    <Ctrl title="Mais altura" onClick={() => resize(c.id, 'h', +1)}>▼</Ctrl>
                  </>}
                  <Ctrl title="Remover" danger onClick={() => removeCard(c.id)}>✕</Ctrl>
                </div>
              )}
              {editing && <div style={{ position: 'absolute', top: 6, left: 8, zIndex: 10, fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)', background: 'var(--card-bg)', borderRadius: 6, padding: '2px 6px', cursor: 'grab' }}>⠿ arraste</div>}
              <div style={{ height: '100%', pointerEvents: editing ? 'none' : 'auto' }}>{def.render(ctx)}</div>
            </div>
          )
        })}
      </div>

      {cards.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-subtle)' }}>
          <div style={{ fontSize: '2.4rem', opacity: .5, marginBottom: 10 }}>▦</div>
          <div style={{ fontSize: '0.9rem', marginBottom: 14 }}>Nenhum card no painel.</div>
          <button onClick={() => { setEditing(true); setShowGallery(true) }} style={btn(false, '#1A73E8', true)}>＋ Adicionar cards</button>
        </div>
      )}

      {editing && <div style={{ textAlign: 'center', padding: '16px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>⠿ Arraste para reordenar · ◄ ► ▲ ▼ redimensionam · ✕ remove · ＋ adiciona da galeria</div>}
    </div>
  )
}

/* botãozinho de controle */
function Ctrl({ children, onClick, danger, title }: any) {
  return <button title={title} onClick={onClick} style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: danger ? 'rgba(217,48,37,0.1)' : 'var(--bg-hover)', color: danger ? '#D93025' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.62rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>{children}</button>
}
function btn(active: boolean, color: string, strong = false) {
  return { padding: '7px 14px', borderRadius: 8, border: `1px solid ${active ? color + '70' : 'var(--border)'}`, background: active ? color + '14' : 'transparent', color: active ? color : 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: strong ? 700 : 600, fontSize: '0.78rem', cursor: 'pointer', transition: 'all .15s' } as React.CSSProperties
}

/* ═══════════════════ hooks de agregação ═══════════════════ */
function useAguData() {
  const hooks = useEditaisAGU()
  const allIds = useMemo(() => AGU_DISCIPLINAS.flatMap(d => d.topicos.flatMap(t => t.subtopicos.map(s => s.id))), [])
  const global = hooks.getStats(allIds)
  const discStats = useMemo(() => AGU_DISCIPLINAS.map(d => {
    const ids = d.topicos.flatMap(t => t.subtopicos.map(s => s.id))
    return { ...d, ...hooks.getStats(ids), total: ids.length }
  }), [hooks])
  const revisoes = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const al: any[] = []
    for (const disc of AGU_DISCIPLINAS) for (const t of disc.topicos) for (const s of t.subtopicos) {
      const st = hooks.getState(s.id); if (!st.ultimaRevisao) continue
      const dias = Math.floor((hoje.getTime() - new Date(st.ultimaRevisao + 'T00:00:00').getTime()) / 86400000)
      if (dias >= 30) al.push({ id: s.id, nome: s.nome, disciplina: disc.nome, dias })
    }
    return al.sort((a, b) => b.dias - a.dias)
  }, [hooks])
  return { global, discStats, revisoes }
}
function usePontoData() {
  const reg = useCol('ponto', 'data')
  const hoje = hojeISO(), mes = hoje.slice(0, 7)
  const rh = reg.find((r: any) => r.data === hoje)
  const min = reg.filter((r: any) => (r.data || '').startsWith(mes)).reduce((a: number, r: any) => a + (r.minutos || 0), 0)
  return { emServico: !!(rh?.entrada && !rh?.saida), hMes: Math.floor(min / 60), mMes: min % 60 }
}
function useProntuarioData() {
  const rows = useCol('prontuario')
  const lista = rows.filter((d: any) => d.status !== 'concluida' && d.status !== 'cancelada' && d.prazo)
    .map((d: any) => ({ ...d, dias: Math.ceil((new Date(d.prazo + 'T00:00:00').getTime() - Date.now()) / 86400000) }))
    .sort((a: any, b: any) => a.dias - b.dias)
  return { lista, proximo: lista[0] || null }
}
function useConcursosData() {
  const rows = useCol('concursos')
  const hoje = hojeISO()
  const ativos = rows.filter((c: any) => c.status !== 'encerrado')
  const proximos = rows.filter((c: any) => c.dataProva && c.dataProva >= hoje).sort((a: any, b: any) => a.dataProva.localeCompare(b.dataProva)).slice(0, 4)
  return { ativos, proximos, total: rows.length }
}
function useAgendaData() {
  const rows = useCol('agenda', 'data')
  const hoje = hojeISO()
  const limite = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const evHoje = rows.filter((e: any) => e.data === hoje)
  const semana = rows.filter((e: any) => e.data > hoje && e.data <= limite)
  return { hoje: evHoje, semana, concluidosHoje: evHoje.filter((e: any) => e.concluido).length }
}
function useSaudeData() {
  const rows = useCol('saude')
  const hoje = hojeISO()
  const reg = rows.find((x: any) => x.data === hoje) || null
  const streak = (() => { let s = 0, d = new Date(); d.setHours(0, 0, 0, 0); while (true) { const ds = d.toISOString().slice(0, 10); if (!rows.find((r: any) => r.data === ds)) break; s++; d.setDate(d.getDate() - 1) } return s })()
  return { reg, streak }
}
function useWishlistData() {
  const itens = useCol('wishlist')
  const pendentes = itens.filter((i: any) => i.status !== 'comprado' && i.status !== 'cancelado')
  const prioritarios = pendentes.filter((i: any) => i.prioridade === 'urgente' || i.prioridade === 'alta')
  return { pendentes, prioritarios, total: itens.length }
}
function useGamingData() {
  const games = useCol('games')
  return { jogando: games.filter((g: any) => g.status === 'jogando'), concluidos: games.filter((g: any) => g.status === 'concluido').length, total: games.length }
}
function useMediaData() {
  const itens = useCol('media')
  return { andamento: itens.filter((i: any) => i.status === 'andamento'), total: itens.length }
}
function useLogsData() {
  const logs = useCol('logs')
  const hoje = hojeISO()
  const logHoje = logs.filter((l: any) => l.data === hoje)
  return { logHoje, total: logs.length, minHoje: logHoje.reduce((a: number, l: any) => a + (l.duracao || 0), 0) }
}
function useViagensData() {
  const rows = useCol('viagens')
  return rows.filter((v: any) => v.status === 'Confirmada').sort((a: any, b: any) => (a.dataInicio || '').localeCompare(b.dataInicio || ''))
}

/* ═══════════════════════════════════════════════════════════════════════
   PÁGINA INICIAL  ·  modo 🏠 "home" do Dashboard
   --------------------------------------------------------------------
   3 colunas que esticam na altura (sem espaços vazios), saudação animada
   no topo e BarraInferior fixa (essa fica no NexusDashboard).
   Reaproveita TODOS os componentes/hooks já existentes neste arquivo:
   Saudacao, ATALHOS, CardShell, Kpi, Linha, Ring, AguRevisoes,
   AgendaHojeLista, AgendaSemana, SaudeHoje, useAguData, useAgendaData,
   useSaudeData. Só adiciona o gráfico de Horas/semana e a coluna de Saúde.
   ═══════════════════════════════════════════════════════════════════════ */
const _pad2 = (n: number) => String(n).padStart(2, '0')
const _fmtISO = (d: Date) => `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}`
const _WD = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const Slot = ({ h, children }: any) => <div style={{ flexShrink: 0, height: h, minHeight: h }}>{children}</div>

/* horas trabalhadas da SEMANA atual (seg→dom), em buckets por dia */
function useHorasSemana() {
  const reg = useCol('ponto', 'data')
  return useMemo(() => {
    const base = new Date(hojeISO() + 'T12:00:00')
    const dow = (base.getDay() + 6) % 7           // 0 = segunda
    const mon = new Date(base); mon.setDate(base.getDate() - dow)
    const hojeStr = hojeISO()
    const data = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i)
      const ds = _fmtISO(d)
      const min = reg.filter((r: any) => (r.data || '') === ds).reduce((a: number, r: any) => a + (r.minutos || 0), 0)
      return { dia: _WD[i], ds, min, h: +(min / 60).toFixed(2), hoje: ds === hojeStr }
    })
    const totalMin = data.reduce((a, d) => a + d.min, 0)
    return { data, totalMin, totalH: Math.floor(totalMin / 60), totalM: totalMin % 60, saldoMin: totalMin - 40 * 60 }
  }, [reg])
}

/* séries de saúde derivadas de users/{uid}/saude (peso, água, atividade adaptativa) */
const _ATIV_FIELDS = [
  { k: 'passos', l: 'Passos', u: '', icon: '👟' },
  { k: 'atividade', l: 'Atividade', u: 'min', icon: '🏃' },
  { k: 'exercicio', l: 'Exercício', u: 'min', icon: '🏋️' },
  { k: 'minutosAtividade', l: 'Atividade', u: 'min', icon: '🏃' },
  { k: 'treino', l: 'Treino', u: 'min', icon: '💪' },
  { k: 'caloriasGastas', l: 'Calorias', u: 'kcal', icon: '🔥' },
  { k: 'distanciaKm', l: 'Distância', u: 'km', icon: '📍' },
  { k: 'distancia', l: 'Distância', u: 'km', icon: '📍' },
]
function useSaudeSeries() {
  const rows = useCol('saude')
  return useMemo(() => {
    const sorted = [...rows].sort((a: any, b: any) => (a.data || '').localeCompare(b.data || ''))
    const peso = sorted.filter((r: any) => r.peso != null && r.peso !== '')
      .map((r: any) => ({ data: r.data, label: fmtData(r.data), peso: Number(r.peso) }))
      .filter((p: any) => !isNaN(p.peso)).slice(-21)
    const agua = sorted.slice(-7).map((r: any) => ({
      label: fmtData(r.data),
      agua: Math.round((r.agua || 0) / 1000 * 10) / 10,
      meta: Math.round((r.metaAgua || 2000) / 1000 * 10) / 10,
    }))
    const pesoDelta = peso.length >= 2 ? +(peso[peso.length - 1].peso - peso[0].peso).toFixed(1) : 0
    const today = sorted.find((r: any) => r.data === hojeISO()) || sorted[sorted.length - 1] || {}
    const ativHoje = _ATIV_FIELDS
      .filter(a => today[a.k] != null && today[a.k] !== '' && typeof today[a.k] !== 'object')
      .filter((a, i, arr) => arr.findIndex(x => x.l === a.l) === i)
      .map(a => ({ ...a, v: today[a.k] }))
    const temPassos = sorted.some((r: any) => r.passos != null && r.passos !== '')
    const passosSerie = temPassos
      ? sorted.slice(-7).map((r: any) => ({ label: fmtData(r.data), passos: Number(r.passos) || 0 }))
      : []
    return { peso, pesoDelta, agua, ativHoje, passosSerie }
  }, [rows])
}

/* ── COLUNA 1 · Acesso Rápido (hover premium por categoria) ── */
function ColAcessoRapido({ onNavigate }: any) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg,#5b5bd610,transparent 70%)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ color: '#5b5bd6' }}>▦</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Acesso Rápido</span>
      </div>
      {/* Destaque · PDF Reader (linha inteira, acesso principal) */}
      <div style={{ flexShrink: 0, padding: '14px 14px 0' }}>
        <style>{`
          .pdf-hero{position:relative;overflow:hidden;display:flex;align-items:center;gap:14px;width:100%;padding:16px 18px;border-radius:16px;border:1px solid rgba(124,148,135,0.5);cursor:pointer;text-align:left;color:#f3f7f4;background:linear-gradient(120deg,#647d72,#4c635a 52%,#39473f);box-shadow:0 8px 22px rgba(57,71,63,0.42);transition:transform .24s cubic-bezier(.34,1.42,.5,1),box-shadow .24s,filter .24s,border-color .24s}
          .pdf-hero:hover{transform:translateY(-5px) scale(1.025);box-shadow:0 24px 54px rgba(57,71,63,0.7);filter:saturate(1.22) brightness(1.12);border-color:rgba(180,200,188,0.85)}
          .pdf-hero:active{transform:translateY(-1px) scale(.998)}
          .pdf-hero .pdf-glow{position:absolute;inset:0;pointer-events:none;opacity:.4;transition:opacity .3s;background:radial-gradient(circle at 88% -25%,rgba(255,255,255,0.35),transparent 58%)}
          .pdf-hero:hover .pdf-glow{opacity:1}
          .pdf-hero::before{content:'';position:absolute;top:-25%;left:-75%;width:60%;height:150%;background:linear-gradient(105deg,transparent,rgba(255,255,255,0.55),transparent);transform:skewX(-18deg);transition:left .62s cubic-bezier(.4,0,.2,1);pointer-events:none}
          .pdf-hero:hover::before{left:140%}
          .pdf-hero::after{content:'';position:absolute;inset:0;border-radius:16px;pointer-events:none;opacity:0;transition:opacity .3s;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.35),inset 0 14px 30px rgba(255,255,255,0.12)}
          .pdf-hero:hover::after{opacity:1}
          .pdf-hero .pdf-ic{font-size:1.95rem;display:inline-flex;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.32));transition:transform .26s}
          .pdf-hero:hover .pdf-ic{transform:scale(1.14) rotate(-5deg)}
        `}</style>
        <button onClick={() => onNavigate('pdfreader')} className="pdf-hero">
          <span aria-hidden className="pdf-glow" />
          <span className="pdf-ic">📖</span>
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.08rem', lineHeight: 1.1, letterSpacing: '0.01em' }}>PDF Reader</div>
            <div style={{ fontSize: '0.68rem', opacity: 0.92, marginTop: 3 }}>Leitura, anotações, dicionário e mapas — seu hub principal</div>
          </div>
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(94px,1fr))', gap: 10, alignContent: 'start' }}>
        {ATALHOS.filter(a => a.id !== 'pdfreader').map(a => (
          <button key={a.id} onClick={() => onNavigate(a.id)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '16px 8px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all .18s cubic-bezier(.4,0,.2,1)', minHeight: 86 }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = `linear-gradient(135deg, ${a.c}22, ${a.c}0a)`; el.style.borderColor = a.c; el.style.color = a.c; el.style.transform = 'translateY(-3px) scale(1.03)'; el.style.boxShadow = `0 12px 26px ${a.c}40`; const ic = el.querySelector('.ar-ic') as HTMLElement; if (ic) ic.style.transform = 'scale(1.18)' }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--surface)'; el.style.borderColor = 'var(--border)'; el.style.color = 'var(--text-secondary)'; el.style.transform = 'none'; el.style.boxShadow = 'none'; const ic = el.querySelector('.ar-ic') as HTMLElement; if (ic) ic.style.transform = 'none' }}>
            <span className="ar-ic" style={{ display: 'inline-flex', color: a.c, transition: 'transform .18s' }}><Icon e={a.i} size={26} /></span>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, textAlign: 'center', lineHeight: 1.15 }}>{a.l}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── COLUNA 2 · Horas Trabalhadas (semana) ── */
function HorasSemanaCard({ onNavigate }: any) {
  const { data, totalH, totalM, saldoMin } = useHorasSemana()
  const saldoH = Math.trunc(Math.abs(saldoMin) / 60), saldoM = Math.abs(saldoMin) % 60
  const pos = saldoMin >= 0
  return (
    <CardShell icon="⊙" title="Horas Trabalhadas · Semana" color="#EA580C" badge={`${totalH}h${totalM ? ` ${totalM}m` : ''}`} footer="Abrir Ponto" navTo="ponto" onNavigate={onNavigate}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 2, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--text-primary)' }}>{totalH}h{totalM ? ` ${totalM}m` : ''}</div>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: pos ? '#0F9D58' : '#D93025' }}>{pos ? '+' : '−'}{saldoH}h{saldoM ? ` ${saldoM}m` : ''} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>vs 40h</span></div>
      </div>
      <div style={{ height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="dia" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} />
            <Tooltip cursor={{ fill: 'rgba(234,88,12,0.06)' }} formatter={(v: any) => [`${v} h`, 'Horas']} contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
            <ReferenceLine y={8} stroke="#EA580C" strokeDasharray="4 4" strokeOpacity={0.5} />
            <Bar dataKey="h" radius={[5, 5, 0, 0]} maxBarSize={34}>
              {data.map((d: any, i: number) => (<Cell key={i} fill={d.hoje ? '#EA580C' : '#EA580C88'} />))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </CardShell>
  )
}

/* ── COLUNA 3 · Saúde ── */
function SaudeHero({ reg, streak, onNavigate }: any) {
  const a = reg?.agua ?? 0, m = reg?.metaAgua ?? 2000
  const pct = m ? Math.min(100, Math.round(a / m * 100)) : 0
  return (
    <div style={{ display: 'flex', gap: 12, padding: '14px 16px', borderRadius: 16, background: 'linear-gradient(135deg,#0F9D5814,#039BE50a)', border: '1px solid #0F9D5826' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Ring pct={pct} color="#039BE5" size={66} />
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 800, color: '#039BE5' }}>{pct}%</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.15rem', color: 'var(--text-primary)' }}>Bem-Estar</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>Streak de {streak} dia{streak !== 1 ? 's' : ''} · água {(a / 1000).toFixed(1)}/{(m / 1000).toFixed(1)} L</div>
        <button onClick={() => onNavigate('saude')} style={{ marginTop: 9, padding: '5px 12px', borderRadius: 8, border: '1px solid #0F9D5840', background: '#0F9D580c', color: '#0F9D58', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer' }}>Registro rápido →</button>
      </div>
    </div>
  )
}
function PesoCard({ peso, delta, onNavigate }: any) {
  if (!peso.length) return (
    <CardShell icon="⚖" title="Peso · Tendência" color="#0F9D58" footer="Abrir Saúde" navTo="saude" onNavigate={onNavigate}>
      <Empty icon="⚖" msg="Sem registros de peso ainda" />
    </CardShell>
  )
  const vals = peso.map((p: any) => p.peso)
  const mn = Math.min(...vals), mx = Math.max(...vals)
  const avg = +(vals.reduce((a: number, b: number) => a + b, 0) / vals.length).toFixed(2)
  const range = +(mx - mn).toFixed(2)
  // domínio justo, arredondado a 0,5 kg, folga pequena → amplia variações pequenas
  const m = Math.max(0.25, range * 0.18)
  const lo = Math.floor((mn - m) * 2) / 2
  const hi = Math.ceil((mx + m) * 2) / 2
  const span = hi - lo
  const step = span <= 3 ? 0.5 : span <= 10 ? 1 : 2
  const ticks: number[] = []
  for (let v = lo; v <= hi + 1e-9; v = +(v + step).toFixed(2)) ticks.push(+v.toFixed(2))
  // direção de cada ponto vs anterior
  const data = peso.map((p: any, i: number) => ({ ...p, dir: i === 0 ? 0 : Math.sign(+(p.peso - peso[i - 1].peso).toFixed(2)) }))
  const ult = vals[vals.length - 1]
  const down = delta <= 0
  const denso = peso.length > 14
  const C_SOBE = '#D93025', C_CAI = '#0F9D58', C_IGUAL = '#9aa0a6'
  const PesoDot = (props: any) => {
    const { cx, cy, payload } = props; if (cx == null || cy == null) return null
    const ext = payload.peso === mn || payload.peso === mx
    const c = payload.dir > 0 ? C_SOBE : payload.dir < 0 ? C_CAI : C_IGUAL
    return <circle cx={cx} cy={cy} r={ext ? 4.4 : 3.2} fill={c} stroke="#fff" strokeWidth={1.3} />
  }
  const PesoLabel = (props: any) => {
    const { x, y, value, index } = props
    const show = !denso || index === 0 || index === data.length - 1 || value === mn || value === mx
    if (!show || x == null || y == null) return null
    const c = value === mn ? C_CAI : value === mx ? C_SOBE : 'var(--text-secondary)'
    return <text x={x} y={y - 9} textAnchor="middle" fontSize={9} fontWeight={700} fill={c}>{Number(value).toFixed(1)}</text>
  }
  return (
    <CardShell icon="⚖" title="Peso · Tendência" color="#0F9D58" badge={`${peso.length} regs`} footer="Abrir Saúde" navTo="saude" onNavigate={onNavigate}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--text-primary)' }}>{ult} kg</div>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: down ? C_CAI : C_SOBE }}>{delta > 0 ? '+' : ''}{delta} kg <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>no período</span></div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        {[
          { l: 'mín', v: `${mn}`, c: C_CAI },
          { l: 'máx', v: `${mx}`, c: C_SOBE },
          { l: 'média', v: `${avg}`, c: '#0F9D58' },
          { l: 'amplitude', v: `${range} kg`, c: '#5b5bd6' },
        ].map(s => (
          <span key={s.l} style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', padding: '2px 7px', borderRadius: 6, background: `${s.c}12`, border: `1px solid ${s.c}26` }}>
            {s.l} <b style={{ color: s.c }}>{s.v}</b>
          </span>
        ))}
      </div>
      <div style={{ height: 172 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: -8 }}>
            <defs><linearGradient id="gPeso" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0F9D58" stopOpacity={0.22} /><stop offset="100%" stopColor="#0F9D58" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={20} />
            <YAxis domain={[lo, hi]} ticks={ticks} tickFormatter={(v: any) => Number(v).toFixed(1)} tick={{ fontSize: 9.5, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={36} />
            <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)} kg`, 'Peso']} contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
            <ReferenceLine y={avg} stroke="#0F9D58" strokeDasharray="5 4" strokeOpacity={0.45} />
            <Area type="monotone" dataKey="peso" stroke="#0F9D58" strokeWidth={2.6} fill="url(#gPeso)" dot={<PesoDot />} activeDot={{ r: 5 }} isAnimationActive={false}>
              <LabelList dataKey="peso" content={PesoLabel} />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </CardShell>
  )
}
function AtividadeCard({ ativHoje, passosSerie, onNavigate }: any) {
  const has = ativHoje.length || passosSerie.length
  return (
    <CardShell icon="🏃" title="Atividade Física" color="#2563EB" footer="Abrir Saúde" navTo="saude" onNavigate={onNavigate}>
      {!has ? <Empty icon="🏃" msg="Registre passos/atividade na aba Saúde" /> : <>
        {ativHoje.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: passosSerie.length ? 8 : 0 }}>
            {ativHoje.map((a: any) => (
              <div key={a.k} style={{ padding: '9px 11px', borderRadius: 10, background: '#2563EB0c', border: '1px solid #2563EB22' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{a.icon} {a.l}</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{a.v}{a.u ? ` ${a.u}` : ''}</div>
              </div>
            ))}
          </div>
        )}
        {passosSerie.length > 0 && (
          <div style={{ height: 118 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={passosSerie} margin={{ top: 4, right: 6, bottom: 0, left: -28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip formatter={(v: any) => [v, 'Passos']} contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="passos" radius={[5, 5, 0, 0]} fill="#2563EB" maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </>}
    </CardShell>
  )
}
function AguaSerieCard({ agua, onNavigate }: any) {
  if (!agua.length) return null
  const meta = agua[agua.length - 1]?.meta || 2
  return (
    <CardShell icon="💧" title="Água · 7 dias" color="#039BE5" footer="Abrir Saúde" navTo="saude" onNavigate={onNavigate}>
      <div style={{ height: 126 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={agua} margin={{ top: 6, right: 6, bottom: 0, left: -26 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} unit="L" />
            <Tooltip formatter={(v: any) => [`${v} L`, 'Água']} contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
            <ReferenceLine y={meta} stroke="#039BE5" strokeDasharray="4 4" strokeOpacity={0.5} />
            <Bar dataKey="agua" radius={[5, 5, 0, 0]} fill="#039BE5" maxBarSize={30} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </CardShell>
  )
}

/* ── MONTAGEM DA PÁGINA INICIAL ── */
export function PaginaInicial({ onNavigate }: { onNavigate: (id: string) => void }) {
  const [narrow, setNarrow] = useState(typeof window !== 'undefined' && window.innerWidth < 980)
  useEffect(() => { const fn = () => setNarrow(window.innerWidth < 980); window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn) }, [])

  const agu = useAguData()
  const agenda = useAgendaData()
  const saude = useSaudeData()

  const colProd = <>
    <Slot h={250}><HorasSemanaCard onNavigate={onNavigate} /></Slot>
    <Slot h={232}><AgendaHojeLista agenda={agenda} onNavigate={onNavigate} /></Slot>
    <Slot h={212}><AgendaSemana agenda={agenda} onNavigate={onNavigate} /></Slot>
    <Slot h={212}><AguRevisoes agu={agu} onNavigate={onNavigate} /></Slot>
  </>
  const colSaude = <div style={{ height: '100%', minHeight: 0 }}><ControlePeso saude={saude} /></div>

  if (narrow) {
    return (
      <div style={{ height: '100%', overflowY: 'auto', padding: '14px 14px 28px' }}>
        <div style={{ height: 118, marginBottom: 14 }}><Saudacao /></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>{colProd}</div>
        <div style={{ height: 620, marginBottom: 14 }}>{colSaude}</div>
        <div style={{ height: 420 }}><ColAcessoRapido onNavigate={onNavigate} /></div>
      </div>
    )
  }
  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateColumns: 'minmax(230px, 0.95fr) minmax(0, 1.3fr) minmax(290px, 1.05fr)', gridTemplateRows: '104px 1fr', gap: 14, padding: '14px 20px' }}>
      {/* Saudação · cobre apenas as colunas 1–2 */}
      <div style={{ gridColumn: '1 / span 2', gridRow: 1, minHeight: 0 }}><Saudacao /></div>
      {/* Coluna 1 · Acesso Rápido */}
      <div style={{ gridColumn: 1, gridRow: 2, minHeight: 0 }}><ColAcessoRapido onNavigate={onNavigate} /></div>
      {/* Coluna 2 · Produtividade */}
      <div style={{ gridColumn: 2, gridRow: 2, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 2 }}>{colProd}</div>
      {/* Coluna 3 · Saúde — sobe ao topo, ocupa as 2 linhas */}
      <div style={{ gridColumn: 3, gridRow: '1 / span 2', minHeight: 0 }}>{colSaude}</div>
    </div>
  )
}
