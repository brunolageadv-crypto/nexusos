import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './hooks/useAuth'
import LoginPage from './components/auth/LoginPage'
import EditaisAGU from './components/editais/EditaisAGU'
import NexusDashboard from './components/dashboard/NexusDashboard'

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

/* ═══ AppShell ═══════════════════════════════════════════════ */
function AppShell() {
  const [active, setActive] = useState('dashboard')
  const { theme, toggle } = useTheme()
  const { user, logout } = useAuth()
  const currentLabel = NAV.flatMap(g => g.items).find(i => i.id === active)?.label ?? ''

  const avatarUrl  = user?.photoURL  ?? null
  const displayName = user?.displayName ?? user?.email ?? 'Usuário'
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="app-shell">

      {/* ── Sidebar ── */}
      <aside className="sidebar">

        {/* Logo */}
        <div className="sidebar-logo">
          <div className="logo-wordmark">NexusOS</div>
          <div className="logo-tagline">// Sistema Operacional Pessoal</div>
        </div>

        {/* User block */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(0,229,255,0.07)',
          display: 'flex', alignItems: 'center', gap: 12,
          flexShrink: 0,
        }}>
          {/* Avatar */}
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            border: '2px solid rgba(0,229,255,0.4)',
            overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,229,255,0.1)',
            boxShadow: '0 0 12px rgba(0,229,255,0.2)',
          }}>
            {avatarUrl
              ? <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontWeight: 700, color: '#00e5ff' }}>{initials}</span>
            }
          </div>

          {/* Name + email */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '0.82rem', fontWeight: 700,
              color: 'rgba(255,255,255,0.9)',
              fontFamily: 'var(--font-display)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {displayName.split(' ')[0]}
            </div>
            <div style={{
              fontSize: '0.62rem', color: 'rgba(0,229,255,0.45)',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {user?.email}
            </div>
          </div>

          {/* Logout icon */}
          <button
            onClick={logout}
            title="Sair"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.25)', fontSize: '1rem',
              padding: 4, borderRadius: 6, flexShrink: 0,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.25)' }}
          >
            ⏻
          </button>
        </div>

        {/* Nav items */}
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

        {/* Bottom: theme toggle */}
        <div className="sidebar-bottom">
          <button className="theme-btn" onClick={toggle}>
            <span style={{ fontSize: '1rem' }}>{theme === 'dark' ? '☀' : '◑'}</span>
            <span>{theme === 'dark' ? 'Tema Claro' : 'Tema Escuro'}</span>
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="main-area">
        <header className="topbar">
          <span className="topbar-breadcrumb">nexusos /</span>
          <span className="topbar-title">{currentLabel}</span>
          <div className="topbar-right">
            <div className="sync-dot" />
            <span className="topbar-status">ONLINE</span>
          </div>
        </header>

        <div className="page-content">
          {active === 'dashboard'  && <NexusDashboard onNavigate={setActive} />}
          {active === 'editais'    && <EditaisAGU />}
          {active === 'concursos'  && <Placeholder title="Concursos"        icon="🎯" />}
          {active === 'financeiro' && <Placeholder title="Financeiro"        icon="◎" />}
          {active === 'ponto'      && <Placeholder title="Ponto Eletrônico"  icon="⊙" />}
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
      <span style={{ fontFamily:'var(--font-display)', fontSize:'0.85rem', letterSpacing:'0.2em', textTransform:'uppercase' }}>
        {title} — Em breve
      </span>
    </div>
  )
}

/* ═══ Root ═══════════════════════════════════════════════════ */
function Root() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg-0)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor: '#00e5ff',
          animation: 'spin 0.8s linear infinite',
        }} />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.12em' }}>
          AUTENTICANDO…
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return user ? <AppShell /> : <LoginPage />
}

export default function App() {
  return (
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  )
}
