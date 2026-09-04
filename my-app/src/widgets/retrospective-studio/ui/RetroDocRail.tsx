import { Check, Clock, GitCommit, Lock, Maximize2, Save } from "lucide-react"
import type { JournalEntry } from "@/entities/entry/model/types"
import { Pill } from "@/shared/ui/pill/Pill"
import { useTranslation } from "@/shared/lib/i18n"
import { countContentBlocks } from "../model/countContentBlocks"

export interface RetroDocRailProps {
  entry: JournalEntry
  /** 개발자 계정 등 GitHub 기능 사용 권한. false 면 동기화 영역 전체를 감춘다. */
  isGithubEnabled: boolean
  isGithubConnected: boolean
  canPush: boolean
  pushing: boolean
  completedCount: number
  commitCount: number
  onPush: () => void
  onExpand: () => void
}

/** 문서 우측 각주 레일 — 저장/동기화 상태, 액션 버튼, 이 회고의 재료. */
export function RetroDocRail({
  entry,
  isGithubEnabled,
  isGithubConnected,
  canPush,
  pushing,
  completedCount,
  commitCount,
  onPush,
  onExpand,
}: RetroDocRailProps) {
  const { t } = useTranslation()

  return (
    <>
      <div className="retro-rail-group">
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--s-xxs)",
            fontSize: 12,
            color: "var(--color-ink-muted-48)",
          }}>
          <Save size={11} />
          {t("retro.editor.autoSaved")}
        </span>

        {isGithubEnabled ? (
          isGithubConnected ? (
            entry.synced ? (
              <Pill tone="green">
                <Check size={10} /> {t("retro.editor.synced")}
              </Pill>
            ) : (
              <Pill tone="warn">
                <Clock size={10} /> {t("retro.editor.pending")}
              </Pill>
            )
          ) : (
            <Pill tone="ghost">
              <Lock size={10} /> {t("settings.github.notConnected")}
            </Pill>
          )
        ) : null}
      </div>

      <div className="retro-rail-group">
        {isGithubEnabled ? (
          <button
            type="button"
            className="btn btn-primary"
            style={{ justifyContent: "center" }}
            disabled={!canPush || pushing}
            onClick={onPush}
            title={
              !isGithubConnected
                ? t("retro.github.connectFromSettings")
                : !canPush
                  ? t("settings.github.pushTargetHint")
                  : ""
            }>
            <GitCommit size={14} />
            {pushing ? t("retro.editor.pushing") : t("retro.editor.save")}
          </button>
        ) : null}

        <button
          type="button"
          className="btn btn-utility"
          style={{ justifyContent: "center" }}
          onClick={onExpand}
          title={`${t("retro.editor.expand")} (Ctrl+Shift+F)`}>
          <Maximize2 size={14} />
          {t("retro.editor.expand")}
        </button>
      </div>

      <div className="retro-rail-divider" />

      <div className="retro-rail-group">
        <span className="retro-rail-label">{t("retro.editor.materials")}</span>
        <span className="retro-rail-stat">
          {t("retro.editor.materialCompleted")}
          <b>{completedCount}</b>
        </span>
        <span className="retro-rail-stat">
          {t("retro.editor.materialCommits")}
          <b>{commitCount}</b>
        </span>
        <span className="retro-rail-stat">
          {t("retro.editor.materialBlocks")}
          <b>{countContentBlocks(entry.content)}</b>
        </span>
      </div>
    </>
  )
}
