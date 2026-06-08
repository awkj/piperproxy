import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { NetworkItem } from '../../types'
import { headersToText, getRequestCookie, copyToClipboard } from '../../lib/curl'
import { fetchCaptureCurl, addValue } from '../../api/network'
import { MockDialog, type MockConfig } from '../dialogs/MockDialog'
import { buildMockRule } from './mock-rule'
import { useDiffPoolStore } from '../../stores/diffPool'
import { useNetworkStore } from '../../stores/network'
import { useWorkingSessionStore } from '../../stores/workingSession'
import { usePiperApi } from '../../context'

export interface RowContextMenuProps {
  item: NetworkItem
  checked: boolean
  onRemoveSelected: () => void
  onRemoveOthers: () => void
  onToggleHighlight?: () => void
  onEditComment?: () => void
  onShowTiming?: () => void
  /** Called when user triggers "Replay" / "Edit & Repeat". Host opens the Composer tab. */
  onSendToComposer?: (item: NetworkItem) => void
  /** Called after mock values are written, so host can refresh its values cache. */
  onMutateValues?: () => void
  children: React.ReactNode
}

const itemCls = [
  'group/item relative flex cursor-default select-none items-center',
  'h-6 rounded-md px-3 text-[13px] leading-none outline-none',
  '[font-family:system-ui,-apple-system,BlinkMacSystemFont,"SF_Pro_Text","SF_Pro","Helvetica_Neue",sans-serif]',
  'text-[#1d1d1f]',
  'data-[highlighted]:bg-gradient-to-b data-[highlighted]:from-[rgba(74,142,245,0.94)] data-[highlighted]:to-[rgba(29,111,237,0.94)]',
  'data-[highlighted]:text-white',
  'data-[highlighted]:shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]',
  'data-[disabled]:opacity-40 data-[disabled]:pointer-events-none',
].join(' ')

const contentCls = [
  'z-50 min-w-[220px] rounded-2xl p-[5px]',
  'shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.5),0_24px_60px_rgba(15,23,42,0.20),0_6px_14px_rgba(15,23,42,0.08)]',
]

const contentStyle: React.CSSProperties = {
  backgroundColor: 'rgba(232, 234, 237, 0.5)',
  backdropFilter: 'blur(20px) saturate(1.8)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
}

const sepCls = 'mx-3 my-1 h-px bg-black/[0.06]'

