export { USE_API, API_BASE_URL } from "./config";
export { ApiError, isApiError } from "./errors";
export {
  request,
  refreshAccessToken,
  setSessionInvalidatedHandler,
} from "./client";
export { getAccessToken, setAccessToken } from "./tokenStore";
export {
  apiRequestEmailCode,
  apiVerifyEmailCode,
  apiCompleteSignup,
  apiCompleteOnboarding,
  apiLogin,
  apiLogout,
  apiUpdateProfile,
  apiRestoreSession,
  apiOAuthLogin,
  apiLinkOAuth,
  apiRequestPasswordReset,
  apiConfirmPasswordReset,
} from "./auth";
export {
  apiListTodos,
  apiGetTodoStats,
  apiCreateTodo,
  apiUpdateTodo,
  apiDeleteTodo,
  apiLinkCalendarTodo,
  apiUnlinkCalendarTodo,
  apiSearchTags,
} from "./todos";
export {
  apiGetCalendarConnection,
  apiConnectCalendar,
  apiDisconnectCalendar,
  type CalendarConnection,
} from "./calendar";
export {
  apiListEntries,
  apiListEntriesPaginated,
  apiCreateEntry,
  apiGetEntry,
  apiUpsertEntry,
  apiDeleteEntry,
} from "./entries";
export type { EntryPage } from "./entries";
export {
  apiCreateFolder,
  apiGetFolderContents,
  apiUpdateFolder,
  apiDeleteFolder,
  apiMoveEntryToFolder,
} from "./folders";
export type { FolderContents } from "./folders";
export {
  apiGetSettings,
  apiUpdateSettings,
  apiSetPushTarget,
  apiGetCountryTimezones,
  apiUpdateCountry,
  apiUpdateTimezone,
} from "./settings";
export {
  apiGenerateSummary,
  apiGetSummary,
  apiGetSummaryEntry,
  apiGetSummaryReadiness,
  apiUpdateSummaryContent,
  apiListSummaries,
  apiListSummaryTemplates,
  apiCreateSummaryTemplate,
  apiUpdateSummaryTemplate,
  apiDeleteSummaryTemplate,
  apiSetActiveSummaryTemplate,
  streamSummary,
  toSummaryEntry,
  type MappedSummary,
  type SummaryTemplate,
} from "./summaries";
export {
  apiListNotifications,
  apiMarkNotificationRead,
  apiMarkAllNotificationsRead,
  apiDeleteNotification,
  apiClearNotifications,
  streamNotifications,
  type CalendarSyncSSEEvent,
} from "./notifications";
export {
  apiListSessions,
  apiRevokeSession,
  apiRevokeOtherSessions,
} from "./sessions";
export {
  apiListTemplates,
  apiCreateTemplate,
  apiUpdateTemplate,
  apiDeleteTemplate,
  apiResetTemplate,
  apiSetActiveTemplate,
} from "./templates";
export { apiGlobalSearch, type GlobalSearchResult } from "./search";
export {
  apiGetConnection,
  apiListAvailableRepos,
  apiListLinkedRepos,
  apiLinkRepo,
  apiUpdateRepo,
  apiUnlinkAllRepos,
  apiUnlinkRepo,
  apiSyncAllRepos,
  apiGetCommits,
  apiPushRetrospective,
  type PushRetrospectivePayload,
  type PushRetrospectiveResult,
} from "./github";
export {
  apiListTopics,
  apiCreateTopic,
  apiDeleteTopic,
  apiGenerateDigest,
  apiGetDigest,
  streamTopicDigest,
  type TopicDigestStreamHandlers,
} from "./topics";
