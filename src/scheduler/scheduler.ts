/**
 * Simple Cron & Scheduler Module
 * Управляет периодическими задачами
 */

export type ScheduleInterval = 'hourly' | 'daily' | 'weekly' | string;

export interface ScheduledTask {
  id: string;
  name: string;
  interval: ScheduleInterval;
  handler: () => Promise<void>;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

export class Scheduler {
  private tasks: Map<string, ScheduledTask> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;

  /**
   * Регистрирует новую задачу
   */
  registerTask(task: Omit<ScheduledTask, 'lastRun' | 'nextRun'>): void {
    this.tasks.set(task.id, {
      ...task,
      nextRun: this.calculateNextRun(task.interval),
    });
    console.log(`[Scheduler] Registered task: ${task.name} (${task.interval})`);
  }

  /**
   * Запускает планировщик
   */
  start(): void {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[Scheduler] Starting...');

    for (const [id, task] of this.tasks.entries()) {
      if (task.enabled) {
        this.scheduleTask(id);
      }
    }

    console.log(`[Scheduler] Started with ${this.tasks.size} tasks`);
  }

  /**
   * Останавливает планировщик
   */
  stop(): void {
    console.log('[Scheduler] Stopping...');
    this.isRunning = false;

    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    
    console.log('[Scheduler] Stopped');
  }

  /**
   * Планирует выполнение задачи
   */
  private scheduleTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || !task.enabled) return;

    const delay = this.getIntervalMs(task.interval);
    
    const timer = setTimeout(async () => {
      await this.executeTask(taskId);
      if (this.isRunning) {
        this.scheduleTask(taskId); // Перепланируем
      }
    }, delay);

    this.timers.set(taskId, timer);
  }

  /**
   * Выполняет задачу
   */
  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    console.log(`[Scheduler] Running task: ${task.name}`);
    const startTime = Date.now();

    try {
      await task.handler();
      
      task.lastRun = new Date();
      task.nextRun = this.calculateNextRun(task.interval);
      
      const duration = Date.now() - startTime;
      console.log(`[Scheduler] Task ${task.name} completed in ${duration}ms`);
    } catch (error) {
      console.error(`[Scheduler] Task ${task.name} failed:`, error);
    }
  }

  /**
   * Вычисляет время следующего запуска
   */
  private calculateNextRun(interval: ScheduleInterval): Date {
    const now = new Date();
    const next = new Date(now.getTime() + this.getIntervalMs(interval));
    return next;
  }

  /**
   * Конвертирует интервал в миллисекунды
   */
  private getIntervalMs(interval: ScheduleInterval): number {
    const intervals: Record<string, number> = {
      'hourly': 60 * 60 * 1000,
      'daily': 24 * 60 * 60 * 1000,
      'weekly': 7 * 24 * 60 * 60 * 1000,
      '5min': 5 * 60 * 1000,
      '15min': 15 * 60 * 1000,
      '30min': 30 * 60 * 1000,
    };

    return intervals[interval] || 60 * 60 * 1000; // По умолчанию 1 час
  }

  /**
   * Получает статус всех задач
   */
  getStatus(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Включает/выключает задачу
   */
  toggleTask(taskId: string, enabled: boolean): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.enabled = enabled;
    
    if (enabled && this.isRunning) {
      this.scheduleTask(taskId);
    } else {
      const timer = this.timers.get(taskId);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(taskId);
      }
    }
  }
}
