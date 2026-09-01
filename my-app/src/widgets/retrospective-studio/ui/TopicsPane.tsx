import { useState } from "react";
import { RetroTabBar } from "./RetroTabBar";
import { TopicSidebar } from "./TopicSidebar";
import { TopicDigestPane } from "./TopicDigestPane";
import type { RetroTab } from "../model/constants";

export interface TopicsPaneProps {
  retroFilter: RetroTab;
  setRetroFilter: (tab: RetroTab) => void;
  requireLoginInDemo: () => boolean;
}

/** "주제" 탭 최상위 화면 — 탭 바 + 좌(주제 목록) / 우(정리 문서) 분할 뷰. */
export function TopicsPane({
  retroFilter,
  setRetroFilter,
  requireLoginInDemo,
}: TopicsPaneProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="retro-gallery">
      <div className="retro-gallery-header">
        <RetroTabBar retroFilter={retroFilter} setRetroFilter={setRetroFilter} />
      </div>
      <div className="topic-split">
        <TopicSidebar
          selectedId={selectedId}
          onSelect={setSelectedId}
          requireLoginInDemo={requireLoginInDemo}
        />
        <TopicDigestPane topicId={selectedId} requireLoginInDemo={requireLoginInDemo} />
      </div>
    </div>
  );
}
