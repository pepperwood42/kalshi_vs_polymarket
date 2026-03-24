import "dotenv/config";

import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

type Platform = "polymarket" | "kalshi";
type Timeframe = "7d" | "30d" | "90d" | "allTime";
type ComparisonTimeframe = Exclude<Timeframe, "allTime">;
type BucketGranularity = "day" | "month";

type DuneExecutionResponse = {
  execution_id?: string;
};

type DuneExecutionStatus = {
  is_execution_finished?: boolean;
  state?: string;
  error?: {
    message?: string;
  };
};

type DuneExecutionResultsPage = {
  result?: {
    rows?: Array<Record<string, unknown>>;
    next_offset?: number | null;
    next_uri?: string | null;
  };
  rows?: Array<Record<string, unknown>>;
  next_offset?: number | null;
  next_uri?: string | null;
  error?: {
    message?: string;
  };
};

type DuneBucketRow = {
  window_kind?: string;
  timeframe?: string;
  bucket_granularity?: string;
  bucket_start?: string;
  category?: string;
  volume_usd?: number | string;
  trades_count?: number | string | null;
};

type CategoryTotals = Record<string, number>;

type CacheComparison = {
  previousPlatformTotals: {
    polymarketUsd: number;
    kalshiUsd: number;
    combinedUsd: number;
  };
  previousPlatformCategoryTotals: {
    polymarket: CategoryTotals;
    kalshi: CategoryTotals;
    combined: CategoryTotals;
  };
};

type CacheSeriesPoint = {
  bucketStart: string;
  platformTotals: {
    polymarketUsd: number;
    kalshiUsd: number;
    combinedUsd: number;
  };
  platformCategoryTotals: {
    polymarket: CategoryTotals;
    kalshi: CategoryTotals;
    combined: CategoryTotals;
  };
};

type CacheTimeframe = {
  bucketGranularity: BucketGranularity;
  platformTotals: {
    polymarketUsd: number;
    kalshiUsd: number;
    combinedUsd: number;
  };
  platformCategoryTotals: {
    polymarket: CategoryTotals;
    kalshi: CategoryTotals;
    combined: CategoryTotals;
  };
  comparison: CacheComparison | null;
  series: CacheSeriesPoint[];
};

type CachePayload = {
  generatedAt: string;
  nextRefreshAt: string;
  source: {
    provider: "Dune";
    mode: "embedded_sql";
    queryIds: null;
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
  availableCategories: string[];
  timeframes: Record<Timeframe, CacheTimeframe>;
};

type QueryRunResult<T extends Record<string, unknown>> = {
  executionId: string;
  rows: T[];
};

const TIMEFRAMES: Timeframe[] = ["7d", "30d", "90d", "allTime"];
const COMPARISON_TIMEFRAMES: ComparisonTimeframe[] = ["7d", "30d", "90d"];
const PLATFORM_ORDER: Platform[] = ["polymarket", "kalshi"];

type AppConfig = {
  duneApiKey: string;
  duneBaseUrl: string;
  dunePerformance: string;
  outputFile: string;
  pollIntervalMs: number;
  pollMaxAttempts: number;
  resultsPageLimit: number;
  refreshIntervalHours: number;
};

export type RefreshRunResult = {
  generatedAt: string;
  nextRefreshAt: string;
  outputFile: string;
  rowCounts: {
    polymarket: number;
    kalshi: number;
  };
};

function readNumberEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }

  return parsed;
}

function resolveOutputFile(): string {
  const rawOutputFile = process.env.OUTPUT_FILE;
  if (!rawOutputFile) {
    return path.resolve(process.cwd(), "..", "web", "public", "data", "dashboard-cache.json");
  }

  return path.isAbsolute(rawOutputFile)
    ? rawOutputFile
    : path.resolve(process.cwd(), rawOutputFile);
}

