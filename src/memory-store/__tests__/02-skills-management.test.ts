/**
 * Memory Store Tests - Skills Management
 */

import { MemoryStore } from '../MemoryStore';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('MemoryStore - Skills Management', () => {
  let tempDir: string;
  let memoryStore: MemoryStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-store-test-'));
    
    memoryStore = new MemoryStore({
      workspaceDir: tempDir,
      autoLoad: false
    });

    await memoryStore.init();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('should load skill from file', async () => {
    // Создать skill файл
    const skillPath = path.join(tempDir, 'skills', 'test.skill.md');
    await fs.writeFile(
      skillPath,
      '# Test Skill\n\nThis is a test skill content.',
      'utf-8'
    );

    const skill = await memoryStore.loadSkill('test');
    
    expect(skill).not.toBeNull();
    expect(skill?.name).toBe('test');
    expect(skill?.content).toContain('Test Skill');
  });

  test('should load skill with frontmatter', async () => {
    const skillContent = `---
title: Math Expert
description: Advanced math calculations
tags: [math, calculator, expert]
---

# Math Expert Skill

Perform advanced calculations.`;

    const skillPath = path.join(tempDir, 'skills', 'math-expert.skill.md');
    await fs.writeFile(skillPath, skillContent, 'utf-8');

    const skill = await memoryStore.loadSkill('math-expert');
    
    expect(skill?.title).toBe('Math Expert');
    expect(skill?.description).toBe('Advanced math calculations');
    expect(skill?.tags).toEqual(['math', 'calculator', 'expert']);
  });

  test('should load all skills on reload', async () => {
    // Создать несколько skills
    const skills = ['skill1', 'skill2', 'skill3'];
    
    for (const name of skills) {
      const skillPath = path.join(tempDir, 'skills', `${name}.skill.md`);
      await fs.writeFile(
        skillPath,
        `# ${name}\n\nContent for ${name}`,
        'utf-8'
      );
    }

    await memoryStore.reload();
    
    const loadedSkills = memoryStore.getAllSkills();
    expect(loadedSkills.length).toBe(3);
    expect(loadedSkills.map(s => s.name).sort()).toEqual(skills.sort());
  });

  test('should get skill by id', async () => {
    const skillPath = path.join(tempDir, 'skills', 'weather.skill.md');
    await fs.writeFile(
      skillPath,
      '# Weather Skill\n\nGet weather info',
      'utf-8'
    );

    await memoryStore.loadSkill('weather');
    
    const skill = memoryStore.getSkill('weather');
    expect(skill).toBeDefined();
    expect(skill?.name).toBe('weather');
  });

  test('should unload skill', async () => {
    const skillPath = path.join(tempDir, 'skills', 'temp.skill.md');
    await fs.writeFile(skillPath, '# Temp', 'utf-8');

    await memoryStore.loadSkill('temp');
    expect(memoryStore.getSkill('temp')).toBeDefined();

    const removed = memoryStore.unloadSkill('temp');
    expect(removed).toBe(true);
    expect(memoryStore.getSkill('temp')).toBeUndefined();
  });

  test('should find skills by tags', async () => {
    const skills = [
      { name: 'math', tags: ['math', 'calculator'] },
      { name: 'weather', tags: ['weather', 'api'] },
      { name: 'calculator', tags: ['math', 'simple'] }
    ];

    for (const { name, tags } of skills) {
      const content = `---
tags: [${tags.join(', ')}]
---

# ${name}`;
      const skillPath = path.join(tempDir, 'skills', `${name}.skill.md`);
      await fs.writeFile(skillPath, content, 'utf-8');
    }

    await memoryStore.reload();

    const mathSkills = memoryStore.findSkillsByTags(['math']);
    expect(mathSkills.length).toBe(2);
    expect(mathSkills.map(s => s.name).sort()).toEqual(['calculator', 'math']);

    const weatherSkills = memoryStore.findSkillsByTags(['weather']);
    expect(weatherSkills.length).toBe(1);
    expect(weatherSkills[0].name).toBe('weather');
  });

  test('should not overwrite skill without option', async () => {
    const skillPath = path.join(tempDir, 'skills', 'test.skill.md');
    await fs.writeFile(skillPath, '# Version 1', 'utf-8');

    const skill1 = await memoryStore.loadSkill('test');
    expect(skill1?.content).toContain('Version 1');

    // Изменить файл
    await fs.writeFile(skillPath, '# Version 2', 'utf-8');

    // Загрузить без overwrite
    const skill2 = await memoryStore.loadSkill('test');
    expect(skill2?.content).toContain('Version 1'); // Старая версия

    // Загрузить с overwrite
    const skill3 = await memoryStore.loadSkill('test', { overwrite: true });
    expect(skill3?.content).toContain('Version 2'); // Новая версия
  });
});
