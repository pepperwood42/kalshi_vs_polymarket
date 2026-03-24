import { useCallback, useEffect, useRef, useState } from "react";
import { loadDashboardSnapshot, SnapshotUnavailableError } from "./dashboard";
import type { DashboardSnapshot, DashboardSnapshotState, SnapshotPhase } from "./types";
import type { Locale } from "./locale";

const SNAPSHOT_RETRY_MS = 10_000;
const SNAPSHOT_POLL_MS = 30_000;
const SNAPSHOT_STALE_GRACE_MS = 5 * 60_000;

type SnapshotLifecycleState = Omit<DashboardSnapshotState, "retryNow">;

function getUnknownLoadError(locale: Locale) {
  return locale === "ru" ? "Неизвестная ошибка загрузки дашборда" : "Unknown dashboard load error";
}

export function useDashboardSnapshot(locale: Locale): DashboardSnapshotState {
  const [state, setState] = useState<SnapshotLifecycleState>({
    phase: "loading",
    snapshot: null,
    lastSuccessfulSnapshot: null,
    retryAt: null,
    countdownSeconds: 0,
    lastRefreshAttemptAt: null,
    lastRefreshError: null,
  });
  const stateRef = useRef(state);
  const localeRef = useRef(locale);
  const retryTimeoutRef = useRef<number | null>(null);
  const staleTimeoutRef = useRef<number | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  const clearScheduledRetry = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const clearStaleTimer = useCallback(() => {
    if (staleTimeoutRef.current !== null) {
      window.clearTimeout(staleTimeoutRef.current);
      staleTimeoutRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback(
    (delayMs: number, callback: () => void) => {
      clearScheduledRetry();
      retryTimeoutRef.current = window.setTimeout(callback, delayMs);
    },
    [clearScheduledRetry]
  );

  const scheduleStaleTransition = useCallback(
    (snapshot: DashboardSnapshot) => {
      clearStaleTimer();

      const staleAt = Date.parse(snapshot.nextRefreshAt) + SNAPSHOT_STALE_GRACE_MS;
      const delayMs = staleAt - Date.now();

      if (delayMs <= 0) {
        setState((current) =>
          current.lastSuccessfulSnapshot?.generatedAt === snapshot.generatedAt && current.phase === "ready"
            ? { ...current, phase: "degraded" }
            : current
        );
        return;
      }

      staleTimeoutRef.current = window.setTimeout(() => {
        setState((current) =>
          current.lastSuccessfulSnapshot?.generatedAt === snapshot.generatedAt && current.phase === "ready"
            ? { ...current, phase: "degraded" }
            : current
        );
      }, delayMs);
    },
    [clearStaleTimer]
  );

  const attemptRefreshRef = useRef<(() => Promise<void>) | null>(null);

  const attemptRefresh = useCallback(async () => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = new AbortController();

    const attemptedAt = new Date().toISOString();
    const hasSuccessfulSnapshot = stateRef.current.lastSuccessfulSnapshot !== null;

    setState((current) => ({
      ...current,
      phase: hasSuccessfulSnapshot
        ? current.phase === "degraded"
          ? "degraded"
          : "ready"
        : current.phase === "waiting"
          ? "waiting"
          : "loading",
      lastRefreshAttemptAt: attemptedAt,
      retryAt: null,
      countdownSeconds: 0,
    }));

    try {
      const snapshot = await loadDashboardSnapshot(requestControllerRef.current.signal);

      setState((current) => {
        const baseState: SnapshotLifecycleState = {
          ...current,
          phase: "ready",
          snapshot,
          lastSuccessfulSnapshot: snapshot,
          retryAt: null,
          countdownSeconds: 0,
          lastRefreshAttemptAt: attemptedAt,
          lastRefreshError: null,
        };

        if (
          current.lastSuccessfulSnapshot?.generatedAt === snapshot.generatedAt &&
          current.phase === "ready" &&
          current.lastRefreshError === null
        ) {
          return {
            ...current,
            phase: "ready" as SnapshotPhase,
            retryAt: null,
            countdownSeconds: 0,
            lastRefreshAttemptAt: attemptedAt,
          };
        }

        return baseState;
      });

      scheduleStaleTransition(snapshot);
      scheduleRetry(SNAPSHOT_POLL_MS, () => {
        void attemptRefreshRef.current?.();
      });
    } catch (error) {
      if (requestControllerRef.current?.signal.aborted) {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : getUnknownLoadError(localeRef.current);

      if (error instanceof SnapshotUnavailableError) {
        if (hasSuccessfulSnapshot) {
          setState((current) => ({
            ...current,
            phase: "degraded",
            snapshot: current.lastSuccessfulSnapshot,
            retryAt: Date.now() + SNAPSHOT_RETRY_MS,
            countdownSeconds: Math.ceil(SNAPSHOT_RETRY_MS / 1000),
            lastRefreshAttemptAt: attemptedAt,
            lastRefreshError: errorMessage,
          }));
        } else {
          setState((current) => ({
            ...current,
            phase: "waiting",
            retryAt: Date.now() + SNAPSHOT_RETRY_MS,
            countdownSeconds: Math.ceil(SNAPSHOT_RETRY_MS / 1000),
            lastRefreshAttemptAt: attemptedAt,
            lastRefreshError: null,
          }));
        }

        scheduleRetry(SNAPSHOT_RETRY_MS, () => {
          void attemptRefreshRef.current?.();
        });
        return;
      }

      if (hasSuccessfulSnapshot) {
        setState((current) => ({
          ...current,
          phase: "degraded",
          snapshot: current.lastSuccessfulSnapshot,
          lastRefreshAttemptAt: attemptedAt,
          lastRefreshError: errorMessage,
        }));
        scheduleRetry(SNAPSHOT_POLL_MS, () => {
          void attemptRefreshRef.current?.();
        });
        return;
      }

      setState((current) => ({
        ...current,
        phase: "error",
        lastRefreshAttemptAt: attemptedAt,
        lastRefreshError: errorMessage,
      }));
      scheduleRetry(SNAPSHOT_RETRY_MS, () => {
        void attemptRefreshRef.current?.();
      });
    }
  }, [scheduleRetry, scheduleStaleTransition]);

  attemptRefreshRef.current = attemptRefresh;

  const retryNow = useCallback(() => {
    clearScheduledRetry();
    void attemptRefreshRef.current?.();
  }, [clearScheduledRetry]);

  useEffect(() => {
    void attemptRefresh();

    return () => {
      clearScheduledRetry();
      clearStaleTimer();
      requestControllerRef.current?.abort();
    };
  }, [attemptRefresh, clearScheduledRetry, clearStaleTimer]);

  useEffect(() => {
    if (state.phase !== "waiting" || state.retryAt === null) {
      return undefined;
    }

    const tick = () => {
      setState((current) =>
        current.retryAt === null
          ? current
          : {
              ...current,
              countdownSeconds: Math.max(0, Math.ceil((current.retryAt - Date.now()) / 1000)),
            }
      );
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [state.phase, state.retryAt]);

  return {
    ...state,
    retryNow,
  };
}
