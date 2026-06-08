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
} from '@codemirror/autocomplete';
import {
  ALIAS_PROTOCOLS,
  classifyRuleName,
  getAllRuleNames,
  type RuleCategory,
} from './protocols';
import {
  DEFAULT_SUB_HINT_LABELS,
  DEFAULT_VAR_HINT_LABELS,
  SUB_HINT_GROUPS,
  type SubHintCategory,
  type SubHintGroup,
  type SubHintLabels,
  type VarHintLabels,
} from './hints';

/** RuleName 分类对应的 UI 文案（候选项右侧 detail）。 */
export type CategoryLabels = Readonly<Record<RuleCategory, string>>;

/** 默认英文文案；i18n 缺失时兜底。 */
export const DEFAULT_CATEGORY_LABELS: CategoryLabels = {
  host: 'host',
  req: 'request',
  res: 'response',
  proxy: 'proxy',
  plugin: 'plugin',
  filter: 'filter',
  control: 'control',
  misc: 'misc',
};

// 一个 token 内允许的字符（与 rules-hint.js 的 `WORD = /\S+/` 等价：非空白）
// 真实匹配 token：从光标向左走到上一个空白/`|`/行首。
const TOKEN_BOUNDARY_RE = /[\s|]/;

/** 调用方提供的变量数据来源（值名 / 插件名 / 插件变量映射）。 */
export interface VarHintProvider {
  /** values 名列表（用于 `${name}` / `\`{name}\`` 补全 + `@name` 文件引用）。 */
  getValueNames?: () => readonly string[];
  /** 已安装插件名列表（不带 `whistle.` 前缀，不带尾随 `:`）。 */
  getPluginNames?: () => readonly string[];
  /** 给定插件名返回它声明的 pluginVars（`%pluginName.xxx`）。 */
  getPluginVars?: (pluginName: string) => readonly string[] | undefined;
}

interface BuildOpts {
  /** RuleName 分类的本地化文案。 */
  labels?: Partial<CategoryLabels>;
  /** 协议子选项分类的本地化文案。 */
  subLabels?: Partial<SubHintLabels>;
  /** 变量补全分类的本地化文案。 */
  varLabels?: Partial<VarHintLabels>;
  /** 变量数据提供者（不传则跳过变量补全）。 */
  varProvider?: VarHintProvider;
}

/**
 * 构造 RuleName 候选数组。每项使用 `name://` 作为 apply 文本，
 * 因为大部分内置 RuleName 后续都跟 `://`（与老栈行为一致）。
 */
function buildRuleNameCompletions(labels: CategoryLabels): Completion[] {
  return getAllRuleNames().map((name) => {
    const realName = ALIAS_PROTOCOLS[name] ?? name;
    const category = classifyRuleName(realName);
    return {
      label: name,
      apply: `${name}://`,
      type: category, // CM6 用 type 给候选加图标 / class
      detail: labels[category],
      boost: name === realName ? 0 : -1, // 别名优先级稍低
    };
  });
}

/** 把 SUB_HINT_GROUPS 预编译成 protocol -> Completion[] 映射。 */
function buildSubHintCompletions(
  labels: SubHintLabels,
): Map<string, Completion[]> {
  const map = new Map<string, Completion[]>();
  for (const group of SUB_HINT_GROUPS) {
    map.set(group.protocol, group.hints.map((hint) => buildSubCompletion(group, hint, labels)));
  }
  return map;
}

function buildSubCompletion(
  group: SubHintGroup,
  hint: string,
  labels: SubHintLabels,
): Completion {
  return {
    label: hint,
    apply: hint,
    type: subHintCmType(group.category),
    detail: labels[group.category],
  };
}

/** 把子分类映射到 CM6 的 type（与 RuleCategory 对齐，便于复用图标 class）。 */
function subHintCmType(c: SubHintCategory): string {
  switch (c) {
    case 'filter':
      return 'filter';
    case 'header':
      return 'res';
    case 'delete':
      return 'control';
    case 'lineProps':
      return 'control';
    case 'enable':
      return 'control';
    case 'disable':
      return 'control';
  }
}

/**
 * 找到光标前的 token 起点。
 * 返回 `[from, word]`；若 token 为空且不是显式触发则返回 null。
 */
function readToken(context: CompletionContext): { from: number; word: string } {
  const { state, pos } = context;
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);

  let start = before.length;
  while (start > 0 && !TOKEN_BOUNDARY_RE.test(before[start - 1])) {
    start--;
  }
  return { from: line.from + start, word: before.slice(start) };
}

