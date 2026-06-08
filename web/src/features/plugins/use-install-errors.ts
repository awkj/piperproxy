/**
 * use-install-errors.ts
 *
 * 插件安装错误来源（Track B 后续通过 SSE system.status 事件推送）。
 * 当前实现：始终返回空对象（无安装错误）。
 */

/** 返回每个插件名对应的安装错误（仅有错误时才有条目）。 */
export function useInstallErrors(): Record<string, string> {
  return {};
}