export function getConfig(): AppConfig {
  const duneApiKey = process.env.DUNE_API_KEY ?? "";
  if (!duneApiKey) {
    throw new Error("DUNE_API_KEY is required to run worker/src/refresh-cache.ts");
  }

  return {
    duneApiKey,
    duneBaseUrl: process.env.DUNE_BASE_URL ?? "https://api.dune.com/api/v1",
    dunePerformance: process.env.DUNE_PERFORMANCE ?? "medium",
    outputFile: resolveOutputFile(),
    pollIntervalMs: readNumberEnv("POLL_INTERVAL_MS", 2000),
    pollMaxAttempts: readNumberEnv("POLL_MAX_ATTEMPTS", 90),
    resultsPageLimit: readNumberEnv("RESULTS_PAGE_LIMIT", 5000),
    refreshIntervalHours: readNumberEnv("REFRESH_INTERVAL_HOURS", 1)
  };
}

function num(value: number | string | null | undefined): number {
  if (value == null || value === "") {
    return 0;
  }
  return Number(value);
}

function roundUsd(value: number): number {
  return Math.round(value);
}

function normalizeBucketStart(value: string | undefined): string {
  return String(value ?? "").slice(0, 10);
}

function normalizeTimeframe(value: string | undefined): Timeframe {
  if (value === "7d" || value === "30d" || value === "90d" || value === "allTime") {
    return value;
  }
  throw new Error(`Unexpected timeframe from Dune: ${String(value)}`);
}

function normalizeBucketGranularity(value: string | undefined): BucketGranularity {
  if (value === "day" || value === "month") {
    return value;
  }
  throw new Error(`Unexpected bucket_granularity from Dune: ${String(value)}`);
}

function normalizeWindowKind(value: string | undefined): "current" | "previous" {
  if (value === "current" || value === "previous") {
    return value;
  }

  throw new Error(`Unexpected window_kind from Dune: ${String(value)}`);
}

function normalizeComparisonTimeframe(value: string | undefined): ComparisonTimeframe {
  if (value === "7d" || value === "30d" || value === "90d") {
    return value;
  }

  throw new Error(`Unexpected comparison timeframe from Dune: ${String(value)}`);
}

function sortFlatRecord(source: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    Array.from(source.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, roundUsd(value)])
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed ${response.status} ${response.statusText} for ${url}\n${text}`);
  }
  return response.json() as Promise<T>;
}

async function executeSql(config: AppConfig, sql: string): Promise<string> {
  const response = await fetchJson<DuneExecutionResponse>(`${config.duneBaseUrl}/sql/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-DUNE-API-KEY": config.duneApiKey
    },
    body: JSON.stringify({
      sql,
      performance: config.dunePerformance
    })
  });

  if (!response.execution_id) {
    throw new Error("Dune SQL execute returned no execution_id");
  }

  return response.execution_id;
}

