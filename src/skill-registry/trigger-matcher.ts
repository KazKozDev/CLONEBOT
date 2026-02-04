/**
 * Trigger Matcher
 * 
 * Matches user input to skill triggers
 * Determines which skills should be activated
 */

import type { Skill } from './types';

/**
 * Match result for a single skill
 */
export interface TriggerMatch {
  skill: Skill;
  score: number;
  matchedTriggers: string[];
  reason: string;
}

/**
 * Trigger Matcher
 * 
 * Analyzes user input and matches it to skill triggers
 */
export class TriggerMatcher {
  /**
   * Match user input against skill triggers
   * 
   * @param input - User input text
   * @param skill - Skill to check
   * @returns Match result or undefined if no match
   */
  match(input: string, skill: Skill): TriggerMatch | undefined {
    if (!skill.enabled || skill.triggers.length === 0) {
      return undefined;
    }

    const lowerInput = input.toLowerCase();
    const matchedTriggers: string[] = [];
    let totalScore = 0;

    for (const trigger of skill.triggers) {
      const lowerTrigger = trigger.toLowerCase();
      
      // Exact match
      if (lowerInput.includes(lowerTrigger)) {
        matchedTriggers.push(trigger);
        totalScore += 10;
      }
      // Partial word match
      else if (this.partialMatch(lowerInput, lowerTrigger)) {
        matchedTriggers.push(trigger);
        totalScore += 5;
      }
      // Keyword match (individual words)
      else if (this.keywordMatch(lowerInput, lowerTrigger)) {
        matchedTriggers.push(trigger);
        totalScore += 3;
      }
    }

    if (matchedTriggers.length === 0) {
      return undefined;
    }

    return {
      skill,
      score: totalScore,
      matchedTriggers,
      reason: `Matched ${matchedTriggers.length} trigger(s): ${matchedTriggers.join(', ')}`
    };
  }

  /**
   * Match input against multiple skills
   * 
   * @param input - User input
   * @param skills - Skills to check
   * @param threshold - Minimum score (default: 3)
   * @returns Array of matches, sorted by score
   */
  matchAll(input: string, skills: Skill[], threshold = 3): TriggerMatch[] {
    const matches: TriggerMatch[] = [];

    for (const skill of skills) {
      const match = this.match(input, skill);
      if (match && match.score >= threshold) {
        matches.push(match);
      }
    }

    // Sort by score (highest first)
    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Get top N matching skills
   * 
   * @param input - User input
   * @param skills - Skills to check
   * @param n - Number of top matches to return
   * @returns Top N matches
   */
  getTopMatches(input: string, skills: Skill[], n = 5): TriggerMatch[] {
    const matches = this.matchAll(input, skills);
    return matches.slice(0, n);
  }

  /**
   * Get best matching skill
   * 
   * @param input - User input
   * @param skills - Skills to check
   * @returns Best match or undefined
   */
  getBestMatch(input: string, skills: Skill[]): TriggerMatch | undefined {
    const matches = this.matchAll(input, skills);
    return matches.length > 0 ? matches[0] : undefined;
  }

  /**
   * Check if input should trigger auto-activation
   * 
   * @param input - User input
   * @param skills - Skills to check
   * @returns Skills that should auto-activate
   */
  getAutoActivateSkills(input: string, skills: Skill[]): Skill[] {
    const autoSkills = skills.filter(s => s.autoActivate && s.enabled);
    const matches = this.matchAll(input, autoSkills, 5); // Higher threshold for auto-activate
    return matches.map(m => m.skill);
  }

  /**
   * Partial word boundary match
   */
  private partialMatch(input: string, trigger: string): boolean {
    const words = trigger.split(/\s+/);
    const inputWords = input.split(/\s+/);
    
    let matchCount = 0;
    for (const word of words) {
      if (inputWords.some(iw => iw.includes(word) || word.includes(iw))) {
        matchCount++;
      }
    }
    
    return matchCount >= words.length / 2;
  }

  /**
   * Individual keyword match
   */
  private keywordMatch(input: string, trigger: string): boolean {
    const keywords = trigger.split(/\s+/).filter(w => w.length > 3);
    const inputWords = new Set(input.split(/\s+/));
    
    let matchCount = 0;
    for (const keyword of keywords) {
      if (inputWords.has(keyword)) {
        matchCount++;
      }
    }
    
    return matchCount > 0 && matchCount >= keywords.length / 3;
  }

  /**
   * Explain why a skill matched
   * 
   * @param match - Match result
   * @returns Human-readable explanation
   */
  explainMatch(match: TriggerMatch): string {
    const triggerList = match.matchedTriggers.map(t => `"${t}"`).join(', ');
    return `Skill "${match.skill.name}" matched with score ${match.score}. ` +
           `Matched triggers: ${triggerList}.`;
  }
}
