import { useState } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ThemeProvider, useTheme } from './hooks/useTheme'
import LoginPage from './pages/LoginPage'
import Dashboard from './components/dashboard/Dashboard'
import EditaisAGU from './components/editais/EditaisAGU'

type NavPage = 'dashboard' | 'media' | 'ponto' | 'finance' | 'journal' | 'concursos' | 'editais'

const NAV_ITEMS: { id: NavPage; icon: string; label: string; group?: string }[] = [
  { id: 'dashboard', icon: '◈', label: 'Dashboard' },
  { id: 'ponto',     icon: '⏱', label: 'Ponto' },
  { id: 'finance',   icon: '💰', label: 'Finanças' },
  { id: 'media',     icon: '🎬', label: 'Mídia' },
  { id: 'journal',   icon: '📓', label: 'Diário' },
  { id: 'concursos', icon: '🏛', label: 'Concursos', group: 'Jurídico' },
  { id: 'editais',   icon: '📋', label: 'Editais AGU', group: 'Jurídico' },
]

function ComingSoon({ name }: { name: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 240, gap: 12, color: 'var(--text-muted)' }}>
      <span style={{ fontSize: 40 }}>🚧</span>
      <p style={{ fontWeight: 600 }}>{name} — em construção</p>
      <p style={{ fontSize: 13 }}>Implementando em breve</p>
    </div>
  )
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button onClick={toggleTheme} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
      style={{ width: 34, height: 34, borderRadius: 8, border: '0.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, transition: 'all 0.15s', flexShrink: 0 }}>
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}

function AppShell() {
  const { user, nexusUser, logout } = useAuth()
  const [page, setPage] = useState<NavPage>('dashboard')

  if (!user) return <LoginPage />

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg)' }}>
      {/* Sidebar */}
      <nav style={{ width: 220, flexShrink: 0, borderRight: '0.5px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 16px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 900, fontSize: 18, color: 'var(--text-primary)' }}>
            Nexus<span style={{ color: 'var(--purple)' }}>OS</span>
          </span>
          <ThemeToggle />
        </div>

        <div style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
          {['', 'Jurídico'].map(group => {
            const items = NAV_ITEMS.filter(n => (n.group ?? '') === group)
            return (
              <div key={group} style={{ marginBottom: 14 }}>
                {group && <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '0 8px', marginBottom: 4 }}>{group}</p>}
                {items.map(item => (
                  <button key={item.id} onClick={() => setPage(item.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: 'none',
                      background: page === item.id ? 'var(--purple-dim)' : 'transparent',
                      color: page === item.id ? 'var(--purple)' : 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 13, fontWeight: page === item.id ? 700 : 500, textAlign: 'left', marginBottom: 2, transition: 'all 0.15s' }}>
                    <span style={{ fontSize: 15 }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            )
          })}
        </div>

        <div style={{ padding: 12, borderTop: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          {nexusUser?.photoURL && <img src={nexusUser.photoURL} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nexusUser?.displayName}</p>
            <button onClick={logout} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Sair</button>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>
          <header style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{NAV_ITEMS.find(n => n.id === page)?.label}</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </header>

          {page === 'dashboard'  && <Dashboard />}
          {page === 'ponto'      && <ComingSoon name="Ponto Eletrônico" />}
          {page === 'finance'    && <ComingSoon name="Controle Financeiro" />}
          {page === 'media'      && <ComingSoon name="Media Tracker" />}
          {page === 'journal'    && <ComingSoon name="Diário" />}
          {page === 'concursos'  && <ComingSoon name="Concursos" />}
          {page === 'editais'    && <EditaisAGU />}
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  )
}
