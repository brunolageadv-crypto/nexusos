import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import EditaisAGU from './components/editais/EditaisAGU'
import NexusDashboard from './components/dashboard/NexusDashboard'

/* ═══ Theme ═══════════════════════════════════════════════════ */
type Theme = 'dark' | 'light'
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => {} })
export const useTheme = () => useContext(ThemeCtx)

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem('nexusos-theme') as Theme) ?? 'dark'
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

/* ═══ Nav config ══════════════════════════════════════════════ */
const NAV = [
  {
    section: 'PRINCIPAL',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: '◈' },
    ],
  },
  {
    section: 'JURÍDICO',
    items: [
      { id: 'editais', label: 'Editais AGU', icon: '⚖' },
      { id: 'concursos', label: 'Concursos', icon: '🎯' },
    ],
  },
  {
    section: 'PESSOAL',
    items: [
      { id: 'financeiro', label: 'Financeiro', icon: '◎' },
      { id: 'ponto', label: 'Ponto Eletrônico', icon: '⊙' },
      { id: 'journal', label: 'Diário', icon: '✦' },
      { id: 'media', label: 'Media Tracker', icon: '▶' },
    ],
  },
]

/* ═══ AppShell ════════════════════════════════════════════════ */
function AppShell() {
  const [active, setActive] = useState('dashboard')
  const { theme, toggle } = useTheme()

  const currentLabel = NAV.flatMap(g => g.items).find(i => i.id === active)?.label ?? ''

  return (
    <div className="app-shell">

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-wordmark">NexusOS</div>
          <div className="logo-tagline">Operating System · Bruno</div>
        </div>

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

        <div className="sidebar-bottom">
          <button className="theme-btn" onClick={toggle}>
            <span>{theme === 'dark' ? '☀' : '◑'}</span>
            <span>{theme === 'dark' ? 'Tema Claro' : 'Tema Escuro'}</span>
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
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
          {active === 'dashboard' && <NexusDashboard onNavigate={setActive} />}
          {active === 'editais'   && <EditaisAGU />}
          {active === 'concursos' && <PlaceholderPage title="Concursos" icon="🎯" />}
          {active === 'financeiro' && <PlaceholderPage title="Financeiro" icon="◎" />}
          {active === 'ponto'     && <PlaceholderPage title="Ponto Eletrônico" icon="⊙" />}
          {active === 'journal'   && <PlaceholderPage title="Diário" icon="✦" />}
          {active === 'media'     && <PlaceholderPage title="Media Tracker" icon="▶" />}
        </div>
      </div>
    </div>
  )
}

function PlaceholderPage({ title, icon }: { title: string; icon: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 16, color: 'var(--text-muted)' }}>
      <span style={{ fontSize: 48 }}>{icon}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.8rem', letterSpacing: '0.2em', textTransform: 'uppercase' }}>{title} — Em breve</span>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  )
}