/** 判断当前行光标位置是否在注释里。 */
function isInComment(context: CompletionContext): boolean {
  const { state, pos } = context;
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  const hashIdx = before.indexOf('#');
  return hashIdx !== -1;
}

/**
 * 尝试匹配协议子选项触发：返回触发的 group 与子 token（已剥离协议头）。
 * 否则返回 null。
 *
 * 规则：当前 token 必须以 SUB_HINT_GROUPS 中某个 protocol 开头，
 * protocol 后面的部分（subToken）作为补全输入。subToken 中如果含 `=` / `:`
 * 则不再补全（已经在写值）——除了 header / filter 这种本身格式就含 `:` 的。
 */
function matchSubHint(
  word: string,
): { group: SubHintGroup; subToken: string } | null {
  for (const group of SUB_HINT_GROUPS) {
    if (word.startsWith(group.protocol)) {
      const subToken = word.slice(group.protocol.length);
      // header replace / filter 的 hint 文本本身含 `:` / `=`，子 token 仍可补全。
      // 其它分类一旦出现 `=` 就视为正在写参数值，停止补全。
      if (
        group.category !== 'filter' &&
        group.category !== 'header' &&
        /[=]/.test(subToken)
      ) {
        return null;
      }
      return { group, subToken };
    }
  }
  return null;
}

/** 模糊匹配 hint：subToken 子串匹配（大小写不敏感）。 */
function filterSubHints(
  hints: Completion[],
  subToken: string,
): Completion[] {
  if (!subToken) return hints;
  const kw = subToken.toLowerCase();
  return hints.filter((h) => h.label.toLowerCase().includes(kw));
}

/** RuleName 补全 source。 */
function buildRuleNameSource(completions: Completion[]) {
  return (context: CompletionContext): CompletionResult | null => {
    if (isInComment(context)) return null;
    const { from, word } = readToken(context);

    // 跳过否定前缀 `!`
    let realFrom = from;
    let realWord = word;
    if (realWord.startsWith('!')) {
      realFrom += 1;
      realWord = realWord.slice(1);
    }

    // 已经出现 `://`（或部分协议头），交给其他补全
    if (realWord.includes('://')) return null;
    // 以特殊前缀 `@` / `%` / `${` 开头：交给变量补全
    if (
      realWord.startsWith('@') ||
      realWord.startsWith('%') ||
      realWord.startsWith('${') ||
      realWord.startsWith('`{')
    ) {
      return null;
    }
    // 包含 `:` 但还没到 `://`：丢弃
    if (realWord.includes(':')) return null;

    if (!realWord) {
      if (!context.explicit) return null;
      return {
        from: realFrom,
        to: context.pos,
        options: completions,
        validFor: /^[\w-]*$/,
      };
    }
    if (!/^[A-Za-z][\w-]*$/.test(realWord)) return null;

    return {
      from: realFrom,
      to: context.pos,
      options: completions,
      validFor: /^[\w-]*$/,
    };
  };
}

