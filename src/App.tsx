import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './hooks/useAuth'
import LoginPage from './auth/LoginPage'
import GestorEditais from './components/editais/GestorEditais'
import NexusDashboard from './components/dashboard/NexusDashboard'
import Concursos from './components/concursos/Concursos'
import PontoEletronico from './components/ponto/PontoEletronico'
import Financeiro from './components/financeiro/Financeiro'
import ProntuarioADM from './components/prontuario/ProntuarioADM'
import SaudeBemEstar from './components/saude/SaudeBemEstar'
import WishlistCompras from './components/wishlist/WishlistCompras'
import Diario from './components/journal/Diario'
import MediaTracker from './components/media/MediaTracker'

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

// ─── Ícone Editais — coluna de paragrafos com marcador ────────────────────────
function IconEditais({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Documento base */}
      <rect x="2" y="1" width="11" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3"/>
      {/* Dobra canto superior direito */}
      <path d="M10 1 L13 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M10 1 L10 4 L13 4" fill="none" stroke="currentColor" strokeWidth="1.1"/>
      {/* Linhas de texto */}
      <line x1="4.5" y1="6.5"  x2="10.5" y2="6.5"  stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <line x1="4.5" y1="8.5"  x2="10.5" y2="8.5"  stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <line x1="4.5" y1="10.5" x2="8.5"  y2="10.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      {/* Selo / marcador de certificação — círculo com check */}
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
  ]},
  { section: 'FINANÇAS & VIDA', items: [
    { id: 'financeiro', label: 'Financeiro',         icon: '◎',  svgIcon: null },
    { id: 'ponto',      label: 'Ponto Eletrônico',   icon: '⊙',  svgIcon: null },
    { id: 'saude',      label: 'Saúde & Bem-Estar',  icon: '✚',  svgIcon: null },
    { id: 'wishlist',   label: 'Wishlist & Compras', icon: '🛒', svgIcon: null },
  ]},
  { section: 'ENTRETENIMENTO', items: [
    { id: 'journal',    label: 'Diário',             icon: '✦',  svgIcon: null },
    { id: 'media',      label: 'Media Tracker',      icon: '▶',  svgIcon: null },
    { id: 'gaming',     label: 'Gaming Hub',         icon: '🎮', svgIcon: null },
  ]},
  { section: 'UTILIDADES', items: [
    { id: 'links',      label: 'Links de Interesse', icon: '🔗', svgIcon: null },
  ]},
]

