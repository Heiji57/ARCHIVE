import { useState, type ReactNode } from "react"
import {
  Bell,
  BookOpen,
  Calendar,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Settings,
} from "lucide-react"
import type { AppRoute } from "@/app/model/types"
import { useArchiveApp } from "@/app/providers/useArchiveApp"
import { useTranslation } from "@/shared/lib/i18n"
import type { TranslationKey } from "@/shared/lib/i18n"
import { can } from "@/shared/lib/permissions"
import { ArchiveLogo } from "@/shared/ui"
import { GlobalSearch } from "@/widgets/global-search"
import { NotificationPanel } from "@/widgets/notifications"

interface AppShellProps {
  route: AppRoute
  children: ReactNode
  onNavigate: (route: AppRoute) => void
}

const ROUTE_META: Record<
  AppRoute,
  { eyebrow: TranslationKey; title: TranslationKey; subtitle: TranslationKey }
> = {
  dashboard: {
    eyebrow: "subheader.dashboard.eyebrow",
    title: "subheader.dashboard.title",
    subtitle: "subheader.dashboard.subtitle",
  },
  calendar: {
    eyebrow: "subheader.calendar.eyebrow",
    title: "subheader.calendar.title",
    subtitle: "subheader.calendar.subtitle",
  },
  todos: {
    eyebrow: "subheader.todos.eyebrow",
    title: "subheader.todos.title",
    subtitle: "subheader.todos.subtitle",
  },
  retrospectives: {
    eyebrow: "subheader.retrospectives.eyebrow",
    title: "subheader.retrospectives.title",
    subtitle: "subheader.retrospectives.subtitle",
  },
  settings: {
    eyebrow: "subheader.settings.eyebrow",
    title: "subheader.settings.title",
    subtitle: "subheader.settings.subtitle",
  },
}

const NAV_ITEMS: Array<{
  route: AppRoute
  labelKey: TranslationKey
  icon: typeof Calendar
}> = [
  { route: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { route: "calendar", labelKey: "nav.calendar", icon: Calendar },
  { route: "todos", labelKey: "nav.todos", icon: ListTodo },
  { route: "retrospectives", labelKey: "nav.retrospectives", icon: BookOpen },
  { route: "settings", labelKey: "nav.settings", icon: Settings },
]

export function AppShell({ route, children, onNavigate }: AppShellProps) {
  const { state, logout } = useArchiveApp()
  const { t } = useTranslation()
  const [notifOpen, setNotifOpen] = useState(false)
  const meta = ROUTE_META[route]
  const currentUser = state.currentUser
  const initial = currentUser?.displayName?.[0]?.toUpperCase() ?? "?"

  const isGithubConnected = state.github.status === "connected"
  const commitCount = state.github.linkedRepositories.length
  const showGithubChip = can(state.settings.accountType, "github")

  const unreadCount = state.notifications.filter((n) => !n.read).length

  return (
    <div className="app-shell-root">
      {/* Global Nav */}
      <nav className="global-nav" aria-label="Primary">
        <div className="global-nav-inner">
          <button
            type="button"
            className="gn-brand"
            onClick={() => onNavigate("calendar")}>
            <ArchiveLogo className="gn-brand-mark" />
            <span>{t("nav.brand")}</span>
          </button>

          <div className="gn-links" role="tablist">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const active = route === item.route
              return (
                <button
                  key={item.route}
                  type="button"
                  className="gn-link"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigate(item.route)}>
                  <Icon size={14} />
                  <span>{t(item.labelKey)}</span>
                </button>
              )
            })}
          </div>

          <div className="gn-right">
            {showGithubChip && (
              <div
                className="sync-chip"
                title={
                  isGithubConnected
                    ? t("sync.connected")
                    : t("sync.disconnected")
                }>
                <span
                  className={`sync-dot ${isGithubConnected ? "" : "offline"}`}
                />
                <span>
                  {isGithubConnected
                    ? t("sync.synced", { n: commitCount })
                    : t("sync.offline")}
                </span>
              </div>
            )}

            <GlobalSearch onNavigate={onNavigate} />

            <button
              type="button"
              className="btn-icon"
              aria-label={t("notif.panel.title")}
              onClick={() => setNotifOpen(true)}>
              <Bell size={16} />
              {unreadCount > 0 ? <span className="badge-dot" /> : null}
            </button>

            {currentUser ? (
              <span className="user-chip" title={currentUser.email}>
                <span className="user-avatar">{initial}</span>
                <span>{currentUser.displayName}</span>
                <button
                  type="button"
                  className="btn-icon"
                  aria-label={t("auth.header.logout")}
                  title={t("auth.header.logout")}
                  onClick={() => logout()}>
                  <LogOut size={14} />
                </button>
              </span>
            ) : null}
          </div>
        </div>
      </nav>

      {/* Sub-header */}
      <header className="sub-header">
        <div className="sub-header-inner">
          <div className="sub-header-text">
            <p className="t-eyebrow sub-header-eyebrow">{t(meta.eyebrow)}</p>
            <h1 className="t-hero sub-header-title">{t(meta.title)}</h1>
            <p className="sub-header-sub">{t(meta.subtitle)}</p>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="app-shell-main">{children}</main>

      {/* Notification panel */}
      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  )
}
