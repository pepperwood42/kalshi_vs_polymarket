import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { BucketGranularity, CanonicalCategory, TimeframeKey } from "./types";
import { getInitialLocale, LOCALE_STORAGE_KEY, type Locale } from "./locale";

type Messages = {
  hero: {
    kicker: string;
    title: string;
    description: string;
  };
  status: {
    snapshotReady: string;
    snapshotStale: string;
    showingLastSuccessfulSnapshot: string;
    loadingSnapshot: string;
    snapshotUnavailable: string;
    nothingSelected: string;
  };
  meta: {
    updated: string;
    nextSnapshot: string;
  };
  metrics: {
    combinedVolume: string;
    combinedVolumeHint: string;
    polymarket: string;
    polymarketHint: string;
    kalshi: string;
    kalshiHint: string;
    leaderSpread: string;
    leaderSpreadHint: string;
    ofCombined: string;
    vsPrevious: (periodLabel: string) => string;
    newSincePrevious: (periodLabel: string) => string;
    flatVsPrevious: (periodLabel: string) => string;
    leading: string;
    tie: string;
  };
  filters: {
    marketFilter: string;
    chooseMarket: string;
    categoryFilter: string;
    sliceMarketMix: string;
    selectAll: string;
    clearAll: string;
    bothMarkets: string;
  };
  chart: {
    sectionEyebrow: string;
    title: string;
    modeAriaLabel: string;
    line: string;
    bars: string;
    modeHint: string;
    combinedArea: string;
    visibleHint: string;
  };
  insights: {
    eyebrow: string;
    title: string;
    currentCategorySet: string;
    currentCategorySetBody: string;
    visibleVenues: string;
    visibleVenuesBody: string;
    bothPlatforms: string;
    timeBucket: string;
    timeBucketBody: string;
    dataSource: string;
    dataSourceValue: string;
    dataSourceBody: string;
  };
  breakdown: {
    eyebrow: string;
    titleBoth: string;
    titleSingle: string;
    hint: string;
    ofSelectedVolume: string;
  };
  empty: {
    title: string;
    body: string;
    action: string;
    noMarketsTitle: string;
    noMarketsBody: string;
    restoreMarkets: string;
  };
  loading: {
    title: string;
    body: string;
  };
  error: {
    title: string;
    fallback: string;
  };
  waiting: {
    titleLine1: string;
    titleLine2: string;
    retryIn: (seconds: number) => string;
  };
  theme: {
    toggleLabel: string;
  };
  exportCsv: {
    button: string;
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
    combined: string;
    shareOfSelectedVolume: string;
    leaderSpread: string;
  };
  timeframes: Record<TimeframeKey, { label: string; caption: string }>;
  bucketGranularity: Record<BucketGranularity, string>;
  categories: Record<CanonicalCategory, string>;
  tooltip: {
    combined: string;
    polymarket: string;
    kalshi: string;
  };
};

