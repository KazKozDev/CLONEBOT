/**
 * Query Engine - Step 16
 * 
 * Advanced querying and ranking for skills
 */

import type { Skill, SkillInfo } from './types.js';

export interface QueryOptions {
  /**
   * Filter by tags (AND logic)
   */
  tags?: string[];

  /**
   * Filter by category
   */
  category?: string;

  /**
   * Filter by author
   */
  author?: string;

  /**
   * Filter by version (semver range)
   */
  version?: string;

  /**
   * Filter by priority range
   */
  minPriority?: number;
  maxPriority?: number;

  /**
   * Filter by source
   */
  source?: 'local' | 'clawhub' | 'git';

  /**
   * Text search in name, description, instructions
   */
  search?: string;

  /**
   * Whether to include inactive skills
   * @default true
   */
  includeInactive?: boolean;

  /**
   * Limit number of results
   */
  limit?: number;

  /**
   * Offset for pagination
   */
  offset?: number;

  /**
   * Sort field
   * @default 'priority'
   */
  sortBy?: 'name' | 'priority' | 'version' | 'category' | 'modifiedAt' | 'relevance';

  /**
   * Sort order
   * @default 'desc'
   */
  sortOrder?: 'asc' | 'desc';
}

export interface QueryResult {
  skills: Skill[];
  total: number;
  filtered: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface RankingWeights {
  nameMatch: number;
  descriptionMatch: number;
  tagMatch: number;
  categoryMatch: number;
  priorityBoost: number;
  recencyBoost: number;
}

export interface ScoredSkill {
  skill: Skill;
  score: number;
  breakdown: {
    nameMatch: number;
    descriptionMatch: number;
    tagMatch: number;
    categoryMatch: number;
    priorityBoost: number;
    recencyBoost: number;
  };
}

/**
 * Advanced query engine for skills
 */
export class QueryEngine {
  private defaultWeights: RankingWeights = {
    nameMatch: 10.0,
    descriptionMatch: 5.0,
    tagMatch: 3.0,
    categoryMatch: 2.0,
    priorityBoost: 0.01,
    recencyBoost: 0.001
  };

  /**
   * Query skills with advanced filtering and ranking
   */
  query(skills: Skill[], options: QueryOptions = {}): QueryResult {
    let filtered = [...skills];

    // Apply filters
    filtered = this.applyFilters(filtered, options);

    // Apply text search and ranking
    let scored: ScoredSkill[] = [];
    if (options.search) {
      scored = this.rankByRelevance(filtered, options.search);
      filtered = scored.map(s => s.skill);
    } else {
      // Sort without search
      filtered = this.sort(filtered, options.sortBy || 'priority', options.sortOrder || 'desc');
    }

    // Pagination
    const total = skills.length;
    const filteredCount = filtered.length;
    const offset = options.offset || 0;
    const limit = options.limit || filteredCount;
    
    const paginated = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < filteredCount;

    return {
      skills: paginated,
      total,
      filtered: filteredCount,
      offset,
      limit,
      hasMore
    };
  }

  /**
   * Apply filters to skills
   */
  private applyFilters(skills: Skill[], options: QueryOptions): Skill[] {
    return skills.filter(skill => {
      // Tags filter (AND logic - all tags must match)
      if (options.tags && options.tags.length > 0) {
        const hasAllTags = options.tags.every(tag => 
          skill.tags.some(t => t.toLowerCase() === tag.toLowerCase())
        );
        if (!hasAllTags) return false;
      }

      // Category filter
      if (options.category) {
        if (!skill.category || skill.category.toLowerCase() !== options.category.toLowerCase()) {
          return false;
        }
      }

      // Author filter
      if (options.author) {
        if (!skill.author || skill.author.toLowerCase() !== options.author.toLowerCase()) {
          return false;
        }
      }

      // Priority range filter
      if (options.minPriority !== undefined) {
        if (skill.priority < options.minPriority) return false;
      }
      if (options.maxPriority !== undefined) {
        if (skill.priority > options.maxPriority) return false;
      }

      // Source filter
      if (options.source) {
        if (skill.source !== options.source) return false;
      }

      // Version filter (exact match for now, could add semver range)
      if (options.version) {
        if (skill.version !== options.version) return false;
      }

      return true;
    });
  }

