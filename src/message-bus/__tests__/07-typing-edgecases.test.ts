/**
 * MessageBus Tests - Step 7: TypeScript Typing & Edge Cases
 */

import { MessageBus } from '../MessageBus';
import type { EventPayloadMap } from '../types';

// Extend EventPayloadMap for type-safe testing
declare module '../types' {
  interface EventPayloadMap {
    'session.created': { sessionId: string; sessionKey: string };
    'session.message': { sessionId: string; message: string };
    'tool.before': { toolName: string; params: unknown; runId: string };
    'tool.after': { toolName: string; result: unknown; runId: string };
    'model.delta': { runId: string; delta: string };
  }
}

describe('MessageBus - TypeScript Typing', () => {
  let bus: MessageBus<EventPayloadMap>;

  beforeEach(() => {
    bus = new MessageBus<EventPayloadMap>();
  });

  describe('type-safe events', () => {
    it('should provide typed payload in handlers', async () => {
      bus.on('session.created', (payload) => {
        // TypeScript should infer payload type
        expect(payload.sessionId).toBeDefined();
        expect(payload.sessionKey).toBeDefined();
        expect(typeof payload.sessionId).toBe('string');
      });

      await bus.emit('session.created', {
        sessionId: 'test-123',
        sessionKey: 'key-456',
      });
    });

    it('should work with different event types', async () => {
      const toolHandler = jest.fn();
      const modelHandler = jest.fn();

      bus.on('tool.before', toolHandler);
      bus.on('model.delta', modelHandler);

      await bus.emit('tool.before', {
        toolName: 'testTool',
        params: { arg: 1 },
        runId: 'run-123',
      });

      await bus.emit('model.delta', {
        runId: 'run-456',
        delta: 'delta text',
      });

      expect(toolHandler).toHaveBeenCalledWith({
        toolName: 'testTool',
        params: { arg: 1 },
        runId: 'run-123',
      });

      expect(modelHandler).toHaveBeenCalledWith({
        runId: 'run-456',
        delta: 'delta text',
      });
    });
  });
});

describe('MessageBus - Edge Cases', () => {
  let bus: MessageBus;

  beforeEach(() => {
    bus = new MessageBus();
  });

  describe('emit without subscribers', () => {
    it('should not throw when emitting without subscribers', async () => {
      await expect(
        bus.emit('nonexistent.event', { data: 'test' })
      ).resolves.toBeUndefined();
    });

    it('should handle emitSync without subscribers', () => {
      expect(() => {
        bus.emitSync('nonexistent.event', { data: 'test' });
      }).not.toThrow();
    });
  });

  describe('subscribe during emit', () => {
    it('should not call new subscriber added during emit', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      bus.on('test.event', () => {
        // Subscribe during emit
        bus.on('test.event', handler2);
      });
      bus.on('test.event', handler1);

      await bus.emit('test.event', {});

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).not.toHaveBeenCalled(); // Should not be called in this emit

      // But should be called in next emit
      await bus.emit('test.event', {});
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsubscribe during emit', () => {
    it('should handle unsubscribe during emit', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      bus.on('test.event', handler1);
      bus.on('test.event', () => {
        // Unsubscribe handler3 during emit
        bus.off('test.event', handler3);
      });
      bus.on('test.event', handler3);

      await bus.emit('test.event', {});

      // handler3 might or might not be called depending on execution order
      // The important thing is it shouldn't crash
      expect(handler1).toHaveBeenCalled();
    });
  });

  describe('recursive emit', () => {
    it('should handle recursive emit', async () => {
      let count = 0;

      bus.on('test.event', async (payload) => {
        count++;
        if (count < 3) {
          await bus.emit('test.event', { count });
        }
      });

      await bus.emit('test.event', { count: 0 });

      expect(count).toBe(3);
    });

    it('should handle cross-event recursion', async () => {
      const order: string[] = [];

      bus.on('event.a', async () => {
        order.push('a');
        if (order.length < 4) {
          await bus.emit('event.b', {});
        }
      });

      bus.on('event.b', async () => {
        order.push('b');
        if (order.length < 4) {
          await bus.emit('event.a', {});
        }
      });

      await bus.emit('event.a', {});

      expect(order).toEqual(['a', 'b', 'a', 'b']);
    });
  });

  describe('many subscribers', () => {
    it('should handle many subscribers efficiently', async () => {
      const handlers: jest.Mock[] = [];

      // Add 1000 subscribers
      for (let i = 0; i < 1000; i++) {
        const handler = jest.fn();
        handlers.push(handler);
        bus.on('test.event', handler);
      }

      await bus.emit('test.event', { data: 'test' });

      // All should be called
      handlers.forEach(handler => {
        expect(handler).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('long event names', () => {
    it('should handle very long event names', async () => {
      const longEventName = 'a'.repeat(1000);
      const handler = jest.fn();

      bus.on(longEventName, handler);
      await bus.emit(longEventName, {});

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('empty event name', () => {
    it('should handle empty event name', async () => {
      const handler = jest.fn();

      bus.on('', handler);
      await bus.emit('', { data: 'test' });

      expect(handler).toHaveBeenCalledWith({ data: 'test' });
    });
  });

  describe('special characters in event names', () => {
    it('should handle special characters', async () => {
      const handler = jest.fn();

      bus.on('event:with:colons', handler);
      await bus.emit('event:with:colons', {});

      expect(handler).toHaveBeenCalled();
    });

    it('should handle dashes and underscores', async () => {
      const handler = jest.fn();

      bus.on('event-with_special-chars', handler);
      await bus.emit('event-with_special-chars', {});

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('multiple bus instances', () => {
    it('should maintain separate instances', async () => {
      const bus1 = new MessageBus();
      const bus2 = new MessageBus();

      const handler1 = jest.fn();
      const handler2 = jest.fn();

      bus1.on('test.event', handler1);
      bus2.on('test.event', handler2);

      await bus1.emit('test.event', {});

      expect(handler1).toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('complex payloads', () => {
    it('should handle complex nested objects', async () => {
      const handler = jest.fn();
      const complexPayload = {
        nested: {
          deep: {
            value: 123,
            array: [1, 2, 3],
          },
        },
        fn: () => 'test',
        date: new Date(),
      };

      bus.on('test.event', handler);
      await bus.emit('test.event', complexPayload);

      expect(handler).toHaveBeenCalledWith(complexPayload);
    });

    it('should handle null and undefined payloads', async () => {
      const handler = jest.fn();

      bus.on('test.event', handler);
      
      await bus.emit('test.event', null);
      expect(handler).toHaveBeenCalledWith(null);

      await bus.emit('test.event', undefined);
      expect(handler).toHaveBeenCalledWith(undefined);
    });
  });
});
