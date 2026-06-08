import {
  createContext,
  useContext,
  type ButtonHTMLAttributes,
  type Ref,
  type SelectHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/cn'

// 统一抽象的工具栏组件：ToolbarButton / ToolbarSelect / ToolbarGroup。
// 同一 ToolbarGroup 内自动共享尺寸，避免各处高度参差。

export type ToolbarSize = 'xs' | 'sm' | 'md'

const ToolbarSizeCtx = createContext<ToolbarSize>('sm')

const sizeMap = {
  xs: { h: 'h-6', text: 'text-[11px]', padX: 'px-1.5', icon: 'h-3 w-3', gap: 'gap-1' },
  sm: { h: 'h-7', text: 'text-[12px]', padX: 'px-2', icon: 'h-3.5 w-3.5', gap: 'gap-1.5' },
  md: { h: 'h-8', text: 'text-[13px]', padX: 'px-2.5', icon: 'h-4 w-4', gap: 'gap-1.5' },
} satisfies Record<ToolbarSize, { h: string; text: string; padX: string; icon: string; gap: string }>

export function useToolbarSize(): ToolbarSize {
  return useContext(ToolbarSizeCtx)
}

export function toolbarIconCls(size: ToolbarSize): string {
  return sizeMap[size].icon
}

interface ToolbarGroupProps extends HTMLAttributes<HTMLDivElement> {
  size?: ToolbarSize
  withDivider?: boolean
  children?: ReactNode
}

export function ToolbarGroup({
  size = 'sm',
  withDivider,
  className,
  children,
  ...rest
}: ToolbarGroupProps) {
  return (
    <ToolbarSizeCtx.Provider value={size}>
      <div
        className={cn(
          'flex items-center',
          sizeMap[size].gap,
          withDivider && 'border-l border-neutral-200 pl-2 ml-1',
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    </ToolbarSizeCtx.Provider>
  )
}

const buttonVariants = cva(
  cn(
    'inline-flex shrink-0 items-center justify-center rounded-md border font-medium',
    'transition-colors box-border',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
    'disabled:cursor-not-allowed disabled:opacity-40',
  ),
  {
    variants: {
      tone: {
        default:
          'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900',
        primary: 'border-brand-600 bg-brand-600 text-white hover:bg-brand-500',
        ghost:
          'border-transparent bg-transparent text-neutral-700 hover:bg-neutral-200/60',
        soft: 'border-transparent bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 focus-visible:ring-0',
        warning:
          'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100',
        info: 'border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100',
        danger: 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
      },
      size: {
        xs: cn(sizeMap.xs.h, sizeMap.xs.text, sizeMap.xs.gap),
        sm: cn(sizeMap.sm.h, sizeMap.sm.text, sizeMap.sm.gap),
        md: cn(sizeMap.md.h, sizeMap.md.text, sizeMap.md.gap),
      },
      iconOnly: {
        true: 'aspect-square p-0',
        false: '',
      },
    },
    compoundVariants: [
      { iconOnly: false, size: 'xs', class: sizeMap.xs.padX },
      { iconOnly: false, size: 'sm', class: sizeMap.sm.padX },
      { iconOnly: false, size: 'md', class: sizeMap.md.padX },
      { iconOnly: true, size: 'xs', class: 'w-6' },
      { iconOnly: true, size: 'sm', class: 'w-7' },
      { iconOnly: true, size: 'md', class: 'w-8' },
    ],
    defaultVariants: { tone: 'default', size: 'sm', iconOnly: false },
  },
)

export interface ToolbarButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'>,
    Omit<VariantProps<typeof buttonVariants>, 'size'> {
  size?: ToolbarSize
  active?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function ToolbarButton({
  className,
  tone,
  iconOnly,
  size,
  active,
  type = 'button',
  ref,
  ...rest
}: ToolbarButtonProps) {
  const ctxSize = useToolbarSize()
  const finalSize = size ?? ctxSize
  const finalTone = active && (tone == null || tone === 'default') ? 'info' : tone
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ tone: finalTone, size: finalSize, iconOnly }), className)}
      {...rest}
    />
  )
}

export interface ToolbarSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: ToolbarSize
  ref?: Ref<HTMLSelectElement>
}

export function ToolbarSelect({
  className,
  size,
  children,
  ref,
  ...rest
}: ToolbarSelectProps) {
  const ctxSize = useToolbarSize()
  const finalSize = size ?? ctxSize
  const m = sizeMap[finalSize]
  return (
    <select
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border border-neutral-200 bg-white text-neutral-700',
        'transition-colors box-border appearance-none',
        'pr-6 bg-no-repeat bg-[right_0.4rem_center]',
        "bg-[url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%23737373'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E\")]",
        'hover:bg-neutral-100 hover:text-neutral-900',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        'disabled:cursor-not-allowed disabled:opacity-40',
        m.h,
        m.text,
        m.padX,
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
}

interface ToolbarLabelProps extends HTMLAttributes<HTMLSpanElement> {
  size?: ToolbarSize
  mono?: boolean
}

export function ToolbarLabel({ className, size, mono, ...rest }: ToolbarLabelProps) {
  const ctxSize = useToolbarSize()
  const finalSize = size ?? ctxSize
  const m = sizeMap[finalSize]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center text-neutral-500',
        m.h,
        m.text,
        mono && 'font-mono tabular-nums',
        className,
      )}
      {...rest}
    />
  )
}
