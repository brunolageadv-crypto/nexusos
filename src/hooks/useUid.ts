// useUid.ts — obtém uid do usuário autenticado
import { useState, useEffect } from 'react'
import { getAuth, onAuthStateChanged } from 'firebase/auth'

export function useUid(): string | null {
  const [uid, setUid] = useState<string | null>(() => {
    try { return getAuth().currentUser?.uid ?? null } catch { return null }
  })
  useEffect(() => {
    try {
      const auth = getAuth()
      if (auth.currentUser) {
        setUid(auth.currentUser.uid)
      }
      return onAuthStateChanged(auth, user => {
        setUid(user?.uid ?? null)
      })
    } catch { return undefined }
  }, [])
  return uid
}
