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

/* ═══ Logo NEXUS — corrigida ═════════════════════════════════ */
function NexusLogo() {
  return (
    <div style={{ padding: '8px 0 6px', userSelect: 'none' }}>
      {/* viewBox 200x46 — espaço suficiente para hexágono + NEXUS */}
      <svg width="200" height="46" viewBox="0 0 200 46" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="ng1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c8cdd8"/>
            <stop offset="100%" stopColor="#7a8394"/>
          </linearGradient>
          <linearGradient id="ng2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#9aa3b2"/>
            <stop offset="100%" stopColor="#5c6578"/>
          </linearGradient>
        </defs>

        {/* Hexágono externo */}
        <polygon points="21,3 37,12 37,30 21,39 5,30 5,12"
          fill="none" stroke="#3a4050" strokeWidth="1.2"/>
        {/* Hexágono interno */}
        <polygon points="21,9 32,15 32,27 21,33 10,27 10,15"
          fill="none" stroke="url(#ng1)" strokeWidth="1.5"/>
        {/* Linhas vértice a vértice */}
        <line x1="21" y1="3"  x2="21" y2="9"  stroke="#c8cdd8" strokeWidth="0.8" opacity="0.6"/>
        <line x1="37" y1="12" x2="32" y2="15" stroke="#c8cdd8" strokeWidth="0.8" opacity="0.6"/>
        <line x1="37" y1="30" x2="32" y2="27" stroke="#c8cdd8" strokeWidth="0.8" opacity="0.6"/>
        <line x1="21" y1="39" x2="21" y2="33" stroke="#c8cdd8" strokeWidth="0.8" opacity="0.6"/>
        <line x1="5"  y1="30" x2="10" y2="27" stroke="#c8cdd8" strokeWidth="0.8" opacity="0.6"/>
        <line x1="5"  y1="12" x2="10" y2="15" stroke="#c8cdd8" strokeWidth="0.8" opacity="0.6"/>
        {/* Ponto central */}
        <circle cx="21" cy="21" r="2.5" fill="url(#ng1)"/>

        {/* NEXUS — x=48, fontSize=19, letterSpacing menor para caber */}
        <text x="48" y="27"
          fontFamily="Syne,sans-serif" fontWeight="800"
          fontSize="19" letterSpacing="3"
          fill="#dde1eb">NEXUS</text>
        {/* Linha decorativa */}
        <line x1="48" y1="33" x2="196" y2="33" stroke="url(#ng2)" strokeWidth="0.7"/>
      </svg>
    </div>
  )
}

/* ═══ Nav ═══════════════════════════════════════════════════ */
const NAV = [
  { section: 'PRINCIPAL', items: [
    { id: 'dashboard',  label: 'Dashboard',         icon: '◈' },
  ]},
  { section: 'JURÍDICO', items: [
    { id: 'editais',    label: 'Editais AGU',        icon: '⚖' },
    { id: 'concursos',  label: 'Concursos',          icon: '🎯' },
    { id: 'prontuario', label: 'Prontuário ADM',     icon: '📋' },
  ]},
  { section: 'FINANÇAS & VIDA', items: [
    { id: 'financeiro', label: 'Financeiro',         icon: '◎' },
    { id: 'ponto',      label: 'Ponto Eletrônico',   icon: '⊙' },
    { id: 'saude',      label: 'Saúde & Bem-Estar',  icon: '✚' },
    { id: 'wishlist',   label: 'Wishlist & Compras', icon: '🛒' },
  ]},
  { section: 'ENTRETENIMENTO', items: [
    { id: 'journal',    label: 'Diário',             icon: '✦' },
    { id: 'media',      label: 'Media Tracker',      icon: '▶' },
    { id: 'gaming',     label: 'Gaming Hub',         icon: '🎮' },
    { id: 'links',      label: 'Links de Interesse', icon: '🔗' },
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
        <div className="sidebar-logo">
          <NexusLogo />
        </div>

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
          margin: '0 12px 8px', padding: '11px 13px',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 11, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '2px solid rgba(180,185,200,0.35)', overflow: 'hidden', flexShrink: 0,
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

        <div className="sidebar-bottom">
          <button className="theme-btn" onClick={toggle}>
            <span style={{ fontSize: '1rem' }}>{theme === 'dark' ? '☀' : '◑'}</span>
            <span>{theme === 'dark' ? 'Tema Claro' : 'Tema Escuro'}</span>
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <span className="topbar-breadcrumb">nexus /</span>
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
          {active === 'prontuario' && <Placeholder title="Prontuário ADM"     icon="📋" color="#3b82f6" />}
          {active === 'saude'      && <Placeholder title="Saúde & Bem-Estar"  icon="✚"  color="#10b981" />}
          {active === 'wishlist'   && <Placeholder title="Wishlist & Compras" icon="🛒" color="#f59e0b" />}
          {active === 'journal'    && <Placeholder title="Diário"             icon="✦"  color="#ec4899" />}
          {active === 'media'      && <Placeholder title="Media Tracker"      icon="▶"  color="#3b82f6" />}
          {active === 'gaming'     && <Placeholder title="Gaming Hub"         icon="🎮" color="#7c3aed" />}
          {active === 'links'      && <Placeholder title="Links de Interesse"  icon="🔗" color="#00e5ff" />}
        </div>
      </div>
    </div>
  )
}

function Placeholder({ title, icon, color = 'var(--text-muted)' }: { title: string; icon: string; color?: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:20, color:'var(--text-muted)' }}>
      <div style={{ width:72, height:72, borderRadius:20, background:`${color}18`, border:`1px solid ${color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32 }}>{icon}</div>
      <div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:'1rem', letterSpacing:'0.15em', textTransform:'uppercase', color, textAlign:'center' }}>{title}</div>
        <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', textAlign:'center', marginTop:6 }}>Em desenvolvimento — em breve disponível</div>
      </div>
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
