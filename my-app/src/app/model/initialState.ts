import { isDemoMode } from "@/app/config/demo";
import { seedState } from "@/app/config/seedState";
import { loadAppState } from "@/app/lib/storage";
import { DEFAULT_SETTINGS } from "@/app/model/settings";
import type { AppState, PersistedAppState } from "@/app/model/types";
import { INITIAL_CALENDAR_STATE } from "@/entities/calendar/model/types";
import { INITIAL_GITHUB_STATE } from "@/entities/github/model/types";
import { DEFAULT_ACTIVE_TEMPLATE_IDS, DEFAULT_TEMPLATES } from "@/entities/template";

export function getInitialAppState(): AppState {
  // 데모 모드: 목 시드/localStorage 없이 빈 상태로 시작(일회성 체험).
  // 기본 설정·기본 템플릿만 유지한다.
  if (isDemoMode()) {
    return {
      todos: [],
      entries: [],
      folders: [],
      notifications: [],
      settings: { ...DEFAULT_SETTINGS },
      pendingSummary: null,
      currentUser: null,
      rememberMe: false,
      templates: DEFAULT_TEMPLATES,
      activeTemplateIds: DEFAULT_ACTIVE_TEMPLATE_IDS,
      github: INITIAL_GITHUB_STATE,
      calendar: INITIAL_CALENDAR_STATE,
      lastTodoIdReplacement: null,
    };
  }

  const fallback: PersistedAppState = {
    ...seedState,
    notifications: seedState.notifications ?? [],
    settings: seedState.settings ?? { ...DEFAULT_SETTINGS },
    pendingSummary: seedState.pendingSummary ?? null,
    templates: seedState.templates ?? DEFAULT_TEMPLATES,
    activeTemplateIds:
      seedState.activeTemplateIds ?? DEFAULT_ACTIVE_TEMPLATE_IDS,
  };
  // GitHub·Calendar 상태는 영속화하지 않음(서버/세션 기반) → 항상 초기값으로 시작.
  return {
    ...loadAppState(fallback),
    github: INITIAL_GITHUB_STATE,
    calendar: INITIAL_CALENDAR_STATE,
    lastTodoIdReplacement: null,
  };
}
