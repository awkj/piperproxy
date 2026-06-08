import { useEffect, useRef } from "react"
import * as monaco from "monaco-editor"

interface BodyDiffProps {
  leftBody: string | undefined
  rightBody: string | undefined
  leftContentType?: string
  rightContentType?: string
  mode: "side-by-side" | "unified"
}

function tryPrettifyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

function isBinary(text: string): boolean {
  for (let i = 0; i < Math.min(text.length, 512); i++) {
    const code = text.charCodeAt(i)
    if (code === 0 || (code < 9 && code !== 7 && code !== 8)) return true
  }
  return false
}

function resolveContent(body: string | undefined, ct?: string): string {
  const text = body ?? ""
  if (!text) return ""
  if (isBinary(text)) return "__binary__"
  const isJson = ct?.includes("json") || text.trimStart().startsWith("{") || text.trimStart().startsWith("[")
  if (isJson) return tryPrettifyJson(text)
  return text
}

export function BodyDiff({ leftBody, rightBody, leftContentType, rightContentType, mode }: BodyDiffProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)

  const leftText = resolveContent(leftBody, leftContentType)
  const rightText = resolveContent(rightBody, rightContentType)

  const isBin = leftText === "__binary__" || rightText === "__binary__"

  useEffect(() => {
    if (!containerRef.current || isBin) return

    const editor = monaco.editor.createDiffEditor(containerRef.current, {
      readOnly: true,
      renderSideBySide: mode === "side-by-side",
      originalEditable: false,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 12,
      automaticLayout: true,
      theme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "vs-dark" : "vs",
    })

    const originalModel = monaco.editor.createModel(leftText, "text/plain")
    const modifiedModel = monaco.editor.createModel(rightText, "text/plain")
    editor.setModel({ original: originalModel, modified: modifiedModel })
    editorRef.current = editor

    return () => {
      editor.dispose()
      originalModel.dispose()
      modifiedModel.dispose()
      editorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBin])

  useEffect(() => {
    if (!editorRef.current || isBin) return
    editorRef.current.updateOptions({ renderSideBySide: mode === "side-by-side" })
  }, [mode, isBin])

  useEffect(() => {
    if (!editorRef.current || isBin) return
    const model = editorRef.current.getModel()
    if (model) {
      model.original.setValue(leftText)
      model.modified.setValue(rightText)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftText, rightText, isBin])

  if (isBin) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-neutral-400">
        Binary body — diff not supported
      </div>
    )
  }

  if (!leftText && !rightText) {
    return <div className="flex items-center justify-center h-full text-sm text-neutral-400">No body</div>
  }

  return <div ref={containerRef} className="h-full w-full" />
}
