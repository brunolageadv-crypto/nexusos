// Hook centralizado para UID — aguarda auth estar pronto
import { useState, useEffect } from 'react'
import { auth } from '../lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'

export function useUid() {
  const [uid, setUid] = useState<string | null>(null)
  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, user => setUid(user?.uid ?? null))
  }, [])
  return uid
}
