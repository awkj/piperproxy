// CM6 自动补全：whistle Rules DSL 内置 RuleName + 协议子选项 + 变量补全。
//
// 触发条件参考老栈 `biz/webui/htdocs/src/js/rules-hint.js`：
//   - 行首/`|`/空白后输入字母时弹出 RuleName 候选
//   - `enable://` / `disable://` / `delete://` / `lineProps://` /
//     `headerReplace://` / `filter://` / `includeFilter://` / `excludeFilter://`
//     后弹该协议允许的子选项
//   - `${` / `\`{` 后弹 values 候选；`@` 后弹 values（@ 开头的 file 引用）；
//     `%plugin.xxx` 后弹插件变量名（数据可由调用方注入）
//   - 在 `#` 注释里不触发
// 候选项展示 `name://` 形式 + 类型分类（host / req / res / proxy / ...）。

import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from '@codemirror/autocomplete'
import {
  ALIAS_PROTOCOLS,
  classifyRuleName,
  getAllRuleNames,
  type RuleCategory,
} from './protocols'
import {
  DEFAULT_SUB_HINT_LABELS,
  DEFAULT_VAR_HINT_LABELS,
  SUB_HINT_GROUPS,
  type SubHintCategory,
  type SubHintGroup,
  type SubHintLabels,
  type VarHintLabels,
} from './hints'

export type CategoryLabels = Readonly<Record<RuleCategory, string>>

export const DEFAULT_CATEGORY_LABELS: CategoryLabels = {
  host: 'host',
  req: 'request',
  res: 'response',
  proxy: 'proxy',
  plugin: 'plugin',
  filter: 'filter',
  control: 'control',
  misc: 'misc',
}

const TOKEN_BOUNDARY_RE = /[\s|]/

export interface VarHintProvider {
  getValueNames?: () => readonly string[]
  getPluginNames?: () => readonly string[]
  getPluginVars?: (pluginName: string) => readonly string[] | undefined
}

interface BuildOpts {
  labels?: Partial<CategoryLabels>
  subLabels?: Partial<SubHintLabels>
  varLabels?: Partial<VarHintLabels>
  varProvider?: VarHintProvider
}

function buildRuleNameCompletions(labels: CategoryLabels): Completion[] {
  return getAllRuleNames().map((name) => {
    const realName = ALIAS_PROTOCOLS[name] ?? name
    const category = classifyRuleName(realName)
    return {
      label: name,
      apply: `${name}://`,
      type: category,
      detail: labels[category],
      boost: name === realName ? 0 : -1,
    }
  })
}

function buildSubHintCompletions(labels: SubHintLabels): Map<string, Completion[]> {
  const map = new Map<string, Completion[]>()
  for (const group of SUB_HINT_GROUPS) {
    map.set(group.protocol, group.hints.map((hint) => buildSubCompletion(group, hint, labels)))
  }
  return map
}

function buildSubCompletion(group: SubHintGroup, hint: string, labels: SubHintLabels): Completion {
  return {
    label: hint,
    apply: hint,
    type: subHintCmType(group.category),
    detail: labels[group.category],
  }
}

function subHintCmType(c: SubHintCategory): string {
  switch (c) {
    case 'filter':
      return 'filter'
    case 'header':
      return 'res'
    case 'delete':
      return 'control'
    case 'lineProps':
      return 'control'
    case 'enable':
      return 'control'
    case 'disable':
      return 'control'
  }
}

function readToken(context: CompletionContext): { from: number; word: string } {
  const { state, pos } = context
  const line = state.doc.lineAt(pos)
  const before = line.text.slice(0, pos - line.from)

  let start = before.length
  while (start > 0 && !TOKEN_BOUNDARY_RE.test(before[start - 1])) {
    start--
  }
  return { from: line.from + start, word: before.slice(start) }
}

function isInComment(context: CompletionContext): boolean {
  const { state, pos } = context
  const line = state.doc.lineAt(pos)
  const before = line.text.slice(0, pos - line.from)
  const hashIdx = before.indexOf('#')
  return hashIdx !== -1
}

function matchSubHint(word: string): { group: SubHintGroup; subToken: string } | null {
  for (const group of SUB_HINT_GROUPS) {
    if (word.startsWith(group.protocol)) {
      const subToken = word.slice(group.protocol.length)
      if (
        group.category !== 'filter' &&
        group.category !== 'header' &&
        /[=]/.test(subToken)
      ) {
        return null
      }
      return { group, subToken }
    }
  }
  return null
}

function filterSubHints(hints: Completion[], subToken: string): Completion[] {
  if (!subToken) return hints
  const kw = subToken.toLowerCase()
  return hints.filter((h) => h.label.toLowerCase().includes(kw))
}

function buildRuleNameSource(completions: Completion[]) {
  return (context: CompletionContext): CompletionResult | null => {
    if (isInComment(context)) return null
    const { from, word } = readToken(context)

    let realFrom = from
    let realWord = word
    if (realWord.startsWith('!')) {
      realFrom += 1
      realWord = realWord.slice(1)
    }

    if (realWord.includes('://')) return null
    if (
      realWord.startsWith('@') ||
      realWord.startsWith('%') ||
      realWord.startsWith('${') ||
      realWord.startsWith('`{')
    ) {
      return null
    }
    if (realWord.includes(':')) return null

    if (!realWord) {
      if (!context.explicit) return null
      return {
        from: realFrom,
        to: context.pos,
        options: completions,
        validFor: /^[\w-]*$/,
      }
    }
    if (!/^[A-Za-z][\w-]*$/.test(realWord)) return null

    return {
      from: realFrom,
      to: context.pos,
      options: completions,
      validFor: /^[\w-]*$/,
    }
  }
}

