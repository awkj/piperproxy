import CodeMirror, {
  EditorView,
  type Extension,
} from '@uiw/react-codemirror'
import { useEffect, useMemo, useState } from 'react'

export type CodeLang =
  | 'json'
  | 'html'
  | 'js'
  | 'xml'
  | 'css'
  | 'whistle'
  | 'text'

const LIGHT_THEMES = new Set([
  'light',
  'default',
  'neat',
  'eclipse',
  'xq-light',
  'solarized light',
  'elegant',
])

interface CodeViewProps {
  value: string
  language?: CodeLang
  readOnly?: boolean
  height?: string
  onChange?: (value: string) => void
  extraExtensions?: Extension | Extension[]
  fontSize?: number
  lineNumbers?: boolean
  lineWrapping?: boolean
  foldGutter?: boolean
  theme?: string
}

const EXT_LOADER: Record<CodeLang, () => Promise<Extension | undefined>> = {
  json: () => import('@codemirror/lang-json').then((m) => m.json()),
  html: () => import('@codemirror/lang-html').then((m) => m.html()),
  js: () => import('@codemirror/lang-javascript').then((m) => m.javascript()),
  xml: () => import('@codemirror/lang-xml').then((m) => m.xml()),
  css: () => import('@codemirror/lang-css').then((m) => m.css()),
  whistle: () => import('../lib/cm-whistle').then((m) => m.whistleLang),
  text: () => Promise.resolve(undefined),
}

export function detectLanguage(contentType?: string): CodeLang {
  if (!contentType) return 'text'
  const lower = contentType.toLowerCase()
  if (lower.includes('json')) return 'json'
  if (lower.includes('html')) return 'html'
  if (lower.includes('xml')) return 'xml'
  if (lower.includes('css')) return 'css'
  if (lower.includes('javascript') || lower.includes('ecmascript')) return 'js'
  return 'text'
}

export function CodeView({
  value,
  language = 'text',
  readOnly = true,
  height = '100%',
  onChange,
  extraExtensions,
  fontSize,
  lineNumbers = true,
  lineWrapping = false,
  foldGutter = true,
  theme,
}: CodeViewProps) {
  const [langExt, setLangExt] = useState<Extension | null>(null)

  useEffect(() => {
    let cancelled = false
    const loader = EXT_LOADER[language]
    if (!loader) {
      setLangExt(null)
      return
    }
    loader().then((ext) => {
      if (cancelled) return
      setLangExt(ext ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [language])

  const fontExt = useMemo<Extension | null>(() => {
    if (fontSize == null) return null
    return EditorView.theme({
      '&': { fontSize: `${fontSize}px` },
      '.cm-content, .cm-gutters': { fontSize: `${fontSize}px` },
    })
  }, [fontSize])

  const wrapExt = useMemo<Extension | null>(
    () => (lineWrapping ? EditorView.lineWrapping : null),
    [lineWrapping],
  )

  const extensions = useMemo<Extension[]>(() => {
    const arr: Extension[] = []
    if (langExt) arr.push(langExt)
    if (extraExtensions) {
      if (Array.isArray(extraExtensions)) arr.push(...extraExtensions)
      else arr.push(extraExtensions)
    }
    if (fontExt) arr.push(fontExt)
    if (wrapExt) arr.push(wrapExt)
    return arr
  }, [langExt, extraExtensions, fontExt, wrapExt])

  const cmTheme: 'light' | 'dark' = (() => {
    if (!theme) return 'light'
    if (LIGHT_THEMES.has(theme)) return 'light'
    return 'dark'
  })()

  return (
    <CodeMirror
      value={value}
      extensions={extensions}
      readOnly={readOnly}
      editable={!readOnly}
      height={height}
      onChange={onChange}
      theme={cmTheme}
      basicSetup={{
        lineNumbers,
        foldGutter,
        highlightActiveLine: !readOnly,
      }}
    />
  )
}
