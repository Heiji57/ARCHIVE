import { ExternalLink, RefreshCw } from "lucide-react"
import type { GitHubCommit } from "@/entities/github/model/types"
import { useTranslation } from "@/shared/lib/i18n"

export interface RetroCommitsSectionProps {
  commits: GitHubCommit[]
  loading: boolean
  onRefresh: () => void
  githubConnectedAs: string
  /** verified emails 캐시 보유 여부. false 면 커밋 0건 시 재연결 안내를 표시한다. */
  hasVerifiedEmails: boolean
  /** 오늘 일간 회고 여부 — 제목·빈 상태 문구 구분. */
  isToday: boolean
}

/** 일간 회고의 "오늘의 커밋" 섹션 (개발자 계정 + GitHub 연결 시에만 렌더). */
export function RetroCommitsSection({
  commits,
  loading,
  onRefresh,
  githubConnectedAs,
  hasVerifiedEmails,
  isToday,
}: RetroCommitsSectionProps) {
  const { t } = useTranslation()

  const repoNames = Array.from(new Set(commits.map((c) => c.fullName)))
  const repoSummary =
    repoNames.length === 1
      ? t("retro.editor.commitsRepoAll", { repo: repoNames[0] })
      : t("retro.editor.commitsRepoMulti", { count: repoNames.length })

  return (
    <section className="retro-doc-section">
      <div className="retro-doc-section-head">
        <h2 className="retro-doc-section-title">
          {isToday ? t("retro.editor.commits") : t("retro.editor.commitsPast")}
        </h2>
        <div className="retro-doc-section-meta">
          <span>@{githubConnectedAs}</span>
          <span>·</span>
          <span>{commits.length}</span>
          <button
            type="button"
            className="btn btn-utility"
            style={{ padding: "var(--s-xxs) var(--s-xs)", fontSize: 12 }}
            onClick={onRefresh}
            disabled={loading}
            title={t("retro.editor.loadCommits")}>
            <RefreshCw
              size={11}
              style={
                loading
                  ? { animation: "summary-spin 900ms linear infinite" }
                  : undefined
              }
            />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="retro-doc-empty">{t("retro.editor.loadCommits")}…</p>
      ) : commits.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-xxs)" }}>
          <p className="retro-doc-empty">
            {!hasVerifiedEmails
              ? t("retro.github.noCommitsReconnect")
              : isToday
                ? t("retro.editor.noCommits")
                : t("retro.editor.noCommitsPast")}
          </p>
          {hasVerifiedEmails && (
            <a
              href="https://github.com/settings/emails"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                color: "var(--color-primary)",
                textDecoration: "underline",
              }}>
              {t("retro.github.emailsSettingsLink")} ↗
            </a>
          )}
        </div>
      ) : (
        <>
          <div className="retro-doc-list">
            {commits.map((c) => (
              <div key={`${c.repositoryId}-${c.sha}`} className="retro-doc-row">
                <span className="retro-commit-msg">{c.message}</span>
                <a
                  className="retro-commit-sha"
                  href={c.htmlUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={c.sha}>
                  {c.sha.slice(0, 7)}
                  <ExternalLink size={10} />
                </a>
              </div>
            ))}
          </div>
          <span className="retro-doc-section-meta">{repoSummary}</span>
        </>
      )}
    </section>
  )
}
