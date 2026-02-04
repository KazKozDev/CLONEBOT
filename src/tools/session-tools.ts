import { SessionStore } from '../session-store';
import { MessageBus } from '../message-bus';

/**
 * Creates tools for Session Management and Inter-Agent Communication
 */
export function createSessionTools(sessionStore: SessionStore, messageBus: MessageBus) {
  return [
    {
      name: 'sessions_list',
      description: 'List active sessions. Returns session IDs and metadata.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum number of sessions to return' }
        }
      },
      handler: async ({ limit = 20 }: { limit?: number }) => {
        const index = sessionStore.getIndex();
        const sessions = index.getAllSessions();
        const result = Object.values(sessions)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, limit);
        return { 
          content: `Found ${result.length} sessions.`,
          data: { sessions: result },
          success: true
        };
      }
    },
    {
      name: 'sessions_history',
      description: 'Get message history for a specific session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'ID of the session' },
          limit: { type: 'number', description: 'Number of recent messages to return (default 10)' }
        },
        required: ['sessionId']
      },
      handler: async ({ sessionId, limit = 10 }: { sessionId: string; limit?: number }) => {
        const messages = await sessionStore.getMessages(sessionId);
        // Slice last N messages
        const relevant = messages.slice(-limit);
        return { 
          content: `Retrieved ${relevant.length} messages from session ${sessionId}`,
          data: { messages: relevant },
          success: true
        };
      }
    },
    {
      name: 'sessions_send',
      description: 'Send a message to another session (Agent-to-Agent communication).',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Target session ID' },
          message: { type: 'string', description: 'Message content' }
        },
        required: ['sessionId', 'message']
      },
      handler: async ({ sessionId, message }: { sessionId: string; message: string }) => {
        // Verify session exists
        if (!sessionStore.getMetadata(sessionId)) {
          return { 
            content: `Session ${sessionId} not found`,
            error: `Session ${sessionId} not found`, 
            success: false 
          };
        }

        // Emit input event
        // Note: The event name depends on what Gateway/AgentLoop listens to.
        // Usually 'input:message' or 'agent:message'
        await messageBus.emit('input:message', { 
            sessionId, 
            content: message,
            role: 'system', // or 'user' acting as agent
            metadata: { source: 'rpc', type: 'text' } 
        });

        return { 
          content: `Message sent to session ${sessionId}`,
          data: { status: 'sent' },
          success: true 
        };
      }
    }
  ];
}
