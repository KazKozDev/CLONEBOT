/**
 * Memory Store Tests - Workspace Loader
 */

import { WorkspaceLoader } from '../WorkspaceLoader';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('WorkspaceLoader', () => {
  let tempDir: string;
  let loader: WorkspaceLoader;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-loader-test-'));
    loader = new WorkspaceLoader(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('should load prompts from bootstrap/', async () => {
    const bootstrapDir = path.join(tempDir, 'bootstrap');
    await fs.mkdir(bootstrapDir, { recursive: true });

    await fs.writeFile(
      path.join(bootstrapDir, 'agent.md'),
      'You are a helpful AI assistant',
      'utf-8'
    );
    await fs.writeFile(
      path.join(bootstrapDir, 'soul.md'),
      'Be friendly and helpful',
      'utf-8'
    );

    const prompts = await loader.loadPrompts();
    
    expect(prompts.agent).toBe('You are a helpful AI assistant');
    expect(prompts.soul).toBe('Be friendly and helpful');
    expect(Object.keys(prompts).length).toBe(2);
  });

  test('should handle missing bootstrap directory', async () => {
    const prompts = await loader.loadPrompts();
    expect(prompts).toEqual({});
  });

  test('should load skills from skills/', async () => {
    const skillsDir = path.join(tempDir, 'skills');
    await fs.mkdir(skillsDir, { recursive: true });

    await fs.writeFile(
      path.join(skillsDir, 'math.skill.md'),
      '# Math Skill\n\nMath operations',
      'utf-8'
    );
    await fs.writeFile(
      path.join(skillsDir, 'weather.skill.md'),
      '# Weather Skill\n\nWeather info',
      'utf-8'
    );

    const skills = await loader.loadSkills();
    
    expect(skills.size).toBe(2);
    expect(skills.has('math')).toBe(true);
    expect(skills.has('weather')).toBe(true);
    expect(skills.get('math')?.name).toBe('math');
  });

  test('should parse frontmatter in skills', async () => {
    const skillsDir = path.join(tempDir, 'skills');
    await fs.mkdir(skillsDir, { recursive: true });

    const content = `---
title: Test Skill
description: This is a test
tags: [test, demo]
---

# Test Content`;

    await fs.writeFile(
      path.join(skillsDir, 'test.skill.md'),
      content,
      'utf-8'
    );

    const skills = await loader.loadSkills();
    const skill = skills.get('test');
    
    expect(skill?.title).toBe('Test Skill');
    expect(skill?.description).toBe('This is a test');
    expect(skill?.tags).toEqual(['test', 'demo']);
  });

  test('should load config from openclaw.json', async () => {
    const config = {
      version: '2.0.0',
      defaultModel: 'gpt-4',
      verbose: true
    };

    await fs.writeFile(
      path.join(tempDir, 'openclaw.json'),
      JSON.stringify(config),
      'utf-8'
    );

    const loaded = await loader.loadConfig();
    expect(loaded.version).toBe('2.0.0');
    expect(loaded.defaultModel).toBe('gpt-4');
    expect(loaded.verbose).toBe(true);
  });

  test('should return default config if file missing', async () => {
    const config = await loader.loadConfig();
    
    expect(config.version).toBe('1.0.0');
    expect(config.defaultModel).toBe('llama3.2');
    expect(config.autoReset?.enabled).toBe(true);
  });

  test('should save config', async () => {
    const config = {
      version: '3.0.0',
      defaultModel: 'claude',
      customField: 'test'
    };

    await loader.saveConfig(config);

    const saved = await fs.readFile(
      path.join(tempDir, 'openclaw.json'),
      'utf-8'
    );
    const parsed = JSON.parse(saved);
    
    expect(parsed.version).toBe('3.0.0');
    expect(parsed.customField).toBe('test');
  });

  test('should load all resources', async () => {
    // Создать структуру
    await fs.mkdir(path.join(tempDir, 'bootstrap'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'skills'), { recursive: true });

    await fs.writeFile(
      path.join(tempDir, 'bootstrap', 'agent.md'),
      'Agent prompt',
      'utf-8'
    );
    await fs.writeFile(
      path.join(tempDir, 'skills', 'skill1.skill.md'),
      '# Skill 1',
      'utf-8'
    );
    await fs.writeFile(
      path.join(tempDir, 'openclaw.json'),
      JSON.stringify({ version: '1.0.0' }),
      'utf-8'
    );

    const result = await loader.loadAll();
    
    expect(result.success).toBe(true);
    expect(result.promptsLoaded).toBe(1);
    expect(result.skillsLoaded).toBe(1);
    expect(result.configLoaded).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  test('should initialize workspace structure', async () => {
    await loader.initWorkspace();

    const [bootstrap, skills, credentials, config] = await Promise.all([
      fs.stat(path.join(tempDir, 'bootstrap')),
      fs.stat(path.join(tempDir, 'skills')),
      fs.stat(path.join(tempDir, 'credentials')),
      fs.stat(path.join(tempDir, 'openclaw.json'))
    ]);

    expect(bootstrap.isDirectory()).toBe(true);
    expect(skills.isDirectory()).toBe(true);
    expect(credentials.isDirectory()).toBe(true);
    expect(config.isFile()).toBe(true);
  });
});
