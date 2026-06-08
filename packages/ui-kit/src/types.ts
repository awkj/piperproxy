// 核心抓包类型，与 server/api/types.go 保持字段对齐。
// 此文件内容等价于 web/src/api/types.gen.ts 中 network 相关部分，
// 供 ui-kit 内 stores / components 独立使用，不依赖 web 端的生成文件。

export interface CaptureReq {
  method?: string
  headers?: { [key: string]: string }
  body?: string
  size?: number
  truncated?: boolean
}

export interface CaptureRes {
  statusCode?: number
  statusMessage?: string
  headers?: { [key: string]: string }
  body?: string
  size?: number
  truncated?: boolean
}

export interface CaptureItem {
  id: string
  url: string
  hostname?: string
  path?: string
  protocol?: string
  method?: string
  clientIp?: string
  hostIp?: string
  startTime: number
  endTime?: number
  requestTime?: number
  dnsTime?: number
  httpsTime?: number
  responseTime?: number
  ttfb?: number
  req: CaptureReq
  res: CaptureRes
  type?: string
  contentEncoding?: string
  appName?: string
  reqError?: boolean
  resError?: boolean
  reqType?: string
  resType?: string
  highlighted?: boolean
  comment?: string
  processName?: string
  processId?: number
  graphqlOp?: string
}

// NetworkItem 是 CaptureItem 的别名，保持所有消费方的 import 路径不变。
export type NetworkItem = CaptureItem

export interface NetworkInterface {
  name: string
  ip: string
  kind: string
}

export interface NetworkInterfacesResponse {
  proxyHost: string
  proxyPort: number
  interfaces: NetworkInterface[]
}
