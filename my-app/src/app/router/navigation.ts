import type { AppRoute } from "@/app/model/types";

const ROUTE_PATHS: Record<AppRoute, string> = {
  dashboard: "/dashboard",
  calendar: "/",
  todos: "/todos",
  retrospectives: "/retrospectives",
  settings: "/settings",
};

const PATH_PREFIX_TO_ROUTE: Array<[string, AppRoute]> = [
  ["/dashboard", "dashboard"],
  ["/todos", "todos"],
  ["/retrospectives", "retrospectives"],
  ["/settings", "settings"],
];

export interface RetroRouteParams {
  view?: "editor" | "gallery";
  entryId?: string;
}

export function getRetroParamsFromPath(pathname: string): RetroRouteParams {
  const match = pathname.match(/^\/retrospectives(?:\/([^/?]+))?(?:\/([^/?]+))?/);
  if (!match) return {};

  const [, view, id] = match;
  if (view === "editor" && id) {
    return { view: "editor", entryId: id };
  }
  if (view === "folder" && id) {
    return { view: "gallery", entryId: id };
  }
  return {};
}

export function getRetroPathFromParams(params: RetroRouteParams): string {
  if (params.view === "editor" && params.entryId) {
    return `/retrospectives/editor/${params.entryId}`;
  }
  return "/retrospectives";
}

export function getRouteFromPath(pathname: string): AppRoute {
  return (
    PATH_PREFIX_TO_ROUTE.find(([prefix]) => pathname.startsWith(prefix))?.[1] ??
    "calendar"
  );
}

export function getPathFromRoute(route: AppRoute) {
  return ROUTE_PATHS[route];
}
