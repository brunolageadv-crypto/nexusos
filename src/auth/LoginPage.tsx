import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { signInWithGoogle } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    try {
      setLoading(true); setError('')
      await signInWithGoogle()
    } catch {
      setError('Erro ao fazer login. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-0)', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', inset:0, backgroundImage:`linear-gradient(rgba(0,229,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.03) 1px,transparent 1px)`, backgroundSize:'48px 48px', pointerEvents:'none' }} />
      <div style={{ position:'absolute', width:600, height:600, borderRadius:'50%', background:'radial-gradient(ellipse,rgba(0,229,255,0.06) 0%,transparent 70%)', top:'50%', left:'50%', transform:'translate(-50%,-50%)', pointerEvents:'none' }} />
      <div style={{ position:'relative', width:420, background:'var(--card-bg)', border:'1px solid var(--border-md)', borderRadius:24, padding:'48px 40px', textAlign:'center', boxShadow:'0 0 0 1px rgba(0,229,255,0.05),0 32px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ marginBottom:32 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:800, letterSpacing:'0.2em', color:'#00e5ff', textShadow:'0 0 30px rgba(0,229,255,0.7),0 0 60px rgba(0,229,255,0.3)', marginBottom:8 }}>NEXUSOS</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--text-muted)', letterSpacing:'0.16em', textTransform:'uppercase' }}>// Sistema Operacional Pessoal</div>
        </div>
        <div style={{ height:1, background:'linear-gradient(90deg,transparent,var(--border-md),transparent)', marginBottom:32 }} />
        <p style={{ fontSize:'0.88rem', color:'var(--text-secondary)', marginBottom:28, lineHeight:1.6 }}>
          Acesso restrito.<br />Autentique-se com sua conta Google.
        </p>
        <button onClick={handleLogin} disabled={loading}
          style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, width:'100%', padding:'14px 20px', background:loading?'rgba(0,229,255,0.05)':'rgba(0,229,255,0.08)', border:'1px solid rgba(0,229,255,0.3)', borderRadius:12, color:'#fff', fontFamily:'var(--font-display)', fontSize:'0.95rem', fontWeight:700, letterSpacing:'0.04em', cursor:loading?'not-allowed':'pointer', transition:'all 0.2s', opacity:loading?0.6:1 }}
          onMouseEnter={e=>{ if(!loading){(e.currentTarget as HTMLElement).style.background='rgba(0,229,255,0.14)';(e.currentTarget as HTMLElement).style.boxShadow='0 0 24px rgba(0,229,255,0.2)'} }}
          onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background='rgba(0,229,255,0.08)';(e.currentTarget as HTMLElement).style.boxShadow='none' }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
          </svg>
          {loading ? 'Autenticando…' : 'Entrar com Google'}
        </button>
        {error && <p style={{ color:'#f87171', fontSize:'0.8rem', marginTop:16 }}>{error}</p>}
        <p style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:28, fontFamily:'var(--font-mono)', letterSpacing:'0.06em' }}>ACESSO AUTORIZADO APENAS PARA BRUNOLAGEADV</p>
      </div>
    </div>
  )
}
