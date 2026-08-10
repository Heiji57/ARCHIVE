import type { ReactNode } from "react";
import type { AppSettings } from "@/app/model/settings";
import type { TranslationKey } from "@/shared/lib/i18n";
import { useTranslation } from "@/shared/lib/i18n";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import { can } from "@/shared/lib/permissions";
import { AccountTypeCard } from "./AccountTypeCard";
import { AutoSummaryCard } from "./AutoSummaryCard";
import { CalendarCard } from "./CalendarCard";
import { GithubCard } from "./GithubCard";
import { LanguageCard } from "./LanguageCard";
import { NotificationsCard } from "./NotificationsCard";
import { RegionTimezoneCard } from "./RegionTimezoneCard";
import { SessionsCard } from "./SessionsCard";
import { TemplatesCard } from "./TemplatesCard";
import { TodoRangeCard } from "./TodoRangeCard";
import { WritingCard } from "./WritingCard";

function SettingsSection({
  label,
  hint,
  children,
}: {
  label: TranslationKey;
  hint: TranslationKey;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <h2 className="settings-section-label">{t(label)}</h2>
        <p className="settings-section-hint">{t(hint)}</p>
      </div>
      {children}
    </section>
  );
}

export function SettingsStudio() {
  const { state } = useArchiveApp();
  const showGithub = can(state.settings.accountType, "github");

  return (
    <div className="page settings-page">
      <SettingsSection
        label="settings.section.preferences"
        hint="settings.group.preferences.hint"
      >
        <div className="settings-card settings-list">
          <LanguageCard />
          <RegionTimezoneCard />
          <AccountTypeCard />
          <TodoRangeCard />
          <NotificationsCard />
        </div>
      </SettingsSection>

      <SettingsSection
        label="settings.section.autoSummary"
        hint="settings.autoSummary.description"
      >
        <div className="settings-card settings-list">
          <AutoSummaryCard />
        </div>
      </SettingsSection>

      {/* 외부 서비스 연동 — 각 서비스를 독립 섹션으로 분리(풀 width). */}
      {showGithub && (
        <SettingsSection
          label="settings.section.github"
          hint="settings.group.github.hint"
        >
          <GithubCard />
        </SettingsSection>
      )}

      <SettingsSection
        label="settings.section.calendar"
        hint="settings.group.calendar.hint"
      >
        <CalendarCard />
      </SettingsSection>

      <SettingsSection
        label="settings.section.security"
        hint="settings.group.security.hint"
      >
        <div className="settings-grid">
          <SessionsCard />
        </div>
      </SettingsSection>

      <SettingsSection
        label="settings.section.writing"
        hint="settings.group.writing.hint"
      >
        <div className="settings-card settings-list">
          <WritingCard />
        </div>
      </SettingsSection>

      <SettingsSection
        label="settings.section.templates"
        hint="settings.group.templates.hint"
      >
        <TemplatesCard />
      </SettingsSection>
    </div>
  );
}

export type { AppSettings };
