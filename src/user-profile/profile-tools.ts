/**
 * User Profile Tools
 * Tools для работы с долгосрочной памятью пользователя
 */

import type { ToolDefinition, ToolHandler, ToolResult } from '../tool-executor/types';
import type { ToolExecutor as IToolExecutor } from '../tool-executor';
import type { UserProfileStore } from './UserProfileStore';

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Remember fact about user
 */
export const rememberFactTool: ToolDefinition = {
  name: 'user.remember',
  description: 'Remember a fact about the user for future conversations. Use this when the user shares personal information.',
  parameters: {
    type: 'object',
    properties: {
      fact: {
        type: 'string',
        description: 'The fact to remember (e.g., "Lives in Barcelona", "Works as developer", "Prefers Russian language")'
      },
      category: {
        type: 'string',
        enum: ['personal', 'preference', 'context', 'work', 'temporary', 'other', 'name', 'age', 'location'],
        description: 'Category of the fact (personal, preference, work, etc.)',
        default: 'personal'
      }
    },
    required: ['fact']
  },
  metadata: {
    category: 'user',
    permissions: ['write'],
    dangerous: false
  }
};

/**
 * Recall facts about user
 */
export const recallFactsTool: ToolDefinition = {
  name: 'user.recall',
  description: 'Recall what you know about the user from previous conversations',
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['personal', 'preference', 'context', 'work', 'temporary', 'other', 'name', 'age', 'location'],
        description: 'Filter by category (optional)'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of facts to recall',
        default: 10
      }
    },
    required: []
  },
  metadata: {
    category: 'user',
    permissions: ['read'],
    dangerous: false
  }
};

/**
 * Forget a fact
 */
export const forgetFactTool: ToolDefinition = {
  name: 'user.forget',
  description: 'Forget a previously remembered fact about the user',
  parameters: {
    type: 'object',
    properties: {
      factId: {
        type: 'string',
        description: 'ID of the fact to forget (from user.recall)'
      }
    },
    required: ['factId']
  },
  metadata: {
    category: 'user',
    permissions: ['write'],
    dangerous: false
  }
};

// ============================================================================
// Tool Handlers
// ============================================================================

export function createProfileToolHandlers(userProfileStore: UserProfileStore) {
  const rememberFactHandler: ToolHandler = async (params, context) => {
    try {
      const { fact, category } = params as { fact: string; category?: string };

      if (!context.userId) {
        return {
          content: 'Error: User ID not available in context',
          success: false
        };
      }

      const savedFact = await userProfileStore.rememberFact(
        context.userId,
        fact,
        { category: category as any }
      );

      return {
        content: `Remembered: "${fact}" (ID: ${savedFact.id})`,
        success: true
      };
    } catch (error: any) {
      return {
        content: `Error remembering fact: ${error.message}`,
        success: false
      };
    }
  };

  const recallFactsHandler: ToolHandler = async (params, context) => {
    try {
      const { category, limit } = params as { category?: string; limit?: number };

      if (!context.userId) {
        return {
          content: 'Error: User ID not available in context',
          success: false
        };
      }

      const facts = await userProfileStore.recallFacts(context.userId, {
        category: category as any,
        limit: limit || 10
      });

      if (facts.length === 0) {
        return {
          content: 'No facts found about this user.',
          success: true
        };
      }

      const factsList = facts.map(f =>
        `- [${f.id}] ${f.content} (${f.category}, confidence: ${f.confidence})`
      ).join('\n');

      return {
        content: `Facts about user:\n${factsList}`,
        success: true
      };
    } catch (error: any) {
      return {
        content: `Error recalling facts: ${error.message}`,
        success: false
      };
    }
  };

  const forgetFactHandler: ToolHandler = async (params, context) => {
    try {
      const { factId } = params as { factId: string };

      if (!context.userId) {
        return {
          content: 'Error: User ID not available in context',
          success: false
        };
      }

      const success = await userProfileStore.forgetFact(context.userId, factId);

      if (success) {
        return {
          content: `Forgot fact ${factId}`,
          success: true
        };
      } else {
        return {
          content: `Fact ${factId} not found`,
          success: false
        };
      }
    } catch (error: any) {
      return {
        content: `Error forgetting fact: ${error.message}`,
        success: false
      };
    }
  };

  return {
    [rememberFactTool.name]: rememberFactHandler,
    [recallFactsTool.name]: recallFactsHandler,
    [forgetFactTool.name]: forgetFactHandler,
  };
}

/**
 * Register profile tools
 */
export function registerProfileTools(
  toolExecutor: IToolExecutor,
  userProfileStore: UserProfileStore
): void {
  const handlers = createProfileToolHandlers(userProfileStore);

  toolExecutor.register(rememberFactTool, handlers[rememberFactTool.name]);
  toolExecutor.register(recallFactsTool, handlers[recallFactsTool.name]);
  toolExecutor.register(forgetFactTool, handlers[forgetFactTool.name]);
}
