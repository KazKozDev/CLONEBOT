/**
 * MessageBus Tests - Step 4: Wildcard Subscriptions
 */

import { MessageBus } from '../MessageBus';

describe('MessageBus - Wildcard Subscriptions', () => {
  let bus: MessageBus;

  beforeEach(() => {
    bus = new MessageBus();
  });

  describe('wildcard "*"', () => {
    it('should match all events', async () => {
      const handler = jest.fn();
      bus.on('*', handler);

      await bus.emit('event.one', { data: 1 });
      await bus.emit('event.two', { data: 2 });
      await bus.emit('another.event', { data: 3 });

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('should work alongside exact matches', async () => {
      const wildcardHandler = jest.fn();
      const exactHandler = jest.fn();

      bus.on('*', wildcardHandler);
      bus.on('event.one', exactHandler);

      await bus.emit('event.one', { data: 1 });

      expect(wildcardHandler).toHaveBeenCalledTimes(1);
      expect(exactHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('pattern "prefix.*"', () => {
    it('should match events with prefix', async () => {
      const handler = jest.fn();
      bus.on('tool.*', handler);

      await bus.emit('tool.before', { toolName: 'test', params: {}, runId: '1' });
      await bus.emit('tool.after', { toolName: 'test', result: {}, runId: '1' });
      await bus.emit('tool.error', { toolName: 'test', error: new Error(), runId: '1' });

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('should not match nested events (one level only)', async () => {
      const handler = jest.fn();
      bus.on('tool.*', handler);

      await bus.emit('tool.before', { toolName: 'test', params: {}, runId: '1' });
      await bus.emit('tool.exec.start', {}); // Should NOT match

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ toolName: 'test', params: {}, runId: '1' });
    });

    it('should not match different prefixes', async () => {
      const handler = jest.fn();
      bus.on('tool.*', handler);

      await bus.emit('session.created', { sessionId: '1', sessionKey: '1' });
      await bus.emit('model.delta', { runId: '1', delta: 'test' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should not match prefix without suffix', async () => {
      const handler = jest.fn();
      bus.on('tool.*', handler);

      await bus.emit('tool', {}); // Should NOT match

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('multiple wildcards', () => {
    it('should support multiple wildcard patterns', async () => {
      const toolHandler = jest.fn();
      const sessionHandler = jest.fn();

      bus.on('tool.*', toolHandler);
      bus.on('session.*', sessionHandler);

      await bus.emit('tool.before', { toolName: 'test', params: {}, runId: '1' });
      await bus.emit('session.created', { sessionId: '1', sessionKey: '1' });
      await bus.emit('tool.after', {});

      expect(toolHandler).toHaveBeenCalledTimes(2);
      expect(sessionHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('combination of exact and wildcard', () => {
    it('should trigger both exact and wildcard handlers', async () => {
      const exactHandler = jest.fn();
      const wildcardHandler = jest.fn();
      const allHandler = jest.fn();

      bus.on('tool.before', exactHandler);
      bus.on('tool.*', wildcardHandler);
      bus.on('*', allHandler);

      await bus.emit('tool.before', { toolName: 'test', params: {}, runId: '1' });

      expect(exactHandler).toHaveBeenCalledTimes(1);
      expect(wildcardHandler).toHaveBeenCalledTimes(1);
      expect(allHandler).toHaveBeenCalledTimes(1);

      // All should receive same payload
      const expectedPayload = { toolName: 'test', params: {}, runId: '1' };
      expect(exactHandler).toHaveBeenCalledWith(expectedPayload);
      expect(wildcardHandler).toHaveBeenCalledWith(expectedPayload);
      expect(allHandler).toHaveBeenCalledWith(expectedPayload);
    });
  });

  describe('wildcard priorities', () => {
    it('should respect priorities with wildcards', async () => {
      const order: number[] = [];

      bus.on('tool.*', () => { order.push(2); }, { priority: 50 });
      bus.on('tool.before', () => { order.push(1); }, { priority: 100 });
      bus.on('*', () => { order.push(3); }, { priority: 0 });

      await bus.emit('tool.before', { toolName: 'test', params: {}, runId: '1' });

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('wildcard unsubscribe', () => {
    it('should unsubscribe from wildcard patterns', async () => {
      const handler = jest.fn();
      bus.on('tool.*', handler);

      await bus.emit('tool.before', { toolName: 'test', params: {}, runId: '1' });
      expect(handler).toHaveBeenCalledTimes(1);

      bus.off('tool.*', handler);

      await bus.emit('tool.after', { toolName: 'test', result: {}, runId: '1' });
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should handle unsubscribe function for wildcards', async () => {
      const handler = jest.fn();
      const unsubscribe = bus.on('tool.*', handler);

      await bus.emit('tool.before', { toolName: 'test', params: {}, runId: '1' });
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      await bus.emit('tool.after', { toolName: 'test', result: {}, runId: '1' });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('wildcard listener count', () => {
    it('should count wildcard listeners', () => {
      bus.on('tool.*', jest.fn());
      bus.on('tool.*', jest.fn());

      expect(bus.listenerCount('tool.*')).toBe(2);
    });
  });

  describe('wildcard in eventNames', () => {
    it('should include wildcard patterns in eventNames', () => {
      bus.on('tool.*', jest.fn());
      bus.on('session.*', jest.fn());
      bus.on('event.one', jest.fn());

      const names = bus.eventNames();
      expect(names).toContain('tool.*');
      expect(names).toContain('session.*');
      expect(names).toContain('event.one');
    });
  });

  describe('removeAllListeners with wildcards', () => {
    it('should remove wildcard listeners', async () => {
      const handler = jest.fn();
      bus.on('tool.*', handler);

      bus.removeAllListeners('tool.*');

      await bus.emit('tool.before', { toolName: 'test', params: {}, runId: '1' });
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
