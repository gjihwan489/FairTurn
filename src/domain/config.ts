import type { ScoringWeights } from "./types";

export const DEFAULT_MAX_TRAVEL_MINUTES = 90;
export const DEFAULT_MAX_TRANSFERS = 3;
export const DEFAULT_MAX_WALK_MINUTES = 20;
export const DEFAULT_FARE_CAP_WON = 10_000;
export const LEDGER_DECAY = 0.85;
export const FAIRNESS_STDDEV_CAP = 30;
export const MAX_PRIMARY_HUBS = 50;
export const MAX_DETAILED_HUBS = 10;

export const DEFAULT_SCORE_WEIGHTS: ScoringWeights = {
  efficiency: 0.3,
  worstPersonProtection: 0.2,
  cumulativeBalance: 0.25,
  hubQuality: 0.15,
  groupPreferenceFit: 0.1
};

export const PRESET_WEIGHTS: Record<string, ScoringWeights> = {
  balanced: DEFAULT_SCORE_WEIGHTS,
  time_first: {
    efficiency: 0.45,
    worstPersonProtection: 0.25,
    cumulativeBalance: 0.15,
    hubQuality: 0.1,
    groupPreferenceFit: 0.05
  },
  hub_first: {
    efficiency: 0.2,
    worstPersonProtection: 0.15,
    cumulativeBalance: 0.2,
    hubQuality: 0.3,
    groupPreferenceFit: 0.15
  },
  late_return: {
    efficiency: 0.22,
    worstPersonProtection: 0.3,
    cumulativeBalance: 0.22,
    hubQuality: 0.14,
    groupPreferenceFit: 0.12
  },
  fare_first: {
    efficiency: 0.4,
    worstPersonProtection: 0.2,
    cumulativeBalance: 0.2,
    hubQuality: 0.1,
    groupPreferenceFit: 0.1
  },
  accessibility_first: {
    efficiency: 0.2,
    worstPersonProtection: 0.3,
    cumulativeBalance: 0.2,
    hubQuality: 0.1,
    groupPreferenceFit: 0.2
  }
};

export function sourced<T>(
  value: T | null,
  status: "known" | "estimated" | "stale" | "unknown" | "error",
  source: string | null,
  confidence: number,
  warning?: string
) {
  return {
    value,
    status,
    source,
    fetchedAt: status === "unknown" ? null : new Date().toISOString(),
    confidence,
    warning
  };
}
