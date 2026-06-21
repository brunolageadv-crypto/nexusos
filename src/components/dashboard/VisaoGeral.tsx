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
import { collection, query, orderBy, onSnapshot, doc, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'
import { useEditaisAGU } from '../../hooks/useEditaisAGU'
import { AGU_DISCIPLINAS, TOTAL_SUBTOPICOS } from '../editais/aguData'
import { useEdital, useEditaisCadastrados } from '../../hooks/useEdital'
import { EDITAIS_BUILTIN, EDITAIS_FIXOS_IDS } from '../editais/GestorEditais'
import { PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, ComposedChart, BarChart, Bar, ReferenceLine, LabelList, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import PainelArcade from './Arcade'

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
          <span style={{ color }}>{icon}</span>{title}
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
        : <div style={{ width: 46, height: 46, borderRadius: 13, background: `${color}15`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.35rem', flexShrink: 0 }}>{icon}</div>}
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
function PdfKpi({ pdfNotes, pdfFolders, onNavigate }: any) { return <Kpi icon="📄" label="Análise de PDF" value={pdfNotes.length} sub={`${pdfFolders.length} pasta(s)`} color="#D93025" navTo="analisepdf" onNavigate={onNavigate} /> }
function PdfRecentes({ pdfNotes, onNavigate }: any) {
  const ord = [...pdfNotes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  return (
    <CardShell icon="📄" title="Anotações de PDF" color="#D93025" badge={`${pdfNotes.length} nota(s)`} footer="Abrir Análise de PDF" navTo="analisepdf" onNavigate={onNavigate}>
      {ord.length === 0 ? <Empty icon="📄" msg="Nenhuma anotação ainda" /> : ord.slice(0, 6).map((n: any) => <Linha key={n.id} cor="#D93025" titulo={n.title || 'Sem título'} meta={n.updatedAt ? new Date(n.updatedAt).toLocaleDateString('pt-BR') : ''} />)}
    </CardShell>
  )
}

// — Mapa Mental (NOVO) —
function MapasKpi({ mm, onNavigate }: any) { return <Kpi icon="🧠" label="Mapas Mentais" value={mm.maps} sub={`${mm.folders} pasta(s)`} color="#7c6cff" navTo="mapamental" onNavigate={onNavigate} /> }

// — Saudação / relógio (fundo temático por horário) —
function skyTheme(h: number) {
  if (h < 5)  return { key: 'madrugada',  icon: '🌙', gradient: 'linear-gradient(165deg,#070b1f 0%,#10183a 45%,#241640 100%)', deco: 'stars',   sun: '' }
  if (h < 8)  return { key: 'amanhecer',  icon: '🌅', gradient: 'linear-gradient(165deg,#3a2e63 0%,#8a5a9e 32%,#f48aa0 68%,#ffd3a3 100%)', deco: 'sunrise', sun: '#ffe2b3' }
  if (h < 12) return { key: 'manhã',      icon: '☀️', gradient: 'linear-gradient(165deg,#1c7fe0 0%,#48b4f4 52%,#a9e1ff 100%)', deco: 'sunhigh', sun: '#fff6da' }
  if (h < 17) return { key: 'tarde',      icon: '🌤️', gradient: 'linear-gradient(165deg,#0f5cb4 0%,#2a86d6 45%,#7ec1f0 100%)', deco: 'sunhigh', sun: '#fff0c6' }
  if (h < 20) return { key: 'entardecer', icon: '🌇', gradient: 'linear-gradient(165deg,#272a63 0%,#9a4a72 38%,#e6694a 74%,#ffc06a 100%)', deco: 'sunset', sun: '#ffd189' }
  return { key: 'noite', icon: '✨', gradient: 'linear-gradient(165deg,#0a1430 0%,#142a55 50%,#2f285c 100%)', deco: 'stars', sun: '' }
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
function Saudacao() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  const h = now.getHours()
  const theme = useMemo(() => skyTheme(h), [h])
  const accent = theme.sun || '#ffd27a'
  const saud = h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  const showStars = theme.deco === 'stars'
  const stars = useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    top: Math.random() * 84, left: Math.random() * 100, s: +(Math.random() * 1.7 + 0.6).toFixed(1),
    tw: +(Math.random() * 2.4 + 1.8).toFixed(2), dl: +(Math.random() * 3).toFixed(2),
    o: +(Math.random() * 0.5 + 0.4).toFixed(2), v: i % 3,
  })), [])
  const sunPos: any = theme.deco === 'sunrise' ? { bottom: -54, left: '10%' } : theme.deco === 'sunset' ? { bottom: -60, right: '13%' } : { top: -52, right: '15%' }
  return (
    <div style={{ position: 'relative', overflow: 'hidden', height: '100%', borderRadius: 16, boxShadow: 'var(--shadow-card)', background: theme.gradient }}>
      {/* brilho difuso flutuando (sempre ativo) */}
      <div style={{ position: 'absolute', width: 200, height: 140, borderRadius: '50%', left: '22%', top: '-30%', background: 'radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%)', filter: 'blur(10px)', animation: 'nx-float 11s ease-in-out infinite', pointerEvents: 'none' }} />
      {/* sol pulsante + raios girando */}
      {theme.sun && <>
        <div style={{ position: 'absolute', ...sunPos, width: 170, height: 170, borderRadius: '50%', background: `radial-gradient(circle, ${theme.sun} 0%, ${theme.sun}88 30%, transparent 66%)`, filter: 'blur(1px)', animation: 'nx-sunpulse 4.5s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', ...sunPos, width: 170, height: 170, borderRadius: '50%', opacity: 0.4, mixBlendMode: 'screen', background: `conic-gradient(from 0deg, transparent 0deg, ${theme.sun}66 10deg, transparent 22deg, transparent 88deg, ${theme.sun}55 100deg, transparent 112deg, transparent 178deg, ${theme.sun}66 190deg, transparent 202deg, transparent 268deg, ${theme.sun}55 280deg, transparent 292deg)`, animation: 'nx-rays 22s linear infinite', pointerEvents: 'none' }} />
      </>}
      {/* estrelas: cintilam + flutuam (madrugada / noite) */}
      {showStars && <>
        <div style={{ position: 'absolute', top: 12, left: '6%', width: 30, height: 30, borderRadius: '50%', background: 'radial-gradient(circle at 38% 38%, #fdf6e3 0%, #e8e6d0 55%, transparent 72%)', boxShadow: '0 0 26px rgba(253,246,227,0.4)', animation: 'nx-moon 5s ease-in-out infinite', pointerEvents: 'none' }} />
        {stars.map((st, i) => <span key={i} style={{ position: 'absolute', top: `${st.top}%`, left: `${st.left}%`, width: st.s, height: st.s, borderRadius: '50%', background: '#fff', opacity: st.o, animation: `nx-tw ${st.tw}s ease-in-out ${st.dl}s infinite, nx-drift${st.v} ${st.tw * 3}s ease-in-out infinite`, pointerEvents: 'none' }} />)}
      </>}
      {/* facho de luz varrendo o card (sempre ativo) */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, width: '42%', left: '-50%', background: 'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)', filter: 'blur(2px)', animation: 'nx-sheen 7.5s ease-in-out infinite' }} />
      </div>
      {/* scrim p/ legibilidade */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, rgba(0,0,0,0.34) 0%, rgba(0,0,0,0.12) 42%, transparent 70%)', pointerEvents: 'none' }} />
      {/* conteúdo + relógio */}
      <div style={{ position: 'relative', zIndex: 3, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 18px', color: '#fff', textShadow: '0 1px 10px rgba(0,0,0,0.4)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', opacity: .92, letterSpacing: '0.05em', textTransform: 'capitalize' }}>{now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span>
            <span style={{ fontSize: '0.55rem', fontWeight: 700, background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(4px)', borderRadius: 20, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{theme.icon} {theme.key}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.45rem', lineHeight: 1.05 }}>{saud}, Bruno</div>
          <div style={{ fontSize: '0.72rem', opacity: .95, marginTop: 2 }}>{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · Central de Gestão NEXUS</div>
        </div>
        <div style={{ width: 86, height: 86, flexShrink: 0, filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.35))' }}>
          <RelogioAnalogico accent={accent} />
        </div>
      </div>
      <style>{`
        @keyframes nx-rot{to{transform:rotate(360deg)}}
        @keyframes nx-tw{0%,100%{opacity:.22}50%{opacity:1}}
        @keyframes nx-drift0{0%,100%{transform:translate(0,0)}50%{transform:translate(3px,-2px)}}
        @keyframes nx-drift1{0%,100%{transform:translate(0,0)}50%{transform:translate(-2px,2px)}}
        @keyframes nx-drift2{0%,100%{transform:translate(0,0)}50%{transform:translate(2px,3px)}}
        @keyframes nx-sunpulse{0%,100%{transform:scale(1);opacity:.95}50%{transform:scale(1.06);opacity:1}}
        @keyframes nx-rays{to{transform:rotate(360deg)}}
        @keyframes nx-float{0%,100%{transform:translate(0,0)}50%{transform:translate(42px,18px)}}
        @keyframes nx-moon{0%,100%{filter:brightness(1)}50%{filter:brightness(1.18)}}
        @keyframes nx-sheen{0%{transform:translateX(-20%);opacity:0}12%{opacity:1}55%{opacity:1}72%,100%{transform:translateX(380%);opacity:0}}
      `}</style>
    </div>
  )
}

// — Atalhos —  (cor base neutra; ao passar o mouse, cada um ganha sua cor vibrante)
const ATALHOS = [
  { id: 'editais', l: 'Editais', i: '⚖', c: '#2563EB' }, { id: 'concursos', l: 'Concursos', i: '🎯', c: '#7C3AED' },
  { id: 'prontuario', l: 'Prontuário', i: '📋', c: '#4F46E5' }, { id: 'mapamental', l: 'Mapa Mental', i: '🧠', c: '#6D28D9' },
  { id: 'analisepdf', l: 'Análise PDF', i: '📄', c: '#DC2626' }, { id: 'ponto', l: 'Ponto', i: '⊙', c: '#EA580C' },
  { id: 'saude', l: 'Saúde', i: '✚', c: '#059669' }, { id: 'wishlist', l: 'Wishlist', i: '🛒', c: '#D97706' },
  { id: 'viagens', l: 'Viagens', i: '✈️', c: '#0284C7' }, { id: 'journal', l: 'Notas', i: '✦', c: '#2563EB' },
  { id: 'media', l: 'Media', i: '▶', c: '#3B82F6' }, { id: 'gaming', l: 'Gaming', i: '🎮', c: '#9333EA' },
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
            <span style={{ fontSize: '1.3rem' }}>{a.i}</span>
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
                  <span>{REGISTRY[id].icon}</span>{REGISTRY[id].label} <span style={{ color: 'var(--text-accent)', fontWeight: 800 }}>＋</span>
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
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(94px,1fr))', gap: 10, alignContent: 'start' }}>
        {ATALHOS.map(a => (
          <button key={a.id} onClick={() => onNavigate(a.id)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '16px 8px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all .18s cubic-bezier(.4,0,.2,1)', minHeight: 86 }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = `linear-gradient(135deg, ${a.c}22, ${a.c}0a)`; el.style.borderColor = a.c; el.style.color = a.c; el.style.transform = 'translateY(-3px) scale(1.03)'; el.style.boxShadow = `0 12px 26px ${a.c}40`; const ic = el.querySelector('.ar-ic') as HTMLElement; if (ic) ic.style.transform = 'scale(1.18)' }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--surface)'; el.style.borderColor = 'var(--border)'; el.style.color = 'var(--text-secondary)'; el.style.transform = 'none'; el.style.boxShadow = 'none'; const ic = el.querySelector('.ar-ic') as HTMLElement; if (ic) ic.style.transform = 'none' }}>
            <span className="ar-ic" style={{ fontSize: '1.55rem', transition: 'transform .18s' }}>{a.i}</span>
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
  const { peso, pesoDelta, agua, ativHoje, passosSerie } = useSaudeSeries()

  const colProd = <>
    <Slot h={250}><HorasSemanaCard onNavigate={onNavigate} /></Slot>
    <Slot h={232}><AgendaHojeLista agenda={agenda} onNavigate={onNavigate} /></Slot>
    <Slot h={212}><AgendaSemana agenda={agenda} onNavigate={onNavigate} /></Slot>
    <Slot h={212}><AguRevisoes agu={agu} onNavigate={onNavigate} /></Slot>
  </>
  const colSaude = <>
    <div style={{ flexShrink: 0 }}><SaudeHero reg={saude.reg} streak={saude.streak} onNavigate={onNavigate} /></div>
    <Slot h={300}><PesoCard peso={peso} delta={pesoDelta} onNavigate={onNavigate} /></Slot>
    <Slot h={ativHoje.length && passosSerie.length ? 270 : ativHoje.length ? 168 : passosSerie.length ? 212 : 150}><AtividadeCard ativHoje={ativHoje} passosSerie={passosSerie} onNavigate={onNavigate} /></Slot>
    <Slot h={172}><SaudeHoje saude={saude} onNavigate={onNavigate} /></Slot>
    {agua.length ? <Slot h={208}><AguaSerieCard agua={agua} onNavigate={onNavigate} /></Slot> : null}
  </>

  if (narrow) {
    return (
      <div style={{ height: '100%', overflowY: 'auto', padding: '14px 14px 28px' }}>
        <div style={{ height: 118, marginBottom: 14 }}><Saudacao /></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>{colProd}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>{colSaude}</div>
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
      <div style={{ gridColumn: 3, gridRow: '1 / span 2', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 2 }}>{colSaude}</div>
    </div>
  )
}
