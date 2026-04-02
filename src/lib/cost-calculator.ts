import { MODEL_PRICING } from "./constants";

interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  model: string;
}

export function calculateCost(usage: TokenUsage): number {
  const pricing = MODEL_PRICING[usage.model];
  if (!pricing) {
    // Fallback to sonnet pricing for unknown models
    const fallback = MODEL_PRICING["claude-sonnet-4-6"];
    return calculateWithRates(usage, fallback);
  }
  return calculateWithRates(usage, pricing);
}

function calculateWithRates(
  usage: TokenUsage,
  rates: (typeof MODEL_PRICING)[string],
): number {
  const inputCost = (usage.input_tokens / 1_000_000) * rates.input;
  const outputCost = (usage.output_tokens / 1_000_000) * rates.output;
  const cacheWriteCost =
    (usage.cache_creation_tokens / 1_000_000) * rates.cache_write;
  const cacheReadCost =
    (usage.cache_read_tokens / 1_000_000) * rates.cache_read;
  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) {
    const mins = Math.floor(ms / 60_000);
    const secs = Math.round((ms % 60_000) / 1000);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hrs = Math.floor(ms / 3_600_000);
  const mins = Math.round((ms % 3_600_000) / 60_000);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  const hrs = Math.floor(mins / 60);
  const remaining = Math.round(mins % 60);
  return remaining > 0 ? `${hrs}h ${remaining}m` : `${hrs}h`;
}
