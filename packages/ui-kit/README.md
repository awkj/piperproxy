# @piper/ui-kit

Shared React UI + hooks for [piper](../../) (single-machine抓包代理) and
[piper-cloud](../../../piper-cloud) (multi-tenant control plane).

设计与定位见 [docs/ECOSYSTEM-PLAN.md](../../docs/ECOSYSTEM-PLAN.md) §4 T-piper-1。

## 当前进度

- [x] Stage A — workspace + 包骨架（2026-06-06）
- [x] Stage B — `PiperApiClient` interface + `<PiperUIProvider>` + `usePiperApi()` hook
- [x] Stage C — `useCaptureStream` hook
- [ ] Stage D — NetworkList / NetworkDetail 等抓包面板组件 + zustand store 迁入
- [ ] Stage E — slot 机制 + RulesEditor + HttpsPanel + 控制面接入示例

## 用法（host app）

```tsx
import { PiperUIProvider, createDefaultClient, useCaptureStream } from '@piper/ui-kit';

const client = createDefaultClient({ baseUrl: '/' }); // piper 自身：同源
// piper-cloud 控制面：const client = createDefaultClient({ baseUrl: 'https://piper-cloud.example.com' })

function App() {
  return (
    <PiperUIProvider client={client}>
      <YourShell />
    </PiperUIProvider>
  );
}

function NetworkBlock() {
  useCaptureStream({
    onComplete: (item) => console.log('captured', item),
  });
  return <div>...</div>;
}
```
