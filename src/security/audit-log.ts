/**
 * Audit Log
 * Логирование и аудит действий в системе
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export type AuditEventType =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.failed'
  | 'tool.execute'
  | 'tool.error'
  | 'session.create'
  | 'session.delete'
  | 'sandbox.execute'
  | 'sandbox.violation'
  | 'rate.limit'
  | 'security.alert';

export type AuditLevel = 'info' | 'warn' | 'error' | 'critical';

export interface AuditEvent {
  id: string;
  timestamp: number;
  type: AuditEventType;
  level: AuditLevel;
  userId?: string;
  sessionId?: string;
  action: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogConfig {
  logDir: string;
  maxFileSize?: number; // Максимальный размер файла (байты)
  retention?: number; // Сколько дней хранить (0 = бесконечно)
  console?: boolean; // Выводить в консоль
}

const DEFAULT_CONFIG: Required<AuditLogConfig> = {
  logDir: './logs/audit',
  maxFileSize: 10 * 1024 * 1024, // 10 MB
  retention: 30, // 30 дней
  console: true,
};

/**
 * Audit Logger
 */
export class AuditLogger {
  private config: Required<AuditLogConfig>;
  private buffer: AuditEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<AuditLogConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Инициализация (создание директории)
   */
  async init(): Promise<void> {
    await fs.mkdir(this.config.logDir, { recursive: true });
  }

  /**
   * Логирование события
   */
  async log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const fullEvent: AuditEvent = {
      id: this.generateId(),
      timestamp: Date.now(),
      ...event,
    };

    // Вывод в консоль
    if (this.config.console) {
      this.logToConsole(fullEvent);
    }

    // Добавляем в буфер
    this.buffer.push(fullEvent);

    // Отложенная запись в файл
    this.scheduleFlush();
  }

  /**
   * Быстрые методы для разных уровней
   */
  async info(type: AuditEventType, action: string, details?: Record<string, any>): Promise<void> {
    await this.log({ type, level: 'info', action, details });
  }

  async warn(type: AuditEventType, action: string, details?: Record<string, any>): Promise<void> {
    await this.log({ type, level: 'warn', action, details });
  }

  async error(type: AuditEventType, action: string, details?: Record<string, any>): Promise<void> {
    await this.log({ type, level: 'error', action, details });
  }

  async critical(type: AuditEventType, action: string, details?: Record<string, any>): Promise<void> {
    await this.log({ type, level: 'critical', action, details });
  }

  /**
   * Планирует сброс буфера в файл
   */
  private scheduleFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flush().catch((err) => {
        console.error('[AuditLog] Flush error:', err);
      });
    }, 1000); // Сброс раз в секунду
  }

  /**
   * Сброс буфера в файл
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    const filename = this.getLogFilename();
    const filepath = path.join(this.config.logDir, filename);

    try {
      // Проверяем размер файла
      try {
        const stats = await fs.stat(filepath);
        if (stats.size > this.config.maxFileSize) {
          // Ротация: переименовываем старый файл
          const rotatedName = `${filename}.${Date.now()}`;
          await fs.rename(filepath, path.join(this.config.logDir, rotatedName));
        }
      } catch {
        // Файл не существует, ничего не делаем
      }

      // Записываем события (JSONL формат)
      const lines = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
      await fs.appendFile(filepath, lines, 'utf-8');
    } catch (error) {
      console.error('[AuditLog] Failed to write events:', error);
      // Возвращаем события в буфер
      this.buffer.unshift(...events);
    }
  }

  /**
   * Генерирует имя файла лога (по дате)
   */
  private getLogFilename(): string {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `audit-${yyyy}-${mm}-${dd}.jsonl`;
  }

  /**
   * Генерирует уникальный ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Вывод в консоль
   */
  private logToConsole(event: AuditEvent): void {
    const levelSymbols = {
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
      critical: '🚨',
    };

    const symbol = levelSymbols[event.level];
    const timestamp = new Date(event.timestamp).toISOString();
    
    console.log(
      `${symbol} [Audit] ${timestamp} ${event.type} - ${event.action}`,
      event.details ? JSON.stringify(event.details) : ''
    );
  }

  /**
   * Очистка старых логов
   */
  async cleanup(): Promise<void> {
    if (this.config.retention === 0) return;

    const cutoffTime = Date.now() - this.config.retention * 24 * 60 * 60 * 1000;

    try {
      const files = await fs.readdir(this.config.logDir);
      
      for (const file of files) {
        if (!file.startsWith('audit-') || !file.endsWith('.jsonl')) continue;

        const filepath = path.join(this.config.logDir, file);
        const stats = await fs.stat(filepath);

        if (stats.mtimeMs < cutoffTime) {
          await fs.unlink(filepath);
          console.log(`[AuditLog] Deleted old log: ${file}`);
        }
      }
    } catch (error) {
      console.error('[AuditLog] Cleanup error:', error);
    }
  }

  /**
   * Закрытие логгера
   */
  async close(): Promise<void> {
    await this.flush();
  }
}

/**
 * Глобальный singleton
 */
let defaultLogger: AuditLogger | null = null;

export function getAuditLogger(config?: Partial<AuditLogConfig>): AuditLogger {
  if (!defaultLogger) {
    defaultLogger = new AuditLogger(config);
  }
  return defaultLogger;
}
