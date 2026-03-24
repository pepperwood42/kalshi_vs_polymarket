import { getIntlLocale, type Locale } from "./locale";
import type {
  BreakdownRow,
  BucketGranularity,
  CanonicalCategory,
  CategoryTotals,
  DashboardSnapshot,
  DashboardViewModel,
  PlatformCategoryTotals,
  PlatformKey,
  PlatformTotals,
  SnapshotTimeframeComparison,
  SnapshotSeriesPoint,
  TimeframeKey,
  VisiblePlatformKey,
  VisiblePlatformsMode,
} from "./types";
import { CANONICAL_CATEGORIES, TIMEFRAME_KEYS } from "./types";

export type DashboardCsvLabels = {
  metadataSection: string;
  summarySection: string;
  seriesSection: string;
  categoriesSection: string;
  exportedAt: string;
  snapshotUpdated: string;
  nextSnapshot: string;
  timeframe: string;
  bucketGranularity: string;
  visibleMarkets: string;
  selectedCategories: string;
  metric: string;
  value: string;
  bucketStart: string;
  bucketLabel: string;
  category: string;
  polymarket: string;
  kalshi: string;
  combined: string;
  shareOfSelectedVolume: string;
  leaderSpread: string;
};

export class SnapshotUnavailableError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SnapshotUnavailableError";
    this.status = status;
  }
}

export class SnapshotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotValidationError";
  }
}

export const PLATFORM_LABELS: Record<VisiblePlatformKey, string> = {
  polymarket: "Polymarket",
  kalshi: "Kalshi",
};

export const PLATFORM_COLORS: Record<VisiblePlatformKey, string> = {
  polymarket: "#2E5CFF",
  kalshi: "#28CC95",
};

export const CATEGORY_COLORS: Record<CanonicalCategory, string> = {
  Sports: "#FF9F43",
  Crypto: "#F4C542",
  Politics: "#FF6B6B",
  Geopolitics: "#C084FC",
  Finance: "#2DD4BF",
  "Tech & Science": "#A3E635",
  Culture: "#FF8CC6",
  Other: "#95A3BF",
};

function moveOtherCategoryToEnd<T extends { category: CanonicalCategory }>(items: T[]) {
  return [...items].sort((left, right) => {
    if (left.category === "Other" && right.category !== "Other") {
      return 1;
    }

    if (left.category !== "Other" && right.category === "Other") {
      return -1;
    }

    return 0;
  });
}

export function orderCategoriesForDisplay(categories: CanonicalCategory[]) {
  return moveOtherCategoryToEnd(categories.map((category) => ({ category }))).map((entry) => entry.category);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalCategory(value: string): value is CanonicalCategory {
  return (CANONICAL_CATEGORIES as readonly string[]).includes(value);
}

function parseFiniteNumber(value: unknown, path: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SnapshotValidationError(`${path} must be a finite number`);
  }

  return value;
}

function parseString(value: unknown, path: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new SnapshotValidationError(`${path} must be a non-empty string`);
  }

  return value;
}

function parseDateString(value: unknown, path: string) {
  const parsed = parseString(value, path);

  if (Number.isNaN(Date.parse(parsed))) {
    throw new SnapshotValidationError(`${path} must be a valid date string`);
  }

  return parsed;
}

function parseBucketStart(value: unknown, path: string) {
  const parsed = parseString(value, path);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
    throw new SnapshotValidationError(`${path} must use YYYY-MM-DD format`);
  }

  return parsed;
}

function parseCategoryTotals(value: unknown, path: string): CategoryTotals {
  if (!isRecord(value)) {
    throw new SnapshotValidationError(`${path} must be an object`);
  }

  return Object.entries(value).reduce<CategoryTotals>((totals, [category, categoryValue]) => {
    if (!isCanonicalCategory(category)) {
      throw new SnapshotValidationError(`${path}.${category} is not a supported category`);
    }

    totals[category] = parseFiniteNumber(categoryValue, `${path}.${category}`);
    return totals;
  }, {});
}

function parsePlatformTotals(value: unknown, path: string): PlatformTotals {
  if (!isRecord(value)) {
    throw new SnapshotValidationError(`${path} must be an object`);
  }

  return {
    polymarketUsd: parseFiniteNumber(value.polymarketUsd, `${path}.polymarketUsd`),
    kalshiUsd: parseFiniteNumber(value.kalshiUsd, `${path}.kalshiUsd`),
    combinedUsd: parseFiniteNumber(value.combinedUsd, `${path}.combinedUsd`),
  };
}

