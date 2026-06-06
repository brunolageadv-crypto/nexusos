import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './hooks/useAuth'
import LoginPage from './auth/LoginPage'
import EditaisAGU from './components/editais/EditaisAGU'
import NexusDashboard from './components/dashboard/NexusDashboard'
import Concursos from './components/concursos/Concursos'
import PontoEletronico from './components/ponto/PontoEletronico'

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
    <svg width="148" height="44" viewBox="0 0 148 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Arc ring — inspired by nexus.OS logo */}
      <ellipse cx="22" cy="22" rx="18" ry="18" stroke="url(#ringGrad)" strokeWidth="2.5" fill="none" />
      <path d="M 8 10 A 18 18 0 0 1 36 10" stroke="url(#arcGrad)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      {/* N letter inside */}
      <text x="22" y="27" textAnchor="middle" fontFamily="Syne, sans-serif" fontWeight="800" fontSize="14" fill="url(#textGrad)">N</text>
      {/* NEXIS wordmark */}
      <text x="48" y="26" fontFamily="Syne, sans-serif" fontWeight="800" fontSize="18" letterSpacing="1" fill="#eef6ff">NEXIS</text>
      {/* .OS in accent */}
      <text x="104" y="26" fontFamily="Syne, sans-serif" fontWeight="400" fontSize="18" fill="url(#dotGrad)">.OS</text>
      <defs>
        <linearGradient id="ringGrad" x1="4" y1="4" x2="40" y2="40">
          <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.3"/>
        </linearGradient>
        <linearGradient id="arcGrad" x1="4" y1="4" x2="40" y2="20">
          <stop offset="0%" stopColor="#00e5ff"/>
          <stop offset="100%" stopColor="#7c3aed"/>
        </linearGradient>
        <linearGradient id="textGrad" x1="14" y1="14" x2="30" y2="30">
          <stop offset="0%" stopColor="#00e5ff"/>
          <stop offset="100%" stopColor="#7c3aed"/>
        </linearGradient>
        <linearGradient id="dotGrad" x1="104" y1="0" x2="148" y2="0">
          <stop offset="0%" stopColor="#00e5ff"/>
          <stop offset="100%" stopColor="#7c3aed"/>
        </linearGradient>
      </defs>
    </svg>
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

        {/* Nav items */}
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

        {/* User block — above theme toggle */}
        <div style={{
          margin: '0 12px 8px',
          padding: '12px 14px',
          background: 'rgba(0,229,255,0.04)',
          border: '1px solid rgba(0,229,255,0.1)',
          borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            border: '2px solid rgba(0,229,255,0.4)',
            overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,229,255,0.1)',
            boxShadow: '0 0 10px rgba(0,229,255,0.2)',
          }}>
            {avatarUrl
              ? <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.8rem', fontWeight: 800, color: '#00e5ff' }}>{initials}</span>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayName.split(' ')[0]}
            </div>
            <div style={{ fontSize: '0.6rem', color: 'rgba(0,229,255,0.4)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.email}
            </div>
          </div>
          <button onClick={logout} title="Sair"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', fontSize: '1rem', padding: 4, borderRadius: 6, flexShrink: 0, transition: 'color 0.2s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.2)' }}
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
          {active === 'financeiro' && <Placeholder title="Financeiro"        icon="◎" />}
          {active === 'ponto'      && <PontoEletronico />}
          {active === 'journal'    && <Placeholder title="Diário"            icon="✦" />}
          {active === 'media'      && <Placeholder title="Media Tracker"     icon="▶" />}
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
      <div style={{ width:40, height:40, borderRadius:'50%', border:'2px solid transparent', borderTopColor:'#00e5ff', animation:'spin 0.8s linear infinite' }} />
      <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-muted)', letterSpacing:'0.12em' }}>AUTENTICANDO…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
  return user ? <AppShell /> : <LoginPage />
}

export default function App() {
  return <ThemeProvider><Root /></ThemeProvider>
}
