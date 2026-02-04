/**
 * Memory Store
 * Главный класс для управления долгосрочной памятью бота
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { WorkspaceLoader } from './WorkspaceLoader';
import { CredentialManager } from './CredentialManager';
import type {
  Workspace,
  SystemPrompts,
  Skill,
  BotConfig,
  Allowlists,
  MemoryStoreConfig,
  LoadResult,
  SkillLoadOptions
} from './types';

export class MemoryStore {
  private workspace: Workspace;
  private loader: WorkspaceLoader;
  private credentialManager: CredentialManager;
  private config: MemoryStoreConfig;
  private initialized = false;

  constructor(config: MemoryStoreConfig, masterPassword?: string) {
    this.config = {
      autoLoad: true,
      watchFiles: false,
      ...config
    };

    this.loader = new WorkspaceLoader(this.config.workspaceDir);
    this.credentialManager = new CredentialManager(this.config.workspaceDir, masterPassword);

    // Инициализировать пустой workspace
    this.workspace = {
      prompts: {},
      skills: new Map(),
      config: {},
      credentials: new Map(),
      allowlists: { dm: [], groups: [] },
      loadedAt: Date.now()
    };
  }

  /**
   * Инициализация - создать структуру и загрузить данные
   */
  async init(): Promise<LoadResult> {
    if (this.initialized) {
      throw new Error('MemoryStore already initialized');
    }

    // Создать структуру workspace если не существует
    await this.loader.initWorkspace();

    // Загрузить credentials
    await this.credentialManager.load();

    // Загрузить остальное если autoLoad
    let result: LoadResult = {
      success: true,
      promptsLoaded: 0,
      skillsLoaded: 0,
      configLoaded: false
    };

    if (this.config.autoLoad) {
      result = await this.reload();
    }

    this.initialized = true;
    return result;
  }

  /**
   * Перезагрузить всю память из файловой системы
   */
  async reload(): Promise<LoadResult> {
    const result = await this.loader.loadAll();

    // Обновить workspace
    this.workspace.prompts = await this.loader.loadPrompts();
    this.workspace.skills = await this.loader.loadSkills();
    this.workspace.config = await this.loader.loadConfig();
    this.workspace.allowlists = await this.loadAllowlists();
    this.workspace.loadedAt = Date.now();

    // Перезагрузить credentials
    await this.credentialManager.load();

    return result;
  }

  // ========================================================================
  // Prompts API
  // ========================================================================

  /**
   * Получить системный промпт по ключу
   */
  getPrompt(key: string): string | undefined {
    return this.workspace.prompts[key];
  }

  /**
   * Получить все промпты
   */
  getAllPrompts(): SystemPrompts {
    return { ...this.workspace.prompts };
  }

  /**
   * Установить промпт (в памяти)
   */
  setPrompt(key: string, content: string): void {
    this.workspace.prompts[key] = content;
  }

  // ========================================================================
  // Skills API
  // ========================================================================

  /**
   * Получить навык по ID
   */
  getSkill(id: string): Skill | undefined {
    return this.workspace.skills.get(id);
  }

  /**
   * Получить все навыки
   */
  getAllSkills(): Skill[] {
    return Array.from(this.workspace.skills.values());
  }

  /**
   * Загрузить навык из файла
   */
  async loadSkill(name: string, options?: SkillLoadOptions): Promise<Skill | null> {
    const skillPath = path.join(this.config.workspaceDir, 'skills', `${name}.skill.md`);
    
    // Проверить что файл существует
    try {
      await fs.access(skillPath);
    } catch {
      console.error(`Skill file not found: ${skillPath}`);
      return null;
    }

    // Проверить перезапись
    if (!options?.overwrite && this.workspace.skills.has(name)) {
      console.warn(`Skill ${name} already loaded. Use overwrite option to reload.`);
      return this.workspace.skills.get(name) || null;
    }

    const skill = await this.loader.loadSkillFile(skillPath);
    if (skill) {
      this.workspace.skills.set(skill.id, skill);
    }

    return skill;
  }

  /**
   * Удалить навык из памяти
   */
  unloadSkill(id: string): boolean {
    return this.workspace.skills.delete(id);
  }

  /**
   * Найти навыки по тегам
   */
  findSkillsByTags(tags: string[]): Skill[] {
    return this.getAllSkills().filter(skill => 
      skill.tags?.some(tag => tags.includes(tag))
    );
  }

  // ========================================================================
  // Config API
  // ========================================================================

  /**
   * Получить конфигурацию
   */
  getConfig(): BotConfig {
    return { ...this.workspace.config };
  }

  /**
   * Обновить конфигурацию (частично)
   */
  updateConfig(updates: Partial<BotConfig>): void {
    this.workspace.config = {
      ...this.workspace.config,
      ...updates
    };
  }

  /**
   * Сохранить конфигурацию в файл
   */
  async saveConfig(): Promise<void> {
    await this.loader.saveConfig(this.workspace.config);
  }

  // ========================================================================
  // Credentials API
  // ========================================================================

  /**
   * Установить credential
   */
  setCredential(key: string, value: string): void {
    this.credentialManager.set(key, value);
  }

  /**
   * Получить credential
   */
  getCredential(key: string): string | undefined {
    return this.credentialManager.get(key);
  }

  /**
   * Удалить credential
   */
  deleteCredential(key: string): boolean {
    return this.credentialManager.delete(key);
  }

  /**
   * Сохранить credentials в файл
   */
  async saveCredentials(): Promise<void> {
    await this.credentialManager.save();
  }

  /**
   * Список всех credential ключей
   */
  getCredentialKeys(): string[] {
    return this.credentialManager.keys();
  }

  // ========================================================================
  // Allowlists API
  // ========================================================================

  /**
   * Получить allowlists
   */
  getAllowlists(): Allowlists {
    return { ...this.workspace.allowlists };
  }

  /**
   * Добавить в DM allowlist
   */
  allowDM(userId: string): void {
    if (!this.workspace.allowlists.dm.includes(userId)) {
      this.workspace.allowlists.dm.push(userId);
    }
  }

  /**
   * Добавить в group allowlist
   */
  allowGroup(groupId: string): void {
    if (!this.workspace.allowlists.groups.includes(groupId)) {
      this.workspace.allowlists.groups.push(groupId);
    }
  }

  /**
   * Проверить разрешен ли DM
   */
  isDMAllowed(userId: string): boolean {
    return this.workspace.allowlists.dm.includes(userId);
  }

  /**
   * Проверить разрешена ли группа
   */
  isGroupAllowed(groupId: string): boolean {
    return this.workspace.allowlists.groups.includes(groupId);
  }

  /**
   * Сохранить allowlists
   */
  async saveAllowlists(): Promise<void> {
    const allowlistsPath = path.join(this.config.workspaceDir, 'allowlists.json');
    await fs.writeFile(
      allowlistsPath,
      JSON.stringify(this.workspace.allowlists, null, 2),
      'utf-8'
    );
  }

  /**
   * Загрузить allowlists
   */
  private async loadAllowlists(): Promise<Allowlists> {
    const allowlistsPath = path.join(this.config.workspaceDir, 'allowlists.json');
    
    try {
      const content = await fs.readFile(allowlistsPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { dm: [], groups: [] };
      }
      throw error;
    }
  }

  // ========================================================================
  // Utility
  // ========================================================================

  /**
   * Получить статистику workspace
   */
  getStats() {
    return {
      promptsCount: Object.keys(this.workspace.prompts).length,
      skillsCount: this.workspace.skills.size,
      credentialsCount: this.credentialManager.keys().length,
      dmAllowlistCount: this.workspace.allowlists.dm.length,
      groupAllowlistCount: this.workspace.allowlists.groups.length,
      loadedAt: this.workspace.loadedAt
    };
  }

  /**
   * Получить полный workspace (для экспорта)
   */
  getWorkspace(): Workspace {
    return {
      ...this.workspace,
      skills: new Map(this.workspace.skills),
      credentials: new Map() // Не экспортируем credentials
    };
  }
}