function AppShell() {
  const [active, setActive] = useState('dashboard')
  const { theme, toggle } = useTheme()
  const { user, logout } = useAuth()

  // Sidebar: 'fixed' = sempre visível | 'auto' = oculta/aparece no hover
  const [sidebarMode, setSidebarMode] = useState<'fixed' | 'auto'>(
    () => (localStorage.getItem('nexusos-sidebar-mode') as 'fixed' | 'auto') ?? 'fixed'
  )
  const [sidebarHovered, setSidebarHovered] = useState(false)

  const sidebarVisible = sidebarMode === 'fixed' || sidebarHovered

  const toggleSidebarMode = () => {
    const next = sidebarMode === 'fixed' ? 'auto' : 'fixed'
    setSidebarMode(next)
    localStorage.setItem('nexusos-sidebar-mode', next)
  }

  const currentLabel = NAV.flatMap(g => g.items).find(i => i.id === active)?.label ?? ''
  const displayName = user?.displayName ?? user?.email ?? 'Usuário'
  const avatarUrl = user?.photoURL ?? null
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="app-shell" style={{ position: 'relative' }}>

      {/* ── Zona de hover para revelar sidebar quando no modo auto ── */}
      {sidebarMode === 'auto' && (
        <div
          onMouseEnter={() => setSidebarHovered(true)}
          style={{
            position: 'fixed', left: 0, top: 0, bottom: 0,
            width: sidebarHovered ? 0 : 16,
            zIndex: 40,
          }}
        />
      )}

      {/* ── SIDEBAR ── */}
      <aside
        className="sidebar"
        onMouseEnter={() => sidebarMode === 'auto' && setSidebarHovered(true)}
        onMouseLeave={() => sidebarMode === 'auto' && setSidebarHovered(false)}
        style={{
          position: sidebarMode === 'auto' ? 'fixed' : 'relative',
          top: 0, left: 0, bottom: 0,
          zIndex: 50,
          transform: sidebarVisible ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: sidebarMode === 'auto' && sidebarHovered
            ? '4px 0 32px rgba(0,0,0,0.5)'
            : 'none',
        }}
      >
        <div className="sidebar-logo"><NexusLogo /></div>

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
                  <span className="nav-icon">
                    {item.svgIcon === 'editais'
                      ? <IconEditais size={17} />
                      : item.icon}
                  </span>
                  <span className="nav-label">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* User block */}
        <div style={{ margin: '0 12px 8px', padding: '11px 13px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 11, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(180,185,200,0.35)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(180,185,200,0.1)' }}>
            {avatarUrl
              ? <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.78rem', fontWeight: 800, color: '#c4cad6' }}>{initials}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName.split(' ')[0]}</div>
            <div style={{ fontSize: '0.58rem', color: 'rgba(180,185,200,0.4)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
          </div>
          <button onClick={logout} title="Sair"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.18)', fontSize: '1rem', padding: 4, borderRadius: 6, flexShrink: 0, transition: 'color 0.2s' }}
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
      <div
        className="main-area"
        style={{
          marginLeft: sidebarMode === 'fixed' ? 0 : 0,
          transition: 'margin-left 0.28s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <header className="topbar">
          {/* Botão pin/unpin da sidebar */}
          <button
            onClick={toggleSidebarMode}
            title={sidebarMode === 'fixed' ? 'Ocultar sidebar automaticamente' : 'Fixar sidebar'}
            style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              border: '1px solid rgba(255,255,255,0.1)',
              background: sidebarMode === 'auto' ? 'rgba(0,229,255,0.08)' : 'rgba(255,255,255,0.04)',
              color: sidebarMode === 'auto' ? 'var(--text-accent)' : 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.85rem', transition: 'all 0.18s', marginRight: 4,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)' }}
          >
            {sidebarMode === 'fixed' ? '⇤' : '⇥'}
          </button>

          <span className="topbar-breadcrumb">nexus /</span>
          <span className="topbar-title">{currentLabel}</span>
          <div className="topbar-right">
            <div className="sync-dot" />
            <span className="topbar-status">ONLINE</span>
          </div>
        </header>

        <div className="page-content">
          {active === 'dashboard'  && <NexusDashboard onNavigate={setActive} />}
          {active === 'editais'    && <GestorEditais />}
          {active === 'concursos'  && <Concursos />}
          {active === 'financeiro' && <Financeiro />}
          {active === 'ponto'      && <PontoEletronico />}
          {active === 'prontuario' && <ProntuarioADM />}
          {active === 'saude'      && <SaudeBemEstar />}
          {active === 'wishlist'   && <WishlistCompras />}
          {active === 'journal'    && <Diario onNavigate={setActive} />}
          {active === 'media'      && <MediaTracker />}
          {active === 'gaming'     && <Placeholder title="Gaming Hub"         icon="🎮" color="#7c3aed" desc="Gerencie seus jogos e sessões de gameplay" />}
          {active === 'links'      && <Placeholder title="Links de Interesse" icon="🔗" color="#00e5ff" desc="Organize seus links favoritos por categoria" />}
        </div>
      </div>
    </div>
  )
}

function Placeholder({ title, icon, color = 'var(--text-muted)', desc }: { title: string; icon: string; color?: string; desc?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 20, color: 'var(--text-muted)' }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, background: `${color}18`, border: `1px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>{icon}</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', letterSpacing: '0.15em', textTransform: 'uppercase', color }}>{title}</div>
        {desc && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6 }}>{desc}</div>}
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, opacity: 0.6 }}>Em desenvolvimento — em breve disponível</div>
      </div>
    </div>
  )
}

function Root() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#c4cad6', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.12em' }}>AUTENTICANDO…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  return user ? <AppShell /> : <LoginPage />
}

export default function App() {
  return <ThemeProvider><Root /></ThemeProvider>
}
