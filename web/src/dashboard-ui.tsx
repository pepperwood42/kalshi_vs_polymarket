import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PLATFORM_COLORS, formatCurrencyDetailed } from "./dashboard";
import { useI18n } from "./i18n";
import type { Locale } from "./locale";
import type { DerivedSeriesPoint, VisiblePlatformKey } from "./types";

export function LoadingState() {
  const { messages } = useI18n();

  return (
    <main className="dashboard-app dashboard-center">
      <section className="state-card">
        <StatusPill label={messages.status.loadingSnapshot} tone="neutral" />
        <h1>{messages.loading.title}</h1>
        <p>{messages.loading.body}</p>
      </section>
    </main>
  );
}

export function ErrorState({ message }: { message: string }) {
  const { messages } = useI18n();

  return (
    <main className="dashboard-app dashboard-center">
      <section className="state-card">
        <StatusPill label={messages.status.snapshotUnavailable} tone="negative" />
        <h1>{messages.error.title}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

export function WaitingState({
  countdownSeconds,
}: {
  countdownSeconds: number;
}) {
  const { messages } = useI18n();

  return (
    <main className="dashboard-app dashboard-center">
      <section className="state-card state-card-waiting">
        <p className="sr-only" role="status">
          {messages.waiting.titleLine1} {messages.waiting.titleLine2}
        </p>
        <div className="waiting-copy">
          <h1 className="waiting-title">
            <span>{messages.waiting.titleLine1}</span>
            <span>{messages.waiting.titleLine2}</span>
          </h1>
        </div>
        <div className="waiting-loader" aria-hidden="true">
          <span className="waiting-loader-ring waiting-loader-ring-polymarket" />
          <span className="waiting-loader-ring waiting-loader-ring-kalshi" />
        </div>
        <p className="waiting-caption">{messages.waiting.retryIn(countdownSeconds)}</p>
      </section>
    </main>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const { messages } = useI18n();

  return (
    <section className="state-card state-card-inline">
      <StatusPill label={messages.status.nothingSelected} tone="neutral" />
      <h2>{title}</h2>
      <p>{body}</p>
      <button type="button" className="primary-action" onClick={onAction}>
        {actionLabel}
      </button>
    </section>
  );
}

export function LanguageToggle({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
}) {
  return (
    <div
      className="language-toggle"
      role="group"
      aria-label={locale === "ru" ? "Выбор языка" : "Language selector"}
    >
      {(["en", "ru"] as Locale[]).map((entry) => (
        <button
          key={entry}
          type="button"
          className={locale === entry ? "language-toggle-chip language-toggle-chip-active" : "language-toggle-chip"}
          aria-pressed={locale === entry}
          onClick={() => onChange(entry)}
        >
          {entry.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: "light" | "dark";
  onToggle: () => void;
}) {
  const { messages } = useI18n();

  return (
    <button
      type="button"
      className={theme === "light" ? "theme-toggle theme-toggle-light" : "theme-toggle"}
      aria-pressed={theme === "light"}
      aria-label={messages.theme.toggleLabel}
      onClick={onToggle}
    >
      <span className="theme-toggle-track-icon theme-toggle-track-icon-moon" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="theme-toggle-icon" focusable="false">
          <path
            d="M15.4 3.2a8.9 8.9 0 1 0 5.4 15.98A9.85 9.85 0 1 1 15.4 3.2Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span className="theme-toggle-track-icon theme-toggle-track-icon-sun" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="theme-toggle-icon" focusable="false">
          <circle cx="12" cy="12" r="4.25" fill="currentColor" />
          <path
            d="M12 2.75v2.1M12 19.15v2.1M21.25 12h-2.1M4.85 12H2.75M18.54 5.46l-1.49 1.49M6.95 17.05l-1.49 1.49M18.54 18.54l-1.49-1.49M6.95 6.95 5.46 5.46"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="theme-toggle-thumb" aria-hidden="true">
        {theme === "dark" ? (
          <svg viewBox="0 0 24 24" className="theme-toggle-icon" focusable="false">
            <path
              d="M15.4 3.2a8.9 8.9 0 1 0 5.4 15.98A9.85 9.85 0 1 1 15.4 3.2Z"
              fill="currentColor"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="theme-toggle-icon" focusable="false">
            <circle cx="12" cy="12" r="4.25" fill="currentColor" />
            <path
              d="M12 2.75v2.1M12 19.15v2.1M21.25 12h-2.1M4.85 12H2.75M18.54 5.46l-1.49 1.49M6.95 17.05l-1.49 1.49M18.54 18.54l-1.49-1.49M6.95 6.95 5.46 5.46"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        )}
      </span>
    </button>
  );
}

export function ToolbarActionButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const [selectedPulse, setSelectedPulse] = useState(false);
  const pulseTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current !== null) {
        window.clearTimeout(pulseTimeoutRef.current);
      }
    };
  }, []);

  const handleClick = () => {
    if (disabled) {
      return;
    }

    onClick();
    setSelectedPulse(true);

    if (pulseTimeoutRef.current !== null) {
      window.clearTimeout(pulseTimeoutRef.current);
    }

    pulseTimeoutRef.current = window.setTimeout(() => {
      setSelectedPulse(false);
      pulseTimeoutRef.current = null;
    }, 300);
  };

  return (
    <button
      type="button"
      className="toolbar-action-button language-toggle"
      onClick={handleClick}
      disabled={disabled}
    >
      <span
        className={
          selectedPulse
            ? "toolbar-action-button-chip language-toggle-chip language-toggle-chip-active"
            : "toolbar-action-button-chip language-toggle-chip"
        }
      >
        <span className="toolbar-action-button-label">{label}</span>
      </span>
    </button>
  );
}

export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "positive" | "negative" | "neutral" | "warning";
}) {
  return <span className={`status-pill status-pill-${tone}`}>{label}</span>;
}

