import "dotenv/config";

import { getConfig, refreshDashboardCache } from "./refresh-cache.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

async function main(): Promise<void> {
  const config = getConfig();
  const intervalMs = config.refreshIntervalHours * 60 * 60 * 1000;

  console.log("[watch] starting dashboard cache watcher");
  console.log(`[watch] refresh interval: ${config.refreshIntervalHours} hour(s)`);

  while (true) {
    try {
      const result = await refreshDashboardCache(config);
      console.log(`[watch] refresh finished at ${result.generatedAt}`);
      console.log(`[watch] next scheduled refresh at ${result.nextRefreshAt}`);
    } catch (error) {
      console.error("[watch] refresh failed");
      console.error(error);
    }

    const sleepMs = Math.max(intervalMs, 1000);

    console.log(`[watch] sleeping for ${formatDuration(sleepMs)} before next refresh`);
    await sleep(sleepMs);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
