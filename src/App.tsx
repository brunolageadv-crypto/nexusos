import { useState } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ThemeProvider, useTheme } from './hooks/useTheme'
import LoginPage from './pages/LoginPage'
import Dashboard from './components/dashboard/Dashboard'

type NavPage = 'dashboard' | 'media' | 'ponto' | 'finance' | 'journal' | 'concursos' | 'editais'

const NAV_ITEMS: { id: NavPage; icon: string; label: string; group?: string }[] = [
  { id: 'dashboard', icon: '◈', label: 'Dashboard' },
  { id: 'ponto',     icon: '⏱', label: 'Ponto' },
  { id: 'finance',   icon: '💰', label: 'Finanças' },
  { id: 'media',     icon: '🎬', label: 'Mídia' },
  { id: 'journal',   icon: '📓', label: 'Diário' },
  { id: 'concursos', icon: '🏛', label: 'Concursos', group: 'Jurídico' },
  { id: 'editais',   icon: '📋', label: 'Editais',   group: 'Jurídico' },
]

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3" style={{ color: 'var(--text-muted)' }}>
      <span className="text-4xl">🚧</span>
      <p className="font-medium">{name} — em construção</p>
      <p className="text-sm">Implementando em breve</p>
    </div>
  )
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      style={{
        width: 36, height: 36,
        borderRadius: 8,
        border: '0.5px solid var(--border)',
        background: 'var(--surface2)',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
        transition: 'all 0.15s',
        flexShrink: 0,
      }}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}

function AppShell() {
  const { user, nexusUser, logout } = useAuth()
  const [page, setPage] = useState<NavPage>('dashboard')

  if (!user) return <LoginPage />

  const groups = ['', 'Jurídico']

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      {/* Sidebar */}
      <nav style={{
        width: 220, flexShrink: 0,
        borderRight: '0.5px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo + theme toggle */}
        <div style={{
          padding: '20px 16px 16px',
          borderBottom: '0.5px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 900, fontSize: 18, letterSpacing: -0.5, color: 'var(--text-primary)' }}>
            Nexus<span style={{ color: 'var(--purple)' }}>OS</span>
          </span>
          <ThemeToggle />
        </div>

        {/* Nav groups */}
        <div style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {groups.map(group => {
            const items = NAV_ITEMS.filter(n => (n.group ?? '') === group)
            return (
              <div key={group} style={{ marginBottom: 16 }}>
                {group && (
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '0 8px', marginBottom: 4 }}>
                    {group}
                  </p>
                )}
                {items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setPage(item.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 8, border: 'none',
                      background: page === item.id ? 'var(--purple-dim)' : 'transparent',
                      color: page === item.id ? 'var(--purple)' : 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 13, fontWeight: 500,
                      textAlign: 'left', transition: 'all 0.15s',
                      marginBottom: 2,
                    }}
                    onMouseEnter={e => { if (page !== item.id) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)' }}
                    onMouseLeave={e => { if (page !== item.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <span style={{ fontSize: 15 }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            )
          })}
        </div>

        {/* User */}
        <div style={{ padding: 14, borderTop: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          {nexusUser?.photoURL && (
            <img src={nexusUser.photoURL} alt="Avatar" style={{ width: 30, height: 30, borderRadius: '50%' }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {nexusUser?.displayName}
            </p>
            <button onClick={logout} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Sair
            </button>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
          <header style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
              {NAV_ITEMS.find(n => n.id === page)?.label}
            </h1>
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
          {page === 'editais'    && <ComingSoon name="Editais" />}
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