async function waitForExecution(config: AppConfig, executionId: string): Promise<void> {
  for (let attempt = 0; attempt < config.pollMaxAttempts; attempt += 1) {
    const status = await fetchJson<DuneExecutionStatus>(
      `${config.duneBaseUrl}/execution/${executionId}/status`,
      {
        headers: {
          "X-DUNE-API-KEY": config.duneApiKey
        }
      }
    );

    if (status.is_execution_finished) {
      if (
        status.state !== "QUERY_STATE_COMPLETED" &&
        status.state !== "QUERY_STATE_COMPLETED_PARTIAL"
      ) {
        throw new Error(
          `Dune query failed for execution ${executionId}: ${status.error?.message ?? status.state ?? "unknown state"}`
        );
      }
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }

  throw new Error(`Timed out waiting for Dune execution ${executionId}`);
}

async function getExecutionRows<T extends Record<string, unknown>>(
  config: AppConfig,
  executionId: string
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${config.duneBaseUrl}/execution/${executionId}/results`);
    url.searchParams.set("limit", String(config.resultsPageLimit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("allow_partial_results", "true");

    const page = await fetchJson<DuneExecutionResultsPage>(url.toString(), {
      headers: {
        "X-DUNE-API-KEY": config.duneApiKey
      }
    });

    if (page.error?.message) {
      throw new Error(page.error.message);
    }

    const pageRows = (page.result?.rows ?? page.rows ?? []) as T[];
    rows.push(...pageRows);

    const nextOffset = page.result?.next_offset ?? page.next_offset ?? null;
    if (nextOffset == null) {
      break;
    }

    offset = nextOffset;
  }

  return rows;
}

async function runSqlQuery<T extends Record<string, unknown>>(
  config: AppConfig,
  sql: string
): Promise<QueryRunResult<T>> {
  const executionId = await executeSql(config, sql);
  await waitForExecution(config, executionId);
  const rows = await getExecutionRows<T>(config, executionId);
  return {
    executionId,
    rows
  };
}

function accumulateCategory(target: Map<string, number>, category: string, value: number): void {
  target.set(category, (target.get(category) ?? 0) + value);
}

function combineCategoryRecords(...records: Array<Record<string, number>>): Record<string, number> {
  const combined = new Map<string, number>();
  for (const record of records) {
    for (const [category, volumeUsd] of Object.entries(record)) {
      accumulateCategory(combined, category, Number(volumeUsd));
    }
  }
  return sortFlatRecord(combined);
}

function splitSnapshotRows(rows: DuneBucketRow[]) {
  return rows.reduce(
    (accumulator, row) => {
      const windowKind = normalizeWindowKind(row.window_kind);

      if (windowKind === "current") {
        accumulator.current.push(row);
      } else {
        accumulator.previous.push(row);
      }

      return accumulator;
    },
    {
      current: [] as DuneBucketRow[],
      previous: [] as DuneBucketRow[]
    }
  );
}

function buildPlatformTimeframes(rows: DuneBucketRow[]): Record<
  Timeframe,
  {
    bucketGranularity: BucketGranularity;
    totalUsd: number;
    categoryTotals: Record<string, number>;
    series: Array<{
      bucketStart: string;
      totalUsd: number;
      categoryTotals: Record<string, number>;
    }>;
  }
> {
  const timeframeState = new Map<
    Timeframe,
    {
      bucketGranularity: BucketGranularity;
      categoryTotals: Map<string, number>;
      buckets: Map<string, { totalUsd: number; categoryTotals: Map<string, number> }>;
    }
  >();

  for (const row of rows) {
    const timeframe = normalizeTimeframe(row.timeframe);
    const bucketGranularity = normalizeBucketGranularity(row.bucket_granularity);
    const bucketStart = normalizeBucketStart(row.bucket_start);
    const category = String(row.category ?? "Other");
    const volumeUsd = num(row.volume_usd);

    if (!bucketStart) {
      continue;
    }

    if (!timeframeState.has(timeframe)) {
      timeframeState.set(timeframe, {
        bucketGranularity,
        categoryTotals: new Map<string, number>(),
        buckets: new Map<string, { totalUsd: number; categoryTotals: Map<string, number> }>()
      });
    }

    const state = timeframeState.get(timeframe)!;
    state.bucketGranularity = bucketGranularity;
    accumulateCategory(state.categoryTotals, category, volumeUsd);

    if (!state.buckets.has(bucketStart)) {
      state.buckets.set(bucketStart, {
        totalUsd: 0,
        categoryTotals: new Map<string, number>()
      });
    }

    const bucket = state.buckets.get(bucketStart)!;
    bucket.totalUsd += volumeUsd;
    accumulateCategory(bucket.categoryTotals, category, volumeUsd);
  }

  const result = {} as Record<
    Timeframe,
    {
      bucketGranularity: BucketGranularity;
      totalUsd: number;
      categoryTotals: Record<string, number>;
      series: Array<{
        bucketStart: string;
        totalUsd: number;
        categoryTotals: Record<string, number>;
      }>;
    }
  >;

  for (const timeframe of TIMEFRAMES) {
    const state = timeframeState.get(timeframe);
    if (!state) {
      throw new Error(`Missing timeframe ${timeframe} in Dune result`);
    }

    const categoryTotals = sortFlatRecord(state.categoryTotals);
    const series = Array.from(state.buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucketStart, bucket]) => ({
        bucketStart,
        totalUsd: roundUsd(bucket.totalUsd),
        categoryTotals: sortFlatRecord(bucket.categoryTotals)
      }));

    result[timeframe] = {
      bucketGranularity: state.bucketGranularity,
      totalUsd: Object.values(categoryTotals).reduce((sum, value) => sum + Number(value), 0),
      categoryTotals,
      series
    };
  }

  return result;
}

function mergePlatforms(
  polymarket: ReturnType<typeof buildPlatformTimeframes>,
  kalshi: ReturnType<typeof buildPlatformTimeframes>,
  comparisons: Record<ComparisonTimeframe, CacheComparison>
): Record<Timeframe, CacheTimeframe> {
  const output = {} as Record<Timeframe, CacheTimeframe>;

  for (const timeframe of TIMEFRAMES) {
    const polymarketFrame = polymarket[timeframe];
    const kalshiFrame = kalshi[timeframe];

    if (polymarketFrame.bucketGranularity !== kalshiFrame.bucketGranularity) {
      throw new Error(
        `Mismatched bucket granularity for ${timeframe}: ${polymarketFrame.bucketGranularity} vs ${kalshiFrame.bucketGranularity}`
      );
    }

    const allBucketStarts = new Set<string>([
      ...polymarketFrame.series.map((item) => item.bucketStart),
      ...kalshiFrame.series.map((item) => item.bucketStart)
    ]);

    const polymarketBuckets = new Map(polymarketFrame.series.map((item) => [item.bucketStart, item]));
    const kalshiBuckets = new Map(kalshiFrame.series.map((item) => [item.bucketStart, item]));

    const series: CacheSeriesPoint[] = Array.from(allBucketStarts)
      .sort((a, b) => a.localeCompare(b))
      .map((bucketStart) => {
        const polymarketBucket = polymarketBuckets.get(bucketStart);
        const kalshiBucket = kalshiBuckets.get(bucketStart);
        const polymarketCategoryTotals = polymarketBucket?.categoryTotals ?? {};
        const kalshiCategoryTotals = kalshiBucket?.categoryTotals ?? {};
        const polymarketUsd = polymarketBucket?.totalUsd ?? 0;
        const kalshiUsd = kalshiBucket?.totalUsd ?? 0;

        return {
          bucketStart,
          platformTotals: {
            polymarketUsd,
            kalshiUsd,
            combinedUsd: roundUsd(polymarketUsd + kalshiUsd)
          },
          platformCategoryTotals: {
            polymarket: polymarketCategoryTotals,
            kalshi: kalshiCategoryTotals,
            combined: combineCategoryRecords(polymarketCategoryTotals, kalshiCategoryTotals)
          }
        };
      });

    output[timeframe] = {
      bucketGranularity: polymarketFrame.bucketGranularity,
      platformTotals: {
        polymarketUsd: polymarketFrame.totalUsd,
        kalshiUsd: kalshiFrame.totalUsd,
        combinedUsd: roundUsd(polymarketFrame.totalUsd + kalshiFrame.totalUsd)
      },
      platformCategoryTotals: {
        polymarket: polymarketFrame.categoryTotals,
        kalshi: kalshiFrame.categoryTotals,
        combined: combineCategoryRecords(polymarketFrame.categoryTotals, kalshiFrame.categoryTotals)
      },
      comparison: timeframe === "allTime" ? null : comparisons[timeframe],
      series
    };
  }

  return output;
}

function collectAvailableCategories(timeframes: Record<Timeframe, CacheTimeframe>): string[] {
  const categories = new Set<string>();

  for (const timeframe of TIMEFRAMES) {
    const frame = timeframes[timeframe];
    for (const platform of PLATFORM_ORDER) {
      for (const category of Object.keys(frame.platformCategoryTotals[platform])) {
        categories.add(category);
      }
    }
  }

  return Array.from(categories).sort((a, b) => a.localeCompare(b));
}

function buildPolymarketSnapshotSql(): string {
  return `
WITH bounds AS (
  SELECT
    CAST(current_date AS DATE) AS today_utc
),
details_dedup AS (
  SELECT
    from_hex(substr(condition_id, 3)) AS condition_id_bin,
    lower(coalesce(arbitrary(tags), '')) AS tags
  FROM polymarket_polygon.market_details
  GROUP BY 1
),
trade_buckets AS (
  SELECT
    'day' AS bucket_granularity,
    CAST(date_trunc('day', t.block_time) AS DATE) AS bucket_start,
    t.condition_id,
    SUM(t.amount) AS volume_usd,
    COUNT(*) AS trades_count
  FROM polymarket_polygon.market_trades t
  CROSS JOIN bounds b
  WHERE t.action = 'CLOB trade'
    AND t.block_time >= CAST(b.today_utc - INTERVAL '180' DAY AS TIMESTAMP)
    AND t.block_time < CAST(b.today_utc AS TIMESTAMP)
  GROUP BY 1, 2, 3

  UNION ALL

  SELECT
    'month' AS bucket_granularity,
    CAST(date_trunc('month', t.block_time) AS DATE) AS bucket_start,
    t.condition_id,
    SUM(t.amount) AS volume_usd,
    COUNT(*) AS trades_count
  FROM polymarket_polygon.market_trades t
  CROSS JOIN bounds b
  WHERE t.action = 'CLOB trade'
    AND t.block_time < CAST(b.today_utc AS TIMESTAMP)
  GROUP BY 1, 2, 3
),
classified AS (
  SELECT
    tb.bucket_granularity,
    tb.bucket_start,
    CASE
      WHEN regexp_like(d.tags, 'sports|soccer|football|basketball|tennis|baseball|mma|ufc|golf|esports|games|league of legends|lol|nhl|hockey|premier league|epl|bundesliga|la liga|ligue 1|mls|march madness|ncaa') THEN 'Sports'
      WHEN regexp_like(d.tags, 'crypto|bitcoin|ethereum|solana|crypto prices|defi|ripple|xrp|hyperliquid|hype') THEN 'Crypto'
      WHEN regexp_like(d.tags, 'politics|elections|trump|biden|congress|white house|primaries|us election') THEN 'Politics'
      WHEN regexp_like(d.tags, 'world|geopolitics|middle east|ukraine|russia|china|iran|israel|war|diplomacy|ceasefire') THEN 'Geopolitics'
      WHEN regexp_like(d.tags, 'finance|business|economy|fed|inflation|stocks|earnings|macro') THEN 'Finance'
      WHEN regexp_like(d.tags, 'technology|tech|science|ai|climate|space') THEN 'Tech & Science'
      WHEN regexp_like(d.tags, 'culture|music|awards|grammys|movies|entertainment|celebrities|tweet markets') THEN 'Culture'
      ELSE 'Other'
    END AS category,
    tb.volume_usd,
    tb.trades_count
  FROM trade_buckets tb
  LEFT JOIN details_dedup d
    ON tb.condition_id = d.condition_id_bin
),
rolled AS (
  SELECT
    bucket_granularity,
    bucket_start,
    category,
    SUM(volume_usd) AS volume_usd,
    SUM(trades_count) AS trades_count
  FROM classified
  GROUP BY 1, 2, 3
)
SELECT
  'current' AS window_kind,
  '7d' AS timeframe,
  'day' AS bucket_granularity,
  bucket_start,
  category,
  volume_usd,
  trades_count
FROM rolled
CROSS JOIN bounds b
WHERE rolled.bucket_granularity = 'day'
  AND rolled.bucket_start >= b.today_utc - INTERVAL '7' DAY
  AND rolled.bucket_start < b.today_utc

UNION ALL

SELECT
  'current' AS window_kind,
  '30d' AS timeframe,
  'day' AS bucket_granularity,
  bucket_start,
  category,
  volume_usd,
  trades_count
FROM rolled
CROSS JOIN bounds b
WHERE rolled.bucket_granularity = 'day'
  AND rolled.bucket_start >= b.today_utc - INTERVAL '30' DAY
  AND rolled.bucket_start < b.today_utc

UNION ALL

SELECT
  'current' AS window_kind,
  '90d' AS timeframe,
  'day' AS bucket_granularity,
  bucket_start,
  category,
  volume_usd,
  trades_count
FROM rolled
CROSS JOIN bounds b
WHERE rolled.bucket_granularity = 'day'
  AND rolled.bucket_start >= b.today_utc - INTERVAL '90' DAY
  AND rolled.bucket_start < b.today_utc

UNION ALL

SELECT
  'current' AS window_kind,
  'allTime' AS timeframe,
  'month' AS bucket_granularity,
  bucket_start,
  category,
  volume_usd,
  trades_count
FROM rolled
WHERE rolled.bucket_granularity = 'month'

UNION ALL

SELECT
  'previous' AS window_kind,
  '7d' AS timeframe,
  'day' AS bucket_granularity,
  bucket_start,
  category,
  volume_usd,
  trades_count
FROM rolled
CROSS JOIN bounds b
WHERE rolled.bucket_granularity = 'day'
  AND rolled.bucket_start >= b.today_utc - INTERVAL '14' DAY
  AND rolled.bucket_start < b.today_utc - INTERVAL '7' DAY

UNION ALL

SELECT
  'previous' AS window_kind,
  '30d' AS timeframe,
  'day' AS bucket_granularity,
  bucket_start,
  category,
  volume_usd,
  trades_count
FROM rolled
CROSS JOIN bounds b
WHERE rolled.bucket_granularity = 'day'
  AND rolled.bucket_start >= b.today_utc - INTERVAL '60' DAY
  AND rolled.bucket_start < b.today_utc - INTERVAL '30' DAY

UNION ALL

SELECT
  'previous' AS window_kind,
  '90d' AS timeframe,
  'day' AS bucket_granularity,
  bucket_start,
  category,
  volume_usd,
  trades_count
FROM rolled
CROSS JOIN bounds b
WHERE rolled.bucket_granularity = 'day'
  AND rolled.bucket_start >= b.today_utc - INTERVAL '180' DAY
  AND rolled.bucket_start < b.today_utc - INTERVAL '90' DAY

ORDER BY 1, 2, 4, 5
`.trim();
}

function buildKalshiSnapshotSql(): string {
  return `
WITH bounds AS (
  SELECT
    CAST(current_date AS DATE) AS today_utc
),
daily_canonical AS (
  SELECT
    CAST(date AS DATE) AS day,
    CASE
      WHEN lower(trim(category)) = 'sports' THEN 'Sports'
      WHEN lower(trim(category)) = 'crypto' THEN 'Crypto'
      WHEN lower(trim(category)) IN ('politics', 'elections') THEN 'Politics'
      WHEN lower(trim(category)) = 'world' THEN 'Geopolitics'
      WHEN lower(trim(category)) IN ('economics', 'financials', 'companies') THEN 'Finance'
      WHEN lower(trim(category)) IN ('science and technology', 'climate and weather', 'health', 'education', 'transportation') THEN 'Tech & Science'
      WHEN lower(trim(category)) IN ('entertainment', 'social', 'mentions') THEN 'Culture'
      ELSE 'Other'
    END AS category,
    SUM(daily_volume) AS volume_usd
  FROM kalshi.market_report
  GROUP BY 1, 2
),
monthly_canonical AS (
  SELECT
    CAST(date_trunc('month', day) AS DATE) AS bucket_start,
    category,
    SUM(volume_usd) AS volume_usd
  FROM daily_canonical
  GROUP BY 1, 2
)
SELECT
  'current' AS window_kind,
  '7d' AS timeframe,
  'day' AS bucket_granularity,
  day AS bucket_start,
  category,
  volume_usd,
  CAST(NULL AS BIGINT) AS trades_count
FROM daily_canonical
CROSS JOIN bounds b
WHERE day >= b.today_utc - INTERVAL '7' DAY
  AND day < b.today_utc

UNION ALL

SELECT
  'current' AS window_kind,
  '30d' AS timeframe,
  'day' AS bucket_granularity,
  day AS bucket_start,
  category,
  volume_usd,
  CAST(NULL AS BIGINT) AS trades_count
FROM daily_canonical
CROSS JOIN bounds b
WHERE day >= b.today_utc - INTERVAL '30' DAY
  AND day < b.today_utc

UNION ALL

SELECT
  'current' AS window_kind,
  '90d' AS timeframe,
  'day' AS bucket_granularity,
  day AS bucket_start,
  category,
  volume_usd,
  CAST(NULL AS BIGINT) AS trades_count
FROM daily_canonical
CROSS JOIN bounds b
WHERE day >= b.today_utc - INTERVAL '90' DAY
  AND day < b.today_utc

UNION ALL

SELECT
  'current' AS window_kind,
  'allTime' AS timeframe,
  'month' AS bucket_granularity,
  bucket_start,
  category,
  volume_usd,
  CAST(NULL AS BIGINT) AS trades_count
FROM monthly_canonical

UNION ALL

SELECT
  'previous' AS window_kind,
  '7d' AS timeframe,
  'day' AS bucket_granularity,
  day AS bucket_start,
  category,
  volume_usd,
  CAST(NULL AS BIGINT) AS trades_count
FROM daily_canonical
CROSS JOIN bounds b
WHERE day >= b.today_utc - INTERVAL '14' DAY
  AND day < b.today_utc - INTERVAL '7' DAY

UNION ALL

SELECT
  'previous' AS window_kind,
  '30d' AS timeframe,
  'day' AS bucket_granularity,
  day AS bucket_start,
  category,
  volume_usd,
  CAST(NULL AS BIGINT) AS trades_count
FROM daily_canonical
CROSS JOIN bounds b
WHERE day >= b.today_utc - INTERVAL '60' DAY
  AND day < b.today_utc - INTERVAL '30' DAY

UNION ALL

SELECT
  'previous' AS window_kind,
  '90d' AS timeframe,
  'day' AS bucket_granularity,
  day AS bucket_start,
  category,
  volume_usd,
  CAST(NULL AS BIGINT) AS trades_count
FROM daily_canonical
CROSS JOIN bounds b
WHERE day >= b.today_utc - INTERVAL '180' DAY
  AND day < b.today_utc - INTERVAL '90' DAY

ORDER BY 1, 2, 4, 5
`.trim();
}

function buildPlatformComparisons(rows: DuneBucketRow[]): Record<
  ComparisonTimeframe,
  {
    previousTotalUsd: number;
    previousCategoryTotals: Record<string, number>;
  }
> {
  const windows = Object.fromEntries(
    COMPARISON_TIMEFRAMES.map((timeframe) => [
      timeframe,
      {
        previousCategoryTotals: new Map<string, number>()
      }
    ])
  ) as Record<
    ComparisonTimeframe,
    {
      previousCategoryTotals: Map<string, number>;
    }
  >;

  for (const row of rows) {
    const timeframe = normalizeComparisonTimeframe(row.timeframe);
    const day = normalizeBucketStart(row.bucket_start);
    const category = String(row.category ?? "Other");
    const volumeUsd = num(row.volume_usd);

    if (!day) {
      continue;
    }

    accumulateCategory(windows[timeframe].previousCategoryTotals, category, volumeUsd);
  }

  return Object.fromEntries(
    COMPARISON_TIMEFRAMES.map((timeframe) => {
      const categoryTotals = sortFlatRecord(windows[timeframe].previousCategoryTotals);

      return [
        timeframe,
        {
          previousTotalUsd: Object.values(categoryTotals).reduce((sum, value) => sum + Number(value), 0),
          previousCategoryTotals: categoryTotals
        }
      ];
    })
  ) as Record<
    ComparisonTimeframe,
    {
      previousTotalUsd: number;
      previousCategoryTotals: Record<string, number>;
    }
  >;
}

function mergeComparisons(
  polymarket: ReturnType<typeof buildPlatformComparisons>,
  kalshi: ReturnType<typeof buildPlatformComparisons>
): Record<ComparisonTimeframe, CacheComparison> {
  return Object.fromEntries(
    COMPARISON_TIMEFRAMES.map((timeframe) => {
      const polymarketFrame = polymarket[timeframe];
      const kalshiFrame = kalshi[timeframe];

      return [
        timeframe,
        {
          previousPlatformTotals: {
            polymarketUsd: roundUsd(polymarketFrame.previousTotalUsd),
            kalshiUsd: roundUsd(kalshiFrame.previousTotalUsd),
            combinedUsd: roundUsd(polymarketFrame.previousTotalUsd + kalshiFrame.previousTotalUsd)
          },
          previousPlatformCategoryTotals: {
            polymarket: polymarketFrame.previousCategoryTotals,
            kalshi: kalshiFrame.previousCategoryTotals,
            combined: combineCategoryRecords(
              polymarketFrame.previousCategoryTotals,
              kalshiFrame.previousCategoryTotals
            )
          }
        }
      ];
    })
  ) as Record<ComparisonTimeframe, CacheComparison>;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function printSnapshotSummary(payload: CachePayload): void {
  console.log("[cache] snapshot summary:");
  for (const timeframe of TIMEFRAMES) {
    const frame = payload.timeframes[timeframe];
    console.log(
      `  ${timeframe}: Polymarket ${formatUsd(frame.platformTotals.polymarketUsd)}, Kalshi ${formatUsd(frame.platformTotals.kalshiUsd)}, Combined ${formatUsd(frame.platformTotals.combinedUsd)}`
    );
  }
}

export async function refreshDashboardCache(config: AppConfig = getConfig()): Promise<RefreshRunResult> {
  console.log("[cache] refreshing dashboard snapshot from Dune");
  console.log("[cache] polymarket source: embedded SQL");
  console.log("[cache] kalshi source: embedded SQL");

  const polymarketQuery = await runSqlQuery<DuneBucketRow>(config, buildPolymarketSnapshotSql());
  const kalshiQuery = await runSqlQuery<DuneBucketRow>(config, buildKalshiSnapshotSql());

  console.log(`[cache] polymarket rows: ${polymarketQuery.rows.length}`);
  console.log(`[cache] kalshi rows: ${kalshiQuery.rows.length}`);

  const polymarketRows = splitSnapshotRows(polymarketQuery.rows);
  const kalshiRows = splitSnapshotRows(kalshiQuery.rows);

  const polymarketFrames = buildPlatformTimeframes(polymarketRows.current);
  const kalshiFrames = buildPlatformTimeframes(kalshiRows.current);
  const comparisonFrames = mergeComparisons(
    buildPlatformComparisons(polymarketRows.previous),
    buildPlatformComparisons(kalshiRows.previous)
  );
  const timeframes = mergePlatforms(polymarketFrames, kalshiFrames, comparisonFrames);

  const generatedAt = new Date();
  const nextRefreshAt = new Date(generatedAt.getTime() + config.refreshIntervalHours * 60 * 60 * 1000);

  const payload: CachePayload = {
    generatedAt: generatedAt.toISOString(),
    nextRefreshAt: nextRefreshAt.toISOString(),
    source: {
      provider: "Dune",
      mode: "embedded_sql",
      queryIds: null,
      executions: {
        polymarket: polymarketQuery.executionId,
        kalshi: kalshiQuery.executionId
      }
    },
    stats: {
      rowCounts: {
        polymarket: polymarketQuery.rows.length,
        kalshi: kalshiQuery.rows.length
      }
    },
    availableCategories: collectAvailableCategories(timeframes),
    timeframes
  };

  mkdirSync(path.dirname(config.outputFile), { recursive: true });
  writeFileSync(config.outputFile, JSON.stringify(payload, null, 2));

  printSnapshotSummary(payload);
  console.log(`[cache] saved to: ${config.outputFile}`);

  return {
    generatedAt: payload.generatedAt,
    nextRefreshAt: payload.nextRefreshAt,
    outputFile: config.outputFile,
    rowCounts: {
      polymarket: polymarketQuery.rows.length,
      kalshi: kalshiQuery.rows.length
    }
  };
}

async function main(): Promise<void> {
  await refreshDashboardCache();
}

function isDirectExecution(): boolean {
  const entryPoint = process.argv[1];
  if (!entryPoint) {
    return false;
  }

  return path.resolve(entryPoint) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
