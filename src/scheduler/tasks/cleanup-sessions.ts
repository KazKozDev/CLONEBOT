/**
 * Task: Cleanup Old Sessions
 * Удаляет старые неактивные сессии
 */

import * as path from 'path';
import * as fs from 'fs/promises';

export interface CleanupConfig {
  sessionsDir: string;
  maxAgeInDays: number;
  dryRun?: boolean;
}

/**
 * Создает задачу очистки старых сессий
 */
export function createCleanupSessionsTask(config: CleanupConfig) {
  return async (): Promise<void> => {
    console.log('[CleanupSessions] Starting cleanup...');
    
    const maxAgeMs = config.maxAgeInDays * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - maxAgeMs;
    
    let deletedCount = 0;
    let scannedCount = 0;
    let totalSize = 0;

    try {
      // Читаем все директории сессий
      const entries = await fs.readdir(config.sessionsDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const sessionPath = path.join(config.sessionsDir, entry.name);
        scannedCount++;

        try {
          // Проверяем время последнего изменения
          const stats = await fs.stat(sessionPath);
          
          if (stats.mtimeMs < cutoffTime) {
            // Сессия старая, удаляем
            const size = await getDirectorySize(sessionPath);
            totalSize += size;

            if (!config.dryRun) {
              await fs.rm(sessionPath, { recursive: true, force: true });
            }
            
            deletedCount++;
            console.log(
              `[CleanupSessions] ${config.dryRun ? '[DRY RUN] Would delete' : 'Deleted'} session: ${entry.name} (${formatBytes(size)}, last modified: ${new Date(stats.mtimeMs).toISOString()})`
            );
          }
        } catch (error) {
          console.error(`[CleanupSessions] Error processing ${entry.name}:`, error);
        }
      }

      console.log(
        `[CleanupSessions] Cleanup complete. Scanned: ${scannedCount}, ${config.dryRun ? 'Would delete' : 'Deleted'}: ${deletedCount}, Total size: ${formatBytes(totalSize)}`
      );
    } catch (error) {
      console.error('[CleanupSessions] Cleanup failed:', error);
      throw error;
    }
  };
}

/**
 * Вычисляет размер директории
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        totalSize += await getDirectorySize(fullPath);
      } else {
        const stats = await fs.stat(fullPath);
        totalSize += stats.size;
      }
    }
  } catch (error) {
    // Игнорируем ошибки
  }
  
  return totalSize;
}

/**
 * Форматирует байты в читаемый формат
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
