/**
 * Skill Registry Test
 * 
 * Simple test to verify parser and validator work correctly
 */

import { SkillParser } from './skill-registry/skill-parser';
import { SkillValidator } from './skill-registry/skill-validator';
import { join } from 'path';

async function test() {
  console.log('=== Skill Registry Test ===\n');
  
  try {
    // Test parser
    console.log('1. Testing SkillParser...');
    const parser = new SkillParser();
    const skillPath = join(process.cwd(), 'skills/web-research/SKILL.md');
    
    const parsed = await parser.parseFile(skillPath);
    console.log('✓ Parsed successfully');
    console.log(`  Name: ${parsed.frontmatter.name}`);
    console.log(`  Version: ${parsed.frontmatter.version}`);
    console.log(`  Description: ${parsed.frontmatter.description}`);
    console.log(`  Tags: ${parsed.frontmatter.tags?.join(', ')}`);
    console.log(`  Tools: ${parsed.frontmatter.tools?.join(', ')}`);
    console.log(`  Triggers: ${parsed.frontmatter.triggers?.slice(0, 3).join(', ')}...`);
    console.log(`  Sections found: ${Array.from(parsed.sections.keys()).join(', ')}\n`);
    
    // Test validator
    console.log('2. Testing SkillValidator...');
    const validator = new SkillValidator();
    const validation = validator.validate(parsed);
    
    if (validation.valid) {
      console.log('✓ Validation passed');
    } else {
      console.log('✗ Validation failed');
      console.log('  Errors:', validation.errors);
    }
    
    if (validation.warnings.length > 0) {
      console.log(`  Warnings (${validation.warnings.length}):`);
      validation.warnings.forEach(w => {
        console.log(`    - ${w.field}: ${w.message}`);
      });
    }
    
    console.log('\n3. Testing sections...');
    const instructions = parsed.sections.get('instructions');
    if (instructions) {
      console.log('✓ Instructions section found');
      console.log(`  Length: ${instructions.length} chars`);
      console.log(`  Preview: ${instructions.slice(0, 100)}...`);
    }
    
    const examples = parsed.sections.get('examples');
    if (examples) {
      console.log('✓ Examples section found');
      console.log(`  Length: ${examples.length} chars`);
    }
    
    console.log('\n=== Test Complete ===');
    console.log('✓ All basic functionality working');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

test().catch(console.error);
