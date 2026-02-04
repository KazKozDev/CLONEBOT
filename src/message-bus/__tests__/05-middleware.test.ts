/**
 * MessageBus Tests - Step 5: Middleware Pipeline
 */

import { MessageBus } from '../MessageBus';

describe('MessageBus - Middleware Pipeline', () => {
  let bus: MessageBus;

  beforeEach(() => {
    bus = new MessageBus();
  });

  describe('use()', () => {
    it('should execute middleware before handlers', async () => {
      const order: number[] = [];

      bus.use(async (event, payload, next) => {
        order.push(1);
        await next();
        order.push(4);
      });

      bus.on('test.event', () => {
        order.push(2);
      });

      bus.on('test.event', () => {
        order.push(3);
      });

      await bus.emit('test.event', {});

      expect(order).toEqual([1, 2, 3, 4]);
    });

    it('should pass event and payload to middleware', async () => {
      const middleware = jest.fn(async (event, payload, next) => {
        await next();
      });

      bus.use(middleware);
      await bus.emit('test.event', { data: 'test' });

      expect(middleware).toHaveBeenCalledWith(
        'test.event',
        { data: 'test' },
        expect.any(Function)
      );
    });

    it('should support multiple middlewares in order', async () => {
      const order: number[] = [];

      bus.use(async (event, payload, next) => {
        order.push(1);
        await next();
        order.push(6);
      });

      bus.use(async (event, payload, next) => {
        order.push(2);
        await next();
        order.push(5);
      });

      bus.use(async (event, payload, next) => {
        order.push(3);
        await next();
        order.push(4);
      });

      bus.on('test.event', () => {
        // Handler would be here
      });

      await bus.emit('test.event', {});

      expect(order).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should block event if middleware does not call next', async () => {
      const handler = jest.fn();

      bus.use(async (event, payload, next) => {
        // Do NOT call next - block the event
      });

      bus.on('test.event', handler);

      await bus.emit('test.event', {});

      expect(handler).not.toHaveBeenCalled();
    });

    it('should allow middleware to filter events conditionally', async () => {
      const handler = jest.fn();

      bus.use(async (event, payload, next) => {
        if (payload.allowed) {
          await next();
        }
        // Don't call next if not allowed
      });

      bus.on('test.event', handler);

      await bus.emit('test.event', { allowed: false });
      expect(handler).not.toHaveBeenCalled();

      await bus.emit('test.event', { allowed: true });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should allow middleware to modify payload', async () => {
      const handler = jest.fn();

      bus.use(async (event, payload, next) => {
        payload.modified = true;
        payload.timestamp = Date.now();
        await next();
      });

      bus.on('test.event', handler);

      await bus.emit('test.event', { data: 'test' });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: 'test',
          modified: true,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should allow middleware to log events', async () => {
      const logs: any[] = [];

      bus.use(async (event, payload, next) => {
        logs.push({ event, payload, time: Date.now() });
        await next();
      });

      bus.on('event.one', jest.fn());
      bus.on('event.two', jest.fn());

      await bus.emit('event.one', { data: 1 });
      await bus.emit('event.two', { data: 2 });

      expect(logs).toHaveLength(2);
      expect(logs[0]).toMatchObject({ event: 'event.one', payload: { data: 1 } });
      expect(logs[1]).toMatchObject({ event: 'event.two', payload: { data: 2 } });
    });

    it('should allow middleware to measure execution time', async () => {
      let executionTime = 0;

      bus.use(async (event, payload, next) => {
        const start = Date.now();
        await next();
        executionTime = Date.now() - start;
      });

      bus.on('test.event', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      await bus.emit('test.event', {});

      expect(executionTime).toBeGreaterThanOrEqual(50);
    });

    it('should work with sync middleware', async () => {
      const order: number[] = [];

      bus.use((event, payload, next) => {
        order.push(1);
        next();
        order.push(3);
      });

      bus.on('test.event', () => {
        order.push(2);
      });

      await bus.emit('test.event', {});

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('middleware with wildcards', () => {
    it('should execute middleware for wildcard subscriptions', async () => {
      const middlewareHandler = jest.fn(async (event, payload, next) => {
        await next();
      });

      const handler = jest.fn();

      bus.use(middlewareHandler);
      bus.on('tool.*', handler);

      await bus.emit('tool.before', { toolName: 'test', params: {}, runId: '1' });

      expect(middlewareHandler).toHaveBeenCalledWith(
        'tool.before',
        { toolName: 'test', params: {}, runId: '1' },
        expect.any(Function)
      );
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('middleware error handling', () => {
    it('should stop execution if middleware throws', async () => {
      const handler = jest.fn();

      bus.use(async (event, payload, next) => {
        throw new Error('Middleware error');
      });

      bus.on('test.event', handler);

      await bus.emit('test.event', {});

      expect(handler).not.toHaveBeenCalled();
    });

    it('should continue if middleware catches its own error', async () => {
      const handler = jest.fn();

      bus.use(async (event, payload, next) => {
        try {
          throw new Error('Middleware error');
        } catch (error) {
          // Catch and continue
        }
        await next();
      });

      bus.on('test.event', handler);

      await bus.emit('test.event', {});

      expect(handler).toHaveBeenCalled();
    });
  });
});
