import { useCallback, useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Send, Layers, Cookie } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CodeView, detectLanguage } from "@/components/CodeView"
import { sendComposer, type ComposerResponse } from "@/api/composer"
import { useComposerStore } from "@/store/composer"
import { useComposerHistoryStore } from "@/store/composer-history"
import { HistorySidebar, type RestoreSnapshot } from "./HistorySidebar"
import { BatchSendDialog } from "./BatchSendDialog"
import { CookiesDialog } from "@/components/dialogs"

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"] as const

const schema = z.object({
  method: z.enum(METHODS),
  url: z.string().min(1).url(),
  headers: z.string(),
  body: z.string(),
})

type FormValues = z.infer<typeof schema>

export function ComposerPanel() {
  const { t } = useTranslation()
  const [resp, setResp] = useState<ComposerResponse | null>(null)
  const [pending, setPending] = useState(false)

  const pushHistory = useComposerHistoryStore((s) => s.pushHistory)
  const [batchOpen, setBatchOpen] = useState(false)
  const [cookiesOpen, setCookiesOpen] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      method: "GET",
      url: "https://example.com/",
      headers: "Accept: */*",
      body: "",
    },
  })

  // 仅 Composer panel 内 Cmd+Enter 触发提交。SHORTCUTS 配置里没有 sendComposer
  // 这条（老栈也没暴露），且只在 Composer 内才有意义，所以单独走本地 keydown
  // 而非 useShortcuts。input/textarea 内按 Cmd+Enter 仍然触发（修饰键场景）。
  const formRef = useRef<HTMLFormElement | null>(null)
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (!(ev.metaKey || ev.ctrlKey)) return
      if (ev.key !== "Enter") return
      // 让 BatchSendDialog 等子对话框内的 Cmd+Enter 不被 Composer 抢走
      const target = ev.target as HTMLElement | null
      if (target && formRef.current && !formRef.current.contains(target)) {
        // 仅当焦点在表单内，或没有聚焦元素时触发
        if (target !== document.body) return
      }
      ev.preventDefault()
      formRef.current?.requestSubmit()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  // Apply Replay prefill from the network panel. consumePrefill() clears the
  // store atomically so navigating away and back will NOT re-apply the same
  // prefill (otherwise user-edited form state would silently get clobbered).
  // We also subscribe to the store so a Replay triggered while Composer is
  // already mounted still updates the form.
  useEffect(() => {
    const apply = () => {
      const prefill = useComposerStore.getState().consumePrefill()
      if (!prefill) return
      const method = (METHODS as readonly string[]).includes(prefill.method.toUpperCase())
        ? (prefill.method.toUpperCase() as FormValues["method"])
        : "GET"
      reset({
        method,
        url: prefill.url,
        headers: prefill.headers,
        body: prefill.body,
      })
    }
    apply()
    return useComposerStore.subscribe((state, prev) => {
      if (state.prefill && state.prefill !== prev.prefill) apply()
    })
  }, [reset])

  const onSubmit = async (values: FormValues) => {
    setPending(true)
    const startedAt = performance.now()
    try {
      const res = await sendComposer(values)
      setResp(res)
      pushHistory({
        method: values.method,
        url: values.url,
        headers: values.headers,
        body: values.body,
        status: res.status,
        statusText: res.statusText,
        durationMs: performance.now() - startedAt,
        ec: res.ec,
      })
      if (res.ec !== 0) toast.error(res.em ?? t("errors.fetchFailed"))
    } catch (e) {
      toast.error(String(e))
    } finally {
      setPending(false)
    }
  }

  const handleRestore = useCallback(
    (snapshot: RestoreSnapshot) => {
      const m = snapshot.method.toUpperCase()
      const method = (METHODS as readonly string[]).includes(m) ? (m as FormValues["method"]) : "GET"
      reset({
        method,
        url: snapshot.url,
        headers: snapshot.headers,
        body: snapshot.body,
      })
    },
    [reset],
  )

  const respLang = detectLanguage(resp?.headers?.["content-type"])

  // Cookies dialog needs the current Cookie header value (parsed lazily). We
  // watch headers so opening the dialog after edits picks up the latest text.
  const headersValue = watch("headers")

  const extractCookieLine = (text: string): string => {
    const lines = text.split(/\r?\n/)
    for (const line of lines) {
      const idx = line.indexOf(":")
      if (idx === -1) continue
      if (line.slice(0, idx).trim().toLowerCase() === "cookie") {
        return line.slice(idx + 1).trim()
      }
    }
    return ""
  }

  const replaceOrAppendCookieLine = (text: string, serialized: string): string => {
    const lines = text.split(/\r?\n/)
    let replaced = false
    const next = lines
      .map((line) => {
        const idx = line.indexOf(":")
        if (idx === -1) return line
        if (line.slice(0, idx).trim().toLowerCase() !== "cookie") return line
        replaced = true
        // Drop the Cookie line entirely if serialization is empty.
        return serialized ? `Cookie: ${serialized}` : null
      })
      .filter((l): l is string => l !== null)
    if (!replaced && serialized) {
      // Avoid leading blank line if the textarea starts empty.
      if (next.length === 1 && next[0]?.trim() === "") {
        return `Cookie: ${serialized}`
      }
      next.push(`Cookie: ${serialized}`)
    }
    return next.join("\n")
  }

  const handleCookiesConfirm = (_entries: unknown, serialized: string) => {
    const next = replaceOrAppendCookieLine(headersValue ?? "", serialized)
    setValue("headers", next, { shouldDirty: true })
  }

  return (
    <div className="flex h-full">
      <HistorySidebar onRestore={handleRestore} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="grid gap-3 border-b border-neutral-200 p-4">
          <div className="flex gap-2">
            <select
              {...register("method")}
              className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm font-mono"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              {...register("url")}
              placeholder="https://…"
              className="h-9 flex-1 rounded-md border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
            />
            <Button type="button" variant="default" disabled={pending} onClick={() => setBatchOpen(true)}>
              <Layers className="h-3.5 w-3.5" />
              {t("composer.batch")}
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              <Send className="h-3.5 w-3.5" />
              {t("composer.send")}
            </Button>
          </div>
          {errors.url && <span className="text-xs text-red-600">{errors.url.message}</span>}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-neutral-600">
              <span className="flex items-center justify-between">
                <span>{t("composer.headers")}</span>
                <button
                  type="button"
                  onClick={() => setCookiesOpen(true)}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-brand-600 hover:bg-brand-50"
                >
                  <Cookie className="h-3 w-3" />
                  {t("composer.editCookies")}
                </button>
              </span>
              <textarea
                {...register("headers")}
                rows={6}
                className="resize-none rounded-md border border-neutral-300 bg-white p-2 font-mono text-xs focus:border-brand-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-600">
              {t("composer.body")}
              <textarea
                {...register("body")}
                rows={6}
                className="resize-none rounded-md border border-neutral-300 bg-white p-2 font-mono text-xs focus:border-brand-500 focus:outline-none"
              />
            </label>
          </div>
        </form>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-600">
            {t("composer.response")}
            {resp?.status != null && (
              <span className="ml-2 font-mono text-neutral-500">
                {resp.status} {resp.statusText}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            {resp?.body ? (
              <CodeView value={resp.body} language={respLang} readOnly height="100%" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-neutral-400">
                {t("composer.noResponse")}
              </div>
            )}
          </div>
        </div>
      </div>
      {batchOpen && <BatchSendDialog open={batchOpen} onClose={() => setBatchOpen(false)} request={getValues()} />}
      <CookiesDialog
        open={cookiesOpen}
        onClose={() => setCookiesOpen(false)}
        value={extractCookieLine(headersValue ?? "")}
        onConfirm={handleCookiesConfirm}
      />
    </div>
  )
}
