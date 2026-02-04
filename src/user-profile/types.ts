/**
 * User Profile - Type Definitions
 * Долгосрочная память о пользователе между сессиями
 */

/**
 * User Profile
 */
export interface UserProfile {
  userId: string;                    // telegram:257894688 или cli-session-xxx
  name?: string;                     // Имя пользователя
  preferences?: UserPreferences;     // Предпочтения
  facts: UserFact[];                 // Факты о пользователе
  metadata: UserMetadata;            // Метаданные
}

/**
 * User Preferences
 */
export interface UserPreferences {
  language?: string;                 // ru, en, es
  timezone?: string;                 // Europe/Moscow
  format?: {
    date?: string;                   // DD.MM.YYYY
    time?: string;                   // HH:mm
  };
  [key: string]: unknown;
}

/**
 * User Fact
 */
export interface UserFact {
  id: string;                        // Уникальный ID факта
  category: FactCategory;            // Категория
  content: string;                   // Содержимое факта
  confidence: number;                // Уверенность 0-1
  source: 'user' | 'inferred' | 'manual'; // Источник
  timestamp: number;                 // Когда узнали
  expiresAt?: number;                // Когда устаревает (опционально)
}

/**
 * Fact Categories
 */
export type FactCategory =
  | 'personal'      // Имя, возраст, местоположение
  | 'preference'    // Предпочтения, интересы
  | 'context'       // Контекстная информация
  | 'work'          // Работа, проекты
  | 'temporary'     // Временные факты
  | 'name'          // Имя пользователя
  | 'age'           // Возраст
  | 'location'      // Местоположение
  | 'other';        // Другое

/**
 * User Metadata
 */
export interface UserMetadata {
  createdAt: number;                 // Когда создан профиль
  updatedAt: number;                 // Последнее обновление
  lastSeenAt: number;                // Последняя активность
  totalSessions: number;             // Всего сессий
  totalMessages: number;             // Всего сообщений
}

/**
 * User Profile Store Config
 */
export interface UserProfileStoreConfig {
  profilesDir: string;               // ~/.openclone/workspace/users/
  autoSave: boolean;                 // Автосохранение
  maxFacts?: number;                 // Макс фактов (default: 100)
  factExpiration?: number;           // Время жизни временных фактов (ms)
}

/**
 * Remember Fact Options
 */
export interface RememberFactOptions {
  category?: FactCategory;
  confidence?: number;
  source?: 'user' | 'inferred' | 'manual';
  expiresIn?: number;                // Миллисекунды
}

/**
 * Recall Facts Options
 */
export interface RecallFactsOptions {
  category?: FactCategory;
  minConfidence?: number;
  limit?: number;
  includeExpired?: boolean;
}