  /**
   * Rank skills by relevance to search query
   */
  rankByRelevance(
    skills: Skill[],
    query: string,
    weights?: Partial<RankingWeights>
  ): ScoredSkill[] {
    const finalWeights = { ...this.defaultWeights, ...weights };
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 0);

    const scored = skills.map(skill => {
      const breakdown = {
        nameMatch: this.scoreTextMatch(skill.name.toLowerCase(), queryTerms) * finalWeights.nameMatch,
        descriptionMatch: this.scoreTextMatch(skill.description.toLowerCase(), queryTerms) * finalWeights.descriptionMatch,
        tagMatch: this.scoreArrayMatch(skill.tags, queryTerms) * finalWeights.tagMatch,
        categoryMatch: this.scoreTextMatch((skill.category || '').toLowerCase(), queryTerms) * finalWeights.categoryMatch,
        priorityBoost: skill.priority * finalWeights.priorityBoost,
        recencyBoost: this.scoreRecency(skill.modifiedAt || skill.loadedAt) * finalWeights.recencyBoost
      };

      const score = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

      return { skill, score, breakdown };
    });

    // Sort by score descending
    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * Score text match against query terms
   */
  private scoreTextMatch(text: string, queryTerms: string[]): number {
    let score = 0;

    for (const term of queryTerms) {
      // Exact match
      if (text === term) {
        score += 10;
      }
      // Starts with term
      else if (text.startsWith(term)) {
        score += 5;
      }
      // Contains term
      else if (text.includes(term)) {
        score += 2;
      }
      // Fuzzy match (simple - checks if characters appear in order)
      else if (this.fuzzyMatch(text, term)) {
        score += 1;
      }
    }

    return score;
  }

  /**
   * Score array match (e.g., tags)
   */
  private scoreArrayMatch(items: string[], queryTerms: string[]): number {
    let score = 0;

    for (const item of items) {
      const itemLower = item.toLowerCase();
      for (const term of queryTerms) {
        if (itemLower === term) {
          score += 5;
        } else if (itemLower.includes(term)) {
          score += 2;
        }
      }
    }

    return score;
  }

  /**
   * Score recency (newer skills get higher score)
   */
  private scoreRecency(date: Date): number {
    const now = Date.now();
    const skillTime = date.getTime();
    const ageInDays = (now - skillTime) / (1000 * 60 * 60 * 24);
    
    // Exponential decay: newer = higher score
    return Math.exp(-ageInDays / 30); // 30-day half-life
  }

  /**
   * Simple fuzzy matching
   */
  private fuzzyMatch(text: string, pattern: string): boolean {
    let patternIdx = 0;
    
    for (let i = 0; i < text.length && patternIdx < pattern.length; i++) {
      if (text[i] === pattern[patternIdx]) {
        patternIdx++;
      }
    }
    
    return patternIdx === pattern.length;
  }

  /**
   * Sort skills by field
   */
  private sort(
    skills: Skill[],
    sortBy: NonNullable<QueryOptions['sortBy']>,
    sortOrder: 'asc' | 'desc'
  ): Skill[] {
    const sorted = [...skills];

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'priority':
          comparison = a.priority - b.priority;
          break;
        case 'category':
          comparison = (a.category || '').localeCompare(b.category || '');
          break;
        case 'version':
          comparison = this.compareVersions(a.version, b.version);
          break;
        case 'modifiedAt':
          const aTime = (a.modifiedAt || a.loadedAt).getTime();
          const bTime = (b.modifiedAt || b.loadedAt).getTime();
          comparison = aTime - bTime;
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }

  /**
   * Compare semantic versions
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 !== p2) {
        return p1 - p2;
      }
    }

    return 0;
  }

  /**
   * Find skills by tag
   */
  findByTag(skills: Skill[], tag: string): Skill[] {
    const tagLower = tag.toLowerCase();
    return skills.filter(skill =>
      skill.tags.some(t => t.toLowerCase() === tagLower)
    );
  }

