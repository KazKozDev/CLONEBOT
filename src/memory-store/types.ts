/**
 * Memory Store - Type Definitions
 * Долгосрочное хранилище для промптов, навыков, конфигураций
 */

/**
 * Системные промпты
 */
export interface SystemPrompts {
  agent?: string;      // AGENTS.md
  soul?: string;       // SOUL.md
  tools?: string;      // TOOLS.md
  identity?: string;   // IDENTITY.md
  [key: string]: string | undefined;
}

/**
 * Навык (skill) из *.skill.md файлов
 */
export interface Skill {
  id: string;          // Уникальный ID навыка
  name: string;        // Имя файла без расширения
  title?: string;      // Заголовок из метаданных
  description?: string;
  content: string;     // Полный контент markdown
  tags?: string[];
  metadata?: Record<string, unknown>;
  loadedAt: number;    // Timestamp загрузки
}

/**
 * Конфигурация бота
 */
export interface BotConfig {
  version?: string;
  defaultModel?: string;
  thinkingLevel?: 'low' | 'medium' | 'high';
  verbose?: boolean;
  autoReset?: {
    enabled: boolean;
    maxMessages?: number;
    maxTokens?: number;
    maxIdleMinutes?: number;
  };
  telegram?: {
    allowDM?: boolean;
    allowGroups?: boolean;
  };
  [key: string]: unknown;
}

/**
 * Allowlist для доступа
 */
export interface Allowlists {
  dm: string[];        // Allowed user IDs for DM
  groups: string[];    // Allowed group/chat IDs
}

/**
 * Workspace - вся долгосрочная память
 */
export interface Workspace {
  prompts: SystemPrompts;
  skills: Map<string, Skill>;
  config: BotConfig;
  credentials: Map<string, string>;
  allowlists: Allowlists;
  loadedAt: number;
}

/**
 * Конфигурация Memory Store
 */
export interface MemoryStoreConfig {
  workspaceDir: string;  // Базовая директория (~/.openclone/workspace)
  autoLoad?: boolean;    // Автоматически загружать при инициализации
  watchFiles?: boolean;  // Следить за изменениями файлов
}

/**
 * Результат загрузки workspace
 */
export interface LoadResult {
  success: boolean;
  promptsLoaded: number;
  skillsLoaded: number;
  configLoaded: boolean;
  errors?: string[];
}

/**
 * Опции для загрузки skill
 */
export interface SkillLoadOptions {
  overwrite?: boolean;  // Перезаписать если уже загружен
  validate?: boolean;   // Валидировать формат
}

/**
 * Credential entry
 */
export interface CredentialEntry {
  key: string;
  value: string;
  createdAt: number;
  updatedAt: number;
  encrypted?: boolean;
}
