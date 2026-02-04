/**
 * CDP Client Tests
 */

import { CDPClient } from '../cdp-client';
import WebSocket from 'ws';

describe('CDPClient', () => {
  let mockServer: WebSocket.Server;
  let serverPort: number;

  beforeAll((done) => {
    // Create mock WebSocket server
    mockServer = new WebSocket.Server({ port: 0 }, () => {
      serverPort = (mockServer.address() as any).port;
      done();
    });
  });

  afterAll((done) => {
    mockServer.close(done);
  });

  afterEach(() => {
    // Clean up all connections
    mockServer.clients.forEach(client => client.close());
  });

  describe('Connection', () => {
    it('should connect successfully', async () => {
      const client = new CDPClient({
        url: `ws://localhost:${serverPort}`
      });

      const connectPromise = client.connect();
      
      await expect(connectPromise).resolves.toBeUndefined();
      expect(client.isConnected()).toBe(true);
      
      await client.disconnect();
    });

    it('should emit connected event', async () => {
      const client = new CDPClient({
        url: `ws://localhost:${serverPort}`
      });

      const connectedSpy = jest.fn();
      client.on('connected', connectedSpy);

      await client.connect();
      expect(connectedSpy).toHaveBeenCalledTimes(1);
      
      await client.disconnect();
    });

    it('should handle connection timeout', async () => {
      const client = new CDPClient({
        url: 'ws://localhost:9999', // Non-existent server
        timeout: 100
      });

      await expect(client.connect()).rejects.toThrow('Connection timeout');
    });

    it('should disconnect cleanly', async () => {
      const client = new CDPClient({
        url: `ws://localhost:${serverPort}`
      });

      await client.connect();
      expect(client.isConnected()).toBe(true);

      const disconnectedSpy = jest.fn();
      client.on('disconnected', disconnectedSpy);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
      expect(disconnectedSpy).toHaveBeenCalled();
    });
  });

  describe('Command execution', () => {
    it('should send command and receive response', async () => {
      mockServer.on('connection', (ws) => {
        ws.on('message', (data) => {
          const request = JSON.parse(data.toString());
          ws.send(JSON.stringify({
            id: request.id,
            result: { success: true }
          }));
        });
      });

      const client = new CDPClient({
        url: `ws://localhost:${serverPort}`
      });

      await client.connect();
      
      const result = await client.send('Page.navigate', { url: 'https://example.com' });
      expect(result).toEqual({ success: true });
      
      await client.disconnect();
    });

    it('should handle CDP error response', async () => {
      mockServer.on('connection', (ws) => {
        ws.on('message', (data) => {
          const request = JSON.parse(data.toString());
          ws.send(JSON.stringify({
            id: request.id,
            error: {
              code: -32602,
              message: 'Invalid params'
            }
          }));
        });
      });

      const client = new CDPClient({
        url: `ws://localhost:${serverPort}`
      });

      await client.connect();
      
      await expect(
        client.send('Invalid.method', { bad: 'params' })
      ).rejects.toThrow('Invalid params');
      
      await client.disconnect();
    });

    it('should handle request timeout', async () => {
      mockServer.on('connection', (ws) => {
        ws.on('message', () => {
          // Don't send response - will timeout
        });
      });

      const client = new CDPClient({
        url: `ws://localhost:${serverPort}`,
        timeout: 100
      });

      await client.connect();
      
      await expect(
        client.send('Page.navigate', { url: 'https://example.com' })
      ).rejects.toThrow('Request timeout');
      
      await client.disconnect();
    });

    it('should reject pending requests on disconnect', async () => {
      mockServer.on('connection', (ws) => {
        ws.on('message', () => {
          // Don't send response
        });
      });

      const client = new CDPClient({
        url: `ws://localhost:${serverPort}`
      });

      await client.connect();
      
      const requestPromise = client.send('Page.navigate', { url: 'https://example.com' });
      
      await client.disconnect();
      
      await expect(requestPromise).rejects.toThrow('Client disconnected');
    });

    it('should fail to send when not connected', async () => {
      const client = new CDPClient({
        url: `ws://localhost:${serverPort}`
      });

      await expect(
        client.send('Page.navigate')
      ).rejects.toThrow('not connected');
    });
  });

  describe('Event handling', () => {
    it('should receive and emit CDP events', async () => {
      let clientWs: WebSocket | null = null;
      
      mockServer.on('connection', (ws) => {
        clientWs = ws;
      });

      const client = new CDPClient({
        url: `ws://localhost:${serverPort}`
      });

      await client.connect();

      const eventSpy = jest.fn();
      client.on('event', eventSpy);

      // Send event from server
      clientWs!.send(JSON.stringify({
        method: 'Page.loadEventFired',
        params: { timestamp: 123456 }
      }));

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(eventSpy).toHaveBeenCalledWith({
        method: 'Page.loadEventFired',
        params: { timestamp: 123456 }
      });

      await client.disconnect();
    });

    it('should subscribe to specific events', async () => {
      let clientWs: WebSocket | null = null;
      
      mockServer.on('connection', (ws) => {
        clientWs = ws;
      });

      const client = new CDPClient({
        url: `ws://localhost:${serverPort}`
      });

      await client.connect();

      const loadEventSpy = jest.fn();
      const unsubscribe = client.onEvent('Page.loadEventFired', loadEventSpy);

      // Send matching event
      clientWs!.send(JSON.stringify({
        method: 'Page.loadEventFired',
        params: { timestamp: 123456 }
      }));

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(loadEventSpy).toHaveBeenCalledWith({ timestamp: 123456 }, undefined);

      // Unsubscribe
      unsubscribe();

      // Send another event
      clientWs!.send(JSON.stringify({
        method: 'Page.loadEventFired',
        params: { timestamp: 789012 }
      }));

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(loadEventSpy).toHaveBeenCalledTimes(1); // Should not be called again

      await client.disconnect();
    });
  });

  describe('Reconnection', () => {
    it('should reconnect automatically when enabled', async () => {
      let connectionCount = 0;
      
      mockServer.on('connection', (ws) => {
        connectionCount++;
        if (connectionCount === 1) {
          // Close first connection after 50ms
          setTimeout(() => ws.close(), 50);
        }
      });

      const client = new CDPClient({
        url: `ws://localhost:${serverPort}`,
        autoReconnect: true,
        reconnectDelay: 100,
        maxReconnectAttempts: 3
      });

      const reconnectingSpy = jest.fn();
      const reconnectedSpy = jest.fn();
      
      client.on('reconnecting', reconnectingSpy);
      client.on('reconnected', reconnectedSpy);

      await client.connect();
      expect(connectionCount).toBe(1);

      // Wait for reconnection
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(reconnectingSpy).toHaveBeenCalled();
      expect(reconnectedSpy).toHaveBeenCalled();
      expect(connectionCount).toBe(2);
      expect(client.isConnected()).toBe(true);

      await client.disconnect();
    });

    it('should not reconnect when manually disconnected', async () => {
      let connectionCount = 0;
      
      mockServer.on('connection', () => {
        connectionCount++;
      });

      const client = new CDPClient({
        url: `ws://localhost:${serverPort}`,
        autoReconnect: true,
        reconnectDelay: 100
      });

      await client.connect();
      expect(connectionCount).toBe(1);

      await client.disconnect();

      // Wait to ensure no reconnection
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(connectionCount).toBe(1); // Should still be 1
    });
  });

  describe('State management', () => {
    it('should return correct connection state', async () => {
      const client = new CDPClient({
        url: `ws://localhost:${serverPort}`
      });

      let state = client.getState();
      expect(state.connected).toBe(false);
      expect(state.reconnecting).toBe(false);
      expect(state.reconnectAttempts).toBe(0);
      expect(state.pendingRequests).toBe(0);

      await client.connect();

      state = client.getState();
      expect(state.connected).toBe(true);

      await client.disconnect();

      state = client.getState();
      expect(state.connected).toBe(false);
    });
  });
});