/** 协议子选项补全 source。 */
function buildSubHintSource(map: Map<string, Completion[]>) {
  return (context: CompletionContext): CompletionResult | null => {
    if (isInComment(context)) return null;
    const { from, word } = readToken(context);
    let realFrom = from;
    let realWord = word;
    if (realWord.startsWith('!')) {
      realFrom += 1;
      realWord = realWord.slice(1);
    }
    const matched = matchSubHint(realWord);
    if (!matched) return null;
    const { group, subToken } = matched;
    const all = map.get(group.protocol);
    if (!all || !all.length) return null;
    const subFrom = realFrom + group.protocol.length;
    const filtered = filterSubHints(all, subToken);
    if (!filtered.length && !context.explicit) return null;
    return {
      from: subFrom,
      to: context.pos,
      options: filtered.length ? filtered : all,
      // 用户继续输入仍命中 hint 文本中的合法字符（含 `.`、`-`、`<`、`>` 等）。
      validFor: /^[\w.\-<>:=()|/`]*$/,
    };
  };
}

/** 变量补全：处理 `${`、`\`{`、`@`、`%plugin.var`。 */
function buildVarHintSource(opts: {
  varLabels: VarHintLabels;
  provider: VarHintProvider;
}) {
  const { varLabels, provider } = opts;

  function makeValueCompletions(): Completion[] {
    const names = provider.getValueNames?.() ?? [];
    return names.map((name) => ({
      label: name,
      apply: name,
      type: 'misc',
      detail: varLabels.value,
    }));
  }

  function makePluginCompletions(): Completion[] {
    const names = provider.getPluginNames?.() ?? [];
    return names.map((name) => ({
      label: name,
      apply: name,
      type: 'plugin',
      detail: varLabels.plugin,
    }));
  }

  function makePluginVarCompletions(pluginName: string): Completion[] {
    const vars = provider.getPluginVars?.(pluginName) ?? [];
    return vars.map((v) => ({
      label: v,
      apply: v,
      type: 'plugin',
      detail: varLabels.pluginVar,
    }));
  }

  return (context: CompletionContext): CompletionResult | null => {
    if (isInComment(context)) return null;
    const { from, word } = readToken(context);
    let realFrom = from;
    let realWord = word;
    if (realWord.startsWith('!')) {
      realFrom += 1;
      realWord = realWord.slice(1);
    }
    if (!realWord) return null;

    // 1) `@name` —— values 名（@ 开头的 file 引用）
    if (realWord.startsWith('@')) {
      const sub = realWord.slice(1);
      // `@` 不能含 `/` `:` 等
      if (/[/:]/.test(sub)) return null;
      const options = makeValueCompletions();
      if (!options.length) return null;
      return {
        from: realFrom + 1,
        to: context.pos,
        options,
        validFor: /^[\w.\-]*$/,
      };
    }

    // 2) `${name}` 或 `\`{name}\`` —— values 名引用
    //   匹配模式（参考老栈 VAL_RE）：
    //     可选协议头 `proto://`，可选反引号，`{`，<key>，可选 `}`+反引号
    //   token 末段未闭合的 `${` / `\`{` 之后即开始候选
    const tplMatch = realWord.match(
      /(?:^|[^\\])(?:\$\{|`\{)([^\s{}`]*)$/,
    );
    if (tplMatch) {
      const sub = tplMatch[1];
      const options = makeValueCompletions();
      if (!options.length) return null;
      const openerIdxFromWordEnd = realWord.length - sub.length;
      return {
        from: realFrom + openerIdxFromWordEnd,
        to: context.pos,
        options,
        validFor: /^[\w.\-]*$/,
      };
    }

    // 3) `%pluginName.varName` 或 `%pluginName=value` 时光标位于 pluginName / varName
    if (realWord.startsWith('%')) {
      const sub = realWord.slice(1);
      const dotIdx = sub.indexOf('.');
      const eqIdx = sub.indexOf('=');
      // 还在写 plugin 名（没出现 `.` 或 `=`）：建议 plugin 列表
      if (dotIdx === -1 && eqIdx === -1) {
        const options = makePluginCompletions();
        if (!options.length) return null;
        return {
          from: realFrom + 1,
          to: context.pos,
          options,
          validFor: /^[\w.\-]*$/,
        };
      }
      // 已经写到 `.var`：建议 pluginVars
      if (dotIdx !== -1 && (eqIdx === -1 || dotIdx < eqIdx)) {
        const pluginName = sub.slice(0, dotIdx);
        const varToken = sub.slice(dotIdx + 1);
        // 不能再含 `.` / `=`
        if (/[.=]/.test(varToken)) return null;
        const options = makePluginVarCompletions(pluginName);
        if (!options.length) return null;
        return {
          from: realFrom + 1 + dotIdx + 1,
          to: context.pos,
          options,
          validFor: /^[\w\-]*$/,
        };
      }
      return null;
    }

    return null;
  };
}

/**
 * 创建 whistle 自动补全扩展：RuleName + 协议子选项 + 变量。
 * @param opts.labels    RuleName 分类文案
 * @param opts.subLabels 协议子选项分类文案
 * @param opts.varLabels 变量补全分类文案
 * @param opts.varProvider 变量数据来源（不传则不启用变量补全）
 */
export function createWhistleAutocompletion(opts: BuildOpts = {}) {
  const labels: CategoryLabels = {
    ...DEFAULT_CATEGORY_LABELS,
    ...opts.labels,
  };
  const subLabels: SubHintLabels = {
    ...DEFAULT_SUB_HINT_LABELS,
    ...opts.subLabels,
  };
  const varLabels: VarHintLabels = {
    ...DEFAULT_VAR_HINT_LABELS,
    ...opts.varLabels,
  };

  const ruleNameCompletions = buildRuleNameCompletions(labels);
  const subHintMap = buildSubHintCompletions(subLabels);

  const sources = [
    buildSubHintSource(subHintMap),
    buildRuleNameSource(ruleNameCompletions),
  ];
  if (opts.varProvider) {
    sources.unshift(
      buildVarHintSource({ varLabels, provider: opts.varProvider }),
    );
  }

  return autocompletion({
    override: sources,
    activateOnTyping: true,
    defaultKeymap: true,
    icons: false,
  });
}
