import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildDashboardCsvDocument,
  buildDashboardViewModel,
  CATEGORY_COLORS,
  downloadDashboardCsvFile,
  formatCurrencyCompact,
  formatCurrencyDetailed,
  formatDateTime,
  formatPercent,
  formatSignedPercentDelta,
  formatSeriesAxisLabel,
  orderCategoriesForDisplay,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
} from "./dashboard";
import {
  ChartTooltip,
  EmptyState,
  ErrorState,
  InfoHint,
  InlineNote,
  InsightRow,
  LanguageToggle,
  LegendPill,
  LoadingState,
  MetaBlock,
  MetricCard,
  ThemeToggle,
  ToolbarActionButton,
  WaitingState,
} from "./dashboard-ui";
import { useI18n } from "./i18n";
import { useDashboardSnapshot } from "./useDashboardSnapshot";
import type {
  CanonicalCategory,
  CategorySelectionMode,
  TimeframeKey,
  VisiblePlatformsMode,
} from "./types";

type ChartMode = "trend" | "buckets";
type Theme = "light" | "dark";
type ThemePreference = Theme | "system";

const THEME_STORAGE_KEY = "prediction-dashboard-theme";
const PUBLIC_ASSET_BASE_URL = import.meta.env.BASE_URL;
const KALSHI_WORDMARK_SRC = `${PUBLIC_ASSET_BASE_URL}kalshi-wordmark.png`;
const POLYMARKET_WORDMARK_SRC = `${PUBLIC_ASSET_BASE_URL}polymarket-wordmark.png`;

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredThemePreference(): ThemePreference {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }
  } catch (_error) {}

  return "system";
}

function resolveTheme(preference: ThemePreference, systemTheme: Theme): Theme {
  return preference === "system" ? systemTheme : preference;
}

