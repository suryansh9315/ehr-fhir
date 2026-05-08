import { createLogger } from '@ehr/shared';

const logger = createLogger('retry-policy');

const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

export class RetryPolicy {
  constructor(
    private config: { maxRetries: number; baseDelayMs?: number } = { maxRetries: 3, baseDelayMs: 1000 }
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastError = err as Error;

        const status = (err as { response?: { status?: number } }).response?.status;
        const shouldRetry = attempt < this.config.maxRetries && (!status || RETRYABLE_STATUS_CODES.includes(status));

        if (!shouldRetry) break;

        const delayMs = (this.config.baseDelayMs ?? 1000) * Math.pow(2, attempt);
        logger.warn('FHIR request failed — retrying', { attempt: attempt + 1, maxRetries: this.config.maxRetries, delayMs, status });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }
}
