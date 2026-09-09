import { useEffect, useState } from "react";
import { RetroTabBar } from "./RetroTabBar";
import { TopicPillBar } from "./TopicPillBar";
import { TopicPicker } from "./TopicPicker";
import { TopicDocument } from "./TopicDocument";
import { useTopics } from "../model/useTopics";
import { useLastViewedTopic } from "../model/useLastViewedTopic";
import type { RetroTab } from "../model/constants";

export interface TopicsPaneProps {
  retroFilter: RetroTab;
  setRetroFilter: (tab: RetroTab) => void;
  requireLoginInDemo: () => boolean;
}

/** "주제" 탭 최상위 화면 — 탭 바 + pill 전환 + (미선택 피커 | 문서 본문). */
export function TopicsPane({
  retroFilter,
  setRetroFilter,
  requireLoginInDemo,
}: TopicsPaneProps) {
  const { topics, loading, error, create, update, remove } = useTopics();
  const [lastViewedId, setLastViewedId] = useLastViewedTopic();
  const [selectedId, setSelectedId] = useState<string | null>(lastViewedId);

  // 마지막으로 본 주제가 삭제됐으면 폴백(미선택) — 목록이 로드된 뒤에만 검증한다.
  useEffect(() => {
    if (loading || topics.length === 0) return;
    if (selectedId && !topics.some((tp) => tp.id === selectedId)) {
      setSelectedId(null);
      setLastViewedId(null);
    }
  }, [loading, topics, selectedId, setLastViewedId]);

  const select = (id: string | null) => {
    setSelectedId(id);
    setLastViewedId(id);
  };

  const selectedTopic = selectedId ? topics.find((tp) => tp.id === selectedId) ?? null : null;

  return (
    <div className="retro-gallery">
      <div className="retro-gallery-header">
        <RetroTabBar retroFilter={retroFilter} setRetroFilter={setRetroFilter} />
      </div>

      <TopicPillBar
        topics={topics}
        loading={loading}
        error={error}
        selectedId={selectedId}
        onSelect={select}
        onCreate={create}
        requireLoginInDemo={requireLoginInDemo}
      />

      {topics.length === 0 ? null : selectedTopic ? (
        <TopicDocument
          key={selectedTopic.id}
          topic={selectedTopic}
          onUpdate={update}
          onDelete={remove}
          onDeleted={() => select(null)}
          requireLoginInDemo={requireLoginInDemo}
        />
      ) : loading ? null : (
        <TopicPicker topics={topics} onSelect={select} />
      )}
    </div>
  );
}
