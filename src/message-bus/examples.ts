/**
 * Message Bus - Usage Examples
 * 
 * This file contains practical examples of using the Message Bus
 */

import { MessageBus } from './MessageBus';
import type { EventPayloadMap } from './types';

// ============================================================================
// Example 1: Basic Pub/Sub
// ============================================================================

export function example1_BasicPubSub() {
  console.log('\n=== Example 1: Basic Pub/Sub ===\n');

  const bus = new MessageBus();

  // Subscribe to an event
  bus.on('user.login', (payload) => {
    console.log('User logged in:', payload);
  });

  // Emit the event
  bus.emit('user.login', { userId: '123', timestamp: Date.now() });
}

// ============================================================================
// Example 2: Type-Safe Events
// ============================================================================

// Extend the EventPayloadMap for type safety
declare module './types' {
  interface EventPayloadMap {
    'session.created': { sessionId: string; sessionKey: string };
    'session.message': { sessionId: string; message: string };
    'tool.before': { toolName: string; params: unknown; runId: string };
  }
}

export function example2_TypeSafeEvents() {
  console.log('\n=== Example 2: Type-Safe Events ===\n');

  const bus = new MessageBus<EventPayloadMap>();

  // TypeScript will enforce correct payload types
  bus.on('session.created', (payload) => {
    // payload is typed as { sessionId: string; sessionKey: string }
    console.log('Session created:', payload.sessionId);
  });

  // TypeScript will error if payload is wrong
  bus.emit('session.created', {
    sessionId: 'abc-123',
    sessionKey: 'key-456',
  });
}

// ============================================================================
// Example 3: Wildcard Subscriptions
// ============================================================================

export function example3_WildcardSubscriptions() {
  console.log('\n=== Example 3: Wildcard Subscriptions ===\n');

  const bus = new MessageBus();

  // Subscribe to all tool events
  bus.on('tool.*', (payload) => {
    console.log('Tool event:', payload);
  });

  // Subscribe to all events
  bus.on('*', (payload) => {
    console.log('Any event:', payload);
  });

  // These will trigger both handlers
  bus.emit('tool.before', { toolName: 'searchFiles', params: {}, runId: '1' });
  bus.emit('tool.after', { toolName: 'searchFiles', result: [], runId: '1' });
  
  // This will only trigger the '*' handler
  bus.emit('session.created', { sessionId: '123', sessionKey: 'key-123' });
}

// ============================================================================
// Example 4: Priorities
// ============================================================================

export function example4_Priorities() {
  console.log('\n=== Example 4: Priorities ===\n');

  const bus = new MessageBus();

  bus.on('api.request', () => {
    console.log('3. Process request');
  }, { priority: 0 });

  bus.on('api.request', () => {
    console.log('1. Validate request');
  }, { priority: 100 });

  bus.on('api.request', () => {
    console.log('2. Log request');
  }, { priority: 50 });

  bus.emit('api.request', { path: '/api/users' });
  // Output order: 1, 2, 3
}

// ============================================================================
// Example 5: Middleware
// ============================================================================

export function example5_Middleware() {
  console.log('\n=== Example 5: Middleware ===\n');

  const bus = new MessageBus();

  // Logging middleware
  bus.use(async (event, payload, next) => {
    console.log(`[BEFORE] ${event}`, payload);
    await next();
    console.log(`[AFTER] ${event}`);
  });

  // Add metadata middleware
  bus.use(async (event, payload, next) => {
    payload._timestamp = Date.now();
    payload._eventId = Math.random().toString(36);
    await next();
  });

  bus.on('user.action', (payload) => {
    console.log('Handler received:', payload);
  });

  bus.emit('user.action', { action: 'click', target: 'button' });
}

// ============================================================================
// Example 6: Error Handling
// ============================================================================

export function example6_ErrorHandling() {
  console.log('\n=== Example 6: Error Handling ===\n');

  const bus = new MessageBus();

  // Set up global error handler
  bus.onError((error, event, payload) => {
    console.error(`Error in event "${event}":`, error.message);
    console.error('Payload:', payload);
  });

  bus.on('risky.operation', () => {
    throw new Error('Something went wrong!');
  });

  bus.on('risky.operation', () => {
    console.log('This handler still runs despite the error above');
  });

  bus.emit('risky.operation', { data: 'test' });
}

// ============================================================================
// Example 7: Once Handlers
// ============================================================================

export function example7_OnceHandlers() {
  console.log('\n=== Example 7: Once Handlers ===\n');

  const bus = new MessageBus();

  // This handler will only run once
  bus.once('app.initialized', () => {
    console.log('App initialized! This will only print once.');
  });

  bus.emit('app.initialized', {});
  bus.emit('app.initialized', {}); // Handler won't be called
  bus.emit('app.initialized', {}); // Handler won't be called
}

// ============================================================================
// Example 8: Real-world - Session Management System
// ============================================================================

class SessionManager {
  private sessions = new Map<string, any>();

  constructor(private bus: MessageBus) {
    this.bus.on('session.create', this.handleCreate);
    this.bus.on('session.destroy', this.handleDestroy);
    this.bus.on('session.message', this.handleMessage);
  }

  private handleCreate = async (payload: any) => {
    const { sessionId, userId } = payload;
    this.sessions.set(sessionId, { userId, created: Date.now() });
    console.log(`Session ${sessionId} created for user ${userId}`);
    await this.bus.emit('session.created', payload);
  };

