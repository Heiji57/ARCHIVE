import { lazy, startTransition, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppRoute } from "@/app/model/types";
import { AppProvider } from "@/app/providers/AppProvider";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import {
  getAuthRouteFromPath,
  getPathFromAuthRoute,
  isAuthPath,
  type AuthRoute,
} from "@/app/router/authRoute";
import {
  getPathFromRoute,
  getRouteFromPath,
  getRetroParamsFromPath,
  getRetroPathFromParams,
  type RetroRouteParams,
} from "@/app/router/navigation";
import { DndProvider } from "@/shared/lib/dnd";
import { TodoDragGhost } from "@/app/TodoDragGhost";
import { RetroDragGhost } from "@/app/RetroDragGhost";
import { I18nProvider, useTranslation } from "@/shared/lib/i18n";
import { AppShell } from "@/widgets/app-shell";
import { ToastViewport } from "@/widgets/notifications";
import { SummaryFloatingChip, SummaryOverlay } from "@/widgets/summary";
import { AccountTypeForm, AuthShell } from "@/widgets/auth";

// 페이지 단위 코드 스플리팅 — 로그인 사용자의 초기 번들에서 랜딩/auth 페이지를,
// 미로그인 방문자의 초기 번들에서 앱 페이지를 제외한다 (named export → lazy 어댑터).
const DashboardPage = lazy(() =>
  import("@/pages/dashboard/ui/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const CalendarPage = lazy(() =>
  import("@/pages/calendar/ui/CalendarPage").then((m) => ({ default: m.CalendarPage })),
);
const TodosPage = lazy(() =>
  import("@/pages/todos/ui/TodosPage").then((m) => ({ default: m.TodosPage })),
);
const RetrospectivesPage = lazy(() =>
  import("@/pages/retrospectives/ui/RetrospectivesPage").then((m) => ({ default: m.RetrospectivesPage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/settings/ui/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const LandingPage = lazy(() =>
  import("@/pages/landing").then((m) => ({ default: m.LandingPage })),
);
const LoginPage = lazy(() =>
  import("@/pages/login/ui/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const SignupPage = lazy(() =>
  import("@/pages/signup/ui/SignupPage").then((m) => ({ default: m.SignupPage })),
);
const ForgotPasswordPage = lazy(() =>
  import("@/pages/forgot-password/ui/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import("@/pages/reset-password/ui/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })),
);
const OnboardingPage = lazy(() =>
  import("@/pages/onboarding/ui/OnboardingPage").then((m) => ({ default: m.OnboardingPage })),
);

type ResolvedRoute =
  | { kind: "auth"; route: AuthRoute }
  | { kind: "app"; route: AppRoute };

function resolveRoute(pathname: string): ResolvedRoute {
  if (isAuthPath(pathname)) {
    return { kind: "auth", route: getAuthRouteFromPath(pathname) };
  }
  return { kind: "app", route: getRouteFromPath(pathname) };
}

export default function App() {
  const [resolved, setResolved] = useState<ResolvedRoute>(() =>
    resolveRoute(window.location.pathname),
  );

  useEffect(() => {
    const handlePopState = () => {
      startTransition(() => {
        setResolved(resolveRoute(window.location.pathname));
      });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateApp = (nextRoute: AppRoute) => {
    const nextPath = getPathFromRoute(nextRoute);
    // 데모(게스트) 모드에서는 ?demo=true 를 유지해야 nav 이동 시 로그인으로 튕기지 않는다.
    const isDemo =
      new URLSearchParams(window.location.search).get("demo") === "true";
    const target = isDemo ? `${nextPath}?demo=true` : nextPath;
    if (window.location.pathname + window.location.search !== target) {
      window.history.pushState({}, "", target);
    }
    startTransition(() => {
      setResolved({ kind: "app", route: nextRoute });
    });
  };

  const navigateRetro = (retroParams: RetroRouteParams) => {
    const nextPath = getRetroPathFromParams(retroParams);
    const isDemo =
      new URLSearchParams(window.location.search).get("demo") === "true";
    const target = isDemo ? `${nextPath}?demo=true` : nextPath;
    if (window.location.pathname + window.location.search !== target) {
      window.history.pushState({}, "", target);
    }
    startTransition(() => {
      setResolved({ kind: "app", route: "retrospectives" });
    });
  };

  const navigateAuth = (nextRoute: AuthRoute) => {
    const nextPath = getPathFromAuthRoute(nextRoute);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    startTransition(() => {
      setResolved({ kind: "auth", route: nextRoute });
    });
  };

  return (
    <AppProvider>
      <LocalizedShell
        resolved={resolved}
        navigateApp={navigateApp}
        navigateRetro={navigateRetro}
        navigateAuth={navigateAuth}
      />
    </AppProvider>
  );
}

function LocalizedShell({
  resolved,
  navigateApp,
  navigateRetro,
  navigateAuth,
}: {
  resolved: ResolvedRoute;
  navigateApp: (route: AppRoute) => void;
  navigateRetro: (params: RetroRouteParams) => void;
  navigateAuth: (route: AuthRoute) => void;
}) {
  const { state } = useArchiveApp();
  return (
    <I18nProvider locale={state.settings.locale}>
      <DndProvider>
        <TodoDragGhost />
        <RetroDragGhost />
        {/* lazy 페이지 최초 청크 로딩 경계 — 라우트 전환은 startTransition 이라
            이전 화면이 유지되고, 이 fallback 은 첫 진입에만 잠깐 보인다. */}
        <Suspense fallback={null}>
          <AuthGate
            resolved={resolved}
            navigateApp={navigateApp}
            navigateRetro={navigateRetro}
            navigateAuth={navigateAuth}
          />
        </Suspense>
      </DndProvider>
    </I18nProvider>
  );
}

/**
 * 인증 상태에 따라 분기:
 * - 로그인 안 된 상태 → /login, /signup, /forgot-password 만 허용 (그 외는 /login으로 강제)
 * - 로그인 된 상태 → 앱 라우트 렌더링 (auth 경로 접근 시 / 로 리다이렉트)
 */
function AuthGate({
  resolved,
  navigateApp,
  navigateRetro,
  navigateAuth,
}: {
  resolved: ResolvedRoute;
  navigateApp: (route: AppRoute) => void;
  navigateRetro: (params: RetroRouteParams) => void;
  navigateAuth: (route: AuthRoute) => void;
}) {
  const { state } = useArchiveApp();
  const isAuthenticated = state.currentUser !== null;

  // ?demo=true → 인증 없이 앱 직접 실행
  const isDemoMode = new URLSearchParams(window.location.search).get("demo") === "true";

  // Auth 경로로 접근했는데 이미 로그인 → 메인으로 리다이렉트
  useEffect(() => {
    if (isAuthenticated && resolved.kind === "auth") {
      navigateApp("calendar");
    }
  }, [isAuthenticated, resolved, navigateApp]);

  // 미인증 + 앱 경로 접근 + 루트("/") → 랜딩 페이지 (리다이렉트 없음)
  // 미인증 + 앱 경로 접근 + 루트 외 → 로그인 페이지로 리다이렉트
  useEffect(() => {
    if (
      !isAuthenticated &&
      !isDemoMode &&
      resolved.kind === "app" &&
      window.location.pathname !== "/"
    ) {
      navigateAuth("login");
    }
  }, [isAuthenticated, isDemoMode, resolved, navigateAuth]);

  // 데모 모드: 인증 없이 앱 실행
  if (isDemoMode) {
    const appRoute = resolved.kind === "app" ? resolved.route : "calendar";
    return <AppContent route={appRoute} onNavigate={navigateApp} onRetroNavigate={navigateRetro} isDemo />;
  }

  if (!isAuthenticated) {
    // 루트 "/" → 랜딩 페이지
    if (resolved.kind === "app" && window.location.pathname === "/") {
      return (
        <LandingPage
          onNavigateAuth={navigateAuth}
          onNavigateApp={navigateApp}
        />
      );
    }

    const authRoute = resolved.kind === "auth" ? resolved.route : "login";
    switch (authRoute) {
      case "login":
        return <LoginPage onAuthNavigate={navigateAuth} />;
      case "signup":
        return <SignupPage onAuthNavigate={navigateAuth} />;
      case "forgot-password":
        return <ForgotPasswordPage onAuthNavigate={navigateAuth} />;
      case "reset-password":
        return <ResetPasswordPage onAuthNavigate={navigateAuth} />;
      case "onboarding":
        return <OnboardingPage onAuthNavigate={navigateAuth} />;
    }
  }

  // Authenticated but hasn't set account type yet → show selection screen
  if (!state.settings.accountTypeDetermined) {
    return <AccountTypeScreen />;
  }

  const appRoute = resolved.kind === "app" ? resolved.route : "calendar";
  return <AppContent route={appRoute} onNavigate={navigateApp} onRetroNavigate={navigateRetro} />;
}

function AccountTypeScreen() {
  const { t } = useTranslation();
  return (
    <AuthShell
      title={t("onboarding.accountType.title")}
      subtitle={t("onboarding.accountType.subtitle")}
    >
      <AccountTypeForm />
    </AuthShell>
  );
}

function AppContent({
  route,
  onNavigate,
  onRetroNavigate,
  isDemo = false,
}: {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onRetroNavigate: (params: RetroRouteParams) => void;
  isDemo?: boolean;
}) {
  const { state } = useArchiveApp();
  const retroParams = getRetroParamsFromPath(window.location.pathname);

  const pages = useMemo(
    () => ({
      dashboard: <DashboardPage onNavigate={onNavigate} />,
      calendar: <CalendarPage />,
      todos: <TodosPage />,
      retrospectives: <RetrospectivesPage retroParams={retroParams} onRetroNavigate={onRetroNavigate} />,
      settings: <SettingsPage />,
    }),
    [onNavigate, onRetroNavigate, retroParams],
  );

  return (
    <>
      <AppShell route={route} onNavigate={onNavigate}>
        {/* 페이지 청크 로딩 중에도 상단 네비게이션(AppShell)은 유지한다.
            key={route} 로 같은 경로여도 nav 재클릭 시 페이지가 리마운트되도록. */}
        <Suspense fallback={null}>
          <PageRenderer key={route} route={route} pages={pages} />
        </Suspense>
      </AppShell>
      <ToastViewport notifications={state.notifications} />
      <SummaryOverlay />
      <SummaryFloatingChip />
      {isDemo && <DemoBanner />}
    </>
  );
}

function PageRenderer({
  route,
  pages,
}: {
  route: AppRoute;
  pages: Record<AppRoute, ReactNode>;
}) {
  return <>{pages[route]}</>;
}

function DemoBanner() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="lp-demo-banner">
      <span className="lp-demo-banner-label">
        <span className="lp-demo-banner-dot" />
        데모 모드 — 변경사항은 저장되지 않습니다
      </span>
      <a
        href="/signup"
        className="btn btn-primary"
        style={{ fontSize: 12, padding: "6px 14px" }}
      >
        무료로 시작 →
      </a>
      <button
        type="button"
        className="btn-icon"
        onClick={() => setHidden(true)}
        aria-label="닫기"
        style={{ fontSize: 16 }}
      >
        ✕
      </button>
    </div>
  );
}
