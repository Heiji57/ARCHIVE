import { useArchiveApp } from "@/app/providers/useArchiveApp";
import { useTranslation } from "@/shared/lib/i18n";
import { SettingRow } from "./SettingRow";

export function WritingCard() {
  const { state, setSpellCheck } = useArchiveApp();
  const { t } = useTranslation();
  const on = state.settings.spellCheck;

  return (
    <SettingRow
      label={t("settings.writing.spellCheck")}
      description={t("settings.writing.spellCheckHint")}
    >
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className="ios-toggle"
        data-on={on}
        onClick={() => setSpellCheck(!on)}
      />
    </SettingRow>
  );
}