function AppShell() {
  const { locale, setLocale, messages } = useI18n();
  const snapshotState = useDashboardSnapshot(locale);
  const snapshot = snapshotState.lastSuccessfulSnapshot ?? snapshotState.snapshot;
  const [activeTimeframe, setActiveTimeframe] = useState<TimeframeKey>("30d");
  const [categorySelectionMode, setCategorySelectionMode] = useState<CategorySelectionMode>("all");
  const [customSelectedCategories, setCustomSelectedCategories] = useState<CanonicalCategory[]>([]);
  const [chartMode, setChartMode] = useState<ChartMode>("trend");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<"polymarket" | "kalshi", boolean>>({
    polymarket: true,
    kalshi: true,
  });
  const [selectBothPulse, setSelectBothPulse] = useState(false);
  const [systemTheme, setSystemTheme] = useState<Theme>(() => getSystemTheme());
  const [themePreference, setThemePreference] =
    useState<ThemePreference>(() => getStoredThemePreference());
  const selectBothTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    setSystemTheme(mediaQuery.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", updateSystemTheme);

    return () => {
      mediaQuery.removeEventListener("change", updateSystemTheme);
    };
  }, []);

  const resolvedTheme = resolveTheme(themePreference, systemTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;

    try {
      if (themePreference === "system") {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
      }
    } catch (_error) {}
  }, [resolvedTheme, themePreference]);

  useEffect(() => {
    if (!snapshot || categorySelectionMode !== "custom") {
      return;
    }

    setCustomSelectedCategories((current) => {
      const next = snapshot.availableCategories.filter((category) => current.includes(category));

      if (next.length === current.length && next.every((category, index) => category === current[index])) {
        return current;
      }

      return next;
    });
  }, [snapshot, categorySelectionMode]);

  useEffect(() => {
    return () => {
      if (selectBothTimeoutRef.current !== null) {
        window.clearTimeout(selectBothTimeoutRef.current);
      }
    };
  }, []);

  const selectedCategories = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    if (categorySelectionMode === "all") {
      return snapshot.availableCategories;
    }

    return snapshot.availableCategories.filter((category) => customSelectedCategories.includes(category));
  }, [snapshot, categorySelectionMode, customSelectedCategories]);

  const visiblePlatformsMode = useMemo<VisiblePlatformsMode>(() => {
    if (selectedPlatforms.polymarket && selectedPlatforms.kalshi) {
      return "both";
    }

    if (selectedPlatforms.polymarket) {
      return "polymarket";
    }

    return "kalshi";
  }, [selectedPlatforms]);

  const view = useMemo(() => {
    if (!snapshot || selectedCategories.length === 0) {
      return null;
    }

    return buildDashboardViewModel(
      snapshot,
      activeTimeframe,
      selectedCategories,
      visiblePlatformsMode,
      locale
    );
  }, [snapshot, selectedCategories, activeTimeframe, visiblePlatformsMode, locale]);

  const orderedAvailableCategories = useMemo(
    () => (snapshot ? orderCategoriesForDisplay(snapshot.availableCategories) : []),
    [snapshot]
  );

  const timeframeOptions = useMemo(
    () =>
      (["7d", "30d", "90d", "allTime"] as TimeframeKey[]).map((key) => ({
        key,
        label: messages.timeframes[key].label,
      })),
    [messages]
  );

  const buildDeltaMeta = (
    currentValue: number,
    previousValue: number,
    ratio: number | null
  ): { label: string; tone: "positive" | "negative" | "neutral" } | null => {
    if (!view?.comparison || activeTimeframe === "allTime") {
      return null;
    }

    if (previousValue === 0) {
      if (currentValue === 0) {
        return {
          label: `→ ${messages.metrics.flatVsPrevious(messages.timeframes[activeTimeframe].label)}`,
          tone: "neutral",
        };
      }

      return {
        label: `↑ ${messages.metrics.newSincePrevious(messages.timeframes[activeTimeframe].label)}`,
        tone: "positive",
      };
    }

    if (ratio === null) {
      return null;
    }

    if (ratio === 0) {
      return {
        label: `→ ${messages.metrics.flatVsPrevious(messages.timeframes[activeTimeframe].label)}`,
        tone: "neutral",
      };
    }

    const timeframeLabel = messages.timeframes[activeTimeframe].label;

    return {
      label: `${ratio > 0 ? "↑" : ratio < 0 ? "↓" : "→"} ${formatSignedPercentDelta(ratio, locale)} ${messages.metrics.vsPrevious(timeframeLabel)}`,
      tone: ratio > 0 ? "positive" : ratio < 0 ? "negative" : "neutral",
    };
  };

  const toggleTheme = () => {
    setThemePreference((currentPreference) =>
      resolveTheme(currentPreference, systemTheme) === "dark" ? "light" : "dark"
    );
  };

  const handleToggleCategory = (category: CanonicalCategory) => {
    if (!snapshot) {
      return;
    }

    if (categorySelectionMode === "all") {
      const nextCustomSelection = snapshot.availableCategories.filter((entry) => entry !== category);
      setCategorySelectionMode("custom");
      setCustomSelectedCategories(nextCustomSelection);
      return;
    }

    setCustomSelectedCategories((current) => {
      const next = current.includes(category)
        ? current.filter((entry) => entry !== category)
        : snapshot.availableCategories.filter((entry) => current.includes(entry) || entry === category);

      if (next.length === snapshot.availableCategories.length) {
        setCategorySelectionMode("all");
        return [];
      }

      return next;
    });
  };

  const handleToggleMarket = (platform: "polymarket" | "kalshi") => {
    setSelectedPlatforms((current) => {
      const nextValue = !current[platform];
      const otherPlatform = platform === "polymarket" ? "kalshi" : "polymarket";

      if (!nextValue && !current[otherPlatform]) {
        return current;
      }

      return {
        ...current,
        [platform]: nextValue,
      };
    });
  };

  const handleSelectBoth = () => {
    setSelectedPlatforms({
      polymarket: true,
      kalshi: true,
    });
    setSelectBothPulse(true);

    if (selectBothTimeoutRef.current !== null) {
      window.clearTimeout(selectBothTimeoutRef.current);
    }

    selectBothTimeoutRef.current = window.setTimeout(() => {
      setSelectBothPulse(false);
      selectBothTimeoutRef.current = null;
    }, 300);
  };

  const handleExportCsv = () => {
    if (!snapshot || !view) {
      return;
    }

    const visibleMarketsLabel = view.visiblePlatforms
      .map((platform) => (platform === "polymarket" ? messages.metrics.polymarket : messages.metrics.kalshi))
      .join(" + ");
    const selectedCategoryLabels = view.selectedCategories.map((category) => messages.categories[category]);
    const csvDocument = buildDashboardCsvDocument({
      snapshot,
      view,
      timeframeLabel: messages.timeframes[activeTimeframe].label,
      bucketGranularityLabel: messages.bucketGranularity[view.timeframeData.bucketGranularity],
      visibleMarketsLabel,
      selectedCategoryLabels,
      labels: {
        ...messages.exportCsv,
        polymarket: messages.metrics.polymarket,
        kalshi: messages.metrics.kalshi,
      },
    });

    downloadDashboardCsvFile(csvDocument, activeTimeframe, visiblePlatformsMode);
  };

  if (!snapshot) {
    if (snapshotState.phase === "loading") {
      return <LoadingState />;
    }

    if (snapshotState.phase === "waiting") {
      return <WaitingState countdownSeconds={snapshotState.countdownSeconds} />;
    }

    return <ErrorState message={snapshotState.lastRefreshError ?? messages.error.fallback} />;
  }

  const statusNote =
    snapshotState.phase === "degraded" ? messages.status.showingLastSuccessfulSnapshot : null;

  return (
    <main className="dashboard-app">
      <div className="dashboard-backdrop" />
      <div className="page-toolbar">
        <div className="page-meta">
          <MetaBlock label={messages.meta.updated} value={formatDateTime(snapshot.generatedAt, locale)} />
          <MetaBlock label={messages.meta.nextSnapshot} value={formatDateTime(snapshot.nextRefreshAt, locale)} />
        </div>
        <div className="page-controls">
          <ToolbarActionButton label={messages.exportCsv.button} onClick={handleExportCsv} disabled={!view} />
          <LanguageToggle locale={locale} onChange={setLocale} />
          <ThemeToggle theme={resolvedTheme} onToggle={toggleTheme} />
        </div>
      </div>
      <section className="hero-panel hero-panel-single">
        <div className="hero-copy">
          <div className="hero-kicker">{messages.hero.kicker}</div>
          <h1 className="hero-brand-heading">
            <span className="sr-only">{messages.hero.title}</span>
            <span className="hero-brand-title" aria-hidden="true">
              <img
                className="hero-brand-wordmark hero-brand-wordmark-kalshi"
                src={KALSHI_WORDMARK_SRC}
                alt=""
                decoding="async"
              />
              <span className="hero-brand-separator">vs</span>
              <img
                className="hero-brand-wordmark hero-brand-wordmark-polymarket"
                src={POLYMARKET_WORDMARK_SRC}
                alt=""
                decoding="async"
              />
            </span>
          </h1>
          <p>{messages.hero.description}</p>
          {statusNote ? <InlineNote>{statusNote}</InlineNote> : null}
        </div>
      </section>

      {view ? (
        <section className="metric-grid">
          {view.bothPlatformsVisible ? (
            <>
              <MetricCard
                eyebrow={messages.metrics.combinedVolume}
                title={formatCurrencyCompact(view.visibleTotals.combinedUsd, locale)}
                badges={[
                  buildDeltaMeta(
                    view.visibleTotals.combinedUsd,
                    view.previousVisibleTotals.combinedUsd,
                    view.deltaRatios.combined
                  ),
                  {
                    label: formatCurrencyDetailed(view.visibleTotals.combinedUsd, locale),
                    tone: "neutral",
                  },
                ]}
                tone="neutral"
                hint={messages.metrics.combinedVolumeHint}
              />
              <MetricCard
                eyebrow={messages.metrics.polymarket}
                eyebrowMeta={`${formatPercent(
                  view.visibleTotals.combinedUsd > 0
                    ? view.visibleTotals.polymarketUsd / view.visibleTotals.combinedUsd
                    : 0,
                  locale
                )} ${messages.metrics.ofCombined}`}
                title={formatCurrencyCompact(view.visibleTotals.polymarketUsd, locale)}
                badges={[
                  buildDeltaMeta(
                    view.visibleTotals.polymarketUsd,
                    view.previousVisibleTotals.polymarketUsd,
                    view.deltaRatios.polymarket
                  ),
                  {
                    label: formatCurrencyDetailed(view.visibleTotals.polymarketUsd, locale),
                    tone: "neutral",
                  },
                ]}
                tone="polymarket"
                hint={messages.metrics.polymarketHint}
              />
              <MetricCard
                eyebrow={messages.metrics.kalshi}
                eyebrowMeta={`${formatPercent(
                  view.visibleTotals.combinedUsd > 0
                    ? view.visibleTotals.kalshiUsd / view.visibleTotals.combinedUsd
                    : 0,
                  locale
                )} ${messages.metrics.ofCombined}`}
                title={formatCurrencyCompact(view.visibleTotals.kalshiUsd, locale)}
                badges={[
                  buildDeltaMeta(
                    view.visibleTotals.kalshiUsd,
                    view.previousVisibleTotals.kalshiUsd,
                    view.deltaRatios.kalshi
                  ),
                  {
                    label: formatCurrencyDetailed(view.visibleTotals.kalshiUsd, locale),
                    tone: "neutral",
                  },
                ]}
                tone="kalshi"
                hint={messages.metrics.kalshiHint}
              />
              <MetricCard
                eyebrow={messages.metrics.leaderSpread}
                title={formatCurrencyCompact(view.visibleLeaderDeltaUsd, locale)}
                badges={[
                  {
                    label: view.visibleLeader
                      ? `${PLATFORM_LABELS[view.visibleLeader]} ${messages.metrics.leading}`
                      : messages.metrics.tie,
                    tone: "neutral",
                  },
                  {
                    label: formatCurrencyDetailed(view.visibleLeaderDeltaUsd, locale),
                    tone: "neutral",
                  },
                ]}
                tone={view.visibleLeader ?? "neutral"}
                hint={messages.metrics.leaderSpreadHint}
              />
            </>
          ) : view.platformVisibility.polymarket ? (
            <MetricCard
              eyebrow={messages.metrics.polymarket}
              title={formatCurrencyCompact(view.visibleTotals.polymarketUsd, locale)}
              badges={[
                buildDeltaMeta(
                  view.visibleTotals.polymarketUsd,
                  view.previousVisibleTotals.polymarketUsd,
                  view.deltaRatios.polymarket
                ),
                {
                  label: formatCurrencyDetailed(view.visibleTotals.polymarketUsd, locale),
                  tone: "neutral",
                },
              ]}
              tone="polymarket"
              hint={messages.metrics.polymarketHint}
            />
          ) : (
            <MetricCard
              eyebrow={messages.metrics.kalshi}
              title={formatCurrencyCompact(view.visibleTotals.kalshiUsd, locale)}
              badges={[
                buildDeltaMeta(
                  view.visibleTotals.kalshiUsd,
                  view.previousVisibleTotals.kalshiUsd,
                  view.deltaRatios.kalshi
                ),
                {
                  label: formatCurrencyDetailed(view.visibleTotals.kalshiUsd, locale),
                  tone: "neutral",
                },
              ]}
              tone="kalshi"
              hint={messages.metrics.kalshiHint}
            />
          )}
        </section>
      ) : null}

      <section className="toolbar">
        <section className="filter-panel filter-panel-market">
          <div className="filter-panel-header">
            <span className="panel-eyebrow">{messages.filters.marketFilter}</span>
          </div>
          <div className="market-switcher" role="group" aria-label={messages.filters.marketFilter}>
            <button
              type="button"
              className={selectedPlatforms.polymarket ? "market-chip market-chip-active" : "market-chip"}
              aria-pressed={selectedPlatforms.polymarket}
              onClick={() => handleToggleMarket("polymarket")}
            >
              <span
                className="category-chip-dot"
                style={{ backgroundColor: PLATFORM_COLORS.polymarket }}
              />
              <span className="market-chip-label">{messages.metrics.polymarket}</span>
            </button>
            <button
              type="button"
              className={selectedPlatforms.kalshi ? "market-chip market-chip-active" : "market-chip"}
              aria-pressed={selectedPlatforms.kalshi}
              onClick={() => handleToggleMarket("kalshi")}
            >
              <span className="category-chip-dot" style={{ backgroundColor: PLATFORM_COLORS.kalshi }} />
              <span className="market-chip-label">{messages.metrics.kalshi}</span>
            </button>
            <button
              type="button"
              className={selectBothPulse ? "market-chip market-chip-active" : "market-chip"}
              aria-pressed={selectBothPulse}
              onClick={handleSelectBoth}
            >
              <span className="market-chip-label">{messages.filters.bothMarkets}</span>
            </button>
          </div>
        </section>

        <section className="filter-panel filter-panel-categories">
          <div className="filter-panel-header filter-panel-header-actions">
            <span className="panel-eyebrow">{messages.filters.categoryFilter}</span>
            <div className="filter-actions">
              <ToolbarActionButton
                label={messages.filters.selectAll}
                onClick={() => {
                  setCategorySelectionMode("all");
                  setCustomSelectedCategories([]);
                }}
              />
              <ToolbarActionButton
                label={messages.filters.clearAll}
                onClick={() => {
                  setCategorySelectionMode("custom");
                  setCustomSelectedCategories([]);
                }}
              />
            </div>
          </div>
          <div className="category-grid" role="group" aria-label={messages.filters.categoryFilter}>
            {orderedAvailableCategories.map((category) => {
              const active = selectedCategories.includes(category);

              return (
                <button
                  key={category}
                  type="button"
                  className={active ? "category-chip category-chip-active" : "category-chip"}
                  aria-pressed={active}
                  onClick={() => handleToggleCategory(category)}
                >
                  <span
                    className="category-chip-dot"
                    style={{ backgroundColor: CATEGORY_COLORS[category] }}
                  />
                  <span className="category-chip-label">{messages.categories[category]}</span>
                </button>
              );
            })}
          </div>
        </section>
      </section>

      {view ? (
        <>
          <section className="chart-layout">
            <article className="chart-card">
              <div className="panel-heading chart-card-heading">
                <div className="chart-heading-main">
                  <span className="panel-eyebrow">{messages.chart.sectionEyebrow}</span>
                  <h2>{messages.chart.title}</h2>
                  <div
                    className="timeframe-switcher timeframe-switcher-inline"
                    role="group"
                    aria-label={locale === "ru" ? "Выбор периода" : "Timeframe selector"}
                  >
                    {timeframeOptions.map((option) => {
                      const active = option.key === activeTimeframe;

                      return (
                        <button
                          key={option.key}
                          type="button"
                          className={active ? "switch-chip switch-chip-active" : "switch-chip"}
                          aria-pressed={active}
                          onClick={() => setActiveTimeframe(option.key)}
                        >
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="chart-heading-actions">
                  <div className="chart-mode-switcher" role="group" aria-label={messages.chart.modeAriaLabel}>
                    <button
                      type="button"
                      className={
                        chartMode === "trend" ? "chart-mode-button chart-mode-button-active" : "chart-mode-button"
                      }
                      aria-pressed={chartMode === "trend"}
                      onClick={() => setChartMode("trend")}
                    >
                      {messages.chart.line}
                    </button>
                    <button
                      type="button"
                      className={
                        chartMode === "buckets" ? "chart-mode-button chart-mode-button-active" : "chart-mode-button"
                      }
                      aria-pressed={chartMode === "buckets"}
                      onClick={() => setChartMode("buckets")}
                    >
                      {messages.chart.bars}
                    </button>
                  </div>
                  <InfoHint text={messages.chart.modeHint} />
                </div>
              </div>

              <div className="chart-stage">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={view.visibleSeries}
                    margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                    barCategoryGap="24%"
                    barGap={4}
                  >
                    <defs>
                      <linearGradient id="combinedFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#2E5CFF" stopOpacity={0.18} />
                        <stop offset="45%" stopColor="#28CC95" stopOpacity={0.14} />
                        <stop offset="100%" stopColor="#28CC95" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis
                      dataKey="bucketStart"
                      tickFormatter={(value) =>
                        formatSeriesAxisLabel(value, view.timeframeData.bucketGranularity, locale)
                      }
                      tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      tickMargin={12}
                    />
                    <YAxis
                      tickFormatter={(value) => formatCurrencyCompact(value, locale)}
                      tick={{ fill: "var(--chart-axis)", fontSize: 12, dx: 4 }}
                      axisLine={false}
                      tickLine={false}
                      width={68}
                    />
                    <Tooltip
                      content={<ChartTooltip locale={locale} visiblePlatforms={view.visiblePlatforms} />}
                      cursor={{ stroke: "var(--chart-cursor)" }}
                    />
                    {chartMode === "trend" && view.bothPlatformsVisible ? (
                      <Area type="monotone" dataKey="combinedUsd" stroke="transparent" fill="url(#combinedFill)" />
                    ) : null}
                    {chartMode === "trend" && view.platformVisibility.polymarket ? (
                      <Line
                        type="monotone"
                        dataKey="polymarketUsd"
                        stroke={PLATFORM_COLORS.polymarket}
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 5, fill: PLATFORM_COLORS.polymarket }}
                      />
                    ) : null}
                    {chartMode === "trend" && view.platformVisibility.kalshi ? (
                      <Line
                        type="monotone"
                        dataKey="kalshiUsd"
                        stroke={PLATFORM_COLORS.kalshi}
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 5, fill: PLATFORM_COLORS.kalshi }}
                      />
                    ) : null}
                    {chartMode === "buckets" && view.platformVisibility.polymarket ? (
                      <Bar dataKey="polymarketUsd" fill={PLATFORM_COLORS.polymarket} radius={[5, 5, 0, 0]} maxBarSize={22} />
                    ) : null}
                    {chartMode === "buckets" && view.platformVisibility.kalshi ? (
                      <Bar dataKey="kalshiUsd" fill={PLATFORM_COLORS.kalshi} radius={[5, 5, 0, 0]} maxBarSize={22} />
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-legend">
                <LegendPill color={PLATFORM_COLORS.polymarket} label={messages.metrics.polymarket} />
                <LegendPill color={PLATFORM_COLORS.kalshi} label={messages.metrics.kalshi} />
                {chartMode === "trend" && view.bothPlatformsVisible ? (
                  <LegendPill color="#4A93CF" label={messages.chart.combinedArea} subtle />
                ) : null}
              </div>
            </article>

            <aside className="insight-card">
              <div className="panel-heading">
                <div>
                  <span className="panel-eyebrow">{messages.insights.eyebrow}</span>
                  <h2>{messages.insights.title}</h2>
                </div>
              </div>

              <div className="insight-list">
                <InsightRow
                  label={messages.insights.currentCategorySet}
                  value={`${selectedCategories.length} / ${snapshot.availableCategories.length}`}
                  body={messages.insights.currentCategorySetBody}
                />
                <InsightRow
                  label={messages.insights.visibleVenues}
                  value={
                    view.visiblePlatformsMode === "both"
                      ? messages.insights.bothPlatforms
                      : PLATFORM_LABELS[view.visiblePlatformsMode]
                  }
                  body={messages.insights.visibleVenuesBody}
                />
                <InsightRow
                  label={messages.insights.timeBucket}
                  value={messages.bucketGranularity[view.timeframeData.bucketGranularity]}
                  body={messages.insights.timeBucketBody}
                />
                <InsightRow
                  label={messages.insights.dataSource}
                  value={messages.insights.dataSourceValue}
                  body={messages.insights.dataSourceBody}
                />
              </div>
            </aside>
          </section>

          <section className="breakdown-card">
            <div className="panel-heading">
              <div>
                <span className="panel-eyebrow">{messages.breakdown.eyebrow}</span>
                <h2>{view.bothPlatformsVisible ? messages.breakdown.titleBoth : messages.breakdown.titleSingle}</h2>
              </div>
              <InfoHint text={messages.breakdown.hint} />
            </div>

            <div className="breakdown-list">
              {view.visibleCategoryRows.map((row) => (
                <article key={row.category} className="breakdown-row">
                  <div className="breakdown-header">
                    <div className="breakdown-title">
                      <span className="category-swatch" style={{ backgroundColor: row.color }} />
                      <strong>{messages.categories[row.category]}</strong>
                    </div>
                  </div>

                  <div className="breakdown-overview">
                    <small className="breakdown-share">
                      {formatPercent(row.combinedShare, locale)} {messages.breakdown.ofSelectedVolume}
                    </small>
                    <span className="breakdown-volume">{formatCurrencyCompact(row.combinedVolume, locale)}</span>
                  </div>

                  <div className="stack-bar" aria-hidden="true">
                    {view.platformVisibility.polymarket ? (
                      <div
                        className="stack-segment stack-polymarket"
                        style={{
                          width: `${row.combinedVolume > 0 ? (row.polymarketVolume / row.combinedVolume) * 100 : 0}%`,
                        }}
                      />
                    ) : null}
                    {view.platformVisibility.kalshi ? (
                      <div
                        className="stack-segment stack-kalshi"
                        style={{
                          width: `${row.combinedVolume > 0 ? (row.kalshiVolume / row.combinedVolume) * 100 : 0}%`,
                        }}
                      />
                    ) : null}
                  </div>

                  <div
                    className={
                      view.bothPlatformsVisible
                        ? "breakdown-split breakdown-split-dual"
                        : "breakdown-split"
                    }
                  >
                    {view.platformVisibility.polymarket ? (
                      <span className="platform-chip platform-chip-polymarket">
                        <span className="platform-chip-label-row">
                          <span className="platform-chip-dot" style={{ backgroundColor: PLATFORM_COLORS.polymarket }} />
                          <span className="platform-chip-label">{messages.metrics.polymarket}</span>
                        </span>
                        <span className="platform-chip-value">
                          {formatCurrencyCompact(row.polymarketVolume, locale)}
                        </span>
                      </span>
                    ) : null}
                    {view.platformVisibility.kalshi ? (
                      <span className="platform-chip platform-chip-kalshi">
                        <span className="platform-chip-label-row">
                          <span className="platform-chip-dot" style={{ backgroundColor: PLATFORM_COLORS.kalshi }} />
                          <span className="platform-chip-label">{messages.metrics.kalshi}</span>
                        </span>
                        <span className="platform-chip-value">
                          {formatCurrencyCompact(row.kalshiVolume, locale)}
                        </span>
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <EmptyState
          title={messages.empty.title}
          body={messages.empty.body}
          actionLabel={messages.empty.action}
          onAction={() => {
            setCategorySelectionMode("all");
            setCustomSelectedCategories([]);
          }}
        />
      )}
    </main>
  );
}

export function App() {
  return <AppShell />;
}
