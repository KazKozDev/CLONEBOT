/**
 * Skill Registry Example
 * 
 * Demonstrates how to use the Skill Registry
 */

import { SkillRegistry } from './skill-registry';
import { join } from 'path';

async function main() {
  console.log('=== Skill Registry Example ===\n');

  // Initialize registry
  console.log('1. Initializing registry...');
  const registry = new SkillRegistry({
    workspaceDir: join(process.cwd(), 'skills'),
    bundledDir: join(process.cwd(), 'bundled-skills'),
    autoDiscover: true
  });

  // Listen to events
  registry.on('skill.added', (skill) => {
    console.log(`  [Event] Skill added: ${skill.name} v${skill.version}`);
  });

  registry.on('skill.activated', (data) => {
    console.log(`  [Event] Skill activated: ${data.skillName} (${data.reason})`);
  });

  // Load all skills
  const stats = await registry.initialize();
  console.log(`✓ Loaded ${stats.loaded} skills (${stats.failed} failed, ${stats.overridden} overridden)\n`);

  // Get all skills
  console.log('2. Listing all skills:');
  const allSkills = registry.list();
  for (const skill of allSkills) {
    console.log(`  - ${skill.name} v${skill.version} [${skill.level}] ${skill.enabled ? '✓' : '✗'}`);
    console.log(`    ${skill.description}`);
  }
  console.log();

  // Search for skills
  console.log('3. Searching for "research" skills:');
  const searchResults = registry.search('research');
  console.log(`  Found ${searchResults.length} results:`);
  for (const skill of searchResults) {
    console.log(`  - ${skill.name}: ${skill.description}`);
  }
  console.log();

  // Match user input to triggers
  console.log('4. Matching user input to triggers:');
  const userInput = 'I need to research web development best practices';
  const matches = registry.match(userInput, 3);
  console.log(`  Input: "${userInput}"`);
  console.log(`  Matches (${matches.length}):`);
  for (const match of matches) {
    console.log(`  - ${match.skill.name} (score: ${match.score})`);
    console.log(`    Matched triggers: ${match.matchedTriggers.join(', ')}`);
  }
  console.log();

  // Activate a skill
  if (matches.length > 0) {
    console.log('5. Activating best match:');
    const bestMatch = matches[0];
    const sessionId = 'example-session-123';
    
    const activated = registry.activate(
      bestMatch.skill.name,
      { sessionId },
      'User requested research'
    );
    
    if (activated) {
      console.log(`  ✓ Activated: ${bestMatch.skill.name}`);
      
      // Get active skills
      const activeSkills = registry.getActiveSkills(sessionId);
      console.log(`  Active skills in session: ${activeSkills.join(', ')}`);
    }
    console.log();
  }

  // Check dependencies
  console.log('6. Checking dependencies:');
  for (const skill of allSkills.slice(0, 3)) {
    const deps = registry.checkDependencies(skill.name);
    if (deps) {
      console.log(`  ${skill.name}:`);
      console.log(`    Satisfied: ${deps.satisfied.length}`);
      console.log(`    Unsatisfied: ${deps.unsatisfied.length}`);
      console.log(`    Conflicts: ${deps.conflicts.length}`);
    }
  }
  console.log();

  // Get registry statistics
  console.log('7. Registry statistics:');
  const regStats = registry.getStats();
  console.log(`  Total skills: ${regStats.totalSkills}`);
  console.log(`  Enabled: ${regStats.enabledSkills}`);
  console.log(`  Disabled: ${regStats.disabledSkills}`);
  console.log(`  By level:`);
  for (const [level, count] of regStats.byLevel.entries()) {
    console.log(`    ${level}: ${count}`);
  }
  console.log(`  Active sessions: ${regStats.activeSessions}`);
  console.log(`  Total active skills: ${regStats.totalActiveSkills}`);
  console.log();

  console.log('=== Example Complete ===');
}

// Run example
if (require.main === module) {
  main().catch(console.error);
}

export { main };
