/**
 * body 编码识别工具
 *
 * 复刻老栈 decode.js + is-utf8.js 的逻辑：
 *   base64 → Uint8Array → isUtf8 校验 → utf-8 解码 or GBK 兜底
 *
 * 依赖：浏览器原生 atob / TextDecoder，不引第三方库。
 */

const MAX_UTF8_CHECK_LEN = 1024 * 32;

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

/**
 * 将标准 base64 字符串解码为 Uint8Array。
 * 使用浏览器内置 atob，后端保证返回的是标准 base64。
 * 解码失败返回 null。
 */
export function base64ToBytes(b64: string): Uint8Array | null {
  if (!b64) return null;
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * 将普通字符串转换为 Uint8Array（Latin-1 / binary 字符串，每个字符对应一个字节）。
 */
export function stringToBytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// isUtf8 —— 复刻 biz/webui/htdocs/src/js/is-utf8.js
// ---------------------------------------------------------------------------

function isUtf8Inner(buf: Uint8Array, start: number): boolean {
  const len = Math.min(buf.length, MAX_UTF8_CHECK_LEN);
  let i = start;
  while (i < len) {
    const byte = buf[i];
    // ASCII 及合法控制字符（tab、LF、CR）
    if (
      byte === 0x09 ||
      byte === 0x0a ||
      byte === 0x0d ||
      (0x20 <= byte && byte <= 0x7f)
    ) {
      i++;
      continue;
    }

    // 2 字节序列 (0xC2–0xDF)
    i++;
    const byte1 = buf[i];
    if (0xc2 <= byte && byte <= 0xdf) {
      if (0x80 <= byte1 && byte1 <= 0xbf) {
        i++;
        continue;
      }
      return !byte1;
    }

    // 3 字节序列
    i++;
    const byte2 = buf[i];
    if (byte === 0xe0) {
      if (0xa0 <= byte1 && byte1 <= 0xbf && 0x80 <= byte2 && byte2 <= 0xbf) {
        i++;
        continue;
      }
      return !byte2;
    }
    if ((0xe1 <= byte && byte <= 0xec) || byte === 0xee || byte === 0xef) {
      if (0x80 <= byte1 && byte1 <= 0xbf && 0x80 <= byte2 && byte2 <= 0xbf) {
        i++;
        continue;
      }
      return !byte2;
    }
    if (byte === 0xed) {
      if (0x80 <= byte1 && byte1 <= 0x9f && 0x80 <= byte2 && byte2 <= 0xbf) {
        i++;
        continue;
      }
      return !byte2;
    }

    // 4 字节序列
    i++;
    const byte3 = buf[i];
    if (byte === 0xf0) {
      if (
        0x90 <= byte1 &&
        byte1 <= 0xbf &&
        0x80 <= byte2 &&
        byte2 <= 0xbf &&
        0x80 <= byte3 &&
        byte3 <= 0xbf
      ) {
        i++;
        continue;
      }
      return !byte3;
    }
    if (0xf1 <= byte && byte <= 0xf3) {
      if (
        0x80 <= byte1 &&
        byte1 <= 0xbf &&
        0x80 <= byte2 &&
        byte2 <= 0xbf &&
        0x80 <= byte3 &&
        byte3 <= 0xbf
      ) {
        i++;
        continue;
      }
      return !byte3;
    }
    if (byte === 0xf4) {
      if (
        0x80 <= byte1 &&
        byte1 <= 0x8f &&
        0x80 <= byte2 &&
        byte2 <= 0xbf &&
        0x80 <= byte3 &&
        byte3 <= 0xbf
      ) {
        i++;
        continue;
      }
      return !byte3;
    }

    return false;
  }
  return true;
}

/**
 * 判断字节数组是否为合法的 UTF-8 编码。
 * 复刻老栈 is-utf8.js：先从 0 开始校验，失败时再从 offset 5 试一次（BOM/特殊头兼容）。
 */
export function isUtf8(bytes: Uint8Array): boolean {
  if (isUtf8Inner(bytes, 0)) return true;
  // 老栈兜底：buf[0] === 0 时从 offset 5 再校验
  return bytes[0] === 0 && isUtf8Inner(bytes, 5);
}

// ---------------------------------------------------------------------------
// TextDecoder 实例（复用）
// ---------------------------------------------------------------------------

let utf8Decoder: TextDecoder | null = null;
let gbkDecoder: TextDecoder | null = null;

function getUtf8Decoder(): TextDecoder {
  if (!utf8Decoder) utf8Decoder = new TextDecoder('utf-8');
  return utf8Decoder;
}

function getGbkDecoder(): TextDecoder | null {
  if (gbkDecoder !== undefined) return gbkDecoder;
  try {
    gbkDecoder = new TextDecoder('GB18030', { fatal: false });
  } catch {
    gbkDecoder = null;
  }
  return gbkDecoder;
}

// ---------------------------------------------------------------------------
// 高层 API
// ---------------------------------------------------------------------------

/**
 * 将字节数组解码为文本。
 * 先尝试 UTF-8（字节级校验），不合法时回落到 GBK/GB18030。
 */
export function decodeText(bytes: Uint8Array): string {
  if (isUtf8(bytes)) {
    try {
      return getUtf8Decoder().decode(bytes);
    } catch {
      // fallthrough
    }
  }
  const gbk = getGbkDecoder();
  if (gbk) {
    try {
      return gbk.decode(bytes);
    } catch {
      // fallthrough
    }
  }
  // 最终兜底：逐字节转字符（Latin-1）
  return Array.from(bytes, (b) => String.fromCharCode(b)).join('');
}

/**
 * 高层封装：base64 字符串 → 字节数组 → UTF-8/GBK 文本。
 * 失败返回空字符串。
 */
export function decodeBase64(b64: string): string {
  if (!b64) return '';
  const bytes = base64ToBytes(b64);
  if (!bytes) return '';
  return decodeText(bytes);
}
