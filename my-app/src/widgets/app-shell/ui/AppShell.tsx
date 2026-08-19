import { useState, type ReactNode } from "react"
import {
  Bell,
  BookOpen,
  Calendar,
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

const NAV_ITEMS: Array<{
  route: AppRoute
  labelKey: TranslationKey
  icon: typeof Calendar
}> = [
  { route: "calendar", labelKey: "nav.calendar", icon: Calendar },
  { route: "todos", labelKey: "nav.todos", icon: ListTodo },
  { route: "retrospectives", labelKey: "nav.retrospectives", icon: BookOpen },
  { route: "settings", labelKey: "nav.settings", icon: Settings },
]

export function AppShell({ route, children, onNavigate }: AppShellProps) {
  const { state, logout } = useArchiveApp()
  const { t } = useTranslation()
  const [notifOpen, setNotifOpen] = useState(false)
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

      {/* Page content */}
      <main className="app-shell-main">{children}</main>

      {/* Notification panel */}
      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  )
}
