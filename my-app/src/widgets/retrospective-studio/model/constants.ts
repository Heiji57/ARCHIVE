import type { RetrospectiveType } from "@/entities/entry/model/types";
import type { TranslationKey } from "@/shared/lib/i18n";

/** Number of retro list entries per pagination page. */
export const PAGE_SIZE = 16;

/**
 * 사이드바 탭 값. "all" 은 daily/weekly/monthly/yearly 를 타입 구분 없이 합친
 * "전체" 뷰(GET /entries/paginated 의 retroType 생략) — 실제 엔트리의
 * retroType(RetrospectiveType)에는 존재하지 않는, 탭 선택 전용 값이다.
 */
export type RetroTab = RetrospectiveType | "all";

/** Retrospective type filter tabs. */
export interface RetroFilterConfig {
  id: RetroTab;
  labelKey: TranslationKey;
}

export const RETRO_FILTERS: RetroFilterConfig[] = [
  { id: "all", labelKey: "retro.filter.all" },
  { id: "daily", labelKey: "retro.filter.daily" },
  { id: "weekly", labelKey: "retro.filter.weekly" },
  { id: "monthly", labelKey: "retro.filter.monthly" },
  { id: "yearly", labelKey: "retro.filter.yearly" },
];

export const RETRO_LABEL_KEY: Record<RetrospectiveType, TranslationKey> = {
  daily: "retro.filter.daily",
  weekly: "retro.filter.weekly",
  monthly: "retro.filter.monthly",
  yearly: "retro.filter.yearly",
};

/** Month numbers for the month <select>. */
export const MONTHS = [
  "01", "02", "03", "04", "05", "06",
  "07", "08", "09", "10", "11", "12",
];

// MOCK_COMMITS 는 app/lib/mockGithub.ts 로 이전. 서버 모델 연동 후 state.github.commits 를 사용.

/**
 * 회고록 폴더 갤러리의 드래그앤드롭 kind. 회고록 카드(폴더로 이동)와 폴더 카드
 * (다른 폴더로 중첩)를 같은 kind 로 묶어야 폴더 카드 하나의 drop target 이
 * 두 종류를 모두 받을 수 있다(useDropTarget 은 kind 하나만 매칭) — itemType 으로
 * payload 안에서 구분한다.
 */
export const RETRO_DRAG_KIND = "retro-item";

export type RetroDragPayload =
  | { itemType: "entry"; id: string; retroType: RetrospectiveType }
  | { itemType: "folder"; id: string; name: string };