function parsePlatformCategoryTotals(value: unknown, path: string): PlatformCategoryTotals {
  if (!isRecord(value)) {
    throw new SnapshotValidationError(`${path} must be an object`);
  }

  return {
    polymarket: parseCategoryTotals(value.polymarket, `${path}.polymarket`),
    kalshi: parseCategoryTotals(value.kalshi, `${path}.kalshi`),
    combined: parseCategoryTotals(value.combined, `${path}.combined`),
  };
}

function parseTimeframeComparison(value: unknown, path: string): SnapshotTimeframeComparison | null {
  if (value == null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new SnapshotValidationError(`${path} must be an object or null`);
  }

  return {
    previousPlatformTotals: parsePlatformTotals(
      value.previousPlatformTotals,
      `${path}.previousPlatformTotals`
    ),
    previousPlatformCategoryTotals: parsePlatformCategoryTotals(
      value.previousPlatformCategoryTotals,
      `${path}.previousPlatformCategoryTotals`
    ),
  };
}

function parseSeriesPoint(value: unknown, path: string): SnapshotSeriesPoint {
  if (!isRecord(value)) {
    throw new SnapshotValidationError(`${path} must be an object`);
  }

  return {
    bucketStart: parseBucketStart(value.bucketStart, `${path}.bucketStart`),
    platformTotals: parsePlatformTotals(value.platformTotals, `${path}.platformTotals`),
    platformCategoryTotals: parsePlatformCategoryTotals(
      value.platformCategoryTotals,
      `${path}.platformCategoryTotals`
    ),
  };
}

function parseBucketGranularity(value: unknown, path: string): BucketGranularity {
  if (value !== "day" && value !== "month") {
    throw new SnapshotValidationError(`${path} must be "day" or "month"`);
  }

  return value;
}

function parseTimeframe(value: unknown, path: string) {
  if (!isRecord(value)) {
    throw new SnapshotValidationError(`${path} must be an object`);
  }

  if (!Array.isArray(value.series)) {
    throw new SnapshotValidationError(`${path}.series must be an array`);
  }

  return {
    bucketGranularity: parseBucketGranularity(value.bucketGranularity, `${path}.bucketGranularity`),
    platformTotals: parsePlatformTotals(value.platformTotals, `${path}.platformTotals`),
    platformCategoryTotals: parsePlatformCategoryTotals(
      value.platformCategoryTotals,
      `${path}.platformCategoryTotals`
    ),
    comparison: parseTimeframeComparison(value.comparison ?? null, `${path}.comparison`),
    series: value.series.map((entry, index) => parseSeriesPoint(entry, `${path}.series[${index}]`)),
  };
}

function validateDashboardSnapshot(value: unknown): DashboardSnapshot {
  if (!isRecord(value)) {
    throw new SnapshotValidationError("Snapshot root must be an object");
  }

  const availableCategories = Array.isArray(value.availableCategories)
    ? value.availableCategories.map((entry, index) => {
        const parsed = parseString(entry, `availableCategories[${index}]`);

        if (!isCanonicalCategory(parsed)) {
          throw new SnapshotValidationError(`availableCategories[${index}] is not a supported category`);
        }

        return parsed;
      })
    : (() => {
        throw new SnapshotValidationError("availableCategories must be an array");
      })();

  if (!isRecord(value.timeframes)) {
    throw new SnapshotValidationError("timeframes must be an object");
  }

  const rawTimeframes = value.timeframes;
  const timeframes = TIMEFRAME_KEYS.reduce<DashboardSnapshot["timeframes"]>((accumulator, timeframe) => {
    accumulator[timeframe] = parseTimeframe(rawTimeframes[timeframe], `timeframes.${timeframe}`);
    return accumulator;
  }, {} as DashboardSnapshot["timeframes"]);

  if (!isRecord(value.source)) {
    throw new SnapshotValidationError("source must be an object");
  }

  if (
    (value.source.queryIds !== null && !isRecord(value.source.queryIds)) ||
    !isRecord(value.source.executions)
  ) {
    throw new SnapshotValidationError("source query metadata is invalid");
  }

  if (!isRecord(value.stats) || !isRecord(value.stats.rowCounts)) {
    throw new SnapshotValidationError("stats.rowCounts must be an object");
  }

  const mode =
    value.source.mode === "saved_queries" || value.source.mode === "embedded_sql"
      ? value.source.mode
      : null;

  return {
    generatedAt: parseDateString(value.generatedAt, "generatedAt"),
    nextRefreshAt: parseDateString(value.nextRefreshAt, "nextRefreshAt"),
    source: {
      provider: parseString(value.source.provider, "source.provider"),
      ...(mode ? { mode } : {}),
      queryIds:
        value.source.queryIds === null
          ? null
          : {
              polymarket: parseFiniteNumber(value.source.queryIds.polymarket, "source.queryIds.polymarket"),
              kalshi: parseFiniteNumber(value.source.queryIds.kalshi, "source.queryIds.kalshi"),
            },
      executions: {
        polymarket: parseString(value.source.executions.polymarket, "source.executions.polymarket"),
        kalshi: parseString(value.source.executions.kalshi, "source.executions.kalshi"),
      },
    },
    stats: {
      rowCounts: {
        polymarket: parseFiniteNumber(value.stats.rowCounts.polymarket, "stats.rowCounts.polymarket"),
        kalshi: parseFiniteNumber(value.stats.rowCounts.kalshi, "stats.rowCounts.kalshi"),
      },
    },
    availableCategories,
    timeframes,
  };
}

