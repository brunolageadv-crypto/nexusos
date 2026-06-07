import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './hooks/useAuth'
import LoginPage from './auth/LoginPage'
import EditaisAGU from './components/editais/EditaisAGU'
import NexusDashboard from './components/dashboard/NexusDashboard'
import Concursos from './components/concursos/Concursos'
import PontoEletronico from './components/ponto/PontoEletronico'
import Financeiro from './components/financeiro/Financeiro'

/* ═══ Theme ══════════════════════════════════════════════════ */
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

/* ═══ Logo SVG ════════════════════════════════════════════════ */
function NexisLogo() {
  return (
    <div style={{ padding: '4px 0 2px', userSelect: 'none' }}>
      <svg width="164" height="42" viewBox="0 0 164 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#b0b8c8"/>
            <stop offset="100%" stopColor="#6e7a8a"/>
          </linearGradient>
          <linearGradient id="lg2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8892a4"/>
            <stop offset="100%" stopColor="#5a6478"/>
          </linearGradient>
        </defs>
        {/* Anel externo */}
        <circle cx="21" cy="21" r="15" stroke="#2e333c" strokeWidth="1.5" fill="none"/>
        {/* Arco superior destacado */}
        <path d="M 8.5 13 A 15 15 0 0 1 33.5 13" stroke="url(#lg1)" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        {/* N */}
        <text x="21" y="26.5" textAnchor="middle" fontFamily="Syne,sans-serif" fontWeight="800" fontSize="14" fill="#c4cad6" letterSpacing="-0.5">N</text>
        {/* NEXIS */}
        <text x="44" y="27" fontFamily="Syne,sans-serif" fontWeight="800" fontSize="18" letterSpacing="3" fill="#d8dce6">NEXIS</text>
        {/* .OS — fonte fina */}
        <text x="112" y="27" fontFamily="Syne,sans-serif" fontWeight="300" fontSize="17" letterSpacing="1" fill="url(#lg2)">.OS</text>
      </svg>
    </div>
  )
}

/* ═══ Nav ═══════════════════════════════════════════════════ */
const NAV = [
  { section: 'PRINCIPAL', items: [
    { id: 'dashboard',  label: 'Dashboard',       icon: '◈' },
  ]},
  { section: 'JURÍDICO', items: [
    { id: 'editais',    label: 'Editais AGU',      icon: '⚖' },
    { id: 'concursos',  label: 'Concursos',        icon: '🎯' },
  ]},
  { section: 'PESSOAL', items: [
    { id: 'financeiro', label: 'Financeiro',       icon: '◎' },
    { id: 'ponto',      label: 'Ponto Eletrônico', icon: '⊙' },
    { id: 'journal',    label: 'Diário',            icon: '✦' },
    { id: 'media',      label: 'Media Tracker',    icon: '▶' },
  ]},
]

/* ═══ AppShell ════════════════════════════════════════════════ */
function AppShell() {
  const [active, setActive] = useState('dashboard')
  const { theme, toggle } = useTheme()
  const { user, logout } = useAuth()
  const currentLabel = NAV.flatMap(g => g.items).find(i => i.id === active)?.label ?? ''
  const displayName = user?.displayName ?? user?.email ?? 'Usuário'
  const avatarUrl = user?.photoURL ?? null
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <NexisLogo />
        </div>

        {/* Nav */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
          {NAV.map(group => (
            <div key={group.section} className="sidebar-section">
              <div className="sidebar-section-label">{group.section}</div>
              {group.items.map(item => (
                <button
                  key={item.id}
                  className={`nav-item ${active === item.id ? 'active' : ''}`}
                  onClick={() => setActive(item.id)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* User block */}
        <div style={{
          margin: '0 12px 8px',
          padding: '11px 13px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 11,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '2px solid rgba(180,185,200,0.35)',
            overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(180,185,200,0.1)',
          }}>
            {avatarUrl
              ? <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.78rem', fontWeight: 800, color: '#c4cad6' }}>{initials}</span>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayName.split(' ')[0]}
            </div>
            <div style={{ fontSize: '0.58rem', color: 'rgba(180,185,200,0.4)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.email}
            </div>
          </div>
          <button onClick={logout} title="Sair"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.18)', fontSize: '1rem', padding: 4, borderRadius: 6, flexShrink: 0, transition: 'color 0.2s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.18)' }}
          >⏻</button>
        </div>

        {/* Theme toggle */}
        <div className="sidebar-bottom">
          <button className="theme-btn" onClick={toggle}>
            <span style={{ fontSize: '1rem' }}>{theme === 'dark' ? '☀' : '◑'}</span>
            <span>{theme === 'dark' ? 'Tema Claro' : 'Tema Escuro'}</span>
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <span className="topbar-breadcrumb">nexis.os /</span>
          <span className="topbar-title">{currentLabel}</span>
          <div className="topbar-right">
            <div className="sync-dot" />
            <span className="topbar-status">ONLINE</span>
          </div>
        </header>
        <div className="page-content">
          {active === 'dashboard'  && <NexusDashboard onNavigate={setActive} />}
          {active === 'editais'    && <EditaisAGU />}
          {active === 'concursos'  && <Concursos />}
          {active === 'financeiro' && <Financeiro />}
          {active === 'ponto'      && <PontoEletronico />}
          {active === 'journal'    && <Placeholder title="Diário"         icon="✦" />}
          {active === 'media'      && <Placeholder title="Media Tracker"  icon="▶" />}
        </div>
      </div>
    </div>
  )
}

function Placeholder({ title, icon }: { title: string; icon: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:16, color:'var(--text-muted)' }}>
      <span style={{ fontSize:52 }}>{icon}</span>
      <span style={{ fontFamily:'var(--font-display)', fontSize:'0.85rem', letterSpacing:'0.2em', textTransform:'uppercase' }}>{title} — Em breve</span>
    </div>
  )
}

function Root() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'var(--bg-0)', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
      <div style={{ width:40, height:40, borderRadius:'50%', border:'2px solid transparent', borderTopColor:'#c4cad6', animation:'spin 0.8s linear infinite' }} />
      <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-muted)', letterSpacing:'0.12em' }}>AUTENTICANDO…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  return user ? <AppShell /> : <LoginPage />
}

export default function App() {
  return <ThemeProvider><Root /></ThemeProvider>
}
