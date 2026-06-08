import { cn } from '../lib/cn'

type Method = string

const METHOD_STYLE: Record<string, string> = {
  GET: 'border-blue-400/50    text-blue-600    bg-blue-50/40    dark:border-blue-500/40    dark:text-blue-300    dark:bg-blue-500/10',
  POST: 'border-emerald-400/50 text-emerald-600 bg-emerald-50/40 dark:border-emerald-500/40 dark:text-emerald-300 dark:bg-emerald-500/10',
  PUT: 'border-amber-400/60   text-amber-700   bg-amber-50/40   dark:border-amber-500/40   dark:text-amber-300   dark:bg-amber-500/10',
  DELETE:
    'border-red-400/50     text-red-600     bg-red-50/40     dark:border-red-500/40     dark:text-red-300     dark:bg-red-500/10',
  PATCH:
    'border-purple-400/50  text-purple-600  bg-purple-50/40  dark:border-purple-500/40  dark:text-purple-300  dark:bg-purple-500/10',
  HEAD: 'border-neutral-300    text-neutral-500 bg-transparent   dark:border-neutral-600    dark:text-neutral-400 dark:bg-transparent',
  OPTIONS:
    'border-neutral-300    text-neutral-500 bg-transparent   dark:border-neutral-600    dark:text-neutral-400 dark:bg-transparent',
}

function getStyle(method: Method): string {
  return METHOD_STYLE[method.toUpperCase()] ?? METHOD_STYLE['OPTIONS']!
}

interface Props {
  method: Method
  className?: string
}

export function MethodBadge({ method, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold font-mono tracking-wider leading-none',
        getStyle(method),
        className,
      )}
    >
      {method.toUpperCase()}
    </span>
  )
}
