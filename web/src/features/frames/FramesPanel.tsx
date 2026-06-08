import { FramesToolbar } from './FramesToolbar';
import { FramesSender } from './FramesSender';
import { FramesLog } from './FramesLog';
import { FrameDetail } from './FrameDetail';
import { useFrameSocket } from './useFrameSocket';
import { useFramesStore } from '@/store/frames';
import { useShortcuts } from '@/lib/use-shortcuts';

export function FramesPanel() {
  const socket = useFrameSocket();
  const selectedId = useFramesStore((s) => s.selectedId);
  const clearLog = useFramesStore((s) => s.clearLog);

  // 接通 Frames 快捷键：
  // - clearNetworkFrames (Cmd+X)：清空当前 frames 日志
  // - replaySelectedFrame (Cmd+Enter)：当前栈尚未实现帧重放，留空 + TODO
  //   （老栈通过选中行调用 sendFrame；新栈 sender 形态不同，等专门 PR）
  useShortcuts({
    clearNetworkFrames: clearLog,
    replaySelectedFrame: () => {
      // TODO: 帧重放：在 FramesSender 重新发送当前选中帧的内容
    },
  });

  return (
    <div className="flex h-full flex-col">
      <FramesToolbar socket={socket} />
      <FramesSender socket={socket} />
      <div className="flex flex-1 overflow-hidden">
        <div className={selectedId ? 'w-1/2 overflow-hidden border-r border-neutral-200' : 'flex-1 overflow-hidden'}>
          <FramesLog />
        </div>
        {selectedId && (
          <div className="w-1/2 overflow-hidden">
            <FrameDetail />
          </div>
        )}
      </div>
    </div>
  );
}
