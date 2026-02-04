/**
 * MessageBus Tests - Step 6: Error Handling
 */

import { MessageBus } from '../MessageBus';

describe('MessageBus - Error Handling', () => {
  let bus: MessageBus;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    bus = new MessageBus();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('handler errors', () => {
    it('should not break other handlers when one throws', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn(() => {
        throw new Error('Handler 2 error');
      });
      const handler3 = jest.fn();

      bus.on('test.event', handler1);
      bus.on('test.event', handler2);
      bus.on('test.event', handler3);

      await bus.emit('test.event', {});

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
    });

    it('should not break other handlers when async handler throws', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn(async () => {
        throw new Error('Async handler error');
      });
      const handler3 = jest.fn();

      bus.on('test.event', handler1);
      bus.on('test.event', handler2);
      bus.on('test.event', handler3);

      await bus.emit('test.event', {});

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
    });

    it('should log errors to console by default', async () => {
      bus.on('test.event', () => {
        throw new Error('Test error');
      });

      await bus.emit('test.event', {});

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('test.event');
    });
  });

  describe('onError()', () => {
    it('should call error handler for sync errors', async () => {
      const errorHandler = jest.fn();
      bus.onError(errorHandler);

      const testError = new Error('Test error');
      bus.on('test.event', () => {
        throw testError;
      });

      await bus.emit('test.event', { data: 'test' });

      expect(errorHandler).toHaveBeenCalledWith(
        testError,
        'test.event',
        { data: 'test' }
      );
    });

    it('should call error handler for async errors', async () => {
      const errorHandler = jest.fn();
      bus.onError(errorHandler);

      const testError = new Error('Async test error');
      bus.on('test.event', async () => {
        throw testError;
      });

      await bus.emit('test.event', { data: 'test' });

      expect(errorHandler).toHaveBeenCalledWith(
        testError,
        'test.event',
        { data: 'test' }
      );
    });

    it('should call error handler for each error', async () => {
      const errorHandler = jest.fn();
      bus.onError(errorHandler);

      bus.on('test.event', () => {
        throw new Error('Error 1');
      });
      bus.on('test.event', () => {
        throw new Error('Error 2');
      });
      bus.on('test.event', () => {
        throw new Error('Error 3');
      });

      await bus.emit('test.event', {});

      expect(errorHandler).toHaveBeenCalledTimes(3);
    });

    it('should not call console.error when error handler is set', async () => {
      bus.onError(jest.fn());

      bus.on('test.event', () => {
        throw new Error('Test error');
      });

      await bus.emit('test.event', {});

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should log to console if error handler itself throws', async () => {
      bus.onError(() => {
        throw new Error('Error handler error');
      });

      bus.on('test.event', () => {
        throw new Error('Original error');
      });

      await bus.emit('test.event', {});

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Error in error handler');
    });
  });

  describe('error handling with wildcards', () => {
    it('should handle errors in wildcard handlers', async () => {
      const errorHandler = jest.fn();
      bus.onError(errorHandler);

      const testError = new Error('Wildcard error');
      bus.on('tool.*', () => {
        throw testError;
      });

      await bus.emit('tool.before', { toolName: 'test', params: {}, runId: '1' });

      expect(errorHandler).toHaveBeenCalledWith(
        testError,
        'tool.before',
        { toolName: 'test', params: {}, runId: '1' }
      );
    });
  });

  describe('error handling with once', () => {
    it('should remove once handler even if it throws', async () => {
      const handler = jest.fn(() => {
        throw new Error('Once error');
      });

      bus.once('test.event', handler);

      expect(bus.listenerCount('test.event')).toBe(1);
      await bus.emit('test.event', {});
      expect(bus.listenerCount('test.event')).toBe(0);

      // Emit again to verify it was removed
      await bus.emit('test.event', {});
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('emitSync errors', () => {
    it('should handle sync errors in emitSync', () => {
      const errorHandler = jest.fn();
      bus.onError(errorHandler);

      bus.on('test.event', () => {
        throw new Error('Sync error');
      });

      expect(() => {
        bus.emitSync('test.event', {});
      }).not.toThrow();

      expect(errorHandler).toHaveBeenCalled();
    });
  });
});
