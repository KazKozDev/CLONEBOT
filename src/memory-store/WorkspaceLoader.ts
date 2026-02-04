/**
 * Workspace Loader
 * Загрузка промптов, навыков и конфигов из файловой системы
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { SystemPrompts, Skill, BotConfig, LoadResult } from './types';

export class WorkspaceLoader {
  constructor(private workspaceDir: string) { }

  /**
   * Загрузить все системные промпты из bootstrap/
   */
  async loadPrompts(): Promise<SystemPrompts> {
    const promptsDir = path.join(this.workspaceDir, 'bootstrap');
    const prompts: SystemPrompts = {};

    try {
      const files = await fs.readdir(promptsDir);

      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(promptsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');

          // Конвертировать имя файла в ключ (agent.md -> agent)
          const key = path.basename(file, '.md').toLowerCase();
          prompts[key] = content.trim();
        }
      }
    } catch (error) {
      // Директория может не существовать при первом запуске
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    return prompts;
  }

  /**
   * Загрузить все навыки из skills/
   */
  async loadSkills(): Promise<Map<string, Skill>> {
    const skillsDir = path.join(this.workspaceDir, 'skills');
    const skills = new Map<string, Skill>();

    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.skill.md')) {
          const filePath = path.join(skillsDir, entry.name);
          const skill = await this.loadSkillFile(filePath);
          if (skill) {
            skills.set(skill.id, skill);
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    return skills;
  }

  /**
   * Загрузить один skill файл
   */
  async loadSkillFile(filePath: string): Promise<Skill | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const name = path.basename(filePath, '.skill.md');

      // Парсить метаданные из frontmatter (опционально)
      const metadata = this.parseFrontmatter(content);

      return {
        id: name,
        name,
        title: metadata.title || name,
        description: metadata.description,
        content: content.trim(),
        tags: metadata.tags,
        metadata,
        loadedAt: Date.now()
      };
    } catch (error) {
      console.error(`Failed to load skill ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Загрузить конфигурацию из openclaw.json
   */
  async loadConfig(): Promise<BotConfig> {
    const configPath = path.join(this.workspaceDir, 'openclaw.json');

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Вернуть дефолтную конфигурацию
        return this.getDefaultConfig();
      }
      throw error;
    }
  }

  /**
   * Сохранить конфигурацию
   */
  async saveConfig(config: BotConfig): Promise<void> {
    const configPath = path.join(this.workspaceDir, 'openclaw.json');

    // Убедиться что директория существует
    await fs.mkdir(path.dirname(configPath), { recursive: true });

    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );
  }

  /**
   * Загрузить все (промпты + навыки + конфиг)
   */
  async loadAll(): Promise<LoadResult> {
    const errors: string[] = [];
    let promptsLoaded = 0;
    let skillsLoaded = 0;
    let configLoaded = false;

    try {
      const prompts = await this.loadPrompts();
      promptsLoaded = Object.keys(prompts).length;
    } catch (error) {
      errors.push(`Failed to load prompts: ${error}`);
    }

    try {
      const skills = await this.loadSkills();
      skillsLoaded = skills.size;
    } catch (error) {
      errors.push(`Failed to load skills: ${error}`);
    }

    try {
      await this.loadConfig();
      configLoaded = true;
    } catch (error) {
      errors.push(`Failed to load config: ${error}`);
    }

    return {
      success: errors.length === 0,
      promptsLoaded,
      skillsLoaded,
      configLoaded,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Парсить YAML frontmatter (упрощенная версия)
   */
  private parseFrontmatter(content: string): Record<string, any> {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      return {};
    }

    const yaml = frontmatterMatch[1];
    const metadata: Record<string, any> = {};

    // Простой парсинг YAML (только key: value)
    for (const line of yaml.split('\n')) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        // Обработка массивов [tag1, tag2]
        if (value.startsWith('[') && value.endsWith(']')) {
          metadata[key] = value
            .slice(1, -1)
            .split(',')
            .map(s => s.trim());
        } else {
          metadata[key] = value;
        }
      }
    }

    return metadata;
  }

  /**
   * Дефолтная конфигурация
   */
  private getDefaultConfig(): BotConfig {
    return {
      version: '1.0.0',
      defaultModel: 'ollama/gpt-oss:20b',
      thinkingLevel: 'medium',
      verbose: false,
      autoReset: {
        enabled: true,
        maxMessages: 100,
        maxTokens: 50000,
        maxIdleMinutes: 60
      },
      telegram: {
        allowDM: true,
        allowGroups: false
      }
    };
  }

  /**
   * Инициализировать workspace структуру
   */
  async initWorkspace(): Promise<void> {
    const dirs = [
      path.join(this.workspaceDir, 'bootstrap'),
      path.join(this.workspaceDir, 'skills'),
      path.join(this.workspaceDir, 'credentials')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    // Создать дефолтный конфиг если не существует
    const configPath = path.join(this.workspaceDir, 'openclaw.json');
    try {
      await fs.access(configPath);
    } catch {
      await this.saveConfig(this.getDefaultConfig());
    }
  }
}
