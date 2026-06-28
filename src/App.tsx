import { createContext, useContext, useEffect, useState, useMemo, useCallback, type ReactNode } from 'react'
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore'
import { db } from './lib/firebase'
import { useAuth } from './hooks/useAuth'
import LoginPage from './auth/LoginPage'
import GestorEditais from './components/editais/GestorEditais'
import PDFReader from './components/pdfreader/PDFReader'
import Arcade from './components/dashboard/Arcade'
import Inventario from './components/inventario/Inventario'
import ChecklistTopbar from './components/dashboard/ChecklistTopbar'
import NexusDashboard from './components/dashboard/NexusDashboard'
import Concursos from './components/concursos/Concursos'
import PontoEletronico from './components/ponto/PontoEletronico'
import Financeiro from './components/financeiro/Financeiro'
import ProntuarioADM from './components/prontuario/ProntuarioADM'
import SaudeBemEstar from './components/saude/SaudeBemEstar'
import WishlistCompras from './components/wishlist/WishlistCompras'
import Diario from './components/journal/Diario'
import MediaTracker from './components/media/MediaTracker'
import GamingHub from './components/gaming/GamingHub'
import LinksInteresse from './components/links/LinksInteresse'
import Agenda from './components/Agenda/Agenda'
import Logs from './components/logs/Logs'
import Geosfera from './components/geosfera/Geosfera'