export function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-block">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

export function MetricCard({
  eyebrow,
  eyebrowMeta,
  title,
  badges,
  tone,
  hint,
}: {
  eyebrow: string;
  eyebrowMeta?: string;
  title: string;
  badges?: Array<{
    label: string;
    tone: "positive" | "negative" | "neutral";
  } | null>;
  tone: "neutral" | "polymarket" | "kalshi";
  hint: string;
}) {
  const visibleBadges = (badges ?? []).filter(Boolean) as Array<{
    label: string;
    tone: "positive" | "negative" | "neutral";
  }>;

  return (
    <article className={`metric-card metric-card-${tone}`}>
      <div className="metric-topline">
        <div className="metric-topline-copy">
          <span>{eyebrow}</span>
          {eyebrowMeta ? <small className="metric-topline-meta">{eyebrowMeta}</small> : null}
        </div>
        <InfoHint text={hint} />
      </div>
      <strong>{title}</strong>
      {visibleBadges.length > 0 ? (
        <div className="metric-badges">
          {visibleBadges.map((badge) => (
            <small key={`${badge.tone}-${badge.label}`} className={`metric-badge metric-badge-${badge.tone}`}>
              {badge.label}
            </small>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function LegendPill({
  color,
  label,
  active,
  onClick,
  subtle,
}: {
  color: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
  subtle?: boolean;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        className={active ? "legend-pill legend-pill-button legend-pill-active" : "legend-pill legend-pill-button"}
        aria-pressed={active}
        onClick={onClick}
      >
        <span className="legend-pill-dot" style={{ backgroundColor: color }} />
        {label}
      </button>
    );
  }

  return (
    <span className={subtle ? "legend-pill legend-pill-subtle" : "legend-pill"}>
      <span className="legend-pill-dot" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function InsightRow({ label, value, body }: { label: string; value: string; body: string }) {
  return (
    <div className="insight-row">
      <div className="insight-label">
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
      <p>{body}</p>
    </div>
  );
}

export function InfoHint({ text }: { text: string }) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className="info-hint-wrapper"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="info-hint"
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) {
            setOpen(false);
          }
        }}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="sr-only">{text}</span>
        <svg
          className="info-hint-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M9.9 9.35a2.1 2.1 0 1 1 3.62 1.46c-.48.49-.94.8-1.27 1.06-.66.52-.93.86-.93 1.6v.36"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="16.9" r="0.9" fill="currentColor" />
        </svg>
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={open ? "info-hint-bubble info-hint-bubble-open" : "info-hint-bubble"}
      >
        {text}
      </span>
    </span>
  );
}

export function ChartTooltip({
  active,
  payload,
  label,
  locale,
  visiblePlatforms,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ payload?: DerivedSeriesPoint }>;
  locale: Locale;
  visiblePlatforms: VisiblePlatformKey[];
}) {
  const { messages } = useI18n();

  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  const showPolymarket = visiblePlatforms.includes("polymarket");
  const showKalshi = visiblePlatforms.includes("kalshi");
  const showCombined = showPolymarket && showKalshi;

  return (
    <div className="chart-tooltip">
      <strong>{point?.label ?? label}</strong>
      {showCombined ? (
        <div className="tooltip-row">
          <span>{messages.tooltip.combined}</span>
          <strong>{formatCurrencyDetailed(point?.combinedUsd ?? 0, locale)}</strong>
        </div>
      ) : null}
      {showPolymarket ? (
        <div className="tooltip-row">
          <span>{messages.tooltip.polymarket}</span>
          <strong style={{ color: PLATFORM_COLORS.polymarket }}>
            {formatCurrencyDetailed(point?.polymarketUsd ?? 0, locale)}
          </strong>
        </div>
      ) : null}
      {showKalshi ? (
        <div className="tooltip-row">
          <span>{messages.tooltip.kalshi}</span>
          <strong style={{ color: PLATFORM_COLORS.kalshi }}>
            {formatCurrencyDetailed(point?.kalshiUsd ?? 0, locale)}
          </strong>
        </div>
      ) : null}
    </div>
  );
}

export function InlineNote({ children }: { children: ReactNode }) {
  return <p className="hero-status-note">{children}</p>;
}
