/**
 * MessageBus Tests - Step 2: Async Handlers
 */

import { MessageBus } from '../MessageBus';

describe('MessageBus - Async Handlers', () => {
  let bus: MessageBus;

  beforeEach(() => {
    bus = new MessageBus();
  });

  describe('async emit()', () => {
    it('should wait for async handlers', async () => {
      const order: number[] = [];

      bus.on('test.event', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        order.push(1);
      });

      await bus.emit('test.event', {});
      order.push(2);

      expect(order).toEqual([1, 2]);
    });

    it('should handle multiple async handlers', async () => {
      const order: number[] = [];

      bus.on('test.event', async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        order.push(1);
      });

      bus.on('test.event', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        order.push(2);
      });

      bus.on('test.event', async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
        order.push(3);
      });

      await bus.emit('test.event', {});

      // All should have completed
      expect(order).toHaveLength(3);
      expect(order).toContain(1);
      expect(order).toContain(2);
      expect(order).toContain(3);
    });

    it('should handle mix of sync and async handlers', async () => {
      const order: number[] = [];

      bus.on('test.event', () => {
        order.push(1);
      });

      bus.on('test.event', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        order.push(2);
      });

      bus.on('test.event', () => {
        order.push(3);
      });

      await bus.emit('test.event', {});

      expect(order).toContain(1);
      expect(order).toContain(2);
      expect(order).toContain(3);
    });

    it('should resolve when all async handlers complete', async () => {
      let completed = false;

      bus.on('test.event', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        completed = true;
      });

      expect(completed).toBe(false);
      await bus.emit('test.event', {});
      expect(completed).toBe(true);
    });
  });

  describe('emitSync() with async handlers', () => {
    it('should not wait for async handlers', async () => {
      let asyncCompleted = false;

      bus.on('test.event', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        asyncCompleted = true;
      });

      bus.emitSync('test.event', {});
      expect(asyncCompleted).toBe(false);

      // Wait to verify it eventually completes
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(asyncCompleted).toBe(true);
    });
  });
});