  private handleDestroy = (payload: any) => {
    const { sessionId } = payload;
    this.sessions.delete(sessionId);
    console.log(`Session ${sessionId} destroyed`);
  };

  private handleMessage = (payload: any) => {
    const { sessionId, message } = payload;
    console.log(`Message in session ${sessionId}:`, message);
  };
}

class Logger {
  constructor(private bus: MessageBus) {
    // Log all session events
    this.bus.on('session.*', this.logEvent, { priority: 100 });
  }

  private logEvent = (payload: any) => {
    console.log('[SESSION LOG]', new Date().toISOString(), payload);
  };
}

class Analytics {
  constructor(private bus: MessageBus) {
    // Track all events
    this.bus.on('*', this.trackEvent);
  }

  private trackEvent = (payload: any) => {
    console.log('[ANALYTICS]', payload);
  };
}

export function example8_SessionManagement() {
  console.log('\n=== Example 8: Session Management System ===\n');

  const bus = new MessageBus();

  // Initialize modules
  const sessionManager = new SessionManager(bus);
  const logger = new Logger(bus);
  const analytics = new Analytics(bus);

  // Simulate session lifecycle
  (async () => {
    await bus.emit('session.create', { sessionId: 'sess-1', userId: 'user-123' });
    await bus.emit('session.message', { sessionId: 'sess-1', message: 'Hello!' });
    await bus.emit('session.destroy', { sessionId: 'sess-1' });
  })();
}

// ============================================================================
// Example 9: Tool Execution Pipeline
// ============================================================================

class ToolExecutor {
  constructor(private bus: MessageBus) {
    // Security middleware
    this.bus.use(async (event, payload, next) => {
      if (event.startsWith('tool.')) {
        if (!this.isAuthorized(payload)) {
          console.error('Unauthorized tool execution blocked');
          return; // Don't call next - block the event
        }
      }
      await next();
    });

    // Performance tracking middleware
    this.bus.use(async (event, payload, next) => {
      if (event.startsWith('tool.')) {
        const start = Date.now();
        await next();
        const duration = Date.now() - start;
        console.log(`Tool execution time: ${duration}ms`);
      } else {
        await next();
      }
    });
  }

  async executeTool(toolName: string, params: any) {
    const runId = this.generateRunId();

    try {
      await this.bus.emit('tool.before', { toolName, params, runId });
      
      // Simulate tool execution
      const result = await this.runTool(toolName, params);
      
      await this.bus.emit('tool.after', { toolName, result, runId });
      
      return result;
    } catch (error) {
      await this.bus.emit('tool.error', { toolName, error, runId });
      throw error;
    }
  }

  private async runTool(name: string, params: any): Promise<any> {
    // Simulate tool execution
    await new Promise(resolve => setTimeout(resolve, 100));
    return { success: true, data: 'result' };
  }

  private isAuthorized(payload: any): boolean {
    // Simple authorization check
    return true; // In real app, check user permissions
  }

  private generateRunId(): string {
    return 'run-' + Math.random().toString(36).substr(2, 9);
  }
}

export function example9_ToolExecution() {
  console.log('\n=== Example 9: Tool Execution Pipeline ===\n');

  const bus = new MessageBus();
  const executor = new ToolExecutor(bus);

  // Monitor tool events
  bus.on('tool.before', (payload) => {
    console.log('Tool starting:', payload.toolName);
  });

  bus.on('tool.after', (payload) => {
    console.log('Tool completed:', payload.toolName, payload.result);
  });

  bus.on('tool.error', (payload) => {
    console.error('Tool failed:', payload.toolName, payload.error);
  });

  // Execute a tool
  executor.executeTool('searchFiles', { pattern: '*.ts' });
}

// ============================================================================
// Example 10: Unsubscribe Patterns
// ============================================================================

export function example10_UnsubscribePatterns() {
  console.log('\n=== Example 10: Unsubscribe Patterns ===\n');

  const bus = new MessageBus();

  // Pattern 1: Using returned unsubscribe function
  const unsubscribe = bus.on('event1', () => {
    console.log('Event 1');
  });
  
  unsubscribe(); // Unsubscribe

  // Pattern 2: Using off()
  const handler = () => console.log('Event 2');
  bus.on('event2', handler);
  bus.off('event2', handler);

  // Pattern 3: Managing multiple subscriptions
  class MyModule {
    private unsubscribers: (() => void)[] = [];

    constructor(private bus: MessageBus) {
      this.unsubscribers.push(
        bus.on('event.a', this.handlerA)
      );
      this.unsubscribers.push(
        bus.on('event.b', this.handlerB)
      );
    }

    destroy() {
      this.unsubscribers.forEach(unsub => unsub());
      console.log('Module cleaned up');
    }

    private handlerA = () => console.log('A');
    private handlerB = () => console.log('B');
  }

  const module = new MyModule(bus);
  module.destroy(); // Clean up all subscriptions
}

// ============================================================================
// Run all examples
// ============================================================================

if (require.main === module) {
  example1_BasicPubSub();
  example2_TypeSafeEvents();
  example3_WildcardSubscriptions();
  example4_Priorities();
  example5_Middleware();
  example6_ErrorHandling();
  example7_OnceHandlers();
  example8_SessionManagement();
  example9_ToolExecution();
  example10_UnsubscribePatterns();
}