type Theme = 'dark' | 'light'
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => {} })
export const useTheme = () => useContext(ThemeCtx)

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('nexusos-theme') as Theme) ?? 'dark'
  )
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('nexusos-theme', theme)
  }, [theme])
  return (
    <ThemeCtx.Provider value={{ theme, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') }}>
      {children}
    </ThemeCtx.Provider>
  )
}

const UidCtx = createContext<string | null>(null)
export const useUid = () => useContext(UidCtx)

function NexusLogo() {
  return (
    <div style={{ padding: '8px 0 6px', userSelect: 'none' }}>
      <svg width="200" height="46" viewBox="0 0 200 46" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="ng1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c8cdd8"/><stop offset="100%" stopColor="#7a8394"/>
          </linearGradient>
          <linearGradient id="ng2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#9aa3b2"/><stop offset="100%" stopColor="#5c6578"/>
          </linearGradient>
        </defs>
        <polygon points="21,3 37,12 37,30 21,39 5,30 5,12" fill="none" stroke="#3a4050" strokeWidth="1.2"/>
        <polygon points="21,9 32,15 32,27 21,33 10,27 10,15" fill="none" stroke="url(#ng1)" strokeWidth="1.5"/>
        <line x1="21" y1="3"  x2="21" y2="9"  stroke="#c8cdd8" strokeWidth="0.8" opacity="0.6"/>
        <line x1="37" y1="12" x2="32" y2="15" stroke="#c8cdd8" strokeWidth="0.8" opacity="0.6"/>
        <line x1="37" y1="30" x2="32" y2="27" stroke="#c8cdd8" strokeWidth="0.8" opacity="0.6"/>
        <line x1="21" y1="39" x2="21" y2="33" stroke="#c8cdd8" strokeWidth="0.8" opacity="0.6"/>
        <line x1="5"  y1="30" x2="10" y2="27" stroke="#c8cdd8" strokeWidth="0.8" opacity="0.6"/>
        <line x1="5"  y1="12" x2="10" y2="15" stroke="#c8cdd8" strokeWidth="0.8" opacity="0.6"/>
        <circle cx="21" cy="21" r="2.5" fill="url(#ng1)"/>
        <text x="48" y="27" fontFamily="Syne,sans-serif" fontWeight="800" fontSize="19" letterSpacing="3" fill="#dde1eb">NEXUS</text>
        <line x1="48" y1="33" x2="196" y2="33" stroke="url(#ng2)" strokeWidth="0.7"/>
      </svg>
    </div>
  )
}

function IconEditais({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="1" width="11" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M10 1 L13 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M10 1 L10 4 L13 4" fill="none" stroke="currentColor" strokeWidth="1.1"/>
      <line x1="4.5" y1="6.5"  x2="10.5" y2="6.5"  stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <line x1="4.5" y1="8.5"  x2="10.5" y2="8.5"  stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <line x1="4.5" y1="10.5" x2="8.5"  y2="10.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <circle cx="14" cy="13" r="3.5" fill="#1e2030" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M12.3 13 L13.5 14.2 L15.7 11.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

const NAV = [
  { section: 'PRINCIPAL', items: [
    { id: 'dashboard',  label: 'Dashboard',         icon: '◈',  svgIcon: null },
  ]},
  { section: 'JURÍDICO', items: [
    { id: 'editais',    label: 'Editais',            icon: null, svgIcon: 'editais' },
    { id: 'concursos',  label: 'Concursos',          icon: '🎯', svgIcon: null },
    { id: 'prontuario', label: 'Prontuário ADM',     icon: '📋', svgIcon: null },
    { id: 'pdfreader',  label: 'PDF Reader',         icon: '📖', svgIcon: null },
  ]},
  { section: 'FINANÇAS & VIDA', items: [
    { id: 'financeiro', label: 'Financeiro',         icon: '◎',  svgIcon: null },
    { id: 'ponto',      label: 'Ponto',              icon: '⊙',  svgIcon: null },
    { id: 'saude',      label: 'Saúde',              icon: '✚',  svgIcon: null },
    { id: 'wishlist',   label: 'Wishlist',           icon: '🛒', svgIcon: null },
    { id: 'inventario', label: 'Inventário',         icon: '📦', svgIcon: null },
    { id: 'viagens',    label: 'Viagens',             icon: '✈️', svgIcon: null },
  ]},
  { section: 'ENTRETENIMENTO', items: [
    { id: 'journal',    label: 'Notas',              icon: '✦',  svgIcon: null },
    { id: 'media',      label: 'Media',              icon: '▶',  svgIcon: null },
    { id: 'gaming',     label: 'Gaming',             icon: '🎮', svgIcon: null },
    { id: 'arcade',     label: 'Arcade',             icon: '🕹️', svgIcon: null },
  ]},
  { section: 'UTILIDADES', items: [
    { id: 'agenda',     label: 'Agenda',             icon: '📅', svgIcon: null },
    { id: 'links',      label: 'Links',              icon: '🔗', svgIcon: null },
    { id: 'logs',       label: 'Logs',               icon: '📋', svgIcon: null },
    { id: 'geosfera',   label: 'Geosfera',           icon: '🌍', svgIcon: null },
  ]},
]

// Todos os itens para o bottom nav mobile
const ALL_NAV_ITEMS = NAV.flatMap(g => g.items)

function AppShell() {
  const [active, setActive] = useState('dashboard')
  const { theme, toggle } = useTheme()
  const { user, logout } = useAuth()
  const [sidebarMode, setSidebarMode] = useState<'fixed' | 'auto'>(
    () => (localStorage.getItem('nexusos-sidebar-mode') as 'fixed' | 'auto') ?? 'fixed'
  )
  // Modos do Dashboard: 'home' (Página Inicial) · 'visual' (Visão Geral) · 'noticias'
  // Para abrir SEMPRE no Visual em vez da Página Inicial, troque 'home' por 'visual' abaixo.
  const [dashView, setDashView] = useState<'noticias' | 'visual' | 'home'>(
    () => (localStorage.getItem('nexusos-dash-view') as 'noticias' | 'visual' | 'home') ?? 'home'
  )
  const setDash = (next: 'noticias' | 'visual' | 'home') => {
    setDashView(next)
    localStorage.setItem('nexusos-dash-view', next)
  }
  const [sidebarHovered, setSidebarHovered] = useState(false)
  // Dentro do PDF Reader a sidebar fica sempre oculta e NÃO aparece no hover
  // (para não atrapalhar o uso das Pastas internas). Fora dele, comportamento normal.
  const inPdf = active === 'pdfreader'
  const sidebarVisible = !inPdf && (sidebarMode === 'fixed' || sidebarHovered)

  const toggleSidebarMode = () => {
    const next = sidebarMode === 'fixed' ? 'auto' : 'fixed'
    setSidebarMode(next)
    localStorage.setItem('nexusos-sidebar-mode', next)
  }

  const currentLabel = ALL_NAV_ITEMS.find(i => i.id === active)?.label ?? ''
  const displayName = user?.displayName ?? user?.email ?? 'Usuário'
  const avatarUrl = user?.photoURL ?? null
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="app-shell" style={{ position: 'relative' }}>

      {/* ── SIDEBAR DESKTOP ── */}
      {sidebarMode === 'auto' && !inPdf && (
        <div onMouseEnter={() => setSidebarHovered(true)}
          style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 16, zIndex: 40 }} />
      )}

      <aside className="sidebar desktop-sidebar"
        onMouseEnter={() => sidebarMode === 'auto' && !inPdf && setSidebarHovered(true)}
        onMouseLeave={() => sidebarMode === 'auto' && !inPdf && setSidebarHovered(false)}
        style={{
          position: (sidebarMode === 'auto' || inPdf) ? 'fixed' : 'relative',
          top: 0, left: 0, bottom: 0, zIndex: 50,
          transform: sidebarVisible ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: sidebarMode === 'auto' && sidebarHovered && !inPdf ? '4px 0 32px rgba(0,0,0,0.5)' : 'none',
        }}>
        <div className="sidebar-logo"><NexusLogo /></div>
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
          {NAV.map(group => (
            <div key={group.section} className="sidebar-section">
              <div className="sidebar-section-label">{group.section}</div>
              {group.items.map(item => (
                <button key={item.id} className={`nav-item ${active === item.id ? 'active' : ''}`} onClick={() => setActive(item.id)}>
                  <span className="nav-icon">{item.svgIcon === 'editais' ? <IconEditais size={17} /> : item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div style={{ margin: '0 12px 8px', padding: '11px 13px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 11, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(180,185,200,0.35)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(180,185,200,0.1)' }}>
            {avatarUrl ? <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#c4cad6' }}>{initials}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName.split(' ')[0]}</div>
            <div style={{ fontSize: '0.58rem', color: 'rgba(180,185,200,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
          </div>
          <button onClick={logout} title="Sair"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.18)', fontSize: '1rem', padding: 4, borderRadius: 6 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.18)' }}>⏻</button>
        </div>
        <div className="sidebar-bottom">
          <button className="theme-btn" onClick={toggle}>
            <span style={{ fontSize: '1rem' }}>{theme === 'dark' ? '☀' : '◑'}</span>
            <span>{theme === 'dark' ? 'Tema Claro' : 'Tema Escuro'}</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <div className="main-area">
        <header className="topbar">
          <button onClick={toggleSidebarMode}
            className="desktop-only"
            title={sidebarMode === 'fixed' ? 'Ocultar sidebar' : 'Fixar sidebar'}
            style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', marginRight: 4 }}>
            {sidebarMode === 'fixed' ? '⇤' : '⇥'}
          </button>
          <span className="topbar-title">{currentLabel}</span>
          <div className="topbar-right">
            <div className="sync-dot" />
            {/* Check list do dia */}
            <ChecklistTopbar />
            {/* Seletor de modo do Dashboard (só na aba dashboard) */}
            {active === 'dashboard' && (
              <div className="desktop-only" style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 10, border: '1px solid var(--border-md)', background: 'var(--surface)' }}>
                {([
                  { id: 'home', label: '🏠 Início', t: 'Página inicial' },
                  { id: 'visual', label: '◧ Visual', t: 'Visão geral em cards' },
                  { id: 'noticias', label: '📰 Notícias', t: 'Modo notícias' },
                ] as const).map(m => (
                  <button key={m.id} onClick={() => setDash(m.id)} title={m.t}
                    className={`topbar-btn${dashView === m.id ? ' active' : ''}`}
                    style={{ border: 'none', background: dashView === m.id ? undefined : 'transparent' }}>
                    {m.label}
                  </button>
                ))}
              </div>
            )}
            {/* Atalho 🏠 (qualquer aba) → volta para a Página Inicial */}
            <button
              className="desktop-only topbar-btn"
              title="Ir para a Página Inicial"
              onClick={() => { setActive('dashboard'); setDash('home'); }}>
              🏠 Início
            </button>
            {/* Botão tema — só aparece no mobile */}
            <button onClick={toggle} className="mobile-only"
              style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-md)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>
              {theme === 'dark' ? '☀' : '◑'}
            </button>
          </div>
        </header>

        <div className="page-content">
          {active === 'dashboard'  && <NexusDashboard onNavigate={setActive} dashView={dashView} />}
          {active === 'editais'    && <GestorEditais />}
          {active === 'concursos'  && <Concursos />}
          {active === 'financeiro' && <Financeiro />}
          {active === 'ponto'      && <PontoEletronico />}
          {active === 'prontuario' && <ProntuarioADM />}
          {active === 'pdfreader'  && <PDFReader />}
          {active === 'saude'      && <SaudeBemEstar />}
          {active === 'wishlist'   && <WishlistCompras />}
          {active === 'inventario' && <Inventario />}
          {active === 'journal'    && <Diario onNavigate={setActive} />}
          {active === 'media'      && <MediaTracker />}
          {active === 'gaming'     && <GamingHub />}
          {active === 'arcade'     && <Arcade variant="page" />}
          {active === 'links'      && <LinksInteresse />}
          {active === 'agenda'     && <Agenda />}
          {active === 'viagens'    && <Viagens />}
          {active === 'logs'       && <Logs />}
          {active === 'geosfera'   && <Geosfera />}
        </div>
      </div>

      {/* ── BOTTOM NAV MOBILE — completamente separado da sidebar ── */}
      <nav className="mobile-bottom-nav">
        {ALL_NAV_ITEMS.map(item => (
          <button key={item.id}
            className={`mobile-nav-btn ${active === item.id ? 'active' : ''}`}
            onClick={() => setActive(item.id)}>
            <span className="mobile-nav-icon">
              {item.svgIcon === 'editais' ? <IconEditais size={20} /> : item.icon}
            </span>
            <span className="mobile-nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

    </div>
  )
}

function Root() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#c4cad6', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.12em' }}>AUTENTICANDO…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  return (
    <UidCtx.Provider value={user?.uid ?? null}>
      {user ? <AppShell /> : <LoginPage />}
    </UidCtx.Provider>
  )
}

export default function App() {
  return <ThemeProvider><Root /></ThemeProvider>
}

// ═══ VIAGENS MODULE ═══

// ─── Types ────────────────────────────────────────────────────────────────────
type StatusViagem = 'Expectativa' | 'Em Planejamento' | 'Confirmada' | 'Realizada'
type FinalidadeViagem = 'Passeio' | 'Férias' | 'Profissional' | 'Concurso' | 'Lua de Mel' | 'Aventura' | 'Cultural' | 'Outros'
type ModoDeslocamento = 'Avião' | 'Carro' | 'Ônibus' | 'Trem' | 'Navio' | 'Moto' | 'Bicicleta' | 'Combinado'
type ModoAeroporto = 'Carro próprio' | 'Táxi' | 'Uber/99' | 'Ônibus' | 'Carona' | 'Transfer' | 'Metrô'
type TipoAcomodacao = 'Hotel' | 'Flat' | 'Airbnb' | 'Hostel' | 'Pousada' | 'Resort' | 'Camping' | 'Casa de familiar' | 'Outros'
type TipoRegistroRoteiro = 'Hospedagem' | 'Atração' | 'Restaurante' | 'Transporte local' | 'Compra' | 'Outros'

interface Viagem {
  id: string
  titulo: string
  destino: string
  imagemUrl: string
  finalidade: FinalidadeViagem
  status: StatusViagem
  dataInicio: string
  dataFim: string
  modoDeslocamento: ModoDeslocamento
  custoDeslocamentoIda: number
  custoDeslocamentoVolta: number
  modoIda: ModoAeroporto
  custoIda: number
  modoVolta: ModoAeroporto
  custoVolta: number
  haAluguel: boolean
  custoAluguel: number
  outrasDespesas: number
  descricaoOutrasDespesas: string
  observacoes: string
  criadoEm: number
}
interface Hospedagem {
  id: string
  viagemId: string
  tipo: TipoRegistroRoteiro
  tipoAcomodacao: TipoAcomodacao
  nome: string
  checkin: string
  checkout: string
  custo: number
  comodidades: string[]
  linkReserva: string
  notas: string
  criadoEm: number
}
interface Cotacao {
  id: string
  viagemId: string
  dataCotacao: string
  valorTotal: number
  notas: string
  criadoEm: number
}
interface Cofre {
  id: string
  viagemId: string
  valorGuardado: number
  ultimoAporte: string
  historico: { data: string; valor: number; descricao: string }[]
  criadoEm: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function todayISO() { return new Date().toISOString().slice(0, 10) }
function fmtMoeda(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtData(d: string) { return d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' }
function calcDias(ini: string, fim: string): number {
  if (!ini || !fim) return 0
  const diff = new Date(fim + 'T12:00:00').getTime() - new Date(ini + 'T12:00:00').getTime()
  return Math.max(0, Math.round(diff / 86400000))
}
function calcCustoTotal(v: Viagem, hospedagens: Hospedagem[]): number {
  const desl = v.custoDeslocamentoIda + v.custoDeslocamentoVolta
  const aero = v.custoIda + v.custoVolta
  const alug = v.haAluguel ? v.custoAluguel : 0
  const hosp = hospedagens.filter(h => h.viagemId === v.id).reduce((a, h) => a + h.custo, 0)
  return desl + aero + alug + v.outrasDespesas + hosp
}
function progressoBar(pct: number, size = 10): string {
  const filled = Math.round((pct / 100) * size)
  return '🟩'.repeat(Math.min(filled, size)) + '⬜'.repeat(Math.max(size - filled, 0))
}
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)) as T
}

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG: Record<StatusViagem, { emoji: string; cor: string; bg: string; border: string }> = {
  'Expectativa':    { emoji: '⚪', cor: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.25)' },
  'Em Planejamento':{ emoji: '🟡', cor: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.3)'  },
  'Confirmada':     { emoji: '🟢', cor: '#34d399', bg: 'rgba(52,211,153,0.08)',   border: 'rgba(52,211,153,0.3)'  },
  'Realizada':      { emoji: '🔵', cor: '#60a5fa', bg: 'rgba(96,165,250,0.08)',   border: 'rgba(96,165,250,0.3)'  },
}
const COMODIDADES = ['Café da manhã incluso','Estacionamento','Wi-Fi','Piscina','Academia','Ar-condicionado','Frigobar','Serviço de quarto','Pet friendly','Vista panorâmica','Transferência aeroporto']

// ─── Input style ───────────────────────────────────────────────────────────────
const IS: React.CSSProperties = {
  background: 'var(--input-bg,rgba(255,255,255,0.05))',
  border: '1px solid var(--border,rgba(255,255,255,0.1))',
  borderRadius: 9, padding: '9px 12px',
  color: 'var(--text-primary)', fontSize: '0.83rem',
  width: '100%', outline: 'none', boxSizing: 'border-box',
}
function Lbl({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.09em', display: 'block', marginBottom: 5 }}>{children}</label>
}
function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 0' }} />
}

// ─── Modal Viagem ──────────────────────────────────────────────────────────────
const DEF_VIAGEM = (): Omit<Viagem,'id'|'criadoEm'> => ({
  titulo: '', destino: '', imagemUrl: '', finalidade: 'Passeio', status: 'Expectativa',
  dataInicio: '', dataFim: '', modoDeslocamento: 'Avião',
  custoDeslocamentoIda: 0, custoDeslocamentoVolta: 0,
  modoIda: 'Uber/99', custoIda: 0, modoVolta: 'Uber/99', custoVolta: 0,
  haAluguel: false, custoAluguel: 0, outrasDespesas: 0, descricaoOutrasDespesas: '',
  observacoes: '',
})

function ModalViagem({ viagem, onClose, onSave }: { viagem: Viagem | null; onClose: () => void; onSave: (v: Viagem) => void }) {
  const [f, setF] = useState<Omit<Viagem,'id'|'criadoEm'>>(viagem ? { ...viagem } : DEF_VIAGEM())
  const [saving, setSaving] = useState(false)
  const upd = useCallback((p: Partial<typeof f>) => setF(prev => ({ ...prev, ...p })), [])
  const dias = calcDias(f.dataInicio, f.dataFim)
  const save = async () => {
    if (!f.titulo.trim()) return
    setSaving(true)
    onSave({ ...f, id: viagem?.id || newId(), criadoEm: viagem?.criadoEm || Date.now() } as Viagem)
    setSaving(false)
    onClose()
  }
  const SEL = (value: string, onChange: (v: string) => void, opts: string[]) => (
    <select style={IS} value={value} onChange={e => onChange(e.target.value)}>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
  const NUM = (value: number, onChange: (v: number) => void, placeholder = '0,00') => (
    <input type="number" style={IS} value={value || ''} onChange={e => onChange(Number(e.target.value))} placeholder={placeholder} min={0} step={0.01} />
  )

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 16px', overflowY: 'auto' }}>
      <div style={{ background: 'var(--bg-2,#1a1b26)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.6)', margin: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
              {viagem ? '✏️ Editar Viagem' : '✈️ Nova Viagem'}
            </div>
            {dias > 0 && <div style={{ fontSize: '0.65rem', color: '#60a5fa', marginTop: 2 }}>⏱ {dias} dias de viagem</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
        </div>
        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto', maxHeight: '75vh' }}>

          {/* Identificação */}
          <section>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-accent)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>✈️ Identificação</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <Lbl>Título da Viagem *</Lbl>
                <input style={IS} value={f.titulo} onChange={e => upd({ titulo: e.target.value })} placeholder="Ex: Tóquio 2026, Curitiba com família…" />
              </div>
              <div>
                <Lbl>Destino</Lbl>
                <input style={IS} value={f.destino} onChange={e => upd({ destino: e.target.value })} placeholder="Cidade / País" />
              </div>
              <div>
                <Lbl>URL da Capa (imagem)</Lbl>
                <input style={IS} value={f.imagemUrl} onChange={e => upd({ imagemUrl: e.target.value })} placeholder="https://…" />
              </div>
              <div><Lbl>Finalidade</Lbl>{SEL(f.finalidade, v => upd({ finalidade: v as FinalidadeViagem }), ['Passeio','Férias','Profissional','Concurso','Lua de Mel','Aventura','Cultural','Outros'])}</div>
              <div><Lbl>Status</Lbl>{SEL(f.status, v => upd({ status: v as StatusViagem }), ['Expectativa','Em Planejamento','Confirmada','Realizada'])}</div>
              <div><Lbl>Data de Início</Lbl><input type="date" style={IS} value={f.dataInicio} onChange={e => upd({ dataInicio: e.target.value })} /></div>
              <div><Lbl>Data de Fim</Lbl><input type="date" style={IS} value={f.dataFim} onChange={e => upd({ dataFim: e.target.value })} /></div>
            </div>
          </section>
          <Divider />

          {/* Deslocamento principal */}
          <section>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.82rem', color: '#f59e0b', marginBottom: 12 }}>🚀 Deslocamento Principal</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: 'span 3' }}><Lbl>Modo</Lbl>{SEL(f.modoDeslocamento, v => upd({ modoDeslocamento: v as ModoDeslocamento }), ['Avião','Carro','Ônibus','Trem','Navio','Moto','Bicicleta','Combinado'])}</div>
              <div><Lbl>Custo Ida (R$)</Lbl>{NUM(f.custoDeslocamentoIda, v => upd({ custoDeslocamentoIda: v }))}</div>
              <div><Lbl>Custo Volta (R$)</Lbl>{NUM(f.custoDeslocamentoVolta, v => upd({ custoDeslocamentoVolta: v }))}</div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <Lbl>Total deslocamento</Lbl>
                <div style={{ padding: '9px 12px', borderRadius: 9, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: '#f59e0b' }}>
                  {fmtMoeda(f.custoDeslocamentoIda + f.custoDeslocamentoVolta)}
                </div>
              </div>
            </div>
          </section>
          <Divider />

          {/* Acesso ao terminal */}
          <section>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.82rem', color: '#a78bfa', marginBottom: 12 }}>🚕 Acesso ao Aeroporto/Terminal</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><Lbl>Modo (Ida ao terminal)</Lbl>{SEL(f.modoIda, v => upd({ modoIda: v as ModoAeroporto }), ['Carro próprio','Táxi','Uber/99','Ônibus','Carona','Transfer','Metrô'])}</div>
              <div><Lbl>Custo Previsto (R$)</Lbl>{NUM(f.custoIda, v => upd({ custoIda: v }))}</div>
              <div><Lbl>Modo (Retorno do terminal)</Lbl>{SEL(f.modoVolta, v => upd({ modoVolta: v as ModoAeroporto }), ['Carro próprio','Táxi','Uber/99','Ônibus','Carona','Transfer','Metrô'])}</div>
              <div><Lbl>Custo Previsto (R$)</Lbl>{NUM(f.custoVolta, v => upd({ custoVolta: v }))}</div>
            </div>
          </section>
          <Divider />

          {/* Aluguel + Outras */}
          <section>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.82rem', color: '#34d399', marginBottom: 12 }}>🚗 Aluguel & Outras Despesas</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => upd({ haAluguel: !f.haAluguel })}
                  style={{ width: 36, height: 36, borderRadius: 9, border: `2px solid ${f.haAluguel ? 'rgba(52,211,153,0.6)' : 'rgba(255,255,255,0.15)'}`, background: f.haAluguel ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)', color: f.haAluguel ? '#34d399' : 'var(--text-muted)', fontSize: '1rem', cursor: 'pointer', flexShrink: 0 }}>
                  {f.haAluguel ? '✅' : '○'}
                </button>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Haverá aluguel de veículo?</span>
              </div>
              {f.haAluguel && <div><Lbl>Custo Aluguel (R$)</Lbl>{NUM(f.custoAluguel, v => upd({ custoAluguel: v }))}</div>}
              <div style={{ gridColumn: f.haAluguel ? '1' : 'span 2' }}>
                <Lbl>Outras Despesas (Seguro, Vistos, Chip, Passaporte, Vacinas…)</Lbl>
                {NUM(f.outrasDespesas, v => upd({ outrasDespesas: v }))}
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <Lbl>Descrição das outras despesas</Lbl>
                <input style={IS} value={f.descricaoOutrasDespesas} onChange={e => upd({ descricaoOutrasDespesas: e.target.value })} placeholder="Ex: Chip internacional, Seguro viagem, Passaporte…" />
              </div>
            </div>
          </section>
          <Divider />

          {/* Observações */}
          <section>
            <Lbl>📝 Observações / Ata da Viagem</Lbl>
            <textarea style={{ ...IS, minHeight: 80, resize: 'vertical', lineHeight: 1.65 }}
              value={f.observacoes} onChange={e => upd({ observacoes: e.target.value })}
              placeholder="Motivação, detalhes importantes, documentos necessários…" />
          </section>
        </div>
        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'none', color: 'var(--text-secondary)', fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={saving || !f.titulo.trim()}
            style={{ padding: '9px 28px', borderRadius: 10, border: 'none', background: saving || !f.titulo.trim() ? 'rgba(96,165,250,0.2)' : 'linear-gradient(135deg,#1A73E8,#8B5CF6)', color: '#fff', fontWeight: 800, fontSize: '0.84rem', cursor: saving || !f.titulo.trim() ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Salvando…' : viagem ? '✅ Atualizar' : '✈️ Criar Viagem'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Hospedagem/Roteiro ──────────────────────────────────────────────────
function ModalHospedagem({ item, viagemId, onClose, onSave }: { item: Hospedagem | null; viagemId: string; onClose: () => void; onSave: (h: Hospedagem) => void }) {
  const [f, setF] = useState<Omit<Hospedagem,'id'|'criadoEm'>>(item ? { ...item } : {
    viagemId, tipo: 'Hospedagem', tipoAcomodacao: 'Hotel', nome: '',
    checkin: '', checkout: '', custo: 0, comodidades: [], linkReserva: '', notas: '',
  })
  const upd = useCallback((p: Partial<typeof f>) => setF(prev => ({ ...prev, ...p })), [])
  const dias = calcDias(f.checkin, f.checkout)
  const save = () => {
    if (!f.nome.trim()) return
    onSave({ ...f, id: item?.id || newId(), criadoEm: item?.criadoEm || Date.now() } as Hospedagem)
    onClose()
  }
  const togComod = (c: string) => upd({ comodidades: f.comodidades.includes(c) ? f.comodidades.filter(x => x !== c) : [...f.comodidades, c] })
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-2,#1a1b26)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>🏨 {item ? 'Editar' : 'Novo'} Registro</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><Lbl>Tipo de Registro</Lbl>
              <select style={IS} value={f.tipo} onChange={e => upd({ tipo: e.target.value as TipoRegistroRoteiro })}>
                {(['Hospedagem','Atração','Restaurante','Transporte local','Compra','Outros']).map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            {f.tipo === 'Hospedagem' && (
              <div><Lbl>Tipo de Acomodação</Lbl>
                <select style={IS} value={f.tipoAcomodacao} onChange={e => upd({ tipoAcomodacao: e.target.value as TipoAcomodacao })}>
                  {(['Hotel','Flat','Airbnb','Hostel','Pousada','Resort','Camping','Casa de familiar','Outros']).map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            )}
            <div style={{ gridColumn: 'span 2' }}>
              <Lbl>Nome / Descrição *</Lbl>
              <input style={IS} value={f.nome} onChange={e => upd({ nome: e.target.value })} placeholder={f.tipo === 'Hospedagem' ? 'Ex: Hotel Ibis Paulista' : 'Ex: Museu do Amanhã, Feijoada da Vó'} />
            </div>
            <div><Lbl>{f.tipo === 'Hospedagem' ? 'Check-in' : 'Data / Horário início'}</Lbl><input type="date" style={IS} value={f.checkin} onChange={e => upd({ checkin: e.target.value })} /></div>
            <div><Lbl>{f.tipo === 'Hospedagem' ? 'Check-out' : 'Data / Horário fim'}</Lbl><input type="date" style={IS} value={f.checkout} onChange={e => upd({ checkout: e.target.value })} /></div>
            {dias > 0 && f.tipo === 'Hospedagem' && <div style={{ gridColumn: 'span 2', fontSize: '0.7rem', color: '#60a5fa' }}>🌙 {dias} noite(s)</div>}
            <div style={{ gridColumn: 'span 2' }}><Lbl>Custo (R$)</Lbl>
              <input type="number" style={IS} value={f.custo || ''} onChange={e => upd({ custo: Number(e.target.value) })} min={0} step={0.01} />
            </div>
            <div style={{ gridColumn: 'span 2' }}><Lbl>Link (Reserva / Site)</Lbl>
              <input style={IS} value={f.linkReserva} onChange={e => upd({ linkReserva: e.target.value })} placeholder="https://…" />
            </div>
          </div>
          {f.tipo === 'Hospedagem' && (
            <div>
              <Lbl>Comodidades</Lbl>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {COMODIDADES.map(c => {
                  const a = f.comodidades.includes(c)
                  return <button key={c} onClick={() => togComod(c)}
                    style={{ padding: '4px 11px', borderRadius: 20, border: `1px solid ${a ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.1)'}`, background: a ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.03)', color: a ? '#93c5fd' : 'var(--text-muted)', fontSize: '0.7rem', fontWeight: a ? 700 : 400, cursor: 'pointer' }}>{c}</button>
                })}
              </div>
            </div>
          )}
          <div><Lbl>Notas</Lbl>
            <textarea style={{ ...IS, minHeight: 60, resize: 'vertical' }} value={f.notas} onChange={e => upd({ notas: e.target.value })} placeholder="Observações, dicas, avaliação…" />
          </div>
        </div>
        <div style={{ padding: '12px 22px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'none', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={!f.nome.trim()}
            style={{ padding: '8px 22px', borderRadius: 9, border: 'none', background: !f.nome.trim() ? 'rgba(96,165,250,0.15)' : 'linear-gradient(135deg,#1A73E8,#0ea5e9)', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: !f.nome.trim() ? 'not-allowed' : 'pointer' }}>
            {item ? 'Salvar' : '+ Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal detalhe da viagem ────────────────────────────────────────────────────
function DetalheViagem({ viagem, hospedagens, cotacoes, cofre, onClose, onEdit, onAddHosp, onDelHosp, onAddCotacao, onDelCotacao, onAporte }: any) {
  const cfg = STATUS_CFG[viagem.status as StatusViagem]
  const total = calcCustoTotal(viagem, hospedagens)
  const cofreV: Cofre | undefined = cofre
  const pct = total > 0 && cofreV ? Math.min(100, Math.round((cofreV.valorGuardado / total) * 100)) : 0
  const minhasCotacoes: Cotacao[] = [...cotacoes].sort((a: Cotacao, b: Cotacao) => b.dataCotacao.localeCompare(a.dataCotacao))
  const [novaHosp, setNovaHosp] = useState(false)
  const [novaCot, setNovaCot] = useState(false)
  const [cotF, setCotF] = useState({ dataCotacao: todayISO(), valorTotal: 0, notas: '' })
  const [aporteF, setAporteF] = useState({ valor: 0, descricao: '' })
  const [tabDet, setTabDet] = useState<'roteiro'|'financeiro'|'cotacoes'|'cofre'>('roteiro')
  const dias = calcDias(viagem.dataInicio, viagem.dataFim)

  const saveCotacao = () => {
    if (!cotF.valorTotal) return
    onAddCotacao({ ...cotF, id: newId(), viagemId: viagem.id, criadoEm: Date.now() })
    setCotF({ dataCotacao: todayISO(), valorTotal: 0, notas: '' })
    setNovaCot(false)
  }
  const saveAporte = () => {
    if (!aporteF.valor) return
    onAporte(aporteF)
    setAporteF({ valor: 0, descricao: '' })
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
      <div style={{ background: 'var(--bg-1,#13141f)', border: `1px solid ${cfg.border}`, borderRadius: 22, width: '100%', maxWidth: 800, margin: 'auto', boxShadow: `0 40px 100px rgba(0,0,0,0.7)`, overflow: 'hidden' }}>
        {/* Hero */}
        <div style={{ position: 'relative', minHeight: 180, background: viagem.imagemUrl ? `linear-gradient(to bottom,rgba(0,0,0,0.2),rgba(0,0,0,0.7)), url(${viagem.imagemUrl}) center/cover` : `linear-gradient(135deg,${cfg.cor}18,${cfg.bg})` }}>
          <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
          <button onClick={onEdit} style={{ position: 'absolute', top: 14, right: 56, width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>✏️</button>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, background: 'rgba(0,0,0,0.4)', border: `1px solid ${cfg.border}`, marginBottom: 8 }}>
                  <span>{cfg.emoji}</span>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: cfg.cor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{viagem.status}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.8rem', color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.5)', lineHeight: 1 }}>{viagem.titulo}</div>
                {viagem.destino && <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>📍 {viagem.destino}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                {dias > 0 && <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)', fontFamily: 'var(--font-mono)' }}>⏱ {dias} dias</div>}
                {viagem.dataInicio && <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{fmtData(viagem.dataInicio)} → {fmtData(viagem.dataFim)}</div>}
              </div>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          {[
            { l: 'Custo Total', v: fmtMoeda(total), c: '#f59e0b' },
            { l: 'Deslocamento', v: fmtMoeda(viagem.custoDeslocamentoIda + viagem.custoDeslocamentoVolta), c: '#60a5fa' },
            { l: 'Hospedagem', v: fmtMoeda(hospedagens.filter((h: Hospedagem) => h.viagemId === viagem.id).reduce((a: number, h: Hospedagem) => a + h.custo, 0)), c: '#a78bfa' },
            { l: 'Cofre', v: cofreV ? fmtMoeda(cofreV.valorGuardado) : 'R$ 0', c: '#34d399' },
          ].map(k => (
            <div key={k.l} style={{ padding: '14px 16px', borderRight: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: k.c }}>{k.v}</div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>{k.l}</div>
            </div>
          ))}
        </div>

        {/* Progresso do Cofre */}
        {total > 0 && (
          <div style={{ padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(52,211,153,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>💰 Cofre da Viagem</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.88rem', color: pct >= 100 ? '#34d399' : '#fbbf24' }}>{pct}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 5 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#34d399' : 'linear-gradient(90deg,#fbbf24,#f59e0b)', borderRadius: 4, transition: 'width 0.8s', boxShadow: `0 0 10px ${pct >= 100 ? '#34d39960' : '#f59e0b60'}` }} />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>{progressoBar(pct)} {fmtMoeda(cofreV?.valorGuardado || 0)} de {fmtMoeda(total)}</div>
          </div>
        )}

        {/* Abas */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 24px' }}>
          {([['roteiro','🗺 Roteiro'],['financeiro','💸 Financeiro'],['cotacoes','📊 Cotações'],['cofre','💰 Cofre']] as const).map(([id, l]) => (
            <button key={id} onClick={() => setTabDet(id)}
              style={{ padding: '11px 16px', border: 'none', background: 'transparent', color: tabDet === id ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: tabDet === id ? 700 : 400, fontSize: '0.8rem', cursor: 'pointer', borderBottom: tabDet === id ? `2px solid ${cfg.cor}` : '2px solid transparent', marginBottom: -1, whiteSpace: 'nowrap' }}>
              {l}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: '20px 24px', maxHeight: '45vh', overflowY: 'auto' }}>

          {/* Roteiro */}
          {tabDet === 'roteiro' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>🏨 Hospedagens & Roteiro</span>
                <button onClick={() => setNovaHosp(true)}
                  style={{ padding: '5px 14px', borderRadius: 8, border: '1px solid rgba(96,165,250,0.4)', background: 'rgba(96,165,250,0.08)', color: '#93c5fd', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
                  + Adicionar
                </button>
              </div>
              {hospedagens.filter((h: Hospedagem) => h.viagemId === viagem.id).length === 0
                ? <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Nenhum registro ainda. Clique em + Adicionar.</div>
                : hospedagens.filter((h: Hospedagem) => h.viagemId === viagem.id)
                    .sort((a: Hospedagem, b: Hospedagem) => (a.checkin || '').localeCompare(b.checkin || ''))
                    .map((h: Hospedagem) => {
                      const isHosp = h.tipo === 'Hospedagem'
                      const noites = isHosp ? calcDias(h.checkin, h.checkout) : 0
                      return (
                        <div key={h.id} style={{ display: 'flex', gap: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, alignItems: 'flex-start' }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: isHosp ? 'rgba(167,139,250,0.15)' : 'rgba(96,165,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
                            {h.tipo === 'Hospedagem' ? '🏨' : h.tipo === 'Restaurante' ? '🍽' : h.tipo === 'Atração' ? '🎡' : '🚌'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{h.nome}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                              {h.checkin && <span>📅 {fmtData(h.checkin)}{h.checkout && h.checkout !== h.checkin ? ` → ${fmtData(h.checkout)}` : ''}</span>}
                              {noites > 0 && <span>🌙 {noites} noite(s)</span>}
                              {h.tipo !== 'Hospedagem' && <span style={{ background: 'rgba(96,165,250,0.1)', padding: '1px 7px', borderRadius: 10, color: '#93c5fd' }}>{h.tipo}</span>}
                              {h.tipoAcomodacao && h.tipo === 'Hospedagem' && <span>{h.tipoAcomodacao}</span>}
                            </div>
                            {h.comodidades.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>{h.comodidades.slice(0, 3).map(c => <span key={c} style={{ fontSize: '0.58rem', padding: '2px 7px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>{c}</span>)}{h.comodidades.length > 3 && <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>+{h.comodidades.length - 3}</span>}</div>}
                            {h.linkReserva && <a href={h.linkReserva} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.65rem', color: '#60a5fa', textDecoration: 'none', marginTop: 4, display: 'inline-block' }}>🔗 Ver reserva</a>}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: '#a78bfa' }}>{fmtMoeda(h.custo)}</div>
                            <button onClick={() => onDelHosp(h.id)} style={{ marginTop: 6, padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.06)', color: '#f87171', fontSize: '0.65rem', cursor: 'pointer' }}>✕</button>
                          </div>
                        </div>
                      )
                    })}
              {/* Observações */}
              {viagem.observacoes && (
                <div style={{ marginTop: 8, padding: '12px 16px', borderRadius: 12, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
                  <div style={{ fontSize: '0.6rem', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>📋 Observações / Ata</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{viagem.observacoes}</div>
                </div>
              )}
            </div>
          )}

          {/* Financeiro */}
          {tabDet === 'financeiro' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { l: '✈️ Deslocamento (Ida)', v: viagem.custoDeslocamentoIda },
                { l: '✈️ Deslocamento (Volta)', v: viagem.custoDeslocamentoVolta },
                { l: '🚕 Acesso terminal (Ida)', v: viagem.custoIda, sub: viagem.modoIda },
                { l: '🚕 Acesso terminal (Volta)', v: viagem.custoVolta, sub: viagem.modoVolta },
                ...(viagem.haAluguel ? [{ l: '🚗 Aluguel de veículo', v: viagem.custoAluguel }] : []),
                { l: '📦 Outras despesas', v: viagem.outrasDespesas, sub: viagem.descricaoOutrasDespesas },
                { l: '🏨 Hospedagens & Roteiro', v: hospedagens.filter((h: Hospedagem) => h.viagemId === viagem.id).reduce((a: number, h: Hospedagem) => a + h.custo, 0), destaque: true },
              ].map((item: any, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: item.destaque ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${item.destaque ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: item.destaque ? 700 : 400 }}>{item.l}</div>
                    {item.sub && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1 }}>{item.sub}</div>}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.88rem', color: item.destaque ? '#a78bfa' : 'var(--text-secondary)' }}>{fmtMoeda(item.v)}</div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: '#f59e0b' }}>💰 TOTAL DA VIAGEM</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.1rem', color: '#f59e0b' }}>{fmtMoeda(total)}</span>
              </div>
            </div>
          )}

          {/* Cotações */}
          {tabDet === 'cotacoes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>📊 Histórico de Cotações</span>
                <button onClick={() => setNovaCot(p => !p)}
                  style={{ padding: '5px 14px', borderRadius: 8, border: '1px solid rgba(52,211,153,0.4)', background: 'rgba(52,211,153,0.08)', color: '#6ee7b7', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
                  + Registrar cotação
                </button>
              </div>
              {novaCot && (
                <div style={{ padding: '14px', borderRadius: 12, background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div><Lbl>Data da cotação</Lbl><input type="date" style={IS} value={cotF.dataCotacao} onChange={e => setCotF(p => ({ ...p, dataCotacao: e.target.value }))} /></div>
                    <div><Lbl>Valor total cotado (R$)</Lbl><input type="number" style={IS} value={cotF.valorTotal || ''} onChange={e => setCotF(p => ({ ...p, valorTotal: Number(e.target.value) }))} placeholder="0,00" min={0} step={0.01} /></div>
                    <div style={{ gridColumn: 'span 2' }}><Lbl>Notas (dólar, promoção…)</Lbl><input style={IS} value={cotF.notas} onChange={e => setCotF(p => ({ ...p, notas: e.target.value }))} placeholder="Ex: Passagem em promoção TAM, dólar R$5,80…" /></div>
                  </div>
                  <button onClick={saveCotacao} style={{ padding: '8px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>💾 Salvar Cotação</button>
                </div>
              )}
              {minhasCotacoes.length === 0
                ? <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Nenhuma cotação registrada ainda.</div>
                : minhasCotacoes.map((c: Cotacao, i: number) => {
                    const prev = minhasCotacoes[i + 1]
                    const delta = prev ? c.valorTotal - prev.valorTotal : null
                    return (
                      <div key={c.id} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, alignItems: 'center' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>{fmtData(c.dataCotacao)}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: '#34d399' }}>{fmtMoeda(c.valorTotal)}</div>
                          {c.notas && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>{c.notas}</div>}
                        </div>
                        {delta !== null && (
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: delta > 0 ? '#f87171' : '#34d399' }}>
                            {delta > 0 ? '▲' : '▼'} {fmtMoeda(Math.abs(delta))}
                          </div>
                        )}
                        <button onClick={() => onDelCotacao(c.id)} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.06)', color: '#f87171', fontSize: '0.65rem', cursor: 'pointer' }}>✕</button>
                      </div>
                    )
                  })}
            </div>
          )}

          {/* Cofre */}
          {tabDet === 'cofre' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                {[
                  { l: 'Guardado', v: fmtMoeda(cofreV?.valorGuardado || 0), c: '#34d399' },
                  { l: 'Meta (custo total)', v: fmtMoeda(total), c: '#f59e0b' },
                  { l: 'Faltam', v: fmtMoeda(Math.max(0, total - (cofreV?.valorGuardado || 0))), c: '#f87171' },
                ].map(k => (
                  <div key={k.l} style={{ padding: '12px', borderRadius: 12, background: 'rgba(0,0,0,0.15)', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: k.c }}>{k.v}</div>
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.15)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>Progresso</div>
                <div style={{ fontSize: '0.9rem', letterSpacing: '2px', marginBottom: 5 }}>{progressoBar(pct)}</div>
                <div style={{ height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#34d399' : 'linear-gradient(90deg,#fbbf24,#f59e0b)', borderRadius: 5, transition: 'width 0.8s', boxShadow: `0 0 12px ${pct >= 100 ? '#34d39950' : '#f59e0b50'}` }} />
                </div>
                <div style={{ marginTop: 5, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.88rem', color: pct >= 100 ? '#34d399' : '#fbbf24' }}>{pct}% concluído</div>
              </div>
              {/* Novo aporte */}
              <div style={{ padding: '14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>💸 Registrar Aporte</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><Lbl>Valor (R$)</Lbl><input type="number" style={IS} value={aporteF.valor || ''} onChange={e => setAporteF(p => ({ ...p, valor: Number(e.target.value) }))} placeholder="0,00" min={0} step={0.01} /></div>
                  <div><Lbl>Descrição</Lbl><input style={IS} value={aporteF.descricao} onChange={e => setAporteF(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Guardei do salário" /></div>
                </div>
                <button onClick={saveAporte} style={{ padding: '9px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer' }}>+ Adicionar ao Cofre</button>
              </div>
              {/* Histórico aportes */}
              {(cofreV?.historico?.length || 0) > 0 && (
                <div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Histórico de Aportes</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {[...(cofreV?.historico || [])].reverse().map((a: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{a.descricao || 'Aporte'}</div>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 1, fontFamily: 'var(--font-mono)' }}>{fmtData(a.data)}</div>
                        </div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.88rem', color: '#34d399' }}>+{fmtMoeda(a.valor)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {novaHosp && <ModalHospedagem item={null} viagemId={viagem.id} onClose={() => setNovaHosp(false)} onSave={h => { onAddHosp(h); setNovaHosp(false) }} />}
      </div>
    </div>
  )
}

// ─── Card Viagem ───────────────────────────────────────────────────────────────
function CardViagem({ viagem, hospedagens, onOpen, onDelete }: { viagem: Viagem; hospedagens: Hospedagem[]; onOpen: () => void; onDelete: () => void }) {
  const cfg = STATUS_CFG[viagem.status]
  const total = calcCustoTotal(viagem, hospedagens)
  const dias = calcDias(viagem.dataInicio, viagem.dataFim)
  const [hover, setHover] = useState(false)

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ borderRadius: 18, border: `1px solid ${hover ? cfg.border : 'rgba(255,255,255,0.08)'}`, background: hover ? cfg.bg : 'var(--card-bg,#1a1b26)', overflow: 'hidden', cursor: 'pointer', transition: 'all 0.22s', transform: hover ? 'translateY(-3px)' : 'none', boxShadow: hover ? `0 12px 32px rgba(0,0,0,0.25), 0 0 0 1px ${cfg.border}` : 'none', position: 'relative' }}>
      {/* Imagem / Cover */}
      <div onClick={onOpen} style={{ height: 160, background: viagem.imagemUrl ? `url(${viagem.imagemUrl}) center/cover` : `linear-gradient(135deg,${cfg.cor}18,${cfg.bg})`, display: 'flex', alignItems: 'flex-end', padding: 12, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: viagem.imagemUrl ? 'linear-gradient(to bottom,transparent 30%,rgba(0,0,0,0.7))' : 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'flex-end' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: 'rgba(0,0,0,0.5)', border: `1px solid ${cfg.border}`, backdropFilter: 'blur(4px)' }}>
            <span style={{ fontSize: '0.7rem' }}>{cfg.emoji}</span>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: cfg.cor, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{viagem.status}</span>
          </div>
          {dias > 0 && <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.8)', background: 'rgba(0,0,0,0.4)', padding: '3px 8px', borderRadius: 10, backdropFilter: 'blur(4px)' }}>{dias}d</div>}
        </div>
      </div>
      {/* Body */}
      <div onClick={onOpen} style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', lineHeight: 1.25 }}>{viagem.titulo}</div>
          {viagem.destino && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>📍 {viagem.destino}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {viagem.finalidade && <span style={{ fontSize: '0.62rem', padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.07)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>{viagem.finalidade}</span>}
          {viagem.modoDeslocamento && <span style={{ fontSize: '0.62rem', padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.07)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>{viagem.modoDeslocamento}</span>}
        </div>
        {(viagem.dataInicio || viagem.dataFim) && (
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {viagem.dataInicio && fmtData(viagem.dataInicio)}{viagem.dataFim && ` → ${fmtData(viagem.dataFim)}`}
          </div>
        )}
        {total > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>💰 Custo total estimado</span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.88rem', color: '#f59e0b' }}>{fmtMoeda(total)}</span>
          </div>
        )}
      </div>
      {/* Delete */}
      <button onClick={e => { e.stopPropagation(); if (window.confirm('Excluir esta viagem?')) onDelete() }}
        style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hover ? 1 : 0, transition: 'opacity 0.2s' }}>
        ✕
      </button>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────
function Viagens() {
  const uid = useUid()
  const [viagens, setViagens] = useState<Viagem[]>([])
  const [hospedagens, setHospedagens] = useState<Hospedagem[]>([])
  const [cotacoes, setCotacoes] = useState<Cotacao[]>([])
  const [cofres, setCofres] = useState<Cofre[]>([])
  const [loading, setLoading] = useState(true)
  const [modalNova, setModalNova] = useState(false)
  const [editando, setEditando] = useState<Viagem | null>(null)
  const [detalhe, setDetalhe] = useState<Viagem | null>(null)
  const [filtroStatus, setFiltroStatus] = useState<StatusViagem | 'Todas'>('Todas')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (!uid) return
    const u1 = onSnapshot(collection(db, 'users', uid, 'viagens'), s => { setViagens(s.docs.map(d => ({ id: d.id, ...d.data() } as Viagem)).sort((a, b) => (a.dataInicio || '').localeCompare(b.dataInicio || ''))); setLoading(false) })
    const u2 = onSnapshot(collection(db, 'users', uid, 'viagens_hospedagens'), s => setHospedagens(s.docs.map(d => ({ id: d.id, ...d.data() } as Hospedagem))))
    const u3 = onSnapshot(collection(db, 'users', uid, 'viagens_cotacoes'), s => setCotacoes(s.docs.map(d => ({ id: d.id, ...d.data() } as Cotacao))))
    const u4 = onSnapshot(collection(db, 'users', uid, 'viagens_cofres'), s => setCofres(s.docs.map(d => ({ id: d.id, ...d.data() } as Cofre))))
    return () => { u1(); u2(); u3(); u4() }
  }, [uid])

  const saveViagem = useCallback(async (v: Viagem) => {
    if (!uid) return
    await setDoc(doc(db, 'users', uid, 'viagens', v.id), clean(v))
  }, [uid])

  const delViagem = useCallback(async (id: string) => {
    if (!uid) return
    await deleteDoc(doc(db, 'users', uid, 'viagens', id))
    hospedagens.filter(h => h.viagemId === id).forEach(h => deleteDoc(doc(db, 'users', uid, 'viagens_hospedagens', h.id)))
    cotacoes.filter(c => c.viagemId === id).forEach(c => deleteDoc(doc(db, 'users', uid, 'viagens_cotacoes', c.id)))
    cofres.filter(c => c.viagemId === id).forEach(c => deleteDoc(doc(db, 'users', uid, 'viagens_cofres', c.id)))
  }, [uid, hospedagens, cotacoes, cofres])

  const saveHosp = useCallback(async (h: Hospedagem) => {
    if (!uid) return
    await setDoc(doc(db, 'users', uid, 'viagens_hospedagens', h.id), clean(h))
  }, [uid])

  const delHosp = useCallback(async (id: string) => {
    if (!uid) return
    await deleteDoc(doc(db, 'users', uid, 'viagens_hospedagens', id))
  }, [uid])

  const saveCotacao = useCallback(async (c: Cotacao) => {
    if (!uid) return
    await setDoc(doc(db, 'users', uid, 'viagens_cotacoes', c.id), clean(c))
  }, [uid])

  const delCotacao = useCallback(async (id: string) => {
    if (!uid) return
    await deleteDoc(doc(db, 'users', uid, 'viagens_cotacoes', id))
  }, [uid])

  const saveAporte = useCallback(async (viagemId: string, aporte: { valor: number; descricao: string }) => {
    if (!uid || !aporte.valor) return
    const existing = cofres.find(c => c.viagemId === viagemId)
    const hist = existing?.historico || []
    const novoHist = [...hist, { data: todayISO(), valor: aporte.valor, descricao: aporte.descricao }]
    const novoValor = novoHist.reduce((a, x) => a + x.valor, 0)
    const cofre: Cofre = { id: existing?.id || newId(), viagemId, valorGuardado: novoValor, ultimoAporte: todayISO(), historico: novoHist, criadoEm: existing?.criadoEm || Date.now() }
    await setDoc(doc(db, 'users', uid, 'viagens_cofres', cofre.id), clean(cofre))
  }, [uid, cofres])

  const filtradas = useMemo(() => viagens.filter(v => {
    if (filtroStatus !== 'Todas' && v.status !== filtroStatus) return false
    if (busca && !v.titulo.toLowerCase().includes(busca.toLowerCase()) && !(v.destino || '').toLowerCase().includes(busca.toLowerCase())) return false
    return true
  }), [viagens, filtroStatus, busca])

  const realizadas = useMemo(() => [...viagens].filter(v => v.status === 'Realizada').sort((a, b) => b.dataInicio.localeCompare(a.dataInicio)), [viagens])
  const ativas = useMemo(() => viagens.filter(v => v.status === 'Em Planejamento' || v.status === 'Confirmada'), [viagens])

  const totalPoupado = useMemo(() => cofres.reduce((a, c) => a + c.valorGuardado, 0), [cofres])
  const totalPlaneado = useMemo(() => viagens.filter(v => v.status !== 'Realizada').reduce((a, v) => a + calcCustoTotal(v, hospedagens), 0), [viagens, hospedagens])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#60a5fa', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', boxSizing: 'border-box' }}>

      {/* ── Header ── */}
      <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid rgba(96,165,250,0.15)', background: 'linear-gradient(135deg,rgba(96,165,250,0.06),transparent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.5rem', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>✈️ Viagens</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{viagens.length} viagem(ns) · {ativas.length} ativa(s)</p>
          </div>
          <button onClick={() => { setEditando(null); setModalNova(true) }}
            style={{ padding: '10px 22px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#1A73E8,#0ea5e9)', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 4px 16px rgba(26,115,232,0.35)', whiteSpace: 'nowrap' }}>
            + Nova Viagem
          </button>
        </div>

        {/* Stats globais */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
          {[
            { l: 'Total em planejamento', v: fmtMoeda(totalPlaneado), c: '#f59e0b', e: '📊' },
            { l: 'Total no cofre', v: fmtMoeda(totalPoupado), c: '#34d399', e: '💰' },
            { l: 'Viagens realizadas', v: realizadas.length, c: '#60a5fa', e: '🔵' },
            { l: 'Em planejamento', v: ativas.length, c: '#fbbf24', e: '🟡' },
            { l: 'Confirmadas', v: viagens.filter(v => v.status === 'Confirmada').length, c: '#34d399', e: '🟢', border: 'rgba(52,211,153,0.25)', bg: 'rgba(52,211,153,0.06)' },
            { l: 'Expectativas', v: viagens.filter(v => v.status === 'Expectativa').length, c: '#94a3b8', e: '⚪', border: 'rgba(148,163,184,0.2)', bg: 'rgba(148,163,184,0.05)' },
          ].map(k => (
            <div key={k.l} style={{ padding: '12px 14px', borderRadius: 12, background: (k as any).bg || 'var(--card-bg,rgba(255,255,255,0.03))', border: `1px solid ${(k as any).border || 'rgba(255,255,255,0.08)'}` }}>
              <div style={{ fontSize: '0.9rem', marginBottom: 3 }}>{k.e}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: k.c, lineHeight: 1 }}>{k.v}</div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.07em', lineHeight: 1.3 }}>{k.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Layout 2 colunas ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', flex: 1, minHeight: 0 }}>

        {/* Coluna principal (70%) */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', borderRight: '1px solid rgba(255,255,255,0.07)' }}>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem', pointerEvents: 'none' }}>🔍</span>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar viagem…"
                style={{ ...IS, paddingLeft: 34 }} />
            </div>
            {(['Todas', 'Expectativa', 'Em Planejamento', 'Confirmada', 'Realizada'] as const).map(s => {
              const cfg = s !== 'Todas' ? STATUS_CFG[s] : null
              return (
                <button key={s} onClick={() => setFiltroStatus(s as any)}
                  style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${filtroStatus === s ? (cfg?.border || 'rgba(255,255,255,0.3)') : 'rgba(255,255,255,0.1)'}`, background: filtroStatus === s ? (cfg?.bg || 'rgba(255,255,255,0.06)') : 'transparent', color: filtroStatus === s ? (cfg?.cor || 'var(--text-primary)') : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: filtroStatus === s ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {s !== 'Todas' && cfg?.emoji} {s}
                </button>
              )
            })}
          </div>

          {/* Galeria cards */}
          {filtradas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>✈️</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{busca || filtroStatus !== 'Todas' ? 'Nenhuma viagem encontrada' : 'Nenhuma viagem ainda'}</div>
              {!busca && filtroStatus === 'Todas' && <div style={{ fontSize: '0.75rem', marginTop: 6 }}>Clique em <strong>+ Nova Viagem</strong> para começar a planejar</div>}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
              {filtradas.map(v => (
                <CardViagem key={v.id} viagem={v} hospedagens={hospedagens}
                  onOpen={() => setDetalhe(v)}
                  onDelete={() => delViagem(v.id)} />
              ))}
            </div>
          )}
        </div>

        {/* Coluna direita — Mural de Memórias */}
        <div style={{ padding: '20px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', display: 'inline-block' }} />
            Mural de Memórias ({realizadas.length})
          </div>
          {realizadas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>As viagens realizadas aparecem aqui</div>
          ) : (
            realizadas.map(v => {
              const dias = calcDias(v.dataInicio, v.dataFim)
              return (
                <button key={v.id} onClick={() => setDetalhe(v)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(96,165,250,0.2)', transition: 'border-color 0.2s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(96,165,250,0.5)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(96,165,250,0.2)'}>
                    {v.imagemUrl && <div style={{ height: 80, background: `url(${v.imagemUrl}) center/cover` }} />}
                    <div style={{ padding: '10px 12px', background: 'rgba(96,165,250,0.05)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 3 }}>{v.titulo}</div>
                      {v.destino && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>📍 {v.destino}</div>}
                      <div style={{ fontSize: '0.62rem', color: '#60a5fa', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                        {v.dataInicio && new Date(v.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
                        {dias > 0 && ` · ${dias}d`}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Modais */}
      {(modalNova || editando) && (
        <ModalViagem viagem={editando} onClose={() => { setModalNova(false); setEditando(null) }} onSave={saveViagem} />
      )}
      {detalhe && (
        <DetalheViagem
          viagem={detalhe}
          hospedagens={hospedagens}
          cotacoes={cotacoes.filter(c => c.viagemId === detalhe.id)}
          cofre={cofres.find(c => c.viagemId === detalhe.id)}
          onClose={() => setDetalhe(null)}
          onEdit={() => { setEditando(detalhe); setDetalhe(null) }}
          onAddHosp={saveHosp}
          onDelHosp={delHosp}
          onAddCotacao={saveCotacao}
          onDelCotacao={delCotacao}
          onAporte={(a: any) => saveAporte(detalhe.id, a)}
        />
      )}
    </div>
  )
}
