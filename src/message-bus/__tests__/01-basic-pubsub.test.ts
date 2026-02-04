/**
 * MessageBus Tests - Step 1: Basic Pub/Sub
 */

import { MessageBus } from '../MessageBus';

describe('MessageBus - Basic Pub/Sub', () => {
  let bus: MessageBus;

  beforeEach(() => {
    bus = new MessageBus();
  });

  describe('on() and emit()', () => {
    it('should subscribe and receive events', async () => {
      const handler = jest.fn();
      bus.on('test.event', handler);

      await bus.emit('test.event', { data: 'test' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should support multiple subscribers for one event', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      bus.on('test.event', handler1);
      bus.on('test.event', handler2);
      bus.on('test.event', handler3);

      await bus.emit('test.event', { data: 'test' });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('should handle events without subscribers gracefully', async () => {
      await expect(
        bus.emit('nonexistent.event', { data: 'test' })
      ).resolves.toBeUndefined();
    });

    it('should not call handlers for different events', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      bus.on('event.one', handler1);
      bus.on('event.two', handler2);

      await bus.emit('event.one', { data: 'test' });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('off()', () => {
    it('should unsubscribe handler', async () => {
      const handler = jest.fn();
      bus.on('test.event', handler);
      bus.off('test.event', handler);

      await bus.emit('test.event', { data: 'test' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should only remove specified handler', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      bus.on('test.event', handler1);
      bus.on('test.event', handler2);
      bus.off('test.event', handler1);

      await bus.emit('test.event', { data: 'test' });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should handle unsubscribing non-existent handler', () => {
      const handler = jest.fn();
      expect(() => bus.off('test.event', handler)).not.toThrow();
    });

    it('should return unsubscribe function from on()', async () => {
      const handler = jest.fn();
      const unsubscribe = bus.on('test.event', handler);

      unsubscribe();

      await bus.emit('test.event', { data: 'test' });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('emitSync()', () => {
    it('should emit events synchronously', () => {
      const handler = jest.fn();
      bus.on('test.event', handler);

      bus.emitSync('test.event', { data: 'test' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ data: 'test' });
    });
  });

  describe('listenerCount()', () => {
    it('should return correct listener count', () => {
      expect(bus.listenerCount('test.event')).toBe(0);

      bus.on('test.event', jest.fn());
      expect(bus.listenerCount('test.event')).toBe(1);

      bus.on('test.event', jest.fn());
      expect(bus.listenerCount('test.event')).toBe(2);
    });
  });

  describe('eventNames()', () => {
    it('should return all event names with listeners', () => {
      expect(bus.eventNames()).toEqual([]);

      bus.on('event.one', jest.fn());
      bus.on('event.two', jest.fn());

      const names = bus.eventNames();
      expect(names).toContain('event.one');
      expect(names).toContain('event.two');
      expect(names).toHaveLength(2);
    });
  });

  describe('removeAllListeners()', () => {
    it('should remove all listeners for specific event', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      bus.on('event.one', handler1);
      bus.on('event.two', handler2);

      bus.removeAllListeners('event.one');

      await bus.emit('event.one', {});
      await bus.emit('event.two', {});

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should remove all listeners when no event specified', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      bus.on('event.one', handler1);
      bus.on('event.two', handler2);

      bus.removeAllListeners();

      await bus.emit('event.one', {});
      await bus.emit('event.two', {});

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });
});
