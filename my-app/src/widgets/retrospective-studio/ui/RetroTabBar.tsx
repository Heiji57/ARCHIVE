import { useTranslation } from "@/shared/lib/i18n";
import { RETRO_FILTERS, type RetroTab } from "../model/constants";

export interface RetroTabBarProps {
  retroFilter: RetroTab;
  setRetroFilter: (tab: RetroTab) => void;
}

/** 회고 스튜디오 상단 종류 탭(전체/일간/주간/월간/연간/주제). */
export function RetroTabBar({ retroFilter, setRetroFilter }: RetroTabBarProps) {
  const { t } = useTranslation();
  return (
    <div className="retro-gallery-tabs">
      {RETRO_FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          className="retro-gallery-chip"
          data-active={retroFilter === f.id ? "true" : undefined}
          aria-pressed={retroFilter === f.id}
          onClick={() => setRetroFilter(f.id)}
        >
          {t(f.labelKey)}
        </button>
      ))}
    </div>
  );
}
