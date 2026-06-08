import type { CaptureItem } from '../../types'
import type { FilterClause, FilterSet } from '../../stores/searchFilters'

function matchOp(op: FilterClause['op'], haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase()
  const n = needle.toLowerCase()
  switch (op) {
    case 'contains':
      return h.includes(n)
    case 'not_contains':
      return !h.includes(n)
    case 'equals':
      return h === n
    case 'not_equals':
      return h !== n
    case 'starts_with':
      return h.startsWith(n)
    case 'ends_with':
      return h.endsWith(n)
    case 'wildcard': {
      const pattern = n
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
      try {
        return new RegExp(`^${pattern}$`).test(h)
      } catch {
        return false
      }
    }
    case 'regex': {
      try {
        return new RegExp(needle, 'i').test(haystack)
      } catch {
        return false
      }
    }
    default:
      return true
  }
}

function getFieldValue(item: CaptureItem, clause: FilterClause): string {
  switch (clause.field) {
    case 'url':
      return item.url ?? ''
    case 'method':
      return item.method ?? ''
    case 'req_ct':
      return item.req?.headers?.['content-type'] ?? item.req?.headers?.['Content-Type'] ?? ''
    case 'req_header': {
      if (!clause.fieldArg) {
        return Object.values(item.req?.headers ?? {}).join('\n')
      }
      const name = clause.fieldArg.toLowerCase()
      const headers = item.req?.headers ?? {}
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === name) return String(v)
      }
      return ''
    }
    case 'req_body':
      return item.req?.body ?? ''
    case 'res_ct':
      return item.res?.headers?.['content-type'] ?? item.res?.headers?.['Content-Type'] ?? ''
    case 'res_header': {
      if (!clause.fieldArg) {
        return Object.values(item.res?.headers ?? {}).join('\n')
      }
      const name = clause.fieldArg.toLowerCase()
      const headers = item.res?.headers ?? {}
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === name) return String(v)
      }
      return ''
    }
    case 'res_body':
      return item.res?.body ?? ''
    case 'status':
      return String(item.res?.statusCode ?? '')
    case 'client_ip':
      return item.clientIp ?? ''
    case 'server_ip':
      return item.hostIp ?? ''
    case 'highlight':
      return item.highlighted ? 'true' : 'false'
    case 'comment':
      return item.comment ?? ''
    case 'process':
      return item.processName ?? ''
    default:
      return ''
  }
}

export function matchesFilterSet(item: CaptureItem, filterSet: FilterSet): boolean {
  if (filterSet.clauses.length === 0) return true
  if (filterSet.combinator === 'AND') {
    return filterSet.clauses.every((clause) => {
      if (!clause.value && clause.field !== 'highlight') return true
      return matchOp(clause.op, getFieldValue(item, clause), clause.value)
    })
  }
  return filterSet.clauses.some((clause) => {
    if (!clause.value && clause.field !== 'highlight') return true
    return matchOp(clause.op, getFieldValue(item, clause), clause.value)
  })
}
