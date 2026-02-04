/**
 * Agent Loop Integration Example
 * 
 * Demonstrates how to integrate Skill Registry with Agent Loop
 */

import { SkillRegistry } from './skill-registry';
import { AgentLoopIntegration } from './agent-loop-integration';
import { SkillContextTransformer, createContextAssemblerHook } from './context-assembler-integration';
import { join } from 'path';

async function main() {
  console.log('=== Agent Loop Integration Example ===\n');

  // 1. Initialize Skill Registry
  console.log('1. Initializing Skill Registry...');
  const registry = new SkillRegistry({
    workspaceDir: join(process.cwd(), 'skills'),
    autoDiscover: true
  });

  const stats = await registry.initialize();
  console.log(`✓ Loaded ${stats.loaded} skills\n`);

  // 2. Create Agent Loop Integration
  console.log('2. Setting up Agent Loop Integration...');
  const integration = new AgentLoopIntegration(registry, {
    autoActivate: true,
    autoActivateThreshold: 5,
    maxAutoActivate: 3,
    includeExamples: false,
    injectionMode: 'system'
  });

  // Listen to activation events
  integration.on('skill.activated', (data) => {
    console.log(`  [Event] Skill activated: ${data.skillName}`);
  });

  integration.on('auto.activated', (data) => {
    console.log(`  [Event] Auto-activated: ${data.skill} (score: ${data.score})`);
  });
  console.log();

  // 3. Simulate user message
  const sessionId = 'test-session-001';
  const userMessage = 'I need to research web development best practices';
  
  console.log('3. Processing user message:');
  console.log(`  User: "${userMessage}"`);
  console.log();

  // 4. Process message and activate skills
  console.log('4. Activating skills...');
  const activation = await integration.processMessage(userMessage, sessionId);
  
  console.log(`  Activated: ${activation.activatedSkills.length} skills`);
  for (const skill of activation.activatedSkills) {
    console.log(`    - ${skill}`);
  }
  
  if (activation.errors.length > 0) {
    console.log(`  Errors: ${activation.errors.length}`);
    for (const err of activation.errors) {
      console.log(`    - ${err.skill}: ${err.error}`);
    }
  }
  console.log();

  // 5. Get enhanced context
  console.log('5. Building enhanced context...');
  const enhancedContext = integration.getEnhancedContext(userMessage, sessionId);
  
  console.log(`  Active skills: ${enhancedContext.activeSkills.length}`);
  console.log(`  Skill instructions length: ${enhancedContext.skillInstructions.length} chars`);
  console.log();

  // 6. Show skill instructions (preview)
  if (enhancedContext.skillInstructions) {
    console.log('6. Skill Instructions (preview):');
    const preview = enhancedContext.skillInstructions.substring(0, 300);
    console.log(preview + '...\n');
  }

  // 7. Demonstrate context injection
  console.log('7. Injecting skills into context...');
  const baseContext = {
    sessionId,
    systemPrompt: 'You are a helpful AI assistant.',
    messages: [
      { role: 'user', content: userMessage }
    ]
  };

  const injectedContext = integration.injectSkills(baseContext, sessionId);
  console.log(`  Original system prompt length: ${baseContext.systemPrompt.length}`);
  console.log(`  Enhanced system prompt length: ${injectedContext.systemPrompt.length}`);
  console.log();

  // 8. Use SkillContextTransformer
  console.log('8. Using SkillContextTransformer...');
  const transformer = new SkillContextTransformer(registry, integration);
  
  // Extract skill mentions
  const mentionMessage = 'Use the @web-research skill to find information';
  const mentions = transformer.extractSkillMentions(mentionMessage);
  console.log(`  Detected mentions in "${mentionMessage}":`);
  console.log(`    ${mentions.join(', ')}`);
  console.log();

  // 9. Get activation summary
  console.log('9. Activation Summary:');
  const summary = integration.getActivationSummary(sessionId);
  console.log(`  Active skills: ${summary.count}`);
  for (const skill of summary.activeSkills) {
    console.log(`    - ${skill.name} v${skill.version}`);
  }
  console.log();

  // 10. Simulate Agent Loop hook
  console.log('10. Creating Agent Loop Hook...');
  const agentLoopHook = integration.createAgentLoopHook();
  
  const hookResult = await agentLoopHook({
    message: 'Another research question about TypeScript',
    sessionId,
    context: { systemPrompt: 'Default prompt' }
  });
  
  console.log(`  Hook executed successfully`);
  console.log(`  Enhanced context has ${Object.keys(hookResult).length} properties`);
  console.log();

  // 11. Clean up - deactivate skills
  console.log('11. Cleaning up...');
  integration.deactivateAfterMessage(sessionId);
  const remainingActive = registry.getActiveSkills(sessionId);
  console.log(`  Remaining active skills: ${remainingActive.length}`);
  console.log();

  // 12. Example: Explicit skill activation
  console.log('12. Explicit skill activation:');
  const explicitResult = await integration.processMessage(
    'Help me with development',
    sessionId,
    ['web-research'] // Explicitly request this skill
  );
  console.log(`  Explicitly activated: ${explicitResult.activatedSkills.join(', ')}`);
  console.log();

  console.log('=== Integration Example Complete ===');
}

// Example: Integration with actual Agent Loop
export async function integrateWithAgentLoop() {
  console.log('\n=== Full Agent Loop Integration Pattern ===\n');

  // Initialize components
  const registry = new SkillRegistry({
    workspaceDir: './skills'
  });
  await registry.initialize();

  const integration = new AgentLoopIntegration(registry, {
    autoActivate: true,
    autoActivateThreshold: 5
  });

  // Create transformer
  const transformer = new SkillContextTransformer(registry, integration);

  // Pseudo-code for Agent Loop integration:
  console.log(`
// In your Agent Loop initialization:

const agentLoop = new AgentLoop({
  // ... other config
});

// Hook into message processing
agentLoop.on('message.received', async (data) => {
  const { message, sessionId } = data;
  
  // 1. Check for explicit skill mentions
  const mentioned = transformer.extractSkillMentions(message);
  
  // 2. Process message (auto-activate + explicit)
  const activation = await integration.processMessage(
    message, 
    sessionId, 
    mentioned
  );
  
  console.log('Activated skills:', activation.activatedSkills);
});

// Hook into context assembly
agentLoop.on('context.assembling', async (data) => {
  const { context, sessionId } = data;
  
  // Inject skill instructions into context
  const enhanced = await transformer.transform(context, sessionId);
  
  return enhanced;
});

// Hook into response completion
agentLoop.on('response.complete', async (data) => {
  const { sessionId } = data;
  
  // Optionally deactivate skills after response
  // integration.deactivateAfterMessage(sessionId);
});
`);

  console.log('This pattern allows skills to:');
  console.log('  1. Auto-activate based on user input');
  console.log('  2. Inject instructions into context');
  console.log('  3. Guide agent behavior dynamically');
  console.log('  4. Clean up after use');
  console.log();
}

// Run examples
if (require.main === module) {
  main()
    .then(() => integrateWithAgentLoop())
    .catch(console.error);
}

export { main };
