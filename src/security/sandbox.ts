/**
 * Code Sandbox
 * Безопасное выполнение ненадежного кода в изолированной среде
 */

import { Worker } from 'worker_threads';
import * as vm from 'vm';

export interface SandboxConfig {
  timeout?: number; // Максимальное время выполнения (мс)
  memoryLimit?: number; // Лимит памяти (МБ)
  allowedModules?: string[]; // Разрешенные модули
  useWorker?: boolean; // Использовать worker_threads вместо vm
}

export interface SandboxResult<T = any> {
  success: boolean;
  result?: T;
  error?: string;
  executionTime: number;
  memoryUsed?: number;
}

const DEFAULT_CONFIG: Required<SandboxConfig> = {
  timeout: 5000,
  memoryLimit: 128,
  allowedModules: ['crypto', 'util', 'querystring', 'url'],
  useWorker: false,
};

/**
 * Sandbox для безопасного выполнения кода
 */
export class CodeSandbox {
  private config: Required<SandboxConfig>;

  constructor(config?: SandboxConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Выполняет код в изолированной среде
   */
  async execute<T = any>(code: string, context?: Record<string, any>): Promise<SandboxResult<T>> {
    const startTime = Date.now();

    try {
      if (this.config.useWorker) {
        return await this.executeInWorker<T>(code, context);
      } else {
        return await this.executeInVM<T>(code, context);
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Выполнение в VM (легковесный, но менее изолированный)
   */
  private async executeInVM<T>(code: string, context?: Record<string, any>): Promise<SandboxResult<T>> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      // Создаем безопасный контекст
      const sandbox = vm.createContext({
        console: {
          log: (...args: any[]) => console.log('[Sandbox]', ...args),
          error: (...args: any[]) => console.error('[Sandbox]', ...args),
          warn: (...args: any[]) => console.warn('[Sandbox]', ...args),
        },
        setTimeout: undefined, // Блокируем таймеры
        setInterval: undefined,
        setImmediate: undefined,
        process: undefined, // Блокируем доступ к process
        require: this.createSafeRequire(),
        ...context,
      });

      // Компилируем и выполняем код
      const script = new vm.Script(code);

      const result = script.runInContext(sandbox, {
        timeout: this.config.timeout,
        breakOnSigint: true,
      });

      const executionTime = Date.now() - startTime;
      const memoryUsed = Math.round((process.memoryUsage().heapUsed - startMemory) / 1024 / 1024);

      // Проверка лимита памяти
      if (memoryUsed > this.config.memoryLimit) {
        throw new Error(`Memory limit exceeded: ${memoryUsed}MB > ${this.config.memoryLimit}MB`);
      }

      return {
        success: true,
        result: result as T,
        executionTime,
        memoryUsed,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Выполнение в Worker Thread (более изолированный)
   */
  private async executeInWorker<T>(code: string, context?: Record<string, any>): Promise<SandboxResult<T>> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const workerCode = `
        const { parentPort, workerData } = require('worker_threads');
        
        try {
          const context = workerData.context || {};
          const func = new Function(...Object.keys(context), workerData.code);
          const result = func(...Object.values(context));
          parentPort.postMessage({ success: true, result });
        } catch (error) {
          parentPort.postMessage({ success: false, error: error.message });
        }
      `;

      const worker = new Worker(workerCode, {
        eval: true,
        workerData: { code, context },
      });

      const timeout = setTimeout(() => {
        worker.terminate();
        resolve({
          success: false,
          error: `Execution timeout after ${this.config.timeout}ms`,
          executionTime: Date.now() - startTime,
        });
      }, this.config.timeout);

      worker.on('message', (message) => {
        clearTimeout(timeout);
        worker.terminate();
        resolve({
          ...message,
          executionTime: Date.now() - startTime,
        });
      });

      worker.on('error', (error) => {
        clearTimeout(timeout);
        worker.terminate();
        resolve({
          success: false,
          error: error.message,
          executionTime: Date.now() - startTime,
        });
      });

      worker.on('exit', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          resolve({
            success: false,
            error: `Worker stopped with exit code ${code}`,
            executionTime: Date.now() - startTime,
          });
        }
      });
    });
  }

  /**
   * Создает безопасную функцию require с ограничениями
   */
  private createSafeRequire(): (moduleName: string) => any {
    return (moduleName: string) => {
      if (!this.config.allowedModules.includes(moduleName)) {
        throw new Error(`Module "${moduleName}" is not allowed in sandbox`);
      }
      return require(moduleName);
    };
  }

  /**
   * Валидирует код перед выполнением (базовые проверки)
   */
  validateCode(code: string): { valid: boolean; error?: string } {
    // Проверка на опасные паттерны
    const dangerousPatterns = [
      /require\s*\(\s*['"]child_process['"]\s*\)/,
      /require\s*\(\s*['"]fs['"]\s*\)/,
      /require\s*\(\s*['"]net['"]\s*\)/,
      /require\s*\(\s*['"]http['"]\s*\)/,
      /eval\s*\(/,
      /Function\s*\(/,
      /process\./,
      /__dirname/,
      /__filename/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        return {
          valid: false,
          error: `Dangerous pattern detected: ${pattern}`,
        };
      }
    }

    return { valid: true };
  }
}

/**
 * Глобальный singleton для удобства
 */
let defaultSandbox: CodeSandbox | null = null;

export function getDefaultSandbox(): CodeSandbox {
  if (!defaultSandbox) {
    defaultSandbox = new CodeSandbox();
  }
  return defaultSandbox;
}

/**
 * Быстрый метод для выполнения кода
 */
export async function executeSafely<T = any>(
  code: string,
  context?: Record<string, any>,
  config?: SandboxConfig
): Promise<SandboxResult<T>> {
  const sandbox = config ? new CodeSandbox(config) : getDefaultSandbox();
  return sandbox.execute<T>(code, context);
}
