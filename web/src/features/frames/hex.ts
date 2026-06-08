/**
 * 严格解析 hex 字符串。
 * - 允许空格 / Tab / 换行作为分隔符，会被剔除
 * - 字符必须是 [0-9a-fA-F]，长度必须为偶数
 * - 任何不合规返回 null，由调用方提示错误
 */
export function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length === 0) return new Uint8Array(0);
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}
