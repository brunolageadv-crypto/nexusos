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
function AguDisciplinas({ agu, onNavigate }: any) {
  const top = [...agu.discStats].sort((a, b) => b.pctConcluido - a.pctConcluido)
  return (
    <CardShell icon="⚖" title="AGU · Disciplinas" color="#1A73E8" badge={`${agu.global.pctConcluido}% geral`} footer="Abrir Editais" navTo="editais" onNavigate={onNavigate}>
      {top.map((d: any) => (
        <div key={d.id || d.nome} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
            <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '78%' }}>{d.nome}</span>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{d.pctConcluido}%</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-4)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${d.pctConcluido}%`, background: '#1A73E8', borderRadius: 3, transition: 'width .8s' }} /></div>
        </div>
      ))}
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
function SaudeStreak({ saude, onNavigate }: any) { return <Kpi icon="✚" label="Saúde · Streak" value={`${saude.streak}d`} sub={saude.reg ? 'registro de hoje ✓' : 'sem registro hoje'} color="#0F9D58" navTo="saude" onNavigate={onNavigate} /> }
function SaudeHoje({ saude, onNavigate }: any) {
  const r = saude.reg || {}
  const items = [
    { l: 'Água', v: r.agua != null ? `${r.agua} ml` : '—', c: '#039BE5' },
    { l: 'Peso', v: r.peso != null ? `${r.peso} kg` : '—', c: '#0F9D58' },
    { l: 'Sono', v: r.sono != null ? `${r.sono} h` : '—', c: '#7B1FA2' },
    { l: 'Humor', v: r.humor != null ? `${r.humor}/5` : '—', c: '#F29900' },
  ]
  return (
    <CardShell icon="✚" title="Saúde · Hoje" color="#0F9D58" badge={`streak ${saude.streak}d`} footer="Abrir Saúde" navTo="saude" onNavigate={onNavigate}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
        {items.map(it => <div key={it.l} style={{ padding: '9px 11px', borderRadius: 10, background: `${it.c}0c`, border: `1px solid ${it.c}22` }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{it.l}</div>
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

// — Saudação / relógio —
function Saudacao() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t) }, [])
  const h = now.getHours()
  const saud = h < 6 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, background: 'linear-gradient(135deg, var(--accent) 0%, #5b5bd6 100%)', borderRadius: 16, padding: '18px 22px', color: '#fff', boxShadow: 'var(--shadow-card)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', opacity: .85, letterSpacing: '0.06em' }}>{now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.7rem', lineHeight: 1.1 }}>{saud}, Bruno</div>
      <div style={{ fontSize: '0.8rem', opacity: .9 }}>{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · Central de Gestão NEXUS</div>
    </div>
  )
}

// — Atalhos —
const ATALHOS = [
  { id: 'editais', l: 'Editais', i: '⚖', c: '#1A73E8' }, { id: 'concursos', l: 'Concursos', i: '🎯', c: '#8B5CF6' },
  { id: 'prontuario', l: 'Prontuário', i: '📋', c: '#5b5bd6' }, { id: 'mapamental', l: 'Mapa Mental', i: '🧠', c: '#7c6cff' },
  { id: 'analisepdf', l: 'Análise PDF', i: '📄', c: '#D93025' }, { id: 'ponto', l: 'Ponto', i: '⊙', c: '#F29900' },
  { id: 'saude', l: 'Saúde', i: '✚', c: '#0F9D58' }, { id: 'wishlist', l: 'Wishlist', i: '🛒', c: '#F29900' },
  { id: 'viagens', l: 'Viagens', i: '✈️', c: '#039BE5' }, { id: 'journal', l: 'Notas', i: '✦', c: '#8ab4f8' },
  { id: 'media', l: 'Media', i: '▶', c: '#3b82f6' }, { id: 'gaming', l: 'Gaming', i: '🎮', c: '#8B5CF6' },
  { id: 'agenda', l: 'Agenda', i: '📅', c: '#1A73E8' }, { id: 'links', l: 'Links', i: '🔗', c: '#00897B' },
  { id: 'logs', l: 'Logs', i: '📊', c: '#00897B' }, { id: 'geosfera', l: 'Geosfera', i: '🌍', c: '#0F9D58' },
]
function AtalhosCard({ onNavigate }: any) {
  return (
    <CardShell icon="▦" title="Acesso Rápido" color="#5b5bd6">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))', gap: 8 }}>
        {ATALHOS.map(a => (
          <button key={a.id} onClick={() => onNavigate(a.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '12px 6px', borderRadius: 12, border: `1px solid ${a.c}22`, background: `${a.c}0a`, color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = `${a.c}1a`; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.background = `${a.c}0a`; e.currentTarget.style.transform = 'none' }}>
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
  'agu-disciplinas':   { label: 'AGU · Disciplinas',   icon: '⚖', kind: 'detail', w: 4, h: 3, render: (p: any) => <AguDisciplinas {...p} /> },
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
  'arcade':            { label: 'Arcade',              icon: '🕹', kind: 'detail', w: 6, h: 4, render: (p: any) => <div style={{ height: '100%', overflow: 'auto', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16 }}><PainelArcade /></div> },
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
