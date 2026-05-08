import { createLogger } from '@ehr/shared';

const logger = createLogger('rate-limiter');

/**
 * Simple in-process token bucket rate limiter.
 * For production, back this with Redis for multi-instance coordination.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillIntervalMs: number;

  constructor(private config: { tenantId: string; maxPerMinute: number }) {
    this.maxTokens = config.maxPerMinute;
    this.tokens = config.maxPerMinute;
    this.lastRefill = Date.now();
    this.refillIntervalMs = 60_000; // 1 minute
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    // Wait for the next token
    const waitMs = this.refillIntervalMs / this.maxTokens;
    logger.debug('Rate limit reached — waiting', { tenant: this.config.tenantId, waitMs });
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor((elapsed / this.refillIntervalMs) * this.maxTokens);

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }
}