function buildSubHintSource(map: Map<string, Completion[]>) {
  return (context: CompletionContext): CompletionResult | null => {
    if (isInComment(context)) return null
    const { from, word } = readToken(context)
    let realFrom = from
    let realWord = word
    if (realWord.startsWith('!')) {
      realFrom += 1
      realWord = realWord.slice(1)
    }
    const matched = matchSubHint(realWord)
    if (!matched) return null
    const { group, subToken } = matched
    const all = map.get(group.protocol)
    if (!all || !all.length) return null
    const subFrom = realFrom + group.protocol.length
    const filtered = filterSubHints(all, subToken)
    if (!filtered.length && !context.explicit) return null
    return {
      from: subFrom,
      to: context.pos,
      options: filtered.length ? filtered : all,
      validFor: /^[\w.\-<>:=()|/`]*$/,
    }
  }
}

function buildVarHintSource(opts: { varLabels: VarHintLabels; provider: VarHintProvider }) {
  const { varLabels, provider } = opts

  function makeValueCompletions(): Completion[] {
    const names = provider.getValueNames?.() ?? []
    return names.map((name) => ({
      label: name,
      apply: name,
      type: 'misc',
      detail: varLabels.value,
    }))
  }

  function makePluginCompletions(): Completion[] {
    const names = provider.getPluginNames?.() ?? []
    return names.map((name) => ({
      label: name,
      apply: name,
      type: 'plugin',
      detail: varLabels.plugin,
    }))
  }

  function makePluginVarCompletions(pluginName: string): Completion[] {
    const vars = provider.getPluginVars?.(pluginName) ?? []
    return vars.map((v) => ({
      label: v,
      apply: v,
      type: 'plugin',
      detail: varLabels.pluginVar,
    }))
  }

  return (context: CompletionContext): CompletionResult | null => {
    if (isInComment(context)) return null
    const { from, word } = readToken(context)
    let realFrom = from
    let realWord = word
    if (realWord.startsWith('!')) {
      realFrom += 1
      realWord = realWord.slice(1)
    }
    if (!realWord) return null

    if (realWord.startsWith('@')) {
      const sub = realWord.slice(1)
      if (/[/:]/.test(sub)) return null
      const options = makeValueCompletions()
      if (!options.length) return null
      return {
        from: realFrom + 1,
        to: context.pos,
        options,
        validFor: /^[\w.\-]*$/,
      }
    }

    const tplMatch = realWord.match(/(?:^|[^\\])(?:\$\{|`\{)([^\s{}`]*)$/)
    if (tplMatch) {
      const sub = tplMatch[1]
      const options = makeValueCompletions()
      if (!options.length) return null
      const openerIdxFromWordEnd = realWord.length - sub.length
      return {
        from: realFrom + openerIdxFromWordEnd,
        to: context.pos,
        options,
        validFor: /^[\w.\-]*$/,
      }
    }

    if (realWord.startsWith('%')) {
      const sub = realWord.slice(1)
      const dotIdx = sub.indexOf('.')
      const eqIdx = sub.indexOf('=')
      if (dotIdx === -1 && eqIdx === -1) {
        const options = makePluginCompletions()
        if (!options.length) return null
        return {
          from: realFrom + 1,
          to: context.pos,
          options,
          validFor: /^[\w.\-]*$/,
        }
      }
      if (dotIdx !== -1 && (eqIdx === -1 || dotIdx < eqIdx)) {
        const pluginName = sub.slice(0, dotIdx)
        const varToken = sub.slice(dotIdx + 1)
        if (/[.=]/.test(varToken)) return null
        const options = makePluginVarCompletions(pluginName)
        if (!options.length) return null
        return {
          from: realFrom + 1 + dotIdx + 1,
          to: context.pos,
          options,
          validFor: /^[\w\-]*$/,
        }
      }
      return null
    }

    return null
  }
}

export function createWhistleAutocompletion(opts: BuildOpts = {}) {
  const labels: CategoryLabels = {
    ...DEFAULT_CATEGORY_LABELS,
    ...opts.labels,
  }
  const subLabels: SubHintLabels = {
    ...DEFAULT_SUB_HINT_LABELS,
    ...opts.subLabels,
  }
  const varLabels: VarHintLabels = {
    ...DEFAULT_VAR_HINT_LABELS,
    ...opts.varLabels,
  }

  const ruleNameCompletions = buildRuleNameCompletions(labels)
  const subHintMap = buildSubHintCompletions(subLabels)

  const sources = [
    buildSubHintSource(subHintMap),
    buildRuleNameSource(ruleNameCompletions),
  ]
  if (opts.varProvider) {
    sources.unshift(buildVarHintSource({ varLabels, provider: opts.varProvider }))
  }

  return autocompletion({
    override: sources,
    activateOnTyping: true,
    defaultKeymap: true,
    icons: false,
  })
}
