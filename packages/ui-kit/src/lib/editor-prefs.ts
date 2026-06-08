import { useEffect, useState } from 'react'

export const EDITOR_THEMES = [
  'default',
  'neat',
  'elegant',
  'erlang-dark',
  'night',
  'monokai',
  'cobalt',
  'eclipse',
  'rubyblue',
  'lesser-dark',
  'xq-dark',
  'xq-light',
  'ambiance',
  'blackboard',
  'vibrant-ink',
  'solarized dark',
  'solarized light',
  'twilight',
  'midnight',
] as const

export const FONT_SIZE_OPTIONS = (() => {
  const arr: number[] = [13]
  for (let i = 14; i <= 36; i += 2) arr.push(i)
  return arr
})()

export interface EditorPrefs {
  theme: string
  fontSize: number
  lineNumbers: boolean
  lineWrapping: boolean
  foldGutter: boolean
}

const DEFAULT: EditorPrefs = {
  theme: 'default',
  fontSize: 13,
  lineNumbers: true,
  lineWrapping: false,
  foldGutter: false,
}

function storageKey(target: 'rules' | 'values') {
  return `w-editor-prefs:${target}`
}

function read(target: 'rules' | 'values'): EditorPrefs {
  if (typeof window === 'undefined') return DEFAULT
  try {
    const raw = window.localStorage.getItem(storageKey(target))
    if (!raw) return DEFAULT
    const obj = JSON.parse(raw) as Partial<EditorPrefs>
    return { ...DEFAULT, ...obj }
  } catch {
    return DEFAULT
  }
}

function write(target: 'rules' | 'values', prefs: EditorPrefs) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(target), JSON.stringify(prefs))
  } catch {
    /* ignore quota errors */
  }
}

export function useEditorPrefs(target: 'rules' | 'values') {
  const [prefs, setPrefs] = useState<EditorPrefs>(() => read(target))

  useEffect(() => {
    setPrefs(read(target))
  }, [target])

  const setPref = (patch: Partial<EditorPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      write(target, next)
      return next
    })
  }

  return { prefs, setPref }
}