function getSnapshotUrl() {
  const baseUrl = (import.meta as ImportMeta & { env: { BASE_URL?: string } }).env.BASE_URL ?? "/";
  const url = new URL("data/dashboard-cache.json", window.location.origin + baseUrl);
  url.searchParams.set("t", Date.now().toString());
  return url;
}

export async function loadDashboardSnapshot(signal?: AbortSignal): Promise<DashboardSnapshot> {
  const requestOptions: RequestInit = signal
    ? { cache: "no-store", signal }
    : { cache: "no-store" };
  const response = await fetch(getSnapshotUrl(), requestOptions);

  if (!response.ok) {
    if (response.status === 404) {
      throw new SnapshotUnavailableError(response.status, "Dashboard snapshot is not available yet");
    }

    throw new Error(`Failed to load dashboard snapshot (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const rawBody = await response.text();

  if (contentType.includes("text/html") || rawBody.trimStart().startsWith("<!doctype")) {
    throw new SnapshotUnavailableError(404, "Dashboard snapshot is not available yet");
  }

  try {
    return validateDashboardSnapshot(JSON.parse(rawBody));
  } catch (error) {
    throw new Error(
      `Failed to parse dashboard snapshot JSON: ${error instanceof Error ? error.message : "unknown parse error"}`
    );
  }
}

function sumSelectedCategories(categoryTotals: CategoryTotals, selectedCategories: CanonicalCategory[]) {
  return selectedCategories.reduce((sum, category) => sum + (categoryTotals[category] ?? 0), 0);
}

function selectCategoryTotals(
  totals: PlatformCategoryTotals,
  selectedCategories: CanonicalCategory[]
): PlatformCategoryTotals {
  const pick = (input: CategoryTotals) =>
    selectedCategories.reduce<CategoryTotals>((accumulator, category) => {
      accumulator[category] = input[category] ?? 0;
      return accumulator;
    }, {});

  return {
    polymarket: pick(totals.polymarket),
    kalshi: pick(totals.kalshi),
    combined: pick(totals.combined),
  };
}

function getVisiblePlatforms(mode: VisiblePlatformsMode): VisiblePlatformKey[] {
  return mode === "both" ? ["polymarket", "kalshi"] : [mode];
}

function createEmptyPlatformTotals(): PlatformTotals {
  return {
    polymarketUsd: 0,
    kalshiUsd: 0,
    combinedUsd: 0,
  };
}

function calculateDeltaRatio(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return (current - previous) / previous;
}

function deriveSeriesPoint(
  point: SnapshotSeriesPoint,
  selectedCategories: CanonicalCategory[],
  bucketGranularity: BucketGranularity,
  locale: Locale,
  visiblePlatformsMode: VisiblePlatformsMode
) {
  const platformVisibility = getPlatformVisibility(visiblePlatformsMode);
  const polymarketUsd = platformVisibility.polymarket
    ? sumSelectedCategories(point.platformCategoryTotals.polymarket, selectedCategories)
    : 0;
  const kalshiUsd = platformVisibility.kalshi
    ? sumSelectedCategories(point.platformCategoryTotals.kalshi, selectedCategories)
    : 0;
  const combinedUsd = polymarketUsd + kalshiUsd;

  return {
    bucketStart: point.bucketStart,
    label: formatBucketLabel(point.bucketStart, bucketGranularity, locale),
    polymarketUsd,
    kalshiUsd,
    combinedUsd,
  };
}

function getPlatformVisibility(mode: VisiblePlatformsMode): Record<VisiblePlatformKey, boolean> {
  return {
    polymarket: mode === "both" || mode === "polymarket",
    kalshi: mode === "both" || mode === "kalshi",
  };
}

export function getNextVisiblePlatformsMode(
  current: VisiblePlatformsMode,
  clicked: VisiblePlatformKey
): VisiblePlatformsMode {
  if (current === "both") {
    return clicked === "polymarket" ? "kalshi" : "polymarket";
  }

  if (current === clicked) {
    return current;
  }

  return "both";
}

export function buildDashboardViewModel(
  snapshot: DashboardSnapshot,
  timeframe: TimeframeKey,
  selectedCategories: CanonicalCategory[],
  visiblePlatformsMode: VisiblePlatformsMode,
  locale: Locale
): DashboardViewModel {
  const timeframeData = snapshot.timeframes[timeframe];
  const filteredCategoryTotals = selectCategoryTotals(timeframeData.platformCategoryTotals, selectedCategories);
  const filteredTotals = {
    polymarketUsd: sumSelectedCategories(timeframeData.platformCategoryTotals.polymarket, selectedCategories),
    kalshiUsd: sumSelectedCategories(timeframeData.platformCategoryTotals.kalshi, selectedCategories),
    combinedUsd: 0,
  };
  filteredTotals.combinedUsd = filteredTotals.polymarketUsd + filteredTotals.kalshiUsd;
  const previousFilteredTotals = timeframeData.comparison
    ? {
        polymarketUsd: sumSelectedCategories(
          timeframeData.comparison.previousPlatformCategoryTotals.polymarket,
          selectedCategories
        ),
        kalshiUsd: sumSelectedCategories(
          timeframeData.comparison.previousPlatformCategoryTotals.kalshi,
          selectedCategories
        ),
        combinedUsd: 0,
      }
    : createEmptyPlatformTotals();
  previousFilteredTotals.combinedUsd =
    previousFilteredTotals.polymarketUsd + previousFilteredTotals.kalshiUsd;

  const platformVisibility = getPlatformVisibility(visiblePlatformsMode);
  const visiblePlatforms = getVisiblePlatforms(visiblePlatformsMode);
  const bothPlatformsVisible = visiblePlatformsMode === "both";
  const visibleTotals = {
    polymarketUsd: platformVisibility.polymarket ? filteredTotals.polymarketUsd : 0,
    kalshiUsd: platformVisibility.kalshi ? filteredTotals.kalshiUsd : 0,
    combinedUsd: 0,
  };
  visibleTotals.combinedUsd = visibleTotals.polymarketUsd + visibleTotals.kalshiUsd;
  const previousVisibleTotals = {
    polymarketUsd: platformVisibility.polymarket ? previousFilteredTotals.polymarketUsd : 0,
    kalshiUsd: platformVisibility.kalshi ? previousFilteredTotals.kalshiUsd : 0,
    combinedUsd: 0,
  };
  previousVisibleTotals.combinedUsd =
    previousVisibleTotals.polymarketUsd + previousVisibleTotals.kalshiUsd;

  const visibleSeries = timeframeData.series.map((point) =>
    deriveSeriesPoint(point, selectedCategories, timeframeData.bucketGranularity, locale, visiblePlatformsMode)
  );

  const visibleCategoryRows = selectedCategories
    .map<BreakdownRow>((category) => {
      const polymarketVolume = platformVisibility.polymarket
        ? filteredCategoryTotals.polymarket[category] ?? 0
        : 0;
      const kalshiVolume = platformVisibility.kalshi ? filteredCategoryTotals.kalshi[category] ?? 0 : 0;
      const combinedVolume = polymarketVolume + kalshiVolume;

      return {
        category,
        color: CATEGORY_COLORS[category],
        polymarketVolume,
        kalshiVolume,
        combinedVolume,
        combinedShare: visibleTotals.combinedUsd > 0 ? combinedVolume / visibleTotals.combinedUsd : 0,
      };
    })
    .sort((left, right) => {
      if (left.category === "Other" && right.category !== "Other") {
        return 1;
      }

      if (left.category !== "Other" && right.category === "Other") {
        return -1;
      }

      return right.combinedVolume - left.combinedVolume;
    });

  const visibleLeader =
    bothPlatformsVisible && visibleTotals.polymarketUsd !== visibleTotals.kalshiUsd
      ? visibleTotals.polymarketUsd > visibleTotals.kalshiUsd
        ? "polymarket"
        : "kalshi"
      : bothPlatformsVisible
        ? "polymarket"
        : null;

  return {
    timeframeData,
    selectedCategories,
    visiblePlatformsMode,
    visiblePlatforms,
    platformVisibility,
    bothPlatformsVisible,
    filteredTotals,
    visibleTotals,
    previousFilteredTotals,
    previousVisibleTotals,
    filteredCategoryTotals,
    comparison: timeframeData.comparison,
    deltaRatios: {
      polymarket: calculateDeltaRatio(visibleTotals.polymarketUsd, previousVisibleTotals.polymarketUsd),
      kalshi: calculateDeltaRatio(visibleTotals.kalshiUsd, previousVisibleTotals.kalshiUsd),
      combined: calculateDeltaRatio(visibleTotals.combinedUsd, previousVisibleTotals.combinedUsd),
    },
    visibleSeries,
    visibleCategoryRows,
    visibleLeader,
    visibleLeaderDeltaUsd:
      bothPlatformsVisible ? Math.abs(visibleTotals.polymarketUsd - visibleTotals.kalshiUsd) : 0,
  };
}

function formatBucketLabel(bucketStart: string, bucketGranularity: BucketGranularity, locale: Locale) {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    month: "short",
    year: bucketGranularity === "month" ? "numeric" : undefined,
    day: bucketGranularity === "day" ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(new Date(`${bucketStart}T00:00:00Z`));
}

export function formatCurrencyCompact(value: number, locale: Locale) {
  return new Intl.NumberFormat(getIntlLocale(locale), {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000_000 ? 1 : 0,
  }).format(value);
}

export function formatCurrencyDetailed(value: number, locale: Locale) {
  return new Intl.NumberFormat(getIntlLocale(locale), {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number, locale: Locale) {
  return new Intl.NumberFormat(getIntlLocale(locale), {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatSignedPercentDelta(value: number, locale: Locale) {
  const formatted = new Intl.NumberFormat(getIntlLocale(locale), {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: "always",
  }).format(value);

  return value === 0 ? formatted.replace(/^[-+]/, "") : formatted;
}

export function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function formatSeriesAxisLabel(bucketStart: string, granularity: BucketGranularity, locale: Locale) {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    month: "short",
    day: granularity === "day" ? "numeric" : undefined,
    year: granularity === "month" ? "2-digit" : undefined,
    timeZone: "UTC",
  }).format(new Date(`${bucketStart}T00:00:00Z`));
}

export function createEmptyCategoryTotals(): CategoryTotals {
  return CANONICAL_CATEGORIES.reduce<CategoryTotals>((totals, category) => {
    totals[category] = 0;
    return totals;
  }, {});
}

export function createEmptyPlatformCategoryTotals(): PlatformCategoryTotals {
  return {
    polymarket: createEmptyCategoryTotals(),
    kalshi: createEmptyCategoryTotals(),
    combined: createEmptyCategoryTotals(),
  };
}

export function createEmptyDashboardViewModel(
  snapshot: DashboardSnapshot,
  timeframe: TimeframeKey,
  selectedCategories: CanonicalCategory[],
  visiblePlatformsMode: VisiblePlatformsMode
): DashboardViewModel {
  const platformVisibility = getPlatformVisibility(visiblePlatformsMode);

  return {
    timeframeData: snapshot.timeframes[timeframe],
    selectedCategories,
    visiblePlatformsMode,
    visiblePlatforms: getVisiblePlatforms(visiblePlatformsMode),
    platformVisibility,
    bothPlatformsVisible: visiblePlatformsMode === "both",
    filteredTotals: createEmptyPlatformTotals(),
    visibleTotals: createEmptyPlatformTotals(),
    previousFilteredTotals: createEmptyPlatformTotals(),
    previousVisibleTotals: createEmptyPlatformTotals(),
    filteredCategoryTotals: createEmptyPlatformCategoryTotals(),
    comparison: snapshot.timeframes[timeframe].comparison,
    deltaRatios: {
      polymarket: null,
      kalshi: null,
      combined: null,
    },
    visibleSeries: [],
    visibleCategoryRows: [],
    visibleLeader: null,
    visibleLeaderDeltaUsd: 0,
  };
}

function escapeCsvCell(value: string) {
  const normalized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${normalized.replaceAll('"', '""')}"`;
}

function serializeCsvValue(value: string | number) {
  return escapeCsvCell(String(value));
}

function buildCsvDocument(rows: Array<Array<string | number>>) {
  return rows.map((row) => row.map(serializeCsvValue).join(",")).join("\r\n");
}

function buildCsvFilename(timeframe: TimeframeKey, visiblePlatformsMode: VisiblePlatformsMode) {
  const timestamp = new Date().toISOString().replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "Z");
  return `prediction-market-volume_${timeframe}_${visiblePlatformsMode}_${timestamp}.csv`;
}

export function buildDashboardCsvDocument({
  snapshot,
  view,
  timeframeLabel,
  bucketGranularityLabel,
  visibleMarketsLabel,
  selectedCategoryLabels,
  labels,
}: {
  snapshot: DashboardSnapshot;
  view: DashboardViewModel;
  timeframeLabel: string;
  bucketGranularityLabel: string;
  visibleMarketsLabel: string;
  selectedCategoryLabels: string[];
  labels: DashboardCsvLabels;
}) {
  const rows: Array<Array<string | number>> = [];

  rows.push([labels.metadataSection]);
  rows.push([labels.metric, labels.value]);
  rows.push([labels.exportedAt, new Date().toISOString()]);
  rows.push([labels.snapshotUpdated, snapshot.generatedAt]);
  rows.push([labels.nextSnapshot, snapshot.nextRefreshAt]);
  rows.push([labels.timeframe, timeframeLabel]);
  rows.push([labels.bucketGranularity, bucketGranularityLabel]);
  rows.push([labels.visibleMarkets, visibleMarketsLabel]);
  rows.push([labels.selectedCategories, selectedCategoryLabels.join(" | ")]);
  rows.push([]);

  rows.push([labels.summarySection]);
  rows.push([labels.metric, labels.value]);
  if (view.platformVisibility.polymarket) {
    rows.push([labels.polymarket, view.visibleTotals.polymarketUsd]);
  }
  if (view.platformVisibility.kalshi) {
    rows.push([labels.kalshi, view.visibleTotals.kalshiUsd]);
  }
  if (view.bothPlatformsVisible) {
    rows.push([labels.combined, view.visibleTotals.combinedUsd]);
    rows.push([labels.leaderSpread, view.visibleLeaderDeltaUsd]);
  }
  rows.push([]);

  const seriesHeader: string[] = [labels.bucketStart, labels.bucketLabel];
  if (view.platformVisibility.polymarket) {
    seriesHeader.push(labels.polymarket);
  }
  if (view.platformVisibility.kalshi) {
    seriesHeader.push(labels.kalshi);
  }
  if (view.bothPlatformsVisible) {
    seriesHeader.push(labels.combined);
  }

  rows.push([labels.seriesSection]);
  rows.push(seriesHeader);
  view.visibleSeries.forEach((point) => {
    const seriesRow: Array<string | number> = [point.bucketStart, point.label];
    if (view.platformVisibility.polymarket) {
      seriesRow.push(point.polymarketUsd);
    }
    if (view.platformVisibility.kalshi) {
      seriesRow.push(point.kalshiUsd);
    }
    if (view.bothPlatformsVisible) {
      seriesRow.push(point.combinedUsd);
    }
    rows.push(seriesRow);
  });
  rows.push([]);

  const categoryHeader: string[] = [labels.category];
  if (view.platformVisibility.polymarket) {
    categoryHeader.push(labels.polymarket);
  }
  if (view.platformVisibility.kalshi) {
    categoryHeader.push(labels.kalshi);
  }
  if (view.bothPlatformsVisible) {
    categoryHeader.push(labels.combined);
  }
  categoryHeader.push(labels.shareOfSelectedVolume);

  rows.push([labels.categoriesSection]);
  rows.push(categoryHeader);
  view.visibleCategoryRows.forEach((row) => {
    const categoryRow: Array<string | number> = [row.category];
    if (view.platformVisibility.polymarket) {
      categoryRow.push(row.polymarketVolume);
    }
    if (view.platformVisibility.kalshi) {
      categoryRow.push(row.kalshiVolume);
    }
    if (view.bothPlatformsVisible) {
      categoryRow.push(row.combinedVolume);
    }
    categoryRow.push(row.combinedShare);
    rows.push(categoryRow);
  });

  return buildCsvDocument(rows);
}

export function downloadDashboardCsvFile(
  content: string,
  timeframe: TimeframeKey,
  visiblePlatformsMode: VisiblePlatformsMode
) {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = buildCsvFilename(timeframe, visiblePlatformsMode);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}
