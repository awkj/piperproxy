// 简化版快捷键 hook，专供 NetworkPanel 使用。
// 与 web 端 use-shortcuts.ts 的区别：不依赖 useUIStore / shortcuts-config；
// 调用方保证 NetworkPanel 只在对应 tab 激活时挂载，无需 tab 层过滤。

import { useEffect } from 'react'

export type NetworkShortcutId =
  | 'clearNetworkSessions'
  | 'toggleNetworkState'
  | 'focusNetworkSearchBox'
  | 'switchNetworkView'
  | 'toggleDetailPanel'
  | 'openSearchFilter'
  | 'editRepeat'

interface KeySpec {
  key: string
  mod?: boolean
  shift?: boolean
}

const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac')

const BINDINGS: Record<NetworkShortcutId, KeySpec> = {
  clearNetworkSessions: { key: 'x', mod: true },
  toggleNetworkState: { key: 'o', mod: true },
  focusNetworkSearchBox: { key: '/' },
  switchNetworkView: { key: 'b', mod: true },
  toggleDetailPanel: { key: 'b', mod: true },
  openSearchFilter: { key: 'f', mod: true },
  editRepeat: { key: 'r', mod: true },
}

function matchesKey(ev: KeyboardEvent, spec: KeySpec): boolean {
  const hasMod = isMac ? ev.metaKey : ev.ctrlKey
  if (!!spec.mod !== hasMod) return false
  if (!!spec.shift !== ev.shiftKey) return false
  return ev.key.toLowerCase() === spec.key.toLowerCase()
}

function isInputFocused(ev: KeyboardEvent): boolean {
  const target = ev.target as HTMLElement | null
  if (!target) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  if (target.closest('.cm-editor')) return true
  return false
}

export function useNetworkShortcuts(
  handlers: Partial<Record<NetworkShortcutId, () => void>>,
) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      for (const [id, spec] of Object.entries(BINDINGS) as [NetworkShortcutId, KeySpec][]) {
        const handler = handlers[id]
        if (!handler) continue
        if (!matchesKey(ev, spec)) continue
        if (!spec.mod && isInputFocused(ev)) continue
        ev.preventDefault()
        handler()
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handlers])
}
