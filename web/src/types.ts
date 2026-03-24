export const CANONICAL_CATEGORIES = [
  "Sports",
  "Crypto",
  "Politics",
  "Geopolitics",
  "Finance",
  "Tech & Science",
  "Culture",
  "Other",
] as const;

export const TIMEFRAME_KEYS = ["7d", "30d", "90d", "allTime"] as const;

export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];
export type PlatformKey = "polymarket" | "kalshi" | "combined";
export type VisiblePlatformKey = Exclude<PlatformKey, "combined">;
export type VisiblePlatformsMode = "both" | VisiblePlatformKey;
export type CategorySelectionMode = "all" | "custom";
export type TimeframeKey = (typeof TIMEFRAME_KEYS)[number];
export type BucketGranularity = "day" | "month";
export type SnapshotPhase = "loading" | "waiting" | "ready" | "degraded" | "error";

export type CategoryTotals = Partial<Record<CanonicalCategory, number>>;

export interface PlatformTotals {
  polymarketUsd: number;
  kalshiUsd: number;
  combinedUsd: number;
}

export interface PlatformCategoryTotals {
  polymarket: CategoryTotals;
  kalshi: CategoryTotals;
  combined: CategoryTotals;
}

export interface SnapshotSeriesPoint {
  bucketStart: string;
  platformTotals: PlatformTotals;
  platformCategoryTotals: PlatformCategoryTotals;
}

export interface SnapshotTimeframe {
  bucketGranularity: BucketGranularity;
  platformTotals: PlatformTotals;
  platformCategoryTotals: PlatformCategoryTotals;
  comparison: SnapshotTimeframeComparison | null;
  series: SnapshotSeriesPoint[];
}

export interface SnapshotTimeframeComparison {
  previousPlatformTotals: PlatformTotals;
  previousPlatformCategoryTotals: PlatformCategoryTotals;
}

export interface DashboardSnapshot {
  generatedAt: string;
  nextRefreshAt: string;
  source: {
    provider: string;
    mode?: "saved_queries" | "embedded_sql";
    queryIds:
      | {
          polymarket: number;
          kalshi: number;
        }
      | null;
    executions: {
      polymarket: string;
      kalshi: string;
    };
  };
  stats: {
    rowCounts: {
      polymarket: number;
      kalshi: number;
    };
  };
  availableCategories: CanonicalCategory[];
  timeframes: Record<TimeframeKey, SnapshotTimeframe>;
}

export interface DerivedSeriesPoint {
  bucketStart: string;
  label: string;
  polymarketUsd: number;
  kalshiUsd: number;
  combinedUsd: number;
}

export interface BreakdownRow {
  category: CanonicalCategory;
  color: string;
  polymarketVolume: number;
  kalshiVolume: number;
  combinedVolume: number;
  combinedShare: number;
}

export interface DashboardViewModel {
  timeframeData: SnapshotTimeframe;
  selectedCategories: CanonicalCategory[];
  visiblePlatformsMode: VisiblePlatformsMode;
  visiblePlatforms: VisiblePlatformKey[];
  platformVisibility: Record<VisiblePlatformKey, boolean>;
  bothPlatformsVisible: boolean;
  filteredTotals: PlatformTotals;
  visibleTotals: PlatformTotals;
  previousFilteredTotals: PlatformTotals;
  previousVisibleTotals: PlatformTotals;
  filteredCategoryTotals: PlatformCategoryTotals;
  comparison: SnapshotTimeframeComparison | null;
  deltaRatios: {
    polymarket: number | null;
    kalshi: number | null;
    combined: number | null;
  };
  visibleSeries: DerivedSeriesPoint[];
  visibleCategoryRows: BreakdownRow[];
  visibleLeader: VisiblePlatformKey | null;
  visibleLeaderDeltaUsd: number;
}

export interface DashboardSnapshotState {
  phase: SnapshotPhase;
  snapshot: DashboardSnapshot | null;
  lastSuccessfulSnapshot: DashboardSnapshot | null;
  retryAt: number | null;
  countdownSeconds: number;
  lastRefreshAttemptAt: string | null;
  lastRefreshError: string | null;
  retryNow: () => void;
}
