import { createContext, useContext, useState, type ReactNode } from "react";
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { PublicUser } from "../../../packages/shared/src/index";
import { NavigationDataContext } from "./components/navigation-state";
import { ErrorState } from "./components/ui";
import { ApiError, requestJson } from "./api-client";
import { queryRefreshInterval } from "./query-refresh";
export { ApiError } from "./api-client";
export {
  money,
  dateLabel,
  titleCase,
} from "../../../packages/shared/src/index";
let csrf = "";
let sessionUser: PublicUser | null = null;
let sessionClient: QueryClient | undefined;
let sessionRefresh: Promise<PublicUser | null> | undefined;

function refreshSession() {
  if (!sessionRefresh)
    sessionRefresh = (async () => {
      const data = await api<{ user: PublicUser | null }>("auth/me", {}, false);
      csrf = data.user?.csrf || "";
      sessionUser = data.user;
      sessionClient?.setQueryData(["auth"], data);
      return data.user;
    })().finally(() => {
      sessionRefresh = undefined;
    });
  return sessionRefresh;
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
  retrySession = true,
): Promise<T> {
  const userAtRequest = sessionUser?.id;
  const { response, data } = await requestJson(`/api/${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...options.headers,
    },
  });
  if (
    response.status === 403 &&
    retrySession &&
    (data.details?.code === "CSRF_TOKEN_INVALID" ||
      data.message === "Your session changed. Refresh the page and try again.")
  ) {
    const current = await refreshSession();
    if (!current) throw new ApiError(401, "Sign in again to continue.");
    if (userAtRequest && current.id !== userAtRequest) {
      sessionClient?.removeQueries({
        predicate: (query) =>
          !["auth", "config"].includes(String(query.queryKey[0])),
      });
      throw new ApiError(
        409,
        "Your signed-in account changed. Review the booking and submit it again.",
      );
    }
    return api<T>(path, options, false);
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.message || "Something went wrong. Please try again.",
    );
  return data;
}
export const send = <T = any,>(
  path: string,
  body: unknown = {},
  method = "POST",
) => api<T>(path, { method, body: JSON.stringify(body) });
export function useData<T = any>(
  key: string,
  path = key,
  enabled = true,
  retainPrevious = false,
) {
  const navigation = useContext(NavigationDataContext);
  const client = useQueryClient();
  const options = {
    queryKey: [key],
    queryFn: () => api<T>(path),
    enabled,
    refetchInterval: queryRefreshInterval(path),
    refetchOnWindowFocus: queryRefreshInterval(path)
      ? ("always" as const)
      : true,
    refetchOnReconnect: "always" as const,
    placeholderData:
      retainPrevious && navigation?.committed ? keepPreviousData : undefined,
  };
  const query = useQuery<T>(options);
  // Keep the current screen visible while the next route's first data loads.
  // Once mounted, forms and background refreshes keep their usual local state.
  if (enabled && navigation && !navigation.committed && query.isPending)
    throw client.fetchQuery<T>(options);
  return query;
}
type AppContextValue = {
  user: PublicUser | null;
  authLoading: boolean;
  authError: Error | null;
  config: any;
  refresh: () => Promise<void>;
  enter: (id: string) => Promise<string>;
  compare: string[];
  toggleCompare: (id: string) => void;
  clearCompare: () => void;
};
const AppContext = createContext<AppContextValue>(null!);
export function AppProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  sessionClient = client;
  const auth = useQuery<{ user: PublicUser | null }>({
    queryKey: ["auth"],
    queryFn: () => api("auth/me"),
    staleTime: 30000,
    refetchInterval: 30000,
  });
  const config = useData("config");
  csrf = auth.data?.user?.csrf || "";
  sessionUser = auth.data?.user || null;
  const [compare, setCompare] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("ff_compare") || "[]");
    } catch {
      return [];
    }
  });
  const saveCompare = (items: string[]) => {
    setCompare(items);
    sessionStorage.setItem("ff_compare", JSON.stringify(items));
  };
  const refresh = async () => {
    await client.invalidateQueries();
  };
  const enter = async (id: string) => {
    const result = await send("demo/login", { userId: id });
    csrf = "";
    client.removeQueries({
      predicate: (q) => !["auth", "config"].includes(String(q.queryKey[0])),
    });
    const me = await api<{ user: PublicUser | null }>("auth/me");
    csrf = me.user?.csrf || "";
    client.setQueryData(["auth"], me);
    return result.role as string;
  };
  const bootstrapError =
    !config.data && config.isError
      ? config.error
      : !auth.data && auth.isError
        ? auth.error
        : null;
  if (bootstrapError)
    return (
      <div className="container section">
        <ErrorState error={bootstrapError} retry={() => void refresh()} />
      </div>
    );
  return (
    <AppContext.Provider
      value={{
        user: auth.data?.user || null,
        authLoading: auth.isPending,
        authError: auth.error,
        config: config.data,
        refresh,
        enter,
        compare,
        toggleCompare: (id) => {
          if (compare.includes(id))
            saveCompare(compare.filter((x) => x !== id));
          else if (compare.length < 3) saveCompare([...compare, id]);
          else toast.info("You can compare up to three companies.");
        },
        clearCompare: () => saveCompare([]),
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export const useApp = () => useContext(AppContext);
export function useAction() {
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const run = async <T,>(
    fn: () => Promise<T>,
    message?: string,
  ): Promise<T | undefined> => {
    setBusy(true);
    try {
      const data = await fn();
      await client.invalidateQueries();
      if (message) toast.success(message);
      return data;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}
export const dashboard = (role?: string) =>
  role === "admin" || role === "support"
    ? "/admin"
    : role === "owner" || role === "staff"
      ? "/business"
      : "/account";
export const idempotency = () => crypto.randomUUID();
