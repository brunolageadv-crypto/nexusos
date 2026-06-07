import { useState, useEffect } from 'react'
import { auth } from '../lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'

export function useUid(): string | null {
  const [uid, setUid] = useState<string | null>(
    auth?.currentUser?.uid ?? null
  )
  useEffect(() => {
    if (!auth) return
    if (auth.currentUser?.uid) {
      setUid(auth.currentUser.uid)
    }
    return onAuthStateChanged(auth, user => {
      setUid(user?.uid ?? null)
    })
  }, [])
  return uid
}