  /**
   * Find skills by category
   */
  findByCategory(skills: Skill[], category: string): Skill[] {
    const categoryLower = category.toLowerCase();
    return skills.filter(skill =>
      skill.category && skill.category.toLowerCase() === categoryLower
    );
  }

  /**
   * Find skills by author
   */
  findByAuthor(skills: Skill[], author: string): Skill[] {
    const authorLower = author.toLowerCase();
    return skills.filter(skill =>
      skill.author && skill.author.toLowerCase() === authorLower
    );
  }

  /**
   * Find similar skills based on tags and category
   */
  findSimilar(skill: Skill, allSkills: Skill[], limit = 5): Skill[] {
    const scored = allSkills
      .filter(s => s.name !== skill.name)
      .map(s => {
        let score = 0;

        // Same category
        if (s.category && skill.category && s.category === skill.category) {
          score += 10;
        }

        // Shared tags
        const sharedTags = s.tags.filter(t =>
          skill.tags.some(st => st.toLowerCase() === t.toLowerCase())
        );
        score += sharedTags.length * 5;

        // Same author
        if (s.author && skill.author && s.author === skill.author) {
          score += 3;
        }

        return { skill: s, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map(s => s.skill);
  }

  /**
   * Group skills by field
   */
  groupBy<K extends keyof Skill>(
    skills: Skill[],
    field: K
  ): Map<Skill[K], Skill[]> {
    const groups = new Map<Skill[K], Skill[]>();

    for (const skill of skills) {
      const key = skill[field];
      const existing = groups.get(key) || [];
      existing.push(skill);
      groups.set(key, existing);
    }

    return groups;
  }

  /**
   * Get facets for filtering
   */
  getFacets(skills: Skill[]): {
    categories: Map<string, number>;
    tags: Map<string, number>;
    authors: Map<string, number>;
    sources: Map<string, number>;
  } {
    const categories = new Map<string, number>();
    const tags = new Map<string, number>();
    const authors = new Map<string, number>();
    const sources = new Map<string, number>();

    for (const skill of skills) {
      // Count categories
      if (skill.category) {
        categories.set(skill.category, (categories.get(skill.category) || 0) + 1);
      }

      // Count tags
      for (const tag of skill.tags) {
        tags.set(tag, (tags.get(tag) || 0) + 1);
      }

      // Count authors
      if (skill.author) {
        authors.set(skill.author, (authors.get(skill.author) || 0) + 1);
      }

      // Count sources
      sources.set(skill.source, (sources.get(skill.source) || 0) + 1);
    }

    return { categories, tags, authors, sources };
  }

  /**
   * Build a full-text search index
   */
  buildSearchIndex(skills: Skill[]): Map<string, Set<string>> {
    const index = new Map<string, Set<string>>();

    for (const skill of skills) {
      const terms = new Set<string>();

      // Index name
      this.tokenize(skill.name).forEach(term => terms.add(term));

      // Index description
      this.tokenize(skill.description).forEach(term => terms.add(term));

      // Index tags
      skill.tags.forEach(tag => {
        this.tokenize(tag).forEach(term => terms.add(term));
      });

      // Index category
      if (skill.category) {
        this.tokenize(skill.category).forEach(term => terms.add(term));
      }

      // Index instructions (first 500 chars)
      const instructionSample = skill.instructions.substring(0, 500);
      this.tokenize(instructionSample).forEach(term => terms.add(term));

      // Store terms -> skill name mapping
      for (const term of terms) {
        const skillNames = index.get(term) || new Set<string>();
        skillNames.add(skill.name);
        index.set(term, skillNames);
      }
    }

    return index;
  }

  /**
   * Tokenize text into search terms
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2);
  }

  /**
   * Search using pre-built index
   */
  searchIndex(
    index: Map<string, Set<string>>,
    query: string,
    allSkills: Skill[]
  ): string[] {
    const queryTerms = this.tokenize(query);
    const skillScores = new Map<string, number>();

    for (const term of queryTerms) {
      const matchingSkills = index.get(term) || new Set<string>();
      
      for (const skillName of matchingSkills) {
        skillScores.set(skillName, (skillScores.get(skillName) || 0) + 1);
      }
    }

    // Sort by score
    const sorted = Array.from(skillScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    return sorted;
  }
}
