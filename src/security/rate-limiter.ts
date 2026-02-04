/**
 * Rate Limiter
 * Защита от DDoS и перегрузки системы
 */

export interface RateLimitConfig {
  windowMs: number; // Временное окно (мс)
  maxRequests: number; // Максимум запросов в окне
  keyGenerator?: (context: any) => string; // Функция генерации ключа
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

interface RequestRecord {
  count: number;
  resetAt: number;
}

/**
 * Простой Rate Limiter на основе скользящего окна
 */
export class RateLimiter {
  private records = new Map<string, RequestRecord>();
  private config: Required<RateLimitConfig>;
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: RateLimitConfig) {
    this.config = {
      keyGenerator: (ctx) => String(ctx),
      ...config,
    };

    // Периодическая очистка истекших записей
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.windowMs);
  }

  /**
   * Проверяет и обновляет лимит
   */
  check(context: any): RateLimitResult {
    const key = this.config.keyGenerator(context);
    const now = Date.now();
    
    let record = this.records.get(key);

    // Если записи нет или окно истекло, создаем новую
    if (!record || now >= record.resetAt) {
      record = {
        count: 0,
        resetAt: now + this.config.windowMs,
      };
      this.records.set(key, record);
    }

    // Проверяем лимит
    if (record.count >= this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: record.resetAt,
        retryAfter: record.resetAt - now,
      };
    }

    // Увеличиваем счетчик
    record.count++;

    return {
      allowed: true,
      remaining: this.config.maxRequests - record.count,
      resetAt: record.resetAt,
    };
  }

  /**
   * Сброс лимита для ключа
   */
  reset(context: any): void {
    const key = this.config.keyGenerator(context);
    this.records.delete(key);
  }

  /**
   * Очистка истекших записей
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (now >= record.resetAt) {
        this.records.delete(key);
      }
    }
  }

  /**
   * Остановка очистки
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.records.clear();
  }

  /**
   * Получить статистику
   */
  getStats(): { totalKeys: number; records: Map<string, RequestRecord> } {
    return {
      totalKeys: this.records.size,
      records: new Map(this.records),
    };
  }
}

/**
 * Middleware-обертка для Rate Limiter
 */
export function createRateLimitMiddleware(limiter: RateLimiter) {
  return (context: any): RateLimitResult => {
    return limiter.check(context);
  };
}

/**
 * Набор предустановленных конфигураций
 */
export const RateLimitPresets = {
  /**
   * Строгий лимит (защита от DDoS)
   */
  strict: {
    windowMs: 60 * 1000, // 1 минута
    maxRequests: 10,
  },

  /**
   * Средний лимит (для API)
   */
  moderate: {
    windowMs: 60 * 1000, // 1 минута
    maxRequests: 60,
  },

  /**
   * Мягкий лимит (для обычных пользователей)
   */
  lenient: {
    windowMs: 60 * 1000, // 1 минута
    maxRequests: 120,
  },

  /**
   * Лимит на hour
   */
  hourly: {
    windowMs: 60 * 60 * 1000, // 1 час
    maxRequests: 1000,
  },
};
