import { lazy, Suspense } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "@/shared/lib/i18n";
import { EmptyState } from "@/shared/ui/empty-state/EmptyState";
import { EditorErrorBoundary } from "@/shared/ui/rich-editor";
import { formatFullDate, fromDateKey } from "@/shared/lib/date";
import { useTopicDigest } from "../model/useTopicDigest";

const RichEditor = lazy(() => import("@/shared/ui/rich-editor/ui/RichEditor"));

export interface TopicDigestPaneProps {
  topicId: string | null;
  requireLoginInDemo: () => boolean;
}

export function TopicDigestPane({
  topicId,
  requireLoginInDemo,
}: TopicDigestPaneProps) {
  const { t } = useTranslation();
  const { digest, loading, loadError, generating, generateError, generate } =
    useTopicDigest(topicId);

  if (!topicId) {
    return (
      <section className="topic-pane">
        <EmptyState message={t("topic.pane.noSelection")} minHeight={220} />
      </section>
    );
  }

  const handleGenerate = () => {
    if (requireLoginInDemo()) return;
    generate();
  };

  return (
    <section className="topic-pane">
      <div className="topic-pane-head">
        <button
          type="button"
          className="btn btn-primary"
          disabled={generating}
          onClick={handleGenerate}
        >
          <Sparkles size={14} />
          {generating
            ? t("topic.sidebar.generateInProgress")
            : t("topic.sidebar.generateButton")}
        </button>
        {digest?.watermarkDateKey ? (
          <span className="topic-pane-meta">
            {t("topic.pane.watermark", {
              date: formatFullDate(fromDateKey(digest.watermarkDateKey)),
            })}
          </span>
        ) : null}
      </div>

      {generateError ? (
        <div className="topic-pane-error">{t("topic.generate.failed")}</div>
      ) : null}

      {loadError ? (
        <EmptyState message={t("topic.pane.loadError")} minHeight={220} />
      ) : loading ? (
        <EmptyState message={t("topic.pane.loading")} minHeight={220} />
      ) : !digest || !digest.content ? (
        <EmptyState
          message={`${t("topic.pane.emptyTitle")}\n${t("topic.pane.emptyDesc")}`}
          minHeight={220}
        />
      ) : (
        <EditorErrorBoundary
          fallback={(error) => (
            <div className="topic-pane-error">{error.message}</div>
          )}
        >
          <Suspense fallback={<EmptyState message={t("topic.pane.loading")} minHeight={220} />}>
            <RichEditor value={digest.content} editable={false} />
          </Suspense>
        </EditorErrorBoundary>
      )}
    </section>
  );
}
