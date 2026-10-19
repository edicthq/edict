// Per-token request limits for agents (PLAN.md, Guardrails). Counted in each
// instance's memory: Postgres is the only required service (ADR 0007), so
// several replicas each allow the full rate. The per-agent issue limit counts
// events instead, so it holds across replicas (issues.ts).

export interface AgentLimits {
  requestsPerMinute: number;
  issuesPerHour: number;
}

export const DEFAULT_AGENT_LIMITS: AgentLimits = { requestsPerMinute: 600, issuesPerHour: 60 };

// A token bucket per key: it holds up to `perMinute` requests and refills at
// that rate. Keys are bearer strings, valid or not, so anyone can make new
// ones: the map keeps at most `maxKeys`, dropping the least recently used.
export class RequestLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private readonly perMinute: number,
    private readonly maxKeys = 50_000,
  ) {}

  get size(): number {
    return this.buckets.size;
  }

  // Takes one request for the key. Returns 0 when allowed, else the seconds
  // until the next one is.
  take(key: string, now = Date.now()): number {
    const rate = this.perMinute / 60_000;
    const bucket = this.buckets.get(key) ?? { tokens: this.perMinute, at: now };
    bucket.tokens = Math.min(this.perMinute, bucket.tokens + (now - bucket.at) * rate);
    bucket.at = now;
    // Re-inserted, so the map's order runs from least to most recently used.
    this.buckets.delete(key);
    this.buckets.set(key, bucket);
    while (this.buckets.size > this.maxKeys) {
      this.buckets.delete(this.buckets.keys().next().value!);
    }
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return 0;
    }
    return Math.ceil((1 - bucket.tokens) / rate / 1000);
  }
}
