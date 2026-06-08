import { useEffect, useState } from 'react'

export interface NetworkPrefs {
  excludeFilterEnabled: boolean
  excludeFilter: string
  includeFilterEnabled: boolean
  maxRows: number
  viewOnlyOwn: boolean
  viewAllInWindow: boolean
  treeView: boolean
  highlightNew: boolean
}

export const DEFAULT_PREFS: NetworkPrefs = {
  excludeFilterEnabled: false,
  excludeFilter: '',
  includeFilterEnabled: false,
  maxRows: 1500,
  viewOnlyOwn: false,
  viewAllInWindow: false,
  treeView: false,
  highlightNew: true,
}

export const MAX_ROWS_OPTIONS = [500, 1000, 1500, 2000, 2500, 3000]

const STORAGE_KEY = 'w-network-prefs'

function read(): NetworkPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFS
    const obj = JSON.parse(raw) as Partial<NetworkPrefs>
    return { ...DEFAULT_PREFS, ...obj }
  } catch {
    return DEFAULT_PREFS
  }
}

function write(prefs: NetworkPrefs) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore quota errors */
  }
}

export function useNetworkPrefs() {
  const [prefs, setPrefs] = useState<NetworkPrefs>(() => read())

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPrefs(read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setPref = (patch: Partial<NetworkPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      write(next)
      return next
    })
  }

  return { prefs, setPref }
}