export function RowContextMenu({
  item,
  checked,
  onRemoveSelected,
  onRemoveOthers,
  onToggleHighlight,
  onEditComment,
  onShowTiming,
  onSendToComposer,
  onMutateValues,
  children,
}: RowContextMenuProps) {
  const { t } = useTranslation()
  const client = usePiperApi()
  const [mockOpen, setMockOpen] = useState(false)
  const [mockConfirming, setMockConfirming] = useState(false)

  const { pin, unpin, isPinned } = useWorkingSessionStore.getState()
  const domain = item.hostname || ''
  const domainPinned = domain ? isPinned({ type: 'domain', value: domain }) : false

  const handleCopy = async (text: string, label?: string) => {
    if (!text) {
      toast.error(t('common.empty'))
      return
    }
    const ok = await copyToClipboard(text)
    if (ok) toast.success(label ?? t('common.copied'))
    else toast.error(t('errors.fetchFailed'))
  }

  const handleCopyCurl = async () => {
    try {
      const cmd = await fetchCaptureCurl(client, item.id)
      await handleCopy(cmd)
    } catch {
      toast.error(t('errors.fetchFailed'))
    }
  }

  const openInDiff = () => {
    const multiIds = useNetworkStore.getState().multiSelectIds
    const diffStore = useDiffPoolStore.getState()
    const captureItems = useNetworkStore.getState().captureItems

    if (multiIds.length >= 2) {
      const items = multiIds
        .slice(0, 2)
        .map((id) => captureItems.find((c) => c.id === id))
        .filter((x): x is NonNullable<typeof x> => x != null)
      diffStore.openWith(items)
    } else {
      diffStore.addToPool(item)
      diffStore.setOpen(true)
    }
  }

  const openInNewTab = () => {
    try {
      window.open(item.url, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error(t('errors.fetchFailed'))
    }
  }

  const replayInComposer = () => {
    onSendToComposer?.(item)
  }

  const onMockConfirm = async (config: MockConfig) => {
    if (mockConfirming) return
    setMockConfirming(true)
    try {
      const built = buildMockRule(item.url, config)

      for (const entry of built.values) {
        const res = await addValue(client, entry.name, entry.value)
        if (res.ec !== 0) {
          throw new Error(res.em || 'add value failed')
        }
      }

      const copied = await copyToClipboard(built.rule)

      if (built.values.length > 0) {
        onMutateValues?.()
      }

      if (copied) {
        toast.success(t('network.context.mockSuccess'))
      } else {
        toast.success(t('network.context.mockCopied'))
      }
      setMockOpen(false)
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? `${t('network.context.mockFailed')}: ${err.message}`
          : t('network.context.mockFailed')
      toast.error(msg)
    } finally {
      setMockConfirming(false)
    }
  }

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className={cn(contentCls)} style={contentStyle}>
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger className={cn(itemCls, 'pr-2')}>
                <span className="flex-1">{t('network.context.copy')}</span>
                <ChevronRight
                  className="ml-3 h-3.5 w-3.5 text-black/40 group-data-[highlighted]/item:text-white"
                  strokeWidth={2}
                />
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className={cn(contentCls)} style={contentStyle}>
                  <ContextMenu.Item className={itemCls} onSelect={() => void handleCopy(item.url)}>
                    {t('network.context.copyUrl')}
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={itemCls}
                    onSelect={() => void handleCopy(item.hostname ?? '')}
                  >
                    {t('network.context.copyHost')}
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={itemCls}
                    onSelect={() => void handleCopy(item.path ?? '')}
                  >
                    {t('network.context.copyPath')}
                  </ContextMenu.Item>
                  <ContextMenu.Item className={itemCls} onSelect={() => void handleCopyCurl()}>
                    {t('network.context.copyCurl')}
                  </ContextMenu.Item>
                  <ContextMenu.Separator className={sepCls} />
                  <ContextMenu.Item
                    className={itemCls}
                    onSelect={() => void handleCopy(item.req?.body ?? '')}
                  >
                    {t('network.context.copyReqBody')}
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={itemCls}
                    onSelect={() => void handleCopy(item.res?.body ?? '')}
                  >
                    {t('network.context.copyRespBody')}
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={itemCls}
                    onSelect={() => void handleCopy(getRequestCookie(item))}
                  >
                    {t('network.context.copyCookie')}
                  </ContextMenu.Item>
                  <ContextMenu.Separator className={sepCls} />
                  <ContextMenu.Item
                    className={itemCls}
                    onSelect={() => void handleCopy(item.clientIp ?? '')}
                  >
                    {t('network.context.copyClientIp')}
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={itemCls}
                    onSelect={() => void handleCopy(item.hostIp ?? '')}
                  >
                    {t('network.context.copyServerIp')}
                  </ContextMenu.Item>
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>

            <ContextMenu.Separator className={sepCls} />

            {onToggleHighlight && (
              <ContextMenu.Item className={itemCls} onSelect={onToggleHighlight}>
                {item.highlighted
                  ? t('network.context.clearHighlight')
                  : t('network.context.highlight')}
              </ContextMenu.Item>
            )}
            {onEditComment && (
              <ContextMenu.Item
                className={itemCls}
                onSelect={() => setTimeout(onEditComment, 0)}
              >
                {t('network.context.editComment')}
              </ContextMenu.Item>
            )}

            <ContextMenu.Separator className={sepCls} />

            {domain && (
              <ContextMenu.Item
                className={itemCls}
                onSelect={() =>
                  domainPinned
                    ? unpin({ type: 'domain', value: domain })
                    : pin({ type: 'domain', value: domain })
                }
              >
                {domainPinned
                  ? t('network.context.unpinDomain')
                  : t('network.context.pinDomain')}
              </ContextMenu.Item>
            )}

            <ContextMenu.Separator className={sepCls} />

            <ContextMenu.Item className={itemCls} onSelect={openInDiff}>
              {t('network.context.diffFlows')}
            </ContextMenu.Item>

            <ContextMenu.Separator className={sepCls} />

            <ContextMenu.Item className={itemCls} onSelect={replayInComposer}>
              {t('network.context.replay')}
            </ContextMenu.Item>
            <ContextMenu.Item className={itemCls} onSelect={openInNewTab}>
              {t('network.context.openInNewTab')}
            </ContextMenu.Item>
            {onShowTiming && (
              <ContextMenu.Item
                className={itemCls}
                onSelect={() => setTimeout(onShowTiming, 0)}
              >
                {t('network.detail.viewTiming')}
              </ContextMenu.Item>
            )}

            <ContextMenu.Separator className={sepCls} />

            <ContextMenu.Item
              className={itemCls}
              onSelect={() => {
                setTimeout(() => setMockOpen(true), 0)
              }}
            >
              {t('network.context.mockAs')}
            </ContextMenu.Item>

            <ContextMenu.Separator className={sepCls} />

            <ContextMenu.Item
              className={cn(
                itemCls,
                'text-[#d70015]',
                'data-[highlighted]:from-[rgba(255,94,91,0.94)] data-[highlighted]:to-[rgba(215,0,21,0.94)]',
                'data-[highlighted]:text-white',
              )}
              onSelect={onRemoveSelected}
            >
              {checked ? t('network.context.removeSelected') : t('network.context.removeOne')}
            </ContextMenu.Item>
            <ContextMenu.Item className={itemCls} onSelect={onRemoveOthers}>
              {t('network.context.removeOthers')}
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      <MockDialog
        open={mockOpen}
        onClose={() => {
          if (mockConfirming) return
          setMockOpen(false)
        }}
        value={{
          method: item.method ?? 'GET',
          status: item.res?.statusCode ?? 200,
          headers: headersToText(item.res?.headers),
          body: item.res?.body ?? '',
        }}
        confirming={mockConfirming}
        onConfirm={(cfg) => void onMockConfirm(cfg)}
      />
    </>
  )
}
