import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "@/shared/lib/i18n";
import { formatMonthDayFromDateKey } from "@/shared/lib/date";
import type { Topic } from "@/entities/topic/model/types";

export interface TopicPickerProps {
  topics: Topic[];
  onSelect: (id: string) => void;
}

/** 주제 미선택 상태(§3.2 B) — 자동 선택하지 않고 카드 목록에서 고르게 한다. */
export function TopicPicker({ topics, onSelect }: TopicPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter(
      (topic) =>
        topic.name.toLowerCase().includes(q) ||
        topic.description.toLowerCase().includes(q),
    );
  }, [topics, query]);

  return (
    <div className="topic-picker">
      <div className="topic-picker-search">
        <Search size={14} className="topic-picker-search-icon" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("topic.picker.searchPlaceholder")}
        />
      </div>
      <h3 className="topic-picker-title">{t("topic.picker.title")}</h3>
      <div className="topic-picker-list">
        {filtered.map((topic) => (
          <button
            key={topic.id}
            type="button"
            className="topic-picker-card"
            onClick={() => onSelect(topic.id)}
          >
            <div className="topic-picker-card-head">
              <span className="topic-picker-card-name">{topic.name}</span>
              <span className="topic-picker-card-status">
                {topic.digestWatermarkDateKey
                  ? t("topic.picker.reflectedUntil", {
                      date: formatMonthDayFromDateKey(topic.digestWatermarkDateKey),
                    })
                  : t("topic.picker.notReflected")}
              </span>
            </div>
            <span className="topic-picker-card-desc">
              {topic.description || t("topic.picker.noDescription")}
            </span>
          </button>
        ))}
      </div>
      <p className="topic-picker-hint">{t("topic.picker.rememberHint")}</p>
    </div>
  );
}