const MESSAGES: Record<Locale, Messages> = {
  en: {
    hero: {
      kicker: "Prediction market volume monitor",
      title: "Kalshi vs Polymarket",
      description:
        "Compare trading volume between the two biggest prediction venues over time and by category.",
    },
    status: {
      snapshotReady: "Snapshot ready",
      snapshotStale: "Snapshot stale",
      showingLastSuccessfulSnapshot: "Showing the last successful snapshot while refresh retries continue.",
      loadingSnapshot: "Loading snapshot",
      snapshotUnavailable: "Snapshot unavailable",
      nothingSelected: "Nothing selected",
    },
    meta: {
      updated: "Updated",
      nextSnapshot: "Next snapshot",
    },
    metrics: {
      combinedVolume: "Combined volume",
      combinedVolumeHint:
        "Aggregated notional trading volume for the active timeframe and the currently selected categories.",
      polymarket: "Polymarket",
      polymarketHint: "Polymarket notional volume from the Dune snapshot after category filtering.",
      kalshi: "Kalshi",
      kalshiHint: "Kalshi notional volume from the Dune snapshot after category filtering.",
      leaderSpread: "Leader spread",
      leaderSpreadHint:
        "Absolute gap between platform volumes inside the current timeframe and category selection.",
      ofCombined: "of combined",
      vsPrevious: (periodLabel) => `vs previous ${periodLabel}`,
      newSincePrevious: () => "New",
      flatVsPrevious: () => "Flat",
      leading: "is leading",
      tie: "Volumes are even",
    },
    filters: {
      marketFilter: "Market filter",
      chooseMarket: "Choose the venue mix",
      categoryFilter: "Category filter",
      sliceMarketMix: "Slice the market mix",
      selectAll: "Select all",
      clearAll: "Clear all",
      bothMarkets: "Select both",
    },
    chart: {
      sectionEyebrow: "Comparative chart",
      title: "Volume trajectory",
      modeAriaLabel: "Chart display mode",
      line: "Line",
      bars: "Bars",
      modeHint:
        "Line shows the overall trajectory. Bars shows absolute volume per time period for each platform.",
      combinedArea: "Combined area",
      visibleHint:
        "Use the market selector to switch between Polymarket, Kalshi, or both venues at once.",
    },
    insights: {
      eyebrow: "Read the screen",
      title: "What the numbers mean",
      currentCategorySet: "Current category set",
      currentCategorySetBody:
        "The whole dashboard responds to the selected categories, including KPI cards, chart values, and ranking.",
      visibleVenues: "Visible venues",
      visibleVenuesBody:
        "Use the market selector to focus on Polymarket, Kalshi, or compare both venues together.",
      bothPlatforms: "Both platforms",
      timeBucket: "Time bucket",
      timeBucketBody:
        "Short windows use daily points. All time switches to monthly buckets to keep the chart dense but readable.",
      dataSource: "Data source",
      dataSourceValue: "Dune snapshots",
      dataSourceBody: "Volume and category data for both Polymarket and Kalshi are sourced from Dune.",
    },
    breakdown: {
      eyebrow: "Category mix",
      titleBoth: "Where each venue wins",
      titleSingle: "Volume across categories",
      hint:
        "Each row shows the selected timeframe total for a category and how much of it came from each venue.",
      ofSelectedVolume: "of selected volume",
    },
    empty: {
      title: "No categories selected",
      body: "Choose at least one category to compare venue flow, market share, and chart activity.",
      action: "Restore all categories",
      noMarketsTitle: "No markets selected",
      noMarketsBody: "Choose Polymarket, Kalshi, or use Select both to restore the comparison.",
      restoreMarkets: "Select both markets",
    },
    loading: {
      title: "Preparing market volume dashboard",
      body: "Reading the cached JSON snapshot and shaping the venue comparison view.",
    },
    error: {
      title: "Dashboard data could not be loaded",
      fallback: "Unknown dashboard load error",
    },
    waiting: {
      titleLine1: "Dashboard snapshot",
      titleLine2: "is not ready yet",
      retryIn: (seconds) => `I'll try to fetch the snapshot again in ${seconds}s.`,
    },
    theme: {
      toggleLabel: "Toggle theme",
    },
    exportCsv: {
      button: "Export CSV",
      metadataSection: "Metadata",
      summarySection: "Summary",
      seriesSection: "Time series",
      categoriesSection: "Category breakdown",
      exportedAt: "Exported at",
      snapshotUpdated: "Snapshot updated",
      nextSnapshot: "Next snapshot",
      timeframe: "Timeframe",
      bucketGranularity: "Bucket granularity",
      visibleMarkets: "Visible markets",
      selectedCategories: "Selected categories",
      metric: "Metric",
      value: "Value",
      bucketStart: "Bucket start",
      bucketLabel: "Bucket label",
      category: "Category",
      combined: "Combined volume",
      shareOfSelectedVolume: "Share of selected volume",
      leaderSpread: "Leader spread",
    },
    timeframes: {
      "7d": { label: "7d", caption: "Last 7 days" },
      "30d": { label: "30d", caption: "Last 30 days" },
      "90d": { label: "90d", caption: "Last 90 days" },
      allTime: { label: "All time", caption: "Monthly history" },
    },
    bucketGranularity: {
      day: "Day",
      month: "Month",
    },
    categories: {
      Sports: "Sports",
      Crypto: "Crypto",
      Politics: "Politics",
      Geopolitics: "Geopolitics",
      Finance: "Finance",
      "Tech & Science": "Tech & Science",
      Culture: "Culture",
      Other: "Other",
    },
    tooltip: {
      combined: "Combined",
      polymarket: "Polymarket",
      kalshi: "Kalshi",
    },
  },
  ru: {
    hero: {
      kicker: "Мониторинг объёма рынков предсказаний",
      title: "Kalshi vs Polymarket",
      description:
        "Сравнивайте торговый оборот двух крупнейших платформ рынка предсказаний по времени и категориям.",
    },
    status: {
      snapshotReady: "Данные готовы",
      snapshotStale: "Снапшот устарел",
      showingLastSuccessfulSnapshot:
        "Показываем последний успешный снапшот, пока система повторяет обновление.",
      loadingSnapshot: "Загрузка данных",
      snapshotUnavailable: "Данные недоступны",
      nothingSelected: "Ничего не выбрано",
    },
    meta: {
      updated: "Обновлено",
      nextSnapshot: "Следующий снапшот",
    },
    metrics: {
      combinedVolume: "Общий объём",
      combinedVolumeHint:
        "Суммарный торговый оборот для выбранного периода и активных категорий.",
      polymarket: "Polymarket",
      polymarketHint: "Торговый оборот Polymarket из Dune после применения выбранных категорий.",
      kalshi: "Kalshi",
      kalshiHint: "Торговый оборот Kalshi из Dune после применения выбранных категорий.",
      leaderSpread: "Разрыв между платформами",
      leaderSpreadHint:
        "Абсолютная разница в объёме между платформами для выбранного периода и категорий.",
      ofCombined: "от общего объёма",
      vsPrevious: (periodLabel) => `к предыдущим ${periodLabel}`,
      newSincePrevious: () => "Новый объём",
      flatVsPrevious: () => "Без изменений",
      leading: "лидирует",
      tie: "Объёмы равны",
    },
    filters: {
      marketFilter: "Выбор маркета",
      chooseMarket: "Выберите маркет",
      categoryFilter: "Фильтр категорий",
      sliceMarketMix: "Настройте структуру рынка",
      selectAll: "Выбрать все",
      clearAll: "Сбросить",
      bothMarkets: "Выбрать оба",
    },
    chart: {
      sectionEyebrow: "Сравнительный график",
      title: "Динамика объёма",
      modeAriaLabel: "Режим отображения графика",
      line: "Линия",
      bars: "Столбцы",
      modeHint:
        "Линия показывает общую динамику. Столбцы показывают абсолютный объём за каждый период по платформам.",
      combinedArea: "Суммарная область",
      visibleHint:
        "Используйте выбор маркета, чтобы переключаться между Polymarket, Kalshi или сравнением обеих платформ сразу.",
    },
    insights: {
      eyebrow: "Как читать экран",
      title: "Что означают цифры",
      currentCategorySet: "Текущий набор категорий",
      currentCategorySetBody:
        "Весь дашборд реагирует на выбранные категории, включая KPI-карточки, значения на графике и ранжирование.",
      visibleVenues: "Активные платформы",
      visibleVenuesBody:
        "Используйте выбор маркета, чтобы сфокусироваться на Polymarket, Kalshi или сравнить обе платформы одновременно.",
      bothPlatforms: "Обе платформы",
      timeBucket: "Шаг агрегации",
      timeBucketBody:
        "Короткие периоды используют дневные точки. Режим All time переключается на месячные интервалы, чтобы график оставался плотным, но читаемым.",
      dataSource: "Источник данных",
      dataSourceValue: "Снапшоты Dune",
      dataSourceBody:
        "Данные по объёму и категориям для Polymarket и Kalshi загружаются из Dune.",
    },
    breakdown: {
      eyebrow: "Структура категорий",
      titleBoth: "Где лидирует каждая платформа",
      titleSingle: "Объём по категориям",
      hint:
        "Каждая строка показывает общий объём категории за выбранный период и вклад каждой платформы.",
      ofSelectedVolume: "от выбранного объёма",
    },
    empty: {
      title: "Категории не выбраны",
      body: "Выберите хотя бы одну категорию, чтобы сравнить объём, доли платформ и динамику на графике.",
      action: "Вернуть все категории",
      noMarketsTitle: "Маркеты не выбраны",
      noMarketsBody: "Выберите Polymarket, Kalshi или нажмите «Выбрать оба», чтобы вернуть сравнение.",
      restoreMarkets: "Выбрать оба маркета",
    },
    loading: {
      title: "Подготавливаем дашборд",
      body: "Загружаем актуальный снапшот и собираем представление для сравнения платформ.",
    },
    error: {
      title: "Не удалось загрузить данные дашборда",
      fallback: "Неизвестная ошибка загрузки дашборда",
    },
    waiting: {
      titleLine1: "Снапшот дашборда",
      titleLine2: "ещё не готов",
      retryIn: (seconds) => `Попробую получить снапшот снова через ${seconds}с.`,
    },
    theme: {
      toggleLabel: "Переключить тему",
    },
    exportCsv: {
      button: "Export CSV",
      metadataSection: "Метаданные",
      summarySection: "Сводка",
      seriesSection: "Временной ряд",
      categoriesSection: "Разбивка по категориям",
      exportedAt: "Экспортировано",
      snapshotUpdated: "Снапшот обновлён",
      nextSnapshot: "Следующий снапшот",
      timeframe: "Период",
      bucketGranularity: "Шаг агрегации",
      visibleMarkets: "Активные маркеты",
      selectedCategories: "Выбранные категории",
      metric: "Метрика",
      value: "Значение",
      bucketStart: "Начало интервала",
      bucketLabel: "Подпись интервала",
      category: "Категория",
      combined: "Общий объём",
      shareOfSelectedVolume: "Доля выбранного объёма",
      leaderSpread: "Разрыв между платформами",
    },
    timeframes: {
      "7d": { label: "7д", caption: "Последние 7 дней" },
      "30d": { label: "30д", caption: "Последние 30 дней" },
      "90d": { label: "90д", caption: "Последние 90 дней" },
      allTime: { label: "Всё время", caption: "История по месяцам" },
    },
    bucketGranularity: {
      day: "День",
      month: "Месяц",
    },
    categories: {
      Sports: "Спорт",
      Crypto: "Крипто",
      Politics: "Политика",
      Geopolitics: "Геополитика",
      Finance: "Финансы",
      "Tech & Science": "Тех и наука",
      Culture: "Культура",
      Other: "Другое",
    },
    tooltip: {
      combined: "Общий объём",
      polymarket: "Polymarket",
      kalshi: "Kalshi",
    },
  },
};

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  messages: Messages;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => getInitialLocale());

  useEffect(() => {
    document.documentElement.lang = locale;

    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch (_error) {}
  }, [locale]);

  return (
    <I18nContext.Provider
      value={{
        locale,
        setLocale,
        messages: MESSAGES[locale],
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }

  return context;
}
