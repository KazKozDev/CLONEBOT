/**
 * MessageBus Tests - Step 3: Once and Priorities
 */

import { MessageBus } from '../MessageBus';

describe('MessageBus - Once and Priorities', () => {
  let bus: MessageBus;

  beforeEach(() => {
    bus = new MessageBus();
  });

  describe('once()', () => {
    it('should trigger handler only once', async () => {
      const handler = jest.fn();
      bus.once('test.event', handler);

      await bus.emit('test.event', { count: 1 });
      await bus.emit('test.event', { count: 2 });
      await bus.emit('test.event', { count: 3 });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ count: 1 });
    });

    it('should auto-unsubscribe after first trigger', async () => {
      const handler = jest.fn();
      bus.once('test.event', handler);

      expect(bus.listenerCount('test.event')).toBe(1);
      await bus.emit('test.event', {});
      expect(bus.listenerCount('test.event')).toBe(0);
    });

    it('should support once via options', async () => {
      const handler = jest.fn();
      bus.on('test.event', handler, { once: true });

      await bus.emit('test.event', { count: 1 });
      await bus.emit('test.event', { count: 2 });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should work with async handlers', async () => {
      const handler = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      bus.once('test.event', handler);

      await bus.emit('test.event', { count: 1 });
      await bus.emit('test.event', { count: 2 });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('priorities', () => {
    it('should call handlers in priority order', async () => {
      const order: number[] = [];

      bus.on('test.event', () => { order.push(3); }, { priority: 0 });
      bus.on('test.event', () => { order.push(1); }, { priority: 100 });
      bus.on('test.event', () => { order.push(2); }, { priority: 50 });

      await bus.emit('test.event', {});

      expect(order).toEqual([1, 2, 3]);
    });

    it('should handle same priority (maintain insertion order within priority)', async () => {
      const order: number[] = [];

      bus.on('test.event', () => { order.push(1); }, { priority: 10 });
      bus.on('test.event', () => { order.push(2); }, { priority: 10 });
      bus.on('test.event', () => { order.push(3); }, { priority: 10 });

      await bus.emit('test.event', {});

      // Should maintain order of insertion for same priority
      expect(order).toEqual([1, 2, 3]);
    });

    it('should handle negative priorities', async () => {
      const order: number[] = [];

      bus.on('test.event', () => { order.push(2); }, { priority: 0 });
      bus.on('test.event', () => { order.push(1); }, { priority: 10 });
      bus.on('test.event', () => { order.push(3); }, { priority: -10 });

      await bus.emit('test.event', {});

      expect(order).toEqual([1, 2, 3]);
    });

    it('should default priority to 0', async () => {
      const order: number[] = [];

      bus.on('test.event', () => { order.push(2); }); // default priority 0
      bus.on('test.event', () => { order.push(1); }, { priority: 10 });
      bus.on('test.event', () => { order.push(3); }, { priority: -10 });

      await bus.emit('test.event', {});

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('once with priorities', () => {
    it('should combine once and priority', async () => {
      const order: number[] = [];

      bus.on('test.event', () => { order.push(2); }, { priority: 50 });
      bus.once('test.event', () => { order.push(1); }, { priority: 100 });
      bus.on('test.event', () => { order.push(3); }, { priority: 0 });

      await bus.emit('test.event', {});
      await bus.emit('test.event', {});

      // First emit: 1, 2, 3
      // Second emit: 2, 3 (1 was removed)
      expect(order).toEqual([1, 2, 3, 2, 3]);
    });
  });
});
