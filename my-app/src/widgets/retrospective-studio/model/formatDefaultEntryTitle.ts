import type { RetrospectiveType } from "@/entities/entry/model/types";
import type { TranslateFn, TranslationKey } from "@/shared/lib/i18n";

const DEFAULT_TITLE_KEY: Record<RetrospectiveType, TranslationKey> = {
  daily: "retro.title.default.daily",
  weekly: "retro.title.default.weekly",
  monthly: "retro.title.default.monthly",
  yearly: "retro.title.default.yearly",
};

/**
 * 제목이 비었을 때 쓰는 기본 제목("2026-09-03 일일 회고").
 * 서버가 빈 제목을 채워주기 전까지는 FE 표시용 폴백으로도 쓴다.
 */
export function formatDefaultEntryTitle(
  t: TranslateFn,
  dateKey: string,
  retroType: RetrospectiveType,
): string {
  return t(DEFAULT_TITLE_KEY[retroType], { date: dateKey });
}
