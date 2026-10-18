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
// that rate.
export class RequestLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();

  constructor(private readonly perMinute: number) {}

  // Takes one request for the key. Returns 0 when allowed, else the seconds
  // until the next one is.
  take(key: string, now = Date.now()): number {
    const rate = this.perMinute / 60_000;
    const bucket = this.buckets.get(key) ?? { tokens: this.perMinute, at: now };
    bucket.tokens = Math.min(this.perMinute, bucket.tokens + (now - bucket.at) * rate);
    bucket.at = now;
    this.buckets.set(key, bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return 0;
    }
    if (this.buckets.size > 10_000) this.sweep(now);
    return Math.ceil((1 - bucket.tokens) / rate / 1000);
  }

  // Drops buckets that have refilled, so idle tokens do not pile up.
  private sweep(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.tokens + (now - bucket.at) * (this.perMinute / 60_000) >= this.perMinute) this.buckets.delete(key);
    }
  }
}
