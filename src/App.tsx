import { useState } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import Dashboard from './components/dashboard/Dashboard'

type NavPage = 'dashboard' | 'media' | 'ponto' | 'finance' | 'journal'

const NAV_ITEMS: { id: NavPage; icon: string; label: string }[] = [
  { id: 'dashboard', icon: '◈', label: 'Dashboard' },
  { id: 'media', icon: '🎬', label: 'Mídia' },
  { id: 'ponto', icon: '⏱', label: 'Ponto' },
  { id: 'finance', icon: '💰', label: 'Finanças' },
  { id: 'journal', icon: '📓', label: 'Diário' },
]

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-muted gap-3">
      <span className="text-4xl">🚧</span>
      <p className="font-medium">{name} — em construção</p>
      <p className="text-sm">Módulo será implementado na próxima etapa</p>
    </div>
  )
}

function AppShell() {
  const { user, nexusUser, logout } = useAuth()
  const [page, setPage] = useState<NavPage>('dashboard')

  if (!user) return <LoginPage />

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <nav className="w-56 flex-shrink-0 border-r border-border flex flex-col bg-surface">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-border">
          <span className="font-mono font-black text-xl tracking-tight">
            Nexus<span className="text-purple">OS</span>
          </span>
        </div>

        {/* Nav */}
        <div className="flex-1 py-4 px-2 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                page === item.id
                  ? 'bg-purple-dim text-purple'
                  : 'text-muted hover:bg-background hover:text-primary'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        {/* User */}
        <div className="p-4 border-t border-border flex items-center gap-3">
          {nexusUser?.photoURL && (
            <img
              src={nexusUser.photoURL}
              alt="Avatar"
              className="w-8 h-8 rounded-full"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{nexusUser?.displayName}</p>
            <button
              onClick={logout}
              className="text-xs text-muted hover:text-primary transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <header className="mb-6">
            <h1 className="text-xl font-bold">
              {NAV_ITEMS.find((n) => n.id === page)?.label}
            </h1>
            <p className="text-sm text-muted">
              {new Date().toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </header>

          {page === 'dashboard' && <Dashboard />}
          {page === 'media' && <ComingSoon name="Media Tracker" />}
          {page === 'ponto' && <ComingSoon name="Ponto Eletrônico" />}
          {page === 'finance' && <ComingSoon name="Controle Financeiro" />}
          {page === 'journal' && <ComingSoon name="Journaling" />}
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
