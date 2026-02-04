/**
 * Skill Registry - Загрузка и управление навыками агента
 * 
 * Парсит .skill.md файлы из папки skills/ и делает их доступными для агента
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  SkillProvider,
  Skill as ContextSkill,
  ToolDefinition
} from '../context-assembler/types';

export interface Skill {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: number;
  instructions: string;
  examples: string;
  triggers: string[];
  tools: string[];
  toolDefinitions?: ToolDefinition[];
  metadata?: Record<string, any>;
}

export class SkillRegistry implements SkillProvider {
  private skills: Map<string, Skill> = new Map();
  private skillsDir: string;
  private sessionsDir: string;

  constructor(skillsDir: string = './skills', sessionsDir: string = './sessions') {
    this.skillsDir = skillsDir;
    this.sessionsDir = sessionsDir;
  }

  /**
   * Загрузить все skills из директории
   */
  async loadAll(): Promise<void> {
    if (!fs.existsSync(this.skillsDir)) {
      console.warn(`⚠️  Skills directory not found: ${this.skillsDir}`);
      return;
    }

    const files = fs.readdirSync(this.skillsDir);
    const skillFiles = files.filter(f => f.endsWith('.skill.md'));

    console.log(`📚 Loading ${skillFiles.length} skills from ${this.skillsDir}`);

    for (const file of skillFiles) {
      try {
        const filePath = path.join(this.skillsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const skill = this.parseSkillFile(file, content);

        this.skills.set(skill.id, skill);
        console.log(`  ✓ Loaded skill: ${skill.title} (priority: ${skill.priority})`);
      } catch (error: any) {
        console.error(`  ❌ Failed to load ${file}: ${error.message}`);
      }
    }

    console.log(`✅ Loaded ${this.skills.size} skills total`);
  }

  /**
   * Парсить .skill.md файл
   */
  private parseSkillFile(filename: string, content: string): Skill {
    const id = filename.replace('.skill.md', '');

    // Извлечь title (первый заголовок #)
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : id;

    // Извлечь metadata из **Описание:**
    const descMatch = content.match(/\*\*Описание:\*\*\s+(.+)/);
    const description = descMatch ? descMatch[1] : '';

    const categoryMatch = content.match(/\*\*Категория:\*\*\s+(.+)/);
    const category = categoryMatch ? categoryMatch[1] : 'general';

    const priorityMatch = content.match(/\*\*Приоритет:\*\*\s+(\d+)/);
    const priority = priorityMatch ? parseInt(priorityMatch[1]) : 50;

    // Извлечь секцию ## Инструкции
    const instructionsMatch = content.match(/## Инструкции\s+([\s\S]+?)(?=\n##|$)/);
    const instructions = instructionsMatch ? instructionsMatch[1].trim() : '';

    // Извлечь секцию ## Примеры
    const examplesMatch = content.match(/## Примеры\s+([\s\S]+?)(?=\n##|$)/);
    const examples = examplesMatch ? examplesMatch[1].trim() : '';

    // Извлечь triggers из ## Триггеры
    const triggersSection = content.match(/## Триггеры\s+([\s\S]+?)(?=\n##|$)/);
    const triggers: string[] = [];
    if (triggersSection) {
      const lines = triggersSection[1].split('\n');
      for (const line of lines) {
        const cleaned = line.replace(/^-\s*/, '').trim();
        if (cleaned) triggers.push(cleaned);
      }
    }

    // Извлечь tools из ## Tools
    const toolsSection = content.match(/## Tools\s+([\s\S]+?)(?=\n##|$)/);
    const tools: string[] = [];
    if (toolsSection) {
      const lines = toolsSection[1].split('\n');
      for (const line of lines) {
        const cleaned = line.replace(/^-\s*/, '').trim();
        if (cleaned) tools.push(cleaned);
      }
    }

    return {
      id,
      title,
      description,
      category,
      priority,
      instructions,
      examples,
      triggers,
      tools,
    };
  }

  /**
   * Получить все skills отсортированные по приоритету
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values()).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Найти подходящие skills для запроса
   */
  findRelevantSkills(query: string): Skill[] {
    const lowerQuery = query.toLowerCase();
    const relevant: Skill[] = [];

    for (const skill of this.skills.values()) {
      // Проверить triggers
      const hasMatchingTrigger = skill.triggers.some(trigger =>
        lowerQuery.includes(trigger.toLowerCase())
      );

      if (hasMatchingTrigger) {
        relevant.push(skill);
      }
    }

    // Сортировать по приоритету
    return relevant.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Получить skill по ID
   */
  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  /**
   * Построить расширенный system prompt с активированными skills
   */
  buildSystemPromptWithSkills(basePrompt: string, query: string): string {
    const relevantSkills = this.findRelevantSkills(query);

    if (relevantSkills.length === 0) {
      return basePrompt;
    }

    let promptWithSkills = basePrompt + '\n\n';
    promptWithSkills += '═══════════════════════════════════════\n';
    promptWithSkills += '🎯 АКТИВИРОВАННЫЕ НАВЫКИ (SKILLS)\n';
    promptWithSkills += '═══════════════════════════════════════\n\n';

    for (const skill of relevantSkills) {
      promptWithSkills += `📌 ${skill.title}\n`;
      promptWithSkills += `Категория: ${skill.category} | Приоритет: ${skill.priority}\n\n`;
      promptWithSkills += `${skill.instructions}\n\n`;

      if (skill.tools.length > 0) {
        promptWithSkills += `Доступные tools: ${skill.tools.join(', ')}\n\n`;
      }

      promptWithSkills += '---\n\n';
    }

    return promptWithSkills;
  }

  /**
   * Получить статистику по skills
   */
  getStats() {
    const skills = this.getAllSkills();
    const categories = new Set(skills.map(s => s.category));
    const totalTools = new Set(skills.flatMap(s => s.tools));

    return {
      total: skills.length,
      categories: Array.from(categories),
      tools: Array.from(totalTools),
      byCategory: Array.from(categories).map(cat => ({
        category: cat,
        count: skills.filter(s => s.category === cat).length,
      })),
    };
  }
  // ============================================================================
  // SkillProvider Implementation
  // ============================================================================

  async getActiveSkills(agentId: string, sessionId?: string): Promise<ContextSkill[]> {
    const forceAll = process.env.SKILLS_ALL === 'true';
    if (forceAll) {
      const all = this.getAllSkills();
      return all.map(s => this.mapToContextSkill(s));
    }

    if (!sessionId) {
      return [];
    }

    const lastUserMessage = this.getLastUserMessageFromSession(sessionId);
    if (!lastUserMessage) {
      return [];
    }

    const relevant = this.findRelevantSkills(lastUserMessage);
    return relevant.map(s => this.mapToContextSkill(s));
  }

  private getLastUserMessageFromSession(sessionId: string): string | null {
    try {
      const messagesPath = path.join(this.sessionsDir, sessionId, 'messages.jsonl');
      if (!fs.existsSync(messagesPath)) return null;

      const content = fs.readFileSync(messagesPath, 'utf-8');
      const lines = content
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const msg = JSON.parse(lines[i]) as any;
          if (msg?.type === 'user' && typeof msg?.content === 'string') {
            return msg.content;
          }
        } catch {
          // Skip invalid JSON lines
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  async getSkillInstructions(skillId: string): Promise<string | null> {
    const skill = this.getSkill(skillId);
    return skill ? skill.instructions : null;
  }

  async getSkillTools(skillId: string): Promise<ToolDefinition[]> {
    const skill = this.getSkill(skillId);
    return skill?.toolDefinitions || [];
  }

  async getSkillPriority(skillId: string): Promise<number> {
    const skill = this.getSkill(skillId);
    return skill ? skill.priority : 0;
  }

  private mapToContextSkill(skill: Skill): ContextSkill {
    return {
      id: skill.id,
      name: skill.title,
      instructions: skill.instructions,
      tools: skill.toolDefinitions,
      examples: [skill.examples],
      priority: skill.priority
    };
  }
}
